import { getToken } from './auth.js';

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

function pinIcon(color) {
    const fill = color || '#a9a8a3';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36">
      <path fill="${fill}" stroke="#1b1b1b" stroke-width="1.2" d="M14 1C7.4 1 2 6.4 2 13c0 9.2 12 21.5 12 21.5S26 22.2 26 13C26 6.4 20.6 1 14 1z"/>
      <circle cx="14" cy="13" r="4.2" fill="#faf8f4"/>
    </svg>`;
    return window.L.divIcon({
        className: 'coverage-divicon',
        html: svg,
        iconSize: [28, 36],
        iconAnchor: [14, 34],
        popupAnchor: [0, -28]
    });
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
    onUnauthorized
}) {
    let pins = [];
    let legend = [];
    let filterIds = new Set();
    let map = null;
    let markers = [];
    let placing = false;
    let pendingPoint = null;

    function filtered() {
        const q = (el.coverageFilter.value || '').trim().toLowerCase();
        return pins.filter((p) => {
            if (filterIds.size && !filterIds.has(p.cobertura || 'contacto')) return false;
            if (!q) return true;
            return `${p.nome} ${p.morada || ''} ${p.cidade || ''} ${p.experiencia || ''} ${p.notas || ''} ${p.leadNome || ''}`
                .toLowerCase()
                .includes(q);
        });
    }

    function renderLegend() {
        el.coverageLegend.innerHTML = '';
        legend.forEach((item) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `coverage-chip${filterIds.has(item.id) ? ' active' : ''}`;
            const dot = document.createElement('span');
            dot.className = 'coverage-chip-dot';
            dot.style.background = item.color;
            btn.append(dot, document.createTextNode(item.label));
            btn.addEventListener('click', () => {
                if (filterIds.has(item.id)) filterIds.delete(item.id);
                else filterIds.add(item.id);
                renderLegend();
                paint();
            });
            el.coverageLegend.appendChild(btn);
        });
    }

    function coberturaSelect(selected) {
        const select = document.createElement('select');
        select.className = 'field-input';
        legend.forEach((item) => {
            const opt = document.createElement('option');
            opt.value = item.id;
            opt.textContent = item.label;
            if ((selected || 'visitado') === item.id) opt.selected = true;
            select.appendChild(opt);
        });
        return select;
    }

    async function refresh() {
        const { response, data } = await api('/api/digitalizept/coverage');
        if (!response.ok) throw new Error('coverage');
        pins = data.pins || [];
        legend = data.legend || [];
        renderLegend();
    }

    function openVisitForm(defaults = {}) {
        let selectedLeadId = defaults.leadId || '';
        let selectedLeadNome = defaults.leadNome || '';
        let selectedHasDeal = defaults.hasDeal === true;
        let selectedDealEstado = defaults.dealEstado || '';

        openDrawer(defaults.id ? 'Visita' : 'Registar visita', (panel) => {
            const form = document.createElement('form');
            form.className = 'admin-form';
            const nome = inputEl('text', defaults.nome || '');
            const morada = inputEl('text', defaults.morada || '');
            const cidade = inputEl('text', defaults.cidade || '');
            const experiencia = inputEl('textarea', defaults.experiencia || '', { rows: 6 });
            experiencia.placeholder = 'Como correu: quem atendeu, horário, objecção, o que tentar da próxima vez…';
            const cobertura = coberturaSelect(defaults.cobertura || 'visitado');
            form.append(
                field('Nome do sítio', nome),
                field('Morada', morada),
                field('Cidade', cidade),
                field('Desfecho', cobertura),
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
                    linkStatus.textContent = 'Sem ligação — escolha um lead abaixo (opcional).';
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

            if (defaults.lat != null && defaults.lng != null) {
                const hint = document.createElement('p');
                hint.className = 'meta';
                hint.textContent = `Ponto no mapa: ${Number(defaults.lat).toFixed(5)}, ${Number(defaults.lng).toFixed(5)} — pode arrastar o pin no mapa para corrigir.`;
                form.appendChild(hint);
            }
            const save = document.createElement('button');
            save.type = 'submit';
            save.className = 'btn-primary';
            save.textContent = defaults.id ? 'Guardar visita' : 'Guardar no mapa';
            form.appendChild(save);
            form.addEventListener('submit', async (event) => {
                event.preventDefault();
                save.disabled = true;
                const payload = {
                    nome: nome.value.trim(),
                    morada: morada.value.trim(),
                    cidade: cidade.value.trim(),
                    cobertura: cobertura.value,
                    experiencia: experiencia.value.trim(),
                    leadId: selectedLeadId || null
                };
                if (defaults.lat != null && defaults.lng != null) {
                    payload.lat = defaults.lat;
                    payload.lng = defaults.lng;
                }
                const path = defaults.id
                    ? `/api/digitalizept/visits/${defaults.id}`
                    : '/api/digitalizept/visits';
                const { response, data } = await api(path, {
                    method: defaults.id ? 'PATCH' : 'POST',
                    body: payload
                });
                save.disabled = false;
                if (!response.ok) {
                    toast(data.error || 'Falha.', true);
                    return;
                }
                toast('Visita guardada.');
                closeDrawer();
                pendingPoint = null;
                await refresh();
                paint();
            });
            panel.appendChild(form);

            const actions = document.createElement('div');
            actions.className = 'coverage-pin-actions';
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
            const resume = document.createElement('a');
            resume.className = 'btn-secondary';
            resume.textContent = 'Continuar venda';
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
                resume.hidden = !id;
                clearLink.hidden = !id;
                if (id) resume.href = `./?resume=${encodeURIComponent(id)}`;
            }
            paintLinkActions();
            select.addEventListener('change', () => paintLinkActions());
            actions.append(openLead, resume, clearLink);
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
                    paint();
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
                    paint();
                });
                actions.append(geo, del);
            }
            panel.appendChild(actions);
            loadLeadOptions('').catch(() => {});
        });
    }

    function openLeadPin(pin) {
        openDrawer(pin.nome || 'Negócio', (panel) => {
            const meta = document.createElement('p');
            meta.className = 'meta';
            meta.textContent = `${pin.morada || '—'}${pin.cidade ? `, ${pin.cidade}` : ''} · ${pin.business_type || '—'}`;
            panel.appendChild(meta);
            if (pin.hasDeal) {
                const deal = document.createElement('p');
                deal.className = 'meta';
                deal.textContent = `Proposta: ${pin.dealEstado || 'fechada'}`;
                panel.appendChild(deal);
            }
            const visitaIds = Array.isArray(pin.visitaIds) ? pin.visitaIds : [];
            if (visitaIds.length) {
                const linkMeta = document.createElement('p');
                linkMeta.className = 'meta';
                linkMeta.textContent = `${visitaIds.length} visita(s) de rua ligada(s)`;
                panel.appendChild(linkMeta);
                visitaIds.forEach((vid) => {
                    const visitPin = pins.find((p) => p.kind === 'visita' && p.id === vid);
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'btn-secondary';
                    btn.style.width = '100%';
                    btn.style.marginBottom = '6px';
                    btn.textContent = visitPin
                        ? `Abrir visita: ${visitPin.nome || vid.slice(0, 8)}`
                        : `Abrir visita ${vid.slice(0, 8)}`;
                    btn.addEventListener('click', () => {
                        if (visitPin) openVisitForm(visitPin);
                        else toast('Visita não encontrada no mapa.', true);
                    });
                    panel.appendChild(btn);
                });
            }
            if (pin.notas) {
                const prev = document.createElement('p');
                prev.className = 'meta';
                prev.textContent = pin.notas;
                panel.appendChild(prev);
            }
            const form = document.createElement('form');
            form.className = 'admin-form';
            const cobertura = coberturaSelect(pin.cobertura || 'contacto');
            const experiencia = inputEl('textarea', '', { rows: 4 });
            experiencia.placeholder = 'Como correu nesta visita…';
            form.append(
                field('Desfecho na rua', cobertura),
                field('Como correu (acrescenta uma nota)', experiencia)
            );
            const save = document.createElement('button');
            save.type = 'submit';
            save.className = 'btn-primary';
            save.textContent = 'Guardar';
            form.appendChild(save);
            form.addEventListener('submit', async (event) => {
                event.preventDefault();
                const body = { cobertura: cobertura.value };
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
                paint();
            });
            panel.appendChild(form);
            const actions = document.createElement('div');
            actions.className = 'coverage-pin-actions';
            const resume = document.createElement('a');
            resume.className = 'btn-primary';
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
            createVisit.textContent = 'Registar visita neste sítio';
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
                    toast('Visita criada e ligada a este lead.');
                    await refresh();
                    paint();
                    openVisitForm(data.visit || { ...pin, kind: 'visita', leadId: pin.id, id: data.visit && data.visit.id });
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
                toast('Coordenadas actualizadas a partir da morada (OpenStreetMap).');
                closeDrawer();
                await refresh();
                paint();
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
                ? 'Para corrigir o sítio: arraste o pin no mapa. Pode também registar uma visita de rua ligada.'
                : 'Sem pin — use “Localizar pela morada” ou “Marcar no mapa”.';
            actions.append(createVisit, regeo, notes);
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
        const linked = pins.filter((p) => p.kind === 'visita' && p.leadId === leadId);
        if (linked.length) {
            if (Number.isFinite(linked[0].lat) && Number.isFinite(linked[0].lng) && map) {
                map.setView([linked[0].lat, linked[0].lng], 16);
            }
            openVisitForm(linked[0]);
            return true;
        }
        if (leadPin && Number.isFinite(leadPin.lat) && Number.isFinite(leadPin.lng)) {
            openLeadPin(leadPin);
            return true;
        }
        const { response, data } = await api(`/api/digitalizept/leads/${encodeURIComponent(leadId)}/visits`, {
            method: 'POST',
            body: {}
        });
        if (!response.ok) {
            toast((data && data.error) || 'Não foi possível criar a visita.', true);
            return false;
        }
        await refresh();
        paint();
        openVisitForm(data.visit);
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
        toast('Pin actualizado no mapa.');
        return true;
    }

    function paint() {
        if (!map || !window.L) return;
        markers.forEach((m) => map.removeLayer(m));
        markers = [];
        const shown = filtered();
        const mapped = shown.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
        const unmapped = shown.filter((p) => !(Number.isFinite(p.lat) && Number.isFinite(p.lng)));
        const bounds = window.L.latLngBounds([]);
        mapped.forEach((pin) => {
            const marker = window.L.marker([pin.lat, pin.lng], {
                icon: pinIcon(pin.color),
                title: pin.kind === 'visita' && pin.leadNome
                    ? `${pin.nome || ''} · ligado a ${pin.leadNome}`
                    : (pin.kind === 'lead' && pin.visitaCount
                        ? `${pin.nome || ''} · ${pin.visitaCount} visita(s)`
                        : `${pin.nome || ''} — arraste para corrigir`),
                draggable: !placing,
                autoPan: true
            }).addTo(map);
            marker.on('click', () => {
                if (placing) return;
                openPin(pin);
            });
            marker.on('dragstart', () => {
                closeDrawer();
            });
            marker.on('dragend', async () => {
                const pos = marker.getLatLng();
                const ok = await savePinPosition(pin, pos.lat, pos.lng);
                if (!ok) {
                    marker.setLatLng([pin.lat, pin.lng]);
                }
            });
            markers.push(marker);
            bounds.extend([pin.lat, pin.lng]);
        });
        el.coverageStatus.textContent = placing
            ? 'Toque no mapa para marcar o sítio visitado.'
            : (mapped.length
                ? `${mapped.length} no mapa · arraste pins · ligue visitas a leads${unmapped.length ? ` · ${unmapped.length} sem ponto` : ''}`
                : (unmapped.length ? `${unmapped.length} sítios sem ponto no mapa.` : 'Sem sítios para mostrar.'));

        if (el.coverageUnmapped) {
            el.coverageUnmapped.innerHTML = '';
            unmapped.slice(0, 40).forEach((pin) => {
                const card = document.createElement('article');
                card.className = 'admin-card';
                card.innerHTML = `
                    <h3>${pin.nome || 'Sem nome'}</h3>
                    <p class="meta">${pin.morada || '—'}${pin.cidade ? `, ${pin.cidade}` : ''} · ${pin.kind === 'visita' ? 'visita' : 'lead'} · sem pin${pin.leadNome ? ` · → ${pin.leadNome}` : ''}${pin.visitaCount ? ` · ${pin.visitaCount} visita(s)` : ''}</p>
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

        if (mapped.length === 1) {
            map.setView([mapped[0].lat, mapped[0].lng], 15);
        } else if (mapped.length > 1) {
            map.fitBounds(bounds.pad(0.12));
        } else {
            map.setView([PORTUGAL.lat, PORTUGAL.lng], PORTUGAL.zoom);
        }
    }

    function setPlacing(on) {
        placing = on;
        if (el.coveragePlaceBtn) {
            el.coveragePlaceBtn.classList.toggle('active', on);
            el.coveragePlaceBtn.textContent = on ? 'A marcar… toque no mapa' : 'Marcar no mapa';
        }
        if (map) map.getContainer().style.cursor = on ? 'crosshair' : '';
        paint();
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
                if (!placing) return;
                pendingPoint = { lat: event.latlng.lat, lng: event.latlng.lng };
                setPlacing(false);
                openVisitForm(pendingPoint);
            });
        }
        setTimeout(() => map.invalidateSize(), 80);
        paint();
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
    if (el.coveragePlaceBtn) {
        el.coveragePlaceBtn.addEventListener('click', () => setPlacing(!placing));
    }
    if (el.coverageExportBtn) {
        el.coverageExportBtn.addEventListener('click', () => downloadExport());
    }

    return {
        ensure,
        repaint: paint,
        focusLead,
        openOrCreateVisitForLead
    };
}
