import { createGL, program, texture, upload, target, bindTex, loadImage } from './gl.js';
import { SCENE_FS, TRANSITION_FS, COPY_FS } from './shaders.js';
import { SCENES, BPM } from './scenes.js';
import { Traffic, Boat, Bats, Birds, Windows, Splashes } from './overlay.js';

/**
 * THE AUSTIN BANNER ENGINE. Chris's own prototype (banner-new/prototype/js/main.js),
 * lifted out of its page: each of his pictures is animated through its own
 * depth map and masks (clouds, water, trees in the wind, kites, swimmers,
 * traffic, boats, bats, neon, lit windows, the Ghost's head on the beat), and a
 * colour-shifting kaleidoscope carries one into the next.
 *
 * The page's controls, audio sync, recorder and capture hooks are gone. What is
 * new: it draws at the banner's own shape (the shader already covers any frame
 * aspect), loads each picture's maps only when needed, and pauses when the
 * banner is not showing it.
 */
const TRANS = 1.6;           // seconds of kaleidoscope between scenes
const ORDER = ['downtown', 'barton', 'pennybacker', 'zilker', 'congress', 'sixth'];
const FX_KEYS = {
  A: ['sky', 'water', 'wind', 'neon'],
  B: ['soundwave', 'ribbons', 'vortex', 'haze'],
  C: ['skyHue', 'waterHue', 'edges', 'chroma'],
  D: ['wet', 'sun', 'beams', '_'],
};
const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const lerp = (a, b, t) => a + (b - a) * t;

// Every picture's maps, by URL, found by Vite; nothing downloads until a scene needs it.
const ASSETS = import.meta.glob('../../../assets/banner/scenes/*/*', { query: '?url', import: 'default' });
const urlOf = async (id, file) => {
  const key = Object.keys(ASSETS).find((k) => k.endsWith(`/scenes/${id}/${file}`));
  return key ? ASSETS[key]() : null;
};

const canvasOf = (w, h) => (typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h }));

export function createAustinEngine(canvas, { isOn = () => true, maxWidth = 768, onFrame } = {}) {
  const gl = createGL(canvas);
  const sceneProg = program(gl, SCENE_FS);
  const transProg = program(gl, TRANSITION_FS);
  const copyProg = program(gl, COPY_FS);
  const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const state = { t: 0, last: performance.now(), speed: reduced ? 0.6 : 1, intensity: reduced ? 0.4 : 1 };
  const scenes = ORDER.map((id) => SCENES.find((s) => s.id === id)).filter(Boolean).map((s) => ({ ...s, _parts: null }));
  const imgs = {};
  let dead = false;

  async function loadScene(id) {
    if (imgs[id]) return imgs[id];
    const [ui, ud, um, ug, uj] = await Promise.all(['image.jpg', 'depth.png', 'masks.png', 'guard.png', 'data.json'].map((f) => urlOf(id, f)));
    const [img, depth, mask, guard, data] = await Promise.all([loadImage(ui), loadImage(ud), loadImage(um), loadImage(ug), fetch(uj).then((r) => r.json())]);
    if (dead) return null;
    // Twinkle lights only where the map says building: not the bridge's light
    // streaks, not the water, never the brand art.
    const read = (im) => { const c = canvasOf(im.width, im.height), g = c.getContext('2d'); g.drawImage(im, 0, 0); return g.getImageData(0, 0, im.width, im.height).data; };
    const md = read(mask), gd = read(guard);
    const lightsOnBuildings = data.lights.filter(([x, y]) => {
      const i = (Math.floor(y * mask.height) * mask.width + Math.floor(x * mask.width)) * 4;
      return md[i + 2] > 200 && md[i + 1] < 40 && gd[i] < 40;
    });
    imgs[id] = {
      img, data, aspect: img.width / img.height, lightsOnBuildings,
      tex: { img: texture(gl, img), depth: texture(gl, depth), mask: texture(gl, mask), guard: texture(gl, guard) },
    };
    return imgs[id];
  }

  function build(sc, asset) {
    const parts = [];
    let seed = 11;
    for (const lane of sc.lanes || []) parts.push(Traffic(lane, seed++));
    for (const b of sc.boats || []) parts.push(Boat(b, seed++));
    if (sc.bats) parts.push(Bats(sc.bats, seed++));
    if (sc.birds) parts.push(Birds(sc.birds, seed++));
    if (sc.swimmers) parts.push(Splashes(sc.swimmers, seed++));
    if (sc.windows && asset.lightsOnBuildings.length) parts.unshift(Windows(asset.lightsOnBuildings, seed++, { chase: sc.id === 'sixth', max: sc.windows }));
    return parts;
  }

  // The pictures that have arrived, in order. The first one starts the show.
  const ready = () => scenes.filter((s) => imgs[s.img]);
  const starts = () => { let t = 0; return ready().map((s) => { const a = t; t += s.seconds; return a; }); };
  function sceneAt(t) {
    const list = ready(), st = starts();
    const total = list.reduce((a, s) => a + s.seconds, 0);
    t = ((t % total) + total) % total;
    let i = 0;
    while (i + 1 < list.length && t >= st[i + 1]) i++;
    return { list, i, local: t - st[i] };
  }

  let W = 0, H = 0, rtA, rtB, ovA, ovB;
  function resize() {
    // The whole picture, 16:9, as the prototype was tuned (the banner letterboxes it).
    const w = maxWidth, h = Math.round(maxWidth * 9 / 16);
    if (w === W && h === H) return;
    W = w; H = h;
    canvas.width = W; canvas.height = H;
    rtA = target(gl, W, H); rtB = target(gl, W, H);
    ovA = { c: canvasOf(W, H), tex: texture(gl, null) };
    ovB = { c: canvasOf(W, H), tex: texture(gl, null) };
  }

  function camera(sc, local) {
    const k = ease(local / sc.seconds);
    const c = sc.camera;
    const still = reduced ? 0 : 1;
    return {
      x: lerp(c.from.x, c.to.x, k * still), y: lerp(c.from.y, c.to.y, k * still), zoom: lerp(c.from.zoom, c.to.zoom, k * still) * (1 + c.parallax * 2.6 + 0.02),
      px: Math.sin(local * 0.21) * c.parallax * still, py: Math.sin(local * 0.13 + 1) * c.parallax * 0.4 * still,
      focus: c.focus,
    };
  }

  function viewFor(asset, cam) {
    const k = (W / H) / asset.aspect;
    return {
      w: W, h: H, scale: H / 900,
      toScreen(fx, fy) {
        let px = (fx - cam.x) * cam.zoom, py = (fy - cam.y) * cam.zoom;
        if (k > 1) py *= k; else px /= k;
        return [(px + 0.5) * W, (py + 0.5) * H];
      },
    };
  }

  function music(t) {
    const beat = (t * BPM) / 60;
    const f = beat - Math.floor(beat);
    return { time: t, beat, bar: beat / 4, pulse: Math.exp(-f * 5.5) };
  }

  function renderScene(sc, local, rt, ov, dt) {
    const asset = imgs[sc.img];
    if (!asset) return false;
    if (!sc._parts) sc._parts = build(sc, asset);
    const m = music(state.t);
    const cam = camera(sc, local);
    const view = viewFor(asset, cam);
    const ctx = ov.c.getContext('2d');
    ctx.clearRect(0, 0, W, H);
    for (const p of sc._parts) { p.update(dt * state.speed, m); p.draw(ctx, view, m, local); }
    upload(gl, ov.tex, ov.c);

    gl.bindFramebuffer(gl.FRAMEBUFFER, rt.fb);
    gl.viewport(0, 0, W, H);
    gl.useProgram(sceneProg.p);
    const L = sceneProg.loc;
    bindTex(gl, 0, asset.tex.img, L.uImg);
    bindTex(gl, 1, asset.tex.depth, L.uDepth);
    bindTex(gl, 2, asset.tex.mask, L.uMask);
    bindTex(gl, 3, asset.tex.guard, L.uGuard);
    bindTex(gl, 4, ov.tex, L.uOverlay);
    gl.uniform1f(L.uTime, state.t);
    gl.uniform1f(L.uBeat, m.beat);
    gl.uniform1f(L.uPulse, m.pulse * (reduced ? 0.3 : 1));
    gl.uniform1f(L.uBar, m.bar);
    gl.uniform1f(L.uIntensity, state.intensity);
    gl.uniform1f(L.uAspect, W / H);
    gl.uniform1f(L.uImgAspect, asset.aspect);
    gl.uniform1f(L.uDim, 1);
    gl.uniform1f(L.uOcclude, sc.occlude ?? 1);
    gl.uniform3f(L.uCam, cam.px, cam.py, cam.zoom);
    gl.uniform2f(L.uCamCentre, cam.x, cam.y);
    gl.uniform1f(L.uFocus, cam.focus);
    const fx = { ...sc.fx };
    if (sc.ribbons) {
      const u = local / sc.seconds, [a, b] = sc.ribbons.at;
      fx.ribbons = ease((u - a) / 0.06) * (1 - ease((u - b) / 0.08));
    }
    for (const [grp, keys] of Object.entries(FX_KEYS)) gl.uniform4f(L[`uFx${grp}`], ...keys.map((k) => fx[k] || 0));
    gl.uniform2f(L.uSun, ...(sc.sun || [0, 0]));
    gl.uniform3f(L.uVortex, ...(sc.vortex || [0.5, 0.2, 0.3]));
    gl.uniform4f(L.uShine, ...(sc.shine || [0, 0, 0, 0]));
    const pup = sc.puppets || [];
    const kind = { sway: 0, bob: 1, walk: 2, strum: 3 };
    gl.uniform1i(L.uNPuppets, pup.length);
    if (pup.length) {
      gl.uniform4fv(L.uPuppetBox, pup.flatMap((p) => p.box));
      gl.uniform4fv(L.uPuppetMove, pup.flatMap((p) => p.move.map((v, i) => (i < 3 ? v * state.intensity : v))));
      gl.uniform4fv(L.uPuppetPivot, pup.flatMap((p) => [...p.pivot, p.phase, kind[p.kind]]));
    }
    const sw = sc.swimmers || [];
    gl.uniform1i(L.uNRipples, Math.min(16, sw.length));
    if (sw.length) gl.uniform3fv(L.uRipple, sw.slice(0, 16).flatMap((p) => [p[0], p[1], 0.06]));
    const fl = sc.flows || [];
    gl.uniform1i(L.uNFlows, fl.length);
    if (fl.length) {
      gl.uniform4fv(L.uFlowBox, fl.flatMap((f) => f.box));
      gl.uniform4fv(L.uFlowDir, fl.flatMap((f) => [...f.dir, f.speed, f.amount]));
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return true;
  }

  function draw(dt) {
    const { list, i, local } = sceneAt(state.t);
    const sc = list[i];
    const next = list[(i + 1) % list.length];
    const toEnd = sc.seconds - local;
    renderScene(sc, local, rtA, ovA, dt);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    if (toEnd < TRANS && !reduced && next !== sc) {
      renderScene(next, 0, rtB, ovB, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, W, H);
      gl.useProgram(transProg.p);
      bindTex(gl, 0, rtA.tex, transProg.loc.uA);
      bindTex(gl, 1, rtB.tex, transProg.loc.uB);
      gl.uniform1f(transProg.loc.uMix, 1 - toEnd / TRANS);
      gl.uniform1f(transProg.loc.uTime, state.t);
      gl.uniform1f(transProg.loc.uAspect, W / H);
      gl.uniform1f(transProg.loc.uIntensity, state.intensity);
    } else {
      gl.useProgram(copyProg.p);
      bindTex(gl, 0, rtA.tex, copyProg.loc.uA);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  let raf = 0;
  const frame = (now) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - state.last) / 1000);
    state.last = now;
    if (!isOn() || document.hidden || !ready().length) return;
    resize();
    state.t += dt * state.speed;
    draw(dt);
    onFrame?.();
  };

  // The first picture starts the show; the rest load behind it, one at a time.
  (async () => {
    try {
      for (const sc of scenes) { if (dead) return; await loadScene(sc.img); }
    } catch (err) { console.warn('Austin banner: a picture would not load', err); }
  })();
  raf = requestAnimationFrame((t) => { state.last = t; frame(t); });

  return {
    destroy() {
      dead = true; cancelAnimationFrame(raf);
      for (const a of Object.values(imgs)) Object.values(a.tex).forEach((t) => gl.deleteTexture(t));
    },
  };
}
