import React, { useState, useEffect, useRef, useCallback } from 'react';
import AudioToMidi from './AudioToMidi.jsx';
import Sequencer from './Sequencer.jsx';
import Visualizer from './Visualizer.jsx';
import SampleLibrary from './SampleLibrary.jsx';
import DrumMachine from './DrumMachine.jsx';
import { FxKnobGrid, FxToggles, needsIrRebuild } from './FxRackPanel.jsx';
import { registerDemoSnapshot } from '../../services/demoSafety.js';
import { clearLibrary, countSamples } from '../../services/sampleLibrary.js';
import { getAudioContext, getMasterBus } from '../../services/audioEngine.js';
import { createFxChain, DEFAULT_FX } from '../../services/fxRack.js';

import TabBackground from '../common/TabBackground.jsx';
import { Piano } from 'lucide-react';
import { Icon } from '../common/Glyph.jsx';
// MIDI Studio tab — Lyricist 4.1.3
// Audio → MIDI (basic-pitch, fully offline) feeding an offline piano-roll
// sequencer, with a Butterchurn/Milkdrop visualizer wired to the same audio
// bus. The sequence persists locally so it survives restarts.

const STORE_KEY = 'lyricistMidiStudio';
const FX_KEY = 'lyricistRollFx';

// Debug switch: #off=viz,drums,sampler,seq,a2m leaves those panels out, so a
// runaway on this tab can be bisected without a rebuild per guess.
const OFF = new Set(
  (new URLSearchParams(window.location.hash.replace(/^#/, '')).get('off') || '')
    .split(',').map((s) => s.trim()).filter(Boolean)
);

// #wipe=samples empties the sample library once at startup. Recordings live in
// their own database and are never touched by this.
const WIPE_SAMPLES =
  new URLSearchParams(window.location.hash.replace(/^#/, '')).get('wipe') === 'samples';

export default function MidiStudio() {
  const [midi, setMidi] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      if (saved?.notes) return saved;
    } catch { /* corrupt save — start fresh */ }
    return { tempo: 120, notes: [] };
  });
  const [sourceName, setSourceName] = useState('');
  const [userSample, setUserSample] = useState(null);   // sample sent from the library to the roll

  // Effects rack for the piano roll and the sample library.
  //
  // Until 4.2.0 both of those played straight into the master bus — source,
  // gain, out — so every effect control in the app was wired only to the drum
  // machine. Your own samples had no tone shaping at all. This is the rack they
  // were missing; the sampler previews through it too, so what you audition is
  // what the roll will play.
  const [rollFx, setRollFx] = useState(() => {
    try { return { ...DEFAULT_FX, ...JSON.parse(localStorage.getItem(FX_KEY) || '{}') }; }
    catch { return { ...DEFAULT_FX }; }
  });
  const [fxOpen, setFxOpen] = useState(false);
  const fxChainRef = useRef(null);
  // Latest settings, readable from getFxInput without making it depend on them
  // (it must keep a stable identity — Sequencer holds it in a useCallback dep).
  const fxSettingsRef = useRef(rollFx);
  fxSettingsRef.current = rollFx;

  // Built on first use, not on mount: constructing a convolver before the user
  // has played anything would force the AudioContext awake for nothing.
  const getFxInput = useCallback(() => {
    if (!fxChainRef.current) {
      const chain = createFxChain(getAudioContext(), fxSettingsRef.current);
      chain.output.connect(getMasterBus());
      fxChainRef.current = chain;
    }
    return fxChainRef.current.input;
  }, []);

  useEffect(() => {
    fxChainRef.current?.set(rollFx);
    try { localStorage.setItem(FX_KEY, JSON.stringify(rollFx)); } catch { /* storage full */ }
  }, [rollFx]);

  useEffect(() => () => { fxChainRef.current?.dispose(); fxChainRef.current = null; }, []);

  const patchFx = useCallback((patch) => {
    setRollFx((f) => ({ ...f, ...patch, __rebuildIR: needsIrRebuild(patch) }));
  }, []);

  useEffect(() => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(midi)); } catch { /* storage full */ }
  }, [midi]);

  // The demo converts audio and loads its own notes into the roll, which would
  // otherwise overwrite a part you were writing. Snapshot the whole sequence.
  const liveRef = useRef({ midi, sourceName });
  liveRef.current = { midi, sourceName };
  useEffect(() => registerDemoSnapshot('midi-studio', {
    snapshot: () => ({ midi: liveRef.current.midi, sourceName: liveRef.current.sourceName }),
    restore: (s) => {
      if (!s) return;
      setMidi(s.midi);
      setSourceName(s.sourceName);
    },
    hasWork: () => (liveRef.current.midi?.notes || []).length > 0,
  }), []);

  useEffect(() => {
    if (!WIPE_SAMPLES) return;
    (async () => {
      const log = (m) => { console.warn(`[lyricist] ${m}`); window.lyricistAPI?.log?.(m); };
      try {
        log('wipe requested — emptying the sample library');
        const removed = await clearLibrary();
        const left = await countSamples();
        log(`sample library emptied: ${removed.samples} samples removed; ${left} left`);
      } catch (e) {
        log(`sample wipe FAILED: ${e?.message || e}`);
      }
    })();
  }, []);

  const handleNotes = (midiJSON, name) => {
    setMidi(midiJSON);
    setSourceName(name || '');
  };

  return (
    <div className="tab-video-shell">
      <TabBackground name="midistudio" />
      <div className="tab-video-content">
    <div style={{ flex: 1, minHeight: 0, width: '100%', display: 'flex', overflow: 'hidden' }}>
      <div className="midi-shell">
        <div className="midi-sidebar">
          <div>
            <h3 style={{ fontSize: '1rem', marginBottom: 4 }}><Icon i={Piano} />MIDI Studio</h3>
            <p style={{ fontSize: '0.72rem', color: 'rgba(230,232,235,0.7)', lineHeight: 1.5 }}>
              Turn any audio — a Suno track, a guitar riff, or a hummed voice memo — into
              editable MIDI, tweak it in the sequencer, and watch Milkdrop dance to it.
              Everything runs offline on your machine.
            </p>
          </div>

          {!OFF.has('a2m') && (
            <div data-demo="midi-convert">
              <AudioToMidi onNotes={handleNotes} />
            </div>
          )}

          {sourceName && (
            <div className="pill-green" style={{ padding: '7px 10px', borderRadius: 8, fontSize: '0.68rem' }}>
              Converted “{sourceName}” — {midi.notes.length} notes in the sequencer
            </div>
          )}
        </div>

        <div className="midi-main">
          {!OFF.has('seq') && <Sequencer midi={midi} setMidi={setMidi} userSample={userSample} fxInput={getFxInput} />}

          {/* Rack for the roll + sampler. Collapsed by default so it doesn't
              push the drum machine off the page. */}
          {!OFF.has('seq') && (
            <div data-demo="midi-roll" style={{ border: '1px solid rgba(231,165,64,0.3)', borderRadius: 10, padding: 12, background: 'rgba(16,18,21,0.5)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#e7a540' }}>
                  Piano Roll &amp; Sampler — Effects Rack
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    className="suno-chip"
                    onClick={() => setRollFx({ ...DEFAULT_FX })}
                    data-help="Put every knob on this rack back to flat — no filtering, no drive, no delay, no reverb."
                  >
                    Reset
                  </button>
                  <button
                    className="suno-chip"
                    onClick={() => setFxOpen((v) => !v)}
                    data-help="Show or hide the effects knobs for the piano roll and your sample library."
                  >
                    {fxOpen ? 'Hide' : 'Show'} Effects
                  </button>
                </div>
              </div>
              {fxOpen ? (
                <div style={{ marginTop: 10 }}>
                  <FxKnobGrid fx={rollFx} onChange={patchFx} />
                  <FxToggles fx={rollFx} onChange={patchFx} />
                </div>
              ) : (
                <div style={{ fontSize: '0.6rem', color: 'rgba(230,232,235,0.5)', marginTop: 6 }}>
                  Filter, drive, bitcrush, EQ, compression, delay and reverb — applied to the piano roll
                  and to every sample you preview in the library.
                </div>
              )}
            </div>
          )}

          {!OFF.has('drums') && <DrumMachine />}
          {!OFF.has('sampler') && <SampleLibrary onUseSample={setUserSample} fxInput={getFxInput} />}
          {!OFF.has('viz') && <Visualizer />}
        </div>
      </div>
    </div>
      </div>
    </div>
  );
}
