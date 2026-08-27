import { normalizeOutreachLang } from './outreach-lang.js';

export const FALHA_IDS = [
    'maps_sem_whatsapp',
    'maps_telefone_sem_wa',
    'maps_sem_site',
    'maps_sem_email',
    'site_link_errado',
    'site_fraco',
    'so_no_facebook',
    'redes_desligadas_maps',
    'redes_sem_morada',
    'info_desencontrada',
    'ficha_errada',
    'sem_nada'
];

export const GANCHO_IDS = FALHA_IDS;

const GANCHO_TO_FALHAS = {
    A: ['sem_nada'],
    B: ['redes_desligadas_maps', 'maps_sem_site'],
    C: ['site_fraco'],
    D: ['sem_nada'],
    E: ['ficha_errada']
};

const TITULO_MAPS = {
    pt: 'Vimos-vos no Google Maps. Quem vos procura no Maps ou no Instagram ainda não vê o negócio completo num só sítio.',
    en: 'We found you on Google Maps. People who look for you on Maps or Instagram still do not see the full business in one place.'
};

const TITULO_FACEBOOK = {
    pt: 'Encontrámos-vos no Facebook. No Google Maps ainda é difícil perceber o negócio ou contactar-vos num sítio só vosso.',
    en: 'We found you on Facebook. On Google Maps it is still hard to understand the business or reach you in one place of your own.'
};

const TITULO_SEM_NADA = {
    pt: 'Procurámos-vos no Google e nas redes. Quase não há nada para o cliente perceber o que fazem nem como vos contactar.',
    en: 'We looked you up on Google and on social. There is almost nothing for a customer to understand what you do or how to reach you.'
};

const FECHO = {
    pt: 'Unir isto num só sítio — pin no Maps com WhatsApp, telefone e site, Perfil da Empresa a gerir, Instagram e Facebook ligados, e uma página vossa. Quem vos procura encontra-vos e percebe o serviço; quem não é para vocês vê logo e não vos tira tempo. Fizemos um exemplo para verem como fica. Na YourLab tratamos disto ao vosso lado.',
    en: 'Bring this into one place — a Maps pin with WhatsApp, phone and website, a managed Business Profile, Instagram and Facebook linked, and a page of your own. People looking for you find you and understand the service; anyone who is not a fit sees that straight away and does not take your time. We made an example so you can see how it looks. At YourLab we handle this alongside you.'
};

export const GRUPOS = [
    { id: 'pin', label: { pt: 'Pin no Maps — o que falta no contacto público', en: 'Maps pin — what is missing on the public contact' } },
    { id: 'site', label: { pt: 'Site próprio — ligado ao pin', en: 'Own website — linked from the pin' } },
    { id: 'redes', label: { pt: 'Instagram e Facebook — ligados ao Maps', en: 'Instagram and Facebook — linked to Maps' } },
    { id: 'perfil', label: { pt: 'Perfil da Empresa — a ficha gerível', en: 'Business Profile — the managed listing' } },
    { id: 'geral', label: { pt: 'Quase invisível', en: 'Almost invisible' } }
];

export const COMBINACOES = [
    {
        id: 'centralizacao',
        chip: { pt: 'Combo · Centralizar tudo', en: 'Pack · Centralise everything' },
        hint: { pt: 'Pin incompleto + redes desligadas + falta um sítio só', en: 'Incomplete pin + social off Maps + no single place' },
        falhas: ['info_desencontrada', 'maps_sem_site', 'maps_sem_whatsapp']
    },
    {
        id: 'pin_contacto',
        chip: { pt: 'Combo · Pin sem contacto fácil', en: 'Pack · Pin without easy contact' },
        hint: { pt: 'WhatsApp e site em falta no pin', en: 'WhatsApp and website missing on the pin' },
        falhas: ['maps_sem_whatsapp', 'maps_sem_site', 'maps_sem_email']
    },
    {
        id: 'redes_maps',
        chip: { pt: 'Combo · Redes ≠ Maps', en: 'Pack · Social ≠ Maps' },
        hint: { pt: 'IG/FB e o pin não contam a mesma história', en: 'IG/FB and the pin do not tell the same story' },
        falhas: ['info_desencontrada', 'redes_desligadas_maps']
    },
    {
        id: 'site_fraco_pack',
        chip: { pt: 'Combo · Site fraco ou errado', en: 'Pack · Weak or wrong website' },
        hint: { pt: 'Há link ou site, mas não ajuda o cliente', en: 'There is a link or site, but it does not help the customer' },
        falhas: ['site_fraco', 'maps_sem_whatsapp']
    },
    {
        id: 'so_facebook',
        chip: { pt: 'Combo · Só no Facebook', en: 'Pack · Only on Facebook' },
        hint: { pt: 'Presença informal no Facebook; Maps e site fracos ou em falta', en: 'Informal Facebook presence; Maps and website weak or missing' },
        falhas: ['so_no_facebook', 'maps_sem_site']
    }
];

const FALHAS = {
    maps_sem_whatsapp: {
        grupo: 'pin',
        chip: 'Sem WhatsApp no pin',
        frase: 'No pin do Maps não há WhatsApp — quem vos encontra não marca em dois toques.',
        en: { chip: 'No WhatsApp on the pin', frase: 'The Maps pin has no WhatsApp — people who find you cannot book in two taps.' }
    },
    maps_telefone_sem_wa: {
        grupo: 'pin',
        chip: 'Só telefone no pin, sem WhatsApp',
        frase: 'No pin está o telefone. Falta o WhatsApp — o canal que a maior parte usa para marcar.',
        en: { chip: 'Phone on the pin, no WhatsApp', frase: 'The pin has the phone. WhatsApp is missing — the channel most people use to book.' }
    },
    maps_sem_site: {
        grupo: 'pin',
        chip: 'Sem site no pin',
        frase: 'No pin do Maps não há um site vosso — o cliente não tem um sítio só vosso para perceber o serviço.',
        en: { chip: 'No website on the pin', frase: 'The Maps pin has no website of yours — the customer has nowhere that is only yours to understand the service.' }
    },
    maps_sem_email: {
        grupo: 'pin',
        chip: 'Sem email no pin',
        frase: 'No pin não há email — quem quer escrever fica sem caminho.',
        en: { chip: 'No email on the pin', frase: 'The pin has no email — anyone who wants to write has no path.' }
    },
    site_link_errado: {
        grupo: 'site',
        chip: 'Link do site no pin errado',
        frase: 'O link do site no pin do Maps não leva a vocês — perde-se a confiança na primeira abertura.',
        en: { chip: 'Wrong website link on the pin', frase: 'The website link on the Maps pin does not take people to you — trust is lost on the first open.' }
    },
    site_fraco: {
        grupo: 'site',
        chip: 'Site fraco ou pouco claro',
        frase: 'Há um site, mas a informação não chega para o cliente perceber o serviço num olhar.',
        en: { chip: 'Weak or unclear website', frase: 'There is a website, but it does not tell a customer enough about the service at a glance.' }
    },
    so_no_facebook: {
        grupo: 'redes',
        chip: 'Só no Facebook',
        frase: 'No Facebook há página ou presença informal. No Google Maps o negócio ainda é difícil de encontrar ou de perceber — falta um sítio profissional só vosso.',
        en: { chip: 'Only on Facebook', frase: 'On Facebook there is a page or informal presence. On Google Maps the business is still hard to find or understand — there is no professional place of your own.' }
    },
    redes_desligadas_maps: {
        grupo: 'redes',
        chip: 'IG/FB fora do pin',
        frase: 'O Instagram e o Facebook existem, mas o pin do Maps não os liga — quem chega pelo Google não vê as redes.',
        en: { chip: 'IG/FB off the pin', frase: 'Instagram and Facebook exist, but the Maps pin does not link them — people arriving via Google never see the social accounts.' }
    },
    redes_sem_morada: {
        grupo: 'redes',
        chip: 'Redes sem morada',
        frase: 'Há redes. Não há morada clara para o cliente chegar ao sítio.',
        en: { chip: 'Social, no address', frase: 'There are social accounts. There is no clear address for a customer to find the place.' }
    },
    info_desencontrada: {
        grupo: 'redes',
        chip: 'IG / FB / pin diferentes',
        frase: 'Instagram, Facebook e o pin no Maps não dizem a mesma coisa — horário, contacto ou serviço desencontrados. Falta um sítio só.',
        en: { chip: 'IG / FB / pin disagree', frase: 'Instagram, Facebook and the Maps pin do not say the same thing — hours, contact or service disagree. There is no single place.' }
    },
    ficha_errada: {
        grupo: 'perfil',
        chip: 'Perfil / ficha com erro',
        frase: 'A ficha no Google (Perfil da Empresa) diz {{problemaFicha}} — o pin público fica a mentir ao cliente.',
        en: { chip: 'Profile / listing error', frase: 'The Google Business Profile says {{problemaFicha}} — the public pin misleads the customer.' }
    },
    sem_nada: {
        grupo: 'geral',
        chip: 'Quase nada no Google',
        frase: 'Quem vos procura no Google ou no Instagram quase não encontra nada para perceber o negócio.',
        en: { chip: 'Almost nothing on Google', frase: 'Anyone who looks you up on Google or Instagram finds almost nothing to understand the business.' }
    }
};

export const GANCHO_NOME_CURTO = Object.fromEntries(
    FALHA_IDS.map((id) => [id, FALHAS[id].chip])
);

function filled(value) {
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
    return filled(sinais && sinais.instagram) || filled(sinais && sinais.facebook);
}

export function normalizeFalhaId(id) {
    const raw = String(id || '').trim();
    if (FALHA_IDS.includes(raw)) return raw;
    const mapped = GANCHO_TO_FALHAS[raw.toUpperCase()];
    return mapped ? mapped[0] : '';
}

export function normalizeGanchoId(id) {
    return normalizeFalhaId(id);
}

export function normalizeFalhas(raw) {
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

export function migrateGanchoToFalhas(ganchoId) {
    const letter = String(ganchoId || '').trim().toUpperCase();
    if (GANCHO_TO_FALHAS[letter]) return GANCHO_TO_FALHAS[letter].slice();
    const falha = normalizeFalhaId(ganchoId);
    return falha ? [falha] : [];
}

function falhasParaCopy(ids) {
    let list = ids.slice();
    if (list.includes('maps_telefone_sem_wa')) {
        list = list.filter((id) => id !== 'maps_sem_whatsapp');
    }
    if (list.includes('info_desencontrada')) {
        list = list.filter((id) => id !== 'redes_desligadas_maps' && id !== 'redes_sem_morada');
    }
    if (list.includes('so_no_facebook')) {
        list = list.filter((id) => id !== 'redes_desligadas_maps' && id !== 'sem_nada');
    }
    if (list.length > 1) list = list.filter((id) => id !== 'sem_nada');
    return FALHA_IDS.filter((id) => list.includes(id)).slice(0, 3);
}

function fillFrase(template, problemaFicha) {
    return String(template || '').replace(/\{\{problemaFicha\}\}/g, problemaFicha || '');
}

export function suggestFalhas(sinais = {}) {
    const out = [];
    const phone = filled(sinais.telefone);
    const wa = filled(sinais.whatsapp) || sinais.temWhatsapp === true;
    const hasFb = filled(sinais.facebook);
    const weakMaps = !hasWebsite(sinais) || !filled(sinais.morada);
    if (phone && !wa) out.push('maps_telefone_sem_wa');
    else if (!wa) out.push('maps_sem_whatsapp');
    if (!hasWebsite(sinais)) out.push('maps_sem_site');
    else if (siteIsOld(sinais)) out.push('site_fraco');
    if (!filled(sinais.email)) out.push('maps_sem_email');
    if (hasFb && weakMaps) out.push('so_no_facebook');
    if (hasSocial(sinais)) {
        if (!(hasFb && weakMaps)) {
            out.push('info_desencontrada');
            out.push('redes_desligadas_maps');
        }
        if (!filled(sinais.morada)) out.push('redes_sem_morada');
    }
    if (sinais.fichaComErro === true && filled(sinais.problemaFicha)) out.push('ficha_errada');
    if (!out.length) out.push('sem_nada');
    return normalizeFalhas(out);
}

export function composeAbertura({ falhas, override, sinais = {}, lang = 'pt' } = {}) {
    const outreachLang = normalizeOutreachLang(lang);
    let ids = normalizeFalhas(falhas);
    if (!ids.length && override) ids = migrateGanchoToFalhas(override);
    if (!ids.length) ids = suggestFalhas(sinais);
    const copyIds = falhasParaCopy(ids);
    const onlySemNada = copyIds.length === 1 && copyIds[0] === 'sem_nada';
    const facebookFirst = copyIds.includes('so_no_facebook');
    const titulos = onlySemNada
        ? TITULO_SEM_NADA
        : (facebookFirst ? TITULO_FACEBOOK : TITULO_MAPS);
    const ganchoTitulo = titulos[outreachLang] || titulos.pt;
    const problemaFicha = String(sinais.problemaFicha || '').trim();
    const factos = copyIds.map((id) => {
        const item = FALHAS[id];
        const pack = outreachLang === 'en' && item.en ? item.en : item;
        if (id === 'ficha_errada' && !filled(problemaFicha)) return '';
        return fillFrase(pack.frase, problemaFicha).trim();
    }).filter(Boolean);
    const fecho = FECHO[outreachLang] || FECHO.pt;
    return {
        id: ids[0] || 'sem_nada',
        falhas: ids,
        sugeridas: suggestFalhas(sinais),
        nome: FALHAS[ids[0] || 'sem_nada'].chip,
        nomeCurto: FALHAS[ids[0] || 'sem_nada'].chip,
        ganchoTitulo,
        ganchoTexto: [...factos, fecho].filter(Boolean).join('\n\n'),
        diagnosticoResumo: factos.join(' '),
        factos
    };
}

export function pickGancho({ override, falhas, sinais = {}, lang = 'pt' } = {}) {
    return composeAbertura({ falhas, override, sinais, lang });
}

export function listGanchos() {
    return listFalhas();
}

export function listFalhas() {
    return FALHA_IDS.map((id) => ({
        id,
        grupo: FALHAS[id].grupo || 'geral',
        nome: FALHAS[id].chip,
        nomeCurto: FALHAS[id].chip,
        ganchoTitulo: FALHAS[id].frase,
        ganchoTexto: FALHAS[id].frase
    }));
}

export function listGrupos(lang = 'pt') {
    const outreachLang = normalizeOutreachLang(lang);
    return GRUPOS.map((g) => ({
        id: g.id,
        label: (g.label && (g.label[outreachLang] || g.label.pt)) || g.id
    }));
}

export function listCombinacoes(lang = 'pt') {
    const outreachLang = normalizeOutreachLang(lang);
    return COMBINACOES.map((c) => ({
        id: c.id,
        chip: (c.chip && (c.chip[outreachLang] || c.chip.pt)) || c.id,
        hint: (c.hint && (c.hint[outreachLang] || c.hint.pt)) || '',
        falhas: c.falhas.slice()
    }));
}

export function sinaisFromWizardState(state) {
    const data = (state && state.data) || {};
    const dados = data.dados || {};
    const diag = data.googleDiagnostico || {};
    const presence = data.googlePresence || {};
    const followup = data.followup || {};
    return {
        website: diag.website || dados.website || '',
        website_atual: dados.website_atual || presence.website || '',
        instagram: dados.instagram || presence.instagram || '',
        facebook: dados.facebook || presence.facebook || '',
        telefone: dados.telefone || '',
        whatsapp: dados.whatsapp || '',
        email: dados.email || '',
        morada: dados.morada || '',
        sinaisDeMovimento: followup.sinaisDeMovimento === true,
        fichaComErro: followup.fichaComErro === true,
        siteVelho: followup.siteVelho === true,
        problemaFicha: String(followup.problemaFicha || dados.problemaFicha || '').trim()
    };
}

export function shortGanchoTexto(texto, opts = {}) {
    const full = String(texto || '').trim();
    const limit = Number(opts.limit) > 0 ? Number(opts.limit) : 520;
    if (full && full.length <= limit) return full;
    const factos = Array.isArray(opts.factos)
        ? opts.factos.map((f) => String(f || '').trim()).filter(Boolean)
        : [];
    const fecho = String(opts.fecho || '').trim();
    for (let n = Math.min(2, factos.length); n >= 0; n -= 1) {
        const parts = factos.slice(0, n);
        if (fecho) parts.push(fecho);
        const candidate = parts.join('\n\n').trim();
        if (candidate && candidate.length <= limit) return candidate;
    }
    if (fecho && fecho.length <= limit) return fecho;
    if (factos[0]) {
        return factos[0].length <= limit ? factos[0] : `${factos[0].slice(0, Math.max(0, limit - 1))}…`;
    }
    return full ? `${full.slice(0, Math.max(0, limit - 1))}…` : '';
}
