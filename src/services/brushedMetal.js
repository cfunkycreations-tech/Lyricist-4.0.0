/**
 * Brushed black nickel, drawn at the screen's own pixel density.
 *
 * Chris, 2026-09-28: "I WANT IT DARKER THAN THE MOCK UP! BLACKER AND I WANT THE
 * BRUSHED EFFECT FINER IN DETAIL". The SVG feTurbulence grain in materials.css
 * could not do that: it rendered in CSS pixels (so every line was at least one
 * CSS pixel tall, two or three device pixels on a scaled screen), it read grey,
 * and the 420px tile did not wrap, so a seam ran down the floor every 420px.
 *
 * This draws the grain the way a brushing wheel leaves it: every device-pixel
 * row gets its own tone, and along the row that tone drifts in streaks of
 * different lengths. The tile wraps in x (the streak blur runs around the end)
 * and in y (rows are independent), so there is no seam. Light hairlines are
 * white at a low alpha and dark ones are black, so the same tile sits on any
 * base colour; the gradients under it in materials.css set how black it is.
 *
 * The result goes on :root as --mat-brush, replacing the SVG fallback, as an
 * image-set at the device pixel ratio so one image pixel is one screen pixel.
 */

const TILE_W = 900;   // CSS px; long enough that the repeat never reads
const TILE_H = 300;

function makeRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One row's streaks: white noise box-blurred around the end of the row, so
 *  the row joins itself and the tile has no seam. Unit variance out. */
function streakRow(rand, w, radius, out) {
  const noise = new Float32Array(w);
  for (let x = 0; x < w; x++) noise[x] = rand() * 2 - 1;
  const span = radius * 2 + 1;
  let sum = 0;
  for (let k = -radius; k <= radius; k++) sum += noise[(k + w) % w];
  const norm = Math.sqrt(3 / span);   // uniform(-1,1) has variance 1/3
  for (let x = 0; x < w; x++) {
    out[x] = sum * norm;
    sum += noise[(x + radius + 1) % w] - noise[(x - radius + w) % w];
  }
}

export function drawBrushedTile(dpr = 1, seed = 20260928) {
  const w = Math.round(TILE_W * dpr);
  const h = Math.round(TILE_H * dpr);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(w, h);
  const px = img.data;
  const rand = makeRandom(seed);
  const gauss = () => (rand() + rand() + rand() + rand() - 2) * 1.7320508;

  const longS = new Float32Array(w);
  const shortS = new Float32Array(w);
  for (let y = 0; y < h; y++) {
    const rowTone = gauss();                                   // the hairline itself
    streakRow(rand, w, Math.round((60 + rand() * 220) * dpr), longS);   // long pulls
    streakRow(rand, w, Math.round((6 + rand() * 18) * dpr), shortS);    // short pulls
    for (let x = 0; x < w; x++) {
      const v = rowTone * 0.7 + longS[x] * 0.6 + shortS[x] * 0.2 + (rand() - 0.5) * 0.15;
      const i = (y * w + x) * 4;
      if (v > 0) {
        px[i] = px[i + 1] = px[i + 2] = 255;
        px[i + 3] = Math.min(255, v * v * 5 + v * 3);           // bright lines stay rare
      } else {
        px[i] = px[i + 1] = px[i + 2] = 0;
        px[i + 3] = Math.min(255, -v * 40);
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

let installed = null;

/** Draws the tile once and points --mat-brush at it. Safe to call twice. */
export function installBrushedMetal() {
  if (installed || typeof document === 'undefined') return installed;
  const dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
  installed = new Promise((resolve) => {
    drawBrushedTile(dpr).toBlob((blob) => {
      if (!blob) return resolve(null);
      const url = URL.createObjectURL(blob);
      const value = `image-set(url("${url}") ${dpr}x)`;
      document.documentElement.style.setProperty('--mat-brush', value);
      resolve(value);
    }, 'image/png');
  });
  return installed;
}
