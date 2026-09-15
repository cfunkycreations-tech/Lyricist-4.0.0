/**
 * Stemmer engine — STFT-based spectral stem separation with HPSS.
 * Uses Short-Time Fourier Transform + Harmonic-Percussive Source Separation
 * + frequency-domain Wiener soft masking. Dramatically better than the
 * previous one-pole IIR approach which was just EQ carving.
 *
 * Quality level: far above naive filtering. Not Demucs-grade ML, but
 * genuinely usable stems. For true pro quality use the Cloud Demucs path.
 */

import { audioBufferToWav } from '../utils/wavEncoder.js';

export const STEM_DEFS = [
  { id: 'vocals',  label: 'Vocals',  color: '#9ba1aa', icon: 'mic' },
  { id: 'drums',   label: 'Drums',   color: '#e7a540', icon: 'drum' },
  { id: 'bass',    label: 'Bass',    color: '#10f0a0', icon: 'activity' },
  { id: 'guitar',  label: 'Guitar',  color: '#ff6f00', icon: 'guitar' },
  { id: 'keys',    label: 'Keys',    color: '#c0c8d8', icon: 'piano' },
  { id: 'other',   label: 'Other',   color: '#94a3b8', icon: 'layers' },
];

// ─── FFT (Cooley-Tukey in-place radix-2 DIT) ──────────────────────────────

function fft(re, im, inverse = false) {
  const N = re.length;
  // Bit-reversal permutation
  let j = 0;
  for (let i = 1; i < N; i++) {
    let bit = N >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  // Butterfly
  const sign = inverse ? 1 : -1;
  for (let len = 2; len <= N; len <<= 1) {
    const ang = sign * 2 * Math.PI / len;
    const wBaseRe = Math.cos(ang);
    const wBaseIm = Math.sin(ang);
    for (let i = 0; i < N; i += len) {
      let uRe = 1, uIm = 0;
      const half = len >> 1;
      for (let k = 0; k < half; k++) {
        const aRe = re[i + k], aIm = im[i + k];
        const bRe = re[i + k + half], bIm = im[i + k + half];
        const vRe = bRe * uRe - bIm * uIm;
        const vIm = bRe * uIm + bIm * uRe;
        re[i + k]        = aRe + vRe;
        im[i + k]        = aIm + vIm;
        re[i + k + half] = aRe - vRe;
        im[i + k + half] = aIm - vIm;
        const newURe = uRe * wBaseRe - uIm * wBaseIm;
        uIm = uRe * wBaseIm + uIm * wBaseRe;
        uRe = newURe;
      }
    }
  }
  if (inverse) {
    for (let i = 0; i < N; i++) { re[i] /= N; im[i] /= N; }
  }
}

// ─── Window function ───────────────────────────────────────────────────────

function makeHannWindow(N) {
  const w = new Float32Array(N);
  const scale = 2 * Math.PI / (N - 1);
  for (let i = 0; i < N; i++) w[i] = 0.5 * (1 - Math.cos(scale * i));
  return w;
}

// ─── STFT ─────────────────────────────────────────────────────────────────

const FFT_N  = 2048;
const HOP    = 512;
const BINS   = FFT_N / 2 + 1;

function stft(signal, win) {
  const frames = Math.max(1, Math.floor((signal.length - FFT_N) / HOP) + 1);
  const mag   = new Array(frames);
  const phase = new Array(frames);
  const re = new Float64Array(FFT_N);
  const im = new Float64Array(FFT_N);
  for (let f = 0; f < frames; f++) {
    const start = f * HOP;
    re.fill(0); im.fill(0);
    for (let n = 0; n < FFT_N; n++) {
      const idx = start + n;
      re[n] = idx < signal.length ? signal[idx] * win[n] : 0;
    }
    fft(re, im);
    const mRow = new Float32Array(BINS);
    const pRow = new Float32Array(BINS);
    for (let k = 0; k < BINS; k++) {
      mRow[k] = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
      pRow[k] = Math.atan2(im[k], re[k]);
    }
    mag[f]   = mRow;
    phase[f] = pRow;
  }
  return { mag, phase, frames };
}

// ─── ISTFT (overlap-add) ──────────────────────────────────────────────────

function istft(maskedMag, phase, origLen) {
  const frames = maskedMag.length;
  const out    = new Float64Array(origLen + FFT_N);
  const winSum = new Float64Array(origLen + FFT_N);
  const win    = makeHannWindow(FFT_N);
  const re = new Float64Array(FFT_N);
  const im = new Float64Array(FFT_N);
  for (let f = 0; f < frames; f++) {
    re.fill(0); im.fill(0);
    for (let k = 0; k < BINS; k++) {
      const m = maskedMag[f][k], p = phase[f][k];
      re[k] = m * Math.cos(p);
      im[k] = m * Math.sin(p);
      if (k > 0 && k < BINS - 1) {
        re[FFT_N - k] =  re[k];
        im[FFT_N - k] = -im[k];
      }
    }
    fft(re, im, true);
    const start = f * HOP;
    for (let n = 0; n < FFT_N; n++) {
      const idx = start + n;
      if (idx < out.length) {
        out[idx]    += re[n] * win[n];
        winSum[idx] += win[n] * win[n];
      }
    }
  }
  const result = new Float32Array(origLen);
  for (let i = 0; i < origLen; i++) {
    result[i] = winSum[i] > 1e-10 ? out[i] / winSum[i] : 0;
  }
  return result;
}

// ─── Median filter (1-D) ──────────────────────────────────────────────────

function median1D(arr, k) {
  const half = k >> 1;
  const out  = new Float32Array(arr.length);
  const buf  = new Float32Array(k);
  for (let i = 0; i < arr.length; i++) {
    let count = 0;
    for (let d = -half; d <= half; d++) {
      const j = i + d;
      buf[count++] = j >= 0 && j < arr.length ? arr[j] : 0;
    }
    buf.subarray(0, count).sort();
    out[i] = buf[count >> 1];
  }
  return out;
}

// ─── HPSS (Harmonic-Percussive Source Separation) ─────────────────────────
// Classic Fitzgerald 2010 approach: median along time → percussive mask,
// median along frequency → harmonic mask, Wiener soft masking.

function hpss(mag, frames, harmonicKernel = 17, percKernel = 13, power = 2) {
  const numBins = BINS;

  // H[f][k]: median along time axis (bins stay, time is median-filtered)
  // P[f][k]: median along freq axis (time stays, bins are median-filtered)
  const H = new Array(frames);
  const P = new Array(frames);

  // Median along TIME for each bin (harmonic: stable over time)
  for (let k = 0; k < numBins; k++) {
    const col = new Float32Array(frames);
    for (let f = 0; f < frames; f++) col[f] = mag[f][k];
    const filt = median1D(col, harmonicKernel);
    for (let f = 0; f < frames; f++) {
      if (!H[f]) H[f] = new Float32Array(numBins);
      H[f][k] = filt[f];
    }
  }

  // Median along FREQUENCY for each frame (percussive: broadband transients)
  for (let f = 0; f < frames; f++) {
    P[f] = median1D(mag[f], percKernel);
  }

  // Wiener soft masks: maskH = H^p / (H^p + P^p + eps)
  const maskH = new Array(frames);
  const maskP = new Array(frames);
  const eps = 1e-8;
  for (let f = 0; f < frames; f++) {
    maskH[f] = new Float32Array(numBins);
    maskP[f] = new Float32Array(numBins);
    for (let k = 0; k < numBins; k++) {
      const hp = Math.pow(H[f][k], power);
      const pp = Math.pow(P[f][k], power);
      const denom = hp + pp + eps;
      maskH[f][k] = hp / denom;
      maskP[f][k] = pp / denom;
    }
  }

  return { maskH, maskP };
}

// ─── Apply a spectral mask ────────────────────────────────────────────────

function applyMask(mag, mask) {
  return mag.map((row, f) => {
    const out = new Float32Array(BINS);
    for (let k = 0; k < BINS; k++) out[k] = row[k] * mask[f][k];
    return out;
  });
}

// ─── Frequency-band + stereo spatial mask ─────────────────────────────────
// Returns per-frame per-bin soft weights for each "source" based on:
//  - frequency range prior
//  - mid vs side energy ratio

function buildSpectralMasks(midMag, sideMag, sampleRate, frames) {
  const binHz = sampleRate / FFT_N;

  // Weight arrays: [frames][BINS] for each stem
  const wVocal  = new Array(frames);
  const wBass   = new Array(frames);
  const wGuitar = new Array(frames);
  const wKeys   = new Array(frames);
  const wOther  = new Array(frames);

  for (let f = 0; f < frames; f++) {
    wVocal[f]  = new Float32Array(BINS);
    wBass[f]   = new Float32Array(BINS);
    wGuitar[f] = new Float32Array(BINS);
    wKeys[f]   = new Float32Array(BINS);
    wOther[f]  = new Float32Array(BINS);

    for (let k = 0; k < BINS; k++) {
      const hz  = k * binHz;
      const m   = midMag[f][k];
      const s   = sideMag[f][k];
      const tot = m + s + 1e-10;
      const centerRatio = m / tot;   // 1=fully centered, 0=fully wide
      const sideRatio   = s / tot;

      // Bass: below 300 Hz, strongly centered in mix
      const bassW = smoothStep(0, 250, hz) * (1 - smoothStep(250, 380, hz)) * (0.5 + 0.5 * centerRatio);

      // Vocals: 200–4500 Hz, highly centered (center channel extraction)
      const vocalFreq = smoothStep(150, 250, hz) * (1 - smoothStep(4000, 5500, hz));
      const vocalW    = vocalFreq * Math.pow(centerRatio, 1.8);

      // Guitar: 200–5000 Hz, wider stereo placement
      const guitarFreq = smoothStep(200, 400, hz) * (1 - smoothStep(4500, 6000, hz));
      const guitarW    = guitarFreq * (0.3 + 0.7 * sideRatio);

      // Keys/pads: 300–8000 Hz, moderate width
      const keysFreq = smoothStep(300, 600, hz) * (1 - smoothStep(7000, 9000, hz));
      const keysW    = keysFreq * (0.4 + 0.6 * sideRatio);

      // Other: residual — high frequencies + anything left over
      const otherW = smoothStep(4000, 6000, hz) * 0.6 + 0.15;

      // Normalize weights so they sum to 1 per bin (Wiener partition)
      const sum = bassW + vocalW + guitarW + keysW + otherW + 1e-10;
      wBass[f][k]   = bassW   / sum;
      wVocal[f][k]  = vocalW  / sum;
      wGuitar[f][k] = guitarW / sum;
      wKeys[f][k]   = keysW   / sum;
      wOther[f][k]  = otherW  / sum;
    }
  }
  return { wVocal, wBass, wGuitar, wKeys, wOther };
}

function smoothStep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// ─── Loudness normalize ────────────────────────────────────────────────────
// The STFT→mask→ISTFT round-trip comes back at a low absolute level, so the
// stems must be brought UP to an audible level, not just capped. Critically we
// scale every stem by ONE shared gain (set so the loudest stem peaks at target)
// rather than normalizing each on its own — that keeps the relative balance
// between stems and stops an almost-empty stem from being blown up into full
// hiss. (An old per-stem "only ever attenuate" version left every stem at the
// raw ~0.02 peak, which played back as silence — that was the "no sound" bug.)
function peakOf(buf) {
  let peak = 0;
  for (let i = 0; i < buf.length; i++) {
    const a = Math.abs(buf[i]);
    if (a > peak) peak = a;
  }
  return peak;
}

function normalizeAll(bufs, target = 0.92) {
  let maxPeak = 0;
  for (const b of bufs) { const p = peakOf(b); if (p > maxPeak) maxPeak = p; }
  if (maxPeak < 1e-7) return bufs; // genuinely silent input — leave as-is
  const g = target / maxPeak;
  if (Math.abs(g - 1) < 1e-3) return bufs;
  for (const b of bufs) { for (let i = 0; i < b.length; i++) b[i] *= g; }
  return bufs;
}

// ─── Public API ───────────────────────────────────────────────────────────

export async function decodeAudioFile(fileOrBuffer, audioCtx) {
  const ctx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
  let ab;
  if (fileOrBuffer instanceof ArrayBuffer)    ab = fileOrBuffer;
  else if (fileOrBuffer instanceof Blob)       ab = await fileOrBuffer.arrayBuffer();
  else throw new Error('Need a File, Blob, or ArrayBuffer');
  return ctx.decodeAudioData(ab.slice(0));
}

export async function separateStems(audioBuffer, onProgress) {
  const sampleRate = audioBuffer.sampleRate;
  const n          = audioBuffer.length;
  const report     = (p, label) => onProgress?.(p, label);

  // Build Mid and Side channels
  report(0.03, 'Computing mid/side channels…');
  const ch = audioBuffer.numberOfChannels;
  const L  = audioBuffer.getChannelData(0);
  const R  = ch > 1 ? audioBuffer.getChannelData(1) : L;
  const mid  = new Float32Array(n);
  const side = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    mid[i]  = 0.5 * (L[i] + R[i]);
    side[i] = 0.5 * (L[i] - R[i]);
  }
  await yieldFrame();

  report(0.08, 'Computing STFT (mid)…');
  const win = makeHannWindow(FFT_N);
  const { mag: midMag, phase: midPhase, frames } = stft(mid, win);
  await yieldFrame();

  report(0.18, 'Computing STFT (side)…');
  const { mag: sideMag } = stft(side, win);
  await yieldFrame();

  // HPSS on the mid channel — separates harmonic vs percussive content
  report(0.28, 'Harmonic-percussive separation (HPSS)…');
  const { maskH: hMask, maskP: pMask } = hpss(midMag, frames, 17, 13);
  await yieldFrame();

  // Drums = percussive mask applied to mid (low-mid freq emphasis)
  report(0.40, 'Extracting drums via HPSS…');
  const drumMag = applyMask(midMag, pMask);
  // Boost drum transients: scale by percussive mask squared for punch
  for (let f = 0; f < frames; f++) {
    for (let k = 0; k < BINS; k++) drumMag[f][k] *= (1 + pMask[f][k]);
  }
  const drumsSignal = istft(drumMag, midPhase, n);
  await yieldFrame();

  // Harmonic content = hMask on mid
  report(0.52, 'Building harmonic content…');
  const harmMag = applyMask(midMag, hMask);
  await yieldFrame();

  // Spectral masks: vocals, bass, guitar, keys, other from harmonic content
  report(0.60, 'Building frequency-domain soft masks…');
  const { wVocal, wBass, wGuitar, wKeys, wOther } = buildSpectralMasks(
    harmMag, sideMag, sampleRate, frames
  );
  await yieldFrame();

  // Apply masks to harmonic+mid magnitude
  report(0.68, 'Extracting vocals (center channel + freq band)…');
  const vocalMag = harmMag.map((row, f) => {
    const out = new Float32Array(BINS);
    for (let k = 0; k < BINS; k++) out[k] = row[k] * wVocal[f][k];
    return out;
  });
  const vocalsSignal = istft(vocalMag, midPhase, n);
  await yieldFrame();

  report(0.74, 'Extracting bass…');
  const bassMag = midMag.map((row, f) => {
    const out = new Float32Array(BINS);
    for (let k = 0; k < BINS; k++) out[k] = row[k] * wBass[f][k];
    return out;
  });
  const bassSignal = istft(bassMag, midPhase, n);
  await yieldFrame();

  report(0.79, 'Extracting guitar (stereo side + mid blend)…');
  const guitarMag = sideMag.map((row, f) => {
    const mRow = harmMag[f];
    const out  = new Float32Array(BINS);
    for (let k = 0; k < BINS; k++) {
      out[k] = (row[k] * 0.65 + mRow[k] * wGuitar[f][k] * 0.5);
    }
    return out;
  });
  const guitarSignal = istft(guitarMag, midPhase, n);
  await yieldFrame();

  report(0.84, 'Extracting keys / pads…');
  const keysMag = sideMag.map((row, f) => {
    const mRow = harmMag[f];
    const out  = new Float32Array(BINS);
    for (let k = 0; k < BINS; k++) {
      out[k] = (row[k] * 0.45 + mRow[k] * wKeys[f][k] * 0.55);
    }
    return out;
  });
  const keysSignal = istft(keysMag, midPhase, n);
  await yieldFrame();

  report(0.89, 'Building residual (other)…');
  const otherMag = harmMag.map((row, f) => {
    const out = new Float32Array(BINS);
    for (let k = 0; k < BINS; k++) out[k] = row[k] * wOther[f][k];
    return out;
  });
  const otherSignal = istft(otherMag, midPhase, n);
  await yieldFrame();

  report(0.95, 'Packaging stems…');
  // One shared gain across all stems so they come out audible while keeping
  // their relative balance (see normalizeAll).
  normalizeAll([vocalsSignal, drumsSignal, bassSignal, guitarSignal, keysSignal, otherSignal]);

  const makeMonoBuf = (data) => {
    const ctx = new OfflineAudioContext(1, data.length, sampleRate);
    const buf = ctx.createBuffer(1, data.length, sampleRate);
    buf.copyToChannel(data, 0);
    return buf;
  };

  const stems = {
    vocals:  makeMonoBuf(vocalsSignal),
    drums:   makeMonoBuf(drumsSignal),
    bass:    makeMonoBuf(bassSignal),
    guitar:  makeMonoBuf(guitarSignal),
    keys:    makeMonoBuf(keysSignal),
    other:   makeMonoBuf(otherSignal),
  };

  report(1, 'Done');
  return { stems, sampleRate, duration: n / sampleRate };
}

function yieldFrame() {
  return new Promise((r) => setTimeout(r, 0));
}

export function stemToWavBlob(audioBuffer) {
  return audioBufferToWav(audioBuffer);
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function playBuffer(audioBuffer, audioCtx, { gain = 1, loop = false } = {}) {
  const ctx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  const src = ctx.createBufferSource();
  src.buffer = audioBuffer;
  src.loop = loop;
  const g = ctx.createGain();
  g.gain.value = gain;
  src.connect(g);
  g.connect(ctx.destination);
  src.start(0);
  return {
    stop: () => { try { src.stop(); } catch { /* already stopped */ } },
    source: src,
    gainNode: g,
    ctx,
  };
}
