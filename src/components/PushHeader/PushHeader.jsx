import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './PushHeader.css';
import { getAudioContext, getMasterBus, resumeAudio } from '../../services/audioEngine.js';
import { KIT, triggerVoice, triggerSample } from '../../services/drumEngine.js';
import { INSTRUMENT_GROUPS, DEFAULT_INSTRUMENT, loadInstrument, playNote, midiToNoteName } from '../../services/soundfontEngine.js';
import { listSamples, getSampleBuffer } from '../../services/sampleLibrary.js';
import { createPushLink, hueToPushColor, PUSH_CC } from '../../services/pushMidi.js';
import { loadButterchurn } from '../../services/butterchurnLoader.js';

const VIZ_KEY = 'lyricist.push.visuals';
const VIZ_CYCLE_MS = 28000;

/**
 * THE VISUALS UNDER THE PADS.
 *
 * One Butterchurn instance draws offscreen at the size of the header plus the
 * open Push, and each frame is painted into the canvases that sit under the
 * pads: the top slice under the header, the rest under the Push. So it reads as
 * one picture running behind everything, from one WebGL renderer, not two.
 */
function usePushVisuals(on, targets) {
  const [info, setInfo] = useState({ name: '', count: 0, error: '' });
  const api = useRef({ next: () => {}, prev: () => {} });

  useEffect(() => {
    if (!on) return undefined;
    let dead = false;
    let raf = 0;
    let cycle = 0;
    let viz = null;
    const off = document.createElement('canvas');
    off.width = 1200; off.height = 96;

    loadButterchurn().then(({ butterchurn, map, names }) => {
      if (dead) return;
      const ctx = getAudioContext();
      viz = butterchurn.createVisualizer(ctx, off, { width: off.width, height: off.height, pixelRatio: 1 });
      viz.connectAudio(getMasterBus());
      let idx = Math.floor(Math.random() * names.length);
      const load = (i, blend = 2) => {
        idx = (i + names.length) % names.length;
        viz.loadPreset(map[names[idx]], blend);
        setInfo({ name: names[idx], count: names.length, error: '' });
      };
      api.current = { next: () => load(Math.floor(Math.random() * names.length), 1.6), prev: () => load(idx - 1, 1.2), step: (d) => load(idx + d, 1.2) };
      load(idx, 0);
      cycle = setInterval(() => load(Math.floor(Math.random() * names.length), 2.4), VIZ_CYCLE_MS);

      const draw = () => {
        const header = targets.current.header;
        const panel = targets.current.panel;
        const hw = header?.clientWidth || 0;
        const hh = header?.clientHeight || 0;
        const ph = panel?.clientHeight || 0;
        const w = Math.max(320, Math.round(hw));
        const h = Math.max(60, Math.round(hh + ph));
        if (off.width !== w || off.height !== h) {
          off.width = w; off.height = h;
          viz.setRendererSize(w, h);
        }
        viz.render();
        const paint = (el, top, height) => {
          if (!el || !height) return;
          const cw = el.clientWidth; const ch = el.clientHeight;
          if (el.width !== cw || el.height !== ch) { el.width = cw; el.height = ch; }
          const g = el.getContext('2d');
          g.drawImage(off, 0, top, w, height, 0, 0, cw, ch);
        };
        paint(header, 0, hh);
        paint(panel, hh, ph);
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
      api.current = { next: () => {}, prev: () => {} };
    };
  }, [on, targets]);

  return { info, api };
}

/**
 * THE PUSH HEADER.
 *
 * Chris, 2026-09-15: consolidate the tabs "into 4 or five tabs instead of having
 * to drag that stupid slider across the screen". The tabs are square pads in
 * the first row, like a Push, and the whole Push clone lives behind a dropdown
 * arrow. When nothing is being touched, the pads sweep colour like a Novation
 * Launchpad Mini: bright vivid colour behind opaque square buttons.
 *
 * He picked four groups, and a pop-out stack for the tabs inside each.
 */
export const TAB_GROUPS = [
  { id: 'pen', name: 'The Pen', hue: 322, tabs: ['songwriter', 'onemanband', 'analyzer', 'songforge', 'quantum'] },
  { id: 'studio', name: 'The Studio', hue: 188, tabs: ['booth', 'midistudio', 'loopstation', 'stemmer', 'screw', 'mastering'] },
  { id: 'words', name: 'Word Kit', hue: 142, tabs: ['rhyme', 'thesaurus', 'dictionary', 'scratchpad', 'collab'] },
  { id: 'control', name: 'Control Room', hue: 38, tabs: ['toolshub', 'settings'] },
];

const PAD = 58;
const GAP = 6;
const IDLE_MS = 5000;

export default function PushHeader({ tabs, activeTab, onSelect }) {
  const rowRef = useRef(null);
  const [sweepCount, setSweepCount] = useState(8);
  const [openGroup, setOpenGroup] = useState(null);
  const [anchor, setAnchor] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [live, setLive] = useState(false);
  const idleTimer = useRef(null);
  const byId = useMemo(() => new Map(tabs.map((t) => [t.id, t])), [tabs]);
  const activeGroup = TAB_GROUPS.find((g) => g.tabs.includes(activeTab));

  const [vizOn, setVizOn] = useState(() => { try { return localStorage.getItem(VIZ_KEY) === '1'; } catch { return false; } });
  const vizTargets = useRef({ header: null, panel: null });
  const { info: vizInfo, api: vizApi } = usePushVisuals(vizOn, vizTargets);
  const toggleViz = () => {
    const next = !vizOn;
    setVizOn(next);
    try { localStorage.setItem(VIZ_KEY, next ? '1' : '0'); } catch { /* storage blocked */ }
  };
  // The picture spans the WHOLE header, pills included, so the canvas sits on
  // the header itself and the header goes see-through while visuals are on.
  const hdRef = useRef(null);
  useLayoutEffect(() => {
    const header = hdRef.current?.closest('.header-cosmic');
    if (!header) return undefined;
    header.classList.toggle('viz-on', vizOn);
    if (!vizOn) return () => header.classList.remove('viz-on');
    const canvas = document.createElement('canvas');
    canvas.className = 'push-viz-canvas';
    header.prepend(canvas);
    vizTargets.current.header = canvas;
    return () => {
      header.classList.remove('viz-on');
      vizTargets.current.header = null;
      canvas.remove();
    };
  }, [vizOn]);

  // As many sweeping pads as fit after the group squares, the two visual pads and the arrow.
  useLayoutEffect(() => {
    const el = rowRef.current;
    if (!el) return undefined;
    const fit = () => {
      const cells = Math.floor((el.clientWidth + GAP) / (PAD + GAP));
      setSweepCount(Math.max(0, cells - TAB_GROUPS.length - 3));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /** Touching the header stops the sweep; it comes back after a few idle seconds. */
  const wake = useCallback(() => {
    setLive(true);
    clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setLive(false), IDLE_MS);
  }, []);
  useEffect(() => () => clearTimeout(idleTimer.current), []);

  const toggleGroup = (g, el) => {
    wake();
    if (openGroup === g.id) { setOpenGroup(null); return; }
    const r = el.getBoundingClientRect();
    setAnchor({ left: r.left, top: r.bottom + 6 });
    setOpenGroup(g.id);
  };

  useEffect(() => {
    if (!openGroup) return undefined;
    const close = (e) => {
      if (e.type === 'keydown' && e.key !== 'Escape') return;
      if (e.type === 'pointerdown' && e.target.closest?.('.push-pop, .push-group')) return;
      setOpenGroup(null);
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', close);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', close);
      window.removeEventListener('resize', close);
    };
  }, [openGroup]);

  const group = TAB_GROUPS.find((g) => g.id === openGroup);

  return (
    <div ref={hdRef} className={`push-hd${live ? ' is-live' : ''}${vizOn ? ' viz-on' : ''}`} onPointerMove={live ? undefined : wake}>
      {vizOn && vizInfo.name && <span className="push-viz-name">{vizInfo.error || `${vizInfo.name}`}</span>}
      <div className="push-row" ref={rowRef} role="tablist" aria-label="Tabs">
        {TAB_GROUPS.map((g) => {
          const on = activeGroup?.id === g.id;
          const current = on ? byId.get(activeTab) : null;
          return (
            <button
              key={g.id}
              type="button"
              role="tab"
              aria-selected={on}
              aria-haspopup="menu"
              aria-expanded={openGroup === g.id}
              className={`push-pad push-group${on ? ' is-on' : ''}`}
              style={{ '--g': g.hue }}
              onClick={(e) => toggleGroup(g, e.currentTarget)}
              data-help={`${g.name}: ${g.tabs.map((id) => byId.get(id)?.label).filter(Boolean).join(', ')}.`}
            >
              <span className="push-face">
                <span className="push-gname">{g.name}</span>
                {current && <span className="push-gtab">{current.label}</span>}
              </span>
            </button>
          );
        })}

        {Array.from({ length: sweepCount }, (_, i) => (
          <span key={i} className="push-pad push-sweep" style={{ '--i': i }} aria-hidden="true">
            <span className="push-face" />
          </span>
        ))}

        <button
          type="button"
          className={`push-pad push-arrow push-viz${vizOn ? ' is-on' : ''}`}
          style={{ '--i': sweepCount }}
          aria-pressed={vizOn}
          onClick={() => { wake(); toggleViz(); }}
          data-help={`Runs the Milkdrop visualizer underneath the pads, all ${vizInfo.count || '300+'} visuals, reacting to whatever the app is playing. The pads stay on top.`}
        >
          <span className="push-face">
            <span className="push-gname">Visuals</span>
            <span className="push-gtab">{vizOn ? 'On' : 'Off'}</span>
          </span>
        </button>
        <button
          type="button"
          className="push-pad push-arrow push-viz"
          style={{ '--i': sweepCount + 1 }}
          disabled={!vizOn}
          onClick={() => { wake(); vizApi.current.next(); }}
          data-help="Jump to another visual. It also changes by itself every half minute."
        >
          <span className="push-face">
            <span className="push-gname">Next</span>
            <span className="push-gtab">{vizOn && vizInfo.count ? `${vizInfo.count} vis` : '▸'}</span>
          </span>
        </button>

        <button
          type="button"
          className={`push-pad push-arrow${expanded ? ' is-open' : ''}`}
          aria-expanded={expanded}
          aria-label={expanded ? 'Hide the Push' : 'Show the Push'}
          onClick={() => { wake(); setExpanded((v) => !v); }}
          data-help="Opens the Push: 8 by 8 pads that play the 808 kit, your samples and every instrument, with a step sequencer. A real Ableton Push plugged in plays and lights up along with it."
        >
          <span className="push-face"><span className="push-chev" aria-hidden="true">▾</span></span>
        </button>
      </div>

      {group && anchor && createPortal(
        <div className="push-pop" role="menu" style={{ left: anchor.left, top: anchor.top, '--g': group.hue }}>
          {group.tabs.map((id) => {
            const t = byId.get(id);
            if (!t) return null;
            return (
              <button
                key={id}
                type="button"
                role="menuitem"
                className={`push-pop-item${activeTab === id ? ' is-on' : ''}`}
                onClick={() => { onSelect(id); setOpenGroup(null); }}
                data-help={t.help}
              >
                <span className="push-pop-icon" aria-hidden="true">{t.icon}</span>
                <span className="push-pop-text">
                  <span className="push-pop-label">{t.label}</span>
                  <span className="push-pop-blurb">{t.blurb}</span>
                </span>
              </button>
            );
          })}
        </div>,
        document.body,
      )}

      {expanded && (
        <PushPanel
          anchorRef={rowRef}
          onClose={() => setExpanded(false)}
          onTouch={wake}
          viz={{ on: vizOn, toggle: toggleViz, info: vizInfo, api: vizApi, targets: vizTargets }}
        />
      )}
    </div>
  );
}

/* ══ THE PUSH ════════════════════════════════════════════════════════════ */

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
const hexHue = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) / 255; const g = ((n >> 8) & 255) / 255; const b = (n & 255) / 255;
  const max = Math.max(r, g, b); const min = Math.min(r, g, b); const d = max - min;
  if (!d) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return Math.round(h * 60 + 360) % 360;
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function PushPanel({ anchorRef, onClose, onTouch, viz }) {
  const [top, setTop] = useState(0);
  const panelCanvas = useRef(null);
  useLayoutEffect(() => {
    const t = viz.targets.current;
    t.panel = viz.on ? panelCanvas.current : null;
    return () => { t.panel = null; };
  }, [viz.on, viz.targets]);
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
  const [display, setDisplay] = useState('Push ready. Hit a pad.');
  const [pushName, setPushName] = useState(null);

  const outRef = useRef(null);
  const instRef = useRef(null);
  const stopsRef = useRef(new Map());
  const buffers = useRef(new Map());
  const live = useRef({});
  live.current = { mode, octave, root, scaleIdx, pattern, voice, tempo, samples };

  // Sit directly under the header, the full width of it.
  useLayoutEffect(() => {
    const place = () => {
      const hd = anchorRef.current?.closest('.header-cosmic') || anchorRef.current;
      if (hd) setTop(hd.getBoundingClientRect().bottom);
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [anchorRef]);

  // Its own volume, into the app's master bus.
  useEffect(() => {
    const ctx = getAudioContext();
    const g = ctx.createGain();
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

  /** What a pad is, in the current mode. x 0-7 left to right, y 0-7 top to bottom. */
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
      setDisplay(`${info.voice.name}  ·  velocity ${Math.round(vel * 127)}`);
    } else if (info.kind === 'step') {
      setPattern((p) => {
        const row = [...p[live.current.voice]];
        row[info.step] = !row[info.step];
        return { ...p, [live.current.voice]: row };
      });
      setDisplay(`${KIT.find((k) => k.id === live.current.voice)?.name}: step ${info.step + 1}`);
    } else if (info.kind === 'sample') {
      const smp = live.current.samples[info.n];
      if (!smp) { setDisplay('No sample on that pad. Add samples in MIDI Studio → Samples.'); return; }
      try {
        let buf = buffers.current.get(smp.id);
        if (!buf) { buf = await getSampleBuffer(ctx, smp.id); buffers.current.set(smp.id, buf); }
        triggerSample(ctx, out, buf, ctx.currentTime, { velocity: vel });
        setDisplay(`${smp.name}`);
      } catch (e) {
        setDisplay(`${smp.name} would not play: ${e.message}`);
      }
    } else if (info.kind === 'note') {
      if (!instRef.current) { setDisplay(`${inst.name} is still loading…`); return; }
      stopsRef.current.get(key)?.();
      stopsRef.current.set(key, playNote(ctx, out, instRef.current, info.midi, { duration: 6, velocity: vel }));
      setDisplay(`${inst.name}  ·  ${midiToNoteName(info.midi)}`);
    }
  }, [padInfo, onTouch, inst.name]);

  const release = useCallback((x, y) => {
    const key = `${x},${y}`;
    setHeld((h) => { const n = new Set(h); n.delete(key); return n; });
    const stop = stopsRef.current.get(key);
    if (stop) { stop(); stopsRef.current.delete(key); }
  }, []);

  // THE STEP SEQUENCER. Lookahead scheduling off refs, like the 808 in MIDI Studio.
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
        const shown = step;
        setTimeout(() => setCurStep(shown), Math.max(0, (next - ctx.currentTime) * 1000));
        next += dur;
        step = (step + 1) % 16;
      }
    };
    const id = setInterval(tick, 25);
    tick();
    return () => clearInterval(id);
  }, [playing]);

  /** Colour of each pad right now, for the screen and the hardware. */
  const colorOf = useCallback((x, y) => {
    const info = padInfo(x, y);
    const key = `${x},${y}`;
    if (held.has(key)) return { hue: 120, level: 'hot' };
    if (info.kind === 'drum') return { hue: hexHue(info.voice.color), level: voice === info.voice.id ? 'hot' : 'on' };
    if (info.kind === 'step') {
      if (curStep === info.step) return { hue: 0, level: 'white' };
      return pattern[voice][info.step] ? { hue: hexHue(KIT.find((k) => k.id === voice).color), level: 'hot' } : { hue: 0, level: 'dim' };
    }
    if (info.kind === 'sample') return samples[info.n] ? { hue: 265, level: 'on' } : { hue: 0, level: 'off' };
    if (info.kind === 'note') return info.root ? { hue: 190, level: 'hot' } : { hue: 0, level: 'dim' };
    return { hue: 0, level: 'off' };
  }, [padInfo, held, voice, curStep, pattern, samples]);

  // THE HARDWARE.
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
    encoder: (i, delta) => KNOBS[i]?.nudge(delta),
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

  const KNOBS = [
    { label: 'Volume', value: `${Math.round(volume * 100)}%`, nudge: (d) => setVolume((v) => clamp(Math.round((v + d * 0.02) * 100) / 100, 0, 1.5)) },
    { label: 'Tempo', value: `${tempo} bpm`, nudge: (d) => setTempo((t) => clamp(t + d, 50, 200)) },
    { label: 'Octave', value: `${octave + 1}`, nudge: (d) => setOctave((o) => clamp(o + Math.sign(d), 0, 6)) },
    { label: 'Key', value: NOTE_NAMES[root], nudge: (d) => setRoot((r) => (r + Math.sign(d) + 12) % 12) },
    { label: 'Scale', value: SCALE_NAMES[scaleIdx], nudge: (d) => setScaleIdx((s) => (s + Math.sign(d) + SCALE_NAMES.length) % SCALE_NAMES.length) },
    { label: 'Instrument', value: inst.name, nudge: (d) => setInstIdx((s) => (s + Math.sign(d) + INSTRUMENTS.length) % INSTRUMENTS.length) },
    { label: 'Drum', value: KIT.find((k) => k.id === voice)?.name, nudge: (d) => setVoice((v) => KIT[(KIT.findIndex((k) => k.id === v) + Math.sign(d) + KIT.length) % KIT.length].id) },
    { label: 'Clear', value: 'steps', nudge: () => setPattern((p) => ({ ...p, [voice]: Array(16).fill(false) })) },
  ];

  const dragKnob = (i) => (e) => {
    e.preventDefault();
    let lastY = e.clientY;
    let acc = 0;
    const move = (ev) => {
      acc += lastY - ev.clientY;
      lastY = ev.clientY;
      while (Math.abs(acc) >= 6) { KNOBS[i].nudge(Math.sign(acc)); acc -= Math.sign(acc) * 6; }
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const pads = [];
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const c = colorOf(x, y);
      pads.push(
        <button
          key={`${x}-${y}`}
          type="button"
          className={`pp-pad lv-${c.level}`}
          style={{ '--h': c.hue }}
          onPointerDown={(e) => { e.currentTarget.setPointerCapture?.(e.pointerId); hit(x, y, 100); }}
          onPointerUp={() => release(x, y)}
          onPointerCancel={() => release(x, y)}
          aria-label={`Pad ${x + 1}, ${8 - y}`}
        />,
      );
    }
  }

  return createPortal(
    <section className={`pp${viz.on ? ' viz-on' : ''}`} style={{ top }} aria-label="Push">
      {viz.on && <canvas ref={panelCanvas} className="push-viz-canvas" aria-hidden="true" />}
      <div className="pp-left">
        <div className="pp-screen">
          <div className="pp-screen-top">
            <span>{mode === 'note' ? 'NOTE' : 'DRUM'}</span>
            <span>{mode === 'note' ? `${NOTE_NAMES[root]} ${SCALE_NAMES[scaleIdx]} · Oct ${octave + 1}` : `${tempo} BPM${playing ? ' · PLAYING' : ''}`}</span>
            <span className={pushName ? 'pp-hw on' : 'pp-hw'}>{pushName ? `● ${pushName}` : '○ No Push plugged in'}</span>
          </div>
          <div className="pp-screen-main">{display}</div>
          <div className="pp-screen-knobs">
            {KNOBS.map((k) => <span key={k.label}><b>{k.label}</b>{k.value}</span>)}
          </div>
        </div>
        <div className="pp-knobs">
          {KNOBS.map((k, i) => (
            <div key={k.label} className="pp-knob-wrap">
              <div
                className="pp-knob"
                role="slider"
                tabIndex={0}
                aria-label={k.label}
                aria-valuetext={k.value}
                onPointerDown={dragKnob(i)}
                onWheel={(e) => k.nudge(e.deltaY < 0 ? 1 : -1)}
                onKeyDown={(e) => { if (e.key === 'ArrowUp' || e.key === 'ArrowRight') k.nudge(1); if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') k.nudge(-1); }}
              />
              <span>{k.label}</span>
            </div>
          ))}
        </div>
        <p className="pp-help">
          {mode === 'note'
            ? 'Note mode: pads are laid out in key, fourths going up, lit pads are the root. Octave and Key on the knobs.'
            : 'Drum mode: bottom-left 4×4 is the 808 kit, the rest are your samples. The top two rows are 16 steps for the drum you last hit.'}
        </p>
      </div>

      <div className="pp-grid" onContextMenu={(e) => e.preventDefault()}>{pads}</div>

      <div className="pp-right">
        <button type="button" className={`pp-btn${playing ? ' on' : ''}`} onClick={() => setPlaying((p) => !p)}>{playing ? '■ Stop' : '▶ Play'}</button>
        <button type="button" className={`pp-btn${mode === 'drum' ? ' on' : ''}`} onClick={() => setMode('drum')}>Drum</button>
        <button type="button" className={`pp-btn${mode === 'note' ? ' on' : ''}`} onClick={() => setMode('note')}>Note</button>
        <button type="button" className="pp-btn" onClick={() => setOctave((o) => clamp(o + 1, 0, 6))}>Octave ▲</button>
        <button type="button" className="pp-btn" onClick={() => setOctave((o) => clamp(o - 1, 0, 6))}>Octave ▼</button>
        <button type="button" className="pp-btn" onClick={() => setPattern(Object.fromEntries(KIT.map((k) => [k.id, Array(16).fill(false)])))}>Clear all</button>
        <button type="button" className={`pp-btn${viz.on ? ' on' : ''}`} onClick={viz.toggle}>
          Visuals {viz.on ? 'On' : 'Off'}
        </button>
        {viz.on && (
          <>
            <button type="button" className="pp-btn" onClick={() => viz.api.current.step?.(-1)}>◂ Prev visual</button>
            <button type="button" className="pp-btn" onClick={() => viz.api.current.step?.(1)}>Next visual ▸</button>
            <button type="button" className="pp-btn" onClick={() => viz.api.current.next()}>Shuffle</button>
            <span className="pp-vizname" title={viz.info.name}>{viz.info.error || viz.info.name}</span>
          </>
        )}
        <button type="button" className="pp-btn pp-close" onClick={onClose}>▴ Hide</button>
      </div>
    </section>,
    document.body,
  );
}
