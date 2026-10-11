# The plan (Chris, 2026-10-11)

One thing at a time, in this order. Don't start the next one until he says go.

Names, between Chris and Claude only: **Funk Ghost** is the main Ghost.
**Sly Ghost** is his right-hand man (`src/services/slyGhost.js`).

## 1. Sly Ghost (built, PR #34)

- Before each job step he opens the tab the Ghost needs. After it he checks the
  step really happened and no banned words got into the lyrics. A miss sends the
  Ghost back to redo that step once, with what was wrong. A second miss is only
  noted (⚠ in Jobs), so he never stops a job.
- Chris: pull, run the Sly and the Family Stone job and the two-part tour, send
  the log.
- Small fix still queued: the job planner drops any step with "record" in it
  (Recording Booth). There's a task card for it.

## 2. Lyric video cut to the beat (Kaggle)

Done looks like: pick a finished take, press **Make the video**, and get back:

- a 16:9 lyric video: pictures change on the downbeats, words light up as sung
- vertical 9:16 chorus clips for Shorts, Reels and TikTok
- `.lrc` and `.srt` synced-lyric files

How, on the same upload, run and collect path the songs use, with its own saved
models (like the music model cache):

1. Notebook: word timings from the song (WhisperX), beats and downbeats, one
   picture per section from the song's tags (a fast image model on the T4s),
   then ffmpeg cuts it all together. Tested offline with fakes first, like
   `scripts/kaggle-takes-check.py`.
2. `kaggleCloud.js`: a `renderVideo` next to `render`, with the same push,
   poll, collect and model cache.
3. A button on the take in Black Hole Studios. Videos land next to the songs.
4. A Ghost action, `make_the_video`, so a job can finish a song all the way.

## 3. Getting it in front of people (after 2, one at a time)

1. **Gumroad** listing: page copy, price, screenshots, a demo video. Ghost jobs
   recorded in OBS are the demo footage.
2. **New website**: rebuild `lyricist-site/` with a video up top, what each tab
   does, and the Gumroad button.
3. **Launch clips**: Shorts made by the step 2 video maker, plus Ghost demo clips.

## Later (only if he asks)

- Originality check: flag lines too close to real songs, using a lyrics dataset
  on Kaggle.
- Cover and promo pack: 3000×3000 covers and a Spotify Canvas loop.
- The Ghost as a talking character (lip-sync).
- A free open model as the Ghost's brain for overnight batches. Batch only:
  running it live through a tunnel risks the Kaggle account.

Dropped: a model of Chris's voice. His call, don't bring it back.
