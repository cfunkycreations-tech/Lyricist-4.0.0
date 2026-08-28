import React, { useState, useEffect } from 'react';
import performanceMonitor from '../engine/PerformanceMonitor';
import './PerformanceDiagnosticsModal.css';

/**
 * Performance Diagnostics Modal telemetry HUD
 * @param {Object} props
 * @param {Function} props.onClose
 */
export default function PerformanceDiagnosticsModal({ onClose }) {
  const [stats, setStats] = useState(performanceMonitor.getStats());

  useEffect(() => {
    // Poll the DSP engine stats real-time
    const interval = setInterval(() => {
      setStats({ ...performanceMonitor.getStats() });
    }, 100);
    return () => clearInterval(interval);
  }, []);

  const handleBufferSizeChange = (size) => {
    performanceMonitor.setBufferSize(size);
    setStats({ ...performanceMonitor.getStats() });
  };

  const clearUnderruns = () => {
    performanceMonitor.resetUnderruns();
    setStats({ ...performanceMonitor.getStats() });
  };

  // Determine 3-stage dynamic LED gradient color
  let ledColor = '#F0F8FF'; // Ice White
  if (stats.dspLoad > 85) {
    ledColor = '#E63946'; // Crimson Red
  } else if (stats.dspLoad > 50) {
    ledColor = '#FF9900'; // Warm Amber
  }

  const loadBarStyle = {
    width: `${Math.min(100, stats.dspLoad)}%`,
    background: ledColor,
    boxShadow: `0 0 10px ${ledColor}`,
  };

  return (
    <div className="gm-modal-overlay">
      <div className="gm-perf-modal">
        <div className="gm-perf-header">
          <h2>Performance Engine Telemetry</h2>
          <button className="gm-close-btn" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="gm-perf-content">
          <div className="gm-perf-section">
            <div className="gm-perf-label">DSP Load ({stats.dspLoad.toFixed(1)}%)</div>
            <div className="gm-dsp-bar-container">
              <div className="gm-dsp-bar-fill" style={loadBarStyle}></div>
            </div>
          </div>

          <div className="gm-perf-grid">
            <div className="gm-perf-box">
              <div className="gm-box-label">Underruns / Dropouts</div>
              <div className="gm-box-value underrun-val" style={{ color: stats.underruns > 0 ? '#E63946' : '#F0F8FF' }}>
                {stats.underruns}
              </div>
              <button className="gm-sm-btn" onClick={clearUnderruns}>Clear Counter</button>
            </div>

            <div className="gm-perf-box">
              <div className="gm-box-label">Round-Trip Latency</div>
              <div className="gm-box-value latency-val">
                {stats.latencyMs} ms
              </div>
              <div className="gm-box-sub">
                {stats.latencyMs < 6.0 ? 'Ultra Low Latency' : stats.latencyMs < 12.0 ? 'Low Latency' : 'Standard'}
              </div>
            </div>

            <div className="gm-perf-box">
              <div className="gm-box-label">Sample Rate</div>
              <div className="gm-box-value">{stats.sampleRate} Hz</div>
            </div>

            <div className="gm-perf-box">
              <div className="gm-box-label">Active DSP Nodes</div>
              <div className="gm-box-value">{stats.activeNodes}</div>
            </div>
          </div>

          <div className="gm-perf-section">
            <div className="gm-perf-label">Buffer Size (Samples)</div>
            <div className="gm-buffer-selector">
              {[64, 128, 256, 512, 1024].map((size) => (
                <button
                  key={size}
                  className={`gm-buffer-btn ${stats.bufferSize === size ? 'active' : ''}`}
                  onClick={() => handleBufferSizeChange(size)}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
