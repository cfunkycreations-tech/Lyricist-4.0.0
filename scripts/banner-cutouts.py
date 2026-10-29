"""Cut the moving things out of the Austin banner pictures.

    python scripts/banner-cutouts.py

The kites over Zilker and the grackles on the wire are found in the picture,
painted out of it (OpenCV inpainting, so the sky closes up behind them) and
listed as boxes. The banner then draws the clean picture and puts each kite or
bird back on top from the original, swaying or bobbing.

Writes src/assets/banner/<name>-clean.webp and
src/components/BrandBanner/austin-cutouts.json: {name: [[x, y, w, h], ...]}
as fractions of the picture.
"""
import json, os
import cv2
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SRC = os.path.join(ROOT, 'src', 'assets', 'banner')
OUT = os.path.join(ROOT, 'src', 'components', 'BrandBanner', 'austin-cutouts.json')


def kites(a):
    """Bright coloured specks in the blue and white sky above the skyline."""
    hsv = cv2.cvtColor(a, cv2.COLOR_RGB2HSV).astype(float)
    h, s, v = hsv[..., 0] * 2, hsv[..., 1] / 255, hsv[..., 2] / 255
    sky_blue = (h > 185) & (h < 225)
    m = (s > 0.42) & ~sky_blue & (v > 0.25)
    m[int(a.shape[0] * 0.40):] = False  # the tree line starts just below
    return m


def grackles(a):
    """Dark birds on the wire, right of the pole; thin wire lines opened away."""
    lum = a @ [0.299, 0.587, 0.114]
    m = lum < 70
    H, W = m.shape
    keep = np.zeros_like(m)
    keep[: int(H * 0.45), int(W * 0.742): int(W * 0.985)] = True
    m &= keep
    return ndimage.binary_opening(m, np.ones((5, 5)))


SPEC = {'zilker-west': (kites, 30, 14), 'skyline-east': (grackles, 120, 10)}

out = {}
for name, (find, min_px, pad) in SPEC.items():
    im = Image.open(os.path.join(SRC, name + '.webp')).convert('RGB')
    a = np.asarray(im)
    H, W = a.shape[:2]
    m = find(a)
    lab, n = ndimage.label(ndimage.binary_dilation(m, np.ones((7, 7))))
    boxes, hole = [], np.zeros((H, W), np.uint8)
    for sl in ndimage.find_objects(lab):
        ys, xs = sl
        bh, bw = ys.stop - ys.start, xs.stop - xs.start
        if bh * bw < min_px:
            continue  # specks
        if find is kites and (bw > W * 0.07 or bh > H * 0.12 or ys.stop > H * 0.43):
            continue  # too big or too low to be a kite: the tree line
        y0, y1 = max(0, ys.start - pad), min(H, ys.stop + pad)
        x0, x1 = max(0, xs.start - pad), min(W, xs.stop + pad)
        boxes.append([round(x0 / W, 4), round(y0 / H, 4), round((x1 - x0) / W, 4), round((y1 - y0) / H, 4)])
        # Paint out the object itself plus a small rim, not the whole padded box.
        obj = lab[ys, xs] > 0
        hole[ys, xs] |= ndimage.binary_dilation(obj, np.ones((5, 5))).astype(np.uint8)
    clean = cv2.inpaint(np.ascontiguousarray(a[..., ::-1]), hole * 255, 7, cv2.INPAINT_TELEA)[..., ::-1]
    Image.fromarray(clean).save(os.path.join(SRC, name + '-clean.webp'), quality=82, method=6)
    out[name] = boxes
    print(f'{name:<14} {len(boxes)} cut out')

json.dump(out, open(OUT, 'w'), separators=(',', ':'))
print('wrote', os.path.relpath(OUT, ROOT))
