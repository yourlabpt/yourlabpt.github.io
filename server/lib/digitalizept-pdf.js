const fs = require('fs');

// Convert the signed contract HTML to a real PDF via Chromium's print engine
// so the file the client downloads is the same document they saw and signed.

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

const PDF_OPTIONS = {
    format: 'A4',
    printBackground: true,
    preferCSSPageSize: false,
    margin: { top: '16mm', bottom: '16mm', left: '14mm', right: '14mm' }
};

const LAUNCH_ARGS = ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'];

function resolveChromePath() {
    const fromEnv = (process.env.DIGITALIZEPT_CHROME_PATH || '').trim();
    if (fromEnv) return fromEnv;
    return CHROME_CANDIDATES.find((candidate) => fs.existsSync(candidate)) || '';
}

async function launchWithPuppeteer(forceSystemChrome) {
    const puppeteer = require('puppeteer');
    const options = { headless: true, args: LAUNCH_ARGS };
    if (forceSystemChrome) {
        const executablePath = resolveChromePath();
        if (!executablePath) throw new Error('No system Chrome found.');
        options.executablePath = executablePath;
    }
    return puppeteer.launch(options);
}

async function launchWithPlaywright() {
    let chromium;
    try {
        chromium = require('@playwright/test').chromium;
    } catch (_) {
        chromium = require('playwright').chromium;
    }
    const options = { args: LAUNCH_ARGS };
    const executablePath = resolveChromePath();
    if (executablePath) options.executablePath = executablePath;
    return chromium.launch(options);
}

async function launchBrowser() {
    const errors = [];
    try {
        return await launchWithPuppeteer(false);
    } catch (err) {
        errors.push(`puppeteer: ${err.message}`);
    }
    try {
        return await launchWithPuppeteer(true);
    } catch (err) {
        errors.push(`puppeteer+chrome: ${err.message}`);
    }
    try {
        return await launchWithPlaywright();
    } catch (err) {
        errors.push(`playwright: ${err.message}`);
    }
    throw new Error(`No HTML-to-PDF browser available (${errors.join('; ')})`);
}

async function renderContractPdfBuffer(html) {
    const source = String(html || '').trim();
    if (!source) return null;

    let browser = null;
    try {
        browser = await launchBrowser();
        const page = await browser.newPage();
        await page.emulateMediaType('print');
        await page.setContent(source, { waitUntil: 'load', timeout: 30000 });
        return await page.pdf(PDF_OPTIONS);
    } catch (err) {
        console.error(`digitalizept: PDF render failed (${err.message})`);
        return null;
    } finally {
        if (browser) {
            try { await browser.close(); } catch (_) { /* ignore */ }
        }
    }
}

async function renderContractPdf(html, outPath) {
    const buffer = await renderContractPdfBuffer(html);
    if (!buffer || !outPath) return false;
    fs.writeFileSync(outPath, buffer);
    return fs.existsSync(outPath) && fs.statSync(outPath).size > 0;
}

module.exports = { renderContractPdf, renderContractPdfBuffer };
