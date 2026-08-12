// Pure calculation module — no network/DOM imports, so it stays unit-testable
// and the server can import this exact file to re-verify the totals a client sends.

// Default human-hours per closed client (manual baseline from the pricing doc).
// A business-type config may override via `horas_estimadas`.
const DEFAULT_HORAS = 8.5;

function catalogByCode(catalog) {
    const map = {};
    (catalog || []).forEach((servico) => { map[servico.codigo] = servico; });
    return map;
}

export function ensureProposta(state) {
    if (!state.data.proposta || typeof state.data.proposta !== 'object') {
        state.data.proposta = {
            pacote: 'essencial',
            extras: [],
            urgencia: false,
            manutencao: null,
            descontoPct: 0
        };
    }
    const p = state.data.proposta;
    if (!p.pacote) p.pacote = 'essencial';
    if (!Array.isArray(p.extras)) p.extras = [];
    if (typeof p.urgencia !== 'boolean') p.urgencia = false;
    if (p.manutencao === undefined) p.manutencao = null;
    if (typeof p.descontoPct !== 'number') p.descontoPct = 0;
    return p;
}

// `ivaRate` is a fraction (0.23) and comes from the server. 0 means the art. 53.º
// isencao regime: no IVA is charged and none is shown anywhere.
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

    const manutServico = proposta.manutencao ? byCode[proposta.manutencao] : null;
    const manutencaoMensal = manutServico ? Number(manutServico.preco_centimos) : 0;
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
export function refreshCalc(state, catalog, businessType, ivaRate) {
    const proposta = ensureProposta(state);
    proposta._calc = computeProposta(proposta, catalog, businessType, ivaRate);
    return proposta._calc;
}

export function guardrailLevel(valorHora) {
    if (valorHora >= 100) return 'green';
    if (valorHora >= 60) return 'amber';
    return 'red';
}
