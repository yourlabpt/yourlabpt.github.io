/**
 * Public-demo copy friction for the browser shell and iframe srcdoc.
 * Mirrors server/lib/digitalizept-demo-protect.js — keep behaviour in sync.
 * Must never block CTAs, tel/WhatsApp/Maps links, or form fields.
 */

export const WATERMARK = 'Exemplo YourLab · não é o site final';

/** Sandbox that still lets clients open WhatsApp / Maps / Livro / social links. */
export const DEMO_IFRAME_SANDBOX = [
    'allow-scripts',
    'allow-forms',
    'allow-modals',
    'allow-popups',
    'allow-popups-to-escape-sandbox'
].join(' ');

const PROTECT_STYLE = `<style data-dp-protect>
html.dp-protect,html.dp-protect body{-webkit-user-select:none!important;user-select:none!important}
html.dp-protect input,html.dp-protect textarea,html.dp-protect select,html.dp-protect [contenteditable]{-webkit-user-select:text!important;user-select:text!important}
html.dp-protect a,html.dp-protect button,html.dp-protect label,html.dp-protect summary,html.dp-protect input,html.dp-protect textarea,html.dp-protect select{pointer-events:auto!important;-webkit-user-drag:auto}
html.dp-protect img,html.dp-protect picture,html.dp-protect video,html.dp-protect canvas{-webkit-user-drag:none!important;user-select:none!important}
.dp-protect-wm{position:fixed;right:10px;bottom:10px;left:auto;z-index:2147483646;pointer-events:none;max-width:min(220px,70vw);text-align:right;padding:.4rem .55rem;border-radius:8px;font:600 11px/1.35 system-ui,-apple-system,sans-serif;letter-spacing:.01em;color:rgba(255,255,255,.92);background:rgba(15,23,42,.72);text-shadow:0 1px 2px rgba(0,0,0,.35)}
@media print{html.dp-protect body *{visibility:hidden!important}.dp-protect-wm{visibility:visible!important;position:fixed;inset:auto 0 40%;left:0;right:0;text-align:center;max-width:none;font-size:18px;color:#000;background:none;text-shadow:none}}
</style>`;

const PROTECT_SCRIPT = `<script data-dp-protect>
(function(){
  try{
    var doc=document;
    var root=doc.documentElement;
    root.classList.add('dp-protect');
    if(doc.body) doc.body.classList.add('dp-protect');
    else doc.addEventListener('DOMContentLoaded',function(){doc.body&&doc.body.classList.add('dp-protect');});
    function isEditable(t){
      if(!t||t.nodeType!==1) return false;
      var tag=(t.tagName||'').toLowerCase();
      if(tag==='input'||tag==='textarea'||tag==='select') return true;
      if(t.isContentEditable) return true;
      return !!(t.closest&&t.closest('input,textarea,select,[contenteditable="true"],[contenteditable=""]'));
    }
    function isInteractive(t){
      if(!t||t.nodeType!==1) return false;
      return !!(t.closest&&t.closest('a,button,label,summary,input,textarea,select'));
    }
    doc.addEventListener('contextmenu',function(e){
      if(isInteractive(e.target)||isEditable(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
    },true);
    doc.addEventListener('dragstart',function(e){
      if(isEditable(e.target)) return;
      var tag=(e.target&&e.target.tagName||'').toLowerCase();
      if(tag==='img'||tag==='picture'||tag==='video'||tag==='canvas'||!isInteractive(e.target)){
        e.preventDefault();
        e.stopPropagation();
      }
    },true);
    doc.addEventListener('copy',function(e){ if(isEditable(e.target)) return; e.preventDefault(); },true);
    doc.addEventListener('cut',function(e){ if(isEditable(e.target)) return; e.preventDefault(); },true);
    doc.addEventListener('selectstart',function(e){ if(isEditable(e.target)||isInteractive(e.target)) return; e.preventDefault(); },true);
    doc.addEventListener('keydown',function(e){
      if(isEditable(e.target)) return;
      var k=(e.key||'').toLowerCase();
      var mod=e.ctrlKey||e.metaKey;
      if(mod&&(k==='c'||k==='x'||k==='s'||k==='u'||k==='p'||k==='a')){
        e.preventDefault();
        e.stopPropagation();
      }
    },true);
    function lockMedia(node){
      if(!node||node.nodeType!==1) return;
      var tag=node.tagName;
      if(tag==='IMG'||tag==='PICTURE'||tag==='VIDEO'||tag==='CANVAS'){
        try{node.setAttribute('draggable','false');}catch(_){}
      }
      if(node.querySelectorAll){
        node.querySelectorAll('img,picture,video,canvas').forEach(lockMedia);
      }
    }
    lockMedia(doc);
    var obs=new MutationObserver(function(muts){
      muts.forEach(function(m){
        m.addedNodes&&m.addedNodes.forEach(lockMedia);
      });
    });
    obs.observe(root,{childList:true,subtree:true});
    if(!doc.querySelector('.dp-protect-wm')){
      var wm=doc.createElement('div');
      wm.className='dp-protect-wm';
      wm.setAttribute('aria-hidden','true');
      wm.textContent=${JSON.stringify(WATERMARK)};
      (doc.body||root).appendChild(wm);
    }
  }catch(_){}
})();
</script>`;

export function injectProtectIntoHtml(html) {
    const src = String(html || '');
    if (!src.trim()) return src;
    if (/data-dp-protect/i.test(src)) return src;
    let out = src;
    if (/<\/head>/i.test(out)) {
        out = out.replace(/<\/head>/i, `${PROTECT_STYLE}</head>`);
    } else if (/<body\b/i.test(out)) {
        out = out.replace(/<body\b/i, `${PROTECT_STYLE}<body`);
    } else {
        out = `${PROTECT_STYLE}${out}`;
    }
    if (/<\/body>/i.test(out)) {
        out = out.replace(/<\/body>/i, `${PROTECT_SCRIPT}</body>`);
    } else if (/<\/html>/i.test(out)) {
        out = out.replace(/<\/html>/i, `${PROTECT_SCRIPT}</html>`);
    } else {
        out = `${out}${PROTECT_SCRIPT}`;
    }
    return out;
}

export function isSellerBrowser() {
    try {
        return /(?:^|;\s*)digitalizept_seller=1(?:;|$)/.test(document.cookie || '');
    } catch (_) {
        return false;
    }
}

function isEditable(t) {
    if (!t || t.nodeType !== 1) return false;
    const tag = (t.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
    if (t.isContentEditable) return true;
    return !!(t.closest && t.closest('input,textarea,select,[contenteditable="true"],[contenteditable=""]'));
}

function isInteractive(t) {
    if (!t || t.nodeType !== 1) return false;
    return !!(t.closest && t.closest('a,button,label,summary,input,textarea,select'));
}

function lockMedia(node) {
    if (!node || node.nodeType !== 1) return;
    const tag = node.tagName;
    if (tag === 'IMG' || tag === 'PICTURE' || tag === 'VIDEO' || tag === 'CANVAS') {
        try { node.setAttribute('draggable', 'false'); } catch (_) { /* ignore */ }
    }
    if (node.querySelectorAll) {
        node.querySelectorAll('img,picture,video,canvas').forEach(lockMedia);
    }
}

/** Install protect on the public shell (outside the iframe). */
export function installShellProtect(doc = document) {
    if (!doc || doc.documentElement.dataset.dpProtectShell === '1') return;
    doc.documentElement.dataset.dpProtectShell = '1';
    doc.documentElement.classList.add('dp-protect');
    if (doc.body) doc.body.classList.add('dp-protect');

    doc.addEventListener('contextmenu', (e) => {
        if (isInteractive(e.target) || isEditable(e.target)) return;
        e.preventDefault();
        e.stopPropagation();
    }, true);
    doc.addEventListener('dragstart', (e) => {
        if (isEditable(e.target)) return;
        const tag = (e.target && e.target.tagName || '').toLowerCase();
        if (tag === 'img' || tag === 'picture' || tag === 'video' || tag === 'canvas' || !isInteractive(e.target)) {
            e.preventDefault();
            e.stopPropagation();
        }
    }, true);
    doc.addEventListener('copy', (e) => { if (isEditable(e.target)) return; e.preventDefault(); }, true);
    doc.addEventListener('cut', (e) => { if (isEditable(e.target)) return; e.preventDefault(); }, true);
    doc.addEventListener('selectstart', (e) => {
        if (isEditable(e.target) || isInteractive(e.target)) return;
        e.preventDefault();
    }, true);
    doc.addEventListener('keydown', (e) => {
        if (isEditable(e.target)) return;
        const k = (e.key || '').toLowerCase();
        const mod = e.ctrlKey || e.metaKey;
        if (mod && ['c', 'x', 's', 'u', 'p', 'a'].includes(k)) {
            e.preventDefault();
            e.stopPropagation();
        }
    }, true);

    lockMedia(doc);
    const obs = new MutationObserver((muts) => {
        muts.forEach((m) => {
            m.addedNodes && m.addedNodes.forEach(lockMedia);
        });
    });
    obs.observe(doc.documentElement, { childList: true, subtree: true });

    if (!doc.querySelector('.dp-protect-wm')) {
        const wm = doc.createElement('div');
        wm.className = 'dp-protect-wm';
        wm.setAttribute('aria-hidden', 'true');
        wm.textContent = WATERMARK;
        (doc.body || doc.documentElement).appendChild(wm);
    }
}
