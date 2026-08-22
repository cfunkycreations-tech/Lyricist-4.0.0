#!/usr/bin/env python3
r"""Bake the three Ghost voice samples, the ones the picker buttons play.

    python scripts/generate-voice-samples.py
    python scripts/generate-voice-samples.py --qa    # transcribe them back

WHY THESE ARE BAKED WHEN THE REST IS LIVE.

Chris, 2026-08-22: *"I've tested the ghost voices and they do work but take a
long time to load. You should bake in the ghost, man and woman voices option but
just for the optional buttons."*

He is right about where the wait hurts. The 86 MB voice model is fetched the
first time it is used, and pressing a button labelled "Woman" and hearing
nothing for a minute reads as broken, not as loading. But an ANSWER is different:
you already know you asked a question, and you already waited for the model to
think, so a few seconds more is invisible.

So the three sample lines are pre-rendered here and ship with the app. Pressing
Ghost, Man or Woman plays instantly and always, even before the model has been
downloaded, even offline, even if the download failed. The live model is still
what reads the actual answers.

Same voices and the same treatment as the live path, so what you hear on the
button is what you get in the answers:
  ghost  am_adam    + the clear_middle shift, 92 Hz, and the two filters
  man    am_michael untreated
  woman  af_heart   untreated, and it is the wizard's narrator on purpose

Everything runs on this machine from V:\models\kokoro. No key, no account, no
network, no per-word cost.

Output: src/assets/ghost-vo/sample-<name>.mp3, imported through Vite.
"""
import argparse
import subprocess
import sys
import tempfile
from pathlib import Path

import soundfile as sf

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kokoro_tts import KokoroTTS, SAMPLE_RATE  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "src" / "assets" / "ghost-vo"

# The shipping depth from generate-ghost-audio.py. Same numbers, deliberately.
GHOST_RATE = 0.740
GHOST_TEMPO = "atempo=1.351"

SAMPLES = {
    "ghost": {
        "voice": "am_adam",
        "treat": True,
        "text": "This is me. The voice you already know.",
    },
    "man": {
        "voice": "am_michael",
        "treat": False,
        "text": "This is the man. I can read the answers out in this voice instead.",
    },
    "woman": {
        "voice": "af_heart",
        "treat": False,
        "text": "This is the woman. I can read the answers out in this voice instead.",
    },
}


def render(tts, name, spec, out_path):
    # generate() takes a list and gives back one waveform per string. The text
    # here is one short sentence pair, well under the token cap.
    audio = tts.generate([spec["text"]], voice=spec["voice"])[0]
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        wav = tmp.name
    sf.write(wav, audio, SAMPLE_RATE)

    if spec["treat"]:
        # The ghost: shift down, then the two filters, then the short slap. This
        # is the same chain generate-ghost-audio.py uses, so the sample and the
        # 102 demo clips are one voice.
        chain = (
            f"asetrate={SAMPLE_RATE}*{GHOST_RATE},aresample={SAMPLE_RATE},{GHOST_TEMPO},"
            "highpass=f=55,lowpass=f=9000,"
            "aecho=0.9:0.74:58:0.18,"
            "loudnorm=I=-16:TP=-1.5"
        )
    else:
        # Plain speech gets levelled and nothing else. The filters exist to sell
        # the ghost and only make an untreated voice sound like a telephone.
        chain = "loudnorm=I=-16:TP=-1.5"

    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-i", wav, "-af", chain,
         "-codec:a", "libmp3lame", "-q:a", "4", "-ar", "44100", "-ac", "1", str(out_path)],
        check=True,
    )
    Path(wav).unlink(missing_ok=True)
    return out_path.stat().st_size


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--qa", action="store_true", help="transcribe each one back and score it")
    args = ap.parse_args()

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    tts = KokoroTTS()

    print(f"Baking {len(SAMPLES)} voice samples -> {OUT_DIR}")
    made = {}
    for name, spec in SAMPLES.items():
        out = OUT_DIR / f"sample-{name}.mp3"
        size = render(tts, name, spec, out)
        made[name] = out
        print(f"  OK  {out.name:22s} {spec['voice']:12s} {size/1024:6.1f} KB")

    if args.qa:
        # Same rule as every other bake here: nobody can hear a bug report.
        try:
            from generate_ghost_audio import transcribe, word_error  # type: ignore
        except Exception:
            print("\nQA needs the recogniser from generate-ghost-audio.py; skipping.")
            return
        print("\nQA, transcribing each sample back:")
        for name, path in made.items():
            heard = transcribe(str(path))
            print(f"  {name:6s} WER {word_error(SAMPLES[name]['text'], heard):5.1f}%   heard: {heard[:60]}")

    print("\nDone.")


if __name__ == "__main__":
    main()
