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
            title: 'Conta Google do negócio',
            detail: 'Gmail do negócio no telemóvel do dono (+ 2FA). A conta tem de ser dele — nunca a sua.'
        },
        {
            id: 'criar_reivindicar',
            title: 'Criar ou reivindicar o perfil',
            detail: 'Perfil novo, sem dono, ou pedir acesso a outro dono. App Google Business / Maps.'
        },
        {
            id: 'dados_base',
            title: 'Dados base',
            detail: 'Nome, categoria, morada, pin, telefone, horário, descrição.'
        },
        {
            id: 'visuais',
            title: 'Visuais',
            detail: 'Logo, capa, fachada, interior. Captar no local se fizer sentido.'
        },
        {
            id: 'validacao',
            title: 'Pedir validação',
            detail: 'Vídeo (preferido), cartão ou chamada. Prazo do Google — tipicamente alguns dias úteis.'
        },
        {
            id: 'pin',
            title: 'Confirmar pin no Maps',
            detail: 'Verificar que o ponto no mapa está na montra certa.'
        }
    ];
    if (perfil100) {
        steps.splice(4, 0, {
            id: 'perfil_100',
            title: 'Perfil 100%',
            detail: 'Serviços, produtos, atributos, WhatsApp, redes e links.'
        });
    }
    return steps;
}

function contaGoogleScript() {
    return [
        '1. No telemóvel do dono, abrir Definições → Google → a conta dele (ou criar Gmail do negócio).',
        '2. Activar verificação em dois passos.',
        '3. Abrir a app Google Business Profile (ou Maps → “Gerir o seu Perfil”).',
        '4. Não use a sua conta YourLab como PRIMARY_OWNER — o dono fica sempre o cliente.'
    ].join('\n');
}

function guiaoVideo(dados) {
    const nome = dados.nome || 'o negócio';
    const onde = [dados.morada, dados.cidade].filter(Boolean).join(', ') || 'a morada do estabelecimento';
    return [
        `Guião de vídeo para validar “${nome}” no Google`,
        '',
        'Grave UMA única gravação contínua (sem cortes), em português ou só com imagem clara:',
        '',
        `1. Comece fora, na fachada / sinalética de ${nome} em ${onde}. Mostre o nome legível.`,
        '2. Entre pela porta principal e percorra o interior (balcão, zona de clientes, produtos ou serviços).',
        '3. Mostre uma acção de gestão: abrir o horário na parede, atender um cliente, ou o telemóvel com a app Business.',
        '4. Termine de novo na fachada.',
        '',
        'Duração típica: 1–2 minutos. Luz natural ajuda. Não edite o vídeo.',
        'A revisão é feita por um humano do lado da Google (pode demorar vários dias).'
    ].join('\n');
}

function mensagemClienteVerificado(dados) {
    const nome = dados.nome || 'o seu negócio';
    return [
        `Olá! Boas notícias: a presença de ${nome} no Google Maps / Perfil da Empresa já foi aceite.`,
        'Os clientes passam a ver os dados correctos (morada, telefone, horário).',
        'Se quiser, no próximo contacto mostramos como pedir avaliações reais.',
        '',
        '— YourLab / Digitalize Portugal'
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
