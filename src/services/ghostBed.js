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
import PROMO from '../assets/ghost-bg/promo/promo.json';

const URLS = import.meta.glob('../assets/ghost-bg/*.mp3', {
  eager: true, query: '?url', import: 'default',
});

export const BEDS = Object.entries(LOOPS)
  .map(([name, b]) => ({ name, url: URLS[`../assets/ghost-bg/${b.file}`], loopStart: b.loopStart, loopEnd: b.loopEnd }))
  .filter((b) => b.url);

/**
 * THE PHONE GHOST'S MUSIC: Chris's own songs, in his order (2026-10-25: "Use the
 * first one that I sent first, and then the second one"), under the promo runs
 * and every phone walkthrough. Each plays through once and the next follows;
 * after the last it starts over at the first, so a long run never goes quiet.
 * Whole songs, not loops: a seamless-loop cut of Curuspulse kept only 29 s of
 * it. Each file is leveled to -20 LUFS like the beds, with a fade at both ends.
 * Kept out of beds.json, which the desktop Ghost still plays.
 */
const PROMO_URLS = import.meta.glob('../assets/ghost-bg/promo/*.mp3', {
  eager: true, query: '?url', import: 'default',
});
export const PROMO_BEDS = PROMO
  .map((b) => ({ ...b, url: PROMO_URLS[`../assets/ghost-bg/promo/${b.file}`] }))
  .filter((b) => b.url);

// Chris: any bed on any tab is fine. Black Hole Studios gets its own track;
// every other tab keeps the same bed from run to run.
const BED_FOR_TAB = { blackhole: 'blackhole' };

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
/**
 * An audio context made and woken inside a tap, for the next playBed to use.
 * iPhone keeps a context made any later than the tap itself silent; see
 * primeGhostAudio in GhostDemo.jsx, the only caller.
 */
let primed = null;
export function primeBed() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC || primed) return;
  try {
    primed = new AC();
    primed.resume().catch(() => {});
  } catch { primed = null; }
}

/** Close a primed context nothing used (the music was off, or no bed loaded). */
export function dropPrimedBed() {
  if (primed) primed.close().catch(() => {});
  primed = null;
}

export function playBed(bedOrList, { level = 0.35, fadeIn = 2 } = {}) {
  const AC = window.AudioContext || window.webkitAudioContext;
  // One bed (looped on its loop points), or a playlist played in order and
  // round again (PROMO_BEDS).
  const list = (Array.isArray(bedOrList) ? bedOrList : [bedOrList]).filter(Boolean);
  if (!list.length || !AC) return { level() {}, pause() {}, resume() {}, stop() {} };
  const ctx = primed || new AC();
  primed = null;
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

  // Song i, from a buffer already decoded or about to be. In a playlist each
  // song plays once and the next one is decoded 20 s before it ends, so the
  // change-over has no gap (decoding a whole song takes a moment on a phone).
  // A paused run holds the context, so the timer only ever decodes early.
  let nextBuffer = null;
  const play = (i, bufferPromise) => bufferPromise.then((buffer) => {
    if (dead) return;
    const bed = list[i];
    const s = ctx.createBufferSource();
    s.buffer = buffer;
    if (list.length === 1) {
      s.loop = true;
      s.loopStart = bed.loopStart;
      s.loopEnd = bed.loopEnd;
    } else {
      const next = (i + 1) % list.length;
      setTimeout(() => { if (!dead) nextBuffer = decode(list[next].url, ctx); }, Math.max(0, buffer.duration - 20) * 1000);
      s.onended = () => {
        if (dead || src !== s) return;
        play(next, nextBuffer || decode(list[next].url, ctx));
        nextBuffer = null;
      };
    }
    s.connect(gain);
    s.start();
    src = s;
    if (i === 0) {
      if (paused) ctx.suspend().catch(() => {});
      else ctx.resume().catch(() => {});
      ramp(target, fadeIn);
    }
  }).catch((e) => console.warn('[GhostDemo] background music did not load', e));
  play(0, decode(list[0].url, ctx));

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
