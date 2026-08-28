import React, { useState, useCallback, useMemo } from 'react';
import './LyricMatrix.css';
import { useDAW } from '../context/DAWContext';
import { useLyricStore } from '../../context/LyricStore';
import { generateSection } from '../../services/AIService';

/**
 * The Matrix heat ramp, kept identical to the Quantum Lab board so the two
 * read as the same instrument: deep midnight blue when cold, red at the top.
 */
const HEAT_RAMP = [
  [0.00, [10, 26, 90]],
  [0.18, [0, 190, 255]],
  [0.36, [16, 240, 160]],
  [0.52, [255, 214, 0]],
  [0.68, [255, 111, 0]],
  [0.84, [255, 40, 24]],
  [1.00, [255, 18, 18]]
];

/**
 * @param {number} e - Normalised heat, 0..1
 * @returns {string} Bare "r, g, b" components, so one value can feed several alphas.
 */
function heatColor(e) {
  const x = Math.max(0, Math.min(1, e));
  for (let i = 1; i < HEAT_RAMP.length; i++) {
    const [p1, c1] = HEAT_RAMP[i - 1];
    const [p2, c2] = HEAT_RAMP[i];
    if (x <= p2) {
      const t = (x - p1) / (p2 - p1 || 1);
      const mix = c1.map((v, k) => Math.round(v + (c2[k] - v) * t));
      return `${mix[0]}, ${mix[1]}, ${mix[2]}`;
    }
  }
  return '255, 18, 18';
}

const FALLBACK_WORDS = [
  'street', 'engine', 'midnight', 'concrete', 'smoke',
  'money', 'mirror', 'pressure', 'family', 'hunger',
  'city', 'silence', 'rain', 'promise', 'gold',
  'distance', 'weight', 'sunrise', 'ghost', 'home'
];

/** Splits a generated section into clean lyric lines. */
function toLines(text) {
  return String(text || '')
    .split('\n')
    .map(l => l.replace(/^\s*[\[(].*?[\])]\s*$/, '').trim())
    .filter(Boolean)
    .slice(0, 8);
}

/**
 * LyricMatrix — what the lyric window shows before a song exists.
 *
 * The Matrix board is the backdrop rather than a control panel: the tiles are
 * atmosphere, and there is exactly one button. Everything the old Quantum Lab
 * exposed (spotlight, generations, crystallise, the nine-suite drawer) runs
 * behind this or not at all.
 */
export default function LyricMatrix() {
  const { writeSection } = useDAW();
  const store = useLyricStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [stage, setStage] = useState('');

  // Seed the board from whatever the song is actually about, so the tiles are
  // the writer's own material rather than decoration.
  const tiles = useMemo(() => {
    const seed = [
      ...String(store?.topic || '').split(/[\s,]+/),
      ...String(store?.genre || '').split(/[\s,]+/),
      ...String(store?.mood || '').split(/[\s,]+/)
    ].map(w => w.trim().toLowerCase()).filter(w => w.length > 2);

    // The song's own words lead, then the stock pool fills the board out. A
    // short topic used to cycle three words across all twenty tiles.
    const pool = [...new Set(seed)];
    for (const w of FALLBACK_WORDS) {
      if (pool.length >= 20) break;
      if (!pool.includes(w)) pool.push(w);
    }
    const words = pool.slice(0, 20);
    // A fixed pseudo-random heat per position keeps the board still between
    // renders — Math.random() here would reshuffle the colours on every keypress.
    return words.map((text, i) => {
      const h = ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1;
      return { id: i, text, heat: h };
    });
  }, [store?.topic, store?.genre, store?.mood]);

  const handleWrite = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      setStage('Writing verse 1...');
      const v1 = await generateSection('Verse 1', store, []);
      const v1Lines = toLines(v1);
      if (!v1Lines.length) throw new Error('The writer came back empty. Try again.');
      writeSection('Verse 1', v1Lines);

      setStage('Writing verse 2...');
      const v2 = await generateSection('Verse 2', store, [{ name: 'Verse 1', lines: v1Lines.map(t => ({ text: t })) }]);
      const v2Lines = toLines(v2);
      if (v2Lines.length) writeSection('Verse 2', v2Lines);
    } catch (err) {
      const msg = String(err?.message || err);
      // The only failure worth spelling out is the missing key, because it is
      // the one the user can actually fix.
      setError(/key/i.test(msg)
        ? 'Add your AI key in Settings first, then hit the button again.'
        : msg);
    } finally {
      setBusy(false);
      setStage('');
    }
  }, [store, writeSection]);

  return (
    <div className="lyric-matrix">
      <div className="lm-board" aria-hidden="true">
        {tiles.map(tile => (
          <div
            key={tile.id}
            className="lm-tile"
            style={{
              '--tc': heatColor(tile.heat),
              '--glow': `${Math.round(8 + tile.heat * 26)}px`,
              animationDelay: `${(tile.id % 7) * 0.45}s`
            }}
          >
            {tile.text}
          </div>
        ))}
      </div>

      <div className="lm-cta">
        <h2 className="lm-title">Nothing written yet</h2>
        <p className="lm-sub">One button. You get two verses to start from.</p>

        <button className="lm-button" onClick={handleWrite} disabled={busy}>
          {busy ? (stage || 'Writing...') : 'Write Two Verses'}
        </button>

        {error && <div className="lm-error">{error}</div>}
      </div>
    </div>
  );
}
