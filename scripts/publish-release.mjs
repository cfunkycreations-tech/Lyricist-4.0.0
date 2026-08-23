/**
 * PUBLISH A BUILD SO THE WORLD CAN DOWNLOAD IT.
 *
 * The website cannot host a 256 MB installer well, and re-uploading it by hand
 * every build is how a download link goes stale. GitHub Releases holds files up
 * to 2 GB, free, and counts the downloads.
 *
 * THE WHOLE POINT IS THE STABLE URL. The asset names here never change between
 * builds - the version lives in the tag, not the filename - so this address is
 * correct forever and the website never has to be edited again to ship a build:
 *
 *   https://github.com/<owner>/<repo>/releases/latest/download/Lyricist-Setup.exe
 *
 * If you rename the assets, that URL breaks and every download button on the
 * internet points at nothing. Do not rename them.
 *
 * The binaries repo is PUBLIC and holds only binaries. The source repo stays
 * private. Anonymous downloads need a public repo; that is the only reason.
 *
 * USE:
 *   gh auth login            (once, ever)
 *   node scripts/publish-release.mjs           - publishes the newest build
 *   node scripts/publish-release.mjs 141       - publishes a specific build
 *   node scripts/publish-release.mjs --dry-run - says what it would do
 */

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const OWNER = 'cfunkycreations-tech';
const REPO = 'lyricist-releases';
const RELEASE_DIR = process.env.LYRICIST_RELEASE_DIR || 'V:/Releases/Lyricist 4.2.0 Releases';

/** Constant asset names. See the header: these are load bearing. */
const ASSET_INSTALLER = 'Lyricist-Setup.exe';
const ASSET_PORTABLE = 'Lyricist-Portable-Windows.zip';

const dryRun = process.argv.includes('--dry-run');
const wantBuild = process.argv.slice(2).find((a) => /^\d+$/.test(a));

function die(msg, hint) {
  console.error(`\n  ${msg}`);
  if (hint) console.error(`  ${hint}`);
  console.error('');
  process.exit(1);
}

function gh(args, { capture = true } = {}) {
  const r = spawnSync('gh', args, { encoding: 'utf8', shell: process.platform === 'win32' });
  if (r.error) die('GitHub CLI (gh) is not installed.', 'Get it at https://cli.github.com then run: gh auth login');
  return { code: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
}

/* ---- 1. Are we signed in? ------------------------------------------- */
const auth = gh(['auth', 'status']);
if (auth.code !== 0) {
  die('GitHub CLI is not signed in.', 'Run this once, then run this script again:  gh auth login');
}
console.log('  Signed in to GitHub.');

/* ---- 2. Which build? ------------------------------------------------- */
if (!fs.existsSync(RELEASE_DIR)) die(`No release folder at ${RELEASE_DIR}`, 'Build first:  npm run release');

const setups = fs.readdirSync(RELEASE_DIR)
  .map((f) => ({ f, m: f.match(/^Lyricist (\d+\.\d+\.\d+)\.(\d+) Setup\.exe$/) }))
  .filter((x) => x.m)
  .map((x) => ({ file: x.f, version: x.m[1], build: Number(x.m[2]) }))
  .sort((a, b) => b.build - a.build);

if (!setups.length) die(`No "Lyricist x.y.z.NNN Setup.exe" found in ${RELEASE_DIR}`, 'Build first:  npm run release');

const pick = wantBuild ? setups.find((s) => s.build === Number(wantBuild)) : setups[0];
if (!pick) die(`Build ${wantBuild} is not in ${RELEASE_DIR}`, `Newest there is ${setups[0].build}.`);

const fullVersion = `${pick.version}.${pick.build}`;
const tag = `v${fullVersion}`;
const installerPath = path.join(RELEASE_DIR, pick.file);
const portablePath = path.join(RELEASE_DIR, `Lyricist-${fullVersion}-Portable-Windows.zip`);

console.log(`  Publishing ${fullVersion}`);

/* ---- 3. Hash what we are about to publish ---------------------------- */
const mb = (p) => (fs.statSync(p).size / 1048576).toFixed(0);
const sha = (p) => {
  const h = crypto.createHash('sha256');
  h.update(fs.readFileSync(p));
  return h.digest('hex');
};

const assets = [{ label: 'installer', src: installerPath, as: ASSET_INSTALLER }];
if (fs.existsSync(portablePath)) {
  assets.push({ label: 'portable', src: portablePath, as: ASSET_PORTABLE });
} else {
  console.log(`  No portable zip for ${fullVersion}, publishing the installer only.`);
  console.log(`  To make one:  cd "${RELEASE_DIR}" && tar -a -c -f "Lyricist-${fullVersion}-Portable-Windows.zip" "Lyricist ${fullVersion}"`);
}

for (const a of assets) {
  a.size = mb(a.src);
  a.sha = sha(a.src);
  console.log(`  ${a.as}  ${a.size} MB  ${a.sha.slice(0, 16)}...`);
}

/* ---- 4. Notes. A person reads these, so no code talk. ---------------- */
const notesPath = path.join(RELEASE_DIR, `NOTES-${fullVersion}.md`);
const notes = fs.existsSync(notesPath)
  ? fs.readFileSync(notesPath, 'utf8')
  : [
    `## Lyricist ${fullVersion} for Windows`,
    '',
    'Free. No account, no subscription, no card.',
    '',
    '**Download the installer below.** Windows 10 and 11.',
    '',
    '### The first time you run it',
    '',
    'Windows shows a blue box that says "Windows protected your PC". That happens because this app',
    'is not signed with a paid certificate, and a paid certificate costs more per year than this',
    'app will ever make. Click **More info**, then **Run anyway**.',
    '',
    '### Checksums',
    '',
    ...assets.map((a) => `- \`${a.as}\` (${a.size} MB) \`${a.sha}\``),
    '',
  ].join('\n');

/* ---- 5. Make the repo if it is not there yet ------------------------- */
const repoSlug = `${OWNER}/${REPO}`;
const seen = gh(['repo', 'view', repoSlug, '--json', 'visibility']);
if (seen.code !== 0) {
  console.log(`  ${repoSlug} does not exist yet. Creating it public (binaries only).`);
  if (!dryRun) {
    const made = gh(['repo', 'create', repoSlug, '--public',
      '--description', 'Downloads for Lyricist, the free AI songwriting studio. Binaries only.']);
    if (made.code !== 0) die('Could not create the releases repo.', made.err);
  }
} else if (!seen.out.includes('PUBLIC')) {
  die(`${repoSlug} is private, so nobody can download from it.`,
    `Make it public:  gh repo edit ${repoSlug} --visibility public --accept-visibility-change-consequences`);
}

/* ---- 6. Ship it ------------------------------------------------------ */
if (dryRun) {
  console.log('\n  DRY RUN, nothing was uploaded. It would have created:');
  console.log(`    release ${tag} on ${repoSlug}`);
  assets.forEach((a) => console.log(`    ${a.as}  from  ${a.src}`));
  process.exit(0);
}

const tmpNotes = path.join(RELEASE_DIR, `.notes-${fullVersion}.md`);
fs.writeFileSync(tmpNotes, notes, 'utf8');

const existing = gh(['release', 'view', tag, '--repo', repoSlug]);
if (existing.code === 0) {
  console.log(`  ${tag} already exists, replacing its files.`);
  gh(['release', 'edit', tag, '--repo', repoSlug, '--notes-file', tmpNotes]);
} else {
  const made = gh(['release', 'create', tag, '--repo', repoSlug,
    '--title', `Lyricist ${fullVersion}`, '--notes-file', tmpNotes, '--latest']);
  if (made.code !== 0) { fs.unlinkSync(tmpNotes); die('Could not create the release.', made.err); }
}

for (const a of assets) {
  // gh uploads under the local filename, so hand it the constant name via #.
  const staged = path.join(RELEASE_DIR, a.as);
  fs.copyFileSync(a.src, staged);
  console.log(`  Uploading ${a.as} (${a.size} MB), this takes a minute...`);
  const up = gh(['release', 'upload', tag, staged, '--repo', repoSlug, '--clobber']);
  fs.unlinkSync(staged);
  if (up.code !== 0) { fs.unlinkSync(tmpNotes); die(`Upload of ${a.as} failed.`, up.err); }
}
fs.unlinkSync(tmpNotes);

/* ---- 7. The addresses the website uses ------------------------------- */
const base = `https://github.com/${repoSlug}/releases/latest/download`;
console.log(`
  DONE. Lyricist ${fullVersion} is published.

  These two addresses are permanent. Point the website at them once and never
  edit the website for a release again:

    ${base}/${ASSET_INSTALLER}
    ${base}/${ASSET_PORTABLE}

  Release page:   https://github.com/${repoSlug}/releases/tag/${tag}
  Download count: gh release view ${tag} --repo ${repoSlug} --json assets
`);
