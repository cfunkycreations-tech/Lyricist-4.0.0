"""Make the splash's lip-sync layers and timeline from Chris's two splash
pictures and the opener's own audio.

    <python with numpy, scipy, opencv, pillow, cmudict> scripts/splash/prep_splash.py <desktop.png> <phone.png> <vocals.wav> <music.wav>

vocals.wav / music.wav: the opener audio (src/assets/blackhole/intro.mp4)
split with Demucs (htdemucs, two stems). The audio in the app is untouched;
these only time the animation.

Writes src/assets/splash/:
  <layout>-plate.webp     the picture with the mouth, eyes and brows painted
                          out (the face behind them filled with skin)
  <layout>-mouth.webp     his own mouth, cut from the picture (the shapes
                          are this mouth opened, closed, widened or rounded)
  <layout>-eyeL/eyeR.webp (brow and eye together), -head.webp, -hand.webp
  timeline.json           the words, the visemes with times, the voice
                          loudness and the music's beats (25 fps)
"""
import json, os, sys
import cv2
import numpy as np
import soundfile as sf
from PIL import Image
from scipy import ndimage
import cmudict

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
OUT = os.path.join(ROOT, 'src', 'assets', 'splash')
os.makedirs(OUT, exist_ok=True)
desk_png, phone_png, vocals, music = sys.argv[1:5]

# ---------------- where the face is (fractions of each picture) ----------------
LAYOUT = {
    'desktop': {
        'src': desk_png,
        'mouth': [0.194, 0.398, 0.268, 0.520],
        # Each side's brow and eye touch in this art, so they travel as one piece.
        'eyeL': [0.200, 0.340, 0.234, 0.430], 'eyeR': [0.233, 0.348, 0.272, 0.434],
        'head': [0.115, 0.235, 0.330, 0.520],
        'hand': [0.318, 0.465, 0.402, 0.625], 'wrist': [0.335, 0.585],
        'cups': [[0.163, 0.372], [0.283, 0.428]],
        'bar': [0.401, 0.588, 0.599, 0.613],
        'water': [0.60, 0.575, 1.0, 0.86],
        'sky': [0.58, 0.0, 1.0, 0.36], 'moon': [0.808, 0.140, 0.055],
        'notes': [[0.165, 0.235], [0.08, 0.335], [0.36, 0.43], [0.355, 0.66]],
    },
    'phone': {
        'src': phone_png,
        'mouth': [0.336, 0.413, 0.499, 0.495],
        'eyeL': [0.341, 0.376, 0.418, 0.430], 'eyeR': [0.416, 0.382, 0.494, 0.432],
        'head': [0.150, 0.300, 0.600, 0.500],
        'hand': [0.615, 0.425, 0.870, 0.525], 'wrist': [0.660, 0.500],
        'cups': [[0.240, 0.398], [0.530, 0.432]],
        'bar': [0.146, 0.857, 0.854, 0.879],
        'water': [0.47, 0.375, 1.0, 0.455],
        'sky': [0.55, 0.06, 1.0, 0.30], 'moon': [0.882, 0.160, 0.065],
        'notes': [[0.12, 0.36], [0.82, 0.405], [0.86, 0.48], [0.96, 0.50]],
    },
}


def px(b, W, H):
    return int(b[0] * W), int(b[1] * H), int(b[2] * W), int(b[3] * H)


def ink(a):
    """Black line work and the dark mouth interior: not the cream face."""
    hsv = cv2.cvtColor(a, cv2.COLOR_RGB2HSV).astype(np.float32)
    s, v = hsv[..., 1] / 255, hsv[..., 2] / 255
    lum = a.astype(np.float32) @ [0.299, 0.587, 0.114]
    cream = (lum > 175) & (s < 0.42)
    return ~cream & ((lum < 120) | (s > 0.45))


def cutout(a, box, fill=True, grow=2, mouth=False):
    W, H = a.shape[1], a.shape[0]
    x0, y0, x1, y1 = px(box, W, H)
    sub = a[y0:y1, x0:x1]
    m = ink(sub)
    if fill:
        m = ndimage.binary_fill_holes(ndimage.binary_closing(m, np.ones((5, 5))))
    m = ndimage.binary_opening(m, np.ones((2, 2)))
    lab, n = ndimage.label(m)
    if n:
        sizes = ndimage.sum(m, lab, range(1, n + 1))
        m = np.isin(lab, np.nonzero(sizes >= (12 if mouth else max(12, sizes.max() * 0.04)))[0] + 1)
    m = ndimage.binary_dilation(m, np.ones((grow * 2 + 1, grow * 2 + 1)))
    full = np.zeros((H, W), bool)
    full[y0:y1, x0:x1] = m
    alpha = cv2.GaussianBlur(m.astype(np.float32), (0, 0), 0.8)
    rgba = np.dstack([sub, (np.clip(alpha, 0, 1) * 255).astype(np.uint8)])
    return full, rgba


def feathered(a, box, feather=0.18):
    W, H = a.shape[1], a.shape[0]
    x0, y0, x1, y1 = px(box, W, H)
    sub = a[y0:y1, x0:x1]
    h, w = sub.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w]
    d = np.minimum.reduce([xx / w, (w - xx) / w, yy / h, (h - yy) / h])
    alpha = np.clip(d / feather, 0, 1)
    return np.dstack([sub, (alpha * 255).astype(np.uint8)])


info = {}
for name, L in LAYOUT.items():
    a = np.asarray(Image.open(L['src']).convert('RGB'))
    H, W = a.shape[:2]
    hole = np.zeros((H, W), bool)
    parts = {}
    # The mouth first: the biggest shape in its box and what hangs below it
    # (the chin line), never a scrap of eye or brow.
    m, rgba = cutout(a, L['mouth'], fill=True, mouth=True)
    x0, y0, x1, y1 = px(L['mouth'], W, H)
    sub = rgba[..., 3] > 40
    keep = np.ones_like(sub)
    lab, n = ndimage.label(sub)
    if n:
        sizes = ndimage.sum(sub, lab, range(1, n + 1))
        big = int(np.argmax(sizes)) + 1
        cy = ndimage.center_of_mass(lab == big)[0]
        top = np.nonzero((lab == big).any(1))[0][0]
        bx = np.nonzero((lab == big).any(0))[0]
        span = bx[-1] - bx[0]
        by = np.nonzero((lab == big).any(1))[0]
        bottom, height = by[-1], by[-1] - by[0]
        for i in range(1, n + 1):
            if i == big:
                continue
            ys = np.nonzero((lab == i).any(1))[0]
            xs = np.nonzero((lab == i).any(0))[0]
            # The chin line sits under the middle of the mouth; strands of
            # hair at the box's corners do not (they showed as a light patch
            # moving with the jaw on the phone).
            under = (xs[0] > bx[0] + span * 0.15 and xs[-1] < bx[-1] - span * 0.15
                     and ys[0] < bottom + height * 0.25)
            if ys.mean() < cy or ys[0] < top or not under:
                keep &= lab != i
    mouth = np.zeros((H, W), bool)
    mouth[y0:y1, x0:x1] = sub & keep
    rgba[..., 3] = (rgba[..., 3] * keep).astype(np.uint8)
    hole |= mouth
    parts['mouth'] = rgba
    # Then each brow-and-eye: the ink left in its box once the mouth is out.
    away = ndimage.binary_dilation(mouth, np.ones((3, 3)))
    for key in ('eyeL', 'eyeR'):
        m, rgba = cutout(a, L[key], fill=False)
        x0, y0, x1, y1 = px(L[key], W, H)
        ok = ~away[y0:y1, x0:x1]
        rgba[..., 3] = (rgba[..., 3] * ok).astype(np.uint8)
        hole |= m & ~away
        parts[key] = rgba
    plate = cv2.inpaint(np.ascontiguousarray(a[..., ::-1]), (ndimage.binary_dilation(hole, np.ones((9, 9))) * 255).astype(np.uint8),
                        9, cv2.INPAINT_TELEA)[..., ::-1]
    Image.fromarray(plate).save(os.path.join(OUT, f'{name}-plate.webp'), quality=88, method=6)
    for key, rgba in parts.items():
        Image.fromarray(rgba, 'RGBA').save(os.path.join(OUT, f'{name}-{key}.webp'), quality=92, method=6)
    # The head (from the plate: no face, the face layers ride on it) and the pointing hand.
    Image.fromarray(feathered(plate, L['head'], 0.12), 'RGBA').save(os.path.join(OUT, f'{name}-head.webp'), quality=90, method=6)
    Image.fromarray(feathered(a, L['hand'], 0.15), 'RGBA').save(os.path.join(OUT, f'{name}-hand.webp'), quality=90, method=6)
    info[name] = {k: v for k, v in L.items() if k != 'src'} | {'w': W, 'h': H}
    print(name, W, H, 'face ink', int(hole.sum()))

# ---------------- timeline ----------------
# The words and where they are, timed on the separated voice (Whisper on the
# voice alone, then snapped to where the voice really starts and stops).
WORDS = [
    ('Lyricist', 0.82, 1.86), ('Pro', 1.87, 2.48),
    ('Funk', 3.97, 4.20), ('Audio', 4.45, 4.85), ('Flow', 4.85, 5.30), ('Opsec', 5.38, 6.12),
    ('Built', 7.30, 7.47), ('by', 7.59, 7.83), ('Chris', 7.93, 8.25), ('Funk', 8.25, 8.80),
    ('Austin', 10.36, 10.96), ('Texas', 11.12, 11.71), ("Y'all", 12.23, 12.95),
]
EXTRA = {'opsec': ['AA1', 'P', 'S', 'EH2', 'K'], "y'all": ['Y', 'AO1', 'L']}
d = cmudict.dict()
# Visemes (the Preston Blair set Rhubarb uses):
#  A closed M B P | B teeth, slightly open (most consonants) | C open E, EH, IH
#  D wide open AA, AH, AY, AE | E rounded AO, OW | F puckered UW, W, OO
#  G F, V (lip on teeth) | H L, TH (tongue) | X rest (the grin)
VIS = {
    'M': 'A', 'B': 'A', 'P': 'A',
    'F': 'G', 'V': 'G',
    'L': 'H', 'TH': 'H', 'DH': 'H',
    'AA': 'D', 'AH': 'D', 'AY': 'D', 'AE': 'D', 'AW': 'D',
    'EH': 'C', 'EY': 'C', 'IH': 'C', 'IY': 'C', 'ER': 'C',
    'AO': 'E', 'OW': 'E', 'OY': 'E',
    'UW': 'F', 'UH': 'F', 'W': 'F',
}
vis = []
for word, s, e in WORDS:
    ph = EXTRA.get(word.lower()) or d.get(word.lower(), [['AH']])[0]
    ph = [p.rstrip('012') for p in ph]
    weights = [2.2 if any(c in 'AEIOU' for c in p) else 1.0 for p in ph]
    T = e - s
    t = s
    for p, wgt in zip(ph, weights):
        dur = T * wgt / sum(weights)
        vis.append([round(t, 3), VIS.get(p, 'B'), p, word])
        t += dur
    vis.append([round(e, 3), 'X', '', ''])

# Voice loudness and music beats, 25 fps.
def envelope(path):
    x, sr = sf.read(path)
    x = x.mean(1) if x.ndim > 1 else x
    hop = sr // 25
    n = len(x) // hop
    return np.array([np.sqrt(np.mean(x[i * hop:(i + 1) * hop] ** 2)) for i in range(n)])

v = envelope(vocals)
v = np.clip((20 * np.log10(v + 1e-9) + 45) / 30, 0, 1)
m = envelope(music)
flux = np.maximum(0, np.diff(m, prepend=m[0]))
flux = flux / (flux.max() + 1e-9)
beats = [round(i / 25, 2) for i in range(1, len(flux) - 1) if flux[i] > 0.28 and flux[i] >= flux[i - 1] and flux[i] >= flux[i + 1]]
emph = [w for w in WORDS if v[int(w[1] * 25):int(w[2] * 25) + 1].max() > 0.8]

json.dump({
    'fps': 25, 'layouts': info, 'words': WORDS, 'visemes': vis,
    'voice': ''.join(chr(48 + int(round(x * 9))) for x in v),
    'beats': beats, 'emphasis': [[w[1], w[2]] for w in emph],
    'lastWordEnd': WORDS[-1][2],
}, open(os.path.join(OUT, 'timeline.json'), 'w'), separators=(',', ':'))
print('visemes', len(vis), 'beats', len(beats), 'emphasised', [w[0] for w in emph])
