// Pure calculation module — no network/DOM imports, so it stays unit-testable
// and the server can import this exact file to re-verify the totals a client sends.

import { DEFAULT_PACOTE } from './deal/packages.js';

// Default human-hours per closed client (manual baseline from the pricing doc).
// A business-type config may override via `horas_estimadas`.
const DEFAULT_HORAS = 8.5;

function catalogByCode(catalog) {
    const map = {};
    (catalog || []).forEach((servico) => { map[servico.codigo] = servico; });
    return map;
}

export function ensureManutencoes(proposta) {
    if (!proposta || typeof proposta !== 'object') return [];
    if (Array.isArray(proposta.manutencoes) && proposta.manutencoes.length) {
        return proposta.manutencoes.filter(Boolean);
    }
    if (proposta.manutencao) return [proposta.manutencao];
    return [];
}

export function setManutencoes(proposta, codes) {
    const list = Array.isArray(codes) ? codes.filter(Boolean) : [];
    proposta.manutencoes = list;
    proposta.manutencao = list.length === 1 ? list[0] : (list[0] || null);
}

export function ensureProposta(state) {
    if (!state.data.proposta || typeof state.data.proposta !== 'object') {
        state.data.proposta = {
            pacote: DEFAULT_PACOTE,
            extras: [],
            urgencia: false,
            manutencao: null,
            manutencoes: [],
            descontoPct: 0,
            // Off by default: many door-to-door deals close before a company
            // and fatura exist. Flip on when you are ready to invoice with IVA.
            cobrarIva: false
        };
    }
    const p = state.data.proposta;
    if (!p.pacote) p.pacote = DEFAULT_PACOTE;
    if (!Array.isArray(p.extras)) p.extras = [];
    if (typeof p.urgencia !== 'boolean') p.urgencia = false;
    if (p.manutencao === undefined) p.manutencao = null;
    if (!Array.isArray(p.manutencoes)) {
        p.manutencoes = p.manutencao ? [p.manutencao] : [];
    }
    if (typeof p.descontoPct !== 'number') p.descontoPct = 0;
    if (typeof p.contrapartida !== 'string') p.contrapartida = '';
    if (typeof p.cobrarIva !== 'boolean') p.cobrarIva = false;
    return p;
}

// Config rate is the legal taxa when fatura exists. The deal can turn it off.
export function resolveIvaRate(proposta, configRate = 0) {
    const base = Math.max(0, Number(configRate) || 0);
    if (!proposta || proposta.cobrarIva !== true) return 0;
    return base;
}

// `ivaRate` is a fraction (0.23). 0 means no IVA on this deal — no fatura yet
// or a formal isenção set on the server.
export function computeProposta(proposta, catalog, businessType, ivaRate = 0) {
    const byCode = catalogByCode(catalog);
    const base = byCode[proposta.pacote];
    const basePrice = base ? Number(base.preco_centimos) : 0;

    const extrasPrice = (proposta.extras || []).reduce((sum, code) => {
        const s = byCode[code];
        return sum + (s ? Number(s.preco_centimos) : 0);
    }, 0);

    const subtotal = basePrice + extrasPrice;

    const urgenciaServico = byCode.urgencia;
    const urgenciaPct = proposta.urgencia && urgenciaServico
        ? Number(urgenciaServico.percentual || 0.30)
        : 0;
    const urgencia = Math.round(subtotal * urgenciaPct);

    const preDiscount = subtotal + urgencia;
    const descontoPct = Math.max(0, Math.min(100, Number(proposta.descontoPct) || 0));
    const desconto = Math.round(preDiscount * descontoPct / 100);
    const totalSemIva = preDiscount - desconto;

    const rate = Math.max(0, Number(ivaRate) || 0);
    const iva = Math.round(totalSemIva * rate);
    const totalComIva = totalSemIva + iva;

    // The entrada splits what the client actually pays, so it comes off the
    // IVA-inclusive total. `final` is the remainder rather than a second round,
    // so the two halves always add back up to the exact total.
    const entrada = Math.round(totalComIva / 2);
    const final = totalComIva - entrada;

    const manutCodes = ensureManutencoes(proposta);
    const manutencaoMensal = manutCodes.reduce((sum, code) => {
        const s = byCode[code];
        return sum + (s ? Number(s.preco_centimos) : 0);
    }, 0);
    const manutencaoMensalComIva = manutencaoMensal + Math.round(manutencaoMensal * rate);

    // Guardrail runs on revenue. IVA is collected for the State, so including it
    // would inflate the euros-per-hour and make an underpriced deal look healthy.
    const horas = (businessType && Number(businessType.horas_estimadas)) || DEFAULT_HORAS;
    const valorHora = horas > 0 ? (totalSemIva / 100) / horas : 0;

    return {
        subtotal,
        urgenciaPct,
        urgencia,
        descontoPct,
        desconto,
        ivaRate: rate,
        iva,
        totalSemIva,
        totalComIva,
        entrada,
        final,
        manutencaoMensal,
        manutencaoMensalComIva,
        valorHora,
        horas
    };
}

// Steps after the proposal screen call this so a service changed by going back
// is never priced from a stale _calc. Not used once a contract is signed: that
// document has to reproduce exactly the totals the client put their name to.
export function refreshCalc(state, catalog, businessType, configRate) {
    const proposta = ensureProposta(state);
    const rate = resolveIvaRate(proposta, configRate);
    proposta._calc = computeProposta(proposta, catalog, businessType, rate);
    return proposta._calc;
}

export function guardrailLevel(valorHora) {
    if (valorHora >= 100) return 'green';
    if (valorHora >= 60) return 'amber';
    return 'red';
}
