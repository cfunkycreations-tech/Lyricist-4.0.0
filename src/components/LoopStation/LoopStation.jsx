import React, { useState, useRef, useCallback, useEffect } from 'react';
import { getAudioContext, getMasterBus, resumeAudio, decodeBlob } from '../../services/audioEngine.js';
import { audioBufferToWav } from '../../utils/wavEncoder.js';
import { registerDemoSnapshot } from '../../services/demoSafety.js';

import TabBackground from '../common/TabBackground.jsx';
import { Grid3x3, Save } from 'lucide-react';
// ============================================================
// RC-Funk 5000 — Live Loop Station (Lyricist 4.2.0)
// 4-track looper + master FX: Delay, Reverb, Dub FX (toggleable)
// ============================================================

const TRACKS = 4;
const emptyTrack = (i) => ({
  id: i,
  name: `Track ${i + 1}`,
  buffer: null,
  gain: 0.85,
  muted: false,
  hasClip: false,
  lengthSec: 0,
});

/** Cheap synthetic impulse for reverb (no external IR file). */
function makeImpulse(ctx, seconds = 1.8, decay = 2.4) {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * seconds);
  const impulse = ctx.createBuffer(2, len, rate);
  for (let c = 0; c < 2; c++) {
    const data = impulse.getChannelData(c);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return impulse;
}

export default function LoopStation() {
  const [tracks, setTracks] = useState(() => Array.from({ length: TRACKS }, (_, i) => emptyTrack(i)));
  const [playing, setPlaying] = useState(false);
  const [recordingId, setRecordingId] = useState(null);
  const [bpm, setBpm] = useState(90);
  const [status, setStatus] = useState('RC-Funk 5000 ready. Record a track, Play All, stack layers. Toggle Delay / Reverb / Dub FX on the master bus.');
  const [error, setError] = useState('');

  // Master FX toggles + wet amounts
  const [fxDelay, setFxDelay] = useState(false);
  const [fxReverb, setFxReverb] = useState(false);
  const [fxDub, setFxDub] = useState(false);
  const [delayAmt, setDelayAmt] = useState(0.35);
  const [reverbAmt, setReverbAmt] = useState(0.4);
  const [dubAmt, setDubAmt] = useState(0.45);

  const [saving, setSaving] = useState(false);

  // Loops live in memory only — a demo take recorded over yours would be gone
  // for good. Snapshot the track array (the buffers themselves are untouched).
  const demoRef = useRef(null);
  demoRef.current = { tracks, bpm, fxDelay, fxReverb, fxDub, delayAmt, reverbAmt, dubAmt };
  useEffect(() => registerDemoSnapshot('loop-station', {
    snapshot: () => ({ ...demoRef.current, tracks: demoRef.current.tracks.map((t) => ({ ...t })) }),
    restore: (s) => {
      if (!s) return;
      setTracks(s.tracks);
      setBpm(s.bpm);
      setFxDelay(s.fxDelay); setFxReverb(s.fxReverb); setFxDub(s.fxDub);
      setDelayAmt(s.delayAmt); setReverbAmt(s.reverbAmt); setDubAmt(s.dubAmt);
    },
    hasWork: () => demoRef.current.tracks.some((t) => t.buffer),
  }), []);

  /**
   * Save the loops to disk as WAVs.
   *
   * Loops only ever existed in memory, so closing the tab threw the take away.
   * Every track is written out, plus a bounced mix of all of them lined up at
   * the start, so the whole idea survives as one file too.
   */
  const saveLoops = useCallback(async () => {
    const withClips = tracks.filter((t) => t.buffer);
    if (!withClips.length) {
      setStatus('Nothing to save yet — record a track first.');
      return;
    }
    setSaving(true);
    try {
      const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
      const ctx = getAudioContext();

      // Bounce a mix: longest loop sets the length, everything starts together.
      const longest = Math.max(...withClips.map((t) => t.buffer.duration));
      const off = new OfflineAudioContext(2, Math.ceil(longest * ctx.sampleRate), ctx.sampleRate);
      for (const t of withClips) {
        if (t.muted) continue;
        const src = off.createBufferSource();
        src.buffer = t.buffer;
        const g = off.createGain();
        g.gain.value = t.volume ?? 1;
        src.connect(g).connect(off.destination);
        src.start(0);
      }
      const mix = await off.startRendering();

      const files = [
        { name: `RC-Funk ${stamp} MIX.wav`, buffer: mix },
        ...withClips.map((t) => ({ name: `RC-Funk ${stamp} Track ${t.id + 1}.wav`, buffer: t.buffer })),
      ];

      for (const f of files) {
        const wav = audioBufferToWav(f.buffer);
        const bytes = new Uint8Array(wav);
        if (window.lyricistAPI?.saveRecording) {
          await window.lyricistAPI.saveRecording(f.name, Array.from(bytes));
        } else {
          // Browser fallback so this still works outside Electron.
          const url = URL.createObjectURL(new Blob([wav], { type: 'audio/wav' }));
          const a = document.createElement('a');
          a.href = url; a.download = f.name; a.click();
          URL.revokeObjectURL(url);
        }
      }
      setStatus(`Saved ${files.length} file${files.length === 1 ? '' : 's'} to Documents\\Lyricist Recordings — mix plus each track.`);
    } catch (err) {
      setError(`Could not save: ${err.message}`);
    }
    setSaving(false);
  }, [tracks]);

  const mediaRecRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const sourcesRef = useRef([]);
  const gainsRef = useRef({});
  const fxRef = useRef(null); // shared FX graph

  /** Build / rebuild master FX chain once; tracks feed into fx.input */
  const ensureFx = useCallback(() => {
    if (fxRef.current) return fxRef.current;
    const ctx = getAudioContext();
    const master = getMasterBus();

    const input = ctx.createGain();
    const dry = ctx.createGain();
    dry.gain.value = 1;
    input.connect(dry);
    dry.connect(master);

    // Delay
    const delay = ctx.createDelay(1.5);
    delay.delayTime.value = 0.38;
    const delayFb = ctx.createGain();
    delayFb.gain.value = 0.28;
    const delayWet = ctx.createGain();
    delayWet.gain.value = 0;
    input.connect(delay);
    delay.connect(delayFb);
    delayFb.connect(delay);
    delay.connect(delayWet);
    delayWet.connect(master);

    // Reverb (convolver)
    const convolver = ctx.createConvolver();
    convolver.buffer = makeImpulse(ctx);
    const reverbWet = ctx.createGain();
    reverbWet.gain.value = 0;
    input.connect(convolver);
    convolver.connect(reverbWet);
    reverbWet.connect(master);

    // Dub FX — longer delay + high feedback + dark lowpass (classic dub echo)
    const dubDelay = ctx.createDelay(2.0);
    dubDelay.delayTime.value = 0.55;
    const dubFb = ctx.createGain();
    dubFb.gain.value = 0.55;
    const dubFilter = ctx.createBiquadFilter();
    dubFilter.type = 'lowpass';
    dubFilter.frequency.value = 2200;
    const dubWet = ctx.createGain();
    dubWet.gain.value = 0;
    input.connect(dubDelay);
    dubDelay.connect(dubFilter);
    dubFilter.connect(dubFb);
    dubFb.connect(dubDelay);
    dubFilter.connect(dubWet);
    dubWet.connect(master);

    fxRef.current = { input, dry, delay, delayFb, delayWet, convolver, reverbWet, dubDelay, dubFb, dubFilter, dubWet };
    return fxRef.current;
  }, []);

  // Apply FX toggle amounts live
  useEffect(() => {
    const fx = ensureFx();
    const ctx = getAudioContext();
    const t = ctx.currentTime;
    fx.delayWet.gain.setTargetAtTime(fxDelay ? delayAmt : 0, t, 0.05);
    fx.delayFb.gain.setTargetAtTime(fxDelay ? 0.32 : 0.05, t, 0.05);
    fx.reverbWet.gain.setTargetAtTime(fxReverb ? reverbAmt : 0, t, 0.08);
    fx.dubWet.gain.setTargetAtTime(fxDub ? dubAmt : 0, t, 0.05);
    fx.dubFb.gain.setTargetAtTime(fxDub ? 0.62 : 0.1, t, 0.05);
    // Slight dry dip when wet FX are heavy so it doesn't clip
    const wet = (fxDelay ? delayAmt : 0) + (fxReverb ? reverbAmt : 0) + (fxDub ? dubAmt : 0);
    fx.dry.gain.setTargetAtTime(Math.max(0.45, 1 - wet * 0.25), t, 0.05);
  }, [fxDelay, fxReverb, fxDub, delayAmt, reverbAmt, dubAmt, ensureFx]);

  // Track gains → FX input
  useEffect(() => {
    const ctx = getAudioContext();
    const fx = ensureFx();
    tracks.forEach((t) => {
      if (!gainsRef.current[t.id]) {
        const g = ctx.createGain();
        g.gain.value = t.muted ? 0 : t.gain;
        g.connect(fx.input);
        gainsRef.current[t.id] = g;
      } else {
        gainsRef.current[t.id].gain.value = t.muted ? 0 : t.gain;
      }
    });
  }, [tracks, ensureFx]);

  const stopAllSources = useCallback(() => {
    sourcesRef.current.forEach((s) => {
      try { s.stop(); } catch { /* */ }
    });
    sourcesRef.current = [];
  }, []);

  const playAll = useCallback(async () => {
    await resumeAudio();
    ensureFx();
    const ctx = getAudioContext();
    stopAllSources();
    const withClips = tracks.filter((t) => t.buffer);
    if (!withClips.length) {
      setStatus('No loops recorded yet. Record a track first.');
      return;
    }
    const startAt = ctx.currentTime + 0.05;
    withClips.forEach((t) => {
      const src = ctx.createBufferSource();
      src.buffer = t.buffer;
      src.loop = true;
      src.connect(gainsRef.current[t.id] || ensureFx().input);
      src.start(startAt);
      sourcesRef.current.push(src);
    });
    setPlaying(true);
    setStatus(`Playing ${withClips.length} loop(s). Stack more tracks or flip Delay / Reverb / Dub FX.`);
  }, [tracks, stopAllSources, ensureFx]);

  const stopAll = useCallback(() => {
    stopAllSources();
    setPlaying(false);
    setStatus('Stopped.');
  }, [stopAllSources]);

  const startRecord = async (trackId) => {
    try {
      await resumeAudio();
      setError('');
      if (recordingId != null) {
        setStatus('Already recording — stop that track first.');
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const rec = new MediaRecorder(stream);
      mediaRecRef.current = rec;
      rec.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      rec.onstop = async () => {
        try {
          const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
          const buffer = await decodeBlob(blob);
          setTracks((prev) =>
            prev.map((t) =>
              t.id === trackId
                ? { ...t, buffer, hasClip: true, lengthSec: buffer.duration }
                : t
            )
          );
          setStatus(`Track ${trackId + 1} locked (${buffer.duration.toFixed(1)}s). Play All to loop.`);
          if (playing) {
            const ctx = getAudioContext();
            ensureFx();
            const src = ctx.createBufferSource();
            src.buffer = buffer;
            src.loop = true;
            src.connect(gainsRef.current[trackId] || ensureFx().input);
            src.start(ctx.currentTime);
            sourcesRef.current.push(src);
          }
        } catch (e) {
          setError(e.message || String(e));
        } finally {
          stream.getTracks().forEach((tr) => tr.stop());
          streamRef.current = null;
          mediaRecRef.current = null;
          setRecordingId(null);
        }
      };
      rec.start(100);
      setRecordingId(trackId);
      setStatus(`Recording Track ${trackId + 1}… stop when the phrase ends.`);
    } catch (e) {
      setError('Mic blocked or unavailable: ' + (e.message || String(e)));
    }
  };

  const stopRecord = () => {
    if (mediaRecRef.current && mediaRecRef.current.state !== 'inactive') {
      mediaRecRef.current.stop();
    }
  };

  const clearTrack = (trackId) => {
    setTracks((prev) => prev.map((t) => (t.id === trackId ? emptyTrack(trackId) : t)));
    setStatus(`Track ${trackId + 1} cleared.`);
  };

  const setGain = (trackId, g) => {
    setTracks((prev) => prev.map((t) => (t.id === trackId ? { ...t, gain: g } : t)));
  };

  const toggleMute = (trackId) => {
    setTracks((prev) => prev.map((t) => (t.id === trackId ? { ...t, muted: !t.muted } : t)));
  };

  useEffect(() => () => {
    stopAllSources();
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
  }, [stopAllSources]);

  const FxToggle = ({ on, setOn, label, help, amt, setAmt }) => (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: '10px 12px',
        borderRadius: 12,
        border: on ? '1.5px solid rgba(103,232,249,0.55)' : '1.5px solid rgba(139,92,246,0.3)',
        background: on ? 'rgba(30, 20, 60, 0.75)' : 'rgba(10,6,20,0.65)',
        minWidth: 140,
        boxShadow: on ? '0 0 16px rgba(103,232,249,0.2)' : 'none',
      }}
      data-help={help}
    >
      <button
        type="button"
        onClick={() => setOn((v) => !v)}
        style={{
          border: 'none',
          background: on ? 'linear-gradient(135deg,#38bdf8,#a855f7)' : 'rgba(40,30,70,0.8)',
          color: '#fff',
          fontWeight: 700,
          fontSize: '0.78rem',
          padding: '8px 10px',
          borderRadius: 8,
          cursor: 'pointer',
        }}
      >
        {label}: {on ? 'ON' : 'OFF'}
      </button>
      <label style={{ fontSize: '0.65rem', color: 'rgba(200,190,220,0.7)', display: 'flex', alignItems: 'center', gap: 6 }}>
        Amount
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={amt}
          disabled={!on}
          onChange={(e) => setAmt(Number(e.target.value))}
          style={{ flex: 1 }}
        />
      </label>
    </div>
  );

  return (
    <div className="tab-video-shell">
      <TabBackground name="loopstation" />
      <div className="tab-video-content">
    <div className="rc-funk-root" style={{ position: 'relative', flex: 1, minHeight: 0, width: '100%', overflow: 'auto', background: 'rgba(5,2,8,0.5)', padding: '20px 24px', color: '#f3ecff' }}>
      {/* No backdrop sheet here. The root above is already opaque (#050208), so
          the app-wide street scene never shows through at any scroll position.
          There used to be a position:fixed sheet doing this job, and fixed means
          the VIEWPORT — it painted a black rectangle over the header, the
          medallion and the signature the whole time this tab was open. */}
      <div style={{ position: 'relative', zIndex: 1 }}>
      <style>{`
        .rc-round-btn {
          width: 88px;
          height: 88px;
          border-radius: 50%;
          border: 3px solid transparent;
          display: inline-flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 4px;
          cursor: pointer;
          font-weight: 800;
          transition: transform 0.12s, box-shadow 0.15s, filter 0.15s;
          flex-shrink: 0;
          padding: 0;
        }
        .rc-round-btn:hover { transform: scale(1.06); }
        .rc-round-btn:active { transform: scale(0.96); }
        .rc-round-icon { font-size: 1.45rem; line-height: 1; }
        .rc-round-label { font-size: 0.72rem; letter-spacing: 0.06em; text-transform: uppercase; }
        /* 1 — GREEN (Play) — not red */
        .rc-round-green {
          background: radial-gradient(circle at 35% 30%, #86efac 0%, #22c55e 45%, #15803d 100%);
          border-color: #4ade80;
          color: #052e16;
          box-shadow: 0 0 0 2px rgba(34,197,94,0.35), 0 0 28px rgba(34,197,94,0.55), inset 0 2px 0 rgba(255,255,255,0.35);
          text-shadow: 0 1px 0 rgba(255,255,255,0.35);
        }
        /* 2 — ELECTRIC BLUE (Stop) — no yellow */
        .rc-round-yellow {
          background: radial-gradient(circle at 35% 30%, #a5f3fc 0%, #00e5ff 45%, #0284c7 100%);
          border-color: #67e8f9;
          color: #042f2e;
          box-shadow: 0 0 0 2px rgba(0,229,255,0.45), 0 0 28px rgba(0,229,255,0.55), inset 0 2px 0 rgba(255,255,255,0.4);
          text-shadow: 0 1px 0 rgba(255,255,255,0.35);
        }
        /* 3 — RED (Quantum / third) */
        .rc-round-red {
          background: radial-gradient(circle at 35% 30%, #fca5a5 0%, #ef4444 45%, #b91c1c 100%);
        }
        .rc-round-cyan {
          background: radial-gradient(circle at 35% 30%, #a5f3fc 0%, #22d3ee 45%, #0e7490 100%);
          border-color: #f87171;
          color: #fff;
          box-shadow: 0 0 0 2px rgba(239,68,68,0.4), 0 0 28px rgba(239,68,68,0.5), inset 0 2px 0 rgba(255,255,255,0.25);
        }
        .rc-track-btn {
          min-width: 72px;
          height: 40px;
          padding: 0 16px;
          border-radius: 999px;
          border: 2px solid transparent;
          font-weight: 700;
          font-size: 0.78rem;
          cursor: pointer;
          transition: transform 0.1s, box-shadow 0.12s;
        }
        .rc-track-btn:hover:not(:disabled) { transform: scale(1.04); }
        .rc-track-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .rc-track-green {
          background: linear-gradient(180deg, #4ade80, #16a34a);
          border-color: #86efac;
          color: #052e16;
          box-shadow: 0 0 14px rgba(34,197,94,0.4);
        }
        .rc-track-yellow {
          background: linear-gradient(180deg, #67e8f9, #0284c7);
          border-color: #22d3ee;
          color: #042f2e;
          box-shadow: 0 0 14px rgba(0,229,255,0.45);
        }
        .rc-track-red {
          background: linear-gradient(180deg, #f87171, #dc2626);
          border-color: #fca5a5;
          color: #fff;
          box-shadow: 0 0 14px rgba(239,68,68,0.4);
        }
      `}</style>
      <h1 style={{ fontFamily: "'Audiowide', sans-serif", fontWeight: 700, fontSize: 'clamp(1.6rem, 3vw, 2.4rem)', margin: '0 0 6px', background: 'linear-gradient(90deg,#38bdf8,#a855f7,#f5f3ff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        RC-FUNK 5000
      </h1>
      <p style={{ color: '#a5b4fc', letterSpacing: '0.12em', textTransform: 'uppercase', fontSize: '0.75rem', margin: '0 0 16px' }} data-help="Live multi-track looper with master Delay, Reverb, and Dub FX. Record phrases, stack up to 4 tracks, polish with FX.">
        Live Loop Station · 4 tracks · Delay · Reverb · Dub FX · offline
      </p>

      {/* Transport — big round buttons: 1 green · 2 yellow · 3 red */}
      <div
        className="rc-transport"
        style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 18, alignItems: 'center' }}
      >
        <button
          type="button"
          onClick={playAll}
          data-demo="rc-play"
          className="rc-round-btn rc-round-green"
          data-help="Start all recorded tracks looping through the FX bus."
        >
          <span className="rc-round-icon">▶</span>
          <span className="rc-round-label">Play</span>
        </button>
        <button
          type="button"
          onClick={stopAll}
          className="rc-round-btn rc-round-yellow"
          data-help="Stop every loop."
        >
          <span className="rc-round-icon">■</span>
          <span className="rc-round-label">Stop</span>
        </button>
        <button
          type="button"
          onClick={() => {
            const targetSyllables = Math.max(6, Math.min(14, Math.round(bpm * 0.09)));
            try {
              localStorage.setItem(
                'lyricistLoopHandshake',
                JSON.stringify({
                  bpm,
                  targetSyllables,
                  rhymeDensity: bpm >= 120 ? 'dense' : bpm <= 80 ? 'sparse' : 'balanced',
                  updatedAt: Date.now(),
                  source: 'RC-Funk 5000',
                })
              );
            } catch { /* */ }
            alert(`Groove sent to The Matrix.\nBPM ${bpm} → ~${targetSyllables} syllables/line.\nOpen The Matrix → Advanced Studio → 7 Loop → Pull groove.`);
          }}
          className="rc-round-btn rc-round-red"
          data-help="Sends this BPM as a groove target to The Matrix (syllable budget + stress bias). No audio upload — just the pocket."
        >
          <span className="rc-round-icon"><Grid3x3 size={16} strokeWidth={1.6} /></span>
          <span className="rc-round-label">Quantum</span>
        </button>
        <button
          onClick={saveLoops}
          disabled={saving || !tracks.some((t) => t.buffer)}
          className="rc-round-btn rc-round-cyan"
          data-help="Save your loops to Documents\Lyricist Recordings as WAVs — a bounced mix of everything plus each track on its own. Loops otherwise only live in memory and vanish when you leave the tab."
          style={{ opacity: tracks.some((t) => t.buffer) ? 1 : 0.4, cursor: tracks.some((t) => t.buffer) ? 'pointer' : 'not-allowed' }}
        >
          <span className="rc-round-icon"><Save size={16} strokeWidth={1.6} /></span>
          <span className="rc-round-label">{saving ? 'Saving…' : 'Save'}</span>
        </button>
        <label style={{ fontSize: '0.8rem', color: 'rgba(200,190,220,0.75)', marginLeft: 8 }} data-help="Reference BPM for you — loops are free-time recordings. Also used for the Matrix groove handshake.">
          BPM ref{' '}
          <input type="number" min={40} max={220} value={bpm} onChange={(e) => setBpm(Number(e.target.value) || 90)} style={{ width: 64, marginLeft: 6, padding: 6, borderRadius: 6, border: '1px solid rgba(139,92,246,0.35)', background: '#0d081c', color: '#fff' }} />
        </label>
        {playing && <span className="pill-green" style={{ padding: '4px 10px', borderRadius: 999, fontSize: '0.7rem' }}>LOOPING</span>}
        {recordingId != null && <span className="pill-cyan" style={{ padding: '4px 10px', borderRadius: 999, fontSize: '0.7rem' }}>REC T{recordingId + 1}</span>}
      </div>

      {/* Master FX rack */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 18 }} data-demo="rc-fx" data-help="Master effects on everything coming out of the looper. Toggle ON/OFF and set amount.">
        <FxToggle
          on={fxDelay}
          setOn={setFxDelay}
          label="Delay"
          help="Echo repeats. Classic slap / rhythmic delay on the whole loop mix."
          amt={delayAmt}
          setAmt={setDelayAmt}
        />
        <FxToggle
          on={fxReverb}
          setOn={setFxReverb}
          label="Reverb"
          help="Room / space. Soft wash over the stacked loops."
          amt={reverbAmt}
          setAmt={setReverbAmt}
        />
        <FxToggle
          on={fxDub}
          setOn={setFxDub}
          label="Dub FX"
          help="Long dark echoes with feedback — dub-style decay. Great on vocals and snare hits."
          amt={dubAmt}
          setAmt={setDubAmt}
        />
      </div>

      <p style={{ fontSize: '0.88rem', color: 'rgba(220,210,240,0.8)', marginBottom: 14 }}><b style={{ color: '#67e8f9' }}>{status}</b></p>
      {error && <div className="pill-red" style={{ padding: 10, borderRadius: 8, marginBottom: 12, fontSize: '0.8rem' }}>{error}</div>}

      <div style={{ display: 'grid', gap: 12, maxWidth: 720 }}>
        {tracks.map((t) => (
          <div
            key={t.id}
            style={{
              display: 'grid',
              gridTemplateColumns: '100px 1fr auto',
              gap: 12,
              alignItems: 'center',
              padding: '12px 14px',
              borderRadius: 12,
              border: recordingId === t.id ? '1.5px solid #38bdf8' : '1.5px solid rgba(139,92,246,0.35)',
              background: 'rgba(10,6,20,0.75)',
              boxShadow: recordingId === t.id ? '0 0 20px rgba(56,189,248,0.35)' : 'none',
            }}
            data-help="Each track holds one loop. Record, then Play All to stack. Mute and volume are per track."
          >
            <div>
              <div style={{ fontFamily: "'Audiowide', sans-serif", fontSize: '0.85rem', color: '#a5b4fc' }}>{t.name}</div>
              <div style={{ fontSize: '0.65rem', color: 'rgba(180,170,200,0.6)' }}>
                {t.hasClip ? `${t.lengthSec.toFixed(1)}s loop` : 'empty'}
              </div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
              {recordingId === t.id ? (
                <button type="button" onClick={stopRecord} className="rc-track-btn rc-track-green" data-help="Stop recording and lock this loop.">
                  ■ Stop Rec
                </button>
              ) : (
                <button type="button" onClick={() => startRecord(t.id)} className="rc-track-btn rc-track-green" disabled={recordingId != null} data-demo={t.id === 0 ? 'rc-record' : undefined} data-help="Record from your mic onto this track.">
                  ● Record
                </button>
              )}
              <button type="button" onClick={() => toggleMute(t.id)} className="rc-track-btn rc-track-yellow" data-help="Mute/unmute this track.">
                {t.muted ? 'Unmute' : 'Mute'}
              </button>
              <button type="button" onClick={() => clearTrack(t.id)} className="rc-track-btn rc-track-red" data-help="Delete this track's loop.">
                Clear
              </button>
              <label style={{ fontSize: '0.7rem', color: 'rgba(200,190,220,0.7)', display: 'flex', alignItems: 'center', gap: 6 }}>
                Vol
                <input type="range" min={0} max={1} step={0.01} value={t.gain} onChange={(e) => setGain(t.id, Number(e.target.value))} style={{ width: 100 }} />
              </label>
            </div>
            <div style={{ width: 12, height: 40, borderRadius: 4, background: t.hasClip ? (t.muted ? '#555' : 'linear-gradient(180deg,#38bdf8,#a855f7)') : '#1a1228' }} title={t.hasClip ? 'Has loop' : 'Empty'} />
          </div>
        ))}
      </div>

      <ol style={{ marginTop: 22, paddingLeft: 20, color: 'rgba(200,190,220,0.75)', fontSize: '0.85rem', lineHeight: 1.6, maxWidth: 640 }}>
        <li>Record Track 1 — riff or vocal phrase — Stop Rec.</li>
        <li>Play All, then stack Tracks 2–4 while it loops.</li>
        <li>Flip <b>Delay</b>, <b>Reverb</b>, or <b>Dub FX</b> on the master bus and ride the amounts.</li>
      </ol>
      </div>
    </div>
      </div>
    </div>
  );
}
