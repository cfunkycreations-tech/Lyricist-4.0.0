import React, { useEffect, useRef, useState } from 'react';
import { makeField, padField, ripples, pushRipple, PATTERNS } from './padEngine';

const CYCLE_ORDER = ['breathe', 'ripple', 'chase', 'sparkle', 'rain'];

/** How long the wordmark writes itself before the loop takes over, in seconds. */
const BOOT_SECONDS = 15.2;

/**
 * Cell pitch in CSS px.
 *
 * Two things fight over this number: the squares have to read AS squares, and
 * the wordmark has to resolve into letters. Below ~12 the grid turns to mush;
 * above ~15 the cursive loses its joins. 13 holds both.
 */
const CELL = 13;

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
      const dpr = dprRef.current;
      const gap = 2 * dpr;
      const side = Math.min(cw, ch) - gap;
      const ox = (cw - side) / 2;
      const oy = (ch - side) / 2;

      ctx.clearRect(0, 0, W, H);
      ctx.lineWidth = Math.max(1, dpr);

      // Unlit: a hairline square outline, drawn on the half-pixel so the
      // stroke lands on one device pixel instead of smearing across two.
      // These are lines, not blocks — the pad is the outline, and the colour
      // is light coming through it.
      const half = ctx.lineWidth / 2;
      ctx.strokeStyle = 'rgba(255,255,255,0.055)';
      ctx.beginPath();
      for (let r = 0; r < f.rows; r++) {
        for (let c = 0; c < f.cols; c++) {
          ctx.rect(Math.round(c * cw + ox) + half, Math.round(r * ch + oy) + half, side, side);
        }
      }
      ctx.stroke();

      // Lit: the outline takes the hue at full strength, with a faint wash
      // inside it so the square reads as illuminated rather than merely drawn.
      for (let i = 0; i < f.n; i++) {
        let a = f.A[i];
        if (a < 0.02) continue;
        if (a > 1) a = 1;
        const h = ((f.H[i] % 360) + 360) % 360;
        const x = Math.round((i % f.cols) * cw + ox) + half;
        const y = Math.round(((i / f.cols) | 0) * ch + oy) + half;
        ctx.fillStyle = `hsla(${h.toFixed(0)},96%,56%,${(a * 0.20).toFixed(3)})`;
        ctx.fillRect(x, y, side, side);
        ctx.strokeStyle = `hsla(${h.toFixed(0)},98%,${(58 + a * 20).toFixed(0)}%,${(0.22 + a * 0.78).toFixed(3)})`;
        ctx.strokeRect(x, y, side, side);
      }

      // A second pass puts a real bloom on only the brightest pads. Shadow
      // blur is expensive, so it is spent on the few cells that carry the
      // image rather than on all several hundred.
      ctx.save();
      for (let i = 0; i < f.n; i++) {
        const a = f.A[i];
        if (a < 0.55) continue;
        const h = ((f.H[i] % 360) + 360) % 360;
        const x = Math.round((i % f.cols) * cw + ox) + half;
        const y = Math.round(((i / f.cols) | 0) * ch + oy) + half;
        ctx.shadowColor = `hsla(${h.toFixed(0)},100%,62%,${(a * 0.9).toFixed(2)})`;
        ctx.shadowBlur = 10 * dpr * a;
        ctx.strokeStyle = `hsla(${h.toFixed(0)},100%,72%,${a.toFixed(2)})`;
        ctx.strokeRect(x, y, side, side);
      }
      ctx.restore();

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
