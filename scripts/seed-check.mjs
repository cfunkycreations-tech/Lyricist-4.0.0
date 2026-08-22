/**
 * A TAKE NUMBER THE MUSIC SERVER WILL ACCEPT.
 *
 * Chris pressed Make the song and got, in red, straight off the server:
 * `Value 143159582127780 is greater than maximum value 2147483647`.
 *
 * Every engine behind this app reads the seed as a signed 32 bit integer. The
 * roll button was picking anywhere up to 9,007,199,254,740,991, four million
 * times too big, so most rolls could never have worked. The takes that DID run
 * had seeds in the quadrillions and only survived because Kaggle's own ComfyUI
 * wrapped them quietly.
 *
 *   node scripts/seed-check.mjs
 */
import { safeSeed, SEED_MAX } from '../src/services/MusicService.js';

let bad = 0;
const ok = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? `  ${extra}` : ''}`);
  if (!cond) bad += 1;
};

console.log('--- the ceiling ---');
ok('it is the signed 32 bit maximum', SEED_MAX === 2147483647);

console.log('\n--- the numbers that actually broke it ---');
for (const n of [143159582127780, 8426736823601069, 6066865285498141, 9007199254740991]) {
  const v = safeSeed(n);
  ok(`${n} comes back usable`, Number.isInteger(v) && v >= 0 && v <= SEED_MAX, `-> ${v}`);
}

console.log('\n--- ordinary numbers are left alone ---');
for (const n of [0, 1, 222, 777, 2147483647]) {
  ok(`${n} is unchanged`, safeSeed(n) === n);
}

console.log('\n--- rubbish in ---');
ok('undefined becomes 0', safeSeed(undefined) === 0);
ok('a negative becomes positive', safeSeed(-500) === 500);
ok('a decimal is rounded down', safeSeed(12.9) === 12);
ok('text becomes 0', safeSeed('nonsense') === 0);

console.log('\n--- every roll, and every take number it makes ---');
let worst = 0;
for (let i = 0; i < 200000; i += 1) {
  const rolled = Math.floor(Math.random() * (SEED_MAX + 1));
  if (rolled > SEED_MAX) { worst = rolled; break; }
  // Four takes, the same stride the tab uses.
  for (let t = 0; t < 4; t += 1) {
    const v = safeSeed(rolled + t * 1013904223);
    if (v > SEED_MAX || v < 0) { worst = v; break; }
  }
  if (worst) break;
}
ok('200,000 rolls x 4 takes all fit', worst === 0, worst ? `first bad: ${worst}` : '');

console.log(bad ? `\n${bad} FAILED` : '\nall good');
process.exit(bad ? 1 : 0);
