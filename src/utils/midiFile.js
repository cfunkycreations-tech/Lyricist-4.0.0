// Minimal Standard MIDI File (SMF type 0) writer — Lyricist 4.1.3
// Turns the sequencer's MIDI JSON ({ tempo, notes:[{midi,start,duration,velocity}] })
// into a downloadable .mid file. No dependencies.

const PPQ = 480; // ticks per quarter note

function varLen(value) {
  // MIDI variable-length quantity
  const bytes = [value & 0x7f];
  value >>= 7;
  while (value > 0) {
    bytes.unshift((value & 0x7f) | 0x80);
    value >>= 7;
  }
  return bytes;
}

function str(s) { return [...s].map(c => c.charCodeAt(0)); }
function u32(n) { return [(n >> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]; }
function u16(n) { return [(n >> 8) & 0xff, n & 0xff]; }

export function midiJSONToSMF({ tempo = 120, notes = [] }) {
  const secPerTick = 60 / tempo / PPQ;

  // Build absolute-time on/off events
  const events = [];
  for (const n of notes) {
    const vel = Math.round(Math.min(1, Math.max(0.05, n.velocity ?? 0.8)) * 127);
    events.push({ tick: Math.round(n.start / secPerTick), type: 0x90, midi: n.midi, vel });
    events.push({ tick: Math.round((n.start + n.duration) / secPerTick), type: 0x80, midi: n.midi, vel: 0 });
  }
  // note-offs before note-ons at the same tick, then by tick
  events.sort((a, b) => a.tick - b.tick || a.type - b.type);

  const track = [];
  // tempo meta event
  const usPerQuarter = Math.round(60000000 / tempo);
  track.push(0x00, 0xff, 0x51, 0x03, (usPerQuarter >> 16) & 0xff, (usPerQuarter >> 8) & 0xff, usPerQuarter & 0xff);

  let lastTick = 0;
  for (const ev of events) {
    track.push(...varLen(Math.max(0, ev.tick - lastTick)));
    track.push(ev.type, ev.midi & 0x7f, ev.vel & 0x7f);
    lastTick = ev.tick;
  }
  // end of track
  track.push(0x00, 0xff, 0x2f, 0x00);

  const bytes = [
    ...str('MThd'), ...u32(6), ...u16(0), ...u16(1), ...u16(PPQ),
    ...str('MTrk'), ...u32(track.length), ...track
  ];
  return new Uint8Array(bytes);
}

export function downloadMidi(midiJSON, filename = 'lyricist-sequence.mid') {
  const smf = midiJSONToSMF(midiJSON);
  const blob = new Blob([smf], { type: 'audio/midi' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.replace(/[\\/:*?"<>|]/g, '-');
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
