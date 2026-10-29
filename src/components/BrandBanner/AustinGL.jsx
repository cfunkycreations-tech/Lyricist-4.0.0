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
        onFrame: () => { bctx.drawImage(ref.current, 0, 0, back.width, back.height); },
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
