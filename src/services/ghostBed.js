/**
 * THE MUSIC UNDER THE GHOST DEMO.
 *
 * The beds are prepared as seamless loops by scripts/prepare-ghost-bed.py:
 * the intro plays once, then [loopStart, loopEnd] repeats with the crossfade
 * baked into the file. Web Audio loops a buffer to the sample; an <audio>
 * element with `loop` leaves a gap at every pass.
 *
 * Every mp3 in src/assets/ghost-bg/ with an entry in beds.json is picked up on
 * the next build. New tracks need the script run on them, nothing else.
 */
import { getBuffer } from './loadBuffer.js';
import LOOPS from '../assets/ghost-bg/beds.json';

const URLS = import.meta.glob('../assets/ghost-bg/*.mp3', {
  eager: true, query: '?url', import: 'default',
});

export const BEDS = Object.entries(LOOPS)
  .map(([name, b]) => ({ name, url: URLS[`../assets/ghost-bg/${b.file}`], loopStart: b.loopStart, loopEnd: b.loopEnd }))
  .filter((b) => b.url);

// Chris: any bed on any tab is fine. Black Hole Studios gets its own track;
// every other tab keeps the same bed from run to run.
const BED_FOR_TAB = { onemanband: 'blackhole' };

export function bedFor(tabId) {
  const named = BEDS.find((b) => b.name === BED_FOR_TAB[tabId]);
  if (named) return named;
  let h = 0;
  for (const ch of String(tabId || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return BEDS.length ? BEDS[h % BEDS.length] : null;
}

// The decoded bed is ~40 MB for the long one. Keep the last one only, so a
// second Play Demo on the same tab starts at once.
let cached = { url: null, buffer: null };

async function decode(url, ctx) {
  if (cached.url === url) return cached.buffer;
  const buffer = await ctx.decodeAudioData(await getBuffer(url));
  cached = { url, buffer };
  return buffer;
}

/**
 * Start a bed. Returns a handle at once; the audio joins when it has decoded.
 * level() ramps, pause() holds the music where it is, stop() fades and frees
 * the audio device. Safe to stop before it ever started.
 */
export function playBed(bed, { level = 0.35, fadeIn = 2 } = {}) {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!bed || !AC) return { level() {}, pause() {}, resume() {}, stop() {} };
  const ctx = new AC();
  const gain = ctx.createGain();
  gain.gain.value = 0;
  gain.connect(ctx.destination);
  let src = null;
  let dead = false;
  let paused = false;
  let target = level;

  const ramp = (to, seconds) => {
    const t = ctx.currentTime;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(gain.gain.value, t);
    gain.gain.setTargetAtTime(to, t, Math.max(0.01, seconds / 3));
  };

  decode(bed.url, ctx).then((buffer) => {
    if (dead) return;
    src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.loopStart = bed.loopStart;
    src.loopEnd = bed.loopEnd;
    src.connect(gain);
    src.start();
    if (paused) ctx.suspend().catch(() => {});
    else ctx.resume().catch(() => {});
    ramp(target, fadeIn);
  }).catch((e) => console.warn('[GhostDemo] background music did not load', e));

  return {
    level(to, seconds = 0.4) {
      target = to;
      if (src && !dead) ramp(to, seconds);
    },
    pause() {
      paused = true;
      if (!dead) ctx.suspend().catch(() => {});
    },
    resume() {
      paused = false;
      if (!dead) ctx.resume().catch(() => {});
    },
    stop(fadeOut = 1.2) {
      if (dead) return;
      dead = true;
      if (!src || ctx.state !== 'running') { ctx.close().catch(() => {}); return; }
      ramp(0, fadeOut);
      setTimeout(() => ctx.close().catch(() => {}), fadeOut * 1000 + 150);
    },
  };
}
