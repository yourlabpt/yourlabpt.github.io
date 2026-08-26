import { fetchSettings } from '../settings.js';
import { isDataStepValid } from './data-valid.js';
import { currentSubstep, renderAsk, askText, scheduleGoNext } from '../substep.js';
import { apiRequest } from '../api.js';
import { getToken } from '../auth.js';
import { isCustomDemo } from '../demo/seed.js';
import { appendAdminHint } from '../admin-redirects.js';

function getBusinessType(state) {
    return state.data.businessType || null;
}

function getDados(state) {
    if (!state.data.dados || typeof state.data.dados !== 'object') {
        state.data.dados = {};
    }
    return state.data.dados;
}

function isValid(state) {
    return isDataStepValid(state);
}

/** Live venda: Maps link + four public fields. Rest stays on Admin Ficha. */
const CORE_PAGES = [
    {
        id: '_maps',
        kind: 'maps',
        title: 'Tem o link do Google Maps?',
        hint: 'Cole o link — preenche nome, morada e telefone. Se não tiver, avance e escreva à mão.',
        required: false
    },
    {
        id: 'nome_negocio',
        title: 'Qual é o nome do negócio?',
        hint: 'O nome na montra ou no Google.',
        required: true
    },
    {
        id: 'morada',
        title: 'Qual é a morada?',
        hint: 'Rua e número.',
        required: true
    },
    {
        id: 'cidade',
        title: 'Em que cidade?',
        required: true
    },
    {
        id: 'telefone',
        title: 'Qual é o telefone do negócio?',
        hint: 'O número público. WhatsApp e o resto da ficha ficam no admin.',
        required: true
    }
];

function pagesFor(state, standardFields) {
    return CORE_PAGES.map((p) => ({
        ...p,
        def: (standardFields && standardFields[p.id]) || {
            label: p.id,
            tipo: p.id === 'telefone' ? 'telefone' : p.id === 'maps_url' || p.kind === 'maps' ? 'url' : 'texto'
        }
    }));
}

function substepCount(state) {
    return pagesFor(state, state.data._standardFields || null).length;
}

function isSubstepValid(state) {
    const pages = pagesFor(state, state.data._standardFields || null);
    const page = pages[currentSubstep(state)];
    if (!page) return isDataStepValid(state);
    if (page.kind === 'maps') return true;
    if (!page.required) return true;
    const dados = (state.data && state.data.dados) || {};
    return String(dados[page.id] || '').trim().length > 0;
}

const DEMO_DRIVER_FIELDS = new Set([
    'nome_negocio',
    'cidade',
    'o_que_faz',
    'principais_servicos',
    'diferencial'
]);

function clearDemoState(state) {
    delete state.data.demo;
    state.data.demoRaw = '';
    state.data.demoHtml = '';
    state.data.demoHtmlSource = '';
    state.data.demoHtmlCustom = '';
    state.data.demoVisual = '';
    state.data.demoSeeded = false;
    state.data.demoUrl = '';
    state.data.demoIdentityStamp = '';
    state.data._clearDemo = true;
}

export function invalidateDemoIfDriverField(state, fieldId) {
    if (!DEMO_DRIVER_FIELDS.has(fieldId)) return false;
    if (isCustomDemo(state)) return false;
    clearDemoState(state);
    return true;
}

function applyLookupToDados(dados, result) {
    const d = (result && result.dados) || {};
    [
        'nome_negocio', 'morada', 'cidade', 'telefone', 'whatsapp', 'email',
        'horario', 'maps_url', 'instagram', 'facebook', 'website_atual'
    ].forEach((key) => {
        const next = String(d[key] || '').trim();
        if (!next) return;
        if (!String(dados[key] || '').trim()) dados[key] = next;
    });
    if (d.maps_url) dados.maps_url = d.maps_url;
}

async function render(body, ctx) {
    const businessType = getBusinessType(ctx.state);
    if (!businessType) {
        const warn = document.createElement('div');
        warn.className = 'placeholder';
        warn.textContent = 'Escolha primeiro o tipo de negócio.';
        body.appendChild(warn);
        ctx.setValid(false);
        return;
    }

    let standardFields = ctx.state.data._standardFields;
    if (!standardFields) {
        const loading = document.createElement('div');
        loading.className = 'placeholder';
        loading.textContent = 'A preparar…';
        body.appendChild(loading);
        const settings = await fetchSettings(ctx);
        if (!settings) return;
        standardFields = settings.standardFields || {};
        ctx.update({ _standardFields: standardFields });
        loading.remove();
    }

    const dados = getDados(ctx.state);
    const pages = pagesFor(ctx.state, standardFields);
    const idx = Math.min(currentSubstep(ctx.state), pages.length - 1);
    const page = pages[idx];

    const { control } = renderAsk(body, {
        title: page.title,
        hint: page.hint,
        index: idx,
        total: pages.length
    });

    function persist() {
        ctx.update({ dados });
        ctx.setValid(isSubstepValid(ctx.state));
    }

    if (page.kind === 'maps') {
        const input = askText(control, {
            value: dados.maps_url || '',
            type: 'url',
            placeholder: 'https://maps.app.goo.gl/…',
            showNextButton: false,
            onChange: (val) => {
                dados.maps_url = val;
                persist();
            }
        });
        const actions = document.createElement('div');
        actions.className = 'demo-actions';
        const fillBtn = document.createElement('button');
        fillBtn.type = 'button';
        fillBtn.className = 'btn-primary';
        fillBtn.textContent = 'Preencher pelo link';
        fillBtn.addEventListener('click', async () => {
            const url = String(dados.maps_url || input.value || '').trim();
            if (!url) {
                ctx.showToast('Cole o link do Google Maps.', true);
                return;
            }
            fillBtn.disabled = true;
            try {
                const { response, data } = await apiRequest('/api/digitalizept/maps-lookup', {
                    method: 'POST',
                    token: getToken(),
                    body: { url, nome: dados.nome_negocio }
                });
                if (response.status === 401) {
                    ctx.onUnauthorized();
                    return;
                }
                if (!response.ok || !data.ok) {
                    ctx.showToast((data && data.error) || 'Não consegui ler o link.', true);
                    return;
                }
                applyLookupToDados(dados, data);
                if (data.businessTypeId && (!businessType.id || businessType.id === 'generico')) {
                    /* type already chosen on street; keep it */
                }
                if (Number.isFinite(data.lat) && Number.isFinite(data.lng)) {
                    ctx.state.data._mapsLat = data.lat;
                    ctx.state.data._mapsLng = data.lng;
                }
                persist();
                ctx.showToast('Dados do Maps aplicados.');
                scheduleGoNext(ctx.goNext);
            } catch (_) {
                ctx.showToast('Sem rede para ler o Maps.', true);
            } finally {
                fillBtn.disabled = false;
            }
        });
        const skipBtn = document.createElement('button');
        skipBtn.type = 'button';
        skipBtn.className = 'btn-secondary';
        skipBtn.textContent = 'Escrever à mão';
        skipBtn.addEventListener('click', () => {
            persist();
            if (ctx.goNext) ctx.goNext();
        });
        actions.append(fillBtn, skipBtn);
        control.appendChild(actions);
        appendAdminHint(control, 'ficha');
        persist();
        return;
    }

    askText(control, {
        value: dados[page.id] || '',
        type: page.id === 'telefone' ? 'tel' : 'text',
        placeholder: page.def && page.def.placeholder,
        onChange: (val) => {
            dados[page.id] = val;
            invalidateDemoIfDriverField(ctx.state, page.id);
            persist();
        },
        onEnter: () => {
            if (isSubstepValid(ctx.state) && ctx.goNext) ctx.goNext();
        },
        showNextButton: true,
        nextLabel: 'Seguinte'
    });
    if (page.id === 'telefone') appendAdminHint(control, 'ficha');
    ctx.setValid(isSubstepValid(ctx.state));
}

export const dataStep = {
    name: 'Dados do estabelecimento',
    title: 'Dados do estabelecimento',
    subtitle: 'Link do Maps ou nome, morada e telefone. O resto da ficha fica no admin.',
    isValid,
    isSubstepValid,
    substepCount,
    render
};
