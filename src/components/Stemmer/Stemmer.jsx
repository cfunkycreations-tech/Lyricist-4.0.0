import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  STEM_DEFS,
  decodeAudioFile,
  separateStems,
  stemToWavBlob,
  downloadBlob,
  playBuffer,
} from '../../services/stemmerEngine.js';
import { separateStemsCloud } from '../../services/stemmerCloud.js';
import { useLyricStore } from '../../context/LyricStore.jsx';
import './Stemmer.css';

/**
 * Stemmer tab — Offline (default, light CPU, no key) OR Cloud Demucs (optional API key).
 */
export default function Stemmer() {
  const store = useLyricStore();
  const mode = store.config.stemmerMode === 'cloud' ? 'cloud' : 'offline';
  const hasCloudKey = !!(store.config.replicateApiKey || '').trim();

  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('Drop a mix, or click Load Mix.');
  const [stemFolder, setStemFolder] = useState(null);   // where the last batch landed
  const [duration, setDuration] = useState(0);
  const [stems, setStems] = useState(null);
  const [muted, setMuted] = useState(() => Object.fromEntries(STEM_DEFS.map((s) => [s.id, false])));
  const [solo, setSolo] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [lastMode, setLastMode] = useState(null);

  const fileRef = useRef(null);
  const ctxRef = useRef(null);
  const playersRef = useRef([]);

  const setMode = (next) => {
    store.setConfig({ ...store.config, stemmerMode: next });
  };

  const getCtx = () => {
    if (!ctxRef.current) {
      ctxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    return ctxRef.current;
  };

  const stopAll = useCallback(() => {
    playersRef.current.forEach((p) => p.stop?.());
    playersRef.current = [];
    setPlaying(false);
  }, []);

  useEffect(() => () => stopAll(), [stopAll]);

  const processFile = async (file) => {
    if (!file) return;
    stopAll();
    setError('');
    setStems(null);
    setFileName(file.name);
    setBusy(true);
    setProgress(0);
    setLastMode(mode);

    try {
      const ctx = getCtx();
      if (ctx.state === 'suspended') await ctx.resume();

      if (mode === 'cloud') {
        if (!hasCloudKey) {
          throw new Error(
            'Cloud mode needs a Replicate API key. Paste one in Settings → Stemmer Cloud, or switch to Offline (no key, no GPU).'
          );
        }
        setStatus('Cloud Demucs — uploading…');
        const { stems: result, duration: dur } = await separateStemsCloud(
          file,
          store.config.replicateApiKey,
          (p, label) => {
            setProgress(p);
            setStatus(label);
          },
          ctx
        );
        setDuration(dur);
        setStems(result);
        setStatus(`Ready (Cloud Demucs) — ${STEM_DEFS.length} stems from ${file.name}`);
      } else {
        setStatus(`Decoding ${file.name}…`);
        const buffer = await decodeAudioFile(file, ctx);
        setDuration(buffer.duration);
        setStatus('Separating stems offline (light CPU, no GPU)…');
        const { stems: result } = await separateStems(buffer, (p, label) => {
          setProgress(p);
          setStatus(label);
        });
        setStems(result);
        setStatus(`Ready (Offline) — ${STEM_DEFS.length} stems from ${file.name}`);
      }

      setMuted(Object.fromEntries(STEM_DEFS.map((s) => [s.id, false])));
      setSolo(null);
      setProgress(1);
    } catch (e) {
      console.error(e);
      setError(e?.message || 'Could not process that file.');
      setStatus('Failed');
    } finally {
      setBusy(false);
    }
  };

  const onFileInput = (e) => {
    const f = e.target.files?.[0];
    if (f) processFile(f);
    e.target.value = '';
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) processFile(f);
  };

  const isAudible = (id) => {
    if (!stems) return false;
    if (solo) return solo === id;
    return !muted[id];
  };

  const playMix = async () => {
    if (!stems) return;
    stopAll();
    const ctx = getCtx();
    if (ctx.state === 'suspended') await ctx.resume();

    const active = STEM_DEFS.filter((s) => isAudible(s.id) && stems[s.id]);
    if (!active.length) {
      setStatus('All stems muted — unmute or solo one first.');
      return;
    }

    const players = active.map((s) =>
      playBuffer(stems[s.id], ctx, { gain: solo === s.id ? 1 : 0.9, loop: false })
    );
    playersRef.current = players;
    setPlaying(true);
    setStatus(`Playing ${active.map((a) => a.label).join(' + ')}`);

    const longest = Math.max(...active.map((s) => stems[s.id].duration));
    setTimeout(() => {
      if (playersRef.current === players) {
        stopAll();
        setStatus('Playback finished');
      }
    }, longest * 1000 + 80);
  };

  const exportStem = (id) => {
    if (!stems?.[id]) return;
    const blob = stemToWavBlob(stems[id]);
    const base = fileName.replace(/\.[^.]+$/, '') || 'mix';
    downloadBlob(blob, `${base}_${id}.wav`);
    setStatus(`Exported ${id}.wav`);
  };

  /**
   * Export every stem AS ONE GROUP.
   *
   * This used to call the single-file download once per stem, 180 ms apart, so
   * splitting a song threw six to eight save prompts on screen one after another
   * and scattered the files into Downloads unlabelled. They are one song taken
   * apart — they stay together. In the desktop app they all land in
   * Documents\Lyricist Stems\<song>\ from one click, with no prompts at all. In
   * a browser they come down as a single .zip.
   */
  const exportAll = async () => {
    if (!stems) return;
    const base = fileName.replace(/\.[^.]+$/, '') || 'mix';
    const available = STEM_DEFS.filter((s) => stems[s.id]);
    if (!available.length) return;

    setStatus(`Bundling ${available.length} stems…`);
    const api = window.lyricistAPI;

    if (api?.saveStems) {
      const files = [];
      for (const s of available) {
        const buf = await stemToWavBlob(stems[s.id]).arrayBuffer();
        files.push({ filename: `${base}_${s.id}.wav`, bytes: new Uint8Array(buf) });
      }
      const res = await api.saveStems(base, files);
      if (!res?.ok) { setStatus(`Could not save the stems: ${res?.error || 'unknown error'}`); return; }
      setStemFolder(res.path);
      setStatus(`All ${res.written} stems saved together in one folder — ${res.path}`);
      return;
    }

    // Browser: one zip, so it is still a single download rather than eight.
    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();
    for (const s of available) {
      zip.file(`${base}_${s.id}.wav`, stemToWavBlob(stems[s.id]));
    }
    const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
    downloadBlob(blob, `${base}_stems.zip`);
    setStatus(`All ${available.length} stems in one zip — ${base}_stems.zip`);
  };

  const toggleMute = (id) => {
    setSolo(null);
    setMuted((m) => ({ ...m, [id]: !m[id] }));
  };

  const toggleSolo = (id) => {
    setSolo((cur) => (cur === id ? null : id));
  };

  return (
    <div
      className="stemmer-root"
      data-help="Stemmer splits a mix into Vocals, Drums, Bass, Guitar, Keys, and Other. Offline = free, light CPU, no key. Cloud = optional Replicate Demucs API for pro quality (no local GPU)."
    >
      <div className="stemmer-header">
        <div>
          <h2 className="chrome-title stemmer-title">Stemmer</h2>
          <p className="stemmer-sub">
            Separate a full mix into playable, exportable tracks. Choose Offline (always works, no key, no GPU)
            or Cloud Demucs (optional API key — runs on remote servers when your PC is light).
          </p>
        </div>
        <div className="stemmer-actions">
          <button
            type="button"
            className="btn-neon-cyan stemmer-btn"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            data-help="Load a WAV, MP3, or other audio file to split into stems."
          >
            Load Mix
          </button>
          <button
            type="button"
            className="btn-neon-purple stemmer-btn"
            disabled={!stems || busy}
            onClick={playing ? stopAll : playMix}
            data-help="Play the audible stems together (respects mute and solo)."
          >
            {playing ? 'Stop' : 'Play Mix'}
          </button>
          <button
            type="button"
            className="stemmer-btn stemmer-btn-gold"
            disabled={!stems || busy}
            onClick={exportAll}
            data-help="Saves every stem together in ONE folder — Documents\Lyricist Stems\<song name>\ — in a single click, no save prompts. Each stem is a 16-bit WAV you can drop straight into a DAW."
          >
            Save All Stems (one folder)
          </button>
          {stemFolder && window.lyricistAPI?.showFolder && (
            <button
              type="button"
              className="stemmer-btn"
              onClick={() => window.lyricistAPI.showFolder(stemFolder)}
              data-help="Opens the folder your stems were saved into."
            >
              Open folder
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="audio/*,.wav,.mp3,.ogg,.m4a,.flac,.webm"
            style={{ display: 'none' }}
            onChange={onFileInput}
          />
        </div>
      </div>

      {/* Mode toggle — Offline (default) vs Cloud API */}
      <div
        className="stemmer-mode-bar"
        data-help="Offline: mid-side + bands on your CPU, free, no key. Cloud: Demucs on Replicate — needs a free Replicate account token. No local GPU required either way."
      >
        <span className="stemmer-mode-label">Engine</span>
        <button
          type="button"
          className={`stemmer-mode-btn ${mode === 'offline' ? 'is-active' : ''}`}
          disabled={busy}
          onClick={() => setMode('offline')}
        >
          Offline
          <small>No key · light CPU · no GPU</small>
        </button>
        <button
          type="button"
          className={`stemmer-mode-btn ${mode === 'cloud' ? 'is-active cloud' : ''}`}
          disabled={busy}
          onClick={() => setMode('cloud')}
        >
          Cloud API
          <small>{hasCloudKey ? 'Replicate key ready' : 'Needs Replicate key'}</small>
        </button>
        {mode === 'cloud' && !hasCloudKey && (
          <span className="stemmer-mode-hint">
            Add a Replicate key in <strong>Settings</strong>, or stay Offline.
          </span>
        )}
        {mode === 'cloud' && hasCloudKey && (
          <span className="stemmer-mode-hint ok">Cloud Demucs will run remotely — your GPU is not used.</span>
        )}
      </div>

      <div
        className={`stemmer-drop ${dragOver ? 'is-over' : ''} ${busy ? 'is-busy' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => !busy && fileRef.current?.click()}
        data-help={
          mode === 'cloud'
            ? 'Drop a mix. Cloud mode uploads to Replicate Demucs (optional paid credits on their side). No local GPU.'
            : 'Drop a mix. Offline mode never leaves your computer.'
        }
      >
        {busy ? (
          <div className="stemmer-progress-wrap">
            <div className="stemmer-progress-bar">
              <div className="stemmer-progress-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
            <span>{status}</span>
          </div>
        ) : (
          <>
            <span className="stemmer-drop-icon">🎛️</span>
            <span className="stemmer-drop-text">
              {fileName ? (
                <>
                  <strong className="chrome-text">{fileName}</strong>
                  {duration > 0 && (
                    <span className="stemmer-meta">
                      {' '}
                      · {duration.toFixed(1)}s
                      {lastMode ? ` · last run: ${lastMode}` : ''} · drop another to replace
                    </span>
                  )}
                </>
              ) : (
                `Drop a mix here · engine: ${mode === 'cloud' ? 'Cloud Demucs' : 'Offline'}`
              )}
            </span>
          </>
        )}
      </div>

      {error && <div className="stemmer-error">{error}</div>}

      <div className="stemmer-status-line">{status}</div>

      <div className="stemmer-grid">
        {STEM_DEFS.map((s) => {
          const ready = !!stems?.[s.id];
          const aud = isAudible(s.id);
          return (
            <div
              key={s.id}
              className={`stemmer-card card-cosmic ${ready ? 'is-ready' : ''} ${!aud && ready ? 'is-muted' : ''} ${solo === s.id ? 'is-solo' : ''}`}
              style={{ '--stem-color': s.color }}
            >
              <div className="stemmer-card-top">
                <span className="stemmer-card-icon" aria-hidden>
                  {s.icon}
                </span>
                <span className="stemmer-card-label chrome-text">{s.label}</span>
                <span className="stemmer-card-swatch" style={{ background: s.color }} />
              </div>
              <div className="stemmer-card-controls">
                <button
                  type="button"
                  className={`stemmer-chip ${muted[s.id] && !solo ? 'on' : ''}`}
                  disabled={!ready}
                  onClick={() => toggleMute(s.id)}
                  data-help={`Mute ${s.label} in the mix preview.`}
                >
                  Mute
                </button>
                <button
                  type="button"
                  className={`stemmer-chip ${solo === s.id ? 'on gold' : ''}`}
                  disabled={!ready}
                  onClick={() => toggleSolo(s.id)}
                  data-help={`Solo only ${s.label}.`}
                >
                  Solo
                </button>
                <button
                  type="button"
                  className="stemmer-chip export"
                  disabled={!ready}
                  onClick={() => exportStem(s.id)}
                  data-help={`Export ${s.label} as WAV.`}
                >
                  WAV
                </button>
              </div>
              <div className="stemmer-card-meter" aria-hidden>
                <div
                  className="stemmer-card-meter-fill"
                  style={{
                    opacity: ready ? (aud ? 0.9 : 0.15) : 0.08,
                    background: `linear-gradient(90deg, transparent, ${s.color})`,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <p className="stemmer-note">
        <strong>Offline</strong> (default): spectral mid-side split on your machine — free, private, light CPU, no
        API key, no GPU. Great for practice and rough karaoke tracks.
        <br />
        <strong>Cloud</strong> (optional): Demucs ML on{' '}
        <a href="https://replicate.com/account/api-tokens" target="_blank" rel="noopener noreferrer">
          Replicate
        </a>{' '}
        with your own key — pro stems without a powerful PC. Guitar/Keys slots fill from residual when the cloud
        model only returns four stems (vocals/drums/bass/other).
      </p>
    </div>
  );
}
