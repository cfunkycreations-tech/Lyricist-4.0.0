"""Writes resources/kaggle-moss-image.ipynb. Edit the cells here, then:  python scripts/make-moss-notebook.py resources/kaggle-moss-image.ipynb"""
import json, sys

OUT = sys.argv[1]
cells = []
def md(s): cells.append({"cell_type": "markdown", "metadata": {}, "source": s.strip("\n")})
def code(s): cells.append({"cell_type": "code", "metadata": {}, "execution_count": None, "outputs": [], "source": s.strip("\n") + "\n"})

md(r'''
# MOSS-Image on Kaggle

Makes pictures with **MOSS-Image** on Kaggle's GPU. Your PC only types the prompt and downloads the result.

1. Right side, **Session options**: Accelerator **GPU T4 x2**, Internet **On**.
2. Edit the box under **Your picture**.
3. Press **Run All**. The first run downloads about 13 GB.
4. Pictures show up below and sit in the **Output** tab on the right. Download them to your PC.

Want ComfyUI itself, on your PC's browser, running on Kaggle's GPU? Set `TUNNEL = True` in the box and Run All.
''')

md(r'''
---
# Your picture
---
Describe the whole scene in plain sentences. Put words you want printed in quotes.
''')
code(r'''
PROMPT = """A hand-painted wooden sign above a record shop door on a sunny street. The sign reads "BLACK HOLE STUDIOS" in tall cream capital letters on deep blue. Warm afternoon light, shallow depth of field, 35mm photo."""

NEGATIVE = "nsfw, worst quality, bad anatomy, watermark, jpeg artifact"

WIDTH, HEIGHT = 1024, 1024   # multiples of 16. 1024x1024 is the sweet spot.
HOW_MANY = 2                 # pictures per run. 0 = just get ready (for TUNNEL)
SEED = -1                    # -1 = new random pictures every run
STEPS = 25                   # 50 = slower, a little cleaner
CFG = 2.5                    # 3 = follows the prompt a little harder

VARIANT = "sft"              # "sft" = sharper text and layout. "base" = plain base model
QUANT = "auto"               # "auto" tries the small int8 model, then bf16 (slow on a T4) if that fails
TUNNEL = False               # True = open ComfyUI in your PC browser (stays on until you press Stop)
HF_TOKEN = ""                # optional Hugging Face token
''')

md("## Step 1: check the computer")
code(r'''
import subprocess, torch
subprocess.run("nvidia-smi --query-gpu=name,memory.total --format=csv", shell=True)
print("torch", torch.__version__, "| cuda", torch.version.cuda, "| GPUs", torch.cuda.device_count())
assert torch.cuda.is_available(), "No GPU. Set Accelerator to 'GPU T4 x2' and restart the session."
''')

md("## Step 2: install ComfyUI")
code(r'''
import os, re, subprocess, sys

COMFY = "/kaggle/temp/ComfyUI"
COMFY_SHA = "fd734e958c68d96f310cafbc2ca609567dd1daf2"   # a ComfyUI build that has MOSS-Image built in

def sh(cmd):
    subprocess.run(cmd, shell=True, check=True)

if not os.path.exists(COMFY + "/main.py"):
    os.makedirs(COMFY, exist_ok=True)
    sh(f"cd {COMFY} && git init -q && git remote add origin https://github.com/comfyanonymous/ComfyUI.git"
       f" && git fetch -q --depth 1 origin {COMFY_SHA} && git checkout -q FETCH_HEAD")

# keep Kaggle's own torch
skip = re.compile(r"\s*(torch|torchvision|torchaudio)\s*($|[=<>~!#])")
reqs = [l for l in open(COMFY + "/requirements.txt").read().splitlines() if not skip.match(l)]
open("/kaggle/temp/comfy-reqs.txt", "w").write("\n".join(reqs) + "\n")
sh(f"{sys.executable} -m pip install -q -r /kaggle/temp/comfy-reqs.txt")
print("ComfyUI ready")
''')

md(r'''
## Step 3: make the pictures

Downloads MOSS-Image, starts ComfyUI, paints your prompt. Pictures are saved to the **Output** tab.
''')
code(r'''
import json, random, time, urllib.request, urllib.error
from huggingface_hub import hf_hub_download, list_repo_files
from IPython.display import display, Image as ShowImage
from PIL import Image, ImageStat

REPO = "Comfy-Org/MOSS-Image"
MODELS = COMFY + "/models"
WORKING = "/kaggle/working"
LOG = "/kaggle/temp/comfy.log"
API = "http://127.0.0.1:8188"

if not HF_TOKEN:
    try:
        from kaggle_secrets import UserSecretsClient
        HF_TOKEN = UserSecretsClient().get_secret("HF_TOKEN")
    except Exception:
        pass

WIDTH, HEIGHT = max(256, WIDTH // 16 * 16), max(256, HEIGHT // 16 * 16)
ALL = list_repo_files(REPO, token=HF_TOKEN or None)

def pick(folder, *words, exact=None):
    if exact and f"{folder}/{exact}" in ALL:
        return f"{folder}/{exact}"
    hits = [f for f in ALL if f.startswith(folder + "/") and f.endswith(".safetensors") and all(w in f for w in words)]
    return sorted(hits, key=len)[0] if hits else None

def resolve(quant):
    unet = pick("diffusion_models", f"moss_image_{VARIANT}_", quant,
                exact=f"moss_image_{VARIANT}_int8_convrot.safetensors" if quant == "int8" else f"moss_image_{VARIANT}_bf16.safetensors")
    te = pick("text_encoders", "w4a8", exact="qwen3.5_9b_w4a8_gptq.safetensors") or pick("text_encoders", "qwen3.5_9b")
    vae = pick("vae", "flux2-vae_small", exact="flux2-vae_small.safetensors") or pick("vae", "flux2-vae")
    if not (unet and te and vae):
        print("Files in", REPO)
        print("\n".join("  " + f for f in ALL))
        raise SystemExit(f"Could not find the {quant} files for {VARIANT}. Names above.")
    return unet, te, vae

def fetch(path):
    if not os.path.exists(f"{MODELS}/{path}"):
        print("downloading", path)
        hf_hub_download(REPO, path, local_dir=MODELS, token=HF_TOKEN or None)

SERVER = None

def tail(n=25):
    return "\n".join(open(LOG).read().splitlines()[-n:])

def stop_server():
    global SERVER
    if SERVER and SERVER.poll() is None:
        SERVER.terminate()
        try:
            SERVER.wait(30)
        except subprocess.TimeoutExpired:
            SERVER.kill()
    SERVER = None

def start_server():
    global SERVER
    stop_server()
    env = dict(os.environ, CUDA_VISIBLE_DEVICES="0")
    SERVER = subprocess.Popen(
        [sys.executable, "main.py", "--listen", "127.0.0.1", "--port", "8188",
         "--output-directory", WORKING, "--disable-auto-launch"],
        cwd=COMFY, env=env, stdout=open(LOG, "w"), stderr=subprocess.STDOUT)
    for _ in range(150):
        if SERVER.poll() is not None:
            break
        try:
            urllib.request.urlopen(API + "/system_stats", timeout=2)
            return
        except Exception:
            time.sleep(2)
    raise SystemExit("ComfyUI did not start:\n" + tail())

def call(path, data=None):
    req = urllib.request.Request(API + path, headers={"Content-Type": "application/json"},
                                 data=None if data is None else json.dumps(data).encode())
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        raise RuntimeError(e.read().decode()[:1500])

def check_nodes():
    need = ["UNETLoader", "CLIPLoader", "VAELoader", "EmptyFlux2LatentImage", "SkipLayerGuidanceDiTSimple",
            "CLIPTextEncode", "KSampler", "VAEDecode", "SaveImage"]
    gone = [n for n in need if n not in call("/object_info/" + n)]
    if gone or "moss_image" not in json.dumps(call("/object_info/CLIPLoader")):
        raise SystemExit(f"This ComfyUI build has no MOSS-Image support (missing {gone or 'moss_image loader'}).")

def generate(unet, te, vae, seed):
    g = {
        "1": {"class_type": "UNETLoader", "inputs": {"unet_name": os.path.basename(unet), "weight_dtype": "default"}},
        "2": {"class_type": "CLIPLoader", "inputs": {"clip_name": os.path.basename(te), "type": "moss_image", "device": "default"}},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": os.path.basename(vae)}},
        "4": {"class_type": "SkipLayerGuidanceDiTSimple", "inputs": {
            "model": ["1", 0], "double_layers": "", "single_layers": "22", "start_percent": 0.0, "end_percent": 0.5}},
        "5": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["2", 0], "text": PROMPT}},
        "6": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["2", 0], "text": NEGATIVE}},
        "7": {"class_type": "EmptyFlux2LatentImage", "inputs": {"width": WIDTH, "height": HEIGHT, "batch_size": 1}},
        "8": {"class_type": "KSampler", "inputs": {
            "model": ["4", 0], "positive": ["5", 0], "negative": ["6", 0], "latent_image": ["7", 0],
            "seed": seed, "steps": STEPS, "cfg": CFG, "sampler_name": "er_sde", "scheduler": "simple", "denoise": 1.0}},
        "9": {"class_type": "VAEDecode", "inputs": {"samples": ["8", 0], "vae": ["3", 0]}},
        "10": {"class_type": "SaveImage", "inputs": {"images": ["9", 0], "filename_prefix": "moss"}},
    }
    pid = call("/prompt", {"prompt": g})["prompt_id"]
    while True:
        h = call("/history/" + pid)
        if pid in h:
            st = h[pid]["status"]
            if st["status_str"] == "error":
                why = [m[1].get("exception_message", "") for m in st["messages"] if m[0] == "execution_error"]
                raise RuntimeError(" ".join(why).strip() or "ComfyUI reported an error")
            imgs = [i for o in h[pid]["outputs"].values() for i in o.get("images", [])]
            return [os.path.join(WORKING, i.get("subfolder", ""), i["filename"]) for i in imgs]
        if SERVER.poll() is not None:
            raise RuntimeError("ComfyUI crashed:\n" + tail())
        time.sleep(2)

seeds = [(random.randrange(2**31) if SEED < 0 else SEED + i) for i in range(HOW_MANY)]
order = ["int8", "bf16"] if QUANT == "auto" else [QUANT]
made, files = [], None

for quant in order:
    try:
        files = resolve(quant)
        for p in files:
            fetch(p)
        start_server()
        check_nodes()
        made = []
        for s in seeds:
            t0 = time.time()
            for f in generate(*files, s):
                if Image.open(f).convert("L").getextrema()[1] == 0:
                    raise RuntimeError("the picture came out black")
                made.append(f)
                print(f"seed {s}: {os.path.basename(f)} in {time.time() - t0:.0f}s ({quant})")
        break
    except (RuntimeError, OSError) as e:
        print(f"{quant} did not work: {str(e)[:700]}")
        if "out of memory" in str(e).lower():
            print("Out of memory: set WIDTH and HEIGHT to 768 and Run All again.")
        if quant == order[-1]:
            raise SystemExit("No picture made. Send the lines above to Claude.")

for f in made:
    display(ShowImage(f, width=512))
if made:
    print(f"{len(made)} picture(s) saved. Download them from the Output tab on the right.")
''')

md(r'''
## Optional: ComfyUI on your PC's browser

Only runs when `TUNNEL = True`. Prints a link. Open it on your PC and you are in ComfyUI, drawing on Kaggle's GPU.
In ComfyUI open **Templates** and pick **MOSS-Image** for the ready-made workflow. Everything you make lands in the **Output** tab here.
It uses a Cloudflare quick tunnel, so keep this tab open while you work and press **Stop** on the cell when you are done. Kaggle's rules on tunnels are unclear, so Run All and download from **Output** is the safe route.
''')
code(r'''
if not TUNNEL:
    print("TUNNEL is False. Set it to True in 'Your picture' and Run All to use this.")
else:
    assert "COMFY" in globals() and "start_server" in globals(), "Run Step 3 first."
    if SERVER is None or SERVER.poll() is not None:
        start_server()
    CF, CFLOG = "/kaggle/temp/cloudflared", "/kaggle/temp/tunnel.log"
    sh(f"curl -sSL -o {CF} https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 && chmod +x {CF}")
    tun = subprocess.Popen([CF, "tunnel", "--no-autoupdate", "--url", API], stdout=open(CFLOG, "w"), stderr=subprocess.STDOUT)
    link = None
    for _ in range(60):
        m = re.search(r"https://[a-z0-9-]+\.trycloudflare\.com", open(CFLOG).read())
        if m:
            link = m.group(0)
            break
        time.sleep(2)
    assert link, "No tunnel link:\n" + open(CFLOG).read()[-800:]
    print("Open this on your PC:", link)
    tun.wait()
''')

nb = {"cells": cells,
      "metadata": {"kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"},
                   "language_info": {"name": "python", "version": "3.11"},
                   "accelerator": "GPU",
                   "kaggle": {"accelerator": "nvidiaTeslaT4", "dataSources": [], "isInternetEnabled": True,
                              "language": "python", "sourceType": "notebook"}},
      "nbformat": 4, "nbformat_minor": 5}
with open(OUT, "w", encoding="utf-8") as f:
    json.dump(nb, f, indent=1, ensure_ascii=False)
    f.write("\n")
print("wrote", OUT, len(cells), "cells")
