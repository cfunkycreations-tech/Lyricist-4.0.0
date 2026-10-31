# Lyricist Pro redesign: initial audit

Baseline: `main` commit `44a3e0185279bebe0612b0a601bc1aa86dd7316c`, checked out locally on `redesign/full-audit`. The checkout is shallow; fetch history before using history-dependent release tooling. No app changes have been made or released.

## Checks completed

- `node scripts/preflight.mjs`: passed, including IPC handler and packaging checks.
- `node scripts/opener-guard.mjs`: passed.
- `node scripts/seed-check.mjs`: passed.
- `node scripts/ghost-check.mjs`: 41 checks passed.
- `node scripts/song-payload-check.mjs`: passed.
- `npm run build:web`: passed. The build emitted large-chunk warnings. Generated tracked files were restored after the check; the shallow clone makes generated history-based changes incomplete.
- `node scripts/find-cycles.mjs`: reports one cycle between `src/context/LyricStore.jsx` and `src/services/styleBridge.js`. The bridge deliberately defers some initialization; establish actual impact and add coverage before refactoring.

## Security updates applied

Updated the lockfile to resolve patched compatible versions of DOMPurify (3.4.17), protobufjs (7.6.6), tar (7.5.22), and Zod (4.6.7). Afterward `npm audit --omit=dev` reported no critical or moderate findings and three high-severity entries in the same Kokoro / Transformers / sharp dependency chain; investigate runtime reachability and compatible upstream fixes. Preflight, 41 Ghost checks, song payload checks, and a Vite renderer build passed after the update. Windows installer and real-device tests remain outstanding. Advisory counts can change over time.

## Initial security triage (before updates)

`npm audit --omit=dev` reported seven affected dependency entries: one critical, five high, and one moderate. These are dependency advisory classifications, not proof that an attack is reachable in Lyricist. Establish runtime exposure and safe fixes before release.

- `posthog-js` depends on `dompurify@3.4.14` (critical advisory; npm reports a fix available).
- `kokoro-js` -> `@huggingface/transformers` -> `sharp@0.34.5` (high; npm reports no automatic fix for that dependency chain).
- `@google/genai` and ONNX runtime use `protobufjs@7.6.4` (moderate; npm reports a fix available).
- ONNX runtime uses `tar@7.5.19` (high; npm reports a fix available).
- `@openrouter/sdk` uses `zod@4.6.5` (high; npm reports a fix available).

Review Electron IPC sender validation, exposed bridges, custom AI and ComfyUI network access, file access, update and licensing flows, Cloudflare functions and relay, secret handling, and PWA content security. Confirm applicable findings with tests and avoid breaking user-configured local or remote AI servers.

## Phone purchase gate audit

The unlock endpoint now rejects valid JSON that is not an object (including null) with the normal 400 response instead of throwing. `node scripts/unlock-input-check.mjs` covers malformed inputs and missing configuration. `node scripts/unlock-cookie-check.mjs` verifies signed cookies, tampering, wrong secrets, expiry, and security attributes. Both passed. The offline caption-skill and Kaggle parser/notebook checks also passed; live OpenRouter, Kaggle, and Gumroad integration checks were not run.

Both license implementations now treat a missing trial purchase date as an uncertain verification, rather than restarting the trial. Existing customers remain unlocked during an uncertain recheck; a new activation receives an error instead of being silently granted a fresh trial. `node scripts/license-flow-check.mjs` passed simulated activation, recheck, outage, refund, unknown purchase, missing-date trial, active trial, and grandfathered purchase cases. These are mocked tests; live Gumroad responses and real devices still need verification.

## Startup reliability

The accent theme previously accessed localStorage before the React error boundary, so blocked browser storage could prevent startup. Theme storage access is now guarded; when saving is unavailable, color changes work in memory for the current session. `node scripts/prism-storage-check.mjs`, purchase-flow checks, preflight, and a Vite renderer build passed. Full UI and device testing remain outstanding.

## Remaining work

Run desktop production build and Windows installer/runtime checks, exercise the phone PWA on actual iOS and Android devices, test licensing and connected services with appropriate credentials, audit the remaining code and infrastructure, fix and regression-test confirmed issues, review phone ergonomics and accessibility, and research current Suno/Udio workflows before prioritizing compatible feature ideas. A passing build does not establish that every feature works or that the app is secure.
