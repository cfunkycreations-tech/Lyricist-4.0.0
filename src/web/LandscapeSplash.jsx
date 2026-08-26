import React, { useEffect, useRef, useState } from 'react';
import { lockLandscape, isLandscape } from './orientation.js';
import './LandscapeSplash.css';

/**
 * THE BOOT SPLASH FOR THE INSTALLED ANDROID APP.
 *
 * It plays HIS TITLE VIDEO, splash.mp4, the same 25 second opener the desktop
 * app has always used. That clip is the first thing anyone sees of Lyricist and
 * it is not something to replace with a logo.
 *
 * Then, because the app runs locked to landscape and a phone gets picked up
 * upright, the whole frame squishes, blurs and turns a quarter turn into
 * landscape, so the rotation reads as deliberate instead of the app snapping
 * sideways on its own.
 *
 * MUTED, AND THAT IS NOT A CHOICE. Every browser blocks audio autoplay until
 * the user has interacted with the page, so an unmuted splash would simply
 * refuse to start and someone would stare at a black screen. Desktop keeps the
 * voice-over; on the web the clip plays silent.
 *
 * RENDERS ON THE WEB ONLY, guarded on window.lyricistAPI, so it can never
 * appear in front of the desktop app's own splash window.
 *
 * IT ALWAYS GOES AWAY. Hard timers dismiss it whether the video loads, stalls,
 * fails to decode, or never fires an event at all. A splash that can stick is
 * worse than no splash.
 */

const MAX_MS = 30000;   // absolute ceiling, matches the desktop splash cap

export default function LandscapeSplash() {
  const [alive, setAlive] = useState(() => typeof window !== 'undefined' && !window.lyricistAPI);
  const [phase, setPhase] = useState('play');   // play -> turn -> gone
  const timers = useRef([]);
  const videoRef = useRef(null);

  useEffect(() => {
    if (!alive) return;

    const later = (fn, ms) => { timers.current.push(setTimeout(fn, ms)); };
    let done = false;

    const finish = () => {
      if (done) return;
      done = true;
      setPhase('gone');
      later(() => setAlive(false), 480);
    };

    /* The turn happens at the END of the clip, not over it, so his title video
       is never covered by an effect. */
    const startTurn = async () => {
      const upright = !isLandscape();
      const locked = await lockLandscape();
      // Only animate a rotation that is really about to happen. Claiming one
      // that is not would be a lie the user can see.
      if (upright && locked) {
        setPhase('turn');
        later(finish, 1050);
      } else {
        finish();
      }
    };

    const v = videoRef.current;
    if (v) {
      v.addEventListener('ended', startTurn, { once: true });
      // A decode failure or a blocked play must not strand anyone on a black
      // screen: go straight to the turn.
      v.addEventListener('error', startTurn, { once: true });
      const p = v.play();
      if (p && p.catch) p.catch(startTurn);
    } else {
      startTurn();
    }

    // THE BACKSTOP. Whatever happened above, this is gone by 30 seconds.
    later(finish, MAX_MS);

    return () => { timers.current.forEach(clearTimeout); timers.current = []; };
  }, [alive]);

  if (!alive) return null;

  return (
    <div className={`lsplash lsplash-${phase}`} role="presentation" aria-hidden="true">
      <div className="lsplash-plane">
        <video
          ref={videoRef}
          className="lsplash-video"
          src="./splash.mp4"
          muted
          playsInline
          preload="auto"
        />
      </div>
      {phase === 'turn' && <div className="lsplash-hint">Turning sideways…</div>}
      <button
        className="lsplash-skip"
        onClick={() => { const v = videoRef.current; if (v) { try { v.pause(); } catch {} v.dispatchEvent(new Event('ended')); } }}
      >
        Skip
      </button>
    </div>
  );
}
