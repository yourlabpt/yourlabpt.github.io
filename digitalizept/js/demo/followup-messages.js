export const WA_TEMPLATES = {
    1: `{{saudacao}} Sr. {{clienteNome}} 👋
Sou o {{vendedorNome}}, da YourLab, aqui de {{zona}}.

_"É fácil encontrar-nos. É depois do café, ao lado da farmácia."_

Pena é que o Google não conheça o café do Zé 🙂

Preparei isto para a *{{negocioNome}}*, sem lhe pedir nada:

{{link}}

Não está publicado nem aparece no Google — é só para ver.

Se gostar, digo-lhe como fica a funcionar a sério. Se não for de interesse, diga-me e não volto a incomodar 👍`,

    2: `Também arrumei a casa da *{{negocioNome}}* no Google, para ver como ficaria quando alguém procura "{{oQueFaz}} em {{zona}}":

{{linkGoogle}}

Fica tudo em nome da empresa — a morada na internet, o espaço onde a página fica guardada e a conta do Google. Não fica preso a nós.

*490 €* — tudo tratado e no ar em 3 dias
*190 €* — só a página, para pôr no ar por si
*90 €* — só a parte do Google

Sem IVA. Se começar pelos 90 € ou 190 €, desconta-se do resto.`,

    3: `{{saudacao}} Sr. {{clienteNome}}, foi um gosto passar por aí {{visitaQuando}} 👋

Aqui fica a página que lhe mostrei:

{{link}}

Fique à vontade para mostrar a quem quiser. Se quiser que lhe explique melhor, passo aí {{followupDia}} de manhã — são 10 minutos.`
};

export const DEFAULT_WHATSAPP_TEMPLATE = WA_TEMPLATES[1];

export const DEFAULT_EMAIL_SUBJECT = 'Fizemos isto para a {{negocioNome}} — sem lhe pedir nada';

export const DEFAULT_EMAIL_BODY = `{{saudacao}} Sr. {{clienteNome}},

Sou o {{vendedorNome}}, da YourLab, aqui de {{zona}}.

"É fácil encontrar-nos. É depois do café, ao lado da farmácia."
Pena é que o Google não conheça o café do Zé.

Preparei isto para a {{negocioNome}}, sem lhe pedir nada:
{{link}}

Também arrumei a casa no Google:
{{linkGoogle}}

Não está publicado. Se gostar, digo-lhe como fica a funcionar a sério (490 € tudo / 190 € só a página / 90 € só o Google, sem IVA).

{{vendedorNome}} · YourLab, {{zona}}
{{vendedorTelefone}} · {{site}}`;

const WA_LABELS = {
    1: '1 · Mensagem principal',
    2: '2 · Depois da resposta (Google e preços)',
    3: '3 · Depois da visita'
};

export function waStepLabel(step) {
    return WA_LABELS[Number(step)] || WA_LABELS[1];
}

function greetingForHour(hour) {
    return hour < 13 ? 'Bom dia' : 'Boa tarde';
}

export function defaultVisitaQuando(hour = new Date().getHours()) {
    return hour < 14 ? 'hoje de manhã' : 'esta tarde';
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

function googleSearchUrl(nome, oQueFaz, zona, morada) {
    const query = [nome, oQueFaz, morada, zona].filter(Boolean).join(' ');
    if (!query) return 'https://www.google.com/maps';
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function buildFollowupContext(state, config) {
    const dados = (state && state.data && state.data.dados) || {};
    const provider = (config && config.provider) || {};
    const hour = new Date().getHours();
    const visitaKey = state.data.followupVisita === 'tarde' ? 'tarde' : 'manha';
    const visitaQuando = visitaKey === 'tarde' ? 'esta tarde' : 'hoje de manhã';
    const clienteNome = String(dados.responsavel || 'Cliente').trim() || 'Cliente';
    const negocioNome = String(dados.nome_negocio || 'o seu negócio').trim() || 'o seu negócio';
    const vendedorNome = String(provider.responsavel || provider.nome || 'YourLab').trim();
    const vendedorTelefone = String(provider.telefone || provider.mbway || '').trim();
    const site = String(provider.site || 'yourlabpt.com').trim().replace(/^https?:\/\//, '');
    const followupDia = String(state.data.followupDia || 'amanhã').trim() || 'amanhã';
    const link = absoluteDemoUrl(state.data.demoUrl);
    const zona = String(dados.cidade || dados.zona || '').trim() || 'Portugal';
    const tipo = (state.data.businessType && state.data.businessType.nome) || '';
    const oQueFaz = String(dados.o_que_faz || dados.principais_servicos || tipo || 'negócio local').trim();
    const morada = String(dados.morada || '').trim();

    return {
        saudacao: greetingForHour(hour),
        clienteNome,
        negocioNome,
        vendedorNome,
        vendedorTelefone,
        site,
        visitaQuando,
        followupDia,
        link,
        zona,
        oQueFaz,
        linkGoogle: googleSearchUrl(negocioNome, oQueFaz, zona, morada),
        clienteEmail: String(dados.email || '').trim(),
        clienteWhatsApp: normalizePhoneForWa(dados.whatsapp || dados.telefone)
    };
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
    const tpl = (edited && String(edited).includes('{{'))
        ? edited
        : (WA_TEMPLATES[n] || WA_TEMPLATES[1]);
    return fillTemplate(tpl, ctx);
}

export function buildEmailContent(state, config) {
    const ctx = buildFollowupContext(state, config);
    const subjectTpl = state.data.followupEmailSubject || DEFAULT_EMAIL_SUBJECT;
    const bodyTpl = state.data.followupEmailBody || DEFAULT_EMAIL_BODY;
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
