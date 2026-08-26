import { currentSubstep, renderAsk, askChoices } from '../substep.js';
import { mountGbpExample, gbpDataFromState, GBP_SAMPLE } from '../demo/gbp-example.js';
import { suggestPackage } from '../deal/packages.js';

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

function listingLabel(text) {
    const p = document.createElement('p');
    p.className = 'diag-listing-label';
    p.textContent = text;
    return p;
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
            title: 'Tudo no mesmo sítio',
            hint: 'Pin no Maps ≠ Perfil da Empresa ≠ site próprio. O pin completo junta WhatsApp, telefone, site e redes.',
            index: idx,
            total: pages.length
        });

        const script = document.createElement('p');
        script.className = 'diag-ownership-line';
        script.textContent = '«Sem Perfil e sem site, o telefone, o WhatsApp e as redes ficam espalhados. Com o Perfil ligado ao vosso site — Instagram e Facebook no mesmo sítio — quem vos procura vê a história completa. O site é vosso: controlo, não banca alugada.»';
        control.appendChild(script);

        const host = document.createElement('div');
        host.className = 'diag-listing';

        const sampleBlock = document.createElement('div');
        sampleBlock.className = 'diag-listing-block';
        sampleBlock.appendChild(listingLabel('Exemplo — pin e ficha completos'));
        mountGbpExample(sampleBlock, {
            data: GBP_SAMPLE,
            clientMode: false,
            unifyPitch: true,
            showRealLink: true
        });
        host.appendChild(sampleBlock);

        const hasClient = Boolean(
            String(dados.maps_url || '').trim()
            || dados.nome_negocio
            || dados.telefone
            || dados.whatsapp
        );
        if (hasClient) {
            const clientBlock = document.createElement('div');
            clientBlock.className = 'diag-listing-block';
            clientBlock.appendChild(listingLabel('O vosso pin — com o que já temos'));
            mountGbpExample(clientBlock, {
                data: gbpDataFromState(ctx.state),
                clientMode: true,
                showPitch: false
            });
            host.appendChild(clientBlock);
        }

        control.appendChild(host);

        askChoices(control, [
            {
                id: 'nao',
                name: 'Sem pin no Maps',
                desc: 'Ainda não aparecem na pesquisa do Google Maps.'
            },
            {
                id: 'sim_sem_dono',
                name: 'Há pin, sem Perfil a gerir',
                desc: 'Aparecem, mas ninguém liga WhatsApp, site, serviços ou redes.'
            },
            {
                id: 'sim_acesso',
                name: 'Já têm o Perfil da Empresa',
                desc: 'Podem centralizar contacto, serviços e redes no pin.'
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
        persist();
        return;
    }

    if (page.kind === 'website') {
        const { control } = renderAsk(body, {
            title: 'Têm site próprio, ou só redes?',
            hint: 'O site fecha o círculo com o pin: uma história, um sítio, controlo vosso.',
            index: idx,
            total: pages.length
        });
        askChoices(control, [
            { id: 'nao', name: 'Só redes / nada', desc: 'Facebook, Instagram, ou sem página própria.' },
            { id: 'sim_fraco', name: 'Têm, mas fraca', desc: 'Wix antigo ou pouco útil.' },
            { id: 'sim_ok', name: 'Já serve', desc: 'Site sólido — alinhar com o Google.' }
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
    title: 'Tudo no mesmo sítio',
    subtitle: 'Pin, Perfil e site — WhatsApp, telefone e redes num só lugar.',
    isValid,
    isSubstepValid,
    substepCount: (state) => pagesFor(state || { data: {} }).length,
    render
};
