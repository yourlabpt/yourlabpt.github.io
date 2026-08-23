const HEX6 = /^#?([0-9a-fA-F]{6})$/;
const HEX3 = /^#?([0-9a-fA-F]{3})$/;

export const INK_DARK = '#17171a';
export const INK_LIGHT = '#f4f1ea';
export const PAPER_LIGHT = '#fafaf8';

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

function hexToRgb(hex) {
    const n = normalizeHex(hex);
    if (!n) return null;
    return {
        r: parseInt(n.slice(1, 3), 16),
        g: parseInt(n.slice(3, 5), 16),
        b: parseInt(n.slice(5, 7), 16)
    };
}

function channelToLin(c) {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex) {
    const rgb = hexToRgb(hex);
    if (!rgb) return 0;
    return 0.2126 * channelToLin(rgb.r) + 0.7152 * channelToLin(rgb.g) + 0.0722 * channelToLin(rgb.b);
}

export function contrastRatio(a, b) {
    const l1 = relativeLuminance(a);
    const l2 = relativeLuminance(b);
    const hi = Math.max(l1, l2);
    const lo = Math.min(l1, l2);
    return (hi + 0.05) / (lo + 0.05);
}

function mixHex(a, b, amountA) {
    const A = hexToRgb(a);
    const B = hexToRgb(b);
    if (!A || !B) return normalizeHex(a) || INK_DARK;
    const t = Math.min(1, Math.max(0, amountA));
    const ch = (x, y) => Math.round(x * t + y * (1 - t));
    return `#${[ch(A.r, B.r), ch(A.g, B.g), ch(A.b, B.b)].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
}

/** Black or cream — whichever reads on `bg` at WCAG AA (4.5:1), or the stronger of the two. */
export function onColor(bg, { min = 4.5 } = {}) {
    const paper = normalizeHex(bg) || PAPER_LIGHT;
    const dark = contrastRatio(INK_DARK, paper);
    const light = contrastRatio(INK_LIGHT, paper);
    if (dark >= min && dark >= light) return INK_DARK;
    if (light >= min && light >= dark) return INK_LIGHT;
    return dark >= light ? INK_DARK : INK_LIGHT;
}

/** Prefer the brand colour as text if it still hits AA on `bg`. */
export function readableInk(preferred, bg, { min = 4.5 } = {}) {
    const paper = normalizeHex(bg) || PAPER_LIGHT;
    const ink = normalizeHex(preferred);
    if (ink && contrastRatio(ink, paper) >= min) return ink;
    return onColor(paper, { min });
}

export function mutedInk(ink, bg, { min = 4.5 } = {}) {
    const paper = normalizeHex(bg) || PAPER_LIGHT;
    const fg = normalizeHex(ink) || onColor(paper);
    const mixed = mixHex(fg, paper, 0.78);
    return contrastRatio(mixed, paper) >= min ? mixed : fg;
}

/** Darken (or lighten on dark paper) until the colour reads as text at WCAG AA. */
export function accentInk(preferred, bg, { min = 4.5 } = {}) {
    const paper = normalizeHex(bg) || PAPER_LIGHT;
    const color = normalizeHex(preferred);
    if (!color) return INK_DARK;
    if (contrastRatio(color, paper) >= min) return color;
    const toward = relativeLuminance(paper) > 0.5 ? INK_DARK : INK_LIGHT;
    for (let t = 0.05; t <= 1.001; t += 0.05) {
        const mixed = mixHex(toward, color, t);
        if (contrastRatio(mixed, paper) >= min) return mixed;
    }
    return toward;
}

/** Darken/lighten a fill until `onFill` text hits AA on it. */
export function accentSolid(fill, onFill, { min = 4.5 } = {}) {
    const accent = normalizeHex(fill);
    const ink = normalizeHex(onFill) || onColor(accent);
    if (!accent) return INK_DARK;
    if (contrastRatio(ink, accent) >= min) return accent;
    const toward = relativeLuminance(ink) > 0.5 ? INK_DARK : INK_LIGHT;
    for (let t = 0.05; t <= 1.001; t += 0.05) {
        const mixed = mixHex(toward, accent, t);
        if (contrastRatio(ink, mixed) >= min) return mixed;
    }
    return toward;
}

/**
 * Page paper after the operator picks colours. Category templates (restaurant)
 * may ship a dark editorial --bg; that must not win over a light brand colour.
 * Prefer secundaria when it can serve as paper, otherwise cream.
 */
export function paperFromCores(cores, fallback = PAPER_LIGHT) {
    const secondary = normalizeHex(cores && cores.secundaria);
    if (
        secondary
        && relativeLuminance(secondary) >= 0.45
        && contrastRatio(INK_DARK, secondary) >= 4.5
    ) {
        return secondary;
    }
    return normalizeHex(fallback) || PAPER_LIGHT;
}

/**
 * Tokens for no-image pages after identity re-skin.
 * Pass `paperBg` only to score a known surface. Identity apply omits it so a
 * dark category template cannot keep its editorial paper over the brand palette.
 */
export function contrastTokens(cores = {}, paperBg) {
    const bg = normalizeHex(paperBg) || paperFromCores(cores);
    const accent = normalizeHex(cores.destaque) || '#2d6a64';
    const accent2 = normalizeHex(cores.secundaria) || normalizeHex(cores.base) || INK_DARK;
    const ink = readableInk(cores.base, bg);
    const onAccent = onColor(accent);
    const onAccent2 = onColor(accent2);
    return {
        bg,
        ink,
        accent,
        accent2,
        accentInk: accentInk(accent, bg),
        accent2Ink: accentInk(accent2, bg),
        accentSolid: accentSolid(accent, onAccent),
        onAccent,
        onAccent2,
        inkMuted: mutedInk(ink, bg)
    };
}

export function readCssHexToken(cssText, name) {
    const src = String(cssText || '');
    const re = new RegExp(`--${name}\\s*:\\s*(#[0-9a-fA-F]{3,8})`, 'g');
    let last = '';
    for (const match of src.matchAll(re)) {
        last = normalizeHex(match[1]);
    }
    return last;
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
