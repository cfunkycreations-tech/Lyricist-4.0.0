// The six scenes of the brief, built from Chris's seven pictures.
// Every place is a fraction of the picture (x right, y down).
//
// fx (the shader's effects, 0 = off):
//   sky        clouds drift and churn          skyHue    sky colours swim
//   water      ripples, swells, swimmer rings  waterHue  psychedelic reflections
//   wind       trees and grass sway            neon      signs buzz and flicker
//   soundwave  a wave lights the buildings     ribbons   water turns to neon ribbons
//   vortex     the cosmic spiral               haze      warm haze over the hills
//   edges      building outlines glow          chroma    colour split on the beat
//   wet        the water channel is a wet street (shimmer, no flow)
//   sun        the sun glow swells             beams     rooftop light beams
//
// camera: from/to { x, y, zoom } (picture fractions), parallax = how far near
// things slide against far ones, focus = the depth that stays put.
// puppets: whole things moved as one (kites, swimmers, boats, the Ghost's head,
// a strumming hand): box [cx, cy, half w, half h], move [ax, ay, rot, speed],
// pivot [px, py], phase, kind 'sway' | 'bob' | 'walk' | 'strum'.
// lanes: traffic as polylines; boats: paths with a wake; bats / birds: flocks.

export const BPM = 96;

const P = (box, move, pivot, phase, kind) => ({ box, move, pivot, phase, kind });

export const SCENES = [
  {
    id: 'pennybacker', title: '1  Pennybacker Bridge', seconds: 14,
    img: 'pennybacker', occlude: 0.66,
    fx: { sky: 1, skyHue: 0.35, water: 1.2, waterHue: 0.4, wind: 1, haze: 0.6, sun: 1, chroma: 0.4 },
    ribbons: { at: [0.55, 0.75] },   // the musical transition: water becomes neon ribbons, then returns
    sun: [0.235, 0.235],
    camera: { from: { x: 0.52, y: 0.50, zoom: 1.0 }, to: { x: 0.56, y: 0.47, zoom: 1.16 }, parallax: 0.045, focus: 0.35 },
    lanes: [
      { pts: [[-0.02, 0.742], [0.2, 0.668], [0.4, 0.598], [0.55, 0.546], [0.70, 0.47], [0.82, 0.40], [0.88, 0.33], [0.92, 0.27]], dir: 1, cars: 9, speed: 0.07, color: [255, 236, 210] },
      { pts: [[0.92, 0.276], [0.88, 0.343], [0.82, 0.418], [0.70, 0.494], [0.55, 0.578], [0.4, 0.64], [0.2, 0.72], [-0.02, 0.80]], dir: -1, cars: 9, speed: 0.08, color: [255, 50, 70] },
    ],
    boats: [
      { pts: [[0.21, 0.445], [0.14, 0.41], [0.06, 0.37]], speed: 0.012, size: 0.012 },
      { pts: [[0.13, 0.37], [0.08, 0.35], [0.02, 0.33]], speed: 0.009, size: 0.008 },
    ],
    puppets: [
      P([0.86, 0.53, 0.07, 0.10], [0.004, 0.006, 0.03, 1.6], [0.86, 0.62], 0.0, 'bob'),   // the Ghost bobs to the beat
    ],
    shine: [0.53, 0.70, 0.97, 0.98],
  },
  {
    id: 'downtown', title: '2  Downtown Austin', seconds: 14,
    img: 'downtown', windows: 500, occlude: 0.7,
    fx: { sky: 1, skyHue: 0.45, water: 1, waterHue: 1, wind: 0.6, soundwave: 1, edges: 0.5, sun: 0.7, beams: 0.8, chroma: 0.4 },
    sun: [0.33, 0.29],
    camera: { from: { x: 0.56, y: 0.42, zoom: 1.08 }, to: { x: 0.54, y: 0.45, zoom: 1.0 }, parallax: 0.035, focus: 0.3 },
    lanes: [
      { pts: [[0.47, 0.468], [0.70, 0.466], [1.02, 0.466]], dir: 1, cars: 8, speed: 0.06, color: [255, 236, 210] },
      { pts: [[1.02, 0.474], [0.70, 0.474], [0.47, 0.476]], dir: -1, cars: 8, speed: 0.055, color: [255, 50, 70] },
    ],
    birds: { n: 14, y: [0.06, 0.22], speed: 0.03, size: 0.010 },
    puppets: [
      P([0.585, 0.60, 0.035, 0.03], [0.004, 0.003, 0.02, 1.2], [0.585, 0.61], 0.3, 'bob'),     // the small boat
      P([0.785, 0.715, 0.075, 0.06], [0.006, 0.004, 0.015, 0.9], [0.785, 0.74], 1.1, 'bob'),   // the big boat
      P([0.34, 0.50, 0.075, 0.12], [0.003, 0.006, 0.025, 1.6], [0.34, 0.60], 0.0, 'bob'),      // the Ghost's head on the beat
      P([0.31, 0.665, 0.03, 0.04], [0.006, 0.004, 0.08, 5.0], [0.30, 0.70], 0.0, 'strum'),     // the pen writing
    ],
    shine: [0.0, 0.62, 0.37, 0.98],
  },
  {
    id: 'congress', title: '2b  Congress Avenue Bridge', seconds: 10,
    img: 'congress', windows: 400, occlude: 0.75,
    fx: { sky: 1, skyHue: 0.5, water: 1, waterHue: 1, wind: 0.5, soundwave: 0.7, edges: 0.4, chroma: 0.4 },
    camera: { from: { x: 0.52, y: 0.5, zoom: 1.0 }, to: { x: 0.58, y: 0.46, zoom: 1.12 }, parallax: 0.04, focus: 0.3 },
    bats: { from: [0.40, 0.42], to: [0.62, -0.05], n: 420, spread: 0.10 },
    puppets: [
      P([0.86, 0.92, 0.09, 0.06], [0.006, 0.004, 0.03, 1.0], [0.86, 0.95], 0.4, 'bob'),       // the kayak
      P([0.86, 0.885, 0.05, 0.05], [0.004, 0.006, 0.12, 2.4], [0.86, 0.92], 0.0, 'strum'),    // paddles
      P([0.18, 0.59, 0.10, 0.13], [0.003, 0.006, 0.03, 1.6], [0.18, 0.70], 0.0, 'bob'),       // the Ghost
    ],
    shine: [0.0, 0.70, 0.43, 1.0],
  },
  {
    id: 'sixth', title: '3  Sixth Street', seconds: 14,
    img: 'sixth', windows: 500, occlude: 0.8,
    fx: { sky: 0.8, skyHue: 0.4, water: 0.6, waterHue: 0.9, wet: 1, neon: 1, edges: 0.2, chroma: 0.3 },
    camera: { from: { x: 0.56, y: 0.45, zoom: 1.0 }, to: { x: 0.57, y: 0.43, zoom: 1.22 }, parallax: 0.05, focus: 0.25 },
    lanes: [
      { pts: [[0.56, 0.485], [0.585, 0.49], [0.62, 0.49]], dir: 1, cars: 3, speed: 0.03, color: [255, 236, 210] },
    ],
    puppets: [
      P([0.935, 0.62, 0.05, 0.09], [0.002, 0.003, 0.04, 6.0], [0.92, 0.66], 0.0, 'strum'),   // the busker's guitar hand
      P([0.67, 0.62, 0.035, 0.11], [0.002, 0.004, 0.015, 1.0], [0.67, 0.72], 0.0, 'walk'),
      P([0.71, 0.55, 0.025, 0.08], [0.002, 0.003, 0.015, 1.0], [0.71, 0.62], 1.0, 'walk'),
      P([0.81, 0.58, 0.03, 0.10], [0.002, 0.004, 0.015, 1.0], [0.81, 0.67], 2.0, 'walk'),
      P([0.75, 0.56, 0.025, 0.08], [0.002, 0.003, 0.015, 1.0], [0.75, 0.63], 0.5, 'walk'),
      P([0.62, 0.56, 0.025, 0.08], [0.002, 0.003, 0.015, 1.0], [0.62, 0.63], 1.5, 'walk'),
      P([0.34, 0.36, 0.11, 0.13], [0.003, 0.006, 0.025, 1.6], [0.36, 0.48], 0.0, 'bob'),     // the Ghost's head
    ],
    shine: [0.0, 0.62, 0.40, 1.0],
  },
  {
    id: 'willie', title: '3b  Willie on Sixth', seconds: 10,
    img: 'willie', windows: 300, occlude: 0.8,
    fx: { sky: 0.6, skyHue: 0.3, neon: 1, edges: 0.2, chroma: 0.3 },
    camera: { from: { x: 0.55, y: 0.48, zoom: 1.12 }, to: { x: 0.5, y: 0.5, zoom: 1.0 }, parallax: 0.04, focus: 0.3 },
    puppets: [
      P([0.37, 0.56, 0.06, 0.07], [0.003, 0.004, 0.10, 6.0], [0.34, 0.58], 0.0, 'strum'),   // the strumming hand (the face stays still)
      P([0.72, 0.60, 0.035, 0.16], [0.002, 0.004, 0.015, 1.0], [0.72, 0.75], 0.0, 'walk'),
      P([0.80, 0.58, 0.04, 0.17], [0.002, 0.004, 0.015, 1.0], [0.80, 0.74], 1.3, 'walk'),
      P([0.88, 0.60, 0.035, 0.16], [0.002, 0.004, 0.015, 1.0], [0.88, 0.75], 2.1, 'walk'),
      P([0.47, 0.57, 0.08, 0.10], [0.003, 0.005, 0.025, 1.6], [0.47, 0.66], 0.0, 'bob'),
    ],
    shine: [0.30, 0.75, 0.70, 1.0],
  },
  {
    id: 'zilker', title: '4  Zilker Park', seconds: 12,
    img: 'zilker', occlude: 0.72,
    fx: { sky: 1, skyHue: 0.45, wind: 1.3, sun: 0.8, haze: 0.3, chroma: 0.3 },
    sun: [0.75, 0.43],
    camera: { from: { x: 0.55, y: 0.45, zoom: 1.05 }, to: { x: 0.6, y: 0.42, zoom: 1.0 }, parallax: 0.045, focus: 0.3 },
    puppets: [
      P([0.79, 0.12, 0.13, 0.12], [0.010, 0.012, 0.06, 0.9], [0.86, 0.33], 0.0, 'sway'),     // the big rainbow kite
      P([0.44, 0.20, 0.025, 0.04], [0.006, 0.008, 0.18, 1.3], [0.44, 0.24], 0.7, 'sway'),
      P([0.61, 0.21, 0.025, 0.04], [0.006, 0.008, 0.16, 1.1], [0.61, 0.25], 1.9, 'sway'),
      P([0.31, 0.26, 0.02, 0.035], [0.005, 0.007, 0.20, 1.5], [0.31, 0.29], 2.6, 'sway'),
      P([0.67, 0.24, 0.02, 0.03], [0.005, 0.006, 0.18, 1.2], [0.67, 0.27], 3.3, 'sway'),
      P([0.38, 0.27, 0.02, 0.03], [0.005, 0.006, 0.18, 1.4], [0.38, 0.30], 4.1, 'sway'),
      P([0.93, 0.42, 0.04, 0.06], [0.006, 0.010, 0.10, 1.0], [0.93, 0.47], 1.2, 'sway'),     // the jellyfish kite
      P([0.96, 0.61, 0.025, 0.04], [0.005, 0.008, 0.15, 1.3], [0.96, 0.66], 0.2, 'sway'),
      P([0.24, 0.48, 0.10, 0.12], [0.003, 0.006, 0.025, 1.6], [0.24, 0.60], 0.0, 'bob'),     // the Ghost
    ],
    shine: [0.0, 0.62, 0.48, 0.98],
  },
  {
    id: 'barton', title: '4b  Barton Springs', seconds: 12,
    img: 'barton', occlude: 0.75,
    fx: { sky: 0.6, skyHue: 0.3, water: 1.3, waterHue: 1.1, wind: 1, chroma: 0.3 },
    camera: { from: { x: 0.52, y: 0.45, zoom: 1.0 }, to: { x: 0.6, y: 0.5, zoom: 1.12 }, parallax: 0.04, focus: 0.3 },
    flows: [
      { box: [0.19, 0.37, 0.25, 0.53], dir: [0, 1], speed: 1.6, amount: 0.25 },
      { box: [0.30, 0.40, 0.36, 0.52], dir: [0, 1], speed: 1.6, amount: 0.25 },
      { box: [0.41, 0.43, 0.46, 0.51], dir: [0, 1], speed: 1.6, amount: 0.25 },
    ],
    swimmers: [[0.33, 0.53], [0.39, 0.55], [0.43, 0.575], [0.47, 0.58], [0.55, 0.50], [0.60, 0.56], [0.66, 0.535], [0.68, 0.56], [0.72, 0.515], [0.83, 0.575], [0.87, 0.59], [0.94, 0.615], [0.48, 0.50], [0.76, 0.50]],
    puppets: [
      P([0.13, 0.72, 0.03, 0.04], [0.006, 0.004, 0.08, 5.0], [0.12, 0.75], 0.0, 'strum'),   // the pen writing
      P([0.12, 0.52, 0.08, 0.11], [0.003, 0.006, 0.025, 1.6], [0.12, 0.62], 0.0, 'bob'),     // the Ghost's head
      P([0.56, 0.07, 0.04, 0.05], [0.006, 0.008, 0.16, 1.2], [0.56, 0.11], 0.3, 'sway'),     // the kite
    ],
    shine: [0.50, 0.60, 1.0, 0.99],
  },
  {
    id: 'bonnell', title: '5  Mount Bonnell (stand-in)', seconds: 14, standIn: true,
    img: 'pennybacker', occlude: 0.66,
    fx: { sky: 1, skyHue: 0.6, water: 1, waterHue: 0.8, wind: 0.8, haze: 1.2, sun: 1, vortex: 1, chroma: 0.3 },
    sun: [0.235, 0.235], vortex: [0.30, 0.10, 0.22],
    camera: { from: { x: 0.30, y: 0.32, zoom: 1.55 }, to: { x: 0.34, y: 0.36, zoom: 1.3 }, parallax: 0.05, focus: 0.3 },
    boats: [{ pts: [[0.21, 0.445], [0.14, 0.41], [0.06, 0.37]], speed: 0.012, size: 0.012 }],
  },
  {
    id: 'reveal', title: '6  The Ghost and Lyricist Pro', seconds: 16, reveal: true,
    img: 'downtown', occlude: 1, dim: 0.6,
    fx: { sky: 1, skyHue: 0.8, vortex: 1.4, chroma: 0.4, beams: 0.6 },
    vortex: [0.74, 0.2, 0.3],
    // Framed on the skyline only, so the picture's own Ghost and logo stay out of shot.
    camera: { from: { x: 0.76, y: 0.24, zoom: 2.3 }, to: { x: 0.74, y: 0.25, zoom: 2.1 }, parallax: 0.01, focus: 0.3 },
  },
];
