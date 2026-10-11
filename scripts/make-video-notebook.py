"""Writes resources/kaggle-lyric-video.ipynb. Edit the cells here, then:  python scripts/make-video-notebook.py resources/kaggle-lyric-video.ipynb"""
import json, sys

OUT = sys.argv[1]
cells = []
def md(s): cells.append({"cell_type": "markdown", "metadata": {}, "source": s.strip("\n")})
def code(s): cells.append({"cell_type": "code", "metadata": {}, "execution_count": None, "outputs": [], "source": s.strip("\n") + "\n"})

md(r'''
# Make the lyric video

Lyricist runs this for you when you press **Make the video** on a take. You never need to open it.

What it makes from one finished song:

- a 16:9 lyric video: the pictures change on the downbeats and each word lights up as it is sung
- vertical 9:16 chorus clips for Shorts, Reels and TikTok
- `.lrc` and `.srt` synced lyric files

It needs **GPU T4 x2** and **Internet on**. Lyricist sets both when it sends it.
''')

md("## Step 1: check the computer")
code(r'''
import subprocess, torch
subprocess.run("nvidia-smi --query-gpu=name,memory.total --format=csv", shell=True)
print("torch", torch.__version__, "| cuda", torch.version.cuda, "| GPUs", torch.cuda.device_count())
assert torch.cuda.is_available(), "No GPU. Set Accelerator to 'GPU T4 x2' and restart the session."
''')

md(r'''
---
# THE SONG
---
Lyricist fills this box in. **AUDIO_NAME** is the song it uploaded, **LYRICS** are the words
on screen, **CAPTION** is the sound of the song, which the pictures are painted from.
''')
code(r'''
AUDIO_NAME = "song.flac"   # the file Lyricist uploaded to your Kaggle account
OUT_NAME   = "song"        # what the finished files are called

LYRICS = """[Verse]
Steel guitar ringing down the hall
Pictures hanging crooked on the wall

[Chorus]
Turn it up and let it play
We were never built to stay
"""

CAPTION = """Warm soul, 92 BPM, live band, a dusty basement session."""

LANGUAGE = "en"
HF_TOKEN = ""   # filled in by Lyricist when you have one saved. Optional.
''')

md(r'''
## Step 2: get everything ready

Finds the song, and the picture and timing models Lyricist saved into your Kaggle account
(a notebook called **Lyricist Video Models**). Anything not saved yet is downloaded.
''')
code(r'''
import os, sys, re, json, shutil, subprocess, importlib, hashlib

INPUT   = os.environ.get("LYRICIST_INPUT", "/kaggle/input")
WORKING = os.environ.get("LYRICIST_WORKING", "/kaggle/working")
TEMP    = os.environ.get("LYRICIST_TEMP", "/kaggle/temp/video")
MODELS  = os.path.join(TEMP, "models")
for d in (WORKING, TEMP, MODELS):
    os.makedirs(d, exist_ok=True)

# The two models. Lyricist reads these three lines to build the notebook that
# saves them into your account once, so keep their shape.
SDXL_REPO   = "stabilityai/stable-diffusion-xl-base-1.0"
SDXL_FILE   = "sd_xl_base_1.0.safetensors"
WHISPER_URL = "https://openaipublic.azureedge.net/main/whisper/models/345ae4da62f9b3d59415adc60127b97c714f32e89e936602e85993674d08dcb1/medium.pt"

def have(mod):
    try:
        importlib.import_module(mod)
        return True
    except Exception:
        return False

def pip(*pkgs):
    # Holding huggingface_hub where Kaggle has it stops pip from upgrading it
    # under transformers to satisfy a newer diffusers.
    hold = []
    try:
        import huggingface_hub
        hold = [f"huggingface_hub=={huggingface_hub.__version__}"]
    except Exception:
        pass
    print("installing", " ".join(pkgs))
    subprocess.run([sys.executable, "-m", "pip", "install", "-q", *pkgs, *hold], check=False)

need = [pkg for mod, pkg in (("stable_whisper", "stable-ts==2.19.1"), ("demucs", "demucs==4.1.0"),
                              ("diffusers", "diffusers"), ("librosa", "librosa"), ("soundfile", "soundfile"))
        if not have(mod)]
if need:
    pip(*need)
    importlib.invalidate_caches()

# ffmpeg with libass, which is what draws the words.
def has_ass(exe):
    try:
        out = subprocess.run([exe, "-hide_banner", "-filters"], capture_output=True, text=True, timeout=60).stdout
        return re.search(r"\sass\s", out) is not None
    except Exception:
        return False

FFMPEG = shutil.which("ffmpeg")
if not FFMPEG or not has_ass(FFMPEG):
    pip("imageio-ffmpeg")
    import imageio_ffmpeg
    FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
assert has_ass(FFMPEG), "This ffmpeg cannot draw subtitles (no libass)."
print("ffmpeg:", FFMPEG)

def find_input(name):
    """Anything attached to this run, wherever Kaggle mounted it."""
    for root, _, files in os.walk(INPUT):
        if name in files:
            path = os.path.join(root, name)
            if os.path.exists(path):
                return path
    return None

AUDIO = find_input(AUDIO_NAME)
assert AUDIO, f"Lyricist uploaded {AUDIO_NAME} but it is not attached to this run. Press Make the video again."
print("song:", AUDIO)

if HF_TOKEN.strip():
    try:
        from huggingface_hub import login
        login(HF_TOKEN.strip())
    except Exception:
        print("Hugging Face token not accepted, downloading without it.")

SDXL = find_input(SDXL_FILE)
if SDXL:
    print("picture model: saved copy")
else:
    from huggingface_hub import hf_hub_download
    print("picture model: downloading (about 7 GB, once)")
    SDXL = hf_hub_download(repo_id=SDXL_REPO, filename=SDXL_FILE, local_dir=MODELS)

WHISPER = find_input(os.path.basename(WHISPER_URL)) or "medium"
print("timing model:", "saved copy" if WHISPER != "medium" else "downloading")

import librosa
DURATION = float(librosa.get_duration(path=AUDIO))
print(f"length: {DURATION:.1f}s")
''')

md(r'''
## Step 3: the words, and the singing on its own

Reads the lyrics into parts and lines, then lifts the vocal out of the mix so the timing
step hears the singer, not the band.
''')
code(r'''
SECTION_RE = re.compile(r"^\s*\[([^\]]+)\]\s*$")
sections = []                      # {"name": "Chorus", "lines": [...]}
for raw in LYRICS.splitlines():
    m = SECTION_RE.match(raw)
    if m:
        sections.append({"name": m.group(1).strip(), "lines": []})
        continue
    line = " ".join(re.sub(r"\[[^\]]*\]", " ", raw).split())
    if not line:
        continue
    if not sections:
        sections.append({"name": "Verse", "lines": []})
    sections[-1]["lines"].append(line)
if not sections:
    sections = [{"name": "Song", "lines": []}]
LINES = [(si, line) for si, s in enumerate(sections) for line in s["lines"]]
assert LINES, "There are no lyrics to put on screen."
print(len(sections), "parts,", len(LINES), "lines")

VOCALS = AUDIO
try:
    import numpy as np, soundfile as sf, torch
    from demucs.pretrained import get_model
    from demucs.apply import apply_model
    sep = get_model("htdemucs")
    sep.eval()
    wav, _ = librosa.load(AUDIO, sr=sep.samplerate, mono=False)
    if wav.ndim == 1:
        wav = np.stack([wav, wav])
    wav = torch.from_numpy(np.ascontiguousarray(wav[:2])).float()
    ref = wav.mean(0)
    mean, std = ref.mean(), ref.std() + 1e-8
    dev = "cuda:0" if torch.cuda.is_available() else "cpu"
    with torch.no_grad():
        stems = apply_model(sep, ((wav - mean) / std)[None], device=dev, split=True, overlap=0.25, progress=False)[0]
    vocals = (stems[sep.sources.index("vocals")] * std + mean).cpu().numpy()
    VOCALS = os.path.join(TEMP, "vocals.wav")
    sf.write(VOCALS, vocals.T, sep.samplerate)
    del sep, stems
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
    print("vocal lifted out of the mix")
except Exception as e:
    print("Could not lift the vocal out, timing the words against the whole mix:", e)
''')

md(r'''
## Step 4: when every word is sung

Lines the words up against the singing, word by word. If that fails the words are spread
over the sung part of the song instead, so a video still comes out.
''')
code(r'''
import numpy as np

def spread(words, a, b):
    """Words across a..b, longer words taking longer."""
    if not words:
        return []
    weights = [max(1, len(w)) for w in words]
    total = float(sum(weights))
    out, t = [], a
    for w, k in zip(words, weights):
        d = (b - a) * k / total
        out.append((w, t, t + d))
        t += d
    return out

def aligned_lines():
    import stable_whisper, torch
    dev = "cuda:0" if torch.cuda.is_available() else "cpu"
    model = stable_whisper.load_model(WHISPER, device=dev, download_root=MODELS)
    audio16, _ = librosa.load(VOCALS, sr=16000, mono=True)
    text = "\n".join(line for _, line in LINES)
    result = model.align(audio16, text, language=LANGUAGE or "en", original_split=True)
    del model
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
    segs = list(getattr(result, "segments", None) or [])
    def got(seg):
        return [(w.word.strip(), float(w.start), float(w.end)) for w in (seg.words or []) if str(w.word).strip()]
    if len(segs) == len(LINES):
        return [got(s) for s in segs]
    # The line breaks did not survive: share the timed words out by word count.
    flat = [w for s in segs for w in got(s)]
    counts = [len(line.split()) for _, line in LINES]
    scale = len(flat) / float(max(1, sum(counts)))
    per, i = [], 0
    for c in counts:
        n = max(1, int(round(c * scale)))
        per.append(flat[i:i + n])
        i += n
    return per

TIMED_BY = "the singing"
try:
    per_line = aligned_lines()
except Exception as e:
    print("Word timing failed, spreading the words over the sung part instead:", e)
    TIMED_BY = "an even spread"
    per_line = [[] for _ in LINES]

# Our own words on screen, the timings from the singing.
TIMES = []
for (si, line), got in zip(LINES, per_line):
    words = line.split()
    if got:
        a, b = max(0.0, got[0][1]), min(DURATION, max(got[-1][2], got[0][1] + 0.2))
        if len(got) == len(words):
            ws = [(w, max(0.0, s), min(DURATION, max(e, s + 0.05))) for w, (_, s, e) in zip(words, got)]
        else:
            ws = spread(words, a, b)
        TIMES.append({"si": si, "text": line, "words": ws})
    else:
        TIMES.append({"si": si, "text": line, "words": []})

# Untimed lines go evenly between their timed neighbours; with none timed at all,
# over the stretch where the vocal is loud.
if not any(t["words"] for t in TIMES):
    y16, _ = librosa.load(VOCALS, sr=16000, mono=True)
    rms = librosa.feature.rms(y=y16, frame_length=2048, hop_length=512)[0]
    loud = np.where(rms > 0.15 * (rms.max() or 1))[0]
    a = float(librosa.frames_to_time(loud[0], sr=16000, hop_length=512)) if len(loud) else DURATION * 0.08
    b = float(librosa.frames_to_time(loud[-1], sr=16000, hop_length=512)) if len(loud) else DURATION * 0.92
    counts = [len(t["text"].split()) for t in TIMES]
    total, cur = float(sum(counts)), a
    for t, c in zip(TIMES, counts):
        d = (b - a) * c / total
        t["words"] = spread(t["text"].split(), cur, cur + d * 0.9)
        cur += d
else:
    i = 0
    while i < len(TIMES):
        if TIMES[i]["words"]:
            i += 1
            continue
        j = i
        while j < len(TIMES) and not TIMES[j]["words"]:
            j += 1
        a = TIMES[i - 1]["words"][-1][2] + 0.2 if i > 0 else max(0.0, TIMES[j]["words"][0][1] - 3.0 * (j - i)) if j < len(TIMES) else 0.0
        b = TIMES[j]["words"][0][1] - 0.2 if j < len(TIMES) else min(DURATION, a + 3.0 * (j - i))
        b = max(b, a + 0.5 * (j - i))
        step = (b - a) / (j - i)
        for k in range(i, j):
            t0 = a + (k - i) * step
            TIMES[k]["words"] = spread(TIMES[k]["text"].split(), t0, t0 + step * 0.9)
        i = j

# Never backwards in time.
last = 0.0
for t in TIMES:
    fixed = []
    for w, s, e in t["words"]:
        s = max(s, last)
        e = max(e, s + 0.05)
        fixed.append((w, s, e))
        last = s
    t["words"] = fixed
    t["start"], t["end"] = fixed[0][1], fixed[-1][2]
print(f"{len(TIMES)} lines timed by {TIMED_BY}")
''')

md(r'''
## Step 5: the beat, the parts and the picture plan

Finds the beats and which of them are the downbeats, puts each part of the song on a downbeat,
and plans a picture change every four bars, always on a downbeat.
''')
code(r'''
y, sr = librosa.load(AUDIO, sr=22050, mono=True)
tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
BPM = float(np.atleast_1d(tempo)[0]) if np.size(tempo) else 0.0
beats = librosa.frames_to_time(beat_frames, sr=sr)
# The downbeat is the beat in four where the kick lands hardest.
low = librosa.onset.onset_strength(y=y, sr=sr, fmax=250, n_mels=16)
if len(beats) >= 8:
    hits = low[np.clip(beat_frames, 0, len(low) - 1)]
    phase = int(np.argmax([hits[p::4].mean() for p in range(4)]))
    DOWNBEATS = beats[phase::4]
else:
    DOWNBEATS = np.array([])
if len(DOWNBEATS) < 4:
    DOWNBEATS = np.arange(0.0, DURATION, 2.0)
BAR = float(np.median(np.diff(DOWNBEATS))) if len(DOWNBEATS) > 1 else 2.0
print(f"{BPM:.0f} BPM, {len(DOWNBEATS)} bars of {BAR:.2f}s")

# Where each part starts: its first sung word, pulled back to the downbeat it
# lands in. A part with no words starts on the first downbeat after the last word.
first, last_end = {}, {}
for t in TIMES:
    first.setdefault(t["si"], t["start"])
    last_end[t["si"]] = t["end"]
bounds, prev_end = [], 0.0
for si in range(len(sections)):
    if si == 0:
        start = 0.0
    elif si in first:
        start = first[si]
        before = DOWNBEATS[DOWNBEATS <= start + 0.25]
        if len(before) and start - before[-1] <= BAR * 1.05:
            start = float(before[-1])
    else:
        after = DOWNBEATS[DOWNBEATS >= prev_end + 0.1]
        start = float(after[0]) if len(after) else prev_end + 0.5
    prev_end = last_end.get(si, prev_end)
    if bounds and start < bounds[-1][1] + 1.0:
        continue                                     # too close to the last one: same picture run
    if start >= DURATION - 1.0:
        continue
    bounds.append((si, start))
SPANS = [(si, a, bounds[k + 1][1] if k + 1 < len(bounds) else DURATION) for k, (si, a) in enumerate(bounds)]

def style_words(caption):
    text = re.sub(r"(Global Metadata|Basic Attributes|Vocal Details|Arrangement|Instrumentation|Mood)\s*:", " ", caption, flags=re.I)
    text = re.sub(r"\b\d+\s*BPM\b|\bbpm is \d+\b|\b[A-G](#|b)?\s*(major|minor)\b", " ", text, flags=re.I)
    first_sentence = re.split(r"(?<=[.!?])\s+", " ".join(text.split()))[0]
    return " ".join(first_sentence.split()[:25]).strip(" ,.")

STYLE = style_words(CAPTION)
SHOTS = ["wide establishing shot", "close-up detail shot"]
NEGATIVE = "text, words, letters, caption, subtitles, watermark, logo, signature, blurry, lowres, deformed hands, extra fingers, cropped"
BASE_SEED = int(hashlib.sha1(OUT_NAME.encode()).hexdigest()[:8], 16) % 1000000

def prompt_for(si, variant):
    s = sections[si]
    hint = s["lines"][0] if s["lines"] else f"the {s['name'].lower()} of a song, pure mood and atmosphere"
    parts = ["music video still", hint, STYLE, SHOTS[variant % 2],
             "cinematic lighting, 35mm film photograph, rich color, highly detailed"]
    return ", ".join(p for p in parts if p)

MAX_PICS, CHUNK_BARS = 24, 4
def plan(per_part):
    pics, cuts = [], []
    for si, a, b in SPANS:
        n = 2 if (per_part == 2 and b - a >= 16) else 1
        ids = []
        for v in range(n):
            ids.append(len(pics))
            pics.append({"prompt": prompt_for(si, v), "seed": BASE_SEED + len(pics)})
        # One picture holds the whole part; two swap every four bars, on the downbeat.
        inside = DOWNBEATS[(DOWNBEATS > a + 0.5) & (DOWNBEATS < b - 0.5)] if n > 1 else []
        points = [a] + [float(x) for x in inside[CHUNK_BARS - 1::CHUNK_BARS]] + [b]
        merged = [points[0]]
        for p in points[1:-1]:
            if p - merged[-1] >= 2.0 and b - p >= 2.0:
                merged.append(p)
        merged.append(b)
        for k in range(len(merged) - 1):
            cuts.append((merged[k], merged[k + 1], ids[k % len(ids)]))
    return pics, cuts

PICS, PLAN = plan(2)
if len(PICS) > MAX_PICS:
    PICS, PLAN = plan(1)
if len(PICS) > MAX_PICS:
    PLAN = [(a, b, i % MAX_PICS) for a, b, i in PLAN]
    PICS = PICS[:MAX_PICS]
print(f"{len(SPANS)} parts on screen, {len(PICS)} pictures, {len(PLAN)} picture changes")
''')

md(r'''
## Step 6: paint the pictures

One or two pictures per part of the song, painted from its sound and its first line.
Both graphics cards paint at once.
''')
code(r'''
import threading, torch
from PIL import Image, ImageDraw

PIC_DIR = os.path.join(TEMP, "pictures")
os.makedirs(PIC_DIR, exist_ok=True)
W_IMG, H_IMG = 1344, 768
pic_path = lambda i: os.path.join(PIC_DIR, f"pic{i:02d}.png")

def paint_all():
    from diffusers import StableDiffusionXLPipeline
    devices = [f"cuda:{i}" for i in range(min(2, torch.cuda.device_count()))] or ["cpu"]
    pipes = []
    for dev in devices:                          # one at a time: two 7 GB loads at once can run the RAM out
        dtype = torch.float16 if dev.startswith("cuda") else torch.float32
        pipe = StableDiffusionXLPipeline.from_single_file(SDXL, torch_dtype=dtype).to(dev)
        pipe.set_progress_bar_config(disable=True)
        pipes.append((dev, pipe))
    errors = []
    def work(dev, pipe, jobs):
        for i in jobs:
            try:
                g = torch.Generator(device=dev).manual_seed(PICS[i]["seed"])
                img = pipe(prompt=PICS[i]["prompt"], negative_prompt=NEGATIVE, width=W_IMG, height=H_IMG,
                           num_inference_steps=25, guidance_scale=6.0, generator=g).images[0]
                img.save(pic_path(i))
                print(f"picture {i + 1} of {len(PICS)} painted")
            except Exception as e:
                errors.append(f"picture {i + 1}: {e}")
    threads = [threading.Thread(target=work, args=(dev, pipe, list(range(k, len(PICS), len(pipes)))))
               for k, (dev, pipe) in enumerate(pipes)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    for e in errors:
        print(e)
    del pipes
    if torch.cuda.is_available():
        torch.cuda.empty_cache()

try:
    paint_all()
except Exception as e:
    print("The picture model did not load:", e)

# A picture that did not come out borrows the nearest one that did; with none
# at all, a plain colour wash, so the video still gets made.
made = [i for i in range(len(PICS)) if os.path.exists(pic_path(i))]
for i in range(len(PICS)):
    if os.path.exists(pic_path(i)):
        continue
    if made:
        shutil.copy(pic_path(min(made, key=lambda m: abs(m - i))), pic_path(i))
    else:
        h = (BASE_SEED + i * 47) % 360
        img = Image.new("RGB", (W_IMG, H_IMG))
        draw = ImageDraw.Draw(img)
        import colorsys
        for yy in range(H_IMG):
            r, g, b = colorsys.hsv_to_rgb(((h + yy * 40 / H_IMG) % 360) / 360, 0.55, 0.18 + 0.3 * yy / H_IMG)
            draw.line([(0, yy), (W_IMG, yy)], fill=(int(r * 255), int(g * 255), int(b * 255)))
        img.save(pic_path(i))
print(f"{len(made)} of {len(PICS)} pictures painted")
''')

md(r'''
## Step 7: cut it together

Each picture drifts slowly while it is up, the cuts land on downbeats, and the words light up
as they are sung. Then the vertical chorus clips and the synced lyric files.
''')
code(r'''
FPS = 30
SEGS = os.path.join(TEMP, "segments")
shutil.rmtree(SEGS, ignore_errors=True)
os.makedirs(SEGS, exist_ok=True)

def ff(*args):
    r = subprocess.run([FFMPEG, "-hide_banner", "-loglevel", "error", "-y", *args], capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError("ffmpeg: " + r.stderr[-1500:])

frame = lambda t: int(round(t * FPS))

# 1. The pictures, cut on the downbeats. Frame counts come from the running
#    total, so rounding never drifts the cuts off the beat.
listing = []
for k, (a, b, pi) in enumerate(PLAN):
    n = frame(b) - frame(a)
    if n <= 0:
        continue
    span = max(1, n - 1)
    x = f"(iw-ow)*n/{span}" if k % 2 == 0 else f"(iw-ow)*(1-n/{span})"
    yy = "(ih-oh)*0.35" if k % 3 else "(ih-oh)*0.65"
    seg = os.path.join(SEGS, f"seg{k:03d}.mp4")
    ff("-loop", "1", "-framerate", str(FPS), "-i", pic_path(pi), "-frames:v", str(n),
       "-vf", f"scale=2112:1188:flags=lanczos,crop=1920:1080:x='{x}':y='{yy}',setsar=1,format=yuv420p",
       "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-r", str(FPS), "-an", seg)
    listing.append(seg)
with open(os.path.join(SEGS, "list.txt"), "w") as f:
    f.writelines(f"file '{s}'\n" for s in listing)
PICTURES = os.path.join(TEMP, "pictures.mp4")
ff("-f", "concat", "-safe", "0", "-i", os.path.join(SEGS, "list.txt"), "-c", "copy", PICTURES)

# 2. The words. ASS karaoke: each word fills in over the time it is sung.
def ass_time(t):
    cs = int(round(max(0.0, t) * 100))
    h, cs = divmod(cs, 360000)
    m, cs = divmod(cs, 6000)
    s, cs = divmod(cs, 100)
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"

def ass_text(s):
    return str(s).replace("\\", "/").replace("{", "(").replace("}", ")").replace("\n", " ")

def windows():
    """When each line is on screen: just before its first word to just after its last."""
    out = []
    for i, t in enumerate(TIMES):
        on = t["start"] - 0.35
        if out:
            on = max(on, out[-1][1])
        nxt = TIMES[i + 1]["start"] - 0.35 if i + 1 < len(TIMES) else DURATION
        off = min(t["end"] + 0.6, max(t["end"], nxt))
        out.append((max(0.0, on), min(DURATION, max(off, on + 0.3))))
    return out
WINDOWS = windows()

def build_ass(path, w, h, size, next_size, margin, next_margin, t_from=0.0, t_to=None):
    t_to = DURATION if t_to is None else t_to
    head = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {w}
PlayResY: {h}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Sung,DejaVu Sans,{size},&H0000D7FF,&H00F0F0F0,&H00000000,&H78000000,-1,0,0,0,100,100,0,0,1,4,2,2,70,70,{margin},1
Style: Next,DejaVu Sans,{next_size},&H00B4B4B4,&H00B4B4B4,&H00000000,&H78000000,0,0,0,0,100,100,0,0,1,3,1,2,70,70,{next_margin},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    rows = []
    for i, (t, (on, off)) in enumerate(zip(TIMES, WINDOWS)):
        if t["start"] < t_from - 0.05 or t["start"] >= t_to:
            continue
        on, off = max(on, t_from), min(off, t_to)
        if off - on < 0.1:
            continue
        ws = t["words"]
        parts = [f"{{\\k{int(round((ws[0][1] - on) * 100))}}}"]
        for j, (word, s, e) in enumerate(ws):
            dur = (ws[j + 1][1] if j + 1 < len(ws) else e) - s
            parts.append(f"{{\\kf{max(1, int(round(dur * 100)))}}}{ass_text(word)} ")
        rows.append(f"Dialogue: 0,{ass_time(on - t_from)},{ass_time(off - t_from)},Sung,,0,0,0,,{''.join(parts).rstrip()}")
        if i + 1 < len(TIMES) and TIMES[i + 1]["start"] - off < 2.5 and TIMES[i + 1]["start"] < t_to:
            rows.append(f"Dialogue: 0,{ass_time(on - t_from)},{ass_time(off - t_from)},Next,,0,0,0,,{ass_text(TIMES[i + 1]['text'])}")
    with open(path, "w", encoding="utf-8") as f:
        f.write(head + "\n".join(rows) + "\n")

def ass_filter(path):
    return "ass=filename='" + path.replace("\\", "/").replace(":", "\\:").replace("'", "\\'") + "'"

LYRIC_ASS = os.path.join(TEMP, "lyrics.ass")
build_ass(LYRIC_ASS, 1920, 1080, 66, 44, 150, 80)
VIDEO = os.path.join(WORKING, f"{OUT_NAME}-lyric-video.mp4")
ff("-i", PICTURES, "-i", AUDIO, "-vf", ass_filter(LYRIC_ASS), "-map", "0:v", "-map", "1:a",
   "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-pix_fmt", "yuv420p", "-r", str(FPS),
   "-c:a", "aac", "-b:a", "256k", "-movflags", "+faststart", "-shortest", VIDEO)
print("lyric video:", VIDEO)

# 3. Vertical chorus clips: the first chorus and the last one, up to a minute each.
choruses = [(si, a, b) for si, a, b in SPANS if re.search(r"chorus|hook|refrain", sections[si]["name"], re.I)]
if not choruses:
    sung = [(si, a, b) for si, a, b in SPANS if sections[si]["lines"]]
    choruses = sung[1:2] or sung[:1]
picks = [choruses[0]] + ([choruses[-1]] if len(choruses) > 1 and choruses[-1][1] - choruses[0][1] > 20 else [])
CLIPS = []
for n, (si, a, b) in enumerate(picks, 1):
    end = min(b, a + 59.0)
    if end < b:
        inside = DOWNBEATS[(DOWNBEATS > a + 8) & (DOWNBEATS <= end)]
        end = float(inside[-1]) if len(inside) else end
    dur = end - a
    if dur < 4:
        continue
    vass = os.path.join(TEMP, f"vertical{n}.ass")
    build_ass(vass, 1080, 1920, 74, 50, 430, 330, t_from=a, t_to=end)
    out = os.path.join(WORKING, f"{OUT_NAME}-chorus{n}-vertical.mp4")
    graph = ("[0:v]split=2[a][b];"
             "[a]scale=-2:1920,crop=1080:1920,boxblur=20:2,eq=brightness=-0.12[bg];"
             "[b]scale=1080:-2[fg];"
             f"[bg][fg]overlay=0:(H-h)/2,{ass_filter(vass)}[v];"
             f"[1:a]afade=t=in:d=0.05,afade=t=out:st={max(0.0, dur - 0.6):.3f}:d=0.6[au]")
    ff("-ss", f"{a:.3f}", "-t", f"{dur:.3f}", "-i", PICTURES, "-ss", f"{a:.3f}", "-t", f"{dur:.3f}", "-i", AUDIO,
       "-filter_complex", graph, "-map", "[v]", "-map", "[au]",
       "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-pix_fmt", "yuv420p", "-r", str(FPS),
       "-c:a", "aac", "-b:a", "256k", "-movflags", "+faststart", "-shortest", out)
    CLIPS.append(out)
    print("vertical clip:", out)

# 4. Synced lyric files.
def lrc_time(t):
    cs = int(round(t * 100))
    return f"[{cs // 6000:02d}:{(cs // 100) % 60:02d}.{cs % 100:02d}]"
def srt_time(t):
    ms = int(round(t * 1000))
    return f"{ms // 3600000:02d}:{(ms // 60000) % 60:02d}:{(ms // 1000) % 60:02d},{ms % 1000:03d}"
with open(os.path.join(WORKING, f"{OUT_NAME}.lrc"), "w", encoding="utf-8") as f:
    f.writelines(f"{lrc_time(t['start'])}{t['text']}\n" for t in TIMES)
with open(os.path.join(WORKING, f"{OUT_NAME}.srt"), "w", encoding="utf-8") as f:
    for i, (t, (on, off)) in enumerate(zip(TIMES, WINDOWS), 1):
        f.write(f"{i}\n{srt_time(t['start'])} --> {srt_time(max(off, t['end']))}\n{t['text']}\n\n")

print("\nDone. Words timed by", TIMED_BY + ".", "Files:")
for name in sorted(os.listdir(WORKING)):
    print("  ", name, f"{os.path.getsize(os.path.join(WORKING, name)) / 1e6:.1f} MB")
''')

nb = {"cells": cells,
      "metadata": {"kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"},
                   "language_info": {"name": "python"}},
      "nbformat": 4, "nbformat_minor": 5}
with open(OUT, "w", encoding="utf-8") as f:
    json.dump(nb, f, indent=1, ensure_ascii=False)
    f.write("\n")
print("wrote", OUT, len(cells), "cells")
