# Handoff, 2026-10-10, branch `claude/push-performance` (draft PR #15)

Everything below is pushed to `claude/push-performance` and CI is green. It is
NOT merged into `main`. Chris gets it with:

```
git pull origin claude/push-performance
npm install
npm run release
```

## Start here: background music under the Ghost Demo

Chris made two beds in Suno for the Ghost's narration. They are prepared and in
the repo, **not wired up yet**:

| file | length | what it is |
|---|---|---|
| `src/assets/ghost-bg/ghost-bg-deep.mp3` | 39.4 s | dark sub-bass drone, slow swells every ~15 s |
| `src/assets/ghost-bg/ghost-bg-noir.mp3` | 27.4 s | noir trip-hop: soft drums, bass, keys |

Already done to them: the Suno hard cuts are trimmed off (deep stopped dead at
full volume mid-swell; noir had a clipped fragment of the next bar after a
gap), each fades out over its last natural decay (deep 35.2 to 39.4 s, noir
24.4 to 27.4 s, linear) to digital silence, 30 ms fade-in, and both are matched
to -20 LUFS (the originals were mastered to 0 dB and clipping). Sources are
Chris's uploads `deep.sub2.flac` and `noir.flac`, not in the repo.

To wire it, in `src/components/Onboarding/GhostDemo.jsx`:
- Import through Vite (`import.meta.glob` or a direct import), never `public/`.
  `public/` assets don't resolve in the packaged app (build 063's black panels).
- Start the bed when a demo starts and fade it out when the demo ends or stops.
- Duck it under the voice: the clip plays through `speak()` (`audioRef`), so
  drop the bed's gain while a clip is playing (roughly 0.15) and bring it back
  between lines (roughly 0.35). Ramp it, don't step it.
- Respect the existing voice/Ghost Demo toggles. Off means silent.
- **Ask Chris** which bed goes with which tab (deep for Black Hole Studios is
  the obvious guess) and what happens when a demo outlasts the track. The fades
  are baked in, so a plain `loop` dips to silence every 27 to 39 s. Either play
  it once, or crossfade two copies into each other. Don't decide silently.

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
