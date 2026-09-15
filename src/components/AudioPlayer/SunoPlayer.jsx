import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Play, Pause, SkipBack, SkipForward, Upload, Link2, ListMusic,
  Volume2, VolumeX, X, ChevronDown, ChevronUp
} from 'lucide-react';
import { connectMediaElement, resumeAudio } from '../../services/audioEngine.js';

// Persistent Suno audio player — Lyricist 4.1.3
//
// Mounted ONCE in App.jsx, outside the tab-switching workspace (tabs hide via
// display:none, they never unmount), so playback never stutters or resets
// while the user hops between Songwriter, Ghost Rider, Song Forge, etc.
//
// Sources:
//   • Upload — local Suno .mp3/.wav/.ogg downloads (multi-select)
//   • Stream — paste any direct audio URL (e.g. a cdn*.suno.ai track link)
//
// The <audio> element is wired into the shared Web Audio master bus
// (audioEngine.js) so the Butterchurn visualizer reacts to it too.

const STREAM_KEY = 'lyricistSunoStreams';

function fmtTime(s) {
  if (!Number.isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60).toString().padStart(2, '0');
  return `${m}:${sec}`;
}

// ── Suno link resolution ───────────────────────────────────────────
// Turn what people actually paste — Suno *song* pages, *playlist* pages,
// bare clip ids, or direct CDN files — into playable {name, url} tracks.
const AUDIO_EXT = /\.(mp3|wav|ogg|m4a|flac|aac)(\?.*)?$/i;
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

async function resolveSunoLink(raw) {
  const input = (raw || '').trim();
  if (!input) return [];

  let u;
  try { u = new URL(input); }
  catch {
    // Not a URL — maybe they pasted a bare clip id.
    const m = input.match(UUID_RE);
    if (m) return [{ name: m[0].slice(0, 8), url: `https://cdn1.suno.ai/${m[0]}.mp3` }];
    throw new Error(`"${input.slice(0, 24)}" is not a valid link.`);
  }

  const host = u.hostname.toLowerCase();
  const path = u.pathname;
  const isSuno = host.includes('suno.com') || host.includes('suno.ai');

  // Already a direct audio file (any host, including cdn*.suno.ai).
  if (AUDIO_EXT.test(path) || (host.includes('cdn') && host.includes('suno'))) {
    const base = decodeURIComponent(path.split('/').pop() || 'Suno track').replace(AUDIO_EXT, '');
    return [{ name: base || 'Suno track', url: input }];
  }

  // Suno SONG page → the CDN mp3 is just cdn1.suno.ai/<id>.mp3
  const song = path.match(/\/song\/([0-9a-z-]{8,})/i);
  if (isSuno && song) {
    const id = song[1];
    return [{ name: id.slice(0, 8), url: `https://cdn1.suno.ai/${id}.mp3` }];
  }

  // Suno PLAYLIST page → ask Suno's API for the clips.
  const pl = path.match(/\/playlist\/([0-9a-z-]{8,})/i);
  if (isSuno && pl) return await fetchSunoPlaylist(pl[1]);

  // Unknown link — try it as a direct source and let the player decide.
  return [{ name: decodeURIComponent(path.split('/').pop() || host), url: input }];
}

async function fetchSunoPlaylist(id) {
  // Preferred path: the Electron main process (no browser CORS wall).
  if (typeof window !== 'undefined' && window.lyricistAPI?.sunoPlaylist) {
    const r = await window.lyricistAPI.sunoPlaylist(id);
    if (r?.ok && r.tracks?.length) return r.tracks;
    throw new Error(r?.error || 'Suno did not return that playlist.');
  }

  // Fallback for the dev/web build: try a direct fetch (often CORS-blocked).
  const endpoints = [
    `https://studio-api.suno.ai/api/playlist/${id}/?page=1`,
    `https://suno.com/api/playlist/${id}/?page=1`,
  ];
  for (const ep of endpoints) {
    try {
      const res = await fetch(ep);
      if (!res.ok) continue;
      const data = await res.json();
      const clips = (data.playlist_clips || data.clips || []).map((pc) => pc.clip || pc);
      const tracks = clips
        .filter((c) => c && (c.audio_url || c.id))
        .map((c) => ({
          name: c.title || (c.id || '').slice(0, 8) || 'Suno track',
          url: c.audio_url || `https://cdn1.suno.ai/${c.id}.mp3`,
        }));
      if (tracks.length) return tracks;
    } catch { /* try the next endpoint */ }
  }
  throw new Error(
    'Could not load that playlist here — Suno blocks browser requests. In the desktop app this loads fine; in the browser, paste the individual song links instead (many at once), or download the tracks and use Upload.'
  );
}

let nextTrackId = 1;

export default function SunoPlayer() {
  const audioRef = useRef(null);
  const fileInputRef = useRef(null);

  const [tracks, setTracks] = useState(() => {
    // Stream URLs survive restarts; uploaded object URLs cannot, so only
    // saved streams are rehydrated.
    try {
      const saved = JSON.parse(localStorage.getItem(STREAM_KEY) || '[]');
      return saved.map(t => ({ ...t, id: nextTrackId++, kind: 'stream' }));
    } catch { return []; }
  });
  const [current, setCurrent] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(() => Number(localStorage.getItem('lyricistSunoVolume') ?? 0.9));
  const [muted, setMuted] = useState(false);
  const [showList, setShowList] = useState(false);
  const [showUrl, setShowUrl] = useState(false);
  const [urlDraft, setUrlDraft] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const [error, setError] = useState('');

  const track = current >= 0 ? tracks[current] : null;

  // Wire the element into the shared master bus exactly once.
  useEffect(() => {
    if (audioRef.current) connectMediaElement(audioRef.current);
  }, []);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = muted ? 0 : volume;
    localStorage.setItem('lyricistSunoVolume', String(volume));
  }, [volume, muted]);

  useEffect(() => {
    const streams = tracks.filter(t => t.kind === 'stream').map(({ name, url, kind }) => ({ name, url, kind }));
    localStorage.setItem(STREAM_KEY, JSON.stringify(streams));
  }, [tracks]);

  const loadAndPlay = useCallback(async (index) => {
    const el = audioRef.current;
    const t = tracks[index];
    if (!el || !t) return;
    await resumeAudio();
    setError('');
    setCurrent(index);
    el.src = t.url;
    // Suno CDN links are CORS-enabled; asking politely keeps the element
    // untainted so the visualizer bus can read it.
    el.crossOrigin = 'anonymous';
    try {
      await el.play();
      setPlaying(true);
    } catch (e) {
      // Some hosts refuse CORS entirely — retry without it (audio still plays,
      // visualizer just won't react to this one track).
      try {
        el.removeAttribute('crossorigin');
        el.src = t.url;
        await el.play();
        setPlaying(true);
      } catch (e2) {
        setError(`Couldn't play "${t.name}": ${e2.message}`);
        setPlaying(false);
      }
    }
  }, [tracks]);

  const togglePlay = async () => {
    const el = audioRef.current;
    if (!el) return;
    await resumeAudio();
    if (playing) { el.pause(); setPlaying(false); }
    else if (track) { el.play().then(() => setPlaying(true)).catch(e => setError(e.message)); }
    else if (tracks.length) { loadAndPlay(0); }
  };

  const skip = (dir) => {
    if (!tracks.length) return;
    const next = current < 0 ? 0 : (current + dir + tracks.length) % tracks.length;
    loadAndPlay(next);
  };

  const handleFiles = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const added = files.map(f => ({
      id: nextTrackId++,
      name: f.name.replace(/\.[^.]+$/, ''),
      url: URL.createObjectURL(f),
      kind: 'upload'
    }));
    setTracks(prev => {
      const merged = [...prev, ...added];
      if (current < 0) setTimeout(() => loadAndPlayRef.current(prev.length), 0);
      return merged;
    });
    e.target.value = '';
  };

  // loadAndPlay closes over `tracks`; keep a live ref for the setTimeout above.
  const loadAndPlayRef = useRef(loadAndPlay);
  useEffect(() => { loadAndPlayRef.current = loadAndPlay; }, [loadAndPlay]);

  // Recording Booth handoff (4.1.3): other parts of the app can queue a track
  // by dispatching `lyricist:add-track` with { name, url, kind }. The take
  // starts playing immediately so it can loop under the writing session.
  useEffect(() => {
    const onAddTrack = (e) => {
      const { name, url, kind } = e.detail || {};
      if (!url) return;
      setTracks(prev => {
        const idx = prev.length;
        setTimeout(() => loadAndPlayRef.current(idx), 0);
        return [...prev, { id: nextTrackId++, name: name || 'Recorded take', url, kind: kind || 'recording' }];
      });
    };
    window.addEventListener('lyricist:add-track', onAddTrack);
    return () => window.removeEventListener('lyricist:add-track', onAddTrack);
  }, []);

  const [adding, setAdding] = useState(false);

  // Accept one OR many links at once (Suno song pages, playlist pages,
  // bare clip ids, or direct audio URLs). Playlists expand to all tracks.
  const addFromLinks = async () => {
    const raw = urlDraft.trim();
    if (!raw || adding) return;
    setError('');
    setAdding(true);
    const tokens = raw.split(/[\s,]+/).filter(Boolean);
    const collected = [];
    const failures = [];
    for (const tok of tokens) {
      try {
        const resolved = await resolveSunoLink(tok);
        collected.push(...resolved);
      } catch (e) {
        failures.push(e.message);
      }
    }
    setAdding(false);

    if (collected.length) {
      setTracks(prev => {
        const startIdx = prev.length;
        const added = collected.map(t => ({ id: nextTrackId++, name: t.name || 'Suno track', url: t.url, kind: 'stream' }));
        if (current < 0) setTimeout(() => loadAndPlayRef.current(startIdx), 0);
        return [...prev, ...added];
      });
      setUrlDraft('');
      setShowUrl(false);
      if (failures.length) setError(`Added ${collected.length} track${collected.length > 1 ? 's' : ''}. ${failures.length} link${failures.length > 1 ? 's' : ''} failed.`);
    } else {
      setError(failures[0] || 'No playable tracks found in that link.');
    }
  };

  const removeTrack = (idx) => {
    setTracks(prev => {
      const t = prev[idx];
      if (t?.kind === 'upload') URL.revokeObjectURL(t.url);
      const next = prev.filter((_, i) => i !== idx);
      if (idx === current) {
        audioRef.current?.pause();
        audioRef.current?.removeAttribute('src');
        setPlaying(false);
        setCurrent(-1);
        setTime(0); setDuration(0);
      } else if (idx < current) {
        setCurrent(c => c - 1);
      }
      return next;
    });
  };

  const seek = (e) => {
    const el = audioRef.current;
    if (!el || !Number.isFinite(el.duration)) return;
    el.currentTime = Number(e.target.value);
    setTime(el.currentTime);
  };

  return (
    <div className={`suno-player ${collapsed ? 'suno-player--collapsed' : ''}`}
      data-help="The persistent Suno player. Load your Suno-generated tracks (upload the files or paste a stream link) and they keep playing while you move around the app.">
      <audio
        ref={audioRef}
        onTimeUpdate={(e) => setTime(e.target.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.target.duration)}
        onEnded={() => skip(1)}
        onError={() => track && setError(`Playback error on "${track.name}".`)}
      />

      {/* Collapse handle */}
      <button className="suno-collapse" onClick={() => setCollapsed(c => !c)}
        data-help="Tuck the player away into a slim bar, or pop it back open.">
        {collapsed ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
      </button>

      {!collapsed && (
        <>
          {/* Track identity */}
          <div className="suno-track-info">
            <div className="suno-eq" aria-hidden="true">
              <span className={playing ? 'suno-eq-bar on' : 'suno-eq-bar'} />
              <span className={playing ? 'suno-eq-bar on' : 'suno-eq-bar'} />
              <span className={playing ? 'suno-eq-bar on' : 'suno-eq-bar'} />
            </div>
            <div className="suno-track-name" title={track?.name}>
              {track ? track.name : 'No track loaded — upload or stream your Suno audio'}
            </div>
          </div>

          {/* Transport */}
          <div className="suno-transport">
            <button className="suno-btn" onClick={() => skip(-1)} disabled={!tracks.length} aria-label="Previous track"><SkipBack size={15} /></button>
            <button className="suno-btn suno-btn--play" onClick={togglePlay} disabled={!tracks.length && !track} aria-label={playing ? 'Pause' : 'Play'}>
              {playing ? <Pause size={17} /> : <Play size={17} style={{ marginLeft: 2 }} />}
            </button>
            <button className="suno-btn" onClick={() => skip(1)} disabled={!tracks.length} aria-label="Next track"><SkipForward size={15} /></button>
          </div>

          {/* Seek */}
          <div className="suno-seek">
            <span className="suno-time">{fmtTime(time)}</span>
            <input type="range" min={0} max={Number.isFinite(duration) && duration > 0 ? duration : 0} step={0.1}
              value={Math.min(time, duration || 0)} onChange={seek} className="suno-range" aria-label="Seek" />
            <span className="suno-time">{fmtTime(duration)}</span>
          </div>

          {/* Volume */}
          <div className="suno-volume">
            <button className="suno-btn" onClick={() => setMuted(m => !m)} aria-label={muted ? 'Unmute' : 'Mute'}>
              {muted || volume === 0 ? <VolumeX size={15} /> : <Volume2 size={15} />}
            </button>
            <input type="range" min={0} max={1} step={0.02} value={muted ? 0 : volume}
              onChange={(e) => { setVolume(Number(e.target.value)); setMuted(false); }}
              className="suno-range suno-range--vol" aria-label="Volume" />
          </div>

          {/* Sources */}
          <div className="suno-sources">
            <input ref={fileInputRef} type="file" accept="audio/*" multiple onChange={handleFiles} style={{ display: 'none' }} />
            <button className="suno-chip" onClick={() => fileInputRef.current?.click()}
              data-help="Load Suno tracks you've downloaded (.mp3/.wav/.ogg). You can pick several at once — they queue up as a playlist.">
              <Upload size={12} /> Upload
            </button>
            <button className="suno-chip" onClick={() => setShowUrl(s => !s)}
              data-help="Paste Suno links — a song page (suno.com/song/…), a whole playlist (suno.com/playlist/…), or a direct audio URL. Paste several at once, one per line, and they queue up.">
              <Link2 size={12} /> Suno Link
            </button>
            <button className="suno-chip" onClick={() => setShowList(s => !s)}
              data-help="Your Suno playlist. Click a track to jump to it.">
              <ListMusic size={12} /> {tracks.length}
            </button>
          </div>
        </>
      )}

      {/* Suno link popover — song pages, playlist pages, or direct URLs.
          Paste one per line (or many at once); Enter to add, Shift+Enter for a new line. */}
      {showUrl && !collapsed && (
        <div className="suno-popover" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
          <textarea
            className="input-cosmic"
            style={{ width: '100%', minHeight: 62, resize: 'vertical', borderRadius: 8, padding: '7px 10px', fontSize: '0.74rem', fontFamily: 'var(--faf-font)', lineHeight: 1.4 }}
            placeholder={"Paste Suno links — one per line:\nhttps://suno.com/song/…\nhttps://suno.com/playlist/…"}
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addFromLinks(); } }}
            autoFocus
          />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontSize: '0.6rem', color: 'rgba(230,232,235,0.5)' }}>Song or playlist links · one per line</span>
            <button className="suno-chip suno-chip--go" onClick={addFromLinks} disabled={adding}>
              {adding ? 'Adding…' : 'Add'}
            </button>
          </div>
        </div>
      )}

      {/* Playlist popover */}
      {showList && !collapsed && (
        <div className="suno-popover suno-popover--list">
          {tracks.length === 0 && <div className="suno-empty">Playlist is empty.</div>}
          {tracks.map((t, i) => (
            <div key={t.id} className={`suno-row ${i === current ? 'suno-row--active' : ''}`}>
              <button className="suno-row-name" onClick={() => loadAndPlay(i)} title={t.name}>
                {i === current && playing ? '▶ ' : ''}{t.name}
                <span className="suno-row-kind">{t.kind}</span>
              </button>
              <button className="suno-btn" onClick={() => removeTrack(i)} aria-label={`Remove ${t.name}`}><X size={12} /></button>
            </div>
          ))}
        </div>
      )}

      {error && !collapsed && <div className="suno-error">{error}</div>}
    </div>
  );
}
