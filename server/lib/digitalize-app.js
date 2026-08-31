/**
 * Backend for the self-serve onboarding app at /digitalize — the "Digitalize
 * v2" one-tap-question flow. No client accounts: a session is a private
 * resumable link (digitalize_sessao.id) attached to a real `lead` row from
 * the moment it starts, so every answer is just a normal dossier field
 * write — same tables, same demo/boilerplate pipeline the admin tool uses.
 *
 * Points/levels are new (nothing like this existed before): an append-only
 * ledger (digitalize_ponto) keyed by (sessao_id, chave) so awarding is
 * idempotent — replaying a step never double-counts, and the level (derived
 * from the running total) can only go up. Thresholds are our own design
 * choice, not a literal transcription of the mockup's numbers.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { sanitizeDados } = require('./digitalizept-dossier');
const { renderContractPdf } = require('./digitalizept-pdf');
const { scaffoldClosedDeal } = require('./digitalizept-work');
const { allocateDemoSlug } = require('./digitalizept-business-identity');
const payments = require('./digitalizept-payments');

const CONTRACTS_DIR = path.join(__dirname, '..', 'data', 'digitalizept-contracts');
const PACOTE_CODIGO = 'digitalize_app_basico';
const PACOTE_PRECO_CENTIMOS = 4900;

function cleanText(value, max = 1200) {
    if (!value || typeof value !== 'string') return '';
    return value.trim().replace(/\s+/g, ' ').slice(0, max);
}

function nowIso() {
    return new Date().toISOString();
}

function newToken() {
    // URL-friendly, unguessable, short enough to type from a text message.
    return crypto.randomBytes(9).toString('base64url');
}

function digitalizeptSlugLike(value) {
    const base = String(value || 'negocio')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40) || 'negocio';
    return `${base}-${Math.random().toString(36).slice(2, 6)}`;
}

/** Points ledger — SUM of (sessao_id) rows. Never decreases: only INSERTs, never DELETEs. */
const LEVELS = [
    { nivel: 1, min: 0, nome: 'Presente' },
    { nivel: 2, min: 250, nome: 'Encontrável' },
    { nivel: 3, min: 650, nome: 'Visível no Google' },
    { nivel: 4, min: 1000, nome: 'Partilhado' },
    { nivel: 5, min: 1500, nome: 'A crescer' }
];

function levelForPoints(points) {
    let hit = LEVELS[0];
    LEVELS.forEach((l) => { if (points >= l.min) hit = l; });
    return hit;
}

function nextLevelThreshold(points) {
    const next = LEVELS.find((l) => l.min > points);
    return next ? next.min : null;
}

function totalPoints(db, sessaoId) {
    const row = db.prepare('SELECT COALESCE(SUM(pontos), 0) AS total FROM digitalize_ponto WHERE sessao_id = ?').get(sessaoId);
    return row ? Number(row.total) || 0 : 0;
}

/** Idempotent: same (sessaoId, chave) awarded twice is a no-op the second time. */
function awardPoints(db, sessaoId, chave, pontos) {
    db.prepare(`
        INSERT OR IGNORE INTO digitalize_ponto (id, sessao_id, chave, pontos, criado_em)
        VALUES (?, ?, ?, ?, ?)
    `).run(crypto.randomUUID(), sessaoId, chave, pontos, nowIso());
    const total = totalPoints(db, sessaoId);
    const nivel = levelForPoints(total).nivel;
    db.prepare('UPDATE digitalize_sessao SET nivel = ?, actualizado_em = ? WHERE id = ?')
        .run(nivel, nowIso(), sessaoId);
    return { total, nivel };
}

function createSession(db) {
    const token = newToken();
    const leadId = crypto.randomUUID();
    const now = nowIso();
    db.prepare(`
        INSERT INTO lead (id, business_type, nome, morada, cidade, telefone, whatsapp, estado, cobertura, criado_em)
        VALUES (?, 'generico', '', '', '', '', '', 'rascunho', 'contacto_remoto', ?)
    `).run(leadId, now);
    db.prepare(`
        INSERT INTO dados_negocio (id, lead_id, obrigatorios_json, opcionais_json, criado_em)
        VALUES (?, ?, '{}', '{}', ?)
    `).run(crypto.randomUUID(), leadId, now);
    db.prepare(`
        INSERT INTO digitalize_sessao (id, lead_id, nivel, criado_em, actualizado_em)
        VALUES (?, ?, 1, ?, ?)
    `).run(token, leadId, now, now);
    return { token, leadId };
}

function getSession(db, token) {
    const sessao = db.prepare('SELECT * FROM digitalize_sessao WHERE id = ?').get(String(token || '').trim());
    if (!sessao) return null;
    const lead = db.prepare('SELECT * FROM lead WHERE id = ?').get(sessao.lead_id);
    if (!lead) return null;
    const dadosRow = db.prepare('SELECT obrigatorios_json, opcionais_json FROM dados_negocio WHERE lead_id = ?').get(lead.id);
    const obrigatorios = JSON.parse((dadosRow && dadosRow.obrigatorios_json) || '{}');
    const opcionais = JSON.parse((dadosRow && dadosRow.opcionais_json) || '{}');
    const dados = { ...opcionais, ...obrigatorios };
    const points = totalPoints(db, sessao.id);
    const pagamento = db.prepare(`
        SELECT * FROM digitalize_pagamento WHERE sessao_id = ? ORDER BY criado_em DESC LIMIT 1
    `).get(sessao.id);
    return {
        token: sessao.id,
        leadId: lead.id,
        lead,
        dados,
        businessTypeId: lead.business_type,
        pontos: points,
        nivel: levelForPoints(points).nivel,
        nivelNome: levelForPoints(points).nome,
        proximoNivelEm: nextLevelThreshold(points),
        pago: Boolean(lead.demo_slug) && lead.estado === 'fechado',
        pagamento: pagamento || null
    };
}

/** Merge a partial answer into dados_negocio, using the same split as the admin dossier. */
function patchDados(db, { leadId, businessType, patch }) {
    const dadosRow = db.prepare('SELECT id, obrigatorios_json, opcionais_json FROM dados_negocio WHERE lead_id = ?').get(leadId);
    const obrigatorios = JSON.parse((dadosRow && dadosRow.obrigatorios_json) || '{}');
    const opcionais = JSON.parse((dadosRow && dadosRow.opcionais_json) || '{}');
    // businessTypeId controls the lead.business_type column, not a dossier field.
    const businessTypeId = patch && patch.businessTypeId;
    const rest = { ...(patch || {}) };
    delete rest.businessTypeId;
    const clean = sanitizeDados(rest, cleanText);
    const requiredIds = new Set([
        ...(Array.isArray(businessType.campos_obrigatorios) ? businessType.campos_obrigatorios : []),
        ...((businessType.perguntas_especificas || []).map((q) => q.id))
    ]);
    Object.entries(clean).forEach(([key, value]) => {
        if (requiredIds.has(key)) { obrigatorios[key] = value; delete opcionais[key]; } else { opcionais[key] = value; delete obrigatorios[key]; }
    });
    db.prepare('UPDATE dados_negocio SET obrigatorios_json = ?, opcionais_json = ? WHERE id = ?')
        .run(JSON.stringify(obrigatorios), JSON.stringify(opcionais), dadosRow.id);

    // Mirror onto the flat lead columns the rest of the app reads directly.
    const leadPatch = {};
    ['nome', 'morada', 'cidade', 'telefone', 'whatsapp'].forEach((col) => {
        const srcKey = col === 'nome' ? 'nome_negocio' : col;
        if (Object.prototype.hasOwnProperty.call(clean, srcKey)) leadPatch[col] = clean[srcKey];
    });
    if (businessTypeId) leadPatch.business_type = cleanText(businessTypeId, 80);
    if (Object.keys(leadPatch).length) {
        const sets = Object.keys(leadPatch).map((k) => `${k} = @${k}`).join(', ');
        db.prepare(`UPDATE lead SET ${sets} WHERE id = @id`).run({ ...leadPatch, id: leadId });
    }
    return { ...opcionais, ...obrigatorios };
}

function buildFlatContractHtml({ clienteNome, clienteNif, negocioNome, dataIso, hash }) {
    const dataFmt = new Date(dataIso).toLocaleDateString('pt-PT', { day: 'numeric', month: 'long', year: 'numeric' });
    const preco = (PACOTE_PRECO_CENTIMOS / 100).toFixed(2).replace('.', ',');
    return `<!DOCTYPE html>
<html lang="pt-PT"><head><meta charset="UTF-8"><title>Acordo — ${negocioNome}</title>
<style>
body{font-family:Georgia,'Times New Roman',serif;max-width:640px;margin:40px auto;padding:0 24px;color:#1c1c1c;line-height:1.6}
h1{font-size:1.3rem;margin-bottom:0.2rem}
.meta{color:#666;font-size:0.85rem;margin-bottom:1.5rem}
ul{padding-left:1.2rem}
.preco{font-size:1.1rem;font-weight:bold;margin:1rem 0}
.foot{margin-top:2rem;font-size:0.8rem;color:#666;border-top:1px solid #ddd;padding-top:0.8rem}
</style></head><body>
<h1>Acordo de prestação de serviço — Site + domínio (self-service)</h1>
<p class="meta">YourLab · ${clienteNome}${clienteNif ? ` · NIF ${clienteNif}` : ''} · ${dataFmt}</p>
<p>Entre <strong>YourLab</strong> e <strong>${clienteNome}</strong>, para o negócio <strong>${negocioNome}</strong>, fica acordado o seguinte:</p>
<p><strong>O que está incluído:</strong></p>
<ul>
<li>Site publicado a partir das respostas dadas na app digitalize.yourlabpt.com/digitalize.</li>
<li>Domínio próprio e alojamento incluídos no primeiro ano; a renovação anual do domínio fica a cargo do cliente a partir do segundo ano, tal como é prática comum.</li>
<li>Ligação da ficha do Google, Instagram e Facebook ao site, quando o cliente os indicar — na app ou mais tarde, a pedido.</li>
<li>Botão de WhatsApp a funcionar no site.</li>
<li>Alterações de conteúdo (texto, fotos, horário, serviços) sempre grátis, feitas na app.</li>
</ul>
<p class="preco">Valor: ${preco} € (pagamento único, sem IVA, sem mensalidades).</p>
<p>O site e o código ficam propriedade de ${clienteNome} — sem obrigação de permanência com a YourLab.</p>
<p>Este acordo é aceite eletronicamente ao confirmar o pagamento, com registo de data, hora e dispositivo.</p>
<p class="foot">Documento gerado automaticamente pela app Digitalize · hash ${hash}</p>
</body></html>`;
}

function saveContractFiles(contratoId, html) {
    fs.mkdirSync(CONTRACTS_DIR, { recursive: true });
    const htmlPath = path.join(CONTRACTS_DIR, `${contratoId}.html`);
    fs.writeFileSync(htmlPath, html);
    return htmlPath;
}

/**
 * Called once the ifthenpay callback confirms payment. Creates the same
 * proposta/contrato/assinatura/projeto rows a human-closed deal would have
 * (via the admin /deals endpoint), plus a demo slug and a work folder — so a
 * self-serve deal shows up in Propostas exactly like any other.
 *
 * The "signature" here is a clickwrap record (IP + device + timestamp +
 * accepted-document hash), not a drawn squiggle — there is no signature pad
 * in a one-tap flow. That is a recognized, real form of e-signature; it is
 * not a shortcut around the requirement, just a different valid one.
 */
async function finalizeSelfServeDeal(db, {
    leadId, businessType, clienteNome, clienteEmail, clienteNif, ip, userAgent
}) {
    const lead = db.prepare('SELECT * FROM lead WHERE id = ?').get(leadId);
    if (!lead) throw new Error('Lead não encontrado.');
    const dadosRow = db.prepare('SELECT * FROM dados_negocio WHERE lead_id = ?').get(leadId);
    const dados = { ...JSON.parse(dadosRow.opcionais_json || '{}'), ...JSON.parse(dadosRow.obrigatorios_json || '{}') };

    const now = nowIso();
    const propostaId = crypto.randomUUID();
    const clienteId = crypto.randomUUID();
    const contratoId = crypto.randomUUID();
    const assinaturaId = crypto.randomUUID();
    const projetoId = crypto.randomUUID();

    const html = buildFlatContractHtml({
        clienteNome, clienteNif, negocioNome: dados.nome_negocio || lead.nome, dataIso: now, hash: contratoId
    });
    const htmlPath = saveContractFiles(contratoId, html);
    const hash = crypto.createHash('sha256').update(html).digest('hex');
    const pdfPath = path.join(CONTRACTS_DIR, `${contratoId}.pdf`);
    const pdfOk = await renderContractPdf(html, pdfPath).catch(() => false);

    const demoSlug = allocateDemoSlug(db, {
        nome: dados.nome_negocio || lead.nome,
        existingSlug: lead.demo_slug,
        leadId,
        existingNome: lead.nome,
        cidade: dados.cidade,
        makeSlug: digitalizeptSlugLike
    });

    // Reuse the exact seeding the admin wizard uses for a fresh demo — pure
    // functions, safe to import server-side (same trick as proposal-calc.js).
    const { seedDemoFromType } = await import('../../digitalizept/js/demo/seed.js');
    const demo = seedDemoFromType({ data: { businessType, dados } });
    const paletaId = cleanText(dados.paleta_escolhida, 20) || 'bold';
    const paleta = (Array.isArray(businessType.paletas_sugeridas) ? businessType.paletas_sugeridas : [])
        .find((p) => p.id === paletaId) || (businessType.paletas_sugeridas || [])[0];
    const identidade = paleta && Array.isArray(paleta.cores) && paleta.cores.length >= 3
        ? { paleta: paletaId, estilo: paletaId, cores: { base: paleta.cores[0], destaque: paleta.cores[1], secundaria: paleta.cores[2] } }
        : {};

    let workPath = '';
    try {
        workPath = scaffoldClosedDeal({
            projetoId,
            negocio: dados.nome_negocio || lead.nome,
            clienteNome,
            clienteEmail,
            verified: { totalComIva: PACOTE_PRECO_CENTIMOS, totalSemIva: PACOTE_PRECO_CENTIMOS, iva: 0 },
            contractHtmlPath: htmlPath,
            contractPdfPath: pdfOk ? pdfPath : '',
            dados,
            proposta: { pacote: PACOTE_CODIGO, extras: [], cobrarIva: false, origem: 'digitalize-app' },
            googlePresence: null,
            googleDiagnostico: null
        });
    } catch (err) {
        console.error('digitalize-app: work scaffold failed:', err.message);
    }

    db.transaction(() => {
        db.prepare(`
            UPDATE lead SET business_type = ?, estado = 'fechado', resultado = 'digitalizado',
                cobertura = 'demo_apresentada', demo_slug = ?, work_path = ?, demo_json = ?, identidade_json = ?
            WHERE id = ?
        `).run(businessType.id, demoSlug, workPath, JSON.stringify(demo), JSON.stringify(identidade), leadId);

        db.prepare(`
            INSERT INTO proposta (id, lead_id, itens_json, subtotal_centimos, desconto_pct, desconto_centimos,
                total_centimos, iva_rate, iva_centimos, total_com_iva_centimos, contrapartida, estado, criado_em)
            VALUES (?, ?, ?, ?, 0, 0, ?, 0, 0, ?, '', 'assinada', ?)
        `).run(
            propostaId, leadId,
            JSON.stringify({ pacote: PACOTE_CODIGO, extras: [], origem: 'digitalize-app' }),
            PACOTE_PRECO_CENTIMOS, PACOTE_PRECO_CENTIMOS, PACOTE_PRECO_CENTIMOS, now
        );
        db.prepare(`
            INSERT INTO cliente_legal (id, lead_id, nome, nif, morada, email, telefone)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(clienteId, leadId, clienteNome, clienteNif || '', dados.morada || '', clienteEmail, dados.telefone || '');
        db.prepare(`
            INSERT INTO contrato (id, proposta_id, template_versao, pdf_path, hash_sha256, assinado_em, estado, criado_em)
            VALUES (?, ?, 'digitalize-app-v1', ?, ?, ?, 'assinado', ?)
        `).run(contratoId, propostaId, pdfOk ? pdfPath : '', hash, now, now);
        db.prepare(`
            INSERT INTO assinatura (id, contrato_id, png_path, geo, ip, dispositivo, timestamp, hash_documento)
            VALUES (?, ?, '', '', ?, ?, ?, ?)
        `).run(assinaturaId, contratoId, cleanText(ip, 80), cleanText(userAgent, 300), now, hash);
        db.prepare(`
            INSERT INTO projeto (id, contrato_id, estado, estado_google, estado_dominio, criado_em)
            VALUES (?, ?, 'demonstracao_criada', 'por_criar', 'comprado', ?)
        `).run(projetoId, contratoId, now);
    })();

    return { demoSlug, propostaId, projetoId };
}

module.exports = {
    PACOTE_CODIGO,
    PACOTE_PRECO_CENTIMOS,
    LEVELS,
    levelForPoints,
    nextLevelThreshold,
    totalPoints,
    awardPoints,
    createSession,
    getSession,
    patchDados,
    finalizeSelfServeDeal,
    payments
};
