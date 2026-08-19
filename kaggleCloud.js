/**
 * KAGGLE, IN ONE BUTTON.
 *
 * Chris, 2026-08-19: *"we have to figure out a way to tell people how to install
 * ComfyUI and use Kaggle because the instructions are very vague. No one's gonna
 * know how to do that except people like me and you."*
 *
 * He is right. The old answer was a notebook file on his own drive and a
 * paragraph telling people to go and find Kaggle, make an account, set the
 * Accelerator to GPU T4 x2, turn Internet on, paste their song into the right
 * cell and press Run All. That is six places to get it wrong and none of them
 * are things a songwriter should have to learn.
 *
 * Kaggle is the only free path to a FULL three-to-five minute song: 30 GPU hours
 * a week against the cloud demo's few minutes a day. So it has to stay, and it
 * has to become one button.
 *
 * WHAT THE PERSON ACTUALLY DOES NOW: click a button that opens Kaggle's token
 * page, click "Create New Token" (their browser downloads kaggle.json), then
 * click a button and pick that file. That is it, once, forever. After that
 * "Render on Kaggle" uploads the notebook with their words in it, runs it on
 * Kaggle's T4, and brings the audio back into the app.
 *
 * THE API IS NOT GUESSED. Every field name, endpoint and enum below was read out
 * of Kaggle's own published SDK (`kagglesdk` 0.1.37, `kernels_api_service.py`)
 * rather than from memory or a blog post:
 *   - endpoint  https://api.kaggle.com/v1/{Service}/{Method}, always POST
 *   - auth      HTTP Basic, username : key, straight out of kaggle.json
 *   - body      JSON, camelCase field names
 *   - status    QUEUED 0, RUNNING 1, COMPLETE 2, ERROR 3, CANCEL_REQUESTED 4,
 *               CANCEL_ACKNOWLEDGED 5, NEW_SCRIPT 6 (sent back as the NAME)
 */

const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');

const API = 'https://api.kaggle.com/v1';
const SERVICE = 'kernels.KernelsApiService';
/** The slug we own inside the user's own account. Same notebook, updated each run. */
const SLUG = 'lyricist-one-man-band';
const TITLE = 'Lyricist One Man Band';

function tokenPath() {
  const dir = path.join(app.getPath('userData'), 'kaggle');
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'kaggle.json');
}

function readToken() {
  try {
    const raw = JSON.parse(fs.readFileSync(tokenPath(), 'utf8'));
    if (raw && raw.username && raw.key) return { username: String(raw.username), key: String(raw.key) };
  } catch { /* not connected yet */ }
  return null;
}

/** POST one of Kaggle's RPC methods. Resolves { status, json, text }. */
function call(method, body, cred, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const payload = Buffer.from(JSON.stringify(body || {}), 'utf8');
    const auth = Buffer.from(`${cred.username}:${cred.key}`, 'utf8').toString('base64');
    const req = https.request(`${API}/${SERVICE}/${method}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': payload.length,
        Authorization: `Basic ${auth}`,
        'User-Agent': 'Lyricist/4.2.0',
      },
      timeout: timeoutMs,
    }, (res) => {
      const chunks = [];
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(text); } catch { /* not json, keep the text */ }
        resolve({ status: res.statusCode, json, text });
      });
    });
    req.on('timeout', () => { req.destroy(new Error('Kaggle did not answer in time.')); });
    req.on('error', reject);
    req.end(payload);
  });
}

/** Follow redirects and hand back the bytes. Kaggle's output files sit on a CDN. */
function download(url, timeoutMs = 300000, hops = 0) {
  return new Promise((resolve, reject) => {
    if (hops > 5) { reject(new Error('Too many redirects fetching the song.')); return; }
    const req = https.get(url, { headers: { 'User-Agent': 'Lyricist/4.2.0' }, timeout: timeoutMs }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        resolve(download(new URL(res.headers.location, url).toString(), timeoutMs, hops + 1));
        return;
      }
      if (res.statusCode !== 200) { res.resume(); reject(new Error(`Download failed (${res.statusCode}).`)); return; }
      const chunks = [];
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('timeout', () => req.destroy(new Error('The download stalled.')));
    req.on('error', reject);
  });
}

/**
 * Turn whatever they picked into credentials.
 *
 * Takes the CONTENTS of kaggle.json. Kaggle's own download is exactly
 * `{"username":"...","key":"..."}`, so the happy path is a straight parse, but
 * people paste all sorts of things into boxes and the error has to say which
 * thing went wrong rather than "invalid".
 */
function parseToken(text) {
  const s = String(text || '').trim();
  if (!s) throw new Error('That file was empty.');
  let obj;
  try { obj = JSON.parse(s); } catch {
    throw new Error('That is not the kaggle.json file. It should be a small file starting with {"username".');
  }
  if (!obj.username) throw new Error('That file has no "username" in it, so it is not a Kaggle token.');
  if (!obj.key) throw new Error('That file has a username but no "key". Create a new token on Kaggle and try again.');
  return { username: String(obj.username), key: String(obj.key) };
}

/** Are we connected, and does the key still work? */
async function status(verify = false) {
  const cred = readToken();
  if (!cred) return { connected: false };
  if (!verify) return { connected: true, username: cred.username };
  try {
    // Any authenticated call proves the key. Asking for our own notebook's
    // status is the cheapest one and it also tells us whether it exists yet.
    const res = await call('GetKernelSessionStatus', { userName: cred.username, kernelSlug: SLUG }, cred, 20000);
    if (res.status === 401 || res.status === 403) {
      return { connected: false, username: cred.username, error: 'Kaggle rejected that key. Create a new token and connect again.' };
    }
    // 404 just means we have never pushed the notebook, which is fine.
    return { connected: true, username: cred.username, everRun: res.status === 200 };
  } catch (e) {
    return { connected: true, username: cred.username, offline: true, error: e.message };
  }
}

async function connect(fileText) {
  const cred = parseToken(fileText);
  const res = await call('GetKernelSessionStatus', { userName: cred.username, kernelSlug: SLUG }, cred, 20000);
  if (res.status === 401 || res.status === 403) {
    throw new Error('Kaggle would not accept that key. On Kaggle, click "Expire Token" then "Create New Token", and pick the file it downloads.');
  }
  if (res.status >= 500) throw new Error('Kaggle is having trouble right now. Try again in a minute.');
  fs.writeFileSync(tokenPath(), JSON.stringify(cred), { mode: 0o600 });
  return { ok: true, username: cred.username };
}

function disconnect() {
  try { fs.unlinkSync(tokenPath()); } catch { /* already gone */ }
  return { ok: true };
}

/** Where the shipped notebook lives, packaged or in the repo. */
function notebookPath() {
  const packed = path.join(process.resourcesPath || '', 'kaggle-minimax-music3.ipynb');
  if (fs.existsSync(packed)) return packed;
  return path.join(__dirname, 'resources', 'kaggle-minimax-music3.ipynb');
}

/**
 * Put their song into the notebook.
 *
 * The notebook has one cell that holds CAPTION / LYRICS / DURATION / SEED /
 * STEPS / CFG and every other cell is plumbing, which is exactly why it can be
 * driven from here: rewrite that one cell and the rest is unchanged and proven.
 * Python triple-quoted strings, so the only thing that can break it is a stray
 * backslash or a triple quote in his words. Both get neutralised.
 */
function buildNotebook({ caption, lyrics, seconds, seed, steps, guidance }) {
  const nb = JSON.parse(fs.readFileSync(notebookPath(), 'utf8'));
  const safe = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/"""/g, '\\"\\"\\"');
  const cell = [
    `CAPTION = """${safe(caption)}"""\n`,
    '\n',
    `LYRICS = """${safe(lyrics)}"""\n`,
    '\n',
    `DURATION = ${Math.max(10, Math.min(300, Math.round(seconds || 60)))}\n`,
    `SEED     = ${Math.round(seed ?? 222)}\n`,
    `STEPS    = ${Math.round(steps ?? 30)}\n`,
    `CFG      = ${Number(guidance ?? 1.7)}\n`,
  ];
  const songCell = nb.cells.findIndex((c) => c.cell_type === 'code' && String(c.source.join('')).includes('CAPTION ='));
  if (songCell < 0) throw new Error('The shipped notebook has no CAPTION cell. This is a bug in Lyricist, not in your song.');
  nb.cells[songCell].source = cell;
  // Kaggle's own pusher flattens every cell's source to ONE string before
  // sending; a list of lines comes back as a broken notebook.
  for (const c of nb.cells) if (Array.isArray(c.source)) c.source = c.source.join('');
  return JSON.stringify(nb);
}

const TERMINAL = { COMPLETE: true, ERROR: true, CANCEL_ACKNOWLEDGED: true };

/**
 * Push the song, run it, wait, and bring the audio back.
 *
 * onProgress(fraction, message) all the way through, because this takes real
 * minutes and a button that just says "working" for twenty minutes is a button
 * people kill.
 */
async function render(song, onProgress, shouldStop = () => false) {
  const cred = readToken();
  if (!cred) throw new Error('Not connected to Kaggle yet.');
  const say = (p, msg) => { try { onProgress(p, msg); } catch { /* window gone */ } };

  say(0.02, 'Packing your song into the notebook');
  const text = buildNotebook(song);

  say(0.06, 'Uploading it to your Kaggle account');
  const push = await call('SaveKernel', {
    slug: `${cred.username}/${SLUG}`,
    newTitle: TITLE,
    text,
    language: 'python',
    kernelType: 'notebook',
    isPrivate: true,
    enableGpu: true,
    enableInternet: true,
    // T4, explicitly. Kaggle's own docs warn that the P100 is Pascal and the
    // default image's torch has no sm_60 kernels, so it reports a working GPU
    // and then dies on the first real operation. That is the same trap that ate
    // a day on his own P1000; do not let a free machine pick it.
    machineShape: 'NvidiaTeslaT4',
    datasetDataSources: [],
    competitionDataSources: [],
    kernelDataSources: [],
    modelDataSources: [],
    categoryIds: [],
  }, cred, 120000);

  if (push.status === 401 || push.status === 403) {
    throw new Error('Kaggle rejected your key. Connect again with a fresh token.');
  }
  if (push.status !== 200 || push.json?.error) {
    throw new Error(push.json?.error || `Kaggle refused the upload (${push.status}). ${push.text.slice(0, 200)}`);
  }
  const url = push.json?.url || `https://www.kaggle.com/code/${cred.username}/${SLUG}`;

  say(0.1, 'Kaggle has it. Waiting for a free graphics card');
  const started = Date.now();
  let lastStatus = '';
  // Kaggle queues, then runs. A full song is minutes; give it an hour before we
  // call it lost, and poll gently so we are not the reason it gets rate limited.
  const LIMIT_MS = 60 * 60 * 1000;
  while (Date.now() - started < LIMIT_MS) {
    if (shouldStop()) return { ok: false, stopped: true, url };
    await new Promise((r) => setTimeout(r, 10000));
    let st;
    try {
      st = await call('GetKernelSessionStatus', { userName: cred.username, kernelSlug: SLUG }, cred, 30000);
    } catch {
      continue;   // a blip in the network is not a failed render
    }
    const name = String(st.json?.status || '');
    if (name && name !== lastStatus) lastStatus = name;
    const mins = Math.floor((Date.now() - started) / 60000);
    if (name === 'QUEUED' || name === 'NEW_SCRIPT') say(0.15, `Waiting in Kaggle's queue — ${mins} min`);
    else if (name === 'RUNNING') say(0.5, `Kaggle is making the song — ${mins} min`);
    if (name === 'ERROR') {
      throw new Error(st.json?.failureMessage
        || `Kaggle ran it and hit an error. Open the notebook to see what it said: ${url}`);
    }
    if (TERMINAL[name] && name !== 'ERROR') break;
  }
  if (!TERMINAL[lastStatus]) {
    return { ok: false, timedOut: true, url, error: 'Kaggle is still going after an hour. It keeps running without the app — open the notebook to collect the song.' };
  }

  say(0.9, 'Fetching the audio');
  const out = await call('ListKernelSessionOutput', { userName: cred.username, kernelSlug: SLUG, pageSize: 50 }, cred, 60000);
  const files = (out.json?.files || []).filter((f) => /\.(flac|wav|mp3|ogg)$/i.test(f.fileName || ''));
  if (!files.length) {
    return { ok: false, url, error: `Kaggle finished but produced no audio file. Open the notebook to see why: ${url}` };
  }
  const pick = files[files.length - 1];
  const bytes = await download(pick.url);
  say(1, 'Done');
  return { ok: true, url, fileName: pick.fileName, bytes: Array.from(bytes) };
}

module.exports = {
  status, connect, disconnect, render, SLUG, TITLE,
  // Exposed for the offline test harness: these are the two pieces that can be
  // proved without a Kaggle account, and both of them can silently ruin a run.
  __test_parse: parseToken,
  __test_build: buildNotebook,
};
