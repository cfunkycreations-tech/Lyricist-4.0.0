import React, { useState } from 'react';
import { useLyricStore } from '../../context/LyricStore.jsx';

/**
 * HelpTip — a small "?" help bubble for first-time songwriters.
 *
 * Drop one next to any label, control, or stat:
 *   <HelpTip text="Plain-English explanation of what this does and why it matters." />
 *
 * It only appears when the global Tips toggle is ON (see the header switch and
 * `tipsEnabled` in LyricStore). Shows on hover AND keyboard focus, so it works
 * for mouse and keyboard users alike.
 */
export default function HelpTip({ text, size = 15, style }) {
  const { tipsEnabled } = useLyricStore();
  const [open, setOpen] = useState(false);

  // Respect the global Tips switch; render nothing with no text.
  if (!tipsEnabled || !text) return null;

  return (
    <span
      className="help-tip"
      tabIndex={0}
      role="button"
      aria-label={text}
      style={style}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
    >
      <span
        className="help-tip-mark"
        style={{ width: size, height: size, fontSize: `${size * 0.72}px` }}
      >
        ?
      </span>
      {open && (
        <span className="help-tip-bubble" role="tooltip">
          {text}
        </span>
      )}
    </span>
  );
}
