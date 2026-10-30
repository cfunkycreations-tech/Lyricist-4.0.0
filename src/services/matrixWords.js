// The Matrix walkthrough types twenty different words every run, so the grid
// has plenty to work with and the demo never looks canned.
const MATRIX_WORD_POOL = [
  'pawn shop', 'borrowed truck', 'last paycheck', 'empty highway', 'static', 'fever', 'neon', 'rust', 'midnight', 'gasoline',
  'cigarette smoke', 'rearview', 'broken radio', 'summer rain', 'cold coffee', 'switchblade', 'sunburn', 'red dirt', 'back porch', 'jukebox',
  'whiskey', 'thunder', 'barbed wire', 'fireflies', 'concrete', 'gravel road', 'old guitar', 'ghost town', 'diesel', 'moonlight',
  'heartbreak', 'tattoo', 'bus ticket', 'rooftop', 'vinyl', 'candle wax', 'overdraft', 'sirens', 'daydream', 'graveyard shift',
  'hurricane', 'rhinestone', 'cracked screen', 'train whistle', 'bad decision', 'sweet tea', 'razor', 'static noise', 'dust', 'lightning',
];
export function randomMatrixWords(n) {
  const pool = [...MATRIX_WORD_POOL];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n).join(', ');
}

