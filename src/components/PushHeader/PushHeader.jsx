import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import './PushHeader.css';
import { getAudioContext, getMasterBus, resumeAudio } from '../../services/audioEngine.js';
import { KIT, triggerVoice, triggerSample } from '../../services/drumEngine.js';
import { INSTRUMENT_GROUPS, DEFAULT_INSTRUMENT, loadInstrument, playNote, warmNote, midiToNoteName } from '../../services/soundfontEngine.js';
import { listSamples, getSampleBuffer } from '../../services/sampleLibrary.js';
import { createPushLink, hueToPushColor, PUSH_CC } from '../../services/pushMidi.js';
import { loadButterchurn } from '../../services/butterchurnLoader.js';
import { getMidiOut, setMidiOut, subscribeMidiOut, clockStart, clockStop, clockTempo } from '../../services/midiOut.js';
import { vstAvailable, cachedInstruments, listInstruments, loadInstrument as loadVst, vstNote, showEditor as showVstEditor, setParamByName, panic as vstPanic } from '../../services/vstEngine.js';
import PerformanceDeck from './PerformanceDeck.jsx';
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
  { id: 'pen', name: 'The Pen', hue: 345, tabs: ['songwriter', 'onemanband', 'analyzer', 'songforge', 'quantum'] },
  { id: 'studio', name: 'The Studio', hue: 215, tabs: ['booth', 'midistudio', 'loopstation', 'stemmer', 'screw', 'mastering'] },
  { id: 'words', name: 'Word Kit', hue: 142, tabs: ['rhyme', 'thesaurus', 'dictionary', 'scratchpad', 'collab'] },
  { id: 'control', name: 'Control Room', hue: 38, tabs: ['toolshub', 'settings'] },
];

const S = 54;          // one cell
const G = 3;           // the gap: 3px black joints between glass keys, like the swatch mock
const LENS = 0.8;      // each glass block shows 80% of what's behind it, magnified, like thick glass
const IDLE_MS = 5000;
const VIZ_KEY = 'lyricist.push.visuals';
const VIZ_CYCLE_MS = 28000;
// The instrument's pad square gets the visuals, and (Chris, 2026-09-27: "make
// those pad keys glass keys ... and the visuals will show up behind them") so do
// the glass pads along the header row. The anodized keys never do.
const CELLS = '.pc-pad';
const ROW_PADS = '.pc-sweep';

/**
 * VISUALS, ONLY INSIDE THE SQUARES.
 *
 * One Butterchurn instance renders offscreen at the header's size. Each frame is
 * copied into a canvas under the header one cell at a time, only where a cell
 * is, so the gaps and everything round the squares stay black.
 */
function usePushVisuals(on, headerRef) {
  const [info, setInfo] = useState({ name: '', count: 0, idx: 0, error: '' });
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
        setInfo({ name: names[idx], count: names.length, idx, error: '' });
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
        const rowPads = header.querySelectorAll(ROW_PADS);
        if (W && H && !pads.length && !rowPads.length) {
          // No glass showing: nothing to show the picture in, so don't render it.
          if (canvas.width) { canvas.width = 0; canvas.height = 0; }
          header.querySelectorAll('.pc-glass').forEach((el) => el.classList.remove('pc-glass'));
        } else if (W && H) {
          // The 9x9 square: the 8x8 pads plus the row of cells above them and the column to their right.
          let pl = Infinity; let pt = Infinity; let pr = -Infinity; let pb = -Infinity;
          for (const p of pads) {
            const q = p.getBoundingClientRect();
            pl = Math.min(pl, q.left); pt = Math.min(pt, q.top); pr = Math.max(pr, q.right); pb = Math.max(pb, q.bottom);
          }
          if (pads.length) { pt -= S + G; pr += S + G; }
          const rowSet = new Set(rowPads);
          const glass = [];
          for (const el of header.querySelectorAll('.pc')) {
            const q = el.getBoundingClientRect();
            const mx = (q.left + q.right) / 2;
            const my = (q.top + q.bottom) / 2;
            const inside = rowSet.has(el) || (mx > pl && mx < pr && my > pt && my < pb);
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
          onClick={() => { wake(); if (vizOn) vizApi.current.next(); else toggleViz(); }}
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
// A built-in sound or a VST3 ({ vst: handle } from vstEngine), same call either way.
const play = (ctx, out, instr, midi, opts) => (instr?.vst ? vstNote(ctx, instr.vst, midi, opts) : playNote(ctx, out, instr, midi, opts));
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

/* ── Chords ──
   Chris, 2026-09-27: "When I change the note from an A to a D ... it needs to
   sound like that. Also, chords." Every pad that plays notes goes through these.
   Chords are built from the key's own scale, so in C major the IV is F and the
   ii is Dm without anyone having to know that. Pentatonic, blues and chromatic
   borrow their chords from the major or minor scale they come from. */
const PAD_VEL = 100 / 127;   // the velocity a mouse click hits with; warm renders must match it
const PAD_HOLD = 3;          // seconds a held pad sustains before the instrument's own release
const CHORD_PARENT = { 'Minor Pent': 'Minor', 'Major Pent': 'Major', Blues: 'Minor', Chromatic: 'Major' };
const NOTE_CHORDS = [
  { name: 'Off', stack: [0] },
  { name: 'Triad', stack: [0, 2, 4] },
  { name: '7th', stack: [0, 2, 4, 6] },
  { name: '9th', stack: [0, 2, 4, 6, 8] },
];
// Chord mode: across = the scale's chords I to I an octave up; up = the kind of chord.
const CHORD_ROWS = [
  { tag: '', stack: [0, 2, 4] },
  { tag: '7', stack: [0, 2, 4, 6] },
  { tag: '9', stack: [0, 2, 4, 6, 8] },
  { tag: 'inv1', stack: [2, 4, 7] },
  { tag: 'inv2', stack: [4, 7, 9] },
  { tag: 'sus2', semis: [0, 2, 7] },
  { tag: 'sus4', semis: [0, 5, 7] },
  { tag: '5', semis: [0, 7, 12] },
];
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'I'];

const scaleNote = (scale, base, idx) => {
  const n = scale.length;
  return base + scale[((idx % n) + n) % n] + 12 * Math.floor(idx / n);
};
/** Stack scale degrees on top of `midi` (a note of the key), e.g. [0,2,4] = its triad. */
function stackOn(scaleName, base, midi, stack) {
  const parent = SCALES[CHORD_PARENT[scaleName] || scaleName];
  const rel = midi - base;
  const d = parent.indexOf(((rel % 12) + 12) % 12);
  if (d < 0) return stack.map((_, i) => midi + [0, 4, 7, 10, 14][i]);   // off-key note: a plain major chord
  const deg = d + parent.length * Math.floor(rel / 12);
  return stack.map((s) => scaleNote(parent, base, deg + s));
}
/** "Dm7", "Bdim", "Fmaj7" from a root-position chord. */
function chordName(m) {
  const nm = NOTE_NAMES[((m[0] % 12) + 12) % 12];
  const third = m[1] - m[0];
  const fifth = m[2] - m[0];
  const q = third === 3 ? (fifth === 6 ? 'dim' : 'm') : (fifth === 8 ? 'aug' : '');
  if (m.length < 4) return nm + q;
  const sev = m[3] - m[0];
  let name;
  if (q === 'dim') name = nm + (sev === 9 ? 'dim7' : 'm7♭5');
  else if (q === 'm') name = nm + (sev === 11 ? 'm(maj7)' : 'm7');
  else name = nm + q + (sev === 11 ? 'maj7' : '7');
  return m.length > 4 ? name.replace(/7/, '9') : name;
}
/** Chord mode's pad: degree 0-7 across, CHORD_ROWS[row] up. */
function chordPad(scaleName, base, degree, row) {
  const parent = SCALES[CHORD_PARENT[scaleName] || scaleName];
  const r = CHORD_ROWS[row];
  const rootMidi = scaleNote(parent, base, degree);
  if (r.semis) {
    const nm = NOTE_NAMES[rootMidi % 12];
    return { midis: r.semis.map((s) => rootMidi + s), label: `${nm}${r.tag}` };
  }
  const midis = stackOn(scaleName, base, rootMidi, r.stack);
  if (r.tag.startsWith('inv')) {
    return { midis, label: `${chordName(stackOn(scaleName, base, rootMidi, [0, 2, 4]))}/${NOTE_NAMES[midis[0] % 12]}` };
  }
  return { midis, label: chordName(midis) };
}

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
  const [chordType, setChordType] = useState(0);        // Note mode: each pad plays a note or a chord
  const [instReady, setInstReady] = useState(null);     // id of the loaded sound
  const [daw, setDaw] = useState(getMidiOut);
  useEffect(() => subscribeMidiOut(setDaw), []);

  const outRef = useRef(null);
  const instRef = useRef(null);
  const stopsRef = useRef(new Map());
  const buffers = useRef(new Map());
  const live = useRef({});
  live.current = { mode, octave, root, scaleIdx, pattern, voice, tempo, samples, chordType };

  // Everything the pads and clips play goes through: high-pass -> low-pass -> master,
  // with a dotted-eighth echo on the side (the Echo fader). The performance deck drives it.
  const fxRef = useRef(null);
  useEffect(() => {
    const ctx = getAudioContext();
    const g = ctx.createGain();
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 20;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 20000; lp.Q.value = 0.7;
    const dly = ctx.createDelay(2); dly.delayTime.value = (60 / 92) * 0.75;
    const fb = ctx.createGain(); fb.gain.value = 0.42;
    const wet = ctx.createGain(); wet.gain.value = 0;
    g.connect(hp); hp.connect(lp); lp.connect(getMasterBus());
    lp.connect(dly); dly.connect(fb); fb.connect(dly); dly.connect(wet); wet.connect(getMasterBus());
    outRef.current = g;
    fxRef.current = { hp, lp, dly, wet };
    return () => { [g, hp, lp, dly, fb, wet].forEach((n) => { try { n.disconnect(); } catch { /* gone */ } }); };
  }, []);

  useEffect(() => { if (outRef.current) outRef.current.gain.value = volume; }, [volume]);

  // ── Performance deck: filter, echo, high-pass, stutter ──
  const [echo, setEchoV] = useState(0);
  const [hpV, setHpV] = useState(0);
  const lastHit = useRef(null);          // [x, y] of the last pad played: what the stutter repeats
  const stut = useRef({ on: false, x: 0.5, y: 0, t0: 0, timer: 0 });
  const vstLast = useRef(0);
  const ramp = (param, v, tc = 0.02) => { try { param.setTargetAtTime(v, getAudioContext().currentTime, tc); } catch { /* ctx closed */ } };
  const setEcho = (v) => { setEchoV(v); const f = fxRef.current; if (f) ramp(f.wet.gain, v * 0.9); };
  const setHp = (v) => { setHpV(v); const f = fxRef.current; if (f) ramp(f.hp.frequency, 20 * Math.pow(400, v)); };
  useEffect(() => { const f = fxRef.current; if (f) ramp(f.dly.delayTime, (60 / tempo) * 0.75, 0.05); }, [tempo]);
  const filter = (x, y) => {
    const f = fxRef.current;
    if (f) { ramp(f.lp.frequency, x >= 0.995 ? 20000 : 80 * Math.pow(18000 / 80, x)); ramp(f.lp.Q, 0.7 + y * 14); }
    // a VST plays outside Web Audio: drive the synth's own cutoff and resonance instead
    const h = instRef.current?.vst;
    if (h && performance.now() - vstLast.current > 30) {
      vstLast.current = performance.now();
      setParamByName(h, /cut\s*off|filter.*(freq|cut)|^freq/i, x);
      setParamByName(h, /reso|^q$/i, y);
    }
  };
  const stutter = (x, y, first, end) => {
    const st = stut.current;
    if (end) { st.on = false; clearTimeout(st.timer); return; }
    st.x = x; st.y = y;
    if (!first || st.on || !lastHit.current) { if (first && !lastHit.current) setDisplay('Hit a pad first, then stutter it.'); return; }
    st.on = true; st.t0 = performance.now();
    const fire = () => {
      if (!st.on || !lastHit.current) return;
      // Slide up = faster (2 to 24 hits a second); it also speeds up the longer you hold.
      const held = Math.min(1, (performance.now() - st.t0) / 1800);
      const hz = (2 + 22 * Math.pow(st.y, 1.5)) * (0.35 + 0.65 * held);
      const gap = 1000 / hz;
      const [px, py] = lastHit.current;
      hitRef.current(px, py, 100);
      setTimeout(() => releaseRef.current(px, py), gap * (0.15 + 0.7 * st.x));
      st.timer = setTimeout(fire, gap);
    };
    fire();
  };
  const hitRef = useRef(() => {});
  const releaseRef = useRef(() => {});
  useEffect(() => () => { clearTimeout(stut.current.timer); stut.current.on = false; vstPanic(); }, []);

  useEffect(() => {
    let dead = false;
    listSamples().then((s) => { if (!dead) setSamples(s.slice(0, 32)); }).catch(() => {});
    return () => { dead = true; };
  }, []);

  // Creator build: your VST3 instruments come after the built-in sounds on the Sound knob.
  const [vsts, setVsts] = useState(() => (vstAvailable() ? cachedInstruments() : []));
  useEffect(() => {
    if (!vstAvailable()) return undefined;
    let dead = false;
    listInstruments().then((l) => { if (!dead) setVsts(l); }).catch(() => {});
    return () => { dead = true; };
  }, []);
  const SOUNDS = useMemo(() => [...INSTRUMENTS, ...vsts.map((v) => ({ id: `vst3:${v.name}`, name: v.name, vst: v }))], [vsts]);

  const inst = SOUNDS[instIdx] || SOUNDS[0];
  useEffect(() => {
    let dead = false;
    instRef.current = null;
    setInstReady(null);
    if (inst.vst) {
      setDisplay(`${inst.name} · VST3`);
      // Wait for the knob to settle, so wheeling past a synth doesn't load it.
      const t = setTimeout(() => {
        setDisplay(`Loading ${inst.name}…`);
        loadVst(inst.vst)
          .then((h) => { if (!dead) { instRef.current = { vst: h }; setInstReady(inst.id); setDisplay(`${inst.name} · VST3 on ${h.driver}`); } })
          .catch((e) => { if (!dead) setDisplay(`${inst.name}: ${e.message}`); });
      }, 400);
      return () => { dead = true; clearTimeout(t); };
    }
    loadInstrument(getAudioContext(), inst.id)
      .then((i) => { if (!dead) { instRef.current = i; setInstReady(inst.id); } })
      .catch((e) => { if (!dead) setDisplay(`${inst.name} did not load: ${e.message}`); });
    return () => { dead = true; };
  }, [inst.id, inst.name, inst.vst]);

  /** What a pad is. x 0-7 left to right, y 0-7 top to bottom. */
  const padInfo = useCallback((x, y) => {
    const s = live.current;
    const scaleName = SCALE_NAMES[s.scaleIdx];
    const scale = SCALES[scaleName];
    const low = 24 + s.octave * 12 + s.root;    // bass and single notes
    const mid = low + 12;                        // chords sit an octave up
    // A chord pad: degree across the key, `row` from CHORD_ROWS.
    const chord = (degree, row) => {
      const c = chordPad(scaleName, mid, degree, row);
      return { kind: 'notes', ...c, label: `${ROMAN[degree]} · ${c.label}`, tonic: degree % 7 === 0, accent: degree === 3 || degree === 4 };
    };

    if (s.mode === 'note') {
      // Rows go up a fourth (three scale steps); the root is always bottom-left.
      const idx = x + 3 * (7 - y);
      const midi = scaleNote(scale, low, idx);
      const ct = NOTE_CHORDS[s.chordType];
      const midis = ct.stack.length > 1 ? stackOn(scaleName, low, midi, ct.stack) : [midi];
      return {
        kind: 'notes', midis, tonic: idx % scale.length === 0,
        label: midis.length > 1 ? chordName(midis) : midiToNoteName(midi),
      };
    }
    if (s.mode === 'chord') return chord(x, 7 - y);

    // Drum mode. Your own samples win their slot; an empty slot is never dead:
    // the middle rows are the key's chords and the bottom-right is a bass line.
    if (y <= 1) return { kind: 'step', step: y * 8 + x };
    if (y <= 3) {
      const n = 16 + (y - 2) * 8 + x;
      if (s.samples[n]) return { kind: 'sample', n };
      return chord(x, y === 3 ? 0 : 1);
    }
    if (x <= 3) {
      const k = (7 - y) * 4 + x;
      if (KIT[k]) return { kind: 'drum', voice: KIT[k] };
      // The kit has 14 voices for 16 pads; the last two are layered hits.
      const layers = [['kick', 'clap'], ['snare', 'hatO']][k - KIT.length] || ['kick', 'snare'];
      return { kind: 'layer', ids: layers, label: layers.map((id) => KIT.find((v) => v.id === id)?.name).join(' + ') };
    }
    const n = (7 - y) * 4 + (x - 4);
    if (s.samples[n]) return { kind: 'sample', n };
    const midi = scaleNote(scale, low, n);
    return { kind: 'notes', midis: [midi], label: `Bass · ${midiToNoteName(midi)}`, tonic: n % scale.length === 0 };
  }, []);

  const hit = useCallback(async (x, y, velocity = 100) => {
    onTouch?.();
    await resumeAudio();
    const ctx = getAudioContext();
    const out = outRef.current;
    const info = padInfo(x, y);
    const vel = clamp(velocity / 127, 0.15, 1);
    const key = `${x},${y}`;
    lastHit.current = [x, y];
    setHeld((h) => new Set(h).add(key));

    if (info.kind === 'drum') {
      triggerVoice(ctx, out, info.voice.id, ctx.currentTime, {}, vel);
      setVoice(info.voice.id);
      setDisplay(`${info.voice.name} · ${Math.round(vel * 127)}`);
    } else if (info.kind === 'layer') {
      info.ids.forEach((id) => triggerVoice(ctx, out, id, ctx.currentTime, {}, vel));
      setDisplay(info.label);
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
    } else if (info.kind === 'notes') {
      const instr = instRef.current;
      if (!instr) { setDisplay(`${inst.name} is loading…`); return; }
      stopsRef.current.get(key)?.();
      const stops = info.midis.map((m) => play(ctx, out, instr, m, { duration: PAD_HOLD, velocity: vel, minHold: 0.3 }));
      stopsRef.current.set(key, () => stops.forEach((stop) => stop()));
      setDisplay(info.label);
    }
  }, [padInfo, onTouch, inst.name]);

  const release = useCallback((x, y) => {
    const key = `${x},${y}`;
    setHeld((h) => { const n = new Set(h); n.delete(key); return n; });
    const stop = stopsRef.current.get(key);
    if (stop) { stop(); stopsRef.current.delete(key); }
  }, []);

  hitRef.current = hit;
  releaseRef.current = release;

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
    clockStart(live.current.tempo);   // DAW mode: the DAW follows our tempo
    return () => { clearInterval(id); clockStop(); };
  }, [playing]);
  useEffect(() => { clockTempo(tempo); }, [tempo]);

  const colorOf = useCallback((x, y) => {
    const info = padInfo(x, y);
    if (held.has(`${x},${y}`)) return { hue: 120, level: 'hot' };
    if (info.kind === 'drum') return { hue: hexHue(info.voice.color), level: voice === info.voice.id ? 'hot' : 'on' };
    if (info.kind === 'step') {
      if (curStep === info.step) return { hue: 0, level: 'white' };
      return pattern[voice][info.step] ? { hue: hexHue(KIT.find((k) => k.id === voice).color), level: 'hot' } : { hue: 0, level: 'dim' };
    }
    if (info.kind === 'sample') return samples[info.n] ? { hue: 215, level: 'on' } : { hue: 0, level: 'off' };
    if (info.kind === 'layer') return { hue: 20, level: 'on' };
    if (info.kind === 'notes') {
      if (info.tonic) return { hue: 36, level: 'hot' };
      return info.accent ? { hue: 0, level: 'on' } : { hue: 0, level: 'dim' };
    }
    return { hue: 0, level: 'off' };
  // mode, root, scale, octave and chordType reach padInfo through live.current;
  // they're listed so the board repaints when they change.
  }, [padInfo, held, voice, curStep, pattern, samples, mode, root, scaleIdx, octave, chordType]);

  // Every change you can hear gets played back to you, and the whole board is
  // rendered ahead so the first hit of every pad is instant. The first time a
  // note plays it has to be synthesized; before this, a tap on a fresh key
  // usually came back silent or late.
  const warmGen = useRef(0);
  const heardSig = useRef(null);
  useEffect(() => {
    const instr = instRef.current;
    if (!instReady || !instr) return undefined;
    const gen = ++warmGen.current;
    const sig = `${instReady}|${root}|${scaleIdx}|${octave}|${chordType}`;
    const preview = heardSig.current !== null && heardSig.current !== sig;
    heardSig.current = sig;
    const t = setTimeout(async () => {
      const ctx = getAudioContext();
      if (preview) {
        await resumeAudio().catch(() => {});
        if (warmGen.current !== gen) return;
        // The key's I chord (or its root note, in Note mode with Chords off).
        const s = live.current;
        const low = 24 + s.octave * 12 + s.root;
        const midis = s.mode === 'note' && s.chordType === 0
          ? [low]
          : stackOn(SCALE_NAMES[s.scaleIdx], low + 12, low + 12, s.mode === 'note' ? NOTE_CHORDS[s.chordType].stack : [0, 2, 4]);
        midis.forEach((m) => play(ctx, outRef.current, instr, m, { duration: 0.6, velocity: PAD_VEL * 0.8 }));
        setDisplay(`${NOTE_NAMES[s.root]} ${SCALE_NAMES[s.scaleIdx]} · ${midis.length > 1 ? chordName(midis) : midiToNoteName(midis[0])}`);
      }
      if (instr.vst) return;   // a VST3 plays live; nothing to render ahead
      const want = new Set();
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          const info = padInfo(x, y);
          if (info.kind === 'notes') info.midis.forEach((m) => want.add(m));
        }
      }
      // One note at a time, so a pad you hit never waits behind the whole board.
      for (const m of want) {
        if (warmGen.current !== gen) return;
        await warmNote(ctx, instr, m, PAD_VEL, PAD_HOLD).catch(() => {});
      }
    }, 160);
    return () => { clearTimeout(t); warmGen.current++; };
  }, [instReady, mode, root, scaleIdx, octave, chordType, samples, padInfo]);

  const KNOBS = [
    { label: 'Volume', value: `${Math.round(volume * 100)}%`, nudge: (d) => setVolume((v) => clamp(Math.round((v + d * 0.02) * 100) / 100, 0, 1.5)) },
    { label: 'Tempo', value: `${tempo}`, nudge: (d) => setTempo((t) => clamp(t + d, 50, 200)) },
    { label: 'Octave', value: `${octave + 1}`, nudge: (d) => setOctave((o) => clamp(o + Math.sign(d), 0, 6)) },
    { label: 'Key', value: NOTE_NAMES[root], nudge: (d) => setRoot((r) => (r + Math.sign(d) + 12) % 12) },
    { label: 'Scale', value: SCALE_NAMES[scaleIdx], nudge: (d) => setScaleIdx((s) => (s + Math.sign(d) + SCALE_NAMES.length) % SCALE_NAMES.length) },
    { label: 'Sound', value: inst.vst ? `${inst.name} ·VST3` : inst.name, nudge: (d) => setInstIdx((s) => (s + Math.sign(d) + SOUNDS.length) % SOUNDS.length) },
    { label: 'Drum', value: KIT.find((k) => k.id === voice)?.name, nudge: (d) => setVoice((v) => KIT[(KIT.findIndex((k) => k.id === v) + Math.sign(d) + KIT.length) % KIT.length].id) },
    { label: 'Visual', value: viz.on ? (viz.info.count ? `${viz.info.idx + 1}/${viz.info.count}` : 'loading') : 'off', nudge: (d) => (viz.on ? viz.api.current.step(Math.sign(d)) : viz.toggle()) },
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
      else if (cc === PUSH_CC.note) setMode((m) => (m === 'drum' ? 'note' : m === 'note' ? 'chord' : 'drum'));
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
    link.button(PUSH_CC.note, mode !== 'drum' ? 127 : 20);
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

  const toggleDaw = () => {
    const toDaw = daw.mode !== 'daw';
    setMidiOut({ mode: toDaw ? 'daw' : 'builtin' });
    const port = daw.outputs.find((o) => o.id === daw.outputId);
    setDisplay(!toDaw ? 'Built-in: Lyricist Pro plays the sound.'
      : port ? `DAW: notes go to ${port.name}.` : 'DAW: pick a MIDI port in Settings → Play Through.');
  };

  const BUTTONS = [
    { label: playing ? 'Stop' : 'Play', on: playing, act: () => setPlaying((p) => !p) },
    { label: 'Drum', on: mode === 'drum', act: () => setMode('drum') },
    { label: 'Note', on: mode === 'note', act: () => setMode('note') },
    { label: 'Chord', on: mode === 'chord', act: () => setMode('chord') },
    { label: 'Oct +', act: () => setOctave((o) => clamp(o + 1, 0, 6)) },
    { label: 'Oct −', act: () => setOctave((o) => clamp(o - 1, 0, 6)) },
    // Note mode: every pad plays the chord built on its note, in key.
    { label: `Chords ${NOTE_CHORDS[chordType].name}`, on: chordType > 0, act: () => { setChordType((c) => (c + 1) % NOTE_CHORDS.length); setMode('note'); } },
    { label: 'Clear', act: () => setPattern((p) => ({ ...p, [voice]: Array(16).fill(false) })) },
    { label: 'Clear all', act: () => setPattern(Object.fromEntries(KIT.map((k) => [k.id, Array(16).fill(false)]))) },
    { label: `Vis ${viz.on ? 'on' : 'off'}`, on: viz.on, act: viz.toggle },
    { label: 'Prev vis', act: () => (viz.on ? viz.api.current.step(-1) : viz.toggle()) },
    { label: 'Next vis', act: () => (viz.on ? viz.api.current.step(1) : viz.toggle()) },
    { label: 'Shuffle', act: () => (viz.on ? viz.api.current.next() : viz.toggle()) },
    { label: 'Hide', act: onClose },
    // Play Through (Settings): the notes go to Ableton or any DAW as MIDI instead.
    { label: daw.mode === 'daw' ? 'DAW' : 'Built-in', on: daw.mode === 'daw', act: toggleDaw },
    // A VST3 on the Sound knob: open the synth's own window to tweak it.
    ...(inst.vst ? [{ label: 'Synth UI', off: !instReady, act: () => { const h = instRef.current?.vst; if (h) showVstEditor(h).catch((e) => setDisplay(`${inst.name}: ${e.message}`)); } }] : []),
  ];

  const cells = [];
  cells.push(
    <div key="screen" className="pc pc-screen" style={at(1, 1, 4, 2)}>
      <div className="pc-screen-top">
        <span>{mode === 'drum' ? `DRUM ${tempo} BPM${playing ? ' ▶' : ''}` : `${mode.toUpperCase()} ${NOTE_NAMES[root]} ${SCALE_NAMES[scaleIdx]}`}</span>
        <span className={pushName ? 'hw on' : 'hw'}>{pushName ? `● ${pushName}` : '○ no Push'}</span>
      </div>
      <div className="pc-screen-main">{display}</div>
      <div className="pc-screen-sub">{viz.on ? viz.info.error || viz.info.name
        : mode === 'note' ? `${inst.name}${chordType ? ` · ${NOTE_CHORDS[chordType].name} chords` : ''}`
        : mode === 'chord' ? `${inst.name} · across: I to I · up: triad, 7, 9, inversions, sus2, sus4, power`
        : `${NOTE_NAMES[root]} ${SCALE_NAMES[scaleIdx]} · top: steps · middle: chords · bottom: kit and bass`}</div>
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
        // Shift fine-tunes, Ctrl jumps. Stepped knobs (key, scale, sound) round to one click either way.
        onWheel={(e) => k.nudge((e.deltaY < 0 ? 1 : -1) * (e.shiftKey ? 0.5 : (e.ctrlKey || e.metaKey) ? 5 : 1))}
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
    <>
      <div
        className="push-inst"
        style={{ gridTemplateColumns: `repeat(${cols}, ${S}px)`, gridTemplateRows: `repeat(8, ${S}px)` }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {cells}
      </div>
      <PerformanceDeck
        out={() => outRef.current}
        tempo={tempo}
        filter={filter}
        stutter={stutter}
        echo={echo}
        setEcho={setEcho}
        hp={hpV}
        setHp={setHp}
        setDisplay={setDisplay}
      />
    </>
  );
}
