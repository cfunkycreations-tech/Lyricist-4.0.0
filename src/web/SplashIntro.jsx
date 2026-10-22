import React, { useCallback, useEffect, useRef, useState } from 'react';
import introMp4 from '../assets/blackhole/intro.mp4';
import introPoster from '../assets/blackhole/intro_poster.webp';
import './SplashIntro.css';

/**
 * THE OPENING ANIMATION.
 *
 * 15.4 seconds with Chris's splash track under it. The picture is Cinema 4D:
 * scripts/logo_c4d.py for the first 90 frames and scripts/splash_c4d.py for
 * the next 373, rendered on the Standard engine and cut together. The badge
 * lands, a bar of light crosses it, it is pulled into its own black hole, and
 * the chrome title grows back out of the same point. The splash half runs long
 * so the picture ends exactly with the music: 463 frames at 30 fps against a
 * 15.418 s track, nothing trimmed off either.
 *
 * WHERE IT PLAYS. The desktop app and a desktop browser always get it. A phone
 * gets the same clip and the same track from PhoneSplash.jsx, upright or
 * sideways, so this one stays out of its way: two copies of the opener on top
 * of each other would be two soundtracks.
 *
 * SOUND. The desktop app plays it out loud: main.js sets autoplayPolicy to
 * no-user-gesture-required, because the window only exists because somebody
 * launched the app. A browser is different — it refuses to autoplay anything
 * audible until the visitor has interacted with the page, and a rejected
 * play() would leave the whole opener dead. So the audible attempt comes
 * first, and if the browser says no the clip restarts muted and offers sound
 * as a button. The animation always runs; only the sound is ever in question.
 *
 * Once per launch, not once per version: mounted with the app and never
 * remounted, so switching tabs or coming back from the background does not
 * replay it.
 *
 * It can always be left early — tap, click, Escape, space, or Skip — and
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

function shouldPlay() {
  if (typeof window === 'undefined') return false;
  if (REDUCED_MOTION) return false;
  if (isPhone()) return false;                                // PhoneSplash plays it there
  return true;
}

export default function SplashIntro() {
  const [show, setShow] = useState(shouldPlay);
  const [leaving, setLeaving] = useState(false);
  const [silenced, setSilenced] = useState(false);            // browser refused the sound
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

    let dead = false;
    // React does not reliably reflect `muted` as an attribute, and iOS needs
    // playsInline or it takes the video fullscreen on its own.
    el.muted = false;
    el.playsInline = true;

    const audible = el.play?.();
    if (audible && typeof audible.catch === 'function') {
      audible.catch(() => {
        // Not allowed to make noise yet. Keep the picture, drop the sound,
        // and let them ask for it.
        if (dead) return;
        el.muted = true;
        setSilenced(true);
        const quiet = el.play?.();
        if (quiet && typeof quiet.catch === 'function') quiet.catch(() => finish());
      });
    }

    // Belt and braces: if 'ended' never arrives (a decode failure, a tab
    // throttled in the background) the app must not stay behind a dead video.
    const bail = setTimeout(finish, 19000);
    return () => { dead = true; clearTimeout(bail); };
  }, [show, finish]);

  const unmute = useCallback((e) => {
    e.stopPropagation();
    const el = video.current;
    if (!el) return;
    el.muted = false;
    setSilenced(false);
    el.play?.();
  }, []);

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
        autoPlay
        playsInline
        preload="auto"
        onEnded={finish}
        onError={finish}
      />
      {silenced && (
        <button type="button" className="sintro-sound" onClick={unmute}>
          Tap for sound
        </button>
      )}
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
