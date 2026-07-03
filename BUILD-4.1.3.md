# Lyricist 4.1.3 — What's New & How to Build

## New in 4.1.3
- **Header fix** — window title and header now read Lyricist 4.1.3, title set in **Rubik Glitch** (Google Fonts, with bundled Audiowide fallback offline).
- **Persistent Suno Player** — sticky player above the footer, mounted outside tab routing so playback never interrupts while navigating. Upload local Suno files or paste stream URLs.
- **Song Forge image-to-image** — "Upload Reference Image" in Song First mode. Your image becomes Nano Banana's base layer; the circular medallion + neon magenta/orange glow frame is always enforced (`MANDATORY_MEDALLION_FRAME` in GeminiService.js).
- **MIDI Studio tab** — upload audio or record a voice memo → Spotify's open-source `basic-pitch` converts it to editable MIDI **locally, fully offline** → piano-roll sequencer (play, tweak, export .mid/.json) → **Butterchurn** (Milkdrop 2 WebGL) visualizer wired to the same audio bus as the Suno player.
- **Recording Booth tab** — record harmonica, guitar, or vocals straight into the app with a live input meter (processing disabled so instruments keep their tone), or upload existing takes. Everything is saved to a persistent local library (IndexedDB — survives restarts). From the library, one click sends a take to the persistent player (loops under your writing session on any tab), converts it to MIDI in MIDI Studio, or exports it as .wav (Documents\Lyricist Recordings on desktop).
- **Mastering Studio tab** — the finish line. Pull songs from the Booth library or upload them (up to 12), drag into running order, and master every track through a real offline chain: 3-band EQ → glue compressor → limiter → loudness normalization (peak-capped at -1 dBFS). Five presets plus custom sliders, per-track Raw/Mastered A/B preview with before/after loudness stats. Add the album cover by upload or AI generation (medallion frame optional), then **Export Album** writes numbered mastered WAVs + cover.png + tracklist.txt into `Documents\Lyricist Albums\<album name>`. Title/artist/genre prefill from Album Architect.
- **AI Tools Hub tab** — share, upvote, and browse free AI tools.
- **Album Architect tab** — "The Universal Solvent" view: up to 12 tracks, drag-and-drop reordering, global metadata (title, artist, genre, master tempo, concept), tracklist export.

## Build & package (Windows)

```bash
# 1. Install the new dependencies (butterchurn, basic-pitch, presets).
#    postinstall auto-copies the basic-pitch model into public/models/.
npm install --legacy-peer-deps

# 2. Run in development (Vite + Electron in two terminals)
npm run dev
npm run electron

# 3. Compile the standalone desktop executable
npm run dist          # = copy model + vite build + electron-builder (NSIS installer)
npm run pack          # unpacked build in release/win-unpacked for quick testing
```

The installer lands in `release/` as before.

`--legacy-peer-deps` is only needed because `@vitejs/plugin-react@4` hasn't declared Vite 8 in its peer range yet — the combination builds fine.

## Optional: hosted-web MIDI backend
The desktop app converts audio→MIDI locally and does **not** need a server.
For a hosted web deployment, the mapped API route lives in `server/`:

```bash
cd server
npm install
npm start             # POST /api/convert-midi on :5180
```

Frontend fallback: `convertAudioToMidiViaApi()` in `src/services/MidiService.js`.
