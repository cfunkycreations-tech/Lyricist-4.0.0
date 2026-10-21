"""Compose promo videos from the recorded frames.

Vertical (TikTok / Shorts / Reels): hook on top, step caption, a 1080x1080 window
on the app that follows the Ghost, brand slices, outro card.
Horizontal (YouTube): intro card, full frames with lower-third captions, outro.

python3 compose.py [clip ...]   (no args = all)
"""
import json, os, subprocess, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

D = os.path.dirname(os.path.abspath(__file__))
REPO = os.environ.get('REPO') or os.path.abspath(os.path.join(D, '..', '..'))
FR = os.path.join(D, 'frames')
OUT = os.path.join(D, 'out')
os.makedirs(OUT, exist_ok=True)
AW = f'{REPO}/src/assets/fonts/Audiowide-Regular.ttf'
LOGO = Image.open(f'{REPO}/src/assets/brand-logo.webp').convert('RGBA')
GHOST = Image.open(f'{REPO}/src/assets/ghost-sprite.png').convert('RGBA')
SLICES = ['#E8405A', '#FF7A1A', '#FFC24D', '#3DDC84', '#2EC4B6', '#4F7BFF', '#9B6BFF']
BG = (5, 2, 8)
CREAM = (255, 244, 226)
ORANGE = (255, 138, 61)
AMBER = (255, 178, 90)

FPS = 30
BANNED = ['neon', 'midnight', 'rain', 'heartbreak', 'cold coffee', 'shadow', 'whisper', 'echo', 'spark', 'cage', 'gravity', 'chain', 'storm']

_fonts = {}
def font(sz):
    if sz not in _fonts:
        _fonts[sz] = ImageFont.truetype(AW, sz)
    return _fonts[sz]

def check(text):
    hit = [w for w in BANNED if w in text.lower()]
    if hit:
        raise SystemExit(f'banned word {hit} in: {text}')
    return text

def wrap(text, f, width):
    words, lines, cur = text.split(), [], ''
    for w in words:
        t = (cur + ' ' + w).strip()
        if f.getlength(t) <= width or not cur:
            cur = t
        else:
            lines.append(cur); cur = w
    if cur:
        lines.append(cur)
    return lines

def glow_text(size, text, sz, fill=CREAM, glow=(255, 140, 50), width=None, spacing=1.15, align='center'):
    """Transparent RGBA layer with centred, wrapped text and a soft glow."""
    check(text)
    W, H = size
    f = font(sz)
    lines = []
    for para in text.split('\n'):
        lines += wrap(para, f, width or W - 120)
    lh = int(sz * spacing)
    total = lh * len(lines)
    layer = Image.new('RGBA', size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    y = (H - total) // 2
    for ln in lines:
        x = (W - f.getlength(ln)) / 2 if align == 'center' else 60
        d.text((x, y), ln, font=f, fill=fill + (255,))
        y += lh
    g = layer.copy()
    gd = Image.new('RGBA', size, glow + (0,))
    gd.putalpha(g.split()[3])
    gd = gd.filter(ImageFilter.GaussianBlur(sz * 0.35))
    out = Image.new('RGBA', size, (0, 0, 0, 0))
    out.alpha_composite(gd)
    out.alpha_composite(gd)
    out.alpha_composite(layer)
    return out

def slice_bar(w, h):
    bar = Image.new('RGB', (w, h))
    d = ImageDraw.Draw(bar)
    n = len(SLICES)
    for i, c in enumerate(SLICES):
        d.rectangle([i * w // n, 0, (i + 1) * w // n, h], fill=c)
    return bar

def backdrop(w, h, cy=0.4):
    """Near-black with a warm glow, like the Gumroad covers."""
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    r = np.sqrt(((xx - w / 2) / (w * 0.8)) ** 2 + ((yy - h * cy) / (h * 0.55)) ** 2)
    a = np.clip(1 - r, 0, 1) ** 1.6 * 0.20
    img = np.zeros((h, w, 3), np.float32)
    img[:] = BG
    img += a[..., None] * np.array([255, 120, 40], np.float32)
    return Image.fromarray(np.clip(img, 0, 255).astype(np.uint8))

def pill(text, sz, max_w):
    check(text)
    f = font(sz)
    lines = wrap(text, f, max_w - 80)
    lh = int(sz * 1.2)
    w = int(max(f.getlength(l) for l in lines)) + 80
    h = lh * len(lines) + 44
    im = Image.new('RGBA', (w, h + 8), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, w - 1, h + 7], radius=22, fill=(16, 8, 12, 235))
    bar = slice_bar(w, 8).convert('RGBA')
    mask = Image.new('L', (w, 8), 255)
    im.paste(bar, (0, h), mask)
    y = 24
    for l in lines:
        d.text(((w - f.getlength(l)) / 2, y), l, font=f, fill=CREAM + (255,))
        y += lh
    # round the bottom corners back off the slice bar
    m = Image.new('L', im.size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, w - 1, h + 7], radius=22, fill=255)
    im.putalpha(Image.fromarray(np.minimum(np.array(im.split()[3]), np.array(m))))
    return im

def fit(img, w):
    h = round(img.height * w / img.width)
    return img.resize((w, h), Image.LANCZOS)

def src(i):
    i = max(0, min(NSRC - 1, int(round(i))))
    im = Image.open(os.path.join(FR, f'f{i:05d}.jpg')).convert('RGB')
    # A low-res preview run still composes: the camera works in full-size pixels.
    want = 1688 if SCENE == 'phone' else 1920
    return im if im.width == want else fit(im, want)

def cue_at(t):
    """The caption showing at source second t."""
    cur = None
    for c in CUES:
        if c['at'] <= t + 1e-6:
            cur = c
    return cur

def cue_start(cid):
    return next(c['at'] for c in CUES if c['id'] == cid)

# ---- the camera: follows the Ghost, smoothly -------------------------------
def smooth(xs, sigma):
    xs = np.asarray(xs, np.float32)
    k = np.arange(-3 * sigma, 3 * sigma + 1)
    w = np.exp(-(k ** 2) / (2 * sigma ** 2)); w /= w.sum()
    pad = np.pad(xs, (3 * sigma, 3 * sigma), mode='edge')
    return np.convolve(pad, w, mode='valid')

# The work area under the logo banner and pads, above the player bar.
CROP_TOP, CROP_BOT = 300, 985
FULL_H = CROP_BOT - CROP_TOP
ASPECT = 3 / 2                       # the app window in the vertical video
FULL_W = int(FULL_H * ASPECT)
# Per scene, per step: how wide the camera is, and where it looks ('cursor' or a fixed x).
# Tight on typing and clicks, wide when there is something to read.
GR = {'artist': (700, 420), 'study': (820, 'cursor'), 'topic': (700, 'cursor'),
      'write': (FULL_W, 842), 'send': (820, 'cursor')}
SPECS = {
    'ghost': {**GR, 'songwriter': (FULL_W, 'cursor'),
              'studio': (760, 'cursor'), 'pull': (900, 'cursor'), 'caption': (FULL_W, 'cursor'),
              'make': (820, 'cursor'), 'wait': (820, 'cursor'), 'song': (900, 'cursor')},
    'suno': {**GR, 'tags': (FULL_W, 842), 'copy': (820, 'cursor'), 'songwriter': (760, 'cursor')},
    'matrix': {'seeds': (820, 'cursor'), 'load': (900, 'cursor'), 'craft': (FULL_W, 'cursor'),
               'heat': (FULL_W, 560), 'verses': (FULL_W, 560)},
    'tour': {},                      # every step: the left of the tab, where its title and controls start
    'phone': {},
}
SCENE = None

def load(scene):
    """Point every frame, cue and camera helper at one recorded scene."""
    global SCENE, FR, FPS, NSRC, CUES, TRACK, SCALE, CX, CY, CW, END
    if SCENE == scene:
        return
    sfx = '' if scene == 'ghost' else f'-{scene}'
    meta = json.load(open(os.path.join(D, f'cues{sfx}.json')))
    if meta.get('failed'):
        raise SystemExit(f'{scene}: the recording failed ({meta["failed"]})')
    SCENE, FR = scene, os.path.join(D, f'frames{sfx}')
    FPS, NSRC, CUES = meta['fps'], meta['frames'], meta['cues']
    TRACK = json.load(open(os.path.join(D, f'track{sfx}.json')))
    SCALE = (1688 if scene == 'phone' else 1920) / TRACK['vw']
    END = NSRC / FPS
    spec = SPECS[scene]
    _cx, _cy, _w = [], [], []
    for i, (x, y) in enumerate(TRACK['track']):
        c = cue_at(i / FPS)
        w, look = spec.get(c['id'] if c else '', (FULL_W, 600) if scene == 'tour' else (820, 'cursor'))
        _cx.append(x * SCALE + 60 if look == 'cursor' else look)
        _cy.append(y * SCALE)
        _w.append(w)
    CX, CY, CW = smooth(_cx, 16), smooth(_cy, 16), smooth(_w, 12)

def crop_box(i):
    i = max(0, min(len(CX) - 1, int(round(i))))
    w = min(FULL_W, CW[i]); h = w / ASPECT
    x0 = float(np.clip(CX[i] - w / 2, 0, 1920 - w))
    y0 = float(np.clip(CY[i] - h / 2, CROP_TOP, CROP_BOT - h))
    return (int(x0), int(y0), int(x0 + w), int(y0 + h))

# ---- encoder ----------------------------------------------------------------
def encoder(path, w, h):
    return subprocess.Popen(
        ['ffmpeg', '-y', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{w}x{h}', '-r', str(FPS),
         '-i', '-', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p',
         '-movflags', '+faststart', path], stdin=subprocess.PIPE)

def fade(a, b, t):
    return Image.blend(a, b, t)

# ---- vertical ---------------------------------------------------------------
VW, VH = 1080, 1920
V_BG = backdrop(VW, VH, 0.42)
V_APP_Y = 620
V_APP_H = int(VW / ASPECT)

def v_brand():
    lg = fit(LOGO, 120)
    f = font(40)
    t1, t2 = 'Lyricist Pro', '$19.99 once  ·  link in bio'
    w = lg.width + 28 + int(max(f.getlength(t1), font(30).getlength(t2)))
    layer = Image.new('RGBA', (VW, 150), (0, 0, 0, 0))
    x = (VW - w) // 2
    layer.alpha_composite(lg, (x, (150 - lg.height) // 2))
    d = ImageDraw.Draw(layer)
    d.text((x + lg.width + 28, 26), t1, font=f, fill=CREAM + (255,))
    d.text((x + lg.width + 28, 82), t2, font=font(30), fill=AMBER + (255,))
    return layer
V_BRAND = v_brand()

def v_outro(tag):
    im = V_BG.copy().convert('RGBA')
    lg = fit(LOGO, 560)
    im.alpha_composite(lg, ((VW - lg.width) // 2, 230))
    im.alpha_composite(glow_text((VW, 150), 'Lyricist Pro', 96), (0, 860))
    im.alpha_composite(glow_text((VW, 120), 'Songwriting studio for Windows, iPhone and Android', 40, fill=AMBER, glow=(0, 0, 0), width=900), (0, 1000))
    im.alpha_composite(glow_text((VW, 120), '$19.99. Once.', 84, fill=ORANGE), (0, 1130))
    im.alpha_composite(glow_text((VW, 140), tag, 40, fill=CREAM, glow=(0, 0, 0), width=920), (0, 1250))
    im.paste(slice_bar(VW, 12), (0, VH - 12))
    return im.convert('RGB')

def v_frame(si, hook_layer, cap_layer):
    im = V_BG.copy().convert('RGBA')
    if hook_layer is not None:
        im.alpha_composite(hook_layer, (0, 170))
    app = src(si).crop(crop_box(si)).resize((VW, V_APP_H), Image.LANCZOS)
    im.paste(app, (0, V_APP_Y))
    im.paste(slice_bar(VW, 10), (0, V_APP_Y + V_APP_H))
    im.alpha_composite(V_BRAND, (0, V_APP_Y + V_APP_H + 40))
    if cap_layer is not None:
        im.alpha_composite(cap_layer, ((VW - cap_layer.width) // 2, V_APP_Y - cap_layer.height - 18))
    return im.convert('RGB')

# The phone version is filmed sideways, so it sits in a sideways phone.
P_W = 1000
P_H = round(P_W * 780 / 1688)
P_BEZ = 22

def p_body():
    w, h = P_W + 2 * P_BEZ, P_H + 2 * P_BEZ
    im = Image.new('RGBA', (w + 40, h + 40), (0, 0, 0, 0))
    glow = Image.new('RGBA', im.size, (0, 0, 0, 0))
    ImageDraw.Draw(glow).rounded_rectangle([20, 20, 20 + w, 20 + h], radius=64, fill=(255, 120, 40, 120))
    im.alpha_composite(glow.filter(ImageFilter.GaussianBlur(18)))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([20, 20, 20 + w, 20 + h], radius=64, fill=(14, 12, 16, 255), outline=(70, 62, 66, 255), width=3)
    d.rounded_rectangle([20 + 8, 20 + 8, 20 + w - 8, 20 + h - 8], radius=56, outline=(34, 30, 34, 255), width=2)
    # the camera island, on the left edge when the phone is sideways
    d.rounded_rectangle([20 + 7, 20 + h // 2 - 46, 20 + 17, 20 + h // 2 + 46], radius=5, fill=(0, 0, 0, 255))
    return im
P_BODY = p_body()
P_MASK = Image.new('L', (P_W, P_H), 0)
ImageDraw.Draw(P_MASK).rounded_rectangle([0, 0, P_W - 1, P_H - 1], radius=42, fill=255)

def p_frame(si, hook_layer, cap_layer):
    im = V_BG.copy().convert('RGBA')
    if hook_layer is not None:
        im.alpha_composite(hook_layer, (0, 170))
    x = (VW - P_BODY.width) // 2
    y = V_APP_Y + (V_APP_H - P_BODY.height) // 2
    im.alpha_composite(P_BODY, (x, y))
    im.paste(src(si).resize((P_W, P_H), Image.LANCZOS), (x + 20 + P_BEZ, y + 20 + P_BEZ), P_MASK)
    im.paste(slice_bar(VW, 10), (0, V_APP_Y + V_APP_H))
    im.alpha_composite(V_BRAND, (0, V_APP_Y + V_APP_H + 40))
    if cap_layer is not None:
        im.alpha_composite(cap_layer, ((VW - cap_layer.width) // 2, V_APP_Y - cap_layer.height - 18))
    return im.convert('RGB')

def vertical(name, s0, s1, speed, hook=None, story=None, captions=True, tag='Link in bio', outro_s=3.5):
    out = os.path.join(OUT, f'{name}.mp4')
    enc = encoder(out, VW, VH)
    n = int((s1 - s0) * FPS / speed)
    hook_l = glow_text((VW, 300), hook, 66, width=960) if hook else None
    story_l = [glow_text((VW, 300), s, 54, width=960) for s in (story or [])]
    caps = {}
    last = None
    for k in range(n):
        si = s0 * FPS + k * speed
        t = si / FPS
        c = cue_at(t) if captions else None
        cl = None
        if c:
            if c['id'] not in caps:
                caps[c['id']] = pill(c['text'], 40, 980)
            cl = caps[c['id']]
        hl = hook_l
        if story_l:
            hl = story_l[min(len(story_l) - 1, int(k / n * len(story_l)))]
        last = (p_frame if SCENE == 'phone' else v_frame)(si, hl, cl)
        enc.stdin.write(last.tobytes())
    end = v_outro(tag)
    fn = int(0.4 * FPS)
    for k in range(int(outro_s * FPS)):
        enc.stdin.write((fade(last, end, (k + 1) / fn) if k < fn else end).tobytes())
    enc.stdin.close(); enc.wait()
    print(name, f'{n / FPS + outro_s:.1f}s')

# ---- horizontal (YouTube) ---------------------------------------------------
HW, HH = 1920, 1080
H_BG = backdrop(HW, HH, 0.45)

def h_card(intro):
    im = H_BG.copy().convert('RGBA')
    if intro:
        g = fit(GHOST, 230)
        im.alpha_composite(g, ((HW - g.width) // 2, 200))
        im.alpha_composite(glow_text((HW, 240), 'Watch the Ghost\nwrite a song.', 92), (0, 450))
        im.alpha_composite(glow_text((HW, 80), 'Lyricist Pro · Black Hole Studios', 40, fill=AMBER, glow=(0, 0, 0)), (0, 700))
    else:
        lg = fit(LOGO, 360)
        im.alpha_composite(lg, ((HW - lg.width) // 2, 90))
        im.alpha_composite(glow_text((HW, 120), 'Lyricist Pro', 88), (0, 490))
        im.alpha_composite(glow_text((HW, 70), 'Songwriting studio for Windows, iPhone and Android', 38, fill=AMBER, glow=(0, 0, 0)), (0, 610))
        im.alpha_composite(glow_text((HW, 110), '$19.99. Once.', 76, fill=ORANGE), (0, 690))
        im.alpha_composite(glow_text((HW, 70), 'Not a month. Not a year. Once.  ·  On Gumroad', 34, fill=CREAM, glow=(0, 0, 0)), (0, 800))
    im.paste(slice_bar(HW, 10), (0, HH - 10))
    return im.convert('RGB')

def horizontal(name, speed=1.0):
    out = os.path.join(OUT, f'{name}.mp4')
    enc = encoder(out, HW, HH)
    intro, outro = h_card(True), h_card(False)
    for k in range(int(2.6 * FPS)):
        enc.stdin.write(intro.tobytes())
    fn = int(0.4 * FPS)
    n = int(NSRC / speed)
    caps = {}
    last = None
    for k in range(n):
        si = k * speed
        im = src(si).convert('RGBA')
        c = cue_at(si / FPS)
        if c:
            if c['id'] not in caps:
                caps[c['id']] = pill(c['text'], 44, 1500)
            p = caps[c['id']]
            im.alpha_composite(p, ((HW - p.width) // 2, HH - p.height - 70))
        last = im.convert('RGB')
        enc.stdin.write((fade(intro, last, (k + 1) / fn) if k < fn else last).tobytes())
    for k in range(int(4.5 * FPS)):
        enc.stdin.write((fade(last, outro, (k + 1) / fn) if k < fn else outro).tobytes())
    enc.stdin.close(); enc.wait()
    print(name, f'{2.6 + n / FPS + 4.5:.1f}s')

# ---- the price: kinetic text over the 18-tool tour --------------------------
def price(name):
    load('tour')
    out = os.path.join(OUT, f'{name}.mp4')
    enc = encoder(out, VW, VH)
    def dim(si):
        a = src(si).crop(crop_box(si)).resize((VW, V_APP_H), Image.LANCZOS).filter(ImageFilter.GaussianBlur(10))
        im = V_BG.copy()
        im.paste(Image.blend(a, Image.new('RGB', a.size, BG), 0.62), (0, V_APP_Y))
        return im.convert('RGBA')
    def card(si, text, sz, fill=CREAM, pop=1.0):
        im = dim(si)
        t = glow_text((VW, 700), text, sz, fill=fill, width=960)
        if pop != 1.0:
            t = t.resize((round(VW * pop), round(700 * pop)), Image.LANCZOS)
        im.alpha_composite(t, ((VW - t.width) // 2, 610 + (700 - t.height) // 2))
        return im.convert('RGB')
    frames = []
    beats = [('Another app.\nAnother monthly bill.', 76, CREAM, 2.4), ('Not this one.', 84, CREAM, 1.6),
             ('$19.99\nOnce.', 150, ORANGE, 2.6)]
    t0 = 0
    for text, sz, fill, secs in beats:
        n = int(secs * FPS)
        for k in range(n):
            pop = 1.0 + 0.25 * max(0, 1 - k / 6) if fill == ORANGE else 1.0
            frames.append(card((t0 + k) * 2, text, sz, fill, pop))
        t0 += n
    hook = glow_text((VW, 300), '18 tools. One price.', 72, width=960)
    for c in CUES:
        si = (c['at'] + 0.9) * FPS
        cap = pill(c['text'], 40, 980)
        for k in range(10):
            frames.append(v_frame(si + k, hook, cap))
    for k in range(int(2.2 * FPS)):
        frames.append(card(k, 'Windows, iPhone\nand Android.', 84))
    for f in frames:
        enc.stdin.write(f.tobytes())
    last = frames[-1]
    end = v_outro('Link in bio')
    fn = int(0.4 * FPS)
    for k in range(int(3.5 * FPS)):
        enc.stdin.write((fade(last, end, (k + 1) / fn) if k < fn else end).tobytes())
    enc.stdin.close(); enc.wait()
    print(name, f'{len(frames) / FPS + 3.5:.1f}s')

def scene(name, fn):
    """A clip that needs one recorded scene loaded first."""
    def run():
        load(name)
        fn()
    return run

CLIPS = {
    'tiktok-1-ghost-writes-a-song': scene('ghost', lambda: vertical('tiktok-1-ghost-writes-a-song', 0, END, 1.6,
        hook='Watch the Ghost write a song')),
    'tiktok-2-any-artist': scene('ghost', lambda: vertical('tiktok-2-any-artist', 0, cue_start('songwriter') + 1.2, 1.25,
        hook='Name any artist. Get brand-new lyrics in their style.', outro_s=3.0)),
    'tiktok-3-full-band': scene('ghost', lambda: vertical('tiktok-3-full-band', cue_start('studio'), END, 1.2,
        hook='Your lyrics. Sung by a full band.', outro_s=3.0)),
    'tiktok-4-my-story': scene('ghost', lambda: vertical('tiktok-4-my-story', 0, END, 1.5, captions=False, story=[
        "I'm a singer-songwriter.",
        'Everything I wanted cost so much money.',
        'So I taught myself to code and built it myself.',
        'I use Suno too. I build my lyrics and Suno tags here first.',
        "Now I'm passing the savings on to you.",
    ], tag='Link in bio', outro_s=4.0)),
    'youtube-promo-16x9': scene('ghost', lambda: horizontal('youtube-promo-16x9')),
    'tiktok-5-suno-tags': scene('suno', lambda: vertical('tiktok-5-suno-tags', 0, END, 1.4,
        hook='Writing for Suno? Get the lyrics AND the tags.')),
    'tiktok-6-the-matrix': scene('matrix', lambda: vertical('tiktok-6-the-matrix', 0, END, 1.2,
        hook='Build a verse out of word tiles.')),
    'tiktok-7-18-tools': scene('tour', lambda: vertical('tiktok-7-18-tools', 0, END, 1.5,
        hook='18 songwriting tools. One app.')),
    'tiktok-8-on-your-phone': scene('phone', lambda: vertical('tiktok-8-on-your-phone', 0, END, 1.2,
        hook='Your songwriting studio. On your phone.')),
    'tiktok-9-the-price': lambda: price('tiktok-9-the-price'),
    'tiktok-10-comment-game': scene('ghost', lambda: vertical('tiktok-10-comment-game', 0, cue_start('songwriter') + 1.2, 1.3,
        hook="Comment an artist and a topic. I'll write the song.", tag='Comment an artist + a topic', outro_s=3.0)),
}

if __name__ == '__main__':
    for name in (sys.argv[1:] or CLIPS):
        CLIPS[name]()
