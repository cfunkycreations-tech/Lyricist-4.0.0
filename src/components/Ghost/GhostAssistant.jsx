import React, { useEffect, useRef, useState } from 'react';
import './GhostAssistant.css';
import { askGhost, planJob, looksLikeWorkflow } from '../../services/GhostService.js';
import { registerGhostAction, registerGhostActions, runGhostAction, watchGhostActions, availableGhostActions } from '../../services/ghostBus.js';
import { pressControl, fillControl, chooseControl, describeControls } from '../../services/ghostHands.js';
import {
  captionHand, clearCaption, stopHand, resetHandStop, handStopped, getHandSpeed, setHandSpeed, HAND_SPEED_NAMES,
  setHandSpeedOverride,
} from '../../services/ghostCursor.js';
import { setJobDeps, addJob, subscribeJobs } from '../../services/ghostJobs.js';
import GhostHand from './GhostHand.jsx';
import GhostJobs from './GhostJobs.jsx';
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

/*
 * CLAIMS THAT HAVE TO BE TRUE, AND NO TAP.
 *
 * Chris, 2026-08-22: "you shouldn't say it's starting when it's not." And on
 * 2026-09-15, creator-only now: "don't interrupt again". The tap before
 * make_the_song is gone, and a reply that TALKS about doing something without
 * doing it is asked again, once, to actually do it (see askActing).
 */
const TALK_NOT_WORK = /\b(i'?m (running|sending|writing|opening|starting|making|pulling|loading|saving|gonna)|let'?s|we'?re gonna|i'?ll|here we go|on it|starting)\b/i;
const NEEDS_A_TAP = {};

// Setup runs before anything speaks; OBS starts before anything is done.
const SETUP_ACTIONS = new Set(['set_voice']);
// Actions that narrate on their own, so the reply text is not read over them.
const NARRATING_ACTIONS = new Set(['run_matrix_walkthrough', 'pilot_run', 'say']);

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

  // Creator build only (this whole component is): a handle for testing the
  // voice in the packaged app without clicking through it.
  useEffect(() => { window.__ghostVoice = { speak, loadVoice, voiceState }; }, []);

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
    previewTimer.current = setTimeout(() => {
      speak('This is how I sound now.').then((r) => {
        if (r && !r.ok) setVoiceNote(`The voice did not play: ${r.error}`);
        else setVoiceNote('');
      });
    }, 450);
  };
  const tuneVoice = (what, value, preview = true) => {
    if (what === 'speed') setVoiceSpeedState(setVoiceSpeed(value));
    else setVoiceWarmthState(setVoiceWarmth(value));
    if (preview) previewVoice();
  };

  /*
   * NO MODEL SUGGESTIONS. Chris picks the model in Settings (DeepSeek), and on
   * 2026-09-15 turned down both the Anthropic and the Google suggestion. The
   * banner that nudged toward a "strong" model is gone.
   */

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

  /* The latest props, for a job that outlives the render that started it. */
  const live = useRef({});
  live.current = { tab, config, getContext };

  const [view, setView] = useState('chat');
  const [jobCount, setJobCount] = useState(0);
  useEffect(() => subscribeJobs((list) => {
    setJobCount(list.filter((j) => ['queued', 'planning', 'running', 'awaiting'].includes(j.status)).length);
  }), []);

  /** Every open tab describes itself, and the controls on the showing tab come last. */
  const gatherContext = async () => {
    const parts = [live.current.getContext?.() || ''];
    const describers = availableGhostActions().filter((n) => n.startsWith('describe_') && n !== 'describe_controls');
    for (const n of [...describers, 'describe_controls']) {
      const r = await runGhostAction(n);
      if (r.ok && r.said) parts.push(r.said);
    }
    return parts.filter(Boolean).join('\n\n');
  };

  /**
   * ASK, AND MAKE IT DO THE WORK.
   *
   * Chris's run: "Alright, let's pick an artist first. Who should we analyze?"
   * and "I'm running MiniMax's caption skill on this", both with nothing done.
   * When he asked for work and the answer is a question or a promise with no
   * actions in it, it is asked once more, told to pick and do it.
   */
  const askActing = async ({ history = [], question, context, signal }) => {
    const base = { config: live.current.config, tab: live.current.tab, context, signal };
    let r = await askGhost({ ...base, history, question });
    const wantsWork = !/\?\s*$/.test(String(question).trim());
    if (wantsWork && !r.actions.length && (/\?/.test(r.text) || TALK_NOT_WORK.test(r.text))) {
      r = await askGhost({
        ...base,
        history: [...history, { role: 'user', content: question }, { role: 'assistant', content: r.text || '(nothing)' }],
        question: 'You answered without doing it. Do not ask anything. Pick whatever is missing yourself and emit the <do> lines that do the work, right now.',
      });
    }
    return r;
  };

  // A voice that fails says so, instead of leaving him wondering why it is silent.
  const voiceFailed = (r) => { if (r && !r.ok && r.error) setVoiceNote(`The voice did not play: ${r.error}`); };

  /**
   * DO WHAT A REPLY SAYS, in the right order. OBS starts and the voice is set
   * first, then the reply is spoken while the hand works, and OBS stops last,
   * even after a Stop.
   */
  const runActions = async (text, actions) => {
    const first = actions.filter((a) => a.name === 'obs_record_start' || SETUP_ACTIONS.has(a.name));
    const last = actions.filter((a) => a.name === 'obs_record_stop');
    const middle = actions.filter((a) => !first.includes(a) && !last.includes(a));
    const narrated = actions.some((a) => NARRATING_ACTIONS.has(a.name));
    const done = [];
    for (const a of first) done.push({ name: a.name, ...(await runGhostAction(a.name, a.args)) });
    if (voiceOnRef.current && !narrated && text) speak(text).then(voiceFailed);
    for (const a of middle) {
      if (handStopped()) { done.push({ name: a.name, ok: false, said: 'stopped before this step' }); break; }
      const r = await runGhostAction(a.name, a.args);
      if (a.name === 'say' && r.ok) continue;
      done.push({ name: a.name, ...r });
    }
    for (const a of last) done.push({ name: a.name, ...(await runGhostAction(a.name, a.args)) });
    return done;
  };

  /* Jobs run outside React (ghostJobs.js). This hands them the app. */
  useEffect(() => {
    setJobDeps({
      planJob: async (job, signal) => planJob({
        prompt: job.prompt, config: live.current.config, tab: live.current.tab, context: await gatherContext(), signal,
      }),
      runStep: async (job, i, signal, attempt) => {
        const step = job.steps[i];
        const plan = job.steps
          .map((s, k) => `${k + 1}. ${s.text}${s.status === 'done' ? '   [done]' : s.status === 'skipped' ? '   [skipped]' : ''}`)
          .join('\n');
        const soFar = job.steps.slice(0, i)
          .flatMap((s) => (s.did || []).map((d) => `${d.ok ? 'did' : 'failed'}: ${d.said || d.name}`))
          .join('\n');
        const question = `YOU ARE RUNNING A JOB ONE STEP AT A TIME.

THE WHOLE JOB: ${job.prompt}

THE PLAN:
${plan}
${soFar ? `\nWHAT HAPPENED SO FAR:\n${soFar}\n` : ''}
DO STEP ${i + 1} NOW, AND ONLY STEP ${i + 1}: ${step.text}

Emit the <do> lines (or the <lyrics> tag) that do this step. Never ask a
question: pick anything missing yourself. Do not do later steps. Do not emit
obs_record_start or obs_record_stop, the job records itself. At most one short
spoken line of talk.${attempt ? `\n\nThe last try at this step did not work (${step.said || 'nothing happened'}). Do it another way.` : ''}`;
        const r = await askActing({ question, context: await gatherContext(), signal });
        if (signal.aborted) return { ok: false, said: 'stopped', did: [] };
        const acts = r.actions.filter((a) => !/^obs_record_/.test(a.name));
        if (!acts.length) {
          return { ok: false, said: r.text ? `it only talked: "${r.text.slice(0, 140)}"` : 'it did nothing for this step', did: [] };
        }
        const did = await runActions(r.text, acts);
        const bad = did.find((d) => !d.ok);
        return { ok: !bad, said: bad ? bad.said : (r.text || did.map((d) => d.said).filter(Boolean).join('; ')), did };
      },
      record: (on) => runGhostAction(on ? 'obs_record_start' : 'obs_record_stop'),
      onJobStart: (job) => { resetHandStop(); setHandSpeedOverride(job?.mode === 'batch' ? 'off' : null); },
      onJobEnd: () => setHandSpeedOverride(null),
      onStop: () => { stopHand(); hush(); },
      keepAwake: (on) => { try { window.lyricistAPI?.ghostKeepAwake?.(on)?.catch?.(() => {}); } catch { /* browser */ } },
    });
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

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

      // A whole workflow in one message runs as a job, one step at a time, so
      // nothing is skipped and OBS starts before the first step. ghostJobs.js.
      if (looksLikeWorkflow(q)) {
        const record = /\b(obs|record(ed|ing)?)\b/i.test(q);
        addJob({ prompt: q, mode: 'full', record });
        setMsgs((m) => [...m, {
          who: 'ghost',
          text: `That's a whole job, so I'm running it step by step${record ? ' and recording it in OBS' : ''}. It ticks off in Jobs.`,
        }]);
        setView('jobs');
        return;
      }

      const history = msgs
        .filter((m) => m.who === 'you' || m.who === 'ghost')
        .map((m) => ({ role: m.who === 'you' ? 'user' : 'assistant', content: m.text }));

      const context = await gatherContext();
      const { text, actions } = await askActing({ history, question: q, context, signal: ac.signal });
      const done = await runActions(text, actions);

      setMsgs((m) => [...m, {
        who: 'ghost',
        text: text || (done.length ? 'Done.' : 'I did not do anything with that. Say it another way.'),
        did: done,
      }]);
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

          <div className="gha-views">
            <button type="button" aria-pressed={view === 'chat'} onClick={() => setView('chat')}>Chat</button>
            <button type="button" aria-pressed={view === 'jobs'} onClick={() => setView('jobs')}>
              Jobs{jobCount ? ` · ${jobCount}` : ''}
            </button>
          </div>


          {view === 'jobs' ? <GhostJobs /> : (<>
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
          </>)}
        </aside>
      )}
    </>
  );
}
