import React, { useState, useEffect, useRef } from 'react';
import AudioToMidi from './AudioToMidi.jsx';
import Sequencer from './Sequencer.jsx';
import Visualizer from './Visualizer.jsx';
import SampleLibrary from './SampleLibrary.jsx';
import DrumMachine from './DrumMachine.jsx';
import { registerDemoSnapshot } from '../../services/demoSafety.js';
import { clearLibrary, countSamples } from '../../services/sampleLibrary.js';

// MIDI Studio tab — Lyricist 4.1.3
// Audio → MIDI (basic-pitch, fully offline) feeding an offline piano-roll
// sequencer, with a Butterchurn/Milkdrop visualizer wired to the same audio
// bus. The sequence persists locally so it survives restarts.

const STORE_KEY = 'lyricistMidiStudio';

// Debug switch: #off=viz,drums,sampler,seq,a2m leaves those panels out, so a
// runaway on this tab can be bisected without a rebuild per guess.
const OFF = new Set(
  (new URLSearchParams(window.location.hash.replace(/^#/, '')).get('off') || '')
    .split(',').map((s) => s.trim()).filter(Boolean)
);

// #wipe=samples empties the sample library once at startup. Recordings live in
// their own database and are never touched by this.
const WIPE_SAMPLES =
  new URLSearchParams(window.location.hash.replace(/^#/, '')).get('wipe') === 'samples';

export default function MidiStudio() {
  const [midi, setMidi] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      if (saved?.notes) return saved;
    } catch { /* corrupt save — start fresh */ }
    return { tempo: 120, notes: [] };
  });
  const [sourceName, setSourceName] = useState('');
  const [userSample, setUserSample] = useState(null);   // sample sent from the library to the roll

  useEffect(() => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(midi)); } catch { /* storage full */ }
  }, [midi]);

  // The demo converts audio and loads its own notes into the roll, which would
  // otherwise overwrite a part you were writing. Snapshot the whole sequence.
  const liveRef = useRef({ midi, sourceName });
  liveRef.current = { midi, sourceName };
  useEffect(() => registerDemoSnapshot('midi-studio', {
    snapshot: () => ({ midi: liveRef.current.midi, sourceName: liveRef.current.sourceName }),
    restore: (s) => {
      if (!s) return;
      setMidi(s.midi);
      setSourceName(s.sourceName);
    },
    hasWork: () => (liveRef.current.midi?.notes || []).length > 0,
  }), []);

  useEffect(() => {
    if (!WIPE_SAMPLES) return;
    (async () => {
      const log = (m) => { console.warn(`[lyricist] ${m}`); window.lyricistAPI?.log?.(m); };
      try {
        log('wipe requested — emptying the sample library');
        const removed = await clearLibrary();
        const left = await countSamples();
        log(`sample library emptied: ${removed.samples} samples removed; ${left} left`);
      } catch (e) {
        log(`sample wipe FAILED: ${e?.message || e}`);
      }
    })();
  }, []);

  const handleNotes = (midiJSON, name) => {
    setMidi(midiJSON);
    setSourceName(name || '');
  };

  return (
    <div style={{ flex: 1, minHeight: 0, width: '100%', display: 'flex', overflow: 'hidden', background: '#000' }}>
      <div className="midi-shell">
        <div className="midi-sidebar">
          <div>
            <h3 style={{ fontSize: '1rem', marginBottom: 4 }}>🎹 MIDI Studio</h3>
            <p style={{ fontSize: '0.72rem', color: 'rgba(196,181,253,0.7)', lineHeight: 1.5 }}>
              Turn any audio — a Suno track, a guitar riff, or a hummed voice memo — into
              editable MIDI, tweak it in the sequencer, and watch Milkdrop dance to it.
              Everything runs offline on your machine.
            </p>
          </div>

          {!OFF.has('a2m') && <AudioToMidi onNotes={handleNotes} />}

          {sourceName && (
            <div className="pill-green" style={{ padding: '7px 10px', borderRadius: 8, fontSize: '0.68rem' }}>
              ✓ Converted “{sourceName}” — {midi.notes.length} notes in the sequencer
            </div>
          )}
        </div>

        <div className="midi-main">
          {!OFF.has('seq') && <Sequencer midi={midi} setMidi={setMidi} userSample={userSample} />}
          {!OFF.has('drums') && <DrumMachine />}
          {!OFF.has('sampler') && <SampleLibrary onUseSample={setUserSample} />}
          {!OFF.has('viz') && <Visualizer />}
        </div>
      </div>
    </div>
  );
}
