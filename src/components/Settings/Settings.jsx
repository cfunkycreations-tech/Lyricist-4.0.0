import React, { useState, useEffect, useRef } from 'react';
import { useLyricStore } from '../../context/LyricStore.jsx';
import { Save, RefreshCw, Key, Shield, HelpCircle } from 'lucide-react';
import settingsBg from '../../assets/settings.mp4';

const MODELS_CACHE_KEY = 'openrouter-models-cache';
const MODELS_CACHE_TTL = 60 * 60 * 1000; // refresh from OpenRouter at most hourly

function readModelsCache() {
  try {
    const cached = JSON.parse(localStorage.getItem(MODELS_CACHE_KEY));
    if (cached && Array.isArray(cached.models) && cached.models.length) return cached;
  } catch { /* corrupt cache — ignore */ }
  return null;
}

async function fetchOpenRouterModels(forceRefresh = false) {
  const cached = readModelsCache();
  if (!forceRefresh && cached && Date.now() - cached.fetchedAt < MODELS_CACHE_TTL) {
    return cached.models;
  }
  try {
    const res = await fetch("https://openrouter.ai/api/v1/models");
    if (!res.ok) throw new Error(`OpenRouter answered HTTP ${res.status}`);
    const data = await res.json();
    const models = data.data || [];
    try {
      localStorage.setItem(MODELS_CACHE_KEY, JSON.stringify({ fetchedAt: Date.now(), models }));
    } catch { /* storage full — cache is best-effort */ }
    return models;
  } catch (e) {
    // Offline or OpenRouter hiccup: serve the last good list instead of an empty picker.
    if (cached) return cached.models;
    throw e;
  }
}

function ModelSelector({ value, onChange }) {
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [filterType, setFilterType] = useState('all'); // all | free | paid
  const containerRef = useRef(null);

  const loadModels = (forceRefresh = false) => {
    setLoading(true);
    setErrorMsg('');
    fetchOpenRouterModels(forceRefresh)
      .then(res => {
        // Sort models: free first, then alphabetical
        const sorted = [...res].sort((a, b) => {
          const aFree = a.id.endsWith(':free');
          const bFree = b.id.endsWith(':free');
          if (aFree && !bFree) return -1;
          if (!aFree && bFree) return 1;
          return a.id.localeCompare(b.id);
        });
        setModels(sorted);
      })
      .catch(e => setErrorMsg(`Couldn't load the model list (${e.message}). Check your connection, then hit refresh.`))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadModels();
  }, []);

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const filtered = models.filter(m => {
    const matchesSearch = !search || m.id.toLowerCase().includes(search.toLowerCase()) || (m.name || '').toLowerCase().includes(search.toLowerCase());
    const isFree = m.id.endsWith(':free');
    const matchesFilter = filterType === 'all' || (filterType === 'free' && isFree) || (filterType === 'paid' && !isFree);
    return matchesSearch && matchesFilter;
  });

  const selectedModel = models.find(m => m.id === value);
  const label = selectedModel ? `${selectedModel.id.endsWith(':free') ? '🆓 ' : ''}${selectedModel.name || selectedModel.id}` : value || 'Select a model...';
  const freeCount = models.filter(m => m.id.endsWith(':free')).length;

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: '100%',
          background: 'rgba(13,8,28,0.7)',
          border: '1px solid rgba(139,92,246,0.22)',
          borderRadius: 8,
          padding: '8px 11px',
          fontSize: '0.84rem',
          color: '#e8e0ff',
          outline: 'none',
          fontFamily: "'Space Grotesk', sans-serif",
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer'
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label}
        </span>
        <span style={{ marginLeft: 8, color: 'rgba(167,139,250,0.5)', fontSize: '0.6rem' }}>
          {isOpen ? '▲' : '▼'}
        </span>
      </button>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            zIndex: 50,
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            background: '#0d0818',
            border: '1px solid rgba(139,92,246,0.35)',
            borderRadius: 10,
            boxShadow: '0 0 30px rgba(88,28,135,0.4)',
            display: 'flex',
            flexDirection: 'column',
            maxHeight: 360,
            overflow: 'hidden'
          }}
        >
          {/* Filter Bar */}
          <div style={{ padding: 8, borderBottom: '1px solid rgba(139,92,246,0.2)', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', gap: 4 }}>
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={loading ? "Loading models..." : `Search ${models.length} models...`}
                style={{
                  flex: 1,
                  minWidth: 0,
                  background: 'rgba(13,8,28,0.7)',
                  border: '1px solid rgba(139,92,246,0.22)',
                  borderRadius: 8,
                  padding: '6px 10px',
                  fontSize: '0.78rem',
                  color: '#e8e0ff',
                  outline: 'none'
                }}
              />
              <button
                type="button"
                onClick={() => loadModels(true)}
                disabled={loading}
                title="Re-download the latest model list from OpenRouter"
                style={{
                  background: 'rgba(13,8,28,0.7)',
                  border: '1px solid rgba(139,92,246,0.22)',
                  borderRadius: 8,
                  padding: '6px 9px',
                  color: 'rgba(167,139,250,0.8)',
                  cursor: loading ? 'wait' : 'pointer',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                <RefreshCw size={13} style={loading ? { animation: 'spin 1s linear infinite' } : undefined} />
              </button>
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {[['all', `All (${models.length})`], ['free', `🆓 Free (${freeCount})`], ['paid', `Paid (${models.length - freeCount})`]].map(([type, txt]) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setFilterType(type)}
                  style={{
                    flex: 1,
                    padding: '4px 0',
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    borderRadius: 6,
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: "'Space Grotesk', sans-serif",
                    background: filterType === type ? 'rgba(124,58,237,0.5)' : 'rgba(13,8,28,0.6)',
                    color: filterType === type ? '#e8e0ff' : 'rgba(167,139,250,0.5)',
                    boxShadow: filterType === type ? '0 0 8px rgba(124,58,237,0.3)' : 'none'
                  }}
                >
                  {txt}
                </button>
              ))}
            </div>
          </div>

          {/* Model Options list */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {errorMsg && (
              <div style={{ padding: 10, color: '#f87171', fontSize: '0.78rem' }}>
                {errorMsg}{' '}
                <button
                  type="button"
                  onClick={() => loadModels(true)}
                  style={{
                    background: 'rgba(124,58,237,0.3)',
                    border: '1px solid rgba(139,92,246,0.4)',
                    borderRadius: 6,
                    padding: '2px 10px',
                    color: '#e8e0ff',
                    fontSize: '0.72rem',
                    cursor: 'pointer'
                  }}
                >
                  Retry
                </button>
              </div>
            )}
            {!loading && filtered.length === 0 && (
              <div style={{ padding: 10, color: 'rgba(148,130,200,0.4)', fontSize: '0.78rem', textAlign: 'center' }}>
                No models match.
              </div>
            )}
            {filtered.map(m => {
              const isFree = m.id.endsWith(':free');
              const isSelected = m.id === value;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    onChange(m.id);
                    setIsOpen(false);
                    setSearch('');
                  }}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '8px 12px',
                    background: isSelected ? 'rgba(124,58,237,0.2)' : 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: 8,
                    transition: 'background 0.1s'
                  }}
                  onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = 'rgba(88,28,135,0.2)'; }}
                  onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.72rem', color: isSelected ? '#c084fc' : '#e8e0ff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {isFree ? '🆓 ' : ''}{m.id}
                    </div>
                    {m.name && m.name !== m.id && (
                      <div style={{ fontSize: '0.65rem', color: 'rgba(148,130,200,0.45)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {m.name}
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: '0.65rem', flexShrink: 0 }}>
                    {isFree ? (
                      <span style={{ color: '#34d399', fontWeight: 700 }}>FREE</span>
                    ) : m.pricing ? (
                      <span style={{ color: 'rgba(148,130,200,0.5)' }}>
                        ${(parseFloat(m.pricing.prompt || 0) * 1000000).toFixed(2)}/M
                      </span>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>

          <div style={{ padding: '5px 12px', borderTop: '1px solid rgba(139,92,246,0.2)', fontSize: '0.62rem', color: 'rgba(148,130,200,0.35)', textAlign: 'right' }}>
            {filtered.length} model{filtered.length === 1 ? '' : 's'} shown
          </div>
        </div>
      )}
    </div>
  );
}

export default function Settings() {
  const store = useLyricStore();
  const [showKey, setShowKey] = useState(false);
  const [showGoogleKey, setShowGoogleKey] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleUpdate = (field, val) => {
    store.setConfig({ ...store.config, [field]: val });
    setSaved(false);
  };

  const handleSave = () => {
    // Explicit save visual feedback
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    if (window.confirm('Reset settings to default?')) {
      store.setConfig({
        openRouterApiKey: '',
        model: 'openrouter/free',
        temperature: 0.75,
        maxTokens: 2000,
        fusionEnabled: false,
        fusionModels: [],
        googleApiKey: '',
        geminiTextModel: 'gemini-3.5-flash',
        geminiImageModel: 'gemini-3.1-flash-image',
        useFlexTier: true,
        imageAspectRatio: '1:1',
        imageSize: '2K',
        customArtStyle: '',
        stemmerMode: 'offline',
        replicateApiKey: '',
      });
      setSaved(false);
    }
  };

  return (
    <div style={{ position: 'relative', flex: 1, minHeight: 0, width: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#000' }}>
      <video
        src={settingsBg}
        autoPlay
        loop
        muted
        playsInline
        onCanPlay={(e) => { e.target.playbackRate = 0.67; }}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: 0, opacity: 0.75 }}
      />
      <div style={{ position: 'relative', zIndex: 1, flex: 1, minHeight: 0, overflowY: 'auto', background: 'rgba(0,0,0,0.62)', width: '100%' }}>
    <div style={{ padding: 28, maxWidth: 680, margin: '0 auto', boxSizing: 'border-box' }}>
      <h2
        style={{
          fontFamily: "'Syne', sans-serif",
          fontSize: '1.3rem',
          fontWeight: 800,
          color: '#e8e0ff',
          marginBottom: 4,
          background: 'linear-gradient(90deg, #e879f9, #a855f7, #22d3ee)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent'
        }}
      >
        Settings
      </h2>
      <p style={{ fontSize: '0.78rem', color: 'rgba(210,195,255,0.85)', marginBottom: 24, lineHeight: 1.6 }}>
        Configure your OpenRouter API key and assistant models. Your key is stored securely in your local environment.
      </p>

      {/* API Key box */}
      <div style={{ marginBottom: 18 }} data-help="Your API key is like a password that lets Lyricist use an AI to write lyrics. You get one free from OpenRouter (link below), paste it here, and you're ready. It stays private on your computer — it's never sent to us.">
        <label style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(167,139,250,0.7)', marginBottom: 5, display: 'block' }}>
          OpenRouter API Key
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type={showKey ? 'text' : 'password'}
            value={store.config.openRouterApiKey}
            onChange={(e) => handleUpdate('openRouterApiKey', e.target.value)}
            placeholder="sk-or-v1-..."
            data-demo="settings-key"
            style={{
              flex: 1,
              background: 'rgba(13,8,28,0.7)',
              border: '1px solid rgba(139,92,246,0.22)',
              borderRadius: 8,
              padding: '8px 11px',
              fontSize: '0.84rem',
              color: '#e8e0ff',
              outline: 'none',
              fontFamily: "'Space Grotesk', sans-serif"
            }}
          />
          <button
            onClick={() => setShowKey(!showKey)}
            style={{
              padding: '7px 14px',
              borderRadius: 8,
              border: '1px solid rgba(139,92,246,0.25)',
              background: 'rgba(13,8,28,0.7)',
              color: 'rgba(196,181,253,0.7)',
              fontSize: '0.78rem',
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: "'Space Grotesk', sans-serif"
            }}
          >
            {showKey ? 'Hide' : 'Show'}
          </button>
        </div>
        <p style={{ fontSize: '0.65rem', color: 'rgba(148,130,200,0.35)', marginTop: 5 }}>
          Get your key at{' '}
          <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" style={{ color: '#c084fc', textDecoration: 'underline' }}>
            openrouter.ai/keys
          </a>. Buy or load credits on OpenRouter to use premium models.
        </p>
      </div>

      {/* Stemmer cloud key (optional) */}
      <div style={{ marginBottom: 18 }} data-help="Optional. Only needed if you use Stemmer in Cloud mode. Offline Stemmer works with no key and no GPU. Cloud mode runs Demucs on Replicate’s servers for higher-quality stems.">
        <label style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(167,139,250,0.7)', marginBottom: 5, display: 'block' }}>
          Stemmer Cloud API Key (Replicate) — optional
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type={showGoogleKey ? 'text' : 'password'}
            value={store.config.replicateApiKey || ''}
            onChange={(e) => handleUpdate('replicateApiKey', e.target.value)}
            placeholder="r8_… (only for Stemmer Cloud mode)"
            style={{
              flex: 1,
              background: 'rgba(13,8,28,0.7)',
              border: '1px solid rgba(0,229,255,0.28)',
              borderRadius: 8,
              padding: '8px 11px',
              fontSize: '0.84rem',
              color: '#e8e0ff',
              outline: 'none',
              fontFamily: "'Space Grotesk', sans-serif"
            }}
          />
        </div>
        <p style={{ fontSize: '0.65rem', color: 'rgba(148,130,200,0.45)', marginTop: 5, lineHeight: 1.5 }}>
          Offline Stemmer needs nothing — it runs on your CPU. Cloud mode uses{' '}
          <a href="https://replicate.com/account/api-tokens" target="_blank" rel="noopener noreferrer" style={{ color: '#67e8f9', textDecoration: 'underline' }}>
            Replicate
          </a>{' '}
          (Demucs) so weak PCs still get pro ML stems. Key stays on your machine.
        </p>
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button
            type="button"
            onClick={() => handleUpdate('stemmerMode', 'offline')}
            style={{
              padding: '6px 12px',
              borderRadius: 999,
              border: `1px solid ${(store.config.stemmerMode || 'offline') === 'offline' ? 'rgba(0,229,255,0.65)' : 'rgba(100,100,120,0.35)'}`,
              background: (store.config.stemmerMode || 'offline') === 'offline' ? 'rgba(0,229,255,0.15)' : 'rgba(13,8,28,0.5)',
              color: '#e8e0ff',
              fontSize: '0.72rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Default: Offline
          </button>
          <button
            type="button"
            onClick={() => handleUpdate('stemmerMode', 'cloud')}
            style={{
              padding: '6px 12px',
              borderRadius: 999,
              border: `1px solid ${store.config.stemmerMode === 'cloud' ? 'rgba(168,85,247,0.7)' : 'rgba(100,100,120,0.35)'}`,
              background: store.config.stemmerMode === 'cloud' ? 'rgba(168,85,247,0.18)' : 'rgba(13,8,28,0.5)',
              color: '#e8e0ff',
              fontSize: '0.72rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Default: Cloud API
          </button>
        </div>
      </div>

      {/* Model select */}
      <div style={{ marginBottom: 18 }} data-help="The AI 'brain' that writes your lyrics. Models marked FREE cost nothing to use. Paid ones can be smarter but charge a tiny amount per use. If you're not sure, pick any FREE model to start.">
        <label style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(167,139,250,0.7)', marginBottom: 5, display: 'block' }}>
          Assistant Model
        </label>
        <ModelSelector
          value={store.config.model}
          onChange={(modelId) => handleUpdate('model', modelId)}
        />
      </div>

      {/* Multi-Model Fusion */}
      <div style={{ marginBottom: 22, background: 'rgba(255,45,149,0.06)', border: '1px solid rgba(255,45,149,0.22)', borderRadius: 10, padding: 14 }} data-help="Fusion Mode sends your song idea to multiple AI models at the same time, then combines the best parts of each result into one final version. It uses more of your API credits but often produces richer, more creative lyrics because each model thinks differently.">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(255,150,200,0.8)' }}>
              Multi-Model Fusion ✨ NEW
            </div>
            <div style={{ fontSize: '0.68rem', color: 'rgba(230,195,215,0.9)', marginTop: 3, lineHeight: 1.4, maxWidth: 360 }}>
              Pick 2 or 3 AI models. Lyricist asks all of them, then blends the best lines from each into one song.
              Uses more credits, but results are noticeably richer.
            </div>
          </div>
          <button
            type="button"
            onClick={() => handleUpdate('fusionEnabled', !store.config.fusionEnabled)}
            style={{
              flexShrink: 0,
              marginLeft: 16,
              padding: '6px 16px',
              borderRadius: 9999,
              border: 'none',
              fontSize: '0.75rem',
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: "'Space Grotesk', sans-serif",
              background: store.config.fusionEnabled ? 'linear-gradient(135deg,#ff2d95,#a855f7)' : 'rgba(60,40,70,0.6)',
              color: store.config.fusionEnabled ? '#fff' : 'rgba(180,150,170,0.6)',
              boxShadow: store.config.fusionEnabled ? '0 0 12px rgba(255,45,149,0.5)' : 'none',
              transition: 'all 0.2s'
            }}
          >
            {store.config.fusionEnabled ? 'Fusion: ON' : 'Fusion: OFF'}
          </button>
        </div>

        {store.config.fusionEnabled && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <div style={{ fontSize: '0.62rem', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,150,200,0.6)', marginBottom: 5 }}>
                Extra Model #1 (combined with your main model above)
              </div>
              <ModelSelector
                value={(store.config.fusionModels || [])[0] || ''}
                onChange={(modelId) => {
                  const updated = [...(store.config.fusionModels || [])];
                  updated[0] = modelId;
                  handleUpdate('fusionModels', updated);
                }}
              />
            </div>
            <div>
              <div style={{ fontSize: '0.62rem', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,150,200,0.6)', marginBottom: 5 }}>
                Extra Model #2 (optional — adds a third perspective)
              </div>
              <ModelSelector
                value={(store.config.fusionModels || [])[1] || ''}
                onChange={(modelId) => {
                  const updated = [...(store.config.fusionModels || [])];
                  updated[1] = modelId;
                  handleUpdate('fusionModels', updated);
                }}
              />
            </div>
            <div style={{ fontSize: '0.65rem', color: 'rgba(255,150,150,0.55)', padding: '6px 10px', background: 'rgba(255,60,60,0.07)', borderRadius: 6, border: '1px solid rgba(255,60,60,0.15)' }}>
              Heads-up: Fusion runs 2–3 API calls instead of 1, plus a synthesis call. Free models work great here —
              mix a free model with a paid one to cut costs while still getting blended creativity.
            </div>
          </div>
        )}
      </div>

      {/* Song Forge — OpenRouter only (same key as everything else) */}
      <div style={{ marginBottom: 22, background: 'rgba(34,211,238,0.06)', border: '1px solid rgba(34,211,238,0.22)', borderRadius: 10, padding: 14 }}>
        <div style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(103,232,249,0.85)', marginBottom: 3 }}>
          🪄 Song Forge — OpenRouter (Song + Cover Art)
        </div>
        <p style={{ fontSize: '0.68rem', color: 'rgba(210,195,255,0.75)', marginBottom: 12, lineHeight: 1.4 }}>
          Song Forge uses <strong>the same OpenRouter key</strong> as the rest of Lyricist — one key for lyrics
          and for Nano Banana cover art (image models on OpenRouter). No Google AI Studio key. No second account.
        </p>

        <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 200px' }} data-help="Image model on OpenRouter for cover art (Nano Banana 2 family when available on your account). Lyrics still use the main OpenRouter model above.">
            <label style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(167,139,250,0.7)', marginBottom: 5, display: 'block' }}>
              Cover Art Model (OpenRouter)
            </label>
            <select
              value={store.config.geminiImageModel || 'google/gemini-2.5-flash-image-preview'}
              onChange={(e) => handleUpdate('geminiImageModel', e.target.value)}
              style={{
                width: '100%',
                background: 'rgba(13,8,28,0.7)',
                border: '1px solid rgba(34,211,238,0.25)',
                borderRadius: 8,
                padding: '8px 11px',
                fontSize: '0.78rem',
                color: '#e8e0ff',
                outline: 'none',
                fontFamily: "'Space Grotesk', sans-serif"
              }}
            >
              <option value="google/gemini-2.5-flash-image-preview">Nano Banana 2 Lite — fast (OpenRouter)</option>
              <option value="google/gemini-2.5-flash-image">Nano Banana 2 — balanced (OpenRouter)</option>
              <option value="black-forest-labs/flux.2-flex">Flux 2 Flex — alt (OpenRouter)</option>
            </select>
          </div>

          <div style={{ flex: '1 1 120px' }} data-help="Shape of the cover art canvas before it's framed into the circular medallion. 1:1 (square) works best for the medallion look.">
            <label style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(167,139,250,0.7)', marginBottom: 5, display: 'block' }}>
              Aspect Ratio
            </label>
            <select
              value={store.config.imageAspectRatio}
              onChange={(e) => handleUpdate('imageAspectRatio', e.target.value)}
              style={{
                width: '100%',
                background: 'rgba(13,8,28,0.7)',
                border: '1px solid rgba(34,211,238,0.25)',
                borderRadius: 8,
                padding: '8px 11px',
                fontSize: '0.78rem',
                color: '#e8e0ff',
                outline: 'none',
                fontFamily: "'Space Grotesk', sans-serif"
              }}
            >
              {['1:1', '4:5', '3:4', '5:4', '4:3', '16:9', '9:16'].map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          <div style={{ flex: '1 1 120px' }} data-help="Resolution of the generated cover art. Higher looks sharper on big screens but costs a bit more and takes longer.">
            <label style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(167,139,250,0.7)', marginBottom: 5, display: 'block' }}>
              Resolution
            </label>
            <select
              value={store.config.imageSize}
              onChange={(e) => handleUpdate('imageSize', e.target.value)}
              style={{
                width: '100%',
                background: 'rgba(13,8,28,0.7)',
                border: '1px solid rgba(34,211,238,0.25)',
                borderRadius: 8,
                padding: '8px 11px',
                fontSize: '0.78rem',
                color: '#e8e0ff',
                outline: 'none',
                fontFamily: "'Space Grotesk', sans-serif"
              }}
            >
              {['1K', '2K', '4K'].map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>

        <div data-help="Song Forge's default look frames every cover in a circular medallion with a magenta-to-orange neon glow. Type your own art style here to override that default — leave it blank to keep the signature Lyricist look.">
          <label style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(167,139,250,0.7)', marginBottom: 5, display: 'block' }}>
            Custom Cover Art Style (optional — overrides the default medallion look)
          </label>
          <textarea
            value={store.config.customArtStyle}
            onChange={(e) => handleUpdate('customArtStyle', e.target.value)}
            placeholder="Leave blank to use Lyricist's signature circular medallion with magenta/orange neon glow..."
            rows={2}
            style={{
              width: '100%',
              background: 'rgba(13,8,28,0.7)',
              border: '1px solid rgba(34,211,238,0.25)',
              borderRadius: 8,
              padding: '8px 11px',
              fontSize: '0.76rem',
              color: '#e8e0ff',
              outline: 'none',
              resize: 'vertical',
              fontFamily: "'Space Grotesk', sans-serif"
            }}
          />
        </div>
      </div>

      {/* Temperature */}
      <div style={{ marginBottom: 18 }} data-help="How wild or safe the AI gets. Slide left for predictable, on-the-nose lyrics; slide right for surprising, out-there ideas. Around 0.7–1.0 is a good sweet spot for most songs. ('Temperature' is just the AI word for this.)">
        <label style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(167,139,250,0.7)', marginBottom: 5, display: 'block' }}>
          Creativity / Temperature — <span style={{ color: '#c084fc' }}>{store.config.temperature}</span>
        </label>
        {/* Hard stop at 1.1. It used to run to 2.0 labelled "Wildly Creative",
            which is not what happens up there — the words break apart. Chris
            turned it up to 1.2 wanting more creativity, exactly as the label
            invited, and got half-words and Cyrillic. The dial no longer goes
            anywhere that produces rubbish. */}
        <input
          type="range"
          min="0"
          max="1.1"
          step="0.05"
          value={Math.min(store.config.temperature, 1.1)}
          onChange={(e) => handleUpdate('temperature', parseFloat(e.target.value))}
          style={{ width: '100%', accentColor: '#a855f7' }}
        />
        <div style={{ display: 'flex', fontSize: '0.62rem', color: 'rgba(148,130,200,0.35)', marginTop: 3, justifyContent: 'space-between' }}>
          <span>0 — Precise</span>
          <span>0.85 — Sweet spot</span>
          <span>1.1 — As wild as it goes</span>
        </div>
        {store.config.temperature >= 1.05 && (
          <div style={{
            marginTop: 8, padding: '8px 11px', borderRadius: 8, fontSize: '0.66rem', lineHeight: 1.55,
            border: '1px solid rgba(251,191,36,0.45)', background: 'rgba(251,191,36,0.08)',
            color: 'rgba(253,224,71,0.95)',
          }}>
            You're at the top of the dial. This is as loose as it gets before the words themselves
            start coming apart, which is why it stops here. <b>0.7–0.95 writes the best songs.</b>
          </div>
        )}
      </div>

      {/* Max tokens */}
      <div style={{ marginBottom: 18 }} data-help="How much the AI can write at once. Higher means it can produce longer lyrics in one go, but uses a bit more of your credits. ('Tokens' are the small chunks of text AI counts — roughly a token is part of a word.) 2000 is plenty for a full song.">
        <label style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(167,139,250,0.7)', marginBottom: 5, display: 'block' }}>
          Max Response Length — <span style={{ color: '#c084fc' }}>{store.config.maxTokens} tokens</span>
        </label>
        <input
          type="range"
          min="500"
          max="4000"
          step="100"
          value={store.config.maxTokens}
          onChange={(e) => handleUpdate('maxTokens', parseInt(e.target.value))}
          style={{ width: '100%', accentColor: '#a855f7' }}
        />
        <div style={{ display: 'flex', justifyBetween: 'space-between', fontSize: '0.62rem', color: 'rgba(148,130,200,0.35)', marginTop: 3, justifyContent: 'space-between' }}>
          <span>500</span>
          <span>2000</span>
          <span>4000</span>
        </div>
      </div>

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 28 }}>
        <button
          onClick={handleSave}
          className="btn-neon-purple"
          data-help="Saves your settings. (They also save automatically as you change them — this is just a confirm button.)"
          style={{
            padding: '9px 22px',
            borderRadius: 8,
            border: 'none',
            color: saved ? '#34d399' : '#fff',
            fontSize: '0.84rem',
            fontWeight: 700,
            fontFamily: "'Space Grotesk', sans-serif",
            cursor: 'pointer'
          }}
        >
          {saved ? '✓ Saved' : 'Save Settings'}
        </button>

        <button
          onClick={handleReset}
          data-help="Puts all settings back to their starting values. Your API key gets cleared too, so you'd need to paste it back in. It asks you to confirm first."
          style={{
            padding: '9px 22px',
            borderRadius: 8,
            border: '1px solid rgba(139,92,246,0.25)',
            background: 'rgba(13,8,28,0.7)',
            color: 'rgba(196,181,253,0.6)',
            fontSize: '0.84rem',
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: "'Space Grotesk', sans-serif"
          }}
        >
          Reset to Defaults
        </button>
      </div>

      {/* Config Summary panel */}
      <div style={{ background: 'rgba(13,8,28,0.8)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: 10, padding: 16 }}>
        <div style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(167,139,250,0.5)', marginBottom: 10 }}>
          Current Configuration Status
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[
            ['API Key Status', store.config.openRouterApiKey ? '🔑 Configured' : '❌ Not Configured', store.config.openRouterApiKey ? '#34d399' : '#f87171'],
            ['Active Model', store.config.model, '#e8e0ff'],
            ['Assistant Temperature', store.config.temperature, '#c4b5fd'],
            ['Token Cap', store.config.maxTokens, '#c4b5fd'],
            ['Song Forge (OpenRouter)', store.config.openRouterApiKey ? '🔑 Same key as studio' : '❌ OpenRouter key needed', store.config.openRouterApiKey ? '#34d399' : '#f87171'],
            ['Song Forge Text Model', store.config.geminiTextModel, '#67e8f9'],
            ['Song Forge Art Model', store.config.geminiImageModel, '#67e8f9']
          ].map(([k, v, c]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.75rem', color: 'rgba(196,181,253,0.7)' }}>{k}</span>
              <span style={{ fontSize: '0.75rem', fontFamily: "'JetBrains Mono', monospace", color: c, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '300px' }}>
                {v}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
      </div>
    </div>
  );
}
