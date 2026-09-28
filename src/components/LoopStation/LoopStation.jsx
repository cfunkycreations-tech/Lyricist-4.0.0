import React, { useState, useRef, useCallback, useEffect } from 'react';
import { getAudioContext, getMasterBus, resumeAudio, decodeBlob } from '../../services/audioEngine.js';
import { audioBufferToWav } from '../../utils/wavEncoder.js';
import { registerDemoSnapshot } from '../../services/demoSafety.js';

import TabBackground from '../common/TabBackground.jsx';
import { Grid3x3, Save, Play, Square } from 'lucide-react';
import { notify } from '../../services/dialog.js';
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
    <div className="rc-plate rc-fx" data-help={help}>
      <button type="button" onClick={() => setOn((v) => !v)} className={`rc-key${on ? ' on' : ''}`} aria-pressed={on}>
        <span className="rc-led" />
        {label}: {on ? 'ON' : 'OFF'}
      </button>
      <label style={{ fontSize: '0.65rem', color: 'rgba(230,232,235,0.7)', display: 'flex', alignItems: 'center', gap: 6 }}>
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
    <div className="rc-funk-root" style={{ position: 'relative', flex: 1, minHeight: 0, width: '100%', overflow: 'auto', padding: '20px 24px', color: '#e6e8eb' }}>
      {/* No backdrop sheet here. The root above is already opaque (#030508), so
          the app-wide street scene never shows through at any scroll position.
          There used to be a position:fixed sheet doing this job, and fixed means
          the VIEWPORT — it painted a black rectangle over the header, the
          medallion and the signature the whole time this tab was open. */}
      <div style={{ position: 'relative', zIndex: 1 }}>
      <style>{`
        /* RC-Funk 5000 in Lyricist Pro's materials (styles/materials.css): black
           black glass keys on obsidian glass. The old candy colours live on as
           each key's LED ring, so green still means go and red still means gone. */
        .rc-round-btn {
          --led: 150 70% 50%;
          width: 84px; height: 84px; border-radius: 50%; padding: 0; flex-shrink: 0;
          display: inline-flex; flex-direction: column; align-items: center; justify-content: center; gap: 5px;
          cursor: pointer; color: #E6E8EB; font-family: var(--faf-font);
          background: var(--mat-key); background-color: #202226;
          border: 1px solid #000;
          box-shadow:
            0 0 0 3px #0b0c0d,
            0 0 0 4px hsl(var(--led) / 0.55),
            0 0 14px 1px hsl(var(--led) / 0.35),
            inset 0 1px 0 rgba(255,255,255,0.22), inset 0 -3px 6px rgba(0,0,0,0.45),
            0 6px 12px rgba(0,0,0,0.6);
          transition: transform 0.08s ease, box-shadow 0.15s ease, filter 0.15s ease;
        }
        .rc-round-btn:hover:not(:disabled) { filter: brightness(1.12); box-shadow: 0 0 0 3px #0b0c0d, 0 0 0 4px hsl(var(--led) / 0.9), 0 0 20px 2px hsl(var(--led) / 0.55), inset 0 1px 0 rgba(255,255,255,0.22), inset 0 -3px 6px rgba(0,0,0,0.45), 0 6px 12px rgba(0,0,0,0.6); }
        .rc-round-btn:active:not(:disabled) { transform: translateY(1px); }
        .rc-round-btn:disabled { cursor: not-allowed; }
        .rc-round-icon { line-height: 1; display: flex; }
        .rc-round-btn svg.lucide { color: hsl(var(--led) / 1); filter: drop-shadow(0 -1px 0 rgba(0,0,0,.85)) drop-shadow(0 0 2px hsl(var(--led))) drop-shadow(0 0 7px hsl(var(--led) / .6)); }
        .rc-round-label { font-size: 0.66rem; letter-spacing: 0.12em; text-transform: uppercase; }
        .rc-round-green { --led: 142 65% 52%; }
        .rc-round-yellow { --led: 36 78% 58%; }
        .rc-round-red { --led: 0 78% 60%; }
        .rc-round-cyan { --led: 0 60% 58%; }

        .rc-key, .rc-track-btn {
          --led: 36 78% 58%;
          display: inline-flex; align-items: center; justify-content: center; gap: 8px;
          min-width: 76px; height: 34px; padding: 0 14px; border-radius: 4px;
          font-family: var(--faf-font); font-size: 0.72rem; letter-spacing: 0.08em; text-transform: uppercase;
          color: #E6E8EB; cursor: pointer;
          background: var(--mat-key); background-color: #202226;
          border: 1px solid #000;
          box-shadow: var(--mat-key-shadow);
          transition: transform 0.08s ease, box-shadow 0.12s ease;
        }
        .rc-key:hover:not(:disabled), .rc-track-btn:hover:not(:disabled) { background: var(--mat-key-hover); color: #fff; }
        .rc-key:active:not(:disabled), .rc-track-btn:active:not(:disabled), .rc-key.on { transform: translateY(1px); box-shadow: var(--mat-key-pressed); }
        .rc-track-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .rc-led, .rc-track-btn::before {
          content: ''; width: 6px; height: 6px; border-radius: 50%; flex: none;
          background: hsl(var(--led) / 0.25); box-shadow: inset 0 0 1px #000;
        }
        .rc-key.on .rc-led, .rc-track-btn:hover:not(:disabled)::before, .rc-track-btn.lit::before {
          background: hsl(var(--led)); box-shadow: 0 0 6px hsl(var(--led)), 0 0 12px hsl(var(--led) / 0.5);
        }
        .rc-key.on { color: var(--amber-hot); }
        .rc-track-green { --led: 0 78% 58%; }
        .rc-track-yellow { --led: 36 78% 58%; }
        .rc-track-red { --led: 0 0% 70%; }

        .rc-plate {
          background: var(--mat-panel); background-color: var(--mat-panel-color);
          border: 1px solid #000; border-radius: 6px;
          box-shadow: var(--mat-bevel), var(--mat-drop);
        }
        .rc-fx { display: flex; flex-direction: column; gap: 8px; padding: 10px 12px; min-width: 150px; }
        .rc-track.recording { box-shadow: var(--mat-bevel), inset 3px 0 0 hsl(0 78% 58%), 0 0 16px -6px hsl(0 78% 58% / 0.8); }
        .rc-clip-led { width: 8px; height: 36px; border-radius: 2px; background: #0b0c0d; box-shadow: inset 0 1px 3px #000, 0 1px 0 rgba(255,255,255,0.06); }
        .rc-clip-led.has { background: linear-gradient(0deg, rgba(var(--accent-rgb),0.5), var(--amber-hot)); box-shadow: 0 0 8px rgba(var(--accent-rgb),0.6); }
        .rc-clip-led.muted { background: #3a3c40; box-shadow: inset 0 1px 3px #000; }
      `}</style>
      <h1 style={{ fontFamily: 'var(--faf-font)', fontWeight: 400, fontSize: 'clamp(1.6rem, 3vw, 2.4rem)', margin: '0 0 6px', color: '#fff', letterSpacing: '0.06em' }}>
        RC-FUNK 5000
      </h1>
      <p style={{ color: 'var(--amber-hot)', letterSpacing: '0.18em', textTransform: 'uppercase', fontSize: '0.7rem', margin: '0 0 22px' }} data-help="Live multi-track looper with master Delay, Reverb, and Dub FX. Record phrases, stack up to 4 tracks, polish with FX.">
        Live Loop Station · 4 tracks · Delay · Reverb · Dub FX · offline
      </p>

      {/* Transport — big round buttons: 1 green · 2 yellow · 3 red */}
      <div
        className="rc-transport"
        style={{ display: 'flex', flexWrap: 'wrap', gap: 22, marginBottom: 22, alignItems: 'center', paddingLeft: 4 }}
      >
        <button
          type="button"
          onClick={playAll}
          data-demo="rc-play"
          className="rc-round-btn rc-round-green"
          data-help="Start all recorded tracks looping through the FX bus."
        >
          <span className="rc-round-icon"><Play size={20} strokeWidth={1.8} /></span>
          <span className="rc-round-label">Play</span>
        </button>
        <button
          type="button"
          onClick={stopAll}
          className="rc-round-btn rc-round-yellow"
          data-help="Stop every loop."
        >
          <span className="rc-round-icon"><Square size={18} strokeWidth={1.8} /></span>
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
            notify(`Groove sent to The Matrix.\nBPM ${bpm} → ~${targetSyllables} syllables/line.\nOpen The Matrix → Advanced Studio → 7 Loop → Pull groove.`, { tone: 'ok' });
          }}
          className="rc-round-btn rc-round-red"
          data-help="Sends this BPM as a groove target to The Matrix (syllable budget + stress bias). No audio upload — just the pocket."
        >
          <span className="rc-round-icon"><Grid3x3 size={18} strokeWidth={1.8} /></span>
          <span className="rc-round-label">Quantum</span>
        </button>
        <button
          onClick={saveLoops}
          disabled={saving || !tracks.some((t) => t.buffer)}
          className="rc-round-btn rc-round-cyan"
          data-help="Save your loops to Documents\Lyricist Recordings as WAVs — a bounced mix of everything plus each track on its own. Loops otherwise only live in memory and vanish when you leave the tab."
          style={{ opacity: tracks.some((t) => t.buffer) ? 1 : 0.4, cursor: tracks.some((t) => t.buffer) ? 'pointer' : 'not-allowed' }}
        >
          <span className="rc-round-icon"><Save size={18} strokeWidth={1.8} /></span>
          <span className="rc-round-label">{saving ? 'Saving…' : 'Save'}</span>
        </button>
        <label style={{ fontSize: '0.8rem', color: 'rgba(230,232,235,0.75)', marginLeft: 8 }} data-help="Reference BPM for you — loops are free-time recordings. Also used for the Matrix groove handshake.">
          BPM ref{' '}
          <input type="number" min={40} max={220} value={bpm} onChange={(e) => setBpm(Number(e.target.value) || 90)} style={{ width: 64, marginLeft: 6, padding: 6, borderRadius: 6, border: '1px solid rgba(155,161,170,0.35)', background: '#101215', color: '#fff' }} />
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

      <p style={{ fontSize: '0.88rem', color: 'rgba(230,232,235,0.8)', marginBottom: 14 }}><b style={{ color: '#e7a540' }}>{status}</b></p>
      {error && <div className="pill-red" style={{ padding: 10, borderRadius: 8, marginBottom: 12, fontSize: '0.8rem' }}>{error}</div>}

      <div style={{ display: 'grid', gap: 12, maxWidth: 720 }}>
        {tracks.map((t) => (
          <div
            key={t.id}
            className={`rc-plate rc-track${recordingId === t.id ? ' recording' : ''}`}
            style={{
              display: 'grid',
              gridTemplateColumns: '100px 1fr auto',
              gap: 12,
              alignItems: 'center',
              padding: '12px 14px',
            }}
            data-help="Each track holds one loop. Record, then Play All to stack. Mute and volume are per track."
          >
            <div>
              <div style={{ fontFamily: 'var(--faf-font)', fontSize: '0.85rem', color: '#fff', letterSpacing: '0.04em' }}>{t.name}</div>
              <div style={{ fontSize: '0.65rem', color: 'rgba(155,161,170,0.6)' }}>
                {t.hasClip ? `${t.lengthSec.toFixed(1)}s loop` : 'empty'}
              </div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
              {recordingId === t.id ? (
                <button type="button" onClick={stopRecord} className="rc-track-btn rc-track-green lit" data-help="Stop recording and lock this loop.">
                  Stop Rec
                </button>
              ) : (
                <button type="button" onClick={() => startRecord(t.id)} className="rc-track-btn rc-track-green" disabled={recordingId != null} data-demo={t.id === 0 ? 'rc-record' : undefined} data-help="Record from your mic onto this track.">
                  Record
                </button>
              )}
              <button type="button" onClick={() => toggleMute(t.id)} className={`rc-track-btn rc-track-yellow${t.muted ? ' lit' : ''}`} aria-pressed={t.muted} data-help="Mute/unmute this track.">
                {t.muted ? 'Unmute' : 'Mute'}
              </button>
              <button type="button" onClick={() => clearTrack(t.id)} className="rc-track-btn rc-track-red" data-help="Delete this track's loop.">
                Clear
              </button>
              <label style={{ fontSize: '0.7rem', color: 'rgba(230,232,235,0.7)', display: 'flex', alignItems: 'center', gap: 6 }}>
                Vol
                <input type="range" min={0} max={1} step={0.01} value={t.gain} onChange={(e) => setGain(t.id, Number(e.target.value))} style={{ width: 100 }} />
              </label>
            </div>
            <div className={`rc-clip-led${t.hasClip ? (t.muted ? ' muted' : ' has') : ''}`} title={t.hasClip ? 'Has loop' : 'Empty'} />
          </div>
        ))}
      </div>

      <ol style={{ marginTop: 22, paddingLeft: 20, color: 'rgba(230,232,235,0.75)', fontSize: '0.85rem', lineHeight: 1.6, maxWidth: 640 }}>
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
