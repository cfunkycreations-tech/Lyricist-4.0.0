import React, { useState, useEffect } from 'react';
import './ChordPalette.css';
import chordProgressionEngine from '../engine/ChordProgressionEngine';

/**
 * ChordPalette Component - Smart Chord Progression Palette
 */
export default function ChordPalette() {
  const [rootKey, setRootKey] = useState('C');
  const [mode, setMode] = useState('Major');
  const [chords, setChords] = useState([]);
  const [activePreset, setActivePreset] = useState(null);

  useEffect(() => {
    updateChords();
  }, [rootKey, mode]);

  const updateChords = () => {
    const diatonicChords = chordProgressionEngine.getDiatonicChords(rootKey, mode);
    setChords(diatonicChords);
  };

  const handlePreset = (preset) => {
    setActivePreset(preset);
    // In a real app, this might highlight the pads or auto-play them
  };

  const playChord = (notes) => {
    // Mock midiSynth implementation
    console.log(`midiSynth.noteOn(${notes.join(', ')})`);
    setTimeout(() => {
      console.log(`midiSynth.noteOff(${notes.join(', ')})`);
    }, 500);
  };

  const dropToTimeline = (e, chord) => {
    e.stopPropagation();
    console.log(`Dropped chord ${chord.name} [${chord.notes.join(', ')}] to timeline`);
    // Mocks adding MIDI clip to selected track at playhead
  };

  return (
    <div className="chord-palette">
      <div className="cp-header">
        <div className="cp-controls">
          <div className="cp-select-group">
            <label>Root Key</label>
            <select className="cp-select" value={rootKey} onChange={(e) => setRootKey(e.target.value)}>
              {chordProgressionEngine.keys.map(k => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
          
          <div className="cp-select-group">
            <label>Mode</label>
            <select className="cp-select" value={mode} onChange={(e) => setMode(e.target.value)}>
              {chordProgressionEngine.modes.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>

        <div className="cp-presets">
          {Object.keys(chordProgressionEngine.presets).map(preset => (
            <button 
              key={preset}
              className={`cp-preset-btn ${activePreset === preset ? 'active' : ''}`}
              onClick={() => handlePreset(preset)}
            >
              {preset}
            </button>
          ))}
        </div>
      </div>

      <div className="cp-pads-container">
        {chords.map((chord, i) => (
          <div 
            key={i} 
            className="cp-pad"
            onMouseDown={() => playChord(chord.notes)}
          >
            <div className="cp-numeral">{chord.numeral}</div>
            <div className="cp-chord-name">{chord.name}</div>
            <button 
              className="cp-drop-btn" 
              onClick={(e) => dropToTimeline(e, chord)}
            >
              Drop to Timeline
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
