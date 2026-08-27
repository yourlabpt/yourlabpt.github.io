/**
 * Fetch a remote image for demo paste (FB/IG CDN URLs fail client CORS).
 * Authenticated callers only. Blocks private/metadata hosts (SSRF).
 */

const MAX_BYTES = 8 * 1024 * 1024;
const FETCH_MS = 12000;
const UA = 'YourLab-DigitalizePortugal/1.0 (https://yourlabpt.com)';

function isPrivateHostname(hostname) {
    const host = String(hostname || '').toLowerCase().replace(/\.$/, '');
    if (!host) return true;
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true;
    if (host === 'metadata.google.internal') return true;
    return false;
}

function isPrivateIp(ip) {
    const s = String(ip || '');
    if (!s) return false;
    if (s === '::1' || s === '0.0.0.0') return true;
    if (s.startsWith('127.') || s.startsWith('10.') || s.startsWith('192.168.') || s.startsWith('169.254.')) {
        return true;
    }
    const m = /^172\.(\d+)\./.exec(s);
    if (m) {
        const n = Number(m[1]);
        if (n >= 16 && n <= 31) return true;
    }
    return false;
}

function looksLikeImageUrl(raw) {
    const url = String(raw || '').trim();
    if (!/^https:\/\//i.test(url) && !/^http:\/\//i.test(url)) return false;
    if (url.length > 2000) return false;
    return true;
}

function validateImageUrl(raw) {
    if (!looksLikeImageUrl(raw)) {
        return { ok: false, error: 'URL de imagem inválido.' };
    }
    let parsed;
    try {
        parsed = new URL(String(raw).trim());
    } catch (_) {
        return { ok: false, error: 'URL de imagem inválido.' };
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        return { ok: false, error: 'Só http(s).' };
    }
    if (isPrivateHostname(parsed.hostname) || isPrivateIp(parsed.hostname)) {
        return { ok: false, error: 'Host não permitido.' };
    }
    return { ok: true, url: parsed.toString() };
}

function withTimeout(ms) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

/**
 * @param {string} rawUrl
 * @returns {Promise<{ ok: true, dataUrl: string, contentType: string } | { ok: false, error: string }>}
 */
async function fetchImageAsDataUrl(rawUrl) {
    const checked = validateImageUrl(rawUrl);
    if (!checked.ok) return checked;

    const wait = withTimeout(FETCH_MS);
    try {
        const response = await fetch(checked.url, {
            method: 'GET',
            redirect: 'follow',
            signal: wait.signal,
            headers: {
                'User-Agent': UA,
                Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8'
            }
        });
        if (!response.ok) {
            return { ok: false, error: 'A imagem não abriu (rede ou permissão).' };
        }
        const finalUrl = response.url || checked.url;
        const finalCheck = validateImageUrl(finalUrl);
        if (!finalCheck.ok) {
            return { ok: false, error: 'Redirect para host não permitido.' };
        }
        const contentType = String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
        if (contentType && !contentType.startsWith('image/')) {
            return { ok: false, error: 'O link não é uma imagem.' };
        }
        const length = Number(response.headers.get('content-length'));
        if (Number.isFinite(length) && length > MAX_BYTES) {
            return { ok: false, error: 'Imagem demasiado grande.' };
        }
        const buf = Buffer.from(await response.arrayBuffer());
        if (!buf.length) return { ok: false, error: 'Imagem vazia.' };
        if (buf.length > MAX_BYTES) return { ok: false, error: 'Imagem demasiado grande.' };
        const type = contentType && contentType.startsWith('image/')
            ? contentType
            : 'image/jpeg';
        return {
            ok: true,
            dataUrl: `data:${type};base64,${buf.toString('base64')}`,
            contentType: type
        };
    } catch (err) {
        if (err && err.name === 'AbortError') {
            return { ok: false, error: 'Demorou demasiado a descarregar a imagem.' };
        }
        return { ok: false, error: 'Não consegui descarregar a imagem.' };
    } finally {
        wait.clear();
    }
}

module.exports = {
    MAX_BYTES,
    validateImageUrl,
    looksLikeImageUrl,
    isPrivateHostname,
    isPrivateIp,
    fetchImageAsDataUrl
};
