#!/usr/bin/env python3
"""Bake the wizard narration MP3s with Supertonic TTS — Lyricist 4.2.0.

    python scripts/generate-wizard-audio.py            # bake all 17 cards
    python scripts/generate-wizard-audio.py --qa       # bake, then verify every
                                                       #   clip with speech-to-text
    python scripts/generate-wizard-audio.py --voice F4 # different narrator
    python scripts/generate-wizard-audio.py --cards 5  # just card-05

Replaces the old edge-tts / Microsoft Ava pipeline. Supertonic runs entirely on
this machine from V:\\models\\supertonic-2 — no API key, no account, no network,
no per-word cost, and it keeps working if Microsoft ever changes that endpoint.
Voices are F1-F5 (female) and M1-M5 (male).

THREE THINGS THIS SCRIPT DOES THAT YOU CANNOT SKIP
--------------------------------------------------
1. NORMALIZE THE TEXT.  Supertonic reads capitalised "Lyricist" as "Larasist"
   and "4.2.0" as "4.0". Lowercasing the name and spelling the version out loud
   fixes both. See PRONUNCIATION below — every entry there was verified by
   synthesising it and transcribing the result.

2. SYNTHESISE SENTENCE BY SENTENCE.  Handed a whole 130-word card the model
   silently DROPS phrases — "run twelve gens spreads" vanished mid-sentence.
   Per-sentence chunks stitched back together took the word error rate on
   card-05 from 23.4% to 7.3%. Never feed it a whole card.

3. CHECK THE RESULT WITH --qa.  Nobody can hear a bug report. The QA pass runs
   every clip back through speech recognition and prints the word error rate
   against the script, so a mispronounced product name shows up as a number
   instead of shipping.
"""
import argparse
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf

sys.path.insert(0, str(Path(__file__).resolve().parent))
from supertonic_tts import SupertonicTTS  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
CARDS_JS = ROOT / "src" / "components" / "Onboarding" / "wizardCards.js"
OUT_DIR = ROOT / "public" / "wizard-audio"

VOICE = "F2"      # picked on measured intelligibility, not vibes — see README.txt
SPEED = 1.05      # a touch quicker than default; matches the old Ava pacing
STEPS = 16        # denoiser steps; 5 is muddy, 16 is clean, past ~24 adds nothing
SR = 44100

GAP_SENTENCE = 0.24   # seconds of silence between sentences
GAP_PARAGRAPH = 0.5   # ...and between paragraphs

# Every substitution here was verified by synthesising it and transcribing the
# audio back. Do not add one on a hunch — test it.
PRONUNCIATION = [
    (r"\bLYRICIST\b", "lyricist"),   # capitals come out as "Larasist"
    (r"\bLyricist\b", "lyricist"),
    (r"\b4\.2\.0\b", "four point two point zero"),   # otherwise read as "4.0"
    (r"\bWAVs\b", "wave files"),     # "WAV" comes out as "WOWWOW"
    (r"\bWAV\b", "wave"),
]
# Verified correct as-is, no substitution needed: AI, DNA, EQ, FX, MIDI, RC-Funk
# 5000, State A / State B, 808, synth.


def normalize(text: str) -> str:
    for pat, rep in PRONUNCIATION:
        text = re.sub(pat, rep, text)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def extract_cards(js_text: str):
    cards = []
    parts = re.split(r"\{\s*id:\s*(\d+)", js_text)
    i = 1
    while i < len(parts) - 1:
        card_id, body = int(parts[i]), parts[i + 1]
        am = re.search(r"audio:\s*['\"](card-\d+\.mp3)['\"]", body)
        m = re.search(r"script:\s*`([\s\S]*?)`", body)
        if m:
            cards.append((card_id, am.group(1) if am else f"card-{card_id:02d}.mp3", m.group(1).strip()))
        i += 2
    return cards


def split_for_tts(text: str):
    """-> [[sentence, ...], ...] one list per paragraph."""
    paras = []
    for para in re.split(r"\n\s*\n", text):
        sents = [s.strip() for s in re.split(r"(?<=[.!?])\s+", para.strip()) if s.strip()]
        if sents:
            paras.append(sents)
    return paras


def trim(w: np.ndarray) -> np.ndarray:
    """Drop the padding the decoder leaves either side of the speech."""
    peak = float(np.max(np.abs(w)))
    if peak <= 0:
        return w
    nz = np.where(np.abs(w) > peak * 0.015)[0]
    if not len(nz):
        return w
    return w[max(0, nz[0] - int(0.02 * SR)): nz[-1] + int(0.03 * SR)]


def synthesize(tts, text, voice=VOICE, speed=SPEED):
    paras = split_for_tts(text)
    flat = [s for p in paras for s in p]
    waves = [trim(w) for w in tts.generate(flat, voice=voice, speed=speed, steps=STEPS, seed=42)]
    pieces, k = [], 0
    for para in paras:
        for _ in para:
            pieces.append(waves[k]); k += 1
            pieces.append(np.zeros(int(GAP_SENTENCE * SR), np.float32))
        pieces[-1] = np.zeros(int(GAP_PARAGRAPH * SR), np.float32)
    audio = np.concatenate(pieces)
    peak = float(np.max(np.abs(audio)))
    if peak > 0:
        audio = audio * (0.89 / peak)   # -1 dBFS; raw output sits around -12
    return audio.astype(np.float32)


def to_mp3(audio, out_path: Path):
    with tempfile.TemporaryDirectory() as td:
        wav = Path(td) / "clip.wav"
        sf.write(str(wav), audio, SR)
        cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(wav),
               # loudnorm to broadcast speech level so no card is quieter than another
               "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
               "-ac", "1", "-ar", "44100", "-b:a", "96k", str(out_path)]
        subprocess.run(cmd, check=True)


def qa(paths_and_text):
    """Transcribe each clip and report word error rate against its script."""
    from faster_whisper import WhisperModel
    NUM = {"zero": "0", "one": "1", "two": "2", "three": "3", "four": "4", "five": "5",
           "six": "6", "seven": "7", "eight": "8", "nine": "9", "ten": "10",
           "eleven": "11", "twelve": "12"}
    def toks(s):
        return [NUM.get(w, w) for w in re.sub(r"[^a-z0-9 ]", " ", s.lower()).split()]
    def wer(ref, hyp):
        R, H = toks(ref), toks(hyp)
        d = np.zeros((len(R) + 1, len(H) + 1), int)
        d[:, 0] = np.arange(len(R) + 1); d[0, :] = np.arange(len(H) + 1)
        for i in range(1, len(R) + 1):
            for j in range(1, len(H) + 1):
                d[i, j] = min(d[i - 1, j] + 1, d[i, j - 1] + 1, d[i - 1, j - 1] + (R[i - 1] != H[j - 1]))
        return d[len(R), len(H)] / max(1, len(R)) * 100

    print("\nQA — transcribing every clip back to text:")
    model = WhisperModel("small.en", device="cpu", compute_type="int8")
    scores = []
    for path, text in paths_and_text:
        segs, _ = model.transcribe(str(path), beam_size=5)
        hyp = " ".join(s.text for s in segs)
        e = wer(text, hyp)
        scores.append(e)
        flag = "  <-- CHECK THIS ONE" if e > 12 else ""
        print(f"  {path.name}  WER {e:5.1f}%{flag}")
    print(f"  mean WER {np.mean(scores):.1f}%  (speech recognition itself misreads "
          f"~5-8% of synthetic speech, so single digits is clean)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--voice", default=VOICE, help="F1-F5 female, M1-M5 male")
    ap.add_argument("--speed", type=float, default=SPEED)
    ap.add_argument("--cards", type=int, nargs="*", help="only these card ids")
    ap.add_argument("--qa", action="store_true", help="verify clips with speech-to-text")
    args = ap.parse_args()

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    cards = extract_cards(CARDS_JS.read_text(encoding="utf-8"))
    if args.cards:
        cards = [c for c in cards if c[0] in args.cards]
    if not cards:
        print("ERROR: no cards parsed from", CARDS_JS)
        sys.exit(1)

    print(f"Supertonic  voice={args.voice}  speed={args.speed}  steps={STEPS}")
    print(f"Writing {len(cards)} clips -> {OUT_DIR}")
    tts = SupertonicTTS()
    done = []
    for card_id, fname, script in cards:
        text = normalize(script)
        audio = synthesize(tts, text, voice=args.voice, speed=args.speed)
        out = OUT_DIR / fname
        to_mp3(audio, out)
        print(f"  OK  {fname}  {len(audio)/SR:5.1f}s  ({out.stat().st_size // 1024} KB)")
        done.append((out, text))

    if args.qa:
        qa(done)
    print("Done.")


if __name__ == "__main__":
    main()
