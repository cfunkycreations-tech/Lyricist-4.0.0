import React, { useState } from 'react';
import './EulaModal.css';

/**
 * Proprietary EULA Modal for Lyricist 4.2.0 Pro
 * @param {Object} props
 * @param {Function} props.onClose - Function to close the modal
 */
export default function EulaModal({ onClose }) {
  const [activeTab, setActiveTab] = useState('commercial');

  return (
    <div className="gm-modal-overlay">
      <div className="gm-eula-modal">
        <div className="gm-modal-header">
          <h2>Lyricist 4.2.0 Pro</h2>
          <button className="gm-close-btn" onClick={onClose} aria-label="Close">×</button>
        </div>
        
        <div className="gm-eula-tabs">
          <button 
            className={`gm-tab-btn ${activeTab === 'commercial' ? 'active' : ''}`}
            onClick={() => setActiveTab('commercial')}
          >
            Commercial EULA
          </button>
          <button 
            className={`gm-tab-btn ${activeTab === 'third-party' ? 'active' : ''}`}
            onClick={() => setActiveTab('third-party')}
          >
            Third-Party Acknowledgements
          </button>
        </div>

        <div className="gm-eula-content">
          {activeTab === 'commercial' && (
            <div className="gm-eula-text">
              <h3>Proprietary Closed-Source License</h3>
              <p><strong>Funk Audio Flow OpSec [FAFO] (Austin, Texas)</strong></p>
              <p>
                This End-User License Agreement ("EULA") is a legal agreement between you 
                (either an individual or a single entity) and Funk Audio Flow OpSec [FAFO] 
                for the Lyricist 4.2.0 Pro software product.
              </p>
              <h4>1. Enterprise Commercial Usage</h4>
              <p>
                This license grants you the right to use Lyricist 4.2.0 Pro for commercial 
                audio production, broadcasting, and mastering.
              </p>
              <h4>2. Intellectual Property</h4>
              <p>
                All rights, title, and interest in and to the software, including the native audio 
                engine, DSP algorithms, and GUI elements, are owned by FAFO.
              </p>
              <h4>3. Zero-Telemetry Privacy Guarantees</h4>
              <p>
                Lyricist 4.2.0 Pro is strictly zero-telemetry. FAFO collects no usage data, 
                no audio samples, and no diagnostic information. Your sessions remain offline 
                and completely under your control.
              </p>
            </div>
          )}

          {activeTab === 'third-party' && (
            <div className="gm-eula-text">
              <h3>Third-Party Acknowledgements</h3>
              <p>Lyricist 4.2.0 Pro utilizes the following third-party technologies:</p>
              
              <h4>MiniMax-3 Neural Audio Synthesis</h4>
              <p>
                Neural synthesis engine licensed for real-time generative audio modeling.
              </p>

              <h4>Demucs Stem Separation</h4>
              <p>
                Advanced music source separation. Adapted for real-time internal bus routing.
              </p>

              <h4>FlexASIO (Universal Low-Latency Windows Driver)</h4>
              <p>
                Open-source universal ASIO driver (MIT License) by Etienne Dechamps, utilizing PortAudio
                and Windows WASAPI Exclusive/Shared modes. ASIO is a trademark and software of Steinberg Media Technologies GmbH.
              </p>

              <h4>JUCE Framework</h4>
              <p>
                Cross-platform C++ framework for audio applications and plug-ins. Used in native
                DSP core modules bridged via WebAssembly and headless IPC.
              </p>
            </div>
          )}
        </div>

        <div className="gm-modal-footer">
          <button className="gm-accept-btn" onClick={onClose}>I Accept / Close</button>
        </div>
      </div>
    </div>
  );
}
