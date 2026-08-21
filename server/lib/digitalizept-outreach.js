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
    1: `{{saudacao}} Sr. {{clienteNome}}

Sou o {{vendedorNome}}, da YourLab, aqui de {{zona}}.

"É fácil encontrar-nos. É depois do café, ao lado da farmácia."
Pena é que o Google não conheça o café do Zé.

Preparei isto para a *{{negocioNome}}*, sem lhe pedir nada:

{{link}}

Não está publicado nem aparece no Google. É só para ver.

Se gostar, digo-lhe como fica a funcionar a sério. Se não for de interesse, diga-me e não volto a incomodar.`,

    2: `Também arrumei a casa da *{{negocioNome}}* no Google. No email vê a ficha como ficaria quando alguém procura "{{oQueFaz}} em {{zona}}". É um demonstrador, ainda não está publicado.

{{link}}

Fica tudo em nome da empresa: a morada na internet, o espaço onde a página fica guardada e a conta do Google. Não fica preso a nós.

*490 euros* - tudo tratado e no ar em 3 dias
*190 euros* - só a página, para pôr no ar por si
*90 euros* - só a parte do Google

Sem IVA. Se começar pelos 90 ou 190 euros, desconta-se do resto.`,

    3: `{{saudacao}} Sr. {{clienteNome}}, foi um gosto passar por aí {{visitaQuando}}.

Aqui fica a página que lhe mostrei:

{{link}}

Fique à vontade para mostrar a quem quiser. Se quiser que lhe explique melhor, passo aí {{followupDia}} de manhã - são 10 minutos.`
};

const EMAIL_SUBJECT = 'Sr. {{clienteNome}}, fiz isto para a {{negocioNome}}';

const EMAIL_TEXT = `{{saudacao}} Sr. {{clienteNome}} — sou o {{vendedorNome}}, da YourLab, aqui de {{zona}}.

Estamos em 2026 e a vossa história ainda não está escrita em lado nenhum.

Para lhe mostrar do que estou a falar, fiz duas coisas para a {{negocioNome}}, sem lhe pedir nada. São exemplos — não estão publicados.

{{link}}

Gostou? Responda a este email e falamos. 490 euros tudo / 190 só a página / 90 só o Google, sem IVA. Se não for de interesse, responda REMOVER.

{{vendedorNome}}
YourLab, {{zona}}
{{vendedorTelefone}}
{{site}}`;

function loadEmailTemplate() {
    return fs.readFileSync(EMAIL_TEMPLATE_PATH, 'utf8');
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

function greetingForHour(hour) {
    return Number(hour) < 13 ? 'Bom dia' : 'Boa tarde';
}

function defaultVisitaQuando(hour) {
    return Number(hour) < 14 ? 'hoje de manhã' : 'esta tarde';
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
        edits: parsed.edits && typeof parsed.edits === 'object' ? parsed.edits : {}
    };
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

function pickOQueFaz(dados, businessTypeNome) {
    return String(
        (dados && (dados.o_que_faz || dados.principais_servicos || dados.categoria))
        || businessTypeNome
        || 'negócio local'
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
    unsubToken = '',
    hour = new Date().getHours(),
    businessTypeNome = '',
    lat = null,
    lng = null
} = {}) {
    const site = stripSite(provider.site);
    const link = absoluteUrl(origin, demoUrl || (demoSlug ? `/d/${demoSlug}` : ''));
    const demoPath = demoSlug
        ? `${site}/d/${demoSlug}`
        : (link.replace(/^https?:\/\//i, '') || `${site}/d/…`);
    const zona = String(dados.cidade || dados.zona || '').trim() || 'Portugal';
    const negocioNome = String(dados.nome_negocio || 'o seu negócio').trim() || 'o seu negócio';
    const oQueFaz = pickOQueFaz(dados, businessTypeNome);
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
    const ctaBody = 'Gostei do que vi. Podemos falar?';

    return {
        saudacao: greetingForHour(hour),
        clienteNome: String(dados.responsavel || 'Cliente').trim() || 'Cliente',
        negocioNome,
        negocioNomeMailto: encodeURIComponent(negocioNome),
        ctaBodyMailto: encodeURIComponent(ctaBody),
        vendedorNome: String(provider.responsavel || provider.nome || 'YourLab').trim(),
        vendedorEmail,
        vendedorTelefone,
        vendedorTelefoneTel,
        site,
        visitaQuando: visitaQuando || defaultVisitaQuando(hour),
        followupDia: String(followupDia || 'amanhã').trim() || 'amanhã',
        link,
        demoPath,
        zona,
        oQueFaz,
        horario: String(dados.horario || 'Horário a confirmar').trim() || 'Horário a confirmar',
        telefone: String(dados.telefone || dados.whatsapp || '').trim(),
        moradaLinha: [morada, zona].filter(Boolean).join(', ') || 'Morada a confirmar',
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
        clienteWhatsApp: String(dados.whatsapp || dados.telefone || '').trim()
    };
}

function waTextForStep(step, ctx, edits = {}) {
    const n = Number(step);
    const key = `wa${n}`;
    const tpl = (edits[key] && String(edits[key]).includes('{{'))
        ? edits[key]
        : (WA_TEMPLATES[n] || WA_TEMPLATES[1]);
    if (edits[key] && !String(edits[key]).includes('{{')) return String(edits[key]);
    return fillTemplate(tpl, ctx);
}

function emailSubjectFor(ctx, edits = {}) {
    if (edits.emailSubject && !String(edits.emailSubject).includes('{{')) {
        return String(edits.emailSubject);
    }
    const tpl = edits.emailSubject || EMAIL_SUBJECT;
    return fillTemplate(tpl, ctx);
}

function renderEmailHtml(ctx, templateHtml) {
    return fillHtmlTemplate(templateHtml || loadEmailTemplate(), ctx);
}

function renderEmailText(ctx) {
    return fillTemplate(EMAIL_TEXT, ctx);
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
    leadEmailFromRows
};
