/**
 * THE GHOST'S REPLY PARSER AND ACTION BUS, CHECKED OFFLINE.
 *
 * No key, no network, no window: the parts of Ask the Ghost that decide WHAT RUNS
 * and IN WHAT ORDER, and whether a refusal is reported as one.
 *
 *   npm run check:ghost
 */
import { splitActions } from '../src/services/GhostService.js';
import { registerGhostAction, runGhostAction, tabForAction } from '../src/services/ghostBus.js';

let bad = 0;
let n = 0;
const ok = (name, cond, extra = '') => {
  n += 1;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? `  ${extra}` : ''}`);
  if (!cond) bad += 1;
};
const names = (r) => r.actions.map((a) => a.name).join(' > ');

console.log('--- order is the order the model wrote ---');
{
  const r = splitActions([
    '<do>{"action":"songwriter_set_style","args":{"genres":["Trap"]}}</do>',
    '<lyrics>[Verse 1]\nsteel in my hands</lyrics>',
    '<caption>Global Metadata\nBasic Attributes: bpm is 98.</caption>',
    '<do>{"action":"make_the_song"}</do>',
  ].join('\n'));
  ok('style, lyrics, caption, make keep their order', names(r) === 'songwriter_set_style > set_lyrics > set_caption > make_the_song', names(r));
}
{
  const r = splitActions('<do>{"action":"a"}</do> mid <do>{"action":"b"}</do><lyrics>x</lyrics><do>{"action":"c"}</do>');
  ok('three do tags around a lyrics tag stay in sequence', names(r) === 'a > b > set_lyrics > c', names(r));
}

console.log('--- the caption and the lyrics are kept apart ---');
{
  const r = splitActions('<lyrics>Global Metadata\nBasic Attributes: bpm is 98.\n\n[Verse 1]\nsteel in my hands</lyrics>');
  const cap = r.actions.find((a) => a.name === 'set_caption');
  const words = r.actions.find((a) => a.name === 'set_lyrics');
  ok('a caption stuck on the front of the lyrics is peeled off', !!cap && /bpm is 98/.test(cap.args.text));
  ok('the lyrics that remain start at the first section', words && words.args.text.startsWith('[Verse 1]') && !/Global Metadata/.test(words.args.text));
}
{
  const r = splitActions('<lyrics>Global Metadata\nBasic Attributes: stray\n\n[Verse 1]\nwords</lyrics><caption>the real caption</caption>');
  const caps = r.actions.filter((a) => a.name === 'set_caption');
  ok('a proper caption tag wins even when it comes AFTER the lyrics', caps.length === 1 && caps[0].args.text === 'the real caption', JSON.stringify(caps.map((c) => c.args.text)));
}
{
  const r = splitActions('<lyrics>A line of prose first\n[Verse 1]\nwords</lyrics>');
  const words = r.actions.find((a) => a.name === 'set_lyrics');
  ok('lyrics that merely open with prose are left as written', words && words.args.text.startsWith('A line of prose first') && !r.actions.some((a) => a.name === 'set_caption'));
}

console.log('--- machinery never reaches the screen ---');
{
  const r = splitActions('Sure.\n<do>{"action":"set_caption","args":{"style":"Basic Attributes: bpm is');
  ok('a truncated tag is cut, not printed', r.text === 'Sure.' && !/<do>/.test(r.text) && r.actions.length === 0, JSON.stringify(r.text));
}
{
  const r = splitActions('Here you go.\n<do>{"action":"x"}</do>');
  ok('prose is kept, tags are removed', r.text === 'Here you go.' && !/<do>/.test(r.text));
}
{
  const r = splitActions('<do>{not json}</do><do>{"action":"ok"}</do>');
  ok('a malformed do block is dropped and the next one still runs', names(r) === 'ok', names(r));
}

console.log('--- which tab owns an action ---');
ok('songwriter_*  -> songwriter', tabForAction('songwriter_write_song') === 'songwriter');
ok('ghostrider_*  -> analyzer', tabForAction('ghostrider_save_song') === 'analyzer');
ok('set_lyrics    -> onemanband', tabForAction('set_lyrics') === 'onemanband');
ok('matrix_*      -> quantum', tabForAction('matrix_autocraft') === 'quantum');

console.log('--- a refusal is reported as a refusal ---');
registerGhostAction('t_refuses', async () => ({ ok: false, said: 'No such voice: Bob' }));
registerGhostAction('t_throws', async () => { throw new Error('boom'); });
registerGhostAction('t_object_ok', async () => ({ said: 'done', undo: { action: 'u' } }));
registerGhostAction('t_string_ok', async () => 'did it');
registerGhostAction('t_nothing', async () => undefined);
{
  const r = await runGhostAction('t_refuses');
  ok('{ ok:false, said } stays failed and keeps its message', r.ok === false && r.said === 'No such voice: Bob', JSON.stringify(r));
}
{
  const r = await runGhostAction('t_throws');
  ok('a thrown error is a failure with its message', r.ok === false && r.said === 'boom');
}
{
  const r = await runGhostAction('t_object_ok');
  ok('a structured success stays a success and keeps its undo', r.ok === true && r.said === 'done' && r.undo?.action === 'u');
}
{
  const r = await runGhostAction('t_string_ok');
  ok('a plain string is still a success', r.ok === true && r.said === 'did it');
}
{
  const r = await runGhostAction('t_nothing');
  ok('returning nothing is still a success', r.ok === true);
}

console.log('\n--- Sly Ghost: checks every job step, never breaks a job ---');
{
  const { slyCheck, prepTab, newBanned, readVerdict } = await import('../src/services/slyGhost.js');
  const { setJobDeps, addJob, subscribeJobs } = await import('../src/services/ghostJobs.js');
  const GR = (words) => [`GHOST RIDER TAB: artist "Sly".\nLyrics it wrote in that style:\n[Verse]\n${words}\nSuno tags: Funk`];

  // Run one job through the real job runner, with the Ghost's work stubbed and Sly real.
  const runJob = ({ steps, ghost, ask }) => new Promise((resolve) => {
    const seen = [];
    setJobDeps({
      planJob: async () => steps,
      runStep: async (job, i, signal, attempt) => {
        seen.push({ i, attempt, said: job.steps[i].said });
        const { did, before, after } = ghost(i, attempt);
        const sly = await slyCheck({ job, index: i, attempt, before, after, did, signal, ask });
        const all = sly.entry ? [...did, sly.entry] : did;
        return sly.ok ? { ok: true, said: 'ok', did: all } : { ok: false, said: sly.entry.said, did: all };
      },
      record: async () => ({ ok: true }),
    });
    const id = addJob({ prompt: 'test job', start: true });
    const off = subscribeJobs((list) => {
      const j = list.find((x) => x.id === id);
      if (j && ['done', 'failed', 'stopped'].includes(j.status)) { setTimeout(() => off?.(), 0); resolve({ job: j, seen }); }
    });
  });

  {
    let asked = 0;
    const { job } = await runJob({
      steps: ['Study Sly on Ghost Rider', 'Write the song'],
      ghost: () => ({ did: [{ name: 'ghostrider_write', ok: true, said: 'wrote it' }], before: [], after: GR('a busted Impala') }),
      ask: async () => { asked += 1; return 'MISSED: nothing there'; },
    });
    ok('a checker that always says MISSED still lets the job finish', job.status === 'done', `status ${job.status}`);
    ok('it asked once per try: first try and one retry per step', asked === 4, `${asked} asks`);
    ok('the second miss is a note, not a failure', job.steps.every((s) => s.did.some((d) => d.name === 'sly' && d.warn && d.ok)));
  }
  {
    const { job, seen } = await runJob({
      steps: ['Write a song in his style'],
      ghost: (i, attempt) => ({
        did: [{ name: 'ghostrider_write', ok: true }],
        before: GR('the chorus'),
        after: GR(attempt ? 'a pawn shop guitar' : 'neon on the dash'),
      }),
      ask: async () => 'DONE',
    });
    const retry = seen.find((s) => s.attempt === 1);
    ok('a banned word gets exactly one retry', seen.length === 2 && job.status === 'done', `${seen.length} tries, ${job.status}`);
    ok('the retry carries what Sly caught', /Sly Ghost/.test(retry?.said || '') && /neon/.test(retry?.said || ''), retry?.said);
    ok('the clean retry is checked off', job.steps[0].did.some((d) => d.name === 'sly' && d.ok && !d.warn));
  }
  {
    let asked = 0;
    const r = await slyCheck({
      job: { prompt: 'x', steps: [{ text: 'Make the song' }] }, index: 0, attempt: 0,
      did: [{ name: 'make_the_song', ok: true, said: 'started it' }], ask: async () => { asked += 1; return 'MISSED: no song'; },
    });
    ok('a song that has only started passes without asking', r.ok && asked === 0, r.entry?.said);
  }
  {
    const ac = new AbortController();
    const t0 = Date.now();
    const p = slyCheck({
      job: { prompt: 'x', steps: [{ text: 'Write' }] }, index: 0, did: [{ name: 'songwriter_write_song', ok: true }], signal: ac.signal,
      ask: () => new Promise(() => {}),
    });
    setTimeout(() => ac.abort(), 30);
    const r = await p;
    ok('Stop cuts the check off and passes', r.ok && Date.now() - t0 < 1000, `${Date.now() - t0}ms`);
  }
  {
    const r = await slyCheck({
      job: { prompt: 'x', steps: [{ text: 'Write' }] }, index: 0, did: [{ name: 'songwriter_write_song', ok: true }],
      ask: () => new Promise(() => {}), timeoutMs: 40,
    });
    ok('a model that never answers is a pass after the timeout', r.ok);
  }
  {
    const r = await slyCheck({
      job: { prompt: 'x', steps: [{ text: 'Write' }] }, index: 0, did: [{ name: 'songwriter_write_song', ok: true }],
      ask: async () => { throw new Error('No OpenRouter key'); },
    });
    ok('no key is a pass, not a failed step', r.ok && r.entry === null);
  }
  ok('his own topic word is his', newBanned([], GR('midnight train'), 'a song about midnight').length === 0);
  ok('a banned word already there before the step is not blamed on it', newBanned(GR('rain'), GR('rain and more'), '').length === 0);
  ok('a style report is not lyrics', newBanned([], ['GHOST RIDER TAB\nIts style report starts: echoes of the delta'], '').length === 0);
  ok('the verdict reads MISSED with its reason', readVerdict('MISSED: no lyrics in Songwriter').note === 'no lyrics in Songwriter');
  ok('anything else reads as done', readVerdict('Looks good, DONE.').missed === false);
  const TABS = [{ id: 'songwriter', label: 'Songwriter' }, { id: 'onemanband', label: 'Black Hole Studios' }, { id: 'loopstation', label: 'RC-Funk 5000' }];
  ok('a button-driven tab not on screen gets opened', prepTab('Start the drum machine on RC-Funk 5000', { tabs: TABS, visible: 'songwriter' })?.id === 'loopstation');
  ok('the tab already on screen is left alone', prepTab('Start RC-Funk 5000', { tabs: TABS, visible: 'loopstation' }) === null);
  ok('a tab whose actions are live is left to the bus', prepTab('Send it to Black Hole Studios', { tabs: TABS, visible: 'songwriter', available: ['describe_song'] }) === null);
  ok('a never-opened tab with actions gets opened', prepTab('Send it to Black Hole Studios', { tabs: TABS, visible: 'songwriter', available: [] })?.id === 'onemanband');
}

console.log(bad ? `\nGhost check FAILED: ${bad} of ${n}.` : `\nGhost check passed: ${n} checks.`);
process.exit(bad ? 1 : 0);
