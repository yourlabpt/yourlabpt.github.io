import { currentSubstep, renderAsk, askChoices } from '../substep.js';
import { mountGbpExample, GBP_SAMPLE } from '../demo/gbp-example.js';
import { suggestPackage } from '../deal/packages.js';
import { buildDiagPitchPrompt, plainAiText, renderOptionalAi } from '../optional-ai.js';

function ensureDiag(state) {
    if (!state.data.googleDiagnostico || typeof state.data.googleDiagnostico !== 'object') {
        state.data.googleDiagnostico = {
            exemploVisto: false,
            maps: '',
            validado: '',
            website: '',
            prioridade: '',
            pacoteSugerido: ''
        };
    }
    return state.data.googleDiagnostico;
}

function pagesFor() {
    return [
        { kind: 'exemplo' },
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
            title: 'Isto é o Perfil Google',
            hint: 'Mostre ao cliente o que aparece no Maps. Depois seguimos com o diagnóstico.',
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
            hint: 'O pacote continua a ser escolhido pelos toques. Isto é só o que dizer ao mostrar o Maps.',
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

    if (page.kind === 'maps') {
        const { control } = renderAsk(body, {
            title: 'Tem perfil no Google Maps?',
            hint: 'O estado actual decide se criamos, reivindicamos ou só actualizamos.',
            index: idx,
            total: pages.length
        });
        askChoices(control, [
            { id: 'nao', name: 'Não', desc: 'Ainda não aparece no Maps.' },
            { id: 'sim_sem_dono', name: 'Sim, sem dono', desc: 'Existe mas ninguém gere.' },
            { id: 'sim_acesso', name: 'Sim, com acesso', desc: 'O cliente já controla o perfil.' },
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
            title: 'O perfil está validado?',
            hint: 'A validação é do Google (cartão/vídeo/chamada). Nós orientamos; o prazo não controlamos.',
            index: idx,
            total: pages.length
        });
        askChoices(control, [
            { id: 'nao', name: 'Não' },
            { id: 'em_curso', name: 'Em curso' },
            { id: 'sim', name: 'Sim' },
            { id: 'na', name: 'N/A', desc: 'Ainda não há perfil.' }
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
            { id: 'google', name: 'Aparecer no Google já', desc: 'Perfil Maps primeiro.' },
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
    subtitle: 'Perceber o estado actual — sem preços. Pacotes vêm depois das demonstrações.',
    isValid,
    isSubstepValid,
    substepCount: () => pagesFor().length,
    render
};
