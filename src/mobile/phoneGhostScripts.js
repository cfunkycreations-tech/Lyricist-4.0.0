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
//   typeText what 'type' types. A function is called when he types, so the
//            Ghost Rider demo can rotate through the TikTok-trending artists.
//   optional the control only exists after a result. He says the same line
//            from the middle of the screen, so it is worded to be true either way.
//   pre / post   extra steps right before / after this one. They are promo-style
//            steps (PhoneGhost.jsx runs both kinds) and speak by `id`, from
//            promoLines.js, so the `${tab}-${index}` clips never shift.
//
// LIVE. Chris, 2026-10-25, on Ghost Rider: "It doesn't analyze the song... it
// doesn't scroll the page. It doesn't go along with anything that's saying." So
// with a writing key in Settings the Ghost Rider and Matrix walkthroughs DO it:
// he presses Analyze, Write Lyrics and Auto-Craft on the user's own key, waits
// for the real result and scrolls through it. Without a key he points, as before.
//   liveAction  the action on a live run ('click' really presses it)
//   liveRead    on a live run, scroll through this result while saying the line
//   livePre / livePost  extra steps on a live run only
//   liveSkip    the live steps already did this one
// He never opens the microphone.
// Never use the words in src/services/cliches.js, and never call the app free.
// ============================================================

import { nextTrendingArtist } from '../services/trendingArtists.js';
import { promoLines } from './promoLines.js';
import { riderFailed, riderAnalyzed, riderWritten, riderExtrasReady, matrixBusy, matrixHasSongs } from './ghostWaits.js';

const clickIf = (sel) => { const el = document.querySelector(sel); if (el && !el.disabled) el.click(); };

/** Auto-Craft's full songs: on, so the walkthrough's "two whole songs" is true. */
const fullSongsOn = () => {
  const box = document.querySelector('[data-demo="ql-fullsongs-opt"] input[type="checkbox"]');
  if (box && !box.checked) box.click();
};

/** @type {Record<string, { title: string, steps: object[] }>} */
export const PHONE_GHOST = {
  songwriter: {
    title: 'Songwriter',
    steps: [
      { line: "Hey bestie, I'm the Ghost. Your ghostwriter. Yes, I know, I've heard it. Quick lore drop: every tool in here talks to every other one. Songs, tags, words, they all travel. Songwriter's home base, so we start here." },
      { target: '[data-demo="sw-structure"]', line: "Step one, pick a shape. Verse, chorus, verse, chorus, bridge. Grab a preset if you're lost. Nobody's grading you. This isn't school." },
      { target: '[data-demo="sw-generate"]', line: "Generate Full Song writes the whole thing, top to bottom, in your style. Literally a cheat code. It runs on your AI key from Settings." },
      { target: '[data-demo="sw-lines"]', optional: true, line: "Got a draft? Every line shows up down here, and every single one's editable. Fix it, flip it, yeet it. Even the lines I wrote. Especially those. I won't be offended. Okay, maybe a little." },
      { target: '[data-demo="suno-kit"]', optional: true, line: "Write Suno Kit hands you everything Suno asks for. Style tags, a voice, a song description, plus up to twenty words for The Matrix. Every piece gets its own Copy button. You're welcome." },
      { target: '[data-demo="sw-send-studio"], [data-demo="sw-send-studio-top"]', optional: true, line: "Once there's a song, Send to Black Hole Studios takes it over there. Genre, mood, voice, tags, the whole squad goes with it. Zero retyping." },
      { target: '[data-demo="sw-pull-studio"]', line: "And it works in reverse. Pull from Studio drags the lyrics back from Black Hole Studios so you can rewrite them. Regret it? Undo. Nobody saw anything." },
      { line: "Here's the hack. Ghost Rider, The Matrix and Song Forge all send their songs here, and your tags follow the song everywhere. Like a clingy ex, but useful. Write it once, use it everywhere." },
    ],
  },

  blackhole: {
    title: 'Black Hole Studios',
    steps: [
      { line: "Welcome to Black Hole Studios. You bring the words, it brings a singer and a whole band. Honestly? Kind of a steal." },
      { target: '.omb-tier', line: "Simple keeps it clean. Full Control shows every single knob. Same studio, just more buttons to mash." },
      { target: '[data-demo="omb-pull"]', line: "Pull from Songwriter grabs the song you wrote over there. Lyrics, genre, mood, voice, tags. All of it. Retyping is so last year." },
      { target: '.omb-tags', line: "These tags are the blueprint. Verse, Chorus, Bridge. Your words bring the vibe, these bring the structure. Tap one to drop it in." },
      { target: '.omb-sheet', line: "Your lyrics live here. Give them one more read before you send it. A typo will cost you the whole take, and that's an L." },
      { target: '.omb-picks', line: "Pick a genre, a mood and a voice. Over two hundred genres in here, so go niche. Same picks as Songwriter, so change them here or there and they follow you around." },
      { target: '.omb-drafted', line: "This is the Input Caption. Biggest dial on how the song sounds, no cap. It writes itself from your picks and your style tags, even the ones from Ghost Rider. Change any word you want. It's your era." },
      { target: '[data-demo="omb-rewrite"]', line: "Tap Rewrite and the music model gives that caption a glow up. It touches the sound. Never your lyrics. Boundaries." },
      { target: '.omb-whole', line: "And this is the whole prompt, exactly what gets sent. No gatekeeping here. Copy grabs all of it." },
      { target: '[data-demo="suno-kit"]', optional: true, line: "Making it in Suno too? The Suno kit writes the style tags, the voice and the description for this song. Copy, paste, slay." },
      { target: '[data-demo="omb-takes"]', line: "Takes at once. Two is the default, so you get to pick a favorite. Like picking a favorite kid, except here it's allowed." },
      { target: '.omb-dice', line: "This number's the roll of the dice. Same words, new number, whole new performance. It saves with the song, so when you hit a banger, you can always find it again." },
      { target: '.omb-est', line: "It tells you how long it'll take before you start. Not after. Respecting your time? In this economy?" },
      { target: '.omb-make', line: "Make the Song kicks it all off. I'm not pressing it, though. Your song, your main character moment." },
      { target: '[data-demo="omb-send-sw"]', line: "Want to tweak the words? Send to Songwriter sends them right back. It's a two-way street, bestie." },
      { target: '.omb-credit', line: "And the music model gets its credit right here. Gotta give credit where it's due." },
      { line: "That's Black Hole Studios. Write it, sing it, then chop it, screw it or master it. Your songs show up in those tools too. Now go make something that slaps." },
    ],
  },

  analyzer: {
    title: 'Ghost Rider',
    steps: [
      { line: "This is Ghost Rider. My favorite, for obvious reasons. Name an artist and it reverse-engineers how they write. Then it passes all of that to the rest of the app." },
      {
        target: '[data-demo="gr-artist"]', action: 'type', typeText: nextTrendingArtist, line: "Let's run it. I'll type a name.",
        // An old report or song on screen would read as this artist's.
        livePre: [{ run: () => clickIf('[data-demo="gr-clear"]') }],
      },
      {
        target: '[data-demo="gr-analyze"]', line: "Then tap Analyze. It studies their rhymes, their rhythm, the words they can't stop saying, and writes you a full report. Receipts. It runs on your AI key.",
        liveAction: 'click',
        livePost: [
          { wait: riderAnalyzed, fail: riderFailed, at: '[data-demo="gr-analyze"]', timeout: 150000, id: 'rider-wait' },
          { read: '[data-demo="gr-report"]', ms: 9000, id: 'rider-report' },
          { target: '[data-demo="gr-write"]', action: 'click', id: 'rider-write' },
          { wait: riderWritten, fail: riderFailed, at: '[data-demo="gr-write"]', timeout: 180000, id: 'rider-write-wait' },
          { read: '[data-demo="gr-lyrics"]', ms: 14000, id: 'rider-lyrics' },
          // The 20 words and the Style DNA fill in after the song lands.
          { wait: riderExtrasReady, at: '[data-demo="gr-style-dna"]', timeout: 90000, soft: true },
        ],
      },
      { target: '[data-demo="gr-matrix-words"]', optional: true, line: "These are your Matrix words, up to twenty of them. They stay empty till Ghost Rider writes you a song, then they fill themselves in. Or type your own. Your secret's safe with me." },
      { target: '[data-demo="gr-words-send"]', optional: true, line: "One tap on Send to The Matrix and every one of them lands in its grid. No copying, no pasting. We love efficiency." },
      { target: '[data-demo="gr-style-dna"]', optional: true, line: "Style DNA belongs to The Matrix. It's their fingerprint: how they ride the beat, how hard they rhyme, the stuff they keep coming back to. It fills in when the song gets written, or type your own. Send it over and The Matrix uses it to steer your lyrics." },
      { target: '[data-demo="gr-dna-tags"]', optional: true, line: "And these are your Suno tags. Not the same as Style DNA, don't get it twisted. Copy them into Suno's style box, and they ride along with your song into Black Hole Studios." },
      { target: '[data-demo="gr-write"]', optional: true, liveSkip: true, line: "Write Lyrics gives you a brand new verse in that style. Their vibe, your words. Zero copy-paste." },
      { target: '[data-demo="gr-send"]', optional: true, line: "After that, Send to Songwriter pops up. One tap and the verse lands in Songwriter, tags and all." },
      { line: "So one artist name gets you a report, a stack of Matrix words, style tags and a fresh verse. Ghost Rider. The only ride I'm allowed on. Ghost problems." },
    ],
  },

  songforge: {
    title: 'Song Forge',
    steps: [
      { line: "Song Forge makes a whole song and its cover art in one go. Two for one. That's a W." },
      { target: '[data-demo="sf-mode"]', line: "Pick what comes first. Song First writes the lyrics, then paints a cover to match. Art First starts with a picture and writes the song from that. Pick your vibe." },
      { target: '[data-demo="sf-forge"]', line: "Then hit Forge. It writes the song, then paints the cover, so give it a minute. Patience is a vibe. It runs on your AI key." },
      { target: '[data-demo="suno-kit"]', optional: true, line: "Once you've forged a song, the Suno kit shows up. Tags, a voice, a description, and a handful of words for The Matrix. The whole starter pack." },
      { target: '[data-demo="sf-send"]', optional: true, line: "When it's done, a Send to Songwriter button shows up next to the lyrics. One tap and it's in Songwriter, verses and choruses already split. Chef's kiss." },
      { line: "Oh, and The Matrix can send its grid over here to start a song. Writer's block? Try Art First. Way easier to react to a picture than to stare down a blank page." },
    ],
  },

  quantum: {
    title: 'The Matrix',
    steps: [
      { line: "Welcome to The Matrix. Relax, no pills. You feed it words, it writes you two full songs. Simple as." },
      {
        target: '[data-demo="ql-keywords"]', action: 'type',
        typeText: 'pawn shop, borrowed truck, last paycheck, empty highway, fever',
        line: "Type your own words in here. Or skip the typing: Ghost Rider and the Suno kit can send their words straight in. I'll throw a few in. Random, but make it art.",
      },
      { target: '[data-demo="ql-load"]', action: 'click', line: "Then load them into the grid. Watch it fill up. Oddly satisfying." },
      { target: '.ql-tile', line: "Every tile is one of your words. They stay yours, no matter what. Ownership. Love that for you." },
      {
        target: '[data-demo="ql-fullsongs-opt"]', line: "Leave this ticked and you get two whole songs, not just two verses. Go big or go home.",
        pre: [{ run: fullSongsOn }],
        post: [{ target: '[data-demo="ql-pair"]', id: 'matrix-pair' }],
      },
      {
        target: '[data-demo="matrix-autocraft"]', line: "Then the magic button. Auto-Craft heats the grid, locks it in, and writes Song A and Song B. Main character energy. It runs on your AI key.",
        liveAction: 'click',
        livePost: [{
          // Done when the button is free again; songs or not after that is the result.
          wait: (ms) => !matrixBusy() && (matrixHasSongs() || ms > 4000),
          fail: () => !matrixHasSongs(),
          at: '.ql-status', timeout: 300000, id: 'matrix-wait',
          idle: [{ id: 'matrix-wait-2', after: 30000 }],
        }],
      },
      {
        target: '.ql-songs-out', optional: true, liveRead: '.ql-songs-out .ql-song-col', ms: 14000,
        line: "When they're done, Song A and Song B show up right here, stacked. Pick your favorite and send it to Songwriter. No pressure. Okay, a little pressure.",
        post: [
          { target: '.ql-songs-out .ql-meters', optional: true, id: 'matrix-songs' },
          { target: '.ql-songs-out .ql-remix', optional: true, id: 'matrix-remix' },
        ],
      },
      { target: '.ql-adv-toggle', line: "Want to drive it yourself? Advanced Studio Controls opens every manual step, and Send to Song Forge lives in there too. Hard mode, unlocked." },
      { line: "Words in, two songs out. You're basically a hacker now. Put it on your LinkedIn." },
    ],
  },

  loopstation: {
    title: 'RC-Funk 5000',
    steps: [
      { line: "This is the RC-Funk 5000. It's a looper. Record a little bit, it repeats, and you stack more on top. Instant band. No group chat drama." },
      { target: '[data-demo="rc-fx"] button', action: 'click', line: "First, I'll flip the Delay on, so you can hear it do its thing." },
      { target: '[data-demo="rc-play"]', action: 'click', line: "Play All starts every loop you've recorded. Nothing recorded yet? It'll call you out. Politely." },
      { target: '[data-demo="rc-fx"]', line: "Delay, Reverb and Dub live right here. Flip them on while your loops play. Instant vibe." },
      { target: '[data-demo="rc-record"]', line: "And this is Record. I'm not switching on your mic for you. That's a boundary. Tap it, play your bit, tap Stop, and round it goes." },
      { line: "Up to four tracks. Stack them, mix them, add some flavor. That's the looper. Go off." },
    ],
  },

  stemmer: {
    title: 'Stem Extraction',
    steps: [
      { line: "This one takes a finished song apart. Vocals, drums, bass, guitar, keys, and everything else. Full deconstruction era." },
      { target: '.stemmer-mode-bar', line: "Pick where it runs up here. On the phone, that's the cloud, on your own Replicate key." },
      { target: '.stemmer-btn.btn-neon-cyan', line: "Load Mix opens your files. Pick a WAV or an MP3. Any song you've got." },
      { target: '.stemmer-grid', line: "When it's done, every part gets its own row. Mute it, solo it, save it. Total control." },
      { target: '.stemmer-btn-gold', line: "Save All Stems grabs every part at once. Instant karaoke. No judgment." },
      { line: "That's stem splitting. Borrow the drums from your own song. Totally legal. I checked." },
    ],
  },

  booth: {
    title: 'Recording Booth',
    steps: [
      { line: "This is the Recording Booth. Got an idea? Catch it before it ghosts you. Trust me, I know how that works. Humming totally counts." },
      { target: '[data-demo="booth-record"]', line: "Tap Start Recording, then sing, play, hum, whatever. Tap it again and the take saves itself. I won't tap it for you. Your mic, your rules." },
      { target: '[data-demo="booth-library"]', line: "Every take lands here, on your phone. Loop one while you write the words somewhere else. Multitasking icon. Your takes show up in Chopped and Screwed too." },
      { line: "Record, stop, saved. Keep it as a WAV, or send it to MIDI Studio and turn it into notes. Easy." },
    ],
  },

  midistudio: {
    title: 'MIDI Studio',
    steps: [
      { line: "MIDI Studio turns sound into notes you can actually edit. Hit one wrong note? Fix that note, not the whole thing. We don't do full redos here." },
      { target: '[data-demo="midi-convert"]', line: "This is the converter. Feed it a voice memo, a riff, a take from the Booth, and it figures out the notes. Like magic, but math." },
      { target: '[data-demo="midi-roll"]', line: "Every note is a little block. Drag it, stretch it, delete it. The knobs underneath shape the sound." },
      { target: '[data-demo="midi-viz"]', action: 'click', line: "And this one's just for fun. Shuffle changes the visuals. Ooh. Pretty. Okay, I'm mesmerized." },
      { line: "Hum it in the Booth, turn it into notes in here, fix them up, play it back. No Wi-Fi needed. Touch grass and keep working." },
    ],
  },

  mastering: {
    title: 'Mastering Studio',
    steps: [
      { line: "Mastering Studio is the finish line. It makes every track sound like it belongs on the same album. Cohesive. Iconic." },
      { target: '[data-demo="master-chain"]', line: "This is the signal path. EQ, compressor, limiter, loudness. Sounds scary. Just pick a preset and act like you know." },
      { target: '[data-demo="master-export"]', line: "Export Album saves every track, the cover and the track list. It stays grayed out till everything's mastered, so no half-baked albums. Standards." },
      { line: "That's a real release, ready to drop. First line to finished record. Not bad, huh? Okay, it's incredible. Say it." },
    ],
  },

  screw: {
    title: 'Chopped & Screwed',
    steps: [
      { line: "Chopped and Screwed. That's a Houston sound, straight from DJ Screw. Respect the legend. Slow it down, chop it up." },
      { target: '.screw-drop', line: "Start with any audio file. It all happens right here on your phone. No studio needed." },
      { target: '.screw-field', optional: true, line: "Anything you've made in Black Hole Studios or the Booth shows up right here, ready to screw. Yes, that's the real name." },
      { target: '.screw-cols .screw-card:nth-of-type(2)', line: "Screwed is the speed. Everything slows down and the voice drops with it. That's the whole point. Slow-mo, but make it music." },
      { target: '.screw-pre', line: "These presets go from barely touched to way, way down. Start in the middle. Trust the process." },
      { target: '.screw-cols .screw-card:nth-of-type(3)', line: "Chopped is the stutter. It plays the same bit two or three times while the song keeps moving. Like a skipping CD, if you're old enough to know what that is." },
      { target: '.screw-slicerwrap', optional: true, line: "Load a song and a slicer shows up here. Tap any slice to add a chop, or take one out. You're the DJ now." },
      { target: '.screw-make', line: "Once a song's loaded, this button renders it. I'll leave that one to you. It saves back to your recordings." },
      { line: "Slow it down, chop it up. Houston would be proud. H-Town, stand up." },
    ],
  },

  settings: {
    title: 'Settings',
    steps: [
      { line: "Settings. Don't scroll away, this one's quick. Two seconds, I promise." },
      { target: '[data-demo="settings-key"]', line: "Paste your OpenRouter key in here, once. That one key runs every writing tool in the app: Songwriter, Ghost Rider, The Matrix, Song Forge, and the cover art. One key to rule them all." },
      { line: "Save it and you're set. Budget models, big-brain models, your call. Now go make something that slaps." },
    ],
  },
};

/** The app's tab id for Black Hole Studios differs from the Ghost's key for it. */
const GHOST_KEY = { ['blackhole']: 'blackhole' };

/** The key a tool's script and clips go by (clip files are <key>-<step>.mp3). */
export function phoneGhostKey(tabId) {
  return GHOST_KEY[tabId] || tabId;
}

export function phoneGhostFor(tabId) {
  return PHONE_GHOST[GHOST_KEY[tabId] || tabId] || null;
}

/** Every spoken line, for the bake script. The promo runs' lines are tab "promo". */
export function phoneGhostLines() {
  const out = [];
  for (const [tab, d] of Object.entries(PHONE_GHOST)) {
    d.steps.forEach((s, i) => {
      out.push({ id: `${tab}-${i}`, tabId: tab, text: s.line });
    });
  }
  return out.concat(promoLines());
}
