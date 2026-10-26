"""Bake the animated Ghost's face layers from Chris's art (2026-10-25).

    python scripts/ghost-face/bake.py scripts/ghost-face/source.png src/assets/ghost-face

The art is one flat picture. To make a face that moves, this pulls it apart:

  base.webp    the whole Ghost, with the eyes and brows lifted off (the grin is still there)
  eyeL / eyeR  the two eyes, as ink on a clear background, so they can look around and blink
  browL / browR
  mouth1..3    opaque patches that sit over the grin: a little open, open, and shouting.
               The closed mouth is just the grin already in the base.
  layout.js    where each layer sits, as shares of the square, for GhostFace.jsx

The mouth shapes are drawn here (same black line, white teeth, pink tongue) on top of
the grin painted out, using the poses in the video he sent as the reference.
"""
import json
import math
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage as ndi
from scipy.interpolate import CubicSpline

from cutout import cutout

SRC, OUT = sys.argv[1], sys.argv[2]
SIDE = 1650                 # the square the Ghost is framed in, in source pixels
CX0, CY0 = 150, 366         # its top-left corner in the source
SIZE = 512                  # layer resolution: 3x a 130px ghost on a phone
K = SIZE / SIDE
SS = 3                      # supersampling for the drawn mouths

src = Image.open(SRC).convert('RGB')
rgb = np.asarray(src).astype(np.float32)
lum = rgb @ np.array([0.299, 0.587, 0.114], dtype=np.float32)
CREAM = np.array([241, 231, 208], dtype=np.float32)
CREAM_LUM = float(CREAM @ np.array([0.299, 0.587, 0.114]))
INK = (17, 14, 16)


# ---------------------------------------------------------------- helpers
def inpaint(img, mask, box):
    """Paint `mask` out of `img` (float RGB) by smoothing in from its edge. Works inside `box`."""
    x0, y0, x1, y1 = box
    sub = img[y0:y1, x0:x1].copy()
    m = mask[y0:y1, x0:x1]
    ring = ndi.binary_dilation(m, iterations=8) & ~m
    sub[m] = sub[ring].mean(axis=0)
    # coarse then fine, so the fill is smooth across a few hundred pixels
    for scale, iters in ((8, 500), (2, 250), (1, 120)):
        h, w = sub.shape[:2]
        if scale > 1:
            small = np.asarray(Image.fromarray(sub.astype(np.uint8)).resize((w // scale, h // scale), Image.BILINEAR)).astype(np.float32)
            ms = np.asarray(Image.fromarray((m * 255).astype(np.uint8)).resize((w // scale, h // scale), Image.NEAREST)) > 127
            ms = ndi.binary_dilation(ms, iterations=1)
            for _ in range(iters):
                avg = (np.roll(small, 1, 0) + np.roll(small, -1, 0) + np.roll(small, 1, 1) + np.roll(small, -1, 1)) / 4
                small[ms] = avg[ms]
            up = np.asarray(Image.fromarray(np.clip(small, 0, 255).astype(np.uint8)).resize((w, h), Image.BICUBIC)).astype(np.float32)
            sub[m] = up[m]
        else:
            for _ in range(iters):
                avg = (np.roll(sub, 1, 0) + np.roll(sub, -1, 0) + np.roll(sub, 1, 1) + np.roll(sub, -1, 1)) / 4
                sub[m] = avg[m]
    out = img.copy()
    out[y0:y1, x0:x1] = sub
    return out


def ink_alpha(box, lo=25.0):
    """How black each pixel in the box is, against the cream it sits on."""
    x0, y0, x1, y1 = box
    a = np.clip((CREAM_LUM - lum[y0:y1, x0:x1]) / (CREAM_LUM - lo), 0, 1)
    return a


def rel(x, y):
    return (x - CX0) / SIDE, (y - CY0) / SIDE


def to_layer(arr_rgba, box):
    """Source-pixel RGBA crop -> layer image at SIZE scale."""
    x0, y0, x1, y1 = box
    w, h = max(1, round((x1 - x0) * K)), max(1, round((y1 - y0) * K))
    return Image.fromarray(arr_rgba, 'RGBA').resize((w, h), Image.LANCZOS)


layout = {}

# ---------------------------------------------------------------- the whole Ghost, framed
rgba = cutout(rgb)
alpha_full = rgba[..., 3]
ys, xs = np.where(alpha_full > 12)
foot_y = ys.max()
foot_x = int(xs[ys >= foot_y - 6].mean())
layout['tip'] = [round((foot_x - CX0) / SIDE, 4), round((foot_y - CY0) / SIDE, 4)]

# ---------------------------------------------------------------- eyes and brows: ink layers
EYES = {
    'eyeL': (708, 770, 912, 944),
    'eyeR': (940, 696, 1190, 872),   # stops above the grin's curl
    'browL': (742, 700, 856, 784),
    'browR': (1000, 612, 1180, 722),
}
work = rgb.copy()
for name, box in EYES.items():
    x0, y0, x1, y1 = box
    a = ink_alpha(box)
    a = np.where(a < 0.06, 0, a)
    layer = np.zeros((y1 - y0, x1 - x0, 4), dtype=np.uint8)
    layer[..., 0], layer[..., 1], layer[..., 2] = INK
    layer[..., 3] = (a * 255).astype(np.uint8)
    to_layer(layer, box).save(f'{OUT}/{name}.webp', lossless=True, quality=100, method=6)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    layout[name] = {'box': [*rel(x0, y0), (x1 - x0) / SIDE, (y1 - y0) / SIDE], 'centre': list(rel(cx, cy))}
    mask = np.zeros(lum.shape, bool)
    mask[y0:y1, x0:x1] = ndi.binary_dilation(a > 0.04, iterations=7)
    pad = (x0 - 12, y0 - 12, x1 + 12, y1 + 12)
    work = inpaint(work, mask, pad)

# ---------------------------------------------------------------- the mouth
A, B = np.array([815.0, 1012.0]), np.array([1215.0, 887.0])     # the grin's two corners
M = (A + B) / 2
e = (B - A) / np.linalg.norm(B - A)
n = np.array([-e[1], e[0]])
if n[1] < 0:
    n = -n
half = float(np.linalg.norm(B - A) / 2)                           # 209


def spline(pts):
    pts = sorted(pts)
    return CubicSpline([p[0] for p in pts], [p[1] for p in pts], bc_type='natural')


# Measured off the grin: the top lip's centre line, and the lower lip's, in the face's own frame.
TOP = spline([(-209, 0), (-194, 18), (-179, 36), (-163, 52), (-146, 60), (-123, 61), (-104, 64), (-85, 69), (-65, 73.5),
              (-45, 75.6), (-24, 76), (-2.5, 75), (19, 73.5), (41, 71), (63, 65), (87, 58), (111, 48), (140, 36), (170, 18), (209, 0)])
BOT = spline([(-209, 0), (-190, 30), (-165, 62), (-134, 93), (-117, 105), (-99, 115), (-80, 122), (-61, 128), (-41, 131),
              (-20, 132), (1, 131), (23, 128), (45, 123), (69, 113), (94, 100), (120, 80), (150, 54), (180, 28), (209, 0)])

# jaw drop D, how far the corners pull in K_, the teeth band T, and how much tongue shows
STATES = {
    'mouth1': dict(D=14, Kc=0.97, T=26, tongue=0.0),
    'mouth2': dict(D=40, Kc=0.86, T=21, tongue=0.5),
    'mouth3': dict(D=76, Kc=0.66, T=19, tongue=0.62),
}
MB = (780, 840, 1270, 1135)             # the patch that covers the grin
PINK, PINK_DARK = (234, 110, 134), (176, 58, 88)
TEETH = (250, 247, 236)


def glob(u, v):
    p = M + u * e + v * n
    return p[0], p[1]


def build_mouth(st):
    x0, y0, x1, y1 = MB
    W, H = (x1 - x0) * SS, (y1 - y0) * SS
    S = lambda x, y: ((x - x0) * SS, (y - y0) * SS)

    def poly(draw, pts, fill):
        draw.polygon([S(*p) for p in pts], fill=fill)

    kc, D = st['Kc'], st['D']
    uc = -10.0                                           # the mouth narrows toward here
    us = np.linspace(-half * kc, half * kc, 160)         # in the shrunk frame; u_real = uc + (u - uc) * ...
    # curves over the shrunk width: sample the original curves at the stretched positions
    ureal = uc + (us - uc) / kc
    ureal = np.clip(ureal, -half, half)
    top = TOP(ureal)
    jaw = D * (1 - (us / (half * kc)) ** 2) ** 0.9
    bot = BOT(ureal) * (1 if kc > 0.9 else 0.92) + jaw

    def wid(u, base=25.0):
        return np.maximum(5.0, base * (1 - (np.abs(u) / (half * kc)) ** 5))

    img = Image.new('RGB', (W, H), (0, 0, 0))
    d = ImageDraw.Draw(img)
    # inside of the mouth, top lip to bottom lip
    wv = wid(us)
    upv = top + wv / 2 - 2
    lov = np.maximum(bot - wv / 2 + 2, upv + 0.5)         # never inside out near the corners
    up = [glob(u, v) for u, v in zip(us, upv)]
    lo = [glob(u, v) for u, v in zip(us, lov)]
    poly(d, up + lo[::-1], (23, 16, 20))
    # tongue, in the lower part
    if st['tongue'] > 0:
        tl = st['tongue']
        ut = us[(us > -half * kc * 0.55) & (us < half * kc * 0.55)]
        tb = np.interp(ut, us, bot) - np.interp(ut, us, np.full_like(us, 0)) - 5
        tt = tb - 62 * tl * (1 - (ut / (half * kc * 0.58)) ** 2) ** 0.8
        tongue_up = [glob(u, v) for u, v in zip(ut, tt)]
        tongue_lo = [glob(u, v) for u, v in zip(ut[::-1], tb[::-1])]
        # clip to the mouth by drawing it on its own and keeping only what is inside
        layer = Image.new('L', (W, H), 0)
        ld = ImageDraw.Draw(layer)
        ld.polygon([S(*p) for p in tongue_up + tongue_lo], fill=255)
        mask = Image.new('L', (W, H), 0)
        ImageDraw.Draw(mask).polygon([S(*p) for p in up + lo[::-1]], fill=255)
        clipped = Image.fromarray(np.minimum(np.asarray(layer), np.asarray(mask)))
        img.paste(PINK_DARK, mask=clipped)
        inner = clipped.filter(ImageFilter.MinFilter(2 * SS * 3 + 1))
        img.paste(PINK, mask=inner)
    # teeth: a band hanging from the top lip
    tband = st['T'] * np.clip(1 - (np.abs(us) / (half * kc * 0.88)) ** 3, 0, 1)
    tooth_up = [glob(u, t + wid(u) / 2 - 2) for u, t in zip(us, top)]
    tooth_lo = [glob(u, t + wid(u) / 2 + tb_) for u, t, tb_ in zip(us, top, tband)]
    mask = Image.new('L', (W, H), 0)
    ImageDraw.Draw(mask).polygon([S(*p) for p in up + lo[::-1]], fill=255)
    layer = Image.new('L', (W, H), 0)
    ImageDraw.Draw(layer).polygon([S(*p) for p in tooth_up + tooth_lo[::-1]], fill=255)
    img.paste(TEETH, mask=Image.fromarray(np.minimum(np.asarray(layer), np.asarray(mask))))
    # the two lip strokes, drawn as bands with rounded ends
    for centre in (top, bot):
        a_ = [glob(u, c - wid(u) / 2) for u, c in zip(us, centre)]
        b_ = [glob(u, c + wid(u) / 2) for u, c in zip(us, centre)]
        poly(d, a_ + b_[::-1], INK)
    return img.resize((x1 - x0, y1 - y0), Image.LANCZOS)


# the grin painted out of the face, then each mouth drawn over it
gx0, gy0, gx1, gy1 = 800, 860, 1250, 1120
dark = lum[gy0:gy1, gx0:gx1] < 150
mouth_mask = np.zeros(lum.shape, bool)
grin = ndi.binary_fill_holes(ndi.binary_closing(ndi.binary_dilation(dark, iterations=6), iterations=10))
mouth_mask[gy0:gy1, gx0:gx1] = ndi.binary_dilation(grin, iterations=10)
no_mouth = inpaint(work, mouth_mask, (MB[0] - 10, MB[1] - 10, MB[2] + 10, MB[3] + 10))

feather = Image.new('L', (MB[2] - MB[0], MB[3] - MB[1]), 0)
fa = np.zeros((MB[3] - MB[1], MB[2] - MB[0]), np.float32)
fa[14:-14, 14:-14] = 1
fa = ndi.gaussian_filter(fa, 5)
feather = fa
for name, st in STATES.items():
    base_patch = Image.fromarray(np.clip(no_mouth[MB[1]:MB[3], MB[0]:MB[2]], 0, 255).astype(np.uint8))
    drawn = build_mouth(st)
    # drawn mouths sit on black; keep only their non-black pixels over the painted-out face
    d_arr = np.asarray(drawn).astype(np.float32)
    covered = np.asarray(base_patch).astype(np.float32)
    is_ink = (d_arr.sum(axis=2) > 8)
    cover = ndi.gaussian_filter(is_ink.astype(np.float32), 0.8)[..., None]
    comp = covered * (1 - cover) + d_arr * cover
    patch = np.dstack([comp, feather * 255]).astype(np.uint8)
    to_layer(patch, MB).save(f'{OUT}/{name}.webp', quality=92, method=6)
layout['mouth'] = {'box': [*rel(MB[0], MB[1]), (MB[2] - MB[0]) / SIDE, (MB[3] - MB[1]) / SIDE], 'states': list(STATES)}

# ---------------------------------------------------------------- the base: eyes lifted off, mouth kept
colour = np.where(alpha_full[..., None] < 250, rgba[..., :3].astype(np.float32), np.clip(work, 0, 255))
full = np.dstack([colour, alpha_full.astype(np.float32)]).astype(np.uint8)
frame = Image.fromarray(full, 'RGBA').crop((CX0, CY0, CX0 + SIDE, CY0 + SIDE)).resize((SIZE, SIZE), Image.LANCZOS)
frame.save(f'{OUT}/base.webp', quality=92, method=6)

with open(f'{OUT}/layout.js', 'w') as f:
    f.write('// Written by scripts/ghost-face/bake.py. Do not edit by hand.\n')
    f.write('// Every box is [x, y, w, h] as a share of the square the Ghost is framed in.\n')
    f.write('export const FACE = ' + json.dumps(layout, indent=2) + ';\n')
print(json.dumps(layout, indent=1))
