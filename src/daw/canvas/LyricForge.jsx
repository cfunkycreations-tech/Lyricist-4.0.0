import React, { useState } from 'react';
import './LyricForge.css';
import { useDAW } from '../context/DAWContext';
import { useLyricStore } from '../../context/LyricStore';
import { generateLineVariation, fillBlank, generateSection } from '../../services/AIService';
import { lookup } from '../services/RhymeService';
import rhymeAnalyzer from '../engine/RhymeAnalyzer';
import RhymeCoachBar from '../components/RhymeCoachBar';
import LyricMatrix from './LyricMatrix';

/**
 * LyricForge Component
 * Two-column lyric studio wired to DAWContext, the real rhyme service, and
 * AIService for generation.
 */
export default function LyricForge() {
  const {
    lyrics,
    updateLyricLine,
    writeSection,
    aiConfig,
    activeSectionId,
    setActiveSectionId
  } = useDAW();
  const store = useLyricStore();

  const [activeContextMenu, setActiveContextMenu] = useState(null);
  const [loadingAction, setLoadingAction] = useState(null);
  const [activeWord, setActiveWord] = useState('');
  const [focusedLineId, setFocusedLineId] = useState(null);
  const [rhymeChoices, setRhymeChoices] = useState(null);
  const [actionError, setActionError] = useState('');

  const activeSection = lyrics.find(s => s.id === activeSectionId) || lyrics[0] || {
    id: 'sec-1', type: 'verse', energy: 6, bars: 16, lines: []
  };

  const { lines: analyzedLines, flowConsistency } = rhymeAnalyzer.analyzeLines(activeSection.lines || []);

  // Median syllables-per-bar for the section. The cadence hairline is a
  // deviation from this, so it means something the syllable count alone does not.
  const medianDensity = (() => {
    const barsPerLine = Math.max(1, (activeSection.bars || 16) / Math.max(analyzedLines.length, 1));
    const d = analyzedLines.map(l => l.syllables / barsPerLine).sort((a, b) => a - b);
    if (!d.length) return 0;
    const mid = d.length >> 1;
    return d.length % 2 ? d[mid] : (d[mid - 1] + d[mid]) / 2;
  })();

  // The Matrix stands in only when the song has no words at all — not merely
  // when the selected section is blank, or clicking an empty Chorus would wipe
  // a finished verse off the screen.
  // A section full of blank lines is still an empty song, so test the text
  // rather than the line count.
  const songIsEmpty = lyrics.every(
    sec => !(sec.lines || []).some(l => String(l.text || '').trim())
  );

  /** "Verse 1" -> "V1", "Chorus" -> "C1", so the page reads like a lyric sheet. */
  const sectionCode = (() => {
    const type = String(activeSection.type || '');
    const num = (type.match(/\d+/) || [''])[0];
    const letter = type.trim().charAt(0).toUpperCase();
    return `${letter}${num || ''}: ${type}`;
  })();

  const handleLineChange = (lineId, text) => {
    updateLyricLine(activeSection.id, lineId, text);
    const words = text.trim().split(/\s+/);
    setActiveWord(words[words.length - 1] || '');
  };

  const handleSelectRhyme = (rhyme) => {
    if (!focusedLineId) return;
    const line = analyzedLines.find(l => l.id === focusedLineId);
    if (!line) return;
    const text = line.text;
    // Replace the last word with the selected rhyme
    const words = text.trim().split(/\s+/);
    if (words.length > 0) words.pop();
    words.push(rhyme);
    const newText = words.join(' ') + ' ';
    updateLyricLine(activeSection.id, focusedLineId, newText);
    setActiveWord(rhyme);
  };

  const handleContextMenu = (e, lineId) => {
    e.preventDefault();
    setActiveContextMenu(lineId);
  };

  const closeContextMenu = () => {
    setActiveContextMenu(null);
  };

  const handleContextAction = async (actionType, line) => {
    if (!aiConfig.enabled) {
      alert('Global AI Engine is disabled in Settings.');
      closeContextMenu();
      return;
    }

    setLoadingAction(actionType);
    try {
      // These used to call FunkMatrixEngine, whose every method returned a
      // hardcoded string after a fake delay. They go through AIService now,
      // which makes real model calls with the user's own key.
      const sectionContext = (activeSection.lines || []).map(l => l.text).join('\n');

      if (actionType === 'suggest-rhyme') {
        const words = line.text.trim().split(/\s+/);
        const lastWord = words[words.length - 1] || '';
        if (!lastWord) return;
        // Rhymes come from the dictionary service, not the model: it is
        // instant, free, and better at rhyming than a chat completion.
        const found = await lookup(lastWord, 'perfect', 10);
        const rhymeWords = (found.length ? found : await lookup(lastWord, 'slant', 10)).map(r => r.word);
        setRhymeChoices(rhymeWords.length ? { lineId: line.id, words: rhymeWords } : null);
        if (!rhymeWords.length) setActionError(`No rhymes found for "${lastWord}".`);
      } else if (actionType === 'cadence') {
        const rewritten = await generateLineVariation(line.text, sectionContext, store);
        if (rewritten) updateLyricLine(activeSection.id, line.id, rewritten);
      } else if (actionType === 'fill') {
        const filled = await fillBlank(sectionContext, store);
        if (filled) updateLyricLine(activeSection.id, line.id, filled.trim());
      } else if (actionType === 'bridge') {
        const bridgeText = await generateSection('Bridge', store,
          lyrics.map(s => ({ name: s.type, lines: s.lines || [] })));
        const bridgeLines = String(bridgeText).split('\n')
          .map(l => l.replace(/^\s*[\[(].*?[\])]\s*$/, '').trim())
          .filter(Boolean);
        if (bridgeLines.length) writeSection('Bridge', bridgeLines);
      }
    } catch (err) {
      const msg = String(err?.message || err);
      setActionError(/key/i.test(msg) ? 'Add your AI key in Settings first.' : msg);
      setTimeout(() => setActionError(''), 5000);
    } finally {
      setLoadingAction(null);
      closeContextMenu();
    }
  };

  return (
    <div className="lyric-page" onClick={closeContextMenu}>
      {songIsEmpty ? <LyricMatrix /> : (
        <>
          <RhymeCoachBar activeWord={activeWord} onSelectRhyme={handleSelectRhyme} />
          <p className="sec">
            <b>{sectionCode}</b><em>syl / bar</em>
          </p>

          {analyzedLines.map((line) => {
            const bars = Math.max(1, (activeSection.bars || 16) / Math.max(analyzedLines.length, 1));
            const density = line.syllables / bars;
            const dev = density - medianDensity;
            const over = Math.abs(dev) > 0.5;
            const span = Math.min(Math.abs(dev) / 2, 0.5) * 100;
            const left = dev >= 0 ? 50 : 50 - span;
            return (
              <div
                key={line.id}
                className={`ln${focusedLineId === line.id ? ' on' : ''}`}
                onContextMenu={(e) => handleContextMenu(e, line.id)}
                data-context-type="lyric"
                data-context-id={line.id}
              >
                <span className="gut">{line.syllables}</span>
                <span
                  className="rt"
                  style={{ color: line.rhymeColor || 'var(--faint)' }}
                  title="Rhyme scheme"
                >
                  {line.rhymeTag || '-'}
                </span>
                {/* Cadence, digital: syllables over bars, with the hairline
                    showing how far off the section median this line sits. */}
                <span className="cd" title="Syllables per bar">
                  <u className={over ? 'over' : ''}>{density.toFixed(1)}</u>
                  <s><i className={over ? 'over' : ''} style={{ left: `${left.toFixed(1)}%`, width: `${Math.max(span, 2).toFixed(1)}%` }} /></s>
                </span>
                <input
                  className="wd"
                  value={line.text}
                  onChange={(e) => handleLineChange(line.id, e.target.value)}
                  onFocus={(e) => {
                    setFocusedLineId(line.id);
                    const words = e.target.value.trim().split(/\s+/);
                    setActiveWord(words[words.length - 1] || '');
                  }}
                  placeholder="Write the line. Right click for AI actions."
                />

                {activeContextMenu === line.id && (
                  <div className="context-menu" onClick={(e) => e.stopPropagation()}>
                    <button className="context-btn" onClick={() => handleContextAction('suggest-rhyme', line)}>Suggest rhyme</button>
                    <button className="context-btn" onClick={() => handleContextAction('cadence', line)}>Rewrite with artist cadence</button>
                    <button className="context-btn" onClick={() => handleContextAction('fill', line)}>Fill the blank</button>
                    <button className="context-btn" onClick={() => handleContextAction('bridge', line)}>Generate bridge</button>
                  </div>
                )}
              </div>
            );
          })}

          {loadingAction && <div className="lyric-status">Working on {loadingAction}…</div>}

          {rhymeChoices && (
            <div className="lyric-rhyme-picker" onClick={(e) => e.stopPropagation()}>
              <span className="lrp-label">Swap last word</span>
              {rhymeChoices.words.map(w => (
                <button
                  key={w}
                  className="lrp-chip"
                  onClick={() => {
                    setFocusedLineId(rhymeChoices.lineId);
                    const target = analyzedLines.find(l => l.id === rhymeChoices.lineId);
                    if (target) {
                      const parts = target.text.trim().split(/\s+/);
                      parts.pop();
                      parts.push(w);
                      updateLyricLine(activeSection.id, rhymeChoices.lineId, parts.join(' '));
                    }
                    setRhymeChoices(null);
                  }}
                >
                  {w}
                </button>
              ))}
              <button className="lrp-close" onClick={() => setRhymeChoices(null)}>Close</button>
            </div>
          )}

          {actionError && <div className="lyric-action-error">{actionError}</div>}
        </>
      )}
    </div>
  );
}
