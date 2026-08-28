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
import { separateStemsGPU, gpuAvailable, gpuName } from '../../services/stemmerEngineGpu.js';
import { available as localAvailable, localStatus, localSetup, separateStemsLocal } from '../../services/stemmerLocal.js';
import { useLyricStore } from '../../context/LyricStore.jsx';
import { track } from '../../services/analytics.js';
import './Stemmer.css';

import TabBackground from '../common/TabBackground.jsx';
/**
 * Stemmer tab — Offline (default, light CPU, no key) OR Cloud Demucs (optional API key).
 */
export default function Stemmer() {
  const store = useLyricStore();
  const rawMode = store.config.stemmerMode;
  const mode = ['local', 'cloud', 'offline'].includes(rawMode) ? rawMode : 'local';
  const device = store.config.stemmerDevice || 'auto'; // 'auto' | 'gpu' | 'cpu'
  const hasCloudKey = !!(store.config.replicateApiKey || '').trim();

  const [gpuOk, setGpuOk] = useState(null);   // null = checking, true/false once known
  const [gpuLabel, setGpuLabel] = useState('');

  // Local Demucs (true AI stems) availability.
  const canLocal = localAvailable();
  const [local, setLocal] = useState({ pythonFound: false, ready: false, cuda: false, checked: false });
  const [setupBusy, setSetupBusy] = useState(false);

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

  const setDevice = (next) => {
    store.setConfig({ ...store.config, stemmerDevice: next });
  };

  // Detect the GPU once so the UI can tell the user whether it's available.
  useEffect(() => {
    let alive = true;
    gpuAvailable().then((ok) => {
      if (!alive) return;
      setGpuOk(ok);
      setGpuLabel(ok ? gpuName() : '');
    });
    return () => { alive = false; };
  }, []);

  // Ask the desktop app whether local AI stems are installed and GPU-capable.
  const refreshLocal = useCallback(async () => {
    if (!canLocal) { setLocal({ pythonFound: false, ready: false, cuda: false, checked: true }); return; }
    const s = await localStatus();
    setLocal({ pythonFound: !!s.pythonFound, ready: !!s.ready, cuda: !!s.cuda, checked: true });
  }, [canLocal]);

  useEffect(() => { refreshLocal(); }, [refreshLocal]);

  const runLocalSetup = async () => {
    setSetupBusy(true);
    setError('');
    setStatus('Setting up local AI separation (one-time, a few hundred MB)…');
    setProgress(0);
    try {
      const res = await localSetup((p, msg) => { setProgress(p || 0); if (msg) setStatus(msg); });
      if (!res?.ok) { setError(res?.error || 'Setup failed.'); setStatus('Setup failed'); }
      else { setStatus(res.cuda ? 'Local AI ready — GPU detected.' : 'Local AI ready — running on CPU.'); }
      await refreshLocal();
    } catch (e) {
      setError(e?.message || 'Setup failed.');
      setStatus('Setup failed');
    } finally {
      setSetupBusy(false);
    }
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

    /* Which ENGINE was asked for, and roughly how long the track is. Never the
       file name — that is the user's song title and often their own name — and
       never the audio. See services/analytics.js; the sanitiser would drop a
       filename anyway, but it should not be offered in the first place. */
    track('stem_split_requested', {
      mode,
      device,
      duration_bucket: file.size > 40e6 ? 'long' : file.size > 8e6 ? 'medium' : 'short',
    });

    try {
      const ctx = getCtx();
      if (ctx.state === 'suspended') await ctx.resume();

      // Guaranteed-output engine. No key, no setup, works on any machine — so
      // the Stemmer NEVER just does nothing. Local/Cloud fall back to this when
      // they aren't set up, and the picker's Offline option runs it directly.
      const runOffline = async (note) => {
        setStatus(`${note ? note + ' ' : ''}Decoding ${file.name}…`);
        const buffer = await decodeAudioFile(file, ctx);
        setDuration(buffer.duration);
        const onStep = (p, label) => { setProgress(p); setStatus(label); };
        const wantGpu = device === 'gpu' || (device === 'auto' && gpuOk !== false);
        let result = null;
        let ranOn = 'CPU';
        if (wantGpu) {
          try {
            const canGpu = gpuOk === null ? await gpuAvailable() : gpuOk;
            if (!canGpu) throw new Error('no-gpu');
            setStatus('Separating stems on your GPU…');
            ({ stems: result } = await separateStemsGPU(buffer, onStep));
            ranOn = 'GPU';
          } catch (gpuErr) {
            console.warn('GPU stemming failed, falling back to CPU:', gpuErr);
            if (device === 'gpu') {
              throw new Error(
                'GPU separation failed — your GPU may not have enough memory for a file this long. '
                + 'Switch the processor to CPU or Auto and try again.'
              );
            }
            result = null;
          }
        }
        if (!result) {
          setStatus(device === 'cpu' ? 'Separating stems on your CPU…' : 'GPU unavailable — separating on your CPU…');
          ({ stems: result } = await separateStems(buffer, onStep));
          ranOn = 'CPU';
        }
        setStems(result);
        setStatus(
          note
            ? `${note} Ready (Offline · ${ranOn}) — ${STEM_DEFS.length} stems from ${file.name}`
            : `Ready (Offline · ${ranOn}) — ${STEM_DEFS.length} stems from ${file.name}`
        );
      };

      if (mode === 'local') {
        // Local AI not usable on this machine yet? Never leave the user with
        // nothing — give them Offline stems now and tell them how to unlock
        // true AI separation.
        if (!canLocal) {
          await runOffline('Local AI needs the desktop app —');
          setError('Local AI (true isolated stems) runs only in the installed desktop app. Ran Offline this time.');
          setMuted(Object.fromEntries(STEM_DEFS.map((s) => [s.id, false])));
          setSolo(null);
          setProgress(1);
          return;
        }
        if (!local.ready) {
          await runOffline('Local AI not set up yet —');
          setError(
            local.pythonFound
              ? 'Ran Offline. For true isolated stems, click "Set up local AI" above (one-time download), then run again.'
              : 'Ran Offline. Local AI needs Python 3.9+ (python.org); then click "Set up local AI" for true isolated stems.'
          );
          setMuted(Object.fromEntries(STEM_DEFS.map((s) => [s.id, false])));
          setSolo(null);
          setProgress(1);
          return;
        }
        const onStepL = (p, l) => { setProgress(p); setStatus(l); };
        setStatus(`Preparing ${file.name} for AI separation…`);
        let ran;
        try {
          ran = await separateStemsLocal(file, device, onStepL, ctx);
        } catch (e) {
          // GPU out of memory mid-run, and the user didn't force GPU → retry CPU.
          if (e.cudaError && device !== 'gpu') {
            setStatus('GPU ran out of memory — finishing on your CPU…');
            ran = await separateStemsLocal(file, 'cpu', onStepL, ctx);
          } else {
            throw e;
          }
        }
        const result = ran.stems;
        const anyStem = Object.values(result)[0];
        setDuration(anyStem ? anyStem.duration : 0);
        setStems(result);
        setStatus(
          `Ready (Local AI · ${ran.device === 'cuda' ? 'GPU' : 'CPU'}) — ${Object.keys(result).length} real stems from ${file.name}`
        );
      } else if (mode === 'cloud') {
        if (!hasCloudKey) {
          // No key? Don't dead-end — run Offline now and point them at Settings.
          await runOffline('Cloud needs a Replicate key —');
          setError('Ran Offline. For Cloud Demucs, paste a Replicate API key in Settings → Stemmer Cloud.');
          setMuted(Object.fromEntries(STEM_DEFS.map((s) => [s.id, false])));
          setSolo(null);
          setProgress(1);
          return;
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
        await runOffline();
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
    <div className="tab-video-shell">
      {/* The bud-macro clip that was here got pulled on 2026-08-11 — it said
          nothing about what this tab does. This one is his
          Light_thread_splitting_into_colors render: one white thread separating
          into its coloured strands, which is the tab in one image. */}
      <TabBackground name="stemmer" />
      <div className="tab-video-content">
    <div
      className="stemmer-root"
      data-help="Stemmer splits a mix into Vocals, Drums, Bass, Guitar, Keys, and Other. Offline = free, light CPU, no key. Cloud = optional Replicate Demucs API for pro quality (no local GPU)."
    >
      <div className="stemmer-header">
        <div>
          <h2 className="chrome-title stemmer-title">Stemmer</h2>
          <p className="stemmer-sub">
            Separate a full mix into playable, exportable tracks. Offline runs on your own machine (GPU or CPU),
            free and no key. Cloud Demucs is an optional API key that runs on remote servers.
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
              className="stemmer-btn stemmer-btn-emerald"
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

      {/* ── CLOUD-ASSISTED FEATURE TRANSPARENCY ─────────────────────────────
          Said up front, before the engine picker, not buried in the help text
          underneath it. Two tabs in this app do work off this machine and a
          customer is entitled to know which and why BEFORE they drop a file in,
          not after they notice an upload. The reason is the honest one: Demucs
          wants far more VRAM than the 4 GB hardware this product targets, so
          high-fidelity separation is offloaded rather than made to crawl or
          fail locally. */}
      <div className="stemmer-transparency" data-help="Lyricist Pro tells you which engines run off this machine. Local and Offline never send your audio anywhere. Cloud sends the file you choose to Replicate under your own API key — nothing is uploaded until you pick Cloud and drop a file.">
        <span className="stemmer-transparency-mark" aria-hidden="true">☁</span>
        <div>
          <b>Cloud Stem Extraction · BYO Replicate Key</b>
          <span>
            High-fidelity Demucs separation offloads to the Replicate API to preserve local machine
            resources on 4&nbsp;GB VRAM hardware. It runs under <i>your</i> key and only when you
            choose the Cloud engine. Local and Offline never leave this computer.
          </span>
        </div>
      </div>

      {/* Engine: Local AI (real stems) · Cloud AI · Offline (fast/rough) */}
      <div
        className="stemmer-mode-bar"
        data-help="Local AI = true separation on your own machine (Demucs), real isolated stems, no key. Cloud AI = the same quality on Replicate's servers using your own key, which is how a 4 GB VRAM machine gets pro stems. Offline = fast frequency split on your CPU/GPU, rough (stems bleed) — good for a quick preview, not true isolation."
      >
        <span className="stemmer-mode-label">Engine</span>
        <button
          type="button"
          className={`stemmer-mode-btn ${mode === 'local' ? 'is-active' : ''}`}
          disabled={busy}
          onClick={() => setMode('local')}
        >
          Local AI
          <small>
            {!canLocal ? 'desktop app only'
              : !local.checked ? 'checking…'
              : local.ready ? (local.cuda ? 'real stems · GPU' : 'real stems · CPU')
              : local.pythonFound ? 'needs one-time setup'
              : 'needs Python'}
          </small>
        </button>
        <button
          type="button"
          className={`stemmer-mode-btn ${mode === 'cloud' ? 'is-active cloud' : ''}`}
          disabled={busy}
          onClick={() => setMode('cloud')}
        >
          Cloud AI
          <small>{hasCloudKey ? 'real stems · Replicate' : 'needs Replicate key'}</small>
        </button>
        <button
          type="button"
          className={`stemmer-mode-btn ${mode === 'offline' ? 'is-active' : ''}`}
          disabled={busy}
          onClick={() => setMode('offline')}
        >
          Offline
          <small>fast · rough · no key</small>
        </button>

        {mode === 'local' && canLocal && !local.ready && (
          <button
            type="button"
            className="stemmer-btn stemmer-btn-emerald"
            disabled={setupBusy || busy || !local.pythonFound}
            onClick={runLocalSetup}
          >
            {setupBusy ? 'Setting up…' : 'Set up local AI'}
          </button>
        )}
        {mode === 'local' && !canLocal && (
          <span className="stemmer-mode-hint">Local AI runs in the desktop app. In a browser, use Cloud or Offline.</span>
        )}
        {mode === 'local' && canLocal && local.checked && !local.pythonFound && !local.ready && (
          <span className="stemmer-mode-hint">
            Needs <strong>Python 3.9+</strong> (python.org). Then click Set up local AI — or use Cloud / Offline.
          </span>
        )}
        {mode === 'local' && canLocal && local.ready && (
          <span className="stemmer-mode-hint ok">
            True AI stems on your machine{local.cuda ? ' — GPU ready.' : ' — running on CPU.'}
          </span>
        )}
        {mode === 'cloud' && !hasCloudKey && (
          <span className="stemmer-mode-hint">
            Add a Replicate key in <strong>Settings</strong>, or use Local / Offline.
          </span>
        )}
        {mode === 'cloud' && hasCloudKey && (
          <span className="stemmer-mode-hint ok">Cloud Demucs runs remotely — real stems, your GPU is not used.</span>
        )}
        {mode === 'offline' && (
          <span className="stemmer-mode-hint">
            Rough preview — stems bleed into each other. For true isolation use Local AI or Cloud.
          </span>
        )}
      </div>

      {/* Processor picker — GPU/CPU applies to Local AI and the Offline engine */}
      {(mode === 'offline' || mode === 'local') && (
        <div
          className="stemmer-mode-bar"
          data-help="GPU uses your graphics card — much faster, needs enough video memory. CPU uses your processor — always works, uses more system RAM, slower. Auto tries the GPU first and falls back to the CPU if the GPU can't handle it."
        >
          <span className="stemmer-mode-label">Processor</span>
          <button
            type="button"
            className={`stemmer-mode-btn ${device === 'auto' ? 'is-active' : ''}`}
            disabled={busy}
            onClick={() => setDevice('auto')}
          >
            Auto
            <small>GPU first, CPU backup</small>
          </button>
          <button
            type="button"
            className={`stemmer-mode-btn ${device === 'gpu' ? 'is-active' : ''}`}
            disabled={busy}
            onClick={() => setDevice('gpu')}
          >
            GPU
            <small>
              {gpuOk === null ? 'checking…' : gpuOk ? (gpuLabel || 'ready') : 'not detected'}
            </small>
          </button>
          <button
            type="button"
            className={`stemmer-mode-btn ${device === 'cpu' ? 'is-active' : ''}`}
            disabled={busy}
            onClick={() => setDevice('cpu')}
          >
            CPU
            <small>always works · slower</small>
          </button>
          {device === 'gpu' && gpuOk === false && (
            <span className="stemmer-mode-hint">
              No GPU detected — this will fail. Use <strong>CPU</strong> or <strong>Auto</strong>.
            </span>
          )}
          {device === 'gpu' && gpuOk && (
            <span className="stemmer-mode-hint ok">
              Running on your GPU. If a long song runs out of video memory, switch to Auto or CPU.
            </span>
          )}
          {device === 'auto' && (
            <span className="stemmer-mode-hint ok">
              {gpuOk ? 'Will use your GPU, and fall back to CPU if it runs short on memory.'
                     : 'No GPU detected yet — will run on your CPU.'}
            </span>
          )}
        </div>
      )}

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
        <strong>Offline</strong> (default): spectral mid-side split on your own machine — free, private, no API key.
        Runs on your <strong>GPU</strong> (fast, needs enough video memory) or <strong>CPU</strong> (always works,
        slower). <strong>Auto</strong> uses the GPU and falls back to the CPU if the card runs short on memory.
        A weak GPU or CPU just means a longer wait — a very long song can outrun a small GPU's memory, and that's
        when CPU (or a shorter clip) is the move.
        <br />
        <strong>Cloud</strong> (optional): Demucs ML on{' '}
        <a href="https://replicate.com/account/api-tokens" target="_blank" rel="noopener noreferrer">
          Replicate
        </a>{' '}
        with your own key — pro stems without a powerful PC. Guitar/Keys slots fill from residual when the cloud
        model only returns four stems (vocals/drums/bass/other).
      </p>
    </div>
      </div>
    </div>
  );
}
