# VST3 host — build resume notes

Written 2026-08-28. The C++ hosting layer is **written but not yet compiled**,
because the machine had a pending Windows restart blocking the toolchain install.

## What is already done (committed to disk, no rework needed)

- `src/PluginHost.h` / `src/PluginHost.cpp` — **new**. The layer that never
  existed: loads a `.vst3`, keeps the instance alive in an
  `AudioProcessorGraph`, opens the plugin's real editor in a desktop window,
  routes hardware MIDI in and audio out, and reads/writes parameters.
- `src/IpcBridge.{h,cpp}` — extended with `plugin.*` and `audio.*` commands
  (`load`, `unload`, `showEditor`, `hideEditor`, `list`, `noteOn`, `noteOff`,
  `getParams`, `setParam`, `audio.start|stop|status`). Plugin calls hop to the
  message thread under a `MessageManagerLock`, since editors and the graph are
  not thread-safe.
- `src/Main.cpp` — constructs `PluginHost` and hands it to `IpcBridge`.
- `CMakeLists.txt` — switched `juce_add_console_app` to **`juce_add_gui_app`**
  (a console app has no message loop, so plugin windows cannot open), added
  `PluginHost.cpp`, and linked `juce_gui_basics` + `juce_gui_extra`.

## Steps remaining

1. **Reboot** to clear the pending servicing operation and the stuck `msiexec`.
2. Install the toolchain from an **Administrator** PowerShell:

   ```
   winget install --id Kitware.CMake --exact --silent ^
     --accept-package-agreements --accept-source-agreements

   winget install --id Microsoft.VisualStudio.2022.BuildTools --exact --silent ^
     --accept-package-agreements --accept-source-agreements ^
     --override "--quiet --wait --norestart --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
   ```

3. Configure and build (first run downloads JUCE 8.0.3 via FetchContent, so it
   takes a while):

   ```
   cd juce-backend
   cmake -B build -G "Visual Studio 17 2022" -A x64
   cmake --build build --config Release
   ```

4. The executable must land where `getJuceEnginePath()` in `main.js` looks:
   `juce-backend/build/LyricistEngine.exe` or
   `juce-backend/build/Release/LyricistEngine.exe`. The CMake default puts it in
   `build/LyricistEngine_artefacts/Release/` — copy it, or set
   `RUNTIME_OUTPUT_DIRECTORY` on the target.

## Renderer side, still to do after the build works

- `preload.js` exposes `sendJuceCommand(cmd, args)` -> `juce-command`, but
  **`main.js` has no `juce-command` handler that spawns the engine** — it only
  has `juce-spawn` / `juce-send`. Add a handler that lazily spawns the engine
  and correlates request ids to replies.
- `Vst3Browser.jsx` "+ Load" currently only records the plugin in DAWContext.
  Point it at `plugin.load`, then `plugin.showEditor` for the GUI button.
- **Delete the fake plugin window**: `main.js` `vst3-open-gui` builds a
  hand-written HTML mock that imitates a plugin UI. Once `plugin.showEditor`
  works, that handler should be removed entirely, not left as a fallback.

## Known caveat

ASIO is enabled in CMake (`JUCE_ASIO=1`) but the ASIO SDK is not vendored in
this repo. If the build fails on a missing `iasiodrv.h`, either drop
`JUCE_ASIO=1` (WASAPI still works fine) or place the Steinberg ASIO SDK where
CMake can see it.
