import React, { useState } from 'react';
import { useDAW } from '../context/DAWContext';

/**
 * ArtistFlowManager component
 * Manages Artist Flow profiles for Lyric Forge.
 */
export default function ArtistFlowManager() {
  const { setAiConfig } = useDAW();
  const [toastMsg, setToastMsg] = useState(null);

  const handleApplyFlow = (profName) => {
    // In a real app this would call setArtistFlow() on DAWContext
    setAiConfig(true); // Ensure AI is enabled
    setToastMsg(`Applied flow: ${profName}`);
    setTimeout(() => {
      setToastMsg(null);
    }, 2500);
  };

  const profiles = [
    { name: 'Houston Slow Flow', speed: '60-80 BPM', density: 'Low', vocab: 'Tier 2', energy: 'Smooth' },
    { name: 'Late Night Melodic', speed: '80-100 BPM', density: 'Medium', vocab: 'Tier 3', energy: 'Vibe' },
    { name: 'Fast Rhyme Density', speed: '120-160 BPM', density: 'High', vocab: 'Tier 5', energy: 'Aggressive' },
    { name: 'Storyteller Folk', speed: '70-90 BPM', density: 'Medium', vocab: 'Tier 4', energy: 'Narrative' },
    { name: 'Neo-Soul Pocket', speed: '85-95 BPM', density: 'Medium', vocab: 'Tier 4', energy: 'Groove' },
  ];

  return (
    <div style={{ padding: '16px', color: 'var(--gm-text)', fontFamily: 'Inter, sans-serif' }}>
      <h3 style={{ margin: '0 0 16px', color: 'var(--gm-accent-crimson, #E63946)' }}>Artist Flow Profiles</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {profiles.map((prof, idx) => (
          <div key={idx} style={{ background: 'var(--gm-bg-medium)', padding: '12px', borderRadius: '4px', borderLeft: '4px solid var(--gm-accent-crimson, #E63946)' }}>
            <h4 style={{ margin: '0 0 10px', fontSize: '15px' }}>{prof.name}</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '11px', fontFamily: 'JetBrains Mono, monospace' }}>
              <div><span style={{ color: 'var(--gm-text-muted)', display: 'block', marginBottom: '2px' }}>Speed</span> {prof.speed}</div>
              <div><span style={{ color: 'var(--gm-text-muted)', display: 'block', marginBottom: '2px' }}>Density</span> {prof.density}</div>
              <div><span style={{ color: 'var(--gm-text-muted)', display: 'block', marginBottom: '2px' }}>Vocab</span> {prof.vocab}</div>
              <div><span style={{ color: 'var(--gm-text-muted)', display: 'block', marginBottom: '2px' }}>Energy</span> {prof.energy}</div>
            </div>
            <button 
              onClick={() => handleApplyFlow(prof.name)}
              style={{ width: '100%', marginTop: '16px', padding: '8px', background: 'var(--gm-bg-dark)', color: 'var(--gm-accent-ice, #F0F8FF)', border: '1px solid var(--gm-accent-crimson, #E63946)', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', transition: 'all 0.2s' }}
              onMouseOver={(e) => e.target.style.boxShadow = '0 0 8px rgba(230, 57, 70, 0.4)'}
              onMouseOut={(e) => e.target.style.boxShadow = 'none'}
            >
              Apply Flow to Lyric Forge
            </button>
          </div>
        ))}
      </div>
      {toastMsg && (
        <div style={{
          position: 'absolute',
          bottom: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'var(--gm-led-crimson)',
          color: '#fff',
          padding: '8px 16px',
          borderRadius: '4px',
          boxShadow: '0 0 12px rgba(230, 57, 70, 0.6)',
          fontWeight: 'bold',
          fontSize: '12px',
          zIndex: 1000
        }}>
          {toastMsg}
        </div>
      )}
    </div>
  );
}
