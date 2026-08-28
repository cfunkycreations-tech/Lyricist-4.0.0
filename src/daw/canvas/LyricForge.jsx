import React, { useState } from 'react';
import './LyricForge.css';
import { useDAW } from '../context/DAWContext';
import funkMatrixEngine from '../engine/FunkMatrixEngine';
import rhymeAnalyzer from '../engine/RhymeAnalyzer';
import RhymeHeatmap from './RhymeHeatmap';

/**
 * LyricForge Component
 * Professional two-column lyric songwriting studio connected to live DAWContext and Funk Matrix Engine.
 */
export default function LyricForge() {
  const {
    lyrics,
    updateLyricLine,
    addLyricSection,
    aiConfig
  } = useDAW();

  const [activeSectionId, setActiveSectionId] = useState(lyrics[1]?.id || lyrics[0]?.id || 'verse-1');
  const [activeContextMenu, setActiveContextMenu] = useState(null);
  const [loadingAction, setLoadingAction] = useState(null);

  const activeSection = lyrics.find(s => s.id === activeSectionId) || lyrics[0] || {
    id: 'sec-1', type: 'verse', energy: 6, bars: 16, lines: []
  };

  const { lines: analyzedLines, flowConsistency } = rhymeAnalyzer.analyzeLines(activeSection.lines || []);

  const handleLineChange = (lineId, text) => {
    updateLyricLine(activeSection.id, lineId, text);
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
      if (actionType === 'suggest-rhyme') {
        const words = line.text.trim().split(/\s+/);
        const lastWord = words[words.length - 1] || 'flow';
        const rhymes = await funkMatrixEngine.suggestRhymes(lastWord);
        const bestRhyme = rhymes.perfect[0] || 'glow';
        updateLyricLine(activeSection.id, line.id, `${line.text} (rhyme: ${bestRhyme})`);
      } else if (actionType === 'cadence') {
        const rewritten = await funkMatrixEngine.rewriteWithCadence(line.text, { name: 'Houston Slow Flow', speed: 'mid' });
        updateLyricLine(activeSection.id, line.id, rewritten);
      } else if (actionType === 'fill') {
        const filled = await funkMatrixEngine.fillInBlank(line.text, '', 'smooth');
        updateLyricLine(activeSection.id, line.id, filled);
      } else if (actionType === 'bridge') {
        const bridge = await funkMatrixEngine.generateBridge(lyrics, 'high energy');
        addLyricSection('bridge');
      }
    } catch (err) {
      console.warn('FunkMatrix error:', err.message);
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
        <div className="lyric-editor">
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
              ⚡ Funk Matrix Engine processing {loadingAction}...
            </div>
          )}
        </div>
      </div>

      <div className="lf-inspect-col" style={{ width: '300px', flexShrink: 0 }}>
        <RhymeHeatmap analyzedLines={analyzedLines} flowConsistency={flowConsistency} />
      </div>
    </div>
  );
}

