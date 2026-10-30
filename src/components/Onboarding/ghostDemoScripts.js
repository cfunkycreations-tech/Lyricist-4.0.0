// ============================================================
// Ghost Demo scripts, HARD tabs only.
// action: 'type' | 'click' | 'point' | 'say'
// Default for button targets is REAL click (operates the app).
// skipClick: true for mic/API-heavy controls we only show.
// desktopOnly: true for lines that are only true on Windows; the phone skips them.
// ============================================================

import { nextTrendingArtist } from '../../services/trendingArtists.js';
import { randomMatrixWords } from '../../services/matrixWords.js';


export const GHOST_DEMO_TABS = new Set([
  'songwriter',
  'blackhole',
  'voicelab',
  'analyzer',
  'songforge',
  'quantum',
  'loopstation',
  'stemmer',
  'booth',
  'midistudio',
  'mastering',
  'screw',
  'settings',
]);

/** @type {Record<string, { title: string, steps: object[] }>} */
export const GHOST_DEMOS = {
  blackhole: {
    title: 'Black Hole Studios',
    steps: [
      {
        say: 'Okay, wait. This is Black Hole Studios. And bro, it’s actually insane. You type your lyrics, and it sings them back, with a whole band. I’m not even kidding.',
        wait: 3600,
      },
      {
        target: '.omb-tier',
        say: 'Simple hides all the boring knobs. Full Control shows every single one. Pick whichever, I don’t care. It’s your vibe.',
        action: 'point',
        wait: 3600,
      },
      {
        target: '.omb-engine',
        desktopOnly: true,   // Kaggle / this computer: Windows only, see GhostDemo runsHere
        say: 'This is where it runs. Free cloud is free. It’s fast, so it’s the default. Only thing is, it cuts off around forty five seconds. Kaggle and this computer do full songs, and they’re free too. Free stuff. Let’s go.',
        action: 'point',
        wait: 5200,
      },
      {
        target: '[data-demo="omb-setup"]',
        desktopOnly: true,   // Kaggle / this computer: Windows only, see GhostDemo runsHere
        say: 'Set-up is how you turn Kaggle on, and do it first, trust me. Three steps. Open Kaggle, hit Create New Token, paste the long code in the box. You only do it once. That’s it.',
        action: 'point',
        wait: 5600,
      },
      {
        target: '.omb-card header .omb-mini',
        say: 'Pull from Songwriter grabs the lyrics you already wrote. All of it. Typing it again? Dude, no.',
        action: 'point',
        wait: 3600,
      },
      {
        target: '.omb-tags',
        say: 'These bracket tags are like the skeleton. Verse, Chorus, Bridge. Your words are the vibe. The tags are the shape. Tap one and it just drops in.',
        action: 'point',
        wait: 4400,
      },
      {
        target: '.omb-sheet',
        say: 'Your lyrics go here. Read them again before you start, because one typo and the whole thing is cooked. I’ve been there.',
        action: 'point',
        wait: 3600,
      },
      {
        target: '.omb-picks',
        say: 'Genre, mood and voice. There are two hundred and forty one genres, and every one has real instruments. Pick something weird. I dare you.',
        action: 'point',
        wait: 4000,
      },
      {
        target: '.omb-drafted',
        say: 'This is the Input Caption, and it’s kind of the biggest deal on this whole screen. It writes itself from your three picks, and you can change any word. It’s your song, not mine.',
        action: 'point',
        wait: 4800,
      },
      {
        target: '.omb-drafted .omb-mini',
        say: 'Rewrite with AI sends it to the music model’s own caption writer. It’s free, and it makes the song hit way harder. Your lyrics stay exactly how you wrote them.',
        action: 'point',
        wait: 4200,
      },
      {
        target: '.omb-whole',
        say: 'And this is the whole prompt, exactly what gets sent. Caption and lyrics, nothing sketchy. Copy puts all of it on your clipboard, so paste it wherever.',
        action: 'point',
        wait: 5400,
      },
      {
        target: '[data-demo="omb-takes"]',
        say: 'Takes at once. It’s two by default, so you get two versions and keep the better one. On Kaggle they cook at the same time on two graphics cards, so two costs about the same as one. Double the songs, same price. Easy.',
        action: 'point',
        wait: 5400,
      },
      {
        target: '.omb-dice',
        say: 'The take number is basically a dice roll. Same words, new number, totally different performance. It saves with the song, so when you get a good one, you can always get it back.',
        action: 'point',
        wait: 4600,
      },
      {
        target: '.omb-est',
        desktopOnly: true,   // Kaggle / this computer: Windows only, see GhostDemo runsHere
        say: 'It tells you how long it’ll take before you start. Not after. And free hardware is slow, I’m just being honest. Kaggle takes like seventeen minutes for thirty seconds of music. Go touch grass or something.',
        action: 'point',
        wait: 5200,
      },
      {
        target: '.omb-make',
        say: 'Make the Song starts it. I’m not pressing it for you, though. It uses up your free server time, and that’s yours, not mine. Your call.',
        action: 'point',
        skipClick: true,
        wait: 4400,
      },
      {
        target: '.omb-credit',
        say: 'The music is from MiniMax Music 3, and they get credit right here. Their licence asks for it, and honestly, they earned it.',
        action: 'point',
        wait: 3400,
      },
      {
        say: 'That’s Black Hole Studios. Write the words in Songwriter, sing them here, then clean it up in Mastering Studio. Okay, go cook.',
        wait: 3400,
      },
    ],
  },

  quantum: {
    /* The TITLE is chrome and renames freely. The `say` lines below do not:
       each one is matched to a baked clip in assets/ghost-vo/ (quantum-0-say
       .mp3 and so on), so editing the words here puts a caption on screen that
       disagrees with the voice until that line is re-baked (Voice Lab, or
       scripts/ghost-tts-openrouter.mjs). Re-baked 2026-09-27 as The Matrix. */
    title: 'The Matrix',
    steps: [
      {
        say: 'Okay, The Matrix. Don’t freak out, there’s zero fucking code in here. Every step is a numbered button, and I’ll press them in order. Just watch.',
        wait: 3200,
      },
      {
        target: '[data-demo="ql-keywords"]',
        say: 'Step one, your words. Click the keyword box and type literally anything you want in the song. I’ll put some in.',
        action: 'type',
        typeText: () => randomMatrixWords(20), // Chris: twenty words, not five
        wait: 2600,
      },
      {
        target: '[data-demo="ql-load"]',
        say: 'Step two, Load into lattice. See the grid filling up with your words. They’re still yours, always.',
        action: 'click',
        wait: 3200,
      },
      {
        target: '[data-demo="ql-actionbar"]',
        say: 'These are the Lattice controls. Every button’s right here under the grid, numbered, left to right. It’s literally in order.',
        action: 'point',
        wait: 3600,
      },
      {
        target: '[data-demo="ql-spotlight"]',
        say: 'Step three, Spotlight on. It turns orange so you know it’s armed.',
        action: 'click',
        wait: 2200,
      },
      {
        target: '.ql-tile',
        say: 'Now tap any tile and it pours heat into it. Go crazy. Tap as many as you want.',
        action: 'click',
        wait: 2500,
      },
      {
        target: '[data-demo="ql-spotlight"]',
        say: 'Spotlight off. Now clicking just picks a tile. No heat.',
        action: 'click',
        wait: 1800,
      },
      {
        target: '[data-demo="ql-run"]',
        say: 'Step four, Run 12 gens. Watch the energy spread across the whole grid. Kinda hypnotic, not gonna lie.',
        action: 'click',
        wait: 2800,
      },
      {
        target: '[data-demo="ql-crystallize"]',
        say: 'Step five, Crystallize. It freezes the grid so it stops changing, and the button goes green so you know it worked. It never swaps your words for random dictionary stuff. What you typed stays.',
        action: 'click',
        then: 'Locked in. The grid is frozen just like this, and this frozen version is what the AI reads when it writes your verse.',
        wait: 2800,
      },
      {
        target: '[data-demo="ql-runlock"]',
        say: 'Okay, here’s the shortcut. Spread and Lock does steps four and five in one press. It runs the 12 gens and locks it for you. It’s the orange one, you can’t miss it.',
        action: 'point',
        then: 'Both ways are there on purpose. Do them one at a time while you’re learning, then just hit this one when you want a verse fast. Speedrun.',
        wait: 3400,
      },
      {
        target: '[data-demo="ql-generate"]',
        say: 'Step six, Generate Neural Lyrics. This one needs your OpenRouter key in Settings. Put that in, then run this demo again.',
        action: 'click',
        wait: 3500,
      },
      {
        target: '[data-demo="ql-send-songwriter"]',
        say: 'Then Send to Songwriter puts your verse right into the Songwriter tab. One click.',
        action: 'point',
        wait: 3000,
      },
      {
        target: '[data-demo="ql-send-forge"]',
        say: 'Or hit Send to Song Forge, and it takes the whole grid and builds a full song from it. That’s actually so cool.',
        action: 'point',
        wait: 3000,
      },
      {
        target: '[data-demo="ql-help"]',
        say: 'And if you forget the order, just hit Help. It brings the step guide back. No shame, I forget stuff too.',
        action: 'point',
        wait: 3000,
      },
      {
        say: 'That’s the whole Matrix. Type, load, spotlight, run, crystallize, generate, send. Six buttons, nothing to memorize. Neo could never.',
        wait: 3800,
      },
    ],
  },

  stemmer: {
    title: 'Stemmer',
    steps: [
      {
        say: 'Stemmer takes a finished song and splits it into separate tracks you can solo and save. Like you’re a producer now.',
        wait: 2800,
      },
      {
        target: '.stemmer-mode-bar',
        say: 'Pick your engine up here. Local AI is the default. Real stems on this computer, no key after one setup. Cloud AI is the same quality, but on Replicate’s servers with your own key.',
        action: 'point',
        wait: 4000,
      },
      {
        target: '.stemmer-btn.btn-neon-cyan',
        say: 'Offline is the quick, rough split. It’s fine for a preview.',
        action: 'point',
        wait: 3000,
      },
      {
        target: '.stemmer-drop',
        say: 'Load Mix opens your files. Grab a WAV or an MP3 of any finished song.',
        action: 'point',
        wait: 3600,
      },
      {
        target: '.stemmer-grid',
        say: 'Or just drag it onto this spot. Local and Offline never leave your computer. Cloud only uploads if you picked Cloud yourself.',
        action: 'point',
        wait: 3600,
      },
      {
        target: '.stemmer-btn-gold',
        say: 'When it’s done, you get Vocals, Drums, Bass, Guitar, Keys and Other, each on its own row. Mute it, solo it, save it as a WAV. You’re running the board. Let’s go.',
        action: 'point',
        wait: 3000,
      },
      {
        say: 'Save All Stems puts every part in one folder in your Documents. Straight into your DAW, no pop-ups. That’s Stemmer. Local by default, Cloud when your computer can’t handle it. Now go mess with those drums.',
        wait: 3000,
      },
    ],
  },

  loopstation: {
    title: 'RC-Funk 5000',
    steps: [
      {
        say: 'This is the RC-Funk 5000. It’s a looper. You record a bit, it repeats, and you stack more on top. Watch me flip some switches. This part’s fun.',
        wait: 2800,
      },
      {
        target: '[data-demo="rc-fx"] button',
        say: 'First up, Delay, and it’s on.',
        action: 'click',
        wait: 2200,
      },
      {
        target: '[data-demo="rc-play"]',
        say: 'Play All starts every loop you’ve got. Nothing recorded yet? It’ll call you out, nicely. Record track one first if you want the full stack.',
        action: 'click',
        wait: 3200,
      },
      {
        target: '[data-demo="rc-fx"]',
        say: 'Delay, Reverb and Dub FX are all on the master. Turn them on while your loops play and ride the amount. That’s where the magic is.',
        action: 'point',
        wait: 3600,
      },
      {
        target: '[data-demo="rc-record"]',
        say: 'This is Record. I’m not turning your mic on for you, that’s up to you. Hit it, play your thing, hit Stop Record, and it loops.',
        action: 'point',
        wait: 3600,
      },
      {
        say: 'Stack up to four tracks. Mute them, change the volume, throw effects on. That’s the looper. You’re a whole band now. Main character energy.',
        wait: 3000,
      },
    ],
  },

  analyzer: {
    title: 'Ghost Rider',
    steps: [
      {
        say: 'Ghost Rider. You type in an artist and it breaks down how they write. Their rhymes, their flow, the words they always use. Let’s try one.',
        wait: 2800,
      },
      {
        target: '[data-demo="gr-artist"]',
        say: 'I’m gonna put in somebody who’s blowing up on TikTok right now.',
        action: 'type',
        typeText: nextTrendingArtist, // rotates through who's trending on TikTok
        wait: 2000,
      },
      {
        target: '[data-demo="gr-analyze"]',
        say: 'Then Analyze. It makes the full report and the Style DNA, as long as your OpenRouter key’s in Settings. Receipts incoming.',
        action: 'click',
        wait: 4000,
      },
      {
        target: '[data-demo="gr-write"]',
        say: 'Write Lyrics is next. It writes you a brand new verse in that same style. Same key.',
        action: 'point',
        optional: true,
        whenMissing:
          'Write Lyrics isn’t on the screen yet. It only shows up after an analysis finishes. Run Analyze on a real artist with your key set, and it pops up under the report. It writes a new verse in their style that never copies their actual words. We don’t do that shit here.',
        wait: 3200,
      },
      {
        target: '[data-demo="gr-send"]',
        say: 'Got lyrics? Then Send to Songwriter shows up, and one click puts them on the main desk.',
        action: 'point',
        optional: true,
        whenMissing:
          'Send to Songwriter isn’t here yet either. It shows up once you’ve got lyrics. One click and the verse lands in the Songwriter tab, split into sections you can edit line by line.',
        wait: 3200,
      },
      {
        say: 'That’s the whole thing. Type a name, hit Analyze, write the verse, send it over. One artist in, a fresh verse out, and the words are still all yours.',
        wait: 2800,
      },
    ],
  },

  songwriter: {
    title: 'Songwriter',
    steps: [
      {
        say: 'Okay, this is Songwriter. It’s home base. You’re gonna spend most of your time here. Everything the other tabs make ends up here, so you can finish it yourself. I’ll go in the order you’d actually use it, so just follow me.',
        wait: 3400,
      },
      {
        target: '[data-demo="sw-structure"]',
        say: 'Start with the structure. That’s the skeleton of the song. Which part goes where? Verse, chorus, verse, chorus, bridge. Don’t know what you want? Grab a preset. They’re just shapes most songs already use.',
        action: 'point',
        then: 'Get the shape down first, so you don’t write four fire lines and then have nowhere to put them. That’s happened to me. It sucks.',
        wait: 3800,
      },
      {
        target: '[data-demo="sw-generate"]',
        say: 'Generate Full Song writes the whole song at once, using the style, mood and topic up top, plus the shape you picked. It runs on your OpenRouter key from Settings. No key? It tells you. It doesn’t just sit there being weird.',
        action: 'click',
        then: 'Whatever comes back is a first draft, not the final. It drops into the editor below, already split into your sections.',
        wait: 3600,
      },
      {
        target: '[data-demo="sw-lines"]',
        say: 'This is where the real work happens, the line editor. One row per line, and you can retype any of them. Nothing’s locked. An AI line, a Ghost Rider line, one you made up yourself, you edit them all the same.',
        action: 'point',
        wait: 3800,
      },
      {
        say: 'So it goes like this. Set the shape, get a draft or write your own, then fix it line by line till it sounds like you. Not me, you. Ghost Rider and The Matrix both send their stuff straight into this editor.',
        wait: 3400,
      },
    ],
  },

  songforge: {
    title: 'Song Forge',
    steps: [
      {
        say: 'Song Forge makes a whole song and its cover art at the same time. It’s the fastest way to go from nothing to something you can see and hear. One key runs both.',
        wait: 3200,
      },
      {
        target: '[data-demo="sf-mode"]',
        say: 'First, pick what comes first. Song First writes the lyrics, then paints a cover to match. Art First does the opposite. You make or upload a picture, and the song gets written from that.',
        action: 'point',
        then: 'Got no idea what you want yet? Do Art First. It’s so much easier to get ideas from a picture than from a blank fucking page.',
        wait: 3600,
      },
      {
        target: '[data-demo="sf-forge"]',
        say: 'This is Forge. It does two AI calls, one after the other, one for the song and one for the cover, so it takes longer than a normal generate. The button shows which half it’s on. It runs on your OpenRouter key from Settings.',
        action: 'point',
        then: 'Turn Auto-save on underneath, and every song and cover saves to your Documents folder by itself. Nothing gets lost.',
        wait: 3800,
      },
      {
        target: '[data-demo="sf-send"]',
        say: 'Once you’ve got a result, Send to Songwriter puts the sections on the main desk.',
        action: 'point',
        optional: true,
        whenMissing:
          'When Forge finishes, a Send to Songwriter button shows up next to the lyrics. It’s not here yet because we haven’t made anything. Click it, and the song goes into Songwriter, already split into verses and choruses.',
        wait: 3200,
      },
      {
        say: 'Pro tip: The Matrix can send its grid over here to start Forge off before you even press the button. The tabs literally talk to each other. That’s so sick.',
        wait: 2800,
      },
    ],
  },

  booth: {
    title: 'Recording Booth',
    steps: [
      {
        say: 'This is the Recording Booth. It records straight into Lyricist Pro. Guitar, harmonica, singing, humming, anything. Get the idea down the second you have it, before it’s gone. I’m only pointing here because pressing record turns your mic on.',
        wait: 3600,
      },
      {
        target: '[data-demo="booth-record"]',
        say: 'This is Start Recording. One press and it’s picking up your mic, with a live meter so you can see your level move. The phone call cleanup is off on purpose, so your instrument sounds real.',
        action: 'point',
        then: 'While it’s recording, the same button turns into Stop and Save, with a timer. Hit that and the take saves itself. No naming it first.',
        wait: 3800,
      },
      {
        target: '[data-demo="booth-library"]',
        say: 'Everything you record goes in your library and stays on your computer. Every take has a play button, so you can loop a riff while you write on another tab. It keeps playing when you switch.',
        action: 'point',
        then: 'Rename the take, delete it, export it. Nothing in here gets uploaded anywhere. Your stuff stays your stuff.',
        wait: 3800,
      },
      {
        say: 'From here, a take can go two ways. Export WAV saves a real audio file to your Documents for your DAW. Or send it to MIDI Studio and turn what you played into notes. Record, play, stop, saved. That’s literally it.',
        wait: 3600,
      },
    ],
  },

  voicelab: {
    title: 'Voice Lab',
    steps: [
      {
        say: 'Voice Lab. Write anything. A script, a speech, an intro for your mixtape. It reads it out loud in whatever voice you pick. I’m just pointing, so nothing gets read until you say so.',
        wait: 3400,
      },
      {
        target: '[data-demo="vl-script"]',
        say: 'This is the script box. Type it exactly how you want it said. Leave a blank line between paragraphs and the voice takes a breath there. For real.',
        action: 'point',
        wait: 3200,
      },
      {
        target: '[data-demo="vl-voice"]',
        say: 'Pick a voice. Flip through with the arrows, or slide across. There are thirty-three, from Gemini, MiniMax and Grok. Choose wisely.',
        action: 'point',
        wait: 3000,
      },
      {
        target: '[data-demo="vl-knobs"]',
        say: 'These shape the voice. Pace makes it faster or slower. Depth makes it deeper without that slowed-down tape sound. Size, warmth and room do the rest. Double-click any knob to reset it.',
        action: 'point',
        wait: 3400,
      },
      {
        target: '[data-demo="vl-direction"]',
        say: 'Direction tells a Gemini voice who’s talking and how. Like, a tired old bluesman taking his sweet-ass time. And it actually listens, unlike some people.',
        action: 'point',
        wait: 3000,
      },
      {
        target: '[data-demo="vl-play"]',
        say: 'Read It plays your whole script in that voice. It runs on your OpenRouter key, so set that up in Settings first.',
        action: 'point',
        wait: 3000,
      },
      {
        target: '[data-demo="vl-save"]',
        say: 'Save WAV saves it as an audio file. An intro, a skit, a voiceover, whatever you need.',
        action: 'point',
        wait: 2800,
      },
      {
        say: 'That’s Voice Lab. Write it, pick a voice, shape it, save it. Voiceover era.',
        wait: 2600,
      },
    ],
  },

  midistudio: {
    title: 'MIDI Studio',
    steps: [
      {
        say: 'MIDI Studio turns audio into notes you can actually edit. MIDI just means the notes, not a recording of them. So if one note’s wrong, you move that one note instead of playing the whole thing again. And it all runs offline on your computer.',
        wait: 3800,
      },
      {
        target: '[data-demo="midi-convert"]',
        say: 'This is the converter. Put audio in. A hummed voice memo, a guitar riff, a take from the Recording Booth. It figures out which notes were played and puts them in the sequencer. Can’t play for shit? Hum it. That totally counts.',
        action: 'point',
        then: 'When it’s done, you get a green line saying what it converted and how many notes it found.',
        wait: 4000,
      },
      {
        target: '[data-demo="midi-roll"]',
        say: 'This is the piano roll and the effects rack. Every note is a block. Drag it to move it, stretch it or delete it. The rack underneath changes the sound. Filter, drive, delay, reverb. Lost? Reset puts every knob back to flat.',
        action: 'point',
        wait: 4000,
      },
      {
        target: '[data-demo="midi-viz"]',
        say: 'And this is the visualizer, the art that moves with your music. Shuffle jumps to a different preset, and there are hundreds. Watch.',
        action: 'click',
        then: 'That one’s just for the vibes. It doesn’t change the audio at all.',
        wait: 3400,
      },
      {
        say: 'So the whole thing is: bring in audio, turn it into notes, fix them, play it back, watch it move. No internet, no key, just you.',
        wait: 3400,
      },
    ],
  },

  mastering: {
    title: 'Mastering Studio',
    steps: [
      {
        say: 'Mastering Studio is the last step. Mastering gives every track the same final polish, so they all have the same loudness and tone. That’s what stops track four sounding quiet and tiny next to track five. It all runs offline on your computer.',
        wait: 3800,
      },
      {
        target: '[data-demo="master-chain"]',
        say: 'This is the signal path, and it runs on every track. In order: a three-band EQ for bass, mids and treble, a compressor to glue it together, a limiter so it never clips, and loudness capped just under the max so nothing distorts. Start with a preset. You don’t need to know what the hell any of that means.',
        action: 'point',
        then: 'Change anything here, and every track re-masters itself with the new settings. No doing them one by one.',
        wait: 4200,
      },
      {
        target: '[data-demo="master-export"]',
        say: 'Export Album writes out the finished record. Every track as a numbered, mastered WAV, the cover as a PNG, and a track list, all in one folder in your Documents. It stays greyed out until every track is mastered, so you can’t export a half-finished record by accident.',
        action: 'point',
        wait: 4000,
      },
      {
        // "Songwriter to here" measured 12% word error — the narrator voice
        // splits a sentence-initial "Songwriter" into "some writer". Keeping the
        // word mid-sentence fixes it. See project-ghost-voice: judge a line by
        // what the recogniser hears, not by how it reads on the page.
        say: 'That folder is a real release. It’s the files you’d give a distributor, upload or burn. That’s the whole trip, from the Songwriter tab to a finished record. I love that for you.',
        wait: 3200,
      },
    ],
  },

  screw: {
    title: 'Chopped & Screwed',
    steps: [
      {
        say: 'Chopped and Screwed. This is the sound DJ Screw made in Houston, and it’s actually two different moves that people say like one word. Respect the legend.',
        wait: 4200,
      },
      {
        target: '.screw-drop',
        say: 'Drop any audio file here to start. It never leaves your computer. All of this runs right here.',
        action: 'point',
        wait: 3800,
      },
      {
        target: '.screw-field',
        say: 'Or grab one of your own recordings straight from the app. A song you just made in Black Hole Studios shows up in this list.',
        action: 'point',
        optional: true,
        whenMissing:
          'There’s also a picker for your own recordings. It’s just hiding because you haven’t made any yet. Keep a take from Black Hole Studios or the Recording Booth, and it shows up here, so you can screw your own song without leaving the app.',
        wait: 3800,
      },
      {
        target: '.screw-cols .screw-card:nth-of-type(2)',
        say: 'Screwed is the speed. The whole track slows down and the pitch drops with it, because nothing fixes it. That sinking voice? That’s the whole point.',
        action: 'point',
        wait: 4600,
      },
      {
        target: '.screw-pre',
        say: 'Presets go from barely touched all the way to sunk. Start in the middle and go lower until it feels right.',
        action: 'point',
        wait: 3800,
      },
      {
        target: '.screw-cols .screw-card:nth-of-type(3)',
        say: 'Chopped is the editing, and it’s a totally different thing. A chop plays the same little slice two or three times, while the song only moves forward once. That stutter is what makes it a chop.',
        action: 'point',
        wait: 5200,
      },
      {
        target: '.screw-slicerwrap',
        say: 'The slicer draws the waveform with the beat grid on top. Click a slice to force a chop where the pattern skipped one, or take one out where it didn’t. Your edits win, always.',
        action: 'point',
        optional: true,
        whenMissing:
          'The slicer’s not here yet because nothing’s loaded. Pick a song and it draws the whole waveform with the beat grid on top, and every slice is clickable. Click one to add a chop the pattern skipped, or take one out. Your edits always win.',
        wait: 4800,
      },
      {
        target: '.screw-make',
        say: 'Then render it. I’m leaving that one to you. It saves right back to your Recordings when it’s done.',
        action: 'point',
        skipClick: true,
        wait: 4000,
      },
      {
        say: 'That’s Chopped and Screwed. Slow it down, chop it up, and the bass follows the track instead of just droning under it. Long live DJ Screw.',
        wait: 3800,
      },
    ],
  },

  settings: {
    title: 'Settings',
    steps: [
      {
        say: 'Settings. I’ll be quick, I promise. Your keys are what unlock the whole studio.',
        wait: 2600,
      },
      {
        target: '[data-demo="settings-key"]',
        say: 'This is your OpenRouter key. Paste it in once. That one key runs all the writing and the Song Forge cover art, Nano Banana too. You don’t need a Google AI Studio key.',
        action: 'click',
        wait: 3800,
      },
      {
        say: 'Save it and you’re set. There are free models, and paid ones that go further, including the image models for your covers. Your call.',
        wait: 3000,
      },
    ],
  },
};

export function getGhostDemo(tabId) {
  if (!GHOST_DEMO_TABS.has(tabId)) return null;
  return GHOST_DEMOS[tabId] || null;
}

export function isGhostDemoTab(tabId) {
  return GHOST_DEMO_TABS.has(tabId);
}
