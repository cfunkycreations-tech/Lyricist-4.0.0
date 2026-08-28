import { getAudioContext, getMasterInput } from './AudioContextProvider';
/**
 * SamplerEngine.js
 * 16-Pad drum sampler engine for Lyricist 4.2.0 Pro
 */

class SamplerEngine {
  constructor() {
    this.audioCtx = getAudioContext();
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
    const sampleRate = this.audioCtx.sampleRate;

    // 0: Punchy Sub-Kick (Pitch swept sine + transient click)
    buffers[0] = this._synthesizeKick(sampleRate, 0.45);
    // 1: Snare (Resonant body + bandpass noise burst)
    buffers[1] = this._synthesizeSnare(sampleRate, 0.35);
    // 2: Rimshot (Woody resonant transient)
    buffers[2] = this._synthesizeRimshot(sampleRate, 0.15);
    // 3: Clap (3 staggered micro-bursts + reverb noise tail)
    buffers[3] = this._synthesizeClap(sampleRate, 0.3);
    // 4: Closed Hat (Highpass metallic noise pulse)
    buffers[4] = this._synthesizeClosedHat(sampleRate, 0.08);
    // 5: Open Hat (Highpass metallic noise sizzle)
    buffers[5] = this._synthesizeOpenHat(sampleRate, 0.6);
    // 6: Low Tom
    buffers[6] = this._synthesizeTom(sampleRate, 85, 0.5);
    // 7: Mid Tom
    buffers[7] = this._synthesizeTom(sampleRate, 130, 0.45);
    // 8: High Tom
    buffers[8] = this._synthesizeTom(sampleRate, 200, 0.4);
    // 9: Crash Cymbal (Multi-oscillator metallic cluster + noise)
    buffers[9] = this._synthesizeCrash(sampleRate, 1.8);
    // 10: Ride Cymbal
    buffers[10] = this._synthesizeRide(sampleRate, 1.4);
    // 11: Shaker (Grainy bandpass noise)
    buffers[11] = this._synthesizeShaker(sampleRate, 0.18);
    // 12: 808 Sub Boom (42Hz saturated sub with long 1.6s boom)
    buffers[12] = this._synthesize808Sub(sampleRate, 1.6);
    // 13: Perc 1 (Cowbell / Agogo)
    buffers[13] = this._synthesizeCowbell(sampleRate, 0.25);
    // 14: Perc 2 (Conga / Bongo)
    buffers[14] = this._synthesizeTom(sampleRate, 280, 0.2);
    // 15: Cyber Vox / Zap FX
    buffers[15] = this._synthesizeZap(sampleRate, 0.25);

    return buffers;
  }

  _synthesizeKick(sampleRate, duration) {
    const len = Math.floor(sampleRate * duration);
    const buf = this.audioCtx.createBuffer(1, len, sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const t = i / sampleRate;
      // Exponential pitch drop from 160Hz to 45Hz
      const freq = 45 + 115 * Math.exp(-t * 32);
      const phase = 2 * Math.PI * freq * t;
      const body = Math.sin(phase) * Math.exp(-t * 7);
      const click = (Math.random() * 2 - 1) * Math.exp(-t * 120) * 0.4;
      // Soft clip saturation
      d[i] = Math.tanh(body * 1.5 + click);
    }
    return buf;
  }

  _synthesizeSnare(sampleRate, duration) {
    const len = Math.floor(sampleRate * duration);
    const buf = this.audioCtx.createBuffer(1, len, sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const t = i / sampleRate;
      const tone = Math.sin(2 * Math.PI * 185 * t) * Math.exp(-t * 22) * 0.6;
      const noise = (Math.random() * 2 - 1) * Math.exp(-t * 14) * 0.7;
      const snap = (Math.random() * 2 - 1) * Math.exp(-t * 90) * 0.5;
      d[i] = Math.tanh(tone + noise + snap);
    }
    return buf;
  }

  _synthesizeRimshot(sampleRate, duration) {
    const len = Math.floor(sampleRate * duration);
    const buf = this.audioCtx.createBuffer(1, len, sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const t = i / sampleRate;
      const tone = Math.sin(2 * Math.PI * 850 * t) * Math.exp(-t * 45);
      const click = (Math.random() * 2 - 1) * Math.exp(-t * 180);
      d[i] = tone * 0.7 + click * 0.5;
    }
    return buf;
  }

  _synthesizeClap(sampleRate, duration) {
    const len = Math.floor(sampleRate * duration);
    const buf = this.audioCtx.createBuffer(1, len, sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const t = i / sampleRate;
      let amp = 0;
      // 3 staggered micro-bursts at 0ms, 12ms, 24ms
      if (t < 0.012) amp = Math.exp(-t * 150);
      else if (t < 0.024) amp = Math.exp(-(t - 0.012) * 150);
      else if (t < 0.036) amp = Math.exp(-(t - 0.024) * 150);
      else amp = Math.exp(-(t - 0.036) * 16);
      const noise = (Math.random() * 2 - 1);
      d[i] = noise * amp * 0.9;
    }
    return buf;
  }

  _synthesizeClosedHat(sampleRate, duration) {
    const len = Math.floor(sampleRate * duration);
    const buf = this.audioCtx.createBuffer(1, len, sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const t = i / sampleRate;
      // Metallic square cluster modulation + noise
      const metal = Math.sin(2 * Math.PI * 8200 * t) + Math.sin(2 * Math.PI * 11400 * t);
      const noise = (Math.random() * 2 - 1);
      d[i] = (metal * 0.3 + noise * 0.7) * Math.exp(-t * 60);
    }
    return buf;
  }

  _synthesizeOpenHat(sampleRate, duration) {
    const len = Math.floor(sampleRate * duration);
    const buf = this.audioCtx.createBuffer(1, len, sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const t = i / sampleRate;
      const metal = Math.sin(2 * Math.PI * 7500 * t) + Math.sin(2 * Math.PI * 9800 * t);
      const noise = (Math.random() * 2 - 1);
      d[i] = (metal * 0.3 + noise * 0.7) * Math.exp(-t * 6.5);
    }
    return buf;
  }

  _synthesizeTom(sampleRate, startFreq, duration) {
    const len = Math.floor(sampleRate * duration);
    const buf = this.audioCtx.createBuffer(1, len, sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const t = i / sampleRate;
      const freq = (startFreq * 0.7) + (startFreq * 0.3) * Math.exp(-t * 20);
      d[i] = Math.sin(2 * Math.PI * freq * t) * Math.exp(-t * 8);
    }
    return buf;
  }

  _synthesizeCrash(sampleRate, duration) {
    const len = Math.floor(sampleRate * duration);
    const buf = this.audioCtx.createBuffer(1, len, sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const t = i / sampleRate;
      const noise = (Math.random() * 2 - 1) * Math.exp(-t * 2.2);
      d[i] = noise * 0.7;
    }
    return buf;
  }

  _synthesizeRide(sampleRate, duration) {
    const len = Math.floor(sampleRate * duration);
    const buf = this.audioCtx.createBuffer(1, len, sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const t = i / sampleRate;
      const ping = Math.sin(2 * Math.PI * 4500 * t) * Math.exp(-t * 12);
      const noise = (Math.random() * 2 - 1) * Math.exp(-t * 3.5);
      d[i] = ping * 0.4 + noise * 0.5;
    }
    return buf;
  }

  _synthesizeShaker(sampleRate, duration) {
    const len = Math.floor(sampleRate * duration);
    const buf = this.audioCtx.createBuffer(1, len, sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const t = i / sampleRate;
      const attack = Math.sin(Math.min(Math.PI, t * 80));
      const noise = (Math.random() * 2 - 1);
      d[i] = noise * attack * Math.exp(-t * 22);
    }
    return buf;
  }

  _synthesize808Sub(sampleRate, duration) {
    const len = Math.floor(sampleRate * duration);
    const buf = this.audioCtx.createBuffer(1, len, sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const t = i / sampleRate;
      const freq = 42 + 25 * Math.exp(-t * 18);
      const sub = Math.sin(2 * Math.PI * freq * t);
      const warmHarmonic = Math.sin(4 * Math.PI * freq * t) * 0.25;
      const env = Math.exp(-t * 1.8);
      d[i] = Math.tanh((sub + warmHarmonic) * 1.6) * env;
    }
    return buf;
  }

  _synthesizeCowbell(sampleRate, duration) {
    const len = Math.floor(sampleRate * duration);
    const buf = this.audioCtx.createBuffer(1, len, sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const t = i / sampleRate;
      const f1 = Math.sin(2 * Math.PI * 580 * t);
      const f2 = Math.sin(2 * Math.PI * 840 * t);
      d[i] = (f1 * 0.5 + f2 * 0.5) * Math.exp(-t * 25);
    }
    return buf;
  }

  _synthesizeZap(sampleRate, duration) {
    const len = Math.floor(sampleRate * duration);
    const buf = this.audioCtx.createBuffer(1, len, sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const t = i / sampleRate;
      const freq = 1800 * Math.exp(-t * 30);
      d[i] = Math.sin(2 * Math.PI * freq * t) * Math.exp(-t * 15);
    }
    return buf;
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
    panner.connect(getMasterInput());

    source.start(0);

    if (pad.chokeGroup > 0) {
      this.activeNodes[pad.chokeGroup] = source;
    }
  }

  /**
   * Loads a real audio file onto a pad, replacing the synthesized sound.
   *
   * The pad keeps the loaded buffer until the kit is switched, so a kit change
   * is the way back to the built-in sounds.
   *
   * @param {number} index - Pad index, 0-15.
   * @param {ArrayBuffer} arrayBuffer - Raw file bytes (wav, mp3, ogg, flac, aiff).
   * @param {string} [name] - Label for the pad; defaults to the existing one.
   * @returns {Promise<{ok: boolean, error?: string, duration?: number}>}
   */
  async loadSampleToPad(index, arrayBuffer, name) {
    const pad = this.pads[index];
    if (!pad) return { ok: false, error: 'No such pad.' };
    try {
      // decodeAudioData detaches the buffer it is given, so decode a copy —
      // otherwise loading the same file onto a second pad fails.
      const decoded = await this.audioCtx.decodeAudioData(arrayBuffer.slice(0));
      pad.buffer = decoded;
      pad.isUserSample = true;
      if (name) pad.name = name;
      // A one-shot should ring for its natural length rather than being cut
      // off by a decay meant for a synthesized blip.
      pad.decay = Math.max(pad.decay, Math.min(3, decoded.duration));
      return { ok: true, duration: decoded.duration };
    } catch (err) {
      return { ok: false, error: `Could not read that file: ${err.message}` };
    }
  }

  /**
   * Loads a File/Blob (from a drag-drop or file input) onto a pad.
   * @param {number} index - Pad index, 0-15.
   * @param {File|Blob} file
   * @returns {Promise<{ok: boolean, error?: string}>}
   */
  async loadSampleFile(index, file) {
    try {
      const buf = await file.arrayBuffer();
      const name = (file.name || '').replace(/\.[^.]+$/, '').slice(0, 18);
      return await this.loadSampleToPad(index, buf, name || undefined);
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  /**
   * Drops a user sample and restores the pad's built-in sound.
   * @param {number} index - Pad index, 0-15.
   */
  clearPadSample(index) {
    const pad = this.pads[index];
    if (!pad) return;
    const kit = this.kitBuffers[this.currentKit];
    pad.buffer = kit ? kit[index] : null;
    pad.isUserSample = false;
    pad.name = this._getDefaultPadName(index);
  }
}

const samplerEngine = new SamplerEngine();
export default samplerEngine;
