import React, { useState, useEffect, useRef } from 'react';
import './GranularSynth.css';
import granularEngine from '../engine/GranularEngine';
import RotaryKnob from '../components/RotaryKnob';

/**
 * GranularSynth Component
 * High-DPI Canvas scanner with animated flying cloud particles and draggable position needle.
 */
export default function GranularSynth() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [params, setParams] = useState({
    grainSize: 100,
    density: 20,
    spray: 50,
    pitch: 0,
    position: 0.5,
    mix: 50
  });
  const canvasRef = useRef(null);

  // Initialize engine and draw loop
  useEffect(() => {
    let animationFrameId;
    
    const renderCanvas = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      const { width, height } = canvas;

      // Clear background
      ctx.fillStyle = '#1e1e1e';
      ctx.fillRect(0, 0, width, height);

      // Draw scanner needle
      const needleX = params.position * width;
      ctx.strokeStyle = 'var(--gm-crimson, #E63946)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(needleX, 0);
      ctx.lineTo(needleX, height);
      ctx.stroke();

      // Draw particles
      const particles = granularEngine.getGrainParticles();
      const now = Date.now();
      
      particles.forEach(p => {
        const age = now - p.startTime;
        const opacity = Math.max(0, 1 - (age / p.life));
        
        ctx.fillStyle = `rgba(240, 248, 255, ${opacity})`; // gm-ice-white
        
        const px = (p.x / 100) * width;
        const py = (p.y / 100) * height;
        const radius = (p.size / 500) * 10 + 2; // scale size

        ctx.beginPath();
        ctx.arc(px, py, radius, 0, Math.PI * 2);
        ctx.fill();
      });

      animationFrameId = window.requestAnimationFrame(renderCanvas);
    };

    renderCanvas();

    return () => {
      window.cancelAnimationFrame(animationFrameId);
    };
  }, [params.position]);

  const handleParamChange = (name, val) => {
    setParams(prev => ({ ...prev, [name]: val }));
    granularEngine.setParam(name, val);
  };

  const togglePlayback = () => {
    if (isPlaying) {
      granularEngine.stopCloud();
    } else {
      granularEngine.startCloud();
    }
    setIsPlaying(!isPlaying);
  };

  const applyPreset = (presetParams) => {
    Object.entries(presetParams).forEach(([k, v]) => {
      handleParamChange(k, v);
    });
  };

  return (
    <div className="granular-synth-container">
      <div className="granular-header">
        <h3>Granular Synthesis Cloud</h3>
        <div className="preset-buttons">
          <button onClick={() => applyPreset({ grainSize: 200, density: 10, spray: 80, pitch: 12, mix: 60 })}>Ethereal Vox</button>
          <button onClick={() => applyPreset({ grainSize: 20, density: 64, spray: 10, pitch: -5, mix: 80 })}>Glitch Shimmer</button>
          <button onClick={() => applyPreset({ grainSize: 500, density: 5, spray: 100, pitch: -12, mix: 100 })}>Deep Grain Drone</button>
        </div>
      </div>

      <div className="visualizer-panel">
        <canvas 
          ref={canvasRef} 
          width={800} 
          height={200} 
          className="waveform-canvas"
          onMouseMove={(e) => {
            if (e.buttons === 1) { // if left mouse button is pressed
              const rect = canvasRef.current.getBoundingClientRect();
              const x = e.clientX - rect.left;
              const pos = Math.max(0, Math.min(1, x / rect.width));
              handleParamChange('position', pos);
            }
          }}
          onMouseDown={(e) => {
            const rect = canvasRef.current.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const pos = Math.max(0, Math.min(1, x / rect.width));
            handleParamChange('position', pos);
          }}
        />
      </div>

      <div className="controls-panel">
        <RotaryKnob size={46} label="Grain Size" value={params.grainSize} min={10} max={500} onChange={(v) => handleParamChange('grainSize', v)} />
        <RotaryKnob size={46} label="Density" value={params.density} min={1} max={64} onChange={(v) => handleParamChange('density', v)} />
        <RotaryKnob size={46} label="Spray" value={params.spray} min={0} max={100} onChange={(v) => handleParamChange('spray', v)} />
        <RotaryKnob size={46} label="Pitch" value={params.pitch} min={-12} max={12} onChange={(v) => handleParamChange('pitch', v)} />
        <RotaryKnob size={46} label="Mix" value={params.mix} min={0} max={100} onChange={(v) => handleParamChange('mix', v)} />
        
        <button className={`audition-btn ${isPlaying ? 'active' : ''}`} onClick={togglePlayback}>
          {isPlaying ? 'Stop Cloud' : 'Audition'}
        </button>
      </div>
    </div>
  );
}
