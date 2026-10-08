/**
 * A SHORT FADE IN AND OUT ON EVERY NARRATION CLIP.
 *
 * The Ghost's clips are cut out of longer renders that have music under the
 * voice, so a clip can start and end mid-bar. A fraction of a second of volume
 * ramp at each end hides the cut. It works on the playing element, so it
 * covers the baked demo clips, the tour cards and anything recorded in the
 * Voice Lab, with no change to the files.
 */
export const FADE_IN_MS = 300;
export const FADE_OUT_MS = 400;

/** The volume (0..1) a clip should have `intoMs` after it started with `leftMs` still to play. */
export const fadeVolume = (intoMs, leftMs, inMs = FADE_IN_MS, outMs = FADE_OUT_MS) =>
  Math.max(0, Math.min(1, intoMs / inMs, leftMs / outMs));

/** Attach once to an <audio> element. Safe to call again on the same element. */
export function withFades(a) {
  if (!a || a.__fades) return a;
  a.__fades = true;
  let raf = 0;
  const step = () => {
    if (a.paused || a.ended) return;
    const d = a.duration;
    if (Number.isFinite(d) && d > 0) {
      const rate = a.playbackRate || 1;
      a.volume = fadeVolume((a.currentTime / rate) * 1000, ((d - a.currentTime) / rate) * 1000);
    }
    raf = requestAnimationFrame(step);
  };
  a.addEventListener('play', () => {
    try { a.volume = 0; } catch { /* read-only on some hosts */ }   // no pop before the first frame
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(step);
  });
  const rest = () => { cancelAnimationFrame(raf); try { a.volume = 1; } catch { /* */ } };
  a.addEventListener('pause', rest);
  a.addEventListener('ended', rest);
  return a;
}
