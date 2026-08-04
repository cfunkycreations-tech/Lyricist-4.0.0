/**
 * Stemmer Cloud — optional Demucs via Replicate (no local GPU).
 * Offline mode stays in stemmerEngine.js (light CPU, no key).
 */

import { decodeAudioFile } from './stemmerEngine.js';

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const i = result.indexOf('base64,');
      resolve(i >= 0 ? result.slice(i + 7) : result);
    };
    reader.onerror = () => reject(new Error('Could not read the audio file.'));
    reader.readAsDataURL(file);
  });
}

function b64ToArrayBuffer(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

/**
 * Run cloud stem separation.
 * @param {File|Blob} file
 * @param {string} apiKey — Replicate token
 * @param {(p:number, label:string)=>void} onProgress
 * @param {AudioContext} audioCtx
 * @returns {{ stems: Record<string, AudioBuffer>, sampleRate: number, duration: number, mode: 'cloud' }}
 */
export async function separateStemsCloud(file, apiKey, onProgress, audioCtx) {
  const report = (p, label) => {
    if (onProgress) onProgress(p, label);
  };

  if (!apiKey?.trim()) {
    throw new Error('Cloud mode needs a Replicate API key. Add it in Settings, or switch to Offline.');
  }

  const api = typeof window !== 'undefined' ? window.lyricistAPI : null;
  if (!api?.stemmerCloud) {
    throw new Error(
      'Cloud Stemmer needs the desktop app (Electron). In a browser, use Offline mode — or run Lyricist.exe.'
    );
  }

  report(0.08, 'Uploading mix to cloud Demucs…');
  const audioBase64 = await fileToBase64(file);
  const mimeType = file.type || 'audio/wav';

  report(0.2, 'Cloud Demucs running (no local GPU used)…');
  // Progress while waiting — main process polls Replicate
  let fake = 0.2;
  const tick = setInterval(() => {
    fake = Math.min(0.85, fake + 0.02);
    report(fake, 'Cloud Demucs working… this can take a minute on long songs');
  }, 2000);

  let result;
  try {
    result = await api.stemmerCloud({
      apiKey: apiKey.trim(),
      audioBase64,
      mimeType,
      fileName: file.name || 'mix',
    });
  } finally {
    clearInterval(tick);
  }

  if (!result?.ok) {
    throw new Error(result?.error || 'Cloud stem separation failed.');
  }

  report(0.9, 'Decoding cloud stems…');
  const ctx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
  const stems = {};
  const map = result.stems || {};

  // Normalize key names from Demucs
  const alias = {
    vocals: 'vocals',
    vocal: 'vocals',
    drums: 'drums',
    drum: 'drums',
    bass: 'bass',
    other: 'other',
    no_vocals: 'other',
    instrumental: 'other',
    guitar: 'guitar',
    piano: 'keys',
    keys: 'keys',
  };

  for (const [rawKey, b64] of Object.entries(map)) {
    const key = alias[rawKey.toLowerCase()] || rawKey.toLowerCase();
    try {
      const ab = b64ToArrayBuffer(b64);
      stems[key] = await decodeAudioFile(ab, ctx);
    } catch (e) {
      console.warn('Failed to decode cloud stem', rawKey, e);
    }
  }

  if (!stems.vocals && !stems.drums && !stems.bass && !stems.other) {
    throw new Error('Cloud returned stems but none could be decoded.');
  }

  // Fill missing UI slots so cards stay consistent
  const ref =
    stems.vocals || stems.other || stems.drums || stems.bass || Object.values(stems)[0];
  const silentLike = (template) => {
    const buf = ctx.createBuffer(
      template.numberOfChannels || 1,
      template.length,
      template.sampleRate
    );
    return buf;
  };

  if (!stems.guitar) {
    // Guitar not in 4-stem Demucs — use a quiet copy of "other" if present
    stems.guitar = stems.other ? stems.other : silentLike(ref);
  }
  if (!stems.keys) {
    stems.keys = silentLike(ref);
  }
  if (!stems.other) stems.other = silentLike(ref);
  if (!stems.vocals) stems.vocals = silentLike(ref);
  if (!stems.drums) stems.drums = silentLike(ref);
  if (!stems.bass) stems.bass = silentLike(ref);

  report(1, 'Cloud stems ready');
  return {
    stems,
    sampleRate: ref.sampleRate,
    duration: ref.duration,
    mode: 'cloud',
  };
}
