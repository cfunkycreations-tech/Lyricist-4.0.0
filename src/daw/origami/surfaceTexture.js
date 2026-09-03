/**
 * Mix A — carbon weave under mill grain, the approved writing surface.
 * Lifted verbatim from the prototype: ground gradient, 6px twill at a third
 * contrast, anisotropic grain, ordered dither, inner vignette. Every constant
 * here was tuned against the reference render.
 */
function rnd(seed){
  var s = seed >>> 0;
  return function(){
    s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

/**
 * Paint the writing surface into a canvas element, sized to its own box.
 * @param {HTMLCanvasElement} cv
 */
export function paintSurface(cv){

  var w = cv.clientWidth || 1000, h = cv.clientHeight || 640;
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = Math.max(1, Math.round(w*dpr)); cv.height = Math.max(1, Math.round(h*dpr));
  var c = cv.getContext("2d"); if(!c) return;
  c.setTransform(dpr,0,0,dpr,0,0);

  var g = c.createLinearGradient(0,0,0,h);
  g.addColorStop(0,"#1B1C21"); g.addColorStop(0.55,"#121316"); g.addColorStop(1,"#08090B");
  c.fillStyle = g; c.fillRect(0,0,w,h);

  var cell = 6; c.lineWidth = 1;
  for(var p=0;p<2;p++){
    c.strokeStyle = p ? "rgba(255,255,255,0.017)" : "rgba(0,0,0,0.17)";
    var off = p ? 0 : cell/2;
    c.beginPath();
    for(var k=-h;k<w+h;k+=cell*2){
      c.moveTo(k+off,0); c.lineTo(k+off+h,h);
      c.moveTo(k+off+cell,h); c.lineTo(k+off+cell+h,0);
    }
    c.stroke();
  }

  var R = rnd(0x0A1F3B);
  var img = c.getImageData(0,0,cv.width,cv.height), d = img.data;
  var rs = new Float32Array(cv.height), x, y, i, n;
  for(y=0;y<cv.height;y++) rs[y] = (R()-0.5);
  var M = [[0,8,2,10],[12,4,14,6],[3,11,1,9],[15,7,13,5]];
  for(y=0;y<cv.height;y++){
    var b = rs[y]*16;
    for(x=0;x<cv.width;x++){
      n = b + Math.sin((x*0.013)+(y*1.7))*2.8 + (R()-0.5)*4.2 + (M[y&3][x&3]/16 - 0.5)*2.2;
      i = (y*cv.width + x)*4;
      d[i] += n; d[i+1] += n; d[i+2] += n*1.05;
    }
  }
  c.putImageData(img,0,0);

  var v = c.createRadialGradient(w*0.42,h*0.30,Math.min(w,h)*0.10,w*0.42,h*0.30,Math.max(w,h)*0.95);
  v.addColorStop(0,"rgba(255,255,255,0.028)");
  v.addColorStop(0.6,"rgba(0,0,0,0)");
  v.addColorStop(1,"rgba(0,0,0,0.44)");
  c.fillStyle = v; c.fillRect(0,0,w,h);
  }
