import React, { useEffect, useRef, useState } from 'react';
import { subscribeRecorder, recorded, formatOne, formatLog, clearRecorder, record } from '../../services/ghostRecorder.js';

/**
 * THE LOG VIEW. Everything the Ghost did, newest at the bottom, with the two
 * ways to get it to Claude: Copy (a compact copy to paste into a chat) and
 * Save (the whole thing, every prompt and reply in full, as a .txt).
 * See services/ghostRecorder.js.
 */
export default function GhostFlightLog() {
  const [list, setList] = useState(recorded);
  const [note, setNote] = useState('');
  const box = useRef(null);
  const [follow, setFollow] = useState(true);
  const [draft, setDraft] = useState('');

  useEffect(() => subscribeRecorder(() => setList(recorded())), []);
  useEffect(() => {
    if (follow && box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [list, follow]);

  const say = (t) => { setNote(t); setTimeout(() => setNote(''), 5000); };

  const copy = async () => {
    const text = formatLog({ compact: true, last: 600 });
    try {
      await navigator.clipboard.writeText(text);
      say(`Copied the last ${Math.min(600, list.length)} events. Paste it to Claude.`);
    } catch {
      say('The clipboard was blocked. Use Save instead.');
    }
  };

  const save = async () => {
    const text = formatLog({ compact: false });
    const name = `Ghost log ${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}.txt`;
    const r = await window.lyricistAPI?.ghostLogSave?.(name, text).catch((e) => ({ ok: false, error: e?.message }));
    if (r?.ok) { say(`Saved: ${r.path}`); return; }
    // Browser: download it.
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    a.click();
    URL.revokeObjectURL(url);
    say(r?.error ? `Could not save to Documents (${r.error}), downloaded instead.` : 'Downloaded.');
  };

  return (
    <div className="gha-flight">
      <div className="gha-flight-bar">
        <button type="button" className="go" onClick={copy}>Copy log</button>
        <button type="button" onClick={save}>Save log</button>
        <button type="button" onClick={() => window.lyricistAPI?.ghostLogOpen?.()} title="The folder with this session's live log and a screenshot after every Ghost action">Open folder</button>
        <button type="button" onClick={() => { if (window.confirm('Clear the Ghost log?')) clearRecorder(); }}>Clear</button>
      </div>
      <form
        className="gha-flight-noteform"
        onSubmit={(e) => { e.preventDefault(); if (draft.trim()) { record('note', `CHRIS: ${draft.trim()}`); setDraft(''); } }}
      >
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Note what just went wrong, it goes in the log" aria-label="Note for the log" />
        <button type="submit" disabled={!draft.trim()}>Add</button>
      </form>
      {note && <p className="gha-note">{note}</p>}
      <div
        className="gha-flight-list"
        ref={box}
        onScroll={(e) => { const el = e.currentTarget; setFollow(el.scrollHeight - el.scrollTop - el.clientHeight < 40); }}
      >
        {!list.length && <p className="ghj-empty">Nothing yet. Everything the Ghost does shows up here as it happens.</p>}
        {list.slice(-400).map((e) => (
          <div key={`${e.t}-${e.n}`} className={`gha-flight-row is-${e.kind}`} title={e.full ? e.full.slice(0, 3000) : undefined}>
            {formatOne(e)}
          </div>
        ))}
      </div>
    </div>
  );
}
