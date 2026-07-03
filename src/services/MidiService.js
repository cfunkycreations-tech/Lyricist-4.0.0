// Audio → MIDI pipeline — Lyricist 4.1.3
//
// Primary path (desktop / offline): Spotify's open-source `basic-pitch` model
// runs RIGHT HERE in the renderer on TensorFlow.js. No audio ever leaves the
// machine. The model files are copied into public/models/basic-pitch by
// `npm run copy:model` (wired into postinstall), so the packaged Electron
// build works with zero network access.
//
// Secondary path (hosted web deployments): POST the audio to /api/convert-midi
// (see server/convert-midi.js) and get the same MIDI JSON back.
//
// MIDI JSON shape returned by both paths — editable in the sequencer:
//   {
//     tempo: 120,
//     notes: [{ id, midi, start, duration, velocity }]   // seconds, 0–1 velocity
//   }

import { decodeBlob, resampleToMono } from './audioEngine.js';

const MODEL_SAMPLE_RATE = 22050; // basic-pitch's required input rate

let basicPitchPromise = null;

// Lazy-load basic-pitch + tfjs only when the user actually converts something
// (keeps ~4MB of TensorFlow out of the initial bundle).
function loadBasicPitch() {
  if (!basicPitchPromise) {
    basicPitchPromise = import('@spotify/basic-pitch').then((mod) => {
      // Resolve the model relative to the document so it works in dev
      // (http://localhost:5173/), and in the packaged app (file://.../dist/).
      const modelUrl = new URL('models/basic-pitch/model.json', document.baseURI).href;
      return { mod, model: new mod.BasicPitch(modelUrl) };
    });
  }
  return basicPitchPromise;
}

let nextNoteId = 1;

function toMidiJSON(rawNotes, tempo = 120) {
  return {
    tempo,
    notes: rawNotes
      .map((n) => ({
        id: nextNoteId++,
        midi: n.pitchMidi,
        start: n.startTimeSeconds,
        duration: Math.max(0.05, n.durationSeconds),
        velocity: Math.min(1, Math.max(0.05, n.amplitude))
      }))
      .sort((a, b) => a.start - b.start || a.midi - b.midi)
  };
}

/**
 * Convert an audio Blob/File (upload or voice-memo recording) to MIDI JSON.
 * @param {Blob} blob                audio/* blob
 * @param {object}  opts
 * @param {function} opts.onProgress 0..1 progress callback
 * @param {number}   opts.onsetThreshold   note-onset sensitivity (default 0.5)
 * @param {number}   opts.frameThreshold   note-sustain sensitivity (default 0.3)
 * @param {number}   opts.minNoteLength    min note length in frames (default 5)
 */
export async function convertAudioToMidi(blob, { onProgress, onsetThreshold = 0.5, frameThreshold = 0.3, minNoteLength = 5 } = {}) {
  const report = (p) => { if (onProgress) onProgress(Math.min(1, Math.max(0, p))); };

  report(0.02);
  const decoded = await decodeBlob(blob);
  report(0.08);
  const mono = await resampleToMono(decoded, MODEL_SAMPLE_RATE);
  report(0.14);

  const { mod, model } = await loadBasicPitch();
  report(0.2);

  const frames = [];
  const onsets = [];
  const contours = [];

  await model.evaluateModel(
    mono, // AudioBuffer @ 22050Hz mono
    (f, o, c) => { frames.push(...f); onsets.push(...o); contours.push(...c); },
    (pct) => report(0.2 + pct * 0.7)
  );

  const rawNotes = mod.noteFramesToTime(
    mod.addPitchBendsToNoteEvents(
      contours,
      mod.outputToNotesPoly(frames, onsets, onsetThreshold, frameThreshold, minNoteLength)
    )
  );

  report(1);
  return toMidiJSON(rawNotes);
}

/**
 * Hosted-web fallback: same contract, but the heavy lifting happens on the
 * backend route mapped at /api/convert-midi (server/convert-midi.js).
 */
export async function convertAudioToMidiViaApi(blob, { endpoint = '/api/convert-midi' } = {}) {
  const form = new FormData();
  form.append('audio', blob, 'audio-input');
  const res = await fetch(endpoint, { method: 'POST', body: form });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`convert-midi API failed (${res.status}): ${detail || res.statusText}`);
  }
  const json = await res.json();
  // Re-stamp ids so they're unique within this session.
  json.notes = (json.notes || []).map((n) => ({ ...n, id: nextNoteId++ }));
  return json;
}

// ── Note helpers shared with the sequencer ──
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export function midiToName(midi) {
  return `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
}
export function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}
