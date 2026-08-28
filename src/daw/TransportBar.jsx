import React, { useState, useRef, useEffect } from 'react';
import MasterVUMeter from './components/MasterVUMeter';
import { useDAW } from './context/DAWContext';
import audioGraph from './engine/AudioGraph';
import RenderQueueTray from './components/RenderQueueTray';
import projectSessionService from './services/ProjectSessionService';
import webMidiService from './services/WebMidiService';

/**
 * TransportBar component for daw-shell top grid area.
 * Contains playback controls, timing info, ASIO status, and Render Queue tray.
 * @returns {JSX.Element}
 */
export default function TransportBar({ onOpenSettings, onOpenExport, onOpenScope }) {
  const { transport, togglePlay, stop, toggleRecord, setTransport, renderQueue, tracks, lyrics, loadProject } = useDAW();
  const [asioConnected] = useState(true);
  const [showQueue, setShowQueue] = useState(false);
  const [midiActivity, setMidiActivity] = useState(false);
  const fileInputRef = useRef(null);

  const activeJobs = renderQueue ? renderQueue.filter(j => j.status === 'active') : [];
  const completedJobs = renderQueue ? renderQueue.filter(j => j.status === 'completed') : [];

  useEffect(() => {
    const onMidiActivity = () => {
      setMidiActivity(true);
      if (window.midiActivityTimeout) clearTimeout(window.midiActivityTimeout);
      window.midiActivityTimeout = setTimeout(() => setMidiActivity(false), 150);
    };
    webMidiService.addEventListener(onMidiActivity);
    return () => webMidiService.removeEventListener(onMidiActivity);
  }, []);

  const handlePlayClick = () => {
    audioGraph.init();
    togglePlay();
  };

  const handleFileAction = (e) => {
    const action = e.target.value;
    e.target.value = ''; // Reset select
    if (action === 'new') {
      const defaultState = projectSessionService.createDefaultProject();
      loadProject(defaultState);
    } else if (action === 'open') {
      fileInputRef.current.click();
    } else if (action === 'save') {
      projectSessionService.saveProjectToFile({
        tracks,
        lyrics,
        bpm: transport.bpm,
        key: transport.key,
        timeSig: transport.timeSig,
        automation: {}
      });
    }
  };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (file) {
      try {
        const state = await projectSessionService.loadProjectFromFile(file);
        loadProject(state);
      } catch (err) {
        console.error('Failed to load project:', err);
      }
    }
    e.target.value = null; // Reset input
  };

  return (
    <div className="daw-transport">
      <div className="transport-group">
        <select 
          className="control-input"
          style={{ width: '80px', fontWeight: 'bold' }}
          onChange={handleFileAction}
          value=""
          title="File Menu"
        >
          <option value="" disabled>📁 File</option>
          <option value="new">New Project</option>
          <option value="open">Open .lyricist File...</option>
          <option value="save">Save Project</option>
        </select>
        <input 
          type="file" 
          ref={fileInputRef} 
          style={{ display: 'none' }} 
          accept=".lyricist" 
          onChange={handleFileChange}
        />
        <button 
          className={`btn-hardware ${transport.isPlaying ? 'active' : ''}`}
          onClick={handlePlayClick}
          title={transport.isPlaying ? "Pause (Space)" : "Play (Space)"}
        >
          ▶
        </button>
        <button 
          className="btn-hardware"
          onClick={stop}
          title="Stop"
        >
          ■
        </button>
        <button 
          className={`btn-hardware btn-record ${transport.isRecording ? 'active' : ''}`}
          onClick={toggleRecord}
          title="Record"
        >
          ●
        </button>
      </div>

      <div className="transport-group">
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ fontSize: '11px', color: 'var(--gm-text-label, #A0A0A0)', fontWeight: 600 }}>BPM</span>
          <input 
            type="number" 
            className="control-input" 
            value={transport.bpm} 
            onChange={(e) => setTransport({ bpm: Number(e.target.value) || 120 })}
            title="Tempo (BPM)"
            style={{ width: '56px' }}
          />
        </div>

        <select 
          className="control-input" 
          value={transport.key} 
          onChange={(e) => setTransport({ key: e.target.value })}
          title="Root Key"
        >
          {['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'].map(k => (
            <option key={k} value={k}>{k}</option>
          ))}
        </select>

        <select 
          className="control-input" 
          value={transport.scale} 
          onChange={(e) => setTransport({ scale: e.target.value })}
          title="Scale"
        >
          <option value="major">Major</option>
          <option value="minor">Minor</option>
        </select>

        <select 
          className="control-input" 
          value={transport.timeSig} 
          onChange={(e) => setTransport({ timeSig: e.target.value })}
          title="Time Signature"
        >
          <option value="4/4">4/4</option>
          <option value="3/4">3/4</option>
          <option value="6/8">6/8</option>
        </select>

        <div style={{
          fontFamily: 'var(--gm-font-metrics, monospace)',
          fontSize: '11px',
          color: 'var(--gm-text-active, #FFF)',
          background: '#111',
          padding: '3px 8px',
          borderRadius: 'var(--gm-radius, 2px)',
          border: '1px solid var(--gm-border-dark, #333)',
          letterSpacing: '0.05em'
        }}>
          BAR {Math.floor(transport.playhead) + 1}.{Math.floor((transport.playhead % 1) * 4) + 1}
        </div>
      </div>

      <div className="transport-group" style={{ position: 'relative' }}>
        <div 
          onClick={onOpenScope} 
          title="Click to open Master Acoustic Scope"
          style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}
        >
          <MasterVUMeter
            orientation="horizontal"
            compact={true}
            leftLevel={transport.isPlaying ? (6.4 + Math.random() * 1.8) : 0}
            rightLevel={transport.isPlaying ? (6.0 + Math.random() * 1.6) : 0}
            width={110}
            showLabels={true}
            showReadout={false}
            segments={14}
          />
        </div>
        
        <button className="btn-hardware" title="Open Master Acoustic Scope" onClick={onOpenScope}>
          ⚡ Scope
        </button>

        <div 
          className={`asio-dot ${asioConnected ? 'connected' : ''}`} 
          title={`ASIO Hardware Engine: ${asioConnected ? 'Connected (48kHz / 128 spls)' : 'Disconnected'}`} 
        />

        {/* Render Queue Tray Toggle Button */}
        <button 
          className={`btn-hardware ${activeJobs.length > 0 ? 'active' : ''}`} 
          title="Background Render Queue"
          onClick={() => setShowQueue(!showQueue)}
          style={{ position: 'relative' }}
        >
          ⚡ Queue
          {(activeJobs.length > 0 || completedJobs.length > 0) && (
            <span style={{
              position: 'absolute',
              top: '-4px',
              right: '-4px',
              background: activeJobs.length > 0 ? 'var(--gm-led-amber, #FF9900)' : 'var(--gm-led-ice, #F0F8FF)',
              color: '#000',
              fontSize: '9px',
              fontWeight: 700,
              borderRadius: '9999px',
              width: '14px',
              height: '14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              {activeJobs.length || completedJobs.length}
            </span>
          )}
        </button>

        {showQueue && <RenderQueueTray />}
        
        {/* Export Button */}
        <button className="btn-hardware" title="Export Audio" onClick={onOpenExport}>
          ⚡ Export
        </button>

        {/* Ghost Copilot Button */}
        <button 
          className="btn-hardware" 
          title="Ghost Copilot"
          style={{ color: 'var(--gm-amber, #FF9900)' }}
        >
          🤖 Ghost
        </button>

        {/* MIDI Activity LED */}
        <div 
          style={{
            width: '12px',
            height: '12px',
            borderRadius: '50%',
            backgroundColor: midiActivity ? 'var(--gm-cyan, #00FFFF)' : '#111',
            boxShadow: midiActivity ? '0 0 8px var(--gm-cyan, #00FFFF)' : 'inset 0 2px 4px rgba(0,0,0,0.5)',
            border: '1px solid #333',
            transition: 'background-color 0.1s, box-shadow 0.1s'
          }}
          title="MIDI Activity"
        />

        {/* Settings Button */}
        <button className="btn-hardware" title="Funk Matrix & Settings" onClick={onOpenSettings}>
          ⚙
        </button>
      </div>
    </div>
  );
}

