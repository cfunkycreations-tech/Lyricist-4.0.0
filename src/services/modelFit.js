/**
 * WHAT A MODEL CAN DO IN LYRICIST, SAID ON THE MODEL LIST.
 *
 * Chris, 2026-10-10: "If this is the case with these keys, all this needs to be
 * listed in the app, so people know what model to pick." The free list carries
 * coding agents, safety classifiers, music generators and models OpenRouter
 * only serves to "agentic harnesses" (thinkingmachines/inkling:free), and every
 * one of them looked as pickable as a model that writes verse. Each row now
 * says what the model is good for here, and the ones that cannot work say why.
 *
 * Two sources: the catalogue entry (what goes in and comes out), and what
 * OpenRouter has told THIS install about a model when a call failed for a
 * reason that will never change ("only available on agentic harnesses", "not
 * free any more"). Those are remembered so the list stops offering them.
 */

const BAD_KEY = 'lyricistModelsThatFailed';

const readBad = () => {
  try { return JSON.parse(localStorage.getItem(BAD_KEY)) || {}; } catch { return {}; }
};

/** A failure that will happen every time with this model, in plain words, or null. */
export function permanentFailure(message) {
  const m = String(message || '');
  if (/agentic harness|coding agent or productivity app/i.test(m)) return 'only runs inside coding agents';
  if (/unavailable for free|no longer free|use this slug instead/i.test(m)) return 'not free any more';
  if (/no endpoints found/i.test(m)) return 'no provider is serving it';
  return null;
}

/** Remember a model that failed for good, so the list can say so. */
export function noteModelFailure(id, message) {
  const why = permanentFailure(message);
  if (!id || !why) return;
  try {
    const bad = readBad();
    bad[id] = { why, at: Date.now() };
    localStorage.setItem(BAD_KEY, JSON.stringify(bad));
  } catch { /* storage blocked */ }
}

/** Learned failures expire after a week: the free tier moves. */
export function learnedFailure(id) {
  const hit = readBad()[id];
  return hit && Date.now() - hit.at < 7 * 864e5 ? hit.why : null;
}

/** Why a model cannot write lyrics here, from its id alone, or null. */
function wrongKind(id) {
  if (/^openrouter\//i.test(id)) return null; // a router: allowed, it is labelled below
  if (/content-safety|guard|moderation|safety/i.test(id)) return 'a safety filter, it does not write';
  if (/(?:^|[-/])code|coder|codestral|devstral|poolside|laguna|inkling/i.test(id)) return 'a coding agent';
  if (/embed|rerank/i.test(id)) return 'a search index model, it does not write';
  if (/lyria|music|tts|speech|whisper|voice|veo|video/i.test(id)) return 'makes audio or video, not words';
  return null;
}

/**
 * { can: [labels], cannot: reason|null } for one catalogue entry.
 * `can` is what to pick it for: Writes lyrics, Sees pictures, Draws pictures.
 */
export function modelFit(m) {
  const id = String(m?.id || '');
  const ins = m?.architecture?.input_modalities || [];
  const outs = m?.architecture?.output_modalities || [];
  const cannot = learnedFailure(id) || wrongKind(id);
  const can = [];
  const draws = outs.includes('image');
  const writes = !draws || outs.includes('text');
  if (!cannot && writes) can.push('Writes lyrics');
  if (!cannot && ins.includes('image')) can.push('Sees pictures');
  if (!cannot && draws) can.push('Draws pictures');
  const params = m?.supported_parameters || [];
  const thinks = /reason|think|-r1\b|\bo[134]\b/i.test(id) || params.includes('reasoning');
  return {
    can,
    cannot,
    router: /^openrouter\//i.test(id),
    thinks: !cannot && thinks,
  };
}

/** Sort key: usable before unusable, then lyric writers, then the rest. */
export function fitRank(m) {
  const f = modelFit(m);
  if (f.cannot) return 3;
  if (f.router) return 2;
  return f.can.includes('Writes lyrics') ? 0 : 1;
}
