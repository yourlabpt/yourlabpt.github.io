/**
 * OpenStreetMap Nominatim geocoding for the Digitalize Portugal coverage map.
 * No API key, no Google billing. One request per second (Nominatim policy).
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

const NOMINATIM_GAP_MS = 1100;
let nominatimLock = Promise.resolve();

function mapsApiKey() {
    return '';
}

function isValidCobertura(value) {
    return COBERTURA_VALUES.includes(String(value || ''));
}

function buildAddressQuery(morada, cidade) {
    const parts = [String(morada || '').trim(), String(cidade || '').trim(), 'Portugal']
        .filter(Boolean);
    return parts.join(', ');
}

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function enqueueNominatim(task) {
    const run = nominatimLock.then(task, task);
    nominatimLock = run.then(() => wait(NOMINATIM_GAP_MS), () => wait(NOMINATIM_GAP_MS));
    return run;
}

async function geocodeAddress(morada, cidade) {
    const address = buildAddressQuery(morada, cidade);
    if (!String(morada || '').trim() && !String(cidade || '').trim()) {
        return { ok: false, status: 'no_address', error: 'Morada em falta.' };
    }
    return enqueueNominatim(async () => {
        const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=pt&q=${encodeURIComponent(address)}`;
        try {
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'YourLab-DigitalizePortugal/1.0 (https://yourlabpt.com)',
                    'Accept-Language': 'pt'
                }
            });
            if (!response.ok) {
                return { ok: false, status: 'http_error', error: `HTTP ${response.status}` };
            }
            const data = await response.json();
            const hit = Array.isArray(data) && data[0];
            const lat = hit ? Number(hit.lat) : NaN;
            const lng = hit ? Number(hit.lon) : NaN;
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
                return { ok: false, status: 'failed', error: 'Sem coordenadas.' };
            }
            return {
                ok: true,
                status: 'ok',
                lat,
                lng,
                formatted: hit.display_name || address
            };
        } catch (err) {
            return { ok: false, status: 'network', error: err.message || 'network' };
        }
    });
}

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

async function geocodeVisitRow(db, visitId, { force = false, nowIso } = {}) {
    const row = db.prepare(`
        SELECT id, morada, cidade, lat, lng, geocode_status FROM visita WHERE id = ?
    `).get(visitId);
    if (!row) return null;
    const hasCoords = Number.isFinite(row.lat) && Number.isFinite(row.lng);
    if (!force && hasCoords && row.geocode_status === 'ok') {
        return { skipped: true, reason: 'cached' };
    }
    const result = await geocodeAddress(row.morada, row.cidade);
    const stamp = typeof nowIso === 'function' ? nowIso() : new Date().toISOString();
    if (result.ok) {
        db.prepare(`
            UPDATE visita SET lat = ?, lng = ?, geocode_status = 'ok' WHERE id = ?
        `).run(result.lat, result.lng, visitId);
        return { ok: true, lat: result.lat, lng: result.lng };
    }
    db.prepare(`UPDATE visita SET geocode_status = ? WHERE id = ?`)
        .run(result.status || 'failed', visitId);
    return { ok: false, status: result.status, error: result.error, stamp };
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

function formatCoverageExport(pins, legend) {
    const labels = {};
    (legend || []).forEach((item) => { labels[item.id] = item.label; });
    const groups = {};
    pins.forEach((pin) => {
        const id = pin.cobertura || 'contacto';
        if (!groups[id]) groups[id] = [];
        groups[id].push(pin);
    });
    const order = ['nao_interessa', 'visitado', 'contacto', 'demo', 'futuro', 'digitalizado'];
    const seen = new Set();
    const sections = [];
    order.concat(Object.keys(groups)).forEach((id) => {
        if (seen.has(id) || !groups[id] || !groups[id].length) return;
        seen.add(id);
        sections.push({ id, label: labels[id] || id, items: groups[id] });
    });

    const when = (iso) => {
        if (!iso) return '';
        const d = new Date(iso);
        return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('pt-PT');
    };

    const lines = [
        'DIGITALIZE PORTUGAL — REGISTO DE COBERTURA',
        `Gerado em ${new Date().toLocaleString('pt-PT')}`,
        '',
        'Sítios já contactados na rua. Não voltar a bater à mesma porta',
        'sem ler a experiência. Use isto para afinar a abordagem.',
        ''
    ];

    sections.forEach((section) => {
        lines.push(`== ${section.label.toUpperCase()} (${section.items.length}) ==`);
        lines.push('');
        section.items.forEach((pin) => {
            const where = [pin.morada, pin.cidade].filter(Boolean).join(', ') || 'morada por preencher';
            const kind = pin.kind === 'visita' ? 'visita de rua' : 'lead';
            lines.push(`${pin.nome || 'Sem nome'}  [${kind}]`);
            lines.push(`  Onde: ${where}`);
            if (pin.telefone) lines.push(`  Tel: ${pin.telefone}`);
            if (pin.visitado_em) lines.push(`  Visita: ${when(pin.visitado_em)}`);
            else if (pin.criado_em) lines.push(`  Registo: ${when(pin.criado_em)}`);
            if (pin.experiencia) {
                lines.push('  Experiência:');
                String(pin.experiencia).split(/\r?\n/).forEach((line) => {
                    lines.push(`    ${line}`);
                });
            }
            if (pin.notas) {
                lines.push('  Notas:');
                String(pin.notas).split(/\r?\n/).forEach((line) => {
                    lines.push(`    ${line}`);
                });
            }
            lines.push('');
        });
    });

    if (!sections.length) {
        lines.push('(ainda sem sítios registados)');
        lines.push('');
    }

    return `${lines.join('\n').trim()}\n`;
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
    geocodeVisitRow,
    extractCidadeFromDadosJson,
    backfillLeadGeoFields,
    formatCoverageExport
};
