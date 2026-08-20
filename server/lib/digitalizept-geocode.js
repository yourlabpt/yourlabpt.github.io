/**
 * OpenStreetMap Nominatim geocoding for the Digitalize Portugal coverage map.
 * No API key, no Google billing. One request per second (Nominatim policy).
 *
 * Strategy: structured search first (street + city + Portugal), then free-text
 * fallback. Prefer house/building/amenity hits over city centroids so pins
 * land on the shop, not the town centre.
 *
 * Coverage pins use two tags:
 *   etapa (fill)     — funnel progress
 *   resultado (stroke) — parked / lost / won
 * The DB column `cobertura` stores etapa; `resultado` is its own column.
 */

const ETAPA_VALUES = [
    'contacto_remoto',
    'visitado',
    'demo_criada',
    'demo_apresentada'
];

const ETAPA_LABELS = {
    contacto_remoto: 'Contacto Remoto',
    visitado: 'Visitado',
    demo_criada: 'Demo criada',
    demo_apresentada: 'Demo apresentada'
};

const ETAPA_COLORS = {
    contacto_remoto: '#8e8a84',
    visitado: '#1f1f1f',
    demo_criada: '#d4b896',
    demo_apresentada: '#c9a227'
};

const RESULTADO_VALUES = [
    'futuro',
    'sem_interesse',
    'digitalizado'
];

const RESULTADO_LABELS = {
    futuro: 'Futuro',
    sem_interesse: 'Sem Interesse',
    digitalizado: 'Digitalizado'
};

const RESULTADO_COLORS = {
    futuro: '#5b7c99',
    sem_interesse: '#e05a5a',
    digitalizado: '#3d9a6a'
};

/** @deprecated use ETAPA_*; kept as aliases for older imports */
const COBERTURA_VALUES = ETAPA_VALUES;
const COBERTURA_LABELS = ETAPA_LABELS;
const COBERTURA_COLORS = ETAPA_COLORS;

const OLD_COBERTURA_REMAP = {
    contacto: { etapa: 'contacto_remoto', resultado: '' },
    visitado: { etapa: 'visitado', resultado: '' },
    demo: { etapa: 'demo_apresentada', resultado: '' },
    futuro: { etapa: 'visitado', resultado: 'futuro' },
    nao_interessa: { etapa: 'visitado', resultado: 'sem_interesse' },
    digitalizado: { etapa: 'demo_apresentada', resultado: 'digitalizado' }
};

const NOMINATIM_GAP_MS = 1100;
const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/search';

// Prefer precise place types over admin/city centroids.
const PRECISE_TYPES = new Set([
    'house', 'building', 'residential', 'commercial', 'retail', 'shop',
    'amenity', 'office', 'industrial', 'yes', 'apartments', 'terrace',
    'detached', 'cafe', 'restaurant', 'bakery', 'hairdresser', 'pharmacy',
    'supermarket', 'convenience', 'clothes', 'beauty', 'clinic', 'doctors'
]);
const COARSE_TYPES = new Set([
    'city', 'town', 'village', 'municipality', 'suburb', 'neighbourhood',
    'quarter', 'county', 'state', 'region', 'administrative', 'postcode',
    'district', 'borough'
]);

let nominatimLock = Promise.resolve();

function mapsApiKey() {
    return '';
}

function isValidEtapa(value) {
    return ETAPA_VALUES.includes(String(value || ''));
}

function isValidResultado(value) {
    const v = String(value || '');
    return v === '' || RESULTADO_VALUES.includes(v);
}

/** Accepts new etapa ids or legacy cobertura ids. */
function isValidCobertura(value) {
    const v = String(value || '');
    return isValidEtapa(v) || Boolean(OLD_COBERTURA_REMAP[v]);
}

function normalizeEtapa(value, fallback = 'contacto_remoto') {
    const v = String(value || '').trim();
    if (isValidEtapa(v)) return v;
    if (OLD_COBERTURA_REMAP[v]) return OLD_COBERTURA_REMAP[v].etapa;
    return fallback;
}

function normalizeResultado(value) {
    const v = String(value || '').trim();
    if (!v) return '';
    if (RESULTADO_VALUES.includes(v)) return v;
    if (v === 'nao_interessa') return 'sem_interesse';
    return '';
}

function pinColors(etapa, resultado) {
    const fill = ETAPA_COLORS[normalizeEtapa(etapa)] || ETAPA_COLORS.contacto_remoto;
    const res = normalizeResultado(resultado);
    if (res) {
        return {
            color: fill,
            strokeColor: RESULTADO_COLORS[res] || '#1b1b1b',
            strokeWidth: 2.8
        };
    }
    return {
        color: fill,
        strokeColor: '#1b1b1b',
        strokeWidth: 1.2
    };
}

function etapaRank(etapa) {
    const idx = ETAPA_VALUES.indexOf(normalizeEtapa(etapa));
    return idx < 0 ? 0 : idx;
}

/**
 * One-shot: split legacy single cobertura into etapa (cobertura column) + resultado.
 */
function remapCoberturaToEtapaResultado(db) {
    const oldIds = Object.keys(OLD_COBERTURA_REMAP);
    ['lead', 'visita'].forEach((table) => {
        const cols = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name));
        if (!cols.has('cobertura') || !cols.has('resultado')) return;
        const rows = db.prepare(`SELECT id, cobertura, resultado FROM ${table}`).all();
        const update = db.prepare(`UPDATE ${table} SET cobertura = ?, resultado = ? WHERE id = ?`);
        rows.forEach((row) => {
            const mapped = OLD_COBERTURA_REMAP[row.cobertura];
            if (!mapped) return;
            const nextResultado = row.resultado || mapped.resultado || '';
            update.run(mapped.etapa, nextResultado, row.id);
        });
        // Also rewrite default leftovers that somehow still use old ids
        oldIds.forEach((oldId) => {
            const mapped = OLD_COBERTURA_REMAP[oldId];
            db.prepare(`UPDATE ${table} SET cobertura = ?, resultado = CASE WHEN resultado = '' OR resultado IS NULL THEN ? ELSE resultado END WHERE cobertura = ?`)
                .run(mapped.etapa, mapped.resultado || '', oldId);
        });
    });
}

function buildAddressQuery(morada, cidade, nome) {
    const parts = [
        String(nome || '').trim(),
        String(morada || '').trim(),
        String(cidade || '').trim(),
        'Portugal'
    ].filter(Boolean);
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

function scoreHit(hit, { morada, cidade } = {}) {
    if (!hit) return -Infinity;
    const type = String(hit.type || '').toLowerCase();
    const cls = String(hit.class || '').toLowerCase();
    const importance = Number(hit.importance) || 0;
    let score = importance * 10;

    if (PRECISE_TYPES.has(type) || PRECISE_TYPES.has(cls)) score += 40;
    if (cls === 'building' || cls === 'place' && type === 'house') score += 20;
    if (cls === 'amenity' || cls === 'shop' || cls === 'office') score += 25;
    if (COARSE_TYPES.has(type) || (cls === 'place' && COARSE_TYPES.has(type))) score -= 50;
    if (cls === 'boundary' || type === 'administrative') score -= 60;

    const display = String(hit.display_name || '').toLowerCase();
    const street = String(morada || '').trim().toLowerCase();
    const city = String(cidade || '').trim().toLowerCase();
    if (street && display.includes(street.split(/\s+/)[0])) score += 8;
    if (city && display.includes(city)) score += 12;

    // Prefer results with a house number when the address has one.
    if (/\d/.test(street) && /\d/.test(display)) score += 10;

    return score;
}

function pickBestHit(hits, context = {}) {
    if (!Array.isArray(hits) || !hits.length) return null;
    let best = null;
    let bestScore = -Infinity;
    hits.forEach((hit) => {
        const score = scoreHit(hit, context);
        if (score > bestScore) {
            bestScore = score;
            best = hit;
        }
    });
    return best;
}

function coordsFromHit(hit, fallbackLabel) {
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
        formatted: (hit && hit.display_name) || fallbackLabel,
        type: hit.type || '',
        class: hit.class || '',
        importance: Number(hit.importance) || 0
    };
}

async function nominatimFetch(params) {
    const qs = new URLSearchParams({
        format: 'jsonv2',
        addressdetails: '1',
        countrycodes: 'pt',
        limit: '5'
    });
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value == null || value === '') return;
        qs.set(key, String(value));
    });
    const url = `${NOMINATIM_BASE}?${qs.toString()}`;
    const response = await fetch(url, {
        headers: {
            'User-Agent': 'YourLab-DigitalizePortugal/1.0 (https://yourlabpt.com)',
            'Accept-Language': 'pt'
        }
    });
    if (!response.ok) {
        return { ok: false, status: 'http_error', error: `HTTP ${response.status}`, hits: [] };
    }
    const data = await response.json();
    return { ok: true, hits: Array.isArray(data) ? data : [] };
}

/**
 * @param {string} morada
 * @param {string} cidade
 * @param {{ nome?: string }} [opts]
 */
async function geocodeAddress(morada, cidade, opts = {}) {
    const street = String(morada || '').trim();
    const city = String(cidade || '').trim();
    const nome = String(opts.nome || '').trim();
    if (!street && !city) {
        return { ok: false, status: 'no_address', error: 'Morada em falta.' };
    }

    const context = { morada: street, cidade: city };
    const freeText = buildAddressQuery(street, city, nome);

    return enqueueNominatim(async () => {
        try {
            let hits = [];

            // 1) Structured search — Nominatim prefers street+city over a free blob.
            if (street || city) {
                const structured = await nominatimFetch({
                    street: street || undefined,
                    city: city || undefined,
                    country: 'Portugal'
                });
                if (!structured.ok) return structured;
                hits = structured.hits;
            }

            // 2) Free-text fallback (with optional business name) if structured is empty
            //    or only returned coarse admin/city results.
            const bestStructured = pickBestHit(hits, context);
            const structuredIsCoarse = bestStructured && (
                COARSE_TYPES.has(String(bestStructured.type || '').toLowerCase())
                || String(bestStructured.class || '') === 'boundary'
            );

            if (!hits.length || structuredIsCoarse || (nome && street)) {
                if (hits.length) await wait(NOMINATIM_GAP_MS);
                const free = await nominatimFetch({ q: freeText });
                if (free.ok && free.hits.length) {
                    hits = hits.concat(free.hits);
                } else if (!hits.length && !free.ok) {
                    return free;
                }
            }

            const hit = pickBestHit(hits, context);
            return coordsFromHit(hit, freeText);
        } catch (err) {
            return { ok: false, status: 'network', error: err.message || 'network' };
        }
    });
}

async function geocodeLeadRow(db, leadId, { force = false, nowIso } = {}) {
    const lead = db.prepare(`
        SELECT id, nome, morada, cidade, lat, lng, geocode_status, geocoded_at
        FROM lead WHERE id = ?
    `).get(leadId);
    if (!lead) return null;

    const hasCoords = Number.isFinite(lead.lat) && Number.isFinite(lead.lng);
    // Keep manual pins unless the operator forces a re-geocode.
    if (!force && hasCoords && (lead.geocode_status === 'ok' || lead.geocode_status === 'manual')) {
        return { skipped: true, reason: 'cached' };
    }

    const result = await geocodeAddress(lead.morada, lead.cidade, { nome: lead.nome });
    const stamp = typeof nowIso === 'function' ? nowIso() : new Date().toISOString();
    if (result.ok) {
        db.prepare(`
            UPDATE lead SET lat = ?, lng = ?, geocoded_at = ?, geocode_status = 'ok'
            WHERE id = ?
        `).run(result.lat, result.lng, stamp, leadId);
        return { ok: true, lat: result.lat, lng: result.lng, formatted: result.formatted };
    }
    db.prepare(`
        UPDATE lead SET geocoded_at = ?, geocode_status = ?
        WHERE id = ?
    `).run(stamp, result.status || 'failed', leadId);
    return { ok: false, status: result.status, error: result.error };
}

async function geocodeVisitRow(db, visitId, { force = false, nowIso } = {}) {
    const row = db.prepare(`
        SELECT id, nome, morada, cidade, lat, lng, geocode_status FROM visita WHERE id = ?
    `).get(visitId);
    if (!row) return null;
    const hasCoords = Number.isFinite(row.lat) && Number.isFinite(row.lng);
    if (!force && hasCoords && (row.geocode_status === 'ok' || row.geocode_status === 'manual')) {
        return { skipped: true, reason: 'cached' };
    }
    const result = await geocodeAddress(row.morada, row.cidade, { nome: row.nome });
    const stamp = typeof nowIso === 'function' ? nowIso() : new Date().toISOString();
    if (result.ok) {
        db.prepare(`
            UPDATE visita SET lat = ?, lng = ?, geocode_status = 'ok' WHERE id = ?
        `).run(result.lat, result.lng, visitId);
        return { ok: true, lat: result.lat, lng: result.lng, formatted: result.formatted };
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
        SELECT l.id, l.cidade, l.cobertura, l.resultado, l.estado,
               d.obrigatorios_json, d.opcionais_json
        FROM lead l
        LEFT JOIN dados_negocio d ON d.lead_id = l.id
    `).all();
    const updateCidade = db.prepare('UPDATE lead SET cidade = ? WHERE id = ?');
    const updateTags = db.prepare('UPDATE lead SET cobertura = ?, resultado = ? WHERE id = ?');
    rows.forEach((row) => {
        if (!row.cidade) {
            const cidade = extractCidadeFromDadosJson(row.obrigatorios_json, row.opcionais_json);
            if (cidade) updateCidade.run(cidade, row.id);
        }
        if (!row.cobertura) {
            let etapa = 'contacto_remoto';
            let resultado = row.resultado || '';
            if (row.estado === 'fechado') {
                etapa = 'demo_apresentada';
                resultado = resultado || 'digitalizado';
            } else if (row.estado === 'demonstracao') {
                etapa = 'demo_criada';
            }
            updateTags.run(etapa, resultado, row.id);
        }
    });
}

function formatCoverageExport(pins, legend) {
    const labels = {};
    const flat = Array.isArray(legend)
        ? legend
        : [...(legend?.etapas || []), ...(legend?.resultados || [])];
    flat.forEach((item) => { labels[item.id] = item.label; });
    const groups = {};
    pins.forEach((pin) => {
        const etapa = pin.etapa || pin.cobertura || 'contacto_remoto';
        const resultado = pin.resultado || '';
        const key = resultado ? `${etapa}|${resultado}` : etapa;
        if (!groups[key]) groups[key] = [];
        groups[key].push(pin);
    });
    const order = [
        'contacto_remoto',
        'visitado',
        'demo_criada',
        'demo_apresentada'
    ];
    const seen = new Set();
    const sections = [];
    order.forEach((id) => {
        Object.keys(groups).filter((k) => k === id || k.startsWith(`${id}|`)).forEach((key) => {
            if (seen.has(key) || !groups[key].length) return;
            seen.add(key);
            const [etapa, resultado] = key.split('|');
            const label = resultado
                ? `${labels[etapa] || etapa} · ${labels[resultado] || resultado}`
                : (labels[etapa] || etapa);
            sections.push({ id: key, label, items: groups[key] });
        });
    });
    Object.keys(groups).forEach((key) => {
        if (seen.has(key) || !groups[key].length) return;
        seen.add(key);
        const [etapa, resultado] = key.split('|');
        const label = resultado
            ? `${labels[etapa] || etapa} · ${labels[resultado] || resultado}`
            : (labels[etapa] || etapa);
        sections.push({ id: key, label, items: groups[key] });
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
        'Sítios já contactados na rua. Etapa = progresso; Resultado = Futuro / Sem Interesse / Digitalizado.',
        'Não voltar a bater à mesma porta sem ler a experiência.',
        ''
    ];

    sections.forEach((section) => {
        lines.push(`== ${section.label.toUpperCase()} (${section.items.length}) ==`);
        lines.push('');
        section.items.forEach((pin) => {
            const where = [pin.morada, pin.cidade].filter(Boolean).join(', ') || 'morada por preencher';
            const kind = pin.kind === 'visita' ? 'visita de rua' : 'lead';
            const etapa = pin.etapa || pin.cobertura || '';
            const resultado = pin.resultado || '';
            lines.push(`${pin.nome || 'Sem nome'}  [${kind}]`);
            lines.push(`  Onde: ${where}`);
            lines.push(`  Etapa: ${labels[etapa] || etapa || '—'}${resultado ? ` · Resultado: ${labels[resultado] || resultado}` : ''}`);
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
    ETAPA_VALUES,
    ETAPA_LABELS,
    ETAPA_COLORS,
    RESULTADO_VALUES,
    RESULTADO_LABELS,
    RESULTADO_COLORS,
    COBERTURA_VALUES,
    COBERTURA_LABELS,
    COBERTURA_COLORS,
    OLD_COBERTURA_REMAP,
    mapsApiKey,
    isValidEtapa,
    isValidResultado,
    isValidCobertura,
    normalizeEtapa,
    normalizeResultado,
    pinColors,
    etapaRank,
    remapCoberturaToEtapaResultado,
    buildAddressQuery,
    geocodeAddress,
    geocodeLeadRow,
    geocodeVisitRow,
    extractCidadeFromDadosJson,
    backfillLeadGeoFields,
    formatCoverageExport,
    // Exported for unit tests
    scoreHit,
    pickBestHit
};
