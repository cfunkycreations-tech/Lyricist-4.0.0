import React, { useState } from 'react';
import DeviceChain from './dock/DeviceChain';
import PianoRoll from './dock/PianoRoll';
import LooperDock from './dock/LooperDock';
import TapeSlicer from './dock/TapeSlicer';
import StemSeparator from './dock/StemSeparator';
import PluginHostEditor from './dock/PluginHostEditor';
import ChordPalette from './dock/ChordPalette';
import MacroRack from './dock/MacroRack';

/**
 * BottomDock Component - Tabbed resizable dock for DAW modules
 */
export default function BottomDock() {
  const [activeTab, setActiveTab] = useState('VST3 Chains');
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [height, setHeight] = useState(300);

  const tabs = ['VST3 Chains', 'Piano Roll', 'Looper', 'Tape Slicer', 'Stems', 'Plugin Editor', 'Chords', 'Macros'];

  const renderContent = () => {
    switch(activeTab) {
      case 'VST3 Chains': return <DeviceChain />;
      case 'Piano Roll': return <PianoRoll />;
      case 'Looper': return <LooperDock />;
      case 'Tape Slicer': return <TapeSlicer />;
      case 'Stems': return <StemSeparator />;
      case 'Plugin Editor': return <PluginHostEditor />;
      case 'Chords': return <ChordPalette />;
      case 'Macros': return <MacroRack />;
      default: return null;
    }
  };

  if (isCollapsed) {
    return (
      <div style={{...styles.dock, height: '40px'}}>
        <div style={styles.header}>
          <div style={styles.tabs}>
            <span style={styles.collapsedTitle}>Dock Collapsed - {activeTab}</span>
          </div>
          <button style={styles.collapseBtn} onClick={() => setIsCollapsed(false)}>▲</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{...styles.dock, height: `${height}px`}}>
      <div style={styles.resizeHandle} />
      <div style={styles.header}>
        <div style={styles.tabs}>
          {tabs.map(tab => (
            <button 
              key={tab}
              style={{
                ...styles.tabBtn,
                color: activeTab === tab ? 'var(--gm-ice-white, #F0F8FF)' : '#888',
                borderBottom: activeTab === tab ? '2px solid var(--gm-amber, #FF9900)' : '2px solid transparent',
              }}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>
        <button style={styles.collapseBtn} onClick={() => setIsCollapsed(true)}>▼</button>
      </div>
      <div style={styles.contentArea}>
        {renderContent()}
      </div>
    </div>
  );
}

const styles = {
  dock: {
    backgroundColor: 'var(--gm-panel, #242424)',
    borderTop: '1px solid var(--gm-border, #333)',
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
    width: '100%',
    fontFamily: 'Inter, Roboto, sans-serif',
  },
  resizeHandle: {
    height: '4px',
    width: '100%',
    cursor: 'ns-resize',
    backgroundColor: '#333',
    position: 'absolute',
    top: 0,
    zIndex: 10,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    padding: '0 16px',
    height: '36px',
    marginTop: '4px',
  },
  tabs: {
    display: 'flex',
    gap: '16px',
    height: '100%',
  },
  tabBtn: {
    background: 'none',
    border: 'none',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer',
    padding: '0 8px',
    height: '100%',
    textTransform: 'uppercase',
  },
  collapsedTitle: {
    color: '#888',
    fontSize: '12px',
    alignSelf: 'center',
  },
  collapseBtn: {
    background: 'none',
    border: 'none',
    color: '#aaa',
    cursor: 'pointer',
    fontSize: '14px',
  },
  contentArea: {
    flex: 1,
    overflow: 'hidden',
    position: 'relative',
  }
};
