import React, { useState } from 'react';
import TabBackground from '../common/TabBackground.jsx';
import { BookA } from 'lucide-react';

/**
 * Dictionary tab (new in 4.0.5) — English & Spanish word definitions.
 *
 * Type a word, pick English or Spanish, and get its meaning(s), part of
 * speech, pronunciation, and example sentences. Powered by the free
 * dictionaryapi.dev (no API key needed). The domain is allowed in the app's
 * security policy (see main.js CSP).
 */
const LANGS = [
  { id: 'en', label: 'English' },
  { id: 'es', label: 'Spanish' }
];

export default function Dictionary() {
  const [word, setWord] = useState('');
  const [lang, setLang] = useState('en');
  const [entries, setEntries] = useState(null);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const lookUp = async (useLang = lang) => {
    const clean = word.trim();
    if (!clean) return;
    setLoading(true);
    setErrorMsg('');
    setNotFound(false);
    setEntries(null);
    try {
      const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/${useLang}/${encodeURIComponent(clean)}`);
      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      if (!res.ok) throw new Error(`Service error (${res.status})`);
      const data = await res.json();
      setEntries(Array.isArray(data) ? data : null);
    } catch (e) {
      setErrorMsg(`Couldn't reach the dictionary: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Flatten all phonetic spellings found across the entries.
  const getPhonetic = (entry) => {
    if (entry.phonetic) return entry.phonetic;
    const p = (entry.phonetics || []).find(x => x.text);
    return p ? p.text : '';
  };

  return (
    <div style={{ position: 'relative', flex: 1, minHeight: 0, width: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#000' }}>
      <TabBackground name="dictionary" />
      <div style={{ position: 'relative', zIndex: 1, height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Search header */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(155,161,170,0.2)', background: 'rgba(10,12,15,0.85)', display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
        {/* Language switch */}
        <div
          style={{ display: 'flex', gap: 2, background: 'rgba(16,18,21,0.7)', borderRadius: 8, padding: 2 }}
          data-help="Choose which language to look the word up in. Switch any time — it remembers your word."
        >
          {LANGS.map(l => (
            <button
              key={l.id}
              onClick={() => { setLang(l.id); if (word.trim()) lookUp(l.id); }}
              style={{
                padding: '6px 14px',
                fontSize: '0.76rem',
                fontWeight: 700,
                borderRadius: 6,
                border: 'none',
                cursor: 'pointer',
                background: lang === l.id ? 'rgba(155,161,170,0.5)' : 'transparent',
                color: lang === l.id ? '#fff' : 'rgba(155,161,170,0.55)'
              }}
            >
              {l.label}
            </button>
          ))}
        </div>

        <input
          value={word}
          onChange={(e) => setWord(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && lookUp()}
          data-help="Type any word, then click Look Up to see what it means, how it's said, and example sentences."
          placeholder={lang === 'es' ? 'Escribe una palabra…' : 'Enter a word to define...'}
          style={{
            flex: 1,
            minWidth: 160,
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
          onClick={() => lookUp()}
          aria-busy={loading}
          disabled={loading || !word.trim()}
          className="btn-neon-purple"
          data-help="Looks up the meaning of your word in the chosen language. Free — no AI key needed."
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
      <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 18 }}>
        {errorMsg && (
          <div className="pill-red" style={{ padding: '10px 14px', borderRadius: 8, fontSize: '0.82rem' }}>
            {errorMsg}
          </div>
        )}

        {notFound && (
          <div style={{ color: 'rgba(230,232,235,0.7)', fontSize: '0.86rem' }}>
            No definition found for “{word.trim()}” in {LANGS.find(l => l.id === lang).label}. Double-check the spelling, or try the other language.
          </div>
        )}

        {entries && entries.map((entry, ei) => (
          <div key={ei} style={{ background: 'rgba(16,18,21,0.7)', border: '1px solid rgba(155,161,170,0.22)', borderRadius: 10, padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
              <h3 style={{ fontFamily: 'var(--faf-font)', fontSize: '1.4rem', fontWeight: 800, color: '#e6e8eb', margin: 0 }}>
                {entry.word}
              </h3>
              {getPhonetic(entry) && (
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.82rem', color: '#e7a540' }}>
                  {getPhonetic(entry)}
                </span>
              )}
            </div>

            {(entry.meanings || []).map((meaning, mi) => (
              <div key={mi} style={{ marginBottom: 14 }}>
                <span
                  style={{ fontSize: '0.66rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#9ba1aa', fontStyle: 'italic', display: 'block', marginBottom: 6 }}
                  data-help="The part of speech — whether the word is a noun (a thing), a verb (an action), an adjective (a describing word), and so on."
                >
                  {meaning.partOfSpeech}
                </span>
                <ol style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(meaning.definitions || []).map((def, di) => (
                    <li key={di} style={{ fontSize: '0.86rem', lineHeight: 1.55, color: '#e6e8eb' }}>
                      {def.definition}
                      {def.example && (
                        <div style={{ fontSize: '0.8rem', color: 'rgba(231,165,64,0.75)', fontStyle: 'italic', marginTop: 3 }}>
                          “{def.example}”
                        </div>
                      )}
                    </li>
                  ))}
                </ol>
                {meaning.synonyms && meaning.synonyms.length > 0 && (
                  <div style={{ fontSize: '0.74rem', color: 'rgba(155,161,170,0.6)', marginTop: 6 }}>
                    <strong style={{ color: '#9ba1aa' }}>Similar:</strong> {meaning.synonyms.slice(0, 8).join(', ')}
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}

        {!entries && !notFound && !loading && (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, paddingBottom: 60, userSelect: 'none' }}>
            <div className="empty-glyph"><BookA size={44} strokeWidth={1.25} /></div>
            <p style={{ color: 'rgba(230,232,235,0.7)', fontWeight: 500, fontSize: '0.88rem', textAlign: 'center' }}>
              Type a word and click Look Up to see what it means —<br />in English or Spanish.
            </p>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
