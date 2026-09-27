import React, { useState, useEffect, useRef } from 'react';
import TabBackground from '../common/TabBackground.jsx';
import { useLyricStore, DEFAULT_CONFIG } from '../../context/LyricStore.jsx';
import { Save, RefreshCw, Key, Shield, HelpCircle, Hammer, FolderOpen } from 'lucide-react';
import { notify, ask } from '../../services/dialog.js';
import { normalizeApiKey } from '../../services/AIService.js';
import { IMAGE_MODELS, DEFAULT_IMAGE_MODEL } from '../../services/GeminiService.js';
import { PRISM_NAMES, ACCENT_PRESETS, accentHex, getPrism } from '../../services/prismTheme.js';
import { isEnabled as analyticsEnabled, optIn, optOut } from '../../services/analytics.js';
import { Icon } from '../common/Glyph.jsx';

/* The names, the presets and the swatch colour all come from prismTheme.js
   now. There were two copies of PRISM_NAMES — one here and one there — and
   they had already drifted apart, so the label under the slider was naming a
   colour pair the slider had stopped producing. One source, one truth. */

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
          background: 'rgba(16,18,21,0.7)',
          border: '1px solid rgba(155,161,170,0.22)',
          borderRadius: 8,
          padding: '8px 11px',
          fontSize: '0.84rem',
          color: '#e6e8eb',
          outline: 'none',
          fontFamily: 'var(--faf-font)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer'
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label}
        </span>
        <span style={{ marginLeft: 8, color: 'rgba(155,161,170,0.5)', fontSize: '0.6rem' }}>
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
            background: '#0e1013',
            border: '1px solid rgba(155,161,170,0.35)',
            borderRadius: 10,
            boxShadow: '0 0 0 1px rgba(30,31,33,0.4)',
            display: 'flex',
            flexDirection: 'column',
            maxHeight: 360,
            overflow: 'hidden'
          }}
        >
          {/* Filter Bar */}
          <div style={{ padding: 8, borderBottom: '1px solid rgba(155,161,170,0.2)', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', gap: 4 }}>
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={loading ? "Loading models..." : `Search ${models.length} models...`}
                style={{
                  flex: 1,
                  minWidth: 0,
                  background: 'rgba(16,18,21,0.7)',
                  border: '1px solid rgba(155,161,170,0.22)',
                  borderRadius: 8,
                  padding: '6px 10px',
                  fontSize: '0.78rem',
                  color: '#e6e8eb',
                  outline: 'none'
                }}
              />
              <button
                type="button"
                onClick={() => loadModels(true)}
                disabled={loading}
                title="Re-download the latest model list from OpenRouter"
                style={{
                  background: 'rgba(16,18,21,0.7)',
                  border: '1px solid rgba(155,161,170,0.22)',
                  borderRadius: 8,
                  padding: '6px 9px',
                  color: 'rgba(155,161,170,0.8)',
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
                    fontFamily: 'var(--faf-font)',
                    background: filterType === type ? 'rgba(155,161,170,0.5)' : 'rgba(16,18,21,0.6)',
                    color: filterType === type ? '#e6e8eb' : 'rgba(155,161,170,0.5)',
                    boxShadow: filterType === type ? '0 0 0 1px rgba(155,161,170,0.3)' : 'none'
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
                    background: 'rgba(155,161,170,0.3)',
                    border: '1px solid rgba(155,161,170,0.4)',
                    borderRadius: 6,
                    padding: '2px 10px',
                    color: '#e6e8eb',
                    fontSize: '0.72rem',
                    cursor: 'pointer'
                  }}
                >
                  Retry
                </button>
              </div>
            )}
            {!loading && filtered.length === 0 && (
              <div style={{ padding: 10, color: 'rgba(155,161,170,0.4)', fontSize: '0.78rem', textAlign: 'center' }}>
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
                    background: isSelected ? 'rgba(155,161,170,0.2)' : 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: 8,
                    transition: 'background 0.1s'
                  }}
                  onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = 'rgba(30,31,33,0.2)'; }}
                  onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.72rem', color: isSelected ? '#9ba1aa' : '#e6e8eb', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {isFree ? '🆓 ' : ''}{m.id}
                    </div>
                    {m.name && m.name !== m.id && (
                      <div style={{ fontSize: '0.65rem', color: 'rgba(155,161,170,0.45)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {m.name}
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: '0.65rem', flexShrink: 0 }}>
                    {isFree ? (
                      <span style={{ color: '#34d399', fontWeight: 700 }}>FREE</span>
                    ) : m.pricing ? (
                      <span style={{ color: 'rgba(155,161,170,0.5)' }}>
                        ${(parseFloat(m.pricing.prompt || 0) * 1000000).toFixed(2)}/M
                      </span>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>

          <div style={{ padding: '5px 12px', borderTop: '1px solid rgba(155,161,170,0.2)', fontSize: '0.62rem', color: 'rgba(155,161,170,0.35)', textAlign: 'right' }}>
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

  /* Usage stats switch. Defaults ON in a build that has a key, because that is
     the build the operator deliberately configured — but the choice is stored
     and analytics.js reads the same localStorage entry at boot, so opting out
     survives a restart rather than lasting until the window closes. */
  const [statsOn, setStatsOn] = useState(() => {
    try { return localStorage.getItem('lyricist.analytics.optout') !== '1'; } catch { return true; }
  });

  // How many of his own narration recordings the app found. Reported as a
  // count rather than a yes/no so a misnamed file shows up as a number that is
  // lower than he expects, instead of silently doing nothing.
  const [voiceCount, setVoiceCount] = useState(0);
  useEffect(() => {
    let live = true;
    window.lyricistAPI?.voicePack?.()
      .then((r) => { if (live && r?.ok) setVoiceCount(Object.keys(r.found || {}).length); })
      .catch(() => {});
    return () => { live = false; };
  }, []);
  const openVoiceFolder = () => {
    window.lyricistAPI?.openVoiceFolder?.().then((r) => {
      if (r && !r.ok) notify(`Could not open the voice folder: ${r.error}`, { tone: 'error' });
    }).catch(() => {});
  };

  const handleUpdate = (field, val) => {
    // Keys get cleaned on the way IN, not just on the way out. A key copied off
    // a web page arrives with a trailing newline, a non-breaking space, quotes
    // around it, or "Bearer " on the front more often than not — all truthy, so
    // the app happily stored one and then failed every request with OpenRouter's
    // "Missing Authentication header", which names nothing the user can act on.
    // The Hugging Face token is pasted from a web page by the same hands and
    // picks up exactly the same junk, so it gets cleaned the same way. It has a
    // different prefix (hf_) so the OpenRouter range check must not apply.
    const next = field === 'openRouterApiKey'
      ? normalizeApiKey(val)
      : (field === 'huggingFaceToken' ? String(val ?? '').trim().replace(/^["'“”]|["'“”]$/g, '').replace(/^Bearer\s+/i, '') : val);

    store.setConfig({ ...store.config, [field]: next });

    // The prism drives a WebGL canvas on every tab that is nowhere near this
    // component in the tree. Mirroring it to localStorage and firing one event
    // is far simpler than threading it through, and it survives a restart.
    if (field === 'prism') {
      localStorage.setItem('lyricistPrism', String(next));
      window.dispatchEvent(new Event('lyricist-prism'));
    }
    setSaved(false);
  };

  const handleSave = () => {
    // Explicit save visual feedback
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = async () => {
    if (await ask('Reset every setting to its default? This clears your API key too, so have it handy to paste back in.', { ok: 'Reset', danger: true })) {
      // Reset to the ONE set of defaults the app actually ships with. This used
      // to be a hand-copied second copy of DEFAULT_CONFIG, and it had drifted:
      // it put the writing model back to 'openrouter/free' — a router whose
      // free pool includes coding agents and a safety classifier, none of which
      // can write a verse — and it forced the Stemmer to 'offline' DSP instead
      // of the real local separation. Reset is not a place to introduce values
      // a fresh install would never have.
      store.setConfig({ ...DEFAULT_CONFIG, migratedToFreeRouter: true });
      setSaved(false);
    }
  };

  return (
    <div style={{ position: 'relative', flex: 1, minHeight: 0, width: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#000' }}>
      <TabBackground name="settings" />
      <div style={{ position: 'relative', zIndex: 1, flex: 1, minHeight: 0, overflowY: 'auto', background: 'rgba(0,0,0,0.38)', width: '100%' }}>
    <div style={{ padding: 28, maxWidth: 680, margin: '0 auto', boxSizing: 'border-box' }}>
      <h2
        style={{
          fontFamily: 'var(--faf-font)',
          fontSize: '1.3rem',
          fontWeight: 800,
          color: '#e6e8eb',
          marginBottom: 4,
          background: 'linear-gradient(90deg, #9ba1aa, #9ba1aa, #e7a540)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent'
        }}
      >
        Settings
      </h2>
      <p style={{ fontSize: '0.78rem', color: 'rgba(230,232,235,0.85)', marginBottom: 24, lineHeight: 1.6 }}>
        Configure your OpenRouter API key and assistant models. Your key is stored securely in your local environment.
      </p>

      {/* API Key box */}
      <div style={{ marginBottom: 18 }} data-help="Your API key is like a password that lets Lyricist use an AI to write lyrics. You get one free from OpenRouter (link below), paste it here, and you're ready. It stays private on your computer — it's never sent to us.">
        <label style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(155,161,170,0.7)', marginBottom: 5, display: 'block' }}>
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
              background: 'rgba(16,18,21,0.7)',
              border: '1px solid rgba(155,161,170,0.22)',
              borderRadius: 8,
              padding: '8px 11px',
              fontSize: '0.84rem',
              color: '#e6e8eb',
              outline: 'none',
              fontFamily: 'var(--faf-font)'
            }}
          />
          <button
            onClick={() => setShowKey(!showKey)}
            style={{
              padding: '7px 14px',
              borderRadius: 8,
              border: '1px solid rgba(155,161,170,0.25)',
              background: 'rgba(16,18,21,0.7)',
              color: 'rgba(230,232,235,0.7)',
              fontSize: '0.78rem',
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'var(--faf-font)'
            }}
          >
            {showKey ? 'Hide' : 'Show'}
          </button>
        </div>
        <p style={{ fontSize: '0.65rem', color: 'rgba(155,161,170,0.35)', marginTop: 5 }}>
          Get your key at{' '}
          <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" style={{ color: '#9ba1aa', textDecoration: 'underline' }}>
            openrouter.ai/keys
          </a>. Buy or load credits on OpenRouter to use premium models.
        </p>
      </div>

      {/* ---- Black Hole Studios: free song quota ---------------------------------
          The free music server gives anonymous users only a few minutes of GPU
          a day. Its own error message says the fix: "Authenticate with a
          Hugging Face token for more quota." A free account is enough, and the
          tab works without it — just fewer songs before it stops. */}
      <div style={{ marginBottom: 18 }} data-help="Optional. A free Hugging Face account gives Black Hole Studios a much bigger daily allowance for making songs. Without it you still get songs, just fewer per day. The token stays on your machine.">
        <label style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(43,232,160,0.75)', marginBottom: 5, display: 'block' }}>
          Black Hole Studios — Hugging Face token (optional, free)
        </label>
        <input
          type={showGoogleKey ? 'text' : 'password'}
          value={store.config.huggingFaceToken || ''}
          onChange={(e) => handleUpdate('huggingFaceToken', e.target.value)}
          placeholder="hf_… (more free songs per day)"
          style={{
            width: '100%',
            background: 'rgba(16,18,21,0.7)',
            border: '1px solid rgba(43,232,160,0.3)',
            borderRadius: 8,
            padding: '8px 11px',
            fontSize: '0.84rem',
            color: '#e6e8eb',
            outline: 'none',
            fontFamily: 'var(--faf-font)'
          }}
        />
        <p style={{ fontSize: '0.65rem', color: 'rgba(155,161,170,0.45)', marginTop: 5, lineHeight: 1.5 }}>
          Making songs is free either way. A free account at{' '}
          <a href="https://huggingface.co/settings/tokens" target="_blank" rel="noopener noreferrer" style={{ color: '#2BE8A0', textDecoration: 'underline' }}>
            huggingface.co/settings/tokens
          </a>{' '}
          raises how many you can make in a day. Nothing to pay, and the token never leaves your computer.
        </p>
      </div>

      {/* ---- PRISM ---------------------------------------------------------
          One control, every colour in the app. It has to reach a WebGL canvas
          on every tab, so handleUpdate mirrors it to localStorage and fires an
          event rather than threading it through the React tree. */}
      <div style={{ marginBottom: 18 }} data-help="One control for the whole colour of Lyricist Pro. It rotates the razor-neon accent — every border, focus ring, glow, scrollbar and active tab — and the moving prism behind each tab, together, right around the spectrum. Remembered between sessions.">
        <label style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--faf-text-2)', marginBottom: 5, display: 'block' }}>
          Accent colour
        </label>

        {/* THE ACCENT TRACK.
            The slider paints the colours it actually produces. A grey rail
            with a number next to it makes you drag and check, drag and check;
            a rail showing the colours lets you aim. The stops are the arc
            prismTheme.js generates (crimson → amber → emerald, no cyan or
            purple), so what you point at is what you get. The position is
            read back with getPrism(), which is what is actually painted. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <input
            type="range"
            min="0"
            max="100"
            value={Math.round((getPrism()) * 100)}
            onChange={(e) => handleUpdate('prism', Number(e.target.value) / 100)}
            className="prism-range"
            style={{ flex: 1, accentColor: accentHex(getPrism()) }}
          />
          <span
            aria-hidden="true"
            style={{
              width: 26, height: 26, borderRadius: 6, flexShrink: 0,
              background: accentHex(getPrism()),
              boxShadow: `0 0 8px ${accentHex(getPrism())}`,
              border: '1px solid rgba(255,255,255,0.12)',
            }}
          />
          <button
            type="button"
            onClick={() => handleUpdate('prism', (((getPrism()) * 100 + 17) % 101) / 100)}
            style={{
              padding: '6px 14px',
              borderRadius: 999,
              border: '1px solid rgba(43,232,160,0.5)',
              background: 'rgba(43,232,160,0.12)',
              color: '#2BE8A0',
              fontSize: '0.7rem',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              cursor: 'pointer',
              fontFamily: 'var(--faf-font)'
            }}
          >
            Shift
          </button>
        </div>
        {/* The five named accents from the design system, as one click each.
            The slider is continuous and always will be — this is for the
            person who wants "the amber one" and does not care where on the
            wheel it lives. */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 9 }}>
          {ACCENT_PRESETS.map((p) => (
            <button
              key={p.name}
              type="button"
              onClick={() => handleUpdate('prism', p.t)}
              data-help={`Set the accent to ${p.name}.`}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '4px 10px', borderRadius: 999, cursor: 'pointer',
                fontSize: '0.62rem', letterSpacing: '0.06em',
                background: 'var(--bg-slate)',
                border: '1px solid rgba(255,255,255,0.12)',
                color: 'var(--text-secondary)',
              }}
            >
              <span aria-hidden="true" style={{
                width: 8, height: 8, borderRadius: '50%',
                background: p.hex, boxShadow: `0 0 6px ${p.hex}`,
              }} />
              {p.name}
            </button>
          ))}
        </div>

        <p style={{ fontSize: '0.65rem', color: 'rgba(155,161,170,0.45)', marginTop: 7, lineHeight: 1.5 }}>
          {PRISM_NAMES[Math.round((getPrism()) * (PRISM_NAMES.length - 1))]}
          {' '}<span className="ql-mono">{accentHex(getPrism()).toUpperCase()}</span>
          {' — '}moves the accent across the app. Amber is home.
        </p>
      </div>

      {/* ── ANONYMOUS USAGE STATS ─────────────────────────────────────────
          RENDERS ONLY IN A BUILD THAT ACTUALLY COLLECTS SOMETHING. In the
          air-gapped commercial build analyticsEnabled() is false, posthog-js is
          not even in the bundle, and this whole block is absent — a switch that
          turns off something that was never on is worse than no switch: it
          implies collection is happening.

          The list is exhaustive on purpose. "We collect anonymous usage data"
          is the sentence every product says and nobody believes; naming the
          five events and naming what is excluded is the only version of this
          disclosure worth writing. */}
      {analyticsEnabled() && (
        <div style={{ marginBottom: 18 }} data-help="Anonymous feature usage only — which tools get opened and which engines get run. Never your lyrics, keywords, prompts, file names or audio. Turning this off stops collection on this machine immediately.">
          <label style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--accent-neon)', marginBottom: 5, display: 'block' }}>
            Anonymous usage stats
          </label>
          <button
            type="button"
            onClick={() => {
              const next = !statsOn;
              setStatsOn(next);
              try { localStorage.setItem('lyricist.analytics.optout', next ? '0' : '1'); } catch { /* private mode */ }
              if (next) optIn(); else optOut();
            }}
            style={{
              display: 'flex', alignItems: 'center', gap: 9,
              padding: '8px 14px', borderRadius: 8, cursor: 'pointer',
              background: 'var(--bg-slate)',
              border: '1px solid rgba(255,255,255,0.12)',
              color: 'var(--text-secondary)', fontSize: '0.74rem',
            }}
          >
            <span aria-hidden="true" style={{
              width: 8, height: 8, borderRadius: '50%',
              background: statsOn ? 'var(--accent-emerald)' : 'var(--text-dim)',
              boxShadow: statsOn ? '0 0 0 1px var(--accent-emerald)' : 'none',
            }} />
            {statsOn ? 'Sharing anonymous usage stats' : 'Not sharing — collection is off'}
          </button>
          <p style={{ fontSize: '0.65rem', color: 'rgba(155,161,170,0.45)', marginTop: 6, lineHeight: 1.55 }}>
            Collected: which tab you opened, that a grid was loaded, that a verse was generated,
            that an album was exported, that a stem split was requested — plus counts and engine
            names. <b>Never collected:</b> your lyrics, keywords, prompts, model output, file names,
            file paths, audio, or API keys.
          </p>
        </div>
      )}

      {/* Stemmer cloud key (optional) */}
      <div style={{ marginBottom: 18 }} data-help="Optional. Only needed for high-fidelity Cloud stem extraction. Local and Offline modes work with no key and no GPU. Cloud mode runs Demucs on Replicate’s servers under your own key, which is how a 4 GB VRAM machine gets pro stems.">
        <label style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(155,161,170,0.7)', marginBottom: 5, display: 'block' }}>
          Cloud Stem Extraction Key (Replicate) — optional
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type={showGoogleKey ? 'text' : 'password'}
            value={store.config.replicateApiKey || ''}
            onChange={(e) => handleUpdate('replicateApiKey', e.target.value)}
            placeholder="r8_… (only for Stemmer Cloud mode)"
            style={{
              flex: 1,
              background: 'rgba(16,18,21,0.7)',
              border: '1px solid rgba(231,165,64,0.28)',
              borderRadius: 8,
              padding: '8px 11px',
              fontSize: '0.84rem',
              color: '#e6e8eb',
              outline: 'none',
              fontFamily: 'var(--faf-font)'
            }}
          />
        </div>
        <p style={{ fontSize: '0.65rem', color: 'rgba(155,161,170,0.45)', marginTop: 5, lineHeight: 1.5 }}>
          Offline Stemmer needs nothing — it runs on your CPU. Cloud mode uses{' '}
          <a href="https://replicate.com/account/api-tokens" target="_blank" rel="noopener noreferrer" style={{ color: '#e7a540', textDecoration: 'underline' }}>
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
              border: `1px solid ${(store.config.stemmerMode || 'offline') === 'offline' ? 'rgba(231,165,64,0.65)' : 'rgba(100,100,120,0.35)'}`,
              background: (store.config.stemmerMode || 'offline') === 'offline' ? 'rgba(231,165,64,0.15)' : 'rgba(16,18,21,0.5)',
              color: '#e6e8eb',
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
              border: `1px solid ${store.config.stemmerMode === 'cloud' ? 'rgba(155,161,170,0.7)' : 'rgba(100,100,120,0.35)'}`,
              background: store.config.stemmerMode === 'cloud' ? 'rgba(155,161,170,0.18)' : 'rgba(16,18,21,0.5)',
              color: '#e6e8eb',
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
        <label style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(155,161,170,0.7)', marginBottom: 5, display: 'block' }}>
          Assistant Model
        </label>
        <ModelSelector
          value={store.config.model}
          onChange={(modelId) => handleUpdate('model', modelId)}
        />
      </div>

      {/* Multi-Model Fusion */}
      <div style={{ marginBottom: 22, background: 'rgba(231,165,64,0.06)', border: '1px solid rgba(231,165,64,0.22)', borderRadius: 10, padding: 14 }} data-help="Fusion Mode sends your song idea to multiple AI models at the same time, then combines the best parts of each result into one final version. It uses more of your API credits but often produces richer, more creative lyrics because each model thinks differently.">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(255,150,200,0.8)' }}>
              Multi-Model Fusion · NEW
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
              fontFamily: 'var(--faf-font)',
              background: store.config.fusionEnabled ? 'linear-gradient(135deg,#E7A540,#9ba1aa)' : 'rgba(53,55,58,0.6)',
              color: store.config.fusionEnabled ? '#fff' : 'rgba(155,161,170,0.6)',
              boxShadow: store.config.fusionEnabled ? '0 0 0 1px rgba(231,165,64,0.5)' : 'none',
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
      <div style={{ marginBottom: 22, background: 'rgba(231,165,64,0.06)', border: '1px solid rgba(231,165,64,0.22)', borderRadius: 10, padding: 14 }}>
        <div style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(231,165,64,0.85)', marginBottom: 3 }}>
          <Icon i={Hammer} />Song Forge — OpenRouter (Song + Cover Art)
        </div>
        <p style={{ fontSize: '0.68rem', color: 'rgba(230,232,235,0.75)', marginBottom: 12, lineHeight: 1.4 }}>
          Song Forge uses <strong>the same OpenRouter key</strong> as the rest of Lyricist — one key for lyrics
          and for Nano Banana cover art (image models on OpenRouter). No Google AI Studio key. No second account.
        </p>

        <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 200px' }} data-help="Image model on OpenRouter for cover art (Nano Banana 2 family when available on your account). Lyrics still use the main OpenRouter model above.">
            <label style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(155,161,170,0.7)', marginBottom: 5, display: 'block' }}>
              Cover Art Model (OpenRouter)
            </label>
            <select
              value={store.config.geminiImageModel || DEFAULT_IMAGE_MODEL}
              onChange={(e) => handleUpdate('geminiImageModel', e.target.value)}
              style={{
                width: '100%',
                background: 'rgba(16,18,21,0.7)',
                border: '1px solid rgba(231,165,64,0.25)',
                borderRadius: 8,
                padding: '8px 11px',
                fontSize: '0.78rem',
                color: '#e6e8eb',
                outline: 'none',
                fontFamily: 'var(--faf-font)'
              }}
            >
              {/* Driven from GeminiService so there is ONE list of image models.
                  The hand-written options here were two thirds dead: a renamed
                  Gemini id and a Flux model that does not exist on OpenRouter. */}
              {IMAGE_MODELS.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          </div>

          <div style={{ flex: '1 1 120px' }} data-help="Shape of the cover art canvas before it's framed into the circular medallion. 1:1 (square) works best for the medallion look.">
            <label style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(155,161,170,0.7)', marginBottom: 5, display: 'block' }}>
              Aspect Ratio
            </label>
            <select
              value={store.config.imageAspectRatio}
              onChange={(e) => handleUpdate('imageAspectRatio', e.target.value)}
              style={{
                width: '100%',
                background: 'rgba(16,18,21,0.7)',
                border: '1px solid rgba(231,165,64,0.25)',
                borderRadius: 8,
                padding: '8px 11px',
                fontSize: '0.78rem',
                color: '#e6e8eb',
                outline: 'none',
                fontFamily: 'var(--faf-font)'
              }}
            >
              {['1:1', '4:5', '3:4', '5:4', '4:3', '16:9', '9:16'].map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          <div style={{ flex: '1 1 120px' }} data-help="Resolution of the generated cover art. Higher looks sharper on big screens but costs a bit more and takes longer.">
            <label style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(155,161,170,0.7)', marginBottom: 5, display: 'block' }}>
              Resolution
            </label>
            <select
              value={store.config.imageSize}
              onChange={(e) => handleUpdate('imageSize', e.target.value)}
              style={{
                width: '100%',
                background: 'rgba(16,18,21,0.7)',
                border: '1px solid rgba(231,165,64,0.25)',
                borderRadius: 8,
                padding: '8px 11px',
                fontSize: '0.78rem',
                color: '#e6e8eb',
                outline: 'none',
                fontFamily: 'var(--faf-font)'
              }}
            >
              {['1K', '2K', '4K'].map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>

        <div data-help="Song Forge's default look frames every cover in a circular medallion with a magenta-to-orange neon glow. Type your own art style here to override that default — leave it blank to keep the signature Lyricist look.">
          <label style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(155,161,170,0.7)', marginBottom: 5, display: 'block' }}>
            Custom Cover Art Style (optional — overrides the default medallion look)
          </label>
          <textarea
            value={store.config.customArtStyle}
            onChange={(e) => handleUpdate('customArtStyle', e.target.value)}
            placeholder="Leave blank to use Lyricist's signature circular medallion with magenta/orange neon glow..."
            rows={2}
            style={{
              width: '100%',
              background: 'rgba(16,18,21,0.7)',
              border: '1px solid rgba(231,165,64,0.25)',
              borderRadius: 8,
              padding: '8px 11px',
              fontSize: '0.76rem',
              color: '#e6e8eb',
              outline: 'none',
              resize: 'vertical',
              fontFamily: 'var(--faf-font)'
            }}
          />
        </div>
      </div>

      {/* Temperature */}
      <div style={{ marginBottom: 18 }} data-help="How wild or safe the AI gets. Slide left for predictable, on-the-nose lyrics; slide right for surprising, out-there ideas. Around 0.7–1.0 is a good sweet spot for most songs. ('Temperature' is just the AI word for this.)">
        <label style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(155,161,170,0.7)', marginBottom: 5, display: 'block' }}>
          Creativity / Temperature — <span style={{ color: '#9ba1aa' }}>{store.config.temperature}</span>
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
          style={{ width: '100%', accentColor: '#9ba1aa' }}
        />
        <div style={{ display: 'flex', fontSize: '0.62rem', color: 'rgba(155,161,170,0.35)', marginTop: 3, justifyContent: 'space-between' }}>
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
        <label style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(155,161,170,0.7)', marginBottom: 5, display: 'block' }}>
          Max Response Length — <span style={{ color: '#9ba1aa' }}>{store.config.maxTokens} tokens</span>
        </label>
        <input
          type="range"
          min="500"
          max="4000"
          step="100"
          value={store.config.maxTokens}
          onChange={(e) => handleUpdate('maxTokens', parseInt(e.target.value))}
          style={{ width: '100%', accentColor: '#9ba1aa' }}
        />
        <div style={{ display: 'flex', justifyBetween: 'space-between', fontSize: '0.62rem', color: 'rgba(155,161,170,0.35)', marginTop: 3, justifyContent: 'space-between' }}>
          <span>500</span>
          <span>2000</span>
          <span>4000</span>
        </div>
      </div>

      {/* Your own voice — the voice pack folder */}
      <div style={{ marginBottom: 18 }} data-help="Record the tour in your own voice instead of the built-in one. Click the button, drop your recordings in the folder that opens, and restart the app. Name them splash.mp3 for the opening video and card-01.mp3 through card-18.mp3 for the tour cards. Anything you don't record keeps the built-in voice.">
        <label style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(155,161,170,0.7)', marginBottom: 5, display: 'block' }}>
          Your Own Voice — <span style={{ color: voiceCount > 0 ? '#34d399' : '#9ba1aa' }}>
            {voiceCount > 0 ? `${voiceCount} recording${voiceCount === 1 ? '' : 's'} in use` : 'using the built-in voice'}
          </span>
        </label>
        <p style={{ fontSize: '0.72rem', color: 'rgba(230,232,235,0.6)', margin: '0 0 8px', lineHeight: 1.5 }}>
          Drop your own recordings in this folder and the app plays them instead of the built-in
          narration — <code style={{ color: '#e7a540' }}>splash.mp3</code> over the opening video,
          <code style={{ color: '#e7a540' }}> card-01.mp3</code> to <code style={{ color: '#e7a540' }}>card-18.mp3</code> for
          the tour. mp3, m4a, wav and ogg all work. Restart the app to pick up new files.
        </p>
        <button
          onClick={openVoiceFolder}
          style={{
            padding: '8px 18px',
            borderRadius: 8,
            border: '1px solid rgba(52,211,153,0.4)',
            background: 'rgba(16,18,21,0.7)',
            color: '#34d399',
            fontSize: '0.78rem',
            fontWeight: 700,
            cursor: 'pointer',
            fontFamily: 'var(--faf-font)',
          }}
        >
          <Icon i={FolderOpen} />Open my voice folder
        </button>
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
            fontFamily: 'var(--faf-font)',
            cursor: 'pointer'
          }}
        >
          {saved ? 'Saved' : 'Save Settings'}
        </button>

        <button
          onClick={handleReset}
          data-help="Puts all settings back to their starting values. Your API key gets cleared too, so you'd need to paste it back in. It asks you to confirm first."
          style={{
            padding: '9px 22px',
            borderRadius: 8,
            border: '1px solid rgba(155,161,170,0.25)',
            background: 'rgba(16,18,21,0.7)',
            color: 'rgba(230,232,235,0.6)',
            fontSize: '0.84rem',
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'var(--faf-font)'
          }}
        >
          Reset to Defaults
        </button>
      </div>

      {/* Config Summary panel */}
      <div style={{ background: 'rgba(16,18,21,0.8)', border: '1px solid rgba(155,161,170,0.2)', borderRadius: 10, padding: 16 }}>
        <div style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(155,161,170,0.5)', marginBottom: 10 }}>
          Current Configuration Status
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[
            ['API Key Status', store.config.openRouterApiKey ? 'Configured' : 'Not configured', store.config.openRouterApiKey ? '#34d399' : '#f87171'],
            ['Active Model', store.config.model, '#e6e8eb'],
            ['Assistant Temperature', store.config.temperature, '#e6e8eb'],
            ['Token Cap', store.config.maxTokens, '#e6e8eb'],
            ['Song Forge (OpenRouter)', store.config.openRouterApiKey ? 'Same key as studio' : 'OpenRouter key needed', store.config.openRouterApiKey ? '#34d399' : '#f87171'],
            ['Song Forge Text Model', store.config.geminiTextModel, '#e7a540'],
            ['Song Forge Art Model', store.config.geminiImageModel, '#e7a540']
          ].map(([k, v, c]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.75rem', color: 'rgba(230,232,235,0.7)' }}>{k}</span>
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
