import React, { useState, useEffect, useMemo } from 'react';
import { ArrowBigUp, Plus, ExternalLink, Search, X } from 'lucide-react';

import TabBackground from '../common/TabBackground.jsx';
// Community AI Tools Hub — Lyricist 4.1.3
// A browsable tab where users share, upvote, and access free developer AI
// tools. Ships seeded with CFunky's own free tools plus well-known free
// community picks; users can submit their own. Votes and submissions persist
// locally (localStorage) — swap SYNC_ENDPOINT in later if/when a community
// backend goes live, the read/write helpers are already isolated below.

const STORE_KEY = 'lyricistToolsHub_v1';

const SEED_TOOLS = [
  { id: 'cfunky-lyricist', name: 'Lyricist', url: 'https://cfunkycreationsllc.com', category: 'Music', votes: 12, seeded: true, description: 'This very app — AI songwriting studio with Ghost Rider artist analysis and Song Forge cover art. Always free.' },
  { id: 'suno', name: 'Suno', url: 'https://suno.com', category: 'Music', votes: 10, seeded: true, description: 'Generate full songs — vocals, instruments, mix — from a text prompt. Free tier available.' },
  { id: 'basic-pitch', name: 'Basic Pitch (Spotify)', url: 'https://basicpitch.spotify.com', category: 'Music', votes: 8, seeded: true, description: 'Open-source audio-to-MIDI converter — the same model powering Lyricist\'s MIDI Studio.' },
  { id: 'butterchurn', name: 'Butterchurn', url: 'https://butterchurnviz.com', category: 'Music', votes: 6, seeded: true, description: 'Open-source WebGL port of Winamp\'s Milkdrop 2 visualizer — powering the MIDI Studio visuals.' },
  { id: 'openrouter', name: 'OpenRouter', url: 'https://openrouter.ai', category: 'Dev', votes: 12, seeded: true, description: 'One API key for Lyricist — writing models and Nano Banana / image models for Song Forge cover art. No Google AI Studio key required.' },
  { id: 'huggingface', name: 'Hugging Face Spaces', url: 'https://huggingface.co/spaces', category: 'Dev', votes: 7, seeded: true, description: 'Thousands of free community AI demos and models you can run in the browser.' },
  { id: 'audacity', name: 'Audacity', url: 'https://www.audacityteam.org', category: 'Audio', votes: 5, seeded: true, description: 'Free, open-source multi-track audio editor — clean up recordings before feeding them to MIDI Studio.' },
  { id: 'lmstudio', name: 'LM Studio', url: 'https://lmstudio.ai', category: 'Dev', votes: 4, seeded: true, description: 'Run open-source LLMs locally on your own machine — free and private.' }
];

const CATEGORIES = ['All', 'Music', 'Audio', 'Dev', 'Art', 'Writing', 'Other'];

/** Two seeded rows once shipped with the same id, and that copy is saved in
 *  people's browsers. Drop repeats on the way in so React keeps unique keys. */
function dedupeById(tools) {
  const seen = new Set();
  return tools.filter((t) => (seen.has(t.id) ? false : seen.add(t.id)));
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (saved?.tools) return { ...saved, tools: dedupeById(saved.tools) };
  } catch { /* fresh start */ }
  return { tools: SEED_TOOLS, voted: [] };
}

export default function ToolsHub() {
  const [state, setState] = useState(loadState);
  const [category, setCategory] = useState('All');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('votes'); // 'votes' | 'newest'
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState({ name: '', url: '', category: 'Music', description: '' });
  const [formError, setFormError] = useState('');

  useEffect(() => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch { /* storage full */ }
  }, [state]);

  const upvote = (id) => {
    setState(prev => {
      const has = prev.voted.includes(id);
      return {
        tools: prev.tools.map(t => t.id === id ? { ...t, votes: t.votes + (has ? -1 : 1) } : t),
        voted: has ? prev.voted.filter(v => v !== id) : [...prev.voted, id]
      };
    });
  };

  const submit = () => {
    const name = draft.name.trim();
    const url = draft.url.trim();
    if (!name || !url) { setFormError('Name and URL are both required.'); return; }
    try { new URL(url); } catch { setFormError('That URL doesn\'t look valid — include the https://'); return; }
    if (state.tools.some(t => t.url.replace(/\/$/, '') === url.replace(/\/$/, ''))) {
      setFormError('That tool is already in the hub.'); return;
    }
    setState(prev => ({
      ...prev,
      tools: [{
        id: `user-${Date.now()}`,
        name, url,
        category: draft.category,
        description: draft.description.trim(),
        votes: 1,
        addedAt: Date.now()
      }, ...prev.tools]
    }));
    setDraft({ name: '', url: '', category: 'Music', description: '' });
    setFormError('');
    setShowForm(false);
  };

  const visible = useMemo(() => {
    let list = state.tools;
    if (category !== 'All') list = list.filter(t => t.category === category);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(t => t.name.toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => sort === 'votes'
      ? b.votes - a.votes
      : (b.addedAt || 0) - (a.addedAt || 0));
  }, [state.tools, category, query, sort]);

  return (
    <div className="tab-video-shell">
      <TabBackground name="toolshub" />
      <div className="tab-video-content">
    {/* Transparent so the tab's prism shows through. Solid black here painted
        over the whole moving background. */}
    <div style={{ flex: 1, minHeight: 0, width: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'transparent' }}>
      <div className="toolshub-main">
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
          <div style={{ marginRight: 'auto' }}>
            <h3 style={{ fontSize: '1.05rem', margin: 0 }}>🧰 Community AI Tools Hub</h3>
            <p style={{ fontSize: '0.72rem', color: 'rgba(196,181,253,0.7)', margin: '4px 0 0' }}>
              Free AI tools for the masses — share the ones you love, upvote the ones that earn it.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: 9, color: 'rgba(0,229,255,0.6)' }} />
            <input
              className="input-cosmic"
              style={{ borderRadius: 9999, padding: '6px 12px 6px 28px', fontSize: '0.74rem', width: 180 }}
              placeholder="Search tools..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <select value={sort} onChange={(e) => setSort(e.target.value)} className="input-cosmic"
            style={{ borderRadius: 8, padding: '6px 10px', fontSize: '0.72rem' }}
            data-help="Order the hub by community upvotes or by what was shared most recently.">
            <option value="votes">Top voted</option>
            <option value="newest">Newest</option>
          </select>

          <button onClick={() => setShowForm(s => !s)} className="btn-neon-purple"
            data-help="Share a free AI tool with the community. It shows up in the hub instantly."
            style={{ border: 'none', color: '#fff', padding: '8px 16px', borderRadius: 8, fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            {showForm ? <><X size={13} /> Cancel</> : <><Plus size={13} /> Share a Tool</>}
          </button>
        </div>

        {/* Category pills */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
          {CATEGORIES.map(c => (
            <button key={c} onClick={() => setCategory(c)}
              className={category === c ? 'pill-purple' : ''}
              style={{ padding: '4px 12px', borderRadius: 9999, fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer', background: category === c ? undefined : 'rgba(13,8,28,0.7)', color: category === c ? undefined : 'rgba(196,181,253,0.6)', border: category === c ? undefined : '1px solid rgba(139,92,246,0.25)' }}>
              {c}
            </button>
          ))}
        </div>

        {/* Submission form */}
        {showForm && (
          <div className="card-cosmic" style={{ borderRadius: 12, padding: 16, marginBottom: 18, display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
            <input className="input-cosmic" style={{ borderRadius: 8, padding: '8px 10px', fontSize: '0.76rem' }}
              placeholder="Tool name" value={draft.name} onChange={(e) => setDraft(d => ({ ...d, name: e.target.value }))} />
            <input className="input-cosmic" style={{ borderRadius: 8, padding: '8px 10px', fontSize: '0.76rem' }}
              placeholder="https://..." value={draft.url} onChange={(e) => setDraft(d => ({ ...d, url: e.target.value }))} />
            <select className="input-cosmic" style={{ borderRadius: 8, padding: '8px 10px', fontSize: '0.76rem' }}
              value={draft.category} onChange={(e) => setDraft(d => ({ ...d, category: e.target.value }))}>
              {CATEGORIES.filter(c => c !== 'All').map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <input className="input-cosmic" style={{ borderRadius: 8, padding: '8px 10px', fontSize: '0.76rem', gridColumn: '1 / -1' }}
              placeholder="One-line description — what makes it worth sharing?" value={draft.description}
              onChange={(e) => setDraft(d => ({ ...d, description: e.target.value }))}
              onKeyDown={(e) => e.key === 'Enter' && submit()} />
            {formError && <div className="pill-red" style={{ padding: '6px 10px', borderRadius: 8, fontSize: '0.68rem', gridColumn: '1 / -1' }}>{formError}</div>}
            <button onClick={submit} className="btn-neon-cyan" style={{ border: 'none', color: '#fff', padding: '9px', borderRadius: 8, fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer', gridColumn: '1 / -1' }}>
              Add to the Hub
            </button>
          </div>
        )}

        {/* Tool cards */}
        <div className="toolshub-grid">
          {visible.map(t => (
            <div key={t.id} className="card-cosmic toolshub-card">
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <button
                  className={`toolshub-vote ${state.voted.includes(t.id) ? 'toolshub-vote--voted' : ''}`}
                  onClick={() => upvote(t.id)}
                  data-help="Upvote tools you find genuinely useful. Click again to take it back."
                >
                  <ArrowBigUp size={16} />
                  {t.votes}
                </button>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 800, fontSize: '0.86rem', color: '#00e5ff', textShadow: '0 0 8px rgba(0,229,255,0.5)' }}>{t.name}</span>
                    <span className="pill-cyan" style={{ padding: '1px 8px', borderRadius: 9999, fontSize: '0.58rem', fontWeight: 700 }}>{t.category}</span>
                  </div>
                  <p style={{ fontSize: '0.7rem', color: 'rgba(232,224,255,0.75)', margin: '6px 0 0', lineHeight: 1.5 }}>
                    {t.description || 'No description yet.'}
                  </p>
                </div>
              </div>
              <a href={t.url} target="_blank" rel="noopener noreferrer"
                style={{ marginTop: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.68rem', fontWeight: 700, color: '#ff7eb6', textDecoration: 'none' }}>
                <ExternalLink size={12} /> Open tool
              </a>
            </div>
          ))}
          {!visible.length && (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', color: 'rgba(196,181,253,0.6)', fontSize: '0.8rem', padding: 30 }}>
              Nothing here yet — be the first to share a tool in this category.
            </div>
          )}
        </div>
      </div>
    </div>
      </div>
    </div>
  );
}
