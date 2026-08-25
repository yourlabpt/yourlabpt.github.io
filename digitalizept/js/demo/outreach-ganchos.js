import { normalizeOutreachLang } from './outreach-lang.js';

export const FALHA_IDS = [
    'maps_sem_whatsapp',
    'maps_telefone_sem_wa',
    'maps_sem_site',
    'maps_sem_email',
    'site_link_errado',
    'site_fraco',
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
    pt: 'Vimos-vos no Google Maps. Dá para ficar mais claro para quem vos procura.',
    en: 'We found you on Google Maps. It can be clearer for the people looking for you.'
};

const TITULO_SEM_NADA = {
    pt: 'Procurámos-vos no Google. Quase não há nada para o cliente perceber o que fazem.',
    en: 'We looked you up on Google. There is almost nothing for a customer to understand what you do.'
};

const FECHO = {
    pt: 'Unir isto num só sítio — perfil Google completo e uma página vossa. Quem é para vocês encontra-vos melhor. Quem não percebe o serviço vê logo e não vos tira tempo. Na YourLab tratamos disto ao vosso lado.',
    en: 'Bring this into one place — a complete Google profile and a page of your own. The right people find you more easily. Anyone who does not understand the service sees that straight away and does not take your time. At YourLab we handle this alongside you.'
};

const FALHAS = {
    maps_sem_whatsapp: {
        chip: 'Sem WhatsApp no Maps',
        frase: 'Estão no Maps, mas não há WhatsApp para marcar.',
        en: { chip: 'No WhatsApp on Maps', frase: 'You are on Maps, but there is no WhatsApp to book with.' }
    },
    maps_telefone_sem_wa: {
        chip: 'Telefone no Maps, sem WhatsApp',
        frase: 'No Maps está o telefone. Não está o WhatsApp para marcar.',
        en: { chip: 'Phone on Maps, no WhatsApp', frase: 'Maps has the phone number. It does not have WhatsApp to book with.' }
    },
    maps_sem_site: {
        chip: 'Sem site no Maps',
        frase: 'No Maps não há um site vosso.',
        en: { chip: 'No website on Maps', frase: 'There is no website of yours on Maps.' }
    },
    maps_sem_email: {
        chip: 'Sem email no Maps',
        frase: 'Não há email no Maps para o cliente escrever.',
        en: { chip: 'No email on Maps', frase: 'There is no email on Maps for a customer to write to.' }
    },
    site_link_errado: {
        chip: 'Site no Maps errado',
        frase: 'O link do site no Maps não leva a vocês.',
        en: { chip: 'Wrong website on Maps', frase: 'The website link on Maps does not take people to you.' }
    },
    site_fraco: {
        chip: 'Site mal feito',
        frase: 'Há um site, mas a informação não chega para o cliente perceber o serviço.',
        en: { chip: 'Weak website', frase: 'There is a website, but it does not tell a customer enough about the service.' }
    },
    redes_desligadas_maps: {
        chip: 'Redes fora do Maps',
        frase: 'As redes aparecem no Google; o Maps não as liga.',
        en: { chip: 'Social not on Maps', frase: 'The social accounts show up on Google; Maps does not connect them.' }
    },
    redes_sem_morada: {
        chip: 'Redes sem morada',
        frase: 'Há redes. Não há morada para o cliente chegar.',
        en: { chip: 'Social, no address', frase: 'There are social accounts. There is no address for a customer to find you.' }
    },
    info_desencontrada: {
        chip: 'IG / FB / Maps diferentes',
        frase: 'Instagram, Facebook e Maps não dizem a mesma coisa.',
        en: { chip: 'IG / FB / Maps disagree', frase: 'Instagram, Facebook and Maps do not say the same thing.' }
    },
    ficha_errada: {
        chip: 'Ficha com erro',
        frase: 'A ficha no Google diz {{problemaFicha}}.',
        en: { chip: 'Listing is wrong', frase: 'The Google listing says {{problemaFicha}}.' }
    },
    sem_nada: {
        chip: 'Quase nada no Google',
        frase: 'Quem vos procura no Google quase não encontra nada.',
        en: { chip: 'Almost nothing on Google', frase: 'Anyone who looks you up on Google finds almost nothing.' }
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
    if (phone && !wa) out.push('maps_telefone_sem_wa');
    else if (!wa) out.push('maps_sem_whatsapp');
    if (!hasWebsite(sinais)) out.push('maps_sem_site');
    else if (siteIsOld(sinais)) out.push('site_fraco');
    if (!filled(sinais.email)) out.push('maps_sem_email');
    if (hasSocial(sinais)) {
        out.push('redes_desligadas_maps');
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
    const titulos = onlySemNada ? TITULO_SEM_NADA : TITULO_MAPS;
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
        nome: FALHAS[id].chip,
        nomeCurto: FALHAS[id].chip,
        ganchoTitulo: FALHAS[id].frase,
        ganchoTexto: FALHAS[id].frase
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

export function shortGanchoTexto(texto) {
    const t = String(texto || '').trim();
    if (!t) return '';
    return t.length <= 480 ? t : '';
}
