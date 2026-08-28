import React, { useState } from 'react';
import './StemSeparator.css';
import { useDAW } from '../context/DAWContext';
import HardwareFader from '../components/HardwareFader';
import spectralDebleedEngine from '../engine/SpectralDebleedEngine';

export default function StemSeparator() {
  const { addTrack } = useDAW();
  const [file, setFile] = useState(null);
  const [mode, setMode] = useState('Local CPU');
  const [stemsMode, setStemsMode] = useState('4-stem');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [separated, setSeparated] = useState(false);
  const [debleedAmount, setDebleedAmount] = useState(50);
  const dbReduction = spectralDebleedEngine.calculateBleedReduction(debleedAmount / 100).toFixed(1);

  const [stemStates, setStemStates] = useState([
    { id: 'vocals', name: 'Vocals', volume: 7, muted: false, soloed: false, color: 'var(--gm-led-amber)', meter: 6.5 },
    { id: 'drums', name: 'Drums', volume: 7, muted: false, soloed: false, color: 'var(--gm-led-ice)', meter: 7.2 },
    { id: 'bass', name: 'Bass', volume: 7, muted: false, soloed: false, color: 'var(--gm-led-crimson)', meter: 5.8 },
    { id: 'other', name: 'Other', volume: 7, muted: false, soloed: false, color: 'var(--accent-violet, #A855F7)', meter: 4.1 },
  ]);

  const handleDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0].name);
      setSeparated(false);
    }
  };

  const handleProcess = () => {
    if (!file) return;
    setIsProcessing(true);
    setProgress(0);
    const interval = setInterval(() => {
      setProgress(p => {
        if (p >= 100) {
          clearInterval(interval);
          setIsProcessing(false);
          setSeparated(true);
          return 100;
        }
        return p + 10;
      });
    }, 200);
  };

  const handleExplode = () => {
    stemStates.forEach(stem => {
      addTrack('audio', stem.name);
    });
  };

  const updateStem = (idx, key, val) => {
    setStemStates(prev => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], [key]: val };
      return copy;
    });
  };

  const toggleSolo = (idx) => {
    setStemStates(prev => {
      const copy = [...prev];
      copy[idx].soloed = !copy[idx].soloed;
      return copy;
    });
  };

  return (
    <div className="stem-separator">
      <div className="stem-header">
        <h2 className="section-mark">Demucs Stem Separator</h2>
        <div className="stem-controls">
          <select value={mode} onChange={e => setMode(e.target.value)} className="stem-select">
            <option>Local CPU</option>
            <option>Cloud GPU (Replicate)</option>
          </select>
          <select value={stemsMode} onChange={e => setStemsMode(e.target.value)} className="stem-select">
            <option>4-stem (Vocals, Drums, Bass, Other)</option>
            <option>6-stem (adds Guitar, Keys)</option>
          </select>
        </div>
      </div>

      {!separated && (
        <div 
          className="stem-dropzone"
          onDragOver={e => e.preventDefault()}
          onDrop={handleDrop}
        >
          {isProcessing ? (
            <div className="stem-progress">
              <div className="stem-progress-bar" style={{ width: `${progress}%` }}></div>
              <span>Processing... {progress}%</span>
            </div>
          ) : (
            <div className="stem-drop-text">
              {file ? `Ready: ${file}` : 'Drop full mix audio track here'}
              {file && <button className="stem-btn" onClick={handleProcess}>Separate Stems</button>}
            </div>
          )}
        </div>
      )}

      {separated && (
        <div className="stem-mixer">
          <div className="stem-channels">
            {stemStates.map((stem, idx) => (
              <div key={stem.id} className="stem-channel">
                <div className="stem-name" style={{ color: stem.color }}>{stem.name}</div>
                <div className="stem-waveform">
                  {/* Fake waveform visualizer */}
                  <div className="fake-wave" style={{ backgroundColor: stem.color, opacity: 0.2 }} />
                  <div className="fake-wave" style={{ backgroundColor: stem.color, opacity: 0.5, height: '40%' }} />
                  <div className="fake-wave" style={{ backgroundColor: stem.color, opacity: 0.8, height: '80%' }} />
                  <div className="fake-wave" style={{ backgroundColor: stem.color, opacity: 0.5, height: '30%' }} />
                  <div className="fake-wave" style={{ backgroundColor: stem.color, opacity: 0.2 }} />
                </div>
                <div className="stem-channel-controls">
                  <button 
                    className={`stem-sm-btn ${stem.soloed ? 'solo-active' : ''}`}
                    onClick={() => toggleSolo(idx)}
                  >S</button>
                  <HardwareFader 
                    value={stem.volume}
                    onChange={(v) => updateStem(idx, 'volume', v)}
                    muted={stem.muted}
                    onMuteToggle={(m) => updateStem(idx, 'muted', m)}
                    meterLevel={stem.meter}
                    height={150}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="stem-actions" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginTop: '16px' }}>
            <div className="debleed-control" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ color: 'var(--gm-text-secondary)', fontSize: '12px', textTransform: 'uppercase' }}>Spectral De-Bleed</span>
              <input 
                type="range" 
                min="0" 
                max="100" 
                value={debleedAmount} 
                onChange={e => setDebleedAmount(e.target.value)} 
                style={{ width: '120px', accentColor: 'var(--gm-led-amber)' }} 
              />
              <span style={{ color: 'var(--gm-led-amber)', fontFamily: 'var(--gm-font-mono)', fontSize: '12px', width: '45px' }}>{debleedAmount}%</span>
              <span style={{ color: 'var(--gm-led-ice)', fontFamily: 'var(--gm-font-mono)', fontSize: '12px' }}>({dbReduction} dB)</span>
            </div>
            <button className="stem-btn explode-btn" onClick={handleExplode}>Explode to Timeline</button>
          </div>
        </div>
      )}
    </div>
  );
}
