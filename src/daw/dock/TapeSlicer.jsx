import React, { useState, useEffect } from 'react';
import tapeSlicerEngine from '../engine/TapeSlicerEngine';

/**
 * TapeSlicer Component - Half-speed time/pitch DSP engine and Tape Slicer
 */
export default function TapeSlicer() {
  const [pitch, setPitch] = useState(0);
  const [tapeSlowdown, setTapeSlowdown] = useState(100);
  const [vinylBrake, setVinylBrake] = useState(false);
  const [activeTrigger, setActiveTrigger] = useState(null);

  useEffect(() => {
    tapeSlicerEngine.init();
  }, []);

  const handlePitchChange = (newPitch) => {
    setPitch(newPitch);
    tapeSlicerEngine.setPitchShift(newPitch);
  };

  const handleSlowdownChange = (e) => {
    const val = parseInt(e.target.value, 10);
    setTapeSlowdown(val);
    tapeSlicerEngine.setTapeSlowdown(val / 100);
  };

  const handleVinylBrake = () => {
    setVinylBrake(true);
    tapeSlicerEngine.triggerVinylBrake(1500, (factor) => {
      setTapeSlowdown(Math.round(factor * 100));
      if (factor <= 0) setVinylBrake(false);
    });
  };

  const handleTriggerPress = (trigger) => {
    setActiveTrigger(trigger);
    if (trigger === 'STUTTER' || trigger === 'REVERSE') {
      // Stub for advanced triggers
    } else {
      tapeSlicerEngine.triggerBeatChop(trigger, 120);
    }
  };

  const handleTriggerRelease = () => {
    setActiveTrigger(null);
    tapeSlicerEngine.stopBeatChop();
  };

  return (
    <div style={styles.container}>
      <div style={styles.dspEngine}>
        <div style={styles.sectionHeader}>DSP TAPE ENGINE</div>
        
        <div style={styles.engineControls}>
          <div style={styles.controlGroup}>
            <div style={styles.knobWrapper}>
              {/* Simplistic Pitch Knob Interaction via clicks for demonstration */}
              <div 
                style={{...styles.largeKnob, cursor: 'pointer', userSelect: 'none'}} 
                onClick={() => handlePitchChange(Math.min(12, pitch + 1))}
                onContextMenu={(e) => { e.preventDefault(); handlePitchChange(Math.max(-12, pitch - 1)); }}
                title="Left Click: +1 ST | Right Click: -1 ST"
              >
                PITCH
              </div>
            </div>
            <div style={styles.valueDisplay}>{pitch > 0 ? `+${pitch}` : pitch} ST</div>
          </div>
          
          <div style={styles.sliderGroup}>
            <div style={styles.sliderLabel}>TAPE SLOWDOWN</div>
            <input 
              type="range" 
              min="0" 
              max="100" 
              value={tapeSlowdown} 
              onChange={handleSlowdownChange}
              style={styles.slider}
            />
            <div style={styles.valueDisplay}>{tapeSlowdown}% WET</div>
          </div>

          <div style={styles.brakeGroup}>
            <button 
              style={{
                ...styles.brakeBtn,
                backgroundColor: vinylBrake ? 'var(--gm-crimson, #E63946)' : '#222',
                color: vinylBrake ? '#fff' : 'var(--gm-crimson, #E63946)',
              }}
              onMouseDown={handleVinylBrake}
            >
              VINYL BRAKE
            </button>
          </div>
        </div>
      </div>

      <div style={styles.slicerGrid}>
        <div style={styles.sectionHeader}>BEAT SLICE GRID</div>
        <div style={styles.triggerGrid}>
          {['1/4', '1/8', '1/8T', '1/16', '1/16T', '1/32', 'STUTTER', 'REVERSE'].map(trigger => (
            <button 
              key={trigger} 
              style={{
                ...styles.triggerBtn,
                backgroundColor: activeTrigger === trigger ? 'var(--gm-amber, #FF9900)' : '#222',
                color: activeTrigger === trigger ? '#000' : 'var(--gm-ice-white, #F0F8FF)',
              }}
              onMouseDown={() => handleTriggerPress(trigger)}
              onMouseUp={handleTriggerRelease}
              onMouseLeave={handleTriggerRelease}
            >
              {trigger}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    height: '100%',
    padding: '24px',
    backgroundColor: 'var(--gm-bg, #1a1a1a)',
    color: 'var(--gm-text, #e0e0e0)',
    fontFamily: 'Inter, Roboto, sans-serif',
    display: 'flex',
    gap: '32px',
  },
  dspEngine: {
    flex: 1,
    backgroundColor: 'var(--gm-panel, #242424)',
    border: '1px solid var(--gm-border, #333)',
    borderRadius: '8px',
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.5)',
  },
  sectionHeader: {
    fontSize: '16px',
    fontWeight: '800',
    color: 'var(--gm-amber, #FF9900)',
    letterSpacing: '2px',
    marginBottom: '24px',
    borderBottom: '1px solid #444',
    paddingBottom: '8px',
  },
  engineControls: {
    display: 'flex',
    alignItems: 'center',
    gap: '32px',
    flex: 1,
  },
  controlGroup: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
  },
  knobWrapper: {
    width: '80px',
    height: '80px',
    borderRadius: '50%',
    backgroundColor: '#111',
    border: '3px solid var(--gm-border, #444)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    boxShadow: '0 4px 8px rgba(0,0,0,0.4)',
  },
  largeKnob: {
    fontSize: '14px',
    fontWeight: 'bold',
    color: '#888',
  },
  valueDisplay: {
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: '14px',
    color: 'var(--gm-ice-white, #F0F8FF)',
    backgroundColor: '#111',
    padding: '4px 8px',
    borderRadius: '4px',
    border: '1px solid #333',
  },
  sliderGroup: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '16px',
  },
  sliderLabel: {
    fontSize: '12px',
    fontWeight: 'bold',
    color: '#aaa',
  },
  slider: {
    width: '100%',
    accentColor: 'var(--gm-amber, #FF9900)',
  },
  brakeGroup: {
    display: 'flex',
    alignItems: 'center',
  },
  brakeBtn: {
    width: '100px',
    height: '100px',
    borderRadius: '50%',
    border: '4px solid #444',
    fontWeight: '900',
    fontSize: '14px',
    cursor: 'pointer',
    boxShadow: '0 8px 16px rgba(0,0,0,0.5)',
    transition: 'all 0.1s',
  },
  slicerGrid: {
    flex: 1,
    backgroundColor: 'var(--gm-panel, #242424)',
    border: '1px solid var(--gm-border, #333)',
    borderRadius: '8px',
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
  },
  triggerGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gridTemplateRows: 'repeat(2, 1fr)',
    gap: '16px',
    flex: 1,
  },
  triggerBtn: {
    backgroundColor: '#222',
    border: '2px solid #444',
    borderRadius: '4px',
    color: 'var(--gm-ice-white, #F0F8FF)',
    fontSize: '16px',
    fontWeight: 'bold',
    fontFamily: 'JetBrains Mono, monospace',
    cursor: 'pointer',
    transition: 'background-color 0.1s',
  }
};
