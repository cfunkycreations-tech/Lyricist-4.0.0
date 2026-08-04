import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Play, Square, Download, Trash2, FileJson, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Music } from 'lucide-react';
import { getAudioContext, getMasterBus, resumeAudio } from '../../services/audioEngine.js';
import { midiToName, midiToFreq } from '../../services/MidiService.js';
import { downloadMidi } from '../../utils/midiFile.js';

// Offline MIDI sequencer — Lyricist 4.1.3
// Lightweight piano-roll playback + editing for the MIDI JSON produced by the
// audio→MIDI pipeline. Synthesis is a simple triangle-wave voice per note
// through the shared master bus (audioEngine), which is exactly the node the
// Butterchurn visualizer listens to — so the visuals dance to the sequence.
//
// Editing: click a note to select it, then nudge pitch/time/length, adjust
// velocity, or delete. Double-click an empty spot on the roll to add a note.

const ROW_H = 10;         // px per semitone
const KEYBED_W = 44;      // px for the note-name gutter
const LOOKAHEAD = 0.12;   // s of scheduling lookahead
const TICK_MS = 30;

export default function Sequencer({ midi, setMidi, onPlayStateChange }) {
  const [playing, setPlaying] = useState(false);
  const [tempo, setTempo] = useState(midi?.tempo || 120);
  const [selectedId, setSelectedId] = useState(null);
  const [pxPerSec, setPxPerSec] = useState(90);
  const [playheadX, setPlayheadX] = useState(0);

  const schedRef = useRef(null);   // setInterval id
  const rafRef = useRef(null);
  const stateRef = useRef({});     // { startCtxTime, nextIdx, scaledNotes, endTime, voices }

  const notes = midi?.notes || [];
  const originalTempo = midi?.tempo || 120;
  // Changing tempo time-stretches the sequence relative to its detected tempo.
  const timeScale = originalTempo / tempo;

  const { minMidi, maxMidi, totalSec } = useMemo(() => {
    if (!notes.length) return { minMidi: 48, maxMidi: 72, totalSec: 8 };
    let lo = 127, hi = 0, end = 0;
    for (const n of notes) {
      lo = Math.min(lo, n.midi); hi = Math.max(hi, n.midi);
      end = Math.max(end, n.start + n.duration);
    }
    return { minMidi: Math.max(0, lo - 2), maxMidi: Math.min(127, hi + 2), totalSec: end + 0.5 };
  }, [notes]);

  const rows = maxMidi - minMidi + 1;
  const rollW = Math.max(600, totalSec * pxPerSec);
  const rollH = rows * ROW_H;

  const selected = notes.find(n => n.id === selectedId) || null;

  const stop = useCallback(() => {
    clearInterval(schedRef.current);
    cancelAnimationFrame(rafRef.current);
    const st = stateRef.current;
    (st.voices || []).forEach((v) => {
      try { v.osc?.stop(); } catch { /* already stopped */ }
      try { v.osc2?.stop(); } catch { /* */ }
    });
    stateRef.current = {};
    setPlaying(false);
    setPlayheadX(0);
    if (onPlayStateChange) onPlayStateChange(false);
  }, [onPlayStateChange]);

  useEffect(() => stop, [stop]); // kill audio if the tab component ever unmounts

  // Multi-voice synth (stronger than plain triangle) — saw + triangle detuned, light filter
  const scheduleVoice = (ctx, note, when, dur) => {
    const bus = getMasterBus();
    const freq = midiToFreq(note.midi);
    const peak = 0.22 * (note.velocity ?? 0.8);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(Math.min(12000, 800 + (note.midi - 40) * 80), when);
    filter.Q.value = 0.7;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(peak, when + 0.008);
    gain.gain.setTargetAtTime(peak * 0.65, when + 0.04, 0.08);
    gain.gain.setTargetAtTime(0, when + Math.max(0.05, dur - 0.05), 0.04);

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc2.type = 'triangle';
    osc1.frequency.value = freq;
    osc2.frequency.value = freq * 1.003; // slight detune = thicker
    osc1.detune.value = -4;
    osc2.detune.value = 6;
    const mix1 = ctx.createGain();
    const mix2 = ctx.createGain();
    mix1.gain.value = 0.55;
    mix2.gain.value = 0.45;
    osc1.connect(mix1);
    osc2.connect(mix2);
    mix1.connect(filter);
    mix2.connect(filter);
    filter.connect(gain);
    gain.connect(bus);
    osc1.start(when);
    osc2.start(when);
    const stopAt = when + dur + 0.35;
    osc1.stop(stopAt);
    osc2.stop(stopAt);
    return { osc: osc1, osc2, gain, filter };
  };

  const play = async () => {
    if (!notes.length) return;
    await resumeAudio();
    const ctx = getAudioContext();
    stop();

    const scaled = notes
      .map(n => ({ ...n, t: n.start * timeScale, d: Math.max(0.05, n.duration * timeScale) }))
      .sort((a, b) => a.t - b.t);
    const endTime = scaled.reduce((m, n) => Math.max(m, n.t + n.d), 0);

    stateRef.current = { startCtxTime: ctx.currentTime + 0.08, nextIdx: 0, scaledNotes: scaled, endTime, voices: [] };
    setPlaying(true);
    if (onPlayStateChange) onPlayStateChange(true);

    schedRef.current = setInterval(() => {
      const st = stateRef.current;
      if (!st.scaledNotes) return;
      const now = ctx.currentTime;
      while (st.nextIdx < st.scaledNotes.length) {
        const n = st.scaledNotes[st.nextIdx];
        const when = st.startCtxTime + n.t;
        if (when > now + LOOKAHEAD) break;
        st.voices.push(scheduleVoice(ctx, n, when, n.d));
        st.nextIdx++;
      }
      if (now > st.startCtxTime + st.endTime + 0.3) stop();
    }, TICK_MS);

    const animate = () => {
      const st = stateRef.current;
      if (!st.scaledNotes) return;
      const elapsed = getAudioContext().currentTime - st.startCtxTime;
      setPlayheadX(Math.max(0, (elapsed / timeScale) * pxPerSec));
      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
  };

  const updateNote = (id, patch) => {
    setMidi(prev => ({
      ...prev,
      notes: prev.notes.map(n => n.id === id ? { ...n, ...patch } : n)
    }));
  };

  const nudge = (field, delta) => {
    if (!selected) return;
    if (field === 'midi') updateNote(selected.id, { midi: Math.min(127, Math.max(0, selected.midi + delta)) });
    if (field === 'start') updateNote(selected.id, { start: Math.max(0, selected.start + delta) });
    if (field === 'duration') updateNote(selected.id, { duration: Math.max(0.05, selected.duration + delta) });
  };

  const deleteSelected = () => {
    if (!selected) return;
    setMidi(prev => ({ ...prev, notes: prev.notes.filter(n => n.id !== selected.id) }));
    setSelectedId(null);
  };

  const addNoteAt = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left + e.currentTarget.scrollLeft - KEYBED_W;
    const y = e.clientY - rect.top + e.currentTarget.scrollTop;
    if (x < 0) return;
    const start = x / pxPerSec;
    const midiPitch = maxMidi - Math.floor(y / ROW_H);
    const id = Date.now();
    setMidi(prev => ({
      ...prev,
      notes: [...prev.notes, { id, midi: midiPitch, start, duration: 0.3, velocity: 0.8 }]
    }));
    setSelectedId(id);
  };

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify({ ...midi, tempo }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'lyricist-sequence.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  if (!notes.length) {
    return (
      <div className="card-cosmic" style={{ borderRadius: 12, padding: 24, textAlign: 'center' }}>
        <Music size={28} style={{ color: '#ff2d95', filter: 'drop-shadow(0 0 8px rgba(255,45,149,0.7))' }} />
        <p style={{ fontSize: '0.78rem', color: 'rgba(196,181,253,0.7)', margin: '8px 0 0' }}>
          No MIDI loaded yet — convert some audio above, and the notes appear here as an editable piano roll.
        </p>
      </div>
    );
  }

  return (
    <div className="card-cosmic" style={{ borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Transport + global controls */}
      <div className="seq-toolbar">
        <button
          onClick={playing ? stop : play}
          className={playing ? '' : 'btn-neon-purple'}
          data-help="Play the sequence through the built-in synth. The Butterchurn visualizer below reacts to it in real time."
          style={{ padding: '8px 18px', borderRadius: 8, border: playing ? '1px solid rgba(248,113,113,0.5)' : 'none', background: playing ? 'rgba(248,113,113,0.12)' : undefined, color: playing ? '#f87171' : '#fff', fontWeight: 700, fontSize: '0.76rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
        >
          {playing ? <><Square size={13} /> Stop</> : <><Play size={13} /> Play</>}
        </button>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.68rem' }}
          data-help="Master tempo. Slowing it down stretches the whole sequence; speeding it up compresses it — the notes themselves don't change.">
          Tempo {tempo} BPM
          <input type="range" min={40} max={220} value={tempo} onChange={(e) => setTempo(Number(e.target.value))} className="suno-range" style={{ width: 110 }} />
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.68rem' }} data-help="Horizontal zoom of the piano roll.">
          Zoom
          <input type="range" min={30} max={260} value={pxPerSec} onChange={(e) => setPxPerSec(Number(e.target.value))} className="suno-range" style={{ width: 90 }} />
        </label>

        <div style={{ flex: 1 }} />

        <button onClick={() => downloadMidi({ ...midi, tempo })} className="suno-chip" data-help="Export the sequence as a standard .mid file you can drop into any DAW.">
          <Download size={12} /> .mid
        </button>
        <button onClick={exportJSON} className="suno-chip" data-help="Export the raw MIDI JSON (the same editable format the sequencer uses).">
          <FileJson size={12} /> JSON
        </button>
        <button onClick={() => { stop(); setMidi({ tempo: 120, notes: [] }); setSelectedId(null); }} className="suno-chip" style={{ color: '#f87171', borderColor: 'rgba(248,113,113,0.4)', background: 'rgba(248,113,113,0.08)' }}>
          <Trash2 size={12} /> Clear
        </button>
      </div>

      {/* Piano roll */}
      <div className="seq-roll-wrap" onDoubleClick={addNoteAt}
        data-help="The piano roll. Click a note to select and tweak it; double-click empty space to add a new note.">
        <div style={{ position: 'relative', width: rollW + KEYBED_W, height: rollH }}>
          {/* Row stripes + note-name gutter */}
          {Array.from({ length: rows }, (_, r) => {
            const m = maxMidi - r;
            const isC = m % 12 === 0;
            const black = [1, 3, 6, 8, 10].includes(m % 12);
            return (
              <div key={m} style={{ position: 'absolute', top: r * ROW_H, left: 0, right: 0, height: ROW_H, background: black ? 'rgba(255,45,149,0.045)' : 'transparent', borderTop: isC ? '1px solid rgba(0,229,255,0.25)' : '1px solid rgba(255,255,255,0.03)' }}>
                {isC && <span style={{ position: 'absolute', left: 4, top: -1, fontSize: 8, color: 'rgba(0,229,255,0.75)', fontFamily: "'JetBrains Mono', monospace" }}>{midiToName(m)}</span>}
              </div>
            );
          })}
          {/* Beat grid */}
          {Array.from({ length: Math.ceil(totalSec / (60 / tempo)) + 1 }, (_, b) => (
            <div key={b} style={{ position: 'absolute', top: 0, bottom: 0, left: KEYBED_W + b * (60 / tempo) * pxPerSec, width: 1, background: b % 4 === 0 ? 'rgba(255,45,149,0.22)' : 'rgba(255,255,255,0.05)' }} />
          ))}
          {/* Notes */}
          {notes.map(n => (
            <div
              key={n.id}
              className={`seq-note ${n.id === selectedId ? 'seq-note--selected' : ''}`}
              onClick={(e) => { e.stopPropagation(); setSelectedId(n.id); }}
              onDoubleClick={(e) => e.stopPropagation()}
              title={`${midiToName(n.midi)} · ${n.start.toFixed(2)}s · vel ${(n.velocity * 100) | 0}%`}
              style={{
                left: KEYBED_W + n.start * pxPerSec,
                top: (maxMidi - n.midi) * ROW_H + 1,
                width: Math.max(4, n.duration * pxPerSec),
                height: ROW_H - 2,
                opacity: 0.45 + 0.55 * (n.velocity ?? 0.8)
              }}
            />
          ))}
          {/* Playhead */}
          {playing && <div className="seq-playhead" style={{ left: KEYBED_W + playheadX }} />}
        </div>
      </div>

      {/* Selected-note editor */}
      {selected && (
        <div className="seq-toolbar" style={{ fontSize: '0.7rem', alignItems: 'center' }}>
          <span className="pill-purple" style={{ padding: '3px 10px', borderRadius: 9999, fontWeight: 700 }}>
            {midiToName(selected.midi)} · {selected.start.toFixed(2)}s · {selected.duration.toFixed(2)}s
          </span>
          <span style={{ display: 'inline-flex', gap: 3 }} data-help="Transpose the selected note up/down a semitone.">
            <button className="suno-btn" onClick={() => nudge('midi', 1)}><ChevronUp size={13} /></button>
            <button className="suno-btn" onClick={() => nudge('midi', -1)}><ChevronDown size={13} /></button>
          </span>
          <span style={{ display: 'inline-flex', gap: 3 }} data-help="Slide the selected note earlier/later by 50ms.">
            <button className="suno-btn" onClick={() => nudge('start', -0.05)}><ChevronLeft size={13} /></button>
            <button className="suno-btn" onClick={() => nudge('start', 0.05)}><ChevronRight size={13} /></button>
          </span>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }} data-help="Lengthen or shorten the selected note.">
            Len
            <button className="suno-btn" onClick={() => nudge('duration', -0.05)}>−</button>
            <button className="suno-btn" onClick={() => nudge('duration', 0.05)}>+</button>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }} data-help="How hard the selected note hits (its velocity/loudness).">
            Vel
            <input type="range" min={0.05} max={1} step={0.05} value={selected.velocity ?? 0.8}
              onChange={(e) => updateNote(selected.id, { velocity: Number(e.target.value) })}
              className="suno-range" style={{ width: 80 }} />
          </label>
          <button onClick={deleteSelected} className="suno-chip" style={{ color: '#f87171', borderColor: 'rgba(248,113,113,0.4)', background: 'rgba(248,113,113,0.08)' }}>
            <Trash2 size={12} /> Delete note
          </button>
        </div>
      )}

      <div style={{ fontSize: '0.62rem', color: 'rgba(196,181,253,0.55)' }}>
        {notes.length} notes · {totalSec.toFixed(1)}s at source tempo · double-click the roll to add a note
      </div>
    </div>
  );
}
