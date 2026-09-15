import OBSWebSocket from 'obs-websocket-js';

const obs = new OBSWebSocket();
const URL = 'ws://localhost:4455';
const PASSWORD_KEY = 'lyricist.obs.password';

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

obs.on('ConnectionClosed', () => { obsState.connected = false; announce(); });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  const password = localStorage.getItem(PASSWORD_KEY) || undefined;
  await obs.connect(URL, password);
  obsState.connected = true;
  obsState.error = null;
  announce();
  return obs;
}

/**
 * Connect, and open OBS first when it is not running.
 *
 * Chris: the Ghost run is "supposed to be being recorded by obs". Recording
 * cannot depend on him remembering to start OBS, so the app starts it (main.js
 * 'obs-launch') and waits for its WebSocket server to come up.
 */
export async function connectObs({ launch = false } = {}) {
  if (obsState.connected) return obs;
  try {
    return await tryConnect();
  } catch (first) {
    const launcher = typeof window !== 'undefined' ? window.lyricistAPI?.obsLaunch : null;
    if (launch && launcher) {
      const opened = await launcher().catch((e) => ({ ok: false, error: e?.message }));
      if (opened?.ok) {
        for (let i = 0; i < 20; i++) {
          await sleep(1000);
          try { return await tryConnect(); } catch { /* still starting */ }
        }
      }
    }
    obsState.connected = false;
    obsState.error = explain(first);
    announce();
    throw new Error(obsState.error);
  }
}

export async function obsRequest(requestType, requestData = {}) {
  const client = await connectObs();
  return await client.call(requestType, requestData);
}

export async function startRecord() {
  const client = await connectObs({ launch: true });
  const status = await client.call('GetRecordStatus').catch(() => null);
  if (status?.outputActive) return;
  await client.call('StartRecord');
}

export async function stopRecord() {
  const client = await connectObs();
  const status = await client.call('GetRecordStatus').catch(() => null);
  if (status && !status.outputActive) return;
  await client.call('StopRecord');
}

export function disconnectObs() {
  try {
    obs.disconnect();
  } catch {}
  obsState.connected = false;
  announce();
}
