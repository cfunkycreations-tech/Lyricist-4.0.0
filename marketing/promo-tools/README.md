# Promo video tools

The TikTok / Shorts / Reels clips and the YouTube promo. A scripted Ghost run
through Ghost Rider, Songwriter and Black Hole Studios, recorded frame by frame,
then cut into videos.

1. `npx vite --port 5199` (the customer build; the dev server skips the purchase lock).
2. `SONG=take.wav PLAYWRIGHT_CORE=<path to playwright-core> CHROME=<chrome> node film.cjs`
   writes `frames/`, `cues.json` and `track.json` (about 45 minutes at 1080p).
3. `python3 compose.py` writes `out/*.mp4`. Pass a clip name to make just one.

Captions are in `captions.json`, hooks and the busking story are in `CLIPS` at
the bottom of `compose.py`. Both scripts refuse the banned lyric words.
The model and the music server are faked in `film.cjs`, so this is a demo run,
not a real one; for paid ads, use a real run recorded in OBS.
