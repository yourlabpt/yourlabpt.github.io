import { getToken } from './auth.js';
import { renderQuickLeadForm } from './admin-quick-lead.js';
import {
    coverageCounts,
    coverageTypeId,
    pinMatchesCoverageFilters
} from './coverage-filters.js';

const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
const PORTUGAL = { lat: 39.55, lng: -8.05, zoom: 7 };

function loadCss(href) {
    if (document.querySelector('link[data-leaflet]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.setAttribute('data-leaflet', '');
    document.head.appendChild(link);
}

function loadScript(src) {
    return new Promise((resolve, reject) => {
        if (window.L) return resolve();
        const script = document.createElement('script');
        script.src = src;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Não foi possível carregar o mapa (OpenStreetMap).'));
        document.head.appendChild(script);
    });
}

function loadLeaflet() {
    loadCss(LEAFLET_CSS);
    return loadScript(LEAFLET_JS);
}

function pinIcon(fill, stroke, strokeWidth, opts = {}) {
    const faded = opts.faded === true;
    const color = fill || '#8e8a84';
    const outline = stroke || '#1b1b1b';
    const width = strokeWidth || 1.2;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36">
      <path fill="${color}" stroke="${outline}" stroke-width="${width}" d="M14 1C7.4 1 2 6.4 2 13c0 9.2 12 21.5 12 21.5S26 22.2 26 13C26 6.4 20.6 1 14 1z"/>
      <circle cx="14" cy="13" r="4.2" fill="#faf8f4"/>
    </svg>`;
    return window.L.divIcon({
        className: faded ? 'coverage-divicon is-parked' : 'coverage-divicon',
        html: svg,
        iconSize: [28, 36],
        iconAnchor: [14, 34],
        popupAnchor: [0, -28]
    });
}

function tagLabel(pin, legend) {
    const etapas = legend?.etapas || (Array.isArray(legend) ? legend : []);
    const resultados = legend?.resultados || [];
    const etapaId = pin.etapa || pin.cobertura || '';
    const resId = pin.resultado || '';
    const etapa = etapas.find((i) => i.id === etapaId)?.label || etapaId;
    const resultado = resultados.find((i) => i.id === resId)?.label || '';
    return resultado ? `${etapa} · ${resultado}` : etapa;
}

export function setupCoverage({
    el,
    api,
    toast,
    openDrawer,
    closeDrawer,
    field,
    inputEl,
    openNotes,
    openFollowup,
    openDossier,
    onUnauthorized
}) {
    let pins = [];
    let legend = { etapas: [], resultados: [] };
    let filterIds = new Set();
    let filterTypes = new Set();
    let map = null;
    let markers = [];
    let placing = false;
    let pendingPoint = null;
    let pendingMarker = null;
    let coordHintEl = null;
    let hasFittedView = false;
    let registeringNewVisit = false;
    let registeringNewBusiness = false;
    let placingKind = 'visit';
    let quickFormApi = null;
    let businessTypes = [];

    function clearPendingMarker() {
        if (pendingMarker && map) {
            map.removeLayer(pendingMarker);
        }
        pendingMarker = null;
        coordHintEl = null;
    }

    function updateCoordHint() {
        if (!coordHintEl || !pendingPoint) return;
        coordHintEl.textContent = `Ponto no mapa: ${Number(pendingPoint.lat).toFixed(5)}, ${Number(pendingPoint.lng).toFixed(5)} — arraste o pin ou toque no mapa para corrigir.`;
    }

    function syncPendingMarker() {
        if (!map || !window.L || !pendingPoint
            || !Number.isFinite(pendingPoint.lat)
            || !Number.isFinite(pendingPoint.lng)) {
            clearPendingMarker();
            return;
        }
        if (!pendingMarker) {
            pendingMarker = window.L.marker([pendingPoint.lat, pendingPoint.lng], {
                icon: pinIcon('#c45c26', '#1b1b1b', 2.4),
                title: 'Novo sítio — arraste para corrigir',
                draggable: true,
                autoPan: true,
                zIndexOffset: 800
            }).addTo(map);
            pendingMarker.on('dragend', () => {
                const pos = pendingMarker.getLatLng();
                pendingPoint = { lat: pos.lat, lng: pos.lng };
                updateCoordHint();
            });
        } else {
            pendingMarker.setLatLng([pendingPoint.lat, pendingPoint.lng]);
        }
        updateCoordHint();
    }

    function invalidateMapSize() {
        if (!map) return;
        setTimeout(() => map.invalidateSize({ animate: false }), 60);
    }

    function typeLabelFor(pin) {
        const id = coverageTypeId(pin);
        if (!id) return '';
        return (businessTypes.find((t) => t.id === id) || {}).nome || id;
    }

    function countFor(map, id) {
        return (map && map.get(id)) || 0;
    }

    function categoryLegendItems(counts) {
        const byType = (counts && counts.byType) || new Map();
        const items = [];
        const seen = new Set();
        businessTypes.forEach((t) => {
            seen.add(t.id);
            const n = countFor(byType, t.id);
            if (!n && !filterTypes.has(t.id)) return;
            items.push({ id: t.id, axis: 'categoria', label: t.nome, count: n });
        });
        byType.forEach((n, id) => {
            if (!id || seen.has(id) || !n) return;
            items.push({ id, axis: 'categoria', label: id, count: n });
        });
        const none = countFor(byType, '');
        if (none || filterTypes.has('')) {
            items.push({ id: '', axis: 'categoria', label: 'Sem categoria', count: none });
        }
        items.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'pt'));
        return items;
    }

    function filtered() {
        const q = (el.coverageFilter.value || '').trim();
        return pins.filter((p) => pinMatchesCoverageFilters(p, {
            filterIds,
            filterTypes,
            query: q,
            typeLabel: typeLabelFor(p)
        }));
    }

    function appendStat(row, n, label) {
        const item = document.createElement('span');
        item.className = 'coverage-stat';
        const num = document.createElement('strong');
        num.textContent = String(n);
        item.append(num, document.createTextNode(` ${label}`));
        row.appendChild(item);
    }

    function renderStats() {
        if (!el.coverageStats) return;
        el.coverageStats.innerHTML = '';
        const all = coverageCounts(pins);
        const shown = coverageCounts(filtered());
        const filtering = filterIds.size || filterTypes.size || (el.coverageFilter.value || '').trim();

        const hero = document.createElement('p');
        hero.className = 'coverage-stats-hero';
        if (filtering && shown.total !== all.total) {
            appendStat(hero, shown.total, 'a mostrar');
            appendStat(hero, all.total, 'no total');
            appendStat(hero, shown.mapped, 'no mapa');
        } else {
            appendStat(hero, all.total, all.total === 1 ? 'sítio' : 'sítios');
            appendStat(hero, all.mapped, 'no mapa');
            appendStat(hero, all.unmapped, 'sem pin');
        }
        el.coverageStats.appendChild(hero);

        const source = filtering && shown.total !== all.total ? shown : all;

        const results = document.createElement('p');
        results.className = 'coverage-stats-row';
        const resultadoItems = [
            ...(legend.resultados || []),
            { id: '', label: 'Sem resultado' }
        ];
        resultadoItems.forEach((item) => {
            const n = countFor(source.byResultado, item.id);
            if (!n) return;
            appendStat(results, n, item.label.toLowerCase());
        });
        if (results.childNodes.length) el.coverageStats.appendChild(results);

        const types = document.createElement('p');
        types.className = 'coverage-stats-row';
        categoryLegendItems(source).forEach((item) => {
            if (!item.count) return;
            appendStat(types, item.count, item.label.toLowerCase());
        });
        if (types.childNodes.length) el.coverageStats.appendChild(types);
    }

    function renderLegend() {
        el.coverageLegend.innerHTML = '';
        const counts = coverageCounts(pins);
        const addGroup = (title, items) => {
            if (!items?.length) return;
            const group = document.createElement('div');
            group.className = 'coverage-legend-group';
            const label = document.createElement('span');
            label.className = 'coverage-legend-title';
            label.textContent = title;
            group.appendChild(label);
            const row = document.createElement('div');
            row.className = 'coverage-legend-row';
            items.forEach((item) => {
                const selected = item.axis === 'categoria'
                    ? filterTypes.has(item.id)
                    : filterIds.has(item.id);
                if (!item.count && !selected && item.axis !== 'resultado') return;
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = `coverage-chip${selected ? ' active' : ''}`;
                const name = document.createElement('span');
                name.textContent = item.label;
                const num = document.createElement('span');
                num.className = 'coverage-chip-count';
                num.textContent = String(item.count || 0);
                btn.append(name, num);
                btn.addEventListener('click', () => {
                    const bucket = item.axis === 'categoria' ? filterTypes : filterIds;
                    if (bucket.has(item.id)) bucket.delete(item.id);
                    else bucket.add(item.id);
                    renderLegend();
                    paint({ preserveView: true });
                });
                row.appendChild(btn);
            });
            if (!row.childNodes.length) return;
            group.appendChild(row);
            el.coverageLegend.appendChild(group);
        };
        addGroup('Categoria', categoryLegendItems(counts));
        addGroup('Resultado', (legend.resultados || []).map((item) => ({
            ...item,
            count: countFor(counts.byResultado, item.id)
        })));
        addGroup('Etapa', (legend.etapas || []).map((item) => ({
            ...item,
            count: countFor(counts.byEtapa, item.id)
        })));
        renderStats();
    }

    function etapaSelect(selected) {
        const select = document.createElement('select');
        select.className = 'field-input';
        (legend.etapas || []).forEach((item) => {
            const opt = document.createElement('option');
            opt.value = item.id;
            opt.textContent = item.label;
            if ((selected || 'visitado') === item.id) opt.selected = true;
            select.appendChild(opt);
        });
        return select;
    }

    function resultadoSelect(selected) {
        const select = document.createElement('select');
        select.className = 'field-input';
        const none = document.createElement('option');
        none.value = '';
        none.textContent = '— (sem resultado)';
        select.appendChild(none);
        (legend.resultados || []).forEach((item) => {
            const opt = document.createElement('option');
            opt.value = item.id;
            opt.textContent = item.label;
            if ((selected || '') === item.id) opt.selected = true;
            select.appendChild(opt);
        });
        return select;
    }

    async function refresh() {
        const { response, data } = await api('/api/digitalizept/coverage');
        if (!response.ok) throw new Error('coverage');
        pins = data.pins || [];
        const raw = data.legend;
        if (raw && !Array.isArray(raw) && (raw.etapas || raw.resultados)) {
            legend = raw;
        } else if (Array.isArray(raw)) {
            legend = { etapas: raw, resultados: [] };
        } else {
            legend = { etapas: [], resultados: [] };
        }
        await loadBusinessTypes();
        renderLegend();
    }

    async function loadBusinessTypes() {
        if (businessTypes.length) return businessTypes;
        const { response, data } = await api('/api/digitalizept/business-types');
        if (response.ok) {
            businessTypes = (data.businessTypes || []).map((t) => ({ id: t.id, nome: t.nome || t.id }));
        }
        if (!businessTypes.some((t) => t.id === 'generico')) {
            businessTypes.unshift({ id: 'generico', nome: 'Genérico' });
        }
        return businessTypes;
    }

    async function openQuickBusiness(defaults = {}) {
        registeringNewBusiness = true;
        registeringNewVisit = false;
        placingKind = 'negocio';
        const types = await loadBusinessTypes();
        if (defaults.lat != null && defaults.lng != null) {
            pendingPoint = { lat: Number(defaults.lat), lng: Number(defaults.lng) };
        }
        const coordText = pendingPoint
            ? `Ponto no mapa: ${pendingPoint.lat.toFixed(5)}, ${pendingPoint.lng.toFixed(5)}`
            : 'Sem ponto ainda — use “Marcar no mapa” ou cole o link do Maps.';
        openDrawer('Novo negócio', (panel) => {
            quickFormApi = renderQuickLeadForm(panel, {
                types,
                defaults: {
                    ...defaults,
                    lat: pendingPoint ? pendingPoint.lat : defaults.lat,
                    lng: pendingPoint ? pendingPoint.lng : defaults.lng
                },
                api,
                toast,
                field,
                inputEl,
                coordText,
                onPlaceOnMap() {
                    placingKind = 'negocio';
                    setPlacing(true);
                    toast('Toque no mapa para fixar o pin.');
                },
                async onCreated(data) {
                    registeringNewBusiness = false;
                    pendingPoint = null;
                    clearPendingMarker();
                    quickFormApi = null;
                    closeDrawer();
                    await refresh();
                    paint({ preserveView: true });
                    if (data && data.leadId && typeof openDossier === 'function') {
                        openDossier(data.leadId);
                    }
                }
            });
            if (pendingPoint && quickFormApi) {
                quickFormApi.setPoint(pendingPoint.lat, pendingPoint.lng);
            }
        }, { dock: true });
    }

    function openVisitForm(defaults = {}) {
        let selectedLeadId = defaults.leadId || '';
        let selectedLeadNome = defaults.leadNome || '';
        let selectedHasDeal = defaults.hasDeal === true;
        let selectedDealEstado = defaults.dealEstado || '';
        const isNew = !defaults.id;
        const dock = isNew;
        registeringNewVisit = isNew;

        if (isNew && defaults.lat != null && defaults.lng != null) {
            pendingPoint = { lat: Number(defaults.lat), lng: Number(defaults.lng) };
        } else if (!isNew) {
            pendingPoint = null;
            clearPendingMarker();
        }

        openDrawer(defaults.id ? 'Visita' : 'Registar visita', (panel) => {
            const form = document.createElement('form');
            form.className = 'admin-form';
            if (defaults.etapa || defaults.cobertura || defaults.resultado) {
                const tagsHint = document.createElement('p');
                tagsHint.className = 'meta';
                tagsHint.textContent = tagLabel(defaults, legend);
                form.appendChild(tagsHint);
            }
            const nome = inputEl('text', defaults.nome || '');
            const morada = inputEl('text', defaults.morada || '');
            const cidade = inputEl('text', defaults.cidade || '');
            const experiencia = inputEl('textarea', defaults.experiencia || '', { rows: 6 });
            experiencia.placeholder = 'Como correu: quem atendeu, horário, objecção, o que tentar da próxima vez…';
            const etapa = etapaSelect(defaults.etapa || defaults.cobertura || 'visitado');
            const resultado = resultadoSelect(defaults.resultado || '');
            form.append(
                field('Nome do sítio', nome),
                field('Morada', morada),
                field('Cidade', cidade),
                field('Etapa', etapa),
                field('Resultado', resultado),
                field('Como correu a visita', experiencia)
            );

            const linkSection = document.createElement('div');
            linkSection.className = 'coverage-link-section';
            const linkTitle = document.createElement('p');
            linkTitle.className = 'field-label';
            linkTitle.textContent = 'Ligar a lead / proposta';
            const linkStatus = document.createElement('p');
            linkStatus.className = 'meta';
            const search = inputEl('search', '', { placeholder: 'Pesquisar lead por nome ou cidade…' });
            const select = document.createElement('select');
            select.className = 'field-input';
            select.size = 5;
            select.style.minHeight = '120px';

            function paintLinkStatus() {
                if (selectedLeadId) {
                    linkStatus.textContent = selectedHasDeal
                        ? `Ligado a: ${selectedLeadNome || selectedLeadId} · com proposta${selectedDealEstado ? ` (${selectedDealEstado})` : ''}`
                        : `Ligado a: ${selectedLeadNome || selectedLeadId}`;
                } else {
                    linkStatus.textContent = 'Sem ficha — Ficha ou Continuar venda cria e liga este pin.';
                }
            }
            paintLinkStatus();

            async function loadLeadOptions(query) {
                const qs = query ? `?q=${encodeURIComponent(query)}` : '';
                const { response, data } = await api(`/api/digitalizept/leads/options${qs}`);
                select.innerHTML = '';
                const none = document.createElement('option');
                none.value = '';
                none.textContent = '— Sem ligação —';
                select.appendChild(none);
                if (!response.ok) return;
                (data.options || []).forEach((opt) => {
                    const o = document.createElement('option');
                    o.value = opt.id;
                    o.textContent = `${opt.nome}${opt.cidade ? ` · ${opt.cidade}` : ''}${opt.hasDeal ? ' · com proposta' : ''}`;
                    if (opt.id === selectedLeadId) o.selected = true;
                    select.appendChild(o);
                });
                if (selectedLeadId && !Array.from(select.options).some((o) => o.value === selectedLeadId)) {
                    const o = document.createElement('option');
                    o.value = selectedLeadId;
                    o.textContent = `${selectedLeadNome || selectedLeadId}${selectedHasDeal ? ' · com proposta' : ''}`;
                    o.selected = true;
                    select.appendChild(o);
                }
            }

            let searchTimer = null;
            search.addEventListener('input', () => {
                clearTimeout(searchTimer);
                searchTimer = setTimeout(() => loadLeadOptions(search.value.trim()), 250);
            });
            select.addEventListener('change', () => {
                selectedLeadId = select.value || '';
                const opt = select.selectedOptions[0];
                selectedLeadNome = selectedLeadId
                    ? String(opt.textContent || '').split(' · ')[0]
                    : '';
                selectedHasDeal = Boolean(opt && /com proposta/.test(opt.textContent || ''));
                selectedDealEstado = '';
                paintLinkStatus();
            });

            linkSection.append(
                linkTitle,
                linkStatus,
                field('Pesquisar', search),
                field('Lead', select)
            );
            form.appendChild(linkSection);

            if (isNew || (defaults.lat != null && defaults.lng != null)) {
                coordHintEl = document.createElement('p');
                coordHintEl.className = 'meta';
                const lat = pendingPoint ? pendingPoint.lat : defaults.lat;
                const lng = pendingPoint ? pendingPoint.lng : defaults.lng;
                if (lat != null && lng != null) {
                    coordHintEl.textContent = isNew
                        ? `Ponto no mapa: ${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)} — arraste o pin ou toque no mapa para corrigir.`
                        : `Ponto no mapa: ${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)} — pode arrastar o pin no mapa para corrigir.`;
                } else {
                    coordHintEl.textContent = 'Sem ponto ainda — use “Marcar no mapa” ou preencha a morada.';
                }
                form.appendChild(coordHintEl);
            }
            function currentVisitPayload() {
                const payload = {
                    nome: nome.value.trim(),
                    morada: morada.value.trim(),
                    cidade: cidade.value.trim(),
                    etapa: etapa.value,
                    resultado: resultado.value || '',
                    experiencia: experiencia.value.trim(),
                    leadId: selectedLeadId || null
                };
                const lat = pendingPoint?.lat ?? defaults.lat;
                const lng = pendingPoint?.lng ?? defaults.lng;
                if (lat != null && lng != null) {
                    payload.lat = lat;
                    payload.lng = lng;
                }
                return payload;
            }

            async function persistVisit(payload) {
                const path = defaults.id
                    ? `/api/digitalizept/visits/${defaults.id}`
                    : '/api/digitalizept/visits';
                return api(path, {
                    method: defaults.id ? 'PATCH' : 'POST',
                    body: payload
                });
            }

            async function connectFicha() {
                const payload = currentVisitPayload();
                if (!payload.nome) {
                    return { error: 'Indique o nome do sítio.' };
                }
                const saved = await persistVisit(payload);
                if (!saved.response.ok) {
                    return { error: saved.data.error || 'Não foi possível guardar a visita.' };
                }
                const visit = saved.data.visit || {};
                if (visit.id) defaults.id = visit.id;
                const linked = selectedLeadId || visit.leadId;
                if (linked) {
                    return { leadId: linked, created: false };
                }
                if (!defaults.id) {
                    return { error: 'Não foi possível guardar a visita.' };
                }
                const created = await api(`/api/digitalizept/visits/${encodeURIComponent(defaults.id)}/lead`, {
                    method: 'POST'
                });
                if (!created.response.ok) {
                    return { error: created.data.error || 'Não foi possível criar a ficha.' };
                }
                return {
                    leadId: created.data.leadId,
                    created: created.data.created === true
                };
            }

            const save = document.createElement('button');
            save.type = 'submit';
            save.className = 'btn-primary';
            save.textContent = defaults.id ? 'Guardar visita' : 'Guardar no mapa';
            form.appendChild(save);
            form.addEventListener('submit', async (event) => {
                event.preventDefault();
                save.disabled = true;
                const { response, data } = await persistVisit(currentVisitPayload());
                save.disabled = false;
                if (!response.ok) {
                    toast(data.error || 'Falha.', true);
                    return;
                }
                toast('Visita guardada.');
                registeringNewVisit = false;
                pendingPoint = null;
                clearPendingMarker();
                const linkedLeadId = selectedLeadId || defaults.leadId || (data.visit && data.visit.leadId);
                closeDrawer();
                await refresh();
                paint({ preserveView: true });
                if (linkedLeadId) {
                    const leadPin = pins.find((p) => p.kind === 'lead' && p.id === linkedLeadId);
                    if (leadPin) openLeadPin(leadPin);
                }
            });
            panel.appendChild(form);

            const actions = document.createElement('div');
            actions.className = 'coverage-pin-actions';
            const ficha = document.createElement('button');
            ficha.type = 'button';
            ficha.className = 'btn-primary';
            ficha.textContent = 'Ficha';
            const resume = document.createElement('button');
            resume.type = 'button';
            resume.className = 'btn-secondary';
            resume.textContent = 'Continuar venda';
            const connectBusy = [];
            function setConnectBusy(on) {
                connectBusy.forEach((btn) => {
                    btn.disabled = on;
                });
            }
            async function runConnect({ openFicha, resumeSale }) {
                setConnectBusy(true);
                try {
                    const result = await connectFicha();
                    if (result.error) {
                        toast(result.error, true);
                        return;
                    }
                    toast(result.created ? 'Ficha criada e ligada a este pin.' : 'Ficha ligada.');
                    registeringNewVisit = false;
                    pendingPoint = null;
                    clearPendingMarker();
                    closeDrawer();
                    if (resumeSale) {
                        window.location.href = `./?resume=${encodeURIComponent(result.leadId)}`;
                        return;
                    }
                    await refresh();
                    paint({ preserveView: true });
                    if (openFicha && typeof openDossier === 'function') {
                        openDossier(result.leadId);
                        return;
                    }
                    const leadPin = pins.find((p) => p.kind === 'lead' && p.id === result.leadId);
                    if (leadPin) openLeadPin(leadPin);
                } catch (_) {
                    toast('Erro de rede.', true);
                } finally {
                    setConnectBusy(false);
                }
            }
            ficha.addEventListener('click', () => runConnect({ openFicha: true }));
            resume.addEventListener('click', () => runConnect({ resumeSale: true }));
            const openLead = document.createElement('button');
            openLead.type = 'button';
            openLead.className = 'btn-secondary';
            openLead.textContent = 'Abrir lead no mapa';
            openLead.addEventListener('click', () => {
                const id = selectedLeadId || defaults.leadId;
                if (!id) return;
                const leadPin = pins.find((p) => p.kind === 'lead' && p.id === id);
                if (leadPin) openLeadPin(leadPin);
                else toast('Lead ainda não está no mapa — guarde a visita e actualize.', true);
            });
            const clearLink = document.createElement('button');
            clearLink.type = 'button';
            clearLink.className = 'btn-secondary';
            clearLink.textContent = 'Remover ligação';
            clearLink.addEventListener('click', () => {
                selectedLeadId = '';
                selectedLeadNome = '';
                selectedHasDeal = false;
                selectedDealEstado = '';
                select.value = '';
                paintLinkStatus();
                paintLinkActions();
            });
            function paintLinkActions() {
                const id = selectedLeadId || '';
                openLead.hidden = !id;
                clearLink.hidden = !id;
            }
            paintLinkActions();
            select.addEventListener('change', () => paintLinkActions());
            connectBusy.push(ficha, resume, save);
            actions.append(ficha, resume, openLead, clearLink);
            if (defaults.id) {
                const geo = document.createElement('button');
                geo.type = 'button';
                geo.className = 'btn-secondary';
                geo.textContent = 'Localizar pela morada';
                geo.addEventListener('click', async () => {
                    geo.disabled = true;
                    const { response, data } = await api(`/api/digitalizept/visits/${defaults.id}/geocode`, {
                        method: 'POST'
                    });
                    geo.disabled = false;
                    if (!response.ok) {
                        toast(data.error || 'Não encontrei o sítio. Marque no mapa.', true);
                        return;
                    }
                    toast('Ponto actualizado.');
                    closeDrawer();
                    await refresh();
                    paint({ preserveView: true });
                });
                const del = document.createElement('button');
                del.type = 'button';
                del.className = 'btn-secondary';
                del.textContent = 'Apagar visita';
                del.addEventListener('click', async () => {
                    if (!window.confirm('Apagar este sítio do mapa?')) return;
                    const { response, data } = await api(`/api/digitalizept/visits/${defaults.id}`, {
                        method: 'DELETE'
                    });
                    if (!response.ok) {
                        toast(data.error || 'Falha.', true);
                        return;
                    }
                    toast('Visita apagada.');
                    closeDrawer();
                    await refresh();
                    paint({ preserveView: true });
                });
                actions.append(geo, del);
            }
            panel.appendChild(actions);
            loadLeadOptions('').catch(() => {});
            if (isNew) syncPendingMarker();
        }, { dock });
    }

    function openLeadPin(pin) {
        openDrawer(pin.nome || 'Negócio', (panel) => {
            const tagsLine = document.createElement('p');
            tagsLine.className = 'meta';
            tagsLine.textContent = tagLabel(pin, legend) || 'Etapa por definir';
            panel.appendChild(tagsLine);
            const meta = document.createElement('p');
            meta.className = 'meta';
            meta.textContent = `${pin.morada || '—'}${pin.cidade ? `, ${pin.cidade}` : ''} · ${typeLabelFor(pin) || 'sem categoria'}`;
            panel.appendChild(meta);
            if (pin.hasDeal) {
                const deal = document.createElement('p');
                deal.className = 'meta';
                deal.textContent = `Proposta: ${pin.dealEstado || 'fechada'}`;
                panel.appendChild(deal);
            }
            const visitaIds = Array.isArray(pin.visitaIds) ? pin.visitaIds : [];
            const visits = Array.isArray(pin.visits) ? pin.visits : [];
            if (visits.length || visitaIds.length) {
                const linkMeta = document.createElement('p');
                linkMeta.className = 'meta';
                linkMeta.textContent = `${visits.length || visitaIds.length} visita(s) de rua neste sítio (mesmo pin)`;
                panel.appendChild(linkMeta);
                visits.forEach((v) => {
                    if (!v.experiencia) return;
                    const prev = document.createElement('p');
                    prev.className = 'meta';
                    const when = v.visitado_em
                        ? new Date(v.visitado_em).toLocaleDateString('pt-PT')
                        : '';
                    prev.textContent = when
                        ? `${when}: ${v.experiencia}`
                        : v.experiencia;
                    panel.appendChild(prev);
                });
            }
            if (pin.experiencia && !visits.length) {
                const prev = document.createElement('p');
                prev.className = 'meta';
                prev.textContent = pin.experiencia;
                panel.appendChild(prev);
            }
            if (pin.notas) {
                const prev = document.createElement('p');
                prev.className = 'meta';
                prev.textContent = pin.notas;
                panel.appendChild(prev);
            }
            const form = document.createElement('form');
            form.className = 'admin-form';
            const etapa = etapaSelect(pin.etapa || pin.cobertura || 'contacto_remoto');
            const resultado = resultadoSelect(pin.resultado || '');
            const experiencia = inputEl('textarea', '', { rows: 4 });
            experiencia.placeholder = 'Como correu nesta visita…';
            form.append(
                field('Etapa', etapa),
                field('Resultado', resultado),
                field('Como correu (acrescenta uma nota)', experiencia)
            );
            const save = document.createElement('button');
            save.type = 'submit';
            save.className = 'btn-primary';
            save.textContent = 'Guardar';
            form.appendChild(save);
            form.addEventListener('submit', async (event) => {
                event.preventDefault();
                const body = {
                    etapa: etapa.value,
                    resultado: resultado.value || ''
                };
                if (experiencia.value.trim()) body.experiencia = experiencia.value.trim();
                const { response, data } = await api(`/api/digitalizept/leads/${pin.id}`, {
                    method: 'PATCH',
                    body
                });
                if (!response.ok) {
                    toast(data.error || 'Falha.', true);
                    return;
                }
                toast('Cobertura actualizada.');
                closeDrawer();
                await refresh();
                paint({ preserveView: true });
            });
            panel.appendChild(form);
            const actions = document.createElement('div');
            actions.className = 'coverage-pin-actions';
            if (typeof openDossier === 'function') {
                const ficha = document.createElement('button');
                ficha.type = 'button';
                ficha.className = 'btn-primary';
                ficha.textContent = 'Ficha';
                ficha.addEventListener('click', () => {
                    closeDrawer();
                    openDossier(pin.id);
                });
                actions.appendChild(ficha);
            }
            const resume = document.createElement('a');
            resume.className = 'btn-secondary';
            resume.href = `./?resume=${encodeURIComponent(pin.id)}`;
            resume.textContent = pin.estado === 'fechado' ? 'Editar proposta' : 'Continuar venda';
            actions.appendChild(resume);
            if (pin.demo_slug) {
                const demo = document.createElement('a');
                demo.className = 'btn-secondary';
                demo.href = `/d/${pin.demo_slug}`;
                demo.target = '_blank';
                demo.rel = 'noopener';
                demo.textContent = 'Abrir demo';
                actions.appendChild(demo);
            }
            const createVisit = document.createElement('button');
            createVisit.type = 'button';
            createVisit.className = 'btn-secondary';
            createVisit.textContent = 'Acrescentar visita neste sítio';
            createVisit.addEventListener('click', async () => {
                createVisit.disabled = true;
                try {
                    const { response, data } = await api(`/api/digitalizept/leads/${encodeURIComponent(pin.id)}/visits`, {
                        method: 'POST',
                        body: {}
                    });
                    if (!response.ok) {
                        toast(data.error || 'Não foi possível criar a visita.', true);
                        return;
                    }
                    toast('Visita acrescentada — continua no mesmo pin.');
                    await refresh();
                    paint({ preserveView: true });
                    const updated = pins.find((p) => p.kind === 'lead' && p.id === pin.id) || pin;
                    openLeadPin(updated);
                    // Open visit form only to fill experiência; save returns to unified lead.
                    if (data.visit) openVisitForm({ ...data.visit, kind: 'visita', leadId: pin.id });
                } catch (_) {
                    toast('Erro de rede.', true);
                } finally {
                    createVisit.disabled = false;
                }
            });
            const regeo = document.createElement('button');
            regeo.type = 'button';
            regeo.className = 'btn-secondary';
            regeo.textContent = Number.isFinite(pin.lat) ? 'Relocalizar pela morada' : 'Localizar pela morada';
            regeo.addEventListener('click', async () => {
                regeo.disabled = true;
                const { response, data } = await api(`/api/digitalizept/leads/${pin.id}/geocode`, { method: 'POST' });
                regeo.disabled = false;
                if (!response.ok) {
                    toast(data.error || 'Não encontrei o sítio. Arraste o pin ou use “Marcar no mapa”.', true);
                    return;
                }
                toast('Coordenadas actualizadas a partir da morada.');
                closeDrawer();
                await refresh();
                paint({ preserveView: true });
            });
            const emailPin = document.createElement('button');
            emailPin.type = 'button';
            emailPin.className = 'btn-secondary';
            emailPin.textContent = 'Email + pin pela morada';
            emailPin.addEventListener('click', async () => {
                emailPin.disabled = true;
                try {
                    const { response, data } = await api(`/api/digitalizept/leads/${encodeURIComponent(pin.id)}/geocode`, {
                        method: 'POST'
                    });
                    if (!response.ok) {
                        toast(data.error || 'Não consegui fixar o pin pela morada.', true);
                    } else {
                        toast('Pin actualizado pela morada.');
                        await refresh();
                        paint({ preserveView: true });
                    }
                    // Open admin follow-up drawer for email if available on parent.
                    if (typeof openFollowup === 'function') {
                        openFollowup({ leadId: pin.id, nome: pin.nome, demo_slug: pin.demo_slug });
                    } else {
                        toast('Abra “Enviar demonstração” no lead para o email.', false);
                    }
                } catch (_) {
                    toast('Erro de rede.', true);
                } finally {
                    emailPin.disabled = false;
                }
            });
            const notes = document.createElement('button');
            notes.type = 'button';
            notes.className = 'btn-secondary';
            notes.textContent = 'Comentários';
            notes.addEventListener('click', () => openNotes({ id: pin.id, nome: pin.nome }));
            const tip = document.createElement('p');
            tip.className = 'meta';
            tip.style.marginTop = '10px';
            tip.textContent = Number.isFinite(pin.lat)
                ? 'Um sítio = um pin. Visitas de rua ficam ligadas aqui, sem duplicar no mapa.'
                : 'Sem pin — use “Localizar pela morada”, “Email + pin”, ou “Marcar no mapa”.';
            actions.append(createVisit, regeo, emailPin, notes);
            panel.append(actions, tip);
        });
    }

    function openPin(pin) {
        if (pin.kind === 'visita') openVisitForm(pin);
        else openLeadPin(pin);
    }

    async function focusLead(leadId) {
        await ensure();
        const pin = pins.find((p) => p.kind === 'lead' && p.id === leadId);
        if (!pin) {
            toast('Lead não encontrado no mapa.', true);
            return false;
        }
        if (Number.isFinite(pin.lat) && Number.isFinite(pin.lng) && map) {
            map.setView([pin.lat, pin.lng], 16);
        }
        openLeadPin(pin);
        return true;
    }

    async function openOrCreateVisitForLead(leadId) {
        await ensure();
        const leadPin = pins.find((p) => p.kind === 'lead' && p.id === leadId);
        if (!leadPin) {
            toast('Lead não encontrado no mapa.', true);
            return false;
        }
        if (!(Number.isFinite(leadPin.lat) && Number.isFinite(leadPin.lng))
            && (leadPin.morada || leadPin.cidade)) {
            const { response } = await api(`/api/digitalizept/leads/${encodeURIComponent(leadId)}/geocode`, {
                method: 'POST'
            });
            if (response.ok) {
                await refresh();
                paint({ preserveView: true });
            }
        }
        const updated = pins.find((p) => p.kind === 'lead' && p.id === leadId) || leadPin;
        if (Number.isFinite(updated.lat) && Number.isFinite(updated.lng) && map) {
            map.setView([updated.lat, updated.lng], 16);
        }
        openLeadPin(updated);
        return true;
    }

    async function savePinPosition(pin, lat, lng) {
        const path = pin.kind === 'visita'
            ? `/api/digitalizept/visits/${encodeURIComponent(pin.id)}`
            : `/api/digitalizept/leads/${encodeURIComponent(pin.id)}`;
        const { response, data } = await api(path, {
            method: 'PATCH',
            body: { lat, lng }
        });
        if (!response.ok) {
            toast((data && data.error) || 'Não foi possível guardar a nova posição.', true);
            return false;
        }
        pin.lat = lat;
        pin.lng = lng;
        pin.geocode_status = 'manual';
        return true;
    }

    function offerPinMoveUndo(pin, prevLat, prevLng) {
        toast('Pin actualizado no mapa.', false, {
            duration: 10000,
            actionLabel: 'Desfazer',
            onAction: async () => {
                const ok = await savePinPosition(pin, prevLat, prevLng);
                if (!ok) return;
                toast('Posição anterior restaurada.');
                paint({ preserveView: true });
            }
        });
    }

    function paint(opts = {}) {
        if (!map || !window.L) return;
        const preserveView = opts.preserveView === true || hasFittedView;
        markers.forEach((m) => map.removeLayer(m));
        markers = [];
        const shown = filtered();
        const mapped = shown
            .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
            .sort((a, b) => Number(Boolean(b.faded)) - Number(Boolean(a.faded)));
        const unmapped = shown
            .filter((p) => !(Number.isFinite(p.lat) && Number.isFinite(p.lng)))
            .sort((a, b) => Number(Boolean(a.faded || a.resultado === 'sem_interesse'))
                - Number(Boolean(b.faded || b.resultado === 'sem_interesse')));
        const bounds = window.L.latLngBounds([]);
        mapped.forEach((pin) => {
            const marker = window.L.marker([pin.lat, pin.lng], {
                icon: pinIcon(pin.color, pin.strokeColor, pin.strokeWidth, { faded: pin.faded }),
                title: `${pin.nome || ''} — ${tagLabel(pin, legend)}`,
                draggable: !placing && !registeringNewVisit,
                autoPan: true,
                zIndexOffset: pin.faded ? (pin.zIndexOffset || -80) : 0,
                opacity: 1
            }).addTo(map);
            marker.on('click', () => {
                if (placing || registeringNewVisit) return;
                openPin(pin);
            });
            let dragOrigin = null;
            marker.on('dragstart', () => {
                const ll = marker.getLatLng();
                dragOrigin = { lat: ll.lat, lng: ll.lng };
            });
            marker.on('dragend', async () => {
                const pos = marker.getLatLng();
                const prev = dragOrigin;
                dragOrigin = null;
                if (prev
                    && Math.abs(prev.lat - pos.lat) < 1e-8
                    && Math.abs(prev.lng - pos.lng) < 1e-8) {
                    return;
                }
                const ok = await savePinPosition(pin, pos.lat, pos.lng);
                if (!ok) {
                    if (prev) marker.setLatLng([prev.lat, prev.lng]);
                    return;
                }
                if (prev) offerPinMoveUndo(pin, prev.lat, prev.lng);
                else toast('Pin actualizado no mapa.');
            });
            markers.push(marker);
            bounds.extend([pin.lat, pin.lng]);
        });
        syncPendingMarker();
        el.coverageStatus.textContent = placing
            ? 'Toque no mapa para marcar o sítio visitado (o zoom actual mantém-se).'
            : (registeringNewVisit
                ? 'A preencher visita — pode pan/zoom e corrigir o pin laranja.'
                : (mapped.length
                    ? `${mapped.length} no mapa · arraste um pin${unmapped.length ? ` · ${unmapped.length} sem ponto` : ''}`
                    : (unmapped.length ? `${unmapped.length} sítios sem ponto no mapa.` : 'Sem sítios para mostrar.')));
        renderStats();

        if (el.coverageUnmapped) {
            el.coverageUnmapped.innerHTML = '';
            unmapped.slice(0, 40).forEach((pin) => {
                const card = document.createElement('article');
                const parked = pin.faded || pin.resultado === 'sem_interesse';
                card.className = parked ? 'admin-card parked' : 'admin-card';
                card.innerHTML = `
                    <h3>${pin.nome || 'Sem nome'}</h3>
                    <p class="meta">${pin.morada || '—'}${pin.cidade ? `, ${pin.cidade}` : ''} · ${typeLabelFor(pin) || 'sem categoria'} · ${tagLabel(pin, legend)} · ${pin.kind === 'visita' ? 'visita' : 'lead'} · sem pin${pin.leadNome ? ` · → ${pin.leadNome}` : ''}${pin.visitaCount ? ` · ${pin.visitaCount} visita(s)` : ''}</p>
                `;
                const actions = document.createElement('div');
                actions.className = 'actions';
                const open = document.createElement('button');
                open.type = 'button';
                open.className = 'btn-secondary';
                open.textContent = 'Abrir';
                open.addEventListener('click', () => openPin(pin));
                actions.appendChild(open);
                card.appendChild(actions);
                el.coverageUnmapped.appendChild(card);
            });
        }

        if (!preserveView) {
            if (mapped.length === 1) {
                map.setView([mapped[0].lat, mapped[0].lng], 15);
            } else if (mapped.length > 1) {
                map.fitBounds(bounds.pad(0.12));
            } else {
                map.setView([PORTUGAL.lat, PORTUGAL.lng], PORTUGAL.zoom);
            }
            hasFittedView = true;
        }
    }

    function setPlacing(on) {
        if (on) {
            registeringNewVisit = false;
            pendingPoint = null;
            clearPendingMarker();
            if (el.drawer && !el.drawer.classList.contains('hidden')) {
                closeDrawer();
            }
        }
        placing = on;
        if (el.coveragePlaceBtn) {
            el.coveragePlaceBtn.classList.toggle('active', on);
            el.coveragePlaceBtn.textContent = on ? 'A marcar… toque no mapa' : 'Marcar no mapa';
        }
        if (map) map.getContainer().style.cursor = on ? 'crosshair' : '';
        paint({ preserveView: true });
    }

    async function ensure() {
        await loadLeaflet();
        await refresh();
        if (!map) {
            map = window.L.map(el.coverageMap, { zoomControl: true }).setView(
                [PORTUGAL.lat, PORTUGAL.lng],
                PORTUGAL.zoom
            );
            window.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 19,
                attribution: '&copy; OpenStreetMap'
            }).addTo(map);
            map.on('click', (event) => {
                if (placing) {
                    pendingPoint = { lat: event.latlng.lat, lng: event.latlng.lng };
                    setPlacing(false);
                    if (placingKind === 'negocio') {
                        if (quickFormApi) {
                            quickFormApi.setPoint(pendingPoint.lat, pendingPoint.lng);
                            syncPendingMarker();
                        } else {
                            openQuickBusiness(pendingPoint);
                        }
                    } else {
                        openVisitForm(pendingPoint);
                    }
                    return;
                }
                if (registeringNewVisit || registeringNewBusiness) {
                    pendingPoint = { lat: event.latlng.lat, lng: event.latlng.lng };
                    syncPendingMarker();
                    if (registeringNewBusiness && quickFormApi) {
                        quickFormApi.setPoint(pendingPoint.lat, pendingPoint.lng);
                    }
                }
            });
        }
        invalidateMapSize();
        paint({ preserveView: hasFittedView });
    }

    async function downloadExport() {
        try {
            const response = await fetch('/api/digitalizept/coverage/export', {
                headers: { 'x-admin-token': getToken() }
            });
            if (response.status === 401) {
                if (typeof onUnauthorized === 'function') onUnauthorized();
                return;
            }
            if (!response.ok) throw new Error('export');
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `cobertura-digitalizept-${new Date().toISOString().slice(0, 10)}.txt`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 2000);
        } catch (_) {
            toast('Não foi possível descarregar o texto.', true);
        }
    }

    if (el.coverageAddBtn) {
        el.coverageAddBtn.addEventListener('click', () => openVisitForm({}));
    }
    if (el.coverageAddLeadBtn) {
        el.coverageAddLeadBtn.addEventListener('click', () => openQuickBusiness({}));
    }
    if (el.coveragePlaceBtn) {
        el.coveragePlaceBtn.addEventListener('click', () => {
            if (!registeringNewBusiness) placingKind = 'visit';
            setPlacing(!placing);
        });
    }
    if (el.coverageExportBtn) {
        el.coverageExportBtn.addEventListener('click', () => downloadExport());
    }

    return {
        ensure,
        refresh,
        repaint: (opts) => paint({ preserveView: true, ...(opts || {}) }),
        focusLead,
        openOrCreateVisitForLead,
        onDrawerDocked() {
            invalidateMapSize();
            syncPendingMarker();
        },
        onDrawerClosed() {
            registeringNewVisit = false;
            registeringNewBusiness = false;
            quickFormApi = null;
            if (!placing) {
                pendingPoint = null;
                clearPendingMarker();
            }
            invalidateMapSize();
            paint({ preserveView: true });
        }
    };
}
