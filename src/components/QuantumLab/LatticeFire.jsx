import React, { useEffect, useRef } from 'react';

/**
 * REAL FIRE ON THE LATTICE.
 *
 * ============================================================================
 * WHY THIS EXISTS, AND WHY THE CSS VERSION WAS NEVER GOING TO WORK
 * ============================================================================
 * The flames were built three times in CSS: stacked gradients, then clip-path
 * polygons, then morphing polygons under an SVG turbulence warp. The last one
 * is a decent effect and it still does not look like fire, because CSS can
 * only ever draw a SHAPE and animate its outline. Fire has no outline. It is a
 * few thousand hot particles rising, cooling and going out, and what your eye
 * reads as "fire" is that mass, not any silhouette.
 *
 * Chris's reference animation came from a video model — volumetric, with real
 * turbulence. Nothing made of polygons was ever going to match it, and saying
 * so hours earlier would have saved most of a day.
 *
 * So this does what a game does: a particle system.
 *
 *   - Each burning tile is an EMITTER across its top edge, weighted to the
 *     middle, hottest tiles emitting fastest.
 *   - Particles rise with buoyancy (they accelerate upward as they heat the
 *     air), shrink as they burn out, and drift sideways through a smooth
 *     curl-noise field so the whole column wavers together instead of each
 *     particle wandering off on its own. That coherence is the difference
 *     between fire and a fountain of sparks.
 *   - Colour comes from remaining life, not from position: white-hot at birth,
 *     through yellow and orange to deep red, then out. That single rule is
 *     what produces the white core and red tips for free.
 *   - Everything is drawn with `lighter` compositing, so overlapping particles
 *     ADD. Density becomes brightness, which is how real flame builds a core.
 *
 * ONE CANVAS FOR THE WHOLE LATTICE, not one per tile. Flames from neighbouring
 * tiles then blend into each other properly, and there is a single draw loop
 * instead of nineteen.
 *
 * SPEED: every particle is one drawImage of a pre-rendered sprite. The sprites
 * (32 of them, one per step of the colour ramp) are rasterised once at mount.
 * Per frame that is a few hundred drawImage calls of a 64px texture, which is
 * nothing — versus a few hundred createRadialGradient calls, which is not.
 *
 * It reads the board straight from the DOM: which tiles carry .ql-burning,
 * where they are, and their --fh (hue) and --heat. No prop plumbing, so it
 * cannot drift out of step with what the tiles are actually showing.
 */

const SPRITE_STEPS = 32;   // colour resolution of the ramp
const SPRITE_PX = 64;      // texture size; particles are scaled down from this
const RESCAN_MS = 240;     // how often to re-read which tiles are burning

/* Fire cools along its life. t = 0 is newborn (white hot), t = 1 is dead.
   Lightness and alpha both fall; the hue slides down toward red. */
function rampColor(t, hue) {
  // 92% -> 30% lightness, and the hue slides a long way: 22 degrees above the
  // base hue at birth (yellow) down to 18 below it at death (deep red). That
  // single slide is what makes the body yellow and the tips red without either
  // being painted anywhere explicitly.
  const light = 92 - t * 62;
  const sat = 100;
  const h = hue + 22 - t * 40;
  // Alpha holds up early then drops away fast, so tips fade rather than
  // stopping dead.
  const peak = t < 0.12 ? 0.85 + t * 1.2 : Math.max(0, 1 - Math.pow((t - 0.12) / 0.88, 1.5));
  // 0.16 is the ceiling for ONE particle. Density does the rest.
  const a = peak * 0.105;
  return { h, sat, light, a };
}

function buildSprites(hue) {
  const out = [];
  for (let i = 0; i < SPRITE_STEPS; i++) {
    const t = i / (SPRITE_STEPS - 1);
    const { h, sat, light, a } = rampColor(t, hue);
    const c = document.createElement('canvas');
    c.width = c.height = SPRITE_PX;
    const g = c.getContext('2d');
    const r = SPRITE_PX / 2;
    const grad = g.createRadialGradient(r, r, 0, r, r, r);
    // A soft core with a long tail. A hard-edged blob reads as a bubble.
    grad.addColorStop(0.0, `hsla(${h}, ${sat}%, ${Math.min(100, light + 4)}%, ${a})`);
    grad.addColorStop(0.35, `hsla(${h}, ${sat}%, ${light}%, ${a * 0.62})`);
    grad.addColorStop(0.7, `hsla(${h - 6}, ${sat}%, ${light * 0.7}%, ${a * 0.2})`);
    grad.addColorStop(1.0, `hsla(${h - 10}, ${sat}%, ${light * 0.5}%, 0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, SPRITE_PX, SPRITE_PX);
    out.push(c);
  }
  return out;
}

/* A cheap smooth 1-D field. Real Perlin is overkill: three sines at
   incommensurable frequencies give a wander that never visibly repeats, and
   every particle in a column samples the SAME field, which is what keeps the
   flame moving as one body. */
function drift(x, time) {
  return (
    Math.sin(x * 0.021 + time * 1.7) * 0.55 +
    Math.sin(x * 0.047 - time * 2.6) * 0.3 +
    Math.sin(x * 0.011 + time * 0.9) * 0.8
  );
}

export default function LatticeFire({ wrapRef }) {
  const canvasRef = useRef(null);
  const stateRef = useRef({ parts: [], emitters: [], sprites: null, raf: 0, last: 0, t: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef && wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    const S = stateRef.current;

    // Two hues only: orange for heat, violet for entangled. Sprite sets are
    // built once and reused for every particle of that colour.
    S.sprites = { 26: buildSprites(26), 282: buildSprites(282) };

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let dpr = 1;
    const resize = () => {
      const r = wrap.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.round(r.width * dpr));
      canvas.height = Math.max(1, Math.round(r.height * dpr));
      canvas.style.width = r.width + 'px';
      canvas.style.height = r.height + 'px';
    };
    resize();

    /* Re-read the board: which tiles are burning, where, how hot, what colour.
       Coordinates are relative to the wrap, so the canvas can sit over it and
       scroll with it. */
    const scan = () => {
      const wr = wrap.getBoundingClientRect();
      const tiles = wrap.querySelectorAll('.ql-tile.ql-burning');
      const list = [];
      tiles.forEach((el) => {
        const r = el.getBoundingClientRect();
        const cs = el.style;
        const heat = parseFloat(cs.getPropertyValue('--heat')) || 0.7;
        const hue = parseInt(cs.getPropertyValue('--fh'), 10) === 282 ? 282 : 26;
        list.push({
          x: r.left - wr.left + r.width / 2,
          // Emit from just inside the tile's top edge, so the fire grows out of
          // the tile rather than starting in the air above it.
          y: r.top - wr.top + r.height * 0.86,
          h: r.height,
          w: r.width,
          heat,
          hue,
          blazing: el.classList.contains('ql-blazing'),
        });
      });
      S.emitters = list;
    };
    scan();

    const ro = new ResizeObserver(() => { resize(); scan(); });
    ro.observe(wrap);
    const scanTimer = setInterval(scan, RESCAN_MS);

    /* THE WRAP SCROLLS. The canvas lives inside it, so without this it would
       scroll away and leave the fire behind. Pinning it with a transform keeps
       it over the visible box, and re-scanning gives the emitters their new
       positions in the same frame. */
    const onScroll = () => {
      canvas.style.transform = `translateY(${wrap.scrollTop}px)`;
      scan();
    };
    wrap.addEventListener('scroll', onScroll, { passive: true });

    const spawn = (e, n) => {
      for (let i = 0; i < n; i++) {
        const half = e.w * (e.blazing ? 0.40 : 0.34);
        let px;
        let inward = 0;
        if (Math.random() < 0.26) {
          // The thin centre stream, so the two flanks read as one fire.
          px = e.x + (Math.random() - 0.5) * e.w * 0.16;
        } else {
          // The flanks. Up the left and right edges of the tile, leaning in as
          // they rise so they close over the top.
          const side = Math.random() < 0.5 ? -1 : 1;
          px = e.x + side * half * (0.62 + Math.random() * 0.38);
          inward = -side * (0.010 + Math.random() * 0.010);
        }
        const life = (e.blazing ? 900 : 720) + Math.random() * 520;
        S.parts.push({
          x: px,
          y: e.y + Math.random() * 6,
          x0: px,
          vx: inward + (Math.random() - 0.5) * 0.008,
          // Newborn particles already move: fire leaves the fuel fast.
          // A wide spread of speeds is what gives fire its tongues: the fast
          // ones become the licks that break away from the top of the body.
          vy: -(0.024 + Math.random() * 0.05) * (e.blazing ? 1.2 : 1),
          size: (e.blazing ? 19 : 15) + Math.random() * 12,
          life: 0,
          max: life,
          hue: e.hue,
          seed: Math.random() * 1000,
        });
      }
    };

    const frame = (now) => {
      const dt = Math.min(48, now - (S.last || now));
      S.last = now;
      S.t += dt / 1000;

      // Emit. Hotter tiles push more fuel through, which is what makes a
      // blazing tile read as bigger rather than merely taller.
      for (const e of S.emitters) {
        const rate = (e.blazing ? 10 : 6.5) * (0.55 + e.heat) * (dt / 16.7);
        let n = Math.floor(rate);
        if (Math.random() < rate - n) n++;
        if (S.parts.length < 4200) spawn(e, n);
      }

      // Integrate.
      const next = [];
      for (const p of S.parts) {
        p.life += dt;
        if (p.life >= p.max) continue;
        const t = p.life / p.max;
        // Buoyancy: hot gas accelerates upward as it rises, then slows as it
        // cools. Constant velocity looks like rain played backwards.
        p.vy -= 0.00019 * dt * (1 - t * 0.55);
        p.y += p.vy * dt;
        // The shared drift field, scaled up as the particle rises: the base
        // stays anchored and the tip is what whips around.
        p.x = p.x0 + drift(p.x0 + p.seed, S.t) * (2 + t * 26) * 0.6 + p.vx * p.life;
        next.push(p);
      }
      S.parts = next;

      // Draw.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
      ctx.globalCompositeOperation = 'lighter';
      for (const p of S.parts) {
        const t = p.life / p.max;
        const set = S.sprites[p.hue] || S.sprites[26];
        const sprite = set[Math.min(SPRITE_STEPS - 1, (t * SPRITE_STEPS) | 0)];
        // Grow briefly, then shrink away — a burning particle expands as it
        // heats the air around it before it dies.
        // Born small at the fuel, swelling as the gas expands, gone by the tip.
        const grow = t < 0.42 ? 0.34 + t * 1.9 : Math.max(0, 1.14 - (t - 0.42) * 1.6);
        const s = p.size * Math.max(0.05, grow);
        ctx.drawImage(sprite, p.x - s / 2, p.y - s / 2, s, s);
      }
      ctx.globalCompositeOperation = 'source-over';

      S.raf = requestAnimationFrame(frame);
    };

    if (reduce) {
      // Still board: one populated frame, then stop. The fire is decoration;
      // the lattice underneath is the tool.
      for (const e of S.emitters) spawn(e, 90);
      for (const p of S.parts) { p.life = Math.random() * p.max; p.y -= Math.random() * 60; }
      S.last = performance.now();
      frame(performance.now());
      cancelAnimationFrame(S.raf);
    } else {
      S.raf = requestAnimationFrame(frame);
    }

    return () => {
      cancelAnimationFrame(S.raf);
      clearInterval(scanTimer);
      wrap.removeEventListener('scroll', onScroll);
      ro.disconnect();
      S.parts = [];
    };
  }, [wrapRef]);

  return <canvas ref={canvasRef} className="ql-firecanvas" aria-hidden="true" />;
}
