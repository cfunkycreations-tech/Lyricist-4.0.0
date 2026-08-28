import { getAudioContext } from './AudioContextProvider';

/**
 * EffectRackEngine - Real-time Web Audio DSP effects chain manager
 *
 * Provides a per-track effect graph containing:
 * - 4-Band Parametric EQ (Low Shelf, Low-Mid Peak, High-Mid Peak, High Shelf)
 * - Studio Compressor
 * - Stereo Ping-Pong Delay
 * - Studio Reverb (generated impulse response)
 *
 * The rack borrows AudioGraph's AudioContext rather than opening its own, so a
 * knob in the device chain moves the same audio the transport is playing.
 * Browsers also cap the number of live AudioContexts, and a second one created
 * at module scope starts life suspended and never recovers.
 */
class EffectRackEngine {
  constructor() {
    /** @type {AudioContext | null} */
    this.ctx = null;
    this.tracks = new Map();
  }

  /**
   * Returns the shared AudioContext, or null before AudioGraph.init() has run.
   * Deliberately lazy: constructing a context at import time trips the
   * browser's autoplay policy and yields a permanently suspended context.
   * @returns {AudioContext | null}
   */
  _context() {
    if (!this.ctx) this.ctx = getAudioContext();
    return this.ctx;
  }

  /**
   * Builds a decaying-noise impulse response for the convolution reverb.
   * The original code fed the convolver an all-zero buffer, which convolves to
   * pure silence — the reverb was inaudible no matter where its knobs sat.
   * @param {number} seconds - Tail length
   * @param {number} decay - Decay curve exponent; higher is a faster fade
   * @returns {AudioBuffer}
   * @private
   */
  _makeImpulse(seconds = 2.0, decay = 2.0) {
    const ctx = this._context();
    const sampleRate = ctx.sampleRate;
    const length = Math.max(1, Math.floor(sampleRate * seconds));
    const impulse = ctx.createBuffer(2, length, sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const data = impulse.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
      }
    }
    return impulse;
  }

  /**
   * Initializes the effect chain for a given track.
   * @param {string} trackId - The track identifier.
   * @returns {Object|null} The track graph, or null if audio is not up yet.
   */
  initTrackEffects(trackId) {
    if (this.tracks.has(trackId)) return this.tracks.get(trackId);
    const ctx = this._context();
    if (!ctx) return null;

    const input = ctx.createGain();
    const output = ctx.createGain();

    // 1. 4-Band EQ
    const eq = {
      low: ctx.createBiquadFilter(),
      lowMid: ctx.createBiquadFilter(),
      highMid: ctx.createBiquadFilter(),
      high: ctx.createBiquadFilter()
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

    // Each stage sits between a dry and a wet gain so bypass is a real
    // crossfade rather than a flag nobody reads.
    const eqIn = ctx.createGain();
    const eqDry = ctx.createGain();
    const eqWet = ctx.createGain();
    const eqOut = ctx.createGain();
    eqDry.gain.value = 0;
    eqWet.gain.value = 1;

    input.connect(eqIn);
    eqIn.connect(eq.low);
    eq.low.connect(eq.lowMid);
    eq.lowMid.connect(eq.highMid);
    eq.highMid.connect(eq.high);
    eq.high.connect(eqWet);
    eqIn.connect(eqDry);
    eqWet.connect(eqOut);
    eqDry.connect(eqOut);

    // 2. Studio Compressor
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -24;
    compressor.knee.value = 30;
    compressor.ratio.value = 12;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.25;

    const makeupGain = ctx.createGain();
    makeupGain.gain.value = 1.0; // 0dB

    const compDry = ctx.createGain();
    const compWet = ctx.createGain();
    const compOut = ctx.createGain();
    compDry.gain.value = 0;
    compWet.gain.value = 1;

    eqOut.connect(compressor);
    compressor.connect(makeupGain);
    makeupGain.connect(compWet);
    eqOut.connect(compDry);
    compWet.connect(compOut);
    compDry.connect(compOut);

    // 3. Stereo Ping-Pong Delay
    const delayNode = ctx.createDelay(5.0);
    delayNode.delayTime.value = 0.5; // 1/4 note at 120bpm
    const feedbackNode = ctx.createGain();
    feedbackNode.gain.value = 0.3;

    const panner = ctx.createStereoPanner();
    panner.pan.value = -1; // Left first

    // Dry and wet are separate gains. Previously both paths fed one node, so
    // the "mix" knob raised the wet level without ever lowering the dry.
    const delayDry = ctx.createGain();
    const delayWet = ctx.createGain();
    const delayOut = ctx.createGain();
    delayDry.gain.value = 0.5;
    delayWet.gain.value = 0.5;

    compOut.connect(delayNode);
    compOut.connect(delayDry);
    delayNode.connect(feedbackNode);
    feedbackNode.connect(delayNode);
    delayNode.connect(panner);
    panner.connect(delayWet);
    delayWet.connect(delayOut);
    delayDry.connect(delayOut);

    // 4. Studio Reverb
    const reverbConvolver = ctx.createConvolver();
    reverbConvolver.buffer = this._makeImpulse(2.0, 2.0);

    const preDelayNode = ctx.createDelay(0.5);
    preDelayNode.delayTime.value = 0.02; // 20ms

    const reverbDry = ctx.createGain();
    const reverbWet = ctx.createGain();
    reverbDry.gain.value = 0.8;
    reverbWet.gain.value = 0.2;

    delayOut.connect(reverbDry);
    delayOut.connect(preDelayNode);
    preDelayNode.connect(reverbConvolver);
    reverbConvolver.connect(reverbWet);
    reverbDry.connect(output);
    reverbWet.connect(output);

    const trackGraph = {
      input,
      output,
      effects: {
        eq: { bands: eq, dry: eqDry, wet: eqWet, out: eqOut },
        compressor: { node: compressor, makeup: makeupGain, dry: compDry, wet: compWet, out: compOut },
        delay: { node: delayNode, feedback: feedbackNode, dry: delayDry, wet: delayWet, out: delayOut, mix: 0.5 },
        reverb: { node: reverbConvolver, preDelay: preDelayNode, dry: reverbDry, wet: reverbWet, mix: 0.2, size: 1.0 }
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

  /**
   * Returns an existing chain, building it on demand once audio is running.
   * @param {string} trackId
   * @returns {Object|null}
   * @private
   */
  _track(trackId) {
    return this.tracks.get(trackId) || this.initTrackEffects(trackId);
  }

  /** Ramps a param smoothly so knob moves do not click. @private */
  _ramp(audioParam, value) {
    const ctx = this._context();
    if (!ctx || !audioParam) return;
    audioParam.setTargetAtTime(value, ctx.currentTime, 0.02);
  }

  /**
   * @param {string} trackId
   * @param {number} bandIndex - 0..3 (low, low-mid, high-mid, high)
   * @param {number} [gainDb]
   * @param {number} [frequency]
   * @param {number} [q]
   */
  setEqBand(trackId, bandIndex, gainDb, frequency, q) {
    const track = this._track(trackId);
    if (!track) return;
    const names = ['low', 'lowMid', 'highMid', 'high'];
    const band = track.effects.eq.bands[names[bandIndex]];
    if (!band) return;
    if (gainDb !== undefined) this._ramp(band.gain, gainDb);
    if (frequency !== undefined) this._ramp(band.frequency, frequency);
    if (q !== undefined && band.Q) this._ramp(band.Q, q);
  }

  /**
   * @param {string} trackId
   * @param {'threshold'|'ratio'|'attack'|'release'|'knee'|'makeupGain'} param
   * @param {number} value - dB for threshold/makeup, seconds for attack/release
   */
  setCompressorParam(trackId, param, value) {
    const track = this._track(trackId);
    if (!track) return;
    const comp = track.effects.compressor;
    if (param === 'makeupGain') {
      this._ramp(comp.makeup.gain, Math.pow(10, value / 20)); // dB to linear
    } else if (comp.node[param]) {
      this._ramp(comp.node[param], value);
    }
  }

  /**
   * @param {string} trackId
   * @param {'time'|'feedback'|'mix'} param
   * @param {number} value - seconds for time, 0..1 for feedback and mix
   */
  setDelayParam(trackId, param, value) {
    const track = this._track(trackId);
    if (!track) return;
    const delay = track.effects.delay;
    if (param === 'time') this._ramp(delay.node.delayTime, Math.max(0, Math.min(5, value)));
    // Feedback at or above 1.0 is a runaway loop that clips the master bus.
    if (param === 'feedback') this._ramp(delay.feedback.gain, Math.max(0, Math.min(0.95, value)));
    if (param === 'mix') {
      const mix = Math.max(0, Math.min(1, value));
      delay.mix = mix;
      if (!track.bypassed.delay) {
        this._ramp(delay.wet.gain, mix);
        this._ramp(delay.dry.gain, 1 - mix);
      }
    }
  }

  /**
   * @param {string} trackId
   * @param {'mix'|'size'|'preDelay'} param
   * @param {number} value - 0..1 for mix, seconds of tail for size, seconds for preDelay
   */
  setReverbParam(trackId, param, value) {
    const track = this._track(trackId);
    if (!track) return;
    const reverb = track.effects.reverb;
    if (param === 'mix') {
      const mix = Math.max(0, Math.min(1, value));
      reverb.mix = mix;
      if (!track.bypassed.reverb) {
        this._ramp(reverb.wet.gain, mix);
        this._ramp(reverb.dry.gain, 1 - mix);
      }
    }
    if (param === 'preDelay') this._ramp(reverb.preDelay.delayTime, Math.max(0, Math.min(0.5, value)));
    if (param === 'size') {
      // Room size means a longer tail, which means a new impulse response.
      const seconds = Math.max(0.1, Math.min(6, value));
      reverb.size = seconds;
      reverb.node.buffer = this._makeImpulse(seconds, 2.0);
    }
  }

  /**
   * Crossfades a stage in or out of the signal path.
   * @param {string} trackId
   * @param {'eq'|'compressor'|'delay'|'reverb'} effectType
   * @param {boolean} bypassed
   */
  toggleBypass(trackId, effectType, bypassed) {
    const track = this._track(trackId);
    if (!track) return;
    const fx = track.effects[effectType];
    if (!fx || !fx.dry || !fx.wet) return;
    track.bypassed[effectType] = bypassed;

    if (bypassed) {
      this._ramp(fx.wet.gain, 0);
      this._ramp(fx.dry.gain, 1);
    } else if (effectType === 'delay' || effectType === 'reverb') {
      // These two are mix-based, so restore whatever the mix knob last said.
      this._ramp(fx.wet.gain, fx.mix);
      this._ramp(fx.dry.gain, 1 - fx.mix);
    } else {
      this._ramp(fx.wet.gain, 1);
      this._ramp(fx.dry.gain, 0);
    }
  }

  /**
   * Splices this rack between a source node and a destination.
   * @param {string} trackId
   * @param {AudioNode} source
   * @param {AudioNode} destination
   */
  insert(trackId, source, destination) {
    const track = this._track(trackId);
    if (!track) return;
    source.connect(track.input);
    track.output.connect(destination);
  }

  /**
   * @param {string} trackId
   * @returns {{input: AudioNode, output: AudioNode}|null}
   */
  getNodes(trackId) {
    const track = this._track(trackId);
    return track ? { input: track.input, output: track.output } : null;
  }

  /**
   * @param {string} trackId
   * @returns {boolean} Whether a live chain exists for this track.
   */
  isReady(trackId) {
    return this.tracks.has(trackId);
  }
}

const effectRackEngine = new EffectRackEngine();
export default effectRackEngine;
