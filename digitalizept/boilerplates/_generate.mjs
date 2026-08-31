#!/usr/bin/env node
/** One-shot generator for the sem-fotos boilerplates + theme CSS, one per category in CATS below. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contrastTokens } from '../js/demo/colors.js';
import { INPAGE_NAV_SCRIPT } from '../js/demo/inpage-nav.js';
import { checkPalettes } from './check-contrast.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const cssDir = path.join(dir, 'css');
const typesDir = path.join(dir, '../../server/config/business-types');
const typeCache = new Map();

function loadType(id) {
    if (!id) return {};
    if (typeCache.has(id)) return typeCache.get(id);
    const file = path.join(typesDir, `${id}.json`);
    const data = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
    typeCache.set(id, data);
    return data;
}

function mapCtaTarget(target) {
    const t = String(target || '').trim();
    if (t === 'whatsapp') return { href: '#dpl-contactos', hrefKind: 'whatsapp' };
    if (t === 'sms' || t === 'mensagem') return { href: '#dpl-contactos', hrefKind: 'sms' };
    if (t === 'tel') return { href: '#dpl-contactos', hrefKind: 'tel' };
    if (t === 'dpl-mapa' || t === 'maps') return { href: '#dpl-contactos', hrefKind: 'maps' };
    if (t === 'instagram') return { href: '#dpl-redes', hrefKind: 'instagram' };
    if (t === 'facebook') return { href: '#dpl-redes', hrefKind: 'facebook' };
    if (t.startsWith('dpl-')) return { href: `#${t}`, hrefKind: '' };
    return { href: '#dpl-contactos', hrefKind: '' };
}

function secondHeroCta(id) {
    const ctas = loadType(id).ctas_hero;
    if (!Array.isArray(ctas) || !ctas[1]) return '';
    const label = String(ctas[1].label || '').trim();
    if (!label) return '';
    const { href, hrefKind } = mapCtaTarget(ctas[1].target);
    const dp = hrefKind ? ` data-dp-href="${hrefKind}"` : '';
    return `<a class="dpl-btn dpl-btn-ghost" href="${href}"${dp}>${label}</a>`;
}

function heroCtas(id, hrefKind = 'whatsapp') {
    return `<div class="dpl-hero-ctas"><a class="dpl-btn" href="#dpl-contactos" data-dp-copy="hero.cta" data-dp-href="${hrefKind}"></a>${secondHeroCta(id)}</div>`;
}

const I = {
    check: '<path d="M5 13l4 4L19 7"/>',
    star: '<polygon points="12 3 14.8 9.2 21.5 9.8 16.4 14.2 18 21 12 17.5 6 21 7.6 14.2 2.5 9.8 9.2 9.2"/>',
    people: '<path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="3"/><path d="M22 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>',
    pin: '<path d="M12 21s7-6.2 7-12a7 7 0 10-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="9" r="2.2"/>',
    cup: '<path d="M4 8h12v5a5 5 0 01-5 5H9a5 5 0 01-5-5V8z"/><path d="M16 10h2.2A2.8 2.8 0 0119 15.5"/><path d="M8 3v3M12 3v3"/>',
    croissant: '<path d="M4 16c4-1 7-6 8-12 4 3 7 8 8 12-6 3-12 3-16 0z"/><path d="M8 16l2-6"/>',
    leaf: '<path d="M5 19c8-1 13-8 14-16-8 1-13 8-14 16z"/><path d="M8 12c3 0 6-3 7-7"/>',
    clock: '<circle cx="12" cy="12" r="8"/><path d="M12 8v5l3 2"/>',
    drop: '<path d="M12 3s7 8 7 12a7 7 0 11-14 0c0-4 7-12 7-12z"/>',
    spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M18 6l-2.5 2.5M8.5 15.5L6 18"/>',
    face: '<circle cx="12" cy="12" r="8"/><path d="M8.5 10h.01M15.5 10h.01M8.5 15c1.2 1.4 5.8 1.4 7 0"/>',
    hands: '<path d="M8 13V8a1.5 1.5 0 013 0v4"/><path d="M11 12V7a1.5 1.5 0 013 0v5"/><path d="M14 12V8.5a1.5 1.5 0 013 0V14a5 5 0 01-5 5H9a4 4 0 01-4-4v-2"/>',
    wrench: '<path d="M14.7 6.3a4 4 0 015 5L15 16l-4-4 4.7-4.7z"/><path d="M8 13l-5 5 3 3 5-5"/>',
    roller: '<path d="M4 6h10v4H4z"/><path d="M14 8h3v8H8v-3"/><path d="M8 16v3"/>',
    pipe: '<path d="M4 10h8v4H4z"/><path d="M12 12h8"/><path d="M18 9v6"/>',
    plug: '<path d="M9 7v4M15 7v4"/><path d="M7 11h10v3a5 5 0 01-10 0v-3z"/><path d="M12 19v3"/>',
    plant: '<path d="M12 21V10"/><path d="M12 14c-4 0-6-3-6-6 4 0 6 3 6 6z"/><path d="M12 12c4 0 6-3 6-6-4 0-6 3-6 6z"/>',
    broom: '<path d="M12 8v13"/><path d="M8 21h8"/><path d="M7 8h10l-1-5H8z"/>',
    shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
    box: '<path d="M3 8l9-5 9 5-9 5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>',
    ring: '<circle cx="12" cy="13" r="6"/><path d="M9 8l1.5-4h3L15 8"/>',
    necklace: '<path d="M8 4c0 4 4 6 4 10"/><path d="M16 4c0 4-4 6-4 10"/><circle cx="12" cy="16" r="2"/>',
    earring: '<circle cx="12" cy="6" r="2"/><path d="M12 8v4"/><circle cx="12" cy="16" r="3"/>',
    bracelet: '<ellipse cx="12" cy="12" rx="8" ry="5"/>',
    flower: '<path d="M12 20c0-6 4-8 4-12a4 4 0 10-8 0c0 4 4 6 4 12z"/><path d="M8 9c-2-1-4 0-4 2"/><path d="M16 9c2-1 4 0 4 2"/>',
    ribbon: '<path d="M12 21V10"/><path d="M12 10C8 4 4 6 6 10c2 0 5 0 6 3 1-3 4-3 6-3 2-4-2-6-6 0z"/>',
    gift: '<rect x="4" y="10" width="16" height="10" rx="1"/><path d="M4 14h16M12 10v10"/><path d="M12 10c-2-3-5-3-5 0h5"/><path d="M12 10c2-3 5-3 5 0h-5"/>',
    bag: '<path d="M6 8h12l-1 13H7z"/><path d="M9 8V6a3 3 0 016 0v2"/>',
    hanger: '<path d="M12 5a2 2 0 110-4 2 2 0 010 4z"/><path d="M12 5l10 8H2z"/>',
    ruler: '<path d="M4 20L20 4"/><path d="M8 16l2 2M12 12l2 2M16 8l2 2"/>',
    tire: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>',
    brake: '<circle cx="12" cy="12" r="8"/><path d="M7 12h10M12 7v10"/>',
    bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
    oil: '<path d="M12 3s6 7 6 11a6 6 0 11-12 0c0-4 6-11 6-11z"/>',
    vent: '<path d="M4 8h16M4 12h16M4 16h16"/>',
    basket: '<path d="M4 8h16l-1.5 11h-13z"/><path d="M8 8V6a4 4 0 018 0v2"/>',
    bread: '<path d="M4 14c0-5 16-5 16 0v4H4z"/><path d="M7 12v-1M12 11v-1M17 12v-1"/>',
    bottle: '<path d="M9 7V4h6v3l2 3v10H7V10z"/>',
    snow: '<path d="M12 3v18M5 7l14 10M19 7L5 17M4 12h16"/>',
    carrot: '<path d="M12 22c4-6 4-12 0-18-4 6-4 12 0 18z"/><path d="M10 5c2-3 6-3 8-1"/>',
    glasses: '<circle cx="7" cy="13" r="4"/><circle cx="17" cy="13" r="4"/><path d="M11 13h2"/><path d="M3 12h0M21 12h0"/>',
    eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    lens: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/>',
    cal: '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M8 3v4M16 3v4M4 11h16"/>',
    fork: '<path d="M8 3v7M12 3v7M16 3v7M6 10h12v2a6 6 0 01-12 0z"/><path d="M12 18v4"/>',
    wine: '<path d="M8 3h8l-1 8a5 5 0 11-6 0z"/><path d="M12 16v5M9 21h6"/>',
    scissors: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M8.5 7.5L20 18M8.5 16.5L20 6"/>',
    polish: '<path d="M10 3h4v4l2 2v12H8V9l2-2z"/>',
    lipstick: '<path d="M10 8h4l1 3v10h-6V11z"/><path d="M10 8V5l2-2 2 2v3"/>',
    wax: '<path d="M6 14h12v6H6z"/><path d="M8 14V8l4-3 4 3v6"/>',
    needle: '<path d="M4 20l8-8"/><path d="M14 8l2-2 4 4-2 2z"/><path d="M9 15c2 2 4 2 6 0"/>',
    sofa: '<path d="M4 12v6h16v-6"/><path d="M3 12h4v-2a3 3 0 016 0h2a3 3 0 016 0v2h0"/><path d="M6 18v2M18 18v2"/>',
    roll: '<rect x="3" y="6" width="14" height="12" rx="2"/><path d="M17 8a4 4 0 010 8"/>'
};

function icon(name) {
    return `<span class="dpl-icon" aria-hidden="true"><svg viewBox="0 0 24 24">${I[name] || I.check}</svg></span>`;
}

function visual(_n, ratio, mono, extra = '') {
    // Sem fotos: typographic mark only — never data-dp-photo (cold lead, no images).
    return `<div class="dpl-mark ${extra}" style="--dp-ratio: ${ratio}" aria-hidden="true"><span class="dpl-mark-mono" data-fallback-icon="${mono}">${mono}</span></div>`;
}

const ACTION_ICO = {
    maps: '<svg class="dpl-action-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5A2.5 2.5 0 1112 6a2.5 2.5 0 010 5.5z"/></svg>',
    wa: '<svg class="dpl-action-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12.04 2C6.5 2 2 6.49 2 12.02c0 1.77.46 3.45 1.28 4.92L2 22l5.2-1.36A9.98 9.98 0 0012.04 22C17.56 22 22 17.51 22 11.98 22 6.49 17.56 2 12.04 2z"/></svg>',
    sms: '<svg class="dpl-action-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M20 2H4a2 2 0 00-2 2v18l4-4h14a2 2 0 002-2V4a2 2 0 00-2-2z"/></svg>',
    call: '<svg class="dpl-action-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2a1 1 0 011.01-.24 11.36 11.36 0 003.58.57 1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1 11.36 11.36 0 00.57 3.58 1 1 0 01-.24 1.01l-2.21 2.2z"/></svg>',
    ig: '<svg class="dpl-action-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 2h10a5 5 0 015 5v10a5 5 0 01-5 5H7a5 5 0 01-5-5V7a5 5 0 015-5zm5 5a5 5 0 100 10 5 5 0 000-10z"/></svg>',
    fb: '<svg class="dpl-action-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M14 9h3V6h-3c-1.6 0-3 1.4-3 3v2H8v3h3v7h3v-7h3l1-3h-4V9c0-.6.4-1 1-1z"/></svg>'
};

function socialBlock() {
    return `<section class="dpl-section dpl-social" id="dpl-redes" data-dp-social>
    <div class="dpl-wrap">
        <div class="dpl-section-head">
            <p class="dpl-kicker">Acompanhe-nos</p>
            <h2 class="dpl-h2">Explore mais sobre nós nas redes</h2>
            <p class="dpl-lede">Novidades, bastidores e o dia a dia — siga-nos no Facebook e no Instagram.</p>
        </div>
        <div class="dpl-social-row">
            <a class="dpl-social-card dpl-action dpl-btn-fb" href="#dpl-redes" data-dp-href="facebook" data-dp-social-link="facebook" hidden aria-label="Facebook">
                ${ACTION_ICO.fb}
                <span class="dpl-social-kind">Facebook</span>
                <span class="dpl-social-action dpl-action-label">Ver página</span>
            </a>
            <a class="dpl-social-card dpl-action dpl-btn-ig" href="#dpl-redes" data-dp-href="instagram" data-dp-social-link="instagram" hidden aria-label="Instagram">
                ${ACTION_ICO.ig}
                <span class="dpl-social-kind">Instagram</span>
                <span class="dpl-social-action dpl-action-label">Ver perfil</span>
            </a>
        </div>
    </div>
</section>`;
}

function navJs() {
    return `<script data-dp-inpage-nav>
${INPAGE_NAV_SCRIPT}
</script>`;
}


function aliases(tokens) {
    const c = contrastTokens({
        base: tokens.ink,
        destaque: tokens.accent,
        secundaria: tokens.accent2
    }, tokens.bg);
    const accentInk = tokens.accentInk || c.accentInk;
    const accent2Ink = tokens.accent2Ink || c.accent2Ink;
    return `
    --l-paper: var(--bg); --l-ink: var(--ink);
    --l-destaque: var(--accent); --l-secundaria: var(--accent-2);
    --l-base: var(--ink);
    --base: var(--l-base); --destaque: var(--l-destaque); --secundaria: var(--l-secundaria);
    --accent-ink: ${accentInk}; --accent2-ink: ${accent2Ink};
    --accent-solid: ${tokens.accentSolid || c.accentSolid};
    --on-accent: ${c.onAccent}; --on-accent-2: ${c.onAccent2}; --ink-muted: ${c.inkMuted};`;
}

function page(spec, body, extraCss) {
    const { id, title, description, fontsHref, display, bodyFont, tokens, extraRoot = '' } = spec;
    const css = `:root {
    --bg: ${tokens.bg}; --ink: ${tokens.ink}; --accent: ${tokens.accent}; --accent-2: ${tokens.accent2};
    --font-display: ${display}; --font-body: ${bodyFont};
    ${aliases(tokens)}
    ${extraRoot}
}
${extraCss || ''}
`;
    fs.writeFileSync(path.join(cssDir, `${id}.css`), css);
    const html = `<!DOCTYPE html>
<html lang="pt-PT" data-dp-boilerplate="${id}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<meta name="description" content="${description}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:type" content="website">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="${fontsHref}" rel="stylesheet">
<link rel="stylesheet" href="css/dpl-base.css">
<link rel="stylesheet" href="css/${id}.css">
</head>
<body>
${body}
${navJs()}
</body>
</html>
`;
    fs.writeFileSync(path.join(dir, `${id}-sem-fotos.html`), html);
}

function header({ brand, links, cta, extra = '', centered = false }) {
    const nav = links.map((l) => `<a class="dpl-nav-link" href="${l.href}">${l.label}</a>`).join('\n            ');
    const topbarClass = centered ? 'dpl-topbar dpl-hero--centered' : 'dpl-topbar';
    return `<header class="${topbarClass}">
    <a class="dpl-topbar-brand" href="#topo" data-dp-copy="nome">${brand}</a>
    <button class="dpl-nav-toggle" type="button" aria-expanded="false" aria-controls="menu">Menu</button>
    <nav id="menu" class="dpl-nav" aria-label="Secções">
            ${nav}
            ${cta ? `<a class="dpl-btn" href="${cta.href}" data-dp-copy="hero.cta" data-dp-href="${cta.hrefKind || 'whatsapp'}">${cta.label}</a>` : ''}
    </nav>
    ${extra}
</header>`;
}

function footer(brand, note) {
    return `<footer class="dpl-rodape">
    <div class="dpl-wrap">
        <strong class="dpl-topbar-brand" data-dp-copy="nome">${brand}</strong>
        <p>${note}</p>
        <p>{{morada}} · {{cidade}} · <span data-dp-copy="horario">{{horario}}</span></p>
        <p class="dpl-rodape-social" data-dp-social>
            <a href="#dpl-redes" data-dp-href="facebook" data-dp-social-link="facebook" hidden>Facebook</a>
            <a href="#dpl-redes" data-dp-href="instagram" data-dp-social-link="instagram" hidden>Instagram</a>
        </p>
    </div>
</footer>`;
}

function loc(cta) {
    return `<section class="dpl-section dpl-section--muted" id="dpl-contactos">
    <div class="dpl-wrap">
        <div class="dpl-section-head">
            <h2 class="dpl-h2" data-dp-label="contactos">Onde estamos</h2>
            <p class="dpl-lede">{{morada}}, {{cidade}}. <span data-dp-copy="horario">{{horario}}</span></p>
        </div>
        <div class="dpl-contact-actions">
            <a class="dpl-btn dpl-action dpl-btn-maps" href="#dpl-contactos" data-dp-href="maps" aria-label="Como chegar">${ACTION_ICO.maps}<span class="dpl-action-label">${cta}</span></a>
            <a class="dpl-btn dpl-action dpl-btn-wa" href="#dpl-contactos" data-dp-href="whatsapp" hidden aria-label="Enviar WhatsApp">${ACTION_ICO.wa}<span class="dpl-action-label">Enviar WhatsApp</span></a>
            <a class="dpl-btn dpl-action dpl-btn-sms" href="#dpl-contactos" data-dp-href="sms" hidden aria-label="Mensagem">${ACTION_ICO.sms}<span class="dpl-action-label">Mensagem</span></a>
            <a class="dpl-btn dpl-action dpl-btn-call" href="#dpl-contactos" data-dp-href="tel" hidden aria-label="Ligar">${ACTION_ICO.call}<span class="dpl-action-label">Ligar</span></a>
        </div>
    </div>
</section>`;
}

function quotes() {
    return `<section class="dpl-section dpl-section--muted" id="dpl-avaliacoes">
    <div class="dpl-wrap">
        <h2 class="dpl-h2" data-dp-label="avaliacoes">O que dizem</h2>
        <div class="dpl-grid dpl-grid-2" data-dp-list="avaliacoes" style="margin-top:2rem">
            <blockquote class="dpl-quote" data-dp-item hidden><p data-dp-copy="avaliacao.texto"></p><footer data-dp-copy="avaliacao.autor"></footer></blockquote>
        </div>
    </div>
</section>`;
}

function ctaBand(title, btn, hrefKind = 'whatsapp') {
    return `<section class="dpl-cta-band" id="dpl-cta">
    <div class="dpl-wrap">
        <h2 class="dpl-h2">${title}</h2>
        <p class="dpl-cta-band-lede">Prefere ver o nosso dia a dia? Encontra-nos no Facebook e no Instagram.</p>
        <p class="dpl-cta-band-action">
            <a class="dpl-btn dpl-btn-ghost" href="#dpl-contactos" data-dp-copy="hero.cta" data-dp-href="${hrefKind}">${btn}</a>
            <a class="dpl-btn dpl-btn-ghost" href="#dpl-contactos" data-dp-href="whatsapp" hidden>Enviar WhatsApp</a>
            <a class="dpl-btn dpl-btn-ghost" href="#dpl-contactos" data-dp-href="sms" hidden>Mensagem</a>
            <a class="dpl-btn dpl-btn-ghost" href="#dpl-redes" data-dp-href="facebook" data-dp-social-link="facebook" hidden>Facebook</a>
            <a class="dpl-btn dpl-btn-ghost" href="#dpl-redes" data-dp-href="instagram" data-dp-social-link="instagram" hidden>Instagram</a>
        </p>
    </div>
</section>`;
}

function hero({ centered = false, extra = '', hrefKind = 'whatsapp', id = '', className = '' } = {}) {
    const cls = ['dpl-hero', 'dpl-hero--atmosphere', centered ? 'dpl-hero--centered' : '', className].filter(Boolean).join(' ');
    return `<section class="${cls}">
    <div class="dpl-wrap">
        ${extra}
        <p class="dpl-kicker" data-dp-copy="cidade"></p>
        <h1 data-dp-copy="hero.titulo"></h1>
        <p class="dpl-hero-sub" data-dp-copy="hero.subtitulo"></p>
        ${heroCtas(id, hrefKind)}
    </div>
</section>`;
}

function menuList(strongStyle = '') {
    const strong = strongStyle ? ` style="${strongStyle}"` : '';
    return `<ol class="dpl-menu-list" data-dp-list="servicos">
            <li class="dpl-menu-item" data-dp-item hidden>
                <span class="dpl-menu-num" data-dp-copy="servico.n"></span>
                <div>
                    <strong${strong} data-dp-copy="servico.nome"></strong>
                    <p data-dp-copy="servico.descricao"></p>
                </div>
                <span class="dpl-menu-price" data-dp-copy="servico.preco"></span>
            </li>
        </ol>`;
}

function serviceAccordion({ iconHtml = '' } = {}) {
    return `<ul class="dpl-acc" data-dp-list="servicos">
            <li class="dpl-acc-item" data-dp-item hidden>
                <details>
                    <summary>${iconHtml}<span class="dpl-acc-title" data-dp-copy="servico.nome"></span><span class="dpl-menu-price" data-dp-copy="servico.preco"></span></summary>
                    <p class="dpl-acc-body" data-dp-copy="servico.descricao"></p>
                </details>
            </li>
        </ul>`;
}

function serviceCards({ grid = 'dpl-grid-3', itemClass = 'dpl-card', iconHtml = '' } = {}) {
    return `<ul class="dpl-grid ${grid}" data-dp-list="servicos" style="margin-top:2rem">
            <li class="${itemClass}" data-dp-item hidden>
                ${iconHtml}
                <h3 data-dp-copy="servico.nome"></h3>
                <p data-dp-copy="servico.descricao"></p>
            </li>
        </ul>`;
}

function diffs() {
    return `<ul class="dpl-grid dpl-grid-3" data-dp-list="diferenciais">
            <li data-dp-item hidden>${icon('check')}<p data-dp-copy="diferencial.texto"></p></li>
        </ul>`;
}

function trustChips() {
    return `<ul class="dpl-chips" data-dp-list="trust">
            <li class="dpl-badge" data-dp-item hidden data-dp-copy="trust.texto"></li>
        </ul>`;
}

function destaques(tagClass = 'dpl-price-tag') {
    return `<ul class="dpl-chips" data-dp-list="destaques">
            <li class="${tagClass}" data-dp-item hidden data-dp-copy="destaque.texto"></li>
        </ul>`;
}

function sobreBlock(title, visualHtml, extra = '') {
    return `<section class="dpl-section" id="dpl-sobre">
    <div class="dpl-wrap dpl-grid dpl-grid-2">
        <div>
            <h2 class="dpl-h2" data-dp-label="sobre">${title}</h2>
            <p>{{sobre}}</p>
            ${extra}
        </div>
        ${visualHtml}
    </div>
</section>`;
}

const CATS = [
    {
        id: 'generico',
        label: 'Genérico',
        title: 'O seu negócio — perto de si',
        description: 'Serviços locais, horário claro e contacto directo. Sem rodeios.',
        fontsHref: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700;800&display=swap',
        display: '"Inter", system-ui, sans-serif',
        bodyFont: '"Inter", system-ui, sans-serif',
        tokens: { bg: '#FAFAF8', ink: '#17171A', accent: '#2D6A64', accent2: '#17171A' },
        extraCss: '',
        build() {
            return `${header({
                brand: 'O seu negócio',
                links: [
                    { href: '#topo', label: 'Início' },
                    { href: '#dpl-sobre', label: 'Sobre' },
                    { href: '#dpl-servicos', label: 'Serviços' },
                    { href: '#dpl-redes', label: 'Redes' },
                    { href: '#dpl-contactos', label: 'Contactos' }
                ],
                cta: { href: '#dpl-contactos', label: 'Contactar' }
            })}
<main id="topo">
${hero({ id: this.id })}
${sobreBlock('Quem somos', visual(0, '4 / 3', 'GE'))}
<section class="dpl-section" id="dpl-servicos">
    <div class="dpl-wrap">
        <h2 class="dpl-h2" data-dp-label="servicos">Serviços</h2>
        ${serviceCards()}
    </div>
</section>
<section class="dpl-section">
    <div class="dpl-wrap">${diffs()}</div>
</section>
${quotes()}
${socialBlock()}
${loc('Fale connosco')}
${ctaBand('Fale connosco', 'WhatsApp')}
</main>
${footer('O seu negócio', 'Fale connosco ou passe na loja.')}`;
        }
    },
    {
        id: 'cafe-pastelaria',
        label: 'Café / Pastelaria',
        title: 'Café de bairro, feito com tempo',
        description: 'Pastelaria fresca, café bem tirado e o ritmo do bairro.',
        fontsHref: 'https://fonts.googleapis.com/css2?family=Fraunces:wght@400;600&family=Work+Sans:wght@400;500&display=swap',
        display: '"Fraunces", Georgia, serif',
        bodyFont: '"Work Sans", system-ui, sans-serif',
        tokens: { bg: '#F7F1E8', ink: '#2B211B', accent: '#C1622D', accent2: '#8A5A34', accentInk: '#A85527' },
        extraCss: `.dpl-hero h1 { font-weight: 400; }`,
        build() {
            return `${header({
                brand: 'O seu café',
                links: [
                    { href: '#topo', label: 'Início' },
                    { href: '#dpl-servicos', label: 'Menu' },
                    { href: '#dpl-sobre', label: 'Sobre' },
                    { href: '#dpl-redes', label: 'Redes' },
                    { href: '#dpl-contactos', label: 'Contactos' }
                ],
                cta: { href: '#dpl-servicos', label: 'Ver menu', hrefKind: 'maps' }
            })}
<main id="topo">
${hero({ hrefKind: 'maps', id: this.id })}
${sobreBlock('A casa', visual(0, '4 / 3', 'CA'))}
<section class="dpl-section" id="dpl-servicos">
    <div class="dpl-wrap">
        <h2 class="dpl-h2" data-dp-label="servicos">O nosso menu</h2>
        <p class="dpl-lede">${icon('cup')} Cafés · ${icon('croissant')} Pastelaria · ${icon('leaf')} Origem · ${icon('clock')} Horário</p>
        ${menuList()}
        <div style="margin-top:1.5rem">${destaques()}${trustChips()}</div>
    </div>
</section>
<section class="dpl-section dpl-section--muted" id="dpl-galeria">
    <div class="dpl-wrap dpl-grid dpl-grid-4">
        ${[0, 1, 2, 3].map((i) => `<figure>${visual(i, '1 / 1', 'CA')}</figure>`).join('\n        ')}
    </div>
</section>
${quotes()}
${socialBlock()}
${loc('Como chegar')}
${ctaBand('Venha tomar um café connosco.', 'Ver localização', 'maps')}
</main>
${footer('O seu café', 'Passe quando quiser.')}`;
        }
    },
    {
        id: 'restaurante',
        label: 'Restaurante',
        title: 'A mesa, sem pressa',
        description: 'Cozinha portuguesa de sala — menu do dia, pratos da casa e reservas.',
        fontsHref: 'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;0,700;1,500&family=Lora:wght@400;500&display=swap',
        display: '"Playfair Display", Georgia, serif',
        bodyFont: '"Lora", Georgia, serif',
        tokens: { bg: '#16130F', ink: '#F3ECE2', accent: '#C9A24B', accent2: '#2A2419' },
        accent2UsedAsText: false,
        extraCss: `.dpl-hero { min-height: 88vh; display: flex; align-items: center;
  background: radial-gradient(ellipse at 50% 20%, color-mix(in srgb, var(--accent) 16%, transparent), transparent 50%); }
.dpl-hero h1 { font-style: italic; font-weight: 500; }`,
        build() {
            return `${header({
                brand: 'O seu restaurante',
                centered: true,
                links: [
                    { href: '#topo', label: 'Início' },
                    { href: '#dpl-servicos', label: 'Menu' },
                    { href: '#dpl-sobre', label: 'Sobre' },
                    { href: '#dpl-redes', label: 'Redes' },
                    { href: '#dpl-contactos', label: 'Reservas' }
                ],
                cta: { href: '#dpl-contactos', label: 'Reservar' }
            })}
<main id="topo">
${hero({ centered: true, id: this.id })}
${sobreBlock('A casa', visual(0, '3 / 4', 'RE'), `<p>${icon('fork')} ${icon('wine')}</p>`)}
<section class="dpl-section" id="dpl-servicos">
    <div class="dpl-wrap">
        <h2 class="dpl-h2" data-dp-label="servicos">Menu</h2>
        ${menuList('font-family:var(--font-display);font-style:italic')}
        <div style="margin-top:1.5rem">${destaques()}</div>
    </div>
</section>
${quotes()}
${socialBlock()}
${loc('Reservar mesa')}
${ctaBand('Reserve a sua mesa', 'Reservar / WhatsApp')}
</main>
${footer('O seu restaurante', 'Sala aberta para almoço e jantar.')}`;
        }
    },
    {
        id: 'clinica-estetica',
        label: 'Clínica de Estética',
        title: 'Cuidado calmo, resultados claros',
        description: 'Tratamentos de estética com tempo, escuta e um plano à sua medida.',
        fontsHref: 'https://fonts.googleapis.com/css2?family=Cormorant:wght@500;600&family=Karla:wght@400;500&display=swap',
        display: '"Cormorant", Georgia, serif',
        bodyFont: '"Karla", system-ui, sans-serif',
        tokens: { bg: '#FAF8F4', ink: '#2B2B28', accent: '#9CAA8C', accent2: '#D8CDBF', accentInk: '#667556', accent2Ink: '#846E51' },
        extraCss: `.dpl-hero { background: radial-gradient(circle at 80% 20%, color-mix(in srgb, var(--accent) 28%, transparent), transparent 42%); }
.dpl-stat-tile { }`,
        build() {
            return `${header({
                brand: 'A sua clínica',
                links: [
                    { href: '#topo', label: 'Início' },
                    { href: '#dpl-servicos', label: 'Tratamentos' },
                    { href: '#dpl-sobre', label: 'Sobre' },
                    { href: '#dpl-redes', label: 'Redes' },
                    { href: '#dpl-contactos', label: 'Marcações' }
                ],
                cta: { href: '#dpl-contactos', label: 'Marcar consulta' }
            })}
<main id="topo">
${hero({ id: this.id })}
<section class="dpl-section" id="dpl-sobre">
    <div class="dpl-wrap dpl-grid dpl-grid-2">
        ${visual(0, '3 / 4', 'CE')}
        <div>
            <h2 class="dpl-h2" data-dp-label="sobre">A clínica</h2>
            <p>{{sobre}}</p>
        </div>
    </div>
</section>
<section class="dpl-section" id="dpl-servicos">
    <div class="dpl-wrap">
        <h2 class="dpl-h2" data-dp-label="servicos">Tratamentos</h2>
        ${serviceAccordion({ iconHtml: icon('drop') })}
    </div>
</section>
<section class="dpl-section">
    <div class="dpl-wrap">${trustChips()}</div>
</section>
${quotes()}
${socialBlock()}
${loc('Marcar consulta')}
${ctaBand('Marque a sua consulta', 'Marcar')}
</main>
${footer('A sua clínica', 'Marcações com antecedência.')}`;
        }
    },
    {
        id: 'drogaria-ferragens',
        label: 'Drogaria / Ferragens',
        title: 'Tudo para a sua casa e obra',
        description: 'Ferramentas, tintas e o conselho de quem conhece a peça.',
        fontsHref: 'https://fonts.googleapis.com/css2?family=Archivo:wght@500;700&display=swap',
        display: '"Archivo", system-ui, sans-serif',
        bodyFont: '"Archivo", system-ui, sans-serif',
        tokens: { bg: '#F3F1EA', ink: '#23211D', accent: '#C4491F', accent2: '#2E3A46', accentInk: '#BB461E' },
        extraCss: `.dpl-hero { background: var(--accent-2); color: var(--on-accent-2); } .dpl-hero .dpl-btn { background: var(--accent-solid); border-color: var(--accent-solid); color: var(--on-accent); }
.dpl-acc { border-top: 0; }
.dpl-acc-item { background: var(--accent-2); color: var(--on-accent-2); padding: 0 1.4rem; border-bottom: 0; border-radius: 8px; margin-bottom: 10px; }
.dpl-acc-item summary::after, .dpl-acc-item .dpl-menu-price { color: currentColor; border-color: currentColor; }
.dpl-acc-item .dpl-acc-body { color: currentColor; opacity: 0.82; }
.dpl-hero .dpl-icon, .dpl-acc-item .dpl-icon { color: currentColor; }
.dpl-spec { font-family: ui-monospace, monospace; }`,
        build() {
            return `${header({
                brand: 'A sua drogaria',
                links: [
                    { href: '#topo', label: 'Início' },
                    { href: '#dpl-servicos', label: 'Produtos' },
                    { href: '#dpl-sobre', label: 'Serviços' },
                    { href: '#dpl-redes', label: 'Redes' },
                    { href: '#dpl-contactos', label: 'Contactos' }
                ],
                extra: '<a class="dpl-nav-link" href="#dpl-contactos" data-dp-copy="telefone" data-dp-href="tel">{{telefone}}</a>'
            })}
<main id="topo">
${hero({ id: this.id })}
<section class="dpl-section" id="dpl-servicos">
    <div class="dpl-wrap">
        <h2 class="dpl-h2" data-dp-label="servicos">Categorias</h2>
        ${serviceAccordion({ iconHtml: icon('box') })}
    </div>
</section>
<section class="dpl-section" id="dpl-sobre">
    <div class="dpl-wrap">
        <h2 class="dpl-h2" data-dp-label="sobre">Serviços de balcão</h2>
        <p>{{sobre}}</p>
        <div style="margin-top:1.5rem">${trustChips()}${destaques()}</div>
    </div>
</section>
${quotes()}
${socialBlock()}
${loc('Telefonar')}
${ctaBand('Precisa de uma peça hoje?', 'Ligar agora', 'tel')}
</main>
${footer('A sua drogaria', 'Aberto em horário de loja — confirme antes de vir de longe.')}`;
        }
    },
    {
        id: 'joalharia',
        label: 'Joalharia',
        title: 'Peças que se usam todos os dias',
        description: 'Anéis, colares e o ouro que se herda — atelier de visita marcada.',
        fontsHref: 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=Jost:wght@300;400&display=swap',
        display: '"Cormorant Garamond", Georgia, serif',
        bodyFont: '"Jost", system-ui, sans-serif',
        tokens: { bg: '#FBF8F3', ink: '#14110D', accent: '#B08D57', accent2: '#000000', accentInk: '#896D41' },
        extraCss: `h1, h2 { letter-spacing: 0.12em; text-transform: uppercase; font-weight: 500; }
.dpl-case { border: 1px solid var(--accent); padding: 2rem 1rem; background: var(--bg); }
.dpl-hero-inner { border: 1px solid var(--accent); padding: 4rem 2rem; }`,
        build() {
            return `${header({
                brand: 'A sua joalharia',
                centered: true,
                links: [
                    { href: '#topo', label: 'Início' },
                    { href: '#dpl-servicos', label: 'Coleções' },
                    { href: '#dpl-sobre', label: 'Ofício' },
                    { href: '#dpl-redes', label: 'Redes' },
                    { href: '#dpl-contactos', label: 'Visita' }
                ]
            })}
<main id="topo">
<section class="dpl-hero dpl-hero--centered">
    <div class="dpl-wrap">
        <div class="dpl-hero-inner">
            <p class="dpl-kicker" data-dp-copy="cidade"></p>
            <h1 data-dp-copy="hero.titulo"></h1>
            <p class="dpl-hero-sub" data-dp-copy="hero.subtitulo"></p>
            ${heroCtas(this.id, 'maps')}
        </div>
    </div>
</section>
<section class="dpl-section" id="dpl-servicos">
    <div class="dpl-wrap">
        <h2 class="dpl-h2" data-dp-label="servicos">Coleções</h2>
        ${serviceCards({ grid: 'dpl-grid-4', itemClass: 'dpl-case', iconHtml: icon('ring') })}
    </div>
</section>
${sobreBlock('Ofício', `<div class="dpl-hairline" style="padding:1rem">${visual(0, '1 / 1', 'JO')}</div>`)}
${quotes()}
${socialBlock()}
${loc('Marcar visita')}
${ctaBand('Marque uma visita ao nosso atelier.', 'Pedir horário')}
</main>
${footer('A sua joalharia', 'Visitas com marcação.')}`;
        }
    },
    {
        id: 'loja-flores-decoracao',
        label: 'Loja de Flores e Decoração',
        title: 'Ramos para o dia e para a festa',
        description: 'Flores da estação, eventos e o ramo que se leva de mão.',
        fontsHref: 'https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,400;0,600;1,400;1,600&family=Karla:wght@400;500&display=swap',
        display: '"Fraunces", Georgia, serif',
        bodyFont: '"Karla", system-ui, sans-serif',
        tokens: { bg: '#FBF6EC', ink: '#2E2A22', accent: '#7C8B6F', accent2: '#C98A7D', accentInk: '#68745D', accent2Ink: '#AD5948' },
        extraCss: `h1 { font-style: italic; } .dpl-season { min-height: 180px; display:flex; flex-direction:column; justify-content:flex-end; padding:1.2rem; border-radius: 28px; color: var(--on-accent); }
.dpl-season:nth-child(odd){ background: var(--accent);} .dpl-season:nth-child(even){ background: var(--accent-2); color: var(--on-accent-2);}
.dpl-season .dpl-icon { color: currentColor; } `,
        build() {
            return `${header({
                brand: 'A sua florista',
                links: [
                    { href: '#topo', label: 'Início' },
                    { href: '#dpl-servicos', label: 'Coleções' },
                    { href: '#dpl-sobre', label: 'Eventos' },
                    { href: '#dpl-redes', label: 'Redes' },
                    { href: '#dpl-contactos', label: 'Contactos' }
                ],
                cta: { href: '#dpl-contactos', label: 'Encomendar' }
            })}
<main id="topo">
${hero({ extra: icon('flower'), id: this.id })}
<section class="dpl-section" id="dpl-servicos">
    <div class="dpl-wrap">
        <h2 class="dpl-h2" data-dp-label="servicos">Coleções</h2>
        ${serviceCards({ grid: 'dpl-grid-4', itemClass: 'dpl-season dpl-tile--centered', iconHtml: icon('leaf') })}
    </div>
</section>
${sobreBlock('O atelier', visual(0, '4 / 3', 'FL', 'dpl-visual-blob'))}
<section class="dpl-section">
    <div class="dpl-wrap">${destaques()}${trustChips()}</div>
</section>
${quotes()}
${socialBlock()}
${loc('Encomendar')}
${ctaBand('Peça o ramo desta semana', 'WhatsApp')}
</main>
${footer('A sua florista', 'Encomendas até à véspera, quando o mercado deixar.')}`;
        }
    },
    {
        id: 'loja-roupa',
        label: 'Loja de Roupa',
        title: 'A estação, sem ruído',
        description: 'Peças escolhidas com calma. Feminino, masculino e o essencial de cada estação.',
        fontsHref: 'https://fonts.googleapis.com/css2?family=Archivo:wght@700&family=Inter:wght@400;500&display=swap',
        display: '"Archivo", system-ui, sans-serif',
        bodyFont: '"Inter", system-ui, sans-serif',
        tokens: { bg: '#FFFFFF', ink: '#0A0A0A', accent: '#6B6B6B', accent2: '#0A0A0A' },
        extraCss: `h1, h2, .dpl-nav-link { letter-spacing: 0.16em; text-transform: uppercase; }
.dpl-hero { background: #111; color: #fff; min-height: 70vh; display:flex; align-items:center; }
.dpl-look { background: #f3f3f3; padding: 4rem 1rem; }`,
        build() {
            return `${header({
                brand: 'A sua loja',
                links: [
                    { href: '#topo', label: 'Início' },
                    { href: '#dpl-servicos', label: 'Coleção' },
                    { href: '#dpl-sobre', label: 'Sobre' },
                    { href: '#dpl-redes', label: 'Redes' },
                    { href: '#dpl-contactos', label: 'Loja' }
                ]
            })}
<main id="topo">
${hero({ id: this.id })}
<section class="dpl-section" id="dpl-servicos">
    <div class="dpl-wrap">
        <h2 class="dpl-h2" data-dp-label="servicos">Coleção</h2>
        <ul class="dpl-grid dpl-grid-4" data-dp-list="servicos" style="margin-top:2rem; gap: 2rem;">
            <li data-dp-item hidden>
                <figure>${visual(0, '3 / 4', 'RO')}<figcaption data-dp-copy="servico.nome"></figcaption></figure>
            </li>
        </ul>
    </div>
</section>
<section class="dpl-section" id="dpl-sobre">
    <div class="dpl-wrap">
        <p class="dpl-lede">{{sobre}}</p>
        <p>${icon('hanger')} ${icon('ruler')} ${icon('bag')}</p>
    </div>
</section>
<section class="dpl-look">
    <div class="dpl-wrap">${diffs()}</div>
</section>
${socialBlock()}
${loc('Visitar a loja')}
${ctaBand('Passe pela loja', 'Como chegar', 'maps')}
</main>
${footer('A sua loja', 'Horário de rua — confirme feriados.')}`;
        }
    },
    {
        id: 'mecanico-automovel',
        label: 'Mecânico Automóvel',
        title: 'Mecânica de confiança, sem rodeios',
        description: 'Revisões, travões, diagnóstico — oficina clara no preço e no prazo.',
        fontsHref: 'https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=Barlow:wght@400;500&display=swap',
        display: '"Barlow Condensed", system-ui, sans-serif',
        bodyFont: '"Barlow", system-ui, sans-serif',
        tokens: { bg: '#F4F4F2', ink: '#1E1E1E', accent: '#E8542A', accent2: '#4B5257', accentInk: '#C93D16' },
        extraCss: `h1, h2 { text-transform: uppercase; }
.dpl-hero { background: var(--accent-2); color: var(--on-accent-2); position: relative; overflow: hidden; }
.dpl-hero .dpl-icon { color: currentColor; }
.dpl-hero::after { content:""; position:absolute; right:-40px; top:10%; width:220px; height:220px; border:18px solid color-mix(in srgb, var(--accent) 70%, transparent); border-radius:50%; }`,
        build() {
            return `${header({
                brand: 'A sua oficina',
                links: [
                    { href: '#topo', label: 'Início' },
                    { href: '#dpl-servicos', label: 'Serviços' },
                    { href: '#dpl-redes', label: 'Redes' },
                    { href: '#dpl-contactos', label: 'Marcações' }
                ],
                cta: { href: '#dpl-contactos', label: 'Marcar revisão' },
                extra: '<a class="dpl-nav-link" data-dp-copy="telefone" data-dp-href="tel" href="#dpl-contactos">{{telefone}}</a>'
            })}
<main id="topo">
${hero({ id: this.id })}
<section class="dpl-section" id="dpl-servicos">
    <div class="dpl-wrap">
        <h2 class="dpl-h2" data-dp-label="servicos">Serviços</h2>
        ${serviceAccordion({ iconHtml: icon('wrench') })}
    </div>
</section>
<section class="dpl-cta-band">
    <div class="dpl-wrap">${trustChips()}</div>
</section>
${sobreBlock('A oficina', visual(0, '16 / 9', 'ME'))}
${quotes()}
${socialBlock()}
${loc('Marcar / WhatsApp')}
${ctaBand('Marque a revisão', 'Ligar ou WhatsApp')}
</main>
${footer('A sua oficina', 'Marcações de manhã rendem lugar no mesmo dia.')}`;
        }
    },
    {
        id: 'canalizador',
        label: 'Canalizador',
        title: 'O seu canalizador, à porta rápido',
        description: 'Fugas, desentupimentos e instalação de canalizações — com orçamento antes de mexer em nada.',
        fontsHref: 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@500;600;700&display=swap',
        display: '"IBM Plex Sans", system-ui, sans-serif',
        bodyFont: '"IBM Plex Sans", system-ui, sans-serif',
        tokens: { bg: '#EFF3F5', ink: '#12222B', accent: '#1C6E9C', accent2: '#D98A2B', accent2Ink: '#956225' },
        extraCss: `.dpl-hero { background: radial-gradient(ellipse at 15% 10%, color-mix(in srgb, var(--accent) 20%, transparent), transparent 55%); }
.dpl-acc-item summary { font-weight: 600; }`,
        build() {
            return `${header({
                brand: 'O seu canalizador',
                links: [
                    { href: '#topo', label: 'Início' },
                    { href: '#dpl-servicos', label: 'Serviços' },
                    { href: '#dpl-sobre', label: 'Sobre' },
                    { href: '#dpl-redes', label: 'Redes' },
                    { href: '#dpl-contactos', label: 'Contactos' }
                ],
                cta: { href: '#dpl-contactos', label: 'Pedir orçamento' },
                extra: '<a class="dpl-nav-link" data-dp-copy="telefone" data-dp-href="tel" href="#dpl-contactos">{{telefone}}</a>'
            })}
<main id="topo">
${hero({ id: this.id })}
<section class="dpl-section" id="dpl-servicos">
    <div class="dpl-wrap">
        <h2 class="dpl-h2" data-dp-label="servicos">Serviços</h2>
        ${serviceAccordion({ iconHtml: icon('pipe') })}
    </div>
</section>
<section class="dpl-section dpl-section--muted">
    <div class="dpl-wrap">${trustChips()}${destaques()}</div>
</section>
${sobreBlock('Quem somos', visual(0, '4 / 3', 'CA'))}
${quotes()}
${socialBlock()}
${loc('Pedir orçamento')}
${ctaBand('Tem uma fuga? Não espere.', 'WhatsApp / Ligar')}
</main>
${footer('O seu canalizador', 'Ligue ou mande WhatsApp — dizemos quando podemos lá estar.')}`;
        }
    },
    {
        id: 'eletricista',
        label: 'Eletricista',
        title: 'O seu eletricista, sem demoras',
        description: 'Avarias, instalações e certificação elétrica — com segurança e orçamento claro.',
        fontsHref: 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500&display=swap',
        display: '"Space Grotesk", system-ui, sans-serif',
        bodyFont: '"Inter", system-ui, sans-serif',
        tokens: { bg: '#17181B', ink: '#F2EFE6', accent: '#E8B324', accent2: '#C8CDD2' },
        extraCss: `h1, h2 { text-transform: uppercase; letter-spacing: 0.01em; }
.dpl-hero { background: radial-gradient(ellipse at 50% 10%, color-mix(in srgb, var(--accent) 22%, transparent), transparent 55%); }`,
        build() {
            return `${header({
                brand: 'O seu eletricista',
                links: [
                    { href: '#topo', label: 'Início' },
                    { href: '#dpl-servicos', label: 'Serviços' },
                    { href: '#dpl-sobre', label: 'Sobre' },
                    { href: '#dpl-redes', label: 'Redes' },
                    { href: '#dpl-contactos', label: 'Contactos' }
                ],
                cta: { href: '#dpl-contactos', label: 'Pedir orçamento' },
                extra: '<a class="dpl-nav-link" data-dp-copy="telefone" data-dp-href="tel" href="#dpl-contactos">{{telefone}}</a>'
            })}
<main id="topo">
${hero({ id: this.id })}
<section class="dpl-section" id="dpl-servicos">
    <div class="dpl-wrap">
        <h2 class="dpl-h2" data-dp-label="servicos">Serviços</h2>
        ${serviceAccordion({ iconHtml: icon('plug') })}
    </div>
</section>
<section class="dpl-cta-band">
    <div class="dpl-wrap">${trustChips()}</div>
</section>
${sobreBlock('Quem somos', visual(0, '16 / 9', 'EL'))}
${quotes()}
${socialBlock()}
${loc('Pedir orçamento')}
${ctaBand('Avaria elétrica? Fale connosco.', 'WhatsApp / Ligar')}
</main>
${footer('O seu eletricista', 'Ligue ou mande WhatsApp — dizemos quando podemos lá estar.')}`;
        }
    },
    {
        id: 'limpezas',
        label: 'Limpezas',
        title: 'A sua casa ou escritório, sempre em ordem',
        description: 'Limpeza doméstica, de escritórios e pós-obra — equipa de confiança, produtos incluídos.',
        fontsHref: 'https://fonts.googleapis.com/css2?family=Quicksand:wght@600;700&family=Mulish:wght@400;500&display=swap',
        display: '"Quicksand", system-ui, sans-serif',
        bodyFont: '"Mulish", system-ui, sans-serif',
        tokens: { bg: '#F5FAF7', ink: '#1C2A22', accent: '#3F8F6D', accent2: '#2E6B93', accentInk: '#397D61' },
        extraCss: `.dpl-hero { background: radial-gradient(circle at 85% 20%, color-mix(in srgb, var(--accent) 22%, transparent), transparent 45%); }`,
        build() {
            return `${header({
                brand: 'A sua empresa de limpezas',
                links: [
                    { href: '#topo', label: 'Início' },
                    { href: '#dpl-servicos', label: 'Serviços' },
                    { href: '#dpl-sobre', label: 'Sobre' },
                    { href: '#dpl-redes', label: 'Redes' },
                    { href: '#dpl-contactos', label: 'Contactos' }
                ],
                cta: { href: '#dpl-contactos', label: 'Pedir orçamento' }
            })}
<main id="topo">
${hero({ id: this.id })}
<section class="dpl-section" id="dpl-servicos">
    <div class="dpl-wrap">
        <h2 class="dpl-h2" data-dp-label="servicos">Serviços</h2>
        ${serviceCards({ iconHtml: icon('broom') })}
    </div>
</section>
<section class="dpl-section dpl-section--muted">
    <div class="dpl-wrap">${trustChips()}${destaques()}</div>
</section>
${sobreBlock('Quem somos', visual(0, '4 / 3', 'LI'))}
${quotes()}
${socialBlock()}
${loc('Pedir orçamento')}
${ctaBand('Peça uma limpeza esta semana', 'WhatsApp')}
</main>
${footer('A sua empresa de limpezas', 'Mande WhatsApp com o que precisa — combinamos dia e horário.')}`;
        }
    },
    {
        id: 'mercadinho',
        label: 'Mercadinho',
        title: 'O mercado de bairro, todos os dias',
        description: 'Frescos, mercearia e o horário da rua — perto de casa.',
        fontsHref: 'https://fonts.googleapis.com/css2?family=Poppins:wght@600;700&family=Nunito+Sans:wght@400;600&display=swap',
        display: '"Poppins", system-ui, sans-serif',
        bodyFont: '"Nunito Sans", system-ui, sans-serif',
        tokens: { bg: '#FAF6EA', ink: '#23241C', accent: '#3F5B44', accent2: '#D9A441', accent2Ink: '#92691D' },
        extraCss: `.dpl-tile { padding:1.3rem; border-radius:16px; min-height:130px; color: var(--on-accent); }
.dpl-tile:nth-child(odd){ background: var(--accent);} .dpl-tile:nth-child(even){ background: var(--accent-2); color: var(--on-accent-2);}
.dpl-tile .dpl-icon { color: currentColor; } `,
        build() {
            return `${header({
                brand: 'O seu mercadinho',
                links: [
                    { href: '#topo', label: 'Início' },
                    { href: '#dpl-servicos', label: 'Produtos' },
                    { href: '#dpl-sobre', label: 'Sobre' },
                    { href: '#dpl-redes', label: 'Redes' },
                    { href: '#dpl-contactos', label: 'Contactos' }
                ],
                extra: '<span class="dpl-badge" data-dp-copy="horario">{{horario}}</span>'
            })}
<main id="topo">
${hero({ hrefKind: 'maps', id: this.id })}
<section class="dpl-section" id="dpl-servicos">
    <div class="dpl-wrap">
        <h2 class="dpl-h2" data-dp-label="servicos">O que temos</h2>
        ${serviceCards({ itemClass: 'dpl-tile dpl-tile--centered', iconHtml: icon('basket') })}
    </div>
</section>
<section class="dpl-section">
    <div class="dpl-wrap">${destaques()}</div>
</section>
${sobreBlock('Somos da vizinhança', visual(0, '4 / 3', 'MC'))}
${quotes()}
${socialBlock()}
${loc('Como chegar')}
${ctaBand('Venha visitar-nos', 'Ver horário', 'maps')}
</main>
${footer('O seu mercadinho', 'Aberto os dias da rua. Domingos, confirme.')}`;
        }
    },
    {
        id: 'otica',
        label: 'Ótica',
        title: 'Ver bem, escolher com calma',
        description: 'Exames, lentes e armações. Marcação directa, sem pressa na loja.',
        fontsHref: 'https://fonts.googleapis.com/css2?family=Poppins:wght@600;700&family=Inter:wght@400;500&display=swap',
        display: '"Poppins", system-ui, sans-serif',
        bodyFont: '"Inter", system-ui, sans-serif',
        tokens: { bg: '#FFFFFF', ink: '#17233A', accent: '#1B3A5C', accent2: '#F2643B', accent2Ink: '#D73B0E' },
        extraCss: `.dpl-swatch { margin: 0 auto 0.6rem; width: 72px; border-radius: 50%; }
.dpl-hero-art { font-size: 0; }`,
        build() {
            const swatches = [
                ['#171717', 'Preto'],
                ['linear-gradient(135deg,#6b3a1f,#c48a4a)', 'Tartaruga'],
                ['#d9d4cc', 'Transparente'],
                ['linear-gradient(135deg,#b08d57,#f1e3b8)', 'Dourado']
            ];
            return `${header({
                brand: 'A sua ótica',
                links: [
                    { href: '#topo', label: 'Início' },
                    { href: '#dpl-servicos', label: 'Coleção' },
                    { href: '#dpl-sobre', label: 'Serviços' },
                    { href: '#dpl-redes', label: 'Redes' },
                    { href: '#dpl-contactos', label: 'Marcações' }
                ],
                cta: { href: '#dpl-contactos', label: 'Marcar consulta' }
            })}
<main id="topo">
${hero({ extra: `<div class="dpl-hero-art">${icon('glasses')}</div>`, id: this.id })}
<section class="dpl-section" id="dpl-servicos">
    <div class="dpl-wrap">
        <h2 class="dpl-h2" data-dp-label="servicos">Coleção</h2>
        <div class="dpl-grid dpl-grid-4" style="margin-top:2rem">
            ${swatches.map(([bg, n]) => `<div class="dpl-tile--centered"><div class="dpl-swatch" style="background:${bg}"></div><p>${n}</p></div>`).join('\n            ')}
        </div>
        ${serviceCards({ iconHtml: icon('eye') })}
    </div>
</section>
${sobreBlock('A loja', visual(0, '4 / 3', 'OT'))}
${quotes()}
${socialBlock()}
${loc('Marcar consulta')}
${ctaBand('Reserve o exame', 'Marcar')}
</main>
${footer('A sua ótica', 'Marcações pelo telefone ou WhatsApp.')}`;
        }
    },
    {
        id: 'salao-beleza',
        label: 'Salão de Beleza',
        title: 'O seu momento, à sua medida',
        description: 'Cabelo, unhas e maquilhagem — marcação directa, sem lista de espera escondida.',
        fontsHref: 'https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;500&display=swap',
        display: '"DM Serif Display", Georgia, serif',
        bodyFont: '"DM Sans", system-ui, sans-serif',
        tokens: { bg: '#FBF4F2', ink: '#3F2530', accent: '#C97A8B', accent2: '#4A2E3B', accentInk: '#B74E65' },
        extraCss: `.dpl-hero { background-image: radial-gradient(color-mix(in srgb, var(--accent) 35%, transparent) 1.2px, transparent 1.2px); background-size: 16px 16px; }
.dpl-svc { color: var(--on-accent); padding: 1.4rem; border-radius: 18px; min-height: 150px; }
.dpl-svc:nth-child(odd){ background: var(--accent);} .dpl-svc:nth-child(even){ background: var(--accent-2); color: var(--on-accent-2);}
.dpl-svc .dpl-icon { color: currentColor; } `,
        build() {
            return `${header({
                brand: 'O seu salão',
                links: [
                    { href: '#topo', label: 'Início' },
                    { href: '#dpl-servicos', label: 'Serviços' },
                    { href: '#dpl-equipa', label: 'Equipa' },
                    { href: '#dpl-redes', label: 'Redes' },
                    { href: '#dpl-contactos', label: 'Marcações' }
                ],
                cta: { href: '#dpl-contactos', label: 'Marcar' }
            })}
<main id="topo">
${hero({ id: this.id })}
<section class="dpl-section" id="dpl-servicos">
    <div class="dpl-wrap">
        <h2 class="dpl-h2" data-dp-label="servicos">Serviços</h2>
        ${serviceCards({ itemClass: 'dpl-svc', iconHtml: icon('scissors') })}
    </div>
</section>
<section class="dpl-section" id="dpl-equipa">
    <div class="dpl-wrap">
        <h2 class="dpl-h2">Equipa</h2>
        <div class="dpl-grid dpl-grid-3" style="margin-top:2rem">
            ${[0, 1, 2].map((i) => `<article class="dpl-tile--centered">${visual(i, '1 / 1', 'EQ', 'dpl-visual-round')}</article>`).join('\n            ')}
        </div>
    </div>
</section>
${quotes()}
${socialBlock()}
${loc('Marcar')}
${ctaBand('Reserve o seu momento.', 'Marcar')}
</main>
${footer('O seu salão', 'Marcações pelo telefone, WhatsApp ou Instagram.')}`;
        }
    },
    {
        id: 'tapecaria',
        label: 'Tapeçaria',
        title: 'Tecidos que aguentam a casa',
        description: 'Estofos, cortinados e reparações — orçamento claro, oficina local.',
        fontsHref: 'https://fonts.googleapis.com/css2?family=Lora:wght@500;600&family=Karla:wght@400;500&display=swap',
        display: '"Lora", Georgia, serif',
        bodyFont: '"Karla", system-ui, sans-serif',
        tokens: { bg: '#EDE6D8', ink: '#2B241C', accent: '#A6522E', accent2: '#2C4A4A', accentInk: '#A2502D' },
        extraCss: `.dpl-hero { position: relative; }`,
        build() {
            const swatches = [
                ['#cfc6b4', 'Neutros'],
                ['#8a5a34', 'Terrosos'],
                ['#4a6a4a', 'Verdes'],
                ['#2C4A4A', 'Azuis']
            ];
            return `${header({
                brand: 'A sua tapeçaria',
                links: [
                    { href: '#topo', label: 'Início' },
                    { href: '#dpl-servicos', label: 'Serviços' },
                    { href: '#dpl-tecidos', label: 'Tecidos' },
                    { href: '#dpl-redes', label: 'Redes' },
                    { href: '#dpl-contactos', label: 'Contactos' }
                ],
                cta: { href: '#dpl-contactos', label: 'Pedir orçamento' }
            })}
<main id="topo">
${hero({ className: 'dpl-weave', id: this.id })}
<section class="dpl-section" id="dpl-servicos">
    <div class="dpl-wrap">
        <h2 class="dpl-h2" data-dp-label="servicos">Serviços</h2>
        ${serviceAccordion({ iconHtml: icon('needle') })}
    </div>
</section>
<section class="dpl-section dpl-weave" id="dpl-tecidos">
    <div class="dpl-wrap">
        <h2 class="dpl-h2">Tecidos</h2>
        <div class="dpl-grid dpl-grid-4" style="margin-top:2rem">
            ${swatches.map(([c, n]) => `<div><div class="dpl-swatch" style="background:${c}"></div><p>${n}</p></div>`).join('\n            ')}
        </div>
        <p class="dpl-lede" style="margin-top:1rem">${icon('roll')} ${icon('needle')} ${icon('sofa')}</p>
    </div>
</section>
${sobreBlock('O ofício', visual(0, '4 / 3', 'TA'))}
${quotes()}
${socialBlock()}
${loc('Pedir orçamento')}
${ctaBand('Peça o orçamento', 'WhatsApp')}
</main>
${footer('A sua tapeçaria', 'Leve uma foto do móvel — aceleramos o orçamento.')}`;
        }
    }
];

const palettes = CATS.map((c) => ({
    id: c.id,
    bg: c.tokens.bg,
    ink: c.tokens.ink,
    accent: c.tokens.accent,
    accent2: c.tokens.accent2,
    accentInk: c.tokens.accentInk,
    accent2Ink: c.tokens.accent2Ink,
    accentUsedAsText: c.accentUsedAsText,
    accent2UsedAsText: c.accent2UsedAsText
}));
const contrast = checkPalettes(palettes);
if (contrast.hardFail) {
    console.error('Contrast hard-fail; not writing boilerplates.');
    process.exit(1);
}

for (const cat of CATS) {
    page(cat, cat.build(), cat.extraCss);
    console.log('wrote', cat.id);
}

const index = `<!DOCTYPE html>
<html lang="pt-PT">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Boilerplates — Com fotos e Sem fotos</title>
<meta name="robots" content="noindex">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="css/dpl-base.css">
<style>
:root { --bg:#FAFAF8; --ink:#17171A; --accent:#2D6A64; --accent-2:#17171A; --font-display:"Inter",system-ui,sans-serif; --font-body:"Inter",system-ui,sans-serif; }
.dpl-pair { display:grid; grid-template-columns:1fr; gap:12px; }
@media (min-width:768px) { .dpl-pair { grid-template-columns:1fr 1fr; } }
.dpl-card a { display:block; min-height:44px; }
</style>
</head>
<body>
<header class="dpl-topbar"><strong class="dpl-topbar-brand">Digitalize Portugal — exemplos</strong></header>
<main class="dpl-wrap dpl-section">
<h1>${CATS.length} categorias, duas versões</h1>
<p class="dpl-lede">O mesmo negócio. Com fotos é a landing gerada. Sem fotos é o boilerplate tipográfico.</p>
${CATS.map((c) => `<section class="dpl-section" id="${c.id}">
    <h2 class="dpl-h2">${c.label}</h2>
    <div class="dpl-pair">
        <article class="dpl-card"><p class="dpl-badge">Com fotos</p><h3>${c.label}</h3><p>Landing gerada a partir da categoria.</p><a class="dpl-btn" href="preview-com-fotos.html?type=${c.id}">Abrir</a></article>
        <article class="dpl-card"><p class="dpl-badge">Sem fotos</p><h3>${c.label}</h3><p>Página tipográfica, pronta sem fotografias.</p><a class="dpl-btn" href="${c.id}-sem-fotos.html">Abrir</a></article>
    </div>
</section>`).join('\n')}
</main>
</body>
</html>
`;
fs.writeFileSync(path.join(dir, 'index.html'), index);
console.log('wrote index', CATS.length);
