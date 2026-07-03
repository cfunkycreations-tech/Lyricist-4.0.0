// Gemini "Song Forge" integration — Lyricist 4.1.3
// Uses Google's Interactions API (@google/genai) to:
//   1. Compose song lyrics + structure with gemini-3.5-flash (service_tier: 'flex')
//   2. Chain a second call to a Nano Banana image model for matching cover art
//
// Same BYOK-in-renderer model as AIService.js/OpenRouter: the user supplies
// their own Google AI Studio key (Settings), it lives in localStorage, and
// calls go straight from the Electron renderer to Google's API. That means
// the key is readable via devtools on this machine — acceptable for a
// single-user desktop BYOK app, but do NOT reuse this pattern in a hosted/
// multi-user context; proxy through a server there instead.
import { GoogleGenAI } from '@google/genai';
import { buildPromptContext, parseSectionsFromText } from './AIService.js';

export const DEFAULT_TEXT_MODEL = 'gemini-3.5-flash';

// Nano Banana family — pick by speed/cost vs. quality.
export const IMAGE_MODELS = [
  { id: 'gemini-3.1-flash-lite-image', label: 'Nano Banana 2 Lite — fastest, cheapest (1K only)' },
  { id: 'gemini-3.1-flash-image', label: 'Nano Banana 2 — balanced quality & speed (default)' },
  { id: 'gemini-3-pro-image', label: 'Nano Banana Pro — highest fidelity, slower' }
];
export const DEFAULT_IMAGE_MODEL = 'gemini-3.1-flash-image';

// Lyricist's signature cover-art frame. Used unless the user overrides it
// in Settings/Song Forge with their own style prompt.
export const BRAND_ART_STYLE =
  'Framed inside a perfectly circular medallion emblem, like a glowing engraved coin or badge — ' +
  'not a square or rectangular canvas. Deep black background outside the medallion. ' +
  'The medallion rim glows with a vivid neon magenta-to-orange gradient (#ff2d95 to #ff9e2c), ' +
  'with a soft cyan highlight accent. Sharp, high-contrast, professional album-cover quality, ' +
  'centered composition, no text or lettering anywhere in the image.';

let cachedClient = null;
let cachedKey = null;

function getClient(apiKey) {
  if (!apiKey) {
    throw new Error('No Google AI API key configured. Add one in Settings under "Google Gemini API Key".');
  }
  if (!cachedClient || cachedKey !== apiKey) {
    cachedClient = new GoogleGenAI({ apiKey });
    cachedKey = apiKey;
  }
  return cachedClient;
}

// Flex tier is ~50% cheaper but Google will NOT silently upgrade a full
// flex queue to standard — a 429/503 there just means "try later". We
// retry with backoff, then fall back to the standard tier once rather
// than fail the user's generation outright.
async function createInteraction(client, params, { retries = 2 } = {}) {
  const isFlex = params.service_tier === 'flex';
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await client.interactions.create(params);
    } catch (err) {
      lastErr = err;
      const status = err?.status ?? err?.code;
      const capacityIssue = status === 429 || status === 503;
      if (capacityIssue && attempt < retries) {
        await new Promise(r => setTimeout(r, 1000 * 2 ** attempt));
        continue;
      }
      if (capacityIssue && isFlex) {
        // Final fallback: same request, standard tier, no further retries.
        const { service_tier, ...standardParams } = params;
        return client.interactions.create(standardParams);
      }
      throw new Error(err?.message || `Gemini API error calling ${params.model}`);
    }
  }
  throw new Error(lastErr?.message || `Gemini API error calling ${params.model}`);
}

const WRITING_LAWS = `You are the AI Writing Assistant inside Lyricist.
You despise standard, cheesy AI-generated lyrics. You write like a seasoned human songwriter who focuses on subtext, friction, and conversational truth.

STRICT WRITING LAWS:
1. RHYTHMIC CADENCE: Write lines with a natural, performable vocal groove and consistent metric structure per line.
2. ORGANIC RHYMES: Avoid predictable, infantile perfect rhymes (cat/hat, day/play). Favor slant rhymes, near-rhymes, and multi-syllabic rhymes.
3. THE LAW OF SUBTEXT: Never state an emotion directly (no "I am sad", "my broken heart"). Show it through physical friction, micro-actions, sensory detail.
4. ZERO COSMIC CLICHES: Never use neon, shadows, whispers, echoes, sparks, cage, gravity, chains, storm.
5. HUMAN PARADOX & DEPTH: Raw human conflict and contradiction. Avoid clean, preachy endings.
6. SECTION COMPOSITION: Label each section clearly (e.g. [Intro], [Verse 1], [Chorus], [Bridge], [Outro]). Output only the raw lyrics — no commentary.`;

// 1. Text generation — gemini-3.5-flash on the flex tier
export async function generateSongWithGemini(store) {
  const { googleApiKey, geminiTextModel, useFlexTier, temperature } = store.config;
  const client = getClient(googleApiKey);

  const context = buildPromptContext(store);
  const structureSequence = store.customStructure.map(s => s.toUpperCase()).join(' -> ');

  const userPrompt = `Write the complete song lyrics based on this context:
${context}

STRUCTURE:
${structureSequence}

Ensure every section is clearly labeled, and that the lyrics are highly authentic, performable, and deeply human.`;

  const interaction = await createInteraction(client, {
    model: geminiTextModel || DEFAULT_TEXT_MODEL,
    input: userPrompt,
    system_instruction: WRITING_LAWS,
    service_tier: useFlexTier === false ? undefined : 'flex',
    generation_config: {
      temperature: temperature ?? 0.75
    }
  });

  const rawText = interaction.output_text || '';
  if (!rawText.trim()) {
    throw new Error('Gemini returned an empty response. Try again, or check your Google AI API key / quota.');
  }

  return {
    interactionId: interaction.id,
    rawText,
    sections: parseSectionsFromText(rawText, store)
  };
}

function buildArtPrompt({ title, genre, mood, topic, styleOverride }) {
  const subject = `Album cover art for a ${genre || 'genre-blending'} song titled "${title || 'Untitled'}"` +
    `${topic ? `, about ${topic}` : ''}, evoking a ${mood || 'striking'} mood.`;
  const style = (styleOverride && styleOverride.trim()) ? styleOverride.trim() : BRAND_ART_STYLE;
  return `${subject}\n\nStyle: ${style}`;
}

// Low-level image call — any free-form prompt, no brand styling applied.
// generateCoverArt() below wraps this with the medallion/neon brand prompt;
// the "create an image, then write a song from it" flow uses this directly.
export async function generateImage(store, { prompt, aspectRatio, imageSize } = {}) {
  if (!prompt || !prompt.trim()) {
    throw new Error('Enter a description of the image you want to create.');
  }
  const { googleApiKey, geminiImageModel } = store.config;
  const client = getClient(googleApiKey);

  const interaction = await createInteraction(client, {
    model: geminiImageModel || DEFAULT_IMAGE_MODEL,
    input: prompt,
    response_format: {
      type: 'image',
      mime_type: 'image/png',
      aspect_ratio: aspectRatio || store.config.imageAspectRatio || '1:1',
      image_size: imageSize || store.config.imageSize || '2K'
    }
  });

  const imageData = interaction.output_image?.data;
  if (!imageData) {
    throw new Error('Gemini did not return image data. Try again, or adjust the prompt.');
  }

  return {
    interactionId: interaction.id,
    dataUrl: `data:image/png;base64,${imageData}`,
    base64: imageData,
    mimeType: 'image/png',
    prompt
  };
}

// ── Image-to-image (4.1.3) ──────────────────────────────────────────────
// The user's uploaded reference image is passed to Nano Banana as the primary
// visual base layer. Whatever style notes ride along, the output constraints
// below are NON-NEGOTIABLE and are always appended last so they win.
export const MANDATORY_MEDALLION_FRAME =
  'MANDATORY OUTPUT CONSTRAINTS (these override any conflicting instruction above): ' +
  'The final image MUST be composed as a single seamless circular medallion frame, ' +
  'perfectly centered, like a glowing engraved coin — never a square or rectangular composition. ' +
  'The medallion border MUST glow intensely in neon magenta (#ff2d95) and neon orange (#ff9e2c), ' +
  'with the glow bleeding softly into a deep black background outside the circle. ' +
  'No text or lettering anywhere in the image.';

// Low-level image-to-image call: reference image in, new image out.
export async function generateImageToImage(store, { referenceBase64, referenceMimeType, prompt, aspectRatio, imageSize } = {}) {
  if (!referenceBase64) {
    throw new Error('No reference image provided. Upload one first.');
  }
  const { googleApiKey, geminiImageModel } = store.config;
  const client = getClient(googleApiKey);

  const interaction = await createInteraction(client, {
    model: geminiImageModel || DEFAULT_IMAGE_MODEL,
    // The reference image leads the input so the model treats it as the
    // base layer; the text steers the transformation applied on top of it.
    input: [
      { type: 'image', data: referenceBase64, mime_type: referenceMimeType || 'image/png' },
      { type: 'text', text: prompt }
    ],
    response_format: {
      type: 'image',
      mime_type: 'image/png',
      aspect_ratio: aspectRatio || '1:1', // medallion frame is always square
      image_size: imageSize || store.config.imageSize || '2K'
    }
  });

  const imageData = interaction.output_image?.data;
  if (!imageData) {
    throw new Error('Gemini did not return image data for that reference. Try a different image or prompt.');
  }

  return {
    interactionId: interaction.id,
    dataUrl: `data:image/png;base64,${imageData}`,
    base64: imageData,
    mimeType: 'image/png',
    prompt
  };
}

// Brand-locked cover art from an uploaded reference image. The reference is
// the primary visual seed; the medallion/neon frame constraints are enforced
// regardless of any user style override.
export async function generateCoverArtFromReference(store, { referenceBase64, referenceMimeType, title, topic, styleOverride } = {}) {
  const subject =
    `Using the attached image as the primary visual reference and base layer, create new album cover art ` +
    `for a ${store.genre || 'genre-blending'} song titled "${title || 'Untitled'}"` +
    `${topic ? `, about ${topic}` : ''}, evoking a ${store.mood || 'striking'} mood. ` +
    `Preserve the reference image's key subject, composition and palette cues, reinterpreted as polished cover art.`;
  const style = (styleOverride && styleOverride.trim()) ? `Style notes: ${styleOverride.trim()}` : `Style notes: ${BRAND_ART_STYLE}`;
  const prompt = `${subject}\n\n${style}\n\n${MANDATORY_MEDALLION_FRAME}`;
  return generateImageToImage(store, { referenceBase64, referenceMimeType, prompt });
}

// 2. Art generation — chained call to a Nano Banana image model, brand-styled
export async function generateCoverArt(store, { title, topic, styleOverride } = {}) {
  const prompt = buildArtPrompt({
    title,
    genre: store.genre,
    mood: store.mood,
    topic: topic || store.topic,
    styleOverride: styleOverride ?? store.config.customArtStyle
  });
  return generateImage(store, { prompt });
}

// Reverse flow: an image (uploaded or Gemini-generated) becomes the creative
// seed for the lyrics. imageBase64 must be raw base64 (no "data:...;base64," prefix).
export async function generateSongFromImage(store, { imageBase64, mimeType, notes } = {}) {
  if (!imageBase64) {
    throw new Error('No image provided. Upload one or generate one first.');
  }
  const { googleApiKey, geminiTextModel, useFlexTier, temperature } = store.config;
  const client = getClient(googleApiKey);

  const context = buildPromptContext(store);
  const structureSequence = store.customStructure.map(s => s.toUpperCase()).join(' -> ');

  const userPrompt = `Study the attached image closely — its subject, colors, lighting, mood, and any story it seems to tell. Use it as the creative seed for a song; the lyrics should feel clearly inspired by what's in the image.
${notes && notes.trim() ? `Additional direction from the songwriter: ${notes.trim()}\n` : ''}
SONGWRITING CONFIGURATION:
${context}

STRUCTURE:
${structureSequence}

Write the complete song lyrics. Ensure every section is clearly labeled, and that the lyrics are highly authentic, performable, and deeply human.`;

  const interaction = await createInteraction(client, {
    model: geminiTextModel || DEFAULT_TEXT_MODEL,
    input: [
      { type: 'text', text: userPrompt },
      { type: 'image', data: imageBase64, mime_type: mimeType || 'image/png' }
    ],
    system_instruction: WRITING_LAWS,
    service_tier: useFlexTier === false ? undefined : 'flex',
    generation_config: {
      temperature: temperature ?? 0.75
    }
  });

  const rawText = interaction.output_text || '';
  if (!rawText.trim()) {
    throw new Error('Gemini returned an empty response for that image. Try again, or add a few notes for direction.');
  }

  return {
    interactionId: interaction.id,
    rawText,
    sections: parseSectionsFromText(rawText, store)
  };
}

// Best-effort title guess from generated sections, used only to seed the art prompt.
function deriveTitle(sections) {
  const chorus = sections.find(s => s.type === 'chorus') || sections[0];
  const line = chorus?.lines?.[0]?.text || '';
  return line.replace(/[.,!?]+$/, '').trim();
}

// Orchestrates both calls: write the song, then generate matching cover art.
export async function generateSongAndArt(store, { artStyleOverride } = {}) {
  const song = await generateSongWithGemini(store);
  const title = deriveTitle(song.sections) || store.topic || store.genre;
  const art = await generateCoverArt(store, { title, topic: store.topic, styleOverride: artStyleOverride });
  return { song, art, title };
}
