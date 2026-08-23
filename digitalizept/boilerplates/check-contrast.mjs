#!/usr/bin/env node
/** WCAG contrast checks for Sem fotos palettes. Hard-fail on body text; warn on accent-as-text. */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { accentInk, contrastRatio, onColor } from '../js/demo/colors.js';

const MIN = 4.5;

export function checkPalettes(palettes, { warn = console.warn, error = console.error } = {}) {
    let hardFail = 0;
    const warnings = [];
    palettes.forEach((p) => {
        const id = p.id;
        const body = contrastRatio(p.ink, p.bg);
        if (body < MIN) {
            error(`HARD ${id}: --ink on --bg is ${body.toFixed(2)}:1 (need ${MIN})`);
            hardFail += 1;
        }
        const accentAsText = contrastRatio(p.accent, p.bg);
        const accentInkVal = p.accentInk || accentInk(p.accent, p.bg);
        if (accentAsText < MIN && p.accentUsedAsText !== false) {
            const msg = `WARN ${id}: --accent as text is ${accentAsText.toFixed(2)}:1 → use --accent-ink ${accentInkVal}`;
            warnings.push(msg);
            warn(msg);
        }
        if (p.accent2 && p.accent2UsedAsText !== false) {
            const a2 = contrastRatio(p.accent2, p.bg);
            const a2Ink = p.accent2Ink || accentInk(p.accent2, p.bg);
            if (a2 < MIN) {
                const msg = `WARN ${id}: --accent2 as text is ${a2.toFixed(2)}:1 → use --accent2-ink ${a2Ink}`;
                warnings.push(msg);
                warn(msg);
            }
        }
        const onAccent = onColor(p.accent);
        const onRatio = contrastRatio(onAccent, p.accentSolid || p.accent);
        if (onRatio < MIN) {
            const msg = `WARN ${id}: on-accent ${onAccent} on fill is ${onRatio.toFixed(2)}:1`;
            warnings.push(msg);
            warn(msg);
        }
        const inkToken = p.accentInk || p.accent;
        if (p.accentUsedAsText !== false && contrastRatio(inkToken, p.bg) < MIN) {
            error(`HARD ${id}: --accent-ink ${inkToken} on --bg fails ${MIN}:1`);
            hardFail += 1;
        }
    });
    return { hardFail, warnings };
}

function parseRootTokens(css) {
    const grab = (name) => {
        const match = css.match(new RegExp(`--${name}\\s*:\\s*(#[0-9a-fA-F]{3,8})`));
        return match ? match[1] : '';
    };
    return {
        bg: grab('bg'),
        ink: grab('ink'),
        accent: grab('accent'),
        accent2: grab('accent-2') || grab('accent2'),
        accentInk: grab('accent-ink'),
        accent2Ink: grab('accent2-ink'),
        accentSolid: grab('accent-solid')
    };
}

async function main() {
    const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'css');
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.css') && f !== 'dpl-base.css');
    const palettes = files.map((file) => {
        const css = fs.readFileSync(path.join(dir, file), 'utf8');
        return { id: file.replace(/\.css$/, ''), ...parseRootTokens(css) };
    });
    const { hardFail } = checkPalettes(palettes);
    if (hardFail) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    main().catch((err) => {
        console.error(err);
        process.exit(1);
    });
}
