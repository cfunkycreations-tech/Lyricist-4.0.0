// Shared Web Audio graph — Lyricist 4.1.3
//
// One AudioContext for the whole app. Everything that makes sound (the
// persistent Suno player, the offline MIDI sequencer synth) routes through a
// single master GainNode. The Butterchurn visualizer taps that same node, so
// whatever is audible is what gets visualized — no per-feature plumbing.
//
//   [<audio> element] ─┐
//                      ├─► masterBus (GainNode) ─► ctx.destination
//   [sequencer synth] ─┘         │
//                                └─► (Butterchurn connectAudio)

let ctx = null;
let masterBus = null;
const elementSources = new WeakMap(); // HTMLMediaElement → MediaElementAudioSourceNode

export function getAudioContext() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC({ latencyHint: 'interactive' });
  }
  return ctx;
}

export function getMasterBus() {
  const c = getAudioContext();
  if (!masterBus) {
    masterBus = c.createGain();
    masterBus.gain.value = 1;
    masterBus.connect(c.destination);
  }
  return masterBus;
}

// Browsers suspend AudioContexts created before a user gesture; call this
// from any click handler that starts playback.
export async function resumeAudio() {
  const c = getAudioContext();
  if (c.state === 'suspended') {
    try { await c.resume(); } catch { /* ignored — will retry on next gesture */ }
  }
  return c;
}

// An HTMLMediaElement may only ever be wrapped in ONE MediaElementSourceNode,
// so cache per element. Remote (CORS-less) streams that taint the element are
// left un-wrapped: the element plays through its own output instead, and we
// simply lose visualizer reactivity for that one track rather than the audio.
export function connectMediaElement(el) {
  const c = getAudioContext();
  if (elementSources.has(el)) return elementSources.get(el);
  try {
    const src = c.createMediaElementSource(el);
    src.connect(getMasterBus());
    elementSources.set(el, src);
    return src;
  } catch {
    return null;
  }
}

// Decode any uploaded/recorded audio blob into an AudioBuffer.
export async function decodeBlob(blob) {
  const c = getAudioContext();
  const arrayBuffer = await blob.arrayBuffer();
  return c.decodeAudioData(arrayBuffer);
}

// Resample an AudioBuffer to mono at a target rate (basic-pitch wants 22050).
export async function resampleToMono(audioBuffer, targetRate = 22050) {
  const OfflineAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const length = Math.ceil(audioBuffer.duration * targetRate);
  const offline = new OfflineAC(1, length, targetRate);
  const src = offline.createBufferSource();
  src.buffer = audioBuffer;
  src.connect(offline.destination);
  src.start(0);
  return offline.startRendering();
}
