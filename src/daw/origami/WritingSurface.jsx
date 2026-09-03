import React, { useEffect, useRef } from 'react';
import { paintSurface } from './surfaceTexture';

/**
 * The writing surface — Mix A, painted to a canvas behind the lyric page.
 *
 * Repainted on resize only. It is a still texture by design: the one thing
 * in the window with a direction in it, and the direction is the one the
 * lines are read in.
 */
export default function WritingSurface() {
  const ref = useRef(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    let timer = 0;
    let last = '';
    // Paint on the element's own box, not the window's. On first mount the
    // canvas has no size yet, and painting then stretches a few pixels of
    // texture across the whole surface.
    const repaint = () => {
      const key = `${cv.clientWidth}x${cv.clientHeight}`;
      if (key === last || cv.clientWidth === 0) return;
      last = key;
      paintSurface(cv);
    };
    const ro = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(repaint, 120);
    });
    ro.observe(cv);
    repaint();
    return () => { clearTimeout(timer); ro.disconnect(); };
  }, []);

  return <canvas ref={ref} aria-hidden="true" />;
}
