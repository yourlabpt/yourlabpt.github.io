/**
 * Controlo da lead — the single place where outreach happens.
 *
 * The panel never shows a menu of options: it shows one pending action, with the
 * message already written, and buttons for what happened. The seller decides the
 * outcome; the server decides what comes next.
 */
import { formatCountdown, formatCallDue } from './demo/confirm-call.js';

const CANAL_LABEL = {
    email: 'Email',
    whatsapp: 'WhatsApp',
    ligacao: 'Ligação',
    visita: 'Visita'
};

const CANAL_ACAO = {
    email: 'Abrir email',
    whatsapp: 'Abrir WhatsApp',
    ligacao: 'Ligar',
    visita: 'Registar visita'
};

const TOQUE_ESTADO_LABEL = {
    feito: 'feito',
    saltado: 'saltado',
    falhado: 'falhou',
    agendado: 'agendado'
};

const RESULTADO_LABEL = {
    enviado: 'enviado',
    respondeu: 'respondeu',
    viu: 'viu',
    nao_viu: 'não viu',
    nao_e_altura: 'não é altura',
    funcionario: 'atendeu funcionário',
    nao_atendeu: 'não atendeu',
    nao_agora: 'não agora',
    e_nao: 'é não',
    hesitou: 'hesitou',
    canal_direto: 'canal direto obtido',
    sem_sinal: 'sem sinal',
    sem_email: 'não tem email',
    smtp_falhou: 'o email não saiu',
    ligou: 'ligou',
    removido: 'pediu REMOVER'
};

const SINAL_ORIGEM_LABEL = {
    respondeu: 'respondeu',
    chamada_atendida: 'atendeu a chamada',
    visitou_demo: 'abriu a demo'
};

const PASSOS_WA_SEQUENCIA = { WA1: 1, WA2: 2, WA3: 3 };
const PASSOS_EMAIL = ['EMAIL1', 'EMAIL2'];

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
}

function fieldWrap(labelText, control) {
    const label = el('label', 'field');
    label.append(el('span', 'field-label', labelText), control);
    return label;
}

function checkbox(labelText, checked) {
    const label = el('label', 'lead-proc-check');
    const input = el('input');
    input.type = 'checkbox';
    input.checked = checked === true;
    label.append(input, el('span', '', labelText));
    return { label, input };
}

function digitsPhone(raw) {
    const d = String(raw || '').replace(/\D/g, '');
    if (!d) return '';
    if (d.startsWith('351')) return d;
    return d.length === 9 ? `351${d}` : d;
}

function dataHora(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString('pt-PT', {
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
    });
}

function proximaSemana(meses = 3) {
    const d = new Date();
    d.setMonth(d.getMonth() + meses);
    return d.toISOString().slice(0, 10);
}

export function renderLeadProcess(host, { leadId, api, onToast, onChanged } = {}) {
    let view = null;
    let timer = null;

    const toast = (msg, bad) => { if (onToast) onToast(msg, bad); };

    async function call(path, options) {
        const { response, data } = await api(path, options);
        if (!response.ok) {
            throw new Error((data && data.error) || 'Não foi possível concluir.');
        }
        return data;
    }

    async function load() {
        const data = await call(`/api/digitalizept/leads/${encodeURIComponent(leadId)}/process`);
        view = data;
        paint();
        if (onChanged) onChanged(data);
    }

    async function act(fn, botao) {
        if (botao) botao.disabled = true;
        try {
            await fn();
            await load();
        } catch (err) {
            toast((err && err.message) || 'Erro de rede.', true);
        } finally {
            if (botao) botao.disabled = false;
        }
    }

    /* ------------------------------------------------------------- cabeçalho */

    function header() {
        const box = el('div', 'lead-proc-head');
        const lead = view.lead || {};
        const title = el('div', 'lead-proc-title');
        title.append(el('h3', '', lead.nome || 'Lead'));
        const badge = el('span', 'lead-proc-estado', view.estadoLabel || view.estado || '—');
        badge.setAttribute('data-estado', view.estado || '');
        title.appendChild(badge);
        box.appendChild(title);

        const linha = [lead.cidade, view.gancho && view.gancho.nomeCurto ? `gancho ${view.gancho.id} · ${view.gancho.nomeCurto}` : '']
            .filter(Boolean).join(' · ');
        if (linha) box.appendChild(el('p', 'meta', linha));
        if (view.gancho && view.gancho.titulo) {
            box.appendChild(el('p', 'lead-proc-gancho', view.gancho.titulo));
        }

        const proxima = view.proximaAcao;
        if (proxima && proxima.agendadoPara) {
            const restante = new Date(proxima.agendadoPara).getTime() - Date.now();
            const conta = el('p', 'lead-proc-conta');
            conta.setAttribute('data-countdown', proxima.agendadoPara);
            conta.textContent = restante > 0
                ? `Próxima ação em ${formatCountdown(restante)} — ${formatCallDue(proxima.agendadoPara)}`
                : `Próxima ação disponível desde ${formatCallDue(proxima.agendadoPara)}`;
            if (restante <= 0) conta.classList.add('lead-proc-conta-due');
            box.appendChild(conta);
        }
        if (view.processo && view.processo.sinal) {
            const origem = SINAL_ORIGEM_LABEL[view.processo.sinalOrigem] || view.processo.sinalOrigem;
            box.appendChild(el('p', 'meta', `Há sinal: ${origem}.`));
        }
        if (view.revisitarEm) {
            box.appendChild(el('p', 'meta', `Revisita marcada para ${formatCallDue(view.revisitarEm) || view.revisitarEm}.`));
        }
        return box;
    }

    /* ------------------------------------------------------------ cartão agora */

    function bloqueiosBox() {
        if (!view.bloqueios || !view.bloqueios.length) return null;
        const box = el('div', 'lead-proc-bloqueios');
        box.appendChild(el('p', 'lead-proc-bloqueio-titulo', 'Antes de avançar'));
        view.bloqueios.forEach((b) => box.appendChild(el('p', 'lead-proc-bloqueio', b.motivo)));
        return box;
    }

    function instrucoesBox(instrucoes) {
        if (!instrucoes) return null;
        const box = el('div', 'lead-proc-instrucoes');
        box.appendChild(el('p', 'lead-proc-obj', instrucoes.objetivo));
        if (instrucoes.naoFazer) box.appendChild(el('p', 'lead-proc-nao', instrucoes.naoFazer));
        if (instrucoes.registar) box.appendChild(el('p', 'meta', instrucoes.registar));
        return box;
    }

    function agoraCard() {
        const detalhe = view.proximaAcaoDetalhe;
        const box = el('div', 'lead-proc-agora');
        if (!detalhe) {
            box.appendChild(el('h4', '', 'Nada pendente'));
            box.appendChild(el('p', 'meta', view.estado === 'REMOVIDO'
                ? 'O cliente pediu REMOVER. Todos os canais estão fechados.'
                : 'Este lead saiu do ciclo ativo. Reabre pelo encerramento em baixo, ou espera a revisita.'));
            return box;
        }
        const instrucoes = detalhe.instrucoes || {};
        box.appendChild(el('h4', '', instrucoes.titulo || detalhe.passo));
        box.appendChild(el('p', 'lead-proc-canal', `${CANAL_LABEL[detalhe.canal] || 'Passo'} · ${detalhe.passo}`));
        const guia = instrucoesBox(instrucoes);
        if (guia) box.appendChild(guia);
        const travas = bloqueiosBox();
        if (travas) box.appendChild(travas);

        const proxima = view.proximaAcao || {};
        if (proxima.saltar) {
            const motivo = proxima.motivo === 'sem_sinal'
                ? 'Não houve sinal nenhum: nem resposta, nem chamada atendida, nem visita à demo. Esta chamada não se faz — o passo grava-se como saltado e o ciclo segue para o email de fecho.'
                : 'Este lead não tem email, por isso o Email 1 não se envia. Grava-se como saltado e segue para o WhatsApp.';
            box.appendChild(el('p', 'lead-proc-saltar', motivo));
            const saltarBtn = el('button', 'btn-primary', 'Saltar este passo');
            saltarBtn.type = 'button';
            saltarBtn.addEventListener('click', () => act(() => call(
                `/api/digitalizept/leads/${encodeURIComponent(leadId)}/process/advance`,
                { method: 'POST', body: { passo: detalhe.passo, saltar: true, resultado: proxima.motivo } }
            ), saltarBtn));
            const acoes = el('div', 'lead-proc-acoes');
            acoes.appendChild(saltarBtn);
            box.appendChild(acoes);
            return box;
        }

        let assuntoInput = null;
        if (PASSOS_EMAIL.includes(detalhe.passo)) {
            assuntoInput = el('input', 'field-input');
            assuntoInput.value = detalhe.assunto || '';
            box.appendChild(fieldWrap('Assunto', assuntoInput));
        }
        const texto = el('textarea', 'field-input lead-proc-msg');
        texto.rows = detalhe.canal === 'ligacao' ? 4 : 10;
        texto.value = detalhe.mensagem || '';
        if (detalhe.canal === 'ligacao') texto.placeholder = 'Como foi a chamada — o que ele disse, palavra a palavra se der.';
        box.appendChild(fieldWrap(
            detalhe.canal === 'ligacao' ? 'Nota da chamada' : 'Mensagem para este lead',
            texto
        ));

        const acoes = el('div', 'lead-proc-acoes');
        const travado = (view.bloqueios || []).length > 0;

        if (detalhe.url) {
            const abrir = el('a', 'btn-secondary', CANAL_ACAO[detalhe.canal] || 'Abrir');
            abrir.href = detalhe.url;
            if (detalhe.canal === 'whatsapp') {
                abrir.target = '_blank';
                abrir.rel = 'noopener';
            }
            if (travado) {
                abrir.setAttribute('aria-disabled', 'true');
                abrir.classList.add('lead-proc-off');
                abrir.addEventListener('click', (e) => {
                    e.preventDefault();
                    toast(view.bloqueios[0].motivo, true);
                });
            } else if (detalhe.canal === 'whatsapp') {
                abrir.addEventListener('click', () => {
                    abrir.href = buildWaUrl(detalhe, texto.value);
                });
            }
            acoes.appendChild(abrir);
        }

        if (detalhe.canal === 'whatsapp') {
            const enviado = el('button', 'btn-primary', 'Enviei a mensagem');
            enviado.type = 'button';
            enviado.disabled = travado;
            enviado.addEventListener('click', () => act(() => marcarWhatsapp(detalhe, texto.value), enviado));
            acoes.appendChild(enviado);
        }

        if (PASSOS_EMAIL.includes(detalhe.passo)) {
            const enviar = el('button', 'btn-primary', 'Enviar email');
            enviar.type = 'button';
            enviar.disabled = travado || !(view.contacto && view.contacto.temEmail);
            enviar.addEventListener('click', () => act(() => call(
                `/api/digitalizept/leads/${encodeURIComponent(leadId)}/outreach/email`,
                {
                    method: 'POST',
                    body: {
                        passo: detalhe.passo,
                        subject: assuntoInput ? assuntoInput.value : '',
                        text: texto.value
                    }
                }
            ), enviar));
            acoes.appendChild(enviar);
        }

        (detalhe.resultados || []).forEach((r) => {
            if (detalhe.canal !== 'ligacao') return;
            const btn = el('button', 'btn-secondary', r.label);
            btn.type = 'button';
            btn.disabled = travado;
            btn.addEventListener('click', () => act(() => registarChamada(detalhe, r.id, texto.value), btn));
            acoes.appendChild(btn);
        });

        box.appendChild(acoes);

        if (podeMarcarResposta()) {
            const respondeu = el('button', 'btn-secondary', 'O cliente respondeu');
            respondeu.type = 'button';
            respondeu.addEventListener('click', () => act(() => call(
                `/api/digitalizept/leads/${encodeURIComponent(leadId)}/outreach/reply`,
                { method: 'POST', body: { step: passoRespostaPendente() } }
            ), respondeu));
            const extra = el('div', 'lead-proc-acoes');
            extra.appendChild(respondeu);
            box.appendChild(extra);
        }
        return box;
    }

    function buildWaUrl(detalhe, mensagem) {
        const base = String(detalhe.url || '').split('?')[0];
        return `${base}?text=${encodeURIComponent(mensagem || '')}`;
    }

    function marcarWhatsapp(detalhe, mensagem) {
        const step = PASSOS_WA_SEQUENCIA[detalhe.passo];
        if (step) {
            return call(`/api/digitalizept/leads/${encodeURIComponent(leadId)}/outreach/whatsapp`, {
                method: 'POST',
                body: { step, text: mensagem }
            });
        }
        return call(`/api/digitalizept/leads/${encodeURIComponent(leadId)}/process/advance`, {
            method: 'POST',
            body: { passo: detalhe.passo, resultado: 'enviado', texto: mensagem }
        });
    }

    function registarChamada(detalhe, resultado, nota) {
        return call(`/api/digitalizept/leads/${encodeURIComponent(leadId)}/process/advance`, {
            method: 'POST',
            body: {
                passo: detalhe.passo,
                canal: 'ligacao',
                resultado,
                nota,
                estado: resultado === 'nao_atendeu' ? 'falhado' : 'feito'
            }
        });
    }

    function passoRespostaPendente() {
        const wa1 = (view.toques || []).some((t) => t.passo === 'WA1' && t.resultado === 'enviado');
        const wa2 = (view.toques || []).some((t) => t.passo === 'WA2' && t.resultado === 'enviado');
        if (wa2) return 2;
        if (wa1) return 1;
        return 0;
    }

    function podeMarcarResposta() {
        if (view.processo && view.processo.sinalOrigem === 'respondeu') return false;
        return passoRespostaPendente() > 0;
    }

    /* ------------------------------------------------- abertura, idioma, valores */

    function aberturaCard() {
        const gancho = view.gancho || {};
        const fu = view.followup || {};
        const box = el('div', 'lead-proc-abertura');
        box.appendChild(el('h4', '', 'Abertura desta lead'));

        const lista = el('div', 'lead-proc-ganchos');
        let escolhido = gancho.id || gancho.sugerido || 'A';
        const botoes = {};
        (gancho.lista || []).forEach((g) => {
            const btn = el('button', 'followup-gancho');
            btn.type = 'button';
            btn.append(
                el('span', 'followup-gancho-name', `${g.id} · ${g.nomeCurto}${g.id === gancho.sugerido ? ' · sugerido' : ''}`),
                el('span', 'followup-gancho-title', g.ganchoTitulo)
            );
            botoes[g.id] = btn;
            btn.addEventListener('click', () => {
                escolhido = g.id;
                Object.entries(botoes).forEach(([id, b]) => b.classList.toggle('is-active', id === escolhido));
            });
            lista.appendChild(btn);
        });
        Object.entries(botoes).forEach(([id, b]) => b.classList.toggle('is-active', id === escolhido));
        box.appendChild(lista);

        const problema = el('input', 'field-input');
        problema.value = fu.problemaFicha || '';
        problema.placeholder = 'Ex.: que fecham às 18h';
        box.appendChild(fieldWrap('O que está errado na ficha (gancho E)', problema));

        const linha = el('div', 'lead-proc-acoes');
        const idioma = el('select', 'field-input');
        [['pt', 'Português'], ['en', 'English']].forEach(([id, label]) => {
            const o = document.createElement('option');
            o.value = id;
            o.textContent = label;
            if (fu.lang === id) o.selected = true;
            idioma.appendChild(o);
        });
        const campanha = el('input', 'field-input');
        campanha.type = 'number';
        campanha.min = '0';
        campanha.max = '100';
        campanha.value = String(fu.campanhaPct || 0);
        const precos = checkbox('Valores no email', fu.includePrices);
        const grid = el('div', 'dossier-grid');
        grid.append(fieldWrap('Idioma', idioma), fieldWrap('Campanha (%)', campanha));
        box.append(grid, precos.label);
        if (fu.precosVisiveis && !fu.includePrices) {
            box.appendChild(el('p', 'meta', 'Os valores estão a sair porque já há sinal, ou porque a objeção é o preço.'));
        }

        const guardar = el('button', 'btn-secondary', 'Guardar abertura');
        guardar.type = 'button';
        guardar.addEventListener('click', () => act(async () => {
            await call(`/api/digitalizept/leads/${encodeURIComponent(leadId)}/outreach/lang`, {
                method: 'POST',
                body: {
                    lang: idioma.value,
                    ganchoId: escolhido,
                    problemaFicha: problema.value
                }
            });
            await call(`/api/digitalizept/leads/${encodeURIComponent(leadId)}/outreach/offer`, {
                method: 'POST',
                body: {
                    includePrices: precos.input.checked,
                    campanhaPct: Number(campanha.value) || 0
                }
            });
        }, guardar));
        linha.appendChild(guardar);
        box.appendChild(linha);
        return box;
    }

    /* --------------------------------------------------------- ficha contacto */

    function contactoCard() {
        const proc = view.processo || {};
        const contacto = view.contacto || {};
        const box = el('div', 'lead-proc-contacto');
        box.appendChild(el('h4', '', 'Ficha de contacto'));
        box.appendChild(el('p', 'meta', [
            contacto.tipoNumero === '9x' ? 'Número 9x — telemóvel, provável do dono' : '',
            contacto.tipoNumero === '2x' ? 'Número 2x — fixo, atendedor quase certo' : '',
            contacto.temEmail ? 'Tem email' : 'Sem email',
            proc.canalDireto ? 'Canal direto' : 'Só o número do negócio'
        ].filter(Boolean).join(' · ')));

        const grid = el('div', 'dossier-grid');
        const apelido = checkbox('Apelido do dono confirmado', proc.apelidoConfirmado);
        const whats = checkbox('Tem WhatsApp', proc.temWhatsapp);
        const direto = checkbox('Tenho canal direto', proc.canalDireto);
        const precos = checkbox('Mostrar valores no email', proc.emailPrecosLigado);
        const atendedor = el('input', 'field-input');
        atendedor.value = proc.nomeAtendedor || '';
        atendedor.placeholder = 'Quem atendeu (D. Maria…)';
        const hora = el('input', 'field-input');
        hora.value = proc.melhorHora || '';
        hora.placeholder = 'Melhor hora indicada';
        grid.append(
            fieldWrap('Nome de quem atende', atendedor),
            fieldWrap('Melhor hora', hora)
        );
        const flags = el('div', 'lead-proc-flags');
        flags.append(apelido.label, whats.label, direto.label, precos.label);
        box.append(grid, flags);

        if (!proc.apelidoConfirmado) {
            box.appendChild(el('p', 'lead-proc-nao', 'Os 3 minutos antes de ligar: o número é 9x ou 2x, grava o contacto e vê se tem WhatsApp, e procura o apelido do dono nas respostas do Maps, nas avaliações e na bio do Instagram. Sem isto, o botão de ligar fica fechado.'));
        }

        const guardar = el('button', 'btn-secondary', 'Guardar contacto');
        guardar.type = 'button';
        guardar.addEventListener('click', () => act(() => call(
            `/api/digitalizept/leads/${encodeURIComponent(leadId)}/process/contact`,
            {
                method: 'POST',
                body: {
                    apelidoConfirmado: apelido.input.checked,
                    temWhatsapp: whats.input.checked,
                    canalDireto: direto.input.checked,
                    emailPrecosLigado: precos.input.checked,
                    nomeAtendedor: atendedor.value,
                    melhorHora: hora.value
                }
            }
        ), guardar));
        const acoes = el('div', 'lead-proc-acoes');
        acoes.appendChild(guardar);
        box.appendChild(acoes);
        return box;
    }

    /* ------------------------------------------------------------- linha tempo */

    function timelineCard() {
        const box = el('div', 'lead-proc-timeline');
        box.appendChild(el('h4', '', 'Linha do tempo'));
        const toques = view.toques || [];
        if (!toques.length) {
            box.appendChild(el('p', 'meta', 'Ainda não houve nenhum toque.'));
            return box;
        }
        const lista = el('ul', 'lead-proc-toques');
        toques.forEach((t) => {
            const li = el('li', `lead-proc-toque lead-proc-toque-${t.estado}`);
            const cabeca = el('p', 'lead-proc-toque-head');
            const quando = dataHora(t.executado_em || t.criado_em);
            const partes = [
                t.passo,
                CANAL_LABEL[t.canal] || t.canal,
                TOQUE_ESTADO_LABEL[t.estado] || t.estado,
                RESULTADO_LABEL[t.resultado] || t.resultado,
                t.destino === 'negocio' ? 'número da loja' : ''
            ].filter(Boolean);
            cabeca.textContent = `${quando} · ${partes.join(' · ')}`;
            li.appendChild(cabeca);
            if (t.nota) li.appendChild(el('p', 'meta', t.nota));
            if (t.texto) {
                const det = document.createElement('details');
                det.appendChild(el('summary', '', 'Texto enviado'));
                det.appendChild(el('pre', 'lead-proc-texto', t.texto));
                li.appendChild(det);
            }
            lista.appendChild(li);
        });
        box.appendChild(lista);
        return box;
    }

    /* ------------------------------------------------------------------ fecho */

    function fechoCard() {
        const box = el('div', 'lead-proc-fecho');
        box.appendChild(el('h4', '', 'Encerrar'));
        if (view.estado === 'REMOVIDO') {
            box.appendChild(el('p', 'meta', 'Já está removido. Nada mais sai daqui.'));
            return box;
        }
        box.appendChild(el('p', 'meta', 'Um não com data não é um beco. Os três movimentos são obrigatórios: a data em que voltas, a oferta que fica com ele, e a pergunta de referência.'));

        const data = el('input', 'field-input');
        data.type = 'date';
        data.value = proximaSemana(3);
        const oferta = el('textarea', 'field-input');
        oferta.rows = 3;
        oferta.placeholder = 'A oferta final que fica com ele, sem compromisso.';
        // Pre-filled by the active hook — E gets the Google listing fix, C the
        // site report, everything else the example as a PDF.
        oferta.value = (view.processo && view.processo.ofertaFinal)
            || (view.fecho && view.fecho.ofertaFinalSugerida)
            || '';
        if (view.fecho && view.fecho.precoCongelado) {
            box.appendChild(el('p', 'meta', `O valor que fica congelado: ${view.fecho.precoCongelado}, sem IVA.`));
        }
        const referencia = el('input', 'field-input');
        referencia.placeholder = 'Perguntei — e o que disse';
        const grid = el('div', 'dossier-grid');
        grid.append(
            fieldWrap('Voltar a dar notícias em', data),
            fieldWrap('Pergunta de referência', referencia)
        );
        box.append(grid, fieldWrap('Oferta final', oferta));

        const acoes = el('div', 'lead-proc-acoes');
        const fechar = (estado, resultado, label, classe) => {
            const btn = el('button', classe, label);
            btn.type = 'button';
            btn.addEventListener('click', () => act(() => call(
                `/api/digitalizept/leads/${encodeURIComponent(leadId)}/process/close`,
                {
                    method: 'POST',
                    body: {
                        estado,
                        resultado,
                        revisitarEm: data.value ? new Date(data.value).toISOString() : '',
                        ofertaFinal: oferta.value,
                        referenciaPedida: referencia.value
                    }
                }
            ), btn));
            acoes.appendChild(btn);
        };
        fechar('ADORMECIDO', 'nao_agora', 'Não agora', 'btn-secondary');
        fechar('RECUSADO', 'e_nao', 'É não', 'btn-secondary');
        const remover = el('button', 'btn-secondary lead-proc-remover', 'Pediu REMOVER');
        remover.type = 'button';
        remover.addEventListener('click', () => {
            if (!window.confirm('Fechar todos os canais para este lead? Isto não se desfaz daqui.')) return;
            act(() => call(
                `/api/digitalizept/leads/${encodeURIComponent(leadId)}/process/close`,
                { method: 'POST', body: { estado: 'REMOVIDO' } }
            ), remover);
        });
        acoes.appendChild(remover);
        box.appendChild(acoes);
        return box;
    }

    /* ------------------------------------------------------------------ paint */

    function tick() {
        const node = host.querySelector('[data-countdown]');
        if (!node) return;
        const alvo = new Date(node.getAttribute('data-countdown')).getTime();
        const restante = alvo - Date.now();
        node.textContent = restante > 0
            ? `Próxima ação em ${formatCountdown(restante)} — ${formatCallDue(node.getAttribute('data-countdown'))}`
            : `Próxima ação disponível desde ${formatCallDue(node.getAttribute('data-countdown'))}`;
        if (restante <= 0) node.classList.add('lead-proc-conta-due');
    }

    function paint() {
        host.innerHTML = '';
        host.className = 'lead-proc';
        if (!view) return;
        host.append(header(), agoraCard(), aberturaCard(), contactoCard(), timelineCard(), fechoCard());
        if (timer) clearInterval(timer);
        timer = setInterval(tick, 1000);
    }

    host.innerHTML = '<p class="admin-hint">A carregar o processo…</p>';
    load().catch((err) => {
        host.innerHTML = '';
        host.appendChild(el('p', 'admin-empty', (err && err.message) || 'Não foi possível carregar o processo.'));
    });

    return {
        refresh: () => load().catch(() => {}),
        destroy: () => { if (timer) clearInterval(timer); }
    };
}
