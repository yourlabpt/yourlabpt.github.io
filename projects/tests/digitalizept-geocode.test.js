const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
    scoreHit,
    pickBestHit,
    buildAddressQuery
} = require('../../server/lib/digitalizept-geocode.js');

describe('digitalizept geocode ranking', () => {
    it('builds query with street, city and Portugal', () => {
        assert.equal(
            buildAddressQuery('Rua Augusta 12', 'Lisboa'),
            'Rua Augusta 12, Lisboa, Portugal'
        );
        assert.equal(
            buildAddressQuery('Rua Augusta 12', 'Lisboa', 'Café Central'),
            'Café Central, Rua Augusta 12, Lisboa, Portugal'
        );
    });

    it('prefers a house/building hit over a city centroid', () => {
        const city = {
            lat: '38.72',
            lon: '-9.14',
            type: 'city',
            class: 'place',
            importance: 0.9,
            display_name: 'Lisboa, Portugal'
        };
        const house = {
            lat: '38.711',
            lon: '-9.137',
            type: 'house',
            class: 'place',
            importance: 0.4,
            display_name: 'Rua Augusta 12, Lisboa, Portugal'
        };
        const best = pickBestHit([city, house], {
            morada: 'Rua Augusta 12',
            cidade: 'Lisboa'
        });
        assert.equal(best.type, 'house');
        assert.ok(scoreHit(house, { morada: 'Rua Augusta 12', cidade: 'Lisboa' })
            > scoreHit(city, { morada: 'Rua Augusta 12', cidade: 'Lisboa' }));
    });

    it('prefers shop/amenity over administrative boundary', () => {
        const boundary = {
            lat: '41.15',
            lon: '-8.61',
            type: 'administrative',
            class: 'boundary',
            importance: 0.8,
            display_name: 'Porto, Portugal'
        };
        const shop = {
            lat: '41.149',
            lon: '-8.610',
            type: 'cafe',
            class: 'amenity',
            importance: 0.3,
            display_name: 'Café do Zé, Rua de Santa Catarina, Porto, Portugal'
        };
        const best = pickBestHit([boundary, shop], {
            morada: 'Rua de Santa Catarina',
            cidade: 'Porto'
        });
        assert.equal(best.class, 'amenity');
    });

    it('returns null for empty hits', () => {
        assert.equal(pickBestHit([]), null);
        assert.equal(pickBestHit(null), null);
    });
});
