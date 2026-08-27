/** Street offer shown on outreach email / WhatsApp 2. Same numbers as the HTML template.
 *
 * Entry is low to ease acceptance; extras stack clearly:
 *   google 89  = Essencial Google + demo (fotos e texto)
 *   tudo 129   = 89 + 40 domínio + configuração Netlify (site no ar)
 *   pagina 159 = 89 + 70 landing personalizada
 */
export const STREET_PRICES = {
    google: 89,
    tudo: 129,
    pagina: 159
};

export const STREET_EXTRAS = {
    dominioHosting: 40,
    landingCustom: 70
};

export const CAMPANHA_PRESETS = [5, 10, 15, 20];

export function clampCampanhaPct(value) {
    const n = Math.round(Number(value) || 0);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(100, n));
}

// Cold leads carry no amounts: a number without context always reads as expensive.
export function normalizeOffer(raw = {}) {
    return {
        includePrices: raw.includePrices === true,
        campanhaPct: clampCampanhaPct(raw.campanhaPct),
        campanhaShowPrices: raw.campanhaShowPrices !== false
    };
}

export function showPriceBlock(offer) {
    const o = normalizeOffer(offer);
    return o.includePrices || (o.campanhaPct > 0 && o.campanhaShowPrices);
}

export function showCampaignBlock(offer) {
    return normalizeOffer(offer).campanhaPct > 0;
}

export function pricesAreDiscounted(offer) {
    const o = normalizeOffer(offer);
    return o.campanhaPct > 0 && o.campanhaShowPrices && showPriceBlock(o);
}

function euro(list, pct) {
    if (!pct) return list;
    return Math.round(list * (100 - pct) / 100);
}

export function offerPrices(offer) {
    const o = normalizeOffer(offer);
    const pct = pricesAreDiscounted(o) ? o.campanhaPct : 0;
    return {
        tudo: euro(STREET_PRICES.tudo, pct),
        pagina: euro(STREET_PRICES.pagina, pct),
        google: euro(STREET_PRICES.google, pct),
        tudoLista: STREET_PRICES.tudo,
        paginaLista: STREET_PRICES.pagina,
        googleLista: STREET_PRICES.google
    };
}

function isEn(lang) {
    return String(lang || '').trim().toLowerCase() === 'en';
}

export function offerCopy(offer, lang = 'pt') {
    const o = normalizeOffer(offer);
    const p = offerPrices(o);
    const en = isEn(lang);
    const showPrecos = showPriceBlock(o);
    const showCampanha = showCampaignBlock(o);
    const showPrecoAntigo = pricesAreDiscounted(o);

    let campanhaTitulo = '';
    let campanhaLinha = '';
    if (showCampanha) {
        campanhaTitulo = en ? 'Campaign' : 'Campanha';
        if (showPrecoAntigo) {
            campanhaLinha = en
                ? `${o.campanhaPct}% off — the amounts below already include this discount.`
                : `${o.campanhaPct}% de desconto — os valores em baixo já incluem esta campanha.`;
        } else if (showPrecos) {
            campanhaLinha = en
                ? `${o.campanhaPct}% off on this conversation. The amounts below are the list prices.`
                : `${o.campanhaPct}% de desconto nesta conversa. Os valores em baixo são de tabela.`;
        } else {
            campanhaLinha = en
                ? `${o.campanhaPct}% off on this conversation. We talk numbers when we meet.`
                : `${o.campanhaPct}% de desconto nesta conversa. Falamos dos valores na reunião.`;
        }
    }

    let precoNota = '';
    if (showPrecos) {
        if (showPrecoAntigo) {
            precoNota = en
                ? `VAT not included. Campaign prices. Start at ${p.google} €; +${STREET_EXTRAS.dominioHosting} € puts it live with domain/Netlify; +${STREET_EXTRAS.landingCustom} € is a custom landing.`
                : `Sem IVA. Valores da campanha. Começa nos ${p.google} €; +${STREET_EXTRAS.dominioHosting} € põe no ar com domínio/Netlify; +${STREET_EXTRAS.landingCustom} € é landing personalizada.`;
        } else {
            precoNota = en
                ? `VAT not included. Start at ${p.google} € (Google + demo). +${STREET_EXTRAS.dominioHosting} € = live with domain/Netlify (${p.tudo} €). +${STREET_EXTRAS.landingCustom} € = custom landing (${p.pagina} €).`
                : `Sem IVA. Começa nos ${p.google} € (Google + demo). +${STREET_EXTRAS.dominioHosting} € = no ar com domínio/Netlify (${p.tudo} €). +${STREET_EXTRAS.landingCustom} € = landing personalizada (${p.pagina} €).`;
        }
    }

    const waLines = [];
    if (showCampanha) {
        waLines.push(en
            ? `*Campaign: ${o.campanhaPct}% off*`
            : `*Campanha: ${o.campanhaPct}% de desconto*`);
    }
    if (showPrecos) {
        if (en) {
            waLines.push(`*${p.google} euros* - Google + demo (photos and text)`);
            waLines.push(`*${p.tudo} euros* - live with domain + Netlify (+${STREET_EXTRAS.dominioHosting} €)`);
            waLines.push(`*${p.pagina} euros* - custom landing (+${STREET_EXTRAS.landingCustom} €)`);
            waLines.push(precoNota.replace(/ €/g, ' euros').replace(/VAT not included\. /, 'VAT not included. '));
        } else {
            waLines.push(`*${p.google} euros* - Google + demo (fotos e texto)`);
            waLines.push(`*${p.tudo} euros* - no ar com domínio + Netlify (+${STREET_EXTRAS.dominioHosting} euros)`);
            waLines.push(`*${p.pagina} euros* - landing personalizada (+${STREET_EXTRAS.landingCustom} euros)`);
            waLines.push(precoNota.replace(/ €/g, ' euros').replace(/Sem IVA\. /, 'Sem IVA. '));
        }
    }
    const blocoPrecosWa = waLines.length ? `\n\n${waLines.join('\n')}\n` : '\n\n';

    let fechoPreco = '';
    if (showCampanha && !showPrecos) {
        fechoPreco = en
            ? ` Campaign: ${o.campanhaPct}% off.`
            : ` Campanha de ${o.campanhaPct}%.`;
    } else if (showPrecos) {
        const campanhaBit = showCampanha
            ? (en ? ` Campaign ${o.campanhaPct}%.` : ` Campanha de ${o.campanhaPct}%.`)
            : '';
        fechoPreco = en
            ? `${campanhaBit} ${p.google} euros Google+demo / ${p.tudo} live with domain / ${p.pagina} custom landing, VAT not included.`
            : `${campanhaBit} ${p.google} euros Google+demo / ${p.tudo} no ar com domínio / ${p.pagina} landing personalizada, sem IVA.`;
    }

    return {
        ...o,
        showPrecos,
        showCampanha,
        showPrecoAntigo,
        ...p,
        campanhaTitulo,
        campanhaLinha,
        precoNota,
        blocoPrecosWa,
        fechoPreco
    };
}
