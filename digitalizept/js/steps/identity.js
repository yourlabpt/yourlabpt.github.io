// Etapa 3 — Identidade visual: logo, paleta (botões), fotos reais.

import { currentSubstep, renderAsk, scheduleGoNext } from '../substep.js';
import { applyCustomCores, buildColorPrompt, parseCores } from '../demo/colors.js';

const FALLBACK_CORES = ['#1b1b1b', '#e8d5b7', '#7a8a99'];
const MAX_FOTOS = 6;
const IMAGE_ACCEPT = 'image/*,image/heic,image/heif,.heic,.heif';

// iOS home-screen PWAs open the camera and skip the library if `capture` is set.
export function imagePickerConfig(source, { multiple = false } = {}) {
    const config = { accept: IMAGE_ACCEPT };
    if (source === 'camera') config.capture = 'environment';
    else if (multiple) config.multiple = true;
    return config;
}

function makeFileInput(config) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = config.accept;
    input.className = 'hidden';
    if (config.capture) input.setAttribute('capture', config.capture);
    if (config.multiple) input.multiple = true;
    return input;
}

function bindFileInput(input, onFiles) {
    input.addEventListener('change', async () => {
        const files = Array.from(input.files || []);
        input.value = '';
        if (!files.length) return;
        await onFiles(files);
    });
}

function createImageSourceInputs({ multiple = false, onFiles }) {
    const camera = makeFileInput(imagePickerConfig('camera'));
    const library = makeFileInput(imagePickerConfig('library', { multiple }));
    bindFileInput(camera, onFiles);
    bindFileInput(library, onFiles);
    return { camera, library };
}

function imageSourceButtons({ camera, library, cameraLabel, libraryLabel }) {
    const actions = document.createElement('div');
    actions.className = 'logo-actions';
    const cameraBtn = document.createElement('button');
    cameraBtn.type = 'button';
    cameraBtn.className = 'btn-primary';
    cameraBtn.textContent = cameraLabel;
    cameraBtn.addEventListener('click', () => camera.click());
    const libraryBtn = document.createElement('button');
    libraryBtn.type = 'button';
    libraryBtn.className = 'btn-primary';
    libraryBtn.textContent = libraryLabel;
    libraryBtn.addEventListener('click', () => library.click());
    actions.append(cameraBtn, libraryBtn);
    return actions;
}

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
        hint: 'Câmara ou fotos já no telemóvel. Se não tiver, usamos o nome do negócio.',
        index: 0,
        total: 3
    });

    const preview = document.createElement('div');
    preview.className = 'logo-preview';

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

    async function onFiles(files) {
        const file = files[0];
        if (!file) return;
        try {
            const dataUrl = await fileToDataUrl(file, 512);
            identidade.logo = { tipo: 'upload', dataUrl, nome: file.name };
            persist();
            renderPreview();
        } catch (_) {
            ctx.showToast('Não foi possível carregar a imagem.', true);
        }
    }

    const { camera, library } = createImageSourceInputs({ onFiles });
    const actions = imageSourceButtons({
        camera,
        library,
        cameraLabel: 'Tirar foto',
        libraryLabel: 'Das fotos'
    });
    const noneBtn = document.createElement('button');
    noneBtn.type = 'button';
    noneBtn.className = 'btn-secondary logo-actions-wide';
    noneBtn.textContent = 'Não tenho';
    noneBtn.addEventListener('click', () => {
        identidade.logo = { tipo: 'nenhum' };
        persist();
        renderPreview();
        scheduleGoNext(ctx.goNext);
    });
    actions.appendChild(noneBtn);
    control.append(preview, actions, camera, library);
    renderPreview();
}

function renderPalette(body, ctx, identidade, persist) {
    const businessType = getBusinessType(ctx.state);
    const palettes = palettesOf(businessType);

    const { control } = renderAsk(body, {
        title: 'Que paleta usar?',
        hint: 'Um toque avança. Cores à medida (prompt) ficam em opção, acima.',
        index: 1,
        total: 3
    });

    function paintSelection() {
        grid.querySelectorAll('.palette-card').forEach((card) => {
            card.classList.toggle('selected', card.dataset.paletteId === identidade.paleta);
        });
        if (baseInput) baseInput.value = identidade.cores.base || '#1b1b1b';
        if (destaqueInput) destaqueInput.value = identidade.cores.destaque || '#e8d5b7';
        if (secundariaInput) secundariaInput.value = identidade.cores.secundaria || '#7a8a99';
    }

    const details = document.createElement('details');
    details.className = 'palette-custom';
    details.open = identidade.paleta === 'custom';
    const summary = document.createElement('summary');
    summary.textContent = 'Cores à medida (opcional)';
    details.appendChild(summary);

    const customHint = document.createElement('p');
    customHint.className = 'ask-hint';
    customHint.textContent = 'Copie o prompt, peça 3 cores ao assistente, cole o JSON e avance.';

    if (!ctx.state.data.colorPrompt) {
        ctx.state.data.colorPrompt = buildColorPrompt(ctx.state);
    }
    const promptArea = document.createElement('textarea');
    promptArea.className = 'field-input demo-prompt';
    promptArea.rows = 5;
    promptArea.value = ctx.state.data.colorPrompt;
    promptArea.addEventListener('input', () => {
        ctx.state.data.colorPrompt = promptArea.value;
        ctx.update({ colorPrompt: promptArea.value });
    });

    const promptActions = document.createElement('div');
    promptActions.className = 'demo-actions';
    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'btn-secondary';
    copyBtn.textContent = 'Copiar prompt';
    copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(promptArea.value)
            .then(() => ctx.showToast('Prompt de cores copiado.'))
            .catch(() => ctx.showToast('Não foi possível copiar.', true));
    });
    const regenBtn = document.createElement('button');
    regenBtn.type = 'button';
    regenBtn.className = 'btn-secondary';
    regenBtn.textContent = 'Repor prompt';
    regenBtn.addEventListener('click', () => {
        const fresh = buildColorPrompt(ctx.state);
        promptArea.value = fresh;
        ctx.state.data.colorPrompt = fresh;
        ctx.update({ colorPrompt: fresh });
    });
    promptActions.append(copyBtn, regenBtn);

    const pasteArea = document.createElement('textarea');
    pasteArea.className = 'field-input demo-paste';
    pasteArea.rows = 3;
    pasteArea.placeholder = '{"base":"#1b1b1b","destaque":"#e8d5b7","secundaria":"#7a8a99"}';

    function applyCores(cores, advance) {
        applyCustomCores(identidade, cores);
        persist();
        paintSelection();
        if (advance) scheduleGoNext(ctx.goNext);
    }

    const applyPasteBtn = document.createElement('button');
    applyPasteBtn.type = 'button';
    applyPasteBtn.className = 'btn-primary';
    applyPasteBtn.textContent = 'Aplicar cores do JSON';
    applyPasteBtn.addEventListener('click', () => {
        const result = parseCores(pasteArea.value);
        if (!result.ok) {
            ctx.showToast(result.error, true);
            return;
        }
        applyCores(result.cores, false);
        ctx.showToast('Cores aplicadas. Ajuste os selectores se quiser.');
    });

    function colorField(label, key) {
        const wrap = document.createElement('label');
        wrap.className = 'color-swatch';
        wrap.appendChild(Object.assign(document.createElement('span'), { textContent: label }));
        const input = document.createElement('input');
        input.type = 'color';
        input.value = identidade.cores[key] || '#1b1b1b';
        input.addEventListener('input', () => {
            applyCustomCores(identidade, {
                base: baseInput.value,
                destaque: destaqueInput.value,
                secundaria: secundariaInput.value
            });
            persist();
            paintSelection();
        });
        wrap.appendChild(input);
        return { wrap, input };
    }

    const row = document.createElement('div');
    row.className = 'color-row';
    const baseField = colorField('Base', 'base');
    const destaqueField = colorField('Destaque', 'destaque');
    const secundariaField = colorField('Secundária', 'secundaria');
    const baseInput = baseField.input;
    const destaqueInput = destaqueField.input;
    const secundariaInput = secundariaField.input;
    row.append(baseField.wrap, destaqueField.wrap, secundariaField.wrap);

    details.append(customHint, promptArea, promptActions, pasteArea, applyPasteBtn, row);
    control.appendChild(details);

    const grid = document.createElement('div');
    grid.className = 'palette-grid';
    const allPalettes = [
        ...palettes,
        {
            id: 'custom',
            nome: 'À medida',
            cores: [
                identidade.cores.base || FALLBACK_CORES[0],
                identidade.cores.destaque || FALLBACK_CORES[1],
                identidade.cores.secundaria || FALLBACK_CORES[2]
            ]
        }
    ];
    allPalettes.forEach((palette) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.dataset.paletteId = palette.id;
        const selected = identidade.paleta === palette.id
            || (palette.id !== 'custom'
                && identidade.cores.base === palette.cores[0]
                && identidade.cores.destaque === palette.cores[1]);
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
            if (palette.id === 'custom') {
                details.open = true;
                applyCustomCores(identidade, {
                    base: baseInput.value,
                    destaque: destaqueInput.value,
                    secundaria: secundariaInput.value
                });
                persist();
                paintSelection();
                return;
            }
            applyPalette(identidade, palette);
            persist();
            paintSelection();
            scheduleGoNext(ctx.goNext);
        });
        grid.appendChild(btn);
    });
    control.appendChild(grid);
}

function renderFotos(body, ctx, identidade, persist) {
    const { control } = renderAsk(body, {
        title: 'Tirar fotos agora?',
        hint: 'Câmara ou fotos já no telemóvel. Fotos reais tornam a demo mais convincente. Pode saltar.',
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

    async function onFiles(files) {
        if (identidade.fotos.length >= MAX_FOTOS) {
            ctx.showToast(`Máximo ${MAX_FOTOS} fotos.`, true);
            return;
        }
        const room = MAX_FOTOS - identidade.fotos.length;
        for (const file of files.slice(0, room)) {
            try {
                const dataUrl = await fileToDataUrl(file);
                identidade.fotos.push(dataUrl);
            } catch (_) {
                ctx.showToast('Uma foto falhou.', true);
            }
        }
        persist();
        paint();
    }

    const { camera, library } = createImageSourceInputs({ multiple: true, onFiles });
    const actions = imageSourceButtons({
        camera,
        library,
        cameraLabel: 'Tirar foto',
        libraryLabel: 'Das fotos'
    });
    const skipBtn = document.createElement('button');
    skipBtn.type = 'button';
    skipBtn.className = 'btn-secondary logo-actions-wide';
    skipBtn.textContent = 'Agora não';
    skipBtn.addEventListener('click', () => {
        persist();
        scheduleGoNext(ctx.goNext);
    });
    actions.appendChild(skipBtn);
    control.append(preview, actions, camera, library);
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
    subtitle: 'Logótipo, paleta e fotos. Um toque avança; cores à medida são opcionais.',
    isValid,
    isSubstepValid,
    substepCount,
    render
};
