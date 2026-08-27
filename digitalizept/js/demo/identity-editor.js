// Shared identity editor: logo, paleta, fotos. Wizard step 3 and the admin Demo tab.

import { renderAsk, scheduleGoNext } from '../substep.js';
import { applyCustomCores, buildColorPrompt, parseCores } from './colors.js';
import { sampleLogoMat } from './logo-mat.js';

import { apiRequest } from '../api.js';
import { getToken } from '../auth.js';

const FALLBACK_CORES = ['#1b1b1b', '#e8d5b7', '#7a8a99'];
const MAX_FOTOS = 6;
const IMAGE_ACCEPT = 'image/*,image/heic,image/heif,.heic,.heif';
const IMAGE_NAME_RE = /\.(heic|heif|jpe?g|png|webp|gif|avif)$/i;
const DATA_IMAGE_RE = /src=["'](data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=\s]+)["']/gi;
const REMOTE_SRC_RE = /(?:src|data-src)=["'](https?:\/\/[^"']+)["']/gi;
const SRCSET_RE = /srcset=["']([^"']+)["']/gi;
const PLAIN_URL_RE = /https?:\/\/[^\s<>"']+/gi;

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

export function isImageFile(file) {
    if (!file) return false;
    if (file.type && /^image\//i.test(file.type)) return true;
    return IMAGE_NAME_RE.test(file.name || '');
}

function dataUrlToFile(dataUrl, index = 0) {
    const match = /^data:([^;]+);base64,(.+)$/.exec(String(dataUrl || '').replace(/\s/g, ''));
    if (!match) return null;
    try {
        const binary = atob(match[2]);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
        const ext = (match[1].split('/')[1] || 'png').replace('+xml', '');
        return new File([bytes], `colar-${index + 1}.${ext}`, { type: match[1] });
    } catch (_) {
        return null;
    }
}

function filesFromHtml(html) {
    const files = [];
    const seen = new Set();
    String(html || '').replace(DATA_IMAGE_RE, (_, url) => {
        if (seen.has(url)) return _;
        seen.add(url);
        const file = dataUrlToFile(url, files.length);
        if (file) files.push(file);
        return _;
    });
    return files;
}

function cleanRemoteUrl(raw) {
    let url = String(raw || '').trim().replace(/&amp;/g, '&');
    if (!url) return '';
    const hash = url.indexOf('#');
    if (hash >= 0) url = url.slice(0, hash);
    if (!/^https?:\/\//i.test(url)) return '';
    if (url.length > 2000) return '';
    // Skip tracking / non-image page links that are obviously not CDN media
    if (/facebook\.com\/(reel|watch|share|story)/i.test(url) && !/scontent|fbcdn|cdninstagram/i.test(url)) {
        return '';
    }
    return url;
}

function urlsFromSrcset(value) {
    return String(value || '')
        .split(',')
        .map((part) => cleanRemoteUrl(part.trim().split(/\s+/)[0]))
        .filter(Boolean);
}

/** FB/IG usually put https CDN URLs in clipboard HTML, not image files. */
export function imageUrlsFromClipboardData(data) {
    if (!data) return [];
    const out = [];
    const seen = new Set();
    const add = (raw) => {
        const url = cleanRemoteUrl(raw);
        if (!url || seen.has(url)) return;
        seen.add(url);
        out.push(url);
    };

    let html = '';
    let plain = '';
    let uriList = '';
    if (typeof data.getData === 'function') {
        try { html = data.getData('text/html') || ''; } catch (_) { /* ignore */ }
        try { plain = data.getData('text/plain') || ''; } catch (_) { /* ignore */ }
        try { uriList = data.getData('text/uri-list') || ''; } catch (_) { /* ignore */ }
    }

    String(html).replace(REMOTE_SRC_RE, (_, src) => {
        add(src);
        return _;
    });
    String(html).replace(SRCSET_RE, (_, set) => {
        urlsFromSrcset(set).forEach(add);
        return _;
    });
    String(uriList).split('\n').forEach((line) => {
        if (line && !line.startsWith('#')) add(line.trim());
    });
    if (!out.length && plain) {
        const matches = plain.match(PLAIN_URL_RE) || [];
        matches.forEach(add);
        if (!matches.length) add(plain);
    }
    return out.slice(0, 6);
}

export function filesFromClipboardData(data) {
    if (!data) return [];
    const out = [];
    const seen = new Set();
    const add = (file) => {
        if (!file || !isImageFile(file)) return;
        const key = `${file.type}:${file.size}:${file.name}`;
        if (seen.has(key)) return;
        seen.add(key);
        out.push(file);
    };
    Array.from(data.files || []).forEach(add);
    Array.from(data.items || []).forEach((item) => {
        if (item && item.kind === 'file' && typeof item.getAsFile === 'function') {
            add(item.getAsFile());
        }
    });
    if (!out.length && typeof data.getData === 'function') {
        filesFromHtml(data.getData('text/html') || '').forEach(add);
    }
    return out;
}

export async function fetchRemoteImageFile(url, index = 0) {
    const href = cleanRemoteUrl(url);
    if (!href) return null;
    try {
        const { response, data } = await apiRequest('/api/digitalizept/fetch-image', {
            method: 'POST',
            token: getToken(),
            body: { url: href }
        });
        if (!response.ok || !data || !data.dataUrl) return null;
        return dataUrlToFile(data.dataUrl, index);
    } catch (_) {
        return null;
    }
}

export async function filesFromImageUrls(urls) {
    const list = Array.isArray(urls) ? urls : [];
    const files = [];
    for (let i = 0; i < list.length && files.length < 6; i += 1) {
        const file = await fetchRemoteImageFile(list[i], files.length);
        if (file) files.push(file);
    }
    return files;
}

async function filesFromDomImages(root) {
    if (!root || typeof root.querySelectorAll !== 'function') return [];
    const files = [];
    const imgs = Array.from(root.querySelectorAll('img'));
    for (let i = 0; i < imgs.length && files.length < 6; i += 1) {
        const src = String(imgs[i].currentSrc || imgs[i].src || '').trim();
        if (!src) continue;
        if (src.startsWith('data:image/')) {
            const file = dataUrlToFile(src, files.length);
            if (file) files.push(file);
            continue;
        }
        if (src.startsWith('blob:')) {
            try {
                const blob = await fetch(src).then((r) => r.blob());
                if (blob && /^image\//i.test(blob.type || 'image/png')) {
                    const ext = (blob.type || 'image/png').split('/')[1] || 'png';
                    files.push(new File([blob], `colar-${files.length + 1}.${ext}`, {
                        type: blob.type || 'image/png'
                    }));
                }
            } catch (_) { /* ignore */ }
            continue;
        }
        if (/^https?:\/\//i.test(src)) {
            const file = await fetchRemoteImageFile(src, files.length);
            if (file) files.push(file);
        }
    }
    return files;
}

export async function resolveClipboardImages(data) {
    const local = filesFromClipboardData(data);
    if (local.length) return local;
    return filesFromImageUrls(imageUrlsFromClipboardData(data));
}

export async function filesFromClipboardRead() {
    if (!navigator.clipboard || typeof navigator.clipboard.read !== 'function') return [];
    const items = await navigator.clipboard.read();
    const files = [];
    const htmlChunks = [];
    for (const item of items) {
        const types = item.types || [];
        const imageType = types.find((name) => /^image\//i.test(name));
        if (imageType) {
            const blob = await item.getType(imageType);
            const ext = imageType.split('/')[1] || 'png';
            files.push(new File([blob], `colar.${ext}`, { type: imageType }));
            continue;
        }
        if (types.includes('text/html')) {
            try {
                const blob = await item.getType('text/html');
                htmlChunks.push(await blob.text());
            } catch (_) { /* ignore */ }
        }
        if (types.includes('text/plain')) {
            try {
                const blob = await item.getType('text/plain');
                htmlChunks.push(await blob.text());
            } catch (_) { /* ignore */ }
        }
    }
    if (files.length) return files;
    if (!htmlChunks.length) return [];
    const fake = {
        getData: (type) => {
            if (type === 'text/html') return htmlChunks.join('\n');
            if (type === 'text/plain') return htmlChunks.join('\n');
            return '';
        }
    };
    return resolveClipboardImages(fake);
}

function bindImageIntake(host, onFiles, { showToast } = {}) {
    const take = async (event, filesPromise) => {
        const files = await filesPromise;
        if (!files.length) return false;
        if (event && typeof event.preventDefault === 'function') event.preventDefault();
        await onFiles(files);
        return true;
    };

    host.addEventListener('paste', async (event) => {
        const zone = event.target && event.target.closest
            ? event.target.closest('.image-paste')
            : null;
        const handled = await take(event, resolveClipboardImages(event.clipboardData));
        if (handled) {
            if (zone) resetPasteZone(zone);
            return;
        }
        // Mobile FB/IG: browser may insert <img src="https://cdn…"> into contenteditable.
        if (!zone) return;
        window.setTimeout(async () => {
            const fromDom = await filesFromDomImages(zone);
            resetPasteZone(zone);
            if (fromDom.length) {
                await onFiles(fromDom);
                return;
            }
            if (typeof showToast === 'function') {
                showToast('Não consegui a imagem. No FB/IG use “Copiar imagem”, ou grave e escolha Das fotos.', true);
            }
        }, 80);
    });

    host.addEventListener('dragover', (event) => {
        if (!event.dataTransfer) return;
        event.preventDefault();
        host.classList.add('is-drop');
    });
    host.addEventListener('dragleave', () => host.classList.remove('is-drop'));
    host.addEventListener('drop', async (event) => {
        host.classList.remove('is-drop');
        const files = Array.from((event.dataTransfer && event.dataTransfer.files) || []).filter(isImageFile);
        if (files.length) {
            event.preventDefault();
            await onFiles(files);
            return;
        }
        const urls = imageUrlsFromClipboardData(event.dataTransfer);
        const remote = await filesFromImageUrls(urls);
        if (remote.length) {
            event.preventDefault();
            await onFiles(remote);
        }
    });
}

function resetPasteZone(zone) {
    if (!zone) return;
    const hint = document.createElement('span');
    hint.className = 'image-paste-hint';
    hint.textContent = zone.dataset.hint || 'Cole a imagem aqui — Facebook, Instagram ou fotos';
    zone.replaceChildren(hint);
}

function makePasteZone() {
    const zone = document.createElement('div');
    zone.className = 'image-paste';
    zone.dataset.hint = 'Cole a imagem aqui — Facebook, Instagram ou fotos';
    zone.setAttribute('contenteditable', 'true');
    zone.setAttribute('role', 'textbox');
    zone.setAttribute('spellcheck', 'false');
    zone.setAttribute('enterkeyhint', 'done');
    zone.setAttribute('aria-label', 'Cole a imagem aqui');
    zone.tabIndex = 0;
    resetPasteZone(zone);
    zone.addEventListener('beforeinput', (event) => {
        if (event.inputType && event.inputType.startsWith('insert') && event.inputType !== 'insertFromPaste') {
            event.preventDefault();
        }
    });
    // Do not wipe on every input — paste handler harvests inserted <img> first.
    zone.addEventListener('focus', () => {
        zone.classList.add('is-focused');
    });
    zone.addEventListener('blur', () => {
        zone.classList.remove('is-focused');
        // Clear leftover paste chrome if any
        if (zone.querySelector('img')) return;
        resetPasteZone(zone);
    });
    return zone;
}

function pasteButton(onFiles, showToast, zone) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-secondary logo-actions-wide';
    btn.textContent = 'Colar imagem';
    btn.addEventListener('click', async () => {
        try {
            const files = await filesFromClipboardRead();
            if (files.length) {
                await onFiles(files);
                return;
            }
        } catch (_) { /* Safari / permission — fall through to paste hint */ }
        if (zone && typeof zone.focus === 'function') zone.focus();
        if (typeof showToast === 'function') {
            showToast('Copie a imagem (FB/IG: Copiar imagem) e cole na caixa a tracejado.');
        }
    });
    return btn;
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

export function palettesOf(businessType) {
    if (businessType && Array.isArray(businessType.paletas_sugeridas) && businessType.paletas_sugeridas.length) {
        return businessType.paletas_sugeridas;
    }
    const cores = (businessType && Array.isArray(businessType.cores_sugeridas) && businessType.cores_sugeridas.length === 3)
        ? businessType.cores_sugeridas
        : FALLBACK_CORES;
    return [{ id: 'clean', nome: 'Clean', cores }];
}

export function applyPalette(identidade, palette) {
    const cores = palette.cores || FALLBACK_CORES;
    identidade.paleta = palette.id || 'clean';
    identidade.estilo = palette.id || 'clean';
    identidade.cores = { base: cores[0], destaque: cores[1], secundaria: cores[2] };
}

export function ensureIdentidade(state) {
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

export function renderLogo(body, ctx, identidade, persist) {
    const dados = getDados(ctx.state);
    const { control } = renderAsk(body, {
        title: 'Tem logótipo?',
        hint: 'Câmara, álbum, ou cole a imagem — não precisa de gravar no telemóvel. Se não tiver, usamos o nome.',
        index: 0,
        total: 3
    });

    const preview = document.createElement('div');
    preview.className = 'logo-preview';

    function renderPreview() {
        preview.innerHTML = '';
        preview.style.removeProperty('--logo-mat');
        if (identidade.logo.tipo === 'upload' && identidade.logo.dataUrl) {
            if (identidade.logo.mat) preview.style.setProperty('--logo-mat', identidade.logo.mat);
            else {
                sampleLogoMat(identidade.logo.dataUrl).then((mat) => {
                    if (!mat) return;
                    identidade.logo.mat = mat;
                    preview.style.setProperty('--logo-mat', mat);
                });
            }
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
            const mat = await sampleLogoMat(dataUrl);
            identidade.logo = { tipo: 'upload', dataUrl, nome: file.name, mat };
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
    const pasteZone = makePasteZone();
    bindImageIntake(control, onFiles, { showToast: ctx.showToast });
    actions.appendChild(pasteButton(onFiles, ctx.showToast, pasteZone));
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
    control.append(preview, pasteZone, actions, camera, library);
    renderPreview();
}

export function renderPalette(body, ctx, identidade, persist) {
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

export function renderFotos(body, ctx, identidade, persist) {
    const { control } = renderAsk(body, {
        title: 'Tirar fotos agora?',
        hint: 'Câmara, álbum, ou cole as imagens — sem gravar no telemóvel. Pode saltar.',
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
    const pasteZone = makePasteZone();
    bindImageIntake(control, onFiles, { showToast: ctx.showToast });
    actions.appendChild(pasteButton(onFiles, ctx.showToast, pasteZone));
    const skipBtn = document.createElement('button');
    skipBtn.type = 'button';
    skipBtn.className = 'btn-secondary logo-actions-wide';
    skipBtn.textContent = 'Agora não';
    skipBtn.addEventListener('click', () => {
        persist();
        scheduleGoNext(ctx.goNext);
    });
    actions.appendChild(skipBtn);
    control.append(preview, pasteZone, actions, camera, library);
    paint();
}

export function persistIdentidade(ctx, identidade) {
    ctx.update({ identidade });
    if (typeof ctx.setValid === 'function') ctx.setValid(true);
}

export function renderIdentityEditors(body, ctx) {
    const businessType = getBusinessType(ctx.state);
    if (!businessType) {
        const warn = document.createElement('div');
        warn.className = 'placeholder';
        warn.textContent = 'Escolha primeiro o tipo de negócio.';
        body.appendChild(warn);
        if (typeof ctx.setValid === 'function') ctx.setValid(false);
        return null;
    }
    const identidade = ensureIdentidade(ctx.state);
    const persist = () => persistIdentidade(ctx, identidade);
    renderLogo(body, ctx, identidade, persist);
    renderPalette(body, ctx, identidade, persist);
    renderFotos(body, ctx, identidade, persist);
    persist();
    return identidade;
}
