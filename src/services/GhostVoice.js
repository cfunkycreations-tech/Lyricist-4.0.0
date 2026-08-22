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

/** The shipping depth from generate-ghost-audio.py. Measured, not chosen by ear. */
const GHOST_PITCH = 0.740;  // asetrate factor
const HIGHPASS_HZ = 55;
const LOWPASS_HZ = 9000;    // 6.8k was unintelligible. Leave this alone.

/**
 * WHO IT SOUNDS LIKE.
 *
 * Chris: *"can we give the ghost optional voices? Like normal male and female?
 * If you can, do it, along with its normal voice."*
 *
 * The ghost is the default and stays exactly what it was: am_adam dropped to
 * 92 Hz and filtered, the same treatment as the 102 baked demo clips, so the
 * assistant and the demo are one character.
 *
 * The other two are the same model with the treatment switched off, so they are
 * plain speech at their own natural pitch. af_heart is not an arbitrary pick:
 * it is the voice that already narrates the whole setup wizard, so choosing the
 * woman makes the app sound like one person throughout rather than three.
 *
 * `pitch: 1` means no shift at all, which also means no filtering: the highpass
 * and lowpass exist to sell the ghost, and on an untreated voice they only make
 * it sound like a telephone.
 */
export const VOICES = {
  ghost: { id: 'am_adam',    pitch: GHOST_PITCH, label: 'Ghost' },
  man:   { id: 'am_michael', pitch: 1,           label: 'Man' },
  woman: { id: 'af_heart',   pitch: 1,           label: 'Woman' },
};

/**
 * THE BAKED SAMPLES, so the picker never makes you wait.
 *
 * Chris: *"the ghost voices do work but take a long time to load. You should
 * bake in the ghost, man and woman voices, but just for the optional buttons."*
 *
 * Right, and the reason it matters is where the wait falls. Pressing a button
 * marked "Woman" and hearing nothing for a minute reads as broken. Waiting a few
 * seconds for an ANSWER does not, because you asked a question and you already
 * watched it think. So the three sample lines ship as audio and the model still
 * reads the real answers.
 *
 * These are rendered by scripts/generate-voice-samples.py using the same voices
 * and the same treatment as the live path, so the button tells the truth about
 * what the answers will sound like. They also work with no model downloaded, no
 * network, and after a failed download.
 */
const SAMPLE_URLS = import.meta.glob('../assets/ghost-vo/sample-*.mp3', {
  eager: true, query: '?url', import: 'default',
});

function sampleUrl(name) {
  const key = Object.keys(SAMPLE_URLS).find((k) => k.endsWith(`sample-${name}.mp3`));
  return key ? SAMPLE_URLS[key] : null;
}

let sampleEl = null;

/** Play the pre-rendered line for a voice. Instant, and never throws. */
export function playSample(name) {
  const url = sampleUrl(name);
  if (!url) return false;
  hush();
  try {
    if (!sampleEl) sampleEl = new Audio();
    sampleEl.pause();
    sampleEl.src = url;
    sampleEl.currentTime = 0;
    sampleEl.play().catch(() => {});
    return true;
  } catch {
    return false;
  }
}

/** Stop a sample if one is playing. */
function hushSample() {
  if (!sampleEl) return;
  try { sampleEl.pause(); } catch { /* nothing playing */ }
}

const VOICE_CHOICE_KEY = 'lyricist.ghost.voicename';

let chosen = (() => {
  try {
    const saved = localStorage.getItem(VOICE_CHOICE_KEY);
    return VOICES[saved] ? saved : 'ghost';
  } catch { return 'ghost'; }
})();

export function getVoiceName() { return chosen; }

/** Switch voices. Anything unknown falls back to the ghost rather than failing. */
export function setVoiceName(name) {
  chosen = VOICES[name] ? name : 'ghost';
  try { localStorage.setItem(VOICE_CHOICE_KEY, chosen); } catch { /* private mode */ }
  hush();
  return chosen;
}

let ttsPromise = null;      // the one load, shared by every caller
let ctx = null;
let current = null;         // what is playing, so it can be cut off
const cache = new Map();    // voice + text -> AudioBuffer, so a repeat is instant

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
    // THE RUNTIME COMES FROM DISK, NOT A CDN.
    //
    // transformers.js fetches its WebAssembly runtime from jsDelivr by default.
    // That is fine in the dev server and dies in the packaged app, which runs
    // from file:// and cannot dynamically import a remote module. Chris saw it
    // the first time he switched the voice on:
    //   "Failed to fetch dynamically imported module:
    //    https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.1/...
    //    ort-wasm-simd-threaded.jsep.mjs"
    // scripts/copy-onnx-runtime.mjs puts that file in public/ort at build time
    // and this points at the copy. Relative on purpose: the app is served from
    // file:// once installed and from / in dev, and this resolves in both.
    const { env } = await import('@huggingface/transformers');
    env.backends.onnx.wasm.wasmPaths = new URL('ort/', document.baseURI).href;
    // Threads need SharedArrayBuffer, which needs cross-origin isolation
    // headers that a file:// page does not have. One thread always works.
    env.backends.onnx.wasm.numThreads = 1;

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
  hushSample();
  if (!current) return;
  try { current.stop(); } catch { /* already finished */ }
  current = null;
}

/**
 * Say it, in the ghost's voice. Resolves when it finishes, or immediately if it
 * cannot speak. Never throws.
 */
export async function synthesize(line, name = chosen) {
  const voice = VOICES[name] || VOICES.ghost;
  const key = `${name}|${line}`;
  let buffer = cache.get(key);
  if (buffer) return buffer;

  const tts = await loadVoice();

  // Generated fast on purpose when there is a shift coming: the playback rate at
  // the other end slows it back down and takes the pitch with it. At pitch 1
  // this is exactly 1 and nothing is done to the speech at all.
  let id = voice.id;
  if (tts.voices && !tts.voices[id]) {
    // The model decides what voices exist, not this file. If a name ever goes
    // away, say so in the log and fall back rather than throwing at the user.
    console.warn(`[ghost voice] "${id}" is not in this model, using am_adam.`);
    id = 'am_adam';
  }

  const raw = await tts.generate(line, { voice: id, speed: 1 / voice.pitch });
  buffer = toBuffer(raw);
  if (cache.size > 40) cache.delete(cache.keys().next().value);
  cache.set(key, buffer);
  return buffer;
}

/** The shipping graph, in one place, so playing it and measuring it agree. */
export function ghostChain(context, buffer, name = chosen) {
  const voice = VOICES[name] || VOICES.ghost;
  const src = context.createBufferSource();
  src.buffer = buffer;
  src.playbackRate.value = voice.pitch;   // the asetrate half of the shift

  // An untreated voice goes straight out. The two filters are there to sell the
  // ghost, and on plain speech they only make it sound like a telephone.
  if (voice.pitch === 1) {
    src.connect(context.destination);
    return src;
  }

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

  const name = chosen;
  let buffer;
  try {
    buffer = await synthesize(line, name);
  } catch (e) {
    return { ok: false, error: voiceState.failed || e?.message || 'The voice did not work.' };
  }

  hush();
  const c = audio();
  const src = ghostChain(c, buffer, name);
  current = src;

  return new Promise((resolve) => {
    src.onended = () => { if (current === src) current = null; resolve({ ok: true }); };
    try { src.start(); } catch (e) { resolve({ ok: false, error: e.message }); }
  });
}
