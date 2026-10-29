import React, { useEffect, useState } from 'react';
import { musicState, subscribeMusic, toggleMusic, skipMusic } from './bannerMusic.js';

/** The banner's music switch: a note to start, a note with a bar to stop, a skip while it plays. */
export default function BannerMusicButton({ className = '' }) {
  const [s, setS] = useState(musicState);
  useEffect(() => subscribeMusic(setS), []);
  if (!s.available) return null;
  return (
    <span className={`bb-music ${className}`}>
      {s.playing && (
        <button type="button" className="bb-music-btn" onClick={(e) => { e.stopPropagation(); skipMusic(); }} aria-label="Next song" title="Next song">
          ›
        </button>
      )}
      <button
        type="button"
        className={`bb-music-btn${s.playing ? ' is-on' : ''}`}
        onClick={(e) => { e.stopPropagation(); toggleMusic(); }}
        aria-label={s.playing ? `Music on: ${s.title}. Turn off` : 'Turn banner music on'}
        title={s.playing ? `Now playing: ${s.title}` : 'Banner music'}
        data-help="Optional music for the banner: seven tracks, played one after another with a fade between. Off until you turn it on."
      >
        {s.playing ? '♪ ' + s.title : '♪'}
      </button>
    </span>
  );
}
