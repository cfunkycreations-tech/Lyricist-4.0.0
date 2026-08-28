/**
 * Cut a model's THINKING out of its ANSWER, Lyricist 4.2.0
 *
 * WHY THIS EXISTS
 * A generated song came back and the workspace showed this as "Verse 1", 29 lines of it:
 *
 *   "We need to output lyrics with labels for each section: [Intro], [Verse 1]..."
 *   "Let's craft lyrics with 16 syllables per line, smooth melodic cadence, bebop vibe."
 *   "Let's count syllables."
 *   "Midnight(2) kitchen(2) lights(1) flicker(2) I(1) set(1) two(1) plates(1) one(1)..."
 *
 * That is the model's scratchpad, not the song. Reasoning models emit a planning
 * pass before the answer, and how it comes back is not consistent:
 *
 *   - OpenRouter usually splits it into `message.reasoning`, leaving content clean.
 *   - Plenty of models fence it inline instead: <think>...</think>.
 *   - Streaming reassembly regularly loses the OPENING tag, so the reply is raw
 *     planning prose followed by a lone </think>.
 *   - The gpt-oss "harmony" format uses channels: <|channel|>analysis<|message|>
 *     the plan <|end|> ... <|channel|>final<|message|> the actual answer.
 *   - Some models simply think out loud with no marker of any kind, then write
 *     the song underneath it.
 *
 * `parseSectionsFromText` opens an implicit "Verse 1" for any text appearing before
 * the first [Label], so every one of those shapes lands in the song as lyrics.
 *
 * The tag layer is exact and always runs. The prose layer is heuristic, so it is
 * deliberately narrow: it only deletes untagged text ABOVE the first section label
 * (where a song's lyrics cannot legally be, when labels exist at all), plus lines
 * matching phrasings a lyric does not use, "We need to...", "The user wants...",
 * "Count:", "Line 1:", "Midnight(2) kitchen(2)".
 */

/** Paired scratchpad tags every reasoning model family uses. */
const TAG_NAMES = 'think|thinking|thought|thoughts|reason|reasoning|analysis|scratchpad|reflection|internal|monologue';
const PAIRED_TAG = new RegExp(`<\\s*(${TAG_NAMES})\\s*>[\\s\\S]*?<\\s*/\\s*\\1\\s*>`, 'gi');
const CLOSING_TAG = new RegExp(`<\\s*/\\s*(?:${TAG_NAMES})\\s*>`, 'gi');
const OPENING_TAG = new RegExp(`<\\s*(?:${TAG_NAMES})\\s*>`, 'i');
/** Bracketed variants: [THINK] ... [/THINK] */
const PAIRED_BRACKET = new RegExp(`\\[\\s*(${TAG_NAMES})\\s*\\][\\s\\S]*?\\[\\s*/\\s*\\1\\s*\\]`, 'gi');
/** Harmony channel markers, e.g. <|channel|>analysis<|message|> */
const HARMONY_FINAL = /<\|channel\|>\s*final\s*<\|message\|>/gi;
const HARMONY_ANY = /<\|[^|]*\|>/g;

/** A section label on its own line: [Verse 1], [Chorus], [Bridge]. */
const LABEL_LINE = /^\[[^\]]{1,40}\]$/;

/**
 * Tells that fire on their own, because no lyric is written this way.
 *
 * THE BAR HERE IS DELIBERATELY HIGH. A first draft of this list keyed on opening
 * phrases, "We need to", "Let's", "Better to", "Actually,", and ate eleven of
 * eighteen real lyric lines in testing: "We need to talk but the radio is louder",
 * "Let's count the cracks in the ceiling again", "Better to burn the letter than
 * to read it twice". Songwriters open lines exactly the way a model opens a
 * thought. So an opener alone is never enough, see META_SOFT.
 */
const META_HARD = [
  // Syllable tallies: "Midnight(2) kitchen(2) lights(1) flicker(2)"
  /(?:\b[\w'’-]+\(\d+\)[\s,]*){3,}/,
  // "Mid-night ki-tchen lights flick-er", a line split into sounds to be counted.
  /(?:\b[a-z]+-[a-z]+\b[\s,]+){3,}/i,
  // A labelled tally, wherever it starts: '"...one untouched" Count: Mid-night'
  /\b(?:count|syllable\s+count|word\s+count|total)\s*:\s*\S/i,
  /^(?:syllable\s+count|word\s+count|breakdown|analysis|reasoning|thinking|scratchpad|plan|structure)\s*:/i,
  /^line\s*\d+\s*[:.)]/i,
  /^(?:verse|chorus|bridge|intro|outro|hook|pre-?chorus)\s*\d*\s*(?:example|draft|attempt|idea)s?\s*:/i,
  /^the\s+user\s+(?:wants?|asked|asks|said|says|requested|requests|specifie[sd]|is\s+asking)\b/i,
  /^(?:the\s+)?(?:system\s+)?prompt\s+(?:says|asks|wants|requires|specifies)\b/i,
  // Editorial shorthand. Nobody sings "e.g." or "etc."
  /\b(?:e\.g\.|i\.e\.|etc\.?)(?:\s|$|,)/i,
  // The short self-directions between steps: "We'll need to count." "Let's craft."
  /^(?:we|i|let'?s|let\s+me)\s*(?:'ll|'d|will|should|must|can|need\s+to|now)?\s*(?:need\s+to\s+)?(?:count|recount|check|verify|revise|adjust|craft|draft|proceed|continue|rewrite)\s*\.?$/i,

  /* ── RESTATING THE BRIEF ────────────────────────────────────────────────
     A reasoning model opens by reciting the job back to itself:

       "We need to produce a 4-line verse. Constraints:"
       "- Seed palette: many words. Must include each of those seeds..."
       "- Rhyme scheme: ABCD, meaning each line ends with a different rhyme?"

     The rule above missed all of it: it only fires when the line ENDS on the
     verb, and these run on into the restated constraint. The bulleted ones also
     read as label lines, which excluded them from the ratio, so a full
     scratchpad scored 89% truth and was saved into the tab as the verse.

     Nobody sings any of these openings, so they are hard tells. */
  /^\s*[-*]?\s*constraints?\s*:/i,
  /^\s*[-*]?\s*(?:seed\s+palette|rhyme\s+scheme|stress\s+signature|end-?words?|section)\s*:/i,
  /^(?:we|i)\s+(?:need|have|want|must|should)\s+to\s+\w+/i,
  /\bso\s+(?:we|i)\s+(?:must|need\s+to|should)\b/i,
];

/**
 * Softer tells. These only count as scratchpad when the line ALSO talks about the
 * machinery of writing a song rather than saying anything in it, the opener and
 * the craft talk have to appear together.
 */
const META_SOFT = [
  /^(?:we|i)\b/i,
  /^let'?s\b/i,
  /^let\s+me\b/i,
  /^(?:so|now|okay|ok|alright|hmm+|wait|actually|but|however|instead|also|first|next|then|finally|maybe|perhaps|better|best)\b[,:]?\s/i,
  /^(?:this|that|it|they)\s+(?:should|must|needs?|gives?|makes?|works?|is|are)\b/i,
];

const CRAFT_TALK = /\b(?:syllables?|line\s+count|word\s+count|rhyme\s+scheme|section\s+labels?|bars?\s+per|per\s+(?:line|verse|chorus|section)|section\s+(?:clearly|headers?)|labell?(?:ed|ing|s)?\b[^.]*\bsection|commentary|placeholder|cadence\s+notes?|the\s+(?:user|prompt|instructions?|requirements?))\b/i;

/** Is this single line the model thinking rather than writing? */
export function looksLikeReasoning(line) {
  const t = String(line || '').trim();
  if (!t) return false;
  if (LABEL_LINE.test(t)) return false;
  for (const re of META_HARD) {
    re.lastIndex = 0;
    if (re.test(t)) return true;
  }
  if (!CRAFT_TALK.test(t)) return false;
  return META_SOFT.some((re) => re.test(t));
}

/** Share of non-empty, non-label lines that read as scratchpad. */
export function reasoningRatio(text) {
  const lines = String(text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !LABEL_LINE.test(l));
  if (!lines.length) return 0;
  return lines.filter(looksLikeReasoning).length / lines.length;
}

/**
 * Did the model hand back its scratchpad instead of a song? Used to fail the
 * generation and retry, rather than saving planning notes into somebody's work.
 */
export function isMostlyReasoning(text) {
  const t = String(text || '');
  if (!t.trim()) return false;
  const lines = t.split('\n').map((l) => l.trim()).filter(Boolean);
  const hits = lines.filter(looksLikeReasoning).length;
  // Three explicit tells and no structure at all is a scratchpad dump.
  if (hits >= 3 && !lines.some((l) => LABEL_LINE.test(l))) return true;
  return reasoningRatio(t) >= 0.4;
}

/** Strip the exact, unambiguous markers. Always safe, no guessing involved. */
function stripTags(input) {
  let t = String(input || '').replace(/\r/g, '');

  // Harmony channels: everything before the LAST "final" marker is scaffolding.
  HARMONY_FINAL.lastIndex = 0;
  if (HARMONY_FINAL.test(t)) {
    const parts = t.split(HARMONY_FINAL);
    t = parts[parts.length - 1];
  }
  t = t.replace(HARMONY_ANY, '');

  t = t.replace(PAIRED_TAG, '').replace(PAIRED_BRACKET, '');

  // A lone closing tag means the opening one was lost in reassembly: everything
  // above the last close is thinking.
  CLOSING_TAG.lastIndex = 0;
  if (CLOSING_TAG.test(t)) {
    const idx = t.toLowerCase().lastIndexOf('</');
    const after = t.slice(t.indexOf('>', idx) + 1);
    t = after;
  }
  t = t.replace(CLOSING_TAG, '');

  // A lone opening tag means the close was lost: everything from it to the first
  // section label is thinking, or to the end if there is no label after it.
  if (OPENING_TAG.test(t)) {
    const m = t.match(OPENING_TAG);
    const head = t.slice(0, m.index);
    const tail = t.slice(m.index + m[0].length);
    const labelAt = tail.search(/^\s*\[[^\]]{1,40}\]\s*$/m);
    t = labelAt >= 0 ? `${head}\n${tail.slice(labelAt)}` : head;
  }

  return t.replace(/\[\s*\/?\s*(?:think|thinking|analysis|reasoning)\s*\]/gi, '').trim();
}

/**
 * Cut the thinking out of a model reply.
 *
 * @param {string} raw       whatever the model returned
 * @param {object} opts
 * @param {boolean} opts.aggressive  also remove untagged planning prose. On for
 *   generated output; off when re-parsing text the user typed or pasted.
 * @returns {string}
 */
export function stripReasoning(raw, { aggressive = false } = {}) {
  let t = stripTags(raw);
  if (!aggressive || !t) return t;

  let lines = t.split('\n');

  // 1. Untagged preamble. If the reply has section labels, nothing above the
  //    first one is a lyric, and if it reads like planning, it goes.
  const firstLabel = lines.findIndex((l) => LABEL_LINE.test(l.trim()));
  if (firstLabel > 0) {
    const preamble = lines.slice(0, firstLabel);
    if (preamble.some((l) => looksLikeReasoning(l))) {
      lines = lines.slice(firstLabel);
    }
  }

  // 2. Line-level scrub of the tells that fire on their own.
  lines = lines.filter((l) => !looksLikeReasoning(l));

  // 3. Trailing commentary, "Let me know if you want..." after the last lyric.
  while (lines.length) {
    const last = lines[lines.length - 1].trim();
    if (!last) { lines.pop(); continue; }
    if (/^(?:let\s+me\s+know|hope\s+this|feel\s+free|note\s*:|i\s+hope|would\s+you\s+like|if\s+you'?d\s+like)/i.test(last)) {
      lines.pop();
      continue;
    }
    break;
  }

  // 4. An orphaned label left standing with nothing under it.
  while (lines.length && LABEL_LINE.test(lines[lines.length - 1].trim())) {
    lines.pop();
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  }

  return lines.join('\n').trim();
}
