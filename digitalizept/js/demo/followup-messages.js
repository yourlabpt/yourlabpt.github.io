export const DEFAULT_WHATSAPP_TEMPLATE = `{{saudacao}} Sr. {{clienteNome}} 👋
É o {{vendedorNome}}, da YourLab — estive aí {{visitaQuando}} e mostrei-lhe a página do {{negocioNome}}.
Aqui fica o link para ver com calma:
{{link}}
Não está publicada nem aparece no Google. É um exemplo que preparei com informação que já está pública, só para lhe mostrar o que dá para fazer.
Fique à vontade para mostrar a quem quiser. Se quiser que lhe explique melhor, passo aí {{followupDia}} de manhã — são 10 minutos.
Se não for de interesse, diga-me e não volto a incomodar 👍`;

export const DEFAULT_EMAIL_SUBJECT = 'A página que lhe mostrei hoje — {{negocioNome}}';

export const DEFAULT_EMAIL_BODY = `Bom dia Sr. {{clienteNome}},

Foi um gosto falar consigo {{visitaQuando}}.

Como combinámos, aqui fica a demonstração que preparei para o {{negocioNome}}:
{{link}}

É um exemplo, feito com informação que já está pública sobre o vosso negócio. Não está publicada, não aparece no Google e não é o vosso site oficial — serve para lhe mostrar, na prática, como poderia ser.

Como lhe disse, somos uma empresa de tecnologia. Fazemos o site, a configuração da vossa ficha no Google e a parte legal obrigatória — Livro de Reclamações Eletrónico, política de privacidade e identificação da empresa. Não fazemos fotografia profissional, redes sociais nem publicidade; quando é preciso, indico quem faça bem.

Fica tudo em nome da vossa empresa: o domínio, o alojamento e a conta Google. Não ficam dependentes de nós.

Se fizer sentido avançarmos, digo-lhe exatamente quanto custa e quanto tempo demora, sem compromisso. Passo aí {{followupDia}} de manhã, ou ligo-lhe — como preferir.

Com os melhores cumprimentos,
{{vendedorNome}}
YourLab
{{vendedorTelefone}} · {{site}}

Se preferir não voltar a receber mensagens nossas, responda a este email com "remover" e retiramos os vossos contactos de imediato.`;

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
        clienteEmail: String(dados.email || '').trim(),
        clienteWhatsApp: normalizePhoneForWa(dados.whatsapp || dados.telefone)
    };
}

export function fillTemplate(template, ctx) {
    return String(template || '').replace(/\{\{(\w+)\}\}/g, (_, key) => {
        return ctx[key] != null ? String(ctx[key]) : '';
    });
}

export function buildWhatsAppMessage(state, config) {
    const ctx = buildFollowupContext(state, config);
    const tpl = state.data.followupWhatsApp || DEFAULT_WHATSAPP_TEMPLATE;
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
