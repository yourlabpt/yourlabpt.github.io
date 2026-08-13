/**
 * Domain suggestions for Digitalize Portugal — DNS lookup to skip names that
 * already resolve. Not a registrar WHOIS; good enough for a door-to-door pitch.
 */
const dns = require('dns').promises;

function slugPart(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '')
        .slice(0, 24);
}

function buildDomainCandidates(nomeNegocio, cidade) {
    const base = slugPart(nomeNegocio) || 'negocio';
    const city = slugPart(cidade);
    const roots = new Set([base]);

    if (city) {
        roots.add(`${base}${city}`.slice(0, 24));
        roots.add(`${base}-${city}`.slice(0, 24));
    }
    roots.add(`${base}online`.slice(0, 24));
    roots.add(`${base}loja`.slice(0, 24));
    roots.add(`${base}pt`.slice(0, 24));
    roots.add(`o${base}`.slice(0, 24));
    roots.add(`${base}24`.slice(0, 24));
    roots.add(`${base}shop`.slice(0, 24));

    const tlds = ['.pt', '.com'];
    const out = [];
    roots.forEach((root) => {
        tlds.forEach((tld) => {
            const domain = `${root}${tld}`;
            if (domain.length >= 5 && /^[a-z0-9][a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) {
                out.push(domain);
            }
        });
    });
    return [...new Set(out)];
}

function hasDnsPresence(result) {
    if (result == null) return false;
    if (Array.isArray(result)) return result.length > 0;
    if (typeof result === 'object') return true;
    return false;
}

async function isDomainRegistered(domain) {
    const name = String(domain || '').trim().toLowerCase();
    if (!name || name.length > 253) return true;

    const probes = [
        dns.resolve4(name),
        dns.resolve6(name),
        dns.resolveNs(name),
        dns.resolveMx(name),
        dns.resolveTxt(name),
        dns.resolveCname(name),
        dns.resolveSoa(name)
    ];

    const results = await Promise.allSettled(probes);
    return results.some((r) => r.status === 'fulfilled' && hasDnsPresence(r.value));
}

async function findAvailableDomains(nomeNegocio, cidade, { limit = 3, maxChecks = 28 } = {}) {
    const candidates = buildDomainCandidates(nomeNegocio, cidade);
    const available = [];
    let checked = 0;

    for (const domain of candidates) {
        if (available.length >= limit) break;
        if (checked >= maxChecks) break;
        checked += 1;
        // eslint-disable-next-line no-await-in-loop — sequential to avoid resolver storms
        const taken = await isDomainRegistered(domain);
        if (!taken) available.push(domain);
    }

    return { domains: available, checked, candidates: candidates.length };
}

module.exports = {
    slugPart,
    buildDomainCandidates,
    isDomainRegistered,
    findAvailableDomains
};
