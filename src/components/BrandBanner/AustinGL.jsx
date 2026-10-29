import React, { useEffect, useRef } from 'react';
import { AUSTIN_GHOST } from './austinGhost.js';
import { createAustinEngine } from './austin/engine.js';

/**
 * THE AUSTIN GHOST PICTURES, EACH ONE ANIMATED, WITH A KALEIDOSCOPE BETWEEN THEM.
 * Chris's prototype engine (austin/engine.js) drawing into the banner. He asked
 * for the pictures zoomed right out, so each one shows whole, 16:9, in the
 * middle of the banner; a blurred copy of the same moving picture fills the
 * sides. If WebGL2 is missing, the first picture just sits there.
 */
export default function AustinGL({ on }) {
  const ref = useRef(null);
  const backRef = useRef(null);
  const onRef = useRef(on);
  onRef.current = on;

  useEffect(() => {
    let engine = null;
    const back = backRef.current;
    const bctx = back.getContext('2d');
    try {
      engine = createAustinEngine(ref.current, {
        isOn: () => onRef.current,
        onFrame: () => {
          // The picture whole in the middle, then mirrored copies out to both
          // edges, so the banner is full and every seam matches.
          const cw = Math.max(2, Math.round(back.clientWidth)), ch = Math.max(2, Math.round(back.clientHeight));
          if (back.width !== cw || back.height !== ch) { back.width = cw; back.height = ch; }
          const tw = ch * (16 / 9), cx = cw / 2;
          const n = Math.ceil(cx / tw) + 1;
          for (let k = -n; k <= n; k++) {
            const x = cx - tw / 2 + k * tw;
            if (x > cw || x + tw < 0) continue;
            bctx.save();
            if (Math.abs(k) % 2) { bctx.translate(x + tw, 0); bctx.scale(-1, 1); bctx.drawImage(ref.current, 0, 0, tw, ch); }
            else bctx.drawImage(ref.current, x, 0, tw, ch);
            bctx.restore();
          }
        },
      });
    } catch (err) {
      console.warn('Austin banner could not start:', err);
    }
    return () => engine?.destroy();
  }, []);

  return (
    <>
      <img className="bb-austin-poster" src={AUSTIN_GHOST[0]} alt="" draggable={false} />
      <canvas ref={backRef} className="bb-austin-back" width="64" height="36" aria-hidden="true" />
      <canvas ref={ref} className="bb-austin-gl" aria-hidden="true" />
    </>
  );
}
