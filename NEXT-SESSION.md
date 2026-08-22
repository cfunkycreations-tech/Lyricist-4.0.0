# Handoff, 2026-08-22, from build 4.2.0.132

The three bugs from 131 are fixed, and a fourth and worse one turned up while
fixing them. All shipped in 132, pushed as `4e16a36`.

## Fixed in 132

1. **KAGGLE NEVER GOT THE INPUT CAPTION. Not once, in any build.**
   `generateKaggle` in `src/services/MusicService.js` read `state.globalMeta`.
   `buildState` writes `global_meta`. So the caption was `undefined`,
   `filter(Boolean)` dropped it, and every Kaggle push carried
   `CAPTION = """"""`. Read back off version 4 of his own notebook to prove it.
   The local ComfyUI path four hundred lines up reads `state.global_meta` and
   always has, which is why local sounded right and Kaggle came back generic.
   A run with an empty caption is now refused before the push, by name.
2. **The Ghost put the caption inside the `<lyrics>` tag.** That is how the
   caption ended up in the LYRICS field with his real words underneath, and it
   is also how his lyrics "disappeared": they were pushed down the box, not
   deleted. `splitActions` peels a caption schema off the front of a lyric sheet
   and sends each half to its own box. Prose before the first tag is left alone.
3. **`set_lyrics` refused nothing.** Any `<do>` with missing args wiped the box
   and reported it as work done. It refuses empty now, AND a replacement keeps
   the old words with **Put my words back** next to the tick in the conversation.
   `runGhostAction` grew `{ said, undo, warn }` for that.
4. **The tags he clicked are checked in code** after every `set_lyrics`, the way
   `CLAIMS` checks a false claim, and the rule is RULE ONE at the top of the
   prompt instead of buried mid-block.
5. **`voices.every()` called an empty picker instrumental**, which sends a song
   with no words at all. One shared derivation with the length guard on it.
6. **Input Caption / Input Lyrics everywhere**: tab note, Ghost openers, wizard
   card, App help, and two Ghost Demo clips re-baked (0.0% and 2.5% WER).

## How to check it without spending a graphics card hour

```
node scripts/song-payload-check.mjs
```
Ten checks, one second, no network. It fails if `state.globalMeta` ever becomes
a real property again.

## Still unproven

- **No full-length song has run.** The end-to-end proof was 20 seconds.
- **No Kaggle run has ever finished WITH a caption**, because of bug 1. The next
  real run is the first one that has ever had the whole song in it.
- The Ghost has never read a real AI answer aloud in the packaged app.

## Notes

- The Kaggle API token cannot cancel a run: `CancelKernelSession` answers 403
  `kernelSessions.cancel denied`. The app's Stop only stops the polling on this
  side, so **a run keeps burning Kaggle time after Stop**. Cancelling for real
  means the Version History kebab menu on kaggle.com. Worth fixing.
- Build: `LYRICIST_RELEASE_DIR="D:\lyricist-stage" npm run release`, move to
  `V:\Releases\Lyricist 4.2.0 Releases\`, commit and push in the same turn.
