import React, { useEffect, useRef } from 'react';

/**
 * THE SLICER.
 *
 * The waveform with the beat grid drawn over it, so the chop is something you
 * look at instead of something you guess at. Click any slice to put a chop
 * where the pattern did not, or take one away where it did.
 *
 * Drawn on a canvas rather than as elements because a three minute track at
 * half-beat slices is close to a thousand of them, and a thousand divs is a
 * scroll you can feel.
 */
export default function WaveSlicer({
  peaks, duration, grid, manual, onToggle, height = 132,
}) {
  const ref = useRef(null);
  const boxRef = useRef(null);

  useEffect(() => {
    const cv = ref.current;
    const box = boxRef.current;
    if (!cv || !box || !peaks?.length) return undefined;

    const draw = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = box.clientWidth;
      const h = height;
      if (cv.width !== w * dpr || cv.height !== h * dpr) {
        cv.width = w * dpr; cv.height = h * dpr;
        cv.style.width = `${w}px`; cv.style.height = `${h}px`;
      }
      const g = cv.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);

      const css = getComputedStyle(document.documentElement);
      const emerald = css.getPropertyValue('--lx-emerald-lit').trim() || '#2BE8A0';
      const violet = css.getPropertyValue('--lx-violet').trim() || '#A97BFF';
      const magenta = css.getPropertyValue('--lx-magenta').trim() || '#E86BD8';

      const mid = h / 2;

      // ── the waveform ────────────────────────────────────────────────────
      g.beginPath();
      for (let x = 0; x < w; x += 1) {
        const p = peaks[Math.floor((x / w) * peaks.length)] || 0;
        const half = Math.max(0.6, p * (h * 0.44));
        g.moveTo(x + 0.5, mid - half);
        g.lineTo(x + 0.5, mid + half);
      }
      g.strokeStyle = 'rgba(160,190,230,0.42)';
      g.lineWidth = 1;
      g.stroke();

      if (!grid?.length || !duration) return;

      // ── the slices ──────────────────────────────────────────────────────
      // Positions come from the source timeline, which is what the grid
      // describes. A dragged slice can therefore sit BEFORE the one before it,
      // and that is correct: the record went backwards there.
      for (const s of grid) {
        const x = (s.src / duration) * w;
        const sw = Math.max(1, (s.len / duration) * w);

        if (s.chop) {
          g.fillStyle = 'rgba(43,232,160,0.16)';
          g.fillRect(x, 0, sw, h);
          g.fillStyle = emerald;
          g.fillRect(x, 0, Math.min(2, sw), h);
          // one tick per repeat, so a triple reads differently from a double
          for (let k = 1; k < (s.repeats || 2); k += 1) {
            g.fillRect(x + (sw / (s.repeats || 2)) * k, h - 9, 1, 9);
          }
        }
        if (s.drag) {
          g.fillStyle = 'rgba(232,107,216,0.22)';
          g.fillRect(x, 0, sw, h);
          g.strokeStyle = magenta;
          g.lineWidth = 1.5;
          g.beginPath();
          g.moveTo(x + sw, 8); g.lineTo(x + Math.max(0, sw - 7), 12); g.lineTo(x + sw, 16);
          g.stroke();
        }
        if (manual?.has(s.i)) {
          g.strokeStyle = violet;
          g.lineWidth = 1.5;
          g.strokeRect(x + 0.75, 1, Math.max(2, sw - 1.5), h - 2);
        }
      }

      // bar lines, faint, so you can count where you are
      g.strokeStyle = 'rgba(255,255,255,0.09)';
      g.lineWidth = 1;
      const perBar = Math.max(1, Math.round(4 / (grid[0]?.len ? grid[0].len / (grid[0].len) : 1)));
      grid.forEach((s, idx) => {
        if (idx % (perBar * 4) !== 0) return;
        const x = (s.src / duration) * w;
        g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke();
      });
    };

    draw();
    const ro = new ResizeObserver(() => requestAnimationFrame(draw));
    ro.observe(box);
    window.addEventListener('lyricist-prism', draw);
    return () => { ro.disconnect(); window.removeEventListener('lyricist-prism', draw); };
  }, [peaks, duration, grid, manual, height]);

  const click = (e) => {
    if (!grid?.length || !duration) return;
    const r = e.currentTarget.getBoundingClientRect();
    const t = ((e.clientX - r.left) / r.width) * duration;
    // Nearest slice by source position. Dragged sections overlap in time, so
    // "nearest" is the honest answer rather than a binary search.
    let best = grid[0];
    let bestD = Infinity;
    for (const s of grid) {
      const d = Math.abs(s.src + s.len / 2 - t);
      if (d < bestD) { bestD = d; best = s; }
    }
    onToggle?.(best.i);
  };

  return (
    <div className="slicer" ref={boxRef}>
      <canvas ref={ref} onClick={click} />
      <div className="slicer-key">
        <span><i className="k-chop" />chop</span>
        <span><i className="k-drag" />drag back</span>
        <span><i className="k-manual" />yours</span>
        <span className="slicer-hint">click a slice to add or remove a chop</span>
      </div>
    </div>
  );
}
