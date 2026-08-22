/**
 * MINIMAX'S OWN CAPTION SKILL, SHIPPED WHOLE AND UNTOUCHED.
 *
 * Chris, 2026-08-22: *"I want the ghost to only run this skill, DO NOT CHANGE
 * IT CLAUDE!!!!"* — `npx skills add MiniMax-AI/MiniMax-Music3 --skill
 * music-caption-rewriter`.
 *
 * So the published skill goes in as it is: `SKILL.md`, `references/genre-router.md`,
 * eighteen family indexes and all 1,000 caption templates, byte for byte, no
 * summary and no house rewrite. `resources/music-caption-rewriter` is a straight
 * copy of the installed skill and the app never edits a single file in it.
 *
 * WHAT THIS MODULE IS FOR. The skill is written for an agent that can read
 * files, and its whole method is progressive disclosure: read the router, read
 * one or two family indexes, then read only the two or three templates you
 * chose. The Ghost talks to OpenRouter and cannot open a file, so this side
 * does the reading and the Ghost does the thinking, which is exactly the split
 * the skill describes. Nothing here decides anything the skill reserves for the
 * model, and nothing here shortens what the skill says.
 *
 * It also refuses to hand back anything outside the skill folder. The names of
 * families and templates come from the model, and a model's output is not a
 * path you trust.
 */
const path = require('path');
const fs = require('fs');
const { app } = require('electron');

const FOLDER = 'music-caption-rewriter';

/** Packaged next to the notebook; from the repo when running from source. */
function skillDir() {
  const packed = path.join(process.resourcesPath || '', FOLDER);
  if (fs.existsSync(packed)) return packed;
  return path.join(__dirname, 'resources', FOLDER);
}

/**
 * Read one file out of the skill, and only out of the skill.
 *
 * The family index and the three template names are chosen by the model, so
 * they arrive as untrusted text. Resolve, then check the resolved path is still
 * inside the folder: `..` and an absolute path both die here.
 */
function readInside(relative) {
  const root = path.resolve(skillDir());
  const wanted = path.resolve(root, String(relative || ''));
  if (wanted !== root && !wanted.startsWith(root + path.sep)) {
    throw new Error(`"${relative}" is not part of the caption skill.`);
  }
  if (!fs.existsSync(wanted)) throw new Error(`The caption skill has no "${relative}".`);
  return fs.readFileSync(wanted, 'utf8');
}

/** The eighteen family names, taken from the files that are actually there. */
function familyNames() {
  return fs.readdirSync(path.join(skillDir(), 'references'))
    .filter((f) => /^index-.*\.md$/.test(f))
    .map((f) => f.replace(/^index-/, '').replace(/\.md$/, ''))
    .sort();
}

/** Stage one: the skill itself, its first disclosure layer, and the list of
 *  families that exist, so a model's answer can be held against reality. */
function opening() {
  return {
    ok: true,
    skill: readInside('SKILL.md'),
    router: readInside(path.join('references', 'genre-router.md')),
    families: familyNames(),
  };
}

/**
 * Stage two: the one or two family indexes the router chose.
 *
 * Capped at two because the skill's own routing contract says "Read no more
 * than two family indexes for ordinary requests." The cap is the skill's, not
 * ours.
 */
function indexes(families = []) {
  const wanted = (Array.isArray(families) ? families : [families]).slice(0, 2);
  const out = [];
  for (const family of wanted) {
    const name = String(family || '').trim().replace(/\.md$/i, '');
    if (!name) continue;
    const file = name.startsWith('index-') ? `${name}.md` : `index-${name}.md`;
    out.push({ family: name, text: readInside(path.join('references', file)) });
  }
  if (!out.length) throw new Error('No family index was chosen.');
  return { ok: true, indexes: out };
}

/**
 * Stage three: only the templates named by the chosen cards.
 *
 * Three is the skill's ceiling ("Select up to three references with different
 * responsibilities"), so three it is.
 */
function templates(ids = []) {
  const wanted = (Array.isArray(ids) ? ids : [ids]).slice(0, 3);
  const out = [];
  for (const id of wanted) {
    const name = String(id || '').trim();
    if (!name) continue;
    const file = /\.txt$/i.test(name) ? name : `${name}.txt`;
    out.push({ id: name.replace(/\.txt$/i, ''), text: readInside(path.join('templates', file)) });
  }
  if (!out.length) throw new Error('No template was chosen.');
  return { ok: true, templates: out };
}

/** Is the skill actually here, and how much of it. Used by the setup check. */
function present() {
  try {
    const dir = skillDir();
    return {
      ok: true,
      dir,
      templates: fs.readdirSync(path.join(dir, 'templates')).filter((f) => f.endsWith('.txt')).length,
      families: fs.readdirSync(path.join(dir, 'references')).filter((f) => /^index-.*\.md$/.test(f)).length,
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

module.exports = { skillDir, opening, indexes, templates, present, familyNames };
