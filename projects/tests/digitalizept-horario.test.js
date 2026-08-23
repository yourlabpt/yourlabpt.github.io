const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('digitalizept opening hours', () => {
    it('formats days, open/close and a lunch pause', async () => {
        const { formatHours } = await import('../../digitalizept/js/horario.js');
        assert.equal(
            formatHours({
                days: ['seg', 'ter', 'qua', 'qui', 'sex'],
                open: '09:00',
                close: '19:00'
            }),
            'Seg–Sex 9h–19h'
        );
        assert.equal(
            formatHours({
                days: ['seg', 'ter', 'qua', 'qui', 'sex'],
                open: '09:00',
                close: '19:00',
                pauseFrom: '13:00',
                pauseTo: '14:00'
            }),
            'Seg–Sex 9h–13h e 14h–19h'
        );
        assert.equal(
            formatHours({
                ranges: [
                    {
                        days: ['seg', 'ter', 'qua', 'qui', 'sex'],
                        open: '09:00',
                        close: '19:00',
                        pauseFrom: '13:00',
                        pauseTo: '14:00'
                    },
                    { days: ['sab'], open: '09:00', close: '13:00' }
                ]
            }),
            'Seg–Sex 9h–13h e 14h–19h · Sáb 9h–13h'
        );
        assert.equal(formatHours({ days: [], open: '09:00', close: '19:00' }), '');
        assert.equal(formatHours({ days: ['ter'], open: '09:30', close: '18:00' }), 'Ter 9h30–18h');
    });

    it('parses the formatted string and simple OSM hours', async () => {
        const { parseHours, formatHours } = await import('../../digitalizept/js/horario.js');
        const lunch = 'Seg–Sex 9h–13h e 14h–19h';
        const parsed = parseHours(lunch);
        assert.ok(parsed);
        assert.equal(formatHours(parsed), lunch);

        const two = parseHours('Seg–Sex 9h–13h e 14h–19h · Sáb 9h–13h');
        assert.equal(formatHours(two), 'Seg–Sex 9h–13h e 14h–19h · Sáb 9h–13h');

        const osm = parseHours('Mo-Fr 09:00-19:00');
        assert.equal(formatHours(osm), 'Seg–Sex 9h–19h');

        const osmLunch = parseHours('Mo-Fr 09:00-13:00,14:00-19:00; Sa 09:00-13:00');
        assert.equal(formatHours(osmLunch), 'Seg–Sex 9h–13h e 14h–19h · Sáb 9h–13h');

        assert.equal(parseHours('').ranges.length, 1);
        assert.equal(parseHours('ainda nao sei'), null);
    });
});
