/**
 * Persistence helpers for presenca_mapa + sync to projeto.estado_google.
 */

const crypto = require('crypto');
const { normalizeEstado, isValidEstado, ESTADO_LABELS } = require('./states');
const {
    parsePropostaItens,
    includesGooglePresence,
    includesWebsite,
    isGoogleOnlyDeal,
    includesPerfilCompleto
} = require('./packages');
const google = require('./google');
const { listProviders, TESLA_NOTE, getProvider } = require('./index');

function parseJson(raw, fallback) {
    try {
        const v = JSON.parse(raw || '');
        return v && typeof v === 'object' ? v : fallback;
    } catch (_) {
        return fallback;
    }
}

function ensurePresencaRow(db, projetoId, fornecedor, nowIso) {
    const existing = db.prepare(`
        SELECT * FROM presenca_mapa WHERE projeto_id = ? AND fornecedor = ?
    `).get(projetoId, fornecedor);
    if (existing) return existing;
    const id = crypto.randomUUID();
    const now = typeof nowIso === 'function' ? nowIso() : (nowIso || new Date().toISOString());
    db.prepare(`
        INSERT INTO presenca_mapa (
            id, projeto_id, fornecedor, estado, referencia_externa,
            submetido_em, verificado_em, ultimo_erro, tentativas, payload_json, criado_em, actualizado_em
        ) VALUES (?, ?, ?, 'nao_iniciado', '', '', '', '', 0, '{}', ?, ?)
    `).run(id, projetoId, fornecedor, now, now);
    return db.prepare('SELECT * FROM presenca_mapa WHERE id = ?').get(id);
}

function syncProjetoGoogleEstado(db, projetoId, estado) {
    const next = normalizeEstado(estado, 'nao_iniciado');
    db.prepare('UPDATE projeto SET estado_google = ? WHERE id = ?').run(next, projetoId);
}

function loadDealContext(db, projetoId) {
    const row = db.prepare(`
        SELECT pr.id AS projectId, pr.estado, pr.estado_google, pr.estado_dominio, pr.criado_em,
               p.id AS propostaId, p.itens_json, p.lead_id,
               l.id AS leadId, l.nome, l.morada, l.cidade, l.telefone, l.whatsapp,
               l.business_type, l.google_presence_json, l.demo_slug,
               d.obrigatorios_json, d.opcionais_json
        FROM projeto pr
        JOIN contrato c ON c.id = pr.contrato_id
        JOIN proposta p ON p.id = c.proposta_id
        JOIN lead l ON l.id = p.lead_id
        LEFT JOIN dados_negocio d ON d.lead_id = l.id
        WHERE pr.id = ?
    `).get(projetoId);
    if (!row) return null;

    const proposta = parsePropostaItens(row.itens_json);
    const obrigatorios = parseJson(row.obrigatorios_json, {});
    const opcionais = parseJson(row.opcionais_json, {});
    const dados = { ...obrigatorios, ...opcionais };
    const googlePresence = parseJson(row.google_presence_json, {});

    return {
        row,
        proposta,
        dados,
        googlePresence,
        lead: {
            id: row.leadId,
            nome: row.nome,
            morada: row.morada,
            cidade: row.cidade,
            telefone: row.telefone,
            whatsapp: row.whatsapp,
            business_type: row.business_type,
            demo_slug: row.demo_slug
        },
        businessType: { id: row.business_type, nome: '' },
        hasGoogle: includesGooglePresence(proposta),
        googleOnly: isGoogleOnlyDeal(proposta),
        hasWebsite: includesWebsite(proposta),
        perfilCompleto: includesPerfilCompleto(proposta),
        estadoGoogle: normalizeEstado(
            row.estado_google,
            includesGooglePresence(proposta) ? 'nao_iniciado' : 'nao_incluido'
        )
    };
}

function publicPresenca(row) {
    if (!row) return null;
    const payload = parseJson(row.payload_json, {});
    return {
        id: row.id,
        projetoId: row.projeto_id,
        fornecedor: row.fornecedor,
        estado: normalizeEstado(row.estado),
        estadoLabel: ESTADO_LABELS[normalizeEstado(row.estado)] || row.estado,
        referenciaExterna: row.referencia_externa || '',
        submetidoEm: row.submetido_em || '',
        verificadoEm: row.verificado_em || '',
        ultimoErro: row.ultimo_erro || '',
        tentativas: row.tentativas || 0,
        payload,
        criadoEm: row.criado_em,
        actualizadoEm: row.actualizado_em
    };
}

function buildCockpit(db, projetoId, { nowIso } = {}) {
    const ctx = loadDealContext(db, projetoId);
    if (!ctx) return { error: 'Projeto não encontrado.', status: 404 };
    if (!ctx.hasGoogle) {
        return {
            error: 'Este projeto não inclui presença Google.',
            status: 400,
            projectId: projetoId
        };
    }

    const presencaRow = ensurePresencaRow(db, projetoId, 'google', nowIso);
    const dados = google.buildDadosNegocio({
        dados: ctx.dados,
        googlePresence: ctx.googlePresence,
        lead: ctx.lead,
        businessType: ctx.businessType
    });
    const missing = google.validar(dados, { proposta: ctx.proposta });
    const steps = google.deliverySteps({ proposta: ctx.proposta });
    const payload = parseJson(presencaRow.payload_json, {});
    const doneSteps = Array.isArray(payload.doneSteps) ? payload.doneSteps : [];

    let estado = normalizeEstado(presencaRow.estado, 'nao_iniciado');
    if (missing.length && !['em_curso', 'a_aguardar_verificacao', 'verificado'].includes(estado)) {
        estado = 'em_falta_dados';
    }

    return {
        projectId: projetoId,
        projetoEstado: ctx.row.estado,
        estadoGoogle: ctx.estadoGoogle,
        googleOnly: ctx.googleOnly,
        hasWebsite: ctx.hasWebsite,
        perfilCompleto: ctx.perfilCompleto,
        proposta: ctx.proposta,
        lead: {
            id: ctx.lead.id,
            nome: ctx.lead.nome,
            demo_slug: ctx.lead.demo_slug
        },
        dados,
        missing,
        providers: listProviders(),
        teslaNote: TESLA_NOTE,
        presenca: {
            ...publicPresenca({ ...presencaRow, estado }),
            steps: steps.map((s) => ({
                ...s,
                done: doneSteps.includes(s.id)
            })),
            guiaoVideo: payload.guiaoVideo || google.guiaoVideo(dados),
            contaScript: payload.contaScript || google.contaGoogleScript(),
            mensagemClienteRascunho: payload.mensagemClienteRascunho
                || google.mensagemClienteVerificado(dados)
        }
    };
}

async function startDelivery(db, projetoId, { nowIso, logEvento } = {}) {
    const ctx = loadDealContext(db, projetoId);
    if (!ctx) return { error: 'Projeto não encontrado.', status: 404 };
    if (!ctx.hasGoogle) return { error: 'Sem presença Google neste projeto.', status: 400 };

    const now = typeof nowIso === 'function' ? nowIso() : (nowIso || new Date().toISOString());
    const result = await google.submeter(null, {
        dados: ctx.dados,
        googlePresence: ctx.googlePresence,
        lead: ctx.lead,
        businessType: ctx.businessType,
        proposta: ctx.proposta
    });

    const row = ensurePresencaRow(db, projetoId, 'google', now);
    const prevPayload = parseJson(row.payload_json, {});
    const payload = {
        ...prevPayload,
        steps: result.steps || [],
        doneSteps: Array.isArray(prevPayload.doneSteps) ? prevPayload.doneSteps : [],
        guiaoVideo: result.guiaoVideo,
        contaScript: result.contaScript,
        mensagemClienteRascunho: result.mensagemClienteRascunho,
        lastSubmitNota: result.nota || ''
    };

    const estado = result.ok ? 'em_curso' : 'em_falta_dados';
    db.prepare(`
        UPDATE presenca_mapa SET
            estado = ?, submetido_em = CASE WHEN ? = 'em_curso' AND submetido_em = '' THEN ? ELSE submetido_em END,
            ultimo_erro = ?, tentativas = tentativas + 1, payload_json = ?, actualizado_em = ?
        WHERE id = ?
    `).run(
        estado,
        estado,
        now,
        result.ok ? '' : (result.missing || []).map((m) => m.label).join(', '),
        JSON.stringify(payload),
        now,
        row.id
    );
    syncProjetoGoogleEstado(db, projetoId, estado);

    if (typeof logEvento === 'function') {
        logEvento(db, 'projeto', projetoId, 'presenca_google_inicio', { estado, missing: result.missing || [] });
    }

    return { ok: true, result, cockpit: buildCockpit(db, projetoId, { nowIso }) };
}

function toggleStep(db, projetoId, stepId, done, { nowIso } = {}) {
    const row = ensurePresencaRow(db, projetoId, 'google', nowIso);
    const payload = parseJson(row.payload_json, {});
    const set = new Set(Array.isArray(payload.doneSteps) ? payload.doneSteps : []);
    if (done) set.add(stepId);
    else set.delete(stepId);
    payload.doneSteps = Array.from(set);
    const now = typeof nowIso === 'function' ? nowIso() : (nowIso || new Date().toISOString());
    db.prepare(`
        UPDATE presenca_mapa SET payload_json = ?, actualizado_em = ? WHERE id = ?
    `).run(JSON.stringify(payload), now, row.id);
    return buildCockpit(db, projetoId, { nowIso });
}

function applyGoogleAction(db, projetoId, action, { nowIso, logEvento } = {}) {
    const ctx = loadDealContext(db, projetoId);
    if (!ctx) return { error: 'Projeto não encontrado.', status: 404 };
    if (!ctx.hasGoogle) return { error: 'Sem presença Google neste projeto.', status: 400 };

    const now = typeof nowIso === 'function' ? nowIso() : (nowIso || new Date().toISOString());
    const row = ensurePresencaRow(db, projetoId, 'google', now);
    let estado = normalizeEstado(row.estado);
    let projetoEstado = ctx.row.estado;
    let delivered = false;

    if (action === 'aguardar_verificacao') {
        estado = 'a_aguardar_verificacao';
    } else if (action === 'verificado') {
        estado = 'verificado';
        db.prepare(`
            UPDATE presenca_mapa SET verificado_em = ? WHERE id = ?
        `).run(now, row.id);
        if (ctx.googleOnly) {
            projetoEstado = 'entregue';
            delivered = true;
            db.prepare('UPDATE projeto SET estado = ? WHERE id = ?').run(projetoEstado, projetoId);
        }
    } else if (action === 'falhou') {
        estado = 'falhou';
    } else if (action === 'em_curso') {
        estado = 'em_curso';
    } else {
        return { error: 'Acção inválida.', status: 400 };
    }

    db.prepare(`
        UPDATE presenca_mapa SET estado = ?, actualizado_em = ?, ultimo_erro = CASE WHEN ? = 'falhou' THEN ultimo_erro ELSE '' END
        WHERE id = ?
    `).run(estado, now, estado, row.id);
    syncProjetoGoogleEstado(db, projetoId, estado);

    if (typeof logEvento === 'function') {
        logEvento(db, 'projeto', projetoId, 'presenca_google_estado', {
            estado,
            action,
            delivered,
            projetoEstado
        });
    }

    return {
        ok: true,
        delivered,
        projetoEstado,
        cockpit: buildCockpit(db, projetoId, { nowIso })
    };
}

function patchEstadoGoogle(raw) {
    if (!isValidEstado(raw) && raw !== 'nao_incluido') {
        return { error: 'Estado Google inválido.' };
    }
    if (raw === 'nao_incluido') return { estado: 'nao_incluido' };
    return { estado: normalizeEstado(raw) };
}

module.exports = {
    ensurePresencaRow,
    syncProjetoGoogleEstado,
    loadDealContext,
    publicPresenca,
    buildCockpit,
    startDelivery,
    toggleStep,
    applyGoogleAction,
    patchEstadoGoogle,
    getProvider
};
