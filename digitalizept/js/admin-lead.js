import { renderHoursPicker } from './horario.js';
import { whatsappIfMobile } from './format.js';

const SECTION_ORDER = ['identificacao', 'funcionamento', 'descricao', 'especifico', 'opcional', 'extra'];
const CONTACT_IDS = ['nome_negocio', 'telefone', 'whatsapp', 'email', 'morada', 'cidade', 'maps_url'];

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
}

function fieldWrap(labelText, control, missing) {
    const label = el('label', `field${missing ? ' field-missing' : ''}`);
    const span = el('span', 'field-label', labelText);
    label.append(span, control);
    return label;
}

function inputFor(field, value) {
    const tipo = field.tipo || 'texto';
    if (tipo === 'sim_nao') {
        const select = el('select', 'field-input');
        [['', '—'], ['sim', 'Sim'], ['nao', 'Não']].forEach(([v, t]) => {
            const opt = document.createElement('option');
            opt.value = v;
            opt.textContent = t;
            if (String(value || '') === v) opt.selected = true;
            select.appendChild(opt);
        });
        return select;
    }
    if (tipo === 'texto_longo') {
        const ta = el('textarea', 'field-input');
        ta.rows = 3;
        ta.value = value || '';
        if (field.placeholder) ta.placeholder = field.placeholder;
        return ta;
    }
    const input = el('input', 'field-input');
    input.type = tipo === 'email' ? 'email' : tipo === 'url' ? 'url' : tipo === 'telefone' ? 'tel' : 'text';
    input.value = value || '';
    if (field.placeholder) input.placeholder = field.placeholder;
    if (tipo === 'telefone') input.inputMode = 'tel';
    if (tipo === 'email') input.autocomplete = 'email';
    return input;
}

function selectFor(options, value) {
    const select = el('select', 'field-input');
    const list = options || [];
    if (!list.some((opt) => opt.id === '')) {
        const empty = document.createElement('option');
        empty.value = '';
        empty.textContent = '—';
        select.appendChild(empty);
    }
    list.forEach((opt) => {
        const o = document.createElement('option');
        o.value = opt.id;
        o.textContent = opt.label || opt.id;
        if (String(value || '') === String(opt.id)) o.selected = true;
        select.appendChild(o);
    });
    return select;
}

function missingSet(completeness) {
    return new Set((completeness && completeness.missing || []).map((m) => m.id));
}

function groupFields(fields) {
    const groups = {};
    SECTION_ORDER.forEach((id) => { groups[id] = []; });
    (fields || []).forEach((f) => {
        const secao = groups[f.secao] ? f.secao : 'extra';
        groups[secao].push(f);
    });
    return groups;
}

function isMobile() {
    return window.matchMedia('(max-width: 640px)').matches;
}

function section(title, { open = true, className = '' } = {}) {
    const set = el('details', `dossier-section ${className}`.trim());
    set.open = open;
    set.appendChild(el('summary', 'dossier-section-title', title));
    return set;
}

function digitsPhone(value) {
    return String(value || '').replace(/[^\d+]/g, '');
}

function copyMobileToWhatsapp(form) {
    const telEl = form.querySelector('[data-dados="telefone"]');
    const waEl = form.querySelector('[data-dados="whatsapp"]');
    if (!telEl || !waEl) return;
    if (String(waEl.value || '').trim()) return;
    const copied = whatsappIfMobile(telEl.value);
    if (!copied) return;
    waEl.value = copied;
    waEl.dispatchEvent(new Event('input', { bubbles: true }));
}

function checklist(completeness) {
    const box = el('div', 'dossier-check');
    if (!completeness) return box;
    const ready = completeness.readyForDemo && completeness.readyForOutreach;
    box.classList.toggle('dossier-check-ok', ready && completeness.readyForContract);
    const title = el('p', 'dossier-check-title');
    if (completeness.missing.length === 0) {
        title.textContent = 'Ficha completa — demo, envio e contrato têm o essencial.';
    } else {
        title.textContent = `${completeness.missing.length} campo(s) em falta`;
    }
    const ul = el('ul', 'dossier-check-list');
    const groups = {
        publico: 'Para a demo',
        negocio: 'Do negócio',
        envio: 'Para email / WhatsApp',
        legal: 'Para contrato'
    };
    completeness.missing.forEach((m) => {
        const li = el('li', '', `${groups[m.group] || m.group}: ${m.label}`);
        ul.appendChild(li);
    });
    box.append(title);
    if (completeness.missing.length) box.appendChild(ul);
    const flags = el('p', 'meta');
    flags.textContent = [
        completeness.readyForDemo ? 'Pronto para demo' : 'Falta o mínimo da demo',
        completeness.readyForOutreach ? 'Pronto para envio' : 'Falta contacto de envio',
        completeness.readyForContract ? 'Pronto para contrato' : 'Falta dados legais'
    ].join(' · ');
    box.appendChild(flags);
    return box;
}

function collectForm(root) {
    const dados = {};
    root.querySelectorAll('[data-dados]').forEach((node) => {
        dados[node.getAttribute('data-dados')] = node.value;
    });
    if (!String(dados.whatsapp || '').trim()) {
        const copied = whatsappIfMobile(dados.telefone);
        if (copied) dados.whatsapp = copied;
    }
    const clienteLegal = {};
    root.querySelectorAll('[data-legal]').forEach((node) => {
        clienteLegal[node.getAttribute('data-legal')] = node.value;
    });
    const googleDiagnostico = {};
    root.querySelectorAll('[data-diag]').forEach((node) => {
        googleDiagnostico[node.getAttribute('data-diag')] = node.value;
    });
    const googlePresence = {};
    root.querySelectorAll('[data-gbp]').forEach((node) => {
        googlePresence[node.getAttribute('data-gbp')] = node.value;
    });
    const typeEl = root.querySelector('[data-business-type]');
    const etapaEl = root.querySelector('[data-etapa]');
    const resultadoEl = root.querySelector('[data-resultado]');
    const notasEl = root.querySelector('[data-notas-admin]');
    const latEl = root.querySelector('[data-geo-lat]');
    const lngEl = root.querySelector('[data-geo-lng]');
    const lat = latEl && String(latEl.value || '').trim() !== '' ? Number(latEl.value) : NaN;
    const lng = lngEl && String(lngEl.value || '').trim() !== '' ? Number(lngEl.value) : NaN;
    const body = {
        businessTypeId: typeEl ? typeEl.value : '',
        dados,
        clienteLegal,
        googleDiagnostico,
        googlePresence,
        cobertura: etapaEl ? etapaEl.value : undefined,
        resultado: resultadoEl ? resultadoEl.value : undefined,
        notas_admin: notasEl ? notasEl.value : ''
    };
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
        body.lat = lat;
        body.lng = lng;
    }
    return body;
}

function appendField(grid, field, value, missing, attr, attrValue) {
    if (field.id === 'horario' || field.tipo === 'horario') {
        const box = el('div', 'hours-field-box');
        const hidden = el('input');
        hidden.type = 'hidden';
        hidden.setAttribute(attr, attrValue);
        hidden.value = value || '';
        box.appendChild(hidden);
        const picker = renderHoursPicker(box, {
            text: value || '',
            onChange: (text) => {
                hidden.value = text;
            }
        });
        hidden.addEventListener('input', () => {
            picker.setText(hidden.value);
        });
        const wrap = el('div', `field field-hours${missing ? ' field-missing' : ''}`);
        wrap.append(el('span', 'field-label', field.required ? `${field.label} *` : field.label), box);
        grid.appendChild(wrap);
        return hidden;
    }
    const control = field.tipo === 'select'
        ? selectFor(field.options, value)
        : inputFor(field, value);
    control.setAttribute(attr, attrValue);
    grid.appendChild(fieldWrap(
        field.required ? `${field.label} *` : field.label,
        control,
        missing
    ));
    return control;
}

export function renderLeadDossier(host, payload, {
    onSave, onBack, onToast, onMapsLookup, onWebsiteZip, mountProcess, mountDemo, initialVista
} = {}) {
    host.innerHTML = '';
    host.className = 'dossier dossier-vista-controlo';
    if (!payload || !payload.lead) {
        host.appendChild(el('p', 'admin-empty', 'Lead não encontrado.'));
        return;
    }

    let vista = normalizeVista(initialVista);

    const chrome = el('div', 'dossier-chrome');
    const back = el('button', 'btn-secondary', '← Leads');
    back.type = 'button';
    back.addEventListener('click', () => { if (onBack) onBack(); });
    const nome = el('h2', 'dossier-nome', payload.lead.nome || 'Lead');
    const toggle = el('div', 'dossier-toggle');
    const btnControlo = el('button', 'dossier-toggle-btn', 'O que fazer agora');
    btnControlo.type = 'button';
    btnControlo.setAttribute('data-vista', 'controlo');
    const btnDemo = el('button', 'dossier-toggle-btn', 'Demo');
    btnDemo.type = 'button';
    btnDemo.setAttribute('data-vista', 'demo');
    const btnFicha = el('button', 'dossier-toggle-btn', 'Dados da loja');
    btnFicha.type = 'button';
    btnFicha.setAttribute('data-vista', 'ficha');
    toggle.append(btnControlo, btnDemo, btnFicha);
    const extras = el('div', 'dossier-chrome-actions');
    if (payload.demo && payload.demo.url) {
        const demoLink = el('a', 'btn-secondary', 'Abrir demo');
        demoLink.href = payload.demo.url;
        demoLink.target = '_blank';
        demoLink.rel = 'noopener';
        extras.appendChild(demoLink);
    }
    const mais = document.createElement('details');
    mais.className = 'dossier-mais';
    mais.appendChild(el('summary', 'btn-secondary', 'Mais'));
    const resume = el('a', 'btn-secondary', payload.lead.estado === 'fechado' ? 'Editar proposta' : 'Continuar venda');
    resume.href = `./?resume=${encodeURIComponent(payload.lead.id)}`;
    resume.title = 'Pacotes e contrato — fotos e logo ficam no separador Demo';
    mais.appendChild(resume);
    if (typeof onWebsiteZip === 'function') {
        const zip = el('button', 'btn-secondary', 'Descarregar website (ZIP)');
        zip.type = 'button';
        zip.addEventListener('click', () => onWebsiteZip(payload.lead.id, zip));
        mais.appendChild(zip);
    }
    extras.appendChild(mais);
    const hint = el('p', 'dossier-controlo-hint');
    chrome.append(back, nome, toggle, extras, hint);
    host.appendChild(chrome);

    const pageFicha = el('div', 'dossier-page dossier-page-ficha');
    const statusHost = el('div', 'dossier-status');
    statusHost.innerHTML = '<p class="meta">A carregar o estado…</p>';
    pageFicha.appendChild(statusHost);

    const pageControlo = el('div', 'dossier-page dossier-page-controlo');
    const processHost = el('div', 'dossier-process');
    pageControlo.appendChild(processHost);

    const pageDemo = el('div', 'dossier-page dossier-page-demo');
    const demoHost = el('div', 'dossier-demo-host');
    pageDemo.appendChild(demoHost);

    const HINTS = {
        controlo: 'Faz o passo de baixo. Podes voltar atrás, saltar, ou tocar noutro passo no trilho.',
        demo: 'Logo, fotos e paleta. Publica a demo daqui — o envio fica no Controlo.',
        ficha: ''
    };

    function setVista(next) {
        vista = normalizeVista(next);
        host.classList.toggle('dossier-vista-ficha', vista === 'ficha');
        host.classList.toggle('dossier-vista-controlo', vista === 'controlo');
        host.classList.toggle('dossier-vista-demo', vista === 'demo');
        btnFicha.classList.toggle('is-active', vista === 'ficha');
        btnControlo.classList.toggle('is-active', vista === 'controlo');
        btnDemo.classList.toggle('is-active', vista === 'demo');
        btnFicha.setAttribute('aria-pressed', vista === 'ficha' ? 'true' : 'false');
        btnControlo.setAttribute('aria-pressed', vista === 'controlo' ? 'true' : 'false');
        btnDemo.setAttribute('aria-pressed', vista === 'demo' ? 'true' : 'false');
        host.dataset.vista = vista;
        hint.textContent = HINTS[vista] || '';
        history.replaceState(null, '', dossierHash(payload.lead.id, vista));
        window.scrollTo(0, 0);
    }
    btnFicha.addEventListener('click', () => setVista('ficha'));
    btnControlo.addEventListener('click', () => setVista('controlo'));
    btnDemo.addEventListener('click', () => setVista('demo'));

    if (typeof mountProcess === 'function') {
        mountProcess(processHost, payload.lead.id, {
            statusHost,
            onSwitchVista: setVista
        });
    }
    if (typeof mountDemo === 'function') {
        mountDemo(demoHost, payload.lead.id);
    }

    const miss = missingSet(payload.completeness);
    const mobile = isMobile();
    const form = el('form', 'dossier-form');
    form.appendChild(checklist(payload.completeness));

    const toolbar = el('div', 'dossier-toolbar');
    const saveTop = el('button', 'btn-primary', 'Guardar');
    saveTop.type = 'submit';
    toolbar.appendChild(saveTop);
    form.appendChild(toolbar);

    const meta = el('p', 'meta');
    meta.textContent = `${payload.businessType.nome || '—'} · ${payload.lead.estado || '—'} · ${payload.lead.criado_em ? new Date(payload.lead.criado_em).toLocaleDateString('pt-PT') : ''}`;
    form.appendChild(meta);

    const contact = section('Contacto inicial', { open: true, className: 'dossier-contact' });
    const contactGrid = el('div', 'dossier-grid');
    const typeSelect = el('select', 'field-input');
    typeSelect.setAttribute('data-business-type', '1');
    (payload.businessTypes || []).forEach((t) => {
        const o = document.createElement('option');
        o.value = t.id;
        o.textContent = t.nome;
        if (t.id === payload.businessType.id) o.selected = true;
        typeSelect.appendChild(o);
    });
    contactGrid.appendChild(fieldWrap('Categoria', typeSelect));

    const byId = new Map((payload.fields || []).map((f) => [f.id, f]));
    CONTACT_IDS.forEach((id) => {
        const field = byId.get(id) || { id, label: id, tipo: id === 'email' ? 'email' : id === 'maps_url' ? 'url' : 'texto' };
        appendField(contactGrid, field, payload.dados[id], miss.has(id), 'data-dados', id);
    });
    contact.appendChild(contactGrid);
    const telInput = contactGrid.querySelector('[data-dados="telefone"]');
    if (telInput) {
        telInput.addEventListener('change', () => copyMobileToWhatsapp(form));
        telInput.addEventListener('blur', () => copyMobileToWhatsapp(form));
    }

    const mapsRow = el('div', 'dossier-maps-actions');
    const mapsBtn = el('button', 'btn-secondary', 'Preencher pelo Maps');
    mapsBtn.type = 'button';
    mapsBtn.addEventListener('click', async () => {
        const urlEl = form.querySelector('[data-dados="maps_url"]');
        const url = urlEl ? urlEl.value.trim() : '';
        if (!url) {
            if (onToast) onToast('Cole o link do Google Maps.', true);
            if (urlEl) urlEl.focus();
            return;
        }
        if (typeof onMapsLookup !== 'function') return;
        mapsBtn.disabled = true;
        mapsBtn.textContent = 'A ler o link…';
        try {
            const data = await onMapsLookup(url);
            if (!data || !data.ok) {
                if (onToast) onToast((data && data.error) || 'Não consegui ler o link.', true);
                return;
            }
            const dados = data.dados || {};
            form.querySelectorAll('[data-dados]').forEach((node) => {
                const key = node.getAttribute('data-dados');
                const next = dados[key];
                if (!next || String(node.value || '').trim()) return;
                node.value = next;
                node.dispatchEvent(new Event('input', { bubbles: true }));
            });
            if (data.businessTypeId) {
                const exists = Array.from(typeSelect.options).some((o) => o.value === data.businessTypeId);
                if (exists && (!typeSelect.value || typeSelect.value === 'generico')) {
                    typeSelect.value = data.businessTypeId;
                }
            }
            if (Number.isFinite(data.lat) && Number.isFinite(data.lng)) {
                form.querySelector('[data-geo-lat]').value = String(data.lat);
                form.querySelector('[data-geo-lng]').value = String(data.lng);
            }
            copyMobileToWhatsapp(form);
            if (onToast) onToast('Campos vazios preenchidos. Confirma telefone e email.');
        } catch (err) {
            if (onToast) onToast((err && err.message) || 'Erro de rede.', true);
        } finally {
            mapsBtn.disabled = false;
            mapsBtn.textContent = 'Preencher pelo Maps';
        }
    });
    mapsRow.appendChild(mapsBtn);
    contact.appendChild(mapsRow);

    const chips = el('div', 'dossier-contact-actions');
    function refreshChips() {
        chips.innerHTML = '';
        const tel = digitsPhone((form.querySelector('[data-dados="telefone"]') || {}).value);
        const wa = digitsPhone((form.querySelector('[data-dados="whatsapp"]') || {}).value) || tel;
        const mail = String((form.querySelector('[data-dados="email"]') || {}).value || '').trim();
        if (tel) {
            const a = el('a', 'btn-secondary', 'Ligar');
            a.href = `tel:${tel}`;
            chips.appendChild(a);
        }
        if (wa) {
            const a = el('a', 'btn-secondary', 'WhatsApp');
            let num = wa.replace(/^\+/, '');
            if (/^9\d{8}$/.test(num)) num = `351${num}`;
            a.href = `https://wa.me/${num}`;
            a.target = '_blank';
            a.rel = 'noopener';
            chips.appendChild(a);
        }
        if (mail) {
            const a = el('a', 'btn-secondary', 'Email');
            a.href = `mailto:${mail}`;
            chips.appendChild(a);
        }
    }
    contact.appendChild(chips);
    form.appendChild(contact);
    form.addEventListener('input', refreshChips);
    refreshChips();

    const geoLat = el('input', 'field-input');
    geoLat.type = 'hidden';
    geoLat.setAttribute('data-geo-lat', '1');
    geoLat.value = Number.isFinite(payload.lead.lat) ? String(payload.lead.lat) : '';
    const geoLng = el('input', 'field-input');
    geoLng.type = 'hidden';
    geoLng.setAttribute('data-geo-lng', '1');
    geoLng.value = Number.isFinite(payload.lead.lng) ? String(payload.lead.lng) : '';
    form.append(geoLat, geoLng);

    const groups = groupFields(payload.fields);
    const labels = payload.sectionLabels || {};
    SECTION_ORDER.forEach((secao) => {
        let list = groups[secao] || [];
        if (secao === 'identificacao') {
            list = list.filter((f) => !CONTACT_IDS.includes(f.id));
        }
        if (!list.length) return;
        const set = section(labels[secao] || secao, { open: !mobile });
        const grid = el('div', 'dossier-grid');
        list.forEach((field) => appendField(grid, field, payload.dados[field.id], miss.has(field.id), 'data-dados', field.id));
        set.appendChild(grid);
        form.appendChild(set);
    });

    const extraBlocks = [
        {
            title: 'Cliente legal (contrato)',
            open: !mobile,
            build(grid) {
                (payload.legalFields || []).forEach((field) => {
                    appendField(
                        grid,
                        { ...field, tipo: field.id === 'email' ? 'email' : field.id === 'telefone' ? 'telefone' : 'texto' },
                        payload.clienteLegal[field.id],
                        miss.has(`legal.${field.id}`),
                        'data-legal',
                        field.id
                    );
                });
            }
        },
        {
            title: 'Diagnóstico Google',
            open: !mobile,
            build(grid) {
                (payload.diagFields || []).forEach((field) => {
                    const control = selectFor(field.options, payload.googleDiagnostico[field.id]);
                    control.setAttribute('data-diag', field.id);
                    grid.appendChild(fieldWrap(field.label, control));
                });
            }
        },
        {
            title: 'Presença Google (entrega)',
            open: !mobile,
            build(grid) {
                (payload.googlePresenceFields || []).forEach((field) => {
                    const control = field.tipo === 'select'
                        ? selectFor(field.options, payload.googlePresence[field.id])
                        : inputFor(field, payload.googlePresence[field.id]);
                    control.setAttribute('data-gbp', field.id);
                    grid.appendChild(fieldWrap(field.label, control));
                });
            }
        }
    ];
    extraBlocks.forEach((block) => {
        const set = section(block.title, { open: block.open });
        const grid = el('div', 'dossier-grid');
        block.build(grid);
        set.appendChild(grid);
        form.appendChild(set);
    });

    const cover = section('Cobertura', { open: true });
    const coverGrid = el('div', 'dossier-grid');
    const etapa = selectFor(payload.etapas, payload.lead.cobertura);
    etapa.setAttribute('data-etapa', '1');
    coverGrid.appendChild(fieldWrap('Na rua', etapa));
    const resultado = selectFor(payload.resultados, payload.lead.resultado);
    resultado.setAttribute('data-resultado', '1');
    coverGrid.appendChild(fieldWrap('Fecho', resultado));
    const pin = el('p', 'meta');
    pin.textContent = Number.isFinite(payload.lead.lat)
        ? `Pin: ${payload.lead.lat.toFixed(5)}, ${payload.lead.lng.toFixed(5)} (${payload.lead.geocode_status || 'ok'})`
        : 'Ainda sem pin no mapa.';
    cover.append(coverGrid, pin);
    form.appendChild(cover);

    const notes = section('Nota interna', { open: !mobile });
    const notas = el('textarea', 'field-input');
    notas.rows = 3;
    notas.setAttribute('data-notas-admin', '1');
    notas.value = payload.lead.notas_admin || '';
    notes.appendChild(fieldWrap('Notas admin', notas));
    if ((payload.notes || []).length) {
        const ul = el('ul', 'admin-notes');
        payload.notes.forEach((n) => {
            const li = el('li');
            const time = el('time', '', new Date(n.criado_em).toLocaleString('pt-PT'));
            li.append(time, document.createTextNode(` ${n.texto}`));
            ul.appendChild(li);
        });
        notes.appendChild(ul);
    }
    form.appendChild(notes);

    const read = section('Identidade e demo', { open: false, className: 'dossier-readonly' });
    const idn = payload.identidade || {};
    const demo = payload.demo || {};
    const prop = payload.proposta || {};
    const lines = [
        `Identidade: ${idn.estilo || '—'} / ${idn.paleta || '—'} · logo ${idn.hasLogo ? 'sim' : 'não'} · ${idn.fotoCount || 0} foto(s)`,
        demo.url ? `Demo: ${demo.titulo || demo.slug} (${demo.url})` : 'Demo: ainda não publicada',
        prop.pacote ? `Proposta: ${prop.pacote}${prop.extras.length ? ` + ${prop.extras.join(', ')}` : ''}` : 'Proposta: ainda não fechada'
    ];
    lines.forEach((line) => read.appendChild(el('p', 'meta', line)));
    const irDemo = el('button', 'btn-secondary', 'Fotos e logo');
    irDemo.type = 'button';
    irDemo.addEventListener('click', () => setVista('demo'));
    read.appendChild(irDemo);
    if ((payload.visits || []).length) {
        read.appendChild(el('p', 'meta', `${payload.visits.length} visita(s) de rua ligadas`));
    }
    form.appendChild(read);

    const saveBar = el('div', 'dossier-savebar');
    const save = el('button', 'btn-primary', 'Guardar ficha');
    save.type = 'submit';
    saveBar.appendChild(save);
    form.appendChild(saveBar);

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (typeof onSave !== 'function') return;
        save.disabled = true;
        saveTop.disabled = true;
        try {
            await onSave(collectForm(form), { vista: 'ficha' });
        } catch (err) {
            if (onToast) onToast((err && err.message) || 'Não foi possível guardar.', true);
        } finally {
            save.disabled = false;
            saveTop.disabled = false;
        }
    });

    pageFicha.appendChild(form);
    host.append(pageFicha, pageControlo, pageDemo);
    setVista(vista);
}

function normalizeVista(value) {
    if (value === 'ficha' || value === 'demo') return value;
    return 'controlo';
}

export function dossierHash(leadId, vista = 'controlo') {
    const view = normalizeVista(vista);
    return `#dossier=${encodeURIComponent(leadId)}&vista=${view}`;
}

export function vistaFromHash(hash) {
    const match = String(hash || '').match(/[#&]vista=([^&]+)/i);
    return normalizeVista(match ? decodeURIComponent(match[1]) : '');
}

export function leadIdFromHash(hash) {
    const match = String(hash || '').match(/[#&]dossier=([^&]+)/i);
    return match ? decodeURIComponent(match[1]) : '';
}
