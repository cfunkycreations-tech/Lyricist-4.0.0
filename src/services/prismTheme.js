/**
 * PRISM — one number, the accent colour of the whole app.
 *
 * There used to be a WebGL prism behind every tab whose palette rotated from
 * this same value; it was stripped with the rest of the artwork on 2026-08-27
 * (flat black now, everywhere), and this slider survives it because the
 * pinstripe under the active tab, the focus rings and the button strokes all
 * still read the accent it writes.
 *
 * index.css drives every border, focus ring, scrollbar and active tab off ONE
 * switchable accent, --accent-neon. This file is what writes it, from the
 * slider in Settings.
 *
 * --accent-rgb is the same colour as bare "r, g, b" components, because a
 * hairline at 12% and a ring at 55% have to be the SAME hue at two alphas, and
 * `rgba(var(--accent-rgb), 0.12)` is the only way to get that from one value.
 * If this ever goes out of step with --accent-neon the interface splits in two,
 * so they are written together, in one place, and nowhere else.
 *
 * ══ NO CYAN, NO PURPLE ═══════════════════════════════════════════════════
 * Chris, 2026-09-15: "get rid of the cyan and purple colors sick of them".
 * The slider used to run the full wheel starting at electric cyan. It now runs
 * one arc of the wheel, crimson → red → amber → lime → emerald, so no position
 * on it can land on cyan, blue, violet or magenta. Home is amber, the FAF OpSec
 * signal colour.
 */

// The legacy --lx-* anchors. They no longer rotate: rotating a green by the
// slider is exactly how it used to end up purple. Violet and magenta keep their
// names because OneManBand, ScrewShop and WaveSlicer read them, but they are
// the signal amber and steel now. So are the emeralds (2026-09-27): only the
// Chopped & Screwed tab read them, and its neon green was the last accent that wasn't amber.
const ANCHORS = {
  '--lx-emerald': [36, 78, 40],
  '--lx-emerald-lit': [36, 78, 58],
  '--lx-green2': [36, 70, 44],
  '--lx-blue': [36, 78, 58],
  '--lx-violet': [36, 78, 58],
  '--lx-magenta': [216, 8, 64],
};

/** The arc the slider covers: from ARC_START, ARC_SPAN degrees forward. */
const ARC_START = 340;
const ARC_SPAN = 180;
// FAF OpSec: the accent is a signal colour, not a neon. 78% / 58% keeps the
// hue clean and readable on graphite.
const ACCENT_S = 78;
const ACCENT_L = 58;

const hueToT = (h) => (((h - ARC_START + 360) % 360) / ARC_SPAN);
const tToHue = (t) => (ARC_START + Math.min(1, Math.max(0, t)) * ARC_SPAN) % 360;

/** Where the slider sits on a fresh install: amber. */
export const PRISM_HOME = hueToT(36);

/** The named accents, as slider positions. */
export const ACCENT_PRESETS = [
  { name: 'Amber', hex: '#E7A540', t: PRISM_HOME },
  { name: 'Red', hex: '#E74040', t: hueToT(0) },
  { name: 'Lime', hex: '#A5E740', t: hueToT(85) },
  { name: 'Emerald', hex: '#40E7AD', t: hueToT(158) },
];

/** Names along the arc, left to right: 340°, 6°, 31°, 57°, 83°, 109°, 134°, 160°.
    The 31° slot is the one amber home rounds to, so it is called Amber. */
export const PRISM_NAMES = [
  'Crimson', 'Red', 'Amber', 'Gold', 'Lime', 'Green', 'Jade', 'Emerald',
];

/**
 * HSL to bare "r, g, b" components.
 *
 * Written out rather than leaned on the browser because --accent-rgb has to be
 * COMPONENTS, not a colour: `rgba(var(--x), 0.3)` only parses if var(--x) is
 * "231, 165, 64". Reading a computed style back would hand us "rgb(...)" and
 * every translucent rule in the app would silently fail to parse.
 */
function hslToRgb(h, s, l) {
  const S = s / 100;
  const L = l / 100;
  const k = (n) => (n + h / 30) % 12;
  const a = S * Math.min(L, 1 - L);
  const f = (n) => L - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)].map((v) => Math.round(v * 255));
}

// The slider's meaning changed with the arc. A value saved before it (0 was the
// old cyan default) would land somewhere arbitrary, so it is reset to home once.
const ARC_KEY = 'lyricistPrismArc';

/** The app-wide setting. Written by Settings, read by everything. */
export function getPrism() {
  const stored = localStorage.getItem('lyricistPrism');
  if (stored === null || localStorage.getItem(ARC_KEY) !== '1') return PRISM_HOME;
  const raw = Number(stored);
  return Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : PRISM_HOME;
}

export function prismName(t = getPrism()) {
  return PRISM_NAMES[Math.round(t * (PRISM_NAMES.length - 1))] || PRISM_NAMES[0];
}

/** The accent hex at position `t`, for anything that needs to show a swatch. */
export function accentHex(t = getPrism()) {
  const [r, g, b] = hslToRgb(tToHue(t), ACCENT_S, ACCENT_L);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** Paint the whole interface at position `t` (0..1). */
export function applyPrism(t = getPrism()) {
  const root = document.documentElement;

  for (const [name, [h, s, l]] of Object.entries(ANCHORS)) {
    root.style.setProperty(name, `hsl(${h} ${s}% ${l}%)`);
  }
  root.style.setProperty('--lx-line', 'hsla(36 78% 70% / .16)');
  root.style.setProperty('--lx-line-hot', 'hsla(216 8% 70% / .30)');

  // Both forms, written together. See the note at the top of this file.
  const accentH = tToHue(t);
  const [r, g, b] = hslToRgb(accentH, ACCENT_S, ACCENT_L);
  root.style.setProperty('--accent-neon', `hsl(${accentH} ${ACCENT_S}% ${ACCENT_L}%)`);
  root.style.setProperty('--accent-rgb', `${r}, ${g}, ${b}`);
}

/**
 * Wire it up once, at boot. Repaints whenever Settings fires the event, and
 * also on `storage` so a second window stays in step with the first.
 */
export function startPrism() {
  if (localStorage.getItem(ARC_KEY) !== '1') {
    localStorage.setItem('lyricistPrism', String(PRISM_HOME));
    localStorage.setItem(ARC_KEY, '1');
  }
  applyPrism();
  window.addEventListener('lyricist-prism', () => applyPrism());
  window.addEventListener('storage', (e) => {
    if (e.key === 'lyricistPrism') applyPrism();
  });
}
