import React, { useEffect, useRef } from 'react';

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

export default function PrismBackground({ hue = 0, scale = 0.5, fps = 30, className = '' }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return undefined;

    const gl = cv.getContext('webgl') || cv.getContext('experimental-webgl');
    if (!gl) {
      // No WebGL is not a broken tab. Paint something in the same family.
      cv.style.background = 'linear-gradient(140deg,#05070C,#07231A 45%,#140B26)';
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
      cv.style.background = 'linear-gradient(140deg,#05070C,#07231A 45%,#140B26)';
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

    // Only draw when it can actually be seen. Off-screen tabs and a hidden
    // window cost nothing, which is the whole reason this beats a video.
    let onScreen = true;
    const io = new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; kick(); });
    io.observe(cv);

    const started = performance.now();
    const minFrame = 1000 / fps;
    let last = 0;
    let raf = 0;
    let alive = true;

    const frame = (now) => {
      if (!alive) return;
      raf = requestAnimationFrame(frame);
      if (!onScreen || document.hidden) return;
      if (now - last < minFrame) return;
      last = now;
      applyHue();
      gl.uniform1f(uT, (now - started) / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    const kick = () => { if (alive && !raf) raf = requestAnimationFrame(frame); };
    kick();

    const onVis = () => kick();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('lyricist-prism', applyHue);

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      if (resizePending) cancelAnimationFrame(resizePending);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('lyricist-prism', applyHue);
      const ext = gl.getExtension('WEBGL_lose_context');
      if (ext) ext.loseContext();
    };
  }, [hue, scale, fps]);

  return (
    <canvas
      ref={canvasRef}
      className={`prism-bg ${className}`}
      aria-hidden="true"
    />
  );
}
