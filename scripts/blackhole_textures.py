"""
Black hole textures for scripts/blackhole_c4d.py: the accretion disc and the
lensed halo with its photon ring, as RGBA PNGs with straight alpha.

    python scripts/blackhole_textures.py scripts/blackhole_tex 0.33 0.5

args: output folder, disc inner edge (fraction of DISC_OUTER), horizon radius
(fraction of HALO_OUTER). The C4D script maps these onto flat planes, so the
look is decided here, where it can be previewed, not by C4D's procedural
shaders, which rendered a solid orange planet on the first try.
"""
import numpy as np, sys
from scipy.ndimage import map_coordinates
from PIL import Image
OUT = sys.argv[1]
N = 1024

def polar_noise(nr, nt, r_corr, t_corr, seed):
    """Periodic-in-theta random field, smooth along the orbit, fine across it."""
    g = np.random.default_rng(seed)
    w = g.standard_normal((nr, nt))
    fr = np.fft.fftfreq(nr)[:, None]; ft = np.fft.fftfreq(nt)[None, :]
    filt = np.exp(-(fr * r_corr) ** 2 - (ft * t_corr) ** 2)
    f = np.real(np.fft.ifft2(np.fft.fft2(w) * filt))
    return (f - f.mean()) / f.std()

def sample_polar(field, r, th, r_max):
    nr, nt = field.shape
    ri = np.clip(r / r_max, 0, 1) * (nr - 1)
    ti = (th % (2 * np.pi)) / (2 * np.pi) * nt
    return map_coordinates(field, [ri, ti], order=1, mode='grid-wrap')

def ramp(x, stops):
    xs = [s[0] for s in stops]
    return np.stack([np.interp(x, xs, [s[1][c] for s in stops]) for c in range(3)], -1)

FIRE = [(0.00, (1.00, 0.98, 0.94)), (0.25, (1.00, 0.84, 0.52)), (0.45, (1.00, 0.60, 0.20)),
        (0.70, (0.80, 0.26, 0.06)), (1.00, (0.30, 0.05, 0.02))]

y, x = np.mgrid[0:N, 0:N]
u = (x + 0.5) / N * 2 - 1; v = (y + 0.5) / N * 2 - 1
r = np.hypot(u, v); th = np.arctan2(v, u)

def save(rgb, a, name):
    rgba = np.concatenate([np.clip(rgb, 0, 1), np.clip(a, 0, 1)[..., None]], -1)
    Image.fromarray((rgba * 255 + 0.5).astype(np.uint8), 'RGBA').save(f'{OUT}/{name}')

# ── accretion disc: plane spans +/-1 = DISC_OUTER; inner edge at r_in ──────
r_in = float(sys.argv[2]) if len(sys.argv) > 2 else 0.33
s = np.clip((r - r_in) / (1 - r_in), 0, 1)               # 0 at inner edge, 1 at rim
n1 = sample_polar(polar_noise(512, 1024, 16, 140, 1), r, th, 1.0)
n2 = sample_polar(polar_noise(512, 1024, 40, 60, 2), r, th, 1.0)
streak = 1 + 0.20 * n1 + 0.12 * n2
heat = np.clip(s ** 0.75 + 0.06 * n2, 0, 1)
rgb = ramp(heat, FIRE)
glow = (1 - s) ** 1.8 * 1.25 + 0.55                       # hottest at the inner edge
rgb = rgb * (glow * streak)[..., None]
a_in = np.clip((r - r_in) / 0.035, 0, 1) ** 1.5          # crisp-ish inner edge
a_out = np.clip(1 - s, 0, 1) ** 1.1
a = a_in * a_out * np.clip(0.85 + 0.3 * n1, 0.45, 1.0)
a[r > 1] = 0
save(rgb, a, 'bh_disc.png')

# ── lensed halo + photon ring: plane spans +/-1 = HALO_OUTER ───────────────
h_in = float(sys.argv[3]) if len(sys.argv) > 3 else 0.50  # = horizon radius / HALO_OUTER
q = np.clip((r - h_in) / (1 - h_in), 0, 1)
hn = sample_polar(polar_noise(256, 1024, 10, 110, 3), r, th, 1.0)
heat = np.clip(0.18 + q * 1.4 + 0.05 * hn, 0, 1)
rgb = ramp(heat, FIRE) * ((1 - q) ** 1.5 * 1.2 + 0.3)[..., None] * (1 + 0.25 * hn)[..., None]
band = np.exp(-((q - 0.10) / 0.20) ** 2) * 0.9                 # the arc, hugging the shadow
ring = 0.9 * np.exp(-((r - h_in * 1.04) / (h_in * 0.014)) ** 2)  # photon ring: thin, white-hot
a = np.clip(band * (0.85 + 0.2 * hn), 0, 1) * (r > h_in * 0.98)
a = np.maximum(a, ring)
rgb = rgb * (1 - ring[..., None]) + np.array([1.0, 0.97, 0.92]) * ring[..., None]
a[r > 1] = 0
save(rgb, a, 'bh_halo.png')
print('ok')
