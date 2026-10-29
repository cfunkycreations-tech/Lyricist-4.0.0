// ============================================================
// Ghost Demo scripts, HARD tabs only.
// action: 'type' | 'click' | 'point' | 'say'
// Default for button targets is REAL click (operates the app).
// skipClick: true for mic/API-heavy controls we only show.
// desktopOnly: true for lines that are only true on Windows; the phone skips them.
// ============================================================

import { nextTrendingArtist } from '../../services/trendingArtists.js';

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
        say: 'Okay, Black Hole Studios. This is the tab that takes the words you wrote and sings them back to you, with a whole band behind them. Lowkey the coolest shit in here.',
        wait: 3600,
      },
      {
        target: '.omb-tier',
        say: 'Simple hides the deep knobs. Full Control shows every single one. Either way, nothing’s buried in a menu.',
        action: 'point',
        wait: 3600,
      },
      {
        target: '.omb-engine',
        desktopOnly: true,   // Kaggle / this computer: Windows only, see GhostDemo runsHere
        say: 'This is where it runs. Free cloud costs nothing and it’s the fastest, so it’s the default. The catch? It taps out around forty five seconds of music. Kaggle and this computer both make full length songs, and they’re free too.',
        action: 'point',
        wait: 5200,
      },
      {
        target: '[data-demo="omb-setup"]',
        desktopOnly: true,   // Kaggle / this computer: Windows only, see GhostDemo runsHere
        say: 'Set-up is how you turn Kaggle on, and trust me, do it first. Three steps. Open Kaggle, hit Create New Token, and paste that long code into the box. Do it once and you never have to again.',
        action: 'point',
        wait: 5600,
      },
      {
        target: '.omb-card header .omb-mini',
        say: 'Pull from Songwriter drops in the lyrics you already wrote, sections and all. Retyping? Never heard of her.',
        action: 'point',
        wait: 3600,
      },
      {
        target: '.omb-tags',
        say: 'These bracket tags are the real skeleton. Verse, Chorus, Bridge. Your words bring the mood, but these decide the shape of the song. Tap one to add it.',
        action: 'point',
        wait: 4400,
      },
      {
        target: '.omb-sheet',
        say: 'Your lyrics live here. Read them back before you start, because one typo and the whole damn run is cooked.',
        action: 'point',
        wait: 3600,
      },
      {
        target: '.omb-picks',
        say: 'Genre, mood and voice. Two hundred and forty one genres, and every one brings its own real instruments. Go niche. I dare you.',
        action: 'point',
        wait: 4000,
      },
      {
        target: '.omb-drafted',
        say: 'This is the Input Caption, and it’s the biggest lever on how the song comes out. No cap. It writes itself from your three picks, and every word is yours to change.',
        action: 'point',
        wait: 4800,
      },
      {
        target: '.omb-drafted .omb-mini',
        say: 'Rewrite with AI hands it to the music model’s own caption writer, free, on their server. It levels up the sound and leaves your lyrics alone. Respect.',
        action: 'point',
        wait: 4200,
      },
      {
        target: '.omb-whole',
        say: 'And this is the whole prompt, exactly how it gets sent. Input Caption plus Input Lyrics, nothing hidden. Zero gatekeeping. Copy puts all of it on your clipboard, so you can paste it anywhere.',
        action: 'point',
        wait: 5400,
      },
      {
        target: '[data-demo="omb-takes"]',
        say: 'Takes at once. Two is the default, so you get two versions of the same song and pick a fave. On Kaggle they cook side by side on two graphics cards, so two costs about the same as one. Easy W.',
        action: 'point',
        wait: 5400,
      },
      {
        target: '.omb-dice',
        say: 'The take number is the dice roll. Same words, new number, totally different performance. It saves with the song, so when one hits, you can always find your way back to it.',
        action: 'point',
        wait: 4600,
      },
      {
        target: '.omb-est',
        desktopOnly: true,   // Kaggle / this computer: Windows only, see GhostDemo runsHere
        say: 'It tells you how long before you commit, not after. Real talk, a long song on free hardware is a wait. Kaggle is honest, not quick. About seventeen damn minutes for thirty seconds of music. Now you know.',
        action: 'point',
        wait: 5200,
      },
      {
        target: '.omb-make',
        say: 'Make the Song starts it. I’m not pressing it for you, though. That burns real time on the free servers, and that’s your quota, not mine.',
        action: 'point',
        skipClick: true,
        wait: 4400,
      },
      {
        target: '.omb-credit',
        say: 'Music by MiniMax Music 3, credited right here. Their licence asks for it, and honestly? Credit where it’s due.',
        action: 'point',
        wait: 3400,
      },
      {
        say: 'That’s Black Hole Studios. Write the words in Songwriter, sing them here, then polish it up in Mastering Studio. Now go cook.',
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
        say: 'Okay, The Matrix. Don’t panic, there’s zero fucking code in here. Every step is a numbered button, and I’m hitting them in order. Follow me.',
        wait: 3200,
      },
      {
        target: '[data-demo="ql-keywords"]',
        say: 'Step one, your words. Click the keyword box and type anything you want in the song. I’ll throw some in.',
        action: 'type',
        typeText: 'pawn shop, borrowed truck, last paycheck, empty highway, static, fever',
        wait: 2600,
      },
      {
        target: '[data-demo="ql-load"]',
        say: 'Step two, Load into lattice. Watch the grid fill up with your words. They stay yours, always.',
        action: 'click',
        wait: 3200,
      },
      {
        target: '[data-demo="ql-actionbar"]',
        say: 'These are the Lattice controls. Every button lives right here under the grid. Left to right, numbered, in order. Easy.',
        action: 'point',
        wait: 3600,
      },
      {
        target: '[data-demo="ql-spotlight"]',
        say: 'Step three, Spotlight on. It goes orange so you know it’s armed.',
        action: 'click',
        wait: 2200,
      },
      {
        target: '.ql-tile',
        say: 'Now tap any tile to pour heat into it. Go nuts, tap as many as you damn well want.',
        action: 'click',
        wait: 2500,
      },
      {
        target: '[data-demo="ql-spotlight"]',
        say: 'Spotlight off. Now a click just picks a tile again, no heat.',
        action: 'click',
        wait: 1800,
      },
      {
        target: '[data-demo="ql-run"]',
        say: 'Step four, Run 12 gens. Watch the energy spread across the whole grid.',
        action: 'click',
        wait: 2800,
      },
      {
        target: '[data-demo="ql-crystallize"]',
        say: 'Step five, Crystallize. This freezes the field so it stops changing, and the button goes green so you know it worked. Your words never get swapped for dictionary filler. What you typed stays yours.',
        action: 'click',
        then: 'Locked in. The grid is frozen exactly like this, and that frozen version is what the AI reads when it writes your verse.',
        wait: 2800,
      },
      {
        target: '[data-demo="ql-runlock"]',
        say: 'And here’s the shortcut. Spread and Lock does steps four and five in one press. It runs the twelve generations, then locks the field for you. It’s the orange one, you can’t miss it.',
        action: 'point',
        then: 'Both ways are there on purpose. Run and Crystallize one at a time while you’re learning, then smash this one when you just want a verse. Speedrun mode.',
        wait: 3400,
      },
      {
        target: '[data-demo="ql-generate"]',
        say: 'Step six, Generate Neural Lyrics. This one needs your OpenRouter key in Settings. Set it, then run this demo back.',
        action: 'click',
        wait: 3500,
      },
      {
        target: '[data-demo="ql-send-songwriter"]',
        say: 'Then Send to Songwriter drops your verse right into the Songwriter tab. One click.',
        action: 'point',
        wait: 3000,
      },
      {
        target: '[data-demo="ql-send-forge"]',
        say: 'Or hit Send to Song Forge, and it takes the whole lattice and builds a full song around it.',
        action: 'point',
        wait: 3000,
      },
      {
        target: '[data-demo="ql-help"]',
        say: 'And if you ever forget the order, hit Help. It brings the step guide back and spells it all out. No shame.',
        action: 'point',
        wait: 3000,
      },
      {
        say: 'That’s the whole Matrix run. Type, load, spotlight, run, crystallize, generate, send. Six numbered buttons, zero commands to memorize. Neo could never.',
        wait: 3800,
      },
    ],
  },

  stemmer: {
    title: 'Stemmer',
    steps: [
      {
        say: 'Stemmer takes a finished song and splits it into real tracks you can solo and save. It’s giving producer.',
        wait: 2800,
      },
      {
        target: '.stemmer-mode-bar',
        say: 'Pick your engine up here. Local AI is the default. Real stems, right on this computer, no key, after a one-time setup. Cloud AI does the same quality on Replicate’s servers, with your own key. Offline is the quick, rough split. Fine for a preview.',
        action: 'point',
        wait: 4000,
      },
      {
        target: '.stemmer-btn.btn-neon-cyan',
        say: 'Load Mix opens your files. Grab a WAV or an MP3 of any finished song.',
        action: 'point',
        wait: 3000,
      },
      {
        target: '.stemmer-drop',
        say: 'Or just drag it onto this zone. Local and Offline never leave your computer. Cloud only uploads if you picked Cloud yourself.',
        action: 'point',
        wait: 3600,
      },
      {
        target: '.stemmer-grid',
        say: 'When it’s done, you get Vocals, Drums, Bass, Guitar, Keys and Other, each on its own row. Mute it, solo it, save it as a WAV. You’re running the board now. Hell yeah.',
        action: 'point',
        wait: 3600,
      },
      {
        target: '.stemmer-btn-gold',
        say: 'Save All Stems drops every part into one folder in your Documents. Straight into your DAW, zero save prompts.',
        action: 'point',
        wait: 3000,
      },
      {
        say: 'That’s Stemmer. Local by default, Cloud when your computer needs backup. Now go flip those drums.',
        wait: 3000,
      },
    ],
  },

  loopstation: {
    title: 'RC-Funk 5000',
    steps: [
      {
        say: 'This is the RC-Funk 5000. It’s a looper. Record a bit, it repeats, you stack more on top. And I’m about to flip some real switches.',
        wait: 2800,
      },
      {
        target: '[data-demo="rc-fx"] button',
        say: 'First up, Delay. Watch it flip on.',
        action: 'click',
        wait: 2200,
      },
      {
        target: '[data-demo="rc-play"]',
        say: 'Play All starts every loop you’ve got. Nothing recorded yet? It’ll call your ass out. Nicely. Record Track 1 first if you want the full stack.',
        action: 'click',
        wait: 3200,
      },
      {
        target: '[data-demo="rc-fx"]',
        say: 'Delay, Reverb and Dub FX all live on the master. Flip them on while your loops play and ride the Amount. That’s where the sauce is.',
        action: 'point',
        wait: 3600,
      },
      {
        target: '[data-demo="rc-record"]',
        say: 'This is Record. I’m not switching your mic on for you, that’s your call. Hit it, play your phrase, hit Stop Rec, and it loops.',
        action: 'point',
        wait: 3600,
      },
      {
        say: 'Stack up to four tracks. Mute them, set the volume, add some FX. That’s the looper. You’re a whole band now. Badass.',
        wait: 3000,
      },
    ],
  },

  analyzer: {
    title: 'Ghost Rider',
    steps: [
      {
        say: 'Ghost Rider. Name an artist and it breaks down exactly how they write. Rhymes, flow, their go-to words. Let’s run one.',
        wait: 2800,
      },
      {
        target: '[data-demo="gr-artist"]',
        say: 'Let me drop in somebody who’s blowing up on TikTok right now.',
        action: 'type',
        typeText: nextTrendingArtist, // rotates through who's trending on TikTok
        wait: 2000,
      },
      {
        target: '[data-demo="gr-analyze"]',
        say: 'Then Analyze. It builds the full report and the Style DNA, as long as your OpenRouter key is in Settings. Receipts incoming.',
        action: 'click',
        wait: 4000,
      },
      {
        target: '[data-demo="gr-write"]',
        say: 'Write Lyrics is next. It gives you a brand new verse in that pocket. Same key.',
        action: 'point',
        optional: true,
        whenMissing:
          'Write Lyrics isn’t on screen yet. It only pops up after an analysis finishes. Run Analyze on a real artist with your key set, and it shows up right under the report. It writes you a new verse in their pocket. It never copies their actual words. We don’t do that shit here.',
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
        say: 'That’s the whole ride. Type a name, hit Analyze, write the verse, send it over. One artist in, a fresh verse out, and the words are still all yours.',
        wait: 2800,
      },
    ],
  },

  songwriter: {
    title: 'Songwriter',
    steps: [
      {
        say: 'Okay, this is Songwriter, home base. You’ll spend most of your time right here. Everything the other tabs make ends up here so you can finish it yourself. I’ll walk you through it in the order you’d actually use it.',
        wait: 3400,
      },
      {
        target: '[data-demo="sw-structure"]',
        say: 'Start with the structure. That’s the skeleton of the song, which parts go in what order. Verse, chorus, verse, chorus, bridge. No clue what you want? Grab a preset. Those are just the shapes most songs already use.',
        action: 'point',
        then: 'Get the shape down first, so you don’t write four fire lines and then have nowhere to put the damn things.',
        wait: 3800,
      },
      {
        target: '[data-demo="sw-generate"]',
        say: 'Generate Full Song writes the whole thing in one go, using the style, mood and topic up top plus the shape you just picked. It runs on your OpenRouter key from Settings. No key? It tells you, it doesn’t just sit there.',
        action: 'click',
        then: 'Whatever comes back is a first draft, not the final. It drops into the editor below, already split into your sections.',
        wait: 3600,
      },
      {
        target: '[data-demo="sw-lines"]',
        say: 'This is where the real work happens, the line editor. One row per line, and you can retype any of them. Nothing’s locked. An AI line, a Ghost Rider line, or one straight out of your head, you edit them all the same way.',
        action: 'point',
        wait: 3800,
      },
      {
        say: 'So the loop is: set the shape, get a draft or write it cold, then fix it line by line till it sounds like you. Not me. You. Ghost Rider and The Matrix both send their stuff straight into this editor.',
        wait: 3400,
      },
    ],
  },

  songforge: {
    title: 'Song Forge',
    steps: [
      {
        say: 'Song Forge makes a whole song and its cover art in one shot. Fastest way from nothing to something you can see and hear. One key runs both halves.',
        wait: 3200,
      },
      {
        target: '[data-demo="sf-mode"]',
        say: 'First, pick what comes first. Song First writes the lyrics, then paints a cover to match. Art First flips it. You make or upload a picture, and the song gets written from that. Same tools, different starting line.',
        action: 'point',
        then: 'No clue what you want yet? Go Art First. It’s way easier to vibe off a picture than stare at a blank fucking page.',
        wait: 3600,
      },
      {
        target: '[data-demo="sf-forge"]',
        say: 'This is Forge. It runs two AI calls back to back. One writes the song, one paints the cover, so it takes longer than a normal generate. The button shows you which half it’s on. It runs on your OpenRouter key from Settings.',
        action: 'point',
        then: 'Flip Auto-save on underneath, and every song and cover pair saves to your Documents folder by itself. Nothing gets lost. Ever.',
        wait: 3800,
      },
      {
        target: '[data-demo="sf-send"]',
        say: 'Once you’ve got a result, Send to Songwriter drops the sections on the main desk.',
        action: 'point',
        optional: true,
        whenMissing:
          'When Forge finishes, a Send to Songwriter button shows up next to the lyrics. It’s not here yet because we haven’t forged anything. Click it and the song lands in the Songwriter tab, already split into verses and choruses.',
        wait: 3200,
      },
      {
        say: 'Pro tip: The Matrix can send its grid over here to seed Forge before you hit the button. The tabs literally talk to each other.',
        wait: 2800,
      },
    ],
  },

  booth: {
    title: 'Recording Booth',
    steps: [
      {
        say: 'This is the Recording Booth. It records straight into Lyricist Pro. Harmonica, guitar, singing, humming, whatever. Catch the idea the second it hits, before that shit dips. I’m only pointing in here, because pressing Record would turn your mic on.',
        wait: 3600,
      },
      {
        target: '[data-demo="booth-record"]',
        say: 'This is Start Recording. One press and it’s capturing your mic, with a live meter so you can watch your level move. All the phone-call cleanup is switched off on purpose, so your instrument keeps its real tone.',
        action: 'point',
        then: 'While it’s rolling, the same button turns into Stop and Save, with a timer on it. Hit that and the take saves itself. No naming it first.',
        wait: 3800,
      },
      {
        target: '[data-demo="booth-library"]',
        say: 'Everything you record lands in your library and stays on your computer. Every take has a play button, so you can loop a riff while you write words on another tab. It keeps playing when you switch.',
        action: 'point',
        then: 'Rename a take, delete it, export it. Nothing in here gets uploaded anywhere. Your stuff stays your stuff.',
        wait: 3800,
      },
      {
        say: 'From here a take can go two ways. Export WAV saves a real audio file to your Documents for your DAW. Or send it to MIDI Studio and turn what you played into notes. Record, play, stop, saved. That’s literally it.',
        wait: 3600,
      },
    ],
  },

  voicelab: {
    title: 'Voice Lab',
    steps: [
      {
        say: 'Voice Lab. Write anything. A script, a speech, an intro for your mixtape. It reads it out loud in whatever voice you pick. I’m just pointing, so nothing gets read till you say so.',
        wait: 3400,
      },
      {
        target: '[data-demo="vl-script"]',
        say: 'This is the script box. Type it word for word, exactly how you want it read. Leave a blank line between paragraphs and the voice takes a breath there. Literally.',
        action: 'point',
        wait: 3200,
      },
      {
        target: '[data-demo="vl-voice"]',
        say: 'Pick a voice. Flip through with the arrows, or slide across. Thirty-three of them, from Gemini, MiniMax and Grok. Choose wisely.',
        action: 'point',
        wait: 3000,
      },
      {
        target: '[data-demo="vl-knobs"]',
        say: 'These shape the voice. Pace makes it faster or slower. Depth drops it deeper without that slowed-tape sound. Size, Warmth and Room do the rest. Double-click any knob to snap it back.',
        action: 'point',
        wait: 3400,
      },
      {
        target: '[data-demo="vl-direction"]',
        say: 'Direction tells a Gemini voice who’s talking and how. Like, a tired old bluesman taking his sweet ass time. And it actually listens. Unlike some people.',
        action: 'point',
        wait: 3000,
      },
      {
        target: '[data-demo="vl-play"]',
        say: 'Read it plays your whole script in that voice. It runs on your OpenRouter key, so set that up in Settings first.',
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
        say: 'That’s the Voice Lab. Write it, pick a voice, shape it, save it. Voiceover era unlocked.',
        wait: 2600,
      },
    ],
  },

  midistudio: {
    title: 'MIDI Studio',
    steps: [
      {
        say: 'MIDI Studio turns audio into notes you can actually edit. MIDI just means the notes, not a recording of them. So if one note’s off, you move that note instead of replaying the whole part. And it all runs offline on your computer.',
        wait: 3800,
      },
      {
        target: '[data-demo="midi-convert"]',
        say: 'This is the converter. Feed it audio. A hummed voice memo, a guitar riff, a take from the Recording Booth. It figures out which notes were played and builds them into the sequencer. Can’t play it for shit? Hum it. That’s a hundred percent valid.',
        action: 'point',
        then: 'When it’s done, you get a green line telling you what it converted and how many notes it found.',
        wait: 4000,
      },
      {
        target: '[data-demo="midi-roll"]',
        say: 'This is the piano roll and the effects rack. Every note’s a block. Drag it to move it, stretch it longer, or delete it. The rack underneath shapes the sound: filter, drive, delay, reverb. Lost? Reset puts every knob back to flat.',
        action: 'point',
        wait: 4000,
      },
      {
        target: '[data-demo="midi-viz"]',
        say: 'And this is the visualizer, the art that moves with your music. Shuffle jumps to a different preset, and there are hundreds. Let me hit it.',
        action: 'click',
        then: 'That one’s purely for the vibes. It doesn’t touch the audio at all.',
        wait: 3400,
      },
      {
        say: 'So the loop is: bring in audio, turn it into notes, fix them by hand, play it back, watch it move. No internet, no API key. Just you.',
        wait: 3400,
      },
    ],
  },

  mastering: {
    title: 'Mastering Studio',
    steps: [
      {
        say: 'Mastering Studio is the finish line. Mastering gives every track the same final polish, so they all hit the same loudness and tone. That’s what stops track four sounding thin and quiet next to track five. It all runs offline on your computer.',
        wait: 3800,
      },
      {
        target: '[data-demo="master-chain"]',
        say: 'This is the signal path, and it runs on every track. In order: a three-band EQ for bass, mids and treble, a compressor to glue it together, a limiter so it never clips, and loudness capped just under max so nothing distorts. Start with a preset. You don’t need to know what the hell any of it means to use it.',
        action: 'point',
        then: 'Change anything here and every track re-masters itself with the new settings. No redoing them one by one.',
        wait: 4200,
      },
      {
        target: '[data-demo="master-export"]',
        say: 'Export Album writes out the finished record. Every track as a numbered, mastered WAV, the cover as a PNG, and a tracklist, all in one folder in your Documents. It stays grayed out till every track is mastered, so you can’t drop a half-done record by accident.',
        action: 'point',
        wait: 4000,
      },
      {
        // "Songwriter to here" measured 12% word error — the narrator voice
        // splits a sentence-initial "Songwriter" into "some writer". Keeping the
        // word mid-sentence fixes it. See project-ghost-voice: judge a line by
        // what the recogniser hears, not by how it reads on the page.
        say: 'That folder is a real release package. The files you’d hand a distributor, upload, or burn. That’s the whole trip, from the Songwriter tab to a finished record. We love to see it.',
        wait: 3200,
      },
    ],
  },

  screw: {
    title: 'Chopped & Screwed',
    steps: [
      {
        say: 'Chopped and Screwed. This is the sound DJ Screw invented in Houston, and it’s actually two different moves that people say like one word.',
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
        say: 'Or pull one of your own recordings straight out of the app. A song you just made in Black Hole Studios shows up in this list.',
        action: 'point',
        optional: true,
        whenMissing:
          'There’s also a picker for your own recordings. It’s just not showing because you haven’t made any yet. Keep a take from Black Hole Studios or the Recording Booth, and it pops up right here, so you can screw your own song without leaving the app.',
        wait: 3800,
      },
      {
        target: '.screw-cols .screw-card:nth-of-type(2)',
        say: 'Screwed is the speed. The whole track slows down and the pitch sinks with it, because nothing corrects it. That sinking voice? That’s the whole damn point.',
        action: 'point',
        wait: 4600,
      },
      {
        target: '.screw-pre',
        say: 'Presets go from barely touched all the way down to sunk. Start in the middle and take it lower till it feels right.',
        action: 'point',
        wait: 3800,
      },
      {
        target: '.screw-cols .screw-card:nth-of-type(3)',
        say: 'Chopped is the edit, and it’s a whole different thing. A chop plays the same slice two or three times while the song only moves forward once. That stutter is what makes it a chop, not just a fast cut.',
        action: 'point',
        wait: 5200,
      },
      {
        target: '.screw-slicerwrap',
        say: 'The slicer draws the waveform with the beat grid on top. Click any slice to force a chop where the pattern skipped one, or take one out where it didn’t. Your edits win. Always.',
        action: 'point',
        optional: true,
        whenMissing:
          'The slicer’s not here yet because nothing’s loaded. Pick a song and it draws the whole waveform with the beat grid on top, and every slice is clickable. Click one to add a chop the pattern skipped, or take one out. Your edits always beat the pattern.',
        wait: 4800,
      },
      {
        target: '.screw-make',
        say: 'Then render it. I’m leaving that one to you. It saves straight back to your Recordings when it finishes.',
        action: 'point',
        skipClick: true,
        wait: 4000,
      },
      {
        say: 'That’s Chopped and Screwed. Slow it down, chop it up, and the sub follows the track instead of droning under it. Long live DJ Screw.',
        wait: 3800,
      },
    ],
  },

  settings: {
    title: 'Settings',
    steps: [
      {
        say: 'Settings. Quick as hell, I promise. Your keys are what unlock the whole studio.',
        wait: 2600,
      },
      {
        target: '[data-demo="settings-key"]',
        say: 'This is your OpenRouter key. Paste it in once. That one key runs all the writing and the Song Forge cover art, Nano Banana included. No Google AI Studio key needed.',
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
