import React, { useEffect, useRef, useState } from 'react';
import { makeField, padField, ripples, pushRipple, PATTERNS } from './padEngine';

const CYCLE_ORDER = ['breathe', 'ripple', 'chase', 'sparkle', 'rain'];

/** How long the wordmark writes itself before the loop takes over, in seconds. */
const BOOT_SECONDS = 15.2;

/** Cell pitch in CSS px. Small enough that the cursive actually resolves. */
const CELL = 11;

/**
 * The pad wall — hundreds of pads, edge to edge, on canvas.
 *
 * On boot it signs its own name: the wordmark is rasterised down to pad
 * resolution and lit like a pen stroke travelling left to right. After that
 * it settles into the pattern loop. Canvas rather than DOM because a DOM
 * board this dense cannot hold a frame rate.
 *
 * @param {Object} props
 * @param {string} [props.pattern='cycle'] Pattern name, or 'cycle'.
 * @param {function(string):void} [props.onModeChange] Fires with the live mode.
 */
export default function PadWall({ pattern = 'cycle', onModeChange }) {
  const stageRef = useRef(null);
  const canvasRef = useRef(null);
  const fieldRef = useRef(null);
  const dprRef = useRef(1);
  const bootRef = useRef({ booting: true, t0: 0 });
  const patternRef = useRef(pattern);
  const modeRef = useRef('');
  const rippleRef = useRef(0);

  // The picker writes through a ref so the animation loop never restarts —
  // remounting the loop would restart the signature mid-stroke.
  useEffect(() => {
    patternRef.current = pattern;
    if (pattern !== 'cycle') bootRef.current.booting = false;
  }, [pattern]);

  useEffect(() => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    if (!stage || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = () => {
      const w = stage.clientWidth || 700;
      const h = stage.clientHeight || 300;
      dprRef.current = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(w * dprRef.current));
      canvas.height = Math.max(1, Math.round(h * dprRef.current));
      fieldRef.current = makeField(
        Math.max(8, Math.floor(w / CELL)),
        Math.max(4, Math.floor(h / CELL))
      );
    };
    size();

    const activeMode = (t) => {
      const boot = bootRef.current;
      if (boot.booting) {
        if (!boot.t0) boot.t0 = t;
        if (t - boot.t0 < BOOT_SECONDS) return 'signature';
        boot.booting = false;
      }
      const p = patternRef.current;
      if (p === 'signature') return 'signature';
      if (p !== 'cycle') return p;
      return CYCLE_ORDER[Math.floor(t / 8) % CYCLE_ORDER.length];
    };

    let raf = 0;
    const frame = (ms) => {
      const t = ms / 1000;
      const f = fieldRef.current;
      const mode = activeMode(t);

      if (mode === 'ripple' && t - rippleRef.current > 2.3) {
        rippleRef.current = t;
        pushRipple(t);
      }

      padField(f, t, mode, 0.85);

      const W = canvas.width;
      const H = canvas.height;
      const cw = W / f.cols;
      const ch = H / f.rows;
      const gap = Math.max(1, 1.6 * dprRef.current);

      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#0B0C0F';
      for (let r = 0; r < f.rows; r++) {
        for (let c = 0; c < f.cols; c++) ctx.fillRect(c * cw, r * ch, cw - gap, ch - gap);
      }
      for (let i = 0; i < f.n; i++) {
        let a = f.A[i];
        if (a < 0.02) continue;
        if (a > 1) a = 1;
        const h = ((f.H[i] % 360) + 360) % 360;
        ctx.fillStyle = `hsl(${h.toFixed(0)},97%,${(21 + a * 50).toFixed(0)}%)`;
        ctx.fillRect((i % f.cols) * cw, ((i / f.cols) | 0) * ch, cw - gap, ch - gap);
      }

      // The wordmark has to be readable, so the frost eases off while it writes.
      stage.classList.toggle('sharp', mode === 'signature');

      if (mode !== modeRef.current) {
        modeRef.current = mode;
        if (onModeChange) onModeChange(mode);
      }
      raf = requestAnimationFrame(frame);
    };

    let resizeTimer = 0;
    const onResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(size, 200);
    };
    window.addEventListener('resize', onResize);

    // Wait for the cursive face, or the wordmark rasterises in a fallback and
    // the signature comes out in the wrong hand.
    let cancelled = false;
    const start = () => { if (!cancelled) raf = requestAnimationFrame(frame); };
    if (document.fonts && document.fonts.load) {
      document.fonts.load('700 40px "Dancing Script"').catch(() => {}).then(start);
    } else {
      start();
    }

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      clearTimeout(resizeTimer);
      window.removeEventListener('resize', onResize);
      ripples.length = 0;
    };
  }, [onModeChange]);

  return (
    <div className="padstage" ref={stageRef}>
      <canvas ref={canvasRef} aria-hidden="true" />
      <div className="lens" />
    </div>
  );
}

export { PATTERNS };
