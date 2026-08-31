/**
 * Digitalize — self-service onboarding app. One-tap questions build a real
 * lead in the same database the admin tool uses; no forms, no client
 * account (a private resumable link stands in for login — see
 * server/lib/digitalize-app.js for why). Vanilla DOM, same style as the
 * rest of this codebase (admin-*.js): small el() builder, one render() per
 * screen, no framework.
 */

const API = '/api/digitalize';
const TOKEN_KEY = 'digitalize_token';

// Business types that go to the client instead of the client coming to a
// shop — the "Vou a casa das pessoas" branch of Q1. Everything else is
// "Tenho loja ou espaço". Kept here (not in the shared business-type JSON)
// because it's specific to how this one screen frames the choice.
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

// ---------- The eight one-tap questions (Ilha 1) ----------
// Each `campo` maps straight onto a dossier field (server/config/fields.json)
// except `businessTypeId`, handled specially by the backend.
const QUESTOES = [
    {
        chave: 'q1_tipo', pontos: 20,
        titulo: 'Tem loja ou vai a casa das pessoas?',
        lede: 'Isto muda o site todo. É a única pergunta grande.',
        tipo: 'tipo_negocio'
    },
    {
        chave: 'q2_nome', pontos: 20, campo: 'nome_negocio',
        titulo: 'Como se chama o negócio?',
        lede: 'É o que vai aparecer no topo do site.',
        tipo: 'texto', placeholder: 'Ex.: Canalizações Ferreira'
    },
    {
        chave: 'q3_oficio', pontos: 40, campo: 'o_que_faz',
        titulo: 'O que faz, em poucas palavras?',
        lede: 'Duas frases chegam — usamos isto para escrever o resto do site.',
        tipo: 'texto_longo', placeholder: 'Ex.: Canalizador ao domicílio, fugas e desentupimentos.'
    },
    {
        chave: 'q4_zonas', pontos: 30, campo: 'cidade',
        titulo: 'Onde trabalha?',
        lede: 'Cidade principal — pode falar de mais zonas no site depois.',
        tipo: 'texto', placeholder: 'Ex.: Porto'
    },
    {
        chave: 'q5_telefone', pontos: 40, campo: 'telefone',
        titulo: 'Qual o telefone / WhatsApp?',
        lede: 'É como os clientes o contactam a partir do site.',
        tipo: 'telefone', placeholder: '9xx xxx xxx'
    },
    {
        chave: 'q6_servicos', pontos: 40, campo: 'principais_servicos',
        titulo: 'O que faz exatamente?',
        lede: 'Liste os serviços principais, separados por vírgula.',
        tipo: 'texto_longo', placeholder: 'Ex.: Fugas, Desentupimentos, Instalação de canalizações'
    },
    {
        chave: 'q7_horario', pontos: 40, campo: 'horario',
        titulo: 'Quando trabalha?',
        lede: 'O horário que aparece no site.',
        tipo: 'texto', placeholder: 'Ex.: Seg–Sáb, 9h–19h'
    },
    {
        chave: 'q8_estilo', pontos: 20, campo: 'paleta_escolhida',
        titulo: 'Que estilo lhe agrada?',
        lede: 'Três paletas — pode mudar mais tarde.',
        tipo: 'paleta'
    }
];

// ---------- State ----------
const state = {
    token: '',
    session: null,
    tipos: []
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
    state.session = await api(`/sessoes/${encodeURIComponent(state.token)}`);
    return state.session;
}

function toast(message) {
    document.querySelectorAll('.dz-toast').forEach((n) => n.remove());
    const node = el('div', 'dz-toast', message);
    document.body.appendChild(node);
    setTimeout(() => node.remove(), 2600);
}

// ---------- Shell ----------
function screenShell({ back, progressCurrent, progressTotal, points } = {}) {
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
    if (typeof points === 'number') {
        topbar.appendChild(el('span', 'dz-points', `${points} pts`));
    }
    screen.appendChild(topbar);
    root.appendChild(screen);
    return screen;
}

// ---------- Screen: entrada ----------
function renderEntrada() {
    const screen = screenShell();
    screen.appendChild(el('p', 'dz-kicker', 'DIGITALIZE'));
    screen.appendChild(el('h1', 'dz-h1', 'O seu negócio na internet, um passo de cada vez.'));
    screen.appendChild(el('p', 'dz-lede', 'Sem formulários — perguntas de um toque. Grátis para começar; paga só quando o site ficar pronto para publicar.'));
    screen.appendChild(el('div', 'dz-spacer'));
    const actions = el('div', 'dz-actions');
    const startBtn = el('button', 'dz-btn dz-btn-primary', 'Começar');
    startBtn.type = 'button';
    startBtn.addEventListener('click', async () => {
        startBtn.disabled = true;
        startBtn.textContent = 'Um momento…';
        try {
            const { token } = await api('/sessoes', { method: 'POST' });
            persistToken(token);
            await refreshSession();
            goToNextQuestion();
        } catch (err) {
            toast(err.message || 'Não consegui começar. Tente de novo.');
            startBtn.disabled = false;
            startBtn.textContent = 'Começar';
        }
    });
    actions.appendChild(startBtn);
    const resumeHint = el('p', 'dz-hint', 'Já começou? Guarde este link — pode voltar sempre a ele para continuar.');
    resumeHint.style.textAlign = 'center';
    screen.appendChild(actions);
    screen.appendChild(resumeHint);
}

// ---------- Screen: one-tap question ----------
function questionIndex(chave) {
    return QUESTOES.findIndex((q) => q.chave === chave);
}

function goToQuestion(index) {
    if (index < 0) return renderEntrada();
    if (index >= QUESTOES.length) return renderResultado();
    renderQuestion(QUESTOES[index], index);
}

function goToNextQuestion() {
    const d = (state.session && state.session.dados) || {};
    let nextIndex = 0;
    if (state.session && state.session.businessTypeId !== 'generico') nextIndex = 1;
    for (let i = 1; i < QUESTOES.length; i += 1) {
        const q = QUESTOES[i];
        if (q.campo && clean(d[q.campo])) { nextIndex = i + 1; continue; }
        break;
    }
    goToQuestion(Math.min(nextIndex, QUESTOES.length));
}

async function submitAnswer(q, patch) {
    await api(`/sessoes/${encodeURIComponent(state.token)}/dados`, {
        method: 'PATCH',
        body: { patch, chave: q.chave, pontos: q.pontos }
    });
    await refreshSession();
}

function renderQuestion(q, index) {
    const screen = screenShell({
        back: () => goToQuestion(index - 1),
        progressCurrent: index,
        progressTotal: QUESTOES.length,
        points: state.session ? state.session.pontos : 0
    });
    const pill = el('span', 'dz-points', `+${q.pontos}`);
    pill.style.float = 'right';
    screen.appendChild(el('p', 'dz-kicker', `PERGUNTA ${index + 1} DE ${QUESTOES.length}`));
    screen.appendChild(el('h1', 'dz-h1', q.titulo));
    if (q.lede) screen.appendChild(el('p', 'dz-lede', q.lede));

    if (q.tipo === 'tipo_negocio') {
        renderTipoNegocioBody(screen, q, index);
        return;
    }
    if (q.tipo === 'paleta') {
        renderPaletaBody(screen, q, index);
        return;
    }

    const field = el('div', 'dz-field');
    const input = el(q.tipo === 'texto_longo' ? 'textarea' : 'input', q.tipo === 'texto_longo' ? 'dz-textarea' : 'dz-input');
    if (q.tipo !== 'texto_longo') input.type = q.tipo === 'telefone' ? 'tel' : 'text';
    input.placeholder = q.placeholder || '';
    const d = (state.session && state.session.dados) || {};
    input.value = q.campo ? (d[q.campo] || '') : '';
    field.appendChild(input);
    screen.appendChild(field);
    screen.appendChild(el('div', 'dz-spacer'));

    const actions = el('div', 'dz-actions');
    const nextBtn = el('button', 'dz-btn dz-btn-primary', 'Continuar');
    nextBtn.type = 'button';
    nextBtn.addEventListener('click', async () => {
        const value = clean(input.value);
        if (!value) { toast('Preencha antes de continuar.'); return; }
        nextBtn.disabled = true;
        try {
            await submitAnswer(q, { [q.campo]: value });
            goToQuestion(index + 1);
        } catch (err) {
            toast(err.message || 'Não consegui guardar.');
            nextBtn.disabled = false;
        }
    });
    actions.appendChild(nextBtn);
    screen.appendChild(actions);
    input.focus();
}

function renderTipoNegocioBody(screen, q, index) {
    const choices = el('div', 'dz-choices');
    const zonaBtn = el('button', 'dz-choice');
    zonaBtn.type = 'button';
    zonaBtn.appendChild(el('p', 'dz-choice-label', 'Vou a casa das pessoas'));
    zonaBtn.appendChild(el('p', 'dz-choice-desc', 'Serviços em zonas — canalizador, eletricista, limpezas.'));
    const lojaBtn = el('button', 'dz-choice');
    lojaBtn.type = 'button';
    lojaBtn.appendChild(el('p', 'dz-choice-label', 'Tenho loja ou espaço'));
    lojaBtn.appendChild(el('p', 'dz-choice-desc', 'As pessoas vão até si — cabeleireiro, oficina, café.'));
    choices.append(zonaBtn, lojaBtn);
    screen.appendChild(choices);

    const typeGridWrap = el('div');
    typeGridWrap.style.marginTop = '18px';
    screen.appendChild(typeGridWrap);
    screen.appendChild(el('div', 'dz-spacer'));
    const actions = el('div', 'dz-actions');
    const nextBtn = el('button', 'dz-btn dz-btn-primary', 'Continuar');
    nextBtn.type = 'button';
    nextBtn.disabled = true;
    actions.appendChild(nextBtn);
    screen.appendChild(actions);

    let selectedTypeId = state.session ? state.session.businessTypeId : '';
    let archetype = selectedTypeId && selectedTypeId !== 'generico'
        ? (TIPOS_ZONA.has(selectedTypeId) ? 'zona' : 'loja')
        : '';

    async function paintTypes() {
        typeGridWrap.innerHTML = '';
        if (!archetype) return;
        const tipos = await loadTipos();
        const filtered = tipos.filter((t) => t.id !== 'generico' && (TIPOS_ZONA.has(t.id) === (archetype === 'zona')));
        typeGridWrap.appendChild(el('p', 'dz-field-label', 'Qual destes é o seu?'));
        const grid = el('div', 'dz-type-grid');
        filtered.forEach((t) => {
            const chip = el('button', `dz-type-chip${t.id === selectedTypeId ? ' is-selected' : ''}`, t.nome);
            chip.type = 'button';
            chip.addEventListener('click', () => {
                selectedTypeId = t.id;
                nextBtn.disabled = false;
                paintTypes();
            });
            grid.appendChild(chip);
        });
        typeGridWrap.appendChild(grid);
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
            await submitAnswer(q, { businessTypeId: selectedTypeId });
            goToQuestion(index + 1);
        } catch (err) {
            toast(err.message || 'Não consegui guardar.');
            nextBtn.disabled = false;
        }
    });
}

function renderPaletaBody(screen, q, index) {
    const wrap = el('div');
    screen.appendChild(wrap);
    screen.appendChild(el('div', 'dz-spacer'));
    const actions = el('div', 'dz-actions');
    const nextBtn = el('button', 'dz-btn dz-btn-primary', 'Ver o meu site');
    nextBtn.type = 'button';
    nextBtn.disabled = true;
    actions.appendChild(nextBtn);
    screen.appendChild(actions);

    let selected = (state.session && state.session.dados && state.session.dados.paleta_escolhida) || '';

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
            btn.addEventListener('click', () => {
                selected = p.id;
                nextBtn.disabled = false;
                Array.from(grid.children).forEach((c) => c.classList.remove('is-selected'));
                btn.classList.add('is-selected');
            });
            grid.appendChild(btn);
        });
        wrap.appendChild(grid);
    })();

    nextBtn.addEventListener('click', async () => {
        if (!selected) return;
        nextBtn.disabled = true;
        try {
            await submitAnswer(q, { paleta_escolhida: selected });
            goToQuestion(index + 1);
        } catch (err) {
            toast(err.message || 'Não consegui guardar.');
            nextBtn.disabled = false;
        }
    });
}

// ---------- Screen: resultado (Ilha 1 done — show the demo) ----------
function renderResultado() {
    const screen = screenShell({ back: () => goToQuestion(QUESTOES.length - 1), points: state.session.pontos });
    screen.appendChild(el('p', 'dz-kicker', 'ILHA 1 · O SEU NEGÓCIO'));
    screen.appendChild(el('h1', 'dz-h1', 'Pronto — já dá para ver.'));
    screen.appendChild(el('p', 'dz-lede', 'Este é o seu site com as respostas que deu. Falta pô-lo no ar.'));
    const previewBtn = el('a', 'dz-btn dz-btn-secondary', 'Ver rascunho');
    previewBtn.target = '_blank';
    previewBtn.rel = 'noopener';
    previewBtn.href = state.session.demoSlug ? `/d/${encodeURIComponent(state.session.demoSlug)}` : '#';
    if (!state.session.demoSlug) previewBtn.style.display = 'none';
    screen.appendChild(previewBtn);
    screen.appendChild(el('div', 'dz-spacer'));
    const actions = el('div', 'dz-actions');
    const nextBtn = el('button', 'dz-btn dz-btn-primary', 'Pôr no ar');
    nextBtn.type = 'button';
    nextBtn.addEventListener('click', () => renderDominio());
    actions.appendChild(nextBtn);
    screen.appendChild(actions);
}

// ---------- Screen: domínio (Ilha 2, step 1) ----------
function renderDominio() {
    const screen = screenShell({ back: renderResultado, points: state.session.pontos });
    screen.appendChild(el('p', 'dz-kicker', 'ILHA 2 · NO AR'));
    screen.appendChild(el('h1', 'dz-h1', 'Que endereço quer?'));
    screen.appendChild(el('p', 'dz-lede', 'O próprio é o que as pessoas escrevem no telemóvel.'));
    const list = el('div', 'dz-domain-list');
    list.appendChild(el('p', 'dz-hint', 'A procurar sugestões…'));
    screen.appendChild(list);
    screen.appendChild(el('div', 'dz-spacer'));
    const actions = el('div', 'dz-actions');
    const nextBtn = el('button', 'dz-btn dz-btn-primary', 'Continuar');
    nextBtn.type = 'button';
    nextBtn.disabled = true;
    actions.appendChild(nextBtn);
    screen.appendChild(actions);

    const nome = (state.session.dados && state.session.dados.nome_negocio) || '';
    const cidade = (state.session.dados && state.session.dados.cidade) || '';
    let selected = '';

    function slugify(value) {
        return String(value || 'negocio')
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 24) || 'negocio';
    }

    function paint(domains) {
        list.innerHTML = '';
        const options = domains.map((d) => ({ nome: d, badge: '' }))
            .concat([{ nome: `${slugify(nome)}.digitalize.pt`, badge: 'GRÁTIS' }]);
        options.forEach((opt) => {
            const row = el('div', 'dz-domain-option');
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
    }

    api(`/sessoes/${encodeURIComponent(state.token)}/dominios?nome=${encodeURIComponent(nome)}&cidade=${encodeURIComponent(cidade)}`)
        .then((r) => paint(r.domains || []))
        .catch(() => paint([]));

    nextBtn.addEventListener('click', () => renderContrato(selected));
}

// ---------- Screen: contrato (Ilha 2, step 2 — tap to accept) ----------
function renderContrato(dominioEscolhido) {
    const screen = screenShell({ back: renderDominio, points: state.session.pontos });
    screen.appendChild(el('p', 'dz-kicker', 'ILHA 2 · NO AR'));
    screen.appendChild(el('h1', 'dz-h1', 'O seu NIF, para a fatura'));
    const field = el('div', 'dz-field');
    const nomeInput = el('input', 'dz-input');
    nomeInput.placeholder = 'O seu nome (para a fatura)';
    nomeInput.value = (state.session.dados && state.session.dados.responsavel) || (state.session.dados && state.session.dados.nome_negocio) || '';
    const emailInput = el('input', 'dz-input');
    emailInput.type = 'email';
    emailInput.placeholder = 'Email';
    emailInput.value = (state.session.dados && state.session.dados.email) || '';
    const nifInput = el('input', 'dz-input');
    nifInput.placeholder = 'NIF (opcional)';
    nifInput.value = (state.session.dados && state.session.dados.nif_negocio) || '';
    field.append(nomeInput, emailInput, nifInput);
    screen.appendChild(field);

    screen.appendChild(el('p', 'dz-field-label', 'O que está incluído'));
    const contractBox = el('div', 'dz-contract-box');
    contractBox.innerHTML = `<p>Site publicado com o endereço escolhido (<strong>${dominioEscolhido || '—'}</strong>), domínio e alojamento incluídos no primeiro ano. Ligação da ficha do Google, Instagram e Facebook quando indicar. Botão de WhatsApp a funcionar. Alterações de conteúdo sempre grátis.</p>
    <p>Valor: <strong>49,00 €</strong> (pagamento único, sem IVA, sem mensalidades). O site e o código ficam propriedade sua.</p>`;
    screen.appendChild(contractBox);

    const checkboxRow = el('label', 'dz-checkbox-row');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkboxRow.appendChild(checkbox);
    checkboxRow.appendChild(document.createTextNode('Li o que está incluído e aceito.'));
    screen.appendChild(checkboxRow);

    screen.appendChild(el('div', 'dz-spacer'));
    const actions = el('div', 'dz-actions');
    const nextBtn = el('button', 'dz-btn dz-btn-primary', 'Continuar para pagamento');
    nextBtn.type = 'button';
    nextBtn.addEventListener('click', () => {
        const clienteNome = clean(nomeInput.value);
        const clienteEmail = clean(emailInput.value);
        if (!clienteNome || !clienteEmail || !checkbox.checked) {
            toast('Preencha o nome, o email e aceite os termos.');
            return;
        }
        renderPagamento({ clienteNome, clienteEmail, clienteNif: clean(nifInput.value), dominioEscolhido });
    });
    actions.appendChild(nextBtn);
    screen.appendChild(actions);
}

// ---------- Screen: pagamento (Ilha 2, step 3) ----------
function renderPagamento({ clienteNome, clienteEmail, clienteNif, dominioEscolhido }) {
    const screen = screenShell({ back: () => renderContrato(dominioEscolhido), points: state.session.pontos });
    screen.appendChild(el('p', 'dz-kicker', 'ILHA 2 · NO AR'));
    const priceBlock = el('div', 'dz-price-block');
    priceBlock.appendChild(el('div', 'dz-price-amount', '49 €'));
    priceBlock.appendChild(el('div', 'dz-price-note', 'Pagamento único · sem mensalidades'));
    screen.appendChild(priceBlock);

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
    screen.appendChild(methodRow);
    screen.appendChild(el('div', 'dz-spacer'));
    const actions = el('div', 'dz-actions');
    const payBtn = el('button', 'dz-btn dz-btn-primary', 'Pagar 49 € e publicar');
    payBtn.type = 'button';
    payBtn.addEventListener('click', async () => {
        payBtn.disabled = true;
        payBtn.textContent = 'A abrir pagamento…';
        try {
            const { redirectUrl } = await api(`/sessoes/${encodeURIComponent(state.token)}/checkout`, {
                method: 'POST',
                body: { clienteNome, clienteEmail, clienteNif, dominioEscolhido, metodo }
            });
            window.location.href = redirectUrl;
        } catch (err) {
            toast(err.message || 'Não consegui iniciar o pagamento.');
            payBtn.disabled = false;
            payBtn.textContent = 'Pagar 49 € e publicar';
        }
    });
    actions.appendChild(payBtn);
    screen.appendChild(actions);
}

// ---------- Screen: a confirmar pagamento (return from gateway) ----------
function renderConfirmarPagamento() {
    const screen = screenShell({ points: state.session ? state.session.pontos : undefined });
    const center = el('div', 'dz-center');
    center.appendChild(el('div', 'dz-spinner'));
    center.appendChild(el('h1', 'dz-h1', 'A confirmar o pagamento…'));
    center.appendChild(el('p', 'dz-lede', 'Isto costuma demorar poucos segundos.'));
    screen.appendChild(center);

    let tries = 0;
    const poll = async () => {
        tries += 1;
        try {
            const r = await api(`/sessoes/${encodeURIComponent(state.token)}/pagamento`);
            if (r.pago) {
                await refreshSession();
                return renderNivel2();
            }
        } catch (_) { /* keep polling */ }
        if (tries > 40) {
            center.querySelector('.dz-lede').textContent = 'Está a demorar mais que o normal — se já pagou, esta página atualiza-se sozinha assim que confirmarmos.';
            return;
        }
        setTimeout(poll, 3000);
    };
    poll();
}

// ---------- Screen: subiu de nível ----------
function renderNivel2() {
    const screen = screenShell({ points: state.session.pontos });
    screen.appendChild(el('p', 'dz-kicker', 'ESTÁ NO AR'));
    screen.appendChild(el('h1', 'dz-h1', `O seu negócio subiu para Nível ${state.session.nivel} · ${state.session.nivelNome}`));
    screen.appendChild(el('p', 'dz-lede', 'O site está publicado. O caminho continua — nada volta a estar fechado.'));
    const levelCard = el('div', 'dz-level-card');
    const top = el('div', 'dz-level-top');
    top.appendChild(el('span', 'dz-level-name', state.session.nivelNome));
    const proximo = state.session.proximoNivelEm;
    top.appendChild(el('span', 'dz-level-pts', proximo ? `${state.session.pontos} / ${proximo} pts` : `${state.session.pontos} pts`));
    levelCard.appendChild(top);
    const bar = el('div', 'dz-level-bar');
    const fill = el('div', 'dz-level-bar-fill');
    const pct = proximo ? Math.min(100, Math.round((state.session.pontos / proximo) * 100)) : 100;
    fill.style.width = `${pct}%`;
    bar.appendChild(fill);
    levelCard.appendChild(bar);
    screen.appendChild(levelCard);
    if (state.session.demoSlug) {
        const link = el('a', 'dz-btn dz-btn-secondary', 'Ver o site publicado');
        link.href = `/d/${encodeURIComponent(state.session.demoSlug)}`;
        link.target = '_blank';
        link.rel = 'noopener';
        screen.appendChild(link);
    }
    screen.appendChild(el('div', 'dz-spacer'));
    const actions = el('div', 'dz-actions');
    const nextBtn = el('button', 'dz-btn dz-btn-primary', 'Continuar o caminho');
    nextBtn.type = 'button';
    nextBtn.addEventListener('click', renderCrescer);
    actions.appendChild(nextBtn);
    const helpBtn = el('button', 'dz-btn dz-btn-ghost', 'Ajuda');
    helpBtn.type = 'button';
    helpBtn.addEventListener('click', renderAjuda);
    actions.appendChild(helpBtn);
    screen.appendChild(actions);
}

// ---------- Screen: crescer (Ilhas 3, 4, 5 as one real checklist) ----------
function growthAction(item, dados) {
    if (!item.disponivel) return null;
    if (item.chave === 'whatsapp_ok' && dados.whatsapp) {
        const digits = String(dados.whatsapp).replace(/\D/g, '');
        const wa = digits.startsWith('351') ? digits : `351${digits}`;
        return { label: 'Testar', href: `https://wa.me/${wa}` };
    }
    if (item.chave === 'qr_code' && state.session.demoSlug) {
        return { label: 'Gerar QR', action: 'qr' };
    }
    if (item.chave === 'instagram_link' || item.chave === 'facebook_link'
        || item.chave === 'servico_extra' || item.chave === 'zona_extra' || item.chave === 'certificacao_extra') {
        return { label: 'Adicionar', action: 'editar' };
    }
    return null;
}

function renderQrModal() {
    const url = `${window.location.origin}/d/${encodeURIComponent(state.session.demoSlug)}`;
    const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(url)}`;
    const overlay = el('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:60;padding:20px';
    const card = el('div');
    card.style.cssText = 'background:var(--dz-surface);border-radius:20px;padding:24px;text-align:center;max-width:300px';
    const img = document.createElement('img');
    img.src = qrSrc;
    img.alt = 'Código QR do site';
    img.style.cssText = 'width:100%;border-radius:12px;margin-bottom:12px';
    card.appendChild(img);
    card.appendChild(el('p', 'dz-hint', url));
    const closeBtn = el('button', 'dz-btn dz-btn-secondary', 'Fechar');
    closeBtn.type = 'button';
    closeBtn.style.marginTop = '12px';
    closeBtn.addEventListener('click', () => overlay.remove());
    card.appendChild(closeBtn);
    overlay.appendChild(card);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
}

function renderEditarCampo(chave) {
    const map = {
        instagram_link: { campo: 'instagram', label: 'Instagram', placeholder: '@utilizador ou link' },
        facebook_link: { campo: 'facebook', label: 'Facebook', placeholder: 'facebook.com/…' },
        servico_extra: { campo: 'principais_servicos', label: 'Serviços', placeholder: 'Liste os serviços, separados por vírgula' },
        zona_extra: { campo: 'cidade', label: 'Zona', placeholder: 'Ex.: Porto, Gaia, Matosinhos' },
        certificacao_extra: { campo: 'certificacoes', label: 'Certificações', placeholder: 'Ex.: Alvará nº…' }
    };
    const spec = map[chave];
    if (!spec) return;
    const overlay = el('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:flex-end;justify-content:center;z-index:60';
    const card = el('div');
    card.style.cssText = 'background:var(--dz-surface);border-radius:20px 20px 0 0;padding:22px;width:100%;max-width:480px';
    card.appendChild(el('p', 'dz-field-label', spec.label));
    const input = el('input', 'dz-input');
    input.placeholder = spec.placeholder;
    input.value = (state.session.dados && state.session.dados[spec.campo]) || '';
    card.appendChild(input);
    const row = el('div', 'dz-actions');
    row.style.marginTop = '12px';
    const saveBtn = el('button', 'dz-btn dz-btn-primary', 'Guardar');
    saveBtn.type = 'button';
    saveBtn.addEventListener('click', async () => {
        const value = clean(input.value);
        if (!value) return;
        saveBtn.disabled = true;
        try {
            await api(`/sessoes/${encodeURIComponent(state.token)}/dados`, {
                method: 'PATCH',
                body: { patch: { [spec.campo]: value }, chave: `crescer_${chave}`, pontos: GROWTH_POINTS[chave] || 25 }
            });
            await refreshSession();
            overlay.remove();
            renderCrescer();
        } catch (err) {
            toast(err.message || 'Não consegui guardar.');
            saveBtn.disabled = false;
        }
    });
    row.appendChild(saveBtn);
    card.appendChild(row);
    overlay.appendChild(card);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
    input.focus();
}

const GROWTH_POINTS = {
    instagram_link: 60, facebook_link: 40, servico_extra: 25, zona_extra: 25, certificacao_extra: 25
};

function renderIsland(screen, title, sub, items, dados) {
    const island = el('div', 'dz-island');
    island.appendChild(el('p', 'dz-island-title', title));
    island.appendChild(el('p', 'dz-island-sub', sub));
    items.forEach((item) => {
        const row = el('div', `dz-item${item.feito ? ' is-done' : ''}${!item.disponivel && !item.feito ? ' is-disabled' : ''}`);
        row.appendChild(el('span', 'dz-item-check', item.feito ? '✓' : ''));
        const body = el('div', 'dz-item-body');
        body.appendChild(el('p', 'dz-item-label', item.label));
        if (item.nota) body.appendChild(el('p', 'dz-item-note', item.nota));
        row.appendChild(body);
        if (!item.feito) {
            const action = growthAction(item, dados);
            if (action) {
                const btn = action.href ? el('a', 'dz-item-action', action.label) : el('button', 'dz-item-action', action.label);
                if (action.href) { btn.href = action.href; btn.target = '_blank'; btn.rel = 'noopener'; }
                else {
                    btn.type = 'button';
                    btn.addEventListener('click', () => {
                        if (action.action === 'qr') renderQrModal();
                        else if (action.action === 'editar') renderEditarCampo(item.chave);
                    });
                }
                row.appendChild(btn);
            } else {
                row.appendChild(el('span', 'dz-item-pts', `+${item.pontos}`));
            }
        } else {
            row.appendChild(el('span', 'dz-item-pts', `+${item.pontos}`));
        }
        island.appendChild(row);
    });
    screen.appendChild(island);
}

async function renderCrescer() {
    const screen = screenShell({ back: renderNivel2, points: state.session.pontos });
    screen.appendChild(el('p', 'dz-kicker', 'A CRESCER'));
    screen.appendChild(el('h1', 'dz-h1', 'Nunca fica completo — e é por isso que vale a pena voltar.'));
    const loading = el('p', 'dz-lede', 'A carregar…');
    screen.appendChild(loading);
    try {
        const growth = await api(`/sessoes/${encodeURIComponent(state.token)}/crescimento`);
        loading.remove();
        const dados = state.session.dados || {};
        renderIsland(screen, 'Ilha 3 · Ser encontrado', 'O Google — tudo grátis, tudo com texto já escrito.', growth.ilha3, dados);
        renderIsland(screen, 'Ilha 4 · Ser partilhado', 'Onde as pessoas já estão: WhatsApp, Instagram, QR.', growth.ilha4, dados);
        renderIsland(screen, 'Ilha 5 · Crescer', 'Sempre aberto.', growth.ilha5, dados);
    } catch (err) {
        loading.textContent = err.message || 'Não foi possível carregar.';
    }
    const actions = el('div', 'dz-actions');
    const helpBtn = el('button', 'dz-btn dz-btn-ghost', 'Ajuda');
    helpBtn.type = 'button';
    helpBtn.addEventListener('click', renderAjuda);
    actions.appendChild(helpBtn);
    screen.appendChild(actions);
}

// ---------- Screen: ajuda ----------
const FAQ = [
    ['Pago todos os meses?', 'Não. São 49 € uma vez. Sem mensalidades — alterações de conteúdo são sempre grátis.'],
    ['O que são os pontos?', 'Medem o quanto o seu negócio está pronto para ser encontrado. Nunca descem.'],
    ['Como mudo uma coisa no site?', 'Volte a este link a qualquer altura — as respostas atualizam o site direto.'],
    ['Preciso de ficha do Google?', 'Ajuda bastante, mas o site funciona sem ela. Ligamos assim que estiver disponível.'],
    ['Perdi o link. Como entro?', 'Fale connosco pelo WhatsApp com o nome do negócio — confirmamos e reenviamos o link.']
];

function renderAjuda() {
    const screen = screenShell({ back: () => (state.session && state.session.pago ? renderCrescer() : goToNextQuestion()) });
    screen.appendChild(el('h1', 'dz-h1', 'Ajuda'));
    screen.appendChild(el('p', 'dz-lede', 'Fale com uma pessoa. Sem menus.'));
    const wa = el('a', 'dz-btn dz-btn-whatsapp', 'Falar por WhatsApp');
    wa.href = 'https://wa.me/351936732879';
    wa.target = '_blank';
    wa.rel = 'noopener';
    screen.appendChild(wa);
    screen.appendChild(el('p', 'dz-hint', 'Segunda a sábado, 9h–19h.'));
    const faqWrap = el('div');
    faqWrap.style.marginTop = '20px';
    FAQ.forEach(([q, a]) => {
        const details = el('details', 'dz-faq');
        const summary = document.createElement('summary');
        summary.textContent = q;
        details.appendChild(summary);
        details.appendChild(el('p', '', a));
        faqWrap.appendChild(details);
    });
    screen.appendChild(faqWrap);
}

// ---------- Bootstrap ----------
async function boot() {
    const params = new URLSearchParams(window.location.search);
    const pathToken = tokenFromPath();
    let stored = '';
    try { stored = localStorage.getItem(TOKEN_KEY) || ''; } catch (_) { /* ignore */ }
    state.token = pathToken || stored;

    if (!state.token) return renderEntrada();

    persistToken(state.token);
    try {
        await refreshSession();
    } catch (_) {
        try { localStorage.removeItem(TOKEN_KEY); } catch (__) { /* ignore */ }
        window.history.replaceState(null, '', '/digitalize');
        return renderEntrada();
    }

    if (params.get('pagamento') === 'sucesso') return renderConfirmarPagamento();
    if (state.session.pago) return renderCrescer();
    if (state.session.pagamentoEstado === 'pendente') return renderConfirmarPagamento();
    return goToNextQuestion();
}

boot();
