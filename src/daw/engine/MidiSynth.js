/**
 * Polyphonic Web Audio Synthesizer for Lyricist 4.2.0 Pro.
 * Provides a 16-voice dynamic allocator with ADSR envelopes and filtering.
 */
export class MidiSynth {
  constructor() {
    this.audioContext = null;
    this.masterGain = null;
    this.voices = new Map(); // midiNote -> { oscillator, gain, filter, startTime }
    this.maxVoices = 16;
    
    this.params = {
      waveform: 'sawtooth', // 'sawtooth' | 'square' | 'triangle' | 'sine'
      cutoff: 2500, // 20 to 20000 Hz
      resonance: 3.0, // 0 to 20
      attack: 0.02, // 0.005 to 2.0 s
      decay: 0.3, // 0.01 to 3.0 s
      sustain: 0.6, // 0.0 to 1.0
      release: 0.4 // 0.01 to 5.0 s
    };
  }

  /**
   * Initializes the synthesizer and its Web Audio Context.
   */
  init() {
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    this.masterGain = this.audioContext.createGain();
    this.masterGain.gain.value = 0.5;
    this.masterGain.connect(this.audioContext.destination);
  }

  /**
   * Updates a synthesizer parameter.
   * @param {string} param - Parameter name.
   * @param {number|string} value - Parameter value.
   */
  setParam(param, value) {
    if (this.params.hasOwnProperty(param)) {
      this.params[param] = value;
    }
  }

  /**
   * Converts a MIDI note number to frequency in Hz.
   * @param {number} midiNote - MIDI note (21-108).
   * @returns {number} Frequency in Hz.
   */
  midiToFreq(midiNote) {
    return 440 * Math.pow(2, (midiNote - 69) / 12);
  }

  /**
   * Triggers a note on.
   * @param {number} midiNote - MIDI note number.
   * @param {number} [velocity=100] - MIDI velocity (0-127).
   */
  noteOn(midiNote, velocity = 100) {
    if (!this.audioContext) return;
    
    // Voice stealing if at max capacity
    if (this.voices.size >= this.maxVoices) {
      let oldestNote = null;
      let oldestTime = Infinity;
      for (const [note, voice] of this.voices.entries()) {
        if (voice.startTime < oldestTime) {
          oldestTime = voice.startTime;
          oldestNote = note;
        }
      }
      if (oldestNote !== null) {
        this.noteOff(oldestNote);
      }
    }

    if (this.voices.has(midiNote)) {
      this.noteOff(midiNote); // re-trigger
    }

    const t = this.audioContext.currentTime;
    
    const osc = this.audioContext.createOscillator();
    osc.type = this.params.waveform;
    osc.frequency.setValueAtTime(this.midiToFreq(midiNote), t);

    const filter = this.audioContext.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(this.params.cutoff, t);
    filter.Q.setValueAtTime(this.params.resonance, t);

    const gain = this.audioContext.createGain();
    gain.gain.setValueAtTime(0, t);
    
    // ADSR Attack
    gain.gain.linearRampToValueAtTime((velocity / 127), t + this.params.attack);
    // ADSR Decay to Sustain
    gain.gain.linearRampToValueAtTime((velocity / 127) * this.params.sustain, t + this.params.attack + this.params.decay);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start(t);

    this.voices.set(midiNote, { oscillator: osc, gain: gain, filter: filter, startTime: t });
  }

  /**
   * Triggers a note off.
   * @param {number} midiNote - MIDI note number.
   */
  noteOff(midiNote) {
    if (!this.audioContext) return;
    const voice = this.voices.get(midiNote);
    if (!voice) return;

    const t = this.audioContext.currentTime;
    
    // Cancel scheduled values and set current value to start release phase
    voice.gain.gain.cancelScheduledValues(t);
    voice.gain.gain.setValueAtTime(voice.gain.gain.value, t);
    // ADSR Release
    voice.gain.gain.linearRampToValueAtTime(0, t + this.params.release);

    voice.oscillator.stop(t + this.params.release);
    
    // Cleanup after release
    setTimeout(() => {
      try {
        voice.oscillator.disconnect();
        voice.filter.disconnect();
        voice.gain.disconnect();
      } catch (e) {
        // Ignore if already disconnected
      }
    }, this.params.release * 1000 + 100);

    this.voices.delete(midiNote);
  }

  /**
   * Immediately silences all active voices.
   */
  panic() {
    if (!this.audioContext) return;
    const t = this.audioContext.currentTime;
    for (const [note, voice] of this.voices.entries()) {
      voice.gain.gain.cancelScheduledValues(t);
      voice.gain.gain.setValueAtTime(0, t);
      voice.oscillator.stop(t);
      try {
        voice.oscillator.disconnect();
        voice.filter.disconnect();
        voice.gain.disconnect();
      } catch (e) {
        // Ignore errors if already disconnected
      }
    }
    this.voices.clear();
  }
}

const midiSynth = new MidiSynth();
export default midiSynth;

