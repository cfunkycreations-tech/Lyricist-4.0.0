import React, { useState } from 'react';
import { PROMO_RUNS, buildPromo } from './promoScripts.js';
import { TRENDING_ARTISTS } from '../services/trendingArtists.js';
import { primePhoneGhost } from './PhoneGhost.jsx';
import './PromoPicker.css';

/**
 * PICK A PROMO RUN. Long-press the Ghost button in the phone's bar (or open the
 * app with ?promo) to get here. Start the screen recording first, then tap a
 * run: the Ghost does the rest, for real, and tapping him stops it.
 *
 * The artist, topic and words are optional. Left empty they rotate, so every
 * recording is a different song. Starting has to happen inside this tap, or an
 * iPhone keeps his voice and the music silent (see primePhoneGhost).
 */
export default function PromoPicker({ onStart, onClose }) {
  const [artist, setArtist] = useState('');
  const [topic, setTopic] = useState('');
  const [words, setWords] = useState('');

  const start = (id) => {
    primePhoneGhost();
    const run = buildPromo(id, {
      artist,
      topic: topic.trim() ? topic : undefined,
      words,
    });
    if (run) onStart(run);
  };

  return (
    <div className="pp-root" role="dialog" aria-label="Promo runs">
      <div className="pp-card">
        <div className="pp-head">
          <span className="pp-title">Promo runs</span>
          <button type="button" className="pp-x" onClick={onClose} aria-label="Close">×</button>
        </div>
        <p className="pp-note">
          Start your screen recording, then tap a run. The Ghost makes a real song with your keys,
          waits for every result and scrolls through it. Tap the Ghost to stop.
        </p>

        <label className="pp-field">
          <span>Artist</span>
          <input value={artist} onChange={(e) => setArtist(e.target.value)}
                 placeholder={`Trending, rotates: ${TRENDING_ARTISTS.join(', ')}`} />
        </label>
        <label className="pp-field">
          <span>Topic</span>
          <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Rotates through a list" />
        </label>
        <label className="pp-field">
          <span>Words (Words to song)</span>
          <input value={words} onChange={(e) => setWords(e.target.value)} placeholder="Rotates through a few sets" />
        </label>

        <div className="pp-runs">
          {PROMO_RUNS.map((r) => (
            <button key={r.id} type="button" className="pp-run" onClick={() => start(r.id)} data-promo={r.id}>
              <span className="pp-run-head">
                <b>{r.title}</b>
                <span className="pp-min">{r.minutes} min</span>
              </span>
              <span className="pp-blurb">{r.blurb}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
