import { currentSubstep, renderAsk, askChoices, askText } from '../substep.js';
import { includesGooglePresence } from '../deal/contract.js';
import { ensureProposta } from '../proposal-calc.js';

const MAPS_STATES = [
    { id: 'nao_existe', name: 'Ainda não existe no Maps', desc: 'Vamos criar o perfil na conta do cliente.' },
    { id: 'sem_dono', name: 'Existe, sem dono', desc: 'Vamos reivindicar o perfil existente.' },
    { id: 'outro_dono', name: 'Existe com outro dono', desc: 'Vamos pedir acesso ou orientar o cliente.' }
];

const FOTO_OPTS = [
    { id: 'ja_tem', name: 'Já tem fotos', desc: 'Usamos as que o cliente fornecer.' },
    { id: 'captar', name: 'Captar agora', desc: 'Sugere o extra Conteúdo visual básico.' },
    { id: 'depois', name: 'Mais tarde', desc: 'Fica anotado para a entrega.' }
];

function ensureGoogle(state) {
    if (!state.data.googlePresence || typeof state.data.googlePresence !== 'object') {
        state.data.googlePresence = {
            mapsEstado: '',
            categoria: '',
            atributos: [],
            website: '',
            instagram: '',
            facebook: '',
            fotos: '',
            descricao: ''
        };
    }
    const g = state.data.googlePresence;
    if (!Array.isArray(g.atributos)) g.atributos = [];
    return g;
}

function checklistFor(state) {
    const fromType = state.data._googleChecklist;
    if (fromType && Array.isArray(fromType.atributos)) return fromType;
    return { atributos: ['Aceita cartões', 'Acessível a cadeiras de rodas', 'Estacionamento nas proximidades'] };
}

function suggestedCategory(state) {
    const cats = state.data.businessType && state.data.businessType.categorias_google;
    if (Array.isArray(cats) && cats[0]) return String(cats[0]).replace(/_/g, ' ');
    return 'estabelecimento local';
}

function pagesFor(state) {
    return [
        { kind: 'maps' },
        { kind: 'categoria' },
        { kind: 'atributos' },
        { kind: 'redes' },
        { kind: 'fotos' },
        { kind: 'resumo' }
    ];
}

function isSubstepValid(state) {
    if (!includesGooglePresence(ensureProposta(state))) return true;
    const g = ensureGoogle(state);
    const page = pagesFor(state)[currentSubstep(state)];
    if (!page) return false;
    if (page.kind === 'maps') return Boolean(g.mapsEstado);
    if (page.kind === 'categoria') return Boolean(String(g.categoria || '').trim());
    if (page.kind === 'fotos') return Boolean(g.fotos);
    return true;
}

function isValid(state) {
    if (!includesGooglePresence(ensureProposta(state))) return true;
    const g = ensureGoogle(state);
    return Boolean(g.mapsEstado && String(g.categoria || '').trim() && g.fotos);
}

async function loadChecklist(ctx) {
    if (ctx.state.data._googleChecklist) return ctx.state.data._googleChecklist;
    const typeId = (ctx.state.data.businessType && ctx.state.data.businessType.id) || 'generico';
    try {
        const { apiRequest } = await import('../api.js');
        const { getToken } = await import('../auth.js');
        const { response, data } = await apiRequest(
            `/api/digitalizept/google-checklist?tipo=${encodeURIComponent(typeId)}`,
            { token: getToken() }
        );
        if (response.status === 401) {
            ctx.onUnauthorized();
            return null;
        }
        const checklist = (data && data.checklist) || { atributos: [] };
        ctx.update({ _googleChecklist: checklist });
        return checklist;
    } catch (_) {
        const fallback = { atributos: checklistFor(ctx.state).atributos };
        ctx.update({ _googleChecklist: fallback });
        return fallback;
    }
}

function paintResumo(control, g, dados) {
    const rows = [
        ['Maps', MAPS_STATES.find((m) => m.id === g.mapsEstado)?.name || '—'],
        ['Categoria', g.categoria || '—'],
        ['Horário', dados.horario || 'Por confirmar'],
        ['Atributos', g.atributos.length ? g.atributos.join(', ') : 'Nenhum'],
        ['Website', g.website || '—'],
        ['Instagram', g.instagram || '—'],
        ['Facebook', g.facebook || '—'],
        ['Fotos', FOTO_OPTS.find((f) => f.id === g.fotos)?.name || '—']
    ];
    const list = document.createElement('ul');
    list.className = 'google-resumo';
    rows.forEach(([label, value]) => {
        const li = document.createElement('li');
        const ok = value && value !== '—' && value !== 'Por confirmar' && value !== 'Nenhum';
        li.textContent = `${ok ? '✓' : '⚠'} ${label}: ${value}`;
        list.appendChild(li);
    });
    control.appendChild(list);
    const note = document.createElement('p');
    note.className = 'ask-hint';
    note.textContent = 'Checklist operacional — executado na conta Google do cliente. Sem promessa de ranking.';
    control.appendChild(note);
}

async function render(body, ctx) {
    ensureProposta(ctx.state);
    if (!includesGooglePresence(ctx.state.data.proposta)) {
        ctx.setValid(true);
        return;
    }

    const g = ensureGoogle(ctx.state);
    const dados = ctx.state.data.dados || {};
    if (!g.categoria) g.categoria = suggestedCategory(ctx.state);
    if (!g.website && dados.website) g.website = dados.website;
    if (!g.instagram && dados.instagram) g.instagram = dados.instagram;
    if (!g.facebook && dados.facebook) g.facebook = dados.facebook;

    await loadChecklist(ctx);
    const pages = pagesFor(ctx.state);
    const idx = Math.min(currentSubstep(ctx.state), pages.length - 1);
    const page = pages[idx];

    function persist() {
        ctx.update({ googlePresence: g });
        ctx.setValid(isSubstepValid(ctx.state));
    }

    if (page.kind === 'maps') {
        const { control } = renderAsk(body, {
            title: 'Como está no Google Maps?',
            hint: 'Isto define se criamos, reivindicamos ou pedimos acesso.',
            index: idx,
            total: pages.length
        });
        askChoices(control, MAPS_STATES, {
            selected: g.mapsEstado,
            onSelect: (item) => {
                g.mapsEstado = item.id;
                persist();
            }
        });
        persist();
        return;
    }

    if (page.kind === 'categoria') {
        const { control } = renderAsk(body, {
            title: 'Categoria no Google',
            hint: `Sugestão do tipo de negócio: ${suggestedCategory(ctx.state)}`,
            index: idx,
            total: pages.length
        });
        askText(control, {
            value: g.categoria,
            placeholder: 'Ex.: restaurante, café, salão de cabeleireiro',
            onChange: (v) => {
                g.categoria = v;
                persist();
            }
        });
        persist();
        return;
    }

    if (page.kind === 'atributos') {
        const attrs = checklistFor(ctx.state).atributos || [];
        const { control } = renderAsk(body, {
            title: 'Atributos relevantes',
            hint: `Horário já recolhido: ${dados.horario || 'ainda não'}. Marque o que se aplica (máx. 8).`,
            index: idx,
            total: pages.length
        });
        const wrap = document.createElement('div');
        wrap.className = 'ask-choices';
        attrs.slice(0, 8).forEach((label) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            const on = g.atributos.includes(label);
            btn.className = `ask-choice${on ? ' selected' : ''}`;
            const name = document.createElement('div');
            name.className = 'ask-choice-name';
            name.textContent = label;
            btn.appendChild(name);
            btn.addEventListener('click', () => {
                const i = g.atributos.indexOf(label);
                if (i === -1) g.atributos.push(label);
                else g.atributos.splice(i, 1);
                persist();
                btn.classList.toggle('selected', g.atributos.includes(label));
            });
            wrap.appendChild(btn);
        });
        control.appendChild(wrap);
        persist();
        return;
    }

    if (page.kind === 'redes') {
        const { control } = renderAsk(body, {
            title: 'Website e redes',
            hint: 'Preencha só o que existir. Pode deixar em branco.',
            index: idx,
            total: pages.length
        });
        [
            ['website', 'Website (URL)', 'https://…'],
            ['instagram', 'Instagram', '@negocio'],
            ['facebook', 'Facebook', 'facebook.com/…']
        ].forEach(([key, label, placeholder]) => {
            const field = document.createElement('label');
            field.className = 'field';
            field.innerHTML = `<span class="field-label">${label}</span>`;
            control.appendChild(field);
            askText(field, {
                value: g[key] || '',
                placeholder,
                onChange: (v) => {
                    g[key] = v;
                    persist();
                }
            });
        });
        persist();
        return;
    }

    if (page.kind === 'fotos') {
        const { control } = renderAsk(body, {
            title: 'Fotos para o perfil',
            hint: 'Fotos do local — não é sessão profissional.',
            index: idx,
            total: pages.length
        });
        askChoices(control, FOTO_OPTS, {
            selected: g.fotos,
            onSelect: (item) => {
                g.fotos = item.id;
                if (item.id === 'captar') {
                    const p = ensureProposta(ctx.state);
                    if (!p.extras.includes('conteudo_visual')) p.extras.push('conteudo_visual');
                    ctx.update({ proposta: p, googlePresence: g });
                }
                persist();
            }
        });
        persist();
        return;
    }

    if (page.kind === 'resumo') {
        const { control } = renderAsk(body, {
            title: 'Checklist Google',
            hint: 'Resumo para executar depois na conta do cliente.',
            index: idx,
            total: pages.length
        });
        paintResumo(control, g, dados);
        persist();
    }
}

export const googleStep = {
    name: 'Google',
    title: 'Presença no Google',
    subtitle: 'Checklist leve para organizar o Perfil Google do cliente.',
    // Diagnóstico covers Maps/website/priority; operational checklist lives in the work folder.
    shouldSkip: () => true,
    isValid,
    isSubstepValid,
    substepCount: (state) => (includesGooglePresence(ensureProposta(state)) ? pagesFor(state).length : 0),
    render
};
