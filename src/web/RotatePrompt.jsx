import React, { useEffect, useState } from 'react';
import { isLandscape, lockLandscape } from './orientation.js';
import './RotatePrompt.css';

/**
 * "TURN YOUR PHONE SIDEWAYS" — for the phones that cannot be turned for you.
 *
 * ============================================================================
 * THIS EXISTS BECAUSE OF iPHONE
 * ============================================================================
 * Lyricist runs locked to landscape. On an installed Android PWA that lock is
 * real: screen.orientation.lock('landscape') is honoured, the phone turns
 * itself, and nobody ever sees this component.
 *
 * iOS has never supported orientation locking — not the API, not the
 * Fullscreen API it depends on. So on an iPhone the lock silently refuses and
 * the user is left holding a 390-point-wide portrait window running a layout
 * built for 915. Every tool in the app is wider than the screen.
 *
 * The honest fix is to ask. One sentence, one picture, and it clears itself the
 * instant the phone is turned.
 *
 * IT IS NOT A WALL. There is a "Use it anyway" button, because being stuck on a
 * screen you cannot get past is worse than a cramped layout, and because some
 * people have their own rotation lock switched on and cannot turn the phone
 * even if they want to. Once dismissed it stays dismissed for the session.
 *
 * It renders ONLY when all of these are true:
 *   - this is the web build, not the desktop app
 *   - the window is phone-shaped
 *   - we are actually in portrait
 *   - and the automatic lock did not take
 * so it can never appear on Android, on desktop, or inside Electron.
 */

export default function RotatePrompt() {
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.lyricistAPI) return;                          // desktop app
    if (!/^https?:$/.test(window.location.protocol)) return; // file:// is Electron

    let dead = false;

    const evaluate = async () => {
      if (dead) return;
      // Phone-shaped: narrow, or short. Either counts, same test the shell uses.
      const phone = window.matchMedia('(max-width: 560px), (max-height: 560px)').matches;
      if (!phone || isLandscape()) { setShow(false); return; }
      // Portrait on a phone. Try to fix it ourselves first — on Android this
      // succeeds and nothing is ever shown.
      const locked = await lockLandscape();
      if (dead) return;
      setShow(!locked && !isLandscape());
    };

    evaluate();
    const mq = window.matchMedia('(orientation: portrait)');
    const onChange = () => evaluate();
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else if (mq.addListener) mq.addListener(onChange);
    window.addEventListener('resize', onChange);
    window.addEventListener('orientationchange', onChange);

    return () => {
      dead = true;
      if (mq.removeEventListener) mq.removeEventListener('change', onChange);
      else if (mq.removeListener) mq.removeListener(onChange);
      window.removeEventListener('resize', onChange);
      window.removeEventListener('orientationchange', onChange);
    };
  }, []);

  if (!show || dismissed) return null;

  return (
    <div className="rot-root" role="dialog" aria-label="Turn your phone sideways">
      <div className="rot-card">
        <div className="rot-phone" aria-hidden="true">
          <span className="rot-phone-body" />
          <span className="rot-arrow">⟳</span>
        </div>
        <h2 className="rot-title">Turn your phone sideways</h2>
        <p className="rot-copy">
          Lyricist is a studio. The piano roll, the mixer, the loop tracks and the
          lattice all need the width — sideways gives you more than double it.
        </p>
        <button className="rot-btn" onClick={() => setDismissed(true)}>
          Use it anyway
        </button>
        <p className="rot-note">
          On iPhone, check the rotation lock in Control Centre is off.
        </p>
      </div>
    </div>
  );
}
