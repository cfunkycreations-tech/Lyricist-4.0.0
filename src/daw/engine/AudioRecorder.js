/**
 * @file AudioRecorder.js
 * @description Real-time Web Audio microphone recording engine for Lyricist Pro.
 */

class AudioRecorder {
  constructor() {
    this.audioContext = null;
    this.mediaStream = null;
    this.mediaRecorder = null;
    this.analyser = null;
    this.source = null;
    this.chunks = [];
    this.recording = false;
    this.startTime = 0;
    this.animationFrame = null;
    this.onPeakCallback = null;
  }

  /**
   * Initializes the audio context and requests microphone permissions.
   * @returns {Promise<void>}
   */
  async init() {
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      
      this.source = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.source.connect(this.analyser);
      
      // We do not connect analyser to destination to avoid feedback
    } catch (err) {
      console.error('AudioRecorder init error:', err);
      throw err;
    }
  }

  /**
   * Begins recording from the microphone.
   * @param {string} trackId - The ID of the track being recorded to.
   * @param {Function} [onPeak] - Callback that receives peak level (0.0 to 1.0).
   */
  startRecording(trackId, onPeak) {
    if (!this.mediaStream) {
      console.warn('AudioRecorder not initialized. Call init() first.');
      return;
    }

    this.onPeakCallback = onPeak;
    this.chunks = [];
    this.mediaRecorder = new MediaRecorder(this.mediaStream);
    
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        this.chunks.push(e.data);
      }
    };

    this.mediaRecorder.start(100); // collect 100ms chunks of data
    this.recording = true;
    this.startTime = this.audioContext.currentTime;

    this.loopPeak();
  }

  loopPeak() {
    if (!this.recording) return;

    if (this.onPeakCallback && this.analyser) {
      const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
      this.analyser.getByteTimeDomainData(dataArray);
      
      let max = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const val = Math.abs(dataArray[i] - 128);
        if (val > max) max = val;
      }
      
      // Normalize to 0.0 - 1.0
      const peakLevel = max / 128.0;
      this.onPeakCallback(peakLevel);
    }

    this.animationFrame = requestAnimationFrame(() => this.loopPeak());
  }

  /**
   * Stops recording and returns the audio data.
   * @returns {Promise<{audioBuffer: AudioBuffer, duration: number, pcmData: Float32Array, blob: Blob}>}
   */
  stopRecording() {
    return new Promise((resolve) => {
      if (!this.recording || !this.mediaRecorder) {
        resolve(null);
        return;
      }

      this.recording = false;
      if (this.animationFrame) {
        cancelAnimationFrame(this.animationFrame);
      }
      this.onPeakCallback = null;

      this.mediaRecorder.onstop = async () => {
        const blob = new Blob(this.chunks, { type: 'audio/webm;codecs=opus' });
        const arrayBuffer = await blob.arrayBuffer();
        
        let audioBuffer;
        try {
          audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
        } catch (e) {
          console.error("Error decoding recorded audio", e);
          resolve(null);
          return;
        }

        const duration = audioBuffer.duration;
        const pcmData = audioBuffer.getChannelData(0);

        resolve({ audioBuffer, duration, pcmData, blob });
      };

      this.mediaRecorder.stop();
    });
  }

  /**
   * Returns whether recording is active.
   * @returns {boolean}
   */
  isRecording() {
    return this.recording;
  }
}

const audioRecorder = new AudioRecorder();
export default audioRecorder;
