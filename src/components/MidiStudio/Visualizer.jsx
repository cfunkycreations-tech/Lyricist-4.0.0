import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Shuffle, Pause, Play } from 'lucide-react';
import { getAudioContext, getMasterBus } from '../../services/audioEngine.js';

// Butterchurn (Milkdrop 2 WebGL port) visualizer — Lyricist 4.1.3
// Connects to the shared master bus, so it dances to whatever is audible:
// the offline MIDI sequencer's synth AND the persistent Suno player.
// Rendered on an HTML5 <canvas> inside the playback UI.

// Presets whose names lean magenta/warm get first pick so the visuals sit
// naturally inside the neon magenta/orange aesthetic.
const PREFERRED = [/magenta|pink|fire|flame|warm|solar|sun|lava|plasm/i];

export default function Visualizer() {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const vizRef = useRef(null);
  const rafRef = useRef(null);
  const presetsRef = useRef({ names: [], map: {} });

  const [running, setRunning] = useState(true);
  const [presetName, setPresetName] = useState('');
  const [error, setError] = useState('');

  const loadRandomPreset = useCallback((blend = 2.4) => {
    const { names, map } = presetsRef.current;
    if (!names.length || !vizRef.current) return;
    const preferred = names.filter(n => PREFERRED.some(rx => rx.test(n)));
    const pool = preferred.length && Math.random() < 0.6 ? preferred : names;
    const name = pool[Math.floor(Math.random() * pool.length)];
    vizRef.current.loadPreset(map[name], blend);
    setPresetName(name);
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // Lazy-load the WebGL engine + preset pack only when this tab exists.
        const [{ default: butterchurn }, { default: butterchurnPresets }] = await Promise.all([
          import('butterchurn'),
          import('butterchurn-presets')
        ]);
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
          pixelRatio: Math.min(window.devicePixelRatio || 1, 2)
        });
        // Tap the same node everything audible plays through.
        viz.connectAudio(getMasterBus());
        vizRef.current = viz;

        const map = butterchurnPresets.getPresets();
        presetsRef.current = { names: Object.keys(map), map };
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

        const render = () => {
          if (vizRef.current) vizRef.current.render();
          rafRef.current = requestAnimationFrame(render);
        };
        rafRef.current = requestAnimationFrame(render);

        // Drift through presets Winamp-style.
        const cycle = setInterval(() => loadRandomPreset(), 30000);

        return () => {
          window.removeEventListener('resize', resize);
          clearInterval(cycle);
        };
      } catch (e) {
        if (!cancelled) setError(`Visualizer failed to start: ${e.message}`);
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      vizRef.current = null;
    };
  }, [loadRandomPreset]);

  // Pause/resume just the render loop (audio is untouched).
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

  return (
    <div className="viz-canvas-wrap" ref={wrapRef}
      data-help="Butterchurn — the open-source WebGL port of Winamp's Milkdrop 2. It reacts live to the sequencer and the Suno player. Shuffle cycles the preset.">
      <canvas ref={canvasRef} />
      <div className="viz-overlay">
        <button className="suno-chip" onClick={() => loadRandomPreset()} title={presetName}>
          <Shuffle size={11} /> Preset
        </button>
        <button className="suno-chip" onClick={() => setRunning(r => !r)}>
          {running ? <Pause size={11} /> : <Play size={11} />}
        </button>
      </div>
      {presetName && (
        <div style={{ position: 'absolute', left: 10, bottom: 8, fontSize: '0.58rem', color: 'rgba(255,158,44,0.75)', fontFamily: "'JetBrains Mono', monospace", textShadow: '0 0 6px rgba(0,0,0,0.9)', maxWidth: '70%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {presetName}
        </div>
      )}
      {error && <div className="pill-red" style={{ position: 'absolute', inset: 'auto 10px 10px 10px', padding: '6px 10px', borderRadius: 8, fontSize: '0.66rem' }}>{error}</div>}
    </div>
  );
}
