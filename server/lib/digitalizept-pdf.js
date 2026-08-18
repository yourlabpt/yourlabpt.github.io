const fs = require('fs');
const PDFDocument = require('pdfkit');

// Convert signed-contract HTML to a real PDF. Chromium (Puppeteer) is preferred
// so the layout matches the signed page; pdfkit is the fallback so a missing
// browser never blocks Descarregar PDF.

const CHROME_CANDIDATES = [
    process.platform === 'darwin'
        ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
        : '',
    process.platform === 'darwin'
        ? '/Applications/Chromium.app/Contents/MacOS/Chromium'
        : '',
    '/usr/local/bin/google-chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser'
].filter(Boolean);

const FONT_CANDIDATES = [
    '/System/Library/Fonts/Supplemental/Arial Unicode.ttf',
    '/System/Library/Fonts/Supplemental/Arial.ttf',
    '/Library/Fonts/Arial.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
    '/usr/share/fonts/truetype/freefont/FreeSans.ttf'
];

const PDF_OPTIONS = {
    format: 'A4',
    printBackground: true,
    preferCSSPageSize: false,
    margin: { top: '16mm', bottom: '16mm', left: '14mm', right: '14mm' }
};

const LAUNCH_ARGS = ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none', '--disable-gpu'];

function resolveChromePath() {
    const fromEnv = (process.env.DIGITALIZEPT_CHROME_PATH || '').trim();
    if (fromEnv) return fromEnv;
    return CHROME_CANDIDATES.find((candidate) => fs.existsSync(candidate)) || '';
}

function resolveFontPath() {
    return FONT_CANDIDATES.find((candidate) => fs.existsSync(candidate)) || '';
}

function withTimeout(promise, ms, label) {
    let timer;
    return Promise.race([
        promise.finally(() => clearTimeout(timer)),
        new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
        })
    ]);
}

async function launchWithPuppeteer() {
    const puppeteer = require('puppeteer');
    const chrome = resolveChromePath();
    const attempts = [];
    if (chrome) {
        attempts.push({ executablePath: chrome, headless: true, args: LAUNCH_ARGS, timeout: 12000 });
    }
    attempts.push({ channel: 'chrome', headless: true, args: LAUNCH_ARGS, timeout: 12000 });
    attempts.push({ headless: true, args: LAUNCH_ARGS, timeout: 12000 });

    let lastError;
    for (const options of attempts) {
        try {
            return await puppeteer.launch(options);
        } catch (err) {
            lastError = err;
        }
    }
    throw lastError || new Error('puppeteer.launch failed');
}

async function renderWithChromium(html) {
    let browser = null;
    try {
        browser = await withTimeout(launchWithPuppeteer(), 15000, 'Chrome launch');
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 20000 });
        return await page.pdf(PDF_OPTIONS);
    } finally {
        if (browser) {
            try { await browser.close(); } catch (_) { /* ignore */ }
        }
    }
}

function decodeEntities(text) {
    return String(text || '')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
        .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
        .replace(/\s+/g, ' ')
        .trim();
}

function stripTags(html) {
    return decodeEntities(String(html || '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|h1|h2|h3|tr|li|table|section)>/gi, '\n')
        .replace(/<[^>]+>/g, ' '));
}

function extractBlocks(html) {
    const source = String(html || '')
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '');
    const bodyMatch = source.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const body = bodyMatch ? bodyMatch[1] : source;
    const blocks = [];
    const tokenRe = /<img\b[^>]*src=["']([^"']+)["'][^>]*>|<(h1|h2|h3|p|li|tr)\b[^>]*>([\s\S]*?)<\/\2>/gi;
    let match;
    while ((match = tokenRe.exec(body))) {
        if (match[1]) {
            if (match[1].startsWith('data:image/')) {
                blocks.push({ type: 'image', src: match[1] });
            }
            continue;
        }
        const tag = String(match[2] || '').toLowerCase();
        if (tag === 'tr') {
            const cells = [...String(match[3] || '').matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)]
                .map((cell) => stripTags(cell[1]));
            if (cells.some(Boolean)) blocks.push({ type: 'row', cells });
            continue;
        }
        const text = stripTags(match[3]);
        if (!text) continue;
        if (tag === 'h1') blocks.push({ type: 'h1', text });
        else if (tag === 'h2' || tag === 'h3') blocks.push({ type: 'h2', text });
        else if (tag === 'li') blocks.push({ type: 'li', text });
        else blocks.push({ type: 'p', text });
    }
    if (!blocks.length) {
        const text = stripTags(body);
        if (text) blocks.push({ type: 'p', text });
    }
    return blocks;
}

function dataUrlToBuffer(src) {
    const match = /^data:image\/[a-zA-Z0-9+.-]+;base64,(.+)$/.exec(String(src || '').replace(/\s/g, ''));
    if (!match) return null;
    try {
        return Buffer.from(match[1], 'base64');
    } catch (_) {
        return null;
    }
}

function renderWithPdfkit(html) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: 'Contrato' } });
        const chunks = [];
        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        const fontPath = resolveFontPath();
        if (fontPath) {
            try { doc.font(fontPath); } catch (_) { /* default font */ }
        }

        const blocks = extractBlocks(html);
        blocks.forEach((block) => {
            if (block.type === 'h1') {
                doc.fontSize(18).fillColor('#1c1c1c').text(block.text, { align: 'left' });
                doc.moveDown(0.4);
                return;
            }
            if (block.type === 'h2') {
                doc.moveDown(0.4);
                doc.fontSize(12).fillColor('#1c1c1c').text(block.text);
                doc.moveDown(0.2);
                return;
            }
            if (block.type === 'li') {
                doc.fontSize(10).fillColor('#333333').text(`• ${block.text}`, { indent: 12 });
                return;
            }
            if (block.type === 'row') {
                const left = block.cells[0] || '';
                const right = block.cells.slice(1).join('   ');
                doc.fontSize(10).fillColor('#1c1c1c');
                const y = doc.y;
                const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
                doc.text(left, { width: width * 0.65, continued: false });
                const after = doc.y;
                doc.y = y;
                doc.text(right, doc.page.margins.left + width * 0.65, y, {
                    width: width * 0.35,
                    align: 'right'
                });
                doc.y = Math.max(after, doc.y);
                return;
            }
            if (block.type === 'image') {
                const buf = dataUrlToBuffer(block.src);
                if (!buf) return;
                try {
                    const maxWidth = 180;
                    doc.image(buf, { fit: [maxWidth, 70], align: 'left' });
                    doc.moveDown(0.4);
                } catch (_) { /* skip broken image */ }
                return;
            }
            doc.fontSize(10).fillColor('#333333').text(block.text, { lineGap: 2 });
            doc.moveDown(0.25);
        });

        doc.end();
    });
}

async function renderContractPdfBuffer(html) {
    const source = String(html || '').trim();
    if (!source) return null;

    if (process.env.DIGITALIZEPT_PDF_ENGINE !== 'pdfkit') {
        try {
            const fromChrome = await renderWithChromium(source);
            if (fromChrome && fromChrome.length > 8) return fromChrome;
        } catch (err) {
            console.error(`digitalizept: Chromium PDF failed, using pdfkit (${err.message})`);
        }
    }

    try {
        const fromKit = await renderWithPdfkit(source);
        if (fromKit && fromKit.length > 8) return fromKit;
    } catch (err) {
        console.error(`digitalizept: pdfkit PDF failed (${err.message})`);
    }
    return null;
}

async function renderContractPdf(html, outPath) {
    const buffer = await renderContractPdfBuffer(html);
    if (!buffer || !outPath) return false;
    fs.writeFileSync(outPath, buffer);
    return fs.existsSync(outPath) && fs.statSync(outPath).size > 0;
}

module.exports = { renderContractPdf, renderContractPdfBuffer };
