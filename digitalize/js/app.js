/**
 * Digitalize — self-service onboarding app. A persistent "path of islands"
 * map is home; tapping any unlocked node opens it full-screen, answering it
 * auto-advances straight into the next node (no extra tap to "go back and
 * open the next one"), and the map itself is there for review/re-editing.
 * One real lead in the same database the admin tool uses; no forms, no
 * client account (a private resumable link stands in for login — see
 * server/lib/digitalize-app.js for why). Vanilla DOM, same style as the
 * rest of this codebase: small el() builder, one render() per screen.
 */
import { registerDigitalizeSw, setupInstallPrompt, triggerInstall, dismissInstallPrompt } from './pwa.js';

const API = '/api/digitalize';
const TOKEN_KEY = 'digitalize_token';

registerDigitalizeSw();

// Business types that go to the client instead of the client coming to a
// shop — the "Vou a casa das pessoas" branch of the tipo node. Everything
// else is "Tenho loja ou espaço". Kept here because it's specific to how
// this one screen frames the choice.
const TIPOS_ZONA = new Set(['canalizador', 'eletricista', 'limpezas']);

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
}

function clean(value) {
    return String(value == null ? '' : value).trim();
}

async function api(path, { method = 'GET', body } = {}) {
    const res = await fetch(`${API}${path}`, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined
    });
    let data = {};
    try { data = await res.json(); } catch (_) { /* empty body */ }
    if (!res.ok) throw new Error(data.error || `Erro ${res.status}`);
    return data;
}

// ---------- State ----------
const state = {
    token: '',
    session: null,
    tipos: [],
    servicosCatalog: {}, // businessTypeId -> { grupos, atributosGlobais }
    descricoesCatalog: {}, // businessTypeId -> [frase, frase, frase]
    crescimento: null, // last /crescimento response, refreshed on demand
    lastNivel: null // to detect level-ups for the flash banner
};

function persistToken(token) {
    state.token = token;
    try { localStorage.setItem(TOKEN_KEY, token); } catch (_) { /* ignore */ }
    const path = `/digitalize/c/${encodeURIComponent(token)}`;
    if (window.location.pathname !== path) {
        window.history.replaceState(null, '', path);
    }
}

function tokenFromPath() {
    const match = window.location.pathname.match(/\/digitalize\/c\/([^/?#]+)/);
    return match ? decodeURIComponent(match[1]) : '';
}

/**
 * Forgets this browser's resumable link and returns to the login doors —
 * the only way back to a fresh start once a session exists. The lead
 * itself isn't deleted server-side; this just clears what THIS device
 * remembers, same as losing the link and needing to sign in again.
 */
function resetSession() {
    try { localStorage.removeItem(TOKEN_KEY); } catch (_) { /* ignore */ }
    state.token = '';
    state.session = null;
    state.crescimento = null;
    state.lastNivel = null;
    window.history.replaceState(null, '', '/digitalize');
    renderLogin();
}

async function loadTipos() {
    if (state.tipos.length) return state.tipos;
    const { tipos } = await api('/tipos');
    state.tipos = tipos;
    return tipos;
}

async function refreshSession() {
    const previousNivel = state.session ? state.session.nivel : null;
    state.session = await api(`/sessoes/${encodeURIComponent(state.token)}`);
    if (state.lastNivel === null) state.lastNivel = state.session.nivel;
    else if (previousNivel !== null && state.session.nivel > previousNivel) {
        flash(`O seu negócio subiu para Nível ${state.session.nivel} · ${state.session.nivelNome}.`, 'wa');
        state.lastNivel = state.session.nivel;
    }
    return state.session;
}

async function loadCrescimento(force) {
    if (state.crescimento && !force) return state.crescimento;
    state.crescimento = await api(`/sessoes/${encodeURIComponent(state.token)}/crescimento`);
    return state.crescimento;
}

// ---------- Notifications ----------
function toast(message) {
    document.querySelectorAll('.dz-toast').forEach((n) => n.remove());
    const node = el('div', 'dz-toast', message);
    document.body.appendChild(node);
    setTimeout(() => node.remove(), 2600);
}

let flashTimer = null;
function flash(message, kind) {
    clearTimeout(flashTimer);
    document.querySelectorAll('.dz-flash').forEach((n) => n.remove());
    const node = el('div', 'dz-flash');
    const dot = el('div', `dz-flash-dot${kind === 'wa' ? ' is-wa' : ''}`);
    const body = el('div');
    body.appendChild(el('div', 'dz-flash-from', kind === 'wa' ? 'WhatsApp · agora' : 'Digitalize · agora'));
    body.appendChild(el('div', 'dz-flash-text', message));
    node.append(dot, body);
    document.body.appendChild(node);
    flashTimer = setTimeout(() => node.remove(), 4200);
}

// ---------- Shell ----------
// Every screen shares this: a fixed header (back / kicker / points) and a
// scrolling body — the page itself never scrolls (see app.css), only this.
function shell({ back, points, progressCurrent, progressTotal } = {}) {
    const root = document.getElementById('app');
    root.innerHTML = '';
    const screen = el('div', 'dz-screen');
    const topbar = el('div', 'dz-topbar');
    const backBtn = el('button', 'dz-back', '‹');
    backBtn.type = 'button';
    backBtn.disabled = !back;
    if (back) backBtn.addEventListener('click', back);
    topbar.appendChild(backBtn);
    if (progressTotal) {
        const bar = el('div', 'dz-progress');
        for (let i = 0; i < progressTotal; i += 1) {
            bar.appendChild(el('div', `dz-progress-bit${i < progressCurrent ? ' is-done' : ''}`));
        }
        topbar.appendChild(bar);
    } else {
        topbar.appendChild(el('div', 'dz-spacer'));
    }
    if (typeof points === 'number') topbar.appendChild(el('span', 'dz-points', `${points} pts`));
    screen.appendChild(topbar);
    const scroll = el('div', 'dz-scroll');
    screen.appendChild(scroll);
    root.appendChild(screen);
    return { screen, scroll };
}

function footerOf(screen) {
    const footer = el('div', 'dz-node-footer');
    screen.appendChild(footer);
    return footer;
}

// ---------- Islands & nodes ----------
// chave/campo names for Ilha 1 match the original linear flow exactly, so
// a points ledger from before this rewrite still resolves correctly.
const ISLANDS = [
    { kicker: 'Ilha 1', title: 'O seu negócio', sub: 'Grátis, sem cartão. Perguntas de um toque.' },
    { kicker: 'Ilha 2', title: 'No ar', sub: 'Endereço, faturação e pagamento. Depois disto nada volta a estar fechado.' },
    { kicker: 'Ilha 3', title: 'Ser encontrado', sub: 'O Google — tudo grátis, tudo com texto já escrito.' },
    { kicker: 'Ilha 4', title: 'Ser partilhado', sub: 'Onde as pessoas já estão: WhatsApp, Instagram, QR.' },
    { kicker: 'Ilha 5', title: 'Crescer', sub: 'Nunca fica completa — vale a pena voltar.' }
];

const HORARIOS_SUGERIDOS = [
    'Seg–Sex, 9h–18h',
    'Seg–Sáb, 9h–19h',
    'Seg–Sáb, 9h–13h e 14h–19h',
    'Ter–Sáb, 9h–19h',
    'Seg–Dom, 9h–20h',
    '24 horas, todos os dias',
    'Só com marcação',
    'A combinar por telefone'
];
const DIAS_SEMANA = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const HORAS_DIA = Array.from({ length: 19 }, (_, i) => i + 6); // 6h .. 24h

const NODES = [
    // Ilha 1
    { id: 'tipo', isl: 0, chave: 'q1_tipo', pts: 20, kind: 'tipo', titulo: 'Tem loja ou vai a casa das pessoas?', lede: 'Isto muda o site todo. É a única pergunta grande.' },
    { id: 'nome', isl: 0, chave: 'q2_nome', pts: 20, campo: 'nome_negocio', suggestCampo: 'google_nome', kind: 'confirm', titulo: 'Como se chama o negócio?', lede: 'É o que vai aparecer no topo do site.', placeholder: 'Ex.: Canalizações Ferreira' },
    { id: 'oficio', isl: 0, chave: 'q3_oficio', pts: 40, campo: 'o_que_faz', kind: 'descricao', titulo: 'O que faz, em poucas palavras?', lede: 'Escolha a frase mais parecida — ou escreva a sua.' },
    { id: 'zonas', isl: 0, chave: 'q4_zonas', pts: 30, campo: 'cidade', kind: 'cidade', titulo: 'Onde trabalha?', lede: 'Pode escolher mais do que uma.', placeholder: 'Nome da cidade ou concelho' },
    { id: 'contacto', isl: 0, chave: 'q5_telefone', pts: 40, campo: 'telefone', kind: 'texto', inputType: 'tel', titulo: 'Qual o telefone / WhatsApp?', lede: 'É como os clientes o contactam a partir do site.', placeholder: '9xx xxx xxx' },
    { id: 'servicos', isl: 0, chave: 'q6_servicos', pts: 40, campo: 'servicos_passo_estado', kind: 'servicos', titulo: 'Quais são os seus serviços?', lede: 'Escolha da lista — não precisa de escrever nada.' },
    { id: 'horario', isl: 0, chave: 'q7_horario', pts: 40, campo: 'horario', kind: 'horario', titulo: 'Quando trabalha?', lede: 'O horário que aparece no site.' },
    { id: 'estilo', isl: 0, chave: 'q8_estilo', pts: 20, campo: 'paleta_escolhida', kind: 'paleta', titulo: 'Que estilo lhe agrada?', lede: 'Três paletas — pode mudar mais tarde.' },
    { id: 'preview', isl: 0, pts: 0, kind: 'preview', titulo: 'O seu site.', lede: 'Feito com o que respondeu. Ainda não está no ar.' },
    // Ilha 2 — no points; gated only by reaching it, never locked behind payment
    { id: 'dominio', isl: 1, pts: 0, campo: 'dominio_escolhido', kind: 'dominio', titulo: 'Que endereço quer?', lede: 'O próprio é o que as pessoas escrevem no telemóvel.' },
    { id: 'contrato', isl: 1, pts: 0, campo: 'contrato_passo_estado', kind: 'contrato', titulo: 'O seu nome, para a fatura', lede: 'O resto vem já preenchido do que respondeu.' },
    { id: 'pagar', isl: 1, pts: 0, kind: 'pagar', titulo: 'Falta um passo para o seu negócio ficar online.', lede: '49 €, uma vez. Sem mensalidades. As alterações são sempre grátis.' },
    // Ilha 3 — Google (not built yet, informational stub, locked until paid)
    { id: 'google_ligar', isl: 2, pts: 80, kind: 'howto', titulo: 'Ligar à sua ficha do Google.', lede: 'Se ligar a ficha, vários passos ficam feitos de uma vez.' },
    { id: 'google_fotos', isl: 2, pts: 40, kind: 'howto', titulo: 'Fotos no Google.' },
    { id: 'google_descricao', isl: 2, pts: 40, kind: 'howto', titulo: 'Descrição e serviços no Google.' },
    { id: 'google_avaliacao', isl: 2, pts: 60, kind: 'howto', titulo: 'Pedir uma avaliação.', lede: 'A um cliente de quem tem o número. Grátis para sempre.' },
    // Ilha 4 — locked until paid
    { id: 'whatsapp_ok', isl: 3, pts: 40, kind: 'whatsapp', titulo: 'WhatsApp a funcionar.', lede: 'Toque para testar o botão do seu site. Se abrir conversa, está feito.' },
    { id: 'instagram_link', isl: 3, pts: 60, campo: 'instagram', kind: 'link', titulo: 'Link no Instagram.', lede: 'Conta sozinho na primeira visita que venha do Instagram.', placeholder: '@utilizador ou link' },
    { id: 'facebook_link', isl: 3, pts: 40, campo: 'facebook', kind: 'link', titulo: 'Link no Facebook.', lede: 'O link da sua página no site.', placeholder: 'facebook.com/…' },
    { id: 'qr_code', isl: 3, pts: 30, kind: 'qr', titulo: 'Códigos QR para imprimir.', lede: 'Para a furgoneta, o orçamento e a porta.' },
    // Ilha 5 — always shown as "sempre aberto", still gated by paid like the rest of islands 3/4
    { id: 'foto_extra', isl: 4, pts: 25, kind: 'howto', titulo: 'Adicionar uma fotografia.', lede: 'Um trabalho que acabou esta semana serve.' },
    { id: 'servico_extra', isl: 4, pts: 25, kind: 'servicos', titulo: 'Acrescentar um serviço.', lede: 'Sempre aberto — pode voltar quando quiser.' },
    { id: 'zona_extra', isl: 4, pts: 25, campo: 'cidade', kind: 'link', titulo: 'Acrescentar uma zona.', lede: 'Outra cidade ou concelho onde também trabalha.', placeholder: 'Ex.: Porto, Gaia, Matosinhos' },
    { id: 'certificacao_extra', isl: 4, pts: 25, campo: 'certificacoes', kind: 'link', titulo: 'Adicionar alvará ou certificação.', lede: 'Mostra a quem procura que é profissional.', placeholder: 'Ex.: Alvará nº…' }
];

function findNode(id) {
    return NODES.find((n) => n.id === id) || null;
}

function islandLocked(isl) {
    return isl > 1 && !(state.session && state.session.pago);
}

// Crescimento items (islands 2-4) carry their own feito/disponivel/pontos —
// computed server-side by /crescimento. Ilha 1/2 done-ness comes from the
// dossier fields directly, same check the old linear flow used to resume.
function crescimentoItem(nodeId) {
    const c = state.crescimento;
    if (!c) return null;
    return c.ilha3.find((i) => i.chave === nodeId) || c.ilha4.find((i) => i.chave === nodeId) || c.ilha5.find((i) => i.chave === nodeId) || null;
}

function isNodeDone(node) {
    const d = (state.session && state.session.dados) || {};
    if (node.isl >= 2) {
        const item = crescimentoItem(node.id);
        return item ? Boolean(item.feito) : false;
    }
    if (node.id === 'tipo') return Boolean(state.session && state.session.businessTypeId && state.session.businessTypeId !== 'generico');
    if (node.id === 'preview') return Boolean(d.dominio_escolhido) || Boolean(state.session && state.session.pago);
    if (node.id === 'pagar') return Boolean(state.session && state.session.pago);
    if (node.campo) return Boolean(clean(d[node.campo]));
    return false;
}

function isNodeAvailable(node) {
    if (islandLocked(node.isl)) return false;
    return true;
}

/** First not-done, available node — what the map pulses and what "keep going" opens. */
function currentNodeId() {
    const found = NODES.find((n) => isNodeAvailable(n) && !isNodeDone(n));
    return found ? found.id : null;
}

function nextNodeAfter(nodeId) {
    const idx = NODES.findIndex((n) => n.id === nodeId);
    for (let i = idx + 1; i < NODES.length; i += 1) {
        if (isNodeAvailable(NODES[i]) && !isNodeDone(NODES[i])) return NODES[i].id;
    }
    return null;
}

/**
 * Shared "answer accepted" path: patch the dossier (if any), award points
 * (if any), refresh, then go straight into the next open node — never back
 * to the map first. The map is for overview/re-editing, not the main loop.
 */
async function completeNode(node, patch) {
    // Islands 2+ (Google/social/growth) share one ledger namespace with the
    // admin-side quick-edit modals that predate this screen, so their keys
    // are prefixed to avoid colliding with an Ilha-1 chave of the same name.
    const chave = node.chave || (node.isl >= 2 ? `crescer_${node.id}` : null);
    if (patch && Object.keys(patch).length) {
        const body = { patch };
        if (chave && node.pts) { body.chave = chave; body.pontos = node.pts; }
        await api(`/sessoes/${encodeURIComponent(state.token)}/dados`, { method: 'PATCH', body });
    } else if (chave && node.pts) {
        await api(`/sessoes/${encodeURIComponent(state.token)}/dados`, { method: 'PATCH', body: { patch: {}, chave, pontos: node.pts } });
    }
    await refreshSession();
    if (node.isl >= 2) await loadCrescimento(true);
    const next = nextNodeAfter(node.id);
    if (next) return renderNode(next);
    return renderPath();
}

// ---------- Login (two doors) ----------
async function ensureSession() {
    if (state.token && state.session) return state.session;
    const { token } = await api('/sessoes', { method: 'POST' });
    persistToken(token);
    return refreshSession();
}

const ICON_WHATSAPP_SVG = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38c1.45.79 3.08 1.21 4.79 1.21h.01c5.46 0 9.9-4.45 9.9-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0012.04 2zm0 18.15h-.01a8.2 8.2 0 01-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.22 8.22 0 01-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24 2.2 0 4.27.86 5.83 2.42a8.18 8.18 0 012.41 5.83c0 4.55-3.7 8.24-8.24 8.24zm4.52-6.17c-.25-.12-1.47-.72-1.69-.81-.23-.08-.4-.12-.56.13-.17.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-2-1.23-.74-.66-1.24-1.47-1.39-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.12-.14.16-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.35-.77-1.85-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.23.25-.86.84-.86 2.05s.88 2.38 1 2.54c.13.17 1.73 2.64 4.2 3.7.59.25 1.05.4 1.4.52.59.19 1.13.16 1.55.1.47-.07 1.47-.6 1.68-1.18.2-.58.2-1.08.14-1.18-.06-.1-.23-.16-.48-.28z"/></svg>';

let googleScriptPromise = null;
function loadGoogleIdentityScript() {
    if (window.google && window.google.accounts && window.google.accounts.id) return Promise.resolve();
    if (googleScriptPromise) return googleScriptPromise;
    googleScriptPromise = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://accounts.google.com/gsi/client';
        s.async = true;
        s.defer = true;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error('Não consegui carregar o Google.'));
        document.head.appendChild(s);
    });
    return googleScriptPromise;
}

async function enterFlow() {
    // Nothing answered yet — first time through a door, so show the welcome
    // banner once before the first real question. Returning mid-flow skips it.
    if (state.session && state.session.pontos === 0) { renderWelcomeBanner(); return; }
    const first = currentNodeId() || NODES[0].id;
    renderNode(first);
}

async function onGoogleCredential(response) {
    try {
        await ensureSession();
        await api(`/sessoes/${encodeURIComponent(state.token)}/auth/google`, { method: 'POST', body: { credential: response.credential } });
        await refreshSession();
        await enterFlow();
    } catch (err) {
        toast(err.message || 'Não consegui validar a conta Google.');
    }
}

async function renderGoogleDoor(container) {
    let cfg = { googleConfigured: false };
    try { cfg = await api('/config'); } catch (_) { /* fall through to disabled state below */ }

    if (!cfg.googleConfigured) {
        const btn = el('button', 'dz-door dz-door-google');
        btn.type = 'button';
        const badge = el('div', 'dz-door-badge', 'G');
        badge.style.cssText += 'background:#12261c;color:#f4f1ea;';
        btn.append(badge, el('div', '', 'Continuar com Google'));
        btn.addEventListener('click', () => toast('Login com Google ainda não está configurado.'));
        container.appendChild(btn);
        return;
    }

    try {
        await loadGoogleIdentityScript();
        window.google.accounts.id.initialize({ client_id: cfg.googleClientId, callback: onGoogleCredential });
        const holder = el('div', 'dz-google-btn-holder');
        container.appendChild(holder);
        window.google.accounts.id.renderButton(holder, {
            // filled_white, not filled_black — a black pill barely reads against the
            // dark green login screen, and white matches the disabled-state fallback below.
            type: 'standard', theme: 'filled_white', size: 'large', shape: 'pill',
            text: 'continue_with', logo_alignment: 'left', width: 336, locale: 'pt_PT'
        });
    } catch (_) {
        const btn = el('button', 'dz-door dz-door-google');
        btn.type = 'button';
        btn.append(el('div', '', 'Continuar com Google'));
        btn.addEventListener('click', () => toast('Não consegui carregar o Google agora. Tente de novo.'));
        container.appendChild(btn);
    }
}

function renderWhatsAppDoor(container) {
    const waBtn = el('button', 'dz-door dz-door-wa');
    waBtn.type = 'button';
    const waBadge = el('div', 'dz-door-badge');
    waBadge.style.color = '#fff';
    waBadge.innerHTML = ICON_WHATSAPP_SVG;
    waBtn.append(waBadge, el('div', '', 'Continuar com o meu número'));

    const form = el('div', 'dz-wa-form');
    form.style.display = 'none';
    const input = el('input', 'dz-input');
    input.type = 'tel';
    input.placeholder = 'O seu número de WhatsApp — 9xx xxx xxx';
    const submitBtn = el('button', 'dz-btn dz-btn-primary', 'Continuar');
    submitBtn.type = 'button';
    form.append(input, submitBtn);

    waBtn.addEventListener('click', () => {
        waBtn.style.display = 'none';
        form.style.display = 'flex';
        input.focus();
    });

    const submit = async () => {
        const digits = clean(input.value).replace(/[^\d+]/g, '');
        if (digits.replace(/\D/g, '').length < 9) { toast('Escreva um número de telemóvel válido.'); return; }
        submitBtn.disabled = true;
        try {
            await ensureSession();
            await api(`/sessoes/${encodeURIComponent(state.token)}/dados`, {
                method: 'PATCH', body: { patch: { telefone: digits, whatsapp: digits } }
            });
            await refreshSession();
            await enterFlow();
        } catch (err) {
            toast(err.message || 'Não consegui começar.');
            submitBtn.disabled = false;
        }
    };
    submitBtn.addEventListener('click', submit);
    input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); submit(); } });

    container.append(waBtn, form);
}

// Real one-time-code sign-in by email — sent through the site's own SMTP
// setup, verified server-side, no third-party account required. Tucked
// under the two main doors since it's the slower fallback, not the default.
async function renderEmailDoor(container) {
    let cfg = { emailConfigured: false };
    try { cfg = await api('/config'); } catch (_) { /* fall through — link still shown, click reports the real reason */ }

    const link = el('button', 'dz-login-other-link', 'Também pode entrar por email.');
    link.type = 'button';
    const wrap = el('div', 'dz-email-form');
    wrap.style.display = 'none';
    container.append(link, wrap);

    let stage = 'email';
    let sentTo = '';

    const paint = () => {
        wrap.innerHTML = '';
        if (stage === 'email') {
            const input = el('input', 'dz-input');
            input.type = 'email';
            input.placeholder = 'oseuemail@exemplo.pt';
            const btn = el('button', 'dz-btn dz-btn-primary', 'Enviar código');
            btn.type = 'button';
            const submit = async () => {
                const value = clean(input.value);
                if (!value) { toast('Escreva o seu email.'); return; }
                if (!cfg.emailConfigured) { toast('Login por email ainda não está configurado.'); return; }
                btn.disabled = true;
                try {
                    await ensureSession();
                    await api(`/sessoes/${encodeURIComponent(state.token)}/auth/email/request`, { method: 'POST', body: { email: value } });
                    sentTo = value;
                    stage = 'code';
                    paint();
                } catch (err) {
                    toast(err.message || 'Não consegui enviar o código.');
                    btn.disabled = false;
                }
            };
            btn.addEventListener('click', submit);
            input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); submit(); } });
            wrap.append(input, btn);
            setTimeout(() => input.focus(), 30);
        } else {
            const hint = el('p', 'dz-hint', `Enviámos um código para ${sentTo}.`);
            hint.style.color = 'rgba(244, 241, 234, 0.6)';
            const input = el('input', 'dz-input');
            input.type = 'text';
            input.inputMode = 'numeric';
            input.placeholder = '123456';
            const btn = el('button', 'dz-btn dz-btn-primary', 'Confirmar');
            btn.type = 'button';
            const submit = async () => {
                const code = clean(input.value);
                if (!code) { toast('Escreva o código recebido.'); return; }
                btn.disabled = true;
                try {
                    await api(`/sessoes/${encodeURIComponent(state.token)}/auth/email/verify`, { method: 'POST', body: { email: sentTo, code } });
                    await refreshSession();
                    await enterFlow();
                } catch (err) {
                    toast(err.message || 'Código inválido.');
                    btn.disabled = false;
                }
            };
            btn.addEventListener('click', submit);
            input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); submit(); } });
            const back = el('button', 'dz-login-other-link', 'Usar outro email');
            back.type = 'button';
            back.addEventListener('click', () => { stage = 'email'; paint(); });
            wrap.append(hint, input, btn, back);
            setTimeout(() => input.focus(), 30);
        }
    };

    link.addEventListener('click', () => {
        link.style.display = 'none';
        wrap.style.display = 'flex';
        paint();
    });
}

function renderLogin() {
    const root = document.getElementById('app');
    root.innerHTML = '';
    const screen = el('div', 'dz-screen');
    const topbar = el('div', 'dz-topbar');
    topbar.appendChild(el('div', 'dz-back')); // spacer, no back on the very first screen
    screen.appendChild(topbar);
    const scroll = el('div', 'dz-scroll');
    screen.appendChild(scroll);
    root.appendChild(screen);

    // Kept deliberately short — this audience mostly doesn't read long copy,
    // so the doors themselves are the content, not the paragraph above them.
    const login = el('div', 'dz-login-screen');
    login.appendChild(el('div', 'dz-login-kicker', 'DIGITALIZE'));
    login.appendChild(el('h1', 'dz-login-title', 'Vamos começar.'));

    const doors = el('div');
    doors.style.cssText = 'display:flex;flex-direction:column;gap:11px;margin-top:26px';
    // Fixed slots, appended synchronously in order — renderGoogleDoor fills
    // its slot after an async /config fetch, which must not push it below
    // the (synchronous) WhatsApp door.
    const googleSlot = el('div');
    const waSlot = el('div');
    doors.append(googleSlot, waSlot);
    renderGoogleDoor(googleSlot);
    renderWhatsAppDoor(waSlot);
    login.appendChild(doors);

    const emailSlot = el('div');
    login.appendChild(emailSlot);
    renderEmailDoor(emailSlot);

    scroll.appendChild(login);
}

// One-time welcome banner shown right after the very first login, before the
// first real question — the marketing pitch lives here, not on the door
// screen, so the doors aren't competing with a wall of text for attention.
function renderWelcomeBanner() {
    const root = document.getElementById('app');
    root.innerHTML = '';
    const screen = el('div', 'dz-screen');
    const topbar = el('div', 'dz-topbar');
    topbar.appendChild(el('div', 'dz-back'));
    screen.appendChild(topbar);
    const scroll = el('div', 'dz-scroll');
    screen.appendChild(scroll);
    root.appendChild(screen);

    const banner = el('div', 'dz-login-screen');
    banner.appendChild(el('div', 'dz-login-kicker', 'DIGITALIZE O SEU NEGÓCIO'));
    banner.appendChild(el('h1', 'dz-login-title', 'Coloque-o nas nuvens, onde todos podem ver.'));
    banner.appendChild(el('p', 'dz-login-body', 'O seu negócio no ar de forma simples e prática — sem precisar chamar o seu sobrinho.'));

    const startBtn = el('button', 'dz-door dz-door-google', 'Vamos começar');
    startBtn.type = 'button';
    startBtn.style.marginTop = '26px';
    startBtn.addEventListener('click', () => renderNode(currentNodeId() || NODES[0].id));
    banner.appendChild(startBtn);

    scroll.appendChild(banner);
}

// ---------- Path (map of islands) ----------
function renderPath() {
    const { scroll } = shell({ points: state.session ? state.session.pontos : 0 });
    Promise.all([loadCrescimento(), Promise.resolve()]).catch(() => {}).then(() => paintPath(scroll));
    paintPath(scroll); // paint immediately with whatever we already have; repaint once crescimento resolves
}

function paintPath(scroll) {
    scroll.innerHTML = '';
    const sess = state.session;
    if (!sess) return;

    const head = el('div', 'dz-path-head');
    const headText = el('div');
    headText.style.flex = '1';
    headText.style.minWidth = '0';
    headText.appendChild(el('div', 'dz-path-headtitle', `Nível ${sess.nivel} · ${sess.nivelNome}`));
    const gap = sess.proximoNivelEm ? `Faltam ${sess.proximoNivelEm - sess.pontos} pontos para o Nível ${sess.nivel + 1}` : 'Está tudo tratado';
    headText.appendChild(el('div', 'dz-path-headsub', gap));
    head.appendChild(headText);
    const helpBtn = el('button', 'dz-path-help', '?');
    helpBtn.type = 'button';
    helpBtn.addEventListener('click', renderAjuda);
    head.appendChild(helpBtn);
    scroll.appendChild(head);

    const bar = el('div', 'dz-path-bar');
    const fill = el('div', 'dz-path-bar-fill');
    const pct = sess.proximoNivelEm ? Math.max(4, Math.round((sess.pontos / sess.proximoNivelEm) * 100)) : 100;
    fill.style.width = `${pct}%`;
    bar.appendChild(fill);
    scroll.appendChild(bar);

    const curId = currentNodeId();

    ISLANDS.forEach((isl, ii) => {
        const nodes = NODES.filter((n) => n.isl === ii);
        const allDone = nodes.every((n) => isNodeDone(n));
        const locked = islandLocked(ii);
        const dark = ii === 1 && !(sess.pago);

        const wrap = el('div', 'dz-island');
        const headEl = el('div', `dz-island-head${dark ? ' is-dark' : locked ? ' is-locked' : ''}`);
        const body = el('div');
        body.style.flex = '1';
        body.style.minWidth = '0';
        body.appendChild(el('div', 'dz-island-kicker', isl.kicker));
        body.appendChild(el('div', 'dz-island-title', isl.title));
        body.appendChild(el('div', 'dz-island-sub', isl.sub));
        headEl.appendChild(body);
        const badgeText = ii === 4 ? 'Sempre aberto' : allDone ? 'Feito' : locked ? 'Depois' : 'A seguir';
        headEl.appendChild(el('div', 'dz-island-badge', badgeText));
        wrap.appendChild(headEl);

        if (dark) {
            wrap.appendChild(el('div', 'dz-island-gate', 'As ilhas 3, 4 e 5 estão logo ali — vê exatamente o que está a comprar.'));
        }

        const list = el('div');
        nodes.forEach((n, ni) => {
            const done = isNodeDone(n);
            const isCur = n.id === curId;
            const lock = locked;
            const row = el('div', `dz-node-row${lock ? ' is-locked' : ''}`);
            row.id = `nd-${n.id}`;

            const rail = el('div', 'dz-node-rail');
            const conn = el('div', `dz-node-conn${done ? ' is-done' : ''}`);
            if (ni === 0) conn.style.top = '0';
            rail.appendChild(conn);
            const dot = el('button', `dz-node-dot${done ? ' is-done' : isCur ? ' is-current' : ''}`);
            dot.type = 'button';
            if (isCur && !done) dot.appendChild(el('div', 'dz-node-pulse'));
            dot.appendChild(el('span', '', done ? '✓' : String(ni + 1)));
            rail.appendChild(dot);

            const item = n.isl >= 2 ? crescimentoItem(n.id) : null;
            const title = n.titulo.replace(/[?.]$/, '');
            const sub = item && item.nota ? item.nota : (n.lede || n.titulo);
            const ptsLabel = n.pts ? (done ? `${n.pts} pts` : `+${n.pts}`) : '';

            const card = el('div', `dz-node-card${isCur && !done ? ' is-current' : ''}${done ? ' is-done' : ''}`);
            const cardBody = el('div');
            cardBody.style.flex = '1';
            cardBody.style.minWidth = '0';
            cardBody.appendChild(el('div', 'dz-node-title', title));
            cardBody.appendChild(el('div', 'dz-node-sub', sub));
            card.appendChild(cardBody);
            if (ptsLabel) card.appendChild(el('span', 'dz-node-pts', ptsLabel));

            const tap = () => {
                if (lock) { flash('Isto abre assim que o site estiver no ar.'); return; }
                if (item && item.disponivel === false) { flash(item.nota || 'Em breve.'); return; }
                renderNode(n.id);
            };
            dot.addEventListener('click', tap);
            card.addEventListener('click', tap);

            row.append(rail, card);
            list.appendChild(row);
        });
        wrap.appendChild(list);
        scroll.appendChild(wrap);
    });

    scroll.appendChild(el('p', 'dz-path-foot', 'O nível nunca desce e nada do que se paga soma pontos.'));

    setTimeout(() => {
        const cur = curId && scroll.querySelector(`#nd-${CSS.escape(curId)}`);
        if (cur) scroll.scrollTop = Math.max(0, cur.offsetTop - 140);
    }, 60);
}

// ---------- Node dispatcher ----------
function renderNode(nodeId) {
    const node = findNode(nodeId);
    if (!node) return renderPath();
    if (node.isl >= 2 && !state.crescimento) {
        loadCrescimento().then(() => renderNode(nodeId));
        return;
    }
    const done = isNodeDone(node);
    const { screen, scroll } = shell({ back: renderPath, points: state.session ? state.session.pontos : 0 });
    scroll.appendChild(el('p', 'dz-kicker', ISLANDS[node.isl].kicker.toUpperCase()));
    scroll.appendChild(el('h1', 'dz-h1', node.titulo));
    const hint = done ? 'Já respondeu. Pode mudar aqui.' : node.lede;
    if (hint) scroll.appendChild(el('p', 'dz-node-hint', hint));

    const builders = {
        tipo: bodyTipo, texto: bodyTexto, cidade: bodyCidade, confirm: bodyConfirm, descricao: bodyDescricao, servicos: bodyServicos,
        horario: bodyHorario, paleta: bodyPaleta, preview: bodyPreview, dominio: bodyDominio,
        contrato: bodyContrato, pagar: bodyPagar, howto: bodyHowto, whatsapp: bodyWhatsapp,
        link: bodyLink, qr: bodyQr
    };
    const builder = builders[node.kind];
    if (builder) builder(node, { screen, scroll, done });
    else scroll.appendChild(el('p', 'dz-node-hint', 'Este passo ainda não está disponível.'));
}

// ---- kind: tipo (archetype + trade grid, combined) ----
function bodyTipo(node, { screen }) {
    const scroll = screen.querySelector('.dz-scroll');
    const choices = el('div', 'dz-choices');
    choices.style.marginTop = '18px';
    const zonaBtn = el('button', 'dz-choice');
    zonaBtn.type = 'button';
    zonaBtn.appendChild(el('p', 'dz-choice-label', 'Vou a casa das pessoas'));
    zonaBtn.appendChild(el('p', 'dz-choice-desc', 'Serviços em zonas — canalizador, eletricista, limpezas.'));
    const lojaBtn = el('button', 'dz-choice');
    lojaBtn.type = 'button';
    lojaBtn.appendChild(el('p', 'dz-choice-label', 'Tenho loja ou espaço'));
    lojaBtn.appendChild(el('p', 'dz-choice-desc', 'As pessoas vão até si — cabeleireiro, oficina, café.'));
    choices.append(zonaBtn, lojaBtn);
    scroll.appendChild(choices);

    const gridWrap = el('div');
    gridWrap.style.marginTop = '18px';
    scroll.appendChild(gridWrap);

    const footer = footerOf(screen);
    const nextBtn = el('button', 'dz-btn dz-btn-primary', 'Continuar');
    nextBtn.type = 'button';
    nextBtn.disabled = true;
    footer.appendChild(nextBtn);

    let selectedTypeId = state.session ? state.session.businessTypeId : '';
    let archetype = selectedTypeId && selectedTypeId !== 'generico' ? (TIPOS_ZONA.has(selectedTypeId) ? 'zona' : 'loja') : '';

    async function paintTypes() {
        gridWrap.innerHTML = '';
        if (!archetype) return;
        const tipos = await loadTipos();
        const filtered = tipos.filter((t) => t.id !== 'generico' && (TIPOS_ZONA.has(t.id) === (archetype === 'zona')));
        gridWrap.appendChild(el('p', 'dz-field-label', 'Qual destes é o seu?'));
        const grid = el('div', 'dz-type-grid');
        filtered.forEach((t) => {
            const chip = el('button', `dz-type-chip${t.id === selectedTypeId ? ' is-selected' : ''}`, t.nome);
            chip.type = 'button';
            chip.addEventListener('click', () => { selectedTypeId = t.id; nextBtn.disabled = false; paintTypes(); });
            grid.appendChild(chip);
        });
        gridWrap.appendChild(grid);
    }

    function selectArchetype(next) {
        archetype = next;
        zonaBtn.classList.toggle('is-selected', next === 'zona');
        lojaBtn.classList.toggle('is-selected', next === 'loja');
        nextBtn.disabled = true;
        paintTypes();
    }
    zonaBtn.addEventListener('click', () => selectArchetype('zona'));
    lojaBtn.addEventListener('click', () => selectArchetype('loja'));
    if (archetype) {
        zonaBtn.classList.toggle('is-selected', archetype === 'zona');
        lojaBtn.classList.toggle('is-selected', archetype === 'loja');
        nextBtn.disabled = !selectedTypeId;
        paintTypes();
    }

    nextBtn.addEventListener('click', async () => {
        if (!selectedTypeId) return;
        nextBtn.disabled = true;
        try {
            await completeNode(node, { businessTypeId: selectedTypeId });
        } catch (err) {
            toast(err.message || 'Não consegui guardar.');
            nextBtn.disabled = false;
        }
    });
}

// ---- kind: texto (single-line, auto-focus, Enter submits) ----
function bodyTexto(node, { screen }) {
    const scroll = screen.querySelector('.dz-scroll');
    const field = el('div', 'dz-field');
    field.style.marginTop = '18px';
    const input = el('input', 'dz-input');
    input.type = node.inputType || 'text';
    input.placeholder = node.placeholder || '';
    const d = (state.session && state.session.dados) || {};
    input.value = node.campo ? (d[node.campo] || '') : '';
    field.appendChild(input);
    scroll.appendChild(field);

    const footer = footerOf(screen);
    const nextBtn = el('button', 'dz-btn dz-btn-primary', 'Continuar');
    nextBtn.type = 'button';
    footer.appendChild(nextBtn);

    const submit = async () => {
        const value = clean(input.value);
        if (!value) { toast('Preencha antes de continuar.'); return; }
        nextBtn.disabled = true;
        try {
            await completeNode(node, { [node.campo]: value });
        } catch (err) {
            toast(err.message || 'Não consegui guardar.');
            nextBtn.disabled = false;
        }
    };
    nextBtn.addEventListener('click', submit);
    input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); submit(); } });
    setTimeout(() => input.focus(), 30);
}

// ---- kind: cidade (tap a city block instead of typing — same line-icon style throughout) ----
const ICON_CITY_PORTO_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 17c3-6 6-9 10-9s7 3 10 9"/><path d="M2 20h20"/><path d="M6 13v4M12 8v4M18 13v4"/></svg>';
const ICON_CITY_LISBOA_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="6" width="16" height="10" rx="2"/><path d="M4 10h16"/><path d="M8 6V4h8v2"/><circle cx="8" cy="19" r="1.4"/><circle cx="16" cy="19" r="1.4"/></svg>';
const ICON_CITY_BRAGA_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 20h4v-3h4v-3h4v-3h4v-3h2"/></svg>';
const ICON_CITY_COIMBRA_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 9l10-4 10 4-10 4-10-4z"/><path d="M6 11v4c0 1.5 2.5 3 6 3s6-1.5 6-3v-4"/><path d="M22 9v5"/></svg>';
const ICON_CITY_OUTRO_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s7-7.2 7-12a7 7 0 0 0-14 0c0 4.8 7 12 7 12z"/><path d="M12 8v4M10 10h4"/></svg>';

const CIDADES_PRINCIPAIS = [
    { id: 'Porto', nome: 'Porto', icon: ICON_CITY_PORTO_SVG },
    { id: 'Lisboa', nome: 'Lisboa', icon: ICON_CITY_LISBOA_SVG },
    { id: 'Braga', nome: 'Braga', icon: ICON_CITY_BRAGA_SVG },
    { id: 'Coimbra', nome: 'Coimbra', icon: ICON_CITY_COIMBRA_SVG },
    { id: 'Outro', nome: 'Outra cidade', icon: ICON_CITY_OUTRO_SVG }
];

function bodyCidade(node, { screen }) {
    const scroll = screen.querySelector('.dz-scroll');
    const d = (state.session && state.session.dados) || {};
    const knownIds = CIDADES_PRINCIPAIS.filter((c) => c.id !== 'Outro').map((c) => c.id);
    // Free-text, comma-joined value — bucket each already-saved piece into a known
    // city toggle or a custom chip, so revisiting this step round-trips either shape.
    const already = clean(d[node.campo]).split(',').map((s) => clean(s)).filter(Boolean);
    const selectedKnown = new Set(already.filter((v) => knownIds.includes(v)));
    const customCities = already.filter((v) => !knownIds.includes(v));
    let addOpen = false;

    const grid = el('div', 'dz-city-grid');
    grid.style.marginTop = '18px';
    scroll.appendChild(grid);

    const addWrap = el('div', 'dz-servicos-custom-row');
    addWrap.style.cssText = 'margin-top:14px;display:none';
    const addInput = el('input', 'dz-input');
    addInput.placeholder = 'Nome da cidade ou concelho';
    const addBtn = el('button', 'dz-servicos-custom-add', '+ Adicionar');
    addBtn.type = 'button';
    addWrap.append(addInput, addBtn);
    scroll.appendChild(addWrap);

    const chipsWrap = el('div', 'dz-servicos-grid');
    chipsWrap.style.cssText = 'margin-top:12px;display:none';
    scroll.appendChild(chipsWrap);

    const footer = footerOf(screen);
    const nextBtn = el('button', 'dz-btn dz-btn-primary', 'Continuar');
    nextBtn.type = 'button';
    footer.appendChild(nextBtn);

    function syncEnabled() {
        nextBtn.disabled = selectedKnown.size === 0 && customCities.length === 0;
    }

    function paintChips() {
        chipsWrap.innerHTML = '';
        chipsWrap.style.display = customCities.length ? 'flex' : 'none';
        customCities.forEach((nome, idx) => {
            const chip = el('button', 'dz-service-chip is-selected', `${nome}  ×`);
            chip.type = 'button';
            chip.addEventListener('click', () => { customCities.splice(idx, 1); paintChips(); syncEnabled(); });
            chipsWrap.appendChild(chip);
        });
    }

    function paintCards() {
        grid.innerHTML = '';
        CIDADES_PRINCIPAIS.forEach((c) => {
            const isOutro = c.id === 'Outro';
            const active = isOutro ? addOpen : selectedKnown.has(c.id);
            const card = el('button', `dz-city-card${active ? ' is-selected' : ''}`);
            card.type = 'button';
            const icon = el('div', 'dz-city-icon');
            icon.innerHTML = c.icon;
            card.append(icon, el('div', 'dz-city-name', c.nome));
            card.addEventListener('click', () => {
                if (isOutro) {
                    addOpen = !addOpen;
                    addWrap.style.display = addOpen ? 'flex' : 'none';
                    if (addOpen) setTimeout(() => addInput.focus(), 30);
                } else {
                    if (selectedKnown.has(c.id)) selectedKnown.delete(c.id); else selectedKnown.add(c.id);
                }
                paintCards();
                syncEnabled();
            });
            grid.appendChild(card);
        });
    }
    paintCards();
    addWrap.style.display = addOpen ? 'flex' : 'none';
    paintChips();
    syncEnabled();

    const addCustom = () => {
        const value = clean(addInput.value);
        if (!value) return;
        if (!customCities.some((v) => v.toLowerCase() === value.toLowerCase())) customCities.push(value);
        addInput.value = '';
        addInput.focus();
        paintChips();
        syncEnabled();
    };
    addBtn.addEventListener('click', addCustom);
    addInput.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); addCustom(); } });

    const submit = async () => {
        const value = [...selectedKnown, ...customCities].join(', ');
        if (!value) return;
        nextBtn.disabled = true;
        try {
            await completeNode(node, { [node.campo]: value });
        } catch (err) {
            toast(err.message || 'Não consegui guardar.');
            syncEnabled();
        }
    };
    nextBtn.addEventListener('click', submit);
}

// ---- kind: confirm (a suggested value from login — "É este? Sim / Corrigir") ----
function bodyConfirm(node) {
    const scroll = document.querySelector('.dz-scroll');
    const screen = document.querySelector('.dz-screen');
    const d = state.session.dados || {};
    const suggested = node.suggestCampo ? clean(d[node.suggestCampo]) : '';
    const already = clean(d[node.campo]);

    // Nothing to confirm — same plain text-input node as before.
    if (!suggested) { bodyTexto(node, { screen }); return; }

    let editing = Boolean(already) && already !== suggested;
    const wrap = el('div');
    wrap.style.marginTop = '18px';
    scroll.appendChild(wrap);
    const footer = footerOf(screen);

    function paint() {
        wrap.innerHTML = '';
        footer.innerHTML = '';
        if (!editing) {
            const card = el('div', 'dz-node-value dz-anim-pop');
            card.appendChild(el('div', 'dz-node-value-from', 'Vem da sua conta Google'));
            card.appendChild(el('div', 'dz-node-value-text', suggested));
            wrap.appendChild(card);

            const yesBtn = el('button', 'dz-btn dz-btn-primary', 'Sim, é este');
            yesBtn.type = 'button';
            yesBtn.addEventListener('click', async () => {
                yesBtn.disabled = true;
                try { await completeNode(node, { [node.campo]: suggested }); } catch (err) { toast(err.message || 'Não consegui guardar.'); yesBtn.disabled = false; }
            });
            const fixBtn = el('button', 'dz-btn dz-btn-ghost', 'Não, corrigir');
            fixBtn.type = 'button';
            fixBtn.addEventListener('click', () => { editing = true; paint(); });
            footer.append(yesBtn, fixBtn);
        } else {
            const field = el('div', 'dz-field');
            const input = el('input', 'dz-input');
            input.placeholder = node.placeholder || '';
            input.value = already || suggested;
            field.appendChild(input);
            wrap.appendChild(field);
            const saveBtn = el('button', 'dz-btn dz-btn-primary', 'Guardar');
            saveBtn.type = 'button';
            const submit = async () => {
                const value = clean(input.value);
                if (!value) { toast('Preencha antes de continuar.'); return; }
                saveBtn.disabled = true;
                try { await completeNode(node, { [node.campo]: value }); } catch (err) { toast(err.message || 'Não consegui guardar.'); saveBtn.disabled = false; }
            };
            saveBtn.addEventListener('click', submit);
            input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); submit(); } });
            footer.appendChild(saveBtn);
            setTimeout(() => input.focus(), 30);
        }
    }
    paint();
}

// ---- kind: descricao (3 ready phrases, tap = pick; "nenhuma" reveals text) ----
async function loadDescricoesSugeridas(businessTypeId) {
    const id = businessTypeId || 'generico';
    if (state.descricoesCatalog[id]) return state.descricoesCatalog[id];
    const { frases } = await api(`/tipos/${encodeURIComponent(id)}/descricoes`);
    state.descricoesCatalog[id] = frases || [];
    return state.descricoesCatalog[id];
}

function bodyDescricao(node, { screen }) {
    const scroll = screen.querySelector('.dz-scroll');
    const wrap = el('div');
    wrap.style.marginTop = '18px';
    wrap.appendChild(el('p', 'dz-hint', 'A carregar sugestões…'));
    scroll.appendChild(wrap);

    const footer = footerOf(screen);
    const nextBtn = el('button', 'dz-btn dz-btn-primary', 'Continuar');
    nextBtn.type = 'button';
    nextBtn.disabled = true;
    footer.appendChild(nextBtn);

    const d = (state.session && state.session.dados) || {};
    let selected = d[node.campo] || '';
    let customMode = false;
    let customInput = null;

    function paint(frases) {
        wrap.innerHTML = '';
        const grid = el('div', 'dz-choices');
        frases.forEach((frase) => {
            const btn = el('button', `dz-choice${!customMode && selected === frase ? ' is-selected' : ''}`);
            btn.type = 'button';
            btn.appendChild(el('p', 'dz-choice-label', frase));
            btn.addEventListener('click', async () => {
                customMode = false;
                selected = frase;
                nextBtn.disabled = true;
                try { await completeNode(node, { [node.campo]: selected }); } catch (err) { toast(err.message || 'Não consegui guardar.'); nextBtn.disabled = false; }
            });
            grid.appendChild(btn);
        });
        wrap.appendChild(grid);

        const customBtn = el('button', `dz-choice${customMode ? ' is-selected' : ''}`);
        customBtn.type = 'button';
        customBtn.style.marginTop = '10px';
        customBtn.appendChild(el('p', 'dz-choice-label', 'Nenhuma destas — escrever a minha'));
        customBtn.addEventListener('click', () => { customMode = true; paint(frases); });
        wrap.appendChild(customBtn);

        if (customMode) {
            const field = el('div', 'dz-field');
            field.style.marginTop = '10px';
            customInput = el('textarea', 'dz-textarea');
            customInput.placeholder = 'Ex.: Canalizador ao domicílio, fugas e desentupimentos.';
            customInput.value = frases.includes(selected) ? '' : selected;
            customInput.addEventListener('input', () => { nextBtn.disabled = !clean(customInput.value); });
            field.appendChild(customInput);
            wrap.appendChild(field);
            nextBtn.disabled = !clean(customInput.value);
            customInput.focus();
        } else {
            nextBtn.disabled = true;
        }
    }

    loadDescricoesSugeridas(state.session.businessTypeId).then((frases) => {
        if (!frases.length) { customMode = true; paint([]); return; }
        if (selected && !frases.includes(selected)) customMode = true;
        paint(frases);
    }).catch(() => { customMode = true; paint([]); });

    nextBtn.addEventListener('click', async () => {
        if (!customMode) return;
        const value = clean(customInput.value);
        if (!value) return;
        nextBtn.disabled = true;
        try { await completeNode(node, { [node.campo]: value }); } catch (err) { toast(err.message || 'Não consegui guardar.'); nextBtn.disabled = false; }
    });
}

// ---- kind: servicos (multi-group tap-to-select catalog picker) ----
function parseServicosSelecionados(dados) {
    try {
        const arr = JSON.parse((dados && dados.servicos_selecionados) || '[]');
        return Array.isArray(arr) ? arr.filter((item) => item && item.nome) : [];
    } catch (_) { return []; }
}
function parseAtributosSelecionados(dados) {
    try {
        const arr = JSON.parse((dados && dados.atributos_selecionados) || '[]');
        return Array.isArray(arr) ? arr.filter((item) => item && item.nome) : [];
    } catch (_) { return []; }
}
async function loadServicosCatalog(businessTypeId) {
    const id = businessTypeId || 'generico';
    if (state.servicosCatalog[id]) return state.servicosCatalog[id];
    const data = await api(`/tipos/${encodeURIComponent(id)}/servicos`);
    state.servicosCatalog[id] = data;
    return data;
}

function bodyServicos(node, { done }) {
    const submit = async (payload) => {
        const body = { servicosSelecionados: payload.servicosSelecionados, atributosSelecionados: payload.atributosSelecionados };
        // Ilha-1's servicos node is "done" via this marker field (isNodeDone
        // checks node.campo); the growth-island servico_extra node instead
        // derives done-ness live from /crescimento, so this is a harmless
        // no-op dossier field for it.
        if (node.campo) body[node.campo] = 'feito';
        await completeNode(node, body);
    };
    renderServicosPicker({ back: renderPath, submit, saveLabel: done ? 'Guardar' : 'Guardar e continuar' });
}

function renderServicosPicker({ back, submit, saveLabel = 'Guardar e continuar' }) {
    const { scroll: loadingScroll } = shell({ back, points: state.session ? state.session.pontos : 0 });
    loadingScroll.appendChild(el('p', 'dz-kicker', 'OS SEUS SERVIÇOS'));
    loadingScroll.appendChild(el('p', 'dz-hint', 'A carregar os serviços do seu tipo de negócio…'));

    const d = (state.session && state.session.dados) || {};
    const selected = new Map();
    parseServicosSelecionados(d).forEach((item) => selected.set(item.nome.toLowerCase(), item));
    const attrsSelected = new Map();
    parseAtributosSelecionados(d).forEach((item) => attrsSelected.set(item.nome.toLowerCase(), item));

    function countLabelText() {
        return `${selected.size} serviço${selected.size === 1 ? '' : 's'} escolhido${selected.size === 1 ? '' : 's'}`;
    }

    loadServicosCatalog(state.session.businessTypeId).then(({ grupos, atributosGlobais }) => {
        const pages = (grupos || []).filter((g) => g.servicos && g.servicos.length);
        const catalogNames = new Set();
        pages.forEach((g) => g.servicos.forEach((s) => catalogNames.add(s.nome.toLowerCase())));
        const totalSteps = pages.length + 1;

        function renderStep(stepIndex) {
            const isFinal = stepIndex >= pages.length;
            const stepBack = stepIndex === 0 ? back : () => renderStep(stepIndex - 1);
            const { screen, scroll } = shell({ back: stepBack, progressCurrent: stepIndex, progressTotal: totalSteps, points: state.session ? state.session.pontos : 0 });
            scroll.appendChild(el('p', 'dz-kicker', isFinal ? 'MAIS ALGUMA COISA?' : `GRUPO ${stepIndex + 1} DE ${pages.length}`));
            const countLabel = el('p', 'dz-servicos-count', countLabelText());
            scroll.appendChild(countLabel);

            if (!isFinal) {
                const grupo = pages[stepIndex];
                scroll.appendChild(el('h1', 'dz-h1', grupo.nome));
                scroll.appendChild(el('p', 'dz-lede', 'Toque nos que oferece.'));
                const grid = el('div', 'dz-servicos-grid');
                grupo.servicos.forEach((servico) => {
                    const key = servico.nome.toLowerCase();
                    const chip = el('button', `dz-service-chip${selected.has(key) ? ' is-selected' : ''}`, servico.nome);
                    chip.type = 'button';
                    chip.addEventListener('click', () => {
                        if (selected.has(key)) selected.delete(key);
                        else selected.set(key, { nome: servico.nome, descricao: '', preco: '' });
                        chip.classList.toggle('is-selected', selected.has(key));
                        countLabel.textContent = countLabelText();
                    });
                    grid.appendChild(chip);
                });
                scroll.appendChild(grid);
                const footer = footerOf(screen);
                const nextBtn = el('button', 'dz-btn dz-btn-primary', 'Continuar');
                nextBtn.type = 'button';
                nextBtn.addEventListener('click', () => renderStep(stepIndex + 1));
                footer.appendChild(nextBtn);
                return;
            }

            scroll.appendChild(el('h1', 'dz-h1', 'Falta mais algum? E como atende?'));
            scroll.appendChild(el('p', 'dz-lede', 'Acrescente o que não esteja na lista e diga como atende.'));

            const customSelectedWrap = el('div');
            scroll.appendChild(customSelectedWrap);

            function renderCustomSelected() {
                customSelectedWrap.innerHTML = '';
                const customs = Array.from(selected.values()).filter((item) => !catalogNames.has(item.nome.toLowerCase()));
                if (!customs.length) return;
                customSelectedWrap.appendChild(el('p', 'dz-servicos-group-title', 'Acrescentados por si'));
                const grid = el('div', 'dz-servicos-grid');
                customs.forEach((item) => {
                    const chip = el('button', 'dz-service-chip is-selected', `${item.nome}  ×`);
                    chip.type = 'button';
                    chip.addEventListener('click', () => {
                        selected.delete(item.nome.toLowerCase());
                        countLabel.textContent = countLabelText();
                        renderCustomSelected();
                    });
                    grid.appendChild(chip);
                });
                customSelectedWrap.appendChild(grid);
            }
            renderCustomSelected();

            scroll.appendChild(el('p', 'dz-servicos-group-title', 'Não está na lista?'));
            const customRow = el('div', 'dz-servicos-custom-row');
            const customInput = el('input', 'dz-input');
            customInput.placeholder = 'Outro serviço que ofereça…';
            const customAddBtn = el('button', 'dz-servicos-custom-add', '+ Adicionar');
            customAddBtn.type = 'button';
            customAddBtn.addEventListener('click', () => {
                const nome = clean(customInput.value);
                if (!nome) return;
                const key = nome.toLowerCase();
                if (!selected.has(key)) { selected.set(key, { nome, descricao: '', preco: '' }); countLabel.textContent = countLabelText(); renderCustomSelected(); }
                customInput.value = '';
                customInput.focus();
            });
            customInput.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); customAddBtn.click(); } });
            customRow.append(customInput, customAddBtn);
            scroll.appendChild(customRow);

            const attrsWrap = el('div');
            attrsWrap.style.marginTop = '22px';
            attrsWrap.appendChild(el('p', 'dz-servicos-group-title', 'Como atende'));
            const attrGrid = el('div', 'dz-servicos-grid');
            (atributosGlobais || []).forEach((attr) => {
                const key = attr.nome.toLowerCase();
                const chip = el('button', `dz-service-chip${attrsSelected.has(key) ? ' is-selected' : ''}`, attr.nome);
                chip.type = 'button';
                chip.addEventListener('click', () => {
                    if (attrsSelected.has(key)) { attrsSelected.delete(key); chip.classList.remove('is-selected'); } else { attrsSelected.set(key, { nome: attr.nome, descricao: '', preco: '' }); chip.classList.add('is-selected'); }
                });
                attrGrid.appendChild(chip);
            });
            attrsWrap.appendChild(attrGrid);
            scroll.appendChild(attrsWrap);

            const footer = footerOf(screen);
            const saveBtn = el('button', 'dz-btn dz-btn-primary', saveLabel);
            saveBtn.type = 'button';
            saveBtn.addEventListener('click', async () => {
                saveBtn.disabled = true;
                saveBtn.textContent = 'A guardar…';
                try {
                    await submit({ servicosSelecionados: Array.from(selected.values()), atributosSelecionados: Array.from(attrsSelected.values()) });
                } catch (err) {
                    toast(err.message || 'Não consegui guardar.');
                    saveBtn.disabled = false;
                    saveBtn.textContent = saveLabel;
                }
            });
            footer.appendChild(saveBtn);
        }

        renderStep(0);
    }).catch(() => {
        const { screen, scroll } = shell({ back, points: state.session ? state.session.pontos : 0 });
        scroll.appendChild(el('p', 'dz-kicker', 'OS SEUS SERVIÇOS'));
        scroll.appendChild(el('h1', 'dz-h1', 'Não consegui carregar a lista'));
        scroll.appendChild(el('p', 'dz-lede', 'Pode escrever os seus serviços, separados por vírgula, e tentamos de novo mais tarde.'));
        const input = el('textarea', 'dz-textarea');
        input.placeholder = 'Ex.: Fugas, Desentupimentos, Instalação de canalizações';
        scroll.appendChild(input);
        const footer = footerOf(screen);
        const btn = el('button', 'dz-btn dz-btn-primary', saveLabel);
        btn.type = 'button';
        btn.addEventListener('click', async () => {
            const nomes = clean(input.value).split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);
            btn.disabled = true;
            try {
                await submit({ servicosSelecionados: nomes.map((nome) => ({ nome, descricao: '', preco: '' })), atributosSelecionados: [] });
            } catch (err) { toast(err.message || 'Não consegui guardar.'); btn.disabled = false; }
        });
        footer.appendChild(btn);
    });
}

// Structured "De [dia] até [dia], das [hora] às [hora]" — a selector instead
// of a free-text box, so even the "not one of the presets" case never
// requires typing.
function parseHorarioSegment(text) {
    const m = /^([A-Za-zçÇáàâãéêíóôõúÁÀÂÃÉÊÍÓÔÕÚ]{3})(?:–([A-Za-zçÇáàâãéêíóôõúÁÀÂÃÉÊÍÓÔÕÚ]{3}))?,\s*(\d{1,2})h.*?(\d{1,2})h\s*$/.exec(clean(text) || '');
    if (!m) return null;
    const diaIni = DIAS_SEMANA.find((d) => d.toLowerCase() === m[1].toLowerCase());
    const diaFim = m[2] ? DIAS_SEMANA.find((d) => d.toLowerCase() === m[2].toLowerCase()) : diaIni;
    const abre = Number(m[3]);
    const fecha = Number(m[4]);
    if (!diaIni || !diaFim || !HORAS_DIA.includes(abre) || !HORAS_DIA.includes(fecha)) return null;
    return { diaIni, diaFim, abre, fecha };
}

// A horário can be more than one block — e.g. "Seg–Sex, 9h–18h; Sáb, 9h–13h;
// Dom, 10h–13h" — so the saved value is semicolon-joined segments.
function parseHorarioSegments(value) {
    const segments = clean(value).split(';').map((s) => parseHorarioSegment(s)).filter(Boolean);
    return segments;
}

function buildHorarioSelector(existingValue, onChange) {
    let segments = parseHorarioSegments(existingValue);
    if (!segments.length) segments = [{ diaIni: 'Seg', diaFim: 'Sáb', abre: 9, fecha: 19 }];

    const wrap = el('div', 'dz-horario-selector');

    function makeSelect(options, value, label) {
        const field = el('div', 'dz-horario-field');
        field.appendChild(el('label', 'dz-field-label', label));
        const select = document.createElement('select');
        select.className = 'dz-select';
        options.forEach((opt) => {
            const o = document.createElement('option');
            o.value = String(opt.value);
            o.textContent = opt.label;
            if (String(opt.value) === String(value)) o.selected = true;
            select.appendChild(o);
        });
        field.appendChild(select);
        return { field, select };
    }

    const dayOpts = DIAS_SEMANA.map((d) => ({ value: d, label: d }));
    const hourOpts = HORAS_DIA.map((h) => ({ value: h, label: `${h}h` }));

    function composeSegment(row) {
        const di = row.diaIni.select.value, df = row.diaFim.select.value;
        const dias = di === df ? di : `${di}–${df}`;
        return `${dias}, ${row.horaAbre.select.value}h–${row.horaFecha.select.value}h`;
    }

    function composeAll() {
        return rows.map(composeSegment).join('; ');
    }

    const addBtn = el('button', 'dz-btn dz-btn-secondary', '+ Adicionar horário (ex.: fim de semana à parte)');
    addBtn.type = 'button';

    const rows = [];
    // Only removable once there's more than one — otherwise refreshRemoveButtons
    // hides it, so the last remaining block can never be deleted outright.
    function refreshRemoveButtons() {
        rows.forEach((row) => { row.removeBtn.style.display = rows.length > 1 ? '' : 'none'; });
    }

    function buildRow(seg) {
        const block = el('div', 'dz-horario-block');
        const diaIni = makeSelect(dayOpts, seg.diaIni, 'De');
        const diaFim = makeSelect(dayOpts, seg.diaFim, 'Até');
        const horaAbre = makeSelect(hourOpts, seg.abre, 'Abre');
        const horaFecha = makeSelect(hourOpts, seg.fecha, 'Fecha');
        const row1 = el('div', 'dz-horario-row');
        row1.append(diaIni.field, diaFim.field);
        const row2 = el('div', 'dz-horario-row');
        row2.append(horaAbre.field, horaFecha.field);
        block.append(row1, row2);
        const removeBtn = el('button', 'dz-horario-remove', '×');
        removeBtn.type = 'button';
        removeBtn.setAttribute('aria-label', 'Remover este horário');
        block.appendChild(removeBtn);
        const row = { block, diaIni, diaFim, horaAbre, horaFecha, removeBtn };
        [diaIni.select, diaFim.select, horaAbre.select, horaFecha.select].forEach((s) => {
            s.addEventListener('change', () => onChange(composeAll()));
        });
        removeBtn.addEventListener('click', () => {
            const idx = rows.indexOf(row);
            if (idx === -1) return;
            rows.splice(idx, 1);
            block.remove();
            refreshRemoveButtons();
            onChange(composeAll());
        });
        return row;
    }

    segments.forEach((seg) => {
        const row = buildRow(seg);
        rows.push(row);
        wrap.appendChild(row.block);
    });
    refreshRemoveButtons();

    addBtn.addEventListener('click', () => {
        const row = buildRow({ diaIni: 'Seg', diaFim: 'Sáb', abre: 9, fecha: 19 });
        rows.push(row);
        wrap.insertBefore(row.block, addBtn);
        refreshRemoveButtons();
        onChange(composeAll());
    });
    wrap.appendChild(addBtn);

    onChange(composeAll());
    return wrap;
}

// ---- kind: horario (preset cards + custom fallback) ----
function bodyHorario(node) {
    const scroll = document.querySelector('.dz-scroll');
    const screen = document.querySelector('.dz-screen');
    const d = (state.session && state.session.dados) || {};
    let selected = d.horario || '';
    let customMode = Boolean(selected) && !HORARIOS_SUGERIDOS.includes(selected);

    const wrap = el('div');
    wrap.style.marginTop = '18px';
    scroll.appendChild(wrap);
    const footer = footerOf(screen);
    const nextBtn = el('button', 'dz-btn dz-btn-primary', 'Guardar horário');
    nextBtn.type = 'button';
    footer.appendChild(nextBtn);

    const submit = async (value) => {
        nextBtn.disabled = true;
        try { await completeNode(node, { horario: value }); } catch (err) { toast(err.message || 'Não consegui guardar.'); nextBtn.disabled = false; }
    };

    function paint() {
        wrap.innerHTML = '';
        footer.style.display = customMode ? 'flex' : 'none';
        const grid = el('div', 'dz-choices');
        HORARIOS_SUGERIDOS.forEach((h) => {
            const btn = el('button', `dz-choice${!customMode && selected === h ? ' is-selected' : ''}`);
            btn.type = 'button';
            btn.appendChild(el('p', 'dz-choice-label', h));
            btn.addEventListener('click', () => submit(h)); // one tap chooses and continues — no separate confirm
            grid.appendChild(btn);
        });
        wrap.appendChild(grid);
        const customBtn = el('button', `dz-choice${customMode ? ' is-selected' : ''}`);
        customBtn.type = 'button';
        customBtn.style.marginTop = '10px';
        customBtn.appendChild(el('p', 'dz-choice-label', 'Outro horário — escolher'));
        customBtn.addEventListener('click', () => { customMode = true; paint(); });
        wrap.appendChild(customBtn);
        if (customMode) {
            wrap.appendChild(buildHorarioSelector(HORARIOS_SUGERIDOS.includes(selected) ? '' : selected, (value) => { selected = value; }));
        }
    }
    paint();

    nextBtn.addEventListener('click', () => {
        const value = clean(selected);
        if (!value) { toast('Escreva um horário ou escolha da lista.'); return; }
        submit(value);
    });
}

// ---- kind: paleta ----
function bodyPaleta(node) {
    const scroll = document.querySelector('.dz-scroll');
    const wrap = el('div');
    wrap.style.marginTop = '18px';
    scroll.appendChild(wrap);

    let selected = (state.session && state.session.dados && state.session.dados.paleta_escolhida) || '';
    let submitting = false;

    (async () => {
        const tipos = await loadTipos();
        const type = tipos.find((t) => t.id === (state.session && state.session.businessTypeId));
        const paletas = (type && type.paletas_sugeridas) || [];
        const grid = el('div', 'dz-choices');
        paletas.forEach((p) => {
            const btn = el('button', `dz-choice${p.id === selected ? ' is-selected' : ''}`);
            btn.type = 'button';
            const label = el('p', 'dz-choice-label', p.nome);
            const swatches = el('div');
            swatches.style.cssText = 'display:flex;gap:6px;margin-top:8px';
            (p.cores || []).forEach((c) => {
                const dot = document.createElement('span');
                dot.style.cssText = `display:inline-block;width:22px;height:22px;border-radius:999px;background:${c};border:1px solid rgba(0,0,0,0.1)`;
                swatches.appendChild(dot);
            });
            btn.append(label, swatches);
            // One tap chooses and reveals the site — no separate "continue" click.
            btn.addEventListener('click', async () => {
                if (submitting) return;
                submitting = true;
                selected = p.id;
                Array.from(grid.children).forEach((c) => c.classList.remove('is-selected'));
                btn.classList.add('is-selected');
                try { await completeNode(node, { paleta_escolhida: selected }); } catch (err) { toast(err.message || 'Não consegui guardar.'); submitting = false; }
            });
            grid.appendChild(btn);
        });
        wrap.appendChild(grid);
    })();
}

// ---- kind: preview ----
function bodyPreview(node) {
    const scroll = document.querySelector('.dz-scroll');
    const screen = document.querySelector('.dz-screen');

    if (state.session.demoSlug) {
        // Already published (revisiting this step after paying) — link to the real site.
        const previewBtn = el('a', 'dz-btn dz-btn-secondary', 'Ver site publicado');
        previewBtn.target = '_blank';
        previewBtn.rel = 'noopener';
        previewBtn.href = `/d/${encodeURIComponent(state.session.demoSlug)}`;
        previewBtn.style.marginTop = '18px';
        scroll.appendChild(previewBtn);
    } else {
        // Not published yet — render the same landing page live, from the
        // dossier as it stands right now, inside an isolated iframe (its
        // own stylesheet, can't leak into the app's own styles).
        const frame = document.createElement('iframe');
        frame.src = `/digitalize/preview.html?token=${encodeURIComponent(state.token)}`;
        frame.title = 'Pré-visualização do site';
        frame.className = 'dz-preview-frame';
        frame.loading = 'lazy';
        scroll.appendChild(frame);
        const openBtn = el('a', 'dz-btn dz-btn-secondary', 'Abrir em ecrã inteiro');
        openBtn.target = '_blank';
        openBtn.rel = 'noopener';
        openBtn.href = frame.src;
        openBtn.style.marginTop = '10px';
        scroll.appendChild(openBtn);
    }

    const footer = footerOf(screen);
    const nextBtn = el('button', 'dz-btn dz-btn-primary', 'Pôr no ar');
    nextBtn.type = 'button';
    nextBtn.addEventListener('click', () => renderNode('dominio'));
    footer.appendChild(nextBtn);
    const secondaryBtn = el('button', 'dz-btn dz-btn-ghost', 'Mudar um serviço antes');
    secondaryBtn.type = 'button';
    secondaryBtn.addEventListener('click', () => renderNode('servicos'));
    footer.appendChild(secondaryBtn);
}

// ---- kind: dominio ----
function slugifyDomain(value) {
    return String(value || 'negocio').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 24) || 'negocio';
}
function bodyDominio(node) {
    const scroll = document.querySelector('.dz-scroll');
    const screen = document.querySelector('.dz-screen');
    const list = el('div', 'dz-domain-list');
    list.style.marginTop = '18px';
    list.appendChild(el('p', 'dz-hint', 'A procurar sugestões…'));
    scroll.appendChild(list);

    const footer = footerOf(screen);
    const nextBtn = el('button', 'dz-btn dz-btn-primary', 'Ficar com este endereço');
    nextBtn.type = 'button';
    nextBtn.disabled = true;
    footer.appendChild(nextBtn);

    const nome = (state.session.dados && state.session.dados.nome_negocio) || '';
    const cidade = (state.session.dados && state.session.dados.cidade) || '';
    const jaEscolhido = (state.session.dados && state.session.dados.dominio_escolhido) || '';
    let selected = jaEscolhido;

    function paint(domains) {
        list.innerHTML = '';
        const options = domains.map((dm) => ({ nome: dm, badge: '' }))
            .concat([{ nome: `${slugifyDomain(nome)}.digitalize.pt`, badge: 'GRÁTIS' }]);
        options.forEach((opt) => {
            const row = el('div', `dz-domain-option${opt.nome === selected ? ' is-selected' : ''}`);
            row.appendChild(el('span', 'dz-domain-name', opt.nome));
            if (opt.badge) row.appendChild(el('span', 'dz-domain-badge', opt.badge));
            row.addEventListener('click', () => {
                selected = opt.nome;
                nextBtn.disabled = false;
                Array.from(list.children).forEach((c) => c.classList.remove('is-selected'));
                row.classList.add('is-selected');
            });
            list.appendChild(row);
        });
        if (selected) nextBtn.disabled = false;
    }

    api(`/sessoes/${encodeURIComponent(state.token)}/dominios?nome=${encodeURIComponent(nome)}&cidade=${encodeURIComponent(cidade)}`)
        .then((r) => paint(r.domains || []))
        .catch(() => paint([]));

    nextBtn.addEventListener('click', async () => {
        if (!selected) return;
        nextBtn.disabled = true;
        try { await completeNode(node, { dominio_escolhido: selected }); } catch (err) { toast(err.message || 'Não consegui guardar.'); nextBtn.disabled = false; }
    });
}

// ---- kind: contrato (nome/email/nif + terms) ----
function bodyContrato(node) {
    const scroll = document.querySelector('.dz-scroll');
    const screen = document.querySelector('.dz-screen');
    const d = state.session.dados || {};
    const dominioEscolhido = d.dominio_escolhido || '';

    const field = el('div', 'dz-field');
    field.style.marginTop = '14px';
    const nomeInput = el('input', 'dz-input');
    nomeInput.placeholder = 'O seu nome (para a fatura)';
    nomeInput.value = d.responsavel || d.nome_negocio || '';
    const emailInput = el('input', 'dz-input');
    emailInput.type = 'email';
    emailInput.placeholder = 'Email';
    emailInput.value = d.email || '';
    const nifInput = el('input', 'dz-input');
    nifInput.placeholder = 'NIF (opcional)';
    nifInput.inputMode = 'numeric';
    nifInput.value = d.nif_negocio || '';
    field.append(nomeInput, emailInput, nifInput);
    scroll.appendChild(field);

    scroll.appendChild(el('p', 'dz-field-label', 'O que está incluído'));
    const contractBox = el('div', 'dz-contract-box');
    contractBox.innerHTML = `<p>Site publicado com o endereço escolhido (<strong>${dominioEscolhido || '—'}</strong>), domínio e alojamento incluídos no primeiro ano. Ligação da ficha do Google, Instagram e Facebook quando indicar. Botão de WhatsApp a funcionar. Alterações de conteúdo sempre grátis.</p>
    <p>Valor: <strong>49,00 €</strong> (pagamento único, sem IVA, sem mensalidades). O site e o código ficam propriedade sua.</p>`;
    scroll.appendChild(contractBox);

    const checkboxRow = el('label', 'dz-checkbox-row');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkboxRow.appendChild(checkbox);
    checkboxRow.appendChild(document.createTextNode('Li o que está incluído e aceito.'));
    scroll.appendChild(checkboxRow);

    const footer = footerOf(screen);
    const nextBtn = el('button', 'dz-btn dz-btn-primary', 'Continuar para pagamento');
    nextBtn.type = 'button';
    nextBtn.addEventListener('click', async () => {
        const clienteNome = clean(nomeInput.value);
        const clienteEmail = clean(emailInput.value);
        if (!clienteNome || !clienteEmail || !checkbox.checked) {
            toast('Preencha o nome, o email e aceite os termos.');
            return;
        }
        nextBtn.disabled = true;
        try {
            await completeNode(node, {
                nome_negocio: clienteNome, email: clienteEmail, nif_negocio: clean(nifInput.value),
                contrato_passo_estado: 'feito'
            });
        } catch (err) {
            toast(err.message || 'Não consegui guardar.');
            nextBtn.disabled = false;
        }
    });
    footer.appendChild(nextBtn);
}

// ---- kind: pagar (checkout) ----
function bodyPagar() {
    const scroll = document.querySelector('.dz-scroll');
    const screen = document.querySelector('.dz-screen');
    const priceBlock = el('div', 'dz-price-block');
    priceBlock.style.marginTop = '14px';
    priceBlock.appendChild(el('div', 'dz-price-amount', '49 €'));
    priceBlock.appendChild(el('div', 'dz-price-note', 'Pagamento único · sem mensalidades'));
    scroll.appendChild(priceBlock);

    const methods = [['mbway', 'MB WAY'], ['multibanco', 'Multibanco'], ['cartao', 'Cartão']];
    let metodo = 'mbway';
    const methodRow = el('div', 'dz-method-row');
    methods.forEach(([id, label]) => {
        const chip = el('button', `dz-method-chip${id === metodo ? ' is-selected' : ''}`, label);
        chip.type = 'button';
        chip.addEventListener('click', () => {
            metodo = id;
            Array.from(methodRow.children).forEach((c) => c.classList.remove('is-selected'));
            chip.classList.add('is-selected');
        });
        methodRow.appendChild(chip);
    });
    scroll.appendChild(methodRow);

    const footer = footerOf(screen);
    const payBtn = el('button', 'dz-btn dz-btn-primary', 'Pagar 49 € e publicar');
    payBtn.type = 'button';
    payBtn.addEventListener('click', async () => {
        payBtn.disabled = true;
        payBtn.textContent = 'A abrir pagamento…';
        const d = state.session.dados || {};
        try {
            const { redirectUrl } = await api(`/sessoes/${encodeURIComponent(state.token)}/checkout`, {
                method: 'POST',
                body: {
                    clienteNome: d.nome_negocio || '', clienteEmail: d.email || '', clienteNif: d.nif_negocio || '',
                    dominioEscolhido: d.dominio_escolhido || '', metodo
                }
            });
            window.location.href = redirectUrl;
        } catch (err) {
            toast(err.message || 'Não consegui iniciar o pagamento.');
            payBtn.disabled = false;
            payBtn.textContent = 'Pagar 49 € e publicar';
        }
    });
    footer.appendChild(payBtn);
}

// ---- kind: howto (Google stubs — not built yet, informational) ----
function bodyHowto(node) {
    const scroll = document.querySelector('.dz-scroll');
    const screen = document.querySelector('.dz-screen');
    const item = node.isl >= 2 ? crescimentoItem(node.id) : null;
    scroll.appendChild(el('p', 'dz-lede', (item && item.nota) || 'Em breve.'));
    const footer = footerOf(screen);
    const backBtn = el('button', 'dz-btn dz-btn-ghost', 'Voltar ao caminho');
    backBtn.type = 'button';
    backBtn.addEventListener('click', renderPath);
    footer.appendChild(backBtn);
}

// ---- kind: whatsapp (test the button) ----
function bodyWhatsapp(node) {
    const screen = document.querySelector('.dz-screen');
    const d = state.session.dados || {};
    const footer = footerOf(screen);
    if (d.whatsapp) {
        const digits = String(d.whatsapp).replace(/\D/g, '');
        const wa = digits.startsWith('351') ? digits : `351${digits}`;
        const link = el('a', 'dz-btn dz-btn-primary', 'Testar o botão');
        link.href = `https://wa.me/${wa}`;
        link.target = '_blank';
        link.rel = 'noopener';
        link.addEventListener('click', async () => {
            if (isNodeDone(node)) return;
            try { await completeNode(node, {}); flash('Abriu uma conversa. WhatsApp confirmado.', 'wa'); } catch (_) { /* ignore */ }
        });
        footer.appendChild(link);
    } else {
        document.querySelector('.dz-scroll').appendChild(el('p', 'dz-lede', 'Ainda não tem WhatsApp guardado — responda ao telefone na Ilha 1 primeiro.'));
        const backBtn = el('button', 'dz-btn dz-btn-primary', 'Voltar ao caminho');
        backBtn.type = 'button';
        backBtn.addEventListener('click', renderPath);
        footer.appendChild(backBtn);
    }
}

// ---- kind: link (instagram/facebook/zona/certificação — single text field) ----
function bodyLink(node) {
    const scroll = document.querySelector('.dz-scroll');
    const screen = document.querySelector('.dz-screen');
    const field = el('div', 'dz-field');
    field.style.marginTop = '14px';
    const input = el('input', 'dz-input');
    input.placeholder = node.placeholder || '';
    const d = state.session.dados || {};
    input.value = (node.campo && d[node.campo]) || '';
    field.appendChild(input);
    scroll.appendChild(field);

    const footer = footerOf(screen);
    const nextBtn = el('button', 'dz-btn dz-btn-primary', 'Guardar');
    nextBtn.type = 'button';
    const submit = async () => {
        const value = clean(input.value);
        if (!value) { toast('Preencha antes de continuar.'); return; }
        nextBtn.disabled = true;
        const chave = node.isl >= 2 ? `crescer_${node.id}` : node.chave;
        try {
            await completeNode({ ...node, chave }, { [node.campo]: value });
        } catch (err) { toast(err.message || 'Não consegui guardar.'); nextBtn.disabled = false; }
    };
    nextBtn.addEventListener('click', submit);
    input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); submit(); } });
    footer.appendChild(nextBtn);
    setTimeout(() => input.focus(), 30);
}

// ---- kind: qr ----
function bodyQr(node) {
    const scroll = document.querySelector('.dz-scroll');
    const screen = document.querySelector('.dz-screen');
    if (!state.session.demoSlug) {
        scroll.appendChild(el('p', 'dz-lede', 'O código QR fica disponível assim que o site estiver no ar.'));
        return;
    }
    const url = `${window.location.origin}/d/${encodeURIComponent(state.session.demoSlug)}`;
    const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(url)}`;
    const img = document.createElement('img');
    img.src = qrSrc;
    img.alt = 'Código QR do site';
    img.style.cssText = 'width:100%;max-width:280px;border-radius:16px;display:block;margin:18px auto 0';
    scroll.appendChild(img);

    const footer = footerOf(screen);
    const doneBtn = el('button', 'dz-btn dz-btn-primary', 'Feito, fechar');
    doneBtn.type = 'button';
    doneBtn.addEventListener('click', async () => {
        if (isNodeDone(node)) { renderPath(); return; }
        doneBtn.disabled = true;
        try { await completeNode(node, {}); } catch (err) { toast(err.message || 'Não consegui guardar.'); doneBtn.disabled = false; }
    });
    footer.appendChild(doneBtn);
}

// ---------- Payment return / building animation ----------
function renderConfirmarPagamento() {
    const { scroll } = shell({ points: state.session ? state.session.pontos : undefined });
    const center = el('div', 'dz-center');
    center.appendChild(el('div', 'dz-spinner'));
    center.appendChild(el('h1', 'dz-h1', 'A construir o seu site…'));
    scroll.appendChild(center);

    const domain = (state.session && state.session.dados && state.session.dados.dominio_escolhido) || '';
    const tel = (state.session && state.session.dados && state.session.dados.telefone) || '';
    const items = [
        `A reservar o seu endereço${domain ? ` — ${domain}` : ''}`,
        'A construir as páginas',
        'A ligar a ligação segura',
        `A pôr o seu telefone no botão${tel ? ` — ${tel}` : ''}`
    ];
    const list = el('div');
    list.style.marginTop = '22px';
    const rows = items.map((label) => {
        const row = el('div', 'dz-build-item');
        row.appendChild(el('div', 'dz-build-dot', ''));
        row.appendChild(el('div', 'dz-build-label', label));
        list.appendChild(row);
        return row;
    });
    scroll.appendChild(list);

    let step = 0;
    const tick = setInterval(() => {
        if (step < rows.length) {
            rows[step].querySelector('.dz-build-dot').textContent = '✓';
            rows[step].querySelector('.dz-build-dot').classList.add('is-done');
            rows[step].querySelector('.dz-build-label').classList.add('is-done');
            step += 1;
        }
    }, 1100);

    let tries = 0;
    const poll = async () => {
        tries += 1;
        try {
            const r = await api(`/sessoes/${encodeURIComponent(state.token)}/pagamento`);
            if (r.pago) {
                clearInterval(tick);
                rows.forEach((row) => { row.querySelector('.dz-build-dot').textContent = '✓'; row.querySelector('.dz-build-dot').classList.add('is-done'); row.querySelector('.dz-build-label').classList.add('is-done'); });
                await refreshSession();
                await loadCrescimento(true);
                return renderCelebrate();
            }
        } catch (_) { /* keep polling */ }
        if (tries > 40) {
            clearInterval(tick);
            center.querySelector('h1').textContent = 'Está a demorar mais que o normal';
            scroll.appendChild(el('p', 'dz-lede', 'Se já pagou, esta página atualiza-se sozinha assim que confirmarmos.'));
            return;
        }
        setTimeout(poll, 3000);
    };
    poll();
}

// ---------- Celebrate ----------
function renderCelebrate() {
    const root = document.getElementById('app');
    root.innerHTML = '';
    const screen = el('div', 'dz-screen');
    const topbar = el('div', 'dz-topbar');
    topbar.appendChild(el('div', 'dz-back'));
    topbar.appendChild(el('div', 'dz-spacer'));
    if (state.session) topbar.appendChild(el('span', 'dz-points', `${state.session.pontos} pts`));
    screen.appendChild(topbar);
    const scroll = el('div', 'dz-scroll');
    screen.appendChild(scroll);
    root.appendChild(screen);

    const celebrate = el('div', 'dz-celebrate');
    const intro = el('div', 'dz-anim-pop');
    intro.appendChild(el('div', 'dz-celebrate-kicker', 'ESTÁ NO AR'));
    intro.appendChild(el('h1', 'dz-celebrate-title', `O seu negócio subiu para Nível ${state.session.nivel} · ${state.session.nivelNome}.`));
    intro.appendChild(el('p', 'dz-celebrate-body', 'O site está publicado com endereço próprio, ligação segura e os seus contactos. O caminho continua — nada volta a estar fechado.'));
    celebrate.appendChild(intro);

    const card = el('div', 'dz-celebrate-card dz-anim-rise');
    const row = el('div', 'dz-celebrate-row');
    row.appendChild(el('div', '', `Nível ${state.session.nivel} · ${state.session.nivelNome}`));
    const proximo = state.session.proximoNivelEm;
    row.appendChild(el('div', '', proximo ? `${state.session.pontos} / ${proximo}` : `${state.session.pontos} pts`));
    card.appendChild(row);
    const bar = el('div', 'dz-celebrate-bar');
    const fill = el('div', 'dz-celebrate-bar-fill');
    const pct = proximo ? Math.min(100, Math.round((state.session.pontos / proximo) * 100)) : 100;
    fill.style.width = `${pct}%`;
    bar.appendChild(fill);
    card.appendChild(bar);
    card.appendChild(el('div', 'dz-celebrate-pts', '+400 pontos de base'));
    celebrate.appendChild(card);

    if (state.session.demoSlug) {
        celebrate.appendChild(el('div', 'dz-celebrate-domain', `/d/${state.session.demoSlug}`));
    }

    const btn = el('button', 'dz-celebrate-btn', 'Continuar o caminho');
    btn.type = 'button';
    btn.addEventListener('click', renderPath);
    celebrate.appendChild(btn);

    scroll.appendChild(celebrate);
}

// ---------- Help ----------
const FAQ = [
    { q: 'Pago todos os meses?', a: 'Não. São 49 € uma vez. As alterações são grátis para sempre.' },
    { q: 'O que são os pontos?', a: 'Uma lista privada do que falta tratar. Só sobe, nunca desce, e nada do que se paga soma pontos.' },
    { q: 'Como mudo uma coisa no site?', a: 'Toque no passo onde respondeu isso, no caminho. Abre igual à primeira vez, muda e o site atualiza-se.' },
    { q: 'Preciso de ficha do Google?', a: 'Não. Se tiver, ligar dá um salto grande. Se não tiver, nada fica a faltar.' },
    { q: 'Perdi o telefone. Como entro?', a: 'Guarde o link desta app — é o que faz o login. Se o perdeu, escreva-nos por WhatsApp.' }
];

function renderAjuda() {
    const { scroll } = shell({ back: renderPath, points: state.session ? state.session.pontos : 0 });
    scroll.appendChild(el('h1', 'dz-h1', 'Fale com uma pessoa. Sem menus.'));
    const waBtn = el('button', 'dz-btn dz-btn-primary', 'Falar por WhatsApp');
    waBtn.type = 'button';
    waBtn.style.marginTop = '10px';
    waBtn.addEventListener('click', () => flash('A abrir o WhatsApp com a nossa equipa…', 'wa'));
    scroll.appendChild(waBtn);
    scroll.appendChild(el('p', 'dz-hint', 'Segunda a sábado, 9h–19h. Resposta média: 20 minutos.'));

    const faqWrap = el('div');
    faqWrap.style.marginTop = '18px';
    FAQ.forEach((item) => {
        const details = document.createElement('details');
        details.className = 'dz-faq';
        const summary = document.createElement('summary');
        summary.textContent = item.q;
        details.appendChild(summary);
        details.appendChild(el('p', '', item.a));
        faqWrap.appendChild(details);
    });
    scroll.appendChild(faqWrap);

    scroll.appendChild(el('p', 'dz-node-hint', 'Se preferir que tratemos de um passo por si, contacte-nos por WhatsApp.'));

    const resetWrap = el('div');
    resetWrap.style.cssText = 'margin-top:22px;padding-top:18px;border-top:1px solid var(--dz-border)';
    resetWrap.appendChild(el('p', 'dz-field-label', 'Não é o seu negócio?'));
    const resetBtn = el('button', 'dz-btn dz-btn-ghost', 'Sair e começar com outro negócio');
    resetBtn.type = 'button';
    resetBtn.style.cssText = 'border:1.5px solid var(--dz-border);margin-top:6px';
    resetBtn.addEventListener('click', () => {
        if (window.confirm('Isto esquece o link deste negócio neste aparelho. Continuar?')) resetSession();
    });
    resetWrap.appendChild(resetBtn);
    scroll.appendChild(resetWrap);
}

// ---------- Install to home screen ----------
const ICON_SHARE_SVG = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.5v11"/><path d="M8.2 6.3L12 2.5l3.8 3.8"/><path d="M6 9h-.5A1.5 1.5 0 0 0 4 10.5v9A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5v-9A1.5 1.5 0 0 0 18.5 9H18"/></svg>';
const ICON_PLUS_SQUARE_SVG = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="5"/><path d="M12 8v8M8 12h8"/></svg>';
const ICON_CHECK_SVG = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>';

// The banner is position:fixed at the bottom of the viewport, outside .dz-app's own box,
// so without this the footer button on every screen renders underneath it (hidden, unclickable).
// Reserve the equivalent height as bottom padding on .dz-app while the banner is visible.
let installBannerResizeObserver = null;
function reserveInstallBannerSpace(banner) {
    const sync = () => document.documentElement.style.setProperty('--dz-install-banner-h', `${banner.offsetHeight}px`);
    sync();
    installBannerResizeObserver = new ResizeObserver(sync);
    installBannerResizeObserver.observe(banner);
}
function releaseInstallBannerSpace() {
    if (installBannerResizeObserver) { installBannerResizeObserver.disconnect(); installBannerResizeObserver = null; }
    document.documentElement.style.setProperty('--dz-install-banner-h', '0px');
}

function showInstallBanner(kind) {
    if (document.querySelector('.dz-install-banner')) return;
    const banner = el('div', 'dz-install-banner');
    const icon = document.createElement('img');
    icon.src = '/digitalize/icons/icon-192.png';
    icon.alt = '';
    icon.className = 'dz-install-icon';
    banner.appendChild(icon);
    const text = el('div', 'dz-install-text');
    text.appendChild(el('p', 'dz-install-title', 'Instale a app'));
    text.appendChild(el('p', 'dz-install-sub', 'Acesso instantâneo, sem abrir o browser.'));
    banner.appendChild(text);
    const actions = el('div', 'dz-install-actions');
    const installBtn = el('button', 'dz-install-btn', kind === 'ios' ? 'Ver como' : 'Instalar');
    installBtn.type = 'button';
    installBtn.addEventListener('click', async () => {
        if (kind === 'ios') { renderIosInstallSheet(banner); return; }
        const outcome = await triggerInstall();
        if (outcome) { banner.remove(); releaseInstallBannerSpace(); dismissInstallPrompt(); }
    });
    const closeBtn = el('button', 'dz-install-close', '×');
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Fechar');
    closeBtn.addEventListener('click', () => { banner.remove(); releaseInstallBannerSpace(); dismissInstallPrompt(); });
    actions.append(installBtn, closeBtn);
    banner.appendChild(actions);
    document.body.appendChild(banner);
    reserveInstallBannerSpace(banner);
}

function renderIosInstallSheet(banner) {
    const overlay = el('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:flex-end;justify-content:center;z-index:70';
    const card = el('div', 'dz-ios-sheet');

    const preview = el('div', 'dz-ios-preview');
    const previewIcon = document.createElement('img');
    previewIcon.src = '/digitalize/icons/icon-192.png';
    previewIcon.alt = '';
    previewIcon.className = 'dz-ios-preview-icon';
    preview.appendChild(previewIcon);
    const previewLabel = el('div');
    previewLabel.appendChild(el('p', 'dz-field-label', 'Adicionar ao ecrã principal'));
    previewLabel.appendChild(el('p', 'dz-install-sub', 'Fica ao lado das suas outras apps, pronto a abrir num toque.'));
    preview.appendChild(previewLabel);
    card.appendChild(preview);

    const steps = [
        { icon: ICON_SHARE_SVG, text: 'Toque no ícone de partilha na barra do Safari.' },
        { icon: ICON_PLUS_SQUARE_SVG, text: 'Escolha "Adicionar ao Ecrã Principal".' },
        { icon: ICON_CHECK_SVG, text: 'Toque em "Adicionar" — fica pronto a abrir como uma app.' }
    ];
    steps.forEach((step) => {
        const row = el('div', 'dz-ios-step');
        const iconChip = el('div', 'dz-ios-step-icon');
        iconChip.innerHTML = step.icon;
        row.appendChild(iconChip);
        row.appendChild(el('p', 'dz-ios-step-text', step.text));
        card.appendChild(row);
    });

    const closeBtn = el('button', 'dz-btn dz-btn-primary', 'Entendi');
    closeBtn.type = 'button';
    closeBtn.style.marginTop = '6px';
    closeBtn.addEventListener('click', () => { overlay.remove(); if (banner) banner.remove(); releaseInstallBannerSpace(); dismissInstallPrompt(); });
    card.appendChild(closeBtn);
    overlay.appendChild(card);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
}

// ---------- Bootstrap ----------
async function boot() {
    const params = new URLSearchParams(window.location.search);
    const pathToken = tokenFromPath();
    let stored = '';
    try { stored = localStorage.getItem(TOKEN_KEY) || ''; } catch (_) { /* ignore */ }
    state.token = pathToken || stored;

    if (!state.token) return renderLogin();

    persistToken(state.token);
    try {
        await refreshSession();
    } catch (_) {
        try { localStorage.removeItem(TOKEN_KEY); } catch (__) { /* ignore */ }
        window.history.replaceState(null, '', '/digitalize');
        state.token = '';
        return renderLogin();
    }

    if (state.session.pago) await loadCrescimento();
    if (params.get('pagamento') === 'sucesso') return renderConfirmarPagamento();
    if (state.session.pagamentoEstado === 'pendente') return renderConfirmarPagamento();
    const first = currentNodeId();
    if (first) return renderNode(first);
    return renderPath();
}

boot();

// Give the first screen a moment to paint before offering to install —
// showing it instantly competes with the primary action for attention.
setTimeout(() => setupInstallPrompt(showInstallBanner), 2000);
