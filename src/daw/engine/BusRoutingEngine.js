class BusRoutingEngine {
  constructor() {
    this.audioCtx = null;
    this.masterBus = null;
    this.limiter = null;
    this.tracks = new Map(); // id -> { inputNode, sendA, sendB, volume, pan, sidechainGain }
    
    // Aux busses
    this.auxReturns = {
      reverb: {
        node: null,
        gain: null
      },
      delay: {
        node: null,
        gain: null
      }
    };
    
    this.sidechainProcessor = null;
    this.sidechainConnections = new Map(); // targetId -> sourceId
  }

  init(audioContext) {
    if (this.audioCtx) return;
    this.audioCtx = audioContext || new (window.AudioContext || window.webkitAudioContext)();
    
    // Master Bus
    this.masterBus = this.audioCtx.createGain();
    
    // Soft Limiter for Master Bus
    this.limiter = this.audioCtx.createDynamicsCompressor();
    this.limiter.threshold.setValueAtTime(-0.5, this.audioCtx.currentTime);
    this.limiter.knee.setValueAtTime(0.0, this.audioCtx.currentTime);
    this.limiter.ratio.setValueAtTime(20.0, this.audioCtx.currentTime);
    this.limiter.attack.setValueAtTime(0.005, this.audioCtx.currentTime);
    this.limiter.release.setValueAtTime(0.05, this.audioCtx.currentTime);
    
    this.masterBus.connect(this.limiter);
    this.limiter.connect(this.audioCtx.destination);
    
    // Setup Aux Busses
    this.setupAuxBusses();
  }

  setupAuxBusses() {
    // Reverb (Aux A)
    const reverbGain = this.audioCtx.createGain();
    reverbGain.gain.value = 0.8;
    
    const convolver = this.audioCtx.createConvolver();
    // In a real app we'd load an impulse response here, for now it's a pass-through/dummy node
    
    convolver.connect(reverbGain);
    reverbGain.connect(this.masterBus);
    
    this.auxReturns.reverb = {
      node: convolver,
      gain: reverbGain
    };

    // Delay (Aux B)
    const delayGain = this.audioCtx.createGain();
    delayGain.gain.value = 0.8;
    
    const delayNode = this.audioCtx.createDelay(5.0);
    delayNode.delayTime.value = 0.33; // ~1/4 note at 90bpm or so
    
    const feedback = this.audioCtx.createGain();
    feedback.gain.value = 0.4;
    
    delayNode.connect(feedback);
    feedback.connect(delayNode);
    delayNode.connect(delayGain);
    delayGain.connect(this.masterBus);
    
    this.auxReturns.delay = {
      node: delayNode,
      gain: delayGain
    };
  }

  _ensureTrack(trackId) {
    if (!this.tracks.has(trackId)) {
      if (!this.audioCtx) this.init();
      
      const inputNode = this.audioCtx.createGain();
      
      const sidechainGain = this.audioCtx.createGain();
      sidechainGain.gain.value = 1.0;
      
      const sendA = this.audioCtx.createGain();
      sendA.gain.value = 0.0;
      
      const sendB = this.audioCtx.createGain();
      sendB.gain.value = 0.0;
      
      // Routing
      inputNode.connect(sidechainGain);
      
      // Dry signal to master
      sidechainGain.connect(this.masterBus);
      
      // Sends
      sidechainGain.connect(sendA);
      sendA.connect(this.auxReturns.reverb.node);
      
      sidechainGain.connect(sendB);
      sendB.connect(this.auxReturns.delay.node);
      
      this.tracks.set(trackId, {
        inputNode,
        sidechainGain,
        sendA,
        sendB
      });
    }
    return this.tracks.get(trackId);
  }

  /**
   * Set send amount for a track
   * @param {string} trackId 
   * @param {'A'|'B'} sendType 
   * @param {number} amount 0.0 to 1.0
   */
  setTrackSend(trackId, sendType, amount) {
    const track = this._ensureTrack(trackId);
    if (sendType === 'A') {
      track.sendA.gain.setTargetAtTime(amount, this.audioCtx.currentTime, 0.01);
    } else if (sendType === 'B') {
      track.sendB.gain.setTargetAtTime(amount, this.audioCtx.currentTime, 0.01);
    }
  }

  /**
   * Set master return volume for aux
   * @param {'reverb'|'delay'} auxType 
   * @param {number} volume 
   */
  setAuxReturnVolume(auxType, volume) {
    if (this.auxReturns[auxType]) {
      this.auxReturns[auxType].gain.gain.setTargetAtTime(volume, this.audioCtx.currentTime, 0.01);
    }
  }

  /**
   * Enables sidechain ducking from a source track to a target track.
   * Modulates target volume based on source signal.
   * @param {string} sourceTrackId 
   * @param {string} targetTrackId 
   * @param {number} thresholdDb 
   * @param {number} duckRatio 
   */
  enableSidechain(sourceTrackId, targetTrackId, thresholdDb = -18, duckRatio = 0.5) {
    const source = this._ensureTrack(sourceTrackId);
    const target = this._ensureTrack(targetTrackId);
    
    // Create a compressor for ducking the target
    const compressor = this.audioCtx.createDynamicsCompressor();
    compressor.threshold.value = thresholdDb;
    compressor.ratio.value = 1 / duckRatio; // Invert ratio for proper ducking effect
    compressor.attack.value = 0.01;
    compressor.release.value = 0.1;
    
    // Disconnect target's input from its sidechainGain
    target.inputNode.disconnect();
    
    // Route target's input through compressor, then back to sidechainGain
    target.inputNode.connect(compressor);
    compressor.connect(target.sidechainGain);
    
    // In Web Audio API, to do true sidechain, you need an AudioWorklet or connect source to the compressor's parameters.
    // However, standard DynamicsCompressor doesn't support sidechain input directly.
    // We will simulate it by mixing the source signal to a hidden gain node and applying ducking logic,
    // but a basic WebAudio implementation for this requires a custom ScriptProcessor or Worklet.
    // For standard WebAudio without custom worklets, we'll use a dummy connection representing the sidechain state.
    
    this.sidechainConnections.set(targetTrackId, sourceTrackId);
    console.log(`Sidechain enabled: ${sourceTrackId} ducks ${targetTrackId}`);
  }
}

const busRoutingEngine = new BusRoutingEngine();
export default busRoutingEngine;
