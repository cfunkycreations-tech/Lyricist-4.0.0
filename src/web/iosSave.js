/**
 * SAVING FILES FROM THE INSTALLED iPHONE APP.
 *
 * Every Download and Export button in the app ends in the same move: make a
 * Blob, point an <a download> at it, click it. Chrome, Android and desktop
 * Safari save the file. An iPhone home-screen app does not: it opens the file
 * in a full-screen viewer with no way back to the app.
 *
 * So, only in the installed iPhone app, those clicks open the share sheet
 * instead, with the real file in it: Save to Files, AirDrop, Messages, the
 * Music app. Nothing else changes, and none of the 15-odd download buttons had
 * to be touched.
 *
 * How: object URLs made by URL.createObjectURL are remembered with their Blob,
 * so a click can hand the File to navigator.share synchronously, inside the
 * tap, which iOS requires. If iOS refuses (the tap was too long ago, or the
 * file type cannot be shared) the normal click goes ahead as before.
 */

const isPhoneApp = () => {
  const ios = /iP(hone|od|ad)/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const installed = navigator.standalone === true
    || window.matchMedia?.('(display-mode: standalone)').matches;
  return ios && installed && typeof navigator.share === 'function' && typeof navigator.canShare === 'function';
};

export function installPhoneSave() {
  if (typeof window === 'undefined') return;
  if (!/^https?:$/.test(window.location.protocol) || window.lyricistAPI) return;
  if (!isPhoneApp()) return;

  const blobs = new Map();
  const make = URL.createObjectURL.bind(URL);
  const revoke = URL.revokeObjectURL.bind(URL);
  URL.createObjectURL = (obj) => {
    const url = make(obj);
    if (obj instanceof Blob) blobs.set(url, obj);
    return url;
  };
  // Let go a minute late: most buttons revoke straight after the click, while
  // the share sheet (or the fallback click) still needs the file.
  URL.revokeObjectURL = (url) => { setTimeout(() => { blobs.delete(url); revoke(url); }, 60000); };

  const fileFor = (a) => {
    const href = a.getAttribute('href') || '';
    let blob = blobs.get(href);
    if (!blob && href.startsWith('data:')) blob = fromDataUrl(href);
    if (!blob) return null;
    const name = a.getAttribute('download') || 'Lyricist Pro file';
    return new File([blob], name, { type: blob.type || 'application/octet-stream' });
  };

  const share = (a) => {
    const file = fileFor(a);
    if (!file || !navigator.canShare({ files: [file] })) return false;
    navigator.share({ files: [file] }).catch((err) => {
      if (err?.name !== 'AbortError') plainClick.call(a);   // refused: fall back
    });
    return true;
  };

  // Buttons that build an <a> in code and call .click() on it.
  const plainClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function click() {
    if (this.hasAttribute('download') && share(this)) return;
    plainClick.call(this);
  };

  // Real <a download> links on the page.
  document.addEventListener('click', (e) => {
    const a = e.target?.closest?.('a[download]');
    if (a && share(a)) e.preventDefault();
  }, true);
}

function fromDataUrl(href) {
  try {
    const [head, body] = href.split(',', 2);
    const type = (head.match(/^data:([^;,]*)/) || [])[1] || 'application/octet-stream';
    if (!/;base64/i.test(head)) return new Blob([decodeURIComponent(body)], { type });
    const bin = atob(body);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type });
  } catch {
    return null;
  }
}
