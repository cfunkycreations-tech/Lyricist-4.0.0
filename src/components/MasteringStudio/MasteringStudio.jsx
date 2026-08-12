import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Disc3, Play, Pause, Upload, Trash2, GripVertical, Wand2, RefreshCw,
  Image as ImageIcon, Download, Library, Sparkles, CheckCircle2, X
} from 'lucide-react';
import { useLyricStore } from '../../context/LyricStore.jsx';
import { listRecordings, saveRecording } from '../../services/RecordingsStore.js';
import { masterTrack, MASTERING_PRESETS, DEFAULT_MASTERING } from '../../services/MasteringService.js';
import { generateImage, MANDATORY_MEDALLION_FRAME } from '../../services/GeminiService.js';
import { resumeAudio } from '../../services/audioEngine.js';

import TabVideoBg from '../common/TabVideoBg.jsx';
// Mastering Studio — Lyricist 4.1.3
// The last mile: pull the songs you've made (Recording Booth takes, Suno
// downloads, any audio) into an album, run each track through a real
// mastering chain (EQ → compression → limiter → loudness normalize, all
// offline via Web Audio), attach or AI-generate the cover, and export the
// finished album — numbered WAVs + cover + tracklist — in one shot.

const STORE_KEY = 'lyricistMasteringStudio_v1';
const MAX_TRACKS = 12;

let nextId = Date.now();

function fmtDb(v) { return `${v >= 0 ? '+' : ''}${v.toFixed(1)} dB`; }

export default function MasteringStudio({ onNavigate }) {
  const store = useLyricStore();

  const [meta, setMeta] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      if (saved) return saved;
    } catch { /* fresh */ }
    // Prefill from Album Architect's plan if one exists.
    try {
      const arch = JSON.parse(localStorage.getItem('lyricistAlbumArchitect_v1') || 'null');
      if (arch) return { title: arch.title || 'Untitled Album', artist: arch.artist || '', genre: arch.genre || '', year: new Date().getFullYear() };
    } catch { /* ignore */ }
    return { title: 'Untitled Album', artist: '', genre: '', year: new Date().getFullYear() };
  });

  // Tracks live in memory (blobs); their metadata + settings persist.
  const [tracks, setTracks] = useState([]); // { id, title, blob, mastered: {wavBlob, stats}|null, busy }
  const [settings, setSettings] = useState(DEFAULT_MASTERING);
  const [preset, setPreset] = useState('Warm Analog');
  const [cover, setCover] = useState(null); // { dataUrl, base64 }
  const [coverPrompt, setCoverPrompt] = useState('');
  const [coverLoading, setCoverLoading] = useState(false);
  const [medallion, setMedallion] = useState(true);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [library, setLibrary] = useState([]);
  const [masteringAll, setMasteringAll] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [playingKey, setPlayingKey] = useState(''); // `${trackId}:orig` | `${trackId}:mastered`
  const [dragIndex, setDragIndex] = useState(null);
  const [overIndex, setOverIndex] = useState(null);

  const fileRef = useRef(null);
  const coverFileRef = useRef(null);
  const previewRef = useRef(null);

  useEffect(() => {
    localStorage.setItem(STORE_KEY, JSON.stringify(meta));
  }, [meta]);

  const flash = (msg) => { setNote(msg); setTimeout(() => setNote(''), 6000); };

  // ── Adding tracks ──
  const openLibrary = async () => {
    try {
      setLibrary(await listRecordings());
      setLibraryOpen(true);
    } catch (e) { setError(`Could not open your takes library: ${e.message}`); }
  };

  const addFromLibrary = (rec) => {
    if (tracks.length >= MAX_TRACKS) return;
    setTracks(prev => [...prev, { id: ++nextId, title: rec.name, blob: rec.blob, mastered: null, busy: false }]);
  };

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files || []).slice(0, MAX_TRACKS - tracks.length);
    e.target.value = '';
    for (const f of files) {
      // Uploaded songs also land in the Booth library so they persist.
      try { await saveRecording({ name: f.name.replace(/\.[^.]+$/, ''), blob: f }); } catch { /* non-fatal */ }
      setTracks(prev => prev.length < MAX_TRACKS
        ? [...prev, { id: ++nextId, title: f.name.replace(/\.[^.]+$/, ''), blob: f, mastered: null, busy: false }]
        : prev);
    }
  };

  const removeTrack = (id) => setTracks(prev => prev.filter(t => t.id !== id));

  // ── Drag-and-drop reorder (same pattern as Album Architect) ──
  const onDragStart = (e, i) => { setDragIndex(i); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(i)); };
  const onDragOver = (e, i) => { e.preventDefault(); if (i !== overIndex) setOverIndex(i); };
  const onDrop = (e, i) => {
    e.preventDefault();
    if (dragIndex !== null && dragIndex !== i) {
      setTracks(prev => {
        const list = [...prev];
        const [m] = list.splice(dragIndex, 1);
        list.splice(i, 0, m);
        return list;
      });
    }
    setDragIndex(null); setOverIndex(null);
  };

  // ── Mastering ──
  const applyPreset = (name) => {
    setPreset(name);
    if (MASTERING_PRESETS[name]) setSettings({ ...MASTERING_PRESETS[name] });
    // Settings changed — previous masters are stale.
    setTracks(prev => prev.map(t => ({ ...t, mastered: null })));
  };

  const setSlider = (key, val) => {
    setSettings(prev => ({ ...prev, [key]: val }));
    setPreset('Custom');
    setTracks(prev => prev.map(t => ({ ...t, mastered: null })));
  };

  // Live ref so masterOne always sees the current track list.
  const tracksRef = useRef(tracks);
  useEffect(() => { tracksRef.current = tracks; }, [tracks]);

  const masterOne = useCallback(async (id) => {
    setTracks(prev => prev.map(t => t.id === id ? { ...t, busy: true } : t));
    setError('');
    try {
      const track = tracksRef.current.find(t => t.id === id);
      if (!track) throw new Error('Track not found.');
      const result = await masterTrack(track.blob, settings);
      setTracks(prev => prev.map(t => t.id === id ? { ...t, mastered: result, busy: false } : t));
      return true;
    } catch (e) {
      setError(`Mastering failed: ${e.message}`);
      setTracks(prev => prev.map(t => t.id === id ? { ...t, busy: false } : t));
      return false;
    }
  }, [settings]);

  const masterAll = async () => {
    setMasteringAll(true);
    for (const t of tracksRef.current) {
      if (!t.mastered) {
        const ok = await masterOne(t.id);
        if (!ok) break;
      }
    }
    setMasteringAll(false);
  };

  // ── A/B preview ──
  const preview = async (track, which) => {
    await resumeAudio();
    const el = previewRef.current;
    if (!el) return;
    const key = `${track.id}:${which}`;
    if (playingKey === key) { el.pause(); setPlayingKey(''); return; }
    const blob = which === 'mastered' ? track.mastered?.wavBlob : track.blob;
    if (!blob) return;
    el.src = URL.createObjectURL(blob);
    el.onended = () => setPlayingKey('');
    try { await el.play(); setPlayingKey(key); }
    catch (e) { setError(`Preview failed: ${e.message}`); }
  };

  // ── Cover art ──
  const handleCoverUpload = (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setCover({ dataUrl: String(reader.result), base64: String(reader.result).split(',')[1] || '' });
    reader.readAsDataURL(f);
  };

  const generateCover = async () => {
    if (!store.config.openRouterApiKey) { setError('Add your OpenRouter API key in Settings to generate cover art (same key as the rest of Lyricist).'); return; }
    setCoverLoading(true);
    setError('');
    try {
      const base = coverPrompt.trim() ||
        `Album cover art for "${meta.title}"${meta.artist ? ` by ${meta.artist}` : ''}` +
        `${meta.genre ? `, a ${meta.genre} record` : ''}.`;
      const prompt = medallion ? `${base}\n\n${MANDATORY_MEDALLION_FRAME}` : base;
      const img = await generateImage(store, { prompt });
      setCover({ dataUrl: img.dataUrl, base64: img.base64 });
    } catch (e) {
      setError(e.message);
    } finally {
      setCoverLoading(false);
    }
  };

  // ── Export ──
  const allMastered = tracks.length > 0 && tracks.every(t => t.mastered);
  const exportAlbum = async () => {
    if (!allMastered) return;
    setExporting(true);
    setError('');
    try {
      const tracklist = [
        `${meta.title}${meta.artist ? ` — ${meta.artist}` : ''} (${meta.year})`,
        meta.genre ? `Genre: ${meta.genre}` : '',
        `Mastered in Lyricist 4.1.3 — preset: ${preset}`,
        '',
        ...tracks.map((t, i) => `${String(i + 1).padStart(2, '0')}. ${t.title} (${t.mastered.stats.duration.toFixed(0)}s)`)
      ].filter(Boolean).join('\r\n');

      if (window.lyricistAPI?.saveAlbum) {
        const files = [];
        for (let i = 0; i < tracks.length; i++) {
          const t = tracks[i];
          files.push({
            filename: `${String(i + 1).padStart(2, '0')} - ${t.title}.wav`,
            bytes: new Uint8Array(await t.mastered.wavBlob.arrayBuffer())
          });
        }
        if (cover) {
          files.push({ filename: 'cover.png', bytes: Uint8Array.from(atob(cover.base64), c => c.charCodeAt(0)) });
        }
        files.push({ filename: 'tracklist.txt', bytes: new TextEncoder().encode(tracklist) });
        const res = await window.lyricistAPI.saveAlbum(meta.title || 'Untitled Album', files);
        if (res?.ok) flash(`✓ Album exported: ${res.path}`);
        else setError(`Export failed: ${res?.error || 'unknown error'}`);
      } else {
        // Browser fallback: sequential downloads.
        const dl = (blob, name) => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url; a.download = name.replace(/[\\/:*?"<>|]/g, '-'); a.click();
          setTimeout(() => URL.revokeObjectURL(url), 8000);
        };
        tracks.forEach((t, i) => dl(t.mastered.wavBlob, `${String(i + 1).padStart(2, '0')} - ${t.title}.wav`));
        if (cover) dl(await (await fetch(cover.dataUrl)).blob(), 'cover.png');
        dl(new Blob([tracklist], { type: 'text/plain' }), 'tracklist.txt');
        flash('✓ Album files downloading');
      }
    } catch (e) {
      setError(`Export failed: ${e.message}`);
    } finally {
      setExporting(false);
    }
  };

  const busyAny = masteringAll || tracks.some(t => t.busy);

  return (
    <div className="tab-video-shell">
      <TabVideoBg name="mastering" />
      <div className="tab-video-content">
    <div style={{ flex: 1, minHeight: 0, width: '100%', display: 'flex', overflow: 'hidden', background: '#000' }}>
      <audio ref={previewRef} style={{ display: 'none' }} />
      <div className="album-shell">
        {/* Sidebar: metadata, cover, mastering chain */}
        <div className="album-sidebar">
          <div>
            <h3 style={{ fontSize: '1rem', marginBottom: 4 }}>💽 Mastering Studio</h3>
            <p style={{ fontSize: '0.72rem', color: 'rgba(196,181,253,0.7)', lineHeight: 1.5 }}>
              The finish line: gather the songs you've made, master them with a real
              EQ → compression → limiter chain (all offline), add the cover, and export
              the album in one shot.
            </p>
          </div>

          <div>
            <label style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', display: 'block', marginBottom: 5 }}>Album Title</label>
            <input className="input-cosmic" style={{ width: '100%', borderRadius: 8, padding: '8px 10px', fontSize: '0.8rem' }}
              value={meta.title} onChange={(e) => setMeta(m => ({ ...m, title: e.target.value }))} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <label style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', display: 'block', marginBottom: 5 }}>Artist</label>
              <input className="input-cosmic" style={{ width: '100%', borderRadius: 8, padding: '8px 10px', fontSize: '0.76rem' }}
                value={meta.artist} onChange={(e) => setMeta(m => ({ ...m, artist: e.target.value }))} />
            </div>
            <div>
              <label style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', display: 'block', marginBottom: 5 }}>Genre</label>
              <input className="input-cosmic" style={{ width: '100%', borderRadius: 8, padding: '8px 10px', fontSize: '0.76rem' }}
                value={meta.genre} onChange={(e) => setMeta(m => ({ ...m, genre: e.target.value }))} />
            </div>
          </div>

          {/* Cover art */}
          <div data-help="The album cover. Upload your own, or have Nano Banana paint one from the album's title and genre — with the signature neon medallion frame if you want it.">
            <label style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', display: 'block', marginBottom: 5 }}>Album Cover</label>
            {cover && (
              <div style={{ position: 'relative', marginBottom: 8, borderRadius: 10, overflow: 'hidden', border: '1px solid rgba(255,45,149,0.4)', boxShadow: '0 0 14px rgba(255,45,149,0.3)' }}>
                <img src={cover.dataUrl} alt="Album cover" style={{ width: '100%', display: 'block' }} />
                <button onClick={() => setCover(null)} aria-label="Remove cover"
                  style={{ position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.7)', color: '#ff7eb6', cursor: 'pointer' }}>
                  <X size={12} />
                </button>
              </div>
            )}
            <input ref={coverFileRef} type="file" accept="image/*" onChange={handleCoverUpload} style={{ display: 'none' }} />
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => coverFileRef.current?.click()} className="suno-chip" style={{ flex: 1, justifyContent: 'center' }}>
                <ImageIcon size={12} /> Upload
              </button>
              <button onClick={generateCover} disabled={coverLoading} className="suno-chip suno-chip--go" style={{ flex: 1, justifyContent: 'center' }}>
                {coverLoading ? <RefreshCw size={12} className="pulse-glow" /> : <Sparkles size={12} />} AI Cover
              </button>
            </div>
            <input className="input-cosmic" style={{ width: '100%', marginTop: 6, borderRadius: 8, padding: '6px 10px', fontSize: '0.7rem' }}
              placeholder="Optional: describe the cover you want..." value={coverPrompt} onChange={(e) => setCoverPrompt(e.target.value)} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontWeight: 400, cursor: 'pointer' }}>
              <input type="checkbox" checked={medallion} onChange={(e) => setMedallion(e.target.checked)} style={{ accentColor: '#ff2d95' }} />
              <span style={{ fontSize: '0.66rem', color: '#c4b5fd' }}>Neon medallion frame</span>
            </label>
          </div>

          {/* Mastering chain */}
          <div data-demo="master-chain" data-help="The mastering chain applied to every track: 3-band EQ, glue compression, a limiter, and loudness normalization capped at -1 dB peak. Pick a preset or shape it yourself.">
            <label style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', display: 'block', marginBottom: 5 }}>
              Mastering Preset: {preset}
            </label>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 8 }}>
              {Object.keys(MASTERING_PRESETS).map(p => (
                <button key={p} onClick={() => applyPreset(p)}
                  className={preset === p ? 'pill-purple' : ''}
                  style={{ padding: '3px 9px', borderRadius: 9999, fontSize: '0.62rem', fontWeight: 700, cursor: 'pointer', background: preset === p ? undefined : 'rgba(13,8,28,0.7)', color: preset === p ? undefined : 'rgba(196,181,253,0.6)', border: preset === p ? undefined : '1px solid rgba(139,92,246,0.25)' }}>
                  {p}
                </button>
              ))}
            </div>
            {[['bass', 'Bass'], ['mids', 'Mids'], ['treble', 'Treble'], ['compression', 'Compression'], ['loudness', 'Loudness']].map(([key, label]) => (
              <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.66rem', marginBottom: 4, fontWeight: 400 }}>
                <span style={{ width: 78, color: '#00e5ff' }}>{label}</span>
                <input type="range" min={0} max={1} step={0.05} value={settings[key]}
                  onChange={(e) => setSlider(key, Number(e.target.value))}
                  className="suno-range" style={{ flex: 1 }} />
              </label>
            ))}
          </div>

          <button
            onClick={masterAll}
            disabled={!tracks.length || busyAny}
            className="btn-neon-purple"
            data-help="Runs every track through the mastering chain. Each track shows before/after loudness when it's done."
            style={{ width: '100%', padding: '11px', borderRadius: 8, border: 'none', color: '#fff', fontSize: '0.82rem', fontWeight: 700, cursor: !tracks.length || busyAny ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            {busyAny ? <><RefreshCw size={14} className="pulse-glow" /> Mastering...</> : <><Wand2 size={14} /> Master All Tracks</>}
          </button>

          <button
            onClick={exportAlbum}
            disabled={!allMastered || exporting}
            className="btn-neon-cyan"
            data-demo="master-export"
            data-help="Exports the finished album — numbered mastered WAVs, cover.png, and tracklist.txt — into Documents\Lyricist Albums (desktop) or as downloads (browser)."
            style={{ width: '100%', padding: '11px', borderRadius: 8, border: 'none', color: '#fff', fontSize: '0.82rem', fontWeight: 700, cursor: !allMastered || exporting ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: !allMastered ? 0.55 : 1 }}>
            {exporting ? <><RefreshCw size={14} className="pulse-glow" /> Exporting...</> : <><Download size={14} /> Export Album</>}
          </button>

          {error && <div className="pill-red" style={{ padding: '8px 10px', borderRadius: 8, fontSize: '0.7rem' }}>{error}</div>}
          {note && <div className="pill-green" style={{ padding: '8px 10px', borderRadius: 8, fontSize: '0.7rem' }}>{note}</div>}
        </div>

        {/* Track assembly */}
        <div className="album-main">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 10, flexWrap: 'wrap' }}>
            <h4 style={{ margin: 0, fontSize: '0.9rem' }}>
              <Disc3 size={15} style={{ verticalAlign: '-2px', marginRight: 6 }} />
              Album Tracks — {tracks.length}/{MAX_TRACKS}
            </h4>
            <div style={{ display: 'flex', gap: 8 }}>
              <input ref={fileRef} type="file" accept="audio/*" multiple onChange={handleUpload} style={{ display: 'none' }} />
              <button onClick={openLibrary} className="suno-chip" data-help="Pull takes straight from your Recording Booth library.">
                <Library size={12} /> From Booth Library
              </button>
              <button onClick={() => fileRef.current?.click()} className="suno-chip" data-help="Add audio files — Suno downloads, bounced demos, anything. They're also saved into your Booth library.">
                <Upload size={12} /> Upload Songs
              </button>
            </div>
          </div>

          {/* Booth library picker */}
          {libraryOpen && (
            <div className="card-cosmic" style={{ borderRadius: 12, padding: 14, marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#00e5ff' }}>Your Booth takes — click to add</span>
                <button onClick={() => setLibraryOpen(false)} className="suno-btn"><X size={12} /></button>
              </div>
              {!library.length && <div style={{ fontSize: '0.72rem', color: 'rgba(196,181,253,0.6)' }}>No takes in the library yet — record some in the Recording Booth first.</div>}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {library.map(rec => (
                  <button key={rec.id} onClick={() => addFromLibrary(rec)} className="suno-chip"
                    disabled={tracks.length >= MAX_TRACKS}>
                    + {rec.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {!tracks.length && (
            <div className="card-cosmic" style={{ borderRadius: 12, padding: 30, textAlign: 'center', color: 'rgba(196,181,253,0.65)', fontSize: '0.8rem' }}>
              No tracks yet. Pull takes from the Recording Booth or upload your Suno songs,
              drag them into order, then hit <strong>Master All Tracks</strong>.
            </div>
          )}

          {tracks.map((t, i) => (
            <div
              key={t.id}
              className={`card-cosmic album-track ${i === dragIndex ? 'album-track--dragging' : ''} ${i === overIndex && dragIndex !== null && i !== dragIndex ? 'album-track--dragover' : ''}`}
              draggable
              onDragStart={(e) => onDragStart(e, i)}
              onDragOver={(e) => onDragOver(e, i)}
              onDrop={(e) => onDrop(e, i)}
              onDragEnd={() => { setDragIndex(null); setOverIndex(null); }}
            >
              <GripVertical size={15} style={{ color: 'rgba(255,45,149,0.55)', flexShrink: 0 }} />
              <span className="album-track-num">{i + 1}</span>
              <input
                className="album-input"
                style={{ flex: 2, fontWeight: 700, fontFamily: "'Audiowide', sans-serif", color: '#00e5ff' }}
                value={t.title}
                onChange={(e) => setTracks(prev => prev.map(x => x.id === t.id ? { ...x, title: e.target.value } : x))}
                onMouseDown={(e) => e.stopPropagation()}
                draggable={false}
              />

              {/* A/B preview */}
              <button className="suno-chip" onClick={() => preview(t, 'orig')}
                data-help="Play the original, unmastered track.">
                {playingKey === `${t.id}:orig` ? <Pause size={11} /> : <Play size={11} />} Raw
              </button>
              <button className="suno-chip" onClick={() => preview(t, 'mastered')} disabled={!t.mastered}
                style={{ opacity: t.mastered ? 1 : 0.45 }}
                data-help="Play the mastered version — A/B against Raw to hear the chain working.">
                {playingKey === `${t.id}:mastered` ? <Pause size={11} /> : <Play size={11} />} Mastered
              </button>

              {t.busy ? (
                <span style={{ fontSize: '0.64rem', color: '#00e5ff', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <RefreshCw size={11} className="pulse-glow" /> Mastering...
                </span>
              ) : t.mastered ? (
                <span className="pill-green" style={{ padding: '2px 8px', borderRadius: 9999, fontSize: '0.58rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                  title={`Peak ${fmtDb(t.mastered.stats.peakAfterDb)} · RMS ${fmtDb(t.mastered.stats.rmsBeforeDb)} → ${fmtDb(t.mastered.stats.rmsAfterDb)}`}>
                  <CheckCircle2 size={10} /> {fmtDb(t.mastered.stats.rmsAfterDb - t.mastered.stats.rmsBeforeDb)} louder
                </span>
              ) : (
                <button className="suno-chip" onClick={() => masterOne(t.id)} disabled={busyAny}>
                  <Wand2 size={11} /> Master
                </button>
              )}

              <button onClick={() => removeTrack(t.id)} className="suno-btn" aria-label={`Remove ${t.title}`}
                style={{ color: '#f87171', borderColor: 'rgba(248,113,113,0.4)' }}>
                <Trash2 size={12} />
              </button>
            </div>
          ))}

          {tracks.length > 0 && (
            <p style={{ fontSize: '0.64rem', color: 'rgba(196,181,253,0.55)', marginTop: 10 }}>
              Tracks are re-mastered automatically when you change the chain settings.
              Plan the concept and running order in <button onClick={() => onNavigate && onNavigate('album')} style={{ background: 'none', border: 'none', color: '#ff7eb6', cursor: 'pointer', fontSize: 'inherit', padding: 0, textDecoration: 'underline' }}>Album Architect</button> — the title, artist, and genre carry over.
            </p>
          )}
        </div>
      </div>
    </div>
      </div>
    </div>
  );
}
