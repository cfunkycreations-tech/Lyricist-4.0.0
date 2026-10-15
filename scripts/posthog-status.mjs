/**
 * SAYS WHETHER THIS BUILD WILL SEND ANONYMOUS USAGE STATS.
 *
 * PostHog is in the code but only turns on in a build made with
 * VITE_POSTHOG_KEY (src/services/analytics.js). Vite reads it from the
 * environment or from .env / .env.production in the repo root, so this looks
 * in the same places and prints one line before the build starts.
 */
import fs from 'node:fs';
import path from 'node:path';

export function posthogStatus(root) {
  let key = process.env.VITE_POSTHOG_KEY || '';
  for (const f of ['.env', '.env.local', '.env.production', '.env.production.local']) {
    if (key) break;
    try {
      const m = fs.readFileSync(path.join(root, f), 'utf8').match(/^\s*VITE_POSTHOG_KEY\s*=\s*["']?(phc_[A-Za-z0-9]+)/m);
      if (m) key = m[1];
    } catch { /* no such file */ }
  }
  console.log(key
    ? 'PostHog: ON. This build sends anonymous usage stats.'
    : 'PostHog: OFF. Add a line VITE_POSTHOG_KEY=phc_... to .env in this folder to turn it on.');
  return Boolean(key);
}
