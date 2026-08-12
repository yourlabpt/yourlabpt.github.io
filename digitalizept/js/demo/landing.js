// Renders the live demo landing page from the collected state.
// Fixed sections + an always-on-screen floating WhatsApp/call button.

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

function buildHero(dados, identidade, demo) {
    const hero = section('dpl-topo', 'dpl-hero');

    if (identidade.logo && identidade.logo.tipo === 'upload' && identidade.logo.dataUrl) {
        const img = el('img', 'dpl-hero-logo');
        img.src = identidade.logo.dataUrl;
        img.alt = dados.nome_negocio || 'Logótipo';
        hero.appendChild(img);
    } else {
        hero.appendChild(el('div', 'dpl-hero-name', dados.nome_negocio || 'O seu negócio'));
    }

    hero.appendChild(el('h1', 'dpl-hero-title', demo.hero.titulo));
    if (demo.hero.subtitulo) hero.appendChild(el('p', 'dpl-hero-sub', demo.hero.subtitulo));

    const cta = el('button', 'dpl-btn dpl-btn-cta', demo.hero.cta);
    cta.type = 'button';
    cta.addEventListener('click', () => {
        const target = document.getElementById('dpl-contactos');
        if (target) target.scrollIntoView({ behavior: 'smooth' });
    });
    hero.appendChild(cta);

    return hero;
}

function buildSobre(demo) {
    if (!demo.sobre.texto) return null;
    const s = section(null, 'dpl-sobre');
    s.appendChild(sectionTitle(demo.sobre.titulo));
    s.appendChild(el('p', 'dpl-sobre-text', demo.sobre.texto));
    return s;
}

function buildServicos(demo) {
    const s = section(null, 'dpl-servicos');
    s.appendChild(sectionTitle(demo.servicos.titulo));
    const grid = el('div', 'dpl-servicos-grid');
    demo.servicos.itens.forEach((item) => {
        const card = el('div', 'dpl-servico-card');
        card.appendChild(el('h3', 'dpl-servico-nome', item.nome));
        if (item.descricao) card.appendChild(el('p', 'dpl-servico-desc', item.descricao));
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
        li.appendChild(el('span', 'dpl-dif-check', '✓'));
        li.appendChild(el('span', null, item));
        list.appendChild(li);
    });
    s.appendChild(list);
    return s;
}

function buildGaleria(businessType) {
    const s = section(null, 'dpl-galeria');
    s.appendChild(sectionTitle('Galeria'));
    const grid = el('div', 'dpl-galeria-grid');
    // Placeholder tiles for the demo — real photos slot in on delivery.
    for (let i = 0; i < 3; i += 1) {
        const tile = el('div', `dpl-galeria-tile dpl-galeria-tile-${i}`);
        tile.appendChild(el('span', 'dpl-galeria-icon', businessType.icone || '📷'));
        grid.appendChild(tile);
    }
    s.appendChild(grid);
    return s;
}

function contactButton(label, href, cls) {
    const a = el('a', `dpl-btn ${cls}`, label);
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener';
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
    if (dados.telefone) actions.appendChild(contactButton('Ligar', `tel:${digitsOnly(dados.telefone)}`, 'dpl-btn-call'));
    const wa = waNumber(dados.whatsapp || dados.telefone);
    if (wa) actions.appendChild(contactButton('WhatsApp', `https://wa.me/${wa}`, 'dpl-btn-wa'));
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

function buildFab(dados) {
    const fab = el('div', 'dpl-fab');
    if (dados.telefone) {
        const call = el('a', 'dpl-fab-btn dpl-fab-call', '📞');
        call.href = `tel:${digitsOnly(dados.telefone)}`;
        call.setAttribute('aria-label', 'Ligar');
        fab.appendChild(call);
    }
    const wa = waNumber(dados.whatsapp || dados.telefone);
    if (wa) {
        const w = el('a', 'dpl-fab-btn dpl-fab-wa', '💬');
        w.href = `https://wa.me/${wa}`;
        w.target = '_blank';
        w.rel = 'noopener';
        w.setAttribute('aria-label', 'WhatsApp');
        fab.appendChild(w);
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

    const sections = businessType.seccoes_landing || ['hero', 'sobre', 'servicos', 'diferenciais', 'galeria', 'contactos', 'mapa', 'rodape'];
    const builders = {
        hero: () => buildHero(dados, identidade, demo),
        sobre: () => buildSobre(demo),
        servicos: () => buildServicos(demo),
        diferenciais: () => buildDiferenciais(demo),
        galeria: () => buildGaleria(businessType),
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
