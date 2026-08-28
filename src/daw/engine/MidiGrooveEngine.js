/**
 * MidiGrooveEngine
 * Advanced MIDI transformation algorithms.
 */
class MidiGrooveEngine {
  /**
   * Applies swing to notes by delaying off-beat notes.
   * @param {Array} notes - Array of note objects { time, note, velocity, duration }
   * @param {number} swingPercent - Swing percentage (50-75)
   * @returns {Array} Array of notes with applied swing
   */
  applySwing(notes, swingPercent = 60) {
    const swingFactor = (swingPercent - 50) / 25; // 0 to 1
    const gridStep = 0.25; // 1/16 note in beats (assuming 4/4)

    return notes.map(noteObj => {
      const time = noteObj.time;
      const isOffBeat = (Math.round(time / gridStep) % 2) !== 0;
      
      if (isOffBeat) {
        // Delay off-beat notes by up to 50% of a grid step
        const delay = gridStep * 0.5 * swingFactor;
        return { ...noteObj, time: time + delay };
      }
      return { ...noteObj };
    });
  }

  /**
   * Adds humanization (timing and velocity jitter) to quantized notes.
   * @param {Array} notes - Array of note objects
   * @param {number} timingJitterMs - Maximum timing jitter in milliseconds
   * @param {number} velocityJitter - Maximum velocity jitter
   * @returns {Array} Array of humanized notes
   */
  humanize(notes, timingJitterMs = 5, velocityJitter = 10) {
    // Note: Assuming `time` here is in milliseconds or we add timingJitterMs to it directly
    // If `time` is in beats, we'd need BPM to calculate MS. Assuming MS for now.
    return notes.map(noteObj => {
      const timeOffset = (Math.random() * 2 - 1) * timingJitterMs;
      const velOffset = (Math.random() * 2 - 1) * velocityJitter;
      
      return {
        ...noteObj,
        time: Math.max(0, noteObj.time + timeOffset),
        velocity: Math.max(1, Math.min(127, (noteObj.velocity || 100) + velOffset))
      };
    });
  }

  /**
   * Transforms a chord into a melodic arpeggio sequence.
   * @param {Array} chordNotes - Array of note numbers [60, 64, 67]
   * @param {string} pattern - 'up', 'down', 'up/down', 'random'
   * @param {string} rate - e.g., '1/16'
   * @param {number} bpm - Tempo in BPM
   * @returns {Array} Sequence of arpeggiated notes
   */
  arpeggiate(chordNotes, pattern = 'up', rate = '1/16', bpm = 120) {
    if (!chordNotes || chordNotes.length === 0) return [];
    
    // Sort notes for consistent up/down behavior
    const sorted = [...chordNotes].sort((a, b) => a - b);
    
    let sequence = [];
    if (pattern.toLowerCase() === 'up') {
      sequence = [...sorted];
    } else if (pattern.toLowerCase() === 'down') {
      sequence = [...sorted].reverse();
    } else if (pattern.toLowerCase() === 'up/down') {
      sequence = [...sorted, ...[...sorted].reverse().slice(1, -1)];
    } else if (pattern.toLowerCase() === 'random') {
      sequence = [...sorted].sort(() => Math.random() - 0.5);
    } else {
      sequence = [...sorted];
    }
    
    // Map sequence to time/duration
    // Parse rate (e.g., '1/16' -> 0.25 beats)
    const [num, den] = rate.split('/');
    const beatsPerStep = (Number(num) / Number(den)) * 4; 
    const msPerBeat = 60000 / bpm;
    const msPerStep = beatsPerStep * msPerBeat;

    return sequence.map((noteNum, index) => ({
      note: noteNum,
      time: index * msPerStep,
      duration: msPerStep * 0.9, // 90% gate length
      velocity: 100
    }));
  }
}

const midiGrooveEngine = new MidiGrooveEngine();
export default midiGrooveEngine;
