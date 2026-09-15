import React from 'react';

// Shared effects-rack UI — Lyricist 4.2.0
//
// One definition of the knobs, used by every rack in the app. Before this the
// controls only existed inside DrumMachine, which is why the piano roll and the
// sample library had effects you could not reach: the rack was built and the
// audio was good, it just had no front panel anywhere except the drum machine.
//
// The knob list mirrors fxRack.js field-for-field. Add a control here and both
// racks get it.

export function Knob({ label, value, min, max, step, onChange, help }) {
  return (
    <label style={{ fontSize: '0.62rem', display: 'flex', flexDirection: 'column', gap: 3 }} data-help={help}>
      <span style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>{label}</span>
        <span style={{ color: 'rgba(231,165,64,0.8)' }}>
          {typeof value === 'number' ? (value >= 100 ? Math.round(value) : value.toFixed(2)) : value}
        </span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} className="suno-range"
        onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

const GRID = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(168px, 1fr))',
  gap: 10,
};

/** The 20 rack knobs plus the filter-shape picker. `onChange` takes a patch. */
export function FxKnobGrid({ fx, onChange }) {
  const k = (label, key, min, max, step, help) => (
    <Knob key={key} label={label} value={fx[key]} min={min} max={max} step={step}
      onChange={(v) => onChange({ [key]: v })} help={help} />
  );
  return (
    <div style={GRID}>
      {k('Level', 'level', 0, 1.5, 0.01, 'Output volume for this rack.')}
      {k('Pan', 'pan', -1, 1, 0.01, 'Left / right placement.')}
      {k('Filter Hz', 'filterFreq', 40, 20000, 10, 'Cutoff frequency. Sweep it down to muffle, up to open.')}
      {k('Resonance', 'filterQ', 0.1, 16, 0.1, 'Emphasis right at the cutoff — high values whistle.')}
      {k('Drive', 'drive', 0, 1, 0.01, 'Analog-style saturation. A little thickens, a lot destroys.')}
      {k('Bitcrush', 'crush', 0, 16, 1, 'Bit depth reduction. 0 is off; low numbers get grimy and lo-fi.')}
      {k('Delay Time', 'delayTime', 0, 1, 0.005, 'Echo spacing in seconds.')}
      {k('Delay Fb', 'delayFeedback', 0, 0.92, 0.01, 'How many times the echo repeats.')}
      {k('Delay Mix', 'delayMix', 0, 1, 0.01, 'How loud the echoes sit against the dry sound.')}
      {k('Reverb Mix', 'reverbMix', 0, 1, 0.01, 'Room amount.')}
      {k('Reverb Size', 'reverbSize', 0.2, 6, 0.1, 'How big the room is, in seconds of tail.')}
      {k('Compress', 'compress', 0, 1, 0.01, 'Glues and levels the hits. Push it for pump. Makes up its own gain, so it never just gets quieter.')}
      {k('High-Pass', 'hpFreq', 20, 2000, 5, "Cuts the low end away. Lift it to get out of the kick's way.")}
      {k('EQ Low', 'eqLow', -18, 18, 0.5, 'Shelf below 180Hz, in dB. Weight and body.')}
      {k('EQ Mid', 'eqMid', -18, 18, 0.5, 'Peak at the mid frequency, in dB. Cut it to get out of the way of vocals.')}
      {k('Mid Hz', 'eqMidFreq', 150, 8000, 25, 'Where the mid EQ sits.')}
      {k('EQ High', 'eqHigh', -18, 18, 0.5, 'Shelf above 6.5kHz, in dB. Air and snap.')}
      {k('Delay Tone', 'delayDamp', 400, 16000, 100, 'How bright the echoes stay. Lower makes each repeat darker than the last, like tape.')}
      {k('Reverb Pre', 'reverbPreDelay', 0, 0.12, 0.002, 'Gap before the room answers. A little keeps the hit clear of its own reverb.')}
      {k('Reverb Damp', 'reverbDamp', 0.02, 0.95, 0.01, "How fast the room's highs die away. Up is a soft room, down is tiled and bright.")}
      <label style={{ fontSize: '0.62rem', display: 'flex', flexDirection: 'column', gap: 3 }}
        data-help="Filter shape. Lowpass keeps the lows, highpass keeps the tops, bandpass keeps a slice.">
        Filter Type
        <select value={fx.filterType} onChange={(e) => onChange({ filterType: e.target.value })}
          className="suno-chip" style={{ fontSize: '0.62rem', padding: '3px 5px' }}>
          {['lowpass', 'highpass', 'bandpass', 'notch', 'peaking'].map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </label>
    </div>
  );
}

/** Limiter and ping-pong switches — the two rack settings that are on/off. */
export function FxToggles({ fx, onChange }) {
  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
      <label style={{ fontSize: '0.66rem', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
        data-help="Catches anything that would clip the output. Leave it on — it only acts when the output is being pushed past full scale.">
        <input type="checkbox" checked={!!fx.limit} onChange={(e) => onChange({ limit: e.target.checked ? 1 : 0 })} />
        Limiter
      </label>
      <label style={{ fontSize: '0.66rem', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
        data-help="Echoes bounce left and right instead of repeating down the middle.">
        <input type="checkbox" checked={!!fx.delayPingPong} onChange={(e) => onChange({ delayPingPong: e.target.checked ? 1 : 0 })} />
        Ping-Pong Delay
      </label>
    </div>
  );
}

/** Reverb needs its impulse rebuilt when its shape changes, not its mix. */
export const REVERB_SHAPE_KEYS = ['reverbSize', 'reverbPreDelay', 'reverbDamp'];
export const needsIrRebuild = (patch) => REVERB_SHAPE_KEYS.some((key) => key in patch);
