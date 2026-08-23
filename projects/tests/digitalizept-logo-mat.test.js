const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

describe('logo mat sampling', async () => {
    const { sampleLogoMatFromImageData } = await import(
        pathToFileURL(path.join(__dirname, '../../digitalizept/js/demo/logo-mat.js')).href
    );

    function fill(w, h, r, g, b, a = 255) {
        const data = new Uint8ClampedArray(w * h * 4);
        for (let i = 0; i < data.length; i += 4) {
            data[i] = r;
            data[i + 1] = g;
            data[i + 2] = b;
            data[i + 3] = a;
        }
        return data;
    }

    it('reads a flat white JPEG frame as the mat colour', () => {
        assert.equal(sampleLogoMatFromImageData(fill(16, 12, 255, 255, 255), 16, 12), '#ffffff');
    });

    it('reads a green frame around a different centre', () => {
        const data = fill(20, 16, 20, 90, 40);
        for (let y = 4; y < 12; y++) {
            for (let x = 4; x < 16; x++) {
                const i = (y * 20 + x) * 4;
                data[i] = 240;
                data[i + 1] = 200;
                data[i + 2] = 40;
            }
        }
        assert.equal(sampleLogoMatFromImageData(data, 20, 16), '#145a28');
    });

    it('ignores a transparent PNG frame', () => {
        assert.equal(sampleLogoMatFromImageData(fill(12, 12, 0, 0, 0, 0), 12, 12), '');
    });

    it('ignores a busy border that is not a mat', () => {
        const data = fill(12, 12, 0, 0, 0);
        for (let i = 0; i < data.length; i += 4) {
            data[i] = (i * 13) % 256;
            data[i + 1] = (i * 29) % 256;
            data[i + 2] = (i * 47) % 256;
        }
        assert.equal(sampleLogoMatFromImageData(data, 12, 12), '');
    });
});
