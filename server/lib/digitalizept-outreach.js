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

const GANCHO_IDS = ['A', 'B', 'C', 'D', 'E'];

const GANCHO_NOME_CURTO = {
    A: 'Sem nada',
    B: 'Só redes',
    C: 'Site velho',
    D: 'Cheio de trabalho',
    E: 'Ficha errada'
};

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
    1: `{{saudacao}} Sr. {{clienteNome}} — sou o {{vendedorNome}}, da YourLab, aqui de {{zona}}.

*{{ganchoTitulo}}*{{ganchoTextoWa}}

Fiz duas coisas para a *{{negocioNome}}*, sem lhe pedir nada. São exemplos — não estão publicados.

{{link}}

Gostou? Diga só que sim e falamos. Se não for de interesse, uma palavra e não volto a incomodar.`,

    2: `No email vê como ficaria a *{{negocioNome}}* quando alguém procura "{{oQueFaz}} em {{zona}}". E a página onde cabe a história toda.

{{link}}

Feito à medida. E o site fica vosso, não nosso. Cada página é construída de raiz para a casa — fica em nome da empresa.

*490 euros* - tudo tratado e no ar em 3 dias
*190 euros* - só a página, para pôr no ar por si
*90 euros* - só a parte do Google

Sem IVA. Se começar pelos 90 ou 190 euros, desconta-se do resto.

Isto é só uma parte do que fazemos. Se precisar de marcações, fichas, stocks — diga e falamos também.`,

    3: `{{saudacao}} Sr. {{clienteNome}}, foi um gosto passar por aí {{visitaQuando}}.

Aqui fica a página que lhe mostrei — a história toda num sítio só vosso:

{{link}}

Gostou? Diga só que sim. Se quiser que lhe explique melhor, passo aí {{followupDia}} de manhã — são 10 minutos, sem compromisso.`
};

const EMAIL_SUBJECT = 'Sr. {{clienteNome}}, fiz isto para a {{negocioNome}}';

const EMAIL_TEXT = `{{saudacao}} Sr. {{clienteNome}} — sou o {{vendedorNome}}, da YourLab, aqui de {{zona}}.

{{ganchoTitulo}}

{{ganchoTexto}}

Para lhe mostrar do que estou a falar, fiz duas coisas para a {{negocioNome}}, sem lhe pedir nada. São exemplos — não estão publicados.

{{link}}

Gostou? Responda a este email e falamos. 490 euros tudo / 190 só a página / 90 só o Google, sem IVA. Se não for de interesse, responda REMOVER.

{{vendedorNome}}
YourLab, {{zona}}
{{vendedorTelefone}}
{{site}}`;

const WA_TEMPLATES_EN = {
    1: `{{saudacao}} {{clienteNome}} — I'm {{vendedorNome}}, from YourLab, here in {{zona}}.

*{{ganchoTitulo}}*{{ganchoTextoWa}}

I put two things together for *{{negocioNome}}*, without asking you for anything. They are examples — they are not published.

{{link}}

If you like it, just say yes and we talk. If it is not of interest, one word and I will not bother you again.`,

    2: `In the email you can see how *{{negocioNome}}* would look when someone searches "{{oQueFaz}} in {{zona}}". And the page that holds the whole story.

{{link}}

Built for this house. And the site is yours, not ours. Each page is made from scratch for the business — it stays in the company's name.

*490 euros* - everything handled and live in 3 days
*190 euros* - just the page, for you to put live
*90 euros* - just the Google part

VAT not included. If you start with 90 or 190 euros, it comes off the rest.

This is only part of what we do. If you need bookings, client files, stock — say so and we can talk about that too.`,

    3: `{{saudacao}} {{clienteNome}}, it was good to stop by {{visitaQuando}}.

Here is the page I showed you — the whole story in one place that is yours:

{{link}}

If you like it, just say yes. If you want me to walk you through it, I can come by {{followupDia}} in the morning — 10 minutes, no commitment.`
};

const EMAIL_SUBJECT_EN = '{{clienteNome}}, I made this for {{negocioNome}}';

const EMAIL_TEXT_EN = `{{saudacao}} {{clienteNome}} — I'm {{vendedorNome}}, from YourLab, here in {{zona}}.

{{ganchoTitulo}}

{{ganchoTexto}}

To show you what I mean, I put two things together for {{negocioNome}}, without asking you for anything. They are examples — they are not published.

{{link}}

If you like it, reply to this email and we talk. 490 euros everything / 190 just the page / 90 just Google, VAT not included. If it is not of interest, reply REMOVE.

{{vendedorNome}}
YourLab, {{zona}}
{{vendedorTelefone}}
{{site}}`;

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
        .replace(/<!--IF_IMAGEM_SITE-->([\s\S]*?)<!--\/IF_IMAGEM_SITE-->/g, ctx.imagemSite ? '$1' : '');
}

const HTML_RAW_KEYS = new Set(['negocioNomeMailto', 'ctaBodyMailto']);

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
        sinaisDeMovimento: false,
        fichaComErro: false,
        siteVelho: false,
        problemaFicha: '',
        lang: 'pt',
        edits: {}
    };
}

function parseFollowup(raw) {
    const parsed = typeof raw === 'string' ? parseJsonSafe(raw, {}) : (raw || {});
    const base = emptyFollowup();
    return {
        ...base,
        ...parsed,
        waStep: Math.min(3, Math.max(0, Number(parsed.waStep) || 0)),
        unsubscribed: parsed.unsubscribed === true,
        ganchoId: normalizeGanchoId(parsed.ganchoId),
        sinaisDeMovimento: parsed.sinaisDeMovimento === true,
        fichaComErro: parsed.fichaComErro === true,
        siteVelho: parsed.siteVelho === true,
        problemaFicha: String(parsed.problemaFicha || '').trim(),
        lang: normalizeOutreachLang(parsed.lang),
        edits: parsed.edits && typeof parsed.edits === 'object' ? parsed.edits : {}
    };
}

function loadGanchos() {
    if (!ganchosCache) {
        ganchosCache = JSON.parse(fs.readFileSync(GANCHOS_PATH, 'utf8'));
    }
    return ganchosCache;
}

function normalizeGanchoId(id) {
    const letter = String(id || '').trim().toUpperCase();
    return GANCHO_IDS.includes(letter) ? letter : '';
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

function pickGancho({ override, sinais = {}, lang = 'pt' } = {}) {
    const hooks = loadGanchos();
    let id = normalizeGanchoId(override);
    if (!id) {
        if (sinais.sinaisDeMovimento === true) id = 'D';
        else if (sinais.fichaComErro === true && filledGanchoField(sinais.problemaFicha)) id = 'E';
        else if (siteIsOld(sinais)) id = 'C';
        else if (!hasWebsite(sinais) && hasSocial(sinais)) id = 'B';
        else id = 'A';
    }
    if (id === 'E' && !filledGanchoField(sinais.problemaFicha)) id = 'A';
    const hook = hooks[id] || hooks.A;
    const localized = normalizeOutreachLang(lang) === 'en' && hook.en
        ? hook.en
        : hook;
    return {
        id,
        nome: hook.nome,
        nomeCurto: GANCHO_NOME_CURTO[id] || hook.nome,
        ganchoTitulo: localized.ganchoTitulo,
        ganchoTexto: localized.ganchoTexto
    };
}

function listGanchos() {
    const hooks = loadGanchos();
    return GANCHO_IDS.map((id) => ({
        id,
        nome: hooks[id].nome,
        nomeCurto: GANCHO_NOME_CURTO[id] || hooks[id].nome,
        ganchoTitulo: hooks[id].ganchoTitulo,
        ganchoTexto: hooks[id].ganchoTexto
    }));
}

function applyGanchoFields(followup, patch = {}) {
    const f = parseFollowup(followup);
    if (patch.lang != null) f.lang = normalizeOutreachLang(patch.lang);
    if (patch.ganchoId != null) f.ganchoId = normalizeGanchoId(patch.ganchoId);
    if (patch.sinaisDeMovimento != null) f.sinaisDeMovimento = patch.sinaisDeMovimento === true;
    if (patch.fichaComErro != null) f.fichaComErro = patch.fichaComErro === true;
    if (patch.siteVelho != null) f.siteVelho = patch.siteVelho === true;
    if (patch.problemaFicha != null) f.problemaFicha = String(patch.problemaFicha || '').trim();
    return f;
}

function sinaisFromLead({ dados = {}, diag = {}, presence = {}, followup = {} } = {}) {
    return {
        website: diag.website || dados.website || '',
        website_atual: dados.website_atual || presence.website || '',
        instagram: dados.instagram || presence.instagram || '',
        facebook: dados.facebook || presence.facebook || '',
        sinaisDeMovimento: followup.sinaisDeMovimento === true,
        fichaComErro: followup.fichaComErro === true,
        siteVelho: followup.siteVelho === true,
        problemaFicha: String(followup.problemaFicha || dados.problemaFicha || '').trim()
    };
}

function shortGanchoTexto(texto) {
    const t = String(texto || '').trim();
    if (!t) return '';
    return t.length <= 220 ? t : '';
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
    sinais = {},
    lang = 'pt'
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
    const ctaBody = en ? 'I liked what I saw. Can we talk?' : 'Gostei do que vi. Podemos falar?';
    const problemaFicha = String(sinais.problemaFicha || dados.problemaFicha || '').trim();
    const picked = pickGancho({
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
        ganchoTitulo: '',
        ganchoTexto: '',
        ganchoTextoCurto: '',
        ganchoTextoWa: ''
    };
    ctx.ganchoTitulo = fillTemplate(picked.ganchoTitulo, ctx);
    ctx.ganchoTexto = fillTemplate(picked.ganchoTexto, ctx);
    ctx.ganchoTextoCurto = shortGanchoTexto(ctx.ganchoTexto);
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

function renderEmailText(ctx) {
    const pack = normalizeOutreachLang(ctx && ctx.lang) === 'en' ? EMAIL_TEXT_EN : EMAIL_TEXT;
    return fillTemplate(pack, ctx);
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
    EMAIL_SUBJECT,
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
    loadGanchos,
    listGanchos,
    pickGancho,
    normalizeGanchoId,
    applyGanchoFields,
    sinaisFromLead,
    shortGanchoTexto
};
