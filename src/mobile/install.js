import { useEffect, useState } from 'react';

/**
 * "PUT IT ON YOUR HOME SCREEN", for the phone build.
 *
 * Opened in a browser tab the app is a web page: the address bar eats a fifth
 * of a landscape screen, it does not lock sideways, and it is one swipe away
 * from being closed. Installed, it opens full screen from its own icon. PHONE.md
 * tells buyers how, but nobody reads that on a phone, so the launcher says it.
 *
 * Chrome on Android hands over a prompt we can show from our own button
 * (beforeinstallprompt). It can fire before React has drawn anything, so it is
 * caught here at import time and kept. Safari on iPhone has no such prompt;
 * there the only way is Share -> Add to Home Screen, so we say exactly that.
 */

let deferred = null;
const listeners = new Set();

if (typeof window !== 'undefined' && !window.lyricistAPI) {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    listeners.forEach((fn) => fn());
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    listeners.forEach((fn) => fn());
  });
}

const DISMISS_KEY = 'lyricist.install.dismissed';

function isInstalled() {
  try {
    return window.navigator.standalone === true
      || !!window.matchMedia?.('(display-mode: standalone)').matches
      || !!window.matchMedia?.('(display-mode: fullscreen)').matches;
  } catch {
    return false;
  }
}

function isIOS() {
  const ua = navigator.userAgent || '';
  // iPadOS reports itself as a Mac; the touch points give it away.
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/**
 * What the launcher should offer: 'prompt' (Android, a real install button),
 * 'ios' (Share -> Add to Home Screen), or null (installed, dismissed, or a
 * browser that cannot install).
 */
export function useInstallOffer() {
  const [, bump] = useState(0);
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
  });

  useEffect(() => {
    const fn = () => bump((n) => n + 1);
    listeners.add(fn);
    return () => listeners.delete(fn);
  }, []);

  const dismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* private mode: offered again next time */ }
  };

  const install = async () => {
    if (!deferred) return;
    const e = deferred;
    deferred = null;
    try {
      e.prompt();
      const choice = await e.userChoice;
      if (choice && choice.outcome === 'accepted') dismiss();
    } catch { /* the browser withdrew the prompt; nothing to do */ }
    bump((n) => n + 1);
  };

  let kind = null;
  if (!dismissed && !isInstalled()) {
    if (deferred) kind = 'prompt';
    else if (isIOS()) kind = 'ios';
  }
  return { kind, install, dismiss };
}
