/**
 * Lead dossier: field catalog + completeness for the admin single source of truth.
 */

const PUBLIC_REQUIRED = ['nome_negocio', 'morada', 'cidade', 'telefone'];
const OUTREACH_FIELDS = ['email', 'whatsapp'];
const LEGAL_FIELDS = [
    { id: 'nome', label: 'Nome legal / responsável' },
    { id: 'nif', label: 'NIF' },
    { id: 'morada', label: 'Morada fiscal' },
    { id: 'email', label: 'Email legal' },
    { id: 'telefone', label: 'Telefone legal' }
];

const SECTION_LABELS = {
    identificacao: 'Identificação',
    funcionamento: 'Funcionamento',
    descricao: 'O negócio',
    especifico: 'Deste tipo de negócio',
    opcional: 'Opcional',
    extra: 'Outros campos'
};

const DIAG_FIELDS = [
    {
        id: 'maps',
        label: 'Como está no Maps?',
        options: [
            { id: 'nao', label: 'Não aparece' },
            { id: 'sim_sem_dono', label: 'Aparece, sem dono' },
            { id: 'sim_acesso', label: 'Aparece e o cliente gere' },
            { id: 'nao_sei', label: 'Não sei' }
        ]
    },
    {
        id: 'validado',
        label: 'Perfil da Empresa validado?',
        options: [
            { id: 'nao', label: 'Não' },
            { id: 'em_curso', label: 'Em curso' },
            { id: 'sim', label: 'Sim' },
            { id: 'na', label: 'N/A' }
        ]
    },
    {
        id: 'website',
        label: 'Tem website?',
        options: [
            { id: 'nao', label: 'Não' },
            { id: 'sim_fraco', label: 'Sim, fraco' },
            { id: 'sim_ok', label: 'Sim, ok' }
        ]
    },
    {
        id: 'prioridade',
        label: 'Prioridade hoje?',
        options: [
            { id: 'google', label: 'Aparecer e gerir no Google' },
            { id: 'site', label: 'Ter site' },
            { id: 'os_dois', label: 'Os dois' },
            { id: 'varias_paginas', label: 'Várias páginas' }
        ]
    }
];

const GOOGLE_PRESENCE_FIELDS = [
    {
        id: 'mapsEstado',
        label: 'Estado Maps / Perfil',
        tipo: 'select',
        options: [
            { id: 'nao_existe', label: 'Não aparece no Maps' },
            { id: 'sem_dono', label: 'Aparece no Maps, sem dono' },
            { id: 'outro_dono', label: 'Aparece com outro dono' }
        ]
    },
    { id: 'categoria', label: 'Categoria Google', tipo: 'texto' },
    { id: 'descricao', label: 'Descrição Google', tipo: 'texto_longo' },
    { id: 'website', label: 'Website no perfil', tipo: 'url' },
    { id: 'instagram', label: 'Instagram', tipo: 'texto' },
    { id: 'facebook', label: 'Facebook', tipo: 'texto' },
    {
        id: 'fotos',
        label: 'Fotos',
        tipo: 'select',
        options: [
            { id: 'ja_tem', label: 'Já tem fotos' },
            { id: 'captar', label: 'Captar agora' },
            { id: 'depois', label: 'Mais tarde' }
        ]
    }
];

function filled(value) {
    return String(value == null ? '' : value).trim().length > 0;
}

function humanizeId(id) {
    return String(id || '').replace(/_/g, ' ');
}

function fieldDef(id, standardFields, extra = {}) {
    const std = (standardFields && standardFields[id]) || {};
    return {
        id,
        label: extra.label || std.label || humanizeId(id),
        tipo: extra.tipo || std.tipo || 'texto',
        secao: extra.secao || std.secao || 'extra',
        placeholder: extra.placeholder || std.placeholder || '',
        required: extra.required === true
    };
}

function buildFieldCatalog(businessType, standardFields, dados) {
    const type = businessType || {};
    const seen = new Set();
    const fields = [];
    const push = (id, extra) => {
        if (!id || seen.has(id)) return;
        seen.add(id);
        fields.push(fieldDef(id, standardFields, extra));
    };

    ['nome_negocio', 'telefone', 'whatsapp', 'email', 'morada', 'cidade', 'maps_url'].forEach((id) => {
        push(id, {
            required: PUBLIC_REQUIRED.includes(id),
            secao: 'identificacao'
        });
    });
    (type.campos_obrigatorios || []).forEach((id) => push(id, { required: true }));
    (type.perguntas_especificas || []).forEach((q) => {
        push(q.id, {
            label: q.label,
            tipo: q.tipo || 'texto',
            secao: 'especifico',
            required: true
        });
    });
    (type.campos_opcionais || []).forEach((id) => push(id, {
        required: false,
        secao: ((standardFields && standardFields[id]) || {}).secao || 'opcional'
    }));
    Object.keys(dados || {}).forEach((id) => {
        if (!id || id.startsWith('_')) return;
        push(id, { required: false, secao: 'extra' });
    });
    return fields;
}

function assessCompleteness(dados, clienteLegal, fields) {
    const d = dados || {};
    const legal = clienteLegal || {};
    const catalog = Array.isArray(fields) ? fields : [];
    const missing = [];

    PUBLIC_REQUIRED.forEach((id) => {
        if (!filled(d[id])) {
            const hit = catalog.find((f) => f.id === id);
            missing.push({
                id,
                label: (hit && hit.label) || humanizeId(id),
                group: 'publico'
            });
        }
    });

    catalog.filter((f) => f.required && !PUBLIC_REQUIRED.includes(f.id)).forEach((f) => {
        if (!filled(d[f.id])) {
            missing.push({ id: f.id, label: f.label, group: 'negocio' });
        }
    });

    if (!filled(d.email)) {
        missing.push({ id: 'email', label: 'Email', group: 'envio' });
    }
    if (!filled(d.whatsapp) && !filled(d.telefone)) {
        missing.push({ id: 'whatsapp', label: 'WhatsApp', group: 'envio' });
    }

    const legalMissing = LEGAL_FIELDS.filter((f) => !filled(legal[f.id]));
    legalMissing.forEach((f) => {
        missing.push({ id: `legal.${f.id}`, label: f.label, group: 'legal' });
    });

    const publicMissing = missing.filter((m) => m.group === 'publico').length;
    const businessMissing = missing.filter((m) => m.group === 'negocio').length;
    const outreachMissing = missing.filter((m) => m.group === 'envio').length;

    return {
        missing,
        publicMissing,
        businessMissing,
        outreachMissing,
        legalMissing: legalMissing.length,
        readyForDemo: publicMissing === 0,
        readyForOutreach: publicMissing === 0 && outreachMissing === 0,
        readyForContract: legalMissing.length === 0 && publicMissing === 0
    };
}

function identitySummary(identidade) {
    const id = identidade && typeof identidade === 'object' ? identidade : {};
    const logo = id.logo && typeof id.logo === 'object' ? id.logo : {};
    const fotos = Array.isArray(id.fotos) ? id.fotos : [];
    return {
        estilo: id.estilo || '',
        paleta: id.paleta || '',
        cores: id.cores && typeof id.cores === 'object' ? id.cores : {},
        logoTipo: logo.tipo || 'nenhum',
        logoTexto: logo.texto || '',
        hasLogo: logo.tipo === 'upload' || Boolean(logo.dataUrl) || Boolean(logo.texto),
        fotoCount: fotos.length
    };
}

function demoSummary(demo, slug) {
    const d = demo && typeof demo === 'object' ? demo : {};
    const hero = d.hero && typeof d.hero === 'object' ? d.hero : {};
    return {
        slug: slug || '',
        url: slug ? `/d/${slug}` : '',
        titulo: hero.titulo || '',
        subtitulo: hero.subtitulo || ''
    };
}

function propostaSummary(proposta) {
    const p = proposta && typeof proposta === 'object' ? proposta : {};
    const calc = p._calc && typeof p._calc === 'object' ? p._calc : {};
    return {
        pacote: p.pacote || '',
        extras: Array.isArray(p.extras) ? p.extras : [],
        manutencao: p.manutencao || '',
        descontoPct: Number(p.descontoPct) || 0,
        contrapartida: p.contrapartida || '',
        totalComIva: Number(calc.totalComIva) || 0
    };
}

/** Lead columns win over dados_negocio JSON so the ficha cannot drift from the pin. */
function mergeCanonicalDados(row, obrigatorios = {}, opcionais = {}) {
    const json = { ...(obrigatorios || {}), ...(opcionais || {}) };
    return {
        ...json,
        nome_negocio: row.nome || json.nome_negocio || '',
        morada: row.morada || json.morada || '',
        cidade: row.cidade || json.cidade || '',
        telefone: row.telefone || json.telefone || '',
        whatsapp: row.whatsapp || json.whatsapp || ''
    };
}

function parseJsonObject(raw, fallback = {}) {
    try {
        const parsed = JSON.parse(raw || '');
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback;
    } catch (_) {
        return fallback;
    }
}

function isDataImage(value) {
    return typeof value === 'string' && value.startsWith('data:image/');
}

function sanitizeIdentidade(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const logoSrc = src.logo && typeof src.logo === 'object' ? src.logo : {};
    const coresSrc = src.cores && typeof src.cores === 'object' ? src.cores : {};
    const fotos = Array.isArray(src.fotos)
        ? src.fotos.filter(isDataImage).slice(0, 6)
        : [];
    const logo = { tipo: String(logoSrc.tipo || 'nenhum').slice(0, 20) };
    if (logo.tipo === 'upload' && isDataImage(logoSrc.dataUrl)) {
        logo.dataUrl = logoSrc.dataUrl;
        if (logoSrc.nome) logo.nome = String(logoSrc.nome).slice(0, 200);
        if (logoSrc.mat) logo.mat = String(logoSrc.mat).slice(0, 40);
    }
    if (logoSrc.texto) logo.texto = String(logoSrc.texto).slice(0, 80);
    return {
        logo,
        estilo: String(src.estilo || '').slice(0, 40),
        paleta: String(src.paleta || '').slice(0, 40),
        cores: {
            base: String(coresSrc.base || '').slice(0, 20),
            destaque: String(coresSrc.destaque || '').slice(0, 20),
            secundaria: String(coresSrc.secundaria || '').slice(0, 20)
        },
        fotos
    };
}

function saveLeadIdentidade(db, leadId, identidade) {
    const row = db.prepare('SELECT id, wizard_json FROM lead WHERE id = ?').get(leadId);
    if (!row) return null;
    const clean = sanitizeIdentidade(identidade);
    const wizard = parseJsonObject(row.wizard_json, {});
    wizard.identidade = clean;
    db.prepare('UPDATE lead SET identidade_json = ?, wizard_json = ? WHERE id = ?')
        .run(JSON.stringify(clean), JSON.stringify(wizard), leadId);
    return clean;
}

function patchLeadWhatsapp(db, leadId, whatsapp) {
    const row = db.prepare(`
        SELECT l.id, l.wizard_json, d.id AS dados_id, d.obrigatorios_json, d.opcionais_json
        FROM lead l LEFT JOIN dados_negocio d ON d.lead_id = l.id WHERE l.id = ?
    `).get(leadId);
    if (!row) return null;
    const wa = String(whatsapp || '').trim();
    db.prepare('UPDATE lead SET whatsapp = ? WHERE id = ?').run(wa, leadId);
    if (row.dados_id) {
        const obr = parseJsonObject(row.obrigatorios_json, {});
        const opc = parseJsonObject(row.opcionais_json, {});
        if (Object.prototype.hasOwnProperty.call(obr, 'whatsapp')) obr.whatsapp = wa;
        else opc.whatsapp = wa;
        db.prepare('UPDATE dados_negocio SET obrigatorios_json = ?, opcionais_json = ? WHERE id = ?')
            .run(JSON.stringify(obr), JSON.stringify(opc), row.dados_id);
    }
    const wizard = parseJsonObject(row.wizard_json, {});
    if (!wizard.dados || typeof wizard.dados !== 'object') wizard.dados = {};
    wizard.dados.whatsapp = wa;
    db.prepare('UPDATE lead SET wizard_json = ? WHERE id = ?').run(JSON.stringify(wizard), leadId);
    return wa;
}

function sanitizeDados(dados, cleanText) {
    const out = {};
    Object.entries(dados || {}).forEach(([key, value]) => {
        const id = String(key || '').trim();
        if (!id || id.startsWith('_') || id.length > 80) return;
        if (typeof value === 'boolean') {
            out[id] = value ? 'sim' : 'nao';
            return;
        }
        if (Array.isArray(value)) {
            out[id] = value.map((v) => cleanText(v, 200)).filter(Boolean).join(', ');
            return;
        }
        out[id] = cleanText(value, 2000);
    });
    return out;
}

module.exports = {
    PUBLIC_REQUIRED,
    OUTREACH_FIELDS,
    LEGAL_FIELDS,
    SECTION_LABELS,
    DIAG_FIELDS,
    GOOGLE_PRESENCE_FIELDS,
    buildFieldCatalog,
    assessCompleteness,
    identitySummary,
    demoSummary,
    propostaSummary,
    mergeCanonicalDados,
    sanitizeDados,
    sanitizeIdentidade,
    saveLeadIdentidade,
    patchLeadWhatsapp
};
