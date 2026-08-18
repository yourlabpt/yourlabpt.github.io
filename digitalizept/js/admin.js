import { apiRequest } from './api.js';
import { getToken, setToken, clearToken } from './auth.js';
import { formatEuros } from './format.js';
import { downloadDealContract } from './deal/download.js';
import { setupCoverage } from './admin-coverage.js';

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
    { id: 'por_criar', label: 'Por criar' },
    { id: 'em_curso', label: 'Em curso' },
    { id: 'feito', label: 'Feito' }
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
    dealsFilter: document.getElementById('deals-filter'),
    catalogAddBtn: document.getElementById('catalog-add-btn'),
    coverageFilter: document.getElementById('coverage-filter'),
    coverageLegend: document.getElementById('coverage-legend'),
    coverageMap: document.getElementById('coverage-map'),
    coverageStatus: document.getElementById('coverage-status'),
    coverageUnmapped: document.getElementById('coverage-unmapped'),
    coverageAddBtn: document.getElementById('coverage-add-btn'),
    coveragePlaceBtn: document.getElementById('coverage-place-btn'),
    coverageExportBtn: document.getElementById('coverage-export-btn'),
    drawer: document.getElementById('drawer'),
    drawerPanel: document.getElementById('drawer-panel'),
    drawerBackdrop: document.getElementById('drawer-backdrop')
};

let catalog = [];
let leads = [];
let deals = [];
let coverageUi = null;

function toast(message, isError = false) {
    const node = document.createElement('div');
    node.className = `toast${isError ? ' error' : ''}`;
    node.textContent = message;
    document.body.appendChild(node);
    setTimeout(() => node.remove(), 2800);
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
    el.drawer.setAttribute('aria-hidden', 'true');
    el.drawerPanel.innerHTML = '';
}

function openDrawer(title, build) {
    el.drawerPanel.innerHTML = '';
    const h = document.createElement('h2');
    h.textContent = title;
    el.drawerPanel.appendChild(h);
    build(el.drawerPanel);
    el.drawer.classList.remove('hidden');
    el.drawer.setAttribute('aria-hidden', 'false');
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
    ['catalog', 'leads', 'deals', 'coverage'].forEach((id) => {
        document.getElementById(`tab-${id}`).classList.toggle('hidden', id !== name);
    });
    if (name === 'coverage' && coverageUi) {
        coverageUi.ensure().catch((err) => {
            if (el.coverageStatus) {
                el.coverageStatus.textContent = err.message || 'Mapa indisponível.';
            }
        });
    }
}

function estadoLabel(estado) {
    if (estado === 'rascunho') return 'Rascunho';
    if (estado === 'demonstracao') return 'Com demo';
    if (estado === 'fechado') return 'Fechado';
    return estado || '—';
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

function renderDemos() {
    const q = (el.demosFilter.value || '').trim().toLowerCase();
    const items = leads.filter((l) => l.estado !== 'fechado').filter((l) => {
        if (!q) return true;
        return `${l.nome} ${l.business_type} ${l.demo_slug || ''} ${l.morada || ''} ${l.estado || ''}`
            .toLowerCase()
            .includes(q);
    });
    el.demosList.innerHTML = '';
    if (!items.length) {
        el.demosList.innerHTML = '<p class="admin-empty">Sem leads em aberto.</p>';
        return;
    }
    items.forEach((l) => {
        const card = document.createElement('article');
        card.className = 'admin-card';
        card.innerHTML = `
            <h3>${l.nome || 'Sem nome'}</h3>
            <p class="meta">${l.business_type || '—'} · ${estadoLabel(l.estado)} · ${new Date(l.criado_em).toLocaleDateString('pt-PT')}</p>
            <p class="meta">${l.morada || '—'}${l.telefone ? ` · ${l.telefone}` : ''}</p>
            ${l.demo_slug ? `<p class="meta">Demo: /${l.demo_slug}</p>` : ''}
        `;
        const actions = document.createElement('div');
        actions.className = 'actions';

        const resume = document.createElement('a');
        resume.className = 'btn-primary';
        resume.href = `./?resume=${encodeURIComponent(l.id)}`;
        resume.textContent = 'Continuar venda';
        actions.appendChild(resume);

        if (l.demo_slug) {
            const open = document.createElement('a');
            open.className = 'btn-secondary';
            open.href = `/d/${l.demo_slug}`;
            open.target = '_blank';
            open.rel = 'noopener';
            open.textContent = 'Abrir demo';
            actions.appendChild(open);
        }

        const notes = document.createElement('button');
        notes.type = 'button';
        notes.className = 'btn-secondary';
        notes.textContent = 'Comentários';
        notes.addEventListener('click', () => openNotes(l));
        actions.appendChild(notes);

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
    const items = deals.filter((d) => {
        if (!q) return true;
        return `${d.nome} ${d.cliente_nome} ${d.estado} ${d.business_type}`.toLowerCase().includes(q);
    });
    el.dealsList.innerHTML = '';
    if (!items.length) {
        el.dealsList.innerHTML = '<p class="admin-empty">Sem propostas fechadas.</p>';
        return;
    }
    items.forEach((d) => {
        const card = document.createElement('article');
        card.className = 'admin-card';
        const fase = FASES.find((f) => f.id === d.estado)?.label || d.estado;
        card.innerHTML = `
            <h3>${d.nome || d.cliente_nome || 'Negócio'}</h3>
            <p class="meta">${d.cliente_nome || ''} · ${packageLabel(d.itens_json)} · ${eurosFromCents(d.total_com_iva_centimos)} · ${d.template_versao || 'v1'}</p>
            <p class="meta">Fase: ${fase} · Google: ${d.estado_google || '—'} · ${new Date(d.criado_em).toLocaleDateString('pt-PT')}</p>
        `;
        const actions = document.createElement('div');
        actions.className = 'actions';
        if (d.leadId) {
            const revise = document.createElement('a');
            revise.className = 'btn-primary';
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
        actions.append(contract, edit);
        card.appendChild(actions);
        el.dealsList.appendChild(card);
    });
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
                body: { estado: fase.value, estado_google: google.value }
            });
            if (!response.ok) {
                toast(data.error || 'Falha.', true);
                return;
            }
            toast('Fase atualizada.');
            closeDrawer();
            await loadDeals();
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

async function loadCatalog() {
    const { response, data } = await api('/api/digitalizept/catalog?all=1');
    if (!response.ok) throw new Error('catalog');
    catalog = data.servicos || [];
    renderCatalog();
}

async function loadLeads() {
    const { response, data } = await api('/api/digitalizept/leads');
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
    await Promise.all([loadCatalog(), loadLeads(), loadDeals()]);
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

document.querySelectorAll('.admin-tab').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});
el.catalogFilter.addEventListener('input', renderCatalog);
el.demosFilter.addEventListener('input', renderDemos);
el.dealsFilter.addEventListener('input', renderDeals);
el.coverageFilter.addEventListener('input', () => {
    if (coverageUi) coverageUi.repaint();
});
el.catalogAddBtn.addEventListener('click', () => openServiceEditor(null));
el.drawerBackdrop.addEventListener('click', closeDrawer);

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
