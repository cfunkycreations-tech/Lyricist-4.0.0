# -*- coding: utf-8 -*-
"""Prove the lyric video notebook works, without a graphics card or a Kaggle run.

    python3 scripts/kaggle-video-check.py

Runs the REAL cells of resources/kaggle-lyric-video.ipynb on a made-up song: a
click track at 120 BPM with a kick on every downbeat (0.25 + 2k seconds).
torch, the word timer and the picture model are fakes; the timer hands back
known word times and one picture "fails" to paint. librosa and ffmpeg are real.

Checks the 16:9 video and the 9:16 chorus clips (size, length), that every
picture change lands on a downbeat (in the plan and in the video itself, by
ffmpeg scene detect), that the .lrc times are the sung times, that the .srt
never runs backwards, and that {braces} and back\\slashes in lyrics cannot break
the burned-in words. Then runs the timing cell again with the timer failing in
three different ways: the words must still come out in order.

Needs ffmpeg with libass, librosa, soundfile and Pillow.
"""
import json, os, re, subprocess, sys, tempfile, time, types, hashlib, shutil
import numpy as np
import soundfile as sf
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NB = os.path.join(ROOT, "resources", "kaggle-lyric-video.ipynb")
BASE = tempfile.mkdtemp(prefix="lyric-video-check-")
INPUT, WORKING, TEMP = (os.path.join(BASE, d) for d in ("input", "working", "temp"))
os.environ.update(LYRICIST_INPUT=INPUT, LYRICIST_WORKING=WORKING, LYRICIST_TEMP=TEMP)

bad = 0
def ok(name, cond, extra=""):
    global bad
    print(f"{'PASS' if cond else 'FAIL'}  {name}  {extra}".rstrip())
    if not cond:
        bad += 1

# ------------------------------------------------------------------ the song
SR, LENGTH = 44100, 60.5
DOWN = [0.25 + 2 * k for k in range(31)]            # downbeats, a bar is 2 s
LYRICS = r"""[Intro]

[Verse]
Hold the {brace} and back\slash home
Paper boats along the curb

[Chorus]
Turn it up and let it play
We were never built to stay
Every window open wide
Every porch light burning bright

[Verse 2]
Keys are hanging by the door
Nobody counts the hours anymore

[Chorus]
Turn it up and let it play
We were never built to stay

[Outro]
"""
LINE_STARTS = [8.4, 12.4, 16.4, 20.4, 24.4, 28.4, 32.4, 36.4, 40.4, 44.4]
SUNG = [l for l in LYRICS.splitlines() if l.strip() and not l.startswith("[")]
word_time = lambda li, k: (LINE_STARTS[li] + 0.55 * k, LINE_STARTS[li] + 0.55 * k + 0.45)

def click_track():
    y = np.zeros(int(SR * LENGTH), dtype=np.float32)
    rng = np.random.default_rng(1)
    t = np.arange(int(SR * 0.25)) / SR
    kick = (np.sin(2 * np.pi * 55 * t) * np.exp(-t * 18)).astype(np.float32)
    hat = (rng.standard_normal(int(SR * 0.02)) * np.exp(-np.arange(int(SR * 0.02)) / 200)).astype(np.float32)
    beat = 0.25
    k = 0
    while beat < LENGTH - 0.3:
        i = int(beat * SR)
        if k % 4 == 0:
            y[i:i + len(kick)] += 0.9 * kick
        y[i:i + len(hat)] += 0.15 * hat
        beat += 0.5
        k += 1
    return np.clip(y, -1, 1)

os.makedirs(os.path.join(INPUT, "lyricist-video-song"), exist_ok=True)
AUDIO_NAME = "my-song-k3x9.flac"
sf.write(os.path.join(INPUT, "lyricist-video-song", AUDIO_NAME), click_track(), SR)
# The saved models, mounted a few folders down like Kaggle does.
deep = os.path.join(INPUT, "lyricist-video-models", "other", "default", "1")
os.makedirs(deep, exist_ok=True)
for name in ("sd_xl_base_1.0.safetensors", "medium.pt"):
    open(os.path.join(deep, name), "wb").write(b"fake")

# ------------------------------------------------------------------ fakes
G = {"__name__": "__main__"}
SEEN = {"pipes": [], "painted": {}, "whisper": None, "aligned": None}
MODE = {"timer": "lines"}

torch = types.ModuleType("torch")
torch.__version__ = "fake"
torch.version = types.SimpleNamespace(cuda="12.x")
torch.float16, torch.float32 = "float16", "float32"
torch.Tensor = type("Tensor", (), {})          # scipy asks "is this a torch tensor?" once torch is loaded
torch.cuda = types.SimpleNamespace(is_available=lambda: True, device_count=lambda: 2, empty_cache=lambda: None)
class Generator:
    def __init__(self, device=None):
        self.device = device
    def manual_seed(self, s):
        self.seed = s
        return self
torch.Generator = Generator
class no_grad:
    def __enter__(self): return self
    def __exit__(self, *a): return False
torch.no_grad = no_grad

class Word:
    def __init__(self, w, s, e): self.word, self.start, self.end = w, s, e
class Seg:
    def __init__(self, words): self.words = words
class Timer:
    def align(self, audio, text, language=None, original_split=False):
        SEEN["aligned"] = (len(audio), original_split, language)
        if MODE["timer"] == "fail":
            raise RuntimeError("the timer fell over")
        segs = []
        for li, line in enumerate(text.split("\n")):
            words = [] if MODE["timer"] == "gap" and li in (4, 5) else \
                [Word(" " + w, *word_time(li, k)) for k, w in enumerate(line.split())]
            segs.append(Seg(words))
        if MODE["timer"] == "merged":
            segs = [Seg([w for s in segs for w in s.words])]
        return types.SimpleNamespace(segments=segs)
stable_whisper = types.ModuleType("stable_whisper")
def load_model(name, device=None, download_root=None):
    SEEN["whisper"] = (name, device)
    return Timer()
stable_whisper.load_model = load_model

class Pipe:
    def __init__(self, path, dtype):
        self.path, self.dtype, self.dev = path, dtype, None
    def to(self, dev):
        self.dev = dev
        SEEN["pipes"].append((self.path, self.dtype, dev))
        return self
    def set_progress_bar_config(self, **k): pass
    def __call__(self, prompt, negative_prompt, width, height, num_inference_steps, guidance_scale, generator):
        i = generator.seed - G["BASE_SEED"]
        if i == 3:
            raise RuntimeError("out of memory (on purpose)")
        SEEN["painted"][i] = (self.dev, prompt, negative_prompt)
        hue = (i * 53) % 360
        light = min(250, 50 + 32 * i)              # far apart in brightness too, so the scene detector sees every change
        rgb = tuple(int(c) for c in Image.new("HSV", (1, 1), (int(hue * 255 / 360), 200, light)).convert("RGB").getpixel((0, 0)))
        return types.SimpleNamespace(images=[Image.new("RGB", (width, height), rgb)])
diffusers = types.ModuleType("diffusers")
diffusers.StableDiffusionXLPipeline = types.SimpleNamespace(from_single_file=lambda p, torch_dtype=None: Pipe(p, torch_dtype))
demucs = types.ModuleType("demucs")      # there, but not the real one: the vocal lift must fall back to the mix
sys.modules.update(torch=torch, stable_whisper=stable_whisper, diffusers=diffusers, demucs=demucs)

# ------------------------------------------------------------------ run it
nb = json.load(open(NB, encoding="utf-8"))
cells = ["".join(c["source"]) if isinstance(c["source"], list) else c["source"]
         for c in nb["cells"] if c["cell_type"] == "code"]
song_cell = next(i for i, c in enumerate(cells) if "AUDIO_NAME =" in c)
timing_cell = next(i for i, c in enumerate(cells) if "def aligned_lines" in c)
timings = {}
for i, src in enumerate(cells):
    t0 = time.time()
    exec(compile(src, f"cell {i}", "exec"), G)
    timings[i] = time.time() - t0
    if i == song_cell:
        G.update(AUDIO_NAME=AUDIO_NAME, OUT_NAME="my-song", LYRICS=LYRICS,
                 CAPTION="Warm soul, 120 BPM, A minor, live band, a dusty basement session.")
print(f"ran {len(cells)} cells, cut and burned in {timings[len(cells) - 1]:.1f}s")

def probe(path):
    r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                        "stream=width,height:format=duration", "-of", "json", path], capture_output=True, text=True)
    j = json.loads(r.stdout or "{}")
    s = (j.get("streams") or [{}])[0]
    return s.get("width"), s.get("height"), float(j.get("format", {}).get("duration", 0))

near_down = lambda t, tol=0.05: min(abs(t - d) for d in DOWN + [LENGTH]) <= tol

# The pieces it found
ok("the saved timing model is used, not downloaded", SEEN["whisper"] and SEEN["whisper"][0].endswith(os.path.join("1", "medium.pt")), str(SEEN["whisper"]))
ok("the timer is asked to keep our line breaks", SEEN["aligned"] and SEEN["aligned"][1] is True)
ok("the vocal lift fell back to the whole mix", G["VOCALS"] == G["AUDIO"])
ok("tempo found", 115 <= G["BPM"] <= 125, f"{G['BPM']:.1f} BPM")
ok("bar length found", abs(G["BAR"] - 2.0) < 0.05, f"{G['BAR']:.3f}s")
ok("downbeats are the kicks", all(near_down(float(d)) for d in G["DOWNBEATS"]),
   " ".join(f"{d:.2f}" for d in G["DOWNBEATS"][:4]))

# Parts and picture plan
starts = [round(a, 2) for _, a, _ in G["SPANS"]]
ok("each part starts on its downbeat", len(G["SPANS"]) == 6 and starts[0] == 0
   and all(abs(a - e) <= 0.05 for a, e in zip(starts[1:], [8.25, 16.25, 32.25, 40.25, 48.25])), str(starts))
cuts = sorted({round(a, 3) for a, _, _ in G["PLAN"]} | {round(b, 3) for _, b, _ in G["PLAN"]})
ok("every picture change is on a downbeat", all(c == 0 or near_down(c) for c in cuts), str(cuts))
ok("the long chorus swaps pictures after four bars", any(abs(c - 24.25) <= 0.05 for c in cuts))
ok("seven pictures for six parts", len(G["PICS"]) == 7, str(len(G["PICS"])))
ok("the plan covers the whole song with no gaps",
   G["PLAN"][0][0] == 0 and abs(G["PLAN"][-1][1] - G["DURATION"]) < 1e-6
   and all(abs(G["PLAN"][k][1] - G["PLAN"][k + 1][0]) < 1e-9 for k in range(len(G["PLAN"]) - 1)))
ok("prompts carry the sound, not the tempo or key", all("120 BPM" not in p["prompt"] and "minor" not in p["prompt"]
   and "Warm soul, live band" in p["prompt"] for p in G["PICS"]), G["PICS"][1]["prompt"])

# Pictures
ok("both graphics cards loaded the saved picture model in half precision",
   sorted(d for _, _, d in SEEN["pipes"]) == ["cuda:0", "cuda:1"] and all(p.endswith("sd_xl_base_1.0.safetensors") and t == "float16" for p, t, _ in SEEN["pipes"]))
ok("both cards painted", {d for d, _, _ in SEEN["painted"].values()} == {"cuda:0", "cuda:1"})
ok("the failed picture borrowed a painted one", all(os.path.exists(G["pic_path"](i)) for i in range(len(G["PICS"]))) and 3 not in SEEN["painted"])

# Video
w, h, d = probe(G["VIDEO"])
ok("16:9 video is 1920x1080", (w, h) == (1920, 1080), f"{w}x{h}")
ok("16:9 video is as long as the song", abs(d - LENGTH) <= 0.1, f"{d:.2f}s")
r = subprocess.run(["ffmpeg", "-hide_banner", "-i", G["PICTURES"], "-vf", "select='gt(scene,0.05)',showinfo", "-f", "null", "-"],
                   capture_output=True, text=True)
seen_cuts = [float(x) for x in re.findall(r"pts_time:([\d.]+)", r.stderr)]
md5 = lambda p: hashlib.md5(open(p, "rb").read()).hexdigest()
visible = [b for (_, b, p), (_, _, q) in zip(G["PLAN"], G["PLAN"][1:]) if md5(G["pic_path"](p)) != md5(G["pic_path"](q))]
frame = 1 / 30 + 1e-3
ok("every cut in the video is on a planned downbeat", seen_cuts and all(min(abs(s - c) for c in visible) <= frame for s in seen_cuts),
   " ".join(f"{s:.2f}" for s in seen_cuts))
ok("every planned change shows up in the video", all(min(abs(s - c) for s in seen_cuts) <= frame for c in visible) if seen_cuts else False,
   " ".join(f"{c:.2f}" for c in visible))

clips = sorted(f for f in os.listdir(WORKING) if f.endswith("-vertical.mp4"))
ok("two vertical chorus clips", clips == ["my-song-chorus1-vertical.mp4", "my-song-chorus2-vertical.mp4"], str(clips))
for name, want in zip(clips, (16.0, 8.0)):
    w, h, d = probe(os.path.join(WORKING, name))
    ok(f"{name} is 1080x1920 and {want:.0f}s", (w, h) == (1080, 1920) and abs(d - want) <= 0.1, f"{w}x{h} {d:.2f}s")

# Words
ass = open(os.path.join(TEMP, "lyrics.ass"), encoding="utf-8").read()
ok("braces and back slashes cannot break the burned-in words", "(brace)" in ass and "back/slash" in ass
   and "{brace}" not in ass and "\\slash" not in ass)
ok("every word lights up", ass.count("\\kf") == sum(len(l.split()) for l in SUNG), str(ass.count("\\kf")))
lrc = open(os.path.join(WORKING, "my-song.lrc"), encoding="utf-8").read().splitlines()
want = [f"[{int(round(s * 100)) // 6000:02d}:{(int(round(s * 100)) // 100) % 60:02d}.{int(round(s * 100)) % 100:02d}]{l}"
        for s, l in zip(LINE_STARTS, SUNG)]
ok(".lrc lines are at the sung times, in our own words", lrc == want, lrc[0] if lrc else "")
srt = open(os.path.join(WORKING, "my-song.srt"), encoding="utf-8").read()
def secs(s):
    hh, mm, rest = s.split(":")
    return int(hh) * 3600 + int(mm) * 60 + float(rest.replace(",", "."))
pairs = [(secs(a), secs(b)) for a, b in re.findall(r"(\S+) --> (\S+)", srt)]
ok(".srt never runs backwards", len(pairs) == len(SUNG) and all(a < b for a, b in pairs)
   and all(pairs[k][0] <= pairs[k + 1][0] for k in range(len(pairs) - 1)))

# ------------------------------------------------------------------ the timer failing
def in_order(times):
    flat = [(s, e) for t in times for _, s, e in t["words"]]
    return all(e > s for s, e in flat) and all(flat[k][0] <= flat[k + 1][0] for k in range(len(flat) - 1)) \
        and all(0 <= s <= G["DURATION"] for s, _ in flat)
for mode, name in (("merged", "line breaks lost"), ("gap", "two lines unheard"), ("fail", "the timer falls over")):
    MODE["timer"] = mode
    exec(compile(cells[timing_cell], "timing cell", "exec"), G)
    T = G["TIMES"]
    good = len(T) == len(SUNG) and in_order(T) and all(len(t["words"]) == len(t["text"].split()) for t in T)
    if mode == "merged":
        good = good and [round(t["start"], 2) for t in T] == LINE_STARTS
    if mode == "gap":
        good = good and T[3]["end"] < T[4]["start"] < T[5]["start"] < T[6]["start"] and G["TIMED_BY"] == "the singing"
    if mode == "fail":
        good = good and G["TIMED_BY"] == "an even spread"
    ok(f"words still in order when {name}", good, " ".join(f"{t['start']:.1f}" for t in T))

shutil.rmtree(BASE, ignore_errors=True)
print(f"{bad} FAILED" if bad else "all passed")
sys.exit(1 if bad else 0)
