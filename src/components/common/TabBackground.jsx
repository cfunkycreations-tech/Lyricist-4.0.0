import React from 'react';
import PrismBackground from './PrismBackground.jsx';

/**
 * His artwork, one file per tab, named for the tab it belongs to.
 *
 * Globbed rather than imported one by one so a tab picks its own art up by
 * NAME. Dropping `booth.webp` in beside these is the entire job of giving the
 * Recording Booth a background — no import to add, no component to edit, and
 * nothing to forget. Swapping one is overwriting one file.
 *
 * They are `?url` so Vite emits them as real files and the bundle does not
 * carry them base64.
 */
const ART = Object.fromEntries(
  Object.entries(
    import.meta.glob('../../assets/bg-art/*.webp', { eager: true, query: '?url', import: 'default' }),
  ).map(([path, url]) => [path.split('/').pop().replace(/\.webp$/, ''), url]),
);

/**
 * The background for every tab.
 *
 * This replaces the background videos — Chris's call, 2026-08-16: *"I wanna
 * just start doing static artwork for each of the tabs... some of them turn out
 * to be really good, other ones just look like shit."* Consistency was the real
 * complaint, and clips from different sources were never going to match.
 *
 * The numbers behind the swap:
 *   - fifteen clips were the bulk of a ~400 MB installer. This is a few KB.
 *   - eight tabs had no clip at all, so the app looked half-finished. Now every
 *     tab has the same treatment on day one.
 *   - the clips FROZE. Chromium suspends media it believes is hidden, and on
 *     Windows "covered by another window" counts, so one alt-tab killed every
 *     background until you switched tabs and came back. Build 068 was a
 *     three-part fix for that. A canvas cannot hit it.
 *   - a decoding video per tab is real battery on a laptop, and his users are
 *     busking.
 *
 * PER-TAB HUE: each tab gets a small stable offset so it feels like its own
 * room without leaving the family. Deliberately small — a big spread would make
 * seventeen unrelated tabs rather than one app.
 *
 * ART: hero tabs can layer a still on top of the motion. Kept dim and behind
 * the content on purpose; the art is atmosphere, not a picture to look at.
 */

/** Stable small offset from the tab name. Same tab, same colour, every launch. */
function hueFor(name) {
  let h = 0;
  for (let i = 0; i < String(name).length; i += 1) {
    h = (h * 31 + String(name).charCodeAt(i)) >>> 0;
  }
  return ((h % 1000) / 1000) * 0.16;   // 0 .. 0.16, one sixth of the wheel
}

export default function TabBackground({ name, art = null, artOpacity = 0.22 }) {
  // An explicit `art` prop still wins; the name lookup is just the default so
  // every tab gets its own piece without touching sixteen files.
  const src = art || ART[name] || null;
  return (
    <>
      <PrismBackground hue={hueFor(name)} />
      {src && (
        <img
          src={src}
          alt=""
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            zIndex: 0,
            opacity: artOpacity,
            mixBlendMode: 'screen',
            pointerEvents: 'none',
          }}
        />
      )}
    </>
  );
}
