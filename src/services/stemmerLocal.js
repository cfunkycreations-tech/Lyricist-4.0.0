/**
 * Local Demucs — renderer side.
 *
 * Talks to the Electron main process (see demucsLocal.js) to run true six-stem
 * AI separation on the user's own GPU/CPU. Only available in the desktop app;
 * in a plain browser `available()` is false and the UI falls back to Cloud or
 * the DSP Offline engine.
 */

export function available() {
  return !!(typeof window !== 'undefined' && window.lyricistAPI?.demucsSeparate);
}

export async function localStatus() {
  if (!available()) return { ok: false, pythonFound: false, ready: false, cuda: false };
  try { return await window.lyricistAPI.demucsStatus(); }
  catch (e) { return { ok: false, error: e.message, pythonFound: false, ready: false, cuda: false }; }
}

// One-time install of Demucs + Torch. onProgress(p0to1, label).
export async function localSetup(onProgress) {
  if (!available()) return { ok: false, error: 'Local AI is only available in the desktop app.' };
  const off = window.lyricistAPI.onDemucsProgress((d) => {
    if (d.phase === 'setup') onProgress?.(d.p, d.msg);
  });
  try { return await window.lyricistAPI.demucsSetup(); }
  finally { off?.(); }
}

async function b64ToAudioBuffer(b64, ctx) {
  const bin = atob(b64);
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
  return ctx.decodeAudioData(bytes.buffer);
}

/**
 * Separate `file` into stems on the local machine.
 * device: 'auto' | 'gpu' | 'cpu'
 * Returns { stems: { id: AudioBuffer }, device } — matches the other engines.
 */
export async function separateStemsLocal(file, device, onProgress, audioCtx) {
  if (!available()) throw new Error('Local AI is only available in the desktop app.');
  const ctx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();

  const off = window.lyricistAPI.onDemucsProgress((d) => {
    if (d.phase === 'separate') onProgress?.(d.p, d.msg);
  });

  try {
    const arrayBuf = await file.arrayBuffer();
    const res = await window.lyricistAPI.demucsSeparate({
      bytes: new Uint8Array(arrayBuf),
      fileName: file.name || 'mix.wav',
      device: device || 'auto',
    });
    if (!res?.ok) {
      const err = new Error(res?.error || 'Local separation failed.');
      err.needsSetup = res?.needsSetup;
      err.cudaError = res?.cudaError;
      throw err;
    }
    const stems = {};
    for (const [id, b64] of Object.entries(res.stems || {})) {
      stems[id] = await b64ToAudioBuffer(b64, ctx);
    }
    return { stems, device: res.device };
  } finally {
    off?.();
  }
}
