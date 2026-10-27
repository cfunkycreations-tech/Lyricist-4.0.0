import React, { useState, useEffect, useRef } from 'react';
import TabBackground from '../common/TabBackground.jsx';
import { registerGhostActions, ghostSettle } from '../../services/ghostBus.js';
import { randomArtist, saveSunoTags } from '../../services/ghostMemory.js';
import { applySongTags } from '../../services/songTags.js';
import { writeStylePressure, writeMatrixWords } from '../QuantumLab/quantumFeatures.js';
import { useLyricStore } from '../../context/LyricStore.jsx';
import { callAI, writeInArtistStyle, writeAnalysisWords, writeAnalysisTags, refineLyrics, analyzeClichés, checkSimilarity, checkThemeConsistency } from '../../services/AIService.js';
import { parseStyleDNA } from '../../utils/styleDNA.js';
import { Search, Sparkles, BookOpen, AlertTriangle, ShieldCheck, Check, Copy, Save, Heart, Send, TrendingUp, Dna, Grid3x3, Ghost, Tags } from 'lucide-react';
import { notify } from '../../services/dialog.js';
import { Icon } from '../common/Glyph.jsx';
import { useLogged } from '../../services/useLogged.js';
import { track } from '../../services/analytics.js';
import { hasWritingAI } from '../../services/customAI.js';

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

// How each report is named when the 20 Matrix words are drawn from it.
const KIND_NAME = { style: 'lyrical style', flow: 'flow and cadence', themes: 'common themes', full: 'full' };

/**
 * THE WORK STAYS PUT. The artist, report, Style DNA and the song written in
 * that style are kept in localStorage and come back on the next launch, so a
 * report never vanishes after it is saved, after a restart, or after a reload.
 * It is replaced only by the next study.
 */
const SESSION_KEY = 'lyricistGhostRiderSession';
const readSession = () => {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)) || {}; } catch { return {}; }
};

/** The two boxes that take typing: Style DNA and the 20 words. */
const fieldStyle = {
  width: '100%',
  boxSizing: 'border-box',
  marginTop: 4,
  background: 'rgba(16,18,21,0.7)',
  border: '1px solid rgba(155,161,170,0.22)',
  borderRadius: 8,
  padding: '7px 10px',
  fontSize: '0.82rem',
  color: '#e6e8eb',
  outline: 'none',
  fontFamily: 'inherit',
};
const dnaLabel = { color: 'rgba(155,161,170,0.6)', fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.1em' };

/** "a, b, c" or one per line, into a clean list. */
const splitList = (text) => String(text || '').split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);

/** True when a Style DNA has anything in it. */
const hasDNA = (d) => !!d && !!(d.rhythm || d.rhymeDensity || d.cadenceNotes || d.imageClusters?.length || (d.emotionalTemp !== null && d.emotionalTemp !== undefined && d.emotionalTemp !== ''));

export default function ArtistAnalyzer({ onGhostSend }) {
  const store = useLyricStore();
  const [boot] = useState(readSession);
  const [artist, setArtist] = useState(boot.artist || '');
  const [tab, setTab] = useState(promptBuilders[boot.tab] ? boot.tab : 'full');
  const [focus, setFocus] = useState(boot.focus || '');
  
  // Results
  const [analysis, setAnalysis] = useState(boot.analysis || '');
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  // Style DNA (4.2.0) — structured fingerprint from the freeform analysis
  const [styleDNA, setStyleDNA] = useState(boot.styleDNA || null);
  const [loadingDNA, setLoadingDNA] = useState(false);
  const [dnaError, setDnaError] = useState('');

  // Ghost Rider
  const [ghostTopic, setGhostTopic] = useState(boot.ghostTopic || '');
  const [ghostLyrics, setGhostLyrics] = useState(boot.ghostLyrics || '');
  // The Suno style tags (the DNA tags). They arrive with the analysis, and a song replaces them only with its own.
  const [sunoTags, setSunoTags] = useState(boot.sunoTags || '');
  const [loadingTags, setLoadingTags] = useState(false);
  const [tagsError, setTagsError] = useState('');
  // The 20 words for The Matrix. They arrive when the AI writes a song; until then the box is empty and takes typing.
  const [matrixWords, setMatrixWords] = useState(Array.isArray(boot.matrixWords) ? boot.matrixWords : []);
  const [wordsSent, setWordsSent] = useState(false);
  const [loadingWords, setLoadingWords] = useState(false);
  const [wordsError, setWordsError] = useState('');
  /**
   * The Style DNA and the 20 words are made when the AI writes a song, and at no
   * other time (Chris, 2026-10-23). Until then both boxes sit empty and take
   * what a person types. The text boxes below hold what is being typed; the
   * *Typed refs remember that a person has been in a box, so the next AI song
   * does not write over their work.
   */
  const [wordsText, setWordsText] = useState(() => (Array.isArray(boot.matrixWords) ? boot.matrixWords.join(', ') : ''));
  const [imagesText, setImagesText] = useState(() => (Array.isArray(boot.styleDNA?.imageClusters) ? boot.styleDNA.imageClusters.join(', ') : ''));
  const wordsTyped = useRef(false);
  const dnaTyped = useRef(false);
  // The report, the song, or the error that says why there is none. On a phone the
  // button you pressed is a long way above where they appear, so the page follows
  // them there; otherwise the button just goes back to normal and it looks like
  // nothing happened.
  const reportRef = useRef(null);
  const lyricsRef = useRef(null);
  const errorRef = useRef(null);
  const reveal = (ref) => {
    if (!document.body.classList.contains('lyricist-mobile')) return;
    setTimeout(() => ref.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 120);
  };
  const [loadingGhost, setLoadingGhost] = useState(false);
  const [copied, setCopied] = useState('');
  const [ghostSent, setGhostSent] = useState(false);
  // Every box on this tab, in the Ghost's flight recorder (useLogged.js).
  useLogged('Ghost Rider · Artist', artist);
  useLogged('Ghost Rider · Style report', analysis);
  useLogged('Ghost Rider · Style DNA', styleDNA);
  useLogged('Ghost Rider · Topic', ghostTopic);
  useLogged('Ghost Rider · Verse', ghostLyrics);
  useLogged('Ghost Rider · Suno tags', sunoTags);
  useLogged('Ghost Rider · Matrix words', matrixWords.join(', '));

  // What is typed in the two boxes, and what the AI wrote into them, stay in step.
  useEffect(() => {
    if (splitList(wordsText).join('|') !== matrixWords.join('|')) setWordsText(matrixWords.join(', '));
  }, [matrixWords]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const have = Array.isArray(styleDNA?.imageClusters) ? styleDNA.imageClusters : [];
    if (splitList(imagesText).join('|') !== have.join('|')) setImagesText(have.join(', '));
  }, [styleDNA]); // eslint-disable-line react-hooks/exhaustive-deps

  const typeWords = (text) => {
    wordsTyped.current = true;
    setWordsText(text);
    setMatrixWords(splitList(text));
    setWordsSent(false);
    setWordsError('');
  };
  /** One field of the Style DNA, typed by hand. */
  const typeDNA = (patch) => {
    dnaTyped.current = true;
    setDnaError('');
    setStyleDNA((d) => ({ rhythm: '', rhymeDensity: '', imageClusters: [], emotionalTemp: null, cadenceNotes: '', ...(d || {}), ...patch }));
  };

  // Checks & Intelligence
  const [clichés, setClichés] = useState([]);
  const [plagiarismRisk, setPlagiarismRisk] = useState(null);
  const [themeCheck, setThemeCheck] = useState(null);
  const [loadingChecks, setLoadingChecks] = useState(false);

  // Reports now auto-save to the user's Documents folder instead of an in-app list.
  const [autoSaveReports, setAutoSaveReports] = useState(() => {
    const v = localStorage.getItem('lyricistAutoSaveReports');
    return v === null ? true : v === 'true';
  });
  const [saveNote, setSaveNote] = useState('');
  const [songSaveNote, setSongSaveNote] = useState('');

  // One-time cleanup: clear the old in-app saved-reports list from earlier versions.
  useEffect(() => {
    if (localStorage.getItem('lyricistStyleReports')) {
      localStorage.removeItem('lyricistStyleReports');
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('lyricistAutoSaveReports', String(autoSaveReports));
  }, [autoSaveReports]);

  useEffect(() => {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({ artist, tab, focus, analysis, styleDNA, ghostTopic, ghostLyrics, sunoTags, matrixWords }));
    } catch { /* storage full or blocked: the work is still on screen */ }
  }, [artist, tab, focus, analysis, styleDNA, ghostTopic, ghostLyrics, sunoTags, matrixWords]);

  // Write the current report to a .txt file in Documents\Lyricist Style Reports
  // (in the desktop app). In a plain browser it falls back to a normal download.
  const saveReportToDisk = async (txt) => {
    if (!txt) return;
    const stamp = new Date().toISOString().slice(0, 10);
    const safeArtist = (artist.trim() || 'Unknown Artist');
    const filename = `${safeArtist} - ${tab} - ${stamp}.txt`;
    const header =
      `LYRICIST — Artist Style Report\n` +
      `Artist: ${safeArtist}\n` +
      `Analysis type: ${tab}\n` +
      `Saved: ${new Date().toLocaleString()}\n` +
      `${'='.repeat(50)}\n\n`;
    const content = header + txt;
    try {
      if (window.lyricistAPI?.saveReport) {
        const res = await window.lyricistAPI.saveReport(filename, content);
        setSaveNote(res?.ok
          ? 'Saved to Documents\\Lyricist Style Reports. The report stays here too.'
          : `Could not save: ${res?.error || 'unknown error'}`);
      } else {
        // Browser / dev fallback — download the file.
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        setSaveNote(`Downloaded "${filename}"`);
      }
    } catch (e) {
      setSaveNote(`Could not save: ${e.message}`);
    }
    setTimeout(() => setSaveNote(''), 6000);
  };

  const handleAnalyze = async () => {
    if (!artist.trim()) return;
    if (!hasWritingAI(store.config)) {
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
      setStyleDNA(null); setDnaError(''); dnaTyped.current = false;
      setMatrixWords([]); setWordsSent(false); setWordsError(''); wordsTyped.current = false;
      setSunoTags(''); setTagsError('');
      if (autoSaveReports) saveReportToDisk(result);
      // The Suno tags come with the report. The Style DNA and the 20 words do NOT:
      // they are made when the AI writes a song (handleGhostWrite), and until then
      // those two boxes stay empty for anyone who wants to type their own.
      makeAnalysisTags(result, artist.trim());
      reveal(reportRef);
    } catch (e) {
      setErrorMsg(e.message);
      reveal(errorRef);
    } finally {
      setLoadingAnalysis(false);
    }
  };

  /**
   * Deeper Style DNA: rhythm, rhyme density, image clusters, from the analysis.
   *
   * Returns the DNA, so a caller never has to wait on React state for it. Chris's
   * recorded job died here three times: the reply was cut off at 400 tokens or
   * came back as something other than clean JSON, and the failure was swallowed.
   * Now it has room, the parse takes whatever fields arrived, and a second ask
   * in plain lines backs up the JSON one. `loud` throws the real reason.
   */
  const extractStyleDNA = async (reportText, artistName, { loud = false } = {}) => {
    if (!reportText || !hasWritingAI(store.config)) {
      if (loud) throw new Error(reportText ? 'API Key is missing in Settings.' : 'No style report yet. Study the artist first.');
      return null;
    }
    setLoadingDNA(true);
    let why = '';
    try {
      const asks = [
        'Extract a compact Style DNA fingerprint as pure JSON only (no markdown). Keys: rhythm (string: pocket/feel, one sentence), rhymeDensity (sparse|balanced|dense), imageClusters (array of 4-8 short image/motif phrases), emotionalTemp (0-100 number), cadenceNotes (string, one sentence). No artist name in values.',
        'Describe the Style DNA in exactly five lines, nothing else:\nRHYTHM: <the pocket/feel, one sentence>\nRHYME DENSITY: <sparse, balanced or dense>\nIMAGES: <4 to 8 short image or motif phrases, separated by ;>\nTEMPERATURE: <0-100>\nCADENCE: <one sentence>\nNo artist name.',
      ];
      for (const ask of asks) {
        try {
          const raw = await callAI([
            { role: 'system', content: ask },
            { role: 'user', content: `Artist analyzed: ${artistName}\n\nReport:\n${reportText.slice(0, 6000)}` },
          ], store.config, 0.3, 1200);
          const parsed = parseStyleDNA(raw);
          if (parsed) {
            setStyleDNA(parsed);
            // Persist for Quantum Lab pressure chamber (feature 8)
            try {
              writeStylePressure(parsed, artistName);
              window.dispatchEvent(new CustomEvent('lyricist:style-dna', { detail: parsed }));
            } catch { /* */ }
            return parsed;
          }
          why = 'the model answered without the Style DNA in it';
        } catch (e) {
          why = e?.message || 'the model did not answer';
        }
      }
      if (loud) throw new Error(`The Style DNA did not come back: ${why}`);
      return null;
    } finally {
      setLoadingDNA(false);
    }
  };

  /** The 20 Matrix words, pulled from the analysis on screen. Returns them; a failure shows on the card, with Try again. */
  const makeAnalysisWords = async (reportText = analysis, artistName = artist.trim()) => {
    if (!reportText || !hasWritingAI(store.config)) return null;
    setLoadingWords(true);
    setWordsError('');
    setWordsSent(false);
    try {
      const words = await writeAnalysisWords({ artist: artistName, report: reportText, kind: KIND_NAME[tab], motifs: styleDNA?.imageClusters }, store);
      if (!words.length) throw new Error('No words came back.');
      setMatrixWords(words);
      return words;
    } catch (e) {
      setWordsError(e?.message || 'The words did not come back.');
      return null;
    } finally {
      setLoadingWords(false);
    }
  };

  /** The DNA tags (Suno style keywords), written from the analysis on screen. A failure shows on the card, with Try again. */
  const makeAnalysisTags = async (reportText = analysis, artistName = artist.trim()) => {
    if (!reportText || !hasWritingAI(store.config)) return null;
    setLoadingTags(true);
    setTagsError('');
    try {
      const tags = await writeAnalysisTags({ artist: artistName, report: reportText, kind: KIND_NAME[tab] }, store);
      if (!tags) throw new Error('No tags came back.');
      setSunoTags(tags);
      // Where The Matrix and Black Hole Studios read them. Only saving the song
      // file used to put them there, so the singer never left Ghost Rider and
      // Black Hole Studios sang with whatever voice was left over.
      saveSunoTags(tags, artistName);
      return tags;
    } catch (e) {
      setTagsError(e?.message || 'The tags did not come back.');
      return null;
    } finally {
      setLoadingTags(false);
    }
  };

  const handleGhostWrite = async () => {
    if (!artist.trim()) return;
    if (!hasWritingAI(store.config)) {
      setErrorMsg('API Key is missing in Settings.');
      return;
    }
    setLoadingGhost(true);
    setErrorMsg('');
    setGhostLyrics('');
    setGhostSent(false);

    try {
      // The one writer (AIService): a whole song every time, never a verse and a hook.
      // The report rides along so the Matrix words come out of it, not out of thin air.
      const { lyrics, sunoTags: songTags, matrixWords: words } = await writeInArtistStyle(artist, ghostTopic, store, {
        report: analysis, kind: KIND_NAME[tab], motifs: styleDNA?.imageClusters,
      });

      // The DNA tags from the analysis stay unless the song wrote its own.
      const tags = songTags || sunoTags;
      setGhostLyrics(lyrics);
      setSunoTags(tags);
      if (tags) saveSunoTags(tags, artist.trim());
      track('ghostrider_song_written', { sections: (lyrics.match(/^\[[^\]]+\]\s*$/gm) || []).length });

      /**
       * THE STYLE DNA AND THE 20 WORDS ARE MADE HERE, and nowhere else. A song the
       * AI just wrote fills both boxes. Whatever a person typed into a box stays
       * as it is; the AI's own earlier ones are replaced by this song's.
       */
      if (!(wordsTyped.current && matrixWords.length)) {
        if (words?.length) {
          setMatrixWords(words); setWordsSent(false); setWordsError(''); wordsTyped.current = false;
        } else {
          // The song came back without its words: pull them from the report, or from the song itself.
          makeAnalysisWords(analysis || lyrics, artist.trim());
        }
      }
      if (!(dnaTyped.current && hasDNA(styleDNA))) {
        setDnaError('');
        extractStyleDNA(analysis || lyrics, artist.trim(), { loud: true })
          .then(() => { dnaTyped.current = false; })
          .catch((e) => setDnaError(e?.message || String(e)));
      }

      /**
       * AND CHECK THE BOXES, which is what this whole tab exists to feed.
       *
       * The tags it just wrote name the genre, the subgenre and the mood. They
       * used to go in the box on screen and stop there, so a song written in
       * an artist's style arrived in Songwriter and Black Hole Studios with no
       * taxonomy on it at all. Tagging here is the same work a person does by
       * hand with the pickers, and it fills only what is still empty.
       */
      applySongTags(store, { text: tags });
      reveal(lyricsRef);
    } catch (e) {
      setErrorMsg(e.message);
      reveal(errorRef);
    } finally {
      setLoadingGhost(false);
    }
  };

  const clearGhostRider = () => {
    setArtist(''); setFocus(''); setAnalysis(''); setStyleDNA(null);
    setGhostTopic(''); setGhostLyrics(''); setSunoTags(''); setGhostSent(false);
    setMatrixWords([]); setWordsSent(false); setWordsError(''); setTagsError('');
    setDnaError(''); wordsTyped.current = false; dnaTyped.current = false;
    setClichés([]); setPlagiarismRisk(null); setThemeCheck(null);
    setErrorMsg(''); setSaveNote(''); setSongSaveNote('');
  };

  const handleSaveReport = () => {
    if (!analysis) return;
    saveReportToDisk(analysis);
  };

  /**
   * SAVE THE SONG AND ITS SUNO TAGS.
   *
   * Chris, 2026-09-28: "make a save button for the suno tags and song created by
   * ghost rider when writing in the style of the artist". Each song is its own
   * .txt in the same folder as the style reports (Documents\Lyricist Style
   * Reports), named after the artist so it sorts beside that artist's report.
   * Its own file rather than appended to the report: a song can be written
   * without studying the artist first, and a second song never rewrites the
   * first one or the report. Hours and minutes in the name keep songs written
   * on the same day apart.
   *
   * The tags are also kept for Black Hole Studios, the same as the Ghost's
   * "save the tags", so its Input Caption starts from them.
   */
  const saveSongToDisk = async () => {
    const song = ghostLyrics.trim();
    if (!song) return '';
    const who = artist.trim() || 'Unknown Artist';
    const tags = sunoTags.trim();
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}-${pad(now.getMinutes())}`;
    const filename = `${who} - Ghost Rider song - ${stamp}.txt`;
    const content =
      `LYRICIST PRO — Ghost Rider Song\n` +
      `Written in the style of: ${who}\n` +
      `Topic: ${ghostTopic.trim() || "the artist's usual subject"}\n` +
      `Saved: ${now.toLocaleString()}\n` +
      `${'='.repeat(50)}\n\n` +
      `SUNO TAGS\n${tags || '(none)'}\n\n` +
      `LYRICS\n${song}\n`;
    if (tags) saveSunoTags(tags, who);
    let note;
    try {
      if (window.lyricistAPI?.saveReport) {
        const res = await window.lyricistAPI.saveReport(filename, content);
        if (!res?.ok) throw new Error(res?.error || 'unknown error');
        note = `Saved "${filename}" to Documents\\Lyricist Style Reports`;
      } else {
        // Browser / dev fallback — download the file.
        const url = URL.createObjectURL(new Blob([content], { type: 'text/plain' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        note = `Downloaded "${filename}"`;
      }
    } catch (e) {
      note = `Could not save: ${e.message}`;
    }
    setSongSaveNote(note);
    setTimeout(() => setSongSaveNote(''), 6000);
    return note;
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
      topic: ghostTopic.trim(),
      sunoTags
    });
    setGhostSent(true);
  };

  /**
   * THE 20 WORDS GO TO THE MATRIX ON A TAP, never on their own: loading a grid
   * once wiped one Chris had filled. Saved first, so The Matrix picks them up
   * even if it has not been opened yet; the event covers the open one.
   */
  const sendWordsToMatrix = () => {
    if (!matrixWords.length) return false;
    writeMatrixWords(matrixWords, artist.trim());
    window.dispatchEvent(new CustomEvent('lyricist:matrix-words', { detail: { words: matrixWords, artist: artist.trim() } }));
    setWordsSent(true);
    track('ghostrider_words_to_matrix', { count: matrixWords.length });
    notify(`${matrixWords.length} words sent. Open The Matrix.`, { tone: 'ok' });
    return true;
  };

  const handleCopy = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(''), 2000);
  };

  /**
   * WHAT THE GHOST CAN DO ON GHOST RIDER.
   *
   * The same handlers the buttons call, so a study or a write from the Ghost is
   * exactly the one a person would get, Suno tags and all. Each action sets the
   * boxes it was given, lets React render them (ghostSettle), then calls the
   * handler from that fresh render through `ghost`, because the handler in this
   * closure would still see the old artist.
   */
  const ghost = useRef({});
  ghost.current = {
    artist, tab, analysis, ghostTopic, ghostLyrics, sunoTags, matrixWords, errorMsg, styleDNA, loadingDNA, store,
    handleAnalyze, handleGhostWrite, handleRunChecks, handleSendToSongwriter, extractStyleDNA, saveSongToDisk, sendWordsToMatrix,
  };
  useEffect(() => registerGhostActions({
    describe_ghostrider: () => {
      const g = ghost.current;
      return [
        `GHOST RIDER TAB: artist "${g.artist}", analysis type "${g.tab}", topic "${g.ghostTopic}".`,
        g.analysis ? `Its style report starts: ${g.analysis.slice(0, 500)}` : 'No style report yet.',
        g.ghostLyrics
          ? `Lyrics it wrote in that style:\n${g.ghostLyrics.slice(0, 1000)}\nSuno tags: ${g.sunoTags}`
          : 'No lyrics written in the style yet.',
      ].join('\n');
    },
    ghostrider_study: async ({ artist: who, type, focus: about } = {}) => {
      // No artist named: pick one. Chris: "pick a random artist and don't
      // interrupt again". It never stops to ask.
      const name = String(who || '').trim() || ghost.current.artist.trim() || randomArtist();
      setArtist(name);
      if (type && promptBuilders[type]) setTab(type);
      if (about !== undefined) setFocus(String(about));
      await ghostSettle();
      await ghost.current.handleAnalyze();
      await ghostSettle();
      if (ghost.current.errorMsg) throw new Error(ghost.current.errorMsg);
      return `studied ${ghost.current.artist}, the report is on Ghost Rider`;
    },
    ghostrider_write: async ({ artist: who, topic } = {}) => {
      setArtist(String(who || '').trim() || ghost.current.artist.trim() || randomArtist());
      if (topic !== undefined) setGhostTopic(String(topic));
      await ghostSettle();
      await ghost.current.handleGhostWrite();
      await ghostSettle();
      const g = ghost.current;
      if (g.errorMsg) throw new Error(g.errorMsg);
      if (!g.ghostLyrics) throw new Error('The write came back empty. Try it again.');
      return `wrote a verse and hook in the style of ${g.artist}${g.sunoTags ? `. Suno tags: ${g.sunoTags}` : ''}${g.matrixWords.length ? `. ${g.matrixWords.length} Matrix words ready: ${g.matrixWords.join(', ')}` : ''}`;
    },
    /** The Send words button: the 20 words, into The Matrix. */
    ghostrider_send_words_to_matrix: () => {
      const g = ghost.current;
      if (!g.matrixWords.length) throw new Error('No Matrix words yet. Write a song first.');
      g.sendWordsToMatrix();
      return `sent ${g.matrixWords.length} words from ${g.artist.trim() || 'Ghost Rider'}'s analysis to The Matrix: ${g.matrixWords.join(', ')}`;
    },
    ghostrider_check: async () => {
      if (!ghost.current.ghostLyrics) throw new Error('Nothing written on Ghost Rider yet to check.');
      await ghost.current.handleRunChecks();
      return 'ran the cliché, similarity and theme checks';
    },
    ghostrider_send_to_songwriter: () => {
      if (!ghost.current.ghostLyrics) throw new Error('Nothing written on Ghost Rider yet to send.');
      ghost.current.handleSendToSongwriter();
      return 'sent the lyrics to Songwriter';
    },
    /**
     * SAVE THE SUNO TAGS where the rest of the pipeline can reach them.
     * Black Hole Studios seeds its Input Caption from these when the box is
     * empty, so MiniMax's caption skill has a description to rewrite.
     */
    ghostrider_save_tags: () => {
      const tags = ghost.current.sunoTags.trim();
      if (!tags) throw new Error('No Suno tags yet. Write in the style first.');
      saveSunoTags(tags, ghost.current.artist.trim());
      ghost.current.store.setSunoTags?.(tags);
      // Saving the tags also TAGS THE SONG. Writing them to storage for the
      // caption skill to read later, while the pickers sat empty, is exactly
      // the half-finished step Chris caught: "it's bypassing that process".
      const tagged = applySongTags(ghost.current.store, { text: tags });
      return `saved the Suno tags: ${tags}${tagged.said ? `, and ${tagged.said}` : ''}`;
    },
    /** The Save Song & Tags button: the song and its tags as a .txt in Documents. */
    ghostrider_save_song: async () => {
      if (!ghost.current.ghostLyrics.trim()) throw new Error('Nothing written on Ghost Rider yet to save. Write in the style first.');
      const note = await ghost.current.saveSongToDisk();
      if (note.startsWith('Could not')) throw new Error(note);
      return note;
    },
    /**
     * SEND THE STYLE DNA TO THE MATRIX. The DNA is made when a song is written,
     * so use it if it is there, and build it now when the Ghost is asked to send one.
     */
    ghostrider_send_dna_to_matrix: async () => {
      const g = () => ghost.current;
      if (!g().artist.trim()) { setArtist(randomArtist()); await ghostSettle(); }
      if (!g().analysis) {
        await g().handleAnalyze();
        await ghostSettle();
        if (g().errorMsg) throw new Error(g().errorMsg);
      }
      await ghostSettle(300);
      // One already building after the study: let it finish first.
      for (let waited = 0; g().loadingDNA && waited < 60000; waited += 250) await ghostSettle(250);
      const dna = g().styleDNA || await g().extractStyleDNA(g().analysis, g().artist.trim(), { loud: true });
      writeStylePressure(dna, g().artist.trim());
      window.dispatchEvent(new CustomEvent('lyricist:style-dna', { detail: dna }));
      return `sent ${g().artist.trim()}'s Style DNA to The Matrix`;
    },
  }), []);

  return (
    <div style={{ flex: 1, minHeight: 0, width: '100%', display: 'flex', overflow: 'hidden', position: 'relative', background: '#000000' }}>
      {/* Ghost Rider background — the living prism, no clip */}
      <TabBackground name="analyzer" />
      {/* Content sits above the background. mob-stack: the panes stack on a
          phone held upright (mobile.css). */}
      <div className="mob-stack" style={{ position: 'relative', zIndex: 1, display: 'flex', flex: 1, width: '100%', overflow: 'hidden' }}>
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
          background: 'rgba(0,0,0,0.34)',
          borderRight: '1px solid rgba(231,165,64,0.2)'
        }}
      >
        <div data-help="Type the name of any artist you admire. Ghost Rider will study how they write so it can help you write in a similar style — without ever copying their actual songs.">
          <label style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(155,161,170,0.7)', marginBottom: 5, display: 'block' }}>
            Artist Name
          </label>
          <input
            value={artist}
            onChange={(e) => setArtist(e.target.value)}
            placeholder="e.g. Kendrick Lamar, Taylor Swift..."
            data-demo="gr-artist"
            style={{
              width: '100%',
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
        </div>

        <div data-help="Optional. Narrow the study to a certain time period or side of the artist — like a specific album era or their early sound. Leave it blank to look at everything.">
          <label style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(155,161,170,0.7)', marginBottom: 5, display: 'block' }}>
            Focus Angle / Era (optional)
          </label>
          <input
            value={focus}
            onChange={(e) => setFocus(e.target.value)}
            placeholder="e.g. Good Kid M.A.A.D City era..."
            style={{
              width: '100%',
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
        </div>

        <div data-help="Choose what to study about the artist. Lyrical Style = their word choices and storytelling. Flow & Cadence = their rhythm and delivery. Common Themes = what they tend to write about. Full Analysis = all of it together.">
          <label style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(155,161,170,0.7)', marginBottom: 5, display: 'block' }}>
            Analysis Type
          </label>
          <select
            value={tab}
            onChange={(e) => setTab(e.target.value)}
            style={{
              width: '100%',
              background: 'rgba(16,18,21,0.7)',
              border: '1px solid rgba(155,161,170,0.22)',
              borderRadius: 8,
              padding: '7px 10px',
              fontSize: '0.82rem',
              color: '#e6e8eb',
              outline: 'none',
              fontFamily: 'var(--faf-font)'
            }}
          >
            {analysisTabs.map(t => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
        </div>

        <button
          onClick={handleAnalyze}
          aria-busy={loadingAnalysis}
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
          data-demo="gr-analyze"
        >
          <Icon i={Search} />{loadingAnalysis ? 'Analyzing style...' : 'Analyze Artist'}
        </button>

        {/* CLEAR. A new artist starts from nothing: no old report, DNA, topic,
            song or tags left for the Ghost to read as this one's. Saved
            reports and songs on disk are not touched. */}
        <button
          type="button"
          onClick={clearGhostRider}
          disabled={loadingAnalysis || loadingGhost}
          data-demo="gr-clear"
          data-help="Clears the artist, the report, the Style DNA, the topic, the song and the Suno tags on this tab. Anything you saved stays saved."
          style={{
            width: '100%',
            marginTop: 8,
            padding: '7px',
            borderRadius: 8,
            border: '1px solid rgba(239,68,68,0.3)',
            background: 'transparent',
            color: 'rgba(248,113,113,0.8)',
            fontSize: '0.76rem',
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          Clear
        </button>

        {/* Auto-save setting (replaces the old in-app saved-reports list) */}
        <div style={{ marginTop: 10, borderTop: '1px solid rgba(155,161,170,0.15)', paddingTop: 14 }}>
          <label
            style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}
            data-help="When this is on, every artist breakdown is automatically saved as a text file in your Documents folder, inside a folder called 'Lyricist Style Reports'. Turn it off if you'd rather save them yourself with the Save Report button."
          >
            <input
              type="checkbox"
              checked={autoSaveReports}
              onChange={(e) => setAutoSaveReports(e.target.checked)}
              style={{ marginTop: 3, accentColor: '#9ba1aa', cursor: 'pointer' }}
            />
            <span style={{ fontSize: '0.72rem', color: '#e6e8eb', lineHeight: 1.4 }}>
              Automatically save reports to my <strong>Documents</strong> folder
              <span style={{ display: 'block', fontSize: '0.6rem', color: 'rgba(155,161,170,0.6)', marginTop: 2 }}>
                Saved to: Documents\Lyricist Style Reports
              </span>
            </span>
          </label>
        </div>
      </div>

      {/* Main Analysis Output View */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'rgba(8,10,13,0.45)' }}>
        {/* Workspace Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 20px',
            borderBottom: '1px solid rgba(155,161,170,0.18)',
            background: 'rgba(10,12,15,0.7)',
            flexShrink: 0
          }}
        >
          <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(155,161,170,0.5)' }}>
            Artist Intelligence Report
          </span>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {saveNote && (
              <span style={{ fontSize: '0.66rem', color: '#34d399', fontWeight: 600 }}>
                {saveNote}
              </span>
            )}
            {analysis && (
              <button
                onClick={handleSaveReport}
                data-help="Saves this artist breakdown as a text file in your Documents folder (Documents\Lyricist Style Reports). With auto-save on, this happens for you automatically — use this button to save again or re-save by hand."
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  padding: '4px 12px',
                  borderRadius: 6,
                  border: '1px solid rgba(155,161,170,0.4)',
                  background: 'rgba(155,161,170,0.1)',
                  color: '#9ba1aa',
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
        </div>

        {/* Error message */}
        {errorMsg && (
          <div ref={errorRef} className="pill-red" style={{ margin: '10px 20px', padding: '10px 14px', borderRadius: 8, fontSize: '0.82rem' }}>
            {errorMsg}
          </div>
        )}

        {/* Workspace Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 20, background: 'rgba(0,0,0,0.26)' }}>
          {analysis && (
            <div ref={reportRef} data-demo="gr-report" style={{ background: 'rgba(16,18,21,0.7)', border: '1px solid rgba(155,161,170,0.22)', borderRadius: 10, padding: 18 }}>
              <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#e6e8eb', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <BookOpen size={16} />
                Lyrical Analysis Report: {artist}
              </h4>
              
              {/* Dynamic Emotional Arc intensity chart */}
              <div style={{ marginBottom: 18, background: 'rgba(16,18,21,0.9)', borderRadius: 8, border: '1px solid rgba(155,161,170,0.15)', padding: 12 }}>
                <span
                  style={{ fontSize: '0.62rem', fontWeight: 700, color: 'rgba(155,161,170,0.5)', textTransform: 'uppercase', letterSpacing: '0.1em', display: 'block', marginBottom: 10 }}
                  data-help="A quick picture of how the ENERGY of a song typically rises and falls across its parts — lower at the intro, peaking at the chorus, easing out at the end. A guide for shaping your song's emotional ride."
                >
                  <Icon i={TrendingUp} />Stylistic Intensity Arc (Section-by-Section)
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
                            background: 'linear-gradient(0deg, #9ba1aa, #e7a540)',
                            borderRadius: '4px 4px 0 0',
                            boxShadow: '0 0 0 1px rgba(231,165,64,0.3)'
                          }}
                        />
                        <span style={{ fontSize: '0.54rem', color: 'rgba(155,161,170,0.45)' }}>{sections[idx]}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <pre style={{ fontSize: '0.84rem', color: '#e6e8eb', whiteSpace: 'pre-wrap', lineHeight: 1.8, fontFamily: 'inherit' }}>
                {analysis}
              </pre>
            </div>
          )}

          {/* Style DNA — rhythm, rhyme density, image clusters (4.2.0). Made when the AI writes a song; empty and typeable until then. */}
          {(analysis || ghostLyrics) && (
            <div
              data-demo="gr-style-dna"
              style={{ background: 'rgba(16,18,21,0.85)', border: '1px solid rgba(231,165,64,0.35)', borderRadius: 12, padding: 18 }}
              data-help="Style DNA is a compact fingerprint: how they ride the beat (rhythm), how hard they rhyme (rhyme density), and recurring image clusters (metaphors/scenes). It fills in when Ghost Rider writes a song, or you can type your own. Send it to The Matrix to steer your lyrics."
            >
              <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#e7a540', marginBottom: 10 }}>
                <Icon i={Dna} />Style DNA {loadingDNA ? '(building…)' : ''}
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, fontSize: '0.82rem' }}>
                <div>
                  <div style={dnaLabel}>Rhythm / pocket</div>
                  <input value={styleDNA?.rhythm || ''} onChange={(e) => typeDNA({ rhythm: e.target.value })} placeholder="The pocket, the feel" style={fieldStyle} />
                </div>
                <div>
                  <div style={dnaLabel}>Rhyme density</div>
                  <select value={styleDNA?.rhymeDensity || ''} onChange={(e) => typeDNA({ rhymeDensity: e.target.value })} style={{ ...fieldStyle, colorScheme: 'dark' }}>
                    <option value="">—</option>
                    <option value="sparse">sparse</option>
                    <option value="balanced">balanced</option>
                    <option value="dense">dense</option>
                  </select>
                </div>
                <div>
                  <div style={dnaLabel}>Emotional temp</div>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={100}
                    value={styleDNA?.emotionalTemp ?? ''}
                    onChange={(e) => typeDNA({ emotionalTemp: e.target.value === '' ? null : Math.max(0, Math.min(100, Math.round(Number(e.target.value)))) })}
                    placeholder="0 to 100"
                    style={fieldStyle}
                  />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <div style={dnaLabel}>Cadence notes</div>
                  <input value={styleDNA?.cadenceNotes || ''} onChange={(e) => typeDNA({ cadenceNotes: e.target.value })} placeholder="How the lines land" style={fieldStyle} />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <div style={dnaLabel}>Image clusters</div>
                  <input
                    value={imagesText}
                    onChange={(e) => { setImagesText(e.target.value); typeDNA({ imageClusters: splitList(e.target.value) }); }}
                    placeholder="The pictures they keep coming back to, separated by commas"
                    style={fieldStyle}
                  />
                </div>
                {hasDNA(styleDNA) && (
                  <div style={{ gridColumn: '1 / -1', marginTop: 8 }}>
                    <button
                      type="button"
                      onClick={() => {
                        try {
                          writeStylePressure(styleDNA, artist.trim());
                          window.dispatchEvent(new CustomEvent('lyricist:style-dna', { detail: styleDNA }));
                          notify('Style DNA sent to The Matrix.\nOpen The Matrix → Advanced Studio → 8 Style → Load Style DNA pressure.', { tone: 'ok' });
                        } catch (e) {
                          notify('Could not save Style DNA: ' + (e?.message || e), { tone: 'error' });
                        }
                      }}
                      data-demo="gr-dna-send"
                      data-help="Sends this Style DNA into The Matrix as a pressure field (rhythm, density, emotional temp, image motifs) — new lyrics under that physics, never plagiarized bars."
                      style={{
                        padding: '8px 14px',
                        borderRadius: 8,
                        border: '1px solid rgba(231,165,64,0.5)',
                        background: 'rgba(33,34,36,0.5)',
                        color: '#e6e8eb',
                        fontWeight: 700,
                        fontSize: '0.78rem',
                        cursor: 'pointer',
                      }}
                    >
                      <Icon i={Grid3x3} />Send Style DNA to The Matrix
                    </button>
                  </div>
                )}
              </div>
              {/* If the song's Style DNA did not come back it says why, and one tap tries again. */}
              {dnaError && <div style={{ color: '#ff8a8a', fontSize: '0.78rem', marginTop: 10 }}>{dnaError}</div>}
              {dnaError && ghostLyrics && !loadingDNA && (
                <button
                  type="button"
                  onClick={() => {
                    setDnaError('');
                    extractStyleDNA(analysis || ghostLyrics, artist.trim(), { loud: true })
                      .then(() => { dnaTyped.current = false; })
                      .catch((e) => setDnaError(e?.message || String(e)));
                  }}
                  data-help="Tries the Style DNA for the song on screen again."
                  style={{
                    width: '100%',
                    marginTop: 8,
                    padding: '10px',
                    borderRadius: 8,
                    border: '1px solid rgba(231,165,64,0.5)',
                    background: 'rgba(33,34,36,0.5)',
                    color: '#e6e8eb',
                    fontWeight: 700,
                    fontSize: '0.82rem',
                    cursor: 'pointer',
                  }}
                >
                  Try again
                </button>
              )}
            </div>
          )}

          {/* The 20 Matrix words. Made when the AI writes a song; empty and typeable until then. One tap into The Matrix. */}
          {(analysis || ghostLyrics) && (
            <div
              data-demo="gr-matrix-words"
              style={{ background: 'rgba(16,18,21,0.85)', border: '1px solid rgba(155,161,170,0.3)', borderRadius: 12, padding: 18 }}
              data-help="Twenty words and phrases for The Matrix. They fill in when Ghost Rider writes a song, or you can type your own, separated by commas. Send them to The Matrix: they fill its 20 tiles and guide the lyrics."
            >
              <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#e7a540', marginBottom: 10 }}>
                <Icon i={Grid3x3} />{matrixWords.length || 20} Words for The Matrix {loadingWords ? '(pulling…)' : ''}
              </h4>
              <textarea
                value={wordsText}
                onChange={(e) => typeWords(e.target.value)}
                rows={3}
                placeholder="Fills in when Ghost Rider writes a song. Or type your own words, separated by commas."
                style={{ ...fieldStyle, marginTop: 0, marginBottom: 12, resize: 'vertical', lineHeight: 1.5 }}
              />
              {matrixWords.length > 0 && (
                <button
                  type="button"
                  onClick={sendWordsToMatrix}
                  data-demo="gr-words-send"
                  data-help="Sends these words to The Matrix. The first 20 fill its tiles, all of them go in its keyword box. It replaces the grid that is there, so it only happens when you tap."
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: 8,
                    border: '1px solid rgba(231,165,64,0.5)',
                    background: 'rgba(33,34,36,0.5)',
                    color: '#e6e8eb',
                    fontWeight: 700,
                    fontSize: '0.82rem',
                    cursor: 'pointer',
                  }}
                >
                  <Icon i={Grid3x3} />{wordsSent ? 'Sent to The Matrix' : `Send ${matrixWords.length} words to The Matrix`}
                </button>
              )}
              {wordsError && <div style={{ color: '#ff8a8a', fontSize: '0.78rem', marginTop: 8 }}>{wordsError}</div>}
              {wordsError && ghostLyrics && !loadingWords && (
                <button
                  type="button"
                  onClick={() => makeAnalysisWords(analysis || ghostLyrics)}
                  data-help="Tries the 20 words for the song on screen again."
                  style={{
                    width: '100%',
                    marginTop: 8,
                    padding: '10px',
                    borderRadius: 8,
                    border: '1px solid rgba(231,165,64,0.5)',
                    background: 'rgba(33,34,36,0.5)',
                    color: '#e6e8eb',
                    fontWeight: 700,
                    fontSize: '0.82rem',
                    cursor: 'pointer',
                  }}
                >
                  Try again
                </button>
              )}
              {loadingWords && !matrixWords.length && <div style={{ color: 'rgba(155,161,170,0.7)', fontSize: '0.78rem' }}>Pulling the words…</div>}
            </div>
          )}

          {/* DNA tags: the Suno Styles line, written from the analysis on screen, right under the Matrix words. */}
          {analysis && (
            <div
              data-demo="gr-dna-tags"
              style={{ background: 'rgba(16,18,21,0.85)', border: '1px solid rgba(155,161,170,0.3)', borderRadius: 12, padding: 18 }}
              data-help="The Suno style tags for this artist's sound, pulled from the analysis above: genre, mood, instruments, voice. No artist names. Copy them into Suno's Styles box."
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#e7a540', margin: 0 }}>
                  <Icon i={Tags} />Suno Tags {loadingTags ? '(pulling…)' : ''}
                </h4>
                {sunoTags && (
                  <button
                    type="button"
                    onClick={() => handleCopy(sunoTags, 'suno')}
                    style={{
                      fontSize: '0.68rem',
                      background: 'transparent',
                      border: '1px solid rgba(155,161,170,0.3)',
                      color: copied === 'suno' ? '#34d399' : 'rgba(230,232,235,0.7)',
                      padding: '2px 8px',
                      borderRadius: 4,
                      cursor: 'pointer',
                    }}
                  >
                    {copied === 'suno' ? 'Copied' : 'Copy'}
                  </button>
                )}
              </div>
              {sunoTags && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {sunoTags.split(',').map((t, idx) => (
                    <span key={idx} className="suno-chip" style={{ fontSize: '0.7rem' }}>{t.trim()}</span>
                  ))}
                </div>
              )}
              {tagsError && <div style={{ color: '#ff8a8a', fontSize: '0.78rem', marginBottom: 8 }}>{tagsError}</div>}
              {!loadingTags && (!sunoTags || tagsError) && (
                <button
                  type="button"
                  onClick={() => makeAnalysisTags()}
                  data-help="Writes the Suno style tags from the analysis on screen."
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: 8,
                    border: '1px solid rgba(231,165,64,0.5)',
                    background: 'rgba(33,34,36,0.5)',
                    color: '#e6e8eb',
                    fontWeight: 700,
                    fontSize: '0.82rem',
                    cursor: 'pointer',
                  }}
                >
                  {tagsError ? 'Try again' : 'Write Suno tags'}
                </button>
              )}
              {loadingTags && !sunoTags && <div style={{ color: 'rgba(155,161,170,0.7)', fontSize: '0.78rem' }}>Reading the analysis…</div>}
            </div>
          )}

          {/* Ghost Rider Mimic section */}
          {artist.trim() && (
            <div style={{ background: 'rgba(16,18,21,0.85)', border: '1px solid rgba(231,165,64,0.22)', borderRadius: 12, padding: 18 }}>
              <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#e7a540', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span><Ghost size={18} strokeWidth={1.6} /></span>
                Ghost Rider — Write in the style of {artist}
              </h4>
              <p style={{ fontSize: '0.74rem', color: 'rgba(155,161,170,0.5)', marginBottom: 14 }}>
                Captures the authentic artistic voice, flow structures, and vocabulary without using any celebrity names.
              </p>

              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <input
                  value={ghostTopic}
                  onChange={(e) => setGhostTopic(e.target.value)}
                  data-demo="gr-topic"
                  data-help="Optional. Give the ghostwriter a subject for the new song. Leave it blank and it'll pick a topic that fits the artist's usual vibe."
                  placeholder="Optional Topic: e.g. childhood memories, a pawn shop guitar..."
                  style={{
                    flex: 1,
                    background: 'rgba(16,18,21,0.7)',
                    border: '1px solid rgba(155,161,170,0.22)',
                    borderRadius: 8,
                    padding: '7px 10px',
                    fontSize: '0.82rem',
                    color: '#e6e8eb',
                    outline: 'none'
                  }}
                />
                <button
                  onClick={handleGhostWrite}
                  aria-busy={loadingGhost}
                  disabled={loadingGhost}
                  className="btn-neon-cyan"
                  data-demo="gr-write"
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
                  {loadingGhost ? 'Writing...' : 'Write Lyrics'}
                </button>
              </div>

              {ghostLyrics && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 14 }}>
                  {/* Lyrics Display */}
                  <div ref={lyricsRef} data-demo="gr-lyrics" style={{ position: 'relative' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', color: 'rgba(155,161,170,0.6)' }}>
                        Generated Lyrics
                      </span>
                      <button
                        onClick={() => handleCopy(ghostLyrics, 'ghost')}
                        style={{
                          fontSize: '0.68rem',
                          background: 'transparent',
                          border: '1px solid rgba(155,161,170,0.3)',
                          color: copied === 'ghost' ? '#34d399' : 'rgba(230,232,235,0.7)',
                          padding: '2px 8px',
                          borderRadius: 4,
                          cursor: 'pointer'
                        }}
                      >
                        {copied === 'ghost' ? 'Copied' : 'Copy'}
                      </button>
                    </div>

                    <pre style={{ background: 'rgba(16,18,21,0.9)', border: '1px solid rgba(155,161,170,0.15)', borderRadius: 8, padding: 14, fontSize: '0.8rem', fontFamily: 'var(--faf-font)', color: '#e6e8eb', whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
                      {ghostLyrics}
                    </pre>
                  </div>

                  {/* Suno tags: with an analysis on screen they live in the DNA tags card above. */}
                  {sunoTags && !analysis && (
                    <div style={{ background: 'rgba(16,18,21,0.9)', border: '1px solid rgba(155,161,170,0.3)', borderRadius: 8, padding: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <span
                          style={{ fontSize: '0.62rem', fontWeight: 700, color: '#9ba1aa', textTransform: 'uppercase', letterSpacing: '0.12em' }}
                          data-help="Suno is a popular app that turns lyrics into actual music. These are safe style keywords (genre, mood, instruments — no artist names) you can paste into Suno to get a beat that matches this song."
                        >
                          <Icon i={Tags} />Safe Suno AI Style Keywords (Ready to Paste)
                        </span>
                        <button
                          onClick={() => handleCopy(sunoTags, 'suno')}
                          style={{
                            fontSize: '0.68rem',
                            background: 'transparent',
                            border: '1px solid rgba(155,161,170,0.3)',
                            color: copied === 'suno' ? '#34d399' : 'rgba(155,161,170,0.7)',
                            padding: '2px 8px',
                            borderRadius: 4,
                            cursor: 'pointer'
                          }}
                        >
                          {copied === 'suno' ? 'Copied' : 'Copy'}
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
                              background: 'rgba(155,161,170,0.1)',
                              border: '1px solid rgba(155,161,170,0.2)',
                              color: '#FFD08A'
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
                      data-demo="gr-send"
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
                      {ghostSent ? 'Sent to Workspace' : 'Send to Songwriter Workspace'}
                    </button>

                    <button
                      onClick={saveSongToDisk}
                      className="btn-neon-purple"
                      data-demo="gr-save-song"
                      data-help="Saves this song and its Suno tags as a text file in your Documents folder (Documents\Lyricist Style Reports), next to this artist's style reports. Every song gets its own file. The tags are also kept for Black Hole Studios, so its Input Caption starts from them."
                      style={{
                        padding: '9px 18px',
                        borderRadius: 8,
                        border: 'none',
                        color: '#fff',
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6
                      }}
                    >
                      <Save size={14} />
                      Save Song &amp; Tags
                    </button>

                    <button
                      onClick={handleRunChecks}
                      aria-busy={loadingChecks}
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
                      {loadingChecks ? 'Running Checks...' : 'Run Checks'}
                    </button>
                  </div>
                  {songSaveNote && (
                    <span style={{ fontSize: '0.7rem', fontWeight: 600, color: songSaveNote.startsWith('Could not') ? '#f87171' : '#34d399' }}>
                      {songSaveNote}
                    </span>
                  )}

                  {/* Checked Output */}
                  {(clichés.length > 0 || plagiarismRisk !== null || themeCheck !== null) && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, background: 'rgba(16,18,21,0.5)', padding: 12, borderRadius: 8, border: '1px solid rgba(155,161,170,0.18)' }}>
                      <span
                        style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', color: 'rgba(155,161,170,0.5)' }}
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
                          <div style={{ height: '6px', background: 'rgba(16,18,21,0.8)', borderRadius: 3, overflow: 'hidden' }}>
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
                              <Icon i={AlertTriangle} />match in famous song: "{m.phrase}" (similar to {m.originalSong})
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
                              <div key={idx} style={{ fontSize: '0.65rem', color: 'rgba(155,161,170,0.8)' }}>
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
                          <span style={{ fontSize: '0.7rem', color: themeCheck.length > 0 ? '#9ba1aa' : '#34d399' }}>
                            {themeCheck.length > 0
                              ? `Found ${themeCheck.length} off-topic lines: "${themeCheck.join(', ')}"`
                              : 'Theme consistency check passed.'}
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
              <div className="empty-glyph"><Search size={44} strokeWidth={1.25} /></div>
              <p style={{ color: 'rgba(230,232,235,0.7)', fontWeight: 500, fontSize: '0.88rem', textAlign: 'center' }}>
                Enter an artist name and click Analyze to produce a Style Report.
              </p>
              <p style={{ color: 'rgba(155,161,170,0.4)', fontSize: '0.78rem', textAlign: 'center' }}>
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
