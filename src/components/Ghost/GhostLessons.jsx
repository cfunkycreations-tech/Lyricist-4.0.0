import React, { useEffect, useState } from 'react';
import {
  subscribeTeach, beginTeach, endTeach, savePending, discardPending, listLessons,
  playLesson, stopLesson, deleteLesson, revealLessons, getTeachObs, setTeachObs,
} from '../../services/ghostTeach.js';

/**
 * THE LESSONS VIEW. Teach the Ghost by doing it, then have it do it back.
 * See ghostTeach.js for how a take is recorded and replayed.
 */

const clock = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export default function GhostLessons({ tab, onTeachStart }) {
  const [s, setS] = useState({});
  const [lessons, setLessons] = useState([]);
  const [name, setName] = useState('');
  const [obs, setObs] = useState(() => getTeachObs());
  const [err, setErr] = useState('');
  const [, tick] = useState(0);

  const refresh = () => listLessons().then(setLessons).catch((e) => setErr(e.message));
  useEffect(() => subscribeTeach(setS), []);
  useEffect(() => { refresh(); }, [s.pending, s.playing]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!s.recording) return undefined;
    const id = setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(id);
  }, [s.recording]);

  const desktop = typeof window !== 'undefined' && Boolean(window.lyricistAPI?.pilotReplay);

  const teach = async () => {
    setErr('');
    onTeachStart?.();
    await beginTeach({ tab, obs });
  };

  const save = async () => {
    setErr('');
    try {
      await savePending(name);
      setName('');
    } catch (e) {
      setErr(e.message);
    }
  };

  const play = async (lessonName) => {
    setErr('');
    onTeachStart?.();
    try {
      await playLesson(lessonName, { obs });
    } catch (e) {
      setErr(e.message);
    }
  };

  const remove = async (lessonName) => {
    setErr('');
    try {
      await deleteLesson(lessonName);
      refresh();
    } catch (e) {
      setErr(e.message);
    }
  };

  return (
    <div className="ghj">
      <div className="ghj-new">
        {!desktop && (
          <p className="ghj-note">Lessons record and play on the real mouse, so they need the Creator desktop app.</p>
        )}
        {s.recording ? (
          <>
            <p className="ghj-hint">Teaching · {clock(Date.now() - s.since)}. Do the whole thing the way you want it seen. F9 stops.</p>
            <div className="ghj-go">
              <button type="button" className="go" onClick={() => endTeach()}>Stop teaching</button>
            </div>
          </>
        ) : s.pending ? (
          <>
            <p className="ghj-hint">Take finished: {clock(s.pending.duration)}, {s.pending.clicks} clicks. Name it to keep it.</p>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
              placeholder="Make a song on Songwriter"
              aria-label="Lesson name"
              autoFocus
            />
            <div className="ghj-go">
              <button type="button" className="go" onClick={save}>Save lesson</button>
              <button type="button" onClick={discardPending}>Throw it away</button>
            </div>
          </>
        ) : (
          <>
            <p className="ghj-hint">
              Press Teach (or F9), then do it yourself with the mouse. The Ghost plays it back on the
              real cursor, on your path, at your speed. F10 stops a playback.
            </p>
            <label className="ghj-rec">
              <input
                type="checkbox"
                checked={obs}
                onChange={(e) => { setObs(e.target.checked); setTeachObs(e.target.checked); }}
              />
              Record in OBS while teaching and while playing
            </label>
            <div className="ghj-go">
              <button type="button" className="go" disabled={!desktop || s.starting || Boolean(s.playing)} onClick={teach}>
                {s.starting ? 'Starting OBS…' : 'Teach'}
              </button>
              {s.playing && <button type="button" onClick={stopLesson}>Stop playing</button>}
              <button type="button" disabled={!desktop} onClick={revealLessons}>Open folder</button>
            </div>
          </>
        )}
        {(err || s.note) && <p className="ghj-note">{err || s.note}</p>}
      </div>

      <div className="ghj-list">
        {!lessons.length && <p className="ghj-empty">No lessons yet. Teach the Ghost one and it shows up here.</p>}
        {lessons.map((l) => (
          <div key={l.name} className={`ghj-job${s.playing === l.name ? ' s-running' : ''}`}>
            <div className="ghj-jhd">
              <span className="ghj-badge">{s.playing === l.name ? 'Playing' : clock(l.duration)}</span>
              <span className="ghj-title" title={l.name}>{l.name}</span>
              <span className="ghj-meta">{l.clicks} clicks</span>
            </div>
            <div className="ghj-go">
              <button
                type="button"
                className="go"
                disabled={!desktop || Boolean(s.playing) || s.recording}
                onClick={() => play(l.name)}
              >
                Play
              </button>
              <button type="button" disabled={Boolean(s.playing)} onClick={() => remove(l.name)}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
