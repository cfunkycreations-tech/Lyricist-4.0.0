import React, { useRef, useEffect, useCallback } from 'react';
import './RotaryKnob.css';

/**
 * Maps an angle to Cartesian coordinates for SVG.
 * @param {number} cx - Center X
 * @param {number} cy - Center Y
 * @param {number} r - Radius
 * @param {number} angleInDegrees - Angle in degrees
 * @returns {{x: number, y: number}} Cartesian coordinates
 */
function polarToCartesian(cx, cy, r, angleInDegrees) {
  const angleInRadians = (angleInDegrees * Math.PI) / 180.0;
  return {
    x: cx + r * Math.cos(angleInRadians),
    y: cy - r * Math.sin(angleInRadians)
  };
}

/**
 * Creates an SVG arc path string.
 * @param {number} cx - Center X
 * @param {number} cy - Center Y
 * @param {number} r - Radius
 * @param {number} startAngle - Start angle in degrees
 * @param {number} endAngle - End angle in degrees
 * @returns {string} SVG path string
 */
function describeArc(cx, cy, r, startAngle, endAngle) {
  const start = polarToCartesian(cx, cy, r, startAngle);
  const end = polarToCartesian(cx, cy, r, endAngle);
  const largeArcFlag = "0";
  const sweepFlag = "1";
  return [
    "M", start.x, start.y,
    "A", r, r, 0, largeArcFlag, sweepFlag, end.x, end.y
  ].join(" ");
}

/**
 * Determines the color for a given segment mapped value.
 * @param {number} segmentValue - The mapped value of the segment (0-10)
 * @returns {string} The hex color code
 */
function getSegmentColor(segmentValue) {
  if (segmentValue <= 5) return '#F0F8FF'; // Ice White
  if (segmentValue <= 8) return '#FF9900'; // Warm Amber
  return '#E63946'; // Crimson Red
}

/**
 * RotaryKnob component for Lyricist 4.2.0 Pro
 * 
 * @param {Object} props
 * @param {number} props.value - Current value (0-10)
 * @param {function(number): void} props.onChange - Callback when value changes
 * @param {number} [props.size=64] - Pixel size of the knob
 * @param {string} [props.label=''] - Label rendered below the knob
 * @param {number} [props.segments=24] - Number of LED segments
 * @param {number} [props.defaultValue=5] - Reset target on double click
 */
export default function RotaryKnob({
  value,
  onChange,
  size = 64,
  label = '',
  segments = 24,
  defaultValue = 5
}) {
  const containerRef = useRef(null);
  const valueRef = useRef(value);
  const startYRef = useRef(0);
  const startValueRef = useRef(0);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handleWheel = (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.5 : 0.5;
      let newVal = valueRef.current + delta;
      newVal = Math.max(0, Math.min(10, newVal));
      onChange(newVal);
    };
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [onChange]);

  const handlePointerDown = useCallback((e) => {
    e.preventDefault();
    startYRef.current = e.clientY;
    startValueRef.current = value;

    const handlePointerMove = (moveEvt) => {
      const deltaY = moveEvt.clientY - startYRef.current;
      let newVal = startValueRef.current - deltaY * 0.05;
      newVal = Math.max(0, Math.min(10, newVal));
      onChange(newVal);
    };

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  }, [value, onChange]);

  const handleDoubleClick = useCallback(() => {
    onChange(defaultValue);
  }, [onChange, defaultValue]);

  // Compute segments
  const gap = 2;
  const totalSweep = 270;
  const segmentSweep = (totalSweep - (segments - 1) * gap) / segments;
  const arcs = [];

  for (let i = 0; i < segments; i++) {
    const startAngle = 225 - i * (segmentSweep + gap);
    const endAngle = startAngle - segmentSweep;
    const d = describeArc(50, 50, 44, startAngle, endAngle);
    
    // Calculate what knob value this segment represents
    const segmentValue = (i / (Math.max(1, segments - 1))) * 10;
    const isLit = segmentValue <= value;
    const color = isLit ? getSegmentColor(segmentValue) : '#333333';
    
    arcs.push(
      <path
        key={i}
        d={d}
        fill="none"
        stroke={color}
        strokeWidth="4"
        strokeLinecap="round"
        style={{
          filter: isLit ? `drop-shadow(0 0 3px ${color})` : 'none',
          transition: 'stroke 0.1s ease-out, filter 0.1s ease-out'
        }}
      />
    );
  }

  // Indicator line
  const currentAngle = 225 - (value / 10) * totalSweep;
  const indStart = polarToCartesian(50, 50, 12, currentAngle);
  const indEnd = polarToCartesian(50, 50, 28, currentAngle);

  return (
    <div className="rotary-knob">
      <svg
        ref={containerRef}
        width={size}
        height={size}
        viewBox="0 0 100 100"
        onPointerDown={handlePointerDown}
        onDoubleClick={handleDoubleClick}
        style={{ overflow: 'visible' }}
      >
        <defs>
          <radialGradient id="knobBodyGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#3A3A3A" />
            <stop offset="100%" stopColor="#1A1A1A" />
          </radialGradient>
          <linearGradient id="capGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#D4D4D4" />
            <stop offset="100%" stopColor="#9A9A9A" />
          </linearGradient>
        </defs>

        {/* LED Ring */}
        <g>{arcs}</g>

        {/* Knob Body */}
        <circle
          cx="50"
          cy="50"
          r="32"
          fill="url(#knobBodyGrad)"
          stroke="#444"
          strokeWidth="1"
        />

        {/* Center Cap */}
        <circle
          cx="50"
          cy="50"
          r="12"
          fill="url(#capGrad)"
        />

        {/* Position Indicator */}
        <line
          x1={indStart.x}
          y1={indStart.y}
          x2={indEnd.x}
          y2={indEnd.y}
          stroke="#FFFFFF"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
      {label && <span className="rotary-knob__label">{label}</span>}
    </div>
  );
}
