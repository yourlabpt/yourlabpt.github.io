/**
 * Real "Sign in with Google" for the self-serve app — verifies the ID token
 * Google Identity Services hands back client-side, the same trust boundary
 * pattern as digitalizept-payments.js: isConfigured() gates the feature,
 * nothing here ever fakes a result when the client ID isn't set.
 */
const { OAuth2Client } = require('google-auth-library');

function clientId() {
    return process.env.GOOGLE_CLIENT_ID || '';
}

function isConfigured() {
    return Boolean(clientId());
}

let client = null;
function getClient() {
    if (!client) client = new OAuth2Client(clientId());
    return client;
}

/**
 * Verifies a Google Identity Services credential (ID token JWT) and returns
 * the person's name/email — throws if the token is missing, expired, or
 * signed for a different client ID than ours.
 */
async function verifyIdToken(credential) {
    if (!isConfigured()) throw new Error('Google sign-in não está configurado.');
    if (!credential || typeof credential !== 'string') throw new Error('Credencial em falta.');
    const ticket = await getClient().verifyIdToken({ idToken: credential, audience: clientId() });
    const payload = ticket.getPayload();
    if (!payload) throw new Error('Não foi possível validar a conta Google.');
    return {
        nome: String(payload.name || '').trim(),
        email: String(payload.email || '').trim(),
        emailVerificado: Boolean(payload.email_verified)
    };
}

module.exports = { isConfigured, verifyIdToken, clientId };
