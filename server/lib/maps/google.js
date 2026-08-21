/**
 * Google Business Profile adapter — v1 guided_manual.
 * Later: flip capability to 'api' without changing callers.
 */

const { normalizeEstado } = require('./states');
const { includesPerfilCompleto } = require('./packages');

const provider = {
    id: 'google',
    nome: 'Google Business Profile / Maps',
    capability: 'guided_manual',
    capabilityLabel: 'Guiado no telemóvel do cliente (conta dele)'
};

function str(v) {
    return String(v == null ? '' : v).trim();
}

function buildDadosNegocio(ctx = {}) {
    const dados = ctx.dados || {};
    const presence = ctx.googlePresence || {};
    const lead = ctx.lead || {};
    return {
        nome: str(dados.nome_negocio || lead.nome),
        morada: str(dados.morada || lead.morada),
        cidade: str(dados.cidade || lead.cidade),
        telefone: str(dados.telefone || lead.telefone),
        whatsapp: str(dados.whatsapp || lead.whatsapp || dados.telefone),
        horario: str(dados.horario),
        website: str(presence.website || dados.website),
        categoria: str(presence.categoria),
        descricao: str(presence.descricao || dados.descricao || dados.diferencial),
        fotos: str(presence.fotos),
        mapsEstado: str(presence.mapsEstado),
        atributos: Array.isArray(presence.atributos) ? presence.atributos : [],
        instagram: str(presence.instagram || dados.instagram),
        facebook: str(presence.facebook || dados.facebook),
        businessTypeId: str((ctx.businessType && ctx.businessType.id) || lead.business_type),
        businessTypeName: str((ctx.businessType && ctx.businessType.nome) || '')
    };
}

function validar(dadosInput, ctx = {}) {
    const d = dadosInput && dadosInput.nome != null
        ? dadosInput
        : buildDadosNegocio({ ...ctx, dados: dadosInput || ctx.dados });
    const missing = [];
    if (!d.nome) missing.push({ id: 'nome', label: 'Nome do negócio' });
    if (!d.morada) missing.push({ id: 'morada', label: 'Morada' });
    if (!d.cidade) missing.push({ id: 'cidade', label: 'Cidade' });
    if (!d.telefone) missing.push({ id: 'telefone', label: 'Telefone' });
    if (!d.horario) missing.push({ id: 'horario', label: 'Horário' });
    if (!d.categoria) missing.push({ id: 'categoria', label: 'Categoria Google' });
    return missing;
}

function deliverySteps(ctx = {}) {
    const proposta = ctx.proposta || {};
    const perfil100 = includesPerfilCompleto(proposta);
    const steps = [
        {
            id: 'conta',
            title: 'Conta Google do dono',
            detail: 'No telemóvel dele. Gmail do negócio + verificação em dois passos. Nunca a sua conta.'
        },
        {
            id: 'criar_reivindicar',
            title: 'Abrir o perfil',
            detail: 'App Google Business, ou Maps → Gerir o seu Perfil. Criar, reivindicar, ou pedir acesso.'
        },
        {
            id: 'dados_base',
            title: 'Preencher a ficha',
            detail: 'Nome, categoria, morada, pin no mapa, telefone, horário e uma descrição curta.'
        },
        {
            id: 'visuais',
            title: 'Fotos',
            detail: 'Logótipo, fachada, interior. Tire no sítio se ainda não existirem.'
        },
        {
            id: 'validacao',
            title: 'Pedir verificação à Google',
            detail: 'Vídeo (melhor), carta ou chamada. A Google decide; costuma demorar alguns dias.'
        },
        {
            id: 'pin',
            title: 'Confirmar o sítio no Maps',
            detail: 'O pin tem de cair na montra certa, não no prédio ao lado.'
        }
    ];
    if (perfil100) {
        steps.splice(4, 0, {
            id: 'perfil_100',
            title: 'Completar o perfil',
            detail: 'Serviços, produtos, WhatsApp e redes, se o pacote incluir o perfil completo.'
        });
    }
    return steps;
}

function contaGoogleScript() {
    return [
        '1. No telemóvel do dono: Definições → Google → a conta dele (ou crie um Gmail só do negócio).',
        '2. Ligue a verificação em dois passos.',
        '3. Abra a app Google Business Profile. Se não tiver: no Maps, toque em Gerir o seu Perfil.',
        '4. Quem fica dono da ficha é sempre o cliente. Não use a sua conta YourLab.'
    ].join('\n');
}

function guiaoVideo(dados) {
    const nome = dados.nome || 'o negócio';
    const onde = [dados.morada, dados.cidade].filter(Boolean).join(', ') || 'a morada do estabelecimento';
    return [
        `Vídeo para a Google aceitar «${nome}»`,
        '',
        'Uma gravação só, sem cortes, 1 a 2 minutos:',
        '',
        `1. Comece fora, na fachada de ${nome} em ${onde}. O nome tem de se ler.`,
        '2. Entre pela porta e mostre o interior (balcão, clientes, produtos).',
        '3. Mostre que gere o sítio: horário na parede, atender alguém, ou a app aberta.',
        '4. Acabe outra vez na fachada.',
        '',
        'Luz natural ajuda. Não edite o vídeo. A Google pode demorar vários dias a responder.'
    ].join('\n');
}

function mensagemClienteVerificado(dados) {
    const nome = dados.nome || 'o seu negócio';
    return [
        `Olá! O ${nome} já aparece bem no Google Maps (morada, telefone e horário).`,
        'Se quiser, no próximo contacto mostramos como pedir avaliações.',
        '',
        '— YourLab'
    ].join('\n');
}

async function procurarExistente(dados) {
    // v1: no Places API — seller confirms manually in the cockpit.
    return [];
}

async function submeter(dadosInput, ctx = {}) {
    const dados = buildDadosNegocio({ ...ctx, dados: (dadosInput && dadosInput.nome != null) ? {
        nome_negocio: dadosInput.nome,
        morada: dadosInput.morada,
        cidade: dadosInput.cidade,
        telefone: dadosInput.telefone,
        whatsapp: dadosInput.whatsapp,
        horario: dadosInput.horario,
        website: dadosInput.website,
        descricao: dadosInput.descricao,
        instagram: dadosInput.instagram,
        facebook: dadosInput.facebook
    } : ctx.dados, googlePresence: {
        ...(ctx.googlePresence || {}),
        categoria: (dadosInput && dadosInput.categoria) || (ctx.googlePresence && ctx.googlePresence.categoria),
        fotos: (dadosInput && dadosInput.fotos) || (ctx.googlePresence && ctx.googlePresence.fotos),
        mapsEstado: (dadosInput && dadosInput.mapsEstado) || (ctx.googlePresence && ctx.googlePresence.mapsEstado),
        atributos: (dadosInput && dadosInput.atributos) || (ctx.googlePresence && ctx.googlePresence.atributos)
    } });

    const missing = validar(dados, ctx);
    if (missing.length) {
        return {
            ok: false,
            estado: 'em_falta_dados',
            missing,
            steps: deliverySteps(ctx),
            guiaoVideo: guiaoVideo(dados),
            contaScript: contaGoogleScript()
        };
    }

    const steps = deliverySteps(ctx);
    return {
        ok: true,
        estado: 'em_curso',
        capability: provider.capability,
        missing: [],
        steps,
        guiaoVideo: guiaoVideo(dados),
        contaScript: contaGoogleScript(),
        mensagemClienteRascunho: mensagemClienteVerificado(dados),
        nota: 'Entrega guiada: avance os passos com o cliente no telemóvel dele. Sem API Google nesta fase.'
    };
}

async function consultarEstado(ref, ctx = {}) {
    const estado = normalizeEstado(
        (ref && ref.estado) || (ctx.presenca && ctx.presenca.estado),
        'a_aguardar_verificacao'
    );
    return {
        estado,
        fonte: 'manual',
        nota: 'Sem VoiceOfMerchant nesta fase — confirme no Perfil Google e marque “Google aceitou”.'
    };
}

module.exports = {
    ...provider,
    buildDadosNegocio,
    validar,
    deliverySteps,
    guiaoVideo,
    contaGoogleScript,
    mensagemClienteVerificado,
    procurarExistente,
    submeter,
    consultarEstado
};
