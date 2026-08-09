// Turning a file the user wrote into lines you can actually edit.
//
// This exists because of one import that went wrong in the worst quiet way.
// Chris uploaded "I need To Write A SONG.txt" — 3130 characters, a whole
// journal entry — and the app reported "Loaded 1 lines" and put all 3130
// characters into a single line that ran off the right edge of the workspace.
// Nothing was lost, but nothing was usable either, and the message said the
// import had worked.
//
// The file contained ZERO line breaks: LF=0, CR=0. Everyone assumes a .txt is
// line-broken. Plenty aren't — dictated notes, phone notes, anything pasted
// out of a chat box or a word processor that soft-wraps instead of breaking.
// An importer that only honours line breaks fails all of them.

/**
 * Line endings, all of them.
 *
 * `\r\n` alone was handled; a lone `\r` was not. Classic-Mac saves and a few
 * editors still emit `\r`-only files, and those collapse into one line exactly
 * the same way the no-break file did. Handle both here, once.
 */
export function normalizeLineEndings(text) {
  return String(text || '').replace(/\r\n?/g, '\n');
}

/** Break at the last word boundary at or before `max`, never mid-word. */
function wrapLongRun(run, max) {
  const out = [];
  let rest = run.trim();
  while (rest.length > max) {
    let cut = rest.lastIndexOf(' ', max);
    // One unbroken monster of a word: let it be long rather than slice it.
    if (cut <= 0) { out.push(rest); return out; }
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut + 1).trim();
  }
  if (rest) out.push(rest);
  return out;
}

// Full stops that do not end a sentence. Without this list "My name is Mr.
// Funk" imports as two lines — "My name is Mr." and "Funk." — which is a
// worse insult than the wall of text it replaced.
const ABBREVIATIONS =
  /(?:^|\s)(?:mr|mrs|ms|dr|prof|rev|st|jr|sr|vs|etc|inc|ltd|co|feat|ft|approx|dept|est|fig|no|vol|e\.g|i\.e|a\.m|p\.m)\.$/i;
// A lone initial — "J. Funk" — is the same trap.
const INITIAL = /(?:^|\s)[A-Z]\.$/;

/** Sentence ends only. Abbreviations and initials get glued back on. */
function splitSentences(clean) {
  const parts = clean.split(/(?<=[.!?…])\s+/);
  const out = [];
  for (const part of parts) {
    const prev = out[out.length - 1];
    if (prev && (ABBREVIATIONS.test(prev) || INITIAL.test(prev))) {
      out[out.length - 1] = `${prev} ${part}`;
    } else {
      out.push(part);
    }
  }
  return out;
}

/**
 * Break one over-long sentence at clause marks, then pack the pieces back up.
 *
 * Splitting alone is not enough: "Journal entry: August 8th, 2026: ..." breaks
 * at every colon and comma and lands as "Journal entry:" / "August 8th," /
 * "2026:" — three lines of confetti. Pack greedily so each line is as full as
 * it can be without going over.
 */
function packClauses(sentence, max) {
  const pieces = sentence.split(/(?<=[,;:—–])\s+/).map((p) => p.trim()).filter(Boolean);
  const packed = [];
  let current = '';
  for (const piece of pieces) {
    if (!current) current = piece;
    else if (`${current} ${piece}`.length <= max) current += ` ${piece}`;
    else { packed.push(current); current = piece; }
  }
  if (current) packed.push(current);
  // A single clause with no punctuation to break on can still be too long.
  return packed.flatMap((l) => (l.length > max ? wrapLongRun(l, max) : [l]));
}

/**
 * Split a wall of prose into editable lines.
 *
 * Sentence ends first, then clause breaks inside anything still too long,
 * then a word-boundary wrap as the last resort. Never cuts a word, never
 * changes a character — rejoining the lines gives back the original text.
 */
export function splitProseIntoLines(text, max = 90) {
  const clean = normalizeLineEndings(text).replace(/\s+/g, ' ').trim();
  if (!clean) return [];

  const lines = [];
  for (const sentence of splitSentences(clean)) {
    const s = sentence.trim();
    if (!s) continue;
    if (s.length <= max) lines.push(s);
    else lines.push(...packClauses(s, max));
  }
  return lines;
}

/**
 * Does this text have real line structure, or is it a wall?
 *
 * A file with a couple of stray breaks in three thousand characters is still a
 * wall — judging by "has at least one \n" is what let the bad import through.
 * The test is average run length: if the gaps between breaks read like
 * paragraphs rather than lyric lines, treat it as prose and split it.
 */
export function hasLineStructure(text) {
  const clean = normalizeLineEndings(text).trim();
  if (!clean) return false;
  const runs = clean.split('\n').map((l) => l.trim()).filter(Boolean);
  if (runs.length < 2) return false;
  const avg = runs.reduce((n, l) => n + l.length, 0) / runs.length;
  return avg <= 160;
}

/**
 * Group loose lines into sections so the editor stays navigable.
 *
 * Only used when the source gave us no structure of its own — we are not
 * overriding anybody's [Verse]/[Chorus] markers or blank-line blocks. Four
 * lines a section is a starting point he can merge or split, not a claim
 * about how the song goes.
 */
export function groupIntoSections(lines, per = 4) {
  const blocks = [];
  for (let i = 0; i < lines.length; i += per) {
    blocks.push(lines.slice(i, i + per));
  }
  return blocks;
}
