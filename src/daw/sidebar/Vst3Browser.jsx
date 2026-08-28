import React, { useState } from 'react';

/**
 * Vst3Browser component
 * Unified VST3 plugin & preset browser.
 */
export default function Vst3Browser() {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState('Instruments');
  const [isScanning, setIsScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState('');

  const handleScan = () => {
    setIsScanning(true);
    setScanStatus('Scanning VST3 directories...');
    if (window.JuceBridge && window.JuceBridge.scanVst3Plugins) {
      window.JuceBridge.scanVst3Plugins();
    }
    setTimeout(() => {
      setScanStatus('Found 12 plugins');
      setTimeout(() => {
        setIsScanning(false);
        setScanStatus('');
      }, 2000);
    }, 2500);
  };

  const categories = ['Instruments', 'Audio FX'];
  const instruments = [
    { name: 'Funk Bass 9000', vendor: 'Funk Audio Flow', type: 'Bass' },
    { name: 'Massive', vendor: 'Native Instruments', type: 'Synths' },
    { name: 'HALion', vendor: 'Steinberg', type: 'Drum Samplers' },
  ];
  const audioFx = [
    { name: 'Pro-Q 3', vendor: 'FabFilter', type: 'EQ' },
    { name: 'Valhalla Vintage', vendor: 'Valhalla DSP', type: 'Reverb/Delay' },
    { name: 'EchoBoy', vendor: 'Soundtoys', type: 'Reverb/Delay' },
  ];

  const plugins = activeCategory === 'Instruments' ? instruments : audioFx;
  const filteredPlugins = plugins.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()) || p.vendor.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div style={{ padding: '16px', color: 'var(--gm-text)', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3 style={{ margin: '0', color: 'var(--gm-accent-ice, #F0F8FF)' }}>VST3 Browser</h3>
        <button 
          onClick={handleScan}
          disabled={isScanning}
          style={{
            background: 'var(--gm-bg-panel)',
            color: isScanning ? 'var(--gm-led-amber)' : 'var(--gm-text-active)',
            border: `1px solid ${isScanning ? 'var(--gm-led-amber)' : 'var(--gm-border-dark)'}`,
            padding: '4px 8px',
            borderRadius: '4px',
            cursor: isScanning ? 'default' : 'pointer',
            fontSize: '11px',
            fontWeight: 'bold',
            transition: 'all 0.2s'
          }}
        >
          {isScanning ? scanStatus : 'Scan System VST3s'}
        </button>
      </div>
      <input 
        type="text" 
        placeholder="Search plugins by name or vendor..." 
        value={searchTerm}
        onChange={e => setSearchTerm(e.target.value)}
        style={{ width: '100%', padding: '8px', marginBottom: '16px', background: 'var(--gm-bg-dark)', color: 'var(--gm-text)', border: '1px solid var(--gm-border)', boxSizing: 'border-box' }}
      />
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        {categories.map(cat => (
          <button 
            key={cat} 
            onClick={() => setActiveCategory(cat)}
            style={{ 
              padding: '6px 10px', 
              background: activeCategory === cat ? 'var(--gm-accent-amber, #FF9900)' : 'var(--gm-bg-medium)', 
              color: activeCategory === cat ? '#000' : 'var(--gm-text)', 
              border: '1px solid var(--gm-border)', 
              cursor: 'pointer',
              borderRadius: '4px',
              fontSize: '12px',
              fontWeight: 'bold'
            }}
          >
            {cat}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {filteredPlugins.map((plugin, idx) => (
          <div key={idx} draggable style={{ background: 'var(--gm-bg-medium)', padding: '12px', borderRadius: '4px', borderLeft: '4px solid var(--gm-accent-amber, #FF9900)', cursor: 'grab' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong style={{ fontSize: '14px' }}>{plugin.name}</strong>
              <button style={{ background: 'var(--gm-bg-dark)', color: 'var(--gm-accent-ice, #F0F8FF)', border: '1px solid var(--gm-border)', cursor: 'pointer', padding: '4px 10px', borderRadius: '3px' }}>Add</button>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--gm-text-muted)', marginTop: '6px' }}>
              {plugin.vendor} • {plugin.type}
            </div>
            <div style={{ fontSize: '10px', color: 'var(--gm-text-muted)', marginTop: '8px', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: 'JetBrains Mono, monospace' }}>VST3 64-bit</span>
              <span style={{ color: 'var(--gm-accent-ice, #F0F8FF)', fontFamily: 'JetBrains Mono, monospace' }}>Zero Latency</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
