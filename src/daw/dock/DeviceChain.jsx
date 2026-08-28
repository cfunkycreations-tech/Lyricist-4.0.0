import React, { useState } from 'react';
import effectRackEngine from '../engine/EffectRackEngine';

/**
 * RotaryKnob Component
 */
const RotaryKnob = ({ size, value, min, max, label, unit, onChange, color = 'var(--gm-amber, #FF9900)' }) => {
  const percent = (value - min) / (max - min);
  const angle = percent * 270 - 135; // -135 to 135 degrees

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
      <div 
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          backgroundColor: '#111',
          border: '2px solid var(--gm-border, #333)',
          position: 'relative',
          cursor: 'pointer',
          boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)',
        }}
      >
        <div 
          style={{
            position: 'absolute',
            top: '4px',
            left: '50%',
            width: '2px',
            height: '10px',
            backgroundColor: color,
            transformOrigin: `50% ${size/2 - 4}px`,
            transform: `translateX(-50%) rotate(${angle}deg)`,
            boxShadow: `0 0 4px ${color}`,
          }}
        />
      </div>
      <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '10px', color: '#aaa', textAlign: 'center' }}>
        <div style={{ fontSize: '9px', color: '#777', textTransform: 'uppercase' }}>{label}</div>
        {value}{unit}
      </div>
    </div>
  );
};

/**
 * DeviceChain Component - Active VST3 Device Chain rack for the selected track.
 * 4-unit rack: Parametric 4-Band EQ, Studio Compressor, Stereo Delay, Studio Reverb.
 */
export default function DeviceChain() {
  const [plugins, setPlugins] = useState([
    { id: 'eq', name: '4-Band Parametric EQ', bypassed: false, color: 'var(--gm-ice-white, #F0F8FF)', params: { freq1: 80, freq2: 400, freq3: 2500, freq4: 10000 } },
    { id: 'comp', name: 'Studio Compressor', bypassed: false, color: 'var(--gm-amber, #FF9900)', params: { threshold: -24, ratio: 12, attack: 3, makeup: 0 } },
    { id: 'delay', name: 'Stereo Delay', bypassed: false, color: 'var(--gm-crimson, #E63946)', params: { time: 500, feedback: 30, mix: 50 } },
    { id: 'reverb', name: 'Studio Reverb', bypassed: false, color: 'var(--gm-ice-white, #F0F8FF)', params: { size: 100, preDelay: 20, mix: 20 } },
  ]);

  const toggleBypass = (id) => {
    setPlugins(plugins.map(p => {
      if (p.id === id) {
        effectRackEngine.toggleBypass('master', id, !p.bypassed);
        return { ...p, bypassed: !p.bypassed };
      }
      return p;
    }));
  };

  const renderKnobs = (plugin) => {
    if (plugin.id === 'eq') {
      return (
        <div style={styles.knobsRow}>
          <RotaryKnob size={48} value={plugin.params.freq1} min={20} max={200} label="Low" unit="Hz" color={plugin.color} />
          <RotaryKnob size={48} value={plugin.params.freq2} min={200} max={1000} label="L-Mid" unit="Hz" color={plugin.color} />
          <RotaryKnob size={48} value={plugin.params.freq3} min={1000} max={5000} label="H-Mid" unit="Hz" color={plugin.color} />
          <RotaryKnob size={48} value={plugin.params.freq4} min={5000} max={20000} label="High" unit="Hz" color={plugin.color} />
        </div>
      );
    }
    if (plugin.id === 'comp') {
      return (
        <div style={styles.knobsRow}>
          <RotaryKnob size={48} value={plugin.params.threshold} min={-60} max={0} label="Thresh" unit="dB" color={plugin.color} />
          <RotaryKnob size={48} value={plugin.params.ratio} min={1} max={20} label="Ratio" unit=":1" color={plugin.color} />
          <RotaryKnob size={48} value={plugin.params.attack} min={0} max={100} label="Attck" unit="ms" color={plugin.color} />
          <RotaryKnob size={48} value={plugin.params.makeup} min={-12} max={24} label="Gain" unit="dB" color={plugin.color} />
        </div>
      );
    }
    if (plugin.id === 'delay') {
      return (
        <div style={styles.knobsRow}>
          <RotaryKnob size={48} value={plugin.params.time} min={1} max={2000} label="Time" unit="ms" color={plugin.color} />
          <RotaryKnob size={48} value={plugin.params.feedback} min={0} max={100} label="Fdbk" unit="%" color={plugin.color} />
          <RotaryKnob size={48} value={plugin.params.mix} min={0} max={100} label="Mix" unit="%" color={plugin.color} />
        </div>
      );
    }
    if (plugin.id === 'reverb') {
      return (
        <div style={styles.knobsRow}>
          <RotaryKnob size={48} value={plugin.params.size} min={0} max={100} label="Size" unit="%" color={plugin.color} />
          <RotaryKnob size={48} value={plugin.params.preDelay} min={0} max={100} label="Pre" unit="ms" color={plugin.color} />
          <RotaryKnob size={48} value={plugin.params.mix} min={0} max={100} label="Mix" unit="%" color={plugin.color} />
        </div>
      );
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.rackContainer}>
        {plugins.map((plugin) => (
          <div key={plugin.id} style={{ ...styles.rackSlot, opacity: plugin.bypassed ? 0.6 : 1 }}>
            <div style={styles.slotHeader}>
              <span style={styles.pluginName}>{plugin.name}</span>
              <button 
                style={{ ...styles.bypassBtn, backgroundColor: plugin.bypassed ? 'var(--gm-crimson, #E63946)' : plugin.color }}
                onClick={() => toggleBypass(plugin.id)}
              >
                {plugin.bypassed ? 'BYPASS' : 'ON'}
              </button>
            </div>
            
            {renderKnobs(plugin)}

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
    overflowX: 'auto',
  },
  rackContainer: {
    display: 'flex',
    gap: '12px',
    alignItems: 'stretch',
  },
  rackSlot: {
    minWidth: '260px',
    backgroundColor: 'var(--gm-panel, #242424)',
    border: '1px solid var(--gm-border, #333333)',
    borderRadius: '4px',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), 0 4px 6px rgba(0,0,0,0.3)',
  },
  slotHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: '1px solid #333',
    paddingBottom: '8px',
  },
  pluginName: {
    fontWeight: 600,
    fontSize: '14px',
    color: 'var(--gm-ice-white, #F0F8FF)',
  },
  bypassBtn: {
    border: 'none',
    borderRadius: '2px',
    padding: '4px 8px',
    fontSize: '10px',
    fontWeight: 'bold',
    color: '#000',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  knobsRow: {
    display: 'flex',
    justifyContent: 'space-around',
    flex: 1,
    alignItems: 'center',
  },
};
