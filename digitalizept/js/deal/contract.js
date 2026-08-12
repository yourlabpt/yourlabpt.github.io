import { formatEuros } from '../format.js';

// YourLab (prestador) — fiscal fields left to fill so nothing is fabricated in a legal doc.
const PROVIDER = {
    nome: 'YourLab',
    responsavel: 'Túlio Soares',
    nif: '(a preencher)',
    morada: '(a preencher)',
    email: 'yourlabpt@gmail.com',
    site: 'yourlabpt.com'
};

const CLAUSES = [
    'Apenas os serviços contratados fazem parte deste acordo.',
    'Alterações significativas poderão originar orçamento complementar.',
    'O prazo depende da entrega atempada dos conteúdos pelo cliente.',
    'Não são garantidos resultados comerciais nem posicionamento em motores de pesquisa.',
    'Serviços dependentes de terceiros (Google, domínios, alojamento, plataformas externas) estão sujeitos às respetivas regras e tempos de processamento.',
    'Após aprovação final do website, alterações posteriores poderão ser cobradas separadamente.',
    'Propriedade: domínio, alojamento, contas Google e código ficam em nome do cliente.',
    'Garantia de 14 dias após a entrega e direito de livre resolução de 14 dias.',
    'O projeto encerra por aprovação do cliente ou após 15 dias sem resposta.',
    'Os dados pessoais recolhidos são tratados para execução deste contrato, ao abrigo do RGPD.'
];

function escapeHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function buildContractModel(state, catalog) {
    const dados = state.data.dados || {};
    const proposta = state.data.proposta || {};
    const calc = proposta._calc || {};
    const cliente = state.data.clienteLegal || {};
    const byCode = {};
    (catalog || []).forEach((s) => { byCode[s.codigo] = s; });

    const items = [];
    const base = byCode[proposta.pacote];
    if (base) items.push({ nome: base.nome, valor: formatEuros(base.preco_centimos) });
    (proposta.extras || []).forEach((code) => {
        const s = byCode[code];
        if (s) items.push({ nome: s.nome, valor: formatEuros(s.preco_centimos) });
    });
    if (proposta.urgencia && byCode.urgencia) {
        items.push({ nome: 'Urgência (entrega em 48h)', valor: '+30%' });
    }
    if (proposta.manutencao && byCode[proposta.manutencao]) {
        const m = byCode[proposta.manutencao];
        items.push({ nome: m.nome, valor: `${formatEuros(m.preco_centimos)}/mês` });
    }

    return {
        provider: PROVIDER,
        cliente: {
            nome: cliente.nome || '',
            nif: cliente.nif || '',
            morada: cliente.morada || '',
            email: cliente.email || '',
            telefone: cliente.telefone || ''
        },
        negocio: dados.nome_negocio || '',
        items,
        calc,
        clauses: CLAUSES,
        data: new Date().toLocaleDateString('pt-PT')
    };
}

export function contractInnerHtml(model) {
    const c = model.calc || {};
    const itemsRows = model.items.map((i) => `
        <tr><td>${escapeHtml(i.nome)}</td><td class="c-right">${escapeHtml(i.valor)}</td></tr>`).join('');

    const valuesRows = [
        ['Subtotal', formatEuros(c.subtotal)],
        c.urgencia > 0 ? [`Urgência (+${Math.round((c.urgenciaPct || 0) * 100)}%)`, `+${formatEuros(c.urgencia)}`] : null,
        c.desconto > 0 ? [`Desconto (−${c.descontoPct}%)`, `−${formatEuros(c.desconto)}`] : null,
        ['Total', formatEuros(c.total)],
        ['Entrada na assinatura (50%)', formatEuros(c.entrada)],
        ['Na entrega (50%)', formatEuros(c.final)]
    ].filter(Boolean).map(([l, v]) => `<tr><td>${escapeHtml(l)}</td><td class="c-right">${escapeHtml(v)}</td></tr>`).join('');

    const clausesList = model.clauses.map((cl) => `<li>${escapeHtml(cl)}</li>`).join('');

    return `
    <h1 class="c-title">Contrato de Prestação de Serviços</h1>
    <p class="c-date">${escapeHtml(model.data)}</p>

    <div class="c-parties">
        <div class="c-party">
            <div class="c-party-role">Prestador</div>
            <strong>${escapeHtml(model.provider.nome)}</strong> — ${escapeHtml(model.provider.responsavel)}<br>
            NIF: ${escapeHtml(model.provider.nif)} · ${escapeHtml(model.provider.morada)}<br>
            ${escapeHtml(model.provider.email)} · ${escapeHtml(model.provider.site)}
        </div>
        <div class="c-party">
            <div class="c-party-role">Cliente</div>
            <strong>${escapeHtml(model.cliente.nome)}</strong>${model.negocio ? ` (${escapeHtml(model.negocio)})` : ''}<br>
            NIF: ${escapeHtml(model.cliente.nif)} · ${escapeHtml(model.cliente.morada)}<br>
            ${escapeHtml(model.cliente.email)} · ${escapeHtml(model.cliente.telefone)}
        </div>
    </div>

    <h2 class="c-h2">Serviços contratados</h2>
    <table class="c-table">${itemsRows}</table>

    <h2 class="c-h2">Valores e pagamento</h2>
    <table class="c-table c-values">${valuesRows}</table>
    <p class="c-note">Pagamento: 50% na assinatura, 50% na entrega. A produção inicia após receção da entrada.</p>

    <h2 class="c-h2">Responsabilidades e limitações</h2>
    <ul class="c-clauses">${clausesList}</ul>`;
}

export function buildContractDocument(model, { signaturePng, audit } = {}) {
    const signatureBlock = signaturePng ? `
        <div class="c-sign">
            <div class="c-sign-box">
                <img src="${signaturePng}" alt="Assinatura do cliente" class="c-sign-img">
                <div class="c-sign-label">${escapeHtml(model.cliente.nome)} — Cliente</div>
            </div>
            <div class="c-sign-box">
                <div class="c-sign-line"></div>
                <div class="c-sign-label">${escapeHtml(model.provider.nome)} — Prestador</div>
            </div>
        </div>` : '';

    const auditBlock = audit ? `
        <div class="c-audit">
            <strong>Registo da assinatura eletrónica</strong><br>
            Data/hora: ${escapeHtml(audit.timestamp || '')}<br>
            Dispositivo: ${escapeHtml(audit.dispositivo || '')}<br>
            ${audit.geo ? `Localização: ${escapeHtml(audit.geo)}<br>` : ''}
            Hash do documento (SHA-256): ${escapeHtml(audit.hash || '')}
        </div>` : '';

    return `<!doctype html><html lang="pt"><head><meta charset="utf-8">
<title>Contrato — ${escapeHtml(model.negocio || model.cliente.nome)}</title>
<style>
  body{font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1c1c1c;max-width:720px;margin:0 auto;padding:32px;line-height:1.5}
  .c-title{font-size:1.5rem;margin:0 0 4px}
  .c-date{color:#666;margin:0 0 20px}
  .c-parties{display:flex;gap:16px;margin-bottom:20px;flex-wrap:wrap}
  .c-party{flex:1;min-width:220px;background:#f6f4ef;border:1px solid #e5e0d5;border-radius:8px;padding:12px;font-size:.9rem}
  .c-party-role{text-transform:uppercase;font-size:.7rem;letter-spacing:.5px;color:#a07d3a;margin-bottom:6px}
  .c-h2{font-size:1.05rem;margin:22px 0 8px;border-bottom:2px solid #e8d5b7;padding-bottom:4px}
  .c-table{width:100%;border-collapse:collapse;font-size:.92rem}
  .c-table td{padding:6px 0;border-bottom:1px solid #eee}
  .c-right{text-align:right;white-space:nowrap}
  .c-values td{font-weight:500}
  .c-note{font-size:.85rem;color:#555;margin-top:8px}
  .c-clauses{font-size:.85rem;color:#333;padding-left:18px}
  .c-clauses li{margin-bottom:5px}
  .c-sign{display:flex;gap:24px;margin-top:32px;flex-wrap:wrap}
  .c-sign-box{flex:1;min-width:200px;text-align:center}
  .c-sign-img{max-width:200px;max-height:90px;border-bottom:1px solid #333}
  .c-sign-line{height:60px;border-bottom:1px solid #333}
  .c-sign-label{font-size:.8rem;color:#555;margin-top:6px}
  .c-audit{margin-top:28px;padding:12px;background:#f6f4ef;border-radius:8px;font-size:.72rem;color:#666;word-break:break-all}
  @media print{body{padding:0}}
</style></head><body>
${contractInnerHtml(model)}
${signatureBlock}
${auditBlock}
</body></html>`;
}
