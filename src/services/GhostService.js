/**
 * THE GHOST, WITH A BRAIN.
 *
 * The Ghost Demo could already walk you through a tab, but only along a script
 * somebody wrote in advance. Chris asked for the other thing: something always
 * there that answers questions, writes the words, writes the MiniMax sound
 * description, and presses the buttons.
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

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const MODELS_URL = 'https://openrouter.ai/api/v1/models';

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
  onemanband: 'One Man Band: turns written words into a real sung song. Has the lyrics box, '
    + 'the sound description (style / singer / band), genre-mood-voice pickers, length, takes, '
    + 'take numbers, and where it runs (free cloud, Kaggle, this computer).',
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
MiniMax Music 3 takes two things: an INPUT CAPTION and INPUT LYRICS. In this app
the caption is split across three boxes, and together they are one caption:
  1. The style   -> the Global Metadata section
  2. The singer  -> the Vocal Details section
  3. The band    -> the Arrangement section

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

function systemPrompt(tab, context) {
  const actions = availableGhostActions();
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

WRITING LYRICS. Write like a person, not like a machine. Show feeling through
physical detail and things left unsaid rather than naming the emotion. Avoid
neon, shadows, whispers, echoes, sparks, cage, gravity, storm, wings, chains.
Irregular line lengths. Slant rhymes over perfect ones. No neat moral endings.

YOU CAN PRESS THINGS. To do something, put a line on its own in your reply:
<do>{"action":"NAME","args":{...}}</do>
The person sees what you did, not the tag. Available right now:
${actions.length ? actions.map((a) => `  - ${a}`).join('\n') : '  (nothing: no tab has offered anything yet)'}

ACTION NOTES:
  open_tab {"tab":"onemanband"} switches tabs. A tab has to be open before you
    can change anything on it, so open it first and say you are doing that.
  set_lyrics {"text":"..."} replaces the words. append_lyrics adds to the end.
  set_caption {"style":"...","singer":"...","band":"..."} sets any of the three
    parts of the sound description. Send only the parts you are changing.
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

/** Pull the action blocks out of a reply, and give back the prose without them. */
export function splitActions(reply) {
  const actions = [];
  const text = String(reply || '').replace(DO_TAG, (_m, json) => {
    try {
      const parsed = JSON.parse(json);
      if (parsed && parsed.action) actions.push({ name: String(parsed.action), args: parsed.args || {} });
    } catch { /* a malformed block is dropped, never shown raw */ }
    return '';
  });
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

  const post = (id) => fetch(ENDPOINT, {
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
      max_tokens: 1200,
      // The scratchpad has to stay out of the answer at the source. Asking for
      // it to be excluded is cheaper and safer than filtering it afterwards.
      reasoning: { exclude: true },
    }),
  });

  let res = await post(model);

  // A busy shared model is the single most likely failure on the free router,
  // and it is not worth an error message when another one is sitting there.
  if (res.status === 429 && free && free !== model) {
    res = await post(free);
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
