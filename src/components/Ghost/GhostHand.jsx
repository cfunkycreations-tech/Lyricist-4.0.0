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

  const at = { transform: `translate3d(${x}px, ${y}px, 0)`, transitionDuration: `${riding ? 0 : s.dur}ms` };

  // The bubble sits above the Ghost's head and flips to stay on screen.
  const headX = -SIZE * (TIP_X - 0.7);
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
          style={{ width: SIZE, height: SIZE, left: -SIZE * TIP_X, top: -SIZE * TIP_Y }}
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
