/**
 * COMFYUI + MINIMAX MUSIC 3, IN ONE BUTTON.
 *
 * Chris, 2026-08-19: *"we have to figure out a way to tell people how to install
 * ComfyUI ... the instructions are very vague. No one's gonna know how to do
 * that except people like me and you."*
 *
 * What "install ComfyUI and add Music 3" used to mean, by hand: find the right
 * release, unpack a 7z, work out that the bundled torch has no kernels for your
 * card, find the right wheel index, download three weight files totalling
 * 11.9 GB into three DIFFERENT folders with exact names, write a launcher with
 * the right flags, build a workflow graph in a node editor. Nobody outside this
 * conversation is doing that.
 *
 * THIS SHIPS TO EVERYBODY, ON EVERY KIND OF MACHINE. So it assumes nothing about
 * what is in the box: it reads the actual card, says in plain words what that
 * card will do, and lets the person decide. Two things it does that a plain
 * installer would not:
 *
 * 1. IT GIVES AN HONEST TIME BEFORE THE DOWNLOAD, NOT AFTER. The speed of this
 *    model is decided almost entirely by whether the 9.2 GB text encoder fits in
 *    the card's memory. Resident, a song is minutes. Not resident, every token
 *    re-streams it and the same song is hours. Somebody on a laptop deserves to
 *    know that before spending 12 GB of their data allowance, and to be told
 *    that the free cloud and Kaggle exist and cost nothing.
 *
 * 2. IT PICKS THE TORCH BUILD BY COMPUTE CAPABILITY. A lot of the world is still
 *    on GTX 10-series and older cards. The current wheels only carry kernels for
 *    sm_75 and up, and on an older card `torch.cuda.is_available()` returns True
 *    and everything starts perfectly clean — it only dies on the first real
 *    math, with "no kernel image is available for execution on the device". So
 *    anything below sm_75 gets a build that still carries the old architectures,
 *    and the install is proved with a real matmul rather than a version string.
 *
 * Deliberately a venv and a source checkout rather than the portable 7z: Windows
 * has no built-in 7z extractor, the portable archive carries its own python with
 * the wrong torch already in it, and this way the same code path works if this
 * ever needs to run anywhere else.
 */

const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const { spawn } = require('child_process');

const COMFY_TAG = 'v0.33.1';           // the release that added the Music 3 architecture
const COMFY_ZIP = `https://github.com/comfyanonymous/ComfyUI/archive/refs/tags/${COMFY_TAG}.zip`;

/** The int8 set. The full diffusers repo is 50+ GB; this is the one that fits a real machine. */
const WEIGHTS = [
  {
    file: 'minimax_music3_dit_int8_convrot.safetensors',
    into: 'diffusion_models',
    bytes: 2_500_000_000,
    url: 'https://huggingface.co/Comfy-Org/MiniMax-Music-3/resolve/main/split_files/diffusion_models/minimax_music3_dit_int8_convrot.safetensors',
  },
  {
    file: 'minimax_music3_text_encoder_pruned_int8_convrot.safetensors',
    into: 'text_encoders',
    bytes: 9_200_000_000,
    url: 'https://huggingface.co/Comfy-Org/MiniMax-Music-3/resolve/main/split_files/text_encoders/minimax_music3_text_encoder_pruned_int8_convrot.safetensors',
  },
  {
    file: 'minimax_music3_dav.safetensors',
    into: 'vae',
    bytes: 220_000_000,
    url: 'https://huggingface.co/Comfy-Org/MiniMax-Music-3/resolve/main/split_files/vae/minimax_music3_dav.safetensors',
  },
];
const TOTAL_BYTES = WEIGHTS.reduce((n, w) => n + w.bytes, 0);

function root() {
  const dir = path.join(app.getPath('userData'), 'comfy');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
function comfyDir() { return path.join(root(), 'ComfyUI'); }
function venvDir() { return path.join(root(), 'venv'); }
function isWin() { return process.platform === 'win32'; }
function venvPython() {
  return isWin() ? path.join(venvDir(), 'Scripts', 'python.exe') : path.join(venvDir(), 'bin', 'python');
}
function modelDir(kind) {
  const d = path.join(comfyDir(), 'models', kind);
  fs.mkdirSync(d, { recursive: true });
  return d;
}

function run(cmd, args, { onLine, cwd, timeoutMs = 0 } = {}) {
  return new Promise((resolve) => {
    let child;
    try { child = spawn(cmd, args, { cwd, windowsHide: true }); }
    catch (e) { resolve({ code: -1, out: '', err: String(e?.message || e) }); return; }
    let out = ''; let err = '';
    let killer = null;
    if (timeoutMs) killer = setTimeout(() => { try { child.kill(); } catch { /* gone */ } }, timeoutMs);
    const feed = (buf, isErr) => {
      const s = buf.toString();
      if (isErr) err += s; else out += s;
      if (onLine) s.split(/\r?\n|\r/).forEach((l) => { if (l.trim()) onLine(l.trim()); });
    };
    child.stdout?.on('data', (d) => feed(d, false));
    child.stderr?.on('data', (d) => feed(d, true));
    child.on('error', (e) => { if (killer) clearTimeout(killer); resolve({ code: -1, out, err: err + String(e?.message || e) }); });
    child.on('close', (code) => { if (killer) clearTimeout(killer); resolve({ code, out, err }); });
  });
}

/**
 * What card is in this machine, and is it worth using?
 *
 * Two numbers decide it. `compute_cap` below 7.5 means no int8 tensor-core
 * kernels and no kernels at all in the current wheels. Memory below about 12 GB
 * means the 8B text encoder cannot stay resident, so every token re-streams the
 * whole model from RAM, and that is what turns minutes into hours.
 */
async function gpu() {
  const q = await run('nvidia-smi', ['--query-gpu=name,memory.total,compute_cap', '--format=csv,noheader,nounits'], { timeoutMs: 10000 });
  if (q.code !== 0 || !q.out.trim()) {
    return {
      present: false, verdict: 'none',
      headline: 'No NVIDIA graphics card found on this computer.',
      detail: 'This model only runs on NVIDIA hardware. The free cloud and Kaggle both make songs '
        + 'without one, cost nothing, and need nothing installed.',
    };
  }
  const [name, memMb, cap] = q.out.trim().split('\n')[0].split(',').map((x) => x.trim());
  const gb = Math.round((Number(memMb) || 0) / 1024);
  const capNum = Number(cap) || 0;

  // The one number that decides the speed is whether the 9.2 GB text encoder
  // fits in the card. Resident, a song is minutes; not resident, every token
  // re-streams the whole thing.
  if (gb >= 12 && capNum >= 7.5) {
    return {
      present: true, name, gb, cap: capNum, verdict: 'good',
      headline: `${name}, ${gb} GB \u2014 this will run properly.`,
      detail: 'Your card holds the whole model, so songs come out in minutes, there is no daily '
        + 'limit, and nothing you write ever leaves your computer.',
    };
  }
  if (gb >= 8 && capNum >= 7.5) {
    return {
      present: true, name, gb, cap: capNum, verdict: 'tight',
      headline: `${name}, ${gb} GB \u2014 this will work, and it will be slow.`,
      detail: 'The part that turns your words into singing is 9.2 GB on its own, so on '
        + `${gb} GB it does not quite fit and has to keep reloading. Expect tens of minutes for a `
        + 'song rather than a few. Kaggle does a full one in about 17 minutes, free, if you would '
        + 'rather not tie up your own machine.',
    };
  }
  if (capNum && capNum < 7.5) {
    return {
      present: true, name, gb, cap: capNum, verdict: 'slow',
      headline: `${name}, ${gb} GB \u2014 older card, so expect hours rather than minutes.`,
      detail: 'Cards from before the RTX generation have no kernels for the fast int8 maths this '
        + 'model uses, and this one cannot hold the 9.2 GB text encoder either. It does work \u2014 '
        + 'the installer picks a build that runs on your card \u2014 but a short clip can take '
        + 'hours. The free cloud does that in seconds, and Kaggle does a full song in about 17 '
        + 'minutes. Both are free.',
    };
  }
  return {
    present: true, name, gb, cap: capNum, verdict: 'slow',
    headline: `${name}, ${gb} GB \u2014 not much memory for this one.`,
    detail: 'The text encoder alone is 9.2 GB, so on this card it reloads constantly and songs take '
      + 'a long time. The free cloud and Kaggle are both free and much faster.',
  };
}

function pythonCandidates() {
  return isWin()
    ? [['py', ['-3.11', '-V']], ['py', ['-3', '-V']], ['python', ['-V']]]
    : [['python3', ['-V']], ['python', ['-V']]];
}

async function findSystemPython() {
  for (const [cmd, args] of pythonCandidates()) {
    const r = await run(cmd, args, { timeoutMs: 8000 });
    const v = `${r.out}${r.err}`.match(/Python (\d+)\.(\d+)/);
    if (r.code === 0 && v && Number(v[1]) === 3 && Number(v[2]) >= 9) {
      return { cmd, args: args.slice(0, -1), version: `${v[1]}.${v[2]}` };
    }
  }
  return null;
}

function installed() {
  return fs.existsSync(venvPython())
    && fs.existsSync(path.join(comfyDir(), 'main.py'))
    && WEIGHTS.every((w) => fs.existsSync(path.join(comfyDir(), 'models', w.into, w.file)));
}

/** Which weights are still missing, and how much that is in bytes. */
function missingWeights() {
  return WEIGHTS.filter((w) => {
    const p = path.join(comfyDir(), 'models', w.into, w.file);
    try { return !fs.existsSync(p) || fs.statSync(p).size < w.bytes * 0.95; }
    catch { return true; }
  });
}

async function status() {
  const py = await findSystemPython();
  const card = await gpu();
  const miss = missingWeights();
  return {
    installed: installed(),
    dir: root(),
    pythonFound: !!py,
    pythonVersion: py?.version || null,
    gpu: card,
    missingBytes: miss.reduce((n, w) => n + w.bytes, 0),
    totalBytes: TOTAL_BYTES,
  };
}

/** Download with resume, because 9.2 GB over a home line does not always arrive first go. */
function fetchTo(url, dest, onBytes, shouldStop, hops = 0) {
  return new Promise((resolve, reject) => {
    if (hops > 6) { reject(new Error('Too many redirects.')); return; }
    const part = `${dest}.part`;
    let from = 0;
    try { from = fs.statSync(part).size; } catch { /* fresh start */ }
    const headers = { 'User-Agent': 'Lyricist/4.2.0' };
    if (from > 0) headers.Range = `bytes=${from}-`;

    const req = https.get(url, { headers, timeout: 120000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        resolve(fetchTo(new URL(res.headers.location, url).toString(), dest, onBytes, shouldStop, hops + 1));
        return;
      }
      if (res.statusCode === 416) {           // already have the whole thing
        res.resume();
        try { fs.renameSync(part, dest); } catch { /* raced */ }
        resolve();
        return;
      }
      if (res.statusCode !== 200 && res.statusCode !== 206) {
        res.resume();
        reject(new Error(`Download failed (${res.statusCode}) for ${path.basename(dest)}.`));
        return;
      }
      if (res.statusCode === 200) { from = 0; try { fs.unlinkSync(part); } catch { /* none */ } }

      const out = fs.createWriteStream(part, { flags: res.statusCode === 206 ? 'a' : 'w' });
      let got = from;
      res.on('data', (d) => {
        got += d.length;
        onBytes(got, from);
        if (shouldStop()) { req.destroy(new Error('stopped')); out.end(); }
      });
      res.pipe(out);
      out.on('finish', () => {
        try { fs.renameSync(part, dest); resolve(); }
        catch (e) { reject(e); }
      });
      out.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('The download stalled. Press the button again and it picks up where it stopped.')));
    req.on('error', reject);
  });
}

function unzip(zipPath, into) {
  // Windows 10 and 11 ship bsdtar as tar.exe and it reads zip. No extra tool,
  // no PowerShell string quoting to get wrong.
  return run('tar', ['-xf', zipPath, '-C', into], { timeoutMs: 600000 });
}

/**
 * The whole install, start to finish, reporting as it goes.
 * onProgress(fraction 0..1, message)
 */
async function install(onProgress, shouldStop = () => false) {
  const say = (p, msg) => { try { onProgress(p, msg); } catch { /* window gone */ } };
  const stop = () => { if (shouldStop()) throw new Error('stopped'); };

  const py = await findSystemPython();
  if (!py) {
    return {
      ok: false,
      needsPython: true,
      error: 'This needs Python 3.9 or newer on your computer, and it is not there yet. '
        + 'Install it from python.org, tick "Add Python to PATH" in the installer, then press this button again.',
    };
  }

  const card = await gpu();
  say(0.02, `Setting up in ${root()}`);
  fs.mkdirSync(root(), { recursive: true });

  // --- ComfyUI itself -----------------------------------------------------
  if (!fs.existsSync(path.join(comfyDir(), 'main.py'))) {
    stop();
    say(0.04, 'Downloading the music program');
    const zip = path.join(root(), 'comfy.zip');
    await fetchTo(COMFY_ZIP, zip, () => {}, shouldStop);
    stop();
    say(0.08, 'Unpacking it');
    const ex = await unzip(zip, root());
    if (ex.code !== 0) return { ok: false, error: `Could not unpack ComfyUI: ${ex.err.slice(0, 300)}` };
    const unpacked = path.join(root(), `ComfyUI-${COMFY_TAG.replace(/^v/, '')}`);
    if (fs.existsSync(unpacked)) fs.renameSync(unpacked, comfyDir());
    try { fs.unlinkSync(zip); } catch { /* fine */ }
  }

  // --- python environment -------------------------------------------------
  if (!fs.existsSync(venvPython())) {
    stop();
    say(0.12, 'Building a private Python for it');
    const mk = await run(py.cmd, [...py.args, '-m', 'venv', venvDir()], { timeoutMs: 300000 });
    if (mk.code !== 0 || !fs.existsSync(venvPython())) {
      return { ok: false, error: `Could not create the Python environment: ${(mk.err || mk.out).slice(0, 300)}` };
    }
  }

  stop();
  // Below sm_75 the current wheels carry no kernels for the card and fail only
  // once real work starts, which is the most confusing failure in this whole
  // stack. The cu126 build still ships those architectures.
  const oldCard = card.present && card.cap && card.cap < 7.5;
  const torchIndex = oldCard
    ? ['--index-url', 'https://download.pytorch.org/whl/cu126']
    : ['--index-url', 'https://download.pytorch.org/whl/cu124'];
  say(0.16, oldCard
    ? 'Installing the graphics libraries — picking the build that supports your card'
    : 'Installing the graphics libraries');
  const t = await run(venvPython(), ['-m', 'pip', 'install', '--upgrade', 'pip', 'wheel'], { timeoutMs: 600000 });
  if (t.code !== 0) return { ok: false, error: `pip would not update: ${(t.err || t.out).slice(0, 300)}` };

  const ti = await run(venvPython(), ['-m', 'pip', 'install', 'torch', 'torchvision', 'torchaudio', ...torchIndex],
    { onLine: (l) => { if (/Downloading|Installing/.test(l)) say(0.22, 'Installing the graphics libraries'); }, timeoutMs: 3600000 });
  if (ti.code !== 0) return { ok: false, error: `Could not install PyTorch: ${(ti.err || ti.out).slice(-400)}` };

  stop();
  say(0.3, 'Installing the rest of what it needs');
  const rq = await run(venvPython(), ['-m', 'pip', 'install', '-r', path.join(comfyDir(), 'requirements.txt')],
    { timeoutMs: 3600000 });
  if (rq.code !== 0) return { ok: false, error: `Could not install ComfyUI's requirements: ${(rq.err || rq.out).slice(-400)}` };

  // --- prove the card actually works before spending 12 GB on weights ------
  stop();
  say(0.34, 'Checking the graphics card really works');
  const probe = await run(venvPython(), ['-c',
    'import torch;'
    + 'ok=torch.cuda.is_available();'
    + 'archs=torch.cuda.get_arch_list() if ok else [];'
    + 'r="";'
    + 'exec("try:\\n a=torch.randn(64,64,device=\'cuda\');b=a@a;torch.cuda.synchronize();r=\'MATMUL_OK\'\\nexcept Exception as e:\\n r=\'MATMUL_FAIL \'+str(e)") if ok else None;'
    + 'print(torch.__version__, ok, archs, r)'], { timeoutMs: 300000 });
  const probeOut = `${probe.out}${probe.err}`;
  if (!/MATMUL_OK/.test(probeOut)) {
    return {
      ok: false,
      error: 'PyTorch installed, but this graphics card cannot actually run the maths. The install '
        + 'stopped here rather than let you find that out halfway through your first song. '
        + 'The free cloud and Kaggle both make songs without a graphics card, free.\n\n'
        + probeOut.slice(-300),
    };
  }

  // --- weights ------------------------------------------------------------
  const miss = missingWeights();
  let done = TOTAL_BYTES - miss.reduce((n, w) => n + w.bytes, 0);
  for (const w of miss) {
    stop();
    const dest = path.join(modelDir(w.into), w.file);
    const gbTotal = (TOTAL_BYTES / 1e9).toFixed(1);
    await fetchTo(w.url, dest, (got) => {
      const overall = (done + got) / TOTAL_BYTES;
      say(0.4 + overall * 0.55, `Downloading the music brain — ${((done + got) / 1e9).toFixed(1)} of ${gbTotal} GB`);
    }, shouldStop);
    done += w.bytes;
  }

  stop();
  say(0.97, 'Writing the workflow');
  writeWorkflow();
  say(1, 'Ready');
  return { ok: true, dir: root(), gpu: card };
}

/**
 * The graph ComfyUI runs. Written here rather than asked of the user, because
 * "build this node graph" is exactly the instruction he is complaining about.
 * Same shape as the proven Kaggle notebook's graph.
 */
function writeWorkflow() {
  const dir = path.join(comfyDir(), 'user', 'default', 'workflows');
  fs.mkdirSync(dir, { recursive: true });
  const graph = {
    1: { class_type: 'UNETLoader', inputs: { unet_name: WEIGHTS[0].file, weight_dtype: 'default' } },
    2: { class_type: 'CLIPLoader', inputs: { clip_name: WEIGHTS[1].file, type: 'minimax_music3' } },
    3: { class_type: 'VAELoader', inputs: { vae_name: WEIGHTS[2].file } },
  };
  fs.writeFileSync(path.join(dir, 'Lyricist_MiniMaxMusic3.json'), JSON.stringify(graph, null, 2));
}

let child = null;

/** Start it, and wait until it actually answers before saying it is up. */
async function start(onLine) {
  if (child) return { ok: true, already: true };
  if (!installed()) return { ok: false, error: 'Not installed yet.' };
  child = spawn(venvPython(), ['main.py', '--listen', '127.0.0.1', '--port', '8188'],
    { cwd: comfyDir(), windowsHide: true });
  child.stdout?.on('data', (d) => onLine && onLine(d.toString()));
  child.stderr?.on('data', (d) => onLine && onLine(d.toString()));
  child.on('close', () => { child = null; });

  for (let i = 0; i < 90; i += 1) {
    await new Promise((r) => setTimeout(r, 1000));
    const alive = await new Promise((res) => {
      const req = require('http').get('http://127.0.0.1:8188/system_stats', { timeout: 1500 }, (r2) => {
        r2.resume(); res(r2.statusCode === 200);
      });
      req.on('error', () => res(false));
      req.on('timeout', () => { req.destroy(); res(false); });
    });
    if (alive) return { ok: true, base: 'http://127.0.0.1:8188' };
    if (!child) return { ok: false, error: 'It started and then stopped. Check the log in the app folder.' };
  }
  return { ok: false, error: 'It did not finish starting in 90 seconds.' };
}

function stopServer() {
  if (child) { try { child.kill(); } catch { /* gone */ } child = null; }
  return { ok: true };
}

module.exports = { status, gpu, install, start, stop: stopServer, root, TOTAL_BYTES };
