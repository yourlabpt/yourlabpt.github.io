// After first demo: horário (if missing), logo, one photo, approve drafted Sobre.
// Full palette / multi-foto / AI polish: Admin → Demo tab.

import { currentSubstep, renderAsk, askChoices, askText, scheduleGoNext } from '../substep.js';
import {
    ensureIdentidade,
    filesFromClipboardData,
    filesFromClipboardRead,
    imagePickerConfig,
    isImageFile,
    persistIdentidade,
    renderFotos,
    renderLogo
} from '../demo/identity-editor.js';
import { renderHoursPicker } from '../horario.js';
import { appendAdminHint } from '../admin-redirects.js';

export { filesFromClipboardData, filesFromClipboardRead, imagePickerConfig, isImageFile };

function draftSobre(state) {
    const dados = (state.data && state.data.dados) || {};
    if (String(dados.o_que_faz || '').trim()) return String(dados.o_que_faz).trim();
    const tipo = (state.data && state.data.businessType) || {};
    const nome = dados.nome_negocio || 'este negócio';
    const tipoNome = tipo.nome || 'negócio local';
    return `${nome} é um ${String(tipoNome).toLowerCase()} em ${dados.cidade || 'Portugal'}. Atendimento próximo e presença clara no Google e na web.`;
}

function pagesFor(state) {
    const dados = (state.data && state.data.dados) || {};
    const pages = [];
    if (!String(dados.horario || '').trim()) {
        pages.push({ kind: 'horario' });
    }
    pages.push({ kind: 'logo' }, { kind: 'foto' }, { kind: 'sobre' });
    return pages;
}

function isValid(state) {
    const id = ensureIdentidade(state);
    return Boolean(id && id.cores && id.cores.base);
}

function isSubstepValid(state) {
    ensureIdentidade(state);
    return true;
}

function substepCount(state) {
    return pagesFor(state).length;
}

function render(body, ctx) {
    const businessType = ctx.state.data.businessType || null;
    if (!businessType) {
        const warn = document.createElement('div');
        warn.className = 'placeholder';
        warn.textContent = 'Escolha primeiro o tipo de negócio.';
        body.appendChild(warn);
        ctx.setValid(false);
        return;
    }

    const dados = ctx.state.data.dados || {};
    if (!dados || typeof dados !== 'object') ctx.state.data.dados = {};
    const identidade = ensureIdentidade(ctx.state);
    function persist() {
        persistIdentidade(ctx, identidade);
        ctx.update({ dados: ctx.state.data.dados });
    }

    const pages = pagesFor(ctx.state);
    const idx = Math.min(currentSubstep(ctx.state), pages.length - 1);
    const page = pages[idx];

    if (page.kind === 'horario') {
        const { control } = renderAsk(body, {
            title: 'Quando está aberto?',
            hint: 'Opcional nesta visita. Pode saltar — completa no admin se fizer falta.',
            index: idx,
            total: pages.length
        });
        renderHoursPicker(control, {
            text: dados.horario || '',
            onChange: (val) => {
                ctx.state.data.dados.horario = val;
                persist();
            },
            showNext: true,
            onNext: () => {
                if (ctx.goNext) ctx.goNext();
            }
        });
        const skip = document.createElement('button');
        skip.type = 'button';
        skip.className = 'btn-secondary logo-actions-wide';
        skip.textContent = 'Agora não';
        skip.addEventListener('click', () => {
            persist();
            scheduleGoNext(ctx.goNext);
        });
        control.appendChild(skip);
        appendAdminHint(control, 'ficha');
        persist();
        return;
    }

    if (page.kind === 'logo') {
        renderLogo(body, ctx, identidade, persist);
        const ask = body.querySelector('.ask-hint');
        if (ask) {
            ask.textContent = 'Opcional. Paleta e mais fotos: no admin → Demo.';
        }
        appendAdminHint(body, 'demo');
        persist();
        return;
    }

    if (page.kind === 'foto') {
        // Cap live visit at one photo; Admin Demo tab keeps up to 6.
        if (Array.isArray(identidade.fotos) && identidade.fotos.length > 1) {
            identidade.fotos = identidade.fotos.slice(0, 1);
        }
        renderFotos(body, ctx, identidade, persist);
        const ask = body.querySelector('.ask-hint');
        if (ask) {
            ask.textContent = 'Uma foto chega para a rua. O resto no admin → Demo.';
        }
        appendAdminHint(body, 'demo');
        persist();
        return;
    }

    if (page.kind === 'sobre') {
        const draft = draftSobre(ctx.state);
        if (!String(ctx.state.data.dados.o_que_faz || '').trim()) {
            ctx.state.data.dados.o_que_faz = draft;
        }
        const { control } = renderAsk(body, {
            title: 'Está bem assim o “Sobre”?',
            hint: 'Nós escrevemos; o cliente aprova ou edita. Sem entrevista em branco.',
            index: idx,
            total: pages.length
        });
        const preview = document.createElement('p');
        preview.className = 'diag-ownership-line';
        preview.textContent = ctx.state.data.dados.o_que_faz || draft;
        control.appendChild(preview);

        askChoices(control, [
            { id: 'ok', name: 'Está bem', desc: 'Seguir' },
            { id: 'edit', name: 'Editar', desc: 'Ajustar uma frase' }
        ], {
            selected: ctx.state.data._sobreApproved === true ? 'ok' : '',
            goNext: ctx.goNext,
            onSelect: (item) => {
                if (item.id === 'ok') {
                    ctx.state.data._sobreApproved = true;
                    persist();
                    return;
                }
                ctx.state.data._sobreApproved = false;
                persist();
                const edit = document.createElement('div');
                askText(edit, {
                    value: ctx.state.data.dados.o_que_faz || draft,
                    rows: 3,
                    onChange: (val) => {
                        ctx.state.data.dados.o_que_faz = val;
                        persist();
                    },
                    showNextButton: true,
                    nextLabel: 'Seguinte',
                    onEnter: () => {
                        ctx.state.data._sobreApproved = true;
                        persist();
                        if (ctx.goNext) ctx.goNext();
                    }
                });
                control.appendChild(edit);
                return false;
            }
        });
        appendAdminHint(control, 'ficha');
        persist();
    }
}

export const identityStep = {
    name: 'Melhorar o ecrã',
    title: 'Melhorar o ecrã',
    subtitle: 'Horário, logo e uma foto — o resto no admin (Demo).',
    isValid,
    isSubstepValid,
    substepCount,
    render
};
