"""
Reflection map for scripts/orbit_c4d.py: a dark studio with cool and warm
softboxes, 2048x1024, made here so it can be previewed before Cinema 4D sees it.

    python scripts/orbit_textures.py scripts/orbit_tex

  orbit_env.jpg   near-black room, hard white softboxes, violet and amber
                  ribbons low on the horizon. Wraps left to right, no seam.

Same idea as molten_textures.py: the look lives in the image, and the C4D
script only builds shapes and moves them.
"""
import sys

import numpy as np
from PIL import Image
from scipy.ndimage import map_coordinates

OUT = sys.argv[1] if len(sys.argv) > 1 else "scripts/orbit_tex"
H, W = 1024, 2048

DEEP = np.array((0.05, 0.03, 0.14))
VIOLET = np.array((0.46, 0.28, 1.00))
AMBER = np.array((1.00, 0.62, 0.18))
WHITE = np.array((0.97, 0.98, 1.00))


def field(corr_y, corr_x, seed):
    """Smooth random field that wraps on both edges, unit variance."""
    g = np.random.default_rng(seed)
    f = np.fft.fft2(g.standard_normal((H, W)))
    fy = np.fft.fftfreq(H)[:, None]
    fx = np.fft.fftfreq(W)[None, :]
    f = np.real(np.fft.ifft2(f * np.exp(-(fy * corr_y) ** 2 - (fx * corr_x) ** 2)))
    return (f - f.mean()) / f.std()


def warp(src, dy, dx):
    y, x = np.mgrid[0:H, 0:W].astype(np.float64)
    return map_coordinates(src, [y + dy, x + dx], order=1, mode="grid-wrap")


def softbox(lat, lon, lat0, lon0, half_h, half_w, edge):
    dl = (lon - lon0 + np.pi) % (2 * np.pi) - np.pi
    inside_y = 1.0 - np.clip((np.abs(lat - lat0) - half_h) / edge, 0, 1)
    inside_x = 1.0 - np.clip((np.abs(dl) - half_w) / edge, 0, 1)
    return inside_y * inside_x


v = (np.arange(H)[:, None] + 0.5) / H
u = (np.arange(W)[None, :] + 0.5) / W
lat = np.broadcast_to((0.5 - v) * np.pi, (H, W))
lon = np.broadcast_to(u * 2 * np.pi, (H, W))

w1, w2 = field(380, 300, 31), field(380, 300, 32)
flow = warp(field(240, 140, 33), 24 * w1, 70 * w2)

ph = (v * 3.0 + 0.22 * flow) * np.pi
ribbon = np.abs(np.cos(ph)) ** 12
horizon = np.exp(-((lat - 0.04 + 0.03 * flow) / 0.05) ** 2)

boxes = np.zeros((H, W))
for lat0, lon0, hh, hw in [(0.70, 0.9, 0.11, 0.50), (0.95, 3.2, 0.18, 0.28),
                           (0.45, 4.6, 0.09, 0.70), (1.12, 5.7, 0.20, 0.36)]:
    boxes = np.maximum(boxes, softbox(lat, lon, lat0, lon0, hh, hw, 0.014))

warm = np.clip(np.cos(lon - 2.0) * 0.5 + 0.5, 0, 1)[..., None]
tint = VIOLET * (1.0 - warm) + AMBER * warm
rgb = DEEP[None, None, :] * (0.4 + 0.6 * np.clip(lat, 0, 1))[..., None]
rgb = rgb + tint * (0.55 * ribbon + 0.8 * horizon)[..., None]
rgb = rgb * (1.0 - boxes)[..., None] + WHITE * boxes[..., None]
rgb *= (1.0 - 0.75 * np.clip(-lat / (np.pi / 2), 0, 1) ** 0.6)[..., None]
Image.fromarray((np.clip(rgb, 0, 1) * 255 + 0.5).astype(np.uint8), "RGB").save(
    f"{OUT}/orbit_env.jpg", quality=93)
print("ok")
