import React, { useState, useEffect } from 'react';
import './ExportModal.css';
import MasteringEngine from './MasteringEngine';

/**
 * Surgical Gunmetal Audio Export Modal for Lyricist 4.2.0 Pro.
 * @param {Object} props
 * @param {Function} props.onClose - Callback to close the modal.
 */
export default function ExportModal({ onClose }) {
  const [format, setFormat] = useState('wav-broadcast');
  const [targetLUFS, setTargetLUFS] = useState('-14');
  const [metadata, setMetadata] = useState({
    title: 'Untitled Master',
    artist: 'Unknown Artist',
    key: 'C Min',
    tempo: '120',
  });
  const [embedLyrics, setEmbedLyrics] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [progress, setProgress] = useState(0);

  // Simulated live metering readout
  const [meters, setMeters] = useState({
    integratedLUFS: -14.2,
    truePeak: -0.8,
    dynamicRange: 8.5,
    phaseCorrelation: 0.92
  });

  // Mock metering updates to feel "live"
  useEffect(() => {
    const interval = setInterval(() => {
      if (!isRendering) {
        setMeters(prev => ({
          integratedLUFS: prev.integratedLUFS + (Math.random() * 0.2 - 0.1),
          truePeak: prev.truePeak + (Math.random() * 0.1 - 0.05),
          dynamicRange: prev.dynamicRange + (Math.random() * 0.4 - 0.2),
          phaseCorrelation: Math.min(1, Math.max(-1, prev.phaseCorrelation + (Math.random() * 0.02 - 0.01)))
        }));
      }
    }, 500);
    return () => clearInterval(interval);
  }, [isRendering]);

  const handleMetadataChange = (e) => {
    const { name, value } = e.target;
    setMetadata(prev => ({ ...prev, [name]: value }));
  };

  const handleRender = async () => {
    setIsRendering(true);
    setProgress(0);

    try {
      const blob = await MasteringEngine.exportMaster({
        tracks: [],
        bpm: parseFloat(metadata.tempo),
        key: metadata.key,
        title: metadata.title,
        artist: metadata.artist,
        format,
        targetLUFS,
        embedLyrics,
        onProgress: (val) => setProgress(val * 100)
      });

      // Automatic file download trigger
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${metadata.title} - ${metadata.artist} Master.wav`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      onClose();
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setIsRendering(false);
    }
  };

  const getMeterColorClass = (val, threshold, inverted = false) => {
    if (inverted) {
      if (val < threshold.safe) return 'danger';
      if (val < threshold.warn) return 'warning';
      return 'safe';
    }
    if (val > threshold.danger) return 'danger';
    if (val > threshold.warn) return 'warning';
    return 'safe';
  };

  return (
    <div className="export-modal-overlay">
      <div className="export-modal">
        <div className="export-modal-header">
          <h2>Mastering & Audio Export Suite</h2>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>

        <div className="export-modal-body">
          <div className="export-left-panel">
            <div className="format-selector form-group">
              <label>Export Format</label>
              <div className="format-tabs">
                {[
                  { id: 'wav-broadcast', label: 'Broadcast WAV (24-bit/48k)' },
                  { id: 'wav-streaming', label: 'Streaming WAV (16-bit/44.1k)' },
                  { id: 'mp3-320', label: 'MP3 (320 kbps)' },
                  { id: 'stems-zip', label: 'Multitrack Stems (.zip)' }
                ].map(f => (
                  <div
                    key={f.id}
                    className={`format-tab ${format === f.id ? 'active' : ''}`}
                    onClick={() => setFormat(f.id)}
                  >
                    {f.label}
                  </div>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label>Loudness Target</label>
              <select value={targetLUFS} onChange={(e) => setTargetLUFS(e.target.value)}>
                <option value="-14">-14.0 LUFS (Spotify / Apple Music / YouTube)</option>
                <option value="-9">-9.0 LUFS (Club / DJ / Electronic)</option>
                <option value="-16">-16.0 LUFS (Podcast / Broadcast)</option>
                <option value="original">Original Dynamics (No Normalization)</option>
              </select>
            </div>

            <div className="metering-readout">
              <div className="meter-item">
                <span className="meter-label">Integrated LUFS</span>
                <span className={`meter-value ${getMeterColorClass(meters.integratedLUFS, { warn: -12, danger: -9 })}`}>
                  {meters.integratedLUFS.toFixed(1)} LUFS
                </span>
              </div>
              <div className="meter-item">
                <span className="meter-label">True Peak dB</span>
                <span className={`meter-value ${getMeterColorClass(meters.truePeak, { warn: -0.5, danger: -0.1 })}`}>
                  {meters.truePeak.toFixed(1)} dBTP
                </span>
              </div>
              <div className="meter-item">
                <span className="meter-label">Dynamic Range</span>
                <span className="meter-value safe">{meters.dynamicRange.toFixed(1)} DR</span>
              </div>
              <div className="meter-item">
                <span className="meter-label">Phase Correlation</span>
                <span className={`meter-value ${getMeterColorClass(meters.phaseCorrelation, { safe: 0, warn: 0.5 }, true)}`}>
                  {meters.phaseCorrelation > 0 ? '+' : ''}{meters.phaseCorrelation.toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          <div className="export-right-panel">
            <div className="form-group">
              <label>Song Title</label>
              <input type="text" name="title" value={metadata.title} onChange={handleMetadataChange} />
            </div>
            <div className="form-group">
              <label>Artist Name</label>
              <input type="text" name="artist" value={metadata.artist} onChange={handleMetadataChange} />
            </div>
            <div style={{ display: 'flex', gap: '15px' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Key</label>
                <input type="text" name="key" value={metadata.key} onChange={handleMetadataChange} />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Tempo (BPM)</label>
                <input type="text" name="tempo" value={metadata.tempo} onChange={handleMetadataChange} />
              </div>
            </div>
            
            <label className="checkbox-group" style={{ marginTop: '10px' }}>
              <input 
                type="checkbox" 
                checked={embedLyrics} 
                onChange={(e) => setEmbedLyrics(e.target.checked)} 
              />
              Embed Synced Lyrics & OpSec EULA
            </label>
          </div>
        </div>

        <div className="export-modal-footer">
          {isRendering && (
            <div className="progress-container">
              <div className="progress-bar" style={{ width: `${progress}%` }}></div>
            </div>
          )}
          <button 
            className="render-btn" 
            onClick={handleRender}
            disabled={isRendering}
          >
            {isRendering ? `Rendering... ${Math.round(progress)}%` : 'Render & Export Master'}
          </button>
        </div>
      </div>
    </div>
  );
}
