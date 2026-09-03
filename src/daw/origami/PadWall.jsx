import React, { useEffect, useRef } from 'react';
import { makeField, padField, pushRipple, pushBlast, setScene, POOL, LABELS } from './padEngine';

/**
 * Pad pitch in CSS px. Launchpad scale — big enough that a pad reads as a
 * button you could press, rather than as a pixel in a grid.
 */
const CELL = 52;

/**
 * Pitch for the signature segment.
 *
 * The two pull against each other: 52px reads as hardware, but a board that
 * coarse is 4-6 rows tall and cursive needs ~16 rows to resolve, so the
 * wordmark comes out as coloured blocks. The board runs fine while it signs
 * its name and coarse for everything else.
 */
const CELL_FINE = 14;

/** Seconds the signature holds before the scene cycle takes over. */
const INTRO = 7.4;
/** Seconds each scene holds. */
const SEG = 9.0;
/** Seconds of crossfade between scenes. */
const FADE = 1.8;

/** Fisher-Yates, with the wrap guarded so a scene never repeats across it. */
function shuffle(prevLast) {
  const a = POOL.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  if (prevLast && a[0] === prevLast && a.length > 1) a.push(a.shift());
  return a;
}

/**
 * The pad wall.
 *
 * It runs itself: signs its own name, then every scene fades into the next on
 * a rolling random playlist. No picker, no buttons — a live surface, not a
 * control. Canvas rather than DOM because the crossfade renders two full
 * scenes per frame.
 *
 * @param {Object} props
 * @param {function(string):void} [props.onScene] Fires with the live scene name.
 */
export default function PadWall({ onScene }) {
  const stageRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    if (!stage || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Two fields per pitch: a crossfade between scenes holds both at once.
    // Coarse is the scene board; fine is the signature board.
    let coarse = null;
    let coarse2 = null;
    let fine = null;
    let dpr = 1;

    const size = () => {
      const w = stage.clientWidth || 700;
      const h = stage.clientHeight || 344;
      dpr = Math.min(window.devicePixelRatio || 1, 3);
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      const grid = (cell) => [
        Math.max(8, Math.floor(w / cell)),
        Math.max(4, Math.floor(h / cell))
      ];
      const [cc, cr] = grid(CELL);
      coarse = makeField(cc, cr);
      coarse2 = makeField(cc, cr);
      const [fc, fr] = grid(CELL_FINE);
      fine = makeField(fc, fr);
    };
    size();

    let order = shuffle(null);
    const sceneAt = (n) => {
      while (n >= order.length) order = order.concat(shuffle(order[order.length - 1]));
      return order[n];
    };

    let t0 = null;
    const padScene = (t) => {
      if (t0 === null) t0 = t;
      const e = t - t0;
      if (e < INTRO) {
        if (e > INTRO - FADE) {
          return { a: 'signature', b: sceneAt(0), mix: (e - (INTRO - FADE)) / FADE, name: sceneAt(0) };
        }
        return { a: 'signature', b: 'signature', mix: 0, name: 'signature' };
      }
      const ce = e - INTRO;
      const idx = Math.floor(ce / SEG);
      const into = ce - idx * SEG;
      const a = sceneAt(idx);
      if (into > SEG - FADE) {
        const b = sceneAt(idx + 1);
        return { a, b, mix: (into - (SEG - FADE)) / FADE, name: b };
      }
      return { a, b: a, mix: 0, name: a };
    };

    /**
     * Paint one field. Geometry comes off the field's own dimensions, so the
     * same routine draws a 15-column scene board and a 55-column signature
     * board without knowing which it has.
     *
     * @param {Object} f      Field to paint.
     * @param {number} alpha  0-1, for cross-fading between the two pitches.
     */
    const paint = (f, alpha) => {
      if (alpha <= 0.004) return;
      const W = canvas.width;
      const H = canvas.height;
      const cw = W / f.cols;
      const ch = H / f.rows;
      const gap = Math.max(f.cols > 30 ? 1.6 : 3, Math.round(2.2 * dpr));
      const side = Math.min(cw, ch) - gap;
      const rad = Math.max(1, side * 0.12);
      const ox = (cw - side) / 2;
      const oy = (ch - side) / 2;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.lineWidth = Math.max(f.cols > 30 ? 1 : 1.25, 1.5 * dpr);
      const half = ctx.lineWidth / 2;

      // Round-rect on the half pixel, so a pad reads as one crisp button
      // rather than a smeared square. No blur anywhere.
      const padPath = (x, y) => {
        const x0 = Math.round(x) + half;
        const y0 = Math.round(y) + half;
        if (ctx.roundRect) {
          ctx.roundRect(x0, y0, side, side, rad);
        } else {
          ctx.moveTo(x0 + rad, y0);
          ctx.arcTo(x0 + side, y0, x0 + side, y0 + side, rad);
          ctx.arcTo(x0 + side, y0 + side, x0, y0 + side, rad);
          ctx.arcTo(x0, y0 + side, x0, y0, rad);
          ctx.arcTo(x0, y0, x0 + side, y0, rad);
          ctx.closePath();
        }
      };

      // NOTHING IS DRAWN WHERE NOTHING IS LIT. A resting outline at every cell
      // is a lattice filling the whole panel — the glowing tile board this
      // design exists to remove, just at a bigger pitch.
      for (let i = 0; i < f.n; i++) {
        let a = f.A[i];
        if (a < 0.02) continue;
        if (a > 1) a = 1;
        const h = ((f.H[i] % 360) + 360) % 360;
        ctx.beginPath();
        padPath((i % f.cols) * cw + ox, ((i / f.cols) | 0) * ch + oy);
        ctx.fillStyle = `hsla(${h.toFixed(0)},96%,56%,${(a * 0.22).toFixed(3)})`;
        ctx.fill();
        ctx.strokeStyle = `hsla(${h.toFixed(0)},98%,${(58 + a * 22).toFixed(0)}%,${(0.28 + a * 0.72).toFixed(3)})`;
        ctx.stroke();
      }

      // Bloom, spent only on the pads bright enough to carry the image.
      for (let j = 0; j < f.n; j++) {
        const av = f.A[j];
        if (av < 0.55) continue;
        const hv = ((f.H[j] % 360) + 360) % 360;
        ctx.beginPath();
        padPath((j % f.cols) * cw + ox, ((j / f.cols) | 0) * ch + oy);
        ctx.shadowColor = `hsla(${hv.toFixed(0)},100%,62%,${(av * 0.9).toFixed(2)})`;
        ctx.shadowBlur = 12 * dpr * av;
        ctx.strokeStyle = `hsla(${hv.toFixed(0)},100%,72%,${av.toFixed(2)})`;
        ctx.stroke();
      }
      ctx.restore();
    };

    const draw = (t, sc) => {
      if (!coarse) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const aSig = sc.a === 'signature';
      const bSig = sc.b === 'signature';

      // Signature holding: fine board only.
      if (aSig && bSig) {
        padField(fine, t, 'signature', 0.85);
        paint(fine, 1);
        return;
      }

      // Signature crossing into a scene, or back. The two boards have
      // different dimensions, so this dissolves whole boards on alpha rather
      // than lerping per cell — the pitch visibly changes, which is the point.
      if (aSig || bSig) {
        const sceneMode = aSig ? sc.b : sc.a;
        const sceneMix = aSig ? sc.mix : 1 - sc.mix;
        padField(fine, t, 'signature', 0.85);
        padField(coarse, t, sceneMode, 0.85);
        paint(fine, 1 - sceneMix);
        paint(coarse, sceneMix);
        return;
      }

      // Scene to scene, same pitch: brightness lerps and each cell keeps the
      // hue of whichever scene is winning it, so scenes bleed rather than cut.
      padField(coarse, t, sc.a, 0.85);
      if (sc.mix > 0 && sc.b !== sc.a) {
        padField(coarse2, t, sc.b, 0.85);
        const m = sc.mix;
        for (let i = 0; i < coarse.n; i++) {
          const aa = coarse.A[i] * (1 - m);
          const bb = coarse2.A[i] * m;
          coarse.A[i] = aa + bb;
          if (bb > aa) coarse.H[i] = coarse2.H[i];
        }
      }
      paint(coarse, 1);
    };

    let raf = 0;
    let lastRipple = 0;
    let lastBlast = 0;
    let lastName = '';

    const frame = (ms) => {
      const t = ms / 1000;
      const sc = padScene(t);

      // Whichever scene is on screen — incoming or outgoing — keeps its
      // emitters fed, or it goes dead the moment it starts fading.
      if ((sc.a === 'ripple' || sc.b === 'ripple') && t - lastRipple > 2.3) {
        lastRipple = t;
        pushRipple(t);
      }
      if ((sc.a === 'supernova' || sc.b === 'supernova') && t - lastBlast > 1.7) {
        lastBlast = t;
        pushBlast(t);
      }

      draw(t, sc);

      setScene(sc.a, LABELS[sc.name] || sc.name);
      if (sc.name !== lastName) {
        lastName = sc.name;
        if (onScene) onScene(LABELS[sc.name] || sc.name);
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
    };
  }, [onScene]);

  return (
    <div className="padstage" ref={stageRef}>
      <canvas ref={canvasRef} aria-hidden="true" />
      <div className="lens" />
    </div>
  );
}
