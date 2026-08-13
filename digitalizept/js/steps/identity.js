// Etapa 3 — Identidade visual: logo, paleta (botões), fotos reais.

import { currentSubstep, renderAsk } from '../substep.js';

const FALLBACK_CORES = ['#1b1b1b', '#e8d5b7', '#7a8a99'];
const MAX_FOTOS = 6;

function getBusinessType(state) {
    return state.data.businessType || null;
}

function getDados(state) {
    return state.data.dados || {};
}

function palettesOf(businessType) {
    if (businessType && Array.isArray(businessType.paletas_sugeridas) && businessType.paletas_sugeridas.length) {
        return businessType.paletas_sugeridas;
    }
    const cores = (businessType && Array.isArray(businessType.cores_sugeridas) && businessType.cores_sugeridas.length === 3)
        ? businessType.cores_sugeridas
        : FALLBACK_CORES;
    return [{ id: 'clean', nome: 'Clean', cores }];
}

function applyPalette(identidade, palette) {
    const cores = palette.cores || FALLBACK_CORES;
    identidade.paleta = palette.id || 'clean';
    identidade.estilo = palette.id || 'clean';
    identidade.cores = { base: cores[0], destaque: cores[1], secundaria: cores[2] };
}

function ensureIdentidade(state) {
    const businessType = getBusinessType(state);
    const palettes = palettesOf(businessType);
    const first = palettes[0];

    if (!state.data.identidade || typeof state.data.identidade !== 'object') {
        state.data.identidade = {
            logo: { tipo: 'nenhum' },
            estilo: first.id || 'clean',
            paleta: first.id || 'clean',
            cores: { base: first.cores[0], destaque: first.cores[1], secundaria: first.cores[2] },
            fotos: []
        };
    }
    const id = state.data.identidade;
    if (!id.logo) id.logo = { tipo: 'nenhum' };
    if (!Array.isArray(id.fotos)) id.fotos = [];
    if (!id.cores || !id.cores.base) applyPalette(id, first);
    if (!id.paleta) id.paleta = id.estilo || first.id || 'clean';
    if (!id.estilo) id.estilo = id.paleta;
    return id;
}

function isValid(state) {
    const id = state.data.identidade;
    return Boolean(id && id.cores && id.cores.base);
}

function isSubstepValid(state) {
    ensureIdentidade(state);
    return true;
}

function substepCount() {
    return 3;
}

function fileToDataUrl(file, maxDim = 1280) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('read failed'));
        reader.onload = () => {
            const img = new Image();
            img.onerror = () => reject(new Error('decode failed'));
            img.onload = () => {
                const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
                const w = Math.round(img.width * scale);
                const h = Math.round(img.height * scale);
                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                const isPng = /png/i.test(file.type);
                resolve(canvas.toDataURL(isPng ? 'image/png' : 'image/jpeg', 0.82));
            };
            img.src = reader.result;
        };
        reader.readAsDataURL(file);
    });
}

function renderLogo(body, ctx, identidade, persist) {
    const dados = getDados(ctx.state);
    const { control } = renderAsk(body, {
        title: 'Tem logótipo?',
        hint: 'Se não tiver, usamos o nome do negócio.',
        index: 0,
        total: 3
    });

    const preview = document.createElement('div');
    preview.className = 'logo-preview';

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.className = 'hidden';

    function renderPreview() {
        preview.innerHTML = '';
        if (identidade.logo.tipo === 'upload' && identidade.logo.dataUrl) {
            const img = document.createElement('img');
            img.src = identidade.logo.dataUrl;
            img.alt = 'Logótipo';
            preview.appendChild(img);
        } else {
            const typo = document.createElement('div');
            typo.className = 'logo-typographic';
            typo.textContent = dados.nome_negocio || 'Nome do Negócio';
            const note = document.createElement('div');
            note.className = 'logo-note';
            note.textContent = 'Sem logótipo — usamos o nome.';
            preview.append(typo, note);
        }
    }

    input.addEventListener('change', async () => {
        const file = input.files && input.files[0];
        if (!file) return;
        try {
            const dataUrl = await fileToDataUrl(file, 512);
            identidade.logo = { tipo: 'upload', dataUrl, nome: file.name };
            persist();
            renderPreview();
        } catch (_) {
            ctx.showToast('Não foi possível carregar a imagem.', true);
        }
    });

    const actions = document.createElement('div');
    actions.className = 'logo-actions';
    const uploadBtn = document.createElement('button');
    uploadBtn.type = 'button';
    uploadBtn.className = 'btn-primary';
    uploadBtn.textContent = 'Carregar / tirar foto';
    uploadBtn.addEventListener('click', () => input.click());
    const noneBtn = document.createElement('button');
    noneBtn.type = 'button';
    noneBtn.className = 'btn-secondary';
    noneBtn.textContent = 'Não tenho';
    noneBtn.addEventListener('click', () => {
        identidade.logo = { tipo: 'nenhum' };
        persist();
        renderPreview();
    });
    actions.append(uploadBtn, noneBtn);
    control.append(preview, actions, input);
    renderPreview();
}

function renderPalette(body, ctx, identidade, persist) {
    const businessType = getBusinessType(ctx.state);
    const palettes = palettesOf(businessType);

    const { control } = renderAsk(body, {
        title: 'Que paleta usar?',
        hint: 'Um toque. Escolhida para este tipo de negócio.',
        index: 1,
        total: 3
    });

    const grid = document.createElement('div');
    grid.className = 'palette-grid';
    palettes.forEach((palette) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        const selected = identidade.paleta === palette.id
            || (identidade.cores.base === palette.cores[0] && identidade.cores.destaque === palette.cores[1]);
        btn.className = `palette-card${selected ? ' selected' : ''}`;
        const swatches = document.createElement('div');
        swatches.className = 'palette-swatches';
        palette.cores.forEach((hex) => {
            const chip = document.createElement('span');
            chip.className = 'palette-chip';
            chip.style.background = hex;
            swatches.appendChild(chip);
        });
        btn.append(
            swatches,
            Object.assign(document.createElement('div'), { className: 'palette-name', textContent: palette.nome })
        );
        btn.addEventListener('click', () => {
            applyPalette(identidade, palette);
            grid.querySelectorAll('.palette-card').forEach((c) => c.classList.remove('selected'));
            btn.classList.add('selected');
            persist();
        });
        grid.appendChild(btn);
    });
    control.appendChild(grid);
}

function renderFotos(body, ctx, identidade, persist) {
    const { control } = renderAsk(body, {
        title: 'Tirar fotos agora?',
        hint: 'Fotos reais do estabelecimento tornam a demo muito mais convincente. Pode saltar.',
        index: 2,
        total: 3
    });

    const preview = document.createElement('div');
    preview.className = 'foto-grid';

    function paint() {
        preview.innerHTML = '';
        (identidade.fotos || []).forEach((url, i) => {
            const tile = document.createElement('div');
            tile.className = 'foto-tile';
            const img = document.createElement('img');
            img.src = url;
            img.alt = `Foto ${i + 1}`;
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'foto-remove';
            remove.textContent = '×';
            remove.setAttribute('aria-label', 'Remover foto');
            remove.addEventListener('click', () => {
                identidade.fotos.splice(i, 1);
                persist();
                paint();
            });
            tile.append(img, remove);
            preview.appendChild(tile);
        });
        if (!identidade.fotos.length) {
            const empty = document.createElement('p');
            empty.className = 'ask-hint';
            empty.textContent = 'Ainda sem fotos — Continuar usa placeholders visuais.';
            preview.appendChild(empty);
        }
    }

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.multiple = true;
    input.className = 'hidden';

    input.addEventListener('change', async () => {
        const files = Array.from(input.files || []);
        if (!files.length) return;
        const room = MAX_FOTOS - identidade.fotos.length;
        for (const file of files.slice(0, room)) {
            try {
                const dataUrl = await fileToDataUrl(file);
                identidade.fotos.push(dataUrl);
            } catch (_) {
                ctx.showToast('Uma foto falhou.', true);
            }
        }
        input.value = '';
        persist();
        paint();
    });

    const actions = document.createElement('div');
    actions.className = 'logo-actions';
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'btn-primary';
    addBtn.textContent = identidade.fotos.length ? 'Adicionar fotos' : 'Sim — tirar / carregar';
    addBtn.addEventListener('click', () => {
        if (identidade.fotos.length >= MAX_FOTOS) {
            ctx.showToast(`Máximo ${MAX_FOTOS} fotos.`, true);
            return;
        }
        input.click();
    });
    const skipBtn = document.createElement('button');
    skipBtn.type = 'button';
    skipBtn.className = 'btn-secondary';
    skipBtn.textContent = 'Agora não';
    skipBtn.addEventListener('click', () => {
        persist();
        if (typeof ctx.goNext === 'function') ctx.goNext();
    });
    actions.append(addBtn, skipBtn);
    control.append(preview, actions, input);
    paint();
}

function render(body, ctx) {
    const businessType = getBusinessType(ctx.state);
    if (!businessType) {
        const warn = document.createElement('div');
        warn.className = 'placeholder';
        warn.textContent = 'Escolha primeiro o tipo de negócio.';
        body.appendChild(warn);
        ctx.setValid(false);
        return;
    }

    const identidade = ensureIdentidade(ctx.state);
    function persist() {
        ctx.update({ identidade });
        ctx.setValid(true);
    }

    const idx = currentSubstep(ctx.state);
    if (idx === 0) renderLogo(body, ctx, identidade, persist);
    else if (idx === 1) renderPalette(body, ctx, identidade, persist);
    else renderFotos(body, ctx, identidade, persist);

    persist();
}

export const identityStep = {
    name: 'Identidade visual',
    title: 'Identidade visual',
    subtitle: 'Logótipo, paleta e fotos. Decisões em botões — siga em frente.',
    isValid,
    isSubstepValid,
    substepCount,
    render
};
