/**
 * Install-to-home-screen support. Android/desktop Chrome & Edge fire
 * `beforeinstallprompt`, which we defer and trigger from our own banner
 * (nicer than the browser's default mini-infobar). iOS/iPadOS Safari never
 * fires that event — Apple only allows installing via the Share sheet — so
 * there we show instructions instead of a button that would do nothing.
 */
const SW_URL = '/digitalize/sw.js';
const SW_SCOPE = '/digitalize/';
const DISMISS_KEY = 'digitalize_install_dismissed_at';
const DISMISS_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function registerDigitalizeSw() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register(SW_URL, { scope: SW_SCOPE, updateViaCache: 'none' }).catch(() => {});
}

export function isStandaloneApp() {
    try {
        return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    } catch (_) {
        return false;
    }
}

function isIOS() {
    const ua = window.navigator.userAgent || '';
    const platform = window.navigator.platform || '';
    // iPadOS 13+ reports as "MacIntel" with touch support, unlike a real Mac.
    return /iPad|iPhone|iPod/.test(ua) || (platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function wasDismissedRecently() {
    try {
        const at = Number(localStorage.getItem(DISMISS_KEY) || 0);
        return Boolean(at) && (Date.now() - at) < DISMISS_COOLDOWN_MS;
    } catch (_) {
        return false;
    }
}

export function dismissInstallPrompt() {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch (_) { /* ignore */ }
}

let deferredPrompt = null;

/** onPromptable(kind) fires with 'android' (has a native prompt to trigger) or 'ios' (Share-sheet instructions only). */
export function setupInstallPrompt(onPromptable) {
    if (isStandaloneApp() || wasDismissedRecently()) return;

    window.addEventListener('beforeinstallprompt', (event) => {
        event.preventDefault();
        deferredPrompt = event;
        onPromptable('android');
    });
    window.addEventListener('appinstalled', () => { deferredPrompt = null; });

    if (isIOS()) onPromptable('ios');
}

export async function triggerInstall() {
    if (!deferredPrompt) return null;
    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    deferredPrompt = null;
    return choice.outcome; // 'accepted' | 'dismissed'
}
