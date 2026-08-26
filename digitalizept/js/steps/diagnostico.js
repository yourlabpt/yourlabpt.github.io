import { currentSubstep, renderAsk, askChoices } from '../substep.js';
import { mountGbpExample, gbpDataFromState } from '../demo/gbp-example.js';
import { suggestPackage } from '../deal/packages.js';
import { appendAdminHint } from '../admin-redirects.js';

function ensureDiag(state) {
    if (!state.data.googleDiagnostico || typeof state.data.googleDiagnostico !== 'object') {
        state.data.googleDiagnostico = {
            exemploVisto: true,
            diferencaVista: true,
            maps: '',
            validado: '',
            website: '',
            prioridade: '',
            pacoteSugerido: ''
        };
    }
    const d = state.data.googleDiagnostico;
    // Live path skips the lecture; mark seen so stored shape stays valid for Admin/resume.
    if (d.exemploVisto !== true) d.exemploVisto = true;
    if (d.diferencaVista !== true) d.diferencaVista = true;
    return d;
}

function pagesFor(state) {
    const dados = (state.data && state.data.dados) || {};
    const websiteKnown = Boolean(String(dados.website_atual || '').trim())
        || Boolean(state.data.googleDiagnostico && state.data.googleDiagnostico.website);
    const pages = [{ kind: 'listing' }];
    if (!websiteKnown) pages.push({ kind: 'website' });
    return pages;
}

function defaultValidado(mapsId) {
    if (mapsId === 'nao') return 'na';
    if (mapsId === 'sim_acesso') return 'sim';
    return 'nao';
}

function defaultPrioridade(mapsId, websiteId) {
    const hasSite = websiteId === 'sim_fraco' || websiteId === 'sim_ok';
    if (mapsId === 'sim_acesso' && hasSite) return 'google';
    if (hasSite) return 'os_dois';
    if (mapsId === 'nao' || mapsId === 'sim_sem_dono') return 'os_dois';
    return 'google';
}

function applySuggestion(diag) {
    if (!diag.prioridade) {
        diag.prioridade = defaultPrioridade(diag.maps, diag.website);
    }
    if (!diag.validado) {
        diag.validado = defaultValidado(diag.maps);
    }
    diag.pacoteSugerido = suggestPackage(diag);
}

function isSubstepValid(state) {
    const d = ensureDiag(state);
    const page = pagesFor(state)[currentSubstep(state)];
    if (!page) return false;
    if (page.kind === 'listing') return Boolean(d.maps);
    if (page.kind === 'website') return Boolean(d.website);
    return false;
}

function isValid(state) {
    const d = ensureDiag(state);
    return Boolean(d.maps && d.validado && d.website && d.prioridade);
}

function inferWebsite(dados) {
    const url = String(dados.website_atual || '').trim();
    if (!url) return '';
    return 'sim_fraco';
}

async function render(body, ctx) {
    const diag = ensureDiag(ctx.state);
    const dados = ctx.state.data.dados || {};
    if (!diag.website) {
        const inferred = inferWebsite(dados);
        if (inferred) diag.website = inferred;
    }
    const pages = pagesFor(ctx.state);
    const idx = Math.min(currentSubstep(ctx.state), pages.length - 1);
    const page = pages[idx];

    function persist() {
        applySuggestion(diag);
        ctx.update({ googleDiagnostico: diag });
        ctx.setValid(isSubstepValid(ctx.state));
    }

    if (page.kind === 'listing') {
        const { control } = renderAsk(body, {
            title: 'O vosso sítio',
            hint: 'Mostre o Maps deles ao lado da demo. Diga em voz alta a frase de baixo.',
            index: idx,
            total: pages.length
        });

        const script = document.createElement('p');
        script.className = 'diag-ownership-line';
        script.textContent = '«O Facebook e o Google são uma banca alugada. O site é a loja com o nome na porta — fica vosso.»';
        control.appendChild(script);

        const host = document.createElement('div');
        host.className = 'diag-listing';
        const hasMaps = Boolean(String(dados.maps_url || '').trim() || dados.nome_negocio);
        if (hasMaps) {
            mountGbpExample(host, {
                data: gbpDataFromState(ctx.state),
                clientMode: true,
                showPitch: false
            });
        } else {
            const empty = document.createElement('p');
            empty.className = 'ask-hint';
            empty.textContent = 'Ainda sem ficha no Maps — a demo já mostra como pode ficar.';
            host.appendChild(empty);
        }
        control.appendChild(host);

        askChoices(control, [
            {
                id: 'nao',
                name: 'Ainda não aparece no Maps',
                desc: 'Sem pin / ficha pública.'
            },
            {
                id: 'sim_sem_dono',
                name: 'Aparece, mas ninguém trata disto',
                desc: 'Há ficha; o dono não gere o perfil.'
            },
            {
                id: 'sim_acesso',
                name: 'Já tratam do Maps',
                desc: 'Já têm acesso ao Perfil da Empresa.'
            }
        ], {
            selected: diag.maps,
            goNext: ctx.goNext,
            onSelect: (item) => {
                diag.maps = item.id;
                diag.validado = defaultValidado(item.id);
                if (!diag.website) diag.website = inferWebsite(dados) || 'nao';
                diag.prioridade = defaultPrioridade(diag.maps, diag.website);
                persist();
            }
        });
        appendAdminHint(control, 'ficha');
        persist();
        return;
    }

    if (page.kind === 'website') {
        const { control } = renderAsk(body, {
            title: 'Têm página vossa, ou só redes?',
            hint: 'Uma pergunta. O detalhe do Google fica no admin se fizer falta.',
            index: idx,
            total: pages.length
        });
        askChoices(control, [
            { id: 'nao', name: 'Só redes / nada', desc: 'Facebook, Instagram, ou sem página.' },
            { id: 'sim_fraco', name: 'Têm, mas fraca', desc: 'Wix antigo ou pouco útil.' },
            { id: 'sim_ok', name: 'Já serve', desc: 'Foco no Google.' }
        ], {
            selected: diag.website,
            goNext: ctx.goNext,
            onSelect: (item) => {
                diag.website = item.id;
                diag.prioridade = defaultPrioridade(diag.maps, item.id);
                persist();
            }
        });
        persist();
    }
}

export const diagnosticoStep = {
    name: 'Diagnóstico',
    title: 'O vosso sítio',
    subtitle: 'Maps real + uma frase de dono. Pacotes vêm a seguir.',
    isValid,
    isSubstepValid,
    substepCount: (state) => pagesFor(state || { data: {} }).length,
    render
};
