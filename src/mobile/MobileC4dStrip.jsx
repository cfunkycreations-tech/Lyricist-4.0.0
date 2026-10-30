import React from 'react';
import AustinGL from '../components/BrandBanner/AustinGL.jsx';
import BannerMusicButton from '../components/BrandBanner/BannerMusicButton.jsx';

// The strip at the top of the phone's launcher, scrolling away with it. The
// desktop banner is switched off on a phone, so this is where the phone shows
// it: the animated Austin scenes, upright and sideways. Chris, 2026-10-30: the
// Cinema 4D renders (gold molten, lyrics, Black Hole orbit) that used to take
// turns with it when held sideways are gone. Kill them.
const REDUCED = '(prefers-reduced-motion: reduce)';
const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.(REDUCED).matches;

export default function MobileC4dStrip({ active }) {
  const reduced = reducedMotion();
  return (
    <div className="mob-c4d">
      <div className="mob-c4d-v mob-austin" data-on="true" data-run={active && !reduced}>
        <AustinGL on={active && !reduced} />
      </div>
      <BannerMusicButton className="bb-music-phone" />
    </div>
  );
}
