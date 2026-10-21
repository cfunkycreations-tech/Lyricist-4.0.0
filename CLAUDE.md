# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Working rules

- Chris is on a phone. Be terse. Don't explain why things failed — fix them. Don't waste tokens.
- Tab/product name is **Black Hole Studios**. Never show `onemanband-*` ids to him.
- Follow `.claude/skills/pro-tips/SKILL.md`: proactively mention a useful Claude Code slash command (one line) whenever it would save him time or tokens. Offer `/compact` when the session runs long.
- Never write or suggest these words in lyrics, topics, prompts or examples: neon, midnight, rain, heartbreak, cold coffee, shadows, whispers, echoes, sparks, cage, gravity, chains, storm. The app's list is `src/services/cliches.js`.
- Lyricist Pro is **$19.99 once** on Gumroad (https://funkycreations.gumroad.com/l/lyricist-pro). Never call the app free, free forever, always free, or "stays free" — not in copy, comments, docs or release notes. Free *dependencies* (OpenRouter key, Kaggle, free cloud) are fine to describe as free.
- Superpowers skills (`.claude/skills/`, MIT, github.com/obra/superpowers) are for real code work: debugging, plans, tests, reviews. These rules beat them: no brainstorming question rounds when the ask is clear, no TDD or worktree ceremony on copy, store or one-line jobs, replies stay short.
- Every tab's workflow must be intuitive, on desktop and on the phone held upright: one scroll per tool (no half-screen boxes scrolling on their own), the main action obvious, nothing sliding sideways, no cryptic boxes nobody can name. Check every tab you touch at phone size before shipping.
- Image, video or shot-list prompts for content: follow `.claude/skills/content-prompts/SKILL.md` exactly (still + video per shot, 8-10 shots, prompts written to the AI, full character block in each).

- **Cinema 4D 2026.3.2: Standard renderer and Standard materials only.** Never use, assume, suggest or mention Maxon's other renderer or its nodes, materials or cameras in any C4D script, doc, note or reply. Every C4D script forces `RDATA_RENDERENGINE_STANDARD`.
- **Never nudge Chris to merge an open PR.** He merges only when he says so, after testing. Push fixes to the PR's branch and leave the PR a draft.

## Commands

No test runner, no linter. The checks are hand-written Node scripts that each prove one class of ship-breaking bug offline.

```bash
npm install                 # postinstall copies basic-pitch model + onnxruntime, fetches the voice model
npm run dev                 # = dev:creator (Vite + VITE_FAFO_INTERNAL_BUILD=true)
npm run dev:customer        # plain vite, creator tools hidden
npm run build               # copy:model + copy:ort + fetch:voice + vite build -> dist/

npm run preflight           # duplicate ipcMain handlers, preload channels with no handler. Run before any release.
npm run check:ghost         # Ghost reply parser + action bus, offline
node scripts/seed-check.mjs         # seeds must fit int32
node scripts/song-payload-check.mjs # song/caption leave the app in the right fields
node scripts/find-cycles.mjs        # circular imports
node scripts/test-bank.mjs <file.sf2> [bank]   # render every SF2 preset, prove it makes sound

npm run release:customer    # preflight + NSIS installer (customer edition)
npm run release:creator     # creator edition
npm run build:web           # trimmed PWA bundle -> dist-web/
npm run deploy:web          # build:web + upload to Cloudflare Pages (lyricist-pro)
node scripts/publish-release.mjs   # publish the newest build to the public releases repo
npm run publish:update      # push that build to everyone who already has the app
```

Run a single check by calling its `.mjs` directly — that is the unit of testing here.

**Build numbers.** `build-number.txt` holds the *next* build number and drifts badly from the installers on disk, because releases are built locally and the file is not always committed. Before a release, check the newest `Lyricist 4.2.0.NNN Setup.exe` in the release folder and set the counter past it. A published build whose number is lower than one already out breaks update ordering.

**Release folder.** `release.mjs` defaults to `~/Desktop/New Releases for Lyricist Pro`, but `publish-release.mjs` defaults to `V:/Releases/Lyricist 4.2.0 Releases`. Set `LYRICIST_RELEASE_DIR` to the same path for both or publishing will not find the build.

## Architecture

**Electron + React 18 + Vite desktop app** (`package.json` `main: main.js`), Windows/NSIS. Also builds a PWA (`src/web`, `public/pwa`, `scripts/build-web.mjs` -> `dist-web/`, deployed to Cloudflare Pages).

- `main.js` — Electron main process, ~68 `ipcMain.handle` channels grouped by domain (`kaggle:*`, `ghost:*`, `pilot:*`, `juce:*`, `comfy:*`, `caption:*`, `demucs:*`, `save:*`, `voice:*`, `songs:*`). Heavy integrations live in sibling top-level modules it requires: `demucsLocal.js`, `comfySetup.js`, `kaggleCloud.js`, `captionSkill.js`, `licenseCheck.js`, `desktopUpdate.js`.
- `preload.js` — the only bridge. Every `ipcRenderer.invoke` here needs a handler in `main.js`; `preflight.mjs` enforces that pairing, and a channel registered twice kills the app at launch.
- `src/App.jsx` + `src/components/<Tab>/` — one directory per tab.
- `src/context/LyricStore.jsx` — the shared lyric/song store.
- `src/core/` — the pure, no-IO lyric engine (`rhyme`, `rhymeGraph`, `arpabet`, `syllabify`, `scorer`, `constraints`, `dna`, `lattice`, `superposition`, `entanglement`, `automata`, `fill`). Keep it free of Electron and network calls.
- `src/services/` — everything with IO or state: model clients, the Ghost subsystem, audio engines, stem separation, theming, `collabSession.js` (yjs + y-webrtc), `cliches.js`.
- `src/web/` — the phone/PWA shell: `PurchaseLock.jsx` (the $19.99 gate), `PhoneInvite`, `NetStatus`, `DesktopUpdate`, `iosAudio.js`, `iosSave.js`, `registerPWA.js`. **A web build without `PurchaseLock` gives the app away — never ship one.**
- Sub-projects with their own builds: `juce-backend/` (C++/CMake), `lyricist-relay/` (Cloudflare Worker), `lyricist-site/`, `server/`, `modal/`, `resources/*.ipynb`.
- Kaggle notebooks under `resources/` are tooling, not app code. Only `kaggle-minimax-music3.ipynb` and `kaggle-lyric-video.ipynb` ship, as `extraResources`.

## Cinema 4D scripts (`scripts/*_c4d.py`)

Run in C4D: Extensions -> Script Manager -> File -> Load Script -> Execute. Console `Shift+F10`, render `Shift+R`. Each script replaces its own top-level null group (`GROUP_NAME`) on re-run, so re-executing is safe.

`scripts/splash_c4d.py` is the reference implementation. Conventions every script follows:

- Module-level CONFIG block: `GROUP_NAME`, `TEX_FOLDER`, `OUTPUT_PATH`, `RES_X`/`RES_Y`, `FPS`, `FRAMES`, `START_FRAME`.
- `START_FRAME` resumes a crashed render — raise it to the first missing frame, re-run, `Shift+R`. Finished frames are kept.
- **Safe setters**: `put()` / `put_either()` / `_try()` / `const()` resolve parameter ids by name and append to a module-level `SKIPPED` list instead of raising when this C4D version refuses a parameter. Never set ids directly.
- The look comes from a companion `*_textures.py` image loaded into the **Environment** channel of a near-black Standard material — chrome reflection with no sky and no ray tracing.
- `configure_document()` forces `RDATA_RENDERENGINE_STANDARD`.
- Loops are seamless; `out_cubic` / `out_back` / `in_out_sine` / `ease` / `pop_in` plus `set_keys()` do the keyframing.
- Every script ends with `if __name__ == "__main__": main()`.

Two traps confirmed in Cinema 4D 2026.3.2:

- **Textures are cached by file path for the whole session.** Regenerating an image and re-running the script renders the *old* picture. `MSG_UPDATE`, clearing and restoring `BITMAPSHADER_FILENAME`, `MSG_FLUSHDOCUMENTCACHES` and `FlushUnusedTextures()` all fail to clear it. The scripts work round it with `fresh_copy()`, which hands the shader a copy named after the source's timestamp and size.
- **Aim cameras with a Target tag** (`Ttargetexpression`), never by setting pitch by hand — a sign error there puts the subject off the edge of the frame.
- Parameter names move between versions: 2026 has `MG_RADIAL_AXIS` (value `MG_RADIAL_AXIS_XZ`), not `MG_RADIAL_PLANE`.

Never call `KillDocument()` on the active document and then force a redraw — it crashes Cinema 4D in `drawport_directx`.
