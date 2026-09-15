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

/**
 * PUT THE VOICES WHERE KOKORO WILL LOOK FOR THEM.
 *
 * kokoro-js does not fetch the voice style vectors through transformers. It
 * builds this URL itself, in its own bundled code, and no configuration can
 * redirect it:
 *
 *   https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/voices/<name>.bin
 *
 * It does check the Cache Storage bucket "kokoro-voices" first, though, and that
 * is the door. The bundled copies are put into that cache under exactly those
 * URLs before the model loads, so kokoro finds them and never reaches the
 * network. Patching its bundle would have been the alternative, and a patched
 * dependency survives until the next npm install.
 *
 * Best effort throughout: if the cache API is unavailable the app simply fetches
 * as it did before, which still works when there is internet.
 */
const VOICE_CACHE = 'kokoro-voices';
const VOICE_URL = (name) => `https://huggingface.co/${MODEL_ID}/resolve/main/voices/${name}.bin`;

async function seedVoiceCache() {
  try {
    const cache = await caches.open(VOICE_CACHE);
    await Promise.all(Object.values(VOICES).map(async ({ id }) => {
      const url = VOICE_URL(id);
      if (await cache.match(url)) return;
      const local = await fetch(new URL(`kokoro/voices/${id}.bin`, document.baseURI).href);
      if (!local.ok) return;   // not bundled: kokoro will fetch it itself
      await cache.put(url, new Response(await local.arrayBuffer(), {
        headers: { 'Content-Type': 'application/octet-stream' },
      }));
    }));
  } catch {
    // No cache API, or a locked-down context. The voice still works online.
  }
}

/** The shipping depth from generate-ghost-audio.py. Measured, not chosen by ear. */
const GHOST_PITCH = 0.740;  // asetrate factor
const HIGHPASS_HZ = 55;
const LOWPASS_HZ = 9000;    // 6.8k was unintelligible. Leave this alone.

/**
 * WARMER, AND EXACTLY AS FAST AS HE WANTS IT.
 *
 * Chris, 2026-09-15: *"make the ghost voice warmer with fine grain control of
 * speed."*
 *
 * SPEED IS ASKED OF THE MODEL, NOT OF PLAYBACK. Kokoro says the words faster or
 * slower at the same pitch. Turning playbackRate instead would drag the pitch
 * along, so a slower ghost would also come out deeper. Hundredths, 0.50× to 1.50×.
 *
 * WARMTH IS TONE, AFTER THE VOICE. More body low down, the hard edge around
 * 3 kHz and the hiss up top eased back, and a gentle compressor so it sits close,
 * like a voice on a good mic. 0 is the voice exactly as it was. It works on all
 * three voices: nothing here cuts bands away the way the ghost's highpass and
 * lowpass do, so it never turns into a telephone.
 */
const SPEED_KEY = 'lyricist.ghost.voicespeed';
const WARMTH_KEY = 'lyricist.ghost.voicewarmth';
export const SPEED_MIN = 0.5;
export const SPEED_MAX = 1.5;

function readSetting(key, fallback, lo, hi) {
  try {
    const v = parseFloat(localStorage.getItem(key));
    return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;
  } catch {
    return fallback;
  }
}

let voiceSpeed = readSetting(SPEED_KEY, 1, SPEED_MIN, SPEED_MAX);
let voiceWarmth = readSetting(WARMTH_KEY, 60, 0, 100);

export const getVoiceSpeed = () => voiceSpeed;
/** Set the speed, to the hundredth. Anything out of range is clamped, not refused. */
export function setVoiceSpeed(v) {
  const n = parseFloat(v);
  if (!Number.isFinite(n)) return voiceSpeed;
  voiceSpeed = Math.round(Math.min(SPEED_MAX, Math.max(SPEED_MIN, n)) * 100) / 100;
  try { localStorage.setItem(SPEED_KEY, String(voiceSpeed)); } catch { /* private mode */ }
  return voiceSpeed;
}

export const getVoiceWarmth = () => voiceWarmth;
/** 0 (the voice as it was) to 100 (as warm as it goes). Takes effect on the next line. */
export function setVoiceWarmth(v) {
  const n = parseFloat(v);
  if (!Number.isFinite(n)) return voiceWarmth;
  voiceWarmth = Math.round(Math.min(100, Math.max(0, n)));
  try { localStorage.setItem(WARMTH_KEY, String(voiceWarmth)); } catch { /* private mode */ }
  return voiceWarmth;
}

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

// backend: 'webgpu' | 'wasm' | null -- which route loadVoice() actually got.
// Worth surfacing in Settings: it is the difference between a ghost that keeps
// up on camera and one that stalls the app mid-take.
export const voiceState = { ready: false, loading: false, failed: null, backend: null };

function audio() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

/**
 * Load the voice.
 *
 * Nothing is downloaded: the model ships inside the app. This is reading ~92 MB
 * off disk and handing it to the WebAssembly runtime, which takes a couple of
 * seconds the first time and nothing after that. Still lazy rather than done at
 * boot, because a person who never turns the voice on should never pay for it.
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

    // THE MODEL SHIPS WITH THE APP. Chris asked for the whole thing bundled, so
    // there is no 92 MB fetch on first use and no network needed at all.
    // scripts/fetch-ghost-voice-model.mjs puts it in public/kokoro at build
    // time, laid out the way transformers resolves a local model:
    // <localModelPath>/<model id>/onnx/model_quantized.onnx.
    env.allowLocalModels = true;
    env.localModelPath = new URL('kokoro/', document.baseURI).href;
    // Nothing may quietly fall back to the hub. If the bundled copy is broken,
    // that is a packaging bug and it should be loud, not papered over by a
    // download the user did not ask for.
    env.allowRemoteModels = false;
    env.useBrowserCache = false;   // reading local files, nothing to cache

    await seedVoiceCache();

    // Aliased to the web build in vite.config.js: the package's own exports
    // map offers only the node entry, which drags node APIs into the renderer.
    const { KokoroTTS } = await import('kokoro-js');

    // WEBGPU FIRST, WASM AS THE FLOOR.
    //
    // The one-thread limit above is real and unfixable from file://:
    // SharedArrayBuffer needs cross-origin isolation we cannot have. But that
    // ceiling only binds the WASM backend. WebGPU needs neither
    // SharedArrayBuffer nor isolation, so it runs from file:// and moves the
    // work off the CPU entirely.
    //
    // It needs its own weights -- ONNX Runtime's WebGPU backend will not
    // execute q8 -- hence model_q4f16.onnx alongside model_quantized.onnx in
    // scripts/fetch-ghost-voice-model.mjs.
    //
    // Fallback is unconditional. A machine with no WebGPU, a driver that
    // refuses, a missing q4f16 file: all land back on exactly the q8/wasm path
    // that shipped before, so this can only ever be faster or identical.
    let tts = null;
    let skipGpu = false;
    try { skipGpu = localStorage.getItem(NO_WEBGPU_KEY) === '1'; } catch { /* private mode */ }
    /**
     * ONLY A GPU THAT CAN RUN f16. The WebGPU weights are q4f16. On Chris's
     * machine the adapter has no "shader-f16", so the model LOADED fine and
     * then every line threw "'f16' type used without 'f16' extension enabled".
     * Once that happens the runtime on that page is poisoned for wasm too,
     * which is why the voice was silent with no message. Check first, and a
     * GPU without f16 goes straight to wasm on a clean page.
     */
    if (!skipGpu && typeof navigator !== 'undefined' && navigator.gpu) {
      try {
        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter?.features?.has('shader-f16')) skipGpu = true;
      } catch {
        skipGpu = true;
      }
    }
    if (!skipGpu && typeof navigator !== 'undefined' && navigator.gpu) {
      try {
        tts = await KokoroTTS.from_pretrained(MODEL_ID, { dtype: 'q4f16', device: 'webgpu' });
        voiceState.backend = 'webgpu';
      } catch (e) {
        console.warn('[ghost-voice] WebGPU unavailable, falling back to wasm:', e?.message);
        tts = null;
      }
    }
    if (!tts) {
      tts = await KokoroTTS.from_pretrained(MODEL_ID, { dtype: 'q8', device: 'wasm' });
      voiceState.backend = 'wasm';
    }

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

const NO_WEBGPU_KEY = 'lyricist.ghost.voiceNoWebgpu';

const withTimeout = (p, ms) => Promise.race([
  p,
  new Promise((_, reject) => setTimeout(() => reject(new Error(`no audio after ${Math.round(ms / 1000)}s`)), ms)),
]);

function isSilent(raw) {
  const d = raw?.audio ?? raw?.data ?? raw;
  if (!d?.length) return true;
  let peak = 0;
  for (let i = 0; i < d.length; i += 11) {
    const v = Math.abs(d[i]);
    if (Number.isNaN(v)) return true;
    if (v > peak) peak = v;
  }
  return peak < 1e-4;
}

async function reloadOnWasm() {
  const { KokoroTTS } = await import('kokoro-js');
  const tts = await KokoroTTS.from_pretrained(MODEL_ID, { dtype: 'q8', device: 'wasm' });
  voiceState.backend = 'wasm';
  ttsPromise = Promise.resolve(tts);
  try { localStorage.setItem(NO_WEBGPU_KEY, '1'); } catch { /* private mode */ }
  return tts;
}

/**
 * Say it, in the ghost's voice. Resolves when it finishes, or immediately if it
 * cannot speak. Never throws.
 */
export async function synthesize(line, name = chosen) {
  const voice = VOICES[name] || VOICES.ghost;
  // Speed is baked into the audio, so a line at 0.90× and the same line at
  // 1.00× are two different recordings. Warmth is applied on the way out and
  // is not part of the key.
  const speed = voiceSpeed;
  const key = `${name}|${speed}|${line}`;
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

  const opts = { voice: id, speed: speed / voice.pitch };
  let raw;
  try {
    raw = await withTimeout(tts.generate(line, opts), 25000);
    if (voiceState.backend === 'webgpu' && isSilent(raw)) throw new Error('WebGPU returned silence');
  } catch (e) {
    /**
     * LOADING IS NOT SPEAKING. Chris, 2026-09-15: "i didn't hear any voice".
     * On his build the WebGPU copy loaded fine and then failed (or hung, or
     * came back silent) the moment it had to say something, and the wasm
     * fallback only covered a failed LOAD. So a failed generate on WebGPU
     * reloads on wasm, says it again, and remembers not to try WebGPU again.
     */
    if (voiceState.backend !== 'webgpu') throw e;
    console.warn('[ghost-voice] WebGPU could not speak, switching to wasm:', e?.message);
    const wasm = await reloadOnWasm();
    raw = await wasm.generate(line, opts);
  }
  buffer = toBuffer(raw);
  if (cache.size > 40) cache.delete(cache.keys().next().value);
  cache.set(key, buffer);
  return buffer;
}

/**
 * Synthesize ahead of time, off the critical path.
 *
 * THIS IS THE FIX FOR THE FREEZE, not the WebGPU switch.
 *
 * The pilot has to wait for the voice or the cursor runs ahead of what the
 * ghost is saying, which ruins a take. But waiting and *stalling* are not the
 * same thing. synthesize() already memoizes into `cache`, so generating line
 * N+1 while line N is still playing means the next speak() is a cache hit and
 * returns instantly -- the wait collapses to zero without breaking sync.
 *
 * Fire-and-forget by design: a prewarm that fails is not an error, it just
 * means that line gets generated normally when its turn comes. Never throws,
 * never blocks, safe to call with anything.
 *
 * Usage from the pilot -- queue the rest of the script as soon as it starts:
 *   prewarm(remainingLines);
 *   await speak(lines[0]);
 */
export function prewarm(lines, name = chosen) {
  const list = Array.isArray(lines) ? lines : [lines];
  for (const raw of list) {
    const line = speakable(raw);
    if (!line) continue;
    // Deliberately not awaited. Errors are swallowed: worst case is a miss.
    Promise.resolve()
      .then(() => synthesize(line, name))
      .catch(() => {});
  }
}

/**
 * WARMTH, as tone after the voice. See the note at SPEED_KEY. `w` is 0 to 1.
 *
 * Every stage scales with w, so 0 returns the input untouched and the voice is
 * exactly what it was before this existed.
 */
function warm(context, input, w) {
  if (!(w > 0)) return input;

  // Body: the chest of the voice, where "warm" mostly lives.
  const body = context.createBiquadFilter();
  body.type = 'lowshelf';
  body.frequency.value = 220;
  body.gain.value = 6 * w;

  // The hard edge. Kokoro is brightest around 3 kHz, which is what reads as
  // synthetic and a little cold.
  const edge = context.createBiquadFilter();
  edge.type = 'peaking';
  edge.frequency.value = 3000;
  edge.Q.value = 0.9;
  edge.gain.value = -4 * w;

  // Air: ease the top back, gently, so it softens rather than muffles.
  const air = context.createBiquadFilter();
  air.type = 'highshelf';
  air.frequency.value = 7500;
  air.gain.value = -5 * w;

  // A soft compressor holds it close, like a voice right on a good mic, and
  // keeps the extra low end from pushing peaks into clipping.
  const comp = context.createDynamicsCompressor();
  comp.threshold.value = -24;
  comp.knee.value = 18;
  comp.ratio.value = 1 + 2 * w;
  comp.attack.value = 0.006;
  comp.release.value = 0.25;

  // LEVEL-MATCHED, so the slider changes tone and not volume. Chrome's
  // compressor adds its own automatic makeup gain, and with the low shelf the
  // chain came out 3.6 dB louder at full warmth than at none (measured on a
  // speech-like signal: 120 Hz buzz with harmonics to 10 kHz). A person hears
  // louder as better, which would make the knob lie. This trims it back.
  const makeup = context.createGain();
  makeup.gain.value = Math.pow(10, (-2.4 * w) / 20);

  return input.connect(body).connect(edge).connect(air).connect(comp).connect(makeup);
}

/** The shipping graph, in one place, so playing it and measuring it agree. */
export function ghostChain(context, buffer, name = chosen) {
  const voice = VOICES[name] || VOICES.ghost;
  const src = context.createBufferSource();
  src.buffer = buffer;
  src.playbackRate.value = voice.pitch;   // the asetrate half of the shift

  // An untreated voice skips the ghost's two filters: they are there to sell
  // the ghost, and on plain speech they only make it sound like a telephone.
  let tail = src;
  if (voice.pitch !== 1) {
    const hp = context.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = HIGHPASS_HZ;

    const lp = context.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = LOWPASS_HZ;

    tail = src.connect(hp).connect(lp);
  }

  // Warmth goes on every voice, last, so it is the same knob whoever is talking.
  warm(context, tail, voiceWarmth / 100).connect(context.destination);
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
    // ONNX Runtime throws bare numbers (an error pointer), which used to come
    // out as "The voice did not work." with nothing to go on.
    const detail = e?.message || (typeof e === 'number' ? `speech engine error ${e}` : String(e || ''));
    return { ok: false, error: voiceState.failed || detail || 'The voice did not work.' };
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
