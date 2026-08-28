/**
 * @file TapeSlicerEngine.js
 * @description Real-time Tape DSP simulation engine for Lyricist Pro.
 */

class TapeSlicerEngine {
  constructor() {
    this.audioContext = null;
    this.masterGain = null;
    this.initialized = false;
    
    // DSP parameters
    this.playbackRate = 1.0;
    this.pitchShiftSemi = 0;
    this.slowdownFactor = 1.0;
    this.isBraking = false;
    
    // Nodes managed by engine
    this.gateNode = null;
    this.gateInterval = null;
  }

  /**
   * Initialize the DSP context and master nodes.
   */
  init(audioContext) {
    if (this.initialized) return;
    
    // If an external audio context is provided, use it, otherwise create one
    this.audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)();
    
    this.masterGain = this.audioContext.createGain();
    this.masterGain.connect(this.audioContext.destination);
    
    this.gateNode = this.audioContext.createGain();
    this.gateNode.connect(this.masterGain);
    
    this.initialized = true;
  }

  /**
   * Helper to set overall rate based on current parameters.
   * In a real system, this would apply to all active audio buffer source nodes.
   */
  _updateGlobalPlaybackRate() {
    this.playbackRate = Math.pow(2, this.pitchShiftSemi / 12) * this.slowdownFactor;
    // Notify audio engine/tracks about global playback rate change
    console.log(`[TapeSlicerEngine] Playback rate updated to: ${this.playbackRate.toFixed(4)}`);
  }

  /**
   * Trigger a vinyl brake effect (pitch down to 0) over a duration.
   * @param {number} durationMs - Duration in milliseconds.
   * @param {Function} [onProgress] - Callback for animation updates.
   */
  triggerVinylBrake(durationMs = 1500, onProgress) {
    if (!this.initialized || this.isBraking) return;
    this.isBraking = true;
    
    const startTime = performance.now();
    const startFactor = this.slowdownFactor;
    
    const animate = (time) => {
      let elapsed = time - startTime;
      if (elapsed >= durationMs) {
        this.setTapeSlowdown(0);
        this.isBraking = false;
        if (onProgress) onProgress(0);
        return;
      }
      
      // Cubic ease-in: rate drops slowly at first, then quickly
      const t = elapsed / durationMs;
      const easeInCubic = t * t * t; 
      // rate goes from startFactor down to 0
      const currentFactor = startFactor * (1 - easeInCubic);
      
      this.setTapeSlowdown(currentFactor);
      if (onProgress) onProgress(currentFactor);
      
      requestAnimationFrame(animate);
    };
    
    requestAnimationFrame(animate);
  }

  /**
   * Sets the pitch shift in semitones.
   * @param {number} semitones - Range typically -12 to +12.
   */
  setPitchShift(semitones) {
    this.pitchShiftSemi = semitones;
    this._updateGlobalPlaybackRate();
  }

  /**
   * Sets the tape slowdown factor (affects pitch and speed simultaneously).
   * @param {number} factor - 0.0 to 1.0.
   */
  setTapeSlowdown(factor) {
    // clamp between 0 and 1
    this.slowdownFactor = Math.max(0, Math.min(1, factor));
    this._updateGlobalPlaybackRate();
  }

  /**
   * Rhythmically gates audio signal on the beat.
   * @param {string} subdivision - Note value string like '1/16', '1/8', '1/4'.
   * @param {number} bpm - The current tempo.
   */
  triggerBeatChop(subdivision = '1/16', bpm = 120) {
    if (!this.initialized) return;
    
    // Clear any existing chop
    this.stopBeatChop();
    
    // Parse subdivision, e.g. '1/16' -> 16
    const parts = subdivision.split('/');
    const denominator = parts.length === 2 ? parseInt(parts[1], 10) : 16;
    
    // Calculate ms per subdivision
    // Quarter note (1/4) duration in ms: (60,000 / BPM)
    // 16th note duration = Quarter note / 4
    const quarterMs = 60000 / bpm;
    const subMs = quarterMs * (4 / denominator);
    
    // Create a rhythmic gating effect using setInterval (simplified for UI demonstration)
    // For sample-accurate DSP, we would use AudioParam scheduling (setValueAtTime)
    
    let isMuted = false;
    this.gateInterval = setInterval(() => {
      isMuted = !isMuted;
      // Soft gate to avoid clicks
      this.gateNode.gain.setTargetAtTime(isMuted ? 0.0 : 1.0, this.audioContext.currentTime, 0.01);
    }, subMs);
  }
  
  stopBeatChop() {
    if (this.gateInterval) {
      clearInterval(this.gateInterval);
      this.gateInterval = null;
      if (this.gateNode) {
        this.gateNode.gain.setTargetAtTime(1.0, this.audioContext.currentTime, 0.01);
      }
    }
  }
}

const tapeSlicerEngine = new TapeSlicerEngine();
export default tapeSlicerEngine;
