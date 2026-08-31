/**
 * IfthenPay "Pay by Link & PINPAY" REST adapter — one hosted checkout page
 * covering Multibanco, MB WAY and card. Real API, verified against the
 * published OpenAPI spec (https://www.ifthenpay.com/docs/en/api/pbl/).
 *
 * Needs env vars to actually charge anyone:
 *   IFTHENPAY_GATEWAY_KEY        — issued by ifthenpay to the merchant account
 *   IFTHENPAY_ANTIPHISHING_KEY   — chosen by us, registered with ifthenpay via
 *                                  the one-off `printCallbackActivationCurl()`
 *                                  call below (run once from the backoffice,
 *                                  not on every boot)
 * Until both are set, createCheckout() throws instead of pretending to work —
 * a self-serve site publish must never claim "paid" without a real charge.
 */

const API_BASE = 'https://api.ifthenpay.com/gateway/pinpay';

function isConfigured() {
    return Boolean(process.env.IFTHENPAY_GATEWAY_KEY && process.env.IFTHENPAY_ANTIPHISHING_KEY);
}

/**
 * @param {{ orderId: string, amountCents: number, description: string,
 *   successUrl: string, errorUrl: string, cancelUrl: string, returnUrl: string }} input
 * @returns {Promise<{ redirectUrl: string, pinCode: string }>}
 */
async function createCheckout({
    orderId, amountCents, description, successUrl, errorUrl, cancelUrl, returnUrl
}) {
    const gatewayKey = process.env.IFTHENPAY_GATEWAY_KEY;
    if (!gatewayKey) {
        throw new Error('IFTHENPAY_GATEWAY_KEY não configurada — pagamentos desligados.');
    }
    // ifthenpay's `id` is capped at 15 chars — see Request-PBL in the OpenAPI spec.
    const id = String(orderId || '').slice(0, 15);
    if (!id) throw new Error('orderId em falta.');

    const amount = (Number(amountCents) / 100).toFixed(2);
    const body = {
        id,
        amount,
        description: String(description || '').slice(0, 200),
        success_url: successUrl,
        error_url: errorUrl,
        cancel_url: cancelUrl,
        btnCloseUrl: returnUrl || successUrl,
        btnCloseLabel: 'Voltar',
        lang: 'pt'
    };

    const response = await fetch(`${API_BASE}/${encodeURIComponent(gatewayKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.RedirectUrl) {
        const msg = (data && (data.Message || data.message)) || `HTTP ${response.status}`;
        throw new Error(`ifthenpay: ${msg}`);
    }
    return { redirectUrl: data.RedirectUrl, pinCode: data.PinCode || '' };
}

/**
 * Verifies an incoming payment-confirmation callback against our own
 * anti-phishing key (never trust the callback without this — anyone could
 * otherwise POST a fake "paid" event).
 * @param {{ key?: string, id?: string, amount?: string, payment_method?: string, payment_datetime?: string }} query
 */
function verifyCallback(query = {}) {
    const expected = process.env.IFTHENPAY_ANTIPHISHING_KEY || '';
    const got = String(query.key || '').trim();
    const ok = Boolean(expected) && got === expected;
    return {
        ok,
        orderId: String(query.id || '').trim(),
        amount: String(query.amount || '').trim(),
        method: String(query.payment_method || '').trim(),
        paidAt: String(query.payment_datetime || '').trim()
    };
}

/**
 * One-off setup, not called at runtime: registers our webhook URL with
 * ifthenpay so it starts sending payment-confirmation callbacks. Run this
 * once (from a node -e one-liner or a REPL) whenever the callback URL or
 * anti-phishing key changes — it needs the Backoffice key from the ifthenpay
 * merchant portal, which we never store in this app.
 */
function printCallbackActivationCurl({ boKey, callbackUrl }) {
    const gatewayKey = process.env.IFTHENPAY_GATEWAY_KEY || '<IFTHENPAY_GATEWAY_KEY>';
    const apKey = process.env.IFTHENPAY_ANTIPHISHING_KEY || '<IFTHENPAY_ANTIPHISHING_KEY>';
    const urlCb = `${callbackUrl}?key=[ANTI_PHISHING_KEY]&id=[ID]&amount=[AMOUNT]&payment_datetime=[PAYMENT_DATETIME]&payment_method=[PAYMENT_METHOD]`;
    const body = JSON.stringify({ boKey, gatewayKey, apKey, urlCb });
    return `curl -X POST ${API_BASE}/callback/activation -H 'Content-Type: application/json' -d '${body}'`;
}

module.exports = {
    isConfigured,
    createCheckout,
    verifyCallback,
    printCallbackActivationCurl
};
