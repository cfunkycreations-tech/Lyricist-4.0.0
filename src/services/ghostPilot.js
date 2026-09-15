import { synthesize, ghostChain, prewarm } from './GhostVoice.js';
import { startRecord, stopRecord, connectObs, disconnectObs } from './obsClient.js';

// Dummy cursor state so VirtualCursor.jsx doesn't crash on import, 
// even though we are using the real OS hardware cursor now.
const cursor = { x: 0, y: 0, visible: false, pressed: false, typing: false, ring: 0 };
const subscribers = new Set();

export function readCursor() { return { ...cursor }; }

export function subscribeCursor(fn) {
  subscribers.add(fn);
  fn({ ...cursor });
  return () => subscribers.delete(fn);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * The hardware bridge, or a clear reason it is missing.
 *
 * pilotMove/Click/Type are exposed by the Electron preload. In a plain browser
 * (or a customer build with the pilot gated off) they are not there, and the
 * honest failure is "this needs the desktop app", not a vague undefined error
 * three calls deep.
 */
function api() {
  const a = typeof window !== 'undefined' ? window.lyricistAPI : null;
  if (!a || typeof a.pilotMove !== 'function') {
    throw new Error('Ghost Pilot needs the desktop app — the hardware cursor bridge is not available here.');
  }
  return a;
}

async function getScreenTarget(selector) {
  const el = document.querySelector(selector);
  if (!el) throw new Error(`Ghost Pilot: nothing matches "${selector}" on screen right now.`);

  el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
  await sleep(420);

  const rect = el.getBoundingClientRect();

  // VIEWPORT-relative CSS-pixel centre, and nothing else. The main process adds
  // the window's content-area origin and converts DIP → physical pixels there,
  // with Electron's screen API — see main.js toScreenPoint(). That is where the
  // display scale and the title-bar offset are handled correctly; doing any of
  // it here with window.screenX/devicePixelRatio is what made the old cursor
  // land off-target on a scaled monitor.
  return { el, viewX: rect.left + rect.width / 2, viewY: rect.top + rect.height / 2 };
}

async function moveToTarget(selector) {
  const { viewX, viewY } = await getScreenTarget(selector);
  await api().pilotMove(viewX, viewY);
}

async function clickTarget(selector) {
  await moveToTarget(selector);
  await sleep(150); // Pause for viewer legibility
  await api().pilotClick();
  await sleep(160);
}

async function typeInto(selector, text) {
  await clickTarget(selector); // Hardware click focuses the field genuinely
  await sleep(100);
  await api().pilotType(text);
}

let voiceCtx = null;
let currentSource = null;

async function speakLine(text, waitFor = 'play') {
  const line = String(text || '').trim();
  if (!line) return;

  let buffer;
  try {
    buffer = await synthesize(line);
  } catch (e) {
    console.warn('[ghost pilot] voice unavailable:', e?.message || e);
    return;
  }

  if (!voiceCtx) voiceCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (voiceCtx.state === 'suspended') await voiceCtx.resume().catch(() => {});

  try { currentSource?.stop(); } catch {}

  const src = ghostChain(voiceCtx, buffer);
  currentSource = src;

  return new Promise((resolve) => {
    let settled = false;
    const done = () => { if (!settled) { settled = true; resolve(); } };

    src.onended = () => {
      if (currentSource === src) currentSource = null;
      if (waitFor === 'end') done();
    };

    try {
      src.start();
    } catch (e) {
      console.warn('[ghost pilot] could not start audio:', e?.message || e);
      done();
      return;
    }

    if (waitFor === 'end') {
      setTimeout(done, (buffer.duration + 2) * 1000);
    } else {
      done();
    }
  });
}

let running = false;
let abort = false;

export async function runGhostScript(actions) {
  if (running) return { ok: false, error: 'A Ghost Pilot script is already running.' };
  if (!Array.isArray(actions)) return { ok: false, error: 'Ghost Pilot expects an array of actions.' };

  running = true;
  abort = false;
  const log = [];

  // SYNTHESIZE THE WHOLE SCRIPT BEFORE THE CURSOR MOVES.
  //
  // The entire action list is known right now, so every line the ghost will say
  // is known right now too. Kick them all off at once: by the time the cursor
  // has moved and clicked its way to line 5, line 5 is already sitting in the
  // cache and speakLine() returns instantly.
  //
  // This is what stops the app freezing mid-take. The pilot still WAITS for
  // each clip -- cursor and voice must stay in sync or the recording is
  // worthless -- but it waits on a cache hit instead of on inference.
  //
  // Fire-and-forget: prewarm never throws and never blocks. If one misses, that
  // line just gets generated the old way when its turn comes.
  prewarm(actions.filter((a) => a?.action === 'speak').map((a) => a?.text));

  try {
    for (let i = 0; i < actions.length; i++) {
      if (abort) { log.push({ step: i, action: 'abort', ok: true }); break; }
      const a = actions[i] || {};
      try {
        switch (a.action) {
          case 'move':              await moveToTarget(a.target); break;
          case 'click':             await clickTarget(a.target); break;
          case 'type':              await typeInto(a.target, a.text); break;
          case 'wait':              await sleep(Math.max(0, Number(a.ms) || 0)); break;
          case 'speak':             await speakLine(a.text, a.waitFor || 'play'); break;
          case 'obs_record_start':  await startRecord(); break;
          case 'obs_record_stop':   await stopRecord(); break;
          default: throw new Error(`unknown action "${a.action}"`);
        }
        log.push({ step: i, action: a.action, ok: true });
      } catch (e) {
        log.push({ step: i, action: a.action, ok: false, error: e?.message || String(e) });
        return { ok: false, error: e?.message || String(e), log };
      }
    }
    return { ok: true, log };
  } finally {
    running = false;
  }
}

export function stopGhostScript() { abort = true; }

export function isGhostScriptRunning() { return running; }

export function startGhostPilot() {
  connectObs().catch(() => {});

  window.ghostPilot = {
    run: runGhostScript,
    stop: stopGhostScript,
    isRunning: isGhostScriptRunning,
    cursor: readCursor,
  };

  return () => {
    abort = true;
    delete window.ghostPilot;
    try { currentSource?.stop(); } catch {}
    currentSource = null;
    disconnectObs();
  };
}