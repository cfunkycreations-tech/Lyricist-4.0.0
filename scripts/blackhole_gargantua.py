"""
The Black Hole Studios header loop, drawn to match the black hole on the
app icon (src/assets/icon.ico, Chris, 2026-10-11: "rebuild that black hole,
make it look just like that one"). Replaces the silver dome-on-a-plate render
in blackhole_render.py.

What the icon shows, and what each layer below draws:
  - a round black shadow, a full circle, not a dome;
  - a thin gold photon ring hugging it all the way round;
  - the far side of the disc bent over the top: a thin orange arc;
  - the underside bent below it: the brightest, widest glow, yellow-white;
  - the disc itself nearly edge-on, crossing IN FRONT of the shadow, white-hot
    at the middle, orange, then crimson at the ends, streaked like grooves,
    brighter on the left where it comes toward you.

Hot clumps ride the disc, faster inside than out, so it reads as spinning.
Streaks turn a whole number of times per loop, so the last frame flows into
the first.

    python3 scripts/blackhole_gargantua.py <frames_dir>
    ffmpeg -framerate 30 -i <frames_dir>/bh_%04d.png -c:v libvpx-vp9 \
      -pix_fmt yuva420p -b:v 0 -crf 30 -auto-alt-ref 0 -an \
      src/assets/blackhole/bh_loop.webm
"""
import os
import sys

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter

W, H, SS, FRAMES = 720, 264, 2, 300
CX, CY, RS = 360.0, 124.0, 64.0          # shadow centre and radius, output px
Q = 0.10                                  # how flat the disc looks (sin of the tilt)
R_IN, R_OUT = 1.28 * RS, 5.9 * RS

# Temperature to colour, from the icon: crimson ends, orange, yellow, white core.
STOPS = np.array([
    [0.00, 0, 0, 0],
    [0.10, 120, 12, 10],
    [0.25, 205, 45, 18],
    [0.45, 250, 115, 30],
    [0.65, 255, 175, 70],
    [0.85, 255, 222, 150],
    [1.00, 255, 248, 228],
], dtype=np.float32)


def colour(t):
    t = np.clip(t, 0, 1)
    out = np.empty(t.shape + (3,), np.float32)
    for c in range(3):
        out[..., c] = np.interp(t, STOPS[:, 0], STOPS[:, c + 1]) / 255.0
    return out


def smooth(x):
    x = np.clip(x, 0, 1)
    return x * x * (3 - 2 * x)


N_W, N_H = W * SS, H * SS
ys, xs = np.mgrid[0:N_H, 0:N_W].astype(np.float32)
dx = (xs + 0.5) / SS - CX
dy = (ys + 0.5) / SS - CY                # down is positive

# The disc, in its own plane: the picture squashed by Q undone.
r = np.hypot(dx, dy / Q)
phi = np.arctan2(dy / Q, dx)
near = dy > 0                             # the half in front of the shadow

# Around the shadow.
rr = np.hypot(dx, dy)
th = np.arctan2(dy, dx)
sin_th = np.sin(th)
shadow = smooth((RS - rr) * SS / 1.5 + 0.5)

rng = np.random.default_rng(7)
# Groove streaks: concentric bands broken up along the angle. Integer angular
# frequencies only, so a whole turn of the pattern is the same pattern.
BANDS = [(rng.uniform(5, 16), rng.uniform(0.6, 1.8), int(rng.integers(1, 5)), rng.uniform(0, 6.28),
          rng.uniform(0, 6.28), rng.uniform(0.4, 1.0)) for _ in range(9)]
# Hot clumps riding the disc: spiral arms with integer arm counts, so the
# motion reads (Chris, 2026-10-11: the first cut looked like a still).
CLUMPS = [(int(rng.integers(2, 5)), rng.uniform(0.8, 2.2), rng.uniform(0, 6.28), rng.uniform(0.5, 1.0)) for _ in range(4)]


def clumps(rad, ang):
    c = np.zeros_like(rad)
    total = 0.0
    for k, twist, p, w in CLUMPS:
        c += w * (0.5 + 0.5 * np.cos(k * ang + twist * rad + p))
        total += w
    return 0.1 + 1.9 * (c / total) ** 2.6


def streaks(rad, ang):
    s = np.zeros_like(rad)
    total = 0.0
    for freq, wob, m, p1, p2, w in BANDS:
        s += w * (0.5 + 0.5 * np.cos(freq * rad + wob * np.cos(m * ang + p1) + p2))
        total += w
    s /= total
    return 0.12 + 1.3 * s ** 2.2


def frame(i):
    turn = 2 * np.pi * i / FRAMES
    # Faster inside than out: five turns a loop at the rim, three in the
    # middle, two at the edge, blended by radius.
    inner = smooth((2.4 * RS - r) / (0.9 * RS))
    outer = smooth((r - 3.6 * RS) / (1.2 * RS))
    mid = np.clip(1 - inner - outer, 0, 1)

    def flow(n):
        a = phi - n * turn
        return streaks(r / RS, a) * clumps(r / RS, a)
    tex = inner * flow(5) + mid * flow(3) + outer * flow(2)

    t_disc = (R_IN / np.maximum(r, 1)) ** 1.05
    doppler = 1 + 0.5 * (-np.cos(phi))
    edge = smooth((r - R_IN) / (0.1 * R_IN)) * smooth((R_OUT - r) / (1.4 * RS))
    edge *= smooth((CX - np.abs(dx)) / 50)
    # The hot inner rim: smooth, no grooves, the white band across the shadow.
    rim = np.exp(-np.clip(r - R_IN, 0, None) * Q / (0.2 * RS))
    disc_i = edge * (2.4 * t_disc ** 1.25 * tex + 1.3 * rim * (0.7 + 0.3 * tex)) * doppler
    disc = colour(0.12 + 0.88 * np.maximum(t_disc * (0.75 + 0.25 * tex), rim))[..., :] * disc_i[..., None]
    # The far half goes behind the shadow; the near half crosses in front.
    disc_back = disc * (~near)[..., None]
    disc_front = disc * near[..., None]
    # A disc with body: the icon's band across the shadow is thick and hot,
    # not the hairline a true projection gives at this tilt.
    def thick(x):
        return 0.55 * x + 1.1 * gaussian_filter(x, sigma=(4.5 * SS, 0.6 * SS, 0))
    disc_back, disc_front = thick(disc_back), thick(disc_front)

    # Photon ring: thin, gold, all the way round, strongest underneath.
    shimmer = 0.75 + 0.25 * np.cos(3 * th - 5 * turn) * np.cos(5 * th + 4 * turn)
    ring = np.exp(-((rr - 1.025 * RS) / (0.018 * RS)) ** 2) * (0.55 + 0.9 * np.clip(sin_th, 0, 1)) * shimmer
    ring_c = colour(0.55 + 0.35 * np.clip(sin_th, 0, 1)) * (1.1 * ring)[..., None]

    # Lensed arcs: the disc's far side bent over the top, its underside below.
    out_of = np.clip(rr - 1.05 * RS, 0, None)
    arc_tex = streaks(rr / RS * 3.0, th - 3 * turn) * clumps(rr / RS * 3.0, th - 3 * turn)
    up_w = smooth((0.35 - sin_th) / 0.7)
    low_w = 1 - up_w
    side = 1 + 0.35 * (-np.cos(th))
    upper = 0.45 * np.exp(-out_of / (0.06 * RS)) * up_w * side * (0.6 + 0.4 * arc_tex)
    lower = 2.6 * np.exp(-out_of / (0.2 * RS)) * low_w * (0.4 + 0.6 * np.clip(sin_th, 0, 1)) * side * (0.65 + 0.35 * arc_tex)
    outside = smooth((rr - RS) * SS / 1.5 + 0.5)
    t_up = 0.45 * np.exp(-out_of / (0.18 * RS)) + 0.2
    t_low = 0.75 * np.exp(-out_of / (0.35 * RS)) + 0.2
    arcs = (colour(t_up) * upper[..., None] + colour(t_low) * lower[..., None]) * outside[..., None]

    back = disc_back + arcs + ring_c
    light = back * (1 - shadow)[..., None] + disc_front

    # Down to size, then the glow.
    light = light.reshape(H, SS, W, SS, 3).mean(axis=(1, 3))
    sh = shadow.reshape(H, SS, W, SS).mean(axis=(1, 3))
    bloom = np.stack([gaussian_filter(light[..., c], 3) * 0.45 + gaussian_filter(light[..., c], 12) * 0.22
                      for c in range(3)], -1)
    hdr = light + bloom
    lit = 1 - np.exp(-1.35 * hdr)            # bright parts burn to white, never clip hard

    a_light = np.clip(lit.max(axis=-1) * 1.15, 0, 1)
    alpha = np.maximum(sh, a_light)
    rgb = np.clip(lit / np.maximum(alpha, 1e-4)[..., None], 0, 1)
    rgba = np.concatenate([rgb, alpha[..., None]], -1)
    return Image.fromarray((rgba * 255 + 0.5).astype(np.uint8), 'RGBA')


def save(job):
    out, i = job
    frame(i).save(os.path.join(out, f'bh_{i:04d}.png'))


if __name__ == '__main__':
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    only = [int(a) for a in sys.argv[2:]] or list(range(FRAMES))
    from multiprocessing import Pool
    with Pool(min(4, os.cpu_count() or 1)) as pool:
        pool.map(save, [(out, i) for i in only], chunksize=4)
