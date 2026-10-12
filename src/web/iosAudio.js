/**
 * SOUND ON AN iPHONE.
 *
 * Two things stand between an iPhone and the app's audio:
 *
 * 1. THE SILENT SWITCH. By default iOS treats Web Audio like a game's sound
 *    effects: flip the ring/silent switch on the side of the phone and the app
 *    goes quiet, while the same song plays fine in the Music app. A music app
 *    that is silent because of a hardware switch reads as broken.
 *    navigator.audioSession.type = 'playback' (Safari 16.4+) tells iOS this is
 *    music, which plays through the switch the way the Music app does.
 *
 * 2. THE FIRST TAP. Safari starts every AudioContext suspended until the
 *    person touches the page. Each player resumes its own context when it
 *    starts, but the shared one (audioEngine.js: the Suno player, the
 *    sequencer, the visualizer) is resumed here on the very first touch, so
 *    the first Play anywhere is never the one that makes no sound.
 *
 * Does nothing in the desktop app: Electron has no switch and no gesture rule.
 */
import { resumeAudio } from '../services/audioEngine.js';

export function installPhoneAudio() {
  if (typeof window === 'undefined') return;
  if (!/^https?:$/.test(window.location.protocol)) return;  // file:// is Electron
  if (window.lyricistAPI) return;                            // desktop app

  const session = navigator.audioSession;
  const setType = (t) => { try { if (session && session.type !== t) session.type = t; } catch { /* older Safari */ } };
  setType('playback');

  // 'playback' is a listen-only session. While the mic is open (Recording
  // Booth, RC-Funk 5000, MIDI Studio's Record Memo) iOS is told
  // 'play-and-record' instead, and 'playback' comes back once the last mic
  // track is stopped, so recording never trades places with the switch fix.
  const md = navigator.mediaDevices;
  if (session && md?.getUserMedia) {
    const mics = new Set();
    const settle = () => setType(mics.size ? 'play-and-record' : 'playback');
    const gum = md.getUserMedia.bind(md);
    md.getUserMedia = async (constraints) => {
      if (constraints?.audio) setType('play-and-record');
      try {
        const stream = await gum(constraints);
        stream.getAudioTracks().forEach((t) => {
          mics.add(t);
          t.addEventListener('ended', () => { mics.delete(t); settle(); });
        });
        return stream;
      } finally { settle(); }
    };
    const stop = MediaStreamTrack.prototype.stop;
    MediaStreamTrack.prototype.stop = function stopTrack() {
      stop.call(this);
      if (mics.delete(this)) settle();
    };
  }

  const events = ['touchend', 'pointerup', 'keydown'];
  const unlock = () => {
    events.forEach((e) => window.removeEventListener(e, unlock, true));
    resumeAudio().catch(() => {});
  };
  events.forEach((e) => window.addEventListener(e, unlock, { capture: true, passive: true }));
}
