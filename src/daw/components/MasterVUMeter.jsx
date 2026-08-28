import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import './MasterVUMeter.css';
import { valueToDb } from './HardwareFader';

/**
 * Scale tick definitions for vertical VU meter dB calibration.
 */
const VERTICAL_TICKS = [
  { val: 10.0, label: '+6', isClip: true },
  { val: 8.5, label: '+3' },
  { val: 7.0, label: '0', isUnity: true },
  { val: 5.8, label: '-3' },
  { val: 5.0, label: '-6' },
  { val: 3.5, label: '-12' },
  { val: 2.3, label: '-18' },
  { val: 1.5, label: '-24' },
  { val: 0.0, label: '-∞' },
];

/**
 * MasterVUMeter Component for Lyricist 4.2.0 Pro.
 * Stereo dual-channel dynamic LED ladder meter (Left / Right).
 * Supports horizontal compact mode for the Transport Bar and full vertical mode for channel strips.
 * Features a 3-stage dynamic LED system (Ice White -> Warm Amber -> Crimson Red) and peak/clip hold.
 *
 * @param {Object} props
 * @param {number} [props.leftLevel=0] - Amplitude level for Left channel (0 to 10).
 * @param {number} [props.rightLevel=0] - Amplitude level for Right channel (0 to 10).
 * @param {number|string} [props.height] - Height of the component (default 24 for horizontal, 140 for vertical).
 * @param {number|string} [props.width] - Optional width override.
 * @param {'horizontal'|'vertical'} [props.orientation='horizontal'] - Orientation of the meter.
 * @param {boolean} [props.compact=false] - Ultra-compact layout for toolbar / transport placement.
 * @param {string} [props.label='MASTER'] - Title label.
 * @param {boolean} [props.showLabels=true] - Whether to display channel labels (L / R).
 * @param {boolean} [props.showScale=true] - Whether to display dB scale markings (in vertical mode).
 * @param {boolean} [props.showReadout=true] - Whether to display numerical peak readout (in horizontal mode).
 * @param {number} [props.segments=16] - Number of LED segments per channel ladder.
 * @param {number} [props.clipHoldTime=1500] - Duration in ms to hold clip indicator.
 * @param {function(): void} [props.onResetClip] - Optional callback when clip indicators are reset.
 * @param {string} [props.className=''] - Additional CSS classes.
 * @param {React.CSSProperties} [props.style] - Inline CSS styles.
 * @returns {JSX.Element}
 */
export default function MasterVUMeter({
  leftLevel = 0,
  rightLevel = 0,
  height,
  width,
  orientation = 'horizontal',
  compact = false,
  label = 'MASTER',
  showLabels = true,
  showScale = true,
  showReadout = true,
  segments = 16,
  clipHoldTime = 1500,
  onResetClip,
  className = '',
  style = {},
}) {
  const isVertical = orientation === 'vertical';
  const defaultHeight = isVertical ? 140 : (compact ? 18 : 24);
  const resolvedHeight = height !== undefined ? height : defaultHeight;

  // Peak and Clip hold states
  const [leftPeak, setLeftPeak] = useState(0);
  const [rightPeak, setRightPeak] = useState(0);
  const [leftClipped, setLeftClipped] = useState(false);
  const [rightClipped, setRightClipped] = useState(false);

  const leftPeakTimer = useRef(null);
  const rightPeakTimer = useRef(null);
  const leftClipTimer = useRef(null);
  const rightClipTimer = useRef(null);

  const normLeft = Math.max(0, Math.min(10, Number.isFinite(leftLevel) ? leftLevel : 0));
  const normRight = Math.max(0, Math.min(10, Number.isFinite(rightLevel) ? rightLevel : 0));

  // Left channel Peak & Clip tracking
  useEffect(() => {
    if (normLeft >= leftPeak) {
      setLeftPeak(normLeft);
      if (leftPeakTimer.current) clearTimeout(leftPeakTimer.current);
      leftPeakTimer.current = setTimeout(() => {
        setLeftPeak(0);
      }, 1200);
    }
    if (normLeft >= 9.85) {
      setLeftClipped(true);
      if (leftClipTimer.current) clearTimeout(leftClipTimer.current);
      leftClipTimer.current = setTimeout(() => {
        setLeftClipped(false);
      }, clipHoldTime);
    }
  }, [normLeft, leftPeak, clipHoldTime]);

  // Right channel Peak & Clip tracking
  useEffect(() => {
    if (normRight >= rightPeak) {
      setRightPeak(normRight);
      if (rightPeakTimer.current) clearTimeout(rightPeakTimer.current);
      rightPeakTimer.current = setTimeout(() => {
        setRightPeak(0);
      }, 1200);
    }
    if (normRight >= 9.85) {
      setRightClipped(true);
      if (rightClipTimer.current) clearTimeout(rightClipTimer.current);
      rightClipTimer.current = setTimeout(() => {
        setRightClipped(false);
      }, clipHoldTime);
    }
  }, [normRight, rightPeak, clipHoldTime]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (leftPeakTimer.current) clearTimeout(leftPeakTimer.current);
      if (rightPeakTimer.current) clearTimeout(rightPeakTimer.current);
      if (leftClipTimer.current) clearTimeout(leftClipTimer.current);
      if (rightClipTimer.current) clearTimeout(rightClipTimer.current);
    };
  }, []);

  // Reset clip and peaks on user click
  const handleReset = useCallback(() => {
    setLeftClipped(false);
    setRightClipped(false);
    setLeftPeak(0);
    setRightPeak(0);
    if (onResetClip) onResetClip();
  }, [onResetClip]);

  // Highest instantaneous peak dB string
  const maxCurrentLevel = Math.max(normLeft, normRight);
  const maxPeakLevel = Math.max(leftPeak, rightPeak);
  const maxDisplayLevel = maxPeakLevel > 0 ? maxPeakLevel : maxCurrentLevel;
  const isAnyClip = leftClipped || rightClipped || maxDisplayLevel >= 9.85;
  const readoutDb = isAnyClip ? 'CLIP' : valueToDb(maxDisplayLevel);

  /**
   * Helper to build segment elements for a channel.
   * @param {number} level - Current live channel level
   * @param {number} peak - Channel peak level
   * @param {string} prefix - Class prefix ('master-vu__h-seg' or 'master-vu__v-seg')
   * @returns {JSX.Element[]}
   */
  const renderSegments = (level, peak, prefix) => {
    const list = [];
    for (let i = 0; i < segments; i++) {
      const segVal = ((i + 1) / segments) * 10;
      const prevSegVal = (i / segments) * 10;

      let stage = 'stage1'; // 0-5 Ice White
      if (segVal > 8) {
        stage = 'stage3'; // 9-10 Crimson Red
      } else if (segVal > 5) {
        stage = 'stage2'; // 6-8 Warm Amber
      }

      const isLit = level >= segVal || (level > prevSegVal && level < segVal);
      const isPeak = !isLit && peak >= prevSegVal && peak <= segVal && peak > 0.4;

      let segClass = `${prefix} master-vu__seg--${stage}`;
      if (isLit) segClass += ' master-vu__seg--lit';
      if (isPeak) segClass += ' master-vu__seg--peak';

      list.push(<div key={i} className={segClass} />);
    }
    return list;
  };

  const containerStyle = {
    ...style,
    ...(width !== undefined ? { width: typeof width === 'number' ? `${width}px` : width } : {}),
    ...(resolvedHeight !== undefined ? { height: typeof resolvedHeight === 'number' ? `${resolvedHeight}px` : resolvedHeight } : {}),
  };

  // ══════════════════════════════════════════════════════════════════
  // HORIZONTAL ORIENTATION (Transport Bar / Compact Toolbar)
  // ══════════════════════════════════════════════════════════════════
  if (!isVertical) {
    return (
      <div
        className={`master-vu master-vu--horizontal ${compact ? 'master-vu--compact' : ''} ${className}`}
        style={containerStyle}
        onDoubleClick={handleReset}
        title={`Master VU: L ${normLeft.toFixed(1)} / R ${normRight.toFixed(1)}`}
      >
        {/* Optional Header Row */}
        {!compact && (label || showReadout) && (
          <div className="master-vu__h-header">
            {label && <span className="master-vu__h-title">{label}</span>}
            {showReadout && (
              <span className={`master-vu__h-peak-text ${isAnyClip ? 'master-vu__h-peak-text--clip' : ''}`}>
                {readoutDb}
              </span>
            )}
          </div>
        )}

        {/* Left Channel */}
        <div className="master-vu__h-channel">
          {showLabels && <span className="master-vu__h-label">L</span>}
          <div className="master-vu__h-track">
            {renderSegments(normLeft, leftPeak, 'master-vu__h-seg')}
          </div>
          <div
            className={`master-vu__h-clip ${leftClipped ? 'master-vu__h-clip--active' : ''}`}
            onClick={handleReset}
            title={leftClipped ? 'Left Clipped (Click to reset)' : 'Left Clip'}
          />
        </div>

        {/* Right Channel */}
        <div className="master-vu__h-channel">
          {showLabels && <span className="master-vu__h-label">R</span>}
          <div className="master-vu__h-track">
            {renderSegments(normRight, rightPeak, 'master-vu__h-seg')}
          </div>
          <div
            className={`master-vu__h-clip ${rightClipped ? 'master-vu__h-clip--active' : ''}`}
            onClick={handleReset}
            title={rightClipped ? 'Right Clipped (Click to reset)' : 'Right Clip'}
          />
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════
  // VERTICAL ORIENTATION (Full Master Section / Channel Strip Rack)
  // ══════════════════════════════════════════════════════════════════
  const trackHeight = typeof resolvedHeight === 'number'
    ? Math.max(60, resolvedHeight - 56)
    : `calc(${resolvedHeight} - 56px)`;

  return (
    <div
      className={`master-vu master-vu--vertical ${className}`}
      style={containerStyle}
      onDoubleClick={handleReset}
      title={`Master VU: L ${normLeft.toFixed(1)} / R ${normRight.toFixed(1)}`}
    >
      {/* Header with Title and Clip LEDs */}
      <div className="master-vu__v-header">
        {label && <span className="master-vu__v-title">{label}</span>}
        <div className="master-vu__v-clip-row">
          <div
            className="master-vu__v-clip-indicator"
            onClick={handleReset}
            title={leftClipped ? 'L Clip (Click to reset)' : 'L Normal'}
          >
            <div className={`master-vu__v-clip-led ${leftClipped ? 'master-vu__v-clip-led--active' : ''}`} />
            <span className="master-vu__v-clip-label">L</span>
          </div>
          <div
            className="master-vu__v-clip-indicator"
            onClick={handleReset}
            title={rightClipped ? 'R Clip (Click to reset)' : 'R Normal'}
          >
            <div className={`master-vu__v-clip-led ${rightClipped ? 'master-vu__v-clip-led--active' : ''}`} />
            <span className="master-vu__v-clip-label">R</span>
          </div>
        </div>
      </div>

      {/* Main Metering Columns & Center dB Scale */}
      <div className="master-vu__v-body">
        {/* Left Column */}
        <div className="master-vu__v-column">
          <div className="master-vu__v-track" style={{ height: trackHeight }}>
            {renderSegments(normLeft, leftPeak, 'master-vu__v-seg')}
          </div>
          {showLabels && <span className="master-vu__v-channel-tag">L</span>}
        </div>

        {/* Center Calibrated dB Scale */}
        {showScale && (
          <div className="master-vu__v-scale" style={{ height: trackHeight }}>
            {VERTICAL_TICKS.map((tick) => {
              const tickPercent = (tick.val / 10) * 100;
              const tickClass = `master-vu__v-tick ${tick.isUnity ? 'master-vu__v-tick--unity' : ''} ${tick.isClip ? 'master-vu__v-tick--clip' : ''}`;
              return (
                <div
                  key={tick.val}
                  className={tickClass}
                  style={{ bottom: `${tickPercent}%` }}
                >
                  <span className="master-vu__v-tick-label">{tick.label}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Right Column */}
        <div className="master-vu__v-column">
          <div className="master-vu__v-track" style={{ height: trackHeight }}>
            {renderSegments(normRight, rightPeak, 'master-vu__v-seg')}
          </div>
          {showLabels && <span className="master-vu__v-channel-tag">R</span>}
        </div>
      </div>
    </div>
  );
}
