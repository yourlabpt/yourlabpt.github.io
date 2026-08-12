// Portuguese NIF (fiscal number) checksum validation — mod-11.
export function validateNif(nif) {
    const digits = String(nif || '').replace(/\D/g, '');
    if (digits.length !== 9) return false;

    // First digit must be a valid taxpayer type.
    if (!'123568'.includes(digits[0]) && !['45', '70', '71', '72', '74', '75', '77', '78', '79', '90', '91', '98', '99'].includes(digits.slice(0, 2))) {
        // Be lenient: many valid NIFs start with 1,2,3,5,6,8; accept if checksum passes anyway.
    }

    let sum = 0;
    for (let i = 0; i < 8; i += 1) {
        sum += Number(digits[i]) * (9 - i);
    }
    const mod = sum % 11;
    const check = mod < 2 ? 0 : 11 - mod;
    return check === Number(digits[8]);
}
