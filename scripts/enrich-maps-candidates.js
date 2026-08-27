#!/usr/bin/env node
/**
 * Enrich Google Maps share URLs for Digitalize Portugal street leads.
 *
 * Uses the same path as the admin «Preencher pelo link» button:
 * parse Maps URL → Nominatim → OSM Overpass. Does NOT scrape Google or Facebook HTML.
 *
 * Usage:
 *   node scripts/enrich-maps-candidates.js candidates.txt
 *   node scripts/enrich-maps-candidates.js candidates.txt --out enriched.json
 *
 * Input: one Maps URL per line (comments with # allowed).
 * Output: JSON array of { url, ok, dados, businessTypeId, lat, lng, notes, error? }
 */
const fs = require('fs');
const path = require('path');

const { lookupFromMaps } = require('../server/lib/digitalizept-maps-lookup.js');

function parseArgs(argv) {
    const args = { input: '', out: '' };
    const rest = argv.slice(2);
    for (let i = 0; i < rest.length; i += 1) {
        if (rest[i] === '--out' && rest[i + 1]) {
            args.out = rest[++i];
        } else if (!rest[i].startsWith('-') && !args.input) {
            args.input = rest[i];
        }
    }
    return args;
}

function readUrls(filePath) {
    const raw = fs.readFileSync(filePath, 'utf8');
    return raw
        .split(/\n+/)
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('#'));
}

async function main() {
    const args = parseArgs(process.argv);
    if (!args.input) {
        console.error('Usage: node scripts/enrich-maps-candidates.js <candidates.txt> [--out enriched.json]');
        process.exit(1);
    }
    const inputPath = path.resolve(process.cwd(), args.input);
    if (!fs.existsSync(inputPath)) {
        console.error(`File not found: ${inputPath}`);
        process.exit(1);
    }
    const urls = readUrls(inputPath);
    if (!urls.length) {
        console.error('No URLs in input file.');
        process.exit(1);
    }

    const results = [];
    for (let i = 0; i < urls.length; i += 1) {
        const url = urls[i];
        process.stderr.write(`[${i + 1}/${urls.length}] ${url.slice(0, 72)}…\n`);
        try {
            const data = await lookupFromMaps({ url });
            if (data && data.ok === false) {
                results.push({
                    url,
                    ok: false,
                    error: data.error || 'Lookup failed'
                });
            } else {
                results.push({
                    url,
                    ok: true,
                    dados: data.dados || {},
                    businessTypeId: data.businessTypeId || '',
                    lat: data.lat,
                    lng: data.lng,
                    notes: data.notes || []
                });
            }
        } catch (err) {
            results.push({
                url,
                ok: false,
                error: (err && err.message) || String(err)
            });
        }
        // Be gentle with Nominatim / Overpass
        await new Promise((r) => setTimeout(r, 1200));
    }

    const json = `${JSON.stringify(results, null, 2)}\n`;
    if (args.out) {
        const outPath = path.resolve(process.cwd(), args.out);
        fs.writeFileSync(outPath, json, 'utf8');
        process.stderr.write(`Wrote ${results.length} rows to ${outPath}\n`);
    } else {
        process.stdout.write(json);
    }

    const failed = results.filter((r) => !r.ok).length;
    process.stderr.write(`Done. ok=${results.length - failed} failed=${failed}\n`);
    process.exit(failed ? 2 : 0);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
