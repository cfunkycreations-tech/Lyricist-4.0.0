import React, { useState } from 'react';
import './PluginHostEditor.css';
import RotaryKnob from '../components/RotaryKnob';
import MasterVUMeter from '../components/MasterVUMeter';
import jucePluginWindowManager from '../services/JucePluginWindowManager';

export default function PluginHostEditor() {
  const [bypassed, setBypassed] = useState(false);
  const [preset, setPreset] = useState('Fat Moog Bass');
  const [toastMessage, setToastMessage] = useState('');
  const [params, setParams] = useState({
    cutoff: 5, // 0-10
    resonance: 3,
    attack: 1,
    decay: 4,
    sustain: 7,
    release: 3,
    drive: 6,
    mix: 5
  });

  const updateParam = (key, val) => {
    setParams(prev => ({ ...prev, [key]: val }));
  };

  const handleOpenNativeGui = async () => {
    setToastMessage('Opening Native GUI...');
    const success = await jucePluginWindowManager.openPluginWindow('plugin-vst3', 'inst-01');
    setToastMessage(success ? 'Native GUI Opened' : 'Failed to open GUI');
    setTimeout(() => setToastMessage(''), 3000);
  };

  const presets = [
    'Fat Moog Bass',
    'Surgical Notch EQ',
    'Lush Shimmer Reverb',
    'Tape Saturation'
  ];

  return (
    <div className="plugin-host">
      <div className="plugin-header">
        <h2 className="section-mark">VST3 Plugin Host</h2>
        {toastMessage && <span style={{ color: 'var(--gm-led-ice)', marginLeft: '10px' }}>{toastMessage}</span>}
        <div className="plugin-controls">
          <button 
            className="plugin-btn" 
            onClick={handleOpenNativeGui}
            style={{ marginRight: '10px', background: 'var(--gm-bg-panel)', color: 'var(--gm-text-primary)', border: '1px solid var(--gm-border-light)', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer' }}
          >
            🖥️ Open Native GUI Window
          </button>
          <select value={preset} onChange={(e) => setPreset(e.target.value)} className="plugin-select">
            {presets.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <button 
            className={`bypass-btn ${bypassed ? 'bypassed' : ''}`}
            onClick={() => setBypassed(!bypassed)}
          >
            {bypassed ? 'BYPASSED' : 'ACTIVE'}
          </button>
        </div>
      </div>

      <div className={`plugin-body ${bypassed ? 'is-bypassed' : ''}`}>
        <div className="plugin-meters">
          <div className="meter-block">
            <span className="meter-label">IN</span>
            <MasterVUMeter 
              leftLevel={bypassed ? 0 : 7.2} 
              rightLevel={bypassed ? 0 : 6.8} 
              compact={true} 
              showLabels={false} 
              showReadout={false} 
              width={100}
            />
          </div>
        </div>

        <div className="plugin-knobs">
          <div className="knob-group">
            <h4 className="knob-group-title">Filter</h4>
            <div className="knob-row">
              <RotaryKnob size={52} label="Cutoff" value={params.cutoff} onChange={(v) => updateParam('cutoff', v)} />
              <RotaryKnob size={52} label="Res (Q)" value={params.resonance} onChange={(v) => updateParam('resonance', v)} />
            </div>
          </div>

          <div className="knob-group">
            <h4 className="knob-group-title">Envelope</h4>
            <div className="knob-row">
              <RotaryKnob size={52} label="Attack" value={params.attack} onChange={(v) => updateParam('attack', v)} />
              <RotaryKnob size={52} label="Decay" value={params.decay} onChange={(v) => updateParam('decay', v)} />
              <RotaryKnob size={52} label="Sustain" value={params.sustain} onChange={(v) => updateParam('sustain', v)} />
              <RotaryKnob size={52} label="Release" value={params.release} onChange={(v) => updateParam('release', v)} />
            </div>
          </div>

          <div className="knob-group">
            <h4 className="knob-group-title">Output</h4>
            <div className="knob-row">
              <RotaryKnob size={52} label="Drive" value={params.drive} onChange={(v) => updateParam('drive', v)} />
              <RotaryKnob size={52} label="Mix" value={params.mix} onChange={(v) => updateParam('mix', v)} />
            </div>
          </div>
        </div>

        <div className="plugin-meters">
          <div className="meter-block">
            <span className="meter-label">OUT</span>
            <MasterVUMeter 
              leftLevel={bypassed ? 0 : (7.2 * (params.drive / 5))} 
              rightLevel={bypassed ? 0 : (6.8 * (params.drive / 5))} 
              compact={true} 
              showLabels={false} 
              showReadout={false} 
              width={100}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
