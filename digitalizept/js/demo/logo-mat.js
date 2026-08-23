/** Match the header to the logo's own background so the JPEG rectangle disappears. */

import { onColor } from './colors.js';

const ALPHA_MIN = 24;
const MODE_SHARE = 0.45;

function rgbToHex(r, g, b) {
    return `#${[r, g, b].map((n) => Math.max(0, Math.min(255, n | 0)).toString(16).padStart(2, '0')).join('')}`;
}

function pixelAt(data, width, x, y) {
    const i = (y * width + x) * 4;
    return { r: data[i], g: data[i + 1], b: data[i + 2], a: data[i + 3] };
}

function walkBorder(width, height, visit) {
    const inset = height > 4 && width > 4 ? 1 : 0;
    for (let x = 0; x < width; x++) {
        visit(x, 0);
        visit(x, height - 1);
        if (inset) {
            visit(x, 1);
            visit(x, height - 2);
        }
    }
    for (let y = 1 + inset; y < height - 1 - inset; y++) {
        visit(0, y);
        visit(width - 1, y);
        if (inset) {
            visit(1, y);
            visit(width - 2, y);
        }
    }
}

/**
 * Flat colour of the logo's frame, or '' when the mark is transparent / has no mat.
 * @param {Uint8ClampedArray|ArrayLike<number>} data
 */
export function sampleLogoMatFromImageData(data, width, height) {
    const w = Number(width) | 0;
    const h = Number(height) | 0;
    if (!data || w < 2 || h < 2) return '';
    const border = [];
    walkBorder(w, h, (x, y) => border.push(pixelAt(data, w, x, y)));
    const opaque = border.filter((p) => p.a >= ALPHA_MIN);
    if (opaque.length < border.length * 0.7) return '';

    const counts = new Map();
    opaque.forEach((p) => {
        const key = `${p.r >> 4},${p.g >> 4},${p.b >> 4}`;
        const cur = counts.get(key) || { n: 0, r: 0, g: 0, b: 0 };
        cur.n += 1;
        cur.r += p.r;
        cur.g += p.g;
        cur.b += p.b;
        counts.set(key, cur);
    });
    let best = null;
    counts.forEach((bucket) => {
        if (!best || bucket.n > best.n) best = bucket;
    });
    if (!best || best.n < opaque.length * MODE_SHARE) return '';
    return rgbToHex(
        Math.round(best.r / best.n),
        Math.round(best.g / best.n),
        Math.round(best.b / best.n)
    );
}

export function applyLogoMatStyle(el, mat) {
    if (!el || !el.style) return;
    if (!mat) {
        el.classList.remove('dpl-has-logo-mat');
        el.style.removeProperty('--logo-mat');
        el.style.removeProperty('--on-logo-mat');
        return;
    }
    el.classList.add('dpl-has-logo-mat');
    el.style.setProperty('--logo-mat', mat);
    el.style.setProperty('--on-logo-mat', onColor(mat));
}

export function sampleLogoMat(dataUrl) {
    if (!dataUrl || typeof Image === 'undefined' || typeof document === 'undefined') {
        return Promise.resolve('');
    }
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            try {
                const w = Math.max(8, Math.min(img.naturalWidth || img.width, 96));
                const h = Math.max(8, Math.min(img.naturalHeight || img.height, 96));
                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d', { willReadFrequently: true });
                if (!ctx) {
                    resolve('');
                    return;
                }
                ctx.drawImage(img, 0, 0, w, h);
                const { data } = ctx.getImageData(0, 0, w, h);
                resolve(sampleLogoMatFromImageData(data, w, h));
            } catch (_) {
                resolve('');
            }
        };
        img.onerror = () => resolve('');
        img.src = dataUrl;
    });
}

export const LOGO_MAT_RUNTIME = `(function(){
  var img = document.querySelector('.dpl-topbar-logo');
  var bar = document.querySelector('.dpl-topbar');
  if (!img || !img.src || !bar) return;
  function hex(r,g,b){ return '#'+[r,g,b].map(function(n){return Math.max(0,Math.min(255,n|0)).toString(16).padStart(2,'0');}).join(''); }
  function sample(data,w,h){
    var pts=[], x, y;
    function push(px,py){ var i=(py*w+px)*4; pts.push({r:data[i],g:data[i+1],b:data[i+2],a:data[i+3]}); }
    for (x=0;x<w;x++){ push(x,0); push(x,h-1); if(h>4){ push(x,1); push(x,h-2);} }
    for (y=2;y<h-2;y++){ push(0,y); push(w-1,y); if(w>4){ push(1,y); push(w-2,y);} }
    var op=pts.filter(function(p){return p.a>=24;});
    if (op.length<pts.length*0.7) return '';
    var map={}, best=null, k;
    op.forEach(function(p){
      k=(p.r>>4)+','+(p.g>>4)+','+(p.b>>4);
      if (!map[k]) map[k]={n:0,r:0,g:0,b:0};
      map[k].n++; map[k].r+=p.r; map[k].g+=p.g; map[k].b+=p.b;
    });
    Object.keys(map).forEach(function(key){ if (!best || map[key].n>best.n) best=map[key]; });
    if (!best || best.n<op.length*0.45) return '';
    return hex(Math.round(best.r/best.n), Math.round(best.g/best.n), Math.round(best.b/best.n));
  }
  function paint(mat){
    if (!mat) return;
    bar.classList.add('dpl-has-logo-mat');
    bar.style.setProperty('--logo-mat', mat);
    var root = document.querySelector('.dp-landing') || document.documentElement;
    root.style.setProperty('--logo-mat', mat);
  }
  function run(){
    try {
      var c=document.createElement('canvas');
      var w=Math.max(8, Math.min(img.naturalWidth||img.width, 96));
      var h=Math.max(8, Math.min(img.naturalHeight||img.height, 96));
      c.width=w; c.height=h;
      var ctx=c.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img,0,0,w,h);
      paint(sample(ctx.getImageData(0,0,w,h).data,w,h));
    } catch (e) {}
  }
  if (img.complete && img.naturalWidth) run();
  else img.addEventListener('load', run);
})();`;

export function injectLogoMatRuntime(doc) {
    if (!doc || doc.querySelector('script[data-dp-logo-mat]')) return;
    const script = doc.createElement('script');
    script.setAttribute('data-dp-logo-mat', '');
    script.textContent = LOGO_MAT_RUNTIME;
    (doc.body || doc.documentElement).appendChild(script);
}
