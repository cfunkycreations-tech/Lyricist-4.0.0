import React, { useState, useEffect } from 'react';
import TimelineArranger from './TimelineArranger';
import LyricForge from './LyricForge';
import './CenterCanvas.css';

/**
 * CenterCanvas Component
 * Host container with view mode switcher: Timeline Arranger, Lyric Forge, or Split View.
 */
const CenterCanvas = ({ onEditClip }) => {
  const [viewMode, setViewMode] = useState('split'); // 'timeline', 'lyric', 'split'

  useEffect(() => {
    const handleCycle = () => {
      setViewMode(prev => {
        if (prev === 'timeline') return 'lyric';
        if (prev === 'lyric') return 'split';
        return 'timeline';
      });
    };
    window.addEventListener('cycleViewMode', handleCycle);
    return () => window.removeEventListener('cycleViewMode', handleCycle);
  }, []);

  return (
    <div className="center-canvas-container">
      <div className="top-toolbar">
        <div className="view-switcher">
          <button 
            className={`view-btn ${viewMode === 'timeline' ? 'active' : ''}`}
            onClick={() => setViewMode('timeline')}
          >
            Timeline Arranger
          </button>
          <button 
            className={`view-btn ${viewMode === 'lyric' ? 'active' : ''}`}
            onClick={() => setViewMode('lyric')}
          >
            Lyric Forge
          </button>
          <button 
            className={`view-btn ${viewMode === 'split' ? 'active' : ''}`}
            onClick={() => setViewMode('split')}
          >
            Split View
          </button>
        </div>
      </div>
      
      <div className={`canvas-content ${viewMode === 'split' ? 'split-view' : ''}`}>
        {(viewMode === 'timeline' || viewMode === 'split') && (
          <TimelineArranger onEditClip={onEditClip} />
        )}
        
        {(viewMode === 'lyric' || viewMode === 'split') && (
          <LyricForge />
        )}
      </div>
    </div>
  );
};

export default CenterCanvas;
