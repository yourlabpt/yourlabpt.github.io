/**
 * Quintas e hotelaria — variante / field-group helpers (config-driven).
 * Used by Admin dossier (CJS) and mirrored in digitalizept/js/quintas.js for the street wizard.
 */

const QUINTAS_TYPE_ID = 'quintas-e-hotelaria';

const ALWAYS_VISIBLE_IDS = new Set([
    'nome_negocio',
    'telefone',
    'whatsapp',
    'email',
    'morada',
    'cidade',
    'maps_url',
    'variante'
]);

const QUINTAS_STEP_REQUIRED = ['nome_negocio', 'morada', 'cidade', 'telefone', 'whatsapp', 'numero_registo', 'variante'];

function isQuintasType(businessType) {
    return Boolean(businessType && businessType.id === QUINTAS_TYPE_ID);
}

function resolveVarianteId(dados, businessType) {
    const raw = String((dados && dados.variante) || '').trim();
    const variantes = (businessType && businessType.variantes) || {};
    if (raw && variantes[raw]) return raw;
    return '';
}

function activeGroupIds(businessType, varianteId) {
    const type = businessType || {};
    const variantes = type.variantes || {};
    if (varianteId && variantes[varianteId] && Array.isArray(variantes[varianteId].grupos)) {
        return variantes[varianteId].grupos.slice();
    }
    // Before variante is chosen: only identidade (includes variante itself).
    return ['identidade'];
}

function fieldIdsForGroups(businessType, groupIds) {
    const groups = (businessType && businessType.grupos_campos) || {};
    const ids = new Set();
    (groupIds || []).forEach((gid) => {
        (groups[gid] || []).forEach((fid) => ids.add(fid));
    });
    return ids;
}

function activeFieldIds(businessType, dados) {
    const varianteId = resolveVarianteId(dados, businessType);
    return fieldIdsForGroups(businessType, activeGroupIds(businessType, varianteId));
}

function isFieldActiveForVariante(businessType, dados, fieldId) {
    if (!fieldId) return false;
    if (ALWAYS_VISIBLE_IDS.has(fieldId)) return true;
    if (!isQuintasType(businessType)) return true;
    return activeFieldIds(businessType, dados).has(fieldId);
}

function filterFieldsByVariante(fields, businessType, dados) {
    if (!isQuintasType(businessType)) return fields || [];
    return (fields || []).filter((f) => isFieldActiveForVariante(businessType, dados, f && f.id));
}

function filterPerguntasByVariante(perguntas, businessType, dados) {
    if (!isQuintasType(businessType)) return perguntas || [];
    const active = activeFieldIds(businessType, dados);
    const varianteId = resolveVarianteId(dados, businessType);
    return (perguntas || []).filter((q) => {
        if (!q || !q.id) return false;
        if (q.id === 'variante') return true;
        if (!varianteId) {
            return (q.grupo === 'identidade') || active.has(q.id);
        }
        if (q.grupo) {
            return activeGroupIds(businessType, varianteId).includes(q.grupo);
        }
        return active.has(q.id);
    });
}

function applyVarianteDefaults(dados, businessType) {
    const d = dados && typeof dados === 'object' ? dados : {};
    if (!isQuintasType(businessType)) return d;
    const idiomasDefault = businessType.idiomas_default || 'pt, en';
    if (!String(d.idiomas || '').trim()) d.idiomas = idiomasDefault;

    const varianteId = resolveVarianteId(d, businessType);
    if (varianteId && businessType.variantes[varianteId]) {
        const v = businessType.variantes[varianteId];
        // Surface variante CTAs on the type object for demo generation later.
        d._variante_label = v.label || varianteId;
    }
    return d;
}

function resolveEffectiveTypePresentation(businessType, dados) {
    const type = businessType && typeof businessType === 'object' ? { ...businessType } : {};
    if (!isQuintasType(type)) return type;
    const varianteId = resolveVarianteId(dados, type);
    const v = varianteId && type.variantes ? type.variantes[varianteId] : null;
    if (!v) return type;
    if (Array.isArray(v.seccoes_landing) && v.seccoes_landing.length) {
        type.seccoes_landing = v.seccoes_landing.slice();
    }
    if (Array.isArray(v.ctas_hero) && v.ctas_hero.length) {
        type.ctas_hero = v.ctas_hero.slice();
    }
    if (v.cta_bloco && typeof v.cta_bloco === 'object') {
        type.cta_bloco = { ...v.cta_bloco };
    }
    return type;
}

function wizardPageSpecs(businessType, dados, standardFields) {
    const type = businessType || {};
    const ordem = Array.isArray(type.wizard_ordem) ? type.wizard_ordem : [];
    const active = activeFieldIds(type, dados);
    const varianteId = resolveVarianteId(dados, type);
    const pages = [];

    ordem.forEach((id) => {
        if (id === '_maps') {
            pages.push({
                id: '_maps',
                kind: 'maps',
                title: 'Tem o link do Google Maps?',
                hint: 'Cole o link — preenche nome, morada e telefone. Se não tiver, avance e escreva à mão.',
                required: false
            });
            return;
        }
        if (id === 'variante') {
            const items = Object.keys(type.variantes || {}).map((vid) => ({
                id: vid,
                name: type.variantes[vid].label || vid,
                desc: type.variantes[vid].desc || ''
            }));
            pages.push({
                id: 'variante',
                kind: 'choices',
                title: 'Que tipo de espaço é?',
                hint: 'Eventos, estadia ou os dois — muda os ecrãs seguintes.',
                required: true,
                items
            });
            return;
        }
        // Hide fields outside active groups (after variante chosen).
        if (varianteId && !ALWAYS_VISIBLE_IDS.has(id) && !active.has(id)) return;
        // Before variante: only identidade group + variante + maps.
        if (!varianteId && !ALWAYS_VISIBLE_IDS.has(id) && !active.has(id)) return;

        const pergunta = (type.perguntas_especificas || []).find((q) => q.id === id) || {};
        const def = (standardFields && standardFields[id]) || {};
        const tipo = pergunta.tipo || def.tipo || 'texto';
        const label = pergunta.label || def.label || id;
        const hint = pergunta.hint || def.placeholder || '';
        const required = (type.campos_obrigatorios || []).includes(id)
            || QUINTAS_STEP_REQUIRED.includes(id);

        let kind = 'text';
        let items = null;
        if (tipo === 'sim_nao') {
            kind = 'toggle';
        } else if (tipo === 'lista') {
            kind = 'choices';
            const opcoes = def.opcoes || pergunta.opcoes || [];
            items = opcoes.map((o) => ({
                id: o.id,
                name: o.nome || o.label || o.id,
                desc: o.desc || ''
            }));
        } else if (tipo === 'texto_longo') {
            kind = 'long';
        } else if (tipo === 'url') {
            kind = 'url';
        } else if (tipo === 'telefone') {
            kind = 'tel';
        }

        // Conditional: taxa valor only if aplica = sim
        if (id === 'taxa_turistica_valor' || id === 'taxa_turistica_max_noites') {
            const aplica = String((dados && dados.taxa_turistica_aplica) || '').toLowerCase();
            if (aplica !== 'sim' && aplica !== 'Sim') return;
        }

        pages.push({
            id,
            kind,
            title: label,
            hint,
            required,
            items,
            def: { label, tipo, placeholder: def.placeholder || '' }
        });
    });

    return pages;
}

function isQuintasDataValid(dados) {
    const d = dados || {};
    return QUINTAS_STEP_REQUIRED.every((id) => String(d[id] || '').trim().length > 0);
}

module.exports = {
    QUINTAS_TYPE_ID,
    QUINTAS_STEP_REQUIRED,
    ALWAYS_VISIBLE_IDS,
    isQuintasType,
    resolveVarianteId,
    activeGroupIds,
    fieldIdsForGroups,
    activeFieldIds,
    isFieldActiveForVariante,
    filterFieldsByVariante,
    filterPerguntasByVariante,
    applyVarianteDefaults,
    resolveEffectiveTypePresentation,
    wizardPageSpecs,
    isQuintasDataValid
};
