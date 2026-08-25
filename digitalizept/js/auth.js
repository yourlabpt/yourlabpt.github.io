import { TOKEN_KEY } from './config.js';

const SELLER_COOKIE = 'digitalizept_seller=1; Path=/; SameSite=Lax; Max-Age=2592000';
const SELLER_COOKIE_CLEAR = 'digitalizept_seller=; Path=/; SameSite=Lax; Max-Age=0';

function setSellerCookie() {
    try { document.cookie = SELLER_COOKIE; } catch (_) { /* ignore */ }
}

function clearSellerCookie() {
    try { document.cookie = SELLER_COOKIE_CLEAR; } catch (_) { /* ignore */ }
}

export function getToken() {
    const token = sessionStorage.getItem(TOKEN_KEY) || '';
    if (token) setSellerCookie();
    return token;
}

export function setToken(token) {
    sessionStorage.setItem(TOKEN_KEY, token);
    setSellerCookie();
}

export function clearToken() {
    sessionStorage.removeItem(TOKEN_KEY);
    clearSellerCookie();
}
