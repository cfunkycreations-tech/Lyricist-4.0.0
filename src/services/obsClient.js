import OBSWebSocket from 'obs-websocket-js';

const PASSWORD_KEY = 'lyricist.obs.password';
const PORT_KEY = 'lyricist.obs.port';
const url = () => { try { return `ws://localhost:${Number(localStorage.getItem(PORT_KEY)) || 4455}`; } catch { return 'ws://localhost:4455'; } };

// A fresh client per attempt. A connect that timed out while OBS was still
// loading left the old shared client in a state where later attempts never
// succeeded, which is how OBS came up listening and the app still gave up.
let obs = null;

export const obsState = { connected: false, error: null };
const listeners = new Set();

function announce() {
  listeners.forEach((fn) => { try { fn({ ...obsState }); } catch {} });
}

export function watchObs(fn) {
  listeners.add(fn);
  fn({ ...obsState });
  return () => listeners.delete(fn);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * NOTHING HERE MAY WAIT FOREVER. Chris's job sat on "Starting OBS…" and never
 * reached step 1: a websocket connect can simply never settle. Every call is capped.
 */
const capped = (p, ms, what) => Promise.race([
  p,
  new Promise((_, reject) => setTimeout(() => reject(new Error(`${what} took longer than ${Math.round(ms / 1000)}s`)), ms)),
]);

/**
 * A websocket failure arrives as an Event or an error with an empty message,
 * which is how Chris ended up reading "ErrorError". Say what is actually wrong.
 */
function explain(error) {
  const msg = typeof error?.message === 'string' ? error.message.trim() : '';
  if (/auth/i.test(msg)) return 'OBS asked for a WebSocket password. Put it in OBS → Tools → WebSocket Server Settings, or turn authentication off there.';
  if (msg && !/^error$/i.test(msg)) return msg;
  return 'OBS is not answering on port 4455. In OBS: Tools → WebSocket Server Settings → Enable WebSocket server, port 4455.';
}

async function tryConnect() {
  const client = new OBSWebSocket();
  const password = localStorage.getItem(PASSWORD_KEY) || undefined;
  try {
    await capped(client.connect(url(), password), 4000, 'connecting to OBS');
  } catch (e) {
    try { await client.disconnect(); } catch { /* not connected */ }
    throw e;
  }
  client.on('ConnectionClosed', () => {
    if (obs === client) { obs = null; obsState.connected = false; announce(); }
  });
  obs = client;
  obsState.connected = true;
  obsState.error = null;
  announce();
  return client;
}

/** Wait for OBS's websocket to come up, a fresh attempt every couple of seconds. */
async function waitForObs(ms) {
  const until = Date.now() + ms;
  let last = null;
  while (Date.now() < until) {
    await sleep(1500);
    try { return await tryConnect(); } catch (e) { last = e; }
  }
  throw last || new Error('OBS did not come up');
}

export async function connectObs() {
  if (obs && obsState.connected) return obs;
  try {
    return await tryConnect();
  } catch (e) {
    obsState.connected = false;
    obsState.error = explain(e);
    announce();
    throw new Error(obsState.error);
  }
}

export async function obsRequest(requestType, requestData = {}) {
  const client = await connectObs();
  return await client.call(requestType, requestData);
}

/**
 * Start recording. When OBS is closed the app opens it with --startrecording,
 * so OBS records on its own even if its websocket is slow to come up, then
 * connects to it so the recording can be stopped at the end.
 */
export async function startRecord() {
  let client = null;
  try {
    client = await connectObs();
  } catch (first) {
    const launcher = typeof window !== 'undefined' ? window.lyricistAPI?.obsLaunch : null;
    if (!launcher) throw first;
    const opened = await capped(launcher({ record: true }), 8000, 'opening OBS').catch((e) => ({ ok: false, error: e?.message }));
    if (!opened?.ok) throw new Error(opened?.error || first.message);
    // The password OBS set for its websocket, read from its config by the app.
    try {
      if (opened.password) localStorage.setItem(PASSWORD_KEY, opened.password);
      if (opened.port) localStorage.setItem(PORT_KEY, String(opened.port));
    } catch { /* session only */ }
    if (opened.already && opened.wsOn === false) {
      throw new Error('OBS is open with its WebSocket server off, so the app could not stop the recording. Close OBS and run it again: the app turns the server on when it opens OBS.');
    }
    if (!opened.already) {
      // OBS is starting and recording by itself. Connect when it is ready.
      client = await waitForObs(60000).catch(() => null);
      if (!client) return 'OBS opened and is recording on its own; the app could not connect to it to check';
      const status = await capped(client.call('GetRecordStatus'), 4000, 'asking OBS').catch(() => null);
      if (status?.outputActive) return 'OBS opened and is recording';
      await capped(client.call('StartRecord'), 6000, 'starting the OBS recording');
      return 'OBS opened and is recording';
    }
    // OBS was running but not answering: its websocket is off or still loading.
    client = await waitForObs(20000).catch(() => { throw new Error(explain(first)); });
  }
  const status = await capped(client.call('GetRecordStatus'), 4000, 'asking OBS').catch(() => null);
  if (status?.outputActive) return 'OBS was already recording';
  await capped(client.call('StartRecord'), 6000, 'starting the OBS recording');
  return 'OBS is recording';
}

export async function stopRecord() {
  const client = obs && obsState.connected ? obs : await waitForObs(15000).catch((e) => { throw new Error(explain(e)); });
  const status = await capped(client.call('GetRecordStatus'), 4000, 'asking OBS').catch(() => null);
  if (status && !status.outputActive) return 'OBS was not recording';
  await capped(client.call('StopRecord'), 6000, 'stopping the OBS recording');
  return 'OBS stopped recording';
}

export function disconnectObs() {
  try { obs?.disconnect(); } catch {}
  obs = null;
  obsState.connected = false;
  announce();
}
