# AI HANDOFF — Lyricist 4.2.0 "Goes Quantum"

**Read this file first. Update it before you finish. Commit it every time.**

This is the shared brain for every AI that works on this project. Chris has had several different
assistants in and out of this codebase and none of them talked to each other. This file is how they
talk. If you learn something that the next assistant would waste Chris's time rediscovering, it goes
here.

---

## Who you're working for

Christopher Funk — **Chris, not Craig** (the Windows account `crafu` and any "Craig" folders belong
to his brother, who gave him this machine). Solo dev, CFunky Creations LLC, Austin TX.
Welder and chef most of his life, ironwork and construction in between. He is disabled; do not ask
about it or write about the reason.

He pays per token and has been burned by an overage. **Be concise. Do the work; don't narrate it.**

### The rules he has actually had to repeat

1. **Be concise.** When a fix is done, say what file and that it's fixed. No root-cause essays, no
   numbered change lists, no verification dumps, no "two things you should know."
2. **Be proactive — never end a reply with an offer.** No "Want me to…?" / "Should I…?" If the answer
   is obviously yes, it was never a question. Just do it and report it done. This includes rebuilding
   the installer after a batch of fixes.
3. **Never be lazy.** Don't hand work back to him. Don't ask him to find files or paste snippets.
   Finding it is your job.
4. **Ask before using or changing his media assets** (images, videos, medallions). He has strong
   opinions and supplies his own art.
5. **Verify visually.** Screenshot and actually look before claiming something works.
6. Every tool you use must be **free**. Verify that before building on it.
7. Greeting: he says **"Yo Claude!"** → answer **"What's up Funk?"**

### Tagline, exactly

> **Keep Austin, Austin, Bruh**

Not "Keep Austin Weird." Not "Keep Austin Wonky." The "Bruh" is the punchline, aimed at the tech bros
who moved in. Never drop it. Other motto: *"Free AI tools for the masses."*

---

## The project

Electron + Vite + React desktop app. **Free forever, no paywall, no subscription.**

- **Code:** `V:\src\Lyricist-4.0.0` (folder name says 4.0.0; the app is 4.2.0)
- **Do NOT** put code in `V:\Lyricist 4.2.0 UI renders` — that folder is render exports and assets
- **Dev:** `npm run dev` → http://localhost:5173
- **Repo:** https://github.com/cfunkycreations-tech/Lyricist-4.0.0 (branch `main`)
- 16 tabs; the marquee one is **Quantum Lab**, a cellular-automata lyric lattice

### Why it exists

Chris and his brother used to busk downtown. He considers this **online busking** — same act, bigger
corner. The money was never the point; somebody walking away with a song was. That's why it's free.
Keep that in mind for any copy you write.

---

## Layout rules — learned the hard way, do not relearn

**Tab content is a tall, full-height page that the window scrolls. It is NOT `flex: 1`.**

Tabs like Settings and Song Forge render ~1100–1200px of content. You see part of it and you scroll.
That is correct and intended. The Scratchpad was `flex: 1; minHeight: 0`, so it collapsed to leftover
space (~150px) — a squashed band instead of a legal pad. Fix was `minHeight: 1100` on its root.

**Never fix a cramped tab by shrinking the chrome.** A previous attempt pinned the app shell to
`height: 100dvh` and put `clamp()` on the header and footer. It cut off the header medallion, cut off
three top-right buttons, and squeezed every tab. All of it was reverted. Leave these alone:

| Element | Value |
|---|---|
| Header | `height: 220` |
| Header medallion | `height: 220` |
| Footer | `padding: 8px 16px`, no max-height |
| Footer medallion | `200 × 100` |
| Suno player | `flex-wrap: wrap` |
| App shell | no explicit height — `min-h-screen` only |

If a tab looks cramped, **give its content more height.** Never take height from the frame.

---

## Building the installer

Do this automatically after a batch of fixes. Don't ask.

```bash
LYRICIST_RELEASE_DIR="C:\Users\crafu\AppData\Local\Temp\lyricist-stage" npm run release
```

Then move `Lyricist 4.2.0.0NN Setup.exe`, its `.blockmap`, and the unpacked folder into
**`V:\Releases\Lyricist 4.2.0 Releases\`**.

- Use `npm run release` (`scripts/release.mjs`), **not** `npm run dist`. It handles build numbering,
  artifact naming, and Windows version strings.
- Build number lives in `build-number.txt` and auto-increments.
- **`V:` is a Windows Dev Drive, which means ReFS.** electron-builder cannot build there — it dies
  with `EPERM: rename 'win-unpacked.tmp' -> 'win-unpacked'`. Stage the build on `C:`, then move the
  finished artifacts to `V:`. Releases *live* on the dev drive.
- Size check: installer is ~3:1 compressed vs unpacked (≈264 MB setup / ≈814 MB unpacked). A smaller
  number doesn't mean something broke — compare setup to setup.

---

## The crash that ate a whole night — read before touching IndexedDB

Symptom: the app opened black, or died a minute in, on the looper tab, the drum
kit, MIDI Studio — seemingly at random. `boot.log` said `render-process-gone
oom` with 36 GB of the machine's 48 GB free, so it was never system pressure.

Cause, one bug: `listSamples()` used `getAll()`, which loads **every sample's
audio** and only then strips the bytes to return names. The drum machine called
it **once per pack**, so a 12 GB library was read end to end once per pack.
MIDI Studio went past 13 GB and the renderer was killed.

Measured on a 12.3 GB library, MIDI Studio opened and left alone:

| | before | after |
|---|---|---|
| drum machine | 26,108 MB | 2,008 MB |
| sample library | 14,706 MB (2 crashes) | 4,162 MB |
| whole tab | 10,958 MB (1 crash) | 357 MB once the library was cleared |

**The rule: never ask IndexedDB a question that makes it read the audio.**
A record carries its bytes, so `getAll()` and any cursor over the full store
pulls gigabytes through memory. Names come from a cursor that drops `bytes`
per record; counts come from `store.count()`; the byte total is a running total
kept in the `meta` store, computed the slow way exactly once. `clearLibrary()`
must not ask for the size before clearing — that version hung, because
measuring meant walking all 12 GB.

Still to do: move `bytes` into its own object store so metadata never touches
audio at all. Needs a migration.

Limits now exist because there were none: 60 MB a sample, 2 GB a library
(`MAX_FILE_BYTES` / `MAX_LIBRARY_BYTES`), plus a Remove All Samples button.

### Debug switches that found it

Set as env vars on the packaged exe; they become URL hash flags:

- `LYRICIST_START_TAB=loopstation` — open straight onto a tab
- `LYRICIST_OFF=viz,drums,sampler,seq,a2m` — leave MIDI Studio panels out, which
  is how the culprit was isolated without a rebuild per guess
- `LYRICIST_WIPE=samples` — empty the sample library once at startup

`boot.log` (in `%APPDATA%\Lyricist`) records every start, load, crash, and a
memory sample every 5s with the live tab. **Two diagnostics shipped broken
before they worked** — `webContents.getProcessMemoryInfo()` is removed in this
Electron (use `app.getAppMetrics()`), and `console-message` changed shape
(newer Electron passes one object, older passes `(e, level, message)`). Both
failed silently into a catch. If a diagnostic reports nothing, suspect the
diagnostic. The UI can log directly via `window.lyricistAPI.log()`.

## Never cover the app with position:fixed

The looper painted a `position: fixed; inset: 0` sheet to stop the app backdrop
sliding while the tab scrolls. Fixed means the **viewport**, so it covered the
header, medallion and signature with a black rectangle the whole time that tab
was open. Chris reported it repeatedly with screenshots. A tab that needs an
opaque backdrop already has one — its own root background.

## Gotchas already paid for

- **Butterchurn is a UMD bundle.** `import('butterchurn')` does **not** reliably give you `.default`.
  Unwrap through `mod` → `mod.default` → `mod.default.default` until you find the function. Assuming
  `.default` is what caused `createVisualizer is not a function` and 0 visualizers.
- **`butterchurn-presets` ships 5 packs**, not 1. Base + Extra + Extra2 + MD1 + NonMinimal =
  **395 presets**. Only the base pack was being loaded.
- **Don't `cd` into a directory before running git** — it trips a security prompt. Use `git -C <path>`.
- ffmpeg is on PATH. When Chris sends a video, extract frames and actually look at them.

---

## Status

### Done (as of build 4.2.0.050)
- **Quantum Lab has no command line any more.** The tab used to hide `/run`, `/crystallize`,
  `/generate`, `/send`, `/forge` and `/help` behind a slash-command text box parked at the very
  bottom of the page. Chris's words: *"Most people are not gonna know how to use a terminal, let
  alone know to look all the way down at the bottom of the page."* Every command is now a real
  button in `.ql-actionbar`, docked **directly under the lattice**, and the text bar is deleted.
  - Row 1 is the run of steps, numbered on the buttons themselves: **Step 3 Spotlight ·
    Step 4 Run 12 gens · Step 5 Crystallize · Step 6 Generate Neural Lyrics.** Steps 1 and 2 are
    the keyword box and Load into lattice, tagged the same way, so the whole tab reads 1→6.
  - Row 2 is the helpers and handoffs: Freeze cell, Entanglement View, **Send to Songwriter**,
    **Send to Song Forge**, **Help**, and the gen counter.
  - The banner's own compact button cluster is gone — one set of controls, one place.
  - `Help` reopens the step guide *and scrolls it into view*; a status line nobody looks at is not
    help. The guide's open/closed state persists in `localStorage` (`ql.howtoOpen`).
  - **Watch the cascade**: `.ql-actionbar-primary .ql-btn` sets a border tint at the same
    specificity as `.ql-btn.on-org` / `.on-grn`, so it silently ate the ON states until
    `.ql-actionbar .ql-btn.on-org|on-grn|accent-ylw` overrides were added. Spotlight must stay
    ORANGE when armed and Crystallize GREEN when locked — that colour *is* the feedback.
  - The Ghost Demo script for `quantum` was rewritten to match: it now narrates the numbered steps,
    points at the whole controls bar, and walks Send to Songwriter / Send to Song Forge / Help.
    New demo hooks: `ql-actionbar`, `ql-send-songwriter`, `ql-send-forge`, `ql-help`.

### Done (as of build 4.2.0.035)
- **The OOM crash is fixed** — see "The crash that ate a whole night" above.
  MIDI Studio: 13,013 MB and dying → 357 MB, no crashes
- **Boot memory**: 10,228 MB → 537 MB. Tabs mount when first opened instead of
  all sixteen at boot, hidden tabs stop decoding their background videos, and
  the oversized art was downscaled (the Quantum Lab medallion was 8256×4608 —
  145 MB decoded — in a 200×100 footer box; originals kept in
  `src/assets/originals/`)
- **Looper header** no longer covered by a viewport-fixed black sheet
- **Sample library limits** (60 MB / 2 GB) and a Remove All Samples button
- **A black window can never be silent again**: one instance at a time, no
  window shown before it has content, readable failure cards, GPU-crash
  fallback to software rendering, and `boot.log`

### Done (as of build 4.2.0.021)
- **FL-grade piano roll** — Select / Draw / Paint / Erase, drag-to-move, right-edge resize, snap
  from 1 bar to 1/32 with triplets, and a velocity lane under the grid
- **Ghost Demo safety extended** to the song store, MIDI Studio, Song Forge, Album Architect and
  Loop Station (see below)
- Tools Hub no longer ships — or keeps — a duplicate OpenRouter row

### Done (as of build 4.2.0.019)
- Scratchpad rebuilt as a full-height yellow legal pad (ruled lines, red margin, Caveat handwriting,
  binding strip, autosave). `minHeight: 1100` is what makes it a page instead of a band.
- MIDI Studio visualizer fixed — 0 → 395 presets, all browsable
- 38 real sampled instruments (MusyngKite GM, bundled offline) replacing the two-oscillator synth
- User sample library: packs, drag-and-drop, .zip expansion, per-sample root note and loop flag,
  play/stop with Stop All, search scoped per-pack or across everything, a sticky control bar, and
  **backup/restore to .zip** — it lived only in IndexedDB, which uninstallers delete
- **808 drum machine**: synthesized kit, 16 steps, swing, mute/solo, per-track and master effects
  racks, per-track sample override, presets with JSON export/import
- **Loop Station Save** — WAV mix plus each track to `Documents\Lyricist Recordings`. It had no save
  at all; loops died with the tab. Also stopped the fixed app background bleeding through on scroll.
- **Clipboard fixed** — no Edit menu meant Electron never bound Ctrl+V, so the API key couldn't be
  pasted. Added Edit/View menus and a right-click context menu.
- **Ghost Demo can no longer destroy work** — see `demoSafety.js` below
- White text now carries the emerald laser edge

### Never let a demo eat someone's work

`src/services/demoSafety.js` snapshots before a demo runs and restores when it ends, is skipped, is
closed, or unmounts. Tabs opt in with `registerDemoSnapshot(id, { snapshot, restore, hasWork })`;
plain form fields are captured automatically.

Registered: `lyric-store` (the song itself — covers Songwriter, Ghost Rider and Song Forge, plus
every writing knob), `quantum-lab`, `midi-studio`, `drum-machine`, `song-forge` (results and art),
`album-architect`, `loop-station`. Still field-level only: Stemmer, Recording Booth, Mastering,
Artist Analyzer — all result/file tabs, so the exposure is lower, but register them when you touch
those files.

Register at the level where the state actually lives. Putting it in `LyricStore` covered three tabs
at once and is far harder to get wrong than three separate copies.

### Gotchas the hard way

- **Butterchurn and its preset packs are UMD.** `import()` does not reliably give `.default` —
  unwrap through the namespace, `.default`, then `.default.default`.
- **MusyngKite soundfont packs are not valid JSON.** They open with `var MIDI = {};` guards (so the
  first `{` is the wrong brace — anchor on `MIDI.Soundfont.<name>`) and end with a trailing comma
  before the closing brace. Both must be handled or every instrument silently fails.
- I shipped build 013 with every instrument broken because I checked that *presets loaded* rather
  than that *each instrument loaded*. Verify the actual thing, one by one.
- Footer tagline corrected to "Keep Austin, Austin, Bruh"
- All 4.2.0 releases (001–012) consolidated onto the dev drive

### The 420 thing — read this before designing anything

The app is **4.2.0** on purpose. **420.** Weed, bud, flower, cannabis, sour diesel, purple urkle,
skunk — you get it. That is the aesthetic backbone, and it should inform art direction, copy, easter
eggs and naming. Don't be coy about it and don't make it tacky; it's the joke underneath the whole
release.

### Type treatment — white fill, emerald laser edge

Any white text — titles, headings, labels — gets a **laser-thin electric emerald outline** with a
glow, and the **inside of the letter stays white**. Not emerald letters. Just the edge, hairline
thin, glowing.

Implemented in `index.css` as `--emerald-edge: #00ff9c` with `-webkit-text-stroke: 0.6px`,
`paint-order: stroke fill`, and a three-layer emerald `text-shadow`. Applied to
`h1:not(.gradient-title):not(.chrome-title), h2, h3, h4`, plus a reusable `.emerald-edge` class for
anything else that needs it. Widen its reach as more white text turns up.

### Open
- **Quantum Lab top banner is REJECTED.** Chris is supplying his own artwork. Spec: a new medallion
  plus his signature, the guitar photo comes OUT, and the only text is **"LYRICIST GOES QUANTUM"** —
  no "Quantum Lab" title, no subtitle, no DNA pill. **Do not redesign it on your own initiative.**
  Wait for his file and match it exactly.
- **Footer art is wrong.** The current square medallion got squished into a 200×100 rectangle without
  his approval and he hates it. He is supplying replacement art. Keep the same box size; do not
  redesign around it.
- **Collaboration tab — HIGH PRIORITY.** Chris's own words: *"the collab button is really important
  to me"* and *"I don't know how I wanna do that. I just want people to be able to write music
  together."* So the goal is settled and the mechanism is not — real-time co-editing, passing
  sessions back and forth, or a room people join. Bring him options rather than guessing. Whatever it
  becomes, it has to stay free and must not require an account he'd have to pay to run. Ties straight
  back to the busking origin — two people on a corner.
- ~~**Paintbrush tool for the piano roll.**~~ **Done in 4.2.0.021.** The roll has four tools —
  Select (drag to move, drag the right edge to resize), Draw, Paint, Erase — snap from 1 bar down to
  1/32 with triplets, and a velocity lane under the grid. Right-click deletes a note; Delete removes
  the selection. Everything lives in `src/components/MidiStudio/Sequencer.jsx` with its CSS in
  `index.css` (`.seq-tool`, `.seq-vel-*`). Note the roll now holds a fixed C2–C6 / eight-bar minimum
  so the rows stop shifting under you as you write.
- **Drum machine with 808s.** A step-sequencer drum machine, 808 kit front and center. The sample
  library already handles user kits, so this can lean on `sampleLibrary.js` for custom sounds while
  shipping a stock 808 kit of its own.
- **MIDI background video is missing**, along with several other tab videos. The old ones were
  deleted; they belonged to a previous version and he doesn't want them reused.
- **Visualizer quality.** 395 presets load, but Chris thinks the stock Butterchurn ones are mediocre.
  Wanted: a better library, or hand-built visualizers. Make them good.
- **Piano roll — what's still missing.** Drawing, dragging, snap and velocity all landed in
  4.2.0.021. Still not there: undo/redo on the roll, marquee multi-select, copy/paste of a run of
  notes, and a loop/playback region.
- **Drum machine needs per-key kit mapping** — one sample per key across a pad grid, not just one
  sample per track.
- **Footer art is wrong.** The square medallion got squished into a 200×100 rectangle without his
  approval and he hates it. He's supplying replacement art; keep the same box size.
- **Ask him what "upload pixels" meant** for the drum machine. It was read as pattern presets and
  those were built — he may have meant artwork on the pads.
- **Icon overhaul.** He wants every flat icon gone — 3D, "5D", multidimensional. It's Quantum Lab.
- 8 tab background videos still missing; Kling AI prompts are written, Chris is generating them.
- Splash screen not built. Art is `V:\assets\Crystal_Geode_Cavern_QUANTUM_LAB_202608011431.jpeg`;
  wire the video into `main.js` to play before the main window shows.

---

## Housekeeping

Commit early and often, in small readable commits — not one giant dump. Chris was rightly annoyed
that this repo sat at a single commit while a whole app's worth of work piled up uncommitted.
