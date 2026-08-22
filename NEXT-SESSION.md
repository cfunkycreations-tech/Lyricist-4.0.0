# Handoff, 2026-08-22, from build 4.2.0.131

Paste this into the next conversation. Three bugs, one of them destructive.

---

## 1. IT ERASED HIS LYRICS. Fix this first.

Chris asked the Ghost to write a song. It offered the "Yes, make it" tap. He said yes,
**and it wiped every line of lyrics out of the box.**

**Strongest suspect, and it is a one-liner.** `set_lyrics` in
`src/components/OneManBand/OneManBand.jsx` does:

```js
set_lyrics: ({ text }) => {
  const t = String(text ?? '');   // <- undefined becomes '', and '' wipes the box
  setLyrics(t);
```

Any `<do>{"action":"set_lyrics"}` with missing or empty args erases the song. `append_lyrics`
right below it already throws on empty; this one does not. Note `splitActions` refuses an
empty `<lyrics></lyrics>` tag, so the empty almost certainly arrived through the `<do>` path.

**Do not just add a guard.** Two things are needed:
- `set_lyrics` refuses empty text, the way `append_lyrics` does.
- **A write that replaces existing words has to be undoable.** Keep the previous lyrics and
  offer "Put my words back" in the conversation next to the ✓ line. The Ghost is allowed to
  replace work; it is not allowed to make that irreversible.

Also worth checking: whether the tap itself re-ran anything, and whether `make_the_song`
fired a second `set_lyrics` with an empty payload.

## 2. When he asks for lyrics, it must obey the tags he clicked

He clicks the section buttons (Hook, Pre-Chorus, Chorus, Verse, Bridge, Outro, Solo), then
says "write the lyrics", and it writes its own structure instead of filling in his.

The Ghost DOES already receive the tags: `describe_song` in OneManBand passes
`captionBrief()`, which lists them in order, and `GhostAssistant.send()` calls it before
every question. So the data is there and the instruction is being ignored or outranked.

Likely fixes, in order of how much they would help:
- The section-tag rule is buried in the middle of a long system prompt. Move it to the top
  of the "WRITING A WHOLE SONG" block and make it absolute: **if there are tags in the box,
  the lyrics MUST use exactly those tags, in that order, none added, none dropped.**
- Better, make it checkable in code the way the false-claim check works
  (`CLAIMS` in `GhostAssistant.jsx`): after a `set_lyrics`, compare the tags in the new
  lyrics against the tags that were in the box. If they do not match, say so in the
  conversation and offer to put the old words back. Same pattern as
  `validateCaption()` in `src/services/minimaxCaption.js`.

## 3. Call it Input Caption and Input Lyrics EVERYWHERE

The two box headings were renamed in build 130, but his own words: *"I don't know why you
won't call it that in the app so it matches what it actually does."* Something is still
saying the old thing. Known leftovers:

- `src/services/GhostService.js` -> `TAB_NOTES.onemanband` still says
  "the sound description (style / singer / band)", which is both the old name AND the old
  three-box shape that no longer exists.
- `src/components/Ghost/GhostAssistant.jsx` -> `OPENERS` has "Fix my sound description".
- Grep the whole repo for `sound description`, `the words`, `the sound`, `caption blocks`
  and the three-part language, including the Ghost Demo script and the wizard cards.

---

## What is working, do not break it

- **MiniMax makes songs.** Proven end to end 2026-08-22: two takes, both T4s, 15.8 min
  including the 12 GB of weights. He is running one right now, making two songs.
- Kaggle needs a `KGAT_` code, not `kaggle.json`. **403 means the notebook does not exist
  yet, not a bad key.** Phone verification was what blocked the GPU.
- One Input Caption box, not three. The three-part split was this app's invention.
- Long text uses `<caption>` / `<lyrics>` tags, not JSON. Reply budget is 7000.
- The Ghost's voice model ships inside the installer, no network at all. Three voices.
- The picker plays baked clips so it is instant; only real answers wait.

## Still unproven

- No full-length song has run. The end-to-end proof was 20 seconds. Three minutes is the
  same path at roughly 1.7 hours.
- The Ghost has never read a real AI answer aloud in the packaged app. Loading and all
  three voices are proven there; that last hop is not.

## How to work on this

- Build: `LYRICIST_RELEASE_DIR="D:\lyricist-stage" npm run release`, then move to
  `V:\Releases\Lyricist 4.2.0 Releases\`. Commit and push in the same turn, never ask.
- The packaged app can be driven over its own DevTools port; see
  `scratchpad/probe-voices.cjs` in the session temp dir for the pattern. **A green dev
  build proves nothing about the installed app** and has now caught two bugs that way.
- Offline checks: `node scripts/kaggle-check.mjs`, `python scripts/kaggle-takes-check.py`.
