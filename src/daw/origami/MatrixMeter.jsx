import React, { useEffect, useRef } from 'react';
import { makeField, padField, scene } from './padEngine';
import audioGraph from '../engine/AudioGraph';

const COLS = 5;
const ROWS = 4;
const SEGS = COLS * ROWS;

/** Where a segment index sits in the DOM, which is row-major from the top. */
function domIndex(si) {
  return (ROWS - 1 - Math.floor(si / COLS)) * COLS + (si % COLS);
}

/** Zone by row: bottom two ice, third amber, top crimson. */
function zone(si) {
  const r = Math.floor(si / COLS);
  return r >= 3 ? 'cr' : r === 2 ? 'am' : 'ic';
}

/** -60..0 dB across 20 cells, with a 1.7 gamma so the board is not pinned high. */
function norm(db) {
  return Math.pow(Math.max(0, Math.min(1, (db + 60) / 60)), 1.7);
}

/**
 * The matrix meter: the 5x4 board, metering.
 *
 * Cells fill left to right, bottom row up, so the grid reads as a raster bar
 * graph across -60 dB to 0 with a white peak-hold cell. Levels come from the
 * audio graph's true-peak read — never from a timer. With the engine stopped
 * it stops metering entirely and runs the idle pad patterns instead, which is
 * why an idling board can be loud without ever lying about a level.
 *
 * @param {Object}  props
 * @param {boolean} props.playing  Whether the transport is running.
 * @param {number}  [props.seed]   Phase offset, so L and R do not lockstep.
 * @param {string}  [props.channel] 'L' or 'R'.
 */
export default function MatrixMeter({ playing, seed = 0, channel = 'L' }) {
  const gridRef = useRef(null);
  const cellsRef = useRef([]);
  const fieldRef = useRef(makeField(COLS, ROWS));
  const holdRef = useRef({ db: -Infinity, at: 0 });
  const playingRef = useRef(playing);

  useEffect(() => { playingRef.current = playing; }, [playing]);

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    cellsRef.current = Array.from(grid.querySelectorAll('i'));
    const cells = cellsRef.current;

    let raf = 0;
    const frame = (ms) => {
      const t = ms / 1000;

      if (playingRef.current) {
        grid.classList.remove('pads');
        const peaks = audioGraph.getMasterPeaks();
        const db = channel === 'R' ? peaks.right : peaks.left;
        const hold = holdRef.current;
        if (db >= hold.db || t - hold.at > 1.5) {
          hold.db = db;
          hold.at = t;
        }
        const lit = Math.round(norm(db) * SEGS);
        const hsi = Math.round(norm(hold.db) * SEGS) - 1;
        for (let si = 0; si < SEGS; si++) {
          const el = cells[domIndex(si)];
          el.style.background = '';
          el.style.borderColor = '';
          el.style.boxShadow = '';
          if (si === hsi && si >= lit) el.className = 'hd';
          else if (si < lit) el.className = zone(si);
          else el.className = '';
        }
      } else {
        grid.classList.add('pads');
        const f = fieldRef.current;
        // The wall owns the scene clock. 'signature' is a wordmark and means
        // nothing on a 5x4 board, so that one segment falls back to aurora.
        padField(f, t, scene.mode === 'signature' ? 'aurora' : scene.mode, seed);
        for (let i = 0; i < f.n; i++) {
          const a = Math.max(0, Math.min(1, f.A[i]));
          const el = cells[i];
          el.className = '';
          if (a < 0.015) {
            el.style.background = '';
            el.style.borderColor = '';
            el.style.boxShadow = '';
          } else {
            // Outline first, wash second — same rule as the pad wall, so a
            // 5x4 board and a 60x23 board are visibly the same instrument.
            const h = ((f.H[i] % 360) + 360) % 360;
            el.style.background = `hsla(${h.toFixed(0)},96%,56%,${(a * 0.20).toFixed(3)})`;
            el.style.borderColor = `hsla(${h.toFixed(0)},98%,${(58 + a * 20).toFixed(0)}%,${(0.22 + a * 0.78).toFixed(3)})`;
            el.style.boxShadow =
              `0 0 ${(4 + a * 14).toFixed(1)}px hsla(${h.toFixed(0)},100%,62%,${(a * 0.7).toFixed(2)})`;
          }
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [channel, seed]);

  return (
    <div className="lensbox">
      <div className="grid" ref={gridRef} role="img" aria-label={`Master ${channel} level`}>
        {Array.from({ length: SEGS }, (_, i) => <i key={i} />)}
      </div>
      <div className="lens" />
    </div>
  );
}
