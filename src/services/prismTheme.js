/**
 * PRISM — one number, every colour in the app.
 *
 * The shader in PrismBackground rotates its own palette from this value. This
 * rotates the INTERFACE by the same amount, so the panels, the type glow and
 * the buttons never disagree with the liquid behind them. In the approved
 * mockup they moved together and that is the whole effect; rotating only the
 * background made the two fight.
 *
 * Anchors are HSL because rotating a hue is one addition. Rotating a hex is not.
 * The lead sits at 158 (emerald) and its partner at 262 (violet), roughly a
 * hundred degrees apart, and that gap is preserved wherever the slider goes —
 * which is why every stop still looks like a deliberate pair rather than a
 * random wash.
 *
 * Emerald leads on purpose and the old teal was pulled back to 152. Chris:
 * "I want more emerald green, less of a teal color, like a dark emerald green."
 */

const ANCHORS = {
  '--lx-emerald': [158, 84, 40],   // dark emerald, the lead
  '--lx-emerald-lit': [158, 80, 58],   // the glow only, used sparingly
  '--lx-green2': [152, 79, 44],   // the second green. formerly teal.
  '--lx-blue': [222, 100, 65],
  '--lx-violet': [262, 85, 71],
  '--lx-magenta': [305, 75, 66],
};

/** Named pairs, checked against the hues they actually produce. */
export const PRISM_NAMES = [
  'Emerald & Violet', 'Blue & Magenta', 'Violet & Ember',
  'Rose & Lime', 'Amber & Green', 'Lime & Cyan', 'Emerald & Violet',
];

/** The app-wide setting. Written by Settings, read by everything. */
export function getPrism() {
  const raw = Number(localStorage.getItem('lyricistPrism'));
  return Number.isFinite(raw) ? raw : 0;
}

export function prismName(t = getPrism()) {
  return PRISM_NAMES[Math.round(t * (PRISM_NAMES.length - 1))] || PRISM_NAMES[0];
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
