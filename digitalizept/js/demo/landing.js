// Renders the live demo landing from state: one engine, archetype + category
// config drive sections, CTAs, and typography. Looks like a real site, not a template.

import {
    destaqueItems,
    instagramHref,
    isYes,
    mapsHref,
    marcaItems,
    rotulo,
    splitItems,
    telHref,
    trustChips,
    whatsappHref
} from './boilerplate.js';
import { applyLogoMatStyle, sampleLogoMat } from './logo-mat.js';

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
}

function section(id, className) {
    const s = el('section', `dpl-section ${className}`);
    if (id) s.id = id;
    return s;
}

function sectionTitle(text) {
    const wrap = el('div', 'dpl-section-head');
    wrap.appendChild(el('h2', 'dpl-h2', text));
    return wrap;
}

function svgIcon(paths, viewBox = '0 0 24 24') {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', viewBox);
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    paths.forEach((d) => {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', d);
        path.setAttribute('fill', 'currentColor');
        svg.appendChild(path);
    });
    return svg;
}

function phoneIcon() {
    return svgIcon([
        'M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2a1 1 0 011.01-.24 11.36 11.36 0 003.58.57 1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1 11.36 11.36 0 00.57 3.58 1 1 0 01-.24 1.01l-2.21 2.2z'
    ]);
}

function whatsappIcon() {
    return svgIcon([
        'M17.47 14.38c-.28-.14-1.64-.81-1.89-.9-.25-.09-.44-.14-.62.14-.18.28-.72.9-.88 1.08-.16.18-.32.2-.6.07-.28-.14-1.18-.44-2.25-1.39-.83-.74-1.39-1.65-1.55-1.93-.16-.28-.02-.43.12-.57.13-.13.28-.32.42-.48.14-.16.18-.28.28-.46.09-.18.05-.34-.02-.48-.07-.14-.62-1.49-.85-2.04-.22-.53-.45-.46-.62-.47h-.53c-.18 0-.48.07-.73.34-.25.28-.96.94-.96 2.29s.98 2.65 1.12 2.83c.14.18 1.93 2.95 4.68 4.13.65.28 1.17.45 1.57.58.66.21 1.26.18 1.73.11.53-.08 1.64-.67 1.87-1.32.23-.65.23-1.2.16-1.32-.07-.11-.25-.18-.53-.32zM12.04 2C6.5 2 2 6.49 2 12.02c0 1.77.46 3.45 1.28 4.92L2 22l5.2-1.36A9.98 9.98 0 0012.04 22C17.56 22 22 17.51 22 11.98 22 6.49 17.56 2 12.04 2zm0 18.16c-1.61 0-3.12-.43-4.42-1.19l-.32-.19-3.09.81.82-3.01-.21-.33a8.14 8.14 0 01-1.25-4.37c0-4.51 3.68-8.18 8.2-8.18 4.51 0 8.18 3.67 8.18 8.18 0 4.51-3.67 8.18-8.18 8.18z'
    ]);
}

function mapsIcon() {
    return svgIcon([
        'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5A2.5 2.5 0 1112 6a2.5 2.5 0 010 5.5z'
    ]);
}

function mapsUrl(dados) {
    return mapsHref(dados);
}

function nearestScroller(node) {
    let el = node && node.parentElement;
    while (el && el !== document.body) {
        const style = window.getComputedStyle(el);
        const overflowY = style.overflowY;
        if ((overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 1) {
            return el;
        }
        el = el.parentElement;
    }
    return document.scrollingElement || document.documentElement;
}

function scrollToId(id) {
    const target = document.getElementById(id);
    if (!target) return;
    const scroller = nearestScroller(target);
    if (scroller === document.scrollingElement || scroller === document.documentElement || scroller === document.body) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
    }
    const sRect = scroller.getBoundingClientRect();
    const tRect = target.getBoundingClientRect();
    scroller.scrollTo({
        top: Math.max(0, scroller.scrollTop + (tRect.top - sRect.top) - 8),
        behavior: 'smooth'
    });
}

function resolveCtaAction(target, dados) {
    if (target === 'whatsapp') {
        const href = whatsappHref(dados);
        return href ? { href, external: true } : { scroll: 'dpl-contactos' };
    }
    if (target === 'tel') {
        const href = telHref(dados);
        return href ? { href, external: false } : { scroll: 'dpl-contactos' };
    }
    if (target && target.startsWith('dpl-')) return { scroll: target };
    return { scroll: 'dpl-contactos' };
}

function bindCta(node, target, dados) {
    const action = resolveCtaAction(target, dados);
    if (action.href) {
        node.href = action.href;
        if (action.external) {
            node.target = '_blank';
            node.rel = 'noopener';
        }
        return;
    }
    node.href = `#${action.scroll}`;
    node.addEventListener('click', (event) => {
        event.preventDefault();
        scrollToId(action.scroll);
    });
}

function buildQuickFacts(dados) {
    const address = [dados.morada, dados.cidade].filter(Boolean).join(', ');
    if (!address && !dados.horario) return null;
    const s = section('dpl-facts', 'dpl-facts');
    if (address) s.appendChild(el('p', 'dpl-facts-line', address));
    if (dados.horario) s.appendChild(el('p', 'dpl-facts-line', `Horário: ${dados.horario}`));
    return s;
}

function visualPlane(className, mark) {
    const plane = el('div', `dpl-visual ${className}`);
    plane.appendChild(el('div', 'dpl-visual-glow'));
    plane.appendChild(el('div', 'dpl-visual-grain'));
    if (mark) plane.appendChild(el('span', 'dpl-visual-mark', mark));
    return plane;
}

function photoOrPlane(fotos, index, className, mark) {
    const url = Array.isArray(fotos) && fotos[index];
    if (url) {
        const wrap = el('div', `dpl-visual dpl-visual-photo ${className}`);
        const img = el('img', 'dpl-photo-img');
        img.src = url;
        img.alt = '';
        wrap.appendChild(img);
        return wrap;
    }
    return visualPlane(className, mark);
}

function buildTopbar(dados, identidade, businessType) {
    const bar = el('div', 'dpl-topbar');
    const brandWrap = el('div', 'dpl-topbar-brand-wrap');
    if (identidade.logo && identidade.logo.tipo === 'upload' && identidade.logo.dataUrl) {
        const img = el('img', 'dpl-topbar-logo');
        img.src = identidade.logo.dataUrl;
        img.alt = dados.nome_negocio || 'Logótipo';
        brandWrap.appendChild(img);
    } else {
        brandWrap.appendChild(el('div', 'dpl-topbar-brand', dados.nome_negocio || 'O seu negócio'));
    }
    bar.appendChild(brandWrap);

    const navItems = Array.isArray(businessType.nav) ? businessType.nav.slice(0, 4) : [];
    if (navItems.length) {
        const nav = el('nav', 'dpl-nav');
        nav.setAttribute('aria-label', 'Secções');
        navItems.forEach((item) => {
            const a = el('a', 'dpl-nav-link', item.label);
            bindCta(a, item.target || 'dpl-contactos', dados);
            nav.appendChild(a);
        });
        bar.appendChild(nav);
    }
    return bar;
}

function paintLandingLogoMat(root, identidade) {
    const logo = identidade && identidade.logo;
    const url = logo && logo.tipo === 'upload' && logo.dataUrl;
    const topbar = root.querySelector('.dpl-topbar');
    if (!topbar || !url) return;
    const paint = (mat) => {
        applyLogoMatStyle(topbar, mat);
        applyLogoMatStyle(root, mat);
        if (mat && logo) logo.mat = mat;
    };
    if (logo.mat) {
        paint(logo.mat);
        return;
    }
    sampleLogoMat(url).then(paint);
}

function heroCtas(businessType, demo, dados) {
    const fromType = Array.isArray(businessType.ctas_hero) ? businessType.ctas_hero : [];
    if (fromType.length) return fromType;
    return [{ label: (demo.hero && demo.hero.cta) || 'Contactar', target: 'dpl-contactos' }];
}

function buildHero(dados, identidade, demo, businessType, fotos) {
    const hero = section('dpl-topo', 'dpl-hero');
    hero.appendChild(photoOrPlane(fotos, 0, 'dpl-hero-visual', '01'));
    hero.appendChild(el('div', 'dpl-hero-veil'));

    const inner = el('div', 'dpl-hero-inner');
    inner.appendChild(el('div', 'dpl-hero-name', dados.nome_negocio || 'O seu negócio'));
    if (dados.cidade) {
        inner.appendChild(el('p', 'dpl-hero-place', dados.cidade));
    }

    inner.appendChild(el('h1', 'dpl-hero-title', demo.hero.titulo));
    if (demo.hero.subtitulo) inner.appendChild(el('p', 'dpl-hero-sub', demo.hero.subtitulo));

    const group = el('div', 'dpl-hero-ctas');
    heroCtas(businessType, demo, dados).slice(0, 2).forEach((cta, i) => {
        const a = el('a', i === 0 ? 'dpl-btn dpl-btn-cta' : 'dpl-btn dpl-btn-ghost', cta.label || demo.hero.cta);
        bindCta(a, cta.target || 'dpl-contactos', dados);
        group.appendChild(a);
    });
    inner.appendChild(group);
    hero.appendChild(inner);
    return hero;
}

function buildSobre(demo, fotos) {
    if (!demo.sobre || !demo.sobre.texto) return null;
    const s = section('dpl-sobre', 'dpl-sobre');
    const grid = el('div', 'dpl-sobre-grid');
    const copy = el('div', 'dpl-sobre-copy');
    copy.appendChild(sectionTitle(demo.sobre.titulo));
    copy.appendChild(el('p', 'dpl-sobre-text', demo.sobre.texto));
    grid.appendChild(copy);
    grid.appendChild(photoOrPlane(fotos, 1, 'dpl-sobre-visual', '02'));
    s.appendChild(grid);
    return s;
}

function buildServicos(demo, businessType, fotos) {
    if (!demo.servicos || !Array.isArray(demo.servicos.itens) || !demo.servicos.itens.length) return null;
    const layout = businessType.servicos_layout || 'cards';
    const s = section('dpl-servicos', `dpl-servicos dpl-servicos-${layout}`);
    s.appendChild(sectionTitle(demo.servicos.titulo || rotulo(businessType, 'servicos', 'Serviços')));
    const grid = el('div', `dpl-servicos-grid dpl-servicos-grid-${layout}`);
    demo.servicos.itens.forEach((item, i) => {
        const card = el('article', `dpl-servico-card dpl-servico-${layout}`);
        const url = Array.isArray(fotos) && fotos[i];
        if (url) card.appendChild(photoOrPlane(fotos, i, 'dpl-servico-photo', ''));
        const body = el('div', 'dpl-servico-body');
        body.appendChild(el('h3', 'dpl-servico-nome', item.nome));
        if (item.descricao) body.appendChild(el('p', 'dpl-servico-desc', item.descricao));
        card.appendChild(body);
        grid.appendChild(card);
    });
    s.appendChild(grid);
    return s;
}

function buildDiferenciais(demo) {
    if (!demo.diferenciais || !demo.diferenciais.itens || !demo.diferenciais.itens.length) return null;
    const s = section(null, 'dpl-diferenciais');
    s.appendChild(sectionTitle(demo.diferenciais.titulo));
    const list = el('ul', 'dpl-dif-list');
    demo.diferenciais.itens.forEach((item) => {
        const li = el('li', 'dpl-dif-item');
        li.appendChild(el('span', 'dpl-dif-mark'));
        li.appendChild(el('span', null, item));
        list.appendChild(li);
    });
    s.appendChild(list);
    return s;
}

function buildProblemas(demo, businessType) {
    const items = (demo.problemas && demo.problemas.itens)
        || (demo.diferenciais && demo.diferenciais.itens)
        || [];
    if (!items.length) return null;
    const title = (demo.problemas && demo.problemas.titulo)
        || businessType.problemas_titulo
        || 'Problemas que resolvemos';
    const s = section('dpl-problemas', 'dpl-problemas');
    s.appendChild(sectionTitle(title));
    const list = el('ul', 'dpl-dif-list');
    items.forEach((item) => {
        const li = el('li', 'dpl-dif-item');
        li.appendChild(el('span', 'dpl-dif-mark'));
        li.appendChild(el('span', null, item));
        list.appendChild(li);
    });
    s.appendChild(list);
    return s;
}

function defaultReviews(nome) {
    const n = nome || 'este negócio';
    return [
        { autor: 'Cliente local', texto: `Atendimento próximo e cuidado — voltamos a ${n} de boa vontade.` },
        { autor: 'Vizinho', texto: 'Fácil de contactar, claro no que fazem, e sentimo-nos bem tratados.' },
        { autor: 'Cliente', texto: 'Recomendo a quem procura um sítio de confiança aqui na zona.' }
    ];
}

function buildAvaliacoes(demo, dados) {
    const itens = (demo.avaliacoes && Array.isArray(demo.avaliacoes.itens) && demo.avaliacoes.itens.length)
        ? demo.avaliacoes.itens
        : defaultReviews(dados.nome_negocio);
    const s = section('dpl-avaliacoes', 'dpl-avaliacoes');
    s.appendChild(sectionTitle((demo.avaliacoes && demo.avaliacoes.titulo) || 'O que dizem'));
    const grid = el('div', 'dpl-reviews-grid');
    itens.slice(0, 3).forEach((item) => {
        const card = el('blockquote', 'dpl-review');
        card.appendChild(el('p', 'dpl-review-text', item.texto || item));
        if (item.autor) card.appendChild(el('footer', 'dpl-review-author', item.autor));
        grid.appendChild(card);
    });
    s.appendChild(grid);
    return s;
}

function buildCtaBloco(businessType, dados) {
    const cfg = businessType.cta_bloco || {
        titulo: 'Fale connosco',
        botao: 'Contactar',
        target: 'dpl-contactos'
    };
    const s = section('dpl-cta-bloco', 'dpl-cta-bloco');
    s.appendChild(el('h2', 'dpl-cta-title', cfg.titulo));
    const a = el('a', 'dpl-btn dpl-btn-cta', cfg.botao);
    bindCta(a, cfg.target || 'whatsapp', dados);
    s.appendChild(a);
    return s;
}

function buildGaleria(fotos, businessType) {
    const s = section('dpl-galeria', 'dpl-galeria');
    const head = el('div', 'dpl-galeria-head');
    head.appendChild(sectionTitle(rotulo(businessType, 'galeria', 'Galeria')));
    if (!fotos || !fotos.length) {
        head.appendChild(el(
            'p',
            'dpl-galeria-note',
            rotulo(businessType, 'galeria_vazia', 'Fotos do estabelecimento — tire algumas no local para tornar a página real.')
        ));
    }
    s.appendChild(head);
    const grid = el('div', 'dpl-galeria-grid');
    const count = Math.max(3, Math.min(6, (fotos && fotos.length) || 3));
    for (let i = 0; i < count; i += 1) {
        grid.appendChild(photoOrPlane(fotos, i, `dpl-galeria-tile dpl-galeria-tile-${i % 3}`, String(i + 1).padStart(2, '0')));
    }
    s.appendChild(grid);
    return s;
}

function chipList(title, items, className) {
    if (!items.length) return null;
    const s = section(null, className);
    s.appendChild(sectionTitle(title));
    const list = el('ul', 'dpl-chip-list');
    items.forEach((item) => list.appendChild(el('li', 'dpl-chip', item)));
    s.appendChild(list);
    return s;
}

function buildDestaques(dados, businessType) {
    const items = destaqueItems(dados, businessType);
    return chipList(rotulo(businessType, 'destaques', 'Em destaque'), items, 'dpl-destaques');
}

function buildMarcas(dados, businessType) {
    const items = marcaItems(dados, businessType);
    return chipList(rotulo(businessType, 'marcas', 'Marcas'), items, 'dpl-marcas');
}

function buildOcasioes(dados, businessType) {
    const items = splitItems(dados.ocasioes);
    return chipList(rotulo(businessType, 'ocasioes', 'Ocasiões'), items, 'dpl-ocasioes');
}

function buildConfianca(dados, businessType) {
    const chips = trustChips(dados, businessType);
    if (!chips.length) return null;
    const s = section('dpl-confianca', 'dpl-confianca');
    s.appendChild(sectionTitle(rotulo(businessType, 'confianca', 'Porquê aqui')));
    const list = el('ul', 'dpl-chip-list');
    chips.forEach((item) => list.appendChild(el('li', 'dpl-chip dpl-chip-trust', item)));
    s.appendChild(list);
    return s;
}

function buildHorario(dados, businessType) {
    if (!dados.horario) return null;
    const s = section('dpl-horario', 'dpl-horario');
    s.appendChild(sectionTitle(rotulo(businessType, 'horario', 'Horário')));
    s.appendChild(el('p', 'dpl-horario-text', dados.horario));
    if (isYes(dados.estacionamento)) {
        s.appendChild(el('p', 'dpl-horario-note', 'Tem estacionamento.'));
    }
    return s;
}

function buildAntesDepois(fotos, businessType) {
    const s = section('dpl-antes-depois', 'dpl-antes-depois');
    s.appendChild(sectionTitle(rotulo(businessType, 'antes_depois', 'Antes e depois')));
    const grid = el('div', 'dpl-antes-grid');
    grid.appendChild(photoOrPlane(fotos, 0, 'dpl-antes-tile', 'Antes'));
    grid.appendChild(photoOrPlane(fotos, 1, 'dpl-antes-tile', 'Depois'));
    s.appendChild(grid);
    s.appendChild(el(
        'p',
        'dpl-galeria-note',
        rotulo(businessType, 'antes_depois_nota', 'Mostre um trabalho recente. O cliente percebe o ofício em dois segundos.')
    ));
    return s;
}

function contactButton(label, href, cls, icon) {
    const a = el('a', `dpl-btn ${cls}`);
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener';
    if (icon) a.appendChild(icon);
    a.appendChild(el('span', null, label));
    return a;
}

function buildContactos(dados, businessType) {
    const s = section('dpl-contactos', 'dpl-contactos');
    s.appendChild(sectionTitle(rotulo(businessType, 'contactos', 'Contactos')));

    const info = el('div', 'dpl-contact-info');
    if (dados.morada || dados.cidade) {
        info.appendChild(el('p', 'dpl-contact-line', [dados.morada, dados.cidade].filter(Boolean).join(', ')));
    }
    if (dados.horario) info.appendChild(el('p', 'dpl-contact-line', `Horário: ${dados.horario}`));
    if (dados.telefone) info.appendChild(el('p', 'dpl-contact-line', `Telefone: ${dados.telefone}`));
    if (dados.email) info.appendChild(el('p', 'dpl-contact-line', `Email: ${dados.email}`));
    s.appendChild(info);

    const actions = el('div', 'dpl-contact-actions');
    const maps = mapsUrl(dados);
    if (maps) {
        actions.appendChild(contactButton('Como chegar', maps, 'dpl-btn-maps', mapsIcon()));
    }
    if (dados.telefone) {
        actions.appendChild(contactButton('Ligar', telHref(dados), 'dpl-btn-call', phoneIcon()));
    }
    const wa = whatsappHref(dados);
    if (wa) {
        actions.appendChild(contactButton('WhatsApp', wa, 'dpl-btn-wa', whatsappIcon()));
    }
    if (dados.email) actions.appendChild(contactButton('Email', `mailto:${dados.email}`, 'dpl-btn-email'));
    const ig = instagramHref(dados.instagram);
    if (ig) actions.appendChild(contactButton('Instagram', ig, 'dpl-btn-ig'));
    s.appendChild(actions);

    return s;
}

function buildMapa(dados) {
    const query = [dados.morada, dados.cidade, dados.nome_negocio].filter(Boolean).join(', ');
    if (!query) return null;
    const s = section('dpl-mapa', 'dpl-mapa');
    const frame = el('iframe', 'dpl-map-frame');
    frame.src = `https://maps.google.com/maps?q=${encodeURIComponent(query)}&output=embed`;
    frame.loading = 'lazy';
    frame.title = 'Mapa';
    s.appendChild(frame);
    return s;
}

export const LIVRO_RECLAMACOES_URL = 'https://www.livroreclamacoes.pt/Inicio/';

function buildLivroLink() {
    const a = el('a', 'dpl-rodape-livro');
    a.href = LIVRO_RECLAMACOES_URL;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = 'Livro de Reclamações';
    const wrap = el('p', 'dpl-rodape-legal');
    wrap.setAttribute('data-dp-livro', '');
    wrap.appendChild(a);
    return wrap;
}

function buildRodape(dados, demo) {
    const s = el('footer', 'dpl-rodape');
    s.appendChild(el('div', 'dpl-rodape-name', dados.nome_negocio || ''));
    if (demo.rodape && demo.rodape.texto) s.appendChild(el('p', 'dpl-rodape-text', demo.rodape.texto));
    const ig = instagramHref(dados.instagram);
    if (ig) {
        const social = el('p', 'dpl-rodape-social');
        const a = el('a', 'dpl-rodape-ig', 'Instagram');
        a.href = ig;
        a.target = '_blank';
        a.rel = 'noopener';
        social.appendChild(a);
        s.appendChild(social);
    }
    s.appendChild(el('p', 'dpl-rodape-meta', `© ${new Date().getFullYear()} ${dados.nome_negocio || ''}`));
    s.appendChild(buildLivroLink());
    return s;
}

function fabLink(href, className, label, icon, external) {
    const a = el('a', `dpl-fab-btn ${className}`);
    a.href = href;
    a.setAttribute('aria-label', label);
    a.title = label;
    if (external) {
        a.target = '_blank';
        a.rel = 'noopener';
    }
    a.appendChild(icon);
    return a;
}

function buildFab(dados) {
    const fab = el('div', 'dpl-fab');
    const maps = mapsUrl(dados);
    if (maps) {
        fab.appendChild(fabLink(maps, 'dpl-fab-maps', 'Como chegar', mapsIcon(), true));
    }
    if (dados.telefone) {
        fab.appendChild(fabLink(
            telHref(dados),
            'dpl-fab-call',
            'Ligar',
            phoneIcon(),
            false
        ));
    }
    const wa = whatsappHref(dados);
    if (wa) {
        fab.appendChild(fabLink(
            wa,
            'dpl-fab-wa',
            'WhatsApp',
            whatsappIcon(),
            true
        ));
    }
    return fab;
}

function fotosOf(identidade) {
    return Array.isArray(identidade.fotos) ? identidade.fotos.filter(Boolean) : [];
}

export function renderLanding(state) {
    const businessType = state.data.businessType || {};
    const dados = state.data.dados || {};
    const identidade = state.data.identidade || { cores: {}, estilo: 'clean', logo: { tipo: 'nenhum' } };
    const demo = state.data.demo;
    const fotos = fotosOf(identidade);
    const archetype = businessType.archetype || 'servico';

    const root = el('div', 'dp-landing');
    root.dataset.style = identidade.estilo || identidade.paleta || 'clean';
    root.dataset.archetype = archetype;
    if (businessType.id) root.dataset.category = businessType.id;
    const cores = identidade.cores || {};
    root.style.setProperty('--l-base', cores.base || '#1b1b1b');
    root.style.setProperty('--l-destaque', cores.destaque || '#e8d5b7');
    root.style.setProperty('--l-secundaria', cores.secundaria || '#7a8a99');

    root.appendChild(buildTopbar(dados, identidade, businessType));
    paintLandingLogoMat(root, identidade);
    root.addEventListener('click', (event) => {
        const a = event.target.closest && event.target.closest('a[href^="#"]');
        if (!a || !root.contains(a)) return;
        const href = a.getAttribute('href') || '';
        if (href.length < 2) return;
        const id = decodeURIComponent(href.slice(1));
        if (!root.querySelector(`#${CSS.escape(id)}`)) return;
        event.preventDefault();
        scrollToId(id);
    });

    const sections = businessType.seccoes_landing || ['hero', 'sobre', 'servicos', 'diferenciais', 'galeria', 'contactos', 'mapa', 'rodape'];
    const builders = {
        hero: () => buildHero(dados, identidade, demo, businessType, fotos),
        sobre: () => buildSobre(demo, fotos),
        servicos: () => buildServicos(demo, businessType, fotos),
        diferenciais: () => buildDiferenciais(demo),
        problemas: () => buildProblemas(demo, businessType),
        avaliacoes: () => buildAvaliacoes(demo, dados),
        cta_bloco: () => buildCtaBloco(businessType, dados),
        galeria: () => buildGaleria(fotos, businessType),
        destaques: () => buildDestaques(dados, businessType),
        marcas: () => buildMarcas(dados, businessType),
        ocasioes: () => buildOcasioes(dados, businessType),
        confianca: () => buildConfianca(dados, businessType),
        horario: () => buildHorario(dados, businessType),
        antes_depois: () => buildAntesDepois(fotos, businessType),
        contactos: () => buildContactos(dados, businessType),
        mapa: () => buildMapa(dados),
        rodape: () => buildRodape(dados, demo)
    };

    let heroDone = false;
    sections.forEach((name) => {
        const builder = builders[name];
        if (!builder) return;
        const node = builder();
        if (node) root.appendChild(node);
        if (name === 'hero' && !heroDone) {
            heroDone = true;
            const facts = buildQuickFacts(dados);
            if (facts) root.appendChild(facts);
        }
    });
    if (!heroDone) {
        const facts = buildQuickFacts(dados);
        if (facts) root.appendChild(facts);
    }

    root.appendChild(buildFab(dados));
    return root;
}
