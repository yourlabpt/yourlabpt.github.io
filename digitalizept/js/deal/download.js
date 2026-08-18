import { getToken } from '../auth.js';

export function contractSlugName(nome) {
    return String(nome || 'contrato')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\w-]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 60) || 'contrato';
}

export async function downloadDealContract({
    projectId,
    nome,
    onUnauthorized,
    fallback
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
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                const ext = (response.headers.get('content-type') || '').includes('pdf') ? 'pdf' : 'html';
                const cd = response.headers.get('content-disposition') || '';
                const named = /filename\*?=(?:UTF-8'')?["']?([^";]+)/i.exec(cd);
                a.href = url;
                a.download = named
                    ? decodeURIComponent(named[1].trim())
                    : `${contractSlugName(nome)}-contrato.${ext}`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                setTimeout(() => URL.revokeObjectURL(url), 2000);
                return true;
            }
        } catch (_) { /* fall through */ }
    }
    if (typeof fallback === 'function') return fallback();
    return false;
}
