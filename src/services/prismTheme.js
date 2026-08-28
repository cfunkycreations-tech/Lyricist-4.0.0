/**
 * PRISM — one number, every neon colour in the app.
 *
 * There used to be a WebGL prism behind every tab whose palette rotated from
 * this same value; it was stripped with the rest of the artwork on 2026-08-27
 * (flat black now, everywhere), and this slider survives it because the neon
 * pinstripe under the active tab, the focus rings, the button strokes and
 * the type glow all still read the accent it writes.
 *
 * Anchors are HSL because rotating a hue is one addition. Rotating a hex is not.
 *
 * ══ WHAT THE COMMERCIAL REFACTOR ADDED ═══════════════════════════════════
 * The Obsidian & Razor Neon system has ONE switchable accent, --accent-neon,
 * and index.css drives every border, focus ring, glow, scrollbar and active
 * tab off it. This file is what writes it, from the same slider, across the
 * FULL SPECTRUM — the brief's "slider to change the color of the neon, full
 * spec prism".
 *
 * So one control still moves two things that used to be separate:
 *   - the legacy --lx-* interface anchors (unchanged, still rotating)
 *   - the razor-neon accent               (--accent-neon / --accent-rgb)
 *
 * --accent-rgb is the same colour as bare "r, g, b" components, because a
 * hairline at 12% and a glow at 55% have to be the SAME hue at two alphas, and
 * `rgba(var(--accent-rgb), 0.12)` is the only way to get that from one value.
 * Every rule in index.css that needs a translucent accent reads it. If this
 * ever goes out of step with --accent-neon the interface splits in two, so
 * they are written together, in one place, and nowhere else.
 */

const ANCHORS = {
  '--lx-emerald': [158, 84, 40],   // dark emerald, the lead
  '--lx-emerald-lit': [158, 80, 58],   // the glow only, used sparingly
  '--lx-green2': [152, 79, 44],   // the second green. formerly teal.
  '--lx-blue': [222, 100, 65],
  '--lx-violet': [262, 85, 71],
  '--lx-magenta': [305, 75, 66],
};

/**
 * WHERE THE ACCENT STARTS.
 *
 * 183.5°, not 184, and the half degree is not fussiness. #00F0FF — the electric
 * cyan index.css declares as the default token — is exactly
 * hsl(183.53 100% 50%). Rounding to 184 lands on rgb(0, 238, 255), which is a
 * different colour from the one the stylesheet says is the default, so the
 * slider at position zero would quietly disagree with the token it is supposed
 * to be sitting on. "Left is home" has to be literally true or the reset is not
 * a reset.
 */
const ACCENT_H0 = 183.5;
const ACCENT_S = 100;
const ACCENT_L = 50;

/** The five named accents from the design system, as slider positions. */
export const ACCENT_PRESETS = [
  { name: 'Electric Cyan', hex: '#00F0FF', t: 0 },
  { name: 'Razor Emerald', hex: '#10F0A0', t: ((160 - ACCENT_H0 + 360) % 360) / 360 },
  { name: 'Signal Amber', hex: '#FF9900', t: ((36 - ACCENT_H0 + 360) % 360) / 360 },
  { name: 'Crimson', hex: '#FF1A1A', t: ((0 - ACCENT_H0 + 360) % 360) / 360 },
  { name: 'Violet', hex: '#A855F7', t: ((271 - ACCENT_H0 + 360) % 360) / 360 },
];

/** Named pairs, checked against the hues they actually produce. */
export const PRISM_NAMES = [
  'Electric Cyan', 'Razor Emerald', 'Acid Lime', 'Signal Amber',
  'Crimson', 'Magenta', 'Violet', 'Electric Cyan',
];

/**
 * HSL to bare "r, g, b" components.
 *
 * Written out rather than leaned on the browser because --accent-rgb has to be
 * COMPONENTS, not a colour: `rgba(var(--x), 0.3)` only parses if var(--x) is
 * "0, 240, 255". Reading a computed style back would hand us "rgb(0, 240, 255)"
 * and every translucent rule in the app would silently fail to parse.
 */
function hslToRgb(h, s, l) {
  const S = s / 100;
  const L = l / 100;
  const k = (n) => (n + h / 30) % 12;
  const a = S * Math.min(L, 1 - L);
  const f = (n) => L - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)].map((v) => Math.round(v * 255));
}

/** The app-wide setting. Written by Settings, read by everything. */
export function getPrism() {
  const raw = Number(localStorage.getItem('lyricistPrism'));
  return Number.isFinite(raw) ? raw : 0;
}

export function prismName(t = getPrism()) {
  return PRISM_NAMES[Math.round(t * (PRISM_NAMES.length - 1))] || PRISM_NAMES[0];
}

/** The accent hex at rotation `t`, for anything that needs to show a swatch. */
export function accentHex(t = getPrism()) {
  const [r, g, b] = hslToRgb((ACCENT_H0 + t * 360) % 360, ACCENT_S, ACCENT_L);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** Paint the whole interface at rotation `t` (0..1). */
export function applyPrism(t = getPrism()) {
  const root = document.documentElement;
  const deg = t * 360;

  for (const [name, [h, s, l]] of Object.entries(ANCHORS)) {
    root.style.setProperty(name, `hsl(${(h + deg) % 360} ${s}% ${l}%)`);
  }
  // Panel edges and the type glow follow the lead colour, so frosted borders
  // never sit in last week's hue while the fill has moved on.
  root.style.setProperty('--lx-line', `hsla(${(158 + deg) % 360} 60% 70% / .16)`);
  root.style.setProperty('--lx-line-hot', `hsla(${(262 + deg) % 360} 70% 70% / .30)`);

  // ── THE RAZOR NEON ACCENT ──────────────────────────────────────────────
  // Both forms, written together. See the note at the top of this file for
  // why --accent-rgb cannot be derived from --accent-neon at read time.
  const accentH = (ACCENT_H0 + deg) % 360;
  const [r, g, b] = hslToRgb(accentH, ACCENT_S, ACCENT_L);
  root.style.setProperty('--accent-neon', `hsl(${accentH} ${ACCENT_S}% ${ACCENT_L}%)`);
  root.style.setProperty('--accent-rgb', `${r}, ${g}, ${b}`);
}

/**
 * Wire it up once, at boot. Repaints whenever Settings fires the event, and
 * also on `storage` so a second window stays in step with the first.
 */
export function startPrism() {
  applyPrism();
  window.addEventListener('lyricist-prism', () => applyPrism());
  window.addEventListener('storage', (e) => {
    if (e.key === 'lyricistPrism') applyPrism();
  });
}
