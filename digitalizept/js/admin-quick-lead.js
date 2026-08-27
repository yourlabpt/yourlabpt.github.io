import {
    googleBusinessSocialSearchUrl,
    facebookOpenUrl,
    facebookPagesSearchUrl,
    facebookMarketplaceSearchUrl,
    instagramOpenUrl,
    copySearchQuery,
    openExternal
} from './social-assist.js';

const CONTACT_KEYS = [
    'nome_negocio',
    'website_atual',
    'instagram',
    'facebook',
    'telefone',
    'email',
    'whatsapp',
    'morada',
    'cidade',
    'maps_url'
];

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
}

function setIfEmpty(input, value) {
    if (!input || value == null) return;
    const next = String(value).trim();
    if (!next) return;
    if (String(input.value || '').trim()) return;
    input.value = next;
}

function fillFromLookup(fields, result, { overwrite = false } = {}) {
    const dados = (result && result.dados) || {};
    CONTACT_KEYS.forEach((key) => {
        const input = fields[key];
        if (!input) return;
        const next = dados[key];
        if (overwrite) {
            if (next) input.value = next;
        } else {
            setIfEmpty(input, next);
        }
    });
    if (fields.businessType && result.businessTypeId) {
        const exists = Array.from(fields.businessType.options).some((o) => o.value === result.businessTypeId);
        if (exists && (overwrite || !fields.businessType.value || fields.businessType.value === 'generico')) {
            fields.businessType.value = result.businessTypeId;
        }
    }
    if (Number.isFinite(result.lat) && Number.isFinite(result.lng)) {
        fields.lat = result.lat;
        fields.lng = result.lng;
    }
}

function contextFromFields(nome, cidade) {
    return {
        nome: String(nome.value || '').trim(),
        cidade: String(cidade.value || '').trim()
    };
}

export function renderQuickLeadForm(panel, {
    types = [],
    defaults = {},
    api,
    toast,
    field,
    inputEl,
    onCreated,
    onPlaceOnMap,
    coordText = ''
} = {}) {
    const form = el('form', 'admin-form quick-lead-form');
    const hint = el(
        'p',
        'meta',
        'Nome é obrigatório. Cole o Maps → Preencher → use os botões para achar Facebook/Instagram e copiar o email. Sem scraping — abre tabs e colas à mão.'
    );
    const maps = inputEl('url', defaults.mapsUrl || defaults.maps_url || '');
    maps.placeholder = 'https://maps.app.goo.gl/…';
    maps.inputMode = 'url';
    const fillBtn = el('button', 'btn-secondary', 'Preencher pelo link');
    fillBtn.type = 'button';
    const mapsRow = el('div', 'quick-lead-maps');
    mapsRow.append(maps, fillBtn);

    const lookupNotes = el('p', 'meta quick-lead-lookup-notes');
    lookupNotes.hidden = true;

    const assist = el('div', 'quick-lead-assist');
    assist.hidden = true;
    const assistHint = el(
        'p',
        'meta',
        'Redes e email: abre a tab, copia, cola cá. Sem scraping. “Pesquisar FB” / Marketplace ajudam a achar lojas só no Facebook (ex.: Porto). O email costuma estar em Sobre / Contactos.'
    );
    const assistRow = el('div', 'quick-lead-assist-row');
    const btnGoogle = el('button', 'btn-secondary', 'Procurar no Google');
    btnGoogle.type = 'button';
    const btnFb = el('button', 'btn-secondary', 'Abrir Facebook');
    btnFb.type = 'button';
    const btnFbSearch = el('button', 'btn-secondary', 'Pesquisar FB');
    btnFbSearch.type = 'button';
    btnFbSearch.title = 'Google site:facebook.com na cidade (Porto se vazia)';
    const btnMarket = el('button', 'btn-secondary', 'Marketplace');
    btnMarket.type = 'button';
    btnMarket.title = 'Facebook Marketplace na cidade (Porto se vazia) — só descoberta';
    const btnIg = el('button', 'btn-secondary', 'Abrir Instagram');
    btnIg.type = 'button';
    const btnCopy = el('button', 'btn-secondary', 'Copiar pesquisa');
    btnCopy.type = 'button';
    assistRow.append(btnGoogle, btnFb, btnFbSearch, btnMarket, btnIg, btnCopy);
    assist.append(assistHint, assistRow);

    const nome = inputEl('text', defaults.nome || defaults.nome_negocio || '');
    nome.autocomplete = 'organization';
    nome.required = true;
    nome.classList.add('field-input-name');
    const website = inputEl('url', defaults.website_atual || defaults.website || '');
    website.placeholder = 'https://…';
    website.inputMode = 'url';
    website.autocapitalize = 'off';
    website.spellcheck = false;
    const telefone = inputEl('tel', defaults.telefone || '');
    telefone.autocomplete = 'tel';
    const email = inputEl('email', defaults.email || '');
    email.autocomplete = 'email';
    const morada = inputEl('text', defaults.morada || '');
    morada.autocomplete = 'street-address';
    morada.placeholder = 'Rua e número';
    const cidade = inputEl('text', defaults.cidade || '');
    cidade.autocomplete = 'address-level2';
    const instagram = inputEl('text', defaults.instagram || '');
    instagram.placeholder = '@loja ou url';
    instagram.autocapitalize = 'off';
    instagram.spellcheck = false;
    const facebook = inputEl('text', defaults.facebook || '');
    facebook.placeholder = 'facebook.com/loja';
    facebook.autocapitalize = 'off';
    facebook.spellcheck = false;
    const typeSelect = document.createElement('select');
    typeSelect.className = 'field-input';
    (types || []).forEach((t) => {
        const o = document.createElement('option');
        o.value = t.id;
        o.textContent = t.nome || t.id;
        if (t.id === (defaults.businessTypeId || defaults.business_type || 'generico')) o.selected = true;
        typeSelect.appendChild(o);
    });
    if (!typeSelect.value && types.length) typeSelect.value = types[0].id;

    const noPointHint = typeof onPlaceOnMap === 'function'
        ? 'Sem ponto ainda — toque no mapa, use “Marcar no mapa”, ou cole o link.'
        : 'Sem ponto ainda — cole o link do Maps ou preencha a morada.';
    const coordHint = el('p', 'meta', coordText || noPointHint);
    const etapaHint = el('p', 'meta', 'No mapa entra como ainda não fomos. Visita fica para “Registar visita”.');
    const fields = {
        nome_negocio: nome,
        website_atual: website,
        telefone,
        email,
        morada,
        cidade,
        instagram,
        facebook,
        maps_url: maps,
        businessType: typeSelect,
        lat: defaults.lat,
        lng: defaults.lng
    };

    function syncAssist() {
        const hasNome = Boolean(String(nome.value || '').trim());
        assist.hidden = !hasNome;
        [btnGoogle, btnFb, btnFbSearch, btnMarket, btnIg, btnCopy].forEach((btn) => {
            btn.disabled = !hasNome;
        });
    }

    function showLookupNotes(notes) {
        const list = Array.isArray(notes) ? notes.filter(Boolean) : [];
        if (!list.length) {
            lookupNotes.hidden = true;
            lookupNotes.textContent = '';
            return;
        }
        lookupNotes.hidden = false;
        lookupNotes.textContent = list.slice(0, 4).join(' ');
    }

    nome.addEventListener('input', syncAssist);
    syncAssist();

    btnGoogle.addEventListener('click', () => {
        const { nome: n, cidade: c } = contextFromFields(nome, cidade);
        if (!n) {
            toast('Escreve o nome primeiro.', true);
            nome.focus();
            return;
        }
        if (!openExternal(googleBusinessSocialSearchUrl(n, c))) {
            toast('Não consegui abrir o browser.', true);
        }
    });

    btnFb.addEventListener('click', () => {
        const { nome: n, cidade: c } = contextFromFields(nome, cidade);
        if (!n && !facebook.value.trim()) {
            toast('Escreve o nome ou o Facebook primeiro.', true);
            nome.focus();
            return;
        }
        const url = facebookOpenUrl(facebook.value, { nome: n, cidade: c });
        if (!openExternal(url)) toast('Não consegui abrir o Facebook.', true);
    });

    btnFbSearch.addEventListener('click', () => {
        const { nome: n, cidade: c } = contextFromFields(nome, cidade);
        if (!n) {
            toast('Escreve o nome primeiro.', true);
            nome.focus();
            return;
        }
        const url = facebookPagesSearchUrl({ nome: n, cidade: c });
        if (!openExternal(url)) toast('Não consegui abrir a pesquisa.', true);
    });

    btnMarket.addEventListener('click', () => {
        const { nome: n, cidade: c } = contextFromFields(nome, cidade);
        const url = facebookMarketplaceSearchUrl({ cidade: c, query: n });
        if (!openExternal(url)) toast('Não consegui abrir o Marketplace.', true);
    });

    btnIg.addEventListener('click', () => {
        const { nome: n, cidade: c } = contextFromFields(nome, cidade);
        if (!n && !instagram.value.trim()) {
            toast('Escreve o nome ou o Instagram primeiro.', true);
            nome.focus();
            return;
        }
        const url = instagramOpenUrl(instagram.value, { nome: n, cidade: c });
        if (!openExternal(url)) toast('Não consegui abrir o Instagram.', true);
    });

    btnCopy.addEventListener('click', async () => {
        const { nome: n, cidade: c } = contextFromFields(nome, cidade);
        const q = copySearchQuery(n, c);
        if (!q) {
            toast('Escreve o nome primeiro.', true);
            nome.focus();
            return;
        }
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(q);
                toast('Pesquisa copiada.');
                return;
            }
        } catch (_) { /* fall through */ }
        toast(`Pesquisa: ${q}`);
    });

    fillBtn.addEventListener('click', async () => {
        const url = maps.value.trim();
        if (!url) {
            toast('Cole o link do Google Maps.', true);
            maps.focus();
            return;
        }
        fillBtn.disabled = true;
        fillBtn.textContent = 'A ler o link…';
        try {
            const { response, data } = await api('/api/digitalizept/maps-lookup', {
                method: 'POST',
                body: { url, nome: nome.value.trim() }
            });
            if (!response.ok) {
                toast((data && data.error) || 'Não consegui ler o link.', true);
                return;
            }
            fillFromLookup(fields, data);
            if (Number.isFinite(data.lat) && Number.isFinite(data.lng)) {
                coordHint.textContent = `Ponto: ${data.lat.toFixed(5)}, ${data.lng.toFixed(5)}`;
            }
            showLookupNotes(data.notes);
            syncAssist();
            toast('Pré-preenchido. Confirma telefone, morada e redes — ou abre Facebook para o email.');
        } catch (_) {
            toast('Erro de rede.', true);
        } finally {
            fillBtn.disabled = false;
            fillBtn.textContent = 'Preencher pelo link';
        }
    });

    form.append(
        hint,
        field('Nome do negócio', nome),
        field('Website (se existir)', website),
        field('Instagram', instagram),
        field('Facebook', facebook),
        assist,
        field('Link Google Maps', mapsRow),
        lookupNotes,
        field('Categoria', typeSelect),
        field('Telefone', telefone),
        field('Email', email),
        field('Morada (opcional)', morada),
        field('Cidade (opcional)', cidade),
        coordHint,
        etapaHint
    );

    if (typeof onPlaceOnMap === 'function') {
        const place = el('button', 'btn-secondary', 'Marcar no mapa');
        place.type = 'button';
        place.addEventListener('click', () => onPlaceOnMap(fields));
        form.appendChild(place);
    }

    const save = el('button', 'btn-primary', 'Criar ficha');
    save.type = 'submit';
    form.appendChild(save);

    function resetForm() {
        nome.value = '';
        website.value = '';
        telefone.value = '';
        email.value = '';
        morada.value = '';
        cidade.value = '';
        instagram.value = '';
        facebook.value = '';
        maps.value = '';
        fields.lat = undefined;
        fields.lng = undefined;
        coordHint.textContent = noPointHint;
        showLookupNotes([]);
        syncAssist();
        nome.focus();
    }

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const payload = {
            nome: nome.value.trim(),
            businessTypeId: typeSelect.value,
            telefone: telefone.value.trim(),
            email: email.value.trim(),
            morada: morada.value.trim(),
            cidade: cidade.value.trim(),
            website_atual: website.value.trim(),
            instagram: instagram.value.trim(),
            facebook: facebook.value.trim(),
            mapsUrl: maps.value.trim(),
            lat: fields.lat,
            lng: fields.lng
        };
        if (!payload.nome) {
            toast('Falta o nome.', true);
            nome.focus();
            return;
        }
        save.disabled = true;
        try {
            const { response, data } = await api('/api/digitalizept/leads/quick', {
                method: 'POST',
                body: payload
            });
            if (!response.ok) {
                toast((data && data.error) || 'Não foi possível criar.', true);
                return;
            }
            toast(data.created === false
                ? 'Já existia esta ficha — atualizada. Pode criar o seguinte.'
                : 'Negócio criado. Pode criar o seguinte.');
            resetForm();
            if (typeof onCreated === 'function') await onCreated(data);
        } catch (_) {
            toast('Erro de rede.', true);
        } finally {
            save.disabled = false;
        }
    });

    panel.appendChild(form);

    if (maps.value.trim() && api) {
        // Prefill from Maps URL when opened from the Porto finder queue.
        fillBtn.click();
    }

    return {
        fields,
        reset: resetForm,
        setPoint(lat, lng) {
            fields.lat = lat;
            fields.lng = lng;
            if (Number.isFinite(lat) && Number.isFinite(lng)) {
                coordHint.textContent = `Ponto no mapa: ${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}`;
            }
        }
    };
}

export { fillFromLookup, CONTACT_KEYS };
