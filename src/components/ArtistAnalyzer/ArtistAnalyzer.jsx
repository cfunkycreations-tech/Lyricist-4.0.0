import React, { useState } from 'react';
import { useLyricStore } from '../../context/LyricStore.jsx';
import { callAI, refineLyrics, analyzeClichés, checkSimilarity, checkThemeConsistency } from '../../services/AIService.js';
import { Search, Sparkles, BookOpen, AlertTriangle, ShieldCheck, Check, Copy, Save, Heart, Send } from 'lucide-react';
import ghostRiderVideo from '../../assets/ghost_rider.mp4';

const analysisTabs = [
  { id: 'style', label: 'Lyrical Style' },
  { id: 'flow', label: 'Flow & Cadence' },
  { id: 'themes', label: 'Common Themes' },
  { id: 'full', label: 'Full Analysis' }
];

const promptBuilders = {
  style: (artist) => `Analyze ${artist}'s lyrical writing style in depth. Cover vocabulary, metaphor usage, storytelling approach, word choice, rhyme schemes, and what makes their lyrics distinctive. Use catalog examples.`,
  flow: (artist) => `Analyze ${artist}'s rap flow, rhythm, and cadence. Cover syllable placement, rhythm patterns, breath control, beat riding, double-time vs half-time, and signature flow techniques. Use catalog examples.`,
  themes: (artist) => `Analyze the common themes in ${artist}'s music. Cover recurring motifs, emotional tone, life experiences, and how their themes evolved over time.`,
  full: (artist) => `Comprehensive analysis of ${artist} as a lyricist: style, flow, themes, era, influences, and what makes them unique. Use catalog examples.`
};

export default function ArtistAnalyzer({ onGhostSend }) {
  const store = useLyricStore();
  const [artist, setArtist] = useState('');
  const [tab, setTab] = useState('full');
  const [focus, setFocus] = useState('');
  
  // Results
  const [analysis, setAnalysis] = useState('');
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Ghost Rider
  const [ghostTopic, setGhostTopic] = useState('');
  const [ghostLyrics, setGhostLyrics] = useState('');
  const [sunoTags, setSunoTags] = useState('');
  const [loadingGhost, setLoadingGhost] = useState(false);
  const [copied, setCopied] = useState('');
  const [ghostSent, setGhostSent] = useState(false);

  // Checks & Intelligence
  const [clichés, setClichés] = useState([]);
  const [plagiarismRisk, setPlagiarismRisk] = useState(null);
  const [themeCheck, setThemeCheck] = useState(null);
  const [loadingChecks, setLoadingChecks] = useState(false);

  // Saved reports
  const [savedReports, setSavedReports] = useState(() => {
    const saved = localStorage.getItem('lyricistStyleReports');
    return saved ? JSON.parse(saved) : [];
  });

  const handleAnalyze = async () => {
    if (!artist.trim()) return;
    if (!store.config.openRouterApiKey) {
      setErrorMsg('API Key is missing in Settings.');
      return;
    }
    setLoadingAnalysis(true);
    setErrorMsg('');
    setAnalysis('');
    
    const basePrompt = promptBuilders[tab](artist.trim());
    const finalPrompt = focus.trim() ? `${basePrompt}\nFocus context: ${focus.trim()}` : basePrompt;

    try {
      const result = await callAI([
        { role: 'system', content: 'You are a professional music critic and expert ghostwriter with deep knowledge of hip-hop, R&B, and popular music.' },
        { role: 'user', content: finalPrompt }
      ], store.config);
      setAnalysis(result);
    } catch (e) {
      setErrorMsg(e.message);
    } finally {
      setLoadingAnalysis(false);
    }
  };

  const handleGhostWrite = async () => {
    if (!artist.trim()) return;
    if (!store.config.openRouterApiKey) {
      setErrorMsg('API Key is missing in Settings.');
      return;
    }
    setLoadingGhost(true);
    setErrorMsg('');
    setGhostLyrics('');
    setSunoTags('');
    setGhostSent(false);

    try {
      const topicPrompt = ghostTopic.trim() ? `Topic: ${ghostTopic.trim()}` : `Choose a typical subject for this artist.`;
      
      const prompt = `Write original lyrics in the style of ${artist}. ${topicPrompt}
Write a verse (16 bars) and a hook (8 bars). Match their rhyme schemes, vocabulary, and flow. Do NOT mention the artist's name anywhere in the lyrics.

After the lyrics, on a new line write exactly this separator and nothing else:
---SUNO TAGS---
Then on the very next line write 10-14 comma-separated Suno AI style keywords. STRICT RULES for the tags: NO artist names, NO real person names, NO celebrity names whatsoever. Only include: genre, subgenre, production style, mood, tempo, instruments, vocal style, era. One line only.`;

      const rawResult = await callAI([
        { role: 'system', content: 'You are an elite ghostwriter who captures the raw, authentic artistic voice, flow, cadence, vocabulary, and stylistic nuances of specific musical artists. You despise generic AI-sounding imitations. Focus on subtext, friction, and rhythm.' },
        { role: 'user', content: prompt }
      ], store.config);

      const parts = rawResult.split('---SUNO TAGS---');
      const lyrics = parts[0]?.trim() || '';
      
      // Clean tags of any artist names
      let tags = parts[1]?.trim().split('\n')[0]?.trim() || '';
      const artistClean = artist.toLowerCase().trim();
      tags = tags.split(',')
        .map(t => t.trim())
        .filter(t => t.toLowerCase() !== artistClean && t.length > 2)
        .join(', ');

      setGhostLyrics(lyrics);
      setSunoTags(tags);
    } catch (e) {
      setErrorMsg(e.message);
    } finally {
      setLoadingGhost(false);
    }
  };

  const handleSaveReport = () => {
    if (!analysis) return;
    const newReport = {
      id: Date.now(),
      artist: artist.trim(),
      tab,
      text: analysis,
      date: new Date().toLocaleDateString()
    };
    const updated = [newReport, ...savedReports];
    setSavedReports(updated);
    localStorage.setItem('lyricistStyleReports', JSON.stringify(updated));
    alert('Style Report saved successfully!');
  };

  const handleRunChecks = async () => {
    if (!ghostLyrics) return;
    setLoadingChecks(true);
    try {
      const [clichéRes, similarityRes, themeRes] = await Promise.all([
        analyzeClichés(ghostLyrics, store),
        checkSimilarity(ghostLyrics, store),
        checkThemeConsistency(ghostLyrics, ghostTopic || "general", store)
      ]);
      setClichés(clichéRes);
      setPlagiarismRisk(similarityRes);
      setThemeCheck(themeRes);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingChecks(false);
    }
  };

  const handleSendToSongwriter = () => {
    if (!ghostLyrics || !onGhostSend) return;
    onGhostSend({
      lyrics: ghostLyrics,
      artist: artist.trim(),
      sunoTags
    });
    setGhostSent(true);
  };

  const handleCopy = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(''), 2000);
  };

  return (
    <div style={{ flex: 1, minHeight: 0, width: '100%', display: 'flex', overflow: 'hidden', position: 'relative', background: '#000000' }}>
      {/* Ghost Rider background video — full cover, no other bg visible */}
      <video
        autoPlay
        loop
        muted
        playsInline
        onCanPlay={(e) => { e.target.playbackRate = 0.67; }}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          zIndex: 0,
          opacity: 0.75
        }}
      >
        <source src={ghostRiderVideo} type="video/mp4" />
      </video>
      {/* Content sits above the video */}
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flex: 1, width: '100%', overflow: 'hidden' }}>
      {/* Sidebar for parameters and saved reports */}
      <div
        style={{
          width: 220,
          flexShrink: 0,
          overflowY: 'auto',
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          background: 'rgba(0,0,0,0.55)',
          borderRight: '1px solid rgba(255,45,149,0.2)'
        }}
      >
        <div data-help="Type the name of any artist you admire. Ghost Rider will study how they write so it can help you write in a similar style — without ever copying their actual songs.">
          <label style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(167,139,250,0.7)', marginBottom: 5, display: 'block' }}>
            Artist Name
          </label>
          <input
            value={artist}
            onChange={(e) => setArtist(e.target.value)}
            placeholder="e.g. Kendrick Lamar, Taylor Swift..."
            style={{
              width: '100%',
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
        </div>

        <div data-help="Optional. Narrow the study to a certain time period or side of the artist — like a specific album era or their early sound. Leave it blank to look at everything.">
          <label style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(167,139,250,0.7)', marginBottom: 5, display: 'block' }}>
            Focus Angle / Era (optional)
          </label>
          <input
            value={focus}
            onChange={(e) => setFocus(e.target.value)}
            placeholder="e.g. Good Kid M.A.A.D City era..."
            style={{
              width: '100%',
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
        </div>

        <div data-help="Choose what to study about the artist. Lyrical Style = their word choices and storytelling. Flow & Cadence = their rhythm and delivery. Common Themes = what they tend to write about. Full Analysis = all of it together.">
          <label style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(167,139,250,0.7)', marginBottom: 5, display: 'block' }}>
            Analysis Type
          </label>
          <select
            value={tab}
            onChange={(e) => setTab(e.target.value)}
            style={{
              width: '100%',
              background: 'rgba(13,8,28,0.7)',
              border: '1px solid rgba(139,92,246,0.22)',
              borderRadius: 8,
              padding: '7px 10px',
              fontSize: '0.82rem',
              color: '#e8e0ff',
              outline: 'none',
              fontFamily: "'Space Grotesk', sans-serif"
            }}
          >
            {analysisTabs.map(t => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
        </div>

        <button
          onClick={handleAnalyze}
          disabled={loadingAnalysis || !artist.trim()}
          className="btn-neon-purple"
          data-help="Studies the artist you named and writes up a plain-English breakdown of how they write — their style, rhythm, and themes. (Needs your AI key from Settings.)"
          style={{
            width: '100%',
            padding: '10px',
            borderRadius: 8,
            border: 'none',
            color: '#fff',
            fontSize: '0.82rem',
            fontWeight: 700,
            cursor: loadingAnalysis || !artist.trim() ? 'not-allowed' : 'pointer'
          }}
        >
          {loadingAnalysis ? '🔍 Analyzing style...' : '🔍 Analyze Artist'}
        </button>

        {/* Saved Reports history */}
        {savedReports.length > 0 && (
          <div style={{ marginTop: 10, borderTop: '1px solid rgba(139,92,246,0.15)', paddingTop: 14 }}>
            <span
              style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(232,121,249,0.8)', marginBottom: 10, display: 'block' }}
              data-help="Artist breakdowns you've saved. Click any one to load it back up. Each shows the artist and the date you saved it."
            >
              Saved Style Reports
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: '200px', overflowY: 'auto' }}>
              {savedReports.map(report => (
                <button
                  key={report.id}
                  onClick={() => {
                    setArtist(report.artist);
                    setTab(report.tab);
                    setAnalysis(report.text);
                  }}
                  className="card-cosmic"
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '8px 10px',
                    borderRadius: 6,
                    cursor: 'pointer',
                    background: 'rgba(13,8,28,0.7)',
                    border: '1px solid rgba(139,92,246,0.18)'
                  }}
                >
                  <div style={{ fontSize: '0.74rem', fontWeight: 600, color: '#c4b5fd' }}>
                    {report.artist}
                  </div>
                  <div style={{ fontSize: '0.6rem', color: 'rgba(148,130,200,0.5)' }}>
                    {report.date} · {report.tab.toUpperCase()}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Main Analysis Output View */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'rgba(7,5,15,0.45)' }}>
        {/* Workspace Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 20px',
            borderBottom: '1px solid rgba(139,92,246,0.18)',
            background: 'rgba(8,5,18,0.7)',
            flexShrink: 0
          }}
        >
          <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(167,139,250,0.5)' }}>
            Artist Intelligence Report
          </span>

          {analysis && (
            <button
              onClick={handleSaveReport}
              data-help="Saves this artist breakdown so you can pull it back up later from the list on the left. Handy for studying a few artists and comparing them."
              style={{
                fontSize: '0.72rem',
                fontWeight: 600,
                padding: '4px 12px',
                borderRadius: 6,
                border: '1px solid rgba(168,85,247,0.4)',
                background: 'rgba(168,85,247,0.1)',
                color: '#e879f9',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4
              }}
            >
              <Save size={12} />
              Save Report
            </button>
          )}
        </div>

        {/* Error message */}
        {errorMsg && (
          <div className="pill-red" style={{ margin: '10px 20px', padding: '10px 14px', borderRadius: 8, fontSize: '0.82rem' }}>
            {errorMsg}
          </div>
        )}

        {/* Workspace Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 20, background: 'rgba(0,0,0,0.45)' }}>
          {analysis && (
            <div style={{ background: 'rgba(13,8,28,0.7)', border: '1px solid rgba(139,92,246,0.22)', borderRadius: 10, padding: 18 }}>
              <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#c4b5fd', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <BookOpen size={16} />
                Lyrical Analysis Report: {artist}
              </h4>
              
              {/* Dynamic Emotional Arc intensity chart */}
              <div style={{ marginBottom: 18, background: 'rgba(13,8,28,0.9)', borderRadius: 8, border: '1px solid rgba(139,92,246,0.15)', padding: 12 }}>
                <span
                  style={{ fontSize: '0.62rem', fontWeight: 700, color: 'rgba(167,139,250,0.5)', textTransform: 'uppercase', letterSpacing: '0.1em', display: 'block', marginBottom: 10 }}
                  data-help="A quick picture of how the ENERGY of a song typically rises and falls across its parts — lower at the intro, peaking at the chorus, easing out at the end. A guide for shaping your song's emotional ride."
                >
                  📈 Stylistic Intensity Arc (Section-by-Section)
                </span>
                <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', height: '60px', padding: '0 10px', gap: 6 }}>
                  {[40, 75, 55, 90, 85, 30].map((val, idx) => {
                    const sections = ['Intro', 'Verse 1', 'Pre-Ch', 'Chorus', 'Bridge', 'Outro'];
                    return (
                      <div key={idx} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                        <div
                          style={{
                            width: '100%',
                            height: `${val}%`,
                            background: 'linear-gradient(0deg, #7c3aed, #22d3ee)',
                            borderRadius: '4px 4px 0 0',
                            boxShadow: '0 0 8px rgba(34,211,238,0.3)'
                          }}
                        />
                        <span style={{ fontSize: '0.54rem', color: 'rgba(167,139,250,0.45)' }}>{sections[idx]}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <pre style={{ fontSize: '0.84rem', color: '#e8e0ff', whiteSpace: 'pre-wrap', lineHeight: 1.8, fontFamily: 'inherit' }}>
                {analysis}
              </pre>
            </div>
          )}

          {/* Ghost Rider Mimic section */}
          {artist.trim() && (
            <div style={{ background: 'rgba(13,8,28,0.85)', border: '1px solid rgba(34,211,238,0.22)', borderRadius: 12, padding: 18 }}>
              <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#67e8f9', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>👻</span>
                Ghost Rider — Write in the style of {artist}
              </h4>
              <p style={{ fontSize: '0.74rem', color: 'rgba(167,139,250,0.5)', marginBottom: 14 }}>
                Captures the authentic artistic voice, flow structures, and vocabulary without using any celebrity names.
              </p>

              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <input
                  value={ghostTopic}
                  onChange={(e) => setGhostTopic(e.target.value)}
                  data-help="Optional. Give the ghostwriter a subject for the new song. Leave it blank and it'll pick a topic that fits the artist's usual vibe."
                  placeholder="Optional Topic: e.g. childhood memories, neon rain..."
                  style={{
                    flex: 1,
                    background: 'rgba(13,8,28,0.7)',
                    border: '1px solid rgba(139,92,246,0.22)',
                    borderRadius: 8,
                    padding: '7px 10px',
                    fontSize: '0.82rem',
                    color: '#e8e0ff',
                    outline: 'none'
                  }}
                />
                <button
                  onClick={handleGhostWrite}
                  disabled={loadingGhost}
                  className="btn-neon-cyan"
                  data-help="Writes brand-new, original lyrics that FEEL like the artist's style — their flow and word choices — but are 100% your own words. It never copies their real lyrics or uses their name."
                  style={{
                    padding: '7px 18px',
                    borderRadius: 8,
                    border: 'none',
                    color: '#fff',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    cursor: loadingGhost ? 'not-allowed' : 'pointer',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {loadingGhost ? 'Writing...' : '✍️ Write Lyrics'}
                </button>
              </div>

              {ghostLyrics && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 14 }}>
                  {/* Lyrics Display */}
                  <div style={{ position: 'relative' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', color: 'rgba(167,139,250,0.6)' }}>
                        Generated Lyrics
                      </span>
                      <button
                        onClick={() => handleCopy(ghostLyrics, 'ghost')}
                        style={{
                          fontSize: '0.68rem',
                          background: 'transparent',
                          border: '1px solid rgba(139,92,246,0.3)',
                          color: copied === 'ghost' ? '#34d399' : 'rgba(196,181,253,0.7)',
                          padding: '2px 8px',
                          borderRadius: 4,
                          cursor: 'pointer'
                        }}
                      >
                        {copied === 'ghost' ? '✓ Copied' : 'Copy'}
                      </button>
                    </div>

                    <pre style={{ background: 'rgba(13,8,28,0.9)', border: '1px solid rgba(139,92,246,0.15)', borderRadius: 8, padding: 14, fontSize: '0.8rem', fontFamily: "'Audiowide', 'JetBrains Mono', monospace", color: '#e8e0ff', whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
                      {ghostLyrics}
                    </pre>
                  </div>

                  {/* Suno tags generator */}
                  {sunoTags && (
                    <div style={{ background: 'rgba(13,8,28,0.9)', border: '1px solid rgba(232,121,249,0.3)', borderRadius: 8, padding: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <span
                          style={{ fontSize: '0.62rem', fontWeight: 700, color: '#e879f9', textTransform: 'uppercase', letterSpacing: '0.12em' }}
                          data-help="Suno is a popular app that turns lyrics into actual music. These are safe style keywords (genre, mood, instruments — no artist names) you can paste into Suno to get a beat that matches this song."
                        >
                          🎵 Safe Suno AI Style Keywords (Ready to Paste)
                        </span>
                        <button
                          onClick={() => handleCopy(sunoTags, 'suno')}
                          style={{
                            fontSize: '0.68rem',
                            background: 'transparent',
                            border: '1px solid rgba(232,121,249,0.3)',
                            color: copied === 'suno' ? '#34d399' : 'rgba(232,121,249,0.7)',
                            padding: '2px 8px',
                            borderRadius: 4,
                            cursor: 'pointer'
                          }}
                        >
                          {copied === 'suno' ? '✓ Copied' : 'Copy'}
                        </button>
                      </div>
                      
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                        {sunoTags.split(',').map((tag, idx) => (
                          <span
                            key={idx}
                            style={{
                              padding: '2px 8px',
                              borderRadius: 12,
                              fontSize: '0.68rem',
                              fontWeight: 600,
                              background: 'rgba(232,121,249,0.1)',
                              border: '1px solid rgba(232,121,249,0.2)',
                              color: '#f472b6'
                            }}
                          >
                            {tag.trim()}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Send to Songwriter Hub */}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={handleSendToSongwriter}
                      className="btn-neon-purple"
                      data-help="Sends these lyrics over to the main Songwriter tab, broken into sections, so you can edit and polish them line by line with all the writing tools."
                      style={{
                        flex: 1,
                        padding: '9px',
                        borderRadius: 8,
                        border: 'none',
                        color: '#fff',
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6
                      }}
                    >
                      <Send size={14} />
                      {ghostSent ? '✓ Sent to Workspace!' : '🎵 Send to Songwriter Workspace'}
                    </button>

                    <button
                      onClick={handleRunChecks}
                      disabled={loadingChecks}
                      className="btn-neon-cyan"
                      data-help="Double-checks the lyrics: scans for clichés (tired, overused phrases), flags anything that sounds too close to a famous song, and confirms the lines stay on topic. Helps keep your song fresh and original."
                      style={{
                        padding: '9px 18px',
                        borderRadius: 8,
                        border: 'none',
                        color: '#fff',
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        cursor: loadingChecks ? 'not-allowed' : 'pointer'
                      }}
                    >
                      {loadingChecks ? 'Running Checks...' : '🛡️ Run Checks'}
                    </button>
                  </div>

                  {/* Checked Output */}
                  {(clichés.length > 0 || plagiarismRisk !== null || themeCheck !== null) && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, background: 'rgba(13,8,28,0.5)', padding: 12, borderRadius: 8, border: '1px solid rgba(139,92,246,0.18)' }}>
                      <span
                        style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', color: 'rgba(167,139,250,0.5)' }}
                        data-help="Results of the originality check. Plagiarism Risk = how close your lines are to known famous songs (lower is safer). Clichés = overused phrases to consider replacing. Theme check = whether your lines stayed on topic."
                      >
                        Intelligence Checks Result
                      </span>

                      {/* Plagiarism risk bar */}
                      {plagiarismRisk && (
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', marginBottom: 4 }}>
                            <span>Plagiarism Risk Score:</span>
                            <span style={{ color: plagiarismRisk.score > 35 ? '#f87171' : '#34d399', fontWeight: 700 }}>
                              {plagiarismRisk.score}%
                            </span>
                          </div>
                          <div style={{ height: '6px', background: 'rgba(13,8,28,0.8)', borderRadius: 3, overflow: 'hidden' }}>
                            <div
                              style={{
                                height: '100%',
                                width: `${plagiarismRisk.score}%`,
                                background: plagiarismRisk.score > 35 ? '#f87171' : '#34d399'
                              }}
                            />
                          </div>
                          {plagiarismRisk.matches.map((m, idx) => (
                            <div key={idx} style={{ fontSize: '0.65rem', color: '#f87171', marginTop: 4 }}>
                              ⚠️ match in famous song: "{m.phrase}" (similar to {m.originalSong})
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Cliché count */}
                      {clichés.length > 0 ? (
                        <div>
                          <div style={{ fontSize: '0.7rem', color: '#f87171', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <AlertTriangle size={12} />
                            <span>{clichés.length} Clichés Detected:</span>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
                            {clichés.map((c, idx) => (
                              <div key={idx} style={{ fontSize: '0.65rem', color: 'rgba(167,139,250,0.8)' }}>
                                • "{c.phrase}": {c.reason}. <span style={{ color: '#34d399' }}>Try: "{c.replacement}"</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div style={{ fontSize: '0.7rem', color: '#34d399', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <ShieldCheck size={12} />
                          <span>Zero clichés detected! (Law of Subtext adhered)</span>
                        </div>
                      )}

                      {/* Theme check */}
                      {themeCheck && (
                        <div>
                          <span style={{ fontSize: '0.7rem', color: themeCheck.length > 0 ? '#f59e0b' : '#34d399' }}>
                            {themeCheck.length > 0
                              ? `⚠️ Found ${themeCheck.length} off-topic lines: "${themeCheck.join(', ')}"`
                              : '✓ Theme consistency check passed.'}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {!analysis && !loadingAnalysis && !loadingGhost && (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, paddingBottom: 60, userSelect: 'none' }}>
              <div style={{ fontSize: '3.5rem', filter: 'drop-shadow(0 0 24px rgba(99,102,241,0.6))' }}>🔍</div>
              <p style={{ color: 'rgba(196,181,253,0.7)', fontWeight: 500, fontSize: '0.88rem', textAlign: 'center' }}>
                Enter an artist name and click Analyze to produce a Style Report.
              </p>
              <p style={{ color: 'rgba(148,130,200,0.4)', fontSize: '0.78rem', textAlign: 'center' }}>
                Or use Ghost Rider to mimic writing, create Suno tags, and check lyrics for originality.
              </p>
            </div>
          )}
        </div>
      </div>
      </div>{/* end content wrapper */}
    </div>
  );
}
