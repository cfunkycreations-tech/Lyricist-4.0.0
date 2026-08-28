import React, { useState, useEffect, useCallback } from 'react';
import { useDAW } from '../context/DAWContext';

/**
 * Vst3Browser component
 * Scans and lists the user's real installed Windows VST3 plugins.
 *
 * The list is whatever the machine actually has. An earlier version fell back
 * to a hardcoded roster when the scan failed, which meant the browser could
 * advertise plugins the user does not own — and quietly hide the ones they do.
 * A failed scan now says so.
 */
export default function Vst3Browser() {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [isScanning, setIsScanning] = useState(false);
  const [plugins, setPlugins] = useState([]);
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState('');

  const { selectedTrackId, tracks, trackPlugins, loadPluginToTrack, unloadPluginFromTrack } = useDAW();
  const loadedChain = trackPlugins[selectedTrackId] || [];
  const loadedPaths = new Set(loadedChain.map(p => p.path));
  const selectedTrack = tracks.find(t => t.id === selectedTrackId);

  const loadPlugins = useCallback(async () => {
    setIsScanning(true);
    setError('');
    setStatusMessage('Scanning C:\\Program Files\\Common Files\\VST3...');

    try {
      if (!window.lyricistAPI?.vst3ScanSystem) {
        setPlugins([]);
        setStatusMessage('');
        setError('Plugin scanning needs the desktop app — the browser build cannot read your VST3 folder.');
        return;
      }
      const res = await window.lyricistAPI.vst3ScanSystem();
      if (res?.ok && Array.isArray(res.plugins)) {
        setPlugins(res.plugins);
        setStatusMessage(
          res.plugins.length > 0
            ? `Found ${res.plugins.length} native VST3 plugins on system`
            : 'No VST3 plugins found in the standard install folders.'
        );
      } else {
        setPlugins([]);
        setStatusMessage('');
        setError(res?.error || 'Scan failed. Check that your VST3 folder exists and is readable.');
      }
    } catch (err) {
      console.warn('VST3 scan error:', err);
      setPlugins([]);
      setStatusMessage('');
      setError(`Scan failed: ${err.message}`);
    } finally {
      setIsScanning(false);
    }
  }, []);

  useEffect(() => {
    loadPlugins();
  }, [loadPlugins]);

  const handleLoad = useCallback((plugin) => {
    if (loadedPaths.has(plugin.path)) {
      const existing = loadedChain.find(p => p.path === plugin.path);
      if (existing) unloadPluginFromTrack(selectedTrackId, existing.id);
    } else {
      loadPluginToTrack(selectedTrackId, plugin);
    }
  }, [loadedPaths, loadedChain, selectedTrackId, loadPluginToTrack, unloadPluginFromTrack]);

  const openGui = useCallback((plugin) => {
    if (window.lyricistAPI?.openPluginGui) {
      window.lyricistAPI.openPluginGui(plugin);
    }
  }, []);

  const categories = ['All', 'Instruments', 'Audio FX'];
  const term = searchTerm.toLowerCase();
  const filteredPlugins = plugins.filter(p => {
    const matchesCat = activeCategory === 'All' || p.category === activeCategory;
    const matchesSearch =
      p.name.toLowerCase().includes(term) ||
      (p.vendor || '').toLowerCase().includes(term);
    return matchesCat && matchesSearch;
  });

  return (
    <div style={{ padding: '14px', color: 'var(--gm-text)', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <h3 style={{ margin: '0', fontSize: '13px', fontWeight: 800, color: 'var(--gm-accent-ice, #F0F8FF)', letterSpacing: '0.5px' }}>
          SYSTEM VST3 PLUGINS
        </h3>
        <button
          onClick={loadPlugins}
          disabled={isScanning}
          style={{
            background: '#1A1A1A',
            color: isScanning ? 'var(--gm-led-amber)' : 'var(--gm-accent-ice)',
            border: '1px solid #333',
            padding: '4px 8px',
            borderRadius: '2px',
            cursor: isScanning ? 'default' : 'pointer',
            fontSize: '10px',
            fontWeight: 'bold',
            boxShadow: '0 2px 4px rgba(0,0,0,0.5)'
          }}
        >
          {isScanning ? 'Scanning...' : '⚡ Rescan'}
        </button>
      </div>

      {statusMessage && (
        <div style={{ fontSize: '10px', color: 'var(--gm-text-muted)', marginBottom: '10px', fontFamily: 'JetBrains Mono, monospace' }}>
          {statusMessage}
        </div>
      )}

      {error && (
        <div style={{
          fontSize: '10px',
          color: 'var(--gm-crimson, #E63946)',
          marginBottom: '10px',
          fontFamily: 'JetBrains Mono, monospace',
          lineHeight: 1.5,
          border: '1px solid rgba(230,57,70,0.35)',
          background: 'rgba(230,57,70,0.08)',
          borderRadius: '3px',
          padding: '6px 8px'
        }}>
          {error}
        </div>
      )}

      <input
        type="text"
        placeholder="Filter your installed VST3s..."
        value={searchTerm}
        onChange={e => setSearchTerm(e.target.value)}
        style={{
          width: '100%',
          padding: '6px 10px',
          marginBottom: '12px',
          background: '#0D0D0D',
          color: '#FFF',
          border: '1px solid #282828',
          borderRadius: '3px',
          boxSizing: 'border-box',
          fontSize: '11px',
          fontFamily: 'JetBrains Mono, monospace'
        }}
      />

      <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            style={{
              padding: '4px 8px',
              background: activeCategory === cat ? 'linear-gradient(180deg, #303030, #1C1C1C)' : '#141414',
              color: activeCategory === cat ? 'var(--gm-accent-ice, #F0F8FF)' : 'var(--gm-text-muted)',
              border: `1px solid ${activeCategory === cat ? '#555' : '#222'}`,
              cursor: 'pointer',
              borderRadius: '2px',
              fontSize: '10px',
              fontWeight: 'bold'
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      {selectedTrack && (
        <div style={{ fontSize: '9px', color: '#666', marginBottom: '8px', fontFamily: 'JetBrains Mono, monospace' }}>
          LOADING ONTO → <span style={{ color: 'var(--gm-accent-amber, #FF9900)' }}>{selectedTrack.name}</span>
          {loadedChain.length > 0 && ` (${loadedChain.length} loaded)`}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: 'calc(100vh - 260px)', overflowY: 'auto' }}>
        {filteredPlugins.length === 0 && !isScanning && !error && (
          <div style={{ fontSize: '10px', color: '#555', fontFamily: 'JetBrains Mono, monospace', padding: '8px 0' }}>
            {plugins.length === 0 ? 'Nothing installed to show.' : 'No plugins match that filter.'}
          </div>
        )}

        {filteredPlugins.map((plugin) => {
          const isInstrument = plugin.category === 'Instruments';
          const accent = isInstrument ? 'var(--gm-accent-amber, #FF9900)' : 'var(--gm-cyan, #4CC9F0)';
          const isLoaded = loadedPaths.has(plugin.path);

          return (
            <div
              key={plugin.path}
              draggable
              onDragStart={(e) => e.dataTransfer.setData('application/x-lyricist-vst3', JSON.stringify(plugin))}
              onDoubleClick={() => openGui(plugin)}
              title={plugin.path}
              style={{
                background: 'linear-gradient(180deg, #1E1E1E 0%, #151515 100%)',
                padding: '10px',
                borderRadius: '3px',
                border: '1px solid #2B2B2B',
                borderLeft: `3px solid ${accent}`,
                boxShadow: '0 2px 5px rgba(0,0,0,0.5)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                <strong style={{ fontSize: '12px', color: '#FFF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {plugin.name}
                </strong>
                <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexShrink: 0 }}>
                  <span style={{
                    fontSize: '9px',
                    background: '#0B0B0B',
                    padding: '2px 6px',
                    borderRadius: '2px',
                    color: accent,
                    fontWeight: 800,
                    border: '1px solid #222'
                  }}>
                    {plugin.type}
                  </span>
                  <button
                    onClick={() => handleLoad(plugin)}
                    style={{
                      background: isLoaded
                        ? 'linear-gradient(180deg, #3A2A2A, #241818)'
                        : 'linear-gradient(180deg, #2A2A2A, #181818)',
                      color: isLoaded ? 'var(--gm-crimson, #E63946)' : 'var(--gm-accent-ice, #F0F8FF)',
                      border: `1px solid ${isLoaded ? '#5A2A2A' : '#383838'}`,
                      borderRadius: '2px',
                      padding: '3px 8px',
                      fontSize: '9px',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {isLoaded ? '− Remove' : '+ Load'}
                  </button>
                </div>
              </div>
              <div style={{ fontSize: '10px', color: 'var(--gm-text-muted)', marginTop: '4px', display: 'flex', justifyContent: 'space-between' }}>
                <span>{plugin.vendor}</span>
                <span style={{ fontSize: '9px', color: '#555' }}>x64 VST3</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
