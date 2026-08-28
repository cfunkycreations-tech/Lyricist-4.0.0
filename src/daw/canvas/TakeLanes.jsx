import React, { useState, useRef } from 'react';
import './TakeLanes.css';
import takeCompEngine from '../engine/TakeCompEngine';

/**
 * TakeLanes Component
 * Renders multiple take sub-lanes for multi-track comping.
 */
export default function TakeLanes({ track, totalBars, barWidth, onPromoteRegion }) {
  // Initialize mock takes for the UI
  const [takes, setTakes] = useState([
    { id: 'take-1', name: 'Take 1', color: '#4CC9F0', regions: [{ start: 0, length: 16, active: false }] },
    { id: 'take-2', name: 'Take 2', color: '#F72585', regions: [{ start: 0, length: 16, active: false }] },
    { id: 'take-3', name: 'Take 3', color: '#7209B7', regions: [{ start: 0, length: 16, active: false }] }
  ]);
  
  // Track master comped regions per take
  const [compRegions, setCompRegions] = useState([]);
  const laneRef = useRef(null);
  
  const [dragState, setDragState] = useState({
    isDragging: false,
    takeId: null,
    startX: 0,
    currentX: 0
  });

  const handleMouseDown = (e, takeId) => {
    if (!laneRef.current) return;
    const rect = laneRef.current.getBoundingClientRect();
    // adjust for the header width (100px)
    const x = e.clientX - rect.left - 100;
    if (x < 0) return;

    setDragState({
      isDragging: true,
      takeId,
      startX: x,
      currentX: x
    });
  };

  const handleMouseMove = (e) => {
    if (!dragState.isDragging || !laneRef.current) return;
    const rect = laneRef.current.getBoundingClientRect();
    const x = Math.max(0, e.clientX - rect.left - 100);
    setDragState(prev => ({ ...prev, currentX: x }));
  };

  const handleMouseUp = () => {
    if (dragState.isDragging && dragState.takeId) {
      const minX = Math.min(dragState.startX, dragState.currentX);
      const maxX = Math.max(dragState.startX, dragState.currentX);
      
      const startBar = Math.floor(minX / barWidth);
      const endBar = Math.ceil(maxX / barWidth);
      const length = Math.max(1, endBar - startBar);

      // Promote to engine
      takeCompEngine.promoteCompRegion(track.id, dragState.takeId, startBar, length);
      
      // Update local state to show active glowing regions
      const newRegion = {
        takeId: dragState.takeId,
        startBar,
        length
      };
      
      setCompRegions(prev => {
        // Remove overlaps (simplified for demo)
        const filtered = prev.filter(r => 
          !(r.startBar >= startBar && r.startBar < startBar + length)
        );
        return [...filtered, newRegion];
      });

      if (onPromoteRegion) {
        onPromoteRegion(track.id, dragState.takeId, startBar, length);
      }
    }
    setDragState({ isDragging: false, takeId: null, startX: 0, currentX: 0 });
  };

  return (
    <div 
      className="take-lanes-container"
      ref={laneRef}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {takes.map((take) => (
        <div key={take.id} className="take-lane">
          <div className="take-lane-header">{take.name}</div>
          <div 
            className="take-lane-content" 
            style={{ width: `${totalBars * barWidth}px` }}
            onMouseDown={(e) => handleMouseDown(e, take.id)}
          >
            {/* Render base take region (inactive) */}
            <div 
              className="take-region"
              style={{
                left: 0,
                width: `${totalBars * barWidth}px`
              }}
            >
              <div className="mini-waveform">
                {Array.from({ length: totalBars * 4 }).map((_, i) => (
                  <div key={i} className="mini-bar" style={{ height: `${20 + Math.sin(i * 0.3) * 80}%` }} />
                ))}
              </div>
            </div>

            {/* Render active comped regions */}
            {compRegions.filter(r => r.takeId === take.id).map((region, idx) => (
              <div
                key={idx}
                className="take-region active-comp"
                style={{
                  left: `${region.startBar * barWidth}px`,
                  width: `${region.length * barWidth}px`
                }}
              >
                <div className="mini-waveform">
                  {Array.from({ length: region.length * 4 }).map((_, i) => (
                    <div key={i} className="mini-bar" style={{ height: `${20 + Math.sin((region.startBar * 4 + i) * 0.3) * 80}%` }} />
                  ))}
                </div>
              </div>
            ))}

            {/* Render drag selection box */}
            {dragState.isDragging && dragState.takeId === take.id && (
              <div 
                style={{
                  position: 'absolute',
                  top: 0, bottom: 0,
                  left: `${Math.min(dragState.startX, dragState.currentX)}px`,
                  width: `${Math.abs(dragState.currentX - dragState.startX)}px`,
                  backgroundColor: 'rgba(255, 153, 0, 0.3)',
                  border: '1px solid var(--gm-led-amber, #FF9900)',
                  pointerEvents: 'none',
                  zIndex: 10
                }}
              />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
