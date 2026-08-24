export function coverageTypeId(pin) {
    return String((pin && pin.business_type) || '').trim();
}

const TYPE_DOTS = ['#007aff', '#34c759', '#ff9500', '#af52de', '#ff2d55', '#5856d6', '#ffcc00', '#64d2ff'];

export function coverageTypeDot(id) {
    const key = String(id || '');
    if (!key) return '#c7c7cc';
    let hash = 0;
    for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
    return TYPE_DOTS[hash % TYPE_DOTS.length];
}

export function pinMatchesCoverageFilters(pin, { filterIds, filterTypes, query, typeLabel } = {}) {
    if (filterIds && filterIds.size) {
        const etapa = pin.etapa || pin.cobertura || 'contacto_remoto';
        const resultado = pin.resultado || '';
        if (!filterIds.has(etapa) && !(resultado && filterIds.has(resultado))) return false;
    }
    if (filterTypes && filterTypes.size) {
        if (!filterTypes.has(coverageTypeId(pin))) return false;
    }
    const q = String(query || '').trim().toLowerCase();
    if (!q) return true;
    return `${pin.nome || ''} ${pin.morada || ''} ${pin.cidade || ''} ${pin.experiencia || ''} ${pin.notas || ''} ${pin.leadNome || ''} ${pin.etapa || ''} ${pin.resultado || ''} ${coverageTypeId(pin)} ${typeLabel || ''}`
        .toLowerCase()
        .includes(q);
}
