import React, { useEffect, useRef } from 'react';

// ============================================================
// Quantum Lab — animated energy field
//
// A single <canvas> layered behind the lattice tiles. Renders:
//   • a drifting particle nebula (Austin-sunset palette) that blooms
//     to the right, densest around high-energy cells;
//   • entanglement beams — glowing dashed curves from line-final /
//     entangled tiles converging to a focal point on the right.
// Cell centers are read from the live tile DOM (data-cell ids), so
// the beams track the real grid at any size. Pure eye-candy: it reads
// engine state (energy, links) but never mutates it.
// ============================================================

const PALETTE = ['#9ba1aa', '#9ba1aa', '#e7a540', '#ffd08a', '#e7a540'];

export default function EnergyField({ wrapRef, gridRef, links = [], energyById = {}, finals = [], showEntanglement = true, running = false }) {
  const canvasRef = useRef(null);
  const stateRef = useRef({ particles: [], centers: {}, size: { w: 0, h: 0 }, t: 0 });
  // keep latest props available to the RAF loop without re-subscribing
  const propsRef = useRef({ links, energyById, finals, showEntanglement, running });
  propsRef.current = { links, energyById, finals, showEntanglement, running };

  // measure tile centers relative to the wrap
  const measure = () => {
    const wrap = wrapRef.current, grid = gridRef.current, cv = canvasRef.current;
    if (!wrap || !grid || !cv) return;
    const wr = wrap.getBoundingClientRect();
    const w = Math.max(1, Math.floor(wr.width)), h = Math.max(1, Math.floor(wr.height));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = w * dpr; cv.height = h * dpr;
    cv.style.width = w + 'px'; cv.style.height = h + 'px';
    const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const centers = {};
    grid.querySelectorAll('[data-cell]').forEach((el) => {
      const r = el.getBoundingClientRect();
      centers[el.getAttribute('data-cell')] = { x: r.left - wr.left + r.width / 2, y: r.top - wr.top + r.height / 2 };
    });
    stateRef.current.centers = centers;
    stateRef.current.size = { w, h };
    // Quiet particle field — few, slow, dim — so entanglement lines stay readable
    const N = Math.min(28, Math.round(w * h / 28000));
    const gridRight = grid.getBoundingClientRect().right - wr.left;
    stateRef.current.particles = Array.from({ length: N }, () => spawn(w, h, gridRight));
  };

  const spawn = (w, h, gridRight) => {
    // bias spawn toward the bloom region just right of the grid
    const bloom = Math.random() < 0.75;
    const x = bloom ? gridRight + Math.random() * (w - gridRight) * 0.9 : Math.random() * w;
    return {
      x, y: Math.random() * h,
      vx: 0.015 + Math.random() * 0.08,  // slow
      vy: (Math.random() - 0.5) * 0.06,
      r: 0.5 + Math.random() * 1.4,
      c: PALETTE[(Math.random() * PALETTE.length) | 0],
      a: 0.06 + Math.random() * 0.14,     // dim
      ph: Math.random() * Math.PI * 2,
    };
  };

  useEffect(() => {
    measure();
    const ro = new ResizeObserver(() => measure());
    if (wrapRef.current) ro.observe(wrapRef.current);
    window.addEventListener('resize', measure);

    let raf;
    const cv = canvasRef.current;
    const ctx = cv.getContext('2d');
    const loop = () => {
      const st = stateRef.current;
      const { w, h } = st.size;
      const P = propsRef.current;
      st.t += 1;
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';

      // ---- particles (very slow; only a little livelier while "Run" is active) ----
      const speed = P.running ? 1.15 : 0.55;
      const gridRight = w * 0.42;
      for (const p of st.particles) {
        p.x += p.vx * speed;
        p.y += p.vy * speed + Math.sin((st.t * 0.004) + p.ph) * 0.04;
        if (p.x > w + 4 || p.y < -4 || p.y > h + 4) Object.assign(p, spawn(w, h, gridRight), { x: gridRight * 0.2 });
        const tw = 0.75 + 0.15 * Math.sin(st.t * 0.012 + p.ph);
        ctx.beginPath();
        ctx.fillStyle = hexA(p.c, p.a * tw);
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // ---- entanglement beams ----
      if (P.showEntanglement) {
        const focal = { x: w * 0.99, y: h * 0.52 };
        const dash = (st.t * 0.9) % 26;
        // converging beams from the line-final cells
        P.finals.forEach((f, i) => {
          const a = st.centers[f.id];
          if (!a) return;
          const hue = f.slot === 'B' ? '#e7a540' : '#dfe3e8';   // B rhymes amber, A rhymes steel-white
          // brighter, steadier beams so links read over the background
          beam(ctx, a, focal, hue, dash * 0.4, 0.72 + 0.12 * Math.sin(st.t * 0.02 + i));
        });
        // short arcs between entangled same-word / rhyme pairs
        P.links.forEach((lk, i) => {
          const a = st.centers[lk.aId], b = st.centers[lk.bId];
          if (!a || !b) return;
          const hue = lk.type === 'contrast' ? '#ff4d3d' : '#ffd08a';   // contrast red, rhyme pale gold
          arc(ctx, a, b, hue, dash * 0.35 + i, 0.55);
        });
      }

      ctx.globalCompositeOperation = 'source-over';
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); window.removeEventListener('resize', measure); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none' }}
      aria-hidden="true"
    />
  );
}

// draw a glowing converging beam (quadratic, bowed outward)
function beam(ctx, a, b, color, dash, alpha) {
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2 - 40 - Math.abs(a.y - b.y) * 0.15;
  ctx.save();
  ctx.strokeStyle = hexA(color, alpha);
  ctx.lineWidth = 1.6;
  ctx.shadowColor = color; ctx.shadowBlur = 12;
  ctx.setLineDash([9, 8]); ctx.lineDashOffset = -dash;
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(mx, my, b.x, b.y); ctx.stroke();
  ctx.restore();
}

// draw a soft arc between two entangled cells
function arc(ctx, a, b, color, dash, alpha) {
  const mx = (a.x + b.x) / 2, my = Math.min(a.y, b.y) - 26;
  ctx.save();
  ctx.strokeStyle = hexA(color, alpha);
  ctx.lineWidth = 1.2;
  ctx.shadowColor = color; ctx.shadowBlur = 8;
  ctx.setLineDash([6, 7]); ctx.lineDashOffset = -dash;
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(mx, my, b.x, b.y); ctx.stroke();
  ctx.restore();
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${Math.max(0, Math.min(1, a))})`;
}
