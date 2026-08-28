import React, { useState } from 'react';
import midiSynth from '../engine/MidiSynth';

/**
 * PianoRoll Component - Interactive MIDI editor
 */
export default function PianoRoll() {
  const [activeTool, setActiveTool] = useState('Select');
  const [quantize, setQuantize] = useState('1/16');

  // Generate piano keys
  const keys = Array.from({ length: 88 }).map((_, i) => {
    const noteNum = 87 - i; 
    const isBlack = [1, 3, 6, 8, 10].includes(noteNum % 12);
    const octave = Math.floor(noteNum / 12);
    const noteName = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][noteNum % 12];
    return { noteNum, isBlack, label: `${noteName}${octave}` };
  });

  return (
    <div style={styles.container}>
      <div style={styles.toolbar}>
        <div style={styles.toolGroup}>
          {['Select', 'Pencil', 'Eraser'].map(tool => (
            <button 
              key={tool}
              style={{
                ...styles.toolBtn,
                backgroundColor: activeTool === tool ? 'var(--gm-amber, #FF9900)' : '#222',
                color: activeTool === tool ? '#000' : '#aaa'
              }}
              onClick={() => setActiveTool(tool)}
            >
              {tool}
            </button>
          ))}
        </div>
        <div style={styles.toolGroup}>
          <span style={styles.label}>Quantize:</span>
          {['1/4', '1/8', '1/16'].map(q => (
            <button 
              key={q}
              style={{
                ...styles.toolBtn,
                backgroundColor: quantize === q ? '#444' : '#222',
              }}
              onClick={() => setQuantize(q)}
            >
              {q}
            </button>
          ))}
        </div>
        <div style={styles.toolGroup}>
          <span style={styles.label}>Waveform:</span>
          <select style={styles.select} onChange={e => midiSynth.setPreset({ waveform: e.target.value })}>
            <option value="sawtooth">Saw</option>
            <option value="square">Square</option>
            <option value="triangle">Triangle</option>
            <option value="sine">Sine</option>
          </select>
          <span style={styles.label}>Cutoff:</span>
          <input type="range" min="100" max="5000" defaultValue="1000" style={styles.slider} onChange={e => midiSynth.setPreset({ cutoff: Number(e.target.value) })} />
          <span style={styles.label}>Res:</span>
          <input type="range" min="0" max="20" step="0.1" defaultValue="1" style={styles.slider} onChange={e => midiSynth.setPreset({ resonance: Number(e.target.value) })} />
          <span style={styles.label}>Atk:</span>
          <input type="range" min="0" max="2" step="0.01" defaultValue="0.05" style={styles.slider} onChange={e => midiSynth.setPreset({ attack: Number(e.target.value) })} />
          <span style={styles.label}>Rel:</span>
          <input type="range" min="0" max="5" step="0.1" defaultValue="0.5" style={styles.slider} onChange={e => midiSynth.setPreset({ release: Number(e.target.value) })} />
        </div>
      </div>

      <div style={styles.editorArea}>
        <div style={styles.keyboard}>
          {keys.map((key) => (
            <div 
              key={key.noteNum} 
              onMouseDown={() => midiSynth.noteOn(key.noteNum, 100)}
              onMouseUp={() => midiSynth.noteOff(key.noteNum)}
              onMouseLeave={() => midiSynth.noteOff(key.noteNum)}
              style={{
                ...styles.key,
                backgroundColor: key.isBlack ? '#111' : '#eee',
                color: key.isBlack ? '#fff' : '#000',
                height: '24px',
              }}
            >
              {key.label.includes('C') && !key.label.includes('#') && (
                <span style={styles.keyLabel}>{key.label}</span>
              )}
            </div>
          ))}
        </div>
        <div style={styles.grid}>
          {/* Note Grid Canvas placeholder */}
          <div style={styles.gridCanvas}>
            <div 
              onMouseDown={() => midiSynth.noteOn(72, 100)} 
              onMouseUp={() => midiSynth.noteOff(72)} 
              onMouseLeave={() => midiSynth.noteOff(72)} 
              style={{...styles.noteEvent, top: '240px', left: '100px', width: '120px'}} 
            />
            <div 
              onMouseDown={() => midiSynth.noteOn(70, 80)} 
              onMouseUp={() => midiSynth.noteOff(70)} 
              onMouseLeave={() => midiSynth.noteOff(70)} 
              style={{...styles.noteEvent, top: '288px', left: '220px', width: '60px'}} 
            />
          </div>
          
          <div style={styles.velocityLane}>
            <div style={styles.velocityStemContainer}>
              <div style={{...styles.velocityStem, height: '80%', left: '100px', backgroundColor: 'var(--gm-crimson, #E63946)'}} />
              <div style={{...styles.velocityStem, height: '60%', left: '220px', backgroundColor: 'var(--gm-amber, #FF9900)'}} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: 'var(--gm-bg, #1a1a1a)',
    color: 'var(--gm-text, #e0e0e0)',
    fontFamily: 'Inter, Roboto, sans-serif',
  },
  toolbar: {
    height: '40px',
    backgroundColor: 'var(--gm-panel, #242424)',
    borderBottom: '1px solid var(--gm-border, #333)',
    display: 'flex',
    alignItems: 'center',
    padding: '0 16px',
    gap: '24px',
  },
  toolGroup: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
  },
  toolBtn: {
    border: '1px solid #444',
    borderRadius: '4px',
    padding: '4px 12px',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 'bold',
  },
  label: {
    fontSize: '12px',
    color: '#888',
  },
  select: {
    backgroundColor: '#222',
    color: '#fff',
    border: '1px solid #444',
    borderRadius: '4px',
    padding: '2px 4px',
    fontSize: '12px',
  },
  slider: {
    width: '60px',
  },
  editorArea: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
  keyboard: {
    width: '60px',
    overflowY: 'auto',
    borderRight: '1px solid var(--gm-border, #333)',
    backgroundColor: '#000',
  },
  key: {
    borderBottom: '1px solid #333',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingRight: '4px',
    boxSizing: 'border-box',
  },
  keyLabel: {
    fontSize: '10px',
    fontFamily: 'JetBrains Mono, monospace',
  },
  grid: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflowY: 'auto',
    overflowX: 'auto',
    backgroundColor: '#1c1c1c',
    backgroundImage: 'linear-gradient(#2a2a2a 1px, transparent 1px), linear-gradient(90deg, #2a2a2a 1px, transparent 1px)',
    backgroundSize: '100% 24px, 60px 100%',
  },
  gridCanvas: {
    flex: 1,
    minHeight: '2112px', /* 88 keys * 24px */
    position: 'relative',
  },
  noteEvent: {
    position: 'absolute',
    height: '22px',
    backgroundColor: 'var(--gm-ice-white, #F0F8FF)',
    border: '1px solid #fff',
    borderRadius: '2px',
    opacity: 0.8,
  },
  velocityLane: {
    height: '100px',
    backgroundColor: '#111',
    borderTop: '2px solid var(--gm-border, #333)',
    position: 'sticky',
    bottom: 0,
    zIndex: 10,
  },
  velocityStemContainer: {
    position: 'relative',
    height: '100%',
    width: '100%',
  },
  velocityStem: {
    position: 'absolute',
    bottom: 0,
    width: '4px',
    borderRadius: '2px 2px 0 0',
  }
};
