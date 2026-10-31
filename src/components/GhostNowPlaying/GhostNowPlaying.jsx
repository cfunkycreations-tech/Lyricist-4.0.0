import React, { useEffect, useState } from 'react';
import { onNowPlaying, skipBed, setMusicVolume } from '../../services/ghostBed.js';
import './GhostNowPlaying.css';

/**
 * THE CREDIT UNDER THE GHOST'S MUSIC: "♪ Haunted Groove · Mr. Funk", plus skip
 * and a volume slider (remembered). Shows only while a titled song is sounding.
 * `controls={false}` keeps just the credit, for promo runs that get recorded.
 */
export default function GhostNowPlaying({ controls = true, className = '' }) {
  const [song, setSong] = useState(null);
  const [vol, setVol] = useState(1);
  useEffect(() => onNowPlaying((s, v) => { setSong(s); setVol(v); }), []);
  if (!song) return null;
  return (
    <div className={`gnp ${className}`} role="status" aria-live="polite">
      <span className="gnp-note" aria-hidden="true">♪</span>
      <span className="gnp-credit">
        <b>{song.title}</b>{song.by && <span className="gnp-by"> · {song.by}</span>}
      </span>
      {controls && (
        <>
          <button type="button" className="gnp-skip" onClick={() => skipBed()} aria-label="Next song" title="Next song">
            ⏭
          </button>
          <input
            type="range"
            className="gnp-vol"
            min="0"
            max="1"
            step="0.05"
            value={vol}
            onChange={(e) => setMusicVolume(e.target.value)}
            aria-label="Music volume"
            title="Music volume"
          />
        </>
      )}
    </div>
  );
}
