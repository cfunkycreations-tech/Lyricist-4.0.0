/**
 * RhymeAnalyzer
 * Real-time phonetic rhyming & cadence analyzer.
 */

class RhymeAnalyzer {
  constructor() {
    this.colors = {
      'A': '#4CC9F0',
      'B': '#F72585',
      'C': '#7209B7',
      'D': '#4ADE80',
      'E': '#FF9900'
    };
  }

  // Simple heuristic for counting syllables
  countSyllables(word) {
    if (!word) return 0;
    word = word.toLowerCase();
    if(word.length <= 3) { return 1; }
    word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
    word = word.replace(/^y/, '');
    let matches = word.match(/[aeiouy]{1,2}/g);
    return matches ? matches.length : 1;
  }

  // Generate a dummy cadence string like da-DUM-da
  generateCadence(syllableCount) {
    let cadence = [];
    for (let i = 0; i < syllableCount; i++) {
      cadence.push(i % 2 === 1 ? 'DUM' : 'da');
    }
    return cadence.join('-');
  }

  // Very basic phonetic ending extraction (heuristic)
  getPhoneticEnding(word) {
    if (!word) return '';
    const vowels = 'aeiouy';
    word = word.toLowerCase().trim();
    // Remove punctuation
    word = word.replace(/[^a-z]/g, '');
    if (!word) return '';
    
    // Find last vowel sound
    let lastVowelIdx = -1;
    for (let i = word.length - 1; i >= 0; i--) {
      if (vowels.includes(word[i])) {
        lastVowelIdx = i;
        break;
      }
    }
    if (lastVowelIdx === -1) return word;
    return word.slice(lastVowelIdx);
  }

  analyzeLines(lines) {
    const families = ['A', 'B', 'C', 'D', 'E'];
    let currentFamilyIdx = 0;
    const endingMap = {}; // mapping phonetic ending to family token

    let totalLines = 0;

    const analyzed = lines.map((lineObj) => {
      const text = lineObj.text ? lineObj.text.trim() : '';
      if (!text) {
        return { ...lineObj, syllables: 0, rhymeTag: '', rhymeColor: 'transparent', cadence: '', ending: '' };
      }

      totalLines++;
      const words = text.split(/\s+/).filter(Boolean);
      const lastWord = words[words.length - 1];
      
      let syllables = 0;
      words.forEach(w => syllables += this.countSyllables(w));

      const ending = this.getPhoneticEnding(lastWord);
      
      let rhymeTag = '';
      if (ending) {
        if (endingMap[ending]) {
          rhymeTag = endingMap[ending];
        } else {
          rhymeTag = families[currentFamilyIdx % families.length];
          endingMap[ending] = rhymeTag;
          currentFamilyIdx++;
        }
      }

      return {
        ...lineObj,
        syllables,
        cadence: this.generateCadence(syllables),
        rhymeTag,
        rhymeColor: rhymeTag ? (this.colors[rhymeTag] || '#ffffff') : 'transparent',
        ending
      };
    });

    const endingCounts = {};
    analyzed.forEach(a => {
      if (a.ending) {
        endingCounts[a.ending] = (endingCounts[a.ending] || 0) + 1;
      }
    });

    let linesInRhymeScheme = 0;
    analyzed.forEach(a => {
      if (a.ending && endingCounts[a.ending] > 1) {
        linesInRhymeScheme++;
      }
    });

    const flowConsistency = totalLines > 0 ? Math.round((linesInRhymeScheme / totalLines) * 100) : 0;

    return {
      lines: analyzed,
      flowConsistency
    };
  }
}

const rhymeAnalyzer = new RhymeAnalyzer();
export default rhymeAnalyzer;
