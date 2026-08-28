import React, { useState, useCallback } from 'react';
import { useDAW } from '../context/DAWContext';
import { useLyricStore } from '../../context/LyricStore';
import { writeInArtistStyle, analyzeArtistStyle } from '../../services/AIService';

const ANALYSIS_MODES = [
  { id: 'full', label: 'Everything' },
  { id: 'style', label: 'Writing' },
  { id: 'flow', label: 'Flow' },
  { id: 'themes', label: 'Themes' }
];

/**
 * StyleMatch — study how an artist writes, then write something original in
 * that style, with the style tags to go with it.
 *
 * This is the old Artist Analyzer brought into the DAW: the analysis half
 * (what makes them sound like them) and the ghostwriting half (lyrics plus
 * style tags) in one panel, since in practice they are used together.
 */
export default function StyleMatch() {
  const { writeSection } = useDAW();
  const store = useLyricStore();

  const [artist, setArtist] = useState('');
  const [topic, setTopic] = useState('');
  const [mode, setMode] = useState('full');

  const [analysis, setAnalysis] = useState('');
  const [lyrics, setLyrics] = useState('');
  const [styleTags, setStyleTags] = useState('');

  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');

  const fail = useCallback((err) => {
    const msg = String(err?.message || err);
    setError(/key/i.test(msg) ? 'Add your AI key in Settings first.' : msg);
  }, []);

  const handleAnalyze = useCallback(async () => {
    if (!artist.trim() || busy) return;
    setBusy('analyze');
    setError('');
    setAnalysis('');
    try {
      setAnalysis(await analyzeArtistStyle(artist, mode, store));
    } catch (err) {
      fail(err);
    } finally {
      setBusy('');
    }
  }, [artist, mode, store, busy, fail]);

  const handleWrite = useCallback(async () => {
    if (!artist.trim() || busy) return;
    setBusy('write');
    setError('');
    setLyrics('');
    setStyleTags('');
    try {
      const res = await writeInArtistStyle(artist, topic, store);
      setLyrics(res.lyrics);
      setStyleTags(res.sunoTags);
    } catch (err) {
      fail(err);
    } finally {
      setBusy('');
    }
  }, [artist, topic, store, busy, fail]);

  const copy = useCallback((text, key) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(''), 1800);
  }, []);

  /** Drops the generated verse straight into the lyric window. */
  const sendToLyrics = useCallback(() => {
    const lines = lyrics
      .split('\n')
      .map(l => l.replace(/^\s*[\[(].*?[\])]\s*$/, '').trim())
      .filter(Boolean);
    if (lines.length) writeSection('Verse 1', lines.slice(0, 16));
  }, [lyrics, writeSection]);

  const disabled = !artist.trim() || !!busy;

  return (
    <div style={{ padding: '16px', color: 'var(--gm-text)', fontFamily: 'Inter, sans-serif' }}>
      <h3 className="gm-panel-title">Style Match</h3>
      <p style={{ margin: '-8px 0 16px', fontSize: '11px', lineHeight: 1.5, color: 'var(--gm-text-muted)' }}>
        Name an artist. Break down how they write, then get original lyrics in
        that style plus style tags. Their name never lands in the words or tags.
      </p>

      <label style={styles.label}>Artist</label>
      <input
        style={styles.input}
        value={artist}
        onChange={e => setArtist(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') handleAnalyze(); }}
        placeholder="e.g. Scarface"
      />

      <label style={styles.label}>Break down</label>
      <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginBottom: '10px' }}>
        {ANALYSIS_MODES.map(m => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            style={{
              padding: '5px 9px',
              fontSize: '10px',
              fontWeight: 700,
              background: mode === m.id ? 'var(--gm-accent-amber)' : 'var(--gm-bg-medium)',
              color: mode === m.id ? '#1A1A1A' : 'var(--gm-text-muted)',
              border: `1px solid ${mode === m.id ? 'var(--gm-accent-amber)' : 'var(--gm-border)'}`,
              borderRadius: '3px',
              cursor: 'pointer'
            }}
          >
            {m.label}
          </button>
        ))}
      </div>

      <button
        style={{ ...styles.secondaryBtn, marginTop: 0, opacity: disabled ? 0.5 : 1, cursor: disabled ? 'default' : 'pointer' }}
        onClick={handleAnalyze}
        disabled={disabled}
      >
        {busy === 'analyze' ? 'Analyzing...' : 'Analyze This Artist'}
      </button>

      {analysis && (
        <div style={{ marginTop: '16px' }}>
          <div style={styles.sectionHead}>
            <span>Breakdown</span>
            <button style={styles.miniBtn} onClick={() => copy(analysis, 'analysis')}>
              {copied === 'analysis' ? 'Copied' : 'Copy'}
            </button>
          </div>
          <div style={styles.proseBox}>{analysis}</div>
        </div>
      )}

      <div style={styles.divider} />

      <label style={styles.label}>About (optional)</label>
      <input
        style={styles.input}
        value={topic}
        onChange={e => setTopic(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') handleWrite(); }}
        placeholder="Leave blank and it picks"
      />

      <button
        style={{ ...styles.primaryBtn, opacity: disabled ? 0.5 : 1, cursor: disabled ? 'default' : 'pointer' }}
        onClick={handleWrite}
        disabled={disabled}
      >
        {busy === 'write' ? 'Writing...' : 'Write In This Style'}
      </button>

      {error && <div style={styles.error}>{error}</div>}

      {lyrics && (
        <div style={{ marginTop: '18px' }}>
          <div style={styles.sectionHead}>
            <span>Lyrics</span>
            <button style={styles.miniBtn} onClick={() => copy(lyrics, 'lyrics')}>
              {copied === 'lyrics' ? 'Copied' : 'Copy'}
            </button>
          </div>
          <pre style={styles.lyricBox}>{lyrics}</pre>
          <button style={styles.secondaryBtn} onClick={sendToLyrics}>
            Put this in the lyric window
          </button>
        </div>
      )}

      {styleTags && (
        <div style={{ marginTop: '18px' }}>
          <div style={styles.sectionHead}>
            <span>Style Tags</span>
            <button style={styles.miniBtn} onClick={() => copy(styleTags, 'tags')}>
              {copied === 'tags' ? 'Copied' : 'Copy'}
            </button>
          </div>
          <div style={styles.tagBox}>{styleTags}</div>
        </div>
      )}
    </div>
  );
}

const styles = {
  label: {
    display: 'block',
    fontSize: '10px',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: 'var(--gm-text-muted)',
    marginBottom: '5px'
  },
  input: {
    width: '100%',
    padding: '9px 12px',
    marginBottom: '14px',
    background: 'var(--gm-bg-dark)',
    color: 'var(--gm-text)',
    border: '1px solid var(--gm-border)',
    borderRadius: '4px',
    boxSizing: 'border-box',
    fontSize: '12px',
    fontFamily: 'var(--gm-font-mono)',
    outline: 'none'
  },
  divider: {
    height: '1px',
    background: 'var(--gm-border)',
    margin: '20px 0 16px'
  },
  primaryBtn: {
    width: '100%',
    padding: '11px',
    background: 'linear-gradient(180deg, #FFC65A 0%, #FFB020 100%)',
    color: '#1A1A1A',
    border: '1px solid #FFD68A',
    borderRadius: '5px',
    fontWeight: 800,
    fontSize: '13px',
    boxShadow: '0 0 16px rgba(255,176,32,0.32)'
  },
  secondaryBtn: {
    width: '100%',
    marginTop: '10px',
    padding: '9px',
    background: 'var(--gm-bg-dark)',
    color: 'var(--gm-accent-amber)',
    border: '1px solid rgba(255,176,32,0.45)',
    borderRadius: '4px',
    fontWeight: 700,
    fontSize: '11px'
  },
  miniBtn: {
    background: 'var(--gm-bg-dark)',
    color: 'var(--gm-accent-ice)',
    border: '1px solid var(--gm-border)',
    borderRadius: '3px',
    padding: '3px 9px',
    fontSize: '9px',
    fontWeight: 700,
    cursor: 'pointer'
  },
  sectionHead: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '7px',
    fontSize: '10px',
    fontWeight: 800,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--gm-text-muted)'
  },
  proseBox: {
    padding: '12px',
    background: 'var(--gm-bg-dark)',
    border: '1px solid var(--gm-border)',
    borderRadius: '4px',
    fontSize: '11.5px',
    lineHeight: 1.65,
    color: 'var(--gm-text)',
    whiteSpace: 'pre-wrap',
    maxHeight: '300px',
    overflowY: 'auto'
  },
  lyricBox: {
    margin: 0,
    padding: '12px',
    background: 'var(--gm-bg-dark)',
    border: '1px solid var(--gm-border)',
    borderRadius: '4px',
    fontSize: '12px',
    lineHeight: 1.6,
    color: 'var(--gm-text)',
    fontFamily: 'Georgia, serif',
    whiteSpace: 'pre-wrap',
    maxHeight: '320px',
    overflowY: 'auto'
  },
  tagBox: {
    padding: '10px 12px',
    background: 'var(--gm-bg-dark)',
    border: '1px solid rgba(255,176,32,0.3)',
    borderRadius: '4px',
    fontSize: '11px',
    lineHeight: 1.6,
    color: 'var(--gm-accent-amber)',
    fontFamily: 'var(--gm-font-mono)',
    wordBreak: 'break-word'
  },
  error: {
    marginTop: '12px',
    fontSize: '11px',
    lineHeight: 1.5,
    fontFamily: 'var(--gm-font-mono)',
    color: 'var(--gm-accent-crimson)',
    border: '1px solid rgba(230,57,70,0.35)',
    background: 'rgba(230,57,70,0.08)',
    borderRadius: '4px',
    padding: '8px 10px'
  }
};
