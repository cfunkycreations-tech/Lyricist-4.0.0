/**
 * RUNNING MINIMAX'S CAPTION SKILL, THE WAY THE SKILL SAYS TO RUN IT.
 *
 * Chris, 2026-08-22: *"I want the ghost to only run this skill, DO NOT CHANGE
 * IT CLAUDE!!!!"*
 *
 * So this file contains no caption advice of its own. Not one rule about BPM,
 * not one heading, not one word about what a good caption looks like. Every
 * instruction the model sees comes out of `SKILL.md`, `genre-router.md`, the
 * family indexes and the templates, read off disk and passed through untouched.
 * The only prose written here is the bit that tells the model which stage of
 * the skill's own workflow it is currently on.
 *
 * WHY IT IS THREE CALLS AND NOT ONE. The skill's method IS the three stages:
 *
 *   "Find useful references through progressive disclosure: route to a small
 *    style family, compare compact cards, then read only the selected complete
 *    templates."
 *
 * and it says in as many words: "Do not ... scan all 1,000 templates." One call
 * with everything in it would be the thing it forbids, and it would not fit
 * anyway: the library is 4.2 MB and the biggest single family index is 37 KB.
 * So the app opens one layer at a time, exactly as written, and the model
 * chooses at each step.
 *
 * The last stage returns the caption and nothing else, because the skill's
 * Output Contract says so: three headings, no title, no track id, no template
 * id, no reasoning trace.
 */
import { assertApiKey } from './AIService.js';
import { stripReasoning } from '../utils/stripReasoning.js';
import { resolveGhostModel, freeGhostModels } from './GhostService.js';

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

/**
 * Stage one and two are choices, not prose, but a free model will often think
 * out loud on its way to one. 400 tokens cut a model off mid-sentence before it
 * ever named a template, so the room is for its working, not for its answer.
 */
const PICK_BUDGET = 1500;
/** The skill asks for roughly 250 to 450 English words across three headings. */
const WRITE_BUDGET = 3000;

const api = () => (typeof window !== 'undefined' ? window.lyricistAPI : null);

/** Is the skill on this machine at all? The desktop app carries it; a browser
 *  preview does not, and saying so beats failing three calls in. */
export async function captionSkillReady() {
  const r = await api()?.captionSkillPresent?.();
  return r?.ok ? r : { ok: false, error: r?.error || 'The caption skill only runs in the desktop app.' };
}

/**
 * Ask, and do not fall over because one free model is busy.
 *
 * The free pool is shared and it rate limits. Proving this on 2026-08-22 the
 * first choice came back
 * `z-ai/glm-5.2:free is temporarily rate-limited upstream` and killed the run
 * on stage one. A skill that takes three calls in a row cannot depend on one
 * name staying up for all three, so it works down the bench and remembers the
 * one that answered.
 */
async function askAnyOf({ system, user, models, key, budget, signal }) {
  let last = null;
  for (const model of models) {
    try {
      return { text: await askOne({ system, user, model, key, budget, signal }), model };
    } catch (e) {
      if (signal?.aborted) throw e;
      last = e;
    }
  }
  throw last || new Error('No model would answer.');
}

async function askOne({ system, user, model, key, budget, signal }) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://lyricist.app',
      'X-Title': 'Lyricist Pro',
    },
    body: JSON.stringify({
      model,
      max_tokens: budget,
      // The skill is a writing procedure, not a thinking-out-loud exercise, and
      // its Output Contract forbids a reasoning trace in the result.
      reasoning: { exclude: true },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
    signal,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(json?.error?.message || `OpenRouter answered ${res.status}.`);
  }
  const text = stripReasoning(String(json?.choices?.[0]?.message?.content || '')).trim();
  if (!text) throw new Error('The model sent an empty answer back.');
  return text;
}

/**
 * FIND THE ANSWER INSIDE WHATEVER IT SAID.
 *
 * Asked for template ids and nothing else, a free model opened with *"We need
 * to follow the workflow: step 5 is Select References... we can't actually read
 * files; we must simulate reasoning"* and never reached an id inside its token
 * budget. Reading the reply line by line and demanding a bare token found
 * `groove` and `transitions`, which are words in its prose.
 *
 * So do not parse the shape of the reply. Look for the things that are known to
 * exist, anywhere in it, in the order they appear, and ignore everything else.
 * `known` is a closed set: the eighteen family names, or the ids printed on the
 * cards it was just shown.
 */
function pickKnown(reply, known, limit) {
  const text = String(reply || '').toLowerCase();
  const found = [];
  for (const token of [...known]) {
    const at = text.indexOf(String(token).toLowerCase());
    if (at >= 0) found.push({ token, at });
  }
  return found
    .sort((a, b) => a.at - b.at)
    .map((f) => f.token)
    .filter((t, k, all) => all.indexOf(t) === k)
    .slice(0, limit);
}

/**
 * THE SKILL'S OWN CHECKS, RUN IN CODE.
 *
 * `Validate Before Returning` is a list the skill gives the model and ends with
 * "Revise once when any check fails, then return only the corrected result." A
 * check a model is asked to run on itself is a request, not a guarantee, and it
 * failed the very first live run: told not to quote, paraphrase or summarise the
 * lyrics, it put a whole line of Chris's chorus into the caption.
 *
 * So the two items that can be checked without judgement are checked here, and
 * a failure buys exactly the one revision the skill allows. Nothing is added to
 * the skill's list and nothing is invented: these are its own words.
 */
function failedChecks(text, lyrics) {
  const bad = [];
  for (const heading of ['Global Metadata', 'Vocal Details', 'Arrangement']) {
    if (!new RegExp(heading, 'i').test(text)) bad.push(`the "${heading}" heading is missing`);
  }
  const lines = String(lyrics || '')
    .split('\n')
    .map((l) => l.replace(/\[[^\]]*\]/g, '').trim())
    .filter((l) => l.split(/\s+/).length >= 4);
  const hay = text.toLowerCase();
  const copied = lines.filter((l) => hay.includes(l.toLowerCase()));
  if (copied.length) bad.push(`it reproduces the lyric line "${copied[0]}", and no lyric content may appear`);
  return bad;
}

/**
 * Run the whole skill and hand back the caption it wrote.
 *
 * `caption` is the user's own description, `lyrics` their words. Both are named
 * the way the skill's Inputs section names them, because that is what the model
 * is about to be told to expect.
 */
export async function runCaptionSkill({
  caption, lyrics = '', constraints = '', config, signal, onStage,
} = {}) {
  const brief = String(caption || '').trim();
  if (!brief) throw new Error('Write something in the Input Caption first, even one line. The skill rewrites a description, it does not invent one.');

  const key = assertApiKey(config);

  // Their own model first, then the free bench underneath it. One busy free
  // model must not be able to stop the skill half way through.
  const chosen = String(config?.model || '').trim();
  const bench = await freeGhostModels(4);
  let models = [chosen, ...bench].filter(Boolean);
  if (!models.length) {
    const one = await resolveGhostModel();
    if (!one) throw new Error('I could not reach OpenRouter to find a model. Check the internet and try again.');
    models = [one];
  }

  const bridge = api();
  if (!bridge?.captionSkillOpen) throw new Error('The caption skill only runs in the desktop app.');

  onStage?.('Reading the skill');
  const open = await bridge.captionSkillOpen();
  if (!open?.ok) throw new Error(open?.error || 'The caption skill could not be read.');

  // The user's inputs, laid out under the names the skill's Inputs section uses.
  const inputs = [
    `Caption: ${brief}`,
    lyrics.trim() ? `Lyrics:\n${lyrics.trim()}` : 'Lyrics: none supplied.',
    constraints.trim() ? `Additional constraints: ${constraints.trim()}` : '',
  ].filter(Boolean).join('\n\n');

  /* ---- stage 1: route ------------------------------------------------ */
  onStage?.('Routing to a style family');
  const routedRes = await askAnyOf({
    key,
    models,
    budget: PICK_BUDGET,
    signal,
    system: `${open.skill}\n\n---\n\nreferences/genre-router.md:\n\n${open.router}`,
    user: `${inputs}\n\nYou are at step 3 and 4 of the Workflow. Using the genre router above, `
      + `name the family index or indexes to read. Answer with the route names only, one per line, `
      + `at most two, nothing else. Example of the shape: country-americana`,
  });
  const routed = routedRes.text;
  models = [routedRes.model, ...models.filter((m) => m !== routedRes.model)];

  /**
   * A ROUTE NAME HAS TO BE ONE OF THE EIGHTEEN THAT EXIST.
   *
   * Asked to route a blues rock song the model answered `blues`, which is a
   * genre and not a family, and the read died on a file that was never there.
   * The router's own answers are a closed set, so hold the reply against the
   * files on disk and keep only real ones.
   *
   * When nothing matches, the fallback is the skill's own, in its words:
   * general pop and ballad, "Use only as fallback when no more specific genre
   * family is supported."
   */
  let families = pickKnown(routed, open.families || [], 2);
  if (!families.length && (open.families || []).includes('general-pop-ballad')) {
    families = ['general-pop-ballad'];
  }
  if (!families.length) throw new Error('The model did not name a style family to read.');

  /* ---- stage 2: compare the cards ------------------------------------ */
  onStage?.(`Comparing references in ${families.join(' and ')}`);
  const got = await bridge.captionSkillIndexes(families);
  if (!got?.ok) throw new Error(got?.error || 'That style family is not in the skill.');
  const cards = got.indexes.map((i) => `${i.family}:\n\n${i.text}`).join('\n\n---\n\n');

  const pickedRes = await askAnyOf({
    key,
    models,
    budget: PICK_BUDGET,
    signal,
    system: `${open.skill}\n\n---\n\n${cards}`,
    user: `${inputs}\n\nYou are at step 5 of the Workflow. Following Select References above, `
      + `name up to three template ids from the cards, one per line, in the order Foundation, `
      + `Modifier, Arrangement. Use fewer if the request is simple. Ids only, nothing else.`,
  });
  const picked = pickedRes.text;
  models = [pickedRes.model, ...models.filter((m) => m !== pickedRes.model)];

  /**
   * A TEMPLATE ID HAS TO BE ONE OF THE CARDS WE JUST SHOWED IT.
   *
   * Asked for three ids in the order Foundation, Modifier, Arrangement, the
   * model answered with the role words themselves and the read died on
   * `templates/modifier.txt`. Every real id is printed on the cards, so pull
   * the ids out of the index text and keep only answers that are on it.
   *
   * If none of them are, fall back to the first card in the family rather than
   * giving up: the skill says one reference is enough for a simple request.
   */
  const onCards = [...new Set(cards.match(/[a-z0-9][a-z0-9-]*_\d{4}/gi) || [])];
  let ids = pickKnown(picked, onCards, 3);
  // The skill says one reference is enough for a simple request, so the first
  // card in the family beats giving up when it named none we can find.
  if (!ids.length && onCards.length) ids = [onCards[0]];
  if (!ids.length) throw new Error('The model did not choose a reference template.');

  /* ---- stage 3: write it --------------------------------------------- */
  onStage?.('Writing the caption');
  const refs = await bridge.captionSkillTemplates(ids);
  if (!refs?.ok) throw new Error(refs?.error || 'That template is not in the skill.');
  const bodies = refs.templates
    .map((t, i) => `Reference ${i + 1} (${['Foundation', 'Modifier', 'Arrangement'][i] || 'Reference'}), id ${t.id}:\n\n${t.text}`)
    .join('\n\n---\n\n');

  const writtenRes = await askAnyOf({
    key,
    models,
    budget: WRITE_BUDGET,
    signal,
    system: `${open.skill}\n\n---\n\n${bodies}`,
    user: `${inputs}\n\nYou are at steps 6 to 8 of the Workflow. Write the rewritten caption now, `
      + `following the Output Contract and the Validate Before Returning checks above. `
      + `Return the caption itself and nothing else.`,
  });

  let written = writtenRes.text;

  // The skill's own list, and the single revision it allows.
  const bad = failedChecks(written, lyrics);
  if (bad.length) {
    onStage?.('Checking it against the skill');
    const fixed = await askAnyOf({
      key,
      models,
      budget: WRITE_BUDGET,
      signal,
      system: `${open.skill}

---

${bodies}`,
      user: `${inputs}

This was the caption:

${written}

It fails Validate Before Returning: `
        + `${bad.join('; ')}. This is the one revision that section allows. Return only the corrected caption.`,
    });
    if (!failedChecks(fixed.text, lyrics).length) written = fixed.text;
  }

  onStage?.('');
  return { caption: written, families, templates: refs.templates.map((t) => t.id), model: writtenRes.model };
}
