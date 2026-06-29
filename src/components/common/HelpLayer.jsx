import React, { useEffect, useState } from 'react';
import { useLyricStore } from '../../context/LyricStore.jsx';

/**
 * HelpLayer — the app-wide "explain anything on hover" engine (4.0.x).
 *
 * Mount this ONCE near the top of the app. Then, on ANY element anywhere,
 * add a `data-help="plain-English explanation"` attribute:
 *
 *   <label data-help="A bridge is a short section that breaks the pattern...">Bridge</label>
 *   <button data-help="Writes the chorus first, then builds verses around it.">Hook-first mode</button>
 *
 * Hovering that element (or anything inside it) pops a bubble explaining it,
 * written for someone who has never written a song. The global 💡 Tips switch
 * (tipsEnabled) turns the whole thing on or off — when off, nothing shows.
 *
 * This is attribute-driven on purpose: adding help to a control is a one-line
 * `data-help="..."` edit, so every label, stat, and option in the UI can be
 * explained without restructuring the components.
 */
export default function HelpLayer() {
  const { tipsEnabled } = useLyricStore();
  const [tip, setTip] = useState(null); // { text, x, y }

  useEffect(() => {
    if (!tipsEnabled) {
      setTip(null);
      return;
    }

    const show = (el) => {
      const text = el.getAttribute('data-help');
      if (!text) return;
      const r = el.getBoundingClientRect();
      setTip({ text, x: r.left + r.width / 2, y: r.top });
    };

    const onOver = (e) => {
      const el = e.target.closest && e.target.closest('[data-help]');
      if (el) show(el);
    };

    const onOut = (e) => {
      const el = e.target.closest && e.target.closest('[data-help]');
      // Only hide when the cursor truly leaves the helped element.
      if (el && !el.contains(e.relatedTarget)) setTip(null);
    };

    // Hide if the user scrolls or the window changes under the bubble.
    const hide = () => setTip(null);

    document.addEventListener('mouseover', onOver);
    document.addEventListener('mouseout', onOut);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    return () => {
      document.removeEventListener('mouseover', onOver);
      document.removeEventListener('mouseout', onOut);
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
    };
  }, [tipsEnabled]);

  if (!tip) return null;

  // Position the bubble centered above the element, clamped to the viewport.
  const MAX_W = 300;
  const half = MAX_W / 2;
  const left = Math.min(Math.max(tip.x, half + 8), window.innerWidth - half - 8);
  const showBelow = tip.y < 90; // not enough room above → drop below
  const top = showBelow ? tip.y + 28 : tip.y - 12;

  return (
    <div
      className="help-layer-bubble"
      role="tooltip"
      style={{
        left,
        top,
        maxWidth: MAX_W,
        transform: showBelow ? 'translate(-50%, 0)' : 'translate(-50%, -100%)'
      }}
    >
      {tip.text}
      <span className={showBelow ? 'help-layer-arrow up' : 'help-layer-arrow down'} />
    </div>
  );
}
