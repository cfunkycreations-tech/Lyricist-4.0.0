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
    setToastMsg(`Now writing in ${profName}`);
    setTimeout(() => {
      setToastMsg(null);
    }, 2500);
  };

  // Plain-English values only. "Vocab: Tier 2" and "Density: Low" told the
  // person writing the song nothing about what they were choosing.
  const profiles = [
    { name: 'Houston Slow Flow', tempo: '60-80 BPM', words: 'Few, spaced out', wording: 'Everyday', mood: 'Smooth' },
    { name: 'Late Night Melodic', tempo: '80-100 BPM', words: 'Steady', wording: 'Everyday', mood: 'Moody' },
    { name: 'Fast Rhyme Density', tempo: '120-160 BPM', words: 'Packed tight', wording: 'Advanced', mood: 'Aggressive' },
    { name: 'Storyteller Folk', tempo: '70-90 BPM', words: 'Steady', wording: 'Descriptive', mood: 'Narrative' },
    { name: 'Neo-Soul Pocket', tempo: '85-95 BPM', words: 'Steady', wording: 'Descriptive', mood: 'Groovy' },
  ];

  return (
    <div style={{ padding: '16px', color: 'var(--gm-text)', fontFamily: 'Inter, sans-serif' }}>
      <h3 className="gm-panel-title">Rap Styles</h3>
      <p style={{ margin: '-8px 0 16px', fontSize: '11px', lineHeight: 1.5, color: 'var(--gm-text-muted)' }}>
        Pick how you want to sound. This sets the tempo, how many words you pack
        in, and the mood the AI writes in.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {profiles.map((prof, idx) => (
          <div
            key={idx}
            style={{
              background: 'linear-gradient(180deg, #232329 0%, #1A1A1E 100%)',
              padding: '14px',
              borderRadius: '6px',
              border: '1px solid var(--gm-border)',
              borderLeft: '3px solid var(--gm-accent-amber)',
              boxShadow: '0 2px 6px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.04)'
            }}
          >
            <h4 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: 700, color: 'var(--gm-text-active)' }}>{prof.name}</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '11px', fontFamily: 'JetBrains Mono, monospace' }}>
              <div><span style={{ color: 'var(--gm-text-muted)', display: 'block', marginBottom: '2px' }}>Tempo</span> {prof.tempo}</div>
              <div><span style={{ color: 'var(--gm-text-muted)', display: 'block', marginBottom: '2px' }}>Words</span> {prof.words}</div>
              <div><span style={{ color: 'var(--gm-text-muted)', display: 'block', marginBottom: '2px' }}>Wording</span> {prof.wording}</div>
              <div><span style={{ color: 'var(--gm-text-muted)', display: 'block', marginBottom: '2px' }}>Mood</span> {prof.mood}</div>
            </div>
            <button 
              onClick={() => handleApplyFlow(prof.name)}
              style={{ width: '100%', marginTop: '16px', padding: '8px', background: 'var(--gm-bg-dark)', color: 'var(--gm-accent-amber)', border: '1px solid rgba(255,176,32,0.45)', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px', transition: 'all 0.2s' }}
              onMouseOver={(e) => { e.currentTarget.style.boxShadow = '0 0 10px rgba(255,176,32,0.35)'; e.currentTarget.style.borderColor = 'var(--gm-accent-amber)'; }}
              onMouseOut={(e) => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = 'rgba(255,176,32,0.45)'; }}
            >
              Write in this style
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
          background: 'var(--gm-accent-amber)',
          color: '#1A1A1A',
          padding: '8px 16px',
          borderRadius: '4px',
          boxShadow: '0 0 14px rgba(255, 176, 32, 0.5)',
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
