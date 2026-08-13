/**
 * Google Geocoding for Digitalize Portugal coverage map.
 * Requires GOOGLE_MAPS_API_KEY with Geocoding API enabled.
 */
const COBERTURA_VALUES = [
    'contacto',
    'visitado',
    'demo',
    'futuro',
    'nao_interessa',
    'digitalizado'
];

const COBERTURA_LABELS = {
    contacto: 'Contacto',
    visitado: 'Visitado',
    demo: 'Demo apresentada',
    futuro: 'Futuro',
    nao_interessa: 'Não interessa',
    digitalizado: 'Digitalizado'
};

const COBERTURA_COLORS = {
    contacto: '#a9a8a3',
    visitado: '#1b1b1b',
    demo: '#e8d5b7',
    futuro: '#7a8a99',
    nao_interessa: '#ff6b6b',
    digitalizado: '#4ade80'
};

function mapsApiKey() {
    return String(process.env.GOOGLE_MAPS_API_KEY || '').trim();
}

function isValidCobertura(value) {
    return COBERTURA_VALUES.includes(String(value || ''));
}

function buildAddressQuery(morada, cidade) {
    const parts = [String(morada || '').trim(), String(cidade || '').trim(), 'Portugal']
        .filter(Boolean);
    return parts.join(', ');
}

async function geocodeAddress(morada, cidade) {
    const key = mapsApiKey();
    if (!key) {
        return { ok: false, status: 'no_key', error: 'GOOGLE_MAPS_API_KEY em falta.' };
    }
    const address = buildAddressQuery(morada, cidade);
    if (!String(morada || '').trim() && !String(cidade || '').trim()) {
        return { ok: false, status: 'no_address', error: 'Morada em falta.' };
    }
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${encodeURIComponent(key)}&language=pt-PT&region=pt`;
    try {
        const response = await fetch(url);
        if (!response.ok) {
            return { ok: false, status: 'http_error', error: `HTTP ${response.status}` };
        }
        const data = await response.json();
        if (data.status !== 'OK' || !Array.isArray(data.results) || !data.results[0]) {
            return { ok: false, status: String(data.status || 'failed').toLowerCase(), error: data.error_message || data.status };
        }
        const loc = data.results[0].geometry && data.results[0].geometry.location;
        if (!loc || typeof loc.lat !== 'number' || typeof loc.lng !== 'number') {
            return { ok: false, status: 'failed', error: 'Sem coordenadas.' };
        }
        return {
            ok: true,
            status: 'ok',
            lat: loc.lat,
            lng: loc.lng,
            formatted: data.results[0].formatted_address || address
        };
    } catch (err) {
        return { ok: false, status: 'network', error: err.message || 'network' };
    }
}

/**
 * Geocode a lead when address is new/changed or force=true.
 * Skips failed geocodes unless the address changed or force is set.
 */
async function geocodeLeadRow(db, leadId, { force = false, nowIso } = {}) {
    const lead = db.prepare(`
        SELECT id, morada, cidade, lat, lng, geocode_status, geocoded_at
        FROM lead WHERE id = ?
    `).get(leadId);
    if (!lead) return null;

    const hasCoords = Number.isFinite(lead.lat) && Number.isFinite(lead.lng);
    if (!force && hasCoords && lead.geocode_status === 'ok') {
        return { skipped: true, reason: 'cached' };
    }
    if (!force && lead.geocode_status === 'failed' && hasCoords === false) {
        // Allow retry when force or when caller already cleared status after address change.
    }

    const result = await geocodeAddress(lead.morada, lead.cidade);
    const stamp = typeof nowIso === 'function' ? nowIso() : new Date().toISOString();
    if (result.ok) {
        db.prepare(`
            UPDATE lead SET lat = ?, lng = ?, geocoded_at = ?, geocode_status = 'ok'
            WHERE id = ?
        `).run(result.lat, result.lng, stamp, leadId);
        return { ok: true, lat: result.lat, lng: result.lng };
    }
    db.prepare(`
        UPDATE lead SET geocoded_at = ?, geocode_status = ?
        WHERE id = ?
    `).run(stamp, result.status || 'failed', leadId);
    return { ok: false, status: result.status, error: result.error };
}

function extractCidadeFromDadosJson(obrigatoriosJson, opcionaisJson) {
    try {
        const a = JSON.parse(obrigatoriosJson || '{}') || {};
        const b = JSON.parse(opcionaisJson || '{}') || {};
        return String(b.cidade || a.cidade || '').trim();
    } catch (_) {
        return '';
    }
}

function backfillLeadGeoFields(db) {
    const rows = db.prepare(`
        SELECT l.id, l.cidade, l.cobertura, l.estado,
               d.obrigatorios_json, d.opcionais_json
        FROM lead l
        LEFT JOIN dados_negocio d ON d.lead_id = l.id
    `).all();
    const updateCidade = db.prepare('UPDATE lead SET cidade = ? WHERE id = ?');
    const updateCobertura = db.prepare('UPDATE lead SET cobertura = ? WHERE id = ?');
    rows.forEach((row) => {
        if (!row.cidade) {
            const cidade = extractCidadeFromDadosJson(row.obrigatorios_json, row.opcionais_json);
            if (cidade) updateCidade.run(cidade, row.id);
        }
        if (!row.cobertura) {
            let cobertura = 'contacto';
            if (row.estado === 'fechado') cobertura = 'digitalizado';
            else if (row.estado === 'demonstracao') cobertura = 'demo';
            updateCobertura.run(cobertura, row.id);
        }
    });
}

module.exports = {
    COBERTURA_VALUES,
    COBERTURA_LABELS,
    COBERTURA_COLORS,
    mapsApiKey,
    isValidCobertura,
    buildAddressQuery,
    geocodeAddress,
    geocodeLeadRow,
    extractCidadeFromDadosJson,
    backfillLeadGeoFields
};
