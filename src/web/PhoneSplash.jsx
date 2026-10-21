import React, { useEffect, useRef, useState } from 'react';
import logo from '../assets/brand-logo.webp';
import './PhoneSplash.css';

/**
 * THE PHONE'S LAUNCH SPLASH — his Grok title card, once per launch.
 *
 * Chris, 2026-10-21: "I want the splash screen for the phone app." It plays
 * public/splash.mp4 (25 s, no audio, so muted autoplay is allowed everywhere)
 * over everything, the purchase-code screen included, then fades out. Tap
 * anywhere, or the Skip pill, ends it at once. Never held:
 *   - no clip after 6 s (slow signal, Low Power Mode refusing autoplay) → the
 *     logo gets a short beat and the app opens anyway;
 *   - once per launch (sessionStorage), so the new-version Reload bar and a
 *     tab refresh do not replay 25 seconds.
 * Phone-shaped windows only, and never inside Electron. Contain, never cover:
 * his card is not cropped, upright or sideways.
 */
const SEEN = 'lyricist.splash.seen';
const SHORT = '(max-height: 560px), (max-width: 560px)';
const WAIT_MS = 6000;
const FADE_MS = 460;

function shouldShow() {
  if (typeof window === 'undefined') return false;
  if (window.lyricistAPI) return false;
  if (!/^https?:$/.test(window.location.protocol)) return false;
  if (!window.matchMedia(SHORT).matches) return false;
  if (/[?&]nosplash\b/.test(window.location.search)) return false;
  try { if (sessionStorage.getItem(SEEN)) return false; } catch { /* private mode: just show it */ }
  return true;
}

export default function PhoneSplash() {
  const [show, setShow] = useState(shouldShow);
  const [fading, setFading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const videoRef = useRef(null);
  const done = useRef(false);

  const finish = () => {
    if (done.current) return;
    done.current = true;
    try { sessionStorage.setItem(SEEN, '1'); } catch { /* ignore */ }
    setFading(true);
    setTimeout(() => setShow(false), FADE_MS);
  };

  useEffect(() => {
    if (!show) return undefined;
    const v = videoRef.current;
    if (v) {
      v.muted = true;
      const p = v.play();
      if (p && p.catch) p.catch(() => setTimeout(finish, 1800));
    }
    const t = setTimeout(() => { if (!videoRef.current || videoRef.current.currentTime < 0.2) finish(); }, WAIT_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show]);

  if (!show) return null;
  return (
    <div
      className={`phsplash${fading ? ' phsplash-gone' : ''}`}
      onClick={finish}
      role="button"
      aria-label="Skip intro"
    >
      <img className="phsplash-logo" src={logo} alt="" draggable="false" />
      <video
        ref={videoRef}
        className={`phsplash-video${playing ? ' phsplash-on' : ''}`}
        src={`${import.meta.env.BASE_URL || './'}splash.mp4`}
        muted
        playsInline
        autoPlay
        preload="auto"
        onPlaying={() => setPlaying(true)}
        onEnded={finish}
        onError={() => setTimeout(finish, 1500)}
      />
      <button type="button" className="phsplash-skip" onClick={(e) => { e.stopPropagation(); finish(); }}>
        Skip
      </button>
    </div>
  );
}
