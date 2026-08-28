import React, { useState, useEffect } from 'react';
import modulationMatrix from '../engine/ModulationMatrix';
import './MacroRack.css';

const RotaryKnob = ({ value, onChange, label, index }) => {
  const rotation = -135 + (value * 270);
  
  const handleDrag = (e) => {
    // simplified drag
    const updateVal = (moveEv) => {
      const delta = (e.clientY - moveEv.clientY) * 0.01;
      onChange(Math.max(0, Math.min(1, value + delta)));
    };
    
    const stopDrag = () => {
      window.removeEventListener('mousemove', updateVal);
      window.removeEventListener('mouseup', stopDrag);
    };
    
    window.addEventListener('mousemove', updateVal);
    window.addEventListener('mouseup', stopDrag);
  };

  return (
    <div className="macro-knob-container">
      <div 
        className="macro-knob" 
        onMouseDown={handleDrag}
      >
        <div 
          className="knob-indicator" 
          style={{ transform: `rotate(${rotation}deg)` }}
        />
      </div>
      <div className="macro-label">{label}</div>
      <div className="macro-value">{Math.round(value * 100)}%</div>
    </div>
  );
};

export default function MacroRack() {
  const [macros, setMacros] = useState(Array(8).fill(0));
  const [lfos, setLfos] = useState(modulationMatrix.getLFOs());
  const [mappings, setMappings] = useState(modulationMatrix.getMappings());
  
  useEffect(() => {
    const unsub = modulationMatrix.subscribe(() => {
      setMacros([...modulationMatrix.macros]);
      setLfos([...modulationMatrix.getLFOs()]);
      setMappings([...modulationMatrix.getMappings()]);
    });
    return unsub;
  }, []);

  const handleMacroChange = (index, val) => {
    modulationMatrix.setMacroValue(index, val);
  };

  return (
    <div className="macro-rack">
      <div className="rack-section macros-section">
        <h3>8-Macro Matrix</h3>
        <div className="macros-grid">
          {macros.map((val, i) => (
            <RotaryKnob 
              key={i} 
              index={i} 
              value={val} 
              label={`M${i + 1}`}
              onChange={(v) => handleMacroChange(i, v)} 
            />
          ))}
        </div>
      </div>
      
      <div className="rack-section lfo-section">
        <h3>LFO Generators</h3>
        <div className="lfo-cards">
          {lfos.map((lfo, i) => (
            <div key={lfo.id} className="lfo-card">
              <div className="lfo-header">
                <span>LFO {i + 1}</span>
                <span className="lfo-rate">{lfo.rate}</span>
              </div>
              <div className="lfo-display">
                <canvas width={120} height={40} className="lfo-canvas" />
                {/* Visualizer omitted for brevity */}
              </div>
              <div className="lfo-controls">
                <select 
                  value={lfo.waveform} 
                  onChange={(e) => modulationMatrix.updateLFO(i, { waveform: e.target.value })}
                >
                  <option value="sine">Sine</option>
                  <option value="triangle">Triangle</option>
                  <option value="saw">Saw</option>
                  <option value="square">Square</option>
                  <option value="sh">S&H</option>
                </select>
                <div className="depth-control">
                  D: {lfo.depth}%
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      
      <div className="rack-section mappings-section">
        <h3>Target Assignments</h3>
        <div className="mappings-table">
          <div className="table-header">
            <span>Source</span>
            <span>Target</span>
            <span>Param</span>
            <span>Min</span>
            <span>Max</span>
          </div>
          <div className="table-body">
            {mappings.length === 0 ? (
              <div className="no-mappings">No assignments. Drag macros to assign.</div>
            ) : (
              mappings.map(m => (
                <div key={m.id} className="mapping-row">
                  <span>{m.source}</span>
                  <span>{m.targetTrackId}</span>
                  <span>{m.param}</span>
                  <span>{m.min}%</span>
                  <span>{m.max}%</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
