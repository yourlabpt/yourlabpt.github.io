/**
 * Porto (or city) business discovery on the Leads list.
 * This panel is only an intake point: seller pastes links (one by one) or a
 * batch of business data (JSON, e.g. exported from generate_biz_links) here.
 * Records with the minimum data for a lead (nome + facebook/instagram +
 * email/telefone/whatsapp + morada) are sent to /leads/quick, which already
 * filters against existing leads (updates the match instead of duplicating).
 * Records missing any of those go to the manual queue to be completed by hand.
 */
import {
    businessTypeDiscoveryLinks,
    openExternal
} from './social-assist.js';

const STORAGE_KEY = 'dpt-porto-finder-candidates';

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
}

function clean(value) {
    return String(value == null ? '' : value).trim();
}

function loadCandidates() {
    try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
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

/** Minimum data for a lead: nome + facebook/instagram + email/telefone/whatsapp + morada. */
function missingFields(record) {
    const missing = [];
    if (!record.nome) missing.push('nome');
    if (!record.facebook && !record.instagram) missing.push('Facebook ou Instagram');
    if (!record.email && !record.telefone && !record.whatsapp) missing.push('email, telefone ou WhatsApp');
    if (!record.morada) missing.push('morada');
    return missing;
}

export function renderPortoFinder(host, {
    api,
    toast,
    loadTypes,
    openQuickLeadWithDefaults
} = {}) {
    if (!host) return { destroy() {} };

    let types = [];
    let candidates = loadCandidates();
    let cidade = 'Porto';

    host.innerHTML = '';
    host.className = 'porto-finder';

    const head = el('details', 'porto-finder-panel');
    head.open = false;
    head.appendChild(el('summary', '', 'Descobrir negócios (Porto) — receber links / dados em lote'));
    head.appendChild(el(
        'p',
        'meta',
        'Ponto de entrada apenas: abre pesquisas por tipo, cola links um a um, ou cola um lote de dados (JSON, ex. export do generate_biz_links). Quem tem o mínimo (nome + Facebook/Instagram + email/telefone/WhatsApp + morada) cria ficha logo — o filtro de duplicados do «Novo negócio» evita repetir. O resto fica na fila para completar à mão.'
    ));

    const cityRow = el('div', 'porto-finder-city');
    const cityInput = el('input', 'field-input');
    cityInput.type = 'text';
    cityInput.value = cidade;
    cityInput.placeholder = 'Cidade';
    cityInput.setAttribute('aria-label', 'Cidade para pesquisa');
    cityInput.addEventListener('change', () => {
        cidade = String(cityInput.value || '').trim() || 'Porto';
        cityInput.value = cidade;
        paintTypes();
    });
    cityRow.append(el('span', 'field-label', 'Cidade'), cityInput);
    head.appendChild(cityRow);

    const typesHost = el('div', 'porto-finder-types');
    head.appendChild(typesHost);

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

    const queueWrap = el('div', 'porto-finder-queue');
    queueWrap.appendChild(el('h4', '', 'Fila de candidatos'));
    queueWrap.appendChild(el(
        'p',
        'meta',
        'Cola links do Maps (preferido) ou Facebook — um por linha. Depois «Criar ficha» em cada um.'
    ));
    const paste = el('textarea', 'field-input porto-finder-paste');
    paste.rows = 3;
    paste.placeholder = 'https://maps.app.goo.gl/…\nhttps://www.facebook.com/…';
    const addBtn = el('button', 'btn-secondary', 'Adicionar à fila');
    addBtn.type = 'button';
    const exportBtn = el('button', 'btn-secondary', 'Exportar URLs (script)');
    exportBtn.type = 'button';
        exportBtn.title = 'Descarrega um .txt para scripts/enrich-maps-candidates.js';
    const queueList = el('div', 'porto-finder-queue-list');
    const queueActions = el('div', 'porto-finder-queue-actions');
    queueActions.append(addBtn, exportBtn);
    queueWrap.append(paste, queueActions, queueList);
    head.appendChild(queueWrap);

    host.appendChild(head);

    function paintTypes() {
        typesHost.innerHTML = '';
        if (!types.length) {
            typesHost.appendChild(el('p', 'meta', 'A carregar tipos…'));
            return;
        }
        types.forEach((t) => {
            if (t.id === 'generico') return;
            const row = el('div', 'porto-finder-type');
            const label = el('span', 'porto-finder-type-name', t.nome || t.id);
            const links = businessTypeDiscoveryLinks(t, cidade);
            const actions = el('div', 'porto-finder-type-actions');
            function addOpen(labelText, url) {
                const btn = el('button', 'btn-secondary', labelText);
                btn.type = 'button';
                btn.title = links.query;
                btn.addEventListener('click', () => {
                    if (!openExternal(url)) toast('Não consegui abrir o browser.', true);
                });
                actions.appendChild(btn);
            }
            addOpen('Maps', links.maps);
            addOpen('Google', links.google);
            addOpen('Facebook', links.facebook);
            addOpen('Marketplace', links.marketplace);
            row.append(label, actions);
            typesHost.appendChild(row);
        });
    }

    function paintQueue() {
        queueList.innerHTML = '';
        if (!candidates.length) {
            queueList.appendChild(el('p', 'meta', 'Fila vazia.'));
            return;
        }
        candidates.forEach((item, index) => {
            const card = el('article', 'porto-finder-card');
            const kind = item.kind === 'facebook' ? 'Facebook' : (item.kind === 'maps' ? 'Maps' : (item.kind === 'batch' ? 'Lote' : 'Link'));
            card.appendChild(el('p', 'porto-finder-card-kind', `${kind}${item.typeNome ? ` · ${item.typeNome}` : ''}`));
            const urlLine = el('p', 'porto-finder-card-url');
            urlLine.textContent = item.url || item.nomeHint || '(sem link)';
            card.appendChild(urlLine);
            if (Array.isArray(item.missing) && item.missing.length) {
                card.appendChild(el('p', 'meta', `Falta: ${item.missing.join(', ')}`));
            }
            const row = el('div', 'porto-finder-card-actions');
            const open = el('a', 'btn-secondary', 'Abrir');
            open.href = item.url || '#';
            open.target = '_blank';
            open.rel = 'noopener';
            if (!item.url) open.setAttribute('aria-disabled', 'true');
            const criar = el('button', 'btn-primary', 'Criar ficha');
            criar.type = 'button';
            criar.addEventListener('click', () => {
                if (typeof openQuickLeadWithDefaults !== 'function') {
                    toast('Abrir Novo negócio não está disponível.', true);
                    return;
                }
                const defaults = {
                    mapsUrl: item.mapsUrl || (item.kind === 'maps' ? item.url : ''),
                    facebook: item.facebook || (item.kind === 'facebook' ? item.url : ''),
                    instagram: item.instagram || '',
                    telefone: item.telefone || '',
                    email: item.email || '',
                    morada: item.morada || '',
                    website_atual: item.website_atual || '',
                    cidade: item.cidade || cidade,
                    businessTypeId: item.typeId || 'generico',
                    nome: item.nomeHint || ''
                };
                openQuickLeadWithDefaults(defaults);
            });
            const enrich = el('button', 'btn-secondary', 'Enriquecer Maps');
            enrich.type = 'button';
            enrich.disabled = item.kind !== 'maps' || !api;
            enrich.title = 'Corre maps-lookup neste URL e abre Novo negócio já preenchido';
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
                    openQuickLeadWithDefaults({
                        nome: d.nome_negocio || '',
                        mapsUrl: item.url,
                        website_atual: d.website_atual || d.website || '',
                        telefone: d.telefone || '',
                        email: d.email || '',
                        morada: d.morada || '',
                        cidade: d.cidade || cidade,
                        instagram: d.instagram || '',
                        facebook: d.facebook || '',
                        businessTypeId: data.businessTypeId || item.typeId || 'generico',
                        lat: data.lat,
                        lng: data.lng
                    });
                    toast('Pré-preenchido — confirma e cria a ficha.');
                } catch (_) {
                    toast('Erro de rede.', true);
                } finally {
                    enrich.disabled = false;
                    enrich.textContent = 'Enriquecer Maps';
                }
            });
            const remove = el('button', 'btn-secondary', 'Remover');
            remove.type = 'button';
            remove.addEventListener('click', () => {
                candidates.splice(index, 1);
                saveCandidates(candidates);
                paintQueue();
            });
            row.append(open, enrich, criar, remove);
            card.appendChild(row);
            queueList.appendChild(card);
        });
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
                } else if (!candidates.some((c) => c.nomeHint === record.nome && c.morada === record.morada)) {
                    candidates.push({
                        url: record.mapsUrl || record.facebook || record.instagram || '',
                        kind: record.mapsUrl ? 'maps' : (record.facebook ? 'facebook' : 'batch'),
                        typeId: record.businessTypeId || '',
                        typeNome: '',
                        nomeHint: record.nome,
                        telefone: record.telefone,
                        email: record.email,
                        morada: record.morada,
                        cidade: record.cidade,
                        instagram: record.instagram,
                        facebook: record.facebook,
                        website_atual: record.website_atual,
                        mapsUrl: record.mapsUrl,
                        missing,
                        addedAt: new Date().toISOString()
                    });
                    queued += 1;
                }
            }
            saveCandidates(candidates);
            paintQueue();
            batchInput.value = '';
            toast(`Lote: ${created} criado(s), ${updated} já existiam (atualizados), ${queued} na fila por dados em falta${failed ? `, ${failed} com erro` : ''}.`);
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
        const selectedType = types.find((t) => t.id === head.dataset.activeType) || null;
        lines.forEach((url) => {
            if (candidates.some((c) => c.url === url)) return;
            let kind = 'other';
            if (looksLikeMapsUrl(url)) kind = 'maps';
            else if (looksLikeFacebookUrl(url)) kind = 'facebook';
            candidates.push({
                url,
                kind,
                typeId: selectedType ? selectedType.id : '',
                typeNome: selectedType ? selectedType.nome : '',
                addedAt: new Date().toISOString()
            });
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
            paintTypes();
        } catch (_) {
            typesHost.innerHTML = '';
            typesHost.appendChild(el('p', 'meta', 'Não foi possível carregar os tipos.'));
        }
    })();

    return {
        destroy() {
            host.innerHTML = '';
        }
    };
}
