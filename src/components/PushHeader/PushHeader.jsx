import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import './PushHeader.css';
import { getAudioContext, getMasterBus, resumeAudio } from '../../services/audioEngine.js';
import { KIT, triggerVoice, triggerSample } from '../../services/drumEngine.js';
import { INSTRUMENT_GROUPS, DEFAULT_INSTRUMENT, loadInstrument, playNote, midiToNoteName } from '../../services/soundfontEngine.js';
import { listSamples, getSampleBuffer } from '../../services/sampleLibrary.js';
import { createPushLink, hueToPushColor, PUSH_CC } from '../../services/pushMidi.js';
import { loadButterchurn } from '../../services/butterchurnLoader.js';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { Glyph } from '../common/Glyph.jsx';

/**
 * THE PAD HEADER.
 *
 * Chris, 2026-09-15: the tabs become a few square pads instead of a strip you
 * drag across the screen, with a playable instrument behind a toggle and colour
 * sweeping across the pads when idle, Launchpad style.
 *
 * Then, on the first cut: it is NOT a Push lookalike. Nothing drops down over
 * the page; everything opens UP INTO THE HEADER, which grows to hold it. The
 * squares nearly touch. And when the visuals play behind them "you won't see any
 * bleed in between the squares or outside of them... You only see the visuals
 * play behind the squares, not everywhere." So the header is a wall of square
 * cells on black, and colour, sweep or Milkdrop, lives only inside the cells.
 */
export const TAB_GROUPS = [
  { id: 'pen', name: 'The Pen', hue: 322, tabs: ['songwriter', 'onemanband', 'analyzer', 'songforge', 'quantum'] },
  { id: 'studio', name: 'The Studio', hue: 188, tabs: ['booth', 'midistudio', 'loopstation', 'stemmer', 'screw', 'mastering'] },
  { id: 'words', name: 'Word Kit', hue: 142, tabs: ['rhyme', 'thesaurus', 'dictionary', 'scratchpad', 'collab'] },
  { id: 'control', name: 'Control Room', hue: 38, tabs: ['toolshub', 'settings'] },
];

const S = 54;          // one cell
const G = 1;           // the gap: blocks laid tight
const LENS = 0.8;      // each glass block shows 80% of what's behind it, magnified, like thick glass
const IDLE_MS = 5000;
const VIZ_KEY = 'lyricist.push.visuals';
const VIZ_CYCLE_MS = 28000;
// Chris: visuals ONLY on the pad square of the instrument, nowhere else.
const CELLS = '.pc-pad';

/**
 * VISUALS, ONLY INSIDE THE SQUARES.
 *
 * One Butterchurn instance renders offscreen at the header's size. Each frame is
 * copied into a canvas under the header one cell at a time, only where a cell
 * is, so the gaps and everything round the squares stay black.
 */
function usePushVisuals(on, headerRef) {
  const [info, setInfo] = useState({ name: '', count: 0, error: '' });
  const api = useRef({ next: () => {}, step: () => {} });

  useEffect(() => {
    const header = headerRef.current;
    if (!on || !header) return undefined;
    let dead = false;
    let raf = 0;
    let cycle = 0;
    let viz = null;
    const canvas = document.createElement('canvas');
    canvas.className = 'push-viz-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    header.prepend(canvas);
    const off = document.createElement('canvas');
    off.width = 640; off.height = 96;

    loadButterchurn().then(({ butterchurn, map, names }) => {
      if (dead) return;
      viz = butterchurn.createVisualizer(getAudioContext(), off, { width: off.width, height: off.height, pixelRatio: 1 });
      viz.connectAudio(getMasterBus());
      let idx = Math.floor(Math.random() * names.length);
      const load = (i, blend = 2) => {
        idx = (i + names.length) % names.length;
        viz.loadPreset(map[names[idx]], blend);
        setInfo({ name: names[idx], count: names.length, error: '' });
      };
      api.current = {
        next: () => load(Math.floor(Math.random() * names.length), 1.6),
        step: (d) => load(idx + d, 1.2),
      };
      load(idx, 0);
      cycle = setInterval(() => load(Math.floor(Math.random() * names.length), 2.4), VIZ_CYCLE_MS);

      const g = canvas.getContext('2d');
      const draw = () => {
        const W = header.clientWidth;
        const H = header.clientHeight;
        const pads = header.querySelectorAll(CELLS);
        if (W && H && !pads.length) {
          // Pads hidden: nothing to show the picture in, so don't render it.
          if (canvas.width) { canvas.width = 0; canvas.height = 0; }
          header.querySelectorAll('.pc-glass').forEach((el) => el.classList.remove('pc-glass'));
        } else if (W && H) {
          // The 9x9 square: the 8x8 pads plus the row of cells above them and the column to their right.
          let pl = Infinity; let pt = Infinity; let pr = -Infinity; let pb = -Infinity;
          for (const p of pads) {
            const q = p.getBoundingClientRect();
            pl = Math.min(pl, q.left); pt = Math.min(pt, q.top); pr = Math.max(pr, q.right); pb = Math.max(pb, q.bottom);
          }
          pt -= S + G;
          pr += S + G;
          const glass = [];
          for (const el of header.querySelectorAll('.pc')) {
            const q = el.getBoundingClientRect();
            const mx = (q.left + q.right) / 2;
            const my = (q.top + q.bottom) / 2;
            const inside = mx > pl && mx < pr && my > pt && my < pb;
            el.classList.toggle('pc-glass', inside);
            if (inside) glass.push(el);
          }
          // Render at most 1280 wide and scale up; plenty for the inside of squares.
          const rw = Math.min(W, 1280);
          const rh = Math.max(40, Math.round((H * rw) / W));
          if (off.width !== rw || off.height !== rh) { off.width = rw; off.height = rh; viz.setRendererSize(rw, rh); }
          if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
          viz.render();
          g.clearRect(0, 0, W, H);
          const hr = header.getBoundingClientRect();
          const sx = rw / W;
          const sy = rh / H;
          const boxes = new Map();
          for (const el of glass) {
            const cell = el.getBoundingClientRect();
            // A grid hides cells that don't fit; paint only the part its grid actually shows.
            const box = el.parentElement;
            if (!boxes.has(box)) boxes.set(box, box.getBoundingClientRect());
            const b = boxes.get(box);
            const left = Math.max(cell.left, b.left);
            const top = Math.max(cell.top, b.top);
            const right = Math.min(cell.right, b.right);
            const bottom = Math.min(cell.bottom, b.bottom);
            if (right - left < 1 || bottom - top < 1) continue;
            const r = { width: right - left, height: bottom - top };
            const x = left - hr.left;
            const y = top - hr.top;
            // Thick glass magnifies: sample a smaller patch centred on the block and stretch it to fill.
            const sw = r.width * LENS;
            const sh = r.height * LENS;
            const cx = x + (r.width - sw) / 2;
            const cy = y + (r.height - sh) / 2;
            g.drawImage(off, cx * sx, cy * sy, sw * sx, sh * sy, x, y, r.width, r.height);
          }
        }
        raf = requestAnimationFrame(draw);
      };
      raf = requestAnimationFrame(draw);
    }).catch((e) => { if (!dead) setInfo((s) => ({ ...s, error: e.message })); });

    return () => {
      dead = true;
      cancelAnimationFrame(raf);
      clearInterval(cycle);
      try { viz?.disconnectAudio?.(getMasterBus()); } catch { /* already gone */ }
      viz = null;
      canvas.remove();
      header.querySelectorAll('.pc-glass').forEach((el) => el.classList.remove('pc-glass'));
      api.current = { next: () => {}, step: () => {} };
    };
  }, [on, headerRef]);

  return { info, api };
}

export default function PushHeader({ tabs, activeTab, onSelect }) {
  const hdRef = useRef(null);
  const headerRef = useRef(null);
  const [width, setWidth] = useState(1200);
  const byId = useMemo(() => new Map(tabs.map((t) => [t.id, t])), [tabs]);
  const activeGroup = TAB_GROUPS.find((g) => g.tabs.includes(activeTab));
  const [openGroup, setOpenGroup] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [live, setLive] = useState(false);
  const [vizOn, setVizOn] = useState(() => { try { return localStorage.getItem(VIZ_KEY) === '1'; } catch { return false; } });
  const idleTimer = useRef(null);

  // The header itself grows to hold the instrument, and goes see-through for visuals.
  useLayoutEffect(() => {
    headerRef.current = hdRef.current?.closest('.header-cosmic') || null;
  }, []);
  useLayoutEffect(() => {
    const h = headerRef.current;
    if (!h) return;
    h.classList.toggle('push-open', expanded);
    h.classList.toggle('viz-on', vizOn);
  }, [expanded, vizOn]);
  useEffect(() => () => headerRef.current?.classList.remove('push-open', 'viz-on'), []);

  useLayoutEffect(() => {
    const el = hdRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const { info: vizInfo, api: vizApi } = usePushVisuals(vizOn, headerRef);

  const wake = useCallback(() => {
    setLive(true);
    clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setLive(false), IDLE_MS);
  }, []);
  useEffect(() => () => clearTimeout(idleTimer.current), []);

  const toggleViz = () => {
    const next = !vizOn;
    setVizOn(next);
    try { localStorage.setItem(VIZ_KEY, next ? '1' : '0'); } catch { /* storage blocked */ }
  };

  const shown = TAB_GROUPS.find((g) => g.id === openGroup);
  const cols = Math.max(8, Math.floor((width + G) / (S + G)));
  const fixed = TAB_GROUPS.length + (shown ? shown.tabs.length : 0) + 3;
  const sweepCount = Math.max(0, cols - fixed);

  return (
    <div ref={hdRef} className={`push-hd${live ? ' is-live' : ''}${vizOn ? ' viz-on' : ''}${expanded ? ' is-open' : ''}`} onPointerMove={live ? undefined : wake}>
      <div className="push-row" role="tablist" aria-label="Tabs" style={{ gridTemplateColumns: `repeat(${cols}, ${S}px)` }}>
        {TAB_GROUPS.map((g) => {
          const on = activeGroup?.id === g.id;
          return (
            <button
              key={g.id}
              type="button"
              role="tab"
              aria-selected={on}
              aria-expanded={openGroup === g.id}
              className={`pc pc-group${on ? ' is-on' : ''}${openGroup === g.id ? ' is-open' : ''}`}
              style={{ '--g': g.hue }}
              onClick={() => { wake(); setOpenGroup((o) => (o === g.id ? null : g.id)); }}
              data-help={`${g.name}: ${g.tabs.map((id) => byId.get(id)?.label).filter(Boolean).join(', ')}.`}
            >
              <span className="pc-name">{g.name}</span>
              {on && <span className="pc-sub">{byId.get(activeTab)?.label}</span>}
            </button>
          );
        })}

        {/* The open group's tabs, as squares in the same row. */}
        {shown && shown.tabs.map((id) => {
          const t = byId.get(id);
          if (!t) return null;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={activeTab === id}
              className={`pc pc-tab${activeTab === id ? ' is-on' : ''}`}
              style={{ '--g': shown.hue }}
              onClick={() => { wake(); onSelect(id); }}
              data-help={t.help}
            >
              <span className="pc-icon" aria-hidden="true"><Glyph name={t.icon} size={20} strokeWidth={1.5} /></span>
              <span className="pc-sub">{t.label}</span>
            </button>
          );
        })}

        {Array.from({ length: sweepCount }, (_, i) => (
          <span key={`s${i}`} className="pc pc-sweep" style={{ '--i': i }} aria-hidden="true" />
        ))}

        <button
          type="button"
          className={`pc pc-ctl${vizOn ? ' is-on' : ''}`}
          aria-pressed={vizOn}
          onClick={() => { wake(); toggleViz(); }}
          data-help={`Plays the Milkdrop visualizer inside the squares, all ${vizInfo.count || '300+'} visuals, reacting to whatever the app is playing.`}
        >
          <span className="pc-name">Visuals</span>
          <span className="pc-sub">{vizOn ? 'On' : 'Off'}</span>
        </button>
        <button
          type="button"
          className="pc pc-ctl"
          disabled={!vizOn}
          onClick={() => { wake(); vizApi.current.next(); }}
          title={vizInfo.name}
          data-help="Another visual. It also changes by itself every half minute."
        >
          <span className="pc-name">Next</span>
          <span className="pc-sub">{vizOn && vizInfo.count ? `${vizInfo.count}` : 'Off'}</span>
        </button>
        <button
          type="button"
          className={`pc pc-ctl${expanded ? ' is-on' : ''}`}
          aria-expanded={expanded}
          onClick={() => { wake(); setExpanded((v) => !v); }}
          data-help="Opens the instrument inside the header: 8 by 8 pads for the 808 kit, your samples and any instrument in key, a step sequencer and eight knobs. A real Ableton Push plugged in plays along."
        >
          <span className="pc-chev" aria-hidden="true">{expanded ? <ChevronUp size={18} strokeWidth={1.75} /> : <ChevronDown size={18} strokeWidth={1.75} />}</span>
          <span className="pc-sub">Pads</span>
        </button>
      </div>

      {expanded && (
        <PadInstrument
          cols={cols}
          onTouch={wake}
          viz={{ on: vizOn, toggle: toggleViz, info: vizInfo, api: vizApi }}
          onClose={() => setExpanded(false)}
        />
      )}
    </div>
  );
}

/* ══ THE INSTRUMENT, INSIDE THE HEADER ══════════════════════════════════════
   One grid of square cells, eight rows tall:
     columns 1-4   the display (2 rows), eight knobs (2 rows), buttons (4 rows)
     columns 5-12  the 8x8 pads
     the rest      empty cells, so the header stays one wall of squares */

const SCALES = {
  Major: [0, 2, 4, 5, 7, 9, 11],
  Minor: [0, 2, 3, 5, 7, 8, 10],
  Dorian: [0, 2, 3, 5, 7, 9, 10],
  Mixolydian: [0, 2, 4, 5, 7, 9, 10],
  'Minor Pent': [0, 3, 5, 7, 10],
  'Major Pent': [0, 2, 4, 7, 9],
  Blues: [0, 3, 5, 6, 7, 10],
  Chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
};
const SCALE_NAMES = Object.keys(SCALES);
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const INSTRUMENTS = INSTRUMENT_GROUPS.flatMap((g) => g.items);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const hexHue = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) / 255; const g = ((n >> 8) & 255) / 255; const b = (n & 255) / 255;
  const max = Math.max(r, g, b); const min = Math.min(r, g, b); const d = max - min;
  if (!d) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return Math.round(h * 60 + 360) % 360;
};
const at = (col, row, w = 1, h = 1) => ({ gridColumn: `${col} / span ${w}`, gridRow: `${row} / span ${h}` });

function PadInstrument({ cols, onTouch, viz, onClose }) {
  const [mode, setMode] = useState('drum');
  const [octave, setOctave] = useState(1);
  const [root, setRoot] = useState(0);
  const [scaleIdx, setScaleIdx] = useState(1);
  const [instIdx, setInstIdx] = useState(() => Math.max(0, INSTRUMENTS.findIndex((i) => i.id === DEFAULT_INSTRUMENT)));
  const [volume, setVolume] = useState(0.9);
  const [tempo, setTempo] = useState(92);
  const [playing, setPlaying] = useState(false);
  const [curStep, setCurStep] = useState(-1);
  const [voice, setVoice] = useState('kick');
  const [pattern, setPattern] = useState(() => Object.fromEntries(KIT.map((k) => [k.id, Array(16).fill(false)])));
  const [held, setHeld] = useState(() => new Set());
  const [samples, setSamples] = useState([]);
  const [display, setDisplay] = useState('Hit a pad.');
  const [pushName, setPushName] = useState(null);

  const outRef = useRef(null);
  const instRef = useRef(null);
  const stopsRef = useRef(new Map());
  const buffers = useRef(new Map());
  const live = useRef({});
  live.current = { mode, octave, root, scaleIdx, pattern, voice, tempo, samples };

  useEffect(() => {
    const g = getAudioContext().createGain();
    g.connect(getMasterBus());
    outRef.current = g;
    return () => { try { g.disconnect(); } catch { /* gone */ } };
  }, []);
  useEffect(() => { if (outRef.current) outRef.current.gain.value = volume; }, [volume]);

  useEffect(() => {
    let dead = false;
    listSamples().then((s) => { if (!dead) setSamples(s.slice(0, 32)); }).catch(() => {});
    return () => { dead = true; };
  }, []);

  const inst = INSTRUMENTS[instIdx];
  useEffect(() => {
    let dead = false;
    instRef.current = null;
    loadInstrument(getAudioContext(), inst.id)
      .then((i) => { if (!dead) instRef.current = i; })
      .catch((e) => { if (!dead) setDisplay(`${inst.name} did not load: ${e.message}`); });
    return () => { dead = true; };
  }, [inst.id, inst.name]);

  /** What a pad is. x 0-7 left to right, y 0-7 top to bottom. */
  const padInfo = useCallback((x, y) => {
    const s = live.current;
    if (s.mode === 'note') {
      const scale = SCALES[SCALE_NAMES[s.scaleIdx]];
      const idx = x + 3 * (7 - y);
      const degree = idx % scale.length;
      const midi = 24 + s.octave * 12 + s.root + scale[degree] + 12 * Math.floor(idx / scale.length);
      return { kind: 'note', midi, root: degree === 0 };
    }
    if (y <= 1) return { kind: 'step', step: y * 8 + x };
    if (y <= 3) return { kind: 'sample', n: 16 + (y - 2) * 8 + x };
    if (x <= 3) {
      const k = (7 - y) * 4 + x;
      return KIT[k] ? { kind: 'drum', voice: KIT[k] } : { kind: 'none' };
    }
    return { kind: 'sample', n: (7 - y) * 4 + (x - 4) };
  }, []);

  const hit = useCallback(async (x, y, velocity = 100) => {
    onTouch?.();
    await resumeAudio();
    const ctx = getAudioContext();
    const out = outRef.current;
    const info = padInfo(x, y);
    const vel = clamp(velocity / 127, 0.15, 1);
    const key = `${x},${y}`;
    setHeld((h) => new Set(h).add(key));

    if (info.kind === 'drum') {
      triggerVoice(ctx, out, info.voice.id, ctx.currentTime, {}, vel);
      setVoice(info.voice.id);
      setDisplay(`${info.voice.name} · ${Math.round(vel * 127)}`);
    } else if (info.kind === 'step') {
      setPattern((p) => {
        const row = [...p[live.current.voice]];
        row[info.step] = !row[info.step];
        return { ...p, [live.current.voice]: row };
      });
      setDisplay(`${KIT.find((k) => k.id === live.current.voice)?.name} · step ${info.step + 1}`);
    } else if (info.kind === 'sample') {
      const smp = live.current.samples[info.n];
      if (!smp) { setDisplay('Empty pad. Add samples in MIDI Studio.'); return; }
      try {
        let buf = buffers.current.get(smp.id);
        if (!buf) { buf = await getSampleBuffer(ctx, smp.id); buffers.current.set(smp.id, buf); }
        triggerSample(ctx, out, buf, ctx.currentTime, { velocity: vel });
        setDisplay(smp.name);
      } catch (e) {
        setDisplay(`${smp.name}: ${e.message}`);
      }
    } else if (info.kind === 'note') {
      if (!instRef.current) { setDisplay(`${inst.name} is loading…`); return; }
      stopsRef.current.get(key)?.();
      stopsRef.current.set(key, playNote(ctx, out, instRef.current, info.midi, { duration: 6, velocity: vel }));
      setDisplay(`${inst.name} · ${midiToNoteName(info.midi)}`);
    }
  }, [padInfo, onTouch, inst.name]);

  const release = useCallback((x, y) => {
    const key = `${x},${y}`;
    setHeld((h) => { const n = new Set(h); n.delete(key); return n; });
    const stop = stopsRef.current.get(key);
    if (stop) { stop(); stopsRef.current.delete(key); }
  }, []);

  // Step sequencer: lookahead scheduling off refs.
  useEffect(() => {
    if (!playing) { setCurStep(-1); return undefined; }
    const ctx = getAudioContext();
    let step = 0;
    let next = ctx.currentTime + 0.05;
    const tick = () => {
      const s = live.current;
      const dur = 60 / s.tempo / 4;
      while (next < ctx.currentTime + 0.12) {
        for (const k of KIT) if (s.pattern[k.id][step]) triggerVoice(ctx, outRef.current, k.id, next, {}, 0.9);
        const shownStep = step;
        setTimeout(() => setCurStep(shownStep), Math.max(0, (next - ctx.currentTime) * 1000));
        next += dur;
        step = (step + 1) % 16;
      }
    };
    const id = setInterval(tick, 25);
    tick();
    return () => clearInterval(id);
  }, [playing]);

  const colorOf = useCallback((x, y) => {
    const info = padInfo(x, y);
    if (held.has(`${x},${y}`)) return { hue: 120, level: 'hot' };
    if (info.kind === 'drum') return { hue: hexHue(info.voice.color), level: voice === info.voice.id ? 'hot' : 'on' };
    if (info.kind === 'step') {
      if (curStep === info.step) return { hue: 0, level: 'white' };
      return pattern[voice][info.step] ? { hue: hexHue(KIT.find((k) => k.id === voice).color), level: 'hot' } : { hue: 0, level: 'dim' };
    }
    if (info.kind === 'sample') return samples[info.n] ? { hue: 265, level: 'on' } : { hue: 0, level: 'off' };
    if (info.kind === 'note') return info.root ? { hue: 190, level: 'hot' } : { hue: 0, level: 'dim' };
    return { hue: 0, level: 'off' };
  }, [padInfo, held, voice, curStep, pattern, samples]);

  const KNOBS = [
    { label: 'Volume', value: `${Math.round(volume * 100)}%`, nudge: (d) => setVolume((v) => clamp(Math.round((v + d * 0.02) * 100) / 100, 0, 1.5)) },
    { label: 'Tempo', value: `${tempo}`, nudge: (d) => setTempo((t) => clamp(t + d, 50, 200)) },
    { label: 'Octave', value: `${octave + 1}`, nudge: (d) => setOctave((o) => clamp(o + Math.sign(d), 0, 6)) },
    { label: 'Key', value: NOTE_NAMES[root], nudge: (d) => setRoot((r) => (r + Math.sign(d) + 12) % 12) },
    { label: 'Scale', value: SCALE_NAMES[scaleIdx], nudge: (d) => setScaleIdx((s) => (s + Math.sign(d) + SCALE_NAMES.length) % SCALE_NAMES.length) },
    { label: 'Sound', value: inst.name, nudge: (d) => setInstIdx((s) => (s + Math.sign(d) + INSTRUMENTS.length) % INSTRUMENTS.length) },
    { label: 'Drum', value: KIT.find((k) => k.id === voice)?.name, nudge: (d) => setVoice((v) => KIT[(KIT.findIndex((k) => k.id === v) + Math.sign(d) + KIT.length) % KIT.length].id) },
    { label: 'Visual', value: viz.on ? 'turn' : 'off', nudge: (d) => viz.api.current.step(Math.sign(d)) },
  ];

  // THE REAL PUSH, if one is plugged in.
  const linkRef = useRef(null);
  const handlers = useRef({});
  handlers.current = {
    pad: (x, y, v) => (v > 0 ? hit(x, y, v) : release(x, y)),
    button: (cc, v) => {
      if (!v) return;
      if (cc === PUSH_CC.play) setPlaying((p) => !p);
      else if (cc === PUSH_CC.octaveUp) setOctave((o) => clamp(o + 1, 0, 6));
      else if (cc === PUSH_CC.octaveDown) setOctave((o) => clamp(o - 1, 0, 6));
      else if (cc === PUSH_CC.note) setMode((m) => (m === 'note' ? 'drum' : 'note'));
      else if (cc === PUSH_CC.session) setMode('drum');
      else if (cc === PUSH_CC.delete) setPattern((p) => ({ ...p, [live.current.voice]: Array(16).fill(false) }));
    },
    encoder: (i, d) => KNOBS[i]?.nudge(d),
  };
  useEffect(() => {
    const link = createPushLink({
      onPad: (x, y, v) => handlers.current.pad(x, y, v),
      onButton: (cc, v) => handlers.current.button(cc, v),
      onEncoder: (i, d) => handlers.current.encoder(i, d),
      onStatus: setPushName,
    });
    linkRef.current = link;
    return () => link.close();
  }, []);
  useEffect(() => {
    const link = linkRef.current;
    if (!link || !pushName) return;
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const c = colorOf(x, y);
        link.pad(x, y, c.level === 'off' ? 0 : c.level === 'white' ? 122 : c.level === 'dim' ? 124 : hueToPushColor(c.hue));
      }
    }
    link.button(PUSH_CC.play, playing ? 127 : 20);
    link.button(PUSH_CC.note, mode === 'note' ? 127 : 20);
  });

  const dragKnob = (k) => (e) => {
    e.preventDefault();
    let lastY = e.clientY;
    let acc = 0;
    const move = (ev) => {
      acc += lastY - ev.clientY;
      lastY = ev.clientY;
      while (Math.abs(acc) >= 6) { k.nudge(Math.sign(acc)); acc -= Math.sign(acc) * 6; }
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const BUTTONS = [
    { label: playing ? 'Stop' : 'Play', on: playing, act: () => setPlaying((p) => !p) },
    { label: 'Drum', on: mode === 'drum', act: () => setMode('drum') },
    { label: 'Note', on: mode === 'note', act: () => setMode('note') },
    { label: 'Oct +', act: () => setOctave((o) => clamp(o + 1, 0, 6)) },
    { label: 'Oct −', act: () => setOctave((o) => clamp(o - 1, 0, 6)) },
    { label: 'Clear', act: () => setPattern((p) => ({ ...p, [voice]: Array(16).fill(false) })) },
    { label: 'Clear all', act: () => setPattern(Object.fromEntries(KIT.map((k) => [k.id, Array(16).fill(false)]))) },
    { label: `Vis ${viz.on ? 'on' : 'off'}`, on: viz.on, act: viz.toggle },
    { label: 'Prev vis', act: () => viz.api.current.step(-1), off: !viz.on },
    { label: 'Next vis', act: () => viz.api.current.step(1), off: !viz.on },
    { label: 'Shuffle', act: () => viz.api.current.next(), off: !viz.on },
    { label: 'Hide', act: onClose },
  ];

  const cells = [];
  cells.push(
    <div key="screen" className="pc pc-screen" style={at(1, 1, 4, 2)}>
      <div className="pc-screen-top">
        <span>{mode === 'note' ? `NOTE ${NOTE_NAMES[root]} ${SCALE_NAMES[scaleIdx]}` : `DRUM ${tempo} BPM${playing ? ' ▶' : ''}`}</span>
        <span className={pushName ? 'hw on' : 'hw'}>{pushName ? `● ${pushName}` : '○ no Push'}</span>
      </div>
      <div className="pc-screen-main">{display}</div>
      <div className="pc-screen-sub">{viz.on ? viz.info.error || viz.info.name : mode === 'note' ? inst.name : 'bottom-left: kit · right: samples · top rows: steps'}</div>
    </div>,
  );
  KNOBS.forEach((k, i) => {
    cells.push(
      <div
        key={`k${k.label}`}
        className="pc pc-knob"
        style={at(1 + (i % 4), 3 + Math.floor(i / 4))}
        role="slider"
        tabIndex={0}
        aria-label={k.label}
        aria-valuetext={k.value}
        onPointerDown={dragKnob(k)}
        onWheel={(e) => k.nudge(e.deltaY < 0 ? 1 : -1)}
        onKeyDown={(e) => { if (e.key === 'ArrowUp' || e.key === 'ArrowRight') k.nudge(1); if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') k.nudge(-1); }}
        title={`${k.label}: ${k.value}. Drag up or down, or scroll.`}
      >
        <span className="pc-name">{k.label}</span>
        <span className="pc-sub">{k.value}</span>
      </div>,
    );
  });
  BUTTONS.forEach((b, i) => {
    cells.push(
      <button
        key={`b${i}`}
        type="button"
        className={`pc pc-btn${b.on ? ' is-on' : ''}`}
        style={at(1 + (i % 4), 5 + Math.floor(i / 4))}
        disabled={b.off}
        onClick={() => { onTouch?.(); b.act(); }}
      >
        <span className="pc-name">{b.label}</span>
      </button>,
    );
  });
  for (let i = BUTTONS.length; i < 16; i++) {
    cells.push(<span key={`be${i}`} className="pc pc-empty" style={at(1 + (i % 4), 5 + Math.floor(i / 4))} aria-hidden="true" />);
  }
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const c = colorOf(x, y);
      cells.push(
        <button
          key={`p${x}-${y}`}
          type="button"
          className={`pc pc-pad lv-${c.level}`}
          style={{ ...at(5 + x, 1 + y), '--h': c.hue }}
          onPointerDown={(e) => { e.currentTarget.setPointerCapture?.(e.pointerId); hit(x, y, 100); }}
          onPointerUp={() => release(x, y)}
          onPointerCancel={() => release(x, y)}
          aria-label={`Pad ${x + 1}, ${8 - y}`}
        />,
      );
    }
  }
  for (let c = 13; c <= cols; c++) {
    for (let r = 1; r <= 8; r++) {
      cells.push(<span key={`f${c}-${r}`} className="pc pc-empty" style={at(c, r)} aria-hidden="true" />);
    }
  }

  return (
    <div
      className="push-inst"
      style={{ gridTemplateColumns: `repeat(${cols}, ${S}px)`, gridTemplateRows: `repeat(8, ${S}px)` }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {cells}
    </div>
  );
}
