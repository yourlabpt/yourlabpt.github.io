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
            return `${p.nome} ${p.morada || ''} ${p.cidade || ''} ${p.experiencia || ''} ${p.notas || ''}`
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
            if (defaults.lat != null && defaults.lng != null) {
                const hint = document.createElement('p');
                hint.className = 'meta';
                hint.textContent = `Ponto no mapa: ${Number(defaults.lat).toFixed(5)}, ${Number(defaults.lng).toFixed(5)}`;
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
                    experiencia: experiencia.value.trim()
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

            if (defaults.id) {
                const actions = document.createElement('div');
                actions.className = 'coverage-pin-actions';
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
                panel.appendChild(actions);
            }
        });
    }

    function openLeadPin(pin) {
        openDrawer(pin.nome || 'Negócio', (panel) => {
            const meta = document.createElement('p');
            meta.className = 'meta';
            meta.textContent = `${pin.morada || '—'}${pin.cidade ? `, ${pin.cidade}` : ''} · ${pin.business_type || '—'}`;
            panel.appendChild(meta);
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
            const regeo = document.createElement('button');
            regeo.type = 'button';
            regeo.className = 'btn-secondary';
            regeo.textContent = Number.isFinite(pin.lat) ? 'Relocalizar pela morada' : 'Localizar pela morada';
            regeo.addEventListener('click', async () => {
                regeo.disabled = true;
                const { response, data } = await api(`/api/digitalizept/leads/${pin.id}/geocode`, { method: 'POST' });
                regeo.disabled = false;
                if (!response.ok) {
                    toast(data.error || 'Não encontrei o sítio. Use “Marcar no mapa” para uma visita.', true);
                    return;
                }
                toast('Coordenadas actualizadas.');
                closeDrawer();
                await refresh();
                paint();
            });
            const notes = document.createElement('button');
            notes.type = 'button';
            notes.className = 'btn-secondary';
            notes.textContent = 'Comentários';
            notes.addEventListener('click', () => openNotes({ id: pin.id, nome: pin.nome }));
            actions.append(regeo, notes);
            panel.appendChild(actions);
        });
    }

    function openPin(pin) {
        if (pin.kind === 'visita') openVisitForm(pin);
        else openLeadPin(pin);
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
                title: pin.nome || ''
            }).addTo(map);
            marker.on('click', () => openPin(pin));
            markers.push(marker);
            bounds.extend([pin.lat, pin.lng]);
        });
        el.coverageStatus.textContent = placing
            ? 'Toque no mapa para marcar o sítio visitado.'
            : (mapped.length
                ? `${mapped.length} no mapa${unmapped.length ? ` · ${unmapped.length} sem ponto` : ''}`
                : (unmapped.length ? `${unmapped.length} sítios sem ponto no mapa.` : 'Sem sítios para mostrar.'));

        if (el.coverageUnmapped) {
            el.coverageUnmapped.innerHTML = '';
            unmapped.slice(0, 40).forEach((pin) => {
                const card = document.createElement('article');
                card.className = 'admin-card';
                card.innerHTML = `
                    <h3>${pin.nome || 'Sem nome'}</h3>
                    <p class="meta">${pin.morada || '—'}${pin.cidade ? `, ${pin.cidade}` : ''} · ${pin.kind === 'visita' ? 'visita' : 'lead'} · sem pin</p>
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
        repaint: paint
    };
}
