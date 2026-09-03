/**
 * The idle pad engine — a self-running board, the way a Push or a Launchpad
 * idles, in full spectrum.
 *
 * Ported verbatim from the published reference so the app and the reference
 * cannot drift. Scenes: the board signs its own name, then cycles through
 * matrix code-rain (the wordmark condenses out of it), a supernova shockwave,
 * wave interference, a triangular craft, darting orbs, and an aurora.
 *
 * Every scene is SPATIAL — rings, walks, drops, phase, a pen stroke — and none
 * of them fills bottom-up, which is what keeps an idling board from ever being
 * misread as a level. Hue comes off the scene, never off the metering palette
 * (ice / amber / crimson), which stays reserved for metering.
 */

/** The scenes the board cycles, after the signature. */
export var POOL = ["matrix","supernova","interference","craft","orbs","aurora"];

/**
 * The scene the board is currently showing.
 *
 * The pad wall owns the clock; the 5x4 transport meters read it so an idling
 * transport shows the same scene as the wall instead of running its own.
 * A module singleton rather than context: it is a purely visual clock read
 * every frame, and threading it through the shell as state would re-render
 * the whole tree sixty times a second.
 */
export var scene = { mode: 'signature', label: 'Signature' };

/** @param {string} mode @param {string} label */
export function setScene(mode, label){ scene.mode = mode; scene.label = label; }

/** Display names for the scene readout. */
export var LABELS = {
  signature:"Signature", matrix:"Matrix", supernova:"Supernova",
  interference:"Interference", craft:"Craft", orbs:"Orbs", aurora:"Aurora"
};

export function makeField(cols, rows){
  var n = cols * rows;
  return { cols:cols, rows:rows, n:n,
           decay:new Float32Array(n), hue:new Float32Array(n),
           A:new Float32Array(n), H:new Float32Array(n), serp:serp(cols,rows) };
}
function serp(cols, rows){
  var o = [];
  for(var r=rows-1; r>=0; r--){
    var row = [];
    for(var c=0;c<cols;c++) row.push(r*cols + c);
    if((rows-1-r) % 2 === 1) row.reverse();
    o = o.concat(row);
  }
  return o;
}

// Emitter pools. A scene that throws things (ripples, detonations) keeps its
// own list here so the crossfade can feed BOTH the outgoing and the incoming
// scene — otherwise a scene goes dead the moment it starts fading out.
export var ripples = [];
export var blasts  = [];

/** Seed a ripple at a random point. @param {number} t seconds */
export function pushRipple(t){
  ripples.push({ x: Math.random(), y: Math.random(), t0: t, h: Math.random()*360 });
  if(ripples.length > 6) ripples.shift();
}

/** Seed a supernova detonation. @param {number} t seconds */
export function pushBlast(t){
  blasts.push({ x: 0.16 + Math.random()*0.68, y: 0.16 + Math.random()*0.68,
                t0: t, h: 268 + Math.random()*44 });
  if(blasts.length > 5) blasts.shift();
}

/* ── the signature mask: the wordmark rasterised down to pad resolution ──
   Drawn once per grid size into an offscreen canvas, then read back as one
   coverage value per cell. The pads do not draw type; they light where the
   type is, which is what makes it look handwritten rather than printed. */
var maskCache = {};
function signatureMask(f){
  var key = f.cols + "x" + f.rows;
  if(maskCache[key]) return maskCache[key];
  var SS = 4;                                   /* supersample for coverage */
  var oc = document.createElement("canvas");
  oc.width = f.cols * SS; oc.height = f.rows * SS;
  var o = oc.getContext("2d");
  o.clearRect(0,0,oc.width,oc.height);
  o.fillStyle = "#fff";
  o.textAlign = "center";
  o.textBaseline = "middle";
  var size = Math.floor(oc.height * 0.82);
  o.font = '700 ' + size + 'px "Dancing Script", "Brush Script MT", cursive';
  var text = "Lyricist 4.2.0 Pro";
  var w = o.measureText(text).width;
  var scale = Math.min(1, (oc.width * 0.96) / Math.max(w, 1));
  o.save();
  o.translate(oc.width/2, oc.height/2);
  o.scale(scale, scale);
  o.lineWidth = Math.max(1, size * 0.055);
  o.strokeStyle = "#fff";
  o.lineJoin = "round";
  o.strokeText(text, 0, 0);
  o.fillText(text, 0, 0);
  o.restore();

  var px = o.getImageData(0,0,oc.width,oc.height).data;
  var m  = new Float32Array(f.n);
  for(var r=0;r<f.rows;r++){
    for(var c=0;c<f.cols;c++){
      var sum = 0;
      for(var y=0;y<SS;y++){
        for(var x=0;x<SS;x++){
          sum += px[(((r*SS+y)*oc.width) + (c*SS+x))*4 + 3] / 255;
        }
      }
      m[r*f.cols + c] = sum / (SS*SS);
    }
  }
  maskCache[key] = m;
  return m;
}

export function padField(f, t, mode, seed){
  var outA = f.A, outH = f.H, i, c, r, k;
  var cols = f.cols, rows = f.rows, n = f.n;
  for(i=0;i<n;i++){ outA[i] = 0; outH[i] = 0; }
  var ts = t + seed;

  if(mode === "signature"){
    /* a pen walking left to right: cells inside the wordmark light as the
       nib passes them, with a bright head, a warm trail, and a hold at the end */
    var m = signatureMask(f);
    var span = 5.2, hold = 2.4;
    var pen = ((t % (span + hold)) / span);
    for(i=0;i<n;i++){
      if(m[i] < 0.04) continue;
      c = i % cols;
      var cx = c / Math.max(cols - 1, 1);
      var lead = pen - cx;
      if(lead < 0) continue;                        /* nib has not reached it */
      var head = Math.max(0, 1 - lead * 9);         /* the bright nib */
      var ink  = pen > 1 ? Math.max(0, 1 - (pen - 1) * 1.4) : 1;
      outA[i] = Math.min(1, (0.55 * ink + head * 0.70) * Math.min(1, m[i] * 2.1));
      outH[i] = (188 + cx * 150 + head * 60 + t * 14) % 360;
    }
    return;
  }

  if(mode === "matrix"){
    /* GREEN CODE RAIN, and the wordmark condenses out of it and dissolves.
       Each column has its own falling head — a white-green nib with an
       emerald trail — and on a slow cycle the cells that spell the wordmark
       lift out of the rain, hold, and fall back in. */
    var mm = signatureMask(f);
    if(!f.drops || f.drops.length !== cols){
      f.drops  = new Float32Array(cols);
      f.dropSp = new Float32Array(cols);
      for(c=0;c<cols;c++){ f.drops[c] = -Math.random() * rows * 1.8; f.dropSp[c] = 0.6 + Math.random() * 1.0; }
      f.mlast = t;
    }
    var mdt = Math.min(0.06, t - (f.mlast || t)); f.mlast = t;
    var mtail = Math.max(4, rows * 0.62);
    for(c=0;c<cols;c++){
      f.drops[c] += f.dropSp[c] * mdt * 11;
      if(f.drops[c] - mtail > rows){ f.drops[c] = -Math.random() * rows * 0.6; f.dropSp[c] = 0.6 + Math.random() * 1.0; }
      var head = f.drops[c];
      for(r=0;r<rows;r++){
        var beh = head - r;
        if(beh < 0 || beh > mtail) continue;
        i = r * cols + c;
        if(beh < 0.85){ outA[i] = 1; outH[i] = 108; }
        else { outA[i] = Math.pow(1 - beh / mtail, 1.6) * 0.82; outH[i] = 128 + Math.sin(r*0.6 + c*0.4) * 7; }
      }
    }
    var mcyc = 8.4, mph = (t % mcyc) / mcyc;
    var reveal = Math.pow(Math.max(0, Math.sin(mph * Math.PI)), 0.55);
    if(reveal > 0.02){
      for(i=0;i<n;i++){
        if(mm[i] < 0.12) continue;
        var want = Math.min(1, mm[i] * 1.7) * reveal;
        if(want > outA[i]) outA[i] = want;
        outH[i] = 132;
      }
    }
    return;
  }

  if(mode === "supernova"){
    /* a gold core detonates, throws a cooling blue-violet shockwave outward.
       Detonations recur at shifting centres; the hot interior fades fast, the
       ring travels and thins. */
    var spN = Math.max(cols, rows) / 3.0;
    for(k=0;k<blasts.length;k++){
      var bl = blasts[k], ageB = t - bl.t0;
      if(ageB < 0 || ageB > 2.8) continue;
      var ox = bl.x * (cols-1), oy = bl.y * (rows-1);
      var rad = ageB * 2.4 * spN, fadeB = Math.exp(-ageB * 0.85);
      for(i=0;i<n;i++){
        c = i % cols; r = (i / cols) | 0;
        var dB = Math.sqrt((c-ox)*(c-ox) + (r-oy)*(r-oy));
        var v = 0, hue = bl.hue;
        var ring = 1 - Math.abs(dB - rad) / (1.3 * spN);
        if(ring > 0){ v = ring * fadeB; hue = (bl.hue + dB * 6) % 360; }
        if(ageB < 0.55){ var core = Math.max(0, 1 - dB / 2.4) * (1 - ageB / 0.55); if(core > v){ v = core; hue = 48; } }
        if(v > outA[i]){ outA[i] = v; outH[i] = hue; }
      }
    }
    return;
  }

  if(mode === "interference"){
    /* three wandering wave-sources; crests reinforce to bright cells, and
       where wavefronts cancel the board goes to black — real moiré. */
    var srcN = 3, kk, sx = [], sy = [];
    for(kk=0;kk<srcN;kk++){
      sx[kk] = (0.5 + 0.42 * Math.sin(ts * 0.50 + kk * 2.1)) * (cols - 1);
      sy[kk] = (0.5 + 0.42 * Math.cos(ts * 0.41 + kk * 1.7)) * (rows - 1);
    }
    var wl = Math.max(cols, rows) / 6;
    for(i=0;i<n;i++){
      c = i % cols; r = (i / cols) | 0;
      var sum = 0;
      for(kk=0;kk<srcN;kk++){
        var dI = Math.sqrt((c-sx[kk])*(c-sx[kk]) + (r-sy[kk])*(r-sy[kk]));
        sum += Math.sin(dI / wl * Math.PI * 2 - ts * 2.2);
      }
      var amp = sum / srcN;
      outA[i] = Math.pow(Math.max(0, amp), 1.6) * 0.92;
      outH[i] = (210 + amp * 70 + ts * 8) % 360;
    }
    return;
  }

  if(mode === "craft"){
    /* a black triangular craft glides across the board — three pulsing
       corner lights and a dim belly glow, drifting with a slow yaw. */
    if(!f.craft) f.craft = { t0: t };
    var per = 12, pp = ((t - f.craft.t0) % per) / per;
    var cxC = (-0.25 + 1.5 * pp) * (cols - 1);
    var cyC = (0.5 + 0.16 * Math.sin(t * 0.3)) * (rows - 1);
    var yaw = Math.PI / 2 + 0.28 * Math.sin(t * 0.4);
    var siz = Math.max(3, Math.min(cols, rows) * 0.36);
    var vx = [], vy = [], vi;
    for(vi=0; vi<3; vi++){
      var aa = yaw + vi * 2.0944;
      vx[vi] = cxC + Math.cos(aa) * siz;
      vy[vi] = cyC + Math.sin(aa) * siz;
    }
    var sgn = function(ax,ay,bx,by,px,py){ return (px-bx)*(ay-by) - (ax-bx)*(py-by); };
    for(i=0;i<n;i++){
      c = i % cols; r = (i / cols) | 0;
      var s1 = sgn(vx[0],vy[0],vx[1],vy[1],c,r);
      var s2 = sgn(vx[1],vy[1],vx[2],vy[2],c,r);
      var s3 = sgn(vx[2],vy[2],vx[0],vy[0],c,r);
      var hasNeg = (s1<0)||(s2<0)||(s3<0), hasPos = (s1>0)||(s2>0)||(s3>0);
      if(!(hasNeg && hasPos)){ outA[i] = 0.16; outH[i] = 214; }   /* dim underside */
    }
    var cHue = [40, 350, 190];
    for(vi=0; vi<3; vi++){
      var pulseC = 0.7 + 0.3 * Math.sin(t * 4 + vi * 2.1);
      for(i=0;i<n;i++){
        c = i % cols; r = (i / cols) | 0;
        var dC = Math.sqrt((c-vx[vi])*(c-vx[vi]) + (r-vy[vi])*(r-vy[vi]));
        var vC = Math.max(0, 1 - dC / 1.9) * pulseC;
        if(vC > outA[i]){ outA[i] = vC; outH[i] = cHue[vi]; }
      }
    }
    return;
  }

  if(mode === "orbs"){
    /* glowing orbs that drift, then dart — sudden velocity changes at random
       intervals, the way UAP orbs are always described. */
    if(!f.orbs){
      f.orbs = [];
      var ON = Math.max(3, Math.round((cols + rows) / 9));
      for(var oi=0; oi<ON; oi++){
        f.orbs.push({ x: Math.random()*cols, y: Math.random()*rows,
                      vx: (Math.random()-0.5)*0.5, vy: (Math.random()-0.5)*0.5,
                      hue: [190, 48, 292][oi % 3], rad: 1.5 + Math.random()*1.3,
                      next: t + 1 + Math.random()*2 });
      }
      f.olast = t;
    }
    var odt = Math.min(0.05, t - (f.olast || t)); f.olast = t;
    for(var oj=0; oj<f.orbs.length; oj++){
      var ob = f.orbs[oj];
      if(t > ob.next){                                  /* the dart */
        ob.vx = (Math.random()-0.5)*2.4; ob.vy = (Math.random()-0.5)*2.4;
        ob.next = t + 0.6 + Math.random()*2.2;
      }
      ob.x += ob.vx * odt * 9; ob.y += ob.vy * odt * 9;
      if(ob.x < 0){ ob.x = 0; ob.vx = Math.abs(ob.vx); } if(ob.x > cols-1){ ob.x = cols-1; ob.vx = -Math.abs(ob.vx); }
      if(ob.y < 0){ ob.y = 0; ob.vy = Math.abs(ob.vy); } if(ob.y > rows-1){ ob.y = rows-1; ob.vy = -Math.abs(ob.vy); }
      var pulseO = 0.72 + 0.28 * Math.sin(t * 3 + oj);
      for(i=0;i<n;i++){
        c = i % cols; r = (i / cols) | 0;
        var dO = Math.sqrt((c-ob.x)*(c-ob.x) + (r-ob.y)*(r-ob.y));
        var vO = Math.max(0, 1 - dO / ob.rad) * pulseO;
        if(vO > outA[i]){ outA[i] = vO; outH[i] = ob.hue; }
      }
    }
    return;
  }

  /* aurora — flowing emerald-cyan curtains from two travelling waves */
  for(i=0;i<n;i++){
    c = i % cols; r = (i / cols) | 0;
    var nxa = c / Math.max(cols-1,1), nya = r / Math.max(rows-1,1);
    var wv = Math.sin((nxa*3.0 + nya*1.3) * Math.PI + ts*0.55)
           + 0.6 * Math.sin((nxa*1.2 - nya*2.6) * Math.PI - ts*0.40);
    var bandA = 0.5 + 0.5 * Math.sin(wv * 1.5 + ts * 0.5);
    outA[i] = 0.12 + 0.52 * Math.pow(bandA, 2.4);
    outH[i] = (150 + wv * 54 + ts * 9) % 360;
  }
}
