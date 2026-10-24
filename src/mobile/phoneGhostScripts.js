// ============================================================
// THE GHOST, ON THE PHONE.
//
// Chris, 2026-10-22: no speech bubbles, no "remote session", nothing that
// sounds like a robot reading a manual. The Ghost points at the thing he is
// talking about, that thing glows, and he talks like a friend showing you
// around: warm, a bit funny, short.
//
// Every `line` is spoken from a baked clip, src/assets/ghost-vo-phone/<id>.mp3,
// where <id> is `${tab}-${index}`. ONE line per step, never a second version:
// Chris recorded the list straight through and the alternates came out as the
// Ghost repeating himself (2026-10-23).
// Change a line and re-bake it, or he says the old words:
//   node scripts/ghost-tts-openrouter.mjs --voice g38-algieba --only phone
//
// Step fields:
//   target   where he points (a CSS selector). It glows, and so does its label.
//   glow     extra selectors that glow with it.
//   action   'point' (default) | 'type' | 'click'. 'click' really presses it.
//   typeText what 'type' types.
//   optional the control only exists after a result. He says the same line
//            from the middle of the screen, so it is worded to be true either way.
// Nothing here presses a button that spends the user's AI credit or opens
// their microphone. Those are pointed at, never pressed.
// Never use the words in src/services/cliches.js, and never call the app free.
// ============================================================

/** @type {Record<string, { title: string, steps: object[] }>} */
export const PHONE_GHOST = {
  songwriter: {
    title: 'Songwriter',
    steps: [
      { line: "Hey! I'm the Ghost. I'm your ghostwriter. Yes, I know. Quick thing before we start: every tool in here talks to every other one. Songs, tags, words, they all travel. Songwriter's home base, so let's start here." },
      { target: '[data-demo="sw-structure"]', line: "First, pick a shape. Verse, chorus, verse, chorus, bridge. Grab a preset if you're not sure. Nobody's grading you." },
      { target: '[data-demo="sw-generate"]', line: "Generate Full Song writes the whole thing, top to bottom, in your style. It runs on your AI key from Settings." },
      { target: '[data-demo="sw-lines"]', optional: true, line: "Once you've got a draft, every line shows up down here, and every one's editable. Fix it, flip it, scrap it. Even the lines I wrote. Especially those." },
      { target: '[data-demo="suno-kit"]', optional: true, line: "Write Suno Kit gives you everything Suno asks for. Style tags, a voice, a song description, plus twenty words for The Matrix. Every piece has its own Copy button." },
      { target: '[data-demo="sw-send-studio"], [data-demo="sw-send-studio-top"]', optional: true, line: "Once there's a song, Send to Black Hole Studios takes it over there. The genre, the mood, the voice and your tags all go with it. Nothing to retype." },
      { target: '[data-demo="sw-pull-studio"]', line: "And it works backwards too. Pull from Studio brings the lyrics from Black Hole Studios back here to rewrite. Changed your mind? Undo puts it back." },
      { line: "Here's the trick. Ghost Rider, The Matrix and Song Forge all send their songs here, and your tags follow the song wherever it goes. Write it once, use it everywhere." },
    ],
  },

  blackhole: {
    title: 'Black Hole Studios',
    steps: [
      { line: "Welcome to Black Hole Studios. You bring the words, it brings a singer and a whole band. Pretty good deal, honestly." },
      { target: '.omb-tier', line: "Simple keeps it clean. Full Control shows every knob. Same studio, just more buttons to play with." },
      { target: '[data-demo="omb-pull"]', line: "Pull from Songwriter grabs the song you wrote over there. Lyrics, genre, mood, voice, tags. All of it. No retyping, ever." },
      { target: '.omb-tags', line: "These tags are the blueprint. Verse, Chorus, Bridge. Your words set the mood, these set the shape. Tap one to drop it in." },
      { target: '.omb-sheet', line: "Your lyrics live here. Give them one more read before you go. A typo costs you the whole take." },
      { target: '.omb-picks', line: "Pick a genre, a mood and a voice. Over two hundred genres in here. And they're the same picks Songwriter uses, so change them here or there, and they follow you." },
      { target: '.omb-drafted', line: "This is the Input Caption. It's the biggest dial on how the song sounds. It writes itself from your picks and your style tags, even the ones from Ghost Rider. Change any word you want." },
      { target: '[data-demo="omb-rewrite"]', line: "Tap Rewrite, and the music model polishes that caption for you. It touches the sound. Never your lyrics." },
      { target: '.omb-whole', line: "And this is the whole prompt, exactly what gets sent. No secrets. Copy grabs all of it." },
      { target: '[data-demo="suno-kit"]', optional: true, line: "Making it in Suno too? The Suno kit writes the style tags, the voice and the description for this song. Copy, paste, done." },
      { target: '[data-demo="omb-takes"]', line: "Takes at once. Two is the default, so you get to pick a favorite. Like picking a favorite kid, except you're allowed." },
      { target: '.omb-dice', line: "This number's the roll of the dice. Same words, new number, brand new performance. It's saved with the song, so you can always find a good one again." },
      { target: '.omb-est', line: "It tells you how long it'll take before you start. Not after. Very polite." },
      { target: '.omb-make', line: "Make the Song kicks it all off. I'm not pressing it, though. Your song, your moment." },
      { target: '[data-demo="omb-send-sw"]', line: "Want to tweak the words? Send to Songwriter sends them right back. It goes both ways." },
      { target: '.omb-credit', line: "And the music model gets its credit right here. Fair's fair." },
      { line: "That's Black Hole Studios. Write it, sing it, then chop it, screw it or master it. Your songs show up in those tools too. Go make some noise." },
    ],
  },

  analyzer: {
    title: 'Ghost Rider',
    steps: [
      { line: "This is Ghost Rider. My favorite, for obvious reasons. Name an artist, and it figures out how they write. Then it hands all of that to the rest of the app." },
      { target: '[data-demo="gr-artist"]', action: 'type', typeText: 'Kendrick Lamar', line: "Let's try one. I'll type a name." },
      { target: '[data-demo="gr-analyze"]', line: "Then tap Analyze. It studies their rhymes, their rhythm, their favorite words, and writes you a report. It runs on your AI key." },
      { target: '[data-demo="gr-matrix-words"]', optional: true, line: "These are your twenty words for The Matrix. They stay empty until Ghost Rider writes you a song, then they fill themselves in. Or type your own. I won't tell anyone." },
      { target: '[data-demo="gr-words-send"]', optional: true, line: "Then one tap on Send to The Matrix, and all twenty land in its grid. No copying, no pasting." },
      { target: '[data-demo="gr-style-dna"]', optional: true, line: "Style DNA belongs to The Matrix. It's the fingerprint of how they write: how they ride the beat, how hard they rhyme, and the pictures they keep coming back to. It fills in when the song gets written, or you can type your own. Send it over, and The Matrix uses it to steer your lyrics." },
      { target: '[data-demo="gr-dna-tags"]', optional: true, line: "And these are your Suno tags. They're separate from Style DNA. Copy them, paste them into Suno's style box, and they ride along with your song into Black Hole Studios." },
      { target: '[data-demo="gr-write"]', optional: true, line: "Write Lyrics gives you a brand new verse in that style. New words. Never theirs." },
      { target: '[data-demo="gr-send"]', optional: true, line: "And after that, Send to Songwriter appears. One tap, and the verse lands in Songwriter, tags and all." },
      { line: "So one artist name gets you a report, twenty Matrix words, style tags and a fresh verse. Ghost Rider. The only ride I'm allowed on." },
    ],
  },

  songforge: {
    title: 'Song Forge',
    steps: [
      { line: "Song Forge makes a whole song and its cover art in one go. Two for one. I love a bargain." },
      { target: '[data-demo="sf-mode"]', line: "Pick what comes first. Song First writes the lyrics, then paints a cover to match. Art First starts with a picture and writes the song from that." },
      { target: '[data-demo="sf-forge"]', line: "Then hit Forge. It writes the song, then paints the cover, so give it a minute. It runs on your AI key." },
      { target: '[data-demo="suno-kit"]', optional: true, line: "Once you've forged a song, the Suno kit shows up. Tags, a voice, a description, and twenty words for The Matrix." },
      { target: '[data-demo="sf-send"]', optional: true, line: "When it's done, a Send to Songwriter button shows up next to the lyrics. One tap, and it's in Songwriter, verses and choruses already split." },
      { line: "Oh, and The Matrix can send its grid over here to start a song. Stuck for ideas? Try Art First. It's way easier to react to a picture than to a blank page." },
    ],
  },

  quantum: {
    title: 'The Matrix',
    steps: [
      { line: "Welcome to The Matrix. Relax, no pills. You give it words, and it writes you two full songs." },
      {
        target: '[data-demo="ql-keywords"]', action: 'type',
        typeText: 'pawn shop, borrowed truck, last paycheck, empty highway, fever',
        line: "Type your own words in here. Or skip the typing: Ghost Rider and the Suno kit can send twenty words straight in. I'll throw a few in.",
      },
      { target: '[data-demo="ql-load"]', action: 'click', line: "Then load them into the grid. Watch it fill up with your words." },
      { target: '.ql-tile', line: "Every tile is one of your words. They stay yours, no matter what." },
      { target: '[data-demo="ql-fullsongs-opt"]', line: "Leave this ticked, and you get two whole songs, not just two verses." },
      { target: '[data-demo="matrix-autocraft"]', line: "Then the magic button. Auto-Craft heats the grid, locks it, and writes Song A and Song B. It runs on your AI key." },
      { target: '.ql-songs-out', optional: true, line: "When they're done, Song A and Song B show up right here, one on top of the other. Pick your favorite and send it to Songwriter." },
      { target: '.ql-adv-toggle', line: "Want to drive it yourself? Advanced Studio Controls opens every manual step, and Send to Song Forge lives in there too." },
      { line: "Words in, two songs out. You're basically a hacker now." },
    ],
  },

  loopstation: {
    title: 'RC-Funk 5000',
    steps: [
      { line: "This is the RC-Funk 5000. It's a looper. Record a little bit, it repeats, and you stack more on top. Instant band." },
      { target: '[data-demo="rc-fx"] button', action: 'click', line: "First, I'll switch the Delay on, so you can hear it." },
      { target: '[data-demo="rc-play"]', action: 'click', line: "Play All starts every loop you've recorded. Nothing recorded yet? It'll let you know." },
      { target: '[data-demo="rc-fx"]', line: "Delay, Reverb and Dub live right here. Flip them on while your loops play." },
      { target: '[data-demo="rc-record"]', line: "And this is Record. I won't switch on your mic for you. Tap it, play your bit, tap Stop, and round it goes." },
      { line: "Up to four tracks. Stack them, mix them, add some flavor. That's the looper." },
    ],
  },

  stemmer: {
    title: 'Stem Extraction',
    steps: [
      { line: "This one takes a finished song apart. Vocals, drums, bass, guitar, keys, and everything else." },
      { target: '.stemmer-mode-bar', line: "Pick where it runs up here. On the phone that's the cloud, on your own Replicate key." },
      { target: '.stemmer-btn.btn-neon-cyan', line: "Load Mix opens your files. Pick a WAV or an MP3." },
      { target: '.stemmer-grid', line: "When it's done, every part gets its own row. Mute it, solo it, save it." },
      { target: '.stemmer-btn-gold', line: "Save All Stems grabs every part at once. Instant karaoke, if that's your thing." },
      { line: "That's stem splitting. Borrow the drums from your own song. Totally legal." },
    ],
  },

  booth: {
    title: 'Recording Booth',
    steps: [
      { line: "This is the Recording Booth. Got an idea? Catch it before it gets away. Humming totally counts." },
      { target: '[data-demo="booth-record"]', line: "Tap Start Recording, then sing, play, hum, whatever. Tap it again and the take saves itself. I won't tap it for you. That's your mic." },
      { target: '[data-demo="booth-library"]', line: "Every take lands here, on your phone. Loop one while you write the words somewhere else. Your takes also show up in Chopped and Screwed." },
      { line: "Record, stop, saved. Keep it as a WAV, or send it to MIDI Studio and turn it into notes." },
    ],
  },

  midistudio: {
    title: 'MIDI Studio',
    steps: [
      { line: "MIDI Studio turns sound into notes you can actually edit. Hit one wrong note? Fix that note, not the whole thing." },
      { target: '[data-demo="midi-convert"]', line: "This is the converter. Give it a voice memo, a riff, a take from the Booth, and it works out the notes." },
      { target: '[data-demo="midi-roll"]', line: "Every note is a little block. Drag it, stretch it, delete it. The knobs underneath shape the sound." },
      { target: '[data-demo="midi-viz"]', action: 'click', line: "And this one's just for fun. Shuffle changes the visuals. Ooh. Pretty." },
      { line: "Hum it in the Booth, turn it into notes in here, fix them up, play it back. No internet needed." },
    ],
  },

  mastering: {
    title: 'Mastering Studio',
    steps: [
      { line: "Mastering Studio is the finish line. It makes every track sound like it belongs on the same record." },
      { target: '[data-demo="master-chain"]', line: "This is the chain. EQ, compressor, limiter, loudness. Sounds scary. Just pick a preset." },
      { target: '[data-demo="master-export"]', line: "Export Album saves every track, the cover and the track list. It stays grayed out until everything's mastered, so no half-baked albums." },
      { line: "That's a real release, ready to share. First line to finished record. Not bad, huh?" },
    ],
  },

  screw: {
    title: 'Chopped & Screwed',
    steps: [
      { line: "Chopped and Screwed. It's a Houston sound, straight from DJ Screw. Slow it down, chop it up." },
      { target: '.screw-drop', line: "Start with any audio file. It all happens right here on your phone." },
      { target: '.screw-field', optional: true, line: "Once you've made something in Black Hole Studios or the Booth, it shows up right here, ready to screw." },
      { target: '.screw-cols .screw-card:nth-of-type(2)', line: "Screwed is the speed. Everything slows down, and the voice drops with it. That's the whole point." },
      { target: '.screw-pre', line: "These presets go from barely touched to way, way down. Start in the middle." },
      { target: '.screw-cols .screw-card:nth-of-type(3)', line: "Chopped is the stutter. It plays the same bit two or three times while the song keeps moving." },
      { target: '.screw-slicerwrap', optional: true, line: "Load a song and a slicer shows up here. Tap any slice to add a chop, or take one out." },
      { target: '.screw-make', line: "Once a song's loaded, this button renders it. I'll leave that one to you. It saves back to your recordings." },
      { line: "Slow it down, chop it up. Houston would be proud." },
    ],
  },

  settings: {
    title: 'Settings',
    steps: [
      { line: "Settings. Don't run, this one's quick." },
      { target: '[data-demo="settings-key"]', line: "Paste your OpenRouter key in here, once. That one key runs every writing tool in the app: Songwriter, Ghost Rider, The Matrix, Song Forge, and the cover art." },
      { line: "Save it, and you're set. There are free models in there, and paid ones when you want to go bigger." },
    ],
  },
};

/** The app's tab id for Black Hole Studios differs from the Ghost's key for it. */
const GHOST_KEY = { ['onemanband']: 'blackhole' };

/** The key a tool's script and clips go by (clip files are <key>-<step>.mp3). */
export function phoneGhostKey(tabId) {
  return GHOST_KEY[tabId] || tabId;
}

export function phoneGhostFor(tabId) {
  return PHONE_GHOST[GHOST_KEY[tabId] || tabId] || null;
}

/** Every spoken line, for the bake script. */
export function phoneGhostLines() {
  const out = [];
  for (const [tab, d] of Object.entries(PHONE_GHOST)) {
    d.steps.forEach((s, i) => {
      out.push({ id: `${tab}-${i}`, tabId: tab, text: s.line });
    });
  }
  return out;
}
