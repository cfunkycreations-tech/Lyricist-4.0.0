import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { Shuffle, Pause, Play, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { getAudioContext, getMasterBus } from '../../services/audioEngine.js';

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

  useEffect(() => {
    cancelAnimationFrame(rafRef.current);
    if (running) {
      const render = () => {
        if (vizRef.current) vizRef.current.render();
        rafRef.current = requestAnimationFrame(render);
      };
      rafRef.current = requestAnimationFrame(render);
    }
    return () => cancelAnimationFrame(rafRef.current);
  }, [running]);

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
        </div>
        {presetName && (
          <div style={{ position: 'absolute', left: 10, bottom: 8, fontSize: '0.58rem', color: 'rgba(0,229,255,0.85)', fontFamily: "'JetBrains Mono', monospace", textShadow: '0 0 6px rgba(0,0,0,0.9)', maxWidth: '70%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {presetIndex + 1}/{allNames.length || '—'} · {presetName}
          </div>
        )}
        {error && <div className="pill-red" style={{ position: 'absolute', inset: 'auto 10px 10px 10px', padding: '6px 10px', borderRadius: 8, fontSize: '0.66rem' }}>{error}</div>}
      </div>

      {/* Preset browser — many Milkdrop-class visualizations */}
      <div
        style={{ maxHeight: 160, overflow: 'hidden', display: 'flex', flexDirection: 'column', border: '1px solid rgba(139,92,246,0.3)', borderRadius: 10, background: 'rgba(8,5,18,0.9)' }}
        data-help={`Full Butterchurn pack: ${allNames.length} presets loaded. List shows up to ${PICKER_CAP}; Shuffle uses all of them.`}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderBottom: '1px solid rgba(139,92,246,0.2)' }}>
          <Search size={12} color="#00e5ff" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={`Search ${allNames.length || '…'} visualizers…`}
            style={{ flex: 1, background: 'transparent', border: 'none', color: '#e8e0ff', fontSize: '0.72rem', outline: 'none' }}
          />
          <span style={{ fontSize: '0.62rem', color: 'rgba(180,170,200,0.55)' }}>{filtered.length} shown</span>
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
                borderColor: n === presetName ? 'rgba(255,45,149,0.7)' : undefined,
                color: n === presetName ? '#00e5ff' : undefined,
              }}
              title={n}
            >
              {n.length > 28 ? n.slice(0, 26) + '…' : n}
            </button>
          ))}
          {!filtered.length && <span style={{ fontSize: '0.7rem', color: 'rgba(180,170,200,0.5)', padding: 8 }}>No matches</span>}
        </div>
      </div>
    </div>
  );
}
