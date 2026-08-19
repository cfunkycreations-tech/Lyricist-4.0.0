import React, { useEffect, useRef, useState } from 'react';

/**
 * The living background. One shader, every tab.
 *
 * This replaces the background videos. Chris's call, and the numbers back it:
 * sixteen clips were the bulk of a ~400 MB installer, one of them (Scratchpad)
 * shipped 16.7 MB for a background that an opaque panel made impossible to see,
 * and they froze solid the moment the window was covered because Chromium
 * suspends media it thinks is hidden. This is a few KB of maths that cannot
 * freeze, cannot go stale, and looks the same on all seventeen tabs.
 *
 * PRISM: `hue` rotates the entire palette. The app-wide setting and each tab's
 * own offset are added together, so all seventeen shift as one piece while
 * staying distinguishable from each other.
 *
 * It stops rendering the moment it is off screen or the window is hidden. A
 * background nobody is looking at must not cost a laptop any battery.
 */

const VERT = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';

const FRAG = `
precision highp float;
uniform vec2 R; uniform float T; uniform float HUE;
mat2 rot(float a){float s=sin(a),c=cos(a);return mat2(c,-s,s,c);}
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*noise(p);p=rot(.7)*p*2.02;a*=.5;}return v;}
vec3 hueshift(vec3 c,float h){
  const vec3 k=vec3(0.57735);float ca=cos(h);
  return c*ca+cross(k,c)*sin(h)+k*dot(k,c)*(1.-ca);}
void main(){
  vec2 uv=(gl_FragCoord.xy-.5*R)/R.y;
  float t=T*.055;
  vec2 q=vec2(fbm(uv*1.6+vec2(0.,t)),fbm(uv*1.6+vec2(4.2,-t*.8)));
  vec2 r=vec2(fbm(uv*2.1+q*1.9+vec2(1.7,9.2)+t*.5),fbm(uv*2.1+q*1.9+vec2(8.3,2.8)-t*.4));
  float f=fbm(uv*1.5+r*1.6);
  float band=abs(sin(f*7.5+r.x*3.0+T*.09));
  float ridge=pow(1.-band,7.0);
  float wide=pow(1.-band,2.2)*.30;
  float m=clamp(r.y*.85+f*.55,0.,1.);
  vec3 gr=vec3(.09,.78,.49), bl=vec3(.30,.49,1.0), vi=vec3(.61,.42,1.0), mg=vec3(.91,.42,.85);
  vec3 em=vec3(.06,.72,.48);
  vec3 col = mix(gr,bl,smoothstep(.0,.42,m));
  col = mix(col,vi,smoothstep(.38,.72,m));
  col = mix(col,mg,smoothstep(.74,1.,m));
  float eMask = smoothstep(.72,.12,f) * smoothstep(.20,.70,q.x);
  col = mix(col,em,eMask*.80);
  col = hueshift(col, HUE*6.2831);
  vec3 outc = col*(ridge*1.85 + wide*1.35);
  outc += col*ridge*ridge*1.35;
  float vig = smoothstep(1.75,.05,length(uv*vec2(.72,1.)));
  outc *= vig;
  outc = outc/(outc+.62);
  outc += (hash(gl_FragCoord.xy+T)-.5)*.016;
  gl_FragColor=vec4(max(outc,0.),1.);
}`;

/** Read the app-wide prism setting. Written by Settings, read by every tab. */
export function getPrism() {
  const raw = Number(localStorage.getItem('lyricistPrism'));
  return Number.isFinite(raw) ? raw : 0;
}

/**
 * One canvas, one context, alive only while it is mounted.
 *
 * Split out from PrismBackground on purpose. A WebGL context that has been
 * released with `WEBGL_lose_context.loseContext()` is DEAD FOR GOOD as far as
 * `getContext` is concerned: calling it again hands back the same lost context,
 * not a new one, and every gl call after that quietly does nothing. That is the
 * whole reason the first attempt at this fix released contexts correctly and
 * still left every tab frozen when you walked back through them. Measured: after
 * a forward pass over seventeen tabs, 1 of 17 contexts alive; on the way back,
 * seventeen out of seventeen DEAD.
 *
 * A fresh DOM canvas is the only thing that reliably gets a fresh context, so
 * the canvas element itself comes and goes with the tab.
 */
function PrismCanvas({ hue, scale, fps, onLost }) {
  const hostRef = useRef(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    // THE CANVAS IS BUILT HERE, NOT IN THE JSX, AND THAT IS DELIBERATE.
    //
    // A context released with loseContext() cannot be revived: getContext on
    // that same canvas hands the dead one straight back. React 18's StrictMode
    // runs every effect twice in dev (mount, cleanup, mount), so a canvas from
    // JSX would be REUSED on the second run and would come back holding the
    // corpse of the context the first cleanup had just killed. Every prism in
    // dev ended up dead that way, measured as 2 canvases mounted and 1 live
    // context. Building the element in the effect means each run gets its own
    // element and its own context, and the cleanup takes both away.
    const cv = document.createElement('canvas');
    cv.setAttribute('aria-hidden', 'true');
    cv.style.cssText = 'width:100%;height:100%;display:block';
    host.appendChild(cv);

    const drop = () => { if (cv.parentNode) cv.parentNode.removeChild(cv); };

    // If a context is taken away for any reason at all, say so and get a new
    // canvas. preventDefault is what marks the loss as recoverable; without it
    // this canvas is finished for the life of the page, which is precisely the
    // silent death Chris was looking at.
    const onCtxLost = (e) => { e.preventDefault(); onLost(); };
    cv.addEventListener('webglcontextlost', onCtxLost);

    const gl = cv.getContext('webgl') || cv.getContext('experimental-webgl');
    if (!gl) {
      // No WebGL is not a broken tab. The wrapper already paints the fallback.
      drop();
      return undefined;
    }
    const compile = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      drop();
      return undefined;
    }
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const uR = gl.getUniformLocation(prog, 'R');
    const uT = gl.getUniformLocation(prog, 'T');
    const uH = gl.getUniformLocation(prog, 'HUE');

    const applyHue = () => gl.uniform1f(uH, (getPrism() + hue) % 1);
    applyHue();

    const size = () => {
      const w = Math.max(1, Math.floor(cv.clientWidth * scale));
      const h = Math.max(1, Math.floor(cv.clientHeight * scale));
      if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
      gl.viewport(0, 0, cv.width, cv.height);
      gl.uniform2f(uR, cv.width, cv.height);
    };
    size();

    // Resize on the NEXT frame, never inside the observer callback.
    // Writing to the canvas during the callback makes the observer fire again,
    // and Chromium reports that as "ResizeObserver loop completed with
    // undelivered notifications" — harmless in itself, but it filled boot.log
    // with errors, and a log full of noise is where a real error goes to hide.
    let resizePending = 0;
    const ro = new ResizeObserver(() => {
      if (resizePending) return;
      resizePending = requestAnimationFrame(() => { resizePending = 0; size(); });
    });
    ro.observe(cv);

    // On-screen is handled by `live` above, which now decides whether this
    // effect runs at all rather than merely whether it draws.

    const started = performance.now();
    const minFrame = 1000 / fps;
    let last = 0;
    let raf = 0;
    let alive = true;

    const frame = (now) => {
      if (!alive) return;
      raf = requestAnimationFrame(frame);
      // No document.hidden check on purpose. Chromium already parks rAF for a
      // page it considers hidden, so the guard saved nothing, and Electron's
      // idea of hidden includes "covered", which would freeze a background in
      // plain sight.
      if (now - last < minFrame) return;
      last = now;
      applyHue();
      gl.uniform1f(uT, (now - started) / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    const kick = () => { if (alive && !raf) raf = requestAnimationFrame(frame); };
    kick();

    // When rAF was parked, `raf` still holds the id of the callback Chromium
    // never delivered, so kick() would see a truthy value and do nothing.
    // Cancel it and start a fresh one.
    const onVis = () => { cancelAnimationFrame(raf); raf = 0; kick(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onVis);
    window.addEventListener('lyricist-prism', applyHue);

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      if (resizePending) cancelAnimationFrame(resizePending);
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onVis);
      window.removeEventListener('lyricist-prism', applyHue);
      // Stop listening BEFORE letting go of the context. loseContext() fires
      // webglcontextlost like any other loss, so leaving the handler attached
      // turned every ordinary tab switch into "the context died, rebuild it",
      // which rebuilt it, which tore it down again. Measured at 679 contexts
      // handed out across three laps of the tabs, and it locked the page up.
      cv.removeEventListener('webglcontextlost', onCtxLost);
      const ext = gl.getExtension('WEBGL_lose_context');
      if (ext) ext.loseContext();
      drop();
    };
  }, [hue, scale, fps]);

  return <span ref={hostRef} style={{ display: 'block', width: '100%', height: '100%' }} aria-hidden="true" />;
}

export default function PrismBackground({ hue = 0, scale = 0.5, fps = 30, className = '' }) {
  const boxRef = useRef(null);
  // ONLY A CANVAS YOU CAN SEE IS ALLOWED TO HOLD A WEBGL CONTEXT.
  //
  // Chris, 2026-08-19: *"the background animations work one through seventeen
  // tabs. But as you go through them and you come back through them, they stop
  // working."* Exactly right, and the cause is a hard browser limit rather than
  // anything in the shader.
  //
  // A tab stays MOUNTED once opened (TabPane hides it with display:none so its
  // work is not lost), so every tab visited left a live prism behind it.
  // Seventeen tabs plus the header is EIGHTEEN WebGL contexts and Chromium
  // allows SIXTEEN per renderer, so creating the seventeenth force-loses the
  // oldest. Nothing threw and nothing logged. The canvas just stopped and stayed
  // stopped, which is exactly why walking forward worked and walking back did
  // not. Measured in the dev server: 18 canvases, 18 reporting
  // `gl.isContextLost() === true`.
  //
  // So the canvas is mounted while it is on screen and unmounted when it is not,
  // which caps the app at two contexts: the header and whichever tab is open.
  // STARTS FALSE ON PURPOSE. With it true, all eighteen prisms built a canvas on
  // their very first render, before any of them had measured anything, and
  // eighteen contexts at once is over Chromium's sixteen: the browser force-lost
  // the OLDEST, which is the header, and the header never unmounts so nothing
  // ever built it again. Measured as "header DEAD, tab LIVE" on every single tab.
  // The effect below runs after layout, so the right one turns on a tick later.
  const [live, setLive] = useState(false);
  // Bumped when a context is lost, which remounts the canvas and builds a new
  // one. A loss can never again be permanent and silent.
  const [gen, setGen] = useState(0);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return undefined;

    // ON SCREEN MEANS "HAS A LAYOUT BOX". NOT IntersectionObserver, NOT
    // document.hidden.
    //
    // Both of those describe whether a human can SEE the window, and Electron
    // gets that wrong in the one way that matters: a window merely COVERED by
    // another window is reported hidden, and in that state nothing intersects
    // the viewport either. Gating on either signal is how a background Chris is
    // looking at ends up frozen; TabPane carries the same warning about the
    // videos, learned the same way. A layout box is a fact about the DOM rather
    // than a guess about the desktop, and TabPane's display:none is the only
    // thing that takes it away. Measured: with an IntersectionObserver here,
    // thirty-four tab switches created ZERO contexts.
    const sync = () => setLive(box.getClientRects().length > 0);
    sync();

    // THE TAB SWITCH ITSELF IS THE SIGNAL. App dispatches this the moment the
    // active tab changes, and React runs every cleanup before any effect in the
    // same commit, so the tab being left gives up its context BEFORE the tab
    // being opened asks for one. Waiting on an observer let contexts pile up
    // faster than they were released while clicking quickly through the tabs,
    // and the sixteen-context ceiling was hit anyway.
    window.addEventListener('lyricist-tab', sync);
    // Catches the rest: window resizes, panes opening, anything that gives this
    // a box or takes it away without a tab change.
    const ro = new ResizeObserver(sync);
    ro.observe(box);
    window.addEventListener('focus', sync);
    // Backstop. Cheap, and this class of bug has cost him a build before.
    const poll = setInterval(sync, 1000);

    return () => {
      window.removeEventListener('lyricist-tab', sync);
      window.removeEventListener('focus', sync);
      ro.disconnect();
      clearInterval(poll);
    };
  }, []);

  // The wrapper is always in the DOM: it is what holds the layout box that
  // decides all of the above, and its gradient is what shows for the one frame
  // between a tab opening and the first draw. Same colours, so nothing flashes.
  return (
    <div
      ref={boxRef}
      className={`prism-bg ${className}`}
      aria-hidden="true"
      style={{ background: 'linear-gradient(140deg,#05070C,#07231A 45%,#140B26)' }}
    >
      {live && (
        <PrismCanvas
          key={gen}
          hue={hue}
          scale={scale}
          fps={fps}
          onLost={() => setGen((g) => g + 1)}
        />
      )}
    </div>
  );
}
