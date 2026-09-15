import React, { useEffect, useState } from 'react';
import { subscribeHand, readHand } from '../../services/ghostCursor.js';
import './GhostHand.css';
import { Ghost } from 'lucide-react';

/**
 * THE GHOST'S HAND, DRAWN. Customer build, always mounted with the Ghost.
 *
 * Position comes from services/ghostCursor.js and moves by CSS transition, not
 * requestAnimationFrame: Electron throttles animation frames in a window it
 * thinks is covered, and a hand that freezes whenever OBS or another app sits
 * on top of Lyricist is the exact failure a recording cannot survive.
 *
 * pointer-events: none on everything here, or the hand would swallow the very
 * clicks the Ghost is making under it.
 */
export default function GhostHand() {
  const [s, setS] = useState(readHand);
  useEffect(() => subscribeHand(setS), []);

  if (!s.visible) return null;

  const at = { transform: `translate3d(${s.x}px, ${s.y}px, 0)`, transitionDuration: `${s.dur}ms` };
  // Keep the caption on screen: flip it left near the right edge, up near the bottom.
  const flipX = s.x > window.innerWidth - 340;
  const flipY = s.y > window.innerHeight - 140;

  return (
    <>
      <div
        className={`ghost-hand${s.pressed ? ' is-pressed' : ''}${s.typing ? ' is-typing' : ''}`}
        style={at}
        aria-hidden="true"
      >
        <svg viewBox="0 0 24 24" width="30" height="30">
          <path
            d="M4 2 L4 19.5 L8.6 15.2 L11.4 21.6 L14.3 20.3 L11.6 14.2 L18 13.8 Z"
            fill="#E9E2FF"
            stroke="#12081F"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
        </svg>
        <span className="ghost-hand-badge"><Ghost size={14} strokeWidth={1.75} /></span>
      </div>

      {s.ring > 0 && (
        <span
          key={s.ring}
          className="ghost-hand-ring"
          style={{ transform: `translate3d(${s.x}px, ${s.y}px, 0)` }}
          aria-hidden="true"
        />
      )}

      {s.caption && (
        <div className="ghost-hand-caption" style={at} role="status" aria-live="polite">
          <div
            className="ghost-hand-bubble"
            style={{
              transform: `translate(${flipX ? 'calc(-100% - 18px)' : '26px'}, ${flipY ? 'calc(-100% - 10px)' : '28px'})`,
            }}
          >
            {s.caption}
          </div>
        </div>
      )}
    </>
  );
}
