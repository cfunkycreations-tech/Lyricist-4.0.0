import React, { useState, useEffect } from 'react';
import './DAWLayout.css';
import TransportBar from './TransportBar';
import Sidebar from './Sidebar';
import BottomDock from './BottomDock';
import CenterCanvas from './canvas/CenterCanvas';
import SettingsModal from './settings/SettingsModal';
import ExportModal from './export/ExportModal';
import { DAWProvider, useDAW } from './context/DAWContext';
import DAWContextMenu from './components/DAWContextMenu';
import keyCommandService from './services/KeyCommandService';
import WaveformEditorModal from './components/WaveformEditorModal';
import webMidiService from './services/WebMidiService';
import GhostPilotHUD from './components/GhostPilotHUD';

function DAWLayoutContent() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [editingClip, setEditingClip] = useState(null);
  const { togglePlay, toggleRecord, setPlayhead } = useDAW();

  useEffect(() => {
    webMidiService.init();

    keyCommandService.init({
      'Space': () => togglePlay(),
      'r': () => toggleRecord(),
      'Home': () => setPlayhead(0),
      'Tab': () => {
        // Dispatch custom event to cycle view mode in CenterCanvas
        window.dispatchEvent(new CustomEvent('cycleViewMode'));
      }
    });
    
    return () => keyCommandService.cleanup();
  }, [togglePlay, toggleRecord, setPlayhead]);

  const toggleSidebar = () => {
    setSidebarCollapsed(prev => !prev);
  };

  return (
    <div className="daw-shell">
      <TransportBar onOpenSettings={() => setShowSettings(true)} onOpenExport={() => setShowExport(true)} />
      <Sidebar collapsed={sidebarCollapsed} onToggle={toggleSidebar} />
      <div className="daw-canvas">
        <CenterCanvas onEditClip={(clip, trackId) => setEditingClip({ clip, trackId })} />
      </div>
      <BottomDock />
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showExport && <ExportModal onClose={() => setShowExport(false)} />}
      {editingClip && (
        <WaveformEditorModal 
          clip={editingClip.clip} 
          trackId={editingClip.trackId} 
          onClose={() => setEditingClip(null)} 
        />
      )}
      <DAWContextMenu />
      <GhostPilotHUD />
    </div>
  );
}

/**
 * Main DAW Layout component for Lyricist 4.2.0 Pro.
 * Provides CSS Grid based zones for transport, sidebar, canvas, and dock.
 * @returns {JSX.Element} The rendered layout component
 */
export default function DAWLayout() {
  return (
    <DAWProvider>
      <DAWLayoutContent />
    </DAWProvider>
  );
}


