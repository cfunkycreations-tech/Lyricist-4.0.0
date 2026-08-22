import React, { useEffect, useRef, useState } from 'react';
import './GhostAssistant.css';
import { askGhost, splitActions } from '../../services/GhostService.js';
import { runGhostAction, watchGhostActions, availableGhostActions } from '../../services/ghostBus.js';
import { speak, hush, loadVoice, voiceState, playSample, VOICES, getVoiceName, setVoiceName } from '../../services/GhostVoice.js';

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
  { label: 'Fix my Input Caption', ask: 'Look at my Input Caption and rewrite it so it actually gets me the sound I want. Then set it.' },
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
/**
 * CLAIMS THAT HAVE TO BE TRUE.
 *
 * Chris, 2026-08-22: *"you shouldn't say it's starting when it's not."*
 *
 * It ended a reply with "I'm starting the run now" and started nothing. The
 * prompt already forbids that in as many words, and it did it anyway, which is
 * the answer: a rule a model can ignore is not a guarantee. This is the same
 * rule enforced afterwards, on the text, where it cannot be ignored.
 *
 * When the words claim an action and the action never came, the claim is not
 * quietly deleted. The button it was talking about is offered instead, so what
 * was a false statement becomes the thing they wanted one tap away.
 */
const CLAIMS = [
  {
    action: 'make_the_song',
    when: /\b(starting|start(ing)? it|i'?m starting|kick(ing)? it off|making the song now|running it now|off we go|here it goes)\b/i,
    note: 'It said it was starting the song. It had not, and nothing was spent. The button is here if you want it.',
  },
];

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

    // Switching it on is not a wait any more. The picker plays baked audio
    // immediately, so the model can arrive in its own time and the note says
    // that rather than implying the feature is stuck.
    setVoiceNote('Warming the voice up. It ships with the app, so this is off your own disk and takes a couple of seconds.');
    try {
      await loadVoice();
      setVoiceNote('');
    } catch (e) {
      // The samples still work without it, so the voice does NOT get switched
      // back off here. It stays on and the note is honest about what is missing.
      setVoiceNote(`The voice would not start, so answers stay text only: ${e.message}`);
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

      /**
       * ASK THE TAB WHAT IT KNOWS, EVERY TIME.
       *
       * Chris: *"it needs to be able to go by whatever boxes I choose to put in,
       * or the tags, like intro verse chorus bridge outro... using the genre I
       * picked, using the mood I picked."*
       *
       * It could not, because the picks and the tags live in the tab and the
       * Ghost only ever saw the Songwriter text. Any tab that registers
       * `describe_song` now gets asked before every question, so the answer is
       * written against the actual song on screen rather than in the abstract.
       */
      let context = getContext?.() || '';
      const fromTab = await runGhostAction('describe_song');
      if (fromTab.ok && fromTab.said) {
        context = [context, fromTab.said].filter(Boolean).join('\n\n');
      }

      const { text, actions } = await askGhost({
        history,
        question: q,
        config,
        tab,
        context,
        signal: ac.signal,
      });

      const done = [];
      const waiting = [];
      for (const a of actions) {
        if (NEEDS_A_TAP[a.name]) { waiting.push(a); continue; }
        const r = await runGhostAction(a.name, a.args);
        done.push({ name: a.name, ...r });
      }

      // A claim with no action behind it is a lie the app can catch, so catch it.
      const claimed = CLAIMS.filter((c) => c.when.test(text)
        && !actions.some((x) => x.name === c.action)
        && !waiting.some((w) => w.name === c.action));
      claimed.forEach((c) => waiting.push({ name: c.action, args: {} }));

      setMsgs((m) => [...m, {
        who: 'ghost',
        text: text || 'Done.',
        did: done,
        waiting,
        corrections: claimed.map((c) => c.note),
      }]);
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

  /**
   * PUT IT BACK.
   *
   * The Ghost replaced his lyrics with a tap and there was no way back short of
   * retyping the song. Any action that overwrites work now hands back the way
   * to reverse it, and that button lands on the very line that says what it
   * did. Reversing is itself reported, so the conversation stays a true record
   * of everything that happened to his song.
   */
  const putBack = async (msgIndex, didIndex, undo) => {
    const r = await runGhostAction(undo.action, undo.args || {});
    setMsgs((m) => m.map((msg, i) => (i !== msgIndex ? msg : {
      ...msg,
      did: [
        ...msg.did.map((d, j) => (j === didIndex ? { ...d, undo: null, warn: null } : d)),
        { name: undo.action, ...r },
      ],
    })));
  };

  const decline = (msgIndex, action) => {
    setMsgs((m) => m.map((msg, i) => (i !== msgIndex ? msg : {
      ...msg,
      waiting: (msg.waiting || []).filter((w) => w !== action),
      did: [...(msg.did || []), { name: action.name, ok: false, said: 'left it alone' }],
    })));
  };

  // describe_song is how the tab answers a question, not something to press.
  const canDo = availableGhostActions().filter((n) => n !== 'describe_song').length;

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
                    // The BAKED line, not the model. This has to be instant or a
                    // button marked "Woman" that sits silent for a minute reads
                    // as broken. It also works with nothing downloaded at all.
                    if (!playSample(key)) speak(`This is the ${v.label.toLowerCase()}.`);
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
                  I know every tab in here, I can write your Input Lyrics, and I can write the
                  Input Caption that decides how the song comes out. Ask me in plain English.
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

                {(m.corrections || []).map((c) => (
                  <p className="gha-correction" key={c}>{c}</p>
                ))}

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
                        {/* WHAT IT OVERWROTE IS ONE TAP FROM COMING BACK.
                            It erased his whole song once. Everything it does is
                            already written down here, so the way back belongs
                            here too, on the line that says what happened, not
                            in a menu somewhere. */}
                        {d.undo && (
                          <button
                            type="button"
                            className="gha-undo"
                            onClick={() => putBack(i, j, d.undo)}
                          >
                            {d.undo.label || 'Undo that'}
                          </button>
                        )}
                        {d.warn && <span className="gha-warn">{d.warn}</span>}
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
            {/* ENTER, NOT ASK. Chris: the button that OPENS this can say Ask the
                Ghost, because that is what it does. Once the box is open the
                question is already typed and the button sends it, so it says
                what pressing it does, and it matches the key that does the
                same thing. */}
            <button type="submit" disabled={busy || !input.trim()}>Enter</button>
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
