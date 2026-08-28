/**
 * ScopeEngine.js - Real-time acoustic analysis engine
 * Simulates real-time spectrum and goniometer data.
 */

class ScopeEngine {
  constructor() {
    this.bands = 31;
    this.spectrum = new Float32Array(this.bands);
    this.peakHold = new Float32Array(this.bands);
    this.decayRate = 0.02;
    this.correlation = 0.0;
  }

  /**
   * Retrieves 31-Band spectrum data (normalized 0.0 to 1.0)
   * @returns {{ bands: Float32Array, peaks: Float32Array }}
   */
  getSpectrumData() {
    for (let i = 0; i < this.bands; i++) {
      // Simulate spectral activity
      const val = Math.random() * 0.8 + 0.1; 
      this.spectrum[i] = val * Math.sin(i / this.bands * Math.PI) * 1.2;
      this.spectrum[i] = Math.max(0, Math.min(1, this.spectrum[i]));

      if (this.spectrum[i] > this.peakHold[i]) {
        this.peakHold[i] = this.spectrum[i];
      } else {
        this.peakHold[i] = Math.max(0, this.peakHold[i] - this.decayRate);
      }
    }
    return {
      bands: this.spectrum,
      peaks: this.peakHold
    };
  }

  /**
   * Generates Lissajous phase correlation points
   * @returns {Array<{x: number, y: number}>} Array of x, y coordinates
   */
  getGoniometerPoints() {
    const points = [];
    const numPoints = 150;
    for (let i = 0; i < numPoints; i++) {
      const L = Math.sin((i / numPoints) * Math.PI * 4 + performance.now() / 200) * (Math.random() * 0.5 + 0.5);
      const R = Math.sin((i / numPoints) * Math.PI * 4 + performance.now() / 250) * (Math.random() * 0.5 + 0.5);
      
      const x = (L - R) / Math.SQRT2;
      const y = (L + R) / Math.SQRT2;
      
      points.push({ x, y });
    }
    return points;
  }

  /**
   * Returns stereo correlation (-1.0 to +1.0)
   * @returns {number}
   */
  getCorrelation() {
    // Simulated shifting correlation
    this.correlation = Math.sin(performance.now() / 1000) * 0.6 + 0.2;
    return this.correlation;
  }
}

const scopeEngine = new ScopeEngine();
export default scopeEngine;
