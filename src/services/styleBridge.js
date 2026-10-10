/**
 * ONE SET OF CHOICES, SPOKEN IN TWO VOCABULARIES.
 *
 * Chris, 2026-09-11: *"they need to match what was in Songwriter and vice
 * versa... they all need to work intuitively and they need to work back and
 * forth. If one setting is one way in one tab it needs to be the same in all
 * the tabs."*
 *
 * The problem is that the two pickers were never speaking the same language.
 * Songwriter asks for a WRITING genre out of a short broad list (28 of them,
 * each with a handful of subgenres) because that is what a lyric prompt wants.
 * Black Hole Studios asks for a SOUND out of musicTaxonomy — three hundred
 * named traditions, each carrying the instruments that make it sound like
 * itself — because that is what the caption wants. Neither list is wrong and
 * neither can replace the other: "Hip-Hop / Rap" tells a model how to write, and
 * "Boom bap — dusty chopped sample, hard snare, upright bass loop" tells it what
 * to play.
 *
 * So the picks stay in one place (LyricStore) and this file translates between
 * the two dialects whenever one of them changes. Pick Hip-Hop / Rap + East Coast
 * in Songwriter and Black Hole Studios is already set to Boom bap; pick Amapiano
 * over there and Songwriter says Afrobeats → Amapiano when you come back.
 *
 * Nothing here guesses cleverly. It is a written-down table plus a fallback by
 * family, because a fuzzy string match that quietly turns Gospel into Gqom is
 * worse than no translation at all.
 */

import { genres as SW_GENRES, subgenres as SW_SUBGENRES, moods as SW_MOODS } from '../context/LyricStore.jsx';
import { GENRE_GROUPS, ALL_MOODS } from './musicTaxonomy.js';
import { MAX_PICKS } from '../utils/blend.js';

/* ── GENRES ─────────────────────────────────────────────────────────────── */

/** Songwriter's broad genre → the closest single sound in the taxonomy. */
const GENRE_TO_BH = {
  'Hip-Hop / Rap': 'Boom bap',
  'R&B / Soul': 'Soul',
  'Pop': 'Pop',
  'Trap': 'Trap',
  'Drill': 'Drill',
  'Country': 'Country',
  'Rock': 'Rock',
  'Gospel / Gospel Rap': 'Gospel',
  'Afrobeats': 'Afrobeats',
  'Reggae / Dancehall': 'Reggae',
  'Lo-Fi / Boom Bap': 'Lo-fi hip hop',
  'Alternative': 'Indie rock',
  'EDM / Dance': 'EDM / big room',
  'Jazz / Neo-Soul': 'Neo-soul',
  'Latin / Reggaeton': 'Reggaeton',
  'Metal / Heavy Rock': 'Heavy metal',
  'Punk / Pop Punk': 'Punk',
  'Indie Pop / Bedroom Pop': 'Bedroom pop',
  'Folk / Americana': 'Americana',
  'Blues / Soul Blues': 'Electric blues',
  'Funk': 'Funk',
  'K-Pop': 'K-pop',
  'Phonk': 'Phonk',
  'Conscious / Spoken Word': 'Spoken word with music',
  'Grunge / 90s Alt': 'Grunge',
  'Hyperpop / Glitchcore': 'Hyperpop',
  'Corridos / Regional Mexican': 'Corrido',
  'Synthwave / Retrowave': 'Synthwave',
};

/**
 * Songwriter's subgenre → the sound it actually is.
 *
 * A subgenre beats its parent genre when both are picked: somebody who said
 * West Coast wants G-funk, not generic boom bap. Anything left out of this table
 * falls back to its parent, which is why it is fine that a few (Latin Pop, say)
 * have no honest one-to-one match over there.
 */
const SUBGENRE_TO_BH = {
  // Hip-Hop / Rap
  'East Coast': 'Boom bap', 'West Coast': 'G-funk', 'Southern Rap': 'Southern rap',
  'Boom Bap': 'Boom bap', 'Conscious Rap': 'Conscious hip hop',
  // R&B / Soul
  'Contemporary R&B': 'Contemporary R&B', 'Neo-Soul': 'Neo-soul', 'Classic Soul': 'Southern soul',
  'Motown': 'Motown', 'Quiet Storm': 'Quiet storm',
  // Pop
  'Synthpop': 'Synth-pop', 'Electropop': 'Synth-pop', 'Bubblegum Pop': 'Teen pop',
  'Indie Pop': 'Bedroom pop', 'Dark Pop': 'Art pop',
  // Trap
  'Melodic Trap': 'Trap', 'Rage': 'Trap', 'Dark Trap': 'Trap', 'Plugg': 'Trap',
  'Ethereal Trap': 'Cloud rap',
  // Drill
  'UK Drill': 'UK drill', 'Brooklyn Drill': 'Drill', 'Chicago Drill': 'Drill', 'Sample Drill': 'Drill',
  // Country
  'Bro-Country': 'Country rock', 'Outlaw Country': 'Outlaw country', 'Bluegrass': 'Bluegrass',
  'Country Pop': 'Country', 'Traditional Country': 'Honky tonk',
  // Rock
  'Classic Rock': 'Classic rock', 'Hard Rock': 'Hard rock', 'Stoner Rock': 'Stoner rock', 'Southern Rock': 'Southern rock', 'Blues Rock': 'Blues rock', 'Psychedelic Rock': 'Psychedelic rock',
  'Arena Rock': 'Classic rock', 'Progressive Rock': 'Progressive rock',
  // Gospel
  'Contemporary Gospel': 'Gospel', 'Urban Contemporary': 'Contemporary R&B',
  'Gospel Rap': 'Gospel blues', 'Traditional Gospel': 'Spirituals',
  // Afrobeats
  'Afro-fusion': 'Afrobeats', 'Amapiano': 'Amapiano', 'Alté': 'Afrobeats', 'Afrobeats Pop': 'Afrobeats',
  // Reggae / Dancehall
  'Roots Reggae': 'Roots reggae', 'Lovers Rock': 'Rocksteady', 'Dancehall': 'Dancehall',
  'Dub': 'Dub', 'Reggae Fusion': 'Reggae',
  // Lo-Fi / Boom Bap
  'Chillhop': 'Lo-fi hip hop', 'Jazz Hop': 'Jazz rap', 'Vaporwave': 'Vaporwave', 'Boom Bap Rap': 'Boom bap',
  // Alternative
  'Alt Rock': 'Indie rock', 'Post-Punk': 'Post-punk', 'Shoegaze': 'Shoegaze', 'Dream Pop': 'Dream pop',
  // EDM / Dance
  'House': 'House', 'Techno': 'Techno', 'Drum & Bass': 'Drum and bass', 'Dubstep': 'Dubstep',
  'Future Bass': 'Future bass',
  // Jazz / Neo-Soul
  'Bebop': 'Bebop', 'Jazz Fusion': 'Jazz fusion', 'Vocal Jazz': 'Vocal jazz standard', 'Acid Jazz': 'Acid jazz',
  // Latin / Reggaeton
  'Urbano': 'Reggaeton', 'Bachata': 'Bachata', 'Salsa': 'Salsa', 'Trap Latino': 'Trap',
  // Metal / Heavy Rock
  'Thrash Metal': 'Thrash metal', 'Metalcore': 'Metalcore', 'Nu Metal': 'Nu metal',
  'Doom Metal': 'Doom metal', 'Death Metal': 'Death metal',
  // Punk / Pop Punk
  'Skate Punk': 'Punk', 'Pop Punk': 'Power pop', 'Post-Hardcore': 'Metalcore', 'Emo Punk': 'Emo',
  // Indie Pop / Bedroom Pop
  'Twee Pop': 'Power pop', 'Bedroom Pop': 'Bedroom pop', 'Jangle Pop': 'Indie rock',
  // Folk / Americana
  'Contemporary Folk': 'Folk', 'Singer-Songwriter': 'Singer-songwriter', 'Indie Folk': 'Indie folk',
  'Alt-Country': 'Alt-country',
  // Blues / Soul Blues
  'Chicago Blues': 'Chicago blues', 'Delta Blues': 'Delta blues', 'Texas Blues': 'Texas blues',
  'Electric Blues': 'Electric blues',
  // Funk
  'P-Funk': 'P-funk', 'Synth-Funk': 'Boogie', 'Funk Rock': 'Funk', 'Disco Funk': 'Disco',
  // K-Pop
  'Dance-Pop K-Pop': 'K-pop', 'Hip-Hop K-Pop': 'K-pop', 'R&B K-Pop': 'K-pop', 'Ballad K-Pop': 'Mandopop',
  // Phonk
  'Drift Phonk': 'Phonk', 'Rare Phonk': 'Phonk', 'Cowbell Phonk': 'Phonk', 'Shadow Phonk': 'Phonk',
  // Conscious / Spoken Word
  'Poetry Slam': 'Spoken word with music', 'Slam Rap': 'Conscious hip hop',
  'Narrative Spoken Word': 'Spoken word with music', 'Acoustic Poetic': 'Singer-songwriter',
  // Grunge / 90s Alt
  'Seattle Grunge': 'Grunge', 'Post-Grunge': 'Grunge', 'Alternative Grunge': 'Grunge', 'Noise Rock': 'Noise',
  // Hyperpop / Glitchcore
  'Glitchcore': 'Hyperpop', 'Hyper-Rave': 'Hyperpop', 'Bubblegum Bass': 'Hyperpop', 'Cyberpunk': 'Industrial',
  // Corridos / Regional Mexican
  'Corridos Tumbados': 'Corrido', 'Corridos Belicos': 'Corrido', 'Mariachi': 'Mariachi', 'Banda': 'Banda',
  // Synthwave / Retrowave
  'Outrun': 'Synthwave', 'Dreamwave': 'Synthwave', 'Darksynth': 'Synthwave',
  'Vaporwave Retrowave': 'Vaporwave',
};

/**
 * The family a sound belongs to, for the three hundred that no table names.
 *
 * Somebody who picks Gnawa or Qawwali in Black Hole Studios is not going to find
 * it in Songwriter's 28, and pretending otherwise would be a lie. Landing on the
 * nearest broad family is honest and keeps the two tabs describing one song.
 */
const BH_GROUP_TO_SW = {
  'Rock': 'Rock',
  'Metal': 'Metal / Heavy Rock',
  'Blues': 'Blues / Soul Blues',
  'Country & Americana': 'Country',
  'Folk & Singer-songwriter': 'Folk / Americana',
  'Soul, R&B & Funk': 'R&B / Soul',
  'Hip hop': 'Hip-Hop / Rap',
  'Pop': 'Pop',
  'Electronic': 'EDM / Dance',
  'Jazz': 'Jazz / Neo-Soul',
  'Reggae & Caribbean': 'Reggae / Dancehall',
  'Latin America': 'Latin / Reggaeton',
  'Africa': 'Afrobeats',
  'Middle East & North Africa': 'Folk / Americana',
  'South Asia': 'Folk / Americana',
  'East Asia': 'K-Pop',
  'Southeast Asia & Pacific': 'Folk / Americana',
  'Europe & folk traditions': 'Folk / Americana',
  'Classical & orchestral': 'Alternative',
  'Other & experimental': 'Alternative',
};

/** Which family each taxonomy genre sits in. */
const BH_GENRE_GROUP = (() => {
  const m = new Map();
  for (const [group, list] of Object.entries(GENRE_GROUPS)) {
    for (const g of list) m.set(g.name, group);
  }
  return m;
})();

/**
 * EVERY LOOKUP BUILT FROM SONGWRITER'S LISTS IS BUILT ON FIRST USE, NOT ON LOAD.
 *
 * LyricStore imports this file and this file imports LyricStore's vocabularies,
 * which is a cycle. Under ES modules the cycle resolves fine for anything read
 * inside a function and throws a ReferenceError for anything read while the
 * module is still evaluating — the imported `const` is still in its temporal
 * dead zone. Building these tables eagerly crashed the whole app at startup.
 * Memoised, so the cost is paid once on the first pick.
 */
function once(build) {
  let made;
  return () => (made === undefined ? (made = build()) : made);
}

/**
 * Taxonomy sound → { genre, subgenre } in Songwriter's vocabulary.
 *
 * Built by inverting the two tables above. The genre pass runs first so that a
 * name appearing on both sides (Trap, Drill, Funk) reads as its own genre rather
 * than as somebody else's subgenre, and the subgenre pass then adds the finer
 * detail underneath it.
 */
const bhToSw = once(() => {
  const m = new Map();
  for (const [swGenre, bh] of Object.entries(GENRE_TO_BH)) {
    if (!m.has(bh)) m.set(bh, { genre: swGenre, subgenre: '' });
  }
  for (const [swGenre, subs] of Object.entries(SW_SUBGENRES)) {
    for (const sub of subs) {
      const bh = SUBGENRE_TO_BH[sub];
      if (!bh) continue;
      const existing = m.get(bh);
      if (!existing) { m.set(bh, { genre: swGenre, subgenre: sub }); continue; }
      // Fill in the subgenre only where it belongs to the genre already chosen,
      // so Boom bap becomes Hip-Hop / Rap → Boom Bap and not Lo-Fi → Boom Bap Rap.
      if (existing.genre === swGenre && !existing.subgenre) existing.subgenre = sub;
    }
  }
  return m;
});

const cap = (list) => [...new Set(list.filter(Boolean))].slice(0, MAX_PICKS);

/**
 * Songwriter's picks, said in Black Hole Studios' vocabulary.
 *
 * Subgenres lead because they are the more specific statement of the same
 * choice; the parent genres fill whatever room is left.
 */
export function toBlackHoleGenres(genreList = [], subgenreList = []) {
  const fromSubs = subgenreList.map((s) => SUBGENRE_TO_BH[s]).filter(Boolean);
  // A genre whose subgenre already said the sound adds nothing: West Coast is
  // G-funk, and tacking on Hip-Hop's Boom bap made it two songs at once.
  const saidBySub = (g) => subgenreList.some((s) => SUBGENRE_TO_BH[s] && (SW_SUBGENRES[g] || []).includes(s));
  const fromGenres = genreList.filter((g) => !saidBySub(g)).map((g) => GENRE_TO_BH[g]).filter(Boolean);
  return cap([...fromSubs, ...fromGenres]);
}

/**
 * Black Hole Studios' picks, said in Songwriter's vocabulary.
 *
 * `current` is what Songwriter has now. Every pick there that still says one of
 * these sounds is KEPT as it is, and only the sounds nothing explains get
 * translated. Without that, adding one sound over there rewrote Songwriter from
 * the table: Hip-Hop / Rap came back with East Coast ticked, Trap with Melodic
 * Trap, Country with Country Pop, picks the person never made.
 */
export function toSongwriterGenres(bhList = [], current = {}) {
  // A subgenre with no sound of its own (Latin Pop) rides on its genre's.
  const parentSound = (s) => (current.genreList || []).filter((g) => (SW_SUBGENRES[g] || []).includes(s)).map((g) => GENRE_TO_BH[g]);
  const keptSubs = (current.subgenreList || []).filter((s) => (SUBGENRE_TO_BH[s]
    ? bhList.includes(SUBGENRE_TO_BH[s])
    : parentSound(s).some((bh) => bhList.includes(bh))));
  const keptGenres = (current.genreList || []).filter((g) => bhList.includes(GENRE_TO_BH[g])
    || keptSubs.some((s) => (SW_SUBGENRES[g] || []).includes(s)));
  const explained = new Set([...keptSubs.map((s) => SUBGENRE_TO_BH[s]).filter(Boolean), ...keptGenres.map((g) => GENRE_TO_BH[g])]);
  const genreOut = [...keptGenres];
  const subOut = [...keptSubs];
  for (const bh of bhList) {
    if (explained.has(bh)) continue;   // eslint-disable-line no-continue
    const hit = bhToSw().get(bh)
      || { genre: BH_GROUP_TO_SW[BH_GENRE_GROUP.get(bh)] || '', subgenre: '' };
    if (!hit.genre || !SW_GENRES.includes(hit.genre)) continue;   // eslint-disable-line no-continue
    genreOut.push(hit.genre);
    if (hit.subgenre) subOut.push(hit.subgenre);
  }
  const genreList = cap(genreOut);
  // Never leave a subgenre stranded without the genre it belongs to — that is
  // exactly the state the subgenre pool prunes away a tick later anyway.
  const pool = genreList.flatMap((g) => SW_SUBGENRES[g] || []);
  return { genreList, subgenreList: cap(subOut.filter((s) => pool.includes(s))) };
}

/* ── MOODS ──────────────────────────────────────────────────────────────── */

/**
 * Both mood lists are plain English and overlap heavily, so most pairs match on
 * their own once the explanations in brackets and the either/or slashes are
 * stripped. This table is only the ones that do not.
 */
const MOOD_ALIASES = {
  // Songwriter → taxonomy
  'happy': 'Joyful', 'euphoric': 'Ecstatic', 'uplifting': 'Optimistic',
  'confident': 'Swaggering', 'empowered': 'Triumphant', 'determined': 'Relentless',
  'aggressive': 'Fierce', 'angry': 'Furious', 'gritty': 'Gritty and driving',
  'dark': 'Menacing', 'tense': 'Claustrophobic', 'anxious': 'Uneasy', 'paranoid': 'Uneasy',
  'sad': 'Mournful', 'somber': 'Mournful', 'lonely': 'Lonesome', 'lost': 'Searching',
  'melancholic': 'Wistful', 'reflective': 'Meditative', 'haunting': 'Haunted',
  'tender': 'Warm and slow', 'romantic': 'Loving', 'sensual': 'Sultry', 'lustful': 'Sultry',
  'whimsical': 'Mischievous', 'serene': 'Peaceful', 'spiritual': 'Prayerful',
  'cathartic': 'Ecstatic', 'yearning': 'Aching', 'moody': 'Brooding',
  'liberated': 'Triumphant', 'motivational': 'Optimistic', 'chill': 'Laid-back',
  // taxonomy → Songwriter
  'warm and slow': 'Tender', 'gritty and driving': 'Gritty (raw and tough)',
  'menacing': 'Dark', 'furious': 'Angry', 'relentless': 'Determined', 'urgent': 'Restless',
  'rowdy': 'Celebratory', 'swaggering': 'Confident', 'fierce': 'Aggressive',
  'claustrophobic': 'Tense', 'apocalyptic': 'Ominous', 'desperate': 'Anxious',
  'bitter': 'Angry', 'haunted': 'Haunting', 'lonesome': 'Lonely', 'weary': 'Sad',
  'regretful': 'Bittersweet', 'resigned': 'Somber (serious and gloomy)', 'homesick': 'Nostalgic (missing the past)',
  'aching': 'Yearning (deep wanting)', 'loving': 'Romantic', 'comforting': 'Tender',
  'devoted': 'Romantic', 'reverent': 'Spiritual', 'sunny': 'Happy', 'silly': 'Playful',
  'wide-eyed': 'Hopeful', 'laid-back': 'Chill / Laid-Back', 'smoky': 'Sultry (hot and slow)',
  'late-night': 'Moody', 'woozy': 'Dreamy', 'detached': 'Reflective (thinking deeply)',
  'cocky': 'Confident', 'smooth': 'Chill / Laid-Back', 'sultry': 'Sultry (hot and slow)',
  'meditative': 'Reflective (thinking deeply)', 'sparse': 'Lonely', 'vast': 'Dreamy',
  'solitary': 'Lonely', 'floating': 'Dreamy', 'frozen': 'Somber (serious and gloomy)',
  'weightless': 'Dreamy', 'uneasy': 'Anxious', 'surreal': 'Dreamy', 'unhinged': 'Angry',
  'chaotic': 'Rebellious', 'mischievous': 'Playful', 'otherworldly': 'Spiritual',
  'feverish': 'Restless', 'prayerful': 'Spiritual', 'searching': 'Lost',
  'testifying': 'Spiritual', 'mystical': 'Spiritual', 'mourning': 'Mournful (grieving)',
  'praise-filled': 'Grateful', 'intimate': 'Tender',
};

/**
 * "Melancholic (gently sad)" and "Chill / Laid-Back" are the same words dressed
 * for two different lists. Strip the parenthetical explanation, take the first
 * of any either/or pair, lowercase the rest.
 */
const moodKey = (name) => String(name)
  .replace(/\([^)]*\)/g, ' ')
  .split('/')[0]
  .trim()
  .toLowerCase();

const indexBy = (names) => {
  const m = new Map();
  for (const n of names) if (!m.has(moodKey(n))) m.set(moodKey(n), n);
  return m;
};
const swMoodIndex = once(() => indexBy(SW_MOODS));
const bhMoodIndex = once(() => indexBy(ALL_MOODS));

function translateMood(name, index) {
  const key = moodKey(name);
  const direct = index.get(key);
  if (direct) return direct;
  const alias = MOOD_ALIASES[key];
  if (alias && index.has(moodKey(alias))) return index.get(moodKey(alias));
  return '';
}

/** Songwriter moods → taxonomy moods. Anything with no honest match is dropped. */
export function toBlackHoleMoods(moodList = []) {
  return cap(moodList.map((m) => translateMood(m, bhMoodIndex())));
}

/**
 * Taxonomy moods → Songwriter moods. Songwriter moods that still say one of
 * these are kept as they are (Happy stays Happy, not Joyful), the rest translate.
 */
export function toSongwriterMoods(bhMoodList = [], current = []) {
  const kept = current.filter((m) => bhMoodList.includes(translateMood(m, bhMoodIndex())));
  const explained = new Set(kept.map((m) => translateMood(m, bhMoodIndex())));
  return cap([...kept, ...bhMoodList.filter((m) => !explained.has(m)).map((m) => translateMood(m, swMoodIndex()))]);
}
