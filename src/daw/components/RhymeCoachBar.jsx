import React, { useState, useEffect } from 'react';
import './RhymeCoachBar.css';
import { rhymeSets } from '../services/RhymeService';

/**
 * RhymeCoachBar
 * Proactive suggestion bar for LyricForge. Analyzes the active word and provides categorised rhymes.
 * 
 * @param {Object} props
 * @param {string} props.activeWord - The currently selected or last typed word.
 * @param {function} props.onSelectRhyme - Callback when a rhyme chip is clicked.
 */
export default function RhymeCoachBar({ activeWord, onSelectRhyme }) {
  const [rhymes, setRhymes] = useState({ perfect: [], slant: [], multi: [] });

  useEffect(() => {
    const word = String(activeWord || '').trim();
    if (!word) {
      setRhymes({ perfect: [], slant: [], multi: [] });
      return undefined;
    }

    // Wait for a pause in typing before asking, so a whole line does not fire
    // a request per keystroke.
    let cancelled = false;
    const timer = setTimeout(async () => {
      const sets = await rhymeSets(word);
      if (!cancelled) setRhymes(sets);
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [activeWord]);

  if (!activeWord || activeWord.trim().length === 0) {
    return (
      <div className="rhyme-coach-bar empty">
        <span className="rcb-prompt">Type or select a word to see live rhyme suggestions...</span>
      </div>
    );
  }

  return (
    <div className="rhyme-coach-bar active">
      <div className="rcb-header">
        <span className="rcb-title">Rhyme Coach:</span>
        <span className="rcb-target">"{activeWord}"</span>
      </div>
      
      <div className="rcb-categories">
        {rhymes.perfect.length > 0 && (
          <div className="rcb-category">
            <span className="rcb-badge badge-perfect">Perfect</span>
            <div className="rcb-chips">
              {rhymes.perfect.map((r, i) => (
                <button key={`perf-${i}`} className="rcb-chip" onClick={() => onSelectRhyme(r)}>
                  {r}
                </button>
              ))}
            </div>
          </div>
        )}
        
        {rhymes.slant.length > 0 && (
          <div className="rcb-category">
            <span className="rcb-badge badge-slant">Slant</span>
            <div className="rcb-chips">
              {rhymes.slant.map((r, i) => (
                <button key={`slant-${i}`} className="rcb-chip" onClick={() => onSelectRhyme(r)}>
                  {r}
                </button>
              ))}
            </div>
          </div>
        )}

        {rhymes.multi.length > 0 && (
          <div className="rcb-category">
            <span className="rcb-badge badge-multi">Multi-Syllable</span>
            <div className="rcb-chips">
              {rhymes.multi.map((r, i) => (
                <button key={`multi-${i}`} className="rcb-chip" onClick={() => onSelectRhyme(r)}>
                  {r}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
