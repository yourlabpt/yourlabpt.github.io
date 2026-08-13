// Etapa 3 — Identidade visual, one choice at a time.

import { currentSubstep, renderAsk } from '../substep.js';

const STYLES = [
    { id: 'clean', nome: 'Clean', desc: 'Claro, espaçado, moderno.' },
    { id: 'bold', nome: 'Bold', desc: 'Contraste forte, títulos grandes.' },
    { id: 'warm', nome: 'Warm', desc: 'Acolhedor, cantos suaves.' }
];

const FALLBACK_CORES = ['#1b1b1b', '#e8d5b7', '#7a8a99'];

function getBusinessType(state) {
    return state.data.businessType || null;
}

function getDados(state) {
    return state.data.dados || {};
}

function ensureIdentidade(state) {
    const businessType = getBusinessType(state);
    const suggested = (businessType && Array.isArray(businessType.cores_sugeridas) && businessType.cores_sugeridas.length === 3)
        ? businessType.cores_sugeridas
        : FALLBACK_CORES;

    if (!state.data.identidade || typeof state.data.identidade !== 'object') {
        state.data.identidade = {
            logo: { tipo: 'nenhum' },
            estilo: 'clean',
            cores: { base: suggested[0], destaque: suggested[1], secundaria: suggested[2] }
        };
    }
    const id = state.data.identidade;
    if (!id.logo) id.logo = { tipo: 'nenhum' };
    if (!id.estilo) id.estilo = 'clean';
    if (!id.cores) id.cores = { base: suggested[0], destaque: suggested[1], secundaria: suggested[2] };
    return id;
}

function isValid(state) {
    const id = state.data.identidade;
    return Boolean(id && id.estilo && id.cores);
}

function isSubstepValid(state) {
    ensureIdentidade(state);
    return true;
}

function substepCount() {
    return 3;
}

function fileToDataUrl(file, maxDim = 512) {
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
                resolve(canvas.toDataURL(isPng ? 'image/png' : 'image/jpeg', 0.85));
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
        hint: 'Se não tiver, usamos o nome do negócio. Continuar está sempre disponível.',
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
            const dataUrl = await fileToDataUrl(file);
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

    const details = document.createElement('details');
    details.className = 'field-optional';
    details.appendChild(Object.assign(document.createElement('summary'), {
        textContent: 'Gerar sugestão de logótipo (opcional)'
    }));
    const disclaimer = document.createElement('p');
    disclaimer.className = 'id-disclaimer';
    disclaimer.textContent = 'Apenas uma sugestão. A YourLab não vende criação de logótipo.';
    const nome = dados.nome_negocio || 'o negócio';
    const businessType = getBusinessType(ctx.state);
    const promptText = `Cria um logótipo simples e moderno para "${nome}", um(a) ${businessType ? businessType.nome.toLowerCase() : 'negócio local'} em Portugal. Estilo minimalista, vetorial, fundo transparente. Usa o nome "${nome}".`;
    const ta = document.createElement('textarea');
    ta.className = 'field-input';
    ta.readOnly = true;
    ta.rows = 3;
    ta.value = promptText;
    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'btn-secondary';
    copyBtn.textContent = 'Copiar prompt';
    copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(promptText)
            .then(() => ctx.showToast('Prompt copiado.'))
            .catch(() => ctx.showToast('Não foi possível copiar.', true));
    });
    details.append(disclaimer, ta, copyBtn);
    control.appendChild(details);
}

function renderStyle(body, ctx, identidade, persist) {
    const { control } = renderAsk(body, {
        title: 'Que estilo prefere?',
        hint: 'Pode mudar depois. Clean fica bem na maioria dos casos.',
        index: 1,
        total: 3
    });

    const grid = document.createElement('div');
    grid.className = 'style-grid';
    STYLES.forEach((style) => {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = `style-card${identidade.estilo === style.id ? ' selected' : ''}`;
        const prev = document.createElement('div');
        prev.className = `style-preview style-preview-${style.id}`;
        prev.innerHTML = '<span class="sp-title">Aa</span><span class="sp-bar"></span>';
        const { base, destaque, secundaria } = identidade.cores;
        prev.style.setProperty('--sp-base', base);
        prev.style.setProperty('--sp-destaque', destaque);
        prev.style.setProperty('--sp-secundaria', secundaria);
        card.append(
            prev,
            Object.assign(document.createElement('div'), { className: 'style-card-name', textContent: style.nome }),
            Object.assign(document.createElement('div'), { className: 'style-card-desc', textContent: style.desc })
        );
        card.addEventListener('click', () => {
            identidade.estilo = style.id;
            grid.querySelectorAll('.style-card').forEach((c) => c.classList.remove('selected'));
            card.classList.add('selected');
            persist();
        });
        grid.appendChild(card);
    });
    control.appendChild(grid);
}

function renderColors(body, ctx, identidade, persist) {
    const businessType = getBusinessType(ctx.state);
    const suggested = (businessType && Array.isArray(businessType.cores_sugeridas) && businessType.cores_sugeridas.length === 3)
        ? businessType.cores_sugeridas
        : FALLBACK_CORES;

    const { control } = renderAsk(body, {
        title: 'Estas cores servem?',
        hint: 'Já vêm do tipo de negócio. Ajuste só se o cliente quiser.',
        index: 2,
        total: 3
    });

    const row = document.createElement('div');
    row.className = 'color-row';
    [
        { key: 'base', label: 'Base' },
        { key: 'destaque', label: 'Destaque' },
        { key: 'secundaria', label: 'Secundária' }
    ].forEach(({ key, label }) => {
        const wrap = document.createElement('label');
        wrap.className = 'color-swatch';
        const input = document.createElement('input');
        input.type = 'color';
        input.value = identidade.cores[key];
        input.addEventListener('input', () => {
            identidade.cores[key] = input.value;
            persist();
        });
        wrap.append(input, Object.assign(document.createElement('span'), { textContent: label }));
        row.appendChild(wrap);
    });

    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'btn-secondary color-reset';
    reset.textContent = 'Repor paleta do setor';
    reset.addEventListener('click', () => {
        identidade.cores = { base: suggested[0], destaque: suggested[1], secundaria: suggested[2] };
        persist();
        row.querySelectorAll('input[type="color"]').forEach((inp, i) => {
            inp.value = [suggested[0], suggested[1], suggested[2]][i];
        });
    });
    control.append(row, reset);
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
    else if (idx === 1) renderStyle(body, ctx, identidade, persist);
    else renderColors(body, ctx, identidade, persist);

    persist();
}

export const identityStep = {
    name: 'Identidade visual',
    title: 'Identidade visual',
    subtitle: 'Logótipo, estilo e cores. É rápido — ajuste em segundos e siga em frente.',
    isValid,
    isSubstepValid,
    substepCount,
    render
};
