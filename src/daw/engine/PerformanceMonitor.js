/**
 * @file PerformanceMonitor.js
 * @description Real-time DSP performance engine for Lyricist 4.2.0 Pro.
 */

class PerformanceMonitor {
  constructor() {
    this.bufferSize = 256;
    this.sampleRate = 44100;
    this.underruns = 0;
    this.activeNodes = 0;
    this.dspLoad = 0.0;
    
    // Simulate real-time monitoring
    this.intervalId = setInterval(() => this._simulateProcessing(), 100);
  }

  get latencyMs() {
    // Calculate round-trip latency based on buffer size and sample rate
    return ((this.bufferSize / this.sampleRate) * 1000).toFixed(1);
  }

  get targetFrameWindowMs() {
    return (this.bufferSize / this.sampleRate) * 1000;
  }

  /**
   * Update the audio processing buffer size.
   * @param {number} size - Buffer size (64, 128, 256, 512, 1024)
   */
  setBufferSize(size) {
    const allowed = [64, 128, 256, 512, 1024];
    if (allowed.includes(size)) {
      this.bufferSize = size;
    }
  }

  /**
   * Clear the current underrun counter.
   */
  resetUnderruns() {
    this.underruns = 0;
  }

  /**
   * Internal simulation for DSP load based on processing frame vs target window.
   */
  _simulateProcessing() {
    const targetMs = this.targetFrameWindowMs;
    // Simulate actual processing time (random load scaling with spikes)
    let processingTimeMs = targetMs * (0.1 + Math.random() * 0.7);
    
    // Occasional CPU spikes
    if (Math.random() > 0.92) {
      processingTimeMs = targetMs * (0.8 + Math.random() * 0.4);
    }
    
    this.dspLoad = (processingTimeMs / targetMs) * 100;
    
    if (this.dspLoad > 100) {
      this.dspLoad = 100;
      this.underruns++; // Dropout occurred
    }

    this.activeNodes = 30 + Math.floor(Math.random() * 25);
  }

  /**
   * Retrieves the latest real-time stats from the DSP engine.
   * @returns {Object}
   */
  getStats() {
    return {
      dspLoad: this.dspLoad,
      bufferSize: this.bufferSize,
      sampleRate: this.sampleRate,
      latencyMs: this.latencyMs,
      underruns: this.underruns,
      activeNodes: this.activeNodes
    };
  }
}

const performanceMonitor = new PerformanceMonitor();
export default performanceMonitor;
