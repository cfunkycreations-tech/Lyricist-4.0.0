import React, { useState } from 'react';
import { useLyricStore } from '../../context/LyricStore.jsx';
import { Sparkles, Search, Clipboard, Check, BookOpen, Layers } from 'lucide-react';
import rhymeBg from '../../assets/rhyme04.mp4';

export default function RhymeHelper() {
  const store = useLyricStore();
  const [word, setWord] = useState('');
  const [perfectRhymes, setPerfectRhymes] = useState(null);
  const [slantRhymes, setSlantRhymes] = useState(null);
  const [aiSuggestions, setAiSuggestions] = useState('');
  
  const [loadingLocal, setLoadingLocal] = useState(false);
  const [loadingAI, setLoadingAI] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [copiedWord, setCopiedWord] = useState('');

  // Internal Rhyme Scan Area
  const [scanText, setScanText] = useState('');
  const [scannedLyrics, setScannedLyrics] = useState(null);

  const fetchLocalRhymes = async () => {
    const cleanWord = word.trim();
    if (!cleanWord) return;
    setLoadingLocal(true);
    setErrorMsg('');
    setPerfectRhymes(null);
    setSlantRhymes(null);

    try {
      const [perfectRes, slantRes] = await Promise.all([
        fetch(`https://api.datamuse.com/words?rel_rhy=${encodeURIComponent(cleanWord)}&max=40`).then(res => res.json()),
        fetch(`https://api.datamuse.com/words?rel_nry=${encodeURIComponent(cleanWord)}&max=30`).then(res => res.json())
      ]);

      setPerfectRhymes(perfectRes);
      setSlantRhymes(slantRes);
    } catch (e) {
      setErrorMsg(`Failed to query Datamuse API: ${e.message}`);
    } finally {
      setLoadingLocal(false);
    }
  };

  const fetchAISuggestions = async () => {
    const cleanWord = word.trim();
    if (!cleanWord) return;
    if (!store.config.openRouterApiKey) {
      setErrorMsg('API Key is missing in Settings.');
      return;
    }
    setLoadingAI(true);
    setErrorMsg('');
    setAiSuggestions('');

    try {
      const systemPrompt = `You are a master lyricist and rap battle ghostwriter. Provide creative, unexpected, high-impact rhyme suggestions. Avoid basic perfect rhymes (cat/hat). Focus on multisyllabic rhymes, internal rhymes, slant/near-rhymes, and clever conversational phrases that real artists use to stand out.`;
      const userPrompt = `Creative rhyming words and phrases for "${cleanWord}" for rap/songwriting:
1. Perfect rhymes (1 syllable)
2. Multisyllabic rhymes
3. Slant/near rhymes
4. Creative phrase rhymes (2–3 words rhyming with "${cleanWord}")

Plain lists under each heading. Focus on what sounds great in lyrics.`;

      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${store.config.openRouterApiKey}`,
          "HTTP-Referer": "https://lyricist.app",
          "X-Title": "Lyricist 4.0.2"
        },
        body: JSON.stringify({
          model: store.config.model,
          temperature: store.config.temperature,
          max_tokens: 800,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ]
        })
      });

      if (!response.ok) {
        throw new Error(`API Status: ${response.status}`);
      }
      const data = await response.json();
      setAiSuggestions(data.choices?.[0]?.message?.content || '');
    } catch (e) {
      setErrorMsg(e.message);
    } finally {
      setLoadingAI(false);
    }
  };

  const handleCopyWord = (w) => {
    navigator.clipboard.writeText(w);
    setCopiedWord(w);
    setTimeout(() => setCopiedWord(''), 1500);
  };

  // Group by syllable count
  const groupBySyllable = (list) => {
    if (!list) return {};
    return list.reduce((acc, curr) => {
      const s = curr.numSyllables || 1;
      if (!acc[s]) acc[s] = [];
      acc[s].push(curr.word);
      return acc;
    }, {});
  };

  const handleScanRhymes = () => {
    if (!scanText.trim()) return;
    
    // Quick heuristic internal rhyme scanner
    // Group words that share the same suffix vowels/consonants
    const words = scanText.split(/[\s,.\n!?;:]+/).filter(w => w.length > 2);
    const rhymeGroups = {};

    words.forEach(w => {
      const clean = w.toLowerCase().replace(/[^a-z]/g, '');
      if (clean.length < 3) return;
      // Suffix of 3 letters or last vowels
      const suffix = clean.slice(-3);
      if (suffix.length === 3) {
        if (!rhymeGroups[suffix]) rhymeGroups[suffix] = [];
        rhymeGroups[suffix].push(w);
      }
    });

    // Filter groups that have more than 1 word
    const activeGroups = {};
    let groupIndex = 1;
    Object.keys(rhymeGroups).forEach(k => {
      // Remove duplicate words in group
      const unique = Array.from(new Set(rhymeGroups[k]));
      if (unique.length > 1) {
        activeGroups[k] = groupIndex++;
      }
    });

    // Reconstruct scanText with highlights
    const lines = scanText.split('\n');
    const highlightedLines = lines.map((line, lIdx) => {
      const lineWords = line.split(/(\s+)/);
      const elements = lineWords.map((part, pIdx) => {
        const clean = part.toLowerCase().replace(/[^a-z]/g, '');
        const suffix = clean.slice(-3);
        const gIdx = activeGroups[suffix];
        
        if (gIdx) {
          return (
            <span
              key={pIdx}
              className={`rhyme-highlight-${(gIdx % 5) + 1}`}
              style={{ padding: '1px 3px', fontWeight: 600 }}
              title={`Internal Rhyme Group ${gIdx}`}
            >
              {part}
            </span>
          );
        }
        return part;
      });
      return <div key={lIdx} style={{ minHeight: '18px' }}>{elements}</div>;
    });

    setScannedLyrics(highlightedLines);
  };

  const perfectGrouped = perfectRhymes ? groupBySyllable(perfectRhymes) : {};

  return (
    <div style={{ position: 'relative', flex: 1, minHeight: 0, width: '100%', display: 'flex', overflow: 'hidden', background: '#000' }}>
      <video
        src={rhymeBg}
        autoPlay
        loop
        muted
        playsInline
        onCanPlay={(e) => { e.target.playbackRate = 0.67; }}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: 0, opacity: 0.75 }}
      />
      <div style={{ position: 'relative', zIndex: 1, flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
      {/* Rhyme Finder panel */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: '1px solid rgba(139,92,246,0.18)', overflow: 'hidden' }}>
        {/* Search header */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(139,92,246,0.2)', background: 'rgba(8,5,18,0.85)', display: 'flex', gap: 8, flexShrink: 0 }}>
          <input
            value={word}
            onChange={(e) => setWord(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchLocalRhymes()}
            data-help="Type any word here, then click Find Rhymes. Example: type 'fire' to see words that rhyme with fire."
            placeholder="Enter a word to find rhymes..."
            style={{
              flex: 1,
              background: 'rgba(13,8,28,0.7)',
              border: '1px solid rgba(139,92,246,0.22)',
              borderRadius: 8,
              padding: '7px 10px',
              fontSize: '0.82rem',
              color: '#e8e0ff',
              outline: 'none',
              fontFamily: "'Space Grotesk', sans-serif"
            }}
          />
          <button
            onClick={fetchLocalRhymes}
            disabled={loadingLocal || !word.trim()}
            className="btn-neon-purple"
            data-help="Instantly look up a big list of real rhyming words from a free rhyming dictionary. No AI key needed for this one — it's always free and fast."
            style={{
              padding: '7px 18px',
              borderRadius: 8,
              border: 'none',
              color: '#fff',
              fontSize: '0.82rem',
              fontWeight: 700,
              cursor: loadingLocal || !word.trim() ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            {loadingLocal ? 'Searching...' : 'Find Rhymes'}
          </button>
          <button
            onClick={fetchAISuggestions}
            disabled={loadingAI || !word.trim()}
            className="btn-neon-cyan"
            data-help="Asks the AI for clever, creative rhymes — including multi-word phrases and near-rhymes that a plain dictionary won't show. (Needs your AI key from Settings.)"
            style={{
              padding: '7px 18px',
              borderRadius: 8,
              border: 'none',
              color: '#fff',
              fontSize: '0.82rem',
              fontWeight: 700,
              cursor: loadingAI || !word.trim() ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            <Sparkles size={12} style={{ marginRight: 4, display: 'inline' }} />
            {loadingAI ? 'Thinking...' : 'AI Suggest'}
          </button>
        </div>

        {/* Results Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 20 }}>
          {errorMsg && (
            <div className="pill-red" style={{ padding: '10px 14px', borderRadius: 8, fontSize: '0.82rem' }}>
              {errorMsg}
            </div>
          )}

          {/* Perfect Rhymes */}
          {perfectRhymes !== null && (
            <div>
              <span
                style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(167,139,250,0.65)', marginBottom: 10, display: 'block' }}
                data-help="Perfect rhymes are exact sound matches, like 'fire / desire'. They're grouped by how many syllables they have. Click any word to copy it."
              >
                Perfect Rhymes ({perfectRhymes.length} found)
              </span>

              {perfectRhymes.length === 0 ? (
                <p style={{ color: 'rgba(148,130,200,0.4)', fontSize: '0.82rem' }}>No perfect rhymes found.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {Object.entries(perfectGrouped).sort(([a], [b]) => a - b).map(([syl, list]) => (
                    <div key={syl}>
                      <div style={{ fontSize: '0.6rem', color: 'rgba(148,130,200,0.35)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 5 }}>
                        {syl} syllable{syl === '1' ? '' : 's'}
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                        {list.map(w => (
                          <button
                            key={w}
                            onClick={() => handleCopyWord(w)}
                            style={{
                              padding: '4px 10px',
                              background: 'rgba(139,92,246,0.15)',
                              border: `1px solid ${copiedWord === w ? '#34d399' : 'rgba(168,85,247,0.3)'}`,
                              borderRadius: 6,
                              fontSize: '0.75rem',
                              color: copiedWord === w ? '#34d399' : '#c4b5fd',
                              cursor: 'pointer',
                              fontFamily: "'JetBrains Mono', monospace"
                            }}
                          >
                            {copiedWord === w ? '✓ Copied' : w}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Slant Rhymes */}
          {slantRhymes !== null && slantRhymes.length > 0 && (
            <div>
              <span
                style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#22d3ee', marginBottom: 10, display: 'block' }}
                data-help="Near (slant) rhymes are close-but-not-exact matches, like 'home / alone'. They sound natural and give you way more options than perfect rhymes alone. Click any to copy."
              >
                Near / Slant Rhymes ({slantRhymes.length} found)
              </span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {slantRhymes.map(item => (
                  <button
                    key={item.word}
                    onClick={() => handleCopyWord(item.word)}
                    style={{
                      padding: '4px 10px',
                      background: 'rgba(6,182,212,0.1)',
                      border: `1px solid ${copiedWord === item.word ? '#34d399' : 'rgba(34,211,238,0.3)'}`,
                      borderRadius: 6,
                      fontSize: '0.75rem',
                      color: copiedWord === item.word ? '#34d399' : '#67e8f9',
                      cursor: 'pointer',
                      fontFamily: "'JetBrains Mono', monospace"
                    }}
                  >
                    {copiedWord === item.word ? '✓ Copied' : item.word}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* AI Rhymes */}
          {aiSuggestions && (
            <div>
              <span style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#c084fc', marginBottom: 10, display: 'block' }}>
                ✨ AI Rhyming Suggestions & Phrases
              </span>
              <div
                style={{
                  background: 'rgba(13,8,28,0.8)',
                  border: '1px solid rgba(139,92,246,0.22)',
                  borderRadius: 10,
                  padding: 16,
                  fontSize: '0.82rem',
                  color: '#e8e0ff',
                  fontFamily: "'JetBrains Mono', monospace",
                  lineHeight: 1.8,
                  whiteSpace: 'pre-wrap'
                }}
              >
                {aiSuggestions}
              </div>
            </div>
          )}

          {!perfectRhymes && !aiSuggestions && !loadingLocal && !loadingAI && (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, paddingBottom: 60, userSelect: 'none' }}>
              <div style={{ fontSize: '3.5rem', filter: 'drop-shadow(0 0 24px rgba(168,85,247,0.6))' }}>📖</div>
              <p style={{ color: 'rgba(196,181,253,0.7)', fontWeight: 500, fontSize: '0.88rem', textAlign: 'center' }}>
                Type a word and click Find Rhymes or AI Suggest to start searching.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Internal Rhymes Scanner area on the right */}
      <div style={{ width: '400px', display: 'flex', flexDirection: 'column', background: 'rgba(13,8,28,0.3)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(139,92,246,0.18)', background: 'rgba(8,5,18,0.5)', flexShrink: 0 }}>
          <h4
            style={{ fontSize: '0.85rem', fontWeight: 700, color: '#c4b5fd', display: 'flex', alignItems: 'center', gap: 6 }}
            data-help="An INTERNAL rhyme is a rhyme that happens in the MIDDLE of your lines, not just at the end — a sign of skilled writing. Paste lyrics here and this tool color-codes the words that rhyme with each other inside the lines."
          >
            <Layers size={14} />
            Internal Rhyme Analyzer
          </h4>
          <span style={{ fontSize: '0.65rem', color: 'rgba(167,139,250,0.5)' }}>
            Paste lyrics here to scan and highlight phonetic internal rhymes
          </span>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <textarea
            value={scanText}
            onChange={(e) => setScanText(e.target.value)}
            data-help="Paste any lyrics in this box, then click Scan Rhymes below to see which words rhyme with each other inside the lines."
            placeholder="Paste your lyrics here to analyze internal rhymes..."
            rows={8}
            style={{
              width: '100%',
              background: 'rgba(13,8,28,0.7)',
              border: '1px solid rgba(139,92,246,0.22)',
              borderRadius: 8,
              padding: '10px 12px',
              fontSize: '0.8rem',
              color: '#e8e0ff',
              outline: 'none',
              fontFamily: "'JetBrains Mono', monospace",
              resize: 'none',
              lineHeight: 1.6
            }}
          />

          <button
            onClick={handleScanRhymes}
            disabled={!scanText.trim()}
            className="btn-neon-cyan"
            data-help="Reads the lyrics you pasted and highlights the rhyming words in matching colors, so you can see your internal rhymes at a glance. Free — no AI key needed."
            style={{
              padding: '8px',
              borderRadius: 6,
              border: 'none',
              color: '#fff',
              fontSize: '0.78rem',
              fontWeight: 700,
              cursor: scanText.trim() ? 'pointer' : 'not-allowed'
            }}
          >
            Scan Rhymes
          </button>

          {scannedLyrics && (
            <div style={{ marginTop: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', color: 'rgba(167,139,250,0.5)' }}>
                  Scanned Output (Color-Coded Rhyme Clusters)
                </span>
                <button
                  onClick={() => { setScannedLyrics(null); setScanText(''); }}
                  style={{
                    fontSize: '0.65rem',
                    fontWeight: 700,
                    padding: '3px 10px',
                    borderRadius: 5,
                    border: '1px solid rgba(239,68,68,0.35)',
                    background: 'transparent',
                    color: 'rgba(248,113,113,0.7)',
                    cursor: 'pointer',
                    fontFamily: "'Space Grotesk', sans-serif"
                  }}
                >
                  Clear
                </button>
              </div>
              <div
                style={{
                  background: 'rgba(13,8,28,0.9)',
                  border: '1px solid rgba(139,92,246,0.18)',
                  borderRadius: 8,
                  padding: 14,
                  fontSize: '0.8rem',
                  color: '#e8e0ff',
                  lineHeight: 1.8,
                  fontFamily: "'Space Grotesk', sans-serif"
                }}
              >
                {scannedLyrics}
              </div>
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
