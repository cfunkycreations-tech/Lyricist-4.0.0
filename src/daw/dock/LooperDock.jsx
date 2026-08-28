import React, { useState } from 'react';
import looperEngine from '../engine/LooperEngine';

/**
 * LooperDock Component - 4-Track Hardware Looper (RC-Funk style)
 */
export default function LooperDock() {
  const [tracks, setTracks] = useState([
    { id: 1, state: 'playing', level: 80, pan: 0 },
    { id: 2, state: 'recording', level: 100, pan: -20 },
    { id: 3, state: 'stopped', level: 60, pan: 20 },
    { id: 4, state: 'empty', level: 0, pan: 0 },
  ]);

  const loadDemoStacks = () => {
    setTracks(looperEngine.generateDemoLoop());
  };

  const getStateColor = (state) => {
    switch (state) {
      case 'recording': return 'var(--gm-crimson, #E63946)';
      case 'playing': return 'var(--gm-amber, #FF9900)';
      case 'empty': return '#333';
      default: return 'var(--gm-ice-white, #F0F8FF)';
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.masterControls}>
        <div style={styles.masterHeader}>MASTER SYNC</div>
        <div style={styles.bpmLock}>
          <span style={styles.bpm}>120.0 BPM</span>
          <button style={styles.lockBtn}>🔒</button>
        </div>
        <button style={styles.demoBtn} onClick={loadDemoStacks}>
          Load Demo Stacks
        </button>
      </div>
      
      <div style={styles.tracksContainer}>
        {tracks.map(track => (
          <div key={track.id} style={styles.track}>
            <div style={styles.trackHeader}>TRACK {track.id}</div>
            
            <div style={styles.transport}>
              <button onClick={() => looperEngine.record(track.id)} style={{...styles.btn, color: 'var(--gm-crimson, #E63946)'}}>●</button>
              <button onClick={() => looperEngine.play(track.id)} style={{...styles.btn, color: 'var(--gm-amber, #FF9900)'}}>▶</button>
              <button onClick={() => looperEngine.clear(track.id)} style={{...styles.btn, color: '#aaa'}}>■</button>
            </div>

            <div style={styles.modifiers}>
              <button onClick={() => looperEngine.reverse(track.id)} style={styles.modBtn}>REV</button>
              <button onClick={() => looperEngine.halfSpeed(track.id)} style={styles.modBtn}>1/2X</button>
              <button onClick={() => looperEngine.clear(track.id)} style={styles.modBtn}>CLR</button>
            </div>

            <div style={styles.faderSection}>
              <div style={styles.meterContainer}>
                <div style={{
                  ...styles.meterFill, 
                  height: `${track.level}%`, 
                  backgroundColor: getStateColor(track.state)
                }} />
              </div>
              <div style={styles.faderTrack}>
                <div style={{...styles.faderHandle, bottom: `${track.level}%`}} />
              </div>
            </div>

            <div style={styles.panControl}>
              <div style={styles.knobPlaceholder}>PAN</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const styles = {
  container: {
    height: '100%',
    padding: '16px',
    backgroundColor: 'var(--gm-bg, #1a1a1a)',
    color: 'var(--gm-text, #e0e0e0)',
    fontFamily: 'Inter, Roboto, sans-serif',
    display: 'flex',
    gap: '24px',
  },
  masterControls: {
    width: '150px',
    backgroundColor: 'var(--gm-panel, #242424)',
    border: '1px solid var(--gm-border, #333)',
    borderRadius: '4px',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
  },
  masterHeader: {
    fontSize: '12px',
    fontWeight: 'bold',
    color: '#888',
    textAlign: 'center',
    letterSpacing: '1px',
  },
  demoBtn: {
    backgroundColor: 'var(--gm-amber, #FF9900)',
    color: '#000',
    border: 'none',
    padding: '8px',
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: 'bold',
    fontSize: '12px',
    marginTop: 'auto',
  },
  bpmLock: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#111',
    padding: '8px',
    borderRadius: '4px',
    border: '1px solid #333',
  },
  bpm: {
    fontFamily: 'JetBrains Mono, monospace',
    color: 'var(--gm-ice-white, #F0F8FF)',
    fontSize: '14px',
  },
  lockBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '14px',
  },
  tracksContainer: {
    display: 'flex',
    gap: '16px',
    flex: 1,
  },
  track: {
    flex: 1,
    minWidth: '120px',
    maxWidth: '200px',
    backgroundColor: 'var(--gm-panel, #242424)',
    border: '1px solid var(--gm-border, #333)',
    borderRadius: '4px',
    padding: '12px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
  },
  trackHeader: {
    fontSize: '14px',
    fontWeight: 'bold',
    color: '#ddd',
  },
  transport: {
    display: 'flex',
    gap: '8px',
  },
  btn: {
    width: '32px',
    height: '32px',
    borderRadius: '4px',
    backgroundColor: '#1a1a1a',
    border: '1px solid #444',
    cursor: 'pointer',
    fontSize: '14px',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1)',
  },
  modifiers: {
    display: 'flex',
    gap: '4px',
    width: '100%',
  },
  modBtn: {
    flex: 1,
    backgroundColor: '#2a2a2a',
    border: '1px solid #444',
    color: '#aaa',
    fontSize: '10px',
    padding: '4px 0',
    cursor: 'pointer',
    borderRadius: '2px',
  },
  faderSection: {
    flex: 1,
    display: 'flex',
    gap: '12px',
    height: '150px',
    width: '100%',
    justifyContent: 'center',
  },
  meterContainer: {
    width: '12px',
    backgroundColor: '#111',
    borderRadius: '2px',
    position: 'relative',
    overflow: 'hidden',
    border: '1px solid #333',
  },
  meterFill: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    transition: 'height 0.1s',
  },
  faderTrack: {
    width: '6px',
    backgroundColor: '#111',
    borderRadius: '3px',
    position: 'relative',
  },
  faderHandle: {
    position: 'absolute',
    width: '24px',
    height: '12px',
    backgroundColor: '#444',
    border: '1px solid #666',
    borderRadius: '2px',
    left: '-9px',
    cursor: 'grab',
  },
  panControl: {
    width: '100%',
    display: 'flex',
    justifyContent: 'center',
  },
  knobPlaceholder: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    backgroundColor: '#111',
    border: '2px solid var(--gm-border, #333)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    fontSize: '10px',
    color: '#888',
  }
};
