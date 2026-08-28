import React, { useState, useEffect, useCallback } from 'react';
import './DrumPadSampler.css';
import samplerEngine from '../engine/SamplerEngine';

const KEY_MAPPINGS = [
  '1', '2', '3', '4',
  'q', 'w', 'e', 'r',
  'a', 's', 'd', 'f',
  'z', 'x', 'c', 'v'
];

export default function DrumPadSampler() {
  const [activeKit, setActiveKit] = useState('808 Trap Kit');
  const [selectedPad, setSelectedPad] = useState(0);
  const [hitPads, setHitPads] = useState({});
  const [, setForceRender] = useState(0);

  const handlePadTrigger = useCallback((index) => {
    samplerEngine.triggerPad(index);
    setSelectedPad(index);
    
    setHitPads(prev => ({ ...prev, [index]: true }));
    setTimeout(() => {
      setHitPads(prev => ({ ...prev, [index]: false }));
    }, 300);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      const index = KEY_MAPPINGS.indexOf(e.key.toLowerCase());
      if (index !== -1 && !e.repeat) {
        handlePadTrigger(index);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlePadTrigger]);

  const handleKitChange = (e) => {
    const kit = e.target.value;
    setActiveKit(kit);
    samplerEngine.switchKit(kit);
  };

  const padData = samplerEngine.pads[selectedPad];

  const handleParamChange = (param, value) => {
    samplerEngine.setPadParam(selectedPad, param, parseFloat(value) || 0);
    setForceRender(prev => prev + 1);
  };

  return (
    <div className="drum-sampler-container">
      <div className="drum-sampler-main">
        <div className="drum-sampler-header">
          <select className="kit-selector" value={activeKit} onChange={handleKitChange}>
            {samplerEngine.kits.map(kit => (
              <option key={kit} value={kit}>{kit}</option>
            ))}
          </select>
          <button className="record-btn">● Record Groove to Timeline</button>
        </div>
        
        <div className="pad-grid">
          {samplerEngine.pads.map((pad, idx) => (
            <div 
              key={idx} 
              className={`drum-pad ${hitPads[idx] ? 'hit active' : ''} ${selectedPad === idx ? 'selected' : ''}`}
              onMouseDown={() => handlePadTrigger(idx)}
              style={selectedPad === idx ? { borderColor: 'var(--gm-amber, #FF9900)' } : {}}
            >
              <span className="pad-name">{pad.name}</span>
              <span className="pad-hotkey">{KEY_MAPPINGS[idx].toUpperCase()}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="pad-inspector">
        <div className="inspector-title">Pad {selectedPad + 1}: {padData?.name}</div>
        
        <div className="param-group">
          <label className="param-label">Pitch (st)</label>
          <input 
            type="number" 
            className="param-input" 
            min="-24" max="24" 
            value={padData?.pitch || 0}
            onChange={(e) => handleParamChange('pitch', e.target.value)}
          />
        </div>

        <div className="param-group">
          <label className="param-label">Decay (s)</label>
          <input 
            type="number" 
            className="param-input" 
            min="0.05" max="3.0" step="0.05"
            value={padData?.decay || 0.5}
            onChange={(e) => handleParamChange('decay', e.target.value)}
          />
        </div>

        <div className="param-group">
          <label className="param-label">Volume (0-10)</label>
          <input 
            type="range" 
            className="param-input" 
            min="0" max="10" step="0.1"
            value={padData?.volume || 8}
            onChange={(e) => handleParamChange('volume', e.target.value)}
          />
        </div>

        <div className="param-group">
          <label className="param-label">Pan (-1 to 1)</label>
          <input 
            type="range" 
            className="param-input" 
            min="-1" max="1" step="0.1"
            value={padData?.pan || 0}
            onChange={(e) => handleParamChange('pan', e.target.value)}
          />
        </div>

        <div className="param-group">
          <label className="param-label">Choke Group</label>
          <select 
            className="param-input" 
            value={padData?.chokeGroup || 0}
            onChange={(e) => handleParamChange('chokeGroup', e.target.value)}
          >
            <option value="0">None (0)</option>
            <option value="1">Group 1</option>
            <option value="2">Group 2</option>
            <option value="3">Group 3</option>
          </select>
        </div>
      </div>
    </div>
  );
}
