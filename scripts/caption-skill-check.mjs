/**
 * PROVE MINIMAX'S CAPTION SKILL ACTUALLY RUNS.
 *
 * The skill ships whole and untouched in `resources/music-caption-rewriter`,
 * and the app runs its three stages: route, compare cards, read the chosen
 * templates. This checks both halves.
 *
 *   node scripts/caption-skill-check.mjs                 files only, no network
 *   OPENROUTER_KEY=sk-or-... node scripts/caption-skill-check.mjs   full run
 *
 * The live half deliberately uses a FREE model, so proving the pipeline never
 * spends anything on the paid model Chris keeps at number one.
 */
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const skill = require('../captionSkill.js');

let bad = 0;
const ok = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? `  ${extra}` : ''}`);
  if (!cond) bad += 1;
};

console.log('--- the skill is here, whole and unedited ---');
const here = skill.present();
ok('the skill folder is found', here.ok, here.dir || here.error);
ok('all 1,000 reference captions shipped', here.templates === 1000, `${here.templates} templates`);
ok('all 18 family indexes shipped', here.families === 18, `${here.families} families`);

const open = skill.opening();
ok('SKILL.md reads', open.skill.includes('# Music Caption Rewriter'));
ok('its workflow is intact', open.skill.includes('progressive disclosure'));
ok('its output contract is intact',
  open.skill.includes('### Global Metadata')
  && open.skill.includes('### Vocal Details')
  && open.skill.includes('### Arrangement'));
ok('the genre router reads', open.router.includes('# Genre Router'));

console.log('\n--- progressive disclosure, one layer at a time ---');
const fam = skill.indexes(['country-americana']);
ok('a family index opens by name', fam.indexes[0].text.length > 10000,
  `${fam.indexes[0].text.length} bytes`);
const id = (/\b([a-z0-9-]+_\d{4})\b/.exec(fam.indexes[0].text) || [])[1];
ok('a card names a template', !!id, id);
ok('only the chosen template is read', skill.templates([id]).templates[0].text.length > 500);
ok('the two family cap is the skill’s own',
  skill.indexes(['country-americana', 'soul-blues-gospel', 'hip-hop-rap']).indexes.length === 2);
ok('the three reference cap is the skill’s own',
  skill.templates([id, id, id, id]).templates.length === 3);

console.log('\n--- a model’s answer is not a file path ---');
for (const escape of ['../../package', '..\\..\\main', '/etc/passwd']) {
  let stopped = false;
  try { skill.templates([escape]); } catch { stopped = true; }
  ok(`"${escape}" cannot be read`, stopped);
}

const key = process.env.OPENROUTER_KEY;
if (!key) {
  console.log('\n(no OPENROUTER_KEY set, so the live three stage run was skipped)');
} else {
  console.log('\n--- the whole skill, live, on a free model ---');
  globalThis.window = {
    lyricistAPI: {
      captionSkillPresent: async () => skill.present(),
      captionSkillOpen: async () => skill.opening(),
      captionSkillIndexes: async (families) => skill.indexes(families),
      captionSkillTemplates: async (ids) => skill.templates(ids),
    },
  };
  const { runCaptionSkill } = await import('../src/services/captionSkillRunner.js');
  const stages = [];
  const out = await runCaptionSkill({
    caption: 'Gritty blues rock about Austin changing, gravelly male voice, mid tempo, heavy on slide guitar.',
    lyrics: '[Verse]\nGlass towers where the dive bars stood\n\n[Chorus]\nDon’t you tell me it’s progress anymore',
    config: { openRouterApiKey: key, model: '' },
    onStage: (m) => m && stages.push(m),
  });
  console.log('   stages :', stages.join(' -> '));
  console.log('   family :', out.families.join(', '));
  console.log('   refs   :', out.templates.join(', '));
  console.log('   words  :', out.caption.split(/\s+/).length);
  ok('it routed to a real family', out.families.length >= 1);
  ok('it read real reference captions', out.templates.length >= 1);
  ok('the caption has all three headings',
    /Global Metadata/i.test(out.caption)
    && /Vocal Details/i.test(out.caption)
    && /Arrangement/i.test(out.caption));
  ok('it is a caption, not an essay or a stub',
    out.caption.split(/\s+/).length >= 150 && out.caption.split(/\s+/).length <= 900);
  ok('no lyric line was copied into it', !/glass towers|progress anymore/i.test(out.caption));
  console.log(`\n--- what it wrote ---\n${out.caption.slice(0, 700)}\n...`);
}

console.log(bad ? `\n${bad} FAILED` : '\nall good');
process.exit(bad ? 1 : 0);
