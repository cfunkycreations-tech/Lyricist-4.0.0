import React, { useCallback, useEffect, useRef, useState } from 'react';
import { getAudioContext, resumeAudio } from '../../services/audioEngine.js';
import { triggerSample } from '../../services/drumEngine.js';
import { listPacks, createPack, addSample, getSampleBuffer } from '../../services/sampleLibrary.js';

/**
 * PERFORMANCE DECK, under the pad board.
 *
 * GarageBand Live Loops style. Top: clip grid (tap = launch on the next bar,
 * column buttons launch a whole column). Bottom FX panel: Filter XY | Echo and
 * High-pass pills around RESET, Reverse, Scratch (press = fast loop-skip, drag
 * = scrub speed) and Stop | Repeater XY (slow to fast the longer you slide).
 * Pointer events, so mouse, pen and touch all work.
 */

const CLIPS_KEY = 'lyricist.liveloops.v1';
const COLS = 8;
const ROWS = 3;
const CELLS = COLS * ROWS;

const reversed = (buf) => {
  const out = getAudioContext().createBuffer(buf.numberOfChannels, buf.length, buf.sampleRate);
  for (let c = 0; c < buf.numberOfChannels; c++) out.getChannelData(c).set(Array.from(buf.getChannelData(c)).reverse());
  return out;
};
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
  const [rev, setRev] = useState(false);
  const [scr, setScr] = useState(false);
  const bufs = useRef(new Map());                            // cell -> AudioBuffer
  const rbufs = useRef(new Map());                           // cell -> reversed AudioBuffer
  const runs = useRef(new Map());                            // cell -> AudioBufferSourceNode
  const began = useRef(new Map());                           // cell -> ctx time its loop started
  const t0 = useRef(0);                                      // start of the bar grid
  const fileFor = useRef(0);
  const input = useRef(null);
  const timers = useRef([]);
  const drag = useRef(null);

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
    rbufs.current.delete(cell);
    return buf;
  }, []);
  const bufFor = (cell, r = rev) => {
    const b = bufs.current.get(cell);
    if (!b || !r) return b;
    if (!rbufs.current.has(cell)) rbufs.current.set(cell, reversed(b));
    return rbufs.current.get(cell);
  };

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

  const launch = (cell, when) => {
    const ctx = getAudioContext();
    runs.current.set(cell, triggerSample(ctx, out(), bufFor(cell), when, { loop: true, velocity: 0.9 }));
    began.current.set(cell, when);
    setState((s) => ({ ...s, [cell]: 'queued' }));
    timers.current.push(setTimeout(() => setState((s) => (runs.current.has(cell) ? { ...s, [cell]: 'playing' } : s)), Math.max(0, (when - ctx.currentTime) * 1000)));
  };

  const tap = async (cell) => {
    if (!clips[cell]) { fileFor.current = cell; input.current?.click(); return; }
    await resumeAudio();
    if (runs.current.has(cell)) { stopCell(cell, nextBar()); return; }
    if (!bufs.current.get(cell)) { setDisplay('Clip is loading…'); return; }
    launch(cell, nextBar());
    setDisplay(`${clips[cell].name} → next bar`);
  };

  const launchCol = async (col) => {
    await resumeAudio();
    const when = nextBar();
    for (let r = 0; r < ROWS; r++) {
      const cell = r * COLS + col;
      if (clips[cell] && bufs.current.get(cell) && !runs.current.has(cell)) launch(cell, when);
    }
    setDisplay(`Column ${col + 1} → next bar`);
  };

  const clear = (cell) => {
    stopCell(cell, getAudioContext().currentTime);
    bufs.current.delete(cell); rbufs.current.delete(cell);
    const next = { ...read() }; delete next[cell];
    write(next); setClips(next);
  };

  const stopAll = () => {
    const now = getAudioContext().currentTime;
    [...runs.current.keys()].forEach((c) => stopCell(c, now));
    setDisplay('Stopped');
  };

  // Reverse: swap every running clip onto its reversed (or normal) buffer, in place.
  const flip = () => {
    const r = !rev;
    setRev(r);
    const ctx = getAudioContext();
    [...runs.current.keys()].forEach((c) => {
      try { runs.current.get(c).stop(); } catch { /* ended */ }
      const dur = bufs.current.get(c).duration;
      const pos = ((ctx.currentTime - began.current.get(c)) % dur + dur) % dur;
      const again = ctx.createBufferSource();
      again.buffer = bufFor(c, r); again.loop = true;
      const g = ctx.createGain(); g.gain.value = 0.9;
      again.connect(g).connect(out());
      again.start(ctx.currentTime, dur - pos);
      began.current.set(c, ctx.currentTime - (dur - pos));
      runs.current.set(c, again);
    });
    setDisplay(r ? 'Reverse' : 'Forward');
  };

  // Scratch: press = fast loop-skip on the playing clips, drag sideways = speed.
  const scratchDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const ctx = getAudioContext();
    const slice = bar() / 16;
    drag.current = { x: e.clientX };
    runs.current.forEach((src, c) => {
      const dur = bufs.current.get(c).duration;
      const pos = ((ctx.currentTime - began.current.get(c)) % dur + dur) % dur;
      src.loopStart = pos; src.loopEnd = Math.min(dur, pos + slice);
    });
    setScr(true);
  };
  const scratchMove = (e) => {
    if (!drag.current) return;
    const rate = Math.min(3, Math.max(0.05, 1 + (e.clientX - drag.current.x) / 70));
    runs.current.forEach((src) => { src.playbackRate.value = rate; });
  };
  const scratchUp = () => {
    if (!drag.current) return;
    drag.current = null;
    runs.current.forEach((src) => { src.loopStart = 0; src.loopEnd = 0; src.playbackRate.value = 1; });
    setScr(false);
  };

  const reset = () => {
    setEcho(0); setHp(0);
    setLeft({ x: 1, y: 0, on: false }); filter(1, 0);
    if (rev) flip();
    runs.current.forEach((src) => { src.playbackRate.value = 1; });
    setDisplay('Reset');
  };

  return (
    <div className="pd" onContextMenu={(e) => e.preventDefault()}>
      <div className="pd-clips">
        <div className="pd-grid" style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)` }}>
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
                <i className="pd-pie" />
                <span>{c ? c.name : '+'}</span>
              </button>
            );
          })}
        </div>
        <div className="pd-cols" style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)` }}>
          {Array.from({ length: COLS }, (_, i) => (
            <button key={i} type="button" className="pd-col" onClick={() => launchCol(i)}>{i + 1} ›</button>
          ))}
        </div>
        <input ref={input} type="file" accept="audio/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) assign(fileFor.current, f); }} />
      </div>
      <div className="pd-fx">
        <XYPad
          label="Filter" hint="X cutoff · Y resonance" color="#4aa8ff" {...left}
          onChange={(x, y) => { setLeft({ x, y, on: true }); filter(x, y); }}
          onEnd={() => { setLeft({ x: 1, y: 0, on: false }); filter(1, 0); }}
        />
        <div className="pd-mid">
          <VSlider label="Echo" value={echo} onChange={setEcho} color="#ff9a3c" />
          <div className="pd-btns">
            <button type="button" className="pd-b pd-reset" onClick={reset}>Reset</button>
            <button type="button" className={`pd-b${rev ? ' on' : ''}`} onClick={flip} title="Reverse">◀</button>
            <button
              type="button" className={`pd-b${scr ? ' on' : ''}`} title="Scratch: press = skip-loop, drag = speed"
              onPointerDown={scratchDown} onPointerMove={scratchMove} onPointerUp={scratchUp} onPointerCancel={scratchUp}
            >◉</button>
            <button type="button" className="pd-b" onClick={stopAll} title="Stop">■</button>
          </div>
          <VSlider label="High-pass" value={hp} onChange={setHp} color="#7ee06a" />
        </div>
        <XYPad
          label="Repeater" hint="slide: slow → fast · X gate" color="#ff4f8b" {...right}
          onChange={(x, y, first) => { setRight({ x, y, on: true }); stutter(x, y, first); }}
          onEnd={() => { setRight((r) => ({ ...r, on: false })); stutter(0, 0, false, true); }}
        />
      </div>
    </div>
  );
}
