import { fetchCatalog } from '../catalog.js';
import { formatEuros } from '../format.js';
import { ensureProposta } from '../proposal-calc.js';

function isValid(state) {
    const p = state.data.proposta;
    return Boolean(p && p.pacote);
}

function groupTitle(text) {
    const h = document.createElement('h3');
    h.className = 'field-group-title';
    h.textContent = text;
    return h;
}

function priceTag(servico) {
    const tag = document.createElement('span');
    tag.className = 'svc-price';
    tag.textContent = servico.percentual
        ? `+${Math.round(servico.percentual * 100)}%`
        : formatEuros(servico.preco_centimos);
    return tag;
}

function buildPackages(body, catalog, proposta, persist) {
    const packages = catalog.filter((s) => s.tipo === 'pacote');
    if (!packages.length) return;

    const group = document.createElement('div');
    group.className = 'id-section';
    group.appendChild(groupTitle('Pacote base'));

    const list = document.createElement('div');
    list.className = 'svc-list';

    packages.forEach((servico) => {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = `svc-card${proposta.pacote === servico.codigo ? ' selected' : ''}`;
        card.dataset.code = servico.codigo;

        const info = document.createElement('div');
        info.className = 'svc-info';
        info.appendChild(Object.assign(document.createElement('div'), { className: 'svc-name', textContent: servico.nome }));
        if (servico.descricao_cliente) {
            info.appendChild(Object.assign(document.createElement('div'), { className: 'svc-desc', textContent: servico.descricao_cliente }));
        }

        card.append(info, priceTag(servico));
        card.addEventListener('click', () => {
            proposta.pacote = servico.codigo;
            list.querySelectorAll('.svc-card').forEach((c) => c.classList.remove('selected'));
            card.classList.add('selected');
            persist();
        });
        list.appendChild(card);
    });

    group.appendChild(list);
    body.appendChild(group);
}

function buildExtras(body, catalog, proposta, persist) {
    const extras = catalog.filter((s) => s.tipo === 'extra');
    if (!extras.length) return;

    const group = document.createElement('div');
    group.className = 'id-section';
    group.appendChild(groupTitle('Extras'));

    const list = document.createElement('div');
    list.className = 'svc-list';

    extras.forEach((servico) => {
        const row = document.createElement('button');
        row.type = 'button';
        const active = proposta.extras.includes(servico.codigo);
        row.className = `svc-row${active ? ' selected' : ''}`;

        const check = document.createElement('span');
        check.className = 'svc-check';
        check.textContent = active ? '✓' : '';

        const info = document.createElement('div');
        info.className = 'svc-info';
        info.appendChild(Object.assign(document.createElement('div'), { className: 'svc-name', textContent: servico.nome }));
        if (servico.descricao_cliente) {
            info.appendChild(Object.assign(document.createElement('div'), { className: 'svc-desc', textContent: servico.descricao_cliente }));
        }

        row.append(check, info, priceTag(servico));
        row.addEventListener('click', () => {
            const idx = proposta.extras.indexOf(servico.codigo);
            if (idx === -1) {
                proposta.extras.push(servico.codigo);
                row.classList.add('selected');
                check.textContent = '✓';
            } else {
                proposta.extras.splice(idx, 1);
                row.classList.remove('selected');
                check.textContent = '';
            }
            persist();
        });
        list.appendChild(row);
    });

    group.appendChild(list);
    body.appendChild(group);
}

function buildUrgencia(body, catalog, proposta, persist) {
    const urgencia = catalog.find((s) => s.codigo === 'urgencia');
    if (!urgencia) return;

    const group = document.createElement('div');
    group.className = 'id-section';
    group.appendChild(groupTitle('Entrega'));

    const row = document.createElement('button');
    row.type = 'button';
    row.className = `svc-row${proposta.urgencia ? ' selected' : ''}`;
    const check = document.createElement('span');
    check.className = 'svc-check';
    check.textContent = proposta.urgencia ? '✓' : '';
    const info = document.createElement('div');
    info.className = 'svc-info';
    info.appendChild(Object.assign(document.createElement('div'), { className: 'svc-name', textContent: 'Urgência — entrega em 48h' }));
    row.append(check, info, priceTag(urgencia));
    row.addEventListener('click', () => {
        proposta.urgencia = !proposta.urgencia;
        row.classList.toggle('selected', proposta.urgencia);
        check.textContent = proposta.urgencia ? '✓' : '';
        persist();
    });

    group.appendChild(row);
    body.appendChild(group);
}

function buildManutencao(body, catalog, proposta, persist) {
    const planos = catalog.filter((s) => s.tipo === 'manutencao');
    if (!planos.length) return;

    const group = document.createElement('div');
    group.className = 'id-section';
    group.appendChild(groupTitle('Manutenção (apresentar sempre)'));

    const list = document.createElement('div');
    list.className = 'svc-list';

    const options = [{ codigo: null, nome: 'Sem manutenção', preco_centimos: 0 }, ...planos];

    options.forEach((servico) => {
        const card = document.createElement('button');
        card.type = 'button';
        const active = proposta.manutencao === servico.codigo;
        card.className = `svc-card${active ? ' selected' : ''}`;

        const info = document.createElement('div');
        info.className = 'svc-info';
        info.appendChild(Object.assign(document.createElement('div'), { className: 'svc-name', textContent: servico.nome }));
        if (servico.descricao_cliente) {
            info.appendChild(Object.assign(document.createElement('div'), { className: 'svc-desc', textContent: servico.descricao_cliente }));
        }

        if (servico.codigo) {
            const tag = document.createElement('span');
            tag.className = 'svc-price';
            tag.textContent = `${formatEuros(servico.preco_centimos)}/mês`;
            card.append(info, tag);
        } else {
            card.appendChild(info);
        }

        card.addEventListener('click', () => {
            proposta.manutencao = servico.codigo;
            list.querySelectorAll('.svc-card').forEach((c) => c.classList.remove('selected'));
            card.classList.add('selected');
            persist();
        });
        list.appendChild(card);
    });

    group.appendChild(list);
    body.appendChild(group);
}

async function render(body, ctx) {
    const proposta = ensureProposta(ctx.state);

    const loading = document.createElement('div');
    loading.className = 'placeholder';
    loading.textContent = 'A carregar o catálogo…';
    body.appendChild(loading);

    let catalog;
    try {
        catalog = await fetchCatalog(ctx);
    } catch (_) {
        loading.textContent = 'Não foi possível carregar o catálogo.';
        ctx.setValid(false);
        return;
    }
    if (!catalog) return; // unauthorized handled
    loading.remove();

    function persist() {
        ctx.update({ proposta });
        ctx.setValid(isValid(ctx.state));
    }

    buildPackages(body, catalog, proposta, persist);
    buildExtras(body, catalog, proposta, persist);
    buildUrgencia(body, catalog, proposta, persist);
    buildManutencao(body, catalog, proposta, persist);

    persist();
}

export const servicesStep = {
    name: 'Serviços',
    title: 'Seleção de serviços',
    subtitle: 'Escolha o pacote e os extras. Apresente sempre a manutenção — é a única receita que compõe.',
    isValid,
    render
};
