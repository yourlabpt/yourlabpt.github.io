const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('digitalizept identity image paste', () => {
    it('takes image files from clipboard data and HTML data URLs', async () => {
        const { isImageFile, filesFromClipboardData } = await import('../../digitalizept/js/steps/identity.js');
        const png = new File([new Uint8Array([1, 2, 3])], 'loja.png', { type: 'image/png' });
        const txt = new File([new Uint8Array([9])], 'notas.txt', { type: 'text/plain' });

        assert.equal(isImageFile(png), true);
        assert.equal(isImageFile(txt), false);
        assert.equal(isImageFile(new File([new Uint8Array([1])], 'cartaz.heic', { type: '' })), true);

        const fromFiles = filesFromClipboardData({ files: [png, txt], items: [] });
        assert.equal(fromFiles.length, 1);
        assert.equal(fromFiles[0].name, 'loja.png');

        const fromItem = filesFromClipboardData({
            files: [],
            items: [{ kind: 'file', type: 'image/jpeg', getAsFile: () => png }]
        });
        assert.equal(fromItem.length, 1);

        const fromHtml = filesFromClipboardData({
            files: [],
            items: [],
            getData: (type) => (type === 'text/html' ? `<img src="${PNG}" alt="">` : '')
        });
        assert.equal(fromHtml.length, 1);
        assert.match(fromHtml[0].type, /image\/png/);

        assert.deepEqual(filesFromClipboardData(null), []);
        assert.deepEqual(filesFromClipboardData({ files: [txt], items: [] }), []);
    });
});
