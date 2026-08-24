const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { SCHEMA, migrate } = require('../../server/lib/digitalizept-db.js');
const {
    mergeProvider,
    sanitizeSender,
    currentProvider,
    saveProviderOverlay,
    formatSmtpFrom
} = require('../../server/lib/digitalizept-provider.js');

const ENV = {
    nome: 'YourLab',
    responsavel: 'Túlio Soares',
    artigo: 'o',
    email: 'yourlabpt@gmail.com',
    telefone: '+351936732879',
    site: 'yourlabpt.com'
};

describe('digitalizept who sends', () => {
    it('falls back to env when nothing was saved in the app', () => {
        const provider = mergeProvider(ENV, {});
        assert.equal(provider.responsavel, 'Túlio Soares');
        assert.equal(provider.artigo, 'o');
        assert.equal(provider.nome, 'YourLab');
    });

    it('lets another person send in YourLab’s name without changing the company', () => {
        const provider = mergeProvider(ENV, {
            responsavel: 'Maria Silva',
            artigo: 'a',
            telefone: '910000000',
            email: 'maria@yourlabpt.com'
        });
        assert.equal(provider.responsavel, 'Maria Silva');
        assert.equal(provider.artigo, 'a');
        assert.equal(provider.nome, 'YourLab');
        assert.equal(provider.telefone, '910000000');
        assert.equal(provider.email, 'maria@yourlabpt.com');
    });

    it('rejects a blank sender name', () => {
        const parsed = sanitizeSender({ responsavel: '  ' });
        assert.equal(parsed.error, 'Indique o nome de quem envia.');
    });

    it('persists the overlay and reads it back as the active provider', () => {
        const db = new Database(':memory:');
        db.exec(SCHEMA);
        migrate(db);
        saveProviderOverlay(db, {
            responsavel: 'João Costa',
            artigo: 'o',
            telefone: '911111111',
            email: 'joao@yourlabpt.com'
        }, '2026-08-24T12:00:00.000Z');
        const provider = currentProvider(db, ENV);
        assert.equal(provider.responsavel, 'João Costa');
        assert.equal(provider.email, 'joao@yourlabpt.com');
        db.close();
    });

    it('puts the person on the From display name, still YourLab mailbox', () => {
        const from = formatSmtpFrom(
            { responsavel: 'Maria Silva' },
            'YourLab <yourlabpt@gmail.com>'
        );
        assert.equal(from, '"Maria Silva — YourLab" <yourlabpt@gmail.com>');
    });
});
