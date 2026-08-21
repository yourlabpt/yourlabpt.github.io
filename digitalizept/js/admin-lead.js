const SECTION_ORDER = ['identificacao', 'funcionamento', 'descricao', 'especifico', 'opcional', 'extra'];

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
    return {
        businessTypeId: typeEl ? typeEl.value : '',
        dados,
        clienteLegal,
        googleDiagnostico,
        googlePresence,
        cobertura: etapaEl ? etapaEl.value : undefined,
        resultado: resultadoEl ? resultadoEl.value : undefined,
        notas_admin: notasEl ? notasEl.value : ''
    };
}

export function renderLeadDossier(host, payload, { onSave, onBack, onToast } = {}) {
    host.innerHTML = '';
    host.className = 'dossier';
    if (!payload || !payload.lead) {
        host.appendChild(el('p', 'admin-empty', 'Lead não encontrado.'));
        return;
    }

    const miss = missingSet(payload.completeness);
    const form = el('form', 'dossier-form');
    form.appendChild(checklist(payload.completeness));

    const toolbar = el('div', 'dossier-toolbar');
    const back = el('button', 'btn-secondary', '← Leads');
    back.type = 'button';
    back.addEventListener('click', () => { if (onBack) onBack(); });
    const saveTop = el('button', 'btn-primary', 'Guardar ficha');
    saveTop.type = 'submit';
    const resume = el('a', 'btn-secondary', payload.lead.estado === 'fechado' ? 'Editar proposta' : 'Continuar venda');
    resume.href = `./?resume=${encodeURIComponent(payload.lead.id)}`;
    toolbar.append(back, saveTop, resume);
    if (payload.demo && payload.demo.url) {
        const demoLink = el('a', 'btn-secondary', 'Abrir demo');
        demoLink.href = payload.demo.url;
        demoLink.target = '_blank';
        demoLink.rel = 'noopener';
        toolbar.appendChild(demoLink);
    }
    form.appendChild(toolbar);

    const meta = el('p', 'meta');
    meta.textContent = `${payload.businessType.nome || '—'} · ${payload.lead.estado || '—'} · ${payload.lead.criado_em ? new Date(payload.lead.criado_em).toLocaleDateString('pt-PT') : ''}`;
    form.appendChild(meta);

    const typeLabel = fieldWrap('Tipo de negócio', (() => {
        const select = el('select', 'field-input');
        select.setAttribute('data-business-type', '1');
        (payload.businessTypes || []).forEach((t) => {
            const o = document.createElement('option');
            o.value = t.id;
            o.textContent = t.nome;
            if (t.id === payload.businessType.id) o.selected = true;
            select.appendChild(o);
        });
        return select;
    })());
    form.appendChild(typeLabel);

    const groups = groupFields(payload.fields);
    const labels = payload.sectionLabels || {};
    SECTION_ORDER.forEach((secao) => {
        const list = groups[secao] || [];
        if (!list.length) return;
        const set = el('fieldset', 'dossier-section');
        set.appendChild(el('legend', '', labels[secao] || secao));
        const grid = el('div', 'dossier-grid');
        list.forEach((field) => {
            const control = inputFor(field, payload.dados[field.id]);
            control.setAttribute('data-dados', field.id);
            const wrap = fieldWrap(
                field.required ? `${field.label} *` : field.label,
                control,
                miss.has(field.id)
            );
            grid.appendChild(wrap);
        });
        set.appendChild(grid);
        form.appendChild(set);
    });

    const legal = el('fieldset', 'dossier-section');
    legal.appendChild(el('legend', '', 'Cliente legal (contrato)'));
    const legalGrid = el('div', 'dossier-grid');
    (payload.legalFields || []).forEach((field) => {
        const control = inputFor(
            { tipo: field.id === 'email' ? 'email' : field.id === 'telefone' ? 'telefone' : 'texto' },
            payload.clienteLegal[field.id]
        );
        control.setAttribute('data-legal', field.id);
        legalGrid.appendChild(fieldWrap(field.label, control, miss.has(`legal.${field.id}`)));
    });
    legal.appendChild(legalGrid);
    form.appendChild(legal);

    const diag = el('fieldset', 'dossier-section');
    diag.appendChild(el('legend', '', 'Diagnóstico Google'));
    const diagGrid = el('div', 'dossier-grid');
    (payload.diagFields || []).forEach((field) => {
        const control = selectFor(field.options, payload.googleDiagnostico[field.id]);
        control.setAttribute('data-diag', field.id);
        diagGrid.appendChild(fieldWrap(field.label, control));
    });
    diag.appendChild(diagGrid);
    form.appendChild(diag);

    const gbp = el('fieldset', 'dossier-section');
    gbp.appendChild(el('legend', '', 'Presença Google (entrega)'));
    const gbpGrid = el('div', 'dossier-grid');
    (payload.googlePresenceFields || []).forEach((field) => {
        const control = field.tipo === 'select'
            ? selectFor(field.options, payload.googlePresence[field.id])
            : inputFor(field, payload.googlePresence[field.id]);
        control.setAttribute('data-gbp', field.id);
        gbpGrid.appendChild(fieldWrap(field.label, control));
    });
    gbp.appendChild(gbpGrid);
    form.appendChild(gbp);

    const cover = el('fieldset', 'dossier-section');
    cover.appendChild(el('legend', '', 'Cobertura'));
    const coverGrid = el('div', 'dossier-grid');
    const etapa = selectFor(payload.etapas, payload.lead.cobertura);
    etapa.setAttribute('data-etapa', '1');
    coverGrid.appendChild(fieldWrap('Etapa', etapa));
    const resultado = selectFor(payload.resultados, payload.lead.resultado);
    resultado.setAttribute('data-resultado', '1');
    coverGrid.appendChild(fieldWrap('Resultado', resultado));
    const pin = el('p', 'meta');
    pin.textContent = Number.isFinite(payload.lead.lat)
        ? `Pin: ${payload.lead.lat.toFixed(5)}, ${payload.lead.lng.toFixed(5)} (${payload.lead.geocode_status || 'ok'})`
        : 'Ainda sem pin no mapa.';
    cover.append(coverGrid, pin);
    form.appendChild(cover);

    const notes = el('fieldset', 'dossier-section');
    notes.appendChild(el('legend', '', 'Nota interna'));
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
            li.append(time, document.createTextNode(n.texto));
            ul.appendChild(li);
        });
        notes.appendChild(ul);
    }
    form.appendChild(notes);

    const read = el('fieldset', 'dossier-section dossier-readonly');
    read.appendChild(el('legend', '', 'Estado (só leitura)'));
    const idn = payload.identidade || {};
    const demo = payload.demo || {};
    const prop = payload.proposta || {};
    const fu = payload.followup || {};
    const lines = [
        `Identidade: ${idn.estilo || '—'} / ${idn.paleta || '—'} · logo ${idn.hasLogo ? 'sim' : 'não'} · ${idn.fotoCount || 0} foto(s)`,
        demo.url ? `Demo: ${demo.titulo || demo.slug} (${demo.url})` : 'Demo: ainda não publicada',
        prop.pacote ? `Proposta: ${prop.pacote}${prop.extras.length ? ` + ${prop.extras.join(', ')}` : ''}` : 'Proposta: ainda não fechada',
        `Envio: WhatsApp ${fu.waStep || 0}/3${fu.emailSentAt ? ' · email enviado' : ''}${fu.callDueAt && !fu.callDoneAt ? ' · ligação pendente' : ''}`
    ];
    lines.forEach((line) => read.appendChild(el('p', 'meta', line)));
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
            await onSave(collectForm(form));
        } catch (err) {
            if (onToast) onToast((err && err.message) || 'Não foi possível guardar.', true);
        } finally {
            save.disabled = false;
            saveTop.disabled = false;
        }
    });

    host.appendChild(form);
}

export function dossierHash(leadId) {
    return `#dossier=${encodeURIComponent(leadId)}`;
}

export function leadIdFromHash(hash) {
    const match = String(hash || '').match(/[#&]dossier=([^&]+)/i);
    return match ? decodeURIComponent(match[1]) : '';
}
