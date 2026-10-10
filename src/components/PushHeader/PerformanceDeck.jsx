import React, { useCallback, useEffect, useRef, useState } from 'react';
import { getAudioContext, resumeAudio } from '../../services/audioEngine.js';
import { listPacks, createPack, addSample, getSampleBuffer } from '../../services/sampleLibrary.js';

/**
 * PERFORMANCE DECK, under the pad board.
 *
 * GarageBand Live Loops style. Top: clip grid (tap = launch on the next bar,
 * column buttons launch a whole column). Bottom FX panel: Filter XY | Echo and
 * High-pass pills around RESET, Reverse, Scratch (hold = the record rocked
 * back and forth under the needle, drag sideways = faster hand), Stop (the
 * needle ripped across the record) | Repeater XY (Y = slow to fast, and faster
 * the longer you hold; X = gate). Scratch, Stop and Repeater cut up the clips'
 * own audio; the clips keep running silently underneath so they come back in
 * time on release.
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

function XYPad({ label, hint, x, y, on, onChange, onEnd, color }) {
  const ref = useRef(null);
  const pos = (e) => {
    const r = ref.current.getBoundingClientRect();
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, 1 - (e.clientY - r.top) / r.height))];
  };
  return (
    <div
      ref={ref}
      className={`pd-xy${on ? ' is-active' : ''}`}
      style={{ '--c': color }}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); onChange(...pos(e), true); }}
      // Follows the drag while this pad holds the pointer. It used to wait for an
      // `active` prop nobody passed (the state is `on`), so a slide did nothing.
      onPointerMove={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) onChange(...pos(e), false); }}
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
  const gains = useRef(new Map());                           // cell -> the clip's GainNode
  const rep = useRef(null);                                  // Repeater in progress
  const scratch = useRef(null);                              // Scratch in progress

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
      clearInterval(rep.current?.timer);
      clearInterval(scratch.current?.timer);
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
    gains.current.delete(cell);
    const ms = Math.max(0, (when - getAudioContext().currentTime) * 1000);
    timers.current.push(setTimeout(() => setState((s) => { const n = { ...s }; if (n[cell] === 'stopping') delete n[cell]; return n; }), ms));
    setState((s) => ({ ...s, [cell]: 'stopping' }));
  };

  // Start a clip looping at `when`, `offset` seconds into `buf`.
  const startClip = (cell, buf, when, offset = 0) => {
    const ctx = getAudioContext();
    const src = ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const g = ctx.createGain(); g.gain.value = 0.9;
    src.connect(g).connect(out());
    src.start(when, offset);
    runs.current.set(cell, src);
    gains.current.set(cell, g);
    began.current.set(cell, when - offset);
  };

  const launch = (cell, when) => {
    const ctx = getAudioContext();
    startClip(cell, bufFor(cell), when);
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

  // Where a clip's loop is right now, on the bar grid, in the buffer it plays.
  const gridPos = (c) => {
    const dur = bufs.current.get(c).duration;
    return ((getAudioContext().currentTime - began.current.get(c)) % dur + dur) % dur;
  };
  // A clip launched on the next bar has not started yet: the FX leave it alone.
  const sounding = () => [...runs.current.keys()].filter((c) => bufs.current.get(c) && began.current.get(c) <= getAudioContext().currentTime);
  // Fade a clip's own output (it keeps running underneath, so it stays in time).
  const level = (c, v, tc = 0.006) => {
    const g = gains.current.get(c);
    try { g?.gain.setTargetAtTime(v, getAudioContext().currentTime, tc); } catch { /* ctx closed */ }
  };
  // One slice of a buffer at `when`, `len` seconds long, with an optional
  // playback-rate curve: the building block of Repeater, Scratch and Stop.
  const grain = (buf, offset, len, when, rates, lvl = 0.9) => {
    const ctx = getAudioContext();
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    const fade = Math.min(0.006, len / 4);
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(lvl, when + fade);
    g.gain.setValueAtTime(lvl, when + len - fade);
    g.gain.linearRampToValueAtTime(0, when + len);
    if (rates) src.playbackRate.setValueCurveAtTime(Float32Array.from(rates), when, len);
    src.connect(g).connect(out());
    const dur = buf.duration;
    src.start(when, ((offset % dur) + dur) % dur);
    src.stop(when + len + 0.01);
  };
  // Swap a running clip onto a fresh source playing `buf` from `offset`, now.
  const replay = (c, buf, offset) => {
    try { runs.current.get(c).stop(); } catch { /* ended */ }
    startClip(c, buf, getAudioContext().currentTime, offset);
  };

  // STOP: the needle dragged across the record. The clips' own sound yanked
  // backwards, fast and dying, over a burst of needle noise, then silence.
  const needle = (when) => {
    const ctx = getAudioContext();
    const n = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.42), ctx.sampleRate);
    const d = n.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = n;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 2.2;
    bp.frequency.setValueCurveAtTime(Float32Array.from([700, 4200, 1300, 2800, 350]), when, 0.38);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(0.5, when + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, when + 0.4);
    src.connect(bp).connect(g).connect(out());
    src.start(when); src.stop(when + 0.42);
  };
  const stopAll = async () => {
    await resumeAudio();
    endRepeat(); endScratch();
    const now = getAudioContext().currentTime;
    sounding().forEach((c) => {
      const back = bufFor(c, !rev);
      grain(back, back.duration - gridPos(c), 0.34, now, [3.4, 1.6, 0.12]);
      level(c, 0, 0.004);
    });
    needle(now);
    [...runs.current.keys()].forEach((c) => stopCell(c, now + 0.03));
    setDisplay('Stopped');
  };

  // Reverse: swap every running clip onto its reversed (or normal) buffer, in place.
  const flip = () => {
    const r = !rev;
    setRev(r);
    sounding().forEach((c) => replay(c, bufFor(c, r), bufs.current.get(c).duration - gridPos(c)));
    setDisplay(r ? 'Reverse' : 'Forward');
  };

  // REPEATER: beat-repeat. Grabs the slice each playing clip is on and fires
  // it again and again. Y = rate, one beat up to a 32nd, and it speeds up the
  // longer you hold; X = gate, how much of each repeat sounds.
  const repeatClips = (x, y, first) => {
    if (!first) { if (rep.current) { rep.current.x = x; rep.current.y = y; } return !!rep.current; }
    endRepeat();
    const cells = sounding();
    if (!cells.length) return false;
    const st = { cells, at: new Map(cells.map((c) => [c, gridPos(c)])), x, y, t0: performance.now(), next: getAudioContext().currentTime + 0.01 };
    cells.forEach((c) => level(c, 0));
    const pump = () => {
      const now = getAudioContext().currentTime;
      while (st.next < now + 0.08) {
        const held = Math.min(1, (performance.now() - st.t0) / 1800);
        const period = bar() / (4 * Math.pow(8, Math.min(1, st.y * (0.6 + 0.4 * held))));
        const len = Math.max(0.012, period * (0.2 + 0.8 * st.x));
        st.cells.forEach((c) => { const b = bufFor(c); if (b) grain(b, st.at.get(c), len, st.next); });
        st.next += period;
      }
    };
    pump();
    st.timer = setInterval(pump, 25);
    rep.current = st;
    return true;
  };
  const endRepeat = () => {
    const st = rep.current;
    if (!st) return;
    clearInterval(st.timer);
    rep.current = null;
    st.cells.forEach((c) => level(c, 0.9));
  };

  // SCRATCH: hold and the record rocks back and forth under the needle on the
  // slice it was on, forwards then backwards, each stroke speeding up and
  // easing off like a hand. Drag right = faster hand, left = slower.
  const scratchDown = async (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    await resumeAudio();
    endScratch();
    const cells = sounding();
    if (!cells.length) { setDisplay('Launch a clip, then scratch it.'); return; }
    const st = { cells, at: new Map(cells.map((c) => [c, gridPos(c)])), x: e.clientX, speed: 1, fwd: true, next: getAudioContext().currentTime + 0.005 };
    cells.forEach((c) => level(c, 0));
    const pump = () => {
      const now = getAudioContext().currentTime;
      while (st.next < now + 0.06) {
        const stroke = 0.13 / st.speed;
        const travel = bar() / 16;
        const r = travel / stroke;
        const curve = [0.05, 2 * r, 0.05];
        st.cells.forEach((c) => {
          const b = bufFor(c);
          if (!b) return;
          const p = st.at.get(c);
          if (st.fwd) grain(b, p, stroke, st.next, curve);
          else grain(bufFor(c, !rev), b.duration - p - travel, stroke, st.next, curve);
        });
        st.fwd = !st.fwd;
        st.next += stroke;
      }
    };
    pump();
    st.timer = setInterval(pump, 20);
    scratch.current = st;
    setScr(true);
  };
  const scratchMove = (e) => {
    const st = scratch.current;
    if (st) st.speed = Math.min(3, Math.max(0.4, 1 + (e.clientX - st.x) / 70));
  };
  const endScratch = () => {
    const st = scratch.current;
    if (!st) return;
    clearInterval(st.timer);
    scratch.current = null;
    st.cells.forEach((c) => level(c, 0.9));
  };
  const scratchUp = () => { endScratch(); setScr(false); };

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
              type="button" className={`pd-b${scr ? ' on' : ''}`} title="Scratch: hold = scratch the playing clips, drag sideways = speed"
              onPointerDown={scratchDown} onPointerMove={scratchMove} onPointerUp={scratchUp} onPointerCancel={scratchUp}
            >◉</button>
            <button type="button" className="pd-b" onClick={stopAll} title="Stop: needle scratch, the record stops">■</button>
          </div>
          <VSlider label="High-pass" value={hp} onChange={setHp} color="#7ee06a" />
        </div>
        <XYPad
          label="Repeater" hint="up: slow → fast · X gate" color="#ff4f8b" {...right}
          onChange={(x, y, first) => { setRight({ x, y, on: true }); stutter(x, y, first, false, repeatClips(x, y, first)); }}
          onEnd={() => { setRight((r) => ({ ...r, on: false })); endRepeat(); stutter(0, 0, false, true); }}
        />
      </div>
    </div>
  );
}
