/**
 * LOCK THE APP TO LANDSCAPE, for the installed Android app.
 *
 * Lyricist is a studio, and studios are wide. A piano roll, a mixer, a
 * waveform, a drum grid, four loop tracks side by side - all of it wants the
 * phone sideways. 915 x 412 instead of 412 x 915 is more than double the
 * working width, and it is far closer to the proportions the desktop layout was
 * already designed for, which is why locking landscape is less work than
 * rebuilding every screen twice. Every serious mobile music app does the same.
 *
 * MIDI Studio is the proof: measured at 318 elements running past the edge of a
 * portrait phone, the worst reaching 1512 px.
 *
 * ============================================================================
 * WHY THIS IS ANDROID ONLY, AND WHY THAT IS FINE HERE
 * ============================================================================
 * screen.orientation.lock() works in an installed Android PWA. It does NOT work
 * on iOS at all - Apple has never supported it, and iPhone Safari does not even
 * support the Fullscreen API it depends on. This build targets Android, so the
 * lock is real. Anywhere else every call below fails quietly and the CSS falls
 * back, so nothing breaks; it simply is not forced.
 *
 * NOTHING HERE MAY EVER THROW. An unhandled rejection from a desktop browser,
 * from Electron, or from a phone whose own rotation lock is on must never reach
 * the app. Every path out of this file is caught.
 */

/** True only where a lock has any chance of working. */
function canLock() {
  if (typeof window === 'undefined') return false;
  if (window.lyricistAPI) return false;                  // desktop app, leave it alone
  if (!/^https?:$/.test(window.location.protocol)) return false;
  const o = window.screen && window.screen.orientation;
  return !!(o && typeof o.lock === 'function');
}

/** Is the phone already sideways? */
export function isLandscape() {
  if (typeof window === 'undefined') return true;
  return window.matchMedia('(orientation: landscape)').matches;
}

/**
 * Ask for landscape and stay there.
 *
 * Resolves true if the lock took, false if it was refused. `lock()` REJECTS
 * when the browser will not honour it - a plain browser tab rather than an
 * installed app, a desktop, a device rotation lock. That is expected, not an
 * error, so the caller gets a boolean rather than an exception and the splash
 * can decide whether to animate or just carry on.
 */
export async function lockLandscape() {
  if (!canLock()) return false;
  try {
    await window.screen.orientation.lock('landscape');
    return true;
  } catch {
    return false;    // refused: the CSS still handles portrait
  }
}

/** Let the phone follow its own rotation setting again. */
export function releaseOrientation() {
  if (!canLock()) return;
  try {
    window.screen.orientation.unlock();
  } catch {
    /* never fatal */
  }
}
