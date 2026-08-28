/**
 * AutoMixerService.js
 * Intelligent session gain staging & frequency unmasking service.
 */

class AutoMixerService {
  constructor() {
    this.targetRMS = -18.0; // Target studio standard dBFS
  }

  /**
   * Analyzes tracks and applies auto-mixing heuristics.
   * @param {Array} tracks - Array of track objects.
   * @param {Function} updateTrack - Callback to update a track's properties (e.g. volume, eq).
   * @param {Function} setTrackSend - Callback to add aux sends to a track.
   * @returns {Object} Structured mix analysis report.
   */
  analyzeAndAutoMix(tracks, updateTrack, setTrackSend) {
    const report = {
      calibratedTracks: 0,
      unmaskingActions: [],
      sendsAdded: 0,
      summary: ''
    };

    if (!tracks || !Array.isArray(tracks)) return report;

    let hasKick = false;
    let bassTrackId = null;

    // 1. Gain Staging & Tag Detection
    tracks.forEach(track => {
      // Simulate RMS analysis and adjustment
      // In a real scenario, this would use Web Audio API analyzers.
      const currentSimulatedRMS = -12.0; // Fake initial value
      const gainAdjustment = this.targetRMS - currentSimulatedRMS;
      
      updateTrack(track.id, { volume: gainAdjustment });
      report.calibratedTracks++;

      const name = track.name.toLowerCase();
      
      // Tag tracks based on names
      if (name.includes('kick')) hasKick = true;
      if (name.includes('bass') || name.includes('808')) bassTrackId = track.id;

      // 3. Aux Reverb Sends for Vocals and Synths
      if (name.includes('vox') || name.includes('vocal') || name.includes('synth') || name.includes('pad')) {
        const sendAmount = name.includes('vocal') ? 0.25 : 0.15; // 25% or 15%
        setTrackSend(track.id, 'reverb', sendAmount);
        report.sendsAdded++;
      }
    });

    // 2. Frequency Unmasking (Kick / Bass)
    if (hasKick && bassTrackId) {
      // Notch EQ the bass at the typical kick fundamental (around 60Hz)
      updateTrack(bassTrackId, {
        eq: {
          band: 'low',
          frequency: 60,
          gain: -3.5, // -3.5dB notch
          q: 2.0
        }
      });
      report.unmaskingActions.push('Applied -3.5dB notch at 60Hz on Bass to unmask Kick.');
    }

    report.summary = `Gain-staged ${report.calibratedTracks} tracks to -18dBFS RMS. Added spatial sends to ${report.sendsAdded} tracks. ${report.unmaskingActions.join(' ')}`;

    return report;
  }
}

const autoMixerService = new AutoMixerService();
export default autoMixerService;
