import { fetchCatalog } from '../catalog.js';
import { buildContractModel, contractInnerHtml } from '../deal/contract.js';

function isValid(state) {
    return Boolean(state.data.assinatura && state.data.assinatura.pngDataUrl);
}

async function sha256Hex(str) {
    const buf = new TextEncoder().encode(str);
    const digest = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function getGeo() {
    return new Promise((resolve) => {
        if (!navigator.geolocation) return resolve('');
        let done = false;
        const finish = (v) => { if (!done) { done = true; resolve(v); } };
        const timer = setTimeout(() => finish(''), 4000);
        navigator.geolocation.getCurrentPosition(
            (p) => { clearTimeout(timer); finish(`${p.coords.latitude.toFixed(5)},${p.coords.longitude.toFixed(5)}`); },
            () => { clearTimeout(timer); finish(''); },
            { timeout: 4000, maximumAge: 60000 }
        );
    });
}

function buildPad(body, onSigned) {
    const wrap = document.createElement('div');
    wrap.className = 'sign-pad-wrap';

    const canvas = document.createElement('canvas');
    canvas.className = 'sign-pad';
    wrap.appendChild(canvas);
    body.appendChild(wrap);

    // size after in DOM
    const ctx2d = canvas.getContext('2d');
    function sizeCanvas() {
        const w = wrap.clientWidth || 320;
        canvas.width = w;
        canvas.height = 180;
        ctx2d.lineWidth = 2.5;
        ctx2d.lineCap = 'round';
        ctx2d.strokeStyle = '#111';
    }
    sizeCanvas();

    let drawing = false;
    let hasDrawn = false;
    function pos(e) {
        const r = canvas.getBoundingClientRect();
        const point = e.touches ? e.touches[0] : e;
        return { x: point.clientX - r.left, y: point.clientY - r.top };
    }
    function start(e) { drawing = true; const p = pos(e); ctx2d.beginPath(); ctx2d.moveTo(p.x, p.y); e.preventDefault(); }
    function move(e) { if (!drawing) return; const p = pos(e); ctx2d.lineTo(p.x, p.y); ctx2d.stroke(); hasDrawn = true; e.preventDefault(); }
    function end() { drawing = false; }

    canvas.addEventListener('pointerdown', start);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointerleave', end);

    const actions = document.createElement('div');
    actions.className = 'demo-actions';
    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'btn-secondary';
    clearBtn.textContent = 'Limpar';
    clearBtn.addEventListener('click', () => { ctx2d.clearRect(0, 0, canvas.width, canvas.height); hasDrawn = false; });

    const signBtn = document.createElement('button');
    signBtn.type = 'button';
    signBtn.className = 'btn-primary';
    signBtn.textContent = 'Assinar e finalizar';
    signBtn.addEventListener('click', () => {
        if (!hasDrawn) return;
        onSigned(canvas.toDataURL('image/png'));
    });

    actions.append(clearBtn, signBtn);
    body.appendChild(actions);
}

async function render(body, ctx) {
    let catalog = [];
    try { catalog = await fetchCatalog(ctx) || []; } catch (_) { /* ignore */ }

    const model = buildContractModel(ctx.state, catalog);

    const recap = document.createElement('div');
    recap.className = 'sign-recap';
    const total = (model.calc && model.calc.total) ? (model.calc.total / 100).toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' }) : '—';
    recap.innerHTML = `<strong>${model.cliente.nome || 'Cliente'}</strong> · Total ${total} · Entrada 50% na assinatura`;
    body.appendChild(recap);

    if (isValid(ctx.state)) {
        // Already signed — show the captured signature with a re-sign option.
        const box = document.createElement('div');
        box.className = 'sign-done';
        const img = document.createElement('img');
        img.src = ctx.state.data.assinatura.pngDataUrl;
        img.alt = 'Assinatura';
        img.className = 'sign-done-img';
        const done = document.createElement('div');
        done.className = 'demo-status demo-status-ok';
        done.textContent = 'Contrato assinado. Pode avançar para a conclusão.';
        const again = document.createElement('button');
        again.type = 'button';
        again.className = 'btn-secondary';
        again.textContent = 'Assinar de novo';
        again.addEventListener('click', () => {
            delete ctx.state.data.assinatura;
            ctx.update({ assinatura: undefined });
            ctx.setValid(false);
            body.innerHTML = '';
            render(body, ctx);
        });
        box.append(img, done, again);
        body.appendChild(box);
        ctx.setValid(true);
        return;
    }

    const note = document.createElement('p');
    note.className = 'id-disclaimer';
    note.textContent = 'Assine com o dedo. Registamos data, dispositivo e localização — é o que torna a assinatura eletrónica defensável.';
    body.appendChild(note);

    const status = document.createElement('div');
    status.className = 'demo-status';

    buildPad(body, async (pngDataUrl) => {
        status.className = 'demo-status';
        status.textContent = 'A registar assinatura…';
        const timestamp = new Date().toISOString();
        const dispositivo = (navigator.userAgent || '').slice(0, 240);
        const geo = await getGeo();
        const canonical = `${contractInnerHtml(model)}|${pngDataUrl}|${timestamp}|${model.cliente.nif}`;
        let hash = '';
        try { hash = await sha256Hex(canonical); } catch (_) { hash = ''; }

        ctx.state.data.assinatura = { pngDataUrl, timestamp, dispositivo, geo, hash };
        ctx.update({ assinatura: ctx.state.data.assinatura });
        ctx.setValid(true);
        status.className = 'demo-status demo-status-ok';
        status.textContent = 'Assinatura registada.';
        // re-render into the signed state
        body.innerHTML = '';
        render(body, ctx);
    });

    body.appendChild(status);
}

export const signatureStep = {
    name: 'Assinatura',
    title: 'Assinatura digital',
    subtitle: 'O cliente assina com o dedo. O contrato final é gerado com o registo da assinatura.',
    isValid,
    render
};
