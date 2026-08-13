// Domain suggestions — fetched from the server after a DNS availability check.
import { apiRequest } from './api.js';
import { getToken } from './auth.js';
import { includesWebsite } from './deal/packages.js';

export async function fetchAvailableDomains(ctx, nomeNegocio, cidade) {
    const qs = new URLSearchParams({
        nome: String(nomeNegocio || '').trim(),
        cidade: String(cidade || '').trim()
    });
    const { response, data } = await apiRequest(`/api/digitalizept/domains?${qs}`, {
        token: getToken()
    });
    if (response.status === 401) {
        if (ctx && typeof ctx.onUnauthorized === 'function') ctx.onUnauthorized();
        return null;
    }
    if (!response.ok) return [];
    return Array.isArray(data.domains) ? data.domains : [];
}

export function ensureDominio(proposta) {
    if (!proposta.dominio || typeof proposta.dominio !== 'object') {
        proposta.dominio = {
            modo: '',
            escolhido: '',
            candidatos: []
        };
    }
    const d = proposta.dominio;
    if (!Array.isArray(d.candidatos)) d.candidatos = [];
    return d;
}

export async function refreshDominioCandidates(ctx, proposta, dados) {
    const d = ensureDominio(proposta);
    const list = await fetchAvailableDomains(ctx, dados && dados.nome_negocio, dados && dados.cidade);
    if (list === null) return d;
    d.candidatos = list;
    if (d.modo === 'sugerido' && d.escolhido && !list.includes(d.escolhido)) {
        d.escolhido = '';
        d.modo = '';
    }
    return d;
}

export function isDominioValid(proposta) {
    // Google-only packages have no site to publish — skip domain.
    if (!includesWebsite(proposta)) return true;
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
