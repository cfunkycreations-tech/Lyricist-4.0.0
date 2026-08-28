import { getAudioContext, getMasterInput } from './AudioContextProvider';
/**
 * Audio Metronome Engine for Lyricist 4.2.0 Pro
 * Web Audio sample-accurate click engine.
 */

class MetronomeEngine {
  constructor() {
    this.audioContext = null;
    this.isPlaying = false;
    
    // Config
    this.bpm = 120;
    this.volume = 0.8;
    this.muted = false;
    this.preset = 'Classic Beep'; // 'Classic Beep', 'MPC Click', 'Woodblock', 'Cowbell', 'Rimshot'
    this.preRoll = 0; // 0, 1 (1 Bar), 2 (2 Bars)
    
    // Scheduling
    this.nextNoteTime = 0.0;
    this.current16thNote = 0;
    this.scheduleAheadTime = 0.1; // seconds
    this.lookahead = 25.0; // ms
    this.timerID = null;
    this.beatsPerBar = 4;
  }

  init(context = null) {
    if (!this.audioContext) {
      this.audioContext = context || getAudioContext();
    }
  }

  setBpm(bpm) {
    this.bpm = bpm;
  }

  setVolume(vol) {
    this.volume = Math.max(0, Math.min(1, vol));
  }

  setMuted(muted) {
    this.muted = muted;
  }

  setPreset(preset) {
    this.preset = preset;
  }

  setPreRoll(bars) {
    this.preRoll = bars;
  }

  nextNote() {
    const secondsPerBeat = 60.0 / this.bpm;
    this.nextNoteTime += secondsPerBeat;
    this.current16thNote++;
    if (this.current16thNote === this.beatsPerBar) {
      this.current16thNote = 0;
    }
  }

  playClick(time, isDownbeat) {
    if (this.muted || this.volume === 0) return;

    // A simple synthesized click for all presets since we don't have sample files
    const osc = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();

    osc.connect(gainNode);
    gainNode.connect(getMasterInput());

    if (this.preset === 'Classic Beep') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(isDownbeat ? 1200 : 800, time);
      gainNode.gain.setValueAtTime(this.volume, time);
      gainNode.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
      osc.start(time);
      osc.stop(time + 0.05);
    } else {
      // Fallback for other presets
      osc.type = 'sine';
      osc.frequency.setValueAtTime(isDownbeat ? 1000 : 600, time);
      gainNode.gain.setValueAtTime(this.volume, time);
      gainNode.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
      osc.start(time);
      osc.stop(time + 0.1);
    }
  }

  scheduleNote(beatNumber, time) {
    const isDownbeat = (beatNumber === 0);
    this.playClick(time, isDownbeat);
  }

  scheduler() {
    while (this.nextNoteTime < this.audioContext.currentTime + this.scheduleAheadTime) {
      this.scheduleNote(this.current16thNote, this.nextNoteTime);
      this.nextNote();
    }
    this.timerID = setTimeout(() => this.scheduler(), this.lookahead);
  }

  start() {
    if (this.isPlaying) return;
    this.init();
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
    this.isPlaying = true;
    this.current16thNote = 0;
    this.nextNoteTime = this.audioContext.currentTime + 0.05;
    this.scheduler();
  }

  stop() {
    this.isPlaying = false;
    clearTimeout(this.timerID);
  }
}

const metronomeEngine = new MetronomeEngine();
export default metronomeEngine;
