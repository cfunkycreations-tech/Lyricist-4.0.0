/**
 * Turn the web build into an installable app.
 *
 * DOES NOTHING IN THE DESKTOP APP, deliberately and on purpose. Electron loads
 * index.html from file://, where navigator.serviceWorker either does not exist
 * or throws on register, and where there is nothing to install to anyway. So
 * this bails out on anything that is not http(s), and bails out again if the
 * Electron bridge is present. Getting that wrong would put an exception in the
 * boot path of the shipping desktop app to gain nothing.
 *
 * NEW VERSIONS. An installed phone app can sit open for days, still running
 * the build it opened with, and the browser only looks for a new one on a
 * fresh launch. So whenever the app comes back to the front (and once a minute
 * after it opens), ask the server which bundle index.html points at now. If it
 * is not the one this page is running, raise 'lyricist:update-ready' and
 * NetStatus shows a Reload bar. It never reloads by itself: that would throw
 * away whatever the person was in the middle of.
 */
import { BUILD_NUMBER } from '../buildInfo.js';

const READY = 'lyricist:update-ready';
let updateReady = false;

/** True once the server has a newer build than this page. */
export const isUpdateReady = () => updateReady;
export const UPDATE_READY_EVENT = READY;

const BUNDLE = /assets\/index-[\w-]+\.js/;

async function checkForUpdate() {
  if (updateReady || navigator.onLine === false) return;
  const mine = [...document.scripts].map((s) => s.src.match(BUNDLE)?.[0]).find(Boolean);
  if (!mine) return;   // dev server: no hashed bundle to compare
  try {
    // ?fresh skips the service worker's cache (sw.js), so this is the server's
    // index.html, not the copy this page came from.
    const r = await fetch(`./?fresh=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) return;
    const now = (await r.text()).match(BUNDLE)?.[0];
    if (now && now !== mine) {
      updateReady = true;
      window.dispatchEvent(new Event(READY));
    }
  } catch { /* offline or server down: next time */ }
}

export function registerPWA() {
  if (typeof window === 'undefined') return;
  if (!/^https?:$/.test(window.location.protocol)) return;  // file:// -> Electron
  if (window.lyricistAPI) return;                            // desktop app
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    // The build number rides in the URL so a release produces a byte-different
    // script. The worker reads it back out to name its cache, which is what
    // makes a stale bundle impossible after a release.
    navigator.serviceWorker.register(`./sw.js?v=${BUILD_NUMBER}`).then(() => {
      setTimeout(checkForUpdate, 60 * 1000);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') checkForUpdate();
      });
      window.addEventListener('online', checkForUpdate);
    }).catch((err) => {
      // Never fatal. A failed registration costs offline support, not the app.
      console.warn('[pwa] service worker did not register:', err?.message || err);
    });
  });
}
