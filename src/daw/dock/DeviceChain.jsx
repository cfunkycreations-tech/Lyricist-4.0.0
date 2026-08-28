import React, { useState, useCallback, useEffect } from 'react';
import effectRackEngine from '../engine/EffectRackEngine';
import RotaryKnob from '../components/RotaryKnob';

const TRACK_ID = 'master';

/**
 * Every knob in the rack, in render order, with the range it sweeps and the
 * engine call it drives. Keeping this as data means the UI, the parameter
 * bounds and the DSP wiring cannot drift apart.
 *
 * `apply` receives the raw display value; converting to engine units (ms to
 * seconds, percent to 0..1) happens there so the readout stays human.
 */
const RACK = [
  {
    id: 'eq',
    name: '4-Band Parametric EQ',
    color: 'var(--gm-ice-white, #F0F8FF)',
    params: [
      { key: 'freq1', label: 'Low', unit: 'Hz', min: 20, max: 200, step: 1, value: 80, apply: (v) => effectRackEngine.setEqBand(TRACK_ID, 0, undefined, v) },
      { key: 'freq2', label: 'L-Mid', unit: 'Hz', min: 200, max: 1000, step: 1, value: 400, apply: (v) => effectRackEngine.setEqBand(TRACK_ID, 1, undefined, v) },
      { key: 'freq3', label: 'H-Mid', unit: 'Hz', min: 1000, max: 5000, step: 10, value: 2500, apply: (v) => effectRackEngine.setEqBand(TRACK_ID, 2, undefined, v) },
      { key: 'freq4', label: 'High', unit: 'Hz', min: 5000, max: 20000, step: 50, value: 10000, apply: (v) => effectRackEngine.setEqBand(TRACK_ID, 3, undefined, v) }
    ]
  },
  {
    id: 'compressor',
    name: 'Studio Compressor',
    color: 'var(--gm-amber, #FF9900)',
    params: [
      { key: 'threshold', label: 'Thresh', unit: 'dB', min: -60, max: 0, step: 0.5, value: -24, apply: (v) => effectRackEngine.setCompressorParam(TRACK_ID, 'threshold', v) },
      { key: 'ratio', label: 'Ratio', unit: ':1', min: 1, max: 20, step: 0.5, value: 12, apply: (v) => effectRackEngine.setCompressorParam(TRACK_ID, 'ratio', v) },
      { key: 'attack', label: 'Attck', unit: 'ms', min: 0, max: 100, step: 1, value: 3, apply: (v) => effectRackEngine.setCompressorParam(TRACK_ID, 'attack', v / 1000) },
      { key: 'makeup', label: 'Gain', unit: 'dB', min: -12, max: 24, step: 0.5, value: 0, apply: (v) => effectRackEngine.setCompressorParam(TRACK_ID, 'makeupGain', v) }
    ]
  },
  {
    id: 'delay',
    name: 'Stereo Delay',
    color: 'var(--gm-crimson, #E63946)',
    params: [
      { key: 'time', label: 'Time', unit: 'ms', min: 1, max: 2000, step: 1, value: 500, apply: (v) => effectRackEngine.setDelayParam(TRACK_ID, 'time', v / 1000) },
      { key: 'feedback', label: 'Fdbk', unit: '%', min: 0, max: 100, step: 1, value: 30, apply: (v) => effectRackEngine.setDelayParam(TRACK_ID, 'feedback', v / 100) },
      { key: 'mix', label: 'Mix', unit: '%', min: 0, max: 100, step: 1, value: 50, apply: (v) => effectRackEngine.setDelayParam(TRACK_ID, 'mix', v / 100) }
    ]
  },
  {
    id: 'reverb',
    name: 'Studio Reverb',
    color: 'var(--gm-ice-white, #F0F8FF)',
    params: [
      // Size is shown as a percentage of a 6 second maximum tail.
      { key: 'size', label: 'Size', unit: '%', min: 0, max: 100, step: 1, value: 100, apply: (v) => effectRackEngine.setReverbParam(TRACK_ID, 'size', Math.max(0.1, (v / 100) * 6)) },
      { key: 'preDelay', label: 'Pre', unit: 'ms', min: 0, max: 100, step: 1, value: 20, apply: (v) => effectRackEngine.setReverbParam(TRACK_ID, 'preDelay', v / 1000) },
      { key: 'mix', label: 'Mix', unit: '%', min: 0, max: 100, step: 1, value: 20, apply: (v) => effectRackEngine.setReverbParam(TRACK_ID, 'mix', v / 100) }
    ]
  }
];

/** Seed state straight from the rack definition so defaults live in one place. */
function initialValues() {
  const out = {};
  for (const unit of RACK) {
    out[unit.id] = {};
    for (const p of unit.params) out[unit.id][p.key] = p.value;
  }
  return out;
}

/**
 * DeviceChain - Active VST3 Device Chain rack for the selected track.
 * 4-unit rack: Parametric 4-Band EQ, Studio Compressor, Stereo Delay, Studio Reverb.
 *
 * Every knob is live: hover and scroll to turn it, drag it vertically, or
 * double click to reset. Each move is pushed straight into EffectRackEngine.
 */
export default function DeviceChain() {
  const [values, setValues] = useState(initialValues);
  const [bypassed, setBypassed] = useState({ eq: false, compressor: false, delay: false, reverb: false });

  // Build the chain and push the current knob positions into it. The engine
  // needs a running AudioContext, which only exists after a user gesture, so
  // this retries until AudioGraph is up rather than silently doing nothing.
  useEffect(() => {
    let cancelled = false;

    const sync = () => {
      if (cancelled) return true;
      if (!effectRackEngine.initTrackEffects(TRACK_ID)) return false;
      for (const unit of RACK) {
        for (const p of unit.params) p.apply(values[unit.id][p.key]);
      }
      return true;
    };

    if (sync()) return undefined;
    const timer = setInterval(() => {
      if (sync()) clearInterval(timer);
    }, 500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
    // Runs once: later knob moves apply themselves through handleChange.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChange = useCallback((unitId, param, next) => {
    setValues((prev) => ({ ...prev, [unitId]: { ...prev[unitId], [param.key]: next } }));
    param.apply(next);
  }, []);

  const toggleBypass = useCallback((unitId) => {
    setBypassed((prev) => {
      const next = !prev[unitId];
      effectRackEngine.toggleBypass(TRACK_ID, unitId, next);
      return { ...prev, [unitId]: next };
    });
  }, []);

  return (
    <div style={styles.container}>
      <div style={styles.rackContainer}>
        {RACK.map((unit) => (
          <div key={unit.id} style={{ ...styles.rackSlot, opacity: bypassed[unit.id] ? 0.6 : 1 }}>
            <div style={styles.slotHeader}>
              <span style={styles.pluginName}>{unit.name}</span>
              <button
                style={{ ...styles.bypassBtn, backgroundColor: bypassed[unit.id] ? 'var(--gm-crimson, #E63946)' : unit.color }}
                onClick={() => toggleBypass(unit.id)}
                title={bypassed[unit.id] ? 'Bypassed — click to enable' : 'Active — click to bypass'}
              >
                {bypassed[unit.id] ? 'BYPASS' : 'ON'}
              </button>
            </div>

            <div style={styles.knobsRow}>
              {unit.params.map((p) => (
                <RotaryKnob
                  key={p.key}
                  size={48}
                  value={values[unit.id][p.key]}
                  min={p.min}
                  max={p.max}
                  step={p.step}
                  label={p.label}
                  unit={p.unit}
                  color={unit.color}
                  defaultValue={p.value}
                  disabled={bypassed[unit.id]}
                  onChange={(v) => handleChange(unit.id, p, v)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const styles = {
  container: {
    height: '100%',
    padding: '16px',
    backgroundColor: 'var(--gm-bg, #1a1a1a)',
    color: 'var(--gm-text, #e0e0e0)',
    fontFamily: 'Inter, Roboto, sans-serif',
    display: 'flex',
    overflowX: 'auto',
  },
  rackContainer: {
    display: 'flex',
    gap: '12px',
    alignItems: 'stretch',
  },
  rackSlot: {
    minWidth: '260px',
    backgroundColor: 'var(--gm-panel, #242424)',
    border: '1px solid var(--gm-border, #333333)',
    borderRadius: '4px',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), 0 4px 6px rgba(0,0,0,0.3)',
    transition: 'opacity 0.2s',
  },
  slotHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: '1px solid #333',
    paddingBottom: '8px',
  },
  pluginName: {
    fontWeight: 600,
    fontSize: '14px',
    color: 'var(--gm-ice-white, #F0F8FF)',
  },
  bypassBtn: {
    border: 'none',
    borderRadius: '2px',
    padding: '4px 8px',
    fontSize: '10px',
    fontWeight: 'bold',
    color: '#000',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  knobsRow: {
    display: 'flex',
    justifyContent: 'space-around',
    flex: 1,
    alignItems: 'center',
  },
};
