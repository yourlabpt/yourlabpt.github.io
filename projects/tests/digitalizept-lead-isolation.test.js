const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const {
    sameBusinessName,
    reusableLeadId,
    allocateDemoSlug
} = require('../../server/lib/digitalizept-business-identity.js');

const appDir = path.join(__dirname, '..', '..', 'digitalizept', 'js');

function fakeDb(rows = []) {
    return {
        prepare(sql) {
            return {
                get(slug) {
                    if (!String(sql).includes('demo_slug')) return undefined;
                    return rows.find((row) => row.demo_slug === slug);
                }
            };
        }
    };
}

describe('digitalizept lead isolation', () => {
    it('treats a typo-level rename as the same shop', () => {
        assert.equal(sameBusinessName('O Escondidinho', 'Escondidinho Barreiro'), true);
        assert.equal(sameBusinessName('Escondidinho', 'escondidinho barreiro'), true);
    });

    it('does not treat two restaurants in the same city as one shop', () => {
        assert.equal(
            sameBusinessName('Restaurante Thai Golden', 'Escondidinho Barreiro', { ignore: ['Barreiro'] }),
            false
        );
        assert.equal(
            sameBusinessName('Thai Barreiro', 'Escondidinho Barreiro', { ignore: ['Barreiro'] }),
            false
        );
    });

    it('refuses to reuse another lead when the name is a different business', () => {
        const thai = { id: 'lead-thai', nome: 'Restaurante Thai Golden' };
        assert.equal(reusableLeadId(thai, 'Escondidinho Barreiro', 'Barreiro'), '');
        assert.equal(reusableLeadId(thai, 'Thai Golden', 'Lisboa'), 'lead-thai');
        assert.equal(reusableLeadId(null, 'Escondidinho', 'Barreiro'), '');
        assert.equal(reusableLeadId({ id: 'lead-stub', nome: '' }, 'Escondidinho Barreiro', 'Barreiro'), 'lead-stub');
    });

    it('keeps the existing demo slug only for the same shop', () => {
        const db = fakeDb([{ id: 'lead-thai', demo_slug: 'thai-golden-aaa111' }]);
        const makeSlug = () => 'escondidinho-bbb222';
        const reused = allocateDemoSlug(db, {
            nome: 'Thai Golden',
            existingSlug: 'thai-golden-aaa111',
            leadId: 'lead-thai',
            existingNome: 'Restaurante Thai Golden',
            cidade: 'Lisboa',
            makeSlug
        });
        assert.equal(reused, 'thai-golden-aaa111');

        const fresh = allocateDemoSlug(db, {
            nome: 'Escondidinho Barreiro',
            existingSlug: 'thai-golden-aaa111',
            leadId: 'lead-new',
            existingNome: 'Restaurante Thai Golden',
            cidade: 'Barreiro',
            makeSlug
        });
        assert.equal(fresh, 'escondidinho-bbb222');
        assert.notEqual(fresh, 'thai-golden-aaa111');
    });

    it('never writes a slug already owned by another lead', () => {
        const db = fakeDb([{ id: 'lead-thai', demo_slug: 'negocio-taken' }]);
        let n = 0;
        const slug = allocateDemoSlug(db, {
            nome: 'Escondidinho',
            existingSlug: '',
            leadId: 'lead-new',
            existingNome: '',
            makeSlug: () => (n++ === 0 ? 'negocio-taken' : 'escondidinho-ok')
        });
        assert.equal(slug, 'escondidinho-ok');
    });
});

describe('digitalizept client detach on name change', () => {
    it('drops the previous leadId when the shop name is a different business', async () => {
        const { detachLeadIfBusinessChanged } = await import(
            pathToFileURL(path.join(appDir, 'demo', 'business-identity.js')).href
        );
        const state = {
            data: {
                leadId: 'lead-thai',
                leadBoundNome: 'Restaurante Thai Golden',
                demoUrl: '/d/thai-golden-aaa111',
                dados: { nome_negocio: 'Escondidinho Barreiro', cidade: 'Barreiro' }
            }
        };
        assert.equal(detachLeadIfBusinessChanged(state), true);
        assert.equal(state.data.leadId, undefined);
        assert.equal(state.data.demoUrl, '');
        assert.equal(state.data.leadBoundNome, 'Escondidinho Barreiro');
    });

    it('keeps the lead when the name is still the same shop', async () => {
        const { detachLeadIfBusinessChanged } = await import(
            pathToFileURL(path.join(appDir, 'demo', 'business-identity.js')).href
        );
        const state = {
            data: {
                leadId: 'lead-esc',
                leadBoundNome: 'O Escondidinho',
                demoUrl: '/d/escondidinho-ccc333',
                dados: { nome_negocio: 'Escondidinho Barreiro', cidade: 'Barreiro' }
            }
        };
        assert.equal(detachLeadIfBusinessChanged(state), false);
        assert.equal(state.data.leadId, 'lead-esc');
        assert.equal(state.data.demoUrl, '/d/escondidinho-ccc333');
    });
});
