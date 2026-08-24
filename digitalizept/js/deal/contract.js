import { formatEuros } from '../format.js';
import { dominioContractLines } from '../domain.js';
import {
    DEFAULT_PACOTE,
    includesGooglePresence,
    includesWebsite
} from './packages.js';

export { includesGooglePresence, includesWebsite } from './packages.js';

// YourLab (prestador). Fiscal identity comes from the server so a contract is
// never signed against a placeholder; these are only the non-fiscal defaults.
const PROVIDER_DEFAULTS = {
    nome: 'YourLab',
    responsavel: 'Túlio Soares',
    artigo: 'o',
    nif: '',
    morada: '',
    email: 'yourlabpt@gmail.com',
    site: 'yourlabpt.com',
    iban: '',
    mbway: ''
};

// Shown in place of a missing fiscal field so the gap is obvious on screen
// during the sale rather than discovered on a signed document.
const MISSING = '(em falta)';

const LANDING_BASE = [
    'Landing page profissional (página única), adaptada a telemóvel'
];

const GOOGLE_BASE = [
    'Ficha pública no Google Maps / Search e gestão do Perfil da Empresa em business.google (conta do cliente)',
    'Criar, reivindicar ou pedir acesso ao Perfil da Empresa, conforme o estado atual da ficha no Maps',
    'Dados base: nome, categoria, morada, pin no mapa, telefone, horário e descrição',
    'Orientação e apoio à validação do Perfil da Empresa (cartão/vídeo/chamada; o prazo depende do Google, tipicamente até cerca de 5 dias úteis)',
    'O perfil em si é grátis na Google; anúncios / «Promover» não estão incluídos',
    'Não são garantidos resultados comerciais nem posicionamento no Maps'
];

const GOOGLE_ESSENCIAL = [
    ...GOOGLE_BASE,
    'Lote base de fotos (5–10) e atributos essenciais do setor',
    'Sem website neste pacote'
];

const GOOGLE_COMPLETO = [
    ...GOOGLE_BASE,
    'Perfil orientado a 100%: serviços, produtos, atributos, links, WhatsApp e redes quando disponíveis',
    'Lote base de fotos e revisão do perfil público',
    'Orientação breve para gestão futura do perfil (sem automação contínua nem SEO)'
];

const GOOGLE_MAPS_EXISTENTE = [
    'Atualizar a ficha pública no Maps e o Perfil da Empresa já existente: website, contactos e fotos chave',
    'Confirmar pin no mapa e dados públicos alinhados à landing',
    'O perfil em si é grátis na Google; anúncios / «Promover» não estão incluídos',
    'Não são garantidos resultados comerciais nem posicionamento no Maps'
];

const DOMAIN_LEGAL = [
    'Publicação online com domínio e alojamento, ou entrega do código em ZIP por email se o cliente preferir o próprio domínio',
    'Conformidade legal básica da página (informação obrigatória e contactos)'
];

function packageBaseLines(pacote) {
    if (pacote === 'google_essencial') {
        return [...GOOGLE_ESSENCIAL];
    }
    if (pacote === 'site_maps') {
        return [
            ...LANDING_BASE,
            ...DOMAIN_LEGAL,
            ...GOOGLE_MAPS_EXISTENTE
        ];
    }
    if (pacote === 'digital_completo') {
        return [
            ...LANDING_BASE,
            ...DOMAIN_LEGAL,
            ...GOOGLE_COMPLETO
        ];
    }
    if (pacote === 'plus') {
        return [
            ...LANDING_BASE,
            'Website com várias páginas, catálogo e até 2 idiomas',
            ...DOMAIN_LEGAL,
            ...GOOGLE_COMPLETO
        ];
    }
    if (pacote === 'renovacao') {
        return [
            ...LANDING_BASE,
            'Renovação de website existente (estrutura e conteúdo essenciais)',
            'Migração básica a partir do site atual, quando aplicável',
            'Publicação online com domínio e alojamento, ou entrega do código em ZIP por email se o cliente preferir o próprio domínio',
            ...GOOGLE_MAPS_EXISTENTE
        ];
    }
    // Legacy: essencial / completa
    if (pacote === 'completa') {
        return [...LANDING_BASE, ...DOMAIN_LEGAL, ...GOOGLE_COMPLETO];
    }
    return [...LANDING_BASE, ...DOMAIN_LEGAL];
}

export function resolveDeliverables(proposta) {
    const pacote = (proposta && proposta.pacote) || DEFAULT_PACOTE;
    const lines = [...packageBaseLines(pacote)];
    // Legacy extra on a landing-only package
    if (pacote === 'essencial' && includesGooglePresence(proposta)) {
        lines.push(...GOOGLE_COMPLETO);
    }
    if (Array.isArray(proposta && proposta.extras)) {
        if (proposta.extras.includes('google_perfil_completo') && pacote === 'google_essencial') {
            lines.push('Upgrade a perfil Google 100% (serviços, produtos, atributos, links e redes)');
        }
        if (proposta.extras.includes('google_avaliacoes')) {
            lines.push('Sessão de orientação para pedir e responder a avaliações reais (sem compra de reviews)');
        }
    }
    return lines;
}

// Kept for tests / callers that only know the package code. Prefer resolveDeliverables.
export const PACKAGE_DELIVERABLES = {
    google_essencial: packageBaseLines('google_essencial'),
    site_maps: packageBaseLines('site_maps'),
    digital_completo: packageBaseLines('digital_completo'),
    plus: packageBaseLines('plus'),
    renovacao: packageBaseLines('renovacao'),
    essencial: packageBaseLines('essencial'),
    completa: packageBaseLines('completa')
};

const CLAUSES = [
    'Apenas os serviços contratados e a lista de trabalhos descritos fazem parte deste acordo.',
    'A assistência e formação de utilização só está incluída se constar como extra contratado.',
    'A presença no Google só está incluída nos pacotes que a listam (Essencial Google, Site + Maps, Completo, Plus, Renovação) ou em extras Google contratados.',
    'A validação do Perfil Google depende do Google; a YourLab orienta o processo, sem garantir o prazo (tipicamente até cerca de 5 dias úteis).',
    'Alterações significativas poderão originar orçamento complementar.',
    'O prazo depende da entrega atempada dos conteúdos pelo cliente.',
    'Não são garantidos resultados comerciais nem posicionamento em motores de pesquisa ou no Google Maps.',
    'Serviços dependentes de terceiros (Google, domínios, alojamento, plataformas externas) estão sujeitos às respetivas regras e tempos de processamento.',
    'Se o cliente comprar o próprio domínio, a YourLab entrega o website em ficheiro ZIP por email; a publicação fica a cargo do cliente, salvo extra de ajuda a apontar o domínio.',
    'Após aprovação final do website (quando aplicável), alterações posteriores poderão ser cobradas separadamente.',
    'Propriedade: domínio, alojamento, contas Google e código ficam em nome do cliente.',
    'Garantia de 14 dias após a entrega e direito de livre resolução de 14 dias.',
    'O projeto encerra por aprovação do cliente ou após 15 dias sem resposta.',
    'O contrato produz efeitos após a assinatura eletrónica de ambas as partes (cliente e prestador).',
    'Os dados pessoais recolhidos são tratados para execução deste contrato, ao abrigo do RGPD.'
];

function escapeHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function manutencaoCodes(proposta) {
    if (Array.isArray(proposta.manutencoes) && proposta.manutencoes.length) {
        return proposta.manutencoes.filter(Boolean);
    }
    if (proposta.manutencao) return [proposta.manutencao];
    return [];
}

export function buildContractModel(state, catalog, config) {
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
        const pct = Math.round((calc.urgenciaPct || Number(byCode.urgencia.percentual) || 0) * 100);
        items.push({ nome: byCode.urgencia.nome, valor: `+${pct}%` });
    }
    manutencaoCodes(proposta).forEach((code) => {
        const m = byCode[code];
        if (!m) return;
        const unit = calc.iva > 0
            ? Math.round(m.preco_centimos * (1 + (calc.ivaRate || 0)))
            : m.preco_centimos;
        items.push({ nome: m.nome, valor: `${formatEuros(unit)}/mês` });
    });

    const provider = { ...PROVIDER_DEFAULTS, ...((config && config.provider) || {}) };
    const deliverables = resolveDeliverables(proposta);
    const dominioLines = includesWebsite(proposta)
        ? dominioContractLines(proposta.dominio)
        : [];

    return {
        provider,
        cliente: {
            nome: cliente.nome || '',
            nif: cliente.nif || '',
            morada: cliente.morada || '',
            email: cliente.email || '',
            telefone: cliente.telefone || ''
        },
        negocio: dados.nome_negocio || '',
        items,
        deliverables,
        dominioLines,
        calc,
        clauses: CLAUSES,
        data: new Date().toLocaleDateString('pt-PT')
    };
}

export function contractInnerHtml(model) {
    const c = model.calc || {};
    const itemsRows = model.items.map((i) => `
        <tr><td>${escapeHtml(i.nome)}</td><td class="c-right">${escapeHtml(i.valor)}</td></tr>`).join('');

    const deliverablesList = (model.deliverables || [])
        .map((line) => `<li>${escapeHtml(line)}</li>`).join('');
    const dominioList = (model.dominioLines || [])
        .map((line) => `<li>${escapeHtml(line)}</li>`).join('');

    // With IVA the total has to be broken out; without it there is a single total
    // and no "s/ IVA" wording, which would imply an IVA line that never comes.
    const comIva = c.iva > 0;
    const valuesRows = [
        ['Subtotal', formatEuros(c.subtotal)],
        c.urgencia > 0 ? [`Urgência (+${Math.round((c.urgenciaPct || 0) * 100)}%)`, `+${formatEuros(c.urgencia)}`] : null,
        c.desconto > 0 ? [`Desconto (−${c.descontoPct}%)`, `−${formatEuros(c.desconto)}`] : null,
        comIva ? ['Total s/ IVA', formatEuros(c.totalSemIva)] : null,
        comIva ? [`IVA (${Math.round((c.ivaRate || 0) * 100)}%)`, `+${formatEuros(c.iva)}`] : null,
        [comIva ? 'Total c/ IVA' : 'Total', formatEuros(c.totalComIva)],
        ['Entrada na assinatura (50%)', formatEuros(c.entrada)],
        ['Na entrega (50%)', formatEuros(c.final)]
    ].filter(Boolean).map(([l, v]) => `<tr><td>${escapeHtml(l)}</td><td class="c-right">${escapeHtml(v)}</td></tr>`).join('');

    const ivaNote = comIva
        ? `Valores com IVA à taxa legal de ${Math.round((c.ivaRate || 0) * 100)}%.`
        : 'Valores sem IVA. Prestação sem fatura com IVA neste momento.';

    const payment = [
        model.provider.iban ? `IBAN: ${model.provider.iban}` : '',
        model.provider.mbway ? `MB WAY: ${model.provider.mbway}` : ''
    ].filter(Boolean).join(' · ');
    const paymentNote = payment
        ? `${payment}. Indique como referência o nome do estabelecimento.`
        : '';

    const clausesList = model.clauses.map((cl) => `<li>${escapeHtml(cl)}</li>`).join('');

    return `
    <h1 class="c-title">Contrato de Prestação de Serviços</h1>
    <p class="c-date">${escapeHtml(model.data)}</p>

    <div class="c-parties">
        <div class="c-party">
            <div class="c-party-role">Prestador</div>
            <strong>${escapeHtml(model.provider.nome)}</strong> — ${escapeHtml(model.provider.responsavel)}<br>
            NIF: ${escapeHtml(model.provider.nif || MISSING)} · ${escapeHtml(model.provider.morada || MISSING)}<br>
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

    <h2 class="c-h2">Serviços a prestar</h2>
    <ul class="c-clauses">${deliverablesList}</ul>
    ${dominioList ? `<p class="c-note"><strong>Domínio</strong></p><ul class="c-clauses">${dominioList}</ul>` : ''}

    <h2 class="c-h2">Valores e pagamento</h2>
    <table class="c-table c-values">${valuesRows}</table>
    <p class="c-note">${escapeHtml(ivaNote)}</p>
    <p class="c-note">Pagamento: 50% na assinatura, 50% na entrega. A produção inicia após receção da entrada.</p>
    ${paymentNote ? `<p class="c-note">${escapeHtml(paymentNote)}</p>` : ''}

    <h2 class="c-h2">Responsabilidades e limitações</h2>
    <ul class="c-clauses">${clausesList}</ul>`;
}

export function buildContractDocument(model, { signaturePng, providerSignaturePng, audit } = {}) {
    const providerLabel = `${model.provider.responsavel || model.provider.nome} — Prestador`;
    const providerMark = providerSignaturePng
        ? `<img src="${providerSignaturePng}" alt="Assinatura do prestador" class="c-sign-img">`
        : `<div class="c-sign-line"></div>`;
    const signatureBlock = signaturePng ? `
        <div class="c-sign">
            <div class="c-sign-box">
                <img src="${signaturePng}" alt="Assinatura do cliente" class="c-sign-img">
                <div class="c-sign-label">${escapeHtml(model.cliente.nome)} — Cliente</div>
            </div>
            <div class="c-sign-box">
                ${providerMark}
                <div class="c-sign-label">${escapeHtml(providerLabel)}</div>
            </div>
        </div>` : '';

    const auditBlock = audit ? `
        <div class="c-audit">
            <strong>Registo das assinaturas eletrónicas</strong><br>
            Cliente — Data/hora: ${escapeHtml(audit.timestamp || '')}
            ${audit.geo ? ` · Localização: ${escapeHtml(audit.geo)}` : ''}<br>
            ${audit.providerTimestamp ? `Prestador — Data/hora: ${escapeHtml(audit.providerTimestamp)}<br>` : ''}
            Dispositivo: ${escapeHtml(audit.dispositivo || '')}<br>
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
  @page{size:A4;margin:14mm}
  @media print{body{padding:0;max-width:none}}
</style></head><body>
${contractInnerHtml(model)}
${signatureBlock}
${auditBlock}
</body></html>`;
}
