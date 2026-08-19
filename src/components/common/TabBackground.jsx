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
 * ART: every tab layers his own still on top of the motion.
 *
 * IT USED TO BE SET AT 0.22 AND HE COULD NOT SEE IT. 2026-08-19: *"lighten
 * all of the backgrounds in each tab because you can barely fucking see the
 * image behind it. I want people to see the goddamn image."* Three things were
 * stacked against the art at once and all three had to move: this opacity, the
 * radial veils each tab paints over the top, and the frosted panels sitting on
 * it. Treating the art as faint atmosphere was the wrong call; it is his work
 * and it is meant to be looked at.
 */

/** Stable small offset from the tab name. Same tab, same colour, every launch. */
function hueFor(name) {
  let h = 0;
  for (let i = 0; i < String(name).length; i += 1) {
    h = (h * 31 + String(name).charCodeAt(i)) >>> 0;
  }
  return ((h % 1000) / 1000) * 0.16;   // 0 .. 0.16, one sixth of the wheel
}

export default function TabBackground({ name, art = null, artOpacity = 0.72 }) {
  // An explicit `art` prop still wins; the name lookup is just the default so
  // every tab gets its own piece without touching sixteen files.
  const src = art || ART[name] || null;
  // A MISSING PIECE USED TO BE SILENT, AND THAT IS HOW CHOPPED & SCREWED SHIPPED
  // WITH A BARE TAB. Seventeen names, sixteen files, and nothing anywhere said
  // so: the tab just rendered the prism and a veil and looked like a dead area.
  // Say it out loud in dev so the next missing one is caught the first time it
  // is opened rather than in a screenshot.
  if (import.meta.env.DEV && !src) {
    console.warn(`[TabBackground] no artwork for "${name}". Drop src/assets/bg-art/${name}.webp in and it is picked up by name.`);
  }
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
            // NORMAL, NOT SCREEN. Screen blending drops every dark pixel in the
            // art to nothing, so a moody render shows only its highlights no
            // matter how far the opacity is raised. Raising the number alone
            // would not have answered "I want people to see the goddamn image".
            // Normal shows the picture as the picture; the prism reads through
            // the remaining quarter and all around it, so nothing goes still.
            mixBlendMode: 'normal',
            pointerEvents: 'none',
          }}
        />
      )}
    </>
  );
}
