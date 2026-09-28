/**
 * PLAY THROUGH A DAW.
 *
 * Chris, 2026-09-27: "put a toggle on it so that if it's hooked up to Ableton,
 * or any other DAW, that it will work through that."
 *
 * With the toggle on, nothing in Lyricist Pro makes the sound. Every note the
 * pads, the sequencer and the drum machine would have played goes out as MIDI
 * instead, and the DAW plays it on its own instruments (its VST3s, through its
 * own ASIO driver). No engine, no compiler, no driver of ours in the path.
 *
 *   notes  -> the note channel (1 by default)
 *   drums  -> channel 10, General MIDI drum map, so any drum rack lines up
 *
 * Getting the MIDI into the DAW needs a virtual cable: loopMIDI (one port, both
 * sides pick it). Windows MIDI Services' "Loopback A/B" are NOT visible to
 * Chromium's Web MIDI or to WinMM DAWs, so they don't work (tested 2026-09-27).
 *
 * The two engines check isDaw() at the top of playNote / triggerVoice, so every
 * caller follows the toggle without knowing it exists.
 */

const KEY = 'lyricist.midiout.v1';
const DEFAULTS = { mode: 'builtin', outputId: '', outputName: '', noteChannel: 1, drumChannel: 10 };

// 808 voice -> General MIDI percussion note.
export const GM_DRUMS = {
  kick: 36, rim: 37, snare: 38, clap: 39, tomL: 41, hatC: 42, tomM: 45,
  hatO: 46, tomH: 48, cymbal: 49, cowbell: 56, conga: 63, maracas: 70, clave: 75,
};

let state = load();
let access = null;
let accessPromise = null;
const listeners = new Set();

function load() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...DEFAULTS }; }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* private window */ }
  listeners.forEach((fn) => { try { fn(getMidiOut()); } catch { /* a listener's problem */ } });
}

export function subscribeMidiOut(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function getMidiOut() { return { ...state, outputs: listOutputs(), ready: !!access }; }
export function isDaw() { return state.mode === 'daw'; }

export async function initMidiOut() {
  if (access) return access;
  if (!accessPromise) {
    accessPromise = (async () => {
      if (typeof navigator === 'undefined' || !navigator.requestMIDIAccess) return null;
      try {
        access = await navigator.requestMIDIAccess();
        access.onstatechange = () => save();
        // First run: pick the Windows loopback (or loopMIDI) so it works with no setup.
        if (!state.outputId || !access.outputs.get(state.outputId)) {
          const outs = [...access.outputs.values()];
          const byName = state.outputName && outs.find((o) => o.name === state.outputName);
          const guess = byName || outs.find((o) => /loopback a|loopmidi|virtual/i.test(o.name)) || null;
          if (guess) { state.outputId = guess.id; state.outputName = guess.name; }
        }
        save();
        return access;
      } catch {
        return null;
      }
    })();
  }
  return accessPromise;
}

export function listOutputs() {
  if (!access) return [];
  return [...access.outputs.values()].map((o) => ({ id: o.id, name: o.name }));
}

export function setMidiOut(patch) {
  state = { ...state, ...patch };
  if (patch.outputId && access) state.outputName = access.outputs.get(patch.outputId)?.name || state.outputName;
  if (state.mode === 'daw') initMidiOut();
  if (patch.mode === 'builtin') allNotesOff();
  save();
}

function port() {
  if (!access) { initMidiOut(); return null; }
  return access.outputs.get(state.outputId) || null;
}

// AudioContext time -> the performance.now() clock Web MIDI schedules on.
function stamp(ctx, when) {
  if (!ctx || when == null) return performance.now();
  return performance.now() + Math.max(0, (when - ctx.currentTime) * 1000);
}

const vel = (v) => Math.max(1, Math.min(127, Math.round((v ?? 0.8) * 127)));
const held = new Set();   // "ch:note" still sounding, for all-notes-off

function send(ch, note, v, at, durMs) {
  const out = port();
  if (!out) return () => {};
  const c = (Math.max(1, Math.min(16, ch)) - 1) & 15;
  const n = Math.max(0, Math.min(127, Math.round(note)));
  const k = `${c}:${n}`;
  let open = true;
  try {
    out.send([0x90 | c, n, v], at);
    held.add(k);
    if (durMs != null) {
      out.send([0x80 | c, n, 0], at + Math.max(10, durMs));
      setTimeout(() => { if (open) { open = false; held.delete(k); } }, Math.max(10, at + durMs - performance.now()));
    }
  } catch { return () => {}; }
  return () => {
    if (!open) return;
    open = false;
    held.delete(k);
    try { out.send([0x80 | c, n, 0]); } catch { /* port went away */ }
  };
}

/** A pitched note. Same shape as soundfontEngine.playNote: returns a stop handle. */
export function dawNote(ctx, midi, { when, duration = 0.5, velocity = 0.8 } = {}) {
  return send(state.noteChannel, midi, vel(velocity), stamp(ctx, when), duration * 1000);
}

/** An 808 voice, as its General MIDI drum note on the drum channel. */
export function dawDrum(ctx, voiceId, when, velocity = 1) {
  const note = GM_DRUMS[voiceId];
  if (note == null) return null;
  send(state.drumChannel, note, vel(Math.min(1, velocity)), stamp(ctx, when), 90);
  return null;
}

/** Panic: silence every note we started (also sent when switching back to built-in). */
export function allNotesOff() {
  const out = port();
  if (!out) return;
  for (const k of held) {
    const [c, n] = k.split(':').map(Number);
    try { out.send([0x80 | c, n, 0]); } catch { /* */ }
  }
  held.clear();
  for (const ch of new Set([state.noteChannel, state.drumChannel])) {
    try { out.send([0xB0 | ((ch - 1) & 15), 123, 0]); } catch { /* */ }
  }
}

// Remember the choice across launches: re-open MIDI straight away when DAW was on.
if (state.mode === 'daw') initMidiOut();
