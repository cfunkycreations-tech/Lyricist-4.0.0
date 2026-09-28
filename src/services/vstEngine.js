/**
 * YOUR VST3 INSTRUMENTS, THROUGH ASIO.  (Creator build only.)
 *
 * Lyricist Engine (juce-backend, LyricistEngine.exe) is a native helper main.js
 * starts on first use. It opens an ASIO driver, loads real VST3 plugins (Diva,
 * Zebra2, Synplant, Blue3...) and plays them on that driver. We talk to it over
 * window.lyricistAPI.sendJuceCommand(method, params), JSON-RPC underneath.
 *
 * One plugin is loaded at a time: picking another sound unloads the last one,
 * so a big synth isn't left eating CPU. In DAW mode (midiOut.js) nothing is
 * played here; the notes go to the DAW like every other sound.
 */
import { isDaw, dawNote } from './midiOut.js';

const CREATOR = import.meta.env.VITE_FAFO_INTERNAL_BUILD === 'true';
const LIST_KEY = 'lyricist.vst3.list.v1';
const DRIVER_KEY = 'lyricist.vst3.driver.v1';

const api = () => (typeof window !== 'undefined' ? window.lyricistAPI : null);
export const vstAvailable = () => CREATOR && !!api()?.sendJuceCommand;

async function cmd(method, params = {}) {
  const r = await api().sendJuceCommand(method, params);
  if (!r?.ok) throw new Error(r?.error || `${method} failed`);
  return r.result;
}

const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ } };

/** Instruments from the last scan, straight away (no engine start). */
export const cachedInstruments = () => read(LIST_KEY, []);

/** Scan the VST3 folders (about 7 s for 20 plugins) and keep the instruments. */
export async function scanInstruments() {
  if (!vstAvailable()) return [];
  await cmd('vst3.scan', {});
  const { plugins = [] } = await cmd('vst3.list');
  const seen = new Set();
  const list = plugins
    .filter((p) => p.isInstrument)
    .filter((p) => !seen.has(p.name) && seen.add(p.name))
    .map((p) => ({ name: p.name, vendor: p.vendor, path: p.fileOrIdentifier }))
    .sort((a, b) => a.name.localeCompare(b.name));
  write(LIST_KEY, list);
  return list;
}

/** Cached list, scanning once if there is none yet. */
export async function listInstruments() {
  const c = cachedInstruments();
  return c.length ? c : scanInstruments();
}

export async function listDrivers() {
  const { drivers = [] } = await cmd('asio.enumerate');
  return drivers;
}
export const getDriver = () => read(DRIVER_KEY, '');
export function setDriver(name) {
  write(DRIVER_KEY, name);
  opened = null;   // reopen on the next note
}

let opened = null;       // promise: the driver is open and audio is running
let current = null;      // { key, id } of the loaded plugin

async function openAudio() {
  const drivers = await listDrivers();
  const saved = getDriver();
  // Saved choice, else FlexASIO (works on any Windows output), else anything but a Push.
  const name = (saved && drivers.includes(saved) && saved)
    || drivers.find((d) => /flexasio/i.test(d))
    || drivers.find((d) => !/push/i.test(d))
    || drivers[0];
  if (!name) throw new Error('No ASIO driver found. Install FlexASIO or your interface\'s ASIO driver.');
  const r = await cmd('asio.open', { name, sampleRate: 48000, bufferSize: 256 });
  if (!r?.success) throw new Error(`${name} would not open.`);
  await cmd('audio.start');
  return name;
}

/** Load `inst` ({ name, path }) and make sure it can play. Resolves to a handle. */
export async function loadInstrument(inst) {
  if (!opened) opened = openAudio().catch((e) => { opened = null; throw e; });
  const driver = await opened;
  const key = `${inst.path}|${inst.name}`;
  if (current?.key === key) return { id: current.id, driver, name: inst.name };
  if (current) { cmd('plugin.unload', { id: current.id }).catch(() => {}); current = null; }
  const r = await cmd('plugin.load', { path: inst.path, name: inst.name });
  current = { key, id: r.id };
  return { id: r.id, driver, name: inst.name };
}

/** Same shape as soundfontEngine.playNote: plays now (or at `when`), returns a stop handle. */
export function vstNote(ctx, handle, midi, { when, duration = 0.5, velocity = 0.8 } = {}) {
  if (isDaw()) return dawNote(ctx, midi, { when, duration, velocity });
  const note = Math.max(0, Math.min(127, Math.round(midi)));
  const vel = Math.max(1, Math.min(127, Math.round(velocity * 127)));
  const delay = ctx && when != null ? Math.max(0, (when - ctx.currentTime) * 1000) : 0;
  let on = false;
  let done = false;
  const off = () => {
    if (done) return;
    done = true;
    clearTimeout(startT);
    clearTimeout(endT);
    if (on) cmd('plugin.noteOff', { id: handle.id, note }).catch(() => {});
  };
  const startT = setTimeout(() => {
    if (done) return;
    on = true;
    cmd('plugin.noteOn', { id: handle.id, note, velocity: vel }).catch(() => {});
  }, delay);
  const endT = setTimeout(off, delay + duration * 1000);
  return off;
}

export async function showEditor(handle) {
  return cmd('plugin.showEditor', { id: handle.id });
}
