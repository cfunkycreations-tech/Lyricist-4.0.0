import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  Play, Square, Download, Trash2, FileJson, ChevronUp, ChevronDown,
  ChevronLeft, ChevronRight, Music, MousePointer2, Pencil, Paintbrush, Eraser, Magnet,
} from 'lucide-react';
import { getAudioContext, getMasterBus, resumeAudio } from '../../services/audioEngine.js';
import { midiToName } from '../../services/MidiService.js';
import { downloadMidi } from '../../utils/midiFile.js';
import {
  INSTRUMENT_GROUPS,
  DEFAULT_INSTRUMENT,
  loadInstrument,
  instrumentFromBuffer,
  playNote,
} from '../../services/soundfontEngine.js';
import { getSampleBuffer } from '../../services/sampleLibrary.js';

// Offline MIDI sequencer — Lyricist 4.2.0
// FL-grade piano roll: four tools (select / draw / paint / erase), drag-to-move,
// edge-drag to resize, snap-to-grid, and a velocity lane under the roll.
// Synthesis runs through the shared master bus (audioEngine) — the same node the
// Butterchurn visualizer listens to, so the visuals dance to the sequence.

const ROW_H = 12;         // px per semitone
const KEYBED_W = 44;      // px for the note-name gutter
const LOOKAHEAD = 0.12;   // s of scheduling lookahead
const TICK_MS = 30;
const VEL_H = 66;         // px height of the velocity lane
const PITCH_LO = 36;      // C2 — roll always covers at least this range
const PITCH_HI = 84;      // C6
const MIN_BARS = 8;       // roll is always at least this long, so you can draw into empty space

const TOOLS = [
  { id: 'select', label: 'Select', Icon: MousePointer2, help: 'Click a note to select it. Drag its body to move it, drag its right edge to resize. Double-click empty space to add a note.' },
  { id: 'draw', label: 'Draw', Icon: Pencil, help: 'Pencil. Click empty grid to place a note, then drag right to set its length or up/down to change its pitch.' },
  { id: 'paint', label: 'Paint', Icon: Paintbrush, help: 'Paintbrush. Hold and drag across the grid to lay down a run of notes, one per grid step.' },
  { id: 'erase', label: 'Erase', Icon: Eraser, help: 'Drag across notes to wipe them out. Right-click deletes a note with any tool active.' },
];

const GRID_OPTIONS = [
  { id: 'off', label: 'Off', beats: 0 },
  { id: '1', label: '1 bar', beats: 4 },
  { id: '1/2', label: '1/2', beats: 2 },
  { id: '1/4', label: '1/4', beats: 1 },
  { id: '1/8', label: '1/8', beats: 0.5 },
  { id: '1/8t', label: '1/8T', beats: 1 / 3 },
  { id: '1/16', label: '1/16', beats: 0.25 },
  { id: '1/32', label: '1/32', beats: 0.125 },
];

let idSeed = 0;
const newNoteId = () => `n${Date.now().toString(36)}${(idSeed++).toString(36)}`;

// `fxInput` returns the node the roll should play into — the effects rack owned
// by MidiStudio. Falls back to the raw master bus if it isn't supplied, so the
// component still works standalone.
export default function Sequencer({ midi, setMidi, onPlayStateChange, userSample, fxInput }) {
  const [playing, setPlaying] = useState(false);
  const [tempo, setTempo] = useState(midi?.tempo || 120);
  const [selectedId, setSelectedId] = useState(null);
  const [pxPerSec, setPxPerSec] = useState(90);
  const [playheadX, setPlayheadX] = useState(0);
  const [tool, setTool] = useState('draw');
  const [gridId, setGridId] = useState('1/8');
  const [ghost, setGhost] = useState(null);   // live preview while drawing

  const schedRef = useRef(null);   // setInterval id
  const rafRef = useRef(null);
  const stateRef = useRef({});     // { startCtxTime, nextIdx, scaledNotes, endTime, voices }
  const gridRef = useRef(null);    // the absolutely-positioned roll surface
  const rollWrapRef = useRef(null);
  const velWrapRef = useRef(null);
  const syncingRef = useRef(false);
  const centeredRef = useRef(false);

  const [instrumentId, setInstrumentId] = useState(DEFAULT_INSTRUMENT);
  const [instrumentState, setInstrumentState] = useState('loading'); // loading | ready | error
  const instrumentRef = useRef(null);

  const notes = midi?.notes || [];
  // Drag handlers live for the whole gesture — read notes through the ref so an
  // erase or paint stroke never hit-tests against a stale array.
  const notesRef = useRef(notes);
  notesRef.current = notes;
  const originalTempo = midi?.tempo || 120;
  // Changing tempo time-stretches the sequence relative to its detected tempo.
  const timeScale = originalTempo / tempo;

  const secPerBeat = 60 / tempo;
  const snapSec = (GRID_OPTIONS.find(g => g.id === gridId)?.beats || 0) * secPerBeat;
  const defaultLen = snapSec || 0.3;

  /** Snap a time to the grid. floor=true for note starts while painting cells. */
  const snap = useCallback((t, floor = false) => {
    if (!snapSec) return Math.max(0, t);
    const q = floor ? Math.floor(t / snapSec) : Math.round(t / snapSec);
    return Math.max(0, q * snapSec);
  }, [snapSec]);

  // The visible pitch range only ever grows — a roll whose rows shift under you
  // every time you add a note is unusable.
  const { minMidi, maxMidi, totalSec } = useMemo(() => {
    let lo = PITCH_LO, hi = PITCH_HI, end = 0;
    for (const n of notes) {
      lo = Math.min(lo, n.midi - 2); hi = Math.max(hi, n.midi + 2);
      end = Math.max(end, n.start + n.duration);
    }
    const minLen = MIN_BARS * 4 * secPerBeat;
    return {
      minMidi: Math.max(0, lo),
      maxMidi: Math.min(127, hi),
      totalSec: Math.max(minLen, end + 4 * secPerBeat),
    };
  }, [notes, secPerBeat]);

  const rows = maxMidi - minMidi + 1;
  const rollW = Math.max(600, totalSec * pxPerSec);
  const rollH = rows * ROW_H;

  const selected = notes.find(n => n.id === selectedId) || null;

  const stop = useCallback(() => {
    clearInterval(schedRef.current);
    cancelAnimationFrame(rafRef.current);
    const st = stateRef.current;
    (st.voices || []).forEach((v) => {
      try { v?.stop?.(); } catch { /* already stopped */ }
    });
    stateRef.current = {};
    setPlaying(false);
    setPlayheadX(0);
    if (onPlayStateChange) onPlayStateChange(false);
  }, [onPlayStateChange]);

  useEffect(() => stop, [stop]); // kill audio if the tab component ever unmounts

  // Load the selected instrument. Either a bundled GM pack or, when the id is
  // "user:<sampleId>", one of Chris's own samples out of the sample library.
  useEffect(() => {
    let cancelled = false;
    setInstrumentState('loading');
    instrumentRef.current = null;
    const ctx = getAudioContext();

    const load = instrumentId.startsWith('user:')
      ? (async () => {
          const [, sampleId, root] = instrumentId.split(':');
          const buf = await getSampleBuffer(ctx, sampleId);
          return instrumentFromBuffer(buf, Number(root) || 60);
        })()
      : loadInstrument(ctx, instrumentId);

    load
      .then((inst) => {
        if (cancelled) return;
        instrumentRef.current = inst;
        setInstrumentState('ready');
      })
      .catch(() => {
        if (!cancelled) setInstrumentState('error');
      });
    return () => { cancelled = true; };
  }, [instrumentId]);

  // Let the sample library hand a sample straight to the roll.
  useEffect(() => {
    if (!userSample) return;
    setInstrumentId(`user:${userSample.id}:${userSample.rootMidi ?? 60}`);
  }, [userSample]);

  // Open on the middle of the keyboard instead of the bottom of the scroll box.
  useEffect(() => {
    if (centeredRef.current || !rollWrapRef.current) return;
    const focusNote = notes.length
      ? notes.reduce((s, n) => s + n.midi, 0) / notes.length
      : 60;
    const y = (maxMidi - focusNote) * ROW_H - rollWrapRef.current.clientHeight / 2;
    rollWrapRef.current.scrollTop = Math.max(0, y);
    centeredRef.current = true;
  }, [notes, maxMidi]);

  // Everything the roll plays goes through the effects rack, not straight out.
  const destination = useCallback(() => (fxInput ? fxInput() : getMasterBus()), [fxInput]);

  // Real sampled instrument, not an oscillator. Falls back to silence rather
  // than a buzz if the pack has not finished decoding yet.
  const scheduleVoice = (ctx, note, when, dur) => {
    const inst = instrumentRef.current;
    if (!inst) return null;
    const stopFn = playNote(ctx, destination(), inst, note.midi, {
      when,
      duration: dur,
      velocity: 0.85 * (note.velocity ?? 0.8),
    });
    return { stop: stopFn };
  };

  /** Audition a single note when you click the keybed or draw one in. */
  const auditionNote = useCallback(async (midiNote, velocity = 0.85) => {
    await resumeAudio();
    const ctx = getAudioContext();
    const inst = instrumentRef.current;
    if (!inst) return;
    playNote(ctx, destination(), inst, midiNote, { duration: 0.45, velocity });
  }, [destination]);

  const play = async () => {
    if (!notes.length) return;
    await resumeAudio();
    const ctx = getAudioContext();
    // Don't start against a half-loaded instrument — that's how you get silence.
    if (!instrumentRef.current) {
      try {
        instrumentRef.current = await loadInstrument(ctx, instrumentId);
        setInstrumentState('ready');
      } catch {
        setInstrumentState('error');
        return;
      }
    }
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
        const voice = scheduleVoice(ctx, n, when, n.d);
        if (voice) st.voices.push(voice);
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

  /* ── editing primitives ─────────────────────────────────────────────── */

  const updateNote = useCallback((id, patch) => {
    setMidi(prev => ({
      ...prev,
      notes: (prev.notes || []).map(n => n.id === id ? { ...n, ...patch } : n),
    }));
  }, [setMidi]);

  const removeNotes = useCallback((ids) => {
    const kill = new Set(ids);
    setMidi(prev => ({ ...prev, notes: (prev.notes || []).filter(n => !kill.has(n.id)) }));
  }, [setMidi]);

  const nudge = (field, delta) => {
    if (!selected) return;
    if (field === 'midi') updateNote(selected.id, { midi: Math.min(127, Math.max(0, selected.midi + delta)) });
    if (field === 'start') updateNote(selected.id, { start: Math.max(0, selected.start + delta) });
    if (field === 'duration') updateNote(selected.id, { duration: Math.max(0.05, selected.duration + delta) });
  };

  const deleteSelected = () => {
    if (!selected) return;
    removeNotes([selected.id]);
    setSelectedId(null);
  };

  /** Pointer position → {time, pitch} on the roll surface. */
  const pointerToCell = useCallback((e) => {
    const rect = gridRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left - KEYBED_W;
    const y = e.clientY - rect.top;
    return {
      x,
      time: Math.max(0, x / pxPerSec),
      pitch: Math.min(127, Math.max(0, maxMidi - Math.floor(y / ROW_H))),
    };
  }, [pxPerSec, maxMidi]);

  /** Register a drag: handlers close over the values live at grab time. */
  const startDrag = useCallback((onMove, onUp) => {
    const move = (e) => onMove(e);
    const up = (e) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (onUp) onUp(e);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }, []);

  /* ── roll interaction ───────────────────────────────────────────────── */

  const onRollPointerDown = (e) => {
    if (e.button === 2) return;              // right-click is handled as delete
    e.preventDefault();
    const { time, pitch } = pointerToCell(e);
    if (time < 0) return;

    if (tool === 'erase') {
      const painted = new Set();
      const eraseAt = (ev) => {
        const c = pointerToCell(ev);
        const hit = notesRef.current.find(n =>
          n.midi === c.pitch && c.time >= n.start && c.time <= n.start + n.duration && !painted.has(n.id));
        if (hit) { painted.add(hit.id); removeNotes([hit.id]); }
      };
      eraseAt(e);
      startDrag(eraseAt);
      return;
    }

    if (tool === 'paint') {
      const stamped = new Set();
      const stamp = (ev) => {
        const c = pointerToCell(ev);
        const start = snap(c.time, true);
        const key = `${c.pitch}:${start.toFixed(4)}`;
        if (stamped.has(key)) return;
        stamped.add(key);
        // Don't stack a second note on a cell that already holds one.
        if (notesRef.current.some(n => n.midi === c.pitch && Math.abs(n.start - start) < 1e-4)) return;
        const id = newNoteId();
        setMidi(prev => ({
          ...prev,
          notes: [...(prev.notes || []), { id, midi: c.pitch, start, duration: defaultLen, velocity: 0.8 }],
        }));
        auditionNote(c.pitch, 0.7);
      };
      stamp(e);
      startDrag(stamp);
      return;
    }

    // draw: lay a note down and let the drag decide its pitch and length
    if (tool === 'draw') {
      const start = snap(time, true);
      const id = newNoteId();
      const note = { id, midi: pitch, start, duration: defaultLen, velocity: 0.8 };
      setMidi(prev => ({ ...prev, notes: [...(prev.notes || []), note] }));
      setSelectedId(id);
      auditionNote(pitch, 0.75);
      let last = note;
      startDrag(
        (ev) => {
          const c = pointerToCell(ev);
          const end = snapSec ? Math.max(start + snapSec, snap(c.time + snapSec / 2)) : Math.max(start + 0.05, c.time);
          last = { ...last, midi: c.pitch, duration: Math.max(0.05, end - start) };
          setGhost(last);
        },
        () => {
          setGhost(null);
          updateNote(id, { midi: last.midi, duration: last.duration });
        },
      );
      return;
    }

    // select: empty-space click clears the selection
    setSelectedId(null);
  };

  /** Grab on an existing note — move it, or resize from its right edge. */
  const onNotePointerDown = (e, note) => {
    if (e.button === 2) return;
    e.stopPropagation();
    e.preventDefault();

    if (tool === 'erase') { removeNotes([note.id]); return; }
    if (tool === 'paint') { return; }        // painting over a note is a no-op

    setSelectedId(note.id);
    const rect = e.currentTarget.getBoundingClientRect();
    const fromRight = rect.right - e.clientX;
    const grab = pointerToCell(e);
    const resizing = fromRight <= 7 && rect.width > 14;

    if (resizing) {
      let dur = note.duration;
      startDrag(
        (ev) => {
          const c = pointerToCell(ev);
          const end = snapSec ? Math.max(note.start + snapSec, snap(c.time)) : Math.max(note.start + 0.05, c.time);
          dur = Math.max(0.05, end - note.start);
          setGhost({ ...note, duration: dur });
        },
        () => { setGhost(null); updateNote(note.id, { duration: dur }); },
      );
      return;
    }

    const offset = grab.time - note.start;
    let moved = { ...note };
    startDrag(
      (ev) => {
        const c = pointerToCell(ev);
        const start = snap(Math.max(0, c.time - offset));
        moved = { ...note, start, midi: c.pitch };
        setGhost(moved);
      },
      () => {
        setGhost(null);
        if (moved.start !== note.start || moved.midi !== note.midi) {
          if (moved.midi !== note.midi) auditionNote(moved.midi, 0.7);
          updateNote(note.id, { start: moved.start, midi: moved.midi });
        }
      },
    );
  };

  /* ── velocity lane ──────────────────────────────────────────────────── */

  const onVelPointerDown = (e, note) => {
    e.stopPropagation();
    e.preventDefault();
    setSelectedId(note.id);
    const rect = e.currentTarget.parentElement.getBoundingClientRect();
    const apply = (ev) => {
      const v = 1 - (ev.clientY - rect.top) / rect.height;
      updateNote(note.id, { velocity: Math.min(1, Math.max(0.05, Number(v.toFixed(3)))) });
    };
    apply(e);
    startDrag(apply);
  };

  const syncScroll = (from, to) => {
    if (syncingRef.current || !from || !to) return;
    syncingRef.current = true;
    to.scrollLeft = from.scrollLeft;
    requestAnimationFrame(() => { syncingRef.current = false; });
  };

  // Delete/Backspace kills the selected note while the roll has focus.
  const onRollKeyDown = (e) => {
    if ((e.key === 'Delete' || e.key === 'Backspace') && selected) {
      e.preventDefault();
      deleteSelected();
    }
  };

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify({ ...midi, tempo }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'lyricist-sequence.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const rollCursor = tool === 'erase' ? 'not-allowed' : tool === 'select' ? 'default' : 'crosshair';
  const beatCount = Math.ceil(totalSec / secPerBeat) + 1;

  // The roll is always on screen, even with nothing loaded — play the keybed,
  // draw notes in, and build a part from scratch.

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

        <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: '0.68rem' }}
          data-help="The instrument the sequence plays through. These are real recorded instruments — grand piano, guitars, harp, strings, horns, mallets — not synth tones. Everything is bundled with the app, so it works with no internet.">
          <Music size={13} style={{ opacity: 0.75 }} />
          <select
            value={instrumentId}
            onChange={(e) => setInstrumentId(e.target.value)}
            className="suno-chip"
            style={{ fontSize: '0.72rem', padding: '5px 8px', borderRadius: 7, maxWidth: 190, cursor: 'pointer' }}
          >
            {instrumentId.startsWith('user:') && (
              <optgroup label="My Library">
                <option value={instrumentId}>
                  {userSample?.name || 'Loaded sample'}
                </option>
              </optgroup>
            )}
            {INSTRUMENT_GROUPS.map((g) => (
              <optgroup key={g.group} label={g.group}>
                {g.items.map((it) => (
                  <option key={it.id} value={it.id}>{it.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
          <span style={{
            fontSize: '0.6rem',
            minWidth: 52,
            color: instrumentState === 'ready' ? 'rgba(52,211,153,0.9)'
              : instrumentState === 'error' ? '#f87171' : 'rgba(230,232,235,0.7)',
          }}>
            {instrumentState === 'ready' ? 'loaded'
              : instrumentState === 'error' ? 'failed' : 'loading…'}
          </span>
        </label>

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

      {/* Tools + grid */}
      <div className="seq-toolbar" style={{ gap: 8 }}>
        <div className="seq-tools">
          {TOOLS.map(({ id, label, Icon, help }) => (
            <button
              key={id}
              onClick={() => setTool(id)}
              data-help={help}
              className={`seq-tool ${tool === id ? 'seq-tool--on' : ''}`}
            >
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.68rem' }}
          data-help="Snap. Every note you draw, move or resize lands on this division of the beat. Set it to Off for free placement.">
          <Magnet size={13} style={{ opacity: 0.75 }} />
          Snap
          <select value={gridId} onChange={(e) => setGridId(e.target.value)} className="suno-chip"
            style={{ fontSize: '0.72rem', padding: '4px 7px', borderRadius: 7, cursor: 'pointer' }}>
            {GRID_OPTIONS.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}
          </select>
        </label>

        <span style={{ fontSize: '0.62rem', color: 'rgba(230,232,235,0.55)' }}>
          right-click a note to delete · Del removes the selected note
        </span>
      </div>

      {/* Piano roll */}
      <div
        className="seq-roll-wrap"
        ref={rollWrapRef}
        tabIndex={0}
        onKeyDown={onRollKeyDown}
        onScroll={() => syncScroll(rollWrapRef.current, velWrapRef.current)}
        onContextMenu={(e) => e.preventDefault()}
        onDoubleClick={(e) => {
          if (tool !== 'select') return;
          const { time, pitch } = pointerToCell(e);
          if (time < 0) return;
          const id = newNoteId();
          setMidi(prev => ({
            ...prev,
            notes: [...(prev.notes || []), { id, midi: pitch, start: snap(time, true), duration: defaultLen, velocity: 0.8 }],
          }));
          setSelectedId(id);
        }}
        data-help="The piano roll. Pick a tool above: Select moves and resizes, Draw places single notes, Paint lays down runs, Erase wipes them. Click the keys on the left to hear the instrument.">
        <div
          ref={gridRef}
          onPointerDown={onRollPointerDown}
          style={{ position: 'relative', width: rollW + KEYBED_W, height: rollH, cursor: rollCursor, touchAction: 'none' }}
        >
          {/* Row stripes + note-name gutter */}
          {Array.from({ length: rows }, (_, r) => {
            const m = maxMidi - r;
            const isC = m % 12 === 0;
            const black = [1, 3, 6, 8, 10].includes(m % 12);
            return (
              <div key={m} style={{ position: 'absolute', top: r * ROW_H, left: 0, right: 0, height: ROW_H, background: black ? 'rgba(255,45,149,0.045)' : 'transparent', borderTop: isC ? '1px solid rgba(231,165,64,0.25)' : '1px solid rgba(255,255,255,0.03)' }}>
                {/* Playable key: click it to hear the note on the current instrument. */}
                <div
                  onPointerDown={(e) => { e.stopPropagation(); auditionNote(m); }}
                  title={`${midiToName(m)} — click to hear it`}
                  style={{
                    position: 'absolute', left: 0, top: 0, height: ROW_H, width: KEYBED_W,
                    background: black ? 'linear-gradient(90deg,#0f1114,#1a1d22)' : 'linear-gradient(90deg,#303235,#444649)',
                    borderBottom: '1px solid rgba(0,0,0,0.55)',
                    borderRight: '1px solid rgba(231,165,64,0.18)',
                    cursor: 'pointer', zIndex: 3,
                  }}
                />
                {isC && <span style={{ position: 'absolute', left: 4, top: -1, fontSize: 8, color: 'rgba(231,165,64,0.95)', fontFamily: "'JetBrains Mono', monospace", zIndex: 4, pointerEvents: 'none' }}>{midiToName(m)}</span>}
              </div>
            );
          })}
          {/* Beat + snap grid */}
          {Array.from({ length: beatCount }, (_, b) => (
            <div key={`b${b}`} style={{ position: 'absolute', top: 0, bottom: 0, left: KEYBED_W + b * secPerBeat * pxPerSec, width: 1, background: b % 4 === 0 ? 'rgba(255,45,149,0.22)' : 'rgba(255,255,255,0.05)', pointerEvents: 'none' }} />
          ))}
          {snapSec > 0 && snapSec * pxPerSec > 7 && Array.from({ length: Math.ceil(totalSec / snapSec) + 1 }, (_, s) => (
            <div key={`s${s}`} style={{ position: 'absolute', top: 0, bottom: 0, left: KEYBED_W + s * snapSec * pxPerSec, width: 1, background: 'rgba(231,165,64,0.055)', pointerEvents: 'none' }} />
          ))}
          {/* Notes */}
          {notes.map(n => {
            const live = ghost && ghost.id === n.id ? ghost : n;
            return (
              <div
                key={n.id}
                className={`seq-note ${n.id === selectedId ? 'seq-note--selected' : ''} ${tool === 'select' ? 'seq-note--grab' : ''}`}
                onPointerDown={(e) => onNotePointerDown(e, n)}
                onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); removeNotes([n.id]); }}
                onDoubleClick={(e) => e.stopPropagation()}
                title={`${midiToName(live.midi)} · ${live.start.toFixed(2)}s · vel ${(live.velocity * 100) | 0}%`}
                style={{
                  left: KEYBED_W + live.start * pxPerSec,
                  top: (maxMidi - live.midi) * ROW_H + 1,
                  width: Math.max(4, live.duration * pxPerSec),
                  height: ROW_H - 2,
                  opacity: 0.45 + 0.55 * (live.velocity ?? 0.8),
                }}
              >
                <span className="seq-note-grip" />
              </div>
            );
          })}
          {/* Playhead */}
          {playing && <div className="seq-playhead" style={{ left: KEYBED_W + playheadX }} />}
        </div>
      </div>

      {/* Velocity lane — one bar per note, drag a bar to set how hard it hits */}
      <div
        className="seq-vel-wrap"
        ref={velWrapRef}
        onScroll={() => syncScroll(velWrapRef.current, rollWrapRef.current)}
        data-help="Velocity lane. Every note gets a bar; drag a bar up or down to change how hard that note hits. Taller and brighter means louder.">
        <div style={{ position: 'relative', width: rollW + KEYBED_W, height: VEL_H }}>
          <div className="seq-vel-gutter" style={{ width: KEYBED_W }}>VEL</div>
          <div style={{ position: 'absolute', left: KEYBED_W, right: 0, top: 0, height: VEL_H }}>
            {[0.25, 0.5, 0.75].map(f => (
              <div key={f} style={{ position: 'absolute', left: 0, right: 0, top: VEL_H * f, height: 1, background: 'rgba(255,255,255,0.05)' }} />
            ))}
            {notes.map(n => {
              const v = n.velocity ?? 0.8;
              return (
                <div
                  key={n.id}
                  className={`seq-vel-bar ${n.id === selectedId ? 'seq-vel-bar--selected' : ''}`}
                  onPointerDown={(e) => onVelPointerDown(e, n)}
                  title={`${midiToName(n.midi)} · vel ${(v * 100) | 0}%`}
                  style={{
                    left: n.start * pxPerSec,
                    width: Math.max(3, Math.min(n.duration * pxPerSec, 14)),
                    height: Math.max(2, v * VEL_H),
                    opacity: 0.35 + 0.65 * v,
                  }}
                />
              );
            })}
          </div>
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
          <span style={{ display: 'inline-flex', gap: 3 }} data-help="Slide the selected note earlier/later by one grid step.">
            <button className="suno-btn" onClick={() => nudge('start', -(snapSec || 0.05))}><ChevronLeft size={13} /></button>
            <button className="suno-btn" onClick={() => nudge('start', snapSec || 0.05)}><ChevronRight size={13} /></button>
          </span>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }} data-help="Lengthen or shorten the selected note by one grid step.">
            Len
            <button className="suno-btn" onClick={() => nudge('duration', -(snapSec || 0.05))}>−</button>
            <button className="suno-btn" onClick={() => nudge('duration', snapSec || 0.05)}>+</button>
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

      <div style={{ fontSize: '0.62rem', color: 'rgba(230,232,235,0.55)' }}>
        {notes.length} notes · {totalSec.toFixed(1)}s at source tempo · {TOOLS.find(t => t.id === tool)?.label} tool
      </div>
    </div>
  );
}
