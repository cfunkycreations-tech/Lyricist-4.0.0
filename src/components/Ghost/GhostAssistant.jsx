import React, { useEffect, useRef, useState } from 'react';
import './GhostAssistant.css';
import { askGhost, splitActions } from '../../services/GhostService.js';
import { runGhostAction, watchGhostActions, availableGhostActions } from '../../services/ghostBus.js';
import { speak, hush, loadVoice, voiceState, VOICES, getVoiceName, setVoiceName } from '../../services/GhostVoice.js';

/**
 * THE GHOST, ALWAYS THERE.
 *
 * Chris asked for the demo ghost to stop being a recording and start being
 * something you can talk to: *"an AI that would just always be available to help
 * run the app, write lyrics, write the specific prompts needed to use MiniMax,
 * and just help with anything in the app."* Asked how far it should reach, he
 * said everything, so it can press things too.
 *
 * It is a button that is always on screen and never hides in a menu, because
 * beginners are who this app is for and a control you have to know about is a
 * control most people never find.
 *
 * WHAT IT WILL NOT DO. It cannot spend money, because there is nothing in this
 * app that costs any. It can start a render, which spends time rather than
 * money, and when it does the Stop button is right there in the tab. Everything
 * it does is written into the conversation as it happens, so there is never a
 * change on screen that you cannot trace back to a line it said.
 */

const OPENERS = [
  { label: 'What is this tab for?', ask: 'What is this tab for, in two or three sentences?' },
  { label: 'Write me a verse', ask: 'Write me a verse that fits what I have so far. Just the verse.' },
  { label: 'Fix my sound description', ask: 'Look at my sound description and rewrite it so it actually gets me the sound I want. Then set it.' },
  { label: 'Set up a full song', ask: 'Lay out a full song structure for me and set the length so it fits.' },
];

const VOICE_KEY = 'lyricist.ghost.voice';

/**
 * THE ONE THING IT ASKS FIRST.
 *
 * Chris gave the Ghost everything, and starting a render is the only action in
 * the list that costs anything real: minutes of a graphics card, and on Kaggle a
 * slice of a weekly allowance. I flagged that and he said to put a single tap
 * in, so this is a tap, not a dialog. The Ghost still decides to do it and still
 * says so; the last inch is yours.
 *
 * Everything else runs immediately, because a wrong length or a wrong take
 * number costs one press to put back.
 */
const NEEDS_A_TAP = {
  make_the_song: { chip: 'Yes, make it', blurb: 'The Ghost wants to start making the song.' },
};

export default function GhostAssistant({ tab, config, getContext }) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [voiceOn, setVoiceOn] = useState(() => localStorage.getItem(VOICE_KEY) === '1');
  const [voiceNote, setVoiceNote] = useState('');
  const [voiceName, setVoiceName_] = useState(() => getVoiceName());
  const [, bumpActions] = useState(0);
  const logRef = useRef(null);
  const abortRef = useRef(null);

  // The list of what it can press changes as tabs mount and unmount.
  useEffect(() => watchGhostActions(() => bumpActions((n) => n + 1)), []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [msgs, busy]);

  useEffect(() => () => { hush(); abortRef.current?.abort(); }, []);

  const toggleVoice = async () => {
    const next = !voiceOn;
    setVoiceOn(next);
    localStorage.setItem(VOICE_KEY, next ? '1' : '0');
    if (!next) { hush(); setVoiceNote(''); return; }
    if (voiceState.ready) return;
    // First time on: say what is about to happen rather than freezing quietly.
    // Do not promise offline: the voice model itself is cached after the first
    // fetch, but the runtime it needs is pulled from a CDN, so claiming it
    // never needs the internet again is a claim I have not proved.
    setVoiceNote('Fetching the ghost’s voice, about 86 MB. Once only, and it is kept for next time.');
    try {
      await loadVoice();
      setVoiceNote('');
    } catch (e) {
      setVoiceNote(`The voice would not load: ${e.message}. Everything still works to read.`);
      setVoiceOn(false);
      localStorage.setItem(VOICE_KEY, '0');
    }
  };

  const send = async (question) => {
    const q = String(question ?? input).trim();
    if (!q || busy) return;
    setInput('');
    hush();
    setMsgs((m) => [...m, { who: 'you', text: q }]);
    setBusy(true);

    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const history = msgs
        .filter((m) => m.who === 'you' || m.who === 'ghost')
        .map((m) => ({ role: m.who === 'you' ? 'user' : 'assistant', content: m.text }));

      const { text, actions } = await askGhost({
        history,
        question: q,
        config,
        tab,
        context: getContext?.() || '',
        signal: ac.signal,
      });

      const done = [];
      const waiting = [];
      for (const a of actions) {
        if (NEEDS_A_TAP[a.name]) { waiting.push(a); continue; }
        const r = await runGhostAction(a.name, a.args);
        done.push({ name: a.name, ...r });
      }

      setMsgs((m) => [...m, { who: 'ghost', text: text || 'Done.', did: done, waiting }]);
      if (voiceOn) speak(text);
    } catch (e) {
      setMsgs((m) => [...m, { who: 'error', text: e.message || 'That did not work.' }]);
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

  /** The tap. Runs the held-back action and folds the result into that message. */
  const approve = async (msgIndex, action) => {
    const r = await runGhostAction(action.name, action.args);
    setMsgs((m) => m.map((msg, i) => (i !== msgIndex ? msg : {
      ...msg,
      waiting: (msg.waiting || []).filter((w) => w !== action),
      did: [...(msg.did || []), { name: action.name, ...r }],
    })));
  };

  const decline = (msgIndex, action) => {
    setMsgs((m) => m.map((msg, i) => (i !== msgIndex ? msg : {
      ...msg,
      waiting: (msg.waiting || []).filter((w) => w !== action),
      did: [...(msg.did || []), { name: action.name, ok: false, said: 'left it alone' }],
    })));
  };

  const canDo = availableGhostActions().length;

  return (
    <>
      <button
        type="button"
        className={`gha-launch${open ? ' is-open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="gha-face" aria-hidden="true">👻</span>
        <span>{open ? 'Close the Ghost' : 'Ask the Ghost'}</span>
      </button>

      {open && (
        <aside className="gha" role="dialog" aria-label="Ask the Ghost">
          <header className="gha-hd">
            <div>
              <h2>The Ghost</h2>
              <p>Ask it anything. It can write, and it can press things for you.</p>
            </div>
            <button
              type="button"
              className={`gha-voice${voiceOn ? ' on' : ''}`}
              aria-pressed={voiceOn}
              onClick={toggleVoice}
            >
              {voiceOn ? '🔊 Voice on' : '🔇 Voice off'}
            </button>
          </header>

          {/* Who it sounds like. Only worth showing once the voice is on, and
              switching says one line in the new voice so you can hear it
              without having to think of something to ask. */}
          {voiceOn && (
            <div className="gha-picker">
              <span>Voice</span>
              {Object.entries(VOICES).map(([key, v]) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={voiceName === key}
                  onClick={() => {
                    setVoiceName_(setVoiceName(key));
                    speak(key === 'ghost'
                      ? 'This is me.'
                      : `This is the ${v.label.toLowerCase()}. I can read the answers out in this voice instead.`);
                  }}
                >
                  {v.label}
                </button>
              ))}
            </div>
          )}

          {voiceNote && <p className="gha-note">{voiceNote}</p>}

          <div className="gha-log" ref={logRef}>
            {!msgs.length && (
              <div className="gha-empty">
                <p>
                  I know every tab in here, I can write your words, and I can write the sound
                  description that decides how the song comes out. Ask me in plain English.
                </p>
                <div className="gha-openers">
                  {OPENERS.map((o) => (
                    <button key={o.label} type="button" onClick={() => send(o.ask)}>{o.label}</button>
                  ))}
                </div>
              </div>
            )}

            {msgs.map((m, i) => (
              <div key={i} className={`gha-msg ${m.who}`}>
                <div className="gha-text">{m.text}</div>

                {(m.waiting || []).map((w, k) => (
                  <div className="gha-tap" key={`${w.name}-${k}`}>
                    <span>{NEEDS_A_TAP[w.name].blurb}</span>
                    <span className="gha-tapbtns">
                      <button type="button" className="go" onClick={() => approve(i, w)}>
                        {NEEDS_A_TAP[w.name].chip}
                      </button>
                      <button type="button" onClick={() => decline(i, w)}>Not now</button>
                    </span>
                  </div>
                ))}

                {!!m.did?.length && (
                  <ul className="gha-did">
                    {m.did.map((d, j) => (
                      <li key={j} className={d.ok ? 'ok' : 'no'}>
                        {d.ok ? '✓' : '✗'} {d.said || d.name.replace(/_/g, ' ')}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}

            {busy && <div className="gha-msg ghost thinking">thinking…</div>}
          </div>

          <form
            className="gha-ask"
            onSubmit={(e) => { e.preventDefault(); send(); }}
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask the Ghost…"
              aria-label="Ask the Ghost"
              disabled={busy}
            />
            <button type="submit" disabled={busy || !input.trim()}>Ask</button>
          </form>

          {/* "on this tab" was wrong: a tab stays mounted once you have opened
              it, so its controls stay reachable while you are looking at
              another one. Say what is true. */}
          <p className="gha-foot">
            {canDo
              ? `It can press ${canDo} thing${canDo === 1 ? '' : 's'} right now, in the tabs you have open.`
              : 'It can answer and write. Open a tab and it can press things there too.'}
          </p>
        </aside>
      )}
    </>
  );
}
