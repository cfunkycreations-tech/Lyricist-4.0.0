import React, { useState } from 'react';
import { useLyricStore, genres, subgenres, moods, rhymeSchemes, rapFlowPatterns } from '../../context/LyricStore.jsx';
import SectionEditor from './SectionEditor.jsx';
import StructureBuilder from './StructureBuilder.jsx';
import { generateFullSong, fillBlank, generateBridgeVariations } from '../../services/AIService.js';
import { Sparkles, RefreshCw, Trash2, Undo, Redo, Copy, Check, FileText, HelpCircle, Layers, AlertCircle } from 'lucide-react';
import cfunkyLogoNew from '../../assets/cfunky-logo-new.jpg';
import profileImg from '../../assets/profile.jpg';
import songwriterBg from '../../assets/songwriter.mp4';

export default function SongwriterHub({ ghostRiderData }) {
  const store = useLyricStore();
  const [isGenerating, setIsGenerating] = useState(false);
  const [isFillingBlanks, setIsFillingBlanks] = useState(false);
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [bridgeVars, setBridgeVars] = useState(null);
  const [showBridgeModal, setShowBridgeModal] = useState(false);

  // Sync Ghost Rider OR Quantum Lab handoff if it came in
  React.useEffect(() => {
    if (!ghostRiderData) return;
    if (ghostRiderData.lyrics) {
      const lines = ghostRiderData.lyrics.split('\n').filter((l) => l.trim());
      const fromQuantum = ghostRiderData.source === 'quantum';
      const label = fromQuantum
        ? 'Quantum Lab Verse'
        : `Ghost Rider Verse (${ghostRiderData.artist || 'style'})`;
      store.setFullLyrics([
        {
          id: `sec-${Date.now()}`,
          name: label,
          type: 'verse',
          lines: lines.map((line) => ({
            text: line,
            locked: false,
            lockedWord: '',
            targetSyllables: 0,
            activeVariation: 'draft',
            variations: { draft: line, A: '', B: '', C: '' },
          })),
          adLibs: '',
          showAdLibs: false,
        },
      ]);
    }
    if (ghostRiderData.artist && ghostRiderData.source !== 'quantum') {
      store.setArtistRef(ghostRiderData.artist);
    }
    if (ghostRiderData.source === 'quantum' && ghostRiderData.notes && store.setNotes) {
      store.setNotes(ghostRiderData.notes);
    }
  }, [ghostRiderData]);

  const handleGenerate = async () => {
    if (!store.config.openRouterApiKey) {
      setErrorMsg('API Key is missing. Please go to the Settings tab and configure it.');
      return;
    }
    setIsGenerating(true);
    setErrorMsg('');
    try {
      const generatedSections = await generateFullSong(store);
      store.setFullLyrics(generatedSections);
    } catch (e) {
      setErrorMsg(e.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleFillBlanks = async () => {
    if (!store.config.openRouterApiKey) {
      setErrorMsg('API Key is missing.');
      return;
    }
    const fullText = store.getFullText();
    if (!fullText.includes('[blank]')) {
      alert("No '[blank]' tokens found in the lyrics. Type '[blank]' somewhere and try again.");
      return;
    }
    setIsFillingBlanks(true);
    try {
      const filledText = await fillBlank(fullText, store);
      // Re-parse sections from the text
      const parsedLines = filledText.split('\n');
      let currentSecIdx = -1;
      let lineIdx = 0;
      const updatedLyrics = store.lyrics.map(s => {
        const lines = s.lines.map(l => {
          // Find next non-empty line matching from output
          while (lineIdx < parsedLines.length && !parsedLines[lineIdx].trim()) {
            lineIdx++;
          }
          let textVal = l.text;
          if (lineIdx < parsedLines.length) {
            textVal = parsedLines[lineIdx].replace(/^\[.*?\]$/, '').trim();
            lineIdx++;
          }
          return {
            ...l,
            text: textVal,
            activeVariation: 'draft',
            variations: { draft: textVal, A: '', B: '', C: '' },
          };
        });
        return { ...s, lines };
      });
      store.setFullLyrics(updatedLyrics);
    } catch (e) {
      setErrorMsg(e.message);
    } finally {
      setIsFillingBlanks(false);
    }
  };

  const handleBridgeVariationsGen = async () => {
    if (!store.config.openRouterApiKey) {
      setErrorMsg('API Key is missing.');
      return;
    }
    setIsGenerating(true);
    try {
      const vars = await generateBridgeVariations(store, store.lyrics);
      setBridgeVars(vars);
      setShowBridgeModal(true);
    } catch (e) {
      setErrorMsg(e.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleApplyBridge = (bridgeText) => {
    const textLines = bridgeText.split('\n').filter(l => l.trim());
    const newBridgeSection = {
      id: `sec-${Date.now()}`,
      name: 'Bridge (AI Refined)',
      type: 'bridge',
      lines: textLines.map(t => ({
        text: t,
        locked: false,
        lockedWord: '',
        targetSyllables: 0,
        activeVariation: 'draft',
        variations: { draft: t, A: '', B: '', C: '' }
      })),
      adLibs: '',
      showAdLibs: false
    };
    store.setFullLyrics([...store.lyrics, newBridgeSection]);
    setShowBridgeModal(false);
  };

  const handleCopyAll = () => {
    const fullText = store.getFullText();
    navigator.clipboard.writeText(fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Keyword check
  const getMissingKeywords = () => {
    if (!store.topic) return [];
    // Flexible separators: commas, dashes, periods, spaces, or line breaks (any mix).
    const keywords = store.topic.split(/[,.\-\s]+/).map(w => w.trim().toLowerCase()).filter(w => w.length > 2);
    const lyricsText = store.lyrics.map(s => s.lines.map(l => l.text).join(' ')).join(' ').toLowerCase();
    
    return keywords.filter(kw => !lyricsText.includes(kw));
  };

  const missingKeywords = getMissingKeywords();

  return (
    <div style={{ position: 'relative', flex: 1, minHeight: 0, width: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'radial-gradient(70% 50% at 20% 0%, rgba(0,229,255,0.08) 0%, transparent 55%), radial-gradient(60% 45% at 85% 100%, rgba(168,85,247,0.08) 0%, transparent 50%), #04060f' }}>
      <video src={songwriterBg} autoPlay loop muted playsInline onCanPlay={(e) => { e.target.playbackRate = 0.67; }} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: 0, opacity: 0.75 }} />
      <div style={{ position: 'relative', zIndex: 1, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>


      {/* Songwriter controls — below the banner */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Scrollable configuration sidebar */}
      <div
        className="sidebar-cosmic"
        style={{
          width: 320,
          flexShrink: 0,
          overflowY: 'auto',
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 16
        }}
      >
        {/* Genre Selector */}
        <div data-help="Genre is the style of music — like Hip-Hop, Pop, or Country. It shapes the whole vibe of the words. Pick the one that fits the song you hear in your head.">
          <label style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(167,139,250,0.7)', marginBottom: 5, display: 'block' }}>
            Genre
          </label>
          <select
            value={store.genre}
            onChange={(e) => store.setGenre(e.target.value)}
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
            {genres.map(g => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </div>

        {/* Mood Selector */}
        <div data-help="Mood is the feeling of the song — happy, heartbroken, angry, hopeful, and so on. It tells the AI what emotion the lyrics should carry.">
          <label style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(167,139,250,0.7)', marginBottom: 5, display: 'block' }}>
            Mood
          </label>
          <select
            value={store.mood}
            onChange={(e) => store.setMood(e.target.value)}
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
            {moods.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>

        {/* Topic Input (Keywords) */}
        <div data-help="What the song is about, plus any words or images you want woven in. Type freely — separate ideas with commas, spaces, dashes, periods, or new lines, whatever feels natural. Example: city lights, midnight, running late.">
          <label style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(167,139,250,0.7)', marginBottom: 5, display: 'block' }}>
            Topic & Keyword Ideas
          </label>
          <textarea
            value={store.topic}
            onChange={(e) => store.setTopic(e.target.value)}
            placeholder="e.g. city lights - midnight - running late - suitcase"
            rows={2}
            style={{
              width: '100%',
              background: 'rgba(13,8,28,0.7)',
              border: '1px solid rgba(139,92,246,0.22)',
              borderRadius: 8,
              padding: '7px 10px',
              fontSize: '0.82rem',
              color: '#e8e0ff',
              outline: 'none',
              fontFamily: "'Space Grotesk', sans-serif",
              resize: 'none'
            }}
          />
        </div>

        {/* Artist Reference */}
        <div data-help="Optional. Name one or more artists whose vibe you want the lyrics to lean toward (separate them however you like). It borrows their FEEL — wording, energy, themes — not their actual song lyrics.">
          <label style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(167,139,250,0.7)', marginBottom: 5, display: 'block' }}>
            Artist Influence (optional)
          </label>
          <input
            value={store.artistRef}
            onChange={(e) => store.setArtistRef(e.target.value)}
            placeholder="e.g. Kendrick Lamar, Bob Dylan..."
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

        {/* Rhyme scheme, flow pattern & density */}
        <div style={{ padding: 10, background: 'rgba(124, 58, 237, 0.04)', borderRadius: 8, border: '1px solid rgba(124, 58, 237, 0.15)' }}>
          <span
            style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#c084fc', marginBottom: 8, display: 'block' }}
            data-help="These settings control the RHYTHM of the words — how the rhymes line up and how the lines bounce. All optional. Leave the defaults if you're not sure; you can always change them later."
          >
            Rhythm & Cadence
          </span>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div data-help="A rhyme scheme is the PATTERN of which lines rhyme with each other. For example, AABB means line 1 rhymes with line 2, and line 3 rhymes with line 4. 'Free' means don't force any pattern.">
              <label style={{ fontSize: '0.6rem', color: 'rgba(167,139,250,0.6)', display: 'block', marginBottom: 3 }}>Rhyme Scheme</label>
              <select
                value={store.rhymeScheme}
                onChange={(e) => store.setRhymeScheme(e.target.value)}
                style={{
                  width: '100%',
                  background: 'rgba(13,8,28,0.8)',
                  border: '1px solid rgba(139,92,246,0.2)',
                  borderRadius: 6,
                  padding: '5px 8px',
                  fontSize: '0.76rem',
                  color: '#e8e0ff',
                  outline: 'none'
                }}
              >
                {rhymeSchemes.map(rs => (
                  <option key={rs} value={rs}>{rs}</option>
                ))}
              </select>
            </div>

            <div data-help="How MANY rhymes get packed into the lines. Sparse = just a few (clean and clear). Balanced = a steady amount. Dense = lots, packed tight (common in rap). Extra Dense = even more. Maximum = rhymes nearly wall-to-wall.">
              <label style={{ fontSize: '0.6rem', color: 'rgba(167,139,250,0.6)', display: 'block', marginBottom: 3 }}>Rhyme Density (how many rhymes)</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                {[
                  { val: 'sparse', label: 'Sparse' },
                  { val: 'balanced', label: 'Balanced' },
                  { val: 'dense', label: 'Dense' },
                  { val: 'extra-dense', label: 'Extra Dense' },
                  { val: 'maximum', label: 'Maximum' }
                ].map(d => (
                  <button
                    key={d.val}
                    onClick={() => store.setRhymeDensity(d.val)}
                    style={{
                      flex: '1 0 30%',
                      padding: '4px 2px',
                      fontSize: '0.64rem',
                      fontWeight: 600,
                      borderRadius: 4,
                      border: 'none',
                      cursor: 'pointer',
                      background: store.rhymeDensity === d.val ? 'rgba(124,58,237,0.45)' : 'rgba(13,8,28,0.6)',
                      color: store.rhymeDensity === d.val ? '#fff' : 'rgba(167,139,250,0.5)'
                    }}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            {store.genre === 'Hip-Hop / Rap' && (
              <div data-help="Flow is the RHYTHM of how the words are rapped over the beat — fast, slow, choppy, smooth, triplets, and so on. It's like the heartbeat of the verse. (Shows up for Hip-Hop / Rap.)">
                <label style={{ fontSize: '0.6rem', color: 'rgba(167,139,250,0.6)', display: 'block', marginBottom: 3 }}>Rap Flow Pattern</label>
                <select
                  value={store.flowPattern}
                  onChange={(e) => store.setFlowPattern(e.target.value)}
                  style={{
                    width: '100%',
                    background: 'rgba(13,8,28,0.8)',
                    border: '1px solid rgba(139,92,246,0.2)',
                    borderRadius: 6,
                    padding: '5px 8px',
                    fontSize: '0.76rem',
                    color: '#e8e0ff',
                    outline: 'none'
                  }}
                >
                  {rapFlowPatterns.map(fp => (
                    <option key={fp} value={fp}>{fp}</option>
                  ))}
                </select>
              </div>
            )}

            <div data-help="Cadence (say: KAY-dence) is the way the words are DELIVERED — the pacing and attitude of the voice. Pick a ready-made style below, type your own, or both. Totally optional.">
              <label style={{ fontSize: '0.6rem', color: 'rgba(167,139,250,0.6)', display: 'block', marginBottom: 3 }}>Cadence / Delivery (how it's spoken)</label>
              <select
                value=""
                onChange={(e) => { if (e.target.value) store.setCadenceNotes(e.target.value); }}
                data-help="Quick-pick a delivery style. Choosing one fills in the box below, which you can then edit or add to."
                style={{
                  width: '100%',
                  background: 'rgba(13,8,28,0.8)',
                  border: '1px solid rgba(139,92,246,0.2)',
                  borderRadius: 6,
                  padding: '5px 8px',
                  fontSize: '0.74rem',
                  color: '#c4b5fd',
                  outline: 'none',
                  marginBottom: 5,
                  cursor: 'pointer'
                }}
              >
                <option value="">Pick a delivery style…</option>
                <option value="Laid-back, behind the beat">Laid-back (behind the beat)</option>
                <option value="Aggressive, punched-in">Aggressive (punched-in)</option>
                <option value="Smooth and melodic">Smooth / melodic</option>
                <option value="Conversational, like talking">Conversational</option>
                <option value="Rapid-fire and fast">Rapid-fire</option>
                <option value="Staccato, short and choppy">Staccato / choppy</option>
                <option value="Syncopated, slipping around the beat">Syncopated</option>
                <option value="Sing-rap, between singing and rapping">Sing-rap</option>
                <option value="Whispered and intimate">Whispered / intimate</option>
                <option value="Anthemic and belted out">Anthemic / belted</option>
                <option value="Spoken word, like poetry">Spoken word</option>
                <option value="Triplet-driven bounce">Triplet-driven</option>
                <option value="Drawn-out and smooth (legato)">Drawn-out / legato</option>
                <option value="Percussive, hitting like drums">Percussive</option>
              </select>
              <input
                value={store.cadenceNotes}
                onChange={(e) => store.setCadenceNotes(e.target.value)}
                placeholder="e.g. laid back and smooth, or fast and punchy"
                data-help="Type the delivery in your own words, or fine-tune the style you picked above."
                style={{
                  width: '100%',
                  background: 'rgba(13,8,28,0.8)',
                  border: '1px solid rgba(139,92,246,0.2)',
                  borderRadius: 6,
                  padding: '5px 8px',
                  fontSize: '0.76rem',
                  color: '#e8e0ff',
                  outline: 'none'
                }}
              />
            </div>
          </div>
        </div>

        {/* Structure Presets & Builder */}
        <StructureBuilder />

        {/* Hook first mode toggle */}
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 8 }}
          data-help="The HOOK (also called the chorus) is the catchy part of a song that repeats and sticks in your head. Turn this ON to write that catchy part FIRST, then build the rest of the song around it. Off = write the song in order, start to finish."
        >
          <input
            type="checkbox"
            id="hook-first-toggle"
            checked={store.hookFirstMode}
            onChange={(e) => store.setHookFirstMode(e.target.checked)}
            style={{ width: '16px', height: '16px', accentColor: '#a855f7' }}
          />
          <label htmlFor="hook-first-toggle" style={{ fontSize: '0.75rem', color: '#c4b5fd', cursor: 'pointer' }}>
            Hook-First Mode (write the catchy chorus first)
          </label>
        </div>

        {/* Notes */}
        <div data-help="Any extra instructions for the AI, in plain words. Use this to add rules or wishes — like 'keep it clean, no swearing,' 'use lots of comparisons,' or 'mention my hometown.' Optional.">
          <label style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(167,139,250,0.7)', marginBottom: 5, display: 'block' }}>
            Anything Else You Want (notes)
          </label>
          <textarea
            value={store.notes}
            onChange={(e) => store.setNotes(e.target.value)}
            placeholder="e.g. keep it clean, lots of comparisons, mention my hometown"
            rows={2}
            style={{
              width: '100%',
              background: 'rgba(13,8,28,0.7)',
              border: '1px solid rgba(139,92,246,0.22)',
              borderRadius: 8,
              padding: '7px 10px',
              fontSize: '0.82rem',
              color: '#e8e0ff',
              outline: 'none',
              fontFamily: "'Space Grotesk', sans-serif",
              resize: 'none'
            }}
          />
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            data-demo="sw-generate"
            className="btn-neon-purple pulse-glow"
            data-help="The big one. Click this and the AI writes a complete set of lyrics using all your choices above. You can edit, regenerate, or refine everything afterward. (Needs your AI key set up in Settings.)"
            style={{
              width: '100%',
              padding: '11px',
              borderRadius: 10,
              border: 'none',
              color: '#fff',
              fontSize: '0.88rem',
              fontWeight: 700,
              fontFamily: "'Space Grotesk', sans-serif",
              cursor: isGenerating ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8
            }}
          >
            <Sparkles size={16} />
            {isGenerating ? 'Channeling Muse...' : 'Generate Full Song'}
          </button>

          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={handleFillBlanks}
              disabled={isFillingBlanks}
              className="btn-neon-cyan"
              data-help="Stuck on a word or line? Type [blank] right in your lyrics wherever you're stuck, then click this and the AI fills in just those spots — keeping everything else you wrote."
              style={{
                flex: 1,
                padding: '8px',
                borderRadius: 8,
                border: 'none',
                color: '#fff',
                fontSize: '0.78rem',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              Fill [blank]
            </button>

            <button
              onClick={handleBridgeVariationsGen}
              className="btn-neon-cyan"
              data-help="A BRIDGE is a short section near the end that breaks the pattern and adds a twist — a change of feeling before the final chorus. This gives you 3 different bridge options to pick from."
              style={{
                flex: 1,
                padding: '8px',
                borderRadius: 8,
                border: 'none',
                color: '#fff',
                fontSize: '0.78rem',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              Bridge Alternatives
            </button>
          </div>
        </div>
      </div>

      {/* Main Lyrics Editor workspace */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'rgba(7,5,15,0.45)' }}>
        {/* Workspace Toolbar */}
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span
              style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(167,139,250,0.5)' }}
              data-help="This is your editing area. Once you generate a song, each section (verse, chorus, etc.) shows up here for you to tweak line by line."
            >
              Songwriter Workspace
            </span>

            {/* Keyword Alert */}
            {missingKeywords.length > 0 && store.lyrics.length > 0 && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: '0.7rem',
                  color: '#f87171',
                  background: 'rgba(239, 68, 68, 0.1)',
                  padding: '2px 8px',
                  borderRadius: 6,
                  border: '1px solid rgba(239, 68, 68, 0.2)'
                }}
                data-help="A friendly heads-up: these are topic words you asked for that haven't made it into the lyrics yet. Not an error — just so you can work them in if you want."
              >
                <AlertCircle size={12} />
                <span>Missing Ideas: {missingKeywords.join(', ')}</span>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {/* Undo / Redo — clear labeled buttons after refine/edit */}
            <button
              type="button"
              onClick={store.undo}
              disabled={!store.canUndo}
              data-help="Undo — takes back your last change (including a Refine or regenerate). Safe anytime."
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '5px 12px',
                borderRadius: 8,
                border: `1px solid ${store.canUndo ? 'rgba(0,229,255,0.45)' : 'rgba(100,100,120,0.25)'}`,
                background: store.canUndo ? 'rgba(0,229,255,0.12)' : 'rgba(20,20,30,0.4)',
                color: store.canUndo ? '#e8eef8' : 'rgba(140,140,160,0.4)',
                cursor: store.canUndo ? 'pointer' : 'not-allowed',
                fontSize: '0.72rem',
                fontWeight: 700,
                letterSpacing: '0.04em',
              }}
            >
              <Undo size={14} />
              Undo
            </button>

            <button
              type="button"
              onClick={store.redo}
              disabled={!store.canRedo}
              data-help="Redo — puts back a change you just undid."
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '5px 12px',
                borderRadius: 8,
                border: `1px solid ${store.canRedo ? 'rgba(168,85,247,0.5)' : 'rgba(100,100,120,0.25)'}`,
                background: store.canRedo ? 'rgba(168,85,247,0.14)' : 'rgba(20,20,30,0.4)',
                color: store.canRedo ? '#e8eef8' : 'rgba(140,140,160,0.4)',
                cursor: store.canRedo ? 'pointer' : 'not-allowed',
                fontSize: '0.72rem',
                fontWeight: 700,
                letterSpacing: '0.04em',
              }}
            >
              <Redo size={14} />
              Redo
            </button>

            {store.lyrics.length > 0 && (
              <>
                <button
                  onClick={handleCopyAll}
                  data-help="Copies the whole song as text so you can paste it anywhere — a notes app, an email, or a music tool like Suno."
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    padding: '4px 12px',
                    borderRadius: 6,
                    border: '1px solid rgba(139,92,246,0.35)',
                    background: 'transparent',
                    color: copied ? '#34d399' : 'rgba(196,181,253,0.7)',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                >
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                  {copied ? 'Copied!' : 'Copy Full Song'}
                </button>

                <button
                  onClick={store.clearLyrics}
                  data-help="Erases all the lyrics in the workspace to start fresh. Don't worry — if you click it by accident, the Undo button brings everything back."
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    padding: '4px 12px',
                    borderRadius: 6,
                    border: '1px solid rgba(239,68,68,0.3)',
                    background: 'transparent',
                    color: 'rgba(248,113,113,0.7)',
                    cursor: 'pointer'
                  }}
                >
                  Clear All
                </button>
              </>
            )}
          </div>
        </div>

        {/* Error message */}
        {errorMsg && (
          <div className="pill-red" style={{ margin: '10px 20px', padding: '10px 14px', borderRadius: 8, fontSize: '0.82rem' }}>
            {errorMsg}
          </div>
        )}

        {/* Workspace Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          {store.lyrics.length > 0 ? (
            store.lyrics.map((section, idx) => (
              <SectionEditor key={section.id} section={section} index={idx} />
            ))
          ) : (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyCenter: 'center', gap: 12, paddingBottom: 60, userSelect: 'none', justifyContent: 'center' }}>
              <div style={{ fontSize: '4rem', filter: 'drop-shadow(0 0 30px rgba(168,85,247,0.6))' }}>🎵</div>
              <p style={{ color: 'rgba(196,181,253,0.7)', fontWeight: 500, fontSize: '0.9rem', textAlign: 'center' }}>
                {isGenerating ? 'Coaxing the words from the ether...' : 'Configure your options and click Generate Full Song.'}
              </p>
              {!isGenerating && (
                <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.65rem', color: 'rgba(148,130,200,0.35)', textAlign: 'center' }}>
                  Model: {store.config.model}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      </div>{/* end songwriter controls row */}

      {/* Bridge Alternatives Modal */}
      {showBridgeModal && bridgeVars && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            background: 'rgba(5,2,14,0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20
          }}
        >
          <div
            className="card-cosmic"
            style={{
              width: '100%',
              maxWidth: '850px',
              maxHeight: '85vh',
              overflowY: 'auto',
              background: '#0d081c',
              border: '1px solid rgba(139,92,246,0.35)',
              borderRadius: 14,
              padding: 24,
              boxShadow: '0 0 40px rgba(124,58,237,0.4)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ fontSize: '1.2rem', fontFamily: "'Syne', sans-serif", fontWeight: 800 }}>
                🌉 Alternate Bridge Variations
              </h3>
              <button
                onClick={() => setShowBridgeModal(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'rgba(167,139,250,0.6)',
                  fontSize: '1.2rem',
                  cursor: 'pointer'
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 20 }}>
              <div style={{ padding: 12, background: 'rgba(13,8,28,0.7)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: 8 }}>
                <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#e879f9', display: 'block', marginBottom: 8 }} data-help="A bridge that changes the STORY — adds a surprise, a new point of view, or a turn in what the song is saying.">
                  NARRATIVE TWIST
                </span>
                <pre style={{ fontSize: '0.74rem', fontFamily: "'Audiowide', 'JetBrains Mono', monospace", color: '#e8e0ff', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                  {bridgeVars.A}
                </pre>
                <button
                  onClick={() => handleApplyBridge(bridgeVars.A)}
                  style={{
                    marginTop: 10,
                    width: '100%',
                    padding: '6px',
                    fontSize: '0.72rem',
                    background: 'rgba(139,92,246,0.2)',
                    border: '1px solid rgba(139,92,246,0.4)',
                    color: '#fff',
                    borderRadius: 6,
                    cursor: 'pointer'
                  }}
                >
                  Use Twist
                </button>
              </div>

              <div style={{ padding: 12, background: 'rgba(13,8,28,0.7)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: 8 }}>
                <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#22d3ee', display: 'block', marginBottom: 8 }} data-help="A bridge that hits the hardest FEELING — the most heartfelt, intense moment of the whole song.">
                  EMOTIONAL PEAK
                </span>
                <pre style={{ fontSize: '0.74rem', fontFamily: "'Audiowide', 'JetBrains Mono', monospace", color: '#e8e0ff', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                  {bridgeVars.B}
                </pre>
                <button
                  onClick={() => handleApplyBridge(bridgeVars.B)}
                  style={{
                    marginTop: 10,
                    width: '100%',
                    padding: '6px',
                    fontSize: '0.72rem',
                    background: 'rgba(139,92,246,0.2)',
                    border: '1px solid rgba(139,92,246,0.4)',
                    color: '#fff',
                    borderRadius: 6,
                    cursor: 'pointer'
                  }}
                >
                  Use Peak
                </button>
              </div>

              <div style={{ padding: 12, background: 'rgba(13,8,28,0.7)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: 8 }}>
                <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#34d399', display: 'block', marginBottom: 8 }} data-help="A bridge that changes the SOUND and rhythm — a different flow or energy, so the ear gets something fresh before the last chorus.">
                  SONIC SHIFT
                </span>
                <pre style={{ fontSize: '0.74rem', fontFamily: "'Audiowide', 'JetBrains Mono', monospace", color: '#e8e0ff', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                  {bridgeVars.C}
                </pre>
                <button
                  onClick={() => handleApplyBridge(bridgeVars.C)}
                  style={{
                    marginTop: 10,
                    width: '100%',
                    padding: '6px',
                    fontSize: '0.72rem',
                    background: 'rgba(139,92,246,0.2)',
                    border: '1px solid rgba(139,92,246,0.4)',
                    color: '#fff',
                    borderRadius: 6,
                    cursor: 'pointer'
                  }}
                >
                  Use Shift
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
