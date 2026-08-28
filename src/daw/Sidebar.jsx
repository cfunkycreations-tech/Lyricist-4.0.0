import React, { useState } from 'react';
import Vst3Browser from './sidebar/Vst3Browser';
import ArtistFlowManager from './sidebar/ArtistFlowManager';
import LexiconInspector from './sidebar/LexiconInspector';
import StyleMatch from './sidebar/StyleMatch';

/**
 * Sidebar component for Lyricist 4.2.0 Pro
 * Left Sidebar interactive modules with collapsible panel.
 */
export default function Sidebar() {
  const [activeTab, setActiveTab] = useState('VST3');
  const [isCollapsed, setIsCollapsed] = useState(false);

  const tabs = ['VST3', 'Style Match', 'Rap Styles', 'Lexicon'];

  return (
    <div style={{
      // Without an explicit grid-area this panel is auto-placed and the shell's
      // named areas never apply, which lets it share a column with the dock.
      gridArea: 'sidebar',
      width: isCollapsed ? '60px' : '340px',
      transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      background: 'var(--gm-bg-base, #1c1c1e)',
      borderRight: '1px solid var(--gm-border, #2d2d30)',
      height: '100%',
      minHeight: 0,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      color: 'var(--gm-text, #e0e0e0)'
    }}>
      <div style={{ 
        padding: '16px', 
        display: 'flex', 
        justifyContent: isCollapsed ? 'center' : 'space-between', 
        alignItems: 'center', 
        borderBottom: '1px solid var(--gm-border, #2d2d30)',
        minWidth: '340px'
      }}>
        {!isCollapsed && <div style={{ display: 'flex', gap: '8px' }}>
          {tabs.map(tab => (
            <button 
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                background: activeTab === tab ? 'var(--gm-accent-ice, #F0F8FF)' : 'transparent',
                color: activeTab === tab ? '#000' : 'var(--gm-text, #e0e0e0)',
                border: '1px solid var(--gm-border, #2d2d30)',
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: 'bold',
                cursor: 'pointer',
                borderRadius: '4px',
                transition: 'all 0.2s ease'
              }}
            >
              {tab}
            </button>
          ))}
        </div>}
        
        <button 
          onClick={() => setIsCollapsed(!isCollapsed)}
          style={{ 
            background: 'transparent', 
            border: 'none', 
            color: 'var(--gm-accent-amber, #FF9900)', 
            cursor: 'pointer',
            fontSize: '18px',
            padding: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '28px',
            height: '28px'
          }}
          title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        >
          {isCollapsed ? '>>' : '<<'}
        </button>
      </div>

      <div style={{ 
        flex: 1, 
        overflowY: 'auto',
        opacity: isCollapsed ? 0 : 1,
        transition: 'opacity 0.2s ease',
        minWidth: '340px',
        display: isCollapsed ? 'none' : 'block'
      }}>
        {activeTab === 'VST3' && <Vst3Browser />}
        {activeTab === 'Style Match' && <StyleMatch />}
        {activeTab === 'Rap Styles' && <ArtistFlowManager />}
        {activeTab === 'Lexicon' && <LexiconInspector />}
      </div>
    </div>
  );
}
