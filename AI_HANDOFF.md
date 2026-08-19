# AI HANDOFF - Lyricist 4.2.0 "Goes Quantum"

> **2026-08-19 - ONE BUTTON SETS UP KAGGLE AND COMFYUI. Build 109.**
> Chris: *"we have to figure out a way to tell people how to install ComfyUI and use Kaggle because
> the instructions are very vague. No one's gonna know how to do that except people like me and
> you. So we have to figure out how to push one button that sets it up for them."* And, on the
> hardware advice: *"remember, this is for the fucking world. Don't worry about my Pascal chip."*
>
> **KAGGLE IS NOW A REAL ENGINE**, not a line of advice inside a warning. It is the only free route
> to a full three-to-five minute song (30 GPU hours a week, against the cloud demo's few minutes a
> day). New `kaggleCloud.js` in the main process drives **Kaggle's own API**: it pushes the shipped
> notebook with the person's caption and lyrics injected, runs it on a T4, polls, and downloads the
> audio back into the tab.
> **The API is not guessed.** Every endpoint, field name and enum was read out of Kaggle's own
> published SDK (`kagglesdk` 0.1.37): `POST https://api.kaggle.com/v1/kernels.KernelsApiService/
> {SaveKernel,GetKernelSessionStatus,ListKernelSessionOutput}`, HTTP Basic auth, camelCase JSON.
> `machineShape` is pinned to **NvidiaTeslaT4** because Kaggle's own docs warn the P100 is Pascal
> and the default image's torch has no sm_60 kernels - it reports a working GPU and dies on the
> first real operation.
> **What the user does: click "Open Kaggle", click Create New Token, click "Pick my kaggle.json".**
> The token is PICKED with a file dialog on the Downloads folder, never typed.
>
> **"THIS COMPUTER" IS NOW ONE BUTTON TOO.** New `comfySetup.js`: source zip (not the 7z - Windows
> cannot extract those without help), private venv, **the torch build chosen by the card's compute
> capability**, ComfyUI's requirements, the three int8 weight files (11.9 GB, resumable - stop it
> and press it again and it carries on), and the workflow written for them.
> It **proves the card with a real matmul before spending 12 GB**, because below sm_75 the current
> wheels report a working GPU and only fail once real work starts.
> The verdict is written for whatever card it finds, not for one machine: 12 GB+ and sm_75+ is
> "will run properly", 8-12 GB is "will work and be slow", older is "expect hours", none is "the
> free cloud and Kaggle need no card at all". **The honest number comes BEFORE the download.**
>
> **Packaging:** `comfySetup.js`, `kaggleCloud.js` and `resources/kaggle-minimax-music3.ipynb` are
> all in `build.files` / `extraResources`. `npm run preflight` confirms: 29 ipc channels, 29
> bridged, 5 main modules packaged, 2 runtime assets packaged.
>
> **Verified offline** (no Kaggle account needed for any of it): token errors name the actual
> problem; the built notebook is valid JSON with all 16 cells flattened to single strings, which is
> what Kaggle's own pusher does; a caption containing `"""` and a backslash is neutralised and stays
> valid; the GPU probe reads the real card on this machine correctly. **The one thing NOT yet proved
> end to end is a real push to a real Kaggle account** - that needs a token, so it is the first
> thing to check when one exists.
>

> **2026-08-19 - FIVE GENRES, FIVE MOODS, FIVE OF EVERYTHING, BLENDED INTO ONE. Build 108.**
> Chris: *"I wanna be able to choose more than one genre. I want it to go up to five genres mixed
> into one... and moods, by the way, and everything else... Make it funky."*
>
> **`src/components/common/MultiPick.jsx`** is the one control, used in both tabs. Chips for what
> you picked (each with an x), a normal dropdown to add another, a live "3 of 5", and the dropdown
> disables itself at five saying so in plain English. **NOT a `<select multiple>`** - ctrl-click is
> invisible to anyone who does not already know it exists, and this app has no hidden controls.
> **The first pick is the LEAD and it is labelled**, because Country + Trap and Trap + Country are
> two different songs; tap any chip to promote it.
>
> **A BARE LIST DOES NOT PRODUCE A BLEND.** Handed "Country, Trap, Gospel" a model picks the first
> and writes a country song, because a list reads as a menu. `src/utils/blend.js` names the lead and
> says the word FUSION out loud. Verified against the real `buildPromptContext`: a blend comes out as
> *"Country + Hip-Hop / Rap + Trap (a real fusion, not a list: Country leads the sound, with ...
> woven through it)"*, and a single pick still comes out as bare `- Genre: Country` - nobody who
> picks one thing pays for this feature.
>
> **Nothing became a breaking change.** `store.genre` / `.mood` / `.subgenre` still exist and now
> return the LEAD of each list, and `setGenre(x)` still means "make it just x", so Song Forge, the
> Artist Analyzer, the demo snapshot and the cover-art prompt all kept working. The blend is
> `store.genreList` / `moodList` / `subgenreList`. Old saved sessions restore through
> `s.genreList || [s.genre]`.
>
> Also changed because the blend made them wrong:
> - **Subgenres are the UNION** of every picked genre's subgenres, lead first (22 options across
>   five genres), and changing one genre no longer hard-resets a still-valid subgenre pick.
> - **One Man Band merges the KITS.** The whole point of `musicTaxonomy` is that each genre carries
>   its instruments; blending genres without blending kits would hand MiniMax a genre list with one
>   band behind it. `mergedKit()` dedupes and caps at twelve - five kits is a forty-piece orchestra.
>   Verified: Blues rock + Afrobeats + Gospel + Bluegrass produced *"dirty guitar, walking bass,
>   slide, tambourine, log drum bass, shakers, ... Hammond organ, piano, full choir"*.
> - **Voices blend as lead plus harmony**, and a song is only instrumental if EVERY voice pick is.
> - **The Rap Flow control shows when ANY picked genre is rapped**, not just when the lead is
>   Hip-Hop / Rap. Verified: hidden for Country alone, shown with Trap in the blend behind Country.
> - **Surprise Me now rolls 2-3 genres and 1-3 moods.** One random genre is a dice roll;
>   "Folk / Americana + Trap + Hyperpop" is a song nobody would have thought to ask for.
>

> **2026-08-19 - THE BACKGROUNDS DIED AS YOU WALKED BACK THROUGH THE TABS. Build 107.**
> Chris: *"the background animations work one through seventeen tabs. But as you go through them and
> you come back through them, they stop working."* He described the mechanism exactly.
>
> **CHROMIUM ALLOWS SIXTEEN WEBGL CONTEXTS PER RENDERER AND THIS APP HAD EIGHTEEN.** A tab stays
> MOUNTED once opened (TabPane hides it with `display:none` so its work is not lost), so every tab
> visited left a live prism behind it: seventeen tabs plus the header. Creating the seventeenth
> force-loses the OLDEST. Nothing throws and nothing logs - the canvas just stops. Measured before
> the fix: **18 canvases, 18 reporting `gl.isContextLost() === true`.**
>
> The canvas is now mounted only while it is on screen, which caps the app at two contexts. Four
> things had to be got right and each one was found by measuring, not by reasoning:
> 1. **A released context cannot be revived.** `getContext` on a canvas whose context was killed
>    with `loseContext()` hands the DEAD one straight back. The first version released contexts
>    perfectly and still left every tab frozen: 1 of 17 alive going forward, 17 of 17 dead coming
>    back. **The canvas ELEMENT has to be new**, so it is built with `document.createElement` inside
>    the effect - React 18 StrictMode runs effects twice in dev and would otherwise reuse the
>    element and hand back the corpse.
> 2. **On-screen means "has a layout box", not IntersectionObserver and not `document.hidden`.**
>    Electron reports a merely COVERED window as hidden and nothing intersects the viewport in that
>    state; TabPane carries the same warning about the videos. With an IntersectionObserver here,
>    thirty-four tab switches created **ZERO** contexts.
> 3. **The tab switch is the signal.** App dispatches `lyricist-tab`; React runs every cleanup
>    before any effect in a commit, so the tab being left gives its context up before the tab being
>    opened asks for one. Waiting on an observer let them pile up faster than they were released.
> 4. **`live` starts FALSE.** Starting true had all eighteen build a canvas on first render, over
>    the limit immediately, and the browser killed the oldest - the header, which never unmounts, so
>    nothing ever rebuilt it. And the `webglcontextlost` handler must be detached BEFORE the
>    deliberate `loseContext()`, or an ordinary tab switch reads as "the context died, rebuild it"
>    and loops: 679 contexts across three laps, and the page locked up.
>
> **Verified: 85 tab switches** - forward, back, three fast laps with no wait, then a slow lap -
> **zero failures**, both visible prisms live throughout, 2 canvases mounted out of 18 wrappers.
>

> **2026-08-19 - THE BACKGROUNDS WERE TOO DARK TO SEE, AND CHOPPED & SCREWED HAD NO ART AT ALL.
> Build 106.**
> Chris: *"lighten all of the backgrounds in each tab because you can barely fucking see the image
> behind it. I want people to see the goddamn image."* And: *"fix the chopped and screwed, the top
> of it where there's no animations."*
>
> **Four things were stacked against his artwork at once and every one had to move.**
> (1) `TabBackground` drew the art at **opacity 0.22** and called it "atmosphere". (2) It used
> **`mix-blend-mode: screen`**, which drops every dark pixel to nothing, so a moody render showed
> only its highlights no matter how far the opacity went; raising the number alone would not have
> fixed it. It is `normal` at 0.72 now, and the prism still reads through the remaining quarter and
> all around it. (3) Each tab painted its own **radial veil** over the top (Screw, One Man Band,
> Quantum Lab) at up to 0.86 black at the rim. (4) Four tabs put a **full-tab dark scroller** on top
> of that: Artist Analyzer (0.55 / 0.45), Settings (0.62), Song Forge (0.55), Songwriter (0.40).
> Panels went from 0.58 to 0.42, the sidebar 0.72 to 0.58, the output rail 0.55 to 0.40.
>
> **CHOPPED & SCREWED IS THE ONE TAB WITH NO `bg-art/screw.webp`.** Sixteen files for seventeen
> names, and nothing anywhere said so - the tab just rendered the prism under a heavy veil and read
> as a dead area. `TabBackground` now warns in dev naming the exact file to drop in, so the next
> missing one is caught the first time the tab is opened. **Dropping `src/assets/bg-art/screw.webp`
> in is still the whole job** - it is picked up by name, no import, no component edit.
> Until then the hero carries its own motion: a record turning on a 22 s rotation (the grooves are
> circular, so the conic glint is what you actually see going round), a 13 s sheen dragging across
> the band the way tape does when the speed comes down, and a 9 s breath under the title's glow.
> All three verified running via `document.getAnimations()`.
>

> **2026-08-19 - THE MODEL'S SCRATCHPAD WAS BEING SAVED AS VERSE 1. Build 105.**
> He opened the Songwriter workspace and the first section read "Verse 1 - 29 lines", starting
> with *"We need to output lyrics with labels for each section: [Intro], [Verse 1], [Chorus]"*,
> then *"Let's count syllables."*, then *"Midnight(2) kitchen(2) lights(1) flicker(2)"*. That is a
> reasoning model's planning pass, stored in his song as lyrics.
>
> **Cause, in two halves.** (1) Reasoning arrives in `message.content` on any provider that does
> not split it into `message.reasoning` - and it arrives in four different shapes: fenced
> `<think>...</think>`; a lone `</think>` because streaming reassembly lost the opening tag;
> gpt-oss harmony channels `<|channel|>analysis<|message|>...<|channel|>final<|message|>`; and
> plain untagged prose with no marker at all. (2) `parseSectionsFromText` opens an **implicit
> "Verse 1" for any text appearing before the first [Label]** - so every one of those shapes lands
> in the song.
>
> **Fix, three layers.** `reasoning: { exclude: true }` on every OpenRouter request (AIService,
> GeminiService text path, RhymeHelper) so the router drops the thinking pass; a new
> `src/utils/stripReasoning.js` that `singleCall` runs over every reply before anything downstream
> sees it; and `guardedCall` now FAILS a reply that is mostly scratchpad, or that shrank from 12+
> lines to under 4, so it retries on the fallback model instead of saving notes.
> `parseSectionsFromText` strips tags as a last line of defence (tags only there - it also runs on
> text the user pasted, and their words are theirs).
>
> **The trap in the heuristic, and it is a real one.** The first draft keyed on opening phrases -
> "We need to", "Let's", "Better to", "Actually," - and **ate 11 of 18 real lyric lines** in
> testing: *"We need to talk but the radio is louder"*, *"Let's count the cracks in the ceiling
> again"*. Songwriters open lines exactly the way a model opens a thought. So an opener alone is
> never enough: it must appear WITH craft talk (syllables, line count, section labels, the user,
> the prompt). Only mechanical tells fire unconditionally - `word(2) word(2) word(1)` tallies,
> `Mid-night ki-tchen` hyphen splits, `Count:`, `Line 1:`, `e.g.`/`etc.`. Final score: **0/18
> false positives, and his exact dump reduces to a clean [Verse 1] + [Chorus].**
> Regression check lives in the module's comments; re-run it by importing
> `stripReasoning`/`looksLikeReasoning` straight into Node.
>

> **2026-08-16/17 — TWO NEW TABS AND EVERY BACKGROUND VIDEO IS GONE. Shipped 4.2.0.102.**
> Builds 098 to 102. Installer **381.9 MB -> 187.5 MB.**
>
> **ONE MAN BAND** (tab 2, after Songwriter) turns lyrics into a real song with vocals, on
> MiniMax Music 3. Three engines behind one `generateSong()` in `src/services/MusicService.js`.
> Measured on the same 30 seconds of music: **free cloud ~35 s, Kaggle free T4 ~17 min, a 4 GB
> Pascal card ~3 hours.** So cloud is the DEFAULT — it is the fastest AND the free one.
> **The free cloud has two hard limits, found by hitting them: ~45 s of music per call, and only a
> few minutes of GPU a day anonymously.** A free Hugging Face token raises the quota and there is a
> field for it in Settings. Kaggle is NOT redundant — it is the only free path to a full 3-5
> minute song. `V:\minimax_music3\MakeASong.ipynb` is the notebook.
> **`Rewrite with AI` WAS BROKEN AND IS NOW FIXED AND PROVEN (2026-08-17, build 103).** It could
> never have worked on any install, and it was not the quota. Two faults in `composeCaption`:
> the state went out as `JSON.stringify(state)` while their `compose_assist` does
> `isinstance(raw_state, dict)`, so a string fell through to their defaults and the call died with
> "Describe the song you want first."; and it ran their `all` target, which rewrites the LYRICS
> too. It now sends the object with `assist: 'prompt'`, which keeps his words and rewrites only
> the sound. The reply is `[stateObject, "status"]`, not prose, so the three blocks are read off
> the object. Round-tripped live: 14.3 s, 668 / 568 / 1621 chars back, lyrics untouched.
> **Lesson: "the quota ran out" was a guess. The server said exactly what was wrong and nobody
> read it.** Proof harness: import `composeCaption` straight into Node, no UI needed.
>
> **2026-08-18 — THE CLOUD ENGINE WAS SINGING THEIR DEMO SONG, NOT HIS LYRICS.**
> `generateCloud` posted `JSON.stringify(state)`. Their `studio_generate` runs the argument
> through `_normalize_state`, whose entire test is `isinstance(state, dict)` — a JSON string
> fails it in silence and **every field falls back to `_COMPOSER_DEFAULTS`, which holds their
> built-in synth-pop demo song.** No error, no warning, a real song comes back; it is just not
> yours. Proved by posting both shapes with the same seed 42 and the same everything else: the
> returned PCM differs, so the conditioning differed. Now posts the object.
> **The identical fault was in `composeCaption` (Rewrite with AI) and both were fixed the same
> day. If a Gradio Space takes a state object, send the OBJECT.** Grep before claiming this class
> of bug is gone: `grep -n "JSON.stringify(state)" src/services/MusicService.js` must return only
> prose.
>
> **The "too many parts" warning was firing on ordinary songs.** `sectionBudget` was a hand-written
> ladder that allowed ONE section for a 30 second song, so a Verse plus a Chorus — 15 seconds each,
> the most normal thing there is — was called "more than will fit". Chris sent a screenshot. It is
> now arithmetic from the 15-second floor the comment already stated. It also fed `draftCaption`,
> so the same bug was telling the model "a single section, no intro or outro" while he had written
> two. **A warning that fires on merely tight instead of on impossible trains people to ignore it.**
>
> **Ghost Demo and the wizard had never been extended to the new tabs.** Ghost Demo covered 10 of
> 18 tabs — One Man Band and Chopped & Screwed, the two newest and hardest, answered "this tab uses
> Tips hover, no remote demo needed". Both now have full scripts (14 and 9 steps) with baked
> `am_adam` voice, and the two conditional targets in Screwed (the recordings picker, the slicer)
> are marked `optional` with `whenMissing` lines. The wizard covered 16 of 18 — **Stemmer and
> Chopped & Screwed had no card at all**, and One Man Band's card was `audio: null`, the one silent
> stop on the tour. Now 20 cards, every tab, clips 18/19/20 baked at 0.0 / 0.0 / 1.8% word error.
> **`main.js`'s voice-pack stem list was hardcoded to 17** — a card past that ceiling silently keeps
> the baked TTS no matter what he records, so it moves every time a card is added.
>
> **When a tab is added, four things need it, not one:** `App.jsx`, a wizard card + baked clip, a
> Ghost Demo script + baked voice, and the voice-pack ceiling in `main.js`.

> **CHOPPED & SCREWED** (after Mastering) slows a track until the pitch sinks and chops it on the
> beat, credited to DJ Screw on the tab. Has a canvas **slicer** you click to place your own chops,
> and a **subterranean sub** that follows the track's own low end rather than droning under it.
> All local, `OfflineAudioContext`.
>
> **241 genres / 82 moods / 66 voices** in `src/services/musicTaxonomy.js`, grouped. Every genre
> carries its real instrumentation and the caption writes it in — that is the whole point, because
> "Afrobeats" alone produces generic pop while "log drum bass, shakers" produces Afrobeats.
>
> **NO TAB HAS A BACKGROUND VIDEO ANY MORE.** Fifteen clips removed, including the header one at
> Chris's request. `PrismBackground.jsx` is a live WebGL shader on all 18 tabs; `TabBackground.jsx`
> wraps it and takes an optional still-art layer for hero tabs. Retired clips are kept at
> `V:ssets\lyricist-retired-video`, nothing destroyed.
> **The `.prism-bg` fill rule MUST stay in `index.css`.** It started life in `OneManBand.css` and
> so applied on exactly one tab; the other seventeen fell back to a default 300x150 canvas and
> looked black. A rule every component needs cannot live in one component's stylesheet.
>
> **PRISM** (`src/services/prismTheme.js`, started in `main.jsx`) rotates the whole interface AND
> the shader from one number. Settings writes `lyricistPrism` and fires `lyricist-prism`.
>
> **THREE BUGS A GREEN BUILD DID NOT CATCH, all found by opening the app and clicking:**
> a dead-on-boot ReferenceError (vite build passed happily), a stray `</video>`, and a wizard card
> with `audio: null` that killed the tour on card 3 because `hasAudio` is still true from the
> previous card for one frame. **A green build is not a working app.**

> **2026-08-15 — NO VIDEO IN THIS APP HAS AN AUDIO TRACK. Keep it that way.**
> Chris: *"NO SOUND ON ANY BACK GROUND VIDEO."* Muting the element is not enough — the tracks are
> stripped from the files (`ffmpeg -i in.mp4 -an -c:v copy out.mp4`). Eleven shipped clips still
> carried AAC when this was done. **Any new clip he hands in gets stripped before it goes in**, and
> the check is `ffprobe -select_streams a` over `src/assets`, `public/` and `splash/` — the archived
> masters in `src/assets/originals-video/` keep their audio and are never imported.
> The one sound the app may make on its own is a voice-over HE recorded (`<userData>\voice\`).

> **2026-08-15 — the splash waits for the whole clip, on purpose.** `reveal()` in `main.js` defers
> behind `splashHeld()` so a recorded voice-over is never cut off mid-sentence. Ceiling is 30s and
> every failure path passes `reveal(why, true)`. Don't "fix" the perceived slow start by making the
> splash close on ready-to-show again.

> **2026-08-08 — DO NOT REMOVE `'unknown'` FROM `provider.quantizations`.**
> `src/services/AIService.js` asks OpenRouter for unquantised hosts. Every first-party provider
> (Anthropic, OpenAI, Google) reports `quantization: "unknown"` because they serve their own weights
> and don't publish the precision. A list without `'unknown'` matches **zero endpoints for every
> paid frontier model** and the request dies with
> `No endpoints found for the request with quantization: ...`. `allow_fallbacks: true` does not
> rescue it — fallback only picks among providers that still pass the filter. That shipped, and it
> killed Ghost Rider and every other AI call on the paid model Chris runs as his number one, while
> still appearing to work on free/open-weight models. Fixed in build 058.

> **START HERE — WHERE THINGS LIVE**
>
> | | |
> |---|---|
> | **The app. All source. Work here.** | **`V:\src\Lyricist-4.0.0`** |
> | GitHub | `cfunkycreations-tech/Lyricist-4.0.0`, branch `main` |
> | Finished installers | `V:\Releases\Lyricist 4.2.0 Releases\` |
> | UI renders & exported art — **not code** | `V:\Lyricist 4.2.0 UI renders` |
> | TTS models — build-time only, never shipped | `V:\models\kokoro`, `V:\models\supertonic-2` |
>
> The folder is named `4.0.0`; the app is version **4.2.0**. Don't let that mislead you.
>
> **Run it:** `npm run dev` → http://localhost:5173
> **Build the installer** (stage on `D:` — `V:` is a ReFS Dev Drive electron-builder cannot
> rename directories on, and `C:` runs at ~1 GB free, which fails the pack step):
> ```
> LYRICIST_RELEASE_DIR="D:\lyricist-stage" npm run release
> ```
> then move the `.exe`, its `.blockmap` and the unpacked folder to `V:\Releases\Lyricist 4.2.0 Releases\`.
>
> **Re-record the wizard narration** after changing any card text:
> `python scripts/generate-wizard-audio.py --qa`
>
> **Who this is for:** Chris Funk / CFunky Creations LLC, Austin TX. The app is free, forever, for
> everybody — so **every dependency must be free**, and nothing may require an account the user has
> to pay to keep. Verify "free" before building on it. Read "The rules he has actually had to
> repeat" below before you write any code.


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
LYRICIST_RELEASE_DIR="D:\lyricist-stage" npm run release
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

### Done (as of build 4.2.0.057)
- **THE GARBLED LYRICS ARE FIXED — and the app caused them.** A song came back with two good
  sections and then thousands of tokens of subword salad, Cyrillic, Korean and programming
  vocabulary. His config was `deepseek/deepseek-v4-flash-0731` (a good model, correctly chosen),
  **temperature 1.2**, fusion ON with `nemotron-3-ultra-550b` and
  `nemotron-3-nano-omni-30b-a3b-reasoning`.
  - **The Creativity slider ran to 2.0 labelled "Wildly Creative".** Past ~1.1 a model samples from
    the tail of its distribution and the words break apart. He turned it up on the UI's own advice.
    Slider now stops at **1.1** (`MAX_TEMPERATURE` in `LyricStore.jsx`), the far label tells the
    truth, and a saved value above the ceiling is corrected on load.
  - **No `top_p` or penalties were being sent**, so a drifting model had nothing pulling it back and
    filled the whole token budget with wreckage. Now `top_p 0.9`, `frequency_penalty 0.3`,
    `presence_penalty 0.2`.
  - **Fusion blended the rubbish in.** Each draft went straight to the synthesiser, so a collapsed
    draft from the small reasoning model got merged into the final song. Drafts are now validated
    individually and bad ones dropped from the panel.
  - **`src/utils/lyricSanity.js` is the durable guard** — any model can fall over.
    `inspectGenerated()` scores non-Latin drift, fused tokens ("closedRock"), programming words and
    the loss of ordinary English; `truncateAtCollapse()` keeps the good opening and cuts the rubble.
    **Validated against the real bad output AND against deliberately-weird-but-intentional writing,
    which must keep passing — invented words, slang and a foreign phrase all score 0.00.** If you
    touch the thresholds, re-run that check or you will start deleting good lyrics.
  - **`lastGeneration`** (AIService) records the model OpenRouter actually served, the provider, and
    how many lines were dropped; Songwriter displays it. Before this there was no way to know which
    model wrote a song, which is why the cause took so long to find. Provider quantisation is
    pinned to unsqueezed builds — a heavily quantised MoE degrades the same way.
  - **Never silently overwrite the user's model.** The old config migration forced
    `model = 'openrouter/free'`, which is a router whose free pool contains three coding agents and
    a content-safety classifier. That is removed. Default is now a specific instruct model.
- **Upload your own lyrics** — Songwriter, "Already wrote a song?" with a labelled button and a
  paste box. It was a bare icon before and nobody could tell what it was for. Files with
  `[Verse]`/`[Chorus]` keep their sections; a plain song is split on blank lines.
- **Stems save as one group** — Export All used to fire one download per stem, 180 ms apart, so six
  to eight save prompts stacked up and the files scattered into Downloads. One click now writes them
  all to `Documents\Lyricist Stems\<song>\`, with an Open folder button. Browser gets a single .zip.

### Done (as of build 4.2.0.055)
- **The donation buttons work. They never had.** Fiverr, PayPal, Venmo, Cash App and Buy Me A
  Coffee all did nothing when clicked — no browser, no error. `setWindowOpenHandler` denied every
  window request that wasn't the visualizer popout, **and a `target="_blank"` link is a window
  request**. The URLs were right the whole time; nothing was ever allowed to open them. This is how
  Chris gets paid for a free app, so treat any breakage here as urgent.
  - http(s) links now go out through `shell.openExternal` — the user's own browser, where they are
    already signed in to PayPal or Venmo. The visualizer popout path is untouched.
  - A `will-navigate` guard was added too: a link **without** `target="_blank"` navigates the app
    window itself, which would replace the whole app with a web page and no way back.
  - **Any external link in this app depends on both paths. Test by clicking in the PACKAGED app** —
    in a dev browser these links just work, which is exactly how this went unnoticed for so long.
  - **No `data-help` on any of the six.** Chris: *"People know what the fuck they are."* A tooltip
    defining PayPal reads like the app thinks the user is stupid. Note `HelpLayer` resolves tips
    with `closest('[data-help]')`, so an ancestor's tip still fires on a child — removing the
    attribute from the button alone is not enough.

### Done (as of build 4.2.0.054)
- **COLLABORATION SHIPPED — peer to peer, joined with a code.** The thing he asked for twice.
  `src/components/Collab/CollabTab.jsx` + `src/services/collabSession.js`, tab id `collab`. Yjs
  CRDTs over y-webrtc (both MIT). Start a session → a 12-character code (no I/O/0/1, it gets read
  down a phone) → they type it in → both writing in the same text, merging live.
  - **No account, no server holding the song, nothing that can start charging.** A signalling
    server only introduces the peers. It never sees the code (room id = SHA-256 of it) and never
    sees the song (the code doubles as the room password, so signalling traffic is ciphertext).
    Free Google STUN. **No TURN on purpose** — a relay means someone else's server carrying the
    song, and a bill.
  - **Test it with two SEPARATE pages.** y-webrtc allows one peer per page and throws from inside
    an async key derivation, so a same-page test fails as an uncatchable unhandled rejection and
    proves nothing. Verified across two pages: concurrent edits merged (one rewrote line 1 while
    the other appended line 2, both survived), and a wrong code is fully isolated.
  - **CSP:** `connect-src` falls back to `default-src`, which has no `wss:`. Without the explicit
    `connect-src` added to `main.js`, collab works in the dev browser and silently dies in the
    packaged app. **Check any new network feature against that CSP.**
  - **The free signalling servers are dying** — of the three that used to be standard only
    `y-webrtc.fly.dev` and `y-webrtc-eu.fly.dev` still answer; `signaling.yjs.dev` no longer
    resolves. Both are probed on tab load, the UI says so plainly when unreachable (otherwise it
    looks identical to "nobody joined yet"), and a user can paste their own server under Advanced
    without a new build. If collab "doesn't connect", test those URLs first.

### Done (as of build 4.2.0.053)
- **The sample library takes uploads again, and the audio finally lives in its own store.**
  Chris: *"I can't upload either folders or files in my sample library."* The cause was mine —
  the 60 MB / 2 GB caps I added during the OOM fix, on a machine holding 12.3 GB.
  - **Those caps were the wrong fix.** The crash was never about how much was *stored*; it was
    `listSamples()` pulling every sample's audio through memory to read names. Now 1 GB per
    sample, 128 GB per library. **When you fix a root cause, go back and delete the guard you
    put in front of it** — it will outlive its reason and come back as a bug report.
  - **db v3 splits audio into a `blobs` store.** Sample rows are metadata only. A cursor over the
    samples store used to deserialize each record whole, so listing the NAMES of a 12 GB library
    read 12 GB off disk; listing 6 samples including a 200 MB one is now 1 ms. Old rows migrate
    when touched (`readBytes`) plus a background sweep (`migrateLegacyBlobs`) when the tab opens.
    Every read path handles both layouts, so a half-migrated library is fine. The upgrade
    deliberately does **not** rewrite rows inside `onupgradeneeded` — that transaction blocks the
    whole app and would freeze it on a big library.
  - **Import failures now name their reason on screen, in red.** The reasons were being collected
    into `res.errors` and thrown away, so a rejected import read "Added 0 samples · 412 failed".
    An empty selection says so too — silence is indistinguishable from a dead button.
  - **Add Files / Add Folder use Electron's own dialog now**, not `<input type="file">`. The
    permission handler here denied everything except `media`, and a blocked picker fails
    invisibly. Folder walking happens in main (subfolders, junk filtered) and files are read one
    at a time. `'fileSystem'` added to the allow-list. The input remains the browser fallback.
  - Restoring a backup never updated the running size total; it does now.

### Done (as of build 4.2.0.050)
- **Header art is three pieces now, not one strip, and the header height scales.**
  `header-banner.png` was a single 1880×440 strip carrying **534px of flat #020516 filler**
  between its three elements. That filler forced a 4.3:1 aspect, so fitting the strip into the
  width left beside the medallion collapsed its height — Chris rendered about a third as tall as
  the medallion. Chris: *"I should be as tall as that goddamn logo on the left, and everything
  else needs to be to scale."*
  - Sliced into `header-signature.png` (394×230), `header-chris.png` (244×440) and
    `header-wordmark.png` (768×403). Only empty filler was dropped — no artwork altered, and the
    original strip is still committed. The strip's background is `#020516`, the header's own
    colour, so the pieces are seamless.
  - **The header height is no longer a fixed 300.** Everything in the bar sizes off that height,
    so a fixed height forced the art to letterbox down on narrow windows while the medallion
    stayed full size — that mismatch *was* the bug. It is now
    `clamp(170px, calc((100vw - 210px) / 4.7), 300px)`; the 4.7 is the row's total width measured
    in header-heights (medallion 1 + signature 0.90 + Chris 0.55 + wordmark 1.75 + gaps) plus
    slack. Medallion and Chris are therefore the same height at every window width.
  - Relative scale comes from the source art: signature 52% of Chris, wordmark 92%.
  - **Don't put maxWidth caps on those images.** A cap letterboxes one piece and silently breaks
    the scale while `getBoundingClientRect().height` still reports the full box — measure the
    *visible* art (`min(rect.w/naturalW, rect.h/naturalH)`), not the box, or you will verify a
    layout that is actually wrong.

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
  Loop Station (see below) — *Album Architect was removed from the app on 2026-08-15*
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
`loop-station`. Still field-level only: Stemmer, Recording Booth, Mastering,
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

> Audited 2026-08-11 against the actual tree. Several items that sat here for days were already
> finished; they are struck through rather than deleted so nobody rebuilds them. **Verify before
> adding anything back to this list** — a stale "open" item costs a whole session.

- ~~**Quantum Lab top banner is REJECTED.**~~ **Built 2026-08-09.** He reversed the "guitar photo
  OUT" call and now wants the guitar shot IN. Built from his own art — `quantum-banner-bg.png`,
  `quantum-chris.png`, `quantum-medallion-glass.png`. Do not redesign it.
- ~~**Collaboration tab — HIGH PRIORITY.**~~ **Built 2026-08-07 (build 054)** — peer to peer with
  room codes, `src/components/Collab/CollabTab.jsx`. Free signalling servers keep dying; if it won't
  connect, check those first.
- ~~**Icon overhaul** — every flat icon out.~~ **Done 2026-08-10 (build 061).** 32 of his dichroic
  pieces keyed to transparent PNGs in `src/assets/icons/`, 17 wired into the tab bar.
- ~~**8 tab background videos still missing.**~~ **Down to one.** 16 of 17 tabs have a clip as of
  build 066. **Scratchpad is the only tab left with no background video.** Do not reuse the old
  deleted clips; ask him which of his renders it should get.
- **Footer art is wrong.** The current square medallion got squished into a 200×100 rectangle without
  his approval and he hates it. He is supplying replacement art. Keep the same box size; do not
  redesign around it.
- ~~**Paintbrush tool for the piano roll.**~~ **Done in 4.2.0.021.** The roll has four tools —
  Select (drag to move, drag the right edge to resize), Draw, Paint, Erase — snap from 1 bar down to
  1/32 with triplets, and a velocity lane under the grid. Right-click deletes a note; Delete removes
  the selection. Everything lives in `src/components/MidiStudio/Sequencer.jsx` with its CSS in
  `index.css` (`.seq-tool`, `.seq-vel-*`). Note the roll now holds a fixed C2–C6 / eight-bar minimum
  so the rows stop shifting under you as you write.
- **Drum machine with 808s.** A step-sequencer drum machine, 808 kit front and center. The sample
  library already handles user kits, so this can lean on `sampleLibrary.js` for custom sounds while
  shipping a stock 808 kit of its own.
- ~~**MIDI background video is missing**, along with several other tab videos.~~ **Landed in 064.**
  See the Scratchpad item above for the one that is genuinely still missing.
- **Visualizer quality.** 395 presets load, but Chris thinks the stock Butterchurn ones are mediocre.
  Wanted: a better library, or hand-built visualizers. Make them good.
- **Piano roll — what's still missing.** Drawing, dragging, snap and velocity all landed in
  4.2.0.021. Still not there: undo/redo on the roll, marquee multi-select, copy/paste of a run of
  notes, and a loop/playback region.
- **Drum machine needs per-key kit mapping** — one sample per key across a pad grid, not just one
  sample per track.
- **Ask him what "upload pixels" meant** for the drum machine. It was read as pattern presets and
  those were built — he may have meant artwork on the pads.
- **Splash screen not built.** Art is `V:\assets\Crystal_Geode_Cavern_QUANTUM_LAB_202608011431.jpeg`,
  but the note also says "wire the video into `main.js`" — **ask him: still image or video?** Then it
  plays before the main window shows.

### Background video: use the Vite import, never `public/`

Every background clip must be `import`ed so Vite emits it into `dist/assets/` with a resolved URL.
Build 063 shipped 17 tab videos read out of `public/` at runtime and **every one of them was a black
panel in the packaged app**, because the runtime-built path does not resolve there. 064 fixed it by
importing them (`src/components/common/TabVideoBg.jsx`). The header video hit the identical bug on
2026-08-11 — it was written as `src="./bg/header.mp4"` and was caught before it shipped; it is now
`import headerVideo from './assets/bg/header.mp4'` and `public/bg/` is gone.

`src/components/QuantumLab/QuantumLab.jsx` is the last holdout — it still builds its src from
`import.meta.env.BASE_URL` and reads `quantum_bg.mp4` / `quantum_bg_mobile.mp4` from `public/`.
Both files *are* present inside build 066's `app.asar` at `dist/`, and Chris has not reported that
banner going black, so **it is not confirmed broken — do not convert it blind.** If he ever reports a
black Quantum Lab background, that is the cause and the fix is a two-line import.

---

## Housekeeping

Commit early and often, in small readable commits — not one giant dump. Chris was rightly annoyed
that this repo sat at a single commit while a whole app's worth of work piled up uncommitted.
