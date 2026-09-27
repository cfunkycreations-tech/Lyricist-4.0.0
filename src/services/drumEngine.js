/**
 * 808 drum engine + effects rack — Lyricist 4.2.0
 *
 * The kit is synthesized, not sampled. A real TR-808 makes its sounds with
 * oscillators, noise and envelopes, so modelling it that way gets closer to the
 * original than a handful of MP3s would — and it costs zero download, tunes to
 * any pitch, and every knob stays live. Any voice can still be swapped for one
 * of the user's own samples.
 *
 * Everything runs through a per-track effects chain into a master chain, all
 * offline Web Audio. No libraries, no licences, no network.
 */

import * as TR from './tr808.js';

/* ── Voices ───────────────────────────────────────────────────────── */

export const KIT = [
  { id: 'kick',    name: 'Kick',       color: '#e7a540', key: 'B1' },   // amber, Chris 2026-09-27 (was magenta)
  { id: 'snare',   name: 'Snare',      color: '#e7a540', key: 'D2' },
  { id: 'clap',    name: 'Clap',       color: '#9ba1aa', key: 'D#2' },
  { id: 'hatC',    name: 'Closed Hat', color: '#10f0a0', key: 'F#2' },
  { id: 'hatO',    name: 'Open Hat',   color: '#7dffb0', key: 'A#2' },
  { id: 'cymbal',  name: 'Cymbal',     color: '#e7a540', key: 'C#3' },
  { id: 'tomL',    name: 'Low Tom',    color: '#ff8c00', key: 'G1' },
  { id: 'tomM',    name: 'Mid Tom',    color: '#fb923c', key: 'B1' },
  { id: 'tomH',    name: 'High Tom',   color: '#fdba74', key: 'D2' },
  { id: 'conga',   name: 'Conga',      color: '#f472b6', key: 'E2' },
  { id: 'rim',     name: 'Rim',        color: '#f8eea6', key: 'C#2' },
  { id: 'clave',   name: 'Clave',      color: '#fde68a', key: 'D#3' },
  { id: 'cowbell', name: 'Cowbell',    color: '#facc15', key: 'G#2' },
  { id: 'maracas', name: 'Maracas',    color: '#a3e635', key: 'A#3' },
];

/**
 * Per-voice defaults. These are the panel controls of a real 808 — level, tone,
 * decay, tuning, snappy — normalised 0..1 so the UI can be uniform. Levels are
 * balanced by ear against measured peaks: the band-passed voices lose a lot of
 * signal to their filters and need more gain to sit in the same kit as a kick.
 */
export const DEFAULT_VOICE = {
  kick:    { level: 1.10, tone: 0.35, decay: 0.55, drive: 0.75 },
  snare:   { level: 0.51, tone: 0.45, decay: 0.35, snap: 0.55 },
  clap:    { level: 1.46, decay: 0.40 },
  hatC:    { level: 2.00, decay: 0.35 },
  hatO:    { level: 1.71, decay: 0.45 },
  cymbal:  { level: 2.66, tone: 0.45, decay: 0.40 },
  tomL:    { level: 0.69, tuning: 0.45, decay: 0.55 },
  tomM:    { level: 0.70, tuning: 0.50, decay: 0.50 },
  tomH:    { level: 0.61, tuning: 0.55, decay: 0.45 },
  conga:   { level: 0.54, tuning: 0.55, decay: 0.40 },
  rim:     { level: 0.84 },
  clave:   { level: 1.25 },
  cowbell: { level: 1.11, decay: 0.30 },
  maracas: { level: 0.87, decay: 0.35 },
};

/**
 * Fire one synthesized 808 voice. `dest` is the head of that track's effect
 * chain. Every voice is a circuit model from tr808.js — see that file for why
 * a hi-hat is six square waves and a handclap is four bursts.
 */
export function triggerVoice(ctx, dest, voiceId, when, params = {}, velocity = 1) {
  const p = { ...DEFAULT_VOICE[voiceId], ...params };
  const level = (p.level ?? 1) * velocity;

  switch (voiceId) {
    case 'kick':
      return TR.bassDrum(ctx, dest, when, { level, tone: p.tone, decay: p.decay, drive: p.drive });
    case 'snare':
      return TR.snareDrum(ctx, dest, when, { level, tone: p.tone, snappy: p.snap, decay: p.decay });
    case 'clap':
      return TR.handclap(ctx, dest, when, { level, decay: p.decay });
    case 'hatC':
      return TR.closedHat(ctx, dest, when, { level, decay: p.decay });
    case 'hatO':
      return TR.openHat(ctx, dest, when, { level, decay: p.decay });
    case 'cymbal':
      return TR.cymbal(ctx, dest, when, { level, tone: p.tone, decay: p.decay });
    case 'tomL':
      return TR.tomConga(ctx, dest, when, { level, tuning: p.tuning, pitchRange: [100, 80], decayMs: 120 + p.decay * 220, isTom: true });
    case 'tomM':
      return TR.tomConga(ctx, dest, when, { level, tuning: p.tuning, pitchRange: [160, 120], decayMs: 100 + p.decay * 180, isTom: true });
    case 'tomH':
      return TR.tomConga(ctx, dest, when, { level, tuning: p.tuning, pitchRange: [220, 165], decayMs: 90 + p.decay * 160, isTom: true });
    case 'conga':
      return TR.tomConga(ctx, dest, when, { level, tuning: p.tuning, pitchRange: [310, 250], decayMs: 70 + p.decay * 120, isTom: false });
    case 'rim':
      return TR.claveRimshot(ctx, dest, when, { level, isRimshot: true });
    case 'clave':
      return TR.claveRimshot(ctx, dest, when, { level, isRimshot: false });
    case 'cowbell':
      return TR.cowbell(ctx, dest, when, { level, decay: p.decay });
    case 'maracas':
      return TR.maracas(ctx, dest, when, { level, decay: p.decay });
    default:
      return null;
  }
}

/** Play a user sample on a track instead of the synth voice. */
export function triggerSample(ctx, dest, buffer, when, { level = 1, pitch = 0, velocity = 1, loop = false } = {}) {
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = loop;
  src.playbackRate.value = Math.pow(2, pitch / 12);
  const g = ctx.createGain();
  g.gain.value = level * velocity;
  src.connect(g).connect(dest);
  src.start(when);
  return src;
}

/* ── Effects rack ─────────────────────────────────────────────────── */

/* ── Effects ────────────────────────────────────── */

// The rack lives in its own module now: filters, drive, crush, three-band EQ,
// a compressor that makes up its own gain, a damped ping-pong delay, a reverb
// with pre-delay and early reflections, and a master limiter. Re-exported here
// so every existing import keeps working.
export { DEFAULT_FX, createFxChain } from './fxRack.js';

/* ── Patterns ─────────────────────────────────────────────────────── */

export const STEPS = 16;

export function emptyPattern() {
  const p = {};
  for (const v of KIT) p[v.id] = new Array(STEPS).fill(0);
  return p;
}

/**
 * Bring a saved pattern up to the current kit. The kit grew from 8 voices to
 * 14, and the single 'tom' became low/mid/high — a pattern saved before that
 * would otherwise come back with holes, or crash a lookup. Old 'tom' rows move
 * to the mid tom, anything unknown is dropped, anything missing starts empty.
 */
export function migratePattern(saved) {
  const p = emptyPattern();
  if (!saved || typeof saved !== 'object') return p;
  const RENAMED = { tom: 'tomM' };
  for (const [id, row] of Object.entries(saved)) {
    const target = RENAMED[id] || id;
    if (!Array.isArray(row) || !p[target]) continue;
    for (let i = 0; i < STEPS; i++) p[target][i] = Number(row[i]) || 0;
  }
  return p;
}

/** A usable starting beat so the machine makes sound the moment it opens. */
export function starterPattern() {
  const p = emptyPattern();
  [0, 8].forEach((i) => { p.kick[i] = 1; });
  p.kick[11] = 0.7;
  [4, 12].forEach((i) => { p.snare[i] = 1; });
  for (let i = 0; i < STEPS; i += 2) p.hatC[i] = 0.7;
  [7, 15].forEach((i) => { p.hatO[i] = 0.6; });
  return p;
}
