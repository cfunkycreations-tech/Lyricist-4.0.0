/**
 * Sampled-instrument engine for the MIDI Studio piano roll.
 *
 * Replaces the old two-oscillator (sawtooth + triangle) synth with real
 * recorded instruments: grand piano, guitars, harp, flute, cello, strings,
 * horns, organs, mallets and more.
 *
 * Samples are MusyngKite General MIDI packs from gleitz/midi-js-soundfonts
 * (MIT). They are bundled in `public/soundfonts/`, so playback is fully
 * offline — nothing is fetched from the network at runtime.
 *
 * Each pack is a JS file assigning a `{ "C4": "data:audio/ogg;base64,..." }`
 * map. We parse the object out as JSON rather than executing it, decode the
 * clips once, and pitch-shift the nearest sample to cover any missing notes.
 */

const NOTES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const FLAT_TO_SHARP = { Db: 'C#', Eb: 'D#', Gb: 'F#', Ab: 'G#', Bb: 'A#' };

/** General MIDI instruments bundled with the app, grouped for the picker. */
export const INSTRUMENT_GROUPS = [
  {
    group: 'Keys',
    items: [
      { id: 'acoustic_grand_piano', name: 'Grand Piano' },
      { id: 'bright_acoustic_piano', name: 'Bright Piano' },
      { id: 'electric_piano_1', name: 'Electric Piano' },
      { id: 'electric_piano_2', name: 'Rhodes' },
      { id: 'harpsichord', name: 'Harpsichord' },
      { id: 'celesta', name: 'Celesta' },
    ],
  },
  {
    group: 'Guitar & Bass',
    items: [
      { id: 'acoustic_guitar_nylon', name: 'Nylon Guitar' },
      { id: 'acoustic_guitar_steel', name: 'Steel Guitar' },
      { id: 'electric_guitar_clean', name: 'Clean Electric' },
      { id: 'electric_guitar_jazz', name: 'Jazz Guitar' },
      { id: 'overdriven_guitar', name: 'Overdrive Guitar' },
      { id: 'distortion_guitar', name: 'Distortion Guitar' },
      { id: 'acoustic_bass', name: 'Upright Bass' },
      { id: 'electric_bass_finger', name: 'Electric Bass' },
    ],
  },
  {
    group: 'Strings',
    items: [
      { id: 'orchestral_harp', name: 'Harp' },
      { id: 'violin', name: 'Violin' },
      { id: 'viola', name: 'Viola' },
      { id: 'cello', name: 'Cello' },
      { id: 'contrabass', name: 'Contrabass' },
      { id: 'string_ensemble_1', name: 'String Ensemble' },
      { id: 'synth_strings_1', name: 'Synth Strings' },
    ],
  },
  {
    group: 'Winds & Brass',
    items: [
      { id: 'flute', name: 'Flute' },
      { id: 'pan_flute', name: 'Pan Flute' },
      { id: 'clarinet', name: 'Clarinet' },
      { id: 'alto_sax', name: 'Alto Sax' },
      { id: 'trumpet', name: 'Trumpet' },
      { id: 'french_horn', name: 'French Horn' },
    ],
  },
  {
    group: 'Organs & Voices',
    items: [
      { id: 'church_organ', name: 'Church Organ' },
      { id: 'drawbar_organ', name: 'Drawbar Organ' },
      { id: 'choir_aahs', name: 'Choir Aahs' },
      { id: 'voice_oohs', name: 'Voice Oohs' },
      { id: 'pad_2_warm', name: 'Warm Pad' },
      { id: 'lead_2_sawtooth', name: 'Saw Lead' },
    ],
  },
  {
    group: 'Mallets & Percussion',
    items: [
      { id: 'vibraphone', name: 'Vibraphone' },
      { id: 'marimba', name: 'Marimba' },
      { id: 'xylophone', name: 'Xylophone' },
      { id: 'music_box', name: 'Music Box' },
      { id: 'timpani', name: 'Timpani' },
    ],
  },
];

export const ALL_INSTRUMENTS = INSTRUMENT_GROUPS.flatMap((g) => g.items);
export const DEFAULT_INSTRUMENT = 'acoustic_grand_piano';

/** "C#4" / "Db4" -> MIDI number. */
function noteNameToMidi(name) {
  const m = /^([A-G])([#b]?)(-?\d+)$/.exec(name);
  if (!m) return null;
  const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]];
  const accidental = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  return (parseInt(m[3], 10) + 1) * 12 + base + accidental;
}

export function midiToNoteName(midi, useSharps = true) {
  const flat = NOTES[((midi % 12) + 12) % 12];
  const name = useSharps && FLAT_TO_SHARP[flat] ? FLAT_TO_SHARP[flat] : flat;
  return `${name}${Math.floor(midi / 12) - 1}`;
}

export function isBlackKey(midi) {
  return [1, 3, 6, 8, 10].includes(((midi % 12) + 12) % 12);
}

function base64ToArrayBuffer(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

/**
 * Pull the `{ "C4": "data:audio/ogg;base64,..." }` map out of a midi-js pack.
 * Parsed as JSON — the file is never executed.
 */
function parsePack(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('Unrecognized soundfont file');
  return JSON.parse(text.slice(start, end + 1));
}

const cache = new Map();   // instrumentId -> Promise<{ buffers: Map<midi, AudioBuffer>, sorted: number[] }>

/** Load and decode an instrument. Cached, so switching back is instant. */
export function loadInstrument(ctx, instrumentId) {
  const key = instrumentId;
  if (cache.has(key)) return cache.get(key);

  const promise = (async () => {
    const url = `soundfonts/${instrumentId}-ogg.js`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Missing soundfont: ${instrumentId}`);
    const pack = parsePack(await res.text());

    const buffers = new Map();
    await Promise.all(
      Object.entries(pack).map(async ([noteName, dataUri]) => {
        const midi = noteNameToMidi(noteName);
        if (midi == null) return;
        const b64 = dataUri.slice(dataUri.indexOf('base64,') + 7);
        try {
          const buf = await ctx.decodeAudioData(base64ToArrayBuffer(b64));
          buffers.set(midi, buf);
        } catch {
          /* skip a clip that fails to decode rather than losing the instrument */
        }
      })
    );
    if (!buffers.size) throw new Error(`No playable samples in ${instrumentId}`);
    return { buffers, sorted: [...buffers.keys()].sort((a, b) => a - b) };
  })();

  cache.set(key, promise);
  promise.catch(() => cache.delete(key));   // let a failed load be retried
  return promise;
}

/**
 * Wrap a single user sample as a playable instrument. Every key plays that one
 * clip, pitch-shifted from the root note it was recorded at — which is exactly
 * how a sampler treats a one-shot.
 */
export function instrumentFromBuffer(buffer, rootMidi = 60) {
  return { buffers: new Map([[rootMidi, buffer]]), sorted: [rootMidi] };
}

/** Nearest recorded sample, so notes between samples still play. */
function nearestSample(sorted, midi) {
  let best = sorted[0];
  let bestDist = Math.abs(midi - best);
  for (const s of sorted) {
    const d = Math.abs(midi - s);
    if (d < bestDist) {
      best = s;
      bestDist = d;
    }
  }
  return best;
}

/**
 * Play one note. Returns a stop handle so held notes can be released.
 *
 * `when` is an AudioContext timestamp; `duration` is in seconds. The tail is
 * an exponential release rather than a hard cut, which is most of what makes
 * a sampled instrument sound real instead of clipped.
 */
export function playNote(ctx, destination, instrument, midi, {
  when = ctx.currentTime,
  duration = 0.5,
  velocity = 0.8,
  release = 0.35,
} = {}) {
  const { buffers, sorted } = instrument;
  const sampleMidi = nearestSample(sorted, midi);
  const buffer = buffers.get(sampleMidi);
  if (!buffer) return () => {};

  const src = ctx.createBufferSource();
  src.buffer = buffer;
  // Equal-temperament pitch shift from the nearest recorded pitch.
  src.playbackRate.value = Math.pow(2, (midi - sampleMidi) / 12);

  const gain = ctx.createGain();
  const peak = Math.max(0.0001, Math.min(1, velocity));
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.linearRampToValueAtTime(peak, when + 0.008);   // short attack, no click

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
    } catch {
      /* already stopped */
    }
  };
}
