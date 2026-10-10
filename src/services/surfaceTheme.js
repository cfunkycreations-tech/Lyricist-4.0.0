/**
 * SURFACE: the colour of the glass itself, one slider in Settings.
 *
 * Chris, 2026-10-10: "I'm getting tired of the red ... another slider that
 * adjusts the entire colour. From red to blue, dark blue, black, gray, white,
 * light gray. People might want a lighter app."
 *
 * The obsidian glass in materials.css reflects one coloured light. These
 * stops swap that light (and the tint of the gloss on top of it). Red is the
 * original swatch, value for value. The two light stops flip the whole
 * interface (html.surface-light in materials.css): a real light theme would
 * mean re-colouring hundreds of hand-set styles, and an inverted dark theme
 * keeps every contrast it already had.
 */
const KEY = 'lyricistSurface';

// [r, g, b] strings. light = the reflected light, floor = the same light on
// the floor, gloss / gloss2 / streak / key = the tints of the reflections,
// lift = a grey wash over the black glass (r, g, b, alpha).
const RED = {
  lift: '0, 0, 0, 0',
  light: '225, 28, 44', floor: '210, 24, 40',
  gloss: '255, 120, 130', gloss2: '255, 90, 100', streak: '255, 110, 120', key: '255, 140, 150',
};
const tint = (light, gloss, lift = '0, 0, 0, 0') => ({ lift, light, floor: light, gloss, gloss2: gloss, streak: gloss, key: gloss });
const NEUTRAL = tint('0, 0, 0', '255, 255, 255');

export const SURFACES = [
  { name: 'Red', swatch: '#8c1420', ...RED },
  { name: 'Blue', swatch: '#1e5fd0', ...tint('30, 110, 235', '130, 180, 255') },
  { name: 'Dark Blue', swatch: '#14286e', ...tint('20, 45, 140', '90, 120, 210') },
  { name: 'Black', swatch: '#050506', ...NEUTRAL },
  { name: 'Gray', swatch: '#5b5e66', ...tint('170, 175, 185', '255, 255, 255', '120, 124, 132, 0.30') },
  { name: 'Light Gray', swatch: '#d4d5d8', ...NEUTRAL, invert: 0.88 },
  { name: 'White', swatch: '#f4f4f5', ...NEUTRAL, invert: 1 },
];

export function getSurface() {
  const n = Number(localStorage.getItem(KEY));
  return Number.isInteger(n) && n >= 0 && n < SURFACES.length ? n : 0;
}

export function applySurface(i = getSurface()) {
  const s = SURFACES[i] || SURFACES[0];
  const root = document.documentElement;
  for (const k of ['lift', 'light', 'floor', 'gloss', 'gloss2', 'streak', 'key']) {
    if (typeof s[k] === 'string') root.style.setProperty(`--surface-${k}`, s[k]);
  }
  root.classList.toggle('surface-light', Boolean(s.invert));
  root.style.setProperty('--surface-brightness', String(s.invert || 1));
}

export function setSurface(i) {
  try { localStorage.setItem(KEY, String(i)); } catch { /* storage blocked */ }
  applySurface(i);
}

export function startSurface() {
  applySurface();
  window.addEventListener('storage', (e) => { if (e.key === KEY) applySurface(); });
}
