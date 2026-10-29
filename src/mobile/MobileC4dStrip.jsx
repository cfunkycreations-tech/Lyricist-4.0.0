import React, { useEffect, useRef, useState } from 'react';
import c4dOrbit from '../assets/c4d/orbit.webm';
import c4dLyrics from '../assets/c4d/lyrics.webm';
import c4dMolten from '../assets/c4d/molten.webm';
import c4dOrbitMp4 from '../assets/c4d/orbit.mp4';
import c4dLyricsMp4 from '../assets/c4d/lyrics.mp4';
import c4dMoltenMp4 from '../assets/c4d/molten.mp4';
import AustinGL from '../components/BrandBanner/AustinGL.jsx';
import BannerMusicButton from '../components/BrandBanner/BannerMusicButton.jsx';

// The strip at the top of the phone's launcher, scrolling away with it. The
// desktop banner is switched off on a phone, so this is where the phone shows
// it. Chris, 2026-10-28: his six Austin Ghost pictures, upright and sideways,
// gliding across like the desktop banner. Held sideways it also takes turns
// with the Cinema 4D renders.
// [mp4, webm]: Safari wants the mp4, and the browser takes the first it can play.
const CLIPS = [[c4dOrbitMp4, c4dOrbit], [c4dLyricsMp4, c4dLyrics], [c4dMoltenMp4, c4dMolten]];
const SWAP_MS = 14000;
const FADE_MS = 1200;
const LANDSCAPE = '(orientation: landscape) and (min-width: 640px)';
const REDUCED = '(prefers-reduced-motion: reduce)';

const matches = (q) => typeof window !== 'undefined' && !!window.matchMedia?.(q).matches;

export default function MobileC4dStrip({ active }) {
  const [landscape, setLandscape] = useState(() => matches(LANDSCAPE));
  // 0 is the Austin pictures; 1..3 are the clips, sideways only.
  const [idx, setIdx] = useState(0);
  const refs = useRef([]);
  const reduced = matches(REDUCED);

  useEffect(() => {
    const mq = window.matchMedia?.(LANDSCAPE);
    if (!mq) return undefined;
    const on = () => setLandscape(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  const rotating = landscape && active && !reduced;
  const slide = rotating ? idx : 0;

  useEffect(() => {
    if (!rotating) return undefined;
    const t = setInterval(() => setIdx((i) => (i + 1) % (CLIPS.length + 1)), SWAP_MS);
    return () => clearInterval(t);
  }, [rotating]);

  useEffect(() => {
    const timers = [];
    refs.current.forEach((v, i) => {
      if (!v) return;
      if (rotating && i + 1 === slide) v.play().catch(() => {});
      else timers.push(setTimeout(() => v.pause(), FADE_MS + 100));
    });
    return () => timers.forEach(clearTimeout);
  }, [slide, rotating]);

  return (
    <div className="mob-c4d">
      <div className="mob-c4d-v mob-austin" data-on={slide === 0} data-run={active && !reduced}>
        <AustinGL on={slide === 0 && active && !reduced} />
      </div>
      <BannerMusicButton className="bb-music-phone" />
      {landscape && !reduced && CLIPS.map(([mp4, webm], i) => (
        <video
          key={webm}
          ref={(el) => { refs.current[i] = el; }}
          className="mob-c4d-v"
          data-on={i + 1 === slide}
          loop
          muted
          playsInline
          preload="metadata"
          tabIndex={-1}
        >
          <source src={mp4} type="video/mp4" />
          <source src={webm} type="video/webm" />
        </video>
      ))}
    </div>
  );
}
