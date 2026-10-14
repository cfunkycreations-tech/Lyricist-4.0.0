/**
 * MINIMAX'S CAPTION SKILL ON THE PHONE.
 *
 * The desktop app reads the skill off disk (captionSkill.js, through the
 * Electron bridge). The phone has no disk to read, so "Rewrite with AI" said
 * "only runs in the desktop app" and every song Chris made on his iPhone went
 * out on the bare offline draft: "drums and bass played the way Grunge plays
 * them". That is why his own songs came out generic while the samples, which
 * carry hand-written captions, sounded right.
 *
 * So the phone reads the same files from MiniMax's own repository, pinned to
 * the commit our desktop copy came from (byte-identical, checked), one file at
 * a time exactly as the skill asks. Nothing of theirs is copied onto our site.
 *
 * Same four calls and the same caps as the desktop bridge: two family indexes,
 * three templates. captionSkillRunner.js uses whichever one exists.
 */
const COMMIT = '945655064d59b98004dd70002e7eb5c8c6e11373';
const BASE = `https://raw.githubusercontent.com/MiniMax-AI/MiniMax-Music3/${COMMIT}/skills/music-caption-rewriter/`;

/** The eighteen index-*.md files in references/, as the skill names them. */
const FAMILIES = [
  'cinematic-orchestral-epic', 'cinematic-pop-ballad', 'club-edm-house-trance',
  'contemporary-folk-acoustic', 'country-americana', 'dance-pop-disco-funk',
  'east-asian-ballad-heritage', 'east-asian-modern', 'electronic-synth-ambient-pop',
  'general-pop-ballad', 'hip-hop-rap', 'jazz-swing-big-band', 'metal-heavy-rock',
  'modern-rnb-neo-soul', 'pop-alternative-rock', 'roots-traditional-global',
  'soul-blues-gospel', 'traditional-vocal-stage',
];

// Files never change at a pinned commit, so one read per session is enough.
const cache = new Map();
async function read(path) {
  if (!cache.has(path)) {
    cache.set(path, fetch(BASE + path).then((r) => {
      if (!r.ok) throw new Error(`The caption skill file ${path} did not load (${r.status}).`);
      return r.text();
    }).catch((e) => { cache.delete(path); throw e; }));
  }
  return cache.get(path);
}

const fail = (e) => ({ ok: false, error: navigator.onLine === false
  ? 'No signal. The caption skill needs the internet.'
  : (e?.message || 'The caption skill could not be read.') });

export const captionSkillWeb = {
  async captionSkillPresent() {
    return { ok: true, templates: 1000, families: FAMILIES.length, web: true };
  },

  async captionSkillOpen() {
    try {
      const [skill, router] = await Promise.all([read('SKILL.md'), read('references/genre-router.md')]);
      return { ok: true, skill, router, families: [...FAMILIES] };
    } catch (e) { return fail(e); }
  },

  async captionSkillIndexes(families = []) {
    try {
      const wanted = (Array.isArray(families) ? families : [families])
        .map((f) => String(f || '').trim().replace(/\.md$/i, '').replace(/^index-/, ''))
        .filter((f) => FAMILIES.includes(f))
        .slice(0, 2);
      if (!wanted.length) throw new Error('No family index was chosen.');
      const texts = await Promise.all(wanted.map((f) => read(`references/index-${f}.md`)));
      return { ok: true, indexes: wanted.map((family, i) => ({ family, text: texts[i] })) };
    } catch (e) { return fail(e); }
  },

  async captionSkillTemplates(ids = []) {
    try {
      const wanted = (Array.isArray(ids) ? ids : [ids])
        .map((id) => String(id || '').trim().replace(/\.txt$/i, ''))
        .filter((id) => /^[a-z0-9][a-z0-9-]*_\d{4}$/i.test(id))
        .slice(0, 3);
      if (!wanted.length) throw new Error('No template was chosen.');
      const texts = await Promise.all(wanted.map((id) => read(`templates/${id}.txt`)));
      return { ok: true, templates: wanted.map((id, i) => ({ id, text: texts[i] })) };
    } catch (e) { return fail(e); }
  },
};
