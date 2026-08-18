import { fetchCatalog } from '../catalog.js';
import { fetchConfig } from '../settings.js';
import { refreshCalc } from '../proposal-calc.js';
import { buildContractModel, contractInnerHtml } from '../deal/contract.js';
import { downloadDealContract } from '../deal/download.js';

function isValid(state) {
    return Boolean(
        state.data.assinatura && state.data.assinatura.pngDataUrl
        && state.data.assinaturaPrestador && state.data.assinaturaPrestador.pngDataUrl
    );
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

function buildPad(body, { buttonLabel, onSigned }) {
    const wrap = document.createElement('div');
    wrap.className = 'sign-pad-wrap';

    const canvas = document.createElement('canvas');
    canvas.className = 'sign-pad';
    wrap.appendChild(canvas);
    body.appendChild(wrap);

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
    clearBtn.addEventListener('click', () => {
        ctx2d.clearRect(0, 0, canvas.width, canvas.height);
        hasDrawn = false;
    });

    const signBtn = document.createElement('button');
    signBtn.type = 'button';
    signBtn.className = 'btn-primary';
    signBtn.textContent = buttonLabel || 'Assinar';
    signBtn.addEventListener('click', () => {
        if (!hasDrawn) return;
        onSigned(canvas.toDataURL('image/png'));
    });

    actions.append(clearBtn, signBtn);
    body.appendChild(actions);
}

function showCaptured(parent, { title, png, onRedo }) {
    const box = document.createElement('div');
    box.className = 'sign-done';
    const heading = document.createElement('h3');
    heading.className = 'field-group-title';
    heading.textContent = title;
    const img = document.createElement('img');
    img.src = png;
    img.alt = title;
    img.className = 'sign-done-img';
    const again = document.createElement('button');
    again.type = 'button';
    again.className = 'btn-secondary';
    again.textContent = 'Assinar de novo';
    again.addEventListener('click', onRedo);
    box.append(heading, img, again);
    parent.appendChild(box);
}

async function stampHash(ctx, model) {
    const a = ctx.state.data.assinatura;
    const p = ctx.state.data.assinaturaPrestador;
    if (!a || !a.pngDataUrl || !p || !p.pngDataUrl) return;
    const canonical = `${contractInnerHtml(model)}|${a.pngDataUrl}|${p.pngDataUrl}|${a.timestamp}|${p.timestamp}|${model.cliente.nif}`;
    let hash = '';
    try { hash = await sha256Hex(canonical); } catch (_) { hash = ''; }
    a.hash = hash;
    p.hash = hash;
    ctx.update({ assinatura: a, assinaturaPrestador: p });
}

async function capture(ctx, model, role, pngDataUrl) {
    const timestamp = new Date().toISOString();
    const dispositivo = (navigator.userAgent || '').slice(0, 240);
    const geo = await getGeo();
    const payload = { pngDataUrl, timestamp, dispositivo, geo };
    if (role === 'prestador') {
        ctx.state.data.assinaturaPrestador = payload;
        ctx.update({ assinaturaPrestador: payload });
    } else {
        ctx.state.data.assinatura = payload;
        ctx.update({ assinatura: payload });
    }
    await stampHash(ctx, model);
}

async function render(body, ctx) {
    let catalog = [];
    let config = null;
    try {
        catalog = await fetchCatalog(ctx) || [];
        config = await fetchConfig(ctx);
    } catch (_) { /* ignore */ }

    const signed = isValid(ctx.state);
    if (config && !signed) {
        refreshCalc(ctx.state, catalog, ctx.state.data.businessType || {}, config.ivaRate);
        ctx.update({ proposta: ctx.state.data.proposta });
    }

    const model = buildContractModel(ctx.state, catalog, config);
    const providerName = (model.provider && (model.provider.responsavel || model.provider.nome)) || 'YourLab';

    const recap = document.createElement('div');
    recap.className = 'sign-recap';
    const c = model.calc || {};
    const total = c.totalComIva
        ? (c.totalComIva / 100).toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })
        : '—';
    const ivaLabel = c.iva > 0 ? ' c/ IVA' : '';
    recap.innerHTML = `<strong>${model.cliente.nome || 'Cliente'}</strong> · Total${ivaLabel} ${total} · Entrada 50% na assinatura`;
    body.appendChild(recap);

    const projectId = ctx.state.data.projectId || (ctx.state.data.dealResult && ctx.state.data.dealResult.projectId);
    if (projectId && projectId !== 'pendente') {
        const dl = document.createElement('button');
        dl.type = 'button';
        dl.className = 'btn-secondary';
        dl.style.width = '100%';
        dl.style.marginBottom = '14px';
        dl.textContent = 'Descarregar PDF do contrato';
        dl.addEventListener('click', async () => {
            const ok = await downloadDealContract({
                projectId,
                nome: ctx.state.data.dados && ctx.state.data.dados.nome_negocio,
                onUnauthorized: ctx.onUnauthorized
            });
            if (!ok) ctx.showToast('Contrato indisponível.', true);
        });
        body.appendChild(dl);
    }

    const clientPng = ctx.state.data.assinatura && ctx.state.data.assinatura.pngDataUrl;
    const providerPng = ctx.state.data.assinaturaPrestador && ctx.state.data.assinaturaPrestador.pngDataUrl;

    if (clientPng) {
        showCaptured(body, {
            title: `${model.cliente.nome || 'Cliente'} — Cliente`,
            png: clientPng,
            onRedo: () => {
                delete ctx.state.data.assinatura;
                ctx.update({ assinatura: undefined });
                ctx.setValid(false);
                body.innerHTML = '';
                render(body, ctx);
            }
        });
    } else {
        const note = document.createElement('p');
        note.className = 'id-disclaimer';
        note.textContent = 'Primeiro o cliente. Assine com o dedo. Registamos data, dispositivo e localização.';
        body.appendChild(note);
        const status = document.createElement('div');
        status.className = 'demo-status';
        buildPad(body, {
            buttonLabel: 'Assinar como cliente',
            onSigned: async (pngDataUrl) => {
                status.textContent = 'A registar assinatura do cliente…';
                await capture(ctx, model, 'cliente', pngDataUrl);
                body.innerHTML = '';
                render(body, ctx);
            }
        });
        body.appendChild(status);
        ctx.setValid(false);
        return;
    }

    if (providerPng) {
        showCaptured(body, {
            title: `${providerName} — Prestador`,
            png: providerPng,
            onRedo: () => {
                delete ctx.state.data.assinaturaPrestador;
                ctx.update({ assinaturaPrestador: undefined });
                ctx.setValid(false);
                body.innerHTML = '';
                render(body, ctx);
            }
        });
        const done = document.createElement('div');
        done.className = 'demo-status demo-status-ok';
        done.textContent = 'Ambas as partes assinaram. Pode avançar para a conclusão.';
        body.appendChild(done);
        ctx.setValid(true);
        return;
    }

    const note = document.createElement('p');
    note.className = 'id-disclaimer';
    note.textContent = `Agora assina ${providerName} (YourLab), no mesmo telemóvel.`;
    body.appendChild(note);
    const status = document.createElement('div');
    status.className = 'demo-status';
    buildPad(body, {
        buttonLabel: 'Assinar como YourLab',
        onSigned: async (pngDataUrl) => {
            status.textContent = 'A registar assinatura YourLab…';
            await capture(ctx, model, 'prestador', pngDataUrl);
            ctx.setValid(true);
            body.innerHTML = '';
            render(body, ctx);
        }
    });
    body.appendChild(status);
    ctx.setValid(false);
}

export const signatureStep = {
    name: 'Assinatura',
    title: 'Assinatura digital',
    subtitle: 'O cliente assina, depois a YourLab. O contrato fica com as duas assinaturas.',
    isValid,
    render
};
