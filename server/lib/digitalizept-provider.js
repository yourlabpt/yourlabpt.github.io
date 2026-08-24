/**
 * Who is sending as YourLab: env defaults, overridable in the app.
 * Company fiscal identity stays in env; only the person (and their contact) is editable.
 */

const SETTING_KEY = 'provider';

function clip(value, max) {
    return String(value == null ? '' : value).trim().slice(0, max);
}

function normalizeArtigo(value) {
    return String(value || '').trim().toLowerCase() === 'a' ? 'a' : 'o';
}

function parseOverlay(raw) {
    try {
        const parsed = JSON.parse(raw || '');
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (_) {
        return {};
    }
}

function mergeProvider(base, overlay) {
    const env = base && typeof base === 'object' ? base : {};
    const over = overlay && typeof overlay === 'object' ? overlay : {};
    return {
        nome: clip(env.nome, 120) || 'YourLab',
        nif: clip(env.nif, 20),
        morada: clip(env.morada, 300),
        site: clip(env.site, 120) || 'yourlabpt.com',
        iban: clip(env.iban, 40),
        mbway: clip(env.mbway, 40),
        responsavel: clip(over.responsavel, 120) || clip(env.responsavel, 120) || 'Túlio Soares',
        artigo: over.artigo != null && String(over.artigo).trim() !== ''
            ? normalizeArtigo(over.artigo)
            : normalizeArtigo(env.artigo),
        telefone: clip(over.telefone, 40) || clip(env.telefone, 40) || clip(env.mbway, 40),
        email: clip(over.email, 160) || clip(env.email, 160)
    };
}

function sanitizeSender(body) {
    const responsavel = clip(body && body.responsavel, 120);
    if (!responsavel) {
        return { error: 'Indique o nome de quem envia.' };
    }
    return {
        sender: {
            responsavel,
            artigo: normalizeArtigo(body && body.artigo),
            telefone: clip(body && body.telefone, 40),
            email: clip(body && body.email, 160)
        }
    };
}

function loadProviderOverlay(db) {
    if (!db) return {};
    const row = db.prepare('SELECT value FROM app_setting WHERE key = ?').get(SETTING_KEY);
    return parseOverlay(row && row.value);
}

function saveProviderOverlay(db, sender, nowIso) {
    const stamp = typeof nowIso === 'function' ? nowIso() : (nowIso || new Date().toISOString());
    const value = JSON.stringify({
        responsavel: clip(sender.responsavel, 120),
        artigo: normalizeArtigo(sender.artigo),
        telefone: clip(sender.telefone, 40),
        email: clip(sender.email, 160)
    });
    db.prepare(`
        INSERT INTO app_setting (key, value, actualizado_em) VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, actualizado_em = excluded.actualizado_em
    `).run(SETTING_KEY, value, stamp);
}

function currentProvider(db, envBase) {
    return mergeProvider(envBase, loadProviderOverlay(db));
}

function formatSmtpFrom(provider, mailbox) {
    const raw = String(mailbox || '').trim();
    const name = String((provider && (provider.responsavel || provider.vendedorNome)) || '').replace(/[\r\n"]/g, '').trim();
    const angled = raw.match(/<([^>]+)>/);
    const addr = (angled ? angled[1] : (raw.match(/[^\s<]+@[^\s>]+/) || [''])[0]).trim();
    if (!name || !addr) return raw;
    return `"${name} — YourLab" <${addr}>`;
}

module.exports = {
    SETTING_KEY,
    normalizeArtigo,
    mergeProvider,
    sanitizeSender,
    loadProviderOverlay,
    saveProviderOverlay,
    currentProvider,
    formatSmtpFrom
};
