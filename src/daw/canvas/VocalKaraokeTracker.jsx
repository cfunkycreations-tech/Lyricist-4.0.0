import React, { useMemo } from 'react';
import './VocalKaraokeTracker.css';
import { useDAW } from '../context/DAWContext';
import vocalAlignEngine from '../engine/VocalAlignEngine';

/**
 * VocalKaraokeTracker Component
 * Timeline header tracker strip that displays the current singing line with glowing word-by-word highlights.
 */
export default function VocalKaraokeTracker() {
  const { transport, lyrics } = useDAW();
  const playhead = transport.playhead;

  const currentLyric = useMemo(() => {
    return vocalAlignEngine.getCurrentLyricAtBar(lyrics, playhead);
  }, [lyrics, playhead]);

  if (!currentLyric || !currentLyric.sectionName) {
    return (
      <div className="vocal-karaoke-tracker empty">
        <span className="karaoke-waiting">Waiting for Vocals...</span>
      </div>
    );
  }

  return (
    <div className="vocal-karaoke-tracker">
      <div className="karaoke-section-badge">
        [{currentLyric.sectionName.toUpperCase()}]
      </div>
      <div className="karaoke-line">
        {currentLyric.words.map((w, i) => {
          const isActive = i === currentLyric.activeWordIndex;
          const isPassed = i < currentLyric.activeWordIndex;
          
          let className = 'karaoke-word';
          if (isActive) className += ' active';
          if (isPassed) className += ' passed';
          
          return (
            <span key={i} className={className}>
              {w.word}
            </span>
          );
        })}
      </div>
    </div>
  );
}
