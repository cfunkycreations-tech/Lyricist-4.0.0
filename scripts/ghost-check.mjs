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

console.log(bad ? `\nGhost check FAILED: ${bad} of ${n}.` : `\nGhost check passed: ${n} checks.`);
process.exit(bad ? 1 : 0);
