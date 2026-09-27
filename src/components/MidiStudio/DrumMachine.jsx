import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Play, Square, Trash2, Shuffle, Save, FolderDown, Sliders, Volume2, VolumeX, Headphones, Drum } from 'lucide-react';
import { getAudioContext, getMasterBus, resumeAudio } from '../../services/audioEngine.js';
import {
  KIT, STEPS, DEFAULT_VOICE, DEFAULT_FX,
  triggerVoice, triggerSample, createFxChain,
  emptyPattern, starterPattern, migratePattern,
} from '../../services/drumEngine.js';
import { listPacks, listSamples, getSampleBuffer } from '../../services/sampleLibrary.js';
import { registerDemoSnapshot } from '../../services/demoSafety.js';
import { Knob, FxKnobGrid, FxToggles } from './FxRackPanel.jsx';
import { Icon } from '../common/Glyph.jsx';

// 808 Drum Machine — Lyricist 4.2.0
// Synthesized 808 kit, 16 steps, per-track effects rack, master rack, and
// pattern presets. Any track can play one of your own samples instead of the
// synth voice. Everything is offline.

const PRESET_KEY = 'lyricist808Presets';

/**
 * The knobs a TR-808 has on the front panel, per drum. Only the ones a given
 * voice actually uses are shown — a rimshot has no decay control on the real
 * machine either. Everything is 0..1 so the panel stays uniform; the engine
 * turns these into the circuit's own units.
 */
const VOICE_CONTROLS = [
  { key: 'level',  label: 'Level',   min: 0, max: 3, step: 0.01, help: 'Volume of this drum before its effects.' },
  { key: 'tone',   label: 'Tone',    min: 0, max: 1, step: 0.01, help: 'Brightness. On the kick it opens the lowpass; on the snare it moves the noise filter; on the cymbal it tilts low against high.' },
  { key: 'decay',  label: 'Decay',   min: 0, max: 1, step: 0.01, help: 'How long the hit rings out. A long kick decay is the 808 boom.' },
  { key: 'tuning', label: 'Tuning',  min: 0, max: 1, step: 0.01, help: 'Pitch of the drum within its range.' },
  { key: 'snap',   label: 'Snappy',  min: 0, max: 1, step: 0.01, help: 'Balance between the drum body and the snare wires.' },
  { key: 'drive',  label: 'Punch',   min: 0, max: 1, step: 0.01, help: 'How hard the kick hits the soft clipper. This is where the push comes from.' },
];
const LOOKAHEAD = 0.12;
const TICK_MS = 25;

export default function DrumMachine() {
  const [pattern, setPattern] = useState(() => starterPattern());
  const [playing, setPlaying] = useState(false);
  const [tempo, setTempo] = useState(90);
  const [swing, setSwing] = useState(0);
  const [step, setStep] = useState(-1);
  const [voices, setVoices] = useState(() => JSON.parse(JSON.stringify(DEFAULT_VOICE)));
  const [mutes, setMutes] = useState({});
  const [solo, setSolo] = useState(null);
  const [fxOpen, setFxOpen] = useState(null);        // track id or 'master'
  const [trackFx, setTrackFx] = useState(() => Object.fromEntries(KIT.map((k) => [k.id, { ...DEFAULT_FX }])));
  const [masterFx, setMasterFx] = useState({ ...DEFAULT_FX });
  const [assigned, setAssigned] = useState({});      // trackId -> { id, name }
  const [librarySamples, setLibrarySamples] = useState([]);
  const [presets, setPresets] = useState(() => {
    try { return JSON.parse(localStorage.getItem(PRESET_KEY)) || []; } catch { return []; }
  });

  const schedRef = useRef(null);
  const stateRef = useRef({});
  const chainsRef = useRef({});      // trackId -> fx chain
  const masterRef = useRef(null);
  const buffersRef = useRef({});     // trackId -> AudioBuffer
  const presetFileRef = useRef(null);

  /* ── Audio graph:每 track chain -> master chain -> app master bus ── */
  useEffect(() => {
    const ctx = getAudioContext();
    const master = createFxChain(ctx, masterFx);
    master.output.connect(getMasterBus());
    masterRef.current = master;
    for (const k of KIT) {
      const chain = createFxChain(ctx, trackFx[k.id]);
      chain.output.connect(master.input);
      chainsRef.current[k.id] = chain;
    }
    return () => {
      Object.values(chainsRef.current).forEach((c) => c.dispose());
      chainsRef.current = {};
      master.dispose();
      masterRef.current = null;
    };
    // Built once; live changes go through the set() calls below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { masterRef.current?.set(masterFx); }, [masterFx]);
  useEffect(() => {
    for (const k of KIT) chainsRef.current[k.id]?.set(trackFx[k.id]);
  }, [trackFx]);

  // Pull the user's samples so any track can play one instead of the synth.
  useEffect(() => {
    (async () => {
      // One pass over the library, then label each sample with its pack. This
      // used to call listSamples() once per pack, and every one of those calls
      // read the whole store — the library came off disk once per pack.
      const packs = await listPacks();
      const names = new Map(packs.map((p) => [p.id, p.name]));
      const all = await listSamples();
      setLibrarySamples(all.map((x) => ({ ...x, packName: names.get(x.packId) || 'Pack' })));
    })();
  }, []);

  // The scheduler runs off refs, not closures. Everything it reads — pattern,
  // tempo, swing, mutes, the voice knobs — is kept here and updated on every
  // render, so changing any of them takes effect on the very next step without
  // the sequencer being torn down and rebuilt. Restarting it was resetting the
  // bar to step 1 mid-play every time a knob moved.
  const liveRef = useRef({});
  liveRef.current = { pattern, tempo, swing, mutes, solo, voices };

  const audible = useCallback((id) => {
    const { solo: s, mutes: m } = liveRef.current;
    return s ? s === id : !m[id];
  }, []);

  const fire = useCallback((trackId, when, velocity) => {
    const ctx = getAudioContext();
    const chain = chainsRef.current[trackId];
    if (!chain) return;
    const v = liveRef.current.voices[trackId];
    const buf = buffersRef.current[trackId];
    if (buf) {
      triggerSample(ctx, chain.input, buf, when, {
        level: v?.level ?? 1,
        pitch: v?.pitch ?? 0,
        velocity,
      });
    } else {
      triggerVoice(ctx, chain.input, trackId, when, v, velocity);
    }
  }, []);

  const stop = useCallback(() => {
    clearInterval(schedRef.current);
    schedRef.current = null;
    stateRef.current = {};
    setPlaying(false);
    setStep(-1);
  }, []);

  useEffect(() => stop, [stop]);

  const play = useCallback(async () => {
    await resumeAudio();
    const ctx = getAudioContext();
    clearInterval(schedRef.current);

    const secPerStep = () => 60 / liveRef.current.tempo / 4;   // 16ths
    stateRef.current = { next: ctx.currentTime + 0.1, idx: 0 };
    setPlaying(true);

    schedRef.current = setInterval(() => {
      const st = stateRef.current;
      if (!st) return;
      const now = ctx.currentTime;

      // If the clock got behind — a stutter, a garbage collection pause, the
      // window being hidden — skip forward instead of firing every step that
      // was missed. Web Audio plays anything scheduled in the past
      // *immediately*, so catching up produces a burst of notes out of nowhere
      // after the machine has been running a while. Jump to the next step on
      // the grid and carry on in time.
      if (st.next < now) {
        const step = secPerStep();
        const missed = Math.ceil((now - st.next) / step);
        st.next += missed * step;
        st.idx += missed;
      }

      while (st.next < now + LOOKAHEAD) {
        const i = st.idx % STEPS;
        // Swing pushes every other 16th later, which is what gives it groove.
        const swingOffset = i % 2 === 1 ? secPerStep() * liveRef.current.swing * 0.5 : 0;
        const when = st.next + swingOffset;
        for (const k of KIT) {
          const v = liveRef.current.pattern[k.id]?.[i];
          if (v && audible(k.id)) fire(k.id, when, v);
        }
        const at = i;
        setTimeout(() => setStep(at), Math.max(0, (when - ctx.currentTime) * 1000));
        st.next += secPerStep();
        st.idx++;
      }
    }, TICK_MS);
  }, [audible, fire]);

  // No restart effect here on purpose. The scheduler reads everything through
  // liveRef, so tempo, pattern, swing, mutes and knob changes all land on the
  // next step while the bar keeps its place.

  const toggleStep = (trackId, i, e) => {
    setPattern((prev) => {
      const next = { ...prev, [trackId]: [...prev[trackId]] };
      const cur = next[trackId][i];
      // Plain click cycles off/on; shift-click sets an accent.
      next[trackId][i] = e?.shiftKey ? (cur === 1 ? 0.6 : 1) : (cur ? 0 : 0.85);
      return next;
    });
  };

  const assignSample = async (trackId, sampleId) => {
    if (!sampleId) {
      delete buffersRef.current[trackId];
      setAssigned((a) => { const n = { ...a }; delete n[trackId]; return n; });
      return;
    }
    const ctx = getAudioContext();
    try {
      buffersRef.current[trackId] = await getSampleBuffer(ctx, sampleId);
      const s = librarySamples.find((x) => x.id === sampleId);
      setAssigned((a) => ({ ...a, [trackId]: { id: sampleId, name: s?.name || 'sample' } }));
    } catch {
      /* leave the synth voice in place if the sample won't decode */
    }
  };

  /* ── Presets ────────────────────────────────────────────────────── */

  const snapshotState = () => ({
    pattern, tempo, swing, voices, trackFx, masterFx, mutes,
    assigned: Object.fromEntries(Object.entries(assigned).map(([k, v]) => [k, v.id])),
  });

  const applyState = async (s) => {
    if (!s) return;
    setPattern(s.pattern ? migratePattern(s.pattern) : starterPattern());
    setTempo(s.tempo ?? 90);
    setSwing(s.swing ?? 0);
    // Merge over the defaults so voices added since the preset was saved exist.
    setVoices({ ...JSON.parse(JSON.stringify(DEFAULT_VOICE)), ...(s.voices || {}) });
    setTrackFx(s.trackFx || Object.fromEntries(KIT.map((k) => [k.id, { ...DEFAULT_FX }])));
    setMasterFx(s.masterFx || { ...DEFAULT_FX });
    setMutes(s.mutes || {});
    buffersRef.current = {};
    setAssigned({});
    for (const [trackId, sampleId] of Object.entries(s.assigned || {})) {
      await assignSample(trackId, sampleId);
    }
  };

  const savePreset = () => {
    const name = window.prompt('Name this pattern', `Beat ${presets.length + 1}`);
    if (name === null) return;
    const next = [...presets, { name: name.trim() || `Beat ${presets.length + 1}`, at: Date.now(), state: snapshotState() }];
    setPresets(next);
    localStorage.setItem(PRESET_KEY, JSON.stringify(next));
  };

  const exportPresets = () => {
    const blob = new Blob([JSON.stringify({ format: 'lyricist-808-presets', version: 1, presets }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Lyricist 808 Presets.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Ghost Demo must never eat a beat you were building.
  useEffect(() => registerDemoSnapshot('drum-machine', {
    snapshot: () => snapshotState(),
    restore: (s) => applyState(s),
    hasWork: () => Object.values(pattern).some((row) => row.some(Boolean)),
  }));

  const anySolo = Boolean(solo);
  const fxTarget = fxOpen === 'master' ? masterFx : (fxOpen ? trackFx[fxOpen] : null);
  const setFxTarget = (patch) => {
    if (fxOpen === 'master') setMasterFx((m) => ({ ...m, ...patch, __rebuildIR: 'reverbSize' in patch }));
    else if (fxOpen) setTrackFx((t) => ({ ...t, [fxOpen]: { ...t[fxOpen], ...patch, __rebuildIR: 'reverbSize' in patch } }));
  };

  return (
    <div className="card-cosmic" style={{ borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Transport */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: '0.9rem' }}><Icon i={Drum} />808 Drum Machine</h3>

        <button
          onClick={playing ? stop : play}
          className={playing ? '' : 'btn-neon-purple'}
          data-help="Start and stop the beat. It loops 16 steps."
          style={{
            padding: '7px 16px', borderRadius: 8, fontWeight: 700, fontSize: '0.74rem',
            border: playing ? '1px solid rgba(248,113,113,0.5)' : 'none',
            background: playing ? 'rgba(248,113,113,0.12)' : undefined,
            color: playing ? '#f87171' : '#fff', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          {playing ? <><Square size={13} /> Stop</> : <><Play size={13} /> Play</>}
        </button>

        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.68rem' }}
          data-help="Beats per minute.">
          {tempo} BPM
          <input type="range" min={50} max={200} value={tempo} className="suno-range"
            onChange={(e) => setTempo(Number(e.target.value))} style={{ width: 100 }} />
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.68rem' }}
          data-help="Swing pushes every other 16th note late, which is what turns a stiff grid into a groove.">
          Swing {Math.round(swing * 100)}%
          <input type="range" min={0} max={0.7} step={0.01} value={swing} className="suno-range"
            onChange={(e) => setSwing(Number(e.target.value))} style={{ width: 90 }} />
        </label>

        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto', flexWrap: 'wrap' }}>
          <button className="suno-chip" onClick={() => setFxOpen(fxOpen === 'master' ? null : 'master')}
            style={{ borderColor: fxOpen === 'master' ? '#E7A540' : undefined, color: fxOpen === 'master' ? '#E7A540' : undefined }}
            data-help="The master effects rack — filter, drive, bitcrusher, delay, reverb and compression across the whole kit.">
            <Sliders size={12} /> Master FX
          </button>
          <button className="suno-chip" onClick={() => setPattern(starterPattern())} data-help="Back to the starter beat.">
            Reset
          </button>
          <button className="suno-chip" onClick={() => setPattern(emptyPattern())} data-help="Wipe every step.">
            <Trash2 size={12} /> Clear
          </button>
          <button className="suno-chip" data-help="Roll a random beat to start from."
            onClick={() => {
              const p = emptyPattern();
              for (let i = 0; i < STEPS; i++) {
                if (i % 4 === 0 || Math.random() < 0.18) p.kick[i] = 1;
                if (i % 8 === 4) p.snare[i] = 1;
                if (Math.random() < 0.55) p.hatC[i] = 0.7;
                if (Math.random() < 0.1) p.hatO[i] = 0.6;
                if (Math.random() < 0.08) p.clap[i] = 0.8;
              }
              setPattern(p);
            }}>
            <Shuffle size={12} /> Random
          </button>
          <button className="suno-chip" onClick={savePreset} data-help="Save this whole kit — pattern, tempo, knobs, effects and sample assignments — as a preset.">
            <Save size={12} /> Save
          </button>
          <button className="suno-chip" onClick={exportPresets} data-help="Write your presets out to a .json file you can keep or share.">
            Export
          </button>
          <button className="suno-chip" onClick={() => presetFileRef.current?.click()} data-help="Load presets from a .json file.">
            <FolderDown size={12} /> Import
          </button>
        </div>
      </div>

      <input ref={presetFileRef} type="file" accept=".json" style={{ display: 'none' }}
        onChange={async (e) => {
          const f = e.target.files?.[0]; e.target.value = '';
          if (!f) return;
          try {
            const data = JSON.parse(await f.text());
            const incoming = Array.isArray(data) ? data : data.presets || [];
            const next = [...presets, ...incoming];
            setPresets(next);
            localStorage.setItem(PRESET_KEY, JSON.stringify(next));
          } catch { /* ignore a bad file */ }
        }} />

      {/* Saved presets */}
      {presets.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {presets.map((p, i) => (
            <span key={i} style={{ display: 'inline-flex', alignItems: 'center' }}>
              <button className="suno-chip" onClick={() => applyState(p.state)} style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0 }}>
                {p.name}
              </button>
              <button
                className="suno-chip"
                onClick={() => {
                  const next = presets.filter((_, j) => j !== i);
                  setPresets(next);
                  localStorage.setItem(PRESET_KEY, JSON.stringify(next));
                }}
                style={{ borderTopLeftRadius: 0, borderBottomLeftRadius: 0, borderLeft: 'none', padding: '3px 6px', color: 'rgba(248,113,113,0.8)' }}
              >
                <Trash2 size={9} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Step grid */}
      <div style={{ overflowX: 'auto' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 660 }}>
          {KIT.map((k) => (
            <div key={k.id} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 84, flexShrink: 0, fontSize: '0.64rem', color: k.color, fontWeight: 700 }}>
                {k.name}
              </div>

              <button
                onClick={() => setMutes((m) => ({ ...m, [k.id]: !m[k.id] }))}
                className="suno-chip"
                style={{ padding: '2px 5px', flexShrink: 0, opacity: mutes[k.id] ? 1 : 0.45, color: mutes[k.id] ? '#f87171' : undefined }}
                data-help="Mute this track."
              >
                {mutes[k.id] ? <VolumeX size={10} /> : <Volume2 size={10} />}
              </button>

              <button
                onClick={() => setSolo(solo === k.id ? null : k.id)}
                className="suno-chip"
                style={{ padding: '2px 5px', flexShrink: 0, opacity: solo === k.id ? 1 : 0.45, color: solo === k.id ? '#E7A540' : undefined }}
                data-help="Solo this track — everything else goes quiet."
              >
                <Headphones size={10} />
              </button>

              <button
                onClick={() => setFxOpen(fxOpen === k.id ? null : k.id)}
                className="suno-chip"
                style={{ padding: '2px 5px', flexShrink: 0, color: fxOpen === k.id ? '#E7A540' : undefined }}
                data-help="This track's own effects rack."
              >
                <Sliders size={10} />
              </button>

              <div style={{ display: 'flex', gap: 2 }}>
                {Array.from({ length: STEPS }, (_, i) => {
                  const v = pattern[k.id]?.[i] || 0;
                  const isBeat = i % 4 === 0;
                  return (
                    <button
                      key={i}
                      onClick={(e) => toggleStep(k.id, i, e)}
                      title="Click to toggle · Shift-click for accent"
                      style={{
                        width: 26, height: 26, borderRadius: 5, cursor: 'pointer',
                        border: step === i && playing ? '1px solid #fff' : `1px solid ${isBeat ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.1)'}`,
                        background: v
                          ? (v >= 1 ? k.color : `${k.color}88`)
                          : (isBeat ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.03)'),
                        boxShadow: v ? `0 0 8px ${k.color}99` : 'none',
                        transition: 'background 0.08s, box-shadow 0.08s',
                      }}
                    />
                  );
                })}
              </div>

              <select
                value={assigned[k.id]?.id || ''}
                onChange={(e) => assignSample(k.id, e.target.value)}
                className="suno-chip"
                style={{ fontSize: '0.6rem', padding: '2px 5px', maxWidth: 130, flexShrink: 0, cursor: 'pointer' }}
                data-help="Play one of your own samples on this track instead of the synthesized 808 voice."
              >
                <option value="">808 synth</option>
                {librarySamples.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </div>

      {/* Effects rack */}
      {fxTarget && (
        <div style={{ border: '1px solid rgba(231,165,64,0.3)', borderRadius: 10, padding: 12, background: 'rgba(16,18,21,0.5)' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, marginBottom: 8, color: '#E7A540' }}>
            {fxOpen === 'master' ? 'Master' : KIT.find((k) => k.id === fxOpen)?.name} — Effects Rack
          </div>
          <FxKnobGrid fx={fxTarget} onChange={setFxTarget} />

          {fxOpen === 'master' && <FxToggles fx={fxTarget} onChange={setFxTarget} />}

          {/* The voice's own panel — the knobs a real 808 has on the front for
              this drum, and only the ones this drum actually has. */}
          {fxOpen !== 'master' && (
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.08)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(168px, 1fr))', gap: 10 }}>
              {VOICE_CONTROLS
                .filter(({ key }) => voices[fxOpen] && key in voices[fxOpen])
                .map(({ key, label, min, max, step, help }) => (
                  <Knob
                    key={key}
                    label={label}
                    value={voices[fxOpen]?.[key] ?? 0}
                    min={min} max={max} step={step}
                    onChange={(v) => setVoices((s) => ({ ...s, [fxOpen]: { ...s[fxOpen], [key]: v } }))}
                    help={help}
                  />
                ))}
            </div>
          )}
        </div>
      )}

      <div style={{ fontSize: '0.6rem', color: 'rgba(230,232,235,0.45)' }}>
        Click a step to place a hit · Shift-click for an accent · every track can play your own sample
      </div>
    </div>
  );
}

