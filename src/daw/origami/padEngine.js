/**
 * The idle pad engine — Push / Launchpad idle, in full spectrum.
 *
 * Ported verbatim from the approved prototype. Every pattern is SPATIAL
 * (rings, walks, drops, phase, a pen stroke) and none of them fills
 * bottom-up, which is what keeps an idling board from ever being misread
 * as a level. Hue comes off a plasma field; the metering palette
 * (ice / amber / crimson) is never used here.
 */

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

export var ripples = [];
export function pushRipple(t){
  ripples.push({ x: Math.random(), y: Math.random(), t0: t, h: Math.random()*360 });
  if(ripples.length > 6) ripples.shift();
}
export var PATTERNS = ["cycle","signature","breathe","ripple","chase","sparkle","rain"];


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

  if(mode === "breathe"){
    for(i=0;i<n;i++){
      c = i % cols; r = (i / cols) | 0;
      var nx = c / Math.max(cols-1,1) * 7, ny = r / Math.max(rows-1,1) * 5;
      var pl = Math.sin(nx*1.15 + ts*0.50)
             + Math.sin(ny*1.55 - ts*0.37)
             + Math.sin((nx - ny)*0.95 + ts*0.79);
      outH[i] = (pl * 98 + ts * 26) % 360;
      outA[i] = 0.26 + 0.34 * (0.5 + 0.5 * Math.sin(ts*0.9 + nx*0.5 + ny*0.75));
    }
  }
  else if(mode === "ripple"){
    var sp = Math.max(cols, rows) / 4.4;
    for(k=0;k<ripples.length;k++){
      var rp = ripples[k], age = t - rp.t0;
      if(age < 0 || age > 3) continue;
      var fade = Math.exp(-age * 0.80);
      var ox = rp.x * (cols-1), oy = rp.y * (rows-1);
      for(i=0;i<n;i++){
        c = i % cols; r = (i / cols) | 0;
        var d = Math.sqrt((c-ox)*(c-ox) + (r-oy)*(r-oy));
        var band = 1 - Math.abs(d - age * 2.4 * sp) / (0.9 * sp);
        if(band > 0){
          var v = band * fade;
          if(v > outA[i]){ outA[i] = v; outH[i] = (rp.h + d * 9) % 360; }
        }
      }
    }
  }
  else if(mode === "chase"){
    var tail = Math.max(5, Math.round(n * 0.09));
    var pos  = (ts * n * 0.20) % n;
    for(k=0;k<n;k++){
      var dist = k - pos;
      if(dist < 0) dist += n;
      if(dist < tail){
        var cell = f.serp[k];
        outA[cell] = Math.pow(1 - dist / tail, 2.0);
        outH[cell] = (ts * 78 + dist * (360 / tail)) % 360;
      }
    }
  }
  else if(mode === "sparkle"){
    var chance = 3.2 / n;
    for(i=0;i<n;i++){
      if(Math.random() < chance){ f.decay[i] = 1; f.hue[i] = Math.random() * 360; }
      f.decay[i] *= 0.905;
      outA[i] = f.decay[i];
      outH[i] = f.hue[i];
    }
  }
  else { /* rain */
    for(c=0;c<cols;c++){
      var y  = ((ts * 2.6 + c * 0.62) % (rows + 3)) - 1.5;
      var hc = (c * (360 / Math.max(cols,1)) * 1.7 + ts * 34) % 360;
      for(r=0;r<rows;r++){
        var dy = r - y;
        if(dy < 0.4 && dy > -2.4){
          outA[r*cols + c] = Math.max(0, 1 - Math.abs(dy) / 1.4);
          outH[r*cols + c] = (hc + Math.abs(dy) * 22) % 360;
        }
      }
    }
  }
}
