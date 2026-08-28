# Handoff — 2026-08-28, evening session

Written at the end of a session that did the git reconciliation and the first-ever
compile of the JUCE engine. **Read this before `NEXT-SESSION.md` or `AI_HANDOFF.md`
— both of those are stale** (see "Docs that will lie to you" at the bottom).

---

## THE ONE URGENT THING

**64 uncommitted entries are sitting in the working tree.** Last real commit of
source work is `0867866` (2026-08-28 14:40). Everything from 16:00–17:48 is unsaved:

- 49 modified files, **+2,686 / −905**
- 11 new untracked sources: `PluginHost.cpp/h`, `LyricMatrix.jsx/css`,
  `StyleMatch.jsx`, `RhymeService.js`, `AudioContextProvider.js`,
  `juce-backend/BUILD-RESUME.md`, and three `.agents/skills/` dirs
- `splash/` deleted (html, mp4, preload) — cleanly; `main.js` has no dangling refs

Chris was asked twice to green-light a commit and did not. **Ask once, then commit.**
Nothing else on this list matters if this work is lost.

---

## Git — reconciled, do NOT pull

Done this session: `git merge -s ours origin/main` → merge commit **`a14903d`**.

State now: **behind 0, ahead 16.** A push is a plain fast-forward, no `--force`.

Why `-s ours` was correct, so nobody undoes it:

- Local lineage `8b2d467` was **already inside** `origin/main` via PR #3.
- The repo has **two root commits** (`9cebb21`, `716a424`), which is why
  `ahead 15 / behind 10` looked like a fork it wasn't.
- Direction `HEAD → origin/main` is **423 files, +1,861 / −68,629**. Pulling
  *deletes the DAW* — ~16,000 lines under `src/daw` alone.
- The only file origin had that we lacked is `src/components/common/PrismBackground.jsx`,
  imported nowhere. Dead.
- The `@vitejs/plugin-react` bump was the one thing worth having and we already
  have it (`vite ^8.1.3`, `@vitejs/plugin-react ^5.2.0`).

The merge left the working tree **byte-for-byte identical** (tree hash
`103f95a0d5e4a8a8f4d04c2f9f96fc36a9b71a35` before and after). All 64 dirty
entries survived it.

> **To undo the merge, use `git reset --soft ORIG_HEAD`. NEVER `--hard`** — that
> takes the 64 uncommitted files with it.

---

## Build toolchain — already solved, don't reinstall

`BUILD-RESUME.md` says to `winget install Kitware.CMake`. **Don't.** CMake ships
inside VS Build Tools, which is installed:

```
C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe
```

Ninja is next to it. MSVC is `14.44.35207` / cl `19.44.35228.0`. The reboot
`BUILD-RESUME.md` asks for already happened (2026-08-28 17:50).

Configure and build:

```
& "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe" `
  -S "V:\src\Lyricist-4.2.0\juce-backend" -B "V:\src\Lyricist-4.2.0\juce-backend\build" `
  -G "Visual Studio 17 2022" -A x64

& "...\cmake.exe" --build "V:\src\Lyricist-4.2.0\juce-backend\build" --config Release --parallel
```

Configure already succeeded (103.9s, JUCE 8.0.3 fetched into `build/_deps/`).

---

## Changes made this session (all uncommitted)

### `juce-backend/CMakeLists.txt` — 3 edits

1. **ASIO made conditional.** Was hard `JUCE_ASIO=1`, which forces
   `juce_audio_devices` to include `iasiodrv.h` from the Steinberg SDK — **not
   vendored, and not anywhere on this machine** (verified). That build fails
   *late*, after the whole JUCE download. Now gated behind
   `-DASIO_SDK_DIR=<path to sdk>/common`.

   > **⚠ THIS IS UNFINISHED, NOT A DESIGN CHOICE.** The current binary has ASIO
   > compiled **out**, and that is not acceptable as a final state. Chris has
   > **three registered ASIO drivers** — `FlexASIO`, `Yamaha Steinberg USB ASIO`,
   > and `Ableton Push` — and FlexASIO is deliberate: commit `0867866` added
   > FlexASIO attribution. **ASIO is the point, not a nice-to-have.**
   >
   > It shows in the smoke test: `asio.enumerate` returned only
   > `Speakers (JBL Bar 2.1)`, `Speakers (5- Logitech USB Headset)`,
   > `Primary Sound Driver` — all WASAPI/DirectSound. **None of the three ASIO
   > drivers appeared**, because the host support isn't compiled in.
   >
   > To finish: get `iasiodrv.h` from Steinberg's ASIO SDK (free, license
   > acceptance required — **Chris's call, don't do it for him**), then
   > reconfigure with `-DASIO_SDK_DIR=.../common`. Configure prints
   > `ASIO SDK found … ASIO enabled` when it takes. **Gitignore the vendored
   > SDK** — it has redistribution terms and this repo is public with a
   > commercial EULA.

   `AsioDriver.cpp` never includes the SDK itself — it asks for the `"ASIO"`
   device type by string and falls back — so no code changes when it's enabled.
2. **`juce_generate_juce_header(LyricistEngine)` added.** `Main.cpp` includes
   `<JuceHeader.h>`, which modern JUCE CMake does not generate by default. Every
   other source uses modular includes. Without this: `C1083`.
3. **Post-build copy added.** `PRODUCT_NAME "Lyricist Engine"` makes JUCE emit
   **`Lyricist Engine.exe`** (with a space) into
   `build/LyricistEngine_artefacts/Release/`. But `getJuceEnginePath()` at
   `main.js:1195` only ever looks for **`LyricistEngine.exe`** at
   `build/` or `build/Release/`. It would have compiled fine and then reported
   "LyricistEngine.exe not found" forever. Post-build copy lands it at the exact
   path main.js checks.

### `juce-backend/src/AsioDriver.{h,cpp}` — 2 compile fixes

Both were latent bugs in code that had **never once been compiled**:

4. `deviceManager.createAudioDeviceTypesIfNeeded()` → **private in JUCE 8** (C2039).
   Replaced with `deviceManager.getAvailableDeviceTypes()`, the public call that
   triggers the same lazy init.
5. `enumerateDrivers()` was marked `const` but calls non-const
   `getAvailableDeviceTypes()` and mutating `scanForDevices()` (C2662). Dropped
   the `const` in both `.h` and `.cpp`. Safe: `IpcBridge.h:61` holds a **non-const**
   `AsioDriver&` and already calls non-const `openDriver`/`closeDriver`.

### `juce-backend/src/Main.cpp` — 1 compile fix

6. `LyricistEngineApp` was **abstract** (C2259) — it derives from
   `juce::JUCEApplicationBase`, not `juce::JUCEApplication`, so it gets no default
   implementations. `suspended()` and `resumed()` are pure virtual there and were
   never implemented, so `START_JUCE_APPLICATION` could not instantiate it. Added
   both as no-ops (the engine is a background audio host with no lifecycle work
   on suspend/resume).

### Build progress — three rounds, converging

| round | result |
|---|---|
| 1 | C1083 `JuceHeader.h`; C2039 `createAudioDeviceTypesIfNeeded`; C2662 const `getAvailableDeviceTypes` |
| 2 | those three gone → C2259 `LyricistEngineApp` abstract |
| 3 | **SUCCESS — exit 0.** `LyricistEngine.exe`, 4.4 MB, at `build/Release/` |

Every error so far has been a latent bug in code that had never been compiled, not
a toolchain problem. Expect possibly more of the same in `IpcBridge.cpp`,
`Vst3Scanner.cpp`, and especially `PluginHost.cpp` (written today, never compiled).
Keep going — the pattern is small API-drift fixes against JUCE 8, one round at a time.

Check the result with:

```
Get-ChildItem "V:\src\Lyricist-4.2.0\juce-backend\build\Release\LyricistEngine.exe"
```

No `LyricistEngine.exe` had ever existed anywhere on `V:` before tonight — verified
by full-drive search — so **this is the first successful build of the engine, ever.**

### Smoke test — partial, do not over-read it

Launched the exe directly and wrote `{"cmd":"asio.enumerate","reqId":1}` to its stdin.

- **It launches and stays alive** (process ran until killed). It does not crash on
  startup, so `initialise()` — which constructs `AsioDriver`, `Vst3Scanner`,
  `PluginHost`, `IpcBridge` and calls `ipcBridge->start()` — completes without
  throwing. That is real and worth knowing.
- **No stdout reply arrived within 6s.** *Unconfirmed either way* — the read used
  `StandardOutput.Peek()`, which is an unreliable way to poll a child process, and
  the app is now a `juce_add_gui_app` with a message loop. **This is NOT evidence
  the IPC is broken.** Redo it properly with an async `ReadLine` before drawing any
  conclusion.

That test is the right next move, because it isolates the engine from all three
renderer bugs below.

---

## The renderer CANNOT talk to the engine yet

`BUILD-RESUME.md` understates this. It says "main.js has no `juce-command` handler."
It has one, added at 16:05 today — **but it is a stub** (`main.js:1583`):

```js
ipcMain.handle('juce-command', async (_event, { cmd, args }) => {
  return { ok: true, cmd, args };
});
```

It echoes its own arguments. Never spawns the engine, never writes to it, never
correlates a reply. Every call returns `ok: true` having done nothing — worse than
a missing handler, because the UI reports success.

Two more, stacked under it:

- **The two callers disagree about the signature.** `preload.js:113` is
  `(cmd, args) => invoke('juce-command', { cmd, args })` — two positional args.
  `JucePluginWindowManager.js` calls it correctly. But `JuceBridge.js:48` passes a
  single object: `sendJuceCommand({ cmd, reqId: id, ...payload })`, so `cmd`
  receives the whole object and `args` is `undefined`. One of the two bridges is
  wired backwards.
- **`JuceBridge` can never resolve.** `_sendCommand` parks a promise in
  `pendingRequests` and only resolves it from `_handleEngineMessage` via
  `onJuceMessage`. But `juce-command` is an `invoke` — its return value is
  discarded — and `juce-message` events only come from the readline loop in the
  `juce-spawn` path, which nothing here starts. No timeout, no reject. **Every
  JuceBridge call hangs forever** and the Map grows.

So the remaining work is a real IPC layer: spawn-on-demand, write JSON lines to
the engine's stdin, correlate `reqId` against the readline replies, and a timeout.
Not the one-liner the notes imply.

Then, from `BUILD-RESUME.md` and still true:
- Point `Vst3Browser.jsx` "+ Load" at `plugin.load`, then `plugin.showEditor`.
- **Delete the fake plugin window**: `main.js` `vst3-open-gui` builds a hand-written
  HTML mock imitating a plugin UI. Remove it entirely once `plugin.showEditor`
  works — do not leave it as a fallback.

---

## Docs that will lie to you

- **`NEXT-SESSION.md`** — 2026-08-22, build 132. Pre-DAW.
- **`AI_HANDOFF.md`** — status audited 2026-08-11 at build **057**, and its "Open"
  list describes the *old tabbed app* (Quantum Lab banners, tab background videos,
  piano roll). Current build is **143**, version 4.2.0, single-window DAW.
  Its layout rules and hard-won gotchas are still good; its status is not.
- **`juce-backend/BUILD-RESUME.md`** — written 17:46 today, already outdated on two
  points: the reboot happened, and the `juce-command` handler exists (as a stub).

Minor: `release/` holds only `win-unpacked.tmp` from an interrupted 14:45 package run.
`V:\new website\` contains exactly one file, `.claude\settings.local.json` — that
project has not started; the current site is `lyricist-site/` in this repo.

Also benign but noted: JUCE warns `JUCE_BUNDLE_ID` contains spaces
(`com.Funk Audio Flow OpSec.LyricistEngine`), from `COMPANY_NAME`. Cosmetic on
Windows; would matter for a macOS build.
