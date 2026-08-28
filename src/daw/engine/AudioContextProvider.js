/**
 * @file AudioContextProvider.js
 * @description The one AudioContext for the whole DAW.
 *
 * WHY THIS EXISTS
 *
 * Eleven modules used to each call `new AudioContext()` at import time. Two
 * things go wrong with that, and together they are why so much of the audio
 * "didn't work":
 *
 * 1. Browsers cap how many AudioContexts a page may hold — Chromium allows
 *    about six. Past that the constructor throws, so whichever engines happened
 *    to load last got no audio at all, silently.
 * 2. Even the ones that succeeded were islands. A context created at module
 *    scope starts `suspended` under the autoplay policy and only a user gesture
 *    resumes it — and each had its own `destination`, so the MIDI synth, the
 *    sampler, the looper and the metronome all bypassed the master bus. No
 *    master volume, no effects, no metering, nothing in the export.
 *
 * Everything now shares one context and connects to one master input, so the
 * mixer, the effect rack, the meters and the export all see the same signal.
 */

/** @type {AudioContext | null} */
let ctx = null;

/** @type {GainNode | null} */
let masterInput = null;

/**
 * The shared AudioContext, created on first use.
 *
 * Safe to call from module scope: constructing a context is allowed anywhere,
 * it simply starts suspended. Call {@link resumeAudio} from a click or keypress
 * to actually start it.
 *
 * @returns {AudioContext}
 */
export function getAudioContext() {
  if (!ctx) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    ctx = new Ctor();
  }
  return ctx;
}

/**
 * The node every engine should connect to instead of `context.destination`.
 *
 * AudioGraph replaces this with its real master chain (gain → limiter →
 * meters → speakers) as soon as it initialises. Until then it is a plain gain
 * wired straight to the speakers, so an engine that makes noise before the
 * transport is touched is still audible rather than silently dropped.
 *
 * @returns {GainNode}
 */
export function getMasterInput() {
  if (!masterInput) {
    const c = getAudioContext();
    masterInput = c.createGain();
    masterInput.connect(c.destination);
  }
  return masterInput;
}

/**
 * Hands the master input over to AudioGraph's real master chain.
 *
 * The provisional direct-to-speakers connection is torn down and replaced, so
 * audio does not arrive at the output twice.
 *
 * @param {AudioNode} node - The head of AudioGraph's master chain.
 */
export function attachMasterChain(node) {
  const c = getAudioContext();
  const input = getMasterInput();
  try {
    input.disconnect();
  } catch {
    // Already disconnected; nothing to undo.
  }
  input.connect(node || c.destination);
}

/**
 * Resumes the shared context. Must be called from a user gesture.
 * @returns {Promise<void>}
 */
export async function resumeAudio() {
  const c = getAudioContext();
  if (c.state === 'suspended') {
    try {
      await c.resume();
    } catch {
      // Chrome rejects this when it is not called from a gesture. The next
      // click will try again, so a failure here is not worth surfacing.
    }
  }
}

/** @returns {'suspended'|'running'|'closed'} Current context state. */
export function audioState() {
  return getAudioContext().state;
}
