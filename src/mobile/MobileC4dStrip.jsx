import React, { useEffect, useRef, useState } from 'react';
import c4dOrbit from '../assets/c4d/orbit.webm';
import c4dLyrics from '../assets/c4d/lyrics.webm';
import c4dMolten from '../assets/c4d/molten.webm';
import c4dOrbitMp4 from '../assets/c4d/orbit.mp4';
import c4dLyricsMp4 from '../assets/c4d/lyrics.mp4';
import c4dMoltenMp4 from '../assets/c4d/molten.mp4';

// The Cinema 4D renders, for the phone held sideways. The desktop banner is
// switched off on windows this short, so this is where a phone shows them: one
// strip at the top of the launcher, scrolling away with it.
// [mp4, webm]: Safari wants the mp4, and the browser takes the first it can play.
const CLIPS = [[c4dOrbitMp4, c4dOrbit], [c4dLyricsMp4, c4dLyrics], [c4dMoltenMp4, c4dMolten]];
const SWAP_MS = 14000;
const FADE_MS = 1200;
const LANDSCAPE = '(orientation: landscape) and (min-width: 640px)';
const REDUCED = '(prefers-reduced-motion: reduce)';

const matches = (q) => typeof window !== 'undefined' && !!window.matchMedia?.(q).matches;

export default function MobileC4dStrip({ active }) {
  const [landscape, setLandscape] = useState(() => matches(LANDSCAPE));
  const [idx, setIdx] = useState(0);
  const refs = useRef([]);

  useEffect(() => {
    const mq = window.matchMedia?.(LANDSCAPE);
    if (!mq) return undefined;
    const on = () => setLandscape(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  const running = landscape && active && !matches(REDUCED);

  useEffect(() => {
    if (!running) return undefined;
    const t = setInterval(() => setIdx((i) => (i + 1) % CLIPS.length), SWAP_MS);
    return () => clearInterval(t);
  }, [running]);

  useEffect(() => {
    const timers = [];
    refs.current.forEach((v, i) => {
      if (!v) return;
      if (running && i === idx) v.play().catch(() => {});
      else timers.push(setTimeout(() => v.pause(), FADE_MS + 100));
    });
    return () => timers.forEach(clearTimeout);
  }, [idx, running]);

  if (!landscape || matches(REDUCED)) return null;
  return (
    <div className="mob-c4d" aria-hidden="true">
      {CLIPS.map(([mp4, webm], i) => (
        <video
          key={webm}
          ref={(el) => { refs.current[i] = el; }}
          className="mob-c4d-v"
          data-on={i === idx}
          loop
          muted
          playsInline
          preload={i === 0 ? 'auto' : 'metadata'}
          tabIndex={-1}
        >
          <source src={mp4} type="video/mp4" />
          <source src={webm} type="video/webm" />
        </video>
      ))}
    </div>
  );
}
