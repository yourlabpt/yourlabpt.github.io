import { apiRequest } from './api.js';
import { getToken, setToken, clearToken } from './auth.js';
import { formatEuros } from './format.js';

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
    drawer: document.getElementById('drawer'),
    drawerPanel: document.getElementById('drawer-panel'),
    drawerBackdrop: document.getElementById('drawer-backdrop')
};

let catalog = [];
let leads = [];
let deals = [];
let coveragePins = [];
let coverageLegend = [];
let coverageFilterIds = new Set();
let mapsApiKey = '';
let mapsReady = null;
let googleMap = null;
let googleMarkers = [];
let mapsLoadPromise = null;

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
    if (name === 'coverage') {
        ensureCoverageMap().catch((err) => {
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
            <p class="meta">${d.cliente_nome || ''} · ${packageLabel(d.itens_json)} · ${eurosFromCents(d.total_com_iva_centimos)}</p>
            <p class="meta">Fase: ${fase} · Google: ${d.estado_google || '—'} · ${new Date(d.criado_em).toLocaleDateString('pt-PT')}</p>
        `;
        const actions = document.createElement('div');
        actions.className = 'actions';
        if (d.demo_slug) {
            const demo = document.createElement('a');
            demo.className = 'btn-secondary';
            demo.href = `/d/${d.demo_slug}`;
            demo.target = '_blank';
            demo.rel = 'noopener';
            demo.textContent = 'Demo';
            actions.appendChild(demo);
        }
        const contract = document.createElement('a');
        contract.className = 'btn-secondary';
        contract.href = `/api/digitalizept/deals/${d.projectId}/contract`;
        contract.textContent = 'Contrato';
        contract.addEventListener('click', async (event) => {
            event.preventDefault();
            try {
                const res = await fetch(contract.href, { headers: { 'x-admin-token': getToken() } });
                if (res.status === 401) { onUnauthorized(); return; }
                if (!res.ok) { toast('Contrato indisponível.', true); return; }
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                window.open(url, '_blank');
            } catch (_) {
                toast('Falha ao abrir contrato.', true);
            }
        });
        const edit = document.createElement('button');
        edit.type = 'button';
        edit.className = 'btn-primary';
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

function markerIcon(color) {
    const fill = encodeURIComponent(color || '#a9a8a3');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36">
      <path fill="${fill}" stroke="#1b1b1b" stroke-width="1.2" d="M14 1C7.4 1 2 6.4 2 13c0 9.2 12 21.5 12 21.5S26 22.2 26 13C26 6.4 20.6 1 14 1z"/>
      <circle cx="14" cy="13" r="4.2" fill="#faf8f4"/>
    </svg>`;
    return {
        url: `data:image/svg+xml;charset=UTF-8,${svg}`,
        scaledSize: new window.google.maps.Size(28, 36),
        anchor: new window.google.maps.Point(14, 34)
    };
}

function loadGoogleMaps(apiKey) {
    if (window.google && window.google.maps) return Promise.resolve();
    if (mapsLoadPromise) return mapsLoadPromise;
    mapsLoadPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}`;
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Não foi possível carregar o Google Maps.'));
        document.head.appendChild(script);
    });
    return mapsLoadPromise;
}

function filteredCoveragePins() {
    const q = (el.coverageFilter.value || '').trim().toLowerCase();
    return coveragePins.filter((p) => {
        if (coverageFilterIds.size && !coverageFilterIds.has(p.cobertura || 'contacto')) return false;
        if (!q) return true;
        return `${p.nome} ${p.morada || ''} ${p.cidade || ''} ${p.business_type || ''}`
            .toLowerCase()
            .includes(q);
    });
}

function renderCoverageLegend() {
    el.coverageLegend.innerHTML = '';
    coverageLegend.forEach((item) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `coverage-chip${coverageFilterIds.has(item.id) ? ' active' : ''}`;
        const dot = document.createElement('span');
        dot.className = 'coverage-chip-dot';
        dot.style.background = item.color;
        btn.append(dot, document.createTextNode(item.label));
        btn.addEventListener('click', () => {
            if (coverageFilterIds.has(item.id)) coverageFilterIds.delete(item.id);
            else coverageFilterIds.add(item.id);
            renderCoverageLegend();
            paintCoverageMarkers();
        });
        el.coverageLegend.appendChild(btn);
    });
}

function openCoveragePin(pin) {
    openDrawer(pin.nome || 'Negócio', (panel) => {
        const meta = document.createElement('p');
        meta.className = 'meta';
        meta.textContent = `${pin.morada || '—'}${pin.cidade ? `, ${pin.cidade}` : ''} · ${pin.business_type || '—'}`;
        panel.appendChild(meta);

        const form = document.createElement('form');
        form.className = 'admin-form';
        const cobertura = document.createElement('select');
        cobertura.className = 'field-input';
        coverageLegend.forEach((item) => {
            const opt = document.createElement('option');
            opt.value = item.id;
            opt.textContent = item.label;
            if ((pin.cobertura || 'contacto') === item.id) opt.selected = true;
            cobertura.appendChild(opt);
        });
        form.appendChild(field('Desfecho na rua', cobertura));
        const save = document.createElement('button');
        save.type = 'submit';
        save.className = 'btn-primary';
        save.textContent = 'Guardar cobertura';
        form.appendChild(save);
        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            const { response, data } = await api(`/api/digitalizept/leads/${pin.id}`, {
                method: 'PATCH',
                body: { cobertura: cobertura.value }
            });
            if (!response.ok) {
                toast(data.error || 'Falha.', true);
                return;
            }
            toast('Cobertura atualizada.');
            closeDrawer();
            await loadCoverage();
            paintCoverageMarkers();
        });
        panel.appendChild(form);

        const actions = document.createElement('div');
        actions.className = 'coverage-pin-actions';
        if (pin.estado !== 'fechado') {
            const resume = document.createElement('a');
            resume.className = 'btn-primary';
            resume.href = `./?resume=${encodeURIComponent(pin.id)}`;
            resume.textContent = 'Continuar venda';
            actions.appendChild(resume);
        }
        if (pin.demo_slug) {
            const demo = document.createElement('a');
            demo.className = 'btn-secondary';
            demo.href = `/d/${pin.demo_slug}`;
            demo.target = '_blank';
            demo.rel = 'noopener';
            demo.textContent = 'Abrir demo';
            actions.appendChild(demo);
        }
        const regeo = document.createElement('button');
        regeo.type = 'button';
        regeo.className = 'btn-secondary';
        regeo.textContent = Number.isFinite(pin.lat) ? 'Regeocodificar' : 'Geocodificar';
        regeo.addEventListener('click', async () => {
            regeo.disabled = true;
            const { response, data } = await api(`/api/digitalizept/leads/${pin.id}/geocode`, { method: 'POST' });
            regeo.disabled = false;
            if (!response.ok) {
                toast(data.error || 'Geocoding falhou.', true);
                return;
            }
            toast('Coordenadas atualizadas.');
            closeDrawer();
            await loadCoverage();
            paintCoverageMarkers();
        });
        actions.appendChild(regeo);
        const notes = document.createElement('button');
        notes.type = 'button';
        notes.className = 'btn-secondary';
        notes.textContent = 'Comentários';
        notes.addEventListener('click', () => openNotes({ id: pin.id, nome: pin.nome }));
        actions.appendChild(notes);
        panel.appendChild(actions);
    });
}

function paintCoverageMarkers() {
    if (!googleMap || !window.google) return;
    googleMarkers.forEach((m) => m.setMap(null));
    googleMarkers = [];
    const pins = filteredCoveragePins().filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
    const bounds = new window.google.maps.LatLngBounds();
    pins.forEach((pin) => {
        const marker = new window.google.maps.Marker({
            map: googleMap,
            position: { lat: pin.lat, lng: pin.lng },
            title: pin.nome || '',
            icon: markerIcon(pin.color)
        });
        marker.addListener('click', () => openCoveragePin(pin));
        googleMarkers.push(marker);
        bounds.extend(marker.getPosition());
    });
    const unmapped = filteredCoveragePins().filter((p) => !(Number.isFinite(p.lat) && Number.isFinite(p.lng)));
    el.coverageStatus.textContent = pins.length
        ? `${pins.length} no mapa${unmapped.length ? ` · ${unmapped.length} sem coordenadas` : ''}`
        : (unmapped.length ? `${unmapped.length} leads sem coordenadas.` : 'Sem leads para mostrar.');

    if (el.coverageUnmapped) {
        el.coverageUnmapped.innerHTML = '';
        unmapped.slice(0, 40).forEach((pin) => {
            const card = document.createElement('article');
            card.className = 'admin-card';
            card.innerHTML = `
                <h3>${pin.nome || 'Sem nome'}</h3>
                <p class="meta">${pin.morada || '—'}${pin.cidade ? `, ${pin.cidade}` : ''} · sem pin</p>
            `;
            const actions = document.createElement('div');
            actions.className = 'actions';
            const open = document.createElement('button');
            open.type = 'button';
            open.className = 'btn-secondary';
            open.textContent = 'Abrir';
            open.addEventListener('click', () => openCoveragePin(pin));
            actions.appendChild(open);
            card.appendChild(actions);
            el.coverageUnmapped.appendChild(card);
        });
    }

    if (pins.length === 1) {
        googleMap.setCenter(pins[0]);
        googleMap.setZoom(14);
    } else if (pins.length > 1) {
        googleMap.fitBounds(bounds, 48);
    } else {
        googleMap.setCenter({ lat: 39.5, lng: -8.0 });
        googleMap.setZoom(7);
    }
}

async function loadCoverage() {
    const { response, data } = await api('/api/digitalizept/coverage');
    if (!response.ok) throw new Error('coverage');
    coveragePins = data.pins || [];
    coverageLegend = data.legend || [];
    renderCoverageLegend();
}

async function ensureCoverageMap() {
    if (!mapsReady) {
        const { response, data } = await api('/api/digitalizept/maps-config');
        if (!response.ok) throw new Error('maps-config');
        mapsApiKey = data.apiKey || '';
        if (data.legend) coverageLegend = data.legend;
        if (!mapsApiKey) {
            el.coverageStatus.textContent = 'Defina GOOGLE_MAPS_API_KEY no servidor (Maps JavaScript + Geocoding).';
            renderCoverageLegend();
            throw new Error('GOOGLE_MAPS_API_KEY em falta.');
        }
        await loadGoogleMaps(mapsApiKey);
        mapsReady = true;
    }
    await loadCoverage();
    if (!googleMap) {
        googleMap = new window.google.maps.Map(el.coverageMap, {
            center: { lat: 39.5, lng: -8.0 },
            zoom: 7,
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: true,
            styles: [
                { elementType: 'geometry', stylers: [{ color: '#f4f1ea' }] },
                { elementType: 'labels.text.fill', stylers: [{ color: '#5c564c' }] },
                { elementType: 'labels.text.stroke', stylers: [{ color: '#f4f1ea' }] },
                { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#d7e0e6' }] },
                { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
                { featureType: 'poi', stylers: [{ visibility: 'off' }] },
                { featureType: 'transit', stylers: [{ visibility: 'off' }] }
            ]
        });
    }
    paintCoverageMarkers();
}

async function bootData() {
    await Promise.all([loadCatalog(), loadLeads(), loadDeals()]);
}

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
    if (googleMap) paintCoverageMarkers();
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
