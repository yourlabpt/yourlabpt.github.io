import { getToken } from '../auth.js';

export function contractSlugName(nome) {
    return String(nome || 'contrato')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\w-]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 60) || 'contrato';
}

function saveBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function downloadPdfFromHtml(html, nome, onUnauthorized) {
    const response = await fetch('/api/digitalizept/contract-pdf', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-admin-token': getToken()
        },
        body: JSON.stringify({ html, nome: nome || '' })
    });
    if (response.status === 401) {
        if (typeof onUnauthorized === 'function') onUnauthorized();
        return false;
    }
    if (!response.ok) return false;
    const blob = await response.blob();
    if (!blob || blob.size < 8) return false;
    saveBlob(blob, `${contractSlugName(nome)}-contrato.pdf`);
    return true;
}

export async function downloadDealContract({
    projectId,
    nome,
    onUnauthorized,
    html
}) {
    if (projectId) {
        try {
            const response = await fetch(
                `/api/digitalizept/deals/${encodeURIComponent(projectId)}/contract`,
                { headers: { 'x-admin-token': getToken() } }
            );
            if (response.status === 401) {
                if (typeof onUnauthorized === 'function') onUnauthorized();
                return false;
            }
            if (response.ok) {
                const blob = await response.blob();
                const type = (response.headers.get('content-type') || blob.type || '').toLowerCase();
                if (type.includes('pdf') || (blob.size > 4 && type.indexOf('html') === -1)) {
                    const cd = response.headers.get('content-disposition') || '';
                    const named = /filename\*?=(?:UTF-8'')?["']?([^";]+)/i.exec(cd);
                    const filename = named
                        ? decodeURIComponent(named[1].trim())
                        : `${contractSlugName(nome)}-contrato.pdf`;
                    saveBlob(blob, filename.endsWith('.pdf') ? filename : `${filename}.pdf`);
                    return true;
                }
            }
        } catch (_) { /* try HTML conversion next */ }
    }
    if (html) return downloadPdfFromHtml(html, nome, onUnauthorized);
    return false;
}
