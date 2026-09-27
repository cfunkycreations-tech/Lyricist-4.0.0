import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { Shuffle, Pause, Play, ChevronLeft, ChevronRight, Search, MonitorUp } from 'lucide-react';
import { getAudioContext, getMasterBus } from '../../services/audioEngine.js';
import { listDisplays, describeDisplay, openPopout, sizePopoutCanvas } from '../../services/vizPopout.js';

// Butterchurn (Milkdrop 2 WebGL port) — Lyricist 4.2.0
// Full preset browser: dozens of visualizations (pack usually has 100+;
// we surface up to 80 in the picker, shuffle across ALL).

const PREFERRED = [/magenta|pink|fire|flame|warm|solar|sun|lava|plasm|neon|pulse|fractal|space|star/i];
const PICKER_CAP = 500; // show the whole pack in the list; search narrows it

export default function Visualizer() {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const vizRef = useRef(null);
  const rafRef = useRef(null);
  const presetsRef = useRef({ names: [], map: {} });

  const [running, setRunning] = useState(true);
  const [presetName, setPresetName] = useState('');
  const [presetIndex, setPresetIndex] = useState(0);
  const [allNames, setAllNames] = useState([]);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState('');
  const [autoCycle, setAutoCycle] = useState(true);
  const autoCycleRef = useRef(true);
  useEffect(() => { autoCycleRef.current = autoCycle; }, [autoCycle]);

  // Second-screen popout
  const [displays, setDisplays] = useState([]);
  const [poppedTo, setPoppedTo] = useState(null);   // the display it's showing on
  const popoutRef = useRef(null);                    // { win, canvas, close }
  const popVizRef = useRef(null);
  const popRafRef = useRef(null);

  const butterchurnRef = useRef(null);

  useEffect(() => { listDisplays().then(setDisplays).catch(() => setDisplays([])); }, []);

  /** Tear the popout down and hand rendering back to the inline canvas. */
  const closePopout = useCallback(() => {
    cancelAnimationFrame(popRafRef.current);
    popVizRef.current = null;
    const p = popoutRef.current;
    popoutRef.current = null;
    setPoppedTo(null);
    if (p) p.close();
  }, []);

  /**
   * Throw the visualizer onto `display`.
   *
   * The popout gets its own Butterchurn instance drawing into its own canvas,
   * but built on THIS window's AudioContext and connected to the same master
   * bus — that shared audio graph is only reachable because the popout is a
   * same-origin window.open child sharing this renderer process.
   */
  const sendToScreen = useCallback(async (display) => {
    setError('');
    const butterchurn = butterchurnRef.current;
    if (!butterchurn) { setError('Visualizer is still loading — try again in a second.'); return; }
    closePopout();
    try {
      const p = openPopout(display, { onClose: () => {
        cancelAnimationFrame(popRafRef.current);
        popVizRef.current = null;
        popoutRef.current = null;
        setPoppedTo(null);
      } });
      popoutRef.current = p;

      const ctx = getAudioContext();
      const { w, h } = sizePopoutCanvas(p.win, p.canvas, null);
      const viz = butterchurn.createVisualizer(ctx, p.canvas, {
        width: w, height: h, pixelRatio: Math.min(p.win.devicePixelRatio || 1, 2),
      });
      viz.connectAudio(getMasterBus());
      popVizRef.current = viz;

      // Carry the preset that's already on screen across to the big screen.
      const { map } = presetsRef.current;
      if (presetName && map[presetName]) viz.loadPreset(map[presetName], 0);

      p.win.addEventListener('resize', () => sizePopoutCanvas(p.win, p.canvas, popVizRef.current));
      const nameEl = p.win.document.getElementById('name');
      if (nameEl) nameEl.textContent = presetName || '';

      const draw = () => {
        if (!popVizRef.current) return;
        popVizRef.current.render();
        popRafRef.current = p.win.requestAnimationFrame(draw);
      };
      popRafRef.current = p.win.requestAnimationFrame(draw);
      setPoppedTo(display);
    } catch (e) {
      setError(e.message || 'Could not open the visualizer window.');
      closePopout();
    }
  }, [closePopout, presetName]);

  // Never strand a fullscreen window on another monitor after this tab unmounts.
  useEffect(() => closePopout, [closePopout]);

  // Keep the popout on whatever preset the controls pick.
  useEffect(() => {
    const viz = popVizRef.current;
    const p = popoutRef.current;
    if (!viz || !p) return;
    const { map } = presetsRef.current;
    if (presetName && map[presetName]) viz.loadPreset(map[presetName], 1.5);
    const nameEl = p.win.document.getElementById('name');
    if (nameEl) nameEl.textContent = presetName || '';
  }, [presetName]);

  const loadPresetByName = useCallback((name, blend = 2.0) => {
    const { map, names } = presetsRef.current;
    if (!name || !map[name] || !vizRef.current) return;
    vizRef.current.loadPreset(map[name], blend);
    setPresetName(name);
    const idx = names.indexOf(name);
    if (idx >= 0) setPresetIndex(idx);
  }, []);

  const loadRandomPreset = useCallback((blend = 2.4) => {
    const { names, map } = presetsRef.current;
    if (!names.length || !vizRef.current) return;
    const preferred = names.filter((n) => PREFERRED.some((rx) => rx.test(n)));
    const pool = preferred.length && Math.random() < 0.55 ? preferred : names;
    const name = pool[Math.floor(Math.random() * pool.length)];
    vizRef.current.loadPreset(map[name], blend);
    setPresetName(name);
    setPresetIndex(names.indexOf(name));
  }, []);

  const stepPreset = useCallback((dir) => {
    const { names } = presetsRef.current;
    if (!names.length) return;
    let i = presetIndex + dir;
    if (i < 0) i = names.length - 1;
    if (i >= names.length) i = 0;
    loadPresetByName(names[i], 1.5);
  }, [presetIndex, loadPresetByName]);

  useEffect(() => {
    let cancelled = false;
    let cycleTimer = null;
    let removeResize = () => {};

    (async () => {
      try {
        // Both packages ship as UMD browser bundles, so what Vite hands back
        // differs between dev and build: sometimes the namespace itself, sometimes
        // .default, sometimes .default.default. Unwrap until we find the real API
        // instead of assuming .default (that assumption is what threw
        // "butterchurn.createVisualizer is not a function" and left 0 presets).
        const unwrap = (mod, key) => {
          for (const cand of [mod, mod?.default, mod?.default?.default]) {
            if (cand && typeof cand[key] === 'function') return cand;
          }
          return null;
        };

        // Every preset pack that ships with butterchurn-presets, not just the base
        // one. Base alone is ~100; together these are several hundred. The extra
        // packs were already installed and simply never loaded.
        const [bcMod, ...packMods] = await Promise.all([
          import('butterchurn'),
          import('butterchurn-presets'),
          import('butterchurn-presets/lib/butterchurnPresetsExtra.min.js').catch(() => null),
          import('butterchurn-presets/lib/butterchurnPresetsExtra2.min.js').catch(() => null),
          import('butterchurn-presets/lib/butterchurnPresetsMD1.min.js').catch(() => null),
          import('butterchurn-presets/lib/butterchurnPresetsNonMinimal.min.js').catch(() => null),
        ]);
        const butterchurn = unwrap(bcMod, 'createVisualizer');
        if (!butterchurn) throw new Error('Butterchurn loaded but createVisualizer was not found');
        if (cancelled || !canvasRef.current) return;
        butterchurnRef.current = butterchurn;   // the popout builds its own instance

        const ctx = getAudioContext();
        const canvas = canvasRef.current;
        const wrap = wrapRef.current;
        const w = wrap.clientWidth || 800;
        const h = wrap.clientHeight || 350;
        canvas.width = w;
        canvas.height = h;

        const viz = butterchurn.createVisualizer(ctx, canvas, {
          width: w,
          height: h,
          pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
        });
        viz.connectAudio(getMasterBus());
        vizRef.current = viz;

        const map = {};
        for (const packMod of packMods) {
          const pack = unwrap(packMod, 'getPresets');
          if (!pack) continue;
          try {
            Object.assign(map, pack.getPresets());
          } catch {
            /* a bad pack must not take the whole visualizer down */
          }
        }
        const names = Object.keys(map).sort((a, b) => a.localeCompare(b));
        presetsRef.current = { names, map };
        setAllNames(names);
        loadRandomPreset(0);

        const resize = () => {
          if (!wrapRef.current || !canvasRef.current) return;
          const nw = wrapRef.current.clientWidth;
          const nh = wrapRef.current.clientHeight;
          canvasRef.current.width = nw;
          canvasRef.current.height = nh;
          viz.setRendererSize(nw, nh);
        };
        window.addEventListener('resize', resize);
        removeResize = () => window.removeEventListener('resize', resize);

        const render = () => {
          if (vizRef.current) vizRef.current.render();
          rafRef.current = requestAnimationFrame(render);
        };
        rafRef.current = requestAnimationFrame(render);

        cycleTimer = setInterval(() => {
          if (autoCycleRef.current) loadRandomPreset();
        }, 28000);
      } catch (e) {
        if (!cancelled) setError(`Visualizer failed to start: ${e.message}`);
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      if (cycleTimer) clearInterval(cycleTimer);
      removeResize();
      vizRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadRandomPreset]);

  // While it's on another screen the inline canvas stops drawing — no reason to
  // run two WebGL visualizers when only one is being looked at.
  useEffect(() => {
    cancelAnimationFrame(rafRef.current);
    if (running && !poppedTo) {
      const render = () => {
        if (vizRef.current) vizRef.current.render();
        rafRef.current = requestAnimationFrame(render);
      };
      rafRef.current = requestAnimationFrame(render);
    }
    return () => cancelAnimationFrame(rafRef.current);
  }, [running, poppedTo]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const list = q ? allNames.filter((n) => n.toLowerCase().includes(q)) : allNames;
    return list.slice(0, PICKER_CAP);
  }, [allNames, filter]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0 }}>
      <div
        className="viz-canvas-wrap"
        ref={wrapRef}
        data-help="Butterchurn — WebGL Milkdrop 2. Reacts to MIDI sequencer + Suno player. Use Prev/Next, Shuffle, search the preset list (dozens of vizzes)."
      >
        <canvas ref={canvasRef} />
        <div className="viz-overlay" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button className="suno-chip" onClick={() => stepPreset(-1)} title="Previous preset"><ChevronLeft size={11} /></button>
          <button className="suno-chip" data-demo="midi-viz" onClick={() => loadRandomPreset()} title={presetName}><Shuffle size={11} /> Shuffle</button>
          <button className="suno-chip" onClick={() => stepPreset(1)} title="Next preset"><ChevronRight size={11} /></button>
          <button className="suno-chip" onClick={() => setRunning((r) => !r)}>{running ? <Pause size={11} /> : <Play size={11} />}</button>
          <button className="suno-chip" onClick={() => setAutoCycle((v) => !v)} title="Auto-cycle every ~28s">
            Auto {autoCycle ? 'On' : 'Off'}
          </button>

          {/* Send it to another monitor. Only worth showing when there is more
              than one screen to send it to. */}
          {displays.length > 1 && !poppedTo && (
            <select
              className="suno-chip"
              value=""
              onChange={(e) => {
                const d = displays.find((x) => String(x.id) === e.target.value);
                if (d) sendToScreen(d);
              }}
              style={{ fontSize: '0.58rem', cursor: 'pointer', maxWidth: 190 }}
              data-help="Throw the visualizer full-screen onto one of your other monitors. It keeps reacting to the same audio, and the preset controls here still drive it. Press Esc on that screen to bring it back."
            >
              <option value="">Send to screen…</option>
              {displays.map((d) => (
                <option key={d.id} value={String(d.id)}>{describeDisplay(d)}</option>
              ))}
            </select>
          )}

          {poppedTo && (
            <button
              className="suno-chip"
              onClick={closePopout}
              style={{ borderColor: '#E7A540', color: '#E7A540', background: 'rgba(231,165,64,0.1)' }}
              data-help="Bring the visualizer back into this panel and close the full-screen window."
            >
              <MonitorUp size={11} /> On {describeDisplay(poppedTo).split(' · ')[0]} — bring back
            </button>
          )}
        </div>
        {presetName && (
          <div style={{ position: 'absolute', left: 10, bottom: 8, fontSize: '0.58rem', color: 'rgba(231,165,64,0.85)', fontFamily: "'JetBrains Mono', monospace", textShadow: '0 0 6px rgba(0,0,0,0.9)', maxWidth: '70%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {presetIndex + 1}/{allNames.length || '—'} · {presetName}
          </div>
        )}
        {poppedTo && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 8,
            background: 'rgba(4,6,9,0.86)', color: '#e7a540', textAlign: 'center', padding: 16,
          }}>
            <MonitorUp size={26} />
            <div style={{ fontSize: '0.8rem', fontWeight: 700 }}>
              Playing on {describeDisplay(poppedTo)}
            </div>
            <div style={{ fontSize: '0.64rem', color: 'rgba(230,232,235,0.7)', maxWidth: 380 }}>
              Shuffle, Prev/Next and the preset list still drive it. Press Esc on that screen, or use
              the button above, to bring it back here.
            </div>
          </div>
        )}
        {error && <div className="pill-red" style={{ position: 'absolute', inset: 'auto 10px 10px 10px', padding: '6px 10px', borderRadius: 8, fontSize: '0.66rem' }}>{error}</div>}
      </div>

      {/* Preset browser — many Milkdrop-class visualizations */}
      <div
        style={{ maxHeight: 160, overflow: 'hidden', display: 'flex', flexDirection: 'column', border: '1px solid rgba(155,161,170,0.3)', borderRadius: 10, background: 'rgba(10,12,15,0.9)' }}
        data-help={`Full Butterchurn pack: ${allNames.length} presets loaded. List shows up to ${PICKER_CAP}; Shuffle uses all of them.`}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderBottom: '1px solid rgba(155,161,170,0.2)' }}>
          <Search size={12} color="#e7a540" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={`Search ${allNames.length || '…'} visualizers…`}
            style={{ flex: 1, background: 'transparent', border: 'none', color: '#e6e8eb', fontSize: '0.72rem', outline: 'none' }}
          />
          <span style={{ fontSize: '0.62rem', color: 'rgba(155,161,170,0.55)' }}>{filtered.length} shown</span>
        </div>
        <div style={{ overflowY: 'auto', flex: 1, padding: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {filtered.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => loadPresetByName(n, 1.2)}
              className="suno-chip"
              style={{
                fontSize: '0.58rem',
                maxWidth: 160,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                borderColor: n === presetName ? 'rgba(231,165,64,0.7)' : undefined,
                color: n === presetName ? '#e7a540' : undefined,
              }}
              title={n}
            >
              {n.length > 28 ? n.slice(0, 26) + '…' : n}
            </button>
          ))}
          {!filtered.length && <span style={{ fontSize: '0.7rem', color: 'rgba(155,161,170,0.5)', padding: 8 }}>No matches</span>}
        </div>
      </div>
    </div>
  );
}
