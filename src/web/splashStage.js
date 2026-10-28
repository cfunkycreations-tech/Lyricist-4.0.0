/**
 * THE SPLASH STAGE: Chris's splash art with the Ghost lip-syncing the opener.
 *
 * Chris, 2026-10-28: "I want Ghost Rider to look like he is genuinely
 * delivering the dialogue in the original splash-screen audio... word by
 * word", then "a big mischievous grin and a quick wink immediately after his
 * final spoken word". The audio is the opener's own (intro.mp4), untouched,
 * and its playback position is the only clock: the stage reads
 * video.currentTime every frame, so pausing, a slow start or a stall all
 * stay in sync, and nothing moves on its own timer that could drift.
 *
 * Everything is cut from Chris's two pictures (scripts/splash/prep_splash.py,
 * src/assets/splash/):
 *   plate    the picture with his mouth and eyes painted out
 *   mouth    his own laughing mouth. Each mouth shape is this mouth opened
 *            less or more, narrower or wider; squeezed nearly shut its smile
 *            outline becomes the closed lips of M, B and P.
 *   eyeL/R   brow and eye together on each side: blink, raise, wink
 *   head     the head (from the plate, so the face layers ride on it)
 *   hand     the pointing hand: it gestures on the stressed words
 * timeline.json: the words and visemes timed against the voice (Demucs split
 * the voice off the music, then every word was snapped to where the voice
 * really starts and stops), the voice loudness, and the music's beats.
 */

// How each viseme opens the mouth: [open (height), wide (width)] of the art's mouth.
const SHAPES = {
  X: [0.62, 0.98],   // rest between words: his grin
  A: [0.07, 0.94],   // M B P: lips closed (the smile line)
  B: [0.32, 0.95],   // most consonants: teeth, slightly open
  C: [0.55, 1.02],   // EH IH IY: open, wide
  D: [1.00, 1.00],   // AA AH AY: wide open
  E: [0.74, 0.74],   // AO OW: rounded
  F: [0.38, 0.58],   // UW W: puckered
  G: [0.16, 0.92],   // F V: lip on teeth
  H: [0.46, 0.92],   // L TH: tongue
};

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };

export function loadImages(urls) {
  return Promise.all(Object.entries(urls).map(([k, u]) => new Promise((res) => {
    const i = new Image();
    i.onload = () => res([k, i]);
    i.onerror = () => res([k, null]);
    i.src = u;
  }))).then(Object.fromEntries);
}

/**
 * art: { plate, mouth, eyeL, eyeR, head, hand } images for one layout.
 * L: that layout's boxes from timeline.json. tl: timeline.json.
 */
export function makeStage(canvas, art, L, tl) {
  const ctx = canvas.getContext('2d');
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const vis = tl.visemes;
  const voice = tl.voice;
  const beats = tl.beats;
  const words = tl.words;
  const lastEnd = tl.lastWordEnd;
  const emphasis = tl.emphasis;
  const stars = Array.from({ length: 70 }, (_, i) => ({ x: ((i * 0.618) % 1), y: ((i * 0.414) % 1), ph: i * 1.7, sp: 0.6 + (i % 7) * 0.25 }));
  const bats = Array.from({ length: 14 }, (_, i) => ({ ph: i / 14, y: (i * 0.37) % 1, sp: 0.03 + (i % 5) * 0.006, sz: 0.7 + (i % 3) * 0.25 }));
  let mouth = { o: SHAPES.X[0], w: SHAPES.X[1] };
  let lastT = 0;

  function voiceAt(t) {
    const i = Math.floor(t * tl.fps);
    return i >= 0 && i < voice.length ? (voice.charCodeAt(i) - 48) / 9 : 0;
  }
  function visemeAt(t) {
    let v = 'X';
    for (let i = 0; i < vis.length && vis[i][0] <= t; i++) v = vis[i][1];
    return t < (vis[0]?.[0] ?? 0) ? 'X' : v;
  }
  function beatPulse(t) {
    let k = 0;
    for (const b of beats) { const d = t - b; if (d >= 0 && d < 0.6) k = Math.max(k, Math.exp(-d * 6)); }
    return k;
  }
  function stressed(t) { return emphasis.some(([a, b]) => t >= a && t <= b); }
  function speaking(t) { return words.some((w) => t >= w[1] - 0.03 && t <= w[2] + 0.03); }

  // The art covers the canvas (never stretched); this maps picture fractions to pixels.
  function fit(img, cw, ch) {
    const s = Math.max(cw / img.width, ch / img.height);
    const dw = img.width * s, dh = img.height * s;
    return { s, dx: (cw - dw) / 2, dy: (ch - dh) / 2, dw, dh };
  }

  function draw(t, dpr) {
    const cw = canvas.width / dpr, ch = canvas.height / dpr;
    if (!art.plate) return;
    const f = fit(art.plate, cw, ch);
    const P = (fx, fy) => [f.dx + fx * f.dw, f.dy + fy * f.dh];
    const box = (b) => { const [x, y] = P(b[0], b[1]); return [x, y, (b[2] - b[0]) * f.dw, (b[3] - b[1]) * f.dh]; };
    const dt = clamp(t - lastT, 0, 0.1);
    lastT = t;
    const still = reduced;
    const beat = beatPulse(t);
    const vol = voiceAt(t);
    const talk = speaking(t);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.drawImage(art.plate, f.dx, f.dy, f.dw, f.dh);

    // ---- the world around him ----
    if (!still) {
      // Water: the reflections shimmer, slices sliding side to side.
      const [wx, wy, ww, wh] = box(L.water);
      const step = 2;
      for (let y = wy; y < wy + wh; y += step) {
        const k = (y - wy) / wh;
        const off = Math.sin(y * 0.22 + t * 3.1) * (1.2 + k * 2.6) + Math.sin(y * 0.07 - t * 1.3) * 1.5;
        const sx = (wx - f.dx) / f.s, sy = (y - f.dy) / f.s;
        ctx.drawImage(art.plate, sx, sy, ww / f.s, step / f.s + 0.5, wx + off, y, ww, step + 0.5);
      }
      // Stars twinkle.
      const [sx0, sy0, sw, sh] = box(L.sky);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const s of stars) {
        const k = Math.pow(Math.max(0, Math.sin(t * s.sp + s.ph)), 8);
        if (k < 0.05) continue;
        const x = sx0 + s.x * sw, y = sy0 + s.y * sh, r = 1 + k * 2.2;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3);
        g.addColorStop(0, `rgba(255,255,255,${0.9 * k})`); g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g; ctx.fillRect(x - r * 3, y - r * 3, r * 6, r * 6);
      }
      // The moon breathes.
      const [mx, my] = P(L.moon[0], L.moon[1]);
      const mr = L.moon[2] * f.dw * (1.6 + 0.15 * Math.sin(t * 0.9));
      const mg = ctx.createRadialGradient(mx, my, mr * 0.5, mx, my, mr * 1.6);
      mg.addColorStop(0, 'rgba(255,220,170,0.18)'); mg.addColorStop(1, 'rgba(255,200,150,0)');
      ctx.fillStyle = mg; ctx.fillRect(mx - mr * 2, my - mr * 2, mr * 4, mr * 4);
      ctx.restore();
      // Bats crossing the sky.
      ctx.save();
      ctx.fillStyle = 'rgba(12,6,18,0.85)';
      for (const b of bats) {
        const u = (b.ph + t * b.sp) % 1;
        const x = sx0 + (1.1 - u * 1.2) * sw, y = sy0 + (0.25 + b.y * 0.6) * sh + Math.sin(u * 20) * sh * 0.02;
        const z = b.sz * f.dw * 0.006, fl = Math.sin(t * 14 + b.ph * 30);
        ctx.beginPath();
        ctx.moveTo(x, y); ctx.lineTo(x - z * 1.5, y - z * fl); ctx.lineTo(x - z * 0.5, y + z * 0.3);
        ctx.moveTo(x, y); ctx.lineTo(x + z * 1.5, y - z * fl); ctx.lineTo(x + z * 0.5, y + z * 0.3);
        ctx.fill();
      }
      ctx.restore();
      // Music notes glow on the beat.
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      L.notes.forEach(([nx, ny], i) => {
        const [x, y] = P(nx, ny + Math.sin(t * 1.4 + i) * 0.004);
        const r = f.dw * 0.03 * (0.8 + beat * 0.6);
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `rgba(255,200,90,${0.35 + beat * 0.4})`); g.addColorStop(1, 'rgba(255,160,40,0)');
        ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
      });
      ctx.restore();
    }

    // ---- him ----
    // Gentle float, a nod on the stressed words, a lean on the beat.
    const nod = still ? 0 : (stressed(t) ? Math.sin(t * 9) * 0.0025 : 0) + Math.sin(t * 1.8) * 0.0018 + beat * 0.0015;
    const sway = still ? 0 : Math.sin(t * 1.1) * 0.012;
    const [hx, hy, hw, hh] = box(L.head);
    const [pvx, pvy] = P((L.head[0] + L.head[2]) / 2, L.head[3]);
    ctx.save();
    ctx.translate(pvx, pvy + nod * f.dh);
    ctx.rotate(sway * 0.5);
    ctx.translate(-pvx, -pvy);
    if (art.head) ctx.drawImage(art.head, hx, hy, hw, hh);

    // Mouth: the viseme for this moment, eased (about 40 ms), opened more on loud syllables.
    const v = visemeAt(t);
    const after = t - lastEnd;
    let [to, tw] = SHAPES[v] || SHAPES.X;
    if (talk) { to *= 0.75 + vol * 0.45; }
    // The signature move: a big mischievous grin right after the last word.
    const grin = after > 0 ? smooth(after / 0.25) * (1 - smooth((after - 1.6) / 0.5)) : 0;
    to = lerp(to, 1.12, grin); tw = lerp(tw, 1.1, grin);
    const ease = 1 - Math.exp(-dt / 0.04);
    mouth.o = lerp(mouth.o, to, ease);
    mouth.w = lerp(mouth.w, tw, ease);
    if (art.mouth) {
      const [mx, my, mw, mh] = box(L.mouth);
      // The upper lip and the corners stay put; the jaw opens downward.
      const w = mw * mouth.w;
      const cx = mx + mw / 2;
      // Upper part (lip line and teeth) keeps its size; the rest stretches with the opening.
      const split = 0.32;
      const img = art.mouth;
      ctx.drawImage(img, 0, 0, img.width, img.height * split, cx - w / 2, my, w, mh * split);
      ctx.drawImage(img, 0, img.height * split, img.width, img.height * (1 - split), cx - w / 2, my + mh * split - 0.5,
        w, Math.max(1, (mh * (1 - split)) * (0.12 + 0.88 * mouth.o)));
    }

    // Brows and eyes: raise on stressed words, blink now and then, wink after the last word.
    const raise = still ? 0 : (stressed(t) ? 1 : 0) * 0.006 + grin * 0.004;
    const blinkPhase = (t % 3.7) / 3.7;
    const blink = !still && blinkPhase > 0.96 ? Math.sin((blinkPhase - 0.96) / 0.04 * Math.PI) : 0;
    const wink = after > 0.35 ? Math.sin(clamp((after - 0.35) / 0.4) * Math.PI) : 0;
    for (const side of ['eyeL', 'eyeR']) {
      const e = art[side];
      if (!e) continue;
      const [ex, ey, ew, eh] = box(L[side]);
      const shut = Math.max(blink * 0.55, side === 'eyeR' ? wink * 0.7 : 0);
      const lift = -raise * f.dh + (side === 'eyeL' ? -wink * 0.006 * f.dh : 0);
      // Squeeze toward the lower lid; the brow comes down with it a little.
      const sh = eh * (1 - shut * 0.45);
      ctx.save();
      if (side === 'eyeR' && wink > 0) {
        ctx.translate(ex + ew / 2, ey + eh * 0.7);
        ctx.rotate(-wink * 0.12);
        ctx.translate(-(ex + ew / 2), -(ey + eh * 0.7));
      }
      ctx.drawImage(e, ex, ey + (eh - sh) + lift, ew, sh);
      ctx.restore();
    }
    // The wink's sparkle.
    if (wink > 0.05) {
      const [kx, ky] = P(L.eyeR[2] + 0.01, L.eyeR[1] + 0.005);
      const r = f.dw * 0.02 * wink;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(255,250,220,${0.95 * wink})`;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + t * 2, rr = i % 2 ? r * 0.25 : r;
        ctx.lineTo(kx + Math.cos(a) * rr, ky + Math.sin(a) * rr);
      }
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    ctx.restore();

    // The pointing hand gestures on the stressed words.
    if (art.hand) {
      const [ax, ay, aw, ah] = box(L.hand);
      const [wx, wy] = P(L.wrist[0], L.wrist[1]);
      const g = still ? 0 : (stressed(t) ? Math.sin(t * 7) * 0.06 : Math.sin(t * 1.3) * 0.015) + grin * -0.08;
      ctx.save();
      ctx.translate(wx, wy); ctx.rotate(g); ctx.translate(-wx, -wy);
      ctx.drawImage(art.hand, ax, ay, aw, ah);
      ctx.restore();
    }

    // Headphone lights pulse with the music.
    if (!still) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const [cx, cy] of L.cups) {
        const [x, y] = P(cx, cy + nod);
        const r = f.dw * 0.045 * (0.85 + beat * 0.5);
        const gg = ctx.createRadialGradient(x, y, 0, x, y, r);
        gg.addColorStop(0, `rgba(255,190,80,${0.18 + beat * 0.45})`); gg.addColorStop(1, 'rgba(255,120,40,0)');
        ctx.fillStyle = gg; ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
      ctx.restore();
    }
  }

  // Loading bar: fills with the opener, a light sweeping along it.
  function bar(t, duration, dpr) {
    const cw = canvas.width / dpr, ch = canvas.height / dpr;
    const f = fit(art.plate, cw, ch);
    const x = f.dx + L.bar[0] * f.dw, y = f.dy + L.bar[1] * f.dh, w = (L.bar[2] - L.bar[0]) * f.dw, h = (L.bar[3] - L.bar[1]) * f.dh;
    const p = clamp(t / Math.max(1, duration));
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const r = h / 2;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.fillStyle = 'rgba(10,6,20,0.92)';
    ctx.fillRect(x, y, w, h);
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, '#ff9a5a'); g.addColorStop(0.35, '#ff3fbf'); g.addColorStop(0.65, '#a35bff'); g.addColorStop(1, '#3ef2ff');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w * p, h);
    const sx = x + ((t * 0.35) % 1) * w * p;
    const sg = ctx.createLinearGradient(sx - h * 3, 0, sx + h * 3, 0);
    sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(0.5, 'rgba(255,255,255,0.65)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(x, y, w * p, h);
    ctx.restore();
  }

  return { draw, bar };
}
