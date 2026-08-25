/**
 * Digitalize Portugal outreach: filled WhatsApp sequence + HTML demo email.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { parsePortugueseAddress } = require('./digitalizept-geocode');

const EMAIL_TEMPLATE_PATH = path.join(
    __dirname,
    '..',
    '..',
    'digitalizept',
    'templates',
    'demo-outreach-email.html'
);

const EMAIL_TEMPLATE_PATH_EN = path.join(
    __dirname,
    '..',
    '..',
    'digitalizept',
    'templates',
    'demo-outreach-email-en.html'
);

const GANCHOS_PATH = path.join(
    __dirname,
    '..',
    '..',
    'digitalizept',
    'templates',
    'outreach-ganchos.json'
);

const FALHAS_PATH = path.join(
    __dirname,
    '..',
    '..',
    'digitalizept',
    'templates',
    'outreach-falhas.json'
);

const GANCHO_TO_FALHAS = {
    A: ['sem_nada'],
    B: ['redes_desligadas_maps', 'maps_sem_site'],
    C: ['site_fraco'],
    D: ['sem_nada'],
    E: ['ficha_errada']
};

const GANCHO_IDS = ['A', 'B', 'C', 'D', 'E'];

let falhasCache = null;
let ganchosCache = null;

const NOTICE_TEMPLATE_PATH = path.join(
    __dirname,
    '..',
    '..',
    'digitalizept',
    'templates',
    'branded-notice.html'
);

const DEFAULT_VENDEDOR_TELEFONE = '+351936732879';

const WA_TEMPLATES = {
    1: `{{saudacao}} Sr. {{clienteNome}} — sou {{vendedorArtigo}} {{vendedorNome}}, da YourLab, aqui de {{zona}}.{{pontEmailFrase}}

*{{ganchoTitulo}}*{{ganchoTextoWa}}

Fiz duas coisas para a *{{negocioNome}}*, sem lhe pedir nada. São exemplos — não estão publicados.

{{link}}

Gostou? Se fizer sentido, marcamos cinco minutos. Fazemos isto ao vosso lado — vocês não têm de gastar tempo a pensar nisto. Só precisamos de perceber o que querem. O valor é justo e ajusta-se ao momento do negócio.`,

    2: `{{diagnosticoLinha}}No email vê como ficaria a *{{negocioNome}}* quando alguém procura "{{oQueFaz}} em {{zona}}". E a página onde cabe a história toda.

{{link}}

Feito à medida. E o site fica vosso, não nosso. Cada página é construída de raiz para a casa — fica em nome da empresa.
{{blocoPrecosWa}}Isto é só uma parte do que fazemos. Se precisar de marcações, fichas, stocks — diga e falamos também.`,

    3: `{{saudacao}} Sr. {{clienteNome}}, foi um gosto passar por aí {{visitaQuando}}.

Aqui fica a página que lhe mostrei — a história toda num sítio só vosso:

{{link}}

Marcamos {{followupDia}} de manhã? Fazemos isto ao vosso lado — vocês não têm de gastar tempo a pensar nisto. Só precisamos de perceber o que querem. O valor é justo e ajusta-se ao momento do negócio.`
};

// Lower case, no selling verb: it reads like a note, not a campaign.
const EMAIL_SUBJECT = 'exemplo que fizemos para a {{negocioNome}}';

const EMAIL_TEXT = `{{saudacao}} Sr. {{clienteNome}} — sou {{vendedorArtigo}} {{vendedorNome}}, da YourLab, aqui de {{zona}}.

{{ganchoTitulo}}

{{ganchoTexto}}

Para lhe mostrar do que estou a falar, fiz duas coisas para a {{negocioNome}}, sem lhe pedir nada. São exemplos — não estão publicados.

{{link}}

Gostou? Responda a este email e marcamos uma conversa. Tratamos de tudo — vocês só precisam de estar satisfeitos antes da entrega final.{{fechoPreco}}

{{vendedorNome}}
YourLab, {{zona}}
{{vendedorTelefone}}
{{site}}

Para sair da lista, responda REMOVER.`;

const WA_TEMPLATES_EN = {
    1: `{{saudacao}} {{clienteNome}} — I'm {{vendedorNome}}, from YourLab, here in {{zona}}.{{pontEmailFrase}}

*{{ganchoTitulo}}*{{ganchoTextoWa}}

I put two things together for *{{negocioNome}}*, without asking you for anything. They are examples — they are not published.

{{link}}

If it makes sense, we book five minutes. We do this alongside you — you don't have to spend time thinking about it. We just need to understand what you want. The price is fair and it adjusts to where the business is right now.`,

    2: `{{diagnosticoLinha}}In the email you can see how *{{negocioNome}}* would look when someone searches "{{oQueFaz}} in {{zona}}". And the page that holds the whole story.

{{link}}

Built for this house. And the site is yours, not ours. Each page is made from scratch for the business — it stays in the company's name.
{{blocoPrecosWa}}This is only part of what we do. If you need bookings, client files, stock — say so and we can talk about that too.`,

    3: `{{saudacao}} {{clienteNome}}, it was good to stop by {{visitaQuando}}.

Here is the page I showed you — the whole story in one place that is yours:

{{link}}

Shall we meet {{followupDia}} in the morning? We do this alongside you — you don't have to spend time thinking about it. We just need to understand what you want. The price is fair and it adjusts to where the business is right now.`
};

const EMAIL_SUBJECT_EN = 'an example we made for {{negocioNome}}';

const EMAIL_TEXT_EN = `{{saudacao}} {{clienteNome}} — I'm {{vendedorNome}}, from YourLab, here in {{zona}}.

{{ganchoTitulo}}

{{ganchoTexto}}

To show you what I mean, I put two things together for {{negocioNome}}, without asking you for anything. They are examples — they are not published.

{{link}}

If it makes sense, reply to this email and we book a short meeting. We take care of everything — you just need to be happy with it before final delivery.{{fechoPreco}}

{{vendedorNome}}
YourLab, {{zona}}
{{vendedorTelefone}}
{{site}}

To leave the list, reply REMOVE.`;

/**
 * Closing copy. The example stays saved, we do the work alongside them, and
 * the door stays open. Price is fair and negotiable for this shop's moment —
 * never a frozen number glued to a "no".
 */
const PASSO_TEMPLATES = {
    N1: {
        pt: `Sr. {{clienteNome}}, não sei se viu a mensagem. {{diagnosticoLinha}}Mando só a parte do Google, que é a que costuma surpreender — é assim que a *{{negocioNome}}* aparece a quem a procura no telemóvel.

{{link}}

O exemplo continua guardado, não apago.`,
        en: `{{clienteNome}}, I am not sure you saw my message. {{diagnosticoLinha}}Here is just the Google part, which is usually the surprising one — this is how *{{negocioNome}}* shows up to someone searching on their phone.

{{link}}

The example stays saved on our side; we do not delete it.`
    },
    R1: {
        pt: `{{saudacao}}.

Sem problema nenhum, e obrigado por me responder — já é mais do que muita gente faz.

Fica o exemplo da *{{negocioNome}}* guardado. Se um dia fizer sentido, fazemos ao vosso lado — vocês não têm de gastar tempo nisto. Só percebemos o que querem e o valor ajusta-se ao momento do negócio.

Continuação de bom trabalho.`,
        en: `{{saudacao}}.

No problem at all, and thank you for getting back to me — that is already more than most people do.

The example for *{{negocioNome}}* stays saved. If it ever makes sense, we do this alongside you — you don't have to spend time on it. We just need to understand what you want, and the price adjusts to where the business is at that moment.

All the best with the work.`
    },
    REVISITA: {
        pt: `{{saudacao}} Sr. {{clienteNome}}, é {{vendedorArtigo}} {{vendedorNome}} da YourLab. Falámos em {{mesAnterior}} e ficou combinado eu voltar por esta altura.

O exemplo da *{{negocioNome}}* continua guardado. Fazemos ao vosso lado — vocês não têm de gastar tempo nisto. O valor ajusta-se ao momento do negócio.

Quer que lhe mande outra vez?`,
        en: `{{saudacao}} {{clienteNome}}, this is {{vendedorNome}} from YourLab. We spoke back in {{mesAnterior}} and we agreed I would come back around now.

The example for *{{negocioNome}}* is still saved. We do this alongside you — you don't have to spend time on it. The price adjusts to where the business is right now.

Would you like me to send it again?`
    },
    D4: {
        pt: `Sr. {{clienteNome}},

Fala {{vendedorNome}}, da YourLab, aqui de {{zona}}. Preparámos um exemplo para a {{negocioNome}} — como ficariam no Google e uma página com a vossa história. São exemplos, não estão publicados.

{{link}}

Se fizer sentido, é só responder a este email.

{{vendedorNome}} · YourLab · {{vendedorTelefone}}`,
        en: `{{clienteNome}},

This is {{vendedorNome}} from YourLab, here in {{zona}}. We put together an example for {{negocioNome}} — how you'd look on Google, and a page with your story. These are examples, not published.

{{link}}

If it makes sense, just reply to this email.

{{vendedorNome}} · YourLab · {{vendedorTelefone}}`
    }
};

const EMAIL2_SUBJECT = 'fica só o registo — {{negocioNome}}';
const EMAIL2_SUBJECT_EN = 'just for the record — {{negocioNome}}';

const EMAIL2_TEXT = `Sr. {{clienteNome}},

{{diagnosticoLinha}}Não o incomodo mais com isto.

Fica só o registo: o exemplo da {{negocioNome}} continua guardado do nosso lado, não apagamos. Se um dia for altura, é só responder a este email e retomamos onde ficámos — pelo mesmo valor.

Fico à disposição.

{{vendedorNome}}
YourLab, {{zona}}
{{vendedorTelefone}}
{{site}}

Para sair da lista, responda REMOVER.`;

const EMAIL2_TEXT_EN = `{{clienteNome}},

{{diagnosticoLinha}}I won't take up more of your time on this.

Just for the record: the example for {{negocioNome}} is still saved on our side — we don't delete it. If the timing ever works, just reply to this email and we pick up where we left off, at the same price.

Always available.

{{vendedorNome}}
YourLab, {{zona}}
{{vendedorTelefone}}
{{site}}

To leave the list, reply REMOVE.`;

function normalizeOutreachLang(value) {
    return String(value || '').trim().toLowerCase() === 'en' ? 'en' : 'pt';
}

function localizeFollowupDia(value, lang) {
    const raw = String(value || '').trim();
    const en = normalizeOutreachLang(lang) === 'en';
    if (en && (!raw || raw === 'amanhã')) return 'tomorrow';
    if (!en && (!raw || raw === 'tomorrow')) return 'amanhã';
    return raw;
}

function visitaQuandoFor(key, lang) {
    const tarde = String(key || '') === 'tarde';
    if (normalizeOutreachLang(lang) === 'en') return tarde ? 'this afternoon' : 'this morning';
    return tarde ? 'esta tarde' : 'hoje de manhã';
}

function loadEmailTemplate(lang) {
    const file = normalizeOutreachLang(lang) === 'en' ? EMAIL_TEMPLATE_PATH_EN : EMAIL_TEMPLATE_PATH;
    return fs.readFileSync(file, 'utf8');
}

function loadNoticeTemplate() {
    return fs.readFileSync(NOTICE_TEMPLATE_PATH, 'utf8');
}

function formatSellerPhone(raw) {
    const digits = String(raw || DEFAULT_VENDEDOR_TELEFONE).replace(/\D/g, '');
    const national = digits.startsWith('351') ? digits.slice(3) : digits;
    if (national.length === 9) {
        return {
            display: `+351 ${national.slice(0, 3)} ${national.slice(3, 6)} ${national.slice(6)}`,
            tel: `+351${national}`
        };
    }
    const fallback = String(raw || DEFAULT_VENDEDOR_TELEFONE).trim();
    return { display: fallback, tel: fallback.replace(/\s/g, '') };
}

function unsubResultadoFor(current) {
    return String(current || '').trim() === 'digitalizado' ? 'digitalizado' : 'sem_interesse';
}

function renderBrandedNoticeHtml(ctx, templateHtml) {
    return fillHtmlTemplate(templateHtml || loadNoticeTemplate(), ctx);
}

function greetingForHour(hour, lang) {
    const en = normalizeOutreachLang(lang) === 'en';
    if (Number(hour) < 13) return en ? 'Good morning' : 'Bom dia';
    return en ? 'Good afternoon' : 'Boa tarde';
}

function defaultVisitaQuando(hour, lang) {
    return visitaQuandoFor(Number(hour) < 14 ? 'manha' : 'tarde', lang);
}

function escapeHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function fillTemplate(template, ctx) {
    return String(template || '').replace(/\{\{(\w+)\}\}/g, (_, key) => (
        ctx[key] != null ? String(ctx[key]) : ''
    ));
}

function applyOptionalBlocks(html, ctx) {
    return String(html || '')
        .replace(/<!--IF_IMAGEM_GOOGLE-->([\s\S]*?)<!--\/IF_IMAGEM_GOOGLE-->/g, ctx.imagemGoogle ? '$1' : '')
        .replace(/<!--IF_IMAGEM_SITE-->([\s\S]*?)<!--\/IF_IMAGEM_SITE-->/g, ctx.imagemSite ? '$1' : '')
        .replace(/<!--IF_CAMPANHA-->([\s\S]*?)<!--\/IF_CAMPANHA-->/g, ctx.showCampanha ? '$1' : '')
        .replace(/<!--IF_PRECOS-->([\s\S]*?)<!--\/IF_PRECOS-->/g, ctx.showPrecos ? '$1' : '')
        .replace(/<!--IF_PRECO_ANTIGO-->([\s\S]*?)<!--\/IF_PRECO_ANTIGO-->/g, ctx.showPrecoAntigo ? '$1' : '')
        .replace(/<!--IF_MENSAGEM_EDITADA-->([\s\S]*?)<!--\/IF_MENSAGEM_EDITADA-->/g, ctx.showMensagemEditada ? '$1' : '')
        .replace(/<!--IF_MENSAGEM_PADRAO-->([\s\S]*?)<!--\/IF_MENSAGEM_PADRAO-->/g, ctx.showMensagemEditada ? '' : '$1');
}

const HTML_RAW_KEYS = new Set(['negocioNomeMailto', 'ctaBodyMailto', 'emailMensagemHtml']);

function fillHtmlTemplate(template, ctx) {
    const escaped = {};
    Object.keys(ctx || {}).forEach((key) => {
        escaped[key] = HTML_RAW_KEYS.has(key)
            ? String(ctx[key] == null ? '' : ctx[key])
            : escapeHtml(ctx[key]);
    });
    return fillTemplate(applyOptionalBlocks(template, ctx), escaped);
}

function stripSite(value) {
    return String(value || 'yourlabpt.com').trim().replace(/^https?:\/\//i, '').replace(/\/$/, '');
}

function absoluteUrl(origin, demoUrl) {
    const raw = String(demoUrl || '').trim();
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw)) return raw;
    const base = String(origin || '').replace(/\/$/, '');
    return `${base}${raw.startsWith('/') ? raw : `/${raw}`}`;
}

function googleSearchUrl(nome, oQueFaz, zona, morada) {
    const query = [nome, oQueFaz, morada, zona].filter(Boolean).join(' ');
    if (!query) return 'https://www.google.com/maps';
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function parseJsonSafe(raw, fallback) {
    try {
        const parsed = JSON.parse(raw || '');
        return parsed && typeof parsed === 'object' ? parsed : fallback;
    } catch (_) {
        return fallback;
    }
}

const STREET_PRICES = { tudo: 490, pagina: 190, google: 90 };
const CAMPANHA_PRESETS = [5, 10, 15, 20];

function clampCampanhaPct(value) {
    const n = Math.round(Number(value) || 0);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(100, n));
}

// Cold leads carry no amounts: a number without context always reads as expensive.
// Prices only appear once the seller turns them on, or once there is a signal.
function normalizeOffer(raw = {}) {
    return {
        includePrices: raw.includePrices === true,
        campanhaPct: clampCampanhaPct(raw.campanhaPct),
        campanhaShowPrices: raw.campanhaShowPrices !== false
    };
}

function showPriceBlock(offer) {
    const o = normalizeOffer(offer);
    return o.includePrices || (o.campanhaPct > 0 && o.campanhaShowPrices);
}

function showCampaignBlock(offer) {
    return normalizeOffer(offer).campanhaPct > 0;
}

function pricesAreDiscounted(offer) {
    const o = normalizeOffer(offer);
    return o.campanhaPct > 0 && o.campanhaShowPrices && showPriceBlock(o);
}

function euroOf(list, pct) {
    if (!pct) return list;
    return Math.round(list * (100 - pct) / 100);
}

function offerPrices(offer) {
    const o = normalizeOffer(offer);
    const pct = pricesAreDiscounted(o) ? o.campanhaPct : 0;
    return {
        tudo: euroOf(STREET_PRICES.tudo, pct),
        pagina: euroOf(STREET_PRICES.pagina, pct),
        google: euroOf(STREET_PRICES.google, pct),
        tudoLista: STREET_PRICES.tudo,
        paginaLista: STREET_PRICES.pagina,
        googleLista: STREET_PRICES.google
    };
}

function offerCopy(offer, lang = 'pt') {
    const o = normalizeOffer(offer);
    const p = offerPrices(o);
    const en = normalizeOutreachLang(lang) === 'en';
    const showPrecos = showPriceBlock(o);
    const showCampanha = showCampaignBlock(o);
    const showPrecoAntigo = pricesAreDiscounted(o);

    let campanhaTitulo = '';
    let campanhaLinha = '';
    if (showCampanha) {
        campanhaTitulo = en ? 'Campaign' : 'Campanha';
        if (showPrecoAntigo) {
            campanhaLinha = en
                ? `${o.campanhaPct}% off — the amounts below already include this discount.`
                : `${o.campanhaPct}% de desconto — os valores em baixo já incluem esta campanha.`;
        } else if (showPrecos) {
            campanhaLinha = en
                ? `${o.campanhaPct}% off on this conversation. The amounts below are the list prices.`
                : `${o.campanhaPct}% de desconto nesta conversa. Os valores em baixo são de tabela.`;
        } else {
            campanhaLinha = en
                ? `${o.campanhaPct}% off on this conversation. We talk numbers when we meet.`
                : `${o.campanhaPct}% de desconto nesta conversa. Falamos dos valores na reunião.`;
        }
    }

    let precoNota = '';
    if (showPrecos) {
        if (showPrecoAntigo) {
            precoNota = en
                ? `VAT not included. Campaign prices. If you start with ${p.google} € or ${p.pagina} €, that amount comes off if you later want everything.`
                : `Sem IVA. Valores da campanha. Se começar pelos ${p.google} € ou ${p.pagina} €, o valor é descontado se depois quiser tudo.`;
        } else {
            precoNota = en
                ? `VAT not included. If you start with ${p.google} € or ${p.pagina} €, that amount comes off if you later want everything.`
                : `Sem IVA. Se começar pelos ${p.google} € ou ${p.pagina} €, o valor é descontado se depois quiser tudo.`;
        }
    }

    const waLines = [];
    if (showCampanha) {
        waLines.push(en
            ? `*Campaign: ${o.campanhaPct}% off*`
            : `*Campanha: ${o.campanhaPct}% de desconto*`);
    }
    if (showPrecos) {
        if (en) {
            waLines.push(`*${p.tudo} euros* - everything handled and live in 3 days`);
            waLines.push(`*${p.pagina} euros* - just the page, for you to put live`);
            waLines.push(`*${p.google} euros* - just the Google part`);
            waLines.push(precoNota.replace(/ €/g, ' euros'));
        } else {
            waLines.push(`*${p.tudo} euros* - tudo tratado e no ar em 3 dias`);
            waLines.push(`*${p.pagina} euros* - só a página, para pôr no ar por si`);
            waLines.push(`*${p.google} euros* - só a parte do Google`);
            waLines.push(precoNota.replace(/ €/g, ' euros'));
        }
    }
    const blocoPrecosWa = waLines.length ? `\n\n${waLines.join('\n')}\n` : '\n\n';

    let fechoPreco = '';
    if (showCampanha && !showPrecos) {
        fechoPreco = en
            ? ` Campaign: ${o.campanhaPct}% off.`
            : ` Campanha de ${o.campanhaPct}%.`;
    } else if (showPrecos) {
        const campanhaBit = showCampanha
            ? (en ? ` Campaign ${o.campanhaPct}%.` : ` Campanha de ${o.campanhaPct}%.`)
            : '';
        fechoPreco = en
            ? `${campanhaBit} ${p.tudo} euros everything / ${p.pagina} just the page / ${p.google} just Google, VAT not included.`
            : `${campanhaBit} ${p.tudo} euros tudo / ${p.pagina} só a página / ${p.google} só o Google, sem IVA.`;
    }

    return {
        ...o,
        showPrecos,
        showCampanha,
        showPrecoAntigo,
        precoTudo: p.tudo,
        precoPagina: p.pagina,
        precoGoogle: p.google,
        precoTudoLista: p.tudoLista,
        precoPaginaLista: p.paginaLista,
        precoGoogleLista: p.googleLista,
        campanhaTitulo,
        campanhaLinha,
        precoNota,
        blocoPrecosWa,
        fechoPreco
    };
}

function emptyFollowup() {
    return {
        waStep: 0,
        wa1SentAt: '',
        wa2SentAt: '',
        wa3SentAt: '',
        replied1At: '',
        replied2At: '',
        emailSentAt: '',
        callDueAt: '',
        callDoneAt: '',
        callNotifiedAt: '',
        unsubscribed: false,
        unsubToken: '',
        ganchoId: '',
        falhas: [],
        sinaisDeMovimento: false,
        fichaComErro: false,
        siteVelho: false,
        problemaFicha: '',
        lang: 'pt',
        includePrices: false,
        campanhaPct: 0,
        campanhaShowPrices: true,
        edits: {}
    };
}

function parseFollowup(raw) {
    const parsed = typeof raw === 'string' ? parseJsonSafe(raw, {}) : (raw || {});
    const base = emptyFollowup();
    const merged = {
        ...base,
        ...parsed,
        waStep: Math.min(3, Math.max(0, Number(parsed.waStep) || 0)),
        unsubscribed: parsed.unsubscribed === true,
        ganchoId: '',
        falhas: normalizeFalhas(parsed.falhas),
        sinaisDeMovimento: parsed.sinaisDeMovimento === true,
        fichaComErro: parsed.fichaComErro === true,
        siteVelho: parsed.siteVelho === true,
        problemaFicha: String(parsed.problemaFicha || '').trim(),
        lang: normalizeOutreachLang(parsed.lang),
        edits: parsed.edits && typeof parsed.edits === 'object' ? parsed.edits : {}
    };
    const offer = normalizeOffer(merged);
    merged.includePrices = offer.includePrices;
    merged.campanhaPct = offer.campanhaPct;
    merged.campanhaShowPrices = offer.campanhaShowPrices;
    if (!merged.falhas.length) merged.falhas = migrateGanchoToFalhas(parsed.ganchoId);
    merged.ganchoId = merged.falhas[0] || '';
    return merged;
}

function loadGanchos() {
    if (!ganchosCache) {
        ganchosCache = JSON.parse(fs.readFileSync(GANCHOS_PATH, 'utf8'));
    }
    return ganchosCache;
}

function loadFalhasCatalog() {
    if (!falhasCache) {
        falhasCache = JSON.parse(fs.readFileSync(FALHAS_PATH, 'utf8'));
    }
    return falhasCache;
}

function falhaIds() {
    return loadFalhasCatalog().ordem.slice();
}

function normalizeFalhaId(id) {
    const raw = String(id || '').trim();
    if (!raw) return '';
    if (falhaIds().includes(raw)) return raw;
    const mapped = GANCHO_TO_FALHAS[raw.toUpperCase()];
    return mapped ? mapped[0] : '';
}

function normalizeFalhas(raw) {
    const list = Array.isArray(raw) ? raw : (raw ? [raw] : []);
    const seen = new Set();
    const out = [];
    list.forEach((id) => {
        const n = normalizeFalhaId(id);
        if (!n || seen.has(n)) return;
        seen.add(n);
        out.push(n);
    });
    return out;
}

function migrateGanchoToFalhas(ganchoId) {
    const letter = String(ganchoId || '').trim().toUpperCase();
    if (GANCHO_TO_FALHAS[letter]) return GANCHO_TO_FALHAS[letter].slice();
    const falha = normalizeFalhaId(ganchoId);
    return falha ? [falha] : [];
}

function normalizeGanchoId(id) {
    return normalizeFalhaId(id);
}

function filledGanchoField(value) {
    const v = String(value || '').trim();
    return Boolean(v) && v !== '-' && v !== '—';
}

function hasWebsite(sinais) {
    const tokens = [
        String((sinais && sinais.website) || '').trim().toLowerCase(),
        String((sinais && sinais.website_atual) || '').trim().toLowerCase()
    ].filter(Boolean);
    if (!tokens.length) return false;
    return tokens.some((w) => w !== 'nao' && w !== 'não' && w !== 'no');
}

function siteIsOld(sinais) {
    if (sinais && sinais.siteVelho === true) return true;
    const w = String((sinais && sinais.website) || '').trim().toLowerCase();
    return w === 'sim_fraco';
}

function hasSocial(sinais) {
    return filledGanchoField(sinais && sinais.instagram) || filledGanchoField(sinais && sinais.facebook);
}

function falhasParaCopy(ids) {
    let list = ids.slice();
    if (list.includes('maps_telefone_sem_wa')) {
        list = list.filter((id) => id !== 'maps_sem_whatsapp');
    }
    if (list.length > 1) list = list.filter((id) => id !== 'sem_nada');
    const ordem = loadFalhasCatalog().ordem;
    const max = Number(loadFalhasCatalog().maxFactos) || 3;
    return ordem.filter((id) => list.includes(id)).slice(0, max);
}

function fraseFalha(id, lang, problemaFicha) {
    const item = loadFalhasCatalog().falhas[id];
    if (!item) return '';
    const pack = normalizeOutreachLang(lang) === 'en' && item.en ? item.en : item;
    return fillTemplate(pack.frase || '', { problemaFicha: problemaFicha || '' }).trim();
}

function nomeCurtoFalha(id) {
    const item = loadFalhasCatalog().falhas[id];
    return (item && item.chip) || id;
}

function ganchoNomeCurtoMap() {
    const o = {};
    falhaIds().forEach((id) => { o[id] = nomeCurtoFalha(id); });
    return o;
}

const GANCHO_NOME_CURTO = new Proxy({}, {
    get: (_t, prop) => (typeof prop === 'string' ? nomeCurtoFalha(prop) : undefined),
    ownKeys: () => falhaIds(),
    getOwnPropertyDescriptor: (_t, prop) => (
        falhaIds().includes(String(prop))
            ? { configurable: true, enumerable: true, value: nomeCurtoFalha(prop) }
            : undefined
    )
});

function suggestFalhas(sinais = {}) {
    const out = [];
    const phone = filledGanchoField(sinais.telefone);
    const wa = filledGanchoField(sinais.whatsapp) || sinais.temWhatsapp === true;
    if (phone && !wa) out.push('maps_telefone_sem_wa');
    else if (!wa) out.push('maps_sem_whatsapp');
    if (!hasWebsite(sinais)) out.push('maps_sem_site');
    else if (siteIsOld(sinais)) out.push('site_fraco');
    if (!filledGanchoField(sinais.email)) out.push('maps_sem_email');
    if (hasSocial(sinais)) {
        out.push('redes_desligadas_maps');
        if (!filledGanchoField(sinais.morada)) out.push('redes_sem_morada');
    }
    if (sinais.fichaComErro === true && filledGanchoField(sinais.problemaFicha)) {
        out.push('ficha_errada');
    }
    if (!out.length) out.push('sem_nada');
    return normalizeFalhas(out);
}

function composeAbertura({ falhas, override, sinais = {}, lang = 'pt' } = {}) {
    const catalog = loadFalhasCatalog();
    const outreachLang = normalizeOutreachLang(lang);
    let ids = normalizeFalhas(falhas);
    if (!ids.length && override) ids = migrateGanchoToFalhas(override);
    if (!ids.length) ids = suggestFalhas(sinais);
    const copyIds = falhasParaCopy(ids);
    const onlySemNada = copyIds.length === 1 && copyIds[0] === 'sem_nada';
    const titulos = onlySemNada ? catalog.tituloSemNada : catalog.tituloMaps;
    const ganchoTitulo = titulos[outreachLang] || titulos.pt;
    const problemaFicha = String(sinais.problemaFicha || '').trim();
    const factos = copyIds
        .map((id) => {
            if (id === 'ficha_errada' && !filledGanchoField(problemaFicha)) return '';
            return fraseFalha(id, outreachLang, problemaFicha);
        })
        .filter(Boolean);
    const fecho = (catalog.fecho && (catalog.fecho[outreachLang] || catalog.fecho.pt)) || '';
    const ganchoTexto = [...factos, fecho].filter(Boolean).join('\n\n');
    const diagnosticoResumo = factos.join(' ');
    return {
        id: ids[0] || 'sem_nada',
        falhas: ids,
        sugeridas: suggestFalhas(sinais),
        nome: nomeCurtoFalha(ids[0] || 'sem_nada'),
        nomeCurto: nomeCurtoFalha(ids[0] || 'sem_nada'),
        ganchoTitulo,
        ganchoTexto,
        diagnosticoResumo,
        factos
    };
}

function pickGancho({ override, falhas, sinais = {}, lang = 'pt' } = {}) {
    return composeAbertura({ falhas, override, sinais, lang });
}

function listGanchos() {
    return listFalhas();
}

function listFalhas() {
    const catalog = loadFalhasCatalog();
    return falhaIds().map((id) => {
        const item = catalog.falhas[id];
        return {
            id,
            nome: item.chip,
            nomeCurto: item.chip,
            ganchoTitulo: item.frase,
            ganchoTexto: item.frase
        };
    });
}

function applyGanchoFields(followup, patch = {}) {
    const f = parseFollowup(followup);
    if (patch.lang != null) f.lang = normalizeOutreachLang(patch.lang);
    if (patch.falhas != null) {
        f.falhas = normalizeFalhas(patch.falhas);
        f.ganchoId = f.falhas[0] || '';
    } else if (patch.ganchoId != null) {
        const mapped = migrateGanchoToFalhas(patch.ganchoId);
        if (mapped.length) {
            f.falhas = mapped;
            f.ganchoId = mapped[0];
        }
    }
    if (patch.sinaisDeMovimento != null) f.sinaisDeMovimento = patch.sinaisDeMovimento === true;
    if (patch.fichaComErro != null) f.fichaComErro = patch.fichaComErro === true;
    if (patch.siteVelho != null) f.siteVelho = patch.siteVelho === true;
    if (patch.problemaFicha != null) f.problemaFicha = String(patch.problemaFicha || '').trim();
    if (f.falhas.includes('ficha_errada') && filledGanchoField(f.problemaFicha)) {
        f.fichaComErro = true;
    }
    return applyOfferFields(f, patch);
}

function aberturaEmFalta(passo, followup) {
    const key = String(passo || '').trim().toUpperCase();
    if (key !== 'EMAIL1' && key !== 'WA1') return '';
    const f = parseFollowup(followup);
    if (normalizeFalhas(f.falhas).length) return '';
    return 'Marca em cima o que vamos resolver.';
}

function applyOfferFields(followup, patch = {}) {
    const f = parseFollowup(followup);
    const next = normalizeOffer({
        includePrices: patch.includePrices != null ? patch.includePrices : f.includePrices,
        campanhaPct: patch.campanhaPct != null ? patch.campanhaPct : f.campanhaPct,
        campanhaShowPrices: patch.campanhaShowPrices != null ? patch.campanhaShowPrices : f.campanhaShowPrices
    });
    f.includePrices = next.includePrices;
    f.campanhaPct = next.campanhaPct;
    f.campanhaShowPrices = next.campanhaShowPrices;
    return f;
}

function sinaisFromLead({ dados = {}, diag = {}, presence = {}, followup = {}, processo = {} } = {}) {
    return {
        website: diag.website || dados.website || '',
        website_atual: dados.website_atual || presence.website || '',
        instagram: dados.instagram || presence.instagram || '',
        facebook: dados.facebook || presence.facebook || '',
        telefone: dados.telefone || '',
        whatsapp: dados.whatsapp || '',
        email: dados.email || dados.mail || dados.legalEmail || '',
        morada: dados.morada || '',
        temWhatsapp: processo.temWhatsapp === true,
        sinaisDeMovimento: followup.sinaisDeMovimento === true,
        fichaComErro: followup.fichaComErro === true,
        siteVelho: followup.siteVelho === true,
        problemaFicha: String(followup.problemaFicha || dados.problemaFicha || '').trim()
    };
}

function shortGanchoTexto(texto) {
    const t = String(texto || '').trim();
    if (!t) return '';
    return t.length <= 480 ? t : '';
}

function nextSendableWaStep(followup) {
    const f = parseFollowup(followup);
    if (f.waStep <= 0) return 1;
    if (f.waStep === 1 && f.replied1At) return 2;
    if (f.waStep === 2 && f.replied2At) return 3;
    return 0;
}

function canMarkReply(followup, step) {
    const f = parseFollowup(followup);
    const n = Number(step);
    if (n === 1) return f.waStep >= 1 && !f.replied1At;
    if (n === 2) return f.waStep >= 2 && !f.replied2At;
    return false;
}

function lisbonParts(date, types) {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Lisbon',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        weekday: 'short',
        hour12: false
    }).formatToParts(date);
    const get = (type) => {
        const hit = parts.find((p) => p.type === type);
        return hit ? hit.value : '';
    };
    const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return {
        y: Number(get('year')),
        m: Number(get('month')),
        d: Number(get('day')),
        hour: Number(get('hour')),
        minute: Number(get('minute')),
        weekday: weekdayMap[get('weekday')]
    };
}

function isoAtLisbon(y, m, d, hour, minute) {
    let utc = Date.UTC(y, m - 1, d, hour, minute, 0);
    for (let i = 0; i < 12; i++) {
        const p = lisbonParts(new Date(utc));
        const got = Date.UTC(p.y, p.m - 1, p.d, p.hour, p.minute);
        const want = Date.UTC(y, m - 1, d, hour, minute);
        const delta = want - got;
        if (delta === 0) break;
        utc += delta;
    }
    return new Date(utc).toISOString();
}

/** Two weekdays later, 10:00 Lisbon — skip Saturday/Sunday so shops are open. */
function nextConfirmCallAt(fromIso, days = 2) {
    const from = new Date(fromIso || Date.now());
    const start = lisbonParts(from);
    const noon = Date.UTC(start.y, start.m - 1, start.d + Number(days), 12, 0, 0);
    let target = lisbonParts(new Date(noon));
    if (target.weekday === 6) {
        target = lisbonParts(new Date(Date.UTC(target.y, target.m - 1, target.d + 2, 12, 0, 0)));
    } else if (target.weekday === 0) {
        target = lisbonParts(new Date(Date.UTC(target.y, target.m - 1, target.d + 1, 12, 0, 0)));
    }
    return isoAtLisbon(target.y, target.m, target.d, 10, 0);
}

function scheduleConfirmCall(followup, fromIso) {
    const f = parseFollowup(followup);
    if (f.callDoneAt || f.callDueAt) return f;
    f.callDueAt = nextConfirmCallAt(fromIso);
    f.callNotifiedAt = '';
    return f;
}

function confirmCallState(followup, now = new Date()) {
    const f = parseFollowup(followup);
    if (f.callDoneAt) {
        return { status: 'done', dueAt: f.callDueAt, remainingMs: 0 };
    }
    if (!f.callDueAt) {
        return { status: 'none', dueAt: '', remainingMs: 0 };
    }
    const remainingMs = new Date(f.callDueAt).getTime() - now.getTime();
    if (remainingMs <= 0) {
        return { status: 'due', dueAt: f.callDueAt, remainingMs: 0 };
    }
    return { status: 'waiting', dueAt: f.callDueAt, remainingMs };
}

function formatCountdown(ms) {
    const total = Math.max(0, Math.floor(Number(ms) || 0));
    const s = Math.floor(total / 1000);
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (d > 0) return `${d}d ${h}h ${String(m).padStart(2, '0')}m`;
    if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
    return `${m}m ${String(sec).padStart(2, '0')}s`;
}

function splitProviderMorada(morada) {
    const parsed = parsePortugueseAddress(morada || '', '');
    return {
        street: parsed.street && parsed.housenumber
            ? `${parsed.street} ${parsed.housenumber}`
            : (parsed.street || String(morada || '').trim()),
        cp: parsed.postalcode || '',
        city: parsed.city || ''
    };
}

function pickEmail(dados, legalEmail) {
    return String(
        (dados && (dados.email || dados.mail))
        || legalEmail
        || ''
    ).trim();
}

function pickOQueFaz(dados, businessTypeNome, lang) {
    const fallback = normalizeOutreachLang(lang) === 'en' ? 'local business' : 'negócio local';
    return String(
        (dados && (dados.o_que_faz || dados.principais_servicos || dados.categoria))
        || businessTypeNome
        || fallback
    ).trim();
}

function buildOutreachContext({
    dados = {},
    provider = {},
    origin = 'https://yourlabpt.com',
    demoUrl = '',
    demoSlug = '',
    followupDia = 'amanhã',
    visitaQuando = '',
    visita = '',
    unsubToken = '',
    hour = new Date().getHours(),
    businessTypeNome = '',
    lat = null,
    lng = null,
    ganchoId = '',
    falhas = [],
    sinais = {},
    lang = 'pt',
    offer = {}
} = {}) {
    const outreachLang = normalizeOutreachLang(lang);
    const en = outreachLang === 'en';
    const site = stripSite(provider.site);
    const link = absoluteUrl(origin, demoUrl || (demoSlug ? `/d/${demoSlug}` : ''));
    const demoPath = demoSlug
        ? `${site}/d/${demoSlug}`
        : (link.replace(/^https?:\/\//i, '') || `${site}/d/…`);
    const zona = String(dados.cidade || dados.zona || '').trim() || 'Portugal';
    const negocioNome = String(dados.nome_negocio || (en ? 'your business' : 'o seu negócio')).trim()
        || (en ? 'your business' : 'o seu negócio');
    const oQueFaz = pickOQueFaz(dados, businessTypeNome, outreachLang);
    const morada = String(dados.morada || '').trim();
    const parsedProvider = splitProviderMorada(provider.morada || '');
    const empresaCp = String(provider.cp || parsedProvider.cp || '').trim();
    const empresaLocalidade = String(provider.localidade || parsedProvider.city || '').trim();
    const empresaMorada = String(parsedProvider.street || provider.morada || '').trim();
    const empresaMoradaLinha = [empresaMorada, empresaCp, empresaLocalidade].filter(Boolean).join(', ') || '—';
    const phone = formatSellerPhone(provider.telefone || provider.mbway);
    const vendedorTelefone = phone.display;
    const vendedorTelefoneTel = phone.tel;
    const vendedorEmail = String(provider.email || '').trim() || 'yourlabpt@gmail.com';
    const ctaBody = en ? 'I liked what I saw. Can we book a short meeting?' : 'Gostei do que vi. Podemos marcar uma conversa?';
    const problemaFicha = String(sinais.problemaFicha || dados.problemaFicha || '').trim();
    const picked = composeAbertura({
        falhas,
        override: ganchoId,
        sinais: { ...sinais, problemaFicha },
        lang: outreachLang
    });
    let visitaKey = Number(hour) < 14 ? 'manha' : 'tarde';
    if (visita === 'tarde' || visita === 'manha') visitaKey = visita;
    else if (visitaQuando) visitaKey = /tarde|afternoon/i.test(String(visitaQuando)) ? 'tarde' : 'manha';

    const ctx = {
        lang: outreachLang,
        saudacao: greetingForHour(hour, outreachLang),
        clienteNome: String(dados.responsavel || (en ? 'there' : 'Cliente')).trim()
            || (en ? 'there' : 'Cliente'),
        negocioNome,
        negocioNomeMailto: encodeURIComponent(negocioNome),
        ctaBodyMailto: encodeURIComponent(ctaBody),
        vendedorNome: String(provider.responsavel || provider.nome || 'YourLab').trim(),
        vendedorArtigo: String(provider.artigo || '').trim() === 'a' ? 'a' : 'o',
        vendedorEmail,
        vendedorTelefone,
        vendedorTelefoneTel,
        site,
        visitaQuando: visitaQuandoFor(visitaKey, outreachLang),
        followupDia: localizeFollowupDia(followupDia || (en ? 'tomorrow' : 'amanhã'), outreachLang),
        link,
        demoPath,
        zona,
        oQueFaz,
        horario: String(dados.horario || (en ? 'Hours to confirm' : 'Horário a confirmar')).trim()
            || (en ? 'Hours to confirm' : 'Horário a confirmar'),
        telefone: String(dados.telefone || dados.whatsapp || '').trim(),
        moradaLinha: [morada, zona].filter(Boolean).join(', ')
            || (en ? 'Address to confirm' : 'Morada a confirmar'),
        categoriaFicha: zona ? `${oQueFaz} · ${zona}` : oQueFaz,
        inicial: (negocioNome.replace(/^o seu /i, '').charAt(0) || 'G').toUpperCase(),
        linkGoogle: '',
        imagemGoogle: '',
        imagemSite: '',
        empresaNome: String(provider.nome || 'YourLab').trim() || 'YourLab',
        empresaNif: String(provider.nif || '—').trim() || '—',
        empresaMorada,
        empresaCp,
        empresaLocalidade,
        empresaMoradaLinha,
        linkRemover: unsubToken
            ? `${String(origin).replace(/\/$/, '')}/api/digitalizept/unsub?t=${encodeURIComponent(unsubToken)}`
            : `${String(origin).replace(/\/$/, '')}/api/digitalizept/unsub`,
        clienteEmail: pickEmail(dados, dados.legalEmail),
        clienteWhatsApp: String(dados.whatsapp || dados.telefone || '').trim(),
        problemaFicha,
        ganchoId: picked.id,
        falhas: picked.falhas,
        diagnosticoResumo: picked.diagnosticoResumo || '',
        diagnosticoLinha: '',
        ganchoTitulo: '',
        ganchoTexto: '',
        ganchoTextoCurto: '',
        ganchoTextoWa: '',
        showPrecos: false,
        showCampanha: false,
        showPrecoAntigo: false,
        precoTudo: STREET_PRICES.tudo,
        precoPagina: STREET_PRICES.pagina,
        precoGoogle: STREET_PRICES.google,
        precoTudoLista: STREET_PRICES.tudo,
        precoPaginaLista: STREET_PRICES.pagina,
        precoGoogleLista: STREET_PRICES.google,
        campanhaTitulo: '',
        campanhaLinha: '',
        precoNota: '',
        blocoPrecosWa: '\n\n',
        fechoPreco: '',
        pontEmail: '',
        pontEmailFrase: '',
        quandoEmail: '',
        ofertaFinal: '',
        precoCongelado: '',
        mesRevisita: '',
        mesAnterior: ''
    };
    Object.assign(ctx, offerCopy(offer, outreachLang));
    ctx.ganchoTitulo = fillTemplate(picked.ganchoTitulo, ctx);
    ctx.ganchoTexto = fillTemplate(picked.ganchoTexto, ctx);
    ctx.diagnosticoResumo = fillTemplate(picked.diagnosticoResumo || '', ctx);
    ctx.diagnosticoLinha = ctx.diagnosticoResumo ? `${ctx.diagnosticoResumo}\n\n` : '';
    ctx.ganchoTextoCurto = shortGanchoTexto(ctx.ganchoTexto)
        || shortGanchoTexto((picked.factos || []).join('\n\n'));
    ctx.ganchoTextoWa = ctx.ganchoTextoCurto ? `\n\n${ctx.ganchoTextoCurto}` : '';
    return ctx;
}

function waTextForStep(step, ctx, edits = {}) {
    const n = Number(step);
    const key = `wa${n}`;
    const pack = normalizeOutreachLang(ctx && ctx.lang) === 'en' ? WA_TEMPLATES_EN : WA_TEMPLATES;
    const tpl = (edits[key] && String(edits[key]).includes('{{'))
        ? edits[key]
        : (pack[n] || pack[1]);
    if (edits[key] && !String(edits[key]).includes('{{')) return String(edits[key]);
    return fillTemplate(tpl, ctx);
}

function emailSubjectFor(ctx, edits = {}) {
    if (edits.emailSubject && !String(edits.emailSubject).includes('{{')) {
        return String(edits.emailSubject);
    }
    const pack = normalizeOutreachLang(ctx && ctx.lang) === 'en' ? EMAIL_SUBJECT_EN : EMAIL_SUBJECT;
    const tpl = edits.emailSubject || pack;
    return fillTemplate(tpl, ctx);
}

function renderEmailHtml(ctx, templateHtml) {
    const lang = ctx && ctx.lang;
    return fillHtmlTemplate(templateHtml || loadEmailTemplate(lang), ctx);
}

function normalizePlain(s) {
    return String(s || '').replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n').trim();
}

const EMAIL_A_STYLE = 'color:#1C1C1C; text-decoration:underline;';

/** Plain Controlo text → paragraphs that sit inside the HTML email template. */
function emailBodyHtml(text) {
    const esc = escapeHtml(String(text || '').replace(/\r\n/g, '\n'));
    const withLinks = esc.replace(/(https?:\/\/[^\s<]+)/g, `<a href="$1" style="${EMAIL_A_STYLE}">$1</a>`);
    return withLinks.split(/\n{2,}/).filter(Boolean).map((block, i) => {
        const margin = i === 0 ? '0' : '14px 0 0 0';
        return `<p style="margin:${margin}; font-family:Helvetica,Arial,sans-serif; font-size:16px; line-height:28px; color:#3A3A3A;">${
            block.replace(/\n/g, '<br />')
        }</p>`;
    }).join('');
}

/**
 * EMAIL1 always ships the designed HTML template (banner, exemplo, botões).
 * Controlo edits the letter; the template wraps it. Email 2 / D4 stay plain.
 */
function outgoingEmail(passo, { text, ctx, edits } = {}) {
    const key = String(passo || '').trim().toUpperCase();
    const canned = textForPasso(key, ctx, {});
    const defaultText = textForPasso(key, ctx, edits);
    const body = (text != null && String(text).trim() !== '') ? String(text) : defaultText;
    const edited = normalizePlain(body) !== normalizePlain(canned);
    let html = '';
    if (key === 'EMAIL1') {
        html = renderEmailHtml({
            ...(ctx || {}),
            showMensagemEditada: edited,
            emailMensagemHtml: edited ? emailBodyHtml(body) : ''
        });
    }
    return { text: body, html, edited };
}

function renderEmailText(ctx) {
    const pack = normalizeOutreachLang(ctx && ctx.lang) === 'en' ? EMAIL_TEXT_EN : EMAIL_TEXT;
    return fillTemplate(pack, ctx);
}

/** Email 2 is plain text on purpose — no HTML, no images, so it reads as written by hand. */
function renderEmail2Text(ctx) {
    const pack = normalizeOutreachLang(ctx && ctx.lang) === 'en' ? EMAIL2_TEXT_EN : EMAIL2_TEXT;
    return fillTemplate(pack, ctx);
}

function email2SubjectFor(ctx) {
    const pack = normalizeOutreachLang(ctx && ctx.lang) === 'en' ? EMAIL2_SUBJECT_EN : EMAIL2_SUBJECT;
    return fillTemplate(pack, ctx);
}

const PASSO_WA_STEP = { WA1: 1, WA2: 2, WA3: 3 };

/** One entry point per step of the guided process. */
function textForPasso(passo, ctx, edits = {}) {
    const key = String(passo || '').trim().toUpperCase();
    if (PASSO_WA_STEP[key]) return waTextForStep(PASSO_WA_STEP[key], ctx, edits);
    const pack = PASSO_TEMPLATES[key];
    if (pack) {
        const lang = normalizeOutreachLang(ctx && ctx.lang);
        const editado = edits[key.toLowerCase()];
        if (editado && !String(editado).includes('{{')) return String(editado);
        return fillTemplate(editado || pack[lang] || pack.pt, ctx);
    }
    if (key === 'EMAIL1') {
        if (edits.email1 && !String(edits.email1).includes('{{')) return String(edits.email1);
        return renderEmailText(ctx);
    }
    if (key === 'EMAIL2' || key === 'D4') return key === 'D4'
        ? fillTemplate(PASSO_TEMPLATES.D4[normalizeOutreachLang(ctx && ctx.lang)] || PASSO_TEMPLATES.D4.pt, ctx)
        : (edits.email2 && !String(edits.email2).includes('{{')
            ? String(edits.email2)
            : renderEmail2Text(ctx));
    return '';
}

function subjectForPasso(passo, ctx, edits = {}) {
    const key = String(passo || '').trim().toUpperCase();
    if (key === 'EMAIL2') return email2SubjectFor(ctx);
    if (key === 'D4') {
        const en = normalizeOutreachLang(ctx && ctx.lang) === 'en';
        return fillTemplate(en ? 'an example for {{negocioNome}}' : 'um exemplo para a {{negocioNome}}', ctx);
    }
    if (key === 'EMAIL1') return emailSubjectFor(ctx, edits);
    return '';
}

function newUnsubToken() {
    return crypto.randomBytes(16).toString('hex');
}

function leadEmailFromRows(obrigatoriosJson, opcionaisJson, legalEmail) {
    const a = parseJsonSafe(obrigatoriosJson, {});
    const b = parseJsonSafe(opcionaisJson, {});
    return pickEmail({ ...a, ...b, legalEmail }, legalEmail);
}

module.exports = {
    WA_TEMPLATES,
    WA_TEMPLATES_EN,
    PASSO_TEMPLATES,
    EMAIL_SUBJECT,
    EMAIL_SUBJECT_EN,
    EMAIL2_SUBJECT,
    EMAIL2_SUBJECT_EN,
    EMAIL2_TEXT,
    EMAIL2_TEXT_EN,
    renderEmail2Text,
    email2SubjectFor,
    textForPasso,
    subjectForPasso,
    EMAIL_TEMPLATE_PATH,
    EMAIL_TEMPLATE_PATH_EN,
    normalizeOutreachLang,
    greetingForHour,
    defaultVisitaQuando,
    fillTemplate,
    fillHtmlTemplate,
    applyOptionalBlocks,
    absoluteUrl,
    googleSearchUrl,
    parseFollowup,
    emptyFollowup,
    nextSendableWaStep,
    canMarkReply,
    nextConfirmCallAt,
    scheduleConfirmCall,
    confirmCallState,
    formatCountdown,
    splitProviderMorada,
    pickEmail,
    pickOQueFaz,
    buildOutreachContext,
    waTextForStep,
    emailSubjectFor,
    renderEmailHtml,
    renderEmailText,
    outgoingEmail,
    loadEmailTemplate,
    loadNoticeTemplate,
    NOTICE_TEMPLATE_PATH,
    DEFAULT_VENDEDOR_TELEFONE,
    formatSellerPhone,
    unsubResultadoFor,
    renderBrandedNoticeHtml,
    newUnsubToken,
    leadEmailFromRows,
    GANCHO_IDS,
    GANCHO_NOME_CURTO,
    ganchoNomeCurtoMap,
    loadGanchos,
    loadFalhasCatalog,
    listGanchos,
    listFalhas,
    pickGancho,
    composeAbertura,
    suggestFalhas,
    normalizeFalhas,
    normalizeGanchoId,
    migrateGanchoToFalhas,
    applyGanchoFields,
    aberturaEmFalta,
    applyOfferFields,
    normalizeOffer,
    offerCopy,
    offerPrices,
    STREET_PRICES,
    CAMPANHA_PRESETS,
    clampCampanhaPct,
    sinaisFromLead,
    shortGanchoTexto
};
