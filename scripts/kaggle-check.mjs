/**
 * PROVE THE KAGGLE PATH, FOR REAL.
 *
 * Two halves:
 *   1. Offline. Every shape a credential arrives in, including the ones people
 *      paste by mistake, run through the same parser the app uses.
 *   2. Live, only when a code is handed in. It signs in, pushes a tiny notebook
 *      to a throwaway slug, waits for it to finish and pulls the file back. That
 *      is every wire call "Render on Kaggle" makes, without spending a graphics
 *      card hour to find out whether they work.
 *
 *   node scripts/kaggle-check.mjs                     offline checks only
 *   KAGGLE_CODE=KGAT_xxx node scripts/kaggle-check.mjs   full end to end
 */
import { createRequire } from 'module';
import https from 'https';

const require = createRequire(import.meta.url);
const kaggle = require('../kaggleCloud.js');
const parse = kaggle.__test_parse;

let bad = 0;
const ok = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? `  ${extra}` : ''}`);
  if (!cond) bad += 1;
};
const throws = (name, text, want) => {
  try { parse(text); ok(name, false, 'it was accepted'); }
  catch (e) { ok(name, e.message.includes(want), `said: ${e.message}`); }
};

console.log('--- what people paste ---');
ok('a plain code', parse('KGAT_f6b285d3b491ea024f4be8299de4fb66').mode === 'token');
ok('spaces and a newline round it', parse('  KGAT_abcdef0123456789abcdef \n').token === 'KGAT_abcdef0123456789abcdef');
ok('the whole export line', parse('export KAGGLE_API_TOKEN=KGAT_abcdef0123456789abcdef').token === 'KGAT_abcdef0123456789abcdef');
ok('with curly quotes round it', parse('\u201cKGAT_abcdef0123456789abcdef\u201d').token === 'KGAT_abcdef0123456789abcdef');
ok('an old kaggle.json', parse('{"username":"chris","key":"0123456789abcdef0123456789abcdef"}').mode === 'basic');
ok('kaggle.json keeps the name', parse('{"username":"chris","key":"0123456789abcdef0123456789abcdef"}').username === 'chris');
throws('half a code', '0123456789abcdef0123456789abcdef', 'half of it');
throws('nothing at all', '   ', 'empty');
throws('an email address', 'funkchristo@gmail.com', 'not a Kaggle token');
throws('a truncated file', '{"username":"chris"', 'not complete');
throws('a file with no key', '{"username":"chris"}', 'no key');

console.log('\n--- the song going into the notebook ---');
const build = kaggle.__test_build;
const nbText = (opts) => {
  const nb = JSON.parse(build(opts));
  return String(nb.cells.find((c) => String(c.source).includes('CAPTION =')).source);
};
const TRIPLE = '"'.repeat(3);
const four = nbText({
  caption: `a ${TRIPLE} triple and a back\\slash`,
  lyrics: '[Verse]\nwords',
  seconds: 75,
  seeds: [222, 777, 3, 4, 5],
});
ok('every seed goes into ONE notebook', /SEEDS\s+= \[222, 777, 3, 4\]/.test(four), 'a fifth is capped away');
ok('a lone seed still works', /SEEDS\s+= \[9\]/.test(nbText({ caption: 'x', lyrics: 'y', seconds: 60, seed: 9 })));
ok('a triple quote cannot break the python', four.includes('\\"\\"\\"'));

console.log('\n--- the 12 GB model comes down once ---');
const model = kaggle.__test_model_files();
ok('the model list is read from the song notebook', model.files.length === 3 && model.repo === 'Comfy-Org/MiniMax-Music-3', model.files.join(', '));
const cacheSrc = String(JSON.parse(kaggle.__test_cache_build('hf_abcdefgh12345')).cells[0].source);
ok('the cache notebook fetches every model file', model.files.every((f) => cacheSrc.includes(f)));
ok('the cache notebook keeps them as its output', cacheSrc.includes('local_dir=WORK') && cacheSrc.includes('"/kaggle/working"'));
ok('the cache notebook carries the HF token', cacheSrc.includes('HF_TOKEN = "hf_abcdefgh12345"'));
ok('a junk token is left out of the cache notebook', String(JSON.parse(kaggle.__test_cache_build('x"; rm -rf')).cells[0].source).includes('HF_TOKEN = ""'));
const fetchCell = JSON.parse(build({ caption: 'x', lyrics: 'y', seconds: 60, seed: 1 }))
  .cells.map((c) => String(c.source)).find((s) => s.includes('hf_hub_download('));
ok('the song notebook looks for the saved copy before downloading',
  fetchCell.indexOf('saved_copy(name)') > 0 && fetchCell.indexOf('saved_copy(name)') < fetchCell.lastIndexOf('hf_hub_download('));
ok('nor can a backslash', four.includes('back\\\\slash'));
ok('the length goes in', /DURATION = 75/.test(four));
ok('every cell is one string, as Kaggle wants',
   JSON.parse(build({ caption: 'x', lyrics: 'y', seconds: 60, seed: 1 })).cells.every((c) => typeof c.source === 'string'));

console.log('\n--- what it says when a run fails ---');
const explain = kaggle.__test_explain;
// The real thing, trimmed: this is what came back from his 2026-08-21 run.
const NO_GPU_LOG = JSON.stringify([
  { stream_name: 'stdout', data: '/bin/bash: line 1: nvidia-smi: command not found\n' },
  { stream_name: 'stdout', data: 'torch 2.10.0+cpu | cuda None | GPUs 0\n' },
  { stream_name: 'stderr', data: "AssertionError: No GPU. Set Accelerator to 'GPU T4 x2' and restart the session.\n" },
]);
ok('a session with no graphics card is named as the phone check',
   /phone/i.test(explain(NO_GPU_LOG, 'FELL BACK')));
ok('and it says nothing was wasted',
   /nothing was used up/i.test(explain(NO_GPU_LOG, 'FELL BACK')));
ok('out of memory is its own answer',
   /shorter/i.test(explain('torch.cuda.OutOfMemoryError: CUDA out of memory', 'FELL BACK')));
ok('so is a full disk',
   /disk/i.test(explain('OSError: [Errno 28] No space left on device', 'FELL BACK')));
ok('an unknown error still hands back its last real line',
   explain(JSON.stringify([
     { stream_name: 'stderr', data: '0.00s - Debugger warning: frozen modules\n' },
     { stream_name: 'stderr', data: 'ValueError: something nobody predicted\n' },
     { stream_name: 'stderr', data: '[NbConvertApp] Writing 1974 bytes\n' },
   ]), 'FELL BACK').includes('ValueError: something nobody predicted'),
   'and drops the boilerplate every session prints');
ok('no log at all falls back rather than inventing one',
   explain('', 'FELL BACK') === 'FELL BACK');

const CODE = process.env.KAGGLE_CODE;
if (!CODE) {
  console.log(`\n${bad ? `${bad} FAILED` : 'offline checks all passed'}. No KAGGLE_CODE given, so the live half was skipped.`);
  process.exit(bad ? 1 : 0);
}

/* ---- live ---- */
const API = 'https://api.kaggle.com/v1';
const call = (service, method, body) => new Promise((res, rej) => {
  const p = Buffer.from(JSON.stringify(body || {}), 'utf8');
  const r = https.request(`${API}/${service}/${method}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': p.length,
      Authorization: `Bearer ${CODE}`,
      'User-Agent': 'Lyricist/4.2.0',
    },
  }, (x) => {
    const c = [];
    x.on('data', (d) => c.push(d));
    x.on('end', () => {
      const text = Buffer.concat(c).toString('utf8');
      let json = null;
      try { json = JSON.parse(text); } catch { /* keep the text */ }
      res({ status: x.statusCode, json, text });
    });
  });
  r.on('error', rej);
  r.end(p);
});

const SLUG = 'lyricist-connection-test';
/* No GPU and no internet: this is about the plumbing, not about music. It writes
   a real audio file because pulling one back is the last thing render() does. */
const NOTEBOOK = JSON.stringify({
  cells: [{
    cell_type: 'code',
    metadata: {},
    execution_count: null,
    outputs: [],
    source: [
      'import wave, struct, math\n',
      'f = wave.open("/kaggle/working/connection-test.wav", "w")\n',
      'f.setnchannels(1); f.setsampwidth(2); f.setframerate(8000)\n',
      'f.writeframes(b"".join(struct.pack("<h", int(12000*math.sin(i*0.15))) for i in range(8000)))\n',
      'f.close()\n',
      'print("Lyricist reached Kaggle and wrote a file.")\n',
    ],
  }],
  metadata: { kernelspec: { language: 'python', display_name: 'Python 3', name: 'python3' } },
  nbformat: 4,
  nbformat_minor: 4,
});

console.log('\n--- live, against the real account ---');
const who = await call('security.OAuthService', 'IntrospectToken', { token: CODE });
ok('the code signs in', who.status === 200 && who.json?.username, `as ${who.json?.username}`);
if (!who.json?.username) process.exit(1);
const user = who.json.username;

const push = await call('kernels.KernelsApiService', 'SaveKernel', {
  slug: `${user}/${SLUG}`,
  newTitle: 'Lyricist connection test',
  text: NOTEBOOK,
  language: 'python',
  kernelType: 'notebook',
  isPrivate: true,
  enableGpu: false,
  enableInternet: false,
  datasetDataSources: [],
  competitionDataSources: [],
  kernelDataSources: [],
  modelDataSources: [],
  categoryIds: [],
});
ok('the notebook uploads', push.status === 200 && !push.json?.error, `${push.status} ${String(push.text).slice(0, 160)}`);
if (push.status !== 200) process.exit(1);
console.log(`      ${push.json?.url || ''}`);

const started = Date.now();
let last = '';
while (Date.now() - started < 15 * 60 * 1000) {
  await new Promise((r) => setTimeout(r, 10000));
  const st = await call('kernels.KernelsApiService', 'GetKernelSessionStatus', { userName: user, kernelSlug: SLUG });
  const name = String(st.json?.status || `HTTP ${st.status}`);
  if (name !== last) { last = name; console.log(`      ${Math.round((Date.now() - started) / 1000)}s  ${name}`); }
  if (name === 'COMPLETE' || name === 'ERROR' || name === 'CANCEL_ACKNOWLEDGED') break;
}
ok('it runs and finishes', last === 'COMPLETE', last);

const out = await call('kernels.KernelsApiService', 'ListKernelSessionOutput', { userName: user, kernelSlug: SLUG, pageSize: 50 });
const files = (out.json?.files || []).filter((f) => /\.(flac|wav|mp3|ogg)$/i.test(f.fileName || ''));
ok('the audio comes back', files.length > 0, files.map((f) => f.fileName).join(', ') || String(out.text).slice(0, 160));
if (files.length) {
  const bytes = await new Promise((res, rej) => {
    const get = (u, hops = 0) => https.get(u, { headers: { 'User-Agent': 'Lyricist/4.2.0' } }, (r) => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location && hops < 5) { r.resume(); return get(new URL(r.headers.location, u).toString(), hops + 1); }
      const c = []; r.on('data', (d) => c.push(d)); r.on('end', () => res(Buffer.concat(c))); return undefined;
    }).on('error', rej);
    get(files[files.length - 1].url);
  });
  ok('the file downloads', bytes.length > 1000, `${bytes.length} bytes, header ${bytes.slice(0, 4).toString('latin1')}`);
}

console.log(`\n${bad ? `${bad} FAILED` : 'ALL PASSED, end to end, against a real Kaggle account'}.`);
process.exit(bad ? 1 : 0);
