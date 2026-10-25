"""Step 1 of the animated Ghost: lift the character off the checkerboard that
is baked into Chris's art (it is not real transparency).

    python scripts/ghost-face/cutout.py scripts/ghost-face/source.png <out_dir>

The outline is solid black, so the checkerboard is whatever neutral light
pixels the border can reach without crossing it. bake.py imports cutout().
"""
import sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi


def cutout(im):
    """RGB float array (H, W, 3) -> RGBA uint8 array with the checkerboard gone."""
    lum = im @ np.array([0.299, 0.587, 0.114], dtype=np.float32)
    chroma = im.max(axis=2) - im.min(axis=2)

    # Checkerboard squares: light and neutral. (Cream, green, gold and the gloves are all warmer.)
    bgish = (lum > 150) & (chroma < 16)
    lab, _ = ndi.label(bgish)
    border = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
    border = border[border > 0]
    bg = np.isin(lab, border)

    # Soft edge: the outline is black, so a pixel on the boundary is black mixed with
    # checkerboard. Its alpha is how dark it is against the light squares.
    band = ndi.binary_dilation(bg, iterations=3) & ~bg
    alpha = np.where(bg, 0.0, 1.0).astype(np.float32)
    alpha[band] = np.clip(1.0 - lum / 215.0, 0.0, 1.0)[band]
    rgb = im.copy()
    rgb[band] = np.array([14, 14, 14], dtype=np.float32)   # outline colour, not checker-tinted
    return np.dstack([np.clip(rgb, 0, 255), alpha * 255]).astype(np.uint8)


if __name__ == '__main__':
    src, out = sys.argv[1], sys.argv[2]
    im = np.asarray(Image.open(src).convert('RGB')).astype(np.float32)
    rgba = cutout(im)
    Image.fromarray(rgba, 'RGBA').save(f'{out}/cutout.png')
    ys, xs = np.where(rgba[..., 3] > 12)
    print('bbox', xs.min(), ys.min(), xs.max(), ys.max())
