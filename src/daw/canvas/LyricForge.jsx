import React, { useState } from 'react';
import './LyricForge.css';
import { useDAW } from '../context/DAWContext';
import { useLyricStore } from '../../context/LyricStore';
import { generateLineVariation, fillBlank, generateSection } from '../../services/AIService';
import { lookup } from '../services/RhymeService';
import rhymeAnalyzer from '../engine/RhymeAnalyzer';
import RhymeHeatmap from './RhymeHeatmap';
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
    addLyricSection,
    writeSection,
    aiConfig
  } = useDAW();
  const store = useLyricStore();

  const [activeSectionId, setActiveSectionId] = useState(lyrics[1]?.id || lyrics[0]?.id || 'verse-1');
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
    <div className="lyric-forge" onClick={closeContextMenu}>
      <div className="lf-left-col">
        <div className="lf-header">Song Structure Sequence</div>
        <div className="structure-list">
          {lyrics.map(sec => {
            const isSelected = sec.id === activeSection.id;
            return (
              <div 
                key={sec.id} 
                className={`structure-item ${isSelected ? 'selected' : ''}`}
                onClick={(e) => { e.stopPropagation(); setActiveSectionId(sec.id); }}
                style={{
                  borderColor: isSelected ? 'var(--gm-led-ice, #F0F8FF)' : 'var(--gm-border-dark, #333)',
                  cursor: 'pointer'
                }}
              >
                <h4>
                  <span style={{ textTransform: 'capitalize' }}>{sec.type}</span>
                  <span className="bars"> [{sec.bars || 16} bars]</span>
                </h4>
                <div className="energy-curve">
                  <div 
                    className="energy-fill" 
                    style={{ 
                      width: `${(sec.energy || 5) * 10}%`,
                      background: sec.energy >= 8 ? 'var(--gm-led-crimson, #E63946)' : sec.energy >= 6 ? 'var(--gm-led-amber, #FF9900)' : 'var(--gm-led-ice, #F0F8FF)'
                    }}
                  />
                </div>
                <div className="stats">Lines: {sec.lines ? sec.lines.length : 0} | Energy: {sec.energy || 5}/10</div>
              </div>
            );
          })}
          <button 
            className="btn-add-section" 
            onClick={(e) => { e.stopPropagation(); addLyricSection('verse'); }}
          >
            + Add Section
          </button>
        </div>
      </div>
      
      <div className="lf-right-col">
        <div className="lf-header">
          Precision Lyric Line Editor (<span style={{ textTransform: 'capitalize' }}>{activeSection.type}</span>)
        </div>
        {/* No words anywhere yet: the Matrix takes the window instead of an
            empty scroll area, and offers the one button that starts the song. */}
        {songIsEmpty ? <LyricMatrix /> : (
        <>
        <RhymeCoachBar activeWord={activeWord} onSelectRhyme={handleSelectRhyme} />
        <div className="lyric-editor">
          <span className="lyric-section-code">{sectionCode}</span>
          {analyzedLines.map((line, idx) => (
            <div 
              key={line.id} 
              className="lyric-line" 
              onContextMenu={(e) => handleContextMenu(e, line.id)}
              data-context-type="lyric"
              data-context-id={line.id}
            >
              <div className="syl-pill" title="Syllable Count">{line.syllables}</div>
              <div 
                className="rhyme-tag" 
                title="Rhyme Scheme Tag"
                style={{ backgroundColor: line.rhymeColor, color: line.rhymeTag ? '#111' : 'inherit' }}
              >
                {line.rhymeTag || '-'}
              </div>
              <div className="cadence-meter" title="Cadence Rhythm Grid">
                {[1, 2, 3, 4].map(c => (
                  <div 
                    key={c} 
                    className={`cadence-dot ${(line.syllables + c) % 2 === 0 ? 'active' : ''}`}
                  />
                ))}
              </div>
              <input 
                className="lyric-input" 
                value={line.text}
                onChange={(e) => handleLineChange(line.id, e.target.value)}
                onFocus={(e) => {
                  setFocusedLineId(line.id);
                  const words = e.target.value.trim().split(/\s+/);
                  setActiveWord(words[words.length - 1] || '');
                }}
                placeholder="Type your lyric line here (right click for AI context actions)..."
              />
              
              {activeContextMenu === line.id && (
                <div className="context-menu" onClick={(e) => e.stopPropagation()}>
                  <button className="context-btn" onClick={() => handleContextAction('suggest-rhyme', line)}>
                    ✨ Suggest Rhyme
                  </button>
                  <button className="context-btn" onClick={() => handleContextAction('cadence', line)}>
                    🎤 Rewrite with Artist Cadence
                  </button>
                  <button className="context-btn" onClick={() => handleContextAction('fill', line)}>
                    📝 Fill the Blank
                  </button>
                  <button className="context-btn" onClick={() => handleContextAction('bridge', line)}>
                    🌉 Generate Bridge
                  </button>
                </div>
              )}
            </div>
          ))}
          {loadingAction && (
            <div style={{ fontSize: '11px', color: 'var(--gm-led-amber, #FF9900)', marginTop: '8px', paddingLeft: '8px' }}>
              ⚡ Working on {loadingAction}...
            </div>
          )}

          {/* Rhymes for the line that was right-clicked. Clicking one swaps
              the line's last word for it. */}
          {rhymeChoices && (
            <div className="lyric-rhyme-picker" onClick={(e) => e.stopPropagation()}>
              <span className="lrp-label">Swap last word:</span>
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
              <button className="lrp-close" onClick={() => setRhymeChoices(null)}>✕</button>
            </div>
          )}

          {actionError && (
            <div className="lyric-action-error">{actionError}</div>
          )}
        </div>
        </>
        )}
      </div>

      <div className="lf-inspect-col" style={{ width: '300px', flexShrink: 0 }}>
        <RhymeHeatmap analyzedLines={analyzedLines} flowConsistency={flowConsistency} />
      </div>
    </div>
  );
}

