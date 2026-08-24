import { normalizeOutreachLang } from './outreach-lang.js';

export const GANCHO_IDS = ['A', 'B', 'C', 'D', 'E'];

export const GANCHO_NOME_CURTO = {
    A: 'Sem nada',
    B: 'Só redes',
    C: 'Site velho',
    D: 'Cheio de trabalho',
    E: 'Ficha errada'
};

export const OUTREACH_GANCHOS = {
    A: {
        nome: 'Sem nada',
        ganchoTitulo: 'Quando alguém vos recomenda, o que é que a pessoa encontra?',
        ganchoTexto: 'Hoje a recomendação não acaba no "vai lá que é bom" — acaba no Google. Se não houver nada, morre ali. E é pena, porque o trabalho fala por si.',
        en: {
            ganchoTitulo: 'When someone recommends you, what does that person find?',
            ganchoTexto: 'Today a recommendation does not end with “go there, it is good” — it ends on Google. If there is nothing, it dies there. And that is a pity, because the work speaks for itself.'
        }
    },
    B: {
        nome: 'Só redes sociais',
        ganchoTitulo: 'Facebook não é nosso, a vossa história também devia ser vossa.',
        ganchoTexto: 'A conta, os seguidores e as fotografias estão em casa alheia — basta um bloqueio para desaparecer tudo. E ninguém escreve "{{oQueFaz}} em {{zona}}" no Facebook. Escreve no Google.',
        en: {
            ganchoTitulo: 'Facebook is not ours. Your story should be yours too.',
            ganchoTexto: 'The account, the followers and the photos sit in someone else’s house — one block and it all disappears. And nobody types “{{oQueFaz}} in {{zona}}” on Facebook. They type it on Google.'
        }
    },
    C: {
        nome: 'Site velho',
        ganchoTitulo: 'Um site abandonado diz mais sobre um negócio do que site nenhum.',
        ganchoTexto: 'Lento, com informação de há anos e impossível de ler no telemóvel — quem lá chega conclui que a casa fechou. E vocês estão bem vivos.',
        en: {
            ganchoTitulo: 'An abandoned website says more about a business than no website at all.',
            ganchoTexto: 'Slow, with years-old information and impossible to read on a phone — anyone who lands there thinks the place has closed. And you are very much open.'
        }
    },
    D: {
        nome: 'Cheio de trabalho',
        ganchoTitulo: 'Não é para ter mais clientes. É para ter menos telefonemas.',
        ganchoTexto: 'Estão abertos? Fazem isto? Quanto custa? Dá para estacionar? Aceitam MB WAY? São as mesmas cinco perguntas todos os dias, sempre no pior momento. Escritas uma vez, respondem-se sozinhas.',
        en: {
            ganchoTitulo: 'This is not about more customers. It is about fewer phone calls.',
            ganchoTexto: 'Are you open? Do you do this? How much is it? Is there parking? Do you take MB WAY? The same five questions every day, always at the worst moment. Written once, they answer themselves.'
        }
    },
    E: {
        nome: 'Ficha do Google errada',
        ganchoTitulo: 'Há gente a aparecer à vossa porta à hora errada.',
        ganchoTexto: 'A ficha no Google diz {{problemaFicha}}. Quem procura acredita no que lá está — e quem chega a uma porta fechada raramente volta a tentar.',
        en: {
            ganchoTitulo: 'People are showing up at your door at the wrong time.',
            ganchoTexto: 'Google says {{problemaFicha}}. People believe what they read — and someone who finds a closed door rarely tries again.'
        }
    }
};

export function normalizeGanchoId(id) {
    const letter = String(id || '').trim().toUpperCase();
    return GANCHO_IDS.includes(letter) ? letter : '';
}

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

export function listGanchos() {
    return GANCHO_IDS.map((id) => ({
        id,
        nome: OUTREACH_GANCHOS[id].nome,
        nomeCurto: GANCHO_NOME_CURTO[id],
        ganchoTitulo: OUTREACH_GANCHOS[id].ganchoTitulo,
        ganchoTexto: OUTREACH_GANCHOS[id].ganchoTexto
    }));
}

export function pickGancho({ override, sinais = {}, lang = 'pt' } = {}) {
    let id = normalizeGanchoId(override);
    if (!id) {
        if (sinais.sinaisDeMovimento === true) id = 'D';
        else if (sinais.fichaComErro === true && filled(sinais.problemaFicha)) id = 'E';
        else if (siteIsOld(sinais)) id = 'C';
        else if (!hasWebsite(sinais) && hasSocial(sinais)) id = 'B';
        else id = 'A';
    }
    if (id === 'E' && !filled(sinais.problemaFicha)) id = 'A';
    const hook = OUTREACH_GANCHOS[id] || OUTREACH_GANCHOS.A;
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
        sinaisDeMovimento: followup.sinaisDeMovimento === true,
        fichaComErro: followup.fichaComErro === true,
        siteVelho: followup.siteVelho === true,
        problemaFicha: String(followup.problemaFicha || dados.problemaFicha || '').trim()
    };
}

export function shortGanchoTexto(texto) {
    const t = String(texto || '').trim();
    if (!t) return '';
    return t.length <= 220 ? t : '';
}
