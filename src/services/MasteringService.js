// Offline mastering engine — Lyricist 4.1.3
//
// Renders each track through a classic mastering chain using an
// OfflineAudioContext (faster than realtime, fully local, no uploads):
//
//   source → input trim → low shelf → mid peak → high shelf
//          → glue compressor → brickwall-ish limiter → render
//          → loudness normalize (RMS target, peak-capped at -1 dBFS) → WAV
//
// Settings are 0–1 sliders mapped to sensible ranges, plus named presets.

import { decodeBlob } from './audioEngine.js';
import { audioBufferToWav } from '../utils/wavEncoder.js';

export const MASTERING_PRESETS = {
  'Warm Analog':   { bass: 0.62, mids: 0.45, treble: 0.5,  compression: 0.45, loudness: 0.5 },
  'Loud & Proud':  { bass: 0.55, mids: 0.55, treble: 0.6,  compression: 0.75, loudness: 0.85 },
  'Crystal Clear': { bass: 0.45, mids: 0.5,  treble: 0.72, compression: 0.35, loudness: 0.55 },
  'Bass Heavy':    { bass: 0.85, mids: 0.4,  treble: 0.5,  compression: 0.55, loudness: 0.65 },
  'Gentle Touch':  { bass: 0.5,  mids: 0.5,  treble: 0.5,  compression: 0.2,  loudness: 0.4 }
};
export const DEFAULT_MASTERING = { ...MASTERING_PRESETS['Warm Analog'] };

const lerp = (a, b, t) => a + (b - a) * t;
const dbToGain = (db) => Math.pow(10, db / 20);

function measure(buffer) {
  let peak = 0, sumSq = 0, count = 0;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const d = buffer.getChannelData(ch);
    for (let i = 0; i < d.length; i++) {
      const v = Math.abs(d[i]);
      if (v > peak) peak = v;
      sumSq += d[i] * d[i];
      count++;
    }
  }
  return { peak, rms: Math.sqrt(sumSq / Math.max(1, count)) };
}

/**
 * Master one track.
 * @param {Blob} blob     original audio
 * @param {object} s      { bass, mids, treble, compression, loudness } all 0–1
 * @returns {Promise<{ wavBlob, buffer, stats }>}
 */
export async function masterTrack(blob, s = DEFAULT_MASTERING) {
  const input = await decodeBlob(blob);
  const before = measure(input);

  const OfflineAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const ctx = new OfflineAC(2, Math.ceil(input.duration * 44100) + 4410, 44100);

  const src = ctx.createBufferSource();
  src.buffer = input;

  const trim = ctx.createGain();
  trim.gain.value = 0.9; // headroom into the chain

  // ── 3-band EQ ── slider 0.5 = flat, range ±9 dB
  const low = ctx.createBiquadFilter();
  low.type = 'lowshelf';
  low.frequency.value = 120;
  low.gain.value = lerp(-9, 9, s.bass ?? 0.5);

  const mid = ctx.createBiquadFilter();
  mid.type = 'peaking';
  mid.frequency.value = 1600;
  mid.Q.value = 0.8;
  mid.gain.value = lerp(-6, 6, s.mids ?? 0.5);

  const high = ctx.createBiquadFilter();
  high.type = 'highshelf';
  high.frequency.value = 8000;
  high.gain.value = lerp(-9, 9, s.treble ?? 0.5);

  // ── Glue compressor ── more slider = lower threshold + higher ratio
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = lerp(-8, -32, s.compression ?? 0.5);
  comp.ratio.value = lerp(1.5, 8, s.compression ?? 0.5);
  comp.knee.value = 12;
  comp.attack.value = 0.01;
  comp.release.value = 0.22;

  // Makeup gain rises with compression amount
  const makeup = ctx.createGain();
  makeup.gain.value = dbToGain(lerp(0, 7, s.compression ?? 0.5));

  // ── Limiter ── hard ceiling behaviour from a fast, steep compressor
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -2;
  limiter.ratio.value = 20;
  limiter.knee.value = 0;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.08;

  src.connect(trim).connect(low).connect(mid).connect(high)
    .connect(comp).connect(makeup).connect(limiter).connect(ctx.destination);
  src.start(0);

  const rendered = await ctx.startRendering();

  // ── Loudness normalize ──
  // Aim the RMS at a target between quiet (-20 dBFS) and streaming-hot
  // (-11 dBFS) based on the loudness slider, but never push the true peak
  // past -1 dBFS.
  const m = measure(rendered);
  const targetRms = dbToGain(lerp(-20, -11, s.loudness ?? 0.5));
  const targetPeak = dbToGain(-1);
  const gain = Math.min(
    m.rms > 0 ? targetRms / m.rms : 1,
    m.peak > 0 ? targetPeak / m.peak : 1
  );
  if (Math.abs(gain - 1) > 0.001) {
    for (let ch = 0; ch < rendered.numberOfChannels; ch++) {
      const d = rendered.getChannelData(ch);
      for (let i = 0; i < d.length; i++) d[i] *= gain;
    }
  }
  const after = measure(rendered);

  return {
    wavBlob: audioBufferToWav(rendered),
    buffer: rendered,
    stats: {
      duration: rendered.duration,
      peakBeforeDb: 20 * Math.log10(before.peak || 1e-6),
      peakAfterDb: 20 * Math.log10(after.peak || 1e-6),
      rmsBeforeDb: 20 * Math.log10(before.rms || 1e-6),
      rmsAfterDb: 20 * Math.log10(after.rms || 1e-6)
    }
  };
}
