export function coverageTypeId(pin) {
    return String((pin && pin.business_type) || '').trim();
}

export function coverageResultadoId(pin) {
    const res = String((pin && pin.resultado) || '').trim();
    if (res) return res;
    if (pin && (pin.estado === 'fechado' || pin.dealEstado === 'fechado')) return 'digitalizado';
    return '';
}

export function pinMatchesCoverageFilters(pin, { filterIds, filterTypes, query, typeLabel } = {}) {
    if (filterIds && filterIds.size) {
        const etapa = pin.etapa || pin.cobertura || 'contacto_remoto';
        const resultado = coverageResultadoId(pin);
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

function bump(map, key) {
    const id = key == null ? '' : String(key);
    map.set(id, (map.get(id) || 0) + 1);
}

export function coverageCounts(pins) {
    const list = Array.isArray(pins) ? pins : [];
    const byType = new Map();
    const byResultado = new Map();
    const byEtapa = new Map();
    let mapped = 0;
    list.forEach((pin) => {
        bump(byType, coverageTypeId(pin));
        bump(byResultado, coverageResultadoId(pin));
        bump(byEtapa, (pin && (pin.etapa || pin.cobertura)) || '');
        if (Number.isFinite(pin && pin.lat) && Number.isFinite(pin && pin.lng)) mapped += 1;
    });
    return {
        total: list.length,
        mapped,
        unmapped: list.length - mapped,
        byType,
        byResultado,
        byEtapa
    };
}
