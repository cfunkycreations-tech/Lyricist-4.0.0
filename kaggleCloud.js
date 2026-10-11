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
/**
 * THE 12 GB MODEL, SAVED ONCE IN THEIR OWN ACCOUNT.
 *
 * Chris, 2026-10-11, on every song fetching the whole model again: *"I don't
 * want to download it every fucking time. Why would I?"* Right.
 *
 * A second private notebook downloads the model once, on a plain CPU machine
 * (no graphics card hours), and keeps it as its output. Every song notebook
 * attaches that output, Kaggle mounts it under /kaggle/input, and the song
 * notebook links it in instead of downloading. Each account fetches its own
 * copy from Hugging Face, so nothing is re-hosted. Kaggle wants the slug to be
 * the title lowercased with dashes.
 */
const CACHE_SLUG = 'lyricist-model-cache';
const CACHE_TITLE = 'Lyricist Model Cache';
/**
 * THE LYRIC VIDEO (PLAN.md step 2): its own notebook and its own saved models.
 * The finished song goes up as a private dataset, the only way a Kaggle
 * notebook can read a file from this machine. Each song is a new version of
 * the same dataset and the old versions are dropped, so it never piles up.
 */
const VIDEO_SLUG = 'lyricist-lyric-video';
const VIDEO_TITLE = 'Lyricist Lyric Video';
const VIDEO_CACHE_SLUG = 'lyricist-video-models';
const VIDEO_CACHE_TITLE = 'Lyricist Video Models';
const SONG_DATASET = 'lyricist-video-song';
const SONG_DATASET_TITLE = 'Lyricist Video Song';
const DATASETS = 'datasets.DatasetApiService';
const BLOBS = 'blobs.BlobApiService';

function credDir() {
  const dir = path.join(app.getPath('userData'), 'kaggle');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Where we keep it now: either a pasted code or an old username and key. */
/**
 * WHERE A FINISHED SONG LANDS ON DISK.
 *
 * Chris ran a full song, the app said it was done, and there was nothing to
 * play: *"where are my songs? Shouldn't they be in the app?"*
 *
 * They should, and now they are twice over. Every take is written here as a
 * real file the moment it comes off Kaggle, BEFORE anything has to cross into
 * the window, so a song can never be lost to a slow bridge or a reload. The
 * window then loads it from here and files it in Recordings by itself.
 *
 * It also gives a plain answer to "where is it": a folder, with a button that
 * opens it.
 */
function songsDir() {
  const dir = path.join(app.getPath('userData'), 'songs');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

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
 * Same as download(), straight to disk. A three minute 1080p video is a few
 * hundred megabytes, which has no business sitting in memory on its way to a
 * file. Written to .part first, so a cut-off download never looks finished.
 * Resolves the size in bytes.
 */
function downloadTo(url, filePath, timeoutMs = 600000, hops = 0) {
  return new Promise((resolve, reject) => {
    if (hops > 5) { reject(new Error('Too many redirects fetching the video.')); return; }
    const part = `${filePath}.part`;
    let out = null;
    const fail = (e) => {
      if (out) out.destroy();
      fs.rm(part, { force: true }, () => reject(e));
    };
    const req = https.get(url, { headers: { 'User-Agent': 'Lyricist/4.2.0' }, timeout: timeoutMs }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        resolve(downloadTo(new URL(res.headers.location, url).toString(), filePath, timeoutMs, hops + 1));
        return;
      }
      if (res.statusCode !== 200) { res.resume(); reject(new Error(`Download failed (${res.statusCode}).`)); return; }
      let size = 0;
      out = fs.createWriteStream(part);
      res.on('data', (d) => { size += d.length; });
      res.on('error', fail);
      out.on('error', fail);
      out.on('finish', () => {
        try { fs.renameSync(part, filePath); resolve(size); } catch (e) { reject(e); }
      });
      res.pipe(out);
    });
    req.on('timeout', () => req.destroy(new Error('The download stalled.')));
    req.on('error', fail);
  });
}

/**
 * PUT a file's bytes to the upload address Kaggle hands out. No Content-Type:
 * the address is signed and Kaggle's own uploader sends none, so adding one can
 * get it refused. Content-Length is set so it never goes out in chunks.
 */
function putBytes(url, bytes, timeoutMs = 600000) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'PUT',
      headers: { 'Content-Length': bytes.length, 'User-Agent': 'Lyricist/4.2.0' },
      timeout: timeoutMs,
    }, (res) => {
      const chunks = [];
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => resolve({ status: res.statusCode, json: null, text: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('timeout', () => req.destroy(new Error('The upload to Kaggle stalled.')));
    req.on('error', reject);
    req.end(bytes);
  });
}

/** What Kaggle actually said, short, so a failure names the field that was wrong. */
const said = (r) => `(${r?.status}: ${String(r?.json?.error || r?.json?.message || r?.text || '').replace(/\s+/g, ' ').slice(0, 200)})`;

/**
 * Text into a Python triple-quoted string. Every backslash and every quote is
 * escaped, so nothing in the words can end the string early: not a triple
 * quote, and not a line that ends on a quote right before the closing three.
 */
const pyText = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');

/** A cell's text, whether the notebook keeps it as one string or a list of lines. */
const cellText = (c) => (Array.isArray(c.source) ? c.source.join('') : String(c.source || ''));

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
 * The notebook has one cell that holds CAPTION / LYRICS / DURATION / SEEDS /
 * STEPS / CFG and every other cell is plumbing, which is exactly why it can be
 * driven from here: rewrite that one cell and the rest is unchanged and proven.
 * Python triple-quoted strings, so the only thing that can break it is a stray
 * backslash or a triple quote in his words. Both get neutralised.
 *
 * SEEDS, plural. Kaggle hands out a T4 x2, two whole graphics cards, and the
 * notebook now runs a ComfyUI on each of them, so asking for two takes costs
 * about what one used to instead of a second queue, a second 12 GB fetch and a
 * second ten minute warm-up.
 */
function buildNotebook({ caption, lyrics, seconds, seed, seeds, steps, guidance, hfToken, run }) {
  const nb = JSON.parse(fs.readFileSync(notebookPath(), 'utf8'));
  // Last line of defence on the take number. Every engine behind this app reads
  // the seed as a signed 32 bit integer, and Chris hit the wall from the other
  // side: "Value 143159582127780 is greater than maximum value 2147483647".
  const SEED_MAX = 2147483647;
  const list = (Array.isArray(seeds) && seeds.length ? seeds : [seed ?? 222])
    .slice(0, 4)
    .map((n) => Math.floor(Math.abs(Number(n) || 0)) % (SEED_MAX + 1));
  const cell = [
    `CAPTION = """${pyText(caption)}"""\n`,
    '\n',
    `LYRICS = """${pyText(lyrics)}"""\n`,
    '\n',
    `DURATION = ${Math.max(10, Math.min(300, Math.round(seconds || 60)))}\n`,
    `SEEDS    = [${list.join(', ')}]\n`,
    `STEPS    = ${Math.round(steps ?? 30)}\n`,
    `CFG      = ${Number(guidance ?? 1.7)}\n`,
    // This run's own mark, put into every take's file name by the notebook.
    `RUN      = "${String(run || '').replace(/[^a-z0-9]/gi, '')}"\n`,
  ];
  // A cell's source is a list of lines in some notebooks and one string in
  // others, and the shipped one has been both. Read it either way rather than
  // assuming: guessing wrong here throws before a single note is made.
  const text = cellText;
  const songCell = nb.cells.findIndex((c) => c.cell_type === 'code' && text(c).includes('CAPTION ='));
  if (songCell < 0) throw new Error('The shipped notebook has no CAPTION cell. This is a bug in Lyricist, not in your song.');
  nb.cells[songCell].source = cell;

  // THEIR Hugging Face token, from THEIR Settings, into THEIR private notebook.
  //
  // Chris said "I don't wanna bake in my HF token" and I first read that as "do
  // not send it at all" and tore the whole path out. He meant the opposite of
  // what I heard: he was worried it was being built into the app for everybody,
  // which it never was, and what he actually wants is for the token he pastes
  // into Settings to reach Kaggle. Nothing about a token is ever compiled into
  // the installer; it lives in his config on his machine and goes out at push
  // time with his own notebook.
  //
  // Writing it into the notebook is the ONLY route. Kaggle has no API for
  // creating a Secret, so the app cannot put it anywhere better; the Secrets
  // page is a thing a person clicks. What that costs is honest and worth
  // knowing: the token sits in the source of a private notebook on his account
  // and stays in its version history. The card in EngineSetup says so, and
  // clearing the field in Settings stops it immediately.
  //
  // It is never required. Without it the 12 GB simply comes down throttled.
  const token = String(hfToken || '').trim();
  if (/^[A-Za-z0-9_-]{8,200}$/.test(token)) {
    const hfCell = nb.cells.findIndex((c) => c.cell_type === 'code' && text(c).includes('HF_TOKEN = ""'));
    if (hfCell >= 0) {
      nb.cells[hfCell].source = text(nb.cells[hfCell]).replace('HF_TOKEN = ""', `HF_TOKEN = "${token}"`);
    }
  }

  // Kaggle's own pusher flattens every cell's source to ONE string before
  // sending; a list of lines comes back as a broken notebook.
  for (const c of nb.cells) if (Array.isArray(c.source)) c.source = c.source.join('');
  return JSON.stringify(nb);
}

const TERMINAL = { COMPLETE: true, ERROR: true, CANCEL_ACKNOWLEDGED: true };

/**
 * Which files the song notebook needs, read out of the shipped notebook itself,
 * so the cache can never drift from what the song notebook asks for.
 */
function modelFiles() {
  const nb = JSON.parse(fs.readFileSync(notebookPath(), 'utf8'));
  const all = nb.cells.map((c) => (Array.isArray(c.source) ? c.source.join('') : String(c.source || ''))).join('\n');
  const repo = /REPO\s*=\s*"([^"]+)"/.exec(all)?.[1];
  const files = [...all.matchAll(/\(\s*"([\w./-]+\.safetensors)"\s*,/g)].map((m) => m[1]);
  if (!repo || !files.length) throw new Error('The shipped notebook lists no model files. This is a bug in Lyricist.');
  return { repo, files };
}

/** The notebook that downloads the model once and keeps it as its output. */
function buildCacheNotebook(hfToken) {
  const { repo, files } = modelFiles();
  const token = String(hfToken || '').trim();
  const code = [
    '# Lyricist Model Cache. Downloads the music model ONCE and keeps it as this',
    '# notebook\'s output, so every song notebook attaches it instead of fetching',
    '# 12 GB again. Runs on a CPU machine: it uses no graphics card hours.',
    'import os, shutil',
    'from huggingface_hub import hf_hub_download, login',
    '',
    `HF_TOKEN = "${/^[A-Za-z0-9_-]{8,200}$/.test(token) ? token : ''}"`,
    'if HF_TOKEN:',
    '    try:',
    '        login(HF_TOKEN)',
    '    except Exception:',
    '        print("Hugging Face token not accepted, downloading without it.")',
    '',
    `REPO = ${JSON.stringify(repo)}`,
    `FILES = ${JSON.stringify(files)}`,
    'WORK = "/kaggle/working"',
    '',
    'for remote in FILES:',
    '    print("downloading", remote, "...")',
    '    p = hf_hub_download(repo_id=REPO, filename=remote, local_dir=WORK)',
    '    print("  ->", p, f"{os.path.getsize(p)/1e9:.2f} GB")',
    '',
    '# Only the model files are kept, not the download bookkeeping.',
    'shutil.rmtree(os.path.join(WORK, ".cache"), ignore_errors=True)',
    'print("\\nSaved. Every song from now on skips this download.")',
    '',
  ].join('\n');
  return JSON.stringify({
    cells: [{ cell_type: 'code', metadata: {}, execution_count: null, outputs: [], source: code }],
    metadata: {
      kernelspec: { display_name: 'Python 3', language: 'python', name: 'python3' },
      language_info: { name: 'python' },
    },
    nbformat: 4,
    nbformat_minor: 5,
  });
}

/** Where the shipped lyric video notebook lives, packaged or in the repo. */
function videoNotebookPath() {
  const packed = path.join(process.resourcesPath || '', 'kaggle-lyric-video.ipynb');
  if (fs.existsSync(packed)) return packed;
  return path.join(__dirname, 'resources', 'kaggle-lyric-video.ipynb');
}

/** The picture and timing models, read out of the video notebook itself. */
function videoModels() {
  const nb = JSON.parse(fs.readFileSync(videoNotebookPath(), 'utf8'));
  const all = nb.cells.map(cellText).join('\n');
  const pick = (name) => new RegExp(`${name}\\s*=\\s*"([^"]+)"`).exec(all)?.[1];
  const repo = pick('SDXL_REPO');
  const file = pick('SDXL_FILE');
  const whisper = pick('WHISPER_URL');
  if (!repo || !file || !whisper) throw new Error('The shipped video notebook lists no models. This is a bug in Lyricist.');
  return { repo, file, whisper };
}

/** The notebook that saves the picture and timing models once, on a CPU machine. */
function buildVideoCacheNotebook(hfToken) {
  const { repo, file, whisper } = videoModels();
  const token = String(hfToken || '').trim();
  const code = [
    '# Lyricist Video Models. Downloads the picture and timing models ONCE and keeps',
    '# them as this notebook\'s output, so every lyric video attaches them instead of',
    '# fetching 8 GB again. Runs on a CPU machine: it uses no graphics card hours.',
    'import os, shutil, hashlib, urllib.request',
    'from huggingface_hub import hf_hub_download, login',
    '',
    `HF_TOKEN = "${/^[A-Za-z0-9_-]{8,200}$/.test(token) ? token : ''}"`,
    'if HF_TOKEN:',
    '    try:',
    '        login(HF_TOKEN)',
    '    except Exception:',
    '        print("Hugging Face token not accepted, downloading without it.")',
    '',
    `SDXL_REPO = ${JSON.stringify(repo)}`,
    `SDXL_FILE = ${JSON.stringify(file)}`,
    `WHISPER_URL = ${JSON.stringify(whisper)}`,
    'WORK = "/kaggle/working"',
    '',
    'print("downloading the picture model ...")',
    'p = hf_hub_download(repo_id=SDXL_REPO, filename=SDXL_FILE, local_dir=WORK)',
    'print("  ->", p, f"{os.path.getsize(p)/1e9:.2f} GB")',
    '',
    '# The timing model\'s address carries its own checksum: a damaged download',
    '# fails here instead of in the middle of a video.',
    'print("downloading the timing model ...")',
    'dest = os.path.join(WORK, os.path.basename(WHISPER_URL))',
    'urllib.request.urlretrieve(WHISPER_URL, dest + ".part")',
    'h = hashlib.sha256()',
    'with open(dest + ".part", "rb") as f:',
    '    for chunk in iter(lambda: f.read(1 << 20), b""):',
    '        h.update(chunk)',
    'want = WHISPER_URL.rstrip("/").split("/")[-2]',
    'if h.hexdigest() != want:',
    '    os.remove(dest + ".part")',
    '    raise RuntimeError("The timing model came down damaged. It is fetched again next time.")',
    'os.replace(dest + ".part", dest)',
    'print("  ->", dest, f"{os.path.getsize(dest)/1e9:.2f} GB")',
    '',
    '# Only the model files are kept, not the download bookkeeping.',
    'shutil.rmtree(os.path.join(WORK, ".cache"), ignore_errors=True)',
    'print("\\nSaved. Every lyric video from now on skips these downloads.")',
    '',
  ].join('\n');
  return JSON.stringify({
    cells: [{ cell_type: 'code', metadata: {}, execution_count: null, outputs: [], source: code }],
    metadata: {
      kernelspec: { display_name: 'Python 3', language: 'python', name: 'python3' },
      language_info: { name: 'python' },
    },
    nbformat: 4,
    nbformat_minor: 5,
  });
}

/** Each saved-model notebook: where it lives, what it must hold, how it is made. */
const MUSIC_CACHE = {
  slug: CACHE_SLUG, title: CACHE_TITLE, state: 'model-cache.json',
  files: () => modelFiles().files, build: buildCacheNotebook,
};
const VIDEO_CACHE = {
  slug: VIDEO_CACHE_SLUG, title: VIDEO_CACHE_TITLE, state: 'video-model-cache.json',
  files: () => { const m = videoModels(); return [m.file, m.whisper]; }, build: buildVideoCacheNotebook,
};

function cacheStatePath(spec = MUSIC_CACHE) { return path.join(credDir(), spec.state); }
function cachePushedAt(spec = MUSIC_CACHE) {
  try { return Number(JSON.parse(fs.readFileSync(cacheStatePath(spec), 'utf8')).pushedAt) || 0; } catch { return 0; }
}

/**
 * IS THE MODEL SAVED IN THEIR ACCOUNT? IF NOT, SAVE IT. NEVER HOLDS UP A SONG.
 *
 * Saved and complete: attach it. Still saving: this song downloads like before
 * and the next one uses it. Never made, failed, or missing a file: start the
 * save now on a CPU machine, alongside the song. A save that failed is only
 * tried again once a day, so a broken one cannot be re-run on every song.
 *
 * -> { attach: true } | { attach: false, saving?: true }
 */
async function modelCache(cred, hfToken, spec = MUSIC_CACHE) {
  try {
    const want = spec.files().map((f) => path.posix.basename(f));
    const st = await call('GetKernelSessionStatus', { userName: cred.username, kernelSlug: spec.slug }, cred, 20000);
    const status = st.status === 200 ? String(st.json?.status || '') : '';
    if (status === 'COMPLETE') {
      const out = await call('ListKernelSessionOutput', { userName: cred.username, kernelSlug: spec.slug, pageSize: 50 }, cred, 30000);
      const have = new Set((out.json?.files || []).map((f) => path.posix.basename(String(f.fileName || ''))));
      if (want.every((n) => have.has(n))) return { attach: true };
    } else if (status && !TERMINAL[status]) {
      return { attach: false, saving: true };
    }
    const since = Date.now() - cachePushedAt(spec);
    // A save Kaggle has not listed yet, or one that failed today: leave it.
    if (since < (status ? 24 : 0.5) * 60 * 60 * 1000) return { attach: false };

    const push = await call('SaveKernel', {
      slug: `${cred.username}/${spec.slug}`,
      newTitle: spec.title,
      text: spec.build(hfToken),
      language: 'python',
      kernelType: 'notebook',
      isPrivate: true,
      enableGpu: false,
      enableInternet: true,
      datasetDataSources: [],
      competitionDataSources: [],
      kernelDataSources: [],
      modelDataSources: [],
      categoryIds: [],
    }, cred, 120000);
    if (push.status !== 200 || push.json?.error) return { attach: false };
    fs.writeFileSync(cacheStatePath(spec), JSON.stringify({ pushedAt: Date.now() }));
    return { attach: false, saving: true };
  } catch {
    // The cache is a speed-up. Nothing about it is allowed to stop a song.
    return { attach: false };
  }
}

/**
 * WHY IT FAILED, IN WORDS THAT HELP.
 *
 * 2026-08-21. Chris pressed Make the song, waited, and got: "Kaggle ran it and
 * hit an error. Open the notebook to see what it said." He opened it and found
 * `AssertionError: No GPU. Set Accelerator to 'GPU T4 x2' and restart the
 * session`, which is instructions for a Kaggle screen he never opened, from a
 * notebook he never chose to look at. The app knew nothing and passed the buck.
 *
 * It can do better, because Kaggle hands back the whole session log. This reads
 * it and answers the actual question.
 *
 * The no-GPU case is worth naming precisely: Kaggle ACCEPTS `enableGpu` and
 * `machineShape`, records both against the notebook, and then runs the session
 * on a CPU box anyway. Proved with a throwaway probe on his account: brand new
 * notebook, both fields set and read back verbatim, quota untouched at zero
 * seconds of thirty hours, and the session still came up `nvidia-smi: command
 * not found`, `torch 2.10.0+cpu`, `count 0`. Nothing in the request is wrong and
 * no retry will fix it. That is what an unverified phone number looks like from
 * the API side, and Kaggle never says so out loud.
 */
const FAILURES = [
  {
    // Our own notebook's assertion, and the raw shape of it underneath.
    when: /No GPU\. Set Accelerator|nvidia-smi: command not found|torch\.cuda\.is_available|\+cpu \| cuda None|cuda None .*count 0/i,
    say: 'Kaggle ran it on a machine with no graphics card, so it stopped before making anything. '
      + 'Nothing is wrong with your song and nothing was used up. Kaggle does this until the account '
      + 'has a phone number on it: it accepts the request for a graphics card, then quietly gives you '
      + 'a plain one. Go to kaggle.com/settings, verify your phone, and press Make the song again. '
      + 'It is free and you only do it once.',
  },
  {
    when: /CUDA out of memory|torch\.cuda\.OutOfMemoryError/i,
    say: 'Kaggle\u2019s graphics card ran out of memory on this one. Make the song shorter, or drop the '
      + 'polish passes, and try again.',
  },
  {
    when: /No space left on device|Disk quota exceeded/i,
    say: 'Kaggle ran out of disk part way through. Open the notebook on their site and restart the '
      + 'session to clear it, then try again.',
  },
  {
    when: /Connection (refused|reset)|Temporary failure in name resolution|Max retries exceeded/i,
    say: 'Kaggle could not reach the internet to fetch the music program, so it could not start. '
      + 'That is usually a blip on their side. Try again in a few minutes.',
  },
];

/**
 * Pull the session log and turn it into one plain sentence.
 *
 * Best effort by design: a failure to read the log must never replace the
 * failure we are trying to explain.
 */
/** Kaggle sends the log as JSON records; the text is all we want out of it. */
function logText(raw) {
  let text = String(raw || '');
  try {
    text = JSON.parse(text).map((e) => String(e?.data || '')).join('\n');
  } catch { /* already plain text */ }
  return text;
}

function readFailure(raw, fallback) {
  if (!raw) return fallback;
  const text = logText(raw);

  const hit = FAILURES.find((f) => f.when.test(text));
  if (hit) return hit.say;

  // Nothing recognised: hand back the last real line rather than a shrug. The
  // noise filtered out here is what every Kaggle session prints whether it
  // worked or not, and burying the one useful line under it helps nobody.
  const lines = text.split('\n').map((l) => l.trim())
    .filter((l) => l && !/^(0\.00s|\[NbConvertApp\]|Debugger warning|to python|Note: Debugging)/.test(l));
  const lastError = [...lines].reverse().find((l) => /Error|Exception|Traceback/i.test(l));
  return lastError ? `Kaggle stopped with: ${lastError.slice(0, 300)}` : fallback;
}

async function explainFailure(cred, fallback, slug = SLUG) {
  try {
    const out = await call('ListKernelSessionOutput', {
      userName: cred.username, kernelSlug: slug, pageSize: 5,
    }, cred, 30000);
    return readFailure(out.json?.log, fallback);
  } catch {
    // Failing to read the log must never replace the failure it explains.
    return fallback;
  }
}

/** A notebook upload Kaggle turned down, in words that say what to do. */
function assertPushed(push) {
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
}

/**
 * Wait for a pushed notebook to finish. -> { status } | { stopped } | { timedOut }.
 * Throws the plain-words reason when Kaggle says it failed.
 *
 * THE LAST SONG IS NOT THIS SONG.
 *
 * Chris, 2026-10-11: waited on two three minute songs and got two thirty
 * second ones that "didn't even sound like the fucking song". Right after an
 * upload Kaggle can still answer with the PREVIOUS run's finished status, and
 * this loop took that as done and brought the old songs home. So a finished
 * or failed status only counts once this run has been seen queued or going.
 * Ten minutes without ever seeing that, and the status is believed anyway.
 */
async function watchRun(cred, slug, url, { limitMs, shouldStop = () => false, onStatus = () => {} }) {
  const started = Date.now();
  let seenThisRun = false;
  const STALE_MS = 10 * 60 * 1000;
  while (Date.now() - started < limitMs) {
    if (shouldStop()) return { stopped: true };
    await new Promise((r) => setTimeout(r, 10000));
    let st;
    try {
      st = await call('GetKernelSessionStatus', { userName: cred.username, kernelSlug: slug }, cred, 30000);
    } catch {
      continue;   // a blip in the network is not a failed render
    }
    const name = String(st.json?.status || '');
    if (name && !TERMINAL[name]) seenThisRun = true;
    if (TERMINAL[name] && !seenThisRun && Date.now() - started < STALE_MS) continue;
    onStatus(name, Math.floor((Date.now() - started) / 60000));
    if (name === 'ERROR') {
      const plain = await explainFailure(
        cred,
        st.json?.failureMessage
          || `Kaggle ran it and hit an error. Open the notebook to see what it said: ${url}`,
        slug,
      );
      throw new Error(plain);
    }
    if (TERMINAL[name]) return { status: name };
  }
  return { timedOut: true };
}

/**
 * Push the song, run it, wait, and bring the audio back.
 *
 * onProgress(fraction, message) all the way through, because this takes real
 * minutes and a button that just says "working" for twenty minutes is a button
 * people kill.
 */
/**
 * GO AND GET ANY SONG KAGGLE ALREADY FINISHED. NOBODY PRESSES ANYTHING.
 *
 * Chris, 2026-08-22: *"THEY SUPPOSED TO BE IN MY FUCKING APP CLAUDE WHEN I PUSH
 * THE FUCKING BUTTON!!!!"* He is right, and a button that recovers a song is
 * still a button he should never have had to find.
 *
 * The hole was this: the app only ever collected a song while it was sitting
 * there watching the run. A Kaggle job keeps going with the window closed, so
 * anyone who restarts, crashes, or just quits and comes back had a finished song
 * on Kaggle's server and an empty rack. That is most of the ways a two hour
 * render actually ends.
 *
 * So this runs by itself when the tab opens: ask Kaggle whether the last run
 * finished, and pull down anything whose file is not already on this machine.
 * It is cheap, it is two calls, and it costs nothing when there is nothing new.
 */
async function collect() {
  const cred = readToken();
  if (!cred) return { ok: true, collected: [], videos: [], reason: 'not connected' };
  const songs = await collectSongs(cred);
  // Its own step after the songs: nothing about a video may keep a song out.
  const videos = await collectVideos(cred);
  return { ...songs, videos };
}

async function collectSongs(cred) {
  let st;
  try {
    st = await call('GetKernelSessionStatus', { userName: cred.username, kernelSlug: SLUG }, cred, 20000);
  } catch (e) {
    return { ok: false, error: e.message };
  }
  const status = String(st.json?.status || '');
  // Still going is not a problem and not an answer. Leave it alone.
  if (!TERMINAL[status]) return { ok: true, collected: [], status };

  let out;
  try {
    out = await call('ListKernelSessionOutput', { userName: cred.username, kernelSlug: SLUG, pageSize: 50 }, cred, 60000);
  } catch (e) {
    return { ok: false, error: e.message };
  }

  const dir = songsDir();
  const files = (out.json?.files || []).filter((f) => /\.(flac|wav|mp3|ogg)$/i.test(f.fileName || ''));
  const collected = [];
  for (const f of files) {
    const filePath = path.join(dir, f.fileName);
    // Already on this machine is already collected. Never fetch twice.
    if (fs.existsSync(filePath)) continue;
    try {
      const bytes = await download(f.url);
      fs.writeFileSync(filePath, bytes);
      collected.push({ fileName: f.fileName, filePath, size: bytes.length });
    } catch { /* one that will not come down must not stop the rest */ }
  }
  return { ok: true, status, folder: dir, collected };
}

/** The same for a lyric video that finished with nobody watching. Never throws. */
async function collectVideos(cred) {
  // The run being watched brings its own files home; two downloads into the
  // same file would trip each other up.
  if (videoRunning) return [];
  try {
    const st = await call('GetKernelSessionStatus', { userName: cred.username, kernelSlug: VIDEO_SLUG }, cred, 20000);
    if (String(st.json?.status || '') !== 'COMPLETE') return [];
    const out = await call('ListKernelSessionOutput', { userName: cred.username, kernelSlug: VIDEO_SLUG, pageSize: 50 }, cred, 60000);
    const got = [];
    for (const f of (out.json?.files || []).filter((x) => /\.(mp4|lrc|srt)$/i.test(x.fileName || ''))) {
      const fileName = path.posix.basename(String(f.fileName));
      const filePath = path.join(songsDir(), fileName);
      if (fs.existsSync(filePath)) continue;
      try {
        got.push({ fileName, filePath, size: await downloadTo(f.url, filePath) });
      } catch { /* the next one may still come down */ }
    }
    return got;
  } catch {
    return [];
  }
}

async function render(song, onProgress, shouldStop = () => false) {
  const cred = readToken();
  if (!cred) throw new Error('Not connected to Kaggle yet.');
  const say = (p, msg) => { try { onProgress(p, msg); } catch { /* window gone */ } };

  // "Kaggle is making the song" while it makes two of them is a small lie that
  // Chris caught within thirty seconds of a real run. The count is known here,
  // so every line below says how many are actually being made.
  const n = Array.isArray(song?.seeds) && song.seeds.length ? song.seeds.length : 1;
  const takeWord = n === 1 ? 'the song' : n === 2 ? 'both takes' : `all ${n} takes`;

  say(0.02, n === 1 ? 'Packing your song into the notebook' : `Packing ${n} takes into the notebook`);
  const run = Date.now().toString(36);
  const text = buildNotebook({ ...song, run });

  const cache = await modelCache(cred, song?.hfToken);
  if (cache.attach) say(0.04, 'Using the model saved in your Kaggle account, no 12 GB download');
  else if (cache.saving) say(0.04, 'Saving the model to your Kaggle account, so the next song skips the 12 GB download');

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
    kernelDataSources: cache.attach ? [`${cred.username}/${CACHE_SLUG}`] : [],
    modelDataSources: [],
    categoryIds: [],
  }, cred, 120000);

  assertPushed(push);
  const url = push.json?.url || `https://www.kaggle.com/code/${cred.username}/${SLUG}`;

  say(0.1, n > 1
    ? 'Kaggle has it. Waiting for its graphics cards'
    : 'Kaggle has it. Waiting for a free graphics card');
  // Kaggle queues, then runs. A full song is minutes; give it an hour before we
  // call it lost, and poll gently so we are not the reason it gets rate limited.
  /**
   * SIX HOURS, NOT ONE.
   *
   * Measured on his own five minute run: take one finished at 6,250 seconds,
   * one hour and forty four minutes. The old one hour ceiling gave up on it
   * with the song still cooking, and every long render this app has ever made
   * would have hit it. Kaggle allows twelve hours a session, so the app is not
   * the thing that should be deciding a song has taken too long.
   */
  const LIMIT_MS = 6 * 60 * 60 * 1000;
  const watched = await watchRun(cred, SLUG, url, {
    limitMs: LIMIT_MS,
    shouldStop,
    onStatus: (name, mins) => {
      if (name === 'QUEUED' || name === 'NEW_SCRIPT') say(0.15, `Waiting in Kaggle's queue, ${mins} min`);
      else if (name === 'RUNNING') say(0.5, `Kaggle is making ${takeWord}, ${mins} min`);
    },
  });
  if (watched.stopped) return { ok: false, stopped: true, url };
  if (watched.timedOut) {
    return { ok: false, timedOut: true, url, error: 'Kaggle has been going six hours, so the app stopped watching. The run keeps going without it and the song comes in by itself when you open this tab again.' };
  }

  say(0.9, 'Fetching the audio');
  const out = await call('ListKernelSessionOutput', { userName: cred.username, kernelSlug: SLUG, pageSize: 50 }, cred, 60000);
  // Only this run's takes: every one carries its run mark in the name.
  const files = (out.json?.files || []).filter((f) => /\.(flac|wav|mp3|ogg)$/i.test(f.fileName || '')
    && String(f.fileName).includes(`_run${run}`));
  if (!files.length) {
    return { ok: false, url, error: `Kaggle finished but this song's audio is not in its output. Open the notebook to see why: ${url}` };
  }

  // EVERY take comes home, not just the last file in the list. The notebook
  // names them take1_seed222, take2_seed777 and so on, so sorting by that number
  // keeps take one first no matter which graphics card finished first.
  const order = (name) => {
    const m = /take(\d+)/i.exec(name || '');
    return m ? Number(m[1]) : 999;
  };
  files.sort((a, b) => order(a.fileName) - order(b.fileName));

  const takes = [];
  for (let i = 0; i < files.length; i += 1) {
    say(0.9 + (0.1 * i) / files.length, files.length > 1
      ? `Fetching take ${i + 1} of ${files.length}`
      : 'Fetching the audio');
    try {
      const bytes = await download(files[i].url);
      /**
       * A PATH, NOT FIFTEEN MILLION NUMBERS.
       *
       * This used to be `Array.from(bytes)`. A 20 second song is 3.5 MB and it
       * survived that; a two minute song is 15 MB, and `Array.from` turns each
       * byte into a JavaScript number, so two takes went over the bridge as
       * thirty million elements, roughly a quarter of a gigabyte once cloned.
       * That is the same shape of mistake as `listSamples()` reading 12 GB to
       * return a list of names.
       *
       * The file is written here instead and only its path travels. The window
       * asks for the bytes when it wants them, as one buffer.
       */
      const filePath = path.join(songsDir(), files[i].fileName);
      fs.writeFileSync(filePath, bytes);
      takes.push({ fileName: files[i].fileName, filePath, size: bytes.length });
    } catch (e) {
      // One take failing to download must not throw away the ones that worked.
      if (!takes.length && i === files.length - 1) throw e;
    }
  }
  if (!takes.length) {
    return { ok: false, url, error: `Kaggle made the song but the download failed. It is still on the notebook: ${url}` };
  }

  say(1, 'Done');
  // fileName stays on the result for anything still expecting one song.
  return { ok: true, url, folder: songsDir(), takes, fileName: takes[0].fileName, filePath: takes[0].filePath };
}

/**
 * PUT ONE FINISHED SONG WHERE THE VIDEO NOTEBOOK CAN READ IT.
 *
 * Kaggle's own uploader does three things and so does this: ask for an upload
 * address, PUT the bytes there, then file the upload as a new version of a
 * private dataset (or make the dataset the first time). The name carries this
 * run's mark, and the run waits until Kaggle lists that exact file as ready:
 * right after a new version Kaggle can still be showing the last song, the
 * same trap as a notebook's status.
 *
 * Every failure carries Kaggle's own status and words, so the first real press
 * of the button names whatever is wrong.
 *
 * -> { name, ref }
 */
async function uploadSong(cred, filePath, say = () => {}, shouldStop = () => false) {
  const bytes = fs.readFileSync(filePath);
  const ext = (path.extname(filePath) || '.flac').toLowerCase().replace(/[^.a-z0-9]/g, '');
  const stem = path.basename(filePath, path.extname(filePath))
    .replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'song';
  const name = `${stem}-${Date.now().toString(36)}${ext}`;

  const start = await call('StartBlobUpload', {
    type: 'DATASET',
    name,
    contentLength: bytes.length,
    lastModifiedEpochSeconds: Math.floor(Date.now() / 1000),
  }, cred, 60000, BLOBS);
  if (start.status !== 200 || !start.json?.token || !start.json?.createUrl) {
    throw new Error(`Kaggle would not take the song for the video ${said(start)}`);
  }
  const put = await putBytes(start.json.createUrl, bytes);
  if (put.status !== 200 && put.status !== 201) {
    throw new Error(`The song did not upload to Kaggle ${said(put)}`);
  }

  // A new version when the dataset is there, a new dataset when it is not.
  // Which one is tried first does not matter: Kaggle's 403 for "missing" and
  // for "not yours" look the same, so each is just tried in turn.
  const owner = cred.username;
  const files = [{ token: start.json.token }];
  const version = () => call('CreateDatasetVersion', {
    ownerSlug: owner,
    datasetSlug: SONG_DATASET,
    body: { versionNotes: `Song for the lyric video: ${name}`, deleteOldVersions: true, files },
  }, cred, 120000, DATASETS);
  const create = (licenseName) => call('CreateDataset', {
    ownerSlug: owner, slug: SONG_DATASET, title: SONG_DATASET_TITLE, licenseName, isPrivate: true, files,
  }, cred, 120000, DATASETS);
  const good = (r) => r.status === 200 && !r.json?.error;
  let made = await version();
  if (!good(made)) made = await create('copyright-authors');
  if (!good(made)) made = await create('CC0-1.0');
  if (!good(made)) throw new Error(`Kaggle would not keep the song for the video ${said(made)}`);

  say('Kaggle is unpacking the song');
  const until = Date.now() + 15 * 60 * 1000;
  let last = null;
  let names = [];
  while (Date.now() < until) {
    if (shouldStop()) return { stopped: true };
    await new Promise((r) => setTimeout(r, 5000));
    let st;
    let ls;
    try {
      st = await call('GetDatasetStatus', { ownerSlug: owner, datasetSlug: SONG_DATASET }, cred, 30000, DATASETS);
      ls = await call('ListDatasetFiles', { ownerSlug: owner, datasetSlug: SONG_DATASET, pageSize: 50 }, cred, 30000, DATASETS);
    } catch {
      continue;
    }
    last = st;
    names = (ls.json?.datasetFiles || []).map((f) => String(f.name || f.ref || ''));
    const status = String(st.json?.status || '').toUpperCase();
    if (status === 'FAILED') throw new Error(`Kaggle could not unpack the song for the video ${said(st)}`);
    const listed = names.some((n) => path.posix.basename(n) === name);
    if (status === 'READY' && listed) return { name, ref: `${owner}/${SONG_DATASET}` };
  }
  throw new Error(`Kaggle took the song but did not get it ready in fifteen minutes. Press Make the video again ${said(last)} [waiting for ${name}, listed: ${names.join(', ').slice(0, 200) || 'nothing'}]`);
}

/**
 * Put the song into the video notebook: one cell holds the file name, the
 * words and the sound, every other cell is plumbing, same as the song notebook.
 */
function buildVideoNotebook({ audioName, outName, lyrics, caption, language, hfToken }) {
  const nb = JSON.parse(fs.readFileSync(videoNotebookPath(), 'utf8'));
  const plainName = (v) => String(v || '').replace(/[^A-Za-z0-9._-]/g, '');
  const token = String(hfToken || '').trim();
  const lang = String(language || 'en').replace(/[^a-z-]/gi, '').slice(0, 8) || 'en';
  const cell = [
    `AUDIO_NAME = "${plainName(audioName)}"\n`,
    `OUT_NAME   = "${plainName(outName)}"\n`,
    '\n',
    `LYRICS = """${pyText(lyrics)}"""\n`,
    '\n',
    `CAPTION = """${pyText(caption)}"""\n`,
    '\n',
    `LANGUAGE = "${lang}"\n`,
    `HF_TOKEN = "${/^[A-Za-z0-9_-]{8,200}$/.test(token) ? token : ''}"\n`,
  ].join('');
  const at = nb.cells.findIndex((c) => c.cell_type === 'code' && cellText(c).includes('AUDIO_NAME ='));
  if (at < 0) throw new Error('The shipped video notebook has no song cell. This is a bug in Lyricist, not in your song.');
  nb.cells[at].source = cell;
  for (const c of nb.cells) if (Array.isArray(c.source)) c.source = c.source.join('');
  return JSON.stringify(nb);
}

/**
 * MAKE THE LYRIC VIDEO FOR ONE FINISHED TAKE. PLAN.md step 2.
 *
 * job: { filePath, lyrics, caption, language?, hfToken? }, filePath being a
 * take in the songs folder. The song goes up, the video notebook runs on the
 * T4s against it, and the video, the vertical chorus clips and the synced
 * lyric files land in the songs folder next to the song.
 */
let videoRunning = false;
async function renderVideo(job, onProgress, shouldStop = () => false) {
  // One at a time: it is one notebook in their account, and a second push
  // would replace the run that is going.
  if (videoRunning) return { ok: false, error: 'A video is already being made. One at a time.' };
  videoRunning = true;
  try {
    return await renderVideoNow(job, onProgress, shouldStop);
  } finally {
    videoRunning = false;
  }
}

async function renderVideoNow(job, onProgress, shouldStop) {
  const cred = readToken();
  if (!cred) throw new Error('Not connected to Kaggle yet.');
  const say = (p, msg) => { try { onProgress(p, msg); } catch { /* window gone */ } };
  const filePath = String(job?.filePath || '');
  if (!filePath || !fs.existsSync(filePath)) throw new Error('That take is not on disk any more, so there is nothing to make a video from.');
  if (!String(job?.lyrics || '').trim()) throw new Error('This take has no lyrics with it, so there are no words to put on screen.');

  say(0.02, 'Uploading the song to your Kaggle account');
  const song = await uploadSong(cred, filePath, (msg) => say(0.06, msg), shouldStop);
  if (song.stopped || shouldStop()) return { ok: false, stopped: true };
  const outName = song.name.replace(/\.[^.]+$/, '');

  const cache = await modelCache(cred, job?.hfToken, VIDEO_CACHE);
  if (cache.attach) say(0.1, 'Using the picture and timing models saved in your Kaggle account');
  else if (cache.saving) say(0.1, 'Saving the picture and timing models to your Kaggle account. This first video downloads them, so it takes longer');

  say(0.12, 'Sending the video notebook to Kaggle');
  const push = await call('SaveKernel', {
    slug: `${cred.username}/${VIDEO_SLUG}`,
    newTitle: VIDEO_TITLE,
    text: buildVideoNotebook({ ...job, audioName: song.name, outName }),
    language: 'python',
    kernelType: 'notebook',
    isPrivate: true,
    enableGpu: true,
    enableInternet: true,
    machineShape: 'NvidiaTeslaT4',   // never the P100: see render()
    datasetDataSources: [song.ref],
    competitionDataSources: [],
    kernelDataSources: cache.attach ? [`${cred.username}/${VIDEO_CACHE_SLUG}`] : [],
    modelDataSources: [],
    categoryIds: [],
  }, cred, 120000);
  assertPushed(push);
  const url = push.json?.url || `https://www.kaggle.com/code/${cred.username}/${VIDEO_SLUG}`;

  say(0.15, 'Kaggle has it. Waiting for its graphics cards');
  const watched = await watchRun(cred, VIDEO_SLUG, url, {
    limitMs: 3 * 60 * 60 * 1000,
    shouldStop,
    onStatus: (name, mins) => {
      if (name === 'QUEUED' || name === 'NEW_SCRIPT') say(0.2, `Waiting in Kaggle's queue, ${mins} min`);
      else if (name === 'RUNNING') say(0.5, `Kaggle is making the video, ${mins} min`);
    },
  });
  if (watched.stopped) return { ok: false, stopped: true, url };
  if (watched.timedOut) {
    return { ok: false, timedOut: true, url, error: 'Kaggle has been going three hours, so the app stopped watching. The video comes in by itself when you open Black Hole Studios again.' };
  }

  say(0.9, 'Fetching the video');
  const out = await call('ListKernelSessionOutput', { userName: cred.username, kernelSlug: VIDEO_SLUG, pageSize: 50 }, cred, 60000);
  // Only this run's files: every one starts with this song's own upload name.
  const files = (out.json?.files || [])
    .map((f) => ({ ...f, fileName: path.posix.basename(String(f.fileName || '')) }))
    .filter((f) => /\.(mp4|lrc|srt)$/i.test(f.fileName)
      && (f.fileName.startsWith(`${outName}-`) || f.fileName.startsWith(`${outName}.`)));
  if (!files.some((f) => /-lyric-video\.mp4$/i.test(f.fileName))) {
    return { ok: false, url, error: `Kaggle finished but the video is not in its output. Open the notebook to see why: ${url}` };
  }
  const got = [];
  for (let i = 0; i < files.length; i += 1) {
    say(0.9 + (0.1 * i) / files.length, `Fetching ${i + 1} of ${files.length}`);
    const dest = path.join(songsDir(), files[i].fileName);
    try {
      got.push({ fileName: files[i].fileName, filePath: dest, size: await downloadTo(files[i].url, dest) });
    } catch { /* one that will not come down must not stop the rest */ }
  }
  const video = got.find((g) => /-lyric-video\.mp4$/i.test(g.fileName));
  if (!video) {
    return { ok: false, url, error: `Kaggle made the video but the download failed. It is still on the notebook: ${url}` };
  }
  // How it went, from the run's own log: a video of colour washes, or with the
  // words spread evenly, still "works", and he should hear which it was.
  const log = logText(out.json?.log);
  const painted = /(\d+) of (\d+) pictures painted/.exec(log);
  const timed = /timed by (the singing|an even spread)/.exec(log);
  const notes = [
    painted && (painted[1] === '0' ? 'no pictures came out, so it uses colour washes' : `${painted[1]} of ${painted[2]} pictures painted`),
    timed && (timed[1] === 'the singing' ? 'words timed to the singing' : 'the word timing failed, so the words are spread evenly'),
  ].filter(Boolean).join(', ');
  say(1, 'Done');
  return { ok: true, url, folder: songsDir(), video: video.filePath, files: got, notes };
}

module.exports = {
  status, connect, disconnect, render, collect, whoAmI, songsDir, SLUG, TITLE,
  renderVideo, VIDEO_SLUG,
  // Exposed for the offline test harness: these are the two pieces that can be
  // proved without a Kaggle account, and both of them can silently ruin a run.
  __test_parse: parseToken,
  __test_explain: readFailure,
  __test_build: buildNotebook,
  __test_cache_build: buildCacheNotebook,
  __test_model_files: modelFiles,
  __test_video_build: buildVideoNotebook,
  __test_video_cache_build: buildVideoCacheNotebook,
  __test_video_models: videoModels,
  __test_upload_song: uploadSong,
};
