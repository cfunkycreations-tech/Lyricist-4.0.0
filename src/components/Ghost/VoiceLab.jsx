import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Play, Square, Flame, FolderOpen, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  VOICES, RANGES, loadSettings, saveSettings, take, hasTake, processTake, wavBytes,
} from '../../services/voiceLab.js';
import { ghostLines, wizardLines } from '../../services/narrationLines.js';
import { refreshOwnGhostVoice } from '../Onboarding/GhostDemo.jsx';
import { notify, ask } from '../../services/dialog.js';

/**
 * VOICE LAB — the Ghost panel's fourth view (Creator build only).
 * Every knob is a range input, so the mouse wheel runs all of them
 * (wheelControls.js: Shift = a tenth of a step, Ctrl = ten steps).
 *
 * Knobs that only change the PROCESS (pace, depth, size, warmth, room)
 * re-render the cached take and play it again as soon as the wheel settles:
 * no API call, so tune as fast as you like. Voice, expression and direction
 * need a new take, which waits a little longer to settle before it asks.
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
  expression: 'How much life is in the read, from flat to a full performance. Gemini voices only; it changes the take.',
  pace: 'Slower or faster without changing the pitch.',
  depth: 'Pitch, in tenths of a semitone. Formants stay put, so it gets deeper without turning into slowed tape.',
  size: 'Chest and throat size on its own. Minus is bigger and darker, plus is smaller and brighter. Pitch stays.',
  warmth: 'Body up, fizz down. 0 leaves the take exactly as it came.',
  room: 'A little space around the voice. 0 is dry.',
};

export default function VoiceLab({ apiKey }) {
  const [s, setS] = useState(loadSettings);
  const lines = useMemo(() => [...ghostLines(), ...wizardLines()], []);
  const [lineId, setLineId] = useState(() => lines[0]?.id);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [bake, setBake] = useState(null);          // { done, total, fails } while baking
  const stopBake = useRef(false);
  const audio = useRef(null);
  const timer = useRef(0);
  const last = useRef(null);                       // what the knobs were, so opening the panel never plays
  const canBake = !!window.lyricistAPI?.voiceLabSave;

  const voiceIdx = Math.max(0, VOICES.findIndex((v) => v.key === s.voice));
  const voice = VOICES[voiceIdx];
  const line = lines.find((l) => l.id === lineId) || lines[0];

  const set = (k, v) => setS((prev) => { const next = { ...prev, [k]: v }; saveSettings(next); return next; });

  const stop = () => { try { audio.current?.stop(); } catch { /* already stopped */ } audio.current = null; setPlaying(false); };

  async function preview(settings = s) {
    stop();
    setBusy(true);
    const fresh = !hasTake(settings, line.text);
    setStatus(fresh ? `Asking ${VOICES.find((v) => v.key === settings.voice)?.label || 'the voice'} for a take…` : 'Rendering…');
    try {
      const raw = await take(settings, line.text, apiKey);
      const out = await processTake(raw, settings);
      const ctx = previewCtx();
      const src = ctx.createBufferSource();
      src.buffer = out;
      src.connect(ctx.destination);
      src.onended = () => { if (audio.current === src) { audio.current = null; setPlaying(false); } };
      src.start();
      audio.current = src;
      setPlaying(true);
      setStatus(`${out.duration.toFixed(1)} s · ${line.id}`);
    } catch (e) {
      setStatus(e.message);
    } finally {
      setBusy(false);
    }
  }

  // Settle, then play. The ones that need a new take wait longer, so wheeling
  // through thirty voices asks for one take, not thirty.
  const schedule = (needsTake) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => preview(), needsTake ? 900 : 280);
  };
  const sig = [s.voice, s.expression, s.pace, s.depth, s.size, s.warmth, s.room].join('|');
  useEffect(() => {
    const prev = last.current;
    last.current = s;
    if (!prev || prev === s) return;
    schedule(prev.voice !== s.voice || prev.expression !== s.expression);
  }, [sig]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { clearTimeout(timer.current); try { audio.current?.stop(); } catch { /* */ } }, []);

  async function bakeAll() {
    const ok = await ask(`Bake all ${lines.length} lines in ${voice.label} with these settings?\n\nThey go into your voice folder and play straight away, no rebuild. Costs roughly a dollar on your OpenRouter key.`, { ok: 'Bake all' });
    if (!ok) return;
    stop();
    stopBake.current = false;
    let fails = 0;
    setBake({ done: 0, total: lines.length, fails });
    for (let i = 0; i < lines.length; i++) {
      if (stopBake.current) break;
      const l = lines[i];
      try {
        const out = await processTake(await take(s, l.text, apiKey), s);
        const r = await window.lyricistAPI.voiceLabSave(l.tabId === 'tour' ? '' : 'ghost', l.id, wavBytes(out));
        if (!r?.ok) throw new Error(r?.error || 'save failed');
      } catch (e) {
        fails++;
        console.warn('[voice-lab] bake', l.id, e.message);
      }
      setBake({ done: i + 1, total: lines.length, fails });
    }
    await refreshOwnGhostVoice();
    const stopped = stopBake.current;
    setBake(null);
    notify(stopped ? 'Bake stopped. The lines already baked are in use.'
      : fails ? `Baked, but ${fails} line${fails === 1 ? '' : 's'} failed. Bake again to retry just those.` : `All ${lines.length} lines baked in ${voice.label}. The Ghost Demo and the tour use them now.`,
    { tone: fails && !stopped ? 'error' : 'ok' });
  }

  return (
    <div className="vlab">
      <div className="vlab-voice">
        <button type="button" aria-label="Previous voice" onClick={() => set('voice', VOICES[(voiceIdx - 1 + VOICES.length) % VOICES.length].key)}><ChevronLeft size={14} /></button>
        <div className="vlab-voice-mid">
          <strong>{voice.label}</strong>
          <input
            type="range" min="0" max={VOICES.length - 1} step="1" value={voiceIdx}
            aria-label="Voice"
            onChange={(e) => set('voice', VOICES[Number(e.target.value)].key)}
            data-help="Wheel through every voice. It waits for you to stop, then plays the line in the one you landed on."
          />
        </div>
        <button type="button" aria-label="Next voice" onClick={() => set('voice', VOICES[(voiceIdx + 1) % VOICES.length].key)}><ChevronRight size={14} /></button>
      </div>

      <div className="gha-tune vlab-knobs">
        {KNOBS.map(([k, label, fmt, takeOnly]) => {
          const r = RANGES[k];
          const off = takeOnly && !voice.directed;
          return (
            <React.Fragment key={k}>
              <label htmlFor={`vlab-${k}`} className={off ? 'is-off' : ''}>{label}</label>
              <div className="gha-tune-row" data-help={off ? `${voice.label} reads the words its own way; Expression only steers the Gemini voices.` : HELP[k]}>
                <input
                  id={`vlab-${k}`} type="range" min={r.min} max={r.max} step={r.step} value={s[k]} disabled={off}
                  onChange={(e) => set(k, Number(e.target.value))}
                  onDoubleClick={() => set(k, { expression: 60, pace: 1, depth: 0, size: 0, warmth: 0, room: 0 }[k])}
                />
                <output htmlFor={`vlab-${k}`}>{fmt(s[k])}</output>
              </div>
            </React.Fragment>
          );
        })}
      </div>

      <label className="vlab-lbl" htmlFor="vlab-dir">Direction {voice.directed ? '' : '(Gemini voices only)'}</label>
      <textarea
        id="vlab-dir" className="vlab-dir" rows={3} value={s.direction} disabled={!voice.directed}
        onChange={(e) => set('direction', e.target.value)}
        onBlur={() => schedule(true)}
        placeholder="Who is talking and how. e.g. a tired old bluesman, amused, taking his time."
      />

      <div className="vlab-line">
        <select value={lineId} onChange={(e) => setLineId(e.target.value)} aria-label="Line to preview">
          {lines.map((l) => <option key={l.id} value={l.id}>{l.tabId === 'tour' ? `Tour · ${l.title}` : l.id}</option>)}
        </select>
        {playing
          ? <button type="button" className="gha-voice on" onClick={() => { stop(); setStatus(''); }}><Square size={12} /> Stop</button>
          : <button type="button" className="gha-voice on" aria-busy={busy} disabled={busy || !!bake} onClick={() => preview()}><Play size={12} /> Play</button>}
      </div>
      <p className="vlab-text">{line?.text}</p>
      {status && <p className="gha-note">{status}</p>}

      <div className="vlab-bake">
        {bake
          ? <>
              <div className="vlab-meter"><i style={{ width: `${(bake.done / bake.total) * 100}%` }} /></div>
              <span>{bake.done}/{bake.total}{bake.fails ? ` · ${bake.fails} failed` : ''}</span>
              <button type="button" className="gha-voice" onClick={() => { stopBake.current = true; }}>Stop</button>
            </>
          : <>
              <button type="button" className="gha-voice on" disabled={!canBake || busy} onClick={bakeAll}
                data-help={canBake ? 'Renders every Ghost Demo line and every tour card with exactly what you hear here, into your voice folder.' : 'Baking writes files, so it needs the desktop app.'}>
                <Flame size={12} /> Bake all {lines.length}
              </button>
              {canBake && (
                <button type="button" className="gha-voice" onClick={() => window.lyricistAPI.openVoiceFolder()}>
                  <FolderOpen size={12} /> Folder
                </button>
              )}
            </>}
      </div>
    </div>
  );
}

let _ctx = null;
function previewCtx() {
  if (!_ctx) _ctx = new AudioContext();
  if (_ctx.state === 'suspended') _ctx.resume();
  return _ctx;
}
