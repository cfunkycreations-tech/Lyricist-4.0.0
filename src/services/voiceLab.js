/**
 * VOICE LAB — tune the narrator, then bake every line with exactly that sound.
 * CREATOR BUILD ONLY (it lives in the Ghost panel).
 *
 * Chris, 2026-09-27: the Kokoro Ghost "sounds like shit, too monotone", and he
 * wants to "tune the voice to make it sound like whatever the fuck you want it
 * to sound like ... fine-tune with the mouse wheel".
 *
 * Two stages, and the split is the point:
 *
 *   TAKE     the words, spoken by a hosted voice through OpenRouter
 *            (/api/v1/audio/speech). Costs a fraction of a cent, so a take is
 *            cached and only re-requested when voice, expression or direction
 *            change.
 *   PROCESS  everything after that, in this file, offline: pace, depth (pitch),
 *            size (formants), warmth, room, level. Turning any of those knobs
 *            re-renders the cached take in a moment with no API call.
 *
 * Preview and bake run the SAME process() — so what you tune is what ships.
 *
 * Depth and size are separate on purpose. Plain pitch-down drags the formants
 * with it, which is the "slowed-down tape" sound the old Ghost had. Here the
 * spectral envelope is measured every frame (cepstral smoothing) and put back
 * where `size` says, so the voice can get deeper without getting muddier, or
 * bigger-chested without changing pitch.
 */
import { createSpeech } from './openrouter.js';

export const SR = 24000;

// ── the voices ──────────────────────────────────────────────────────────────
// Gemini 3.8 Flash TTS (Google, 2026-09-23) takes a spoken direction, so
// Expression and Direction steer it. The others read the words their own way.
const GEMINI = ['Algieba', 'Charon', 'Algenib', 'Iapetus', 'Alnilam', 'Orus', 'Gacrux', 'Rasalgethi',
  'Enceladus', 'Umbriel', 'Schedar', 'Sadachbia', 'Sadaltager', 'Achird', 'Zubenelgenubi', 'Fenrir',
  'Puck', 'Zephyr', 'Kore', 'Leda', 'Aoede', 'Callirrhoe', 'Autonoe', 'Despina', 'Erinome',
  'Laomedeia', 'Achernar', 'Pulcherrima', 'Vindemiatrix', 'Sulafat'];

export const VOICES = [
  ...GEMINI.map((v) => ({ key: `g38:${v}`, label: `Gemini ${v}`, model: 'google/gemini-3.8-flash-tts', voice: v, pcm: true, directed: true })),
  { key: 'minimax:deep', label: 'MiniMax HD Deep', model: 'minimax/speech-2.8-hd', voice: 'English_Deep-VoicedGentleman' },
  { key: 'grok:Rex', label: 'Grok Rex', model: 'x-ai/grok-voice-tts-1.0', voice: 'Rex' },
  { key: 'grok:Leo', label: 'Grok Leo', model: 'x-ai/grok-voice-tts-1.0', voice: 'Leo' },
];

// Expression is a dial over how the voice is directed, from a flat read to an
// actor. Only the directed (Gemini) voices hear it.
const EXPRESSION = [
  [0, 'Read it plainly and evenly, with very little movement in the voice.'],
  [20, 'Read it calmly and naturally, like explaining something to a friend.'],
  [40, 'Conversational and warm, with natural rises and falls and real emphasis on the key words.'],
  [60, 'Lively and engaged, with clearly varied intonation, pauses that land, and a smile in the voice.'],
  [80, 'Very animated, like a late-night radio host: big dynamic range, playful emphasis, a little mischief.'],
  [95, 'Full performance, like a voice actor playing a charismatic ghost: dramatic, theatrical, relishing every line.'],
];

export const DEFAULTS = {
  voice: 'g38:Algieba',
  expression: 60,        // 0..100
  // Empty for everyone: Voice Lab is a general tool now, not the Ghost's
  // (Chris, 2026-10-09). Settings already saved on a machine keep their own.
  direction: '',
  pace: 1.0,             // 0.60..1.40, time only, pitch untouched
  depth: 0,              // semitones, -12..+6  (pitch). Chris picked Algieba as-is, 2026-09-27: -6 was too low
  size: 0,               // semitones, -6..+6   (formants: minus = bigger chest)
  warmth: 0,             // 0..100  (0 = the take untouched)
  room: 0,               // 0..100
};

export const RANGES = {
  expression: { min: 0, max: 100, step: 1 },
  pace: { min: 0.6, max: 1.4, step: 0.01 },
  depth: { min: -12, max: 6, step: 0.1 },
  size: { min: -6, max: 6, step: 0.1 },
  warmth: { min: 0, max: 100, step: 1 },
  room: { min: 0, max: 100, step: 1 },
};

const KEY = 'lyricist.voicelab.v1';
export function loadSettings() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...DEFAULTS }; }
}
export function saveSettings(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private window */ }
}

export function directionFor(s) {
  let line = EXPRESSION[0][1];
  for (const [at, text] of EXPRESSION) if (s.expression >= at) line = text;
  return `${(s.direction || '').trim()} ${line}`.trim();
}

// Symbols a synthesiser would read aloud. Same list the old bake learned the hard way.
export function speakable(text) {
  return text
    .replace(/\b4\.2\.0\b/g, '4, 2, 0').replace(/\b[Rr]ec\b/g, 'record').replace(/\s\+\s/g, ' plus ').replace(/\bA\/B\b/g, 'A B').replace(/&/g, ' and ')
    .replace(/\s*\/\s*/g, ' and ').replace(/[—–]/g, ', ').replace(/[“”]/g, '').replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ').trim();
}

// ── TAKE ────────────────────────────────────────────────────────────────────
const takes = new Map();   // take key -> Promise<Float32Array @ SR>

function takeKey(s, text) {
  const v = VOICES.find((x) => x.key === s.voice) || VOICES[0];
  return JSON.stringify([v.key, v.directed ? (s.instructions || directionFor(s)) : '', text]);
}

export function hasTake(s, text) { return takes.has(takeKey(s, text)); }

export function take(s, text, apiKey) {
  const k = takeKey(s, text);
  if (!takes.has(k)) {
    const p = requestTake(s, text, apiKey);
    takes.set(k, p);
    p.catch(() => takes.delete(k));     // a failure must not stick in the cache
  }
  return takes.get(k);
}

async function requestTake(s, text, apiKey) {
  if (!apiKey) throw new Error('Voice Lab needs your OpenRouter key (Settings).');
  const v = VOICES.find((x) => x.key === s.voice) || VOICES[0];
  const body = { model: v.model, voice: v.voice, input: speakable(text), response_format: v.pcm ? 'pcm' : 'mp3' };
  // `instructions` verbatim, when given, replaces the expression dial: the
  // Ghost's live voice uses it to read exactly like the baked demo clips.
  if (v.directed) body.instructions = s.instructions || directionFor(s);
  let res;
  for (let attempt = 1; attempt <= 3; attempt++) {
    res = await createSpeech(body, { apiKey });
    if (res.ok || (res.status && res.status < 500 && res.status !== 429)) break;
    await new Promise((r) => setTimeout(r, 1200 * attempt));
  }
  if (!res.ok) throw new Error(`${v.label}: ${res.message || res.status}`);
  const buf = await res.res.arrayBuffer();
  if (v.pcm) {                       // Gemini: raw 16-bit little-endian mono at 24 kHz
    const i16 = new Int16Array(buf, 0, buf.byteLength >> 1);
    const out = new Float32Array(i16.length);
    for (let i = 0; i < i16.length; i++) out[i] = i16[i] / 32768;
    return out;
  }
  const ctx = new OfflineAudioContext(1, 1, SR);
  const decoded = await ctx.decodeAudioData(buf);
  return resampleTo(decoded, SR);
}

async function resampleTo(audioBuffer, rate) {
  const len = Math.ceil(audioBuffer.duration * rate);
  const ctx = new OfflineAudioContext(1, len, rate);
  const src = ctx.createBufferSource();
  src.buffer = audioBuffer;
  src.connect(ctx.destination);
  src.start();
  return (await ctx.startRendering()).getChannelData(0).slice();
}

// ── PROCESS ─────────────────────────────────────────────────────────────────
/** Everything after the take. Returns an AudioBuffer at SR, ready to play or save. */
export async function processTake(raw, s) {
  const p = 2 ** (s.depth / 12);                     // pitch factor
  const f = 2 ** (s.size / 12);                      // formant factor
  const shifted = pitchTime(raw, p, f, 1 / s.pace);

  const lead = Math.round(0.12 * SR);                // a late-starting player never clips the first consonant
  const tail = Math.round((0.25 + s.room / 100 * 1.4) * SR);
  const len = lead + shifted.length + tail;
  const ctx = new OfflineAudioContext(1, len, SR);
  const buf = ctx.createBuffer(1, shifted.length, SR);
  buf.copyToChannel(shifted, 0);
  const src = ctx.createBufferSource();
  src.buffer = buf;

  // Warmth: body up, fizz down, a touch of presence so the words stay clear.
  const w = s.warmth / 100;
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 50;
  const low = ctx.createBiquadFilter(); low.type = 'lowshelf'; low.frequency.value = 220; low.gain.value = 7 * w;
  const mud = ctx.createBiquadFilter(); mud.type = 'peaking'; mud.frequency.value = 420; mud.Q.value = 1.1; mud.gain.value = -2.5 * w;
  const pres = ctx.createBiquadFilter(); pres.type = 'peaking'; pres.frequency.value = 3000; pres.Q.value = 0.9; pres.gain.value = 1.5 * w;
  const high = ctx.createBiquadFilter(); high.type = 'highshelf'; high.frequency.value = 7000; high.gain.value = -6 * w;
  src.connect(hp).connect(low).connect(mud).connect(pres).connect(high);

  const dry = ctx.createGain(); dry.gain.value = 1;
  high.connect(dry).connect(ctx.destination);
  if (s.room > 0) {
    const conv = ctx.createConvolver();
    conv.buffer = roomImpulse(ctx, 0.35 + s.room / 100 * 1.6);
    const wet = ctx.createGain(); wet.gain.value = (s.room / 100) * 0.55;
    high.connect(conv).connect(wet).connect(ctx.destination);
  }
  src.start(lead / SR);
  const out = await ctx.startRendering();
  levelMatch(out.getChannelData(0));
  return out;
}

function roomImpulse(ctx, seconds) {
  const n = Math.round(seconds * SR);
  const ir = ctx.createBuffer(1, n, SR);
  const d = ir.getChannelData(0);
  let seed = 12345;                                 // fixed seed: the same room every render
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296) * 2 - 1;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const early = t < 0.012 ? 0 : 1;               // pre-delay
    d[i] = rnd() * early * Math.exp(-6.9 * t / seconds) * (1 - Math.exp(-t * 400));
  }
  return ir;
}

// Speech loudness: RMS over the voiced parts to about -18 dBFS, peaks held under -1.5 dBFS.
function levelMatch(x) {
  let sum = 0, n = 0;
  for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (a > 0.01) { sum += x[i] * x[i]; n++; } }
  if (!n) return;
  let g = 0.126 / Math.sqrt(sum / n);
  let peak = 0;
  for (let i = 0; i < x.length; i++) peak = Math.max(peak, Math.abs(x[i] * g));
  if (peak > 0.84) g *= 0.84 / peak;
  for (let i = 0; i < x.length; i++) x[i] *= g;
}

// ── the pitch / formant / time engine ──────────────────────────────────────
// Phase vocoder with identity phase locking (peaks carry their neighbours'
// phases, which keeps a voice from going watery), time-stretched by
// stretch*pitch and then read back at `pitch` rate. Before the read-back the
// spectral envelope of each frame is moved so the formants land at `formant`
// times where they were, not dragged by the pitch.
const N = 1024, HS = 256, HALF = N / 2 + 1, LIFTER = 28;
const WIN = new Float32Array(N).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));

export function pitchTime(x, pitch, formant, stretch) {
  if (Math.abs(pitch - 1) < 1e-3 && Math.abs(formant - 1) < 1e-3 && Math.abs(stretch - 1) < 1e-3) return x.slice();
  const T = stretch * pitch;
  const outLen = Math.ceil(x.length * T) + N;
  const y = new Float32Array(outLen);
  const norm = new Float32Array(outLen);
  const re = new Float64Array(N), im = new Float64Array(N);
  const mag = new Float64Array(HALF), ph = new Float64Array(HALF);
  const prevPh = new Float64Array(HALF), synPh = new Float64Array(HALF);
  const env = new Float64Array(HALF), gain = new Float64Array(HALF);
  const corr = Math.abs(pitch / formant - 1) > 1e-3;   // envelope move needed?
  const frames = Math.floor((x.length * T) / HS);
  let prevPos = 0;

  for (let m = 0; m <= frames; m++) {
    const pos = Math.round((m * HS) / T);
    const ha = m === 0 ? HS / T : pos - prevPos;
    for (let i = 0; i < N; i++) { const j = pos + i - N / 2; re[i] = (j >= 0 && j < x.length ? x[j] : 0) * WIN[i]; im[i] = 0; }
    fft(re, im, false);
    for (let k = 0; k < HALF; k++) { mag[k] = Math.hypot(re[k], im[k]); ph[k] = Math.atan2(im[k], re[k]); }

    // phase propagation at the peaks, locked phases around them
    if (m === 0) {
      for (let k = 0; k < HALF; k++) synPh[k] = ph[k];
    } else {
      let lastPeak = -1;
      const peaks = [];
      for (let k = 2; k < HALF - 2; k++) if (mag[k] > mag[k - 1] && mag[k] >= mag[k + 1] && mag[k] > mag[k - 2] && mag[k] >= mag[k + 2]) peaks.push(k);
      if (!peaks.length) peaks.push(1);
      const newPh = new Float64Array(HALF);
      for (const k of peaks) {
        const omega = (2 * Math.PI * k) / N;
        let dphi = ph[k] - prevPh[k] - omega * ha;
        dphi -= 2 * Math.PI * Math.round(dphi / (2 * Math.PI));
        const inst = omega + dphi / Math.max(1, ha);
        newPh[k] = synPh[k] + inst * HS;
      }
      let pi = 0;
      for (let k = 0; k < HALF; k++) {
        while (pi < peaks.length - 1 && Math.abs(peaks[pi + 1] - k) < Math.abs(peaks[pi] - k)) pi++;
        const pk = peaks[pi];
        synPh[k] = k === pk ? newPh[pk] : newPh[pk] + (ph[k] - ph[pk]);
      }
      lastPeak = peaks[peaks.length - 1];
      void lastPeak;
    }
    prevPh.set(ph);

    // formants: this frame's envelope, moved from where the read-back would put it
    if (corr) {
      spectralEnvelope(mag, env);
      const r = pitch / formant;      // bin k ends at k*pitch; want envelope E(k*pitch/formant)
      for (let k = 0; k < HALF; k++) {
        const src = k * r;
        const e = src < HALF - 1 ? lerp(env, src) : env[HALF - 1] * 1e-3;
        gain[k] = Math.min(30, e / (env[k] + 1e-9));
      }
      for (let k = 0; k < HALF; k++) mag[k] *= gain[k];
    }

    for (let k = 0; k < HALF; k++) { re[k] = mag[k] * Math.cos(synPh[k]); im[k] = mag[k] * Math.sin(synPh[k]); }
    for (let k = HALF; k < N; k++) { re[k] = re[N - k]; im[k] = -im[N - k]; }
    fft(re, im, true);
    const at = m * HS;
    for (let i = 0; i < N; i++) { const j = at + i - N / 2; if (j >= 0 && j < outLen) { y[j] += re[i] * WIN[i]; norm[j] += WIN[i] * WIN[i]; } }
    prevPos = pos;
  }
  for (let i = 0; i < outLen; i++) if (norm[i] > 1e-3) y[i] /= norm[i];

  // read back at `pitch` rate: pitch moves, duration lands on x.length*stretch
  const finalLen = Math.round(x.length * stretch);
  const z = new Float32Array(finalLen);
  for (let n = 0; n < finalLen; n++) {
    const t = n * pitch, i = Math.floor(t), fr = t - i;
    const a = y[i - 1] || 0, b = y[i] || 0, c = y[i + 1] || 0, d = y[i + 2] || 0;   // Catmull-Rom
    z[n] = b + 0.5 * fr * (c - a + fr * (2 * a - 5 * b + 4 * c - d + fr * (3 * (b - c) + d - a)));
  }
  return z;
}

function lerp(arr, x) { const i = Math.floor(x), f = x - i; return arr[i] * (1 - f) + arr[i + 1] * f; }

// Cepstral smoothing: log spectrum -> cepstrum -> keep the low quefrencies
// (the vocal tract, not the pitch harmonics) -> back to a smooth magnitude.
const cRe = new Float64Array(N), cIm = new Float64Array(N);
function spectralEnvelope(mag, env) {
  for (let k = 0; k < HALF; k++) cRe[k] = Math.log(mag[k] + 1e-7);
  for (let k = HALF; k < N; k++) cRe[k] = cRe[N - k];
  cIm.fill(0);
  fft(cRe, cIm, true);
  for (let q = LIFTER; q <= N - LIFTER; q++) { cRe[q] = 0; cIm[q] = 0; }
  fft(cRe, cIm, false);
  for (let k = 0; k < HALF; k++) env[k] = Math.exp(cRe[k]);
}

// In-place radix-2 complex FFT. inverse=true also scales by 1/N.
function fft(re, im, inverse) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (2 * Math.PI / len) * (inverse ? 1 : -1);
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let j = 0; j < len / 2; j++) {
        const a = i + j, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
  if (inverse) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}

// ── out ────────────────────────────────────────────────────────────────────
export function wavBytes(audioBuffer) {
  const x = audioBuffer.getChannelData(0), rate = audioBuffer.sampleRate;
  const b = new ArrayBuffer(44 + x.length * 2), v = new DataView(b);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + x.length * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, x.length * 2, true);
  for (let i = 0; i < x.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, x[i])) * 32767, true);
  return new Uint8Array(b);
}
