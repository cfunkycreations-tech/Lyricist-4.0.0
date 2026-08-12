// AI integration service for Lyricist 4.0.7
// Enforces: Law of Subtext, Law of Human Paradox, Conversational Cadence

import { cleanRefineOutput } from '../utils/refineClean.js';
import { inspectGenerated, truncateAtCollapse } from '../utils/lyricSanity.js';

/**
 * The model that answered last, and what shape the answer was in.
 *
 * There was no way to tell which model wrote a song. When one started returning
 * rubble, the app said nothing about where it came from and there was nothing to
 * check — you could believe you were on the model you picked while something
 * else entirely was answering. Every call now records it.
 */
export const lastGeneration = { model: null, provider: null, ok: true, reasons: [], dropped: 0, at: null, unfiltered: false };

/** A model that returns this is not writing a song and should not be retried into. */
const FALLBACK_MODEL = 'google/gemma-4-31b-it:free';

/**
 * Did OpenRouter reject the request because our provider filter left nothing
 * to route to? That is a filter problem, not a model problem, and it must
 * never be what the user sees.
 */
function isNoEndpointsError(status, message) {
  return status === 404 || /no endpoints found/i.test(message || '');
}

/**
 * Clean a pasted key into something that can actually go in a header.
 *
 * A key copied off a web page routinely arrives with a trailing newline, a
 * non-breaking space, smart quotes around it, or the word "Bearer" already on
 * the front. Every one of those is TRUTHY, so it sailed past the `!key` guard
 * and then went out as `Bearer  ` or `Bearer Bearer sk-...` — and OpenRouter
 * answers that with "Missing Authentication header", which tells the user
 * nothing and reads like the app is broken.
 */
export function normalizeApiKey(raw) {
  return String(raw ?? '')
    // strip every kind of space, including NBSP and stray line breaks
    .replace(/[\s ​]+/g, '')
    // smart or straight quotes wrapped around a paste
    .replace(/^["'‘’“”]+|["'‘’“”]+$/g, '')
    // "Bearer sk-or-..." pasted whole
    .replace(/^bearer/i, '');
}

async function postCompletion(body, config) {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${normalizeApiKey(config.openRouterApiKey)}`,
      "HTTP-Referer": "https://lyricist.app",
      "X-Title": "Lyricist 4.2.0"
    },
    body: JSON.stringify(body)
  });
  if (response.ok) return { ok: true, result: await response.json() };
  const errData = await response.json().catch(() => ({}));
  return { ok: false, status: response.status, message: errData?.error?.message || '' };
}

async function singleCall(messages, config, modelId, customTemp, customMax) {
  const body = {
    model: modelId,
    temperature: customTemp !== null ? customTemp : config.temperature,
    max_tokens: customMax !== null ? customMax : config.maxTokens,
    // Sampling guards. Without these a model that starts to drift has nothing
    // pulling it back, and it will happily fill the entire token budget with
    // wreckage — which is exactly what happened: two good sections, then
    // thousands of tokens of subword salad.
    top_p: 0.9,
    frequency_penalty: 0.3,
    presence_penalty: 0.2,
    // WHICH COPY OF THE MODEL ANSWERS MATTERS AS MUCH AS WHICH MODEL.
    // OpenRouter spreads one model id across many hosts, and some serve
    // aggressively quantised builds. A heavily squeezed model reads fine for
    // a verse or two and then falls apart into subword salad on a long
    // generation — the same wreckage a wrong-model router produces, from a
    // model you correctly chose and are paying for. So we ASK for the
    // unsqueezed builds.
    //
    // 'unknown' IS IN THIS LIST AND MUST STAY IN IT. Every first-party provider
    // — Anthropic, OpenAI, Google — reports quantization 'unknown', because
    // they serve their own weights and don't publish the precision. Only
    // open-weight models rehosted by third parties (Llama, Qwen, Mistral)
    // declare fp8/bf16. Leaving 'unknown' out doesn't screen out bad hosts; it
    // screens out every paid frontier model there is, and the request dies with
    // "No endpoints found for the request with quantization: ..." — API jargon
    // where the song should be. That is exactly what shipped, and it broke
    // Ghost Rider on the paid model that was set as number one.
    //
    // What this still excludes is the real target: int4/int8/q4 rehosts of
    // open-weight models, which are the ones that read fine for a verse and
    // then fall apart.
    provider: {
      quantizations: ['fp32', 'bf16', 'fp16', 'fp8', 'unknown'],
      allow_fallbacks: true,
    },
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
    throw new Error(attempt.message || `API Error (${modelId}): status ${attempt.status}`);
  }
  const result = attempt.result;
  // OpenRouter reports the model it actually used, which for a router is not
  // the one that was asked for.
  const served = result.model || modelId;
  const provider = result.provider || null;
  // Truncation is its own failure: a reply cut off at the token ceiling looks
  // like a song that stops mid-thought, and it is worth naming as that rather
  // than leaving it to look like the model lost the plot.
  const finish = result.choices?.[0]?.finish_reason || null;
  return { text: result.choices?.[0]?.message?.content || "", model: served, provider, finish, unfiltered };
}

/**
 * Call a model and refuse to pass back rubble.
 *
 * If the answer has collapsed, the good opening is kept and the wreckage cut.
 * If there is nothing worth keeping, one retry goes to a known-good instruct
 * model rather than whatever the router felt like — because the usual cause is
 * that the request was handed to a model with no business writing lyrics.
 */
async function guardedCall(messages, config, modelId, customTemp, customMax) {
  const { text, model, provider, finish, unfiltered } = await singleCall(messages, config, modelId, customTemp, customMax);
  const verdict = inspectGenerated(text);
  Object.assign(lastGeneration, {
    model, provider, ok: verdict.ok, reasons: verdict.reasons, dropped: 0, at: Date.now(), unfiltered,
  });
  // Not an error — the song still got written. But if this one turns out to be
  // rubble, the fact that no unquantised host was available is the first thing
  // worth knowing.
  if (unfiltered) {
    lastGeneration.reasons = [...verdict.reasons, 'no full-precision host was available for this model — any provider was allowed'];
  }
  if (finish === 'length') {
    lastGeneration.reasons = [...lastGeneration.reasons, 'hit the token limit — raise Max Tokens in Settings'];
  }
  if (verdict.ok) return text;

  const cut = truncateAtCollapse(text);
  lastGeneration.dropped = cut.dropped;
  const stillGood = cut.text.trim() && inspectGenerated(cut.text).ok;
  // Keep a salvaged song only if a real amount of it survived.
  if (stillGood && cut.text.split('\n').filter((l) => l.trim()).length >= 6) return cut.text;

  if (modelId !== FALLBACK_MODEL) {
    const retry = await singleCall(messages, config, FALLBACK_MODEL, customTemp, customMax);
    const rv = inspectGenerated(retry.text);
    Object.assign(lastGeneration, {
      model: retry.model, ok: rv.ok, reasons: rv.reasons, dropped: 0, at: Date.now(),
    });
    if (rv.ok) return retry.text;
    const rcut = truncateAtCollapse(retry.text);
    lastGeneration.dropped = rcut.dropped;
    if (rcut.text.trim()) return rcut.text;
  }

  throw new Error(
    `"${model}" returned unusable text (${verdict.reasons.join('; ')}). `
    + `Pick a different model in Settings — avoid the coding and safety models on the free router.`
  );
}

/**
 * The ONE key check. Every path that can reach OpenRouter must call this first.
 *
 * It used to live inline in callAI, which meant it only covered the paths that
 * went through callAI — and three did not: the Multi-Model Fusion drafts
 * (singleCall directly), the fusion synthesiser (guardedCall directly), and the
 * separate raw fetches in GeminiService and RhymeHelper. Those sent the request
 * with no guard at all, so an unusable key produced OpenRouter's
 * "Missing Authentication header" instead of a sentence naming the problem.
 * That is what Chris hit while rewriting lyrics he had uploaded.
 *
 * Throws with something the user can act on. Returns the cleaned key.
 */
export function assertApiKey(config) {
  const key = normalizeApiKey(config?.openRouterApiKey);
  if (!key) {
    throw new Error("No API key configured. Go to the Settings tab to add your OpenRouter key.");
  }
  if (!/^sk-or-/i.test(key)) {
    throw new Error(
      `That does not look like an OpenRouter key. It should start with "sk-or-v1-", and yours starts with "${key.slice(0, 8)}…". `
      + `Get a free key at openrouter.ai/keys and paste the whole thing into Settings.`
    );
  }
  return key;
}

export async function callAI(messages, config, customTemp = null, customMax = null) {
  assertApiKey(config);
  return guardedCall(messages, config, config.model || FALLBACK_MODEL, customTemp, customMax);
}

// Builds the global context block describing all active songwriting parameters
export function buildPromptContext(store) {
  return `
SONGWRITING CONFIGURATION:
- Genre: ${store.genre}
- Subgenre: ${store.subgenre || "none"}
- Mood: ${store.mood}
- Rhyme Scheme: ${store.rhymeScheme}
- Rhyme Density: ${store.rhymeDensity}
- Flow Pattern: ${store.flowPattern}
- Cadence Notes: ${store.cadenceNotes || "none"}
- Topic / Concept: ${store.topic || "generic human tension"}
- Artist Reference: ${store.artistRef || "none"}
- Keyword Seeds: ${store.keywordSeeds || "none"}
- Additional Notes: ${store.notes || "none"}
- Hook-First Resequencing: ${store.hookFirstMode ? "ON" : "OFF"}
`;
}

const HUMAN_LYRICIST_RULES = `
You are the AI Writing Assistant inside Lyricist 3.1.1.
You despise standard, cheesy AI-generated lyrics. You write like a seasoned human songwriter who focuses on subtext, friction, and conversational truth.

STRICT WRITING RULES:
1. THE LAW OF SUBTEXT: Never state an emotion directly. Do not use words like: love, pain, heart, soul, fire, dream, tears, grief, sad, happy, lonely. Instead, show emotion through physical friction, micro-actions, sensory details, and things left unsaid. (e.g., instead of "I was heartbroken and lonely," write "Left two mugs on the counter, but only boiled water for one").
2. BAN COSMIC CLICHES: Under no circumstances use these overused AI words: neon, shadows, whispers, echoes, sparks, cage, gravity, dance, storm, wings, chains. Any line containing these will be rejected.
3. HUMAN PARADOX & WEAKNESS: Write about self-sabotaging, hypocritical, messy human tensions. Never write preachy, neat, moral, or uplifting ending summaries. Keep the ending stark, unresolved, or a quiet question.
4. CONVERSATIONAL CADENCE: Use natural spoken rhythms. Use irregular line lengths and realistic pauses. Avoid predictable perfect rhymes (AABB/ABAB) unless explicitly locked. Favor slant rhymes, near-rhymes, and internal word matches that happen organically.
5. KEYWORD HIGHLIGHTING: If keyword seeds are specified, try to embed them naturally. Do not force them.
`;

// Single-stage songwriting engine (supports Multi-Model Fusion when enabled)
export async function generateFullSong(store) {
  // Guard BEFORE the fusion branch. The fusion drafts call singleCall directly
  // and the synthesiser calls guardedCall directly, so neither ever reached
  // callAI's check — with fusion on, a bad key skipped every guard in the file.
  assertApiKey(store.config);
  const context = buildPromptContext(store);
  const structureSequence = store.customStructure.map(s => s.toUpperCase()).join(" -> ");

  const systemPrompt = `You are an elite, professional songwriter, music linguist, and multi-platinum lyricist.
Your goal is to write a highly authentic, performable, and emotionally resonant song.

STRICT WRITING LAWS (Enforce these to write like an elite human writer):
1. RHYTHMIC CADENCE: Write lines that have a natural, performable vocal groove. Use consistent metric structures (syllables/beats) per line so it can be sung or rapped.
2. ORGANIC RHYMES: Banish predictable, infantile perfect rhymes (e.g. cat/hat, day/play, night/light, heart/part). Favor slant rhymes, near-rhymes, internal rhyme schemes, and multi-syllabic rhymes that feel natural and sophisticated.
3. THE LAW OF SUBTEXT: Never state an emotion directly (e.g. do not say 'I am sad', 'I feel pain', 'my broken heart', 'she left me'). Show the emotion through physical friction, micro-actions, sensory details, and things left unsaid. (e.g., instead of "I was lonely in the kitchen," write "Boiled water for one, but left two mugs on the counter").
4. ZERO COSMIC CLICHES: Never use cheap AI-generated words: neon, shadows, whispers, echoes, sparks, cage, gravity, chains, storm.
5. HUMAN PARADOX & DEPTH: Focus on raw human conflict, stakes, and contradictions. Avoid clean, preachy endings. Leave things unresolved or ending with a quiet, lingering visual image.
6. RHYME SCHEME & FLOW: Strictly follow the requested Rhyme Scheme, Rhyme Density, and Flow Pattern.
7. SECTION COMPOSITION: Label each section clearly (e.g., [Intro], [Verse 1], [Chorus], [Bridge], [Outro]). Do not write introduction commentary or explanations. Just output the raw lyrics.`;

  const userPrompt = `Write the complete song lyrics based on this context:
${context}

STRUCTURE:
${structureSequence}

Ensure every section is clearly labeled, and that the lyrics are highly authentic, performable, and deeply human.`;

  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ];

  let resultText;

  const { fusionEnabled, fusionModels, openRouterApiKey } = store.config;
  const activeFusionModels = (fusionModels || []).filter(Boolean);

  if (fusionEnabled && activeFusionModels.length > 0) {
    // Multi-Model Fusion: call all selected models in parallel, then synthesize
    const allModels = [store.config.model, ...activeFusionModels].filter(Boolean);
    // Each draft is checked on its own. Feeding a collapsed draft into the
    // synthesiser poisons the final song with the same rubble — the editor
    // prompt has no way to know that "closedRock noneMD youth aggregate" was
    // never a lyric. A model that returns garbage is dropped from the panel.
    const drafts = (await Promise.all(
      allModels.map(modelId =>
        singleCall(messages, store.config, modelId, store.config.temperature, store.config.maxTokens)
          .then(({ text }) => {
            if (inspectGenerated(text).ok) return text;
            const cut = truncateAtCollapse(text);
            return cut.text.split('\n').filter((l) => l.trim()).length >= 6 ? cut.text : null;
          })
          .catch(() => null)
      )
    )).filter(Boolean);

    if (!drafts.length) {
      throw new Error('Every model in the fusion set returned unusable text. Check which models are selected in Settings.');
    }

    if (drafts.length === 1) {
      resultText = drafts[0];
    } else {
      // Synthesize: pick the best lines from each draft
      const synthSystemPrompt = `You are an expert music editor. You have received ${drafts.length} different AI-written drafts of the same song. Your job is to synthesize them into ONE superior version.

Rules:
- Keep the same section structure as the drafts (same labels like [Verse 1], [Chorus], etc.)
- For each section, pick the strongest, most vivid lines from ANY draft — don't just copy one draft wholesale
- Where one draft has a stronger hook and another has better verses, combine the best of each
- The result must feel like ONE cohesive song, not a patchwork
- Apply all the original writing laws: no clichés, subtext over statement, slant rhymes
- Output only the final lyrics. No commentary, no explanations.`;

      const synthUserPrompt = `Original context:
${context}

Structure: ${structureSequence}

${drafts.map((d, i) => `=== DRAFT ${i + 1} (${allModels[i]}) ===\n${d}`).join('\n\n')}

Synthesize these into the single best version of this song:`;

      resultText = await guardedCall(
        [{ role: "system", content: synthSystemPrompt }, { role: "user", content: synthUserPrompt }],
        store.config,
        store.config.model,
        store.config.temperature,
        store.config.maxTokens
      );
    }
  } else {
    resultText = await callAI(messages, store.config, store.config.temperature, store.config.maxTokens);
  }

  return parseSectionsFromText(resultText, store);
}

// Generates a single section carrying forward prior sections as context
export async function generateSection(sectionType, store, priorSections = []) {
  const context = buildPromptContext(store);
  const contextHistoryText = priorSections.map(s => `[${s.name}]\n${s.lines.map(l => l.text).join("\n")}`).join("\n\n");

  const systemPrompt = `${HUMAN_LYRICIST_RULES}
Write exactly one section of type: [${sectionType.toUpperCase()}].
Enforce the bar/line count: write exactly ${store.sectionLineCounts[sectionType] || 8} lines.
If prior lyrics are provided, carry forward their narrative, characters, and stylistic elements. Do not repeat lines from prior sections. Keep the flow consistent.

Return ONLY the lyrics for this section. Do not output the section label [${sectionType.toUpperCase()}] in your response, just the raw lines.`;

  const userPrompt = `CONTEXT:
${context}

PRIOR LYRICS CONTEXT:
${contextHistoryText || "None - this is the first section."}

Generate the ${sectionType} section:`;

  const sectionText = await callAI([
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ], store.config, store.config.temperature, 500);

  return sectionText.trim();
}

// Generates a variation (A/B/C) of a single line
export async function generateLineVariation(lineText, sectionContext, store) {
  const systemPrompt = `${HUMAN_LYRICIST_RULES}
Provide a single line variation that could replace this line: "${lineText}".
The replacement must fit the rhythm and vibe of the surrounding section.
Return ONLY the replacement line. Do not wrap it in quotes. No commentary.`;

  const userPrompt = `Section Context:
${sectionContext}

Line to vary:
"${lineText}"

Alternative line:`;

  const raw = (await callAI([
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ], store.config, 0.9, 100)).trim().replace(/^"|"$/g, "");
  return cleanRefineOutput(raw, lineText);
}

// Fills in "[blank]" tokens in lyrics
export async function fillBlank(fullLyrics, store) {
  const systemPrompt = `${HUMAN_LYRICIST_RULES}
You will be given song lyrics that contain one or more "[blank]" tokens.
Find each "[blank]" token and generate a fitting lyric phrase or line that plugs the gap, matching the surrounding rhythm, vocabulary, and subtext.
Return the complete song lyrics with the blanks filled in. Keep everything else identical. No commentary.`;

  return (await callAI([
    { role: "system", content: systemPrompt },
    { role: "user", content: `Fill the [blank] tokens in this song:\n\n${fullLyrics}` }
  ], store.config, 0.75, store.config.maxTokens)).trim();
}

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

// Parses raw lyric text into structured section blocks
export function parseSectionsFromText(text, store) {
  const lines = text.split("\n");
  const parsed = [];
  let currentSection = null;
  let sectionIndex = 1;

  for (let line of lines) {
    line = line.trim();
    if (!line) continue;

    // Check if section marker like [Verse 1] or [Chorus]
    const match = line.match(/^\[(.*?)\]$/);
    if (match) {
      if (currentSection) {
        parsed.push(currentSection);
      }
      const name = match[1];
      let type = "verse";
      const nameLower = name.toLowerCase();
      if (nameLower.includes("intro")) type = "intro";
      else if (nameLower.includes("chorus") || nameLower.includes("hook")) type = "chorus";
      else if (nameLower.includes("pre")) type = "pre-chorus";
      else if (nameLower.includes("bridge")) type = "bridge";
      else if (nameLower.includes("outro")) type = "outro";
      else if (nameLower.includes("freestyle")) type = "freestyle";

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
        // Create an implicit verse if text appears before any section label
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

  if (currentSection) {
    parsed.push(currentSection);
  }

  return parsed;
}
