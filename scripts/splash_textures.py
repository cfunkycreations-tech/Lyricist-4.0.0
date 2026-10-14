"""
Splash textures for scripts/splash_c4d.py: the molten chrome look and the two
overlays, made here so they can be previewed before they reach Cinema 4D.

    python scripts/splash_textures.py scripts/splash_tex

  splash_env.jpg    2048x1024 reflection map for the metal: black, liquid silver
                    bands and electric-blue veins, warped so they flow. Wraps
                    left to right with no seam.
  splash_hud.png    1024x1024 RGBA: blue instrument rings and tick marks that
                    turn slowly behind the title.
  splash_sweep.png  512x1024 RGBA: the soft bar of light that crosses the title
                    at the end.

Same idea as blackhole_textures.py: the look lives in images, and the C4D
script only places and moves things, because C4D's procedural shaders came out
wrong on the first black hole.
"""
import sys

import numpy as np
from PIL import Image
from scipy.ndimage import map_coordinates

OUT = sys.argv[1] if len(sys.argv) > 1 else "scripts/splash_tex"


def field(h, w, corr_y, corr_x, seed):
    """Smooth random field that wraps on both edges, unit variance."""
    g = np.random.default_rng(seed)
    f = np.fft.fft2(g.standard_normal((h, w)))
    fy = np.fft.fftfreq(h)[:, None]
    fx = np.fft.fftfreq(w)[None, :]
    f = np.real(np.fft.ifft2(f * np.exp(-(fy * corr_y) ** 2 - (fx * corr_x) ** 2)))
    return (f - f.mean()) / f.std()


def warp(src, dy, dx):
    h, w = src.shape
    y, x = np.mgrid[0:h, 0:w].astype(np.float64)
    return map_coordinates(src, [y + dy, x + dx], order=1, mode="grid-wrap")


def save_rgb(rgb, name):
    img = Image.fromarray((np.clip(rgb, 0, 1) * 255 + 0.5).astype(np.uint8), "RGB")
    img.save(f"{OUT}/{name}", quality=92)


def save_rgba(rgb, a, name):
    rgba = np.concatenate([np.clip(rgb, 0, 1), np.clip(a, 0, 1)[..., None]], -1)
    Image.fromarray((rgba * 255 + 0.5).astype(np.uint8), "RGBA").save(f"{OUT}/{name}")


SILVER = np.array([0.86, 0.90, 0.96])
BLUE = np.array([0.16, 0.55, 1.00])
ICE = np.array([0.80, 0.93, 1.00])

# ── molten chrome reflection map ───────────────────────────────────────────
H, W = 1024, 2048
lat = (np.arange(H)[:, None] + 0.5) / H * 2 - 1            # -1 top .. +1 bottom
lat = np.broadcast_to(lat, (H, W))

w1 = field(H, W, 400, 300, 11)
w2 = field(H, W, 400, 300, 12)
flow = warp(field(H, W, 260, 140, 13), 90 * w1, 220 * w2)    # liquid, stretched sideways
fine = warp(field(H, W, 180, 120, 14), 60 * w2, 120 * w1)

# Chrome reads as hard black/white bands. Silver ridges follow the horizon and
# bend with the flow; blue veins run between them.
phase = lat * 4.0 + 0.9 * flow
silver = np.abs(np.cos(phase * np.pi)) ** 8
blue = np.abs(np.sin((lat * 3.0 + 0.8 * flow + 0.25 * fine) * np.pi)) ** 14
horizon = np.exp(-((lat + 0.04 + 0.03 * flow) / 0.05) ** 2)  # the bright studio line
sky = np.clip(-lat, 0, 1) ** 1.5 * 0.10                      # faint steel overhead
pools = np.clip(fine - 1.4, 0, None) * 0.6                   # small hot spots

rgb = (SILVER * (silver * 0.85 + horizon * 1.0 + pools)[..., None]
       + BLUE * (blue * 0.95 + sky)[..., None]
       + ICE * (horizon * blue * 0.6)[..., None])
rgb *= (1.0 - 0.55 * np.clip(lat, 0, 1) ** 0.7)[..., None]   # darker ground
save_rgb(rgb, "splash_env.jpg")

# ── HUD rings ──────────────────────────────────────────────────────────────
N = 1024
y, x = np.mgrid[0:N, 0:N]
u = (x + 0.5) / N * 2 - 1
v = (y + 0.5) / N * 2 - 1
r = np.hypot(u, v)
th = np.degrees(np.arctan2(v, u)) % 360


def ring(r0, width):
    return np.exp(-((r - r0) / width) ** 2)


def arcs(deg_on, deg_period, offset=0.0):
    return (((th + offset) % deg_period) < deg_on).astype(np.float64)


line = np.zeros_like(r)
line = np.maximum(line, ring(0.965, 0.0025))                          # outer rim
line = np.maximum(line, ring(0.93, 0.010) * arcs(1.0, 5.0) * 0.8)     # ticks every 5 deg
line = np.maximum(line, ring(0.915, 0.022) * arcs(1.4, 30.0) * 0.95)  # long ticks every 30 deg
line = np.maximum(line, ring(0.84, 0.004) * arcs(52.0, 60.0, 7.0))    # broken ring
line = np.maximum(line, ring(0.80, 0.0018) * 0.7)
line = np.maximum(line, ring(0.72, 0.010) * arcs(100.0, 120.0, 40.0) * 0.55)  # thick arcs
line = np.maximum(line, ring(0.66, 0.0018) * arcs(2.0, 3.0) * 0.6)    # dotted ring
cross = (np.exp(-(u / 0.0018) ** 2) + np.exp(-(v / 0.0018) ** 2)) * ((r > 0.45) & (r < 0.62))
line = np.maximum(line, np.clip(cross, 0, 1) * 0.5)                   # crosshair stubs
line *= (r < 0.98)
core = np.clip(line - 0.6, 0, 1) / 0.4
rgb = BLUE * (1 - core[..., None]) + ICE * core[..., None]
save_rgba(rgb, line * 0.75, "splash_hud.png")

# ── light sweep ────────────────────────────────────────────────────────────
SH, SW = 1024, 512
sy, sx = np.mgrid[0:SH, 0:SW]
su = (sx + 0.5) / SW * 2 - 1
sv = (sy + 0.5) / SH * 2 - 1
bar = np.exp(-(su / 0.22) ** 2)
core = np.exp(-(su / 0.05) ** 2)
fade = np.clip(1 - np.abs(sv), 0, 1) ** 0.6
rgb = BLUE * (1 - core[..., None]) * 0.9 + ICE * core[..., None]
rgb = rgb + np.array([1.0, 1.0, 1.0]) * (core ** 2)[..., None] * 0.4
save_rgba(rgb, np.clip(bar * 0.55 + core * 0.45, 0, 1) * fade, "splash_sweep.png")
print("ok")
