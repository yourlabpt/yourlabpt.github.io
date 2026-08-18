const HEX = /^#?([0-9a-fA-F]{6})$/;

export function normalizeHex(value) {
    const match = HEX.exec(String(value || '').trim());
    return match ? `#${match[1].toLowerCase()}` : '';
}

export function parseCores(text) {
    const raw = String(text || '').trim();
    if (!raw) return { ok: false, error: 'Cole o JSON das três cores.' };
    const unfenced = raw
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/, '')
        .trim();
    let parsed;
    try {
        parsed = JSON.parse(unfenced);
    } catch (_) {
        return { ok: false, error: 'JSON inválido. Esperado {"base":"#…","destaque":"#…","secundaria":"#…"}.' };
    }
    const src = (parsed && parsed.cores && typeof parsed.cores === 'object') ? parsed.cores : parsed;
    const base = normalizeHex(src.base || src.fundo || src.primary);
    const destaque = normalizeHex(src.destaque || src.accent || src.cta);
    const secundaria = normalizeHex(src.secundaria || src.secondary || src.apoio);
    if (!base || !destaque || !secundaria) {
        return { ok: false, error: 'Faltam três hexadecimais: base, destaque e secundaria.' };
    }
    return { ok: true, cores: { base, destaque, secundaria } };
}

export function applyCustomCores(identidade, cores) {
    identidade.paleta = 'custom';
    identidade.estilo = 'custom';
    identidade.cores = {
        base: cores.base,
        destaque: cores.destaque,
        secundaria: cores.secundaria
    };
}

export function buildColorPrompt(state) {
    const businessType = state.data.businessType || {};
    const dados = state.data.dados || {};
    const lines = [
        dados.nome_negocio && `- Nome: ${dados.nome_negocio}`,
        businessType.nome && `- Tipo: ${businessType.nome}`,
        dados.o_que_faz && `- O que faz: ${dados.o_que_faz}`,
        dados.principais_servicos && `- Serviços: ${dados.principais_servicos}`,
        dados.diferencial && `- Diferencial: ${dados.diferencial}`,
        dados.cidade && `- Cidade: ${dados.cidade}`,
        businessType.publico_alvo && `- Público: ${businessType.publico_alvo}`,
        businessType.tom && `- Tom: ${businessType.tom}`
    ].filter(Boolean).join('\n');

    return `És um designer de identidade visual para pequenos negócios em Portugal.
Escolhe 3 cores de website a partir da ideia do produto — não um template genérico.

NEGÓCIO
${lines || '- (poucos dados; inventa uma paleta sóbria e local, não neon)'}

PAPÉIS
- base: fundo / cor principal da marca (texto em contraste fica legível).
- destaque: acento e botões (CTA).
- secundaria: apoio, chips, detalhes.

REGRAS
- Hex de 6 dígitos. Contraste suficiente para texto branco ou preto sobre a base.
- Paleta coerente com o ofício (padaria ≠ ginásio ≠ clínica).
- Sem nomes de marcas conhecidas.

TAREFA
Devolve UM objeto JSON. Nada antes, nada depois. Sem markdown.

{"base":"#rrggbb","destaque":"#rrggbb","secundaria":"#rrggbb"}`;
}
