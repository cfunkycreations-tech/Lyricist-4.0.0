/**
 * ModulationMatrix.js - 8-Macro & Dual-LFO modulation engine
 */

class ModulationMatrix {
  constructor() {
    this.macros = Array(8).fill(0.0);
    this.lfos = [
      { id: 'lfo1', waveform: 'sine', rate: '1/4', depth: 100, phase: 0 },
      { id: 'lfo2', waveform: 'triangle', rate: '1/8', depth: 50, phase: 0 }
    ];
    this.mappings = []; // { id, source, targetTrackId, param, min, max }
    this.listeners = new Set();
  }

  /**
   * Update a macro value and notify listeners
   * @param {number} macroIndex 0-7
   * @param {number} value 0.0 to 1.0
   */
  setMacroValue(macroIndex, value) {
    if (macroIndex >= 0 && macroIndex < 8) {
      this.macros[macroIndex] = Math.max(0, Math.min(1, value));
      this._notifyListeners();
    }
  }

  getMacroValue(macroIndex) {
    return this.macros[macroIndex];
  }

  /**
   * Adds a new modulation routing
   * @param {Object} mapping 
   */
  addMapping(mapping) {
    const newMapping = { id: Date.now().toString(), ...mapping };
    this.mappings.push(newMapping);
    this._notifyListeners();
    return newMapping;
  }

  removeMapping(id) {
    this.mappings = this.mappings.filter(m => m.id !== id);
    this._notifyListeners();
  }
  
  getMappings() {
    return this.mappings;
  }
  
  getLFOs() {
    return this.lfos;
  }
  
  updateLFO(index, config) {
    this.lfos[index] = { ...this.lfos[index], ...config };
    this._notifyListeners();
  }

  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  _notifyListeners() {
    this.listeners.forEach(cb => cb());
  }
}

const modulationMatrix = new ModulationMatrix();
export default modulationMatrix;
