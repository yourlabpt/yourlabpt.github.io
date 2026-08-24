/** Street offer shown on outreach email / WhatsApp 2. Same numbers as the HTML template. */
export const STREET_PRICES = {
    tudo: 490,
    pagina: 190,
    google: 90
};

export const CAMPANHA_PRESETS = [5, 10, 15, 20];

export function clampCampanhaPct(value) {
    const n = Math.round(Number(value) || 0);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(100, n));
}

export function normalizeOffer(raw = {}) {
    return {
        includePrices: raw.includePrices !== false,
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
                ? `VAT not included. Campaign prices. If you start with ${p.google} € or ${p.pagina} €, that amount comes off if you later want everything.`
                : `Sem IVA. Valores da campanha. Se começar pelos ${p.google} € ou ${p.pagina} €, o valor é descontado se depois quiser tudo.`;
        } else {
            precoNota = en
                ? `VAT not included. If you start with ${p.google} € or ${p.pagina} €, that amount comes off if you later want everything.`
                : `Sem IVA. Se começar pelos ${p.google} € ou ${p.pagina} €, o valor é descontado se depois quiser tudo.`;
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
            waLines.push(`*${p.tudo} euros* - everything handled and live in 3 days`);
            waLines.push(`*${p.pagina} euros* - just the page, for you to put live`);
            waLines.push(`*${p.google} euros* - just the Google part`);
            waLines.push(precoNota.replace(/ €/g, ' euros').replace(/VAT not included\. /, 'VAT not included. '));
        } else {
            waLines.push(`*${p.tudo} euros* - tudo tratado e no ar em 3 dias`);
            waLines.push(`*${p.pagina} euros* - só a página, para pôr no ar por si`);
            waLines.push(`*${p.google} euros* - só a parte do Google`);
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
            ? `${campanhaBit} ${p.tudo} euros everything / ${p.pagina} just the page / ${p.google} just Google, VAT not included.`
            : `${campanhaBit} ${p.tudo} euros tudo / ${p.pagina} só a página / ${p.google} só o Google, sem IVA.`;
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
