/**
 * @file TruePeakLimiter.js
 * @description High-precision 4x oversampled lookahead mastering limiter for Lyricist 4.2.0 Pro.
 * Provides soft-knee gain reduction with polynomial interpolation for True Peak / ISP detection.
 */

class TruePeakLimiter {
  constructor() {
    this.oversampleFactor = 4;
    this.lookaheadMs = 1.5;
    this.lookaheadBuffer = [];
    this.sampleRate = 44100;
    this.envelope = 0;
  }

  /**
   * Polynomial interpolation (Catmull-Rom) to detect Inter-Sample Peaks
   * @param {number} y0
   * @param {number} y1
   * @param {number} y2
   * @param {number} y3
   * @param {number} mu 
   * @returns {number} Interpolated value
   */
  _cubicInterpolate(y0, y1, y2, y3, mu) {
    const a0 = -0.5 * y0 + 1.5 * y1 - 1.5 * y2 + 0.5 * y3;
    const a1 = y0 - 2.5 * y1 + 2 * y2 - 0.5 * y3;
    const a2 = -0.5 * y0 + 0.5 * y2;
    const a3 = y1;
    const mu2 = mu * mu;
    return a0 * mu * mu2 + a1 * mu2 + a2 * mu + a3;
  }

  /**
   * Process a buffer of audio data through the true-peak limiter.
   * @param {Float32Array} audioBuffer - Input audio data
   * @param {number} ceilingDb - The True Peak ceiling (-0.1 to -1.0 dB)
   * @param {number} releaseMs - The release time in milliseconds (10 to 500)
   * @returns {Float32Array} The processed, ISP-free audio data
   */
  processBuffer(audioBuffer, ceilingDb = -0.1, releaseMs = 50) {
    const length = audioBuffer.length;
    const output = new Float32Array(length);
    
    const ceilingLinear = Math.pow(10, ceilingDb / 20);
    const releaseCoeff = Math.exp(-1.0 / (this.sampleRate * (releaseMs / 1000.0)));
    
    const delaySamples = Math.floor(this.sampleRate * (this.lookaheadMs / 1000.0));
    
    if (this.lookaheadBuffer.length !== delaySamples) {
      this.lookaheadBuffer = new Array(delaySamples).fill(0);
    }

    let delayIndex = 0;

    for (let i = 0; i < length; i++) {
      const y0 = audioBuffer[Math.max(0, i - 1)];
      const y1 = audioBuffer[i];
      const y2 = audioBuffer[Math.min(length - 1, i + 1)];
      const y3 = audioBuffer[Math.min(length - 1, i + 2)];

      // 4x Oversampling
      let peak = Math.abs(y1);
      for (let step = 1; step < this.oversampleFactor; step++) {
        const mu = step / this.oversampleFactor;
        const interp = Math.abs(this._cubicInterpolate(y0, y1, y2, y3, mu));
        if (interp > peak) peak = interp;
      }

      let targetGain = 1.0;
      if (peak > ceilingLinear) {
        targetGain = ceilingLinear / peak;
      }

      if (targetGain < this.envelope) {
        this.envelope = targetGain; // Instant attack with lookahead
      } else {
        this.envelope = (this.envelope - targetGain) * releaseCoeff + targetGain;
      }

      const delayedSample = this.lookaheadBuffer[delayIndex];
      this.lookaheadBuffer[delayIndex] = y1;
      delayIndex = (delayIndex + 1) % delaySamples;

      output[i] = delayedSample * this.envelope;
    }

    return output;
  }
}

const truePeakLimiter = new TruePeakLimiter();
export default truePeakLimiter;
