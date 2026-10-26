// ============================================================
// PROMO RUNS: THE GHOST MAKES A WHOLE SONG, FOR REAL, ON CAMERA.
//
// Chris, 2026-10-25: "have the phone app ghost go through the process of ghost
// rider, analyzing an artist, writing in the style of the artist, send style
// dna and 20 words to the matrix, then to songwriter, then to black hole, 30 sec
// song... so I can record it to make content... a variety of them". And: "make
// sure the ghost is waiting for the lyrics to come up, and that the screen is
// scrolling along with the ghost... make it look like it's actually doing what
// it says it's doing."
//
// So nothing here is faked. He types, taps the real buttons, spends the real AI
// key, WAITS for each result to actually arrive (hovering over the busy button,
// the screen kept on it), then scrolls through what came back with the screen
// moving under him. Unlike the walkthroughs in phoneGhostScripts.js, these DO
// press the buttons that spend credit: that is the whole point of a promo.
//
// Started from the promo picker (long-press the Ghost button in the phone's
// bar, or open the app with ?promo). Every run rotates the artist through the
// TikTok-trending list, and the topic and word sets through the lists below,
// so two recordings are never the same song.
//
// VOICE. Each spoken line has an `id` (the words are in promoLines.js); its clip is
// src/assets/ghost-vo-phone/promo-<id>.mp3, recorded in the Voice Lab like the
// rest. Lines are shared between runs by id, so each is recorded once:
//   python scripts/cut-ghost-recording.py <recording.wav> promo --write
// A line with no clip yet: he holds for as long as it would take to say.
// Never use the words in src/services/cliches.js, and never call the app free.
//
// Step kinds (PhoneGhost.jsx runs them):
//   { open: tab }                tap his way to a tool (launcher tile, or the
//                                menu then the tile), like a person would
//   { target, action, typeText } point / 'type' / 'click', as in the tours
//   { target, act }              point, talk, then run act() (a Ghost bus action)
//   { wait, at, timeout, idle }  hover over `at` until wait() is true; the
//                                screen stays on `at`. idle lines fill a long wait
//   { read, ms }                 scroll through `read` with him riding along
//   { bed: 'off' }               fade the music out (before the song plays)
//   { play, ms }                 play a finished take and listen to it
// ============================================================

import { nextTrendingArtist } from '../services/trendingArtists.js';
import { runGhostAction } from '../services/ghostBus.js';
import { CLICHE_RE } from '../services/cliches.js';
export { PROMO_LINES, promoLines } from './promoLines.js';

// Topics and word sets rotate like the artists, so every recording is a new song.
const TOPICS = [
  'a pawn shop guitar', 'my first car', 'moving back home', 'working the night shift',
  'a lake house that got sold', 'the last summer before college', 'a borrowed truck',
  'getting a second chance', 'leaving a small town', 'a voicemail I never deleted',
];
const WORD_SETS = [
  'pawn shop, borrowed truck, last paycheck, empty highway, fever, porch light, county line',
  'gold tooth, corner store, front stoop, summer heat, cassette, block party, bus fare',
  'lake house, sunburn, dock, rope swing, old radio, sweet tea, screen door',
  'night shift, vending machine, hi-vis, overtime, parking lot, coffee cup, dawn',
  'bleachers, letter jacket, homecoming, back seat, mixtape, tan lines, curfew',
];

function rotate(key, list) {
  let i = 0;
  try {
    i = Number(localStorage.getItem(key)) || 0;
    localStorage.setItem(key, String((i + 1) % list.length));
  } catch { i = Math.floor(Math.random() * list.length); }
  return list[i % list.length];
}
export const nextTopic = () => rotate('lyricist.promo.topicIdx', TOPICS.filter((t) => !CLICHE_RE.test(t)));
export const nextWordSet = () => rotate('lyricist.promo.wordsIdx', WORD_SETS);

// ---- what "done" looks like on each tool --------------------------------------

const $ = (sel) => document.querySelector(sel);
const text = (sel) => ($(sel)?.textContent || '').trim();
const shownPane = (tab) => {
  const p = $(`[data-tab-pane="${tab}"]`);
  return !!p && p.style.display !== 'none';
};
const inPane = (tab, sel) => $(`[data-tab-pane="${tab}"] ${sel}`);

/** A Ghost Rider call came back with an error: stop instead of hanging there. */
const riderFailed = () => !!inPane('analyzer', '.pill-red');

/**
 * A 30 second cut of a whole song: its first verse and its hook, four lines each.
 * Black Hole Studios gives every part fifteen seconds, so two parts is thirty.
 */
export function thirtySecondCut(lyrics) {
  const secs = [];
  let cur = null;
  for (const raw of String(lyrics || '').split('\n')) {
    const t = raw.trim();
    const head = /^\[([^\]]{1,24})\]$/.exec(t);
    if (head) { cur = { name: head[1].trim(), lines: [] }; secs.push(cur); continue; }
    if (!t) continue;
    if (!cur) { cur = { name: 'Verse', lines: [] }; secs.push(cur); }
    cur.lines.push(t);
  }
  const verse = secs.find((s) => /verse/i.test(s.name) && s.lines.length) || secs.find((s) => s.lines.length);
  // The chorus itself, never the Pre-Chorus or a Post-Chorus.
  const hook = secs.find((s) => s !== verse && /\b(chorus|hook|refrain)\b/i.test(s.name) && !/\b(pre|post)\b/i.test(s.name) && s.lines.length)
    || secs.find((s) => s !== verse && /chorus|hook|refrain/i.test(s.name) && s.lines.length);
  const pick = [verse, hook].filter(Boolean);
  if (!pick.length) return String(lyrics || '');
  return pick.map((s) => `[${s.name}]\n${s.lines.slice(0, 4).join('\n')}`).join('\n\n');
}

// ---- the pieces every run is built from -----------------------------------------

/** Ghost Rider: artist in, report, a whole song in their style. */
function riderSteps({ artist, topic }) {
  return [
    // A run left over from last time would show its old report and song.
    { target: '[data-demo="gr-clear"]', action: 'click', optional: true },
    { target: '[data-demo="gr-artist"]', action: 'type', typeText: artist, id: 'rider-artist' },
    { target: '[data-demo="gr-analyze"]', action: 'click', id: 'rider-analyze' },
    {
      wait: () => riderFailed() || (!!text('[data-tab-pane="analyzer"] [data-demo="gr-report"]') && !/Analyzing/.test(text('[data-demo="gr-analyze"]'))),
      fail: riderFailed, at: '[data-demo="gr-analyze"]', timeout: 150000, id: 'rider-wait',
    },
    { read: '[data-demo="gr-report"]', ms: 9000, id: 'rider-report' },
    ...(topic ? [{ target: '[data-demo="gr-topic"]', action: 'type', typeText: topic, id: 'rider-topic' }] : []),
    { target: '[data-demo="gr-write"]', action: 'click', id: 'rider-write' },
    {
      wait: () => riderFailed() || (!!text('[data-demo="gr-lyrics"] pre') && !/Writing/.test(text('[data-demo="gr-write"]'))),
      fail: riderFailed, at: '[data-demo="gr-write"]', timeout: 180000, id: 'rider-write-wait',
    },
    { read: '[data-demo="gr-lyrics"]', ms: 14000, id: 'rider-lyrics' },
  ];
}

/** Style DNA and the 20 words, to The Matrix. They are made after the song lands. */
function riderToMatrixSteps() {
  return [
    {
      wait: () => !!$('[data-demo="gr-dna-send"]') && !!$('[data-demo="gr-words-send"]'),
      at: '[data-demo="gr-style-dna"]', timeout: 90000,
    },
    { target: '[data-demo="gr-style-dna"]', id: 'rider-dna' },
    { target: '[data-demo="gr-dna-send"]', action: 'click', id: 'rider-dna-send' },
    { target: '[data-demo="gr-matrix-words"]', id: 'rider-words' },
    { target: '[data-demo="gr-words-send"]', action: 'click', id: 'rider-words-send' },
    { open: 'quantum' },
    // The words wait for the rhyme dictionary before they land on the grid.
    { wait: () => !!inPane('quantum', '.ql-tile'), at: '[data-demo="ql-keywords"]', timeout: 15000 },
    { target: '[data-demo="ql-keywords"]', glow: ['.ql-lattice'], id: 'matrix-arrived' },
  ];
}

/** The Matrix: two whole songs, pick one, send it on. */
function matrixSongSteps() {
  // Auto-Craft stays disabled until both songs are written and checked.
  const autoBusy = () => !!$('[data-demo="matrix-autocraft"]')?.disabled;
  return [
    {
      target: '[data-demo="ql-fullsongs-opt"]',
      act: () => {
        const box = $('[data-demo="ql-fullsongs-opt"] input[type="checkbox"]') || $('[data-demo="ql-fullsongs-opt"]');
        if (box && box.type === 'checkbox' && !box.checked) box.click();
      },
    },
    { target: '[data-demo="matrix-autocraft"]', action: 'click', id: 'matrix-autocraft' },
    {
      wait: () => !!$('[data-demo="ql-send-song-a"]') && !autoBusy(),
      at: '.ql-status', timeout: 300000, id: 'matrix-wait',
      idle: [{ id: 'matrix-wait-2', after: 30000 }],
    },
    { read: '.ql-songs-out .ql-song-col', ms: 12000, id: 'matrix-songs' },
    { target: '[data-demo="ql-win-a"]', action: 'click', id: 'matrix-win' },
    { target: '[data-demo="ql-send-song-a"]', action: 'click', id: 'matrix-send' },
  ];
}

/** Songwriter, then off to the studio. */
function songwriterSteps() {
  return [
    { wait: () => shownPane('songwriter') && !!inPane('songwriter', '[data-demo="sw-lines"]'), at: '[data-demo="sw-lines"]', timeout: 15000 },
    { read: '[data-tab-pane="songwriter"] [data-demo="sw-lines"]', ms: 8000, id: 'sw-arrived' },
    { target: '[data-demo="sw-send-studio-top"], [data-demo="sw-send-studio"]', action: 'click', id: 'sw-send' },
  ];
}

/** Black Hole Studios: cut to 30 seconds, make it, wait for it, play it. */
function studioSteps({ outro }) {
  let takesBefore = 0;
  return [
    {
      wait: () => shownPane('onemanband') && !!String($('[data-demo="omb-lyrics"]')?.value || text('[data-demo="omb-lyrics"]')).trim(),
      at: '[data-demo="omb-lyrics"]', timeout: 15000,
    },
    { target: '[data-demo="omb-lyrics"]', glow: ['.omb-picks'], id: 'bh-arrived' },
    {
      target: '[data-demo="omb-lyrics"]', id: 'bh-trim',
      act: async () => {
        const box = $('[data-demo="omb-lyrics"]');
        const now = box?.value ?? box?.textContent ?? '';
        const cut = thirtySecondCut(now);
        if (cut.trim() && cut.trim() !== now.trim()) await runGhostAction('set_lyrics', { text: cut });
        await runGhostAction('set_length', { seconds: 30 });
        await runGhostAction('set_takes', { count: 1 });
      },
    },
    {
      target: '[data-demo="omb-make"]', action: 'click', id: 'bh-make',
      before: () => { takesBefore = document.querySelectorAll('.omb-rack .omb-take').length; },
    },
    {
      wait: () => !!$('.omb-error') || (document.querySelectorAll('.omb-rack .omb-take').length > takesBefore && !$('.omb-make.busy')),
      fail: () => !!$('.omb-error'), at: '[data-demo="omb-make"]', timeout: 600000, id: 'bh-wait',
      idle: [{ id: 'bh-wait-2', after: 45000 }],
    },
    { bed: 'off' },
    { play: '.omb-rack .omb-take audio', ms: 40000, id: 'bh-play' },
    { id: outro },
  ];
}

// ---- the runs ----------------------------------------------------------------------

/**
 * Every promo run. `build` gets the artist, topic and word set for this take and
 * returns its steps, so the rotating parts are picked when you press Start.
 */
export const PROMO_RUNS = [
  {
    id: 'full-ride',
    title: 'The full ride',
    blurb: 'Ghost Rider studies an artist and writes a song, Style DNA and 20 words go to The Matrix, two songs come out, the winner goes through Songwriter to Black Hole Studios as a 30 second song.',
    minutes: '6 to 9',
    build: ({ artist, topic }) => [
      { open: 'analyzer', id: 'open-rider' },
      ...riderSteps({ artist, topic }),
      ...riderToMatrixSteps(),
      ...matrixSongSteps(),
      ...songwriterSteps(),
      ...studioSteps({ outro: 'outro-rider' }),
    ],
  },
  {
    id: 'rider-to-song',
    title: 'Artist to song',
    blurb: 'Ghost Rider studies an artist and writes a song in their style, then Songwriter, then Black Hole Studios makes it a 30 second song.',
    minutes: '4 to 6',
    build: ({ artist, topic }) => [
      { open: 'analyzer', id: 'open-rider' },
      ...riderSteps({ artist, topic }),
      { target: '[data-demo="gr-send"]', action: 'click', id: 'rider-send-sw' },
      ...songwriterSteps(),
      ...studioSteps({ outro: 'outro-rider' }),
    ],
  },
  {
    id: 'matrix-words',
    title: 'Words to song',
    blurb: 'A handful of words go into The Matrix, two whole songs come out, the winner goes through Songwriter to Black Hole Studios as a 30 second song.',
    minutes: '4 to 6',
    build: ({ words }) => [
      { open: 'quantum', id: 'open-matrix' },
      { target: '[data-demo="ql-keywords"]', action: 'type', typeText: words, clear: true, id: 'matrix-type' },
      { target: '[data-demo="ql-load"]', action: 'click', id: 'matrix-load' },
      ...matrixSongSteps(),
      ...songwriterSteps(),
      ...studioSteps({ outro: 'outro-matrix' }),
    ],
  },
];

export function promoRun(id) {
  return PROMO_RUNS.find((r) => r.id === id) || null;
}

/** The steps for one take, with this take's artist, topic and words picked now. */
export function buildPromo(id, { artist, topic, words } = {}) {
  const run = promoRun(id);
  if (!run) return null;
  const pick = {
    artist: artist?.trim() || nextTrendingArtist(),
    topic: topic === undefined ? nextTopic() : topic.trim(),
    words: words?.trim() || nextWordSet(),
  };
  return { id: run.id, title: run.title, steps: run.build(pick), pick };
}
