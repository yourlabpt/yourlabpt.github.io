const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parseMapsUrl, decodePlace } = require('../../server/lib/digitalizept-maps-url');
const {
    nameScore,
    mapBusinessType,
    pickOsmPlace,
    contactFromOsm,
    isPortugueseMobile,
    whatsappIfMobile
} = require('../../server/lib/digitalizept-maps-lookup');

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
        assert.equal(mapBusinessType({ tourism: 'hotel' }), 'quintas-e-hotelaria');
        assert.equal(mapBusinessType({ tourism: 'guest_house' }), 'quintas-e-hotelaria');
        assert.equal(mapBusinessType({ amenity: 'events_venue' }), 'quintas-e-hotelaria');
    });

    it('reads the shop pin from a full Google Maps place URL', () => {
        const parsed = parseMapsUrl(
            'https://www.google.com/maps/place/Thailander/@41.1494613,-8.6175002,17z/data=!3m2!4b1!4m6!3m5!1s0xd246586f31e5bcf:0xdf4205a594a32e01!8m2!3d41.1494613!4d-8.6149253!16s%2Fg%2F11jchwq4t2'
        );
        assert.equal(parsed.ok, true);
        assert.equal(parsed.nome, 'Thailander');
        assert.equal(parsed.lat, 41.1494613);
        assert.equal(parsed.lng, -8.6149253);
    });

    it('does not copy a neighbour\'s phone onto the named shop', () => {
        const aduela = { tags: { name: 'Aduela', phone: '+351222084398', amenity: 'bar' } };
        const thailander = {
            tags: { name: 'Thailander', phone: '+351 220 995 072', amenity: 'restaurant' }
        };
        const neighbours = [
            aduela,
            { tags: { name: 'Nicolau', amenity: 'restaurant' } },
            { tags: { name: 'Café Lusitano', phone: '+351 222 011 067', amenity: 'bar' } }
        ];
        assert.equal(nameScore('Thailander', 'Aduela'), 0);
        assert.equal(pickOsmPlace(neighbours, 'Thailander'), null);
        assert.equal(pickOsmPlace([...neighbours, thailander], 'Thailander').phone, '+351 220 995 072');
        assert.equal(pickOsmPlace([aduela], 'Thailander'), null);
    });

    it('keeps a Porto landline on telefone and off WhatsApp', () => {
        assert.equal(isPortugueseMobile('+351 220 995 072'), false);
        assert.equal(whatsappIfMobile('+351222084398'), '');
        const landline = contactFromOsm({
            phone: '+351 220 995 072',
            email: '',
            website: '',
            horario: ''
        });
        assert.equal(landline.telefone, '+351 220 995 072');
        assert.equal(landline.whatsapp, '');
        const mobile = contactFromOsm({ phone: '+351 912 345 678' });
        assert.equal(mobile.whatsapp, '+351 912 345 678');
        assert.equal(whatsappIfMobile('912345678'), '912345678');
        assert.equal(isPortugueseMobile('931112223'), true);
    });

    it('copies Instagram and Facebook from OSM contact tags', () => {
        const social = contactFromOsm({
            phone: '',
            instagram: '@talho',
            facebook: 'https://facebook.com/talhodacosta'
        });
        assert.equal(social.instagram, '@talho');
        assert.equal(social.facebook, 'https://facebook.com/talhodacosta');
        const empty = contactFromOsm(null);
        assert.equal(empty.instagram, '');
        assert.equal(empty.facebook, '');
    });
});
