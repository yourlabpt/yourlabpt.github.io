// Public-profile style mockup for Google Business (educação + demo do cliente).
// Offline-first: sample data is local; optional link opens a real example when online.

import { facebookHref, instagramHref, websiteHref } from './boilerplate.js';

export const GBP_SAMPLE = {
    nome: 'Café da Praça',
    categoria: 'Café · Porto',
    rating: '4,7',
    reviews: '128',
    aberto: true,
    horarioResumo: 'Aberto agora · Fecha às 19:00',
    telefone: '220 000 000',
    whatsapp: '912345678',
    website: 'https://cafedapraca.pt',
    instagram: '@cafedapraca',
    facebook: 'cafedapraca',
    morada: 'Praça da Liberdade 12, Porto',
    sobre: 'Café de bairro com pastelaria fresca, esplanada e Wi-Fi. Ideal para um café rápido ou uma pausa a meio da tarde.',
    horario: [
        'Seg–Sex 08:00–19:00',
        'Sábado 09:00–18:00',
        'Domingo 10:00–14:00'
    ],
    servicos: [
        'Café e pastelaria',
        'Pequeno-almoço',
        'Esplanada',
        'Wi-Fi',
        'Take-away'
    ],
    realExampleUrl: 'https://business.google.com/v/the-house-of-brazilian-food/015206574844160642768/e068/_'
};

const UNIFY_PITCH = 'No pin e na ficha Google: WhatsApp, telefone, site e redes no mesmo sítio — mais os serviços.';
const ADMIN_PITCH = 'Vista pública no Maps / Search — o que os clientes vêem. Não é o painel do dono (business.google).';

function escapeHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function serviceLabels(itens) {
    if (!Array.isArray(itens)) return [];
    return itens
        .map((item) => {
            if (typeof item === 'string') return item.trim();
            if (item && typeof item === 'object') {
                return String(item.nome || item.titulo || item.label || '').trim();
            }
            return '';
        })
        .filter(Boolean)
        .slice(0, 5);
}

function actionBtn(label, href) {
    if (href) {
        return `<a class="gbp-action" href="${escapeHtml(href)}" target="_blank" rel="noopener">${escapeHtml(label)}</a>`;
    }
    return `<span class="gbp-action gbp-action-muted">${escapeHtml(label)}</span>`;
}

export function gbpDataFromState(state) {
    const dados = (state && state.data && state.data.dados) || {};
    const tipo = (state && state.data && state.data.businessType) || {};
    const demo = (state && state.data && state.data.demo) || {};
    const categoria = Array.isArray(tipo.categorias_google) && tipo.categorias_google[0]
        ? String(tipo.categorias_google[0]).replace(/_/g, ' ')
        : (tipo.nome || 'Negócio local');
    const cidade = dados.cidade || '';
    const nome = dados.nome_negocio || 'O seu negócio';
    const fromDemo = serviceLabels(demo.servicos && demo.servicos.itens);
    const fromDados = serviceLabels(
        String(dados.principais_servicos || '')
            .split(/[,;\n•]+/)
            .map((s) => s.trim())
            .filter(Boolean)
    );
    return {
        nome,
        categoria: cidade ? `${categoria} · ${cidade}` : categoria,
        rating: '—',
        reviews: 'novo',
        aberto: true,
        horarioResumo: dados.horario
            ? `Horário: ${dados.horario}`
            : 'Horário a confirmar',
        telefone: dados.telefone || '',
        whatsapp: dados.whatsapp || '',
        website: dados.website_atual || dados.website || '',
        instagram: dados.instagram || '',
        facebook: dados.facebook || '',
        morada: [dados.morada, dados.cidade].filter(Boolean).join(', ') || 'Morada a confirmar',
        sobre: (state.data && state.data.gbpSobre)
            || dados.o_que_faz
            || dados.diferencial
            || `Perfil Google de ${nome} — o que os clientes vêem no Maps.`,
        horario: dados.horario ? [dados.horario] : GBP_SAMPLE.horario,
        servicos: fromDemo.length ? fromDemo : fromDados,
        logoUrl: (state.data && state.data.identidade && state.data.identidade.logo
            && state.data.identidade.logo.tipo === 'upload'
            && state.data.identidade.logo.dataUrl) || '',
        fotos: (state.data && state.data.identidade && Array.isArray(state.data.identidade.fotos))
            ? state.data.identidade.fotos.filter(Boolean).slice(0, 3)
            : []
    };
}

export function renderGbpCard(data, { showPitch = false, clientMode = false, unifyPitch = false } = {}) {
    const d = data || GBP_SAMPLE;
    const wrap = document.createElement('div');
    wrap.className = 'gbp-card' + (clientMode ? ' gbp-card-client' : '');

    const status = d.aberto
        ? '<span class="gbp-open">Aberto agora</span>'
        : '<span class="gbp-closed">Fechado</span>';

    const avatar = d.logoUrl
        ? `<div class="gbp-avatar gbp-avatar-photo"><img src="${escapeHtml(d.logoUrl)}" alt=""></div>`
        : `<div class="gbp-avatar" aria-hidden="true">${escapeHtml((d.nome || '?').charAt(0).toUpperCase())}</div>`;

    const phoneHref = d.telefone
        ? `tel:${String(d.telefone).replace(/\s/g, '')}`
        : '';
    const waDigits = String(d.whatsapp || '').replace(/\D/g, '');
    const waHref = waDigits
        ? `https://wa.me/${waDigits.length === 9 ? `351${waDigits}` : waDigits}`
        : '';
    const siteHref = websiteHref(d.website);
    const igHref = instagramHref(d.instagram);
    const fbHref = facebookHref(d.facebook);

    const fotos = (Array.isArray(d.fotos) && d.fotos.length)
        ? d.fotos.map((url) => `<div class="gbp-photo gbp-photo-real"><img src="${escapeHtml(url)}" alt=""></div>`).join('')
        : ['Fachada', 'Interior', 'Produto']
            .map((label) => `<div class="gbp-photo"><span>${escapeHtml(label)}</span></div>`)
            .join('');

    const horas = (d.horario || []).map((h) => `<li>${escapeHtml(h)}</li>`).join('');
    const servicos = serviceLabels(d.servicos);
    const servicosHtml = servicos.length
        ? `<div class="gbp-section">
            <h4>Serviços</h4>
            <ul class="gbp-list">${servicos.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ul>
        </div>`
        : '';

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
            ${actionBtn('Ligar', phoneHref)}
            ${actionBtn('WhatsApp', waHref)}
            ${actionBtn('Website', siteHref)}
            ${actionBtn('Instagram', igHref)}
            ${actionBtn('Facebook', fbHref)}
            ${actionBtn('Direções', '')}
        </div>
        <div class="gbp-section">
            <h4>Acerca de</h4>
            <p>${escapeHtml(d.sobre)}</p>
        </div>
        ${servicosHtml}
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

    const useUnify = unifyPitch === true || (showPitch && clientMode);
    if (useUnify || showPitch) {
        const pitch = document.createElement('p');
        pitch.className = 'gbp-pitch';
        pitch.textContent = useUnify ? UNIFY_PITCH : ADMIN_PITCH;
        wrap.appendChild(pitch);
    }

    return wrap;
}

export function mountGbpExample(container, {
    data, showPitch, clientMode, showRealLink, unifyPitch
} = {}) {
    container.appendChild(renderGbpCard(data || GBP_SAMPLE, { showPitch, clientMode, unifyPitch }));
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
