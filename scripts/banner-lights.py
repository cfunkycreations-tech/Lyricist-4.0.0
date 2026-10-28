"""Find the lights in the Austin banner pictures, for the twinkle.

    python scripts/banner-lights.py

Reads src/assets/banner/<scene>-<side>.webp and writes
src/components/BrandBanner/austin-lights.json: for each picture, the bright
spots (windows, signs, marquee bulbs, headlights, sun on water) inside the
regions below, as [x, y, size, r, g, b] with x and y as fractions of the
picture. Done here rather than in the app because reading pixels off an
image in the packaged app (file://) taints the canvas.
"""
import json, os
import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SRC = os.path.join(ROOT, 'src', 'assets', 'banner')
OUT = os.path.join(ROOT, 'src', 'components', 'BrandBanner', 'austin-lights.json')

# name: (regions as (x0, y0, x1, y1) fractions, brightness floor 0-255, max lights)
SPEC = {
    'skyline-west': ([(0.30, 0.28, 1.0, 0.64), (0.30, 0.70, 1.0, 0.98)], 200, 90),
    'skyline-east': ([(0.15, 0.28, 0.70, 0.64), (0.10, 0.70, 0.69, 0.98)], 200, 80),
    'sixth-west': ([(0.0, 0.0, 1.0, 0.80)], 215, 140),
    'sixth-east': ([(0.0, 0.25, 1.0, 0.80)], 215, 140),
    'zilker-west': ([(0.55, 0.48, 1.0, 0.62)], 215, 30),
    'zilker-east': ([(0.06, 0.52, 1.0, 1.0)], 235, 90),
    'hills-west': ([(0.38, 0.48, 0.80, 1.0)], 165, 70),
    'hills-east': ([(0.05, 0.45, 0.50, 0.68), (0.15, 0.62, 0.80, 1.0)], 170, 80),
}

out = {}
rng = np.random.default_rng(7)
for name, (regions, floor, cap) in SPEC.items():
    im = Image.open(os.path.join(SRC, name + '.webp')).convert('RGB')
    W = 600
    H = round(im.height * W / im.width)
    a = np.asarray(im.resize((W, H), Image.LANCZOS)).astype(float)
    lum = a @ [0.299, 0.587, 0.114]
    # Local maxima in a 5x5 window that clear the floor and stand out from
    # their surroundings (so a bright sky is not one big "light").
    pad = np.pad(lum, 2, mode='edge')
    win = np.stack([pad[dy:dy + H, dx:dx + W] for dy in range(5) for dx in range(5)])
    peak = (lum >= win.max(0)) & (lum >= floor) & (lum - win.mean(0) > 12)
    inside = np.zeros_like(peak)
    for x0, y0, x1, y1 in regions:
        inside[int(y0 * H):int(y1 * H), int(x0 * W):int(x1 * W)] = True
    ys, xs = np.nonzero(peak & inside)
    if len(xs) > cap:
        keep = rng.choice(len(xs), cap, replace=False)
        ys, xs = ys[keep], xs[keep]
    pts = []
    for y, x in zip(ys, xs):
        r, g, b = a[y, x]
        size = round(float((lum[y, x] - floor) / (256 - floor)) * 0.6 + 0.6, 2)
        pts.append([round(x / W, 4), round(y / H, 4), size, int(r), int(g), int(b)])
    out[name] = pts
    print(f'{name:<14} {len(pts)} lights')

json.dump(out, open(OUT, 'w'), separators=(',', ':'))
print('wrote', os.path.relpath(OUT, ROOT))
