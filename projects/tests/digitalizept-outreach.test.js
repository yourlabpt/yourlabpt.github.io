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
    waTextForStep,
    renderEmailHtml,
    renderEmailText,
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
        assert.equal(ctx.negocioNomeMailto, encodeURIComponent('Talho da Costa'));
        assert.match(ctx.link, /\/d\/talho-da-costa/);
        assert.equal(ctx.linkGoogle, '');
        assert.match(ctx.linkRemover, /unsub\?t=abc123/);

        const wa1 = waTextForStep(1, ctx);
        assert.match(wa1, /Sr\. Costa/);
        assert.match(wa1, /Talho da Costa/);
        assert.match(wa1, /aqui de Porto/);

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
        assert.match(html, /São exemplos/);
        assert.match(html, /sou o/);
        assert.match(html, /Digitalize a sua empresa/);
        assert.match(html, /mailto:yourlabpt@gmail.com\?subject=Gostei%20-%20Loja%20X/);
        assert.match(html, /body=Gostei%20do%20que%20vi\.%20Podemos%20falar%3F/);
        assert.match(html, /Sim, vamos falar/);
        assert.match(html, /Abrir o exemplo/);
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
});
