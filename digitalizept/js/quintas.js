/**
 * Browser mirror of server/lib/digitalizept-quintas.js — keep behaviour in sync.
 * Street wizard imports this; Admin dossier uses the CJS server module.
 */

export const QUINTAS_TYPE_ID = 'quintas-e-hotelaria';

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

export const QUINTAS_STEP_REQUIRED = [
    'nome_negocio',
    'morada',
    'cidade',
    'telefone',
    'whatsapp',
    'numero_registo',
    'variante'
];

export function isQuintasType(businessType) {
    return Boolean(businessType && businessType.id === QUINTAS_TYPE_ID);
}

export function resolveVarianteId(dados, businessType) {
    const raw = String((dados && dados.variante) || '').trim();
    const variantes = (businessType && businessType.variantes) || {};
    if (raw && variantes[raw]) return raw;
    return '';
}

export function activeGroupIds(businessType, varianteId) {
    const type = businessType || {};
    const variantes = type.variantes || {};
    if (varianteId && variantes[varianteId] && Array.isArray(variantes[varianteId].grupos)) {
        return variantes[varianteId].grupos.slice();
    }
    return ['identidade'];
}

export function fieldIdsForGroups(businessType, groupIds) {
    const groups = (businessType && businessType.grupos_campos) || {};
    const ids = new Set();
    (groupIds || []).forEach((gid) => {
        (groups[gid] || []).forEach((fid) => ids.add(fid));
    });
    return ids;
}

export function activeFieldIds(businessType, dados) {
    const varianteId = resolveVarianteId(dados, businessType);
    return fieldIdsForGroups(businessType, activeGroupIds(businessType, varianteId));
}

export function isFieldActiveForVariante(businessType, dados, fieldId) {
    if (!fieldId) return false;
    if (ALWAYS_VISIBLE_IDS.has(fieldId)) return true;
    if (!isQuintasType(businessType)) return true;
    return activeFieldIds(businessType, dados).has(fieldId);
}

export function wizardPageSpecs(businessType, dados, standardFields) {
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
        if (varianteId && !ALWAYS_VISIBLE_IDS.has(id) && !active.has(id)) return;
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

        if (id === 'taxa_turistica_valor' || id === 'taxa_turistica_max_noites') {
            const aplica = String((dados && dados.taxa_turistica_aplica) || '').toLowerCase();
            if (aplica !== 'sim') return;
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

export function isQuintasDataValid(dados) {
    const d = dados || {};
    return QUINTAS_STEP_REQUIRED.every((id) => String(d[id] || '').trim().length > 0);
}

export function applyVarianteDefaults(dados, businessType) {
    const d = dados && typeof dados === 'object' ? dados : {};
    if (!isQuintasType(businessType)) return d;
    const idiomasDefault = businessType.idiomas_default || 'pt, en';
    if (!String(d.idiomas || '').trim()) d.idiomas = idiomasDefault;
    return d;
}
