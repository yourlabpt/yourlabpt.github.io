const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parseMapsUrl, decodePlace } = require('../../server/lib/digitalizept-maps-url');
const { nameScore, mapBusinessType } = require('../../server/lib/digitalizept-maps-lookup');

describe('digitalizept maps url parse', () => {
    it('reads place name and @ coordinates', () => {
        const parsed = parseMapsUrl(
            'https://www.google.com/maps/place/Talho+da+Costa/@41.14961,-8.61099,17z'
        );
        assert.equal(parsed.ok, true);
        assert.equal(parsed.nome, 'Talho da Costa');
        assert.equal(parsed.lat, 41.14961);
        assert.equal(parsed.lng, -8.61099);
        assert.equal(parsed.short, false);
    });

    it('prefers the shop pin in !3d!4d over map center', () => {
        const parsed = parseMapsUrl(
            'https://www.google.com/maps/place/Cafe/@38.72,-9.14,17z/data=!3d38.7112!4d-9.1374'
        );
        assert.equal(parsed.ok, true);
        assert.equal(parsed.lat, 38.7112);
        assert.equal(parsed.lng, -9.1374);
        assert.equal(parsed.nome, 'Cafe');
    });

    it('reads q=lat,lng', () => {
        const parsed = parseMapsUrl('https://maps.google.com/?q=41.15,-8.61');
        assert.equal(parsed.ok, true);
        assert.equal(parsed.lat, 41.15);
        assert.equal(parsed.lng, -8.61);
    });

    it('reads a search query without coords', () => {
        const parsed = parseMapsUrl('https://www.google.com/maps/search/?api=1&query=Mercearia+do+Bairro+Porto');
        assert.equal(parsed.ok, true);
        assert.match(parsed.nome, /Mercearia do Bairro/i);
        assert.equal(parsed.lat, null);
    });

    it('flags short Maps links', () => {
        const parsed = parseMapsUrl('https://maps.app.goo.gl/abc123XYZ');
        assert.equal(parsed.ok, true);
        assert.equal(parsed.short, true);
    });

    it('rejects unrelated URLs', () => {
        const parsed = parseMapsUrl('https://yourlabpt.com/digitalizept/');
        assert.equal(parsed.ok, false);
    });

    it('decodes plus-encoded names', () => {
        assert.equal(decodePlace('Caf%C3%A9+Central'), 'Café Central');
    });
});

describe('digitalizept maps osm mapping', () => {
    it('scores similar shop names', () => {
        assert.ok(nameScore('Talho da Costa', 'Talho Da Costa') >= 70);
        assert.equal(nameScore('Padaria Central', 'Mecanica Norte'), 0);
    });

    it('maps OSM tags to business types', () => {
        assert.equal(mapBusinessType({ amenity: 'restaurant' }), 'restaurante');
        assert.equal(mapBusinessType({ shop: 'hairdresser' }), 'salao-beleza');
        assert.equal(mapBusinessType({ shop: 'convenience' }), 'mercadinho');
        assert.equal(mapBusinessType({ amenity: 'bank' }), 'generico');
    });
});
