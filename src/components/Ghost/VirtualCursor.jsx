import React, { useEffect, useState } from 'react';
import { subscribeCursor, readCursor } from '../../services/ghostPilot.js';
import './VirtualCursor.css';

/**
 * THE ON-SCREEN HARDWARE CURSOR. Internal marketing build only — see
 * GhostPilotLayer.jsx for the gate that keeps this out of the installer.
 *
 * WHY A DRAWN CURSOR AND NOT THE REAL ONE. The operating system pointer cannot
 * be moved from inside a web page, and a screen recorder captures it as a 12px
 * arrow that vanishes against dark UI. This one is drawn at whatever size reads
 * on video, glows in the app's own accent, and — critically — its position is
 * ours to animate, so the recording shows deliberate motion instead of the jump
 * cuts you get from a hand on a mouse.
 *
 * pointer-events: none is not optional. This element sits over the entire
 * application at z-index 100000; without it the cursor would eat every click in
 * the app, including the synthetic ones the executor is trying to deliver.
 *
 * The click ring is a sibling, not a child, and it is keyed by a counter. React
 * will not restart a CSS animation on an element it considers unchanged, so two
 * clicks in the same place would play one ring; a changing key forces a real
 * remount and a real second pulse.
 */
export default function VirtualCursor() {
  const [state, setState] = useState(readCursor);

  useEffect(() => subscribeCursor(setState), []);

  if (!state.visible) return null;

  return (
    <>
      <div
        className={`ghost-cursor ${state.pressed ? 'is-pressed' : ''} ${state.typing ? 'is-typing' : ''}`}
        style={{ transform: `translate3d(${state.x}px, ${state.y}px, 0)` }}
        aria-hidden="true"
      >
        <svg viewBox="0 0 24 24" width="30" height="30">
          {/* A pointer with a dark outline under a light fill, so it stays
              legible over both the obsidian chrome and a bright panel. */}
          <path
            d="M4 2 L4 19.5 L8.6 15.2 L11.4 21.6 L14.3 20.3 L11.6 14.2 L18 13.8 Z"
            fill="var(--accent-neon, #E7A540)"
            stroke="#08090b"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      {state.ring > 0 && (
        <span
          key={state.ring}
          className="ghost-cursor-ring"
          style={{ transform: `translate3d(${state.x}px, ${state.y}px, 0)` }}
          aria-hidden="true"
        />
      )}
    </>
  );
}
