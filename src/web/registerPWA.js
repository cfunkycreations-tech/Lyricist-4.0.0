/**
 * Turn the web build into an installable app.
 *
 * DOES NOTHING IN THE DESKTOP APP, deliberately and on purpose. Electron loads
 * index.html from file://, where navigator.serviceWorker either does not exist
 * or throws on register, and where there is nothing to install to anyway. So
 * this bails out on anything that is not http(s), and bails out again if the
 * Electron bridge is present. Getting that wrong would put an exception in the
 * boot path of the shipping desktop app to gain nothing.
 */
import { BUILD_NUMBER } from '../buildInfo.js';

export function registerPWA() {
  if (typeof window === 'undefined') return;
  if (!/^https?:$/.test(window.location.protocol)) return;  // file:// -> Electron
  if (window.lyricistAPI) return;                            // desktop app
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    // The build number rides in the URL so a release produces a byte-different
    // script. The worker reads it back out to name its cache, which is what
    // makes a stale bundle impossible after a release.
    navigator.serviceWorker.register(`./sw.js?v=${BUILD_NUMBER}`).catch((err) => {
      // Never fatal. A failed registration costs offline support, not the app.
      console.warn('[pwa] service worker did not register:', err?.message || err);
    });
  });
}
