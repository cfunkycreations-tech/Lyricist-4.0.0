/**
 * Local Demucs runner (Electron main process).
 *
 * True six-stem AI separation on the user's own machine — free, private, and
 * on the GPU when one is available. This is the real-stem engine: a drum stem
 * is only drums, a vocal stem is only vocals. The built-in DSP "Offline" engine
 * can't do that (it splits by frequency band); Demucs is an actual trained
 * source-separation model.
 *
 * Designed to work for anyone, anywhere:
 *   - locates a Python interpreter (system Python, the Windows `py` launcher, or
 *     one the user points us at via the LYRICIST_PYTHON env var),
 *   - installs Demucs + Torch into an app-private virtual environment on first
 *     use, so we never touch the user's global Python,
 *   - runs on CUDA (NVIDIA) when Torch reports a usable GPU, otherwise CPU,
 *   - htdemucs_6s gives exactly the six stems the UI shows:
 *     vocals, drums, bass, guitar, piano(=Keys), other.
 *
 * Nothing here assumes this developer's machine. If Python is missing, status()
 * says so and the UI falls back to Cloud or the DSP engine.
 */

const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

const MODEL = 'htdemucs_6s';
// Demucs stem file name -> our stem id.
const STEM_MAP = { vocals: 'vocals', drums: 'drums', bass: 'bass', guitar: 'guitar', piano: 'keys', other: 'other' };

function root() {
  const dir = path.join(app.getPath('userData'), 'demucs');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
function venvDir() { return path.join(root(), 'venv'); }
function isWin() { return process.platform === 'win32'; }
function venvPython() {
  return isWin()
    ? path.join(venvDir(), 'Scripts', 'python.exe')
    : path.join(venvDir(), 'bin', 'python');
}

// Run a command, streaming combined stdout/stderr to onLine. Resolves with the
// exit code and the collected output; never rejects on a non-zero exit.
function run(cmd, args, { onLine, cwd, env } = {}) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, windowsHide: true });
    } catch (e) {
      resolve({ code: -1, out: '', err: String(e && e.message || e) });
      return;
    }
    let out = '';
    let err = '';
    const feed = (buf, isErr) => {
      const s = buf.toString();
      if (isErr) err += s; else out += s;
      if (onLine) s.split(/\r?\n|\r/).forEach((line) => { if (line.trim()) onLine(line); });
    };
    child.stdout?.on('data', (d) => feed(d, false));
    child.stderr?.on('data', (d) => feed(d, true));
    child.on('error', (e) => resolve({ code: -1, out, err: err + String(e && e.message || e) }));
    child.on('close', (code) => resolve({ code, out, err }));
  });
}

// Candidate system Python launchers, best first.
function pythonCandidates() {
  const list = [];
  if (process.env.LYRICIST_PYTHON) list.push({ cmd: process.env.LYRICIST_PYTHON, args: [] });
  if (isWin()) {
    list.push({ cmd: 'py', args: ['-3'] });
    list.push({ cmd: 'python', args: [] });
  } else {
    list.push({ cmd: 'python3', args: [] });
    list.push({ cmd: 'python', args: [] });
  }
  return list;
}

async function findSystemPython() {
  for (const c of pythonCandidates()) {
    const r = await run(c.cmd, [...c.args, '--version']);
    if (r.code === 0 && /Python\s+3\.(9|1\d|\d\d)/.test(r.out + r.err)) return c;
  }
  return null;
}

function venvReady() { return fs.existsSync(venvPython()); }

async function demucsInstalled() {
  if (!venvReady()) return false;
  const r = await run(venvPython(), ['-c', 'import demucs, torch; print("ok")']);
  return r.code === 0 && /ok/.test(r.out);
}

async function cudaAvailable() {
  if (!venvReady()) return false;
  const r = await run(venvPython(), ['-c', 'import torch; print(torch.cuda.is_available())']);
  return /True/.test(r.out);
}

/**
 * Current local-engine status for the UI.
 * { pythonFound, ready, cuda, model }
 */
async function status() {
  const py = await findSystemPython();
  const ready = await demucsInstalled();
  const cuda = ready ? await cudaAvailable() : false;
  return { pythonFound: !!py, ready, cuda, model: MODEL };
}

/**
 * First-run setup: build the venv and install Demucs + Torch.
 * Tries a CUDA Torch build first so NVIDIA cards are used; if that fails
 * (no NVIDIA, offline, unsupported), falls back to the default (CPU) build so
 * separation still works everywhere. Streams progress lines to onProgress.
 */
async function setup(onProgress) {
  const say = (p, msg) => onProgress?.(p, msg);
  const sys = await findSystemPython();
  if (!sys) {
    return { ok: false, error: 'No Python 3 found. Install Python 3.9+ from python.org, then try again — or use Cloud/Offline.' };
  }

  if (!venvReady()) {
    say(0.05, 'Creating a private Python environment…');
    const mk = await run(sys.cmd, [...sys.args, '-m', 'venv', venvDir()], { onLine: (l) => say(0.05, l) });
    if (mk.code !== 0 || !venvReady()) {
      return { ok: false, error: 'Could not create the Python environment. ' + (mk.err || mk.out).slice(-400) };
    }
  }

  const py = venvPython();
  say(0.12, 'Updating installer…');
  await run(py, ['-m', 'pip', 'install', '--upgrade', 'pip', 'wheel'], { onLine: (l) => say(0.12, l) });

  // Try a CUDA Torch build first (broadly-compatible cu121 covers Pascal→Ada).
  say(0.2, 'Installing GPU support (Torch, CUDA)…');
  const cudaTorch = await run(
    py,
    ['-m', 'pip', 'install', 'torch', '--index-url', 'https://download.pytorch.org/whl/cu121'],
    { onLine: (l) => say(0.2, l) }
  );
  if (cudaTorch.code !== 0) {
    say(0.4, 'GPU build unavailable — installing CPU Torch…');
    const cpuTorch = await run(py, ['-m', 'pip', 'install', 'torch'], { onLine: (l) => say(0.4, l) });
    if (cpuTorch.code !== 0) {
      return { ok: false, error: 'Could not install Torch. ' + (cpuTorch.err || cpuTorch.out).slice(-400) };
    }
  }

  say(0.6, 'Installing Demucs (the separation model engine)…');
  const dem = await run(py, ['-m', 'pip', 'install', 'demucs'], { onLine: (l) => say(0.7, l) });
  if (dem.code !== 0) {
    return { ok: false, error: 'Could not install Demucs. ' + (dem.err || dem.out).slice(-400) };
  }

  const ok = await demucsInstalled();
  if (!ok) return { ok: false, error: 'Demucs did not import after install. Try again, or use Cloud/Offline.' };

  const cuda = await cudaAvailable();
  say(1, cuda ? 'Ready — GPU detected.' : 'Ready — running on CPU.');
  return { ok: true, cuda };
}

// Parse a rough 0..1 progress out of Demucs' stderr progress bar (e.g. " 42%").
function parsePct(line) {
  const m = line.match(/(\d{1,3})%/);
  if (m) { const v = +m[1]; if (v >= 0 && v <= 100) return v / 100; }
  return null;
}

/**
 * Separate one file into six stems.
 * @param inputBytes Uint8Array/Buffer of the original audio file
 * @param fileName   original name (for extension + track folder)
 * @param wantDevice 'auto' | 'gpu' | 'cpu'
 * @param onProgress (p0to1, label)
 * Returns { ok, device, stems: { vocals|drums|bass|guitar|keys|other: base64 wav } }
 */
async function separate(inputBytes, fileName, wantDevice, onProgress) {
  const say = (p, msg) => onProgress?.(p, msg);
  if (!(await demucsInstalled())) {
    return { ok: false, error: 'Local Demucs is not set up yet.', needsSetup: true };
  }

  const ext = (path.extname(fileName || '') || '.wav').toLowerCase();
  const workBase = fs.mkdtempSync(path.join(os.tmpdir(), 'lyr-demucs-'));
  const inPath = path.join(workBase, 'input' + ext);
  const outDir = path.join(workBase, 'out');
  fs.writeFileSync(inPath, Buffer.from(inputBytes));

  const hasCuda = await cudaAvailable();
  let device = 'cpu';
  if (wantDevice === 'gpu') {
    if (!hasCuda) { cleanup(workBase); return { ok: false, error: 'GPU requested but no CUDA GPU is available to Demucs. Use CPU or Auto.' }; }
    device = 'cuda';
  } else if (wantDevice === 'auto') {
    device = hasCuda ? 'cuda' : 'cpu';
  }

  say(0.02, device === 'cuda' ? 'Separating on your GPU (Demucs)…' : 'Separating on your CPU (Demucs)…');
  const args = ['-m', 'demucs', '-n', MODEL, '--device', device, '-o', outDir, inPath];
  const res = await run(venvPython(), args, {
    onLine: (l) => { const p = parsePct(l); if (p != null) say(Math.max(0.02, Math.min(0.98, p)), `Separating (${device})… ${Math.round(p * 100)}%`); },
  });

  if (res.code !== 0) {
    cleanup(workBase);
    // CUDA can die mid-run on a small card (out of memory). Signal a CPU retry.
    const oom = /out of memory|CUDA|cuda/i.test(res.err);
    return { ok: false, error: 'Demucs failed. ' + (res.err || res.out).slice(-500), cudaError: oom && device === 'cuda' };
  }

  // Locate outDir/<model>/<trackname>/<stem>.wav
  const modelDir = path.join(outDir, MODEL);
  let trackDir = null;
  try {
    const subs = fs.readdirSync(modelDir).map((d) => path.join(modelDir, d)).filter((d) => fs.statSync(d).isDirectory());
    trackDir = subs[0];
  } catch { /* handled below */ }
  if (!trackDir) { cleanup(workBase); return { ok: false, error: 'Demucs produced no output folder.' }; }

  const stems = {};
  for (const [demName, ourId] of Object.entries(STEM_MAP)) {
    const wav = path.join(trackDir, `${demName}.wav`);
    if (fs.existsSync(wav)) stems[ourId] = fs.readFileSync(wav).toString('base64');
  }
  cleanup(workBase);

  if (!Object.keys(stems).length) return { ok: false, error: 'No stem files were found after separation.' };
  say(1, 'Done');
  return { ok: true, device, stems };
}

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
}

module.exports = { status, setup, separate, MODEL };
