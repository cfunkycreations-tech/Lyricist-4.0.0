import truePeakLimiter from './TruePeakLimiter';
import { getAudioContext, getMasterInput, attachMasterChain, resumeAudio } from './AudioContextProvider';

/**
 * @file AudioGraph.js
 * @description Real-time Web Audio API execution graph for Lyricist 4.2.0 Pro.
 * Manages the main AudioContext, master bus, track mixer, and provides metering capabilities.
 */

class AudioGraph {
  constructor() {
    /** @type {AudioContext | null} */
    this.context = null;
    
    /** @type {GainNode | null} */
    this.masterGain = null;
    
    /** @type {DynamicsCompressorNode | null} */
    this.masterLimiter = null;
    
    /** @type {AnalyserNode | null} */
    this.masterAnalyserLeft = null;
    
    /** @type {AnalyserNode | null} */
    this.masterAnalyserRight = null;
    
    /** @type {ChannelSplitterNode | null} */
    this.masterSplitter = null;

    /** 
     * Map of trackId -> { gainNode, panNode, analyserNode, sourceNodes: Set }
     * @type {Map<string, Object>} 
     */
    this.tracks = new Map();
  }

  /**
   * Initializes the AudioContext and the master bus.
   * Must be called on user gesture to resume the AudioContext.
   * @returns {Promise<void>}
   */
  async init() {
    // One shared context for the whole DAW — see AudioContextProvider.
    this.context = getAudioContext();
    await resumeAudio();

    if (!this.masterGain) {
      // Master Gain
      this.masterGain = this.context.createGain();
      
      // Master Limiter (Compressor) mapped to True Peak parameters
      this.masterLimiter = this.context.createDynamicsCompressor();
      this.masterLimiter.threshold.value = -0.1; // True Peak Ceiling default
      this.masterLimiter.knee.value = 5.0; // Soft knee
      this.masterLimiter.ratio.value = 20.0;
      this.masterLimiter.attack.value = 0.0015; // 1.5ms lookahead equivalent
      this.masterLimiter.release.value = 0.050; // 50ms release default

      // Master Analysers (L/R)
      this.masterSplitter = this.context.createChannelSplitter(2);
      this.masterAnalyserLeft = this.context.createAnalyser();
      this.masterAnalyserRight = this.context.createAnalyser();
      
      this.masterAnalyserLeft.fftSize = 2048;
      this.masterAnalyserRight.fftSize = 2048;

      // Routing
      this.masterGain.connect(this.masterLimiter);
      this.masterLimiter.connect(this.masterSplitter);
      this.masterSplitter.connect(this.masterAnalyserLeft, 0);
      this.masterSplitter.connect(this.masterAnalyserRight, 1);
      this.masterLimiter.connect(this.context.destination);

      // Every other engine feeds the shared master input. Routing it into the
      // master gain here is what puts the synth, sampler, looper and metronome
      // under the master fader, the meters and the export.
      attachMasterChain(this.masterGain);
    }
  }

  /**
   * Sets the master volume level.
   * @param {number} level - 0 to 10 scale (will be mapped to gain 0.0 to 1.0)
   */
  setMasterVolume(level) {
    if (this.masterGain) {
      const gain = Math.max(0, Math.min(10, level)) / 10;
      this.masterGain.gain.setTargetAtTime(gain, this.context.currentTime, 0.05);
    }
  }

  /**
   * Initializes a track if it doesn't exist.
   * @param {string} trackId 
   * @private
   */
  _initTrackIfNeeded(trackId) {
    if (!this.tracks.has(trackId) && this.context) {
      const gainNode = this.context.createGain();
      const panNode = this.context.createStereoPanner();
      const analyserNode = this.context.createAnalyser();
      analyserNode.fftSize = 2048;

      gainNode.connect(panNode);
      panNode.connect(analyserNode);
      analyserNode.connect(this.masterGain);

      this.tracks.set(trackId, {
        gainNode,
        panNode,
        analyserNode,
        sourceNodes: new Set()
      });
    }
  }

  /**
   * Sets the volume and mute state for a specific track.
   * @param {string} trackId 
   * @param {number} level - 0 to 10 scale
   * @param {boolean} muted 
   */
  setTrackVolume(trackId, level, muted = false) {
    this._initTrackIfNeeded(trackId);
    const track = this.tracks.get(trackId);
    if (track) {
      const gain = muted ? 0 : Math.max(0, Math.min(10, level)) / 10;
      track.gainNode.gain.setTargetAtTime(gain, this.context.currentTime, 0.05);
    }
  }

  /**
   * Sets the panning for a specific track.
   * @param {string} trackId 
   * @param {number} pan - -1 (left) to 1 (right)
   */
  setTrackPan(trackId, pan) {
    this._initTrackIfNeeded(trackId);
    const track = this.tracks.get(trackId);
    if (track) {
      const clampedPan = Math.max(-1, Math.min(1, pan));
      track.panNode.pan.setTargetAtTime(clampedPan, this.context.currentTime, 0.05);
    }
  }

  /**
   * Calculates RMS level from a Float32Array of audio data.
   * @param {Float32Array} data 
   * @returns {number} RMS value (0 to 1)
   * @private
   */
  _calculateRMS(data) {
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      sum += data[i] * data[i];
    }
    const rms = Math.sqrt(sum / data.length);
    return rms;
  }
  
  /**
   * Maps an RMS value (0 to 1) to a 0-10 meter level.
   * @param {number} rms 
   * @returns {number} Level from 0 to 10
   * @private
   */
  _rmsToMeterLevel(rms) {
    // Basic logarithmic scaling, clamped to 0-10
    if (rms === 0) return 0;
    const db = 20 * Math.log10(rms);
    // Assuming -60dB is 0 on the meter, 0dB is 10 on the meter
    const level = (db + 60) / 6;
    return Math.max(0, Math.min(10, level));
  }

  /**
   * Gets the current master levels for L/R VU meters.
   * @returns {{ left: number, right: number }} Levels from 0-10
   */
  getMasterLevels() {
    if (!this.masterAnalyserLeft || !this.masterAnalyserRight) {
      return { left: 0, right: 0 };
    }

    const dataLeft = new Float32Array(this.masterAnalyserLeft.fftSize);
    const dataRight = new Float32Array(this.masterAnalyserRight.fftSize);
    
    this.masterAnalyserLeft.getFloatTimeDomainData(dataLeft);
    this.masterAnalyserRight.getFloatTimeDomainData(dataRight);

    return {
      left: this._rmsToMeterLevel(this._calculateRMS(dataLeft)),
      right: this._rmsToMeterLevel(this._calculateRMS(dataRight))
    };
  }

  /**
   * Gets the current level for a specific track fader meter.
   * @param {string} trackId 
   * @returns {number} Level from 0-10
   */
  getTrackLevel(trackId) {
    const track = this.tracks.get(trackId);
    if (!track) return 0;

    const data = new Float32Array(track.analyserNode.fftSize);
    track.analyserNode.getFloatTimeDomainData(data);
    
    return this._rmsToMeterLevel(this._calculateRMS(data));
  }

  /**
   * Plays a simple synth beep for audio preview verification.
   * @param {string} trackId 
   * @param {number} freq - Frequency in Hz
   * @param {OscillatorType} type - 'sine', 'square', 'sawtooth', 'triangle'
   */
  playTestTone(trackId, freq = 440, type = 'sine') {
    if (!this.context) return;
    this._initTrackIfNeeded(trackId);
    const track = this.tracks.get(trackId);
    
    const osc = this.context.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.context.currentTime);
    
    // Envelope to avoid clicks
    const env = this.context.createGain();
    env.gain.setValueAtTime(0, this.context.currentTime);
    env.gain.linearRampToValueAtTime(0.5, this.context.currentTime + 0.01);
    env.gain.exponentialRampToValueAtTime(0.001, this.context.currentTime + 0.5);
    
    osc.connect(env);
    env.connect(track.gainNode);
    
    osc.start();
    osc.stop(this.context.currentTime + 0.5);

    // Track the source
    track.sourceNodes.add(osc);
    osc.onended = () => track.sourceNodes.delete(osc);
  }

  /**
   * Plays an audio buffer on a specific track.
   * @param {string} trackId 
   * @param {AudioBuffer} audioBuffer 
   * @param {number} startTime - When to start playing (in context time)
   */
  playPreviewBuffer(trackId, audioBuffer, startTime = 0) {
    if (!this.context) return;
    this._initTrackIfNeeded(trackId);
    const track = this.tracks.get(trackId);
    
    const source = this.context.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(track.gainNode);
    
    const playTime = startTime > 0 ? startTime : this.context.currentTime;
    source.start(playTime);

    track.sourceNodes.add(source);
    source.onended = () => track.sourceNodes.delete(source);
  }

  /**
   * Generates a mock/synthesized PCM Float32Array for waveform visualization.
   * @param {number} duration - Duration in seconds
   * @param {string} type - 'sine', 'noise', or 'mix'
   * @returns {Float32Array}
   */
  generateSynthesizedWaveform(duration, type = 'sine') {
    const sampleRate = 44100;
    const length = Math.floor(duration * sampleRate);
    const data = new Float32Array(length);
    
    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      if (type === 'sine') {
        data[i] = Math.sin(2 * Math.PI * 440 * t) * 0.5;
      } else if (type === 'noise') {
        data[i] = (Math.random() * 2 - 1) * 0.5;
      } else {
        // 'mix' - somewhat complex waveform for realistic looking blocks
        data[i] = (Math.sin(2 * Math.PI * 110 * t) * 0.4) + 
                  (Math.sin(2 * Math.PI * 440 * t) * 0.2) + 
                  ((Math.random() * 2 - 1) * 0.1);
      }
    }
    return data;
  }
}

// Export as a singleton
const audioGraphInstance = new AudioGraph();
export default audioGraphInstance;
