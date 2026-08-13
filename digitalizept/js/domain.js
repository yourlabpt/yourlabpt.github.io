// Domain suggestions for the door-to-door pitch. Three public options from the
// shopfront name; if none fit, the client buys their own and we email a ZIP.

function slugPart(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '')
        .slice(0, 28);
}

export function suggestDomains(nomeNegocio, cidade) {
    const base = slugPart(nomeNegocio) || 'negocio';
    const city = slugPart(cidade);
    const candidates = [
        `${base}.pt`,
        city ? `${base}-${city}.pt` : `${base}online.pt`,
        `${base}.com`
    ];
    return [...new Set(candidates)].slice(0, 3);
}

export function ensureDominio(proposta, dados) {
    if (!proposta.dominio || typeof proposta.dominio !== 'object') {
        proposta.dominio = {
            modo: '',
            escolhido: '',
            candidatos: []
        };
    }
    const d = proposta.dominio;
    const fresh = suggestDomains(dados && dados.nome_negocio, dados && dados.cidade);
    // Refresh suggestions when the business name changed since last visit.
    if (!Array.isArray(d.candidatos) || d.candidatos.length !== 3
        || d.candidatos.some((v, i) => v !== fresh[i])) {
        d.candidatos = fresh;
        if (d.modo === 'sugerido' && d.escolhido && !fresh.includes(d.escolhido)) {
            d.escolhido = '';
        }
    }
    return d;
}

export function isDominioValid(proposta) {
    const d = proposta && proposta.dominio;
    if (!d) return false;
    if (d.modo === 'sugerido') return Boolean(d.escolhido);
    if (d.modo === 'proprio') return true;
    return false;
}

export function dominioContractLines(dominio) {
    if (!dominio) return [];
    if (dominio.modo === 'sugerido' && dominio.escolhido) {
        return [
            `Domínio proposto e a registar: ${dominio.escolhido}.`,
            'O domínio fica em nome do cliente.'
        ];
    }
    if (dominio.modo === 'proprio') {
        return [
            'O cliente compra e gere o próprio domínio.',
            'A YourLab entrega o website em ficheiro ZIP por email; o cliente publica quando quiser, ou pede ajuda separada para apontar o domínio.'
        ];
    }
    return [];
}
