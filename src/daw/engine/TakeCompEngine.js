class TakeCompEngine {
  constructor() {
    this.trackTakes = new Map();
    this.masterComps = new Map();
  }

  /**
   * Initialize or update takes for a track.
   * @param {string} trackId 
   * @param {Array} takes - Array of take objects
   */
  setTakes(trackId, takes) {
    this.trackTakes.set(trackId, takes);
    if (!this.masterComps.has(trackId)) {
      this.masterComps.set(trackId, []);
    }
  }

  /**
   * Promotes a specific region of a take to the master comp.
   * @param {string} trackId - The ID of the track.
   * @param {string} takeId - The ID of the take being promoted.
   * @param {number} startBar - The start bar of the region.
   * @param {number} length - The length of the region in bars.
   */
  promoteCompRegion(trackId, takeId, startBar, length) {
    const takes = this.trackTakes.get(trackId) || [];
    const master = this.masterComps.get(trackId) || [];

    // Deactivate overlapping regions in other takes
    takes.forEach(take => {
      if (!take.regions) take.regions = [];
      if (take.id === takeId) {
        // Add new active region or merge
        take.regions.push({ start: startBar, length, active: true });
      } else {
        // Split or deactivate overlapping regions in other takes
        take.regions = take.regions.filter(r => {
          const rEnd = r.start + r.length;
          const newEnd = startBar + length;
          // simplified overlap logic
          if (r.start >= startBar && rEnd <= newEnd) return false; // fully covered
          return true;
        });
      }
    });

    // Update master comp regions
    this.masterComps.set(trackId, [...master, { takeId, start: startBar, length }]);
  }

  /**
   * Stitches promoted regions with 10ms equal-power crossfades.
   * @param {string} trackId - The ID of the track.
   * @returns {Object} A buffer representation or metadata of the stitched clip.
   */
  generateTakeBuffer(trackId) {
    const master = this.masterComps.get(trackId) || [];
    // Simulate generation of take buffer with crossfades
    return {
      trackId,
      crossfadeMs: 10,
      type: 'equal-power',
      regions: master,
      bufferData: new Float32Array(0) // Mock buffer
    };
  }
}

const takeCompEngine = new TakeCompEngine();
export default takeCompEngine;
