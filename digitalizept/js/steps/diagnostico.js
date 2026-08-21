import { currentSubstep, renderAsk, askChoices } from '../substep.js';
import { mountGbpExample, GBP_SAMPLE } from '../demo/gbp-example.js';
import { suggestPackage } from '../deal/packages.js';
import { buildDiagPitchPrompt, plainAiText, renderOptionalAi } from '../optional-ai.js';

function ensureDiag(state) {
    if (!state.data.googleDiagnostico || typeof state.data.googleDiagnostico !== 'object') {
        state.data.googleDiagnostico = {
            exemploVisto: false,
            diferencaVista: false,
            maps: '',
            validado: '',
            website: '',
            prioridade: '',
            pacoteSugerido: ''
        };
    }
    const d = state.data.googleDiagnostico;
    if (typeof d.diferencaVista !== 'boolean') d.diferencaVista = false;
    return d;
}

function pagesFor() {
    return [
        { kind: 'exemplo' },
        { kind: 'diferenca' },
        { kind: 'maps' },
        { kind: 'validado' },
        { kind: 'website' },
        { kind: 'prioridade' }
    ];
}

function isSubstepValid(state) {
    const d = ensureDiag(state);
    const page = pagesFor()[currentSubstep(state)];
    if (!page) return false;
    if (page.kind === 'exemplo') return d.exemploVisto === true;
    if (page.kind === 'diferenca') return d.diferencaVista === true;
    if (page.kind === 'maps') return Boolean(d.maps);
    if (page.kind === 'validado') return Boolean(d.validado);
    if (page.kind === 'website') return Boolean(d.website);
    if (page.kind === 'prioridade') return Boolean(d.prioridade);
    return false;
}

function isValid(state) {
    const d = ensureDiag(state);
    return Boolean(
        d.exemploVisto
        && d.diferencaVista
        && d.maps
        && d.validado
        && d.website
        && d.prioridade
    );
}

function applySuggestion(state, diag) {
    diag.pacoteSugerido = suggestPackage(diag);
    // Pacote e preços ficam para depois das demonstrações (passo Serviços).
}

function mountDiferencaBlocks(control) {
    const wrap = document.createElement('div');
    wrap.className = 'diag-layers';

    const layers = [
        {
            title: 'Google Maps (o que o público vê)',
            body: 'É a ficha / pin no Maps e no Search. Pode surgir porque alguém indicou que o sítio existe, ou porque o dono reivindicou. Na Google isto é grátis; pode demorar dias até aparecer ou actualizar.'
        },
        {
            title: 'Perfil da Empresa (business.google)',
            body: 'É o painel do dono: horário, fotos, posts, respostas a avaliações e validação (cartão, vídeo ou chamada). Daqui se controla o que o Maps mostra. Ter e gerir o perfil também é grátis na Google.'
        },
        {
            title: 'Dinheiro — Google vs YourLab',
            body: 'A Google não cobra pelo perfil. Anúncios / «Promover» são pagos à Google e não estão incluídos. A YourLab cobra o trabalho de configurar (pacotes depois das demos: Essencial Google a partir de €290; upgrade Perfil 100% €80).'
        }
    ];

    layers.forEach((layer) => {
        const block = document.createElement('div');
        block.className = 'diag-layer';
        const h = document.createElement('h3');
        h.className = 'diag-layer-title';
        h.textContent = layer.title;
        const p = document.createElement('p');
        p.className = 'diag-layer-body';
        p.textContent = layer.body;
        block.append(h, p);
        wrap.appendChild(block);
    });

    control.appendChild(wrap);
}

async function render(body, ctx) {
    const diag = ensureDiag(ctx.state);
    const pages = pagesFor();
    const idx = Math.min(currentSubstep(ctx.state), pages.length - 1);
    const page = pages[idx];

    function persist() {
        ctx.update({ googleDiagnostico: diag });
        ctx.setValid(isSubstepValid(ctx.state));
    }

    if (page.kind === 'exemplo') {
        const { control } = renderAsk(body, {
            title: 'O que o cliente vê no Maps',
            hint: 'Isto é a ficha pública no Maps / Search — não o painel do dono. No passo seguinte explicamos a diferença com business.google.',
            index: idx,
            total: pages.length
        });
        mountGbpExample(control, {
            data: GBP_SAMPLE,
            showPitch: true,
            showRealLink: true
        });
        askChoices(control, [
            { id: 'ok', name: 'Já percebi — seguir' }
        ], {
            selected: diag.exemploVisto ? 'ok' : '',
            goNext: ctx.goNext,
            onSelect: () => {
                diag.exemploVisto = true;
                persist();
            }
        });
        if (ctx.state.data.diagPitch) {
            const pitch = document.createElement('p');
            pitch.className = 'ask-hint';
            pitch.textContent = ctx.state.data.diagPitch;
            control.appendChild(pitch);
        }
        if (!ctx.state.data.diagPitchPrompt) {
            ctx.state.data.diagPitchPrompt = buildDiagPitchPrompt(ctx.state);
        }
        renderOptionalAi(control, {
            title: 'Frase para a rua (opcional)',
            hint: 'O pacote continua a ser escolhido pelos toques. Isto é só o que dizer ao mostrar a ficha no Maps.',
            prompt: ctx.state.data.diagPitchPrompt,
            placeholder: 'Cole a frase…',
            ctx,
            onPromptChange: (value) => {
                ctx.state.data.diagPitchPrompt = value;
                ctx.update({ diagPitchPrompt: value });
            },
            onApply: (raw) => {
                const texto = plainAiText(raw);
                ctx.state.data.diagPitch = texto;
                ctx.update({ diagPitch: texto });
                ctx.showToast('Frase guardada.');
            }
        });
        persist();
        return;
    }

    if (page.kind === 'diferenca') {
        const { control } = renderAsk(body, {
            title: 'Maps ≠ Perfil da Empresa',
            hint: 'Duas camadas diferentes. Mostre isto ao cliente antes de perguntar o estado actual.',
            index: idx,
            total: pages.length
        });
        mountDiferencaBlocks(control);
        askChoices(control, [
            { id: 'ok', name: 'Percebi a diferença — seguir' }
        ], {
            selected: diag.diferencaVista ? 'ok' : '',
            goNext: ctx.goNext,
            onSelect: () => {
                diag.diferencaVista = true;
                persist();
            }
        });
        persist();
        return;
    }

    if (page.kind === 'maps') {
        const { control } = renderAsk(body, {
            title: 'Como está no Maps?',
            hint: 'Só a ficha pública: aparece no Maps ou não. O acesso de dono (business.google) vem nas opções.',
            index: idx,
            total: pages.length
        });
        askChoices(control, [
            { id: 'nao', name: 'Não aparece', desc: 'Ainda não há ficha / pin no Maps.' },
            {
                id: 'sim_sem_dono',
                name: 'Aparece, sem dono',
                desc: 'Há ficha no Maps, mas ninguém gere no Perfil da Empresa.'
            },
            {
                id: 'sim_acesso',
                name: 'Aparece e o cliente gere',
                desc: 'Já tem acesso ao Perfil da Empresa (business.google).'
            },
            { id: 'nao_sei', name: 'Não sei', desc: 'Confirmamos juntos no telemóvel.' }
        ], {
            selected: diag.maps,
            goNext: ctx.goNext,
            onSelect: (item) => {
                diag.maps = item.id;
                persist();
            }
        });
        persist();
        return;
    }

    if (page.kind === 'validado') {
        const { control } = renderAsk(body, {
            title: 'O Perfil da Empresa está validado?',
            hint: 'Validação (cartão/vídeo/chamada) é do Perfil da Empresa — prova de dono. O Maps pode já mostrar o pin antes disso. Nós orientamos; o prazo não controlamos.',
            index: idx,
            total: pages.length
        });
        askChoices(control, [
            { id: 'nao', name: 'Não' },
            { id: 'em_curso', name: 'Em curso' },
            { id: 'sim', name: 'Sim' },
            { id: 'na', name: 'N/A', desc: 'Ainda não há Perfil da Empresa.' }
        ], {
            selected: diag.validado,
            goNext: ctx.goNext,
            onSelect: (item) => {
                diag.validado = item.id;
                persist();
            }
        });
        persist();
        return;
    }

    if (page.kind === 'website') {
        const { control } = renderAsk(body, {
            title: 'Tem website?',
            hint: 'Landing ou site multipágina — mesmo que esteja fraco ou desactualizado.',
            index: idx,
            total: pages.length
        });
        askChoices(control, [
            { id: 'nao', name: 'Não' },
            { id: 'sim_fraco', name: 'Sim, fraco', desc: 'Wix antigo, Facebook só, ou pouco útil.' },
            { id: 'sim_ok', name: 'Sim, ok', desc: 'Já serve; foco no Google.' }
        ], {
            selected: diag.website,
            goNext: ctx.goNext,
            onSelect: (item) => {
                diag.website = item.id;
                persist();
            }
        });
        persist();
        return;
    }

    if (page.kind === 'prioridade') {
        const { control } = renderAsk(body, {
            title: 'Prioridade hoje?',
            hint: 'O que o cliente quer resolver nesta visita.',
            index: idx,
            total: pages.length
        });
        askChoices(control, [
            {
                id: 'google',
                name: 'Aparecer e gerir no Google',
                desc: 'Ficha no Maps + Perfil da Empresa.'
            },
            { id: 'site', name: 'Ter site', desc: 'Landing ou renovação.' },
            { id: 'os_dois', name: 'Os dois', desc: 'Google + site alinhados.' },
            { id: 'varias_paginas', name: 'Várias páginas', desc: 'Site maior (Plus).' }
        ], {
            selected: diag.prioridade,
            goNext: ctx.goNext,
            onSelect: (item) => {
                diag.prioridade = item.id;
                applySuggestion(ctx.state, diag);
                persist();
            }
        });
        persist();
    }
}

export const diagnosticoStep = {
    name: 'Diagnóstico',
    title: 'Diagnóstico Google',
    subtitle: 'Maps (público) vs Perfil da Empresa — estado actual, sem preços de pacote. Pacotes vêm depois das demonstrações.',
    isValid,
    isSubstepValid,
    substepCount: () => pagesFor().length,
    render
};
