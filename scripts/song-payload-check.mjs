/**
 * PROVE THE SONG ACTUALLY LEAVES THE APP.
 *
 * Chris ran a real song on Kaggle and the notebook came back with
 * `CAPTION = """"""` and his caption sitting inside the LYRICS field. Two
 * faults met there, both invisible from inside the app: a misspelled property
 * on the Kaggle payload, and the Ghost putting both halves in one tag.
 *
 * Neither would have been caught by a green build, and both cost fifteen
 * minutes of a graphics card to discover. So they get checked here, offline,
 * in the second it takes to run:
 *
 *   node scripts/song-payload-check.mjs
 */
import { buildState } from '../src/services/MusicService.js';
import { splitActions } from '../src/services/GhostService.js';

let bad = 0;
const ok = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? `  ${extra}` : ''}`);
  if (!cond) bad += 1;
};

console.log('--- the caption reaches the engine ---');
const state = buildState({
  lyrics: '[Verse]\nsteel in my hands',
  globalMeta: 'Global Metadata\nBasic Attributes: bpm is 98.',
  vocals: '',
  arrangement: '',
});
// Exactly the join both engine paths do. `state.globalMeta` was the bug: it is
// undefined on every state object this app has ever built.
const joined = [state.global_meta, state.vocals, state.arrangement].filter(Boolean).join('\n\n');
ok('buildState stores the caption under global_meta', !!state.global_meta);
ok('the camelCase spelling is NOT a real property', state.globalMeta === undefined,
  'if this ever passes as defined, the old bug is back');
ok('the joined caption is not empty', joined.includes('bpm is 98'));

console.log('\n--- a caption sent inside the lyrics tag gets peeled apart ---');
const both = splitActions(`Here you go.

<lyrics>
Global Metadata
Basic Attributes: bpm is 98. key is A, and scale is minor.
Vocal Details
Vocal Gender & Timbre: gravelly male.

[Verse]
Steel in my hands and the sun going down

[Chorus]
So I sing it loud
</lyrics>`);
const cap = both.actions.find((a) => a.name === 'set_caption');
const lyr = both.actions.find((a) => a.name === 'set_lyrics');
ok('the caption half comes out as set_caption', !!cap && cap.args.text.startsWith('Global Metadata'));
ok('the words half comes out as set_lyrics', !!lyr && lyr.args.text.startsWith('[Verse]'));
ok('no caption schema is left in the words', !!lyr && !lyr.args.text.includes('Basic Attributes'));

console.log('\n--- an ordinary lyric sheet is left alone ---');
const plain = splitActions('<lyrics>\nsome opening line with no tag\n\n[Verse]\nand the words\n</lyrics>');
ok('prose before the first tag is not mistaken for a caption',
  !plain.actions.some((a) => a.name === 'set_caption'));
ok('the whole sheet stays in the words',
  plain.actions[0].args.text.startsWith('some opening line'));

console.log('\n--- an empty write can never reach the box ---');
const empty = splitActions('<lyrics>\n\n</lyrics>');
ok('an empty lyrics tag emits nothing at all', empty.actions.length === 0);

console.log(bad ? `\n${bad} FAILED` : '\nall good');
process.exit(bad ? 1 : 0);
