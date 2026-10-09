import React, { useEffect, useRef, useState } from 'react';
import { Play, Square, Download, ChevronLeft, ChevronRight, Mic2 } from 'lucide-react';
import { VOICES, RANGES, SR, loadSettings, saveSettings, take, processTake, wavBytes } from '../../services/voiceLab.js';
import { useLyricStore } from '../../context/LyricStore.jsx';
import './VoiceLab.css';

/**
 * VOICE LAB, its own tab, for everyone.
 *
 * Chris, 2026-10-09: the Ghost speaks with Suno takes now, so the Voice Lab is
 * no longer the Ghost's. It is a tool: write a script or a speech, pick a voice,
 * shape it, hear it, save it as a WAV. Same engine as before (services/voiceLab.js,
 * OpenRouter text-to-speech on the user's own key).
 *
 * A long script is read a paragraph at a time and joined with a short breath
 * between paragraphs, so a whole speech fits however long it is.
 */
const KNOBS = [
  ['expression', 'Expression', (v) => `${v}`, true],
  ['pace', 'Pace', (v) => `${Number(v).toFixed(2)}×`, false],
  ['depth', 'Depth', (v) => `${v > 0 ? '+' : ''}${Number(v).toFixed(1)} st`, false],
  ['size', 'Size', (v) => `${v > 0 ? '+' : ''}${Number(v).toFixed(1)}`, false],
  ['warmth', 'Warmth', (v) => `${v}`, false],
  ['room', 'Room', (v) => `${v}`, false],
];
const HELP = {
  expression: 'How much life is in the read, from flat to a full performance. Gemini voices only.',
  pace: 'Slower or faster without changing the pitch.',
  depth: 'Pitch in semitones. The voice gets deeper without sounding like slowed tape.',
  size: 'Chest and throat size. Minus is bigger and darker, plus is smaller and brighter.',
  warmth: 'Body up, fizz down. 0 leaves the voice as it came.',
  room: 'A little space around the voice. 0 is dry.',
};
const SCRIPT_KEY = 'lyricistVoiceLabScript';
const GAP_S = 0.6;            // breath between paragraphs
const MAX_PART = 1800;        // characters per request

/** Paragraphs, with any very long one cut at sentence ends. */
export function scriptParts(text) {
  const out = [];
  for (const para of String(text || '').split(/\n\s*\n/).map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean)) {
    if (para.length <= MAX_PART) { out.push(para); continue; }
    let cur = '';
    for (const s of para.match(/[^.!?]+[.!?]*\s*/g) || [para]) {
      if (cur && cur.length + s.length > MAX_PART) { out.push(cur.trim()); cur = ''; }
      cur += s;
    }
    if (cur.trim()) out.push(cur.trim());
  }
  return out;
}

let ctx = null;
const audioCtx = () => { if (!ctx) ctx = new AudioContext(); if (ctx.state === 'suspended') ctx.resume(); return ctx; };

export default function VoiceLab() {
  const store = useLyricStore();
  const apiKey = store.config?.openRouterApiKey;
  const [s, setS] = useState(loadSettings);
  const [script, setScript] = useState(() => { try { return localStorage.getItem(SCRIPT_KEY) || ''; } catch { return ''; } });
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [result, setResult] = useState(null);       // { buffer, sig }
  const src = useRef(null);

  const voiceIdx = Math.max(0, VOICES.findIndex((v) => v.key === s.voice));
  const voice = VOICES[voiceIdx];
  const set = (k, v) => setS((prev) => { const next = { ...prev, [k]: v }; saveSettings(next); return next; });
  useEffect(() => { try { localStorage.setItem(SCRIPT_KEY, script); } catch { /* storage blocked */ } }, [script]);
  useEffect(() => () => { try { src.current?.stop(); } catch { /* */ } }, []);

  const sig = JSON.stringify([script, s]);
  const parts = scriptParts(script);

  const stop = () => { try { src.current?.stop(); } catch { /* already stopped */ } src.current = null; setPlaying(false); };

  async function render() {
    if (result && result.sig === sig) return result.buffer;
    const raws = [];
    for (let i = 0; i < parts.length; i++) {
      setStatus(parts.length > 1 ? `Reading part ${i + 1} of ${parts.length} in ${voice.label}…` : `Reading it in ${voice.label}…`);
      raws.push(await take(s, parts[i], apiKey));
    }
    const gap = new Float32Array(Math.round(GAP_S * SR));
    const total = raws.reduce((n, r, i) => n + r.length + (i ? gap.length : 0), 0);
    const joined = new Float32Array(total);
    let at = 0;
    raws.forEach((r, i) => { if (i) { joined.set(gap, at); at += gap.length; } joined.set(r, at); at += r.length; });
    setStatus('Shaping the voice…');
    const buffer = await processTake(joined, s);
    setResult({ buffer, sig });
    return buffer;
  }

  async function play() {
    if (!parts.length) { setStatus('Write or paste a script first.'); return; }
    stop(); setBusy(true);
    try {
      const buffer = await render();
      const c = audioCtx(); const node = c.createBufferSource();
      node.buffer = buffer; node.connect(c.destination);
      node.onended = () => { if (src.current === node) { src.current = null; setPlaying(false); } };
      node.start(); src.current = node; setPlaying(true);
      setStatus(`${buffer.duration.toFixed(1)} seconds · ${voice.label}`);
    } catch (e) { setStatus(e.message); } finally { setBusy(false); }
  }

  async function save() {
    if (!parts.length) { setStatus('Write or paste a script first.'); return; }
    setBusy(true);
    try {
      const buffer = await render();
      const blob = new Blob([wavBytes(buffer)], { type: 'audio/wav' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `Voice Lab ${new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-')}.wav`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      setStatus(`Saved ${buffer.duration.toFixed(1)} seconds as a WAV.`);
    } catch (e) { setStatus(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="vls">
      <header className="vls-head">
        <h2><Mic2 size={18} strokeWidth={1.6} /> Voice Lab</h2>
        <p>Write a script or a speech, pick a voice, shape it, and save it as a WAV. Uses your OpenRouter key.</p>
      </header>

      <div className="vls-grid">
        <section className="vls-card vls-scriptcard">
          <label className="vls-lbl" htmlFor="vls-script">Script</label>
          <textarea
            id="vls-script" data-demo="vl-script" className="vls-script" value={script}
            onChange={(e) => setScript(e.target.value)}
            placeholder={'Type it word for word, just like you want it read.\n\nLeave a blank line between paragraphs and it takes a breath there.'}
          />
          <div className="vls-meta">{script.length} characters · {parts.length} paragraph{parts.length === 1 ? '' : 's'}</div>
        </section>

        <section className="vls-card">
          <label className="vls-lbl">Voice</label>
          <div className="vls-voice" data-demo="vl-voice">
            <button type="button" aria-label="Previous voice" onClick={() => set('voice', VOICES[(voiceIdx - 1 + VOICES.length) % VOICES.length].key)}><ChevronLeft size={14} /></button>
            <div className="vls-voice-mid">
              <strong>{voice.label}</strong>
              <input type="range" min="0" max={VOICES.length - 1} step="1" value={voiceIdx} aria-label="Voice"
                onChange={(e) => set('voice', VOICES[Number(e.target.value)].key)} />
            </div>
            <button type="button" aria-label="Next voice" onClick={() => set('voice', VOICES[(voiceIdx + 1) % VOICES.length].key)}><ChevronRight size={14} /></button>
          </div>

          <div className="vls-knobs" data-demo="vl-knobs">
            {KNOBS.map(([k, label, fmt, takeOnly]) => {
              const r = RANGES[k]; const off = takeOnly && !voice.directed;
              return (
                <React.Fragment key={k}>
                  <label htmlFor={`vls-${k}`} className={off ? 'is-off' : ''} data-help={HELP[k]}>{label}</label>
                  <input id={`vls-${k}`} type="range" min={r.min} max={r.max} step={r.step} value={s[k]} disabled={off}
                    onChange={(e) => set(k, Number(e.target.value))}
                    onDoubleClick={() => set(k, { expression: 60, pace: 1, depth: 0, size: 0, warmth: 0, room: 0 }[k])} />
                  <output htmlFor={`vls-${k}`}>{fmt(s[k])}</output>
                </React.Fragment>
              );
            })}
          </div>

          <label className="vls-lbl" htmlFor="vls-dir">Direction {voice.directed ? '' : '(Gemini voices only)'}</label>
          <textarea id="vls-dir" data-demo="vl-direction" className="vls-dir" rows={3} value={s.direction || ''} disabled={!voice.directed}
            onChange={(e) => set('direction', e.target.value)}
            placeholder="Who is talking and how. e.g. a tired old bluesman, amused, taking his time." />

          <div className="vls-actions">
            {playing
              ? <button type="button" className="vls-btn on" onClick={() => { stop(); setStatus(''); }}><Square size={13} /> Stop</button>
              : <button type="button" className="vls-btn on" data-demo="vl-play" disabled={busy} aria-busy={busy} onClick={play}><Play size={13} /> Read it</button>}
            <button type="button" className="vls-btn" data-demo="vl-save" disabled={busy} onClick={save}><Download size={13} /> Save WAV</button>
          </div>
          {!apiKey && <p className="vls-note">Voice Lab needs your OpenRouter key. Add it in Settings.</p>}
          {status && <p className="vls-note">{status}</p>}
        </section>
      </div>
    </div>
  );
}
