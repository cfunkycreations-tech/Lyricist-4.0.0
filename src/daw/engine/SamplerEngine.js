/**
 * SamplerEngine.js
 * 16-Pad drum sampler engine for Lyricist 4.2.0 Pro
 */

class SamplerEngine {
  constructor() {
    this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    this.pads = Array.from({ length: 16 }, (_, i) => ({
      index: i,
      pitch: 0, // -24 to +24 semitones
      decay: 0.5, // 0.05s to 3.0s
      volume: 8, // 0-10
      pan: 0, // -1 to 1
      chokeGroup: 0, // 0, 1, 2, 3
      buffer: null,
      name: this._getDefaultPadName(i),
    }));
    this.activeNodes = {}; // store active audio nodes by choke group to handle choking
    this.currentKit = '808 Trap Kit';
    this.kits = ['808 Trap Kit', 'Classic BoomBap Kit', 'CyberFunk Neon Kit'];
    
    // Synthesized buffer caches
    this.kitBuffers = {};
    this.initSynthesizedKits();
  }

  _getDefaultPadName(index) {
    const names = [
      'Kick', 'Snare', 'Rimshot', 'Clap', 
      'Closed Hat', 'Open Hat', 'Low Tom', 'Mid Tom', 
      'High Tom', 'Crash', 'Ride', 'Shaker', 
      '808 Sub', 'Perc 1', 'Perc 2', 'FX'
    ];
    return names[index] || `Pad ${index + 1}`;
  }

  async initSynthesizedKits() {
    // Generate synthetic buffers for the kits
    for (const kit of this.kits) {
      this.kitBuffers[kit] = await this._generateKitBuffers(kit);
    }
    this.switchKit(this.currentKit);
  }

  async _generateKitBuffers(kitName) {
    const buffers = new Array(16);
    // Dummy generation of simple audio buffers for demonstration
    for (let i = 0; i < 16; i++) {
      buffers[i] = this._createToneBuffer(440 * (i + 1) * 0.1, 0.5);
    }
    return buffers;
  }

  _createToneBuffer(freq, duration) {
    const sampleRate = this.audioCtx.sampleRate;
    const buffer = this.audioCtx.createBuffer(1, sampleRate * duration, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = Math.sin(2 * Math.PI * freq * (i / sampleRate)) * Math.exp(-3 * (i / sampleRate));
    }
    return buffer;
  }

  setPadParam(padIndex, param, value) {
    if (this.pads[padIndex]) {
      this.pads[padIndex][param] = value;
    }
  }

  switchKit(kitName) {
    if (this.kits.includes(kitName)) {
      this.currentKit = kitName;
      const buffers = this.kitBuffers[kitName];
      if (buffers) {
        this.pads.forEach((pad, index) => {
          pad.buffer = buffers[index];
        });
      }
    }
  }

  triggerPad(padIndex, velocity = 100) {
    const pad = this.pads[padIndex];
    if (!pad || !pad.buffer) return;

    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }

    // Handle choke groups
    if (pad.chokeGroup > 0) {
      if (this.activeNodes[pad.chokeGroup]) {
        try {
          this.activeNodes[pad.chokeGroup].stop();
        } catch (e) {
          // Ignore
        }
      }
    }

    const source = this.audioCtx.createBufferSource();
    source.buffer = pad.buffer;

    // Pitch
    source.playbackRate.value = Math.pow(2, pad.pitch / 12);

    // Volume & velocity
    const gainNode = this.audioCtx.createGain();
    const normalizedVolume = (pad.volume / 10) * (velocity / 127);
    gainNode.gain.setValueAtTime(normalizedVolume, this.audioCtx.currentTime);

    // Decay envelope
    gainNode.gain.setTargetAtTime(0, this.audioCtx.currentTime, pad.decay / 3);

    // Panner
    const panner = this.audioCtx.createStereoPanner();
    panner.pan.value = pad.pan;

    source.connect(gainNode);
    gainNode.connect(panner);
    panner.connect(this.audioCtx.destination);

    source.start(0);

    if (pad.chokeGroup > 0) {
      this.activeNodes[pad.chokeGroup] = source;
    }
  }
}

const samplerEngine = new SamplerEngine();
export default samplerEngine;
