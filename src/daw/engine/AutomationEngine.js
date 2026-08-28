/**
 * @fileoverview Automation Engine for Lyricist 4.2.0 Pro.
 * Handles calculation, evaluation, and management of automation curves and breakpoints.
 */

class AutomationEngine {
  constructor() {
    /**
     * Store for all automation data.
     * Structure: { [trackId]: { [param]: [Breakpoint, ...] } }
     * @type {Object<string, Object<string, Array<Breakpoint>>>}
     */
    this.data = {};
  }

  /**
   * Represents a single automation breakpoint.
   * @typedef {Object} Breakpoint
   * @property {string} id - Unique identifier for the breakpoint.
   * @property {number} bar - Timeline position in bars.
   * @property {number} value - Parameter value (0.0 to 1.0).
   * @property {number} curve - Bezier tension curve (-1.0 to 1.0, 0 is linear).
   */

  /**
   * Initialize a track/param if it doesn't exist.
   * @param {string} trackId - The track ID.
   * @param {string} param - The parameter name.
   */
  _initParam(trackId, param) {
    if (!this.data[trackId]) this.data[trackId] = {};
    if (!this.data[trackId][param]) this.data[trackId][param] = [];
  }

  /**
   * Sorts breakpoints by bar position.
   * @param {Array<Breakpoint>} breakpoints 
   */
  _sortBreakpoints(breakpoints) {
    breakpoints.sort((a, b) => a.bar - b.bar);
  }

  /**
   * Add a new breakpoint or update an existing one at the exact same bar position.
   * @param {string} trackId - The track ID.
   * @param {string} param - The parameter to automate.
   * @param {number} bar - The timeline position in bars.
   * @param {number} value - The parameter value (0.0 to 1.0).
   * @param {number} [curve=0] - The curve tension (-1.0 to 1.0).
   * @returns {Breakpoint} The created or updated breakpoint.
   */
  addBreakpoint(trackId, param, bar, value, curve = 0) {
    this._initParam(trackId, param);
    const breakpoints = this.data[trackId][param];
    
    // Check if a breakpoint already exists at this exact position (within small epsilon)
    const existingIndex = breakpoints.findIndex(bp => Math.abs(bp.bar - bar) < 0.001);
    
    if (existingIndex !== -1) {
      breakpoints[existingIndex].value = value;
      breakpoints[existingIndex].curve = curve;
      return breakpoints[existingIndex];
    }

    const id = `bp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newBreakpoint = { id, bar, value, curve };
    breakpoints.push(newBreakpoint);
    this._sortBreakpoints(breakpoints);
    
    return newBreakpoint;
  }

  /**
   * Delete a breakpoint by ID.
   * @param {string} trackId - The track ID.
   * @param {string} param - The parameter to automate.
   * @param {string} pointId - The breakpoint ID to delete.
   * @returns {boolean} True if deleted, false otherwise.
   */
  deleteBreakpoint(trackId, param, pointId) {
    if (!this.data[trackId] || !this.data[trackId][param]) return false;
    
    const breakpoints = this.data[trackId][param];
    const index = breakpoints.findIndex(bp => bp.id === pointId);
    
    if (index !== -1) {
      breakpoints.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Records a live value at a specific bar, potentially smoothing over time.
   * @param {string} trackId - The track ID.
   * @param {string} param - The parameter to automate.
   * @param {number} bar - The timeline position.
   * @param {number} value - The parameter value.
   */
  recordLiveValue(trackId, param, bar, value) {
    this.addBreakpoint(trackId, param, bar, value, 0);
  }

  /**
   * Evaluates the interpolated value of the automation curve at a given bar.
   * @param {Array<Breakpoint>} breakpoints - The sorted array of breakpoints.
   * @param {number} currentBar - The current timeline position to evaluate.
   * @returns {number} The evaluated parameter value (0.0 to 1.0).
   */
  evaluateCurve(breakpoints, currentBar) {
    if (!breakpoints || breakpoints.length === 0) return 0.5; // Default value if no automation
    
    // If before first point, return first point value
    if (currentBar <= breakpoints[0].bar) return breakpoints[0].value;
    
    // If after last point, return last point value
    if (currentBar >= breakpoints[breakpoints.length - 1].bar) return breakpoints[breakpoints.length - 1].value;
    
    // Find surrounding points
    let p0, p1;
    for (let i = 0; i < breakpoints.length - 1; i++) {
      if (currentBar >= breakpoints[i].bar && currentBar <= breakpoints[i + 1].bar) {
        p0 = breakpoints[i];
        p1 = breakpoints[i + 1];
        break;
      }
    }
    
    if (!p0 || !p1) return 0.5;
    
    // Linear interpolation based on current tension logic
    const t = (currentBar - p0.bar) / (p1.bar - p0.bar);
    
    if (p0.curve === 0) {
      return p0.value + t * (p1.value - p0.value);
    } else {
      // Basic tension approximation (pow function)
      let easedT;
      if (p0.curve > 0) {
        easedT = Math.pow(t, 1 - (p0.curve * 0.9));
      } else {
        easedT = Math.pow(t, 1 + (Math.abs(p0.curve) * 5));
      }
      return p0.value + easedT * (p1.value - p0.value);
    }
  }

  /**
   * Evaluates a track parameter at a given bar directly from the engine's store.
   * @param {string} trackId - The track ID.
   * @param {string} param - The parameter to evaluate.
   * @param {number} currentBar - The current timeline position.
   * @returns {number} The evaluated value.
   */
  getValue(trackId, param, currentBar) {
    if (!this.data[trackId] || !this.data[trackId][param]) return 0.5;
    return this.evaluateCurve(this.data[trackId][param], currentBar);
  }
}

const automationEngine = new AutomationEngine();
export default automationEngine;
