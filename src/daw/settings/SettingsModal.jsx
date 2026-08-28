import React from 'react';
import './SettingsModal.css';
import { useDAW } from '../context/DAWContext';

/**
 * SettingsModal Component - Surgical Gunmetal dark settings modal
 */
export default function SettingsModal({ onClose }) {
  const { aiConfig, setAIEnabled } = useDAW();
  const aiEngineOn = aiConfig?.enabled ?? true;

  return (
    <div className="gm-modal-overlay">
      <div className="gm-modal">
        <div className="gm-modal-header">
          <h2>LYRICIST 4.2.0 PRO SETTINGS</h2>
          <button className="gm-close-btn" onClick={onClose}>×</button>
        </div>
        
        <div className="gm-modal-content">
          {/* Funk Matrix Engine Configuration */}
          <section className="gm-settings-section">
            <h3>FUNK MATRIX ENGINE</h3>
            
            <div className="gm-setting-row">
              <span>Global AI Engine</span>
              <button 
                className={`gm-toggle-btn ${aiEngineOn ? 'on' : 'off'}`}
                onClick={() => setAIEnabled(!aiEngineOn)}
              >
                {aiEngineOn ? 'ON' : 'OFF (KILLSWITCH)'}
              </button>
            </div>

            <div className={`gm-ai-configs ${aiEngineOn ? '' : 'disabled'}`}>
              <div className="gm-setting-row">
                <span>Multi-Model Routing</span>
                <select className="gm-select" disabled={!aiEngineOn}>
                  <option>MiniMax (Primary)</option>
                  <option>Liquid AI (Experimental)</option>
                  <option>Replicate (Legacy)</option>
                </select>
              </div>

              <div className="gm-setting-row">
                <span>OpenRouter API Key</span>
                <input type="password" placeholder="sk-or-..." className="gm-input" disabled={!aiEngineOn} />
              </div>
              <div className="gm-setting-row">
                <span>Replicate API Key</span>
                <input type="password" placeholder="r8_..." className="gm-input" disabled={!aiEngineOn} />
              </div>
            </div>
          </section>

          {/* Audio & ASIO Engine */}
          <section className="gm-settings-section">
            <h3>AUDIO & ASIO ENGINE</h3>
            <div className="gm-setting-row">
              <span>Driver</span>
              <select className="gm-select">
                <option>ASIO4ALL v2</option>
                <option>Windows Low Latency</option>
                <option>DirectSound</option>
              </select>
            </div>
            <div className="gm-setting-row">
              <span>Sample Rate</span>
              <select className="gm-select">
                <option>44.1 kHz</option>
                <option>48.0 kHz</option>
                <option>96.0 kHz</option>
              </select>
            </div>
            <div className="gm-setting-row">
              <span>Buffer Size</span>
              <select className="gm-select">
                <option>64 Samples</option>
                <option>128 Samples</option>
                <option>256 Samples</option>
                <option>512 Samples</option>
              </select>
            </div>
            <div className="gm-latency-readout">
              Estimated Latency: <span className="gm-highlight">2.9 ms</span>
            </div>
          </section>

          {/* Third-Party Acknowledgements & Licensing */}
          <section className="gm-settings-section gm-legal-section">
            <h3>LICENSING & OPSEC</h3>
            <p className="gm-legal-text">
              <strong>PROPRIETARY COMMERCIAL EULA:</strong> Funk Audio Flow OpSec active. Unauthorized redistribution of generated stems is strictly monitored.
            </p>
            <p className="gm-legal-text">
              <strong>ATTRIBUTION:</strong> Powered by MiniMax-3 audio generation engine. Incorporates open-source models under Apache 2.0.
            </p>
          </section>

        </div>
      </div>
    </div>
  );
}
