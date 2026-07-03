import React, { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, GripVertical, Download, Disc3 } from 'lucide-react';

// "The Universal Solvent" Album Architect — Lyricist 4.1.3
// Project-management view for shaping up to 12 tracks into a cohesive concept
// album: drag-and-drop track reordering (native HTML5 DnD — no libraries) and
// global metadata editing (album title, artist, genre, master tempo, concept).
// Everything persists locally.

const STORE_KEY = 'lyricistAlbumArchitect_v1';
const MAX_TRACKS = 12;

const DEFAULT_ALBUM = {
  title: 'The Universal Solvent',
  artist: '',
  genre: '',
  masterTempo: 120,
  concept: '',
  tracks: []
};

let nextId = Date.now();

export default function AlbumArchitect() {
  const [album, setAlbum] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      if (saved?.tracks) return saved;
    } catch { /* fresh album */ }
    return DEFAULT_ALBUM;
  });
  const [dragIndex, setDragIndex] = useState(null);
  const [overIndex, setOverIndex] = useState(null);
  const [saveNote, setSaveNote] = useState('');
  const dragNode = useRef(null);

  useEffect(() => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(album)); } catch { /* storage full */ }
  }, [album]);

  const setMeta = (patch) => setAlbum(prev => ({ ...prev, ...patch }));

  const addTrack = () => {
    if (album.tracks.length >= MAX_TRACKS) return;
    setAlbum(prev => ({
      ...prev,
      tracks: [...prev.tracks, {
        id: ++nextId,
        title: `Track ${prev.tracks.length + 1}`,
        bpm: prev.masterTempo,
        key: '',
        notes: ''
      }]
    }));
  };

  const updateTrack = (id, patch) =>
    setAlbum(prev => ({ ...prev, tracks: prev.tracks.map(t => t.id === id ? { ...t, ...patch } : t) }));

  const removeTrack = (id) =>
    setAlbum(prev => ({ ...prev, tracks: prev.tracks.filter(t => t.id !== id) }));

  // ── Native HTML5 drag-and-drop reorder ──
  const onDragStart = (e, index) => {
    setDragIndex(index);
    dragNode.current = e.currentTarget;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index)); // Firefox requires data
  };
  const onDragOver = (e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (index !== overIndex) setOverIndex(index);
  };
  const onDrop = (e, index) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === index) { setDragIndex(null); setOverIndex(null); return; }
    setAlbum(prev => {
      const tracks = [...prev.tracks];
      const [moved] = tracks.splice(dragIndex, 1);
      tracks.splice(index, 0, moved);
      return { ...prev, tracks };
    });
    setDragIndex(null);
    setOverIndex(null);
  };
  const onDragEnd = () => { setDragIndex(null); setOverIndex(null); };

  // Apply the master tempo across every track in one click.
  const applyMasterTempo = () =>
    setAlbum(prev => ({ ...prev, tracks: prev.tracks.map(t => ({ ...t, bpm: prev.masterTempo })) }));

  const exportTracklist = async () => {
    const lines = [
      `${album.title || 'Untitled Album'}${album.artist ? ` — ${album.artist}` : ''}`,
      `Genre: ${album.genre || '—'} · Master tempo: ${album.masterTempo} BPM`,
      album.concept ? `Concept: ${album.concept}` : '',
      '',
      ...album.tracks.map((t, i) =>
        `${String(i + 1).padStart(2, '0')}. ${t.title}${t.key ? ` [${t.key}]` : ''} · ${t.bpm} BPM${t.notes ? ` — ${t.notes}` : ''}`)
    ].filter(Boolean);
    const content = lines.join('\r\n');
    const filename = `${(album.title || 'album').replace(/[\\/:*?"<>|]/g, '-')} - tracklist.txt`;

    if (window.lyricistAPI?.saveReport) {
      const res = await window.lyricistAPI.saveReport(filename, content);
      setSaveNote(res?.ok ? `✓ Saved: ${res.path}` : `Could not save: ${res?.error}`);
      setTimeout(() => setSaveNote(''), 6000);
    } else {
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }
  };

  return (
    <div style={{ flex: 1, minHeight: 0, width: '100%', display: 'flex', overflow: 'hidden', background: '#000' }}>
      <div className="album-shell">
        {/* Global metadata sidebar */}
        <div className="album-sidebar">
          <div>
            <h3 style={{ fontSize: '1rem', marginBottom: 4 }}>💿 Album Architect</h3>
            <p style={{ fontSize: '0.72rem', color: 'rgba(196,181,253,0.7)', lineHeight: 1.5 }}>
              “The Universal Solvent” view — shape up to {MAX_TRACKS} tracks into one cohesive
              concept album. Drag tracks to reorder; the metadata here applies to the whole record.
            </p>
          </div>

          <div data-help="The album's global metadata — title, artist, genre, and the concept holding it together.">
            <label style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', display: 'block', marginBottom: 5 }}>Album Title</label>
            <input className="input-cosmic" style={{ width: '100%', borderRadius: 8, padding: '8px 10px', fontSize: '0.8rem' }}
              value={album.title} onChange={(e) => setMeta({ title: e.target.value })} />
          </div>

          <div>
            <label style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', display: 'block', marginBottom: 5 }}>Artist</label>
            <input className="input-cosmic" style={{ width: '100%', borderRadius: 8, padding: '8px 10px', fontSize: '0.8rem' }}
              value={album.artist} onChange={(e) => setMeta({ artist: e.target.value })} placeholder="Who's this record by?" />
          </div>

          <div>
            <label style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', display: 'block', marginBottom: 5 }}>Genre</label>
            <input className="input-cosmic" style={{ width: '100%', borderRadius: 8, padding: '8px 10px', fontSize: '0.8rem' }}
              value={album.genre} onChange={(e) => setMeta({ genre: e.target.value })} placeholder="e.g. Neon Americana" />
          </div>

          <div data-help="The album's global tempo anchor. 'Apply to all tracks' stamps it onto every track's BPM in one click.">
            <label style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', display: 'block', marginBottom: 5 }}>
              Master Tempo: {album.masterTempo} BPM
            </label>
            <input type="range" min={40} max={220} value={album.masterTempo}
              onChange={(e) => setMeta({ masterTempo: Number(e.target.value) })}
              className="suno-range" style={{ width: '100%' }} />
            <button onClick={applyMasterTempo} className="suno-chip" style={{ marginTop: 8, width: '100%', justifyContent: 'center' }}>
              Apply to all tracks
            </button>
          </div>

          <div data-help="The through-line of the record — the theme, story, or feeling every track dissolves into.">
            <label style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', display: 'block', marginBottom: 5 }}>Album Concept</label>
            <textarea className="input-cosmic" rows={4}
              style={{ width: '100%', borderRadius: 8, padding: '8px 10px', fontSize: '0.76rem', resize: 'vertical' }}
              value={album.concept} onChange={(e) => setMeta({ concept: e.target.value })}
              placeholder="What's the story this album tells from track 1 to track 12?" />
          </div>

          <button onClick={exportTracklist} className="btn-neon-cyan"
            data-help="Export the full tracklist + metadata as a .txt file (saved to Documents in the desktop app)."
            style={{ border: 'none', color: '#fff', padding: '10px', borderRadius: 8, fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <Download size={14} /> Export Tracklist
          </button>
          {saveNote && <span style={{ fontSize: '0.64rem', color: '#34d399', fontWeight: 600 }}>{saveNote}</span>}
        </div>

        {/* Track list */}
        <div className="album-main">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 10, flexWrap: 'wrap' }}>
            <h4 style={{ margin: 0, fontSize: '0.9rem' }}>
              <Disc3 size={15} style={{ verticalAlign: '-2px', marginRight: 6 }} />
              Tracklist — {album.tracks.length}/{MAX_TRACKS}
            </h4>
            <button onClick={addTrack} disabled={album.tracks.length >= MAX_TRACKS} className="btn-neon-purple"
              data-help="Add a track slot (up to 12). Drag the grip handle to reorder."
              style={{ border: 'none', color: '#fff', padding: '8px 16px', borderRadius: 8, fontSize: '0.74rem', fontWeight: 700, cursor: album.tracks.length >= MAX_TRACKS ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6, opacity: album.tracks.length >= MAX_TRACKS ? 0.5 : 1 }}>
              <Plus size={13} /> Add Track
            </button>
          </div>

          {!album.tracks.length && (
            <div className="card-cosmic" style={{ borderRadius: 12, padding: 30, textAlign: 'center', color: 'rgba(196,181,253,0.65)', fontSize: '0.8rem' }}>
              No tracks yet. Add up to 12 and drag them into the order the story wants to be told in.
            </div>
          )}

          {album.tracks.map((t, i) => (
            <div
              key={t.id}
              className={`card-cosmic album-track ${i === dragIndex ? 'album-track--dragging' : ''} ${i === overIndex && dragIndex !== null && i !== dragIndex ? 'album-track--dragover' : ''}`}
              draggable
              onDragStart={(e) => onDragStart(e, i)}
              onDragOver={(e) => onDragOver(e, i)}
              onDrop={(e) => onDrop(e, i)}
              onDragEnd={onDragEnd}
              data-help="Drag anywhere on the row to move this track. Edit the title, BPM, key, and notes inline."
            >
              <GripVertical size={15} style={{ color: 'rgba(255,45,149,0.55)', flexShrink: 0 }} />
              <span className="album-track-num">{i + 1}</span>
              <input
                className="album-input"
                style={{ flex: 2, fontWeight: 700, fontFamily: "'Audiowide', sans-serif", color: '#ff9e2c' }}
                value={t.title}
                onChange={(e) => updateTrack(t.id, { title: e.target.value })}
                onMouseDown={(e) => e.stopPropagation()}
                draggable={false}
              />
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.62rem', flexShrink: 0 }}>
                BPM
                <input type="number" min={40} max={220} className="album-input" style={{ width: 46, textAlign: 'center' }}
                  value={t.bpm} onChange={(e) => updateTrack(t.id, { bpm: Number(e.target.value) || 0 })}
                  onMouseDown={(e) => e.stopPropagation()} draggable={false} />
              </label>
              <input className="album-input" style={{ width: 56, textAlign: 'center', flexShrink: 0 }} placeholder="Key"
                value={t.key} onChange={(e) => updateTrack(t.id, { key: e.target.value })}
                onMouseDown={(e) => e.stopPropagation()} draggable={false} />
              <input className="album-input" style={{ flex: 3 }} placeholder="Notes — where does this sit in the concept?"
                value={t.notes} onChange={(e) => updateTrack(t.id, { notes: e.target.value })}
                onMouseDown={(e) => e.stopPropagation()} draggable={false} />
              <button onClick={() => removeTrack(t.id)} className="suno-btn" aria-label={`Remove ${t.title}`}
                style={{ color: '#f87171', borderColor: 'rgba(248,113,113,0.4)' }}>
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
