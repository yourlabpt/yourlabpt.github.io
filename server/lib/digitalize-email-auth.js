/**
 * Real "Sign in with email" for the self-serve app — a one-time code sent
 * to the person's inbox via the same SMTP transporter the rest of the site
 * already uses for notifications. isConfigured() gates the feature; nothing
 * here ever fakes a result when SMTP isn't set up.
 */
const crypto = require('crypto');

const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 30 * 1000;
const MAX_ATTEMPTS = 5;

// token -> { email, code, expiresAt, attempts, lastSentAt }
const pending = new Map();

function isConfigured() {
    return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function generateCode() {
    return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

function secondsUntilResend(token) {
    const entry = pending.get(token);
    if (!entry) return 0;
    const remaining = entry.lastSentAt + RESEND_COOLDOWN_MS - Date.now();
    return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
}

/** Issues (or re-issues) a code for this session token + email. Throws {status,message} if asked too soon. */
function issueCode(token, email) {
    const wait = secondsUntilResend(token);
    if (wait > 0) {
        const err = new Error(`Aguarde ${wait}s antes de pedir outro código.`);
        err.status = 429;
        throw err;
    }
    const code = generateCode();
    pending.set(token, { email, code, expiresAt: Date.now() + CODE_TTL_MS, attempts: 0, lastSentAt: Date.now() });
    return code;
}

/** Verifies a code for this session token + email. Throws {status,message} on any mismatch/expiry/abuse. */
function verifyCode(token, email, code) {
    const entry = pending.get(token);
    if (!entry || entry.email !== email) {
        const err = new Error('Peça um código novo.');
        err.status = 400;
        throw err;
    }
    if (Date.now() > entry.expiresAt) {
        pending.delete(token);
        const err = new Error('O código expirou. Peça um novo.');
        err.status = 400;
        throw err;
    }
    entry.attempts += 1;
    if (entry.attempts > MAX_ATTEMPTS) {
        pending.delete(token);
        const err = new Error('Demasiadas tentativas. Peça um código novo.');
        err.status = 429;
        throw err;
    }
    if (entry.code !== String(code || '').trim()) {
        const err = new Error('Código incorreto.');
        err.status = 400;
        throw err;
    }
    pending.delete(token);
    return true;
}

module.exports = { isConfigured, issueCode, verifyCode };
