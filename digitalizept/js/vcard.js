function escapeVcard(value) {
    return String(value || '')
        .replace(/\\/g, '\\\\')
        .replace(/\n/g, '\\n')
        .replace(/,/g, '\\,')
        .replace(/;/g, '\\;');
}

function telForVcard(phone) {
    const digits = String(phone || '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.startsWith('351')) return `+${digits}`;
    if (digits.length === 9) return `+351${digits}`;
    return digits.startsWith('+') ? digits : `+${digits}`;
}

function slugFilename(name) {
    const slug = String(name || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 40);
    return slug || 'contacto';
}

export function buildVcard({ fn, tel, email, street, city } = {}) {
    const name = String(fn || '').trim() || 'Negócio';
    const lines = [
        'BEGIN:VCARD',
        'VERSION:3.0',
        `FN:${escapeVcard(name)}`,
        `ORG:${escapeVcard(name)}`
    ];
    const cell = telForVcard(tel);
    if (cell) lines.push(`TEL;TYPE=CELL:${cell}`);
    if (email) lines.push(`EMAIL:${escapeVcard(email)}`);
    if (street || city) {
        lines.push(`ADR;TYPE=WORK:;;${escapeVcard(street)};${escapeVcard(city)};;;Portugal`);
    }
    lines.push('END:VCARD');
    return `${lines.join('\r\n')}\r\n`;
}

export function vcardFilename(fn) {
    return `${slugFilename(fn)}.vcf`;
}

export function downloadVcard(card, filename) {
    const blob = new Blob([card], { type: 'text/vcard;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'contacto.vcf';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
