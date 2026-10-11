/**
 * THE LAST SONG IS NOT THIS SONG. Offline, with Kaggle stubbed: render() must not
 * take the previous run's finished status, or its songs, as this run's. Then the
 * lyric video end to end: upload, dataset, push, wait, and only this run's files.
 *
 *   node scripts/kaggle-run-check.cjs
 */
const Module = require('module');
const fs = require('fs'); const path = require('path'); const { EventEmitter } = require('events'); const { Readable } = require('stream');
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
// The video's own Kaggle: the upload address, the dataset and what was pushed.
const V = { put: null, calls: [], dsStatus: [], dsFiles: [], name: '', save: null };
https.request = (url, opts, cb) => {
  const req = new EventEmitter();
  req.end = (payload) => {
    if (String(url).startsWith('https://upload/')) {
      V.put = { method: opts.method, headers: opts.headers, size: payload.length };
      const res = new EventEmitter(); res.statusCode = 200;
      cb(res); res.emit('end');
      return;
    }
    const method = String(url).split('/').pop(); const body = JSON.parse(payload.toString());
    V.calls.push(method);
    let status = 200, json = {};
    if (method === 'StartBlobUpload') { V.name = body.name; json = { token: 'blob-tok', createUrl: 'https://upload/abc' }; }
    else if (method === 'CreateDatasetVersion') { status = 403; json = { message: 'Permission denied' }; }
    else if (method === 'CreateDataset') { V.create = body; json = { ref: 'chris/lyricist-video-song', url: 'd' }; }
    else if (method === 'GetDatasetStatus') json = { status: V.dsStatus.length > 1 ? V.dsStatus.shift() : V.dsStatus[0] };
    else if (method === 'ListDatasetFiles') json = { datasetFiles: (V.dsFiles.length > 1 ? V.dsFiles.shift() : V.dsFiles[0]).map((n) => ({ name: n.replace('NEW', V.name) })) };
    else if (method === 'GetKernelSessionStatus' && /cache|models/.test(body.kernelSlug)) status = 404;
    else if (method === 'GetKernelSessionStatus') json = { status: statuses.length > 1 ? statuses.shift() : statuses[0] };
    else if (method === 'ListKernelSessionOutput') {
      const out = V.name.replace(/\.[^.]+$/, '');
      json = {
        files: files.map((f) => f.replace('RUN', pushedRun).replace('OUT', out)).map((f) => ({ fileName: f, url: `https://x/${f}` })),
        log: JSON.stringify([{ data: '6 of 7 pictures painted\n' }, { data: '10 lines timed by the singing\n' }]),
      };
    }
    else if (method === 'SaveKernel') {
      if (body.slug.endsWith('/lyricist-lyric-video')) V.save = body;
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
  setImmediate(() => { const res = Readable.from([Buffer.from(`audio of ${url}`)]); res.statusCode = 200; res.headers = {}; cb(res); });
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
  {
    // THE LYRIC VIDEO. The dataset still shows the last song as ready for a
    // while; the notebook still says the last video finished; the last video's
    // files are still in its output.
    const songs = path.join(UD, 'songs');
    fs.mkdirSync(songs, { recursive: true });
    const take = path.join(songs, 'take1_seed5_runabc_00001_.flac');
    fs.writeFileSync(take, Buffer.alloc(4096, 7));
    V.dsStatus = ['READY', 'READY', 'READY'];
    V.dsFiles = [['old-song-zz.flac'], ['old-song-zz.flac'], ['NEW']];
    statuses = ['COMPLETE', 'QUEUED', 'RUNNING', 'COMPLETE'];
    files = ['old-song-zz-lyric-video.mp4', 'OUT-lyric-video.mp4', 'OUT-chorus1-vertical.mp4', 'OUT.lrc', 'OUT.srt', 'OUT-notes.txt'];
    const said = [];
    const r = await k.renderVideo({ filePath: take, lyrics: '[Verse]\nhold the line', caption: 'warm soul' }, (p, m) => said.push(m), () => false);
    const out = V.name.replace(/\.[^.]+$/, '');
    ok('the song goes up whole, with no content type to upset the signed address',
      V.put && V.put.method === 'PUT' && V.put.size === 4096 && V.put.headers['Content-Length'] === 4096 && !V.put.headers['Content-Type']);
    ok('its name is the take plus this run\'s mark', /^take1_seed5_runabc_00001_-[a-z0-9]+\.flac$/.test(V.name), V.name);
    ok('a missing dataset is made, private, with the upload in it',
      V.create && V.create.isPrivate === true && V.create.slug === 'lyricist-video-song' && V.create.files[0].token === 'blob-tok' && V.create.licenseName === 'copyright-authors');
    ok('it waits until the dataset lists THIS song, not the last one', V.calls.filter((c) => c === 'ListDatasetFiles').length === 3);
    ok('the video notebook runs on the T4s with the song attached',
      V.save && V.save.enableGpu === true && V.save.machineShape === 'NvidiaTeslaT4'
      && JSON.stringify(V.save.datasetDataSources) === '["chris/lyricist-video-song"]'
      && JSON.stringify(V.save.kernelDataSources) === '[]');
    ok('the notebook is told the uploaded name', V.save && JSON.parse(V.save.text).cells.some((c) => c.source.includes(`AUDIO_NAME = "${V.name}"`)));
    const names = (r.files || []).map((f) => f.fileName).sort();
    ok('only this run\'s video, clip and lyric files come home', r.ok
      && JSON.stringify(names) === JSON.stringify([`${out}-chorus1-vertical.mp4`, `${out}-lyric-video.mp4`, `${out}.lrc`, `${out}.srt`]), names.join(', ') || r.error);
    ok('they land in the songs folder, whole, no half files left',
      r.ok && r.video === path.join(songs, `${out}-lyric-video.mp4`) && fs.readFileSync(r.video, 'utf8').startsWith('audio of https://x/')
      && !fs.readdirSync(songs).some((f) => f.endsWith('.part')));
    ok('it says how the run went', r.notes === '6 of 7 pictures painted, words timed to the singing', r.notes);
    ok('the first video says it is slower while the models save', said.some((m) => /first video/i.test(m || '')) && V.calls.includes('SaveKernel'));

    // Collect on reopen: a video Kaggle finished with nobody watching.
    fs.rmSync(path.join(songs, `${out}.srt`));
    statuses = ['COMPLETE'];
    const c = await k.collect();
    ok('collect brings a missed video file in, and leaves what is there alone',
      (c.videos || []).some((f) => f.fileName === `${out}.srt`) && !(c.videos || []).some((f) => f.fileName === `${out}-lyric-video.mp4`),
      (c.videos || []).map((f) => f.fileName).join(', '));
  }
  console.log(bad ? `${bad} FAILED` : 'all passed');
  process.exit(bad ? 1 : 0);
})();
