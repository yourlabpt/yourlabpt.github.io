/**
 * Porto (or city) business-type discovery on the Leads list.
 * Opens Maps / Google / Facebook search deep-links — no scraping.
 * Seller pastes candidate Maps URLs, then creates fichas one by one
 * (maps-lookup enrich runs when creating / via CLI script).
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
    head.appendChild(el('summary', '', 'Descobrir negócios (Porto) — Maps / Facebook por tipo'));
    head.appendChild(el(
        'p',
        'meta',
        'Abre pesquisas por tipo de loja na cidade. Copias os links que interessam para a fila. Crias a ficha uma a uma — o enriquecimento (telefone, morada, OSM) corre no «Preencher pelo link» / script de Maps URL. Sem scraping de Google ou Facebook.'
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
            const kind = item.kind === 'facebook' ? 'Facebook' : (item.kind === 'maps' ? 'Maps' : 'Link');
            card.appendChild(el('p', 'porto-finder-card-kind', `${kind}${item.typeNome ? ` · ${item.typeNome}` : ''}`));
            const urlLine = el('p', 'porto-finder-card-url');
            urlLine.textContent = item.url;
            card.appendChild(urlLine);
            const row = el('div', 'porto-finder-card-actions');
            const open = el('a', 'btn-secondary', 'Abrir');
            open.href = item.url;
            open.target = '_blank';
            open.rel = 'noopener';
            const criar = el('button', 'btn-primary', 'Criar ficha');
            criar.type = 'button';
            criar.addEventListener('click', () => {
                if (typeof openQuickLeadWithDefaults !== 'function') {
                    toast('Abrir Novo negócio não está disponível.', true);
                    return;
                }
                const defaults = {
                    mapsUrl: item.kind === 'maps' ? item.url : '',
                    facebook: item.kind === 'facebook' ? item.url : '',
                    cidade,
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
