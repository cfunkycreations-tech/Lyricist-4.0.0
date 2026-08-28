import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import './HardwareFader.css';

/**
 * Converts a 0-10 fader position to audio dB string.
 * Unity gain (0 dB) is calibrated at 7.0.
 *
 * @param {number} val - Fader value between 0 and 10
 * @returns {string} Formatted dB string (e.g. "+3.5 dB", "0.0 dB", "-12.0 dB", "-inf")
 */
export function valueToDb(val) {
  if (val <= 0.01) return '-∞ dB';
  let db = 0;
  if (val >= 7.0) {
    db = ((val - 7.0) / 3.0) * 6.0;
  } else if (val >= 5.0) {
    db = -6.0 + ((val - 5.0) / 2.0) * 6.0;
  } else if (val >= 3.5) {
    db = -12.0 + ((val - 3.5) / 1.5) * 6.0;
  } else if (val >= 1.5) {
    db = -24.0 + ((val - 1.5) / 2.0) * 12.0;
  } else {
    db = -60.0 + (val / 1.5) * 36.0;
  }

  if (Math.abs(db) < 0.05) return '0.0 dB';
  return db > 0 ? `+${db.toFixed(1)} dB` : `${db.toFixed(1)} dB`;
}

/**
 * Scale tick definitions mapping normalized position [0..10] to dB tick labels.
 */
const SCALE_TICKS = [
  { val: 10.0, label: '+6', isClip: true },
  { val: 7.0, label: '0', isUnity: true },
  { val: 5.0, label: '-6' },
  { val: 3.5, label: '-12' },
  { val: 1.5, label: '-24' },
  { val: 0.0, label: '-inf' },
];

/**
 * HardwareFader component for Lyricist 4.2.0 Pro.
 * Features a brushed nickel slider cap, dark recessed track, dB scale calibration,
 * and an integrated 3-stage LED peak ladder meter (Ice White -> Warm Amber -> Crimson Red).
 *
 * @param {Object} props
 * @param {number} [props.value=7.0] - Controlled fader level (0 to 10). 7.0 corresponds to 0 dB Unity.
 * @param {function(number): void} [props.onChange] - Callback when fader value changes.
 * @param {number|string} [props.height=120] - Height of the fader track area in pixels.
 * @param {string} [props.label=''] - Channel/fader text label.
 * @param {number} [props.meterLevel=0] - Live audio amplitude level (0 to 10).
 * @param {boolean} [props.showMeter=true] - Whether to show the integrated LED ladder meter.
 * @param {boolean} [props.muted=false] - Whether the fader channel is currently muted.
 * @param {function(boolean): void} [props.onMuteToggle] - Optional callback for mute toggle.
 * @param {number} [props.defaultValue=7.0] - Default reset value on double-click (unity = 7.0).
 * @param {boolean} [props.showScale=true] - Whether to render dB tick marks.
 * @param {boolean} [props.showReadout=true] - Whether to render the numerical dB readout badge.
 * @param {number} [props.segments=16] - Number of LED segments in the peak meter.
 * @param {string} [props.className=''] - Additional CSS classes.
 * @param {React.CSSProperties} [props.style] - Inline CSS styles.
 * @returns {JSX.Element}
 */
export default function HardwareFader({
  value = 7.0,
  onChange,
  height = 120,
  label = '',
  meterLevel = 0,
  showMeter = true,
  muted = false,
  onMuteToggle,
  defaultValue = 7.0,
  showScale = true,
  showReadout = true,
  segments = 16,
  className = '',
  style = {},
}) {
  const trackRef = useRef(null);
  const isDraggingRef = useRef(false);
  const [isDragging, setIsDragging] = useState(false);
  const [peakHoldLevel, setPeakHoldLevel] = useState(0);
  const peakTimeoutRef = useRef(null);

  const numericHeight = typeof height === 'number' ? height : parseInt(height, 10) || 120;
  const clampedValue = Math.max(0, Math.min(10, Number.isFinite(value) ? value : 7.0));

  // Dynamic peak hold management
  useEffect(() => {
    if (muted) {
      setPeakHoldLevel(0);
      return;
    }
    const currentLvl = Math.max(0, Math.min(10, meterLevel));
    if (currentLvl >= peakHoldLevel) {
      setPeakHoldLevel(currentLvl);
      if (peakTimeoutRef.current) clearTimeout(peakTimeoutRef.current);
      peakTimeoutRef.current = setTimeout(() => {
        setPeakHoldLevel(0);
      }, 1200);
    }
  }, [meterLevel, peakHoldLevel, muted]);

  useEffect(() => {
    return () => {
      if (peakTimeoutRef.current) clearTimeout(peakTimeoutRef.current);
    };
  }, []);

  // Update value from pointer coordinates relative to track
  const updateValueFromPointer = useCallback((clientY) => {
    if (!trackRef.current || !onChange) return;
    const rect = trackRef.current.getBoundingClientRect();
    const relativeY = rect.bottom - clientY;
    const normalized = Math.max(0, Math.min(1, relativeY / rect.height));
    const newVal = Math.round(normalized * 10 * 10) / 10;
    onChange(newVal);
  }, [onChange]);

  // Pointer drag handling
  const handlePointerDown = useCallback((e) => {
    e.preventDefault();
    isDraggingRef.current = true;
    setIsDragging(true);
    updateValueFromPointer(e.clientY);

    const handlePointerMove = (moveEvt) => {
      if (!isDraggingRef.current) return;
      updateValueFromPointer(moveEvt.clientY);
    };

    const handlePointerUp = () => {
      isDraggingRef.current = false;
      setIsDragging(false);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  }, [updateValueFromPointer]);

  // Mouse wheel adjustment
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;

    const handleWheel = (e) => {
      e.preventDefault();
      if (!onChange) return;
      const step = e.shiftKey ? 0.05 : 0.2;
      const delta = e.deltaY < 0 ? step : -step;
      const newVal = Math.max(0, Math.min(10, Math.round((clampedValue + delta) * 100) / 100));
      onChange(newVal);
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [clampedValue, onChange]);

  // Double click resets to unity (7.0 / 0 dB)
  const handleDoubleClick = useCallback((e) => {
    e.stopPropagation();
    if (onChange) {
      onChange(defaultValue);
    }
  }, [defaultValue, onChange]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e) => {
    if (!onChange) return;
    let step = 0.1;
    if (e.shiftKey) step = 0.5;

    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
      e.preventDefault();
      onChange(Math.min(10, Math.round((clampedValue + step) * 10) / 10));
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
      e.preventDefault();
      onChange(Math.max(0, Math.round((clampedValue - step) * 10) / 10));
    } else if (e.key === 'Home') {
      e.preventDefault();
      onChange(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      onChange(10);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onChange(defaultValue);
    }
  }, [clampedValue, defaultValue, onChange]);

  // Cap position calculation
  // Value 0 is bottom (0%), Value 10 is top (100%)
  const percentage = (clampedValue / 10) * 100;
  const isUnity = Math.abs(clampedValue - 7.0) < 0.15;
  const dbString = valueToDb(clampedValue);

  // Meter segments calculation
  const meterSegments = useMemo(() => {
    const list = [];
    const effectiveMeterLevel = muted ? 0 : Math.max(0, Math.min(10, meterLevel));
    const effectivePeak = muted ? 0 : peakHoldLevel;

    for (let i = 0; i < segments; i++) {
      // Segment normalized value range [0..10]
      const segVal = ((i + 1) / segments) * 10;
      const prevSegVal = (i / segments) * 10;

      let stage = 'stage1'; // 0-5 Ice White
      if (segVal > 8) {
        stage = 'stage3'; // 9-10 Crimson Red
      } else if (segVal > 5) {
        stage = 'stage2'; // 6-8 Warm Amber
      }

      const isLit = effectiveMeterLevel >= segVal || (effectiveMeterLevel > prevSegVal && effectiveMeterLevel < segVal);
      const isPeak = !isLit && effectivePeak >= prevSegVal && effectivePeak <= segVal && effectivePeak > 0.5;

      let segClass = `hw-fader__meter-seg hw-fader__meter-seg--${stage}`;
      if (isLit) segClass += ' hw-fader__meter-seg--lit';
      if (isPeak) segClass += ' hw-fader__meter-seg--peak';

      list.push(<div key={i} className={segClass} />);
    }
    return list;
  }, [segments, meterLevel, peakHoldLevel, muted]);

  return (
    <div
      className={`hw-fader ${muted ? 'hw-fader--muted' : ''} ${className}`}
      style={style}
    >
      {/* Header with Label & dB Readout */}
      {(label || showReadout) && (
        <div className="hw-fader__header">
          {label && <span className="hw-fader__label" title={label}>{label}</span>}
          {showReadout && (
            <span
              className={`hw-fader__readout ${isUnity ? 'hw-fader__readout--unity' : ''} ${muted ? 'hw-fader__readout--muted' : ''}`}
              title={muted ? 'Muted' : `Gain: ${dbString}`}
            >
              {muted ? 'MUTE' : dbString}
            </span>
          )}
        </div>
      )}

      {/* Main Body: dB Scale, Recessed Track Slot, and Dynamic Peak Meter */}
      <div className="hw-fader__body" style={{ height: `${numericHeight}px` }}>
        {/* Scale Ticks */}
        {showScale && (
          <div className="hw-fader__scale" style={{ height: `${numericHeight}px` }}>
            {SCALE_TICKS.map((tick) => {
              const tickPercent = (tick.val / 10) * 100;
              const tickClass = `hw-fader__tick ${tick.isUnity ? 'hw-fader__tick--unity' : ''} ${tick.isClip ? 'hw-fader__tick--clip' : ''}`;
              return (
                <div
                  key={tick.val}
                  className={tickClass}
                  style={{ bottom: `${tickPercent}%` }}
                >
                  <span className="hw-fader__tick-label">{tick.label}</span>
                  <div className="hw-fader__tick-mark" />
                </div>
              );
            })}
          </div>
        )}

        {/* Fader Track & Brushed Nickel Slider Cap */}
        <div
          ref={trackRef}
          className="hw-fader__track-slot"
          style={{ height: `${numericHeight}px` }}
          onPointerDown={handlePointerDown}
          onDoubleClick={handleDoubleClick}
        >
          {/* Recessed Track Groove */}
          <div className="hw-fader__track-groove">
            <div className="hw-fader__track-centerline" />
          </div>

          {/* Brushed Nickel Slider Cap */}
          <div
            className={`hw-fader__cap ${isDragging ? 'hw-fader__cap--dragging' : ''}`}
            style={{ bottom: `${percentage}%` }}
            tabIndex={0}
            role="slider"
            aria-label={label || 'Hardware Fader'}
            aria-valuenow={clampedValue}
            aria-valuemin={0}
            aria-valuemax={10}
            aria-valuetext={dbString}
            onKeyDown={handleKeyDown}
          >
            <div className="hw-fader__cap-bevel-top" />
            <div className="hw-fader__cap-ridge">
              <div className="hw-fader__cap-line" />
            </div>
            <div className="hw-fader__cap-bevel-bottom" />
          </div>
        </div>

        {/* Integrated 3-Stage LED Peak Ladder Meter */}
        {showMeter && (
          <div
            className="hw-fader__meter"
            style={{ height: `${numericHeight}px` }}
            title={`Peak Meter: ${meterLevel.toFixed(1)} / 10`}
          >
            {meterSegments}
          </div>
        )}
      </div>

      {/* Optional Mute Action Button */}
      {onMuteToggle && (
        <button
          type="button"
          className={`hw-fader__mute-btn ${muted ? 'hw-fader__mute-btn--active' : ''}`}
          onClick={() => onMuteToggle(!muted)}
          title={muted ? 'Unmute Channel' : 'Mute Channel'}
        >
          M
        </button>
      )}
    </div>
  );
}
