const fs = require('fs');
const path = require('path');

const DEMOS_ROOT = path.join(__dirname, '..', 'data', 'digitalizept-demos');

function writeDemoFolder({ slug, demo, identidade, dados, businessType, demoHtml }) {
    const safe = String(slug || 'demo').replace(/[^a-z0-9_-]/gi, '_').slice(0, 80) || 'demo';
    const folder = path.join(DEMOS_ROOT, safe);
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, 'demo.json'), JSON.stringify(demo || {}, null, 2));
    fs.writeFileSync(path.join(folder, 'identidade.json'), JSON.stringify(identidade || {}, null, 2));
    fs.writeFileSync(path.join(folder, 'dados.json'), JSON.stringify({
        dados: dados || {},
        businessType: businessType || {}
    }, null, 2));
    const customPath = path.join(folder, 'custom.html');
    if (demoHtml && !/data-dp-boilerplate\s*=/i.test(String(demoHtml))) {
        fs.writeFileSync(customPath, String(demoHtml));
    }
    fs.writeFileSync(path.join(folder, 'index-url.txt'), `/d/${safe}\n`);
    return folder;
}

module.exports = { writeDemoFolder, DEMOS_ROOT };
