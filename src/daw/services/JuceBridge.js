/**
 * Native JUCE Engine Bridge
 * 
 * Frontend communication client for the native JUCE C++ engine (LyricistEngine.exe).
 * It sends commands to the backend via IPC and handles responses.
 * Includes graceful fallback data if running in browser or if the native JUCE executable is not spawned.
 */

class JuceBridge {
  constructor() {
    this.isNative = !!(window.electronAPI && window.electronAPI.sendJuceCommand);
    this.engineReady = false;
    
    // Listen for messages from the engine if running natively
    if (this.isNative && window.electronAPI.onJuceMessage) {
      window.electronAPI.onJuceMessage((msg) => {
        this._handleEngineMessage(msg);
      });
    }
    
    this.pendingRequests = new Map();
    this.reqId = 0;
  }

  _handleEngineMessage(msg) {
    if (msg.reqId && this.pendingRequests.has(msg.reqId)) {
      const { resolve, reject } = this.pendingRequests.get(msg.reqId);
      this.pendingRequests.delete(msg.reqId);
      
      if (msg.error) {
        reject(new Error(msg.error));
      } else {
        resolve(msg);
      }
    }
  }

  async _sendCommand(cmd, payload = {}) {
    if (!this.isNative) {
      return this._mockResponse(cmd, payload);
    }
    
    return new Promise((resolve, reject) => {
      const id = ++this.reqId;
      this.pendingRequests.set(id, { resolve, reject });
      
      try {
        window.electronAPI.sendJuceCommand({ cmd, reqId: id, ...payload });
      } catch (err) {
        this.pendingRequests.delete(id);
        reject(err);
      }
    });
  }

  _mockResponse(cmd, payload) {
    // Graceful fallback for browser or missing executable
    switch (cmd) {
      case 'asio.enumerate':
        return Promise.resolve({ devices: ['Web Audio Default', 'Web Audio Fallback'] });
      case 'asio.open':
        return Promise.resolve({ success: true, message: 'Opened mocked audio driver' });
      case 'asio.close':
        return Promise.resolve({ success: true, message: 'Closed mocked audio driver' });
      case 'asio.status':
        return Promise.resolve({ status: 'running', driver: 'Web Audio Default' });
      case 'vst3.scan':
        return Promise.resolve({ scannedCount: 3 });
      case 'vst3.list':
        return Promise.resolve({ plugins: [
          { uid: 'mock-uid-1', name: 'Mock EQ', vendor: 'MockVendor' },
          { uid: 'mock-uid-2', name: 'Mock Reverb', vendor: 'MockVendor' }
        ]});
      case 'vst3.validate':
        return Promise.resolve({ valid: true, uid: payload.uid });
      case 'engine.ping':
        return Promise.resolve({ pong: true, status: 'Mock Engine Active' });
      default:
        return Promise.resolve({ error: `Command ${cmd} not supported in mock mode` });
    }
  }

  /**
   * Enumerate ASIO drivers or fall back to Web Audio devices
   * @returns {Promise<{devices: string[]}>}
   */
  async enumerateAsioDrivers() {
    return this._sendCommand('asio.enumerate');
  }

  /**
   * Open an ASIO driver with specific settings
   * @param {string} name 
   * @param {number} sampleRate 
   * @param {number} bufferSize 
   * @returns {Promise<{success: boolean, message?: string}>}
   */
  async openAsioDriver(name, sampleRate, bufferSize) {
    return this._sendCommand('asio.open', { name, sampleRate, bufferSize });
  }

  /**
   * Close the currently open ASIO driver
   * @returns {Promise<{success: boolean}>}
   */
  async closeAsioDriver() {
    return this._sendCommand('asio.close');
  }

  /**
   * Get the status of the ASIO driver
   * @returns {Promise<{status: string, driver?: string}>}
   */
  async getAsioStatus() {
    return this._sendCommand('asio.status');
  }

  /**
   * Scan for VST3 plugins in the given paths
   * @param {string[]} paths 
   * @returns {Promise<{scannedCount: number}>}
   */
  async scanVst3Plugins(paths = ['C:\\Program Files\\Common Files\\VST3', 'C:\\Program Files (x86)\\Common Files\\VST3']) {
    return this._sendCommand('vst3.scan', { paths });
  }

  /**
   * List all scanned VST3 plugins
   * @returns {Promise<{plugins: Array<{uid: string, name: string, vendor: string}>}>}
   */
  async listVst3Plugins() {
    return this._sendCommand('vst3.list');
  }

  /**
   * Validate a specific VST3 plugin
   * @param {string} uid 
   * @returns {Promise<{valid: boolean, uid: string}>}
   */
  async validateVst3Plugin(uid) {
    return this._sendCommand('vst3.validate', { uid });
  }

  /**
   * Ping the engine to check if it's responsive
   * @returns {Promise<{pong: boolean, status: string}>}
   */
  async pingEngine() {
    return this._sendCommand('engine.ping');
  }
}

export default new JuceBridge();
