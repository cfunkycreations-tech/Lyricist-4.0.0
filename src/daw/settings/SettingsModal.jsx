import React, { useState, useEffect } from 'react';
import './SettingsModal.css';
import { useDAW } from '../context/DAWContext';

const POPULAR_MODELS = [
  { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet (Recommended - Best Lyrical Flow)' },
  { id: 'openai/gpt-4o', name: 'GPT-4o (High Creativity & Rhyme Meter)' },
  { id: 'deepseek/deepseek-r1', name: 'DeepSeek R1 (Lyrical Reasoning & Verse Logic)' },
  { id: 'google/gemini-2.0-flash-001', name: 'Gemini 2.0 Flash (Ultra-Fast Low Latency)' },
  { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B Instruct (Open-Source Powerhouse)' },
  { id: 'minimax/minimax-01', name: 'MiniMax-01 (Audio & Lyric Structuring)' },
  { id: 'mistralai/mistral-large', name: 'Mistral Large (Complex Metaphors & Prose)' },
  { id: 'qwen/qwen-2.5-72b-instruct', name: 'Qwen 2.5 72B (Multilingual & Rhythm)' },
  { id: 'custom', name: '✏️ Custom / Other OpenRouter Model...' }
];

/**
 * SettingsModal Component - Surgical Gunmetal dark settings modal with API key vault and model selector
 */
export default function SettingsModal({ onClose }) {
  const { aiConfig, setAIEnabled } = useDAW();
  const aiEngineOn = aiConfig?.enabled ?? true;

  const [openRouterKey, setOpenRouterKey] = useState(localStorage.getItem('openRouterApiKey') || '');
  const [openRouterModel, setOpenRouterModel] = useState(localStorage.getItem('openRouterModel') || 'anthropic/claude-3.5-sonnet');
  const [customModel, setCustomModel] = useState(localStorage.getItem('customOpenRouterModel') || '');
  const [isCustom, setIsCustom] = useState(!POPULAR_MODELS.some(m => m.id === (localStorage.getItem('openRouterModel') || 'anthropic/claude-3.5-sonnet')));
  const [temperature, setTemperature] = useState(parseFloat(localStorage.getItem('aiTemperature') || '0.7'));
  const [maxTokens, setMaxTokens] = useState(parseInt(localStorage.getItem('aiMaxTokens') || '2048', 10));

  const [hfKey, setHfKey] = useState(localStorage.getItem('hfApiKey') || '');
  const [replicateKey, setReplicateKey] = useState(localStorage.getItem('replicateApiKey') || '');
  const [kaggleKey, setKaggleKey] = useState(localStorage.getItem('kaggleApiKey') || '');
  const [driver, setDriver] = useState(localStorage.getItem('audioDriver') || 'FlexASIO (WASAPI Exclusive)');
  const [sampleRate, setSampleRate] = useState(localStorage.getItem('sampleRate') || '48.0 kHz');
  const [bufferSize, setBufferSize] = useState(localStorage.getItem('bufferSize') || '128 Samples');
  const [savedToast, setSavedToast] = useState(false);

  const handleModelSelect = (val) => {
    if (val === 'custom') {
      setIsCustom(true);
    } else {
      setIsCustom(false);
      setOpenRouterModel(val);
    }
  };

  const handleSave = () => {
    const finalModel = isCustom ? customModel.trim() || 'anthropic/claude-3.5-sonnet' : openRouterModel;
    
    localStorage.setItem('openRouterApiKey', openRouterKey.trim());
    localStorage.setItem('openRouterModel', finalModel);
    localStorage.setItem('customOpenRouterModel', customModel.trim());
    localStorage.setItem('aiTemperature', temperature.toString());
    localStorage.setItem('aiMaxTokens', maxTokens.toString());
    localStorage.setItem('hfApiKey', hfKey.trim());
    localStorage.setItem('replicateApiKey', replicateKey.trim());
    localStorage.setItem('kaggleApiKey', kaggleKey.trim());
    localStorage.setItem('audioDriver', driver);
    localStorage.setItem('sampleRate', sampleRate);
    localStorage.setItem('bufferSize', bufferSize);

    setSavedToast(true);
    setTimeout(() => {
      setSavedToast(false);
      onClose();
    }, 1200);
  };

  return (
    <div className="gm-modal-overlay" onClick={onClose}>
      <div className="gm-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '680px', width: '92%', maxHeight: '90vh' }}>
        <div className="gm-modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '18px' }}>⚙️</span>
            <h2>LYRICIST 4.2.0 PRO — SETTINGS & API KEY VAULT</h2>
          </div>
          <button className="gm-close-btn" onClick={onClose}>×</button>
        </div>
        
        <div className="gm-modal-content" style={{ overflowY: 'auto', maxHeight: 'calc(90vh - 130px)' }}>
          {/* API Key Vault Section */}
          <section className="gm-settings-section">
            <h3 style={{ color: 'var(--gm-led-amber, #FF9900)' }}>🔑 AI & NEURAL API KEY VAULT</h3>
            <p style={{ fontSize: '11px', color: 'var(--gm-text-muted)', marginBottom: '14px' }}>
              Your keys remain 100% private in your local environment. They are never sent to external telemetry servers.
            </p>

            <div className="gm-setting-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                <span style={{ fontWeight: 'bold', fontSize: '12px', color: 'var(--gm-accent-ice, #F0F8FF)' }}>
                  OpenRouter API Key (Primary Lyrics & Song Forge)
                </span>
                <span style={{ fontSize: '10px', color: openRouterKey ? 'var(--gm-mint)' : 'var(--gm-led-amber)' }}>
                  {openRouterKey ? '● KEY LOADED' : '○ REQUIRED FOR AI'}
                </span>
              </div>
              <input 
                type="password" 
                placeholder="sk-or-v1-..." 
                value={openRouterKey}
                onChange={e => setOpenRouterKey(e.target.value)}
                className="gm-input" 
                style={{ width: '100%', fontFamily: 'monospace' }}
              />
            </div>

            {/* OPENROUTER MODEL PICKER DROPDOWN */}
            <div className="gm-setting-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '6px', marginTop: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                <span style={{ fontWeight: 'bold', fontSize: '12px', color: 'var(--gm-accent-ice, #F0F8FF)' }}>
                  OpenRouter Model Selector
                </span>
                <span style={{ fontSize: '10px', color: 'var(--gm-cyan)' }}>
                  ACTIVE: {isCustom ? (customModel || 'Custom') : openRouterModel}
                </span>
              </div>
              <select 
                className="gm-select" 
                style={{ width: '100%', padding: '6px 8px', fontSize: '11px' }}
                value={isCustom ? 'custom' : openRouterModel}
                onChange={e => handleModelSelect(e.target.value)}
              >
                {POPULAR_MODELS.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>

            {/* Custom Model ID Entry */}
            {isCustom && (
              <div className="gm-setting-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '6px', marginTop: '8px' }}>
                <span style={{ fontSize: '11px', color: 'var(--gm-led-amber)' }}>
                  Enter Any OpenRouter Model ID (e.g. meta-llama/llama-3.1-405b, cohere/command-r-plus):
                </span>
                <input 
                  type="text" 
                  placeholder="author/model-name" 
                  value={customModel}
                  onChange={e => setCustomModel(e.target.value)}
                  className="gm-input" 
                  style={{ width: '100%', fontFamily: 'monospace' }}
                />
              </div>
            )}

            {/* AI Generation Parameters */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '12px' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#AAA', marginBottom: '4px' }}>
                  <span>Creativity (Temperature)</span>
                  <span style={{ color: 'var(--gm-accent-ice)' }}>{temperature.toFixed(2)}</span>
                </div>
                <input 
                  type="range" 
                  min="0.0" 
                  max="1.5" 
                  step="0.05" 
                  value={temperature} 
                  onChange={e => setTemperature(parseFloat(e.target.value))}
                  style={{ width: '100%' }}
                />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#AAA', marginBottom: '4px' }}>
                  <span>Max Tokens</span>
                  <span style={{ color: 'var(--gm-accent-ice)' }}>{maxTokens}</span>
                </div>
                <select 
                  className="gm-select" 
                  style={{ width: '100%', padding: '4px' }}
                  value={maxTokens} 
                  onChange={e => setMaxTokens(parseInt(e.target.value, 10))}
                >
                  <option value={512}>512 Tokens (Short lines)</option>
                  <option value={1024}>1024 Tokens (Verses)</option>
                  <option value={2048}>2048 Tokens (Full Songs)</option>
                  <option value={4096}>4096 Tokens (Extended EP)</option>
                </select>
              </div>
            </div>

            <div className="gm-setting-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '6px', marginTop: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                <span style={{ fontWeight: 'bold', fontSize: '12px', color: 'var(--gm-accent-ice, #F0F8FF)' }}>
                  Hugging Face API Key (Inference & Open Source Models)
                </span>
                <span style={{ fontSize: '10px', color: hfKey ? 'var(--gm-mint)' : '#666' }}>
                  {hfKey ? '● KEY LOADED' : '○ OPTIONAL'}
                </span>
              </div>
              <input 
                type="password" 
                placeholder="hf_..." 
                value={hfKey}
                onChange={e => setHfKey(e.target.value)}
                className="gm-input" 
                style={{ width: '100%', fontFamily: 'monospace' }}
              />
            </div>

            <div className="gm-setting-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '6px', marginTop: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                <span style={{ fontWeight: 'bold', fontSize: '12px', color: 'var(--gm-accent-ice, #F0F8FF)' }}>
                  Replicate API Key (Cloud Stem Separation & Audio DSP)
                </span>
                <span style={{ fontSize: '10px', color: replicateKey ? 'var(--gm-mint)' : '#666' }}>
                  {replicateKey ? '● KEY LOADED' : '○ OPTIONAL'}
                </span>
              </div>
              <input 
                type="password" 
                placeholder="r8_..." 
                value={replicateKey}
                onChange={e => setReplicateKey(e.target.value)}
                className="gm-input" 
                style={{ width: '100%', fontFamily: 'monospace' }}
              />
            </div>

            <div className="gm-setting-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '6px', marginTop: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                <span style={{ fontWeight: 'bold', fontSize: '12px', color: 'var(--gm-accent-ice, #F0F8FF)' }}>
                  Kaggle API Key (Remote GPU Cloud Synthesis)
                </span>
                <span style={{ fontSize: '10px', color: kaggleKey ? 'var(--gm-mint)' : '#666' }}>
                  {kaggleKey ? '● KEY LOADED' : '○ OPTIONAL'}
                </span>
              </div>
              <input 
                type="password" 
                placeholder="KG_..." 
                value={kaggleKey}
                onChange={e => setKaggleKey(e.target.value)}
                className="gm-input" 
                style={{ width: '100%', fontFamily: 'monospace' }}
              />
            </div>
          </section>

          {/* Audio & Universal FlexASIO Engine */}
          <section className="gm-settings-section" style={{ marginTop: '16px' }}>
            <h3 style={{ color: 'var(--gm-cyan, #4CC9F0)' }}>🎛️ AUDIO & ASIO DRIVER CONFIGURATION</h3>
            <div className="gm-setting-row">
              <span>Driver</span>
              <select className="gm-select" value={driver} onChange={e => setDriver(e.target.value)}>
                <option>FlexASIO (WASAPI Exclusive)</option>
                <option>ASIO4ALL v2 Universal</option>
                <option>Windows Low Latency WASAPI</option>
                <option>DirectSound Shared</option>
              </select>
            </div>
            <div className="gm-setting-row">
              <span>Sample Rate</span>
              <select className="gm-select" value={sampleRate} onChange={e => setSampleRate(e.target.value)}>
                <option>44.1 kHz</option>
                <option>48.0 kHz</option>
                <option>96.0 kHz</option>
              </select>
            </div>
            <div className="gm-setting-row">
              <span>Buffer Size</span>
              <select className="gm-select" value={bufferSize} onChange={e => setBufferSize(e.target.value)}>
                <option>64 Samples (1.3ms)</option>
                <option>128 Samples (2.7ms)</option>
                <option>256 Samples (5.3ms)</option>
                <option>512 Samples (10.6ms)</option>
              </select>
            </div>
            <div className="gm-latency-readout" style={{ marginTop: '8px' }}>
              Estimated Low Latency: <span className="gm-highlight">2.7 ms (Ultra-Low)</span>
            </div>
          </section>
        </div>

        <div className="gm-modal-footer" style={{ padding: '14px', background: '#111', borderTop: '1px solid #282828', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', color: savedToast ? 'var(--gm-mint)' : 'var(--gm-text-muted)' }}>
            {savedToast ? '✅ Settings, Model & API Keys Saved Successfully!' : 'Click Save to persist across sessions.'}
          </span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="t-btn" onClick={onClose}>Cancel</button>
            <button 
              className="t-btn play active" 
              onClick={handleSave}
              style={{ fontWeight: 'bold', padding: '6px 18px' }}
            >
              💾 Save Settings
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
