const HEX6 = /^#?([0-9a-fA-F]{6})$/;
const HEX3 = /^#?([0-9a-fA-F]{3})$/;

export function normalizeHex(value) {
    const text = String(value || '').trim().replace(/\s/g, '');
    const six = HEX6.exec(text);
    if (six) return `#${six[1].toLowerCase()}`;
    const three = HEX3.exec(text);
    if (three) {
        const [r, g, b] = three[1].toLowerCase().split('');
        return `#${r}${r}${g}${g}${b}${b}`;
    }
    return '';
}

function stripFences(text) {
    return String(text || '')
        .replace(/^\uFEFF/, '')
        .replace(/```(?:json)?/gi, '')
        .trim();
}

function sliceObject(text) {
    const first = text.indexOf('{');
    const last = text.lastIndexOf('}');
    if (first === -1 || last === -1 || last <= first) return '';
    return text.slice(first, last + 1);
}

function normalizeJsonText(text) {
    return text
        .replace(/[\u201C\u201D\u201E\u201F\u00AB\u00BB\u275D\u275E]/g, '"')
        .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
        .replace(/,\s*([}\]])/g, '$1');
}

function parseObject(raw) {
    const sliced = sliceObject(stripFences(raw));
    if (!sliced) return null;
    try {
        return JSON.parse(sliced);
    } catch (_) {
        try {
            return JSON.parse(normalizeJsonText(sliced));
        } catch (_ignored) {
            return null;
        }
    }
}

function hexNearLabel(text, labels) {
    const source = normalizeJsonText(stripFences(text));
    for (const label of labels) {
        const pattern = new RegExp(`${label}\\s*[:=]\\s*["']?#([0-9a-fA-F]{3,6})`, 'i');
        const match = pattern.exec(source);
        if (match) {
            const hex = normalizeHex(match[1]);
            if (hex) return hex;
        }
    }
    return '';
}

export function parseCores(text) {
    const raw = String(text || '').trim();
    if (!raw) return { ok: false, error: 'Cole o JSON das três cores.' };

    const parsed = parseObject(raw);
    const src = (parsed && parsed.cores && typeof parsed.cores === 'object') ? parsed.cores : (parsed || {});
    let base = normalizeHex(src.base || src.fundo || src.primary);
    let destaque = normalizeHex(src.destaque || src.accent || src.cta);
    let secundaria = normalizeHex(src.secundaria || src.secondary || src.apoio);

    if (!base) base = hexNearLabel(raw, ['base', 'fundo', 'primary']);
    if (!destaque) destaque = hexNearLabel(raw, ['destaque', 'accent', 'cta']);
    if (!secundaria) secundaria = hexNearLabel(raw, ['secundaria', 'secondary', 'apoio']);

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
Usa só a aspa ASCII " (não “ ”).

{"base":"#rrggbb","destaque":"#rrggbb","secundaria":"#rrggbb"}`;
}
