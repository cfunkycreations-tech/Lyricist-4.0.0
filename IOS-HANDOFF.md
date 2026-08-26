# iPHONE PUSH — handoff

Paste this as the first message of the new conversation.

---

Read your memory index first, in full — especially `project_ios_pwa.md`,
`project_asset_dropbox.md`, `feedback_working_agreement.md` and `project_state.md`.

**The job: make Lyricist installable and actually usable on iPhone, via the PWA. No App
Store, no $99 Apple Developer fee.** A commenter asked for iOS and I publicly said I was
blocked on the fee. I'm not — Safari → Share → Add to Home Screen gives a standalone,
offline, full-screen app off the same build Android uses. Prove it works, then I'll go tell
him.

Code lives at `V:\src\Lyricist-4.0.0`. My artwork and animations live at
`C:\Users\crafu\OneDrive\Desktop\Claude` — **open that folder before you write any code.**

## Already done (2026-08-24, verify don't redo)

- Every Apple meta tag is in `index.html`; all five icons exist in `public/pwa/`.
- `src/mobile/useMobile.js` now fires on `(max-height: 560px), (max-width: 560px)`. It was
  height-only, which iOS can never satisfy because it cannot lock orientation — every
  iPhone user would have got the desktop layout inside 390 points.
- `src/web/RotatePrompt.jsx` + `.css` — asks a portrait iPhone to turn sideways, with a
  "Use it anyway" escape. Wired into `App.jsx`.
- `vite build` passes clean with all of the above.

## The real iOS blockers — NONE of these are checked yet

Work them in this order, and verify each one on an actual iPhone, not by reading code:

1. **The hardware mute switch silences Web Audio on iOS.** This is the big one. A music app
   that is silent because of a physical switch reads as broken and gets uninstalled. Find
   out whether it bites us and either configure the audio session or warn on screen.
2. **`MediaRecorder` on iOS only produces `audio/mp4`**, never `audio/webm`. Grep the
   Recording Booth and the Stemmer for hardcoded mime types.
3. **File System Access API does not exist on iOS** — every export, download and "save"
   path needs a fallback.
4. **Storage eviction.** The web build is ~83MB. iOS caps PWA storage and evicts it. Find
   the real ceiling and decide what gets cached.
5. **WebGL context limit is lower in Safari** than Chromium, and Prism already died once at
   18 contexts. See `project_prism_contexts.md`.
6. Audio needs a user gesture to start on iOS. Confirm the first tap actually resumes the
   AudioContext everywhere, not just on the tab that happens to be open.

## How to verify without an iPhone in your hand

The in-app Browser pane stops compositing sometimes. When it does, drive headless Edge over
CDP — the harness is described in `project_headless_screenshots.md`, and there is a working
copy at the scratchpad path in that file. Pin the viewport with
`Emulation.setDeviceMetricsOverride` or you are judging a cropped screen.

For iOS specifically that only proves layout, not Safari behaviour. Anything in the list
above has to be checked on a real device — tell me what to tap and I'll do it.

## Standing rules

- Build, commit, push and copy to my desktop is ONE step. Never ask.
- Never explain why something broke. Diagnose silently, fix it, one line of outcome.
- Screenshot and LOOK after every visual change.
- If I mention art I made, find the file before writing code.
