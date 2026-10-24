/**
 * THE MATRIX SONG ENGINE: how a grid of words becomes a song worth singing.
 *
 * Chris, 2026-10-24, holding up Song A ("Diary page open on street reportage,
 * brand name smudged by two phones and car keys beside the money counter"):
 * "I can't work with this garbage." What made it garbage, and what each part
 * of this file does about it:
 *
 *   1. All twenty words were crammed into a four-line verse, five to a line, so
 *      every line was a list. Now they are a palette: at most two in a line,
 *      most of them across the whole song, the hottest ones in the hook.
 *   2. Lines ended on whatever tile sat last in a row, then were told to rhyme.
 *      Now line endings are checked by sound (services/phonetics.js) and the
 *      grid puts rhyming words at the ends of its rows.
 *   3. Nothing said how many syllables fit a bar. Every section now has a
 *      syllable range from the delivery (rap or sung) and the tempo.
 *   4. The Style DNA went in raw and the model sang it ("short sentence"). It
 *      is translated into musical rules here, and any line that copies its
 *      wording is caught.
 *   5. The song kept that broken verse word for word and every section was four
 *      lines. Now it is a real song shape for Suno and the verse is a sketch.
 *   6. Every song is checked before anyone sees it: syllables, rhymes, the
 *      hook, banned and critic words. The lines that fail get one repair pass,
 *      and the scores show as Flow, Rhyme and Hook.
 *
 * Nothing in here calls the AI. It builds the messages, reads the answers and
 * scores them; QuantumLab.jsx makes the calls.
 */
import { CLICHE_RE, NO_CLICHES } from '../../services/cliches.js';
import { LEAK_TERMS } from '../../services/sunoKit.js';
import {
  lineSyllables, lineWords, rhymeKind, rhymeKey, RHYME_WEIGHT, findRhymePairs, pronunciationsReady,
} from '../../services/phonetics.js';

// ─── The two songs: what makes A and B different ─────────────────────────────

/**
 * The pairs a person can pick. Chris approved "A rap verses with a sung hook,
 * B fully sung, or let the user pick the pair (Story or Party, Clean or
 * Explicit)". `delivery: null` means "whatever the genre says".
 */
export const SONG_PAIRS = {
  rapSung: {
    label: 'Rap vs Sung',
    A: { name: 'Rap', delivery: 'rap', spin: 'Rap the verses, pre-chorus and bridge. The chorus is a SUNG hook: melodic, short, easy to sing back.' },
    B: { name: 'Sung', delivery: 'sung', spin: 'Every section is SUNG: a melodic song with room to breathe, long vowels on the strong beats. No rapping.' },
  },
  storyParty: {
    label: 'Story vs Party',
    A: { name: 'Story', delivery: null, spin: 'Tell a STORY: one person, one situation, things happen in order. Verse 1 sets it up, Verse 2 moves it on, the Bridge turns it.' },
    B: { name: 'Party', delivery: null, spin: 'Make it a PARTY song: energy over plot, a chant-along chorus, call-and-response in the hook, short punchy lines.' },
  },
  cleanExplicit: {
    label: 'Clean vs Explicit',
    A: { name: 'Clean', delivery: null, explicit: false, spin: 'CLEAN version: no profanity at all. Make the lines hit without it.' },
    B: { name: 'Explicit', delivery: null, explicit: true, spin: 'EXPLICIT version: adult language. Use real profanity, spelled out in full, where a real artist in this genre would. Never censor a word with asterisks.' },
  },
};

const RAP_GENRE = /\b(rap|hip[\s-]?hop|trap|drill|grime|boom[\s-]?bap|crunk|bounce|phonk|horrorcore|rapper|bars)\b/i;

/** Rap or sung, from everything that names the sound: genre picks, Suno tags, Style DNA. */
export function guessDelivery(genreText) {
  return RAP_GENRE.test(String(genreText || '')) ? 'rap' : 'sung';
}

/** "92 bpm" in the tags, if anyone said. */
export function bpmFrom(text) {
  const m = String(text || '').match(/\b(\d{2,3})\s*-?\s*bpm\b/i);
  const n = m ? Number(m[1]) : 0;
  return n >= 50 && n <= 220 ? n : 0;
}

// ─── Music theory: how long a line is, and which lines rhyme ─────────────────

/**
 * SYLLABLES PER LINE. One line is one bar in 4/4.
 *
 * A rapped bar at a hip-hop tempo (85-100 BPM) holds about 10-14 syllables on
 * the sixteenth-note grid; a slow beat leaves room for more, a fast one for
 * fewer. Trap tempos (130+) are felt in half time, so they sit back in the
 * normal range. A sung line holds far fewer, 7-11 in a verse, because every
 * syllable is a note and the strong beats want long vowels. Hooks are shortest
 * of all: short lines are the ones people sing back.
 */
export function syllableTargets(delivery, bpm = 0, dna = null) {
  const rap = delivery === 'rap';
  let verse = rap ? [10, 14] : [7, 11];
  if (rap && bpm) {
    if (bpm < 80) verse = [12, 16];
    else if (bpm > 110 && bpm < 130) verse = [8, 12];
  }
  const feel = `${dna?.rhythm || ''} ${dna?.cadenceNotes || ''}`.toLowerCase();
  if (rap && /double[\s-]?time|rapid|chopper|machine[\s-]?gun/.test(feel)) verse = [14, 18];
  else if (rap && /laid[\s-]?back|behind the beat|lazy|relaxed|unhurried|drawl/.test(feel)) verse = [verse[0] - 1, verse[1] - 2];
  return {
    Verse: verse,
    'Pre-Chorus': rap ? [8, 12] : [6, 9],
    Chorus: rap ? [6, 10] : [6, 9],
    Bridge: rap ? [9, 13] : [6, 10],
  };
}

/** Which lines of a section rhyme: couplets (1-2, 3-4…) or alternate (2-4, 6-8…). */
const COUPLETS = 'couplets';
const ALTERNATE = 'alternate';

/**
 * RHYME SCHEMES. Rap verses rhyme in couplets (AABB), the backbone of the
 * form; a sparse writer rhymes every other line (XAXA). Sung verses rhyme
 * every other line, which leaves the melody room, unless the writer is dense.
 * Choruses and pre-choruses rhyme in couplets: a hook is easier to remember
 * when it chimes.
 */
export function rhymeSchemes(delivery, density = '') {
  const d = String(density).toLowerCase();
  const rap = delivery === 'rap';
  const verse = rap ? (d === 'sparse' ? ALTERNATE : COUPLETS) : (d === 'dense' ? COUPLETS : ALTERNATE);
  return { Verse: verse, 'Pre-Chorus': COUPLETS, Chorus: COUPLETS, Bridge: rap ? COUPLETS : ALTERNATE };
}

const schemeWords = { [COUPLETS]: 'in couplets (lines 1-2, 3-4, and so on)', [ALTERNATE]: 'every other line (2 with 4, 6 with 8, and so on)' };

function pairsFor(scheme, n) {
  const out = [];
  if (scheme === COUPLETS) for (let i = 0; i + 1 < n; i += 2) out.push([i, i + 1]);
  else for (let i = 1; i + 2 < n; i += 4) out.push([i, i + 2]);
  return out;
}

// ─── Style DNA: rules, never text ────────────────────────────────────────────

/**
 * THE STYLE DNA, TRANSLATED. It used to go in as "cadence = short sentences,
 * plainspoken confession" and the model sang it back. Each part becomes a
 * musical instruction here; the DNA's own wording never reaches the prompt.
 */
export function dnaRules(dna, delivery) {
  if (!dna) return [];
  const rules = [];
  const density = String(dna.rhymeDensity || '').toLowerCase();
  if (density === 'dense') rules.push('Rhyme hard: besides the end rhymes, put an internal rhyme inside most lines, and use multi-syllable rhymes where they fit.');
  else if (density === 'sparse') rules.push('Rhyme lightly: only where the scheme asks. Let the other lines breathe.');
  else if (density) rules.push('Rhyme on every pair the scheme asks for, with an internal rhyme now and then.');
  const t = Number(dna.emotionalTemp);
  if (Number.isFinite(t)) {
    if (t >= 67) rules.push('Run hot: urgent verbs, raw feeling, short punchy lines in the hook.');
    else if (t >= 34) rules.push('Steady heat: plain speech with a few lines that cut.');
    else rules.push('Keep it cool: understated, small words, nothing shouted.');
  }
  const feel = `${dna.rhythm || ''} ${dna.cadenceNotes || ''}`.toLowerCase();
  if (/staccato|choppy|clipped|short (?:phrase|sentence|line)s?|punchy/.test(feel)) rules.push('Phrase it in short clipped bursts, with full stops inside the bar.');
  if (/run[\s-]?on|long (?:phrase|sentence|line)s?|flowing|legato/.test(feel)) rules.push('Let phrases run over the bar line now and then, so the flow rolls.');
  if (/conversational|plain|talk|spoken|matter[\s-]of[\s-]fact/.test(feel)) rules.push('Sound like somebody talking: everyday words, contractions, no poetry voice.');
  if (delivery === 'rap' && /melod|sing[\s-]?song|sung/.test(feel)) rules.push('Melodic rap: lines that could almost be sung, open vowels at the line ends.');
  if (/behind the beat|laid[\s-]?back|lazy|drawl/.test(feel)) rules.push('Leave space in the bar and land the line late, behind the beat.');
  if (/double[\s-]?time|rapid|chopper/.test(feel)) rules.push('Pack the bars: fast, tight syllables.');
  const images = (Array.isArray(dna.imageClusters) ? dna.imageClusters : []).filter(Boolean).slice(0, 8);
  if (images.length) rules.push(`Lean Verse 2's pictures toward these images, as pictures, never as a list: ${images.join('; ')}.`);
  return rules;
}

/** Two-word runs of the DNA's own wording, to catch it being sung back. */
const STOP = new Set('a an the and or but of to in on at for with by from as is are was were be been it its this that these those their his her my your our they them he she we you i me not no so very more most than then into over under out up down just like also some any each every one two'.split(' '));
export function dnaPhrases(dna) {
  if (!dna) return [];
  const text = `${dna.rhythm || ''} . ${dna.cadenceNotes || ''}`.toLowerCase().replace(/[^a-z\s.]/g, ' ');
  const out = new Set();
  for (const part of text.split('.')) {
    const ws = part.split(/\s+/).filter(Boolean);
    for (let i = 0; i + 1 < ws.length; i++) {
      if (!STOP.has(ws[i]) && !STOP.has(ws[i + 1]) && ws[i].length > 3 && ws[i + 1].length > 3) out.add(`${ws[i]} ${ws[i + 1]}`);
    }
  }
  return [...out];
}

// ─── The grid: line endings that rhyme ───────────────────────────────────────

/**
 * PUT RHYMING WORDS AT THE ENDS OF THE ROWS. The grid is 4 rows of 5 and the
 * last tile of each row is that line's ending, rows 1-2 and 3-4 rhyming. The
 * keywords used to land in typed order, so the endings were whatever came
 * fifth, tenth, fifteenth and twentieth. This finds two rhyming pairs in the
 * words and moves them to those spots. Nothing is added or taken away, and the
 * keyword box keeps the order it was typed in.
 */
export function arrangeForRhyme(words, cols = 5, rows = 4) {
  const list = [...(words || [])];
  const n = list.length;
  if (!pronunciationsReady() || n < 4) return list;
  const head = list.slice(0, Math.min(n, cols * rows));
  // Where each row's last tile reads from in the list (the grid cycles a short list).
  const endIdx = Array.from({ length: rows }, (_, r) => ((r + 1) * cols - 1) % head.length);
  if (new Set(endIdx).size < rows) return list;
  const pairs = findRhymePairs(head);
  const used = new Set();
  const chosen = [];
  for (const p of pairs) {
    if (chosen.length === 2) break;
    if (used.has(p.i) || used.has(p.j)) continue;
    chosen.push(p);
    used.add(p.i);
    used.add(p.j);
  }
  if (!chosen.length) return list;
  const out = new Array(head.length).fill(null);
  const placed = new Set();
  chosen.forEach((p, k) => {
    out[endIdx[k * 2]] = head[p.i];
    out[endIdx[k * 2 + 1]] = head[p.j];
    placed.add(p.i);
    placed.add(p.j);
  });
  const rest = head.filter((_, i) => !placed.has(i));
  let r = 0;
  for (let i = 0; i < out.length; i++) if (out[i] === null) out[i] = rest[r++];
  return [...out, ...list.slice(head.length)];
}

// ─── The prompts ─────────────────────────────────────────────────────────────

const WRITER = 'You are a hit songwriter who writes for real artists. You write lines people want to sing back: specific, physical, in the voice of a real person. You count syllables, you rhyme by sound, and you never explain. Never copy any real artist\'s lyrics or name them.\n' + NO_CLICHES;

const PLAIN_TALK = 'Write like a person talks. Every line is a real sentence somebody would say or sing, never a list of nouns. Never use words that describe writing (mood, theme, detail, imagery, narrative, confession, delivery, reportage, motif): say the thing itself.';

const RHYME_BY_SOUND = 'Rhymes are by SOUND: perfect (night / light), slant (home / alone) or multi-syllable (broke it / spoke it). Never rhyme a word with itself.';

/** What the model needs to know about the grid, as plain lines. */
function gridBrief(ctx, { maxWords, inHook = true }) {
  const lines = [];
  if (ctx.palette.length) {
    lines.push(`WORD PALETTE (raw material from the grid): ${ctx.palette.join(', ')}.`);
    lines.push(`Use ${maxWords} of them, never more than 2 in one line, each inside a real sentence. Pick the ones that make the best pictures.`);
  }
  if (inHook && ctx.hookWords.length) lines.push(`HOOK WORDS (the hottest tiles on the grid): build the chorus around ${ctx.hookWords.map((w) => `"${w}"`).join(' and ')}.`);
  if (ctx.rhymePairs.length) lines.push(`RHYME PAIRS from the grid you can end lines on: ${ctx.rhymePairs.map(([a, b]) => `${a} / ${b}`).join('; ')}.`);
  if (ctx.openChoices.length) lines.push(`OPEN CHOICES (pick one word from each set): ${ctx.openChoices.map((c) => c.join(' or ')).join('; ')}.`);
  for (const l of ctx.extraLinks || []) {
    lines.push(l.type === 'contrast' ? `"${l.a}" and "${l.b}" must NOT rhyme with each other.` : `Bring "${l.a}" back later in the song as "${l.b}" (a callback).`);
  }
  return lines;
}

const fmt = ([lo, hi]) => `${lo}-${hi}`;

/** The rules every song and remix is written under. */
function songRules(ctx, plan) {
  const t = plan.targets;
  const s = plan.schemes;
  const pre = plan.delivery === 'rap' ? 2 : 4;
  return [
    'Label every section in square brackets on its own line, in exactly this order:',
    '[Intro] 2 lines',
    '[Verse 1] 8 lines',
    `[Pre-Chorus] ${pre} lines`,
    '[Chorus] 4 lines. Line 1 is the TITLE line and line 4 repeats it word for word.',
    '[Verse 2] 8 lines, new pictures, the story moves on',
    '[Pre-Chorus] the same lines again',
    '[Chorus] written out in full again, word for word',
    '[Bridge] 4 lines that turn the song',
    '[Chorus] written out in full again, word for word',
    '[Outro] 2 lines',
    '',
    `SYLLABLES PER LINE (one line = one bar; count them): Verse ${fmt(t.Verse)}, Pre-Chorus ${fmt(t['Pre-Chorus'])}, Chorus ${fmt(t.Chorus)}, Bridge ${fmt(t.Bridge)}.`,
    `RHYME: Verses rhyme ${schemeWords[s.Verse]}. Pre-Chorus and Chorus rhyme in couplets. Bridge rhymes ${schemeWords[s.Bridge]}. ${RHYME_BY_SOUND}`,
    'Ad-libs or backing vocals go in (parentheses) at the end of a line, at most one every two lines. They do not count as syllables.',
    PLAIN_TALK,
  ];
}

/** The brief for one song: what it is, and how it differs from its partner. */
function songBrief(ctx, plan) {
  const out = [plan.spin];
  if (plan.explicit === true) out.push('Profanity is wanted in this one.');
  if (plan.explicit === false) out.push('No profanity in this one.');
  if (ctx.genre) out.push(`SOUND: ${ctx.genre}${ctx.bpm && !/bpm/i.test(ctx.genre) ? `, about ${ctx.bpm} BPM` : ''}.`);
  const dna = dnaRules(ctx.dna, plan.delivery);
  if (dna.length) out.push(`STYLE:\n- ${dna.join('\n- ')}`);
  return out;
}

/**
 * THE PLAN FOR ONE SONG: delivery, syllable ranges, rhyme schemes. Everything
 * the prompt promises and the checker holds the song to comes from here, so
 * the two can never disagree.
 */
export function makePlan(ctx, variant) {
  const pair = SONG_PAIRS[ctx.pairId] || SONG_PAIRS.rapSung;
  const v = pair[variant] || pair.A;
  const delivery = v.delivery || ctx.delivery || 'sung';
  const targets = syllableTargets(delivery, ctx.bpm, ctx.dna);
  // A rap song's hook is sung (Rap vs Sung), so its chorus is held to the sung range.
  if (ctx.pairId === 'rapSung' && variant === 'A') targets.Chorus = [6, 9];
  if (ctx.pairId === 'storyParty' && variant === 'B') targets.Chorus = [4, 8];
  const explicit = v.explicit !== undefined ? v.explicit : (ctx.explicit ? true : undefined);
  return {
    variant,
    pairId: ctx.pairId,
    name: v.name,
    delivery,
    spin: v.spin,
    explicit,
    targets,
    schemes: rhymeSchemes(delivery, ctx.dna?.rhymeDensity),
  };
}

/** How many palette words a whole song should use: most of them. */
const songWordGoal = (n) => (n <= 6 ? `all ${n}` : `at least ${Math.min(n, Math.max(6, Math.round(n * 0.7)))}`);

/** The 4-line sketch verse from the grid (Generate Neural Lyrics, and the first half of Auto-Craft). */
export function verseMessages(ctx, variant) {
  const plan = makePlan(ctx, variant);
  const t = plan.targets.Verse;
  const ends = ctx.gridEnds;
  const endLine = ends.a || ends.b
    ? `End the lines on the grid's rhyme pairs if they fit: ${[ends.a, ends.b].filter(Boolean).map(([x, y]) => `${x} / ${y}`).join(', then ')}.`
    : '';
  const user = [
    `Write ONE 4-line verse sketch from this word grid (${ctx.sectionLabel}).`,
    plan.delivery === 'rap' ? 'It is RAPPED: one line is one bar.' : 'It is SUNG: melodic lines with room to breathe.',
    ctx.pairId === 'rapSung' ? '' : plan.spin,
    ...gridBrief(ctx, { maxWords: '4 to 6', inHook: false }),
    `Each line is one bar of ${fmt(t)} syllables. Lines rhyme in couplets (1-2, 3-4). ${RHYME_BY_SOUND}`,
    endLine,
    PLAIN_TALK,
    ...dnaRules(ctx.dna, plan.delivery),
    'Output only the 4 lines.',
  ].filter(Boolean).join('\n');
  return [{ role: 'system', content: WRITER }, { role: 'user', content: user }];
}

/** One whole song, from the grid and its sketch verse. */
export function songMessages(ctx, variant, sketch = '') {
  const plan = makePlan(ctx, variant);
  const user = [
    `Write ONE complete song (Song ${variant}: ${plan.name}).`,
    ...songBrief(ctx, plan),
    '',
    ...gridBrief(ctx, { maxWords: songWordGoal(ctx.palette.length) }),
    sketch ? `\nSKETCH (a rough verse from the grid: keep any line that is good, rewrite the rest):\n${sketch}\n` : '',
    ...songRules(ctx, plan),
    'Output only the song.',
  ].join('\n');
  return { plan, messages: [{ role: 'system', content: WRITER }, { role: 'user', content: user }] };
}

/** The four one-tap remixes. */
export const REMIXES = {
  harder: { label: 'Harder', ask: 'Make it HIT HARDER: sharper verbs, more internal rhymes, tighter punchlines, more attitude. Same story.' },
  funnier: { label: 'Funnier', ask: 'Make it FUNNY: witty wordplay, a punchline in every verse, absurd specific details. Still a real song, never corny.' },
  sadder: { label: 'Sadder', ask: 'Make it HURT: quieter words, specific details of what was lost, a chorus that aches. Same story.' },
  hook: { label: 'Bigger Hook', ask: 'Make the CHORUS unforgettable: shorter lines, a title that repeats, a chant or call-and-response, simple words with open vowels on the long notes. The verses can stay close to how they are.' },
};

export function remixMessages(ctx, variant, song, kind) {
  const plan = makePlan(ctx, variant);
  const r = REMIXES[kind] || REMIXES.harder;
  const user = [
    `Remix this song. ${r.ask}`,
    ...songBrief(ctx, plan),
    ...gridBrief(ctx, { maxWords: songWordGoal(ctx.palette.length) }),
    ...songRules(ctx, plan),
    '',
    `SONG:\n${song}`,
    '',
    'Output the whole remixed song, every section labelled, and nothing else.',
  ].join('\n');
  return { plan, messages: [{ role: 'system', content: WRITER }, { role: 'user', content: user }] };
}

// ─── Reading and checking a song ─────────────────────────────────────────────

/** "Pre-Chorus" before "Chorus": the one contains the other. */
export function sectionKind(name) {
  const n = String(name || '');
  if (/pre[\s-]?chorus|pre[\s-]?hook|build/i.test(n)) return 'Pre-Chorus';
  if (/chorus|hook|refrain/i.test(n)) return 'Chorus';
  if (/verse/i.test(n)) return 'Verse';
  if (/bridge/i.test(n)) return 'Bridge';
  if (/intro/i.test(n)) return 'Intro';
  if (/outro/i.test(n)) return 'Outro';
  return 'Other';
}

/** Strip the model's wrapping: code fences, "Here is your song:". */
export function tidySong(out) {
  return String(out || '')
    .replace(/^\s*```\w*\s*\n?/, '')
    .replace(/\n?```\s*$/, '')
    .replace(/^\s*(here(?:'s| is)[^\n]*:)\s*\n/i, '')
    .replace(/\*\*(\[[^\]]+\])\*\*/g, '$1')
    .trim();
}

export function parseSong(text) {
  const sections = [];
  let cur = null;
  for (const raw of String(text || '').replace(/\r/g, '').split('\n')) {
    const t = raw.trim();
    if (!t) continue;
    const h = t.match(/^\[([^\]]+)\]$/);
    if (h) {
      cur = { name: h[1].trim(), kind: sectionKind(h[1]), lines: [] };
      sections.push(cur);
      continue;
    }
    if (!cur) {
      cur = { name: 'Verse 1', kind: 'Verse', lines: [] };
      sections.push(cur);
    }
    cur.lines.push(t);
  }
  return sections;
}

export function joinSong(sections) {
  return sections.map((s) => `[${s.name}]\n${s.lines.join('\n')}`).join('\n\n');
}

const norm = (l) => String(l || '').toLowerCase().replace(/\([^)]*\)/g, '').replace(/[^a-z0-9' ]/g, '').replace(/\s+/g, ' ').trim();

/**
 * SUNO SINGS ONLY WHAT IS ON THE PAGE. A chorus written as "(repeat)" or left
 * empty is a chorus that never gets sung, so it is written out in full from
 * the first one. No AI call: this one is mechanical.
 */
export function fillChoruses(text) {
  const sections = parseSong(text);
  const first = sections.find((s) => s.kind === 'Chorus' && s.lines.filter((l) => !/^\(?\s*(repeat|x\d|chorus)/i.test(l)).length >= 2);
  if (!first) return text;
  let changed = false;
  for (const s of sections) {
    if (s.kind !== 'Chorus' || s === first) continue;
    const real = s.lines.filter((l) => !/^\(?\s*(repeat|x\d|chorus)/i.test(l));
    if (real.length < 2) {
      s.lines = [...first.lines];
      changed = true;
    }
  }
  return changed ? joinSong(sections) : text;
}

/** Does a song use this palette word? Plurals and multi-word phrases count. */
export function usesWord(songText, word) {
  const w = String(word || '').toLowerCase().trim();
  if (!w) return false;
  const esc = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  return new RegExp(`\\b${esc}(?:s|es|'s)?\\b`, 'i').test(String(songText || ''));
}

const lastWords = (line, n = 2) => lineWords(line).slice(-n).join(' ');
const sectionLabel = (s, i) => `[${s.name}] line ${i + 1}`;

/**
 * SCORE A SONG: Flow, Rhyme and Hook, 0 to 1 each, and the list of lines that
 * failed and why. The same list drives the repair pass, so a problem the
 * person can see is a problem the repair was asked to fix.
 */
export function scoreSong(text, plan, ctx) {
  const sections = parseSong(text);
  const problems = [];
  const songText = String(text || '');

  // FLOW: every scored line inside its syllable range.
  let flowSum = 0;
  let flowN = 0;
  for (const s of sections) {
    const range = plan.targets[s.kind];
    if (!range) continue;
    s.lines.forEach((line, i) => {
      const n = lineSyllables(line);
      const [lo, hi] = range;
      const off = n < lo ? lo - n : n > hi ? n - hi : 0;
      flowSum += off === 0 ? 1 : off === 1 ? 0.75 : off === 2 ? 0.4 : 0;
      flowN += 1;
      if (off > 1) problems.push({ type: 'syllables', at: sectionLabel(s, i), line, why: `${n} syllables, needs ${lo}-${hi}` });
    });
  }

  // RHYME: every pair the scheme asks for, judged by sound.
  let rhymeSum = 0;
  let rhymeN = 0;
  const seenChorus = new Set();
  for (const s of sections) {
    const scheme = plan.schemes[s.kind];
    if (!scheme) continue;
    // A repeated chorus is the same lines again; score it once.
    if (s.kind === 'Chorus') {
      const key = s.lines.map(norm).join('|');
      if (seenChorus.has(key)) continue;
      seenChorus.add(key);
    }
    for (const [a, b] of pairsFor(scheme, s.lines.length)) {
      // In a hook a repeated title line is the point, not a lazy rhyme.
      let kind = rhymeKind(lastWords(s.lines[a]), lastWords(s.lines[b]));
      if (kind === 'same' && s.kind === 'Chorus') kind = 'perfect';
      rhymeSum += RHYME_WEIGHT[kind];
      rhymeN += 1;
      if (kind === 'none' || kind === 'same') {
        problems.push({
          type: 'rhyme',
          at: `[${s.name}] lines ${a + 1} and ${b + 1}`,
          line: `${s.lines[a]} / ${s.lines[b]}`,
          why: kind === 'same' ? `both end on the same word, "${lineWords(s.lines[b]).slice(-1)[0]}"` : `"${lineWords(s.lines[a]).slice(-1)[0]}" and "${lineWords(s.lines[b]).slice(-1)[0]}" do not rhyme`,
        });
      }
    }
  }

  // HOOK: repeated in full, the title first and last, short lines, the hot words in it.
  const choruses = sections.filter((s) => s.kind === 'Chorus');
  const first = choruses[0];
  let hook = 0;
  if (first && first.lines.length) {
    const key = first.lines.map(norm).join('|');
    const same = choruses.filter((c) => c.lines.map(norm).join('|') === key).length;
    const repeat = choruses.length >= 3 && same === choruses.length ? 1 : choruses.length >= 2 ? 0.6 : 0.2;
    const titleOk = first.lines.length >= 2 && norm(first.lines[0]) === norm(first.lines[first.lines.length - 1]) ? 1 : 0;
    const range = plan.targets.Chorus;
    const inRange = first.lines.filter((l) => { const n = lineSyllables(l); return n >= range[0] - 1 && n <= range[1] + 1; }).length / first.lines.length;
    const hot = ctx.hookWords.length ? ctx.hookWords.filter((w) => usesWord(first.lines.join('\n'), w)).length / ctx.hookWords.length : 1;
    hook = 0.3 * repeat + 0.2 * titleOk + 0.2 * inRange + 0.3 * hot;
    if (!titleOk) problems.push({ type: 'hook', at: `[${first.name}]`, line: first.lines[0], why: 'the chorus must start and end on the same title line' });
    if (choruses.length < 3) problems.push({ type: 'hook', at: '[Chorus]', line: '', why: `the chorus appears ${choruses.length} time(s); it must come back 3 times, written out in full` });
    if (ctx.hookWords.length && hot < 0.5) problems.push({ type: 'hook', at: `[${first.name}]`, line: '', why: `build the chorus around the hook words: ${ctx.hookWords.join(', ')}` });
  } else {
    problems.push({ type: 'hook', at: '[Chorus]', line: '', why: 'there is no chorus' });
  }

  // LEAKS: instructions sung back, critic words, banned words.
  const dnaRuns = dnaPhrases(ctx.dna);
  const allowBanned = ctx.palette.some((w) => CLICHE_RE.test(w));
  for (const s of sections) {
    s.lines.forEach((line, i) => {
      const low = line.toLowerCase();
      const leak = LEAK_TERMS.exec(line)?.[0] || dnaRuns.find((p) => low.includes(p));
      if (leak) problems.push({ type: 'leak', at: sectionLabel(s, i), line, why: `"${leak}" is talk about writing, not a lyric; say the real thing instead` });
      const banned = !allowBanned && CLICHE_RE.exec(line)?.[0];
      if (banned) problems.push({ type: 'banned', at: sectionLabel(s, i), line, why: `"${banned}" is on the banned list` });
    });
  }

  // SHAPE: two verses and a bridge at least.
  const verses = sections.filter((s) => s.kind === 'Verse').length;
  if (verses < 2) problems.push({ type: 'shape', at: '', line: '', why: `the song has ${verses} verse(s); it needs [Verse 1] and [Verse 2]` });
  if (!sections.some((s) => s.kind === 'Bridge')) problems.push({ type: 'shape', at: '', line: '', why: 'the song has no [Bridge]' });

  const used = ctx.palette.filter((w) => usesWord(songText, w));
  const flow = flowN ? flowSum / flowN : 0;
  const rhyme = rhymeN ? rhymeSum / rhymeN : 0;
  return {
    flow,
    rhyme,
    hook,
    total: flow + rhyme + hook - Math.min(0.5, problems.filter((p) => p.type === 'leak' || p.type === 'banned' || p.type === 'shape').length * 0.1),
    used,
    problems,
  };
}

/** Any line that failed gets the repair pass: a line two syllables over still trips the singer. */
export const needsRepair = (score) => score.problems.length > 0;

/** ONE repair pass: only the lines that failed, everything else kept word for word. */
export function repairMessages(ctx, plan, song, score) {
  const list = score.problems.slice(0, 24).map((p) => `- ${p.at ? `${p.at}: ` : ''}${p.line ? `"${p.line}" ` : ''}— ${p.why}.`).join('\n');
  const user = [
    'Here is a song. Fix ONLY the problems listed below and keep every other line exactly as it is, with the same section labels.',
    `Syllable ranges: Verse ${fmt(plan.targets.Verse)}, Pre-Chorus ${fmt(plan.targets['Pre-Chorus'])}, Chorus ${fmt(plan.targets.Chorus)}, Bridge ${fmt(plan.targets.Bridge)}. ${RHYME_BY_SOUND}`,
    'If a chorus line changes, change it in every chorus so they stay identical.',
    PLAIN_TALK,
    '',
    `PROBLEMS:\n${list}`,
    '',
    `SONG:\n${song}`,
    '',
    'Output the whole fixed song and nothing else.',
  ].join('\n');
  return [{ role: 'system', content: WRITER }, { role: 'user', content: user }];
}

// ─── Rhyme colours for the lyrics on screen ──────────────────────────────────

const COLOR_STOP = new Set("i a an the and or but of to in on at for with by from as is are was were be it its i'm im me my you your we us our he him his she her they them their this that so no not do did up out all just like got get can can't don't won't it's".split(' '));

/**
 * RHYMING SOUNDS SHARE A COLOUR. Within each section, words whose sounds rhyme
 * (end rhymes and the internal rhymes inside a line) are painted the same
 * colour, so you see the rhyme scheme at a glance. Returns, per section, per
 * line, the pieces of the line with a colour index (or null).
 */
export function rhymeColors(text, plan = null) {
  const sections = parseSong(text);
  return sections.map((s) => {
    const tokens = s.lines.map((line) => {
      // Keep the spaces so the line reads exactly as written.
      const parts = line.split(/(\s+)/);
      // The last sung word always counts, even a small one: "you" / "true" is a rhyme.
      let lastSung = -1;
      let depth = 0;
      parts.forEach((p, i) => {
        if (p.includes('(')) depth += 1;
        if (depth === 0 && /[a-z]/i.test(p)) lastSung = i;
        if (p.includes(')')) depth = Math.max(0, depth - 1);
      });
      let inParen = false;
      return parts.map((p, i) => {
        const opens = p.includes('(');
        const closes = p.includes(')');
        const piece = { t: p, key: null, word: '' };
        if (!/\S/.test(p)) return piece;
        const w = p.toLowerCase().replace(/[^a-z']/g, '');
        if (!opens && !inParen && w && (i === lastSung || (w.length > 2 && !COLOR_STOP.has(w)))) {
          piece.key = rhymeKey(w);
          piece.word = w;
        }
        if (opens && !closes) inParen = true;
        if (closes) inParen = false;
        return piece;
      });
    });
    // Slant end rhymes the scheme asked for ("cracked" / "sack") join their
    // partner's sound group, so the pair shares a colour. Groups merge, never swap.
    const parent = new Map();
    const find = (k) => { let r = k; while (parent.has(r)) r = parent.get(r); return r; };
    const scheme = plan?.schemes?.[s.kind];
    if (scheme) {
      for (const [a, b] of pairsFor(scheme, s.lines.length)) {
        const ea = [...tokens[a]].reverse().find((p) => p.key);
        const eb = [...tokens[b]].reverse().find((p) => p.key);
        if (ea && eb && rhymeKind(ea.word, eb.word) === 'slant') {
          const ra = find(ea.key);
          const rb = find(eb.key);
          if (ra !== rb) parent.set(rb, ra);
        }
      }
    }
    // A sound is a rhyme here only if two DIFFERENT words share it.
    const wordsByKey = new Map();
    tokens.flat().forEach((p) => {
      if (!p.key) return;
      const r = find(p.key);
      if (!wordsByKey.has(r)) wordsByKey.set(r, new Set());
      wordsByKey.get(r).add(p.word);
    });
    const colorOf = new Map();
    let next = 0;
    return {
      name: s.name,
      lines: tokens.map((parts) => parts.map((p) => {
        const k = p.key ? find(p.key) : null;
        if (!k || (wordsByKey.get(k)?.size || 0) < 2) return { t: p.t, c: null };
        if (!colorOf.has(k)) colorOf.set(k, next++ % 6);
        return { t: p.t, c: colorOf.get(k) };
      })),
    };
  });
}
