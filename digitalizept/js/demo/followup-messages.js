import {
    pickGancho,
    shortGanchoTexto,
    sinaisFromWizardState
} from './outreach-ganchos.js';
import {
    defaultFollowupDia,
    greetingForHour,
    localizeFollowupDia,
    normalizeOutreachLang,
    visitaQuandoFor
} from './outreach-lang.js';

export { normalizeOutreachLang };

export const WA_TEMPLATES = {
    1: `{{saudacao}} Sr. {{clienteNome}} — sou {{vendedorArtigo}} {{vendedorNome}}, da YourLab, aqui de {{zona}}.

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

export const WA_TEMPLATES_EN = {
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

export const DEFAULT_WHATSAPP_TEMPLATE = WA_TEMPLATES[1];

export const DEFAULT_EMAIL_SUBJECT = 'Sr. {{clienteNome}}, fiz isto para a {{negocioNome}}';
export const DEFAULT_EMAIL_SUBJECT_EN = '{{clienteNome}}, I made this for {{negocioNome}}';

export const DEFAULT_EMAIL_BODY = `{{saudacao}} Sr. {{clienteNome}} — sou {{vendedorArtigo}} {{vendedorNome}}, da YourLab, aqui de {{zona}}.

{{ganchoTitulo}}

{{ganchoTexto}}

Para lhe mostrar do que estou a falar, fiz duas coisas para a {{negocioNome}}, sem lhe pedir nada. São exemplos — não estão publicados.

{{link}}

Gostou? Responda a este email e falamos. 490 euros tudo / 190 só a página / 90 só o Google, sem IVA.

{{vendedorNome}}
YourLab, {{zona}}
{{vendedorTelefone}}
{{site}}`;

export const DEFAULT_EMAIL_BODY_EN = `{{saudacao}} {{clienteNome}} — I'm {{vendedorNome}}, from YourLab, here in {{zona}}.

{{ganchoTitulo}}

{{ganchoTexto}}

To show you what I mean, I put two things together for {{negocioNome}}, without asking you for anything. They are examples — they are not published.

{{link}}

If you like it, reply to this email and we talk. 490 euros everything / 190 just the page / 90 just Google, VAT not included.

{{vendedorNome}}
YourLab, {{zona}}
{{vendedorTelefone}}
{{site}}`;

function templatesFor(lang) {
    return normalizeOutreachLang(lang) === 'en'
        ? { wa: WA_TEMPLATES_EN, emailSubject: DEFAULT_EMAIL_SUBJECT_EN, emailBody: DEFAULT_EMAIL_BODY_EN }
        : { wa: WA_TEMPLATES, emailSubject: DEFAULT_EMAIL_SUBJECT, emailBody: DEFAULT_EMAIL_BODY };
}

const WA_LABELS = {
    1: '1 · Mensagem principal',
    2: '2 · Depois da resposta (Google e preços)',
    3: '3 · Depois da visita'
};

export function waStepLabel(step) {
    return WA_LABELS[Number(step)] || WA_LABELS[1];
}

export function defaultVisitaQuando(hour = new Date().getHours(), lang = 'pt') {
    return visitaQuandoFor(hour < 14 ? 'manha' : 'tarde', lang);
}

export function absoluteDemoUrl(demoUrl) {
    const raw = String(demoUrl || '').trim();
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw)) return raw;
    if (typeof window !== 'undefined' && window.location && window.location.origin) {
        return `${window.location.origin}${raw.startsWith('/') ? raw : `/${raw}`}`;
    }
    return raw;
}

export function normalizePhoneForWa(raw) {
    const digits = String(raw || '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.startsWith('351') && digits.length >= 12) return digits;
    if (digits.length === 9) return `351${digits}`;
    return digits;
}

const DEFAULT_VENDEDOR_TELEFONE = '+351936732879';

export function formatSellerPhone(raw) {
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

export function outreachLangOf(state) {
    return normalizeOutreachLang(state && state.data && state.data.followup && state.data.followup.lang);
}

export function buildFollowupContext(state, config) {
    const dados = (state && state.data && state.data.dados) || {};
    const provider = (config && config.provider) || {};
    const lang = outreachLangOf(state);
    const en = lang === 'en';
    const hour = new Date().getHours();
    const visitaKey = state.data.followupVisita === 'tarde' ? 'tarde' : 'manha';
    const visitaQuando = visitaQuandoFor(visitaKey, lang);
    const clienteNome = String(dados.responsavel || (en ? 'there' : 'Cliente')).trim()
        || (en ? 'there' : 'Cliente');
    const negocioNome = String(dados.nome_negocio || (en ? 'your business' : 'o seu negócio')).trim()
        || (en ? 'your business' : 'o seu negócio');
    const vendedorNome = String(provider.responsavel || provider.nome || 'YourLab').trim();
    const vendedorArtigo = String(provider.artigo || '').trim() === 'a' ? 'a' : 'o';
    const phone = formatSellerPhone(provider.telefone || provider.mbway);
    const vendedorTelefone = phone.display;
    const site = String(provider.site || 'yourlabpt.com').trim().replace(/^https?:\/\//, '');
    const followupDia = localizeFollowupDia(state.data.followupDia || defaultFollowupDia(lang), lang);
    const link = absoluteDemoUrl(state.data.demoUrl);
    const zona = String(dados.cidade || dados.zona || '').trim() || 'Portugal';
    const tipo = (state.data.businessType && state.data.businessType.nome) || '';
    const oQueFaz = String(
        dados.o_que_faz || dados.principais_servicos || tipo || (en ? 'local business' : 'negócio local')
    ).trim();
    const morada = String(dados.morada || '').trim();

    const ctx = {
        lang,
        saudacao: greetingForHour(hour, lang),
        clienteNome,
        negocioNome,
        vendedorNome,
        vendedorArtigo,
        vendedorTelefone,
        vendedorTelefoneTel: phone.tel,
        site,
        visitaQuando,
        followupDia,
        link,
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
        clienteEmail: String(dados.email || '').trim(),
        clienteWhatsApp: normalizePhoneForWa(dados.whatsapp || dados.telefone),
        problemaFicha: '',
        ganchoId: '',
        ganchoTitulo: '',
        ganchoTexto: '',
        ganchoTextoCurto: '',
        ganchoTextoWa: ''
    };
    const sinais = sinaisFromWizardState(state);
    ctx.problemaFicha = sinais.problemaFicha;
    const picked = pickGancho({
        override: state.data && state.data.followup && state.data.followup.ganchoId,
        sinais,
        lang
    });
    ctx.ganchoId = picked.id;
    ctx.ganchoTitulo = fillTemplate(picked.ganchoTitulo, ctx);
    ctx.ganchoTexto = fillTemplate(picked.ganchoTexto, ctx);
    ctx.ganchoTextoCurto = shortGanchoTexto(ctx.ganchoTexto);
    ctx.ganchoTextoWa = ctx.ganchoTextoCurto ? `\n\n${ctx.ganchoTextoCurto}` : '';
    return ctx;
}

export function fillTemplate(template, ctx) {
    return String(template || '').replace(/\{\{(\w+)\}\}/g, (_, key) => {
        return ctx[key] != null ? String(ctx[key]) : '';
    });
}

export function buildWhatsAppMessage(state, config, step = 1) {
    const ctx = buildFollowupContext(state, config);
    const n = Number(step) || 1;
    const editKey = `followupWa${n}`;
    const edited = state.data && state.data[editKey];
    if (edited && !String(edited).includes('{{')) return String(edited);
    const pack = templatesFor(ctx.lang);
    const tpl = (edited && String(edited).includes('{{'))
        ? edited
        : (pack.wa[n] || pack.wa[1]);
    return fillTemplate(tpl, ctx);
}

export function buildEmailContent(state, config) {
    const ctx = buildFollowupContext(state, config);
    const pack = templatesFor(ctx.lang);
    const subjectTpl = state.data.followupEmailSubject || pack.emailSubject;
    const bodyTpl = state.data.followupEmailBody || pack.emailBody;
    return {
        subject: fillTemplate(subjectTpl, ctx),
        body: fillTemplate(bodyTpl, ctx)
    };
}

export function buildWhatsAppUrl(phone, message) {
    const base = phone ? `https://wa.me/${phone}` : 'https://wa.me/';
    return `${base}?text=${encodeURIComponent(message)}`;
}

export function buildMailtoUrl(email, subject, body) {
    const to = encodeURIComponent(email || '');
    const params = new URLSearchParams();
    if (subject) params.set('subject', subject);
    if (body) params.set('body', body);
    const qs = params.toString();
    return qs ? `mailto:${to}?${qs}` : `mailto:${to}`;
}

export function nextSendableWaStep(followup) {
    const f = followup || {};
    const step = Number(f.waStep) || 0;
    if (step <= 0) return 1;
    if (step === 1 && f.replied1At) return 2;
    if (step === 2 && f.replied2At) return 3;
    return 0;
}
