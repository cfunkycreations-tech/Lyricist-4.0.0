"""Writes resources/kaggle-moss-image.ipynb. Edit the cells here, then:  python scripts/make-moss-notebook.py resources/kaggle-moss-image.ipynb"""
import json, sys

OUT = sys.argv[1]
cells = []
def md(s): cells.append({"cell_type": "markdown", "metadata": {}, "source": s.strip("\n")})
def code(s): cells.append({"cell_type": "code", "metadata": {}, "execution_count": None, "outputs": [], "source": s.strip("\n") + "\n"})

md(r'''
# MOSS-Image on Kaggle

Makes pictures with **MOSS-Image** on Kaggle's GPUs. Your PC only types the prompt and downloads the result.

1. Right side, **Session options**: Accelerator **GPU T4 x2**, Internet **On**.
2. Edit the box under **Your picture**.
3. Press **Run All**. The first run downloads about 11 GB (7.3 GB of that is the text reader).
4. Pictures show up below and sit in the **Output** tab on the right. Download them to your PC.

It uses the smallest community model (4-bit GGUF) and paints on both T4 cards at once, two pictures at a time. If that fails it falls back to the official files by itself.
A T4 is a slow card: expect minutes per picture, not seconds.

Want ComfyUI itself, in your PC's browser, running on Kaggle's GPU? Set `TUNNEL = True` in the box and Run All.
''')

md(r'''
---
# Your picture
---
Describe the whole scene in plain sentences. Put words you want printed in quotes.
''')
code(r'''
PROMPT = """A hand-painted wooden sign above a record shop door on a sunny street. The sign reads "BLACK HOLE STUDIOS" in tall cream capital letters on deep blue. Warm afternoon light, shallow depth of field, 35mm photo."""

WIDTH, HEIGHT = 768, 768     # multiples of 16. 1024 x 1024 is sharper but much slower on a T4
HOW_MANY = 4                 # pictures per run. 0 = just get ready (for TUNNEL)
SEED = -1                    # -1 = new random pictures every run

VARIANT = "sft"              # "sft" = sharper text and layout. "base" = plain base model
QUANT = "Q4_K_S"             # smaller and blurrier: "Q3_K_M", "Q2_K". bigger: "Q5_K_M", "Q6_K", "Q8_0". "official" = skip the community model
STEPS = 0                    # 0 = automatic. More steps = slower, a little cleaner
CFG = 0                      # 0 = automatic. Higher = follows the prompt harder

TUNNEL = False               # True = open ComfyUI in your PC browser (stays on until you press Stop)
HF_TOKEN = ""                # optional Hugging Face token
''')

md("## Step 1: check the computer")
code(r'''
import subprocess, torch
subprocess.run("nvidia-smi --query-gpu=name,memory.total --format=csv", shell=True)
print("torch", torch.__version__, "| cuda", torch.version.cuda, "| GPUs", torch.cuda.device_count())
assert torch.cuda.is_available(), "No GPU. Set Accelerator to 'GPU T4 x2' and restart the session."
N_GPU = min(torch.cuda.device_count(), 2)
if N_GPU < 2:
    print("Only one GPU. Pick 'GPU T4 x2' in Session options to paint twice as fast.")
''')

md("## Step 2: install ComfyUI and the MOSS add-ons")
code(r'''
import os, re, shutil, subprocess, sys

COMFY = "/kaggle/temp/ComfyUI"
NODES = COMFY + "/custom_nodes"

def sh(cmd):
    subprocess.run(cmd, shell=True, check=True)

def grab(url, sha, dest):
    if not os.path.exists(dest + "/.git"):
        shutil.rmtree(dest, ignore_errors=True)
        os.makedirs(dest)
        sh(f"cd {dest} && git init -q && git remote add origin {url} && git fetch -q --depth 1 origin {sha} && git checkout -q FETCH_HEAD")

# ComfyUI build that has MOSS-Image built in
grab("https://github.com/comfyanonymous/ComfyUI.git", "fd734e958c68d96f310cafbc2ca609567dd1daf2", COMFY)

# official MOSS-Image add-on (folder must be called moss-image)
grab("https://github.com/OpenMOSS/MOSS-Image.git", "52b87fca23acedc399d062d593bec388aee9926a", "/kaggle/temp/OpenMOSS")
shutil.copytree("/kaggle/temp/OpenMOSS/comfyui/moss-image", NODES + "/moss-image", dirs_exist_ok=True)

# GGUF loader the community model needs, and the community add-on that lets it read MOSS files
grab("https://github.com/city96/ComfyUI-GGUF.git", "6ea2651e7df66d7585f6ffee804b20e92fb38b8a", NODES + "/ComfyUI-GGUF")
grab("https://github.com/RealRebelAI/ComfyUI-MOSS-GGUF.git", "12d67843829802187be464504feea489ff9ebbe6", NODES + "/ComfyUI-MOSS-GGUF")

# keep Kaggle's own torch
skip = re.compile(r"\s*(torch|torchvision|torchaudio)\s*($|[=<>~!#])")
reqs = [l for l in open(COMFY + "/requirements.txt").read().splitlines() if not skip.match(l)]
open("/kaggle/temp/comfy-reqs.txt", "w").write("\n".join(reqs) + "\n")
sh(f"{sys.executable} -m pip install -q -r /kaggle/temp/comfy-reqs.txt -r {NODES}/ComfyUI-GGUF/requirements.txt")
print("ComfyUI ready")
''')

md(r'''
## Step 3: make the pictures

Downloads the model, starts ComfyUI on each GPU, paints your prompt. The first picture runs alone on GPU 0 to prove everything works, then the second card joins in. Pictures are saved to the **Output** tab.
''')
code(r'''
import json, random, threading, time, urllib.request, urllib.error
from huggingface_hub import hf_hub_download, list_repo_files
from IPython.display import display, Image as ShowImage
from PIL import Image

MODELS = COMFY + "/models"
WORKING = "/kaggle/working"
OFFICIAL = "Comfy-Org/MOSS-Image"
VARIANT = VARIANT.lower().strip()
GGUF_REPOS = ["realrebelai/MOSS-Image_GGUFs",
              "axiomofmind/Moss-Image-SFT-GGUF" if VARIANT == "sft" else "axiomofmind/Moss-Image-base-GGUF"]

if not HF_TOKEN:
    try:
        from kaggle_secrets import UserSecretsClient
        HF_TOKEN = UserSecretsClient().get_secret("HF_TOKEN")
    except Exception:
        pass

WIDTH, HEIGHT = max(256, WIDTH // 16 * 16), max(256, HEIGHT // 16 * 16)

# ---------- find the files ----------
def repo_files(repo):
    try:
        return list_repo_files(repo, token=HF_TOKEN or None)
    except Exception as e:
        print(f"cannot read {repo}: {str(e)[:150]}")
        return []

OFF = repo_files(OFFICIAL)
if not OFF:
    raise SystemExit("Cannot reach Hugging Face. Check that Internet is On in Session options.")

def pick(folder, *words, exact=None):
    if exact and f"{folder}/{exact}" in OFF:
        return f"{folder}/{exact}"
    hits = [f for f in OFF if f.startswith(folder + "/") and f.endswith(".safetensors") and all(w in f for w in words)]
    return sorted(hits, key=len)[0] if hits else None

TE = pick("text_encoders", "w4a8", exact="qwen3.5_9b_w4a8_gptq.safetensors") or pick("text_encoders", "qwen3.5_9b")
VAE = pick("vae", "flux2-vae_small", exact="flux2-vae_small.safetensors") or pick("vae", "flux2-vae")
if not (TE and VAE):
    raise SystemExit("Could not find the text reader or VAE in " + OFFICIAL + ". Files:\n" + "\n".join(OFF))

def squash(t):
    return re.sub(r"[^a-z0-9]", "", t.lower())

def find_gguf():
    want = squash(QUANT)
    seen = []
    for repo in GGUF_REPOS:
        names = [f for f in repo_files(repo) if f.lower().endswith(".gguf")]
        seen += [f"{repo}/{f}" for f in names]
        hits = [f for f in names if (VARIANT in f.lower() or VARIANT in repo.lower()) and want in squash(os.path.basename(f))]
        if hits:
            return repo, sorted(hits, key=len)[0]
    print(f"No {VARIANT} {QUANT} GGUF found. Community files seen:")
    print("\n".join("  " + f for f in seen) or "  (none)")
    return None

def plan():
    modes = []
    if QUANT.lower() != "official":
        g = find_gguf()
        if g:
            modes.append({"name": f"{VARIANT} {QUANT} (community GGUF)", "kind": "rebel", "repo": g[0], "unet": g[1]})
    for q in ["int8", "bf16"]:
        u = pick("diffusion_models", f"moss_image_{VARIANT}_", q,
                 exact=f"moss_image_{VARIANT}_{'int8_convrot' if q == 'int8' else 'bf16'}.safetensors")
        if u:
            modes.append({"name": f"{VARIANT} {q} (official)", "kind": "native", "repo": OFFICIAL, "unet": u})
    return modes

def fetch(repo, path, into):
    if not os.path.exists(os.path.join(into, path)):
        print("downloading", repo, path)
        hf_hub_download(repo, path, local_dir=into, token=HF_TOKEN or None)

# ---------- ComfyUI servers, one per GPU ----------
SERVERS = []

def tail(s, n=25):
    return "\n".join(open(s["log"]).read().splitlines()[-n:])

def stop_servers(keep=0):
    gone = SERVERS[keep:]
    for s in gone:
        if s["proc"].poll() is None:
            s["proc"].terminate()
    for s in gone:
        try:
            s["proc"].wait(30)
        except subprocess.TimeoutExpired:
            s["proc"].kill()
    del SERVERS[keep:]

def spawn(gpu):
    port = 8188 + gpu
    log = f"/kaggle/temp/comfy{gpu}.log"
    proc = subprocess.Popen(
        [sys.executable, "main.py", "--listen", "127.0.0.1", "--port", str(port),
         "--output-directory", WORKING, "--disable-auto-launch"],
        cwd=COMFY, env=dict(os.environ, CUDA_VISIBLE_DEVICES=str(gpu)),
        stdout=open(log, "w"), stderr=subprocess.STDOUT)
    SERVERS.append({"gpu": gpu, "api": f"http://127.0.0.1:{port}", "proc": proc, "log": log})

def wait_ready(s):
    for _ in range(150):
        if s["proc"].poll() is not None:
            break
        try:
            urllib.request.urlopen(s["api"] + "/system_stats", timeout=2)
            return
        except Exception:
            time.sleep(2)
    raise RuntimeError("ComfyUI did not start:\n" + tail(s))

def call(s, path, data=None):
    req = urllib.request.Request(s["api"] + path, headers={"Content-Type": "application/json"},
                                 data=None if data is None else json.dumps(data).encode())
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        raise RuntimeError(e.read().decode()[:1500])

def check_nodes(s, mode):
    need = ["CLIPTextEncode", "KSampler", "VAEDecode", "SaveImage", "EmptyFlux2LatentImage", "SkipLayerGuidanceDiTSimple"]
    need += (["RebelMossGGUFV4", "RebelMossEncoderV4", "RebelMossVAEV4", "ModelSamplingSD3"] if mode["kind"] == "rebel"
             else ["UNETLoader", "CLIPLoader", "VAELoader"])
    gone = [n for n in need if n not in call(s, "/object_info/" + n)]
    if not gone and mode["kind"] == "native" and "moss_image" not in json.dumps(call(s, "/object_info/CLIPLoader")):
        gone = ["moss_image text reader"]
    if gone:
        bad = [l for l in open(s["log"]).read().splitlines() if "IMPORT FAILED" in l or "Cannot import" in l]
        raise RuntimeError(f"ComfyUI is missing {gone}. " + " | ".join(bad[-4:]))

def pick_label(s, node, field, path):
    options = call(s, "/object_info/" + node)[node]["input"]["required"][field][0]
    base = os.path.basename(path)
    for o in options:
        if o == path or o == base or o.endswith("/" + base):
            return o
    raise RuntimeError(f"{base} is not in the {node} list: {options[:5]}")

def get_labels(s, mode):
    if mode["kind"] == "rebel":
        return {"unet": pick_label(s, "RebelMossGGUFV4", "gguf", mode["unet"]),
                "te": pick_label(s, "RebelMossEncoderV4", "encoder", TE),
                "vae": pick_label(s, "RebelMossVAEV4", "vae", VAE)}
    return {"unet": pick_label(s, "UNETLoader", "unet_name", mode["unet"]),
            "te": pick_label(s, "CLIPLoader", "clip_name", TE),
            "vae": pick_label(s, "VAELoader", "vae_name", VAE)}

# ---------- the two ComfyUI recipes ----------
def graph(mode, L, seed):
    rebel = mode["kind"] == "rebel"
    steps = STEPS or (30 if rebel else 25)
    cfg = CFG or (3.0 if rebel else 2.5)
    if rebel:
        g = {
            "1": {"class_type": "RebelMossGGUFV4", "inputs": {"gguf": L["unet"], "compute_precision": "fp32"}},
            "2": {"class_type": "RebelMossEncoderV4", "inputs": {"encoder": L["te"], "device": mode.get("enc", "default")}},
            "3": {"class_type": "RebelMossVAEV4", "inputs": {"vae": L["vae"]}},
            "4": {"class_type": "ModelSamplingSD3", "inputs": {"model": ["1", 0], "shift": 5.0}},
            "5": {"class_type": "SkipLayerGuidanceDiTSimple", "inputs": {
                "model": ["4", 0], "double_layers": "", "single_layers": "22", "start_percent": 0.0, "end_percent": 1.0}},
            "6": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["2", 0], "text": PROMPT}},
            "7": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["2", 0], "text": ""}},
            "8": {"class_type": "EmptyFlux2LatentImage", "inputs": {"width": WIDTH, "height": HEIGHT, "batch_size": 1}},
            "9": {"class_type": "KSampler", "inputs": {
                "model": ["5", 0], "positive": ["6", 0], "negative": ["7", 0], "latent_image": ["8", 0],
                "seed": seed, "steps": steps, "cfg": cfg, "sampler_name": "euler", "scheduler": "sgm_uniform", "denoise": 1.0}},
        }
    else:
        g = {
            "1": {"class_type": "UNETLoader", "inputs": {"unet_name": L["unet"], "weight_dtype": "default"}},
            "2": {"class_type": "CLIPLoader", "inputs": {"clip_name": L["te"], "type": "moss_image", "device": "default"}},
            "3": {"class_type": "VAELoader", "inputs": {"vae_name": L["vae"]}},
            "5": {"class_type": "SkipLayerGuidanceDiTSimple", "inputs": {
                "model": ["1", 0], "double_layers": "", "single_layers": "22", "start_percent": 0.0, "end_percent": 0.5}},
            "6": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["2", 0], "text": PROMPT}},
            "7": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["2", 0], "text": "nsfw, worst quality, bad anatomy, watermark, jpeg artifact"}},
            "8": {"class_type": "EmptyFlux2LatentImage", "inputs": {"width": WIDTH, "height": HEIGHT, "batch_size": 1}},
            "9": {"class_type": "KSampler", "inputs": {
                "model": ["5", 0], "positive": ["6", 0], "negative": ["7", 0], "latent_image": ["8", 0],
                "seed": seed, "steps": steps, "cfg": cfg, "sampler_name": "er_sde", "scheduler": "simple", "denoise": 1.0}},
        }
    g["10"] = {"class_type": "VAEDecode", "inputs": {"samples": ["9", 0], "vae": ["3", 0]}}
    g["11"] = {"class_type": "SaveImage", "inputs": {"images": ["10", 0], "filename_prefix": f"moss_{seed}"}}
    return g

def paint(s, mode, L, seed):
    t0 = time.time()
    pid = call(s, "/prompt", {"prompt": graph(mode, L, seed)})["prompt_id"]
    while True:
        h = call(s, "/history/" + pid)
        if pid in h:
            st = h[pid]["status"]
            if st["status_str"] == "error":
                why = [m[1].get("exception_message", "") for m in st["messages"] if m[0] == "execution_error"]
                raise RuntimeError(" ".join(why).strip() or "ComfyUI reported an error")
            files = [os.path.join(WORKING, i.get("subfolder", ""), i["filename"])
                     for o in h[pid]["outputs"].values() for i in o.get("images", [])]
            for f in files:
                if Image.open(f).convert("L").getextrema()[1] == 0:
                    raise RuntimeError("the picture came out black")
                print(f"GPU {s['gpu']}: seed {seed} -> {os.path.basename(f)} in {time.time() - t0:.0f}s")
            return files
        if s["proc"].poll() is not None:
            raise RuntimeError("ComfyUI crashed:\n" + tail(s))
        time.sleep(3)

LOCK = threading.Lock()

def worker(s, mode, L, todo, made):
    if s is not SERVERS[0]:
        try:
            wait_ready(s)
        except Exception:
            print(f"GPU {s['gpu']} would not start. GPU 0 carries on.")
            return
    while True:
        with LOCK:
            if not todo:
                return
            seed = todo.pop(0)
        try:
            files = paint(s, mode, L, seed)
            with LOCK:
                made.extend(files)
        except Exception as e:
            with LOCK:
                todo.insert(0, seed)
            print(f"GPU {s['gpu']} stopped: {str(e)[:500]}")
            if "out of memory" in str(e).lower():
                print("Out of memory: set WIDTH and HEIGHT to 640 and Run All again.")
            return

# ---------- go ----------
print("A T4 is slow. Expect a few minutes per picture. Per-picture times print below.")
seeds = [(random.randrange(2**31) if SEED < 0 else SEED + i) for i in range(HOW_MANY)]
modes = plan()
if not modes:
    raise SystemExit("No model files found. Names above.")
made, todo = [], []

for mode in modes:
    print(f"\n=== {mode['name']} ===")
    made, todo = [], list(seeds)
    try:
        fetch(mode["repo"], mode["unet"], MODELS + "/diffusion_models" if mode["kind"] == "rebel" else MODELS)
        fetch(OFFICIAL, TE, MODELS)
        fetch(OFFICIAL, VAE, MODELS)
        stop_servers()
        for gpu in range(max(1, min(N_GPU, len(seeds)))):
            spawn(gpu)
        wait_ready(SERVERS[0])
        check_nodes(SERVERS[0], mode)
        labels = get_labels(SERVERS[0], mode)
        if todo:
            first = todo.pop(0)
            try:
                made += paint(SERVERS[0], mode, labels, first)
            except RuntimeError as e:
                if mode["kind"] != "rebel" or "meta" not in str(e).lower():
                    raise
                print("Retrying with the text reader on the CPU (slower).")
                mode["enc"] = "cpu"
                made += paint(SERVERS[0], mode, labels, first)
            threads = [threading.Thread(target=worker, args=(s, mode, labels, todo, made)) for s in SERVERS]
            for t in threads:
                t.start()
            for t in threads:
                t.join()
        break
    except Exception as e:
        print(f"{mode['name']} did not work: {str(e)[:700]}")
        if "out of memory" in str(e).lower():
            print("Out of memory: set WIDTH and HEIGHT to 640 and Run All again.")
else:
    stop_servers()
    raise SystemExit("No picture made. Send the lines above to Claude.")

stop_servers(1 if TUNNEL else 0)
for f in made:
    display(ShowImage(f, width=512))
if todo:
    print(f"{len(todo)} picture(s) not made. Run All again for the rest.")
if made:
    print(f"{len(made)} picture(s) saved. Download them from the Output tab on the right.")
''')

md(r'''
## Optional: ComfyUI on your PC's browser

Only runs when `TUNNEL = True`. Prints a link. Open it on your PC and you are in ComfyUI, drawing on Kaggle's GPU (the first card).
Search **Rebel** in ComfyUI to find the nodes for the community model. **Templates** has a ready-made MOSS-Image workflow for the official files. Everything you make lands in the **Output** tab here.
It uses a Cloudflare quick tunnel, so keep this tab open while you work and press **Stop** on the cell when you are done. Kaggle's rules on tunnels are unclear, so Run All and download from **Output** is the safe route.
''')
code(r'''
if not TUNNEL:
    print("TUNNEL is False. Set it to True in 'Your picture' and Run All to use this.")
else:
    assert "SERVERS" in globals() and SERVERS and SERVERS[0]["proc"].poll() is None, "Run Step 3 first, with TUNNEL = True."
    CF, CFLOG = "/kaggle/temp/cloudflared", "/kaggle/temp/tunnel.log"
    sh(f"curl -sSL -o {CF} https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 && chmod +x {CF}")
    tun = subprocess.Popen([CF, "tunnel", "--no-autoupdate", "--url", SERVERS[0]["api"]], stdout=open(CFLOG, "w"), stderr=subprocess.STDOUT)
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
