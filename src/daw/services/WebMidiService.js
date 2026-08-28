import midiSynth from '../engine/MidiSynth';

/**
 * WebMidiService
 * Real-time Web MIDI hardware controller manager.
 */
class WebMidiService {
  constructor() {
    this.midiAccess = null;
    this.inputs = [];
    this.outputs = [];
    this.connectedDeviceCount = 0;
    this.deviceNames = [];
    this.listeners = new Set();
    this.activityTimeout = null;
  }

  /**
   * Initializes the Web MIDI service.
   * @returns {Promise<void>}
   */
  async init() {
    if (!navigator.requestMIDIAccess) {
      console.warn('Web MIDI API is not supported in this browser.');
      return;
    }

    try {
      this.midiAccess = await navigator.requestMIDIAccess({ sysex: false });
      this.midiAccess.onstatechange = this.onStateChange.bind(this);
      this.updateDevices();
    } catch (err) {
      console.error('Failed to get MIDI access', err);
    }
  }

  onStateChange(event) {
    this.updateDevices();
  }

  updateDevices() {
    if (!this.midiAccess) return;
    
    this.inputs = Array.from(this.midiAccess.inputs.values());
    this.outputs = Array.from(this.midiAccess.outputs.values());
    
    this.connectedDeviceCount = this.inputs.length;
    this.deviceNames = this.inputs.map(input => input.name);

    this.inputs.forEach(input => {
      input.onmidimessage = this.onMidiMessage.bind(this);
    });

    this.emit('device-change', {
      count: this.connectedDeviceCount,
      names: this.deviceNames
    });
  }

  onMidiMessage(message) {
    const [command, note, velocity] = message.data;
    
    // Emit generic activity event
    this.emit('midi-activity');

    // Note On
    if (command === 144 && velocity > 0) {
      midiSynth.noteOn(note, velocity);
      this.emit('midi-note-on', { note, velocity });
    }
    // Note Off (or Note On with 0 velocity)
    else if (command === 128 || (command === 144 && velocity === 0)) {
      midiSynth.noteOff(note);
      this.emit('midi-note-off', { note });
    }
  }

  addEventListener(callback) {
    this.listeners.add(callback);
  }

  removeEventListener(callback) {
    this.listeners.delete(callback);
  }

  emit(type, payload = {}) {
    this.listeners.forEach(callback => callback({ type, ...payload }));
  }
}

const webMidiService = new WebMidiService();
export default webMidiService;
