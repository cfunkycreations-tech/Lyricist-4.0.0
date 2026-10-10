# Handoff, 2026-10-10 (PR #15 merged into main)

Everything below is on `main` (PR #15). Chris gets it with:

```
git pull origin claude/one-build
npm install
npm run release
```

One build (branch `claude/one-build`): `npm run release` and `npm run dev`
now include Ask the Ghost, the Ghost Pilot and the native engine. The
stripped installer for other people is `npm run release:customer` /
`npm run dev:customer`.

## Ghost Demo background music (wired)

Three beds play under the Ghost Demo as seamless loops:

| bed | loop | what it is |
|---|---|---|
| `ghost-bg-blackhole.mp3` | 46.6 to 107.4 s, intro plays once | Chris's 2-min Suno song (Black Hole Studios) |
| `ghost-bg-deep.mp3` | 8.0 to 24.0 s | dark sub-bass drone |
| `ghost-bg-noir.mp3` | 4.3 to 23.1 s | noir trip-hop |

- `src/services/ghostBed.js` plays them through Web Audio (`loopStart` /
  `loopEnd` from `beds.json`), loaded with the file://-safe `getBuffer()`
  (now in `src/services/loadBuffer.js`). Black Hole Studios gets blackhole;
  every other tab gets a fixed pick by tab id (Chris: any bed on any tab).
- GhostDemo: starts with a real walkthrough, ducks to 0.15 while the Ghost
  talks and 0.35 between lines, Pause holds it, its own **Music On/Off**
  button (remembered), fades out on finish, Stop, tab change or close.
- **New tracks from Chris:** `python scripts/prepare-ghost-bed.py <file> <name>
  [--usable-end SEC] [--xfade SEC]`. It writes the mp3 and the `beds.json`
  entry; the next build picks it up. Add it to `BED_FOR_TAB` in `ghostBed.js`
  only if it belongs to one tab.
- Checked in Chromium: seams render with no clicks at 48 kHz, Chromium trims
  the MP3 padding exactly, and the demo run shows the loop points, the ducking
  and the toggles working. Nobody has listened yet; blackhole wasn't checked
  for vocals.

## OpenRouter: official SDK, live model check, app attribution

- Every OpenRouter call goes through `src/services/openrouter.js`, built on
  `@openrouter/sdk`. Callers still write the wire-format body; it's sent through
  the SDK's beforeRequest hook as-is, because the SDK's typed request drops
  `reasoning.exclude` and its parsed result drops `provider`. Callers get
  OpenRouter's raw JSON and status back. SDK retries are off (the Ghost needs
  a fast 429).
- Attribution on every request: `HTTP-Referer: https://cfunkycreationsllc.com`
  and `X-Title: Lyricist Pro`. Before this it was split
  across lyricist.app / fafoaudio.com and five names. Change both in one place.
- `stealth/space-bunny-alpha` is real (OpenRouter's stealth page, listed
  2026-09-23, free). "No endpoints found" for it means the account's privacy
  settings exclude its only provider (stealth models log prompts; ZDR or
  "no logging/training" blocks it), not that it's gone. The app now says so
  (`noEndpointsHelp()`), the picker adds stealth ids only once OpenRouter
  confirms them, and nothing is auto-swapped unless a 1-token probe also gets
  "No endpoints found". Cache key v3.
- `verifyModel(id)`: SDK `models.get`, then `endpoints.list`, then the
  catalogue. Dead = 404 everywhere or zero endpoints; offline = unknown and
  changes nothing. Settings shows "Live on OpenRouter · N providers" or "Not
  usable" under the picker, and a typed exact ID is refused if dead. At launch
  `LyricStore` checks the saved model and swaps a dead one for the default,
  with a toast.
- Tested against a stub (Node and real Chromium): exact wire body, headers,
  404/429/400 status and message, abort, TTS bytes. **Not tested against the
  real openrouter.ai** (blocked from the sandbox). Only headers the app already
  sent from `file://` go out; the SDK's newer `X-OpenRouter-Title` is left off
  until a real run proves OpenRouter's CORS allows it.

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
