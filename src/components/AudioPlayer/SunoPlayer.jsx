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

  const addStream = () => {
    const url = urlDraft.trim();
    if (!url) return;
    let name;
    try { name = decodeURIComponent(new URL(url).pathname.split('/').pop() || 'Suno stream'); }
    catch { setError('That does not look like a valid URL.'); return; }
    setTracks(prev => [...prev, { id: nextTrackId++, name: name.replace(/\.[^.]+$/, '') || 'Suno stream', url, kind: 'stream' }]);
    setUrlDraft('');
    setShowUrl(false);
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
              data-help="Paste a direct audio link (like a suno.ai track URL) to stream it without downloading.">
              <Link2 size={12} /> Stream
            </button>
            <button className="suno-chip" onClick={() => setShowList(s => !s)}
              data-help="Your Suno playlist. Click a track to jump to it.">
              <ListMusic size={12} /> {tracks.length}
            </button>
          </div>
        </>
      )}

      {/* Stream URL popover */}
      {showUrl && !collapsed && (
        <div className="suno-popover">
          <input
            className="input-cosmic"
            style={{ flex: 1, borderRadius: 8, padding: '7px 10px', fontSize: '0.74rem' }}
            placeholder="https://cdn1.suno.ai/....mp3"
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addStream()}
            autoFocus
          />
          <button className="suno-chip suno-chip--go" onClick={addStream}>Add</button>
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
