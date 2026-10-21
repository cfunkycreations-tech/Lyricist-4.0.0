import React, { useCallback, useEffect, useRef, useState } from 'react';
import introMp4 from '../assets/blackhole/intro.mp4';
import introPoster from '../assets/blackhole/intro_poster.webp';
import './SplashIntro.css';

/**
 * THE OPENING ANIMATION.
 *
 * Eight seconds, built in Cinema 4D by scripts/logo_c4d.py (90 frames) and
 * scripts/splash_c4d.py (150 frames), rendered on the Standard engine and cut
 * together: the Lyricist Pro badge lands, a bar of light crosses it, it is
 * pulled into its own black hole, and the chrome title grows back out of the
 * same point. Both halves open and close on black, so it is one piece.
 *
 * WHERE IT PLAYS. The desktop app and a desktop browser always get it. On a
 * phone it plays only SIDEWAYS — Chris, 2026-10-21: "The animations will show
 * on the phone version when in landscape mode." The clip is 16:9, and letter-
 * boxing it into a 9:16 screen would leave the badge a strip in the middle
 * with black above and below; cropping it to fill would cut the LYRICIST PRO
 * arc off, which is the exact bug that had to be fixed in the render. So
 * upright phones skip it and go straight to the app.
 *
 * Once per launch, not once per version: it is mounted with the app and never
 * remounts, so switching tabs or coming back from the background does not
 * replay it.
 *
 * It can always be left early — tap, click, Escape, or the Skip button — and
 * anyone who has asked their system for less motion never sees it at all. An
 * opener you cannot escape is an opener people uninstall.
 */

const REDUCED_MOTION = typeof window !== 'undefined'
  && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Phone-shaped, the same test the mobile shell uses. */
function isPhone() {
  if (typeof window === 'undefined') return false;
  if (window.lyricistAPI) return false;                       // the desktop app
  if (!/^https?:$/.test(window.location.protocol)) return false;
  return window.matchMedia('(max-height: 560px), (max-width: 560px)').matches;
}

function isPortrait() {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia?.('(orientation: portrait)')?.matches) return true;
  return window.innerHeight > window.innerWidth;
}

function shouldPlay() {
  if (typeof window === 'undefined') return false;
  if (REDUCED_MOTION) return false;
  if (isPhone() && isPortrait()) return false;                // sideways only on a phone
  return true;
}

export default function SplashIntro() {
  const [show, setShow] = useState(shouldPlay);
  const [leaving, setLeaving] = useState(false);
  const timer = useRef(null);
  const video = useRef(null);

  const finish = useCallback(() => {
    if (timer.current) return;
    setLeaving(true);
    timer.current = setTimeout(() => setShow(false), 420);    // matches the CSS fade
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  useEffect(() => {
    if (!show) return undefined;
    const onKey = (e) => { if (e.key === 'Escape' || e.key === ' ') finish(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [show, finish]);

  useEffect(() => {
    if (!show) return undefined;
    const el = video.current;
    if (!el) return undefined;
    // Autoplay is allowed only while muted, and iOS additionally needs
    // playsInline or it takes the video fullscreen on its own. If the browser
    // still refuses, do not sit on a black screen - get out of the way.
    const p = el.play?.();
    if (p && typeof p.catch === 'function') p.catch(() => finish());
    // Belt and braces: if 'ended' never arrives (a decode failure, a tab
    // throttled in the background) the app must not stay behind a dead video.
    const bail = setTimeout(finish, 11000);
    return () => clearTimeout(bail);
  }, [show, finish]);

  if (!show) return null;

  return (
    <div
      className={`sintro${leaving ? ' is-leaving' : ''}`}
      onClick={finish}
      role="presentation"
    >
      <video
        ref={video}
        src={introMp4}
        poster={introPoster}
        muted
        autoPlay
        playsInline
        preload="auto"
        onEnded={finish}
        onError={finish}
      />
      <button
        type="button"
        className="sintro-skip"
        onClick={(e) => { e.stopPropagation(); finish(); }}
      >
        Skip
      </button>
    </div>
  );
}
