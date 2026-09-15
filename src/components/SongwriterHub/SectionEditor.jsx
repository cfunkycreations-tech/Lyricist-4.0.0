import React, { useState } from 'react';
import { useLyricStore } from '../../context/LyricStore.jsx';
import { countLineSyllables, calculateReadability, calculateVocabRichness, getLastWord } from '../../utils/textAnalysis.js';
import { refineLyrics, generateLineVariation, generateAdLibs, generateSection } from '../../services/AIService.js';
import { Lock, Unlock, Sparkles, Trash2, RefreshCw, Volume2, Type, ArrowUp, ArrowDown, HelpCircle, Check, Copy, Megaphone } from 'lucide-react';
import { Icon } from '../common/Glyph.jsx';

const sectionStyles = {
  intro: { border: '1px solid rgba(99, 102, 241, 0.45)', bg: 'rgba(99, 102, 241, 0.04)', glow: 'rgba(99, 102, 241, 0.2)', pill: 'pill-purple' },
  verse: { border: '1px solid rgba(139, 92, 246, 0.45)', bg: 'rgba(139, 92, 246, 0.04)', glow: 'rgba(139, 92, 246, 0.2)', pill: 'pill-purple' },
  'pre-chorus': { border: '1px solid rgba(236, 72, 153, 0.45)', bg: 'rgba(236, 72, 153, 0.04)', glow: 'rgba(236, 72, 153, 0.2)', pill: 'pill-red' },
  chorus: { border: '1px solid rgba(6, 182, 212, 0.45)', bg: 'rgba(6, 182, 212, 0.04)', glow: 'rgba(6, 182, 212, 0.2)', pill: 'pill-cyan' },
  bridge: { border: '1px solid rgba(217, 70, 239, 0.45)', bg: 'rgba(217, 70, 239, 0.04)', glow: 'rgba(217, 70, 239, 0.2)', pill: 'pill-purple' },
  outro: { border: '1px solid rgba(100, 116, 139, 0.45)', bg: 'rgba(100, 116, 139, 0.04)', glow: 'rgba(100, 116, 139, 0.2)', pill: 'pill-green' },
  freestyle: { border: '1px solid rgba(168, 85, 247, 0.45)', bg: 'rgba(168, 85, 247, 0.04)', glow: 'rgba(168, 85, 247, 0.2)', pill: 'pill-purple' }
};

export default function SectionEditor({ section, index }) {
  const store = useLyricStore();
  const [isGenerating, setIsGenerating] = useState(false);
  const [lineGeneratingIndex, setLineGeneratingIndex] = useState(null);
  const [showStats, setShowStats] = useState(false);
  const [copied, setCopied] = useState(false);

  const style = sectionStyles[section.type] || sectionStyles.verse;

  // Calculate readability and vocab live — always the real line text only
  const sectionText = section.lines.map((l) => l.text || '').join('\n');
  const readability = calculateReadability(sectionText);
  const vocabRichness = calculateVocabRichness(sectionText);

  const handleLineTextChange = (lineIndex, newText) => {
    // Always edit the real line — no ghost variants underneath
    store.updateLine(section.id, lineIndex, {
      text: newText,
      activeVariation: 'draft',
      variations: { draft: newText, A: '', B: '', C: '' },
    });
  };

  const handleLockToggle = (lineIndex) => {
    const line = section.lines[lineIndex];
    const locked = !line.locked;
    const lockedWord = locked ? getLastWord(line.text || '') : '';
    
    store.updateLine(section.id, lineIndex, {
      locked,
      lockedWord
    });
  };

  const handleTargetSyllablesChange = (lineIndex, val) => {
    store.updateLine(section.id, lineIndex, {
      targetSyllables: parseInt(val) || 0
    });
  };

  /** Replace a line in place — ONE string only. Never keep old text as a variant. */
  const replaceLine = (lineIndex, newText) => {
    // Force single physical line (AI sometimes returns 2 lines: old + new)
    let cleaned = String(newText || '').replace(/\r/g, '').trim();
    const parts = cleaned.split('\n').map((l) => l.trim()).filter(Boolean);
    if (parts.length > 1) {
      const orig = String(section.lines[lineIndex]?.text || '').trim().toLowerCase();
      const different = parts.filter((l) => l.toLowerCase() !== orig);
      cleaned = (different[different.length - 1] || parts[parts.length - 1] || '').trim();
    }
    // Nuclear replace via full section write so no stale variation fields linger
    const allLines = section.lines.map((l, i) => {
      const text = i === lineIndex ? cleaned : String(l.text || '');
      return {
        text,
        locked: l.locked || false,
        lockedWord: l.lockedWord || '',
        targetSyllables: l.targetSyllables || 0,
        activeVariation: 'draft',
        variations: { draft: text, A: '', B: '', C: '' },
      };
    });
    const updated = store.lyrics.map((s) =>
      s.id === section.id ? { ...s, lines: allLines } : s
    );
    store.setFullLyrics(updated);
  };

  const handleRegenerateLine = async (lineIndex) => {
    if (!store.config.openRouterApiKey) {
      alert('Set your API key in Settings.');
      return;
    }
    setLineGeneratingIndex(lineIndex);
    try {
      const line = section.lines[lineIndex];
      const current = line.text || '';
      const surroundingContext = section.lines
        .map((l, idx) => {
          const t = l.text || '';
          if (idx === lineIndex) return `[TARGET: ${t}]`;
          return t;
        })
        .join('\n');

      const val = await generateLineVariation(current, surroundingContext, store);
      replaceLine(lineIndex, val);
    } catch (e) {
      alert(`Regeneration failed: ${e.message}`);
    } finally {
      setLineGeneratingIndex(null);
    }
  };

  const handleRefineLine = async (lineIndex, mode) => {
    if (!store.config.openRouterApiKey) {
      alert('Set your API key in Settings.');
      return;
    }
    setLineGeneratingIndex(lineIndex);
    try {
      const line = section.lines[lineIndex];
      const currentText = line.text || '';
      const val = await refineLyrics(currentText, mode, store);
      replaceLine(lineIndex, val);
    } catch (e) {
      alert(e.message);
    } finally {
      setLineGeneratingIndex(null);
    }
  };

  const handleRegenerateSection = async () => {
    if (!store.config.openRouterApiKey) {
      alert('Set your API key in Settings.');
      return;
    }
    setIsGenerating(true);
    try {
      // Find all prior sections up to this one for context
      const sectionIdx = store.lyrics.findIndex(s => s.id === section.id);
      const priorSections = store.lyrics.slice(0, sectionIdx);

      const newText = await generateSection(section.type, store, priorSections);
      store.updateSectionLyrics(section.id, newText);
    } catch (e) {
      alert(e.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRefineSection = async (mode) => {
    if (!store.config.openRouterApiKey) {
      alert('Set your API key in Settings.');
      return;
    }
    setIsGenerating(true);
    try {
      const refinedText = await refineLyrics(sectionText, mode, store);
      // Full section replace — same line count as before, no stacked old+new
      const origCount = section.lines.length;
      let lines = String(refinedText || '')
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      if (lines.length > origCount) lines = lines.slice(0, origCount);
      while (lines.length < origCount) lines.push('');
      const newLines = lines.map((text, i) => {
        const existing = section.lines[i] || {};
        return {
          text,
          locked: existing.locked || false,
          lockedWord: existing.lockedWord || '',
          targetSyllables: existing.targetSyllables || 0,
          activeVariation: 'draft',
          variations: { draft: text, A: '', B: '', C: '' },
        };
      });
      const updated = store.lyrics.map((s) =>
        s.id === section.id ? { ...s, lines: newLines, showAdLibs: false, adLibs: '' } : s
      );
      store.setFullLyrics(updated);
    } catch (e) {
      alert(e.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateAdLibs = async () => {
    if (!store.config.openRouterApiKey) {
      alert('Set your API key in Settings.');
      return;
    }
    setIsGenerating(true);
    try {
      const adLibsText = await generateAdLibs(sectionText, store);
      store.updateSectionMeta(section.id, {
        adLibs: adLibsText,
        showAdLibs: true
      });
    } catch (e) {
      alert(e.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopySection = () => {
    navigator.clipboard.writeText(sectionText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="card-cosmic"
      style={{
        border: style.border,
        background: style.bg,
        boxShadow: `0 4px 20px ${style.glow}`,
        borderRadius: 12,
        padding: '16px 20px',
        marginBottom: 20,
        position: 'relative'
      }}
    >
      {/* Section Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            style={{ fontSize: '0.8rem', fontWeight: 800 }}
            className={`px-3 py-1 rounded-full ${style.pill}`}
            data-help="This is one section (part) of your song — like a Verse or a Chorus. Each section is edited on its own card. The colored name tells you which part it is."
          >
            {section.name}
          </span>
          <span
            style={{ fontSize: '0.75rem', color: 'rgba(167, 139, 250, 0.5)' }}
            data-help="How many lines are in this section right now."
          >
            {section.lines.length} lines
          </span>
        </div>

        {/* Section Actions */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={() => setShowStats(!showStats)}
            data-help="Show or hide the numbers about this section — like reading level, word variety, and average syllables per line. Click to peek; they're just helpful info, not rules."
            style={{ background: 'transparent', border: 'none', color: 'rgba(167,139,250,0.6)', cursor: 'pointer' }}
          >
            <HelpCircle size={16} />
          </button>

          <button
            onClick={handleCopySection}
            data-help="Copies just this one section's lyrics as text, so you can paste it somewhere else."
            style={{
              padding: '4px 8px',
              fontSize: '0.72rem',
              borderRadius: 6,
              background: 'rgba(13,8,28,0.7)',
              border: '1px solid rgba(139,92,246,0.22)',
              color: copied ? '#34d399' : '#c4b5fd',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4
            }}
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? 'Copied' : 'Copy'}
          </button>

          {/* Refine Dropdown */}
          <select
            onChange={(e) => {
              if (e.target.value) {
                if (e.target.value === 'ad-lib') handleGenerateAdLibs();
                else handleRefineSection(e.target.value);
                e.target.value = '';
              }
            }}
            data-help="Rewrite this whole section in place. Punch Up = bolder. Simpler = plainer. Elevate = richer words. Ad-libs = background shouts. Lines are replaced — use Undo at the top of the workspace if you want the old section back."
            style={{
              padding: '4px 8px',
              fontSize: '0.72rem',
              borderRadius: 6,
              background: 'rgba(13,8,28,0.7)',
              border: '1px solid rgba(139,92,246,0.22)',
              color: '#c4b5fd',
              cursor: 'pointer'
            }}
          >
            <option value="">Refine Section...</option>
            <option value="punch-up">Punch Up (bolder, catchier)</option>
            <option value="simplify">Make it Simpler</option>
            <option value="elevate">Fancier Words</option>
            <option value="ad-lib">Add Ad-Libs (background shouts)</option>
          </select>

          <button
            onClick={handleRegenerateSection}
            disabled={isGenerating}
            data-help="Regen = regenerate. Throws out this section's lyrics and has the AI write a brand-new version of just this part. Use it if you don't like what's here. (Undo brings the old one back.)"
            style={{
              padding: '4px 8px',
              fontSize: '0.72rem',
              borderRadius: 6,
              background: 'rgba(139,92,246,0.2)',
              border: '1px solid rgba(139,92,246,0.4)',
              color: '#fff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4
            }}
          >
            <RefreshCw size={12} className={isGenerating ? 'animate-spin' : ''} />
            {isGenerating ? 'Writing...' : 'Regen'}
          </button>

          <button
            onClick={() => store.removeSection(section.id)}
            data-help="Deletes this entire section from your song. Changed your mind? The Undo button up top brings it back."
            style={{ background: 'transparent', border: 'none', color: '#f87171', cursor: 'pointer' }}
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {/* Stats Display */}
      {showStats && (
        <div
          style={{
            background: 'rgba(13, 8, 28, 0.8)',
            borderRadius: 8,
            border: '1px solid rgba(139,92,246,0.18)',
            padding: '10px 14px',
            marginBottom: 12,
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '0.74rem'
          }}
        >
          <div data-help="Roughly what school grade level the words read at. Lower = simpler and easier to follow; higher = more complex. There's no 'right' number — it's just a feel for how plain or fancy your words are.">
            <span style={{ color: 'rgba(167,139,250,0.5)' }}>Reading Level:</span>{' '}
            <strong style={{ color: '#e8e0ff' }}>{readability}</strong>
          </div>
          <div data-help="Word variety — how often you use different words instead of repeating the same ones. A higher percent means more variety. (TTR is the technical name: 'type-token ratio.') Repeating words on purpose is totally fine in songs, so don't chase this number.">
            <span style={{ color: 'rgba(167,139,250,0.5)' }}>Word Variety:</span>{' '}
            <strong style={{ color: '#c084fc' }}>{vocabRichness}%</strong>
          </div>
          <div data-help="The average number of syllables per line in this section. Syllables are the beats in a word (for example, 'mu-sic' has 2). Lines with similar syllable counts tend to flow more evenly when sung or rapped.">
            <span style={{ color: 'rgba(167,139,250,0.5)' }}>Average Syllables:</span>{' '}
            <strong style={{ color: '#22d3ee' }}>
              {(
                section.lines.reduce((acc, l) => acc + countLineSyllables(l.text || ''), 0) /
                (section.lines.length || 1)
              ).toFixed(1)}
            </strong>
          </div>
        </div>
      )}

      {/* Section Lines — one row, one string, no underlay, no A/B ghost */}
      <div className="songwriter-lines" data-demo="sw-lines" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {section.lines.map((line, lIdx) => {
          const activeText = String(line?.text ?? '').split('\n')[0] ?? '';
          const sylCount = countLineSyllables(activeText);

          return (
            <div
              key={`${section.id}-line-${lIdx}`}
              className="lyric-line-row"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '6px 8px',
                borderRadius: 6,
                background: 'rgba(0,0,0,0.2)',
                minHeight: 36,
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {/* Syllable target & Count */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '90px', flexShrink: 0 }}>
                <span
                  style={{
                    fontSize: '0.62rem',
                    fontFamily: "'JetBrains Mono', monospace",
                    padding: '2px 5px',
                    borderRadius: 4,
                    background: line.targetSyllables > 0 && sylCount !== line.targetSyllables ? 'rgba(239, 68, 68, 0.15)' : 'rgba(139, 92, 246, 0.12)',
                    color: line.targetSyllables > 0 && sylCount !== line.targetSyllables ? '#f87171' : '#c4b5fd',
                    border: line.targetSyllables > 0 && sylCount !== line.targetSyllables ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid transparent'
                  }}
                  data-help="The number of syllables in this line right now (syllables are the beats in a word, like 'mu-sic' = 2). It updates live as you type. Turns red if it doesn't match a target you set."
                >
                  {sylCount}
                </span>

                <input
                  type="number"
                  placeholder="--"
                  value={line.targetSyllables || ''}
                  onChange={(e) => handleTargetSyllablesChange(lIdx, e.target.value)}
                  data-help="Optional: type a goal number of syllables for this line. The counter on the left turns red until the line matches it — handy for keeping lines the same length so they sing evenly. Leave blank to ignore."
                  style={{
                    width: '32px',
                    background: 'transparent',
                    border: 'none',
                    borderBottom: '1px dashed rgba(167,139,250,0.3)',
                    color: 'rgba(232,121,249,0.8)',
                    fontSize: '0.65rem',
                    textAlign: 'center',
                    outline: 'none',
                    fontFamily: "'JetBrains Mono', monospace",
                    textShadow: 'none',
                  }}
                />
              </div>

              {/* Single line field — solid text only, zero shadow / zero underlay */}
              <div style={{ flex: 1, padding: '0 10px', display: 'flex', alignItems: 'center', minWidth: 0, position: 'relative', isolation: 'isolate' }}>
                <input
                  type="text"
                  className="lyric-line-input"
                  value={activeText}
                  onChange={(e) => handleLineTextChange(lIdx, e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  data-help="This is one line of your song. Click in and type to edit. Refine / regenerate replaces this line in place — use Undo at the top of the workspace if you want the old wording back."
                  style={{
                    width: '100%',
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    fontSize: '0.85rem',
                    color: '#e8eef8',
                    WebkitTextFillColor: '#e8eef8',
                    fontFamily: "'Audiowide', 'Orbitron', sans-serif",
                    textShadow: 'none',
                    filter: 'none',
                    WebkitTextStroke: '0',
                    boxShadow: 'none',
                    caretColor: '#00e5ff',
                  }}
                />
              </div>

              {/* Hover actions */}
              <div className="hover-line-actions" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {/* Lock Word */}
                <button
                  onClick={() => handleLockToggle(lIdx)}
                  data-help={line.locked ? `LOCK WORD is ON. The last word of this line ("${line.lockedWord}") is protected — when the AI rewrites the line, it keeps this end word so your rhyme stays intact. Click to unlock.` : "LOCK WORD: click to protect the LAST word of this line. Then if the AI rewrites the line, it keeps that ending word so your rhyme doesn't break."}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: line.locked ? '#34d399' : 'rgba(167,139,250,0.4)',
                    cursor: 'pointer'
                  }}
                >
                  {line.locked ? <Lock size={12} /> : <Unlock size={12} />}
                </button>

                {/* Line Refiners — replaces the line; Undo at top of workspace */}
                <select
                  onChange={(e) => {
                    if (e.target.value) {
                      handleRefineLine(lIdx, e.target.value);
                      e.target.value = '';
                    }
                  }}
                  disabled={lineGeneratingIndex === lIdx}
                  data-help="Rewrite THIS line in place (Harder / Simpler / Elevate). The old line is replaced — no ghost copy underneath. Hit Undo at the top of the workspace if you want it back."
                  style={{
                    background: 'rgba(13,8,28,0.9)',
                    border: '1px solid rgba(139,92,246,0.3)',
                    borderRadius: 4,
                    color: '#c4b5fd',
                    fontSize: '0.62rem',
                    cursor: 'pointer',
                    padding: '2px 4px'
                  }}
                >
                  <option value="">{lineGeneratingIndex === lIdx ? 'Working…' : 'Refine…'}</option>
                  <option value="punch-up">Harder</option>
                  <option value="simplify">Simpler</option>
                  <option value="elevate">Elevate</option>
                </select>

                {/* Regenerate single line — also replaces in place */}
                <button
                  onClick={() => handleRegenerateLine(lIdx)}
                  disabled={lineGeneratingIndex === lIdx}
                  data-help="Fresh take on this one line. Replaces the line completely. Use Undo at the top if you don't like it."
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#22d3ee',
                    cursor: lineGeneratingIndex === lIdx ? 'wait' : 'pointer',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                >
                  <RefreshCw size={12} className={lineGeneratingIndex === lIdx ? 'animate-spin' : ''} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Ad Lib Layer Display */}
      {section.showAdLibs && section.adLibs && (
        <div
          style={{
            marginTop: 12,
            padding: '10px 14px',
            borderRadius: 8,
            background: 'rgba(124, 58, 237, 0.05)',
            border: '1px dashed rgba(124, 58, 237, 0.3)',
            fontSize: '0.8rem',
            color: '#e879f9',
            fontStyle: 'italic',
            lineHeight: 1.8
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span
              style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(232, 121, 249, 0.7)' }}
              data-help="Ad-libs are the little background vocals between or under the main lines — shouts and reactions like 'yeah!', 'uh!', or 'come on!' that add energy. These are AI suggestions you can use or ignore."
            >
              <Icon i={Megaphone} />Vocal Ad-Lib layer
            </span>
            <button
              onClick={() => store.updateSectionMeta(section.id, { showAdLibs: false })}
              style={{ background: 'transparent', border: 'none', color: 'rgba(167,139,250,0.5)', cursor: 'pointer', fontSize: '0.65rem' }}
            >
              Hide
            </button>
          </div>
          <pre style={{ fontFamily: 'inherit', margin: 0, whiteSpace: 'pre-wrap' }}>{section.adLibs}</pre>
        </div>
      )}
    </div>
  );
}
