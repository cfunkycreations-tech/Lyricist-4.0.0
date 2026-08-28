import { useEffect } from 'react';
import { lockLandscape } from './orientation.js';

/**
 * MOBILE ORIENTATION LOCK — WHAT'S LEFT OF THE OLD BOOT SPLASH.
 *
 * There used to be a 25 second title video here — splash.mp4, a canvas leaf
 * and orbital rings — that played before the app appeared and animated a
 * quarter-turn into landscape on the way out. Chris pulled it with the rest
 * of the artwork on 2026-08-27 (*"strip the app of all artwork and leave it
 * jet black"*). What survives is the single side-effect that WAS NOT art:
 * on a phone browser, ask for landscape orientation on boot so the app
 * lands the right way up.
 *
 * The public/splash.mp4 file, splash.html and splash-preload.js are left
 * on disk untouched; nothing imports or references them any more.
 *
 * Renders null on purpose — the orientation call belongs in an effect
 * because it needs a user gesture on some browsers, and this is the earliest
 * render inside `<App>`. Skipped inside Electron (window.lyricistAPI), which
 * has its own splash window.
 */
export default function LandscapeSplash() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.lyricistAPI) return;                   // desktop: not our job
    lockLandscape().catch(() => { /* refused; RotatePrompt handles the rest */ });
  }, []);
  return null;
}
