import { create } from 'zustand';

export interface VST3Plugin {
  id: string;
  name: string;
  path: string;
  active: boolean;
}

export interface Track {
  id: string;
  name: string;
  mute: boolean;
  solo: boolean;
  arm: boolean;
  volume: number;
  pan: number;
  vst3Chain: VST3Plugin[];
}

export interface SongStructureBlock {
  id: string;
  name: string;
  bars: number;
}

interface LyricistState {
  activeTracks: Track[];
  loadedVST3s: VST3Plugin[];
  lyrics: string;
  songStructure: SongStructureBlock[];
  transport: {
    playing: boolean;
    recording: boolean;
    bpm: number;
    timeSignature: string;
    key: string;
  };
  matrixEngineEnabled: boolean;

  // Actions
  setLyrics: (lyrics: string) => void;
  togglePlayback: () => void;
  toggleRecording: () => void;
  setBPM: (bpm: number) => void;
  addTrack: (track: Track) => void;
  toggleTrackMute: (trackId: string) => void;
  toggleTrackSolo: (trackId: string) => void;
  toggleTrackArm: (trackId: string) => void;
  setTrackVolume: (trackId: string, volume: number) => void;
  toggleMatrixEngine: () => void;
}

export const useStore = create<LyricistState>((set) => ({
  activeTracks: [
    { id: '1', name: 'Lead Vocals', mute: false, solo: false, arm: false, volume: -3.0, pan: 0, vst3Chain: [] },
  ],
  loadedVST3s: [],
  lyrics: 'VERSE 1\nIn the city lights, we come alive,\nSynthesizers hum, beat begins to drive,\nElectric dreams in a digital space,\nLost in the rhythm, can\'t keep the pace.\n\nCHORUS\nBlue glow surrounds, laser thin and bright,\nNeon letters dancing in the night,\nHigh resolution, sharp and clear,\nThe future of sound is finally here.',
  songStructure: [
    { id: 'seq-1', name: 'Intro', bars: 4 },
    { id: 'seq-2', name: 'Verse', bars: 16 },
    { id: 'seq-3', name: 'Chorus', bars: 8 },
  ],
  transport: {
    playing: false,
    recording: false,
    bpm: 120,
    timeSignature: '4/4',
    key: 'C Major',
  },
  matrixEngineEnabled: true,

  setLyrics: (lyrics) => set({ lyrics }),
  togglePlayback: () => set((state) => ({ transport: { ...state.transport, playing: !state.transport.playing } })),
  toggleRecording: () => set((state) => ({ transport: { ...state.transport, recording: !state.transport.recording } })),
  setBPM: (bpm) => set((state) => ({ transport: { ...state.transport, bpm } })),
  addTrack: (track) => set((state) => ({ activeTracks: [...state.activeTracks, track] })),
  toggleTrackMute: (trackId) => set((state) => ({
    activeTracks: state.activeTracks.map(t => t.id === trackId ? { ...t, mute: !t.mute } : t)
  })),
  toggleTrackSolo: (trackId) => set((state) => ({
    activeTracks: state.activeTracks.map(t => t.id === trackId ? { ...t, solo: !t.solo } : t)
  })),
  toggleTrackArm: (trackId) => set((state) => ({
    activeTracks: state.activeTracks.map(t => t.id === trackId ? { ...t, arm: !t.arm } : t)
  })),
  setTrackVolume: (trackId, volume) => set((state) => ({
    activeTracks: state.activeTracks.map(t => t.id === trackId ? { ...t, volume } : t)
  })),
  toggleMatrixEngine: () => set((state) => ({ matrixEngineEnabled: !state.matrixEngineEnabled })),
}));
