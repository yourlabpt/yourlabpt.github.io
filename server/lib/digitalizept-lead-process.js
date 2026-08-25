/**
 * Digitalize Portugal — guided lead process (Estratégia v3).
 *
 * The seller never picks what to do next: the server computes one pending action
 * per lead, and the seller only records what happened. Every touch is written to
 * `lead_toque` with the text actually sent, so a lead can be resumed months later.
 */
const crypto = require('crypto');
const outreach = require('./digitalizept-outreach');

const PROCESSO_ESTADOS = [
    'NOVO',
    'DEMO_PRONTO',
    'DESCOBERTA',
    'EM_SEQUENCIA',
    'RESPONDEU',
    'VISITA',
    'PROPOSTA',
    'GANHO',
    'RECUSADO',
    'ADORMECIDO',
    'REVISITA',
    'ARQUIVADO',
    'REMOVIDO'
];

const ESTADO_LABELS = {
    NOVO: 'Novo',
    DEMO_PRONTO: 'Demo pronta',
    DESCOBERTA: 'Descoberta',
    EM_SEQUENCIA: 'Em sequência',
    RESPONDEU: 'Respondeu',
    VISITA: 'Visita',
    PROPOSTA: 'Proposta',
    GANHO: 'Ganho',
    RECUSADO: 'Recusado',
    ADORMECIDO: 'Adormecido',
    REVISITA: 'Revisita',
    ARQUIVADO: 'Arquivado',
    REMOVIDO: 'Removido'
};

// States that only ever come from an explicit decision — never derived back.
const ESTADOS_MANUAIS = new Set(['PROPOSTA', 'VISITA', 'RECUSADO', 'ADORMECIDO', 'REVISITA', 'ARQUIVADO']);

const CANAIS = ['email', 'whatsapp', 'ligacao', 'visita'];
const TOQUE_ESTADOS = ['agendado', 'feito', 'saltado', 'falhado'];

const PASSO_CANAL = {
    EMAIL1: 'email',
    WA1: 'whatsapp',
    LIG1: 'ligacao',
    WA2: 'whatsapp',
    N1: 'whatsapp',
    LIG2: 'ligacao',
    EMAIL2: 'email',
    WA3: 'whatsapp',
    R1: 'whatsapp',
    REVISITA: 'whatsapp',
    D1: 'ligacao',
    D2: 'ligacao',
    D3: 'visita',
    D4: 'email',
    DEMO: '',
    ACOMPANHAR: ''
};

const ANCORA_MANHA = { hour: 9, minute: 30 };

/**
 * Intervals are hours from the start of the sequence (the EMAIL 1 send), not days.
 * D0/D0 cannot express the email-to-WhatsApp bridge, and two channels landing in
 * the same minute is the signature of an automated tool.
 */
const PLANO_TOQUES = [
    { ordem: 1, passo: 'EMAIL1', canal: 'email', intervaloHoras: 0, ancora: ANCORA_MANHA },
    { ordem: 2, passo: 'WA1', canal: 'whatsapp', intervaloHoras: 5, pontePara: 'EMAIL1' },
    { ordem: 3, passo: 'LIG1', canal: 'ligacao', intervaloHoras: 48 },
    { ordem: 4, passo: 'WA2', canal: 'whatsapp', intervaloHoras: 96, semSinal: 'N1' },
    { ordem: 5, passo: 'LIG2', canal: 'ligacao', intervaloHoras: 216, exigeSinal: true },
    { ordem: 6, passo: 'EMAIL2', canal: 'email', intervaloHoras: 264, ancora: ANCORA_MANHA }
];

const PONTE_HORAS_MIN = 4;
const PONTE_HORAS_MAX = 6;

const LIMITE_TENTATIVAS_PASSO = 2;
const LIMITE_CHAMADAS_NEGOCIO_SEMANA = 2;

const RESULTADOS_CHAMADA_ATENDIDA = ['viu', 'nao_viu', 'nao_e_altura', 'funcionario'];

const RESULTADOS_POR_PASSO = {
    EMAIL1: [{ id: 'enviado', label: 'Enviado' }, { id: 'sem_email', label: 'Não tem email' }],
    WA1: [{ id: 'enviado', label: 'Enviado' }],
    WA2: [{ id: 'enviado', label: 'Enviado' }],
    N1: [{ id: 'enviado', label: 'Enviado' }],
    WA3: [{ id: 'enviado', label: 'Enviado' }],
    EMAIL2: [{ id: 'enviado', label: 'Enviado' }],
    REVISITA: [{ id: 'enviado', label: 'Enviado' }, { id: 'respondeu', label: 'Respondeu' }],
    LIG1: [
        { id: 'viu', label: 'Viu' },
        { id: 'nao_viu', label: 'Não viu' },
        { id: 'nao_e_altura', label: 'Não é altura' },
        { id: 'funcionario', label: 'Atendeu funcionário' },
        { id: 'nao_atendeu', label: 'Não atendeu' }
    ],
    LIG2: [
        { id: 'nao_agora', label: 'Não agora' },
        { id: 'e_nao', label: 'É não' },
        { id: 'hesitou', label: 'Hesitou / tem de falar com alguém' },
        { id: 'nao_atendeu', label: 'Não atendeu' }
    ],
    D1: [
        { id: 'canal_direto', label: 'Consegui o canal direto' },
        { id: 'funcionario', label: 'Atendeu funcionário' },
        { id: 'nao_atendeu', label: 'Não atendeu' }
    ]
};

RESULTADOS_POR_PASSO.D2 = RESULTADOS_POR_PASSO.LIG1;

const INSTRUCOES = {
    EMAIL1: {
        titulo: 'Email 1 — depósito de credibilidade',
        objetivo: 'Provar que existe empresa, morada e rodapé legal. É o email que ele reencaminha para o sobrinho ou para o contabilista.',
        naoFazer: 'Não vender e não esperar resposta. Em lead frio o email sai sem valores — preço sem contexto lê-se sempre como caro.',
        registar: 'Marca como enviado. Se o email voltar atrás, marca como falhado — a mensagem de WhatsApp deixa de dizer que mandaste email.'
    },
    WA1: {
        titulo: 'WhatsApp 1 — o canal que é mesmo lido',
        objetivo: 'Levar o link da demo e apanhar a resposta. Refere o email de hoje: é isso que separa seguimento de burla.',
        naoFazer: 'Sem preços, sem PDF, sem parágrafos. Confirma antes que o perfil de WhatsApp Business tem nome real, fotografia de pessoa e morada — um número sem perfil é lido como burla, seja o texto qual for.',
        registar: 'Abre o WhatsApp, envia, e marca como enviado. O texto exato fica guardado.'
    },
    LIG1: {
        titulo: 'Ligação 1 — deixar de ser um estranho',
        objetivo: 'Não é vender. É saber se viu, e sair com uma data ou uma visita. Primeiros 8 segundos: identidade, origem local, e pedir licença.',
        naoFazer: 'Não fazer o pitch a quem não decide. Se disser que apanhaste em má altura, aceita logo e pergunta quando é melhor — isso já é uma marcação.',
        registar: 'Escolhe o ramo que aconteceu. Se atendeu um funcionário, grava o nome e a hora que ela indicou.'
    },
    WA2: {
        titulo: 'WhatsApp 2 — depois da resposta',
        objetivo: 'Mostrar a pesquisa no Google e a página, dizer que o site fica dele, e só então falar de valores.',
        naoFazer: 'Não repetir a mensagem 1. Não prometer ranking.',
        registar: 'Envia e marca como enviado.'
    },
    N1: {
        titulo: 'Não respondeu — só a parte do Google',
        objetivo: 'Uma segunda tentativa curta com o artefacto que costuma surpreender, e a garantia de que o exemplo continua guardado.',
        naoFazer: 'Não perguntar outra vez se recebeu. Não insistir mais do que isto.',
        registar: 'Envia e marca como enviado.'
    },
    LIG2: {
        titulo: 'Ligação 2 — a última',
        objetivo: 'Sair com data ou com um não claro. A pergunta é: é não, ou é não agora? Quase todos escolhem não agora — que é uma data.',
        naoFazer: 'Não argumentar contra o não. Termina sempre com a pergunta de referência: conhece aqui na zona alguém que precise disto?',
        registar: 'Não agora pede a data. É não abre o fecho com a oferta final.'
    },
    EMAIL2: {
        titulo: 'Email 2 — fecho do ciclo',
        objetivo: 'Texto simples, sem imagens. Deixa o registo de que o exemplo continua guardado e o valor válido.',
        naoFazer: 'Não prometer que não voltas a contactar. A porta fica aberta na frase seguinte.',
        registar: 'Envia e marca como enviado. Depois deste toque o lead sai do ciclo ativo.'
    },
    WA3: {
        titulo: 'WhatsApp 3 — depois da visita',
        objetivo: 'Agradecer, deixar a página que mostraste, e propor uma data concreta.',
        naoFazer: 'Não repetir o pitch todo. Já viu em pessoa.',
        registar: 'Envia e marca como enviado.'
    },
    R1: {
        titulo: 'Fecho com porta aberta',
        objetivo: 'Três movimentos, por esta ordem: a data em que voltas, a oferta final que fica com ele, e a pergunta de referência.',
        naoFazer: 'Não descontar para reabrir. O valor fica congelado — descontar ensina o cliente a que esperar compensa.',
        registar: 'Grava a data, a oferta final e se pediste referência.'
    },
    REVISITA: {
        titulo: 'Revisita — a data chegou',
        objetivo: 'Retomar exatamente onde ficou: o exemplo continua guardado e o valor é o mesmo.',
        naoFazer: 'Não começar do zero nem repetir o gancho como se fosse a primeira vez.',
        registar: 'Se responder, o lead volta à sequência. Se não, adormece mais seis meses.'
    },
    D1: {
        titulo: 'Descoberta — só existe o telefone do negócio',
        objetivo: 'Obter o canal direto: apelido do dono, melhor hora, e se tem WhatsApp. Não é marcar nada.',
        naoFazer: 'Nunca fazer o pitch a quem não decide, e nunca disfarçar o motivo. Antes de ligar, faz os 3 minutos: o número é 9x ou 2x, tem WhatsApp, e procura o apelido nas respostas do Maps, nas avaliações e na bio do Instagram.',
        registar: 'Grava o nome de quem atendeu, a hora indicada e o canal direto. Máximo 2 chamadas por semana ao número da loja.'
    },
    DEMO: {
        titulo: 'Construir os dois artefactos',
        objetivo: 'A aparência no Google e a página com a história. Sem os dois, não há nada para enviar.',
        naoFazer: 'Não enviar nada antes de a demo estar publicada e revista.',
        registar: 'Publica a demo nas vendas; o processo avança sozinho.'
    },
    ACOMPANHAR: {
        titulo: 'Proposta apresentada',
        objetivo: 'Acompanhar até fechar. O preço já está na mesa.',
        naoFazer: 'Não baixar o valor para acelerar.',
        registar: 'Fecha o negócio nas propostas, ou encerra aqui com data.'
    }
};

function nowIso() {
    return new Date().toISOString();
}

function cleanStr(value, max = 400) {
    return String(value == null ? '' : value).trim().slice(0, max);
}

function parseJsonSafe(raw, fallback) {
    try {
        const parsed = JSON.parse(raw || '');
        return parsed && typeof parsed === 'object' ? parsed : fallback;
    } catch (_) {
        return fallback;
    }
}

function emptyProcesso() {
    return {
        tipoNumero: '',
        temWhatsapp: false,
        apelidoConfirmado: false,
        nomeAtendedor: '',
        melhorHora: '',
        canalPreferido: '',
        canalDireto: false,
        sinal: false,
        sinalOrigem: '',
        emailPrecosLigado: false,
        objecao: '',
        ofertaFinal: '',
        ofertaFinalEnviada: false,
        referenciaPedida: '',
        precoCongelado: 0,
        revisitas: 0
    };
}

function parseProcesso(raw) {
    const parsed = typeof raw === 'string' ? parseJsonSafe(raw, {}) : (raw || {});
    const base = emptyProcesso();
    return {
        ...base,
        ...parsed,
        tipoNumero: cleanStr(parsed.tipoNumero, 10),
        temWhatsapp: parsed.temWhatsapp === true,
        apelidoConfirmado: parsed.apelidoConfirmado === true,
        nomeAtendedor: cleanStr(parsed.nomeAtendedor, 80),
        melhorHora: cleanStr(parsed.melhorHora, 40),
        canalPreferido: cleanStr(parsed.canalPreferido, 20),
        canalDireto: parsed.canalDireto === true,
        sinal: parsed.sinal === true,
        sinalOrigem: cleanStr(parsed.sinalOrigem, 40),
        emailPrecosLigado: parsed.emailPrecosLigado === true,
        objecao: cleanStr(parsed.objecao, 60),
        ofertaFinal: cleanStr(parsed.ofertaFinal, 600),
        ofertaFinalEnviada: parsed.ofertaFinalEnviada === true,
        referenciaPedida: cleanStr(parsed.referenciaPedida, 120),
        precoCongelado: Math.max(0, Math.round(Number(parsed.precoCongelado) || 0)),
        revisitas: Math.max(0, Math.round(Number(parsed.revisitas) || 0))
    };
}

function normalizeEstado(value) {
    const v = cleanStr(value, 20).toUpperCase();
    return PROCESSO_ESTADOS.includes(v) ? v : '';
}

/* ------------------------------------------------------------------ contactos */

function digitsOf(value) {
    return String(value || '').replace(/\D/g, '');
}

/** 9x is a mobile — probably the owner and probably on WhatsApp. 2x is a landline. */
function tipoNumeroFor(raw) {
    const d = digitsOf(raw);
    const national = d.startsWith('351') ? d.slice(3) : d;
    if (national.length !== 9) return '';
    if (national.startsWith('9')) return '9x';
    if (national.startsWith('2')) return '2x';
    return '';
}

function contactoFromDados(dados = {}) {
    const email = cleanStr(dados.email || dados.mail, 160);
    const whatsapp = cleanStr(dados.whatsapp, 40);
    const telefone = cleanStr(dados.telefone, 40);
    const tipo = tipoNumeroFor(whatsapp) || tipoNumeroFor(telefone);
    return {
        email,
        whatsapp,
        telefone,
        tipoNumero: tipo,
        temTelemovel: tipo === '9x',
        responsavel: cleanStr(dados.responsavel, 120)
    };
}

function temCanalDireto(processo, contacto) {
    if (processo && processo.canalDireto === true) return true;
    if (contacto && contacto.email) return true;
    if (contacto && contacto.temTelemovel) return true;
    return false;
}

/* ---------------------------------------------------------------------- sinal */

/**
 * sinal = respondeu || chamadaAtendida || visitouDemo.
 * No open pixel in the email: cold mail stays light and untracked, and the demo
 * is hosted by us, so the page hit is the clean source.
 */
function computeSinal({ followup = {}, toques = [], visitasDemo = 0 } = {}) {
    if (followup.replied1At || followup.replied2At) {
        return { sinal: true, origem: 'respondeu' };
    }
    if (toques.some((t) => t.resultado === 'respondeu')) {
        return { sinal: true, origem: 'respondeu' };
    }
    const atendida = toques.some((t) => (
        t.canal === 'ligacao' && RESULTADOS_CHAMADA_ATENDIDA.includes(t.resultado)
    ));
    if (atendida) return { sinal: true, origem: 'chamada_atendida' };
    if (Number(visitasDemo) > 0) return { sinal: true, origem: 'visitou_demo' };
    return { sinal: false, origem: '' };
}

/** Link previews have no browser User-Agent — they must not count as a visit. */
function looksLikeBrowser(userAgent) {
    const ua = String(userAgent || '').trim();
    if (!ua) return false;
    if (/bot|crawler|spider|preview|facebookexternalhit|whatsapp|slurp|curl|wget|python-requests|okhttp|headless/i.test(ua)) {
        return false;
    }
    return /mozilla|applewebkit|chrome|safari|firefox|edge|opera/i.test(ua);
}

/* --------------------------------------------------------------------- estado */

function sequenciaComecou(toques) {
    return toques.some((t) => (
        ['EMAIL1', 'WA1', 'LIG1', 'WA2', 'N1', 'LIG2', 'EMAIL2'].includes(t.passo)
        && t.estado !== 'agendado'
    ));
}

function computeEstado({ row = {}, followup = {}, toques = [], processo = {}, contacto = {} } = {}) {
    if (followup.unsubscribed === true) return 'REMOVIDO';
    if (String(row.estado || '') === 'fechado' || String(row.resultado || '') === 'digitalizado') {
        return 'GANHO';
    }
    const stored = normalizeEstado(row.processo_estado);
    if (stored === 'REMOVIDO') return 'REMOVIDO';
    if (ESTADOS_MANUAIS.has(stored)) return stored;

    if (followup.replied1At || followup.replied2At || toques.some((t) => t.resultado === 'respondeu')) {
        return 'RESPONDEU';
    }
    if (sequenciaComecou(toques)) return 'EM_SEQUENCIA';
    if (!row.demo_slug) return 'NOVO';
    return temCanalDireto(processo, contacto) ? 'DEMO_PRONTO' : 'DESCOBERTA';
}

/* ---------------------------------------------------------------- motor tempo */

const lisbonParts = (date) => {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Lisbon',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        weekday: 'short',
        hour12: false
    }).formatToParts(date);
    const get = (type) => {
        const hit = parts.find((p) => p.type === type);
        return hit ? hit.value : '';
    };
    const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return {
        y: Number(get('year')),
        m: Number(get('month')),
        d: Number(get('day')),
        hour: Number(get('hour')),
        minute: Number(get('minute')),
        weekday: weekdayMap[get('weekday')]
    };
};

function isoAtLisbon(y, m, d, hour, minute) {
    let utc = Date.UTC(y, m - 1, d, hour, minute, 0);
    for (let i = 0; i < 12; i++) {
        const p = lisbonParts(new Date(utc));
        const got = Date.UTC(p.y, p.m - 1, p.d, p.hour, p.minute);
        const want = Date.UTC(y, m - 1, d, hour, minute);
        const delta = want - got;
        if (delta === 0) break;
        utc += delta;
    }
    return new Date(utc).toISOString();
}

const ALMOCO_INICIO = 12 * 60;
const ALMOCO_FIM = 14 * 60 + 30;
const SEXTA_TARDE = 13 * 60;

/**
 * Global exclusions win over any category window: Mondays, Friday afternoon,
 * lunch, weekends and August are cut after the window is applied, never before.
 * Without this order a 15h00–18h00 retail window would start catching Fridays.
 */
function slotIsAllowed(date, janelas = null) {
    const p = lisbonParts(date);
    const minutes = p.hour * 60 + p.minute;
    if (janelas && Array.isArray(janelas.horas) && janelas.horas.length) {
        const dentro = janelas.horas.some(([ini, fim]) => minutes >= ini && minutes < fim);
        if (!dentro) return false;
    }
    if (janelas && janelas.semSabado === true && p.weekday === 6) return false;
    if (p.weekday === 0 || p.weekday === 6) return false;
    if (p.weekday === 1) return false;
    if (p.weekday === 5 && minutes >= SEXTA_TARDE) return false;
    if (minutes >= ALMOCO_INICIO && minutes < ALMOCO_FIM) return false;
    if (p.m === 8) return false;
    return true;
}

const PASSO_MINUTOS = 30;
const LIMITE_BUSCA = (60 / PASSO_MINUTOS) * 24 * 400;

/** Next valid instant, `horas` after `fromIso`, optionally anchored to a time of day. */
function proximaAcaoEm(fromIso, horas = 0, { ancora = null, janelas = null } = {}) {
    const base = new Date(fromIso || Date.now()).getTime();
    const alvo = base + Math.round(Number(horas) || 0) * 3600000;
    let cursor = new Date(alvo);
    if (ancora) {
        const p = lisbonParts(cursor);
        let candidato = new Date(isoAtLisbon(p.y, p.m, p.d, ancora.hour, ancora.minute));
        if (candidato.getTime() < alvo) {
            candidato = new Date(isoAtLisbon(p.y, p.m, p.d + 1, ancora.hour, ancora.minute));
        }
        cursor = candidato;
    } else {
        const p = lisbonParts(cursor);
        const round = p.minute % PASSO_MINUTOS;
        if (round) {
            cursor = new Date(isoAtLisbon(p.y, p.m, p.d, p.hour, p.minute - round + PASSO_MINUTOS));
        }
    }
    for (let i = 0; i < LIMITE_BUSCA; i++) {
        if (slotIsAllowed(cursor, janelas)) return cursor.toISOString();
        if (ancora) {
            const p = lisbonParts(cursor);
            cursor = new Date(isoAtLisbon(p.y, p.m, p.d + 1, ancora.hour, ancora.minute));
        } else {
            cursor = new Date(cursor.getTime() + PASSO_MINUTOS * 60000);
        }
    }
    return cursor.toISOString();
}

/** 4–6h, stable per lead, so email and WhatsApp never land in the same minute. */
function ponteHoras(leadId) {
    const hash = crypto.createHash('sha1').update(String(leadId || '')).digest()[0];
    const span = (PONTE_HORAS_MAX - PONTE_HORAS_MIN) * 60;
    const minutos = PONTE_HORAS_MIN * 60 + (hash % (span + 1));
    return minutos / 60;
}

/* -------------------------------------------------------------- contadores */

function toquesDoPasso(toques, passo) {
    return toques.filter((t) => t.passo === passo && t.estado === 'feito');
}

function tentativasDoPasso(toques, passo) {
    return toques.filter((t) => (
        t.passo === passo && t.canal === 'ligacao' && ['feito', 'falhado'].includes(t.estado)
    )).length;
}

/**
 * Separate counter from `tentativasDoPasso`: this one is per lead and per week,
 * and only counts calls placed to the shop's own number. `destino` is stored on
 * the touch so the count never depends on the lead's current state.
 */
function chamadasNegocioNaSemana(toques, nowIsoValue = nowIso()) {
    const limite = new Date(nowIsoValue).getTime() - 7 * 24 * 3600000;
    return toques.filter((t) => {
        if (t.canal !== 'ligacao' || t.destino !== 'negocio') return false;
        if (!['feito', 'falhado'].includes(t.estado)) return false;
        const when = new Date(t.executado_em || t.criado_em || 0).getTime();
        return Number.isFinite(when) && when >= limite;
    }).length;
}

/* --------------------------------------------------------------- próxima ação */

function planoPara(passo) {
    return PLANO_TOQUES.find((t) => t.passo === passo || t.semSinal === passo) || null;
}

function ancoraDaSequencia(toques) {
    const primeiro = toques
        .filter((t) => ['EMAIL1', 'WA1'].includes(t.passo) && t.estado !== 'agendado')
        .sort((a, b) => String(a.executado_em || a.criado_em).localeCompare(String(b.executado_em || b.criado_em)))[0];
    return primeiro ? (primeiro.executado_em || primeiro.criado_em) : '';
}

/**
 * A step is closed when it happened, when it was skipped, or — for calls — when
 * the two attempts allowed on that step are used up. Two unanswered calls close
 * the step; insisting past that is how a seller gets marked as a nuisance.
 */
function passoFeito(toques, passo) {
    if (toques.some((t) => t.passo === passo && ['feito', 'saltado'].includes(t.estado))) return true;
    if (PASSO_CANAL[passo] !== 'ligacao') return false;
    return tentativasDoPasso(toques, passo) >= LIMITE_TENTATIVAS_PASSO;
}

/**
 * One pending action per lead. `saltar` means the touch cannot happen and must be
 * recorded as `saltado` so the queue moves on — a block would leave the lead
 * waiting forever for an action it can never perform.
 */
function nextTouch({
    estado,
    toques = [],
    processo = {},
    contacto = {},
    followup = {},
    leadId = '',
    revisitarEm = '',
    agora = nowIso()
} = {}) {
    if (['REMOVIDO', 'GANHO', 'ARQUIVADO'].includes(estado)) return null;

    if (estado === 'NOVO') {
        return { passo: 'DEMO', canal: '', intervaloHoras: 0, agendadoPara: '', saltar: false };
    }
    if (estado === 'PROPOSTA') {
        return { passo: 'ACOMPANHAR', canal: '', intervaloHoras: 0, agendadoPara: '', saltar: false };
    }
    if (estado === 'DESCOBERTA') {
        return { passo: 'D1', canal: 'ligacao', intervaloHoras: 0, agendadoPara: proximaAcaoEm(agora, 0), saltar: false };
    }
    if (estado === 'VISITA') {
        if (passoFeito(toques, 'WA3')) return null;
        const visita = toques
            .filter((t) => t.passo === 'VISITA' && t.estado === 'feito')
            .sort((a, b) => String(b.executado_em).localeCompare(String(a.executado_em)))[0];
        const desde = visita ? (visita.executado_em || visita.criado_em) : agora;
        return { passo: 'WA3', canal: 'whatsapp', intervaloHoras: 2, agendadoPara: proximaAcaoEm(desde, 2), saltar: false };
    }
    if (estado === 'RECUSADO') {
        if (passoFeito(toques, 'R1')) return null;
        return { passo: 'R1', canal: 'whatsapp', intervaloHoras: 0, agendadoPara: proximaAcaoEm(agora, 0), saltar: false };
    }
    if (estado === 'ADORMECIDO') {
        if (!revisitarEm) return null;
        return {
            passo: 'REVISITA',
            canal: 'whatsapp',
            intervaloHoras: 0,
            agendadoPara: proximaAcaoEm(revisitarEm, 0),
            saltar: false
        };
    }
    if (estado === 'REVISITA') {
        if (passoFeito(toques, 'REVISITA')) return null;
        return { passo: 'REVISITA', canal: 'whatsapp', intervaloHoras: 0, agendadoPara: proximaAcaoEm(agora, 0), saltar: false };
    }
    if (estado === 'RESPONDEU') {
        if (passoFeito(toques, 'WA2')) return null;
        return { passo: 'WA2', canal: 'whatsapp', intervaloHoras: 0, agendadoPara: proximaAcaoEm(agora, 0), saltar: false };
    }

    // DEMO_PRONTO and EM_SEQUENCIA walk the six-touch plan.
    const ancora = ancoraDaSequencia(toques) || agora;
    const sinal = processo.sinal === true;
    for (const toque of PLANO_TOQUES) {
        const passo = (toque.semSinal && !sinal) ? toque.semSinal : toque.passo;
        if (passoFeito(toques, passo)) continue;
        // WA2 and N1 are the same touch: either one closes it.
        const alternativa = toque.semSinal ? (passo === toque.passo ? toque.semSinal : toque.passo) : '';
        if (alternativa && passoFeito(toques, alternativa)) continue;

        if (passo === 'EMAIL1' && !contacto.email) {
            return {
                passo,
                canal: 'email',
                intervaloHoras: 0,
                agendadoPara: '',
                saltar: true,
                motivo: 'sem_email'
            };
        }
        if (toque.exigeSinal && !sinal) {
            return {
                passo,
                canal: toque.canal,
                intervaloHoras: toque.intervaloHoras,
                agendadoPara: '',
                saltar: true,
                motivo: 'sem_sinal'
            };
        }
        const horas = toque.pontePara === 'EMAIL1' && passoFeito(toques, 'EMAIL1')
            ? ponteHoras(leadId)
            : toque.intervaloHoras;
        const desde = toque.ordem === 1 ? agora : ancora;
        return {
            passo,
            canal: toque.canal,
            intervaloHoras: horas,
            agendadoPara: proximaAcaoEm(desde, horas, { ancora: toque.ancora || null }),
            saltar: false
        };
    }
    return null;
}

/* ------------------------------------------------------------------ bloqueios */

function bloqueios({ estado, processo = {}, toques = [], passo = '', revisitarEm = '', agora = nowIso() } = {}) {
    const lista = [];
    if (estado === 'REMOVIDO') {
        lista.push({
            id: 'removido',
            motivo: 'O cliente pediu REMOVER. Todos os canais estão fechados — email, WhatsApp e telefone.'
        });
        return lista;
    }
    const canal = PASSO_CANAL[passo] || '';
    if (canal === 'ligacao') {
        if (processo.apelidoConfirmado !== true) {
            lista.push({
                id: 'apelido',
                motivo: 'Falta confirmar o apelido do dono. Faz os 3 minutos antes de ligar — esta chamada não se repete.'
            });
        }
        if (tentativasDoPasso(toques, passo) >= LIMITE_TENTATIVAS_PASSO) {
            lista.push({
                id: 'tentativas_passo',
                motivo: `Já foram ${LIMITE_TENTATIVAS_PASSO} tentativas neste passo. Muda de passo ou de dia.`
            });
        }
        if (chamadasNegocioNaSemana(toques, agora) >= LIMITE_CHAMADAS_NEGOCIO_SEMANA) {
            lista.push({
                id: 'chamadas_semana',
                motivo: `Já foram ${LIMITE_CHAMADAS_NEGOCIO_SEMANA} chamadas ao número da loja esta semana. O telefone a tocar é um custo para eles.`
            });
        }
    }
    if (estado === 'RECUSADO' && !revisitarEm) {
        lista.push({
            id: 'sem_revisita',
            motivo: 'Um não sem data fecha a porta. Grava a data da revisita antes de encerrar.'
        });
    }
    if (passo === 'R1' && processo.ofertaFinalEnviada === true) {
        lista.push({
            id: 'oferta_repetida',
            motivo: 'A oferta final já saiu. Oferta repetida deixa de ser oferta.'
        });
    }
    return lista;
}

/* ---------------------------------------------------------------- persistência */

function listToques(db, leadId) {
    return db.prepare(`
        SELECT id, ordem, passo, canal, estado, agendado_para, executado_em,
               resultado, destino, objecao, nota, texto, lang, criado_em
        FROM lead_toque WHERE lead_id = ? ORDER BY criado_em ASC
    `).all(leadId);
}

function countDemoVisitas(db, leadId) {
    const row = db.prepare('SELECT COUNT(*) AS n FROM demo_visita WHERE lead_id = ?').get(leadId);
    return row ? Number(row.n) || 0 : 0;
}

function loadContext(db, leadId) {
    const row = db.prepare(`
        SELECT id, business_type, nome, telefone, whatsapp, cidade, estado, resultado, cobertura,
               demo_slug, followup_json, processo_json, processo_estado, proxima_acao_em, revisitar_em
        FROM lead WHERE id = ?
    `).get(leadId);
    if (!row) return null;
    const dadosRow = db.prepare(
        'SELECT obrigatorios_json, opcionais_json FROM dados_negocio WHERE lead_id = ? ORDER BY criado_em DESC LIMIT 1'
    ).get(leadId);
    const dados = {
        ...parseJsonSafe(dadosRow && dadosRow.obrigatorios_json, {}),
        ...parseJsonSafe(dadosRow && dadosRow.opcionais_json, {})
    };
    const legal = db.prepare('SELECT email FROM cliente_legal WHERE lead_id = ? LIMIT 1').get(leadId);
    if (!dados.email && legal && legal.email) dados.email = legal.email;
    if (!dados.telefone && row.telefone) dados.telefone = row.telefone;
    if (!dados.whatsapp && row.whatsapp) dados.whatsapp = row.whatsapp;
    return {
        row,
        dados,
        followup: outreach.parseFollowup(row.followup_json),
        processo: parseProcesso(row.processo_json),
        toques: listToques(db, leadId),
        visitasDemo: countDemoVisitas(db, leadId)
    };
}

function resultadoFromEstado(estado, atual) {
    if (String(atual || '') === 'digitalizado') return 'digitalizado';
    if (estado === 'GANHO') return 'digitalizado';
    if (estado === 'REMOVIDO' || estado === 'RECUSADO') return 'sem_interesse';
    if (estado === 'ADORMECIDO' || estado === 'REVISITA') return 'futuro';
    return String(atual || '');
}

/**
 * Recomputes signal, state and the next action, and writes them back. Every path
 * that changes a lead goes through here so the queue can never drift.
 */
function recomputeProcesso(db, leadId, { patchProcesso = null, forcarEstado = '', revisitarEm = null, agora = nowIso() } = {}) {
    const ctx = loadContext(db, leadId);
    if (!ctx) return null;

    const contacto = contactoFromDados(ctx.dados);
    let processo = patchProcesso ? parseProcesso({ ...ctx.processo, ...patchProcesso }) : ctx.processo;
    const sinal = computeSinal({
        followup: ctx.followup,
        toques: ctx.toques,
        visitasDemo: ctx.visitasDemo
    });
    processo.sinal = sinal.sinal;
    processo.sinalOrigem = sinal.origem;
    if (!processo.tipoNumero && contacto.tipoNumero) processo.tipoNumero = contacto.tipoNumero;
    if (!processo.canalDireto && temCanalDireto(processo, contacto)) processo.canalDireto = true;

    const estadoForcado = normalizeEstado(forcarEstado);
    const rowParaEstado = estadoForcado
        ? { ...ctx.row, processo_estado: estadoForcado }
        : ctx.row;
    const estado = computeEstado({
        row: rowParaEstado,
        followup: ctx.followup,
        toques: ctx.toques,
        processo,
        contacto
    });

    const proximaRevisita = revisitarEm != null ? cleanStr(revisitarEm, 40) : cleanStr(ctx.row.revisitar_em, 40);
    const proxima = nextTouch({
        estado,
        toques: ctx.toques,
        processo,
        contacto,
        followup: ctx.followup,
        leadId,
        revisitarEm: proximaRevisita,
        agora
    });

    const resultado = resultadoFromEstado(estado, ctx.row.resultado);
    db.prepare(`
        UPDATE lead SET processo_estado = ?, processo_json = ?, proxima_acao_em = ?,
            revisitar_em = ?, resultado = ? WHERE id = ?
    `).run(
        estado,
        JSON.stringify(processo),
        proxima && !proxima.saltar ? (proxima.agendadoPara || '') : '',
        proximaRevisita,
        resultado,
        leadId
    );

    return { estado, processo, proxima, contacto, toques: ctx.toques, followup: ctx.followup, row: ctx.row };
}

function registarToque(db, leadId, patch = {}) {
    const agora = patch.executadoEm || nowIso();
    const passo = cleanStr(patch.passo, 20).toUpperCase();
    const canal = CANAIS.includes(patch.canal) ? patch.canal : (PASSO_CANAL[passo] || '');
    const estado = TOQUE_ESTADOS.includes(patch.estado) ? patch.estado : 'feito';
    const ordem = db.prepare('SELECT COUNT(*) AS n FROM lead_toque WHERE lead_id = ?').get(leadId);
    db.prepare(`
        INSERT INTO lead_toque (id, lead_id, ordem, passo, canal, estado, agendado_para,
            executado_em, resultado, destino, objecao, nota, texto, lang, criado_em)
        VALUES (@id, @lead_id, @ordem, @passo, @canal, @estado, @agendado_para,
            @executado_em, @resultado, @destino, @objecao, @nota, @texto, @lang, @criado_em)
    `).run({
        id: crypto.randomUUID(),
        lead_id: leadId,
        ordem: (ordem ? Number(ordem.n) || 0 : 0) + 1,
        passo,
        canal,
        estado,
        agendado_para: cleanStr(patch.agendadoPara, 40),
        executado_em: estado === 'agendado' ? '' : agora,
        resultado: cleanStr(patch.resultado, 40),
        destino: cleanStr(patch.destino, 20),
        objecao: cleanStr(patch.objecao, 60),
        nota: cleanStr(patch.nota, 2000),
        texto: cleanStr(patch.texto, 8000),
        lang: outreach.normalizeOutreachLang(patch.lang),
        criado_em: agora
    });
    return recomputeProcesso(db, leadId, {
        patchProcesso: patch.processo || null,
        forcarEstado: patch.estado === 'agendado' ? '' : cleanStr(patch.proximoEstado, 20),
        revisitarEm: patch.revisitarEm != null ? patch.revisitarEm : null,
        agora
    });
}

/** Records a demo page hit. Deduplicated by hour so a refresh is not a new signal. */
function registarVisitaDemo(db, { leadId, slug = '', referer = '', userAgent = '' } = {}) {
    if (!leadId || !looksLikeBrowser(userAgent)) return false;
    const agora = nowIso();
    const limite = new Date(new Date(agora).getTime() - 3600000).toISOString();
    const recente = db.prepare(
        'SELECT id FROM demo_visita WHERE lead_id = ? AND criado_em >= ? LIMIT 1'
    ).get(leadId, limite);
    if (recente) return false;
    db.prepare(`
        INSERT INTO demo_visita (id, lead_id, slug, referer, criado_em)
        VALUES (?, ?, ?, ?, ?)
    `).run(crypto.randomUUID(), leadId, cleanStr(slug, 120), cleanStr(referer, 300), agora);
    return true;
}

function instrucoesFor(passo) {
    const key = cleanStr(passo, 20).toUpperCase();
    return INSTRUCOES[key] || null;
}

function resultadosFor(passo) {
    const key = cleanStr(passo, 20).toUpperCase();
    return RESULTADOS_POR_PASSO[key] || [];
}

/** The WA1 bridge line only exists when EMAIL 1 actually went out. */
function pontEmailFor(toques = [], lang = 'pt') {
    const enviado = toques
        .filter((t) => t.passo === 'EMAIL1' && t.estado === 'feito')
        .sort((a, b) => String(b.executado_em).localeCompare(String(a.executado_em)))[0];
    if (!enviado) return { pontEmail: '', pontEmailFrase: '', quandoEmail: '' };
    const en = outreach.normalizeOutreachLang(lang) === 'en';
    const quando = lisbonParts(new Date(enviado.executado_em || enviado.criado_em));
    const hoje = lisbonParts(new Date());
    const mesmoDia = quando.y === hoje.y && quando.m === hoje.m && quando.d === hoje.d;
    let quandoEmail;
    if (!mesmoDia) quandoEmail = en ? 'the other day' : 'há dias';
    else if (quando.hour < 13) quandoEmail = en ? 'this morning' : 'hoje de manhã';
    else quandoEmail = en ? 'today' : 'hoje';
    const pontEmail = en
        ? `I sent you an email ${quandoEmail}; sending it here too as it is easier to see.`
        : `Mandei-lhe um email ${quandoEmail}, mando por aqui que é mais fácil de ver.`;
    return { pontEmail, pontEmailFrase: ` ${pontEmail}`, quandoEmail };
}

module.exports = {
    PROCESSO_ESTADOS,
    ESTADO_LABELS,
    ESTADOS_MANUAIS,
    PLANO_TOQUES,
    PASSO_CANAL,
    CANAIS,
    TOQUE_ESTADOS,
    LIMITE_TENTATIVAS_PASSO,
    LIMITE_CHAMADAS_NEGOCIO_SEMANA,
    PONTE_HORAS_MIN,
    PONTE_HORAS_MAX,
    emptyProcesso,
    parseProcesso,
    normalizeEstado,
    tipoNumeroFor,
    contactoFromDados,
    temCanalDireto,
    computeSinal,
    looksLikeBrowser,
    computeEstado,
    sequenciaComecou,
    slotIsAllowed,
    proximaAcaoEm,
    ponteHoras,
    tentativasDoPasso,
    toquesDoPasso,
    chamadasNegocioNaSemana,
    planoPara,
    nextTouch,
    bloqueios,
    listToques,
    countDemoVisitas,
    loadContext,
    resultadoFromEstado,
    recomputeProcesso,
    registarToque,
    registarVisitaDemo,
    instrucoesFor,
    resultadosFor,
    pontEmailFor,
    lisbonParts,
    isoAtLisbon
};
