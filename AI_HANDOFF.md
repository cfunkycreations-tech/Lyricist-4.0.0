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

### Done
- Scratchpad rebuilt as a full-height yellow legal pad (ruled lines, red margin, Caveat handwriting,
  binding strip, autosave)
- MIDI Studio visualizer fixed — 0 → 395 presets, all browsable
- MIDI Studio now has 38 real sampled instruments (MusyngKite GM, bundled offline) replacing the
  two-oscillator synth, a playable keybed, and an always-visible piano roll
- User sample library: packs, drag-and-drop import, .zip pack expansion, per-sample root note, and
  "Play on roll" — all stored locally in IndexedDB, nothing uploaded
- White text now carries the emerald laser edge
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
- **Collaboration tab — HIGH PRIORITY.** Chris's own words: "the collab button is really important to
  me." Collaborate with other artists; the exact shape is open, so this needs a design conversation
  before building. Ties straight back to the busking origin — two people on a corner.
- **MIDI background video is missing**, along with several other tab videos. The old ones were
  deleted; they belonged to a previous version and he doesn't want them reused.
- **Visualizer quality.** 395 presets load, but Chris thinks the stock Butterchurn ones are mediocre.
  Wanted: a better library, or hand-built visualizers. Make them good.
- **Piano roll is not FL-grade yet.** Instruments and the sample library are done; still missing
  proper note drawing and dragging, a velocity lane, and snap-to-grid.
- **Icon overhaul.** He wants every flat icon gone — 3D, "5D", multidimensional. It's Quantum Lab.
- 8 tab background videos still missing; Kling AI prompts are written, Chris is generating them.
- Splash screen not built. Art is `V:\assets\Crystal_Geode_Cavern_QUANTUM_LAB_202608011431.jpeg`;
  wire the video into `main.js` to play before the main window shows.

---

## Housekeeping

Commit early and often, in small readable commits — not one giant dump. Chris was rightly annoyed
that this repo sat at a single commit while a whole app's worth of work piled up uncommitted.
