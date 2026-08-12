import { apiRequest } from '../api.js';
import { getToken } from '../auth.js';

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
        const { response, data } = await apiRequest('/api/digitalizept/business-types', {
            token: getToken()
        });

        if (response.status === 401) {
            ctx.onUnauthorized();
            return;
        }
        if (!response.ok) {
            throw new Error(data.error || 'Failed to load business types.');
        }

        loading.remove();
        body.appendChild(grid);

        const types = Array.isArray(data.businessTypes) ? data.businessTypes : [];
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
            icon.textContent = type.icone || '🏪';

            const name = document.createElement('span');
            name.className = 'type-card-name';
            name.textContent = type.nome;

            card.append(icon, name);

            card.addEventListener('click', () => {
                grid.querySelectorAll('.type-card').forEach((c) => c.classList.remove('selected'));
                card.classList.add('selected');
                ctx.update({ businessType: type });
                ctx.setValid(true);
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
