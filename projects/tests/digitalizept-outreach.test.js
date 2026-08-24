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
    formatCountdown
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
        assert.match(wa1, /Quando alguém vos recomenda/);
        assert.doesNotMatch(wa1, /2026/);
        assert.match(wa1, /São exemplos/);
        assert.doesNotMatch(wa1, /café do Zé/);

        const wa2 = waTextForStep(2, ctx);
        assert.match(wa2, /490 euros/);
        assert.match(wa2, /história toda/);
        assert.doesNotMatch(wa2, /demonstrador/);
        assert.doesNotMatch(wa2, /google\.com\/maps/);

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
        assert.match(html, /Quando alguém vos recomenda/);
        assert.match(html, /São exemplos/);
        assert.match(html, /Feito à medida/);
        assert.match(html, /sou o/);
        assert.match(html, /Digitalize a sua empresa/);
        assert.doesNotMatch(html, /\{\{gancho/);
        assert.match(html, /mailto:yourlabpt@gmail.com\?subject=Gostei%20-%20Loja%20X/);
        assert.match(html, /body=Gostei%20do%20que%20vi\.%20Podemos%20falar%3F/);
        assert.match(html, /Sim, vamos falar/);
        assert.match(html, /Abrir o exemplo/);
        assert.match(html, /\+351 936 732 879/);
        assert.match(html, /tel:\+351936732879/);
        assert.doesNotMatch(html, /google\.com\/maps/);
        assert.doesNotMatch(html, /\{\{\w+\}\}/);
        assert.doesNotMatch(html, /Ver no Google/);
        assert.doesNotMatch(html, /IF_IMAGEM_GOOGLE/);
        assert.doesNotMatch(html, /<!--IF_IMAGEM_SITE-->/);
        const text = renderEmailText(ctx);
        assert.match(text, /yourlabpt.com\/d\/loja-x/);
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

    it('picks outreach hooks by rule order, override, and E fallback', () => {
        assert.equal(pickGancho({ sinais: { sinaisDeMovimento: true } }).id, 'D');
        assert.equal(pickGancho({
            sinais: {
                sinaisDeMovimento: true,
                fichaComErro: true,
                problemaFicha: 'que fecham às 18h',
                website: 'sim_fraco',
                instagram: '@loja'
            }
        }).id, 'D');
        assert.equal(pickGancho({
            sinais: { fichaComErro: true, problemaFicha: 'que fecham às 18h' }
        }).id, 'E');
        assert.equal(pickGancho({
            sinais: { website: 'sim_fraco' }
        }).id, 'C');
        assert.equal(pickGancho({
            sinais: { siteVelho: true, website: 'sim_ok' }
        }).id, 'C');
        assert.equal(pickGancho({
            sinais: { website: 'nao', instagram: '@talho' }
        }).id, 'B');
        assert.equal(pickGancho({ sinais: {} }).id, 'A');
        assert.equal(pickGancho({
            override: 'B',
            sinais: { sinaisDeMovimento: true }
        }).id, 'B');
        assert.equal(pickGancho({
            override: 'E',
            sinais: { fichaComErro: true }
        }).id, 'A');
        assert.equal(pickGancho({
            sinais: { fichaComErro: true }
        }).id, 'A');
        const stored = applyGanchoFields(parseFollowup({}), {
            ganchoId: 'C',
            siteVelho: true
        });
        assert.equal(stored.ganchoId, 'C');
        assert.equal(stored.siteVelho, true);
    });

    it('fills the chosen hook into HTML and WhatsApp 1', () => {
        const ctx = buildOutreachContext({
            dados: { nome_negocio: 'Farmácia Sol', cidade: 'Braga', o_que_faz: 'farmácia' },
            provider: { nome: 'YourLab', nif: '509000000', morada: 'Rua A 1, 4700-000 Braga' },
            origin: 'https://yourlabpt.com',
            demoSlug: 'farmacia-sol',
            ganchoId: 'B',
            sinais: { website: 'nao', instagram: '@farmaciasol' }
        });
        assert.equal(ctx.ganchoId, 'B');
        assert.match(ctx.ganchoTitulo, /Instagram é da Meta/);
        assert.match(ctx.ganchoTexto, /farmácia em Braga/);
        assert.doesNotMatch(ctx.ganchoTexto, /não estão na internet/);
        const html = renderEmailHtml(ctx);
        assert.match(html, /Instagram é da Meta/);
        assert.match(html, /farmácia em Braga/);
        assert.doesNotMatch(html, /\{\{gancho/);
        assert.doesNotMatch(html, /2026 e a vossa história/);
        const wa1 = waTextForStep(1, ctx);
        assert.match(wa1, /Instagram é da Meta/);
        assert.doesNotMatch(wa1, /2026/);
        const text = renderEmailText(ctx);
        assert.match(text, /Instagram é da Meta/);
        assert.doesNotMatch(text, /2026 e a vossa história/);

        const eCtx = buildOutreachContext({
            dados: { nome_negocio: 'Talho da Costa', cidade: 'Porto' },
            provider: { nome: 'YourLab' },
            ganchoId: 'E',
            sinais: { problemaFicha: 'que fecham às 18h' }
        });
        assert.equal(eCtx.ganchoId, 'E');
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
        assert.match(wa1, /When someone recommends you/);

        const html = renderEmailHtml(ctx);
        assert.match(html, /lang="en"/);
        assert.match(html, /I made an example/);
        assert.match(html, /Open the example/);
        assert.match(html, /Yes, let's talk/);
        assert.match(html, /Digitize your business/);
        assert.doesNotMatch(html, /Sr\./);
        assert.doesNotMatch(html, /Digitalize a sua empresa/);
        assert.doesNotMatch(html, /Abrir o exemplo/);
        assert.doesNotMatch(html, /\{\{\w+\}\}/);
        const text = renderEmailText(ctx);
        assert.match(text, /VAT not included/);
        assert.match(text, /REMOVE/);
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
});
