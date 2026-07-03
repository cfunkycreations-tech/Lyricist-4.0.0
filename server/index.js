// Lyricist convert-midi backend — Lyricist 4.1.3
//
//   POST /api/convert-midi   multipart/form-data, field "audio" (mp3/wav/ogg/flac)
//   → 200 { tempo, notes: [{ id, midi, start, duration, velocity }] }
//
// The audio is piped through Spotify's open-source basic-pitch model
// (TensorFlow.js) to extract note events, then returned as editable MIDI JSON
// that drops straight into the frontend sequencer.
//
// Run:  cd server && npm install && npm start     (default port 5180)
// The desktop app does NOT need this — it converts locally in the renderer.
// This route exists for hosted-web deployments of Lyricist.

import express from 'express';
import multer from 'multer';
import decodeAudio from 'audio-decode';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const { BasicPitch, noteFramesToTime, addPitchBendsToNoteEvents, outputToNotesPoly } = require('@spotify/basic-pitch');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MODEL_PATH = 'file://' + path.join(
  __dirname, 'node_modules', '@spotify', 'basic-pitch', 'model', 'model.json'
).replace(/\\/g, '/');

const MODEL_SAMPLE_RATE = 22050;
const MAX_UPLOAD_MB = 40;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024 }
});

const app = express();

// One shared model instance — basic-pitch lazy-loads the weights on first use.
const basicPitch = new BasicPitch(MODEL_PATH);

// Downmix to mono + linear-resample to the model's required 22050 Hz.
function toModelInput(audioBuffer) {
  const { numberOfChannels, sampleRate, length } = audioBuffer;
  const mono = new Float32Array(length);
  for (let ch = 0; ch < numberOfChannels; ch++) {
    const data = audioBuffer.getChannelData(ch);
    for (let i = 0; i < length; i++) mono[i] += data[i] / numberOfChannels;
  }
  if (sampleRate === MODEL_SAMPLE_RATE) return mono;
  const outLength = Math.round(length * MODEL_SAMPLE_RATE / sampleRate);
  const out = new Float32Array(outLength);
  const ratio = (length - 1) / (outLength - 1);
  for (let i = 0; i < outLength; i++) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const i1 = Math.min(length - 1, i0 + 1);
    out[i] = mono[i0] + (mono[i1] - mono[i0]) * (pos - i0);
  }
  return out;
}

app.post('/api/convert-midi', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file?.buffer?.length) {
      return res.status(400).json({ error: 'No audio uploaded. Send multipart/form-data with an "audio" field.' });
    }

    const audioBuffer = await decodeAudio(req.file.buffer); // mp3/wav/ogg/flac
    const samples = toModelInput(audioBuffer);

    const frames = [];
    const onsets = [];
    const contours = [];
    await basicPitch.evaluateModel(
      samples,
      (f, o, c) => { frames.push(...f); onsets.push(...o); contours.push(...c); },
      () => {} // progress not streamed over plain HTTP
    );

    const rawNotes = noteFramesToTime(
      addPitchBendsToNoteEvents(
        contours,
        outputToNotesPoly(frames, onsets, 0.5, 0.3, 5)
      )
    );

    let id = 1;
    res.json({
      tempo: 120,
      notes: rawNotes
        .map((n) => ({
          id: id++,
          midi: n.pitchMidi,
          start: n.startTimeSeconds,
          duration: Math.max(0.05, n.durationSeconds),
          velocity: Math.min(1, Math.max(0.05, n.amplitude))
        }))
        .sort((a, b) => a.start - b.start || a.midi - b.midi)
    });
  } catch (err) {
    console.error('[convert-midi]', err);
    res.status(500).json({ error: `Conversion failed: ${err.message}` });
  }
});

app.get('/api/convert-midi/health', (_req, res) => res.json({ ok: true, model: 'basic-pitch' }));

const PORT = process.env.PORT || 5180;
app.listen(PORT, () => console.log(`convert-midi server listening on :${PORT}`));
