/**
 * Porto (or city) business discovery — its own admin page ("Descobrir").
 * Seller pastes links (one by one) or a batch of business data (JSON, e.g.
 * exported from generate_biz_links) here. Records with the minimum data for
 * a lead (nome + facebook/instagram + email/telefone/whatsapp + morada) are
 * sent straight to /leads/quick, which already filters against existing
 * leads (updates the match instead of duplicating). Records missing any of
 * that land as editable cards in the queue below — fields are edited right
 * on the card (no side drawer), then «Criar ficha» sends them the same way.
 */
import {
    businessSearchQuery,
    googleSearchUrl,
    openExternal
} from './social-assist.js';

const STORAGE_KEY = 'dpt-porto-finder-candidates';
const KIND_LABELS = { facebook: 'Facebook', instagram: 'Instagram', maps: 'Maps', batch: 'Lote' };

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
}

// Google Maps "copy" actions (address, phone) and some scraped exports prepend
// invisible bidi/formatting marks (LRM, embedding/isolate controls, BOM).
// Strip them and normalize NBSP so telefone/morada land in the ficha exactly
// as typed, without a manual cleanup pass.
const INVISIBLE_CHARS_RE = /[\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g;
const NBSP_RE = /\u00A0/g;

function clean(value) {
    return String(value == null ? '' : value)
        .replace(INVISIBLE_CHARS_RE, '')
        .replace(NBSP_RE, ' ')
        .trim();
}

function genId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** Fields tracked for the completeness score (badge + sort). */
const TRACKED_FIELDS = [
    'nome', 'telefone', 'whatsapp', 'email', 'morada', 'cidade',
    'facebook', 'instagram', 'website_atual', 'mapsUrl', 'typeId'
];

function completenessOf(item) {
    const filled = TRACKED_FIELDS.filter((f) => clean(item[f]).length > 0).length;
    return { filled, total: TRACKED_FIELDS.length };
}

/** Minimum data for a lead: nome + facebook/instagram + email/telefone/whatsapp + morada. */
function missingFields(record) {
    const missing = [];
    if (!clean(record.nome)) missing.push('nome');
    if (!clean(record.facebook) && !clean(record.instagram)) missing.push('Facebook ou Instagram');
    if (!clean(record.email) && !clean(record.telefone) && !clean(record.whatsapp)) missing.push('email, telefone ou WhatsApp');
    if (!clean(record.morada)) missing.push('morada');
    return missing;
}

function loadCandidates() {
    try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(parsed)) return [];
        // Migrate older cached shapes (nomeHint -> nome, missing id).
        return parsed.map((c) => {
            const item = { ...c };
            if (item.nomeHint && !item.nome) item.nome = item.nomeHint;
            delete item.nomeHint;
            if (!item.id) item.id = genId();
            item.missing = missingFields(item);
            return item;
        });
    } catch (_) {
        return [];
    }
}

function saveCandidates(list) {
    try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, 80)));
    } catch (_) { /* ignore quota */ }
}

function looksLikeMapsUrl(url) {
    const u = String(url || '').trim().toLowerCase();
    return u.includes('google.') || u.includes('maps.app.goo.gl') || u.includes('goo.gl/maps')
        || u.includes('maps.google');
}

function looksLikeFacebookUrl(url) {
    const u = String(url || '').trim().toLowerCase();
    return u.includes('facebook.com') || u.includes('fb.com') || u.includes('fb.me');
}

function looksLikeInstagramUrl(url) {
    const u = String(url || '').trim().toLowerCase();
    return u.includes('instagram.com') || u.includes('instagr.am');
}

/**
 * Flatten the accepted JSON shapes into a list of raw business records:
 * - businesses.json export: { Cidade: { tipoId: { businesses: { id: {...} } } } }
 * - a flat map of id -> business
 * - an array of business objects
 * - a single business object
 */
function flattenBatchJson(json) {
    const out = [];
    if (Array.isArray(json)) {
        json.forEach((raw) => { if (raw && typeof raw === 'object') out.push({ raw, cidade: '', tipoId: '' }); });
        return out;
    }
    if (!json || typeof json !== 'object') return out;

    const looksLikeBusiness = (v) => v && typeof v === 'object' && ('nome' in v || 'morada' in v || 'telefone' in v);
    if (looksLikeBusiness(json)) {
        out.push({ raw: json, cidade: clean(json.cidade), tipoId: clean(json.businessTypeId) });
        return out;
    }

    const topValues = Object.values(json);
    if (topValues.length && topValues.every(looksLikeBusiness)) {
        Object.values(json).forEach((raw) => out.push({ raw, cidade: clean(raw.cidade), tipoId: clean(raw.businessTypeId) }));
        return out;
    }

    // Nested Cidade -> tipoId -> { businesses: {...} }
    Object.entries(json).forEach(([cidade, tipos]) => {
        if (!tipos || typeof tipos !== 'object') return;
        Object.entries(tipos).forEach(([tipoId, tipoData]) => {
            const businesses = (tipoData && typeof tipoData === 'object' && tipoData.businesses) || null;
            if (businesses && typeof businesses === 'object') {
                Object.values(businesses).forEach((raw) => {
                    if (raw && typeof raw === 'object') out.push({ raw, cidade, tipoId });
                });
            }
        });
    });
    return out;
}

/** Website field in businesses.json sometimes is actually a social link. */
function socialFromWebsite(website) {
    const w = clean(website);
    if (!w) return {};
    if (looksLikeInstagramUrl(w)) return { instagram: w };
    if (looksLikeFacebookUrl(w)) return { facebook: w };
    return { website: w };
}

/** Normalize one raw business record (any of the accepted shapes) into lead fields. */
function normalizeBatchRecord({ raw, cidade, tipoId }) {
    const social = socialFromWebsite(raw.website);
    return {
        nome: clean(raw.nome || raw.nome_negocio),
        morada: clean(raw.morada || raw.endereco || raw.address),
        telefone: clean(raw.telefone || raw.phone),
        email: clean(raw.email),
        whatsapp: clean(raw.whatsapp),
        website_atual: clean(social.website),
        instagram: clean(raw.instagram || social.instagram),
        facebook: clean(raw.facebook || social.facebook),
        mapsUrl: clean(raw.maps || raw.mapsUrl || raw.maps_url),
        cidade: clean(cidade || raw.cidade),
        businessTypeId: clean(tipoId || raw.businessTypeId)
    };
}

/** Turn a normalized batch record into a queue candidate (editable card). */
function candidateFromRecord(record) {
    return {
        id: genId(),
        url: record.mapsUrl || record.facebook || record.instagram || '',
        kind: record.mapsUrl ? 'maps' : (record.facebook ? 'facebook' : 'batch'),
        typeId: record.businessTypeId || '',
        typeNome: '',
        nome: record.nome,
        telefone: record.telefone,
        whatsapp: record.whatsapp,
        email: record.email,
        morada: record.morada,
        cidade: record.cidade,
        instagram: record.instagram,
        facebook: record.facebook,
        website_atual: record.website_atual,
        mapsUrl: record.mapsUrl,
        missing: missingFields(record),
        addedAt: new Date().toISOString()
    };
}

export function renderPortoFinder(host, {
    api,
    toast,
    loadTypes,
    onLeadSaved,
    goToLeads
} = {}) {
    if (!host) return { destroy() {} };

    let types = [];
    let candidates = loadCandidates();
    let cidade = 'Porto';
    let queueSearch = '';
    let queueStatus = '';
    let queueSort = 'completo_desc';

    const root = el('div', 'porto-finder');

    const head = el('div', 'porto-finder-panel');
    head.appendChild(el(
        'p',
        'meta',
        'Ponto de entrada apenas: cola links um a um, ou cola um lote de dados (JSON, ex. export do generate_biz_links). Quem tem o mínimo (nome + Facebook/Instagram + email/telefone/WhatsApp + morada) cria ficha logo — o filtro de duplicados evita repetir. O resto fica na fila de cartões abaixo para completar e criar ficha ali mesmo — cada cartão tem um atalho para pesquisar o negócio no Google.'
    ));

    const cityRow = el('div', 'porto-finder-city');
    const cityInput = el('input', 'field-input');
    cityInput.type = 'text';
    cityInput.value = cidade;
    cityInput.placeholder = 'Cidade';
    cityInput.setAttribute('aria-label', 'Cidade por omissão para o lote e a pesquisa nos cartões');
    cityInput.addEventListener('change', () => {
        cidade = String(cityInput.value || '').trim() || 'Porto';
        cityInput.value = cidade;
    });
    cityRow.append(el('span', 'field-label', 'Cidade'), cityInput);
    head.appendChild(cityRow);

    const batchWrap = el('div', 'porto-finder-queue');
    batchWrap.appendChild(el('h4', '', 'Importar lote (JSON)'));
    batchWrap.appendChild(el(
        'p',
        'meta',
        'Cola aqui o JSON de negócios (o export do generate_biz_links, um objeto único, ou um array). Quem tiver o mínimo de dados cria ficha automaticamente; o resto vai para a fila abaixo.'
    ));
    const batchInput = el('textarea', 'field-input porto-finder-paste');
    batchInput.rows = 4;
    batchInput.placeholder = 'Cola o JSON (Cidade > tipo > businesses, array, ou um único negócio)';
    const batchBtn = el('button', 'btn-primary', 'Processar lote');
    batchBtn.type = 'button';
    const batchActions = el('div', 'porto-finder-queue-actions');
    batchActions.append(batchBtn);
    batchWrap.append(batchInput, batchActions);
    head.appendChild(batchWrap);

    const linksWrap = el('div', 'porto-finder-queue');
    linksWrap.appendChild(el('h4', '', 'Adicionar links'));
    linksWrap.appendChild(el(
        'p',
        'meta',
        'Cola links do Maps (preferido) ou Facebook — um por linha. Depois completa e cria a ficha no cartão, na fila abaixo.'
    ));
    const paste = el('textarea', 'field-input porto-finder-paste');
    paste.rows = 3;
    paste.placeholder = 'https://maps.app.goo.gl/…\nhttps://www.facebook.com/…';
    const addBtn = el('button', 'btn-secondary', 'Adicionar à fila');
    addBtn.type = 'button';
    const exportBtn = el('button', 'btn-secondary', 'Exportar URLs (script)');
    exportBtn.type = 'button';
    exportBtn.title = 'Descarrega um .txt para scripts/enrich-maps-candidates.js';
    const linksActions = el('div', 'porto-finder-queue-actions');
    linksActions.append(addBtn, exportBtn);
    linksWrap.append(paste, linksActions);
    head.appendChild(linksWrap);

    root.appendChild(head);

    // ---------- Queue (cards) ----------
    const queueSection = el('div', 'porto-finder-queue porto-finder-queue-main');
    const queueTitle = el('h4', '', 'Fila de candidatos');
    const queueCount = el('span', 'porto-finder-queue-count');
    queueTitle.appendChild(queueCount);
    queueSection.appendChild(queueTitle);
    queueSection.appendChild(el(
        'p',
        'meta',
        'Cada cartão é editável — completa os campos, o estado atualiza sozinho, e «Criar ficha» fica pronto quando o mínimo estiver preenchido.'
    ));

    const queueToolbar = el('div', 'porto-finder-queue-toolbar');
    const searchInput = el('input', 'field-input');
    searchInput.type = 'search';
    searchInput.placeholder = 'Filtrar por nome, morada, link…';
    searchInput.setAttribute('aria-label', 'Filtrar fila');
    searchInput.addEventListener('input', () => {
        queueSearch = String(searchInput.value || '').trim().toLowerCase();
        paintQueue();
    });

    const statusSelect = el('select', 'field-input porto-finder-queue-select');
    statusSelect.setAttribute('aria-label', 'Estado da ficha');
    [
        ['', 'Todos os estados'],
        ['prontos', 'Prontos a criar ficha'],
        ['incompletos', 'Incompletos']
    ].forEach(([value, label]) => {
        const opt = document.createElement('option');
        opt.value = value;
        opt.textContent = label;
        statusSelect.appendChild(opt);
    });
    statusSelect.addEventListener('change', () => {
        queueStatus = statusSelect.value;
        paintQueue();
    });

    const sortSelect = el('select', 'field-input porto-finder-queue-select');
    sortSelect.setAttribute('aria-label', 'Ordenar fila');
    [
        ['completo_desc', 'Mais completos primeiro'],
        ['completo_asc', 'Menos completos primeiro'],
        ['recentes', 'Mais recentes primeiro'],
        ['antigos', 'Mais antigos primeiro']
    ].forEach(([value, label]) => {
        const opt = document.createElement('option');
        opt.value = value;
        opt.textContent = label;
        sortSelect.appendChild(opt);
    });
    sortSelect.value = queueSort;
    sortSelect.addEventListener('change', () => {
        queueSort = sortSelect.value;
        paintQueue();
    });

    queueToolbar.append(searchInput, statusSelect, sortSelect);
    queueSection.appendChild(queueToolbar);

    const queueList = el('div', 'porto-finder-queue-list');
    queueSection.appendChild(queueList);

    root.appendChild(queueSection);
    host.appendChild(root);

    function removeCandidate(id) {
        candidates = candidates.filter((c) => c.id !== id);
        saveCandidates(candidates);
        paintQueue();
    }

    async function submitLead(item) {
        return api('/api/digitalizept/leads/quick', {
            method: 'POST',
            body: {
                nome: item.nome,
                businessTypeId: item.typeId || 'generico',
                telefone: item.telefone,
                whatsapp: item.whatsapp,
                email: item.email,
                morada: item.morada,
                cidade: item.cidade || cidade,
                website_atual: item.website_atual,
                instagram: item.instagram,
                facebook: item.facebook,
                mapsUrl: item.mapsUrl || (item.kind === 'maps' ? item.url : '')
            }
        });
    }

    function miniField(container, labelText, item, key, attrs = {}) {
        const wrap = el('label', 'porto-finder-field');
        wrap.appendChild(el('span', 'porto-finder-field-label', labelText));
        const input = el('input', 'field-input');
        input.type = attrs.type || 'text';
        input.value = item[key] || '';
        if (attrs.placeholder) input.placeholder = attrs.placeholder;
        input.addEventListener('input', () => {
            item[key] = input.value;
            saveCandidates(candidates);
            refreshCard(container._card, item);
        });
        wrap.appendChild(input);
        container.appendChild(wrap);
        return input;
    }

    function typeSelect(container, item) {
        const wrap = el('label', 'porto-finder-field');
        wrap.appendChild(el('span', 'porto-finder-field-label', 'Tipo de negócio'));
        const select = el('select', 'field-input');
        const blank = document.createElement('option');
        blank.value = '';
        blank.textContent = 'Genérico';
        select.appendChild(blank);
        types.forEach((t) => {
            if (t.id === 'generico') return;
            const opt = document.createElement('option');
            opt.value = t.id;
            opt.textContent = t.nome || t.id;
            select.appendChild(opt);
        });
        select.value = item.typeId || '';
        select.addEventListener('change', () => {
            item.typeId = select.value;
            const hit = types.find((t) => t.id === select.value);
            item.typeNome = hit ? (hit.nome || hit.id) : '';
            saveCandidates(candidates);
            refreshCard(container._card, item);
        });
        wrap.appendChild(select);
        container.appendChild(wrap);
        return select;
    }

    function refreshCard(card, item) {
        if (!card) return;
        const missing = missingFields(item);
        item.missing = missing;
        const comp = completenessOf(item);
        const badge = card.querySelector('.porto-finder-badge');
        if (badge) {
            badge.textContent = `${comp.filled}/${comp.total} campos`;
            badge.classList.toggle('porto-finder-badge-ready', missing.length === 0);
            badge.classList.toggle('porto-finder-badge-partial', missing.length > 0);
        }
        const missingLine = card.querySelector('.porto-finder-card-missing');
        if (missingLine) {
            if (missing.length) {
                missingLine.textContent = `Falta: ${missing.join(', ')}`;
                missingLine.hidden = false;
            } else {
                missingLine.hidden = true;
            }
        }
        const criarBtn = card.querySelector('.porto-finder-card-criar');
        if (criarBtn) criarBtn.disabled = missing.length > 0;
    }

    function renderCard(item) {
        const card = el('article', 'porto-finder-card');

        const headRow = el('div', 'porto-finder-card-head');
        const kind = KIND_LABELS[item.kind] || 'Link';
        headRow.appendChild(el('p', 'porto-finder-card-kind', `${kind}${item.typeNome ? ` · ${item.typeNome}` : ''}`));
        const comp = completenessOf(item);
        const badge = el('span', 'porto-finder-badge', `${comp.filled}/${comp.total} campos`);
        badge.classList.toggle('porto-finder-badge-ready', item.missing.length === 0);
        badge.classList.toggle('porto-finder-badge-partial', item.missing.length > 0);
        headRow.appendChild(badge);
        card.appendChild(headRow);

        if (item.url) {
            const urlLine = el('p', 'porto-finder-card-url', item.url);
            card.appendChild(urlLine);
        }

        const fields = el('div', 'porto-finder-card-fields');
        fields._card = card;
        miniField(fields, 'Nome', item, 'nome', { placeholder: 'Nome do negócio' });
        miniField(fields, 'Telefone', item, 'telefone', { type: 'tel' });
        miniField(fields, 'WhatsApp', item, 'whatsapp', { type: 'tel' });
        miniField(fields, 'Email', item, 'email', { type: 'email' });
        miniField(fields, 'Morada', item, 'morada');
        miniField(fields, 'Cidade', item, 'cidade');
        typeSelect(fields, item);
        miniField(fields, 'Facebook', item, 'facebook', { type: 'url' });
        miniField(fields, 'Instagram', item, 'instagram');
        miniField(fields, 'Website', item, 'website_atual', { type: 'url' });
        miniField(fields, 'Link Maps', item, 'mapsUrl', { type: 'url' });
        card.appendChild(fields);

        const missingLine = el('p', 'meta porto-finder-card-missing');
        if (item.missing.length) {
            missingLine.textContent = `Falta: ${item.missing.join(', ')}`;
        } else {
            missingLine.hidden = true;
        }
        card.appendChild(missingLine);

        const actions = el('div', 'porto-finder-card-actions');
        const open = el('a', 'btn-secondary', 'Abrir');
        open.href = item.url || '#';
        open.target = '_blank';
        open.rel = 'noopener';
        if (!item.url) open.setAttribute('aria-disabled', 'true');

        const search = el('button', 'btn-secondary', 'Pesquisar no Google');
        search.type = 'button';
        search.title = 'Pesquisa o que já sabemos deste negócio no Google, para achar o que falta';
        search.addEventListener('click', () => {
            const query = businessSearchQuery(item.nome || item.typeNome, item.cidade || cidade, item.morada);
            if (!query) {
                toast('Preenche pelo menos o nome ou a morada para pesquisar.', true);
                return;
            }
            if (!openExternal(googleSearchUrl(query))) toast('Não consegui abrir o browser.', true);
        });

        const enrich = el('button', 'btn-secondary', 'Enriquecer Maps');
        enrich.type = 'button';
        enrich.disabled = item.kind !== 'maps' || !api;
        enrich.title = 'Corre maps-lookup neste URL e preenche os campos acima';
        enrich.addEventListener('click', async () => {
            if (!api || item.kind !== 'maps') return;
            enrich.disabled = true;
            enrich.textContent = 'A ler…';
            try {
                const { response, data } = await api('/api/digitalizept/maps-lookup', {
                    method: 'POST',
                    body: { url: item.url }
                });
                if (!response.ok) {
                    toast((data && data.error) || 'Não consegui ler o link.', true);
                    return;
                }
                const d = (data && data.dados) || {};
                if (!item.nome && d.nome_negocio) item.nome = d.nome_negocio;
                if (!item.telefone && d.telefone) item.telefone = d.telefone;
                if (!item.email && d.email) item.email = d.email;
                if (!item.morada && d.morada) item.morada = d.morada;
                if (!item.cidade && d.cidade) item.cidade = d.cidade;
                if (!item.instagram && d.instagram) item.instagram = d.instagram;
                if (!item.facebook && d.facebook) item.facebook = d.facebook;
                if (!item.website_atual && (d.website_atual || d.website)) item.website_atual = d.website_atual || d.website;
                if (!item.typeId && data.businessTypeId && data.businessTypeId !== 'generico') item.typeId = data.businessTypeId;
                saveCandidates(candidates);
                paintQueue();
                toast('Pré-preenchido — confirma e cria a ficha.');
            } catch (_) {
                toast('Erro de rede.', true);
            } finally {
                enrich.disabled = false;
                enrich.textContent = 'Enriquecer Maps';
            }
        });

        const criar = el('button', 'btn-primary porto-finder-card-criar', 'Criar ficha');
        criar.type = 'button';
        criar.disabled = item.missing.length > 0;
        criar.addEventListener('click', async () => {
            const missing = missingFields(item);
            if (missing.length) {
                toast(`Faltam campos: ${missing.join(', ')}`, true);
                return;
            }
            if (!api) {
                toast('Sem ligação à API — não consigo criar fichas.', true);
                return;
            }
            criar.disabled = true;
            criar.textContent = 'A criar…';
            try {
                const { response, data } = await submitLead(item);
                if (!response.ok) {
                    toast((data && data.error) || 'Não consegui criar a ficha.', true);
                    return;
                }
                removeCandidate(item.id);
                const created = !(data && data.created === false);
                toast(created ? 'Ficha criada.' : 'Já existia — dados atualizados.', false, {
                    actionLabel: 'Ver leads',
                    onAction: () => { if (typeof goToLeads === 'function') goToLeads(); }
                });
                if (typeof onLeadSaved === 'function') onLeadSaved();
            } catch (_) {
                toast('Erro de rede.', true);
            } finally {
                criar.disabled = missingFields(item).length > 0;
                criar.textContent = 'Criar ficha';
            }
        });

        const remove = el('button', 'btn-secondary', 'Remover');
        remove.type = 'button';
        remove.addEventListener('click', () => removeCandidate(item.id));

        actions.append(open, search, enrich, criar, remove);
        card.appendChild(actions);
        return card;
    }

    function visibleCandidates() {
        let list = candidates.slice();
        if (queueSearch) {
            list = list.filter((c) => `${c.nome || ''} ${c.url || ''} ${c.morada || ''} ${c.cidade || ''}`.toLowerCase().includes(queueSearch));
        }
        if (queueStatus === 'prontos') list = list.filter((c) => missingFields(c).length === 0);
        else if (queueStatus === 'incompletos') list = list.filter((c) => missingFields(c).length > 0);

        list.sort((a, b) => {
            if (queueSort === 'completo_desc') return completenessOf(b).filled - completenessOf(a).filled;
            if (queueSort === 'completo_asc') return completenessOf(a).filled - completenessOf(b).filled;
            if (queueSort === 'antigos') return String(a.addedAt || '').localeCompare(String(b.addedAt || ''));
            return String(b.addedAt || '').localeCompare(String(a.addedAt || '')); // recentes (default fallback)
        });
        return list;
    }

    function paintQueue() {
        queueCount.textContent = candidates.length ? ` (${candidates.length})` : '';
        queueList.innerHTML = '';
        if (!candidates.length) {
            queueList.appendChild(el('p', 'meta', 'Fila vazia.'));
            return;
        }
        const list = visibleCandidates();
        if (!list.length) {
            queueList.appendChild(el('p', 'meta', 'Nada corresponde a este filtro.'));
            return;
        }
        list.forEach((item) => queueList.appendChild(renderCard(item)));
    }

    batchBtn.addEventListener('click', async () => {
        const text = String(batchInput.value || '').trim();
        if (!text) {
            toast('Cola o JSON do lote primeiro.', true);
            return;
        }
        let json;
        try {
            json = JSON.parse(text);
        } catch (_) {
            toast('JSON inválido — confirma o formato.', true);
            return;
        }
        const rawRecords = flattenBatchJson(json);
        if (!rawRecords.length) {
            toast('Não encontrei negócios neste JSON.', true);
            return;
        }
        if (!api) {
            toast('Sem ligação à API — não consigo criar fichas.', true);
            return;
        }
        batchBtn.disabled = true;
        batchBtn.textContent = 'A processar…';
        let created = 0;
        let updated = 0;
        let queued = 0;
        let failed = 0;
        try {
            for (const entry of rawRecords) {
                const record = normalizeBatchRecord(entry);
                const missing = missingFields(record);
                if (!missing.length) {
                    try {
                        const { response, data } = await api('/api/digitalizept/leads/quick', {
                            method: 'POST',
                            body: {
                                nome: record.nome,
                                businessTypeId: record.businessTypeId || 'generico',
                                telefone: record.telefone,
                                email: record.email,
                                morada: record.morada,
                                cidade: record.cidade || cidade,
                                website_atual: record.website_atual,
                                instagram: record.instagram,
                                facebook: record.facebook,
                                mapsUrl: record.mapsUrl
                            }
                        });
                        if (!response.ok) {
                            failed += 1;
                        } else if (data && data.created === false) {
                            updated += 1;
                        } else {
                            created += 1;
                        }
                    } catch (_) {
                        failed += 1;
                    }
                } else if (!candidates.some((c) => c.nome === record.nome && c.morada === record.morada)) {
                    candidates.push(candidateFromRecord(record));
                    queued += 1;
                }
            }
            saveCandidates(candidates);
            paintQueue();
            batchInput.value = '';
            toast(`Lote: ${created} criado(s), ${updated} já existiam (atualizados), ${queued} na fila por dados em falta${failed ? `, ${failed} com erro` : ''}.`);
            if ((created || updated) && typeof onLeadSaved === 'function') onLeadSaved();
        } finally {
            batchBtn.disabled = false;
            batchBtn.textContent = 'Processar lote';
        }
    });

    addBtn.addEventListener('click', () => {
        const lines = String(paste.value || '').split(/\n+/).map((l) => l.trim()).filter(Boolean);
        if (!lines.length) {
            toast('Cola pelo menos um link.', true);
            return;
        }
        lines.forEach((url) => {
            if (candidates.some((c) => c.url === url)) return;
            let kind = 'other';
            if (looksLikeMapsUrl(url)) kind = 'maps';
            else if (looksLikeFacebookUrl(url)) kind = 'facebook';
            else if (looksLikeInstagramUrl(url)) kind = 'instagram';
            const item = {
                id: genId(),
                url,
                kind,
                typeId: '',
                typeNome: '',
                nome: '',
                telefone: '',
                whatsapp: '',
                email: '',
                morada: '',
                cidade: '',
                instagram: kind === 'instagram' ? url : '',
                facebook: kind === 'facebook' ? url : '',
                website_atual: '',
                mapsUrl: kind === 'maps' ? url : '',
                addedAt: new Date().toISOString()
            };
            item.missing = missingFields(item);
            candidates.push(item);
        });
        saveCandidates(candidates);
        paste.value = '';
        paintQueue();
        toast(`${lines.length} link(s) na fila.`);
    });

    exportBtn.addEventListener('click', () => {
        const mapsOnly = candidates.filter((c) => c.kind === 'maps').map((c) => c.url);
        if (!mapsOnly.length) {
            toast('Não há links Maps na fila para exportar.', true);
            return;
        }
        const blob = new Blob([`${mapsOnly.join('\n')}\n`], { type: 'text/plain;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `porto-maps-candidates-${cidade.toLowerCase()}.txt`;
        a.click();
        URL.revokeObjectURL(a.href);
        toast('Ficheiro pronto para scripts/enrich-maps-candidates.js');
    });

    paintQueue();

    (async () => {
        try {
            types = typeof loadTypes === 'function' ? await loadTypes() : [];
            paintQueue();
        } catch (_) {
            /* type select on each card just falls back to "Genérico". */
        }
    })();

    return {
        destroy() {
            root.remove();
        }
    };
}
