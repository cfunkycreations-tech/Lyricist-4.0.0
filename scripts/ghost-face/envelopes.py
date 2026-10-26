"""How wide the Ghost's mouth is, at every moment of every spoken line.

    python scripts/ghost-face/envelopes.py

Reads each baked clip in src/assets/ghost-vo-phone and src/assets/ghost-vo, and
writes src/assets/ghost-face/mouth-phone.json and mouth-desktop.json:

    { "_fps": 25, "analyzer-3": "0011223320...", ... }

One digit per 40 ms of the clip: 0 closed, 1 a little open, 2 open, 3 shouting.
The face reads the playing <audio>'s currentTime and looks the digit up, so it
never touches the audio graph (on iPhone, routing an <audio> element through Web
Audio can silence it). Re-run this after re-baking any clip.
"""
import json
import pathlib
import subprocess

import numpy as np

ROOT = pathlib.Path(__file__).resolve().parents[2]
FPS = 25
RATE = 16000
HOP = RATE // FPS


def decode(path):
    out = subprocess.run(
        ['ffmpeg', '-v', 'error', '-i', str(path), '-ac', '1', '-ar', str(RATE), '-f', 'f32le', '-'],
        capture_output=True, check=True,
    ).stdout
    return np.frombuffer(out, dtype=np.float32)


def digits(x):
    n = len(x) // HOP + 1
    pad = np.pad(x, (0, n * HOP - len(x)))
    # a 2-hop window so a syllable's edges are not chopped
    frames = pad.reshape(n, HOP)
    rms = np.sqrt((frames ** 2).mean(axis=1))
    rms = np.maximum(rms, np.convolve(np.pad(rms, 1, mode='edge'), np.ones(3) / 3, mode='valid') * 0.9)
    voiced = rms[rms > rms.max() * 0.06]
    if len(voiced) == 0:
        return '0' * n
    ref = np.percentile(voiced, 88)
    a = rms / ref
    lvl = np.zeros(n, dtype=int)
    lvl[a >= 0.12] = 1
    lvl[a >= 0.45] = 2
    lvl[a >= 0.90] = 3
    # a single stray frame is noise, not a syllable
    for i in range(1, n - 1):
        if lvl[i] != lvl[i - 1] and lvl[i - 1] == lvl[i + 1]:
            lvl[i] = lvl[i - 1]
    return ''.join(str(v) for v in lvl)


for name, folder, strip in (('phone', 'ghost-vo-phone', False), ('desktop', 'ghost-vo', False)):
    src = ROOT / 'src' / 'assets' / folder
    out = {'_fps': FPS}
    for mp3 in sorted(src.glob('*.mp3')):
        out[mp3.stem] = digits(decode(mp3))
    dest = ROOT / 'src' / 'assets' / 'ghost-face' / f'mouth-{name}.json'
    dest.write_text(json.dumps(out, separators=(',', ':')))
    total = sum(len(v) for k, v in out.items() if k != '_fps')
    print(f'{name}: {len(out) - 1} clips, {total} frames, {dest.stat().st_size / 1024:.1f} KB')
