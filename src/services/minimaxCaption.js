/**
 * HOW MINIMAX ITSELF SAYS TO WRITE A CAPTION.
 *
 * Chris, 2026-08-22: *"bake this into the ghost as well or whatever you have to
 * do: npx skills add MiniMax-AI/MiniMax-Music3 --skill music-caption-rewriter"*
 *
 * That is MiniMax's own published skill for the model this app drives, so it is
 * the closest thing to an authority that exists. What follows is its METHOD,
 * written out here in our own words.
 *
 * WHY THE METHOD AND NOT THE LIBRARY. The skill ships 1,000 caption templates,
 * 3.8 MB, and the repository carries no licence file at all. Its own
 * instructions also say, twice, not to copy template sentences or a template's
 * complete structure: the templates are reference material for a model to reason
 * against, not content to redistribute. Shipping somebody else's unlicensed
 * corpus inside a product Chris gives away would be the kind of thing that is
 * fine right up until it is not. The method is the valuable half anyway, because
 * it is what turns "a sad song" into something the model can actually build.
 *
 * If the templates are ever licensed, the honest upgrade is the full progressive
 * disclosure the skill describes: route to a style family, compare cards, read
 * only the two or three selected templates. The family list below is the part of
 * that which is just a taxonomy of genres, and a list of genres is a fact.
 */

/**
 * The style families the skill routes between, as plain genre buckets.
 *
 * Used to make the Ghost pick a lane before it writes, which is the single
 * biggest thing that stops a caption reading like every other caption.
 */
export const STYLE_FAMILIES = [
  'cinematic orchestral and epic',
  'cinematic pop ballad',
  'club EDM, house and trance',
  'contemporary folk and acoustic',
  'country and americana',
  'dance pop, disco and funk',
  'east asian ballad and heritage',
  'east asian modern',
  'electronic synth, ambient and pop',
  'general pop and ballad',
  'hip hop and rap',
  'jazz, swing and big band',
  'metal and heavy rock',
  'modern R&B and neo soul',
  'pop and alternative rock',
  'roots, traditional and global',
  'soul, blues and gospel',
  'traditional vocal and stage',
];

/**
 * The method, condensed to what changes the output.
 *
 * Every rule here is doing work. The ones that look fussy are the ones that stop
 * a model inventing a key signature, quietly turning an instrumental into a
 * vocal track, or writing four hundred words of adjectives with no instruction
 * in them.
 */
export const CAPTION_METHOD = `
HOW TO WRITE THE CAPTION. This is MiniMax's own method for the model that makes
these songs, so follow it rather than improvising.

FIRST, WORK OUT WHAT YOU ACTUALLY KNOW. Before writing, sort what you have into
what they SAID, what their section tags DEMAND, what you can reasonably INFER,
and what is simply UNKNOWN. Then write from the first three and leave the fourth
alone. Do not invent an exact BPM, a key, a vocal gender, or a named production
technique when a broader description covers it. "Mid-tempo, around 90" is honest.
"92 BPM in F# minor" invented from nothing is not, and the model will follow it.

PICK A LANE FIRST. Choose the style family the song belongs to before you write a
word: ${STYLE_FAMILIES.join('; ')}. Route on genre, groove, instrumentation and
cultural context, never on adjectives like emotional, epic, dark or modern, which
fit everything and therefore decide nothing. For a fusion, pick one main family
and let the second one colour only the thing it was asked for.

WHAT OVERRIDES WHAT, when instructions collide:
  1. What they explicitly asked for, and anything they explicitly banned.
  2. A section tag, inside that section only. A tag can change one section's
     arrangement without changing the song's genre.
  3. What their description strongly implies.
  4. Ordinary musical common sense.
Never quietly reverse an explicit instrumental request, a stated vocal gender, a
tempo limit, a required instrument, or a banned element. If two explicit things
genuinely conflict, follow the more specific one and say in one line what you
could not honour.

THE THREE HEADINGS, ALWAYS, IN THIS ORDER.
  Global Metadata   genre and subgenres, tempo, how the emotion MOVES through
                    the song, and the production profile: soundstage, low end,
                    top end, character. Exact BPM only when it was given or is
                    strongly implied, otherwise a range. Key only when it matters.
  Vocal Details     the lead voice, its timbre, register and delivery, then
                    harmonies and backing, then restrained effects. For an
                    instrumental, say it is instrumental and name the instrument
                    carrying the melody. Never invent what the song is about.
  Arrangement       the song as a TIMELINE, section by section. For every
                    section say what enters, what leaves, what changes and what
                    intensifies. Instruments must arrive and depart coherently.

WRITE A TIMELINE, NOT AN EQUIPMENT LIST. A list of gear and production words is
the most common way a caption fails. The reader should be able to follow the
song's energy from the first bar to the last.

LENGTH. Around 250 to 450 words across the three sections unless asked otherwise.
Specific enough to steer the model, short enough not to be an essay.

NEVER put lyrics in the caption. Use the words only to sense the emotional
weight and how intense the story gets. Do not quote them, summarise them, or name
the song in the caption.

BEFORE YOU HAND IT OVER, CHECK: every explicit requirement survived; every
section tag shows up in its own section; an instrumental is still instrumental;
the vocal gender was not flipped; all three headings are present; the arrangement
reads as a timeline; no BPM or key was fabricated; no lyric text leaked in. Fix
it once if any of that fails.
`;

/* ------------------------------------------------------------------ */
/* WHERE WE CAN BEAT THE SKILL                                         */
/* ------------------------------------------------------------------ */

/**
 * Chris: *"if you can make the skill better do it."*
 *
 * Three places it can be beaten, and only one of them is about wording.
 *
 * 1. THE SKILL DOES NOT KNOW HOW LONG THE SONG IS. It is written for a chat
 *    where nobody has picked a duration. This app always has one, and a caption
 *    describing a nine section timeline for a forty five second song is simply
 *    wrong. `captionBrief()` hands over the real seconds and the real section
 *    budget so the timeline has to fit in the time that exists.
 *
 * 2. IT DOES NOT KNOW THE ACTUAL SECTION TAGS. They are sitting in the lyrics
 *    box. Passing them in turns "build around the user's section tags when
 *    present" from a hope into a list the writer has to walk in order.
 *
 * 3. ITS VALIDATION IS A CHECKLIST THE MODEL PROMISES TO RUN. A model asked to
 *    check its own work says it did. `validateCaption()` is the same checklist
 *    in code, run afterwards, on the actual text. It cannot be talked out of a
 *    result, and it catches the two failures that matter most in practice: a
 *    missing heading, and lyrics leaking into the caption.
 */

/** What the app knows that a chat window would not. */
export function captionBrief({ seconds, tags = [], genres = [], moods = [], voices = [], instrumental = false }) {
  const budget = Math.max(1, Math.floor((seconds || 0) / 15));
  const lines = [];
  lines.push(`LENGTH: ${seconds} seconds. At the fifteen second floor that is room for about ${budget} section${budget === 1 ? '' : 's'}.`);
  if (tags.length) {
    lines.push(`THEIR SECTIONS, IN ORDER: ${tags.join(' -> ')}. The Arrangement must walk these, in this order, and name what changes at each one.`);
    if (tags.length > budget) {
      lines.push(`They have ${tags.length} sections in ${seconds} seconds, which is more than fits. Write the timeline anyway but keep each section's description brief, and say in one line that it is tight.`);
    }
  } else {
    lines.push('They have no section tags yet, so choose a shape that suits the style and the length.');
  }
  if (genres.length) lines.push(`GENRES THEY PICKED: ${genres.join(', ')}. Blend them into one sound, do not alternate between them.`);
  if (moods.length) lines.push(`MOODS: ${moods.join(', ')}. The first one is the core.`);
  if (instrumental) {
    lines.push('THIS IS AN INSTRUMENTAL. Say so, name the instrument carrying the melody, and do not add a singer.');
  } else if (voices.length) {
    lines.push(`VOICES: ${voices.join(', ')}. The first sings lead; the rest are support and harmony.`);
  }
  return lines.join('\n');
}

/**
 * The sections one Input Caption has to contain.
 *
 * It used to be three separate boxes and this checked each one. There is one
 * box now, exactly as MiniMax reads it, so these are things to find INSIDE it.
 */
const SECTIONS = [
  { name: 'the style and tempo', wants: [/basic attributes/i, /global emotional progression/i] },
  { name: 'the singer', wants: [/vocal (gender|style|timbre)/i, /vocal details/i] },
  { name: 'the band', wants: [/instrument lifecycle/i, /groove/i, /arrangement/i] },
];

/**
 * Check a finished caption against the parts of the method a machine can judge.
 *
 * Returns a list of plain sentences, empty when it is clean. Deliberately quiet
 * about taste: it does not police whether the prose is good, only whether it
 * broke a rule that has a right answer.
 */
export function validateCaption(caption = '', { lyrics = '', instrumental = false, tags = [] } = {}) {
  const problems = [];
  // Still accepts the old three-part object, because a saved take from an
  // earlier build carries one and restoring it must not throw.
  const all = typeof caption === 'string'
    ? caption
    : [caption.globalMeta, caption.vocals, caption.arrangement].map((t) => String(t || '')).join('\n\n');

  if (!all.trim()) {
    problems.push('The Input Caption is empty.');
    return problems;
  }
  if (all.trim().length < 200) {
    problems.push('The Input Caption is very short, so it will not steer the model much.');
  }

  for (const sec of SECTIONS) {
    // An instrumental is supposed to have no singer section: the spec says say
    // it is instrumental and name what carries the melody instead.
    if (sec.name === 'the singer' && instrumental && /\b(instrumental|no vocals?)\b/i.test(all)) continue;
    if (!sec.wants.some((re) => re.test(all))) {
      problems.push(`The Input Caption says nothing about ${sec.name}.`);
    }
  }

  // A fabricated key or BPM is the skill's own worry. This catches the other
  // direction: no tempo information at all, which leaves the model guessing.
  // Both orders, because MiniMax's own format writes "bpm is 165" while most
  // people write "165 bpm", and the first version of this check only knew one
  // of them and called a perfectly good caption tempo-less.
  const hasNumber = /\b\d{2,3}\s*(bpm|beats)/i.test(all) || /\bbpm\b[^.\n]{0,12}?\d{2,3}/i.test(all);
  const hasWords = /(tempo|slow|fast|mid-?tempo|up-?tempo|ballad|driving|relaxed|brisk)/i.test(all);
  if (!hasNumber && !hasWords) {
    problems.push('Nothing in there says how fast the song is.');
  }

  // Lyrics leaking into the caption. Their rule, checked for real: any distinctive
  // line of eight or more words that appears in both is a copy, not a coincidence.
  const words = (t) => String(t).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  const capWords = words(all).join(' ');
  for (const raw of String(lyrics).split('\n')) {
    const w = words(raw);
    if (w.length < 8) continue;
    if (capWords.includes(w.join(' '))) {
      problems.push('A line of your lyrics has been copied into the description. The model wants the sound described, not the words repeated.');
      break;
    }
  }

  if (instrumental) {
    // "vocals" appears in a correct instrumental caption, as in "no vocals", so
    // the test is whether a SINGER is described, not whether the word is there.
    // The first version looked for the word "singer" and sailed past a caption
    // headed "Vocal Gender & Timbre: male, gravelly".
    if (/\b(singer|vocalist|sings|singing|lead vocal|vocal gender|male vocal|female vocal)\b/i.test(all)) {
      problems.push('You asked for an instrumental but the description describes a singer.');
    }
    if (!/\b(instrumental|no vocals?|without vocals?)\b/i.test(all)) {
      problems.push('You asked for an instrumental but the description never says so, and the model will add a singer.');
    }
  }

  // Every tag the person actually wrote should turn up in the timeline.
  const named = [...new Set(tags.map((t) => t.replace(/\s*\d+$/, '').trim().toLowerCase()))]
    .filter((t) => t && t.length > 2);
  const missing = named.filter((t) => !new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(all));
  if (missing.length && named.length) {
    problems.push(`The timeline never mentions your ${missing.join(', ')}.`);
  }

  return problems;
}
