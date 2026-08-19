import { fetchSettings } from '../settings.js';
import { scheduleGoNext } from '../substep.js';

function clearTypeBoundState() {
    return {
        identidade: undefined,
        demo: undefined,
        demoHtml: '',
        demoRaw: '',
        demoSeeded: false,
        demoIdentityStamp: '',
        colorPrompt: '',
        _googleChecklist: undefined,
        googlePresence: undefined
    };
}

function marca(type) {
    const raw = String((type && type.icone) || '').trim();
    if (/^[A-Za-z0-9]{1,4}$/.test(raw)) return raw.toUpperCase();
    const nome = String((type && (type.nome || type.id)) || '');
    const words = nome.split(/[^\p{L}]+/u).filter(Boolean);
    if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
    return (nome.slice(0, 2) || 'GE').toUpperCase();
}

function isValid(state) {
    return Boolean(state.data.businessType && state.data.businessType.id);
}

async function render(body, ctx) {
    const grid = document.createElement('div');
    grid.className = 'type-grid';

    const loading = document.createElement('div');
    loading.className = 'placeholder';
    loading.textContent = 'A carregar categorias…';

    body.appendChild(loading);

    try {
        const settings = await fetchSettings(ctx);
        if (!settings) return;

        loading.remove();
        body.appendChild(grid);

        const types = settings.businessTypes;
        if (!types.length) {
            const empty = document.createElement('div');
            empty.className = 'placeholder';
            empty.textContent = 'Nenhuma categoria configurada.';
            body.appendChild(empty);
            return;
        }

        const selectedId = ctx.state.data.businessType && ctx.state.data.businessType.id;

        types.forEach((type) => {
            const card = document.createElement('button');
            card.type = 'button';
            card.className = `type-card${type.id === selectedId ? ' selected' : ''}`;

            const icon = document.createElement('span');
            icon.className = 'type-card-icon';
            icon.textContent = marca(type);

            const name = document.createElement('span');
            name.className = 'type-card-name';
            name.textContent = type.nome;

            card.append(icon, name);

            card.addEventListener('click', () => {
                grid.querySelectorAll('.type-card').forEach((c) => c.classList.remove('selected'));
                card.classList.add('selected');
                const prevId = ctx.state.data.businessType && ctx.state.data.businessType.id;
                const patch = { businessType: type };
                if (prevId && prevId !== type.id) Object.assign(patch, clearTypeBoundState());
                ctx.update(patch);
                ctx.setValid(true);
                scheduleGoNext(ctx.goNext);
            });

            grid.appendChild(card);
        });

        ctx.setValid(isValid(ctx.state));
    } catch (error) {
        loading.textContent = 'Não foi possível carregar as categorias.';
        ctx.showToast('Não foi possível carregar as categorias.', true);
    }
}

export const businessTypeStep = {
    name: 'Tipo de negócio',
    title: 'Que tipo de negócio vamos digitalizar?',
    subtitle: 'Escolha a categoria. Ela define as perguntas, os serviços e o estilo da demonstração.',
    isValid,
    render
};
