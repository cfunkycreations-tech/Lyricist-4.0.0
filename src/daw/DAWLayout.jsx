import React, { useState } from 'react';
import './DAWLayout.css';
import TransportBar from './TransportBar';
import Sidebar from './Sidebar';
import BottomDock from './BottomDock';
import CenterCanvas from './canvas/CenterCanvas';
import SettingsModal from './settings/SettingsModal';
import { DAWProvider } from './context/DAWContext';
import DAWContextMenu from './components/DAWContextMenu';

function DAWLayoutContent() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const toggleSidebar = () => {
    setSidebarCollapsed(prev => !prev);
  };

  return (
    <div className="daw-shell">
      <TransportBar onOpenSettings={() => setShowSettings(true)} />
      <Sidebar collapsed={sidebarCollapsed} onToggle={toggleSidebar} />
      <div className="daw-canvas">
        <CenterCanvas />
      </div>
      <BottomDock />
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      <DAWContextMenu />
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


