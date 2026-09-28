// Bake the Ghost Demo and wizard narration with a hosted TTS voice through
// OpenRouter's /audio/speech. Replaces the local Kokoro bake, which Chris found
// monotone (2026-09-27): one flat read, pitched down, with an echo on it.
//
//   node scripts/ghost-tts-openrouter.mjs --audition            one line, every candidate voice
//   node scripts/ghost-tts-openrouter.mjs --voice <name>        bake every Ghost line + wizard card
//   node scripts/ghost-tts-openrouter.mjs --voice <name> --tab quantum
//   node scripts/ghost-tts-openrouter.mjs --voice <name> --only ghost|wizard
//
// THE KEY. Taken from OPENROUTER_API_KEY if set, otherwise from the key the app
// itself saved (its Local Storage). It is only ever put in the Authorization
// header to openrouter.ai. It is never printed, logged or written anywhere.
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';

const ROOT = path.dirname(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')));
const GHOST_DIR = path.join(ROOT, 'src', 'assets', 'ghost-vo');
const WIZARD_DIR = path.join(ROOT, 'public', 'wizard-audio');
const API = 'https://openrouter.ai/api/v1/audio/speech';

// Who the Ghost is, for the models that take direction. The old bake read every
// line at one pitch; this is what fixes that, so keep it about DELIVERY.
const DIRECTION = 'You are the Ghost, the guide inside a music studio app. Speak like a warm, '
  + 'confident late-night radio host with a little mischief: lively, varied intonation, '
  + 'real emphasis on the words that matter, natural pauses, a smile in the voice. '
  + 'Never flat, never robotic, never rushed. Clear enough for a beginner to follow.';

// name -> request body (minus input). Voices checked against each model page.
const CANDIDATES = {
  'gemini-charon':  { model: 'google/gemini-3.1-flash-tts-preview', voice: 'Charon', instructions: DIRECTION, pcm: 24000 },
  'gemini-fenrir':  { model: 'google/gemini-3.1-flash-tts-preview', voice: 'Fenrir', instructions: DIRECTION, pcm: 24000 },
  'gemini-algenib': { model: 'google/gemini-3.1-flash-tts-preview', voice: 'Algenib', instructions: DIRECTION, pcm: 24000 },
  'g38-charon': { model: 'google/gemini-3.8-flash-tts', voice: 'Charon', instructions: DIRECTION, pcm: 24000 },
  'g38-algenib': { model: 'google/gemini-3.8-flash-tts', voice: 'Algenib', instructions: DIRECTION, pcm: 24000 },
  'g38-orus': { model: 'google/gemini-3.8-flash-tts', voice: 'Orus', instructions: DIRECTION, pcm: 24000 },
  'g38-iapetus': { model: 'google/gemini-3.8-flash-tts', voice: 'Iapetus', instructions: DIRECTION, pcm: 24000 },
  'g38-algieba': { model: 'google/gemini-3.8-flash-tts', voice: 'Algieba', instructions: DIRECTION, pcm: 24000 },
  'g38-alnilam': { model: 'google/gemini-3.8-flash-tts', voice: 'Alnilam', instructions: DIRECTION, pcm: 24000 },
  'g38-gacrux': { model: 'google/gemini-3.8-flash-tts', voice: 'Gacrux', instructions: DIRECTION, pcm: 24000 },
  'g38-rasalgethi': { model: 'google/gemini-3.8-flash-tts', voice: 'Rasalgethi', instructions: DIRECTION, pcm: 24000 },
  'grok-rex':       { model: 'x-ai/grok-voice-tts-1.0', voice: 'Rex' },
  'grok-leo':       { model: 'x-ai/grok-voice-tts-1.0', voice: 'Leo' },
  'mai-voice-2':    { model: 'microsoft/mai-voice-2', voice: 'en-US-Harper:MAI-Voice-2', instructions: DIRECTION },
  'minimax-hd':     { model: 'minimax/speech-2.8-hd', voice: 'English_Deep-VoicedGentleman' },
};

const AUDITION_TEXT = 'Remote session on Black Hole Studios. This is the tab that takes the words you wrote '
  + 'and sings them back to you, with a full band behind them. Hit Start, and listen.';

function findKey() {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY.trim();
  const dir = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'lyricist', 'Local Storage', 'leveldb');
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /\.(ldb|log)$/.test(f)) : [];
  // Newest file wins: LevelDB appends, so the most recent write is the live key.
  files.sort((a, b) => fs.statSync(path.join(dir, b)).mtimeMs - fs.statSync(path.join(dir, a)).mtimeMs);
  for (const f of files) {
    const raw = fs.readFileSync(path.join(dir, f)).toString('latin1');
    const all = raw.match(/sk-or-v1-[0-9a-f]{64}/g);
    if (all) return all[all.length - 1];
  }
  throw new Error('No OpenRouter key found. Save it in the app (Settings) or set OPENROUTER_API_KEY.');
}

// Same reading fixes the Kokoro bake needed; symbols are never spoken aloud.
function speakable(text) {
  return text
    .replace(/\b4\.2\.0\b/g, '4, 2, 0').replace(/\b[Rr]ec\b/g, 'record').replace(/\s\+\s/g, ' plus ').replace(/\bA\/B\b/g, 'A B').replace(/&/g, ' and ')
    .replace(/\s*\/\s*/g, ' and ').replace(/[—–]/g, ', ').replace(/[“”]/g, '').replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ').trim();
}

async function speak(key, spec, text, outMp3) {
  const { pcm, ...req } = spec;
  const body = { ...req, input: speakable(text), response_format: pcm ? 'pcm' : 'mp3' };
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(API, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'X-Title': 'Lyricist Pro narration bake' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      const tmp = outMp3 + (pcm ? '.raw.pcm' : '.raw.mp3');
      fs.writeFileSync(tmp, buf);
      finish(tmp, outMp3, pcm);
      fs.unlinkSync(tmp);
      return;
    }
    const msg = (await res.text()).slice(0, 300);
    if (res.status < 500 && res.status !== 429) throw new Error(`${res.status} ${msg}`);
    await new Promise((r) => setTimeout(r, 1500 * attempt));
    if (attempt === 3) throw new Error(`${res.status} ${msg}`);
  }
}

// Level-match every clip and give it a short lead-in so a player starting late
// never clips the first consonant (build 051 said "Quant Lab"). No pitch shift,
// no chorus, no echo: the voice carries the character now.
function finish(inFile, outMp3, pcm) {
  const input = pcm ? ['-f', 's16le', '-ar', String(pcm), '-ac', '1', '-i', inFile] : ['-i', inFile];
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...input, '-af',
    'adelay=120:all=1,highpass=f=50,loudnorm=I=-16:TP=-1.5',
    '-codec:a', 'libmp3lame', '-q:a', '2', '-ar', '44100', '-ac', '1', outMp3]);
  if (r.status !== 0) throw new Error('ffmpeg: ' + r.stderr.toString().slice(0, 200));
}

// Same list the Voice Lab bakes from (src/services/narrationLines.js).
const lines = await import('file:///' + path.join(ROOT, 'src', 'services', 'narrationLines.js').split(path.sep).join('/'));

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const key = findKey();

if (args.includes('--audition')) {
  const out = opt('--out') || path.join(ROOT, 'voice-auditions');
  fs.mkdirSync(out, { recursive: true });
  const only = opt('--candidates')?.split(',');
  for (const [name, spec] of Object.entries(CANDIDATES)) {
    if (only && !only.includes(name)) continue;
    try { await speak(key, spec, AUDITION_TEXT, path.join(out, `${name}.mp3`)); console.log('ok  ', name); }
    catch (e) { console.log('FAIL', name, e.message); }
  }
} else {
  const name = opt('--voice');
  const spec = CANDIDATES[name];
  if (!spec) { console.log('Pick a voice: --voice ' + Object.keys(CANDIDATES).join(' | ')); process.exit(1); }
  const which = opt('--only');
  const jobs = [];
  if (which !== 'wizard') {
    let g = lines.ghostLines();
    if (opt('--tab')) g = g.filter((l) => l.tabId === opt('--tab'));
    if (opt('--ids')) g = g.filter((l) => opt('--ids').split(',').includes(l.id));
    jobs.push(...g.map((l) => ({ ...l, dir: GHOST_DIR })));
  }
  if (which !== 'ghost' && !opt('--tab')) jobs.push(...lines.wizardLines().filter((l) => !opt('--ids') || opt('--ids').split(',').includes(l.id)).map((l) => ({ ...l, dir: WIZARD_DIR })));
  const manifestPath = path.join(GHOST_DIR, 'manifest.json');
  const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : {};
  let fails = 0;
  for (const [n, job] of jobs.entries()) {
    try {
      await speak(key, spec, job.text, path.join(job.dir, `${job.id}.mp3`));
      if (job.dir === GHOST_DIR) manifest[job.id] = { text: job.text, words: job.text.split(/\s+/).length };
      console.log(`[${n + 1}/${jobs.length}] ${job.id}`);
    } catch (e) { fails++; console.log(`[${n + 1}/${jobs.length}] FAIL ${job.id}: ${e.message}`); }
  }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(fails ? `${fails} failed` : 'all baked', `(voice ${name})`);
}
