/**
 * ChordProgressionEngine - Diatonic music theory engine
 * 
 * Supports 12 Root Keys and 7 Musical Modes.
 * Generates diatonic chords and provides popular progression presets.
 */
class ChordProgressionEngine {
  constructor() {
    this.keys = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    this.modes = ['Major', 'Natural Minor', 'Dorian', 'Phrygian', 'Lydian', 'Mixolydian', 'Harmonic Minor'];
    
    this.intervals = {
      'Major': [0, 2, 4, 5, 7, 9, 11],
      'Natural Minor': [0, 2, 3, 5, 7, 8, 10],
      'Dorian': [0, 2, 3, 5, 7, 9, 10],
      'Phrygian': [0, 1, 3, 5, 7, 8, 10],
      'Lydian': [0, 2, 4, 6, 7, 9, 11],
      'Mixolydian': [0, 2, 4, 5, 7, 9, 10],
      'Harmonic Minor': [0, 2, 3, 5, 7, 8, 11]
    };

    this.presets = {
      'Pop': [1, 5, 6, 4],
      'R&B': [2, 5, 1, 6],
      'Neo-Soul': [1, 7, 6, 5],
      'Dark Trap': [1, 6, 4, 5]
    };

    this.romanNumeralsMajor = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'];
    this.romanNumeralsMinor = ['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII'];
  }

  /**
   * Retrieves the 7 diatonic chords for a given root and mode.
   * @param {string} rootKey - e.g., 'C'
   * @param {string} mode - e.g., 'Major'
   * @param {number} octave - The base octave for MIDI notes (default 4 = middle C = 60)
   * @returns {Array} Array of chord objects with { degree, numeral, name, notes }
   */
  getDiatonicChords(rootKey, mode, octave = 4) {
    const rootIndex = this.keys.indexOf(rootKey);
    if (rootIndex === -1) throw new Error("Invalid Root Key");
    
    const modeIntervals = this.intervals[mode];
    if (!modeIntervals) throw new Error("Invalid Mode");

    const scaleNotes = modeIntervals.map(interval => (rootIndex + interval) % 12);
    const baseMidi = (octave + 1) * 12 + rootIndex; // C4 = 60

    const chords = [];
    for (let i = 0; i < 7; i++) {
      // Triad: root, 3rd, 5th (diatonically)
      const rootScaleIndex = i;
      const thirdScaleIndex = (i + 2) % 7;
      const fifthScaleIndex = (i + 4) % 7;

      const rootNote = scaleNotes[rootScaleIndex];
      const thirdNote = scaleNotes[thirdScaleIndex];
      const fifthNote = scaleNotes[fifthScaleIndex];

      // Calculate exact MIDI note numbers, compensating for octave wrap
      let rMidi = baseMidi + modeIntervals[rootScaleIndex];
      let tMidi = baseMidi + modeIntervals[thirdScaleIndex] + (thirdScaleIndex < rootScaleIndex ? 12 : 0);
      let fMidi = baseMidi + modeIntervals[fifthScaleIndex] + (fifthScaleIndex < rootScaleIndex ? 12 : 0);

      // Determine quality
      const thirdInterval = (tMidi - rMidi) % 12;
      const fifthInterval = (fMidi - rMidi) % 12;

      let quality = '';
      if (thirdInterval === 4 && fifthInterval === 7) quality = 'M';
      else if (thirdInterval === 3 && fifthInterval === 7) quality = 'm';
      else if (thirdInterval === 3 && fifthInterval === 6) quality = 'dim';
      else if (thirdInterval === 4 && fifthInterval === 8) quality = 'aug';

      const chordName = this.keys[rootNote] + (quality === 'm' ? 'm' : quality === 'dim' ? 'dim' : quality === 'aug' ? 'aug' : '');
      const romanList = mode.includes('Minor') ? this.romanNumeralsMinor : this.romanNumeralsMajor;
      
      // Basic assignment of roman numerals, this could be more sophisticated per mode
      let numeral = romanList[i];
      if (mode !== 'Major' && mode !== 'Natural Minor') {
         numeral = quality === 'm' ? romanList[i].toLowerCase() : romanList[i].toUpperCase();
         if (quality === 'dim') numeral = numeral.toLowerCase() + '°';
      }

      chords.push({
        degree: i + 1,
        numeral,
        name: chordName,
        notes: [rMidi, tMidi, fMidi]
      });
    }

    return chords;
  }

  getProgression(presetName, rootKey, mode) {
    const chords = this.getDiatonicChords(rootKey, mode);
    const degrees = this.presets[presetName];
    if (!degrees) return [];
    return degrees.map(deg => chords[deg - 1]);
  }
}

const chordProgressionEngine = new ChordProgressionEngine();
export default chordProgressionEngine;
