/**
 * THE SKYLINE SCENE for the logo banner. Chris, 2026-10-11: "make the city
 * skyline look more like the logo's rendition, more like the actual Austin
 * skyline", from a photo he sent of downtown across Lady Bird Lake at dusk,
 * plus "the old moon towers, blinking red lights on top of all towers, a
 * kayaker across Lady Bird Lake, Willie Nelson statue for sure, grackles on
 * the power line... Capitol dome, UT Tower, Frost Bank Tower, Pennybacker
 * Bridge... go off."
 *
 * Drawn the way the logo draws its skyline: solid black shapes with one
 * glowing orange edge round the outside. The towers are taken from that photo
 * (x across, y down, in the photo's pixels, its tree line at y 118) and split
 * at Congress Avenue, where the logo sits: west of it to the left, east to
 * the right.
 *
 *   back  — the towers, the Capitol, UT Tower, the moonlight towers, the
 *           trees, Pennybacker Bridge off to the west.
 *   lake  — the skyline's reflection, rippling; a kayaker now and then.
 *   front — Congress Avenue Bridge (bats come out from under it), the shore,
 *           Stevie Ray Vaughan on the left, Willie Nelson on the right, the
 *           power line with the grackles on it.
 *   live  — red lights blinking on every tall tower, the moonlight towers'
 *           lamps, stars, the bats, the grackles, an armadillo along the shore.
 */

const LOGO_ASPECT = 605 / 660;
const BASE_Y = 118;          // the photo's tree line
const CX_L = 263, CX_R = 272; // Congress Avenue, where the logo covers it
const SX = 1.45, SY = 1.6;   // photo pixels → banner units

// [x0, x1, top, kind, a, b] in photo pixels.
const WEST = [
  [20, 28, 87],
  [28, 55, 63, 'sail', 50],          // Google's tower, the sail
  [55, 68, 61, 'step'],
  [70, 79, 78],
  [79, 86, 80],
  [86, 101, 73, 'spire', 89, 64],
  [101, 112, 99], [112, 122, 103], [122, 130, 97],
  [130, 151, 51, 'slant'],
  [150, 155, 60],
  [154, 171, 70],
  [171, 187, 49, 'step'],
  [187, 197, 58],
  [197, 213, 75],
  [213, 235, 70, 'step'],
  [234, 244, 57, 'step'],
  [244, 254, 42, 'crown', 31],
  [254, 263, 82],
];
const EAST = [
  [272, 284, 75],
  [284, 296, 80, 'frost', 64],       // Frost Bank Tower, the crown
  [296, 304, 88],
  [304, 326, 71, 'step'],
  [326, 333, 67], [332, 344, 61, 'step'],
  [344, 364, 98],
  [364, 397, 88, 'dome', 79],
  [397, 410, 86],
  [410, 446, 71, 'step'],
  [446, 464, 100], [464, 482, 96],
  [482, 500, 74, 'spire', 489, 56],
  [499, 525, 6, 'waterline'],        // Waterline, the tallest in Texas
  [525, 553, 79],
  [552, 568, 39, 'step'],
];

function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function edgeGrad(g, top, bottom) {
  const gr = g.createLinearGradient(0, top, 0, bottom);
  gr.addColorStop(0, '#FFE0B0');
  gr.addColorStop(0.35, '#FFAE62');
  gr.addColorStop(1, '#E5512A');
  return gr;
}

/** Everything's outline first, then everything's fill: only the outside edge
 *  of the whole group is left glowing, like the logo. */
function outlined(g, shapes, { u, dpr, stroke, width = 2, glow = 7 }) {
  g.save();
  g.lineJoin = 'round';
  g.strokeStyle = stroke;
  g.lineWidth = width * 2 * u;
  g.shadowColor = 'rgba(255, 110, 40, .85)';
  g.shadowBlur = glow * u * dpr;
  for (const s of shapes) g.stroke(s.p || s);
  g.shadowBlur = 0;
  g.shadowColor = 'transparent';
  // Each shape filled on its own, then all of them as one, so no seams show
  // where two shapes touch.
  g.fillStyle = '#000';
  const all = new Path2D();
  for (const s of shapes) {
    g.fill(s.p || s, s.rule || 'nonzero');
    if (!s.rule) all.addPath(s);
  }
  g.fill(all);
  g.restore();
}

/* ── tower shapes ─────────────────────────────────────────────────────── */

function tower(p, kind, x0, x1, top, b, u, y, a, bb) {
  const w = x1 - x0;
  switch (kind) {
    case 'step': {
      const s = Math.min(7 * u, (b - top) * 0.1);
      p.rect(x0, top + s, w, b - top - s);
      p.rect(x0 + w * 0.16, top, w * 0.68, s + 0.5);
      break;
    }
    case 'spire':
      p.rect(x0, top, w, b - top);
      p.rect(a - 0.7 * u, y(bb), 1.4 * u, top - y(bb) + 1);
      break;
    case 'sail':
      p.moveTo(x0, b);
      p.lineTo(x0, y(106));
      p.quadraticCurveTo(x0 + w * 0.42, y(78), a, top);
      p.lineTo(x1, top + 5 * u);
      p.lineTo(x1, b);
      p.closePath();
      break;
    case 'slant':
      p.moveTo(x0, b);
      p.lineTo(x0, top);
      p.lineTo(x0 + w * 0.72, top - 2 * u);
      p.lineTo(x1, top + 7 * u);
      p.lineTo(x1, b);
      p.closePath();
      break;
    case 'crown': {
      const tip = y(a);
      p.rect(x0, top, w, b - top);
      p.rect(x0 + w * 0.18, top - 5 * u, w * 0.64, 5.5 * u);
      p.rect(x0 + w * 0.34, top - 9 * u, w * 0.32, 4.5 * u);
      p.rect(x0 + w / 2 - 0.6 * u, tip, 1.2 * u, top - 9 * u - tip + 1);
      break;
    }
    case 'frost': {   // stepped shoulders, two points either side, the spire up the middle
      const t = y(a), c = top, h = c - t;
      p.moveTo(x0, b);
      p.lineTo(x0, c);
      p.lineTo(x0 + w * 0.1, c - h * 0.12);
      p.lineTo(x0 + w * 0.1, c - h * 0.3);
      p.lineTo(x0 + w * 0.24, c - h * 0.62);
      p.lineTo(x0 + w * 0.36, c - h * 0.44);
      p.lineTo(x0 + w * 0.44, c - h * 0.58);
      p.lineTo(x0 + w * 0.5, t);
      p.lineTo(x0 + w * 0.56, c - h * 0.58);
      p.lineTo(x0 + w * 0.64, c - h * 0.44);
      p.lineTo(x0 + w * 0.76, c - h * 0.62);
      p.lineTo(x0 + w * 0.9, c - h * 0.3);
      p.lineTo(x0 + w * 0.9, c - h * 0.12);
      p.lineTo(x1, c);
      p.lineTo(x1, b);
      p.closePath();
      break;
    }
    case 'dome':
      p.rect(x0, top, w, b - top);
      p.moveTo(x0 + w * 0.1, top + 1);
      p.bezierCurveTo(x0 + w * 0.12, y(a), x1 - w * 0.12, y(a), x1 - w * 0.1, top + 1);
      p.closePath();
      break;
    case 'waterline': {   // glass base, the tall patterned shaft, the round cap
      const mid = y(52);
      p.rect(x0, mid, w, b - mid);
      p.rect(x0 + w * 0.08, y(13), w * 0.84, mid - y(13) + 1);
      p.moveTo(x0 + w * 0.14, y(13) + 1);
      p.bezierCurveTo(x0 + w * 0.16, top - 1 * u, x1 - w * 0.16, top - 1 * u, x1 - w * 0.14, y(13) + 1);
      p.closePath();
      break;
    }
    default:
      p.rect(x0, top, w, b - top);
  }
}

// Where the red light goes on a tower.
function towerTip(kind, x0, x1, top, u, y, a, bb) {
  if (kind === 'spire') return [a, y(bb)];
  if (kind === 'crown' || kind === 'frost') return [(x0 + x1) / 2, y(a)];
  if (kind === 'sail') return [a, top];
  if (kind === 'waterline') return [(x0 + x1) / 2, top - 1 * u];
  if (kind === 'slant') return [x0 + (x1 - x0) * 0.72, top - 2 * u];
  return [(x0 + x1) / 2, top];
}

/* ── landmarks ────────────────────────────────────────────────────────── */

function capitol(p, cx, b, u) {   // wings, pediment, drum, the dome, lantern, the Goddess
  const r = (x, y, w, h) => p.rect(cx + x * u, b - y * u - h * u, w * u, h * u);
  r(-38, 0, 76, 20);
  r(-40, 0, 9, 25); r(31, 0, 9, 25);
  r(-12, 20, 24, 6);
  r(-9, 26, 18, 9);
  p.moveTo(cx - 9.5 * u, b - 35 * u);
  p.bezierCurveTo(cx - 9.5 * u, b - 47 * u, cx - 4 * u, b - 53 * u, cx, b - 55 * u);
  p.bezierCurveTo(cx + 4 * u, b - 53 * u, cx + 9.5 * u, b - 47 * u, cx + 9.5 * u, b - 35 * u);
  p.closePath();
  r(-1.8, 54, 3.6, 6);
  p.moveTo(cx - 2.4 * u, b - 60 * u);
  p.quadraticCurveTo(cx, b - 64 * u, cx + 2.4 * u, b - 60 * u);
  p.closePath();
  r(-0.5, 63, 1, 5);
  r(-0.5, 66, 2.2, 0.8);
}

function utTower(p, cx, b, u) {   // the Main Building, the shaft, the colonnade, the little temple
  const r = (x, y, w, h) => p.rect(cx + x * u, b - y * u - h * u, w * u, h * u);
  r(-20, 0, 40, 15);
  r(-6, 15, 12, 46);
  r(-7, 52, 14, 3);
  r(-7.5, 55, 15, 1.5);
  r(-6, 56.5, 1.6, 7); r(-2.4, 56.5, 1.6, 7); r(0.8, 56.5, 1.6, 7); r(4.4, 56.5, 1.6, 7);
  r(-7, 63.5, 14, 2);
  r(-3.4, 65.5, 6.8, 3.5);
  p.moveTo(cx - 3.4 * u, b - 69 * u);
  p.quadraticCurveTo(cx, b - 74 * u, cx + 3.4 * u, b - 69 * u);
  p.closePath();
  r(-0.4, 73, 0.8, 3);
}

function moonTower(g, cx, b, u, stroke) {   // 165 ft of iron lattice, the ring of lamps on top
  const h = 118 * u, bw = 5 * u, tw = 1.2 * u;
  g.save();
  g.strokeStyle = stroke;
  g.lineWidth = 1 * u;
  g.shadowColor = 'rgba(255, 110, 40, .7)';
  g.shadowBlur = 4 * u;
  g.beginPath();
  g.moveTo(cx - bw, b); g.lineTo(cx - tw, b - h);
  g.moveTo(cx + bw, b); g.lineTo(cx + tw, b - h);
  const n = 16;
  for (let i = 0; i < n; i++) {
    const y0 = b - (h * i) / n, y1 = b - (h * (i + 1)) / n;
    const w0 = bw - (bw - tw) * (i / n), w1 = bw - (bw - tw) * ((i + 1) / n);
    g.moveTo(cx - w0, y0); g.lineTo(cx + w1, y1);
    g.moveTo(cx + w0, y0); g.lineTo(cx - w1, y1);
  }
  g.moveTo(cx - 5 * u, b - h); g.lineTo(cx + 5 * u, b - h);
  g.moveTo(cx - 4 * u, b - h - 3 * u); g.lineTo(cx + 4 * u, b - h - 3 * u);
  g.moveTo(cx, b - h); g.lineTo(cx, b - h - 7 * u);
  g.stroke();
  g.restore();
  return [cx, b - h - 1.5 * u];
}

function pennybacker(shapes, lines, L, R, b, u) {   // limestone bluffs, the deck, the steel arch over it
  const W = R - L;
  const hill = new Path2D();
  hill.moveTo(L - 2 * u, b);
  hill.lineTo(L - 2 * u, b - 52 * u);
  hill.bezierCurveTo(L + W * 0.08, b - 58 * u, L + W * 0.14, b - 46 * u, L + W * 0.2, b - 44 * u);
  hill.lineTo(L + W * 0.23, b - 36 * u);
  hill.lineTo(L + W * 0.25, b - 20 * u);
  hill.lineTo(L + W * 0.27, b);
  hill.closePath();
  hill.moveTo(R - W * 0.27, b);
  hill.lineTo(R - W * 0.25, b - 22 * u);
  hill.lineTo(R - W * 0.23, b - 36 * u);
  hill.lineTo(R - W * 0.2, b - 42 * u);
  hill.bezierCurveTo(R - W * 0.12, b - 46 * u, R - W * 0.06, b - 34 * u, R + 2 * u, b - 28 * u);
  hill.lineTo(R + 2 * u, b);
  hill.closePath();
  shapes.push(hill);

  const dL = L + W * 0.2, dR = R - W * 0.2, dy = b - 38 * u;
  const deck = new Path2D();
  deck.rect(dL, dy, dR - dL, 2.6 * u);
  shapes.push(deck);

  const aL = L + W * 0.235, aR = R - W * 0.235, rise = 34 * u, th = 3.2 * u;
  const arch = new Path2D();
  const mid = (aL + aR) / 2;
  arch.moveTo(aL, dy + 2 * u);
  arch.quadraticCurveTo(mid, dy - rise * 2, aR, dy + 2 * u);
  arch.lineTo(aR - th, dy + 2 * u);
  arch.quadraticCurveTo(mid, dy - rise * 2 + th * 2.2, aL + th, dy + 2 * u);
  arch.closePath();
  shapes.push(arch);

  // Hangers from the arch down to the deck.
  for (let x = aL + 6 * u; x < aR - 5 * u; x += 5.5 * u) {
    const f = (x - aL) / (aR - aL);
    const yArch = dy + 2 * u + (-rise * 2) * 2 * f * (1 - f) + th;
    if (yArch < dy - 1.5 * u) lines.push([x, yArch, x, dy]);
  }
}

/* ── front: bridge, shore, statues, poles ─────────────────────────────── */

function congressBridge(L, R, top, water, u) {   // the deck on its row of arches
  const p = new Path2D();
  p.rect(L, top, R - L, water - top);
  const span = 24 * u, pier = 4 * u;
  const n = Math.max(2, Math.floor((R - L) / span));
  const s = (R - L) / n;
  for (let i = 0; i < n; i++) {
    const a = L + i * s + pier / 2, c = L + (i + 1) * s - pier / 2;
    const spring = water - 2 * u, crown = top + 4.5 * u;
    p.moveTo(a, water + 0.5);
    p.lineTo(a, spring);
    p.bezierCurveTo(a, crown, c, crown, c, spring);
    p.lineTo(c, water + 0.5);
    p.closePath();
  }
  return { p, rule: 'evenodd' };
}

// Stevie Ray Vaughan at Auditorium Shores: the flat-brimmed hat, the long coat,
// the Strat held down by the neck at his side.
function srv(cx, foot, u, k = 0.94) {
  const p = new Path2D();
  const X = (x) => cx + x * u * k, Y = (y) => foot - y * u * k;
  const poly = (pts) => { p.moveTo(X(pts[0][0]), Y(pts[0][1])); for (const [x, y] of pts.slice(1)) p.lineTo(X(x), Y(y)); p.closePath(); };
  const ell = (x, y, rx, ry, rot = 0) => { p.moveTo(X(x + rx), Y(y)); p.ellipse(X(x), Y(y), rx * u * k, ry * u * k, rot, 0, Math.PI * 2); };
  p.rect(X(-17), Y(5), 34 * u * k, 5 * u * k);                         // plinth
  poly([[-8, 5], [-2, 5], [-2.5, 40], [-7, 40]]);                       // legs
  poly([[2, 5], [8, 5], [7, 40], [2.5, 40]]);
  poly([[-9, 5], [-1.5, 5], [-1.5, 8], [-9.5, 8]]);                     // boots
  poly([[1.5, 5], [9, 5], [9.5, 8], [1.5, 8]]);
  poly([[-10.5, 78], [10.5, 78], [12.5, 60], [14, 36], [-14, 36], [-12.5, 60]]);   // the coat
  poly([[-10.5, 77], [-8, 77], [-12.5, 52], [-15.5, 53]]);              // his right arm, down to the neck of the guitar
  poly([[8, 77], [10.5, 77], [14.5, 56], [12, 54]]);                    // his left arm
  p.rect(X(-2), Y(83), 4 * u * k, 6 * u * k);                           // neck
  ell(0, 86.5, 4.4, 5.4);                                               // head
  ell(0, 90.5, 13.5, 1.7);                                              // the brim
  poly([[-5.5, 91], [5.5, 91], [5, 97.5], [-5, 97.5]]);                 // the flat crown
  poly([[-14.5, 55], [-13.5, 55], [-15.5, 27], [-16.5, 27]]);           // guitar neck
  poly([[-15.5, 58], [-12.5, 58], [-13, 54.5], [-15, 54.5]]);           // headstock
  ell(-17, 19, 6.8, 8.6, 0.12);                                         // the Strat body
  ell(-20.5, 27.5, 1.8, 3.2, -0.4);                                     // its horns
  ell(-13.8, 26.5, 1.6, 2.6, 0.4);
  return p;
}

// Willie Nelson on Willie Nelson Boulevard: the long hair and braids, the
// headband, the beard, Trigger held by the neck.
function willie(cx, foot, u, k = 0.94) {
  const p = new Path2D();
  const X = (x) => cx + x * u * k, Y = (y) => foot - y * u * k;
  const poly = (pts) => { p.moveTo(X(pts[0][0]), Y(pts[0][1])); for (const [x, y] of pts.slice(1)) p.lineTo(X(x), Y(y)); p.closePath(); };
  const ell = (x, y, rx, ry, rot = 0) => { p.moveTo(X(x + rx), Y(y)); p.ellipse(X(x), Y(y), rx * u * k, ry * u * k, rot, 0, Math.PI * 2); };
  p.rect(X(-16), Y(5), 32 * u * k, 5 * u * k);                         // plinth
  poly([[-7.5, 5], [-1.5, 5], [-1.2, 44], [-8.8, 44]]);                 // jeans
  poly([[1.5, 5], [7.5, 5], [8.8, 44], [1.2, 44]]);
  poly([[-9, 5], [-0.8, 5], [-0.8, 8.5], [-10, 8.5]]);                  // boots
  poly([[0.8, 5], [9, 5], [10, 8.5], [0.8, 8.5]]);
  poly([[-9.5, 78], [9.5, 78], [11.5, 70], [10.5, 42], [-10.5, 42], [-11.5, 70]]);   // the shirt
  poly([[-9.5, 77], [-7, 77], [-10.5, 52], [-13.5, 53]]);               // his right arm
  poly([[7, 77], [9.5, 77], [15, 55], [12.5, 53]]);                     // his left, down to Trigger's neck
  p.rect(X(-2), Y(83), 4 * u * k, 5 * u * k);
  ell(0, 87.5, 5.6, 6.6);                                               // hair round the head
  ell(0, 88.5, 4.4, 5.2);                                               // head
  poly([[-3.2, 84], [3.2, 84], [2.2, 78.5], [-2.2, 78.5]]);             // beard
  poly([[-5.8, 91], [5.8, 91], [5.6, 93.2], [-5.6, 93.2]]);             // the headband
  poly([[-6, 87], [-3.8, 86], [-4.2, 63], [-6.2, 63]]);                 // the braids
  poly([[3.8, 86], [6, 87], [6.2, 63], [4.2, 63]]);
  ell(-5.2, 62.2, 1.2, 1.6); ell(5.2, 62.2, 1.2, 1.6);
  poly([[13, 55.5], [14.4, 55.5], [17.2, 31], [15.8, 31]]);             // Trigger: the neck,
  poly([[12.4, 59], [15, 59], [14.6, 55], [12.8, 55]]);                 // the headstock,
  ell(18.2, 21, 7.6, 8.4, -0.1);                                        // the big round body
  ell(17.2, 30.5, 5.8, 5.4, -0.1);
  return p;
}

function poles(L, R, foot, top, u) {   // two utility poles and the sagging line between
  const p = new Path2D();
  for (const x of [L, R]) {
    p.rect(x - 1.6 * u, top, 3.2 * u, foot - top);
    p.rect(x - 11 * u, top + 6 * u, 22 * u, 2.2 * u);
    p.rect(x - 9 * u, top + 3.6 * u, 1.4 * u, 2.4 * u);
    p.rect(x + 7.6 * u, top + 3.6 * u, 1.4 * u, 2.4 * u);
  }
  return p;
}

/* ── build once per size ──────────────────────────────────────────────── */

export function buildSkyline(W, H, dpr) {
  const mk = () => {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(W * dpr));
    c.height = Math.max(1, Math.round(H * dpr));
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    return [c, g];
  };
  const u = H / 248;
  const cx = W / 2;
  const base = H * 0.78;
  const shore = H * 0.9;
  const edge = (H * LOGO_ASPECT) / 2 * 0.84;
  const side = cx - edge;                       // banner px from the logo to each edge
  const y = (py) => base - (BASE_Y - py) * SY * u;
  const westX = (px) => cx - edge - (CX_L - px) * SX * u;
  const eastX = (px) => cx + edge + (px - CX_R) * SX * u;
  const rand = seeded(512);

  /* sky */
  const [sky, gs] = mk();
  const glow = gs.createRadialGradient(cx, base, 0, cx, base, W * 0.6);
  glow.addColorStop(0, 'rgba(255, 140, 50, .5)');
  glow.addColorStop(0.35, 'rgba(220, 80, 30, .26)');
  glow.addColorStop(0.75, 'rgba(120, 30, 30, .1)');
  glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  gs.fillStyle = glow;
  gs.fillRect(0, 0, W, base);
  const fade = gs.createLinearGradient(0, 0, 0, base);
  fade.addColorStop(0, 'rgba(0,0,0,1)');
  fade.addColorStop(0.5, 'rgba(0,0,0,.45)');
  fade.addColorStop(1, 'rgba(0,0,0,0)');
  gs.fillStyle = fade;
  gs.fillRect(0, 0, W, base);

  /* back */
  const [back, gb] = mk();
  const sb = edgeGrad(gb, 0, base);
  const shapes = [];
  const lights = [];
  const lines = [];

  // Low city along the bottom so no gap shows through.
  const low = new Path2D();
  for (const sgn of [-1, 1]) {
    let d = 0;
    const end = sgn < 0 ? (CX_L - 14) * SX * u : side;   // west of downtown it's Lake Austin
    while (d < end) {
      const w = (8 + rand() * 16) * u, h = (8 + rand() * 16) * u;
      const x = sgn < 0 ? cx - edge - d - w : cx + edge + d;
      low.rect(x, base - h, w, h + 1);
      d += w;
    }
  }
  shapes.push(low);

  for (const [list, toX] of [[WEST, westX], [EAST, eastX]]) {
    for (const [px0, px1, top, kind, a, bb] of list) {
      const x0 = toX(px0), x1 = toX(px1);
      const ax = a !== undefined && (kind === 'spire' || kind === 'sail') ? toX(a) : a;
      const p = new Path2D();
      tower(p, kind, x0, x1, y(top), base + 1, u, y, ax, bb);
      shapes.push(p);
      if (base - y(top) > 55 * u) lights.push([...towerTip(kind, x0, x1, y(top), u, y, ax, bb), rand()]);
    }
  }

  // The Capitol in the low ground west of Congress, UT Tower in the gap east.
  const cap = new Path2D();
  capitol(cap, westX(116), base + 1, u);
  shapes.push(cap);
  const ut = new Path2D();
  utTower(ut, eastX(462), base + 1, u);
  shapes.push(ut);
  lights.push([eastX(462), base - 76 * u, rand()]);

  // Pennybacker Bridge off to the west, past the last tower.
  const pbR = westX(20) - 34 * u;
  const pbL = Math.max(pbR - 250 * u, 0);
  if (pbR - pbL > 110 * u) pennybacker(shapes, lines, pbL, pbR, base + 1, u);

  // Live oaks along the water.
  const trees = new Path2D();
  for (const sgn of [-1, 1]) {
    let d = 0;
    while (d < side + 10 * u) {
      const r = (3.5 + rand() * 5) * u;
      const x = cx + sgn * (edge + d);
      trees.moveTo(x + r, base + 2 * u);
      trees.arc(x, base + 2 * u - r * 0.5, r, 0, Math.PI * 2);
      d += r * (1.1 + rand() * 0.8);
    }
  }
  shapes.push(trees);

  outlined(gb, shapes, { u, dpr, stroke: sb });

  // The bridge's hangers.
  gb.save();
  gb.strokeStyle = 'rgba(255, 170, 100, .75)';
  gb.lineWidth = 0.8 * u;
  gb.beginPath();
  for (const [x1, y1, x2, y2] of lines) { gb.moveTo(x1, y1); gb.lineTo(x2, y2); }
  gb.stroke();
  gb.restore();

  // The moonlight towers: one west, one east.
  const lamps = [];
  const mW = westX(20) - 16 * u;
  if (mW > 10 * u) lamps.push(moonTower(gb, mW, base + 1, u, sb));
  const mE = eastX(568) + 22 * u;
  if (mE < W - 10 * u) lamps.push(moonTower(gb, mE, base + 1, u, sb));
  else lamps.push(moonTower(gb, eastX(452), base + 1, u, sb));

  /* reflection, made once from the back layer, rippled per frame */
  const lakeH = shore - base;
  const [refl, gr] = mk();
  gr.save();
  gr.translate(0, lakeH);
  gr.scale(1, -0.5);
  gr.drawImage(back, 0, 0, back.width, base * dpr, 0, 0, W, base);
  gr.restore();

  /* front */
  const [front, gf] = mk();
  const sf = edgeGrad(gf, H * 0.3, H);
  const fshapes = [];

  // Congress Avenue Bridge across the water, just east of the logo.
  const brL = cx + edge + 6 * u;
  const brR = Math.min(cx + edge + 160 * u, W);
  fshapes.push(congressBridge(brL, brR, base + 4 * u, shore - 5 * u, u));

  // The shore.
  const sh = new Path2D();
  sh.moveTo(0, H + 2);
  sh.lineTo(0, shore);
  for (let x = 0; x <= W + 30 * u; x += 30 * u) {
    sh.quadraticCurveTo(x + 15 * u, shore + (rand() - 0.5) * 3 * u, x + 30 * u, shore + (rand() - 0.5) * 2 * u);
  }
  sh.lineTo(W + 30 * u, H + 2);
  sh.closePath();
  fshapes.push(sh);

  const foot = H - 3 * u;
  const srvX = cx - edge - 175 * u;
  if (srvX > 20 * u) fshapes.push(srv(srvX, foot, u));
  const wX = cx + edge + 215 * u;
  if (wX < W - 20 * u) fshapes.push(willie(wX, foot, u));

  // The power line and the grackles' perch.
  const pL = cx + edge + 300 * u;
  const pR = Math.min(cx + edge + 470 * u, W - 14 * u);
  let wire = null;
  const poleTop = shore - 78 * u;
  if (pR - pL > 90 * u) {
    fshapes.push(poles(pL, pR, H + 2, poleTop, u));
    wire = { L: pL + 9 * u, R: pR - 9 * u, y: poleTop + 3.6 * u, sag: 13 * u };
  }

  outlined(gf, fshapes, { u, dpr, stroke: sf, width: 1.7, glow: 6 });
  if (wire) {
    gf.save();
    gf.strokeStyle = 'rgba(255, 160, 90, .8)';
    gf.lineWidth = 0.9 * u;
    gf.shadowColor = 'rgba(255, 110, 40, .7)';
    gf.shadowBlur = 3 * u * dpr;
    for (const dy of [0, 2.6 * u]) {
      gf.beginPath();
      gf.moveTo(wire.L, wire.y + dy);
      gf.quadraticCurveTo((wire.L + wire.R) / 2, wire.y + dy + wire.sag * 2, wire.R, wire.y + dy);
      gf.stroke();
    }
    gf.restore();
  }

  const stars = Array.from({ length: Math.round(W / 8) }, () => [rand() * W, rand() * base * 0.55, rand() * 6.28, 0.5 + rand()]);
  const birds = wire ? [0.16, 0.27, 0.36, 0.52, 0.61, 0.74, 0.85].map((f, i) => ({ f, dir: i % 3 ? 1 : -1, ph: rand() * 6.28, fly: 0, next: 4 + rand() * 14 })) : [];

  return {
    sky, back, refl, front, lights, lamps, stars, birds, wire,
    base, shore, cx, edge, side, u, dpr, lakeH,
    bridge: [brL, brR, base + 8 * u],
  };
}

/* ── the moving parts ─────────────────────────────────────────────────── */

const wireY = (w, x, lift = 0) => {
  const f = (x - w.L) / (w.R - w.L);
  return w.y + w.sag * 4 * f * (1 - f) - lift;
};

function grackle(g, x, y, dir, u, f, flap) {   // long keel tail, the beak, wings when flying
  g.save();
  g.translate(x, y);
  g.scale(dir * u, u);
  const p = new Path2D();
  p.ellipse(0, -4, 4.4, 2.5, -0.3, 0, Math.PI * 2);
  p.moveTo(5.6, -6.8);
  p.arc(3.8, -6.8, 1.8, 0, Math.PI * 2);
  p.moveTo(5.3, -7.4); p.lineTo(8.2, -6.4); p.lineTo(5.3, -6.1); p.closePath();
  p.moveTo(-3.2, -3.4); p.lineTo(-10.5, -0.6 + f); p.lineTo(-10.8, 1.4 + f); p.lineTo(-2.8, -1.4); p.closePath();
  if (flap !== null) { p.moveTo(-2.5, -5); p.lineTo(-0.5, -5 - 8 * flap); p.lineTo(2.5, -5.2); p.closePath(); }
  else { p.rect(-0.3, -1.8, 0.6, 1.8); }
  g.lineJoin = 'round';
  g.strokeStyle = 'rgba(255, 170, 100, .85)';
  g.lineWidth = 2;
  g.stroke(p);
  g.fillStyle = '#000';
  g.fill(p);
  g.restore();
}

function armadillo(g, x, foot, dir, u, dpr, step, sniff) {   // banded shell, pointy snout, big ears, the tail
  g.save();
  g.translate(x, foot);
  g.scale(dir * u * 1.05, u * 1.05);
  const p = new Path2D();
  p.moveTo(-16, -6);
  p.bezierCurveTo(-17, -22, 14, -23, 14, -6);
  p.closePath();
  p.rect(-14, -8, 27, 3);
  const hb = sniff;
  p.moveTo(12, -13 + hb); p.lineTo(18, -11.5 + hb); p.lineTo(25.5, -5 + hb * 1.6); p.lineTo(24.5, -3.6 + hb * 1.6); p.lineTo(17, -5 + hb); p.lineTo(12, -6); p.closePath();
  p.moveTo(16.4, -12 + hb); p.ellipse(15.5, -14 + hb, 1.3, 2.8, -0.25, 0, Math.PI * 2);
  p.moveTo(-15, -9.5); p.lineTo(-31, -2.5); p.lineTo(-30.5, -1.4); p.lineTo(-15, -6.4); p.closePath();
  [-11, -6, 6, 10].forEach((lx, i) => {
    const s = Math.sin(step + (i % 2 ? Math.PI : 0)) * 2;
    p.moveTo(lx - 1.4, -7); p.lineTo(lx + 1.4, -7); p.lineTo(lx + 1.4 + s, 0); p.lineTo(lx - 1.4 + s, 0); p.closePath();
  });
  g.lineJoin = 'round';
  g.strokeStyle = '#FFA75C';
  g.shadowColor = 'rgba(255, 110, 40, .85)';
  g.shadowBlur = 5 * u * dpr;
  g.lineWidth = 3.4 / 1.05;
  g.stroke(p);
  g.shadowBlur = 0;
  g.fillStyle = '#000';
  g.fill(p);
  // The bands across the shell.
  g.strokeStyle = 'rgba(255, 167, 92, .55)';
  g.lineWidth = 0.9;
  g.beginPath();
  for (const bx of [-9, -5, -1, 3, 7]) { g.moveTo(bx, -6.5); g.quadraticCurveTo(bx + 1.2, -13, bx + 0.4, -19 + Math.abs(bx) * 0.12); }
  g.stroke();
  g.restore();
}

function kayaker(g, x, y, dir, u, t) {   // the boat, the paddler, the paddle going side to side
  g.save();
  g.translate(x, y);
  g.scale(dir * u, u);
  const p = new Path2D();
  p.moveTo(-14, 0); p.quadraticCurveTo(0, 3.2, 14, 0); p.quadraticCurveTo(0, -1.8, -14, 0); p.closePath();
  p.rect(-1.6, -8, 3.4, 8);
  p.moveTo(2.2, -10.2); p.arc(0.2, -10.2, 2, 0, Math.PI * 2);
  const a = Math.sin(t * 2.6) * 0.5;                 // the paddle rocks side to side
  const ca = Math.cos(a), sa = Math.sin(a);
  const px = (l) => [l * ca, -6 + l * sa];
  const [ax, ay] = px(-11), [bx, by] = px(11);
  p.moveTo(ax, ay - 0.5); p.lineTo(bx, by - 0.5); p.lineTo(bx, by + 0.5); p.lineTo(ax, ay + 0.5); p.closePath();
  p.moveTo(ax + 1, ay); p.ellipse(ax, ay, 2.4, 1.1, a, 0, Math.PI * 2);
  p.moveTo(bx + 1, by); p.ellipse(bx, by, 2.4, 1.1, a, 0, Math.PI * 2);
  g.lineJoin = 'round';
  g.strokeStyle = 'rgba(255, 170, 100, .9)';
  g.lineWidth = 2.2;
  g.stroke(p);
  g.fillStyle = '#000';
  g.fill(p);
  g.restore();
}

export function drawSkyline(g, st, W, H, dt, t) {
  const S = st.skyline;
  if (!S) return;
  const { u, base, shore, lakeH, cx, edge, side } = S;
  g.clearRect(0, 0, W, H);
  g.drawImage(S.sky, 0, 0, W, H);

  for (const [x, yy, ph, sz] of S.stars) {
    g.globalAlpha = 0.2 + 0.6 * Math.max(0, Math.sin(t * 1.3 + ph));
    g.fillStyle = '#FFF2DC';
    g.fillRect(x, yy, sz * u, sz * u);
  }
  g.globalAlpha = 1;
  g.drawImage(S.back, 0, 0, W, H);

  // Red lights on every tall tower, blinking out of step with each other.
  for (const [x, yy, ph] of S.lights) {
    const on = ((t * 0.55 + ph) % 1) < 0.45;
    if (!on) continue;
    const r = 5 * u;
    const gl = g.createRadialGradient(x, yy, 0, x, yy, r);
    gl.addColorStop(0, 'rgba(255, 60, 40, 1)');
    gl.addColorStop(0.25, 'rgba(255, 40, 30, .6)');
    gl.addColorStop(1, 'rgba(255, 20, 20, 0)');
    g.fillStyle = gl;
    g.fillRect(x - r, yy - r, r * 2, r * 2);
  }
  // The moonlight towers' lamps.
  for (const [x, yy] of S.lamps) {
    const r = (9 + Math.sin(t * 1.7) * 0.8) * u;
    const gl = g.createRadialGradient(x, yy, 0, x, yy, r);
    gl.addColorStop(0, 'rgba(235, 245, 255, .95)');
    gl.addColorStop(0.3, 'rgba(190, 215, 255, .35)');
    gl.addColorStop(1, 'rgba(160, 190, 255, 0)');
    g.fillStyle = gl;
    g.fillRect(x - r, yy - r, r * 2, r * 2);
  }

  // Lady Bird Lake.
  const lake = g.createLinearGradient(0, base, 0, shore);
  lake.addColorStop(0, 'rgba(70, 26, 10, 1)');
  lake.addColorStop(1, 'rgba(4, 2, 1, 1)');
  g.fillStyle = lake;
  g.fillRect(0, base, W, lakeH + 1);
  const n = 14, dh = lakeH / n, rc = S.refl, d = S.dpr;
  g.globalAlpha = 0.42;
  for (let i = 0; i < n; i++) {
    const off = Math.sin(t * 1.4 + i * 0.9) * (0.6 + i * 0.18) * u;
    g.drawImage(rc, 0, i * dh * d, rc.width, dh * d + 1, off, base + i * dh, W, dh + 0.5);
  }
  g.globalAlpha = 1;
  g.fillStyle = 'rgba(255, 170, 90, .14)';
  for (let i = 0; i < 12; i++) {
    const yy = base + 2 * u + i * (lakeH / 12);
    const x = ((i * 137 + t * (10 + i * 3) * u) % (W + 200)) - 100;
    g.fillRect(x, yy, (40 + (i * 53) % 70) * u, 1);
    g.fillRect(W - x - 60 * u, yy + 2, (30 + (i * 31) % 60) * u, 1);
  }

  // A kayaker across the lake every so often, west side.
  st.kayak = st.kayak || { clock: 6, x: null };
  const K = st.kayak;
  if (K.x === null) {
    K.clock -= dt;
    if (K.clock <= 0) { K.x = cx - edge - side - 20 * u; K.end = cx - edge - 20 * u; }
  } else {
    K.x += 13 * u * dt;
    const fadeIn = Math.min(1, (K.x - (cx - edge - side - 20 * u)) / (60 * u));
    const fadeOut = Math.min(1, (K.end - K.x) / (60 * u));
    g.globalAlpha = Math.max(0, Math.min(fadeIn, fadeOut));
    kayaker(g, K.x, base + lakeH * 0.62, 1, u, t);
    g.globalAlpha = 1;
    if (K.x >= K.end) { K.x = null; K.clock = 30 + Math.random() * 20; }
  }

  g.drawImage(S.front, 0, 0, W, H);

  // The grackles on the wire: they bob, flick their tails, one takes off and comes back.
  if (S.wire) {
    for (const b of S.birds) {
      const x = S.wire.L + (S.wire.R - S.wire.L) * b.f;
      let yy = wireY(S.wire, x);
      let flap = null, xx = x;
      if (b.fly > 0) {
        b.fly -= dt;
        const k = 1 - b.fly / 4;                // 0 → 1 over four seconds
        const arc = Math.sin(k * Math.PI);
        yy -= arc * 46 * u;
        xx += Math.sin(k * Math.PI * 2) * 30 * u * b.dir;
        flap = Math.sin(t * 22);
        if (b.fly <= 0) b.next = 8 + Math.random() * 18;
      } else {
        b.next -= dt;
        if (b.next <= 0) b.fly = 4;
      }
      const bob = flap === null ? Math.max(0, Math.sin(t * 2 + b.ph)) * 0.6 : 0;
      grackle(g, xx, yy - 0.4 * u - bob * u, b.dir, u, Math.sin(t * 3 + b.ph) * 0.8, flap);
    }
  }

  // The armadillo: fades in at the edge, walks the shore, stops to sniff, fades out.
  st.dillo = st.dillo || { clock: 4, on: false };
  const A = st.dillo;
  if (!A.on) {
    A.clock -= dt;
    if (A.clock <= 0) {
      A.on = true;
      A.sgn = Math.random() < 0.5 ? -1 : 1;
      A.d = side - 10 * u;
      A.stop = side * (0.35 + Math.random() * 0.3);
      A.pause = 0;
      A.step = 0;
    }
  } else {
    if (A.pause > 0) A.pause -= dt;
    else {
      A.d -= 15 * u * dt;
      A.step += dt * 9;
      if (A.stop && A.d <= A.stop) { A.pause = 2.4; A.stop = 0; }
    }
    const x = cx + A.sgn * (edge + A.d);
    const alpha = Math.max(0, Math.min(1, (side - A.d) / (50 * u), (A.d - 30 * u) / (60 * u)));
    g.globalAlpha = alpha;
    armadillo(g, x, shore + 3 * u, -A.sgn, u, S.dpr, A.step, A.pause > 0 ? Math.sin(t * 9) * 0.8 + 0.6 : 0);
    g.globalAlpha = 1;
    if (A.d <= 30 * u) { A.on = false; A.clock = 18 + Math.random() * 14; }
  }

  // Bats out from under Congress Avenue Bridge: a stream every so often.
  st.bats = st.bats || [];
  st.batClock = (st.batClock || 0) + dt;
  const [bL, bR, bY] = S.bridge;
  const emerging = st.batClock % 24 < 7;
  if (emerging && bR > bL) {
    st.batAcc = (st.batAcc || 0) + 22 * dt;
    for (; st.batAcc >= 1; st.batAcc -= 1) {
      st.bats.push({ x: bL + Math.random() * (bR - bL), y: bY, vx: (12 + Math.random() * 30) * u, vy: -(26 + Math.random() * 26) * u, ph: Math.random() * 6.28, s: 0.8 + Math.random() * 0.6 });
    }
  }
  if (st.bats.length) {
    g.lineCap = 'round';
    for (const b of st.bats) {
      b.x += (b.vx + Math.sin(t * 2 + b.ph) * 14 * u) * dt;
      b.y += b.vy * dt;
      const s = 2.6 * u * b.s, f = Math.sin(t * 20 + b.ph);
      const a = Math.min(1, (b.y - H * 0.04) / (H * 0.2));
      if (a <= 0) continue;
      g.globalAlpha = a;
      g.beginPath();
      g.moveTo(b.x - s, b.y - s * f * 0.8);
      g.quadraticCurveTo(b.x - s * 0.4, b.y - s * 0.2, b.x, b.y);
      g.quadraticCurveTo(b.x + s * 0.4, b.y - s * 0.2, b.x + s, b.y - s * f * 0.8);
      g.strokeStyle = 'rgba(255, 150, 80, .55)';
      g.lineWidth = 2.6 * u;
      g.stroke();
      g.strokeStyle = '#0a0503';
      g.lineWidth = 1.3 * u;
      g.stroke();
    }
    g.globalAlpha = 1;
    st.bats = st.bats.filter((b) => b.y > H * 0.03 && b.x < W + 20);
  }
}
