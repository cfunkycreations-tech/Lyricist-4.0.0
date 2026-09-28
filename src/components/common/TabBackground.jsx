import React from 'react';

/**
 * The floor of every tab.
 *
 * There is nothing on it. Chris's call, 2026-08-27: *"strip the app of all
 * artwork and leave it jet black. Actually, flat black. Keep the neon
 * pinstripe the way it is."* Every tab used to layer his own still (the
 * `bg-art/*.webp` set) over a WebGL prism; both are gone. The prism-hue
 * offset per tab, the artwork-opacity knob, the missing-file warning and
 * the `import.meta.glob` that dragged every .webp in at build time all went
 * with them — a flat colour needs none of it.
 *
 * The pinstripe under the active tab reads `--accent-neon` directly, so the
 * accent slider still rotates it and nothing in this file has to.
 *
 * The `name` prop is accepted and ignored on purpose. Sixteen callers pass
 * one, and taking the prop away is a sixteen-file rename for zero effect.
 * If a future skin needs per-tab colour again, this is the file that gets it.
 *
 * 2026-09-27: flat black is over. Chris: *"I don't want plain ugly ass flat."*
 * The floor is the brushed black nickel from styles/materials.css.
 */
// eslint-disable-next-line no-unused-vars
export default function TabBackground({ name, art = null, artOpacity = 0.72 }) {
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 0,
        background: 'var(--mat-floor)',
        backgroundColor: 'var(--mat-floor-color)',
        backgroundAttachment: 'fixed',
        pointerEvents: 'none',
      }}
    />
  );
}
