/**
 * @file RhymeService.js
 * @description Real rhymes, near-rhymes, synonyms and antonyms.
 *
 * The Rhyme Coach and the Lexicon both used to invent their results by gluing
 * suffixes onto whatever was typed — "street" came back as "streeter",
 * "streeting", "restreet". This talks to Datamuse instead, which is a free,
 * keyless word API built for exactly this.
 *
 * Design notes:
 * - Results are cached per word+kind, so retyping a line costs nothing.
 * - In-flight requests are shared, so a fast typist cannot stack duplicates.
 * - Every failure resolves to an empty list. A dropped connection should leave
 *   the coach bar quiet, never break the editor the song is being written in.
 */

const ENDPOINT = 'https://api.datamuse.com/words';

/** Datamuse query parameter for each lookup kind. */
const KINDS = {
  perfect: 'rel_rhy',   // full rhymes
  slant: 'rel_nry',     // near rhymes
  synonym: 'ml',        // means like
  antonym: 'rel_ant',   // opposites
  sounds: 'sl'          // sounds like
};

/** @type {Map<string, string[]>} */
const cache = new Map();

/** @type {Map<string, Promise<string[]>>} */
const inflight = new Map();

/** Rough syllable count — vowel groups, minus a silent trailing "e". */
export function countSyllables(word) {
  const w = String(word).toLowerCase().trim();
  if (!w) return 0;
  const groups = w.match(/[aeiouy]+/g) || [];
  let n = groups.length;
  if (/[^aeiouy]e$/.test(w) && n > 1) n -= 1;
  return Math.max(1, n);
}

/**
 * Looks up words related to `word`.
 *
 * @param {string} word - The word to look up.
 * @param {'perfect'|'slant'|'synonym'|'antonym'|'sounds'} [kind='perfect']
 * @param {number} [limit=12] - Maximum results.
 * @returns {Promise<Array<{word: string, syllables: number}>>}
 */
export async function lookup(word, kind = 'perfect', limit = 12) {
  const clean = String(word || '').toLowerCase().replace(/[^a-z'-]/g, '').trim();
  if (clean.length < 2) return [];

  const param = KINDS[kind] || KINDS.perfect;
  const key = `${param}:${clean}:${limit}`;

  if (cache.has(key)) return cache.get(key);
  if (inflight.has(key)) return inflight.get(key);

  const req = (async () => {
    try {
      const url = `${ENDPOINT}?${param}=${encodeURIComponent(clean)}&max=${limit}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Datamuse ${res.status}`);
      const json = await res.json();
      const out = (Array.isArray(json) ? json : [])
        .map(r => ({
          word: r.word,
          // Datamuse returns numSyllables only when asked for metadata; fall
          // back to counting so the pill always has a number.
          syllables: r.numSyllables || countSyllables(r.word)
        }))
        .filter(r => r.word && r.word !== clean);
      cache.set(key, out);
      return out;
    } catch {
      // Offline or blocked: stay quiet rather than showing invented words.
      cache.set(key, []);
      return [];
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, req);
  return req;
}

/**
 * The three buckets the Rhyme Coach shows, fetched together.
 *
 * @param {string} word
 * @returns {Promise<{perfect: string[], slant: string[], multi: string[]}>}
 */
export async function rhymeSets(word) {
  const [perfect, slant] = await Promise.all([
    lookup(word, 'perfect', 12),
    lookup(word, 'slant', 12)
  ]);

  // "Multi" means multi-syllabic: the longer rhymes, which are the ones worth
  // surfacing separately when writing bars.
  const multi = [...perfect, ...slant].filter(r => r.syllables >= 2).map(r => r.word);
  const seen = new Set();
  const dedupe = (list) => list.filter(w => (seen.has(w) ? false : seen.add(w)));

  return {
    perfect: dedupe(perfect.filter(r => r.syllables === 1).map(r => r.word)).slice(0, 6),
    slant: dedupe(slant.map(r => r.word)).slice(0, 6),
    multi: dedupe(multi).slice(0, 6)
  };
}

export default { lookup, rhymeSets, countSyllables };
