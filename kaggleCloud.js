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
 * WHAT THE PERSON ACTUALLY DOES NOW: click a button that opens Kaggle's API
 * page, click "Create New Token", copy the one long code Kaggle shows them, and
 * paste it into the box here. Once, forever. After that "Render on Kaggle"
 * uploads the notebook with their words in it, runs it on Kaggle's T4, and
 * brings the audio back into the app.
 *
 * 2026-08-21: KAGGLE CHANGED THE LOGIN AND THE OLD SETUP BECAME IMPOSSIBLE TO
 * FOLLOW. "Create New Token" no longer downloads a kaggle.json file. It shows a
 * dialog with a single long code that starts with `KGAT_`, shown once, and the
 * app was still telling people to go and find a file that their browser never
 * saved. Both work now:
 *   - a pasted `KGAT_...` code  ->  Authorization: Bearer KGAT_...
 *   - an old kaggle.json file   ->  Authorization: Basic base64(username:key)
 * A pasted code carries no username, so the username is asked for by name:
 * POST security.OAuthService/IntrospectToken with {"token"} answers
 * {"active","username","userId","scope"}. That call is also the honest test of
 * whether the code works, which matters because of the next paragraph.
 *
 * 403 IS NOT A BAD KEY. Kaggle answers 403 "Permission 'kernels.get' was denied"
 * for a private notebook that does not exist yet, which is every brand new
 * account. The old code read that as a rejected key and refused to connect, so
 * connecting would have failed for everybody. Only 401 means unauthenticated.
 * Both are verified against the live API, not assumed.
 *
 * THE API IS NOT GUESSED. Every field name, endpoint and enum below was read out
 * of Kaggle's own published SDK (`kagglesdk` 0.1.37, `kernels_api_service.py`,
 * `kaggle_http_client.py`, `security/types/oauth_service.py`) rather than from
 * memory or a blog post:
 *   - endpoint  https://api.kaggle.com/v1/{Service}/{Method}, always POST
 *   - auth      Bearer access token, or HTTP Basic username : key
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
/** Where a pasted code gets checked, and where its username comes from. */
const OAUTH_SERVICE = 'security.OAuthService';
/** The slug we own inside the user's own account. Same notebook, updated each run. */
const SLUG = 'lyricist-one-man-band';
const TITLE = 'Lyricist One Man Band';

function credDir() {
  const dir = path.join(app.getPath('userData'), 'kaggle');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Where we keep it now: either a pasted code or an old username and key. */
function authPath() { return path.join(credDir(), 'kaggle-auth.json'); }
/** Where builds 109 to 112 kept it. Still read, so nobody reconnects for free. */
function legacyPath() { return path.join(credDir(), 'kaggle.json'); }

function readToken() {
  try {
    const raw = JSON.parse(fs.readFileSync(authPath(), 'utf8'));
    if (raw && raw.token) {
      return { mode: 'token', token: String(raw.token), username: String(raw.username || '') };
    }
    if (raw && raw.username && raw.key) {
      return { mode: 'basic', username: String(raw.username), key: String(raw.key) };
    }
  } catch { /* fall through to the old file */ }
  try {
    const raw = JSON.parse(fs.readFileSync(legacyPath(), 'utf8'));
    if (raw && raw.username && raw.key) {
      return { mode: 'basic', username: String(raw.username), key: String(raw.key) };
    }
  } catch { /* not connected yet */ }
  return null;
}

function writeToken(cred) {
  fs.writeFileSync(authPath(), JSON.stringify(cred), { mode: 0o600 });
  try { fs.unlinkSync(legacyPath()); } catch { /* nothing to clean up */ }
}

/** One header for both ways in. */
function authHeader(cred) {
  if (cred.mode === 'token') return `Bearer ${cred.token}`;
  return `Basic ${Buffer.from(`${cred.username}:${cred.key}`, 'utf8').toString('base64')}`;
}

/** POST one of Kaggle's RPC methods. Resolves { status, json, text }. */
function call(method, body, cred, timeoutMs = 60000, service = SERVICE) {
  return new Promise((resolve, reject) => {
    const payload = Buffer.from(JSON.stringify(body || {}), 'utf8');
    const req = https.request(`${API}/${service}/${method}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': payload.length,
        Authorization: authHeader(cred),
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
 * Turn whatever they pasted or picked into credentials.
 *
 * Two shapes arrive here and a third one gets pasted by mistake:
 *   1. `KGAT_f6b2...` - the code Kaggle shows in the dialog now.
 *   2. `{"username":"...","key":"..."}` - the old kaggle.json, still valid.
 *   3. `export KAGGLE_API_TOKEN=KGAT_f6b2...` - the whole line off the same
 *      dialog, because Kaggle prints that line right under the code and it is
 *      the easiest thing on the page to select.
 * Quotes, smart quotes, newlines and stray spaces come along for the ride
 * whenever a credential is pasted, so they are stripped before anything is
 * tested. Same lesson as the OpenRouter key: a value can be truthy and still be
 * unusable as a header.
 */
function parseToken(text) {
  let s = String(text || '').trim();
  if (!s) throw new Error('That was empty. Copy the code Kaggle showed you and paste it in the box.');

  s = s.replace(/^export\s+/i, '').replace(/^set\s+/i, '');
  s = s.replace(/^KAGGLE_API_TOKEN\s*[=:]\s*/i, '');
  s = s.replace(/^["'‘“]+/, '').replace(/["'’”]+$/, '').trim();

  if (s.startsWith('{')) {
    let obj;
    try { obj = JSON.parse(s); } catch {
      throw new Error('That file is not complete. Pick the whole kaggle.json, or paste the code that starts with KGAT_ instead.');
    }
    const token = obj.token || obj.access_token || obj.apiToken;
    if (token) return { mode: 'token', token: String(token).trim(), username: String(obj.username || '') };
    if (obj.username && obj.key) return { mode: 'basic', username: String(obj.username), key: String(obj.key) };
    if (obj.username) throw new Error('That file has a username but no key in it. Make a new token on Kaggle and try again.');
    throw new Error('That is not a Kaggle token. Paste the long code that starts with KGAT_.');
  }

  const token = s.replace(/\s+/g, '');
  if (/^KGAT_[A-Za-z0-9_.\-]{8,}$/.test(token)) return { mode: 'token', token, username: '' };
  // A bare 32-character hex string is the OLD kind of key, the one that used to
  // sit next to a username inside kaggle.json. On its own it cannot sign in,
  // because there is no username to sign in as. Say that, rather than "invalid".
  if (/^[a-f0-9]{32}$/i.test(token)) {
    throw new Error('That is only half of it. That kind of key needs your username with it. Go back to Kaggle, click Create New Token, and paste the long code that starts with KGAT_.');
  }
  // Kaggle has changed this prefix once already, so anything long enough and
  // clean enough to be a credential gets tried rather than refused on a guess.
  if (/^[A-Za-z0-9_.\-]{24,}$/.test(token)) return { mode: 'token', token, username: '' };
  throw new Error('That is not a Kaggle token. It is one long code starting with KGAT_, from Create New Token on your Kaggle API page.');
}

/**
 * Ask Kaggle who a pasted code belongs to.
 *
 * This is the only way to learn the username from a code, and the username is
 * not optional: every notebook call below is addressed to `username/slug`. It
 * doubles as the honest yes-or-no on whether the code works, which the notebook
 * call cannot give us because a missing notebook also answers 403.
 */
async function whoAmI(token) {
  let res;
  try {
    res = await call('IntrospectToken', { token }, { mode: 'token', token }, 20000, OAUTH_SERVICE);
  } catch (e) {
    return { ok: false, offline: true, error: `Could not reach Kaggle: ${e.message}` };
  }
  if (res.status === 401 || res.status === 403 || res.status === 400) {
    return { ok: false, error: 'Kaggle would not accept that code. On your Kaggle API page click Create New Token again and paste the new code.' };
  }
  if (res.status >= 500) return { ok: false, offline: true, error: 'Kaggle is having trouble right now. Try again in a minute.' };
  if (res.status !== 200) return { ok: false, error: `Kaggle answered ${res.status}. ${String(res.text || '').slice(0, 160)}` };
  if (res.json && res.json.active === false) {
    return { ok: false, error: 'That code has been expired or replaced. Create a new token on Kaggle and paste the new code.' };
  }
  const username = String(res.json?.username || '');
  if (!username) return { ok: false, error: 'Kaggle accepted the code but did not say who it belongs to. Create a new token and try again.' };
  return { ok: true, username };
}

/** Are we connected, and does it still work? */
async function status(verify = false) {
  const cred = readToken();
  if (!cred) return { connected: false };
  if (!verify) return { connected: true, username: cred.username };

  if (cred.mode === 'token') {
    const who = await whoAmI(cred.token);
    if (who.offline) return { connected: true, username: cred.username, offline: true, error: who.error };
    if (!who.ok) return { connected: false, username: cred.username, error: who.error };
    if (who.username !== cred.username) { cred.username = who.username; writeToken(cred); }
    return { connected: true, username: who.username };
  }

  try {
    // For an old username-and-key there is nothing to introspect, so ask about
    // our own notebook. 401 is the only answer that means the key is dead: 403
    // and 404 both just mean the notebook has never been pushed.
    const res = await call('GetKernelSessionStatus', { userName: cred.username, kernelSlug: SLUG }, cred, 20000);
    if (res.status === 401) {
      return { connected: false, username: cred.username, error: 'Kaggle rejected that key. Create a new token and connect again.' };
    }
    return { connected: true, username: cred.username, everRun: res.status === 200 };
  } catch (e) {
    return { connected: true, username: cred.username, offline: true, error: e.message };
  }
}

async function connect(fileText) {
  const cred = parseToken(fileText);

  if (cred.mode === 'token') {
    const who = await whoAmI(cred.token);
    if (!who.ok) throw new Error(who.error);
    cred.username = who.username;
    writeToken(cred);
    return { ok: true, username: cred.username };
  }

  const res = await call('GetKernelSessionStatus', { userName: cred.username, kernelSlug: SLUG }, cred, 20000);
  if (res.status === 401) {
    throw new Error('Kaggle would not accept that key. On Kaggle click Create New Token and paste the code it gives you.');
  }
  if (res.status >= 500) throw new Error('Kaggle is having trouble right now. Try again in a minute.');
  // 403 and 404 are what a brand new account answers about a notebook it has
  // never had. That is not a bad key and it must not block the connection.
  writeToken(cred);
  return { ok: true, username: cred.username };
}

function disconnect() {
  try { fs.unlinkSync(authPath()); } catch { /* already gone */ }
  try { fs.unlinkSync(legacyPath()); } catch { /* already gone */ }
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

  if (push.status === 401) {
    throw new Error('Kaggle no longer accepts your code. Create a new token on Kaggle and connect again.');
  }
  if (push.status === 403) {
    // On an upload, 403 is almost always the phone check rather than the code:
    // Kaggle will not hand a free graphics card to an unverified account.
    throw new Error('Kaggle would not let this account run a notebook. Open kaggle.com/settings and verify your phone number, then try again. It is free and it is once.');
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
    if (name === 'QUEUED' || name === 'NEW_SCRIPT') say(0.15, `Waiting in Kaggle's queue, ${mins} min`);
    else if (name === 'RUNNING') say(0.5, `Kaggle is making the song, ${mins} min`);
    if (name === 'ERROR') {
      throw new Error(st.json?.failureMessage
        || `Kaggle ran it and hit an error. Open the notebook to see what it said: ${url}`);
    }
    if (TERMINAL[name] && name !== 'ERROR') break;
  }
  if (!TERMINAL[lastStatus]) {
    return { ok: false, timedOut: true, url, error: 'Kaggle is still going after an hour. It keeps running without the app, so open the notebook to collect the song.' };
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
  status, connect, disconnect, render, whoAmI, SLUG, TITLE,
  // Exposed for the offline test harness: these are the two pieces that can be
  // proved without a Kaggle account, and both of them can silently ruin a run.
  __test_parse: parseToken,
  __test_build: buildNotebook,
};
