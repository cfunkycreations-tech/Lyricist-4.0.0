class VocalAlignEngine {
  /**
   * Generates a timeline marker list for all words and line transitions.
   * @param {Array} lyrics - Array of lyric sections.
   * @param {number} totalBars - Total bars to spread across if needed.
   * @returns {Array} List of line objects with timing info.
   */
  calculateAlignmentGrid(lyrics, totalBars = 100) {
    const grid = [];
    let currentBar = 0;

    if (!lyrics || !Array.isArray(lyrics) || lyrics.length === 0) {
      return grid;
    }

    lyrics.forEach(section => {
      if (!section.lines) return;
      section.lines.forEach(line => {
        if (!line.text) return;
        const words = line.text.split(' ').filter(w => w.trim().length > 0);
        if (words.length === 0) return;
        
        const durationPerWord = 0.5; // Approximation for demo sync
        const wordObjs = words.map(w => {
          const startBar = currentBar;
          const endBar = currentBar + durationPerWord;
          currentBar += durationPerWord;
          return { word: w, startBar, endBar };
        });

        // Add a small gap between lines
        currentBar += 0.25;

        grid.push({
          sectionName: section.title || 'SECTION',
          lineText: line.text,
          words: wordObjs,
          startBar: wordObjs[0].startBar,
          endBar: wordObjs[wordObjs.length - 1].endBar
        });
      });
    });

    return grid;
  }

  /**
   * Gets the active lyric line and word at the current playhead position.
   * @param {Array} lyrics - Array of lyric sections.
   * @param {number} playheadBar - Current playhead position in bars.
   * @returns {Object} Active lyric data including section, line, words, and active word index.
   */
  getCurrentLyricAtBar(lyrics, playheadBar) {
    const defaultRes = { sectionName: '', lineText: '', words: [], activeWordIndex: -1 };
    if (!lyrics || !Array.isArray(lyrics) || lyrics.length === 0) return defaultRes;

    const grid = this.calculateAlignmentGrid(lyrics);

    for (const line of grid) {
      // Check if playhead is within this line's duration or slightly before it for a lead-in
      if (playheadBar >= line.startBar - 0.5 && playheadBar <= line.endBar + 0.5) {
        let activeWordIndex = line.words.findIndex(w => playheadBar >= w.startBar && playheadBar <= w.endBar);
        // If between words or before first word, we might want to still show the line
        if (activeWordIndex === -1 && playheadBar > line.words[line.words.length - 1].endBar) {
          activeWordIndex = line.words.length; // all passed
        }

        return {
          sectionName: line.sectionName,
          lineText: line.lineText,
          words: line.words,
          activeWordIndex
        };
      }
    }

    return defaultRes;
  }
}

export const vocalAlignEngine = new VocalAlignEngine();
export default vocalAlignEngine;
