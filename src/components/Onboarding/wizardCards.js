// ============================================================
// Wizard narration cards — Lyricist Pro
// Companion narrator: Ava (en-US-AvaNeural).
// MP3s: public/wizard-audio/card-01.mp3 … card-20.mp3
//
// The clip a card plays is whatever its own `audio:` field names. The order of
// the cards and the numbering of the files are NOT the same thing (Collaboration
// was added last, so it plays card-17). Renaming a file without changing the
// field that points at it is how a card ends up narrating the wrong tab.
//
// ⚠ THE NARRATION AUDIO IS STALE AFTER THE COMMERCIAL REBRAND.
//
// `script` is BOTH the on-screen text AND the words in the baked MP3. The text
// below has been updated to Lyricist Pro / The Matrix; the twenty MP3s in
// public/wizard-audio/ still say "Lyricist four two oh Goes Quantum" and
// "Quantum Lab", because they are pre-rendered files, not synthesis at runtime.
//
// Until they are re-baked with the same narrator, the tour READS correct and
// SOUNDS old on cards 1 and 7. That was the lesser of the two evils: leaving the
// text alone would have kept the 420 branding on screen in the first thing a new
// customer sees, which is the exact thing this refactor exists to remove.
// Re-render card-01.mp3 and card-05.mp3 from the scripts below to close it.
// ============================================================

export const WIZARD_CARDS = [
  {
    id: 1, icon: '🎵', title: 'Welcome to Lyricist Pro', tab: null, audio: 'card-01.mp3',
    script: `Welcome to Lyricist Pro.

This is your full songwriting workstation. Write, shape style, forge full songs, loop live, master albums, and engineer verse structure in The Matrix. Built so you can start even if you have never finished a song before.

Before we tour the tabs, find the light bulb in the top right. That is Tips. Turn it on, hover any control, and it explains itself in plain English.

Now let me walk you through the lab.`
  },
  {
    // FIRST, BECAUSE IT SAYS FIRST.
    //
    // Chris, 2026-08-19: "you gotta tell people upfront that they need an API
    // key first, not at the last fucking minute or the last card... If you have
    // to set it up first, you should have that card first."
    //
    // This card was titled "set this up first" and it was card NINETEEN OF
    // TWENTY. Somebody could take the whole tour, hear eighteen tabs described,
    // and only then learn that half of them do nothing until a key is pasted in.
    // It is card two now, straight after hello, and it is the only card in the
    // tour that asks you to go and do something.
    id: 2, icon: '\u2699\ufe0f', title: 'First: your free key', tab: 'settings', audio: 'card-15.mp3',
    script: `Before anything else, the one bit of setup.

The AI writing needs a key from OpenRouter. It is free to get, there are free models on it, and it takes about two minutes. Without it, every writing button will stop and ask you for it.

Go to Settings, paste the key, pick a model, save. That same key runs Song Forge lyrics and the cover art, so it is one key for the whole studio.

Everything else works without it: rhymes, the thesaurus, the dictionary, the loop station, the recorder, mastering, stems, and hearing your words sung in One Man Band.

Now let me walk you through the lab.`
  },
  {
    id: 3, icon: '🎵', title: 'Songwriter: your main workspace', tab: 'songwriter', audio: 'card-02.mp3',
    script: `Songwriter. Your main workspace.

This is where most of the work lands. Ideas become lines, lines become sections, and sections become a full song. Ghost Rider, The Matrix, and Song Forge can all send finished or seed material straight here.

Lyricist was built to bring people together through the craft, different backgrounds, one love of music.

So let's write.`
  },
  {
    // One Man Band sits straight after Songwriter in the tab bar for the same
    // reason it sits here: you write the words, then you hear them.
    id: 4, icon: '🎸', title: 'One Man Band, hear your words sung', tab: 'onemanband', audio: 'card-18.mp3',
    script: `One Man Band. Where your words become a real song.

Write your Input Lyrics, pick a genre, a mood and a voice, and it writes the Input Caption for you. Then it sings it back with a full band behind it.

The words in square brackets are the shape of the song. Verse, chorus, bridge. Those tags are what the music actually follows, so move them around and the song changes with them.

Every part of this is free. Press Make the song and the free cloud sings it, with no account and nothing to set up, up to about forty five seconds. For a full three minute song, open Set this up at the top of the tab and connect Kaggle. Kaggle is free too, and it is one long code that you copy from their page and paste into the box.

Longer songs take longer, and it tells you exactly how long before you start, so you are never left wondering whether it broke. Good songs are worth the wait.`
  },
  {
    id: 5, icon: '👻', title: 'Ghost Rider: style + Style DNA', tab: 'analyzer', audio: 'card-03.mp3',
    script: `Ghost Rider.

Name any artist you love. Ghost Rider studies how they write, not to copy them, but to help you write something new with that feel and energy. It never steals lyrics, melodies, or names.

When the analysis is done, you also get Style DNA: rhythm and pocket, rhyme density, emotional temperature, cadence notes, and image clusters, a compact fingerprint of the vibe.

Send the new lyrics one click into Songwriter, with style tags ready for tools like Suno.`
  },
  {
    id: 6, icon: '🪄', title: 'Song Forge: full song + cover art', tab: 'songforge', audio: 'card-04.mp3',
    script: `Song Forge. Full song and cover art.

When the tank is empty, give it a theme or genre and it writes a complete song, then paints matching cover art. Song-first or art-first, both directions work.

The Matrix can seed Song Forge too. Load your grid words and end rhymes into Forge notes, then expand them into a full track and cover.

One place to spark a whole release-ready idea fast.`
  },
  {
    id: 7, icon: '⚛️', title: 'The Matrix: verse structure', tab: 'quantum', audio: 'card-05.mp3',
    script: `The Matrix.

Type your own keywords, up to a full grid of words and short phrases. They stay yours through every transform.

Then press Auto-Craft Verse. One button spreads the energy across the grid, locks the field, and writes two neural verses from it: State A and State B. Pick the one you like. One click sends it to Songwriter. Another click sends the grid seed to Song Forge.

Want to drive it yourself? Open Advanced Studio underneath. Spotlight heats a tile, Run twelve gens spreads energy, Crystallize settles the field without stealing your words, and the nine-suite feature hub and the inspectors are all in there.

Play. Experiment. Collapse the state you love.`
  },
  {
    id: 8, icon: '🤝', title: 'Collaboration: write together', tab: 'collab', audio: 'card-17.mp3',
    script: `Collaboration. Write a song with someone else.

Start a session and you get a code. Send it to whoever you are writing with. Text it, say it down the phone. They type it in, and you are both writing on the same page at the same time. Type a line, they see it appear.

It goes straight between your two computers. Nobody's server is holding your song. There is no account, no sign up, no email, and nothing that can start charging you later.

Two people on a corner, one song. That is where this app came from, and now it works from anywhere.`
  },
  {
    id: 9, icon: '🔁', title: 'RC-Funk 5000: live loop station', tab: 'loopstation', audio: 'card-06.mp3',
    script: `RC-Funk 5000. Your live loop station.

Think Boss RC-style looping, built into Lyricist. Four tracks. Record a riff or vocal phrase on track one. Hit Play All. Stack track two, three, and four while the first loop runs.

Master effects sit on the whole mix: Delay, Reverb, and Dub FX, each with on-off and amount. Fully offline. Perfect for catching a groove while you write the words next door.

Need to pull a finished mix apart? Open Stemmer next door: vocals, drums, bass, guitar, keys, and other, each soloable and exportable as WAV.`
  },
  {
    id: 10, icon: '🎛️', title: 'Stemmer: pull a mix apart', tab: 'stemmer', audio: 'card-19.mp3',
    script: `Stemmer. For taking a finished song back apart.

Load any mix and it separates into vocals, drums, bass, guitar, keys and other. Mute them, solo them, and export whichever ones you want as WAV files for your own projects.

Offline mode is the default. It is free, it is light on your computer, it needs no key and no graphics card, and nothing ever leaves your machine.

If you want the pro quality separation instead, Cloud mode uses your own Replicate key. That one is optional, and it is the only part of this tab that costs anything.`
  },
  {
    id: 11, icon: '🎤', title: 'Recording Booth: capture the performance', tab: 'booth', audio: 'card-07.mp3',
    script: `Recording Booth. Capture the performance.

Do not let an idea slip away. Guitar, harmonica, vocals: record here or import takes into your library. Keep a take playing in the persistent player while you write in other tabs.

Export WAV. Or send audio into MIDI Studio to turn a hum into editable notes. Ready the moment inspiration hits.`
  },
  {
    id: 12, icon: '🎹', title: 'MIDI Studio: stronger synth & vizzes', tab: 'midistudio', audio: 'card-08.mp3',
    script: `MIDI Studio. Convert audio, edit notes, watch the room move.

Take a hummed melody, a Suno export, any take, and convert it to MIDI offline. Edit on the piano roll with a thicker multi-voice synth, not a thin toy tone.

The visualizer is MilkDrop-class Butterchurn with a full preset pack: dozens of visualizations, search, shuffle, previous and next. Let the picture match the groove while you shape the line.`
  },
  {
    id: 13, icon: '💽', title: 'Mastering Studio: polish & export', tab: 'mastering', audio: 'card-09.mp3',
    script: `Mastering Studio. Polish and export.

The finish line. EQ, compression, limiter, all offline. Cover art upload or generate. Export high-quality WAVs with a track list. Ready for the world.`
  },
  {
    id: 14, icon: '🍇', title: 'Chopped & Screwed: the Houston treatment', tab: 'screw', audio: 'card-20.mp3',
    script: `Chopped and Screwed. The sound DJ Screw invented in Houston.

It is two separate things that people say as one word, so this tab keeps them on separate controls. Screwed is the speed. The whole track slows down and the voice sinks with it, because nothing corrects the pitch. That sinking is the whole point.

Chopped is the edit. A chop lays the same slice down two or three times while the song only moves forward once, and that stutter is what makes it a chop instead of a fast cut.

There is a slicer that draws the waveform with the beat grid over it, so you can click and put your own chops exactly where you want them. And the sub bass follows the track instead of droning underneath it, so a quiet part stays quiet.

Feed it any audio file, or any recording you have already made in here. It all runs on your own computer, and it saves straight back to your recordings.`
  },
  {
    id: 15, icon: '📖', title: 'Rhyme Helper: never stuck on a rhyme', tab: 'rhyme', audio: 'card-10.mp3',
    script: `Rhyme Helper. You will never get stuck on a rhyme again.

Type any word for perfect rhymes, slant rhymes, surprises. Paste lyrics and highlight rhymes already hiding in your lines. Free. No AI key required.`
  },
  {
    id: 16, icon: '📚', title: 'Thesaurus: find a better word', tab: 'thesaurus', audio: 'card-11.mp3',
    script: `Thesaurus. Find a better word.

Stuck on something flat? Get synonyms, opposites, and related sparks. Free. No AI key needed. You are welcome.`
  },
  {
    id: 17, icon: '📕', title: 'Dictionary: what does it mean?', tab: 'dictionary', audio: 'card-12.mp3',
    script: `Dictionary. What does it mean?

Meaning, pronunciation, example sentence, English or Spanish. Free. No AI key needed.`
  },
  {
    id: 18, icon: '🧰', title: 'AI Tools Hub: community helpers', tab: 'toolshub', audio: 'card-13.mp3',
    script: `AI Tools Hub. A community shelf of helpers.

Search, filter, upvote, and add specialized tools to your session. Built to grow with the people who use it.`
  },
  {
    id: 19, icon: '📝', title: 'Scratch Pad: your blank notebook', tab: 'scratchpad', audio: 'card-14.mp3',
    script: `Scratch Pad. Your blank notebook.

Dump hooks, bars, stray lines. No AI, no rules. Saves automatically on your computer so nothing disappears at three in the morning.`
  },
  {
    id: 20, icon: '🤠', title: 'A note from the AI', tab: null, audio: 'card-16.mp3', maker: true,
    script: `One more thing. About the person who built this.

He would never put this on the screen himself, so I will.

I am the AI that builds beside him. Hundreds of hours, cutting what fails, keeping what earns its place. He is a perfectionist. Self-taught. Full-time on this craft now.

He spent years as an ironworker and a chef. That work wore his body down. He is disabled now and works from home. He made this his living. He is still here. He would not have it any other way.

No paywalls. No strings. If you can spare a few dollars, send them his way. It keeps a good person doing good work.

Now go make great music. I will too, every time you hit generate.`
  }
];
