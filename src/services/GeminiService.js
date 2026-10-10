// Song Forge — OpenRouter ONLY (Lyricist 4.2.0)
// One key: the user's OpenRouter API key from Settings.
// Lyrics: OpenRouter chat models (whatever model they picked).
// Cover art: OpenRouter image models (Nano Banana / Gemini image via OpenRouter).
// NO Google AI Studio key. NO @google/genai client.

import { callAI, buildPromptContext, parseSectionsFromText, assertApiKey, normalizeApiKey } from './AIService.js';
import { blendLabel } from '../utils/blend.js';
import { chatCompletion, listModels } from './openrouter.js';
import { stripReasoning, isMostlyReasoning } from '../utils/stripReasoning.js';
import { modelFit } from './modelFit.js';

// OpenRouter image-model slugs (Nano Banana family exposed through OpenRouter).
// User can change these in Settings; defaults target Nano Banana 2 Lite/class.
// All ids checked against https://openrouter.ai/api/v1/models on 2026-08-12.
// The previous list was two thirds dead: 'google/gemini-2.5-flash-image-preview'
// had been renamed and 'black-forest-labs/flux.2-flex' does not exist (there are
// no flux models on OpenRouter at all). Cheapest first.
export const IMAGE_MODELS = [
  { id: 'google/gemini-2.5-flash-image', label: 'Nano Banana 2, cheapest' },
  { id: 'google/gemini-3.1-flash-lite-image', label: 'Nano Banana 3 Lite, fast' },
  { id: 'google/gemini-3.1-flash-image', label: 'Nano Banana 3, balanced (default)' },
  { id: 'google/gemini-3-pro-image', label: 'Nano Banana 3 Pro, best quality' },
  { id: 'openai/gpt-5-image-mini', label: 'GPT-5 Image Mini, cheapest of all' },
  { id: 'openai/gpt-5-image', label: 'GPT-5 Image' },
];
/**
 * Cover-art model, as OpenRouter spells it.
 *
 * VERIFIED AGAINST THE LIVE MODEL LIST, 2026-08-12. Two dead ids were in here
 * and every one of them 404'd, which is why Song Forge could not make art at all:
 *
 *   'gemini-3.1-flash-image'                 <- saved config default. No provider
 *                                               prefix, so no such model.
 *   'google/gemini-2.5-flash-image-preview'  <- this constant. Renamed upstream;
 *                                               the '-preview' suffix is gone.
 *
 * Because the saved value was truthy it won over this fallback, and the fallback
 * was broken too, so there was no path to a working image model.
 *
 * Check an id against https://openrouter.ai/api/v1/models before putting it here.
 * A model id is not a guess.
 */
export const DEFAULT_IMAGE_MODEL = 'google/gemini-3.1-flash-image';

/** Vision-capable and free. Used only when the user's own chat model cannot
 *  read an image. Verified present on OpenRouter 2026-08-12. */
export const VISION_FALLBACK_MODEL = 'google/gemma-4-31b-it:free';

/** Image-output models that exist on OpenRouter, cheapest first. Used to tell
 *  the user what to pick when their configured model is not a real one. */
export const KNOWN_IMAGE_MODELS = [
  'google/gemini-2.5-flash-image',
  'google/gemini-3.1-flash-lite-image',
  'google/gemini-3.1-flash-image',
  'google/gemini-3-pro-image',
  'openai/gpt-5-image-mini',
  'openai/gpt-5-image',
];

// Kept for Settings UI that still labels a "text model" — Song Forge lyrics use
// the same OpenRouter model as the rest of Lyricist (store.config.model).
export const DEFAULT_TEXT_MODEL = 'openrouter/auto';

export const BRAND_ART_STYLE =
  'Framed inside a perfectly circular medallion emblem, like a glowing engraved coin or badge — ' +
  'not a square or rectangular canvas. Deep black background outside the medallion. ' +
  'The medallion rim glows with a vivid neon electric blue-to-purple-to-emerald gradient (#e7a540 to #9ba1aa to #10f0a0), ' +
  'with a soft cyan highlight accent. Sharp, high-contrast, professional album-cover quality, ' +
  'centered composition, no text or lettering anywhere in the image.';

export const MANDATORY_MEDALLION_FRAME =
  'MANDATORY OUTPUT CONSTRAINTS (these override any conflicting instruction above): ' +
  'The final image MUST be composed as a single seamless circular medallion frame, ' +
  'perfectly centered, like a glowing engraved coin — never a square or rectangular composition. ' +
  'The medallion border MUST glow intensely in electric blue (#e7a540), electric purple (#9ba1aa), and emerald (#10f0a0), ' +
  'with the glow bleeding softly into a deep black background outside the circle. ' +
  'No text or lettering anywhere in the image.';

const WRITING_LAWS = `You are the AI Writing Assistant inside Lyricist.
You despise standard, cheesy AI-generated lyrics. You write like a seasoned human songwriter who focuses on subtext, friction, and conversational truth.

STRICT WRITING LAWS:
1. RHYTHMIC CADENCE: Write lines with a natural, performable vocal groove and consistent metric structure per line.
2. ORGANIC RHYMES: Avoid predictable, infantile perfect rhymes (cat/hat, day/play). Favor slant rhymes, near-rhymes, and multi-syllabic rhymes.
3. THE LAW OF SUBTEXT: Never state an emotion directly (no "I am sad", "my broken heart"). Show it through physical friction, micro-actions, sensory detail.
4. ZERO COSMIC CLICHES: Never use neon, shadows, whispers, echoes, sparks, cage, gravity, chains, storm.
5. HUMAN PARADOX & DEPTH: Raw human conflict and contradiction. Avoid clean, preachy endings.
6. SECTION COMPOSITION: Label each section clearly (e.g. [Intro], [Verse 1], [Chorus], [Bridge], [Outro]). Output only the raw lyrics — no commentary.`;

function requireOpenRouter(store) {
  // Was a bare truthiness check on the raw field, so a key with a trailing
  // newline or a stray space passed it and then went out as a broken
  // Authorization header. assertApiKey normalises AND range-checks it, and it
  // is the same check every other path uses.
  try {
    return assertApiKey(store?.config);
  } catch (e) {
    // Keep the Song Forge wording — one key runs both halves of this tab.
    if (/No API key configured/.test(e.message)) {
      throw new Error('No OpenRouter API key configured. Add it once in Settings — that single key runs Song Forge lyrics and Nano Banana cover art.');
    }
    throw e;
  }
}

/**
 * FREE MODELS THAT CAN DO THE JOB, FROM THE LIVE CATALOGUE.
 *
 * Chris, 2026-10-10: "None of these free keys work". Art First died on
 * "Provider returned error" and "OpenRouter returned empty lyrics for that
 * image": one model tried, and the hardcoded vision fallback had been retired.
 * The catalogue says what is free today and what can see a picture or draw
 * one, so the chain is built from it, the same way AIService builds its own.
 */
let catalogue = null;
async function freeModels(test) {
  try {
    if (!catalogue) catalogue = await listModels();
  } catch { return []; }
  return catalogue
    .filter((m) => String(m?.pricing?.prompt) === '0' && String(m?.pricing?.completion) === '0')
    .filter((m) => !/^openrouter\//i.test(m?.id || ''))
    .filter((m) => !modelFit(m).cannot)
    .filter(test)
    .map((m) => m.id)
    .sort((a, b) => (/-it(?::|$)|-instruct|gemma|gemini/i.test(b) ? 1 : 0) - (/-it(?::|$)|-instruct|gemma|gemini/i.test(a) ? 1 : 0));
}
const canSee = (m) => (m?.architecture?.input_modalities || []).includes('image') || /vision|-vl|gemma-[34]|gemini|llama-4/i.test(m?.id || '');
const canDraw = (m) => (m?.architecture?.output_modalities || []).includes('image');

const NO_FREE_ART =
  'Making a picture needs OpenRouter credits: no image model is free. Add a few dollars at openrouter.ai/credits, '
  + 'or upload your own picture in Art First and press Write Lyrics from it, which works on the free models.';

async function openRouterChat({ apiKey, model, messages, temperature = 0.75, max_tokens = 4000, modalities }) {
  const body = {
    model,
    temperature,
    max_tokens,
    messages,
  };
  // Some image models want modalities: ["image","text"]
  if (modalities) body.modalities = modalities;
  // Keep a reasoning model's planning pass out of the reply. On the text path a
  // scratchpad reads as lyrics; see stripReasoning.js.
  else body.reasoning = { exclude: true };

  const r = await chatCompletion(body, { apiKey: normalizeApiKey(apiKey) });
  if (!r.ok) {
    throw new Error(r.status ? r.message || `OpenRouter error (${model}): status ${r.status}` : `Could not reach OpenRouter (${model}).`);
  }
  return r.json || {};
}

/** Pull base64 / data-URL image from various OpenRouter response shapes. */
function extractImageFromOR(result) {
  const msg = result?.choices?.[0]?.message;
  if (!msg) return null;

  // Newer: message.images[]
  if (Array.isArray(msg.images) && msg.images.length) {
    const url = msg.images[0]?.image_url?.url || msg.images[0]?.url;
    if (url) return url;
  }

  // Content parts
  if (Array.isArray(msg.content)) {
    for (const part of msg.content) {
      if (part?.type === 'image_url' && part.image_url?.url) return part.image_url.url;
      if (part?.type === 'image' && part.image_url?.url) return part.image_url.url;
      if (part?.image_url?.url) return part.image_url.url;
    }
  }

  // String content that is a data URL
  if (typeof msg.content === 'string' && msg.content.startsWith('data:image')) {
    return msg.content;
  }

  // Sometimes markdown image
  if (typeof msg.content === 'string') {
    const m = msg.content.match(/data:image\/[a-zA-Z+]+;base64,[A-Za-z0-9+/=]+/);
    if (m) return m[0];
    const urlM = msg.content.match(/https?:\/\/\S+\.(png|jpg|jpeg|webp)/i);
    if (urlM) return urlM[0];
  }

  return null;
}

/**
 * Work out which image model to actually send, repairing the two shapes of bad
 * id that shipped.
 *
 * An id with no "provider/" prefix is never valid on OpenRouter, and that is
 * exactly what was saved into every install ('gemini-3.1-flash-image'). Rather
 * than 404 on it, prefix it with google/ when that yields a model we know is
 * real, and otherwise fall back to the default. Silent correction of a broken
 * value is right here; silently changing a WORKING choice would not be.
 */
export function resolveImageModel(store) {
  const raw = String(
    store?.config?.geminiImageModel || store?.config?.openRouterImageModel || ''
  ).trim();
  if (!raw) return DEFAULT_IMAGE_MODEL;
  if (KNOWN_IMAGE_MODELS.includes(raw)) return raw;
  if (!raw.includes('/')) {
    const prefixed = `google/${raw}`;
    if (KNOWN_IMAGE_MODELS.includes(prefixed)) {
      console.warn(`[Lyricist] Cover-art model "${raw}" has no provider prefix; using "${prefixed}".`);
      return prefixed;
    }
  }
  // Retired upstream: the '-preview' suffix was dropped from these.
  const depreviewed = raw.replace(/-preview$/, '');
  if (KNOWN_IMAGE_MODELS.includes(depreviewed)) {
    console.warn(`[Lyricist] Cover-art model "${raw}" was renamed; using "${depreviewed}".`);
    return depreviewed;
  }
  // Unknown but plausibly valid (the list moves) - let it through rather than
  // blocking a model that exists but postdates this build.
  if (raw.includes('/')) return raw;
  console.warn(`[Lyricist] Cover-art model "${raw}" is not a valid OpenRouter id; using "${DEFAULT_IMAGE_MODEL}".`);
  return DEFAULT_IMAGE_MODEL;
}

function dataUrlParts(dataUrlOrBase64) {
  if (!dataUrlOrBase64) return { dataUrl: null, base64: null };
  if (dataUrlOrBase64.startsWith('data:')) {
    const base64 = dataUrlOrBase64.split(',')[1] || '';
    return { dataUrl: dataUrlOrBase64, base64 };
  }
  return {
    dataUrl: `data:image/png;base64,${dataUrlOrBase64}`,
    base64: dataUrlOrBase64,
  };
}

// ── Lyrics via OpenRouter (same key as the rest of Lyricist) ─────────────
export async function generateSongWithGemini(store) {
  requireOpenRouter(store);
  const context = buildPromptContext(store);
  const structureSequence = (store.customStructure || []).map((s) => s.toUpperCase()).join(' -> ');

  const userPrompt = `Write the complete song lyrics based on this context:
${context}

STRUCTURE:
${structureSequence}

Ensure every section is clearly labeled, and that the lyrics are highly authentic, performable, and deeply human.`;

  const rawText = await callAI(
    [
      { role: 'system', content: WRITING_LAWS },
      { role: 'user', content: userPrompt },
    ],
    store.config,
    store.config.temperature ?? 0.75,
    store.config.maxTokens ?? 4000
  );

  if (!rawText?.trim()) {
    throw new Error('OpenRouter returned empty lyrics. Check your key, model, and credits.');
  }

  return {
    rawText,
    sections: parseSectionsFromText(rawText, store),
  };
}

function buildArtPrompt({ title, genre, mood, topic, styleOverride }) {
  const subject =
    `Album cover art for a ${genre || 'genre-blending'} song titled "${title || 'Untitled'}"` +
    `${topic ? `, about ${topic}` : ''}, evoking a ${mood || 'striking'} mood.`;
  const style = styleOverride && styleOverride.trim() ? styleOverride.trim() : BRAND_ART_STYLE;
  return `${subject}\n\nStyle: ${style}\n\nGenerate a single polished image. No text or lettering.`;
}

/**
 * Draw with the chosen image model, then any image model the catalogue lists as
 * free. Out of credits (402) or nothing free to draw with: say what to do.
 */
async function drawWithChain(apiKey, chosen, messages) {
  const chain = [chosen, ...(await freeModels(canDraw))].filter((m, i, a) => m && a.indexOf(m) === i);
  let first = null;
  for (const model of chain) {
    try {
      const result = await openRouterChat({ apiKey, model, temperature: 0.7, max_tokens: 2048, modalities: ['image', 'text'], messages });
      const url = extractImageFromOR(result);
      if (url) return url;
      first ??= new Error(`${model} answered without a picture.`);
    } catch (e) {
      first ??= e;
    }
  }
  const m = String(first?.message || '');
  if (/credit|402|payment|insufficient|provider returned error|no endpoints|not a valid model/i.test(m) || chain.length === 1) {
    throw new Error(`${NO_FREE_ART}\n\n(OpenRouter said: ${m || 'no picture came back'})`);
  }
  throw first;
}

// Low-level image gen via OpenRouter (Nano Banana / image models on one key)
export async function generateImage(store, { prompt, aspectRatio, imageSize } = {}) {
  if (!prompt || !prompt.trim()) {
    throw new Error('Enter a description of the image you want to create.');
  }
  const apiKey = requireOpenRouter(store);
  const messages = [
    {
      role: 'user',
      content: `${prompt.trim()}\n\nAspect: ${aspectRatio || store.config.imageAspectRatio || '1:1'}. High quality. Output an image.`,
    },
  ];
  const url = await drawWithChain(apiKey, resolveImageModel(store), messages);

  // If it's a remote URL, fetch and convert to data URL for save/export
  let dataUrl = url;
  if (url.startsWith('http')) {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch {
      dataUrl = url;
    }
  }

  const parts = dataUrlParts(dataUrl);
  return {
    dataUrl: parts.dataUrl,
    base64: parts.base64,
    mimeType: 'image/png',
    prompt,
  };
}

export async function generateImageToImage(store, { referenceBase64, referenceMimeType, prompt } = {}) {
  if (!referenceBase64) {
    throw new Error('No reference image provided. Upload one first.');
  }
  const apiKey = requireOpenRouter(store);
  const mime = referenceMimeType || 'image/png';
  const dataUrl = `data:${mime};base64,${referenceBase64}`;
  const url = await drawWithChain(apiKey, resolveImageModel(store), [
    {
      role: 'user',
      content: [
        { type: 'text', text: prompt || 'Transform this into polished album cover art. No text.' },
        { type: 'image_url', image_url: { url: dataUrl } },
      ],
    },
  ]);

  let finalUrl = url;
  if (url.startsWith('http')) {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      finalUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch {
      finalUrl = url;
    }
  }

  const parts = dataUrlParts(finalUrl);
  return {
    dataUrl: parts.dataUrl,
    base64: parts.base64,
    mimeType: 'image/png',
    prompt,
  };
}

export async function generateCoverArtFromReference(store, { referenceBase64, referenceMimeType, title, topic, styleOverride } = {}) {
  const subject =
    `Using the attached image as the primary visual reference and base layer, create new album cover art ` +
    `for a ${blendLabel(store.genreList) || store.genre || 'genre-blending'} song titled "${title || 'Untitled'}"` +
    `${topic ? `, about ${topic}` : ''}, evoking a ${blendLabel(store.moodList) || store.mood || 'striking'} mood. ` +
    `Preserve the reference image's key subject, composition and palette cues, reinterpreted as polished cover art.`;
  const style = styleOverride && styleOverride.trim() ? `Style notes: ${styleOverride.trim()}` : `Style notes: ${BRAND_ART_STYLE}`;
  const prompt = `${subject}\n\n${style}\n\n${MANDATORY_MEDALLION_FRAME}`;
  return generateImageToImage(store, { referenceBase64, referenceMimeType, prompt });
}

export async function generateCoverArt(store, { title, topic, styleOverride } = {}) {
  const prompt = buildArtPrompt({
    title,
    genre: blendLabel(store.genreList) || store.genre,
    mood: blendLabel(store.moodList) || store.mood,
    topic: topic || store.topic,
    styleOverride: styleOverride ?? store.config.customArtStyle,
  });
  // Append brand frame for cover art
  return generateImage(store, {
    prompt: `${prompt}\n\n${MANDATORY_MEDALLION_FRAME}`,
  });
}

export async function generateSongFromImage(store, { imageBase64, mimeType, notes } = {}) {
  if (!imageBase64) {
    throw new Error('No image provided. Upload one or generate one first.');
  }
  // Take the CLEANED key that requireOpenRouter returns. This used to re-read
  // store.config.openRouterApiKey raw a few lines later, which skipped the
  // normalisation every other path goes through, so a key with a trailing
  // newline failed Art First with "Missing Authentication header" even after
  // that bug was fixed everywhere else.
  const apiKey = requireOpenRouter(store);
  const context = buildPromptContext(store);
  const structureSequence = (store.customStructure || []).map((s) => s.toUpperCase()).join(' -> ');
  const dataUrl = `data:${mimeType || 'image/png'};base64,${imageBase64}`;

  const messages = [
    { role: 'system', content: WRITING_LAWS },
    {
      role: 'user',
      content: [
        { type: 'text', text: `Study the attached image closely — its subject, colors, lighting, mood, and any story it seems to tell. Use it as the creative seed for a song; the lyrics should feel clearly inspired by what's in the image.
${notes && notes.trim() ? `Additional direction from the songwriter: ${notes.trim()}\n` : ''}
SONGWRITING CONFIGURATION:
${context}

STRUCTURE:
${structureSequence}

Write the complete song lyrics. Ensure every section is clearly labeled. Output only the lyrics.` },
        { type: 'image_url', image_url: { url: dataUrl } },
      ],
    },
  ];

  /**
   * THE CHAIN. Their model first (unless it is a router), then every free
   * model the catalogue says can see a picture, then the old fallback. A
   * provider error, an empty reply or a thinking pass with no lyrics moves on
   * to the next one; a thinking model that ran out of room gets one more go
   * with room to write. Moving to a free model never costs them anything.
   */
  const picked = String(store.config.model || '');
  const chain = [
    /^openrouter\//i.test(picked) ? null : picked,
    ...(await freeModels(canSee)),
    VISION_FALLBACK_MODEL,
  ].filter((m, i, a) => m && a.indexOf(m) === i);

  const temperature = store.config.temperature ?? 0.75;
  const cap = store.config.maxTokens ?? 4000;
  const read = (result) => {
    const raw = result?.choices?.[0]?.message?.content;
    const t = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw.map((p) => p?.text || '').join('\n') : '';
    return stripReasoning(t, { aggressive: true });
  };
  let first = null;
  for (const model of chain.slice(0, 6)) {
    try {
      let result = await openRouterChat({ apiKey, model, temperature, max_tokens: cap, messages });
      let text = read(result);
      if (!text.trim() && result?.choices?.[0]?.finish_reason === 'length') {
        result = await openRouterChat({ apiKey, model, temperature, max_tokens: Math.min(16000, cap * 4), messages });
        text = read(result);
      }
      if (text.trim() && !isMostlyReasoning(text)) {
        if (model !== chain[0]) console.warn(`[Lyricist] Wrote from the picture on ${model}.`);
        return { rawText: text, sections: parseSectionsFromText(text, store) };
      }
      first ??= new Error(`${model} came back empty.`);
    } catch (e) {
      first ??= e;
      console.warn(`[Lyricist] ${model} could not write from the picture:`, e.message);
    }
  }
  throw new Error(
    `No model would write from that picture (tried ${chain.slice(0, 6).join(', ')}). `
    + `First answer: ${first?.message || 'empty'}. Try again in a minute, or pick a different model in Settings.`
  );
}

function deriveTitle(sections) {
  const chorus = sections.find((s) => s.type === 'chorus') || sections[0];
  const line = chorus?.lines?.[0]?.text || '';
  return line.replace(/[.,!?]+$/, '').trim();
}

export async function generateSongAndArt(store, { artStyleOverride } = {}) {
  const song = await generateSongWithGemini(store);
  const title = deriveTitle(song.sections) || store.topic || store.genre;
  const art = await generateCoverArt(store, { title, topic: store.topic, styleOverride: artStyleOverride });
  return { song, art, title };
}
