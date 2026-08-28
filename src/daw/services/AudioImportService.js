import { getAudioContext, getMasterInput } from '../engine/AudioContextProvider';
/**
 * AudioImportService
 * Handles importing multi-track audio files, decoding audio data, and generating waveform peaks.
 */
class AudioImportService {
  constructor() {
    // Only initialize AudioContext when needed to respect browser autoplay policies,
    // but caching it here once created.
    this.audioContext = null;
    this.supportedExtensions = ['.wav', '.mp3', '.ogg', '.flac', '.m4a', '.aac'];
    this.colors = [
      'var(--gm-led-white)',
      'var(--gm-led-amber)',
      'var(--gm-led-crimson)',
      'var(--gm-accent-blue)',
      '#50E3C2',
      '#B8E986'
    ];
    this.colorIndex = 0;
  }

  getAudioContext() {
    if (!this.audioContext) {
      this.audioContext = getAudioContext();
    }
    return this.audioContext;
  }

  /**
   * Checks if a file is a supported audio format.
   * @param {File} file 
   * @returns {boolean}
   */
  isSupportedFile(file) {
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    return this.supportedExtensions.includes(ext);
  }

  /**
   * Generates a dynamic color for imported tracks.
   * @returns {string} Hex or CSS variable color
   */
  getNextColor() {
    const color = this.colors[this.colorIndex % this.colors.length];
    this.colorIndex++;
    return color;
  }

  /**
   * Imports an array of files, decodes them, and formats them into track objects.
   * @param {File[]} files - Array of File objects (e.g. from drag-and-drop)
   * @param {number} playhead - Current playhead position (in bars)
   * @param {number} bpm - Current project BPM (for length calculation)
   * @returns {Promise<Object[]>} - Array of formatted track objects ready for DAWContext.addTrack()
   */
  async importFiles(files, playhead = 0, bpm = 120) {
    const validFiles = Array.from(files).filter(file => this.isSupportedFile(file));
    const importedTracks = [];
    const ctx = this.getAudioContext();

    for (const file of validFiles) {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
        
        const track = this.formatTrack(file, audioBuffer, playhead, bpm);
        importedTracks.push(track);
      } catch (error) {
        console.error(`Failed to decode audio file ${file.name}:`, error);
      }
    }

    return importedTracks;
  }

  /**
   * Formats the decoded audio data into a track object for the DAW.
   * @param {File} file 
   * @param {AudioBuffer} buffer 
   * @param {number} playhead 
   * @param {number} bpm 
   * @returns {Object}
   */
  formatTrack(file, buffer, playhead, bpm) {
    const durationSeconds = buffer.duration;
    // Calculate length in bars (assuming 4/4 time signature)
    const beats = (durationSeconds / 60) * bpm;
    const bars = beats / 4;

    const pcmPeaks = this.generateWaveformPeaks(buffer, bars, 32);
    
    // Auto-generate name by removing extension
    const name = file.name.replace(/\.[^/.]+$/, "");

    return {
      name,
      type: 'audio',
      color: this.getNextColor(),
      clips: [
        {
          id: `clip-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          name,
          start: playhead,
          length: bars,
          buffer,
          pcmPeaks
        }
      ]
    };
  }

  /**
   * Generates visual waveform peak slices for the audio buffer.
   * @param {AudioBuffer} buffer 
   * @param {number} bars - Length of the clip in bars
   * @param {number} peaksPerBar - Number of peaks to generate per bar
   * @returns {number[]} Array of normalized peak values (0.0 to 1.0)
   */
  generateWaveformPeaks(buffer, bars, peaksPerBar) {
    const channelData = buffer.getChannelData(0); // Use first channel for visualization
    const totalPeaks = Math.ceil(bars * peaksPerBar);
    const samplesPerPeak = Math.floor(channelData.length / totalPeaks);
    
    const peaks = [];
    
    for (let i = 0; i < totalPeaks; i++) {
      let maxPeak = 0;
      const startSample = i * samplesPerPeak;
      const endSample = startSample + samplesPerPeak;
      
      // Find maximum absolute amplitude in this segment
      for (let j = startSample; j < endSample && j < channelData.length; j++) {
        const absValue = Math.abs(channelData[j]);
        if (absValue > maxPeak) {
          maxPeak = absValue;
        }
      }
      peaks.push(maxPeak);
    }
    
    return peaks;
  }
}

const audioImportService = new AudioImportService();
export default audioImportService;
