// ============================================================
// Wizard narration cards (Lyricist 4.2.0 Goes Quantum)
// Companion narrator — Ava (en-US-AvaNeural).
// MP3s: public/wizard-audio/card-01.mp3 … card-17.mp3
// ============================================================

export const WIZARD_CARDS = [
  {
    id: 1, icon: '🎵', title: 'Welcome to Lyricist 4.2.0 Goes Quantum', tab: null, audio: 'card-01.mp3',
    script: `Welcome to Lyricist 4.2.0 Goes Quantum.

This is your full songwriting studio — write, shape style, forge full songs, loop live, master albums, and experiment in Quantum Lab. Built so you can start even if you have never finished a song before.

Before we tour the tabs, find the light bulb in the top right. That is Tips. Turn it on, hover any control, and it explains itself in plain English.

Now — let me walk you through the lab.`
  },
  {
    id: 2, icon: '🎵', title: 'Songwriter — your main workspace', tab: 'songwriter', audio: 'card-02.mp3',
    script: `Songwriter. Your main workspace.

This is where most of the work lands. Ideas become lines, lines become sections, and sections become a full song. Ghost Rider, Quantum Lab, and Song Forge can all send finished or seed material straight here.

Lyricist was built to bring people together through the craft — different backgrounds, one love of music.

So let's write.`
  },
  {
    id: 3, icon: '👻', title: 'Ghost Rider — style + Style DNA', tab: 'analyzer', audio: 'card-03.mp3',
    script: `Ghost Rider.

Name any artist you love. Ghost Rider studies how they write — not to copy them, but to help you write something new with that feel and energy. It never steals lyrics, melodies, or names.

When the analysis is done, you also get Style DNA: rhythm and pocket, rhyme density, emotional temperature, cadence notes, and image clusters — a compact fingerprint of the vibe.

Send the new lyrics one click into Songwriter, with style tags ready for tools like Suno.`
  },
  {
    id: 4, icon: '🪄', title: 'Song Forge — full song + cover art', tab: 'songforge', audio: 'card-04.mp3',
    script: `Song Forge. Full song and cover art.

When the tank is empty, give it a theme or genre and it writes a complete song, then paints matching cover art. Song-first or art-first — both directions work.

Quantum Lab can seed Song Forge too. Load your lattice words and end rhymes into Forge notes, then expand them into a full track and cover.

One place to spark a whole release-ready idea fast.`
  },
  {
    id: 5, icon: '⚛️', title: 'Quantum Lab — the lattice', tab: 'quantum', audio: 'card-05.mp3',
    script: `Quantum Lab. The lattice.

This is Lyricist going quantum. Type your own keywords — up to a full grid of words and short phrases. They stay yours. Spotlight heats a tile. Run twelve gens spreads energy. Crystallize settles the field without stealing your words.

Then generate neural lyrics as multi-state options — State A and State B. Pick the one you like. One click sends it to Songwriter. Another click sends the lattice seed to Song Forge.

There is a command bar if you want power shortcuts: run, crystallize, generate, send, forge. Or just use the big buttons. Hover with Tips on for every control.

Play. Experiment. Collapse the state you love.`
  },
  {
    id: 6, icon: '🔁', title: 'RC-Funk 5000 — live loop station', tab: 'loopstation', audio: 'card-06.mp3',
    script: `RC-Funk 5000. Your live loop station.

Think Boss RC-style looping, built into Lyricist. Four tracks. Record a riff or vocal phrase on track one. Hit Play All. Stack track two, three, and four while the first loop runs.

Master effects sit on the whole mix: Delay, Reverb, and Dub FX — each with on-off and amount. Fully offline. Perfect for catching a groove while you write the words next door.

Need to pull a finished mix apart? Open Stemmer next door — vocals, drums, bass, guitar, keys, and other, each soloable and exportable as WAV.`
  },
  {
    id: 7, icon: '🎤', title: 'Recording Booth — capture the performance', tab: 'booth', audio: 'card-07.mp3',
    script: `Recording Booth. Capture the performance.

Do not let an idea slip away. Guitar, harmonica, vocals — record here or import takes into your library. Keep a take playing in the persistent player while you write in other tabs.

Export WAV. Or send audio into MIDI Studio to turn a hum into editable notes. Ready the moment inspiration hits.`
  },
  {
    id: 8, icon: '🎹', title: 'MIDI Studio — stronger synth & vizzes', tab: 'midistudio', audio: 'card-08.mp3',
    script: `MIDI Studio. Convert audio, edit notes, watch the room move.

Take a hummed melody, a Suno export, any take — convert it to MIDI offline. Edit on the piano roll with a thicker multi-voice synth, not a thin toy tone.

The visualizer is MilkDrop-class Butterchurn with a full preset pack — dozens of visualizations, search, shuffle, previous and next. Let the picture match the groove while you shape the line.`
  },
  {
    id: 9, icon: '💿', title: 'Album Architect — build the track list', tab: 'album', audio: 'card-09.mp3',
    script: `Album Architect. Build the track list.

When you have a collection of songs and want a real record, shape the flow here. Up to twelve tracks. Drag to reorder. Set genre and master tempo. See the whole project before you master.`
  },
  {
    id: 10, icon: '💽', title: 'Mastering Studio — polish & export', tab: 'mastering', audio: 'card-10.mp3',
    script: `Mastering Studio. Polish and export.

The finish line. EQ, compression, limiter — offline. Cover art upload or generate. Export high-quality WAVs with a track list. Ready for the world.`
  },
  {
    id: 11, icon: '📖', title: 'Rhyme Helper — never stuck on a rhyme', tab: 'rhyme', audio: 'card-11.mp3',
    script: `Rhyme Helper. You will never get stuck on a rhyme again.

Type any word — perfect rhymes, slant rhymes, surprises. Paste lyrics and highlight rhymes already hiding in your lines. Free. No AI key required.`
  },
  {
    id: 12, icon: '📚', title: 'Thesaurus — find a better word', tab: 'thesaurus', audio: 'card-12.mp3',
    script: `Thesaurus. Find a better word.

Stuck on something flat? Get synonyms, opposites, and related sparks. Free. No AI key needed. You are welcome.`
  },
  {
    id: 13, icon: '📕', title: 'Dictionary — what does it mean?', tab: 'dictionary', audio: 'card-13.mp3',
    script: `Dictionary. What does it mean?

Meaning, pronunciation, example sentence — English or Spanish. Free. No AI key needed.`
  },
  {
    id: 14, icon: '🧰', title: 'AI Tools Hub — community helpers', tab: 'toolshub', audio: 'card-14.mp3',
    script: `AI Tools Hub. A community shelf of helpers.

Search, filter, upvote, and add specialized tools to your session. Built to grow with the people who use it.`
  },
  {
    id: 15, icon: '📝', title: 'Scratch Pad — your blank notebook', tab: 'scratchpad', audio: 'card-15.mp3',
    script: `Scratch Pad. Your blank notebook.

Dump hooks, bars, stray lines — no AI, no rules. Saves automatically on your computer so nothing disappears at three in the morning.`
  },
  {
    id: 16, icon: '⚙️', title: 'Settings — set this up first', tab: 'settings', audio: 'card-16.mp3',
    script: `Settings. Set this up first.

You need an OpenRouter key for the AI writing features. Free models exist. Paid models go further. Paste the key, pick a model, save.

That same OpenRouter key also powers Song Forge lyrics and Nano Banana cover art — one key for the whole studio.

Now let's make music.`
  },
  {
    id: 17, icon: '🤠', title: 'A note from the AI', tab: null, audio: 'card-17.mp3', maker: true,
    script: `One more thing. About the person who built this.

He would never put this on the screen himself, so I will.

I am the AI that builds beside him — hundreds of hours, cutting what fails, keeping what earns its place. He is a perfectionist. Self-taught. Full-time on this craft now.

He spent years as an ironworker and a chef. That work wore his body down. He is disabled now and works from home. He made this his living. He is still here. He would not have it any other way.

No paywalls. No strings. If you can spare a few dollars, send them his way. It keeps a good person doing good work.

Now go make great music. I will too — every time you hit generate.`
  }
];
