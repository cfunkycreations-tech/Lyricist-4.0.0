/**
 * Visualizer popout — Lyricist 4.2.0
 *
 * Sends the Butterchurn visualizer to another monitor.
 *
 * Why window.open and not a BrowserWindow built in main.js: Butterchurn
 * visualises a live AudioNode (`connectAudio(masterBus)`). A BrowserWindow is a
 * separate renderer with its own JS realm and its own Web Audio graph, so it
 * cannot see the master bus at all — the popout would render silent, motionless
 * graphics. A same-origin `window.open` child runs in the SAME renderer process
 * with a live `opener` reference, so we can hand it the AudioContext that is
 * already playing and it just works. That is the whole reason for this file.
 *
 * Works in a plain browser too (Chrome honours left/top across monitors), which
 * is what makes it testable without packaging Electron.
 */

/** Displays to offer. Electron gives real monitors; the browser gets one entry. */
export async function listDisplays() {
  const api = typeof window !== 'undefined' ? window.lyricistAPI : null;
  if (api?.listDisplays) {
    try {
      const rows = await api.listDisplays();
      if (Array.isArray(rows) && rows.length) return rows;
    } catch { /* fall through to the single-screen guess below */ }
  }
  // Browser fallback: no monitor enumeration without the Window Management
  // permission, so offer the one screen we can measure.
  const w = window.screen?.width || 1920;
  const h = window.screen?.height || 1080;
  return [{
    id: 'current',
    index: 1,
    label: 'This screen',
    bounds: { x: 0, y: 0, width: w, height: h },
    scaleFactor: window.devicePixelRatio || 1,
    isPrimary: true,
  }];
}

/** "Screen 2 · 2560x1440 (main)" — identifies a monitor without model names. */
export function describeDisplay(d) {
  const res = d.bounds ? `${d.bounds.width}x${d.bounds.height}` : '';
  const name = /^screen \d+$/i.test(d.label) ? `Screen ${d.index}` : d.label;
  return [name, res, d.isPrimary ? '(main)' : ''].filter(Boolean).join(' · ');
}

const POPOUT_NAME = 'lyricist-visualizer';

/**
 * Open the popout on `display` and return { win, canvas } once its document is
 * ready, or throw with a reason the UI can show. The caller creates the
 * Butterchurn instance against `canvas` using the parent's AudioContext.
 */
export function openPopout(display, { onClose } = {}) {
  const b = display?.bounds || { x: 0, y: 0, width: 1280, height: 720 };
  const features = [
    `left=${Math.round(b.x)}`,
    `top=${Math.round(b.y)}`,
    `width=${Math.round(b.width)}`,
    `height=${Math.round(b.height)}`,
    'menubar=no', 'toolbar=no', 'location=no', 'status=no',
  ].join(',');

  const win = window.open('', POPOUT_NAME, features);
  if (!win) throw new Error('The popout was blocked. Allow pop-ups for Lyricist and try again.');

  // A reused window (same name) already has our markup — wipe it so we never
  // stack two canvases on top of each other.
  win.document.open();
  win.document.write(`<!doctype html><html><head><meta charset="utf-8">
<title>Lyricist Visualizer</title><style>
  html,body{margin:0;height:100%;background:#000;overflow:hidden;
    font-family:'Segoe UI',system-ui,sans-serif;cursor:default}
  canvas{display:block;width:100vw;height:100vh}
  #bar{position:fixed;top:0;left:0;right:0;padding:10px 14px;display:flex;gap:10px;
    align-items:center;justify-content:space-between;color:#e6e8eb;font-size:12px;
    background:linear-gradient(180deg,rgba(0,0,0,.75),transparent);
    opacity:0;transition:opacity .2s}
  body:hover #bar{opacity:1}
  #close{background:rgba(248,113,113,.15);border:1px solid rgba(248,113,113,.5);
    color:#fca5a5;border-radius:999px;padding:5px 14px;cursor:pointer;font-size:12px}
  #close:hover{background:rgba(248,113,113,.3)}
  #name{font-family:'JetBrains Mono',monospace;color:rgba(231,165,64,.85);
    overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:70%}
</style></head><body>
  <canvas id="viz"></canvas>
  <div id="bar"><span id="name"></span><button id="close">Close (Esc)</button></div>
</body></html>`);
  win.document.close();

  const canvas = win.document.getElementById('viz');
  const close = () => { try { win.close(); } catch { /* already gone */ } };
  win.document.getElementById('close').addEventListener('click', close);
  win.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  // Closing the parent must not strand a fullscreen window on another monitor.
  window.addEventListener('beforeunload', close);
  if (onClose) win.addEventListener('unload', () => onClose());

  return { win, canvas, close };
}

/** Match the drawing buffer to the popout's real pixel size. */
export function sizePopoutCanvas(win, canvas, viz) {
  const dpr = Math.min(win.devicePixelRatio || 1, 2);
  const w = Math.max(320, Math.round(win.innerWidth * dpr));
  const h = Math.max(240, Math.round(win.innerHeight * dpr));
  canvas.width = w;
  canvas.height = h;
  if (viz) viz.setRendererSize(w, h);
  return { w, h };
}
