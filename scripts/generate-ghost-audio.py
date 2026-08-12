#!/usr/bin/env python3
r"""Bake the Ghost Demo voice — Lyricist 4.2.0.

    python scripts/generate-ghost-audio.py            # bake every line
    python scripts/generate-ghost-audio.py --qa       # bake, then transcribe each
                                                      #   clip back and report word error
    python scripts/generate-ghost-audio.py --tab quantum
    python scripts/generate-ghost-audio.py --depth 3_demon

VOICE: am_adam at 92 Hz — Chris picked the voice on 2026-08-12, then picked this
depth ("clear_middle") after the first bake came out unintelligible.

DEPTH IS DECIDED BY WORD ERROR RATE, NOT BY HOW GHOSTLY IT SOUNDS.
The first attempt shipped at 68 Hz with chorus and heavy echo. Chris and a friend
sat down to listen and could not understand a word of it. Transcribing it back
scored **100% word error** — the recogniser heard "Step right, step left, step
right, step left" for "Step three. Spotlight is on. Click any tile to pour heat
into it." Not one correct word. Two things caused it:

  * CHORUS. It is a detuned copy of the signal mixed over itself, which smears
    the consonant transients that carry intelligibility. It is gone. Do not
    reintroduce it.
  * A 6.8 kHz lowpass, which discarded the very band that separates s/t/k.
    Now 9 kHz.

The shift is still `asetrate` + `atempo` rather than a formant-preserving pitch
shift — dragging formants down with the pitch is what makes it a ghost instead of
a slow tape. It is just no longer dragged past the point of meaning anything.
Note also that below ~0.47 rate the effect SATURATES: two takes an octave apart
in setting both measured ~64 Hz. Deeper stops buying depth and only costs words.

Run --qa after ANY change here. These demos exist to teach beginners how to use
the app; a narrator nobody can understand is worse than no narrator at all.

Everything runs on this machine — Kokoro-82M (Apache-2.0) from V:\models\kokoro,
ffmpeg for the treatment. No API key, no account, no network, no per-word cost.

Output: src/assets/ghost-vo/<id>.mp3, imported through Vite by GhostDemo.jsx.
NOT public/ — assets under public/ do not resolve once the app is packaged, which
has already broken this project twice (the tab background videos in build 063 and
the header clip in 067).
"""
import argparse
import json
import os
import re
import subprocess
import sys
import tempfile

import numpy as np
import soundfile as sf

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kokoro_tts import KokoroTTS, SAMPLE_RATE  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "src", "assets", "ghost-vo")

VOICE = "am_adam"
SPEED = 0.86          # slower read; the single biggest intelligibility win, and
                      # it costs nothing because the demo waits for the audio.

# label -> (asetrate factor, atempo chain). Measured pitch and WORD ERROR RATE
# in the comment — WER is the number that decides this, not pitch.
DEPTHS = {
    "natural":     (1.000, None),                    # 124 Hz,   0% WER
    "slight":      (0.900, "atempo=1.111"),          # 113 Hz,   0% WER
    "clear_middle": (0.740, "atempo=1.351"),         #  92 Hz,   0% WER  <- SHIPPING
    "lower":       (0.680, "atempo=1.471"),          #  87 Hz,   6% WER
    "deep_ruined": (0.514, "atempo=1.945"),          #  68 Hz, 100% WER — see below
}
SHIPPING_DEPTH = "clear_middle"

# Kokoro reads almost everything correctly on its own — the Supertonic-era hacks
# are gone. Only add an entry here after synthesising and TRANSCRIBING it; never
# on a hunch. (Lesson from the wizard narration: a "fix" applied blind made the
# word error worse.)
PRONUNCIATION = [
    (r"\b4\.2\.0\b", "4, 2, 0"),
    (r"\bSteps 4\+5\b", "Steps 4 and 5"),
    (r"\bA/B\b", "A B"),
    (r"&", " and "),
    # Punctuation that is NOT a word. A slash was being read aloud as "slash"
    # ("Song Forge slash Nano Banana"), and the dashes as a pause is what a
    # reader does with them anyway.
    (r"\s*/\s*", " and "),
    (r"[—–]", ", "),
    (r"[“”]", ""),
    (r"[‘’]", "'"),
    # Belt and braces: if a mojibake em dash ever survives an encoding slip
    # again, it must never reach the synthesiser as speakable text.
    (r"â€\"|â€“|Ã¢â‚¬â€|â‚¬", ", "),
]


def normalize(text):
    out = text
    for pat, rep in PRONUNCIATION:
        out = re.sub(pat, rep, out)
    return re.sub(r"\s+", " ", out).strip()


def split_sentences(text):
    """One sentence per synth call.

    A whole paragraph handed to the model at once makes it silently DROP
    phrases — that cost a wizard card a whole clause and took a transcription
    pass to find. Sentence-at-a-time then stitched took word error from 23% to
    4% there, and the Ghost Demo lines are longer than those cards.
    """
    parts = re.split(r"(?<=[.!?])\s+", text)
    return [p.strip() for p in parts if p.strip()]


def treat(in_wav, out_mp3, depth):
    """The ghost treatment. NO CHORUS — Chris, 2026-08-12: "I don't want any
    effects on there. Maybe a slight amount of reverb... but don't put chorus on
    it."  He was right on the engineering as well as the taste: chorus is a
    detuned copy of the signal mixed back over itself, which smears exactly the
    consonant transients that carry intelligibility.

    What is left is one short slap for a bit of room, and nothing else. The high
    end stays open to 9 kHz so s/t/k survive; the earlier 6.8 kHz lowpass was
    throwing away the very frequencies that distinguish words.
    """
    rate, tempo = DEPTHS[depth]
    shift = "" if tempo is None else f"asetrate={SAMPLE_RATE}*{rate},aresample={SAMPLE_RATE},{tempo},"
    chain = (
        f"{shift}"
        "highpass=f=55,lowpass=f=9000,"
        "aecho=0.9:0.74:58:0.18,"
        "loudnorm=I=-16:TP=-1.5"
    )
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-i", in_wav, "-af", chain,
         "-codec:a", "libmp3lame", "-q:a", "4", "-ar", "44100", "-ac", "1", out_mp3],
        check=True,
    )


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--qa", action="store_true", help="transcribe each clip back and score it")
    ap.add_argument("--tab", help="only this tab id")
    ap.add_argument("--depth", default=SHIPPING_DEPTH, choices=list(DEPTHS))
    ap.add_argument("--voice", default=VOICE)
    args = ap.parse_args()

    # encoding="utf-8" is NOT optional. Without it Python decodes node's stdout
    # with the Windows code page, every em dash in the scripts arrives as
    # mojibake, and Kokoro dutifully SPEAKS it — the first bake said
    # "Settings remote pass, a circumflex euros, keys unlock the studio."
    # Caught only because --qa transcribes the clips back.
    dump = subprocess.run(
        ["node", os.path.join(ROOT, "scripts", "dump-ghost-lines.mjs")],
        capture_output=True, text=True, encoding="utf-8", check=True, cwd=ROOT,
    )
    lines = json.loads(dump.stdout)
    if args.tab:
        lines = [l for l in lines if l["tabId"] == args.tab]

    os.makedirs(OUT_DIR, exist_ok=True)
    print(f"{len(lines)} lines -> {OUT_DIR}  (voice {args.voice}, depth {args.depth})")

    tts = KokoroTTS()
    gap = np.zeros(int(0.20 * SAMPLE_RATE), dtype=np.float32)   # pause between sentences
    lead = np.zeros(int(0.12 * SAMPLE_RATE), dtype=np.float32)  # lead-in, so the
    # first consonant is never clipped by a player starting late. Build 051 shipped
    # "Quant Lab" for "Quantum Lab" because this margin was too small.

    manifest = {}
    for n, line in enumerate(lines, 1):
        sentences = [normalize(s) for s in split_sentences(line["text"])]
        wavs = tts.generate(sentences, voice=args.voice, speed=SPEED)
        joined = [lead]
        for w in wavs:
            joined.append(np.asarray(w, dtype=np.float32))
            joined.append(gap)
        audio = np.concatenate(joined)

        out_mp3 = os.path.join(OUT_DIR, f"{line['id']}.mp3")
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp_path = tmp.name
        try:
            sf.write(tmp_path, audio, SAMPLE_RATE)
            treat(tmp_path, out_mp3, args.depth)
        finally:
            os.unlink(tmp_path)

        manifest[line["id"]] = {"text": line["text"], "words": len(line["text"].split())}
        print(f"  [{n}/{len(lines)}] {line['id']}")

    with open(os.path.join(OUT_DIR, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)

    if args.qa:
        qa(lines)


def qa(lines):
    """Transcribe every clip back and report word error against the script.

    A mispronounced product name shows up as a number here instead of shipping.
    Always run this after changing a script line — the text and the voice must
    agree, and the only way to know they do is to listen with a recogniser.
    """
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        print("\n--qa needs faster-whisper:  pip install faster-whisper")
        return
    model = WhisperModel("base.en", device="cpu", compute_type="int8")
    print("\nQA — word error rate vs script")
    total = []
    for line in lines:
        path = os.path.join(OUT_DIR, f"{line['id']}.mp3")
        if not os.path.exists(path):
            continue
        segs, _ = model.transcribe(path, language="en")
        heard = " ".join(s.text for s in segs)
        a = re.findall(r"[a-z0-9']+", normalize(line["text"]).lower())
        b = re.findall(r"[a-z0-9']+", heard.lower())
        d = _levenshtein(a, b)
        wer = d / max(1, len(a))
        total.append(wer)
        flag = "  <-- CHECK" if wer > 0.25 else ""
        print(f"  {wer*100:5.1f}%  {line['id']}{flag}")
    if total:
        print(f"\n  mean {sum(total)/len(total)*100:.1f}%  "
              f"(~6% is the recogniser's own floor; a demon voice reads higher)")


def _levenshtein(a, b):
    prev = list(range(len(b) + 1))
    for i, x in enumerate(a, 1):
        cur = [i]
        for j, y in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x != y)))
        prev = cur
    return prev[-1]


if __name__ == "__main__":
    main()
