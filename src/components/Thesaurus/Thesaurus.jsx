import React, { useState } from 'react';
import TabBackground from '../common/TabBackground.jsx';
import { Library } from 'lucide-react';

/**
 * Thesaurus tab (new in 4.0.3).
 *
 * A plain-language word helper for songwriters: type a word and get
 *  - Synonyms (words that mean the SAME thing)
 *  - Antonyms (words that mean the OPPOSITE)
 *  - Related words (ideas that go WITH it)
 *
 * Powered by the free Datamuse word API (already allowed in the app's
 * security policy). No AI key required — always free and instant.
 * Click any word to copy it.
 */
export default function Thesaurus() {
  const [word, setWord] = useState('');
  const [synonyms, setSynonyms] = useState(null);
  const [antonyms, setAntonyms] = useState(null);
  const [related, setRelated] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [copiedWord, setCopiedWord] = useState('');

  const lookUp = async () => {
    const clean = word.trim();
    if (!clean) return;
    setLoading(true);
    setErrorMsg('');
    setSynonyms(null);
    setAntonyms(null);
    setRelated(null);
    try {
      const w = encodeURIComponent(clean);
      const [syn, ant, rel] = await Promise.all([
        fetch(`https://api.datamuse.com/words?rel_syn=${w}&max=50`).then(r => r.json()),
        fetch(`https://api.datamuse.com/words?rel_ant=${w}&max=30`).then(r => r.json()),
        fetch(`https://api.datamuse.com/words?ml=${w}&max=40`).then(r => r.json())
      ]);
      setSynonyms(syn);
      setAntonyms(ant);
      // "means like" overlaps with synonyms — drop dupes so Related stays useful.
      const synSet = new Set(syn.map(s => s.word));
      setRelated(rel.filter(r => !synSet.has(r.word)));
    } catch (e) {
      setErrorMsg(`Couldn't reach the word service: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const copyWord = (w) => {
    navigator.clipboard.writeText(w);
    setCopiedWord(w);
    setTimeout(() => setCopiedWord(''), 1500);
  };

  const WordCloud = ({ list, color, accent }) => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
      {list.map(item => (
        <button
          key={item.word}
          onClick={() => copyWord(item.word)}
          style={{
            padding: '4px 10px',
            background: copiedWord === item.word ? 'rgba(52,211,153,0.15)' : `${accent}1a`,
            border: `1px solid ${copiedWord === item.word ? '#34d399' : `${accent}4d`}`,
            borderRadius: 6,
            fontSize: '0.75rem',
            color: copiedWord === item.word ? '#34d399' : color,
            cursor: 'pointer',
            fontFamily: "'JetBrains Mono', monospace"
          }}
        >
          {copiedWord === item.word ? 'Copied' : item.word}
        </button>
      ))}
    </div>
  );

  const Section = ({ title, help, list, color, accent }) => (
    <div>
      <span
        style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color, marginBottom: 10, display: 'block' }}
        data-help={help}
      >
        {title} ({list.length})
      </span>
      {list.length === 0 ? (
        <p style={{ color: 'rgba(155,161,170,0.4)', fontSize: '0.82rem' }}>None found for this word.</p>
      ) : (
        <WordCloud list={list} color={color} accent={accent} />
      )}
    </div>
  );

  return (
    <div style={{ position: 'relative', flex: 1, minHeight: 0, width: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#000' }}>
      <TabBackground name="thesaurus" />
      <div style={{ position: 'relative', zIndex: 1, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Search header */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(155,161,170,0.2)', background: 'rgba(10,12,15,0.85)', display: 'flex', gap: 8, flexShrink: 0 }}>
        <input
          value={word}
          onChange={(e) => setWord(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && lookUp()}
          data-help="Type any word, then click Look Up. Example: type 'happy' to find other words for happy, its opposites, and related ideas."
          placeholder="Enter a word to find other words for it..."
          style={{
            flex: 1,
            background: 'rgba(16,18,21,0.7)',
            border: '1px solid rgba(155,161,170,0.22)',
            borderRadius: 8,
            padding: '7px 10px',
            fontSize: '0.82rem',
            color: '#e6e8eb',
            outline: 'none',
            fontFamily: 'var(--faf-font)'
          }}
        />
        <button
          onClick={lookUp}
          disabled={loading || !word.trim()}
          className="btn-neon-purple"
          data-help="Looks up your word in an open word dictionary and shows words that mean the same, the opposite, and related ideas. Runs without an API key."
          style={{
            padding: '7px 20px',
            borderRadius: 8,
            border: 'none',
            color: '#fff',
            fontSize: '0.82rem',
            fontWeight: 700,
            cursor: loading || !word.trim() ? 'not-allowed' : 'pointer',
            whiteSpace: 'nowrap'
          }}
        >
          {loading ? 'Looking...' : 'Look Up'}
        </button>
      </div>

      {/* Results */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 20 }}>
        {errorMsg && (
          <div className="pill-red" style={{ padding: '10px 14px', borderRadius: 8, fontSize: '0.82rem' }}>
            {errorMsg}
          </div>
        )}

        {synonyms !== null && (
          <Section
            title="Other words for it (synonyms)"
            help="Synonyms are different words that mean the SAME thing — like 'happy' and 'joyful'. Great for swapping out a word that feels overused or doesn't quite fit the rhythm."
            list={synonyms}
            color="#e6e8eb"
            accent="#9ba1aa"
          />
        )}

        {antonyms !== null && (
          <Section
            title="Opposite words (antonyms)"
            help="Antonyms are words that mean the OPPOSITE — like 'happy' and 'sad'. Handy when you want to flip a feeling or set up a contrast in your lyrics."
            list={antonyms}
            color="#e7a540"
            accent="#e7a540"
          />
        )}

        {related !== null && related.length > 0 && (
          <Section
            title="Related ideas"
            help="Words and ideas that go WITH your word but aren't exact matches — like 'sunshine' or 'celebrate' for 'happy'. A spark for fresh imagery and lines."
            list={related}
            color="#e6e8eb"
            accent="#9ba1aa"
          />
        )}

        {synonyms === null && !loading && (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, paddingBottom: 60, userSelect: 'none' }}>
            <div className="empty-glyph"><Library size={44} strokeWidth={1.25} /></div>
            <p style={{ color: 'rgba(230,232,235,0.7)', fontWeight: 500, fontSize: '0.88rem', textAlign: 'center' }}>
              Type a word and click Look Up to find other words for it,<br />its opposites, and related ideas.
            </p>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
