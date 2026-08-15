import React from 'react';

// Bundled through Vite, exactly like the tabs that already worked
// (songwriter.mp4, thesaurus.mp4, dictionary.mp4 ...).
//
// These used to live in public/ and get built at runtime from
// `import.meta.env.BASE_URL + 'bg/x.mp4'`. That works in the dev server but the
// path does not resolve once the app is packaged into app.asar, so every one of
// these tabs rendered a black panel and no video. Importing them makes Vite emit
// the file and hand back a URL it has already resolved for the build — which is
// why the older tabs never had this problem.
import boothMp4 from '../../assets/bg/booth.mp4';
import collabMp4 from '../../assets/bg/collab.mp4';
import loopstationMp4 from '../../assets/bg/loopstation.mp4';
import masteringMp4 from '../../assets/bg/mastering.mp4';
import midistudioMp4 from '../../assets/bg/midistudio.mp4';
// NOTE: scratchpad.mp4 is deliberately NOT imported. The Scratchpad renders an
// opaque legal-pad yellow (#f8eea6) over its whole panel, so a clip behind it
// would never be seen — and Vite emits an imported asset whether or not anything
// renders it, so the registration alone was putting 16.7 MB into every
// installer. The file is still in src/assets/bg/ if that tab ever changes.
import songforgeMp4 from '../../assets/bg/songforge.mp4';
import stemmerMp4 from '../../assets/bg/stemmer.mp4';
import toolshubMp4 from '../../assets/bg/toolshub.mp4';

const CLIPS = {
  booth: boothMp4,
  collab: collabMp4,
  loopstation: loopstationMp4,
  mastering: masteringMp4,
  midistudio: midistudioMp4,
  songforge: songforgeMp4,
  stemmer: stemmerMp4,
  toolshub: toolshubMp4,
};

/**
 * Background video for a tab.
 *
 * Muted is not optional: every in-app video in Lyricist stays silent, and
 * browsers refuse to autoplay anything with sound anyway.
 *
 * The parent needs `position: relative` and a black background, and the tab's
 * real content needs to sit in a `zIndex: 1` wrapper above this — see
 * `.tab-video-shell` / `.tab-video-content` in index.css.
 */
export default function TabVideoBg({ name, opacity = 0.75, rate = 0.67 }) {
  const src = CLIPS[name];
  if (!src) {
    // Loud in dev, harmless in the build — better than a silently black tab,
    // which is exactly how the public/ version failed.
    if (import.meta.env.DEV) console.warn(`TabVideoBg: no clip registered for "${name}"`);
    return null;
  }
  return (
    <video
      src={src}
      autoPlay
      loop
      muted
      playsInline
      preload="auto"
      aria-hidden="true"
      onCanPlay={(e) => { e.target.playbackRate = rate; }}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        zIndex: 0,
        opacity,
        pointerEvents: 'none',
      }}
    />
  );
}
