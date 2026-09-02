/**
 * Stripe Checkout adapter — replaces the ifthenpay/PINPAY integration
 * (digitalizept-payments.js, kept on disk unwired) for the self-serve
 * /digitalize app. One-time payment via a Stripe-hosted Checkout Session.
 *
 * Fulfillment must be driven entirely from the webhook handler (see
 * server.js's /api/digitalize/callback/stripe), never from the success page —
 * a customer isn't guaranteed to reach the success page even after paying
 * successfully (lost connection, closed tab, etc).
 *
 * Needs env vars to actually charge anyone:
 *   STRIPE_SECRET_KEY      — a restricted API key (rk_...), scoped to just
 *                            Checkout Sessions + Webhook Endpoints, from
 *                            https://dashboard.stripe.com/apikeys
 *   STRIPE_WEBHOOK_SECRET  — the signing secret (whsec_...) for the webhook
 *                            endpoint registered at
 *                            https://dashboard.stripe.com/webhooks
 * Until both are set, createCheckout() throws instead of pretending to work —
 * a self-serve site publish must never claim "paid" without a real charge.
 */
const Stripe = require('stripe');

const API_VERSION = '2026-08-26.dahlia';

let client = null;
function getClient() {
    if (!client) {
        const key = process.env.STRIPE_SECRET_KEY;
        if (!key) throw new Error('STRIPE_SECRET_KEY não configurada — pagamentos desligados.');
        client = new Stripe(key, { apiVersion: API_VERSION });
    }
    return client;
}

function isConfigured() {
    return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET);
}

/**
 * @param {{ orderId: string, amountCents: number, description: string,
 *   customerEmail?: string, successUrl: string, cancelUrl: string }} input
 * @returns {Promise<{ redirectUrl: string, sessionId: string }>}
 */
async function createCheckout({ orderId, amountCents, description, customerEmail, successUrl, cancelUrl }) {
    if (!isConfigured()) throw new Error('Stripe não está configurado — pagamentos desligados.');
    const id = String(orderId || '').slice(0, 200);
    if (!id) throw new Error('orderId em falta.');
    const stripe = getClient();

    // No payment_method_types here on purpose — Stripe picks the best eligible
    // methods per Dashboard config (dynamic payment methods), which is the
    // recommended default over hardcoding a fixed list.
    const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        client_reference_id: id,
        metadata: { orderId: id },
        customer_email: customerEmail || undefined,
        line_items: [{
            price_data: {
                currency: 'eur',
                unit_amount: Math.round(Number(amountCents)),
                product_data: { name: String(description || 'Digitalize').slice(0, 200) }
            },
            quantity: 1
        }],
        success_url: successUrl,
        cancel_url: cancelUrl
    });
    if (!session.url) throw new Error('Stripe: sessão de checkout sem URL.');
    return { redirectUrl: session.url, sessionId: session.id };
}

/**
 * Verifies and parses an incoming Stripe webhook event. Must be called with
 * the exact raw request body (see server.js's express.json() verify callback,
 * which stashes it on req.rawBody) — the signature check needs the precise
 * bytes Stripe signed, not a re-serialized JSON object.
 * @param {string} rawBody
 * @param {string} signature — the Stripe-Signature request header
 */
function constructEvent(rawBody, signature) {
    const stripe = getClient();
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET não configurada.');
    return stripe.webhooks.constructEvent(rawBody, signature, secret);
}

module.exports = { isConfigured, createCheckout, constructEvent };
