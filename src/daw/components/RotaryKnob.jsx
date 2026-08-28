import React, { useRef, useEffect, useCallback, useState } from 'react';
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
 * Determines the LED colour for a segment, by how far up the sweep it sits.
 * @param {number} fraction - Segment position along the sweep (0-1)
 * @returns {string} The hex color code
 */
function getSegmentColor(fraction) {
  if (fraction <= 0.5) return '#F0F8FF'; // Ice White
  if (fraction <= 0.8) return '#FF9900'; // Warm Amber
  return '#E63946'; // Crimson Red
}

/** Snap a number to a step grid without accumulating float drift. */
function quantize(val, min, step) {
  if (!step) return val;
  return min + Math.round((val - min) / step) * step;
}

/** Trim float fuzz so 3.0000000000000004 displays as 3. */
function tidy(val, step) {
  const decimals = step && step < 1 ? Math.min(4, Math.ceil(-Math.log10(step))) : 0;
  return Number(val.toFixed(decimals));
}

/**
 * RotaryKnob — the single knob used across the DAW.
 *
 * Three ways to turn it, all live on the whole control (ring, body and label):
 *   - hover + mouse wheel  (fine; hold Shift for finer, Ctrl/Cmd for coarse)
 *   - click and drag vertically (200px travels the full range; Shift for fine)
 *   - focus + arrow keys / PageUp / PageDown / Home / End
 * Double click resets to `defaultValue`.
 *
 * @param {Object} props
 * @param {number} props.value - Current value, in `min`..`max` units
 * @param {function(number): void} props.onChange - Called with the new value
 * @param {number} [props.min=0] - Lower bound
 * @param {number} [props.max=10] - Upper bound
 * @param {number} [props.step] - Quantisation grid; defaults to 1/200th of the range
 * @param {number} [props.size=64] - Pixel size of the knob
 * @param {string} [props.label=''] - Label rendered below the knob
 * @param {string} [props.unit=''] - Unit suffix appended to the readout
 * @param {string} [props.color] - Override the lit-LED colour
 * @param {number} [props.segments=24] - Number of LED segments
 * @param {number} [props.defaultValue] - Reset target on double click; defaults to the midpoint
 * @param {boolean} [props.showValue=true] - Render the numeric readout
 * @param {function(number): (string|number)} [props.formatLabel] - Custom readout formatter
 * @param {function(number): (string|number)} [props.format] - Alias of formatLabel
 * @param {boolean} [props.disabled=false] - Ignore all input
 */
export default function RotaryKnob({
  value,
  onChange,
  min = 0,
  max = 10,
  step,
  size = 64,
  label = '',
  unit = '',
  color,
  segments = 24,
  defaultValue,
  showValue = true,
  formatLabel,
  format,
  disabled = false,
  ...rest
}) {
  const containerRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const range = (max - min) || 1;
  const effStep = step ?? range / 200;
  const resetTo = defaultValue ?? min + range / 2;

  // Guard against a caller handing us undefined/NaN on first paint.
  const safeValue = Number.isFinite(value) ? value : resetTo;
  const clamped = Math.max(min, Math.min(max, safeValue));
  const percent = (clamped - min) / range;

  // Latest-value refs so the native wheel listener never needs re-binding and
  // the drag handler never reads a stale value mid-gesture.
  const stateRef = useRef({ value: clamped, onChange, min, max, effStep, disabled });
  stateRef.current = { value: clamped, onChange, min, max, effStep, disabled };

  const commit = useCallback((next) => {
    const s = stateRef.current;
    if (s.disabled || typeof s.onChange !== 'function') return;
    const q = quantize(Math.max(s.min, Math.min(s.max, next)), s.min, s.effStep);
    const tidied = tidy(Math.max(s.min, Math.min(s.max, q)), s.effStep);
    if (tidied !== s.value) s.onChange(tidied);
  }, []);

  // Wheel has to be a native non-passive listener: React's synthetic onWheel is
  // registered passively, so preventDefault there is ignored and the dock
  // scrolls out from under the knob instead of the knob turning.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handleWheel = (e) => {
      const s = stateRef.current;
      if (s.disabled) return;
      e.preventDefault();
      e.stopPropagation();
      const span = (s.max - s.min) || 1;
      // One notch = 1/50th of the range, so a full sweep is a comfortable
      // ~50 clicks. Shift narrows that to 1/400th for surgical moves.
      let increment = span / 50;
      if (e.shiftKey) increment = span / 400;
      else if (e.ctrlKey || e.metaKey) increment = span / 10;
      increment = Math.max(increment, s.effStep);
      // Trackpads report fractional deltas; sign is all we need.
      const dir = e.deltaY > 0 ? -1 : 1;
      commit(s.value + dir * increment);
    };
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [commit]);

  const handlePointerDown = useCallback((e) => {
    if (stateRef.current.disabled || e.button !== 0) return;
    e.preventDefault();
    const startY = e.clientY;
    const startValue = stateRef.current.value;
    setDragging(true);

    const handlePointerMove = (moveEvt) => {
      const s = stateRef.current;
      const span = (s.max - s.min) || 1;
      const deltaY = startY - moveEvt.clientY;
      // 200px of travel covers the full range; Shift stretches it to 800px.
      const travel = moveEvt.shiftKey ? 800 : 200;
      commit(startValue + (deltaY / travel) * span);
    };

    const handlePointerUp = () => {
      setDragging(false);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  }, [commit]);

  const handleDoubleClick = useCallback(() => {
    if (stateRef.current.disabled) return;
    commit(resetTo);
  }, [commit, resetTo]);

  const handleKeyDown = useCallback((e) => {
    const s = stateRef.current;
    if (s.disabled) return;
    const span = (s.max - s.min) || 1;
    const small = Math.max(span / 100, s.effStep);
    const big = Math.max(span / 10, s.effStep);
    switch (e.key) {
      case 'ArrowUp': case 'ArrowRight': commit(s.value + (e.shiftKey ? small / 10 : small)); break;
      case 'ArrowDown': case 'ArrowLeft': commit(s.value - (e.shiftKey ? small / 10 : small)); break;
      case 'PageUp': commit(s.value + big); break;
      case 'PageDown': commit(s.value - big); break;
      case 'Home': commit(s.min); break;
      case 'End': commit(s.max); break;
      default: return;
    }
    e.preventDefault();
  }, [commit]);

  // Compute LED segments
  const gap = 2;
  const totalSweep = 270;
  const segmentSweep = (totalSweep - (segments - 1) * gap) / segments;
  const arcs = [];

  for (let i = 0; i < segments; i++) {
    const startAngle = 225 - i * (segmentSweep + gap);
    const endAngle = startAngle - segmentSweep;
    const d = describeArc(50, 50, 44, startAngle, endAngle);

    const fraction = i / Math.max(1, segments - 1);
    const isLit = fraction <= percent + 1e-9;
    const litColor = color || getSegmentColor(fraction);
    const stroke = isLit ? litColor : '#333333';

    arcs.push(
      <path
        key={i}
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth="4"
        strokeLinecap="round"
        style={{
          filter: isLit ? `drop-shadow(0 0 3px ${litColor})` : 'none',
          transition: 'stroke 0.1s ease-out, filter 0.1s ease-out'
        }}
      />
    );
  }

  // Indicator line
  const currentAngle = 225 - percent * totalSweep;
  const indStart = polarToCartesian(50, 50, 12, currentAngle);
  const indEnd = polarToCartesian(50, 50, 28, currentAngle);

  const fmt = formatLabel || format;
  const readout = fmt ? fmt(clamped) : `${tidy(clamped, effStep)}${unit}`;

  return (
    <div
      ref={containerRef}
      className={`rotary-knob${dragging ? ' rotary-knob--dragging' : ''}${disabled ? ' rotary-knob--disabled' : ''}`}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={clamped}
      aria-label={label || 'knob'}
      aria-disabled={disabled || undefined}
      onPointerDown={handlePointerDown}
      onDoubleClick={handleDoubleClick}
      onKeyDown={handleKeyDown}
      style={{ touchAction: 'none' }}
      {...rest}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        style={{ overflow: 'visible', display: 'block' }}
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
      {showValue && <span className="rotary-knob__value">{readout}</span>}
    </div>
  );
}
