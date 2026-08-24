export function formatEuros(centimos) {
    return (Number(centimos || 0) / 100).toLocaleString('pt-PT', {
        style: 'currency',
        currency: 'EUR'
    });
}

export function ptNationalDigits(phone) {
    let digits = String(phone || '').replace(/\D/g, '');
    if (digits.startsWith('00351')) digits = digits.slice(5);
    if (digits.startsWith('351') && digits.length >= 12) digits = digits.slice(3);
    return digits;
}

export function isPortugueseMobile(phone) {
    const digits = ptNationalDigits(phone);
    return digits.length === 9 && digits.startsWith('9');
}

export function whatsappIfMobile(phone) {
    const text = String(phone || '').trim();
    return isPortugueseMobile(text) ? text : '';
}
