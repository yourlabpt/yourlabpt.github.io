#!/usr/bin/env node
/** One-shot generator for the 13 sem-fotos boilerplates + theme CSS. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contrastTokens } from '../js/demo/colors.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const cssDir = path.join(dir, 'css');

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

function visual(n, ratio, mono, extra = '') {
    return `<div class="dpl-visual ${extra}" data-dp-photo="${n}" style="--dp-ratio: ${ratio}" data-fallback-icon="${mono}"></div>`;
}

function navJs() {
    return `<script>
(function () {
  var btn = document.querySelector('.dpl-nav-toggle');
  var nav = document.querySelector('.dpl-nav');
  if (!btn || !nav) return;
  btn.addEventListener('click', function () {
    var open = nav.classList.toggle('is-open');
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
})();
</script>`;
}

function aliases(tokens) {
    const c = contrastTokens({
        base: tokens.ink,
        destaque: tokens.accent,
        secundaria: tokens.accent2
    }, tokens.bg);
    return `
    --l-paper: var(--bg); --l-ink: var(--ink);
    --l-destaque: var(--accent); --l-secundaria: var(--accent-2);
    --l-base: var(--ink);
    --base: var(--l-base); --destaque: var(--l-destaque); --secundaria: var(--l-secundaria);
    --on-accent: ${c.onAccent}; --on-accent-2: ${c.onAccent2}; --ink-muted: ${c.inkMuted};`;
}

function page(spec, body, extraCss) {
    const { id, label, title, description, fontsHref, display, bodyFont, tokens, extraRoot = '' } = spec;
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

function header({ brand, links, cta, extra = '' }) {
    const nav = links.map((l) => `<a class="dpl-nav-link" href="${l.href}">${l.label}</a>`).join('\n            ');
    return `<header class="dpl-topbar">
    <a class="dpl-topbar-brand" href="#topo" data-dp-copy="nome">${brand}</a>
    <img class="dpl-topbar-logo" data-dp-logo="" alt="">
    <button class="dpl-nav-toggle" type="button" aria-expanded="false" aria-controls="menu">Menu</button>
    <nav id="menu" class="dpl-nav" aria-label="Secções">
            ${nav}
            ${cta ? `<a class="dpl-btn" href="${cta.href}">${cta.label}</a>` : ''}
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
    </div>
</footer>`;
}

function loc(cta) {
    return `<section class="dpl-section" id="dpl-contactos">
    <div class="dpl-wrap">
        <div class="dpl-section-head">
            <h2 class="dpl-h2">Onde estamos</h2>
            <p class="dpl-lede">{{morada}}, {{cidade}}. <span data-dp-copy="horario">{{horario}}</span></p>
        </div>
        <p><a class="dpl-btn" href="#dpl-contactos">${cta}</a></p>
    </div>
</section>`;
}

function quotes(a, b) {
    return `<section class="dpl-section" id="dpl-avaliacoes">
    <div class="dpl-wrap dpl-grid dpl-grid-2">
        <blockquote class="dpl-quote"><p>${a.t}</p><footer>${a.a}</footer></blockquote>
        <blockquote class="dpl-quote"><p>${b.t}</p><footer>${b.a}</footer></blockquote>
    </div>
</section>`;
}

function ctaBand(title, btn, href = '#dpl-contactos') {
    return `<section class="dpl-cta-band" id="dpl-cta">
    <div class="dpl-wrap">
        <h2 class="dpl-h2">${title}</h2>
        <p style="margin-top:1.5rem"><a class="dpl-btn dpl-btn-ghost" href="${href}">${btn}</a></p>
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
        extraRoot: '/* --accent is the token to swap per client */',
        extraCss: '',
        build() {
            return `${header({
                brand: 'O seu negócio',
                links: [
                    { href: '#topo', label: 'Início' },
                    { href: '#dpl-sobre', label: 'Sobre' },
                    { href: '#dpl-servicos', label: 'Serviços' },
                    { href: '#dpl-contactos', label: 'Contactos' }
                ],
                cta: { href: '#dpl-contactos', label: 'Contactar' }
            })}
<main id="topo">
<section class="dpl-hero">
    <div class="dpl-wrap">
        <p class="dpl-badge">Negócio local</p>
        <h1>Aqui ao lado, a tratar do recado.</h1>
        <p class="dpl-hero-sub">Um negócio em {{cidade}}, com atendimento de quem conhece a zona.</p>
        <div class="dpl-hero-ctas">
            <a class="dpl-btn" href="#dpl-contactos">Contactar</a>
            <a class="dpl-btn dpl-btn-ghost" href="#dpl-servicos">Ver serviços</a>
        </div>
    </div>
</section>
<section class="dpl-section" id="dpl-sobre">
    <div class="dpl-wrap dpl-grid dpl-grid-2">
        <div>
            <h2 class="dpl-h2">Quem somos</h2>
            <p class="dpl-lede">{{sobre}}</p>
            <p>Explicamos o que fazemos, o horário e como chegar — sem rodeios.</p>
        </div>
        ${visual(0, '4 / 3', 'GE')}
    </div>
</section>
<section class="dpl-section" id="dpl-servicos">
    <div class="dpl-wrap">
        <h2 class="dpl-h2">Serviços</h2>
        <div class="dpl-grid dpl-grid-3" style="margin-top:2rem">
            <article class="dpl-card">${icon('check')}<h3>Serviço principal</h3><p>O pedido mais frequente, tratado com clareza.</p></article>
            <article class="dpl-card">${icon('star')}<h3>Serviço secundário</h3><p>O extra que as pessoas pedem a seguir.</p></article>
            <article class="dpl-card">${icon('people')}<h3>Atendimento</h3><p>Resposta rápida ao telefone ou à porta.</p></article>
        </div>
    </div>
</section>
<section class="dpl-section">
    <div class="dpl-wrap dpl-grid dpl-grid-3">
        <div>${icon('check')}<p>Atendimento próximo</p></div>
        <div>${icon('star')}<p>Qualidade sem surpresas</p></div>
        <div>${icon('pin')}<p>Perto de si, em {{cidade}}</p></div>
    </div>
</section>
${quotes({ t: 'Atendimento claro e próximo.', a: 'Cliente' }, { t: 'É o sítio da rua. Resolvem.', a: 'Vizinho' })}
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
        tokens: { bg: '#F7F1E8', ink: '#2B211B', accent: '#C1622D', accent2: '#8A5A34' },
        extraCss: `.dpl-hero h1 { font-weight: 400; }`,
        build() {
            const items = [
                ['01', 'Café', 'Expresso, meia de leite e galão como deve ser.', '1,10 €'],
                ['02', 'Nata', 'Folha estaladiça, ainda quente de manhã.', '1,30 €'],
                ['03', 'Torrada', 'Manteiga e o primeiro café do dia.', '1,80 €'],
                ['04', 'Rissol', 'O lanche da tarde, feito cá.', '1,40 €']
            ];
            return `${header({
                brand: 'O seu café',
                links: [
                    { href: '#topo', label: 'Início' },
                    { href: '#dpl-servicos', label: 'Menu' },
                    { href: '#dpl-sobre', label: 'Sobre' },
                    { href: '#dpl-contactos', label: 'Contactos' }
                ],
                cta: { href: '#dpl-servicos', label: 'Ver menu' }
            })}
<main id="topo">
<section class="dpl-hero">
    <div class="dpl-wrap">
        <h1>Café de bairro, feito com tempo.</h1>
        <p class="dpl-hero-sub">Pastelaria fresca, café bem tirado e o ritmo do bairro em {{cidade}}.</p>
        <div class="dpl-hero-ctas"><a class="dpl-btn" href="#dpl-servicos">Ver o menu</a></div>
    </div>
</section>
<section class="dpl-section" id="dpl-sobre">
    <div class="dpl-wrap dpl-grid dpl-grid-2">
        <div>
            <h2 class="dpl-h2">A casa</h2>
            <p>O café da manhã e o bolo do fim-de-semana. Grão escolhido com calma, massa feita no dia.</p>
            <p>{{sobre}}</p>
        </div>
        ${visual(0, '4 / 3', 'CA')}
    </div>
</section>
<section class="dpl-section" id="dpl-servicos">
    <div class="dpl-wrap">
        <h2 class="dpl-h2">O nosso menu</h2>
        <p class="dpl-lede">${icon('cup')} Cafés · ${icon('croissant')} Pastelaria · ${icon('leaf')} Origem · ${icon('clock')} Horário</p>
        <ol class="dpl-menu-list">
            ${items.map(([n, name, d, p]) => `<li class="dpl-menu-item"><span class="dpl-menu-num">${n}</span><div><strong>${name}</strong><p>${d}</p></div><span class="dpl-menu-price">${p}</span></li>`).join('\n            ')}
        </ol>
    </div>
</section>
<section class="dpl-section" id="dpl-galeria">
    <div class="dpl-wrap dpl-grid dpl-grid-4">
        ${['Nata', 'Galão', 'Bolo do dia', 'A esplanada'].map((cap, i) => `<figure>${visual(i, '1 / 1', 'CA')}<figcaption>${cap}</figcaption></figure>`).join('\n        ')}
    </div>
</section>
${quotes({ t: 'A nata ainda quente e o café como deve ser.', a: 'Cliente da manhã' }, { t: 'Venho todas as manhãs. É o meu sítio.', a: 'Vizinho' })}
${loc('Como chegar')}
${ctaBand('Venha tomar um café connosco.', 'Ver localização')}
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
        extraCss: `/* Light variant (unused default): --bg:#FAF6EF; --ink:#1C1712; --accent:#C9A24B; --accent-2:#EFE7D8; */
.dpl-hero { min-height: 88vh; display: flex; align-items: center; text-align: center;
  background: radial-gradient(ellipse at 50% 20%, color-mix(in srgb, var(--accent) 16%, transparent), transparent 50%); }
.dpl-hero h1 { font-style: italic; font-weight: 500; }
.dpl-topbar { justify-content: center; flex-wrap: wrap; }`,
        build() {
            const dishes = [
                ['01', 'Entrada da casa', 'Pão, azeite e o que o mercado trouxe de manhã.', '6 €'],
                ['02', 'Peixe do dia', 'Grelhado, simples, com legumes da época.', '18 €'],
                ['03', 'Arroz de pato', 'O prato que volta à mesa sem se pedir.', '16 €'],
                ['04', 'Sobremesa', 'Doce de colher ou fruta, conforme o dia.', '6 €']
            ];
            return `${header({
                brand: 'O seu restaurante',
                links: [
                    { href: '#topo', label: 'Início' },
                    { href: '#dpl-servicos', label: 'Menu' },
                    { href: '#dpl-sobre', label: 'Sobre' },
                    { href: '#dpl-contactos', label: 'Reservas' }
                ],
                cta: { href: '#dpl-contactos', label: 'Reservar' }
            })}
<main id="topo">
<section class="dpl-hero">
    <div class="dpl-wrap">
        <h1>A mesa, sem pressa.</h1>
        <p class="dpl-hero-sub">Cozinha de sala em {{cidade}}. Almoços, jantares e o prato que já conhecem.</p>
        <div class="dpl-hero-ctas"><a class="dpl-btn" href="#dpl-contactos">Reservar</a></div>
    </div>
</section>
<section class="dpl-section" id="dpl-sobre">
    <div class="dpl-wrap dpl-grid dpl-grid-2">
        <div>
            <h2 class="dpl-h2">A casa</h2>
            <p>{{sobre}}</p>
            <p>${icon('fork')} ${icon('wine')} Serviço de sala, sem teatro.</p>
        </div>
        ${visual(0, '3 / 4', 'RE')}
    </div>
</section>
<section class="dpl-section" id="dpl-servicos">
    <div class="dpl-wrap">
        <h2 class="dpl-h2">Menu</h2>
        <ol class="dpl-menu-list">
            ${dishes.map(([n, name, d, p]) => `<li class="dpl-menu-item"><span class="dpl-menu-num">${n}</span><div><strong style="font-family:var(--font-display);font-style:italic">${name}</strong><p>${d}</p></div><span class="dpl-menu-price">${p}</span></li>`).join('\n            ')}
        </ol>
    </div>
</section>
<section class="dpl-section" style="background:var(--accent-2)">
    <div class="dpl-wrap">
        <blockquote class="dpl-quote"><p>Comemos como em casa — só que alguém já pôs a mesa.</p><footer>Cliente da sala</footer></blockquote>
    </div>
</section>
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
        tokens: { bg: '#FAF8F4', ink: '#2B2B28', accent: '#9CAA8C', accent2: '#D8CDBF' },
        extraCss: `.dpl-hero { background: radial-gradient(circle at 80% 20%, color-mix(in srgb, var(--accent) 28%, transparent), transparent 42%); }`,
        build() {
            const cards = [
                ['drop', 'Limpeza de pele', 'Ritual calmo, pele mais nítida.'],
                ['leaf', 'Tratamentos de rosto', 'Planos curtos, sem promessas a mais.'],
                ['spark', 'Luz e textura', 'Para quem quer um glow discreto.'],
                ['face', 'Consulta de avaliação', 'Começamos por ouvir.'],
                ['hands', 'Corpo', 'Protocolos simples, tempo certo.']
            ];
            return `${header({
                brand: 'A sua clínica',
                links: [
                    { href: '#topo', label: 'Início' },
                    { href: '#dpl-servicos', label: 'Tratamentos' },
                    { href: '#dpl-sobre', label: 'Sobre' },
                    { href: '#dpl-contactos', label: 'Marcações' }
                ],
                cta: { href: '#dpl-contactos', label: 'Marcar consulta' }
            })}
<main id="topo">
<section class="dpl-hero">
    <div class="dpl-wrap">
        <h1>Cuidado calmo, resultados claros.</h1>
        <p class="dpl-hero-sub">Estética em {{cidade}} — sem pressa e sem linguagem de catálogo.</p>
        <div class="dpl-hero-ctas"><a class="dpl-btn" href="#dpl-contactos">Marcar consulta</a></div>
    </div>
</section>
<section class="dpl-section" id="dpl-sobre">
    <div class="dpl-wrap dpl-grid dpl-grid-2">
        ${visual(0, '3 / 4', 'CE')}
        <div>
            <h2 class="dpl-h2">A clínica</h2>
            <p>Trabalhamos com o que a pele pede, não com o que está na moda esta semana.</p>
            <p>{{sobre}}</p>
        </div>
    </div>
</section>
<section class="dpl-section" id="dpl-servicos">
    <div class="dpl-wrap">
        <h2 class="dpl-h2">Tratamentos</h2>
        <div class="dpl-grid dpl-grid-3" style="margin-top:2rem">
            ${cards.map(([ic, n, d]) => `<article class="dpl-card">${icon(ic)}<h3>${n}</h3><p>${d}</p><a class="dpl-nav-link" href="#dpl-contactos">Saber mais</a></article>`).join('\n            ')}
        </div>
    </div>
</section>
<section class="dpl-section" style="background:var(--accent-2)">
    <div class="dpl-wrap dpl-grid dpl-grid-3">
        <div><p class="dpl-stat">12</p><p class="dpl-stat-label">anos de prática</p></div>
        <div><p class="dpl-stat">2 mil</p><p class="dpl-stat-label">clientes acompanhados</p></div>
        <div><p class="dpl-stat">18</p><p class="dpl-stat-label">protocolos activos</p></div>
    </div>
</section>
${quotes({ t: 'Saí a sentir a pele, não a maquilhagem.', a: 'Cliente' }, { t: 'Explicam tudo antes de começar.', a: 'Cliente' })}
${loc('Marcar consulta')}
${ctaBand('Reserve o seu horário', 'Marcar')}
</main>
${footer('A sua clínica', 'Marcações por telefone ou WhatsApp.')}`;
        }
    },
    {
        id: 'drogaria-ferragens',
        label: 'Drogaria / Ferragens',
        title: 'Tudo para a casa e a obra',
        description: 'Ferramentas, tintas, canalização e o conselho de quem conhece o material.',
        fontsHref: 'https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;700;800&display=swap',
        display: '"Archivo", system-ui, sans-serif',
        bodyFont: '"Archivo", system-ui, sans-serif',
        tokens: { bg: '#F3F1EA', ink: '#23211D', accent: '#C4491F', accent2: '#2E3A46' },
        extraCss: `.dpl-hero { background: var(--accent-2); color: var(--on-accent-2); } .dpl-hero .dpl-btn { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }
.dpl-tile { background: var(--accent-2); color: var(--on-accent-2); padding: 1.4rem; border-radius: 8px; min-height: 140px; }
.dpl-hero .dpl-icon, .dpl-tile .dpl-icon { color: currentColor; }
.dpl-spec { font-family: ui-monospace, monospace; }`,
        build() {
            const tiles = [
                ['wrench', 'Ferramentas'], ['roller', 'Tintas'], ['pipe', 'Canalização'],
                ['plug', 'Eletricidade'], ['plant', 'Jardim'], ['broom', 'Limpeza'],
                ['shield', 'Segurança'], ['box', 'Diversos']
            ];
            return `${header({
                brand: 'A sua drogaria',
                links: [
                    { href: '#topo', label: 'Início' },
                    { href: '#dpl-servicos', label: 'Produtos' },
                    { href: '#dpl-sobre', label: 'Serviços' },
                    { href: '#dpl-contactos', label: 'Contactos' }
                ],
                extra: '<a class="dpl-nav-link" href="#dpl-contactos" data-dp-copy="telefone">{{telefone}}</a>'
            })}
<main id="topo">
<section class="dpl-hero">
    <div class="dpl-wrap">
        <h1>Tudo para a sua casa e obra, num só lugar.</h1>
        <p class="dpl-hero-sub">Em {{cidade}}. Pergunte — sabemos o que encaixa.</p>
        <div class="dpl-hero-ctas"><a class="dpl-btn" href="#dpl-servicos">Ver categorias</a></div>
    </div>
</section>
<section class="dpl-section" id="dpl-servicos">
    <div class="dpl-wrap">
        <h2 class="dpl-h2">Categorias</h2>
        <div class="dpl-grid dpl-grid-4" style="margin-top:2rem">
            ${tiles.map(([ic, n]) => `<div class="dpl-tile">${icon(ic)}<strong>${n}</strong></div>`).join('\n            ')}
        </div>
    </div>
</section>
<section class="dpl-section" id="dpl-sobre">
    <div class="dpl-wrap">
        <h2 class="dpl-h2">Serviços de balcão</h2>
        <dl class="dpl-spec dpl-card">
            <dt>Corte de chaves</dt><dd>Enquanto espera</dd>
            <dt>Mistura de tinta</dt><dd>À medida</dd>
            <dt>Aluguer de ferramentas</dt><dd>Ao dia</dd>
        </dl>
    </div>
</section>
<section class="dpl-cta-band">
    <div class="dpl-wrap dpl-grid dpl-grid-2">
        <div><p class="dpl-stat">30</p><p class="dpl-stat-label">anos ao serviço da rua</p></div>
        <div><p class="dpl-stat">80+</p><p class="dpl-stat-label">marcas na prateleira</p></div>
    </div>
</section>
${loc('Telefonar')}
${ctaBand('Precisa de uma peça hoje?', 'Ligar agora')}
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
        tokens: { bg: '#FBF8F3', ink: '#14110D', accent: '#B08D57', accent2: '#000000' },
        extraCss: `h1, h2 { letter-spacing: 0.12em; text-transform: uppercase; font-weight: 500; }
.dpl-topbar { justify-content: center; flex-direction: column; }
.dpl-case { border: 1px solid var(--accent); padding: 2rem 1rem; text-align: center; background: var(--bg); }
.dpl-hero { text-align: center; }
.dpl-hero-inner { border: 1px solid var(--accent); padding: 4rem 2rem; }`,
        build() {
            const cols = [['ring', 'Anéis'], ['necklace', 'Colares'], ['earring', 'Brincos'], ['bracelet', 'Pulseiras']];
            return `${header({
                brand: 'A sua joalharia',
                links: [
                    { href: '#topo', label: 'Início' },
                    { href: '#dpl-servicos', label: 'Coleções' },
                    { href: '#dpl-sobre', label: 'Ofício' },
                    { href: '#dpl-contactos', label: 'Visita' }
                ]
            })}
<main id="topo">
<section class="dpl-hero">
    <div class="dpl-wrap">
        <div class="dpl-hero-inner">
            <h1>Peças quietas, para a vida inteira.</h1>
            <p class="dpl-hero-sub">Atelier em {{cidade}}. Ouro, prata e o ajuste que falta.</p>
        </div>
    </div>
</section>
<section class="dpl-section" id="dpl-servicos">
    <div class="dpl-wrap">
        <h2 class="dpl-h2">Coleções</h2>
        <div class="dpl-grid dpl-grid-4" style="margin-top:2rem">
            ${cols.map(([ic, n]) => `<article class="dpl-case">${icon(ic)}<h3>${n}</h3></article>`).join('\n            ')}
        </div>
    </div>
</section>
<section class="dpl-section" id="dpl-sobre">
    <div class="dpl-wrap dpl-grid dpl-grid-2">
        <div>
            <h2 class="dpl-h2">Ofício</h2>
            <p>Trabalhamos metais com tempo. Uma peça de cada vez, no tamanho certo.</p>
            <p>{{sobre}}</p>
        </div>
        <div class="dpl-hairline" style="padding:1rem">${visual(0, '1 / 1', 'JO')}</div>
    </div>
</section>
<section class="dpl-section" style="text-align:center">
    <blockquote class="dpl-quote"><p>Voltei para o ajuste. Ficou a parecer feito para mim.</p><footer>Cliente</footer></blockquote>
</section>
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
        tokens: { bg: '#FBF6EC', ink: '#2E2A22', accent: '#7C8B6F', accent2: '#C98A7D' },
        extraCss: `h1 { font-style: italic; } .dpl-season { min-height: 180px; display:flex; flex-direction:column; justify-content:flex-end; padding:1.2rem; border-radius: 28px; color: var(--on-accent); }
.dpl-season:nth-child(odd){ background: var(--accent);} .dpl-season:nth-child(even){ background: var(--accent-2); color: var(--on-accent-2);}
.dpl-season .dpl-icon { color: currentColor; } `,
        build() {
            const seasons = [
                ['leaf', 'Primavera'], ['flower', 'Casamentos'], ['ribbon', 'Corporativo'], ['gift', 'Condolências']
            ];
            return `${header({
                brand: 'A sua florista',
                links: [
                    { href: '#topo', label: 'Início' },
                    { href: '#dpl-servicos', label: 'Coleções' },
                    { href: '#dpl-sobre', label: 'Eventos' },
                    { href: '#dpl-contactos', label: 'Contactos' }
                ],
                cta: { href: '#dpl-contactos', label: 'Encomendar' }
            })}
<main id="topo">
<section class="dpl-hero">
    <div class="dpl-wrap">
        ${icon('flower')}
        <h1>Um ramo que parece ter sido pensado para a mesa.</h1>
        <p class="dpl-hero-sub">Flores da estação em {{cidade}}. Do dia-a-dia ao evento.</p>
        <div class="dpl-hero-ctas"><a class="dpl-btn" href="#dpl-contactos">Encomendar</a></div>
    </div>
</section>
<section class="dpl-section" id="dpl-servicos">
    <div class="dpl-wrap">
        <h2 class="dpl-h2">Coleções</h2>
        <div class="dpl-grid dpl-grid-4" style="margin-top:2rem">
            ${seasons.map(([ic, n]) => `<article class="dpl-season">${icon(ic)}<h3>${n}</h3></article>`).join('\n            ')}
        </div>
    </div>
</section>
<section class="dpl-section" id="dpl-sobre">
    <div class="dpl-wrap dpl-grid dpl-grid-2">
        <div>
            <h2 class="dpl-h2">O atelier</h2>
            <p>Compramos de manhã, atamos à tarde. O resto é escuta: cores, orçamento, a ocasião.</p>
            <p>{{sobre}}</p>
        </div>
        ${visual(0, '4 / 3', 'FL', 'dpl-visual-blob')}
    </div>
</section>
<section class="dpl-section">
    <div class="dpl-wrap dpl-grid dpl-grid-4">
        ${[['ribbon', 'Casamentos'], ['gift', 'Aniversários'], ['people', 'Eventos'], ['leaf', 'Funerais']].map(([ic, n]) => `<div>${icon(ic)}<p>${n}</p></div>`).join('\n        ')}
    </div>
</section>
${quotes({ t: 'O ramo chegou fresco e no tom que pedi.', a: 'Cliente' }, { t: 'Trataram o casamento como se fosse o único.', a: 'Noiva' })}
${loc('Encomendar')}
${ctaBand('Peça o ramo desta semana', 'WhatsApp')}
</main>
${footer('A sua florista', 'Encomendas até à véspera, quando o mercado deixar.')}`;
        }
    },
    {
        id: 'loja-roupa',
        label: 'Loja de Roupa',
        title: 'OUTONO / INVERNO',
        description: 'Peças escolhidas com calma. Feminino, masculino e o essencial de cada estação.',
        fontsHref: 'https://fonts.googleapis.com/css2?family=Archivo:wght@700&family=Inter:wght@400;500&display=swap',
        display: '"Archivo", system-ui, sans-serif',
        bodyFont: '"Inter", system-ui, sans-serif',
        tokens: { bg: '#FFFFFF', ink: '#0A0A0A', accent: '#6B6B6B', accent2: '#0A0A0A' },
        extraRoot: '/* --accent is the seasonal token */',
        extraCss: `h1, h2, .dpl-nav-link { letter-spacing: 0.16em; text-transform: uppercase; }
.dpl-hero { background: #111; color: #fff; min-height: 70vh; display:flex; align-items:center; }
.dpl-look { background: #f3f3f3; padding: 4rem 1rem; text-align:center; }`,
        build() {
            const cats = ['Feminino', 'Masculino', 'Acessórios', 'Novidades'];
            return `${header({
                brand: 'A sua loja',
                links: [
                    { href: '#topo', label: 'Início' },
                    { href: '#dpl-servicos', label: 'Coleção' },
                    { href: '#dpl-sobre', label: 'Sobre' },
                    { href: '#dpl-contactos', label: 'Loja' }
                ]
            })}
<main id="topo">
<section class="dpl-hero">
    <div class="dpl-wrap">
        <h1>OUTONO / INVERNO</h1>
        <p class="dpl-hero-sub">A estação, sem ruído. Em {{cidade}}.</p>
    </div>
</section>
<section class="dpl-section" id="dpl-servicos">
    <div class="dpl-wrap">
        <h2 class="dpl-h2">Coleção</h2>
        <div class="dpl-grid dpl-grid-4" style="margin-top:2rem; gap: 2rem;">
            ${cats.map((n, i) => `<figure>${visual(i, '3 / 4', 'RO')}<figcaption>${n}</figcaption></figure>`).join('\n            ')}
        </div>
    </div>
</section>
<section class="dpl-section" id="dpl-sobre">
    <div class="dpl-wrap">
        <p class="dpl-lede">{{sobre}}</p>
        <p>${icon('hanger')} ${icon('ruler')} ${icon('bag')} Peças para vestir, não para fotografar.</p>
    </div>
</section>
<section class="dpl-look">
    <p class="dpl-h2">Menos peças. Melhor corte.</p>
</section>
${loc('Visitar a loja')}
${ctaBand('Passe pela loja', 'Como chegar')}
</main>
${footer('A sua loja', 'Horário de rua — confirme feriados.')}`;
        }
    },
    {
        id: 'mecanico-automovel',
        label: 'Mecânico Automóvel',
        title: 'MECÂNICA DE CONFIANÇA, SEM RODEIOS',
        description: 'Revisões, travões, diagnóstico — oficina clara no preço e no prazo.',
        fontsHref: 'https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=Barlow:wght@400;500&display=swap',
        display: '"Barlow Condensed", system-ui, sans-serif',
        bodyFont: '"Barlow", system-ui, sans-serif',
        tokens: { bg: '#F4F4F2', ink: '#1E1E1E', accent: '#E8542A', accent2: '#4B5257' },
        extraCss: `h1, h2 { text-transform: uppercase; }
.dpl-hero { background: var(--accent-2); color: var(--on-accent-2); position: relative; overflow: hidden; }
.dpl-hero .dpl-icon { color: currentColor; }
.dpl-hero::after { content:""; position:absolute; right:-40px; top:10%; width:220px; height:220px; border:18px solid color-mix(in srgb, var(--accent) 70%, transparent); border-radius:50%; }
.dpl-row { display:grid; grid-template-columns: 2.5rem 1fr; gap: 12px; padding: 14px 0; border-bottom: 1px solid color-mix(in srgb, var(--ink) 12%, transparent); }`,
        build() {
            const rows = [
                ['wrench', 'Revisão geral', 'Óleos, filtros e a lista do construtor.'],
                ['brake', 'Travões', 'Discos, pastilhas, o que se ouve no pedal.'],
                ['tire', 'Pneus', 'Troca, alinhamento, pressão certa.'],
                ['bolt', 'Diagnóstico', 'Electrónica lida, sem adivinhas.'],
                ['vent', 'Ar condicionado', 'Carga e limpeza do circuito.'],
                ['oil', 'Distribuição', 'Quando o prazo chega, avisamos.']
            ];
            return `${header({
                brand: 'A sua oficina',
                links: [
                    { href: '#topo', label: 'Início' },
                    { href: '#dpl-servicos', label: 'Serviços' },
                    { href: '#dpl-contactos', label: 'Marcações' },
                    { href: '#dpl-contactos', label: 'Contactos' }
                ],
                cta: { href: '#dpl-contactos', label: 'Marcar revisão' },
                extra: '<a class="dpl-nav-link" data-dp-copy="telefone" href="#dpl-contactos">{{telefone}}</a>'
            })}
<main id="topo">
<section class="dpl-hero">
    <div class="dpl-wrap">
        <h1>Mecânica de confiança, sem rodeios.</h1>
        <p class="dpl-hero-sub">Oficina em {{cidade}}. Dizemos o que é preciso — e o que não é.</p>
        <div class="dpl-hero-ctas"><a class="dpl-btn" href="#dpl-contactos">Marcar revisão</a></div>
    </div>
</section>
<section class="dpl-section" id="dpl-servicos">
    <div class="dpl-wrap">
        <h2 class="dpl-h2">Serviços</h2>
        ${rows.map(([ic, n, d]) => `<div class="dpl-row">${icon(ic)}<div><strong>${n}</strong><p>${d}</p></div></div>`).join('\n        ')}
    </div>
</section>
<section class="dpl-cta-band">
    <div class="dpl-wrap dpl-grid dpl-grid-3">
        <div><p class="dpl-stat">18</p><p class="dpl-stat-label">anos de bancada</p></div>
        <div><p class="dpl-stat">900</p><p class="dpl-stat-label">viaturas / ano</p></div>
        <div><p class="dpl-stat">4,8</p><p class="dpl-stat-label">avaliação média</p></div>
    </div>
</section>
<section class="dpl-section" id="dpl-sobre">
    <div class="dpl-wrap dpl-grid dpl-grid-2">
        <div>
            <h2 class="dpl-h2">A oficina</h2>
            <p>{{sobre}}</p>
        </div>
        ${visual(0, '16 / 9', 'ME')}
    </div>
</section>
${quotes({ t: 'Orçamento por escrito. Sem sustos no fim.', a: 'Cliente' }, { t: 'Entregaram no dia que disseram.', a: 'Cliente' })}
${loc('Marcar / WhatsApp')}
${ctaBand('Marque a revisão', 'Ligar ou WhatsApp')}
</main>
${footer('A sua oficina', 'Marcações de manhã rendem lugar no mesmo dia.')}`;
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
        tokens: { bg: '#FAF6EA', ink: '#23241C', accent: '#3F5B44', accent2: '#D9A441' },
        extraCss: `.dpl-tile { padding:1.3rem; border-radius:16px; min-height:130px; color: var(--on-accent); }
.dpl-tile:nth-child(odd){ background: var(--accent);} .dpl-tile:nth-child(even){ background: var(--accent-2); color: var(--on-accent-2);}
.dpl-tile .dpl-icon { color: currentColor; } `,
        build() {
            const tiles = [
                ['carrot', 'Frescos'], ['basket', 'Mercearia'], ['bottle', 'Bebidas'],
                ['bread', 'Padaria'], ['broom', 'Limpeza'], ['snow', 'Congelados']
            ];
            return `${header({
                brand: 'O seu mercadinho',
                links: [
                    { href: '#topo', label: 'Início' },
                    { href: '#dpl-servicos', label: 'Produtos' },
                    { href: '#dpl-sobre', label: 'Sobre' },
                    { href: '#dpl-contactos', label: 'Contactos' }
                ],
                extra: '<span class="dpl-badge" data-dp-copy="horario">{{horario}}</span>'
            })}
<main id="topo">
<section class="dpl-hero">
    <div class="dpl-wrap">
        <h1>O seu mercado de bairro, todos os dias.</h1>
        <p class="dpl-hero-sub">{{morada}}, {{cidade}} · <span data-dp-copy="horario">{{horario}}</span></p>
    </div>
</section>
<section class="dpl-section" id="dpl-servicos">
    <div class="dpl-wrap">
        <h2 class="dpl-h2">O que temos</h2>
        <div class="dpl-grid dpl-grid-3" style="margin-top:2rem">
            ${tiles.map(([ic, n]) => `<article class="dpl-tile">${icon(ic)}<h3>${n}</h3></article>`).join('\n            ')}
        </div>
    </div>
</section>
<section class="dpl-section">
    <div class="dpl-wrap" style="display:flex;flex-wrap:wrap;gap:12px">
        <span class="dpl-price-tag">Fruta da época</span>
        <span class="dpl-price-tag">Pão de manhã</span>
        <span class="dpl-price-tag">Encomenda ao balcão</span>
    </div>
</section>
<section class="dpl-section" id="dpl-sobre">
    <div class="dpl-wrap dpl-grid dpl-grid-2">
        <div>
            <h2 class="dpl-h2">Somos da vizinhança</h2>
            <p>{{sobre}}</p>
        </div>
        ${visual(0, '4 / 3', 'MC')}
    </div>
</section>
${loc('Como chegar')}
${ctaBand('Venha visitar-nos', 'Ver horário')}
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
        tokens: { bg: '#FFFFFF', ink: '#17233A', accent: '#1B3A5C', accent2: '#F2643B' },
        extraCss: `.dpl-swatch-wrap { text-align:center; } .dpl-swatch { margin: 0 auto 0.6rem; width: 72px; border-radius: 50%; }
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
                    { href: '#dpl-contactos', label: 'Marcações' }
                ],
                cta: { href: '#dpl-contactos', label: 'Marcar consulta' }
            })}
<main id="topo">
<section class="dpl-hero">
    <div class="dpl-wrap">
        <div class="dpl-hero-art">${icon('glasses')}</div>
        <h1>Ver bem, escolher com calma.</h1>
        <p class="dpl-hero-sub">Ótica em {{cidade}}. Exame, lentes e a armação certa.</p>
        <div class="dpl-hero-ctas"><a class="dpl-btn" href="#dpl-contactos">Marcar consulta</a></div>
    </div>
</section>
<section class="dpl-section" id="dpl-servicos">
    <div class="dpl-wrap">
        <h2 class="dpl-h2">Coleção</h2>
        <div class="dpl-grid dpl-grid-4" style="margin-top:2rem">
            ${swatches.map(([bg, n]) => `<div class="dpl-swatch-wrap"><div class="dpl-swatch" style="background:${bg}"></div><p>${n}</p></div>`).join('\n            ')}
        </div>
    </div>
</section>
<section class="dpl-section" style="background: color-mix(in srgb, var(--accent) 8%, var(--bg))">
    <div class="dpl-wrap dpl-grid dpl-grid-3">
        <div>${icon('eye')}<h3>Exame de vista</h3><p>Tempo para medir, não para vender.</p></div>
        <div>${icon('glasses')}<h3>Lentes graduadas</h3><p>Do dia-a-dia ao progresso.</p></div>
        <div>${icon('lens')}<h3>Lentes de contacto</h3><p>Adaptação acompanhada.</p></div>
    </div>
</section>
<section class="dpl-section" id="dpl-sobre">
    <div class="dpl-wrap dpl-grid dpl-grid-2">
        <div>
            <h2 class="dpl-h2">A loja</h2>
            <p>{{sobre}}</p>
        </div>
        ${visual(0, '4 / 3', 'OT')}
    </div>
</section>
${quotes({ t: 'Acharam a armação sem me pressionar.', a: 'Cliente' }, { t: 'O exame foi explicado passo a passo.', a: 'Cliente' })}
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
        tokens: { bg: '#FBF4F2', ink: '#3F2530', accent: '#C97A8B', accent2: '#4A2E3B' },
        extraCss: `.dpl-hero { background-image: radial-gradient(color-mix(in srgb, var(--accent) 35%, transparent) 1.2px, transparent 1.2px); background-size: 16px 16px; }
.dpl-svc { color: var(--on-accent); padding: 1.4rem; border-radius: 18px; min-height: 150px; }
.dpl-svc:nth-child(odd){ background: var(--accent);} .dpl-svc:nth-child(even){ background: var(--accent-2); color: var(--on-accent-2);}
.dpl-svc .dpl-icon { color: currentColor; } `,
        build() {
            const svcs = [
                ['scissors', 'Cabelo', 'desde 18 €'],
                ['polish', 'Unhas', 'desde 14 €'],
                ['lipstick', 'Maquilhagem', 'desde 25 €'],
                ['face', 'Estética facial', 'desde 30 €'],
                ['wax', 'Depilação', 'desde 8 €']
            ];
            return `${header({
                brand: 'O seu salão',
                links: [
                    { href: '#topo', label: 'Início' },
                    { href: '#dpl-servicos', label: 'Serviços' },
                    { href: '#dpl-equipa', label: 'Equipa' },
                    { href: '#dpl-contactos', label: 'Marcações' }
                ],
                cta: { href: '#dpl-contactos', label: 'Marcar' }
            })}
<main id="topo">
<section class="dpl-hero">
    <div class="dpl-wrap">
        <h1>O seu momento, à sua medida.</h1>
        <p class="dpl-hero-sub">Salão em {{cidade}}. Cabelo, unhas e o tempo que pediu.</p>
        <div class="dpl-hero-ctas"><a class="dpl-btn" href="#dpl-contactos">Marcar</a></div>
    </div>
</section>
<section class="dpl-section" id="dpl-servicos">
    <div class="dpl-wrap">
        <h2 class="dpl-h2">Serviços</h2>
        <div class="dpl-grid dpl-grid-3" style="margin-top:2rem">
            ${svcs.map(([ic, n, p]) => `<article class="dpl-svc">${icon(ic)}<h3>${n}</h3><p>${p}</p></article>`).join('\n            ')}
        </div>
    </div>
</section>
<section class="dpl-section" id="dpl-equipa">
    <div class="dpl-wrap">
        <h2 class="dpl-h2">Equipa</h2>
        <div class="dpl-grid dpl-grid-3" style="margin-top:2rem">
            ${[['AN', 'Ana', 'Cabelo'], ['RI', 'Rita', 'Unhas'], ['MA', 'Marta', 'Maquilhagem']].map(([m, n, s], i) => `<article style="text-align:center">${visual(i, '1 / 1', m, 'dpl-visual-round')}<h3>${n}</h3><p>${s}</p></article>`).join('\n            ')}
        </div>
    </div>
</section>
${quotes({ t: 'Saí a reconhecer-me, só mais arranjada.', a: 'Cliente' }, { t: 'Marcaram-me sem me fazer esperar uma hora.', a: 'Cliente' })}
${loc('Marcar')}
${ctaBand('Reserve o seu momento.', 'Marcar')}
</main>
${footer('O seu salão', 'Marcações pelo telefone ou Instagram.')}`;
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
        tokens: { bg: '#EDE6D8', ink: '#2B241C', accent: '#A6522E', accent2: '#2C4A4A' },
        extraCss: `.dpl-hero { position: relative; }`,
        build() {
            const svcs = [
                ['01', 'Estofo de sofás', 'Estrutura revista, tecido novo.'],
                ['02', 'Cadeiras', 'O conjunto da sala, cadeira a cadeira.'],
                ['03', 'Cortinados', 'Medida da janela, queda certa.'],
                ['04', 'Reparações', 'Uma costura, um molas, um braço.'],
                ['05', 'Tecidos à medida', 'Escolha na parede de amostras.']
            ];
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
                    { href: '#dpl-contactos', label: 'Contactos' }
                ],
                cta: { href: '#dpl-contactos', label: 'Pedir orçamento' }
            })}
<main id="topo">
<section class="dpl-hero dpl-weave">
    <div class="dpl-wrap">
        <h1>Tecidos que aguentam a casa.</h1>
        <p class="dpl-hero-sub">Oficina em {{cidade}}. Estofos, cortinas e o conserto que adia a compra nova.</p>
        <div class="dpl-hero-ctas"><a class="dpl-btn" href="#dpl-contactos">Pedir orçamento</a></div>
    </div>
</section>
<section class="dpl-section" id="dpl-servicos">
    <div class="dpl-wrap">
        <h2 class="dpl-h2">Serviços</h2>
        <ol class="dpl-menu-list">
            ${svcs.map(([n, name, d]) => `<li class="dpl-menu-item"><span class="dpl-menu-num">${n}</span><div><strong>${name}</strong><p>${d}</p></div></li>`).join('\n            ')}
        </ol>
    </div>
</section>
<section class="dpl-section dpl-weave" id="dpl-tecidos">
    <div class="dpl-wrap">
        <h2 class="dpl-h2">Tecidos</h2>
        <div class="dpl-grid dpl-grid-4" style="margin-top:2rem">
            ${swatches.map(([c, n]) => `<div><div class="dpl-swatch" style="background:${c}"></div><p>${n}</p></div>`).join('\n            ')}
        </div>
        <p class="dpl-lede" style="margin-top:1rem">${icon('roll')} ${icon('needle')} ${icon('sofa')} Amostras na oficina — leve o almofadão se quiser comparar.</p>
    </div>
</section>
<section class="dpl-section" id="dpl-sobre">
    <div class="dpl-wrap dpl-grid dpl-grid-2">
        <div>
            <h2 class="dpl-h2">O ofício</h2>
            <p>Desmanchar, reforçar, voltar a vestir. O trabalho demora o tempo da costura, não o do catálogo.</p>
            <p>{{sobre}}</p>
        </div>
        ${visual(0, '4 / 3', 'TA')}
    </div>
</section>
${quotes({ t: 'O sofá parece outro e ficou o mesmo.', a: 'Cliente' }, { t: 'Orçamento claro, prazo cumprido.', a: 'Cliente' })}
${loc('Pedir orçamento')}
${ctaBand('Peça o orçamento', 'WhatsApp')}
</main>
${footer('A sua tapeçaria', 'Leve uma foto do móvel — aceleramos o orçamento.')}`;
        }
    }
];

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
<h1>13 categorias, duas versões</h1>
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
