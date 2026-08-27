export function coverageTypeId(pin) {
    return String((pin && pin.business_type) || '').trim();
}

export function coverageResultadoId(pin) {
    // Fecho on the lead is source of truth for the map ring — do not infer
    // "Cliente" from a closed deal / estado, or cleared pins stay stuck green.
    return String((pin && pin.resultado) || '').trim();
}

export function coverageProcessoId(pin) {
    return String((pin && (pin.processoEstado || pin.processo_estado)) || '').trim().toUpperCase();
}

export function pinMatchesCoverageFilters(pin, { filterIds, filterTypes, query, typeLabel } = {}) {
    if (filterIds && filterIds.size) {
        const etapa = pin.etapa || pin.cobertura || 'contacto_remoto';
        const resultado = coverageResultadoId(pin);
        const processo = coverageProcessoId(pin);
        if (!filterIds.has(etapa)
            && !(resultado && filterIds.has(resultado))
            && !(processo && filterIds.has(processo))) return false;
    }
    if (filterTypes && filterTypes.size) {
        if (!filterTypes.has(coverageTypeId(pin))) return false;
    }
    const q = String(query || '').trim().toLowerCase();
    if (!q) return true;
    return `${pin.nome || ''} ${pin.morada || ''} ${pin.cidade || ''} ${pin.experiencia || ''} ${pin.notas || ''} ${pin.leadNome || ''} ${pin.etapa || ''} ${pin.etapaLabel || ''} ${pin.resultado || ''} ${pin.resultadoLabel || ''} ${pin.processoEstado || ''} ${pin.processoEstadoLabel || ''} ${coverageTypeId(pin)} ${typeLabel || ''}`
        .toLowerCase()
        .includes(q);
}

function bump(map, key) {
    const id = key == null ? '' : String(key);
    map.set(id, (map.get(id) || 0) + 1);
}

export function coverageCounts(pins) {
    const list = Array.isArray(pins) ? pins : [];
    const byType = new Map();
    const byResultado = new Map();
    const byEtapa = new Map();
    const byProcesso = new Map();
    let mapped = 0;
    list.forEach((pin) => {
        bump(byType, coverageTypeId(pin));
        bump(byResultado, coverageResultadoId(pin));
        bump(byEtapa, (pin && (pin.etapa || pin.cobertura)) || '');
        bump(byProcesso, coverageProcessoId(pin));
        if (Number.isFinite(pin && pin.lat) && Number.isFinite(pin && pin.lng)) mapped += 1;
    });
    return {
        total: list.length,
        mapped,
        unmapped: list.length - mapped,
        byType,
        byResultado,
        byEtapa,
        byProcesso
    };
}
