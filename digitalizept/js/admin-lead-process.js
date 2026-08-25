/**
 * Controlo da lead — the single place where outreach happens.
 *
 * The pending action is already written. The seller records what happened, can
 * walk the trail back or skip ahead, and the server keeps the cadence in sync.
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
    mostrou: 'mostrei a demo',
    nao_estava: 'não estava',
    sem_canal_direto: 'sem canal direto',
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

const PASSOS_EMAIL = ['EMAIL1', 'EMAIL2', 'D4'];

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

const COMO_FAZER = {
    email: 'Abre o email → envia → toca em Enviar email.',
    whatsapp: 'Abre o WhatsApp → envia → toca em Enviei a mensagem.',
    ligacao: 'Liga → escolhe o que aconteceu.',
    visita: 'Mostra a demo → escolhe o que aconteceu.'
};

export function renderLeadProcess(host, {
    leadId, api, onToast, onChanged, statusHost
} = {}) {
    let view = null;
    let timer = null;
    let abrirFecho = false;
    let fechoWhatsappAberto = false;

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

    function steer(body) {
        return call(
            `/api/digitalizept/leads/${encodeURIComponent(leadId)}/process/steer`,
            { method: 'POST', body }
        );
    }

    /* --------------------------------------------------------------- estado */

    function linhaCountdown(iso, prefixo = 'Próxima ação') {
        if (!iso) return null;
        const restante = new Date(iso).getTime() - Date.now();
        const conta = el('p', 'lead-proc-conta');
        conta.setAttribute('data-countdown', iso);
        conta.textContent = restante > 0
            ? `${prefixo} em ${formatCountdown(restante)} — ${formatCallDue(iso)}`
            : `${prefixo} disponível desde ${formatCallDue(iso)}`;
        if (restante <= 0) conta.classList.add('lead-proc-conta-due');
        return conta;
    }

    function paintStatus() {
        if (!statusHost) return;
        statusHost.innerHTML = '';
        statusHost.className = 'dossier-status';
        if (!view) return;

        const title = el('div', 'lead-proc-title');
        const badge = el('span', 'lead-proc-estado', view.estadoLabel || view.estado || '—');
        badge.setAttribute('data-estado', view.estado || '');
        title.appendChild(badge);
        statusHost.appendChild(title);

        const lead = view.lead || {};
        const linha = [lead.cidade, view.gancho && view.gancho.nomeCurto ? `gancho ${view.gancho.id} · ${view.gancho.nomeCurto}` : '']
            .filter(Boolean).join(' · ');
        if (linha) statusHost.appendChild(el('p', 'meta', linha));
        if (view.gancho && view.gancho.titulo) {
            statusHost.appendChild(el('p', 'lead-proc-gancho', view.gancho.titulo));
        }

        const detalhe = view.proximaAcaoDetalhe;
        const passoTitulo = (detalhe && detalhe.instrucoes && detalhe.instrucoes.titulo)
            || (view.proximaAcao && view.proximaAcao.passo)
            || '';
        if (passoTitulo) {
            statusHost.appendChild(el('p', 'dossier-status-passo', passoTitulo));
        } else {
            statusHost.appendChild(el('p', 'meta', 'Nada pendente neste ciclo.'));
        }
        const conta = linhaCountdown(view.proximaAcao && view.proximaAcao.agendadoPara);
        if (conta) statusHost.appendChild(conta);
        if (view.processo && view.processo.sinal) {
            const origem = SINAL_ORIGEM_LABEL[view.processo.sinalOrigem] || view.processo.sinalOrigem;
            statusHost.appendChild(el('p', 'meta', `Há sinal: ${origem}.`));
        }
        if (view.revisitarEm) {
            statusHost.appendChild(el('p', 'meta', `Revisita marcada para ${formatCallDue(view.revisitarEm) || view.revisitarEm}.`));
        }
        if (view.proximaAcaoDetalhe) {
            const ir = el('button', 'btn-primary', 'Fazer agora');
            ir.type = 'button';
            ir.addEventListener('click', () => {
                const shell = statusHost.closest('.dossier');
                const btn = shell && shell.querySelector('[data-vista="controlo"]');
                if (btn) btn.click();
            });
            statusHost.appendChild(ir);
        }
    }

    /* --------------------------------------------------------------- trilho */

    function trilhoCard() {
        const trilho = view.trilho || [];
        const box = el('div', 'lead-proc-trilho');
        if (trilho.length) {
            const fila = el('div', 'lead-proc-trilho-fila');
            trilho.forEach((item) => {
                const btn = el('button', 'lead-proc-trilho-passo', item.label);
                btn.type = 'button';
                if (item.agora) btn.classList.add('is-agora');
                if (item.feito && !item.agora) btn.classList.add('is-feito');
                if (item.forçado) btn.classList.add('is-forcado');
                btn.title = item.agora
                    ? 'Passo actual'
                    : (item.feito ? 'Já feito — tocar para repetir' : 'Tocar para ir a este passo');
                btn.addEventListener('click', () => {
                    if (item.agora && !item.forçado) return;
                    act(() => steer({ acao: 'irPara', passo: item.id }), btn);
                });
                fila.appendChild(btn);
            });
            box.appendChild(fila);
        }

        const barra = el('div', 'lead-proc-trilho-barra');
        const voltar = el('button', 'btn-secondary', 'Passo anterior');
        voltar.type = 'button';
        voltar.disabled = !(view.controlo && view.controlo.podeVoltar);
        voltar.addEventListener('click', () => act(() => steer({ acao: 'voltar' }), voltar));

        const passo = view.proximaAcao && view.proximaAcao.passo;
        const saltar = el('button', 'btn-secondary', 'Saltar este');
        saltar.type = 'button';
        saltar.disabled = !passo || passo === 'DEMO' || passo === 'ACOMPANHAR';
        saltar.addEventListener('click', () => {
            if (!window.confirm('Saltar este passo e seguir para o próximo?')) return;
            act(() => steer({ acao: 'saltar' }), saltar);
        });

        const diverted = Boolean(view.controlo && (view.controlo.passoForcado || view.controlo.estadoTravado));
        const auto = el('button', 'btn-secondary', 'Seguir o processo');
        auto.type = 'button';
        auto.disabled = !diverted;
        auto.addEventListener('click', () => act(() => steer({ acao: 'automatico' }), auto));

        const estadoSel = el('select', 'field-input lead-proc-estado-sel');
        const actual = document.createElement('option');
        actual.value = '';
        actual.textContent = `Estado: ${view.estadoLabel || view.estado || 'automático'}`;
        estadoSel.appendChild(actual);
        (view.controlo && view.controlo.estados ? view.controlo.estados : []).forEach((item) => {
            const opt = document.createElement('option');
            opt.value = item.id;
            opt.textContent = item.label;
            estadoSel.appendChild(opt);
        });
        estadoSel.value = (view.controlo && view.controlo.estadoTravado) || '';
        estadoSel.addEventListener('change', () => act(
            () => steer({ acao: 'estado', estado: estadoSel.value }),
            estadoSel
        ));

        barra.append(voltar, saltar, auto, estadoSel);
        box.appendChild(barra);
        if (diverted) {
            box.appendChild(el('p', 'lead-proc-trilho-nota', 'Estás a guiar à mão. Seguir o processo devolve a cadência.'));
        }
        return box;
    }

    /* ------------------------------------------------------------ cartão agora */

    function bloqueiosBox() {
        if (!view.bloqueios || !view.bloqueios.length) return null;
        const box = el('div', 'lead-proc-bloqueios');
        box.appendChild(el('p', 'lead-proc-bloqueio-titulo', 'Antes de avançar'));
        view.bloqueios.forEach((b) => box.appendChild(el('p', 'lead-proc-bloqueio', b.motivo)));
        if (view.bloqueios.some((b) => b.id === 'apelido')) {
            const hint = el('p', 'meta', 'Confirma o apelido em Antes de ligar, em baixo, e toca em Guardar contacto.');
            box.appendChild(hint);
            const ir = el('button', 'btn-secondary', 'Ir a Antes de ligar');
            ir.type = 'button';
            ir.addEventListener('click', () => {
                const alvo = host.querySelector('[data-contacto]');
                if (alvo) alvo.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
            box.appendChild(ir);
        }
        return box;
    }

    function instrucoesBox(instrucoes) {
        if (!instrucoes) return null;
        const box = el('div', 'lead-proc-instrucoes');
        if (instrucoes.objetivo) box.appendChild(el('p', 'lead-proc-obj', instrucoes.objetivo));
        if (instrucoes.naoFazer || instrucoes.registar) {
            const extra = document.createElement('details');
            extra.className = 'lead-proc-instrucoes-mais';
            extra.appendChild(el('summary', '', 'O que não fazer'));
            if (instrucoes.naoFazer) extra.appendChild(el('p', 'lead-proc-nao', instrucoes.naoFazer));
            if (instrucoes.registar) extra.appendChild(el('p', 'meta', instrucoes.registar));
            box.appendChild(extra);
        }
        return box;
    }

    function comoFazerBox(canal) {
        const texto = COMO_FAZER[canal];
        if (!texto) return null;
        const box = el('p', 'lead-proc-como', texto);
        return box;
    }

    function guiaoBox(detalhe) {
        const guiao = view.guiao;
        if (!guiao || detalhe.canal !== 'ligacao') return null;
        const box = document.createElement('details');
        box.className = 'lead-proc-guiao';
        box.open = true;
        box.appendChild(el('summary', '', 'Guião de chamada'));
        if (guiao.abertura) {
            box.appendChild(el('p', 'lead-proc-guiao-abertura', guiao.abertura));
        }
        if (guiao.licenca) box.appendChild(el('p', 'meta', guiao.licenca));
        if (guiao.pergunta) box.appendChild(el('p', 'lead-proc-guiao-pergunta', guiao.pergunta));
        (guiao.ramos || []).forEach((r) => {
            const ramo = el('div', 'lead-proc-ramo');
            ramo.appendChild(el('strong', '', r.titulo || r.id));
            ramo.appendChild(el('p', '', r.texto));
            box.appendChild(ramo);
        });
        return box;
    }

    function chipsBox(items, { titulo, onPick, diz, nunca } = {}) {
        if (!items || !items.length) return null;
        const box = el('div', 'lead-proc-chips');
        if (titulo) box.appendChild(el('p', 'lead-proc-chip-titulo', titulo));
        const fila = el('div', 'lead-proc-chip-fila');
        items.forEach((item) => {
            const btn = el('button', 'lead-proc-chip', item.label || item.oQueDiz);
            btn.type = 'button';
            if (diz) btn.title = item.nunca ? `Nunca: ${item.nunca}` : '';
            btn.addEventListener('click', () => onPick(item));
            fila.appendChild(btn);
        });
        box.appendChild(fila);
        if (nunca) box.appendChild(el('p', 'meta', nunca));
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
        const cabeca = el('div', 'lead-proc-agora-cabeca');
        cabeca.appendChild(el('h4', 'lead-proc-agora-titulo', instrucoes.titulo || detalhe.passo));
        if (detalhe.canal) {
            cabeca.appendChild(el('span', 'lead-proc-canal', CANAL_LABEL[detalhe.canal] || 'Passo'));
        }
        box.appendChild(cabeca);
        const quando = linhaCountdown(view.proximaAcao && view.proximaAcao.agendadoPara, 'Este passo');
        if (quando) box.appendChild(quando);
        const como = comoFazerBox(detalhe.canal);
        if (como) box.appendChild(como);

        if (detalhe.passo === 'R1') {
            const guia = instrucoesBox(instrucoes);
            if (guia) box.appendChild(guia);
            box.appendChild(el('p', 'meta', 'Os três movimentos estão em Encerrar, a seguir. Abre o WhatsApp de lá, envia, e confirma.'));
            return box;
        }

        const guia = instrucoesBox(instrucoes);
        if (guia) box.appendChild(guia);
        const script = guiaoBox(detalhe);
        if (script) box.appendChild(script);
        const travas = bloqueiosBox();
        if (travas) box.appendChild(travas);

        const proxima = view.proximaAcao || {};
        if (proxima.saltar) {
            const motivo = proxima.motivo === 'sem_sinal'
                ? 'Não houve sinal nenhum. Esta chamada não se faz — o passo grava-se como saltado e o ciclo segue.'
                : proxima.motivo === 'sem_canal_direto'
                    ? 'O Ciclo D não chegou a um canal direto. O lead adormece três meses.'
                    : 'Este passo não se envia (não há email). Grava-se como saltado e o ciclo segue.';
            box.appendChild(el('p', 'lead-proc-saltar', motivo));
            const avancar = el('button', 'btn-primary', 'Avançar');
            avancar.type = 'button';
            avancar.addEventListener('click', () => act(() => call(
                `/api/digitalizept/leads/${encodeURIComponent(leadId)}/process/advance`,
                {
                    method: 'POST',
                    body: { passo: detalhe.passo, saltar: true, resultado: proxima.motivo || 'saltado' }
                }
            ), avancar));
            const acoesSkip = el('div', 'lead-proc-acoes');
            acoesSkip.appendChild(avancar);
            box.appendChild(acoesSkip);
            return box;
        }

        let assuntoInput = null;
        if (PASSOS_EMAIL.includes(detalhe.passo)) {
            assuntoInput = el('input', 'field-input');
            assuntoInput.value = detalhe.assunto || '';
            box.appendChild(fieldWrap('Assunto', assuntoInput));
        }
        const texto = el('textarea', 'field-input lead-proc-msg');
        texto.rows = detalhe.canal === 'ligacao' ? 5 : 8;
        texto.value = detalhe.mensagem || '';
        if (detalhe.canal === 'ligacao') texto.placeholder = 'Como foi a chamada — o que ele disse, palavra a palavra se der.';
        box.appendChild(fieldWrap(
            detalhe.canal === 'ligacao' ? 'Nota da chamada' : 'Texto',
            texto
        ));
        if (detalhe.passo === 'EMAIL1') {
            box.appendChild(el(
                'p',
                'meta',
                'Pode editar o texto. O envio usa sempre o email HTML da YourLab — banner, exemplo e botões ficam no sítio.'
            ));
        }

        const objecoes = chipsBox(view.objecoes, {
            titulo: 'Objeções',
            onPick: (item) => {
                const extra = item.resposta || '';
                texto.value = [texto.value.trim(), extra].filter(Boolean).join('\n\n');
                const meses = Number(item.revisitarMeses) || 3;
                view._objecao = item.id;
                view._revisitarSugerida = proximaSemana(meses);
                const dataInput = host.querySelector('[data-revisitar]');
                if (dataInput) dataInput.value = view._revisitarSugerida;
                toast(`Objeção «${item.label}». Revisita sugerida daqui a ${meses} meses.`);
            }
        });
        if (objecoes && detalhe.canal === 'ligacao') box.appendChild(objecoes);

        const filtros = chipsBox(view.filtrosAtendedor, {
            titulo: 'O atendedor diz…',
            diz: true,
            onPick: (item) => {
                texto.value = [texto.value.trim(), item.resposta].filter(Boolean).join('\n\n');
                toast(`Nunca: ${item.nunca}`);
            }
        });
        if (filtros) box.appendChild(filtros);

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
            if (r.id === 'enviado' && (detalhe.canal === 'whatsapp' || PASSOS_EMAIL.includes(detalhe.passo))) return;
            if (detalhe.canal !== 'ligacao' && detalhe.canal !== 'visita' && r.id !== 'respondeu') return;
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
        return call(`/api/digitalizept/leads/${encodeURIComponent(leadId)}/process/advance`, {
            method: 'POST',
            body: { passo: detalhe.passo, resultado: 'enviado', texto: mensagem }
        });
    }

    function registarChamada(detalhe, resultado, nota) {
        if (detalhe.passo === 'LIG2' && (resultado === 'e_nao' || resultado === 'nao_agora')) {
            abrirFecho = true;
        }
        return call(`/api/digitalizept/leads/${encodeURIComponent(leadId)}/process/advance`, {
            method: 'POST',
            body: {
                passo: detalhe.passo,
                canal: detalhe.canal || 'ligacao',
                resultado,
                nota,
                estado: resultado === 'nao_atendeu' ? 'falhado' : 'feito',
                objecao: view._objecao || ''
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
        const box = document.createElement('details');
        box.className = 'lead-proc-abertura';
        box.appendChild(el('summary', '', 'Abertura desta lead'));

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

    function contactoCard(abrir) {
        const proc = view.processo || {};
        const contacto = view.contacto || {};
        const box = document.createElement('details');
        box.className = 'lead-proc-contacto';
        box.open = abrir === true;
        box.setAttribute('data-contacto', '1');
        box.appendChild(el('summary', '', 'Antes de ligar'));
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
        flags.append(apelido.label, whats.label, direto.label);
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
        const toques = view.toques || [];
        if (!toques.length) return null;
        const box = document.createElement('details');
        box.className = 'lead-proc-timeline';
        box.open = true;
        const n = toques.length;
        box.appendChild(el('summary', '', n === 1 ? 'O que já aconteceu · 1 toque' : `O que já aconteceu · ${n} toques`));
        if (view.processo && view.processo.sinal) {
            const origem = SINAL_ORIGEM_LABEL[view.processo.sinalOrigem] || view.processo.sinalOrigem;
            box.appendChild(el('p', 'meta', `Sinal: ${origem}. Se foste tu a abrir a demo, isto não conta — recarrega o painel depois de um cliente real.`));
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
                t.destino === 'negocio' ? 'número da loja' : '',
                t.vendedor || ''
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
        const box = document.createElement('details');
        box.className = 'lead-proc-fecho';
        const passo = view.proximaAcao && view.proximaAcao.passo;
        box.open = abrirFecho
            || passo === 'R1'
            || view.estado === 'RECUSADO';
        box.appendChild(el('summary', '', 'Encerrar'));
        if (view.estado === 'REMOVIDO') {
            box.appendChild(el('p', 'meta', 'Já está removido. Nada mais sai daqui.'));
            return box;
        }
        box.appendChild(el('p', 'meta', 'Um não com data não é um beco. Os três movimentos são obrigatórios: a data em que voltas, a oferta que fica com ele, e a pergunta de referência.'));

        const data = el('input', 'field-input');
        data.type = 'date';
        data.setAttribute('data-revisitar', '1');
        data.value = view._revisitarSugerida || proximaSemana(3);
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
        if (view.fecho && view.fecho.url) {
            const abrir = el('a', 'btn-primary', 'Abrir WhatsApp do fecho');
            abrir.href = view.fecho.url;
            abrir.target = '_blank';
            abrir.rel = 'noopener';
            abrir.addEventListener('click', () => { fechoWhatsappAberto = true; });
            acoes.appendChild(abrir);
        }
        const fechar = (estado, resultado, label, classe) => {
            const btn = el('button', classe, label);
            btn.type = 'button';
            btn.addEventListener('click', () => {
                if (view.fecho && view.fecho.url && !fechoWhatsappAberto) {
                    if (!window.confirm('A oferta ainda não saiu no WhatsApp. Abriste a mensagem? Sem isso o fecho não chega ao cliente.')) return;
                }
                act(() => call(
                    `/api/digitalizept/leads/${encodeURIComponent(leadId)}/process/close`,
                    {
                        method: 'POST',
                        body: {
                            estado,
                            resultado,
                            revisitarEm: data.value ? new Date(data.value).toISOString() : '',
                            ofertaFinal: oferta.value,
                            referenciaPedida: referencia.value,
                            objecao: view._objecao || '',
                            texto: (view.fecho && view.fecho.mensagem) || ''
                        }
                    }
                ), btn);
            });
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
        const nodes = [
            ...host.querySelectorAll('[data-countdown]'),
            ...(statusHost ? [...statusHost.querySelectorAll('[data-countdown]')] : [])
        ];
        nodes.forEach((node) => {
            const alvo = new Date(node.getAttribute('data-countdown')).getTime();
            const restante = alvo - Date.now();
            const prefixo = node.textContent.startsWith('Este passo') ? 'Este passo' : 'Próxima ação';
            node.textContent = restante > 0
                ? `${prefixo} em ${formatCountdown(restante)} — ${formatCallDue(node.getAttribute('data-countdown'))}`
                : `${prefixo} disponível desde ${formatCallDue(node.getAttribute('data-countdown'))}`;
            if (restante <= 0) node.classList.add('lead-proc-conta-due');
        });
    }

    function paint() {
        host.innerHTML = '';
        host.className = 'lead-proc';
        if (!view) return;
        paintStatus();
        const passo = view.proximaAcao && view.proximaAcao.passo;
        const detalhe = view.proximaAcaoDetalhe;
        const precisaFecho = abrirFecho || passo === 'R1' || view.estado === 'RECUSADO';
        const apelidoBloqueia = (view.bloqueios || []).some((b) => b.id === 'apelido');
        const eChamada = detalhe && detalhe.canal === 'ligacao';

        host.appendChild(trilhoCard());
        host.appendChild(agoraCard());
        if (precisaFecho) host.appendChild(fechoCard());
        if (eChamada || apelidoBloqueia) {
            host.appendChild(contactoCard(apelidoBloqueia));
        }
        const tempo = timelineCard();
        if (tempo) host.appendChild(tempo);
        if (!precisaFecho) host.appendChild(fechoCard());
        host.appendChild(aberturaCard());
        if (abrirFecho) {
            const node = host.querySelector('.lead-proc-fecho');
            if (node) node.scrollIntoView({ behavior: 'smooth', block: 'start' });
            abrirFecho = false;
        }
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
