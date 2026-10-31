import React from 'react';
import { POSES } from './GhostRiderMascot.jsx';
import './GhostPose.css';

/**
 * A small Ghost with a pose of his own, for the spots where the app can tell
 * what he should be doing (Chris, 2026-10-30): singing while the LP plays,
 * DJ-ing in Black Hole Studios, asleep on an empty page, celebrating when
 * Song Forge finishes. Each pose has its own motion in GhostPose.css, and a
 * change of pose pops in instead of snapping. Decorative (aria-hidden).
 */
const EXTRAS = {
  singing: ['♪', '♫', '♪'],
  sleepy: ['z', 'Z', 'z'],
  celebrating: ['✦', '✧', '✦', '✧', '✦'],
  dj: ['', ''],
};

export default function GhostPose({ pose = 'idle', size = 56, className = '', style }) {
  const extras = EXTRAS[pose] || [];
  return (
    <span
      className={`gpose gpose-${pose} ${className}`.trim()}
      style={{ '--gpose-size': typeof size === 'number' ? `${size}px` : size, ...style }}
      aria-hidden="true"
    >
      <span key={pose} className="gpose-pop">
        <img className="gpose-glow" src={POSES[pose] || POSES.idle} alt="" draggable="false" decoding="async" />
        <img className="gpose-art" src={POSES[pose] || POSES.idle} alt="" draggable="false" decoding="async" />
      </span>
      {extras.map((c, i) => c && <i key={`${pose}-${i}`} className="gpose-fx" style={{ '--i': i }}>{c}</i>)}
    </span>
  );
}
