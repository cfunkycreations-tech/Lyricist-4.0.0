/**
 * THE SONG GETS TAGGED. THE GHOST DOES NOT GET TO SKIP IT.
 *
 * Chris, 2026-09-15: *"when the ghost is making the songs, let's say he's in
 * Ghostwriter tab, writes in the style of the artist, blah blah blah. They're
 * not checking off the boxes like we designed it to. If you write a song in one
 * tab, then the attributes need to go with it. So the mood, the genre, the
 * subgenre, and vice versa. Needs to happen both ways... the ghost is bypassing
 * that process and it cannot do that. It needs to go and work through that
 * process of tagging songs. And when it's back into Black Hole Studios it's
 * going to go with the taxonomy."*
 *
 * WHAT WAS ACTUALLY BROKEN. Nothing was missing from the translation layer.
 * styleBridge has spoken both dialects since 2026-09-11 and the pickers have
 * always used it. But it only runs inside the LyricStore setters, and not one
 * of the Ghost's WRITING paths ever called them:
 *
 *   - Ghost Rider writes in an artist's style and produces Suno tags that name
 *     the genre, the subgenre, the mood, the tempo and the voice. They went
 *     into a box on screen and nowhere else.
 *   - Sending that to Songwriter passed `sunoTags` all the way through App.jsx
 *     and SongwriterHub read the lyrics, the artist and the notes out of it and
 *     dropped the tags on the floor.
 *   - Saving the tags wrote them to localStorage for the caption skill to read
 *     later, still without checking a single box.
 *
 * So the song arrived in Black Hole Studios with words and no taxonomy, and the
 * caption skill had to guess at the sound from scratch. The picks the whole app
 * is built to share were empty the entire way down the pipeline.
 *
 * This file is the missing step. It reads whatever the Ghost already knows
 * about the sound (Suno tags, mostly), resolves it into Songwriter's own
 * vocabulary, and sets it through the store, which is what makes styleBridge
 * fire and fill in Black Hole Studios' side. Tag it once, and both tabs, the
 * caption seed and the saved recipe all describe the same song.
 *
 * WHY THIS MATCHER IS STRICTER THAN THE ONE IN songwriter_set_style. That one
 * is handed names a model chose on purpose ("rnb soul", "r&b") and should bend
 * over backwards to land them. This one is handed keyword soup that also
 * contains instruments, tempos and production notes ("dusty chopped sample, 90
 * bpm, upright bass"), so it has to be able to IGNORE most of what it reads.
 * Loose matching there means a helpful pick; loose matching here means a
 * tambourine becomes a genre. Different jobs, deliberately different rules.
 */

import { genres as SW_GENRES, subgenres as SW_SUBGENRES, moods as SW_MOODS } from '../context/LyricStore.jsx';
import { MAX_PICKS } from '../utils/blend.js';

/** Lowercase, punctuation to single spaces. "R&B / Soul" -> "r b soul". */
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * The names one pick can go by.
 *
 * The lists are written for people to read, so they carry explanations in
 * brackets ("Euphoric (overjoyed)") and either/or slashes ("Chill / Laid-Back",
 * "Hip-Hop / Rap"). A tag says one of those halves, never the whole label, so
 * each half is a name this pick answers to.
 */
const aliasesFor = (entry) => {
  const full = String(entry || '');
  const bare = full.replace(/\([^)]*\)/g, ' ');
  const out = [full, bare, ...bare.split('/')].map(norm).filter(Boolean);
  return [...new Set(out)];
};

/** Whole-word phrase test, so "garage house" does not contain the subgenre "Rage". */
const hasPhrase = (haystack, needle) => {
  if (!needle) return false;
  const safe = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${safe}\\b`).test(haystack);
};

/**
 * Split a tag line into the things it is actually naming.
 *
 * Suno tags are comma separated by convention and the model is asked for them
 * that way, but this also copes with a line break or a semicolon, and keeps the
 * whole line as one more candidate for the case where somebody typed a
 * sentence instead of a list.
 */
const tokenize = (text) => {
  const whole = norm(text);
  if (!whole) return [];
  const parts = String(text).split(/[,;\n|]+/).map(norm).filter(Boolean);
  return [...new Set([...parts, whole])];
};

/**
 * Which entries of a list this text is naming.
 *
 * A hit is an exact name, or a token that CONTAINS the name as whole words.
 * The direction matters and is the whole reason this is safe: "dark trap"
 * contains "trap", so it finds Trap, while the bare mood word "dark" does not
 * contain "dark pop" and so never invents that subgenre. Pool order is kept,
 * because these lists are written most-common first.
 */
const matchPool = (tokens, pool, nameOf = (x) => x) => {
  const out = [];
  for (const entry of pool) {
    const names = aliasesFor(nameOf(entry));
    const hit = names.some((n) => tokens.some((t) => t === n || hasPhrase(t, n)));
    if (hit) out.push(entry);
  }
  return out;
};

const cap = (list) => [...new Set(list.filter(Boolean))].slice(0, MAX_PICKS);

/** Every subgenre in the app, with the genre it belongs to. */
const ALL_SUBGENRES = Object.entries(SW_SUBGENRES)
  .flatMap(([genre, subs]) => subs.map((name) => ({ name, genre })));

/**
 * Read a style description and say what it picks, in Songwriter's vocabulary.
 *
 * Subgenres pull their parent genre in with them: a tag line that says "east
 * coast" has named Hip-Hop / Rap whether or not it also said the words, and a
 * subgenre sitting under a genre nobody picked is the exact stranded state the
 * store prunes away a tick later anyway.
 */
export function tagsFromText(text) {
  const tokens = tokenize(text);
  if (!tokens.length) return { genres: [], subgenres: [], moods: [] };

  const moods = matchPool(tokens, SW_MOODS);
  const subHits = matchPool(tokens, ALL_SUBGENRES, (s) => s.name);
  const genreHits = matchPool(tokens, SW_GENRES);

  const genres = cap([...genreHits, ...subHits.map((s) => s.genre)]);
  // Only the subgenres whose genre survived the cap, so the two always agree.
  const subgenres = cap(subHits.filter((s) => genres.includes(s.genre)).map((s) => s.name));

  return { genres, subgenres, moods: cap(moods) };
}

/** Is this song tagged at all? Genre and mood are the two that decide a sound. */
export function isTagged(store) {
  return Boolean((store?.genreList || []).length && (store?.moodList || []).length);
}

/** What is checked right now, in one line, for the Ghost's context. */
export function tagSummary(store) {
  const g = (store?.genreList || []).join(' + ') || 'none';
  const s = (store?.subgenreList || []).join(' + ') || 'none';
  const m = (store?.moodList || []).join(' + ') || 'none';
  return `TAGS ON THIS SONG: genre ${g}; subgenre ${s}; mood ${m}.`;
}

const sentence = (list) => {
  if (list.length <= 1) return list.join('');
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
};

/**
 * TAG THE SONG. The one call every writing path makes.
 *
 * It FILLS BLANKS AND LEAVES ANSWERS ALONE. Chris clicked those pickers on
 * purpose, and the same rule that stops the Ghost rewriting his structure stops
 * it rewriting his genre: an empty picker is a question, a filled one is his
 * decision. Each of the three is judged on its own, so tags that name a mood
 * for a song he had already given a genre fill in just the mood. `force` is for
 * the one case where he asked for the style to be replaced outright.
 *
 * Setting them goes through `setStylePicks`, which translates once into Black
 * Hole Studios' taxonomy. That is the "and vice versa" half: tag it here and
 * the sound is already picked over there, with the instruments that go with it.
 */
export function applySongTags(store, { text, force = false } = {}) {
  const found = tagsFromText(text);
  if (!store?.setStylePicks) return { ...found, filled: [], said: '' };

  const next = {};
  const filled = [];
  const take = (key, listKey, found2) => {
    const already = (store[listKey] || []).length;
    if (!found2.length || (already && !force)) return;
    next[key] = found2;
    filled.push(...found2);
  };
  take('genres', 'genreList', found.genres);
  take('subgenres', 'subgenreList', found.subgenres);
  take('moods', 'moodList', found.moods);

  if (!filled.length) return { ...found, filled: [], said: '' };
  store.setStylePicks(next);
  return { ...found, filled, said: `checked off ${sentence(filled)}` };
}
