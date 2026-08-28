import React from 'react';
import './RhymeHeatmap.css';

/**
 * RhymeHeatmap Component
 * Displays the rhyme scheme token bar, flow consistency meter, and syllable cadence.
 */
export default function RhymeHeatmap({ analyzedLines = [], flowConsistency = 0 }) {
  const getMeterColor = (score) => {
    if (score >= 80) return 'var(--gm-led-crimson, #E63946)';
    if (score >= 50) return 'var(--gm-led-amber, #FF9900)';
    return 'var(--gm-led-ice, #F0F8FF)';
  };

  return (
    <div className="rhyme-heatmap">
      <div className="rh-header">Rhyme Scheme Analysis</div>
      
      <div className="rh-section">
        <div className="rh-label">Flow Consistency</div>
        <div className="flow-meter">
          <div 
            className="flow-fill" 
            style={{ width: `${flowConsistency}%`, backgroundColor: getMeterColor(flowConsistency) }} 
          />
        </div>
        <div className="rh-value">{flowConsistency}%</div>
      </div>

      <div className="rh-section">
        <div className="rh-label">Scheme Pattern</div>
        <div className="rhyme-tokens">
          {analyzedLines.map((line, idx) => (
            line.rhymeTag ? (
              <div 
                key={line.id || idx} 
                className="rh-token" 
                style={{ backgroundColor: line.rhymeColor, color: '#111' }}
                title={`Line ${idx + 1}`}
              >
                {line.rhymeTag}
              </div>
            ) : null
          ))}
        </div>
      </div>

      <div className="rh-section">
        <div className="rh-label">Cadence Distribution</div>
        <div className="cadence-list">
          {analyzedLines.map((line, idx) => (
            line.cadence ? (
              <div key={line.id || idx} className="cadence-item">
                <span className="cadence-line-num">L{idx + 1}</span>
                <span className="cadence-pattern">{line.cadence}</span>
              </div>
            ) : null
          ))}
        </div>
      </div>
    </div>
  );
}
