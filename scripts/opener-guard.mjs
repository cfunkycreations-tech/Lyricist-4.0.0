/**
 * THE OPENER STAYS ON. Chris, 2026-10-23, the second time it vanished from the
 * phone: "Better not come down again. Keep it there."
 *
 * It vanished because it was switched off or gated (sideways only) in source,
 * and the next build shipped that. Both the phone build (build-web.mjs) and the
 * desktop release (preflight.mjs) run this and stop if the opener would not
 * play on a phone. Returns a list of problems; empty means fine.
 */
import fs from 'fs';
import path from 'path';

export function openerProblems(root) {
  const problems = [];
  const read = (rel) => {
    try { return fs.readFileSync(path.join(root, rel), 'utf8'); } catch { return null; }
  };
  const intro = read('src/web/SplashIntro.jsx');
  const main = read('src/main.jsx');
  if (!intro) return ['src/web/SplashIntro.jsx (the opener) is missing.'];
  if (!/const PLAY_ON_PHONE = true;/.test(intro)) problems.push('The opener is switched off for phones (PLAY_ON_PHONE is not true in SplashIntro.jsx).');
  if (/isPortrait\(\)\)\s*return false/.test(intro)) problems.push('The opener skips upright phones again (an isPortrait() skip in SplashIntro.jsx).');
  if (/REDUCED_MOTION\)\s*return false/.test(intro)) problems.push('The opener skips reduced-motion phones again (SplashIntro.jsx).');
  if (!main || !/<SplashIntro\s*\/>/.test(main)) problems.push('src/main.jsx no longer mounts <SplashIntro />, so no opener anywhere.');
  return problems;
}
