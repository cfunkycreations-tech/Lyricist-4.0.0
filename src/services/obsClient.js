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

export async function connectObs() {
  if (obsState.connected) return obs;

  try {
    const password = localStorage.getItem(PASSWORD_KEY) || undefined;
    await obs.connect(URL, password);
    obsState.connected = true;
    obsState.error = null;
    announce();
    return obs;
  } catch (error) {
    obsState.connected = false;
    obsState.error = error?.message || 'OBS WebSocket connection failed.';
    announce();
    throw error;
  }
}

export async function obsRequest(requestType, requestData = {}) {
  const client = await connectObs();
  return await client.call(requestType, requestData);
}

export async function startRecord() {
  const client = await connectObs();
  await client.call('StartRecord');
}

export async function stopRecord() {
  const client = await connectObs();
  await client.call('StopRecord');
}

export function disconnectObs() {
  try {
    obs.disconnect();
  } catch {}
  obsState.connected = false;
  announce();
}