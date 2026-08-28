/**
 * AutoTuneEngine
 * Real-time vocal pitch detection & correction engine for Lyricist 4.2.0 Pro.
 */

class AutoTuneEngine {
  constructor() {
    this.settings = {
      retuneSpeed: 20, // 0 to 100 ms
      formantShift: 0, // -12 to +12 st
      humanize: 0, // 0 to 100 %
      detune: 0, // -50 to +50 cents
      scale: 'Chromatic', // 'Project Key', 'Chromatic', 'Major', 'Minor', 'Pentatonic'
      key: 'C',
      bypass: false
    };

    this.sampleRate = 44100;
    this.noteFrequencies = this.generateNoteFrequencies();
    
    // For smoothing
    this.lastCorrectedFreq = null;
  }

  /**
   * Update the auto-tune engine settings
   * @param {Object} newSettings 
   */
  updateSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
  }

  /**
   * Generate standard MIDI note frequencies
   */
  generateNoteFrequencies() {
    const A4 = 440;
    const notes = [];
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    
    for (let i = 0; i < 128; i++) {
      const freq = A4 * Math.pow(2, (i - 69) / 12);
      notes.push({
        midi: i,
        name: noteNames[i % 12] + Math.floor(i / 12 - 1),
        pitchClass: noteNames[i % 12],
        freq
      });
    }
    return notes;
  }

  /**
   * Stub for YIN pitch detection.
   * @param {Float32Array} audioBuffer 
   * @returns {number} detected fundamental frequency (F0)
   */
  detectPitchYin(audioBuffer) {
    if (!audioBuffer || audioBuffer.length === 0) return 0;
    // In a full WebAudio AudioWorklet implementation, this would perform
    // difference function, cumulative mean normalized difference, and parabolic interpolation.
    return 440.0; 
  }

  /**
   * Filter available notes based on Key and Scale selection
   */
  getScaleNotes(key, scale) {
    const allPitchClasses = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const keyIndex = allPitchClasses.indexOf(key);
    
    let intervals;
    switch (scale) {
      case 'Major':
        intervals = [0, 2, 4, 5, 7, 9, 11];
        break;
      case 'Minor':
        intervals = [0, 2, 3, 5, 7, 8, 10];
        break;
      case 'Pentatonic':
        intervals = [0, 2, 4, 7, 9];
        break;
      case 'Project Key':
      case 'Chromatic':
      default:
        intervals = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
        break;
    }

    const scalePitchClasses = intervals.map(interval => allPitchClasses[(keyIndex + interval) % 12]);
    return this.noteFrequencies.filter(note => scalePitchClasses.includes(note.pitchClass));
  }

  /**
   * Maps a detected frequency to the nearest scale frequency (Scale Frequency Quantizer)
   */
  quantizePitch(freq) {
    if (freq <= 0) return null;
    
    const scaleNotes = this.getScaleNotes(this.settings.key, this.settings.scale);
    let closestNote = scaleNotes[0];
    let minDiff = Math.abs(freq - closestNote.freq);

    for (let i = 1; i < scaleNotes.length; i++) {
      const diff = Math.abs(freq - scaleNotes[i].freq);
      if (diff < minDiff) {
        minDiff = diff;
        closestNote = scaleNotes[i];
      }
    }

    // Apply global detune (cents deviation mapping)
    const detuneMultiplier = Math.pow(2, this.settings.detune / 1200);
    const targetFreq = closestNote.freq * detuneMultiplier;
    
    // Calculate how many cents off the input is from the target
    const centsDeviation = 1200 * Math.log2(freq / targetFreq);

    return { targetFreq, noteName: closestNote.name, centsDeviation };
  }

  /**
   * Process a chunk of audio (if implemented as an AudioWorkletProcessor proxy)
   */
  process(audioBuffer) {
    if (this.settings.bypass) {
      return { detectedFreq: 0, targetFreq: 0, noteName: '-', centsDeviation: 0, retunedFreq: 0 };
    }

    const detectedFreq = this.detectPitchYin(audioBuffer);
    if (detectedFreq === 0) return null;

    const quantization = this.quantizePitch(detectedFreq);
    if (!quantization) return null;

    let { targetFreq, noteName, centsDeviation } = quantization;

    // Humanize: relax the correction curve if it's already close
    if (this.settings.humanize > 0) {
      const humanizeFactor = this.settings.humanize / 100;
      targetFreq = targetFreq + (detectedFreq - targetFreq) * humanizeFactor;
    }

    // Retune Speed Interpolation (0ms = hard snap, 100ms = slow smoothing)
    let retunedFreq = targetFreq;
    if (this.settings.retuneSpeed > 0 && this.lastCorrectedFreq !== null) {
      // Very basic lowpass simulating retune speed
      const alpha = Math.max(0.01, 1 - (this.settings.retuneSpeed / 100));
      retunedFreq = this.lastCorrectedFreq + alpha * (targetFreq - this.lastCorrectedFreq);
    }
    
    this.lastCorrectedFreq = retunedFreq;

    return {
      detectedFreq,
      targetFreq,
      noteName,
      centsDeviation,
      retunedFreq
    };
  }
  
  /**
   * Generates live telemetry to drive the Dock UI (Mock data if no audio buffer)
   */
  getLivePitchTelemetry() {
    const time = Date.now() / 1000;
    // Base frequency sweeping around A4 (440Hz) with some vibrato and noise
    const baseFreq = 440 + Math.sin(time * 2) * 20; 
    const mockDetected = baseFreq + (Math.random() - 0.5) * 5; 
    
    if (this.settings.bypass) {
      return { 
        detectedFreq: mockDetected, 
        targetFreq: mockDetected, 
        noteName: 'Bypassed', 
        centsDeviation: 0, 
        retunedFreq: mockDetected 
      };
    }

    const quantization = this.quantizePitch(mockDetected);
    let targetFreq = quantization.targetFreq;
    
    if (this.settings.humanize > 0) {
      targetFreq = targetFreq + (mockDetected - targetFreq) * (this.settings.humanize / 100);
    }
    
    let retunedFreq = targetFreq;
    if (this.settings.retuneSpeed > 0 && this.lastCorrectedFreq !== null) {
      const alpha = Math.max(0.01, 1 - (this.settings.retuneSpeed / 100));
      retunedFreq = this.lastCorrectedFreq + alpha * (targetFreq - this.lastCorrectedFreq);
    } else {
      retunedFreq = targetFreq;
    }
    this.lastCorrectedFreq = retunedFreq;

    return {
      detectedFreq: mockDetected,
      targetFreq: quantization.targetFreq,
      noteName: quantization.noteName,
      centsDeviation: quantization.centsDeviation,
      retunedFreq
    };
  }
}

const autoTuneEngine = new AutoTuneEngine();
export default autoTuneEngine;
