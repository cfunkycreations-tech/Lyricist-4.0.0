/**
 * PUT THE PHONE VERSION ONLINE.
 *
 *   npm run deploy:web
 *
 * Builds dist-web/ (scripts/build-web.mjs) and uploads it to Cloudflare Pages
 * on Chris's own Cloudflare account, the same one the Kaggle relay lives on.
 * Free: Pages has no bandwidth bill. The website being down does not matter,
 * this is a separate address.
 *
 * The first run opens a browser to log in to Cloudflare (wrangler remembers it)
 * and creates the project. Every run after that just uploads.
 *
 * On the phone: open the link it prints.
 *   iPhone   Safari -> Share -> Add to Home Screen. No App Store, no $99 fee.
 *   Android  Chrome -> menu -> Install app.
 */
import { execSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const PROJECT = process.env.LYRICIST_PAGES_PROJECT || 'lyricist-pro';
const WRANGLER = 'npx --yes wrangler@4';

const run = (cmd) => spawnSync(cmd, { cwd: ROOT, shell: true, encoding: 'utf8' });

// Log in first, in the open, so the browser can come up. Wrangler with its
// output captured counts as non-interactive and refuses to log in by itself
// (it asks for an API token instead), and an old login may have run out.
if (!process.env.CLOUDFLARE_API_TOKEN) {
  const who = run(`${WRANGLER} whoami`);
  if (who.status !== 0 || /not authenticated/i.test(`${who.stdout}${who.stderr}`)) {
    console.log('Logging in to Cloudflare. A browser window opens; press Allow.');
    execSync(`${WRANGLER} login`, { cwd: ROOT, stdio: 'inherit' });
  }
}

// Make the project the first time. "Already exists" is the normal answer after that.
const made = run(`${WRANGLER} pages project create ${PROJECT} --production-branch main`);
const said = `${made.stdout || ''}${made.stderr || ''}`;
if (made.status !== 0 && !/already exists|8000002/i.test(said)) {
  console.error(said);
  throw new Error('Cloudflare would not make the project. The lines above say why.');
}

execSync(`${WRANGLER} pages deploy dist-web --project-name ${PROJECT} --branch main --commit-dirty=true`,
  { cwd: ROOT, stdio: 'inherit' });

// The address to hand out. Cloudflare adds letters to the name when it is taken
// by someone else, so read the real one back instead of guessing.
const list = run(`${WRANGLER} pages project list`);
const line = `${list.stdout || ''}`.split('\n').find((l) => l.includes(PROJECT)) || '';
const domain = (line.match(/[a-z0-9-]+\.pages\.dev/i) || [`${PROJECT}.pages.dev`])[0];

console.log(`
╔════════════════════════════════════════════════════════════════
║  PHONE VERSION IS LIVE:  https://${domain}
║
║  iPhone   Safari -> Share -> Add to Home Screen
║  Android  Chrome -> menu -> Install app
╚════════════════════════════════════════════════════════════════
`);
