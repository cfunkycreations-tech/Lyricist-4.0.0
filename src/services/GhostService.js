/**
 * THE GHOST, WITH A BRAIN.
 *
 * The Ghost Demo could already walk you through a tab, but only along a script
 * somebody wrote in advance. Chris asked for the other thing: something always
 * there that answers questions, writes the Input Lyrics, writes the Input
 * Caption, and presses the buttons.
 *
 * WHY THIS DOES NOT GO THROUGH callAI. Every OpenRouter path in this app must
 * validate the key through `assertApiKey`, and this one does, because that is
 * the choke point a bad paste has already slipped past twice. What it must NOT
 * inherit is `guardedCall`'s aggressive scratchpad filter. That filter exists to
 * keep a model's planning notes out of somebody's LYRICS, and it is tuned for
 * that: it treats "e.g." as a tell, and it treats an opener like "First," or
 * "Then," beside any craft word as thinking rather than writing. Those are the
 * normal furniture of an explanation. Running help text through it would delete
 * the middle of good answers. So this path strips the explicit <think> tags,
 * which is the always-safe half, and leaves prose alone.
 *
 * NEVER HAND-WRITE A MODEL ID. Four dead ids shipped once and killed Song Forge
 * art on every install. The model here is resolved against the live list at
 * openrouter.ai/api/v1/models and the preference order below is only a wish:
 * anything not actually alive is skipped.
 */
import { assertApiKey } from './AIService.js';
import { stripReasoning } from '../utils/stripReasoning.js';
import { availableGhostActions } from './ghostBus.js';
import { examplesForPrompt } from './minimaxExamples.js';
import { CAPTION_METHOD } from './minimaxCaption.js';

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const MODELS_URL = 'https://openrouter.ai/api/v1/models';

/**
 * How much room the Ghost gets to answer in.
 *
 * A full song is a 250 to 450 word caption plus nine sections of lyrics plus the
 * prose around them, which lands near 4000 tokens on its own. 7000 leaves head
 * room for a five minute song without ever being the thing that truncates.
 * Nothing is spent unless it is used.
 */
const MAX_REPLY = 7000;
/** Some models refuse a ceiling above their own. One retry, then give up. */
const SAFE_REPLY = 4000;

/**
 * Wishes, in order, all of them checked against the live list before use.
 * General instruct models only: the coding and safety-tuned ones on the free
 * router answer a songwriter's question like a code review.
 */
const WANTED = [
  'z-ai/glm-5.2:free',
  'google/gemma-4-31b-it:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
  'google/gemma-4-26b-a4b-it:free',
];

let cachedModel = null;

/** Ask OpenRouter what is actually alive and free, then pick. */
export async function resolveGhostModel() {
  if (cachedModel) return cachedModel;
  try {
    const res = await fetch(MODELS_URL, { headers: { 'HTTP-Referer': 'https://lyricist.app' } });
    const list = (await res.json())?.data || [];
    const alive = new Set(list.map((m) => m.id));
    const found = WANTED.find((id) => alive.has(id));
    if (found) { cachedModel = found; return found; }
    // Nothing on the wish list survived. Take any free general model with room
    // to hold a conversation, rather than failing over a list that went stale.
    const fallback = list
      .filter((m) => String(m.id).endsWith(':free'))
      .filter((m) => !/code|embed|guard|moderat|vision-only/i.test(m.id))
      .sort((a, b) => (b.context_length || 0) - (a.context_length || 0))[0];
    cachedModel = fallback?.id || null;
  } catch {
    cachedModel = null;   // offline: the caller says so in plain English
  }
  return cachedModel;
}

/* ------------------------------------------------------------------ */
/* what it knows about the app                                         */
/* ------------------------------------------------------------------ */

const TAB_NOTES = {
  songwriter: 'Songwriter: the main writing workspace. Sections, lines, style controls.',
  onemanband: 'One Man Band: turns written words into a real sung song. It takes exactly two '
    + 'things and calls them what MiniMax calls them: the INPUT LYRICS (the words, with '
    + '[Verse] [Chorus] style tags for the shape) and the INPUT CAPTION (one single box of '
    + 'text describing the sound, NOT three boxes). Also genre-mood-voice pickers, length, '
    + 'takes, take numbers, and where it runs (free cloud, Kaggle, this computer).',
  analyzer: 'Ghost Rider: studies an artist’s style and gives you Style DNA to write with.',
  songforge: 'Song Forge: writes a whole song and paints cover art from a theme.',
  quantum: 'Quantum Lab: a lattice of your own keywords that generates lyric options.',
  collab: 'Collaboration: write with someone else in real time using a room code.',
  loopstation: 'RC-Funk 5000: a live four track looper with effects.',
  stemmer: 'Stemmer: splits a finished mix into vocals, drums, bass, guitar, keys and other.',
  booth: 'Recording Booth: record or import takes.',
  midistudio: 'MIDI Studio: turns audio into editable notes, with a piano roll and real synthesis.',
  mastering: 'Mastering Studio: EQ, compression, limiter and export.',
  screw: 'Chopped & Screwed: slows a track down, chops it and adds sub bass.',
  rhyme: 'Rhyme Helper: perfect and slant rhymes, free, no key needed.',
  thesaurus: 'Thesaurus: better words, free.',
  dictionary: 'Dictionary: meanings and pronunciation, free.',
  toolshub: 'AI Tools Hub: links to other tools.',
  scratchpad: 'Scratch Pad: a plain notebook that saves itself.',
  settings: 'Settings: the OpenRouter key, the voice folder, the prism, donations.',
};

/**
 * The MiniMax caption format, in the app's own words.
 *
 * This is the single highest-leverage thing the ghost knows, because the sound
 * description decides more about how a song comes out than any slider does.
 */
const MINIMAX_RULES = `
MiniMax Music 3 takes exactly two things and this app calls them the same names
it does: the INPUT CAPTION and the INPUT LYRICS. There is ONE caption box, not
three. The whole caption is a single block of text with named headings inside it.

THE CAPTION IS A SCHEMA, NOT FREE TEXT. Write these headings, in this order, and
put real content under every one of them:

Global Metadata
  Basic Attributes:              bpm is N. key is X, and scale is major/minor. Genre.
  Global Emotional Progression:  how the feeling MOVES from the opening through
                                 the verses, choruses, any solo, and the ending.
  Application Scenarios & Imagery: where somebody would hear this, what they see.
  Sonics & Production Profile:   the mix. Soundstage, low end, top end, character.
Vocal Details
  Vocal Gender & Timbre:         who is singing and what the voice is like.
  Vocal Style:                   phrasing, and where it sits against the beat.
  Harmony/Backing Vocals:        stacks, gang vocals, doubles, and when they enter.
  Vocal FX:                      compression, delay, reverb, and how much.
Arrangement
  Instrument Lifecycle Description (Primary/Secondary Layering): every instrument,
                                 what it plays, and when it enters or drops out.
  Groove & Foundation Progression: drums and bass specifically.
  Embellishments, Textures & Spatial FX: transitions, sweeps, risers, room.

Name instruments and give numbers. "A sad song" gives mush. Detail is the single
biggest lever on how the song comes out, and long is correct here.

INPUT LYRICS use tags for structure: [Intro] [Verse] [Pre-Chorus] [Chorus]
[Post-Chorus] [Hook] [Bridge] [Breakdown] [Solo] [Instrumental] [Outro], and a
tag can carry an instruction, like [hook, Accapella] or [guitar solo].
A section needs 15 to 20 seconds of song to exist as music.
${examplesForPrompt()}
`;

const HIDDEN_FROM_MODEL = new Set(['describe_song', 'restore_lyrics']);

function systemPrompt(tab, context) {
  /**
   * WHAT THE MODEL IS TOLD IT CAN PRESS.
   *
   * Two registered actions are the app's own plumbing and are deliberately not
   * on this list. `describe_song` is how a tab answers a question, asked before
   * every reply. `restore_lyrics` is HIS undo button: the Ghost put the old
   * words at risk, so it does not also get to decide when they come back.
   */
  const actions = availableGhostActions().filter((n) => !HIDDEN_FROM_MODEL.has(n));
  return `You are the Ghost: the guide living inside Lyricist 4.2.0, a free songwriting studio
made by Chris Funk of CFunky Creations. You are talking to the person using it.

WHO YOU ARE TALKING TO. Songwriters, often beginners, often not technical. Never
use jargon without saying what it means. Never tell someone to edit a file, run a
command, or open a terminal. Everything happens with buttons in this app.

HOW YOU TALK. Short. Plain. Warm but not chirpy. No lists of caveats, no
"as an AI". Answer the question that was asked, then stop. Never use em dashes.

WHAT IS ON SCREEN RIGHT NOW: ${TAB_NOTES[tab] || tab}
${context ? `\nWHAT THEY HAVE SO FAR:\n${context}\n` : ''}
THE WHOLE APP:
${Object.values(TAB_NOTES).join('\n')}

${MINIMAX_RULES}
${CAPTION_METHOD}

WRITING LYRICS. Write like a person, not like a machine. Show feeling through
physical detail and things left unsaid rather than naming the emotion. Avoid
neon, shadows, whispers, echoes, sparks, cage, gravity, storm, wings, chains.
Irregular line lengths. Slant rhymes over perfect ones. No neat moral endings.

WRITING A WHOLE SONG.

RULE ONE, ABOVE EVERY OTHER RULE HERE. IF THERE ARE TAGS IN THE INPUT LYRICS
BOX, THOSE TAGS ARE THE SONG. They are listed above under what they have so far.
Use exactly those tags, in exactly that order, spelled exactly as they are
written. Add none. Drop none. Reorder none. They clicked those buttons on
purpose and that is them telling you the shape of the song, so writing your own
structure over the top of it is ignoring the only instruction they gave you.
The app checks this after you answer and tells them when you got it wrong, so
there is nothing to be gained by improvising.

RULE TWO. NEVER SEND AN EMPTY <lyrics> TAG AND NEVER SEND set_lyrics WITH NO
TEXT. That erases the song they wrote. If you have nothing to write, say so in
one sentence and write nothing.

RULE THREE. If they already have words in the box, extend or edit them rather
than throwing them away, unless they say to start over.

Now work out which of these they mean, and say in one line which you did:

  A. THEY GAVE YOU A THEME. "Write me a song about my brother moving away."
     Write the words from that, then write the Input Caption to match them.
  B. THEY ALREADY LAID OUT A STRUCTURE. Tags in the Input Lyrics box and little
     or nothing else. Fill in every one of those sections. See RULE ONE.
  C. THEY PICKED GENRE, MOOD AND VOICE and said nothing else. Use those picks as
     the whole brief. They are listed above under what they have so far.
  D. ANY MIX OF THOSE. A theme plus tags plus picks is the normal case. The
     picks decide the sound, the tags decide the shape, the theme decides what
     it is about. The tags still win on shape. See RULE ONE.

ALWAYS SEND BOTH when they ask for a song: a <lyrics> tag and a <caption> tag,
each complete. Lyrics with no caption gets a song that sounds like nothing in
particular, and a caption with no lyrics gets an instrumental they did not ask
for.

YOU CAN PRESS THINGS. To do something, put a line on its own in your reply:
<do>{"action":"NAME","args":{...}}</do>
The person sees what you did, not the tag. Available right now:
${actions.length ? actions.map((a) => `  - ${a}`).join('\n') : '  (nothing: no tab has offered anything yet)'}

ACTION NOTES:
  open_tab {"tab":"onemanband"} switches tabs. A tab has to be open before you
    can change anything on it, so open it first and say you are doing that.
  THE TWO BIG ONES DO NOT USE <do> AT ALL. Write them as plain tagged text, with
  real line breaks, nothing escaped:

    <caption>
    Global Metadata
    Basic Attributes: ...
    ...the whole Input Caption, every heading, in full...
    </caption>

    <lyrics>
    [Verse]
    ...the whole Input Lyrics...
    </lyrics>

  Write the WHOLE thing between the tags every time. Never a fragment, never a
  summary, never a note saying what you would write. If they ask you to fill in
  the song, that means both tags, complete, in one reply.

  append_lyrics {"text":"..."} still exists for adding a section to the end.
  set_length {"seconds":180}, set_takes {"count":2}, roll_take_number {},
    set_engine {"engine":"cloud"|"kaggle"|"local"}, lay_out_song {}.
  make_the_song {} EMIT IT whenever they want the song made. Do not ask them
    first, and do not tell them to tap or press anything: the app puts one
    confirm button under your answer by itself, and it only does that if you
    actually emitted the action. Saying "tap the button below" without emitting
    it leaves them looking at no button. Just say you are starting it.
  stop {} stops a run.

NEVER describe a button, a tap or a change you are not also emitting as a <do>
line. Talking about doing something is not doing it. Do not emit an action that
is not on the list above. If you cannot do something, say so in one sentence.`;
}

/* ------------------------------------------------------------------ */
/* asking                                                              */
/* ------------------------------------------------------------------ */

const DO_TAG = /<do>\s*(\{[\s\S]*?\})\s*<\/do>/g;

/**
 * LONG TEXT GETS ITS OWN TAGS, NOT JSON.
 *
 * The first version put everything in `<do>{"action":...}</do>`, which works
 * fine for "set the length to 90" and falls apart the moment the payload is a
 * four hundred word caption. Chris watched it fail exactly that way: the reply
 * ran out of room mid-tag and what he got was raw
 * `<do>{"action":"set_caption","args":{"style":"Basic Attributes: bpm is` sitting
 * in the conversation, with nothing written into any box.
 *
 * Two separate faults there, both fixed. The token ceiling was too low for a
 * caption to fit inside a JSON string at all, and JSON is the wrong container
 * for prose: every newline has to be escaped, and models emit real ones.
 *
 * So the two big fields have plain tags with the text between them, where a
 * newline is just a newline and nothing needs escaping.
 */
const CAPTION_TAG = /<caption>([\s\S]*?)<\/caption>/gi;
const LYRICS_TAG = /<lyrics>([\s\S]*?)<\/lyrics>/gi;

/**
 * THE CAPTION ARRIVING INSIDE THE <lyrics> TAG, AND WHAT IT COST.
 *
 * Chris ran a song on Kaggle and the notebook came back with `CAPTION` empty
 * and the LYRICS field holding his whole caption, headings and all, with the
 * real words tacked on underneath. Two separate faults met there: the Kaggle
 * payload was reading a property that did not exist (fixed in MusicService),
 * and the Ghost had put both halves in one tag.
 *
 * The prompt already says which tag each half goes in. This is the same rule
 * enforced afterwards, on the text, where it cannot be ignored: a lyric sheet
 * that opens with the caption schema is not a lyric sheet, it is both, and the
 * app can see exactly where one ends and the other starts. The split is the
 * first section tag, because that is the line where the words begin.
 *
 * Only the schema headings trigger it. A song that happens to open with a line
 * of prose before its first [Verse] is left exactly as written.
 */
const CAPTION_MARKS = /^(global metadata|vocal details|arrangement|basic attributes|global emotional progression|application scenarios|sonics & production|vocal gender)/i;
const SECTION_LINE = /^\s*(\[[^\]\n]{1,24}\]|\([A-Za-z][^)\n]{0,23}\))\s*$/;

function peelCaption(body) {
  const lines = String(body).split('\n');
  const at = lines.findIndex((l) => SECTION_LINE.test(l));
  if (at <= 0) return { caption: '', lyrics: body };

  const head = lines.slice(0, at).join('\n').trim();
  if (!head || !head.split('\n').some((l) => CAPTION_MARKS.test(l.trim()))) {
    return { caption: '', lyrics: body };
  }
  return { caption: head, lyrics: lines.slice(at).join('\n').trim() };
}

/** Anything that opened and never closed, because the reply was cut short. */
const UNCLOSED = /<(do|caption|lyrics)>[\s\S]*$/i;

/** Pull the action blocks out of a reply, and give back the prose without them. */
export function splitActions(reply) {
  const actions = [];
  let text = String(reply || '');

  text = text.replace(CAPTION_TAG, (_m, body) => {
    const value = String(body || '').trim();
    if (value) actions.push({ name: 'set_caption', args: { text: value } });
    return '';
  });

  text = text.replace(LYRICS_TAG, (_m, body) => {
    const value = String(body || '').trim();
    if (!value) return '';
    const split = peelCaption(value);
    // Only when it did NOT also send a proper caption tag. If it sent both, the
    // real one wins and the stray heading block is its problem, not ours.
    if (split.caption && !actions.some((a) => a.name === 'set_caption')) {
      actions.push({ name: 'set_caption', args: { text: split.caption } });
    }
    const words = split.caption ? split.lyrics : value;
    if (words) actions.push({ name: 'set_lyrics', args: { text: words } });
    return '';
  });

  text = text.replace(DO_TAG, (_m, json) => {
    try {
      const parsed = JSON.parse(json);
      if (parsed && parsed.action) actions.push({ name: String(parsed.action), args: parsed.args || {} });
    } catch { /* a malformed block is dropped, never shown raw */ }
    return '';
  });

  // A tag that never closed is a truncated reply. Cut it rather than printing
  // machinery at somebody who asked for a song.
  text = text.replace(UNCLOSED, '');

  return { text: text.replace(/\n{3,}/g, '\n\n').trim(), actions };
}

/**
 * Ask the ghost something.
 *
 * `history` is the conversation so far as [{role, content}]. `context` is
 * whatever the current tab wants it to know, already trimmed by the caller.
 */
export async function askGhost({ history = [], question, config, tab = 'songwriter', context = '', signal } = {}) {
  const key = assertApiKey(config);

  // The model they already chose in Settings comes first. Forcing a free one
  // here looked tidy and was wrong the moment Chris put a paid key in: it left
  // him rate limited on a shared free model while paying for one that was not
  // busy. The free list is the fallback, which is also what somebody with no
  // model set gets, so nobody is pushed onto a bill they did not ask for.
  const chosen = String(config?.model || '').trim();
  const free = await resolveGhostModel();
  const model = chosen || free;
  if (!model) {
    throw new Error('I could not reach OpenRouter to find a model. Check the internet and try again.');
  }

  const messages = [
    { role: 'system', content: systemPrompt(tab, context) },
    // Keep the last few turns only. Free models have generous context but the
    // whole point of this is that it answers fast.
    ...history.slice(-8),
    { role: 'user', content: question },
  ];

  const post = (id, budget) => fetch(ENDPOINT, {
    method: 'POST',
    signal,
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://lyricist.app',
      'X-Title': 'Lyricist 4.2.0',
    },
    body: JSON.stringify({
      model: id,
      messages,
      temperature: 0.7,
      // THE REPLY BUDGET, not the context window. The models here carry 256k of
      // context; what ran out was room to WRITE. 1200 truncated a caption
      // mid-tag, which is how Chris ended up looking at a half written block
      // instead of a filled in song, and he called 4000 too tight for a five
      // minute song with nine full sections plus a caption. He is right that it
      // is close: that is roughly 4000 by itself. Costs nothing to raise,
      // because only what actually gets generated is ever paid for.
      max_tokens: budget,
      // The scratchpad has to stay out of the answer at the source. Asking for
      // it to be excluded is cheaper and safer than filtering it afterwards.
      reasoning: { exclude: true },
    }),
  });

  let res = await post(model, MAX_REPLY);

  // A busy shared model is the single most likely failure on the free router,
  // and it is not worth an error message when another one is sitting there.
  if (res.status === 429 && free && free !== model) {
    res = await post(free, MAX_REPLY);
  }

  // A few models reject a ceiling higher than their own output limit rather
  // than clamping it. Losing the whole answer over that would be daft.
  if (res.status === 400) {
    res = await post(model, SAFE_REPLY);
  }

  if (res.status === 401 || res.status === 403) {
    throw new Error('OpenRouter would not accept the key. Check it in Settings.');
  }
  if (res.status === 429) {
    throw new Error('Every model I tried is busy right now. Give it a minute and ask again.');
  }
  if (!res.ok) {
    throw new Error(`OpenRouter answered ${res.status}. Try again in a moment.`);
  }

  const json = await res.json();
  const raw = json?.choices?.[0]?.message?.content || '';
  // Explicit tags only. See the note at the top of this file for why the
  // aggressive pass would eat the middle out of a perfectly good answer.
  const cleaned = stripReasoning(raw);
  const { text, actions } = splitActions(cleaned);
  return { text, actions, model: json?.model || model };
}
