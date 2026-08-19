import React, { useState, useRef, useEffect } from 'react';
import { useLyricStore, genres, moods } from '../../context/LyricStore.jsx';
import {
  generateSongWithGemini,
  generateCoverArt,
  generateCoverArtFromReference,
  generateImage,
  generateSongFromImage
} from '../../services/GeminiService.js';
import { Wand2, Download, Send, Copy, RefreshCw, Upload, Shuffle, Sparkles, Image as ImageIcon, X } from 'lucide-react';
import { registerDemoSnapshot } from '../../services/demoSafety.js';

import TabBackground from '../common/TabBackground.jsx';
const SURPRISE_TOPICS = [
  'a rainy drive at 2am with the radio off',
  'burning the recipe your mom left you',
  'a text message you typed and never sent',
  'the last light on in a house you used to live in',
  'finding an old mixtape in a glovebox',
  'the sound a city makes right before sunrise',
  'a stranger who looked like someone you used to know',
  'the space between two people at the same dinner table',
  'a promise made in a parking lot',
  'the smell of rain on a sidewalk you grew up on'
];

function deriveTitle(sections) {
  const chorus = sections.find(s => s.type === 'chorus') || sections[0];
  const line = chorus?.lines?.[0]?.text || '';
  return line.replace(/[.,!?]+$/, '').trim();
}

function fileToImagePayload(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      const base64 = String(dataUrl).split(',')[1] || '';
      resolve({ dataUrl, base64, mimeType: file.type || 'image/png' });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function SongForge({ onSongForged, quantumSeed, onQuantumSeedConsumed }) {
  const store = useLyricStore();
  const fileInputRef = useRef(null);

  const [mode, setMode] = useState('songFirst'); // 'songFirst' | 'artFirst'
  const [artStyleOverride, setArtStyleOverride] = useState('');
  const [quantumBanner, setQuantumBanner] = useState(null);

  // Quantum Lab → Song Forge seed (palette + optional verse + end-words)
  useEffect(() => {
    if (!quantumSeed) return;
    const parts = [];
    if (quantumSeed.palette?.length) parts.push(`Lattice words: ${quantumSeed.palette.join(', ')}`);
    if (quantumSeed.endWords?.length) parts.push(`End rhymes: ${quantumSeed.endWords.join(', ')}`);
    if (quantumSeed.rhymeScheme) parts.push(`Scheme: ${quantumSeed.rhymeScheme}`);
    if (quantumSeed.verse) parts.push(`Seed verse:\n${quantumSeed.verse}`);
    const note = parts.join('\n');
    if (note) {
      store.setNotes((store.notes ? store.notes + '\n\n' : '') + `[From Quantum Lab]\n${note}`);
      if (!store.topic && quantumSeed.palette?.[0]) {
        store.setTopic(quantumSeed.palette.slice(0, 4).join(' / '));
      }
      setQuantumBanner('Quantum Lab lattice loaded into Song Forge notes/topic. Hit Song First to expand into a full song + cover.');
    }
    if (onQuantumSeedConsumed) onQuantumSeedConsumed();
  }, [quantumSeed]);

  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState(''); // 'lyrics' | 'art' | ''
  const [remixLoading, setRemixLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [result, setResult] = useState(null); // { song, art, title }
  const [titleDraft, setTitleDraft] = useState('');
  const [copied, setCopied] = useState(false);
  const [sent, setSent] = useState(false);
  const [saveNote, setSaveNote] = useState('');

  const [autoSave, setAutoSave] = useState(() => {
    const v = localStorage.getItem('lyricistSongForgeAutoSave');
    return v === null ? true : v === 'true';
  });
  useEffect(() => {
    localStorage.setItem('lyricistSongForgeAutoSave', String(autoSave));
  }, [autoSave]);

  // Art-first mode state
  const [seedImage, setSeedImage] = useState(null); // { dataUrl, base64, mimeType }
  const [seedPrompt, setSeedPrompt] = useState('');
  const [seedLoading, setSeedLoading] = useState(false);
  const [imageNotes, setImageNotes] = useState('');

  // Image-to-image reference (4.1.3): the user's uploaded image becomes the
  // primary visual base layer for cover-art generation.
  const refInputRef = useRef(null);
  const [refImage, setRefImage] = useState(null); // { dataUrl, base64, mimeType }

  // The demo forges a whole song and cover of its own. Anything you forged
  // before it ran comes straight back when it's over.
  const demoRef = useRef(null);
  demoRef.current = { mode, artStyleOverride, result, titleDraft, seedImage, seedPrompt, imageNotes, refImage };
  useEffect(() => registerDemoSnapshot('song-forge', {
    snapshot: () => ({ ...demoRef.current }),
    restore: (s) => {
      if (!s) return;
      setMode(s.mode);
      setArtStyleOverride(s.artStyleOverride);
      setResult(s.result);
      setTitleDraft(s.titleDraft);
      setSeedImage(s.seedImage);
      setSeedPrompt(s.seedPrompt);
      setImageNotes(s.imageNotes);
      setRefImage(s.refImage);
    },
    hasWork: () => Boolean(demoRef.current.result || demoRef.current.seedImage || demoRef.current.refImage),
  }), []);

  // One key: OpenRouter (lyrics + Nano Banana cover art via OpenRouter)
  const ready = Boolean(store.config.openRouterApiKey);

  const autoSaveResult = async (song, art, title) => {
    if (!autoSave || !window.lyricistAPI?.saveSongForge) return;
    try {
      const res = await window.lyricistAPI.saveSongForge({
        title: title || 'Untitled Song',
        lyricsContent: song.rawText,
        imageBase64: art?.base64 || null
      });
      setSaveNote(res?.ok
        ? '✓ Saved to Documents\\Lyricist Song Forge'
        : `Could not save: ${res?.error || 'unknown error'}`);
    } catch (e) {
      setSaveNote(`Could not save: ${e.message}`);
    }
    setTimeout(() => setSaveNote(''), 6000);
  };

  // Song-first: write the lyrics, then paint matching cover art
  const handleForgeSongFirst = async () => {
    if (!ready) { setErrorMsg('Add your OpenRouter API key in Settings first — one key runs Song Forge lyrics and cover art.'); return; }
    setLoading(true);
    setErrorMsg('');
    setResult(null);
    setSent(false);
    try {
      setStage('lyrics');
      const song = await generateSongWithGemini(store);
      const title = deriveTitle(song.sections) || store.topic || store.genre;
      setStage('art');
      // Image-to-image when a reference is loaded; plain text-to-image otherwise.
      const art = refImage
        ? await generateCoverArtFromReference(store, {
            referenceBase64: refImage.base64,
            referenceMimeType: refImage.mimeType,
            title, topic: store.topic, styleOverride: artStyleOverride
          })
        : await generateCoverArt(store, { title, topic: store.topic, styleOverride: artStyleOverride });
      setResult({ song, art, title });
      setTitleDraft(title);
      autoSaveResult(song, art, title);
    } catch (e) {
      setErrorMsg(e.message);
    } finally {
      setLoading(false);
      setStage('');
    }
  };

  // Art-first: generate (or accept an uploaded) image, then write lyrics inspired by it
  const handleGenerateSeedImage = async () => {
    if (!ready) { setErrorMsg('Add your OpenRouter API key in Settings first — one key runs Song Forge lyrics and cover art.'); return; }
    setSeedLoading(true);
    setErrorMsg('');
    try {
      const img = await generateImage(store, { prompt: seedPrompt });
      setSeedImage(img);
      setResult(null);
    } catch (e) {
      setErrorMsg(e.message);
    } finally {
      setSeedLoading(false);
    }
  };

  // Image-to-image reference upload (4.1.3)
  const handleUploadReference = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const payload = await fileToImagePayload(file);
      setRefImage(payload);
      setErrorMsg('');
    } catch (err) {
      setErrorMsg('Could not read that reference image file.');
    }
    e.target.value = '';
  };

  const handleUploadImage = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const payload = await fileToImagePayload(file);
      setSeedImage(payload);
      setResult(null);
      setErrorMsg('');
    } catch (err) {
      setErrorMsg('Could not read that image file.');
    }
    e.target.value = '';
  };

  const handleWriteLyricsFromImage = async () => {
    if (!ready) { setErrorMsg('Add your OpenRouter API key in Settings first — one key runs Song Forge lyrics and cover art.'); return; }
    if (!seedImage) { setErrorMsg('Upload or generate an image first.'); return; }
    setLoading(true);
    setStage('lyrics');
    setErrorMsg('');
    setSent(false);
    try {
      const song = await generateSongFromImage(store, {
        imageBase64: seedImage.base64,
        mimeType: seedImage.mimeType,
        notes: imageNotes
      });
      const title = deriveTitle(song.sections) || store.topic || 'Untitled Song';
      setResult({ song, art: seedImage, title });
      setTitleDraft(title);
      autoSaveResult(song, seedImage, title);
    } catch (e) {
      setErrorMsg(e.message);
    } finally {
      setLoading(false);
      setStage('');
    }
  };

  // Re-roll just the cover art, keeping the lyrics — either mode.
  const handleRemixArt = async () => {
    if (!result?.song) return;
    setRemixLoading(true);
    setErrorMsg('');
    try {
      const art = refImage
        ? await generateCoverArtFromReference(store, {
            referenceBase64: refImage.base64,
            referenceMimeType: refImage.mimeType,
            title: titleDraft || result.title,
            topic: store.topic,
            styleOverride: artStyleOverride
          })
        : await generateCoverArt(store, {
            title: titleDraft || result.title,
            topic: store.topic,
            styleOverride: artStyleOverride
          });
      setResult(prev => ({ ...prev, art, title: titleDraft || prev.title }));
    } catch (e) {
      setErrorMsg(e.message);
    } finally {
      setRemixLoading(false);
    }
  };

  const handleSurpriseMe = () => {
    const genre = genres[Math.floor(Math.random() * genres.length)];
    const mood = moods[Math.floor(Math.random() * moods.length)];
    const topic = SURPRISE_TOPICS[Math.floor(Math.random() * SURPRISE_TOPICS.length)];
    store.setGenre(genre);
    store.setMood(mood);
    store.setTopic(topic);
  };

  const handleSendToWorkspace = () => {
    if (!result?.song?.sections?.length) return;
    store.setFullLyrics(result.song.sections);
    setSent(true);
    if (onSongForged) onSongForged();
  };

  const handleDownloadArt = () => {
    if (!result?.art?.dataUrl) return;
    const a = document.createElement('a');
    a.href = result.art.dataUrl;
    a.download = `${(titleDraft || result.title || 'lyricist-cover').replace(/[\\/:*?"<>|]/g, '-')}.png`;
    a.click();
  };

  const handleCopyLyrics = () => {
    if (!result?.song?.rawText) return;
    navigator.clipboard.writeText(result.song.rawText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const busy = loading || seedLoading || remixLoading;

  return (
    <div className="tab-video-shell">
      <TabBackground name="songforge" />
      <div className="tab-video-content">
    <div style={{ flex: 1, minHeight: 0, width: '100%', display: 'flex', overflow: 'hidden' }}>
      <div className="songforge-shell">
        {/* Controls sidebar */}
        <div className="songforge-sidebar" style={{ background: 'rgba(0,0,0,0.34)', borderRight: '1px solid rgba(34,211,238,0.2)' }}>
          <div>
            <h3 style={{ fontSize: '1rem', marginBottom: 4 }}>🪄 Song Forge</h3>
            <p style={{ fontSize: '0.72rem', color: 'rgba(196,181,253,0.7)', lineHeight: 1.5 }}>
              Chain Gemini text + Nano Banana image calls to auto-generate a song and its cover art — either direction.
            </p>
          </div>

          {!ready && (
            <div className="pill-red" style={{ padding: '8px 10px', borderRadius: 8, fontSize: '0.72rem' }}>
              Add your OpenRouter API key in Settings — one key for Song Forge lyrics and cover art.
            </div>
          )}

          {quantumBanner && (
            <div className="pill-green" style={{ padding: '8px 10px', borderRadius: 8, fontSize: '0.72rem', lineHeight: 1.45 }} data-help="Structure arrived from Quantum Lab — notes and topic were pre-filled.">
              ⚛️ {quantumBanner}
              <button type="button" onClick={() => setQuantumBanner(null)} style={{ display: 'block', marginTop: 6, background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '0.65rem' }}>Dismiss</button>
            </div>
          )}

          {/* Mode toggle */}
          <div style={{ display: 'flex', gap: 6 }} data-demo="sf-mode" data-help="Song First writes the lyrics, then paints matching cover art. Art First flips it: create or upload an image, then Gemini writes a song inspired by it.">
            {[['songFirst', '🎵 Song First'], ['artFirst', '🎨 Art First']].map(([id, label]) => (
              <button
                key={id}
                onClick={() => { setMode(id); setErrorMsg(''); }}
                style={{
                  flex: 1,
                  padding: '8px 4px',
                  borderRadius: 8,
                  border: mode === id ? 'none' : '1px solid rgba(139,92,246,0.25)',
                  background: mode === id ? 'linear-gradient(135deg,#ff2d95,#a855f7,#00e5ff)' : 'rgba(13,8,28,0.7)',
                  color: mode === id ? '#fff' : 'rgba(196,181,253,0.6)',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                {label}
              </button>
            ))}
          </div>

          <div data-help="Reuses the same Genre, Subgenre, Mood, Topic, and Structure you've set on the Songwriter tab.">
            <label style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(103,232,249,0.7)', marginBottom: 5, display: 'block' }}>
              Using current Songwriter setup
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.74rem', color: '#e8e0ff' }}>
              <div><strong>Genre:</strong> {store.genre}{store.subgenre ? ` — ${store.subgenre}` : ''}</div>
              <div><strong>Mood:</strong> {store.mood}</div>
              <div><strong>Topic:</strong> {store.topic || 'Not set'}</div>
              {mode === 'songFirst' && <div><strong>Structure:</strong> {store.customStructure.join(' → ')}</div>}
            </div>
            <button
              onClick={handleSurpriseMe}
              data-help="Feeling stuck? Randomizes the Genre, Mood, and Topic to something unexpected — a quick spark for when you don't know what to write about."
              style={{
                marginTop: 8,
                width: '100%',
                padding: '7px',
                borderRadius: 8,
                border: '1px solid rgba(232,121,249,0.35)',
                background: 'rgba(232,121,249,0.1)',
                color: '#e879f9',
                fontSize: '0.72rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6
              }}
            >
              <Shuffle size={12} /> Surprise Me
            </button>
          </div>

          {mode === 'songFirst' ? (
            <>
              <div data-help="Override Song Forge's default circular-medallion, magenta/orange neon cover art style just for this song. Leave it blank to keep the signature look.">
                <label style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(103,232,249,0.7)', marginBottom: 5, display: 'block' }}>
                  Cover Art Style Override (optional)
                </label>
                <textarea
                  value={artStyleOverride}
                  onChange={(e) => setArtStyleOverride(e.target.value)}
                  placeholder="Leave blank for the signature medallion look..."
                  rows={3}
                  style={{ width: '100%', background: 'rgba(13,8,28,0.7)', border: '1px solid rgba(34,211,238,0.22)', borderRadius: 8, padding: '7px 10px', fontSize: '0.78rem', color: '#e8e0ff', outline: 'none', resize: 'vertical' }}
                />
              </div>

              {/* Image-to-image reference (4.1.3) */}
              <div data-help="Upload a photo or artwork to use as the visual base layer for the cover. Nano Banana reinterprets YOUR image as the medallion art instead of inventing one from scratch. The neon magenta/orange circular frame is always enforced.">
                <label style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(103,232,249,0.7)', marginBottom: 5, display: 'block' }}>
                  Reference Image (image-to-image)
                </label>
                <input ref={refInputRef} type="file" accept="image/*" onChange={handleUploadReference} style={{ display: 'none' }} />
                <button
                  onClick={() => refInputRef.current?.click()}
                  style={{ width: '100%', padding: '9px', borderRadius: 8, border: '1px solid rgba(255,45,149,0.35)', background: 'rgba(255,45,149,0.08)', color: '#ff7eb6', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                >
                  <ImageIcon size={13} /> Upload Reference Image
                </button>
                {refImage && (
                  <div style={{ position: 'relative', marginTop: 8, borderRadius: 10, overflow: 'hidden', border: '1px solid rgba(255,45,149,0.4)', boxShadow: '0 0 12px rgba(255,45,149,0.25)' }}>
                    <img src={refImage.dataUrl} alt="Cover art reference" style={{ width: '100%', display: 'block' }} />
                    <button
                      onClick={() => setRefImage(null)}
                      aria-label="Remove reference image"
                      data-help="Remove the reference image and go back to pure text-to-image cover art."
                      style={{ position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.7)', color: '#ff7eb6', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <X size={12} />
                    </button>
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '3px 8px', fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#00e5ff', background: 'rgba(0,0,0,0.65)', textShadow: '0 0 6px rgba(0,229,255,0.6)' }}>
                      Base layer for cover art
                    </div>
                  </div>
                )}
              </div>

              <button
                onClick={handleForgeSongFirst}
                disabled={busy || !ready}
                className="btn-neon-cyan"
                data-demo="sf-forge"
                data-help="Writes a full song with Gemini, then generates matching cover art. Two chained AI calls, so it takes a bit longer than a single generation."
                style={{ width: '100%', padding: '11px', borderRadius: 8, border: 'none', color: '#fff', fontSize: '0.84rem', fontWeight: 700, cursor: busy || !ready ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
              >
                {loading ? (
                  <><RefreshCw size={15} className="pulse-glow" /> {stage === 'lyrics' ? 'Writing lyrics...' : 'Painting cover art...'}</>
                ) : (
                  <><Wand2 size={15} /> Forge Song + Cover Art</>
                )}
              </button>
            </>
          ) : (
            <>
              <div data-help="Type what you want to see, and Nano Banana paints it — or upload your own photo/art below instead. Either becomes the creative seed for the lyrics.">
                <label style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(103,232,249,0.7)', marginBottom: 5, display: 'block' }}>
                  Describe an image to create
                </label>
                <textarea
                  value={seedPrompt}
                  onChange={(e) => setSeedPrompt(e.target.value)}
                  placeholder="e.g. an empty diner at 3am, neon sign flickering in the window..."
                  rows={3}
                  style={{ width: '100%', background: 'rgba(13,8,28,0.7)', border: '1px solid rgba(34,211,238,0.22)', borderRadius: 8, padding: '7px 10px', fontSize: '0.78rem', color: '#e8e0ff', outline: 'none', resize: 'vertical' }}
                />
                <button
                  onClick={handleGenerateSeedImage}
                  disabled={busy || !ready || !seedPrompt.trim()}
                  className="btn-neon-purple"
                  style={{ marginTop: 8, width: '100%', padding: '9px', borderRadius: 8, border: 'none', color: '#fff', fontSize: '0.78rem', fontWeight: 700, cursor: busy || !ready ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                >
                  {seedLoading ? <><RefreshCw size={13} className="pulse-glow" /> Painting...</> : <><ImageIcon size={13} /> Generate Image</>}
                </button>
              </div>

              <div style={{ textAlign: 'center', fontSize: '0.65rem', color: 'rgba(148,130,200,0.5)' }}>— or —</div>

              <div>
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleUploadImage} style={{ display: 'none' }} />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  data-help="Use your own photo or artwork as the song's creative seed instead of generating one."
                  style={{ width: '100%', padding: '9px', borderRadius: 8, border: '1px solid rgba(139,92,246,0.25)', background: 'rgba(13,8,28,0.7)', color: 'rgba(196,181,253,0.7)', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                >
                  <Upload size={13} /> Upload Your Own Image
                </button>
              </div>

              {seedImage && (
                <>
                  <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid rgba(34,211,238,0.3)' }}>
                    <img src={seedImage.dataUrl} alt="Seed" style={{ width: '100%', display: 'block' }} />
                  </div>
                  <div data-help="Optional extra direction for the lyrics — a mood word, a memory, a perspective — on top of whatever the image itself suggests.">
                    <label style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(103,232,249,0.7)', marginBottom: 5, display: 'block' }}>
                      Extra Direction (optional)
                    </label>
                    <textarea
                      value={imageNotes}
                      onChange={(e) => setImageNotes(e.target.value)}
                      placeholder="e.g. write it from the perspective of the person who left..."
                      rows={2}
                      style={{ width: '100%', background: 'rgba(13,8,28,0.7)', border: '1px solid rgba(34,211,238,0.22)', borderRadius: 8, padding: '7px 10px', fontSize: '0.78rem', color: '#e8e0ff', outline: 'none', resize: 'vertical' }}
                    />
                  </div>
                  <button
                    onClick={handleWriteLyricsFromImage}
                    disabled={busy || !ready}
                    className="btn-neon-cyan"
                    style={{ width: '100%', padding: '11px', borderRadius: 8, border: 'none', color: '#fff', fontSize: '0.84rem', fontWeight: 700, cursor: busy || !ready ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                  >
                    {loading ? <><RefreshCw size={15} className="pulse-glow" /> Writing lyrics...</> : <><Sparkles size={15} /> Write Lyrics From This Image</>}
                  </button>
                </>
              )}
            </>
          )}

          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', fontWeight: 400 }} data-help="When on, every finished song + cover art pair is automatically saved into Documents\Lyricist Song Forge.">
            <input type="checkbox" checked={autoSave} onChange={(e) => setAutoSave(e.target.checked)} style={{ marginTop: 3, accentColor: '#e879f9', cursor: 'pointer' }} />
            <span style={{ fontSize: '0.7rem', color: '#c4b5fd', lineHeight: 1.4 }}>
              Auto-save to Documents\Lyricist Song Forge
            </span>
          </label>
          {saveNote && <span style={{ fontSize: '0.66rem', color: '#34d399', fontWeight: 600 }}>{saveNote}</span>}
        </div>

        {/* Results */}
        <div className="songforge-main" style={{ background: 'rgba(7,5,15,0.45)' }}>
          {errorMsg && (
            <div className="pill-red" style={{ padding: '10px 14px', borderRadius: 8, fontSize: '0.82rem', marginBottom: 16 }}>
              {errorMsg}
            </div>
          )}

          {!result && !busy && !errorMsg && (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 300 }}>
              <div style={{ fontSize: '3rem' }}>🪄</div>
              <p style={{ color: 'rgba(196,181,253,0.7)', fontSize: '0.88rem', textAlign: 'center', maxWidth: 360 }}>
                {mode === 'songFirst'
                  ? 'Set up your song on the Songwriter tab, then click "Forge Song + Cover Art" to have Gemini write it and paint the cover.'
                  : 'Generate or upload an image on the left, then have Gemini write a song inspired by it.'}
              </p>
            </div>
          )}

          {result && (
            <div className="songforge-results">
              {/* Lyrics panel */}
              <div className="card-cosmic" style={{ borderRadius: 12, padding: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 10, flexWrap: 'wrap' }}>
                  <input
                    value={titleDraft}
                    onChange={(e) => setTitleDraft(e.target.value)}
                    data-help="Editable song title — used as the file name for downloads/auto-save, and fed into Remix Art if you re-roll the cover."
                    style={{ fontSize: '1rem', fontWeight: 700, background: 'transparent', border: 'none', borderBottom: '1px dashed rgba(255,45,149,0.3)', color: '#ff8020', outline: 'none', minWidth: 120, flex: 1 }}
                  />
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button onClick={handleCopyLyrics} style={{ fontSize: '0.7rem', background: 'transparent', border: '1px solid rgba(34,211,238,0.3)', color: copied ? '#34d399' : 'rgba(196,181,253,0.7)', padding: '4px 10px', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Copy size={12} /> {copied ? 'Copied' : 'Copy'}
                    </button>
                    <button
                      onClick={handleSendToWorkspace}
                      className="btn-neon-purple"
                      data-demo="sf-send"
                      data-help="Sends this song into the Songwriter tab, broken into editable sections, so you can polish it line by line."
                      style={{ fontSize: '0.7rem', border: 'none', color: '#fff', padding: '4px 10px', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 700 }}
                    >
                      <Send size={12} /> {sent ? 'Sent!' : 'Send to Songwriter'}
                    </button>
                  </div>
                </div>
                <pre className="songforge-lyrics-text" style={{ fontFamily: "'Audiowide', 'JetBrains Mono', monospace", color: '#e8e0ff', whiteSpace: 'pre-wrap', margin: 0 }}>
                  {result.song.rawText}
                </pre>
              </div>

              {/* Cover art medallion */}
              <div className="songforge-medallion-wrap">
                <div className="songforge-medallion">
                  <img src={result.art.dataUrl} alt={`Cover art for ${titleDraft}`} />
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                  <button onClick={handleDownloadArt} className="btn-neon-cyan" style={{ border: 'none', color: '#fff', padding: '8px 16px', borderRadius: 8, fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Download size={13} /> Download
                  </button>
                  <button
                    onClick={handleRemixArt}
                    disabled={remixLoading}
                    data-help="Re-rolls just the cover art with a fresh generation, keeping the same lyrics. Uses the current title and style override."
                    style={{ border: '1px solid rgba(232,121,249,0.35)', background: 'rgba(232,121,249,0.1)', color: '#e879f9', padding: '8px 16px', borderRadius: 8, fontSize: '0.76rem', fontWeight: 700, cursor: remixLoading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                  >
                    <RefreshCw size={13} className={remixLoading ? 'pulse-glow' : ''} /> {remixLoading ? 'Remixing...' : 'Remix Art'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
      </div>
    </div>
  );
}
