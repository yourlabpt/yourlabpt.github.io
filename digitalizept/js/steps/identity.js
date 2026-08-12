// Etapa 3 — Identidade visual: logótipo, estilo (boilerplate) e paleta.
// The choices here feed the demo renderer in Etapa 4.

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

// Downscale any uploaded image so the base64 stays small in sessionStorage.
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

function buildLogoSection(body, ctx, identidade, persist) {
    const group = document.createElement('div');
    group.className = 'id-section';
    const title = document.createElement('h3');
    title.className = 'field-group-title';
    title.textContent = 'Logótipo';
    group.appendChild(title);

    const preview = document.createElement('div');
    preview.className = 'logo-preview';

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.className = 'hidden';

    const dados = getDados(ctx.state);

    function renderPreview() {
        preview.innerHTML = '';
        if (identidade.logo.tipo === 'upload' && identidade.logo.dataUrl) {
            const img = document.createElement('img');
            img.src = identidade.logo.dataUrl;
            img.alt = 'Logótipo';
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'btn-secondary logo-remove';
            remove.textContent = 'Remover';
            remove.addEventListener('click', () => {
                identidade.logo = { tipo: 'nenhum' };
                persist();
                renderPreview();
            });
            preview.append(img, remove);
        } else {
            const type = dados.nome_negocio || 'Nome do Negócio';
            const typo = document.createElement('div');
            typo.className = 'logo-typographic';
            typo.textContent = type;
            const note = document.createElement('div');
            note.className = 'logo-note';
            note.textContent = 'Sem logótipo — usamos o nome com a tipografia do template.';
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

    group.append(preview, actions, input);
    body.appendChild(group);
    renderPreview();
}

function buildLogoPromptSuggestion(body, ctx) {
    const businessType = getBusinessType(ctx.state);
    const dados = getDados(ctx.state);

    const details = document.createElement('details');
    details.className = 'field-optional';
    const summary = document.createElement('summary');
    summary.textContent = 'Gerar sugestão de logótipo (opcional)';
    details.appendChild(summary);

    const disclaimer = document.createElement('p');
    disclaimer.className = 'id-disclaimer';
    disclaimer.textContent = 'Isto é apenas uma sugestão. A YourLab não vende criação de logótipo nem identidade visual — para um logótipo profissional, encaminhamos para um parceiro.';

    const nome = dados.nome_negocio || 'o negócio';
    const promptText = `Cria um logótipo simples e moderno para "${nome}", um(a) ${businessType ? businessType.nome.toLowerCase() : 'negócio local'} em Portugal. Estilo minimalista, vetorial, fundo transparente, uma cor principal e uma secundária. Sem texto latino de exemplo — usa o nome "${nome}". Adequado a uso em website e ficha do Google.`;

    const ta = document.createElement('textarea');
    ta.className = 'field-input';
    ta.readOnly = true;
    ta.rows = 4;
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
    body.appendChild(details);
}

function buildStyleSection(body, ctx, identidade, persist, updatePreviews) {
    const group = document.createElement('div');
    group.className = 'id-section';
    const title = document.createElement('h3');
    title.className = 'field-group-title';
    title.textContent = 'Estilo';
    group.appendChild(title);

    const grid = document.createElement('div');
    grid.className = 'style-grid';

    STYLES.forEach((style) => {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = `style-card${identidade.estilo === style.id ? ' selected' : ''}`;
        card.dataset.style = style.id;

        const prev = document.createElement('div');
        prev.className = `style-preview style-preview-${style.id}`;
        prev.innerHTML = '<span class="sp-title">Aa</span><span class="sp-bar"></span>';

        const name = document.createElement('div');
        name.className = 'style-card-name';
        name.textContent = style.nome;
        const desc = document.createElement('div');
        desc.className = 'style-card-desc';
        desc.textContent = style.desc;

        card.append(prev, name, desc);
        card.addEventListener('click', () => {
            identidade.estilo = style.id;
            grid.querySelectorAll('.style-card').forEach((c) => c.classList.remove('selected'));
            card.classList.add('selected');
            persist();
        });
        grid.appendChild(card);
    });

    group.appendChild(grid);
    body.appendChild(group);
    updatePreviews();
}

function buildColorSection(body, ctx, identidade, persist, updatePreviews) {
    const businessType = getBusinessType(ctx.state);
    const suggested = (businessType && Array.isArray(businessType.cores_sugeridas) && businessType.cores_sugeridas.length === 3)
        ? businessType.cores_sugeridas
        : FALLBACK_CORES;

    const group = document.createElement('div');
    group.className = 'id-section';
    const title = document.createElement('h3');
    title.className = 'field-group-title';
    title.textContent = 'Cores';
    group.appendChild(title);

    const row = document.createElement('div');
    row.className = 'color-row';

    const swatches = [
        { key: 'base', label: 'Base' },
        { key: 'destaque', label: 'Destaque' },
        { key: 'secundaria', label: 'Secundária' }
    ];

    swatches.forEach(({ key, label }) => {
        const wrap = document.createElement('label');
        wrap.className = 'color-swatch';
        const input = document.createElement('input');
        input.type = 'color';
        input.value = identidade.cores[key];
        input.addEventListener('input', () => {
            identidade.cores[key] = input.value;
            persist();
            updatePreviews();
        });
        const span = document.createElement('span');
        span.textContent = label;
        wrap.append(input, span);
        row.appendChild(wrap);
    });

    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'btn-secondary color-reset';
    reset.textContent = 'Repor paleta do setor';
    reset.addEventListener('click', () => {
        identidade.cores = { base: suggested[0], destaque: suggested[1], secundaria: suggested[2] };
        persist();
        // refresh color inputs
        row.querySelectorAll('input[type="color"]').forEach((inp, i) => {
            inp.value = [suggested[0], suggested[1], suggested[2]][i];
        });
        updatePreviews();
    });

    group.append(row, reset);
    body.appendChild(group);
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
        ctx.setValid(isValid(ctx.state));
    }

    function updatePreviews() {
        const { base, destaque, secundaria } = identidade.cores;
        body.querySelectorAll('.style-preview').forEach((prev) => {
            prev.style.setProperty('--sp-base', base);
            prev.style.setProperty('--sp-destaque', destaque);
            prev.style.setProperty('--sp-secundaria', secundaria);
        });
    }

    buildLogoSection(body, ctx, identidade, persist);
    buildLogoPromptSuggestion(body, ctx);
    buildStyleSection(body, ctx, identidade, persist, updatePreviews);
    buildColorSection(body, ctx, identidade, persist, updatePreviews);

    persist();
}

export const identityStep = {
    name: 'Identidade visual',
    title: 'Identidade visual',
    subtitle: 'Logótipo, estilo e cores. É rápido — ajuste em segundos e siga em frente.',
    isValid,
    render
};
