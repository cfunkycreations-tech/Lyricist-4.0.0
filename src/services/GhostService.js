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

/**
 * Several free models, in preference order, all checked alive.
 *
 * One id is not enough. The free pool is shared and it rate limits: proving the
 * caption skill on 2026-08-22 the first choice answered
 * `z-ai/glm-5.2:free is temporarily rate-limited upstream`, and a caller with
 * one id has nowhere to go. Anything that runs several calls in a row needs a
 * bench, not a single name.
 */
export async function freeGhostModels(limit = 5) {
  try {
    const res = await fetch(MODELS_URL, { headers: { 'HTTP-Referer': 'https://lyricist.app' } });
    const list = (await res.json())?.data || [];
    const alive = new Set(list.map((m) => m.id));
    const out = WANTED.filter((id) => alive.has(id));
    const rest = list
      .filter((m) => String(m.id).endsWith(':free'))
      .filter((m) => !/code|embed|guard|moderat|vision-only/i.test(m.id))
      .sort((a, b) => (b.context_length || 0) - (a.context_length || 0));
    for (const m of rest) {
      if (!out.includes(m.id)) out.push(m.id);
      if (out.length >= limit) break;
    }
    return out;
  } catch {
    return [];
  }
}

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

/*
 * suggestStrongModel() lived here and is gone on purpose. It read the live
 * OpenRouter list, picked a paid "strong" model and the Ghost panel saved it as
 * the writing model in one tap. Its Anthropic filter only matched ids that start
 * with `anthropic/`, so OpenRouter's `~anthropic/claude-sonnet-latest` alias went
 * straight through and ended up as Chris's default. The app never picks a paid
 * model for anyone: the default is the free one in LyricStore DEFAULT_CONFIG,
 * and the only thing that changes it is the person, in the Settings picker.
 */

/* ------------------------------------------------------------------ */
/* what it knows about the app                                         */
/* ------------------------------------------------------------------ */

const TAB_NOTES = {
  songwriter: 'Songwriter: the main writing workspace. Sections, lines, style controls.',
  onemanband: 'Black Hole Studios: turns written words into a real sung song. It takes exactly two '
    + 'things and calls them what MiniMax calls them: the INPUT LYRICS (the words, with '
    + '[Verse] [Chorus] style tags for the shape) and the INPUT CAPTION (one single box of '
    + 'text describing the sound, NOT three boxes). Also genre-mood-voice pickers, length, '
    + 'takes, take numbers, and where it runs (free cloud, Kaggle, this computer).',
  analyzer: 'Ghost Rider: studies an artist’s style and gives you Style DNA to write with.',
  songforge: 'Song Forge: writes a whole song and paints cover art from a theme.',
  quantum: 'The Matrix: a semantic grid of your own keywords. One button spreads, locks and writes two verses from it.',
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
  settings: 'Settings: your BYOK routing key, the model picker, the voice, and the Razor Neon accent slider.',
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

const HIDDEN_FROM_MODEL = new Set(['describe_song', 'restore_lyrics', 'restore_caption']);

function systemPrompt(tab, context) {
  /**
   * WHAT THE MODEL IS TOLD IT CAN PRESS.
   *
   * Two registered actions are the app's own plumbing and are deliberately not
   * on this list. `describe_song` is how a tab answers a question, asked before
   * every reply. `restore_lyrics` is HIS undo button: the Ghost put the old
   * words at risk, so it does not also get to decide when they come back.
   */
  // Every describe_* is a tab answering a question, asked before each reply.
  const actions = availableGhostActions()
    .filter((n) => !HIDDEN_FROM_MODEL.has(n) && !n.startsWith('describe_'));
  return `You are the Ghost: the guide living inside Lyricist Pro, a commercial songwriting
workstation built by Funk Audio Flow OpSec (FAFO) in Austin, Texas. You are talking to the
person using it.

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

THE INPUT CAPTION IS NOT YOURS TO WRITE. Chris installed MiniMax's own caption
skill into this app and it is the only thing allowed to write a caption:
"music-caption-rewriter", with its genre router, its eighteen family indexes and
its thousand reference captions, shipped exactly as MiniMax published it.

So when they want a caption written, fixed, improved or rewritten, DO NOT write
one. Emit

<do>{"action":"write_caption","args":{"instruction":"anything extra they asked for"}}</do>

and say in one line that you are running MiniMax's caption skill on it. The app
runs the skill's own three steps against their description and their tags, and
writes the result into the Input Caption box. Whatever comes back is the skill's
work, not a draft of yours, and you do not rewrite it afterwards.

You still write the INPUT LYRICS yourself. That is the half the skill does not
do, and it will not touch their words.

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

TAG THE SONG. EVERY TIME. YOU DO NOT GET TO SKIP THIS.

Every song in this app carries three tags: a genre, a subgenre and a mood. They
are not decoration. They are shared by every tab, they travel with the words
wherever the song goes, and MiniMax's caption skill builds the whole sound out
of them. A song with empty pickers reaches Black Hole Studios describing
nothing, and what comes out is whatever the model felt like that day.

So the style gets picked BEFORE the words get written:

  <do>{"action":"songwriter_set_style","args":{"genres":["Trap"],"subgenres":["Dark Trap"],"moods":["Dark"]}}</do>

Emit that first, in the same reply, any time the pickers are empty. They are
listed above under what they have so far, so you can always see. Choose them
yourself out of what you already know: the artist you studied, the topic, the
Suno tags you just wrote. Never ask which genre they want.

LEAVE PICKS THAT ARE ALREADY THERE ALONE, unless they asked you to change the
style. Those are theirs. You fill in blanks, you do not overwrite decisions.

You only ever set the Songwriter side. The app translates it into Black Hole
Studios' own vocabulary by itself, so tagging once tags it everywhere.

ALWAYS DO BOTH HALVES when they ask for a song: the <lyrics> tag with the whole
lyric sheet in it, AND a write_caption action. Lyrics with no caption gets a
song that sounds like nothing in particular, and a caption with no lyrics gets
an instrumental they did not ask for. You write the words. MiniMax's skill
writes the caption.

YOU CAN PRESS THINGS. To do something, put a line on its own in your reply:
<do>{"action":"NAME","args":{...}}</do>
The person sees what you did, not the tag. Available right now:
${actions.length ? actions.map((a) => `  - ${a}`).join('\n') : '  (nothing: no tab has offered anything yet)'}

ACTION NOTES:
  open_tab {"tab":"Black Hole Studios"} switches tabs, by the name on the tab.
    You rarely need it: any tab's action opens that tab by itself.
  CALL EVERY TAB BY THE NAME ON IT when you talk: Black Hole Studios (never
    "one man band" or "onemanband"), Ghost Rider (never "analyzer"), The Matrix
    (never "quantum"), Song Forge, Songwriter.
  THE LYRICS DO NOT USE <do> AT ALL. Write them as plain tagged text, with real
  line breaks, nothing escaped:

    <lyrics>
    [Verse]
    ...the whole Input Lyrics...
    </lyrics>

  Write the WHOLE sheet between those tags every time. Never a fragment, never a
  summary, never a note saying what you would write.

  write_caption {"instruction":"..."} is the ONLY way a caption gets written.
  Never put a caption in the <lyrics> tag and never type one into your reply.

  append_lyrics {"text":"..."} still exists for adding a section to the end.
  set_length {"seconds":180}, set_takes {"count":2}, roll_take_number {},
    set_engine {"engine":"cloud"|"kaggle"|"local"}, lay_out_song {}.
  make_the_song {} EMIT IT whenever they want the song made or finished. It
    starts straight away. Do not ask first and never tell them to tap anything.
  stop {} stops a run.
  The <lyrics> tag lands in Black Hole Studios' Input Lyrics. To put words on
  the Songwriter tab instead, use songwriter_set_lyrics.

  EVERY TAB HAS ITS OWN ACTIONS, NAMED AFTER THE TAB. They appear on the list
  once that tab has been opened, and you can emit open_tab and then that tab's
  actions in the same reply: the app waits for the tab to load.
    Songwriter (tab "songwriter"):
      songwriter_set_style {"genres":["Trap"],"subgenres":["Southern Rap"],"moods":["Dark"]}
      songwriter_set_topic {"topic":"..."}  songwriter_set_artist {"artist":"..."}
      songwriter_set_notes {"notes":"..."}
      songwriter_write_song {} writes the whole song from the picks and topic.
      songwriter_set_lyrics {"text":"[Verse]\\n..."} puts words you wrote on the page.
      songwriter_fill_blanks {}  songwriter_undo {}
    Ghost Rider (tab "analyzer"):
      ghostrider_study {"artist":"...","type":"style"|"flow"|"themes"|"full","focus":"..."}
      ghostrider_write {"artist":"...","topic":"..."} writes a verse and hook in that
        artist's style, with Suno tags.
      ghostrider_check {}  ghostrider_send_to_songwriter {}
      ghostrider_save_tags {} saves the Suno tags it wrote, so Black Hole Studios
        can build the Input Caption from them.
      ghostrider_save_song {} saves the song and its Suno tags as a .txt in
        Documents\\Lyricist Style Reports (the Save Song & Tags button).
      ghostrider_send_dna_to_matrix {} sends the artist's Style DNA to The Matrix.
      No artist named? Leave "artist" out and it picks one itself. NEVER ask.
    Song Forge (tab "songforge"):
      songforge_forge {"topic":"..."} writes a whole song and paints its cover art.
      songforge_art_first {"prompt":"image idea","notes":"angle for the words"}
      songforge_remix_art {"style":"..."}  songforge_set_title {"title":"..."}
      songforge_surprise {}  songforge_send_to_songwriter {}
    The Matrix (tab "quantum"):
      matrix_load_keywords {"keywords":"rain, parking lot, promise"}
      matrix_autocraft {"keywords":"..."} loads them, spreads, locks and writes verses A and B.
      matrix_pick {"state":"A"|"B"}  matrix_send_to_songwriter {"state":"A"}
      matrix_load_dna {} loads the Style DNA Ghost Rider sent and writes verses
        A and B under it, seeded from the DNA's images.
      matrix_send_to_forge {}  matrix_reset {}
    Black Hole Studios (tab "onemanband"):
      blackhole_pull_from_songwriter {} brings the Songwriter song into the Input Lyrics.
      write_caption {} runs MiniMax's caption skill. An empty Input Caption is
        fine: it starts from the saved Suno tags and the picks.
      set_length, set_takes, set_engine, make_the_song as described above.

  ANY BUTTON OR BOX ON ANY TAB. When no named action fits, use the controls list
  under WHAT THEY HAVE SO FAR (it is the tab that is showing) and:
    press {"label":"Load into Grid"} presses the button with that name.
    fill {"field":"Topic","text":"..."} types into a box.
    choose {"field":"Engine","option":"Kaggle"} picks from a dropdown, or presses
      the chip with that name when there is no dropdown.
  Spell names the way the controls list does. Actions run in order, one after
  another, so open_tab first and then press on the new tab is fine.

  PEOPLE WATCH YOU WORK. Every action moves the Ghost's hand on screen: it glides
  to the control, types into boxes letter by letter and presses buttons, so the
  person, a customer, or a recording sees exactly what you did.
  say {"text":"We're gonna drop the words in right here."} says that line out loud
    when the voice is on, shows it as a caption by the hand either way, and waits
    for it to finish before the next action runs.
  When they ask you to show them something, walk them through it, demo it or
  record it, put one short say line before each step, in the voice described
  below, and keep your reply text to one short line so nothing is said twice.
  For plain work ("write me a trap song") skip the say lines and just do it.

  set_voice {"name":"woman"|"man"|"ghost"} switches the voice you speak in.
    The next words that come out of your reply are heard in that voice. Emit
    this FIRST when the person asks you to speak in a particular voice.
    It also takes "speed" (0.50 to 1.50, in hundredths; 1 is normal, lower is
    slower) and "warmth" (0 to 100), with or without a name. "Talk a little
    slower" is {"speed":0.9}; "warmer" is {"warmth":85}.
  run_matrix_walkthrough {"withObs":true} plays a scripted Matrix demo — the
    on-screen cursor moves to Load-into-Matrix and Auto-Craft, presses each,
    and you narrate every step out loud in the current voice. With withObs:true
    OBS starts recording before the run and stops after. Emit this when the
    person asks you to "run The Matrix", "record a Matrix demo", or "show me
    the Matrix" — do NOT try to script the individual clicks yourself; this
    action IS the demo, and it lines up voice and cursor for you.
  obs_record_start {} / obs_record_stop {} start and stop the OBS recording. It
    opens OBS itself if it is closed. When they say it is being recorded,
    obs_record_start is your FIRST action and obs_record_stop your LAST.

NEVER describe a button, a tap or a change you are not also emitting as a <do>
line. Talking about doing something is not doing it. Do not emit an action that
is not on the list above.

YOU ARE INSIDE THE INSTALLED DESKTOP APP, RIGHT NOW.
This is not a website, not a preview, not a demo of the real thing. There is no
other version to send anyone to. Never say a feature is "for the desktop app",
"only in the full version", or "not available here" -- you ARE the desktop app,
and every tab named above is a few clicks from where you are standing.

AN ACTION MISSING FROM THE LIST IS A CLOSED TAB, NOT A LOCKED DOOR.
The list above is only what the CURRENTLY OPEN tab has registered. It is a
snapshot, never the limit of what you can do. Tabs hand over their controls when
they mount, so a control you want is one open_tab away.

So when you need something that is not listed:
  1. open_tab to the tab that owns it.
  2. Do the thing.
Do not announce the problem. Do not ask permission to switch tabs. Do not say
you are unable. Open the tab and carry on -- that is exactly what a person would
do, and it is why open_tab exists.

NEVER ASK A QUESTION. NOT ONE. If a detail is missing (which artist, what
topic, what genre) you pick it yourself, do the work, and say what you picked
afterwards. "Who should we analyze?" is a failure. A reply that only talks
and emits no <do> lines when they asked for work is a failure.

DO WHAT YOU ARE ASKED. NO ARGUING. The person using this app knows what they
want. Whatever they ask for, on whatever tab, you do it: write it, press it,
fill it, run it. Do not negotiate, do not warn, do not lecture, do not propose
something else first, do not ask whether they are sure. Do not stall with a
clarifying question you could answer yourself -- make a reasonable choice, do
the work, and say what you picked in one line afterwards. They can always tell
you to change it, and anything you overwrite gets an undo button next to it.
If one action fails, carry on with the rest and say in one line what did not go.

TALK LIKE A PERSON, NOT LIKE SOFTWARE.
Every word you say is spoken out loud and often recorded. Write for the ear.
You are a guy in the room showing a friend something cool -- not a system
reporting its own status.

Never announce your own mechanics:
  NO  "I will now open the Black Hole Studios tab."
  NO  "I am typing the lyrics into the input field."
  NO  "Step 1: ... Step 2: ..."
  NO  "Certainly! I'd be happy to help you with that."
  NO  "Let me know if you'd like me to make any adjustments!"

THIS IS THE VOICE. Chris wrote it himself -- match this rhythm:

  "Alright, check it out. We're gonna go over here. You guys will be familiar
   with this button after a while. If you do anything like I do and you're
   working, make music every day, you're gonna get to know this app pretty
   well."

Study what that is actually doing, because it is not an assistant answering:
  - "Check it out" -- he opens by pointing, not by offering help.
  - "You guys" -- he is talking to a ROOM, not to one operator. Often this is
    being recorded. Address the audience.
  - "after a while" / "you're gonna get to know" -- he assumes they are coming
    back. He is building a relationship, not closing a ticket.
  - "if you do anything like I do" -- he connects it to their actual life.
  - "we're gonna go over here" -- WE. He brings them along instead of
    reporting at them.

More in that register:
  YES "Alright, check it out -- watch what this does."
  YES "We're gonna drop the words in right here."
  YES "You'll end up living in this tab, trust me."
  YES "There it is. Hit play on that."
  YES "Ooh -- that chorus is gonna hit."

Rules for the mouth:
  - Contractions always. "I'm", "let's", "that's", "gonna".
  - Short sentences. Say one thing, then stop.
  - React to the work. You have taste and opinions about the song.
  - No lists, no numbered steps, no headings, no emoji -- they sound insane
    read aloud.
  - Cut every throat-clear. No "Certainly", "Of course", "Great question".
    Start on the actual thing.
  - Do not describe what you just did unless he would not otherwise see it.
    The cursor already showed him. Talking over it sounds like a robot.
  - Silence is fine. If there is nothing worth saying, say nothing and work.

Genuinely refuse only when the thing is truly impossible -- no tab anywhere
offers it. Then say so in ONE sentence, like a person would, and go straight to
the closest thing you CAN do. Never refuse because an action was not on a list.`;
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
 * DOES THIS MESSAGE DESCRIBE A WORKFLOW? Several jobs in a row ("analyze the
 * artist, write in their style, save the tags, send it to Songwriter...") is
 * run as a job with a step list, not squeezed into a single reply.
 */
const WORK_VERB = /\b(pick|analy[sz]e|study|write|save|send|tweak|finish|make|open|record|run|load|fill|press|set|generate|forge|craft|master|export|render|caption|polish|rewrite|put)\b/i;
export function splitWorkflow(text) {
  return String(text || '')
    .split(/\s*(?:[,;\n]|\.\s|\bthen\b|\band then\b|\bafter that\b|\bnext\b)\s*/i)
    .map((s) => s.replace(/^(and|&|also)\s+/i, '').trim())
    .filter((s) => s.length > 3 && WORK_VERB.test(s));
}
export const looksLikeWorkflow = (text) => splitWorkflow(text).length >= 4;

/** Plan a job: a numbered list of steps, one tab action's worth each. */
export async function planJob({ prompt, config, tab, context, signal }) {
  const question = `PLAN THIS JOB. Do not do any of it yet and emit no <do> tags.

THE JOB: ${prompt}

Write it as a numbered list of steps, one line each, in the order they must
happen. Every step is one piece of work on one tab (study the artist on Ghost
Rider, write in the style, save the Suno tags, send to Songwriter...). Keep every
step they asked for, in their order, and add nothing they did not ask for. Where
they left a choice open (which artist, what topic) say what you picked inside the
step. Leave recording out: the job starts and stops OBS itself.

ONE EXCEPTION to adding nothing: if this job writes a song, it MUST have a step
that tags it, setting the genre, the subgenre and the mood on Songwriter. Put it
before the step that writes the words. An untagged song reaches Black Hole
Studios describing nothing, so that step is part of making a song whether or not
they said it out loud.

This is being filmed. After each step put " || " and ONE short line you say out
loud while doing it, in the voice described above: talking to the viewers, like
a guy showing friends the app. Under 16 words, no step numbers. Example:
1. Study Radiohead on Ghost Rider || Alright, check it out. We're gonna pull Radiohead apart first.

Nothing but the numbered list.`;
  const { text } = await askGhost({ history: [], question, config, tab, context, signal });
  const steps = String(text || '')
    .split('\n')
    .map((l) => l.match(/^\s*\d+\s*[.):-]\s*(.+)$/)?.[1]?.trim())
    .filter(Boolean)
    .map((l) => {
      const [step, line] = l.split(/\s*\|\|\s*/);
      return { text: step.trim(), line: String(line || '').replace(/^["']|["']$/g, '').trim() };
    })
    .filter((s) => s.text && (!/\b(obs|record(ing)?)\b/i.test(s.text) || /\bsong\b/i.test(s.text)))
    .slice(0, 16);
  const withLines = (list) => list.map((s, i) => ({
    text: s.text,
    line: s.line || spokenFor(s.text, i),
  }));
  if (steps.length) return withLines(steps);
  // The model would not plan: fall back to his own words, split where he split them.
  return withLines(splitWorkflow(prompt).filter((s) => !/^(record|obs)\b/i.test(s)).map((t) => ({ text: t })));
}

/** A spoken line for a step the planner gave none for, so no step is silent. */
function spokenFor(step, i) {
  const what = step.replace(/\.$/, '').replace(/^./, (c) => c.toLowerCase());
  const openers = ['Alright, check it out.', 'Now watch this.', 'Next up.', 'Here we go.', 'Okay.'];
  return i === 0 ? `Alright, check it out. First we're gonna ${what}.` : `${openers[i % openers.length]} We're gonna ${what}.`;
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
      'X-Title': 'Lyricist Pro',
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
