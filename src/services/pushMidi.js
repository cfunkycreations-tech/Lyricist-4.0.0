/**
 * THE REAL PUSH, OVER MIDI.
 *
 * Chris, 2026-09-15: the header is a Push clone, and it should work "as the push
 * as much as possible". This is the hardware half: an Ableton Push 2 or Push 3
 * plugged in over USB shows up as MIDI ports named "Ableton Push 2/3" (the Live
 * port) and "MIDIIN2 (Ableton Push 2/3)" (the User port).
 *
 * The Push is switched into User mode so it talks to this app instead of Live.
 * Pads come in as notes 36-99 (bottom-left is 36), the 8 encoders as relative
 * CCs 71-78, and buttons as CCs. Pad lights go out as note-on with the velocity
 * picking a colour from the Push's own palette.
 *
 * What MIDI cannot do: the Push 2/3 screen is driven over raw USB, not MIDI, so
 * the on-screen display in the app is the display.
 */

const USER_MODE = [0xF0, 0x00, 0x21, 0x1D, 0x01, 0x01, 0x0A, 0x01, 0xF7];

export const PUSH_CC = {
  play: 85, record: 86, octaveUp: 55, octaveDown: 54, note: 50, session: 51,
  up: 46, down: 47, left: 44, right: 45, delete: 118, shift: 49,
};

/**
 * Nearest colour in the Push's default palette for a hue. Indices 1-25 of the
 * default palette run round the colour wheel; 122 is white, 0 is off. The
 * match is approximate by design: a pad lit "about this colour" is the goal.
 */
export function hueToPushColor(hue, { white = false, off = false } = {}) {
  if (off) return 0;
  if (white) return 122;
  const h = ((hue % 360) + 360) % 360;
  return 1 + Math.round((h / 360) * 24) % 25;
}

export function createPushLink({ onPad, onButton, onEncoder, onStatus } = {}) {
  let access = null;
  let inputs = [];
  let outputs = [];
  let closed = false;
  const lit = new Map();

  const handle = (e) => {
    const [status, d1, d2] = e.data;
    const type = status & 0xf0;
    if ((type === 0x90 || type === 0x80) && d1 >= 36 && d1 <= 99) {
      const idx = d1 - 36;
      onPad?.(idx % 8, 7 - Math.floor(idx / 8), type === 0x90 ? d2 : 0);
    } else if (type === 0xB0) {
      if (d1 >= 71 && d1 <= 78) onEncoder?.(d1 - 71, d2 < 64 ? d2 : d2 - 128);
      else onButton?.(d1, d2);
    }
  };

  const send = (bytes) => outputs.forEach((o) => { try { o.send(bytes); } catch { /* port went away */ } });

  const scan = () => {
    if (!access || closed) return;
    inputs.forEach((i) => { i.onmidimessage = null; });
    inputs = [...access.inputs.values()].filter((p) => /push/i.test(p.name));
    outputs = [...access.outputs.values()].filter((p) => /push/i.test(p.name));
    inputs.forEach((i) => { i.onmidimessage = handle; });
    outputs.filter((o) => !/midiin2/i.test(o.name)).forEach((o) => { try { o.send(USER_MODE); } catch { /* no sysex */ } });
    lit.clear();
    const name = inputs[0]?.name.replace(/^MIDIIN2 \(|\)$/g, '');
    onStatus?.(inputs.length ? name : null);
  };

  (async () => {
    if (typeof navigator === 'undefined' || !navigator.requestMIDIAccess) { onStatus?.(null); return; }
    try {
      access = await navigator.requestMIDIAccess({ sysex: true });
    } catch {
      try { access = await navigator.requestMIDIAccess(); } catch { onStatus?.(null); return; }
    }
    if (closed) return;
    scan();
    access.onstatechange = scan;
  })();

  return {
    /** Light a pad by grid position (x 0-7 left to right, y 0-7 top to bottom). */
    pad(x, y, color) {
      if (!outputs.length) return;
      const note = 36 + (7 - y) * 8 + x;
      if (lit.get(note) === color) return;
      lit.set(note, color);
      send([0x90, note, color]);
    },
    button(cc, value) { if (outputs.length) send([0xB0, cc, value]); },
    connected: () => inputs.length > 0,
    close() {
      closed = true;
      for (let n = 36; n <= 99; n++) send([0x90, n, 0]);
      inputs.forEach((i) => { i.onmidimessage = null; });
      if (access) access.onstatechange = null;
    },
  };
}
