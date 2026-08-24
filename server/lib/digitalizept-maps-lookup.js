/**
 * Prefill a lead from a Google Maps share URL.
 * Parses name/coords from the URL, then fills address from Nominatim and
 * phone/website/hours from OpenStreetMap. Does not scrape Google HTML.
 */

const { parseMapsUrl, isShortMapsHost } = require('./digitalizept-maps-url');
const { reverseGeocode, searchPlaceName } = require('./digitalizept-geocode');

const UA = 'YourLab-DigitalizePortugal/1.0 (https://yourlabpt.com)';
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

const OSM_TO_TYPE = [
    { test: (t) => ['restaurant', 'fast_food', 'food_court', 'bar', 'pub'].includes(t.amenity), id: 'restaurante' },
    { test: (t) => ['cafe', 'ice_cream', 'bakery', 'pastry'].includes(t.amenity) || ['bakery', 'pastry', 'coffee'].includes(t.shop), id: 'cafe-pastelaria' },
    { test: (t) => t.shop === 'chemist' || t.shop === 'hardware' || t.shop === 'doityourself' || t.shop === 'paint' || t.amenity === 'pharmacy', id: 'drogaria-ferragens' },
    { test: (t) => ['supermarket', 'convenience', 'greengrocer', 'butcher', 'seafood'].includes(t.shop), id: 'mercadinho' },
    { test: (t) => ['clothes', 'boutique', 'shoes', 'bag', 'fashion_accessories'].includes(t.shop), id: 'loja-roupa' },
    { test: (t) => ['florist', 'interior_decoration', 'furniture', 'houseware'].includes(t.shop), id: 'loja-flores-decoracao' },
    { test: (t) => ['jewelry', 'watches'].includes(t.shop), id: 'joalharia' },
    { test: (t) => t.shop === 'optician', id: 'otica' },
    { test: (t) => t.shop === 'car_repair' || t.shop === 'car_parts' || t.amenity === 'car_repair' || t.craft === 'car_repair', id: 'mecanico-automovel' },
    { test: (t) => t.shop === 'hairdresser' || t.shop === 'beauty' || t.shop === 'cosmetics' || t.amenity === 'hairdresser', id: 'salao-beleza' },
    { test: (t) => t.amenity === 'clinic' || t.amenity === 'spa' || t.shop === 'massage' || t.leisure === 'spa', id: 'clinica-estetica' },
    { test: (t) => t.shop === 'carpet' || t.shop === 'curtain', id: 'tapecaria' }
];

function foldName(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function nameScore(a, b) {
    const left = foldName(a);
    const right = foldName(b);
    if (!left || !right) return 0;
    if (left === right) return 100;
    if (left.includes(right) || right.includes(left)) return 70;
    const as = new Set(left.split(' ').filter((w) => w.length > 2));
    const bs = right.split(' ').filter((w) => w.length > 2);
    if (!as.size || !bs.length) return 0;
    const hit = bs.filter((w) => as.has(w)).length;
    return Math.round((hit / Math.max(as.size, bs.length)) * 50);
}

function osmTags(el) {
    const t = (el && el.tags) || {};
    return {
        name: t.name || t.brand || '',
        phone: t.phone || t['contact:phone'] || t['contact:mobile'] || '',
        whatsapp: t['contact:whatsapp'] || t.whatsapp || '',
        email: t.email || t['contact:email'] || '',
        website: t.website || t['contact:website'] || '',
        horario: t.opening_hours || '',
        amenity: t.amenity || '',
        shop: t.shop || '',
        craft: t.craft || '',
        leisure: t.leisure || '',
        office: t.office || ''
    };
}

function ptNationalDigits(phone) {
    let digits = String(phone || '').replace(/\D/g, '');
    if (digits.startsWith('00351')) digits = digits.slice(5);
    if (digits.startsWith('351') && digits.length >= 12) digits = digits.slice(3);
    return digits;
}

function isPortugueseMobile(phone) {
    const digits = ptNationalDigits(phone);
    return digits.length === 9 && digits.startsWith('9');
}

function whatsappIfMobile(phone) {
    const text = String(phone || '').trim();
    return isPortugueseMobile(text) ? text : '';
}

function contactFromOsm(tags) {
    if (!tags) {
        return { telefone: '', whatsapp: '', email: '', website: '', horario: '' };
    }
    const telefone = String(tags.phone || '').trim();
    const taggedWa = String(tags.whatsapp || '').trim();
    return {
        telefone,
        whatsapp: taggedWa || whatsappIfMobile(telefone),
        email: String(tags.email || '').trim(),
        website: String(tags.website || '').trim(),
        horario: String(tags.horario || '').trim()
    };
}

const MIN_OSM_NAME_SCORE = 50;

function pickOsmPlace(elements, nome) {
    const wanted = String(nome || '').trim();
    let best = null;
    let bestScore = -1;
    (elements || []).forEach((el) => {
        const tags = el && el.tags ? osmTags(el) : osmTags({ tags: el || {} });
        if (!tags.name && !tags.shop && !tags.amenity) return;
        const score = wanted ? nameScore(wanted, tags.name) : 0;
        if (score > bestScore) {
            bestScore = score;
            best = tags;
        }
    });
    if (!best) return null;
    // A neighbour with a phone is not this shop. Dense streets (Baixa, etc.)
    // return dozens of POIs; never copy Aduela's number onto Thailander.
    if (wanted && bestScore < MIN_OSM_NAME_SCORE) return null;
    return best;
}

function overpassNameNeedle(nome) {
    const tokens = foldName(nome).split(' ').filter((word) => word.length >= 4);
    tokens.sort((a, b) => b.length - a.length);
    const needle = tokens[0] || foldName(nome).replace(/\s+/g, '');
    return needle.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
}

function mapBusinessType(tags) {
    const hit = OSM_TO_TYPE.find((row) => row.test(tags));
    return hit ? hit.id : 'generico';
}

function withTimeout(ms) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

async function resolveMapsUrl(raw) {
    const parsed = parseMapsUrl(raw);
    if (!parsed.ok) return parsed;
    if (!parsed.short) return parsed;

    const wait = withTimeout(8000);
    try {
        const response = await fetch(parsed.url, {
            method: 'GET',
            redirect: 'follow',
            headers: {
                'User-Agent': UA,
                Accept: 'text/html,application/xhtml+xml'
            },
            signal: wait.signal
        });
        const finalUrl = response.url || parsed.url;
        const resolved = parseMapsUrl(finalUrl);
        if (resolved.ok) {
            resolved.short = true;
            resolved.url = finalUrl;
            if (!resolved.nome && parsed.nome) resolved.nome = parsed.nome;
            return resolved;
        }
        return { ...parsed, url: finalUrl };
    } catch (_) {
        return parsed;
    } finally {
        wait.clear();
    }
}

async function osmNearby(lat, lng, nome) {
    const a = Number(lat);
    const b = Number(lng);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    const needle = overpassNameNeedle(nome);
    const named = needle
        ? `nwr(around:150,${a},${b})["name"~"${needle}",i];`
        : '';
    const query = `[out:json][timeout:8];
(
  ${named}
  nwr(around:90,${a},${b})[name];
  nwr(around:90,${a},${b})[shop];
  nwr(around:90,${a},${b})[amenity];
);
out tags center 80;`;
    const wait = withTimeout(9000);
    try {
        const response = await fetch(OVERPASS_URL, {
            method: 'POST',
            headers: {
                'User-Agent': UA,
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
            },
            body: `data=${encodeURIComponent(query)}`,
            signal: wait.signal
        });
        if (!response.ok) return null;
        const data = await response.json();
        const elements = Array.isArray(data.elements) ? data.elements : [];
        return pickOsmPlace(elements, nome);
    } catch (_) {
        return null;
    } finally {
        wait.clear();
    }
}

function filled(value) {
    return String(value || '').trim().length > 0;
}

/**
 * @param {{ url?: string, lat?: number, lng?: number, nome?: string }} input
 */
async function lookupFromMaps(input = {}) {
    const notes = [];
    let parsed = { ok: true, nome: '', lat: null, lng: null, url: '', short: false };

    if (input.url) {
        parsed = await resolveMapsUrl(input.url);
        if (!parsed.ok) return parsed;
        notes.push('Dados lidos do link (nome e coordenadas). Telefone e email vêm do OpenStreetMap, se existirem — não do Google.');
    }

    const nomeHint = String(input.nome || parsed.nome || '').trim();
    let lat = Number.isFinite(Number(input.lat)) ? Number(input.lat) : parsed.lat;
    let lng = Number.isFinite(Number(input.lng)) ? Number(input.lng) : parsed.lng;

    let geo = null;
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
        geo = await reverseGeocode(lat, lng);
        if (!geo.ok) notes.push('Não consegui a morada a partir das coordenadas.');
    } else if (nomeHint) {
        geo = await searchPlaceName(nomeHint);
        if (geo.ok) {
            lat = geo.lat;
            lng = geo.lng;
        } else {
            notes.push('Sem coordenadas no link e não encontrei o nome no mapa aberto.');
        }
    } else {
        return { ok: false, error: 'O link não traz nome nem coordenadas. Cole o link completo do sítio.' };
    }

    const osm = (Number.isFinite(lat) && Number.isFinite(lng))
        ? await osmNearby(lat, lng, nomeHint || (geo && geo.nome))
        : null;
    const contact = contactFromOsm(osm);

    const dados = {
        nome_negocio: nomeHint || (osm && osm.name) || (geo && geo.nome) || '',
        morada: (geo && geo.morada) || '',
        cidade: (geo && geo.cidade) || '',
        telefone: contact.telefone,
        email: contact.email,
        whatsapp: contact.whatsapp,
        website_atual: contact.website,
        horario: contact.horario,
        maps_url: parsed.url || String(input.url || '').trim()
    };

    const businessTypeId = osm ? mapBusinessType(osm) : 'generico';
    if (contact.telefone) notes.push('Telefone encontrado no OpenStreetMap para este negócio.');
    if (osm && osm.email) notes.push('Email encontrado no OpenStreetMap.');
    if (!filled(dados.telefone)) notes.push('Sem telefone público no mapa aberto — preenche à mão.');
    if (!filled(dados.email)) notes.push('Email quase nunca vem no Maps. Preenche se o tiveres.');
    notes.push('Fotos e o resto da ficha ficam para ti.');

    return {
        ok: true,
        dados,
        lat: Number.isFinite(lat) ? lat : null,
        lng: Number.isFinite(lng) ? lng : null,
        businessTypeId,
        notes,
        source: {
            mapsUrl: Boolean(parsed.url),
            geocode: geo && geo.ok ? geo.source : '',
            osm: Boolean(osm)
        }
    };
}

module.exports = {
    lookupFromMaps,
    resolveMapsUrl,
    mapBusinessType,
    nameScore,
    pickOsmPlace,
    contactFromOsm,
    isPortugueseMobile,
    whatsappIfMobile
};
