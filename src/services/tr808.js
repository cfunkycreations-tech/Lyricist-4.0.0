/**
 * TR-808 voice synthesis — Lyricist 4.2.0
 *
 * These are circuit models, not "a sine with a pitch drop". Each voice follows
 * the block diagram of the real Roland TR-808: oscillators, VCAs, VCFs and
 * attack/decay generators wired the way the hardware wires them. That is why a
 * kick has a click and a body from two different sources, why the hats are six
 * detuned square waves and not noise, and why the clap is four bursts and a
 * tail rather than one.
 *
 * Ported from io-808 by Vincent Riemer — MIT licensed, copyright (c) 2016 —
 * https://github.com/vincentriemer/io-808 — which reconstructed these from the
 * TR-808 service notes and Sound on Sound's Synth Secrets. Adapted here for a
 * long-running app rather than a page you open once:
 *
 *   - Noise and curve buffers are built once per AudioContext and shared. The
 *     original allocates a fresh 44,100-sample noise buffer on every single
 *     hit, which at sixteen steps a bar is megabytes a minute of garbage.
 *   - Voices clean themselves up when their tail finishes instead of on a
 *     wall-clock timer, so nothing lingers if the sequencer stops mid-hit.
 *   - Every voice takes an explicit `when`, so it can be scheduled ahead of
 *     time by the sequencer instead of fired on the spot.
 */

/* ── shared, built once per context ─────────────────────────────────── */

const contextCache = new WeakMap();

function shared(ctx) {
  let c = contextCache.get(ctx);
  if (c) return c;

  const rate = ctx.sampleRate;

  // White noise — one second, looped.
  const white = ctx.createBuffer(1, rate, rate);
  const wd = white.getChannelData(0);
  for (let i = 0; i < wd.length; i++) wd[i] = Math.random() * 2 - 1;

  // Pink noise, Paul Kellet's refined method. The toms use it; white noise
  // makes them hiss where pink lets the skin come through.
  const pink = ctx.createBuffer(1, rate, rate);
  const pd = pink.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < pd.length; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    pd[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
  }

  // 1ms DC pulse — the physical "click" that starts a kick or a tom.
  const pulseLen = Math.max(1, Math.floor(0.001 * rate));
  const pulse = ctx.createBuffer(1, pulseLen, rate);
  pulse.getChannelData(0).fill(1);

  // tanh soft clipping, and a half-wave rectifier for the rimshot's swing VCA.
  const n = 8192;
  const softClip = new Float32Array(n);
  for (let i = 0; i < n; i++) softClip[i] = Math.tanh((i - n / 2) / (n / 2));
  const halfWave = new Float32Array(n);
  for (let i = 0; i < n / 2; i++) halfWave[i] = 0;
  for (let i = n / 2; i < n; i++) halfWave[i] = i / (n / 2) - 1;

  c = { white, pink, pulse, softClip, halfWave };
  contextCache.set(ctx, c);
  return c;
}

/* ── primitives ─────────────────────────────────────────────────────── */

const gainOf = (ctx, v = 0) => {
  const g = ctx.createGain();
  g.gain.value = v;
  return g;
};

const filterOf = (ctx, type, freq, q = 1) => {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  return f;
};

const oscOf = (ctx, type, freq) => {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  return o;
};

const noiseOf = (ctx, buffer) => {
  const s = ctx.createBufferSource();
  s.buffer = buffer;
  s.loop = true;
  return s;
};

const shaperOf = (ctx, curve, oversample = '2x') => {
  const w = ctx.createWaveShaper();
  w.curve = curve;
  w.oversample = oversample;
  return w;
};

/**
 * Attack/decay envelope, the 808's workhorse. `decayMs` is the fall time and
 * the curve is either linear (percussive bodies) or exponential (metallic
 * tails, which need the long quiet tail an exponential gives).
 */
function ad(param, when, { attackMs = 0.1, decayMs, from = 0, amount = 1, exponential = false }) {
  const attackAt = when + attackMs / 1000;
  const decayAt = attackAt + decayMs / 1000;
  param.cancelScheduledValues(when);
  param.setValueAtTime(from, when);
  param.linearRampToValueAtTime(from + amount, attackAt);
  if (exponential) param.exponentialRampToValueAtTime(0.0001 + from, decayAt);
  else param.linearRampToValueAtTime(from, decayAt);
  return decayAt;
}

/** Fire the 1ms click through a 5kHz lowpass, as the hardware does. */
function click(ctx, dest, when, level = 0.8) {
  const s = ctx.createBufferSource();
  s.buffer = shared(ctx).pulse;
  const lp = filterOf(ctx, 'lowpass', 5000);
  const g = gainOf(ctx, level);
  s.connect(lp).connect(g).connect(dest);
  s.start(when);
  s.onended = () => { try { g.disconnect(); lp.disconnect(); } catch { /* gone */ } };
}

/**
 * Start/stop bookkeeping shared by every voice: start every source at `when`,
 * stop them once the tail is done, and disconnect on the last stop. Keeps the
 * graph from growing over a long session — which matters here, because this
 * thing is meant to loop for hours.
 */
function lifecycle(ctx, sources, when, endsAt, out) {
  const stopAt = endsAt + 0.06;
  sources.forEach((s) => { try { s.start(when); } catch { /* already started */ } });
  let left = sources.length;
  sources.forEach((s) => {
    try { s.stop(stopAt); } catch { /* not stoppable */ }
    s.onended = () => {
      if (--left > 0) return;
      try { out.disconnect(); } catch { /* already gone */ }
    };
  });
  // Nothing to hang the teardown on (no sources) — disconnect on a timer tied
  // to the audio clock rather than wall time.
  if (!sources.length) {
    const t = ctx.createBufferSource();
    t.buffer = shared(ctx).pulse;
    t.connect(ctx.createGain());
    t.start(when);
    t.stop(stopAt);
    t.onended = () => { try { out.disconnect(); } catch { /* gone */ } };
  }
}

/* ── voices ─────────────────────────────────────────────────────────── */

/**
 * Bass drum. A sine whose pitch drops fast from 98Hz to 48Hz, plus the click,
 * through a lowpass and a soft clipper. The clipper is what gives the 808 kick
 * its push instead of a polite sine.
 */
export function bassDrum(ctx, dest, when, { level = 1, tone = 0.5, decay = 0.5, drive = 0.6 } = {}) {
  const s = shared(ctx);
  const START_FREQ = 48;
  const FREQ_AMT = 50;
  const decayMs = decay * 500 + 50;

  const out = gainOf(ctx, level);
  const clip = shaperOf(ctx, s.softClip, '4x');
  const preClip = gainOf(ctx, drive);
  const lp = filterOf(ctx, 'lowpass', 200 + tone * 2000, 1);
  const vca = gainOf(ctx, 0);
  const osc = oscOf(ctx, 'sine', START_FREQ);

  osc.connect(vca);
  click(ctx, vca, when, 0.8);
  vca.connect(lp).connect(preClip).connect(clip).connect(out).connect(dest);

  ad(osc.frequency, when, { attackMs: 0.11, decayMs, from: START_FREQ, amount: FREQ_AMT, exponential: true });
  const endsAt = ad(vca.gain, when, { attackMs: 2, decayMs, amount: 1 });

  lifecycle(ctx, [osc], when, endsAt, out);
  return out;
}

/**
 * Snare. Two sines (476Hz and 238Hz) for the drum body, white noise through a
 * highpass for the wires. "Snappy" is the balance between them — the same
 * control the hardware has.
 */
export function snareDrum(ctx, dest, when, { level = 1, tone = 0.5, snappy = 0.5, decay = 0.5 } = {}) {
  const s = shared(ctx);
  const out = gainOf(ctx, level);
  out.connect(dest);

  const hi = oscOf(ctx, 'sine', 476);
  const lo = oscOf(ctx, 'sine', 238);
  const bodyVca = gainOf(ctx, 0);
  hi.connect(bodyVca);
  lo.connect(bodyVca);
  bodyVca.connect(out);

  const noise = noiseOf(ctx, s.white);
  const hp = filterOf(ctx, 'highpass', tone * 1000 + 800);
  const noiseVca = gainOf(ctx, 0);
  noise.connect(hp).connect(noiseVca).connect(out);

  const noiseDecay = 40 + decay * 120;
  const e1 = ad(noiseVca.gain, when, { decayMs: noiseDecay, amount: 0.5 });
  const e2 = ad(bodyVca.gain, when, { decayMs: 50, amount: 0.25 + snappy * 0.5 });

  lifecycle(ctx, [hi, lo, noise], when, Math.max(e1, e2), out);
  return out;
}

/**
 * Hi-hats. Six square waves at 263, 400, 421, 474, 587 and 845 Hz — the actual
 * 808 frequencies — band-passed and high-passed. Closed and open are the same
 * circuit with a different decay, which is why they sound like one hat.
 */
function hiHat(ctx, dest, when, level, decayMs) {
  const out = gainOf(ctx, level);
  out.connect(dest);

  const mix = gainOf(ctx, 1);
  const oscs = [263, 400, 421, 474, 587, 845].map((f) => {
    const o = oscOf(ctx, 'square', f);
    const g = gainOf(ctx, 0.3);
    o.connect(g).connect(mix);
    return o;
  });

  const band = filterOf(ctx, 'bandpass', 10000);
  const vca = gainOf(ctx, 0);
  const high = filterOf(ctx, 'highpass', 8000);
  mix.connect(band).connect(vca).connect(high).connect(out);

  const endsAt = ad(vca.gain, when, { decayMs, amount: 1 });
  lifecycle(ctx, oscs, when, endsAt, out);
  return out;
}

export function closedHat(ctx, dest, when, { level = 1, decay = 0.5 } = {}) {
  return hiHat(ctx, dest, when, level, 20 + decay * 60);
}

export function openHat(ctx, dest, when, { level = 1, decay = 0.5 } = {}) {
  return hiHat(ctx, dest, when, level, 90 + decay * 360);
}

/**
 * Cymbal. The same six oscillators split into three bands with three separate
 * decays — long low, medium mid, short high. Tone tilts the balance between the
 * low and high bands, which is how the 808's CYMBAL TONE knob works.
 */
export function cymbal(ctx, dest, when, { level = 1, tone = 0.5, decay = 0.5 } = {}) {
  const out = gainOf(ctx, level);
  out.connect(dest);

  const mix = gainOf(ctx, 1);
  const oscs = [263, 400, 421, 474, 587, 845].map((f) => {
    const o = oscOf(ctx, 'square', f);
    const g = gainOf(ctx, 0.3);
    o.connect(g).connect(mix);
    return o;
  });

  const lowBand = filterOf(ctx, 'bandpass', 5000);
  const lowVca = gainOf(ctx, 0);
  const lowHp = filterOf(ctx, 'highpass', 5000);
  mix.connect(lowBand).connect(lowVca).connect(lowHp).connect(out);

  const midBand = filterOf(ctx, 'bandpass', 10000);
  const midVca = gainOf(ctx, 0);
  const midHp = filterOf(ctx, 'highpass', 10000);
  mix.connect(midBand).connect(midVca).connect(midHp).connect(out);

  const highVca = gainOf(ctx, 0);
  const highHp = filterOf(ctx, 'highpass', 8000);
  midBand.connect(highVca).connect(highHp).connect(out);

  const lowDecay = decay * 850 + 700;
  const e1 = ad(lowVca.gain, when, { decayMs: lowDecay, amount: 0.666 * (1 - tone), exponential: true });
  const e2 = ad(midVca.gain, when, { decayMs: 400, amount: 0.333, exponential: true });
  const e3 = ad(highVca.gain, when, { decayMs: 150, amount: 0.666 * tone, exponential: true });

  lifecycle(ctx, oscs, when, Math.max(e1, e2, e3), out);
  return out;
}

/**
 * Toms and congas. A tuned sine with a click; the toms also get pink noise for
 * the skin, the congas don't — that is the only difference in the hardware.
 */
export function tomConga(ctx, dest, when, { level = 1, tuning = 0.5, pitchRange = [220, 165], decayMs = 180, isTom = true } = {}) {
  const s = shared(ctx);
  const [hiFreq, loFreq] = pitchRange;
  const freq = tuning * (hiFreq - loFreq) + loFreq;

  const out = gainOf(ctx, level);
  out.connect(dest);

  const osc = oscOf(ctx, 'sine', freq);
  const oscVca = gainOf(ctx, 0);
  osc.connect(oscVca).connect(out);

  const sources = [osc];
  let endsAt = ad(oscVca.gain, when, { decayMs, amount: 1 });

  if (isTom) {
    const noise = noiseOf(ctx, s.pink);
    const lp = filterOf(ctx, 'lowpass', 10000);
    const noiseVca = gainOf(ctx, 0);
    noise.connect(lp).connect(noiseVca).connect(out);
    endsAt = Math.max(endsAt, ad(noiseVca.gain, when, { decayMs: decayMs * 0.9, amount: 0.2 }));
    sources.push(noise);
  }

  click(ctx, out, when, 0.3);
  lifecycle(ctx, sources, when, endsAt, out);
  return out;
}

/**
 * Cowbell. Two square waves (800Hz and 540Hz) through a narrow bandpass, with
 * a short envelope and a long one layered — the clank plus the ring.
 */
export function cowbell(ctx, dest, when, { level = 1, decay = 0.5 } = {}) {
  const out = gainOf(ctx, level);
  out.connect(dest);

  const hi = oscOf(ctx, 'square', 800);
  const lo = oscOf(ctx, 'square', 540);
  const shortVca = gainOf(ctx, 0);
  const longVca = gainOf(ctx, 0);
  const band = filterOf(ctx, 'bandpass', 2640, 1);

  hi.connect(shortVca); hi.connect(longVca);
  lo.connect(shortVca); lo.connect(longVca);
  shortVca.connect(band);
  longVca.connect(band);
  band.connect(out);

  const LONG_AMT = 0.25;
  const longDecay = 150 + decay * 500;
  const e1 = ad(shortVca.gain, when, { attackMs: 0.11, decayMs: 15, amount: (1 - LONG_AMT) / 2 });
  const e2 = ad(longVca.gain, when, { attackMs: 15, decayMs: longDecay, amount: LONG_AMT / 2, exponential: true });

  lifecycle(ctx, [hi, lo], when, Math.max(e1, e2), out);
  return out;
}

/**
 * Clave and rimshot. Same circuit, different tuning and different tap point:
 * the clave takes the triangle straight out, the rimshot runs it through a
 * rectifier and a hard clipper first — that snap is distortion, not an
 * envelope.
 */
export function claveRimshot(ctx, dest, when, { level = 1, isRimshot = false } = {}) {
  const s = shared(ctx);
  const out = gainOf(ctx, level);
  out.connect(dest);

  const claveOsc = oscOf(ctx, 'triangle', isRimshot ? 1750 : 2450);
  const claveFilter = isRimshot
    ? filterOf(ctx, 'highpass', 2450)
    : filterOf(ctx, 'bandpass', 2450);
  const claveVca = gainOf(ctx, 0);
  claveOsc.connect(claveFilter).connect(claveVca);

  const sources = [claveOsc];
  const claveEnd = ad(claveVca.gain, when, { attackMs: 0.11, decayMs: 40, amount: 0.7, exponential: true });

  if (!isRimshot) {
    claveVca.connect(out);
    lifecycle(ctx, sources, when, claveEnd, out);
    return out;
  }

  const rimOsc = oscOf(ctx, 'sine', 480);
  const rimBand = filterOf(ctx, 'bandpass', 480);
  const rimHigh = filterOf(ctx, 'highpass', 480);
  const rectifier = shaperOf(ctx, s.halfWave, 'none');
  const clipDrive = gainOf(ctx, 3);
  const clipper = shaperOf(ctx, s.softClip, '2x');
  const swingVca = gainOf(ctx, 0);

  rimOsc.connect(rimBand).connect(rectifier);
  claveVca.connect(rectifier);
  rectifier.connect(clipDrive).connect(clipper).connect(swingVca).connect(rimHigh).connect(out);

  const swingEnd = ad(swingVca.gain, when, { attackMs: 0.11, decayMs: 10, amount: 1.7 });
  sources.push(rimOsc);
  lifecycle(ctx, sources, when, Math.max(claveEnd, swingEnd), out);
  return out;
}

/** Maracas — white noise, highpassed, very short. */
export function maracas(ctx, dest, when, { level = 1, decay = 0.5 } = {}) {
  const s = shared(ctx);
  const out = gainOf(ctx, level);
  out.connect(dest);

  const noise = noiseOf(ctx, s.white);
  const hp = filterOf(ctx, 'highpass', 5000);
  const vca = gainOf(ctx, 0);
  noise.connect(hp).connect(vca).connect(out);

  const endsAt = ad(vca.gain, when, { attackMs: 0.2, decayMs: 15 + decay * 40, amount: 0.5 });
  lifecycle(ctx, [noise], when, endsAt, out);
  return out;
}

/**
 * Handclap. Four bursts 10ms apart and then a longer tail, all from one
 * band-passed noise source. Four people not quite clapping together — that
 * stagger is the whole sound, and a single envelope can't fake it.
 */
export function handclap(ctx, dest, when, { level = 1, decay = 0.5 } = {}) {
  const s = shared(ctx);
  const out = gainOf(ctx, level);
  out.connect(dest);

  const noise = noiseOf(ctx, s.white);
  const band = filterOf(ctx, 'bandpass', 1000, 1.2);
  const burstVca = gainOf(ctx, 0);
  const tailVca = gainOf(ctx, 0);
  noise.connect(band);
  band.connect(burstVca).connect(out);
  band.connect(tailVca).connect(out);

  // The bursts: a stepped saw, each one quieter than the last.
  const INTERVAL = 0.01;
  burstVca.gain.cancelScheduledValues(when);
  let t = when;
  for (let i = 0; i < 4; i++) {
    burstVca.gain.setValueAtTime(1 - i / 2, t);
    t += INTERVAL;
    burstVca.gain.linearRampToValueAtTime(0, t);
  }
  const tailEnd = ad(tailVca.gain, when, { attackMs: 0.2, decayMs: 60 + decay * 160, amount: 0.75 });

  lifecycle(ctx, [noise], when, Math.max(t, tailEnd), out);
  return out;
}
