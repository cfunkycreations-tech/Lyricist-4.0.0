/**
 * "YOUR SONG IS READY" — FOR WHEN NOBODY IS LOOKING AT THE SCREEN.
 *
 * A song takes minutes on the free cloud and about seventeen on Kaggle. Nobody
 * stares at a progress bar that long: the phone goes in a pocket, the PC gets
 * another window on top. When the first take lands and the app is not in front,
 * say so: a notification (and a buzz on Android).
 *
 * askToPing() runs on the Make the song press, because browsers only let a tap
 * ask for notification permission. It asks once; a no is never asked again.
 * The desktop app needs no permission.
 */
const isDesktop = () => typeof window !== 'undefined' && !!window.lyricistAPI;
const canNotify = () => typeof window !== 'undefined' && 'Notification' in window;

export function askToPing() {
  if (isDesktop() || !canNotify()) return;
  try {
    if (Notification.permission === 'default') Notification.requestPermission().catch(() => {});
  } catch { /* old Safari: callback form only; skip */ }
}

export function pingSongDone(title) {
  if (typeof document === 'undefined' || (!document.hidden && document.hasFocus())) return;
  const body = title ? `"${title}" is ready to play.` : 'Your new song is ready to play.';
  try { navigator.vibrate?.([140, 80, 140]); } catch { /* not a phone */ }
  if (!canNotify()) return;
  try {
    if (isDesktop()) {
      const n = new Notification('Black Hole Studios', { body, tag: 'song-done' });
      n.onclick = () => window.focus();
      return;
    }
    if (Notification.permission !== 'granted') return;
    // Android Chrome refuses new Notification(); a service worker can show one.
    navigator.serviceWorker?.ready
      .then((reg) => reg.showNotification('Black Hole Studios', { body, tag: 'song-done', icon: './pwa/icon-192.png' }))
      .catch(() => {});
  } catch { /* notifications blocked: the song is still on screen */ }
}
