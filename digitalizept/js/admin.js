import { apiRequest } from './api.js';
import { getToken, setToken, clearToken } from './auth.js';
import { formatEuros } from './format.js';
import { downloadDealContract } from './deal/download.js';
import { setupCoverage } from './admin-coverage.js';
import { renderMapsCockpit } from './admin-maps.js';
import { createLeadWebsiteZipButton, downloadStandaloneWebsiteZipFromLead } from './demo/site-zip.js';
import { fetchConfig } from './settings.js';
import { renderProviderEditor } from './provider-editor.js';
import { renderLeadDossier, dossierHash, leadIdFromHash, vistaFromHash } from './admin-lead.js';
import { renderLeadProcess } from './admin-lead-process.js';
import { renderQuickLeadForm } from './admin-quick-lead.js';
import {
    formatCallDue,
    formatCountdown
} from './demo/confirm-call.js';
import { confirmAndRefreshApp, registerDigitalizeptSw } from './pwa.js';

registerDigitalizeptSw();

const FASES = [
    { id: 'demonstracao_criada', label: 'Demonstração' },
    { id: 'proposta', label: 'Proposta' },
    { id: 'contrato_assinado', label: 'Contrato assinado' },
    { id: 'google_em_curso', label: 'Google em curso' },
    { id: 'site_no_ar', label: 'Site no ar' },
    { id: 'entregue', label: 'Entregue' },
    { id: 'arquivado', label: 'Arquivado' }
];

const GOOGLE_STATES = [
    { id: 'nao_incluido', label: 'Não incluído' },
    { id: 'nao_iniciado', label: 'Por iniciar' },
    { id: 'em_falta_dados', label: 'Dados em falta' },
    { id: 'em_curso', label: 'Em curso' },
    { id: 'a_aguardar_verificacao', label: 'A aguardar verificação' },
    { id: 'verificado', label: 'Verificado' },
    { id: 'falhou', label: 'Falhou' },
    // legacy values still selectable if stored
    { id: 'por_criar', label: 'Por criar (legado)' },
    { id: 'feito', label: 'Feito (legado)' }
];

const el = {
    loginOverlay: document.getElementById('login-overlay'),
    loginForm: document.getElementById('login-form'),
    loginError: document.getElementById('login-error'),
    keyInput: document.getElementById('key-input'),
    app: document.getElementById('app'),
    logoutBtn: document.getElementById('logout-btn'),
    catalogList: document.getElementById('catalog-list'),
    demosList: document.getElementById('leads-list'),
    dealsList: document.getElementById('deals-list'),
    catalogFilter: document.getElementById('catalog-filter'),
    demosFilter: document.getElementById('leads-filter'),
    leadsOrdem: document.getElementById('leads-ordem'),
    dealsFilter: document.getElementById('deals-filter'),
    catalogAddBtn: document.getElementById('catalog-add-btn'),
    leadsEmailDemosBtn: document.getElementById('leads-email-demos-btn'),
    coverageFilter: document.getElementById('coverage-filter'),
    coverageStats: document.getElementById('coverage-stats'),
    coverageLegend: document.getElementById('coverage-legend'),
    coverageMap: document.getElementById('coverage-map'),
    coverageStatus: document.getElementById('coverage-status'),
    coverageUnmapped: document.getElementById('coverage-unmapped'),
    coverageAddBtn: document.getElementById('coverage-add-btn'),
    coverageAddLeadBtn: document.getElementById('coverage-add-lead-btn'),
    leadsAddBtn: document.getElementById('leads-add-btn'),
    coveragePlaceBtn: document.getElementById('coverage-place-btn'),
    coverageExportBtn: document.getElementById('coverage-export-btn'),
    providerCard: document.getElementById('provider-card'),
    drawer: document.getElementById('drawer'),
    drawerPanel: document.getElementById('drawer-panel'),
    drawerBackdrop: document.getElementById('drawer-backdrop'),
    callQueue: document.getElementById('call-queue'),
    metricasRoot: document.getElementById('metricas-root')
};

let catalog = [];
let leads = [];
let deals = [];
let coverageUi = null;
let leadProcessUi = null;
let businessTypes = [];

function toast(message, isError = false, options = {}) {
    document.querySelectorAll('.toast').forEach((n) => n.remove());
    const node = document.createElement('div');
    node.className = `toast${isError ? ' error' : ''}`;
    const duration = Number(options.duration) > 0 ? Number(options.duration) : 2800;
    if (options.actionLabel && typeof options.onAction === 'function') {
        const text = document.createElement('span');
        text.textContent = message;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'toast-action';
        btn.textContent = options.actionLabel;
        btn.addEventListener('click', (event) => {
            event.preventDefault();
            node.remove();
            options.onAction();
        });
        node.append(text, btn);
    } else {
        node.textContent = message;
    }
    document.body.appendChild(node);
    setTimeout(() => {
        if (node.isConnected) node.remove();
    }, duration);
}

function showLogin(message = '') {
    el.loginOverlay.classList.remove('hidden');
    el.app.classList.add('hidden');
    el.loginError.textContent = message;
}

function showApp() {
    el.loginOverlay.classList.add('hidden');
    el.app.classList.remove('hidden');
}

function onUnauthorized() {
    clearToken();
    showLogin('Sessão expirada.');
}

async function api(path, options = {}) {
    const { response, data } = await apiRequest(path, { ...options, token: getToken() });
    if (response.status === 401) {
        onUnauthorized();
        throw new Error('unauthorized');
    }
    return { response, data };
}

function eurosFromCents(cents) {
    return formatEuros(Number(cents) || 0);
}

function closeDrawer() {
    el.drawer.classList.add('hidden');
    el.drawer.classList.remove('drawer-dock');
    el.drawer.setAttribute('aria-hidden', 'true');
    el.drawerPanel.innerHTML = '';
    document.body.classList.remove('coverage-dock-open');
    if (coverageUi && typeof coverageUi.onDrawerClosed === 'function') {
        coverageUi.onDrawerClosed();
    }
}

function openDrawer(title, build, options = {}) {
    const dock = options.dock === true;
    el.drawerPanel.innerHTML = '';
    el.drawer.classList.toggle('drawer-dock', dock);
    document.body.classList.toggle('coverage-dock-open', dock);

    const head = document.createElement('div');
    head.className = 'admin-drawer-head';
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'admin-drawer-back';
    back.setAttribute('aria-label', 'Fechar');
    back.title = 'Fechar';
    back.textContent = 'Fechar';
    back.addEventListener('click', () => closeDrawer());
    const h = document.createElement('h2');
    h.textContent = title;
    head.append(back, h);
    el.drawerPanel.appendChild(head);

    build(el.drawerPanel);
    el.drawer.classList.remove('hidden');
    el.drawer.setAttribute('aria-hidden', 'false');
    if (dock && coverageUi && typeof coverageUi.onDrawerDocked === 'function') {
        coverageUi.onDrawerDocked();
    }
}

function field(label, input) {
    const wrap = document.createElement('label');
    wrap.className = 'field';
    const span = document.createElement('span');
    span.className = 'field-label';
    span.textContent = label;
    wrap.append(span, input);
    return wrap;
}

function inputEl(type, value, attrs = {}) {
    const input = document.createElement(type === 'textarea' ? 'textarea' : 'input');
    input.className = 'field-input';
    if (type !== 'textarea') input.type = type;
    input.value = value == null ? '' : value;
    Object.entries(attrs).forEach(([k, v]) => input.setAttribute(k, v));
    return input;
}

function switchTab(name) {
    document.querySelectorAll('.admin-tab').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.tab === name);
    });
    ['catalog', 'leads', 'deals', 'coverage', 'dossier', 'metricas'].forEach((id) => {
        const panel = document.getElementById(`tab-${id}`);
        if (panel) panel.classList.toggle('hidden', id !== name);
    });
    if (name !== 'dossier' && leadIdFromHash(window.location.hash)) {
        history.replaceState(null, '', window.location.pathname + window.location.search);
    }
    if (name === 'coverage' && coverageUi) {
        coverageUi.ensure().catch((err) => {
            if (el.coverageStatus) {
                el.coverageStatus.textContent = err.message || 'Mapa indisponível.';
            }
        });
    }
    if (name === 'metricas') {
        loadMetricas().catch((err) => {
            if (!el.metricasRoot) return;
            el.metricasRoot.replaceChildren();
            const p = document.createElement('p');
            p.className = 'admin-empty';
            p.textContent = err.message || 'Não foi possível carregar as métricas.';
            el.metricasRoot.appendChild(p);
        });
    }
}

function fmtPct(n) {
    return `${(Number(n) || 0).toFixed(1).replace(/\.0$/, '')}%`;
}

function metricCell(label, value, hint) {
    const node = document.createElement('div');
    node.className = 'metric-card';
    const k = document.createElement('p');
    k.className = 'metric-k';
    k.textContent = label;
    const v = document.createElement('p');
    v.className = 'metric-v';
    v.textContent = value;
    node.append(k, v);
    if (hint) {
        const h = document.createElement('p');
        h.className = 'meta';
        h.textContent = hint;
        node.appendChild(h);
    }
    return node;
}

function metricTable(titulo, rows) {
    const wrap = document.createElement('section');
    wrap.className = 'metric-bloco';
    const h = document.createElement('h4');
    h.textContent = titulo;
    wrap.appendChild(h);
    if (!rows.length) {
        const empty = document.createElement('p');
        empty.className = 'meta';
        empty.textContent = 'Ainda não há dados neste corte.';
        wrap.appendChild(empty);
        return wrap;
    }
    const scroller = document.createElement('div');
    scroller.className = 'metric-table-wrap';
    const table = document.createElement('table');
    table.className = 'metric-table';
    const head = document.createElement('thead');
    const headRow = document.createElement('tr');
    ['', 'Leads', 'Sinal', 'Resposta', 'Visitas / resp.', 'Fechos / visita', 'Ciclo D', 'Revisitas'].forEach((label) => {
        const th = document.createElement('th');
        th.textContent = label;
        headRow.appendChild(th);
    });
    head.appendChild(headRow);
    table.appendChild(head);
    const body = document.createElement('tbody');
    rows.forEach((row) => {
        const tr = document.createElement('tr');
        const cells = [
            row.label,
            String(row.leads),
            fmtPct(row.sinalPct),
            fmtPct(row.respostaPct),
            String(row.visitasPorResposta),
            String(row.fechosPorVisita),
            fmtPct(row.canalDiretoPct),
            fmtPct(row.revisitasReabremPct)
        ];
        cells.forEach((cell, i) => {
            const td = document.createElement(i === 0 ? 'th' : 'td');
            td.textContent = cell;
            tr.appendChild(td);
        });
        body.appendChild(tr);
    });
    table.appendChild(body);
    scroller.appendChild(table);
    wrap.appendChild(scroller);
    return wrap;
}

function categoriaNome(id) {
    const hit = businessTypes.find((t) => t.id === id);
    return (hit && hit.nome) || id || '—';
}

function mapToRows(obj, labelOf) {
    return Object.entries(obj || {})
        .map(([id, b]) => ({ label: labelOf ? labelOf(id) : id, ...b }))
        .sort((a, b) => b.leads - a.leads);
}

async function loadMetricas() {
    if (!el.metricasRoot) return;
    el.metricasRoot.replaceChildren();
    const loading = document.createElement('p');
    loading.className = 'admin-hint';
    loading.textContent = 'A carregar…';
    el.metricasRoot.appendChild(loading);
    const { response, data } = await api('/api/digitalizept/process/metricas');
    if (!response.ok) {
        throw new Error((data && data.error) || 'Não foi possível carregar as métricas.');
    }
    const geral = data.geral || {};
    const origem = data.porOrigem || {};
    const nomes = (data.nomes && data.nomes.ganchos) || {};
    const host = el.metricasRoot;
    host.replaceChildren();

    (data.diagnostico || []).forEach((item) => {
        const box = document.createElement('p');
        box.className = item.id === 'ok' || item.id === 'ainda_cedo' ? 'metric-diagnostico' : 'metric-alerta';
        box.textContent = item.texto;
        host.appendChild(box);
    });

    const grelha = document.createElement('div');
    grelha.className = 'metric-grelha';
    grelha.append(
        metricCell('% com sinal', fmtPct(geral.sinalPct), `${geral.comSinal || 0} de ${geral.leads || 0} leads`),
        metricCell('% resposta no WA1', fmtPct(geral.respostaPct), `${geral.respostas || 0} respostas em ${geral.wa1 || 0} envios`),
        metricCell('Visitas por resposta', String(geral.visitasPorResposta || 0), `${geral.visitas || 0} visitas`),
        metricCell('Fechos por visita', String(geral.fechosPorVisita || 0), `${geral.fechos || 0} ganhos`),
        metricCell('Ciclo D → canal direto', fmtPct(geral.canalDiretoPct), `${geral.canalDireto || 0} de ${geral.chamadasDescobertaAtendidas || 0} atendidas`),
        metricCell('Revisitas que reabrem', fmtPct(geral.revisitasReabremPct), `${geral.revisitasReabrem || 0} de ${geral.revisitas || 0}`)
    );
    host.appendChild(grelha);

    const origens = document.createElement('section');
    origens.className = 'metric-bloco';
    const origTitle = document.createElement('h4');
    origTitle.textContent = 'De onde vem o sinal';
    origens.appendChild(origTitle);
    const origHint = document.createElement('p');
    origHint.className = 'meta';
    origHint.textContent = 'Primeiro sinal de cada lead — não é o número de vezes que a demo abriu.';
    origens.appendChild(origHint);
    const origGrelha = document.createElement('div');
    origGrelha.className = 'metric-grelha';
    origGrelha.append(
        metricCell('Respondeu', String(origem.respondeu || 0), 'saúde da abertura'),
        metricCell('Atendeu a chamada', String(origem.chamada_atendida || 0), 'saúde da ligação'),
        metricCell('Abriu a demo', String(origem.visitou_demo || 0), 'primeiro sinal = a página'),
        metricCell('Sem sinal', String(origem.nenhum || 0), 'ainda no escuro')
    );
    origens.appendChild(origGrelha);
    host.appendChild(origens);

    const demo = data.demo || {};
    const demoBloco = document.createElement('section');
    demoBloco.className = 'metric-bloco';
    const demoTitle = document.createElement('h4');
    demoTitle.textContent = 'Demo — o cliente abriu';
    demoBloco.appendChild(demoTitle);
    const demoHint = document.createElement('p');
    demoHint.className = 'meta';
    demoHint.textContent = 'Sessões depois do email ou WhatsApp. O teu browser no admin não conta. Refresh na mesma hora = uma abertura.';
    demoBloco.appendChild(demoHint);
    const demoGrelha = document.createElement('div');
    demoGrelha.className = 'metric-grelha';
    demoGrelha.append(
        metricCell('Leads que abriram', String(demo.abriram || 0), `de ${demo.enviou || 0} enviados`),
        metricCell('Aberturas', String(demo.aberturas || 0), 'sessões do cliente'),
        metricCell('Enviou e ninguém abriu', String(demo.semAbertura || 0), 'já saiu o email ou o WA'),
        metricCell('Taxa', fmtPct(demo.taxa), 'abriu / enviou'),
        metricCell('Média', String(demo.media || 0), 'aberturas por lead que abriu')
    );
    demoBloco.appendChild(demoGrelha);
    host.appendChild(demoBloco);

    const ganchoLabel = (id) => {
        if (id === 'sem gancho') return 'Sem gancho';
        return nomes[id] ? `${id} · ${nomes[id]}` : id;
    };
    const vendedores = mapToRows(data.porVendedor);
    const ganchos = mapToRows(data.porGancho, ganchoLabel);
    host.append(
        metricTable('Por categoria', mapToRows(data.porCategoria, categoriaNome)),
        metricTable('Por zona', mapToRows(data.porZona))
    );
    if (vendedores.length) host.appendChild(metricTable('Por vendedor', vendedores));
    if (ganchos.length) host.appendChild(metricTable('Por gancho', ganchos));
}

function estadoLabel(estado) {
    if (estado === 'rascunho') return 'Rascunho';
    if (estado === 'demonstracao') return 'Com demo';
    if (estado === 'fechado') return 'Fechado';
    return estado || '—';
}

function isParked(item) {
    return Boolean(item && (item.resultado === 'sem_interesse' || item.followupUnsubscribed));
}

const LEADS_ORDEM_KEY = 'digitalizept_leads_ordem';
const LEADS_ORDEM = ['proximo', 'tipo', 'criado'];

function storedLeadsOrdem() {
    try {
        const v = localStorage.getItem(LEADS_ORDEM_KEY) || '';
        return LEADS_ORDEM.includes(v) ? v : 'proximo';
    } catch (_) {
        return 'proximo';
    }
}

function leadsOrdem() {
    const fromUi = el.leadsOrdem && el.leadsOrdem.value;
    return LEADS_ORDEM.includes(fromUi) ? fromUi : storedLeadsOrdem();
}

function syncLeadsOrdemControl() {
    if (!el.leadsOrdem) return;
    el.leadsOrdem.value = storedLeadsOrdem();
}

function activeFirst(items) {
    return [...items].sort((a, b) => Number(isParked(a)) - Number(isParked(b)));
}

async function setLeadParked(leadId, parked) {
    const { response, data } = await api(`/api/digitalizept/leads/${encodeURIComponent(leadId)}`, {
        method: 'PATCH',
        body: { resultado: parked ? 'sem_interesse' : '' }
    });
    if (!response.ok) {
        toast((data && data.error) || 'Não foi possível actualizar.', true);
        return false;
    }
    return true;
}

function parkButton(item, { leadId, onDone, className = 'btn-secondary' }) {
    const id = leadId || item.leadId || item.id;
    const parked = isParked(item);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = className;
    btn.textContent = parked ? 'Repor' : 'Sem interesse';
    btn.addEventListener('click', async () => {
        if (!id) return;
        if (!parked) {
            toast('Encerra no Controlo da lead: Como ficou — o que foi o não, a data, e a mensagem.');
            openLeadDossier(id);
            return;
        }
        btn.disabled = true;
        const ok = await setLeadParked(id, false);
        btn.disabled = false;
        if (ok) {
            toast('Voltou à lista activa.');
            if (typeof onDone === 'function') await onDone();
        }
    });
    return btn;
}

function renderCatalog() {
    const q = (el.catalogFilter.value || '').trim().toLowerCase();
    const items = catalog.filter((s) => {
        if (!q) return true;
        return `${s.codigo} ${s.nome} ${s.descricao_cliente}`.toLowerCase().includes(q);
    });
    el.catalogList.innerHTML = '';
    if (!items.length) {
        el.catalogList.innerHTML = '<p class="admin-empty">Nenhum serviço.</p>';
        return;
    }
    items.forEach((s) => {
        const card = document.createElement('article');
        card.className = `admin-card${s.ativo ? '' : ' inactive'}`;
        card.innerHTML = `
            <h3>${s.nome}</h3>
            <p class="meta">${s.codigo} · ${s.tipo}${s.ativo ? '' : ' · inativo'}</p>
            <p>${s.descricao_cliente || 'Sem descrição.'}</p>
            <p class="admin-price">${s.percentual ? `+${Math.round(s.percentual * 100)}%` : eurosFromCents(s.preco_centimos)}</p>
        `;
        const actions = document.createElement('div');
        actions.className = 'actions';
        const edit = document.createElement('button');
        edit.type = 'button';
        edit.className = 'btn-secondary';
        edit.textContent = 'Editar';
        edit.addEventListener('click', () => openServiceEditor(s));
        actions.appendChild(edit);

        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'btn-danger';
        del.textContent = 'Apagar';
        del.addEventListener('click', async () => {
            if (!window.confirm(`Apagar "${s.nome}" (${s.codigo})? Esta ação é irreversível.`)) return;
            try {
                const { response, data } = await api(`/api/digitalizept/catalog/${encodeURIComponent(s.codigo)}`, {
                    method: 'DELETE'
                });
                if (!response.ok) {
                    toast(data.error || 'Não foi possível apagar.', true);
                    return;
                }
                toast('Serviço apagado.');
                await loadCatalog();
            } catch (_) {
                toast('Erro de rede.', true);
            }
        });
        actions.appendChild(del);

        card.appendChild(actions);
        el.catalogList.appendChild(card);
    });
}

function openServiceEditor(servico) {
    const isNew = !servico;
    openDrawer(isNew ? 'Novo serviço' : 'Editar serviço', (panel) => {
        const form = document.createElement('form');
        form.className = 'admin-form';
        const codigo = inputEl('text', servico?.codigo || '', { required: 'true', ...(isNew ? {} : { readonly: 'true' }) });
        const nome = inputEl('text', servico?.nome || '', { required: 'true' });
        const desc = inputEl('textarea', servico?.descricao_cliente || '');
        const precoEuros = inputEl('number', servico ? ((servico.preco_centimos || 0) / 100).toFixed(2) : '0', {
            step: '0.01', min: '0'
        });
        const percentual = inputEl('number', servico?.percentual != null ? servico.percentual : '', {
            step: '0.01', min: '0', placeholder: 'ex. 0.30'
        });
        const tipo = document.createElement('select');
        tipo.className = 'field-input';
        ['pacote', 'extra', 'ajuste', 'manutencao'].forEach((t) => {
            const opt = document.createElement('option');
            opt.value = t;
            opt.textContent = t;
            if ((servico?.tipo || 'extra') === t) opt.selected = true;
            tipo.appendChild(opt);
        });
        const ordem = inputEl('number', servico?.ordem ?? 100, { step: '1' });
        const ativo = document.createElement('select');
        ativo.className = 'field-input';
        [['1', 'Ativo'], ['0', 'Inativo']].forEach(([v, label]) => {
            const opt = document.createElement('option');
            opt.value = v;
            opt.textContent = label;
            if (String(servico?.ativo ?? 1) === v) opt.selected = true;
            ativo.appendChild(opt);
        });

        form.append(
            field('Código', codigo),
            field('Nome', nome),
            field('Explicação (cliente)', desc),
            field('Preço (€)', precoEuros),
            field('Percentual (ajustes)', percentual),
            field('Tipo', tipo),
            field('Ordem', ordem),
            field('Estado', ativo)
        );

        const save = document.createElement('button');
        save.type = 'submit';
        save.className = 'btn-primary';
        save.style.width = '100%';
        save.textContent = 'Guardar';
        form.appendChild(save);

        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            const body = {
                nome: nome.value.trim(),
                descricao_cliente: desc.value.trim(),
                preco_centimos: Math.round(Number(precoEuros.value || 0) * 100),
                percentual: percentual.value === '' ? null : Number(percentual.value),
                tipo: tipo.value,
                ordem: Number(ordem.value) || 0,
                ativo: ativo.value === '1'
            };
            try {
                let response;
                let data;
                if (isNew) {
                    ({ response, data } = await api('/api/digitalizept/catalog', {
                        method: 'POST',
                        body: { ...body, codigo: codigo.value.trim() }
                    }));
                } else {
                    ({ response, data } = await api(`/api/digitalizept/catalog/${encodeURIComponent(servico.codigo)}`, {
                        method: 'PATCH',
                        body
                    }));
                }
                if (!response.ok) {
                    toast(data.error || 'Falha ao guardar.', true);
                    return;
                }
                toast('Catálogo atualizado.');
                closeDrawer();
                await loadCatalog();
            } catch (_) {
                toast('Erro de rede.', true);
            }
        });

        panel.appendChild(form);
    });
}

function leadMapPinHtml(lead) {
    const fill = (lead && lead.color) || '#faf8f4';
    const stroke = (lead && lead.strokeColor) || '#8e8a84';
    const faded = lead && lead.faded ? ' is-faded' : '';
    return `<span class="lead-map-pin${faded}" style="--pin-fill:${fill};--pin-stroke:${stroke}" aria-hidden="true"></span>`;
}

function processoMetaHtml(lead) {
    const estado = lead.processoEstadoLabel || '';
    const when = lead.proximaAcaoEm;
    if (!estado && !when) return '';
    let count = '';
    if (when) {
        const remaining = new Date(when).getTime() - Date.now();
        count = remaining > 0
            ? ` · próxima em ${formatCountdown(remaining)}`
            : ' · ação disponível';
    }
    return `<p class="meta">${estado}${count}${when ? ` · ${formatCallDue(when)}` : ''}</p>`;
}

function addControloLeadButton(actions, leadId, { primary = true } = {}) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = primary ? 'btn-primary' : 'btn-secondary';
    btn.textContent = 'Controlo da lead';
    btn.addEventListener('click', () => openLeadDossier(leadId));
    actions.appendChild(btn);
    return btn;
}

function renderDemos() {
    const q = (el.demosFilter.value || '').trim().toLowerCase();
    const filtered = leads.filter((l) => l.estado !== 'fechado').filter((l) => {
        if (!q) return true;
        return `${l.nome} ${l.business_type} ${l.demo_slug || ''} ${l.morada || ''} ${l.estado || ''} ${l.processoEstado || ''} ${l.processoEstadoLabel || ''}`
            .toLowerCase()
            .includes(q);
    });
    const items = leadsOrdem() === 'proximo' ? activeFirst(filtered) : filtered;
    el.demosList.innerHTML = '';
    if (!items.length) {
        el.demosList.innerHTML = '<p class="admin-empty">Sem leads em aberto.</p>';
        return;
    }
    items.forEach((l) => {
        const card = document.createElement('article');
        const parked = isParked(l);
        card.className = parked ? 'admin-card parked' : 'admin-card';
        card.innerHTML = `
            <h3>${leadMapPinHtml(l)}${l.nome || 'Sem nome'}</h3>
            <p class="meta">${l.business_type || '—'} · ${estadoLabel(l.estado)} · ${new Date(l.criado_em).toLocaleDateString('pt-PT')}</p>
            <p class="meta">${l.morada || '—'}${l.telefone ? ` · ${l.telefone}` : ''}</p>
            ${l.demo_slug ? `<p class="meta">Demo: /${l.demo_slug}</p>` : ''}
            ${processoMetaHtml(l)}
            ${parked ? '<p class="meta">Sem interesse</p>' : ''}
            ${Number(l.fichaMissing) > 0 ? `<p class="meta">Ficha: ${l.fichaMissing} campo(s) em falta</p>` : '<p class="meta">Ficha: mínimo de contacto ok</p>'}
        `;
        const actions = document.createElement('div');
        actions.className = 'actions';

        const resume = document.createElement('a');
        resume.className = 'btn-secondary';
        resume.href = `./?resume=${encodeURIComponent(l.id)}`;
        resume.textContent = 'Continuar venda';
        actions.appendChild(resume);

        addControloLeadButton(actions, l.id);

        if (l.demo_slug) {
            const open = document.createElement('a');
            open.className = 'btn-secondary';
            open.href = `/d/${l.demo_slug}`;
            open.target = '_blank';
            open.rel = 'noopener';
            open.textContent = 'Abrir demo';
            actions.appendChild(open);
        }

        if (l.id) {
            actions.appendChild(createLeadWebsiteZipButton({
                api,
                leadId: l.id,
                toast,
                className: 'btn-secondary',
                label: 'Descarregar website (ZIP)'
            }));
        }

        const mapBtn = document.createElement('button');
        mapBtn.type = 'button';
        mapBtn.className = 'btn-secondary';
        mapBtn.textContent = 'Mapa / visita';
        mapBtn.addEventListener('click', () => jumpToLeadMap(l.id));
        actions.appendChild(mapBtn);

        const notes = document.createElement('button');
        notes.type = 'button';
        notes.className = 'btn-secondary';
        notes.textContent = 'Comentários';
        notes.addEventListener('click', () => openNotes(l));
        actions.appendChild(notes);

        if (l.resultado !== 'digitalizado') {
            actions.appendChild(parkButton(l, {
                leadId: l.id,
                onDone: async () => {
                    await Promise.all([loadLeads(), loadDeals()]);
                    if (coverageUi && typeof coverageUi.refresh === 'function') {
                        coverageUi.refresh().catch(() => {});
                    }
                }
            }));
        }

        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'btn-danger';
        del.textContent = 'Apagar';
        del.addEventListener('click', async () => {
            if (!window.confirm(`Apagar o lead "${l.nome || 'sem nome'}"? Esta ação é irreversível.`)) return;
            try {
                const { response, data } = await api(`/api/digitalizept/leads/${encodeURIComponent(l.id)}`, {
                    method: 'DELETE'
                });
                if (!response.ok) {
                    toast(data.error || 'Não foi possível apagar.', true);
                    return;
                }
                toast('Lead apagado.');
                await loadLeads();
            } catch (_) {
                toast('Erro de rede.', true);
            }
        });
        actions.appendChild(del);

        card.appendChild(actions);
        el.demosList.appendChild(card);
    });
}

function packageLabel(itensJson) {
    try {
        const itens = typeof itensJson === 'string' ? JSON.parse(itensJson) : itensJson;
        return itens?.pacote || '—';
    } catch (_) {
        return '—';
    }
}

function renderDeals() {
    const q = (el.dealsFilter.value || '').trim().toLowerCase();
    const items = activeFirst(deals.filter((d) => {
        if (!q) return true;
        return `${d.nome} ${d.cliente_nome} ${d.estado} ${d.business_type}`.toLowerCase().includes(q);
    }));
    el.dealsList.innerHTML = '';
    if (!items.length) {
        el.dealsList.innerHTML = '<p class="admin-empty">Sem propostas fechadas.</p>';
        return;
    }
    items.forEach((d) => {
        const card = document.createElement('article');
        const parked = isParked(d);
        card.className = parked ? 'admin-card parked' : 'admin-card';
        const fase = FASES.find((f) => f.id === d.estado)?.label || d.estado;
        const googleLabel = d.estado_google_label
            || GOOGLE_STATES.find((f) => f.id === d.estado_google)?.label
            || d.estado_google
            || '—';
        card.innerHTML = `
            <h3>${d.nome || d.cliente_nome || 'Negócio'}</h3>
            <p class="meta">${d.cliente_nome || ''} · ${packageLabel(d.itens_json)} · ${eurosFromCents(d.total_com_iva_centimos)} · ${d.template_versao || 'v1'}</p>
            <p class="meta">Fase: ${fase} · Google: ${googleLabel} · ${new Date(d.criado_em).toLocaleDateString('pt-PT')}</p>
            ${parked ? '<p class="meta">Sem interesse</p>' : ''}
        `;
        const actions = document.createElement('div');
        actions.className = 'actions';
        if (d.hasGoogle) {
            const mapsBtn = document.createElement('button');
            mapsBtn.type = 'button';
            mapsBtn.className = 'btn-primary';
            mapsBtn.textContent = 'Presença Maps';
            mapsBtn.addEventListener('click', () => openMapsDelivery(d));
            actions.appendChild(mapsBtn);
        }
        if (d.leadId) {
            const revise = document.createElement('a');
            revise.className = d.hasGoogle ? 'btn-secondary' : 'btn-primary';
            revise.href = `./?resume=${encodeURIComponent(d.leadId)}`;
            revise.textContent = 'Editar proposta';
            actions.appendChild(revise);
        }
        if (d.demo_slug) {
            const demo = document.createElement('a');
            demo.className = 'btn-secondary';
            demo.href = `/d/${d.demo_slug}`;
            demo.target = '_blank';
            demo.rel = 'noopener';
            demo.textContent = 'Demo';
            actions.appendChild(demo);

            if (d.leadId) {
                addControloLeadButton(actions, d.leadId);
            }
        }
        if (d.leadId) {
            actions.appendChild(createLeadWebsiteZipButton({
                api,
                leadId: d.leadId,
                toast,
                className: 'btn-secondary',
                label: 'Descarregar website (ZIP)'
            }));
        }
        const contract = document.createElement('button');
        contract.type = 'button';
        contract.className = 'btn-secondary';
        contract.textContent = 'Descarregar PDF';
        contract.addEventListener('click', async () => {
            const ok = await downloadDealContract({
                projectId: d.projectId,
                nome: d.nome || d.cliente_nome,
                onUnauthorized
            });
            if (!ok) toast('Contrato indisponível.', true);
        });
        const edit = document.createElement('button');
        edit.type = 'button';
        edit.className = 'btn-secondary';
        edit.textContent = 'Fase / notas';
        edit.addEventListener('click', () => openDealEditor(d));

        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'btn-danger';
        del.textContent = 'Apagar';
        del.addEventListener('click', async () => {
            if (!window.confirm(`Apagar a proposta de "${d.nome || d.cliente_nome || 'negócio'}"? Contrato e assinaturas serão eliminados. Esta ação é irreversível.`)) return;
            try {
                const { response, data } = await api(`/api/digitalizept/deals/${encodeURIComponent(d.projectId)}`, {
                    method: 'DELETE'
                });
                if (!response.ok) {
                    toast(data.error || 'Não foi possível apagar.', true);
                    return;
                }
                toast('Proposta apagada.');
                await loadDeals();
            } catch (_) {
                toast('Erro de rede.', true);
            }
        });

        if (d.leadId) {
            const mapBtn = document.createElement('button');
            mapBtn.type = 'button';
            mapBtn.className = 'btn-secondary';
            mapBtn.textContent = 'Mapa / visita';
            mapBtn.addEventListener('click', () => jumpToLeadMap(d.leadId));
            actions.appendChild(mapBtn);
            if (d.resultado !== 'digitalizado') {
                actions.appendChild(parkButton(d, {
                    leadId: d.leadId,
                    onDone: async () => {
                        await Promise.all([loadLeads(), loadDeals()]);
                        if (coverageUi && typeof coverageUi.refresh === 'function') {
                            coverageUi.refresh().catch(() => {});
                        }
                    }
                }));
            }
        }

        actions.append(contract, edit, del);
        card.appendChild(actions);
        el.dealsList.appendChild(card);
    });
}

async function loadBusinessTypes() {
    if (businessTypes.length) return businessTypes;
    const { response, data } = await api('/api/digitalizept/business-types');
    if (response.ok) {
        businessTypes = (data.businessTypes || []).map((t) => ({ id: t.id, nome: t.nome || t.id }));
    }
    return businessTypes;
}

async function openQuickLead() {
    const types = await loadBusinessTypes();
    openDrawer('Novo negócio', (panel) => {
        renderQuickLeadForm(panel, {
            types,
            api,
            toast,
            field,
            inputEl,
            async onCreated() {
                await loadLeads();
            }
        });
    });
}

async function openLeadDossier(leadId) {
    if (!leadId) {
        toast('Lead em falta.', true);
        return;
    }
    closeDrawer();
    switchTab('dossier');
    const root = document.getElementById('dossier-root');
    if (!root) return;
    root.innerHTML = '<p class="admin-hint">A carregar ficha…</p>';
    history.replaceState(null, '', dossierHash(leadId, vistaFromHash(window.location.hash)));
    try {
        const { response, data } = await api(`/api/digitalizept/leads/${encodeURIComponent(leadId)}/dossier`);
        if (!response.ok) {
            root.innerHTML = `<p class="admin-empty">${(data && data.error) || 'Não foi possível carregar a ficha.'}</p>`;
            return;
        }
        const handlers = {};
        handlers.onToast = toast;
        handlers.mountProcess = (node, id, slots = {}) => {
            if (leadProcessUi && typeof leadProcessUi.destroy === 'function') leadProcessUi.destroy();
            leadProcessUi = renderLeadProcess(node, {
                leadId: id,
                api,
                onToast: toast,
                statusHost: slots.statusHost,
                onChanged: () => { loadLeads().catch(() => {}); }
            });
        };
        handlers.initialVista = vistaFromHash(window.location.hash);
        handlers.onBack = () => {
            history.replaceState(null, '', window.location.pathname + window.location.search);
            switchTab('leads');
        };
        handlers.onSave = async (body, extra) => {
            const saved = await api(`/api/digitalizept/leads/${encodeURIComponent(leadId)}/dossier`, {
                method: 'PUT',
                body
            });
            if (!saved.response.ok) {
                toast((saved.data && saved.data.error) || 'Não foi possível guardar.', true);
                throw new Error((saved.data && saved.data.error) || 'save');
            }
            toast('Ficha guardada.');
            handlers.initialVista = (extra && extra.vista) || 'ficha';
            renderLeadDossier(root, saved.data, handlers);
            loadLeads().catch(() => {});
        };
        handlers.onMapsLookup = async (url) => {
            const looked = await api('/api/digitalizept/maps-lookup', {
                method: 'POST',
                body: { url }
            });
            if (!looked.response.ok) {
                throw new Error((looked.data && looked.data.error) || 'Não consegui ler o link.');
            }
            return looked.data;
        };
        handlers.onWebsiteZip = async (id, btn) => {
            if (btn) btn.disabled = true;
            try {
                const folder = await downloadStandaloneWebsiteZipFromLead(id, { api });
                toast(`Website descarregado (${folder}.zip).`);
            } catch (err) {
                toast((err && err.message) || 'Não foi possível criar o ZIP.', true);
            } finally {
                if (btn) btn.disabled = false;
            }
        };
        renderLeadDossier(root, data, handlers);
    } catch (_) {
        root.innerHTML = '<p class="admin-empty">Erro de rede.</p>';
    }
}

async function jumpToLeadMap(leadId) {
    if (!leadId || !coverageUi) {
        toast('Mapa indisponível.', true);
        return;
    }
    switchTab('coverage');
    try {
        const focused = await coverageUi.focusLead(leadId);
        if (focused) return;
        await coverageUi.openOrCreateVisitForLead(leadId);
    } catch (_) {
        toast('Não foi possível abrir no mapa.', true);
    }
}

async function openNotes(lead) {
    openDrawer(`Notas — ${lead.nome || 'Lead'}`, async (panel) => {
        const form = document.createElement('form');
        form.className = 'admin-form';
        const text = inputEl('textarea', '');
        text.placeholder = 'Comentário livre…';
        form.appendChild(field('Novo comentário', text));
        const save = document.createElement('button');
        save.type = 'submit';
        save.className = 'btn-primary';
        save.style.width = '100%';
        save.textContent = 'Adicionar';
        form.appendChild(save);
        const list = document.createElement('ul');
        list.className = 'admin-notes';

        async function refresh() {
            const { response, data } = await api(`/api/digitalizept/leads/${lead.id}/notes`);
            if (!response.ok) return;
            list.innerHTML = '';
            (data.notes || []).forEach((n) => {
                const li = document.createElement('li');
                const time = document.createElement('time');
                time.textContent = new Date(n.criado_em).toLocaleString('pt-PT');
                li.append(time, document.createTextNode(n.texto));
                list.appendChild(li);
            });
            if (!list.children.length) {
                list.innerHTML = '<li class="admin-empty">Sem comentários.</li>';
            }
        }

        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            const texto = text.value.trim();
            if (!texto) return;
            const { response, data } = await api(`/api/digitalizept/leads/${lead.id}/notes`, {
                method: 'POST',
                body: { texto }
            });
            if (!response.ok) {
                toast(data.error || 'Falha.', true);
                return;
            }
            text.value = '';
            await refresh();
            toast('Comentário guardado.');
        });

        panel.append(form, list);
        await refresh();
    });
}

async function openMapsDelivery(deal) {
    const title = `Google Maps — ${deal.nome || deal.cliente_nome || 'Negócio'}`;
    openDrawer(title, (panel) => {
        const host = document.createElement('div');
        host.className = 'maps-cockpit';
        panel.appendChild(host);
        host.appendChild(Object.assign(document.createElement('p'), {
            className: 'admin-hint',
            textContent: 'A carregar o guião…'
        }));

        const paint = (cockpit) => {
            if (!cockpit || !cockpit.projectId) return;
            renderMapsCockpit(host, cockpit, {
                api,
                toast,
                onClose: closeDrawer,
                onUpdated: (next) => {
                    const nextCockpit = next && next.presenca ? next : (next && next.cockpit);
                    if (nextCockpit && nextCockpit.projectId) paint(nextCockpit);
                    loadDeals().catch(() => {});
                }
            });
        };

        api(`/api/digitalizept/deals/${encodeURIComponent(deal.projectId)}/maps`)
            .then(({ response, data }) => {
                if (!response.ok) {
                    host.innerHTML = '';
                    host.appendChild(Object.assign(document.createElement('p'), {
                        className: 'admin-hint',
                        textContent: data.error || 'Não foi possível abrir o guião.'
                    }));
                    toast(data.error || 'Falha.', true);
                    return;
                }
                paint(data);
            })
            .catch(() => {
                host.innerHTML = '';
                host.appendChild(Object.assign(document.createElement('p'), {
                    className: 'admin-hint',
                    textContent: 'Erro de rede. Toque em Fechar e tente outra vez.'
                }));
                toast('Erro de rede.', true);
            });
    });
}

function openDealEditor(deal) {
    openDrawer(`Proposta — ${deal.nome || deal.cliente_nome}`, (panel) => {
        const form = document.createElement('form');
        form.className = 'admin-form';
        const fase = document.createElement('select');
        fase.className = 'field-input';
        FASES.forEach((f) => {
            const opt = document.createElement('option');
            opt.value = f.id;
            opt.textContent = f.label;
            if (deal.estado === f.id) opt.selected = true;
            fase.appendChild(opt);
        });
        const google = document.createElement('select');
        google.className = 'field-input';
        GOOGLE_STATES.forEach((f) => {
            const opt = document.createElement('option');
            opt.value = f.id;
            opt.textContent = f.label;
            if (deal.estado_google === f.id) opt.selected = true;
            google.appendChild(opt);
        });
        form.append(field('Fase do projeto', fase), field('Estado Google', google));
        const resultado = document.createElement('select');
        resultado.className = 'field-input';
        [
            { id: '', label: '— (em jogo)' },
            { id: 'futuro', label: 'Voltar mais tarde' },
            { id: 'sem_interesse', label: 'Não quer' },
            { id: 'digitalizado', label: 'Já é cliente' }
        ].forEach((item) => {
            const opt = document.createElement('option');
            opt.value = item.id;
            opt.textContent = item.label;
            if ((deal.resultado || '') === item.id) opt.selected = true;
            resultado.appendChild(opt);
        });
        form.append(field('Fecho', resultado));
        const save = document.createElement('button');
        save.type = 'submit';
        save.className = 'btn-primary';
        save.style.width = '100%';
        save.textContent = 'Guardar fase';
        form.appendChild(save);
        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            const { response, data } = await api(`/api/digitalizept/deals/${deal.projectId}`, {
                method: 'PATCH',
                body: { estado: fase.value, estado_google: google.value, resultado: resultado.value }
            });
            if (!response.ok) {
                toast(data.error || 'Falha.', true);
                return;
            }
            toast('Fase atualizada.');
            closeDrawer();
            await Promise.all([loadDeals(), loadLeads()]);
        });

        const notesBtn = document.createElement('button');
        notesBtn.type = 'button';
        notesBtn.className = 'btn-secondary';
        notesBtn.style.width = '100%';
        notesBtn.style.marginTop = '10px';
        notesBtn.textContent = 'Comentários deste lead';
        notesBtn.addEventListener('click', () => openNotes({ id: deal.leadId, nome: deal.nome }));

        panel.append(form, notesBtn);
    });
}

async function loadProviderCard() {
    if (!el.providerCard) return;
    try {
        const config = await fetchConfig({ onUnauthorized }, { refresh: true });
        const paint = (provider) => {
            renderProviderEditor(el.providerCard, {
                provider: provider || {},
                toast,
                onUnauthorized,
                onSaved: paint
            });
        };
        paint((config && config.provider) || {});
    } catch (_) {
        el.providerCard.innerHTML = '<p class="admin-hint">Não foi possível carregar quem envia.</p>';
    }
}

async function loadCatalog() {
    const { response, data } = await api('/api/digitalizept/catalog?all=1');
    if (!response.ok) throw new Error('catalog');
    catalog = data.servicos || [];
    renderCatalog();
}

async function loadLeads() {
    const ordem = leadsOrdem();
    const qs = new URLSearchParams({ ordem });
    if (ordem === 'proximo') qs.set('fila', 'hoje');
    const { response, data } = await api(`/api/digitalizept/leads?${qs}`);
    if (!response.ok) throw new Error('leads');
    leads = data.leads || [];
    renderDemos();
}

async function loadDeals() {
    const { response, data } = await api('/api/digitalizept/deals');
    if (!response.ok) throw new Error('deals');
    deals = data.deals || [];
    renderDeals();
}


async function bootData() {
    await Promise.all([loadCatalog(), loadLeads(), loadDeals(), loadProviderCard()]);
    if (el.callQueue) {
        el.callQueue.classList.add('hidden');
        el.callQueue.setAttribute('hidden', '');
        el.callQueue.innerHTML = '';
    }
    const dossierId = leadIdFromHash(window.location.hash);
    if (dossierId) {
        await openLeadDossier(dossierId);
        return;
    }
    await openMapsDeepLink();
}

async function openMapsDeepLink() {
    const hash = String(window.location.hash || '');
    const match = hash.match(/google-delivery\?project=([^&]+)/i)
        || hash.match(/[#&]maps=([^&]+)/i);
    if (!match) return;
    const projectId = decodeURIComponent(match[1]);
    switchTab('deals');
    const deal = deals.find((d) => d.projectId === projectId);
    if (!deal) {
        toast('Proposta não encontrada para entrega Google.', true);
        return;
    }
    openMapsDelivery(deal);
}

coverageUi = setupCoverage({
    el,
    api,
    toast,
    openDrawer,
    closeDrawer,
    field,
    inputEl,
    openNotes,
    openFollowup: openLeadDossier,
    openDossier: openLeadDossier,
    onUnauthorized
});

el.loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const key = (el.keyInput.value || '').trim();
    if (!key) return;
    try {
        const { response, data } = await apiRequest('/api/digitalizept/login', {
            method: 'POST',
            body: { password: key }
        });
        if (!response.ok || !data.token) {
            el.loginError.textContent = data.error || 'Chave inválida.';
            return;
        }
        setToken(data.token);
        showApp();
        await bootData();
    } catch (_) {
        el.loginError.textContent = 'Sem ligação ao servidor.';
    }
});

el.logoutBtn.addEventListener('click', async () => {
    try {
        await apiRequest('/api/digitalizept/logout', { method: 'POST', token: getToken() });
    } catch (_) { /* ignore */ }
    clearToken();
    showLogin();
});

document.getElementById('refreshAppBtn')?.addEventListener('click', confirmAndRefreshApp);
document.getElementById('refreshAppLoginBtn')?.addEventListener('click', confirmAndRefreshApp);

document.querySelectorAll('.admin-tab').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});
el.catalogFilter.addEventListener('input', renderCatalog);
el.demosFilter.addEventListener('input', renderDemos);
if (el.leadsOrdem) {
    syncLeadsOrdemControl();
    el.leadsOrdem.addEventListener('change', async () => {
        try { localStorage.setItem(LEADS_ORDEM_KEY, leadsOrdem()); } catch (_) { /* ignore */ }
        try {
            await loadLeads();
        } catch (_) {
            toast('Não foi possível ordenar a lista.', true);
        }
    });
}
el.dealsFilter.addEventListener('input', renderDeals);
el.coverageFilter.addEventListener('input', () => {
    if (coverageUi) coverageUi.repaint();
});
el.catalogAddBtn.addEventListener('click', () => openServiceEditor(null));
if (el.leadsAddBtn) {
    el.leadsAddBtn.addEventListener('click', () => openQuickLead());
}
if (el.leadsEmailDemosBtn) {
    el.leadsEmailDemosBtn.addEventListener('click', async () => {
        const eligible = leads.filter((l) => (
            l.demo_slug && l.email && !l.followupUnsubscribed && l.resultado !== 'sem_interesse'
        ));
        const pending = eligible.filter((l) => !l.followupEmailSent);
        if (!pending.length) {
            toast(eligible.length
                ? 'Todas as demos com email já receberam este envio.'
                : 'Não há leads com demo publicada e email.');
            return;
        }
        if (!window.confirm(`Enviar o email HTML da demo a ${pending.length} cliente(s)?`)) return;
        el.leadsEmailDemosBtn.disabled = true;
        try {
            const { response, data } = await api('/api/digitalizept/outreach/email-demos', {
                method: 'POST',
                body: {}
            });
            if (!response.ok) {
                toast((data && data.error) || 'Não foi possível enviar.', true);
                return;
            }
            toast(`Enviados ${data.sent || 0}. Ignorados ${data.skipped || 0}. Falhas ${data.failed || 0}. Countdown das ligações a correr.`);
            await loadLeads();
        } catch (_) {
            toast('Erro de rede.', true);
        } finally {
            el.leadsEmailDemosBtn.disabled = false;
        }
    });
}
el.drawerBackdrop.addEventListener('click', closeDrawer);

window.addEventListener('hashchange', () => {
    const dossierId = leadIdFromHash(window.location.hash);
    if (dossierId) openLeadDossier(dossierId);
});

(async function boot() {
    if (!getToken()) {
        showLogin();
        return;
    }
    try {
        await api('/api/digitalizept/catalog?all=1');
        showApp();
        await bootData();
    } catch (_) {
        onUnauthorized();
    }
}());
