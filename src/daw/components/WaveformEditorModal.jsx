import React, { useState, useRef, useEffect } from 'react';
import './WaveformEditorModal.css';

/**
 * @typedef {Object} Clip
 * @property {string} id
 * @property {string} name
 * @property {number} startTime
 * @property {number} duration
 * @property {number} fadeIn
 * @property {number} fadeOut
 * @property {Float32Array} [audioData] - Mock waveform data
 */

/**
 * Precision Audio Clip & Sample Editor Modal in Surgical Gunmetal styling.
 * @param {Object} props
 * @param {Clip} props.clip
 * @param {function(Clip): void} props.onSave
 * @param {function(): void} props.onClose
 */
const WaveformEditorModal = ({ clip, onSave, onClose }) => {
  const canvasRef = useRef(null);
  const [localClip, setLocalClip] = useState({ ...clip });
  const [isPlaying, setIsPlaying] = useState(false);

  // Constants for drawing
  const canvasWidth = 800;
  const canvasHeight = 300;

  // Draw waveform
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    // Clear background
    ctx.fillStyle = 'var(--gm-bg-canvas, #151519)';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    
    // Draw center line
    ctx.beginPath();
    ctx.moveTo(0, canvasHeight / 2);
    ctx.lineTo(canvasWidth, canvasHeight / 2);
    ctx.strokeStyle = 'var(--gm-border, #33333d)';
    ctx.stroke();

    // Mock waveform data if none exists
    const dataLen = 1000;
    const waveform = clip.audioData || Array.from({ length: dataLen }, () => (Math.random() * 2 - 1) * 0.8);

    // Draw waveform peaks
    ctx.beginPath();
    ctx.strokeStyle = 'var(--gm-ice-white, #F0F8FF)';
    ctx.lineWidth = 1;
    
    const step = Math.ceil(waveform.length / canvasWidth);
    
    for (let i = 0; i < canvasWidth; i++) {
      let min = 1.0;
      let max = -1.0;
      
      for (let j = 0; j < step; j++) {
        const idx = i * step + j;
        if (idx < waveform.length) {
          const val = waveform[idx];
          if (val < min) min = val;
          if (val > max) max = val;
        }
      }
      
      const yMin = (1 - min) * (canvasHeight / 2);
      const yMax = (1 - max) * (canvasHeight / 2);
      
      ctx.moveTo(i, yMin);
      ctx.lineTo(i, yMax);
    }
    ctx.stroke();

    // Draw Fades overlay (visual representation)
    const fadeWidth = 50; // mock value for visualization
    ctx.fillStyle = 'rgba(230, 57, 70, 0.2)'; // Crimson red with opacity
    ctx.fillRect(0, 0, fadeWidth, canvasHeight); // Fade In
    ctx.fillRect(canvasWidth - fadeWidth, 0, fadeWidth, canvasHeight); // Fade Out

  }, [localClip, clip.audioData]);

  const handleNormalize = () => {
    // In a real app, process the audio buffer to 0dB. Here we just update state.
    console.log('Normalizing audio...');
  };

  const handleReverse = () => {
    console.log('Reversing waveform...');
  };

  const handleTransientSlice = () => {
    console.log('Auto-slicing at transients...');
  };

  const togglePlay = () => {
    setIsPlaying(!isPlaying);
  };

  const handleSave = () => {
    onSave(localClip);
  };

  return (
    <div className="waveform-modal-overlay">
      <div className="waveform-modal-container">
        
        <div className="modal-header">
          <h2>Sample Editor: {localClip.name || 'Audio Clip'}</h2>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>

        <div className="modal-toolbar">
          <div className="tool-group">
            <button className="tool-btn" onClick={handleNormalize}>Normalize (0 dB)</button>
            <button className="tool-btn" onClick={handleReverse}>Reverse</button>
            <button className="tool-btn" onClick={handleTransientSlice}>Transient Auto-Slice</button>
          </div>
          <div className="playback-group">
            <button className={`play-btn ${isPlaying ? 'active' : ''}`} onClick={togglePlay}>
              {isPlaying ? '⏸ Pause' : '▶ Audition'}
            </button>
            <label className="loop-toggle">
              <input type="checkbox" defaultChecked /> Loop
            </label>
          </div>
        </div>

        <div className="editor-workspace">
          {/* Time Ruler mock */}
          <div className="time-ruler">
            <span>0:00</span>
            <span>0:01</span>
            <span>0:02</span>
            <span>0:03</span>
            <span>0:04</span>
          </div>

          <div className="canvas-wrapper">
            <canvas 
              ref={canvasRef} 
              width={canvasWidth} 
              height={canvasHeight} 
              className="waveform-canvas"
            />
            {/* Interactive Handles (DOM overlays over canvas for ease of implementation) */}
            <div className="trim-handle left" title="Trim Start" />
            <div className="trim-handle right" title="Trim End" />
            <div className="fade-handle left-fade" title="Fade In" />
            <div className="fade-handle right-fade" title="Fade Out" />
          </div>
        </div>

        <div className="modal-footer">
          <div className="timecode-readout">
            <span className="font-mono">Start: {localClip.startTime?.toFixed(3)}s</span>
            <span className="font-mono">Duration: {localClip.duration?.toFixed(3)}s</span>
          </div>
          <div className="footer-actions">
            <button className="btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn-primary" onClick={handleSave}>Save Changes</button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default WaveformEditorModal;
