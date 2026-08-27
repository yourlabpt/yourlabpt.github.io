const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const {
    validateImageUrl,
    isPrivateHostname,
    isPrivateIp
} = require('../../server/lib/digitalizept-fetch-image');

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

let filesFromClipboardData;
let imageUrlsFromClipboardData;
let isImageFile;

before(async () => {
    if (typeof globalThis.window === 'undefined') {
        globalThis.window = { location: { hostname: 'localhost', port: '3000' } };
    }
    const mod = await import(pathToFileURL(
        path.join(__dirname, '..', '..', 'digitalizept', 'js', 'demo', 'identity-editor.js')
    ).href);
    filesFromClipboardData = mod.filesFromClipboardData;
    imageUrlsFromClipboardData = mod.imageUrlsFromClipboardData;
    isImageFile = mod.isImageFile;
});

describe('digitalizept identity image paste', () => {
    it('takes image files from clipboard data and HTML data URLs', () => {
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

    it('extracts Facebook/Instagram CDN urls from clipboard HTML', () => {
        const fb = 'https://scontent.xx.fbcdn.net/v/t39.30808-6/123_n.jpg?_nc_cat=1&amp;oh=abc';
        const ig = 'https://scontent-ams2-1.cdninstagram.com/v/t51.2885-15/456.jpg?stp=dst-jpg';
        const html = `<div><img src="${fb}"><img data-src="${ig}"></div>`;
        const urls = imageUrlsFromClipboardData({
            getData: (type) => (type === 'text/html' ? html : '')
        });
        assert.equal(urls.length, 2);
        assert.ok(urls[0].includes('fbcdn.net'));
        assert.ok(urls[0].includes('&oh=abc'));
        assert.ok(!urls[0].includes('&amp;'));
        assert.ok(urls[1].includes('cdninstagram.com'));
    });

    it('reads a plain image url from text/plain', () => {
        const urls = imageUrlsFromClipboardData({
            getData: (type) => (type === 'text/plain'
                ? 'https://scontent.cdninstagram.com/v/t51/photo.jpg?oe=1'
                : '')
        });
        assert.equal(urls.length, 1);
        assert.match(urls[0], /cdninstagram/);
    });
});

describe('digitalizept fetch-image guards', () => {
    it('rejects private hosts and accepts https CDN urls', () => {
        assert.equal(isPrivateHostname('localhost'), true);
        assert.equal(isPrivateIp('127.0.0.1'), true);
        assert.equal(isPrivateIp('10.0.0.2'), true);
        assert.equal(validateImageUrl('https://scontent.xx.fbcdn.net/v/t/x.jpg').ok, true);
        assert.equal(validateImageUrl('http://127.0.0.1/x.jpg').ok, false);
        assert.equal(validateImageUrl('file:///etc/passwd').ok, false);
        assert.equal(validateImageUrl('not-a-url').ok, false);
    });
});
