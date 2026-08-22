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
        ganchoTexto: 'Hoje a recomendação não acaba no "vai lá que é bom" — acaba no Google. Se não houver nada, morre ali. E é pena, porque o trabalho fala por si.'
    },
    B: {
        nome: 'Só redes sociais',
        ganchoTitulo: 'O Instagram é da Meta. A vossa história também devia ser vossa.',
        ganchoTexto: 'A conta, os seguidores e as fotografias estão em casa alheia — basta um bloqueio para desaparecer tudo. E ninguém escreve "{{oQueFaz}} em {{zona}}" no Instagram. Escreve no Google.'
    },
    C: {
        nome: 'Site velho',
        ganchoTitulo: 'Um site abandonado diz mais sobre um negócio do que site nenhum.',
        ganchoTexto: 'Lento, com informação de há anos e impossível de ler no telemóvel — quem lá chega conclui que a casa fechou. E vocês estão bem vivos.'
    },
    D: {
        nome: 'Cheio de trabalho',
        ganchoTitulo: 'Não é para ter mais clientes. É para ter menos telefonemas.',
        ganchoTexto: 'Estão abertos? Fazem isto? Quanto custa? Dá para estacionar? Aceitam MB WAY? São as mesmas cinco perguntas todos os dias, sempre no pior momento. Escritas uma vez, respondem-se sozinhas.'
    },
    E: {
        nome: 'Ficha do Google errada',
        ganchoTitulo: 'Há gente a aparecer à vossa porta à hora errada.',
        ganchoTexto: 'A ficha no Google diz {{problemaFicha}}. Quem procura acredita no que lá está — e quem chega a uma porta fechada raramente volta a tentar.'
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

export function pickGancho({ override, sinais = {} } = {}) {
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
    return {
        id,
        nome: hook.nome,
        nomeCurto: GANCHO_NOME_CURTO[id] || hook.nome,
        ganchoTitulo: hook.ganchoTitulo,
        ganchoTexto: hook.ganchoTexto
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
