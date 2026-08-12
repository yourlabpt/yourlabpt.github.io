// Pure calculation module — no network/DOM imports, so it stays unit-testable.

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

export function computeProposta(proposta, catalog, businessType) {
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
    const total = preDiscount - desconto;
    const entrada = Math.round(total / 2);
    const final = total - entrada;

    const manutServico = proposta.manutencao ? byCode[proposta.manutencao] : null;
    const manutencaoMensal = manutServico ? Number(manutServico.preco_centimos) : 0;

    const horas = (businessType && Number(businessType.horas_estimadas)) || DEFAULT_HORAS;
    const valorHora = horas > 0 ? (total / 100) / horas : 0;

    return {
        subtotal,
        urgenciaPct,
        urgencia,
        descontoPct,
        desconto,
        total,
        entrada,
        final,
        manutencaoMensal,
        valorHora,
        horas
    };
}

export function guardrailLevel(valorHora) {
    if (valorHora >= 100) return 'green';
    if (valorHora >= 60) return 'amber';
    return 'red';
}
