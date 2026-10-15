#!/usr/bin/env node
/**
 * SEND THE LAST CUSTOMER BUILD TO EVERYONE WHO HAS THE APP.
 *
 *   npm run release:customer
 *   npm run publish:update
 *
 * Puts the installer and its update.json on a GitHub Release in this repo,
 * marked latest. Every customer copy (desktopUpdate.js) checks
 * releases/latest/download/update.json, downloads the installer, checks it
 * byte for byte and installs it when they close the app.
 *
 * CUSTOMER BUILDS ONLY. The repo is public and the creator build has no
 * license lock, so publishing it would be a free download of the paid app.
 * This refuses anything the release script did not mark as customer.
 *
 * Uses the GitHub CLI if it is installed and logged in; otherwise GH_TOKEN
 * (a token with "repo" access) from the environment.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const REPO = 'cfunkycreations-tech/Lyricist-4.0.0';
const releaseRoot = process.env.LYRICIST_RELEASE_DIR
  || path.join(process.env.USERPROFILE || process.env.HOME || '.', 'OneDrive', 'Desktop', 'New Releases for Lyricist Pro');
const dir = process.argv[2] || path.join(releaseRoot, 'Customer');

const fail = (msg) => { console.error(`\n${msg}\n`); process.exit(1); };

const manifestPath = path.join(dir, 'update.json');
if (!fs.existsSync(manifestPath)) fail(`No update.json in ${dir}. Run npm run release:customer first.`);
const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
if (m.edition !== 'customer') fail('That is not a customer build. Only customer builds are published.');
const setup = path.join(dir, m.setup);
if (!fs.existsSync(setup)) fail(`The installer ${m.setup} is not next to update.json.`);
if (fs.statSync(setup).size !== m.size) fail('The installer changed after update.json was written. Run npm run release:customer again.');

const title = `Lyricist Pro ${m.version}`;
const notes = `Customer build ${m.version}. Copies of Lyricist Pro update themselves to this one.`;

// The installer goes up under a name with no spaces; update.json points at it.
const staged = path.join(dir, m.asset);
if (path.resolve(staged) !== path.resolve(setup)) fs.copyFileSync(setup, staged);

const gh = spawnSync('gh', ['auth', 'status'], { shell: true, encoding: 'utf8' });
if (gh.status === 0) {
  console.log(`Publishing ${m.tag} with the GitHub CLI...`);
  const r = spawnSync('gh', ['release', 'create', m.tag, `"${staged}"`, `"${manifestPath}"`,
    '--repo', REPO, '--title', `"${title}"`, '--notes', `"${notes}"`, '--latest'], { shell: true, stdio: 'inherit' });
  if (path.resolve(staged) !== path.resolve(setup)) fs.rmSync(staged, { force: true });
  if (r.status !== 0) fail('The GitHub CLI could not publish it (see above).');
  console.log(`\nPublished. Every copy of Lyricist Pro will update to ${m.version}.\n`);
  process.exit(0);
}

const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
if (!token) {
  fail('Needs the GitHub CLI (install it, then run: gh auth login) or a GH_TOKEN with repo access.');
}

const api = async (url, opts = {}) => {
  const res = await fetch(url, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', ...(opts.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) fail(`GitHub said ${res.status}: ${body.message || 'no reason given'}`);
  return body;
};

console.log(`Publishing ${m.tag}...`);
const rel = await api(`https://api.github.com/repos/${REPO}/releases`, {
  method: 'POST',
  body: JSON.stringify({ tag_name: m.tag, name: title, body: notes, draft: false, prerelease: false, make_latest: 'true' }),
});
const upload = async (file, name, type) => {
  const size = fs.statSync(file).size;
  console.log(`  uploading ${name} (${Math.round(size / 1048576)} MB)`);
  await api(`https://uploads.github.com/repos/${REPO}/releases/${rel.id}/assets?name=${encodeURIComponent(name)}`, {
    method: 'POST',
    headers: { 'Content-Type': type, 'Content-Length': String(size) },
    body: fs.createReadStream(file),
    duplex: 'half',
  });
};
await upload(staged, m.asset, 'application/octet-stream');
await upload(manifestPath, 'update.json', 'application/json');
if (path.resolve(staged) !== path.resolve(setup)) fs.rmSync(staged, { force: true });
console.log(`\nPublished. Every copy of Lyricist Pro will update to ${m.version}.\n`);
