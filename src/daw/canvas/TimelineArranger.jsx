import React, { useState } from 'react';
import './TimelineArranger.css';
import RotaryKnob from '../components/RotaryKnob';
import HardwareFader from '../components/HardwareFader';
import AutomationLane from './AutomationLane';
import { useDAW } from '../context/DAWContext';
import funkMatrixEngine from '../engine/FunkMatrixEngine';
import audioGraph from '../engine/AudioGraph';
import audioRecorder from '../engine/AudioRecorder';
import audioImportService from '../services/AudioImportService';

/**
 * TimelineArranger Component
 * Multi-track timeline supporting Audio and MIDI tracks with live hardware controls and AI preview.
 */
export default function TimelineArranger({ onEditClip }) {
  const {
    tracks,
    transport,
    updateTrack,
    addTrack,
    addClipToTrack,
    setPlayhead,
    addRenderJob,
    updateRenderJob,
    aiConfig
  } = useDAW();

  const [snap, setSnap] = useState('1/16');
  const [zoom, setZoom] = useState(1);
  const [generatingTrackId, setGeneratingTrackId] = useState(null);
  const [livePeak, setLivePeak] = useState(0);
  const [automationExpanded, setAutomationExpanded] = useState({});
  const [isDragging, setIsDragging] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const handleDragOver = (e) => {
    e.preventDefault();
    if (!isDragging) setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    if (e.currentTarget === e.target) setIsDragging(false);
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setIsImporting(true);
      const files = Array.from(e.dataTransfer.files);
      const newTracks = await audioImportService.importFiles(files, transport.playhead, transport.bpm);
      newTracks.forEach(track => addTrack(track));
      setIsImporting(false);
    }
  };

  const handleFileInput = async (e) => {
    if (e.target.files && e.target.files.length > 0) {
      setIsImporting(true);
      const files = Array.from(e.target.files);
      const newTracks = await audioImportService.importFiles(files, transport.playhead, transport.bpm);
      newTracks.forEach(track => addTrack(track));
      setIsImporting(false);
    }
    e.target.value = null;
  };

  const toggleAutomation = (trackId) => {
    setAutomationExpanded(prev => ({
      ...prev,
      [trackId]: !prev[trackId]
    }));
  };

  const handleGeneratePreview = async (track) => {
    if (!aiConfig.enabled) {
      alert('Global AI Engine is disabled in Settings.');
      return;
    }

    setGeneratingTrackId(track.id);
    const jobId = `job-${Date.now()}`;

    addRenderJob({
      id: jobId,
      name: `${track.name} Vocal Preview [MiniMax-3]`,
      progress: 0,
      status: 'active',
      trackId: track.id,
      duration: 4,
      timestamp: Date.now()
    });

    try {
      await funkMatrixEngine.requestAudioPreview({
        trackId: track.id,
        prompt: `Vocals for ${track.name}`,
        lyrics: 'Yeah, we building the future in the matrix flow',
        style: 'modern melodic',
        playheadPosition: transport.playhead,
        onProgress: (progress, step) => {
          updateRenderJob(jobId, { progress, name: `${track.name} — ${step}` });
        },
        onComplete: (clip) => {
          addClipToTrack(track.id, clip);
          updateRenderJob(jobId, {
            progress: 100,
            status: 'completed',
            name: `${track.name} Preview Rendered`
          });
          setGeneratingTrackId(null);
          audioGraph.playTestTone(track.id, 440, 'triangle');
        }
      });
    } catch (err) {
      updateRenderJob(jobId, { status: 'failed', name: `Failed: ${err.message}` });
      setGeneratingTrackId(null);
    }
  };

  React.useEffect(() => {
    if (transport.isRecording) {
      const armedTrack = tracks.find(t => t.armed);
      if (armedTrack && armedTrack.type === 'audio') {
        if (!audioRecorder.isRecording()) {
          audioRecorder.init().then(() => {
            audioRecorder.startRecording(armedTrack.id, (peak) => {
              setLivePeak(peak);
            });
          }).catch(console.error);
        }
      }
    } else {
      if (audioRecorder.isRecording()) {
        audioRecorder.stopRecording().then((data) => {
          if (data) {
            const armedTrack = tracks.find(t => t.armed);
            if (armedTrack) {
              // Convert duration to bars approximately, minimum 1 bar
              const beats = (data.duration / 60) * transport.bpm;
              const bars = Math.max(1, beats / 4);
              
              const newClip = {
                id: `clip-${Date.now()}`,
                name: 'Audio Recording',
                start: transport.playhead,
                length: bars,
                data: data.blob
              };
              addClipToTrack(armedTrack.id, newClip);
            }
          }
          setLivePeak(0);
        });
      }
    }
  }, [transport.isRecording, tracks, addClipToTrack, transport.playhead, transport.bpm]);

  const handleRulerClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const barWidth = 100 * zoom;
    const clickedBar = Math.max(0, clickX / barWidth);
    setPlayhead(clickedBar);
  };

  const barWidth = 100 * zoom;
  const totalBars = 16;
  const playheadLeft = transport.playhead * barWidth;

  return (
    <div className="timeline-arranger">
      <div className="timeline-toolbar">
        <div className="timeline-tools-left">
          <button 
            className="toolbar-btn" 
            onClick={() => document.getElementById('audio-import-input').click()}
            disabled={isImporting}
          >
            {isImporting ? 'Importing...' : 'Import Stems'}
          </button>
          <input 
            type="file" 
            id="audio-import-input" 
            style={{ display: 'none' }} 
            multiple 
            accept=".wav,.mp3,.ogg,.flac,.m4a,.aac" 
            onChange={handleFileInput}
          />
          <select 
            className="toolbar-btn" 
            onChange={(e) => { if (e.target.value) { addTrack(e.target.value); e.target.value = ''; } }} 
            value=""
          >
            <option value="" disabled>+ Add Track</option>
            <option value="audio">+ Audio Track</option>
            <option value="midi">+ MIDI Track</option>
          </select>
          <select 
            className="toolbar-btn"
            value={snap}
            onChange={(e) => setSnap(e.target.value)}
          >
            <option value="1/16">Snap: 1/16</option>
            <option value="1/8">Snap: 1/8</option>
            <option value="1/4">Snap: 1/4</option>
            <option value="off">Snap: Off</option>
          </select>
        </div>
        <div className="timeline-tools-right">
          <button className="toolbar-btn" onClick={() => setZoom(z => Math.min(2.0, z + 0.25))}>Zoom In</button>
          <button className="toolbar-btn" onClick={() => setZoom(z => Math.max(0.5, z - 0.25))}>Zoom Out</button>
        </div>
      </div>
      
      <div 
        className={`timeline-workspace ${isDragging ? 'drag-over' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isDragging && (
          <div className="drag-drop-overlay" style={{
            position: 'absolute',
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(230, 57, 70, 0.1)',
            border: '2px dashed var(--gm-led-crimson)',
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none'
          }}>
            <div className="drag-drop-message" style={{
              fontSize: '24px',
              fontWeight: 'bold',
              color: 'var(--gm-led-crimson)',
              textShadow: '0 0 10px rgba(230,57,70,0.5)'
            }}>
              Drop Audio Stems to Auto-Import Multi-Track
            </div>
          </div>
        )}
        <div className="track-headers">
          {tracks.map(track => {
            const isGen = generatingTrackId === track.id;
            return (
              <div 
                key={track.id} 
                className="track-header"
                data-context-type="track"
                data-context-id={track.id}
              >
                <div className="track-header-top">
                  <div className="track-color-indicator" style={{ backgroundColor: track.color }}></div>
                  <input 
                    className="track-name-input" 
                    value={track.name} 
                    onChange={(e) => updateTrack(track.id, { name: e.target.value })} 
                  />
                </div>

                <div className="track-controls">
                  <button 
                    className={`btn-icon ${track.armed ? 'active record' : ''}`} 
                    onClick={() => updateTrack(track.id, { armed: !track.armed })}
                    title="Record Arm"
                  >
                    ●
                  </button>
                  <button 
                    className={`btn-icon ${track.muted ? 'active mute' : ''}`} 
                    onClick={() => updateTrack(track.id, { muted: !track.muted })}
                    title="Mute"
                  >
                    M
                  </button>
                  <button 
                    className={`btn-icon ${track.soloed ? 'active solo' : ''}`} 
                    onClick={() => updateTrack(track.id, { soloed: !track.soloed })}
                    title="Solo"
                  >
                    S
                  </button>
                  <RotaryKnob 
                    size={28} 
                    value={track.pan} 
                    onChange={(val) => updateTrack(track.id, { pan: val })}
                    defaultValue={5}
                    label="Pan"
                  />
                </div>

                <div className="track-hardware">
                  <HardwareFader 
                    height={80} 
                    value={track.volume} 
                    onChange={(val) => updateTrack(track.id, { volume: val })}
                    meterLevel={track.muted ? 0 : Math.min(10, track.volume * (transport.isPlaying ? (0.7 + Math.random() * 0.3) : 0))}
                    muted={track.muted}
                    showLabels={false}
                  />
                </div>

                {track.type === 'audio' && (
                  <button 
                    className="btn-preview" 
                    onClick={() => handleGeneratePreview(track)} 
                    disabled={isGen}
                    title="Synthesize vocal/audio preview using MiniMax-3"
                  >
                    {isGen ? '⚙️ Synthesizing...' : '⚡ Audio Preview'}
                  </button>
                )}

                <button 
                  className={`btn-icon ${automationExpanded[track.id] ? 'active' : ''}`} 
                  onClick={() => toggleAutomation(track.id)}
                  title="Toggle Automation"
                  style={{ fontSize: '10px', marginTop: '4px' }}
                >
                  Auto
                </button>
              </div>
            );
          })}
        </div>

        <div className="timeline-lanes">
          <div className="ruler" onClick={handleRulerClick} style={{ width: `${totalBars * barWidth}px` }}>
            {Array.from({ length: totalBars }).map((_, i) => (
              <div 
                key={i} 
                className="ruler-tick"
                style={{ width: `${barWidth}px` }}
              >
                Bar {i + 1}
              </div>
            ))}
            <div 
              className="playhead" 
              style={{ left: `${playheadLeft}px`, transition: transport.isPlaying ? 'none' : 'left 0.1s ease-out' }}
            >
              <div className="playhead-triangle"></div>
              <div className="playhead-line"></div>
            </div>
          </div>

          {tracks.map((track) => (
            <div key={track.id} style={{ display: 'flex', flexDirection: 'column' }}>
              <div 
                className="lane"
                style={{ width: `${totalBars * barWidth}px` }}
              >
                {track.clips && track.clips.map((clip) => {
                  const clipLeft = (clip.start || 0) * barWidth;
                  const clipWidth = (clip.length || 4) * barWidth;
                  return (
                    <div 
                      key={clip.id} 
                      className={`clip ${track.type}`} 
                      style={{ 
                        left: `${clipLeft}px`, 
                        width: `${clipWidth}px`,
                        borderColor: track.color
                      }}
                      onDoubleClick={() => onEditClip && onEditClip(clip, track.id)}
                    >
                      <span className="clip-name">{clip.name}</span>
                      <div className="clip-waveform-bars">
                        {Array.from({ length: 24 }).map((_, i) => (
                          <div 
                            key={i} 
                            className="clip-bar" 
                            style={{ height: `${20 + Math.sin(i * 0.6) * 60}%` }}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
                
                {transport.isRecording && track.armed && track.type === 'audio' && (
                  <div
                    className="clip audio recording pulse"
                    style={{
                      left: `${transport.playhead * barWidth}px`,
                      width: `${Math.max(1, livePeak * 100)}px`,
                      minWidth: '20px',
                      backgroundColor: 'rgba(230, 57, 70, 0.4)',
                      borderColor: 'var(--gm-crimson, #E63946)',
                      borderStyle: 'dashed'
                    }}
                  >
                    <span className="clip-name" style={{ color: '#fff' }}>Recording...</span>
                    <div className="clip-waveform-bars">
                      {Array.from({ length: 8 }).map((_, i) => (
                        <div 
                          key={i} 
                          className="clip-bar" 
                          style={{ height: `${livePeak * 100}%`, backgroundColor: 'var(--gm-crimson, #E63946)' }}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {automationExpanded[track.id] && (
                <AutomationLane 
                  track={track} 
                  totalBars={totalBars} 
                  barWidth={barWidth} 
                  currentPlayhead={transport.playhead} 
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
