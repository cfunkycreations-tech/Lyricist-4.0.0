import React, { useState, useEffect } from 'react';
import './DAWLayout.css';
import TransportBar from './TransportBar';
import Sidebar from './Sidebar';
import BottomDock from './BottomDock';
import CenterCanvas from './canvas/CenterCanvas';
import SettingsModal from './settings/SettingsModal';
import ExportModal from './export/ExportModal';
import MasterScopeModal from './components/MasterScopeModal';
import { DAWProvider, useDAW } from './context/DAWContext';
import DAWContextMenu from './components/DAWContextMenu';
import keyCommandService from './services/KeyCommandService';
import WaveformEditorModal from './components/WaveformEditorModal';
import webMidiService from './services/WebMidiService';
import GhostPilotHUD from './components/GhostPilotHUD';

import HistoryTimelineModal from './components/HistoryTimelineModal';
import EulaModal from './components/EulaModal';
import PerformanceDiagnosticsModal from './components/PerformanceDiagnosticsModal';
function DAWLayoutContent() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showScope, setShowScope] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showEula, setShowEula] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [editingClip, setEditingClip] = useState(null);
  const { togglePlay, toggleRecord, setPlayhead, loadProject } = useDAW();

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
    
    return () => {
      if (keyCommandService && typeof keyCommandService.cleanup === 'function') {
        keyCommandService.cleanup();
      }
    };
  }, [togglePlay, toggleRecord, setPlayhead]);

  const toggleSidebar = () => {
    setSidebarCollapsed(prev => !prev);
  };

  const handleRestoreHistory = (snapshot) => {
    loadProject(snapshot);
  };

  return (
    <div className="daw-shell">
      <TransportBar 
        onOpenSettings={() => setShowSettings(true)} 
        onOpenExport={() => setShowExport(true)} 
        onOpenScope={() => setShowScope(true)}
        onOpenHistory={() => setShowHistory(true)}
        onOpenEula={() => setShowEula(true)}
        onOpenDiagnostics={() => setShowDiagnostics(true)}
      />
      <Sidebar collapsed={sidebarCollapsed} onToggle={toggleSidebar} />
      <div className="daw-canvas">
        <CenterCanvas onEditClip={(clip, trackId) => setEditingClip({ clip, trackId })} />
      </div>
      <BottomDock />
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showExport && <ExportModal onClose={() => setShowExport(false)} />}
      {showScope && <MasterScopeModal onClose={() => setShowScope(false)} />}
      {showHistory && (
        <HistoryTimelineModal 
          onClose={() => setShowHistory(false)} 
          onRestore={handleRestoreHistory} 
        />
      )}
      {showEula && <EulaModal onClose={() => setShowEula(false)} />}
      {showDiagnostics && <PerformanceDiagnosticsModal onClose={() => setShowDiagnostics(false)} />}
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


