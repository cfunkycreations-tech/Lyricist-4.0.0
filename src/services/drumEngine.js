/**
 * 808 drum engine + effects rack — Lyricist 4.2.0
 *
 * The kit is synthesized, not sampled. A real TR-808 makes its sounds with
 * oscillators, noise and envelopes, so modelling it that way gets closer to the
 * original than a handful of MP3s would — and it costs zero download, tunes to
 * any pitch, and every knob stays live. Any voice can still be swapped for one
 * of the user's own samples.
 *
 * Everything runs through a per-track effects chain into a master chain, all
 * offline Web Audio. No libraries, no licences, no network.
 */

/* ── Voices ───────────────────────────────────────────────────────── */

export const KIT = [
  { id: 'kick',   name: 'Kick',      color: '#ff2d95', key: 'B1' },
  { id: 'snare',  name: 'Snare',     color: '#00e5ff', key: 'D2' },
  { id: 'clap',   name: 'Clap',      color: '#c026ff', key: 'D#2' },
  { id: 'hatC',   name: 'Closed Hat', color: '#10f0a0', key: 'F#2' },
  { id: 'hatO',   name: 'Open Hat',  color: '#7dffb0', key: 'A#2' },
  { id: 'tom',    name: 'Tom',       color: '#ff8c00', key: 'A2' },
  { id: 'rim',    name: 'Rim',       color: '#f8eea6', key: 'C#2' },
  { id: 'cowbell',name: 'Cowbell',   color: '#facc15', key: 'G#2' },
];

/** Per-voice defaults: tune, decay and level, all live-adjustable. */
// Levels are balanced by ear against measured peaks, not set to round numbers.
// Band-passed voices (clap, hats, rim) lose a lot of level to their filters, so
// they need far more gain than the kick to sit right in the same kit.
export const DEFAULT_VOICE = {
  kick:    { tune: 50,   decay: 0.55, level: 1.0, drive: 0.15 },
  snare:   { tune: 190,  decay: 0.20, level: 0.72, snap: 0.5 },
  clap:    { tune: 1100, decay: 0.22, level: 3.4 },
  hatC:    { tune: 8000, decay: 0.05, level: 2.6 },
  hatO:    { tune: 8000, decay: 0.38, level: 1.9 },
  tom:     { tune: 110,  decay: 0.35, level: 1.1 },
  rim:     { tune: 1700, decay: 0.06, level: 1.6 },
  cowbell: { tune: 540,  decay: 0.30, level: 1.2 },
};

function env(param, ctx, when, peak, decay, floor = 0.0001) {
  param.setValueAtTime(floor, when);
  param.linearRampToValueAtTime(peak, when + 0.002);
  param.exponentialRampToValueAtTime(floor, when + Math.max(0.02, decay));
}

/** Short burst of white noise, reused by snare/clap/hats. */
function noiseBuffer(ctx) {
  if (!ctx.__lyricistNoise) {
    const len = Math.floor(ctx.sampleRate * 1.0);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    ctx.__lyricistNoise = buf;
  }
  return ctx.__lyricistNoise;
}

/**
 * Fire one synthesized 808 voice.
 * `dest` is the head of that track's effect chain.
 */
export function triggerVoice(ctx, dest, voiceId, when, params = {}, velocity = 1) {
  const p = { ...DEFAULT_VOICE[voiceId], ...params };
  const gain = ctx.createGain();
  gain.gain.value = (p.level ?? 0.8) * velocity;
  gain.connect(dest);

  switch (voiceId) {
    case 'kick': {
      // Sine with a fast downward pitch sweep — the 808's whole identity.
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(p.tune * 3.5, when);
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, p.tune), when + 0.06);
      env(g.gain, ctx, when, 1, p.decay);
      // A touch of drive gives it the speaker-punch a pure sine lacks.
      const shaper = ctx.createWaveShaper();
      shaper.curve = driveCurve(p.drive ?? 0.15);
      osc.connect(g).connect(shaper).connect(gain);
      osc.start(when); osc.stop(when + p.decay + 0.1);
      break;
    }
    case 'snare': {
      const osc = ctx.createOscillator();
      const og = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(p.tune, when);
      env(og.gain, ctx, when, 0.7, p.decay * 0.7);
      osc.connect(og).connect(gain);
      osc.start(when); osc.stop(when + p.decay + 0.1);

      const n = ctx.createBufferSource();
      const nf = ctx.createBiquadFilter();
      const ng = ctx.createGain();
      n.buffer = noiseBuffer(ctx);
      nf.type = 'highpass';
      nf.frequency.value = 1200 + (p.snap ?? 0.5) * 1800;
      env(ng.gain, ctx, when, 0.9, p.decay);
      n.connect(nf).connect(ng).connect(gain);
      n.start(when); n.stop(when + p.decay + 0.1);
      break;
    }
    case 'clap': {
      // Three quick noise bursts then a tail — that's what makes it a clap.
      const offsets = [0, 0.011, 0.023];
      for (const off of offsets) {
        const n = ctx.createBufferSource();
        const f = ctx.createBiquadFilter();
        const g = ctx.createGain();
        n.buffer = noiseBuffer(ctx);
        f.type = 'bandpass';
        f.frequency.value = p.tune;
        f.Q.value = 1.6;
        env(g.gain, ctx, when + off, 0.8, 0.035);
        n.connect(f).connect(g).connect(gain);
        n.start(when + off); n.stop(when + off + 0.06);
      }
      const tail = ctx.createBufferSource();
      const tf = ctx.createBiquadFilter();
      const tg = ctx.createGain();
      tail.buffer = noiseBuffer(ctx);
      tf.type = 'bandpass';
      tf.frequency.value = p.tune;
      tf.Q.value = 1.2;
      env(tg.gain, ctx, when + 0.03, 0.5, p.decay);
      tail.connect(tf).connect(tg).connect(gain);
      tail.start(when + 0.03); tail.stop(when + p.decay + 0.1);
      break;
    }
    case 'hatC':
    case 'hatO': {
      // Six detuned squares through a highpass — the classic metallic recipe.
      const ratios = [2, 3, 4.16, 5.43, 6.79, 8.21];
      const hp = ctx.createBiquadFilter();
      const bp = ctx.createBiquadFilter();
      const g = ctx.createGain();
      hp.type = 'highpass'; hp.frequency.value = p.tune * 0.8;
      bp.type = 'bandpass'; bp.frequency.value = p.tune; bp.Q.value = 0.9;
      env(g.gain, ctx, when, 0.6, p.decay);
      for (const r of ratios) {
        const o = ctx.createOscillator();
        o.type = 'square';
        o.frequency.value = 40 * r;
        o.connect(hp);
        o.start(when); o.stop(when + p.decay + 0.1);
      }
      hp.connect(bp).connect(g).connect(gain);
      break;
    }
    case 'tom': {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(p.tune * 1.8, when);
      osc.frequency.exponentialRampToValueAtTime(Math.max(30, p.tune), when + 0.12);
      env(g.gain, ctx, when, 0.9, p.decay);
      osc.connect(g).connect(gain);
      osc.start(when); osc.stop(when + p.decay + 0.1);
      break;
    }
    case 'rim': {
      const osc = ctx.createOscillator();
      const f = ctx.createBiquadFilter();
      const g = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = p.tune;
      f.type = 'bandpass'; f.frequency.value = p.tune; f.Q.value = 6;
      env(g.gain, ctx, when, 0.7, p.decay);
      osc.connect(f).connect(g).connect(gain);
      osc.start(when); osc.stop(when + p.decay + 0.05);
      break;
    }
    case 'cowbell': {
      // Two squares a fifth-ish apart, band-passed. Pure 808.
      const g = ctx.createGain();
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.value = p.tune * 1.5; f.Q.value = 2;
      env(g.gain, ctx, when, 0.6, p.decay);
      for (const mult of [1, 1.4845]) {
        const o = ctx.createOscillator();
        o.type = 'square';
        o.frequency.value = p.tune * mult;
        o.connect(f);
        o.start(when); o.stop(when + p.decay + 0.05);
      }
      f.connect(g).connect(gain);
      break;
    }
    default:
      break;
  }
}

/** Play a user sample on a track instead of the synth voice. */
export function triggerSample(ctx, dest, buffer, when, { level = 1, pitch = 0, velocity = 1, loop = false } = {}) {
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = loop;
  src.playbackRate.value = Math.pow(2, pitch / 12);
  const g = ctx.createGain();
  g.gain.value = level * velocity;
  src.connect(g).connect(dest);
  src.start(when);
  return src;
}

/* ── Effects rack ─────────────────────────────────────────────────── */

function driveCurve(amount = 0.3, samples = 1024) {
  const k = Math.max(0.0001, amount) * 100;
  const curve = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
  }
  return curve;
}

/** Bitcrusher via ScriptProcessor-free waveshaping on quantized steps. */
function crushCurve(bits = 8, samples = 2048) {
  const levels = Math.pow(2, Math.max(1, Math.min(16, bits)));
  const curve = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    curve[i] = Math.round(x * levels) / levels;
  }
  return curve;
}

/** Generated impulse response — a plate-ish reverb with no audio file needed. */
function makeImpulse(ctx, seconds = 1.8, decay = 2.6) {
  const rate = ctx.sampleRate;
  const len = Math.max(1, Math.floor(rate * seconds));
  const impulse = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return impulse;
}

export const DEFAULT_FX = {
  filterType: 'lowpass',
  filterFreq: 20000,
  filterQ: 0.7,
  drive: 0,
  crush: 0,          // 0 = off, else bit depth 1–16
  delayTime: 0,      // seconds
  delayFeedback: 0.3,
  delayMix: 0,
  reverbMix: 0,
  reverbSize: 1.8,
  compress: 0,       // 0 = off, 1 = full
  pan: 0,
  level: 1,
};

/**
 * Build an effect chain and return { input, output, set, dispose }.
 * Used for each track and again for the master bus.
 */
export function createFxChain(ctx, initial = {}) {
  const fx = { ...DEFAULT_FX, ...initial };

  const input = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  const shaper = ctx.createWaveShaper();
  const crusher = ctx.createWaveShaper();
  const comp = ctx.createDynamicsCompressor();
  const panner = ctx.createStereoPanner();
  const out = ctx.createGain();

  // Delay send
  const delay = ctx.createDelay(2.0);
  const fb = ctx.createGain();
  const delayMix = ctx.createGain();

  // Reverb send
  const convolver = ctx.createConvolver();
  const reverbMix = ctx.createGain();

  input.connect(filter);
  filter.connect(shaper);
  shaper.connect(crusher);
  crusher.connect(comp);
  comp.connect(panner);
  panner.connect(out);

  // Sends run in parallel off the dry signal, then rejoin at the output.
  panner.connect(delay);
  delay.connect(fb);
  fb.connect(delay);
  delay.connect(delayMix);
  delayMix.connect(out);

  panner.connect(convolver);
  convolver.connect(reverbMix);
  reverbMix.connect(out);

  const set = (patch = {}) => {
    Object.assign(fx, patch);
    filter.type = fx.filterType;
    filter.frequency.value = Math.max(20, Math.min(22050, fx.filterFreq));
    filter.Q.value = fx.filterQ;
    shaper.curve = fx.drive > 0 ? driveCurve(fx.drive) : null;
    crusher.curve = fx.crush > 0 ? crushCurve(fx.crush) : null;
    comp.threshold.value = fx.compress > 0 ? -18 - fx.compress * 18 : 0;
    comp.ratio.value = fx.compress > 0 ? 2 + fx.compress * 10 : 1;
    comp.attack.value = 0.003;
    comp.release.value = 0.18;
    panner.pan.value = Math.max(-1, Math.min(1, fx.pan));
    out.gain.value = Math.max(0, fx.level);
    delay.delayTime.value = Math.max(0, Math.min(2, fx.delayTime));
    fb.gain.value = Math.max(0, Math.min(0.92, fx.delayFeedback));
    delayMix.gain.value = Math.max(0, Math.min(1, fx.delayMix));
    reverbMix.gain.value = Math.max(0, Math.min(1, fx.reverbMix));
    if (fx.reverbMix > 0 && (!convolver.buffer || fx.__rebuildIR)) {
      convolver.buffer = makeImpulse(ctx, fx.reverbSize);
      fx.__rebuildIR = false;
    }
  };

  set();

  return {
    input,
    output: out,
    set,
    get state() { return { ...fx }; },
    dispose() {
      [input, filter, shaper, crusher, comp, panner, out, delay, fb, delayMix, convolver, reverbMix]
        .forEach((n) => { try { n.disconnect(); } catch { /* already gone */ } });
    },
  };
}

/* ── Patterns ─────────────────────────────────────────────────────── */

export const STEPS = 16;

export function emptyPattern() {
  const p = {};
  for (const v of KIT) p[v.id] = new Array(STEPS).fill(0);
  return p;
}

/** A usable starting beat so the machine makes sound the moment it opens. */
export function starterPattern() {
  const p = emptyPattern();
  [0, 8].forEach((i) => { p.kick[i] = 1; });
  p.kick[11] = 0.7;
  [4, 12].forEach((i) => { p.snare[i] = 1; });
  for (let i = 0; i < STEPS; i += 2) p.hatC[i] = 0.7;
  [7, 15].forEach((i) => { p.hatO[i] = 0.6; });
  return p;
}
