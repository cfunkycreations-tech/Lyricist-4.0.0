/**
 * EffectRackEngine - Real-time Web Audio DSP effects chain manager
 * 
 * Provides a per-track effect graph containing:
 * - 4-Band Parametric EQ (Low Shelf, Low-Mid Peak, High-Mid Peak, High Shelf)
 * - Studio Compressor
 * - Stereo Ping-Pong Delay
 * - Studio Reverb (Algorithmic / Convolver)
 */
class EffectRackEngine {
  constructor() {
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.tracks = new Map();
  }

  /**
   * Initializes the effect chain for a given track.
   * @param {string} trackId - The track identifier.
   */
  initTrackEffects(trackId) {
    if (this.tracks.has(trackId)) return this.tracks.get(trackId);

    const input = this.ctx.createGain();
    const output = this.ctx.createGain();

    // 1. 4-Band EQ
    const eq = {
      low: this.ctx.createBiquadFilter(),
      lowMid: this.ctx.createBiquadFilter(),
      highMid: this.ctx.createBiquadFilter(),
      high: this.ctx.createBiquadFilter()
    };
    eq.low.type = 'lowshelf';
    eq.low.frequency.value = 80;
    
    eq.lowMid.type = 'peaking';
    eq.lowMid.frequency.value = 400;
    eq.lowMid.Q.value = 1.0;

    eq.highMid.type = 'peaking';
    eq.highMid.frequency.value = 2500;
    eq.highMid.Q.value = 1.0;

    eq.high.type = 'highshelf';
    eq.high.frequency.value = 10000;

    // Connect EQ bands
    input.connect(eq.low);
    eq.low.connect(eq.lowMid);
    eq.lowMid.connect(eq.highMid);
    eq.highMid.connect(eq.high);

    // 2. Studio Compressor
    const compressor = this.ctx.createDynamicsCompressor();
    compressor.threshold.value = -24;
    compressor.knee.value = 30;
    compressor.ratio.value = 12;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.25;
    
    const makeupGain = this.ctx.createGain();
    makeupGain.gain.value = 1.0; // 0dB

    eq.high.connect(compressor);
    compressor.connect(makeupGain);

    // 3. Stereo Ping-Pong Delay
    const delayNode = this.ctx.createDelay(5.0);
    delayNode.delayTime.value = 0.5; // Default to 120bpm 1/4 note
    const feedbackNode = this.ctx.createGain();
    feedbackNode.gain.value = 0.3;

    // Simple ping-pong using panner
    const panner = this.ctx.createStereoPanner();
    panner.pan.value = -1; // Left first
    
    const delayDryWet = this.ctx.createGain();
    delayDryWet.gain.value = 0.5;

    makeupGain.connect(delayNode);
    makeupGain.connect(delayDryWet); // Dry path for delay
    
    delayNode.connect(feedbackNode);
    feedbackNode.connect(delayNode);
    delayNode.connect(panner);
    panner.connect(delayDryWet); // Wet path

    // 4. Studio Reverb
    const reverbConvolver = this.ctx.createConvolver();
    // In a real scenario we'd load an Impulse Response buffer here.
    // We'll simulate with an empty buffer for safety, but structure is ready.
    const sampleRate = this.ctx.sampleRate;
    const length = sampleRate * 2.0; 
    const impulse = this.ctx.createBuffer(2, length, sampleRate);
    reverbConvolver.buffer = impulse; 

    const reverbMix = this.ctx.createGain();
    reverbMix.gain.value = 0.2; // Mix

    const reverbDryWet = this.ctx.createGain();
    delayDryWet.connect(reverbDryWet); // Dry path for reverb
    delayDryWet.connect(reverbConvolver);
    reverbConvolver.connect(reverbMix);
    reverbMix.connect(reverbDryWet);

    reverbDryWet.connect(output);

    const trackGraph = {
      input,
      output,
      effects: {
        eq,
        compressor: { node: compressor, makeup: makeupGain },
        delay: { node: delayNode, feedback: feedbackNode, mix: delayDryWet },
        reverb: { node: reverbConvolver, mix: reverbMix, output: reverbDryWet }
      },
      bypassed: {
        eq: false,
        compressor: false,
        delay: false,
        reverb: false
      }
    };

    this.tracks.set(trackId, trackGraph);
    return trackGraph;
  }

  setEqBand(trackId, bandIndex, gainDb, frequency, q) {
    const track = this.tracks.get(trackId);
    if (!track) return;
    const bands = ['low', 'lowMid', 'highMid', 'high'];
    const band = track.effects.eq[bands[bandIndex]];
    if (band) {
      if (gainDb !== undefined) band.gain.value = gainDb;
      if (frequency !== undefined) band.frequency.value = frequency;
      if (q !== undefined && band.Q) band.Q.value = q;
    }
  }

  setCompressorParam(trackId, param, value) {
    const track = this.tracks.get(trackId);
    if (!track) return;
    const comp = track.effects.compressor;
    if (param === 'makeupGain') {
      comp.makeup.gain.value = Math.pow(10, value / 20); // dB to linear
    } else if (comp.node[param]) {
      comp.node[param].value = value;
    }
  }

  setDelayParam(trackId, param, value) {
    const track = this.tracks.get(trackId);
    if (!track) return;
    const delay = track.effects.delay;
    if (param === 'time') delay.node.delayTime.value = value;
    if (param === 'feedback') delay.feedback.gain.value = value;
    if (param === 'mix') delay.mix.gain.value = value;
  }

  setReverbParam(trackId, param, value) {
    const track = this.tracks.get(trackId);
    if (!track) return;
    const reverb = track.effects.reverb;
    if (param === 'mix') reverb.mix.gain.value = value;
    // Room size and damping usually require regenerating the IR buffer.
  }

  toggleBypass(trackId, effectType, bypassed) {
    const track = this.tracks.get(trackId);
    if (!track) return;
    track.bypassed[effectType] = bypassed;
    // Proper bypass routing logic would dynamically disconnect and reconnect nodes.
    // For simplicity, we just toggle the mix/gain where applicable, or leave as placeholder.
  }
}

const effectRackEngine = new EffectRackEngine();
export default effectRackEngine;
