const fs = require('fs');

// A signed contract should reach the client as a PDF, not as inline HTML.
// Rendering reuses the browser engine Playwright already brings for the e2e
// suite so the PDF is the same document the client saw and signed, rather than
// a second layout that has to be kept in step with the first.
//
// The renderer is optional on purpose. Playwright is a devDependency and a
// production box may have no browser at all, so every failure path degrades to
// "no PDF" and the caller attaches the HTML instead. Losing the nicer
// attachment is acceptable; losing the sale at the signature screen is not.

const CHROME_CANDIDATES = [
    '/usr/local/bin/google-chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser'
];

let launcher;

function resolveLauncher() {
    if (launcher !== undefined) return launcher;
    try {
        launcher = require('@playwright/test').chromium;
    } catch (_) {
        try {
            launcher = require('playwright').chromium;
        } catch (_ignored) {
            launcher = null;
        }
    }
    return launcher;
}

function resolveChromePath() {
    const fromEnv = (process.env.DIGITALIZEPT_CHROME_PATH || '').trim();
    if (fromEnv) return fromEnv;
    return CHROME_CANDIDATES.find((candidate) => fs.existsSync(candidate)) || '';
}

function launchOptions() {
    const options = { args: ['--no-sandbox', '--disable-dev-shm-usage'] };
    const executablePath = resolveChromePath();
    if (executablePath) options.executablePath = executablePath;
    return options;
}

async function renderContractPdf(html, outPath) {
    const chromium = resolveLauncher();
    if (!chromium) return false;

    let browser = null;
    try {
        browser = await chromium.launch(launchOptions());
        const page = await browser.newPage();
        // The document is self-contained (inline CSS, data-URL signature), so
        // nothing is fetched and 'load' settles immediately.
        await page.setContent(html, { waitUntil: 'load' });
        await page.pdf({
            path: outPath,
            format: 'A4',
            printBackground: true,
            margin: { top: '16mm', bottom: '16mm', left: '14mm', right: '14mm' }
        });
        return fs.existsSync(outPath);
    } catch (err) {
        console.error(`digitalizept: PDF render failed, falling back to HTML (${err.message})`);
        return false;
    } finally {
        if (browser) {
            try { await browser.close(); } catch (_) { /* ignore */ }
        }
    }
}

module.exports = { renderContractPdf };
