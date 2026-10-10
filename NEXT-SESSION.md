# Handoff, 2026-10-10, branch `claude/push-performance` (draft PR #15)

Everything below is pushed to `claude/push-performance` and CI is green. It is
NOT merged into `main`. Chris gets it with:

```
git pull origin claude/push-performance
npm install
npm run release
```

## Start here: background music under the Ghost Demo

Three beds, all prepared as seamless loops, **not wired into GhostDemo yet**:

| bed | loop | what it is |
|---|---|---|
| `ghost-bg-blackhole.mp3` | 46.6 to 107.4 s (60.8 s), intro plays once | Chris's 2-min Suno song `blackhole.flac` |
| `ghost-bg-deep.mp3` | 8.0 to 24.0 s (16.0 s) | dark sub-bass drone |
| `ghost-bg-noir.mp3` | 4.3 to 23.1 s (18.9 s) | noir trip-hop |

All in `src/assets/ghost-bg/`, loop points in `beds.json`. Made by
`scripts/prepare-ghost-bed.py <file> <name> [--usable-end SEC] [--xfade SEC]`:
it finds the longest loop whose ends match in spectrum, rhythm and level
(within 1 dB), aligns transients to the sample, bakes a correlation-compensated
crossfade before loopEnd (plus a 60 ms guard after it), levels the intro to the
loop, and matches the loop to -20 LUFS. **More tracks are coming from Chris:
run the script on each, nothing else to do for the files.** deep/noir were
re-made from their earlier committed mp3s (usable to 35.2 / 24.4 s).

Chris's answers: any bed on any tab is fine, loop them, use as much of each
file as needed. (blackhole on Black Hole Studios is the natural pick.)

Still open:
- Play through Web Audio: `AudioBufferSourceNode` with `loop`, `loopStart`,
  `loopEnd` from `beds.json`, `start(0, 0)`. Load with the fetch-then-XHR
  fallback (`getBuffer()` in `soundfontEngine.js`), since the packaged app is
  on `file://`. Import the mp3s through Vite, never `public/`.
- Duck under the voice (`audioRef` play: ~0.15, pause/ended: ~0.35, ramped,
  `cancelScheduledValues` first). Pause holds the bed. Voice Off = silent.
  Fade out from the unmount cleanup; guard the async decode against
  StrictMode's double mount (check the run id before starting).
- Verify the seams in Chromium (playwright 1.56.x): render two cycles through
  OfflineAudioContext and check for clicks or level steps at loopEnd. This
  also shows whether Chromium strips the MP3 encoder delay (the guard covers
  up to 60 ms either way). Not done yet.
- Nobody has listened to the loops. blackhole wasn't checked for vocals.

## What else landed this session

- **Ghost Demo, Black Hole Studios:** back to the original Ghost voice (the
  `bd197ee` Gemini Algieba clips). Chris's Suno takes from `f518813` didn't fit
  and are out. The bubble text was restored with them, and every clip was
  transcribed and checked against its bubble (all match at 0.90+).
- **Black hole in the Black Hole Studios header** (`src/assets/blackhole/`): a
  10 s seamless VP9 WebM with alpha, plus a still for reduced motion. It's
  Gargantua / Grok-logo style: a round shadow cut along the disc's inner rim,
  the lensed arc over the top only, ending on the rim. **Not Saturn.** Chris
  rejected a full ring around the shadow. It sits in its own column right of
  the wordmark with Simple / Full Control under it, as big as the row allows.
  Chris: "as big as you can make it without covering anything up."
  - Re-render with `scripts/blackhole_render.py` (numpy, about 1 min). Textures
    come from `scripts/blackhole_textures.py` into `scripts/blackhole_tex/`.
    `scripts/blackhole_c4d.py` is the same rig for Cinema 4D, but Chris's C4D
    crashes around frame 55 and he had to resume it about five times, so use
    the numpy renderer.
- **Sample packs** in `sample-packs/`: sitar notes (dry and ringing), Slow
  Thump, Thump Loops 2, Thump BPM packs (90 to 140), Vinyl Crackle (two),
  Dry Room Snaps (two), Stereo Sub-spread, and Snaps BPM packs (90 to 140).
  Imported through Black Hole Studios → Sample Library.

## Not verified by anyone with ears or a Windows box

- The piano roll sound fix (`getBuffer()` XHR/fetch fallback in
  `src/services/soundfontEngine.js`). Chris hasn't confirmed sound is back.
- None of the sample packs were auditioned. The Snaps BPM bases (Snaps_3 = 120,
  Snaps_4 = 108) are detected values, and those loops aren't cut on bar lines.

## Standing rules from Chris

- Don't merge PR #4. PR #6 (Modal) is on hold. LUIS standalone is paused.
- Don't touch the Ghost-job slowness fix without his go.
- Keep "neon rain, midnight, heartbreak" in Render 7 and in the demo's typed
  keywords. The Ghost voice is slow and theatrical.
- Be concise. Don't explain why something failed, just fix it. One-line pro tips
  are welcome, but don't repeat them.
- He builds and runs on Windows at 150% display scaling. A 1789px screenshot
  from him is about a 1193px-wide CSS viewport.

## Sandbox gotchas this session

- `pkill -f "vite preview"` matches its own shell and kills the command. Use
  `kill $(pgrep -f "[v]ite preview")`.
- Playwright needs `playwright@1.56.x` for the preinstalled chromium-1194.
- Speech-to-text: huggingface.co is blocked. Moonshine tiny ONNX ships inside
  the npm package `@moonshine-ai/moonshine-js` and runs with the PyPI package
  `useful-moonshine-onnx`. That's how the Ghost clips were checked against
  their bubbles.
- Uploads over about 30 MB fail. Have Chris split zips.
