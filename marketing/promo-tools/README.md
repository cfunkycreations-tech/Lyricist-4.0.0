# Promo video tools

The TikTok / Shorts / Reels clips and the YouTube promo. A scripted Ghost run
through Ghost Rider, Songwriter and Black Hole Studios, recorded frame by frame,
then cut into videos.

1. `npx vite --port 5199` (the customer build; the dev server skips the purchase lock).
2. `SCENE=<scene> SONG=take.wav PLAYWRIGHT_CORE=<path to playwright-core> CHROME=<chrome> node film.cjs`
   records one scene. `ghost` (the default) writes `frames/`, `cues.json` and `track.json`;
   every other scene writes `frames-<scene>/`, `cues-<scene>.json` and `track-<scene>.json`.
   Scenes: `ghost` (Ghost Rider → Songwriter → Black Hole Studios), `suno` (Ghost Rider,
   the Suno tags as the payoff), `matrix`, `tour` (all 18 tools) and `phone` (the phone
   version, sideways). Only `ghost` needs `SONG`. Preview first with `FPS=8 W=960`
   (`W=844` for the phone); a full 1080p scene takes about an hour.
3. `python3 compose.py` writes `out/*.mp4`. Pass a clip name to make just one.
   `tiktok-9-the-price` is built from the `tour` frames, `tiktok-10-comment-game` from `ghost`.

Captions are in `captions.json`, one list per scene; hooks and the story card are in `CLIPS` at
the bottom of `compose.py`. Both scripts refuse the banned lyric words.
The model and the music server are faked in `film.cjs`, so this is a demo run,
not a real one; for paid ads, use a real run recorded in OBS.
