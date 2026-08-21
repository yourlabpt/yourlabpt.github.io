// Public-profile style mockup for Google Business (educação + demo do cliente).
// Offline-first: sample data is local; optional link opens a real example when online.

export const GBP_SAMPLE = {
    nome: 'Café da Praça',
    categoria: 'Café · Porto',
    rating: '4,7',
    reviews: '128',
    aberto: true,
    horarioResumo: 'Aberto agora · Fecha às 19:00',
    telefone: '220 000 000',
    morada: 'Praça da Liberdade 12, Porto',
    sobre: 'Café de bairro com pastelaria fresca, esplanada e Wi-Fi. Ideal para um café rápido ou uma pausa a meio da tarde.',
    horario: [
        'Seg–Sex 08:00–19:00',
        'Sábado 09:00–18:00',
        'Domingo 10:00–14:00'
    ],
    realExampleUrl: 'https://business.google.com/v/the-house-of-brazilian-food/015206574844160642768/e068/_'
};

function escapeHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function gbpDataFromState(state) {
    const dados = (state && state.data && state.data.dados) || {};
    const tipo = (state && state.data && state.data.businessType) || {};
    const categoria = Array.isArray(tipo.categorias_google) && tipo.categorias_google[0]
        ? String(tipo.categorias_google[0]).replace(/_/g, ' ')
        : (tipo.nome || 'Negócio local');
    const cidade = dados.cidade || '';
    const nome = dados.nome_negocio || 'O seu negócio';
    return {
        nome,
        categoria: cidade ? `${categoria} · ${cidade}` : categoria,
        rating: '—',
        reviews: 'novo',
        aberto: true,
        horarioResumo: dados.horario
            ? `Horário: ${dados.horario}`
            : 'Horário a confirmar',
        telefone: dados.telefone || dados.whatsapp || '',
        morada: [dados.morada, dados.cidade].filter(Boolean).join(', ') || 'Morada a confirmar',
        sobre: (state.data && state.data.gbpSobre)
            || dados.o_que_faz
            || dados.diferencial
            || `Perfil Google de ${nome} — o que os clientes vêem no Maps.`,
        horario: dados.horario ? [dados.horario] : GBP_SAMPLE.horario,
        whatsapp: dados.whatsapp || '',
        logoUrl: (state.data && state.data.identidade && state.data.identidade.logo
            && state.data.identidade.logo.tipo === 'upload'
            && state.data.identidade.logo.dataUrl) || '',
        fotos: (state.data && state.data.identidade && Array.isArray(state.data.identidade.fotos))
            ? state.data.identidade.fotos.filter(Boolean).slice(0, 3)
            : []
    };
}

export function renderGbpCard(data, { showPitch = false, clientMode = false } = {}) {
    const d = data || GBP_SAMPLE;
    const wrap = document.createElement('div');
    wrap.className = 'gbp-card' + (clientMode ? ' gbp-card-client' : '');

    const status = d.aberto
        ? '<span class="gbp-open">Aberto agora</span>'
        : '<span class="gbp-closed">Fechado</span>';

    const avatar = d.logoUrl
        ? `<div class="gbp-avatar gbp-avatar-photo"><img src="${escapeHtml(d.logoUrl)}" alt=""></div>`
        : `<div class="gbp-avatar" aria-hidden="true">${escapeHtml((d.nome || '?').charAt(0).toUpperCase())}</div>`;

    const phoneBtn = d.telefone
        ? `<a class="gbp-action" href="tel:${escapeHtml(String(d.telefone).replace(/\s/g, ''))}">Ligar</a>`
        : '<span class="gbp-action gbp-action-muted">Ligar</span>';
    const waBtn = d.whatsapp
        ? `<a class="gbp-action" href="https://wa.me/${escapeHtml(String(d.whatsapp).replace(/\D/g, ''))}" target="_blank" rel="noopener">WhatsApp</a>`
        : '<span class="gbp-action gbp-action-muted">WhatsApp</span>';

    const fotos = (Array.isArray(d.fotos) && d.fotos.length)
        ? d.fotos.map((url) => `<div class="gbp-photo gbp-photo-real"><img src="${escapeHtml(url)}" alt=""></div>`).join('')
        : ['Fachada', 'Interior', 'Produto']
            .map((label) => `<div class="gbp-photo"><span>${escapeHtml(label)}</span></div>`)
            .join('');

    const horas = (d.horario || []).map((h) => `<li>${escapeHtml(h)}</li>`).join('');

    wrap.innerHTML = `
        <div class="gbp-card-top">
            ${avatar}
            <div class="gbp-heading">
                <div class="gbp-name">${escapeHtml(d.nome)}</div>
                <div class="gbp-category">${escapeHtml(d.categoria)}</div>
                <div class="gbp-rating">
                    <span class="gbp-stars">★★★★★</span>
                    <span>${escapeHtml(d.rating)}</span>
                    <span class="gbp-reviews">(${escapeHtml(d.reviews)} avaliações)</span>
                </div>
            </div>
        </div>
        <div class="gbp-status-row">${status}
            <span class="gbp-hours-inline">${escapeHtml(d.horarioResumo || '')}</span>
        </div>
        <div class="gbp-actions">
            ${phoneBtn}
            <span class="gbp-action gbp-action-muted">Direções</span>
            ${waBtn}
        </div>
        <div class="gbp-section">
            <h4>Acerca de</h4>
            <p>${escapeHtml(d.sobre)}</p>
        </div>
        <div class="gbp-section">
            <h4>Horário</h4>
            <ul class="gbp-list">${horas}</ul>
        </div>
        <div class="gbp-section">
            <h4>Fotos</h4>
            <div class="gbp-photos">${fotos}</div>
        </div>
        <div class="gbp-section">
            <h4>Localização</h4>
            <p class="gbp-map-placeholder">${escapeHtml(d.morada)}</p>
        </div>
    `;

    if (showPitch) {
        const pitch = document.createElement('p');
        pitch.className = 'gbp-pitch';
        pitch.textContent = 'Vista pública no Maps / Search — o que os clientes vêem. Não é o painel do dono (business.google).';
        wrap.appendChild(pitch);
    }

    return wrap;
}

export function mountGbpExample(container, { data, showPitch, clientMode, showRealLink } = {}) {
    container.appendChild(renderGbpCard(data || GBP_SAMPLE, { showPitch, clientMode }));
    if (showRealLink && GBP_SAMPLE.realExampleUrl) {
        const link = document.createElement('a');
        link.className = 'gbp-real-link';
        link.href = GBP_SAMPLE.realExampleUrl;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = 'Ver um exemplo real no Google';
        container.appendChild(link);
    }
}
