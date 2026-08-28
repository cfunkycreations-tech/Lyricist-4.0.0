import { getAudioContext, getMasterInput } from './AudioContextProvider';
/**
 * 4-Channel Web Audio Live Loop Buffer Engine for Lyricist 4.2.0 Pro.
 */
export class LooperEngine {
  constructor() {
    this.audioContext = getAudioContext();
    
    this.channels = Array.from({ length: 4 }, (_, i) => ({
      id: i + 1,
      state: 'empty', // 'empty' | 'recording' | 'playing' | 'overdubbing' | 'stopped'
      buffer: null,
      level: 8, // 0-10
      pan: 0, // -1 to 1
      reverse: false,
      halfSpeed: false,
      sourceNode: null,
      gainNode: this.audioContext.createGain(),
      panNode: this.audioContext.createStereoPanner ? this.audioContext.createStereoPanner() : null
    }));

    this.channels.forEach(ch => {
      if (ch.panNode) {
        ch.gainNode.connect(ch.panNode);
        ch.panNode.connect(getMasterInput());
      } else {
        ch.gainNode.connect(getMasterInput());
      }
      this._updateChannelMixing(ch);
    });
  }

  _updateChannelMixing(channel) {
    channel.gainNode.gain.value = channel.level / 10;
    if (channel.panNode) {
      channel.panNode.pan.value = channel.pan;
    }
  }

  /**
   * Starts recording on a channel.
   * @param {number} channelIndex - Index 0-3.
   */
  startRecord(channelIndex) {
    const ch = this.channels[channelIndex];
    if (ch) {
      ch.state = 'recording';
      // Implement media stream recording logic here
    }
  }

  /**
   * Stops recording on a channel.
   * @param {number} channelIndex - Index 0-3.
   */
  stopRecord(channelIndex) {
    const ch = this.channels[channelIndex];
    if (ch && ch.state === 'recording') {
      ch.state = 'stopped';
      // Process recorded blob to buffer logic would go here
    }
  }

  /**
   * Starts overdubbing on a channel.
   * @param {number} channelIndex - Index 0-3.
   */
  startOverdub(channelIndex) {
    const ch = this.channels[channelIndex];
    if (ch && ch.buffer) {
      ch.state = 'overdubbing';
      // Mix incoming stream with existing buffer logic would go here
    }
  }

  /**
   * Toggles playback of a channel.
   * @param {number} channelIndex - Index 0-3.
   */
  togglePlay(channelIndex) {
    const ch = this.channels[channelIndex];
    if (!ch || !ch.buffer) return;

    if (ch.state === 'playing') {
      ch.state = 'stopped';
      if (ch.sourceNode) {
        ch.sourceNode.stop();
        ch.sourceNode.disconnect();
        ch.sourceNode = null;
      }
    } else {
      ch.state = 'playing';
      ch.sourceNode = this.audioContext.createBufferSource();
      ch.sourceNode.buffer = ch.buffer;
      ch.sourceNode.loop = true;
      ch.sourceNode.playbackRate.value = (ch.halfSpeed ? 0.5 : 1.0) * (ch.reverse ? -1 : 1);
      
      // Native WebAudio cannot do negative playbackRate. Reversing buffer array manually.
      if (ch.reverse) {
        for (let i = 0; i < ch.sourceNode.buffer.numberOfChannels; i++) {
          Array.prototype.reverse.call(ch.sourceNode.buffer.getChannelData(i));
        }
      }

      ch.sourceNode.connect(ch.gainNode);
      ch.sourceNode.start();
    }
  }

  /**
   * Clears a channel's buffer.
   * @param {number} channelIndex - Index 0-3.
   */
  clearChannel(channelIndex) {
    const ch = this.channels[channelIndex];
    if (ch) {
      if (ch.sourceNode) {
        ch.sourceNode.stop();
        ch.sourceNode.disconnect();
        ch.sourceNode = null;
      }
      ch.buffer = null;
      ch.state = 'empty';
    }
  }

  /**
   * Toggles reverse playback for a channel.
   * @param {number} channelIndex - Index 0-3.
   */
  toggleReverse(channelIndex) {
    const ch = this.channels[channelIndex];
    if (ch) {
      ch.reverse = !ch.reverse;
      // Re-trigger play to apply reverse if playing
      if (ch.state === 'playing') {
        this.togglePlay(channelIndex); // Stop
        this.togglePlay(channelIndex); // Start with reverse
      }
    }
  }

  /**
   * Toggles half-speed playback for a channel.
   * @param {number} channelIndex - Index 0-3.
   */
  toggleHalfSpeed(channelIndex) {
    const ch = this.channels[channelIndex];
    if (ch) {
      ch.halfSpeed = !ch.halfSpeed;
      if (ch.sourceNode) {
        ch.sourceNode.playbackRate.value = (ch.halfSpeed ? 0.5 : 1.0);
      }
    }
  }

  /**
   * Generates a demo synthesized loop buffer.
   * @param {number} channelIndex - Index 0-3.
   * @param {string} genre - e.g., 'drums', 'bassline', 'guitar', 'synth'.
   */
  generateDemoLoop(channelIndex, genre) {
    const ch = this.channels[channelIndex];
    if (!ch) return;
    
    // Generate 2 seconds of noise/tones to act as demo loop
    const length = this.audioContext.sampleRate * 2.0; 
    const buffer = this.audioContext.createBuffer(2, length, this.audioContext.sampleRate);
    
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        const t = i / this.audioContext.sampleRate;
        if (genre === 'drums') {
          // White noise bursts
          data[i] = (Math.random() * 2 - 1) * Math.exp(-t * 10);
        } else if (genre === 'bassline') {
          // Low sine wave
          data[i] = Math.sin(2 * Math.PI * 55 * t) * 0.8;
        } else {
          // Basic saw
          data[i] = (t * 440 % 1) * 2 - 1; 
        }
      }
    }
    
    ch.buffer = buffer;
    ch.state = 'stopped';
  }
}

const looperEngine = new LooperEngine();
export default looperEngine;

