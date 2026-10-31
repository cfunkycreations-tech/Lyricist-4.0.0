import { CLICHE_RE, clicheFree } from './cliches.js';

/**
 * THE SUNO KIT: everything Suno's create screen asks for, written for the song.
 * Styles tags, a Voice line, a short Song description, and twenty Matrix words.
 * Pure helpers only (no network); AIService writes the kit, SunoKit.jsx shows it.
 */

/** Number of words handed to The Matrix: one per tile. */
export const MATRIX_WORD_COUNT = 20;

const MARKER_RE = /^[ \t]*[-=*#]{2,}[ \t]*(SUNO TAGS|MATRIX WORDS|VOICE(?: DESCRIPTION)?|SONG DESCRIPTION)[ \t]*[-=*#:]*[ \t]*$/gim;

/**
 * Splits a reply on its ---MARKER--- lines, in whatever order they come and
 * however the model dressed them (spaces, stars, a colon). Whatever sits before
 * the first marker is `head` (the lyrics, for Ghost Rider). A section the reply
 * never wrote is an empty string, so a short answer still parses.
 */
export function parseMarked(raw) {
  const text = String(raw || '');
  const out = { head: text, tags: '', words: '', voice: '', description: '' };
  const hits = [...text.matchAll(MARKER_RE)];
  if (!hits.length) return out;
  out.head = text.slice(0, hits[0].index);
  hits.forEach((m, i) => {
    const body = text.slice(m.index + m[0].length, i + 1 < hits.length ? hits[i + 1].index : undefined).trim();
    const key = /TAGS/i.test(m[1]) ? 'tags' : /WORDS/i.test(m[1]) ? 'words' : /VOICE/i.test(m[1]) ? 'voice' : 'description';
    if (!out[key]) out[key] = body;
  });
  out.head = out.head.trim();
  return out;
}

/** The two prose sections, as the model is asked to write them. */
export const KIT_PROSE_ASK = `---VOICE---
One or two plain sentences on how the singing voice sounds in this song: type of voice, tone, delivery, energy. No names, no real people, no lyrics.
---SONG DESCRIPTION---
One short paragraph, under 60 words, that describes the whole song for Suno's description box: genre, mood, tempo feel, the main instruments, what it is about in a few words, how it builds. Plain words. No lyrics, no artist names.`;

/** A name's search terms: the whole name, plus its longer words when it has several. */
function nameTerms(artist) {
  const full = String(artist || '').trim().toLowerCase();
  if (!full) return [];
  const words = full.split(/\s+/).filter((w) => w.length >= 5);
  return [full, ...(full.includes(' ') ? words : [])];
}

/**
 * One tidy paragraph: markdown and quotes off, sentences that name the artist
 * or use a banned word dropped, trimmed to whole sentences under `max`.
 */
export function cleanProse(text, artist = '', max = 480) {
  const terms = nameTerms(artist);
  const flat = String(text || '')
    .replace(/[*_`#>]+/g, '')
    .replace(/^\s*(voice|song description|description)\s*:\s*/i, '')
    .replace(/\s*\n\s*/g, ' ')
    .replace(/^["'\s]+|["'\s]+$/g, '')
    .trim();
  const sentences = flat.split(/(?<=[.!?])\s+/).filter((s) => {
    const lc = s.toLowerCase();
    return s.trim() && !CLICHE_RE.test(s) && !terms.some((t) => lc.includes(t));
  });
  let out = '';
  for (const s of sentences) {
    if ((out + ' ' + s).trim().length > max) break;
    out = (out + ' ' + s).trim();
  }
  return out;
}

/** Style tags: one line, no artist names, nothing banned. */
export function cleanTags(block, artist = '') {
  const terms = nameTerms(artist);
  const seen = new Set();
  return clicheFree(
    String(block || '').trim().split('\n')[0].split(',').map((t) => t.replace(/^["'\s]+|["'.\s]+$/g, ''))
      .filter((t) => t.length > 2 && !terms.some((n) => t.toLowerCase().includes(n)))
  ).filter((t) => {
    const k = t.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).join(', ');
}

/** Split, de-banned, de-named, de-duplicated, trimmed to one per tile. */
/** How a track SOUNDS or is made. Those words are Suno tags; a lyric cannot say them. */
const SOUND_TERMS = /\b(808|hi-?hat|ad-?libs?|vocal runs?|syncopation|cadence|tempo|bpm|acoustic|folk|synth|reverb|bassline|beat|rhythmic|rhythm|melodic|melody|internal rhyme|rhyme scheme|flow|phrasing|production|mixing|autotune|falsetto)\b/i;

/**
 * A CRITIC'S WORDS: they describe how somebody writes instead of being anything
 * a song can say. Chris's Song A was built from twenty of these ("street
 * reportage", "confessional detail", "menacing mood", "deadpan threat") and
 * read like a review, not a song. Chris, 2026-10-24: "I can't work with this
 * garbage."
 */
export const CRITIC_TERMS = /\b(moods?|tones?|themes?|thematic|motifs?|imagery|narratives?|narrators?|personas?|delivery|reportage|aesthetics?|confessional|storytelling|wordplay|metaphors?|similes?|symbolism|lyricism|lyrical|introspect\w*|braggadocio|bravado|commentary|critiques?|juxtaposition|vulnerabilit\w*|deadpan|plainspoken|hypnotic|menacing|mantras?|vignettes?|anecdot\w*|depictions?|sensibilit\w*|subject matter|worldview|ethos|duality|tropes?|archetyp\w*|punchlines?|couplets?|stanzas?|verses?|choruses|refrains?|details?|portrayals?|nuanced?|fixation|obsessive|plainspoken|survival themes?)\b/i;

/**
 * The same idea, narrowed for checking finished LYRICS: words that only ever
 * turn up in a song when the model copied its instructions into it. ("Tone"
 * and "details" are left out here: a dial tone is a real thing to sing about.)
 */
export const LEAK_TERMS = /\b(reportage|confessional|imagery|narratives?|motifs?|aesthetics?|juxtaposition|braggadocio|introspect\w*|lyricism|symbolism|deadpan|plainspoken|wordplay|storytelling|vignettes?|personas?|subject matter|rhyme scheme|internal rhymes?|syllables?|cadence|emotional temp\w*|style dna|stress signature)\b/i;

export function cleanMatrixWords(block, artistName, { motifs = [] } = {}) {
  const terms = nameTerms(artistName);
  const named = (w) => terms.some((t) => String(w).toLowerCase().includes(t));
  const seen = new Set();
  // Comma-separated on one line is what we ask for, but models also hand back
  // one word per line or a numbered list. Reading only the first line then sent
  // The Matrix a single word (promo run, 2026-10-31: "spare key" and nothing
  // else). Read the whole first block, up to a blank line.
  const firstBlock = String(block || '').trim().split(/\n\s*\n/)[0];
  const words = clicheFree(
    firstBlock.split(/[,\n]/)
      .map((w) => w.replace(/^\s*(?:\d+[.)]|[-*•])\s*/, '').replace(/^["'\s]+|["'.\s]+$/g, ''))
      .filter((w) => w.length > 1 && w.length < 40 && !named(w) && !SOUND_TERMS.test(w) && !CRITIC_TERMS.test(w))
  ).filter((w) => {
    const k = w.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  // Short list: top up from the Style DNA image clusters rather than send fewer.
  for (const m of clicheFree(motifs)) {
    if (words.length >= MATRIX_WORD_COUNT) break;
    const k = String(m).toLowerCase().trim();
    if (k && !seen.has(k) && !named(k) && !CRITIC_TERMS.test(k)) { seen.add(k); words.push(String(m).trim()); }
  }
  return words.slice(0, MATRIX_WORD_COUNT);
}

/** The kit as one block of text, for a Copy-all button or a saved file. */
export function formatKit({ sunoTags = '', voice = '', description = '', matrixWords = [] } = {}) {
  const rows = [];
  if (sunoTags) rows.push(`STYLES\n${sunoTags}`);
  if (voice) rows.push(`VOICE\n${voice}`);
  if (description) rows.push(`SONG DESCRIPTION\n${description}`);
  if (matrixWords.length) rows.push(`MATRIX WORDS\n${matrixWords.join(', ')}`);
  return rows.join('\n\n');
}

/** A kit belongs to the song it was written for. Same start, same song. */
export const kitSignature = (source) => String(source || '').trim().slice(0, 60);
