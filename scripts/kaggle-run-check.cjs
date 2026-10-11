/**
 * THE LAST SONG IS NOT THIS SONG. Offline, with Kaggle stubbed: render() must not
 * take the previous run's finished status, or its songs, as this run's.
 *
 *   node scripts/kaggle-run-check.cjs
 */
const Module = require('module');
const fs = require('fs'); const path = require('path'); const { EventEmitter } = require('events');
const UD = path.join(require('os').tmpdir(), 'lyricist-run-check'); fs.rmSync(UD, { recursive: true, force: true }); fs.mkdirSync(UD, { recursive: true });
const origLoad = Module._load;
Module._load = function (req, ...rest) {
  if (req === 'electron') return { app: { getPath: () => UD } };
  return origLoad.call(this, req, ...rest);
};
// Waits collapse to nothing; Date.now runs a fake clock that each wait advances.
let clock = 1e12;
const realNow = Date.now;
Date.now = () => clock;
global.setTimeout = ((orig) => (fn, ms, ...a) => { clock += ms || 0; return orig(fn, 0, ...a); })(global.setTimeout);

const https = require('https');
let statuses = []; let files = []; let pushedRun = '';
https.request = (url, opts, cb) => {
  const req = new EventEmitter();
  req.end = (payload) => {
    const method = String(url).split('/').pop(); const body = JSON.parse(payload.toString());
    let status = 200, json = {};
    if (method === 'GetKernelSessionStatus' && body.kernelSlug === 'lyricist-model-cache') status = 404;
    else if (method === 'GetKernelSessionStatus') json = { status: statuses.length > 1 ? statuses.shift() : statuses[0] };
    else if (method === 'ListKernelSessionOutput') json = { files: files.map((f) => ({ fileName: f.replace('RUN', pushedRun), url: `https://x/${f.replace('RUN', pushedRun)}` })) };
    else if (method === 'SaveKernel') {
      if (body.slug.endsWith('/lyricist-one-man-band')) pushedRun = (/RUN\s+=\s+"([a-z0-9]*)"/.exec(JSON.parse(body.text).cells.map((c) => c.source).join('')) || [])[1];
      json = { url: 'u' };
    }
    const res = new EventEmitter(); res.statusCode = status;
    cb(res); res.emit('data', Buffer.from(JSON.stringify(json))); res.emit('end');
  };
  req.destroy = () => {}; req.on = req.on.bind(req);
  return req;
};
https.get = (url, opts, cb) => {
  const req = new EventEmitter();
  setImmediate(() => { const res = new EventEmitter(); res.statusCode = 200; res.headers = {}; cb(res); res.emit('data', Buffer.from(`audio of ${url}`)); res.emit('end'); });
  return req;
};
fs.mkdirSync(path.join(UD, 'kaggle'), { recursive: true });
fs.writeFileSync(path.join(UD, 'kaggle', 'kaggle-auth.json'), JSON.stringify({ token: 'KGAT_x', username: 'chris' }));
fs.writeFileSync(path.join(UD, 'kaggle', 'model-cache.json'), JSON.stringify({ pushedAt: realNow() }));
const k = require(path.join(__dirname, '..', 'kaggleCloud.js'));
let bad = 0;
const ok = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}  ${extra}`); if (!cond) bad += 1; };
(async () => {
  {
    // Old run still says COMPLETE for a while, its 30 second takes still listed alongside the new ones.
    statuses = ['COMPLETE', 'COMPLETE', 'QUEUED', 'RUNNING', 'RUNNING', 'COMPLETE'];
    files = ['take1_seed5_00001_.flac', 'take2_seed6_00001_.flac', 'take1_seed5_runRUN_00001_.flac', 'take2_seed6_runRUN_00001_.flac'];
    const start = clock;
    const r = await k.render({ caption: 'c', lyrics: 'l', seconds: 180, seeds: [5, 6] }, () => {}, () => false);
    ok('a stale COMPLETE right after the upload is not taken as done', r.ok && clock - start > 50000, `${Math.round((clock - start) / 1000)}s`);
    ok('only this run\'s two takes come home', r.ok && r.takes.length === 2 && r.takes.every((t) => t.fileName.includes(`_run${pushedRun}`)), (r.takes || []).map((t) => t.fileName).join(', '));
  }
  {
    // A stale ERROR from the last run must not fail this one either.
    statuses = ['ERROR', 'QUEUED', 'RUNNING', 'COMPLETE'];
    files = ['take1_seed7_runRUN_00001_.flac'];
    const r = await k.render({ caption: 'c', lyrics: 'l', seconds: 60, seeds: [7] }, () => {}, () => false);
    ok('a stale ERROR is not this run failing', r.ok && r.takes.length === 1, r.error || '');
  }
  {
    // Kaggle never shows this run queued: after ten minutes the status is believed.
    statuses = ['COMPLETE'];
    files = ['take1_seed8_00001_.flac'];
    const start = clock;
    const r = await k.render({ caption: 'c', lyrics: 'l', seconds: 60, seeds: [8] }, () => {}, () => false);
    ok('a run never seen still ends after ten minutes, without old songs', !r.ok && clock - start >= 10 * 60 * 1000 && /not in its output/.test(r.error || ''), `${Math.round((clock - start) / 60000)} min: ${r.error}`);
  }
  console.log(bad ? `${bad} FAILED` : 'all passed');
  process.exit(bad ? 1 : 0);
})();
