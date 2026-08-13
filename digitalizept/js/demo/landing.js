// Renders the live demo landing page from the collected state.
// Structure inspired by strong local restaurant sites: full-bleed hero,
// image/text rhythm, edge-to-edge gallery, and round phone/WhatsApp FABs.

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
}

function digitsOnly(value) {
    return String(value || '').replace(/\D/g, '');
}

function waNumber(whatsapp) {
    const d = digitsOnly(whatsapp);
    if (!d) return '';
    return d.length === 9 ? `351${d}` : d;
}

function section(id, className) {
    const s = el('section', `dpl-section ${className}`);
    if (id) s.id = id;
    return s;
}

function sectionTitle(text) {
    const wrap = el('div', 'dpl-section-head');
    wrap.appendChild(el('h2', 'dpl-h2', text));
    wrap.appendChild(el('span', 'dpl-underline'));
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

function visualPlane(className, mark) {
    const plane = el('div', `dpl-visual ${className}`);
    plane.appendChild(el('div', 'dpl-visual-glow'));
    plane.appendChild(el('div', 'dpl-visual-grain'));
    if (mark) plane.appendChild(el('span', 'dpl-visual-mark', mark));
    return plane;
}

function buildTopbar(dados, identidade) {
    const bar = el('div', 'dpl-topbar');
    if (identidade.logo && identidade.logo.tipo === 'upload' && identidade.logo.dataUrl) {
        const img = el('img', 'dpl-topbar-logo');
        img.src = identidade.logo.dataUrl;
        img.alt = dados.nome_negocio || 'Logótipo';
        bar.appendChild(img);
    } else {
        bar.appendChild(el('div', 'dpl-topbar-brand', dados.nome_negocio || 'O seu negócio'));
    }
    return bar;
}

function buildHero(dados, identidade, demo) {
    const hero = section('dpl-topo', 'dpl-hero');
    hero.appendChild(visualPlane('dpl-hero-visual', '01'));
    const veil = el('div', 'dpl-hero-veil');
    hero.appendChild(veil);

    const inner = el('div', 'dpl-hero-inner');
    if (identidade.logo && identidade.logo.tipo === 'upload' && identidade.logo.dataUrl) {
        const img = el('img', 'dpl-hero-logo');
        img.src = identidade.logo.dataUrl;
        img.alt = dados.nome_negocio || 'Logótipo';
        inner.appendChild(img);
    } else {
        inner.appendChild(el('div', 'dpl-hero-name', dados.nome_negocio || 'O seu negócio'));
    }

    inner.appendChild(el('h1', 'dpl-hero-title', demo.hero.titulo));
    if (demo.hero.subtitulo) inner.appendChild(el('p', 'dpl-hero-sub', demo.hero.subtitulo));

    const cta = el('button', 'dpl-btn dpl-btn-cta', demo.hero.cta);
    cta.type = 'button';
    cta.addEventListener('click', () => {
        const target = document.getElementById('dpl-contactos');
        if (target) target.scrollIntoView({ behavior: 'smooth' });
    });
    inner.appendChild(cta);
    hero.appendChild(inner);
    return hero;
}

function buildSobre(demo) {
    if (!demo.sobre.texto) return null;
    const s = section(null, 'dpl-sobre');
    const grid = el('div', 'dpl-sobre-grid');
    const copy = el('div', 'dpl-sobre-copy');
    copy.appendChild(sectionTitle(demo.sobre.titulo));
    copy.appendChild(el('p', 'dpl-sobre-text', demo.sobre.texto));
    grid.appendChild(copy);
    grid.appendChild(visualPlane('dpl-sobre-visual', '02'));
    s.appendChild(grid);
    return s;
}

function buildServicos(demo) {
    const s = section(null, 'dpl-servicos');
    s.appendChild(sectionTitle(demo.servicos.titulo));
    const grid = el('div', 'dpl-servicos-grid');
    demo.servicos.itens.forEach((item, i) => {
        const card = el('article', `dpl-servico-card dpl-servico-card-${i % 3}`);
        card.appendChild(visualPlane(`dpl-servico-visual dpl-servico-visual-${i % 3}`));
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
    if (!demo.diferenciais.itens.length) return null;
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

function buildGaleria() {
    const s = section(null, 'dpl-galeria');
    const head = el('div', 'dpl-galeria-head');
    head.appendChild(sectionTitle('Galeria'));
    head.appendChild(el('p', 'dpl-galeria-note', 'Fotos do estabelecimento — substituídas na entrega.'));
    s.appendChild(head);
    const grid = el('div', 'dpl-galeria-grid');
    for (let i = 0; i < 3; i += 1) {
        const tile = visualPlane(`dpl-galeria-tile dpl-galeria-tile-${i}`, String(i + 1).padStart(2, '0'));
        grid.appendChild(tile);
    }
    s.appendChild(grid);
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

function buildContactos(dados) {
    const s = section('dpl-contactos', 'dpl-contactos');
    s.appendChild(sectionTitle('Contactos'));

    const info = el('div', 'dpl-contact-info');
    if (dados.morada || dados.cidade) {
        info.appendChild(el('p', 'dpl-contact-line', [dados.morada, dados.cidade].filter(Boolean).join(', ')));
    }
    if (dados.horario) info.appendChild(el('p', 'dpl-contact-line', `Horário: ${dados.horario}`));
    if (dados.telefone) info.appendChild(el('p', 'dpl-contact-line', `Telefone: ${dados.telefone}`));
    if (dados.email) info.appendChild(el('p', 'dpl-contact-line', `Email: ${dados.email}`));
    s.appendChild(info);

    const actions = el('div', 'dpl-contact-actions');
    if (dados.telefone) {
        actions.appendChild(contactButton('Ligar', `tel:${digitsOnly(dados.telefone)}`, 'dpl-btn-call', phoneIcon()));
    }
    const wa = waNumber(dados.whatsapp || dados.telefone);
    if (wa) {
        actions.appendChild(contactButton('WhatsApp', `https://wa.me/${wa}`, 'dpl-btn-wa', whatsappIcon()));
    }
    if (dados.email) actions.appendChild(contactButton('Email', `mailto:${dados.email}`, 'dpl-btn-email'));
    s.appendChild(actions);

    return s;
}

function buildMapa(dados) {
    const query = [dados.morada, dados.cidade].filter(Boolean).join(', ');
    if (!query) return null;
    const s = section(null, 'dpl-mapa');
    const frame = el('iframe', 'dpl-map-frame');
    frame.src = `https://maps.google.com/maps?q=${encodeURIComponent(query)}&output=embed`;
    frame.loading = 'lazy';
    frame.title = 'Mapa';
    s.appendChild(frame);
    return s;
}

function buildRodape(dados, demo) {
    const s = el('footer', 'dpl-rodape');
    s.appendChild(el('div', 'dpl-rodape-name', dados.nome_negocio || ''));
    if (demo.rodape.texto) s.appendChild(el('p', 'dpl-rodape-text', demo.rodape.texto));
    s.appendChild(el('p', 'dpl-rodape-meta', `© ${new Date().getFullYear()} ${dados.nome_negocio || ''}`));
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
    if (dados.telefone) {
        fab.appendChild(fabLink(
            `tel:${digitsOnly(dados.telefone)}`,
            'dpl-fab-call',
            'Ligar',
            phoneIcon(),
            false
        ));
    }
    const wa = waNumber(dados.whatsapp || dados.telefone);
    if (wa) {
        fab.appendChild(fabLink(
            `https://wa.me/${wa}`,
            'dpl-fab-wa',
            'WhatsApp',
            whatsappIcon(),
            true
        ));
    }
    return fab;
}

export function renderLanding(state) {
    const businessType = state.data.businessType || {};
    const dados = state.data.dados || {};
    const identidade = state.data.identidade || { cores: {}, estilo: 'clean', logo: { tipo: 'nenhum' } };
    const demo = state.data.demo;

    const root = el('div', 'dp-landing');
    root.dataset.style = identidade.estilo || 'clean';
    const cores = identidade.cores || {};
    root.style.setProperty('--l-base', cores.base || '#1b1b1b');
    root.style.setProperty('--l-destaque', cores.destaque || '#e8d5b7');
    root.style.setProperty('--l-secundaria', cores.secundaria || '#7a8a99');

    root.appendChild(buildTopbar(dados, identidade));

    const sections = businessType.seccoes_landing || ['hero', 'sobre', 'servicos', 'diferenciais', 'galeria', 'contactos', 'mapa', 'rodape'];
    const builders = {
        hero: () => buildHero(dados, identidade, demo),
        sobre: () => buildSobre(demo),
        servicos: () => buildServicos(demo),
        diferenciais: () => buildDiferenciais(demo),
        galeria: () => buildGaleria(),
        contactos: () => buildContactos(dados),
        mapa: () => buildMapa(dados),
        rodape: () => buildRodape(dados, demo)
    };

    sections.forEach((name) => {
        const builder = builders[name];
        if (!builder) return;
        const node = builder();
        if (node) root.appendChild(node);
    });

    root.appendChild(buildFab(dados));
    return root;
}
