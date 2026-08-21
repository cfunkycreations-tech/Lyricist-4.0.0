// ============================================================
// Ghost Demo scripts, HARD tabs only.
// action: 'type' | 'click' | 'point' | 'say'
// Default for button targets is REAL click (operates the app).
// skipClick: true for mic/API-heavy controls we only show.
// ============================================================

export const GHOST_DEMO_TABS = new Set([
  'songwriter',
  'onemanband',
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
  onemanband: {
    title: 'One Man Band',
    steps: [
      {
        say: 'Remote session on One Man Band. This is the tab that takes the words you wrote and sings them back to you, with a full band behind them.',
        wait: 3600,
      },
      {
        target: '.omb-tier',
        say: 'Simple hides the deep knobs. Full Control shows every one of them. Nothing is buried behind a menu either way.',
        action: 'point',
        wait: 3600,
      },
      {
        target: '.omb-engine',
        say: 'Where it runs. Free cloud costs nothing and is also the fastest, so it is the default. It tops out around forty five seconds of music. Kaggle and this computer both make full length songs, and both are free as well.',
        action: 'point',
        wait: 5200,
      },
      {
        target: '[data-demo="omb-setup"]',
        say: 'Set-up is how you switch Kaggle on, and it is worth doing before anything else. It is three steps. Open Kaggle, click Create New Token, and paste the long code they show you into the box. Once, and it stays done.',
        action: 'point',
        wait: 5600,
      },
      {
        target: '.omb-card header .omb-mini',
        say: 'Pull from Songwriter drops the lyrics you already wrote straight in, sections and all. You never retype anything.',
        action: 'point',
        wait: 3600,
      },
      {
        target: '.omb-tags',
        say: 'These bracket tags are the real structure. Verse, Chorus, Bridge. The words carry the mood, but these decide the shape of the song. Tap one to add it.',
        action: 'point',
        wait: 4400,
      },
      {
        target: '.omb-sheet',
        say: 'Your lyrics live here. Read them back before you start, because a typo costs you the whole run.',
        action: 'point',
        wait: 3600,
      },
      {
        target: '.omb-picks',
        say: 'Genre, mood and voice. Two hundred and forty one genres, and each one brings its own real instruments into the description.',
        action: 'point',
        wait: 4000,
      },
      {
        target: '.omb-drafted',
        say: 'This is the sound description, and it is the single biggest lever on how the song comes out. It gets written for you from your three picks, and you can edit every word of it.',
        action: 'point',
        wait: 4800,
      },
      {
        target: '.omb-drafted .omb-mini',
        say: 'Rewrite with AI hands it to the music model’s own caption writer, free, on their server. It rewrites the sound and leaves your lyrics alone.',
        action: 'point',
        wait: 4200,
      },
      {
        target: '.omb-whole',
        say: 'And this is the whole prompt, exactly as it gets sent. The sound description and your words, together, nothing hidden from you. Copy it puts the lot on your clipboard, which is also what you paste into anything else.',
        action: 'point',
        wait: 5400,
      },
      {
        target: '[data-demo="omb-takes"]',
        say: 'Takes at once. Two is the default, because two versions of the same song give you something to choose between. On Kaggle they are made side by side on its two graphics cards, so asking for two costs about what one costs.',
        action: 'point',
        wait: 5400,
      },
      {
        target: '.omb-dice',
        say: 'The take number is the roll of the dice. Same words, new number, a different performance every time. It gets saved with the song so you can find your way back to one you liked.',
        action: 'point',
        wait: 4600,
      },
      {
        target: '.omb-est',
        say: 'It tells you how long before you commit, not after. A long song on free hardware is a real wait. Kaggle is honest rather than quick: about seventeen minutes for thirty seconds of music. You should know that going in.',
        action: 'point',
        wait: 5200,
      },
      {
        target: '.omb-make',
        say: 'Make the song starts it. I am not pressing it for you, because that spends real time on the free servers, and this is your quota not mine.',
        action: 'point',
        skipClick: true,
        wait: 4400,
      },
      {
        target: '.omb-credit',
        say: 'Music by MiniMax Music 3, credited right here, because their licence asks for it and that is only fair.',
        action: 'point',
        wait: 3400,
      },
      {
        say: 'That is One Man Band. Write the words in Songwriter, sing them here, then polish in Mastering Studio.',
        wait: 3400,
      },
    ],
  },

  quantum: {
    title: 'Quantum Lab',
    steps: [
      {
        say: 'Remote session starting on Quantum Lab. Nothing here needs typed commands, every step is a numbered button. Watch me press them in order.',
        wait: 3200,
      },
      {
        target: '[data-demo="ql-keywords"]',
        say: 'Step 1, click the keyword box and type your own words. Anything you want in the song.',
        action: 'type',
        typeText: 'neon rain, midnight, heartbreak, empty highway, static, fever',
        wait: 2600,
      },
      {
        target: '[data-demo="ql-load"]',
        say: 'Step 2, Load into lattice. Watch the grid fill with YOUR words. They stay yours.',
        action: 'click',
        wait: 3200,
      },
      {
        target: '[data-demo="ql-actionbar"]',
        say: 'These are the Lattice controls, every button lives right here under the grid. Left to right, numbered, in order.',
        action: 'point',
        wait: 3600,
      },
      {
        target: '[data-demo="ql-spotlight"]',
        say: 'Step 3, Spotlight ON. It goes orange so you know it is armed.',
        action: 'click',
        wait: 2200,
      },
      {
        target: '.ql-tile',
        say: 'Now click any tile to pour heat into it. Click as many as you like.',
        action: 'click',
        wait: 2500,
      },
      {
        target: '[data-demo="ql-spotlight"]',
        say: 'Spotlight off, clicks go back to selecting tiles instead of heating them.',
        action: 'click',
        wait: 1800,
      },
      {
        target: '[data-demo="ql-run"]',
        say: 'Step 4, Run 12 gens. The energy spreads across the grid.',
        action: 'click',
        wait: 2800,
      },
      {
        target: '[data-demo="ql-crystallize"]',
        say: 'Step 5, Crystallize. This locks the field in place so it stops changing, and the button turns green so you can see it worked. Your own words are never swapped out for dictionary words, whatever you typed stays yours.',
        action: 'click',
        then: 'Locked. The lattice is frozen exactly as it is now, and that frozen state is what the AI reads when it writes your verse.',
        wait: 2800,
      },
      {
        target: '[data-demo="ql-runlock"]',
        say: 'And here is the shortcut. Spread and Lock is Steps 4 and 5 in a single press, it runs the twelve generations and then locks the field for you. It is the orange button, so it is easy to find.',
        action: 'point',
        then: 'Both buttons are still there on purpose. Use Run and Crystallize one at a time while you are learning what each does, and use this one when you just want a verse.',
        wait: 3400,
      },
      {
        target: '[data-demo="ql-generate"]',
        say: 'Step 6, Generate Neural Lyrics. This one needs a free OpenRouter key in Settings. Set it, then replay this demo.',
        action: 'click',
        wait: 3500,
      },
      {
        target: '[data-demo="ql-send-songwriter"]',
        say: 'Then Send to Songwriter drops the verse straight into the Songwriter tab.',
        action: 'point',
        wait: 3000,
      },
      {
        target: '[data-demo="ql-send-forge"]',
        say: 'Or Send to Song Forge, which takes the whole lattice and builds a full song around it.',
        action: 'point',
        wait: 3000,
      },
      {
        target: '[data-demo="ql-help"]',
        say: 'And if you ever forget the order, hit Help. It reopens the step guide and spells it out.',
        action: 'point',
        wait: 3000,
      },
      {
        say: 'That is the whole Quantum path: type, load, spotlight, run, crystallize, generate, send. Six numbered buttons, no commands to memorise.',
        wait: 3800,
      },
    ],
  },

  stemmer: {
    title: 'Stemmer',
    steps: [
      {
        say: 'Remote session on Stemmer, split a mix into real tracks you can solo and export.',
        wait: 2800,
      },
      {
        target: '.stemmer-mode-bar',
        say: 'Engine is optional. Offline is free, light CPU, no key, no GPU. Cloud uses a Replicate key for Demucs if your PC is light.',
        action: 'point',
        wait: 4000,
      },
      {
        target: '.stemmer-btn.btn-neon-cyan',
        say: 'Load Mix opens your file picker. Drop a WAV or MP3 of a finished song.',
        action: 'point',
        wait: 3000,
      },
      {
        target: '.stemmer-drop',
        say: 'Or drop the file right on this zone. Offline never leaves your machine. Cloud only runs if you chose Cloud and set a key.',
        action: 'point',
        wait: 3600,
      },
      {
        target: '.stemmer-grid',
        say: 'After separation you get Vocals, Drums, Bass, Guitar, Keys, and Other. Mute, Solo, and export each as WAV.',
        action: 'point',
        wait: 3600,
      },
      {
        target: '.stemmer-btn-gold',
        say: 'Export All WAV dumps every stem for your DAW.',
        action: 'point',
        wait: 3000,
      },
      {
        say: 'That’s Stemmer, Offline by default, Cloud when you want pro Demucs quality.',
        wait: 3000,
      },
    ],
  },

  loopstation: {
    title: 'RC-Funk 5000',
    steps: [
      {
        say: 'Remote session on RC-Funk 5000. I’ll flip the master FX so you see real toggles fire.',
        wait: 2800,
      },
      {
        target: '[data-demo="rc-fx"] button',
        say: 'Turning Delay ON…',
        action: 'click',
        wait: 2200,
      },
      {
        target: '[data-demo="rc-play"]',
        say: 'Play All, if you have loops recorded they start; if empty you’ll see the status say so. Record Track 1 yourself first for a full stack demo.',
        action: 'click',
        wait: 3200,
      },
      {
        target: '[data-demo="rc-fx"]',
        say: 'Delay, Reverb, Dub FX live on the master bus. Toggle each and ride Amount while loops play.',
        action: 'point',
        wait: 3600,
      },
      {
        target: '[data-demo="rc-record"]',
        say: 'Record grabs the mic, I won’t force a rec without you, but this is the button: phrase, then Stop Rec, then loop.',
        action: 'point',
        wait: 3600,
      },
      {
        say: 'Stack up to four tracks, mute, volume, FX polish. That’s the looper.',
        wait: 3000,
      },
    ],
  },

  analyzer: {
    title: 'Ghost Rider',
    steps: [
      {
        say: 'Remote session: Ghost Rider. I’ll type an artist and hit Analyze so you see the real flow.',
        wait: 2800,
      },
      {
        target: '[data-demo="gr-artist"]',
        say: 'Typing an example artist name…',
        action: 'type',
        typeText: 'Kendrick Lamar',
        wait: 2000,
      },
      {
        target: '[data-demo="gr-analyze"]',
        say: 'Clicking Analyze, report + Style DNA will build if your OpenRouter key is set.',
        action: 'click',
        wait: 4000,
      },
      {
        target: '[data-demo="gr-write"]',
        say: 'Write Lyrics is next when you want a full verse in that pocket. Needs the same API key.',
        action: 'point',
        optional: true,
        whenMissing:
          'The next button is Write Lyrics, and it is not on screen yet, it only appears once an analysis has finished. Run Analyze on a real artist with your key set, and Write Lyrics shows up right underneath the report. It writes you a NEW verse in that artist’s pocket. It never copies their actual words.',
        wait: 3200,
      },
      {
        target: '[data-demo="gr-send"]',
        say: 'Send to Songwriter appears after you have lyrics, one click into the main desk.',
        action: 'point',
        optional: true,
        whenMissing:
          'After that comes Send to Songwriter, which is also not on screen yet, it appears once you actually have lyrics. One click and the verse lands on the Songwriter tab, split into sections you can edit line by line.',
        wait: 3200,
      },
      {
        say: 'Flow: name, then Analyze, then Style DNA, then Write, then Send. Done.',
        wait: 2800,
      },
    ],
  },

  songwriter: {
    title: 'Songwriter',
    steps: [
      {
        say: 'Songwriter is home base, the tab you will spend most of your time in. Everything the other tabs make ends up here so you can finish it by hand. I am going to walk the controls in the order you would actually use them.',
        wait: 3400,
      },
      {
        target: '[data-demo="sw-structure"]',
        say: 'Start here, the structure. This is the skeleton of the song: which parts come in what order, verse, chorus, verse, chorus, bridge. Pick a preset if you do not know what you want; the presets are just the shapes most songs already use.',
        action: 'point',
        then: 'Getting the shape down first is what stops you writing four great lines and then having nowhere to put them.',
        wait: 3800,
      },
      {
        target: '[data-demo="sw-generate"]',
        say: 'Generate Full Song writes the whole thing in one go, using the style, mood and topic you set above and the structure you just picked. It needs your free OpenRouter key from Settings, without a key this button will tell you so rather than doing nothing.',
        action: 'click',
        then: 'Whatever comes back is a starting point, not a final answer. It lands in the editor below, already split into the sections you chose.',
        wait: 3600,
      },
      {
        target: '[data-demo="sw-lines"]',
        say: 'This is where the real work happens, the line editor. One row per line of the song, and you can retype any of them. Nothing is locked. Whether a line came from the AI, from Ghost Rider, or out of your own head, you edit it here the same way.',
        action: 'point',
        wait: 3800,
      },
      {
        say: 'So the loop is: set the shape, generate a draft or write it cold, then fix it line by line until it sounds like you. Ghost Rider and Quantum Lab both send their work straight into this same editor.',
        wait: 3400,
      },
    ],
  },

  songforge: {
    title: 'Song Forge',
    steps: [
      {
        say: 'Song Forge makes a whole song AND its cover art in one shot. It is the fastest way from nothing to something you can look at and listen to. One key runs both halves.',
        wait: 3200,
      },
      {
        target: '[data-demo="sf-mode"]',
        say: 'First choose which comes first. Song First writes the lyrics and then paints a cover that matches what it wrote. Art First flips it, you make or upload a picture, and the song gets written from that image. Same tools, different starting point.',
        action: 'point',
        then: 'If you have no idea what you want yet, Art First is often easier: it is simpler to react to a picture than to a blank page.',
        wait: 3600,
      },
      {
        target: '[data-demo="sf-forge"]',
        say: 'This is Forge. It runs two AI calls back to back, one writes the song, the second paints the cover, so it takes noticeably longer than a normal generate. The button shows you which half it is on while it works. It needs your OpenRouter key from Settings.',
        action: 'point',
        then: 'Turn Auto-save on underneath and every finished song and cover pair is written to your Documents folder automatically, so nothing gets lost.',
        wait: 3800,
      },
      {
        target: '[data-demo="sf-send"]',
        say: 'After a result, Send to Songwriter lands sections on the main desk.',
        action: 'point',
        optional: true,
        whenMissing:
          'Once Forge finishes, a Send to Songwriter button appears next to the finished lyrics. It is not on screen yet because nothing has been forged in this demo. Clicking it drops the song onto the Songwriter tab, already broken into verses and choruses.',
        wait: 3200,
      },
      {
        say: 'Quantum Lab can seed Forge notes before you hit Forge.',
        wait: 2800,
      },
    ],
  },

  booth: {
    title: 'Recording Booth',
    steps: [
      {
        say: 'This is the Recording Booth. It records straight into Lyricist, harmonica, guitar, singing, humming, anything, so you can catch an idea the second you have it instead of hunting for your phone. I am going to point at each control rather than press it, because pressing Record would switch your microphone on.',
        wait: 3600,
      },
      {
        target: '[data-demo="booth-record"]',
        say: 'This is Start Recording. One press and it begins capturing from your microphone, with a live meter above it so you can see your level moving. Audio clean-up like echo cancellation is deliberately switched OFF here, so an instrument keeps its real tone instead of being processed like a phone call.',
        action: 'point',
        then: 'While it is running this same button becomes Stop and Save, with a timer on it. Press that and the take is saved automatically, you do not have to name it first.',
        wait: 3800,
      },
      {
        target: '[data-demo="booth-library"]',
        say: 'Everything you record lands here in your library and stays on your computer. Each take has a play button, so you can listen back to a riff on a loop while you write words for it on another tab, the player keeps going when you switch tabs.',
        action: 'point',
        then: 'You can rename a take, delete it, or export it. Nothing here is uploaded anywhere.',
        wait: 3800,
      },
      {
        say: 'From here a take can go two ways: Export WAV writes a real audio file to your Documents folder for a DAW, or you can send it to MIDI Studio to turn what you played into editable notes. So the whole path is: press Record, play the idea, press Stop, and it is saved.',
        wait: 3600,
      },
    ],
  },

  midistudio: {
    title: 'MIDI Studio',
    steps: [
      {
        say: 'MIDI Studio turns audio into notes you can edit. MIDI just means the notes themselves rather than a recording of them, once something is MIDI you can move a wrong note instead of replaying the whole part. All of this runs offline on your machine.',
        wait: 3800,
      },
      {
        target: '[data-demo="midi-convert"]',
        say: 'This is the converter. Give it audio, a hummed voice memo, a guitar riff, a take from the Recording Booth, and it works out which notes were played and builds them into the sequencer. Humming a melody you cannot play is a completely legitimate way to use this.',
        action: 'point',
        then: 'When it finishes you get a green line telling you what it converted and how many notes it found.',
        wait: 4000,
      },
      {
        target: '[data-demo="midi-roll"]',
        say: 'This is the piano roll and effects rack. Every note is a block you can drag to move it, stretch to make it longer, or delete. The rack underneath shapes the sound it plays back with, filter, drive, delay, reverb, and Reset puts every knob back to flat if you get lost.',
        action: 'point',
        wait: 4000,
      },
      {
        target: '[data-demo="midi-viz"]',
        say: 'And this is the visualiser, the moving artwork that reacts to your music. Shuffle jumps to a different preset, and there are hundreds of them. Watch, I will press it.',
        action: 'click',
        then: 'That is purely for enjoying what you made. It has no effect on the audio.',
        wait: 3400,
      },
      {
        say: 'So the loop is: bring in audio, convert it to notes, fix the notes by hand, play it back, and watch it move. Nothing here needs the internet or an API key.',
        wait: 3400,
      },
    ],
  },

  mastering: {
    title: 'Mastering Studio',
    steps: [
      {
        say: 'Mastering Studio is the finish line. Mastering means putting every track through the same final polish so they all sit at the same loudness and tone, that is what stops track four sounding thin and quiet next to track five. All of it runs offline on your machine.',
        wait: 3800,
      },
      {
        target: '[data-demo="master-chain"]',
        say: 'This is the chain, and it runs on every track. In order: a three-band EQ for bass, mids and treble; a compressor to glue it together; a limiter to stop it clipping; and loudness normalisation capped just under maximum so nothing distorts. Start with a preset, you do not have to understand any of these to use it.',
        action: 'point',
        then: 'Change anything here and every track is automatically re-mastered with the new settings. You do not have to redo them one by one.',
        wait: 4200,
      },
      {
        target: '[data-demo="master-export"]',
        say: 'Export Album writes the finished record out: every track as a numbered mastered WAV, the cover art as a PNG, and a tracklist text file, all into a folder in your Documents. This button stays greyed out until every track has actually been mastered, so you cannot ship a half-finished record by accident.',
        action: 'point',
        wait: 4000,
      },
      {
        // "Songwriter to here" measured 12% word error — the narrator voice
        // splits a sentence-initial "Songwriter" into "some writer". Keeping the
        // word mid-sentence fixes it. See project-ghost-voice: judge a line by
        // what the recogniser hears, not by how it reads on the page.
        say: 'That folder is a real release package, the files you would hand to a distributor, upload, or burn. That is the whole trip, from the Songwriter tab to a finished record.',
        wait: 3200,
      },
    ],
  },

  screw: {
    title: 'Chopped & Screwed',
    steps: [
      {
        say: 'Remote session on Chopped and Screwed. This is the sound DJ Screw invented in Houston, and it is two separate ideas that people say as one word.',
        wait: 4200,
      },
      {
        target: '.screw-drop',
        say: 'Drop any audio file here to start. It never leaves your machine, all of this runs on your own computer.',
        action: 'point',
        wait: 3800,
      },
      {
        target: '.screw-field',
        say: 'Or pull one of your own recordings straight out of the app. A song you just made in One Man Band lands in this list.',
        action: 'point',
        optional: true,
        whenMissing:
          'There is also a picker for your own recordings, and it is not on screen because you have not made any yet. As soon as you keep a take from One Man Band or the Recording Booth, it turns up right here and you can screw your own song without leaving the app.',
        wait: 3800,
      },
      {
        target: '.screw-cols .screw-card:nth-of-type(2)',
        say: 'Screwed is the speed. The whole track slows down and the pitch sinks with it, because nothing corrects it. That sinking voice is the entire point.',
        action: 'point',
        wait: 4600,
      },
      {
        target: '.screw-pre',
        say: 'Presets run from barely touched all the way down to sunk. Start in the middle and take it down until it feels right.',
        action: 'point',
        wait: 3800,
      },
      {
        target: '.screw-cols .screw-card:nth-of-type(3)',
        say: 'Chopped is the edit, and it is a different thing. A chop lays the same slice down two or three times while the song only moves forward once. That stutter is what makes it a chop and not a fast cut.',
        action: 'point',
        wait: 5200,
      },
      {
        target: '.screw-slicerwrap',
        say: 'The slicer draws the waveform with the beat grid over it. Click any slice to force a chop where the pattern did not put one, or to take one out where it did. Your edits win.',
        action: 'point',
        optional: true,
        whenMissing:
          'The slicer is not on screen yet because nothing is loaded. Once you pick a song it draws the whole waveform with the beat grid over the top of it, and every slice is clickable. Click one to force a chop where the pattern did not put one, or to take one out where it did. Your edits always win over the pattern.',
        wait: 4800,
      },
      {
        target: '.screw-make',
        say: 'Then render it. I am leaving that to you. It saves straight back to your Recordings when it is done.',
        action: 'point',
        skipClick: true,
        wait: 4000,
      },
      {
        say: 'That is Chopped and Screwed. Slow it down, chop it up, and the sub follows the track instead of droning underneath it.',
        wait: 3800,
      },
    ],
  },

  settings: {
    title: 'Settings',
    steps: [
      {
        say: 'Settings remote pass, keys unlock the studio.',
        wait: 2600,
      },
      {
        target: '[data-demo="settings-key"]',
        say: 'OpenRouter key field, paste once. That single key runs writing AND Song Forge / Nano Banana cover art via OpenRouter. No Google AI Studio key.',
        action: 'click',
        wait: 3800,
      },
      {
        say: 'Save once. Free models exist; paid go further, including image models on OpenRouter when you need covers.',
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
