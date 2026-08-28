import React, { useState, useEffect } from 'react';
import { lookup } from '../services/RhymeService';

/**
 * LexiconInspector component
 * Rhyming dictionary & thesaurus for lyric writing.
 */
export default function LexiconInspector() {
  const [searchWord, setSearchWord] = useState('');
  const [activeTab, setActiveTab] = useState('Perfect Rhymes');

  const tabs = ['Perfect Rhymes', 'Slant/Near', 'Multi-Syllabic', 'Synonyms', 'Antonyms'];

  // Which Datamuse lookup each tab maps to.
  const TAB_KINDS = {
    'Perfect Rhymes': 'perfect',
    'Slant/Near': 'slant',
    'Multi-Syllabic': 'perfect',
    'Synonyms': 'synonym',
    'Antonyms': 'antonym'
  };

  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  // Real lookups, debounced. These results used to be five hardcoded lists
  // that ignored whatever was typed in the search box entirely.
  useEffect(() => {
    const word = searchWord.trim();
    if (!word) {
      setResults([]);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      const found = await lookup(word, TAB_KINDS[activeTab] || 'perfect', 24);
      if (cancelled) return;
      // The Multi-Syllabic tab is the rhyme list filtered to longer words.
      setResults(activeTab === 'Multi-Syllabic' ? found.filter(r => r.syllables >= 2) : found);
      setLoading(false);
    }, 280);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [searchWord, activeTab]);

  const [copied, setCopied] = useState('');

  /** Puts the word on the clipboard, ready to paste into a line. */
  const handleCopy = (word) => {
    navigator.clipboard.writeText(word);
    setCopied(word);
    setTimeout(() => setCopied(''), 1200);
  };

  return (
    <div style={{ padding: '16px', color: 'var(--gm-text)', fontFamily: 'Inter, sans-serif' }}>
      <h3 className="gm-panel-title">Lexicon Inspector</h3>
      <input
        type="text"
        placeholder="Search for words..."
        value={searchWord}
        onChange={e => setSearchWord(e.target.value)}
        style={{ width: '100%', padding: '9px 12px', marginBottom: '16px', background: 'var(--gm-bg-dark)', color: 'var(--gm-text)', border: '1px solid var(--gm-border)', boxSizing: 'border-box', borderRadius: '4px', fontSize: '12px', fontFamily: 'var(--gm-font-mono)', outline: 'none' }}
      />
      
      <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', flexWrap: 'wrap' }}>
        {tabs.map(tab => (
          <button 
            key={tab} 
            onClick={() => setActiveTab(tab)}
            style={{ 
              padding: '6px 10px', 
              fontSize: '11px', 
              fontWeight: 'bold',
              background: activeTab === tab ? 'var(--gm-accent-amber)' : 'var(--gm-bg-medium)',
              color: activeTab === tab ? '#1A1A1A' : 'var(--gm-text-muted)',
              border: `1px solid ${activeTab === tab ? 'var(--gm-accent-amber)' : 'var(--gm-border)'}`,
              boxShadow: activeTab === tab ? '0 0 10px rgba(255,176,32,0.35)' : 'none',
              cursor: 'pointer',
              borderRadius: '4px',
              transition: 'all 0.15s'
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {!searchWord.trim() && (
          <div style={{ fontSize: '11px', color: 'var(--gm-text-muted)', fontFamily: 'var(--gm-font-mono)' }}>
            Type a word above.
          </div>
        )}
        {loading && (
          <div style={{ fontSize: '11px', color: 'var(--gm-accent-amber)', fontFamily: 'var(--gm-font-mono)' }}>
            Looking up "{searchWord.trim()}"...
          </div>
        )}
        {!loading && searchWord.trim() && results.length === 0 && (
          <div style={{ fontSize: '11px', color: 'var(--gm-text-muted)', fontFamily: 'var(--gm-font-mono)', lineHeight: 1.5 }}>
            Nothing found for "{searchWord.trim()}". Check the spelling, or the connection if this keeps happening.
          </div>
        )}
        {results.map((res, idx) => (
          <div 
            key={idx} 
            style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              background: 'linear-gradient(180deg, #232329 0%, #1A1A1E 100%)',
              padding: '10px 14px',
              borderRadius: '4px',
              cursor: 'pointer',
              border: '1px solid var(--gm-border)',
              transition: 'all 0.15s'
            }}
            onClick={() => handleCopy(res.word)}
            onMouseOver={(e) => { e.currentTarget.style.borderColor = 'rgba(255,176,32,0.5)'; e.currentTarget.style.background = '#26262C'; }}
            onMouseOut={(e) => { e.currentTarget.style.borderColor = 'var(--gm-border)'; e.currentTarget.style.background = 'linear-gradient(180deg, #232329 0%, #1A1A1E 100%)'; }}
            title="Click to insert or copy"
          >
            <span style={{ fontSize: '14px', fontWeight: '500', color: copied === res.word ? 'var(--gm-accent-amber)' : 'var(--gm-text)' }}>
              {copied === res.word ? 'Copied' : res.word}
            </span>
            <span style={{
              fontSize: '10px',
              fontFamily: 'var(--gm-font-mono)',
              background: 'var(--gm-bg-dark)',
              padding: '4px 8px',
              borderRadius: '12px',
              color: 'var(--gm-accent-amber)',
              border: '1px solid var(--gm-border)'
            }}>
              {res.syllables} syl
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
