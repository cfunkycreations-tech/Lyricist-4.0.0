# Lyricist DAW project — archived 2026-09-12

Zipped and taken out of the tree at Chris's request: the single-window DAW
layout replaced the eighteen-tab UI without a plan behind it, and the tabs are
now the app again (see the note at the bottom of `src/App.jsx`).

**Nothing here was thrown away.** `lyricist-daw-project-2026-09-12.zip` holds
the whole thing, and it is all in the git history as well.

## What is in the zip

| Path | What it was |
| --- | --- |
| `src/daw/` | The DAW UI: transport bar, sidebar, centre canvas (Timeline Arranger, Lyric Forge, Mixer Console), bottom dock, the VST3 chain panels, EULA modal, settings, export. 111 files. |
| `src/components/MainLayout.tsx` | The Tauri shell that `src/main.jsx` used to render — transport, VST3 library, lyric editor, track management. |
| `src/store.ts` | Its zustand store (transport state, active tracks, lyrics). |
| `juce-backend/` | The JUCE/C++ audio sidecar, **including the Steinberg ASIO SDK integration** (`src/AsioDriver.cpp` / `.h`) that took real work to get FlexASIO, Yamaha and Push all enumerating. This is the piece worth keeping. |
| `src-tauri/` | The Tauri desktop shell, capabilities and icons. |

## Bringing any of it back

Unzip into the repo root — every path in the zip is already repo-relative, so
it lands where it came from. Then:

1. `src/main.jsx` renders `<App />`; `src/App.jsx` renders `<MainLayout />`
   (the tab strip). Point whichever one you want at whatever you restore.
2. **The Tauri dependencies are gone from `package.json`.** `@tauri-apps/api`,
   `@tauri-apps/cli` and the `tauri` script were all removed, and
   `package-lock.json` was regenerated without them (245 lines lighter).
   Restoring the Tauri side means adding those back and running an install.
   The JUCE backend needs no npm dependency — it builds through CMake.

## Why it went

Chris, 2026-09-12: *"there was no plan with that other app."* The next attempt
at a DAW view starts from a plan. A dead UI left switched off but still
compiling is worse than one in a zip: every later change has to keep it
building, and nobody remembers why.
