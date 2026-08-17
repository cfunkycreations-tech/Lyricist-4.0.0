import { audioBufferToWav } from '../utils/wavEncoder.js';

/**
 * CHOPPED & SCREWED — the Houston treatment, done properly.
 *
 * Two separate things that always get lumped together:
 *
 *   SCREWED is the tape slowed down. Pitch and tempo drop TOGETHER, which is
 *   the whole sound. Any "pitch correction" ruins it — the sunken, syrupy
 *   voice IS the effect. Web Audio's playbackRate does exactly the right thing
 *   here, because it resamples rather than time-stretching.
 *
 *   CHOPPED is the edit. Slices repeated on the beat, records dragged back a
 *   bar, a phrase stuttered. It is rhythmic, so it has to land on a beat grid
 *   or it just sounds broken.
 *
 * Everything runs in an OfflineAudioContext, same as Mastering Studio: fully
 * local, faster than realtime, nothing uploaded.
 */

/** Where the classics sit. 33 rpm played at 25 is about 0.75. */
export const SCREW_PRESETS = {
  'Barely touched': 0.92,
  'Sunday slow': 0.85,
  'Screwed': 0.78,
  'Deep screw': 0.70,
  'Sunk': 0.62,
};

export const CHOP_STYLES = {
  none: { label: 'No chops, just slow', repeats: 0, every: 0, rewind: 0 },
  light: { label: 'Light doubles', repeats: 2, every: 8, rewind: 0 },
  classic: { label: 'Classic chop', repeats: 2, every: 4, rewind: 0.12 },
  stutter: { label: 'Triple stutter', repeats: 3, every: 4, rewind: 0.1 },
  heavy: { label: 'Chopped to pieces', repeats: 3, every: 2, rewind: 0.25 },
};

export const DEFAULT_SCREW = {
  rate: 0.78,
  bpm: 140,          // of the ORIGINAL track, before slowing
  style: 'classic',
  chopUnit: 0.5,     // slice length in beats
  reverb: 0.18,
  lowpass: 0.35,     // how much top end comes off, tape-style
  seed: 7,
  sub: 0.35,         // subterranean bass, 0 = off
  subHz: 32,         // 25-30 you feel more than hear. 40-55 you hear.
};

/** Small deterministic RNG so the same settings always give the same tape. */
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

/**
 * Build the edit as a list of slices before touching any audio.
 *
 * Each entry says: take this much of the source starting here, and lay it down
 * at this point in the output. Slowing happens on playback, so an output slot
 * is always `len / rate` long — which is why the finished tape runs longer
 * than the original.
 */
export function planChops(durationSec, { rate, bpm, style, chopUnit, seed, manual }) {
  // `manual` is a Set of slice indices the user clicked in the slicer. A click
  // FORCES a chop where the pattern would not have put one, and REMOVES one
  // where it would — so the drawn grid is the truth, not a suggestion.
  const forced = manual instanceof Set ? manual : new Set(manual || []);
  const cfg = CHOP_STYLES[style] || CHOP_STYLES.classic;
  const beat = 60 / Math.max(40, bpm);
  const slice = Math.max(0.05, beat * chopUnit);
  const rand = rng(seed);

  const plan = [];
  const grid = [];
  let src = 0;
  let out = 0;
  let i = 0;

  while (src < durationSec - 0.01) {
    const len = Math.min(slice, durationSec - src);
    const patternChop = cfg.every > 0 && i > 0 && i % cfg.every === 0;
    const isChop = forced.has(i) ? !patternChop : patternChop;

    if (isChop) {
      // The chop: the SAME slice laid down two or three times. The source
      // pointer only advances once, which is what makes it a stutter rather
      // than just a faster edit.
      for (let k = 0; k < cfg.repeats; k += 1) {
        plan.push({ src, len, out, i, chop: true });
        out += len / rate;
      }
    } else {
      plan.push({ src, len, out, i, chop: false });
      out += len / rate;
    }

    grid.push({ i, src, len, chop: isChop, repeats: isChop ? cfg.repeats : 1 });
    src += len;

    // The drag: the record pulled back and replayed.
    //
    // This only fires on a BAR line, and only pulls back two beats. Rolling it
    // per slice pulled back four beats far more often than it moved forward,
    // and a 30 second track rendered as five minutes of the same eight bars.
    // A drag is a gesture, not a loop.
    const onBar = i > 0 && (i % Math.max(1, Math.round(4 / chopUnit)) === 0);
    if (cfg.rewind > 0 && onBar && rand() < cfg.rewind) {
      src = Math.max(0, src - beat * 2);
      if (grid.length) grid[grid.length - 1].drag = true;
    }
    i += 1;
  }
  return { plan, grid, outputSeconds: out, slice };
}


/**
 * SUBTERRANEAN BASS.
 *
 * Not a drone underneath the song — a sine that FOLLOWS the song's own low
 * end, which is why it locks to the track instead of fighting it. This is how
 * a real sub-harmonic exciter works:
 *
 *   1. take the bass band out of the mix
 *   2. follow its envelope, fast to open and slow to close
 *   3. drive a sine at 25-55 Hz with that envelope
 *   4. mix it under
 *
 * So it thumps where the track already thumps. No beat detection needed, and
 * nothing to go wrong on a track with an odd groove.
 *
 * Done on raw samples after rendering rather than as Web Audio nodes: envelope
 * following needs per-sample state, which an OfflineAudioContext graph has no
 * clean way to express.
 */
export function addSubBass(buffer, { sub = 0.35, subHz = 32 } = {}) {
  if (sub <= 0) return buffer;

  const sr = buffer.sampleRate;
  const n = buffer.length;
  const chans = buffer.numberOfChannels;
  const data = [];
  for (let c = 0; c < chans; c += 1) data.push(buffer.getChannelData(c));

  // one-pole lowpass, ~110 Hz: everything the sub should be following
  const cut = Math.exp(-2 * Math.PI * 110 / sr);
  // 8 ms attack so it catches a kick, 140 ms release so it does not flutter
  const atk = Math.exp(-1 / (0.008 * sr));
  const rel = Math.exp(-1 / (0.140 * sr));

  let lp = 0;
  let env = 0;
  let phase = 0;
  const inc = (2 * Math.PI * subHz) / sr;

  for (let i = 0; i < n; i += 1) {
    let mono = 0;
    for (let c = 0; c < chans; c += 1) mono += data[c][i];
    mono /= chans;

    lp = mono * (1 - cut) + lp * cut;
    const rect = Math.abs(lp);
    env = rect > env ? rect + (env - rect) * atk : rect + (env - rect) * rel;

    phase += inc;
    if (phase > Math.PI * 2) phase -= Math.PI * 2;

    // 1.6x because the envelope of a 110 Hz band sits well below the peak of
    // the full mix, and without it the sub is inaudible at sensible settings.
    const s = Math.sin(phase) * env * sub * 1.6;

    for (let c = 0; c < chans; c += 1) {
      // tanh rather than a hard clamp: a 30 Hz sine driven into a limit is
      // exactly where a hard clip turns into audible crackle.
      data[c][i] = Math.tanh(data[c][i] + s);
    }
  }
  return buffer;
}

/**
 * Render the tape.
 *
 * `onProgress` is called with 0..1 while the plan is built, because a long
 * track with heavy chops makes thousands of slices and the UI should not look
 * frozen while that happens.
 */
export async function screwTrack(blob, settings = {}, onProgress) {
  const s = { ...DEFAULT_SCREW, ...settings };
  const AC = window.AudioContext || window.webkitAudioContext;
  const OfflineAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!OfflineAC) throw new Error('This browser cannot render audio offline.');

  const bytes = await blob.arrayBuffer();
  const tmp = new AC();
  const source = await tmp.decodeAudioData(bytes.slice(0));
  tmp.close();

  const { plan, outputSeconds } = planChops(source.duration, s);
  onProgress?.(0.35);

  const ctx = new OfflineAC(
    source.numberOfChannels,
    Math.ceil((outputSeconds + s.reverb * 3 + 0.5) * source.sampleRate),
    source.sampleRate,
  );

  // ── the chain ──────────────────────────────────────────────────────────
  const master = ctx.createGain();
  master.gain.value = 0.92;

  // Rolling the top off is most of the "old tape" feel. Screwing already
  // drags the highs down; this finishes the job.
  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = 20000 - s.lowpass * 14000;
  tone.Q.value = 0.7;

  // A short bright-ish room. Built rather than loaded so there is no impulse
  // file to ship and nothing to go missing in a packaged build.
  const verbLen = Math.max(0.05, s.reverb) * 2.2;
  const ir = ctx.createBuffer(2, Math.ceil(verbLen * ctx.sampleRate), ctx.sampleRate);
  for (let ch = 0; ch < 2; ch += 1) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < d.length; i += 1) {
      d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2.6;
    }
  }
  const verb = ctx.createConvolver();
  verb.buffer = ir;
  const wet = ctx.createGain();
  wet.gain.value = s.reverb * 0.55;

  tone.connect(master);
  tone.connect(verb);
  verb.connect(wet);
  wet.connect(master);
  master.connect(ctx.destination);

  // ── lay down the slices ────────────────────────────────────────────────
  // A tiny fade on every slice edge. Without it each chop starts and stops on
  // a hard sample boundary and the whole thing clicks like a bad edit.
  const EDGE = 0.004;
  for (const seg of plan) {
    const node = ctx.createBufferSource();
    node.buffer = source;
    node.playbackRate.value = s.rate;

    const g = ctx.createGain();
    const dur = seg.len / s.rate;
    const t = seg.out;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(1, t + EDGE);
    g.gain.setValueAtTime(1, t + Math.max(EDGE, dur - EDGE));
    g.gain.linearRampToValueAtTime(0, t + dur);

    node.connect(g);
    g.connect(tone);
    node.start(t, seg.src, seg.len);
    node.stop(t + dur + 0.01);
  }
  onProgress?.(0.6);

  const rendered = await ctx.startRendering();
  addSubBass(rendered, s);
  onProgress?.(1);

  return {
    blob: audioBufferToWav(rendered),
    seconds: rendered.duration,
    slices: plan.length,
    originalSeconds: source.duration,
  };
}
