import React, { useState } from 'react';
import TimelineArranger from './TimelineArranger';
import LyricForge from './LyricForge';
import './CenterCanvas.css';

/**
 * CenterCanvas Component
 * Host container with view mode switcher: Timeline Arranger, Lyric Forge, or Split View.
 */
const CenterCanvas = () => {
  const [viewMode, setViewMode] = useState('split'); // 'timeline', 'lyric', 'split'

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
          <TimelineArranger />
        )}
        
        {(viewMode === 'lyric' || viewMode === 'split') && (
          <LyricForge />
        )}
      </div>
    </div>
  );
};

export default CenterCanvas;
