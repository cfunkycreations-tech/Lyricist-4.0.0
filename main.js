const { app, BrowserWindow, session, ipcMain, Menu, MenuItem, clipboard, shell, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const demucsLocal = require('./demucsLocal');
const comfySetup = require('./comfySetup');
const kaggleCloud = require('./kaggleCloud');
const captionSkill = require('./captionSkill');

/* ══════════════════════════════════════════════════════════════════════════
   GHOST PILOT — OS HARDWARE AUTOMATION.  INTERNAL / CREATOR BUILD ONLY.

   This is the hand that drives the app for a recording: the real Windows mouse
   and keyboard, so the cursor on camera is the actual system cursor a viewer
   would see, not a drawn one. It is the engine behind the automated content
   pipeline — run each tab, walk through it like a person doing a tutorial.

   TWO RULES, both enforced here.

   1. IT NEVER SHIPS TO A CUSTOMER. @nut-tree-fork/nut-js is a devDependency, so
      electron-builder leaves it out of the packaged app entirely. If this file
      had `require('@nut-tree-fork/nut-js')` at the top, a customer build would
      throw "Cannot find module" at boot — because the module is deliberately
      absent. So the require is LAZY, inside pilot(), reached only when the gate
      below is open. A customer build never calls it, never loads it, never
      needs it on disk.

   2. IT IS ONLY ARMED IN THE CREATOR BUILD. `!app.isPackaged` is the dev/creator
      session you record in; the env flag is the escape hatch for a packaged
      creator build. In the shipped customer app both are false, every handler
      short-circuits, and nut-js is never touched.
   ══════════════════════════════════════════════════════════════════════════ */
/* LIBNUT, NOT ALL OF NUT-JS. Chris, 2026-09-15: teach the Ghost by recording
   his own mouse, then replay it on the real Windows cursor in the Creator
   installer. nut-js drags in jimp and friends; its native core libnut is one
   1 MB file with no dependencies. release.mjs --creator copies it into
   resources/creator/libnut. A customer installer has nothing there, so the
   pilot stays off exactly as rule 2 says. */
const PILOT_LIBNUT = app.isPackaged
  ? path.join(process.resourcesPath, 'creator', 'libnut', 'libnut.node')
  : path.join(__dirname, 'node_modules', '@nut-tree-fork', 'libnut-win32', 'build', 'Release', 'libnut.node');
const PILOT_ENABLED = !app.isPackaged
  || process.env.VITE_FAFO_INTERNAL_BUILD === 'true'
  || fs.existsSync(PILOT_LIBNUT);

let _pilot = null;
function pilot() {
  // Lazy on purpose — see rule 1 above. Only the creator build ever gets here.
  if (_pilot) return _pilot;
  const nut = require(PILOT_LIBNUT);
  // Timing is ours: a replay schedules every event itself.
  nut.setMouseDelay(0);
  nut.setKeyboardDelay(0);
  _pilot = nut;
  return _pilot;
}

const pilotSleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* THE COORDINATE FIX.

   The renderer hands us a point in VIEWPORT CSS pixels (the centre of the
   target element's bounding rect). Two conversions turn that into the physical
   pixel nut-js needs, and doing them HERE is the whole point:

     + getContentBounds() gives the window's CONTENT-area origin in DIP. Using
       it instead of window.screenX/screenY in the renderer removes the
       title-bar offset — screenY points at the top of the frame, the viewport
       starts below it, and the old math ignored the gap so every click landed
       high by the title-bar height.
     + dipToScreenPoint() applies the display's scale factor. On a 150% monitor
       a DIP point and a physical point are not the same pixel, and Electron's
       own screen API is the only thing that knows the factor for the display
       the window is actually on (multi-monitor safe). */
function toScreenPoint(sender, viewX, viewY) {
  const win = BrowserWindow.fromWebContents(sender);
  const b = win.getContentBounds();                        // DIP, content area
  return screen.dipToScreenPoint({ x: b.x + viewX, y: b.y + viewY });
}

ipcMain.handle('pilot-move', async (event, { x, y }) => {
  if (!PILOT_ENABLED) return { ok: false, error: 'Ghost Pilot is disabled in this build.' };
  const nut = pilot();
  const to = toScreenPoint(event.sender, x, y);
  const from = nut.getMousePos();
  // Eased in and out, a little longer for a longer trip, like a hand.
  const ms = Math.min(900, Math.max(180, Math.hypot(to.x - from.x, to.y - from.y) * 0.9));
  const steps = Math.max(8, Math.round(ms / 12));
  for (let i = 1; i <= steps; i++) {
    const k = i / steps;
    const e = k < 0.5 ? 2 * k * k : 1 - ((-2 * k + 2) ** 2) / 2;
    nut.moveMouse(Math.round(from.x + (to.x - from.x) * e), Math.round(from.y + (to.y - from.y) * e));
    await pilotSleep(ms / steps);
  }
  return { ok: true };
});

ipcMain.handle('pilot-click', async () => {
  if (!PILOT_ENABLED) return { ok: false, error: 'Ghost Pilot is disabled in this build.' };
  pilot().mouseClick('left');
  return { ok: true };
});

ipcMain.handle('pilot-type', async (event, { text }) => {
  if (!PILOT_ENABLED) return { ok: false, error: 'Ghost Pilot is disabled in this build.' };
  const nut = pilot();
  // A letter at a time with a gap, never one blocking native call for a whole song.
  for (const ch of String(text || '')) {
    nut.typeString(ch);
    await pilotSleep(35);
  }
  return { ok: true };
});

/* GHOST JOBS. Open OBS when a recorded job starts and it is not running, and
   hold the PC awake while an overnight batch works. Neither touches anything
   but OBS and the sleep timer, so neither is gated like the pilot above. */
ipcMain.handle('obs-launch', async (_event, { record = false } = {}) => {
  const { execFile, spawn } = require('child_process');
  const running = await new Promise((resolve) => {
    execFile('tasklist', ['/FI', 'IMAGENAME eq obs64.exe', '/NH'], (err, out) => resolve(!err && /obs64\.exe/i.test(out)));
  });
  if (running) return { ok: true, already: true };
  const candidates = [
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'obs-studio', 'bin', '64bit', 'obs64.exe'),
    path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'obs-studio', 'bin', '64bit', 'obs64.exe'),
  ];
  const exe = candidates.find((p) => fs.existsSync(p));
  if (!exe) return { ok: false, error: 'OBS Studio is not installed in Program Files.' };
  // OBS finds its own data relative to the working folder, so start it from bin.
  // --startrecording: Chris watched OBS open and "just sit there doing nothing"
  // until he clicked Record himself. OBS starts recording by itself now, so it
  // never depends on the websocket being ready in time.
  const args = ['--disable-shutdown-check'];
  if (record) args.push('--startrecording');
  const child = spawn(exe, args, { cwd: path.dirname(exe), detached: true, stdio: 'ignore' });
  child.unref();
  return { ok: true, recording: Boolean(record) };
});

let ghostAwakeId = null;
ipcMain.handle('ghost-keep-awake', async (_event, { on } = {}) => {
  const { powerSaveBlocker } = require('electron');
  if (on && ghostAwakeId == null) ghostAwakeId = powerSaveBlocker.start('prevent-app-suspension');
  if (!on && ghostAwakeId != null) { powerSaveBlocker.stop(ghostAwakeId); ghostAwakeId = null; }
  return { ok: true, awake: ghostAwakeId != null };
});

/* GHOST LESSONS. Chris, 2026-09-15: "I need to take control of the mouse and go
   through the steps... and then train the ghost to do exactly what I'm doing.
   That's the only way this is going to actually look like a human is running
   the mouse." The renderer records him (src/services/ghostTeach.js) and plays a
   lesson back here, on the real cursor, at his own timing, one stretch at a
   time. F10 stops a replay from anywhere, even with OBS in front. */
let replayAbort = false;
let wheelAcc = 0;
// Chromium wheel notches to Windows wheel units for libnut. Calibrated live.
const WHEEL_UNIT = 1;
const REPLAY_KEYS = {
  Enter: 'enter', Backspace: 'backspace', Tab: 'tab', Escape: 'escape', Delete: 'delete',
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  Home: 'home', End: 'end', PageUp: 'pageup', PageDown: 'pagedown', ' ': 'space',
};

ipcMain.handle('pilot-replay', async (event, { events = [] } = {}) => {
  if (!PILOT_ENABLED) return { ok: false, error: 'Ghost Pilot is disabled in this build.' };
  const nut = pilot();
  const { globalShortcut } = require('electron');
  const win = BrowserWindow.fromWebContents(event.sender);

  /* THE REAL MOUSE CLICKS WHATEVER IS ON TOP. The first live test ran with
     another window over Lyricist and the clicks went to that window. So the
     window is brought to the front first, a press outside it is never made,
     and a replay that loses focus stops rather than typing into another app. */
  const front = async () => {
    if (!win || win.isDestroyed()) return false;
    if (win.isFocused()) return true;
    if (win.isMinimized()) win.restore();
    win.setAlwaysOnTop(true);
    win.show();
    win.focus();
    win.moveTop();
    await pilotSleep(150);
    win.setAlwaysOnTop(false);
    return win.isFocused();
  };
  const inside = (p) => {
    const b = win.getContentBounds();
    const tl = screen.dipToScreenPoint({ x: b.x, y: b.y });
    const br = screen.dipToScreenPoint({ x: b.x + b.width, y: b.y + b.height });
    return p.x >= tl.x && p.x < br.x && p.y >= tl.y && p.y < br.y;
  };
  if (!(await front())) {
    return { ok: false, error: 'Lyricist could not come to the front, so nothing was played. It would have clicked another window.' };
  }

  replayAbort = false;
  let stopKey = false;
  try { stopKey = globalShortcut.register('F10', () => { replayAbort = true; }); } catch { /* taken */ }
  const held = new Set();
  const skipped = new Set();
  let lost = null;
  const start = Date.now();
  try {
    for (const ev of events) {
      if (replayAbort) break;
      const wait = start + (ev.t || 0) - Date.now();
      if (wait > 0) await pilotSleep(wait);
      if (replayAbort) break;
      if (ev.type !== 'move' && ev.type !== 'up' && !win.isFocused() && !(await front())) {
        lost = 'Lyricist lost focus, so the lesson stopped instead of pressing keys in another app.';
        break;
      }
      let p = null;
      if (ev.type !== 'key') {
        p = toScreenPoint(event.sender, ev.x, ev.y);
        nut.moveMouse(Math.round(p.x), Math.round(p.y));
      }
      const btn = ev.button === 2 ? 'right' : ev.button === 1 ? 'middle' : 'left';
      if (ev.type === 'down') {
        if (!inside(p)) { skipped.add(btn); continue; }
        nut.mouseToggle('down', btn);
        held.add(btn);
      } else if (ev.type === 'up') {
        if (skipped.delete(btn) || !held.has(btn)) continue;
        nut.mouseToggle('up', btn);
        held.delete(btn);
      } else if (ev.type === 'wheel') {
        if (!inside(p)) continue;
        wheelAcc += Number(ev.notches) || 0;
        const whole = Math.trunc(wheelAcc);
        if (whole) {
          nut.scrollMouse(0, -whole * WHEEL_UNIT);
          wheelAcc -= whole;
        }
      } else if (ev.type === 'key' && ev.key) {
        const mods = [];
        if (ev.ctrl) mods.push('control');
        if (ev.alt) mods.push('alt');
        if (ev.meta) mods.push('command');
        if (ev.key.length === 1 && !mods.length) {
          nut.typeString(ev.key);
        } else {
          if (ev.shift) mods.push('shift');
          const name = REPLAY_KEYS[ev.key]
            || (ev.key.length === 1 ? ev.key.toLowerCase() : /^F\d{1,2}$/.test(ev.key) ? ev.key.toLowerCase() : null);
          if (name) nut.keyTap(name, mods);
        }
      }
    }
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  } finally {
    // Never leave a button held down when a replay ends or is stopped.
    held.forEach((b) => { try { nut.mouseToggle('up', b); } catch { /* released */ } });
    if (stopKey) { try { globalShortcut.unregister('F10'); } catch { /* gone */ } }
  }
  if (lost) return { ok: false, error: lost };
  return { ok: true, stopped: replayAbort };
});

ipcMain.handle('pilot-replay-stop', async () => {
  replayAbort = true;
  return { ok: true };
});

const lessonsDir = () => {
  const dir = path.join(app.getPath('documents'), 'Lyricist Ghost', 'Lessons');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
};
const lessonBase = (name) => String(name || '').replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 120) || 'Lesson';
const lessonPath = (name) => path.join(lessonsDir(), `${lessonBase(name)}.json`);

ipcMain.handle('ghost-lesson-save', async (_event, lesson) => {
  try {
    // A new lesson never overwrites an old one with the same name.
    const base = lessonBase(lesson?.name);
    let name = base;
    for (let n = 2; fs.existsSync(lessonPath(name)); n++) name = `${base} ${n}`;
    const full = lessonPath(name);
    fs.writeFileSync(full, JSON.stringify({ ...lesson, name }), 'utf8');
    return { ok: true, name, path: full };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('ghost-lesson-list', async () => {
  try {
    const dir = lessonsDir();
    const lessons = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.json')).map((f) => {
      const full = path.join(dir, f);
      try {
        const j = JSON.parse(fs.readFileSync(full, 'utf8'));
        return {
          name: f.slice(0, -5),
          createdAt: j.createdAt || fs.statSync(full).mtimeMs,
          duration: j.duration || 0,
          clicks: (j.events || []).filter((e) => e.type === 'down').length,
          startTab: j.startTab || null,
        };
      } catch {
        return null;
      }
    }).filter(Boolean).sort((a, b) => b.createdAt - a.createdAt);
    return { ok: true, lessons, dir };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('ghost-lesson-load', async (_event, { name } = {}) => {
  try {
    return { ok: true, lesson: JSON.parse(fs.readFileSync(lessonPath(name), 'utf8')) };
  } catch (e) {
    return { ok: false, error: `No lesson called "${name}": ${e.message}` };
  }
});

// To the Recycle Bin, so a lesson deleted by mistake can come back.
ipcMain.handle('ghost-lesson-delete', async (_event, { name } = {}) => {
  try {
    await shell.trashItem(lessonPath(name));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('ghost-lesson-reveal', async () => {
  shell.openPath(lessonsDir());
  return { ok: true };
});

// One copy at a time. A second instance can't take the profile lock the first
// one holds, so its storage comes up broken and the window can land black —
// bring the window you already have to the front instead.
const gotInstanceLock = app.requestSingleInstanceLock();
if (!gotInstanceLock) {
  // quit() alone is not enough — 'ready' can still fire and build a window
  // before the process is torn down, which is the very thing we're avoiding.
  app.exit(0);
} else {
  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows();
    if (!win) return;
    if (win.isMinimized()) win.restore();
    if (!win.isVisible()) win.show();
    win.focus();
  });
}

// If the GPU process died on the last run, come back up on software rendering
// rather than showing another black window. Delete the marker each time so the
// app goes straight back to the fast path once the driver behaves.
// This has to happen before the app is ready, hence up here.
try {
  const marker = path.join(app.getPath('userData'), 'disable-gpu');
  if (fs.existsSync(marker)) {
    fs.unlinkSync(marker);
    app.disableHardwareAcceleration();
  }
} catch { /* never block startup over this */ }

/* ---------------------------------------------------------------------------
 * Voice pack — Chris's own recorded narration.
 *
 * The wizard ships with baked TTS clips, but a recording in his own voice beats
 * a synthesised one every time. Rather than making him hand me a file and wait
 * for a rebuild, the app reads a plain folder in userData:
 *
 *     <userData>/voice/splash.mp3     plays over the opener
 *     <userData>/voice/card-01.mp3    replaces wizard card 1's narration
 *     ...                             through card-20
 *
 * Anything present wins over the baked clip; anything missing falls back. Any
 * of mp3 / m4a / wav / ogg works, so he can drop in whatever his recorder makes
 * without converting. The folder is created on first launch and there is a
 * button in Settings that opens it — no typed paths, no hidden steps.
 * ------------------------------------------------------------------------- */
const VOICE_EXTS = ['mp3', 'm4a', 'wav', 'ogg', 'webm'];

function voiceDir() {
  return path.join(app.getPath('userData'), 'voice');
}

/** Absolute path of a voice-pack recording, or null when he hasn't made one. */
function voiceFile(stem) {
  try {
    for (const ext of VOICE_EXTS) {
      const p = path.join(voiceDir(), `${stem}.${ext}`);
      if (fs.existsSync(p)) return p;
    }
  } catch { /* a missing folder just means no voice pack yet */ }
  return null;
}

function ensureVoiceDir() {
  try {
    const dir = voiceDir();
    fs.mkdirSync(dir, { recursive: true });
    // A README so the folder explains itself when he opens it, rather than
    // being an empty window he has to guess at.
    const readme = path.join(dir, 'READ ME - how to add your voice.txt');
    if (!fs.existsSync(readme)) {
      fs.writeFileSync(readme, [
        'YOUR OWN VOICE IN LYRICIST',
        '',
        'Drop recordings in this folder and the app uses them instead of the',
        'built-in narration. Nothing to install, no rebuild - just restart the app.',
        '',
        'File names (mp3, m4a, wav, ogg all work):',
        '',
        '  splash.mp3    plays over the opening title video (about 25 seconds)',
        '  card-01.mp3   Tour card 1',
        '  card-02.mp3   Tour card 2',
        '  ... through card-20.mp3  (20 cards in all)',
        '',
        'Only the ones you record get replaced. Anything you leave out keeps the',
        'built-in voice, so you can do them a few at a time.',
        '',
        'Tip: record in the Recording Booth tab, export the WAV, and drop it here.',
      ].join('\r\n'), 'utf8');
    }
    return dir;
  } catch (e) {
    bootLog(`voice: could not prepare folder (${e.message})`);
    return null;
  }
}

/**
 * Which voice-pack recordings exist, as file:// URLs the renderer can play.
 * Returns a map of stem -> url so the wizard can decide per card in one call.
 */
ipcMain.handle('voice-pack', async () => {
  try {
    const dir = ensureVoiceDir();
    const found = {};
    // 20 cards now: One Man Band, Stemmer and Chopped & Screwed added clips 18,
    // 19 and 20. This number is the CEILING on which of his own recordings get
    // found at all, so it has to move every time a card is added — a card past
    // the ceiling silently keeps the baked TTS no matter what he records.
    const stems = ['splash', ...Array.from({ length: 20 }, (_, i) => `card-${String(i + 1).padStart(2, '0')}`)];
    for (const stem of stems) {
      const p = voiceFile(stem);
      if (p) found[stem] = require('url').pathToFileURL(p).href;
    }
    // Ghost Demo lines baked by the Voice Lab live one level down, in
    // voice\ghost, named by their line id (onemanband-0-say.wav ...). Any id
    // found here wins over the built-in clip, same rule as the cards.
    const ghost = {};
    const gdir = path.join(dir, 'ghost');
    if (fs.existsSync(gdir)) {
      for (const f of fs.readdirSync(gdir)) {
        const m = f.match(/^(.+)\.(mp3|m4a|wav|ogg)$/i);
        if (m) ghost[m[1]] = require('url').pathToFileURL(path.join(gdir, f)).href;
      }
    }
    return { ok: true, dir, found, ghost };
  } catch (e) {
    return { ok: false, error: e.message, found: {} };
  }
});

/**
 * Voice Lab bake: write one rendered clip into the voice pack. `folder` is ''
 * for the tour cards (card-01 ...) or 'ghost' for Ghost Demo lines. Names are
 * checked so a line id can never walk out of the voice folder.
 */
ipcMain.handle('voice-lab-save', async (_event, { folder = '', name, bytes } = {}) => {
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(name || '') || !['', 'ghost'].includes(folder)) throw new Error('bad clip name');
    const dir = path.join(ensureVoiceDir(), folder);
    fs.mkdirSync(dir, { recursive: true });
    // A stale mp3 of the same line would win the extension race in voiceFile().
    for (const ext of VOICE_EXTS) {
      const old = path.join(dir, `${name}.${ext}`);
      if (ext !== 'wav' && fs.existsSync(old)) fs.unlinkSync(old);
    }
    fs.writeFileSync(path.join(dir, `${name}.wav`), Buffer.from(bytes));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

/** Open the voice folder in Explorer so he can drop files straight in. */
ipcMain.handle('open-voice-folder', async () => {
  try {
    const dir = ensureVoiceDir();
    if (!dir) return { ok: false, error: 'Could not create the voice folder.' };
    shell.openPath(dir);
    return { ok: true, dir };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// Let the UI write into boot.log. See preload.js for why.
ipcMain.handle('app-log', async (event, { message }) => {
  bootLog(`ui: ${String(message).slice(0, 500)}`);
  return { ok: true };
});

/**
 * One Man Band talking to a ComfyUI, local or rented.
 *
 * ComfyUI sends no CORS headers, so a browser page cannot call it at all — the
 * engine picker reported "not running" while ComfyUI was plainly running on
 * this machine. The alternative was telling people to launch ComfyUI with
 * --enable-cors-header, a flag no beginner will ever find, so the request goes
 * through here instead. The main process has no CORS.
 *
 * Deliberately narrow: http(s) only. This is not a general purpose proxy and
 * must not become one.
 */
ipcMain.handle('music-fetch', async (event, { url, method = 'GET', body = null, binary = false, token = '' }) => {
  try {
    const target = new URL(String(url));
    if (target.protocol !== 'http:' && target.protocol !== 'https:') {
      return { ok: false, error: `Refusing to fetch a ${target.protocol} address.` };
    }
    // A local ComfyUI has no auth and gets none. A remote one (Modal) sits on
    // the open internet behind a bearer token, and this handler is the only way
    // the packaged app reaches it, so the token has to be forwarded here or
    // every Modal request arrives bare and comes back 401.
    const headers = {};
    if (body) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${String(token)}`;
    const res = await fetch(target.toString(), {
      method,
      headers: Object.keys(headers).length ? headers : undefined,
      body: body ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
    });
    if (binary) {
      const buf = Buffer.from(await res.arrayBuffer());
      return {
        ok: res.ok,
        status: res.status,
        contentType: res.headers.get('content-type') || 'application/octet-stream',
        base64: buf.toString('base64'),
      };
    }
    return { ok: res.ok, status: res.status, text: await res.text() };
  } catch (e) {
    // A refused connection is the normal answer when ComfyUI is not running,
    // so this is information rather than a crash.
    return { ok: false, error: String(e && e.message ? e.message : e) };
  }
});

// Monitors attached right now, so the visualizer can be thrown onto whichever
// one you want. `screen` can only be read once the app is ready, hence the lazy
// require. Windows leaves `label` empty on most monitors, so fall back to a
// number and hand back the resolution too — "Screen 2 · 2560x1440" tells you
// which panel it is without knowing any monitor's model name.
ipcMain.handle('list-displays', async () => {
  const { screen } = require('electron');
  const primaryId = screen.getPrimaryDisplay().id;
  return screen.getAllDisplays().map((d, i) => ({
    id: d.id,
    index: i + 1,
    label: (d.label || '').trim() || `Screen ${i + 1}`,
    bounds: d.bounds,
    workArea: d.workArea,
    scaleFactor: d.scaleFactor,
    isPrimary: d.id === primaryId,
  }));
});

// Save a Ghost Rider style report as a .txt file in the user's Documents folder.
// Called from the UI via the preload bridge (window.lyricistAPI.saveReport).
ipcMain.handle('save-report', async (event, { filename, content }) => {
  try {
    const dir = path.join(app.getPath('documents'), 'Lyricist Style Reports');
    fs.mkdirSync(dir, { recursive: true });
    // Strip characters Windows won't allow in a file name.
    const safe = String(filename).replace(/[\\/:*?"<>|]/g, '-').slice(0, 180);
    const full = path.join(dir, safe);
    fs.writeFileSync(full, content, 'utf8');
    return { ok: true, path: full };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// Save a Song Forge result (lyrics .txt + cover art .png, same base name) to
// Documents\Lyricist Song Forge. Called via window.lyricistAPI.saveSongForge.
ipcMain.handle('save-song-forge', async (event, { title, lyricsContent, imageBase64 }) => {
  try {
    const dir = path.join(app.getPath('documents'), 'Lyricist Song Forge');
    fs.mkdirSync(dir, { recursive: true });
    const safe = String(title || 'Untitled Song').replace(/[\\/:*?"<>|]/g, '-').slice(0, 150);
    const base = `${safe} - ${new Date().toISOString().slice(0, 10)}`;
    const lyricsPath = path.join(dir, `${base}.txt`);
    fs.writeFileSync(lyricsPath, lyricsContent, 'utf8');
    let imagePath = null;
    if (imageBase64) {
      imagePath = path.join(dir, `${base}.png`);
      fs.writeFileSync(imagePath, Buffer.from(imageBase64, 'base64'));
    }
    return { ok: true, lyricsPath, imagePath };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// Save a Recording Booth take (WAV bytes) into Documents\Lyricist Recordings.
// Called from the UI via window.lyricistAPI.saveRecording (4.1.3).
ipcMain.handle('save-recording', async (event, { filename, bytes }) => {
  try {
    const dir = path.join(app.getPath('documents'), 'Lyricist Recordings');
    fs.mkdirSync(dir, { recursive: true });
    const safe = String(filename).replace(/[\\/:*?"<>|]/g, '-').slice(0, 180);
    const full = path.join(dir, safe);
    fs.writeFileSync(full, Buffer.from(bytes));
    return { ok: true, path: full };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

/* ── Sample library pickers (4.2.0) ─────────────────────────────────────
   The library used to rely on a plain <input type="file"> to get at samples.
   Inside Electron that is the fragile path: it is at the mercy of the
   permission handler and, when it fails, it fails INVISIBLY — the dialog just
   never appears and it looks like the button is dead. Chris's report was
   exactly that: "I can't upload either folders or files."

   These handlers own the job instead. The main process opens the real OS
   dialog, walks a chosen folder itself (no webkitdirectory quirks, and it can
   skip junk before anything is read), and hands back paths. Audio is then
   fetched one file at a time so a 5,000-sample folder never has to sit in
   memory all at once. */
const SAMPLE_EXTS = ['.wav', '.mp3', '.ogg', '.flac', '.aif', '.aiff', '.m4a', '.webm', '.opus'];
const isSampleFile = (f) => SAMPLE_EXTS.some((e) => f.toLowerCase().endsWith(e));

ipcMain.handle('pick-sample-files', async (event) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender);
    const res = await require('electron').dialog.showOpenDialog(win, {
      title: 'Add samples',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Audio & sample packs', extensions: [...SAMPLE_EXTS.map((e) => e.slice(1)), 'zip'] },
        { name: 'All files', extensions: ['*'] },
      ],
    });
    return { ok: true, canceled: res.canceled, paths: res.filePaths || [] };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('pick-sample-folder', async (event) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender);
    const res = await require('electron').dialog.showOpenDialog(win, {
      title: 'Add a folder of samples',
      properties: ['openDirectory'],
    });
    if (res.canceled || !res.filePaths?.length) return { ok: true, canceled: true, paths: [] };

    // Walk it here rather than shipping a whole directory tree to the renderer.
    const out = [];
    const walk = (dir, depth = 0) => {
      if (depth > 12 || out.length > 20000) return;      // no runaway on a symlink loop
      let entries = [];
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full, depth + 1);
        else if (isSampleFile(entry.name) || entry.name.toLowerCase().endsWith('.zip')) out.push(full);
      }
    };
    walk(res.filePaths[0]);
    return { ok: true, canceled: false, paths: out, root: res.filePaths[0] };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

/**
 * Save a whole set of stems together, in ONE folder, from ONE click.
 *
 * The Stemmer used to call the browser download path once per stem. Six or
 * eight stems meant six or eight save prompts stacking up on top of each other,
 * and the files scattered into Downloads with no grouping. They belong together
 * — they are one song taken apart. Documents\Lyricist Stems\<song>\.
 */
ipcMain.handle('save-stems', async (event, { songName, files }) => {
  try {
    const safeSong = String(songName || 'Stems').replace(/[\\/:*?"<>|]/g, '-').slice(0, 120).trim() || 'Stems';
    const dir = path.join(app.getPath('documents'), 'Lyricist Stems', safeSong);
    fs.mkdirSync(dir, { recursive: true });
    let written = 0;
    for (const f of files || []) {
      const safe = String(f.filename).replace(/[\\/:*?"<>|]/g, '-').slice(0, 180);
      fs.writeFileSync(path.join(dir, safe), Buffer.from(f.bytes));
      written++;
    }
    return { ok: true, path: dir, written };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ── Local Demucs (true six-stem AI separation on the user's own machine) ──────
// Status is cheap and safe to call on tab open. Setup and separate are long and
// stream progress back to the renderer over 'demucs-progress'.
ipcMain.handle('demucs-status', async () => {
  try { return { ok: true, ...(await demucsLocal.status()) }; }
  catch (e) { return { ok: false, error: e.message, pythonFound: false, ready: false, cuda: false }; }
});

ipcMain.handle('demucs-setup', async (event) => {
  try {
    return await demucsLocal.setup((p, msg) => {
      try { event.sender.send('demucs-progress', { phase: 'setup', p, msg }); } catch { /* window gone */ }
    });
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('demucs-separate', async (event, { bytes, fileName, device }) => {
  try {
    return await demucsLocal.separate(bytes, fileName, device || 'auto', (p, msg) => {
      try { event.sender.send('demucs-progress', { phase: 'separate', p, msg }); } catch { /* window gone */ }
    });
  } catch (e) { return { ok: false, error: e.message }; }
});

/* ---------------------------------------------------------------------------
 * ONE-BUTTON SETUP FOR THE TWO ENGINES THAT USED TO NEED A TUTORIAL.
 * "No one's gonna know how to do that except people like me and you." Both of
 * these run in the main process because both need the disk, real sockets and
 * child processes, none of which the renderer has.
 * ------------------------------------------------------------------------- */

/** A cancel flag per job. The renderer sets it by calling the -stop handler. */
const setupStops = { comfy: false, kaggle: false };

ipcMain.handle('comfy-status', async () => {
  try { return { ok: true, ...(await comfySetup.status()) }; }
  catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('comfy-install', async (event) => {
  setupStops.comfy = false;
  try {
    return await comfySetup.install(
      (p, msg) => { try { event.sender.send('setup-progress', { job: 'comfy', p, msg }); } catch { /* window gone */ } },
      () => setupStops.comfy,
    );
  } catch (e) {
    return { ok: false, error: e.message === 'stopped' ? 'Stopped. Nothing downloaded so far was lost.' : e.message };
  }
});

ipcMain.handle('comfy-start', async (event) => {
  try {
    return await comfySetup.start((line) => {
      try { event.sender.send('setup-progress', { job: 'comfy', p: null, msg: String(line).slice(0, 200) }); } catch { /* gone */ }
    });
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('comfy-stop', async () => { setupStops.comfy = true; return comfySetup.stop(); });

ipcMain.handle('kaggle-status', async (event, { verify } = {}) => {
  try { return { ok: true, ...(await kaggleCloud.status(!!verify)) }; }
  catch (e) { return { ok: false, error: e.message }; }
});

/**
 * The normal way in since Kaggle changed it: they paste the code Kaggle showed
 * them. Nothing is downloaded any more, so there is no file to pick.
 */
ipcMain.handle('kaggle-connect-text', async (event, { text } = {}) => {
  try { return { ok: true, ...(await kaggleCloud.connect(text)) }; }
  catch (e) { return { ok: false, error: e.message }; }
});

/**
 * The way in for anybody whose Kaggle account still hands out a kaggle.json
 * file. Kept because it still works and because taking it away would strand
 * everybody who set this up on an earlier build.
 */
ipcMain.handle('kaggle-connect-file', async () => {
  try {
    const res = await require('electron').dialog.showOpenDialog({
      title: 'Pick the kaggle.json file you downloaded',
      defaultPath: app.getPath('downloads'),
      filters: [{ name: 'Kaggle token', extensions: ['json'] }],
      properties: ['openFile'],
    });
    if (res.canceled || !res.filePaths[0]) return { ok: false, canceled: true };
    const text = fs.readFileSync(res.filePaths[0], 'utf8');
    return { ok: true, ...(await kaggleCloud.connect(text)) };
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('kaggle-disconnect', async () => {
  try { return kaggleCloud.disconnect(); }
  catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('kaggle-render', async (event, song) => {
  setupStops.kaggle = false;
  try {
    return await kaggleCloud.render(
      song,
      (p, msg) => { try { event.sender.send('setup-progress', { job: 'kaggle', p, msg }); } catch { /* gone */ } },
      () => setupStops.kaggle,
    );
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('kaggle-render-stop', async () => { setupStops.kaggle = true; return { ok: true }; });

/**
 * Hand a finished song's bytes to the window, once, as one buffer.
 *
 * A Buffer crosses the bridge as a Uint8Array with a straight copy. The old
 * route turned every byte into a JavaScript number first, which is what put a
 * quarter of a gigabyte through the bridge for two takes.
 *
 * Only files inside the songs folder are readable through here. A path from the
 * window is never trusted to point wherever it likes.
 */
ipcMain.handle('song-bytes', async (event, { filePath } = {}) => {
  try {
    const dir = kaggleCloud.songsDir();
    const wanted = path.resolve(String(filePath || ''));
    if (path.dirname(wanted) !== path.resolve(dir)) {
      return { ok: false, error: 'That file is not one of your songs.' };
    }
    return { ok: true, bytes: fs.readFileSync(wanted) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

/** Ask Kaggle whether it finished something while nobody was watching, and
    bring it down. Runs by itself when the tab opens. */
ipcMain.handle('kaggle-collect', async () => {
  try { return await kaggleCloud.collect(); }
  catch (e) { return { ok: false, error: e.message }; }
});

/** Every song already on disk, so one that never made it into the app can be
    brought in later. A run that finished while the window was busy, reloading
    or closed is still a finished song. */
ipcMain.handle('songs-list', async () => {
  try {
    const dir = kaggleCloud.songsDir();
    const files = fs.readdirSync(dir)
      .filter((f) => /\.(flac|wav|mp3|ogg)$/i.test(f))
      .map((f) => {
        const filePath = path.join(dir, f);
        return { fileName: f, filePath, size: fs.statSync(filePath).size };
      });
    return { ok: true, folder: dir, files };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

/**
 * MiniMax's caption skill, read one disclosure layer at a time.
 *
 * Three channels because the skill has three stages and refuses to be done in
 * one: route, then compare cards in at most two family indexes, then read only
 * the templates you picked. Reading all thousand up front is the exact thing
 * the skill tells you not to do.
 */
ipcMain.handle('caption-skill-open', async () => {
  try { return captionSkill.opening(); }
  catch (e) { return { ok: false, error: e.message }; }
});
ipcMain.handle('caption-skill-indexes', async (event, { families } = {}) => {
  try { return captionSkill.indexes(families); }
  catch (e) { return { ok: false, error: e.message }; }
});
ipcMain.handle('caption-skill-templates', async (event, { ids } = {}) => {
  try { return captionSkill.templates(ids); }
  catch (e) { return { ok: false, error: e.message }; }
});
ipcMain.handle('caption-skill-present', async () => captionSkill.present());

/** Where the finished songs are kept, so a button can open the folder. */
ipcMain.handle('songs-folder', async () => {
  try { return { ok: true, folder: kaggleCloud.songsDir() }; }
  catch (e) { return { ok: false, error: e.message }; }
});

/** Reveal a folder in Explorer — "where did my stems go" should be one click. */
ipcMain.handle('show-folder', async (event, { folderPath }) => {
  try {
    shell.openPath(folderPath);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

/** Open a lyrics file the user already wrote and hand back its text. */
ipcMain.handle('pick-lyrics-file', async (event) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender);
    const res = await require('electron').dialog.showOpenDialog(win, {
      title: 'Open a song you already wrote',
      properties: ['openFile'],
      filters: [
        { name: 'Lyrics & text', extensions: ['txt', 'md', 'lrc', 'text', 'rtf'] },
        { name: 'All files', extensions: ['*'] },
      ],
    });
    if (res.canceled || !res.filePaths?.length) return { ok: true, canceled: true };
    const filePath = res.filePaths[0];
    const stat = fs.statSync(filePath);
    if (stat.size > 5 * 1024 * 1024) {
      return { ok: false, error: 'That file is over 5 MB — it is probably not a lyric sheet.' };
    }
    let text = fs.readFileSync(filePath, 'utf8');
    // Strip RTF control words so a WordPad file doesn't import as markup.
    if (filePath.toLowerCase().endsWith('.rtf')) {
      text = text.replace(/\\'[0-9a-f]{2}/gi, '')
        .replace(/\\[a-z]+-?\d*\s?/gi, '')
        .replace(/[{}]/g, '')
        .trim();
    }
    return { ok: true, canceled: false, name: path.basename(filePath), text };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

/** Read ONE sample off disk. One at a time, on purpose — see the note above. */
ipcMain.handle('read-sample-file', async (event, { filePath }) => {
  try {
    const stat = fs.statSync(filePath);
    const bytes = fs.readFileSync(filePath);
    return { ok: true, name: path.basename(filePath), size: stat.size, bytes };
  } catch (e) {
    return { ok: false, error: e.message, name: path.basename(String(filePath || '')) };
  }
});

// Export a finished album from the Mastering Studio: mastered WAVs + cover +
// tracklist into Documents\Lyricist Albums\<album name>\ (4.1.3).
// Called via window.lyricistAPI.saveAlbum(albumName, files).
ipcMain.handle('save-album', async (event, { albumName, files }) => {
  try {
    const safeAlbum = String(albumName || 'Untitled Album').replace(/[\\/:*?"<>|]/g, '-').slice(0, 120);
    const dir = path.join(app.getPath('documents'), 'Lyricist Albums', safeAlbum);
    fs.mkdirSync(dir, { recursive: true });
    for (const f of files || []) {
      const safe = String(f.filename).replace(/[\\/:*?"<>|]/g, '-').slice(0, 180);
      fs.writeFileSync(path.join(dir, safe), Buffer.from(f.bytes));
    }
    return { ok: true, path: dir };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// Fetch a Suno playlist's tracks from the main process, where there is no
// browser CORS wall. Called via window.lyricistAPI.sunoPlaylist(id).
// Returns { ok: true, tracks: [{ name, url }] } or { ok: false, error }.
ipcMain.handle('suno-playlist', async (event, { id }) => {
  try {
    const clean = String(id || '').trim();
    if (!clean) return { ok: false, error: 'No playlist id.' };
    const bases = [
      (p) => `https://studio-api.suno.ai/api/playlist/${clean}/?page=${p}`,
      (p) => `https://suno.com/api/playlist/${clean}/?page=${p}`,
    ];
    for (const build of bases) {
      const tracks = [];
      let worked = false;
      for (let page = 1; page <= 10; page++) {
        let res;
        try {
          res = await fetch(build(page), { headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0 Lyricist' } });
        } catch { break; }
        if (!res.ok) break;
        worked = true;
        let data;
        try { data = await res.json(); } catch { break; }
        const clips = (data.playlist_clips || data.clips || []).map((pc) => pc.clip || pc);
        if (!clips.length) break;
        for (const c of clips) {
          if (!c) continue;
          const url = c.audio_url || (c.id ? `https://cdn1.suno.ai/${c.id}.mp3` : null);
          if (url) tracks.push({ name: c.title || String(c.id || '').slice(0, 8) || 'Suno track', url });
        }
        if (clips.length < 20) break; // last page
      }
      if (tracks.length) return { ok: true, tracks };
      if (worked) return { ok: false, error: 'Playlist loaded but had no playable tracks.' };
    }
    return { ok: false, error: 'Suno did not return the playlist (it may be private, empty, or the API changed).' };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

/**
 * Stemmer Cloud — Demucs on Replicate (no local GPU required).
 * Input: { apiKey, audioBase64, mimeType, fileName }
 * Output: { ok, stems: { vocals, drums, bass, other } as base64 WAV/bytes, error }
 */
ipcMain.handle('stemmer-cloud', async (event, { apiKey, audioBase64, mimeType, fileName }) => {
  try {
    const token = String(apiKey || '').trim();
    if (!token) return { ok: false, error: 'No Replicate API key. Add one in Settings, or switch Stemmer to Offline.' };
    if (!audioBase64) return { ok: false, error: 'No audio data received.' };

    const mime = mimeType || 'audio/wav';
    // Prefer data URI — Replicate accepts data:audio/*;base64,...
    const dataUri = `data:${mime};base64,${audioBase64}`;

    // Create prediction (model endpoint — always latest demucs version)
    const createRes = await fetch('https://api.replicate.com/v1/models/cjwbw/demucs/predictions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Prefer: 'wait=60',
      },
      body: JSON.stringify({
        input: {
          audio: dataUri,
          model: 'htdemucs',
          stem: 'none',
          output_format: 'wav',
          mp3_bitrate: 320,
          clip_mode: 'rescale',
          shifts: 1,
          overlap: 0.25,
          split: true,
          two_stems: null,
        },
      }),
    });

    let prediction = await createRes.json().catch(() => ({}));
    if (!createRes.ok) {
      const msg = prediction?.detail || prediction?.error || `Replicate error ${createRes.status}`;
      return { ok: false, error: typeof msg === 'string' ? msg : JSON.stringify(msg) };
    }

    // Poll until succeeded / failed (max ~8 min)
    const deadline = Date.now() + 8 * 60 * 1000;
    while (prediction.status !== 'succeeded' && prediction.status !== 'failed' && prediction.status !== 'canceled') {
      if (Date.now() > deadline) return { ok: false, error: 'Cloud stem job timed out. Try a shorter clip or Offline mode.' };
      await new Promise((r) => setTimeout(r, 2500));
      const pollUrl = prediction.urls?.get || `https://api.replicate.com/v1/predictions/${prediction.id}`;
      const pollRes = await fetch(pollUrl, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      });
      prediction = await pollRes.json().catch(() => ({}));
      if (!pollRes.ok) {
        return { ok: false, error: prediction?.detail || `Poll failed (${pollRes.status})` };
      }
    }

    if (prediction.status !== 'succeeded') {
      return { ok: false, error: prediction.error || `Stem job ${prediction.status || 'failed'}` };
    }

    // Output shapes vary: object with stem keys, or array of URLs
    const out = prediction.output;
    const urlMap = {};
    if (out && typeof out === 'object' && !Array.isArray(out)) {
      for (const [k, v] of Object.entries(out)) {
        if (typeof v === 'string' && /^https?:\/\//i.test(v)) urlMap[k.toLowerCase()] = v;
        else if (v && typeof v === 'object' && typeof v.url === 'string') urlMap[k.toLowerCase()] = v.url;
      }
    } else if (Array.isArray(out)) {
      // Sometimes: [vocals, drums, bass, other] or list of {name,url}
      const names = ['vocals', 'drums', 'bass', 'other'];
      out.forEach((item, i) => {
        if (typeof item === 'string') urlMap[names[i] || `stem${i}`] = item;
        else if (item && typeof item === 'object') {
          const name = String(item.name || item.stem || names[i] || `stem${i}`).toLowerCase();
          const url = item.url || item.audio || item.file;
          if (url) urlMap[name] = url;
        }
      });
    }

    // Fallback: scan for known keys in nested output
    if (!Object.keys(urlMap).length && out) {
      const dump = JSON.stringify(out);
      const re = /"(vocals|drums|bass|other|guitar|piano|no_vocals)"\s*:\s*"(https?:[^"]+)"/gi;
      let m;
      while ((m = re.exec(dump))) urlMap[m[1].toLowerCase()] = m[2];
    }

    if (!Object.keys(urlMap).length) {
      return { ok: false, error: 'Cloud job finished but no stem URLs were returned. Try Offline mode or another file.' };
    }

    const stems = {};
    for (const [name, url] of Object.entries(urlMap)) {
      try {
        const r = await fetch(url);
        if (!r.ok) continue;
        const buf = Buffer.from(await r.arrayBuffer());
        stems[name] = buf.toString('base64');
      } catch {
        /* skip failed stem download */
      }
    }

    if (!Object.keys(stems).length) {
      return { ok: false, error: 'Could not download stem files from the cloud.' };
    }

    return {
      ok: true,
      stems,
      fileName: fileName || 'mix',
      model: 'htdemucs',
      source: 'replicate',
    };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
});

/**
 * Clipboard support.
 *
 * With no application menu, Electron registers no Cut/Copy/Paste accelerators,
 * so Ctrl+V does nothing in any input — which made it impossible to paste an
 * API key into Settings. A menu with the standard edit roles restores the
 * shortcuts; autoHideMenuBar keeps the bar itself out of the way.
 */
function installEditMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'pasteAndMatchStyle' },
        { role: 'delete' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { type: 'separator' },
        {
          // Escape hatch for a black window. The app is running fine underneath
          // — the graphics driver just isn't drawing it — so restart on
          // software rendering, which always paints.
          label: 'Fix a black screen (restart without GPU)',
          click: () => {
            try {
              fs.writeFileSync(path.join(app.getPath('userData'), 'disable-gpu'), 'user requested', 'utf8');
            } catch { /* still worth trying the relaunch */ }
            bootLog('user asked for a software-rendering restart');
            app.relaunch();
            app.exit(0);
          },
        },
        {
          label: 'Open the boot log folder',
          click: () => shell.showItemInFolder(path.join(app.getPath('userData'), 'boot.log')),
        },
      ],
    },
  ]));
}

/** Right-click menu: paste into any field, copy out of any selection. */
function attachContextMenu(win) {
  win.webContents.on('context-menu', (_event, props) => {
    const menu = new Menu();
    const { isEditable, selectionText, editFlags } = props;
    const hasSelection = Boolean(selectionText && selectionText.trim());

    if (isEditable) {
      menu.append(new MenuItem({ role: 'undo', enabled: editFlags.canUndo }));
      menu.append(new MenuItem({ role: 'redo', enabled: editFlags.canRedo }));
      menu.append(new MenuItem({ type: 'separator' }));
      menu.append(new MenuItem({ role: 'cut', enabled: editFlags.canCut }));
      menu.append(new MenuItem({ role: 'copy', enabled: editFlags.canCopy }));
      menu.append(new MenuItem({
        // Use the role when Electron reports paste is available; fall back to
        // writing the clipboard in directly so paste still works if it doesn't.
        label: 'Paste',
        enabled: editFlags.canPaste || Boolean(clipboard.readText()),
        click: () => win.webContents.paste(),
      }));
      menu.append(new MenuItem({ role: 'selectAll' }));
    } else if (hasSelection) {
      menu.append(new MenuItem({ role: 'copy' }));
      menu.append(new MenuItem({ role: 'selectAll' }));
    } else {
      return; // nothing useful to offer
    }

    menu.popup({ window: win });
  });
}

/**
 * Boot log — a black window tells you nothing, so write down what actually
 * happened. Lives next to the app's data at %APPDATA%\Lyricist\boot.log and
 * keeps the last run plus the current one.
 */
function bootLog(message) {
  try {
    const file = path.join(app.getPath('userData'), 'boot.log');
    const line = `[${new Date().toISOString()}] ${message}\n`;
    // Don't let it grow forever.
    if (fs.existsSync(file) && fs.statSync(file).size > 200_000) {
      fs.writeFileSync(file, fs.readFileSync(file, 'utf8').slice(-50_000), 'utf8');
    }
    fs.appendFileSync(file, line, 'utf8');
  } catch { /* logging must never break the app */ }
}

/** Last-resort page, so the user always sees words instead of a black rectangle. */
function failurePage(title, detail) {
  const html = `<!doctype html><html><body style="margin:0;background:#0a0614;color:#f3e8ff;
    font-family:Segoe UI,system-ui,sans-serif;padding:40px">
    <h1 style="color:#ff6b9d;margin:0 0 8px">${title}</h1>
    <p style="color:#c4b5fd;margin:0 0 18px">Lyricist opened, but the page never loaded. Nothing you
    saved is affected. Send this over and it gets fixed:</p>
    <pre style="white-space:pre-wrap;background:#12081c;padding:16px;border-radius:12px;
      border:1px solid #7c3aed;color:#e9d5ff;font-size:13px;line-height:1.45">${detail}</pre>
    <p style="color:#7c6f9c;font-size:12px;margin-top:18px">A full log is at %APPDATA%\\Lyricist\\boot.log</p>
    </body></html>`;
  return 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    // 4.1.3: the layout is responsive from phone-width up to TV — let the
    // window shrink to the mobile breakpoint and grow without limit.
    minWidth: 420,
    minHeight: 640,
    // Matches --bg-obsidian, so the frame that paints before the renderer boots
    // is the same colour as the app rather than a purple flash.
    backgroundColor: '#05070C',
    icon: path.join(__dirname, 'src/assets/icon.ico'),
    // The product name, with no version in it. The build pad is for installer
    // filenames only, and the version belongs in About, not in the title bar.
    title: 'Lyricist Pro',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      // Chromium suspends media decoding and throttles timers whenever it thinks
      // the window is hidden — and on Windows that includes merely being COVERED
      // by another window, not just minimized. The background videos came back
      // frozen on a single frame after any alt-tab, and nothing in the renderer
      // ever restarted them, so the whole app looked like the videos were dead.
      // The renderer pauses hidden tabs itself (see TabPane in App.jsx) and
      // pauses everything on visibilitychange, so we are not trading this for
      // wasted CPU — we just want to be the ones deciding, not the occlusion
      // detector.
      backgroundThrottling: false,
    },
    autoHideMenuBar: true,
    // Don't put an empty frame on screen. A window painted before its content
    // is exactly the black rectangle people report as "the app is black".
    show: false,
  });

  installEditMenu();
  attachContextMenu(win);

  // The visualizer popout. It has to be a window.open() child rather than a
  // BrowserWindow we build here, because Butterchurn visualises a live
  // AudioNode — and a separate renderer cannot reach the master bus, so a
  // hand-built window would render silent, frozen graphics. A same-origin
  // window.open child shares the renderer process, so the popout can draw using
  // the AudioContext that is already playing.
  //
  // All this handler does is put that child on the monitor the UI picked.
  win.webContents.setWindowOpenHandler(({ url, frameName, features }) => {
    if (frameName !== 'lyricist-visualizer') {
      // Everything else asking for a window is a real link — the Fiverr,
      // PayPal, Venmo, Cash App and Buy Me A Coffee buttons in the footer.
      // This handler used to just deny them, so every one of those buttons did
      // NOTHING when clicked: no browser, no error, no clue why. They belong in
      // the user's own browser, where they are already signed in.
      if (/^https?:\/\//i.test(url || '')) {
        shell.openExternal(url).catch((e) => bootLog(`openExternal failed: ${e.message}`));
      }
      return { action: 'deny' };
    }
    const num = (key) => {
      const m = new RegExp(`(?:^|,)${key}=(-?\\d+)`).exec(features || '');
      return m ? Number(m[1]) : undefined;
    };
    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        x: num('left'),
        y: num('top'),
        width: num('width') || 1280,
        height: num('height') || 720,
        backgroundColor: '#000000',
        title: 'Lyricist Visualizer',
        autoHideMenuBar: true,
        // Fullscreen on the target monitor is the point of the feature. The
        // popout draws its own Close button, and Escape closes it, so this is
        // never a window you can't get out of.
        fullscreen: true,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          preload: path.join(__dirname, 'preload.js'),
        },
      },
    };
  });

  // A link WITHOUT target="_blank" doesn't ask for a window — it navigates this
  // one. That would replace the whole app with a web page and there is no way
  // back. Send those to the real browser too, and stay put.
  win.webContents.on('will-navigate', (event, url) => {
    const here = win.webContents.getURL();
    const sameApp = (() => {
      try { return new URL(url).origin === new URL(here).origin; } catch { return false; }
    })();
    if (sameApp || url.startsWith('file://')) return;
    event.preventDefault();
    if (/^https?:\/\//i.test(url)) {
      shell.openExternal(url).catch((e) => bootLog(`openExternal failed: ${e.message}`));
    }
  });

  let shown = false;
  win.once('ready-to-show', () => {
    if (!shown && !win.isDestroyed()) {
      shown = true;
      bootLog('main: ready-to-show -> showing window immediately');
      win.show();
      win.focus();
    }
  });

  win.webContents.on('did-finish-load', () => bootLog('did-finish-load'));

  win.webContents.on('did-fail-load', (_e, code, desc, url, isMainFrame) => {
    if (!isMainFrame) return;                   // a missing image is not a dead app
    bootLog(`did-fail-load ${code} ${desc} ${url}`);
    win.loadURL(failurePage('Lyricist could not load', `${desc} (${code})\n${url}`));
    forceReveal('load failure');
  });

  // A dead renderer or GPU process is the other way this ends up black. Say so,
  // and give the page one clean retry before showing the failure card.
  let reloadedAfterCrash = false;
  win.webContents.on('render-process-gone', (_e, details) => {
    bootLog(`render-process-gone ${details.reason} exit=${details.exitCode}`);
    if (!reloadedAfterCrash && !win.isDestroyed()) {
      reloadedAfterCrash = true;
      win.reload();
      forceReveal('renderer crash retry');
      return;
    }
    if (!win.isDestroyed()) {
      const oom = details.reason === 'oom';
      win.loadURL(failurePage(
        oom ? 'Lyricist ran out of memory' : 'Lyricist stopped responding',
        oom
          ? 'The page was killed for using too much memory, twice in a row.\n\n'
            + 'Closing a few browser tabs or other heavy apps and reopening Lyricist\n'
            + 'usually clears it. Send over %APPDATA%\\Lyricist\\boot.log either way.'
          : `Renderer process gone: ${details.reason}`,
      ));
      forceReveal('renderer crash');
    }
  });

  win.webContents.on('unresponsive', () => bootLog('renderer unresponsive'));

  // Memory watch. An OOM with 36 GB free means one specific thing in the page
  // is allocating hard, so sample the renderer every 10s alongside whichever
  // tab is open. When it dies, the log says what it was doing on the way down.
  let peakMB = 0;
  const memTimer = setInterval(async () => {
    if (win.isDestroyed()) return;
    let tab = '?';
    try {
      tab = await win.webContents.executeJavaScript('window.__lyricistActiveTab || "?"', true);
    } catch { /* renderer busy — still worth logging the memory */ }
    try {
      // app.getAppMetrics() is the API that exists in this Electron.
      // webContents.getProcessMemoryInfo() was removed, and the version of this
      // watch that used it threw on every sample and logged nothing at all.
      const pid = win.webContents.getOSProcessId();
      const me = app.getAppMetrics().find((m) => m.pid === pid);
      const mb = Math.round((me?.memory?.workingSetSize || 0) / 1024);
      if (!mb) return;
      const jumped = mb > peakMB + 200;
      bootLog(`mem ${mb} MB  tab=${tab}${jumped ? '  JUMP' : ''}`);
      if (mb > peakMB) peakMB = mb;
    } catch (e) {
      bootLog(`mem sample failed: ${e?.message || e}`);
    }
  }, 5_000);

  // Renderer errors and warnings land in the log too — an allocation that fails
  // usually says so in the console a moment before the process dies.
  // Electron changed this event's shape: older builds pass
  // (event, level:number, message), newer ones pass a single object with
  // level as a string. Handle both, or the log silently stays empty.
  win.webContents.on('console-message', (...args) => {
    const first = args[0];
    const isObject = first && typeof first === 'object' && 'message' in first;
    const level = isObject ? first.level : args[1];
    const message = isObject ? first.message : args[2];
    const bad = level === 3 || level === 2 || level === 'error' || level === 'warning';
    if (!bad) return;
    const kind = level === 3 || level === 'error' ? 'error' : 'warn';
    bootLog(`renderer ${kind}: ${String(message).slice(0, 400)}`);
  });
  win.on('closed', () => {
    clearInterval(memTimer);
    bootLog(`window closed — peak renderer memory ${peakMB} MB`);
  });

  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
  bootLog(`createWindow packaged=${app.isPackaged} dev=${isDev} v=${app.getVersion()}`);
  const startTabDev = process.env.LYRICIST_START_TAB;
  if (isDev) {
    win.loadURL(`http://localhost:5173${startTabDev ? `#tab=${startTabDev}` : ''}`);
  } else {
    const index = path.join(__dirname, 'dist/index.html');
    if (!fs.existsSync(index)) {
      bootLog(`MISSING ${index}`);
      win.loadURL(failurePage('Lyricist is missing its app files', `Not found:\n${index}\n\nReinstall over the top of this copy.`));
      forceReveal('missing index.html');
      return;
    }
    // LYRICIST_START_TAB=loopstation opens straight onto that tab, so a crash
    // can be reproduced where it actually happens.
    const startTab = process.env.LYRICIST_START_TAB;
    const off = process.env.LYRICIST_OFF;
    const wipe = process.env.LYRICIST_WIPE;
    const hash = [startTab && `tab=${startTab}`, off && `off=${off}`, wipe && `wipe=${wipe}`]
      .filter(Boolean).join('&');
    win.loadFile(index, hash ? { hash } : undefined);
  }
}

// --- Native JUCE Engine Management ---
const { spawn } = require('child_process');
const readline = require('readline');

let juceProcess = null;

function getJuceEnginePath() {
  // Installed Creator build: release.mjs ships it in resources/creator/engine.
  const packaged = process.resourcesPath && path.join(process.resourcesPath, 'creator', 'engine', 'LyricistEngine.exe');
  if (packaged && fs.existsSync(packaged)) return packaged;
  // The copy GitHub builds and commits (.github/workflows/engine.yml).
  const p0 = path.join(__dirname, 'juce-backend', 'prebuilt', 'LyricistEngine.exe');
  if (fs.existsSync(p0)) return p0;
  const p1 = path.join(__dirname, 'juce-backend', 'build', 'LyricistEngine.exe');
  const p2 = path.join(__dirname, 'juce-backend', 'build', 'Release', 'LyricistEngine.exe');
  if (fs.existsSync(p1)) return p1;
  if (fs.existsSync(p2)) return p2;
  // JUCE's own output folder, for a build that skipped the POST_BUILD copy.
  const p3 = path.join(__dirname, 'juce-backend', 'build', 'LyricistEngine_artefacts', 'Release', 'Lyricist Engine.exe');
  if (fs.existsSync(p3)) return p3;
  return null;
}

// ── Native engine IPC ───────────────────────────────────────────────────────
// The engine speaks strict JSON-RPC 2.0 on stdin/stdout: { jsonrpc, id, method,
// params }. It replies { id, result } or { id, error: { code, message } }, one
// JSON object per line. Verified against the built binary — asio.enumerate
// returns real hardware.
//
// The renderer speaks a DIFFERENT dialect ({ cmd, args }), so juce-command below
// translates. Do not "simplify" that away: sending { cmd } gets you
// "Method not found: " with an empty name, because the engine reads `method`.
const jucePending = new Map();
let juceReqId = 0;

function ensureJuceEngine(webContents) {
  if (juceProcess) return { ok: true };

  const exePath = getJuceEnginePath();
  if (!exePath) return { ok: false, error: 'LyricistEngine.exe not found' };

  try {
    juceProcess = spawn(exePath, [], { stdio: ['pipe', 'pipe', 'pipe'] });

    const rl = readline.createInterface({ input: juceProcess.stdout });
    rl.on('line', (line) => {
      let msg;
      try {
        msg = JSON.parse(line);
      } catch (e) {
        bootLog(`juce parse error: ${e.message} - line: ${line}`);
        return;
      }

      // Settle a correlated request, if this reply belongs to one.
      if (msg && msg.id != null && jucePending.has(msg.id)) {
        const { resolve, timer } = jucePending.get(msg.id);
        clearTimeout(timer);
        jucePending.delete(msg.id);
        resolve(msg.error
          ? { ok: false, error: msg.error.message || String(msg.error), code: msg.error.code }
          : { ok: true, result: msg.result });
      }

      // Still broadcast, so the older juce-message listeners keep working.
      if (webContents && !webContents.isDestroyed()) {
        webContents.send('juce-message', msg);
      }
    });

    juceProcess.stderr.on('data', (data) => {
      bootLog(`juce error: ${data.toString()}`);
    });

    juceProcess.on('close', (code) => {
      bootLog(`juce process exited with code ${code}`);
      juceProcess = null;
      // Never leave a caller hanging on a dead engine.
      for (const [, { resolve, timer }] of jucePending) {
        clearTimeout(timer);
        resolve({ ok: false, error: `engine exited (code ${code})` });
      }
      jucePending.clear();
    });

    return { ok: true };
  } catch (e) {
    juceProcess = null;
    return { ok: false, error: e.message };
  }
}

ipcMain.handle('juce-spawn', async (event) => {
  if (juceProcess) return { ok: true, message: 'Already running' };
  return ensureJuceEngine(event.sender);
});

ipcMain.handle('juce-send', async (event, payload) => {
  if (!juceProcess || !juceProcess.stdin) {
    return { ok: false, error: 'JUCE engine not running' };
  }
  try {
    juceProcess.stdin.write(JSON.stringify(payload) + '\n');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// Renderer dialect { cmd, args } -> engine dialect { jsonrpc, id, method, params }.
// Resolves with the engine's actual reply, or an error - never hangs.
ipcMain.handle('juce-command', async (event, payload) => {
  // JuceBridge.js passes ONE object ({ cmd, reqId, ...params }) while
  // JucePluginWindowManager.js passes (cmd, args) as preload declares. Accept both
  // rather than breaking one of them.
  const { cmd, args } = (payload && typeof payload.cmd === 'object')
    ? { cmd: payload.cmd.cmd, args: payload.cmd }
    : (payload || {});

  const method = typeof cmd === 'string' ? cmd : (cmd && cmd.cmd);
  if (!method) return { ok: false, error: 'juce-command: no method given' };

  const started = ensureJuceEngine(event.sender);
  if (!started.ok) return started;

  const id = ++juceReqId;
  const params = { ...(args || {}) };
  delete params.cmd;
  delete params.reqId;

  // Opening a plugin's own editor: the engine is a background subprocess, and
  // Windows will not let a background process raise a window over the foreground
  // app — so Diva/Serum/etc. would open hidden behind the Lyricist window. Blur
  // ourselves first so we are no longer the foreground window; the engine's
  // toFront() on the new editor then actually surfaces it.
  if (method === 'plugin.showEditor') {
    try { BrowserWindow.fromWebContents(event.sender)?.blur(); } catch (_) {}
  }

  // Loading a big synth cold (Zebra, Omnisphere) reads gigabytes of presets and
  // samples off disk, and opening an audio device can wait on a driver. Ten
  // seconds is fine for a status query but far too short for those, so give the
  // slow commands real time instead of reporting a false failure.
  const SLOW_METHODS = ['plugin.load', 'plugin.showEditor', 'audio.start', 'asio.open', 'vst3.scan'];
  const timeoutMs = SLOW_METHODS.includes(method) ? 90000 : 10000;

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      jucePending.delete(id);
      resolve({ ok: false, error: `juce-command timed out after ${timeoutMs / 1000}s: ${method}` });
    }, timeoutMs);

    jucePending.set(id, { resolve, timer });

    try {
      juceProcess.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    } catch (e) {
      clearTimeout(timer);
      jucePending.delete(id);
      resolve({ ok: false, error: e.message });
    }
  });
});

// Never leave the engine holding the ASIO driver after Lyricist Pro closes.
app.on('will-quit', () => { try { juceProcess?.kill(); } catch (_) {} juceProcess = null; });

ipcMain.handle('juce-close', async () => {
  if (juceProcess) {
    juceProcess.kill();
    juceProcess = null;
  }
  return { ok: true };
});

app.whenReady().then(() => {
  // Belt and braces: a losing second instance never gets as far as a window.
  if (!gotInstanceLock) return;

  // Allow Google Fonts and OpenRouter in packaged app.
  // 4.1.3: media-src added so the persistent Suno player can stream tracks
  // from any https audio host (e.g. cdn*.suno.ai) and play local uploads
  // (blob:) — plus mediastream: for voice-memo recording in MIDI Studio.
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self' 'unsafe-inline' 'unsafe-eval' https://fonts.googleapis.com https://fonts.gstatic.com https://openrouter.ai https://api.replicate.com https://replicate.delivery https://api.datamuse.com https://api.dictionaryapi.dev https://img.buymeacoffee.com https://generativelanguage.googleapis.com data: blob:; " +
          "media-src 'self' https: blob: data: mediastream:; " +
          // Collaboration (4.2.0) needs a WebSocket to a signalling server to
          // introduce two peers to each other. connect-src falls back to
          // default-src, which has no wss:, so without this line collab works
          // in the dev browser and silently fails in the packaged app — the
          // worst kind of bug. The song itself never goes through it: signalling
          // only swaps connection details, then the peers talk directly.
          // ws://localhost:4455 is OBS's own websocket, plain ws on this
          // machine only. Without it the Ghost could never reach OBS in the
          // packaged app: the connect was blocked and simply never settled.
          "connect-src 'self' wss: https: blob: data: ws://localhost:4455 ws://127.0.0.1:4455;"
        ],
      },
    });
  });

  // 4.1.3: MIDI Studio records voice memos via getUserMedia — grant the mic.
  // 4.2.0: 'fileSystem' joins it. Everything the app reads is a file the user
  // picked themselves — sample packs, backups, audio to master — and a blanket
  // deny here is invisible from inside the app: the picker simply does nothing
  // and it looks like the button is broken. Still a deny-by-default list; the
  // things worth refusing (geolocation, notifications, opening links, reading
  // the clipboard) are all still refused.
  // 4.2.0: 'midi' and 'midiSysex' join the list. Without them Chromium refuses
  // requestMIDIAccess and the renderer logs "Permission to use Web MIDI API was
  // not granted" on a loop — which is why a plugged-in controller (Impact LX49+)
  // did nothing in the browser-side surfaces even though the native engine could
  // see it perfectly well. 'media' is what lets the recording lanes capture a
  // take through the microphone.
  const ALLOWED_PERMISSIONS = new Set([
    'media', 'audioCapture', 'midi', 'midiSysex', 'fileSystem', 'clipboard-sanitized-write'
  ]);
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(ALLOWED_PERMISSIONS.has(permission));
  });
  // Same list for the synchronous check Chromium makes before showing a picker.
  session.defaultSession.setPermissionCheckHandler((webContents, permission) =>
    ALLOWED_PERMISSIONS.has(permission));

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// A GPU process that dies takes the picture with it and leaves a black window.
// Log it, and fall back to software rendering for the next start so the app
// comes up looking right even on a bad driver day.
app.on('child-process-gone', (_e, details) => {
  bootLog(`child-process-gone type=${details.type} reason=${details.reason} exit=${details.exitCode}`);
  if (details.type === 'GPU' && details.reason !== 'clean-exit') {
    try {
      fs.writeFileSync(path.join(app.getPath('userData'), 'disable-gpu'), 'gpu process crashed', 'utf8');
      bootLog('GPU crashed — software rendering armed for the next start');
    } catch { /* not worth failing over */ }
  }
});

process.on('uncaughtException', (err) => {
  bootLog(`uncaughtException ${err?.stack || err}`);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});