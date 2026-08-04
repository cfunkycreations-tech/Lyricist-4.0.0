// ============================================================
// Ghost Demo scripts — HARD tabs only.
// action: 'type' | 'click' | 'point' | 'say'
// Default for button targets is REAL click (operates the app).
// skipClick: true for mic/API-heavy controls we only show.
// ============================================================

export const GHOST_DEMO_TABS = new Set([
  'songwriter',
  'analyzer',
  'songforge',
  'quantum',
  'loopstation',
  'stemmer',
  'booth',
  'midistudio',
  'album',
  'mastering',
  'settings',
]);

/** @type {Record<string, { title: string, steps: object[] }>} */
export const GHOST_DEMOS = {
  quantum: {
    title: 'Quantum Lab',
    steps: [
      {
        say: 'Remote session starting on Quantum Lab. I will operate the lattice for real — type, load, run, crystallize.',
        wait: 2800,
      },
      {
        target: '[data-demo="ql-keywords"]',
        say: 'Clicking the keyword box and typing your seeds…',
        action: 'type',
        typeText: 'neon rain, midnight, heartbreak, empty highway, static, fever',
        wait: 2200,
      },
      {
        target: '[data-demo="ql-load"]',
        say: 'Loading those words into the lattice — watch the grid fill. Your words stay yours.',
        action: 'click',
        wait: 3200,
      },
      {
        target: '[data-demo="ql-spotlight"]',
        say: 'Turning Spotlight ON — it should go orange.',
        action: 'click',
        wait: 2200,
      },
      {
        target: '.ql-tile',
        say: 'Clicking a lattice tile to pour heat into it…',
        action: 'click',
        wait: 2500,
      },
      {
        target: '[data-demo="ql-spotlight"]',
        say: 'Spotlight off — back to select mode.',
        action: 'click',
        wait: 1800,
      },
      {
        target: '[data-demo="ql-run"]',
        say: 'Running 12 generations — energy spreads across the grid.',
        action: 'click',
        wait: 2800,
      },
      {
        target: '[data-demo="ql-crystallize"]',
        say: 'Crystallize — locking the field without stealing your keywords.',
        action: 'click',
        wait: 2800,
      },
      {
        target: '[data-demo="ql-generate"]',
        say: 'Generate Neural Lyrics needs your OpenRouter key. I’ll click it if you have one — otherwise set the key in Settings and replay this demo.',
        action: 'click',
        wait: 3500,
      },
      {
        say: 'That’s the live Quantum path: type → load → spotlight → run → crystallize → generate. Send A/B to Songwriter when you’re happy.',
        wait: 3600,
      },
    ],
  },

  stemmer: {
    title: 'Stemmer',
    steps: [
      {
        say: 'Remote session on Stemmer — split a mix into real tracks you can solo and export.',
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
        say: 'That’s Stemmer — Offline by default, Cloud when you want pro Demucs quality.',
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
        say: 'Play All — if you have loops recorded they start; if empty you’ll see the status say so. Record Track 1 yourself first for a full stack demo.',
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
        say: 'Record grabs the mic — I won’t force a rec without you, but this is the button: phrase → Stop Rec → loop.',
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
        say: 'Clicking Analyze — report + Style DNA will build if your OpenRouter key is set.',
        action: 'click',
        wait: 4000,
      },
      {
        target: '[data-demo="gr-write"]',
        say: 'Write Lyrics is next when you want a full verse in that pocket. Needs the same API key.',
        action: 'point',
        wait: 3200,
      },
      {
        target: '[data-demo="gr-send"]',
        say: 'Send to Songwriter appears after you have lyrics — one click into the main desk.',
        action: 'point',
        wait: 3200,
      },
      {
        say: 'Flow: name → Analyze → Style DNA → Write → Send. Done.',
        wait: 2800,
      },
    ],
  },

  songwriter: {
    title: 'Songwriter',
    steps: [
      {
        say: 'Songwriter is home base. Watching the cursor work the generate control…',
        wait: 2600,
      },
      {
        target: '[data-demo="sw-generate"]',
        say: 'Generate Full Song — needs topic/style set and OpenRouter key. Clicking it runs the real generator if the key is ready.',
        action: 'click',
        wait: 3600,
      },
      {
        target: '[data-demo="sw-structure"]',
        say: 'Structure map — verses and choruses live here.',
        action: 'point',
        wait: 3000,
      },
      {
        target: '[data-demo="sw-lines"]',
        say: 'Line editor — polish every bar by hand after generate or handoff.',
        action: 'point',
        wait: 3200,
      },
      {
        say: 'That’s Songwriter. Ghost Rider and Quantum both dump work here.',
        wait: 2800,
      },
    ],
  },

  songforge: {
    title: 'Song Forge',
    steps: [
      {
        say: 'Song Forge remote pass — mode switch and forge path.',
        wait: 2600,
      },
      {
        target: '[data-demo="sf-mode"]',
        say: 'Song First vs Art First — clicking the mode area.',
        action: 'click',
        wait: 2800,
      },
      {
        target: '[data-demo="sf-forge"]',
        say: 'Forge runs on your OpenRouter key (same as the rest of the app). Clicking if the control is present…',
        action: 'click',
        wait: 3600,
      },
      {
        target: '[data-demo="sf-send"]',
        say: 'After a result, Send to Songwriter lands sections on the main desk.',
        action: 'point',
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
        say: 'Booth remote tour — I point at record/library so you see the path without auto-starting the mic.',
        wait: 2800,
      },
      {
        target: '[data-demo="booth-record"]',
        say: 'Record starts a take. I won’t force the mic — click this yourself when ready.',
        action: 'point',
        wait: 3400,
      },
      {
        target: '[data-demo="booth-library"]',
        say: 'Library holds takes. Play while writing elsewhere.',
        action: 'point',
        wait: 3200,
      },
      {
        say: 'Export WAV or send to MIDI Studio next.',
        wait: 2800,
      },
    ],
  },

  midistudio: {
    title: 'MIDI Studio',
    steps: [
      {
        say: 'MIDI Studio remote tour — convert, piano roll, visualizer pack.',
        wait: 2800,
      },
      {
        target: '[data-demo="midi-convert"]',
        say: 'Convert audio to MIDI here (upload / process).',
        action: 'point',
        wait: 3400,
      },
      {
        target: '[data-demo="midi-roll"]',
        say: 'Piano roll — edit notes, multi-voice synth plays back.',
        action: 'point',
        wait: 3400,
      },
      {
        target: '[data-demo="midi-viz"]',
        say: 'Visualizer — I’ll click Shuffle if present so a preset actually changes.',
        action: 'click',
        wait: 3200,
      },
      {
        say: 'Convert → edit → play → pick a viz. That’s the loop.',
        wait: 2800,
      },
    ],
  },

  album: {
    title: 'Album Architect',
    steps: [
      {
        say: 'Album Architect — track list and meta before mastering.',
        wait: 2600,
      },
      {
        target: '[data-demo="album-tracks"]',
        say: 'Tracks list — add, drag, reorder up to twelve.',
        action: 'point',
        wait: 3400,
      },
      {
        target: '[data-demo="album-meta"]',
        say: 'Album meta — title, artist, genre, tempo.',
        action: 'point',
        wait: 3200,
      },
      {
        say: 'When the sequence feels right, Mastering is next.',
        wait: 2600,
      },
    ],
  },

  mastering: {
    title: 'Mastering Studio',
    steps: [
      {
        say: 'Mastering finish line — chain and export.',
        wait: 2600,
      },
      {
        target: '[data-demo="master-chain"]',
        say: 'EQ / compression / limiter chain — presets or manual.',
        action: 'point',
        wait: 3400,
      },
      {
        target: '[data-demo="master-export"]',
        say: 'Export mastered WAVs + cover + tracklist.',
        action: 'point',
        wait: 3400,
      },
      {
        say: 'That’s a release package.',
        wait: 2400,
      },
    ],
  },

  settings: {
    title: 'Settings',
    steps: [
      {
        say: 'Settings remote pass — keys unlock the studio.',
        wait: 2600,
      },
      {
        target: '[data-demo="settings-key"]',
        say: 'OpenRouter key field — paste once. That single key runs writing AND Song Forge / Nano Banana cover art via OpenRouter. No Google AI Studio key.',
        action: 'click',
        wait: 3800,
      },
      {
        say: 'Save once. Free models exist; paid go further — including image models on OpenRouter when you need covers.',
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
