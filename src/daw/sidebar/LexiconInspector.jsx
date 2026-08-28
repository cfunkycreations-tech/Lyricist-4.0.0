import React, { useState } from 'react';

/**
 * LexiconInspector component
 * Rhyming dictionary & thesaurus for lyric writing.
 */
export default function LexiconInspector() {
  const [searchWord, setSearchWord] = useState('');
  const [activeTab, setActiveTab] = useState('Perfect Rhymes');

  const tabs = ['Perfect Rhymes', 'Slant/Near', 'Multi-Syllabic', 'Synonyms', 'Antonyms'];

  const mockResults = {
    'Perfect Rhymes': [{ word: 'time', syllables: 1 }, { word: 'chime', syllables: 1 }, { word: 'sublime', syllables: 2 }],
    'Slant/Near': [{ word: 'mind', syllables: 1 }, { word: 'fine', syllables: 1 }, { word: 'shine', syllables: 1 }],
    'Multi-Syllabic': [{ word: 'lemon lime', syllables: 3 }, { word: 'paradigm', syllables: 3 }],
    'Synonyms': [{ word: 'rhythm', syllables: 2 }, { word: 'meter', syllables: 2 }, { word: 'beat', syllables: 1 }],
    'Antonyms': [{ word: 'silence', syllables: 2 }]
  };

  const handleCopy = (word) => {
    // In a real app this might copy to clipboard or insert to active line
    console.log(`Action: Copied / Inserted '${word}'`);
  };

  return (
    <div style={{ padding: '16px', color: 'var(--gm-text)', fontFamily: 'Inter, sans-serif' }}>
      <h3 style={{ margin: '0 0 16px', color: 'var(--gm-accent-ice, #F0F8FF)' }}>Lexicon Inspector</h3>
      <input 
        type="text" 
        placeholder="Search for words..." 
        value={searchWord}
        onChange={e => setSearchWord(e.target.value)}
        style={{ width: '100%', padding: '8px', marginBottom: '16px', background: 'var(--gm-bg-dark)', color: 'var(--gm-text)', border: '1px solid var(--gm-border)', boxSizing: 'border-box', borderRadius: '4px' }}
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
              background: activeTab === tab ? 'var(--gm-accent-amber, #FF9900)' : 'var(--gm-bg-medium)', 
              color: activeTab === tab ? '#000' : 'var(--gm-text)', 
              border: '1px solid var(--gm-border)', 
              cursor: 'pointer',
              borderRadius: '4px'
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {(mockResults[activeTab] || []).map((res, idx) => (
          <div 
            key={idx} 
            style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              background: 'var(--gm-bg-medium)', 
              padding: '10px 14px', 
              borderRadius: '4px', 
              cursor: 'pointer',
              border: '1px solid transparent'
            }} 
            onClick={() => handleCopy(res.word)}
            title="Click to insert or copy"
          >
            <span style={{ fontSize: '14px', fontWeight: '500' }}>{res.word}</span>
            <span style={{ 
              fontSize: '11px', 
              fontFamily: 'JetBrains Mono, monospace',
              background: 'var(--gm-bg-dark)', 
              padding: '4px 8px', 
              borderRadius: '12px', 
              color: 'var(--gm-accent-ice, #F0F8FF)',
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
