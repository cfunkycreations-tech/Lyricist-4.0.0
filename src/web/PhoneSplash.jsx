import React, { useEffect, useRef, useState } from 'react';
import logo from '../assets/brand-logo.webp';
import splashMp4 from '../assets/blackhole/phone-splash.mp4';
import splashPoster from '../assets/blackhole/phone-splash_poster.webp';
import './PhoneSplash.css';

/**
 * THE PHONE'S LAUNCH SPLASH — the opener and its soundtrack, every fresh open.
 *
 * Chris, 2026-10-21/22: "I want the splash screen for the phone app", then "I
 * didn't see the splash screen or hear the soundtrack that goes with it." It is
 * his Lyricist-Logo-Splash picture with the WHOLE SPLASHST track under it,
 * 15.4 s: the 8 s animation slowed (motion-interpolated) to end with the music
 * ("ADD THE WHOLE SOUND TRACK", "Slow the animation", 2026-10-23).
 * phone-splash.mp4, 1280x720 H.264 + AAC,
 * upright or sideways, over everything, the purchase-code screen included.
 * Sideways it is contained; upright it is scaled up so the title card fills
 * the width (all of it sits in the middle half of the frame).
 *
 * SOUND. A phone browser refuses audible autoplay until the first tap, so:
 *   - sound first; if refused, the picture runs muted and the whole screen
 *     becomes "Tap for sound";
 *   - if even a muted start is refused (iOS Low Power Mode does that), or the
 *     clip is slow to arrive, a big Play button waits for a tap. The splash is
 *     never skipped silently, which is how it went missing before.
 * Skip always leaves at once. Nothing else ends it before the last frame
 * ("it's not saying Austin, Texas, that's the end of the video", 2026-10-23).
 *
 * Shown again after five minutes away, not on a reload or the new-version
 * Reload bar. The installed app keeps sessionStorage while it sits in the
 * background, so a once-per-session flag meant it never came back.
 * Phone-shaped windows only, never inside Electron.
 */
const SEEN = 'lyricist.splash.seen';
const SHORT = '(max-height: 560px), (max-width: 560px)';
const AGAIN_MS = 5 * 60 * 1000;
const STALL_MS = 8000;
const CEILING_MS = 30000;
const FADE_MS = 460;

function shouldShow() {
  if (typeof window === 'undefined') return false;
  if (window.lyricistAPI) return false;
  if (!/^https?:$/.test(window.location.protocol)) return false;
  if (!window.matchMedia(SHORT).matches) return false;
  if (/[?&]nosplash\b/.test(window.location.search)) return false;
  try {
    const at = Number(sessionStorage.getItem(SEEN));
    if (at && Date.now() - at < AGAIN_MS) return false;
  } catch { /* private mode: just show it */ }
  return true;
}

export default function PhoneSplash() {
  const [show, setShow] = useState(shouldShow);
  const [fading, setFading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [silenced, setSilenced] = useState(false);   // picture runs, sound waits for a tap
  const [blocked, setBlocked] = useState(false);     // nothing runs until a tap
  const videoRef = useRef(null);
  const done = useRef(false);
  const ceiling = useRef(null);

  const finish = () => {
    if (done.current) return;
    done.current = true;
    clearTimeout(ceiling.current);
    try { sessionStorage.setItem(SEEN, String(Date.now())); } catch { /* ignore */ }
    setFading(true);
    setTimeout(() => setShow(false), FADE_MS);
  };

  useEffect(() => {
    if (!show) return undefined;
    const v = videoRef.current;
    let dead = false;
    if (v) {
      // React does not reliably reflect `muted` as an attribute.
      v.muted = false;
      v.playsInline = true;
      const quiet = () => {
        if (dead) return;
        v.muted = true;
        setSilenced(true);
        const p2 = v.play();
        if (p2 && p2.catch) p2.catch(() => { if (!dead) { setSilenced(false); setBlocked(true); } });
      };
      const p = v.play();
      if (p && p.catch) p.catch(quiet);
    }
    const stall = setTimeout(() => {
      const el = videoRef.current;
      if (!el || el.currentTime < 0.2) setBlocked(true);
    }, STALL_MS);
    // Only while nothing plays. Once it plays, onPlaying moves this to the end
    // of the clip, so a slow load or a late tap never cuts off the last card.
    ceiling.current = setTimeout(finish, CEILING_MS);
    return () => { dead = true; clearTimeout(stall); clearTimeout(ceiling.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show]);

  // The one tap that is allowed to start sound: start, or turn it on.
  const wake = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = false;
    setSilenced(false);
    setBlocked(false);
    const p = v.play();
    if (p && p.catch) p.catch(() => { v.muted = true; setSilenced(true); v.play?.().catch?.(() => setBlocked(true)); });
  };

  // A stray tap never ends it: only Skip does. It runs to the last frame.
  const onTap = () => { if (blocked || silenced) wake(); };

  const onPlaying = () => {
    setPlaying(true);
    setBlocked(false);
    const v = videoRef.current;
    const left = v && Number.isFinite(v.duration) ? v.duration - v.currentTime : 16;
    clearTimeout(ceiling.current);
    ceiling.current = setTimeout(finish, (left + 4) * 1000);
  };

  if (!show) return null;
  return (
    <div
      className={`phsplash${fading ? ' phsplash-gone' : ''}`}
      onClick={onTap}
      role="button"
      aria-label={blocked ? 'Play intro' : silenced ? 'Turn sound on' : 'Intro'}
    >
      <img className="phsplash-logo" src={logo} alt="" draggable="false" />
      <video
        ref={videoRef}
        className={`phsplash-video${playing || blocked ? ' phsplash-on' : ''}`}
        src={splashMp4}
        poster={splashPoster}
        playsInline
        autoPlay
        preload="auto"
        onPlaying={onPlaying}
        onEnded={finish}
        onError={() => setTimeout(finish, 1500)}
      />
      {blocked && (
        <button type="button" className="phsplash-play" onClick={(e) => { e.stopPropagation(); wake(); }}>
          Tap to play
        </button>
      )}
      {silenced && !blocked && <div className="phsplash-sound">Tap for sound</div>}
      <button type="button" className="phsplash-skip" onClick={(e) => { e.stopPropagation(); finish(); }}>
        Skip
      </button>
    </div>
  );
}
