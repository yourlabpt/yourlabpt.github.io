const fs = require('fs');
const PDFDocument = require('pdfkit');

// Convert signed-contract HTML to a real PDF. Chromium matches the on-screen
// document when a browser is available; pdfkit draws the same sections
// (parties, tables, clauses, signatures) when it is not.

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
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium'
].filter(Boolean);

const FONT_SETS = [
    {
        regular: '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
        bold: '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
    },
    {
        regular: '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
        bold: '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf'
    },
    {
        regular: '/System/Library/Fonts/Supplemental/Arial.ttf',
        bold: '/System/Library/Fonts/Supplemental/Arial Bold.ttf'
    },
    {
        regular: '/Library/Fonts/Arial.ttf',
        bold: '/Library/Fonts/Arial Bold.ttf'
    }
];

const PDF_OPTIONS = {
    format: 'A4',
    printBackground: true,
    preferCSSPageSize: false,
    margin: { top: '14mm', bottom: '14mm', left: '14mm', right: '14mm' }
};

const LAUNCH_ARGS = ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none', '--disable-gpu'];

const INK = '#1c1c1c';
const MUTED = '#555555';
const GOLD = '#a07d3a';
const RULE = '#e8d5b7';
const BOX = '#f6f4ef';
const BOX_LINE = '#e5e0d5';

function resolveChromePath() {
    const fromEnv = (process.env.DIGITALIZEPT_CHROME_PATH || '').trim();
    if (fromEnv) return fromEnv;
    return CHROME_CANDIDATES.find((candidate) => fs.existsSync(candidate)) || '';
}

function resolveFonts() {
    return FONT_SETS.find((set) => fs.existsSync(set.regular)) || null;
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
        attempts.push({ executablePath: chrome, headless: true, args: LAUNCH_ARGS, timeout: 8000 });
    }
    attempts.push({ channel: 'chrome', headless: true, args: LAUNCH_ARGS, timeout: 8000 });
    attempts.push({ headless: true, args: LAUNCH_ARGS, timeout: 8000 });

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
        browser = await withTimeout(launchWithPuppeteer(), 8000, 'Chrome launch');
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.addStyleTag({
            content: '@page{size:A4;margin:14mm} body{max-width:none !important;margin:0 !important;padding:0 !important}'
        });
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
        .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

function stripTags(html) {
    return decodeEntities(String(html || '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|h1|h2|h3|tr|li|table|section)>/gi, '\n')
        .replace(/<[^>]+>/g, ' '))
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[ \t]{2,}/g, ' ')
        .trim();
}

function wrapLongTokens(text, size = 40) {
    return String(text || '').replace(/\S{40,}/g, (token) => (
        token.replace(new RegExp(`.{1,${size}}`, 'g'), '$&\n').trim()
    ));
}

function extractBalancedDiv(html, openIndex) {
    const tagEnd = html.indexOf('>', openIndex);
    if (tagEnd < 0) return null;
    let depth = 1;
    let i = tagEnd + 1;
    while (i < html.length && depth > 0) {
        const open = html.toLowerCase().indexOf('<div', i);
        const close = html.toLowerCase().indexOf('</div>', i);
        if (close < 0) break;
        if (open >= 0 && open < close) {
            depth += 1;
            i = open + 4;
        } else {
            depth -= 1;
            if (depth === 0) {
                return { inner: html.slice(tagEnd + 1, close), end: close + 6 };
            }
            i = close + 6;
        }
    }
    return null;
}

function classOf(tag) {
    const match = /class=["']([^"']+)["']/i.exec(tag || '');
    return match ? match[1] : '';
}

function parseContractBlocks(html) {
    const source = String(html || '')
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '');
    const bodyMatch = source.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const body = bodyMatch ? bodyMatch[1] : source;
    const blocks = [];
    let i = 0;
    while (i < body.length) {
        const slice = body.slice(i);
        const nextDiv = slice.search(/<div\b/i);
        const nextH1 = slice.search(/<h1\b/i);
        const nextH2 = slice.search(/<h2\b/i);
        const nextP = slice.search(/<p\b/i);
        const nextLi = slice.search(/<li\b/i);
        const nextTr = slice.search(/<tr\b/i);
        const nextImg = slice.search(/<img\b/i);
        const candidates = [
            ['div', nextDiv],
            ['h1', nextH1],
            ['h2', nextH2],
            ['p', nextP],
            ['li', nextLi],
            ['tr', nextTr],
            ['img', nextImg]
        ].filter((item) => item[1] >= 0).sort((a, b) => a[1] - b[1]);
        if (!candidates.length) break;
        const [kind, rel] = candidates[0];
        const abs = i + rel;
        if (kind === 'div') {
            const openEnd = body.indexOf('>', abs);
            const openTag = body.slice(abs, openEnd + 1);
            const cls = classOf(openTag);
            const extracted = extractBalancedDiv(body, abs);
            if (!extracted) {
                i = abs + 4;
                continue;
            }
            if (/\bc-party\b/.test(cls) && !/\bc-parties\b/.test(cls)) {
                const role = stripTags((extracted.inner.match(/c-party-role[^>]*>([\s\S]*?)<\/div>/i) || [])[1] || '');
                const text = stripTags(extracted.inner.replace(/<div[^>]*c-party-role[\s\S]*?<\/div>/i, ''));
                blocks.push({ type: 'party', role, text });
                i = extracted.end;
                continue;
            }
            if (/\bc-sign-box\b/.test(cls)) {
                const src = (extracted.inner.match(/<img[^>]+src=["']([^"']+)["']/i) || [])[1] || '';
                const label = stripTags((extracted.inner.match(/c-sign-label[^>]*>([\s\S]*?)<\/div>/i) || [])[1]
                    || extracted.inner);
                blocks.push({ type: 'sign', src, label });
                i = extracted.end;
                continue;
            }
            if (/\bc-audit\b/.test(cls)) {
                blocks.push({ type: 'audit', text: wrapLongTokens(stripTags(extracted.inner)) });
                i = extracted.end;
                continue;
            }
            i = openEnd + 1;
            continue;
        }
        if (kind === 'img') {
            const tagEnd = body.indexOf('>', abs);
            const tag = body.slice(abs, tagEnd + 1);
            const src = (tag.match(/src=["']([^"']+)["']/i) || [])[1] || '';
            if (src.startsWith('data:image/')) blocks.push({ type: 'image', src });
            i = tagEnd + 1;
            continue;
        }
        const closeTag = `</${kind}>`;
        const close = body.toLowerCase().indexOf(closeTag, abs);
        if (close < 0) {
            i = abs + 3;
            continue;
        }
        const openEnd = body.indexOf('>', abs);
        const inner = body.slice(openEnd + 1, close);
        if (kind === 'h1') blocks.push({ type: 'h1', text: stripTags(inner) });
        else if (kind === 'h2') blocks.push({ type: 'h2', text: stripTags(inner) });
        else if (kind === 'p') {
            const cls = classOf(body.slice(abs, openEnd + 1));
            blocks.push({ type: /\bc-date\b/.test(cls) ? 'date' : 'p', text: stripTags(inner) });
        } else if (kind === 'li') blocks.push({ type: 'li', text: stripTags(inner) });
        else if (kind === 'tr') {
            const cells = [...inner.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)]
                .map((cell) => stripTags(cell[1]));
            if (cells.some(Boolean)) blocks.push({ type: 'row', cells });
        }
        i = close + closeTag.length;
    }
    return blocks.filter((block) => block.text || block.src || (block.cells && block.cells.length));
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

function pageWidth(doc) {
    return doc.page.width - doc.page.margins.left - doc.page.margins.right;
}

function resetX(doc) {
    doc.x = doc.page.margins.left;
}

function ensureSpace(doc, height) {
    const bottom = doc.page.height - doc.page.margins.bottom;
    if (doc.y + height > bottom) {
        doc.addPage();
        resetX(doc);
    }
}

function setFont(doc, fonts, bold) {
    if (!fonts) return;
    const file = bold && fonts.bold && fs.existsSync(fonts.bold) ? fonts.bold : fonts.regular;
    try { doc.font(file); } catch (_) { /* keep current */ }
}

function renderWithPdfkit(html) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({
            size: 'A4',
            margin: 48,
            info: { Title: 'Contrato de Prestação de Serviços', Author: 'YourLab' }
        });
        const chunks = [];
        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        const fonts = resolveFonts();
        setFont(doc, fonts, false);
        const width = pageWidth(doc);
        const left = doc.page.margins.left;
        const blocks = parseContractBlocks(html);

        const partyQueue = [];
        const signQueue = [];

        function flushParties() {
            if (!partyQueue.length) return;
            const cols = partyQueue.splice(0, 2);
            const gap = 12;
            const colW = cols.length === 2 ? (width - gap) / 2 : width;
            const heights = cols.map((party) => {
                setFont(doc, fonts, true);
                doc.fontSize(8);
                const roleH = doc.heightOfString((party.role || '').toUpperCase(), { width: colW - 20 });
                setFont(doc, fonts, false);
                doc.fontSize(9);
                const textH = doc.heightOfString(party.text || '', { width: colW - 20 });
                return 28 + roleH + textH;
            });
            const boxH = Math.max(...heights, 72);
            ensureSpace(doc, boxH + 12);
            const y = doc.y;
            cols.forEach((party, index) => {
                const x = left + index * (colW + gap);
                doc.save();
                doc.roundedRect(x, y, colW, boxH, 6).fillAndStroke(BOX, BOX_LINE);
                doc.restore();
                setFont(doc, fonts, true);
                doc.fillColor(GOLD).fontSize(8).text((party.role || '').toUpperCase(), x + 10, y + 10, {
                    width: colW - 20
                });
                setFont(doc, fonts, false);
                doc.fillColor(INK).fontSize(9).text(party.text || '', x + 10, doc.y + 4, {
                    width: colW - 20,
                    lineGap: 2
                });
            });
            doc.y = y + boxH + 14;
            resetX(doc);
        }

        function flushSigns() {
            if (!signQueue.length) return;
            const cols = signQueue.splice(0, 2);
            const gap = 24;
            const colW = cols.length === 2 ? (width - gap) / 2 : width;
            ensureSpace(doc, 110);
            const y = doc.y + 8;
            let bottom = y;
            cols.forEach((sign, index) => {
                const x = left + index * (colW + gap);
                let cursor = y;
                const buf = dataUrlToBuffer(sign.src);
                if (buf) {
                    try {
                        doc.image(buf, x + (colW - 160) / 2, cursor, { fit: [160, 64] });
                        cursor += 70;
                    } catch (_) { /* skip */ }
                }
                doc.moveTo(x + 12, cursor).lineTo(x + colW - 12, cursor).strokeColor(INK).lineWidth(0.8).stroke();
                cursor += 8;
                setFont(doc, fonts, false);
                doc.fillColor(MUTED).fontSize(8).text(sign.label || '', x, cursor, {
                    width: colW,
                    align: 'center'
                });
                bottom = Math.max(bottom, doc.y + 8);
            });
            doc.y = bottom + 10;
            resetX(doc);
        }

        blocks.forEach((block) => {
            if (block.type !== 'party') flushParties();
            if (block.type !== 'sign' && block.type !== 'image') flushSigns();

            if (block.type === 'party') {
                partyQueue.push(block);
                return;
            }
            if (block.type === 'sign' || block.type === 'image') {
                signQueue.push(block.type === 'image' ? { src: block.src, label: '' } : block);
                return;
            }
            if (block.type === 'h1') {
                setFont(doc, fonts, true);
                doc.fillColor(INK).fontSize(18).text(block.text, left, doc.y, { width, lineGap: 2 });
                resetX(doc);
                doc.moveDown(0.15);
                return;
            }
            if (block.type === 'date') {
                setFont(doc, fonts, false);
                doc.fillColor(MUTED).fontSize(10).text(block.text, { width });
                resetX(doc);
                doc.moveDown(0.6);
                return;
            }
            if (block.type === 'h2') {
                flushParties();
                ensureSpace(doc, 36);
                doc.moveDown(0.45);
                setFont(doc, fonts, true);
                doc.fillColor(INK).fontSize(12).text(block.text, left, doc.y, { width });
                const y = doc.y + 3;
                doc.moveTo(left, y).lineTo(left + width, y).strokeColor(RULE).lineWidth(1.5).stroke();
                doc.y = y + 8;
                resetX(doc);
                return;
            }
            if (block.type === 'li') {
                ensureSpace(doc, 22);
                setFont(doc, fonts, false);
                doc.fillColor('#333333').fontSize(9.5).text(`•  ${block.text}`, left, doc.y, {
                    width,
                    lineGap: 1.5
                });
                doc.moveDown(0.15);
                resetX(doc);
                return;
            }
            if (block.type === 'row') {
                const label = block.cells[0] || '';
                const value = block.cells.slice(1).join('  ');
                const labelW = width * 0.7;
                const valueW = width * 0.3;
                setFont(doc, fonts, false);
                doc.fontSize(10);
                const h = Math.max(
                    doc.heightOfString(label, { width: labelW }),
                    doc.heightOfString(value, { width: valueW })
                );
                ensureSpace(doc, h + 10);
                const y = doc.y;
                doc.fillColor(INK).fontSize(10).text(label, left, y, { width: labelW });
                doc.fillColor(INK).fontSize(10).text(value, left + labelW, y, { width: valueW, align: 'right' });
                doc.y = y + h + 4;
                doc.moveTo(left, doc.y).lineTo(left + width, doc.y).strokeColor('#eeeeee').lineWidth(0.6).stroke();
                doc.y += 4;
                resetX(doc);
                return;
            }
            if (block.type === 'audit') {
                const h = (() => {
                    setFont(doc, fonts, false);
                    doc.fontSize(8);
                    return doc.heightOfString(block.text, { width: width - 20 }) + 20;
                })();
                ensureSpace(doc, h);
                const y = doc.y + 8;
                doc.save();
                doc.roundedRect(left, y, width, h, 6).fill(BOX);
                doc.restore();
                setFont(doc, fonts, false);
                doc.fillColor(MUTED).fontSize(8).text(block.text, left + 10, y + 8, {
                    width: width - 20,
                    lineGap: 2
                });
                doc.y = y + h + 8;
                resetX(doc);
                return;
            }
            if (block.text) {
                setFont(doc, fonts, false);
                doc.fillColor(MUTED).fontSize(9).text(block.text, left, doc.y, { width, lineGap: 2 });
                doc.moveDown(0.25);
                resetX(doc);
            }
        });

        flushParties();
        flushSigns();
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
