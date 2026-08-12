// Song Forge — OpenRouter ONLY (Lyricist 4.2.0)
// One key: the user's OpenRouter API key from Settings.
// Lyrics: OpenRouter chat models (whatever model they picked).
// Cover art: OpenRouter image models (Nano Banana / Gemini image via OpenRouter).
// NO Google AI Studio key. NO @google/genai client.

import { callAI, buildPromptContext, parseSectionsFromText, assertApiKey, normalizeApiKey } from './AIService.js';

// OpenRouter image-model slugs (Nano Banana family exposed through OpenRouter).
// User can change these in Settings; defaults target Nano Banana 2 Lite/class.
export const IMAGE_MODELS = [
  { id: 'google/gemini-2.5-flash-image-preview', label: 'Nano Banana 2 Lite — fast (via OpenRouter)' },
  { id: 'google/gemini-2.5-flash-image', label: 'Nano Banana 2 — balanced (via OpenRouter)' },
  { id: 'black-forest-labs/flux.2-flex', label: 'Flux 2 Flex — alt quality (via OpenRouter)' },
];
export const DEFAULT_IMAGE_MODEL = 'google/gemini-2.5-flash-image-preview';

// Kept for Settings UI that still labels a "text model" — Song Forge lyrics use
// the same OpenRouter model as the rest of Lyricist (store.config.model).
export const DEFAULT_TEXT_MODEL = 'openrouter/auto';

export const BRAND_ART_STYLE =
  'Framed inside a perfectly circular medallion emblem, like a glowing engraved coin or badge — ' +
  'not a square or rectangular canvas. Deep black background outside the medallion. ' +
  'The medallion rim glows with a vivid neon electric blue-to-purple-to-emerald gradient (#00e5ff to #a855f7 to #10f0a0), ' +
  'with a soft cyan highlight accent. Sharp, high-contrast, professional album-cover quality, ' +
  'centered composition, no text or lettering anywhere in the image.';

export const MANDATORY_MEDALLION_FRAME =
  'MANDATORY OUTPUT CONSTRAINTS (these override any conflicting instruction above): ' +
  'The final image MUST be composed as a single seamless circular medallion frame, ' +
  'perfectly centered, like a glowing engraved coin — never a square or rectangular composition. ' +
  'The medallion border MUST glow intensely in electric blue (#00e5ff), electric purple (#a855f7), and emerald (#10f0a0), ' +
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

async function openRouterChat({ apiKey, model, messages, temperature = 0.75, max_tokens = 4000, modalities }) {
  const body = {
    model,
    temperature,
    max_tokens,
    messages,
  };
  // Some image models want modalities: ["image","text"]
  if (modalities) body.modalities = modalities;

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${normalizeApiKey(apiKey)}`,
      'HTTP-Referer': 'https://lyricist.app',
      'X-Title': 'Lyricist Song Forge',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData?.error?.message || `OpenRouter error (${model}): status ${response.status}`);
  }
  return response.json();
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

// Low-level image gen via OpenRouter (Nano Banana / image models on one key)
export async function generateImage(store, { prompt, aspectRatio, imageSize } = {}) {
  if (!prompt || !prompt.trim()) {
    throw new Error('Enter a description of the image you want to create.');
  }
  const apiKey = requireOpenRouter(store);
  const model = store.config.geminiImageModel || store.config.openRouterImageModel || DEFAULT_IMAGE_MODEL;

  const result = await openRouterChat({
    apiKey,
    model,
    temperature: 0.7,
    max_tokens: 2048,
    modalities: ['image', 'text'],
    messages: [
      {
        role: 'user',
        content: `${prompt.trim()}\n\nAspect: ${aspectRatio || store.config.imageAspectRatio || '1:1'}. High quality. Output an image.`,
      },
    ],
  });

  const url = extractImageFromOR(result);
  if (!url) {
    throw new Error(
      'OpenRouter did not return image data. In Settings, pick a Nano Banana / image model available on your OpenRouter account (and ensure the model supports image output).'
    );
  }

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
  const model = store.config.geminiImageModel || store.config.openRouterImageModel || DEFAULT_IMAGE_MODEL;
  const mime = referenceMimeType || 'image/png';
  const dataUrl = `data:${mime};base64,${referenceBase64}`;

  const result = await openRouterChat({
    apiKey,
    model,
    temperature: 0.7,
    max_tokens: 2048,
    modalities: ['image', 'text'],
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt || 'Transform this into polished album cover art. No text.' },
          { type: 'image_url', image_url: { url: dataUrl } },
        ],
      },
    ],
  });

  const url = extractImageFromOR(result);
  if (!url) {
    throw new Error('OpenRouter did not return image data for that reference. Try another image model on OpenRouter.');
  }

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
    `for a ${store.genre || 'genre-blending'} song titled "${title || 'Untitled'}"` +
    `${topic ? `, about ${topic}` : ''}, evoking a ${store.mood || 'striking'} mood. ` +
    `Preserve the reference image's key subject, composition and palette cues, reinterpreted as polished cover art.`;
  const style = styleOverride && styleOverride.trim() ? `Style notes: ${styleOverride.trim()}` : `Style notes: ${BRAND_ART_STYLE}`;
  const prompt = `${subject}\n\n${style}\n\n${MANDATORY_MEDALLION_FRAME}`;
  return generateImageToImage(store, { referenceBase64, referenceMimeType, prompt });
}

export async function generateCoverArt(store, { title, topic, styleOverride } = {}) {
  const prompt = buildArtPrompt({
    title,
    genre: store.genre,
    mood: store.mood,
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
  requireOpenRouter(store);
  const context = buildPromptContext(store);
  const structureSequence = (store.customStructure || []).map((s) => s.toUpperCase()).join(' -> ');
  const dataUrl = `data:${mimeType || 'image/png'};base64,${imageBase64}`;

  // Multimodal lyric write via OpenRouter (vision-capable chat model)
  const apiKey = store.config.openRouterApiKey;
  const model = store.config.model || 'openai/gpt-4o-mini';

  const userText = `Study the attached image closely — its subject, colors, lighting, mood, and any story it seems to tell. Use it as the creative seed for a song; the lyrics should feel clearly inspired by what's in the image.
${notes && notes.trim() ? `Additional direction from the songwriter: ${notes.trim()}\n` : ''}
SONGWRITING CONFIGURATION:
${context}

STRUCTURE:
${structureSequence}

Write the complete song lyrics. Ensure every section is clearly labeled. Output only the lyrics.`;

  const result = await openRouterChat({
    apiKey,
    model,
    temperature: store.config.temperature ?? 0.75,
    max_tokens: store.config.maxTokens ?? 4000,
    messages: [
      { role: 'system', content: WRITING_LAWS },
      {
        role: 'user',
        content: [
          { type: 'text', text: userText },
          { type: 'image_url', image_url: { url: dataUrl } },
        ],
      },
    ],
  });

  const rawText = result?.choices?.[0]?.message?.content;
  const text = typeof rawText === 'string' ? rawText : Array.isArray(rawText)
    ? rawText.map((p) => p?.text || '').join('\n')
    : '';

  if (!text.trim()) {
    throw new Error('OpenRouter returned empty lyrics for that image. Try again or add notes.');
  }

  return {
    rawText: text,
    sections: parseSectionsFromText(text, store),
  };
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
