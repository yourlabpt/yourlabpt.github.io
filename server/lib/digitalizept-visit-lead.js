/**
 * One shop = one lead. A map visita is either an orphan pin or a street
 * event attached to that lead. Converting a pin must not fork a second ficha.
 */
const crypto = require('crypto');
const { nowIso, logEvento } = require('./digitalizept-db');
const { reusableLeadId } = require('./digitalizept-business-identity');
const {
    isValidEtapa,
    isValidResultado,
    normalizeEtapa,
    normalizeResultado,
    etapaRank
} = require('./digitalizept-geocode');

/** Same doorway / GPS jitter. Wider than this is a second site, even with the same name. */
const MATCH_RADIUS_M = 80;
/** Unnamed stub pins: only collapse if they are the same dropped point. */
const STUB_RADIUS_M = 25;

function finiteCoord(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

function metersBetween(aLat, aLng, bLat, bLng) {
    const lat1 = finiteCoord(aLat);
    const lng1 = finiteCoord(aLng);
    const lat2 = finiteCoord(bLat);
    const lng2 = finiteCoord(bLng);
    if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return null;
    const toRad = (deg) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const sinLat = Math.sin(dLat / 2);
    const sinLng = Math.sin(dLng / 2);
    const h = sinLat * sinLat
        + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * sinLng * sinLng;
    return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

function sameCity(a, b) {
    const x = String(a || '').trim().toLowerCase();
    const y = String(b || '').trim().toLowerCase();
    if (!x || !y) return null;
    return x === y;
}

function applyAutoEtapa(db, leadId, nextAuto) {
    const row = db.prepare('SELECT cobertura, cobertura_locked FROM lead WHERE id = ?').get(leadId);
    if (!row || row.cobertura_locked) return;
    const current = normalizeEtapa(row.cobertura, 'contacto_remoto');
    if (current === 'demo_apresentada') return;
    const next = normalizeEtapa(nextAuto, '');
    if (!isValidEtapa(next)) return;
    if (etapaRank(next) <= etapaRank(current)) return;
    db.prepare('UPDATE lead SET cobertura = ? WHERE id = ?').run(next, leadId);
}

function ensureDadosNegocio(db, leadId, dados, now) {
    const existing = db.prepare('SELECT id FROM dados_negocio WHERE lead_id = ?').get(leadId);
    if (existing) return;
    db.prepare(`
        INSERT INTO dados_negocio (id, lead_id, obrigatorios_json, opcionais_json, criado_em)
        VALUES (?, ?, ?, ?, ?)
    `).run(crypto.randomUUID(), leadId, JSON.stringify({}), JSON.stringify(dados || {}), now);
}

function syncLinkedVisitsIdentity(db, leadId, { nome, morada, cidade } = {}) {
    if (!leadId) return;
    const lead = db.prepare('SELECT nome, morada, cidade FROM lead WHERE id = ?').get(leadId);
    if (!lead) return;
    db.prepare(`
        UPDATE visita SET nome = ?, morada = ?, cidade = ? WHERE lead_id = ?
    `).run(
        nome != null ? nome : lead.nome,
        morada != null ? morada : lead.morada,
        cidade != null ? cidade : lead.cidade,
        leadId
    );
}

function pickIdentity(primary, fallback) {
    const a = String(primary || '').trim();
    if (a) return a;
    return String(fallback || '').trim();
}

/**
 * After a visit is linked, identity and pin live on the lead.
 * Visits keep experiência / visitado_em as the street log.
 */
function reconcileVisitLeadPair(db, visitId, {
    identitySource = 'lead',
    resultadoMode = 'fill-empty',
    now
} = {}) {
    const stamp = now || nowIso();
    const visit = db.prepare('SELECT * FROM visita WHERE id = ?').get(visitId);
    if (!visit || !visit.lead_id) return { ok: false };
    const lead = db.prepare('SELECT * FROM lead WHERE id = ?').get(visit.lead_id);
    if (!lead) return { ok: false };

    const fromVisit = identitySource === 'visit';
    const nome = fromVisit
        ? pickIdentity(visit.nome, lead.nome)
        : pickIdentity(lead.nome, visit.nome);
    const morada = fromVisit
        ? pickIdentity(visit.morada, lead.morada)
        : pickIdentity(lead.morada, visit.morada);
    const cidade = fromVisit
        ? pickIdentity(visit.cidade, lead.cidade)
        : pickIdentity(lead.cidade, visit.cidade);

    db.prepare('UPDATE lead SET nome = ?, morada = ?, cidade = ? WHERE id = ?')
        .run(nome, morada, cidade, lead.id);
    db.prepare('UPDATE visita SET nome = ?, morada = ?, cidade = ? WHERE lead_id = ?')
        .run(nome, morada, cidade, lead.id);

    const visitLat = finiteCoord(visit.lat);
    const visitLng = finiteCoord(visit.lng);
    const leadLat = finiteCoord(lead.lat);
    const leadLng = finiteCoord(lead.lng);
    const lat = visitLat != null ? visitLat : leadLat;
    const lng = visitLng != null ? visitLng : leadLng;
    if (lat != null && lng != null) {
        const status = visitLat != null
            ? (visit.geocode_status || 'manual')
            : (lead.geocode_status || 'ok');
        db.prepare(`
            UPDATE lead SET lat = ?, lng = ?, geocode_status = ?, geocoded_at = ?
            WHERE id = ?
        `).run(lat, lng, status, stamp, lead.id);
        db.prepare(`
            UPDATE visita SET lat = ?, lng = ?, geocode_status = ?
            WHERE lead_id = ?
        `).run(lat, lng, status, lead.id);
    }

    applyAutoEtapa(db, lead.id, visit.cobertura);
    const visitResultado = isValidResultado(normalizeResultado(visit.resultado || ''))
        ? normalizeResultado(visit.resultado || '')
        : '';
    if (visitResultado && !lead.cobertura_locked) {
        if (resultadoMode === 'write' || !String(lead.resultado || '').trim()) {
            db.prepare('UPDATE lead SET resultado = ? WHERE id = ?').run(visitResultado, lead.id);
        }
    }

    ensureDadosNegocio(db, lead.id, {
        nome_negocio: nome,
        morada,
        cidade
    }, stamp);
    return { ok: true, leadId: lead.id };
}

function findReusableLead(db, { nome, cidade, lat, lng, excludeLeadId = '' } = {}) {
    const incomingNome = String(nome || '').trim();
    if (!incomingNome) return null;
    const visitLat = finiteCoord(lat);
    const visitLng = finiteCoord(lng);
    const hasCoords = visitLat != null && visitLng != null;
    const leads = db.prepare(`
        SELECT id, nome, morada, cidade, telefone, whatsapp, estado, cobertura, resultado,
               cobertura_locked, lat, lng, geocode_status, business_type
        FROM lead
    `).all();

    const scored = [];
    leads.forEach((lead) => {
        if (excludeLeadId && lead.id === excludeLeadId) return;
        if (!reusableLeadId(lead, incomingNome, cidade || lead.cidade)) return;

        const leadLat = finiteCoord(lead.lat);
        const leadLng = finiteCoord(lead.lng);
        const leadHasCoords = leadLat != null && leadLng != null;
        const meters = hasCoords && leadHasCoords
            ? metersBetween(visitLat, visitLng, leadLat, leadLng)
            : null;
        const storedNome = String(lead.nome || '').trim();

        if (!storedNome) {
            if (!(hasCoords && leadHasCoords && meters != null && meters <= STUB_RADIUS_M)) return;
        } else if (hasCoords && leadHasCoords) {
            if (meters == null || meters > MATCH_RADIUS_M) return;
        } else {
            const cityMatch = sameCity(cidade, lead.cidade);
            if (cityMatch === false) return;
            if (!hasCoords && !leadHasCoords && cityMatch == null) return;
        }

        scored.push({
            lead,
            meters: meters == null ? Number.POSITIVE_INFINITY : meters
        });
    });

    scored.sort((a, b) => a.meters - b.meters);
    return scored[0] ? scored[0].lead : null;
}

function attachVisitToLead(db, visit, lead, { now } = {}) {
    const stamp = now || nowIso();
    db.prepare('UPDATE visita SET lead_id = ? WHERE id = ?').run(lead.id, visit.id);
    reconcileVisitLeadPair(db, visit.id, { resultadoMode: 'fill-empty', now: stamp });
    logEvento(db, 'lead', lead.id, 'rascunho', {
        nome: lead.nome || visit.nome,
        origem: 'visita',
        visitId: visit.id,
        reused: true
    });
    return lead.id;
}

function createLeadFromVisit(db, visit, { now } = {}) {
    const stamp = now || nowIso();
    const nome = String(visit.nome || '').trim();
    const etapaRaw = normalizeEtapa(visit.cobertura, 'visitado');
    const etapa = isValidEtapa(etapaRaw) ? etapaRaw : 'visitado';
    const resultadoRaw = normalizeResultado(visit.resultado || '');
    const resultado = isValidResultado(resultadoRaw) ? resultadoRaw : '';
    const morada = String(visit.morada || '');
    const cidade = String(visit.cidade || '');
    const leadId = crypto.randomUUID();
    const dados = { nome_negocio: nome, morada, cidade };

    db.prepare(`
        INSERT INTO lead (
            id, business_type, nome, morada, cidade, telefone, whatsapp,
            estado, cobertura, resultado, criado_em
        ) VALUES (?, 'generico', ?, ?, ?, '', '', 'rascunho', ?, ?, ?)
    `).run(leadId, nome, morada, cidade, etapa, resultado, stamp);
    ensureDadosNegocio(db, leadId, dados, stamp);
    db.prepare('UPDATE visita SET lead_id = ? WHERE id = ?').run(leadId, visit.id);
    reconcileVisitLeadPair(db, visit.id, { resultadoMode: 'fill-empty', now: stamp });
    logEvento(db, 'lead', leadId, 'rascunho', {
        nome,
        origem: 'visita',
        visitId: visit.id,
        reused: false
    });
    return leadId;
}

function loadLeadSummary(db, leadId) {
    return db.prepare(`
        SELECT id, nome, morada, cidade, estado, cobertura, resultado, lat, lng
        FROM lead WHERE id = ?
    `).get(leadId);
}

function ensureLeadFromVisit(db, visitId) {
    const id = String(visitId || '').trim();
    if (!id) return { error: 'Visita não encontrada.', status: 404 };

    const visit = db.prepare('SELECT * FROM visita WHERE id = ?').get(id);
    if (!visit) return { error: 'Visita não encontrada.', status: 404 };

    if (visit.lead_id) {
        const existing = loadLeadSummary(db, visit.lead_id);
        if (existing) {
            return { ok: true, created: false, leadId: existing.id, lead: existing };
        }
    }

    const nome = String(visit.nome || '').trim();
    if (!nome) return { error: 'Indique o nome do sítio.', status: 400 };

    let created = false;
    let leadId = '';
    db.transaction(() => {
        const match = findReusableLead(db, {
            nome,
            cidade: visit.cidade,
            lat: visit.lat,
            lng: visit.lng
        });
        if (match) {
            leadId = attachVisitToLead(db, visit, match);
            created = false;
            return;
        }
        leadId = createLeadFromVisit(db, visit);
        created = true;
    })();

    return {
        ok: true,
        created,
        leadId,
        lead: loadLeadSummary(db, leadId)
    };
}

module.exports = {
    MATCH_RADIUS_M,
    STUB_RADIUS_M,
    metersBetween,
    findReusableLead,
    ensureLeadFromVisit,
    reconcileVisitLeadPair,
    syncLinkedVisitsIdentity
};
