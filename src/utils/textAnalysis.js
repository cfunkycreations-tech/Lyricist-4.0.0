// Text analysis helpers for Lyricist 3.1.1

// Rule-based syllable counter
export function countSyllables(word) {
  if (!word) return 0;
  word = word.toLowerCase().trim().replace(/[^a-z]/g, "");
  if (word.length <= 3) return 1;
  
  // Basic syllable counting heuristics for English
  word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "");
  word = word.replace(/^y/, "");
  const syllables = word.match(/[aeiouy]{1,2}/g);
  return syllables ? syllables.length : 1;
}

export function countLineSyllables(lineText) {
  if (!lineText) return 0;
  const words = lineText.split(/\s+/).filter(Boolean);
  return words.reduce((acc, word) => acc + countSyllables(word), 0);
}

// Flesch-Kincaid Grade Level calculation
export function calculateReadability(text) {
  if (!text) return "N/A";
  const sentences = text.split(/[.!?\n]+/).filter(Boolean).length || 1;
  const words = text.split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  if (wordCount === 0) return "N/A";
  
  let syllableCount = 0;
  words.forEach(w => {
    syllableCount += countSyllables(w);
  });

  // Flesch-Kincaid formula
  const score = 0.39 * (wordCount / sentences) + 11.8 * (syllableCount / wordCount) - 15.59;
  
  if (score <= 4) return "Easy (4th Grade)";
  if (score <= 8) return "Conversational (8th Grade)";
  if (score <= 12) return "Lyrical (High School)";
  return "Complex (College)";
}

// Type-Token Ratio (TTR) for vocabulary richness
export function calculateVocabRichness(text) {
  if (!text) return 0;
  const words = text.toLowerCase().match(/\b[a-z']+\b/g);
  if (!words || words.length === 0) return 0;
  
  const uniqueWords = new Set(words);
  return Math.round((uniqueWords.size / words.length) * 100);
}

// Extracts the last word of a line (for rhyme lock)
export function getLastWord(lineText) {
  if (!lineText) return "";
  const clean = lineText.trim().replace(/[^a-zA-Z\s']/g, "");
  const words = clean.split(/\s+/).filter(Boolean);
  return words.length > 0 ? words[words.length - 1] : "";
}

// Simple rhyme detection between two words (checks if ending phonetics match)
export function isNearRhyme(word1, word2) {
  if (!word1 || !word2) return false;
  w1 = word1.toLowerCase().trim();
  w2 = word2.toLowerCase().trim();
  if (w1 === w2) return false;
  
  const endings = ["ing", "ed", "er", "y", "le", "tion", "ent", "ant", "al", "ic"];
  for (const end of endings) {
    if (w1.endsWith(end) && w2.endsWith(end)) return true;
  }
  
  // Assure vowel matching at the end
  const getVowels = w => w.replace(/[^aeiouy]/g, "");
  const v1 = getVowels(w1);
  const v2 = getVowels(w2);
  if (v1 && v2 && v1.slice(-1) === v2.slice(-1)) return true;
  
  return false;
}
