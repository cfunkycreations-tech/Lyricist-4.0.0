/**
 * Generate the wizard recording script FROM THE SOURCE OF TRUTH.
 *
 * It imports wizardCards.js rather than parsing it, so the text Chris reads is
 * character-for-character the text the app narrates, and the filename beside
 * each script is the one that card actually plays.
 *
 * THAT PAIRING IS THE WHOLE POINT. The cards were reordered over time and the
 * audio files kept their original names, so card 2 plays card-15.mp3 and card 4
 * plays card-18.mp3. Anyone typing this list out by hand would pair them by
 * position and every reordered card would narrate the wrong tab.
 *
 *   node scripts/make-recording-script.mjs
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

// Import by URL HREF, not by converted path: on Windows a bare V:\... path is
// rejected by the ESM loader as an unsupported 'v:' scheme.
const { WIZARD_CARDS } = await import(
  new URL('../src/components/Onboarding/wizardCards.js', import.meta.url).href
);

const L = [];
const p = (s = '') => L.push(s);

p('# LYRICIST 4.2.0 — WIZARD NARRATION, RECORDING SCRIPT');
p();
p('Generated from `src/components/Onboarding/wizardCards.js`. If a script changes in the app,');
p('re-run `node scripts/make-recording-script.mjs` rather than editing this file.');
p();
p(`${WIZARD_CARDS.length} cards, plus the splash voice-over.`);
p();
p('## WHERE THE FILES GO');
p();
p('```');
p('%APPDATA%\\Lyricist\\voice\\');
p('```');
p();
p("Paste that into Explorer's address bar and press enter. The app can also open it for you.");
p();
p('`mp3`, `m4a`, `wav` and `ogg` all work. Drop a file in, restart the app, and your voice');
p('replaces the built-in narration for that card. Do them a few at a time if you like —');
p('anything you have not recorded keeps the current voice, so nothing breaks half-finished.');
p();
p('## THE FILENAME IS NOT THE CARD NUMBER');
p();
p('The cards were reordered over time and the audio files kept their original names.');
p('**Save each recording under the filename in its heading, not the card position.**');
p('Card 2 is `card-15.mp3`. Card 4 is `card-18.mp3`. Pairing them by position instead');
p('would make those cards narrate the wrong tab.');
p();
p('| Card | Subject | SAVE AS |');
p('|---:|---|---|');
for (const c of WIZARD_CARDS) {
  const subject = c.title.includes(':') ? c.title.split(':')[0] : c.title;
  p(`| ${c.id} | ${subject} | \`${c.audio}\` |`);
}
p('| — | the title video voice-over | `splash.mp3` |');
p();
p('---');
p();

for (const c of WIZARD_CARDS) {
  p(`## CARD ${c.id} — save as \`${c.audio}\``);
  p();
  p(`*${c.title}*`);
  p();
  for (const para of c.script.split(/\n\n+/)) p(para.trim());
  p();
  p('---');
  p();
}

const out = path.join(root, 'WIZARD-RECORDING-SCRIPT.md');
writeFileSync(out, L.join('\n'), 'utf8');
console.log('wrote', out);
console.log('cards:', WIZARD_CARDS.length);

// Prove every card names a distinct file — a duplicate would mean two cards
// share a recording and one of them is narrating the wrong thing.
const seen = new Map();
for (const c of WIZARD_CARDS) {
  if (seen.has(c.audio)) console.log('!! DUPLICATE FILENAME', c.audio, 'cards', seen.get(c.audio), 'and', c.id);
  seen.set(c.audio, c.id);
}
console.log('distinct filenames:', seen.size);
