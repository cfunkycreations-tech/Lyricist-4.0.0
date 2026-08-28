/**
 * @file VoiceControlService.js
 * @description Hands-free Web Speech API wrapper for Ghost Pilot voice control.
 */
import ghostPilotDAWBridge from './GhostPilotDAWBridge';

class VoiceControlService {
  constructor() {
    this.recognition = null;
    this.listening = false;
    
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = false;
      this.recognition.interimResults = false;
      this.recognition.lang = 'en-US';
      
      this.recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        if (this.onTranscriptCallback) {
          this.onTranscriptCallback(transcript);
        }
        // Dispatch to Ghost Pilot bridge
        ghostPilotDAWBridge.processCommand(transcript);
      };
      
      this.recognition.onstart = () => {
        this.listening = true;
        if (this.onStatusChangeCallback) this.onStatusChangeCallback(true);
      };
      
      this.recognition.onend = () => {
        this.listening = false;
        if (this.onStatusChangeCallback) this.onStatusChangeCallback(false);
      };
      
      this.recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        this.listening = false;
        if (this.onStatusChangeCallback) this.onStatusChangeCallback(false);
      };
    }
  }

  isSupported() {
    return this.recognition !== null;
  }

  isListening() {
    return this.listening;
  }

  startListening(onTranscript, onStatusChange) {
    if (!this.isSupported()) return;
    this.onTranscriptCallback = onTranscript;
    this.onStatusChangeCallback = onStatusChange;
    
    if (!this.listening) {
      try {
        this.recognition.start();
      } catch (err) {
        console.error('Error starting speech recognition:', err);
      }
    }
  }

  stopListening() {
    if (!this.isSupported()) return;
    if (this.listening) {
      this.recognition.stop();
    }
  }
}

const voiceControlService = new VoiceControlService();
export default voiceControlService;
