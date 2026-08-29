import React from 'react';
import { useStore } from '../store';
import { invoke } from '@tauri-apps/api/core';

export const MainLayout: React.FC = () => {
  const { transport, togglePlayback, lyrics, activeTracks } = useStore();

  const handlePlay = async () => {
    togglePlayback();
    // Tauri IPC call to JUCE sidecar
    try {
      if (!transport.playing) {
         await invoke('start_audio');
      } else {
         await invoke('stop_audio');
      }
    } catch (e) {
      console.error("Audio IPC Error", e);
    }
  };

  return (
    <div style={styles.container}>
      <header style={styles.transport}>
        <div style={styles.transportControls}>
          <button style={styles.btn} onClick={handlePlay}>
            {transport.playing ? 'STOP' : 'PLAY'}
          </button>
          <button style={styles.btn}>REC</button>
        </div>
        <div style={styles.telemetry}>
          BPM {transport.bpm} | {transport.key} | {transport.timeSignature}
        </div>
        <div style={styles.exportTray}>
          DSP: 14% | Export
        </div>
      </header>

      <div style={styles.workspace}>
        <aside style={styles.leftSidebar}>
          <div style={styles.panelHeader}>VST3 / Library</div>
          {/* VST3 System Scanner list */}
          <div style={{ padding: '12px' }}>
             <p style={{ color: '#00E5FF' }}>System Scanner</p>
             <p>Instruments | Audio FX</p>
          </div>
        </aside>

        <main style={styles.centerCanvas}>
          <div style={styles.lyricEditor}>
            <pre style={styles.neonText}>{lyrics}</pre>
          </div>
        </main>

        <aside style={styles.rightSidebar}>
          <div style={styles.panelHeader}>Track Management</div>
          {activeTracks.map(t => (
             <div key={t.id} style={styles.track}>
                <div>{t.name}</div>
                <div>M S A</div>
                <div>{t.volume.toFixed(1)} dB</div>
             </div>
          ))}
          <div style={{ marginTop: '20px' }}>
            <div style={styles.panelHeader}>Song Structure</div>
            <div style={styles.track}>Intro (4 Bars)</div>
            <div style={styles.track}>Verse (16 Bars)</div>
          </div>
        </aside>
      </div>

      <footer style={styles.bottomDock}>
        <div style={styles.panelHeader}>FX Rack: VST3 Chains</div>
        <div style={{ display: 'flex', gap: '12px', padding: '12px' }}>
           <div style={styles.fxModule}>4-Band EQ</div>
           <div style={styles.fxModule}>Studio Comp</div>
           <div style={styles.fxModule}>Stereo Delay</div>
           <div style={styles.fxModule}>Studio Reverb</div>
        </div>
      </footer>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'grid',
    gridTemplateRows: '48px 1fr 200px',
    width: '100vw',
    height: '100vh',
    overflow: 'hidden',
    backgroundColor: '#1E1E1E',
    color: '#E5E2E1',
    fontFamily: 'Inter, sans-serif',
  },
  transport: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0 16px',
    backgroundColor: '#151515',
    borderBottom: '1px solid #111111',
  },
  transportControls: {
    display: 'flex',
    gap: '8px',
  },
  btn: {
    backgroundColor: '#1E1E1E',
    color: '#00E5FF',
    border: '1px solid #111111',
    padding: '4px 12px',
    cursor: 'pointer',
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: '12px',
  },
  telemetry: {
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: '14px',
    fontWeight: 'bold',
  },
  exportTray: {
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: '12px',
  },
  workspace: {
    display: 'grid',
    gridTemplateColumns: '250px 1fr 300px',
    overflow: 'hidden',
  },
  leftSidebar: {
    backgroundColor: '#151515',
    borderRight: '1px solid #111111',
  },
  centerCanvas: {
    backgroundColor: '#1E1E1E',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '24px',
  },
  rightSidebar: {
    backgroundColor: '#151515',
    borderLeft: '1px solid #111111',
  },
  panelHeader: {
    padding: '8px 12px',
    borderBottom: '1px solid #111111',
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: '11px',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: '#00E5FF',
  },
  lyricEditor: {
    width: '100%',
    height: '100%',
    overflowY: 'auto',
  },
  neonText: {
    color: '#00E5FF',
    textShadow: '0 0 8px rgba(0,229,255,0.4)',
    fontSize: '16px',
    lineHeight: '1.5',
    whiteSpace: 'pre-wrap',
  },
  track: {
    padding: '12px',
    borderBottom: '1px solid #111111',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: '13px',
  },
  bottomDock: {
    backgroundColor: '#151515',
    borderTop: '1px solid #111111',
  },
  fxModule: {
    backgroundColor: '#1E1E1E',
    border: '1px solid #111111',
    padding: '12px',
    flex: 1,
    textAlign: 'center',
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: '11px',
  }
};
