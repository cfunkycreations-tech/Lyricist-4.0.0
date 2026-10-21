"""
Molten reflection maps for scripts/molten_c4d.py: the look of liquid metal as
2048x1024 images, made here so they can be previewed before Cinema 4D sees them.

    python scripts/molten_textures.py scripts/molten_tex

  molten_env_gold.jpg   black studio, white-hot softboxes, amber and gold
                        ribbons that bend like they are poured. Wraps left to
                        right with no seam.
  molten_env_ice.jpg    same layout in blue-white, for a cold-steel version.

Same idea as splash_textures.py: the look lives in the image, and the C4D
script only builds shapes and moves them. The upper half of the map is what a
low camera sees reflected in a flat-ish surface, so that is where the bright
ribbons and the hard softbox edges are.
"""
import sys

import numpy as np
from PIL import Image
from scipy.ndimage import map_coordinates

OUT = sys.argv[1] if len(sys.argv) > 1 else "scripts/molten_tex"
H, W = 1024, 2048

PALETTES = {
    "gold": dict(deep=(0.30, 0.07, 0.01), mid=(1.00, 0.55, 0.12),
                 hot=(1.00, 0.86, 0.50), white=(1.00, 0.97, 0.90)),
    "ice": dict(deep=(0.03, 0.10, 0.28), mid=(0.20, 0.55, 1.00),
                hot=(0.70, 0.90, 1.00), white=(0.96, 0.99, 1.00)),
}


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
    """A rectangle of light with a hard-ish edge, wrapping in longitude."""
    dl = (lon - lon0 + np.pi) % (2 * np.pi) - np.pi
    inside_y = 1.0 - np.clip((np.abs(lat - lat0) - half_h) / edge, 0, 1)
    inside_x = 1.0 - np.clip((np.abs(dl) - half_w) / edge, 0, 1)
    return inside_y * inside_x


def make(name, p):
    deep, mid, hot, white = (np.array(p[k]) for k in ("deep", "mid", "hot", "white"))
    v = (np.arange(H)[:, None] + 0.5) / H           # 0 top .. 1 bottom
    u = (np.arange(W)[None, :] + 0.5) / W
    lat = np.broadcast_to((0.5 - v) * np.pi, (H, W))  # +pi/2 straight up
    lon = np.broadcast_to(u * 2 * np.pi, (H, W))

    w1, w2 = field(380, 300, 21), field(380, 300, 22)
    flow = warp(field(240, 120, 23), 28 * w1, 90 * w2)   # poured, stretched sideways
    fine = warp(field(160, 100, 24), 16 * w2, 40 * w1)

    # Ribbons: bright bands that follow the horizon and bend with the flow.
    ph = (v * 4.0 + 0.30 * flow + 0.06 * fine) * np.pi
    ribbon = np.abs(np.cos(ph)) ** 10
    thin = np.abs(np.sin(ph * 2.3 + 1.1)) ** 24

    # Hard softboxes: what gives metal its crisp white edges.
    boxes = np.zeros((H, W))
    for lat0, lon0, hh, hw in [(0.62, 0.7, 0.12, 0.55), (0.92, 2.6, 0.20, 0.30),
                               (0.40, 4.1, 0.10, 0.80), (1.10, 5.4, 0.22, 0.40),
                               (0.25, 1.7, 0.05, 0.45)]:
        boxes = np.maximum(boxes, softbox(lat, lon, lat0, lon0, hh, hw, 0.015))
    horizon = np.exp(-((lat - 0.02 + 0.03 * flow) / 0.035) ** 2)

    heat = np.clip(0.55 * ribbon + 0.9 * boxes + 0.6 * horizon + 0.25 * thin, 0, 1.4)
    rgb = np.empty((H, W, 3))
    for c in range(3):
        rgb[..., c] = np.interp(np.clip(heat, 0, 1.4),
                                [0.0, 0.25, 0.6, 1.0, 1.4],
                                [0.0, deep[c] * 0.6, mid[c], hot[c], white[c]])
    rgb *= (1.0 - 0.80 * np.clip(-lat / (np.pi / 2), 0, 1) ** 0.6)[..., None]   # dark floor
    rgb += (deep * 0.10)[None, None, :] * np.clip(lat, 0, 1)[..., None]
    img = Image.fromarray((np.clip(rgb, 0, 1) * 255 + 0.5).astype(np.uint8), "RGB")
    img.save(f"{OUT}/molten_env_{name}.jpg", quality=93)


for key, pal in PALETTES.items():
    make(key, pal)
print("ok")
