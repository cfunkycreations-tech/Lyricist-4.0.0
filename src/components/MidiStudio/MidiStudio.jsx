import React, { useState, useEffect } from 'react';
import AudioToMidi from './AudioToMidi.jsx';
import Sequencer from './Sequencer.jsx';
import Visualizer from './Visualizer.jsx';
import SampleLibrary from './SampleLibrary.jsx';
import DrumMachine from './DrumMachine.jsx';

// MIDI Studio tab — Lyricist 4.1.3
// Audio → MIDI (basic-pitch, fully offline) feeding an offline piano-roll
// sequencer, with a Butterchurn/Milkdrop visualizer wired to the same audio
// bus. The sequence persists locally so it survives restarts.

const STORE_KEY = 'lyricistMidiStudio';

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

          <AudioToMidi onNotes={handleNotes} />

          {sourceName && (
            <div className="pill-green" style={{ padding: '7px 10px', borderRadius: 8, fontSize: '0.68rem' }}>
              ✓ Converted “{sourceName}” — {midi.notes.length} notes in the sequencer
            </div>
          )}
        </div>

        <div className="midi-main">
          <Sequencer midi={midi} setMidi={setMidi} userSample={userSample} />
          <DrumMachine />
          <SampleLibrary onUseSample={setUserSample} />
          <Visualizer />
        </div>
      </div>
    </div>
  );
}
