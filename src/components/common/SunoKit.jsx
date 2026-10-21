import React, { useState } from 'react';
import { Copy, Grid3x3 } from 'lucide-react';
import { Icon } from './Glyph.jsx';
import { notify } from '../../services/dialog.js';
import { track } from '../../services/analytics.js';
import { writeSunoKit } from '../../services/AIService.js';
import { formatKit, kitSignature } from '../../services/sunoKit.js';
import { writeMatrixWords } from '../QuantumLab/quantumFeatures.js';
import './SunoKit.css';

/**
 * THE SUNO KIT PANEL.
 *
 * Suno's new create screen asks for Styles, a Voice, and a description of the
 * song. Lyricist writes all three (plus thirty words for The Matrix) from the
 * song on screen, and every one has a Copy button. One component, four tabs.
 *
 * `useSunoKit(tabKey, source)` keeps the kit across tab switches. It is tied to
 * the song it was written for, so a different song hides it instead of showing
 * the last one's. freshStart.js wipes the saved copies on launch.
 */
export const kitKey = (tabKey) => `lyricistSunoKit_${tabKey}`;

const readKit = (tabKey) => {
  try { return JSON.parse(localStorage.getItem(kitKey(tabKey)) || 'null'); } catch { return null; }
};

export function useSunoKit(tabKey, source) {
  const sig = kitSignature(source);
  const [saved, setSaved] = useState(() => readKit(tabKey));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const kit = sig && saved?.sig === sig ? saved.kit : null;

  const persist = (next) => {
    setSaved(next);
    try {
      if (next) localStorage.setItem(kitKey(tabKey), JSON.stringify(next));
      else localStorage.removeItem(kitKey(tabKey));
    } catch { /* private mode: it still shows */ }
  };

  const write = async (store, input) => {
    setBusy(true);
    setError('');
    try {
      const out = await writeSunoKit(input, store);
      if (!out.voice && !out.description && !out.sunoTags && !out.matrixWords.length) {
        setError('Nothing came back. Tap Write again.');
      } else {
        persist({ sig, kit: out });
        track('suno_kit_written', { tab: tabKey });
      }
      return out;
    } catch (e) {
      setError(e?.message || 'Could not write the kit. Tap Write again.');
      return null;
    } finally {
      setBusy(false);
    }
  };

  return { kit, busy, error, write, clear: () => { persist(null); setError(''); } };
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    notify('Could not copy. Press and hold the text to copy it.', { tone: 'error' });
    return false;
  }
}

export function sendKitWordsToMatrix(words, artist = '') {
  if (!words?.length) return false;
  writeMatrixWords(words, artist);
  window.dispatchEvent(new CustomEvent('lyricist:matrix-words', { detail: { words, artist } }));
  track('suno_kit_words_to_matrix', { count: words.length });
  notify(`${words.length} words sent. Open The Matrix.`, { tone: 'ok' });
  return true;
}

/**
 * @param {{sunoTags?: string, voice?: string, description?: string, matrixWords?: string[]}|null} kit
 * @param {{tags?: boolean, words?: boolean, voice?: boolean, description?: boolean}} [show] what to list
 */
export default function SunoKitPanel({ kit, busy, error, onWrite, show = {}, artist = '', canWrite = true, writeLabel = 'Write Suno kit', title = 'Suno kit' }) {
  const [copied, setCopied] = useState('');
  const [sent, setSent] = useState(false);
  const want = { tags: true, words: true, voice: true, description: true, ...show };

  const rows = [
    want.tags && kit?.sunoTags && { key: 'tags', label: 'Styles', hint: "Paste into Suno's Styles chip.", text: kit.sunoTags },
    want.voice && kit?.voice && { key: 'voice', label: 'Voice', hint: "How the singing should sound. Add it to Styles or the description. Suno's own Voice chip is for a voice you record.", text: kit.voice },
    want.description && kit?.description && { key: 'desc', label: 'Song description', hint: "Paste into the description box at the top of Suno's create screen.", text: kit.description },
  ].filter(Boolean);
  const words = want.words ? (kit?.matrixWords || []) : [];

  const copy = async (text, key) => {
    if (await copyText(text)) {
      setCopied(key);
      setTimeout(() => setCopied(''), 2000);
    }
  };

  return (
    <section className="sk" data-demo="suno-kit">
      <div className="sk-head">
        <span className="sk-title" data-help="What Suno's create screen asks for, written from this song: Styles, a Voice line and a Song description.">{title}</span>
        {kit && rows.length > 1 && (
          <button type="button" className="sk-btn is-small" onClick={() => copy(formatKit({ sunoTags: want.tags ? kit.sunoTags : '', voice: kit.voice, description: kit.description, matrixWords: [] }), 'all')}>
            <Icon i={Copy} />{copied === 'all' ? 'Copied' : 'Copy all'}
          </button>
        )}
      </div>

      {rows.map((r) => (
        <div className="sk-row" key={r.key}>
          <div className="sk-label">
            <b>{r.label}</b>
            <button type="button" className="sk-btn is-small" onClick={() => copy(r.text, r.key)}>
              <Icon i={Copy} />{copied === r.key ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p className="sk-text">{r.text}</p>
          <span className="sk-hint">{r.hint}</span>
        </div>
      ))}

      {words.length > 0 && (
        <div className="sk-row">
          <div className="sk-label"><b>{words.length} Matrix words</b></div>
          <div className="sk-words">{words.map((w, i) => <span key={i}>{w}</span>)}</div>
          <button type="button" className="sk-btn" onClick={() => setSent(sendKitWordsToMatrix(words, artist))}
            data-help="Sends these words to The Matrix: the first 20 fill its tiles, all of them go in its keyword box. It replaces the grid that is there, so it only happens when you tap.">
            <Icon i={Grid3x3} />{sent ? 'Sent to The Matrix' : `Send ${words.length} words to The Matrix`}
          </button>
        </div>
      )}

      {error && <p className="sk-err" role="alert">{error}</p>}

      {onWrite && (
        <button type="button" className={`sk-btn${kit ? '' : ' is-main'}`} disabled={busy || !canWrite} onClick={onWrite}>
          {busy ? 'Writing…' : kit ? 'Write again' : writeLabel}
        </button>
      )}
    </section>
  );
}
