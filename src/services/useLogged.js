import { useEffect, useRef } from 'react';
import { record } from './ghostRecorder.js';

/**
 * EVERY BOX, IN THE FLIGHT RECORDER.
 *
 * Chris, 2026-10-10: "You need to log everything. The input caption... Because
 * it did shit like two and three times. And it shouldn't have. And overwrote
 * itself." Each watched value is logged when it changes (after a short pause,
 * so typing is one entry, not forty), with what it held before and after, and
 * a count of how many times it has been rewritten in the last two minutes, so
 * an overwrite loop reads as exactly that.
 */
const WINDOW = 120000;

const show = (v) => {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  try { return JSON.stringify(v); } catch { return String(v); }
};
const brief = (s) => {
  const t = s.replace(/\s+/g, ' ').trim();
  if (!t) return '(empty)';
  return t.length > 90 ? `"${t.slice(0, 90)}…" (${s.length} chars, ${s.split('\n').filter((l) => l.trim()).length} lines)` : `"${t}"`;
};

export function useLogged(label, value, { pause = 700 } = {}) {
  const last = useRef(null);
  const writes = useRef([]);
  const text = show(value);
  useEffect(() => {
    if (last.current === null) { last.current = text; return undefined; }   // what it held on open is not a change
    if (text === last.current) return undefined;
    const id = setTimeout(() => {
      const before = last.current;
      if (text === before) return;
      last.current = text;
      const now = Date.now();
      writes.current = [...writes.current.filter((t) => now - t < WINDOW), now];
      const n = writes.current.length;
      const again = n > 1 ? `  ⟳ written ${n} times in 2 min` : '';
      record(
        'field',
        `${label}: ${brief(before)} → ${brief(text)}${again}`,
        text.length > 90 || before.length > 90 ? `BEFORE:\n${before}\n\nAFTER:\n${text}` : null,
      );
    }, pause);
    return () => clearTimeout(id);
  }, [label, text, pause]);
}
