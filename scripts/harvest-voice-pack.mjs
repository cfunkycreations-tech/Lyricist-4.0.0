// Ship what the Voice Lab baked.
//
//   node scripts/harvest-voice-pack.mjs            copy every baked clip into the build
//   node scripts/harvest-voice-pack.mjs --dry      just list what it would copy
//   node scripts/harvest-voice-pack.mjs --from <voice folder>
//
// The Voice Lab (Ghost panel, Creator build) renders every line into the app's
// voice folder, where the running app uses it at once. That folder is per
// machine, so a customer build would still carry the old clips. This copies the
// bakes into the source tree:
//
//   <voice>\ghost\<id>.wav  ->  src/assets/ghost-vo/<id>.mp3   (+ manifest.json)
//   <voice>\card-NN.wav     ->  public/wizard-audio/card-NN.mp3
//
// It only re-encodes (WAV -> MP3). No filters, no level change: the Lab already
// did all of that, and doing any of it twice is how preview and ship drift apart.
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

const ROOT = path.dirname(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')));
const args = process.argv.slice(2);
const from = args.includes('--from') ? args[args.indexOf('--from') + 1] : path.join(process.env.APPDATA || '', 'lyricist', 'voice');
const dry = args.includes('--dry');
const { ghostLines, wizardLines } = await import('file:///' + path.join(ROOT, 'src', 'services', 'narrationLines.js').split(path.sep).join('/'));

const ghostIds = new Map(ghostLines().map((l) => [l.id, l.text]));
const cardIds = new Set(wizardLines().map((l) => l.id));
const jobs = [];
const gdir = path.join(from, 'ghost');
if (fs.existsSync(gdir)) {
  for (const f of fs.readdirSync(gdir)) {
    const id = f.replace(/\.wav$/i, '');
    if (f.toLowerCase().endsWith('.wav') && ghostIds.has(id)) jobs.push({ src: path.join(gdir, f), dst: path.join(ROOT, 'src', 'assets', 'ghost-vo', `${id}.mp3`), id });
  }
}
if (fs.existsSync(from)) {
  for (const f of fs.readdirSync(from)) {
    const id = f.replace(/\.wav$/i, '');
    if (f.toLowerCase().endsWith('.wav') && cardIds.has(id)) jobs.push({ src: path.join(from, f), dst: path.join(ROOT, 'public', 'wizard-audio', `${id}.mp3`), id });
  }
}
if (!jobs.length) { console.log(`Nothing baked in ${from}. Bake in the Voice Lab first.`); process.exit(1); }

const manifestPath = path.join(ROOT, 'src', 'assets', 'ghost-vo', 'manifest.json');
const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : {};
for (const j of jobs) {
  if (dry) { console.log('would copy', j.id); continue; }
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', j.src, '-codec:a', 'libmp3lame', '-q:a', '2', '-ar', '44100', '-ac', '1', j.dst]);
  if (r.status !== 0) { console.log('FAIL', j.id, r.stderr.toString().slice(0, 160)); continue; }
  if (ghostIds.has(j.id)) manifest[j.id] = { text: ghostIds.get(j.id), words: ghostIds.get(j.id).split(/\s+/).length };
  console.log('ok  ', j.id);
}
if (!dry) fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`${jobs.length} clips from ${from}`);
