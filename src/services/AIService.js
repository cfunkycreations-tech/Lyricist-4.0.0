// AI integration service for Lyricist Pro
// Enforces: Law of Subtext, Law of Human Paradox, Conversational Cadence

import { cleanRefineOutput } from '../utils/refineClean.js';
import { inspectGenerated, truncateAtCollapse } from '../utils/lyricSanity.js';
import { stripReasoning, isMostlyReasoning } from '../utils/stripReasoning.js';
import { blendPhrase } from '../utils/blend.js';
import { chatCompletion, listModels, noEndpointsHelp } from './openrouter.js';

export const lastGeneration = { model: null, provider: null, ok: true, reasons: [], dropped: 0, at: null, unfiltered: false };

/**
 * Default & fallback, CHECKED AGAINST THE LIVE CATALOGUE ON 2026-08-27.
 *
 * These were `meta-llama/llama-3.3-70b-instruct:free` and
 * `meta-llama/llama-3.1-8b-instruct:free`. Both had been retired from the free
 * tier — of 415 models on OpenRouter that day, 21 were free and neither of ours
 * was among them. Every generation in the app failed as a result, which is what
 * "none of the free keys work" actually was: not the key, these two constants.
 *
 * They are still only a starting guess. discoverFreeModels() below is what
 * keeps the app working the next time a slug retires, because it will happen
 * again and nobody will be watching when it does.
 */
/**
 * INSTRUCTION-TUNED, NOT REASONING. This is the whole selection criterion.
 *
 * The first pass at this pointed the default at nvidia/nemotron-3-super, on the
 * reasoning that a 120B model writes better verse than a 26B one. It does not,
 * because the Nemotron 3 family THINKS OUT LOUD: what came back was
 * "We need to produce a 4-line verse. Constraints: - Seed palette: ..." — the
 * model's scratchpad, printed into the tab as if it were the song.
 *
 * Only the "-it" (instruction-tuned) builds are safe to put first. Size is
 * irrelevant next to whether the model narrates its own planning.
 */
export const DEFAULT_AI_MODEL = 'google/gemma-4-26b-a4b-it:free';
export const FALLBACK_MODEL = 'google/gemma-4-31b-it:free';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * WHY THIS FILE STOPPED TRUSTING ITS OWN CONSTANTS.
 *
 * DEFAULT_AI_MODEL and FALLBACK_MODEL above are `:free` slugs, and OpenRouter
 * RETIRES those. When they go, the provider answers
 *
 *   "This model is unavailable for free. The paid version is available now -
 *    use this slug instead: meta-llama/llama-3.1-8b-instruct"
 *
 * and every single generation in the app dies at once. Worse, it dies wearing
 * the wrong error: guardedCall failed over to FALLBACK_MODEL, the fallback was
 * retired too, and the fallback's message replaced the real reason the primary
 * call failed. Chris hit exactly this — "none of the fucking free keys work" —
 * and the visible error named a model he had never chosen.
 *
 * Hardcoding a different slug just resets the clock until that one is retired.
 * So the app asks OpenRouter what is free RIGHT NOW, from the public catalogue,
 * and walks that list. No key, no cost, one request per session.
 *
 * The suggested PAID slug in that error is deliberately NOT auto-used. Silently
 * moving someone onto paid inference is not a bug fix, it is spending their
 * money for them. It gets surfaced in the message so they can choose.
 * ══════════════════════════════════════════════════════════════════════════
 */

/** Models the catalogue says cost nothing, best-for-lyrics first. Session cache. */
let freeModelCache = null;

/**
 * Models that are free but cannot write a verse. Excluded outright.
 *
 * The free tier is not just small chat models. It also carries CLASSIFIERS —
 * nvidia/nemotron-3.5-content-safety is a moderation head, and asking it for a
 * chorus returns a safety verdict — and REASONING models, which emit thinking
 * passes that stripReasoning/isMostlyReasoning then have to fight, usually
 * losing and reporting "returned thinking passes instead of lyrics".
 *
 * Both look like perfectly good free chat models in the catalogue. Neither is.
 */
function isUnusableForLyrics(id) {
  return /content-safety|guard|moderation|safety|reasoning|embed|rerank|image|vision|audio/i
      .test(id || '')
    // CODING AGENTS. Chris, 2026-09-15, on the Ghost Rider tab: "Provider
    // returned invalid content from cohere/north-mini-code:free." The free tier
    // carries code models, and asked for a verse they answer with something the
    // garbage detector rightly refuses. The filter above never mentioned them,
    // so they stayed in the pool and got picked. poolside/laguna is the same
    // thing without the word "code" anywhere in its slug.
    || /(?:^|[-/])code|coder|codestral|poolside|laguna/i.test(id || '')
    // Models tuned for one trade (finance, medicine) rather than for writing.
    || /-(?:fin|sante|med|math|sql)(?::|-|$)/i.test(id || '')
    // Vision builds name themselves "-vl", which the word "vision" above misses.
    || /-vl(?::|-|$)/i.test(id || '')
    // Music, speech and video generators. Lyria writes SONGS, not words, and it
    // sits in the catalogue at zero cost like any free chat model.
    || /lyria|music|tts|speech|voice|veo|video|diffusion/i.test(id || '');
}

/**
 * A ROUTER IS NOT A MODEL.
 *
 * `openrouter/free` picks whatever free model is up at that second, and the
 * free pool includes coding agents and a safety classifier. For creative work
 * that is a coin flip, and it is how Chris ended up reading an error about a
 * code model he never chose. Anything under the openrouter/ namespace is a
 * router, so the chain starts at a real instruction-tuned model instead.
 */
const isRouterSlug = (id) => /^openrouter\//i.test(String(id || ''));

/**
 * Rank free models by how well they write verse. Lower is better.
 *
 * Written against the free tier as it ACTUALLY stood on 2026-08-27, not the one
 * this file used to assume. The llama/qwen/deepseek families that used to lead
 * this list are no longer free at all, so ranking them first ranked nothing.
 */
function rankFreeModel(id) {
  // Instruction-tuned builds first. These answer the brief instead of
  // narrating how they intend to answer it. See the note on DEFAULT_AI_MODEL.
  if (/-it(?::|$)|-instruct/i.test(id))              return 0;
  if (/gemma/i.test(id))                             return 1;
  // Older instruct families, kept so the chain still works if they return free.
  if (/llama-3\.3|llama-3\.1-70b|llama-4/i.test(id)) return 2;
  if (/qwen.*(?:72b|32b|235b)/i.test(id))            return 3;
  if (/deepseek/i.test(id))                          return 4;
  if (/mistral|mixtral/i.test(id))                   return 5;
  // Nemotron LAST, deliberately. Capable models, but the 3.x line emits its
  // chain of thought as content and this app has no use for a scratchpad.
  if (/nemotron/i.test(id))                          return 8;
  return 7;
}

export async function discoverFreeModels() {
  if (freeModelCache) return freeModelCache;
  try {
    // Public catalogue: no auth, no cost, and it is the only source of truth
    // for what is free today.
    freeModelCache = (await listModels())
      .filter((m) => String(m?.pricing?.prompt) === '0'
                  && String(m?.pricing?.completion) === '0')
      // Verse needs room to breathe.
      .filter((m) => (m?.context_length || 0) >= 4000)
      // Classifiers, coding agents and reasoning heads are free too, and none
      // of them writes lyrics.
      .filter((m) => !isUnusableForLyrics(m?.id))
      // A router in the fallback chain is the original bug all over again: it
      // would hand the retry to whatever free model it liked, coding agents
      // included. Only real models belong here.
      .filter((m) => !isRouterSlug(m?.id))
      .map((m) => m.id)
      .sort((a, b) => rankFreeModel(a) - rankFreeModel(b));
    return freeModelCache;
  } catch {
    // Offline, or the catalogue moved. Fall back to the constants above.
    return [];
  }
}

function isNoEndpointsError(status, message) {
  return status === 404 || /no endpoints found/i.test(message || '');
}

/**
 * "That slug is not free any more."
 *
 * Distinct from a 404: the model EXISTS, the account simply cannot have it for
 * nothing. Retrying the same slug will never work, so the chain must move on.
 */
function isNotFreeAnymore(message) {
  return /unavailable for free|use this slug instead|requires (?:a )?paid|no longer free/i
    .test(String(message || ''));
}

function isDataPolicyBlock(status, message) {
  const m = String(message || '');
  return (status === 404 || status === 403)
    && /data policy|guardrail|settings\/privacy/i.test(m);
}

const DATA_POLICY_HELP = [
  'Your OpenRouter account is currently set to refuse free models.',
  '',
  'To fix this, go to https://openrouter.ai/settings/privacy and:',
  '  1. Turn ON the options that allow model training / prompt logging for free models.',
  '  2. Turn OFF Zero Data Retention (ZDR) if enabled.',
  '  3. Return to Lyricist Pro and run the action again.',
].join('\n');

export function normalizeApiKey(raw) {
  return String(raw ?? '')
    .replace(/[\s ​]+/g, '')
    .replace(/^["'‘’“”]+|["'‘’“”]+$/g, '')
    .replace(/^bearer\s*/i, '');
}

async function postCompletion(body, config) {
  const r = await chatCompletion(body, { apiKey: normalizeApiKey(config?.openRouterApiKey) });
  if (r.ok) return { ok: true, result: r.json || {} };
  return { ok: false, status: r.status, message: r.message || 'Unknown Provider Error' };
}

/**
 * `room` is the second-chance call for a thinking model that spent its whole
 * token budget thinking and never wrote a word (see guardedCall). It gets far
 * more tokens and is asked to think briefly.
 */
async function singleCall(messages, config, modelId, customTemp, customMax, room = null) {
  const targetModel = modelId || config?.model || DEFAULT_AI_MODEL;
  const body = {
    model: targetModel,
    temperature: customTemp !== null && customTemp !== undefined ? customTemp : (config?.temperature ?? 0.85),
    max_tokens: room ?? (customMax !== null && customMax !== undefined ? customMax : (config?.maxTokens ?? 2000)),
    top_p: 0.9,
    frequency_penalty: 0.3,
    presence_penalty: 0.2,
    provider: {
      quantizations: ['fp32', 'bf16', 'fp16', 'fp8', 'unknown'],
      allow_fallbacks: true,
    },
    reasoning: room ? { effort: 'low', exclude: true } : { exclude: true },
    messages
  };

  let attempt = await postCompletion(body, config);
  let unfiltered = false;

  if (!attempt.ok && isNoEndpointsError(attempt.status, attempt.message)) {
    const { provider, ...noFilter } = body;
    attempt = await postCompletion({ ...noFilter, provider: { allow_fallbacks: true } }, config);
    unfiltered = attempt.ok;
  }

  if (!attempt.ok) {
    if (isDataPolicyBlock(attempt.status, attempt.message)) {
      throw new Error(DATA_POLICY_HELP);
    }
    if (isNoEndpointsError(attempt.status, attempt.message)) {
      throw new Error(await noEndpointsHelp(targetModel, normalizeApiKey(config?.openRouterApiKey)));
    }
    throw new Error(attempt.message || `API Error (${targetModel}): status ${attempt.status}`);
  }

  const result = attempt.result;
  const served = result.model || targetModel;
  const provider = result.provider || null;
  const finish = result.choices?.[0]?.finish_reason || null;
  const msg = result.choices?.[0]?.message;
  // Some hosts return the content as a list of parts.
  const content = Array.isArray(msg?.content)
    ? msg.content.map((p) => (typeof p === 'string' ? p : p?.text || '')).join('')
    : msg?.content;
  const raw = content || "";
  const text = stripReasoning(raw, { aggressive: true });
  const thought = Boolean(msg?.reasoning || msg?.reasoning_content || msg?.reasoning_details?.length);

  return { text, raw, model: served, asked: targetModel, provider, finish, unfiltered, thought };
}

/** Free slugs are the only ones the app may swap for another model. */
const isFreeSlug = (id) => /:free$/i.test(String(id || ''));

async function guardedCall(messages, config, modelId, customTemp, customMax) {
  const wanted = modelId || config?.model || DEFAULT_AI_MODEL;
  // See isRouterSlug: a router hands a lyric prompt to a coding agent as
  // happily as to a writer, so it never gets to be the first choice.
  const chosen = isRouterSlug(wanted) ? DEFAULT_AI_MODEL : wanted;
  if (chosen !== wanted) {
    console.warn(`[Lyricist] "${wanted}" is a router, not a model. Writing with ${chosen} instead. Pick a model in Settings.`);
  }
  let attemptResult;

  /**
   * THE CHAIN. What they picked, then the constants, then whatever the
   * catalogue says is free today. Deduped, because retrying a slug that just
   * told us it is not free is a wasted round trip and a slower error.
   */
  const tried = new Set();
  const attempt = async (model) => {
    if (!model || tried.has(model)) return null;
    tried.add(model);
    return singleCall(messages, config, model, customTemp, customMax);
  };

  // The FIRST failure is the one worth reporting. A data-policy block or a bad
  // key is the real problem; the chain walking past four retired free slugs
  // afterwards would otherwise overwrite it with a misleading message about a
  // model the user never chose.
  let firstError = null;
  const record = (e) => { if (!firstError) firstError = e; };

  try {
    attemptResult = await attempt(chosen);
  } catch (err) {
    record(err);
    console.warn(`Primary model (${chosen}) call failed:`, err.message);

    // A data policy block is an account setting. No amount of model-swapping
    // fixes it, and DATA_POLICY_HELP already says exactly what to change.
    if (/data policy|settings\/privacy/i.test(err.message || '')) throw err;

    // A model they picked and pay for is never swapped for one they did not.
    // Say what went wrong with THEIR model.
    if (!isFreeSlug(chosen)) throw err;

    const candidates = [
      DEFAULT_AI_MODEL,
      FALLBACK_MODEL,
      ...(await discoverFreeModels()),
    ];

    for (const candidate of candidates) {
      if (tried.has(candidate)) continue;
      try {
        console.info(`Trying free model: ${candidate}`);
        attemptResult = await attempt(candidate);
        if (attemptResult) break;
      } catch (e) {
        record(e);
        // "Not free any more" and "no endpoints" are both dead ends for this
        // slug but say nothing about the next one. Keep walking.
        if (isNotFreeAnymore(e.message) || isNoEndpointsError(null, e.message)) continue;
        continue;
      }
    }

    if (!attemptResult) {
      const paid = String(firstError?.message || '').match(/use this slug instead:\s*([^\s.]+)/i);
      throw new Error(
        paid
          ? `Every free model refused this request. OpenRouter says the paid version of your model is "${paid[1]}" — set it in Settings if you want to use it. Original error: ${firstError.message}`
          : (firstError?.message || 'No free model would take this request.')
      );
    }
  }

  /**
   * THE EMPTY REPLY. A thinking model (MiniMax M3 is one) spends its token
   * budget thinking BEFORE it writes. `reasoning.exclude` hides the thinking
   * from the reply but does not stop it costing tokens, so on a 2000-token cap
   * the whole budget goes on thinking and `content` comes back empty with
   * finish_reason "length". The old code read that as "not lyrics" and went
   * hunting for other models. The model is fine; it ran out of room. Give the
   * SAME model the room, and ask it to think briefly.
   */
  if (!attemptResult.raw.trim() && (attemptResult.finish === 'length' || attemptResult.thought)) {
    const cap = customMax ?? config?.maxTokens ?? 2000;
    try {
      const roomy = await singleCall(
        messages, config, attemptResult.asked, customTemp, customMax,
        Math.min(16000, Math.max(8000, cap * 4)),
      );
      if (roomy.raw.trim()) attemptResult = roomy;
    } catch (e) {
      console.warn(`Second try with more room failed on ${attemptResult.asked}:`, e.message);
    }
  }

  const { text, raw, model, provider, finish, unfiltered } = attemptResult;
  const verdict = inspectGenerated(text);
  const rawLines = raw.split('\n').filter((l) => l.trim()).length;
  const keptLines = text.split('\n').filter((l) => l.trim()).length;
  const gutted = rawLines >= 12 && keptLines < 4;

  if (!text.trim() || isMostlyReasoning(text) || gutted) {
    verdict.ok = false;
    verdict.reasons = [...new Set([
      ...verdict.reasons,
      raw.trim() ? 'returned thinking passes instead of lyrics' : 'empty response',
    ])];
  }

  Object.assign(lastGeneration, {
    model, provider, ok: verdict.ok, reasons: verdict.reasons, dropped: 0, at: Date.now(), unfiltered,
  });

  if (unfiltered) {
    lastGeneration.reasons = [...verdict.reasons, 'no full-precision host available'];
  }
  if (finish === 'length') {
    lastGeneration.reasons = [...lastGeneration.reasons, 'hit token limit'];
  }

  if (verdict.ok) return text;

  const cut = truncateAtCollapse(text);
  lastGeneration.dropped = cut.dropped;
  const stillGood = cut.text.trim() && inspectGenerated(cut.text).ok;
  if (stillGood && cut.text.split('\n').filter((l) => l.trim()).length >= 4) return cut.text;

  /**
   * The content came back unusable rather than the call failing, so walk up to
   * three OTHER free models, chosen live.
   *
   * This used to retry FALLBACK_MODEL unconditionally — once that slug was
   * retired the retry threw a "not free any more" error that buried the real
   * complaint about the content. Then it retried exactly one live model, which
   * on 2026-09-15 was one throw of the same dice: Chris's run took the bad
   * answer, took one more, and gave up naming a code model he never picked.
   */
  const why = verdict.reasons.length ? ` (${verdict.reasons.join(', ')})` : '';

  // They picked this model. Do not swap in a different one behind their back.
  if (!isFreeSlug(chosen)) {
    throw new Error(
      `${model} sent back something that is not lyrics${why}. `
      + 'Nothing else was tried, because you picked this model. Pick a different one in Settings.'
    );
  }

  const alternatives = [...(await discoverFreeModels()), FALLBACK_MODEL, DEFAULT_AI_MODEL]
    .filter((m) => m && m !== model && m !== chosen)
    .slice(0, 3);
  for (const retryOn of alternatives) {
    try {
      const retry = await singleCall(messages, config, retryOn, customTemp, customMax);
      const rv = inspectGenerated(retry.text);
      if (rv.ok && retry.text.trim() && !isMostlyReasoning(retry.text)) {
        Object.assign(lastGeneration, { model: retry.model, provider: retry.provider, ok: true, reasons: [], at: Date.now() });
        return retry.text;
      }
    } catch (e) {
      console.warn(`Content retry on ${retryOn} failed:`, e.message);
    }
  }

  throw new Error(
    `${model} sent back something that is not lyrics${why}`
    + (alternatives.length ? `, and so did ${alternatives.join(', ')}. ` : '. ')
    + 'Pick a different model in Settings.'
  );
}

export function assertApiKey(config) {
  const key = normalizeApiKey(config?.openRouterApiKey);
  if (!key) {
    throw new Error("No API key configured. Enter your OpenRouter key in Settings.");
  }
  if (!/^sk-or-/i.test(key)) {
    throw new Error(`Invalid OpenRouter key format (must start with "sk-or-v1-"). Check Settings.`);
  }
  return key;
}

export async function callAI(messages, config, customTemp = null, customMax = null) {
  assertApiKey(config);
  return guardedCall(messages, config, config?.model || DEFAULT_AI_MODEL, customTemp, customMax);
}

export function buildPromptContext(store) {
  const genreLine = blendPhrase(store.genreList || [store.genre], 'sound');
  const subLine = blendPhrase(store.subgenreList || [store.subgenre].filter(Boolean), 'sound');
  const moodLine = blendPhrase(store.moodList || [store.mood], 'feeling');
  // NOTHING PICKED IS A REAL ANSWER NOW, so say what it means instead of sending
  // "- Genre:" with nothing after it. A model handed an empty field either
  // invents a genre silently or writes the blandest thing it knows; told in
  // words that the choice is open, it picks one that suits the topic and the
  // person gets a song rather than a shrug.
  const OPEN_GENRE = 'not specified — choose whatever genre suits the topic and say what you chose';
  const OPEN_MOOD = 'not specified — let the topic decide the feeling';
  return `
SONGWRITING CONFIGURATION:
- Genre: ${genreLine || OPEN_GENRE}
- Subgenre: ${subLine || "none"}
- Mood: ${moodLine || OPEN_MOOD}
- Rhyme Scheme: ${store.rhymeScheme || "AABB"}
- Rhyme Density: ${store.rhymeDensity || "High"}
- Flow Pattern: ${store.flowPattern || "Balanced"}
- Cadence Notes: ${store.cadenceNotes || "none"}
- Topic / Concept: ${store.topic || "generic human tension"}
- Artist Reference: ${store.artistRef || "none"}
`;
}

const HUMAN_LYRICIST_RULES = `
You are the AI Writing Assistant inside Lyricist Pro.
Focus on subtext, physical friction, sensory details, and conversational cadence.
Do not use cheap clichés (neon, shadows, whispers, echoes, sparks, cage, gravity, chains, storm).
`;

export async function generateFullSong(store) {
  assertApiKey(store.config);
  const context = buildPromptContext(store);
  const structureSequence = (store.customStructure || ['verse', 'chorus', 'verse', 'chorus']).map(s => s.toUpperCase()).join(" -> ");

  const systemPrompt = `You are a professional lyricist and songwriter. Output lyrics only. Clear section markers like [Verse 1], [Chorus], etc.`;
  const userPrompt = `Write the full song lyrics based on this context:\n${context}\n\nSTRUCTURE:\n${structureSequence}`;

  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ];

  const resultText = await callAI(messages, store.config, store.config?.temperature, store.config?.maxTokens);
  return parseSectionsFromText(resultText, store);
}

export async function generateSection(sectionType, store, priorSections = []) {
  const context = buildPromptContext(store);
  const contextHistoryText = priorSections.map(s => `[${s.name}]\n${s.lines.map(l => l.text).join("\n")}`).join("\n\n");

  const systemPrompt = `${HUMAN_LYRICIST_RULES}\nWrite exactly one section of type: [${sectionType.toUpperCase()}]. Output raw lines only.`;
  const userPrompt = `CONTEXT:\n${context}\n\nPRIOR LYRICS:\n${contextHistoryText || "None."}\n\nGenerate the ${sectionType}:`;

  const sectionText = await callAI([
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ], store.config, store.config?.temperature, 500);

  return sectionText.trim();
}

export async function generateLineVariation(lineText, sectionContext, store) {
  const systemPrompt = `${HUMAN_LYRICIST_RULES}\nProvide a single replacement line. No quotes, no explanations.`;
  const userPrompt = `Context:\n${sectionContext}\n\nOriginal Line:\n"${lineText}"\n\nReplacement:`;

  const raw = (await callAI([
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ], store.config, 0.9, 100)).trim().replace(/^"|"$/g, "");
  return cleanRefineOutput(raw, lineText);
}

export async function fillBlank(fullLyrics, store) {
  const systemPrompt = `${HUMAN_LYRICIST_RULES}\nFill in the [blank] tokens seamlessly with matching rhythm and tone.`;
  return (await callAI([
    { role: "system", content: systemPrompt },
    { role: "user", content: `Fill the blanks:\n\n${fullLyrics}` }
  ], store.config, 0.75, store.config?.maxTokens)).trim();
}

export function parseSectionsFromText(text, store) {
  const lines = stripReasoning(text).split("\n");
  const parsed = [];
  let currentSection = null;
  let sectionIndex = 1;

  for (let rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const match = line.match(/^\[(.*?)\]$/);
    if (match) {
      if (currentSection) parsed.push(currentSection);
      const name = match[1];
      let type = "verse";
      const lower = name.toLowerCase();
      if (lower.includes("intro")) type = "intro";
      else if (lower.includes("chorus") || lower.includes("hook")) type = "chorus";
      else if (lower.includes("pre")) type = "pre-chorus";
      else if (lower.includes("bridge")) type = "bridge";
      else if (lower.includes("outro")) type = "outro";

      currentSection = {
        id: `sec-${Date.now()}-${sectionIndex++}-${Math.random().toString(36).substr(2, 5)}`,
        type,
        name,
        lines: [],
        adLibs: "",
        showAdLibs: false,
        readability: "",
        vocabRichness: 0,
        originality: null,
        clichés: []
      };
    } else {
      if (!currentSection) {
        currentSection = {
          id: `sec-${Date.now()}-${sectionIndex++}-${Math.random().toString(36).substr(2, 5)}`,
          type: "verse",
          name: "Verse 1",
          lines: [],
          adLibs: "",
          showAdLibs: false,
          readability: "",
          vocabRichness: 0,
          originality: null,
          clichés: []
        };
      }
      currentSection.lines.push({
        text: line,
        locked: false,
        lockedWord: "",
        targetSyllables: 0,
        activeVariation: "draft",
        variations: { draft: line, A: "", B: "", C: "" }
      });
    }
  }
  if (currentSection) parsed.push(currentSection);
  return parsed;
}

/* ══════════════════════════════════════════════════════════════════════════
   THE SIX THAT WENT MISSING.

   These were dropped when this file was slimmed down, but three components
   never stopped importing them, and a missing named export is not a runtime
   warning — it is a module-level SyntaxError that stops the WHOLE app from
   mounting. The symptom was the entire window failing to boot with
   "does not provide an export named 'generateAdLibs'", which reads like an
   AIService bug and is really a link error.

   Who needs what:
     SectionEditor.jsx    refineLyrics, generateAdLibs
     ArtistAnalyzer.jsx   refineLyrics, analyzeClichés, checkSimilarity,
                          checkThemeConsistency
     SongwriterHub.jsx    generateBridgeVariations

   Restored from commit ee600ff verbatim. The model constants at the top of
   this file are deliberately NOT restored with them: that commit still points
   FALLBACK_MODEL at google/gemma-4-31b-it:free, which is deprecated on
   OpenRouter and 404s the moment a fallback is triggered. The live constants
   here (llama-3.1-8b-instruct:free) stay.
   ══════════════════════════════════════════════════════════════════════════ */

// Dedicated bridge variations - returns 3 distinct bridge approaches (Narrative Twist, Emotional Peak, Sonic Shift)
export async function generateBridgeVariations(store, priorLyrics = []) {
  const context = buildPromptContext(store);
  const contextHistoryText = priorLyrics.map(s => `[${s.name}]\n${s.lines.map(l => l.text).join("\n")}`).join("\n\n");

  const systemPrompt = `${HUMAN_LYRICIST_RULES}
Provide THREE distinct variations of a Bridge section (8 lines each) for this song.
The variations must represent three different songwriting approaches:
1. VARIATION 1: NARRATIVE TWIST (introduces new information or a surprise plot turn)
2. VARIATION 2: EMOTIONAL PEAK (the highest vulnerability or intensity moment)
3. VARIATION 3: SONIC SHIFT (a rhythmic, stylistic, or perspective change)

Return each variation with a label: "### VARIATION 1: NARRATIVE TWIST", "### VARIATION 2: EMOTIONAL PEAK", and "### VARIATION 3: SONIC SHIFT". No other text.`;

  const userPrompt = `CONTEXT:
${context}

PRIOR LYRICS CONTEXT:
${contextHistoryText}

Generate 3 bridge variations:`;

  const output = await callAI([
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ], store.config, 0.85, 1200);

  return parseBridgeVariations(output);
}

// Generates an ad-lib layer for a section
export async function generateAdLibs(sectionText, store) {
  const systemPrompt = `You are a backing vocalist and ad-lib producer.
Given a block of lyrics, generate vocal ad-libs, backing echoes, and hype-man comments to run alongside the main lines.
Place the ad-libs in parentheses at the end of lines or on separate lines, matching the genre's typical ad-lib style (e.g., hip-hop background sounds, rock echoes, soul calls).
Do not change the main lyrics. Return the text with the ad-libs integrated. No explanation.`;

  return (await callAI([
    { role: "system", content: systemPrompt },
    { role: "user", content: `Lyrics:\n${sectionText}` }
  ], store.config, 0.8, 500)).trim();
}

// Line refinement tools (Punch Up, Simplify, Elevate)
export async function refineLyrics(targetText, mode, store) {
  let instructions = "";
  if (mode === "punch-up") {
    instructions = "Make this lyric hit harder. Introduce sharper sensory details, unexpected friction, or stronger rhythmic punch. Avoid clichés.";
  } else if (mode === "simplify") {
    instructions = "Make this lyric more direct, raw, and conversational. Cut any poetic flowery language and say it simply, like a real spoken sentence.";
  } else if (mode === "elevate") {
    instructions = "Elevate the vocabulary and imagery. Introduce striking metaphors, literary themes, or double meanings while keeping it performable.";
  }

  const lineCount = String(targetText || '').split('\n').filter((l) => l.trim()).length || 1;
  const systemPrompt = `${HUMAN_LYRICIST_RULES}
You are REWRITING this text in place. Replace it completely.
INSTRUCTION: ${instructions}

CRITICAL OUTPUT RULES:
- Return ONLY the rewritten lyric text.
- Do NOT include the original text.
- Do NOT show before/after, options A/B, or commentary.
- Keep the same number of lines as the input (${lineCount} line${lineCount === 1 ? '' : 's'}).
- If input is one line, output exactly one line.`;

  const raw = await callAI([
    { role: "system", content: systemPrompt },
    { role: "user", content: `Rewrite this completely (same line count, refined only — no original):\n${targetText}` }
  ], store.config, 0.8, 500);

  return cleanRefineOutput(raw, targetText);
}

// Originality and cliché analysis
export async function analyzeClichés(text, store) {
  const systemPrompt = `You are an expert editor. Identify clichés, lazy rhymes, and generic phrases in the following lyrics.
Return your analysis as a JSON array of objects. Each object must have:
- "phrase": the exact clichéd or generic phrase found (must match a substring in the lyrics)
- "reason": why it's a cliché or weak
- "replacement": a suggested sharp, specific alternative

Format as JSON only:
[
  { "phrase": "neon light", "reason": "Overused aesthetic cliché in AI writing", "replacement": "sodium-buzz bulb" }
]`;

  try {
    const raw = await callAI([
      { role: "system", content: systemPrompt },
      { role: "user", content: `Analyze these lyrics:\n\n${text}` }
    ], store.config, 0.3, 1000);
    // Find json array in output
    const jsonStart = raw.indexOf("[");
    const jsonEnd = raw.lastIndexOf("]") + 1;
    if (jsonStart !== -1 && jsonEnd !== -1) {
      return JSON.parse(raw.substring(jsonStart, jsonEnd));
    }
    return [];
  } catch (e) {
    console.error("Cliché analysis error", e);
    return [];
  }
}

// Theme consistency checking
export async function checkThemeConsistency(lyrics, topic, store) {
  const systemPrompt = `Analyze these lyrics line by line for consistency with the topic: "${topic}".
Identify any lines that drift completely off-topic, sound like unrelated filler, or break the song's narrative.
Return a JSON array of strings containing the exact text of any off-theme lines. If everything is consistent, return an empty array.
Format as JSON array only, e.g. ["unrelated line here"].`;

  try {
    const raw = await callAI([
      { role: "system", content: systemPrompt },
      { role: "user", content: `Lyrics:\n${lyrics}` }
    ], store.config, 0.3, 600);
    const jsonStart = raw.indexOf("[");
    const jsonEnd = raw.lastIndexOf("]") + 1;
    if (jsonStart !== -1 && jsonEnd !== -1) {
      return JSON.parse(raw.substring(jsonStart, jsonEnd));
    }
    return [];
  } catch (e) {
    return [];
  }
}

// Similarity/Plagiarism Check
export async function checkSimilarity(text, store) {
  const systemPrompt = `You are a plagiarism and music copyright bot.
Compare these lyrics against known popular music (hip-hop, pop, rock, etc.).
Determine if any phrases or lines are dangerously close to existing famous songs.
Return a JSON object with:
- "score": percentage estimated plagiarism risk (0 to 100)
- "matches": array of objects, each containing:
  - "phrase": the matching phrase in the lyrics
  - "originalSong": the original song title and artist
  - "severity": "high" or "medium" or "low"

Format as JSON only.`;

  try {
    const raw = await callAI([
      { role: "system", content: systemPrompt },
      { role: "user", content: `Analyze these lyrics:\n\n${text}` }
    ], store.config, 0.3, 800);
    const jsonStart = raw.indexOf("{");
    const jsonEnd = raw.lastIndexOf("}") + 1;
    if (jsonStart !== -1 && jsonEnd !== -1) {
      return JSON.parse(raw.substring(jsonStart, jsonEnd));
    }
    return { score: 0, matches: [] };
  } catch (e) {
    return { score: 0, matches: [] };
  }
}

// Parses bridge variations from text
function parseBridgeVariations(text) {
  const v1Match = text.match(/VARIATION 1: NARRATIVE TWIST\s*([\s\S]*?)(?=### VARIATION 2|$)/i);
  const v2Match = text.match(/VARIATION 2: EMOTIONAL PEAK\s*([\s\S]*?)(?=### VARIATION 3|$)/i);
  const v3Match = text.match(/VARIATION 3: SONIC SHIFT\s*([\s\S]*?)$/i);

  return {
    A: v1Match ? v1Match[1].trim() : "",
    B: v2Match ? v2Match[1].trim() : "",
    C: v3Match ? v3Match[1].trim() : ""
  };
}

/**
 * Writes original lyrics in a named artist's style, plus the Suno style tags
 * that go with them.
 *
 * Ported out of the Artist Analyzer tab so the DAW can use it directly. Two
 * rules carried over verbatim because they are what make the output usable:
 * the artist's name must never appear in the lyrics, and the style tags must
 * never name a real person — Suno rejects prompts that do.
 *
 * @param {string} artist - Artist whose style to imitate.
 * @param {string} topic - What the song is about; blank lets the model choose.
 * @param {Object} store - LyricStore, for the API key and model config.
 * @returns {Promise<{lyrics: string, sunoTags: string}>}
 */
export async function writeInArtistStyle(artist, topic, store) {
  assertApiKey(store?.config);
  const name = String(artist || '').trim();
  if (!name) throw new Error('Name an artist first.');

  const topicPrompt = String(topic || '').trim()
    ? `Topic: ${String(topic).trim()}`
    : 'Choose a typical subject for this artist.';

  const prompt = `Write original lyrics in the style of ${name}. ${topicPrompt}
Write a verse (16 bars) and a hook (8 bars). Match their rhyme schemes, vocabulary, and flow. Do NOT mention the artist's name anywhere in the lyrics.

After the lyrics, on a new line write exactly this separator and nothing else:
---SUNO TAGS---
Then on the very next line write 10-14 comma-separated Suno AI style keywords. STRICT RULES for the tags: NO artist names, NO real person names, NO celebrity names whatsoever. Only include: genre, subgenre, production style, mood, tempo, instruments, vocal style, era. One line only.`;

  const rawResult = await callAI([
    { role: 'system', content: 'You are an elite ghostwriter who captures the raw, authentic artistic voice, flow, cadence, vocabulary, and stylistic nuances of specific musical artists. You despise generic AI-sounding imitations. Focus on subtext, friction, and rhythm.' },
    { role: 'user', content: prompt }
  ], store.config);

  const parts = String(rawResult).split('---SUNO TAGS---');
  const lyrics = parts[0]?.trim() || '';

  // Strip the artist's name out of the tags even if the model ignored the rule.
  const artistClean = name.toLowerCase();
  const sunoTags = (parts[1]?.trim().split('\n')[0] || '')
    .split(',')
    .map(t => t.trim())
    .filter(t => t.length > 2 && t.toLowerCase() !== artistClean && !t.toLowerCase().includes(artistClean))
    .join(', ');

  return { lyrics, sunoTags };
}

/**
 * Analysis angles for an artist's writing, carried over from the Artist
 * Analyzer tab's prompt builders.
 */
export const ARTIST_ANALYSIS_MODES = {
  full: (artist) => `Comprehensive analysis of ${artist} as a lyricist: style, flow, themes, era, influences, and what makes them unique. Use catalog examples.`,
  style: (artist) => `Analyze ${artist}'s lyrical writing style in depth. Cover vocabulary, metaphor usage, storytelling approach, word choice, rhyme schemes, and what makes their lyrics distinctive. Use catalog examples.`,
  flow: (artist) => `Analyze ${artist}'s rap flow, rhythm, and cadence. Cover syllable placement, rhythm patterns, breath control, beat riding, double-time vs half-time, and signature flow techniques. Use catalog examples.`,
  themes: (artist) => `Analyze the common themes in ${artist}'s music. Cover recurring motifs, emotional tone, life experiences, and how their themes evolved over time.`
};

/**
 * Breaks down how an artist writes, so the style can be studied before it is
 * borrowed.
 *
 * @param {string} artist - Artist to analyse.
 * @param {'full'|'style'|'flow'|'themes'} [mode='full'] - Which angle to take.
 * @param {Object} store - LyricStore, for the API key and model config.
 * @returns {Promise<string>} Prose analysis.
 */
export async function analyzeArtistStyle(artist, mode = 'full', store) {
  assertApiKey(store?.config);
  const name = String(artist || '').trim();
  if (!name) throw new Error('Name an artist first.');

  const build = ARTIST_ANALYSIS_MODES[mode] || ARTIST_ANALYSIS_MODES.full;
  const result = await callAI([
    { role: 'system', content: 'You are a music journalist and lyrical analyst. Be specific and concrete, cite real songs, and avoid generic praise. Use short paragraphs and plain language.' },
    { role: 'user', content: build(name) }
  ], store.config);

  return String(result || '').trim();
}

/**
 * Suggests style tags for a piece of writing, for pasting into a music
 * generator. Never returns a real person's name — those get rejected.
 *
 * @param {string} text - Lyrics or a description of the song.
 * @param {Object} store - LyricStore, for the API key and model config.
 * @returns {Promise<string>} Comma-separated tags on one line.
 */
export async function suggestStyleTags(text, store) {
  assertApiKey(store?.config);
  const result = await callAI([
    { role: 'system', content: 'You output only a single comma-separated line of style keywords. Nothing else.' },
    { role: 'user', content: `Give 10-14 comma-separated style keywords for this song. STRICT: no artist names, no real person names, no celebrity names. Only genre, subgenre, production style, mood, tempo, instruments, vocal style, era. One line only.\n\n${String(text).slice(0, 3000)}` }
  ], store.config);

  return String(result || '').split('\n')[0].split(',').map(t => t.trim()).filter(t => t.length > 2).join(', ');
}
