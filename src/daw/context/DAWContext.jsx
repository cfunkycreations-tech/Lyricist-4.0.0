import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';

/**
 * @typedef {Object} Track
 * @property {string} id
 * @property {string} name
 * @property {'audio'|'midi'} type
 * @property {number} volume - Range 0 to 10
 * @property {number} pan - Range 0 to 10, default 5
 * @property {boolean} muted
 * @property {boolean} soloed
 * @property {boolean} armed
 * @property {string} color
 * @property {Array<any>} clips
 */

/**
 * @typedef {Object} Transport
 * @property {boolean} isPlaying
 * @property {boolean} isRecording
 * @property {number} playhead - In bars
 * @property {number} bpm
 * @property {string} key
 * @property {string} scale
 * @property {string} timeSig
 * @property {boolean} loop
 */

/**
 * @typedef {Object} LyricLine
 * @property {string} id
 * @property {string} text
 * @property {number} syllables
 * @property {string} rhymeTag
 */

/**
 * @typedef {Object} LyricSection
 * @property {string} id
 * @property {string} type
 * @property {number} energy - Range 1 to 10
 * @property {number} bars
 * @property {Array<LyricLine>} lines
 */

/**
 * @typedef {Object} RenderJob
 * @property {string} id
 * @property {string} name
 * @property {number} progress
 * @property {'active'|'completed'|'failed'} status
 * @property {string} trackId
 * @property {number} duration
 * @property {number} timestamp
 */

/**
 * @typedef {Object} AIConfig
 * @property {boolean} enabled
 * @property {string} primaryModel
 * @property {string} apiKey
 * @property {number} temperature
 */

const DAWContext = createContext(null);

export const useDAW = () => {
  const context = useContext(DAWContext);
  if (!context) {
    throw new Error('useDAW must be used within a DAWProvider');
  }
  return context;
};

export const DAWProvider = ({ children }) => {
  const [tracks, setTracks] = useState([
    { id: 't1', name: 'Lead Vocals', type: 'audio', volume: 8, pan: 5, muted: false, soloed: false, armed: true, color: 'var(--gm-led-amber)', clips: [] },
    { id: 't2', name: 'Beat / Drums', type: 'audio', volume: 7, pan: 5, muted: false, soloed: false, armed: false, color: 'var(--gm-led-white)', clips: [] },
    { id: 't3', name: 'Bassline', type: 'midi', volume: 6, pan: 5, muted: false, soloed: false, armed: false, color: 'var(--gm-led-crimson)', clips: [] },
    { id: 't4', name: 'Synth Pad', type: 'midi', volume: 5, pan: 5, muted: false, soloed: false, armed: false, color: 'var(--gm-accent-blue)', clips: [] },
  ]);

  const [transport, setTransportState] = useState({
    isPlaying: false,
    isRecording: false,
    playhead: 0,
    bpm: 120,
    key: 'C',
    scale: 'major',
    timeSig: '4/4',
    loop: false
  });

  const [lyrics, setLyrics] = useState([
    { id: 'sec1', type: 'Intro', energy: 3, bars: 4, lines: [] },
    { id: 'sec2', type: 'Verse 1', energy: 5, bars: 8, lines: [
      { id: 'l1', text: 'Step into the metal, circuits starting to spark', syllables: 11, rhymeTag: 'A' },
      { id: 'l2', text: 'Surgical precision glowing red in the dark', syllables: 11, rhymeTag: 'A' }
    ]},
    { id: 'sec3', type: 'Chorus', energy: 9, bars: 8, lines: [] }
  ]);

  const [selectedTrackId, setSelectedTrackId] = useState('t1');
  const [activeDockTab, setActiveDockTab] = useState('VST3 Chains'); // 'VST3 Chains' | 'Piano Roll' | 'Looper' | 'Tape Slicer'
  const [renderQueue, setRenderQueue] = useState([]);
  const [aiConfig, setAiConfig] = useState({
    enabled: true,
    primaryModel: 'MiniMax-3',
    apiKey: '',
    temperature: 0.7
  });

  const lastTimeRef = useRef(null);
  const reqRef = useRef(null);

  const setTransport = useCallback((updater) => {
    setTransportState(prev => typeof updater === 'function' ? updater(prev) : { ...prev, ...updater });
  }, []);

  const togglePlay = useCallback(() => {
    setTransportState(prev => ({ ...prev, isPlaying: !prev.isPlaying }));
  }, []);

  const stop = useCallback(() => {
    setTransportState(prev => ({ ...prev, isPlaying: false, isRecording: false, playhead: 0 }));
  }, []);

  const toggleRecord = useCallback(() => {
    setTransportState(prev => ({ ...prev, isRecording: !prev.isRecording, isPlaying: true }));
  }, []);

  const setPlayhead = useCallback((bars) => {
    setTransportState(prev => ({ ...prev, playhead: Math.max(0, bars) }));
  }, []);

  const updateTrack = useCallback((trackId, changes) => {
    setTracks(prev => prev.map(t => t.id === trackId ? { ...t, ...changes } : t));
  }, []);

  const addTrack = useCallback((typeOrObj, name) => {
    if (typeof typeOrObj === 'object') {
      const newTrack = {
        id: `t${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        volume: 7,
        pan: 5,
        muted: false,
        soloed: false,
        armed: false,
        color: 'var(--gm-led-white)',
        clips: [],
        ...typeOrObj
      };
      setTracks(prev => [...prev, newTrack]);
      return;
    }

    const newTrack = {
      id: `t${Date.now()}`,
      name,
      type: typeOrObj,
      volume: 7,
      pan: 5,
      muted: false,
      soloed: false,
      armed: false,
      color: 'var(--gm-led-white)',
      clips: []
    };
    setTracks(prev => [...prev, newTrack]);
  }, []);

  const deleteTrack = useCallback((trackId) => {
    setTracks(prev => prev.filter(t => t.id !== trackId));
    setSelectedTrackId(prev => prev === trackId ? null : prev);
  }, []);

  const addClipToTrack = useCallback((trackId, clip) => {
    setTracks(prev => prev.map(t => {
      if (t.id === trackId) {
        return { ...t, clips: [...t.clips, clip] };
      }
      return t;
    }));
  }, []);

  const updateLyricLine = useCallback((sectionId, lineId, newText) => {
    setLyrics(prev => prev.map(sec => {
      if (sec.id === sectionId) {
        return {
          ...sec,
          lines: sec.lines.map(l => l.id === lineId ? { ...l, text: newText } : l)
        };
      }
      return sec;
    }));
  }, []);

  const addLyricSection = useCallback((type) => {
    setLyrics(prev => [...prev, {
      id: `sec${Date.now()}`,
      type,
      energy: 5,
      bars: 8,
      lines: []
    }]);
  }, []);

  const addRenderJob = useCallback((job) => {
    setRenderQueue(prev => [...prev, {
      ...job,
      id: job.id || `job-${Date.now()}`,
      timestamp: Date.now(),
      status: 'active',
      progress: 0
    }]);
  }, []);

  const updateRenderJob = useCallback((jobId, updates) => {
    setRenderQueue(prev => prev.map(j => j.id === jobId ? { ...j, ...updates } : j));
  }, []);

  const clearCompletedJobs = useCallback(() => {
    setRenderQueue(prev => prev.filter(j => j.status === 'active'));
  }, []);

  const setAIEnabled = useCallback((enabled) => {
    setAiConfig(prev => ({ ...prev, enabled }));
  }, []);

  // Real-time animation ticker
  const tick = useCallback((time) => {
    if (!lastTimeRef.current) {
      lastTimeRef.current = time;
    }
    const deltaTime = time - lastTimeRef.current;
    lastTimeRef.current = time;

    setTransportState(prev => {
      if (!prev.isPlaying) return prev;
      
      // Calculate bars per second
      // bpm / 60 = beats per second
      // Default time sig assumed 4/4 -> 4 beats per bar
      // bars per sec = (bpm / 60) / 4 = bpm / 240
      const bps = prev.bpm / 240;
      const barsPassed = bps * (deltaTime / 1000);
      
      return {
        ...prev,
        playhead: prev.playhead + barsPassed
      };
    });

    reqRef.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    if (transport.isPlaying) {
      lastTimeRef.current = performance.now();
      reqRef.current = requestAnimationFrame(tick);
    } else {
      if (reqRef.current) cancelAnimationFrame(reqRef.current);
      lastTimeRef.current = null;
    }

    return () => {
      if (reqRef.current) cancelAnimationFrame(reqRef.current);
    };
  }, [transport.isPlaying, tick]);

  const loadProject = useCallback((projectState) => {
    if (projectState.tracks) setTracks(projectState.tracks);
    if (projectState.lyrics) setLyrics(projectState.lyrics);
    if (projectState.bpm || projectState.key || projectState.timeSig) {
      setTransportState(prev => ({
        ...prev,
        bpm: projectState.bpm || prev.bpm,
        key: projectState.key || prev.key,
        timeSig: projectState.timeSig || prev.timeSig
      }));
    }
  }, []);

  const value = {
    tracks,
    transport,
    lyrics,
    selectedTrackId,
    activeDockTab,
    renderQueue,
    aiConfig,
    setSelectedTrackId,
    setActiveDockTab,
    setTransport,
    togglePlay,
    stop,
    toggleRecord,
    setPlayhead,
    updateTrack,
    addTrack,
    deleteTrack,
    addClipToTrack,
    updateLyricLine,
    addLyricSection,
    addRenderJob,
    updateRenderJob,
    clearCompletedJobs,
    setAIEnabled,
    loadProject
  };

  return (
    <DAWContext.Provider value={value}>
      {children}
    </DAWContext.Provider>
  );
};
