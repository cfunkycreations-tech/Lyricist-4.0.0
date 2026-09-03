import React, { useEffect, useRef, useState } from 'react';
import MatrixMeter from './origami/MatrixMeter';
import { useDAW } from './context/DAWContext';
import audioGraph from './engine/AudioGraph';
import metronomeEngine from './engine/MetronomeEngine';
import projectSessionService from './services/ProjectSessionService';
import webMidiService from './services/WebMidiService';
import performanceMonitor from './engine/PerformanceMonitor';

const KEYS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/**
 * The transport, as the shell's top flap.
 *
 * Fine print throughout — nothing here is set above 13px, and the largest
 * thing on the panel is a number. The master board is the 5x4 matrix meter
 * under acrylic, reading the audio graph's true peak. When the transport is
 * stopped it stops metering and runs idle pads instead.
 */
export default function TransportBar({ onOpenSettings, onOpenExport, onOpenScope, onOpenHistory, onOpenEula, onOpenDiagnostics }) {
  const { transport, togglePlay, stop, toggleRecord, setTransport, tracks, lyrics, loadProject } = useDAW();
  const [metroActive, setMetroActive] = useState(false);
  const [midiActivity, setMidiActivity] = useState(false);
  const [dspLoad, setDspLoad] = useState(0);
  const [peakDb, setPeakDb] = useState(-Infinity);
  const fileInputRef = useRef(null);

  useEffect(() => { metronomeEngine.setBpm(transport.bpm); }, [transport.bpm]);

  useEffect(() => {
    const onMidi = () => {
      setMidiActivity(true);
      clearTimeout(onMidi._t);
      onMidi._t = setTimeout(() => setMidiActivity(false), 150);
    };
    webMidiService.addEventListener(onMidi);
    return () => { clearTimeout(onMidi._t); webMidiService.removeEventListener(onMidi); };
  }, []);

  // DSP load is read from the monitor when it has one. It is NOT faked when it
  // does not — a made-up load figure on a panel that also shows a real meter
  // teaches you to distrust both.
  useEffect(() => {
    const id = setInterval(() => {
      if (performanceMonitor && typeof performanceMonitor.getDSPLoad === 'function') {
        setDspLoad(performanceMonitor.getDSPLoad());
      }
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // The readout tracks the same true peak the matrix board draws.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const p = audioGraph.getMasterPeaks();
      setPeakDb(Math.max(p.left, p.right));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const toggleMetronome = () => {
    const next = !metroActive;
    setMetroActive(next);
    if (next && transport.isPlaying) {
      metronomeEngine.setBpm(transport.bpm);
      metronomeEngine.start();
    } else {
      metronomeEngine.stop();
    }
  };

  const handlePlay = () => {
    audioGraph.init();
    if (!transport.isPlaying && metroActive) {
      metronomeEngine.setBpm(transport.bpm);
      metronomeEngine.start();
    } else {
      metronomeEngine.stop();
    }
    togglePlay();
  };

  const handleFileAction = (e) => {
    const action = e.target.value;
    e.target.value = '';
    if (action === 'new') loadProject(projectSessionService.createDefaultProject());
    else if (action === 'open') fileInputRef.current.click();
    else if (action === 'save') {
      projectSessionService.saveProjectToFile({
        tracks, lyrics,
        bpm: transport.bpm, key: transport.key, timeSig: transport.timeSig,
        automation: {}
      });
    }
  };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (file) {
      try { loadProject(await projectSessionService.loadProjectFromFile(file)); }
      catch (err) { console.error('Failed to load project:', err); }
    }
    e.target.value = null;
  };

  const bar = Math.floor(transport.playhead) + 1;
  const beat = Math.floor((transport.playhead % 1) * 4) + 1;
  const dbText = Number.isFinite(peakDb) ? peakDb.toFixed(1) : '-∞';

  return (
    <div className="tr">
      <div className="keys">
        <button type="button" className={`k${transport.isPlaying ? ' lit' : ''}`} onClick={handlePlay}>
          {transport.isPlaying ? 'Stop' : 'Play'}
        </button>
        <button type="button" className={`k rec${transport.isRecording ? ' lit' : ''}`} onClick={toggleRecord}>
          Rec
        </button>
        <button type="button" className={`k${metroActive ? ' lit' : ''}`} onClick={toggleMetronome}>
          Click
        </button>
      </div>

      <label className="fld">
        <u>Tempo</u>
        <input
          className="fldin"
          type="number"
          min="20"
          max="300"
          value={transport.bpm}
          onChange={(e) => setTransport({ bpm: Number(e.target.value) || 120 })}
        />
      </label>

      <label className="fld">
        <u>Key</u>
        <select className="fldin" value={transport.key} onChange={(e) => setTransport({ key: e.target.value })}>
          {KEYS.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
      </label>

      <label className="fld">
        <u>Sig</u>
        <select className="fldin" value={transport.timeSig} onChange={(e) => setTransport({ timeSig: e.target.value })}>
          <option value="4/4">4/4</option>
          <option value="3/4">3/4</option>
          <option value="6/8">6/8</option>
        </select>
      </label>

      <div className="fld"><u>Bar</u><b>{bar}.{beat}</b></div>
      {dspLoad > 0 && (
        <button type="button" className="fld fld-btn" onClick={onOpenDiagnostics} title="Performance diagnostics">
          <u>DSP</u><b>{Math.round(dspLoad)}%</b>
        </button>
      )}
      {midiActivity && <div className="fld"><u>MIDI</u><b>&bull;</b></div>}

      <div className="mtx">
        <MatrixMeter playing={transport.isPlaying} channel="L" seed={0} />
        <button type="button" className="fld fld-btn" onClick={onOpenScope} title="Master acoustic scope">
          <u>dBTP</u><b>{dbText}</b>
        </button>
        <MatrixMeter playing={transport.isPlaying} channel="R" seed={1.7} />
      </div>

      <div className="keys trailing">
        <select className="k ksel" onChange={handleFileAction} defaultValue="" title="Project">
          <option value="" disabled>File</option>
          <option value="new">New</option>
          <option value="open">Open</option>
          <option value="save">Save</option>
        </select>
        <button type="button" className="k" onClick={onOpenExport}>Export</button>
        <button type="button" className="k" onClick={onOpenHistory}>History</button>
        <button type="button" className="k" onClick={onOpenSettings}>Settings</button>
        <button type="button" className="k" onClick={onOpenEula} title="End user licence agreement">EULA</button>
      </div>

      <input ref={fileInputRef} type="file" accept=".lyr,.json" onChange={handleFileChange} style={{ display: 'none' }} />
    </div>
  );
}
