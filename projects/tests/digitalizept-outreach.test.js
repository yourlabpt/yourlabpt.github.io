const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
    fillTemplate,
    fillHtmlTemplate,
    applyOptionalBlocks,
    googleSearchUrl,
    parseFollowup,
    nextSendableWaStep,
    canMarkReply,
    buildOutreachContext,
    pickGancho,
    applyGanchoFields,
    waTextForStep,
    renderEmailHtml,
    renderEmailText,
    renderBrandedNoticeHtml,
    formatSellerPhone,
    unsubResultadoFor,
    splitProviderMorada,
    nextConfirmCallAt,
    scheduleConfirmCall,
    confirmCallState,
    formatCountdown,
    offerCopy,
    emailSubjectFor,
    textForPasso,
    subjectForPasso,
    outgoingEmail
} = require('../../server/lib/digitalizept-outreach.js');

describe('digitalizept outreach', () => {
    it('fills business and provider fields in WA and HTML', () => {
        const ctx = buildOutreachContext({
            dados: {
                nome_negocio: 'Talho da Costa',
                responsavel: 'Costa',
                cidade: 'Porto',
                morada: 'Rua de Costa Cabral 2367',
                o_que_faz: 'talho',
                email: 'costa@example.com'
            },
            provider: {
                nome: 'YourLab',
                responsavel: 'Túlio Soares',
                nif: '123456789',
                morada: 'Rua Exemplo 10, 4000-001 Porto',
                telefone: '910000000',
                email: 'tulio@yourlabpt.com',
                site: 'yourlabpt.com'
            },
            origin: 'https://yourlabpt.com',
            demoSlug: 'talho-da-costa',
            unsubToken: 'abc123',
            hour: 15
        });
        assert.equal(ctx.saudacao, 'Boa tarde');
        assert.equal(ctx.zona, 'Porto');
        assert.equal(ctx.vendedorEmail, 'tulio@yourlabpt.com');
        assert.equal(ctx.vendedorTelefone, '+351 910 000 000');
        assert.equal(ctx.vendedorTelefoneTel, '+351910000000');
        assert.equal(ctx.negocioNomeMailto, encodeURIComponent('Talho da Costa'));
        assert.match(ctx.link, /\/d\/talho-da-costa/);
        assert.equal(ctx.linkGoogle, '');
        assert.match(ctx.linkRemover, /unsub\?t=abc123/);

        const wa1 = waTextForStep(1, ctx);
        assert.match(wa1, /Sr\. Costa/);
        assert.match(wa1, /Talho da Costa/);
        assert.match(wa1, /aqui de Porto/);
        assert.match(wa1, /Vimos-vos no Google Maps/);
        assert.match(wa1, /Unir isto num só sítio/);
        assert.doesNotMatch(wa1, /Quando alguém vos recomenda/);
        assert.doesNotMatch(wa1, /2026/);
        assert.match(wa1, /São exemplos/);
        assert.match(wa1, /ao vosso lado/);
        assert.doesNotMatch(wa1, /Tratamos de tudo/);
        assert.doesNotMatch(wa1, /café do Zé/);

        // No amounts on a cold lead: the seller has to turn prices on.
        const wa2 = waTextForStep(2, ctx);
        assert.doesNotMatch(wa2, /490 euros/);
        assert.match(waTextForStep(2, { ...ctx, ...offerCopy({ includePrices: true }, 'pt') }), /490 euros/);
        assert.match(wa2, /história toda/);
        assert.doesNotMatch(wa2, /demonstrador/);
        assert.doesNotMatch(wa2, /google\.com\/maps/);

        const r1 = textForPasso('R1', ctx);
        assert.match(r1, /ao vosso lado/);
        assert.match(r1, /Talho da Costa/);
        assert.doesNotMatch(r1, /€/);
        assert.doesNotMatch(r1, /conhece/);
        assert.doesNotMatch(r1, /IVA/);

        const html = fillHtmlTemplate(
            'Olá {{negocioNome}} em {{zona}} <a href="{{link}}">x</a>',
            ctx
        );
        assert.match(html, /Talho da Costa/);
        assert.match(html, /href="https:\/\/yourlabpt.com\/d\/talho-da-costa"/);
    });

    it('strips empty Google/site image blocks', () => {
        const html = applyOptionalBlocks(
            'A<!--IF_IMAGEM_GOOGLE-->IMG<!--/IF_IMAGEM_GOOGLE-->B<!--IF_IMAGEM_SITE-->SITE<!--/IF_IMAGEM_SITE-->C',
            { imagemGoogle: '', imagemSite: 'https://x/s.png' }
        );
        assert.equal(html, 'ABSITEC');
    });

    it('unlocks WA 2 only after a reply to 1', () => {
        const f = parseFollowup({ waStep: 1, wa1SentAt: 'x' });
        assert.equal(nextSendableWaStep(f), 0);
        assert.equal(canMarkReply(f, 1), true);
        f.replied1At = 'y';
        assert.equal(nextSendableWaStep(f), 2);
        f.waStep = 2;
        f.wa2SentAt = 'z';
        f.replied2At = 'w';
        assert.equal(nextSendableWaStep(f), 3);
    });

    it('schedules the confirmation call two weekdays later at 10:00 Lisbon', () => {
        const friday = nextConfirmCallAt('2026-08-19T14:00:00.000Z');
        assert.equal(friday, '2026-08-21T09:00:00.000Z');
        const monday = nextConfirmCallAt('2026-08-21T12:00:00.000Z');
        assert.equal(monday, '2026-08-24T09:00:00.000Z');
        const again = scheduleConfirmCall({ waStep: 1, callDueAt: friday }, '2026-08-22T12:00:00.000Z');
        assert.equal(again.callDueAt, friday);
        const first = scheduleConfirmCall({ waStep: 1 }, '2026-08-19T14:00:00.000Z');
        assert.equal(first.callDueAt, friday);
        const waiting = confirmCallState(first, new Date('2026-08-20T10:00:00.000Z'));
        assert.equal(waiting.status, 'waiting');
        assert.ok(waiting.remainingMs > 0);
        assert.match(formatCountdown(waiting.remainingMs), /\d+h /);
        const due = confirmCallState(first, new Date('2026-08-21T10:00:00.000Z'));
        assert.equal(due.status, 'due');
        const done = confirmCallState({ callDueAt: friday, callDoneAt: 'x' });
        assert.equal(done.status, 'done');
    });

    it('parses YourLab morada into CP and city', () => {
        const parts = splitProviderMorada('Rua Nova 12, 4050-001 Porto');
        assert.equal(parts.cp, '4050-001');
        assert.equal(parts.city, 'Porto');
    });

    it('builds a maps search url from the business', () => {
        const url = googleSearchUrl('Talho da Costa', 'talho', 'Porto', 'Rua de Costa Cabral 2367');
        assert.match(url, /query=/);
        assert.match(url, /Costa/);
    });

    it('renders the stored HTML template with company NIF', () => {
        const ctx = buildOutreachContext({
            dados: { nome_negocio: 'Loja X', cidade: 'Braga', o_que_faz: 'loja' },
            provider: { nome: 'YourLab', nif: '509000000', morada: 'Rua A 1, 4700-000 Braga' },
            origin: 'https://yourlabpt.com',
            demoSlug: 'loja-x',
            unsubToken: 'tok'
        });
        const html = renderEmailHtml(ctx);
        assert.match(html, /Loja X/);
        assert.match(html, /509000000/);
        assert.match(html, /yourlabpt.com\/d\/loja-x/);
        assert.match(html, /Vimos-vos no Google Maps/);
        assert.match(html, /Unir isto num só sítio/);
        assert.doesNotMatch(html, /Quando alguém vos recomenda/);
        assert.match(html, /São exemplos/);
        assert.match(html, /Feito à medida/);
        assert.match(html, /sou o/);
        assert.match(html, /Digitalize a sua empresa/);
        assert.doesNotMatch(html, /\{\{gancho/);
        assert.match(html, /mailto:yourlabpt@gmail.com\?subject=Gostei%20-%20Loja%20X/);
        assert.match(html, /body=Gostei%20do%20que%20vi\.%20Podemos%20marcar%20uma%20conversa%3F/);
        assert.match(html, /Marcar conversa/);
        assert.match(html, /Abrir o exemplo/);
        assert.match(html, /\+351 936 732 879/);
        assert.match(html, /tel:\+351936732879/);
        assert.doesNotMatch(html, /google\.com\/maps/);
        assert.doesNotMatch(html, /\{\{\w+\}\}/);
        assert.doesNotMatch(html, /Ver no Google/);
        assert.doesNotMatch(html, /IF_IMAGEM_GOOGLE/);
        assert.doesNotMatch(html, /<!--IF_IMAGEM_SITE-->/);
        assert.doesNotMatch(html, /não volto a incomodar/);
        const text = renderEmailText(ctx);
        assert.match(text, /yourlabpt.com\/d\/loja-x/);
        assert.match(text, /marcamos uma conversa/);
        assert.doesNotMatch(text, /google\.com\/maps/);
    });

    it('keeps fillTemplate replacements literal', () => {
        assert.equal(fillTemplate('Oi {{nome}}', { nome: 'Ana' }), 'Oi Ana');
        assert.equal(fillTemplate('Oi {{nome}}', {}), 'Oi ');
    });

    it('formats the seller mobile for display and tel links', () => {
        assert.deepEqual(formatSellerPhone('+351936732879'), {
            display: '+351 936 732 879',
            tel: '+351936732879'
        });
        assert.deepEqual(formatSellerPhone(''), {
            display: '+351 936 732 879',
            tel: '+351936732879'
        });
        assert.equal(unsubResultadoFor(''), 'sem_interesse');
        assert.equal(unsubResultadoFor('futuro'), 'sem_interesse');
        assert.equal(unsubResultadoFor('digitalizado'), 'digitalizado');
    });

    it('renders the branded unsubscribe page with the email chrome', () => {
        const ctx = buildOutreachContext({
            dados: { nome_negocio: 'Talho da Costa' },
            provider: { nome: 'YourLab', nif: '509000000', morada: 'Rua A 1, 4700-000 Braga' }
        });
        const html = renderBrandedNoticeHtml({
            ...ctx,
            heading: 'Já não voltamos a incomodar.',
            noticeLine: 'O pedido da Talho da Costa ficou registado.',
            footerNote: 'Já não enviamos emails para este contacto.'
        });
        assert.match(html, /Your/);
        assert.match(html, /lab\./);
        assert.match(html, /Digitalize a sua empresa/);
        assert.match(html, /Já não voltamos a incomodar/);
        assert.match(html, /Talho da Costa/);
        assert.match(html, /509000000/);
        assert.match(html, /Já não enviamos emails para este contacto/);
        assert.doesNotMatch(html, /\{\{\w+\}\}/);
    });

    it('composes digital-gap openings from selected falhas', () => {
        const {
            composeAbertura,
            suggestFalhas,
            applyGanchoFields,
            parseFollowup,
            aberturaEmFalta
        } = require('../../server/lib/digitalizept-outreach.js');
        const one = composeAbertura({ falhas: ['maps_sem_whatsapp'] });
        assert.equal(one.id, 'maps_sem_whatsapp');
        assert.match(one.ganchoTexto, /não há WhatsApp/);
        assert.match(one.ganchoTexto, /Unir isto num só sítio/);
        assert.equal(one.factos.length, 1);

        const several = composeAbertura({
            falhas: ['maps_sem_whatsapp', 'maps_telefone_sem_wa', 'maps_sem_site', 'maps_sem_email', 'site_fraco']
        });
        assert.equal(several.factos.length, 3);
        assert.match(several.ganchoTexto, /está o telefone/);
        assert.doesNotMatch(several.ganchoTexto, /Estão no Maps, mas não há WhatsApp/);

        const scattered = composeAbertura({
            falhas: ['info_desencontrada', 'redes_desligadas_maps', 'maps_sem_site']
        });
        assert.equal(scattered.factos.length, 2);
        assert.match(scattered.ganchoTexto, /não dizem a mesma coisa/);
        assert.doesNotMatch(scattered.ganchoTexto, /não os liga/);

        const {
            listGrupos,
            listCombinacoes
        } = require('../../server/lib/digitalizept-outreach.js');
        const grupos = listGrupos('pt');
        assert.ok(grupos.some((g) => g.id === 'pin' && /Pin no Maps/.test(g.label)));
        const combos = listCombinacoes('pt');
        const central = combos.find((c) => c.id === 'centralizacao');
        assert.ok(central);
        assert.deepEqual(central.falhas, ['info_desencontrada', 'maps_sem_site', 'maps_sem_whatsapp']);
        assert.match(central.chip, /Centralizar/);

        const suggested = suggestFalhas({
            telefone: '910000000',
            website: 'nao'
        });
        assert.ok(suggested.includes('maps_telefone_sem_wa'));
        assert.ok(suggested.includes('maps_sem_site'));
        assert.ok(!suggested.includes('maps_sem_whatsapp'));

        const stored = applyGanchoFields(parseFollowup({}), {
            ganchoId: 'C',
            siteVelho: true
        });
        assert.deepEqual(stored.falhas, ['site_fraco']);
        assert.equal(stored.ganchoId, 'site_fraco');
        assert.equal(stored.siteVelho, true);

        const severalSaved = applyGanchoFields(parseFollowup({ ganchoId: 'C' }), {
            falhas: ['maps_sem_site', 'site_fraco', 'maps_sem_whatsapp']
        });
        assert.deepEqual(severalSaved.falhas, ['maps_sem_site', 'site_fraco', 'maps_sem_whatsapp']);
        assert.equal(severalSaved.ganchoId, 'maps_sem_site');

        const migrated = parseFollowup({ ganchoId: 'B' });
        assert.ok(migrated.falhas.includes('redes_desligadas_maps'));
        assert.ok(migrated.falhas.includes('maps_sem_site'));
        assert.equal(aberturaEmFalta('EMAIL1', {}), 'Marca em cima o que vamos resolver.');
        assert.equal(aberturaEmFalta('EMAIL1', migrated), '');
        assert.equal(aberturaEmFalta('WA2', {}), '');
    });

    it('fills the chosen falhas into HTML and WhatsApp 1', () => {
        const ctx = buildOutreachContext({
            dados: { nome_negocio: 'Farmácia Sol', cidade: 'Braga', o_que_faz: 'farmácia' },
            provider: { nome: 'YourLab', nif: '509000000', morada: 'Rua A 1, 4700-000 Braga' },
            origin: 'https://yourlabpt.com',
            demoSlug: 'farmacia-sol',
            falhas: ['redes_desligadas_maps', 'maps_sem_site'],
            sinais: { website: 'nao', instagram: '@farmaciasol' }
        });
        assert.equal(ctx.ganchoId, 'redes_desligadas_maps');
        assert.match(ctx.ganchoTitulo, /Vimos-vos no Google Maps/);
        assert.match(ctx.ganchoTexto, /não os liga/);
        assert.match(ctx.ganchoTexto, /não há um site vosso/);
        assert.doesNotMatch(ctx.ganchoTexto, /Facebook não é nosso/);
        const html = renderEmailHtml(ctx);
        assert.match(html, /perfil Google completo|Perfil da Empresa|pin no Maps|tudo num só sítio/);
        assert.match(html, /não há um site vosso/);
        assert.match(html, />Ligar</);
        assert.match(html, />WhatsApp</);
        assert.match(html, />Website</);
        assert.match(html, />Instagram</);
        assert.match(html, />Facebook</);
        assert.match(html, />Direções</);
        assert.match(html, /Website \(com Instagram e Facebook ligados\)/);
        assert.doesNotMatch(html, /\{\{gancho/);
        assert.doesNotMatch(html, /\{\{fichaGoogleAcoesHtml\}\}/);
        assert.doesNotMatch(html, /Quando alguém vos recomenda/);
        const wa1 = waTextForStep(1, ctx);
        assert.match(wa1, /Vimos-vos no Google Maps/);
        assert.match(wa1, /marcamos cinco minutos/);
        assert.match(wa1, /ao vosso lado/);
        assert.doesNotMatch(wa1, /não volto a incomodar/);
        assert.doesNotMatch(wa1, /Facebook não é nosso/);
        const text = renderEmailText(ctx);
        assert.match(text, /Unir isto num só sítio/);
        assert.doesNotMatch(text, /Facebook não é nosso/);

        const eCtx = buildOutreachContext({
            dados: { nome_negocio: 'Talho da Costa', cidade: 'Porto' },
            provider: { nome: 'YourLab' },
            falhas: ['ficha_errada'],
            sinais: { problemaFicha: 'que fecham às 18h' }
        });
        assert.equal(eCtx.ganchoId, 'ficha_errada');
        assert.match(eCtx.ganchoTexto, /que fecham às 18h/);
        assert.doesNotMatch(renderEmailHtml(eCtx), /\{\{problemaFicha\}\}/);
    });

    it('renders English WhatsApp and HTML email when lang is en', () => {
        const stored = applyGanchoFields(parseFollowup({}), { lang: 'en' });
        assert.equal(stored.lang, 'en');
        assert.equal(parseFollowup({}).lang, 'pt');

        const ctx = buildOutreachContext({
            dados: {
                nome_negocio: 'Talho da Costa',
                responsavel: 'Costa',
                cidade: 'Porto',
                o_que_faz: 'butcher'
            },
            provider: {
                nome: 'YourLab',
                responsavel: 'Túlio Soares',
                nif: '509000000',
                morada: 'Rua A 1, 4700-000 Braga'
            },
            origin: 'https://yourlabpt.com',
            demoSlug: 'talho-da-costa',
            followupDia: 'amanhã',
            visita: 'tarde',
            hour: 10,
            lang: 'en'
        });
        assert.equal(ctx.lang, 'en');
        assert.equal(ctx.saudacao, 'Good morning');
        assert.equal(ctx.visitaQuando, 'this afternoon');
        assert.equal(ctx.followupDia, 'tomorrow');
        assert.doesNotMatch(ctx.clienteNome, /Sr\./);

        const wa1 = waTextForStep(1, ctx);
        assert.doesNotMatch(wa1, /Sr\./);
        assert.match(wa1, /I'm Túlio Soares/);
        assert.match(wa1, /We found you on Google Maps/);

        const html = renderEmailHtml(ctx);
        assert.match(html, /lang="en"/);
        assert.match(html, /I made an example/);
        assert.match(html, /Open the example/);
        assert.match(html, /Book a meeting/);
        assert.match(html, /Digitize your business/);
        assert.match(html, />Call</);
        assert.match(html, />WhatsApp</);
        assert.match(html, />Website</);
        assert.match(html, />Instagram</);
        assert.match(html, />Facebook</);
        assert.match(html, />Directions</);
        assert.match(html, /everything in one place/);
        assert.doesNotMatch(html, /Sr\./);
        assert.doesNotMatch(html, /Digitalize a sua empresa/);
        assert.doesNotMatch(html, /Abrir o exemplo/);
        assert.doesNotMatch(html, /Yes, let's talk/);
        assert.doesNotMatch(html, /\{\{\w+\}\}/);
        const text = renderEmailText(ctx);
        assert.match(text, /book a short meeting/);
        assert.match(text, /REMOVE/);
        assert.doesNotMatch(text, /VAT not included/);
        assert.match(
            renderEmailText({ ...ctx, ...offerCopy({ includePrices: true }, 'en') }),
            /VAT not included/
        );
    });

    it('uses sou a when the sender is configured that way', () => {
        const ctx = buildOutreachContext({
            dados: { nome_negocio: 'Loja X', responsavel: 'Costa', cidade: 'Porto' },
            provider: { nome: 'YourLab', responsavel: 'Maria Silva', artigo: 'a' },
            hour: 15
        });
        assert.equal(ctx.vendedorNome, 'Maria Silva');
        assert.equal(ctx.vendedorArtigo, 'a');
        assert.match(waTextForStep(1, ctx), /sou a Maria Silva, da YourLab/);
        assert.match(renderEmailHtml(ctx), /sou a Maria Silva/);
    });

    it('can send the demo email without prices, or with a campaign on that lead', () => {
        const base = {
            dados: { nome_negocio: 'Talho da Costa', cidade: 'Porto' },
            provider: { nome: 'YourLab', nif: '509000000', morada: 'Rua A 1, 4700-000 Braga' },
            origin: 'https://yourlabpt.com',
            demoSlug: 'talho-da-costa'
        };
        const withPrices = buildOutreachContext({ ...base, offer: { includePrices: true } });
        assert.equal(withPrices.showPrecos, true);
        assert.equal(withPrices.precoTudo, 490);
        assert.match(renderEmailHtml(withPrices), /490/);
        assert.match(waTextForStep(2, withPrices), /490 euros/);
        assert.match(renderEmailText(withPrices), /490 euros tudo/);
        assert.doesNotMatch(renderEmailHtml(withPrices), /IF_PRECOS/);
        assert.doesNotMatch(renderEmailHtml(withPrices), /IF_CAMPANHA/);

        // Cold is the default, so an empty offer already means no amounts.
        const noPrices = buildOutreachContext(base);
        assert.equal(noPrices.showPrecos, false);
        assert.doesNotMatch(renderEmailHtml(noPrices), /490/);
        assert.doesNotMatch(waTextForStep(2, noPrices), /490 euros/);
        assert.doesNotMatch(renderEmailText(noPrices), /490 euros/);
        assert.match(renderEmailText(noPrices), /marcamos uma conversa/);

        const pctOnly = buildOutreachContext({
            ...base,
            offer: { campanhaPct: 15, campanhaShowPrices: false }
        });
        assert.equal(pctOnly.showCampanha, true);
        assert.equal(pctOnly.showPrecos, false);
        assert.match(renderEmailHtml(pctOnly), /15% de desconto nesta conversa/);
        assert.doesNotMatch(renderEmailHtml(pctOnly), /490/);
        assert.match(renderEmailText(pctOnly), /Campanha de 15%/);
        assert.match(waTextForStep(2, pctOnly), /Campanha: 15%/);

        const withValues = buildOutreachContext({
            ...base,
            offer: { includePrices: true, campanhaPct: 15, campanhaShowPrices: true }
        });
        assert.equal(withValues.precoTudo, 417);
        assert.equal(withValues.precoPagina, 162);
        assert.equal(withValues.precoGoogle, 77);
        assert.equal(withValues.showPrecoAntigo, true);
        const html = renderEmailHtml(withValues);
        assert.match(html, /417/);
        assert.match(html, /15% de desconto/);
        assert.match(html, /490/);
        assert.match(waTextForStep(2, withValues), /417 euros/);

        const stored = applyGanchoFields(parseFollowup({}), {
            includePrices: false,
            campanhaPct: 10,
            campanhaShowPrices: false
        });
        assert.equal(stored.includePrices, false);
        assert.equal(stored.campanhaPct, 10);
        assert.equal(stored.campanhaShowPrices, false);
    });

    it('keeps the EMAIL1 HTML template when the seller edits the letter in Controlo', () => {
        const ctx = buildOutreachContext({
            dados: { nome_negocio: 'Talho da Costa', cidade: 'Porto', email: 'costa@example.com' },
            provider: { nome: 'YourLab', nif: '509000000', morada: 'Rua A 1, 4700-000 Braga' },
            origin: 'https://yourlabpt.com',
            demoSlug: 'talho-da-costa'
        });
        const canned = outgoingEmail('EMAIL1', { ctx });
        assert.equal(canned.edited, false);
        assert.match(canned.html, /Marcar conversa/);
        assert.match(canned.html, /Digitalize a sua empresa/);
        assert.doesNotMatch(textForPasso('EMAIL1', ctx), /https:\/\/yourlabpt.com\/d\/talho-da-costa/);

        const edited = outgoingEmail('EMAIL1', {
            ctx,
            text: 'Olá Costa,\n\nMudei o texto à mão. Vê a demo quando puderes.\n\nhttps://yourlabpt.com/d/talho-da-costa'
        });
        assert.equal(edited.edited, true);
        assert.match(edited.html, /Mudei o texto à mão/);
        // Edited letter must not re-embed the demo URL; the HTML template keeps Website + Abrir o exemplo.
        assert.match(edited.html, /CARTA EDITADA NO CONTROLO[\s\S]*Vê a demo quando puderes\.<\/p>\s*<\/td>/);
        assert.doesNotMatch(
            edited.html,
            /CARTA EDITADA NO CONTROLO[\s\S]*href="https:\/\/yourlabpt.com\/d\/talho-da-costa"[\s\S]*01 · GOOGLE/
        );
        assert.match(edited.html, /Marcar conversa/);
        assert.match(edited.html, /Digitalize a sua empresa/);
        assert.match(edited.html, /Abrir o exemplo/);
        assert.match(edited.html, /href="https:\/\/yourlabpt.com\/d\/talho-da-costa"/);
        assert.equal(edited.text.includes('https://yourlabpt.com/d/talho-da-costa'), false);
        assert.match(edited.textPlain, /https:\/\/yourlabpt.com\/d\/talho-da-costa/);
        assert.equal(
            (edited.textPlain.match(/\/d\/talho-da-costa/g) || []).length,
            1
        );
        assert.doesNotMatch(edited.html, /padding:24px;background:#fff/);
        assert.equal(
            textForPasso('EMAIL1', ctx, { email1: edited.text }),
            edited.text
        );

        const withLogo = buildOutreachContext({
            dados: { nome_negocio: 'Talho da Costa', cidade: 'Porto' },
            provider: { nome: 'YourLab' },
            origin: 'https://yourlabpt.com',
            demoSlug: 'talho-da-costa',
            identidade: {
                logo: { tipo: 'upload', dataUrl: 'data:image/png;base64,aaa' },
                fotos: ['data:image/jpeg;base64,bbb', 'data:image/jpeg;base64,ccc']
            }
        });
        assert.match(withLogo.linkFichaLogo, /\/d\/talho-da-costa\/logo/);
        assert.match(withLogo.fichaGoogleAvatarHtml, /\/d\/talho-da-costa\/logo/);
        assert.match(withLogo.fichaGoogleFotosHtml, /\/d\/talho-da-costa\/photo\/0/);
        assert.match(renderEmailHtml(withLogo), /\/d\/talho-da-costa\/logo/);
    });
});
