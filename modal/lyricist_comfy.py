"""
Lyricist — MiniMax-Music-3 on Modal.

WHY THIS IS COMFYUI AND NOT A BESPOKE INFERENCE SCRIPT
------------------------------------------------------
The app already drives ComfyUI two ways: locally at 127.0.0.1:8188, and on
Kaggle through a shipped notebook. Both post the same graph to /prompt and poll
/history. Writing a third, different inference path for Modal would mean a
third set of bugs and output that drifts from what Chris hears locally.

So this runs the same ComfyUI, with the same weights, behind the same HTTP API.
The client change is a base URL and an auth header. Nothing about the graph,
the sampler, the seed handling or the audio encoding differs from the local
engine, which means a take made here sounds like a take made on his desk.

DEPLOY
------
    pip install modal
    modal token new                        # once, links your Modal account
    modal secret create lyricist-comfy LYRICIST_TOKEN=<pick-a-long-random-string>
    modal deploy modal/lyricist_comfy.py

`modal deploy` prints the endpoint URL. Put that URL and the same token into
Settings -> Engines -> Modal in the app.

FIRST RUN IS SLOW ON PURPOSE
----------------------------
The three MiniMax files are about 12 GB. They are pulled once into a Modal
Volume and reused by every later container, so the first deploy pays the
download and nothing after it does. A cold container after that is roughly a
minute: image start, ComfyUI boot, weights mmap'd off the volume.

COST
----
GPU time is billed per second while a container is alive, and `scaledown_window`
is what decides how long one lingers after a take. 240s keeps a warm container
for the common case of rendering several takes in a row; drop it to 60 if you
would rather pay less and wait longer. Verify the current free-tier terms on
your Modal dashboard — they are a credit allowance, and the figure has changed
before.
"""

import os
import socket
import subprocess
import time

import modal

# ── weights ──────────────────────────────────────────────────────────────
# Exactly the files the Kaggle notebook and the local ComfyUI use. int8 DiT and
# the pruned text encoder, because they fit a mid-range card and Chris's local
# engine is already calibrated against their output.
REPO = "Comfy-Org/MiniMax-Music-3"
WEIGHTS = [
    ("diffusion_models", "minimax_music3_dit_int8_convrot.safetensors"),
    ("text_encoders", "minimax_music3_text_encoder_pruned_int8_convrot.safetensors"),
    ("vae", "minimax_music3_dav.safetensors"),
]

COMFY_DIR = "/root/ComfyUI"
MODELS_DIR = "/models"
COMFY_PORT = 8188

app = modal.App("lyricist-comfy")

# Weights live on a Volume, not in the image: a 12 GB image layer is slow to
# push, slow to pull, and has to be rebuilt for a one-file change.
weights_volume = modal.Volume.from_name("lyricist-minimax-weights", create_if_missing=True)

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("git", "libgl1", "libglib2.0-0", "ffmpeg")
    .pip_install(
        "torch==2.5.1",
        "torchaudio==2.5.1",
        extra_index_url="https://download.pytorch.org/whl/cu121",
    )
    .pip_install(
        "huggingface_hub[hf_transfer]==0.26.2",
        "fastapi[standard]==0.115.4",
        "httpx==0.27.2",
    )
    .run_commands(
        f"git clone --depth 1 https://github.com/comfyanonymous/ComfyUI {COMFY_DIR}",
        f"pip install -r {COMFY_DIR}/requirements.txt",
    )
    # hf_transfer makes the one-time 12 GB pull materially faster.
    .env({"HF_HUB_ENABLE_HF_TRANSFER": "1"})
)


@app.function(
    image=image,
    volumes={MODELS_DIR: weights_volume},
    timeout=60 * 60,
)
def fetch_weights():
    """
    Pull the three MiniMax files into the Volume. Idempotent — run it again
    after a model change and it only fetches what is missing.
    """
    from huggingface_hub import hf_hub_download

    for subdir, filename in WEIGHTS:
        target_dir = os.path.join(MODELS_DIR, subdir)
        os.makedirs(target_dir, exist_ok=True)
        target = os.path.join(target_dir, filename)
        if os.path.exists(target):
            print(f"have  {subdir}/{filename}")
            continue
        print(f"fetch {subdir}/{filename}")
        hf_hub_download(
            repo_id=REPO,
            filename=f"{subdir}/{filename}",
            local_dir=MODELS_DIR,
        )
    weights_volume.commit()
    print("weights ready")


def _wait_for_comfy(timeout: float = 300.0) -> None:
    """Block until ComfyUI is accepting connections, or give up loudly."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(1.0)
            if s.connect_ex(("127.0.0.1", COMFY_PORT)) == 0:
                return
        time.sleep(1.0)
    raise RuntimeError(f"ComfyUI did not come up within {timeout:.0f}s")


@app.function(
    image=image,
    gpu="A10G",
    volumes={MODELS_DIR: weights_volume},
    secrets=[modal.Secret.from_name("lyricist-comfy")],
    timeout=60 * 60,
    # How long a container lingers after a take. Long enough to render several
    # in a row without paying a cold start each time; see the cost note above.
    scaledown_window=240,
    max_containers=1,
)
@modal.concurrent(max_inputs=4)
@modal.asgi_app()
def comfy():
    """
    ComfyUI's own HTTP API, proxied, with a bearer token in front of it.

    A Modal web endpoint is public. ComfyUI has no auth of its own and its API
    will happily run arbitrary graphs and read files off the container, so
    putting it on the open internet unauthenticated would hand anyone a GPU and
    a filesystem. Every request must carry the shared token.
    """
    import httpx
    from fastapi import FastAPI, HTTPException, Request, Response

    token = os.environ.get("LYRICIST_TOKEN", "")
    if not token:
        raise RuntimeError(
            "LYRICIST_TOKEN is missing. Create it with:\n"
            "  modal secret create lyricist-comfy LYRICIST_TOKEN=<long-random-string>"
        )

    # ComfyUI resolves models relative to its own tree, so the Volume is linked
    # in rather than copied — the files are read straight off it.
    os.makedirs(f"{COMFY_DIR}/models", exist_ok=True)
    for subdir, _ in WEIGHTS:
        src = os.path.join(MODELS_DIR, subdir)
        dst = os.path.join(COMFY_DIR, "models", subdir)
        if os.path.isdir(src) and not os.path.exists(dst):
            os.symlink(src, dst)

    subprocess.Popen(
        ["python", "main.py", "--listen", "127.0.0.1", "--port", str(COMFY_PORT)],
        cwd=COMFY_DIR,
    )
    _wait_for_comfy()

    web = FastAPI(title="Lyricist ComfyUI")
    client = httpx.AsyncClient(base_url=f"http://127.0.0.1:{COMFY_PORT}", timeout=None)

    def _authorised(request: Request) -> bool:
        header = request.headers.get("authorization", "")
        supplied = header[7:] if header.lower().startswith("bearer ") else ""
        # Constant time: a plain == on a secret leaks its prefix to a patient
        # caller through response timing.
        import hmac
        return hmac.compare_digest(supplied, token)

    @web.get("/lyricist/health")
    async def health(request: Request):
        """What the app's engine picker calls to decide if Modal is reachable."""
        if not _authorised(request):
            raise HTTPException(status_code=401, detail="Bad token")
        return {"ok": True, "engine": "modal", "model": REPO}

    @web.api_route(
        "/{path:path}",
        methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "HEAD"],
    )
    async def proxy(path: str, request: Request):
        if not _authorised(request):
            raise HTTPException(status_code=401, detail="Bad token")
        body = await request.body()
        # Hop-by-hop and auth headers do not travel to the upstream.
        headers = {
            k: v for k, v in request.headers.items()
            if k.lower() not in ("host", "authorization", "content-length", "connection")
        }
        upstream = await client.request(
            request.method,
            f"/{path}",
            content=body,
            headers=headers,
            params=dict(request.query_params),
        )
        drop = ("content-encoding", "content-length", "transfer-encoding", "connection")
        return Response(
            content=upstream.content,
            status_code=upstream.status_code,
            headers={k: v for k, v in upstream.headers.items() if k.lower() not in drop},
            media_type=upstream.headers.get("content-type"),
        )

    return web


@app.local_entrypoint()
def main():
    """`modal run modal/lyricist_comfy.py` — pull the weights, then stop."""
    fetch_weights.remote()
    print("Weights are on the volume. Now: modal deploy modal/lyricist_comfy.py")
