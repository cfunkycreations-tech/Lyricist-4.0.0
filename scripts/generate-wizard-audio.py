#!/usr/bin/env python3
"""Bake the wizard narration MP3s with Kokoro TTS — Lyricist 4.2.0.

    python scripts/generate-wizard-audio.py                   # bake every card
    python scripts/generate-wizard-audio.py --qa              # bake, then verify
                                                              #   each clip by ear-free
                                                              #   speech recognition
    python scripts/generate-wizard-audio.py --voice af_bella  # different narrator
    python scripts/generate-wizard-audio.py --cards 5         # just card-05
    python scripts/generate-wizard-audio.py --engine supertonic   # the old engine

Kokoro-82M (Apache-2.0) runs entirely on this machine from V:\\models\\kokoro —
no API key, no account, no network, no per-word cost. It reads more naturally
than Supertonic, which this replaced, and than the Microsoft Ava/edge-tts
pipeline before that (which needed a live call to their servers every rebuild).

Voices: af_* American female (af_heart is the default and the best of them),
am_* American male, bf_*/bm_* British. `--voice ?` lists them.

THREE THINGS THIS SCRIPT DOES THAT YOU CANNOT SKIP
--------------------------------------------------
1. NORMALIZE THE TEXT.  Only one substitution is left: "4.2.0" reads as
   "4, 2, 0" so the version is spelled out. Kokoro gets everything else right on
   its own — it says "Lyricist", "WAV", "808", "RC-Funk 5000" and "gens"
   correctly, all verified by synthesising and transcribing them. Supertonic
   needed the name lowercased or it said "Larasist"; that hack is gone with it.
   Never add an entry to PRONUNCIATION on a hunch — test it.

2. SYNTHESISE SENTENCE BY SENTENCE.  Handed a whole 130-word card, Supertonic
   silently DROPPED phrases — "run twelve gens spreads" vanished mid-sentence,
   and per-sentence chunks took card-05 from 23.4% word error to 7.3%. Kokoro is
   also hard-limited to 510 style rows, so long text has to be split regardless.
   Chunking also buys the pauses between sentences and paragraphs.

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

ROOT = Path(__file__).resolve().parents[1]
CARDS_JS = ROOT / "src" / "components" / "Onboarding" / "wizardCards.js"
OUT_DIR = ROOT / "public" / "wizard-audio"

VOICE = "af_heart"   # Kokoro's flagship voice
SPEED = 1.0
STEPS = 16           # Supertonic only — Kokoro has no denoiser loop
SR = 24000           # Kokoro's native rate; Supertonic overrides to 44100

GAP_SENTENCE = 0.24   # seconds of silence between sentences
GAP_PARAGRAPH = 0.5   # ...and between paragraphs
ENGINE = "kokoro"     # set from --engine; synthesize() branches on it

# Every substitution here was verified by synthesising it and transcribing the
# audio back. Do not add one on a hunch — test it.
PRONUNCIATION = [
    (r"\b4\.2\.0\b", "four point two point zero"),   # otherwise read as "4, 2, 0"
]
# Verified correct as-is with Kokoro, no substitution needed: Lyricist (either
# case), WAV, AI, DNA, EQ, FX, MIDI, RC-Funk 5000, State A / State B, 808, gens,
# synth. Supertonic needed the name lowercased and "WAV" spelled "wave"; those
# hacks left with it.


def normalize(text: str) -> str:
    for pat, rep in PRONUNCIATION:
        text = re.sub(pat, rep, text)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def extract_cards(js_text: str):
    cards = []
    # A card may carry `//` comment lines between its opening brace and its
    # id, and one does. Anchoring on brace-then-id skipped that card, and the
    # run died with "no cards parsed" when it was the only one selected.
    parts = re.split(r"\{(?:\s*//.*)*\s*id:\s*(\d+)", js_text)
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
    """Drop the padding the decoder leaves either side of the speech.

    Keep a generous head margin. A tight cut eats the attack of the first
    consonant — at 20 ms "Quantum Lab" was landing as "Quant Lab" — and a
    plosive that starts on sample zero clicks.
    """
    peak = float(np.max(np.abs(w)))
    if peak <= 0:
        return w
    nz = np.where(np.abs(w) > peak * 0.015)[0]
    if not len(nz):
        return w
    clip = w[max(0, nz[0] - int(0.07 * SR)): nz[-1] + int(0.06 * SR)]
    # 5 ms fades so no chunk boundary can click
    n = int(0.005 * SR)
    if len(clip) > 2 * n:
        clip = clip.copy()
        clip[:n] *= np.linspace(0, 1, n, dtype=np.float32)
        clip[-n:] *= np.linspace(1, 0, n, dtype=np.float32)
    return clip


def synthesize(tts, text, voice=VOICE, speed=SPEED):
    paras = split_for_tts(text)
    flat = [s for p in paras for s in p]
    raw = (tts.generate(flat, voice=voice, speed=speed, steps=STEPS, seed=42)
           if ENGINE == "supertonic" else tts.generate(flat, voice=voice, speed=speed))
    waves = [trim(w) for w in raw]
    pieces, k = [], 0
    for para in paras:
        for _ in para:
            pieces.append(waves[k]); k += 1
            pieces.append(np.zeros(int(GAP_SENTENCE * SR), np.float32))
        pieces[-1] = np.zeros(int(GAP_PARAGRAPH * SR), np.float32)
    # A beat of silence up front: the <audio> element and the speakers both need
    # a moment, and starting on the first phoneme sounds like a dropped word.
    pieces.insert(0, np.zeros(int(0.12 * SR), np.float32))
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
    global ENGINE, SR
    ap = argparse.ArgumentParser()
    ap.add_argument("--voice", default=None, help="af_heart, af_bella, am_michael… ('?' lists them)")
    ap.add_argument("--speed", type=float, default=SPEED)
    ap.add_argument("--cards", type=int, nargs="*", help="only these card ids")
    ap.add_argument("--qa", action="store_true", help="verify clips with speech-to-text")
    ap.add_argument("--engine", default="kokoro", choices=["kokoro", "supertonic"])
    args = ap.parse_args()

    ENGINE = args.engine
    if ENGINE == "supertonic":
        from supertonic_tts import SupertonicTTS
        tts = SupertonicTTS()
        SR = 44100
        voice = args.voice or "F2"
    else:
        from kokoro_tts import KokoroTTS, SAMPLE_RATE
        tts = KokoroTTS()
        SR = SAMPLE_RATE
        if args.voice == "?":
            print("Voices:", ", ".join(tts.voice_names()))
            return
        voice = args.voice or VOICE

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    cards = extract_cards(CARDS_JS.read_text(encoding="utf-8"))
    if args.cards:
        cards = [c for c in cards if c[0] in args.cards]
    if not cards:
        print("ERROR: no cards parsed from", CARDS_JS)
        sys.exit(1)

    print(f"{ENGINE}  voice={voice}  speed={args.speed}  {SR} Hz")
    print(f"Writing {len(cards)} clips -> {OUT_DIR}")
    done = []
    for card_id, fname, script in cards:
        text = normalize(script)
        audio = synthesize(tts, text, voice=voice, speed=args.speed)
        out = OUT_DIR / fname
        to_mp3(audio, out)
        print(f"  OK  {fname}  {len(audio)/SR:5.1f}s  ({out.stat().st_size // 1024} KB)")
        done.append((out, text))

    if args.qa:
        qa(done)
    print("Done.")


if __name__ == "__main__":
    main()
