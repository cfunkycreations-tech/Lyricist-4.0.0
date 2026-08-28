import React, { useState, useEffect } from 'react';
import './RhymeCoachBar.css';

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
    if (!activeWord || activeWord.trim().length === 0) {
      setRhymes({ perfect: [], slant: [], multi: [] });
      return;
    }

    // Mock analysis based on activeWord
    const word = activeWord.toLowerCase().trim();
    
    // Some hardcoded fun for demo purposes, else generic
    let perfect = [`${word}er`, `${word}ing`, `re${word}`];
    let slant = [`${word}ah`, `${word}ish`, `un${word}`];
    let multi = [`${word}ation`, `${word}ology`, `super${word}`];

    if (word === 'fire') {
      perfect = ['desire', 'higher', 'wire'];
      slant = ['fighter', 'writer', 'rider'];
      multi = ['wildfire', 'inspire', 'empire'];
    } else if (word === 'flow') {
      perfect = ['glow', 'show', 'blow'];
      slant = ['cold', 'bold', 'soul'];
      multi = ['overflow', 'undertow', 'status quo'];
    }

    setRhymes({ perfect, slant, multi });
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
