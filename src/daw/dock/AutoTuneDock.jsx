import React, { useState, useEffect, useRef } from 'react';
import './AutoTuneDock.css';
import autoTuneEngine from '../engine/AutoTuneEngine';

/**
 * Custom Rotary Knob for Surgical Gunmetal UI
 */
const RotaryKnob = ({ size = 48, min, max, value, onChange, format = v => v }) => {
  const [isDragging, setIsDragging] = useState(false);
  const startY = useRef(0);
  const startVal = useRef(0);

  const handleMouseDown = (e) => {
    setIsDragging(true);
    startY.current = e.clientY;
    startVal.current = value;
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging) return;
      const deltaY = startY.current - e.clientY;
      const range = max - min;
      // 100 pixels = full range
      let newVal = startVal.current + (deltaY / 100) * range;
      newVal = Math.max(min, Math.min(max, newVal));
      onChange(newVal);
    };

    const handleMouseUp = () => setIsDragging(false);

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, min, max, onChange]);

  // Calculate rotation (-135deg to +135deg)
  const pct = (value - min) / (max - min);
  const rotation = -135 + pct * 270;

  return (
    <div 
      className="rotary-knob-wrapper"
      style={{ width: size, height: size }}
      onMouseDown={handleMouseDown}
    >
      <div 
        className="rotary-knob-indicator" 
        style={{ transform: `rotate(${rotation}deg)` }} 
      />
    </div>
  );
};

/**
 * AutoTuneDock Component
 */
export default function AutoTuneDock() {
  const [settings, setSettings] = useState(autoTuneEngine.settings);
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const telemetryHistory = useRef([]);

  // Apply settings to engine
  useEffect(() => {
    autoTuneEngine.updateSettings(settings);
  }, [settings]);

  // Canvas Oscilloscope Drawing
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    const resizeCanvas = () => {
      const parent = canvas.parentElement;
      canvas.width = parent.clientWidth * window.devicePixelRatio;
      canvas.height = parent.clientHeight * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    const draw = () => {
      const data = autoTuneEngine.getLivePitchTelemetry();
      
      // Store history
      telemetryHistory.current.push(data);
      if (telemetryHistory.current.length > 200) {
        telemetryHistory.current.shift();
      }

      const width = canvas.width / window.devicePixelRatio;
      const height = canvas.height / window.devicePixelRatio;

      // Clear
      ctx.clearRect(0, 0, width, height);

      // Draw grid lines
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.lineWidth = 1;
      for (let i = 0; i < height; i += 20) {
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(width, i);
        ctx.stroke();
      }

      const getCenterY = (freq) => {
        // Map 400Hz - 500Hz for demonstration visualization
        const minF = 400;
        const maxF = 500;
        const clamped = Math.max(minF, Math.min(maxF, freq));
        const pct = (clamped - minF) / (maxF - minF);
        return height - (pct * height);
      };

      // Draw original pitch ribbon
      ctx.beginPath();
      ctx.strokeStyle = '#F0F8FF'; // Ice White
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.5;
      telemetryHistory.current.forEach((point, i) => {
        const x = (i / 200) * width;
        const y = getCenterY(point.detectedFreq);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();

      // Draw corrected pitch ribbon
      ctx.beginPath();
      ctx.strokeStyle = '#FF9900'; // Warm Amber
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.9;
      telemetryHistory.current.forEach((point, i) => {
        const x = (i / 200) * width;
        const y = getCenterY(point.retunedFreq);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();

      ctx.globalAlpha = 1.0;
      animationRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      cancelAnimationFrame(animationRef.current);
    };
  }, []);

  // Update telemetry display manually if we need to show precise numbers
  const [liveInfo, setLiveInfo] = useState({ noteName: '-', centsDeviation: 0 });
  useEffect(() => {
    const interval = setInterval(() => {
      const data = telemetryHistory.current[telemetryHistory.current.length - 1];
      if (data) {
        setLiveInfo({
          noteName: data.noteName,
          centsDeviation: data.centsDeviation.toFixed(1)
        });
      }
    }, 100);
    return () => clearInterval(interval);
  }, []);

  const updateSetting = (key, val) => {
    setSettings(prev => ({ ...prev, [key]: val }));
  };

  return (
    <div className="autotune-dock">
      <div className="at-controls-panel">
        <div className="at-header">
          <span className="at-title">Vocal Engine</span>
          <button 
            className={`at-bypass ${settings.bypass ? 'active' : ''}`}
            onClick={() => updateSetting('bypass', !settings.bypass)}
          >
            {settings.bypass ? 'BYPASSED' : 'ACTIVE'}
          </button>
        </div>

        <div className="at-dropdowns">
          <select 
            className="at-select" 
            value={settings.key} 
            onChange={(e) => updateSetting('key', e.target.value)}
          >
            {['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'].map(k => (
              <option key={k} value={k}>Key: {k}</option>
            ))}
          </select>
          <select 
            className="at-select" 
            value={settings.scale}
            onChange={(e) => updateSetting('scale', e.target.value)}
          >
            <option value="Chromatic">Chromatic</option>
            <option value="Major">Major</option>
            <option value="Minor">Minor</option>
            <option value="Pentatonic">Pentatonic</option>
            <option value="Project Key">Project Key</option>
          </select>
        </div>

        <div className="at-knobs-row">
          <div className="at-knob-container">
            <span className="at-knob-label">Speed</span>
            <RotaryKnob 
              size={48} min={0} max={100} 
              value={settings.retuneSpeed} 
              onChange={(v) => updateSetting('retuneSpeed', v)} 
            />
            <span className="at-knob-value">{Math.round(settings.retuneSpeed)} ms</span>
          </div>
          
          <div className="at-knob-container">
            <span className="at-knob-label">Human</span>
            <RotaryKnob 
              size={48} min={0} max={100} 
              value={settings.humanize} 
              onChange={(v) => updateSetting('humanize', v)} 
            />
            <span className="at-knob-value">{Math.round(settings.humanize)}%</span>
          </div>

          <div className="at-knob-container">
            <span className="at-knob-label">Formant</span>
            <RotaryKnob 
              size={48} min={-12} max={12} 
              value={settings.formantShift} 
              onChange={(v) => updateSetting('formantShift', v)} 
            />
            <span className="at-knob-value">{Math.round(settings.formantShift)} st</span>
          </div>

          <div className="at-knob-container">
            <span className="at-knob-label">Detune</span>
            <RotaryKnob 
              size={48} min={-50} max={50} 
              value={settings.detune} 
              onChange={(v) => updateSetting('detune', v)} 
            />
            <span className="at-knob-value">{Math.round(settings.detune)} c</span>
          </div>
        </div>
      </div>

      <div className="at-oscilloscope-panel">
        <div className="at-telemetry-overlay">
          <p className="at-telemetry-text">Note: <span>{liveInfo.noteName}</span></p>
          <p className="at-telemetry-text">Dev: <span>{liveInfo.centsDeviation} c</span></p>
        </div>
        <div className="at-canvas-container">
          <canvas ref={canvasRef} className="at-canvas" />
        </div>
      </div>
    </div>
  );
}
