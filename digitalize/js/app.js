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

const HORARIOS_SUGERIDOS = ['Seg–Sáb, 9h–19h', 'Seg–Sex, 9h–18h', '24 horas, todos os dias', 'A combinar por telefone'];

const NODES = [
    // Ilha 1
    { id: 'tipo', isl: 0, chave: 'q1_tipo', pts: 20, kind: 'tipo', titulo: 'Tem loja ou vai a casa das pessoas?', lede: 'Isto muda o site todo. É a única pergunta grande.' },
    { id: 'nome', isl: 0, chave: 'q2_nome', pts: 20, campo: 'nome_negocio', kind: 'texto', titulo: 'Como se chama o negócio?', lede: 'É o que vai aparecer no topo do site.', placeholder: 'Ex.: Canalizações Ferreira' },
    { id: 'oficio', isl: 0, chave: 'q3_oficio', pts: 40, campo: 'o_que_faz', kind: 'descricao', titulo: 'O que faz, em poucas palavras?', lede: 'Escolha a frase mais parecida — ou escreva a sua.' },
    { id: 'zonas', isl: 0, chave: 'q4_zonas', pts: 30, campo: 'cidade', kind: 'texto', titulo: 'Onde trabalha?', lede: 'Cidade principal — pode falar de mais zonas no site depois.', placeholder: 'Ex.: Porto' },
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

    const login = el('div', 'dz-login-screen');
    login.appendChild(el('div', 'dz-login-kicker', 'DIGITALIZE'));
    login.appendChild(el('h1', 'dz-login-title', 'O seu negócio na internet, um passo de cada vez.'));
    login.appendChild(el('p', 'dz-login-body', 'Escolha uma porta. A seguir são perguntas de um toque — nunca formulários.'));

    const doors = el('div');
    doors.style.cssText = 'display:flex;flex-direction:column;gap:11px;margin-top:26px';
    const enter = async (btn, label) => {
        btn.disabled = true;
        btn.textContent = 'Um momento…';
        try {
            await ensureSession();
            const first = currentNodeId() || NODES[0].id;
            renderNode(first);
        } catch (err) {
            toast(err.message || 'Não consegui começar.');
            btn.disabled = false;
            btn.textContent = label;
        }
    };

    const googleBtn = el('button', 'dz-door dz-door-google');
    googleBtn.type = 'button';
    const googleBadge = el('div', 'dz-door-badge', 'G');
    googleBadge.style.cssText += 'background:#12261c;color:#f4f1ea;';
    googleBtn.append(googleBadge, el('div', '', 'Continuar com Google'));
    googleBtn.addEventListener('click', () => enter(googleBtn, 'Continuar com Google'));

    const waBtn = el('button', 'dz-door dz-door-wa');
    waBtn.type = 'button';
    const waBadge = el('div', 'dz-door-badge');
    waBadge.style.cssText += 'background:#08240f;opacity:0.9;';
    waBtn.append(waBadge, el('div', '', 'Continuar com WhatsApp'));
    waBtn.addEventListener('click', () => enter(waBtn, 'Continuar com WhatsApp'));

    doors.append(googleBtn, waBtn);
    login.appendChild(doors);
    login.appendChild(el('p', 'dz-login-other', 'Também pode entrar por SMS ou email.'));

    const why = el('div', 'dz-login-why');
    why.appendChild(el('div', 'dz-login-why-title', 'Porque é mais rápido'));
    [
        'Entra num toque. Sem esperar por código.',
        'As suas faturas chegam sempre ao email certo.',
        'Menos para escrever à mão a seguir.',
        'Nunca mais tem de se lembrar de nada.'
    ].forEach((w) => why.appendChild(el('div', 'dz-login-why-item', w)));
    login.appendChild(why);

    scroll.appendChild(login);
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
        tipo: bodyTipo, texto: bodyTexto, descricao: bodyDescricao, servicos: bodyServicos,
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
        customBtn.appendChild(el('p', 'dz-choice-label', 'Outro horário — escrever'));
        customBtn.addEventListener('click', () => { customMode = true; paint(); });
        wrap.appendChild(customBtn);
        if (customMode) {
            const field = el('div', 'dz-field');
            field.style.marginTop = '10px';
            const input = el('input', 'dz-input');
            input.placeholder = 'Ex.: Ter–Sáb, 10h–20h';
            input.value = HORARIOS_SUGERIDOS.includes(selected) ? '' : selected;
            input.addEventListener('input', () => { selected = input.value; });
            input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); submit(clean(input.value)); } });
            field.appendChild(input);
            wrap.appendChild(field);
            setTimeout(() => input.focus(), 10);
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
        const previewBtn = el('a', 'dz-btn dz-btn-secondary', 'Ver rascunho');
        previewBtn.target = '_blank';
        previewBtn.rel = 'noopener';
        previewBtn.href = `/d/${encodeURIComponent(state.session.demoSlug)}`;
        previewBtn.style.marginTop = '18px';
        scroll.appendChild(previewBtn);
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
}

// ---------- Install to home screen ----------
function showInstallBanner(kind) {
    if (document.querySelector('.dz-install-banner')) return;
    const banner = el('div', 'dz-install-banner');
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
        if (outcome) { banner.remove(); dismissInstallPrompt(); }
    });
    const closeBtn = el('button', 'dz-install-close', '×');
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Fechar');
    closeBtn.addEventListener('click', () => { banner.remove(); dismissInstallPrompt(); });
    actions.append(installBtn, closeBtn);
    banner.appendChild(actions);
    document.body.appendChild(banner);
}

function renderIosInstallSheet(banner) {
    const overlay = el('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:flex-end;justify-content:center;z-index:70';
    const card = el('div');
    card.style.cssText = 'background:var(--dz-surface);border-radius:20px 20px 0 0;padding:24px;width:100%;max-width:480px';
    card.appendChild(el('p', 'dz-field-label', 'Adicionar ao ecrã principal'));
    const steps = document.createElement('ol');
    steps.style.cssText = 'padding-left:20px;line-height:1.8;color:var(--dz-ink);font-size:0.92rem';
    [
        'Toque no ícone de partilha (quadrado com seta a subir) na barra do browser.',
        'Escolha "Adicionar ao Ecrã Principal".',
        'Toque em "Adicionar" — fica pronto a abrir como uma app.'
    ].forEach((textStep) => {
        const li = document.createElement('li');
        li.textContent = textStep;
        steps.appendChild(li);
    });
    card.appendChild(steps);
    const closeBtn = el('button', 'dz-btn dz-btn-primary', 'Entendi');
    closeBtn.type = 'button';
    closeBtn.style.marginTop = '8px';
    closeBtn.addEventListener('click', () => { overlay.remove(); if (banner) banner.remove(); dismissInstallPrompt(); });
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
