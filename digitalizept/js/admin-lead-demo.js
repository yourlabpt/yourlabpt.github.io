import { renderIdentityEditors } from './demo/identity-editor.js';
import { renderGbpDemo, renderWebsiteDemo } from './steps/demo.js';

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
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

        const intro = el('p', 'dossier-demo-intro', 'Logo, paleta e fotos — sem passar pela venda. Publica a demo daqui; o email e o WhatsApp ficam no Controlo.');
        host.appendChild(intro);

        if (state.data.demoUrl) {
            const live = el('a', 'btn-secondary', 'Abrir demo publicada');
            live.href = state.data.demoUrl;
            live.target = '_blank';
            live.rel = 'noopener';
            host.appendChild(live);
        }

        const identityHost = el('div', 'dossier-demo-identity');
        host.appendChild(identityHost);
        renderIdentityEditors(identityHost, ctx);

        const gbp = el('div', 'dossier-demo-gbp');
        host.appendChild(gbp);
        renderGbpDemo(gbp, ctx);

        const site = el('div', 'dossier-demo-site');
        host.appendChild(site);
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
