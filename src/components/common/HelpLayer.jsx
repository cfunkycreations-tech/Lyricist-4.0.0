import React, { useEffect, useState } from 'react';
import { useLyricStore } from '../../context/LyricStore.jsx';

/**
 * HelpLayer — the app-wide "explain anything on hover" engine.
 *
 * Mount once near the top of the app. On ANY element, add:
 *   data-help="Plain English explanation for a first-time user."
 *
 * The header Tips switch (tipsEnabled) turns this on/off.
 * When Tips are ON, hover any control with data-help and a bubble appears.
 *
 * Designed so Quantum Lab, Songwriter, and every other tab can teach
 * themselves without reading a manual or replaying the welcome wizard.
 */
export default function HelpLayer() {
  const { tipsEnabled } = useLyricStore();
  const [tip, setTip] = useState(null); // { text, x, y, below }

  useEffect(() => {
    if (!tipsEnabled) {
      setTip(null);
      return;
    }

    const place = (el) => {
      const text = el.getAttribute('data-help');
      if (!text || !String(text).trim()) return;
      const r = el.getBoundingClientRect();
      // Prefer above the control; flip below if near the top of the window.
      const below = r.top < 110;
      setTip({
        text: String(text).trim(),
        x: r.left + r.width / 2,
        y: below ? r.bottom : r.top,
        below,
      });
    };

    // Always resolve to the innermost [data-help] under the pointer.
    // This is what makes button tips win over a parent panel tip.
    const resolve = (node) => {
      if (!node || node.nodeType !== 1) return null;
      return node.closest ? node.closest('[data-help]') : null;
    };

    const onOver = (e) => {
      const el = resolve(e.target);
      if (el) place(el);
    };

    // Do NOT clear when moving into another helped element (or into the bubble).
    // That was a common "tips flicker / vanish" bug between nested controls.
    const onOut = (e) => {
      const leaving = resolve(e.target);
      if (!leaving) return;
      const entering = resolve(e.relatedTarget);
      if (entering) {
        place(entering);
        return;
      }
      // relatedTarget can be null (into OS chrome / iframe) — clear only then
      if (!e.relatedTarget || !leaving.contains(e.relatedTarget)) {
        setTip(null);
      }
    };

    const hide = () => setTip(null);

    document.addEventListener('mouseover', onOver, true);
    document.addEventListener('mouseout', onOut, true);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    return () => {
      document.removeEventListener('mouseover', onOver, true);
      document.removeEventListener('mouseout', onOut, true);
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
    };
  }, [tipsEnabled]);

  if (!tip) return null;

  // Wider bubbles so Quantum Lab plain-English tips are readable, not chopped.
  const MAX_W = 360;
  const half = MAX_W / 2;
  const left = Math.min(Math.max(tip.x, half + 10), window.innerWidth - half - 10);
  const top = tip.below ? tip.y + 10 : tip.y - 10;

  return (
    <div
      className="help-layer-bubble"
      role="tooltip"
      style={{
        left,
        top,
        maxWidth: MAX_W,
        transform: tip.below ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
      }}
    >
      {tip.text}
      <span className={tip.below ? 'help-layer-arrow up' : 'help-layer-arrow down'} />
    </div>
  );
}
