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
import { offerCopy, normalizeOffer } from './outreach-offer.js';

export { normalizeOutreachLang };

export const WA_TEMPLATES = {
    1: `{{saudacao}} Sr. {{clienteNome}} — sou {{vendedorArtigo}} {{vendedorNome}}, da YourLab, aqui de {{zona}}.{{pontEmailFrase}}

*{{ganchoTitulo}}*{{ganchoTextoWa}}

Fiz duas coisas para a *{{negocioNome}}*, sem lhe pedir nada. São exemplos — não estão publicados.

{{link}}

Gostou? Marcamos uma conversa. Tratamos de tudo — vocês só precisam de estar satisfeitos antes da entrega final.`,

    2: `{{diagnosticoLinha}}No email vê como ficaria a *{{negocioNome}}* quando alguém procura "{{oQueFaz}} em {{zona}}". E a página onde cabe a história toda.

{{link}}

Feito à medida. E o site fica vosso, não nosso. Cada página é construída de raiz para a casa — fica em nome da empresa.
{{blocoPrecosWa}}Isto é só uma parte do que fazemos. Se precisar de marcações, fichas, stocks — diga e falamos também.`,

    3: `{{saudacao}} Sr. {{clienteNome}}, foi um gosto passar por aí {{visitaQuando}}.

Aqui fica a página que lhe mostrei — a história toda num sítio só vosso:

{{link}}

Marcamos {{followupDia}} de manhã? Tratamos de tudo — vocês só precisam de estar satisfeitos antes da entrega final.`
};

export const WA_TEMPLATES_EN = {
    1: `{{saudacao}} {{clienteNome}} — I'm {{vendedorNome}}, from YourLab, here in {{zona}}.{{pontEmailFrase}}

*{{ganchoTitulo}}*{{ganchoTextoWa}}

I put two things together for *{{negocioNome}}*, without asking you for anything. They are examples — they are not published.

{{link}}

If it makes sense, we book a short meeting. We take care of everything — you just need to be happy with it before final delivery.`,

    2: `In the email you can see how *{{negocioNome}}* would look when someone searches "{{oQueFaz}} in {{zona}}". And the page that holds the whole story.

{{link}}

Built for this house. And the site is yours, not ours. Each page is made from scratch for the business — it stays in the company's name.
{{blocoPrecosWa}}This is only part of what we do. If you need bookings, client files, stock — say so and we can talk about that too.`,

    3: `{{saudacao}} {{clienteNome}}, it was good to stop by {{visitaQuando}}.

Here is the page I showed you — the whole story in one place that is yours:

{{link}}

Shall we meet {{followupDia}} in the morning? We take care of everything — you just need to be happy with it before final delivery.`
};

export const DEFAULT_WHATSAPP_TEMPLATE = WA_TEMPLATES[1];

export const DEFAULT_EMAIL_SUBJECT = 'exemplo que fizemos para a {{negocioNome}}';
export const DEFAULT_EMAIL_SUBJECT_EN = 'an example we made for {{negocioNome}}';

export const DEFAULT_EMAIL_BODY = `{{saudacao}} Sr. {{clienteNome}} — sou {{vendedorArtigo}} {{vendedorNome}}, da YourLab, aqui de {{zona}}.

{{ganchoTitulo}}

{{ganchoTexto}}

Para lhe mostrar do que estou a falar, fiz duas coisas para a {{negocioNome}}, sem lhe pedir nada. São exemplos — não estão publicados.

{{link}}

Gostou? Responda a este email e marcamos uma conversa. Tratamos de tudo — vocês só precisam de estar satisfeitos antes da entrega final.{{fechoPreco}}

{{vendedorNome}}
YourLab, {{zona}}
{{vendedorTelefone}}
{{site}}`;

export const DEFAULT_EMAIL_BODY_EN = `{{saudacao}} {{clienteNome}} — I'm {{vendedorNome}}, from YourLab, here in {{zona}}.

{{ganchoTitulo}}

{{ganchoTexto}}

To show you what I mean, I put two things together for {{negocioNome}}, without asking you for anything. They are examples — they are not published.

{{link}}

If it makes sense, reply to this email and we book a short meeting. We take care of everything — you just need to be happy with it before final delivery.{{fechoPreco}}

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

/**
 * The line that refers to the email is what separates a follow-up from a scam —
 * so it only exists when the email actually went out. With no email sent, the
 * line disappears rather than claiming something false in the first sentence.
 */
export function pontEmailFields(followup, lang, hour = new Date().getHours()) {
    const enviadoEm = followup && followup.emailSentAt;
    if (!enviadoEm) return { pontEmail: '', pontEmailFrase: '', quandoEmail: '' };
    const en = normalizeOutreachLang(lang) === 'en';
    const quando = new Date(enviadoEm);
    const hoje = new Date();
    const mesmoDia = quando.toDateString() === hoje.toDateString();
    let quandoEmail;
    if (!mesmoDia) quandoEmail = en ? 'the other day' : 'há dias';
    else if (quando.getHours() < 13 && Number(hour) >= 13) quandoEmail = en ? 'this morning' : 'hoje de manhã';
    else quandoEmail = en ? 'today' : 'hoje';
    const pontEmail = en
        ? `I sent you an email ${quandoEmail}; sending it here too as it is easier to see.`
        : `Mandei-lhe um email ${quandoEmail}, mando por aqui que é mais fácil de ver.`;
    return { pontEmail, pontEmailFrase: ` ${pontEmail}`, quandoEmail };
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
        ganchoTextoWa: '',
        blocoPrecosWa: '\n\n',
        fechoPreco: '',
        pontEmail: '',
        pontEmailFrase: '',
        quandoEmail: ''
    };
    Object.assign(ctx, pontEmailFields(state.data && state.data.followup, lang, hour));
    const sinais = sinaisFromWizardState(state);
    ctx.problemaFicha = sinais.problemaFicha;
    const picked = pickGancho({
        falhas: state.data && state.data.followup && state.data.followup.falhas,
        override: state.data && state.data.followup && state.data.followup.ganchoId,
        sinais,
        lang
    });
    ctx.ganchoId = picked.id;
    ctx.falhas = picked.falhas;
    ctx.ganchoTitulo = fillTemplate(picked.ganchoTitulo, ctx);
    ctx.ganchoTexto = fillTemplate(picked.ganchoTexto, ctx);
    ctx.ganchoTextoCurto = shortGanchoTexto(ctx.ganchoTexto);
    ctx.ganchoTextoWa = ctx.ganchoTextoCurto ? `\n\n${ctx.ganchoTextoCurto}` : '';
    ctx.diagnosticoResumo = picked.diagnosticoResumo || '';
    ctx.diagnosticoLinha = ctx.diagnosticoResumo ? `${ctx.diagnosticoResumo}\n\n` : '';
    Object.assign(ctx, offerCopy(normalizeOffer(state.data && state.data.followup), lang));
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
