"""
Render the Black Hole Studios header loop without Cinema 4D: same textures,
camera and spin as scripts/blackhole_c4d.py, ray-cast in numpy.

    python scripts/blackhole_render.py <frames_dir> 720
    ffmpeg -framerate 30 -i <frames_dir>/bh_%04d.png -vf crop=720:400:0:160 \
      -c:v libvpx-vp9 -pix_fmt yuva420p -b:v 0 -crf 32 -auto-alt-ref 0 -an \
      src/assets/blackhole/bh_loop.webm
"""
import numpy as np, sys, os
from PIL import Image
from multiprocessing import Pool
TEX = os.path.join(os.path.dirname(os.path.abspath(__file__)), "blackhole_tex")
R, DO, HO = 100.0, 460.0, 200.0
D, ELEV, FOCAL = 1400.0, 12.0, 58.0
OUT, SIZE, SS, FRAMES = sys.argv[1], int(sys.argv[2]), 2, 300
N = SIZE * SS
disc = np.asarray(Image.open(os.path.join(TEX, 'bh_disc.png'))).astype(np.float32) / 255
halo = np.asarray(Image.open(os.path.join(TEX, 'bh_halo.png'))).astype(np.float32) / 255
# premultiply for correct bilinear filtering
for t in (disc, halo): t[..., :3] *= t[..., 3:4]
e = np.radians(ELEV)
C = np.array([0, D * np.sin(e), -D * np.cos(e)])
fwd = -C / np.linalg.norm(C); right = np.cross([0, 1, 0], fwd); right /= np.linalg.norm(right); up = np.cross(fwd, right)
k = 18.0 / FOCAL
ys, xs = np.mgrid[0:N, 0:N]
px = ((xs + 0.5) / N * 2 - 1) * k; py = -((ys + 0.5) / N * 2 - 1) * k
d = fwd[None, None] + px[..., None] * right + py[..., None] * up
d /= np.linalg.norm(d, axis=-1, keepdims=True)
b = d @ C; disc_ = b * b - (C @ C - R * R)
ts = np.where(disc_ > 0, -b - np.sqrt(np.maximum(disc_, 0)), np.inf)
with np.errstate(divide='ignore', invalid='ignore'):
    td = -C[1] / d[..., 1]
td[~np.isfinite(td) | (td < 0)] = np.inf
P = C + np.where(np.isfinite(td), td, 0)[..., None] * d
nrm = -fwd; th = -(C @ nrm) / (d @ nrm); Hh = C + th[..., None] * d
hx, hy = Hh @ right, Hh @ up

def bilinear(img, uu, vv):
    h, w, _ = img.shape
    x = (uu + 1) / 2 * w - 0.5; y = (vv + 1) / 2 * h - 0.5
    x0 = np.floor(x).astype(int); y0 = np.floor(y).astype(int); fx = (x - x0)[..., None]; fy = (y - y0)[..., None]
    def g(yy, xx):
        ok = (xx >= 0) & (xx < w) & (yy >= 0) & (yy < h)
        out = img[np.clip(yy, 0, h - 1), np.clip(xx, 0, w - 1)]; out[~ok] = 0; return out
    return (g(y0, x0) * (1 - fx) * (1 - fy) + g(y0, x0 + 1) * fx * (1 - fy)
            + g(y0 + 1, x0) * (1 - fx) * fy + g(y0 + 1, x0 + 1) * fx * fy)

def frame(i):
    a = 2 * np.pi * i / FRAMES
    lx = P[..., 0] * np.cos(a) - P[..., 2] * np.sin(a); lz = P[..., 0] * np.sin(a) + P[..., 2] * np.cos(a)
    L1 = bilinear(disc, lx / DO, lz / DO); L1[~np.isfinite(td)] = 0
    b2 = -a
    L2 = bilinear(halo, (hx * np.cos(b2) - hy * np.sin(b2)) / HO, (hx * np.sin(b2) + hy * np.cos(b2)) / HO)
    L3 = np.zeros((N, N, 4), np.float32); L3[..., 3] = np.isfinite(ts)
    depth = np.stack([td, th, ts]); layers = [L1, L2, L3]
    order = np.argsort(depth, axis=0)
    rgb = np.zeros((N, N, 3)); acc = np.zeros((N, N))
    for rank in range(3):
        idx = order[rank]; col = np.zeros((N, N, 4))
        for j in range(3): col[idx == j] = layers[j][idx == j]
        w = 1 - acc; rgb += w[..., None] * col[..., :3]; acc += w * col[..., 3]
    # downsample (box) premultiplied, then un-premultiply to straight alpha
    rgb = rgb.reshape(SIZE, SS, SIZE, SS, 3).mean((1, 3)); acc = acc.reshape(SIZE, SS, SIZE, SS).mean((1, 3))
    straight = np.where(acc[..., None] > 1e-4, rgb / np.maximum(acc[..., None], 1e-4), 0)
    rgba = np.concatenate([np.clip(straight, 0, 1), np.clip(acc, 0, 1)[..., None]], -1)
    Image.fromarray((rgba * 255 + 0.5).astype(np.uint8), 'RGBA').save(f'{OUT}/bh_{i:04d}.png')
    return i

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    only = [int(x) for x in sys.argv[3:]]
    with Pool(4) as p:
        for i in p.imap_unordered(frame, only or range(FRAMES)):
            if i % 25 == 0: print(i, flush=True)
    print('DONE')
