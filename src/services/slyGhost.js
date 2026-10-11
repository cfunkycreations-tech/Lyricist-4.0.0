/**
 * SLY GHOST. THE GHOST'S RIGHT-HAND MAN ON A JOB.
 *
 * Chris, 2026-10-11: a helper "working behind the scenes to make sure the ghost
 * doesn't fuck up, so he's always coming after the ghost, preparing and all
 * that." The Ghost is Funk Ghost, this one is Sly Ghost. Both names are just for
 * Chris and Claude; the Ghost panel only exists in the creator build.
 *
 * On every job step:
 *   BEFORE  he opens the tab the step is about when the Ghost will need its
 *           controls on screen (tabs it drives by button name), so the Ghost is
 *           not told "nothing like that here".
 *   AFTER   he reads what the app shows and checks the step really happened:
 *           no banned words new in the lyrics, and a cheap model call that says
 *           DONE or what is missing.
 *
 * A miss on the first try fails the step with his note, so the Ghost redoes it
 * once knowing exactly what was wrong. A miss on the retry is only noted: Sly
 * may never make a job worse than it was without him. Anything going wrong
 * inside Sly (no key, timeout, Stop, a model that will not answer) is a pass.
 */

import { CLICHE_RE } from './cliches.js';
import { chatCompletion } from './openrouter.js';
import { record } from './ghostRecorder.js';

export const SLY = 'Sly Ghost';

/** Tabs whose state the Ghost reads through its own describe_ action. */
const DESCRIBED = {
  songwriter: 'describe_songwriter', analyzer: 'describe_ghostrider', quantum: 'describe_matrix', songforge: 'describe_songforge', onemanband: 'describe_song',
};

/** What a done step cannot show yet: a song or a video takes minutes, a lesson just plays. */
const UNCHECKABLE = /^(make_the_song|make_the_video|stop|play_lesson|say|set_voice|open_tab)$/;

/* ------------------------------ before ------------------------------ */

/**
 * The tab to open before a step, or null.
 *
 * Only the first tab the step names, only when it is not already on screen,
 * and only when the Ghost would otherwise be blind there: a tab it drives by
 * button name (its controls are read off the tab on screen) or a tab with its
 * own actions that has never been opened. Every open is a hand move on camera,
 * so nothing is opened that the bus would not need.
 *
 * tabs: [{ id, label }]  visible: id on screen  available: registered action names
 */
export function prepTab(stepText, { tabs = [], visible = '', available = [] } = {}) {
  const t = String(stepText || '').toLowerCase();
  const named = tabs
    .map((tab) => ({ ...tab, at: t.indexOf(String(tab.label).toLowerCase()) }))
    .filter((tab) => tab.label && tab.at >= 0)
    .sort((a, b) => a.at - b.at)[0];
  if (!named || named.id === visible) return null;
  const describer = DESCRIBED[named.id];
  if (describer && available.includes(describer)) return null;
  return named;
}

/* ------------------------------ after ------------------------------- */

/** Lyrics only, out of what the app and each tab say about themselves. */
const LYRIC_MARKS = [
  ['Their lyrics so far:\n', []],
  ['Lyrics it wrote in that style:\n', ['\nSuno tags:']],
  ['THE INPUT LYRICS RIGHT NOW:\n', ['\n\nTHE INPUT CAPTION']],
  ['State A:\n', ['\nState B:']],
  ['State B:\n', ['\nPicked:']],
];
export function lyricText(parts = []) {
  const out = [];
  for (const part of parts) {
    const s = String(part || '');
    for (const [start, ends] of LYRIC_MARKS) {
      const at = s.indexOf(start);
      if (at < 0) continue;
      const from = at + start.length;
      const stop = ends.map((e) => s.indexOf(e, from)).filter((n) => n >= 0);
      out.push(s.slice(from, stop.length ? Math.min(...stop) : undefined));
    }
  }
  return out.join('\n');
}

/**
 * WHAT THE CAPTION CHECK STILL FLAGS.
 *
 * Chris, 2026-10-11, on a screenshot of Black Hole Studios: the orange box said
 * "Nothing in there says how fast the song is" and "The timeline never
 * mentions your verse, hook", and the Ghost sailed on past it. The tab already
 * knows; describe_song now says it under this mark, and this reads it back.
 */
const CAPTION_MARK = 'THE CAPTION CHECK SAYS:\n';
export function captionFlags(parts = []) {
  const s = parts.map((p) => String(p || '')).find((p) => p.includes(CAPTION_MARK));
  if (!s) return [];
  const out = [];
  for (const line of s.slice(s.indexOf(CAPTION_MARK) + CAPTION_MARK.length).split('\n')) {
    if (!line.startsWith('- ')) break;
    out.push(line.slice(2).trim());
  }
  return out;
}
const CAPTION_ACTS = /^(write_caption|set_caption|restore_caption)$/;

const BANNED_G = new RegExp(CLICHE_RE.source, 'gi');
const bannedWords = (text) => new Set([...String(text || '').matchAll(BANNED_G)].map((m) => m[0].toLowerCase()));

/**
 * Banned words that are new in the lyrics since before the step. A word in his
 * own job or in the Songwriter topic is his, not the model's (see cliches.js).
 */
export function newBanned(before = [], after = [], allow = '') {
  const had = bannedWords(lyricText(before));
  const topics = [...before, ...after].join('\n').match(/topic "([^"]*)"/g) || [];
  const his = bannedWords(`${allow}\n${topics.join('\n')}`);
  return [...bannedWords(lyricText(after))].filter((w) => !had.has(w) && !his.has(w));
}

/** The one-line verdict: DONE, or MISSED and what is missing. */
export function readVerdict(text) {
  const m = /^\s*\**\s*MISSED\s*\**\s*[:\-–]\s*(.+)$/im.exec(String(text || ''));
  return m ? { missed: true, note: m[1].trim().slice(0, 200) } : { missed: false, note: '' };
}

export function verdictPrompt({ step, did = [], after = [] }) {
  const doneLines = did.map((d) => `${d.ok ? 'did' : 'failed'}: ${d.said || d.name}`).join('\n') || '(nothing)';
  const shows = after.filter(Boolean).join('\n\n').slice(0, 6000);
  return [
    {
      role: 'system',
      content: 'You are Sly Ghost, the checker behind the Ghost in a songwriting app. The Ghost just did one step of a job. '
        + 'You read what the app shows now and say whether that step really got done. You never do anything yourself.',
    },
    {
      role: 'user',
      content: `THE STEP: ${step}

WHAT THE GHOST DID:
${doneLines}

WHAT THE APP SHOWS NOW:
${shows || '(nothing)'}

RULES:
- A song that has been started counts as done. It takes minutes to render.
- What the app shows is cut short and some tabs only give counts. If it cannot show the step either way, answer DONE.
- Answer MISSED only when it clearly shows the step was not done: empty where it should be filled, the wrong artist or topic, nothing sent where something should have gone.

Answer with one line and nothing else: DONE, or MISSED: what is missing, under 20 words.`,
    },
  ];
}

/** The real model call. The model he picked in Settings, the free one otherwise. */
async function askModel(messages, { config, signal }) {
  const { assertApiKey } = await import('./AIService.js');
  const { resolveGhostModel } = await import('./GhostService.js');
  const apiKey = assertApiKey(config);
  const model = String(config?.model || '').trim() || await resolveGhostModel();
  if (!model) return '';
  const res = await chatCompletion({
    model, messages, temperature: 0, max_tokens: 300, reasoning: { exclude: true },
  }, { apiKey, signal });
  return res.ok ? String(res.json?.choices?.[0]?.message?.content || '') : '';
}

/**
 * CHECK ONE STEP. -> { ok, entry }
 *
 * entry is one line for the step's list: { name: 'sly', ok, said, warn? }.
 * ok:false only on the first try; on a retry a miss comes back ok with warn.
 */
export async function slyCheck({
  job, index, attempt = 0, before = [], after = [], did = [], config, signal, ask = askModel, timeoutMs = 15000,
}) {
  const step = job?.steps?.[index]?.text || '';
  const pass = (said = `${SLY}: checked it`) => ({ ok: true, entry: { name: 'sly', ok: true, said } });
  if (signal?.aborted) return { ok: true, entry: null };

  let note = '';
  const banned = newBanned(before, after, job?.prompt || '');
  const touchedCaption = did.some((d) => CAPTION_ACTS.test(d.name || '')) || /caption/i.test(step);
  const flags = touchedCaption ? captionFlags(after) : [];
  if (banned.length) {
    note = `banned words in the lyrics (${banned.join(', ')}). Rewrite those lines without them`;
  } else if (flags.length) {
    note = `the caption check on Black Hole Studios still says: ${flags.join(' ')} `
      + 'Run write_caption again with an instruction that fixes exactly that';
  } else if (did.length && did.every((d) => UNCHECKABLE.test(d.name || ''))) {
    return pass(`${SLY}: started, nothing to check yet`);
  } else {
    const ac = new AbortController();
    const cut = () => ac.abort();
    signal?.addEventListener?.('abort', cut, { once: true });
    const timer = setTimeout(cut, timeoutMs);
    try {
      const text = await Promise.race([
        ask(verdictPrompt({ step, did, after }), { config, signal: ac.signal }),
        new Promise((resolve) => ac.signal.addEventListener('abort', () => resolve(''), { once: true })),
      ]);
      const v = readVerdict(text);
      if (v.missed) note = v.note;
    } catch {
      return { ok: true, entry: null };   // no key, offline, busy: Sly steps aside
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener?.('abort', cut);
    }
    if (signal?.aborted) return { ok: true, entry: null };
  }

  if (!note) return pass();
  if (attempt < 1) {
    record('job', `${SLY} caught step ${index + 1}: ${note}`);
    return { ok: false, entry: { name: 'sly', ok: false, said: `${SLY}: ${note}` } };
  }
  record('job', `${SLY} noted step ${index + 1} (already redone once, carrying on): ${note}`);
  return { ok: true, entry: { name: 'sly', ok: true, warn: true, said: `${SLY}, noted: ${note}` } };
}

/** Sly's own lines are not something the Ghost did: keep them out of its memory of the job. */
export const ghostDid = (did = []) => did.filter((d) => d.name !== 'sly');
