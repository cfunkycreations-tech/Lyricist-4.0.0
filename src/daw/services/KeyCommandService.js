/**
 * Global keyboard shortcuts listener for Lyricist 4.2.0 Pro.
 * Ignores transport controls when user is typing in inputs.
 */
export class KeyCommandService {
  constructor() {
    this.callbacks = {};
    this._handleKeyDown = this._handleKeyDown.bind(this);
  }

  /**
   * Initializes the event listeners.
   * @param {Object} callbacks - Map of action names to functions.
   */
  init(callbacks = {}) {
    this.callbacks = callbacks;
    window.addEventListener('keydown', this._handleKeyDown);
  }

  /**
   * Cleans up event listeners.
   */
  destroy() {
    window.removeEventListener('keydown', this._handleKeyDown);
    this.callbacks = {};
  }

  _isInputActive(target) {
    if (!target) return false;
    const tagName = target.tagName.toLowerCase();
    const isInputOrTextArea = tagName === 'input' || tagName === 'textarea';
    const isContentEditable = target.isContentEditable;
    return isInputOrTextArea || isContentEditable;
  }

  _handleKeyDown(event) {
    if (this._isInputActive(event.target)) {
      if (event.key === 'Escape') {
        if (this.callbacks.closeModals) {
          event.preventDefault();
          this.callbacks.closeModals();
        }
      }
      return; // Ignore other transport shortcuts
    }

    let handled = false;

    switch (event.key) {
      case ' ':
        if (this.callbacks.togglePlay) {
          this.callbacks.togglePlay();
          handled = true;
        }
        break;
      case 'r':
      case 'R':
        if (this.callbacks.toggleRecord) {
          this.callbacks.toggleRecord();
          handled = true;
        }
        break;
      case 'Home':
      case '1':
        if (this.callbacks.setPlayhead) {
          this.callbacks.setPlayhead(0);
          handled = true;
        }
        break;
      case 'Tab':
        if (this.callbacks.cycleViewMode) {
          this.callbacks.cycleViewMode();
          handled = true;
        }
        break;
      case 'm':
      case 'M':
        if (this.callbacks.toggleMuteSelectedTrack) {
          this.callbacks.toggleMuteSelectedTrack();
          handled = true;
        }
        break;
      case 's':
      case 'S':
        if (this.callbacks.toggleSoloSelectedTrack) {
          this.callbacks.toggleSoloSelectedTrack();
          handled = true;
        }
        break;
      case 'Escape':
        if (this.callbacks.closeModals) {
          this.callbacks.closeModals();
          handled = true;
        }
        break;
    }

    if (handled) {
      event.preventDefault();
    }
  }
}

const keyCommandService = new KeyCommandService();
export default keyCommandService;

