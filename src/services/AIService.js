// AI integration service for Lyricist 4.0.7
// Enforces: Law of Subtext, Law of Human Paradox, Conversational Cadence

async function singleCall(messages, config, modelId, customTemp, customMax) {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${config.openRouterApiKey}`,
      "HTTP-Referer": "https://lyricist.app",
      "X-Title": "Lyricist 4.0.7"
    },
    body: JSON.stringify({
      model: modelId,
      temperature: customTemp !== null ? customTemp : config.temperature,
      max_tokens: customMax !== null ? customMax : config.maxTokens,
      messages
    })
  });
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData?.error?.message || `API Error (${modelId}): status ${response.status}`);
  }
  const result = await response.json();
  return result.choices?.[0]?.message?.content || "";
}

export async function callAI(messages, config, customTemp = null, customMax = null) {
  if (!config.openRouterApiKey) {
    throw new Error("No API key configured. Go to the Settings tab to add your OpenRouter key.");
  }
  return singleCall(messages, config, config.model || "google/gemini-2.5-flash", customTemp, customMax);
}

// Builds the global context block describing all active songwriting parameters
function buildPromptContext(store) {
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
    const drafts = (await Promise.all(
      allModels.map(modelId =>
        singleCall(messages, store.config, modelId, store.config.temperature, store.config.maxTokens)
          .catch(() => null)
      )
    )).filter(Boolean);

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

      resultText = await singleCall(
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

  return (await callAI([
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ], store.config, 0.9, 100)).trim().replace(/^"|"$/g, "");
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

  const systemPrompt = `${HUMAN_LYRICIST_RULES}
You are refining this specific text.
INSTRUCTION: ${instructions}
Return ONLY the refined text. No commentary.`;

  return (await callAI([
    { role: "system", content: systemPrompt },
    { role: "user", content: `Text to refine:\n${targetText}` }
  ], store.config, 0.8, 500)).trim();
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
function parseSectionsFromText(text, store) {
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
