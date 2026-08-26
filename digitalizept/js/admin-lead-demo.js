import { renderIdentityEditors } from './demo/identity-editor.js';
import { renderGbpDemo, renderWebsiteDemo } from './steps/demo.js';

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
}

function shopLabel(nome) {
    const n = String(nome || '').trim();
    if (!n) return '';
    return n.length > 32 ? `${n.slice(0, 30)}…` : n;
}

function abrirDemoLabel(nome) {
    const shop = shopLabel(nome);
    return shop ? `Ver demo · ${shop}` : 'Abrir demo publicada';
}

function wizardStateFromPayload(leadId, payload) {
    const data = payload && payload.data && typeof payload.data === 'object'
        ? payload.data
        : (payload || {});
    return {
        step: 3,
        substep: 0,
        data: {
            leadId,
            resumeBound: true,
            businessType: data.businessType || null,
            dados: data.dados && typeof data.dados === 'object' ? { ...data.dados } : {},
            identidade: data.identidade && typeof data.identidade === 'object' ? data.identidade : {},
            demo: data.demo || undefined,
            demoHtml: data.demoHtml || '',
            demoHtmlCustom: data.demoHtmlCustom || '',
            demoRaw: data.demoRaw || '',
            demoVisual: data.demoVisual || '',
            demoHtmlSource: data.demoHtmlSource || '',
            demoUrl: data.demoUrl || '',
            demoPrompt: data.demoPrompt || '',
            colorPrompt: data.colorPrompt || '',
            gbpSobre: data.gbpSobre || '',
            gbpSobrePrompt: data.gbpSobrePrompt || '',
            demoIdentityStamp: data.demoIdentityStamp || '',
            htmlChangeNote: data.htmlChangeNote || '',
            demoSeeded: data.demoSeeded === true,
            demoGbp: data.demoGbp === true
        }
    };
}

function makeCtx(state, { showToast, onUnauthorized, onPersistIdentidade }) {
    let saveTimer = 0;
    const ctx = {
        state,
        update(patch) {
            if (!patch || typeof patch !== 'object') return;
            Object.assign(state.data, patch);
            if (patch.identidade && typeof onPersistIdentidade === 'function') {
                clearTimeout(saveTimer);
                saveTimer = setTimeout(() => {
                    onPersistIdentidade(state.data.identidade).catch(() => {});
                }, 400);
            }
        },
        setValid() {},
        showToast,
        goNext() {},
        getDealEpoch: () => null,
        onUnauthorized
    };
    return ctx;
}

export function renderLeadDemo(host, {
    leadId, api, onToast, onUnauthorized
} = {}) {
    const toast = (msg, bad) => { if (onToast) onToast(msg, bad); };

    async function call(path, options) {
        const { response, data } = await api(path, options);
        if (!response.ok) {
            throw new Error((data && data.error) || 'Não foi possível concluir.');
        }
        return data;
    }

    async function saveIdentidade(identidade) {
        await call(
            `/api/digitalizept/leads/${encodeURIComponent(leadId)}/identidade`,
            { method: 'PUT', body: { identidade } }
        );
    }

    async function paint() {
        host.innerHTML = '';
        host.className = 'dossier-demo';
        host.appendChild(el('p', 'admin-hint', 'A carregar logo e fotos…'));
        let payload;
        try {
            payload = await call(`/api/digitalizept/leads/${encodeURIComponent(leadId)}/identidade`);
        } catch (err) {
            host.innerHTML = '';
            host.appendChild(el('p', 'admin-empty', (err && err.message) || 'Não foi possível carregar a demo.'));
            return;
        }

        const state = wizardStateFromPayload(leadId, payload);
        const ctx = makeCtx(state, {
            showToast: toast,
            onUnauthorized,
            onPersistIdentidade: saveIdentidade
        });

        host.innerHTML = '';
        host.className = 'dossier-demo';

        const shopNome = (state.data.dados && (state.data.dados.nome_negocio || state.data.dados.nome)) || '';

        const intro = el('p', 'dossier-demo-intro', 'Cada bloco é uma fase. Logo e fotos primeiro; o Google e o site vêm a seguir. Email e WhatsApp ficam no Controlo.');
        host.appendChild(intro);

        if (state.data.demoUrl) {
            const live = el('a', 'btn-demo-open dossier-demo-open', abrirDemoLabel(shopNome));
            live.href = state.data.demoUrl;
            live.target = '_blank';
            live.rel = 'noopener';
            live.title = state.data.demoUrl;
            host.appendChild(live);
        }

        const identityPhase = el('div', 'dossier-demo-phase');
        identityPhase.appendChild(el('p', 'dossier-demo-phase-label', 'Fase 1 · Identidade'));
        const identityHost = el('div', 'dossier-demo-identity');
        identityPhase.appendChild(identityHost);
        host.appendChild(identityPhase);
        renderIdentityEditors(identityHost, ctx);

        const gbpPhase = el('div', 'dossier-demo-phase');
        gbpPhase.appendChild(el('p', 'dossier-demo-phase-label', 'Fase 2 · Google Maps'));
        const gbp = el('div', 'dossier-demo-gbp');
        gbpPhase.appendChild(gbp);
        host.appendChild(gbpPhase);
        renderGbpDemo(gbp, ctx);

        const sitePhase = el('div', 'dossier-demo-phase');
        sitePhase.appendChild(el('p', 'dossier-demo-phase-label', 'Fase 3 · Website'));
        const site = el('div', 'dossier-demo-site');
        sitePhase.appendChild(site);
        host.appendChild(sitePhase);
        renderWebsiteDemo(site, ctx);
    }

    paint().catch((err) => {
        host.innerHTML = '';
        host.appendChild(el('p', 'admin-empty', (err && err.message) || 'Não foi possível carregar a demo.'));
    });

    return {
        refresh: () => paint().catch(() => {}),
        destroy() {}
    };
}
