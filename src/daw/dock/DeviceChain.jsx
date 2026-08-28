import React, { useState } from 'react';

/**
 * DeviceChain Component - Active VST3 Device Chain rack for the selected track.
 */
export default function DeviceChain() {
  const [plugins, setPlugins] = useState([
    { id: 1, name: 'Pro-Q 3', bypassed: false, dryWet: 100, inGain: 0, outGain: 0, preset: 'Default' },
    { id: 2, name: 'Saturn 2', bypassed: false, dryWet: 50, inGain: 2, outGain: -1, preset: 'Warm Tape' },
  ]);

  const toggleBypass = (id) => {
    setPlugins(plugins.map(p => p.id === id ? { ...p, bypassed: !p.bypassed } : p));
  };

  return (
    <div style={styles.container}>
      <div style={styles.rackContainer}>
        {plugins.map((plugin) => (
          <div key={plugin.id} style={{ ...styles.rackSlot, opacity: plugin.bypassed ? 0.6 : 1 }}>
            <div style={styles.slotHeader}>
              <span style={styles.pluginName}>{plugin.name}</span>
              <button 
                style={{ ...styles.bypassBtn, backgroundColor: plugin.bypassed ? 'var(--gm-crimson, #E63946)' : 'var(--gm-amber, #FF9900)' }}
                onClick={() => toggleBypass(plugin.id)}
              >
                {plugin.bypassed ? 'BYPASS' : 'ON'}
              </button>
            </div>
            
            <div style={styles.knobsRow}>
              <div style={styles.knobContainer}>
                <div style={styles.knobPlaceholder}>IN</div>
                <div style={styles.knobLabel}>{plugin.inGain} dB</div>
              </div>
              <div style={styles.knobContainer}>
                <div style={styles.knobPlaceholder}>MIX</div>
                <div style={styles.knobLabel}>{plugin.dryWet}%</div>
              </div>
              <div style={styles.knobContainer}>
                <div style={styles.knobPlaceholder}>OUT</div>
                <div style={styles.knobLabel}>{plugin.outGain} dB</div>
              </div>
            </div>

            <div style={styles.presetSelector}>
              <span>{plugin.preset}</span>
              <span>▼</span>
            </div>
          </div>
        ))}

        <div style={styles.addSlot}>
          <span style={styles.addIcon}>+</span> Add Plugin
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    height: '100%',
    padding: '16px',
    backgroundColor: 'var(--gm-bg, #1a1a1a)',
    color: 'var(--gm-text, #e0e0e0)',
    fontFamily: 'Inter, Roboto, sans-serif',
    display: 'flex',
    overflowX: 'auto',
  },
  rackContainer: {
    display: 'flex',
    gap: '12px',
    alignItems: 'stretch',
  },
  rackSlot: {
    width: '220px',
    backgroundColor: 'var(--gm-panel, #242424)',
    border: '1px solid var(--gm-border, #333333)',
    borderRadius: '4px',
    padding: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), 0 4px 6px rgba(0,0,0,0.3)',
  },
  slotHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pluginName: {
    fontWeight: 600,
    fontSize: '14px',
    color: 'var(--gm-ice-white, #F0F8FF)',
  },
  bypassBtn: {
    border: 'none',
    borderRadius: '2px',
    padding: '4px 8px',
    fontSize: '10px',
    fontWeight: 'bold',
    color: '#000',
    cursor: 'pointer',
  },
  knobsRow: {
    display: 'flex',
    justifyContent: 'space-between',
  },
  knobContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
  },
  knobPlaceholder: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    backgroundColor: '#111',
    border: '2px solid var(--gm-border, #333)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    fontSize: '10px',
    color: '#888',
    boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)',
  },
  knobLabel: {
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: '10px',
    color: '#aaa',
  },
  presetSelector: {
    backgroundColor: '#111',
    border: '1px solid var(--gm-border, #333)',
    padding: '6px 8px',
    borderRadius: '2px',
    fontSize: '12px',
    display: 'flex',
    justifyContent: 'space-between',
    cursor: 'pointer',
    color: 'var(--gm-amber, #FF9900)',
  },
  addSlot: {
    width: '220px',
    border: '1px dashed var(--gm-border, #444)',
    borderRadius: '4px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    cursor: 'pointer',
    color: '#888',
    transition: 'all 0.2s',
  },
  addIcon: {
    fontSize: '24px',
    marginBottom: '8px',
    color: 'var(--gm-ice-white, #F0F8FF)',
  },
};
