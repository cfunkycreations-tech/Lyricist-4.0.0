# Lyricist 4.2.0 — Cowork handoff: four workstreams

## Context

Four pieces of work handed off from a Cowork session, in the owner's priority order.
Each is independently shippable; they touch mostly disjoint files.

Decisions already taken by the owner in this session:

| Question | Answer |
|---|---|
| Pad grid | **Rip out the old instrument, build a true 9x9 from scratch** — plus velocity/no-velocity, chords, and Ampify/Launchpad-style live FX pads |
| Modal hosting | **Bake-time only** — Modal is the owner's tool, never shipped. No runtime network dependency, no per-user account |
| Floating cursor ghost | **Creator builds only** — the `VITE_FAFO_INTERNAL_BUILD` gate stays exactly as it is |
| 0–10 speed slider | **Both** speed controls get one |

### Two corrections to the handoff's premises

1. **"A real hardware check behind that 'slower on this machine' line" — there already is one.**
   `EngineSetup.jsx:257` renders that string from `gpu.verdict`, which comes from
   `comfySetup.js:118-170`: a real `nvidia-smi --query-gpu=name,memory.total,compute_cap`
   shell-out graded four ways (`good` ≥12GB & cap ≥7.5, `tight` ≥8GB, `slow` older card,
   `none` no NVIDIA), with the 7.5 int8-tensor-core and 9.2GB-text-encoder thresholds
   justified in the doc comment. It is the **only** hardware probe in the repo.
   What is genuinely missing is covered in Workstream 4 below: it is NVIDIA-only and
   desktop-only, it says nothing about CPU/RAM, and the renderer's own already-written
   WebGPU/f16 probe (`GhostVoice.js:315-322`, surfaced as `voiceState.backend`) is
   deliberately never shown to the user despite a comment at `:230` saying it should be.

2. **This container is Linux.** The JUCE engine, ASIO, VST3 hosting and Ableton Push
   hardware can only be compiled and tested on the owner's Windows machine
   (VS 2022 BuildTools + a vendored, gitignored ASIO SDK). Every JUCE-dependent stage
   below is marked **[WINDOWS ONLY]** and ships as unverified code with a graceful
   engine-absent fallback.

---

## Workstream 2 — Taxonomy handoff

**Goal:** tags, genres, moods and voices travel with a song between every tab, both
directions, using the mapping math already built.

### What already works
`src/services/styleBridge.js` (337 lines) is the mapping math and it is sound.
`GENRE_TO_BH` (:36), `SUBGENRE_TO_BH` (:75), `BH_GROUP_TO_SW` (:155), `BH_GENRE_GROUP` (:179),
`MOOD_ALIASES` (:268), `moodKey()` (:306), `translateMood()` (:320).
Exports `toBlackHoleGenres/toSongwriterGenres/toBlackHoleMoods/toSongwriterMoods`.
Sync happens **in the store setters, not in effects** — `LyricStore.jsx:402-428` — so there
is no loop. `once()` (:197) keeps table construction lazy because `LyricStore ↔ styleBridge`
is a circular import; eager construction threw a TDZ ReferenceError at startup.
**Anything added here must stay lazy.**

### The four real gaps
1. **Voices never travel.** `voiceList` (`LyricStore.jsx:398`) is stored and read only by
   Black Hole Studios. There is no voice bridge at all — `VOICE_GROUPS`
   (`musicTaxonomy.js:326-360`, 6 families) has no Songwriter counterpart.
2. **Tags never become taxonomy.** Ghost Rider writes Suno tags to `localStorage` via
   `ghostMemory.js:12-17` and fires a `lyricist:suno-tags` event. Exactly one consumer:
   `OneManBand.jsx:1004-1010`, and only as a free-text seed string inside `write_caption`
   when the caption box is empty. Tags never reach `genreList`/`bhGenreList` and never
   travel back.
3. **No taxonomy list is persisted.** `LyricStore.jsx:472-486` persists `config`, `lyrics`,
   `tipsEnabled`, `ghostDemoEnabled` — but **not** `genreList`, `subgenreList`, `moodList`,
   `bhGenreList`, `bhMoodList` or `voiceList`. A reload loses the whole song's style.
4. **Mastering Studio has its own free-text genre field** (`MasteringStudio.jsx:294`),
   disconnected from everything.

### Two bugs to fix on the way through
- `styleBridge.js:144` maps `'Darksynth': 'Darksynth'`, but `Darksynth` does not exist in
  `GENRE_GROUPS` (the Electronic family has only `Synthwave`/`Vaporwave`,
  `musicTaxonomy.js:148-149`). Picking it puts a phantom sound into `bhGenreList`, where
  `kitFor()` silently falls back to the generic guitar/bass/drums kit and
  `toSongwriterGenres` drops it. Map it to `Synthwave`.
- **Stale-closure in the setters.** `setGenreList` (:402) reads `subgenreList` from its
  closure and `setSubgenreList` (:408) reads `genreList` from its. Two picks in the same
  tick derive `bhGenreList` from a stale partner. Worse, the subgenre-prune effect
  (:457-470) calls `setSubgenreListRaw` directly and so **never re-derives `bhGenreList`** —
  dropping a subgenre leaves Black Hole describing a subgenre nobody picked.

### Plan
- **`src/services/styleBridge.js`** — add `VOICE_ALIASES` + `toBlackHoleVoices()` /
  `toSongwriterVoices()` following the exact shape of the mood bridge (`moodKey()` +
  `indexBy` + `translateMood`), kept behind `once()`. Add `tagsToTaxonomy(tags)` that
  runs a tag list through all three translators and returns
  `{ genres, moods, voices }` — this is the missing tag→taxonomy direction, and it reuses
  the existing tables rather than inventing a second vocabulary. Fix the `Darksynth` entry.
- **`src/context/LyricStore.jsx`** — collapse the four cross-writing setters into one
  `applyStyle(patch)` reducer that derives **both** dialects from the *next* state in a
  single functional update, killing the stale closure. Route the subgenre-prune effect
  through it. Add the six taxonomy lists to the persisted set at :472-486.
- **`src/components/ArtistAnalyzer/ArtistAnalyzer.jsx`** — on `saveSunoTags`, also call
  `tagsToTaxonomy` and push the result into the store, so an analysed artist fills in
  genre/mood/voice. Read the store back so the tab shows the current song's style.
- **`src/components/MasteringStudio/MasteringStudio.jsx`** — replace the free-text genre
  input with the store's lead genre, editable, writing back through `applyStyle`.
- **`src/services/musicTaxonomy.js`** — no change; it is pure data and `kitFor()` is the
  only function.

**Do not** rename `global_meta`. It is the MiniMax caption block, not a taxonomy field,
and the camel/snake boundary at `MusicService.js:82` and `:809` already cost one silent
bug (`NEXT-SESSION.md` #1: every Kaggle run shipped an empty caption because
`generateKaggle` read `state.globalMeta` where `buildState` writes `global_meta`).
`node scripts/song-payload-check.mjs` guards it — keep it passing.

---

## Workstream 3 — Black Hole Studios

**Goal:** Modal setup wired in, Kaggle setup pulled out, the "One-Man Band" string killed
app-wide including the ghost's spoken lines and audio files.

### Modal — bake-time only (owner's decision)
Modal is **not** a shipped engine and gets no IPC channel, no Settings key and no
`EngineSetup` card. It is a developer tool that runs Chatterbox to bake ghost voice-over
(see Workstream 4). This keeps `env.allowRemoteModels = false` (`GhostVoice.js:280`) intact,
adds no per-user account, and keeps the app free.

New file **`scripts/modal_chatterbox.py`** — a Modal app exposing a Chatterbox TTS function,
plus a local driver that posts lines and writes wavs. Modal's free tier is $30/mo of
compute with no card required, which covers a full VO bake comfortably.

### Kaggle — pull the setup out
Kaggle is a *whole subsystem*, not a card. Removing it touches:
- `kaggleCloud.js` (692 lines, main-process, CommonJS) — delete. Exports `status, connect,
  disconnect, render, collect, whoAmI, songsDir, SLUG, TITLE`.
- `main.js` — the require at :6, `setupStops` at :702, and seven handlers:
  `kaggle-status` :731, `kaggle-connect-text` :740, `kaggle-connect-file` :750,
  `kaggle-disconnect` :764, `kaggle-render` :769, `kaggle-render-stop` :780,
  `kaggle-collect` :807; plus `songsDir()` uses at :794, :817, :854.
- `preload.js:35-47` — the seven bridge methods.
- `src/components/OneManBand/EngineSetup.jsx` — the Kaggle card at :167-250, `TOKEN_PAGE`
  :45, state at :59-65, `connectKaggleCode()` :125-136, `connectKaggle()` :139-147.
  Leaves the file with one card ("This computer"/ComfyUI).
- `src/services/MusicService.js` — `REALTIME_FACTOR.kaggle` :31, `KAGGLE_WARMUP_S` :37,
  the `estimateSeconds` special case :147, `generateKaggle()` :533-639, routing :672-676.
- `src/components/OneManBand/OneManBand.jsx` — engine state and buttons at :347, :398-404,
  :808-810 (auto-collect on tab open), :1056-1060, :1117-1123, :1339-1340, :1404.
- `resources/kaggle-minimax-music3.ipynb` and its `extraResources` entry in `package.json`.
- `scripts/kaggle-check.mjs`, `scripts/kaggle-takes-check.py`.
- **`lyricist-relay/`** — a Cloudflare Worker CORS shim that exists *only* for Kaggle on
  mobile (`src/index.js:36` `KAGGLE_API`, allowed hosts :54-63, handler :119-146).
  The whole package becomes dead code.

Engine choice collapses to **Free cloud** and **This computer**. `OneManBand.jsx:1056`
hard-codes `['cloud','kaggle','local']` — that list and the Ghost's `set_engine` action
must shrink together, or the Ghost will offer an engine that no longer exists.

### Killing "One-Man Band"
The tab label is already "Black Hole Studios" (`App.jsx:115`) and the id/dir/CSS prefix
`onemanband`/`omb-` is **deliberately kept** — documented at `OneManBand.jsx:84-90`, because
saved takes, the Ghost tab router, the background video and the CSS all key off it.
Honour that. Only user-facing strings change:

- `src/assets/ghost-vo/manifest.json:3` and `:67` — transcripts still say "One Man Band"
  while `ghostDemoScripts.js:29`/`:124` already say "Black Hole Studios". The **baked mp3s
  `onemanband-0-say.mp3` and `onemanband-16-say.mp3` are audibly stale** and must be re-baked.
- `OneManBand.jsx:1487` — download filename `one-man-band-${t.seed}.flac`, visible in the
  save dialog.
- `lyricist-site/index.html:196,201,228`, `press.html:153-154`, `styles.css:265`.
- `lyricist-relay/README.md:3`, `package.json:5` — moot once the relay is deleted.
- Comments only, lowest priority: `OneManBand.css:1`, `ScrewShop.css:2`, `EngineSetup.css:2`,
  `lyricist-relay/src/index.js:4,29,119`, `main.js:440,474`, `preload.js:23`.
- `kaggleCloud.js:63-64` `SLUG`/`TITLE` are live remote Kaggle kernel identifiers — moot
  once Kaggle is deleted. If Kaggle were ever kept, renaming them is a migration, not a
  find-and-replace: it orphans every existing user's notebook.

---

## Workstream 4 — The Ghost

### 4a. Chatterbox on Modal, bake-time
Chatterbox (Resemble AI) is MIT-licensed and its `exaggeration` parameter is literally an
expressiveness dial — which is what makes per-line delivery notes meaningful.

The runtime voice stays **Kokoro-82M ONNX, local, offline** (`GhostVoice.js:31`, WebGPU
q4f16 with a wasm q8 floor). Nothing about `synthesize()` (:421-466) changes. What changes
is the **bake**: `scripts/generate-ghost-audio.py` gains a `--engine chatterbox` path that
calls the Modal endpoint instead of local Kokoro, passing each line's delivery note.

Keep the hard-won constraints in that script's header: no chorus (it smeared consonants to
100% word error), 9 kHz lowpass not 6.8 kHz, and `--qa` transcribe-back after **any** change.
Judge a take by word error rate, not by how ghostly it sounds.

### 4b. Full script rewrite with delivery notes
`ghostDemoScripts.js` `Step` is `{ say, target, action, typeText, then, wait, optional,
whenMissing, skipClick }` — plain prose, **no delivery notes, no SSML, no prosody**.

- Add an optional `delivery` field per spoken field (e.g.
  `delivery: { say: { exaggeration: 0.6, pace: 0.9, note: 'dry, land the joke' } }`).
  It is bake-time metadata only — the runtime ignores it, so no shipped behaviour changes.
- Extend `scripts/dump-ghost-lines.mjs` to emit it alongside `text`, and
  `generate-ghost-audio.py` to consume it. Keep the id contract
  `<tabId>-<stepIndex>-<field>` **exactly** — it is the contract between the script, the
  mp3 on disk and the lookup in `GhostDemo.jsx`, and the file says so at :7-9.
- **Inserting a step renumbers every id after it** and silently desyncs caption from audio.
  A rewrite therefore means a full re-bake with `--qa`, not a partial one.
- **Fix the bake script's manifest bug first.** `generate-ghost-audio.py:172,191,194` builds
  `manifest` from only the lines it baked and writes the whole file, so a `--tab` run wipes
  every other tab's entries. That is why `manifest.json` currently holds 17 `onemanband-*`
  entries for ~105 mp3s on disk. Make it merge into the existing manifest.
- **Coverage.** 12 of 18 tabs are scripted. Missing: `collab`, `toolshub`, `scratchpad`,
  `rhyme` (write these), and `thesaurus`/`dictionary` (deliberately excluded — the
  "no demo for this tab" line at `GhostDemo.jsx:404-417` is itself baked as
  `system-0-notabdemo.mp3`; leave them out).
- **The pad grid has no script and the Ghost does not know it exists.** It needs: a new
  `GHOST_DEMOS` entry, `data-demo` anchors added to the new 9x9 component (it has none
  today), and a `TAB_NOTES` entry at `GhostService.js:178-201` so the LLM can talk about it.
  This depends on Workstream 1 landing first.

### 4c. Floating cursor ghost as a toggle — creator builds only
**Two gates, and only one moves.**
- `GhostPilotLayer.jsx:36-43` — the `VITE_FAFO_INTERNAL_BUILD` build-time vaporisation.
  **This stays untouched.** The 30-line comment at :5-34 explains that the
  dynamic-import-inside-a-ternary shape is load-bearing: a static import would ship the
  entire robotics layer to every customer no matter what the flag said.
- `ghostPilot.js:4-6` — the dead stub. `const cursor = {…visible: false…}` and nothing ever
  mutates it, so `subscribeCursor` only ever emits `visible:false` and
  `VirtualCursor.jsx:30` returns null forever. **This is the line to un-stub**, feeding it
  from the same `pilotMove`/`pilotClick`/`pilotType` calls that already drive the OS mouse
  (`ghostPilot.js:27-31, 54-72`).

The toggle itself follows the `ghostCursor.js:65-79` module-getter pattern
(`getHandSpeed`/`setHandSpeed`, key `lyricist.ghost.hands`) under a new
`lyricist.ghost.cursor` key, rendered next to the existing Hands button in
`GhostAssistant.jsx:616-623`. `GhostAssistant` is already creator-only (`App.jsx:33-36`),
so the toggle never appears in a customer build even by accident.

`VirtualCursor.jsx` itself is intact and good — accent SVG pointer, `z-index 100000`,
`pointer-events:none`, click ring keyed by a counter so repeat clicks re-animate.

### 4d. Two 0–10 wheel-adjustable sliders (owner chose both)
New shared component **`src/components/common/WheelSlider.jsx`** — there is no reusable
slider in the app today and every `type="range"` is a bare inline-styled input.
Copy the Push knob's interaction contract verbatim (`PushHeader.jsx:580-598`):
`role="slider"`, `tabIndex={0}`, `aria-valuenow/min/max`, `onWheel`, `onPointerDown` drag
accumulating 6px per detent (`dragKnob`, :541-555), arrow keys, and a `title` naming both
gestures. Add `aria-valuenow` — the knob only carries `aria-valuetext`.

**Slider 1 — Ghost Demo pace.** Replaces the three buttons at `GhostDemo.jsx:649-662`.
Today `SPEEDS = { slow: 1.55, medium: 1.0, fast: 0.62 }` (:197) is a **time multiplier**
(bigger = slower), consumed at seven sites: `:240` mp3 `playbackRate`, `:261` bubble dwell,
`:384` per-char typing, `:387` typing settle, `:472` scroll settle, `:487` cursor glide,
`:534` inter-step wait.
Map `n ∈ 0..10` → `factor = 2^(1 − n/5)`: n=0 → 2.0 (slowest), n=5 → 1.0, n=10 → 0.5.
This lands `playbackRate = 1/factor` exactly on the browser's legal `[0.5, 2]` range, so
the clamp at :240 stops being load-bearing — **a naive 0–10 mapping would blow straight
through it and throw.** Persist it (it is unpersisted today) under `lyricist.ghost.demospeed`.

**Slider 2 — Ghost hand motion.** Replaces the cycling button at `GhostAssistant.jsx:616-623`.
Values live in `ghostCursor.js:26-31` as two named profiles plus `off: null`.
**`off: null` is the on/off switch** — five entry points (`moveHandTo` :123, `pressHand` :148,
`typeWithHand` :168, `captionHand` :193) early-return on a falsy speed. A 0–10 slider must
keep `0 → null` or those null-guards break. Interpolate 1–10 between the `normal` and `fast`
profiles field by field (`moveMin/moveMax/perPx/scroll/press/perChar/typeMax`) rather than
snapping to two presets. Keep the existing `lyricist.ghost.hands` key, widening its parser to
accept a number while still reading the old `'normal'|'fast'|'off'` strings.

### 4e. A real hardware check behind "slower on this machine"
The NVIDIA check is already real (see Context). What to add:
- **`comfySetup.js`** — extend `gpu()`'s return with CPU/RAM from `os.cpus()` and
  `os.totalmem()`, so the `none` verdict can say something truer than "no NVIDIA card"
  on a machine that is otherwise strong, and the `tight`/`slow` verdicts can factor in
  whether the machine can even stage a 9.2 GB model.
- **`GhostVoice.js`** — surface `voiceState.backend` (`'webgpu' | 'wasm' | null`, set at
  :232 from the f16 adapter probe at :315-322). The comment at :230 already says it is
  "worth surfacing in Settings: the difference between a ghost that keeps up on camera and
  one that stalls the app mid-take." Render it in `Settings.jsx` in the existing pill+dot
  idiom (`Settings.jsx:587-605`).
- **`EngineSetup.jsx:255-258`** — the tag currently collapses `tight` and `slow` into one
  "free · slower on this machine". Give each verdict its own tag text so the sentence
  matches the `headline`/`detail` already rendered at :261-265.

---

## Workstream 1 — 9x9 pad grid

**Goal:** rip out `PadInstrument`, build a true 9x9 with octave buttons and note keys as
real cells, velocity, chords, and live Ampify/Launchpad-style FX, wired to the JUCE layer.

### Geometry — 81 cells
64 pads + 8 function cells above + 8 scene cells right + 1 corner. That is a Launchpad's
physical layout exactly, which is why a Launchpad then maps 1:1 with no translation.

Two findings that shape this:
- **`usePushVisuals` already assumes 9x9.** `PushHeader.jsx:93-97` extends the pad bounding
  box one cell up (`pt -= S + G`) and one cell right. Real 9x9 geometry makes that heuristic
  literally correct instead of aspirational — **no visuals code changes at all.**
- **`cols` floor must rise 8 → 13** (`PushHeader.jsx:212`) or the scene column is clipped by
  the grid's `overflow: hidden`. Side-effect: `cols` is shared with the tab row, so narrow
  windows get more sweep fillers. Benign, but mention it rather than let it be discovered.

New `src/components/PushHeader/padLayout.js` holds the pure math (`S`, `GX=5`, `GY=1`,
`SCENE=13`, `cellAt`, `SCALES`, `NOTE_NAMES`, `at`, `padInfo`, `midiForIdx`). Container
becomes `gridTemplateRows: repeat(9, 54px)`; buttons move to rows 5-9.

- **Function row** (gy 0): `Oct −`, `Oct +`, `Drum`, `Note`, `Keys`, `Chord`, `Velo`, `FX`.
- **Corner** (8,0): `Shift` — the modifier that makes things "on the fly" (latch an FX,
  open a picker, clear a pattern).
- **Scene column** (gx 8): scene launch 1-8; becomes the FX picker while `FX` is held.
- **New `keys` mode** puts a real piano on the 8x8 — white keys across the bottom four rows,
  black keys above their neighbours with gaps where a piano has none. This is the second
  half of "note keys as real grid cells".

**Do not rewrite `padInfo`.** Keep it as the 8x8 musical mapping and wrap it in `cellInfo`,
which checks the FX-assign map first, then falls through. The assignment layer sits on top
of the musical layer, which keeps both simple. `padInfo` gains only a return of `idx` and
`degree` — it already computes them and throws them away, and chord mode needs the degree.
`hit()` stays the single dispatch point; it just switches on more kinds.

**Colour:** `PushHeader.css:5-12` bans purple and cyan. Give the whole FX layer **one amber
identity hue (38)** and differentiate by label, using the existing `lv-dim`/`lv-on`/`lv-hot`
brightness classes. Per-FX hues would drift into violet as FX are added; one hue makes the
rule structurally impossible to violate and needs almost no new CSS.

### Velocity
Pointer events carry no velocity. Four sources, cycled by the `Velo` cell, persisted to
`lyricist.push.velocity`: `hw` (the byte already arriving at `onPad`), `force`
(`e.pressure`, guarding `!== 0.5` which is Chromium's mouse-down constant), `y`
(Y-within-pad, the MPC idiom, default for mouse), and `fixed` — **the no-velocity toggle**.
`hit()` already clamps `velocity/127`, so nothing downstream changes. Velocity also picks
the lit level, and pointer-capture is already called, so the rect is valid at pointerdown.

### Chords
Stack in **scale degrees**, not semitones — quality falls out of the scale and you cannot
play a wrong note. `Off/Power/Triad/Seventh/Ninth/Sus4/Quartal`, plus inversion, spread and
strum on knobs.

**Caveat worth a block comment:** degree-stacking is only interval-correct on the seven-note
scales. On the pentatonics and Blues a +2 degree gives the stacked-fourths voicings those
scales are actually played with — musically right, and **deliberately not "fixed" later**.
On Chromatic it gives a cluster, so fall back to fixed semitone intervals there.

**Release must change:** `stopsRef` maps `"x,y"` → *one* stop fn; a chord produces N. Store
a composite fn that calls them all, and `release()` needs no change.

### FX pads — the Ampify half
Graph: `padBus → repeatNode (worklet) → gateGain → createFxChain → getMasterBus()`.
One `createFxChain(ctx, {...DEFAULT_FX, limit: 1})` built in the same effect that makes the
gain node. **Always in the path, never bypass-rewired** — at defaults it is transparent, and
`fxRack.js` already warns that rewiring a running graph clicks. It sits *before*
`getMasterBus()` so Butterchurn visualises the FX — pressing a filter pad visibly closes the
visuals.

Momentary on pointerdown/up; **`Shift` at press time latches**. Several FX compose at once
via an insertion-ordered Map folded into one patch, `set()` called **once per animation
frame** — a fast drag fires 100+ moves/sec and `set()` touches ~30 nodes each time.

Eight FX, the first five pure parameter automation on the existing rack:
filter sweep, highpass riser, bitcrush (+drive), delay throw, reverb wash, gater.
Three traps that each need handling:
- **Delay throw:** `fxRack` gates the send with `delayMix > 0 ? 1 : 0`, so snapping to 0 on
  release kills the tail *and* the repeats still circulating. Ramp it down over ~400ms in
  ~8 steps, staying above 0 until the last. **Zero `fxRack` changes.**
- **Reverb:** `makeImpulse` fills a multi-second stereo buffer sample by sample and `set()`
  rebuilds it whenever size changes. **Build the IR once at mount and modulate only
  `reverbMix`.** `reverbSize` rebuilds on release, never during a gesture.
- **Gater:** `fxRack` has no tremolo and should not grow one. Use the dedicated `gateGain`
  and schedule it on the **existing 25ms sequencer clock** so there is one clock, not two.

**Beat-repeat / slice / screw** need a live ring buffer — new `src/services/liveLooper.js`.
`screwService.screwTrack` renders a blob in an `OfflineAudioContext` and **cannot be made
live**; share `SCREW_PRESETS` and `CHOP_STYLES` as *data only* and comment it so a later
cleanup doesn't try to merge them. Two environment traps:
- **No SharedArrayBuffer on `file://`** (needs cross-origin isolation headers a packaged app
  can't provide) → the worklet must do capture *and* playback itself; only small JSON
  commands cross `port`.
- **`addModule` is unreliable on `file://`** → load from a **Blob URL** built from a source
  string. Bonus: nothing new goes into `public/` or electron-builder's `files`.
Freeze the write pointer while repeating or the loop records its own output and smears.
Crossfade 2-4ms at the seam or every repeat clicks.
**Fallback if `audioWorklet` is missing:** event-level note repeat off the tempo grid. Build
it regardless — it's quantised, which the audio version isn't, so it's useful on its own.

**Assigning on the fly** (the verbatim ask): hold `FX` → the 8x8 dims and the scene column
becomes the eight FX types → tap one to arm → tap any pad to assign → release. Persisted to
`lyricist.push.fx`.

### The JUCE split
**Stays Web Audio:** 808, samples, **all FX**, the sequencer clock. The FX must stay because
they feed `getMasterBus()` for Butterchurn, and moving them means reimplementing `fxRack.js`
in C++ for nothing.

**Goes to JUCE:** note pads, *only when a VST3 is loaded*. `soundfontEngine` serialises every
note through an offline render on a shared processor — a five-note chord is five queued
offline renders. That is structural, not tunable, and it is the whole justification.

**The honest cost, which the UI must state:** JUCE writes to the device directly, so VST3
audio is not visualised, does not pass the FX chain, and ignores the Volume knob. A loopback
driver would fix it but **violates the "every tool must be free" rule**. Accept the split,
show `VST3 · direct out` on the screen cell, and write it into the comment as a deliberate
decision rather than an oversight.

New `src/services/juceBridge.js`, based on `git show ba308ff:src/daw/services/JuceBridge.js`.
**Correction to the earlier read: that version is already fixed** — it awaits the invoke, and
its comment explaining the old hang is worth preserving. The real hazard is its
`_mockResponse` fallback, which returns fake loaded plugins (`Mock EQ`, `Mock Reverb`) and
`{success:true}` for `asio.open`. **Delete it** — a UI built on that lies about what's loaded.
Add a cached one-shot `probe()` so callers never eat the 10s timeout just to learn there's
no binary.

`preload.js` gains `juceAvailable` and `onJuceEvent`. `main.js` gains a `juce-available`
handler and, inside the existing readline loop, a `juce-event` send for messages with **no
`id`** — a notification, not a reply — so a subscriber doesn't see every other caller's
replies. Do **not** expose `juce-spawn`/`juce-send`; `juce-command` already lazily spawns and
correlates, and the raw pair would let a caller bypass that.

**[WINDOWS ONLY] The two AudioDeviceManagers are a real bug, not untidiness.**
`asio.open` configures a device the graph never uses, because `PluginHost::startAudio` calls
`initialise(…, nullptr, true)` and takes the *default*. On Windows ASIO drivers are usually
exclusive, so opening the card twice fails or lands elsewhere depending on call order. Fix:
one manager owned by `PluginHost`, `AsioDriver` takes it by reference, construction order
flips in `Main.cpp`, and `startAudio` stops re-initialising an already-open device.
In the same change, `asio.enumerate` must walk **all** device types — JUCE 8 returns ASIO
devices *exclusively* when any exist, so an ASIO machine currently can never pick WASAPI.
That also keeps the design working in the `JUCE_ASIO=0` configuration `BUILD-RESUME.md`
warns about.

### Live MIDI — and a conflict the handoff didn't mention
**Widen `pushMidi.js`, don't build a JUCE MIDI path.** Web MIDI already works, permissions
are already granted, it needs no C++ build (so it is testable here), and it handles LED
feedback, which JUCE has no API for.

**But two processes cannot share a Windows MIDI input.** `PluginHost::startAudio:91-96`
opens *every* available input unconditionally; WinMM inputs are exclusive to one process.
Whichever opens first wins and the loser silently gets nothing. Resolve it as a setting —
**Controller goes to: App / Engine** — not a race. Making "Engine" releasable is the one C++
addition worth making: a reply-only `midi.list` / `midi.setInputEnabled` pair, plus a public
`sendNotification()` (six lines on the existing locked writer) for later.

Controller profiles go in `src/services/midiControllers.js` (Push / Launchpad / generic);
`pushMidi.js` consumes them and gains `onCell(gx,gy,vel)` in 9x9 coordinates. Port filter
changes from `/push/i` to "prefer a Push, else accept all, minus obvious loopbacks".

Two fixes while in there:
- **`hueToPushColor`** (`pushMidi.js:30-35`): `1 + Math.round(h/360*24) % 25`. `%` does bind
  tighter — but `Math.round(h/360*24)` over `h ∈ [0,360)` yields 0..24, so `% 25` is a no-op
  and the result is 1..25. **Correct by accident, not live.** Fix the parens to the intended
  1..24, and don't oversell it in the commit message.
- **The LED effect has no dependency array** (`PushHeader.jsx:525-536`), so it walks every
  pad on every render. At 9x9 that's 81 `colorOf` calls per render, and `colorOf` now has to
  consult chord state and the FX map. Replace with a `useMemo`'d `litMap` that also drives
  the on-screen classes — then the screen and the hardware can never disagree.

### Packaging
`getJuceEnginePath()` checks, in order: `process.env.LYRICIST_ENGINE`, then
`resourcesPath/juce-engine/LyricistEngine.exe`, then the two existing dev paths, then `null`
— gated on `win32`.

**Do not point `extraResources.from` at `juce-backend/build/Release`** — electron-builder
fails when a `from` path is missing, which would break every build made without the Windows
toolchain, i.e. every build from here. Stage it instead, matching the existing
`scripts/copy-*.mjs` convention: `resources/juce-engine/.gitkeep`, a new
`scripts/copy-juce-engine.mjs` that copies the exe if present and **no-ops with a printed
note if not**, wired into `build`.

**Graceful absence is this container's entire test surface.** With no binary:
`juce-available` returns instantly with no spawn, the VST3 sound family is **hidden rather
than disabled-with-an-error**, the screen reads `ENGINE · off`, and everything else — the
full 9x9, velocity, chords, all eight FX, the looper, Web MIDI, the sequencer, Butterchurn —
works completely.

**Do NOT delete `main.js`'s fake plugin GUI (`vst3-open-gui`, :1597-1866) in this
workstream**, despite `BUILD-RESUME.md` saying to. Nothing here can verify `plugin.showEditor`
on Windows, and removing an untestable fallback is how a button ships dead. Stop calling it
from new code; delete it once the owner confirms a real editor opening.

### Staging — one commit each
| # | Stage | Verifiable here? |
|---|---|---|
| 0 | Extract `padLayout.js`, **no behaviour change** | Yes |
| 1 | 9x9 geometry: delete `PadInstrument`, add `PadGrid.jsx`, `cellInfo`, `keys` mode, `cols` floor, CSS | Yes (visual) |
| 2 | Velocity — four sources, `Velo` cell | Yes |
| 3 | Chord modes, composite stop fns | Yes |
| 4 | FX chain + the six parameter FX | Logic yes; **owner** listens (no audio device here) |
| 5 | Live looper worklet + fallback | Registers here; **owner** confirms it sounds right |
| 6 | FX assign mode | Yes |
| 7 | Controller profiles, `litMap`, `hueToPushColor` | Code yes; **owner** needs hardware |
| 8 | `juceBridge` + preload + graceful absence | **Yes — the absent branch is exactly what this container exercises** |
| 9 | VST3 note routing | **[WINDOWS ONLY]** |
| 10 | C++: one device manager, `midi.*`, `sendNotification` | **[WINDOWS ONLY]** — cannot compile on Linux |
| 11 | Packaging | Script yes; **owner** for the installed app |
| 12 | Delete the fake plugin GUI, after 9 verifies | **[WINDOWS ONLY]** |

**First shippable slice: stages 0-8.** The entire grid, velocity, chords and all FX, plus a
bridge that degrades honestly — all testable without the Windows toolchain, and all useful
on its own if 9-12 never happen.

### Risks
- Never fix a cramped header by shrinking `S` below 54 — `.header-cosmic.push-open` already
  sets `height: auto`, so there is no conflict with the fixed 220 header.
- The chevron's `data-help` at `PushHeader.jsx:290` still says "8 by 8 pads" — update it in
  the same commit or the help text starts lying.
- `plugin.noteOn` has **no timestamp field**, so strum to VST3 carries IPC jitter. Known
  limitation; the fix is a `time` param later.

---

## Verification

| Check | Command | Covers |
|---|---|---|
| Song payload contract | `node scripts/song-payload-check.mjs` | WS2 — fails if `state.globalMeta` ever becomes real again |
| Pre-build sanity | `node scripts/preflight.mjs` | WS3 — duplicate `ipcMain.handle` registrations, which kill the app at launch |
| Import cycles | `node scripts/find-cycles.mjs` | WS2 — the `LyricStore ↔ styleBridge` cycle must stay lazy |
| Caption skill | `node scripts/caption-skill-check.mjs` | WS3 |
| VO word error | `python scripts/generate-ghost-audio.py --qa` | WS4 — transcribes every baked clip back and reports WER |
| Dev run | `npm run dev` → localhost:5173 | all |

**Not verifiable in this Linux container:** anything requiring the JUCE engine binary
(ASIO enumeration, VST3 scan/load/editor, plugin note routing), Ableton Push hardware,
`nvidia-smi`, and the packaged NSIS installer. Those need the owner's Windows machine and
must be handed back as explicitly unverified.

**Visual verification is a house rule** — screenshot and actually look before claiming a
UI change works.

## Commits

Small, readable, one per stage — the repo has been burned by a whole app's worth of work
sitting uncommitted. Branch `claude/repo-onboarding-handoff-og2z1t`, draft PR at the end.
