/**
 * OpenStreetMap Nominatim geocoding for the Digitalize Portugal coverage map.
 * No API key, no Google billing. One request per second (Nominatim policy).
 *
 * Strategy: structured search first (street + city + Portugal), then free-text
 * fallback. Prefer house/building/amenity hits over city centroids so pins
 * land on the shop, not the town centre.
 *
 * Coverage pins (map only):
 *   business type  (fill)  — what kind of shop
 *   resultado/fecho (ring) — closed outcome; neutral ring when still open
 * Controlo / na-rua stay as filters and card chrome — not map colours.
 */

const ETAPA_VALUES = [
    'contacto_remoto',
    'visitado',
    'demo_criada',
    'demo_apresentada'
];

const ETAPA_LABELS = {
    contacto_remoto: 'Por visitar',
    visitado: 'Visitado',
    demo_criada: 'Com demo',
    demo_apresentada: 'Mostrada'
};

/** @deprecated Na rua no longer colours the map; kept for older imports / chips without swatch. */
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
    futuro: 'Mais tarde',
    sem_interesse: 'Não quer',
    digitalizado: 'Cliente'
};

/** Ring colours — fecho only (distinct from Controlo card accents). */
const RESULTADO_COLORS = {
    futuro: '#2563eb',
    sem_interesse: '#78716c',
    digitalizado: '#15803d'
};

/** Fill when type is unknown. */
const PIN_FILL_UNSET = '#e7e5e4';

/** Ring when the lead is still open (no fecho). */
const PIN_STROKE_OPEN = '#1c1917';

/**
 * Map pin fills by business type — keep distinct from PROCESSO_COLORS (cards).
 */
const TYPE_COLORS = {
    'cafe-pastelaria': '#c2410c',
    'clinica-estetica': '#a21caf',
    'drogaria-ferragens': '#3f6212',
    generico: '#57534e',
    joalharia: '#a16207',
    'loja-flores-decoracao': '#0f766e',
    'loja-roupa': '#be123c',
    'mecanico-automovel': '#1e3a8a',
    mercadinho: '#b45309',
    otica: '#0e7490',
    restaurante: '#991b1b',
    'salao-beleza': '#9d174d',
    tapecaria: '#6d28d9'
};

function typeColor(businessType) {
    const id = String(businessType || '').trim();
    if (!id) return PIN_FILL_UNSET;
    if (TYPE_COLORS[id]) return TYPE_COLORS[id];
    let hash = 0;
    for (let i = 0; i < id.length; i += 1) hash = ((hash << 5) - hash) + id.charCodeAt(i);
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue} 42% 38%)`;
}

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
const NOMINATIM_REVERSE = 'https://nominatim.openstreetmap.org/reverse';
const PHOTON_BASE = 'https://photon.komoot.io/api/';
const NOMINATIM_UA = 'YourLab-DigitalizePortugal/1.0 (https://yourlabpt.com)';

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

/** Novo negócio (admin form / map pin) always starts as remote contact — a pin is not a visit. */
function defaultEtapaForQuickLead() {
    return 'contacto_remoto';
}

function normalizeResultado(value) {
    const v = String(value || '').trim();
    if (!v) return '';
    if (RESULTADO_VALUES.includes(v)) return v;
    if (v === 'nao_interessa') return 'sem_interesse';
    return '';
}

function isParkedResultado(value) {
    return normalizeResultado(value) === 'sem_interesse';
}

/**
 * Map pin style: fill = business type, ring = fecho (or open stroke).
 * `etapa` is ignored for colour (kept in the signature for call-site compatibility).
 * `extras.fill` / processo fills are ignored — Controlo colours belong on cards.
 */
function pinColors(etapa, resultado, extras = {}) {
    const res = normalizeResultado(resultado);
    const parked = isParkedResultado(res) || extras.faded === true;
    const fill = typeColor(extras.businessType);
    const stroke = res ? (RESULTADO_COLORS[res] || PIN_STROKE_OPEN) : PIN_STROKE_OPEN;
    return {
        color: fill,
        strokeColor: stroke,
        strokeWidth: res ? 3.2 : 2.2,
        faded: parked,
        zIndexOffset: parked ? -80 : (Number(extras.zIndexOffset) || 0)
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

/**
 * Split a Portuguese free-form address into Nominatim-friendly parts.
 * Handles blobs like: "Rua de Costa Cabral 2367, 4200-231 Porto"
 */
function parsePortugueseAddress(morada, cidade) {
    const rawMorada = String(morada || '').trim();
    let city = String(cidade || '').trim();
    let working = rawMorada
        .replace(/\bPortugal\b/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    let postalcode = '';
    const cpMatch = working.match(/\b(\d{4}-\d{3})\b/);
    if (cpMatch) {
        postalcode = cpMatch[1];
        working = working.replace(cpMatch[0], ' ').replace(/\s+/g, ' ').trim();
    }

    const parts = working.split(',').map((p) => p.trim()).filter(Boolean);
    let streetLine = parts[0] || working;

    if (!city && parts.length >= 2) {
        const last = parts[parts.length - 1];
        const lastNoDigits = last.replace(/\d+/g, '').replace(/[-–]/g, ' ').trim();
        if (lastNoDigits && !/\d{3,}/.test(lastNoDigits)) {
            city = lastNoDigits;
            streetLine = parts.slice(0, -1).join(', ') || streetLine;
        } else if (/^[A-Za-zÀ-ú\s'-]+$/.test(last.trim())) {
            city = last.trim();
            streetLine = parts.slice(0, -1).join(', ') || streetLine;
        }
    }

    // City sometimes stuck at end of street line: "… Cabral 2367 Porto"
    if (!city) {
        const cityTail = streetLine.match(/\s+([A-Za-zÀ-ú][A-Za-zÀ-ú\s'-]{2,})$/);
        if (cityTail && !/\d/.test(cityTail[1]) && cityTail[1].split(/\s+/).length <= 3) {
            const candidate = cityTail[1].trim();
            const knownish = /porto|lisboa|braga|coimbra|faro|aveiro|setúbal|setubal|viana|guimarães|guimaraes|funchal|évora|evora|leiria|viseu|beja|portalegre|santaré|santarem/i;
            if (knownish.test(candidate) || candidate.length >= 4) {
                city = candidate;
                streetLine = streetLine.slice(0, cityTail.index).trim();
            }
        }
    }

    let housenumber = '';
    let street = streetLine;
    // Prefer explicit "n.º 12" / "nº 12" markers over a bare trailing number.
    const nMatch = streetLine.match(/\bn\.?\s*[ºo°]\s*(\d+[A-Za-z]?(?:-\d+[A-Za-z]?)?)\b/i)
        || streetLine.match(/\bn[º°]\s*(\d+[A-Za-z]?(?:-\d+[A-Za-z]?)?)\b/i);
    if (nMatch) {
        housenumber = nMatch[1];
        street = streetLine.replace(nMatch[0], ' ').replace(/[,\s]+$/g, '').replace(/\s+/g, ' ').trim();
    } else {
        const endMatch = streetLine.match(/^(.*?)[,\s]+(\d+[A-Za-z]?(?:\/\d+[A-Za-z]?)?)\s*$/);
        // Reject only plausible years left alone (e.g. "Edifício 2020"), keep door nos like 2367.
        const hn = endMatch && endMatch[2];
        const looksLikeYear = hn && /^(19|20)\d{2}$/.test(hn);
        if (endMatch && hn && !looksLikeYear) {
            street = endMatch[1].replace(/[,\s]+$/g, '').trim();
            housenumber = hn;
        }
    }

    const nominatimStreet = housenumber
        ? `${housenumber}, ${street}`.trim()
        : street;

    const freeTextParts = [
        street && housenumber ? `${street} ${housenumber}` : (street || streetLine),
        postalcode,
        city,
        'Portugal'
    ].filter(Boolean);

    return {
        street,
        housenumber,
        city,
        postalcode,
        nominatimStreet,
        freeText: freeTextParts.join(', '),
        raw: rawMorada
    };
}

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function enqueueNominatim(task) {
    const run = nominatimLock.then(task, task);
    nominatimLock = run.then(() => wait(NOMINATIM_GAP_MS), () => wait(NOMINATIM_GAP_MS));
    return run;
}

function scoreHit(hit, { morada, cidade, housenumber, postalcode, street } = {}) {
    if (!hit) return -Infinity;
    const type = String(hit.type || '').toLowerCase();
    const cls = String(hit.class || '').toLowerCase();
    const importance = Number(hit.importance) || 0;
    let score = importance * 10;

    if (PRECISE_TYPES.has(type) || PRECISE_TYPES.has(cls)) score += 40;
    if (cls === 'building' || (cls === 'place' && type === 'house')) score += 20;
    if (cls === 'amenity' || cls === 'shop' || cls === 'office') score += 25;
    if (COARSE_TYPES.has(type) || (cls === 'place' && COARSE_TYPES.has(type))) score -= 50;
    if (cls === 'boundary' || type === 'administrative') score -= 60;

    const display = String(hit.display_name || '').toLowerCase();
    const streetNeedle = String(street || morada || '').trim().toLowerCase();
    const city = String(cidade || '').trim().toLowerCase();
    const hn = String(housenumber || '').trim().toLowerCase();
    const cp = String(postalcode || '').trim().toLowerCase();

    if (streetNeedle) {
        const tokens = streetNeedle.split(/\s+/).filter((t) => t.length > 2 && !/^\d/.test(t));
        const matched = tokens.filter((t) => display.includes(t)).length;
        score += Math.min(24, matched * 6);
    }
    if (city && display.includes(city)) score += 14;
    if (hn && (display.includes(hn) || String(hit.housenumber || '').toLowerCase() === hn)) score += 28;
    if (cp && display.includes(cp)) score += 18;
    if (/\d/.test(streetNeedle) && /\d/.test(display)) score += 8;

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
        limit: '8'
    });
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value == null || value === '') return;
        qs.set(key, String(value));
    });
    const url = `${NOMINATIM_BASE}?${qs.toString()}`;
    const response = await fetch(url, {
        headers: {
            'User-Agent': NOMINATIM_UA,
            'Accept-Language': 'pt'
        }
    });
    if (!response.ok) {
        return { ok: false, status: 'http_error', error: `HTTP ${response.status}`, hits: [] };
    }
    const data = await response.json();
    const hits = (Array.isArray(data) ? data : []).map((hit) => ({
        ...hit,
        housenumber: hit.address && hit.address.house_number,
        source: 'nominatim'
    }));
    return { ok: true, hits };
}

function photonToHit(feature) {
    if (!feature || !feature.geometry || !Array.isArray(feature.geometry.coordinates)) return null;
    const [lon, lat] = feature.geometry.coordinates;
    const p = feature.properties || {};
    const country = String(p.country || '').trim();
    const parts = [
        p.name,
        [p.housenumber, p.street].filter(Boolean).join(' '),
        p.postcode,
        p.city || p.town || p.village,
        country || 'Portugal'
    ].filter(Boolean);
    const osmValue = String(p.osm_value || p.type || '').toLowerCase();
    const osmKey = String(p.osm_key || '').toLowerCase();
    return {
        lat: String(lat),
        lon: String(lon),
        type: osmValue || 'house',
        class: osmKey || 'place',
        importance: Number(p.importance) || 0.4,
        display_name: parts.join(', '),
        housenumber: p.housenumber || '',
        country,
        source: 'photon'
    };
}

async function photonFetch(query) {
    const q = String(query || '').trim();
    if (!q) return { ok: true, hits: [] };
    const qs = new URLSearchParams({
        q,
        limit: '8',
        lang: 'pt',
        lat: '39.5',
        lon: '-8.0'
    });
    const url = `${PHOTON_BASE}?${qs.toString()}`;
    const response = await fetch(url, {
        headers: {
            'User-Agent': NOMINATIM_UA,
            'Accept-Language': 'pt'
        }
    });
    if (!response.ok) {
        return { ok: false, status: 'http_error', error: `Photon HTTP ${response.status}`, hits: [] };
    }
    const data = await response.json();
    const feats = Array.isArray(data.features) ? data.features : [];
    const hits = feats
        .map(photonToHit)
        .filter(Boolean)
        .filter((hit) => {
            const c = String(hit.country || '').toLowerCase();
            if (!c) return true;
            return c === 'portugal' || c === 'pt';
        });
    return { ok: true, hits };
}

/**
 * @param {string} morada
 * @param {string} cidade
 * @param {{ nome?: string }} [opts]
 */
async function geocodeAddress(morada, cidade, opts = {}) {
    const parsed = parsePortugueseAddress(morada, cidade);
    const nome = String(opts.nome || '').trim();
    if (!parsed.street && !parsed.city && !parsed.raw) {
        return { ok: false, status: 'no_address', error: 'Morada em falta.' };
    }

    const context = {
        morada: parsed.raw || morada,
        cidade: parsed.city || cidade,
        street: parsed.street,
        housenumber: parsed.housenumber,
        postalcode: parsed.postalcode
    };

    return enqueueNominatim(async () => {
        try {
            let hits = [];

            // 1) Structured Nominatim — housenumber first ("2367, Rua de Costa Cabral")
            if (parsed.nominatimStreet || parsed.city) {
                const structured = await nominatimFetch({
                    street: parsed.nominatimStreet || undefined,
                    city: parsed.city || undefined,
                    postalcode: parsed.postalcode || undefined,
                    country: 'Portugal'
                });
                if (!structured.ok && !hits.length) {
                    // continue to fallbacks; only abort if everything fails later
                } else if (structured.ok) {
                    hits = hits.concat(structured.hits);
                }
            }

            const bestSoFar = pickBestHit(hits, context);
            const needsMore = !hits.length
                || !bestSoFar
                || COARSE_TYPES.has(String(bestSoFar.type || '').toLowerCase())
                || String(bestSoFar.class || '') === 'boundary'
                || (parsed.housenumber && scoreHit(bestSoFar, context) < 50);

            // 2) Free-text without business name (cleaner for door numbers)
            if (needsMore) {
                if (hits.length) await wait(NOMINATIM_GAP_MS);
                const free = await nominatimFetch({ q: parsed.freeText });
                if (free.ok) hits = hits.concat(free.hits);
            }

            // 3) Free-text with business name if still weak
            if (nome && (needsMore || !hits.length)) {
                await wait(NOMINATIM_GAP_MS);
                const withName = await nominatimFetch({
                    q: buildAddressQuery(parsed.freeText.replace(/, Portugal$/, ''), '', nome)
                });
                if (withName.ok) hits = hits.concat(withName.hits);
            }

            // 4) Photon (Komoot / OSM) fallback — often better at PT door numbers
            const stillWeak = !pickBestHit(hits, context)
                || (parsed.housenumber && scoreHit(pickBestHit(hits, context), context) < 50);
            if (stillWeak || !hits.length) {
                const photonQueries = [
                    parsed.freeText,
                    [parsed.street, parsed.housenumber, parsed.city, 'Portugal'].filter(Boolean).join(' ')
                ].filter((q, i, arr) => q && arr.indexOf(q) === i);
                for (const q of photonQueries) {
                    const photon = await photonFetch(q);
                    if (photon.ok && photon.hits.length) {
                        hits = hits.concat(photon.hits);
                        break;
                    }
                }
            }

            const hit = pickBestHit(hits, context);
            const result = coordsFromHit(hit, parsed.freeText);
            if (result.ok) {
                result.parsed = parsed;
                result.source = hit.source || 'nominatim';
                result.formatted = hit.display_name || result.formatted;
            }
            return result;
        } catch (err) {
            return { ok: false, status: 'network', error: err.message || 'network' };
        }
    });
}

function addressFromNominatim(hit) {
    const a = (hit && hit.address) || {};
    const road = a.road || a.pedestrian || a.footway || a.residential || a.neighbourhood || '';
    const hn = a.house_number || '';
    const street = [road, hn].filter(Boolean).join(' ').trim();
    const morada = [street, a.postcode].filter(Boolean).join(', ');
    const cidade = a.city || a.town || a.village || a.municipality || a.county || '';
    return {
        morada,
        cidade,
        formatted: (hit && hit.display_name) || [morada, cidade].filter(Boolean).join(', ')
    };
}

async function reverseGeocode(lat, lng) {
    const a = Number(lat);
    const b = Number(lng);
    if (!Number.isFinite(a) || !Number.isFinite(b)) {
        return { ok: false, status: 'no_coords', error: 'Coordenadas em falta.' };
    }
    return enqueueNominatim(async () => {
        try {
            const qs = new URLSearchParams({
                format: 'jsonv2',
                addressdetails: '1',
                zoom: '18',
                lat: String(a),
                lon: String(b)
            });
            const response = await fetch(`${NOMINATIM_REVERSE}?${qs.toString()}`, {
                headers: {
                    'User-Agent': NOMINATIM_UA,
                    'Accept-Language': 'pt'
                }
            });
            if (!response.ok) {
                return { ok: false, status: 'http_error', error: `HTTP ${response.status}` };
            }
            const hit = await response.json();
            if (!hit || hit.error) {
                return { ok: false, status: 'not_found', error: (hit && hit.error) || 'not_found' };
            }
            const addr = addressFromNominatim(hit);
            const nome = (hit.name && String(hit.name).trim())
                || (hit.address && (hit.address.amenity || hit.address.shop || hit.address.office))
                || '';
            return {
                ok: true,
                lat: Number(hit.lat) || a,
                lng: Number(hit.lon) || b,
                nome,
                morada: addr.morada,
                cidade: addr.cidade,
                formatted: addr.formatted,
                source: 'nominatim-reverse'
            };
        } catch (err) {
            return { ok: false, status: 'network', error: err.message || 'network' };
        }
    });
}

async function searchPlaceName(query) {
    const q = String(query || '').trim();
    if (!q) return { ok: false, status: 'no_query', error: 'Nome em falta.' };
    return enqueueNominatim(async () => {
        try {
            let hits = [];
            const nom = await nominatimFetch({ q: `${q}, Portugal` });
            if (nom.ok) hits = hits.concat(nom.hits);
            if (!hits.length) {
                const photon = await photonFetch(q);
                if (photon.ok) hits = hits.concat(photon.hits);
            }
            const hit = pickBestHit(hits, { morada: q, cidade: '' });
            if (!hit) return { ok: false, status: 'not_found', error: 'Não encontrei o sítio.' };
            const addr = addressFromNominatim(hit);
            return {
                ok: true,
                lat: Number(hit.lat),
                lng: Number(hit.lon),
                nome: hit.name || q,
                morada: addr.morada,
                cidade: addr.cidade,
                formatted: addr.formatted || hit.display_name,
                source: hit.source || 'nominatim'
            };
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
    if (!force && hasCoords && (lead.geocode_status === 'ok' || lead.geocode_status === 'manual' || lead.geocode_status === 'maps')) {
        return { skipped: true, reason: 'cached' };
    }

    const result = await geocodeAddress(lead.morada, lead.cidade, { nome: lead.nome });
    const stamp = typeof nowIso === 'function' ? nowIso() : new Date().toISOString();
    if (result.ok) {
        const parsedCity = result.parsed && result.parsed.city;
        if (parsedCity && !String(lead.cidade || '').trim()) {
            db.prepare('UPDATE lead SET cidade = ? WHERE id = ?').run(parsedCity, leadId);
        }
        db.prepare(`
            UPDATE lead SET lat = ?, lng = ?, geocoded_at = ?, geocode_status = 'ok'
            WHERE id = ?
        `).run(result.lat, result.lng, stamp, leadId);
        // Keep linked street visits on the same pin (unified coverage).
        db.prepare(`
            UPDATE visita SET lat = ?, lng = ?, geocode_status = 'ok'
            WHERE lead_id = ? AND (lat IS NULL OR lng IS NULL OR geocode_status != 'manual')
        `).run(result.lat, result.lng, leadId);
        return {
            ok: true,
            lat: result.lat,
            lng: result.lng,
            formatted: result.formatted,
            source: result.source || 'nominatim'
        };
    }
    db.prepare(`
        UPDATE lead SET geocoded_at = ?, geocode_status = ?
        WHERE id = ?
    `).run(stamp, result.status || 'failed', leadId);
    return { ok: false, status: result.status, error: result.error };
}

async function geocodeVisitRow(db, visitId, { force = false, nowIso } = {}) {
    const row = db.prepare(`
        SELECT id, nome, morada, cidade, lat, lng, geocode_status, lead_id FROM visita WHERE id = ?
    `).get(visitId);
    if (!row) return null;
    const hasCoords = Number.isFinite(row.lat) && Number.isFinite(row.lng);
    if (!force && hasCoords && (row.geocode_status === 'ok' || row.geocode_status === 'manual')) {
        return { skipped: true, reason: 'cached' };
    }
    const result = await geocodeAddress(row.morada, row.cidade, { nome: row.nome });
    const stamp = typeof nowIso === 'function' ? nowIso() : new Date().toISOString();
    if (result.ok) {
        const parsedCity = result.parsed && result.parsed.city;
        if (parsedCity && !String(row.cidade || '').trim()) {
            db.prepare('UPDATE visita SET cidade = ? WHERE id = ?').run(parsedCity, visitId);
        }
        db.prepare(`
            UPDATE visita SET lat = ?, lng = ?, geocode_status = 'ok' WHERE id = ?
        `).run(result.lat, result.lng, visitId);
        if (row.lead_id) {
            db.prepare(`
                UPDATE lead SET lat = ?, lng = ?, geocoded_at = ?, geocode_status = 'ok'
                WHERE id = ? AND (lat IS NULL OR lng IS NULL OR geocode_status != 'manual')
            `).run(result.lat, result.lng, stamp, row.lead_id);
        }
        return {
            ok: true,
            lat: result.lat,
            lng: result.lng,
            formatted: result.formatted,
            source: result.source || 'nominatim'
        };
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
        : [...(legend?.etapas || []), ...(legend?.processos || []), ...(legend?.resultados || [])];
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
        'Sítios já contactados na rua. Anel = na rua. Preenchimento = controlo — ou o fecho, se já decidiu.',
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
            lines.push(`  Na rua: ${labels[etapa] || etapa || '—'}${resultado ? ` · Fecho: ${labels[resultado] || resultado}` : ''}`);
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
    TYPE_COLORS,
    PIN_FILL_UNSET,
    PIN_STROKE_OPEN,
    COBERTURA_VALUES,
    COBERTURA_LABELS,
    COBERTURA_COLORS,
    OLD_COBERTURA_REMAP,
    mapsApiKey,
    isValidEtapa,
    isValidResultado,
    isValidCobertura,
    isParkedResultado,
    normalizeEtapa,
    defaultEtapaForQuickLead,
    normalizeResultado,
    typeColor,
    pinColors,
    etapaRank,
    remapCoberturaToEtapaResultado,
    buildAddressQuery,
    parsePortugueseAddress,
    geocodeAddress,
    reverseGeocode,
    searchPlaceName,
    geocodeLeadRow,
    geocodeVisitRow,
    extractCidadeFromDadosJson,
    backfillLeadGeoFields,
    formatCoverageExport,
    // Exported for unit tests
    scoreHit,
    pickBestHit
};
