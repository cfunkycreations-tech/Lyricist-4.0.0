#!/usr/bin/env python3
"""Bake wizard MP3s — Ava voice (app companion), Lyricist 4.2.0."""
import asyncio
import re
import sys
from pathlib import Path

try:
    import edge_tts
except ImportError:
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "edge-tts", "-q"])
    import edge_tts

# Ava — Microsoft Neural companion voice (matches the in-app tour guide)
VOICE = "en-US-AvaNeural"
RATE = "-3%"
PITCH = "+0Hz"

ROOT = Path(__file__).resolve().parents[1]
CARDS_JS = ROOT / "src" / "components" / "Onboarding" / "wizardCards.js"
OUT_DIR = ROOT / "public" / "wizard-audio"


def extract_cards(js_text: str):
    cards = []
    parts = re.split(r"\{\s*id:\s*(\d+)", js_text)
    i = 1
    while i < len(parts) - 1:
        card_id = int(parts[i])
        body = parts[i + 1]
        # Prefer explicit audio: 'card-NN.mp3' if present, else id
        am = re.search(r"audio:\s*['\"](card-\d+\.mp3)['\"]", body)
        m = re.search(r"script:\s*`([\s\S]*?)`", body)
        if m:
            fname = am.group(1) if am else f"card-{card_id:02d}.mp3"
            cards.append((card_id, fname, m.group(1).strip()))
        i += 2
    return cards


async def synth_one(label: str, text: str, out_path: Path):
    cleaned = re.sub(r"\n{2,}", "\n\n", text).strip()
    communicate = edge_tts.Communicate(cleaned, VOICE, rate=RATE, pitch=PITCH)
    await communicate.save(str(out_path))
    print(f"  OK  {out_path.name}  ({out_path.stat().st_size // 1024} KB)  [{label}]")


async def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    js = CARDS_JS.read_text(encoding="utf-8")
    cards = extract_cards(js)
    if not cards:
        print("ERROR: no cards parsed from", CARDS_JS)
        sys.exit(1)
    print(f"Voice: {VOICE}  rate={RATE}")
    print(f"Writing {len(cards)} clips → {OUT_DIR}")
    for card_id, fname, script in cards:
        out = OUT_DIR / fname
        await synth_one(f"id={card_id}", script, out)
    print("Done.")


if __name__ == "__main__":
    asyncio.run(main())
