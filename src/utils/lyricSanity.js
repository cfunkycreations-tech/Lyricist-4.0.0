/**
 * Garbage detector for anything a language model hands back — Lyricist 4.2.0
 *
 * WHY THIS EXISTS
 * A generated song came back with two good sections, a third that wobbled, and
 * then several thousand tokens of this:
 *
 *   "syl light blue emere glow?? that renn dryp fade (play) pard лу affiliate
 *    menGO catchy prest NOR ... hand stack smirk pole tx v blind venue gaps
 *    reliable Hold GET closedRock noneMD youth aggregate ..."
 *
 * Subword fragments ("syl", "renn", "dryp"), words fused to random tokens
 * ("menGO", "closedRock", "noneMD"), programming vocabulary in a love song
 * ("HTML", "GET", "env", "lambda", "refactor", "getters"), and Cyrillic,
 * Arabic, Korean and Chinese sprinkled through it. Then it kept going until it
 * hit the token ceiling.
 *
 * The app saved every word of it into his song, because nothing was checking.
 * A model can always fall over — a router can hand a lyric prompt to a coding
 * agent, a cheap model can lose the thread, a response can get truncated. The
 * app's job is to notice and refuse, not to write it into somebody's work.
 *
 * The bar is deliberately set to catch COLLAPSE, not weird-but-deliberate
 * writing. Songwriters invent words, use slang, drop in a foreign phrase. None
 * of that trips this: it takes several signals firing at once.
 */

// Letters from scripts an English lyric will not contain by the paragraph.
// A single word in another language is fine; a drift into another alphabet is not.
const FOREIGN_SCRIPT = /[Ͱ-ϿЀ-ӿ԰-֏֐-׿؀-ۿऀ-ॿ฀-๿ᄀ-ᇿ぀-ヿ㐀-鿿가-힯]/g;

// Vocabulary that means a coding or API model answered a songwriting question.
const CODE_WORDS = new Set([
  'html', 'php', 'lambda', 'refactor', 'getters', 'setters', 'controller', 'buffer',
  'boolean', 'const', 'async', 'await', 'stdout', 'stderr', 'params', 'endpoint',
  'middleware', 'namespace', 'struct', 'enum', 'regex', 'json', 'xml', 'sql',
  'localhost', 'nginx', 'kubernetes', 'docker', 'commit', 'repo', 'stacktrace',
  'nullptr', 'undefined', 'typeof', 'iterable', 'mutable', 'immutable', 'visitor',
  'mapper', 'serializer', 'deserialize', 'multithread', 'runtime', 'compiler',
]);

const WORD = /[A-Za-z][A-Za-z'’-]*/g;

/** camelCase or wordCAPS fusions: "menGO", "closedRock", "trueGH", "noneMD". */
function fusedWordCount(words) {
  let n = 0;
  for (const w of words) {
    if (w.length < 4) continue;
    // a lower-case run followed by an upper-case run, inside one token
    if (/^[a-z]{2,}[A-Z]{1,}/.test(w)) n++;
  }
  return n;
}

/**
 * Inspect one block of generated text.
 * Returns { ok, score, reasons, stats } — `score` 0 (clean) to 1 (rubble).
 */
export function inspectGenerated(text) {
  const raw = String(text || '');
  const reasons = [];
  if (!raw.trim()) {
    return { ok: false, score: 1, reasons: ['empty response'], stats: {} };
  }

  const letters = (raw.match(/[A-Za-z]/g) || []).length;
  const foreign = (raw.match(FOREIGN_SCRIPT) || []).length;
  const words = raw.match(WORD) || [];
  const lower = words.map((w) => w.toLowerCase());

  const foreignRatio = letters ? foreign / (letters + foreign) : 0;
  const codeHits = lower.filter((w) => CODE_WORDS.has(w)).length;
  const fused = fusedWordCount(words);
  const fusedRatio = words.length ? fused / words.length : 0;

  // A collapsed run stops using short common words — "the/and/a/to/of" vanish
  // because it is no longer forming sentences.
  const COMMON = new Set(['the', 'and', 'a', 'to', 'of', 'in', 'i', 'you', 'it', 'my', 'on', 'me', 'that', 'is', 'like', 'we', 'for', 'your']);
  const commonRatio = words.length ? lower.filter((w) => COMMON.has(w)).length / words.length : 0;

  let score = 0;
  if (foreignRatio > 0.004) { score += 0.45; reasons.push(`${(foreignRatio * 100).toFixed(1)}% non-Latin characters`); }
  if (codeHits >= 3) { score += 0.3; reasons.push(`${codeHits} programming words`); }
  if (fusedRatio > 0.02) { score += 0.3; reasons.push(`${fused} fused tokens like "menGO"`); }
  if (words.length > 60 && commonRatio < 0.06) { score += 0.3; reasons.push('barely any ordinary English words left'); }

  return {
    ok: score < 0.45,
    score: Math.min(1, score),
    reasons,
    stats: { words: words.length, foreignRatio, codeHits, fused, commonRatio },
  };
}

/**
 * Cut a response at the point it stops being a song.
 *
 * Collapse is progressive — the top of the reply is usually fine. Rather than
 * throwing away good verses because the tail rotted, walk the lines and stop at
 * the first one that is clearly rubble. Returns the good part plus what was
 * dropped, so the caller can say so out loud.
 */
export function truncateAtCollapse(text) {
  const lines = String(text || '').split('\n');
  const kept = [];
  let dropped = 0;
  let firstBadLine = null;

  for (const line of lines) {
    const t = line.trim();
    // Section headers and blanks always survive.
    if (!t || /^\[.+\]$/.test(t)) { kept.push(line); continue; }

    const v = inspectGenerated(t);
    // A single line is a small sample, so judge it harder than a whole block:
    // any foreign script or fusion in one lyric line is already wrong.
    const bad = v.score >= 0.45
      || FOREIGN_SCRIPT.test(t)
      || fusedWordCount(t.match(WORD) || []) >= 2
      || t.split(/\s+/).length > 40;          // lyric lines are not 40 words long
    FOREIGN_SCRIPT.lastIndex = 0;

    if (bad) {
      if (firstBadLine === null) firstBadLine = t.slice(0, 80);
      dropped++;
      continue;
    }
    kept.push(line);
  }

  // Trailing empties and orphan headers left by the cut
  while (kept.length && !kept[kept.length - 1].trim()) kept.pop();
  while (kept.length && /^\[.+\]$/.test(kept[kept.length - 1].trim())) {
    kept.pop();
    while (kept.length && !kept[kept.length - 1].trim()) kept.pop();
  }

  return { text: kept.join('\n'), dropped, firstBadLine };
}
