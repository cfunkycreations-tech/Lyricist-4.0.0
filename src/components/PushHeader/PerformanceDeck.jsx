import React, { useCallback, useEffect, useRef, useState } from 'react';
import { getAudioContext, resumeAudio } from '../../services/audioEngine.js';
import { triggerSample } from '../../services/drumEngine.js';
import { listPacks, createPack, addSample, getSampleBuffer } from '../../services/sampleLibrary.js';

/**
 * PERFORMANCE DECK, under the pad board.
 *
 * Left XY pad: filter (X cutoff, Y resonance). Right XY pad: stutter / note
 * repeat (slide up = faster, it also speeds up the longer you hold; X = gate).
 * Two vertical faders: Echo and High-pass. Between them a Live Loops clip grid:
 * drop or pick a sample into a cell, tap to launch on the next bar, tap to stop.
 * Pointer events, so mouse, pen and touch all work.
 */

const CLIPS_KEY = 'lyricist.liveloops.v1';
const CELLS = 12;
const read = () => { try { return JSON.parse(localStorage.getItem(CLIPS_KEY)) || {}; } catch { return {}; } };
const write = (v) => { try { localStorage.setItem(CLIPS_KEY, JSON.stringify(v)); } catch { /* storage blocked */ } };

function XYPad({ label, hint, x, y, active, onChange, onEnd, color }) {
  const ref = useRef(null);
  const pos = (e) => {
    const r = ref.current.getBoundingClientRect();
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, 1 - (e.clientY - r.top) / r.height))];
  };
  return (
    <div
      ref={ref}
      className={`pd-xy${active ? ' is-active' : ''}`}
      style={{ '--c': color }}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); onChange(...pos(e), true); }}
      onPointerMove={(e) => { if (active) onChange(...pos(e), false); }}
      onPointerUp={onEnd}
      onPointerCancel={onEnd}
      role="application"
      aria-label={`${label} pad`}
    >
      <span className="pd-label">{label}</span>
      <span className="pd-hint">{hint}</span>
      <span className="pd-dot" style={{ left: `${x * 100}%`, bottom: `${y * 100}%` }} />
    </div>
  );
}

function VSlider({ label, value, onChange, color }) {
  const ref = useRef(null);
  const set = (e) => {
    const r = ref.current.getBoundingClientRect();
    onChange(Math.min(1, Math.max(0, 1 - (e.clientY - r.top) / r.height)));
  };
  return (
    <div className="pd-slider-wrap">
      <div
        ref={ref}
        className="pd-slider"
        style={{ '--c': color }}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); set(e); }}
        onPointerMove={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) set(e); }}
        onWheel={(e) => onChange(Math.min(1, Math.max(0, value + (e.deltaY < 0 ? 0.04 : -0.04))))}
        role="slider"
        aria-label={label}
        aria-valuenow={Math.round(value * 100)}
      >
        <span className="pd-fill" style={{ height: `${value * 100}%` }} />
        <span className="pd-thumb" style={{ bottom: `${value * 100}%` }} />
      </div>
      <span className="pd-label">{label}</span>
    </div>
  );
}

export default function PerformanceDeck({ out, tempo, filter, stutter, echo, setEcho, hp, setHp, setDisplay }) {
  const [left, setLeft] = useState({ x: 1, y: 0, on: false });
  const [right, setRight] = useState({ x: 0.5, y: 0, on: false });
  const [clips, setClips] = useState(() => read());          // cell -> { id, name }
  const [state, setState] = useState({});                    // cell -> 'queued' | 'playing' | 'stopping'
  const bufs = useRef(new Map());                            // cell -> AudioBuffer
  const runs = useRef(new Map());                            // cell -> AudioBufferSourceNode
  const t0 = useRef(0);                                      // start of the bar grid
  const fileFor = useRef(0);
  const input = useRef(null);
  const timers = useRef([]);

  const bar = () => (60 / tempo) * 4;
  const nextBar = () => {
    const ctx = getAudioContext();
    if (!runs.current.size) { t0.current = ctx.currentTime + 0.05; return t0.current; }
    const b = bar();
    return t0.current + Math.ceil((ctx.currentTime - t0.current) / b) * b;
  };

  const load = useCallback(async (cell, id) => {
    const buf = await getSampleBuffer(getAudioContext(), id);
    bufs.current.set(cell, buf);
    return buf;
  }, []);

  useEffect(() => {
    Object.entries(read()).forEach(([cell, c]) => { load(Number(cell), c.id).catch(() => {}); });
    const pending = timers.current;
    const running = runs.current;
    return () => {
      pending.forEach(clearTimeout);
      running.forEach((src) => { try { src.stop(); } catch { /* ended */ } });
      running.clear();
    };
  }, [load]);

  const assign = async (cell, file) => {
    try {
      let pack = (await listPacks()).find((p) => p.name === 'Live Loops');
      if (!pack) pack = await createPack('Live Loops', 'Clips for the Push clone');
      const rec = await addSample(pack.id, file);
      await load(cell, rec.id);
      const next = { ...read(), [cell]: { id: rec.id, name: file.name.replace(/\.[^.]+$/, '') } };
      write(next); setClips(next);
      setDisplay(`Cell ${cell + 1}: ${next[cell].name}`);
    } catch (e) { setDisplay(`Clip: ${e.message}`); }
  };

  const stopCell = (cell, when) => {
    const src = runs.current.get(cell);
    if (!src) return;
    try { src.stop(when); } catch { /* ended */ }
    runs.current.delete(cell);
    const ms = Math.max(0, (when - getAudioContext().currentTime) * 1000);
    timers.current.push(setTimeout(() => setState((s) => { const n = { ...s }; if (n[cell] === 'stopping') delete n[cell]; return n; }), ms));
    setState((s) => ({ ...s, [cell]: 'stopping' }));
  };

  const tap = async (cell) => {
    if (!clips[cell]) { fileFor.current = cell; input.current?.click(); return; }
    await resumeAudio();
    const ctx = getAudioContext();
    if (runs.current.has(cell)) { stopCell(cell, nextBar()); return; }
    const buf = bufs.current.get(cell);
    if (!buf) { setDisplay('Clip is loading…'); return; }
    const when = nextBar();
    runs.current.set(cell, triggerSample(ctx, out(), buf, when, { loop: true, velocity: 0.9 }));
    setState((s) => ({ ...s, [cell]: 'queued' }));
    timers.current.push(setTimeout(() => setState((s) => (runs.current.has(cell) ? { ...s, [cell]: 'playing' } : s)), Math.max(0, (when - ctx.currentTime) * 1000)));
    setDisplay(`${clips[cell].name} → next bar`);
  };

  const clear = (cell) => {
    stopCell(cell, getAudioContext().currentTime);
    bufs.current.delete(cell);
    const next = { ...read() }; delete next[cell];
    write(next); setClips(next);
  };

  const stopAll = () => { const w = nextBar(); [...runs.current.keys()].forEach((c) => stopCell(c, w)); };

  return (
    <div className="pd" onContextMenu={(e) => e.preventDefault()}>
      <XYPad
        label="Filter" hint="X cutoff · Y resonance" color="#4aa8ff" {...left}
        onChange={(x, y) => { setLeft({ x, y, on: true }); filter(x, y); }}
        onEnd={() => { setLeft({ x: 1, y: 0, on: false }); filter(1, 0); }}
      />
      <div className="pd-faders">
        <VSlider label="Echo" value={echo} onChange={setEcho} color="#ff9a3c" />
        <VSlider label="High-pass" value={hp} onChange={setHp} color="#7ee06a" />
      </div>
      <div className="pd-clips">
        <div className="pd-grid">
          {Array.from({ length: CELLS }, (_, i) => {
            const c = clips[i];
            return (
              <button
                key={i}
                type="button"
                className={`pd-clip${c ? ' has' : ''} ${state[i] || ''}`}
                onClick={() => tap(i)}
                onContextMenu={(e) => { e.preventDefault(); if (c) clear(i); }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) assign(i, f); }}
                title={c ? `${c.name} · tap to launch/stop · right-click to clear` : 'Tap or drop an audio file here'}
              >
                <span>{c ? c.name : '+'}</span>
              </button>
            );
          })}
        </div>
        <div className="pd-clip-bar">
          <button type="button" className="pd-stop" onClick={stopAll}>Stop clips</button>
          <span>Live Loops · quantized to the bar</span>
        </div>
        <input ref={input} type="file" accept="audio/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) assign(fileFor.current, f); }} />
      </div>
      <XYPad
        label="Stutter" hint="slide up = faster · X gate" color="#ff4f8b" {...right}
        onChange={(x, y, first) => { setRight({ x, y, on: true }); stutter(x, y, first); }}
        onEnd={() => { setRight((r) => ({ ...r, on: false })); stutter(0, 0, false, true); }}
      />
    </div>
  );
}
