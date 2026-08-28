import { getAudioContext, getMasterInput } from './AudioContextProvider';
/**
 * GranularEngine.js
 * Real-time Web Audio granular synthesis engine.
 */

class GranularEngine {
  constructor() {
    this.audioContext = null;
    this.audioBuffer = null;
    this.masterGain = null;
    this.isPlaying = false;

    // Grain parameters
    this.grainSize = 100; // ms (10 to 500)
    this.density = 20;    // grains/sec (1 to 64)
    this.spray = 50;      // % (0 to 100)
    this.pitch = 0;       // semitones (-12 to +12)
    this.position = 0.5;  // scrubber (0.0 to 1.0)
    this.mix = 50;        // %

    // Particle tracking for UI
    this.particles = [];
    this.particleIdCounter = 0;
    this.timerID = null;
  }

  /**
   * Initializes the AudioContext and master gain.
   */
  init() {
    if (!this.audioContext) {
      this.audioContext = getAudioContext();
      this.masterGain = this.audioContext.createGain();
      this.masterGain.connect(getMasterInput());
    }
  }

  /**
   * Loads an AudioBuffer into the engine.
   * @param {AudioBuffer} audioBuffer 
   */
  loadBuffer(audioBuffer) {
    this.audioBuffer = audioBuffer;
  }

  /**
   * Starts the granular synthesis cloud generation.
   */
  startCloud() {
    if (!this.audioContext) this.init();
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
    
    this.isPlaying = true;
    this.scheduleNextGrain();
  }

  /**
   * Stops the granular synthesis.
   */
  stopCloud() {
    this.isPlaying = false;
    if (this.timerID) {
      clearTimeout(this.timerID);
      this.timerID = null;
    }
  }

  /**
   * Sets a synthesis parameter.
   * @param {string} param 
   * @param {number} value 
   */
  setParam(param, value) {
    if (this.hasOwnProperty(param)) {
      this[param] = value;
    }
  }

  /**
   * Internal method to schedule the next grain.
   */
  scheduleNextGrain() {
    if (!this.isPlaying || !this.audioBuffer) return;

    const interval = 1000 / this.density; // ms between grains
    
    // Play a grain
    this.playGrain();

    // Clean up old particles
    const now = Date.now();
    this.particles = this.particles.filter(p => now - p.startTime < p.life);

    this.timerID = setTimeout(() => this.scheduleNextGrain(), interval);
  }

  /**
   * Plays a single grain.
   */
  playGrain() {
    if (!this.audioContext || !this.audioBuffer) return;

    const source = this.audioContext.createBufferSource();
    source.buffer = this.audioBuffer;

    const grainGain = this.audioContext.createGain();
    
    source.connect(grainGain);
    grainGain.connect(this.masterGain);

    const now = this.audioContext.currentTime;
    const duration = this.grainSize / 1000;
    
    // Calculate playback rate from pitch
    source.playbackRate.value = Math.pow(2, this.pitch / 12);
    
    // Calculate start time with spray
    const spraySecs = (this.spray / 100) * (this.audioBuffer.duration * 0.1); // max 10% spray variance
    const rOffset = (Math.random() - 0.5) * spraySecs;
    let startTime = (this.position * this.audioBuffer.duration) + rOffset;
    
    // Clamp startTime
    if (startTime < 0) startTime = 0;
    if (startTime >= this.audioBuffer.duration) startTime = this.audioBuffer.duration - 0.01;

    // Apply Hann envelope
    grainGain.gain.setValueAtTime(0, now);
    grainGain.gain.linearRampToValueAtTime((this.mix / 100), now + duration / 2);
    grainGain.gain.linearRampToValueAtTime(0, now + duration);

    source.start(now, startTime, duration);
    source.stop(now + duration);

    // Track particle for UI visualizer
    const pId = this.particleIdCounter++;
    this.particles.push({
      id: pId,
      x: (startTime / this.audioBuffer.duration) * 100, // % position
      y: 50 + (Math.random() - 0.5) * 40,               // random vertical
      size: this.grainSize,
      life: this.grainSize * 2,                         // visual life in ms
      startTime: Date.now()
    });
  }

  /**
   * Returns a live array of grain particles for UI visualization.
   * @returns {Array} Array of particle objects { id, x, y, size, life }
   */
  getGrainParticles() {
    return this.particles;
  }
}

const granularEngine = new GranularEngine();
export default granularEngine;
