import React, { useEffect, useState } from 'react';
import { subscribeHand, readHand } from '../../services/ghostCursor.js';
import { subscribeTeach, teachState } from '../../services/ghostTeach.js';
import ghostSprite from '../../assets/ghost-sprite.png';
import './GhostHand.css';

/**
 * THE GHOST, ON SCREEN, POINTING AT WHAT IT DOES.
 *
 * Chris, 2026-09-15: *"We need to bring back the actual ghost graphic and have
 * speech bubbles as it's moving and doing things across the screen."* On
 * 2026-08-27 the portrait was stripped for a plain pointer; this puts the art
 * back on his word.
 *
 * The art points with its right hand. Its fingertip is placed exactly on the
 * spot being pressed, so the Ghost is seen pointing at every control it uses,
 * and what it says floats in a bubble by its head.
 *
 * Two sources move it:
 *   - the drawn hand (services/ghostCursor.js) for chat and jobs;
 *   - the REAL mouse while a lesson plays (services/ghostTeach.js), so the
 *     Ghost rides the cursor that is replaying Chris's own path.
 *
 * Position moves by CSS transition, not requestAnimationFrame: Electron
 * throttles animation frames in a window it thinks is covered, and a Ghost
 * that freezes whenever OBS sits on top of Lyricist would ruin a take.
 *
 * pointer-events: none on everything here, or it would swallow the very
 * clicks the Ghost is making under it.
 */

// Where the fingertip is in the art, as a fraction of the square image.
const TIP_X = 0.885;
const TIP_Y = 0.55;
const SIZE = 150;

/**
 * NEVER UNDER THE TITLE BAR. Chris's recording: the Ghost flew to the tab row
 * and its head went up under the window's title bar, pointing at nothing you
 * could see. The fingertip still lands on the control, but the body turns
 * around it (tilting to reach up, or flipping to face the other way at the left
 * edge) until all of it is inside the window. Only if no turn fits does the
 * whole Ghost shift, which moves the fingertip a little off the control.
 *
 * The art's outline, in its own 320px square, from its opaque pixels.
 */
const OUTLINE = [[18, 204], [28, 156], [44, 84], [170, 44], [202, 38], [220, 40], [234, 48], [248, 72], [288, 176], [150, 254], [124, 266], [88, 274], [38, 274]];
const TURNS = [0, -15, 15, -30, 30, -45, 45, -60];
const EDGE = 4;

function fitOnScreen(x, y) {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const k = SIZE / 320;
  const rel = OUTLINE.map(([px, py]) => [(px - TIP_X * 320) * k, (py - TIP_Y * 320) * k]);
  // Facing left (the art) when there is room for the body on the left.
  const mirror = x + Math.min(...rel.map((p) => p[0])) < EDGE;
  let best = null;
  for (const deg of TURNS) {
    const r = (deg * Math.PI) / 180;
    const c = Math.cos(r);
    const s = Math.sin(r);
    const pts = rel.map(([px, py]) => {
      const mx = mirror ? -px : px;
      return [x + mx * c - py * s, y + mx * s + py * c];
    });
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const dx = Math.max(0, EDGE - Math.min(...xs)) - Math.max(0, Math.max(...xs) - (W - EDGE));
    const dy = Math.max(0, EDGE - Math.min(...ys)) - Math.max(0, Math.max(...ys) - (H - EDGE));
    const miss = Math.abs(dx) + Math.abs(dy);
    if (!best || miss < best.miss) best = { deg, mirror, dx, dy, miss };
    if (!miss) break;
  }
  return best;
}

export default function GhostHand() {
  const [s, setS] = useState(readHand);
  const [teach, setTeach] = useState(teachState);
  const [live, setLive] = useState(null);
  useEffect(() => subscribeHand(setS), []);
  useEffect(() => subscribeTeach(setTeach), []);

  // While a lesson plays, the real cursor is the Ghost's hand.
  const riding = Boolean(teach.playing);
  useEffect(() => {
    if (!riding) { setLive(null); return undefined; }
    const onMove = (e) => setLive({ x: e.clientX, y: e.clientY, down: e.buttons > 0 });
    window.addEventListener('pointermove', onMove, { capture: true, passive: true });
    window.addEventListener('pointerdown', onMove, { capture: true, passive: true });
    window.addEventListener('pointerup', onMove, { capture: true, passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove, { capture: true });
      window.removeEventListener('pointerdown', onMove, { capture: true });
      window.removeEventListener('pointerup', onMove, { capture: true });
    };
  }, [riding]);

  const x = riding && live ? live.x : s.x;
  const y = riding && live ? live.y : s.y;
  const pressed = riding && live ? live.down : s.pressed;
  const caption = s.caption;
  if (!(riding ? Boolean(live) : s.visible)) return null;

  const fit = fitOnScreen(x, y);
  const at = { transform: `translate3d(${x + fit.dx}px, ${y + fit.dy}px, 0)`, transitionDuration: `${riding ? 0 : s.dur}ms` };
  const turn = { transform: `rotate(${fit.deg}deg) scaleX(${fit.mirror ? -1 : 1})` };

  // The bubble sits above the Ghost's head and flips to stay on screen.
  const headX = -SIZE * (TIP_X - 0.7) * (fit.mirror ? -1 : 1);
  const headY = -SIZE * (TIP_Y - 0.2);
  const flipX = x < 330;
  const flipY = y < 190;

  return (
    <>
      <div
        className={`ghost-hand${pressed ? ' is-pressed' : ''}${s.typing ? ' is-typing' : ''}`}
        style={at}
        aria-hidden="true"
      >
        <img
          className="ghost-hand-art"
          src={ghostSprite}
          alt=""
          draggable="false"
          style={{ width: SIZE, height: SIZE, left: -SIZE * TIP_X, top: -SIZE * TIP_Y, ...turn }}
        />
      </div>

      {s.ring > 0 && !riding && (
        <span
          key={s.ring}
          className="ghost-hand-ring"
          style={{ transform: `translate3d(${x}px, ${y}px, 0)` }}
          aria-hidden="true"
        />
      )}

      {caption && (
        <div className="ghost-hand-caption" style={at} role="status" aria-live="polite">
          <div
            className={`ghost-hand-bubble${flipX ? ' is-right' : ''}${flipY ? ' is-below' : ''}`}
            style={{
              left: headX,
              top: headY,
              transform: `translate(${flipX ? '24px' : 'calc(-100% + 18px)'}, ${flipY ? `${SIZE * 0.55}px` : 'calc(-100% - 14px)'})`,
            }}
          >
            <span className="ghost-hand-name">Ghost</span>
            {caption}
          </div>
        </div>
      )}
    </>
  );
}
