import { fetchCatalog } from '../catalog.js';
import { formatEuros } from '../format.js';
import { ensureProposta } from '../proposal-calc.js';
import { ensureDominio, isDominioValid, refreshDominioCandidates } from '../domain.js';

function isValid(state) {
    const p = state.data.proposta;
    return Boolean(p && p.pacote && isDominioValid(p));
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

async function buildDomain(body, ctx, proposta, persist) {
    const dados = ctx.state.data.dados || {};
    const dominio = ensureDominio(proposta);

    const group = document.createElement('div');
    group.className = 'id-section';
    group.appendChild(groupTitle('Domínio — 3 opções'));

    const hint = document.createElement('p');
    hint.className = 'id-disclaimer';
    hint.textContent = 'A procurar nomes livres para registar. Se nenhum servir, o cliente compra o próprio domínio e recebe o website em ZIP por email.';
    group.appendChild(hint);

    const status = document.createElement('p');
    status.className = 'domain-status';
    status.textContent = 'A verificar disponibilidade…';
    group.appendChild(status);

    const list = document.createElement('div');
    list.className = 'svc-list';
    group.appendChild(list);
    body.appendChild(group);

    function paint() {
        list.querySelectorAll('.svc-row').forEach((row) => {
            const mode = row.dataset.mode;
            const value = row.dataset.value || '';
            const selected = mode === 'sugerido'
                ? dominio.modo === 'sugerido' && dominio.escolhido === value
                : dominio.modo === 'proprio';
            row.classList.toggle('selected', selected);
        });
    }

    function renderOwnOption() {
        const own = document.createElement('button');
        own.type = 'button';
        own.className = 'svc-row';
        own.dataset.mode = 'proprio';
        const ownCheck = document.createElement('span');
        ownCheck.className = 'svc-check';
        const ownInfo = document.createElement('div');
        ownInfo.className = 'svc-info';
        ownInfo.appendChild(Object.assign(document.createElement('div'), {
            className: 'svc-name',
            textContent: 'Cliente compra o próprio domínio'
        }));
        ownInfo.appendChild(Object.assign(document.createElement('div'), {
            className: 'svc-desc',
            textContent: 'Entrega do código em ZIP por email — o cliente publica quando quiser'
        }));
        own.append(ownCheck, ownInfo);
        own.addEventListener('click', () => {
            dominio.modo = 'proprio';
            dominio.escolhido = '';
            paint();
            persist();
        });
        list.appendChild(own);
        paint();
    }

    if (!dados.nome_negocio) {
        status.textContent = 'Preencha o nome do negócio no passo anterior.';
        renderOwnOption();
        return;
    }

    await refreshDominioCandidates(ctx, proposta, dados);

    list.innerHTML = '';
    const available = dominio.candidatos || [];

    if (!available.length) {
        status.textContent = 'Não encontrámos nomes livres agora. Use a opção de domínio próprio ou tente noutra rede.';
    } else {
        status.textContent = `${available.length} nome${available.length > 1 ? 's' : ''} livre${available.length > 1 ? 's' : ''} para registar:`;
        available.forEach((name) => {
            const row = document.createElement('button');
            row.type = 'button';
            row.className = 'svc-row';
            row.dataset.mode = 'sugerido';
            row.dataset.value = name;
            const check = document.createElement('span');
            check.className = 'svc-check';
            const info = document.createElement('div');
            info.className = 'svc-info';
            info.appendChild(Object.assign(document.createElement('div'), { className: 'svc-name', textContent: name }));
            info.appendChild(Object.assign(document.createElement('div'), {
                className: 'svc-desc',
                textContent: 'Disponível para registar em nome do cliente'
            }));
            const tag = document.createElement('span');
            tag.className = 'svc-tag svc-tag-ok';
            tag.textContent = 'Livre';
            row.append(check, info, tag);
            row.addEventListener('click', () => {
                dominio.modo = 'sugerido';
                dominio.escolhido = name;
                paint();
                persist();
            });
            list.appendChild(row);
        });
    }

    renderOwnOption();
    persist();
}

function buildExtras(body, catalog, proposta, persist) {
    const extras = catalog.filter((s) => s.tipo === 'extra');
    if (!extras.length) return;

    const group = document.createElement('div');
    group.className = 'id-section';
    group.appendChild(groupTitle('Extras'));

    const help = document.createElement('p');
    help.className = 'id-disclaimer';
    help.textContent = 'Para clientes com pouca prática digital, comece pela assistência de utilização (€60).';
    group.appendChild(help);

    const list = document.createElement('div');
    list.className = 'svc-list';

    extras.forEach((servico) => {
        const row = document.createElement('button');
        row.type = 'button';
        const active = proposta.extras.includes(servico.codigo);
        row.className = `svc-row${active ? ' selected' : ''}`;

        const check = document.createElement('span');
        check.className = 'svc-check';
        check.textContent = '';

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
            } else {
                proposta.extras.splice(idx, 1);
                row.classList.remove('selected');
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
    const info = document.createElement('div');
    info.className = 'svc-info';
    info.appendChild(Object.assign(document.createElement('div'), { className: 'svc-name', textContent: 'Urgência — entrega em 48h' }));
    row.append(check, info, priceTag(urgencia));
    row.addEventListener('click', () => {
        proposta.urgencia = !proposta.urgencia;
        row.classList.toggle('selected', proposta.urgencia);
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
    await buildDomain(body, ctx, proposta, persist);
    buildExtras(body, catalog, proposta, persist);
    buildUrgencia(body, catalog, proposta, persist);
    buildManutencao(body, catalog, proposta, persist);

    const contra = document.createElement('div');
    contra.className = 'id-section';
    contra.appendChild(groupTitle('Contrapartida (opcional)'));
    const hint = document.createElement('p');
    hint.className = 'id-disclaimer';
    hint.textContent = 'O que o cliente oferece em troca de um desconto — fotos, depoimento, indicação.';
    const input = document.createElement('textarea');
    input.className = 'field-input';
    input.rows = 2;
    input.value = proposta.contrapartida || '';
    input.addEventListener('input', () => {
        proposta.contrapartida = input.value;
        persist();
    });
    contra.append(hint, input);
    body.appendChild(contra);

    persist();
}

export const servicesStep = {
    name: 'Serviços',
    title: 'Seleção de serviços',
    subtitle: 'Pacote, domínio e extras. Para quem tem pouca prática digital, acrescente a assistência de utilização.',
    isValid,
    render
};
