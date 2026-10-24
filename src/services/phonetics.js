/**
 * HOW WORDS SOUND: syllables and rhymes, from the CMU Pronouncing Dictionary.
 *
 * The Matrix used to judge a rhyme by the last three LETTERS of a word, so
 * "counter" and "plea" were strangers and "phrase" and "plays" never met.
 * Chris, 2026-10-24, on the song that came out of it: "I can't work with this
 * garbage." Rhyme is sound, not spelling, so this reads how each word is said.
 *
 * The dictionary (src/assets/cmudict.txt, 125k words, about 860 KB over the
 * wire) loads only when something asks for it, which is when The Matrix opens.
 * Until it has loaded, and for words it does not know (slang, names), the
 * spelling stands in, marked with a "~" so a guess never passes for the real
 * thing.
 */
import { parsePhones } from '../core/arpabet.js';
import { rhymeClassOf, rhymeNucleus, rhymeCoda } from '../core/rhyme.js';
import { countSyllables } from '../utils/textAnalysis.js';

let dict = null;
let loading = null;

/** Load the dictionary once. Resolves to true when it is ready. */
export function loadPronunciations() {
  if (dict) return Promise.resolve(true);
  if (!loading) {
    loading = import('../assets/cmudict.txt?raw')
      .then((m) => {
        const map = new Map();
        for (const line of String(m.default || '').split('\n')) {
          const sp = line.indexOf(' ');
          if (sp > 0) map.set(line.slice(0, sp), line.slice(sp + 1));
        }
        dict = map;
        return true;
      })
      .catch((e) => {
        loading = null;
        throw e;
      });
  }
  return loading;
}

export const pronunciationsReady = () => !!dict;

const clean = (w) => String(w || '')
  .toLowerCase()
  .replace(/[’‘`]/g, "'")
  .replace(/[^a-z']/g, '')
  .replace(/^'+|'+$/g, '');

/** The phones for one word, or null when the dictionary does not know it. */
export function wordPhones(word) {
  if (!dict) return null;
  const w = clean(word);
  if (!w) return null;
  let p = dict.get(w);
  // runnin' / runnin -> running
  if (!p && /in$/.test(w)) p = dict.get(`${w}g`);
  // plurals and possessives the dictionary does not list
  if (!p && /'s$/.test(w)) { const b = dict.get(w.slice(0, -2)); if (b) p = `${b} Z`; }
  if (!p && /s$/.test(w)) { const b = dict.get(w.slice(0, -1)); if (b) p = `${b} Z`; }
  return p ? parsePhones(p) : null;
}

/** Syllables in one word: the dictionary's count, or the spelling rule. */
export function wordSyllables(word) {
  const ph = wordPhones(word);
  if (ph) return ph.filter((x) => x.isVowel).length || 1;
  const w = clean(word).replace(/'/g, '');
  if (!w) return /\d/.test(String(word)) ? String(word).replace(/\D/g, '').length : 0;
  return countSyllables(w);
}

/** What a singer actually sings on a line: ad-libs in (parentheses) are not part of the bar. */
export const sungPart = (line) => String(line || '').replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();

/** Words on a line, as sung. Hyphenated words count as their parts. */
export const lineWords = (line) => sungPart(line).split(/[\s\-–—/]+/).map((w) => w.trim()).filter((w) => /[a-z0-9]/i.test(w));

/** Syllables in a sung line. */
export function lineSyllables(line) {
  return lineWords(line).reduce((n, w) => n + wordSyllables(w), 0);
}

/**
 * The spelling stand-in: last vowel group to the end, silent e dropped.
 * "drip" -> "~ip", "hombos" -> "~os". Only ever equal to another guess.
 */
function spellingRime(word) {
  let w = clean(word).replace(/'/g, '');
  if (!w) return null;
  if (w.length > 3 && /[^aeiou]e$/.test(w)) w = w.slice(0, -1);
  w = w.replace(/igh/g, 'i').replace(/ph/g, 'f').replace(/ck/g, 'k');
  const m = w.match(/[aeiouy]+[^aeiouy]*$/);
  return m ? `~${m[0]}` : `~${w.slice(-2)}`;
}

/** The rhyme of a word or phrase: its last word from the last stressed vowel on ("light" -> "AY T"). */
export function rhymeKey(wordOrPhrase) {
  const words = lineWords(wordOrPhrase);
  const last = words[words.length - 1];
  if (!last) return null;
  const ph = wordPhones(last);
  if (ph) return rhymeClassOf(ph);
  return spellingRime(last);
}

/** The vowels of the last `n` syllables of a phrase, stress stripped: "spoke it" -> ["OW", "IH"]. */
function tailVowels(phrase, n = 2) {
  const words = lineWords(phrase);
  const vowels = [];
  for (let i = words.length - 1; i >= 0 && vowels.length < n; i--) {
    const ph = wordPhones(words[i]);
    if (!ph) return null;
    const v = ph.filter((x) => x.isVowel).map((x) => x.symbol);
    while (v.length && vowels.length < n) vowels.unshift(v.pop());
  }
  return vowels.length === n ? vowels : null;
}

/**
 * How two line endings rhyme, by sound.
 *   multi   the last two vowel sounds match ("broke it" / "spoke it", "hold me" / "told me")
 *   perfect same sound from the last stressed vowel on ("night" / "light")
 *   slant   same vowel or same ending consonants ("home" / "alone", "phrase" / "plays")
 *   same    the same word again: allowed in a hook, weak anywhere else
 *   none
 */
export function rhymeKind(a, b) {
  const wa = lineWords(a);
  const wb = lineWords(b);
  const la = clean(wa[wa.length - 1]);
  const lb = clean(wb[wb.length - 1]);
  if (!la || !lb) return 'none';
  if (la === lb) {
    // "broke it" / "spoke it", "hold me" / "told me": the rhyme sits on the word before.
    const pa = clean(wa[wa.length - 2]);
    const pb = clean(wb[wb.length - 2]);
    if (pa && pb && pa !== pb) {
      const inner = rhymeKind(pa, pb);
      if (inner === 'perfect' || inner === 'multi') return 'multi';
      if (inner === 'slant') return 'slant';
    }
    return 'same';
  }
  const ka = rhymeKey(a);
  const kb = rhymeKey(b);
  if (!ka || !kb) return 'none';
  const guess = ka.startsWith('~') || kb.startsWith('~');
  if (guess) return ka === kb ? 'perfect' : 'none';
  const perfect = ka === kb;
  const sameNucleus = rhymeNucleus(ka) === rhymeNucleus(kb);
  const sameCoda = rhymeCoda(ka) !== '' && rhymeCoda(ka) === rhymeCoda(kb);
  if (perfect || sameNucleus) {
    const ta = tailVowels(a);
    const tb = tailVowels(b);
    if (ta && tb && ta[0] === tb[0] && ta[1] === tb[1] && wa.length + wb.length > 2) return 'multi';
  }
  if (perfect) return 'perfect';
  if (sameNucleus || sameCoda) return 'slant';
  return 'none';
}

/** How much a rhyme counts: multis and perfect rhymes in full, slant most of the way (it is the rap standard). */
export const RHYME_WEIGHT = { multi: 1, perfect: 1, slant: 0.75, same: 0.3, none: 0 };

/** Every pair in a word list that rhymes, best first. [{ i, j, kind }] */
export function findRhymePairs(words) {
  const out = [];
  for (let i = 0; i < words.length; i++) {
    for (let j = i + 1; j < words.length; j++) {
      const kind = rhymeKind(words[i], words[j]);
      if (kind !== 'none' && kind !== 'same') out.push({ i, j, kind });
    }
  }
  return out.sort((x, y) => RHYME_WEIGHT[y.kind] - RHYME_WEIGHT[x.kind]);
}
