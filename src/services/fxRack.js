/**
 * Effects rack — Lyricist 4.2.0
 *
 * One rack per drum track and one more across the master bus. All native Web
 * Audio: no library, no licence, no network, works with the machine unplugged.
 *
 * Order is deliberate, and it is the order a mixing desk uses. Filter and drive
 * shape the tone, EQ corrects what that left behind, the compressor levels the
 * result, and only then is anything sent to delay and reverb — so the effects
 * hear the finished sound instead of a raw one. Both sends are parallel and
 * rejoin at the output, so turning one up adds to the dry signal instead of
 * replacing it.
 *
 * What was wrong with the version this replaces, all of which made it sound
 * worse the more you used it:
 *   - the compressor had no makeup gain, so switching it on just went quieter
 *   - drive had no gain compensation, so it doubled as a volume knob
 *   - the delay was mono, undamped, and hissed forever
 *   - the reverb was one burst of decaying noise: no pre-delay, no early
 *     reflections, no damping, both channels identical, so it read as static
 *     rather than a room
 *   - nothing stopped the master clipping
 */

/** Soft saturation curve. `amount` 0..1. */
function driveCurve(amount = 0.3, samples = 1024) {
  const k = Math.max(0, amount) * 100;
  const curve = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
  }
  return curve;
}

/**
 * Bitcrusher: quantise to `bits` steps. That is the amplitude half of a
 * bitcrush — the half you can do with a waveshaper and no worklet.
 */
function crushCurve(bits = 8, samples = 8192) {
  const levels = Math.pow(2, Math.max(1, Math.min(16, bits)));
  const curve = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    curve[i] = Math.round(x * levels) / levels;
  }
  return curve;
}

/**
 * Reverb impulse. Not just decaying noise: silence for the pre-delay, a handful
 * of discrete early reflections, then a diffuse tail that darkens as it fades —
 * which is what a room does, and the difference between "a space" and "a burst
 * of static". The two channels are generated separately so it is truly stereo.
 */
function makeImpulse(ctx, seconds = 1.8, { decay = 2.6, preDelay = 0.012, damping = 0.35 } = {}) {
  const rate = ctx.sampleRate;
  const tail = Math.max(1, Math.floor(rate * Math.max(0.05, seconds)));
  const pre = Math.floor(rate * Math.max(0, preDelay));
  const len = pre + tail;
  const impulse = ctx.createBuffer(2, len, rate);

  // Early reflections: seconds in, and how loud. Offset per channel so the
  // stereo image opens instead of collapsing to the middle.
  const EARLY = [[0.0091, 0.72], [0.0143, 0.58], [0.0217, 0.44], [0.0331, 0.35], [0.0452, 0.26]];

  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    const skew = ch === 0 ? 1 : 1.13;
    const damp = Math.max(0.02, Math.min(0.95, damping));
    let lp = 0;

    for (let i = 0; i < tail; i++) {
      const t = i / tail;
      const white = Math.random() * 2 - 1;
      // One-pole lowpass that closes as the tail decays: highs die first.
      lp += (white - lp) * (1 - damp * t);
      data[pre + i] = lp * Math.pow(1 - t, decay);
    }
    for (const [at, amp] of EARLY) {
      const idx = pre + Math.floor(at * skew * rate);
      if (idx < len) data[idx] += (Math.random() > 0.5 ? amp : -amp);
    }
  }
  return impulse;
}

export const DEFAULT_FX = {
  // Filters
  hpFreq: 20,
  filterType: 'lowpass',
  filterFreq: 20000,
  filterQ: 0.7,
  // Drive and crush
  drive: 0,
  crush: 0,           // 0 = off, otherwise bit depth 1–16
  // Three-band EQ, in dB
  eqLow: 0,
  eqMid: 0,
  eqMidFreq: 900,
  eqHigh: 0,
  // Compressor
  compress: 0,        // 0 = off, 1 = full
  // Delay
  delayTime: 0,       // seconds
  delayFeedback: 0.3,
  delayDamp: 4200,    // Hz — each repeat comes back darker
  delayPingPong: 1,   // 0 = repeats down the middle, 1 = bounce left/right
  delayMix: 0,
  // Reverb
  reverbMix: 0,
  reverbSize: 1.8,
  reverbPreDelay: 0.012,
  reverbDamp: 0.35,
  // Output
  pan: 0,
  level: 1,
  limit: 0,           // master bus only: 0 = off, 1 = on
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * Final safety curve: linear until about -3dB, then tanh into a hard ceiling
 * just under full scale. Transparent at normal levels, and nothing gets out
 * above 1.0 no matter how hard the rack is pushed.
 */
const SAFETY_CURVE = (() => {
  const n = 8192;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    const a = Math.abs(x);
    const y = a <= 0.7 ? a : 0.7 + Math.tanh((a - 0.7) * 2.4) * 0.29;
    c[i] = Math.sign(x) * y;
  }
  return c;
})();

/** Build an effect chain. Returns { input, output, set, state, dispose }. */
export function createFxChain(ctx, initial = {}) {
  const fx = { ...DEFAULT_FX, ...initial };

  const input = ctx.createGain();

  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  const filter = ctx.createBiquadFilter();

  const drivePre = ctx.createGain();
  const shaper = ctx.createWaveShaper();
  shaper.oversample = '4x';
  // Any asymmetry in a saturator leaves a DC offset behind, and with the drive
  // gain pushing 9x that offset was audible as a tail hanging on for seconds
  // after the hit. Every distortion stage needs a DC blocker after it.
  const dcBlock = ctx.createBiquadFilter();
  dcBlock.type = 'highpass';
  dcBlock.frequency.value = 22;
  dcBlock.Q.value = 0.7;
  const drivePost = ctx.createGain();

  const crusher = ctx.createWaveShaper();
  const crushMakeup = ctx.createGain();

  const eqLow = ctx.createBiquadFilter();
  eqLow.type = 'lowshelf';
  eqLow.frequency.value = 180;
  const eqMid = ctx.createBiquadFilter();
  eqMid.type = 'peaking';
  eqMid.Q.value = 0.9;
  const eqHigh = ctx.createBiquadFilter();
  eqHigh.type = 'highshelf';
  eqHigh.frequency.value = 6500;

  const comp = ctx.createDynamicsCompressor();
  const makeup = ctx.createGain();

  const panner = ctx.createStereoPanner();
  const dry = ctx.createGain();
  const out = ctx.createGain();

  // Ping-pong delay: each line feeds the other's input, so repeats alternate
  // sides, and each pass goes through a lowpass so the tail darkens.
  const delayL = ctx.createDelay(2.0);
  const delayR = ctx.createDelay(2.0);
  const fbL = ctx.createGain();
  const fbR = ctx.createGain();
  const dampL = ctx.createBiquadFilter();
  dampL.type = 'lowpass';
  const dampR = ctx.createBiquadFilter();
  dampR.type = 'lowpass';
  const panL = ctx.createStereoPanner();
  const panR = ctx.createStereoPanner();
  const delaySend = ctx.createGain();
  const delayMix = ctx.createGain();

  const revSend = ctx.createGain();
  const convolver = ctx.createConvolver();
  const reverbMix = ctx.createGain();

  // Master limiter. Always wired; muted rather than rewired when off, because
  // changing the graph while audio is running clicks.
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -1.5;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.06;
  const limiterGain = ctx.createGain();
  const bypassGain = ctx.createGain();
  // A DynamicsCompressor is not a brickwall — with a 1ms attack it lets the
  // first transient through, so a hot master still peaked over 1.0 and clipped.
  // A tanh curve after it catches whatever gets past, which is what hardware
  // limiters do too.
  const safety = ctx.createWaveShaper();
  safety.curve = SAFETY_CURVE;
  safety.oversample = '4x';
  const finalOut = ctx.createGain();

  input.connect(hp);
  hp.connect(filter);
  filter.connect(drivePre);
  drivePre.connect(shaper);
  shaper.connect(dcBlock);
  dcBlock.connect(drivePost);
  drivePost.connect(crusher);
  crusher.connect(crushMakeup);
  crushMakeup.connect(eqLow);
  eqLow.connect(eqMid);
  eqMid.connect(eqHigh);
  eqHigh.connect(comp);
  comp.connect(makeup);
  makeup.connect(panner);
  panner.connect(dry);
  dry.connect(out);

  panner.connect(delaySend);
  delaySend.connect(delayL);
  delaySend.connect(delayR);
  delayL.connect(dampL);
  dampL.connect(fbL);
  fbL.connect(delayR);
  delayR.connect(dampR);
  dampR.connect(fbR);
  fbR.connect(delayL);
  delayL.connect(panL);
  delayR.connect(panR);
  panL.connect(delayMix);
  panR.connect(delayMix);
  delayMix.connect(out);

  panner.connect(revSend);
  revSend.connect(convolver);
  convolver.connect(reverbMix);
  reverbMix.connect(out);

  out.connect(limiter);
  limiter.connect(limiterGain);
  limiterGain.connect(safety);
  out.connect(bypassGain);
  bypassGain.connect(safety);
  safety.connect(finalOut);

  const set = (patch = {}) => {
    Object.assign(fx, patch);

    hp.frequency.value = clamp(fx.hpFreq, 20, 20000);
    filter.type = fx.filterType;
    filter.frequency.value = clamp(fx.filterFreq, 20, 22050);
    filter.Q.value = clamp(fx.filterQ, 0.0001, 20);

    // Push hard into the shaper, pull the level back out afterwards, so drive
    // changes the character and not the volume.
    const d = clamp(fx.drive, 0, 1);
    drivePre.gain.value = 1 + d * 8;
    shaper.curve = d > 0 ? driveCurve(d) : null;
    drivePost.gain.value = d > 0 ? 1 / (1 + d * 3.2) : 1;

    crusher.curve = fx.crush > 0 ? crushCurve(fx.crush) : null;
    crushMakeup.gain.value = fx.crush > 0 ? 1 + (16 - clamp(fx.crush, 1, 16)) * 0.03 : 1;

    eqLow.gain.value = clamp(fx.eqLow, -24, 24);
    eqMid.gain.value = clamp(fx.eqMid, -24, 24);
    eqMid.frequency.value = clamp(fx.eqMidFreq, 100, 12000);
    eqHigh.gain.value = clamp(fx.eqHigh, -24, 24);

    const c = clamp(fx.compress, 0, 1);
    comp.threshold.value = c > 0 ? -12 - c * 24 : 0;
    comp.ratio.value = c > 0 ? 2 + c * 10 : 1;
    comp.knee.value = 6;
    comp.attack.value = 0.004;
    comp.release.value = 0.14;
    makeup.gain.value = c > 0 ? 1 + c * 1.6 : 1;   // put back what it took

    panner.pan.value = clamp(fx.pan, -1, 1);
    dry.gain.value = 1;
    out.gain.value = Math.max(0, fx.level);

    const dt = clamp(fx.delayTime, 0, 2);
    delayL.delayTime.value = dt;
    delayR.delayTime.value = fx.delayPingPong ? clamp(dt * 1.5, 0, 2) : dt;
    const fbAmt = clamp(fx.delayFeedback, 0, 0.92);
    fbL.gain.value = fbAmt;
    fbR.gain.value = fbAmt;
    dampL.frequency.value = clamp(fx.delayDamp, 200, 20000);
    dampR.frequency.value = clamp(fx.delayDamp, 200, 20000);
    const spread = fx.delayPingPong ? 0.85 : 0;
    panL.pan.value = -spread;
    panR.pan.value = spread;
    delaySend.gain.value = fx.delayMix > 0 ? 1 : 0;
    delayMix.gain.value = clamp(fx.delayMix, 0, 1);

    revSend.gain.value = fx.reverbMix > 0 ? 1 : 0;
    reverbMix.gain.value = clamp(fx.reverbMix, 0, 1);
    if (fx.reverbMix > 0 && (!convolver.buffer || fx.__rebuildIR)) {
      convolver.buffer = makeImpulse(ctx, fx.reverbSize, {
        preDelay: fx.reverbPreDelay,
        damping: fx.reverbDamp,
      });
      fx.__rebuildIR = false;
    }

    const limitOn = fx.limit ? 1 : 0;
    limiterGain.gain.value = limitOn;
    bypassGain.gain.value = 1 - limitOn;
  };

  set();

  return {
    input,
    output: finalOut,
    set,
    get state() { return { ...fx }; },
    dispose() {
      [input, hp, filter, drivePre, shaper, dcBlock, drivePost, crusher, crushMakeup,
        eqLow, eqMid, eqHigh, comp, makeup, panner, dry, out,
        delayL, delayR, fbL, fbR, dampL, dampR, panL, panR, delaySend, delayMix,
        revSend, convolver, reverbMix, limiter, limiterGain, bypassGain, safety, finalOut]
        .forEach((n) => { try { n.disconnect(); } catch { /* already gone */ } });
    },
  };
}
