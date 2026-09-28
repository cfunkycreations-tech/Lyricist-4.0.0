import React, { useEffect, useState } from 'react';
import { Cable, Speaker } from 'lucide-react';
import { getMidiOut, setMidiOut, subscribeMidiOut, initMidiOut, dawNote, dawDrum } from '../../services/midiOut.js';
import { Icon } from '../common/Glyph.jsx';

/**
 * Settings plate: where the notes go. Built-in plays them here; DAW sends them
 * out as MIDI so Ableton (or any DAW) plays them on its own instruments.
 * See services/midiOut.js.
 */
const LBL = { fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(155,161,170,0.7)', marginBottom: 5, display: 'block' };
const P = { fontSize: '0.72rem', color: 'rgba(230,232,235,0.6)', margin: '0 0 10px', lineHeight: 1.5 };
const SEL = { padding: '7px 10px', borderRadius: 6, fontSize: '0.78rem', minWidth: 0 };

function Key({ on, onClick, children, help }) {
  return (
    <button
      type="button" aria-pressed={on} onClick={onClick} data-help={help}
      className={on ? 'is-active' : ''}
      style={{
        flex: '1 1 0', padding: '9px 14px', borderRadius: 6, cursor: 'pointer', fontFamily: 'var(--faf-font)',
        fontSize: '0.78rem', letterSpacing: '.04em', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        color: on ? '#FFD08A' : 'rgba(230,232,235,0.7)',
        background: on ? 'hsla(36 78% 40% / .18)' : 'rgba(16,18,21,0.7)',
        border: on ? '1px solid hsla(36 78% 58% / .6)' : '1px solid rgba(155,161,170,0.25)',
      }}
    >
      {children}
    </button>
  );
}

export default function PlayThrough() {
  const [m, setM] = useState(getMidiOut);
  useEffect(() => {
    const off = subscribeMidiOut(setM);
    initMidiOut().then(() => setM(getMidiOut()));
    return off;
  }, []);

  const daw = m.mode === 'daw';
  const port = m.outputs.find((o) => o.id === m.outputId);
  const status = !daw ? 'Lyricist Pro plays the sound'
    : !m.ready ? 'MIDI is not available here'
    : port ? `sending to ${port.name}` : 'pick a MIDI port below';

  const test = () => {
    [60, 64, 67].forEach((n) => dawNote(null, n, { duration: 0.4, velocity: 0.8 }));
    setTimeout(() => dawDrum(null, 'kick', null, 1), 500);
    setTimeout(() => dawDrum(null, 'snare', null, 1), 750);
  };

  return (
    <div style={{ marginBottom: 18 }} data-help="Where the pads, the sequencer and the drum machine make their sound. DAW sends every note out as MIDI instead, so Ableton or any other DAW plays it on its own VST3 instruments through its own ASIO driver.">
      <label style={LBL}>
        Play Through — <span style={{ color: daw && port ? '#34d399' : '#9ba1aa' }}>{status}</span>
      </label>
      <p style={P}>
        <strong>DAW</strong> sends every note as MIDI and Lyricist Pro stays silent. Pitched notes go out on the note channel,
        drums on channel 10 in the General MIDI layout, so a drum rack lines up. In Ableton, set a MIDI track's input to
        the same port and arm it (or set monitoring to <em>In</em>). The cable is a virtual MIDI port such as
        the free <code style={{ color: '#e7a540' }}>loopMIDI</code>: make one port, pick it here, and pick it in Ableton.
        (The Windows 11 "Loopback A/B" ports don't show up in Lyricist Pro or Ableton.)
      </p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <Key on={!daw} onClick={() => setMidiOut({ mode: 'builtin' })} help="Lyricist Pro makes the sound itself.">
          <Icon i={Speaker} />Built-in
        </Key>
        <Key on={daw} onClick={() => setMidiOut({ mode: 'daw' })} help="Send every note to your DAW as MIDI.">
          <Icon i={Cable} />DAW
        </Key>
      </div>
      {daw && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: 8, alignItems: 'center' }}>
          <select style={SEL} value={m.outputId} onChange={(e) => setMidiOut({ outputId: e.target.value })} aria-label="MIDI output">
            {!port && <option value="">Pick a MIDI output…</option>}
            {m.outputs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          <select style={SEL} value={m.noteChannel} onChange={(e) => setMidiOut({ noteChannel: Number(e.target.value) })} aria-label="Note channel" data-help="The MIDI channel pitched notes go out on.">
            {Array.from({ length: 16 }, (_, i) => <option key={i} value={i + 1}>Notes ch {i + 1}</option>)}
          </select>
          <select style={SEL} value={m.drumChannel} onChange={(e) => setMidiOut({ drumChannel: Number(e.target.value) })} aria-label="Drum channel" data-help="The MIDI channel drums go out on. 10 is the General MIDI standard.">
            {Array.from({ length: 16 }, (_, i) => <option key={i} value={i + 1}>Drums ch {i + 1}</option>)}
          </select>
          <button type="button" onClick={test} disabled={!port}
            style={{ padding: '7px 14px', borderRadius: 6, cursor: port ? 'pointer' : 'not-allowed', fontFamily: 'var(--faf-font)', fontSize: '0.74rem', color: '#FFD08A', background: 'rgba(16,18,21,0.7)', border: '1px solid rgba(231,165,64,0.45)' }}
            data-help="Sends a C major chord, then a kick and a snare, so you can see it arrive in your DAW.">
            Test
          </button>
          <label style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.72rem', color: 'rgba(230,232,235,0.7)', cursor: 'pointer' }}
            data-help="While the pad sequencer or MIDI Studio plays, send MIDI clock, start and stop, so the DAW follows Lyricist Pro's tempo. In Ableton: Settings → Link, Tempo & MIDI, turn on Sync for this port's input, then press EXT.">
            <input type="checkbox" checked={m.sendClock !== false} onChange={(e) => setMidiOut({ sendClock: e.target.checked })} />
            Send MIDI clock, start and stop, so the DAW follows our tempo
          </label>
          <p style={{ ...P, gridColumn: '1 / -1', margin: 0 }}>
            Your own samples keep playing here in DAW mode; the DAW doesn't have those files.
          </p>
        </div>
      )}
    </div>
  );
}
