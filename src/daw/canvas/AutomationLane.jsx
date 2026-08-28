import React, { useState, useRef, useEffect, useCallback } from 'react';
import automationEngine from '../engine/AutomationEngine';
import './AutomationLane.css';

/**
 * @typedef {Object} AutomationLaneProps
 * @property {Object} track - The track object { id: string, name: string }.
 * @property {number} totalBars - The total number of bars in the arranger.
 * @property {number} barWidth - Pixel width per bar.
 * @property {number} currentPlayhead - Current playhead position in bars.
 */

/**
 * Expandable automation sub-lane component for TimelineArranger.
 * @param {AutomationLaneProps} props
 * @returns {JSX.Element}
 */
const AutomationLane = ({ track, totalBars, barWidth, currentPlayhead }) => {
  const [selectedParam, setSelectedParam] = useState('Volume');
  const [writeMode, setWriteMode] = useState(false);
  const [breakpoints, setBreakpoints] = useState([]);
  
  const svgRef = useRef(null);
  const [draggingPoint, setDraggingPoint] = useState(null);

  const laneHeight = 100;
  const laneWidth = totalBars * barWidth;

  // Sync state with engine
  const fetchBreakpoints = useCallback(() => {
    if (automationEngine.data[track.id] && automationEngine.data[track.id][selectedParam]) {
      setBreakpoints([...automationEngine.data[track.id][selectedParam]]);
    } else {
      setBreakpoints([]);
    }
  }, [track.id, selectedParam]);

  useEffect(() => {
    fetchBreakpoints();
  }, [fetchBreakpoints]);

  /**
   * Map bar and value to X/Y canvas coordinates.
   */
  const getCoords = (bar, value) => {
    return {
      x: bar * barWidth,
      y: (1 - value) * laneHeight
    };
  };

  /**
   * Map X/Y canvas coordinates back to bar and value.
   */
  const getValues = (x, y) => {
    return {
      bar: Math.max(0, Math.min(totalBars, x / barWidth)),
      value: Math.max(0, Math.min(1, 1 - (y / laneHeight)))
    };
  };

  /**
   * Handle SVG Click to add a breakpoint
   */
  const handleSvgClick = (e) => {
    if (draggingPoint) return;
    if (!svgRef.current) return;

    const rect = svgRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const { bar, value } = getValues(x, y);
    automationEngine.addBreakpoint(track.id, selectedParam, bar, value, 0);
    fetchBreakpoints();
  };

  /**
   * Handle double-click on node to remove
   */
  const handleNodeDoubleClick = (e, id) => {
    e.stopPropagation();
    automationEngine.deleteBreakpoint(track.id, selectedParam, id);
    fetchBreakpoints();
  };

  /**
   * Handle node mousedown for dragging
   */
  const handleNodeMouseDown = (e, bp) => {
    e.stopPropagation();
    setDraggingPoint(bp.id);
  };

  /**
   * Handle mouse move during dragging
   */
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!draggingPoint || !svgRef.current) return;

      const rect = svgRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const { bar, value } = getValues(x, y);

      automationEngine.deleteBreakpoint(track.id, selectedParam, draggingPoint);
      const newBp = automationEngine.addBreakpoint(track.id, selectedParam, bar, value, 0);
      
      setDraggingPoint(newBp.id);
      fetchBreakpoints();
    };

    const handleMouseUp = () => {
      if (draggingPoint) setDraggingPoint(null);
    };

    if (draggingPoint) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingPoint, barWidth, totalBars, track.id, selectedParam, fetchBreakpoints]);


  /**
   * Generate SVG Path String
   */
  const generatePath = () => {
    if (breakpoints.length === 0) return '';
    
    const sorted = [...breakpoints].sort((a, b) => a.bar - b.bar);
    
    let path = `M 0 ${getCoords(0, sorted[0].value).y} `;
    
    sorted.forEach((bp, index) => {
      const { x, y } = getCoords(bp.bar, bp.value);
      
      if (index === 0) {
        path += `L ${x} ${y} `;
      } else {
        path += `L ${x} ${y} `;
      }
    });

    path += `L ${laneWidth} ${getCoords(totalBars, sorted[sorted.length - 1].value).y}`;
    
    return path;
  };

  const handleClear = () => {
    if (automationEngine.data[track.id]) {
      automationEngine.data[track.id][selectedParam] = [];
      fetchBreakpoints();
    }
  };

  return (
    <div className="automation-lane">
      <div className="automation-header">
        <div className="param-selector">
          <select 
            value={selectedParam} 
            onChange={(e) => setSelectedParam(e.target.value)}
          >
            <option value="Volume">Volume</option>
            <option value="Pan">Pan</option>
            <option value="Filter Cutoff">Filter Cutoff</option>
            <option value="Reverb Mix">Reverb Mix</option>
          </select>
        </div>
        <div className="automation-actions">
          <button 
            className={`write-toggle ${writeMode ? 'active' : ''}`}
            onClick={() => setWriteMode(!writeMode)}
          >
            {writeMode ? 'Write Mode: ON' : 'Write Mode: OFF'}
          </button>
          <button className="clear-btn" onClick={handleClear}>Clear</button>
        </div>
      </div>

      <div className="automation-canvas-container" style={{ width: laneWidth, height: laneHeight }}>
        <svg 
          ref={svgRef}
          className="automation-svg" 
          width={laneWidth} 
          height={laneHeight}
          onClick={handleSvgClick}
        >
          {/* Automation Path */}
          <path 
            className="automation-path" 
            d={generatePath()} 
            fill="none" 
            stroke="url(#led-gradient)" 
            strokeWidth="2"
          />

          {/* Definitions for glowing LED gradient */}
          <defs>
            <linearGradient id="led-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="var(--gm-ice-white, #F0F8FF)" />
              <stop offset="100%" stopColor="var(--gm-warm-amber, #FF9900)" />
            </linearGradient>
            <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Breakpoint Nodes */}
          {breakpoints.map(bp => {
            const { x, y } = getCoords(bp.bar, bp.value);
            return (
              <circle
                key={bp.id}
                cx={x}
                cy={y}
                r={4}
                className="automation-node"
                onMouseDown={(e) => handleNodeMouseDown(e, bp)}
                onDoubleClick={(e) => handleNodeDoubleClick(e, bp.id)}
              />
            );
          })}

          {/* Playhead indicator */}
          <line 
            x1={currentPlayhead * barWidth} 
            y1={0} 
            x2={currentPlayhead * barWidth} 
            y2={laneHeight} 
            className="playhead-line"
          />
        </svg>
      </div>
    </div>
  );
};

export default AutomationLane;
