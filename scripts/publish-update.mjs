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
 * This refuses anything the release script did not mark as customer, and
 * anything not signed with the update key (scripts/update-key.mjs).
 *
 * Uses the GitHub CLI if it is installed and logged in; otherwise GH_TOKEN
 * (a token with "repo" access) from the environment.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadOrCreateKey, manifestSigned, signManifest, KEY_PATH } from './update-key.mjs';

// Releases go to the public releases-only repo. Copies installed before the
// move read the old source repo, so while that repo is still public the same
// update goes there too, with its own update.json pointing at its own copy
// (installed copies only take an installer from the repo they read).
const REPO = 'cfunkycreations-tech/lyricist-pro-releases';
const OLD_REPO = 'cfunkycreations-tech/Lyricist-4.0.0';
const releaseRoot = process.env.LYRICIST_RELEASE_DIR
  || path.join(process.env.USERPROFILE || process.env.HOME || '.', 'OneDrive', 'Desktop', 'New Releases for Lyricist Pro');
const dir = process.argv[2] || path.join(releaseRoot, 'Customer');

const fail = (msg) => { console.error(`\n${msg}\n`); process.exit(1); };

const manifestPath = path.join(dir, 'update.json');
if (!fs.existsSync(manifestPath)) fail(`No update.json in ${dir}. Run npm run release:customer first.`);
const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
if (m.edition !== 'customer') fail('That is not a customer build. Only customer builds are published.');
if (!fs.existsSync(KEY_PATH)) fail(`No update key at ${KEY_PATH}. Put your backup copy there, or run npm run release:customer to make a new one.`);
if (!m.sig || !manifestSigned(m, loadOrCreateKey())) {
  fail('update.json is not signed with your update key, so no copy of the app would take it. Run npm run release:customer again.');
}
const setup = path.join(dir, m.setup);
if (!fs.existsSync(setup)) fail(`The installer ${m.setup} is not next to update.json.`);
if (fs.statSync(setup).size !== m.size) fail('The installer changed after update.json was written. Run npm run release:customer again.');

const title = `Lyricist Pro ${m.version}`;
const notes = `Customer build ${m.version}. Copies of Lyricist Pro update themselves to this one.`;

// The installer goes up under a name with no spaces; update.json points at it.
const staged = path.join(dir, m.asset);
if (path.resolve(staged) !== path.resolve(setup)) fs.copyFileSync(setup, staged);

const gh = spawnSync('gh', ['auth', 'status'], { shell: true, encoding: 'utf8' });
if (gh.status !== 0) fail('Needs the GitHub CLI: install it, then run gh auth login.');

/** update.json for one repo: its own installer URL, signed again. */
function manifestFor(repo) {
  const mm = { ...m, url: `https://github.com/${repo}/releases/download/${m.tag}/${m.asset}` };
  mm.sig = signManifest(mm, loadOrCreateKey());
  const f = path.join(dir, `update.${repo.split('/')[1]}.json`);
  fs.writeFileSync(f, JSON.stringify(mm, null, 2));
  return f;
}

function publish(repo) {
  // The asset has to be called update.json on the release, so stage it under that name.
  const stageDir = path.join(dir, `.publish-${repo.split('/')[1]}`);
  fs.mkdirSync(stageDir, { recursive: true });
  const manifest = path.join(stageDir, 'update.json');
  fs.copyFileSync(manifestFor(repo), manifest);
  console.log(`Publishing ${m.tag} to ${repo}...`);
  const r = spawnSync('gh', ['release', 'create', m.tag, `"${staged}"`, `"${manifest}"`,
    '--repo', repo, '--title', `"${title}"`, '--notes', `"${notes}"`, '--latest'], { shell: true, stdio: 'inherit' });
  fs.rmSync(stageDir, { recursive: true, force: true });
  if (r.status !== 0) fail(`The GitHub CLI could not publish to ${repo} (see above).`);
}

publish(REPO);
const vis = spawnSync('gh', ['repo', 'view', OLD_REPO, '--json', 'visibility', '--jq', '.visibility'], { shell: true, encoding: 'utf8' });
if ((vis.stdout || '').trim() === 'PUBLIC') publish(OLD_REPO);
else console.log(`${OLD_REPO} is private: skipped (copies installed before the move already read ${REPO}).`);
if (path.resolve(staged) !== path.resolve(setup)) fs.rmSync(staged, { force: true });
console.log(`\nPublished. Every copy of Lyricist Pro will update to ${m.version}.\n`);
