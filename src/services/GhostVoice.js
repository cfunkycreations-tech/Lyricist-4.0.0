/**
 * THE GHOST SPEAKING ITS OWN ANSWERS.
 *
 * Chris, 2026-08-21: *"give the ghost the ability to also talk in the same voice
 * it already has, and have a toggle to turn it off and on."*
 *
 * The demo's voice is 102 mp3 files baked offline by `scripts/generate-ghost-
 * audio.py`. That works because every line it says was written months ago. An
 * assistant answers things nobody wrote down, so the voice has to be made while
 * you wait, and it has to be the SAME voice or it is a different character
 * halfway through the app.
 *
 * SAME MODEL, SAME VOICE, SAME TREATMENT. Kokoro-82M and `am_adam`, exactly what
 * the bake uses, then the shipping "clear_middle" depth reproduced here:
 *
 *     bake:  asetrate = 24000 * 0.740, aresample, atempo = 1.351
 *     here:  synthesise at speed 1.351, play back at rate 0.740
 *
 * Those are the same operation. Resampling to 74% drops the pitch to 74% and
 * stretches the clip by 1/0.74; generating it 1.351x fast first cancels the
 * stretch and leaves the pitch where it landed. That measures 92 Hz, which is
 * the pitch Chris picked, at 0% word error. Then highpass 55 and lowpass 9000,
 * the same two filters, and the 9 kHz matters: the first bake used 6.8 kHz,
 * threw away the band that separates s from t from k, and came out
 * unintelligible at 100% word error. Do not lower it.
 *
 * NOTHING HERE MAY BREAK THE ASSISTANT. Every entry point resolves rather than
 * throws. If the model will not load, the answer is still on screen to read.
 */

const MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const VOICE = 'am_adam';

/** The shipping depth from generate-ghost-audio.py. Measured, not chosen by ear. */
const PITCH = 0.740;        // asetrate factor
const SPEED = 1 / PITCH;    // 1.351, the atempo that puts the duration back
const HIGHPASS_HZ = 55;
const LOWPASS_HZ = 9000;    // 6.8k was unintelligible. Leave this alone.

let ttsPromise = null;      // the one load, shared by every caller
let ctx = null;
let current = null;         // what is playing, so it can be cut off
const cache = new Map();    // text -> AudioBuffer, so a repeat is instant

export const voiceState = { ready: false, loading: false, failed: null };

function audio() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

/**
 * Load the voice. ~86 MB the first time, cached by the browser afterwards, then
 * it is offline forever. Called on the first Speak rather than at boot, because
 * nobody should pay for a feature they have not switched on.
 */
export function loadVoice() {
  if (ttsPromise) return ttsPromise;
  voiceState.loading = true;
  ttsPromise = (async () => {
    // Aliased to the web build in vite.config.js: the package's own exports
    // map offers only the node entry, which drags node APIs into the renderer.
    const { KokoroTTS } = await import('kokoro-js');
    const tts = await KokoroTTS.from_pretrained(MODEL_ID, { dtype: 'q8', device: 'wasm' });
    voiceState.ready = true;
    voiceState.loading = false;
    return tts;
  })().catch((e) => {
    voiceState.loading = false;
    voiceState.failed = e?.message || 'The voice would not load.';
    ttsPromise = null;      // let a later attempt try again
    throw e;
  });
  return ttsPromise;
}

/**
 * Trim what gets read out loud.
 *
 * Nobody wants a bracket tag or a lyric sheet read to them by a ghost. The
 * answer stays whole on screen; this is only what the voice says.
 */
function speakable(text) {
  let t = String(text || '')
    .replace(/```[\s\S]*?```/g, ' ')          // never read a code block
    .replace(/^\s*\[[^\]\n]{1,24}\]\s*$/gm, ' ')  // [Verse], [Chorus]
    .replace(/[*_`#>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  // Long answers get their first few sentences spoken and the rest read. A
  // ghost droning through four paragraphs is worse than silence.
  if (t.length > 700) {
    const cut = t.slice(0, 700);
    const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '));
    t = stop > 200 ? cut.slice(0, stop + 1) : cut;
  }
  return t;
}

/** Kokoro's Float32 output, into something the graph can play. */
function toBuffer(raw) {
  const data = raw.audio ?? raw.data ?? raw;
  const rate = raw.sampling_rate ?? raw.sampleRate ?? 24000;
  const buf = audio().createBuffer(1, data.length, rate);
  buf.getChannelData(0).set(data);
  return buf;
}

/** Stop whatever the ghost is saying. Safe to call at any time. */
export function hush() {
  if (!current) return;
  try { current.stop(); } catch { /* already finished */ }
  current = null;
}

/**
 * Say it, in the ghost's voice. Resolves when it finishes, or immediately if it
 * cannot speak. Never throws.
 */
export async function synthesize(line) {
  let buffer = cache.get(line);
  if (buffer) return buffer;
  const tts = await loadVoice();
  // Generated fast on purpose: the playback rate at the other end slows it back
  // down and takes the pitch with it.
  const raw = await tts.generate(line, { voice: VOICE, speed: SPEED });
  buffer = toBuffer(raw);
  if (cache.size > 40) cache.delete(cache.keys().next().value);
  cache.set(line, buffer);
  return buffer;
}

/** The shipping graph, in one place, so playing it and measuring it agree. */
export function ghostChain(context, buffer) {
  const src = context.createBufferSource();
  src.buffer = buffer;
  src.playbackRate.value = PITCH;     // the asetrate half of the shift

  const hp = context.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = HIGHPASS_HZ;

  const lp = context.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = LOWPASS_HZ;

  src.connect(hp).connect(lp).connect(context.destination);
  return src;
}

export async function speak(text) {
  const line = speakable(text);
  if (!line) return { ok: true, skipped: 'nothing to say' };

  let buffer;
  try {
    buffer = await synthesize(line);
  } catch (e) {
    return { ok: false, error: voiceState.failed || e?.message || 'The voice did not work.' };
  }

  hush();
  const c = audio();
  const src = ghostChain(c, buffer);
  current = src;

  return new Promise((resolve) => {
    src.onended = () => { if (current === src) current = null; resolve({ ok: true }); };
    try { src.start(); } catch (e) { resolve({ ok: false, error: e.message }); }
  });
}
