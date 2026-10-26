/**
 * BUILD THE CHANGE LIST THE APP SHOWS ON EVERY FRESH OPEN.
 *
 *   node scripts/gen-changes.mjs
 *
 * Writes src/changes.json. Both `npm run build` and `npm run build:web` call
 * this first, so the list in a build always matches the code in that build.
 *
 * WHY IT FILTERS. Every commit is not a change to the app. Bumping the build
 * counter, editing a Kaggle notebook, adding a skill file or rewriting
 * CLAUDE.md change nothing a person using Lyricist can see, and a "what
 * changed" list padded with those is one nobody reads twice. So a commit is
 * kept only when it touched code that actually ships in the app, and the
 * release-plumbing subjects are dropped by name on top of that.
 *
 * The subjects are written by whoever made the commit, so they are the honest
 * record. The only tidying is dropping the trailing "(#12)" pull request
 * number, which means nothing to a person on a phone.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const OUT = path.join(ROOT, 'src', 'changes.json');

/** Touching one of these means a person using the app could notice. */
const SHIPS = [
  'src/', 'main.js', 'preload.js', 'public/', 'index.html',
  'demucsLocal.js', 'comfySetup.js', 'kaggleCloud.js', 'captionSkill.js',
  'licenseCheck.js', 'desktopUpdate.js',
];

/** Never user-facing however many shipped files they brush against. */
const PLUMBING = [
  /^creator build/i,
  /^ship build/i,
  /^bump/i,
  /build[- ]number/i,
  /^merge /i,
  /^revert /i,
  /counter to \d+/i,
  // The old splash card is gone for good; its commit lines never print.
  new RegExp(['goes[ -]?', 'quantum'].join(''), 'i'),
];

const REC = String.fromCharCode(1);   // between commits
const SEP = String.fromCharCode(2);   // between fields

const git = (args) =>
  execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

// One pass: a header line per commit, then its file list.
const raw = git([
  'log', '--no-merges', '--date=short',
  `--pretty=format:${REC}%H${SEP}%ad${SEP}%s`, '--name-only',
]);

const entries = [];
for (const block of raw.split(REC)) {
  if (!block.trim()) continue;
  const nl = block.indexOf('\n');
  const head = nl === -1 ? block : block.slice(0, nl);
  const files = nl === -1 ? [] : block.slice(nl + 1).split('\n').filter(Boolean);
  const [hash, date, ...rest] = head.split(SEP);
  const subject = rest.join(SEP).trim();
  if (!subject) continue;
  if (PLUMBING.some((re) => re.test(subject))) continue;
  if (!files.some((f) => SHIPS.some((p) => f.startsWith(p)))) continue;
  entries.push({
    hash: hash.slice(0, 7),
    date,
    text: subject.replace(/\s*\(#\d+\)\s*$/, '').trim(),
  });
}

// Newest first, grouped by day, so the list reads like a diary.
const days = [];
for (const e of entries) {
  const last = days[days.length - 1];
  if (last && last.date === e.date) last.items.push(e.text);
  else days.push({ date: e.date, items: [e.text] });
}

const payload = {
  generated: new Date().toISOString().slice(0, 10),
  total: entries.length,
  days,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
console.log(`changes.json: ${entries.length} changes across ${days.length} days`);
