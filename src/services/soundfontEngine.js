/**
 * Sampled-instrument engine for the MIDI Studio piano roll.
 *
 * This is real SoundFont2 synthesis, not one-shot sample playback. The bank is
 * GeneralUser GS v2.0.3 by S. Christian Collins, rendered through
 * spessasynth_core (Apache-2.0). That buys the things a flat sample map cannot
 * give you, and which made every instrument sound like the same generic blip:
 *
 *   - velocity layers: a soft note is a different recording, not the loud one
 *     turned down, so dynamics change timbre the way a real instrument does,
 *   - per-instrument envelopes: a piano rings and decays, an organ stops dead,
 *     strings swell in. Previously every instrument wore one 8 ms attack and
 *     one 0.35 s release,
 *   - looped sustain, so a held string or pad holds for as long as you hold it
 *     instead of running out of sample,
 *   - the bank's own filters, LFOs and modulators, plus a level balance the
 *     bank author mixed so the instruments sit together.
 *
 * The whole bank is one 32 MB file that replaces ~100 MB of per-note oggs, and
 * it is bundled, so playback stays fully offline.
 *
 * Timing model: notes are rendered offline into AudioBuffers and cached, then
 * played through a BufferSource at an exact AudioContext timestamp. The
 * sequencer needs sample-accurate scheduling into the future, which a
 * real-time synth cannot give it, so we synthesize ahead of time and schedule
 * the result. `playNote`'s signature is unchanged.
 */

import { SpessaSynthProcessor, SoundBankLoader } from 'spessasynth_core';
import { isDaw, dawNote } from './midiOut.js';

const NOTES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const FLAT_TO_SHARP = { Db: 'C#', Eb: 'D#', Gb: 'F#', Ab: 'G#', Bb: 'A#' };

const SF2_URL = 'sf2/GeneralUser-GS.sf2';

/**
 * Chris's own bank, built from the textures he generated himself.
 *
 * It lives on MIDI bank 42 rather than bank 0. GeneralUser GS already occupies
 * banks 0 to 9, 11 to 13, 16, 24 to 26 and 120 with its variation presets, so
 * anything in that range would fight it for the same address and whichever bank
 * loaded last would win, silently. 42 is empty in GeneralUser, and it is the
 * version number, which is as good a reason as any.
 */
const SF2_CFUNKY_URL = 'sf2/CFunky-Quantum.sf2';
const CFUNKY_BANK = 42;

/**
 * General MIDI instruments, grouped for the picker. `program` is the GM program
 * number the bank is addressed by. Same ids as before, so a saved project that
 * stored an instrument id still resolves.
 */
export const INSTRUMENT_GROUPS = [
  {
    group: 'Keys',
    items: [
      { id: 'acoustic_grand_piano', name: 'Grand Piano', program: 0 },
      { id: 'bright_acoustic_piano', name: 'Bright Piano', program: 1 },
      { id: 'electric_piano_1', name: 'Electric Piano', program: 4 },
      { id: 'electric_piano_2', name: 'Rhodes', program: 5 },
      { id: 'harpsichord', name: 'Harpsichord', program: 6 },
      { id: 'celesta', name: 'Celesta', program: 8 },
    ],
  },
  {
    group: 'Guitar & Bass',
    items: [
      { id: 'acoustic_guitar_nylon', name: 'Nylon Guitar', program: 24 },
      { id: 'acoustic_guitar_steel', name: 'Steel Guitar', program: 25 },
      { id: 'electric_guitar_clean', name: 'Clean Electric', program: 27 },
      { id: 'electric_guitar_jazz', name: 'Jazz Guitar', program: 26 },
      { id: 'overdriven_guitar', name: 'Overdrive Guitar', program: 29 },
      { id: 'distortion_guitar', name: 'Distortion Guitar', program: 30 },
      { id: 'acoustic_bass', name: 'Upright Bass', program: 32 },
      { id: 'electric_bass_finger', name: 'Electric Bass', program: 33 },
    ],
  },
  {
    group: 'Strings',
    items: [
      { id: 'orchestral_harp', name: 'Harp', program: 46 },
      { id: 'violin', name: 'Violin', program: 40 },
      { id: 'viola', name: 'Viola', program: 41 },
      { id: 'cello', name: 'Cello', program: 42 },
      { id: 'contrabass', name: 'Contrabass', program: 43 },
      { id: 'string_ensemble_1', name: 'String Ensemble', program: 48 },
      { id: 'synth_strings_1', name: 'Synth Strings', program: 50 },
    ],
  },
  {
    group: 'Winds & Brass',
    items: [
      { id: 'flute', name: 'Flute', program: 73 },
      { id: 'pan_flute', name: 'Pan Flute', program: 75 },
      { id: 'clarinet', name: 'Clarinet', program: 71 },
      { id: 'alto_sax', name: 'Alto Sax', program: 65 },
      { id: 'trumpet', name: 'Trumpet', program: 56 },
      { id: 'french_horn', name: 'French Horn', program: 60 },
    ],
  },
  {
    group: 'Organs & Voices',
    items: [
      { id: 'church_organ', name: 'Church Organ', program: 19 },
      { id: 'drawbar_organ', name: 'Drawbar Organ', program: 16 },
      { id: 'choir_aahs', name: 'Choir Aahs', program: 52 },
      { id: 'voice_oohs', name: 'Voice Oohs', program: 53 },
      { id: 'pad_2_warm', name: 'Warm Pad', program: 89 },
      { id: 'lead_2_sawtooth', name: 'Saw Lead', program: 81 },
    ],
  },
  {
    group: 'Mallets & Percussion',
    items: [
      { id: 'vibraphone', name: 'Vibraphone', program: 11 },
      { id: 'marimba', name: 'Marimba', program: 12 },
      { id: 'xylophone', name: 'Xylophone', program: 13 },
      { id: 'music_box', name: 'Music Box', program: 10 },
      { id: 'timpani', name: 'Timpani', program: 47 },
    ],
  },
  {
    // Chris's own textures, generated for this app and shipped with it. These
    // are not General MIDI, so they carry an explicit bank number; everything
    // above is bank 0 by default.
    group: 'CFunky Quantum',
    items: [
      { id: 'cfq_glass_pad', name: 'Glass Pad', program: 19, bank: CFUNKY_BANK },
      { id: 'cfq_dark_drone', name: 'Dark Drone', program: 27, bank: CFUNKY_BANK },
      { id: 'cfq_aurora_choir_1', name: 'Aurora Choir', program: 2, bank: CFUNKY_BANK },
      { id: 'cfq_aurora_choir_2', name: 'Aurora Choir Low', program: 15, bank: CFUNKY_BANK },
      { id: 'cfq_granular_cloud', name: 'Granular Cloud', program: 22, bank: CFUNKY_BANK },
      { id: 'cfq_breathing_pad_1', name: 'Breathing Pad', program: 16, bank: CFUNKY_BANK },
      { id: 'cfq_breathing_pad_2', name: 'Breathing Strings', program: 29, bank: CFUNKY_BANK },
      { id: 'cfq_underwater_1', name: 'Underwater', program: 0, bank: CFUNKY_BANK },
      { id: 'cfq_underwater_2', name: 'Underwater Deep', program: 13, bank: CFUNKY_BANK },
      { id: 'cfq_underwater_3', name: 'Underwater High', program: 28, bank: CFUNKY_BANK },
      { id: 'cfq_cathedral_1', name: 'Cathedral', program: 1, bank: CFUNKY_BANK },
      { id: 'cfq_cathedral_2', name: 'Cathedral High', program: 4, bank: CFUNKY_BANK },
      { id: 'cfq_cathedral_3', name: 'Cathedral Low', program: 14, bank: CFUNKY_BANK },
      { id: 'cfq_cathedral_4', name: 'Cathedral Choir', program: 17, bank: CFUNKY_BANK },
      { id: 'cfq_cosmic_space_1', name: 'Cosmic Space', program: 5, bank: CFUNKY_BANK },
      { id: 'cfq_cosmic_space_2', name: 'Cosmic Space High', program: 18, bank: CFUNKY_BANK },
      { id: 'cfq_cosmic_space_3', name: 'Cosmic Drift', program: 20, bank: CFUNKY_BANK },
      { id: 'cfq_cosmic_space_4', name: 'Cosmic Wide', program: 21, bank: CFUNKY_BANK },
      { id: 'cfq_metallic_drone_1', name: 'Metallic Drone', program: 6, bank: CFUNKY_BANK },
      { id: 'cfq_metallic_drone_2', name: 'Bowed Cymbal', program: 7, bank: CFUNKY_BANK },
      { id: 'cfq_metallic_drone_3', name: 'Singing Bowls', program: 23, bank: CFUNKY_BANK },
      { id: 'cfq_metallic_drone_4', name: 'Bowed Metal Low', program: 26, bank: CFUNKY_BANK },
      { id: 'cfq_quantum_shimmer_1', name: 'Quantum Shimmer', program: 24, bank: CFUNKY_BANK },
      { id: 'cfq_quantum_shimmer_2', name: 'Quantum Shimmer 2', program: 25, bank: CFUNKY_BANK },
      { id: 'cfq_braam', name: 'Braam', program: 3, bank: CFUNKY_BANK },
      { id: 'cfq_reverse_riser_1', name: 'Reverse Riser', program: 8, bank: CFUNKY_BANK },
      { id: 'cfq_reverse_riser_2', name: 'Reverse Riser 2', program: 9, bank: CFUNKY_BANK },
      { id: 'cfq_reverse_riser_3', name: 'Reverse Riser 3', program: 10, bank: CFUNKY_BANK },
      { id: 'cfq_reverse_riser_4', name: 'Reverse Riser 4', program: 11, bank: CFUNKY_BANK },
      { id: 'cfq_reverse_riser_5', name: 'Reverse Riser 5', program: 12, bank: CFUNKY_BANK },
    ],
  },
];

export const ALL_INSTRUMENTS = INSTRUMENT_GROUPS.flatMap((g) => g.items);
export const DEFAULT_INSTRUMENT = 'acoustic_grand_piano';

// Address is (bank, program), not program alone. Anything without an explicit
// bank is General MIDI, which is bank 0.
const ADDRESS_BY_ID = new Map(ALL_INSTRUMENTS.map((i) => [i.id, { program: i.program, bank: i.bank || 0 }]));

export function midiToNoteName(midi, useSharps = true) {
  const flat = NOTES[((midi % 12) + 12) % 12];
  const name = useSharps && FLAT_TO_SHARP[flat] ? FLAT_TO_SHARP[flat] : flat;
  return `${name}${Math.floor(midi / 12) - 1}`;
}

export function isBlackKey(midi) {
  return [1, 3, 6, 8, 10].includes(((midi % 12) + 12) % 12);
}

/* ------------------------------------------------------------------ *
 * The shared bank + offline renderer
 * ------------------------------------------------------------------ */

let bankPromise = null;

/**
 * Fetch and parse both banks once; every instrument shares them.
 *
 * General MIDI is required. The CFunky bank is not: if it ever fails to load,
 * the app keeps every GM instrument working and only Chris's textures go
 * missing. A decorative bank must never be able to take the piano roll down.
 */
// fetch() can't read file:// in the packaged app; XHR can.
function getBuffer(url) {
  return fetch(url).then(
    (r) => { if (!r.ok) throw new Error(`Could not load ${url} (${r.status})`); return r.arrayBuffer(); },
    () => new Promise((resolve, reject) => {
      const x = new XMLHttpRequest();
      x.open('GET', url);
      x.responseType = 'arraybuffer';
      x.onload = () => ((x.status === 200 || x.status === 0) && x.response && x.response.byteLength ? resolve(x.response) : reject(new Error(`Could not load ${url} (${x.status})`)));
      x.onerror = () => reject(new Error(`Could not load ${url}`));
      x.send();
    }),
  );
}

function loadBank() {
  if (!bankPromise) {
    bankPromise = (async () => {
      const main = SoundBankLoader.fromArrayBuffer(await getBuffer(SF2_URL));

      let cfunky = null;
      try {
        cfunky = SoundBankLoader.fromArrayBuffer(await getBuffer(SF2_CFUNKY_URL));
      } catch (e) {
        console.warn('[Lyricist] CFunky Quantum bank failed to load; GM instruments still work.', e);
      }
      return { main, cfunky };
    })();
    bankPromise.catch(() => { bankPromise = null; });   // let a failed load retry
  }
  return bankPromise;
}

const RENDER_CHUNK = 128;   // spessasynth renders in small blocks
const TAIL_SEC = 1.6;       // room for the instrument's own release to ring out

let processor = null;
let processorRate = 0;

async function getProcessor(sampleRate) {
  const banks = await loadBank();
  if (!processor || processorRate !== sampleRate) {
    processor = new SpessaSynthProcessor(sampleRate, { enableEffects: false });
    await processor.processorInitialized;
    processor.soundBankManager.addSoundBank(banks.main, 'main');
    if (banks.cfunky) processor.soundBankManager.addSoundBank(banks.cfunky, 'cfunky');
    processorRate = sampleRate;
  }
  return processor;
}

/**
 * Synthesize one note to a stereo AudioBuffer.
 *
 * Renders are serialized through `renderQueue` because a single processor
 * instance is shared — two renders interleaved would bleed into each other.
 */
function renderNote(ctx, program, bank, midi, velocity127, holdSec) {
  return (async () => {
    const proc = await getProcessor(ctx.sampleRate);
    const rate = ctx.sampleRate;
    const total = Math.ceil((holdSec + TAIL_SEC) * rate);
    const holdSamples = Math.floor(holdSec * rate);

    // Clean slate: a previous note must not leak into this one.
    proc.stopAllChannels?.(true);
    // Bank select MSB before the program change, or a bank 42 program number
    // resolves against General MIDI and you get the wrong instrument.
    proc.controllerChange(0, 0, bank || 0);
    proc.programChange(0, program);

    const left = new Float32Array(total);
    const right = new Float32Array(total);
    const chunkL = new Float32Array(RENDER_CHUNK);
    const chunkR = new Float32Array(RENDER_CHUNK);

    proc.noteOn(0, midi, velocity127);

    let released = false;
    for (let i = 0; i < total; i += RENDER_CHUNK) {
      if (!released && i >= holdSamples) {
        proc.noteOff(0, midi);
        released = true;
      }
      const n = Math.min(RENDER_CHUNK, total - i);
      chunkL.fill(0);
      chunkR.fill(0);
      proc.process(chunkL, chunkR, 0, n);
      left.set(chunkL.subarray(0, n), i);
      right.set(chunkR.subarray(0, n), i);
    }
    if (!released) proc.noteOff(0, midi);
    proc.stopAllChannels?.(true);

    const buf = ctx.createBuffer(2, total, rate);
    buf.copyToChannel(left, 0);
    buf.copyToChannel(right, 1);
    return buf;
  })();
}

let renderQueue = Promise.resolve();
function queueRender(fn) {
  const next = renderQueue.then(fn, fn);
  renderQueue = next.catch(() => {});
  return next;
}

/* ------------------------------------------------------------------ *
 * Note cache
 * ------------------------------------------------------------------ */

// Velocity is bucketed so a passage doesn't render a fresh take per note, but
// finely enough that the bank's velocity layers still switch.
const VEL_BUCKETS = 8;
const HOLD_STEP = 0.25;     // quantize held length so similar notes share a render
const MAX_HOLD = 4;
const CACHE_LIMIT = 320;    // rendered notes kept in memory (LRU)

const noteCache = new Map();   // key -> Promise<AudioBuffer>

function cacheKey(program, bank, midi, velBucket, holdQ) {
  return `${bank}:${program}:${midi}:${velBucket}:${holdQ}`;
}

function getRenderedNote(ctx, program, bank, midi, velocity, duration) {
  const velBucket = Math.max(1, Math.min(VEL_BUCKETS, Math.ceil(velocity * VEL_BUCKETS)));
  const holdQ = Math.min(MAX_HOLD, Math.max(HOLD_STEP, Math.ceil(duration / HOLD_STEP) * HOLD_STEP));
  const key = cacheKey(program, bank, midi, velBucket, holdQ);

  const hit = noteCache.get(key);
  if (hit) {
    noteCache.delete(key);       // refresh LRU position
    noteCache.set(key, hit);
    return hit;
  }

  const velocity127 = Math.round((velBucket / VEL_BUCKETS) * 126) + 1;
  const promise = queueRender(() => renderNote(ctx, program, bank, midi, velocity127, holdQ));
  noteCache.set(key, promise);
  promise.catch(() => noteCache.delete(key));

  while (noteCache.size > CACHE_LIMIT) {
    const oldest = noteCache.keys().next().value;
    noteCache.delete(oldest);
  }
  return promise;
}

/**
 * Warm the bank and pre-render a few notes so the first key press is instant.
 * Safe to call repeatedly.
 */
export async function loadInstrument(ctx, instrumentId) {
  const addr = ADDRESS_BY_ID.get(instrumentId);
  if (!addr) throw new Error(`Unknown instrument: ${instrumentId}`);
  await loadBank();
  await getRenderedNote(ctx, addr.program, addr.bank, 60, 0.8, 0.5);
  return { kind: 'sf2', id: instrumentId, program: addr.program, bank: addr.bank };
}

/**
 * Render a note into the cache ahead of time, so the first hit of it is instant.
 * Same velocity and duration as the later playNote, or it lands in another slot.
 */
export function warmNote(ctx, instrument, midi, velocity = 0.8, duration = 0.5) {
  if (!instrument || instrument.kind !== 'sf2') return Promise.resolve();
  return getRenderedNote(ctx, instrument.program, instrument.bank || 0, midi, velocity, duration).then(() => {});
}

/**
 * Wrap a single user sample as a playable instrument. Every key plays that one
 * clip, pitch-shifted from the root note it was recorded at — which is exactly
 * how a sampler treats a one-shot.
 */
export function instrumentFromBuffer(buffer, rootMidi = 60) {
  return { kind: 'sample', buffers: new Map([[rootMidi, buffer]]), sorted: [rootMidi] };
}

/** Nearest recorded sample, so notes between samples still play. */
function nearestSample(sorted, midi) {
  let best = sorted[0];
  let bestDist = Math.abs(midi - best);
  for (const s of sorted) {
    const d = Math.abs(midi - s);
    if (d < bestDist) { best = s; bestDist = d; }
  }
  return best;
}

/**
 * Play one note. Returns a stop handle so held notes can be released.
 *
 * `when` is an AudioContext timestamp; `duration` is in seconds. For bank
 * instruments the envelope is the bank's own — we do not impose an attack or
 * release on top of it, because that flattening is what made everything sound
 * alike. Stopping early still fades out, so releasing a key never clicks.
 */
export function playNote(ctx, destination, instrument, midi, {
  when = ctx.currentTime,
  duration = 0.5,
  velocity = 0.8,
  release = 0.35,
  // Pads: a tap let go before its note has rendered still sounds for this long
  // instead of being dropped. Left null, an early stop cancels the note (what the
  // sequencer wants when the transport stops).
  minHold = null,
  lateLimit = 0.6,   // ...unless the render took longer than this; a late note is worse than none
} = {}) {
  // Play-through-DAW toggle (midiOut.js): the note goes out as MIDI and the DAW sounds it.
  if (isDaw()) return dawNote(ctx, midi, { when, duration, velocity });
  if (!instrument) return () => {};

  // A user's own sample: straight one-shot playback, pitched from its root.
  if (instrument.kind === 'sample') {
    const { buffers, sorted } = instrument;
    const sampleMidi = nearestSample(sorted, midi);
    const buffer = buffers.get(sampleMidi);
    if (!buffer) return () => {};

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = Math.pow(2, (midi - sampleMidi) / 12);

    const gain = ctx.createGain();
    const peak = Math.max(0.0001, Math.min(1, velocity));
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.linearRampToValueAtTime(peak, when + 0.008);
    const releaseStart = when + Math.max(0.02, duration);
    gain.gain.setValueAtTime(peak, releaseStart);
    gain.gain.exponentialRampToValueAtTime(0.0001, releaseStart + release);

    src.connect(gain).connect(destination);
    src.start(when);
    src.stop(releaseStart + release + 0.05);
    return (stopAt = ctx.currentTime) => {
      try {
        gain.gain.cancelScheduledValues(stopAt);
        gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), stopAt);
        gain.gain.exponentialRampToValueAtTime(0.0001, stopAt + release);
        src.stop(stopAt + release + 0.05);
      } catch { /* already stopped */ }
    };
  }

  // Bank instrument: the note is synthesized (or pulled from cache) and then
  // scheduled. Rendering is async, so a note whose start time has already
  // passed by the time it is ready starts immediately instead of being lost.
  let src = null;
  let gain = null;
  let cancelled = false;
  let stopAtRequested = null;
  const askedAt = ctx.currentTime;

  getRenderedNote(ctx, instrument.program, instrument.bank || 0, midi, velocity, duration)
    .then((buffer) => {
      if (cancelled && (minHold == null || ctx.currentTime - askedAt > lateLimit)) return;
      src = ctx.createBufferSource();
      src.buffer = buffer;
      gain = ctx.createGain();
      gain.gain.value = 1;
      src.connect(gain).connect(destination);

      const startAt = Math.max(when, ctx.currentTime);
      src.start(startAt);

      if (stopAtRequested != null) applyStop(Math.max(stopAtRequested, startAt + (minHold || 0)));
    })
    .catch(() => { /* a note that fails to render is silent, never a buzz */ });

  function applyStop(stopAt) {
    if (!gain || !src) return;
    try {
      const t = Math.max(stopAt, ctx.currentTime);
      gain.gain.cancelScheduledValues(t);
      gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + release);
      src.stop(t + release + 0.05);
    } catch { /* already stopped */ }
  }

  return (stopAt = ctx.currentTime) => {
    if (!src) { cancelled = true; stopAtRequested = stopAt; return; }
    applyStop(stopAt);
  };
}
