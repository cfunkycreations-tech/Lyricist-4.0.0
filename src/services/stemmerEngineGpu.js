/**
 * Stemmer engine — GPU path.
 *
 * Runs the SAME STFT + HPSS + spectral-mask separation as stemmerEngine.js,
 * but the heavy math (forward transform, median filtering, masking, inverse
 * transform, overlap-add) executes on the user's graphics card via the
 * browser's GPU compute API instead of the CPU. On a real GPU this is many
 * times faster than the JS/CPU path.
 *
 * It is numerically matched to the CPU engine: same window, same FFT size and
 * hop, same masks, same normalization — so a GPU run and a CPU run of the same
 * mix produce the same stems. (Verified by comparing outputs on a test signal.)
 *
 * If the machine has no usable GPU, or the GPU runs out of memory on a long
 * mix, the caller falls back to the CPU engine and tells the user.
 */

const FFT_N = 2048;
const HOP   = 512;
const BINS  = FFT_N / 2 + 1; // 1025

// median kernels — must match the CPU engine (hpss 17 / 13)
const HARM_K = 17;
const PERC_K = 13;

let _device = null;
let _adapterInfo = null;

export async function gpuAvailable() {
  if (!navigator.gpu) return false;
  try {
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) return false;
    _adapterInfo = adapter.info || null;
    return true;
  } catch {
    return false;
  }
}

export function gpuName() {
  if (!_adapterInfo) return '';
  const v = _adapterInfo.vendor || '';
  const d = _adapterInfo.description || _adapterInfo.architecture || '';
  return [v, d].filter(Boolean).join(' ').trim();
}

async function getDevice() {
  if (_device) return _device;
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) throw new Error('No GPU adapter available.');
  _adapterInfo = adapter.info || _adapterInfo;
  const device = await adapter.requestDevice();
  device.lost.then(() => { _device = null; });
  _device = device;
  return device;
}

// ─── WGSL ──────────────────────────────────────────────────────────────────
// Shared params block. `stride` is the x-extent of the workgroup grid so a
// linear index can span a 2D dispatch (needed because a mix has millions of
// (frame,bin) elements, past the 65535 workgroups-per-dimension limit).
const PARAMS = /* wgsl */`
struct Params {
  n: u32,
  frames: u32,
  stride: u32,
  _pad: u32,
  sr: f32,
  _a: f32,
  _b: f32,
  _c: f32,
};
`;

const CONSTS = /* wgsl */`
const FFT_N: u32 = ${FFT_N}u;
const HOP: u32 = ${HOP}u;
const BINS: u32 = ${BINS}u;
const PI: f32 = 3.141592653589793;
`;

// Forward STFT producing magnitude + phase (used for the mid channel).
const WGSL_FORWARD_FULL = PARAMS + CONSTS + /* wgsl */`
@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read> sig: array<f32>;
@group(0) @binding(2) var<storage, read> cosT: array<f32>;
@group(0) @binding(3) var<storage, read> sinT: array<f32>;
@group(0) @binding(4) var<storage, read_write> magOut: array<f32>;
@group(0) @binding(5) var<storage, read_write> phaseOut: array<f32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.y * P.stride + gid.x;
  let total = P.frames * BINS;
  if (idx >= total) { return; }
  let f = idx / BINS;
  let k = idx % BINS;
  let start = f * HOP;
  var re = 0.0;
  var im = 0.0;
  for (var nn: u32 = 0u; nn < FFT_N; nn = nn + 1u) {
    let si = start + nn;
    if (si < P.n) {
      let w = 0.5 * (1.0 - cos(2.0 * PI * f32(nn) / f32(FFT_N - 1u)));
      let s = sig[si] * w;
      let m = (k * nn) % FFT_N;
      re = re + s * cosT[m];
      im = im - s * sinT[m];
    }
  }
  magOut[idx] = sqrt(re * re + im * im);
  phaseOut[idx] = atan2(im, re);
}
`;

// Forward STFT producing magnitude only (used for the side channel).
const WGSL_FORWARD_MAG = PARAMS + CONSTS + /* wgsl */`
@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read> sig: array<f32>;
@group(0) @binding(2) var<storage, read> cosT: array<f32>;
@group(0) @binding(3) var<storage, read> sinT: array<f32>;
@group(0) @binding(4) var<storage, read_write> magOut: array<f32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.y * P.stride + gid.x;
  let total = P.frames * BINS;
  if (idx >= total) { return; }
  let f = idx / BINS;
  let k = idx % BINS;
  let start = f * HOP;
  var re = 0.0;
  var im = 0.0;
  for (var nn: u32 = 0u; nn < FFT_N; nn = nn + 1u) {
    let si = start + nn;
    if (si < P.n) {
      let w = 0.5 * (1.0 - cos(2.0 * PI * f32(nn) / f32(FFT_N - 1u)));
      let s = sig[si] * w;
      let m = (k * nn) % FFT_N;
      re = re + s * cosT[m];
      im = im - s * sinT[m];
    }
  }
  magOut[idx] = sqrt(re * re + im * im);
}
`;

// Median along TIME axis (harmonic estimate), kernel HARM_K.
const WGSL_MEDIAN_TIME = PARAMS + CONSTS + /* wgsl */`
const K: u32 = ${HARM_K}u;
const HALF: i32 = ${HARM_K >> 1};
@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read> magIn: array<f32>;
@group(0) @binding(2) var<storage, read_write> outBuf: array<f32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.y * P.stride + gid.x;
  let total = P.frames * BINS;
  if (idx >= total) { return; }
  let f = i32(idx / BINS);
  let k = idx % BINS;
  var buf: array<f32, ${HARM_K}>;
  for (var d: i32 = -HALF; d <= HALF; d = d + 1) {
    let ff = f + d;
    var v = 0.0;
    if (ff >= 0 && ff < i32(P.frames)) { v = magIn[u32(ff) * BINS + k]; }
    buf[d + HALF] = v;
  }
  // insertion sort
  for (var i: u32 = 1u; i < K; i = i + 1u) {
    let key = buf[i];
    var j: i32 = i32(i) - 1;
    loop {
      if (j < 0 || buf[j] <= key) { break; }
      buf[j + 1] = buf[j];
      j = j - 1;
    }
    buf[j + 1] = key;
  }
  outBuf[idx] = buf[K / 2u];
}
`;

// Median along FREQUENCY axis (percussive estimate), kernel PERC_K.
const WGSL_MEDIAN_FREQ = PARAMS + CONSTS + /* wgsl */`
const K: u32 = ${PERC_K}u;
const HALF: i32 = ${PERC_K >> 1};
@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read> magIn: array<f32>;
@group(0) @binding(2) var<storage, read_write> outBuf: array<f32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.y * P.stride + gid.x;
  let total = P.frames * BINS;
  if (idx >= total) { return; }
  let f = idx / BINS;
  let k = i32(idx % BINS);
  var buf: array<f32, ${PERC_K}>;
  for (var d: i32 = -HALF; d <= HALF; d = d + 1) {
    let kk = k + d;
    var v = 0.0;
    if (kk >= 0 && kk < i32(BINS)) { v = magIn[f * BINS + u32(kk)]; }
    buf[d + HALF] = v;
  }
  for (var i: u32 = 1u; i < K; i = i + 1u) {
    let key = buf[i];
    var j: i32 = i32(i) - 1;
    loop {
      if (j < 0 || buf[j] <= key) { break; }
      buf[j + 1] = buf[j];
      j = j - 1;
    }
    buf[j + 1] = key;
  }
  outBuf[idx] = buf[K / 2u];
}
`;

// Wiener soft masks → harmonic magnitude + drum (percussive) magnitude.
const WGSL_WIENER = PARAMS + CONSTS + /* wgsl */`
@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read> midMag: array<f32>;
@group(0) @binding(2) var<storage, read> Hb: array<f32>;
@group(0) @binding(3) var<storage, read> Pb: array<f32>;
@group(0) @binding(4) var<storage, read_write> harmOut: array<f32>;
@group(0) @binding(5) var<storage, read_write> drumOut: array<f32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.y * P.stride + gid.x;
  let total = P.frames * BINS;
  if (idx >= total) { return; }
  let h = Hb[idx];
  let p = Pb[idx];
  let hp = h * h;
  let pp = p * p;
  let denom = hp + pp + 1e-8;
  let mh = hp / denom;
  let mp = pp / denom;
  let mid = midMag[idx];
  harmOut[idx] = mid * mh;
  drumOut[idx] = mid * mp * (1.0 + mp);
}
`;

// Frequency-band + stereo spatial masks → 5 harmonic stems.
const WGSL_SPECTRAL = PARAMS + CONSTS + /* wgsl */`
@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read> harmMag: array<f32>;
@group(0) @binding(2) var<storage, read> sideMag: array<f32>;
@group(0) @binding(3) var<storage, read> midMag: array<f32>;
@group(0) @binding(4) var<storage, read_write> vocalOut: array<f32>;
@group(0) @binding(5) var<storage, read_write> bassOut: array<f32>;
@group(0) @binding(6) var<storage, read_write> guitarOut: array<f32>;
@group(0) @binding(7) var<storage, read_write> keysOut: array<f32>;
@group(0) @binding(8) var<storage, read_write> otherOut: array<f32>;

fn smoothStep(e0: f32, e1: f32, x: f32) -> f32 {
  let t = clamp((x - e0) / (e1 - e0), 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.y * P.stride + gid.x;
  let total = P.frames * BINS;
  if (idx >= total) { return; }
  let k = idx % BINS;
  let binHz = P.sr / f32(FFT_N);
  let hz = f32(k) * binHz;

  let m = harmMag[idx];
  let s = sideMag[idx];
  let tot = m + s + 1e-10;
  let centerRatio = m / tot;
  let sideRatio = s / tot;

  let bassW = smoothStep(0.0, 250.0, hz) * (1.0 - smoothStep(250.0, 380.0, hz)) * (0.5 + 0.5 * centerRatio);
  let vocalFreq = smoothStep(150.0, 250.0, hz) * (1.0 - smoothStep(4000.0, 5500.0, hz));
  let vocalW = vocalFreq * pow(centerRatio, 1.8);
  let guitarFreq = smoothStep(200.0, 400.0, hz) * (1.0 - smoothStep(4500.0, 6000.0, hz));
  let guitarW = guitarFreq * (0.3 + 0.7 * sideRatio);
  let keysFreq = smoothStep(300.0, 600.0, hz) * (1.0 - smoothStep(7000.0, 9000.0, hz));
  let keysW = keysFreq * (0.4 + 0.6 * sideRatio);
  let otherW = smoothStep(4000.0, 6000.0, hz) * 0.6 + 0.15;

  let sum = bassW + vocalW + guitarW + keysW + otherW + 1e-10;
  let wBass = bassW / sum;
  let wVocal = vocalW / sum;
  let wGuitar = guitarW / sum;
  let wKeys = keysW / sum;
  let wOther = otherW / sum;

  let mid = midMag[idx];
  vocalOut[idx] = m * wVocal;
  bassOut[idx] = mid * wBass;
  guitarOut[idx] = s * 0.65 + m * wGuitar * 0.5;
  keysOut[idx] = s * 0.45 + m * wKeys * 0.55;
  otherOut[idx] = m * wOther;
}
`;

// Polar (mag, phase) → rectangular (re, im). Done once per stem so the inverse
// transform below never re-evaluates cos/sin of the phase.
const WGSL_POLAR = PARAMS + CONSTS + /* wgsl */`
@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read> magIn: array<f32>;
@group(0) @binding(2) var<storage, read> phaseIn: array<f32>;
@group(0) @binding(3) var<storage, read_write> reOut: array<f32>;
@group(0) @binding(4) var<storage, read_write> imOut: array<f32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.y * P.stride + gid.x;
  let total = P.frames * BINS;
  if (idx >= total) { return; }
  let m = magIn[idx];
  let p = phaseIn[idx];
  reOut[idx] = m * cos(p);
  imOut[idx] = m * sin(p);
}
`;

// Inverse transform per (frame, sample) using hermitian symmetry.
const WGSL_INVERSE = PARAMS + CONSTS + /* wgsl */`
@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read> reIn: array<f32>;
@group(0) @binding(2) var<storage, read> imIn: array<f32>;
@group(0) @binding(3) var<storage, read> cosT: array<f32>;
@group(0) @binding(4) var<storage, read> sinT: array<f32>;
@group(0) @binding(5) var<storage, read_write> rawOut: array<f32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.y * P.stride + gid.x;
  let total = P.frames * FFT_N;
  if (idx >= total) { return; }
  let f = idx / FFT_N;
  let nn = idx % FFT_N;
  let base = f * BINS;
  var sum = 0.0;
  for (var k: u32 = 0u; k < BINS; k = k + 1u) {
    let m = (k * nn) % FFT_N;
    let term = reIn[base + k] * cosT[m] - imIn[base + k] * sinT[m];
    var w = 2.0;
    if (k == 0u || k == BINS - 1u) { w = 1.0; }
    sum = sum + w * term;
  }
  rawOut[idx] = sum / f32(FFT_N);
}
`;

// Overlap-add + window normalization → final time-domain stem.
const WGSL_OLA = PARAMS + CONSTS + /* wgsl */`
@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read> rawIn: array<f32>;
@group(0) @binding(2) var<storage, read> winT: array<f32>;
@group(0) @binding(3) var<storage, read_write> outSig: array<f32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.y * P.stride + gid.x;
  if (i >= P.n) { return; }
  // frames f with f*HOP <= i <= f*HOP + FFT_N - 1
  var fHi = i / HOP;
  if (fHi > P.frames - 1u) { fHi = P.frames - 1u; }
  var fLo: u32 = 0u;
  if (i + 1u > FFT_N) {
    fLo = (i + 1u - FFT_N + HOP - 1u) / HOP; // ceil
  }
  var acc = 0.0;
  var wsum = 0.0;
  var f = fLo;
  loop {
    if (f > fHi) { break; }
    let nn = i - f * HOP;
    let w = winT[nn];
    acc = acc + rawIn[f * FFT_N + nn] * w;
    wsum = wsum + w * w;
    f = f + 1u;
  }
  if (wsum > 1e-10) { outSig[i] = acc / wsum; } else { outSig[i] = 0.0; }
}
`;

// ─── GPU plumbing ────────────────────────────────────────────────────────────

function makeParams(device, n, frames, stride, sr) {
  const buf = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const ab = new ArrayBuffer(32);
  new Uint32Array(ab, 0, 4).set([n, frames, stride, 0]);
  new Float32Array(ab, 16, 4).set([sr, 0, 0, 0]);
  device.queue.writeBuffer(buf, 0, ab);
  return buf;
}

function storageBuf(device, floatCountOrData, extraUsage = 0) {
  let size, data = null;
  if (typeof floatCountOrData === 'number') size = floatCountOrData * 4;
  else { data = floatCountOrData; size = data.byteLength; }
  const buf = device.createBuffer({
    size: Math.max(4, size),
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST | extraUsage,
  });
  if (data) device.queue.writeBuffer(buf, 0, data);
  return buf;
}

// Dispatch a single compute pass over `total` linear elements.
function dispatch(device, pipeline, buffers, total, n, frames, sr) {
  const groups = Math.ceil(total / 64);
  const gx = Math.min(groups, 65535);
  const gy = Math.ceil(groups / gx);
  const stride = gx * 64;
  const params = makeParams(device, n, frames, stride, sr);
  const entries = [{ binding: 0, resource: { buffer: params } }];
  buffers.forEach((b, i) => entries.push({ binding: i + 1, resource: { buffer: b } }));
  const bind = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries });
  const enc = device.createCommandEncoder();
  const pass = enc.beginComputePass();
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bind);
  pass.dispatchWorkgroups(gx, gy);
  pass.end();
  device.queue.submit([enc.finish()]);
  params.destroy?.();
}

async function readFloats(device, buf, floatCount) {
  const bytes = floatCount * 4;
  const staging = device.createBuffer({ size: bytes, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  const enc = device.createCommandEncoder();
  enc.copyBufferToBuffer(buf, 0, staging, 0, bytes);
  device.queue.submit([enc.finish()]);
  await staging.mapAsync(GPUMapMode.READ);
  const out = new Float32Array(floatCount);
  out.set(new Float32Array(staging.getMappedRange(), 0, floatCount));
  staging.unmap();
  staging.destroy();
  return out;
}

function normalize(buf, target = 0.92) {
  let peak = 0;
  for (let i = 0; i < buf.length; i++) { const a = Math.abs(buf[i]); if (a > peak) peak = a; }
  if (peak < 1e-8 || peak <= target) return buf;
  const g = target / peak;
  for (let i = 0; i < buf.length; i++) buf[i] *= g;
  return buf;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function separateStemsGPU(audioBuffer, onProgress) {
  const device = await getDevice();
  const report = (p, label) => onProgress?.(p, label);
  const sr = audioBuffer.sampleRate;
  const n = audioBuffer.length;
  const frames = Math.max(1, Math.floor((n - FFT_N) / HOP) + 1);
  const FB = frames * BINS;

  report(0.03, 'Computing mid/side channels…');
  const ch = audioBuffer.numberOfChannels;
  const L = audioBuffer.getChannelData(0);
  const R = ch > 1 ? audioBuffer.getChannelData(1) : L;
  const mid = new Float32Array(n);
  const side = new Float32Array(n);
  for (let i = 0; i < n; i++) { mid[i] = 0.5 * (L[i] + R[i]); side[i] = 0.5 * (L[i] - R[i]); }

  // twiddle + window tables
  const cosT = new Float32Array(FFT_N);
  const sinT = new Float32Array(FFT_N);
  for (let m = 0; m < FFT_N; m++) {
    cosT[m] = Math.cos(2 * Math.PI * m / FFT_N);
    sinT[m] = Math.sin(2 * Math.PI * m / FFT_N);
  }
  const winT = new Float32Array(FFT_N);
  for (let i = 0; i < FFT_N; i++) winT[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (FFT_N - 1)));

  const mk = (src, ep) => device.createComputePipeline({ layout: 'auto', compute: { module: device.createShaderModule({ code: src }), entryPoint: ep } });

  const pForwardFull = mk(WGSL_FORWARD_FULL, 'main');
  const pForwardMag  = mk(WGSL_FORWARD_MAG, 'main');
  const pMedTime     = mk(WGSL_MEDIAN_TIME, 'main');
  const pMedFreq     = mk(WGSL_MEDIAN_FREQ, 'main');
  const pWiener      = mk(WGSL_WIENER, 'main');
  const pSpectral    = mk(WGSL_SPECTRAL, 'main');
  const pPolar       = mk(WGSL_POLAR, 'main');
  const pInverse     = mk(WGSL_INVERSE, 'main');
  const pOla         = mk(WGSL_OLA, 'main');

  const cosBuf = storageBuf(device, cosT);
  const sinBuf = storageBuf(device, sinT);
  const winBuf = storageBuf(device, winT);
  const midBuf = storageBuf(device, mid);
  const sideBuf = storageBuf(device, side);

  const magMid   = storageBuf(device, FB);
  const phaseMid = storageBuf(device, FB);
  const magSide  = storageBuf(device, FB);
  const Hbuf = storageBuf(device, FB);
  const Pbuf = storageBuf(device, FB);
  const harm = storageBuf(device, FB);
  const drum = storageBuf(device, FB);
  const vocal = storageBuf(device, FB);
  const bass = storageBuf(device, FB);
  const guitar = storageBuf(device, FB);
  const keys = storageBuf(device, FB);
  const other = storageBuf(device, FB);

  report(0.10, 'GPU transform (mid)…');
  dispatch(device, pForwardFull, [midBuf, cosBuf, sinBuf, magMid, phaseMid], FB, n, frames, sr);
  report(0.20, 'GPU transform (side)…');
  dispatch(device, pForwardMag, [sideBuf, cosBuf, sinBuf, magSide], FB, n, frames, sr);

  report(0.30, 'Harmonic / percussive split…');
  dispatch(device, pMedTime, [magMid, Hbuf], FB, n, frames, sr);
  dispatch(device, pMedFreq, [magMid, Pbuf], FB, n, frames, sr);
  dispatch(device, pWiener, [magMid, Hbuf, Pbuf, harm, drum], FB, n, frames, sr);

  report(0.40, 'Building stem masks…');
  dispatch(device, pSpectral, [harm, magSide, magMid, vocal, bass, guitar, keys, other], FB, n, frames, sr);

  // free what we no longer need before the memory-heavy inverse stage
  [Hbuf, Pbuf, magSide, sideBuf, midBuf].forEach((b) => b.destroy?.());

  const reBuf  = storageBuf(device, FB);
  const imBuf  = storageBuf(device, FB);
  const rawBuf = storageBuf(device, frames * FFT_N);
  const outBuf = storageBuf(device, n);

  const stemBufs = { vocals: vocal, drums: drum, bass, guitar, keys, other };
  const order = ['vocals', 'drums', 'bass', 'guitar', 'keys', 'other'];
  const result = {};
  let step = 0;
  for (const id of order) {
    report(0.5 + 0.08 * step, `Reconstructing ${id}…`);
    dispatch(device, pPolar, [stemBufs[id], phaseMid, reBuf, imBuf], FB, n, frames, sr);
    dispatch(device, pInverse, [reBuf, imBuf, cosBuf, sinBuf, rawBuf], frames * FFT_N, n, frames, sr);
    dispatch(device, pOla, [rawBuf, winBuf, outBuf], n, n, frames, sr);
    const sig = normalize(await readFloats(device, outBuf, n));
    const oac = new OfflineAudioContext(1, n, sr);
    const ab = oac.createBuffer(1, n, sr);
    ab.copyToChannel(sig, 0);
    result[id] = ab;
    step++;
  }

  // cleanup
  [cosBuf, sinBuf, winBuf, magMid, phaseMid, harm, drum, vocal, bass, guitar, keys, other, reBuf, imBuf, rawBuf, outBuf]
    .forEach((b) => b.destroy?.());

  report(1, 'Done');
  return { stems: result, sampleRate: sr, duration: n / sr };
}
