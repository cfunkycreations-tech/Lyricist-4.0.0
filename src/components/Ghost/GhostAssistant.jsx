import React, { useEffect, useRef, useState } from 'react';
import './GhostAssistant.css';
import { askGhost, splitActions, suggestStrongModel } from '../../services/GhostService.js';
import { registerGhostAction, registerGhostActions, runGhostAction, watchGhostActions, availableGhostActions } from '../../services/ghostBus.js';
import { pressControl, fillControl, chooseControl, describeControls } from '../../services/ghostHands.js';
import {
  captionHand, clearCaption, stopHand, resetHandStop, handStopped, getHandSpeed, setHandSpeed, HAND_SPEED_NAMES,
} from '../../services/ghostCursor.js';
import GhostHand from './GhostHand.jsx';
import { useLyricStore } from '../../context/LyricStore.jsx';
import {
  speak, hush, loadVoice, voiceState, playSample, VOICES, getVoiceName, setVoiceName,
  getVoiceSpeed, setVoiceSpeed, getVoiceWarmth, setVoiceWarmth, SPEED_MIN, SPEED_MAX,
} from '../../services/GhostVoice.js';

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
 * STOW-AFTER-SENDING. For OBS work.
 *
 * Chris, 2026-08-27, mid-recording: *"I also want that ghost... ask the ghost
 * box to be able to shut closed after I feed it a prompt telling it what to do.
 * For instance, act like a person and you're filling the lattice because I'm
 * gonna be recording that with OBS."*
 *
 * The box itself is the tell in a screen recording — a floating aside labelled
 * "The Ghost" is the last thing an operator wants captured in their frame.
 * Toggle Stow on, type the directive, press Enter, the aside closes. The Ghost
 * still runs the actions; only its own UI gets out of the way.
 *
 * VOICE STAYS UNDER ITS OWN TOGGLE. An earlier revision of this file force-muted
 * the voice while Stow was on — Chris caught it immediately: *"run the matrix
 * and talk at the same time. That's the prompt."* The whole point of a voice
 * during an OBS pass is narration; silencing it defeats the recording. Stow now
 * only hides the panel. If a session wants both hidden, turn the voice off too.
 */
const STOW_KEY = 'lyricist.ghost.stow';

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
  const [voiceSpeed, setVoiceSpeedState] = useState(() => getVoiceSpeed());
  const [voiceWarmth, setVoiceWarmthState] = useState(() => getVoiceWarmth());
  // See the note at STOW_KEY. Persisted, because a recording session usually
  // means several submissions in a row, and re-arming it every time would
  // defeat the point.
  const [stow, setStow] = useState(() => localStorage.getItem(STOW_KEY) === '1');
  const [, bumpActions] = useState(0);
  const logRef = useRef(null);
  const abortRef = useRef(null);

  // The list of what it can press changes as tabs mount and unmount.
  useEffect(() => watchGhostActions(() => bumpActions((n) => n + 1)), []);

  /**
   * LET A PROMPT PICK THE VOICE.
   *
   * Chris, 2026-08-27, mid-recording: *"you gotta make it talk in the woman's
   * voice, dummy."* Selecting a voice used to be a click in the picker, which
   * is fine at a keyboard but wrong for a recording session: the pilot layer
   * is meant to be driven by ONE prompt, and mid-run switching should be one
   * of the things the model can dispatch. So the voice picker gets exposed on
   * the ghost bus as an action.
   *
   * The `name` arg tolerates either an internal key ("woman") or a spoken word
   * ("female"). Both map to `af_heart`. Turns Voice on if it was off, so a
   * "talk in the woman's voice" prompt cannot silently no-op.
   */
  useEffect(() => registerGhostAction('set_voice', ({ name, speed, warmth } = {}) => {
    // "Talk slower", "warmer": speed and warmth can come on their own, with no
    // voice named, and only change what they name.
    const tuned = [];
    if (speed != null && speed !== '') {
      const v = setVoiceSpeed(speed);
      setVoiceSpeedState(v);
      tuned.push(`speed ${v.toFixed(2)}×`);
    }
    if (warmth != null && warmth !== '') {
      const v = setVoiceWarmth(warmth);
      setVoiceWarmthState(v);
      tuned.push(`warmth ${v}`);
    }
    if (!name && tuned.length) {
      if (!voiceOn) {
        setVoiceOn(true);
        localStorage.setItem(VOICE_KEY, '1');
      }
      return `voice ${tuned.join(', ')}`;
    }
    const n = String(name || '').trim().toLowerCase();
    const key =
      /wom|fem|girl|lady|heart|bella|nicole/.test(n) ? 'woman' :
      /man|male|dude|guy|michael|adam(?!.*ghost)/.test(n) ? 'man' :
      /ghost|onyx|deep/.test(n) ? 'ghost' :
      Object.keys(VOICES).find((k) => k === n || VOICES[k].label.toLowerCase() === n);
    if (!key) return { ok: false, said: `no voice called "${name}" — pick woman, man, or ghost` };
    setVoiceName_(setVoiceName(key));
    if (!voiceOn) {
      setVoiceOn(true);
      localStorage.setItem(VOICE_KEY, '1');
    }
    return `voice set to ${VOICES[key].label}`;
  }), [voiceOn]);

  /**
   * ANY BUTTON, ANY BOX, ANY TAB.
   *
   * Chris: *"It needs to be able to push all buttons, write songs and lyrics on
   * any tab or page."* Named actions cover the tabs that have them; these cover
   * everything else by the name printed on the control. See ghostHands.js.
   * describe_controls hands the Ghost that list of names before every reply.
   */
  useEffect(() => registerGhostActions({
    press: pressControl,
    fill: fillControl,
    choose: chooseControl,
    describe_controls: describeControls,
  }), []);

  /**
   * NARRATION, ONE LINE PER STEP.
   *
   * A demo is someone talking while they click. `say` shows the line by the
   * Ghost's hand and speaks it when the voice is on, and it holds the next
   * action until the line is finished, so the words and the hand stay together
   * instead of the reply being read out over a screen that already changed.
   * With the voice off the caption stays up for about as long as it would take
   * to say, so a silent viewer can still read along.
   */
  const voiceOnRef = useRef(voiceOn);
  voiceOnRef.current = voiceOn;
  useEffect(() => registerGhostAction('say', async ({ text } = {}) => {
    const line = String(text || '').trim();
    if (!line) return null;
    if (handStopped()) throw new Error('Stopped.');
    const readingTime = () => new Promise((r) => setTimeout(r, Math.min(4500, 900 + line.split(/\s+/).length * 260)));
    captionHand(line);
    try {
      const spoken = voiceOnRef.current ? await speak(line) : null;
      if (!spoken?.ok) await readingTime();
    } finally {
      clearCaption();
    }
    return `said "${line.length > 60 ? `${line.slice(0, 57)}…` : line}"`;
  }), []);

  // How the hand moves: normal, fast, or off for runs nobody is watching.
  const [handSpeed, setHandSpeedState] = useState(() => getHandSpeed());
  const cycleHandSpeed = () => {
    const next = HAND_SPEED_NAMES[(HAND_SPEED_NAMES.indexOf(handSpeed) + 1) % HAND_SPEED_NAMES.length];
    setHandSpeedState(setHandSpeed(next));
  };

  // Speed and warmth. A short line in the new setting after you let go, held
  // back a moment so a run of + presses says it once, not five times.
  const previewTimer = useRef(null);
  useEffect(() => () => clearTimeout(previewTimer.current), []);
  const previewVoice = () => {
    clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(() => { speak('This is how I sound now.'); }, 450);
  };
  const tuneVoice = (what, value, preview = true) => {
    if (what === 'speed') setVoiceSpeedState(setVoiceSpeed(value));
    else setVoiceWarmthState(setVoiceWarmth(value));
    if (preview) previewVoice();
  };

  /**
   * SUGGEST A STRONG MODEL.
   *
   * Running whole jobs needs a model that can reason and see, and most people
   * start on a free one. When that is the case the panel says so once and
   * offers a one-tap switch, with the price on it, because this one costs
   * money and the free pool does not. Dismissing it is remembered per model.
   */
  const store = useLyricStore();
  const [suggestion, setSuggestion] = useState(null);
  const nudgeKey = (s) => `lyricist.ghost.modelNudge.${s?.current || 'none'}`;
  useEffect(() => {
    if (!open) return undefined;
    let live = true;
    suggestStrongModel(config?.model).then((s) => {
      if (!live) return;
      try { if (s && localStorage.getItem(nudgeKey(s)) === s.id) s = null; } catch { /* storage blocked */ }
      setSuggestion(s);
    });
    return () => { live = false; };
  }, [open, config?.model]);
  const useSuggested = () => {
    store.setConfig({ ...store.config, model: suggestion.id });
    setSuggestion(null);
  };
  const skipSuggested = () => {
    try { localStorage.setItem(nudgeKey(suggestion), suggestion.id); } catch { /* storage blocked */ }
    setSuggestion(null);
  };

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
    // A new job is a fresh start: a Stop from the last one does not carry over.
    resetHandStop();

    // OBS pass. Stow the aside so the recording captures the app the Ghost is
    // driving, not the panel that told the Ghost to drive it. The actions the
    // model returns still run — busy stays true, the queue below still fires,
    // and reopening the box shows what happened. See STOW_KEY at the top.
    const stowThisRun = stow;
    if (stowThisRun) setOpen(false);

    const ac = new AbortController();
    abortRef.current = ac;

    try {
      /**
       * PASTED ACTIONS RUN AS WRITTEN — NO MODEL IN THE LOOP.
       *
       * When the message itself carries <do>{"action":...}</do> tags, those ARE
       * the instructions. Handing them to the LLM to "decide" whether to emit
       * them is exactly where it flakes — it answers "Ready when you are" and
       * presses nothing. So if the input already contains action tags, parse and
       * run them directly, in order. This is what makes a fixed macro like the
       * Matrix walkthrough fire the same way every single time, instead of
       * depending on the model choosing to repeat back what it was handed.
       */
      const pasted = [...q.matchAll(/<do>\s*(\{[\s\S]*?\})\s*<\/do>/g)]
        .map((mm) => {
          try {
            const o = JSON.parse(mm[1]);
            return o && o.action ? { name: o.action, args: o.args || {} } : null;
          } catch { return null; }
        })
        .filter(Boolean);

      if (pasted.length) {
        const did = [];
        for (const a of pasted) {
          const r = await runGhostAction(a.name, a.args);
          did.push({ name: a.name, ...r });
        }
        const anyFail = did.some((d) => !d.ok);
        setMsgs((m) => [...m, {
          who: anyFail ? 'error' : 'ghost',
          text: anyFail ? 'One of the pasted actions did not run.' : 'Ran it.',
          did,
        }]);
        return;   // finally{} below clears busy — do not fall through to the model
      }

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
      // Every open tab describes itself now, not only Black Hole Studios, and
      // the controls on the tab that is showing come last.
      const parts = [getContext?.() || ''];
      const describers = availableGhostActions()
        .filter((n) => n.startsWith('describe_') && n !== 'describe_controls');
      for (const n of [...describers, 'describe_controls']) {
        const r = await runGhostAction(n);
        if (r.ok && r.said) parts.push(r.said);
      }
      const context = parts.filter(Boolean).join('\n\n');

      const { text, actions } = await askGhost({
        history,
        question: q,
        config,
        tab,
        context,
        signal: ac.signal,
      });

      /**
       * TALKING AND DRIVING AT THE SAME TIME.
       *
       * Chris, 2026-08-27, watching an OBS demo of the Matrix macro: *"run the
       * matrix and talk at the same time. That's the prompt."* Voice used to
       * fire AFTER the action loop finished — which meant the buttons pressed
       * silently and the ghost only spoke over an already-changed screen. Fine
       * for a chat reply, terrible for a recording.
       *
       * SETUP FIRST, THEN VOICE, THEN THE REST. A `set_voice` action must apply
       * BEFORE speak() runs or the narration starts in the previous voice. So
       * actions run in two waves: any setup verb (currently just set_voice)
       * fires synchronously up front, then speak() kicks off, then the driving
       * actions run in parallel with the narration.
       */
      const SETUP_ACTIONS = new Set(['set_voice']);
      // Some actions narrate on their own — a walkthrough scripts the voice
      // and the cursor together on the pilot's AudioContext. If the ghost box
      // ALSO speaks its reply text, two voices talk over each other on
      // different audio pipes and neither one hush()es the other. So when a
      // narrating action is present, the ghost box stays quiet; its `text` is
      // still written into the conversation for the log.
      // `say` narrates step by step on its own too, so the reply is not read
      // out over the top of it.
      const NARRATING_ACTIONS = new Set(['run_matrix_walkthrough', 'pilot_run', 'say']);

      const done = [];
      const waiting = [];
      const setup = [];
      const driving = [];
      let narrated = false;
      for (const a of actions) {
        if (NEEDS_A_TAP[a.name]) { waiting.push(a); continue; }
        if (NARRATING_ACTIONS.has(a.name)) narrated = true;
        (SETUP_ACTIONS.has(a.name) ? setup : driving).push(a);
      }

      // Wave 1: setup, awaited so the voice lands in the right skin.
      for (const a of setup) {
        const r = await runGhostAction(a.name, a.args);
        done.push({ name: a.name, ...r });
      }

      // Wave 2: narration, fire-and-forget — but only when nothing in the
      // action list is going to speak on its own.
      if (voiceOn && !narrated) speak(text);

      // Wave 3: the actual driving. Runs in parallel with the voice above (or,
      // when a walkthrough is in the mix, provides its own voice as it goes).
      for (const a of driving) {
        // Stop pressed mid-run: leave everything after this point undone.
        if (handStopped()) { done.push({ name: a.name, ok: false, said: 'stopped before this step' }); break; }
        const r = await runGhostAction(a.name, a.args);
        // A line of narration that played is not something it DID to the song.
        if (a.name === 'say' && r.ok) continue;
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
      // Voice already started above, in parallel with the actions. See the
      // "TALKING AND DRIVING" note.
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

  // describe_* is how a tab answers a question, not something to press.
  const canDo = availableGhostActions().filter((n) => !n.startsWith('describe_')).length;

  return (
    <>
      {/* The hand is drawn whether the panel is open or not: with Stow on the
          panel closes and the hand is the only sign of the Ghost at work. */}
      <GhostHand />

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
            <div className="gha-hdbtns">
              {/* Stow-after-sending. For OBS recording — press Enter and the
                  panel disappears so the capture shows the app being driven,
                  not the panel that gave the order. See STOW_KEY. */}
              <button
                type="button"
                className={`gha-voice${stow ? ' on' : ''}`}
                aria-pressed={stow}
                onClick={() => {
                  const next = !stow;
                  setStow(next);
                  localStorage.setItem(STOW_KEY, next ? '1' : '0');
                }}
                title={stow
                  ? 'Panel closes on Enter so the recording captures the app, not this box. Voice is a separate toggle.'
                  : 'Turn on to close this panel automatically when you press Enter — for OBS recording. Voice stays under its own toggle.'}
              >
                {stow ? '🎬 Stow on' : '📂 Stow off'}
              </button>
              {/* The Ghost's hand on screen. Normal for watching and recording,
                  fast for getting on with it, off for runs nobody is watching. */}
              <button
                type="button"
                className={`gha-voice${handSpeed !== 'off' ? ' on' : ''}`}
                onClick={cycleHandSpeed}
                title="How the Ghost's hand moves on screen while it works. Tap to switch between normal, fast and off."
              >
                {handSpeed === 'off' ? '✋ Hands off' : handSpeed === 'fast' ? '✋ Hands fast' : '✋ Hands on'}
              </button>
              <button
                type="button"
                className={`gha-voice${voiceOn ? ' on' : ''}`}
                aria-pressed={voiceOn}
                onClick={toggleVoice}
              >
                {voiceOn ? '🔊 Voice on' : '🔇 Voice off'}
              </button>
            </div>
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

          {/* Speed in hundredths and warmth. Letting go of a slider says one
              line in the new setting, so you hear it without asking anything. */}
          {voiceOn && (
            <div className="gha-tune">
              <label htmlFor="gha-speed">Speed</label>
              <div className="gha-tune-row">
                <button type="button" aria-label="A hundredth slower" onClick={() => tuneVoice('speed', voiceSpeed - 0.01)}>−</button>
                <input
                  id="gha-speed"
                  type="range"
                  min={SPEED_MIN}
                  max={SPEED_MAX}
                  step="0.01"
                  value={voiceSpeed}
                  onChange={(e) => tuneVoice('speed', e.target.value, false)}
                  onPointerUp={previewVoice}
                  onKeyUp={previewVoice}
                />
                <button type="button" aria-label="A hundredth faster" onClick={() => tuneVoice('speed', voiceSpeed + 0.01)}>+</button>
                <output htmlFor="gha-speed">{voiceSpeed.toFixed(2)}×</output>
              </div>
              <label htmlFor="gha-warmth">Warmth</label>
              <div className="gha-tune-row">
                <input
                  id="gha-warmth"
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={voiceWarmth}
                  onChange={(e) => tuneVoice('warmth', e.target.value, false)}
                  onPointerUp={previewVoice}
                  onKeyUp={previewVoice}
                />
                <output htmlFor="gha-warmth">{voiceWarmth}</output>
              </div>
            </div>
          )}

          {voiceNote && <p className="gha-note">{voiceNote}</p>}

          {suggestion && (
            <div className="gha-tap">
              <span>
                The Ghost drives tabs and runs whole jobs better on a model that can reason
                and see. Right now {suggestion.why}. Suggested: {suggestion.name}
                {suggestion.inPerM || suggestion.outPerM
                  ? ` ($${suggestion.inPerM.toFixed(2)} in / $${suggestion.outPerM.toFixed(2)} out per million tokens, billed to your OpenRouter key).`
                  : '.'}
              </span>
              <span className="gha-tapbtns">
                <button type="button" className="go" onClick={useSuggested}>Use {suggestion.name}</button>
                <button type="button" onClick={skipSuggested}>Not now</button>
              </span>
            </div>
          )}

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
            {/* STOP, WHILE IT WORKS. The hand halts mid-word, the voice cuts,
                the question to the model is cancelled, and nothing after the
                current step runs. What already happened stays in the log. */}
            {busy ? (
              <button
                type="button"
                onClick={() => { stopHand(); hush(); abortRef.current?.abort(); }}
              >
                Stop
              </button>
            ) : (
              <button type="submit" disabled={!input.trim()}>Enter</button>
            )}
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
