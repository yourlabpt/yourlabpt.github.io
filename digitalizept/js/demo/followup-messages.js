import {
    pickGancho,
    shortGanchoTexto,
    sinaisFromWizardState
} from './outreach-ganchos.js';

export const WA_TEMPLATES = {
    1: `{{saudacao}} Sr. {{clienteNome}} — sou o {{vendedorNome}}, da YourLab, aqui de {{zona}}.

*{{ganchoTitulo}}*{{ganchoTextoWa}}

Fiz duas coisas para a *{{negocioNome}}*, sem lhe pedir nada. São exemplos — não estão publicados.

{{link}}

Gostou? Diga só que sim e falamos. Se não for de interesse, uma palavra e não volto a incomodar.`,

    2: `No email vê como ficaria a *{{negocioNome}}* quando alguém procura "{{oQueFaz}} em {{zona}}". E a página onde cabe a história toda.

{{link}}

Tratamos de tudo. O senhor só conta a história. Fica em nome da empresa — não fica preso a nós.

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

export const DEFAULT_WHATSAPP_TEMPLATE = WA_TEMPLATES[1];

export const DEFAULT_EMAIL_SUBJECT = 'Sr. {{clienteNome}}, fiz isto para a {{negocioNome}}';

export const DEFAULT_EMAIL_BODY = `{{saudacao}} Sr. {{clienteNome}} — sou o {{vendedorNome}}, da YourLab, aqui de {{zona}}.

{{ganchoTitulo}}

{{ganchoTexto}}

Para lhe mostrar do que estou a falar, fiz duas coisas para a {{negocioNome}}, sem lhe pedir nada. São exemplos — não estão publicados.

{{link}}

Gostou? Responda a este email e falamos. 490 euros tudo / 190 só a página / 90 só o Google, sem IVA.

{{vendedorNome}}
YourLab, {{zona}}
{{vendedorTelefone}}
{{site}}`;

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

export function buildFollowupContext(state, config) {
    const dados = (state && state.data && state.data.dados) || {};
    const provider = (config && config.provider) || {};
    const hour = new Date().getHours();
    const visitaKey = state.data.followupVisita === 'tarde' ? 'tarde' : 'manha';
    const visitaQuando = visitaKey === 'tarde' ? 'esta tarde' : 'hoje de manhã';
    const clienteNome = String(dados.responsavel || 'Cliente').trim() || 'Cliente';
    const negocioNome = String(dados.nome_negocio || 'o seu negócio').trim() || 'o seu negócio';
    const vendedorNome = String(provider.responsavel || provider.nome || 'YourLab').trim();
    const phone = formatSellerPhone(provider.telefone || provider.mbway);
    const vendedorTelefone = phone.display;
    const site = String(provider.site || 'yourlabpt.com').trim().replace(/^https?:\/\//, '');
    const followupDia = String(state.data.followupDia || 'amanhã').trim() || 'amanhã';
    const link = absoluteDemoUrl(state.data.demoUrl);
    const zona = String(dados.cidade || dados.zona || '').trim() || 'Portugal';
    const tipo = (state.data.businessType && state.data.businessType.nome) || '';
    const oQueFaz = String(dados.o_que_faz || dados.principais_servicos || tipo || 'negócio local').trim();
    const morada = String(dados.morada || '').trim();

    const ctx = {
        saudacao: greetingForHour(hour),
        clienteNome,
        negocioNome,
        vendedorNome,
        vendedorTelefone,
        vendedorTelefoneTel: phone.tel,
        site,
        visitaQuando,
        followupDia,
        link,
        zona,
        oQueFaz,
        horario: String(dados.horario || 'Horário a confirmar').trim() || 'Horário a confirmar',
        telefone: String(dados.telefone || dados.whatsapp || '').trim(),
        moradaLinha: [morada, zona].filter(Boolean).join(', ') || 'Morada a confirmar',
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
        sinais
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
