/**
 * Seller cues: what left the live venda goes to Admin.
 * Controlo / Demo / Ficha already fulfill — do not rebuild forms here.
 */

export const ADMIN_HINTS = {
    ficha: 'O resto da ficha (textos, extras do ofício) fica no admin → Dados da loja.',
    demo: 'Fotos, logo e paleta a sério: no admin → separador Demo.',
    controlo: 'Email, WhatsApp e ligações: no admin → O que fazer agora (Controlo).',
    agoraNao: 'Demo gravada. Segue no Controlo desta lead — EMAIL1 e WhatsApp.',
    extras: 'Mais extras e IVA: no admin → Mais → Continuar venda.',
    ownershipClose: 'A partir de agora isto é vosso — não está no Facebook de ninguém.'
};

export function appendAdminHint(host, key) {
    const text = ADMIN_HINTS[key];
    if (!host || !text) return null;
    const p = document.createElement('p');
    p.className = 'ask-hint admin-redirect-hint';
    p.textContent = text;
    host.appendChild(p);
    return p;
}
