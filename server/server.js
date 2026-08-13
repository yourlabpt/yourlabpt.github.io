const { loadEnv } = require('./lib/load-env');
const loadedEnvPath = loadEnv();
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');
const nodemailer = require('nodemailer');
const { createAdminAuth } = require('./lib/admin-auth');
const { createProjectShowcaseStore } = require('./lib/project-showcase-store');
const { getDb: getDigitalizeptDb, nowIso: digitalizeptNow, logEvento: digitalizeptLogEvento } = require('./lib/digitalizept-db');
const { renderContractPdf } = require('./lib/digitalizept-pdf');
const { scaffoldClosedDeal } = require('./lib/digitalizept-work');
const { writeDemoFolder } = require('./lib/digitalizept-demos');
const {
    mapsApiKey,
    isValidCobertura,
    geocodeLeadRow,
    COBERTURA_VALUES,
    COBERTURA_LABELS,
    COBERTURA_COLORS
} = require('./lib/digitalizept-geocode');
const { createRateLimiter } = require('./lib/rate-limit');
const { findAvailableDomains } = require('./lib/digitalizept-domains');
const { registerRequirementsPlatform } = require('../projects/api');
const { validateAgentConnectionConfig } = require('../projects/lib/agent-connection-mode');

const app = express();
app.set('trust proxy', 'loopback');
const PORT = process.env.PORT || 3000;
const CHAT_SESSION_TTL_MS = Number(process.env.CHAT_SESSION_TTL_MS || 45 * 60 * 1000);
const AGENT_CONNECTION_MODE = validateAgentConnectionConfig(process.env);

if (loadedEnvPath) {
    console.log('Environment loaded from:', loadedEnvPath);
}

// Ollama local LLM configuration
const OLLAMA_BASE_URL = (process.env.OLLAMA_BASE_URL || 'http://localhost:11434/v1').replace(/\/$/, '');
const OLLAMA_MODEL_BIG  = process.env.OLLAMA_MODEL_BIG  || 'llama3.1:8b';
const OLLAMA_MODEL_SMALL = process.env.OLLAMA_MODEL_SMALL || 'phi3:mini';
// Number of prior turns before we upgrade to the big model
const SMALL_MODEL_TURNS = Number(process.env.SMALL_MODEL_TURNS || 2);
// Max time to wait for a model response before falling back (ms)
const MODEL_TIMEOUT_MS = Number(process.env.MODEL_TIMEOUT_MS || 30000);
// Keep the context and generation small for CPU-bound machines.
const CHAT_HISTORY_TURNS = Math.max(1, Number(process.env.CHAT_HISTORY_TURNS || 4));
const MODEL_MAX_TOKENS = Math.max(80, Number(process.env.MODEL_MAX_TOKENS || 180));
const MODEL_TEMPERATURE = Number.isFinite(Number(process.env.MODEL_TEMPERATURE))
    ? Number(process.env.MODEL_TEMPERATURE)
    : 0.35;
const MODEL_NUM_CTX = Math.max(1024, Number(process.env.MODEL_NUM_CTX || 3072));
const KNOWLEDGE_CHUNK_MAX_CHARS = Math.max(220, Number(process.env.KNOWLEDGE_CHUNK_MAX_CHARS || 420));
const KNOWLEDGE_SNIPPETS_PER_TURN = Math.max(0, Number(process.env.KNOWLEDGE_SNIPPETS_PER_TURN || 2));
const KNOWLEDGE_SNIPPET_MAX_CHARS = Math.max(120, Number(process.env.KNOWLEDGE_SNIPPET_MAX_CHARS || 280));
const STICKY_JS_FALLBACK = String(process.env.STICKY_JS_FALLBACK || 'true').toLowerCase() !== 'false';
const MAX_AI_TURNS_WITHOUT_CONTACT = Math.max(0, Number(process.env.MAX_AI_TURNS_WITHOUT_CONTACT || 8));
const CHAT_MODE = String(process.env.CHAT_MODE || 'auto').trim().toLowerCase();
const FORCE_OFFLINE_CHAT = CHAT_MODE === 'offline';
const SEARCH_STOP_WORDS = new Set([
    'the', 'and', 'for', 'with', 'that', 'this', 'from', 'your', 'you', 'are', 'have', 'will', 'about', 'into', 'what',
    'como', 'para', 'com', 'que', 'uma', 'um', 'dos', 'das', 'nos', 'nas', 'por', 'esta', 'este', 'isso', 'isto',
    'seu', 'sua', 'teu', 'tua', 'tambem', 'mais', 'menos', 'sobre', 'qual', 'quando', 'onde', 'porque', 'very', 'just',
    'yourlab', 'alex'
]);

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'yourlab-admin';
const adminAuth = createAdminAuth({
    password: ADMIN_PASSWORD,
    tokenTtlMs: 8 * 60 * 60 * 1000
});
const requireAdmin = adminAuth.requireAdmin;

// Digitalize Portugal — sales app master key. Separate from ADMIN_PASSWORD on purpose:
// this key gets shared with whoever is out selling, admin access does not.
const DIGITALIZEPT_KEY = process.env.DIGITALIZEPT_KEY || 'digitalizept-key';
if (process.env.NODE_ENV === 'production' && DIGITALIZEPT_KEY === 'digitalizept-key') {
    throw new Error('DIGITALIZEPT_KEY must be set to a non-default value in production.');
}
if (DIGITALIZEPT_KEY === 'digitalizept-key') {
    console.warn('digitalizept: using the default key. Set DIGITALIZEPT_KEY before sharing this app.');
}
const digitalizeptAuth = createAdminAuth({
    password: DIGITALIZEPT_KEY,
    tokenTtlMs: 12 * 60 * 60 * 1000
});
const requireDigitalizept = digitalizeptAuth.requireAdmin;

// IVA regime for Digitalize Portugal. A fraction, not a percentage. Set to 0 for
// the art. 53.o isencao regime: no IVA is charged and the contract says so.
// Crossing the threshold is a one-line change here, no code edit.
const DIGITALIZEPT_IVA_RATE = (() => {
    const raw = process.env.DIGITALIZEPT_IVA_RATE;
    if (raw === undefined || raw === '') return 0.23;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
        console.error(`digitalizept: invalid DIGITALIZEPT_IVA_RATE "${raw}", falling back to 0.23`);
        return 0.23;
    }
    return parsed;
})();

// Prestador fiscal identity. Kept in env so a contract is never signed against a
// placeholder and the NIF is not baked into client-side JS.
const DIGITALIZEPT_PROVIDER = {
    nome: cleanText(process.env.YOURLAB_NOME, 120) || 'YourLab',
    responsavel: cleanText(process.env.YOURLAB_RESPONSAVEL, 120) || 'Túlio Soares',
    nif: cleanText(process.env.YOURLAB_NIF, 20),
    morada: cleanText(process.env.YOURLAB_MORADA, 300),
    email: cleanText(process.env.YOURLAB_EMAIL, 160) || cleanText(process.env.SMTP_USER, 160),
    site: cleanText(process.env.YOURLAB_SITE, 120) || 'yourlabpt.com',
    iban: cleanText(process.env.YOURLAB_IBAN, 40),
    mbway: cleanText(process.env.YOURLAB_MBWAY, 40)
};

const ollamaClient = FORCE_OFFLINE_CHAT
    ? null
    : new OpenAI({
        baseURL: OLLAMA_BASE_URL,
        apiKey: 'ollama'  // Ollama ignores this but the SDK requires it
    });

// Load company knowledge base once at startup
let COMPANY_KNOWLEDGE = '';
try {
    COMPANY_KNOWLEDGE = fs.readFileSync(path.join(__dirname, 'company-knowledge.md'), 'utf8').trim();
    console.log('Company knowledge base loaded (' + COMPANY_KNOWLEDGE.length + ' chars)');
} catch (e) {
    console.warn('company-knowledge.md not found — agent will run without it:', e.message);
}

const KNOWLEDGE_INDEX = buildKnowledgeIndex(COMPANY_KNOWLEDGE, KNOWLEDGE_CHUNK_MAX_CHARS);
if (KNOWLEDGE_INDEX.chunks.length) {
    console.log('Knowledge chunks indexed:', KNOWLEDGE_INDEX.chunks.length);
}

// Pre-compute the static portion of the system prompt for each language once at
// startup.  The string is byte-identical on every request, so Ollama's KV
// prefix-cache will skip re-tokenising the company-knowledge block from turn 2
// onward — the single biggest source of per-turn latency.
let STATIC_SYSTEM_PROMPT_EN = buildStaticSystemPromptBase(false);
let STATIC_SYSTEM_PROMPT_PT = buildStaticSystemPromptBase(true);
console.log('Static system prompts pre-computed (EN:', STATIC_SYSTEM_PROMPT_EN.length, 'chars, PT:', STATIC_SYSTEM_PROMPT_PT.length, 'chars)');

if (OLLAMA_MODEL_BIG === OLLAMA_MODEL_SMALL) {
    console.warn('OLLAMA_MODEL_BIG and OLLAMA_MODEL_SMALL are the same model. This is valid, but slower on low-RAM CPUs.');
}

if (FORCE_OFFLINE_CHAT) {
    console.log('CHAT_MODE=offline -> using server-side offline lead bot only (no model calls).');
}

// CORS — allow same-origin requests and known production/dev origins
const ALLOWED_ORIGINS = [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'https://yourlabpt.com',
    'https://www.yourlabpt.com',
    // Support additional origins from env (comma-separated list allowed)
    ...(process.env.ALLOWED_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean)
].filter(Boolean);

function isLocalDevOrigin(origin) {
    if (process.env.NODE_ENV === 'production') return false;
    try {
        const parsed = new URL(origin);
        return ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);
    } catch {
        return false;
    }
}

app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no Origin header (same-origin, curl, mobile)
        if (!origin || ALLOWED_ORIGINS.includes(origin) || isLocalDevOrigin(origin)) {
            callback(null, true);
        } else {
            callback(new Error(`CORS: origin ${origin} not allowed`));
        }
    }
}));
app.use(express.json({
    limit: '10mb',
    verify: (req, _res, buffer) => {
        req.rawBody = buffer.toString('utf8');
    },
}));

// Serve vCard with explicit MIME type for better mobile compatibility
app.get('/business-card/contact.vcf', (req, res, next) => {
    const filePath = path.join(__dirname, '..', 'business-card', 'contact.vcf');
    if (!fs.existsSync(filePath)) return next();

    res.setHeader('Content-Type', 'text/vcard; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline; filename="contact.vcf"');
    return res.sendFile(filePath);
});

// Serve logo for the projects platform
app.get('/api/logo', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'Logos YourLab', '1.png'));
});

// Register the requirements/projects platform routes (before static to avoid index.html interception)
registerRequirementsPlatform(app, {
    rootDir: path.join(__dirname, '..'),
    platformDir: path.join(__dirname, '..', 'projects'),
    logoPath: path.join(__dirname, '..', 'Logos YourLab', '1.png'),
    buildScriptPath: process.env.REQ_PLATFORM_BUILD_SCRIPT,
    sendProjectEmail: sendProjectNotificationEmail,
});

// Block direct access to sensitive platform data/uploads
app.use('/projects/data', (req, res) => res.status(403).json({ error: 'Forbidden' }));
app.use('/projects/uploads', (req, res) => res.status(403).json({ error: 'Forbidden' }));

// Diário TCC PWA — private encrypted journal at /diario-tcc-secure
app.use('/diario-tcc-secure', (req, res, next) => {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('Service-Worker-Allowed', '/diario-tcc-secure/');
    next();
});

app.use('/digitalizept', (req, res, next) => {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('Service-Worker-Allowed', '/digitalizept/');
    next();
});

app.get(['/diario-tcc-secure', '/diario-tcc-secure/'], (req, res) => {
    const pathname = req.originalUrl.split('?')[0];
    if (pathname !== '/diario-tcc-secure/') {
        return res.redirect(301, '/diario-tcc-secure/');
    }
    res.sendFile(path.join(__dirname, '..', 'diario-tcc-secure', 'index.html'));
});

// SpyFu demo proxy — the browser can't call api.spyfu.com directly (no CORS,
// and Basic auth would expose the key in a request the page makes itself).
// The demo page calls this same-origin route instead; it forwards to SpyFu
// with Basic auth attached server-side. Credentials come from the page as
// x-spyfu-api-id / x-spyfu-secret-key headers (never a query param, never
// logged), falling back to SPYFU_API_ID / SPYFU_SECRET_KEY in this process's
// environment if the page didn't send its own. Only what the spend-check demo
// needs is allow-listed — see demos/spyfu/lib/spend-check.js.
const SPYFU_ROUTES = {
    'account/usage': { path: 'accountapi/getApiUsageForMonth', allow: [] },
    'bulk-domain-stats': {
        path: 'domain_stats_api/v2/getBulkDomainStats',
        allow: ['domains', 'countryCode', 'showOnlyLatest'],
    },
};
const SPYFU_RPS = { 'bulk-domain-stats': 300, 'account/usage': 5 };
const spyfuBuckets = new Map();
function spyfuRateLimited(key, perSecond) {
    const now = Date.now();
    const b = spyfuBuckets.get(key) || { count: 0, windowStart: now };
    if (now - b.windowStart >= 1000) { b.count = 0; b.windowStart = now; }
    b.count += 1;
    spyfuBuckets.set(key, b);
    return b.count > perSecond;
}

app.get('/demos/spyfu/api/spyfu/*', async (req, res) => {
    const match = req.params[0];
    const route = SPYFU_ROUTES[match];
    if (!route) {
        return res.status(404).json({ error: `Unknown endpoint: ${match}` });
    }
    if (spyfuRateLimited(match, SPYFU_RPS[match] || 5)) {
        res.setHeader('retry-after', '1');
        return res.status(429).json({ error: 'Rate limited. Back off and retry.' });
    }

    const apiId = req.headers['x-spyfu-api-id'] || process.env.SPYFU_API_ID || '';
    const secret = req.headers['x-spyfu-secret-key'] || process.env.SPYFU_SECRET_KEY || '';
    if (!apiId || !secret) {
        return res.status(401).json({ error: 'No SpyFu credentials. Fill in API ID and secret key on the page.' });
    }
    const auth = 'Basic ' + Buffer.from(`${apiId}:${secret}`).toString('base64');

    const out = new URLSearchParams();
    for (const [k, v] of Object.entries(req.query)) {
        if (!route.allow.includes(k)) continue;
        if (Array.isArray(v)) v.forEach((x) => out.append(k, x));
        else out.append(k, String(v));
    }

    const target = `https://api.spyfu.com/apis/${route.path}?${out.toString()}`;
    const started = Date.now();
    try {
        const upstream = await fetch(target, {
            headers: { authorization: auth, accept: 'application/json' },
        });
        const text = await upstream.text();
        let payload;
        try { payload = JSON.parse(text); } catch { payload = { raw: text }; }

        const rows = Array.isArray(payload.results) ? payload.results.length
            : Array.isArray(payload) ? payload.length : 1;
        // Never log the query string or headers — the query string carries the
        // customer's domain list, and headers now carry the key itself.
        console.log(`spyfu-proxy ${upstream.status} ${match} rows=${rows} ${Date.now() - started}ms`);

        res.status(upstream.status).json(payload);
    } catch (err) {
        console.error(`spyfu-proxy ERR ${match}: ${err.message}`);
        res.status(502).json({ error: 'Upstream request failed' });
    }
});

// Serve static files
app.use(express.static(path.join(__dirname, '..')));

// Create inquiries directory if it doesn't exist
const inquiriesDir = path.join(__dirname, 'inquiries');
if (!fs.existsSync(inquiriesDir)) {
    fs.mkdirSync(inquiriesDir, { recursive: true });
}

const projectShowcaseStore = createProjectShowcaseStore({
    filePath: path.join(__dirname, 'project-showcase.json')
});

const conversationSessions = new Map();
let mailTransporter = null;

function cleanText(value, max = 1200) {
    if (!value || typeof value !== 'string') return '';
    return value.trim().replace(/\s+/g, ' ').slice(0, max);
}

function normalizeEmail(value) {
    const text = cleanText(value, 160).toLowerCase();
    if (!text) return '';
    return /^[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}$/.test(text) ? text : '';
}

function normalizePhone(value) {
    const text = cleanText(value, 50);
    if (!text) return '';
    const digits = text.replace(/\D/g, '');
    if (digits.length < 8 || digits.length > 16) return '';
    return text;
}

function extractPreferredCallTimeFromText(value) {
    const text = cleanText(value, 200);
    if (!text) return '';

    const lower = text.toLowerCase();
    const hasDayWord = /\b(today|tomorrow|tonight|next|monday|tuesday|wednesday|thursday|friday|saturday|sunday|hoje|amanh[aã]|logo|depois|segunda|ter[cç]a|quarta|quinta|sexta|s[aá]bado|domingo|pr[oó]xima)\b/.test(lower);
    const hasHour = /\b\d{1,2}(?::\d{2})?\s?(am|pm|h)?\b/.test(lower);
    const hasMeetingWord = /\b(video|zoom|meet|teams|online|in person|in-person|presencial|call|chamada|reuni[aã]o)\b/.test(lower);

    return (hasDayWord || hasHour || hasMeetingWord) ? text : '';
}

const NAME_STOP_WORDS = new Set([
    // English greetings
    'hi', 'hello', 'hey', 'greetings', 'howdy', 'sup', 'yo', 'dear',
    // Portuguese greetings and fillers
    'oi', 'ola', 'boa', 'bom', 'tudo', 'bem', 'dia', 'tarde', 'noite',
    // Affirmations / negations
    'sim', 'nao', 'ok', 'okay', 'yes', 'no', 'claro', 'certo', 'sure', 'fine',
    'talvez', 'maybe', 'later', 'depois',
    // Organisation / context words that are not names
    'equipa', 'team', 'yourlab', 'alex',
    'name', 'nome', 'phone', 'number', 'telefone', 'numero', 'email',
    'business', 'negocio', 'project', 'projeto', 'idea', 'ideia',
    'contact', 'contacto', 'contato', 'info', 'help', 'ajuda', 'support', 'suporte',
    // Pronouns and linking words
    'my', 'meu', 'minha', 'sou', 'am', 'im', 'the', 'from', 'with', 'and', 'para',
    'n/a', 'none',
    // Time expressions
    'good', 'morning', 'afternoon', 'evening', 'night',
    // Thank-you forms
    'obrigado', 'obrigada', 'thanks', 'thank', 'you'
]);

function normalizeForComparison(value) {
    return (value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}

function normalizeNameCandidate(value) {
    const cleaned = cleanText(value, 120)
        .replace(/[.,;:!?]+$/g, '')
        .replace(/^['"`]+|['"`]+$/g, '')
        .trim();
    if (!cleaned || /\d|@/.test(cleaned)) return '';

    const rawTokens = cleaned
        .split(/\s+/)
        .map((token) => token.replace(/[^A-Za-zÀ-ÿ'-]/g, ''))
        .filter(Boolean);
    if (rawTokens.length < 2 || rawTokens.length > 4) return '';
    if (rawTokens.some((token) => token.length < 2 || token.length > 24)) return '';

    const joinedLower = normalizeForComparison(rawTokens.join(' '));
    if (NAME_STOP_WORDS.has(joinedLower)) return '';
    if (rawTokens.some((token) => NAME_STOP_WORDS.has(normalizeForComparison(token)))) return '';
    if (/(^| )(contact|contacto|email|telefone|numero|phone|number|name|nome)( |$)/.test(joinedLower)) {
        return '';
    }

    return rawTokens
        .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
        .join(' ');
}

function extractNameFromText(value) {
    const source = cleanText(value, 260);
    if (!source) return '';

    const patterns = [
        /(?:my name is|i am|i'm|this is|call me)\s+([A-Za-zÀ-ÿ' -]{2,80})/i,
        /(?:meu nome e|o meu nome e|chamo-me|chamo me|eu sou|sou o|sou a|pode chamar(?:-me)?)\s+([A-Za-zÀ-ÿ' -]{2,80})/i
    ];

    for (const pattern of patterns) {
        const match = source.match(pattern);
        if (!match) continue;
        const candidate = normalizeNameCandidate(match[1]);
        if (candidate) return candidate;
    }

    const standalone = source
        .replace(/[!?.,;:()[\]{}"]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    if (!standalone) return '';
    if (standalone.split(' ').length > 4) return '';
    if (!/^[A-Za-zÀ-ÿ' -]{2,80}$/.test(standalone)) return '';
    return normalizeNameCandidate(standalone);
}

function isPhoneRefusal(value) {
    const text = normalizeForComparison(value);
    if (!text) return false;
    return /\b(no phone|no number|d(?:on'?t|o not) share.*(phone|number)|prefer email|sem telefone|sem numero|nao quero.*(telefone|numero)|prefiro email)\b/.test(text);
}

function isEmailRefusal(value) {
    const text = normalizeForComparison(value);
    if (!text) return false;
    return /\b(no email|d(?:on'?t|o not) share.*email|nao tenho email|nao quero.*email|sem email|prefiro telefone|prefiro numero)\b/.test(text);
}

function isGeneralContactRefusal(value) {
    const text = normalizeForComparison(value);
    if (!text) return false;
    return /\b(no contact|d(?:on'?t|o not) contact me|nao quero contacto|nao quero contato|sem contacto|sem contato)\b/.test(text);
}

function isGreetingOnly(value) {
    const text = normalizeForComparison(value)
        .replace(/[!?.;,]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    if (!text) return false;
    // Match if the message starts with a greeting word and is short (≤ 5 words total).
    // This catches both bare greetings ("Ola") and greeting-prefixed phrases ("Ola tudo bem").
    const words = text.split(' ');
    if (words.length > 5) return false;
    return /^(oi|ola|hello|hi|hey|bom dia|boa tarde|boa noite|good morning|good afternoon|good evening|good night)(\s|$)/.test(text);
}

function isValidBusinessBrief(value) {
    const text = cleanText(value, 1200);
    if (!text) return false;
    if (/^(yes|no|sim|nao|ok|talvez|maybe|n\/a|none|nada)$/i.test(text)) return false;
    if (normalizeEmail(text) || normalizePhone(text)) return false;

    const words = text.split(/\s+/).filter(Boolean);
    const alphaChars = (text.match(/[A-Za-zÀ-ÿ]/g) || []).length;
    return text.length >= 18 && words.length >= 4 && alphaChars >= 12;
}

function createEmptyLead(language = 'en') {
    return {
        language,
        name: '',
        email: '',
        phone: '',
        company: '',
        industry: '',
        problem: '',
        targetCustomer: '',
        currentSolution: '',
        goal: '',
        timeline: '',
        budgetRange: '',
        urgencyLevel: '',
        callTime: '',
        consentToContact: false
    };
}

function mergeLead(base, incoming = {}) {
    const next = { ...base };
    next.language = incoming.language === 'pt' ? 'pt' : next.language;

    const incomingName = cleanText(incoming.name, 120);
    if (!next.name && incomingName) {
        // Validate through normalizeNameCandidate to reject greetings, single words,
        // and other non-name tokens even when they come from the AI model's updated_lead.
        const validatedName = normalizeNameCandidate(incomingName);
        if (validatedName) next.name = validatedName;
    }
    next.email = normalizeEmail(incoming.email || next.email) || next.email;
    next.phone = normalizePhone(incoming.phone || next.phone) || next.phone;
    next.company = cleanText(incoming.company || next.company, 160);
    next.industry = cleanText(incoming.industry || next.industry, 120);
    next.problem = cleanText(incoming.problem || next.problem, 600);
    next.targetCustomer = cleanText(incoming.targetCustomer || next.targetCustomer, 350);
    next.currentSolution = cleanText(incoming.currentSolution || next.currentSolution, 350);
    next.goal = cleanText(incoming.goal || next.goal, 500);
    next.timeline = cleanText(incoming.timeline || next.timeline, 120);
    next.budgetRange = cleanText(incoming.budgetRange || next.budgetRange, 120);
    next.urgencyLevel = cleanText(incoming.urgencyLevel || next.urgencyLevel, 120);
    next.callTime = cleanText(incoming.callTime || next.callTime, 200);
    if (typeof incoming.consentToContact === 'boolean') {
        next.consentToContact = incoming.consentToContact;
    }
    return next;
}

function extractLeadSignalsFromText(text) {
    const source = cleanText(text, 3000);
    if (!source) return {};

    const emailMatch = source.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/);
    const phoneMatch = source.match(/(?:\+?\d[\d\s().-]{6,}\d)/);
    const companyMatch = source.match(/(?:company|startup|business|empresa)\s*(?:is|called|named|e|chama-se)\s+([A-Za-zÀ-ÿ0-9'&., -]{2,80})/i);
    const callTime = extractPreferredCallTimeFromText(source);

    return {
        email: emailMatch ? normalizeEmail(emailMatch[0]) : '',
        phone: phoneMatch ? normalizePhone(phoneMatch[0]) : '',
        name: extractNameFromText(source),
        company: companyMatch ? cleanText(companyMatch[1], 120) : '',
        callTime
    };
}

function computeLeadScore(lead) {
    let score = 0;
    if (lead.problem) score += 20;
    if (lead.goal) score += 16;
    if (lead.targetCustomer) score += 10;
    if (lead.currentSolution) score += 8;
    if (lead.timeline) score += 8;
    if (lead.budgetRange) score += 8;
    if (lead.company || lead.industry) score += 10;
    if (lead.email || lead.phone) score += 12;
    if (lead.name) score += 4;
    if (lead.urgencyLevel) score += 4;
    if (lead.callTime) score += 8;
    return Math.max(0, Math.min(100, score));
}

function resolveLeadStage(lead, scoreHint) {
    const score = Number.isFinite(scoreHint) ? scoreHint : computeLeadScore(lead);
    const hasContact = Boolean(lead.email || lead.phone);
    const hasStory = Boolean(lead.problem && lead.goal);
    const hasCallTime = Boolean(lead.callTime);

    if (hasContact && hasStory && hasCallTime && score >= 60) return 'completed';
    if (hasContact && hasStory && !hasCallTime) return 'commit';
    if (hasStory && !hasContact) return 'capture';
    if (lead.problem || lead.goal) return 'qualify';
    return 'discover';
}

function toIsoDate(value) {
    try {
        return new Date(value).toISOString();
    } catch (_) {
        return new Date().toISOString();
    }
}

function createSession(language = 'en', sessionId = '') {
    const id = cleanText(sessionId, 120) || crypto.randomUUID();
    const now = new Date().toISOString();
    const lead = createEmptyLead(language);
    return {
        id,
        createdAt: now,
        updatedAt: now,
        stage: 'discover',
        leadScore: 0,
        lead,
        turns: [],
        topicBullets: [],
        nextBestAction: '',
        savedFile: '',
        notified: false,
        forceFallback: false,
        fallbackReason: '',
        stickyModel: '',
        modelFailures: 0,
        fallbackState: {
            contactChannel: 'phone'
        }
    };
}

function getOrCreateSession(sessionId, language) {
    const cleanSessionId = cleanText(sessionId, 120);
    const preferredLanguage = language === 'pt' ? 'pt' : 'en';

    if (cleanSessionId && conversationSessions.has(cleanSessionId)) {
        const existing = conversationSessions.get(cleanSessionId);
        existing.updatedAt = new Date().toISOString();
        existing.lead.language = preferredLanguage;
        if (!existing.fallbackState || typeof existing.fallbackState !== 'object') {
            existing.fallbackState = { contactChannel: 'phone' };
        }
        if (!['phone', 'email'].includes(existing.fallbackState.contactChannel)) {
            existing.fallbackState.contactChannel = 'phone';
        }
        return existing;
    }

    const session = createSession(preferredLanguage, cleanSessionId);
    conversationSessions.set(session.id, session);
    return session;
}

// ─── System prompt helpers ───────────────────────────────────────────────────
function normalizeForSearch(value) {
    return (value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}

function tokenizeForSearch(value) {
    const matches = normalizeForSearch(value).match(/[a-z0-9]{2,}/g) || [];
    return matches.filter((token) => !SEARCH_STOP_WORDS.has(token));
}

function buildKnowledgeIndex(rawText, chunkMaxChars) {
    if (!rawText) {
        return { chunks: [], docFreq: new Map(), totalChunks: 0 };
    }

    const lines = rawText.replace(/\r/g, '').split('\n');
    const chunks = [];
    let heading = '';
    let buffer = '';

    const flushBuffer = () => {
        const text = cleanText(buffer, chunkMaxChars * 3);
        if (!text) {
            buffer = '';
            return;
        }

        const tokenList = tokenizeForSearch(text);
        const tokenCounts = new Map();
        tokenList.forEach((token) => {
            tokenCounts.set(token, (tokenCounts.get(token) || 0) + 1);
        });

        chunks.push({
            heading,
            text,
            tokenCounts,
            tokenCount: tokenList.length || 1
        });
        buffer = '';
    };

    lines.forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed === '---') {
            if (buffer.length > chunkMaxChars * 0.85) flushBuffer();
            return;
        }

        if (/^#{1,6}\s+/.test(trimmed)) {
            flushBuffer();
            heading = trimmed.replace(/^#{1,6}\s+/, '').trim();
            return;
        }

        const candidate = buffer ? `${buffer} ${trimmed}` : trimmed;
        if (candidate.length > chunkMaxChars && buffer) {
            flushBuffer();
            buffer = trimmed;
        } else {
            buffer = candidate;
        }

        if (buffer.length >= chunkMaxChars) flushBuffer();
    });
    flushBuffer();

    const docFreq = new Map();
    chunks.forEach((chunk) => {
        chunk.tokenCounts.forEach((_, token) => {
            docFreq.set(token, (docFreq.get(token) || 0) + 1);
        });
    });

    return {
        chunks,
        docFreq,
        totalChunks: chunks.length
    };
}

function retrieveKnowledgeSnippets(queryText, limit = KNOWLEDGE_SNIPPETS_PER_TURN) {
    if (!KNOWLEDGE_INDEX.totalChunks || limit <= 0) return [];
    const queryTokens = [...new Set(tokenizeForSearch(queryText))];
    if (!queryTokens.length) return [];

    const scored = [];
    KNOWLEDGE_INDEX.chunks.forEach((chunk) => {
        let score = 0;
        queryTokens.forEach((token) => {
            const tf = chunk.tokenCounts.get(token);
            if (!tf) return;
            const df = KNOWLEDGE_INDEX.docFreq.get(token) || 1;
            const idf = Math.log(1 + (KNOWLEDGE_INDEX.totalChunks / df));
            score += (tf / chunk.tokenCount) * idf;
        });
        if (score > 0) scored.push({ chunk, score });
    });

    return scored
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(({ chunk }) => {
            const prefix = chunk.heading ? `${chunk.heading}: ` : '';
            return `${prefix}${cleanText(chunk.text, KNOWLEDGE_SNIPPET_MAX_CHARS)}`;
        });
}

// Static base: byte-identical string pre-computed once per language at startup.
function buildStaticSystemPromptBase(isPt) {
    const languageInstruction = isPt ? 'European Portuguese (from Portugal)' : 'English';
    const stageGuide = isPt
        ? '- discover: entender problema/ideia\n- qualify: recolher contexto de negocio\n- capture: obter nome + email/telefone\n- commit: confirmar proximo passo e hora de reuniao\n- completed: lead pronto para handoff'
        : '- discover: understand problem/idea\n- qualify: gather business context\n- capture: collect name + email/phone\n- commit: confirm next step and preferred meeting time\n- completed: lead ready for handoff';
    const contactRule = isPt
        ? 'Pede contacto ate mensagem 4-5 se for um lead real. Se faltar horario de reuniao, pede-o.'
        : 'Ask for contact by message 4-5 for real leads. If meeting time is missing, ask for it.';

    return `You are Alex, YourLab's business development specialist.
Primary mission: understand the business case quickly and convert good conversations into meetings.

Tone and style:
- Human, direct, commercially sharp. No corporate filler.
- 18 to 65 words per reply.
- Ask one focused question per reply.
- Never ask for data already present in "KNOWN LEAD DATA".
- If user goes off-topic, acknowledge briefly and redirect to their project.
- When asking for the user's name, always ask for their FULL name (first name AND last name/surname). Never accept or save a single first name.
- Never interpret a greeting word ("hello", "hi", "ola", "oi", "hey", "bom dia", "boa tarde", etc.) as someone's name. If the user sends only a greeting, reply naturally with a greeting in return and ask for their full name.
- Only set "name" in updated_lead when the user has explicitly provided both first and last name.

Business anchor:
- YourLab builds lean MVPs, custom software, IoT, integrations and requirements engineering.
- Philosophy: Start small. Prove it. Scale what is real.

Lead progression:
${stageGuide}

${contactRule}

Hard constraints:
1. Write only in ${languageInstruction}.
2. Output only valid JSON (no markdown, no extra text).
3. "updated_lead" must contain ONLY fields captured in this user turn (or {}).

JSON format:
{
  "assistant_reply": "<18-65 words>",
  "request_contact_now": <true|false>,
  "lead_stage": "<discover|qualify|capture|commit|completed>",
  "lead_score": <0-100>,
  "updated_lead": {}
}
Optional fields (omit when not useful): "topic_bullets", "next_best_action".`;
}

function buildSystemPrompt(session, userMessage) {
    const isPt = session.lead.language === 'pt';
    const lead = session.lead;
    const stage = session.stage;
    const known = [];
    const missing = [];

    if (lead.name) known.push(`name: "${lead.name}"`);
    else missing.push(isPt ? 'nome' : 'name');

    if (lead.email) known.push(`email: "${lead.email}"`);
    if (lead.phone) known.push(`phone: "${lead.phone}"`);
    if (!lead.email && !lead.phone) missing.push(isPt ? 'email ou telefone' : 'email or phone');

    if (lead.company) known.push(`company: "${lead.company}"`);
    if (lead.problem) known.push(`problem: "${cleanText(lead.problem, 220)}"`);
    else missing.push(isPt ? 'problema/ideia' : 'problem/idea');

    if (lead.goal) known.push(`goal: "${cleanText(lead.goal, 160)}"`);
    else if (lead.problem) missing.push(isPt ? 'objetivo' : 'goal');

    if (lead.targetCustomer) known.push(`targetCustomer: "${cleanText(lead.targetCustomer, 140)}"`);
    if (lead.timeline) known.push(`timeline: "${lead.timeline}"`);
    if (lead.budgetRange) known.push(`budgetRange: "${lead.budgetRange}"`);
    if (lead.urgencyLevel) known.push(`urgencyLevel: "${lead.urgencyLevel}"`);
    if (lead.callTime) known.push(`callTime: "${lead.callTime}"`);
    else if (lead.email || lead.phone) missing.push(isPt ? 'preferencia de reuniao (video/presencial + horario)' : 'meeting preference (video/in-person + time)');

    const knownSection = known.length ? known.join('\n') : (isPt ? '(nada ainda)' : '(nothing yet)');
    const missingSection = missing.length ? missing.join(', ') : (isPt ? '(nada critico em falta)' : '(nothing critical missing)');

    const retrievalQuery = [userMessage, lead.problem, lead.goal, lead.industry].filter(Boolean).join(' ');
    const snippets = retrieveKnowledgeSnippets(retrievalQuery, KNOWLEDGE_SNIPPETS_PER_TURN);
    const knowledgeSection = snippets.length
        ? ((isPt ? 'RELEVANT YOURLAB FACTS:\n' : 'RELEVANT YOURLAB FACTS:\n') + snippets.map((s) => `- ${s}`).join('\n'))
        : (isPt ? 'RELEVANT YOURLAB FACTS:\n- (usar apenas factos base do prompt)' : 'RELEVANT YOURLAB FACTS:\n- (use only base facts from prompt)');

    return `${isPt ? STATIC_SYSTEM_PROMPT_PT : STATIC_SYSTEM_PROMPT_EN}

CURRENT STAGE: ${stage}
TURN NUMBER: ${session.turns.length + 1}

KNOWN LEAD DATA:
${knownSection}

MISSING LEAD DATA (collect naturally, one item at a time):
${missingSection}

${knowledgeSection}`;
}

const TURN_OUTPUT_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
        assistant_reply: { type: 'string', minLength: 1, maxLength: 1500 },
        request_contact_now: { type: 'boolean' },
        lead_stage: {
            type: 'string',
            enum: ['discover', 'qualify', 'capture', 'commit', 'completed']
        },
        lead_score: { type: 'integer', minimum: 0, maximum: 100 },
        updated_lead: {
            type: 'object',
            additionalProperties: false,
            properties: {
                language: { type: 'string', enum: ['en', 'pt'] },
                name: { type: 'string' },
                email: { type: 'string' },
                phone: { type: 'string' },
                company: { type: 'string' },
                industry: { type: 'string' },
                problem: { type: 'string' },
                targetCustomer: { type: 'string' },
                currentSolution: { type: 'string' },
                goal: { type: 'string' },
                timeline: { type: 'string' },
                budgetRange: { type: 'string' },
                urgencyLevel: { type: 'string' },
                callTime: { type: 'string' },
                consentToContact: { type: 'boolean' }
            }
        },
        topic_bullets: {
            type: 'array',
            maxItems: 8,
            items: { type: 'string', minLength: 2, maxLength: 140 }
        },
        next_best_action: { type: 'string', maxLength: 220 }
    },
    required: [
        'assistant_reply',
        'request_contact_now',
        'lead_stage',
        'lead_score',
        'updated_lead'
    ]
};

function extractOutputText(response) {
    if (response && typeof response.output_text === 'string' && response.output_text.trim()) {
        return response.output_text.trim();
    }

    const outputItems = Array.isArray(response && response.output) ? response.output : [];
    const textChunks = [];

    outputItems.forEach((item) => {
        const content = Array.isArray(item && item.content) ? item.content : [];
        content.forEach((part) => {
            if (part && part.type === 'output_text' && typeof part.text === 'string') {
                textChunks.push(part.text);
            }
        });
    });

    return textChunks.join('\n').trim();
}

async function runLeadConversationTurn(session, userMessage, modelName) {
    if (!ollamaClient) {
        throw new Error('Chat model is disabled (CHAT_MODE=offline).');
    }

    const history = session.turns.slice(-CHAT_HISTORY_TURNS).flatMap((turn) => ([
        { role: 'user', content: turn.user },
        { role: 'assistant', content: turn.assistant }
    ]));

    const messages = [
        { role: 'system', content: buildSystemPrompt(session, userMessage) },
        ...history,
        { role: 'user', content: userMessage }
    ];

    const abortController = new AbortController();
    const timeoutHandle = setTimeout(() => abortController.abort(), MODEL_TIMEOUT_MS);

    let response;
    try {
        response = await ollamaClient.chat.completions.create(
            {
                model: modelName || OLLAMA_MODEL_BIG,
                messages,
                response_format: { type: 'json_object' },
                temperature: MODEL_TEMPERATURE,
                max_tokens: MODEL_MAX_TOKENS,
                stream: false,
                keep_alive: '60m',  // keep model loaded between requests
                options: {
                    num_predict: MODEL_MAX_TOKENS,
                    num_ctx: MODEL_NUM_CTX,
                    temperature: MODEL_TEMPERATURE
                }
            },
            { signal: abortController.signal }
        );
    } finally {
        clearTimeout(timeoutHandle);
    }

    const raw = (response.choices[0]?.message?.content || '').trim();
    if (!raw) {
        throw new Error('Model returned an empty response.');
    }

    const normalized = raw
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();

    let parsed;
    try {
        parsed = JSON.parse(normalized);
    } catch (e) {
        throw new Error(`Model returned invalid JSON: ${e.message} — raw: ${normalized.slice(0, 200)}`);
    }

    // Tolerate minor schema deviations — fill required fields with safe defaults if missing
    if (!parsed.assistant_reply) {
        // Some models wrap the reply under a different key
        parsed.assistant_reply =
            parsed.reply || parsed.response || parsed.message || parsed.text || '';
    }
    if (!parsed.assistant_reply) {
        throw new Error(`Model response missing assistant_reply. Keys returned: ${Object.keys(parsed).join(', ')}`);
    }
    if (typeof parsed.request_contact_now !== 'boolean') parsed.request_contact_now = false;
    if (!parsed.lead_stage) parsed.lead_stage = 'discover';
    if (!Number.isFinite(parsed.lead_score)) parsed.lead_score = 0;
    if (!parsed.updated_lead || typeof parsed.updated_lead !== 'object') parsed.updated_lead = {};
    if (!Array.isArray(parsed.topic_bullets)) parsed.topic_bullets = [];
    if (!parsed.next_best_action) parsed.next_best_action = '';

    return parsed;
}

function ensureFallbackState(session) {
    if (!session.fallbackState || typeof session.fallbackState !== 'object') {
        session.fallbackState = { contactChannel: 'phone' };
    }
    if (!['phone', 'email'].includes(session.fallbackState.contactChannel)) {
        session.fallbackState.contactChannel = 'phone';
    }
    return session.fallbackState;
}

function getFallbackStep(lead, fallbackState) {
    if (!lead.name) return 'name';
    if (!lead.phone && !lead.email) {
        return fallbackState.contactChannel === 'email' ? 'email' : 'phone';
    }
    if (!isValidBusinessBrief(lead.problem || '')) return 'business';
    if (!lead.callTime) return 'callTime';
    return 'done';
}

function fallbackTurn(session, userMessage) {
    const isPt = session.lead.language === 'pt';
    const lead = session.lead;
    const msg = cleanText(userMessage, 900);
    const fallbackState = ensureFallbackState(session);
    const stepBefore = getFallbackStep(lead, fallbackState);
    const inferredLeadUpdate = {};
    const extracted = extractLeadSignalsFromText(msg);

    if (extracted.name) inferredLeadUpdate.name = extracted.name;
    if (extracted.email) inferredLeadUpdate.email = extracted.email;
    if (extracted.phone) inferredLeadUpdate.phone = extracted.phone;
    if (extracted.company) inferredLeadUpdate.company = extracted.company;
    if (extracted.callTime) inferredLeadUpdate.callTime = extracted.callTime;

    const hasAnyExtractedContact = Boolean(extracted.phone || extracted.email);
    if (stepBefore === 'phone' && !hasAnyExtractedContact && isPhoneRefusal(msg)) {
        fallbackState.contactChannel = 'email';
    }
    if (stepBefore === 'email' && !hasAnyExtractedContact && isEmailRefusal(msg)) {
        fallbackState.contactChannel = 'phone';
    }
    if (!hasAnyExtractedContact && isGeneralContactRefusal(msg)) {
        fallbackState.contactChannel = fallbackState.contactChannel === 'phone' ? 'email' : 'phone';
    }

    if (!lead.problem && isValidBusinessBrief(msg)) {
        inferredLeadUpdate.problem = msg;
        if (!lead.goal) inferredLeadUpdate.goal = msg;
    }
    if (!lead.goal && /\b(goal|want|need|result|objective|achieve|solve|objetivo|pretendo|quero|resultado|meta|resolver|alcan)\b/i.test(msg)) {
        inferredLeadUpdate.goal = msg;
    }
    if (/\b(consent|agree|autori[zs]|aceito|sim\b|yes\b|claro|sure|ok\b)\b/i.test(msg)) {
        inferredLeadUpdate.consentToContact = true;
    }

    const updatedLead = mergeLead(lead, inferredLeadUpdate);
    if (!updatedLead.goal && updatedLead.problem) {
        inferredLeadUpdate.goal = updatedLead.problem;
        updatedLead.goal = updatedLead.problem;
    }

    const hasContact = Boolean(updatedLead.phone || updatedLead.email);
    const hasStory = Boolean(updatedLead.problem && updatedLead.goal);
    const hasCallTime = Boolean(updatedLead.callTime);
    const stepAfter = getFallbackStep(updatedLead, fallbackState);

    const askName = isPt
        ? 'Para avancarmos, diz-me o teu nome e apelido.'
        : 'To move forward, tell me your first and last name.';
    const greetAndAskName = isPt
        ? 'Ola! Para avancarmos, diz-me o teu nome e apelido.'
        : 'Hello! To move forward, tell me your first and last name.';
    const askPhone = isPt
        ? 'Qual e o melhor numero de telefone para contacto? Se preferires, responde "prefiro email".'
        : 'What is the best phone number to reach you? If you prefer, reply with "I prefer email".';
    const askEmail = isPt
        ? 'Sem problema. Entao partilha um email valido para contacto.'
        : 'No problem. Please share a valid email address for contact.';
    const askBusiness = isPt
        ? 'Em 2-4 frases, descreve o negocio, o problema principal e para quem e.'
        : 'In 2-4 sentences, describe the business, the main problem, and who it is for.';
    const askBusinessRetry = isPt
        ? 'Preciso de mais contexto para validar: problema, cliente alvo e impacto no negocio.'
        : 'I need a bit more context to validate: problem, target customer, and business impact.';
    const askCallTime = isPt
        ? 'Qual o melhor dia e horario para uma chamada curta? Exemplo: quarta 15h, amanha de manha.'
        : 'What day and time work best for a short call? Example: Wednesday 3pm, tomorrow morning.';
    const askCallTimeRetry = isPt
        ? 'Nao consegui validar o horario. Indica dia e hora aproximada.'
        : 'I could not validate the time. Please share a day and approximate hour.';
    const requireContact = isPt
        ? 'Preciso de pelo menos um contacto valido para continuar: telefone ou email.'
        : 'I need at least one valid contact to continue: phone number or email.';

    const nextQuestionByStep = (step) => {
        if (step === 'phone') return askPhone;
        if (step === 'email') return askEmail;
        if (step === 'business') return askBusiness;
        if (step === 'callTime') return askCallTime;
        return '';
    };

    const finalReply = isPt
        ? `Obrigado, ${updatedLead.name || ''}. Ja temos contacto e contexto. A equipa da YourLab envia os proximos passos em ate 1 dia util.`
        : `Thanks, ${updatedLead.name || ''}. We now have contact and context. The YourLab team will send next steps within 1 business day.`;

    let reply = '';
    if (stepBefore === stepAfter) {
        if (stepAfter === 'name') {
            reply = isGreetingOnly(msg) ? greetAndAskName : askName;
        } else if (stepAfter === 'phone') {
            reply = fallbackState.contactChannel === 'email' ? askEmail : askPhone;
        } else if (stepAfter === 'email') {
            reply = requireContact + ' ' + askEmail;
        } else if (stepAfter === 'business') {
            reply = askBusinessRetry;
        } else if (stepAfter === 'callTime') {
            reply = askCallTimeRetry;
        } else {
            reply = finalReply;
        }
    } else if (stepAfter === 'done') {
        reply = finalReply;
    } else if ((stepBefore === 'phone' || stepBefore === 'email') && !hasContact) {
        reply = requireContact + ' ' + nextQuestionByStep(stepAfter);
    } else {
        const ack = isPt
            ? `Perfeito${updatedLead.name ? `, ${updatedLead.name}` : ''}.`
            : `Perfect${updatedLead.name ? `, ${updatedLead.name}` : ''}.`;
        reply = `${ack} ${nextQuestionByStep(stepAfter)}`.trim();
    }

    const score = computeLeadScore(updatedLead);
    return {
        assistant_reply: reply,
        request_contact_now: !hasContact,
        lead_stage: !hasCallTime && hasContact && hasStory ? 'commit' : resolveLeadStage(updatedLead, score),
        lead_score: score,
        updated_lead: inferredLeadUpdate,
        topic_bullets: session.topicBullets,
        next_best_action: hasContact
            ? (hasCallTime
                ? (isPt ? 'Enviar resumo MVP e proximos passos.' : 'Send MVP brief and next steps.')
                : (isPt ? 'Confirmar dia e hora da chamada.' : 'Confirm call day and time.'))
            : (isPt ? 'Recolher telefone ou email valido.' : 'Collect a valid phone number or email.')
    };
}

function normalizeInquiryFilename(id) {
    const safeId = cleanText(id, 220);
    if (!safeId) return '';
    return safeId.endsWith('.json') ? safeId : `${safeId}.json`;
}

function saveInquiry(inquiry, existingFile = '') {
    const preferredId = cleanText(existingFile, 220);
    const filename = preferredId || (() => {
        const source = inquiry.contact.email || inquiry.contact.phone || inquiry.contact.name || 'lead';
        const key = source.replace(/[^A-Za-z0-9]+/g, '_').slice(0, 40) || 'lead';
        const stamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
        return `${key}_${stamp}_${crypto.randomBytes(3).toString('hex')}.json`;
    })();

    const filepath = path.join(inquiriesDir, filename);
    fs.writeFileSync(filepath, JSON.stringify(inquiry, null, 2));
    return filename;
}

function hasLeadContact(lead) {
    return Boolean(lead.email || lead.phone);
}

function hasLeadStory(lead) {
    return Boolean(lead.problem && lead.goal);
}

function sessionToInquiry(session) {
    const now = new Date().toISOString();
    const lead = session.lead;
    const transcriptText = session.turns.map((turn) => `${turn.user}`).join(' ').trim();
    const summary = {
        score: session.leadScore,
        stage: session.stage,
        topics: session.topicBullets,
        nextBestAction: session.nextBestAction
    };

    return {
        timestamp: now,
        sessionId: session.id,
        source: 'website-ai-chat',
        contact: {
            name: lead.name,
            email: lead.email,
            phone: lead.phone
        },
        businessIdea: cleanText(lead.problem || lead.goal || transcriptText, 3000),
        lead,
        summary,
        messages: session.turns.map((turn) => ({
            user: turn.user,
            bot: turn.assistant,
            timestamp: turn.timestamp
        }))
    };
}

function getOrCreateTransporter() {
    if (mailTransporter) return mailTransporter;

    const host = cleanText(process.env.SMTP_HOST, 160);
    const port = Number(process.env.SMTP_PORT || 587);
    const user = cleanText(process.env.SMTP_USER, 160);
    const pass = cleanText(process.env.SMTP_PASS, 240);
    if (!host || !port || !user || !pass) return null;

    mailTransporter = nodemailer.createTransport({
        host,
        port,
        secure: String(process.env.SMTP_SECURE || 'false') === 'true',
        auth: { user, pass }
    });
    return mailTransporter;
}

async function sendProjectNotificationEmail({ to, subject, text, html, attachments }) {
    const recipient = cleanText(to, 600);
    if (!recipient) return { sent: false, reason: 'Recipient is missing.' };
    const transporter = getOrCreateTransporter();
    if (!transporter) return { sent: false, reason: 'SMTP settings are not configured.' };
    const from = cleanText(process.env.SMTP_FROM, 300) || cleanText(process.env.SMTP_USER, 200);
    try {
        await transporter.sendMail({
            from,
            to: recipient,
            subject: cleanText(subject, 240),
            text: String(text || ''),
            html: html || undefined,
            attachments: Array.isArray(attachments) && attachments.length ? attachments : undefined
        });
        return { sent: true };
    } catch (error) {
        return { sent: false, reason: error.message };
    }
}

function buildLeadEmailText(inquiry) {
    const lead = inquiry.lead || {};
    const summary = inquiry.summary || {};
    const contact = inquiry.contact || {};
    const lines = [
        'New lead captured on YourLab website',
        '',
        `Date: ${toIsoDate(inquiry.timestamp)}`,
        `Session: ${inquiry.sessionId || '-'}`,
        '',
        'Contact',
        `- Name: ${contact.name || '-'}`,
        `- Email: ${contact.email || '-'}`,
        `- Phone: ${contact.phone || '-'}`,
        '',
        'Business Summary',
        `- Company: ${lead.company || '-'}`,
        `- Industry: ${lead.industry || '-'}`,
        `- Problem: ${lead.problem || '-'}`,
        `- Target customer: ${lead.targetCustomer || '-'}`,
        `- Current solution: ${lead.currentSolution || '-'}`,
        `- Goal: ${lead.goal || '-'}`,
        `- Timeline: ${lead.timeline || '-'}`,
        `- Budget range: ${lead.budgetRange || '-'}`,
        `- Urgency: ${lead.urgencyLevel || '-'}`,
        `- Preferred call time: ${inquiry.preferredCallTime || (lead.callTime) || '-'}`,
        '',
        'Qualification',
        `- Score: ${summary.score ?? '-'}/100`,
        `- Stage: ${summary.stage || '-'}`,
        `- Topics: ${(summary.topics || []).join(' | ') || '-'}`,
        `- Next best action: ${summary.nextBestAction || '-'}`,
        '',
        `Idea text: ${inquiry.businessIdea || '-'}`,
        ''
    ];
    return lines.join('\n');
}

// ─── Calendar invite helpers ────────────────────────────────────────────────

function parsePreferredCallTime(text) {
    const now = new Date();
    let d = new Date(now);

    const lower = (text || '').toLowerCase();

    // Day offset
    if (/amanh[aã]|tomorrow/.test(lower)) {
        d.setDate(d.getDate() + 1);
    } else {
        const DAYS = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday',
                      'domingo','segunda','ter[cç]a','quarta','quinta','sexta','s[aá]bado'];
        const DAY_MAP = [0,1,2,3,4,5,6, 0,1,2,3,4,5,6];
        let matched = false;
        for (let i = 0; i < DAYS.length; i++) {
            if (new RegExp(DAYS[i]).test(lower)) {
                const target = DAY_MAP[i];
                const cur = d.getDay();
                let diff = target - cur;
                if (diff <= 0) diff += 7;
                d.setDate(d.getDate() + diff);
                matched = true;
                break;
            }
        }
        if (!matched) {
            // skip to next business day
            d.setDate(d.getDate() + 1);
            while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
        }
    }

    // Time of day
    const timeMatch = lower.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm|h)?/);
    if (timeMatch) {
        let h = parseInt(timeMatch[1], 10);
        const m = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
        const ampm = timeMatch[3];
        if (ampm === 'pm' && h < 12) h += 12;
        if (ampm === 'am' && h === 12) h = 0;
        d.setHours(h, m, 0, 0);
    } else if (/manh[aã]|morning/.test(lower)) {
        d.setHours(10, 0, 0, 0);
    } else if (/tarde|afternoon/.test(lower)) {
        d.setHours(14, 0, 0, 0);
    } else if (/noite|evening|night/.test(lower)) {
        d.setHours(17, 0, 0, 0);
    } else {
        d.setHours(10, 0, 0, 0);
    }
    return d;
}

function buildIcsContent(inquiry) {
    const preferredTime = (inquiry.preferredCallTime || inquiry.lead && inquiry.lead.callTime || '').trim();
    const start = preferredTime ? parsePreferredCallTime(preferredTime) : (() => {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
        d.setHours(10, 0, 0, 0);
        return d;
    })();
    const end = new Date(start.getTime() + 30 * 60 * 1000);
    const fmt = (dt) => dt.toISOString().replace(/[-:.]/g,'').slice(0,15) + 'Z';
    const uid = `yourlab-${Date.now()}-${Math.random().toString(36).slice(2)}@yourlabpt.com`;
    const name  = (inquiry.contact && inquiry.contact.name)  || 'Lead';
    const email = (inquiry.contact && inquiry.contact.email) || (process.env.SMTP_USER || '');
    const idea  = (inquiry.businessIdea || '').slice(0, 200).replace(/[\n\r]/g, ' ');
    const timeNote = preferredTime || 'to be confirmed';

    return [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//YourLab//Chat//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:REQUEST',
        'BEGIN:VEVENT',
        `DTSTART:${fmt(start)}`,
        `DTEND:${fmt(end)}`,
        `SUMMARY:YourLab Discovery Call — ${name}`,
        `DESCRIPTION:Preferred time: ${timeNote}\nBusiness idea: ${idea}`,
        `ORGANIZER;CN=YourLab:mailto:${process.env.SMTP_USER || 'yourlabpt@gmail.com'}`,
        `ATTENDEE;ROLE=REQ-PARTICIPANT;RSVP=TRUE:mailto:${email}`,
        `UID:${uid}`,
        'STATUS:CONFIRMED',
        'SEQUENCE:0',
        'END:VEVENT',
        'END:VCALENDAR'
    ].join('\r\n');
}

// ─────────────────────────────────────────────────────────────────────────────

// Leads must never be lost because an env var was forgotten on a new deploy,
// so fall back to the company inbox when LEAD_NOTIFY_TO is unset.
const DEFAULT_LEAD_NOTIFY_TO = 'yourlabpt@gmail.com';

async function sendLeadNotificationEmail(inquiry) {
    const to = cleanText(process.env.LEAD_NOTIFY_TO, 600) || DEFAULT_LEAD_NOTIFY_TO;

    const transporter = getOrCreateTransporter();
    if (!transporter) {
        return { sent: false, reason: 'SMTP settings are not configured.' };
    }

    const from = cleanText(process.env.SMTP_FROM, 300) || cleanText(process.env.SMTP_USER, 200);
    const leadName = inquiry.contact.name || inquiry.contact.email || inquiry.contact.phone || 'Website Lead';
    const subject = `[YourLab] New Lead ${inquiry.summary.score || 0}/100 - ${leadName}`;

    // Build calendar invite only when we have a preferred call time
    const hasCallTime = !!(inquiry.preferredCallTime ||
        (inquiry.lead && inquiry.lead.callTime));
    const attachments = hasCallTime ? [{
        filename: 'call-invite.ics',
        content: buildIcsContent(inquiry),
        contentType: 'text/calendar; method=REQUEST'
    }] : [];

    try {
        await transporter.sendMail({
            from,
            to,
            subject,
            text: buildLeadEmailText(inquiry),
            attachments
        });
        return { sent: true, calendarInvite: hasCallTime };
    } catch (error) {
        return { sent: false, reason: error.message };
    }
}

app.post('/api/chat', async (req, res) => {
    try {
        const userMessage = cleanText(req.body && req.body.message, 3000);
        const language = req.body && req.body.language === 'pt' ? 'pt' : 'en';
        const incomingSessionId = cleanText(req.body && req.body.sessionId, 120);

        if (!userMessage) {
            return res.status(400).json({ error: 'Message is required.' });
        }

        const session = getOrCreateSession(incomingSessionId, language);
        const extracted = extractLeadSignalsFromText(userMessage);
        session.lead = mergeLead(session.lead, extracted);

        let modelTurn;
        let usingFallback = false;
        let activeModel = '';

        if (FORCE_OFFLINE_CHAT) {
            session.forceFallback = true;
            session.fallbackReason = 'env-offline-mode';
            usingFallback = true;
            activeModel = 'js-fallback-env';
            modelTurn = fallbackTurn(session, userMessage);
        } else {
            const upcomingTurnNumber = session.turns.length + 1;
            const reachedTurnSafetyLimit = MAX_AI_TURNS_WITHOUT_CONTACT > 0
                && upcomingTurnNumber >= MAX_AI_TURNS_WITHOUT_CONTACT
                && !hasLeadContact(session.lead);

            if (reachedTurnSafetyLimit && !session.forceFallback) {
                session.forceFallback = true;
                session.fallbackReason = 'no-contact-turn-limit';
            }

            if (session.forceFallback) {
                usingFallback = true;
                activeModel = 'js-fallback-sticky';
                modelTurn = fallbackTurn(session, userMessage);
            } else {
                // Route: use small model for first turns, big model later, unless this
                // session was pinned to a reliable model after a failure.
                const useSmallByTurn = session.turns.length < SMALL_MODEL_TURNS;
                const autoPrimaryModel = useSmallByTurn ? OLLAMA_MODEL_SMALL : OLLAMA_MODEL_BIG;
                const primaryModel = session.stickyModel || autoPrimaryModel || OLLAMA_MODEL_BIG;
                const canTrySecondary = !session.stickyModel
                    && OLLAMA_MODEL_SMALL
                    && OLLAMA_MODEL_BIG
                    && OLLAMA_MODEL_SMALL !== OLLAMA_MODEL_BIG;
                const secondaryModel = canTrySecondary
                    ? (primaryModel === OLLAMA_MODEL_BIG ? OLLAMA_MODEL_SMALL : OLLAMA_MODEL_BIG)
                    : null;

                activeModel = primaryModel;
                try {
                    modelTurn = await runLeadConversationTurn(session, userMessage, primaryModel);
                } catch (primaryError) {
                    session.modelFailures += 1;
                    console.error(`Model ${primaryModel} failed:`, primaryError.message);

                    if (secondaryModel) {
                        try {
                            console.log(`Retrying with secondary model: ${secondaryModel}`);
                            modelTurn = await runLeadConversationTurn(session, userMessage, secondaryModel);
                            activeModel = secondaryModel;
                            usingFallback = true;
                            // Pin session to the reliable model and stop retrying the heavy one.
                            session.stickyModel = secondaryModel;
                        } catch (smallError) {
                            session.modelFailures += 1;
                            console.error(`Secondary model ${secondaryModel} also failed:`, smallError.message);
                            usingFallback = true;
                            activeModel = 'js-fallback';
                            modelTurn = fallbackTurn(session, userMessage);
                            if (STICKY_JS_FALLBACK) {
                                session.forceFallback = true;
                                session.fallbackReason = 'model-failure';
                            }
                        }
                    } else {
                        usingFallback = true;
                        activeModel = 'js-fallback';
                        modelTurn = fallbackTurn(session, userMessage);
                        if (STICKY_JS_FALLBACK) {
                            session.forceFallback = true;
                            session.fallbackReason = 'model-failure';
                        }
                    }
                }
            }
        }
        console.log(
            `Chat turn — model: ${activeModel}, session: ${session.id.slice(0, 8)}, turns: ${session.turns.length}, stickyFallback: ${session.forceFallback ? 'yes' : 'no'}`
        );
        if (session.forceFallback && session.fallbackReason) {
            console.log(`Fallback reason (${session.id.slice(0, 8)}): ${session.fallbackReason}`);
        }

        const aiLead = modelTurn && modelTurn.updated_lead ? modelTurn.updated_lead : {};
        session.lead = mergeLead(session.lead, aiLead);
        session.leadScore = Number.isFinite(modelTurn.lead_score)
            ? Math.max(0, Math.min(100, modelTurn.lead_score))
            : computeLeadScore(session.lead);
        const allowedStages = ['discover', 'qualify', 'capture', 'commit', 'completed'];
        const modelStage = allowedStages.includes(modelTurn.lead_stage) ? modelTurn.lead_stage : '';
        session.stage = modelStage || resolveLeadStage(session.lead, session.leadScore);
        session.topicBullets = Array.isArray(modelTurn.topic_bullets)
            ? modelTurn.topic_bullets.map((item) => cleanText(item, 140)).filter(Boolean).slice(0, 8)
            : session.topicBullets;
        session.nextBestAction = cleanText(modelTurn.next_best_action, 220) || session.nextBestAction;

        const assistantReply = cleanText(modelTurn.assistant_reply, 1500)
            || (language === 'pt' ? 'Obrigado. Podes partilhar mais detalhes?' : 'Thanks. Could you share a bit more detail?');

        session.turns.push({
            user: userMessage,
            assistant: assistantReply,
            timestamp: new Date().toISOString()
        });
        session.updatedAt = new Date().toISOString();

        let saved = false;
        let emailNotification = { sent: false, reason: 'Lead not ready yet.' };

        // Save as soon as we have contact info, even without full story (partial lead).
        // Also save after 3+ turns even without contact (warm partial).
        const readyToSave = hasLeadContact(session.lead) || session.turns.length >= 3;
        if (readyToSave) {
            const inquiry = sessionToInquiry(session);
            session.savedFile = saveInquiry(inquiry, session.savedFile);
            saved = true;

            // Only send email notification once the lead has both contact + story
            const leadIsQualified = hasLeadContact(session.lead) && hasLeadStory(session.lead);
            if (leadIsQualified && !session.notified) {
                emailNotification = await sendLeadNotificationEmail(inquiry);
                if (emailNotification.sent) {
                    session.notified = true;
                }
            } else if (!leadIsQualified) {
                emailNotification = { sent: false, reason: 'Lead saved but not yet fully qualified for notification.' };
            } else {
                emailNotification = { sent: false, reason: 'Notification already sent for this session.' };
            }
        }

        return res.json({
            success: true,
            sessionId: session.id,
            reply: assistantReply,
            stage: session.stage,
            leadScore: session.leadScore,
            requestContactNow: Boolean(modelTurn.request_contact_now),
            lead: {
                name: session.lead.name,
                email: session.lead.email,
                phone: session.lead.phone,
                company: session.lead.company,
                callTime: session.lead.callTime
            },
            saved,
            emailNotification,
            usingFallback,
            activeModel,
            stickyFallback: session.forceFallback
        });
    } catch (error) {
        console.error('Error in /api/chat:', error);
        return res.status(500).json({
            error: 'Failed to process chat message.',
            details: error.message
        });
    }
});

// Save inquiry endpoint (compatibility with existing frontend flow)
app.post('/api/save-inquiry', async (req, res) => {
    try {
        const inquiry = req.body || {};
        const contact = inquiry.contact || {};
        const lead = inquiry.lead || {};
        const mergedLead = mergeLead(createEmptyLead(inquiry.language || 'en'), {
            ...lead,
            name: contact.name,
            email: contact.email,
            phone: contact.phone
        });

        if (!mergedLead.email && !mergedLead.phone) {
            return res.status(400).json({ error: 'Email or phone is required.' });
        }

        const fullInquiry = {
            timestamp: toIsoDate(inquiry.timestamp),
            sessionId: cleanText(inquiry.sessionId, 120),
            source: inquiry.source || 'website-manual-save',
            contact: {
                name: mergedLead.name,
                email: mergedLead.email,
                phone: mergedLead.phone
            },
            businessIdea: cleanText(inquiry.businessIdea, 3000),
            preferredCallTime: cleanText(inquiry.preferredCallTime || (inquiry.lead && inquiry.lead.callTime), 200),
            lead: { ...mergedLead, callTime: cleanText(inquiry.preferredCallTime || (inquiry.lead && inquiry.lead.callTime), 200) },
            summary: {
                score: Number.isFinite(inquiry && inquiry.summary && inquiry.summary.score)
                    ? inquiry.summary.score
                    : computeLeadScore(mergedLead),
                stage: cleanText(inquiry && inquiry.summary && inquiry.summary.stage, 40)
                    || resolveLeadStage(mergedLead),
                topics: Array.isArray(inquiry && inquiry.summary && inquiry.summary.topics)
                    ? inquiry.summary.topics.map((t) => cleanText(t, 140)).filter(Boolean).slice(0, 8)
                    : [],
                nextBestAction: cleanText(inquiry && inquiry.summary && inquiry.summary.nextBestAction, 220)
            },
            messages: Array.isArray(inquiry.messages) ? inquiry.messages : []
        };

        const filename = saveInquiry(fullInquiry);
        const emailNotification = await sendLeadNotificationEmail(fullInquiry);

        res.json({
            success: true,
            message: 'Inquiry saved successfully',
            inquiryId: filename,
            emailNotification
        });
    } catch (error) {
        console.error('Error saving inquiry:', error);
        res.status(500).json({
            error: 'Failed to save inquiry',
            details: error.message
        });
    }
});

// Admin login
app.post('/api/admin/login', (req, res) => {
    const password = cleanText(req.body && req.body.password, 300);
    if (!adminAuth.validatePassword(password)) {
        return res.status(401).json({ error: 'Invalid password.' });
    }
    const token = adminAuth.issueToken();
    return res.json({ token });
});

// Admin logout
app.post('/api/admin/logout', (req, res) => {
    const token = (req.headers['x-admin-token'] || '').trim();
    if (token) adminAuth.revokeToken(token);
    return res.json({ success: true });
});

// Digitalize Portugal — master key login
const digitalizeptLoginLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 8 });
const digitalizeptDomainLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 20 });

app.post('/api/digitalizept/login', (req, res) => {
    const ip = String(req.ip || req.socket.remoteAddress || 'unknown');
    if (digitalizeptLoginLimiter.isLimited(ip)) {
        res.setHeader('retry-after', '900');
        return res.status(429).json({ error: 'Demasiadas tentativas. Espere alguns minutos.' });
    }
    const key = cleanText(req.body && req.body.password, 300);
    if (!digitalizeptAuth.validatePassword(key)) {
        return res.status(401).json({ error: 'Invalid key.' });
    }
    const token = digitalizeptAuth.issueToken();
    return res.json({ token });
});

app.post('/api/digitalizept/logout', (req, res) => {
    const token = (req.headers['x-admin-token'] || '').trim();
    if (token) digitalizeptAuth.revokeToken(token);
    return res.json({ success: true });
});

// Digitalize Portugal — business-type configs. Adding a type = adding a file, no deploy.
const digitalizeptConfigDir = path.join(__dirname, 'config', 'business-types');

function loadBusinessTypes() {
    if (!fs.existsSync(digitalizeptConfigDir)) return [];
    return fs.readdirSync(digitalizeptConfigDir)
        .filter((file) => file.endsWith('.json'))
        .map((file) => {
            try {
                return JSON.parse(fs.readFileSync(path.join(digitalizeptConfigDir, file), 'utf8'));
            } catch (err) {
                console.error(`digitalizept: invalid config ${file}: ${err.message}`);
                return null;
            }
        })
        .filter(Boolean)
        .sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt'));
}

function loadStandardFields() {
    const fieldsPath = path.join(__dirname, 'config', 'fields.json');
    if (!fs.existsSync(fieldsPath)) return {};
    try {
        return JSON.parse(fs.readFileSync(fieldsPath, 'utf8'));
    } catch (err) {
        console.error(`digitalizept: invalid fields.json: ${err.message}`);
        return {};
    }
}

app.get('/api/digitalizept/business-types', requireDigitalizept, (req, res) => {
    try {
        return res.json({
            businessTypes: loadBusinessTypes(),
            standardFields: loadStandardFields(),
            config: {
                ivaRate: DIGITALIZEPT_IVA_RATE,
                provider: DIGITALIZEPT_PROVIDER
            }
        });
    } catch (err) {
        console.error('digitalizept business-types error:', err.message);
        return res.status(500).json({ error: 'Failed to load business types.' });
    }
});

// Digitalize Portugal — service catalog (servico table)
app.get('/api/digitalizept/catalog', requireDigitalizept, (req, res) => {
    try {
        const db = getDigitalizeptDb();
        const includeInactive = String(req.query.all || '') === '1';
        const rows = includeInactive
            ? db.prepare('SELECT * FROM servico ORDER BY ordem ASC').all()
            : db.prepare('SELECT * FROM servico WHERE ativo = 1 ORDER BY ordem ASC').all();
        return res.json({ servicos: rows });
    } catch (err) {
        console.error('digitalizept catalog error:', err.message);
        return res.status(500).json({ error: 'Failed to load catalog.' });
    }
});

app.post('/api/digitalizept/catalog', requireDigitalizept, (req, res) => {
    try {
        const body = req.body || {};
        const codigo = cleanText(body.codigo, 80).toLowerCase().replace(/[^a-z0-9_]/g, '_');
        const nome = cleanText(body.nome, 200);
        const tipo = cleanText(body.tipo, 40) || 'extra';
        if (!codigo || !nome) {
            return res.status(400).json({ error: 'Código e nome são obrigatórios.' });
        }
        if (!['pacote', 'extra', 'ajuste', 'manutencao'].includes(tipo)) {
            return res.status(400).json({ error: 'Tipo inválido.' });
        }
        const db = getDigitalizeptDb();
        if (db.prepare('SELECT id FROM servico WHERE codigo = ?').get(codigo)) {
            return res.status(409).json({ error: 'Já existe um serviço com este código.' });
        }
        const id = crypto.randomUUID();
        const preco = Math.max(0, Math.round(Number(body.preco_centimos) || 0));
        const percentual = body.percentual == null || body.percentual === ''
            ? null
            : Number(body.percentual);
        const ordem = Math.round(Number(body.ordem) || 999);
        db.prepare(`
            INSERT INTO servico (id, codigo, nome, descricao_cliente, preco_centimos, percentual, tipo, ativo, ordem, admin_edited)
            VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, 1)
        `).run(
            id, codigo, nome, cleanText(body.descricao_cliente, 800),
            preco, Number.isFinite(percentual) ? percentual : null, tipo, ordem
        );
        const row = db.prepare('SELECT * FROM servico WHERE id = ?').get(id);
        return res.json({ ok: true, servico: row });
    } catch (err) {
        console.error('digitalizept catalog create error:', err.message);
        return res.status(500).json({ error: 'Não foi possível criar o serviço.' });
    }
});

app.patch('/api/digitalizept/catalog/:codigo', requireDigitalizept, (req, res) => {
    try {
        const codigo = cleanText(req.params.codigo, 80);
        const body = req.body || {};
        const db = getDigitalizeptDb();
        const existing = db.prepare('SELECT * FROM servico WHERE codigo = ?').get(codigo);
        if (!existing) return res.status(404).json({ error: 'Serviço não encontrado.' });

        const nome = body.nome != null ? cleanText(body.nome, 200) : existing.nome;
        const descricao = body.descricao_cliente != null
            ? cleanText(body.descricao_cliente, 800)
            : existing.descricao_cliente;
        const preco = body.preco_centimos != null
            ? Math.max(0, Math.round(Number(body.preco_centimos) || 0))
            : existing.preco_centimos;
        const percentual = Object.prototype.hasOwnProperty.call(body, 'percentual')
            ? (body.percentual === null || body.percentual === ''
                ? null
                : Number(body.percentual))
            : existing.percentual;
        const tipo = body.tipo != null ? cleanText(body.tipo, 40) : existing.tipo;
        const ordem = body.ordem != null ? Math.round(Number(body.ordem) || 0) : existing.ordem;
        const ativo = body.ativo != null ? (body.ativo ? 1 : 0) : existing.ativo;

        db.prepare(`
            UPDATE servico SET nome = ?, descricao_cliente = ?, preco_centimos = ?,
                percentual = ?, tipo = ?, ordem = ?, ativo = ?, admin_edited = 1
            WHERE codigo = ?
        `).run(nome, descricao, preco, Number.isFinite(percentual) ? percentual : null, tipo, ordem, ativo, codigo);

        const row = db.prepare('SELECT * FROM servico WHERE codigo = ?').get(codigo);
        return res.json({ ok: true, servico: row });
    } catch (err) {
        console.error('digitalizept catalog patch error:', err.message);
        return res.status(500).json({ error: 'Não foi possível atualizar o serviço.' });
    }
});

const digitalizeptGoogleChecklistsPath = path.join(__dirname, 'config', 'google-checklists.json');
let digitalizeptGoogleChecklists = null;
function loadGoogleChecklists() {
    if (digitalizeptGoogleChecklists) return digitalizeptGoogleChecklists;
    try {
        digitalizeptGoogleChecklists = JSON.parse(fs.readFileSync(digitalizeptGoogleChecklistsPath, 'utf8'));
    } catch (err) {
        console.error(`digitalizept: google-checklists.json: ${err.message}`);
        digitalizeptGoogleChecklists = { default: { atributos: [] } };
    }
    return digitalizeptGoogleChecklists;
}

app.get('/api/digitalizept/google-checklist', requireDigitalizept, (req, res) => {
    try {
        const tipo = cleanText(req.query.tipo, 80) || 'generico';
        const all = loadGoogleChecklists();
        const checklist = all[tipo] || all.default || { atributos: [] };
        return res.json({ tipo, checklist });
    } catch (err) {
        console.error('digitalizept google-checklist error:', err.message);
        return res.status(500).json({ error: 'Failed to load Google checklist.' });
    }
});

// DNS-based domain availability — returns up to three names that do not resolve yet.
app.get('/api/digitalizept/domains', requireDigitalizept, async (req, res) => {
    const ip = req.ip || 'unknown';
    if (digitalizeptDomainLimiter.isLimited(ip)) {
        return res.status(429).json({ error: 'Demasiadas pesquisas de domínio. Aguarde um minuto.' });
    }
    const nome = String(req.query.nome || '').trim().slice(0, 120);
    const cidade = String(req.query.cidade || '').trim().slice(0, 80);
    if (!nome) {
        return res.status(400).json({ error: 'Indique o nome do negócio.' });
    }
    try {
        const result = await findAvailableDomains(nome, cidade);
        return res.json(result);
    } catch (err) {
        console.error('digitalizept domains error:', err.message);
        return res.status(500).json({ error: 'Não foi possível verificar domínios.' });
    }
});

function digitalizeptSlug(value) {
    const base = String(value || 'negocio')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40) || 'negocio';
    return `${base}-${crypto.randomBytes(3).toString('hex')}`;
}

function scheduleLeadGeocode(leadId, { force = false } = {}) {
    setImmediate(() => {
        try {
            const db = getDigitalizeptDb();
            geocodeLeadRow(db, leadId, { force, nowIso: digitalizeptNow }).catch((err) => {
                console.error(`digitalizept geocode ${leadId}:`, err.message);
            });
        } catch (err) {
            console.error(`digitalizept geocode schedule ${leadId}:`, err.message);
        }
    });
}

function applyAutoCobertura(db, leadId, nextAuto) {
    const row = db.prepare('SELECT cobertura, cobertura_locked FROM lead WHERE id = ?').get(leadId);
    if (!row || row.cobertura_locked) return;
    db.prepare('UPDATE lead SET cobertura = ? WHERE id = ?').run(nextAuto, leadId);
}

function clearGeocodeIfAddressChanged(db, leadId, morada, cidade) {
    const prev = db.prepare('SELECT morada, cidade FROM lead WHERE id = ?').get(leadId);
    if (!prev) return;
    if (String(prev.morada || '') !== String(morada || '')
        || String(prev.cidade || '') !== String(cidade || '')) {
        db.prepare(`
            UPDATE lead SET lat = NULL, lng = NULL, geocode_status = '', geocoded_at = ''
            WHERE id = ?
        `).run(leadId);
    }
}

function parseJsonSafe(raw, fallback) {
    try {
        const parsed = JSON.parse(raw || '');
        return parsed && typeof parsed === 'object' ? parsed : fallback;
    } catch (_) {
        return fallback;
    }
}

function splitDados(dados, businessType) {
    const required = new Set([
        ...(Array.isArray(businessType.campos_obrigatorios) ? businessType.campos_obrigatorios : []),
        ...((businessType.perguntas_especificas || []).map((q) => q.id))
    ]);
    const obrigatorios = {};
    const opcionais = {};
    Object.entries(dados || {}).forEach(([key, value]) => {
        if (required.has(key)) obrigatorios[key] = value;
        else opcionais[key] = value;
    });
    return { obrigatorios, opcionais };
}

let digitalizeptParseDemo = null;
async function parseDemoFromRaw(raw) {
    if (!digitalizeptParseDemo) {
        const mod = await import('../digitalizept/js/demo/parse.js');
        digitalizeptParseDemo = mod.parseDemoOutput;
    }
    return digitalizeptParseDemo(raw);
}

async function generateDemoCopy(prompt) {
    if (!ollamaClient) {
        return { ok: false, fallback: true, error: 'Modelo indisponível. Use o fluxo manual.' };
    }
    const abortController = new AbortController();
    const timeoutHandle = setTimeout(() => abortController.abort(), MODEL_TIMEOUT_MS);
    try {
        const response = await ollamaClient.chat.completions.create(
            {
                model: OLLAMA_MODEL_BIG,
                messages: [
                    { role: 'system', content: 'Responde apenas com JSON válido, sem markdown.' },
                    { role: 'user', content: String(prompt || '') }
                ],
                response_format: { type: 'json_object' },
                temperature: 0.4,
                max_tokens: 1200,
                stream: false
            },
            { signal: abortController.signal }
        );
        const raw = response && response.choices && response.choices[0]
            && response.choices[0].message && response.choices[0].message.content;
        const parsed = await parseDemoFromRaw(raw);
        if (!parsed.ok) return { ok: false, fallback: true, error: parsed.error };
        return { ok: true, demo: parsed.demo, raw };
    } catch (err) {
        return { ok: false, fallback: true, error: err.message || 'Falha a gerar a demonstração.' };
    } finally {
        clearTimeout(timeoutHandle);
    }
}

app.post('/api/digitalizept/demo', requireDigitalizept, async (req, res) => {
    const prompt = String((req.body && req.body.prompt) || '');
    if (!prompt.trim()) {
        return res.status(400).json({ error: 'Falta o prompt.', fallback: true });
    }
    const result = await generateDemoCopy(prompt);
    if (!result.ok) {
        return res.status(503).json(result);
    }
    return res.json(result);
});

app.post('/api/digitalizept/leads', requireDigitalizept, (req, res) => {
    try {
        const body = req.body || {};
        const businessType = body.businessType || {};
        const dados = body.dados || {};
        const nome = cleanText(dados.nome_negocio, 200);
        if (!nome) {
            return res.status(400).json({ error: 'Falta o nome do negócio.' });
        }
        const db = getDigitalizeptDb();
        const now = digitalizeptNow();
        const { obrigatorios, opcionais } = splitDados(dados, businessType);
        let leadId = cleanText(body.leadId, 80);
        const morada = cleanText(dados.morada, 300);
        const cidade = cleanText(dados.cidade, 120);
        const telefone = cleanText(dados.telefone, 60);
        const whatsapp = cleanText(dados.whatsapp, 60);

        const persist = db.transaction(() => {
            if (leadId) {
                const existing = db.prepare('SELECT id FROM lead WHERE id = ?').get(leadId);
                if (!existing) leadId = '';
            }
            if (!leadId) {
                leadId = crypto.randomUUID();
                db.prepare(`INSERT INTO lead (id, business_type, nome, morada, cidade, telefone, whatsapp, estado, cobertura, criado_em)
                    VALUES (?, ?, ?, ?, ?, ?, ?, 'rascunho', 'contacto', ?)`).run(
                    leadId, cleanText(businessType.id, 80), nome,
                    morada, cidade, telefone, whatsapp, now);
                db.prepare(`INSERT INTO dados_negocio (id, lead_id, obrigatorios_json, opcionais_json, criado_em)
                    VALUES (?, ?, ?, ?, ?)`).run(
                    crypto.randomUUID(), leadId, JSON.stringify(obrigatorios), JSON.stringify(opcionais), now);
            } else {
                clearGeocodeIfAddressChanged(db, leadId, morada, cidade);
                db.prepare(`UPDATE lead SET business_type = ?, nome = ?, morada = ?, cidade = ?, telefone = ?, whatsapp = ?
                    WHERE id = ?`).run(
                    cleanText(businessType.id, 80), nome, morada, cidade, telefone, whatsapp, leadId);
                const dadosRow = db.prepare('SELECT id FROM dados_negocio WHERE lead_id = ?').get(leadId);
                if (dadosRow) {
                    db.prepare(`UPDATE dados_negocio SET obrigatorios_json = ?, opcionais_json = ? WHERE id = ?`)
                        .run(JSON.stringify(obrigatorios), JSON.stringify(opcionais), dadosRow.id);
                } else {
                    db.prepare(`INSERT INTO dados_negocio (id, lead_id, obrigatorios_json, opcionais_json, criado_em)
                        VALUES (?, ?, ?, ?, ?)`).run(
                        crypto.randomUUID(), leadId, JSON.stringify(obrigatorios), JSON.stringify(opcionais), now);
                }
            }
            if (body.wizard && typeof body.wizard === 'object') {
                db.prepare('UPDATE lead SET wizard_json = ? WHERE id = ?')
                    .run(JSON.stringify(body.wizard), leadId);
            }
            digitalizeptLogEvento(db, 'lead', leadId, 'rascunho', { nome });
        });
        persist();
        scheduleLeadGeocode(leadId);
        return res.json({ ok: true, leadId });
    } catch (err) {
        console.error('digitalizept draft lead error:', err.message);
        return res.status(500).json({ error: 'Não foi possível guardar o rascunho.' });
    }
});

app.get('/api/digitalizept/leads', requireDigitalizept, (req, res) => {
    try {
        const db = getDigitalizeptDb();
        const rows = db.prepare(`
            SELECT l.id, l.business_type, l.nome, l.morada, l.cidade, l.telefone, l.whatsapp, l.estado,
                   l.cobertura, l.demo_slug, l.notas_admin, l.criado_em, l.lat, l.lng,
                   p.total_com_iva_centimos, p.iva_rate
            FROM lead l
            LEFT JOIN proposta p ON p.lead_id = l.id
            ORDER BY l.criado_em DESC
            LIMIT 200
        `).all();
        return res.json({ leads: rows });
    } catch (err) {
        console.error('digitalizept leads error:', err.message);
        return res.status(500).json({ error: 'Failed to load leads.' });
    }
});

app.get('/api/digitalizept/maps-config', requireDigitalizept, (req, res) => {
    const apiKey = mapsApiKey();
    return res.json({
        configured: Boolean(apiKey),
        apiKey: apiKey || '',
        cobertura: COBERTURA_VALUES.map((id) => ({
            id,
            label: COBERTURA_LABELS[id],
            color: COBERTURA_COLORS[id]
        }))
    });
});

app.get('/api/digitalizept/coverage', requireDigitalizept, (req, res) => {
    try {
        const db = getDigitalizeptDb();
        const rows = db.prepare(`
            SELECT id, business_type, nome, morada, cidade, telefone, whatsapp, estado,
                   cobertura, cobertura_locked, demo_slug, lat, lng, geocode_status, criado_em
            FROM lead
            ORDER BY criado_em DESC
            LIMIT 500
        `).all();
        return res.json({
            pins: rows.map((r) => ({
                id: r.id,
                nome: r.nome,
                business_type: r.business_type,
                morada: r.morada,
                cidade: r.cidade,
                telefone: r.telefone,
                estado: r.estado,
                cobertura: r.cobertura || 'contacto',
                cobertura_locked: Boolean(r.cobertura_locked),
                demo_slug: r.demo_slug,
                lat: r.lat,
                lng: r.lng,
                geocode_status: r.geocode_status,
                criado_em: r.criado_em,
                color: COBERTURA_COLORS[r.cobertura] || COBERTURA_COLORS.contacto
            })),
            legend: COBERTURA_VALUES.map((id) => ({
                id,
                label: COBERTURA_LABELS[id],
                color: COBERTURA_COLORS[id]
            }))
        });
    } catch (err) {
        console.error('digitalizept coverage error:', err.message);
        return res.status(500).json({ error: 'Failed to load coverage.' });
    }
});

app.post('/api/digitalizept/leads/:leadId/geocode', requireDigitalizept, async (req, res) => {
    try {
        const leadId = cleanText(req.params.leadId, 80);
        const db = getDigitalizeptDb();
        const lead = db.prepare('SELECT id FROM lead WHERE id = ?').get(leadId);
        if (!lead) return res.status(404).json({ error: 'Lead não encontrado.' });
        const result = await geocodeLeadRow(db, leadId, { force: true, nowIso: digitalizeptNow });
        const updated = db.prepare(`
            SELECT id, lat, lng, geocode_status, morada, cidade FROM lead WHERE id = ?
        `).get(leadId);
        if (!result || result.ok === false) {
            return res.status(422).json({
                error: (result && result.error) || 'Geocoding falhou.',
                lead: updated
            });
        }
        return res.json({ ok: true, lead: updated });
    } catch (err) {
        console.error('digitalizept geocode post error:', err.message);
        return res.status(500).json({ error: 'Não foi possível geocodificar.' });
    }
});

// Hydrate a lead (open or closed) so the sales wizard can reopen with fields filled.
app.get('/api/digitalizept/leads/:leadId/resume', requireDigitalizept, (req, res) => {
    try {
        const leadId = cleanText(req.params.leadId, 80);
        const db = getDigitalizeptDb();
        const row = db.prepare(`
            SELECT l.id, l.business_type, l.nome, l.morada, l.telefone, l.whatsapp, l.estado,
                   l.demo_slug, l.demo_json, l.identidade_json, l.google_presence_json, l.wizard_json,
                   d.obrigatorios_json, d.opcionais_json
            FROM lead l
            LEFT JOIN dados_negocio d ON d.lead_id = l.id
            WHERE l.id = ?
        `).get(leadId);
        if (!row) return res.status(404).json({ error: 'Lead não encontrado.' });

        const types = loadBusinessTypes();
        const businessType = types.find((t) => t.id === row.business_type)
            || { id: row.business_type, nome: row.business_type || 'Negócio' };
        const dados = {
            nome_negocio: row.nome || '',
            morada: row.morada || '',
            telefone: row.telefone || '',
            whatsapp: row.whatsapp || '',
            ...parseJsonSafe(row.obrigatorios_json, {}),
            ...parseJsonSafe(row.opcionais_json, {})
        };
        if (!dados.nome_negocio) dados.nome_negocio = row.nome || '';

        const identidade = parseJsonSafe(row.identidade_json, {});
        const demo = parseJsonSafe(row.demo_json, null);
        const googlePresence = parseJsonSafe(row.google_presence_json, null);
        const wizardExtra = parseJsonSafe(row.wizard_json, {});

        // Closed deals: load the latest proposta + legal + project so re-sign updates in place.
        let proposta = wizardExtra.proposta || undefined;
        let clienteLegal = wizardExtra.clienteLegal || undefined;
        let revisingDeal = false;
        let projectId = '';
        let propostaId = '';
        let contratoId = '';
        let contratoVersao = 'v1';

        if (row.estado === 'fechado') {
            const deal = db.prepare(`
                SELECT p.id AS propostaId, p.itens_json, p.desconto_pct, p.subtotal_centimos,
                       p.desconto_centimos, p.total_centimos, p.iva_rate, p.iva_centimos,
                       p.total_com_iva_centimos, p.contrapartida, p.valor_hora_estimado,
                       c.id AS contratoId, c.template_versao,
                       pr.id AS projectId,
                       cl.nome AS cliente_nome, cl.nif, cl.morada AS cliente_morada,
                       cl.email AS cliente_email, cl.telefone AS cliente_telefone
                FROM proposta p
                JOIN contrato c ON c.proposta_id = p.id
                JOIN projeto pr ON pr.contrato_id = c.id
                LEFT JOIN cliente_legal cl ON cl.lead_id = p.lead_id
                WHERE p.lead_id = ?
                ORDER BY p.criado_em DESC
                LIMIT 1
            `).get(leadId);
            if (deal) {
                revisingDeal = true;
                projectId = deal.projectId;
                propostaId = deal.propostaId;
                contratoId = deal.contratoId;
                contratoVersao = deal.template_versao || 'v1';
                const itens = parseJsonSafe(deal.itens_json, {});
                proposta = {
                    pacote: itens.pacote || 'google_essencial',
                    extras: Array.isArray(itens.extras) ? itens.extras : [],
                    urgencia: Boolean(itens.urgencia),
                    manutencao: itens.manutencao || null,
                    manutencoes: Array.isArray(itens.manutencoes)
                        ? itens.manutencoes
                        : (itens.manutencao ? [itens.manutencao] : []),
                    descontoPct: Number(deal.desconto_pct) || 0,
                    contrapartida: deal.contrapartida || itens.contrapartida || '',
                    cobrarIva: itens.cobrarIva === true,
                    dominio: itens.dominio || null,
                    _calc: {
                        subtotal: deal.subtotal_centimos,
                        descontoPct: deal.desconto_pct,
                        desconto: deal.desconto_centimos,
                        totalSemIva: deal.total_centimos,
                        ivaRate: deal.iva_rate,
                        iva: deal.iva_centimos,
                        totalComIva: deal.total_com_iva_centimos,
                        valorHora: deal.valor_hora_estimado
                    }
                };
                if (deal.cliente_nome || deal.cliente_email) {
                    clienteLegal = {
                        nome: deal.cliente_nome || '',
                        nif: deal.nif || '',
                        morada: deal.cliente_morada || '',
                        email: deal.cliente_email || '',
                        telefone: deal.cliente_telefone || ''
                    };
                }
            }
        }

        const data = {
            leadId: row.id,
            businessType,
            dados,
            identidade: Object.keys(identidade || {}).length ? identidade : undefined,
            demo: demo && demo.hero ? demo : (wizardExtra.demo || undefined),
            demoUrl: row.demo_slug ? `/d/${row.demo_slug}` : (wizardExtra.demoUrl || ''),
            demoPrompt: wizardExtra.demoPrompt || '',
            demoRaw: wizardExtra.demoRaw || '',
            demoGbp: wizardExtra.demoGbp === true,
            googleDiagnostico: wizardExtra.googleDiagnostico || undefined,
            proposta,
            googlePresence: (googlePresence && Object.keys(googlePresence).length)
                ? googlePresence
                : (wizardExtra.googlePresence || undefined),
            clienteLegal,
            revisingDeal: revisingDeal || undefined,
            projectId: projectId || undefined,
            propostaId: propostaId || undefined,
            contratoId: contratoId || undefined,
            contratoVersao: revisingDeal ? contratoVersao : undefined
        };
        Object.keys(data).forEach((key) => {
            if (data[key] === undefined || data[key] === '') delete data[key];
        });

        return res.json({
            ok: true,
            leadId: row.id,
            estado: row.estado,
            revisingDeal,
            suggestedStep: 0,
            data
        });
    } catch (err) {
        console.error('digitalizept resume lead error:', err.message);
        return res.status(500).json({ error: 'Não foi possível reabrir este lead.' });
    }
});

function nextContractVersion(current) {
    const match = /^v(\d+)$/i.exec(String(current || 'v1').trim());
    const n = match ? Number(match[1]) : 1;
    return `v${Math.max(1, n) + 1}`;
}

app.get('/api/digitalizept/deals', requireDigitalizept, (req, res) => {
    try {
        const db = getDigitalizeptDb();
        const rows = db.prepare(`
            SELECT pr.id AS projectId, pr.estado, pr.estado_google, pr.estado_dominio, pr.criado_em,
                   l.id AS leadId, l.nome, l.business_type, l.demo_slug, l.work_path, l.notas_admin,
                   p.id AS propostaId, p.total_centimos, p.iva_centimos, p.total_com_iva_centimos, p.iva_rate, p.itens_json,
                   c.id AS contratoId, c.template_versao, c.pdf_path, c.html_path, c.hash_sha256,
                   cl.nome AS cliente_nome, cl.email AS cliente_email, cl.nif
            FROM projeto pr
            JOIN contrato c ON c.id = pr.contrato_id
            JOIN proposta p ON p.id = c.proposta_id
            JOIN lead l ON l.id = p.lead_id
            LEFT JOIN cliente_legal cl ON cl.lead_id = l.id
            ORDER BY pr.criado_em DESC
            LIMIT 200
        `).all();
        return res.json({ deals: rows });
    } catch (err) {
        console.error('digitalizept deals error:', err.message);
        return res.status(500).json({ error: 'Failed to load deals.' });
    }
});

const PROJECT_FASES = [
    'demonstracao_criada',
    'proposta',
    'contrato_assinado',
    'google_em_curso',
    'site_no_ar',
    'entregue',
    'arquivado'
];

app.patch('/api/digitalizept/deals/:projectId', requireDigitalizept, (req, res) => {
    try {
        const projectId = cleanText(req.params.projectId, 80);
        const body = req.body || {};
        const db = getDigitalizeptDb();
        const row = db.prepare('SELECT id, estado, estado_google, estado_dominio FROM projeto WHERE id = ?').get(projectId);
        if (!row) return res.status(404).json({ error: 'Projeto não encontrado.' });

        const estado = body.estado != null ? cleanText(body.estado, 60) : row.estado;
        const estadoGoogle = body.estado_google != null ? cleanText(body.estado_google, 60) : row.estado_google;
        const estadoDominio = body.estado_dominio != null ? cleanText(body.estado_dominio, 60) : row.estado_dominio;
        if (body.estado != null && !PROJECT_FASES.includes(estado)) {
            return res.status(400).json({ error: 'Fase inválida.' });
        }
        db.prepare(`UPDATE projeto SET estado = ?, estado_google = ?, estado_dominio = ? WHERE id = ?`)
            .run(estado, estadoGoogle, estadoDominio, projectId);
        return res.json({
            ok: true,
            project: db.prepare('SELECT id AS projectId, estado, estado_google, estado_dominio FROM projeto WHERE id = ?').get(projectId)
        });
    } catch (err) {
        console.error('digitalizept deal patch error:', err.message);
        return res.status(500).json({ error: 'Não foi possível atualizar a fase.' });
    }
});

app.get('/api/digitalizept/leads/:leadId/notes', requireDigitalizept, (req, res) => {
    try {
        const leadId = cleanText(req.params.leadId, 80);
        const db = getDigitalizeptDb();
        const lead = db.prepare('SELECT id, notas_admin FROM lead WHERE id = ?').get(leadId);
        if (!lead) return res.status(404).json({ error: 'Lead não encontrado.' });
        const notes = db.prepare('SELECT id, texto, criado_em FROM nota WHERE lead_id = ? ORDER BY criado_em DESC').all(leadId);
        return res.json({ notas_admin: lead.notas_admin || '', notes });
    } catch (err) {
        console.error('digitalizept notes get error:', err.message);
        return res.status(500).json({ error: 'Failed to load notes.' });
    }
});

app.post('/api/digitalizept/leads/:leadId/notes', requireDigitalizept, (req, res) => {
    try {
        const leadId = cleanText(req.params.leadId, 80);
        const texto = cleanText((req.body || {}).texto, 2000);
        if (!texto) return res.status(400).json({ error: 'Texto em falta.' });
        const db = getDigitalizeptDb();
        const lead = db.prepare('SELECT id FROM lead WHERE id = ?').get(leadId);
        if (!lead) return res.status(404).json({ error: 'Lead não encontrado.' });
        const id = crypto.randomUUID();
        const now = digitalizeptNow();
        db.prepare('INSERT INTO nota (id, lead_id, texto, criado_em) VALUES (?, ?, ?, ?)').run(id, leadId, texto, now);
        return res.json({ ok: true, note: { id, texto, criado_em: now } });
    } catch (err) {
        console.error('digitalizept notes post error:', err.message);
        return res.status(500).json({ error: 'Não foi possível guardar o comentário.' });
    }
});

app.patch('/api/digitalizept/leads/:leadId', requireDigitalizept, (req, res) => {
    try {
        const leadId = cleanText(req.params.leadId, 80);
        const body = req.body || {};
        const db = getDigitalizeptDb();
        const lead = db.prepare('SELECT id, morada, cidade FROM lead WHERE id = ?').get(leadId);
        if (!lead) return res.status(404).json({ error: 'Lead não encontrado.' });
        if (body.notas_admin != null) {
            db.prepare('UPDATE lead SET notas_admin = ? WHERE id = ?')
                .run(cleanText(body.notas_admin, 4000), leadId);
        }
        if (body.cobertura != null) {
            const cobertura = cleanText(body.cobertura, 40);
            if (!isValidCobertura(cobertura)) {
                return res.status(400).json({ error: 'Estado de cobertura inválido.' });
            }
            db.prepare('UPDATE lead SET cobertura = ?, cobertura_locked = 1 WHERE id = ?')
                .run(cobertura, leadId);
        }
        if (body.cidade != null || body.morada != null) {
            const morada = body.morada != null ? cleanText(body.morada, 300) : lead.morada;
            const cidade = body.cidade != null ? cleanText(body.cidade, 120) : lead.cidade;
            clearGeocodeIfAddressChanged(db, leadId, morada, cidade);
            db.prepare('UPDATE lead SET morada = ?, cidade = ? WHERE id = ?').run(morada, cidade, leadId);
            scheduleLeadGeocode(leadId, { force: true });
        }
        if (body.regeocode === true) {
            scheduleLeadGeocode(leadId, { force: true });
        }
        const updated = db.prepare(`
            SELECT id, nome, morada, cidade, cobertura, cobertura_locked, lat, lng, geocode_status, estado, demo_slug
            FROM lead WHERE id = ?
        `).get(leadId);
        return res.json({ ok: true, lead: updated });
    } catch (err) {
        console.error('digitalizept lead patch error:', err.message);
        return res.status(500).json({ error: 'Não foi possível atualizar o lead.' });
    }
});

app.get('/api/digitalizept/deals/:projectId/contract', requireDigitalizept, (req, res) => {
    try {
        const db = getDigitalizeptDb();
        const row = db.prepare(`
            SELECT c.pdf_path, c.html_path, l.nome
            FROM projeto pr
            JOIN contrato c ON c.id = pr.contrato_id
            JOIN proposta p ON p.id = c.proposta_id
            JOIN lead l ON l.id = p.lead_id
            WHERE pr.id = ?
        `).get(req.params.projectId);
        if (!row) return res.status(404).json({ error: 'Contrato não encontrado.' });
        const pdf = row.pdf_path && row.pdf_path.endsWith('.pdf') && fs.existsSync(row.pdf_path) ? row.pdf_path : '';
        const html = row.html_path && fs.existsSync(row.html_path) ? row.html_path : (row.pdf_path && row.pdf_path.endsWith('.html') && fs.existsSync(row.pdf_path) ? row.pdf_path : '');
        const file = pdf || html;
        if (!file) return res.status(404).json({ error: 'Ficheiro do contrato em falta.' });
        return res.download(file);
    } catch (err) {
        console.error('digitalizept contract download error:', err.message);
        return res.status(500).json({ error: 'Não foi possível descarregar o contrato.' });
    }
});

app.post('/api/digitalizept/demos', requireDigitalizept, (req, res) => {
    try {
        const body = req.body || {};
        const dados = body.dados || {};
        const businessType = body.businessType || {};
        const demo = body.demo;
        if (!demo || !demo.hero || !demo.hero.titulo) {
            return res.status(400).json({ error: 'Falta a demonstração.' });
        }
        const db = getDigitalizeptDb();
        const now = digitalizeptNow();
        let leadId = cleanText(body.leadId, 80);
        const existing = leadId ? db.prepare('SELECT id, demo_slug FROM lead WHERE id = ?').get(leadId) : null;
        if (!existing) leadId = crypto.randomUUID();
        const slug = (existing && existing.demo_slug) || digitalizeptSlug(dados.nome_negocio);
        const morada = cleanText(dados.morada, 300);
        const cidade = cleanText(dados.cidade, 120);
        const persist = db.transaction(() => {
            if (existing) {
                clearGeocodeIfAddressChanged(db, leadId, morada, cidade);
                db.prepare(`UPDATE lead SET demo_json = ?, identidade_json = ?, demo_slug = ?, nome = ?,
                    morada = ?, cidade = ?, telefone = ?, whatsapp = ?, estado = CASE WHEN estado = 'fechado' THEN estado ELSE 'demonstracao' END
                    WHERE id = ?`).run(
                    JSON.stringify(demo), JSON.stringify(body.identidade || {}), slug,
                    cleanText(dados.nome_negocio, 200), morada, cidade,
                    cleanText(dados.telefone, 60), cleanText(dados.whatsapp, 60), leadId);
                applyAutoCobertura(db, leadId, 'demo');
            } else {
                db.prepare(`INSERT INTO lead (id, business_type, nome, morada, cidade, telefone, whatsapp, estado, cobertura, demo_json, identidade_json, demo_slug, criado_em)
                    VALUES (?, ?, ?, ?, ?, ?, ?, 'demonstracao', 'demo', ?, ?, ?, ?)`).run(
                    leadId, cleanText(businessType.id, 80), cleanText(dados.nome_negocio, 200),
                    morada, cidade, cleanText(dados.telefone, 60), cleanText(dados.whatsapp, 60),
                    JSON.stringify(demo), JSON.stringify(body.identidade || {}), slug, now);
            }
        });
        persist();
        scheduleLeadGeocode(leadId);
        try {
            writeDemoFolder({
                slug,
                demo,
                identidade: body.identidade || {},
                dados,
                businessType
            });
        } catch (err) {
            console.error(`digitalizept: demo folder failed (${err.message})`);
        }
        return res.json({ ok: true, leadId, slug, url: `/d/${slug}` });
    } catch (err) {
        console.error('digitalizept publish demo error:', err.message);
        return res.status(500).json({ error: 'Não foi possível publicar a demonstração.' });
    }
});

app.get('/api/digitalizept/public/:slug', (req, res) => {
    try {
        const slug = cleanText(req.params.slug, 80);
        const db = getDigitalizeptDb();
        const row = db.prepare(`
            SELECT l.nome, l.business_type, l.demo_json, l.identidade_json,
                   d.obrigatorios_json, d.opcionais_json
            FROM lead l
            LEFT JOIN dados_negocio d ON d.lead_id = l.id
            WHERE l.demo_slug = ?
        `).get(slug);
        if (!row || !row.demo_json || row.demo_json === '{}') {
            return res.status(404).json({ error: 'Demonstração não encontrada.' });
        }
        const types = loadBusinessTypes();
        const businessType = types.find((t) => t.id === row.business_type) || { id: row.business_type, nome: row.business_type };
        const dados = {
            nome_negocio: row.nome,
            ...parseJsonSafe(row.obrigatorios_json, {}),
            ...parseJsonSafe(row.opcionais_json, {})
        };
        return res.json({
            nome: row.nome,
            businessType,
            demo: parseJsonSafe(row.demo_json, null),
            identidade: parseJsonSafe(row.identidade_json, {}),
            dados
        });
    } catch (err) {
        console.error('digitalizept public demo error:', err.message);
        return res.status(500).json({ error: 'Failed to load demo.' });
    }
});

// Digitalize Portugal — finalize a signed deal: persist, archive the contract, email, create project.
const digitalizeptContractsDir = path.join(__dirname, 'data', 'digitalizept-contracts');

// The exact module the browser prices with, so a submitted total can be
// re-derived here rather than trusted. Dynamic import because the app is ESM.
let digitalizeptPricing = null;
async function getDigitalizeptPricing() {
    if (!digitalizeptPricing) {
        digitalizeptPricing = await import('../digitalizept/js/proposal-calc.js');
    }
    return digitalizeptPricing;
}

function saveDataUrlPng(dataUrl, filePath) {
    const match = /^data:image\/png;base64,(.+)$/.exec(String(dataUrl || ''));
    if (!match) return false;
    fs.writeFileSync(filePath, Buffer.from(match[1], 'base64'));
    return true;
}

app.post('/api/digitalizept/deals', requireDigitalizept, async (req, res) => {
    try {
        const body = req.body || {};
        const businessType = body.businessType || {};
        const dados = body.dados || {};
        const proposta = body.proposta || {};
        const calc = proposta._calc || {};
        const clienteLegal = body.clienteLegal || {};
        const contrato = body.contrato || {};
        const assinatura = body.assinatura || {};

        const clienteNome = cleanText(clienteLegal.nome, 200);
        const clienteEmail = cleanText(clienteLegal.email, 200);
        if (!clienteNome || !clienteEmail) {
            return res.status(400).json({ error: 'Dados do cliente incompletos (nome e email).' });
        }
        if (!contrato.html || !assinatura.pngDataUrl) {
            return res.status(400).json({ error: 'Falta o contrato assinado ou a assinatura.' });
        }

        const db = getDigitalizeptDb();

        // Re-price from the live catalog. A mismatch means the signed document and
        // what we are about to store disagree, so it is refused rather than
        // reconciled — the record has to match the paper the client signed.
        const { computeProposta } = await getDigitalizeptPricing();
        const servicos = db.prepare('SELECT * FROM servico WHERE ativo = 1').all();
        const btConfig = loadBusinessTypes().find((t) => t.id === businessType.id) || {};
        // Per-deal: client may close without fatura/IVA. Only allow the live
        // taxa when cobrarIva is true; anything else is priced at 0.
        const dealIvaRate = proposta.cobrarIva === true ? DIGITALIZEPT_IVA_RATE : 0;
        const verified = computeProposta(proposta, servicos, btConfig, dealIvaRate);

        if (Math.round(calc.totalComIva || 0) !== verified.totalComIva) {
            console.error(`digitalizept: total mismatch, client ${calc.totalComIva} vs server ${verified.totalComIva}`);
            return res.status(409).json({
                error: 'Os valores não coincidem com o catálogo atual. Volte à proposta para a recalcular e assine de novo.'
            });
        }

        if (!fs.existsSync(digitalizeptContractsDir)) {
            fs.mkdirSync(digitalizeptContractsDir, { recursive: true });
        }

        const now = digitalizeptNow();
        const incomingLeadId = cleanText(body.leadId, 80);
        const existingLead = incomingLeadId
            ? db.prepare('SELECT id, demo_slug, estado FROM lead WHERE id = ?').get(incomingLeadId)
            : null;
        const leadId = existingLead ? existingLead.id : crypto.randomUUID();

        // Prefer explicit IDs from a resumed closed deal; else look up the latest chain.
        let existingDeal = null;
        if (existingLead) {
            const byIds = (body.propostaId && body.contratoId && body.projectId)
                ? db.prepare(`
                    SELECT p.id AS propostaId, c.id AS contratoId, c.template_versao, pr.id AS projectId,
                           a.id AS assinaturaId, cl.id AS clienteLegalId
                    FROM proposta p
                    JOIN contrato c ON c.id = ?
                    JOIN projeto pr ON pr.id = ?
                    LEFT JOIN assinatura a ON a.contrato_id = c.id
                    LEFT JOIN cliente_legal cl ON cl.lead_id = p.lead_id
                    WHERE p.id = ? AND p.lead_id = ?
                    LIMIT 1
                `).get(
                    cleanText(body.contratoId, 80),
                    cleanText(body.projectId, 80),
                    cleanText(body.propostaId, 80),
                    leadId
                )
                : null;
            existingDeal = byIds || db.prepare(`
                SELECT p.id AS propostaId, c.id AS contratoId, c.template_versao, pr.id AS projectId,
                       a.id AS assinaturaId, cl.id AS clienteLegalId
                FROM proposta p
                JOIN contrato c ON c.proposta_id = p.id
                JOIN projeto pr ON pr.contrato_id = c.id
                LEFT JOIN assinatura a ON a.contrato_id = c.id
                LEFT JOIN cliente_legal cl ON cl.lead_id = p.lead_id
                WHERE p.lead_id = ?
                ORDER BY p.criado_em DESC
                LIMIT 1
            `).get(leadId);
        }
        const revising = Boolean(existingDeal && (body.revisingDeal === true || existingLead.estado === 'fechado'));
        if ((body.revisingDeal === true || (existingLead && existingLead.estado === 'fechado')) && !existingDeal) {
            return res.status(409).json({
                error: 'Esta proposta fechada não tem contrato associado para atualizar. Contacte o suporte.'
            });
        }

        const dadosId = crypto.randomUUID();
        const propostaId = revising ? existingDeal.propostaId : crypto.randomUUID();
        const clienteId = revising && existingDeal.clienteLegalId
            ? existingDeal.clienteLegalId
            : crypto.randomUUID();
        const contratoId = revising ? existingDeal.contratoId : crypto.randomUUID();
        const assinaturaId = revising && existingDeal.assinaturaId
            ? existingDeal.assinaturaId
            : crypto.randomUUID();
        const projetoId = revising ? existingDeal.projectId : crypto.randomUUID();
        const templateVersao = revising
            ? nextContractVersion(existingDeal.template_versao)
            : 'v1';
        const { obrigatorios, opcionais } = splitDados(dados, btConfig);
        const demoSlug = (existingLead && existingLead.demo_slug)
            || (body.demo ? digitalizeptSlug(dados.nome_negocio) : '');

        const htmlPath = path.join(digitalizeptContractsDir, `${contratoId}.html`);
        fs.writeFileSync(htmlPath, String(contrato.html));
        const pngPath = path.join(digitalizeptContractsDir, `${contratoId}-assinatura.png`);
        if (!saveDataUrlPng(assinatura.pngDataUrl, pngPath)) {
            return res.status(400).json({ error: 'A assinatura não é uma imagem PNG válida.' });
        }

        const pdfPath = path.join(digitalizeptContractsDir, `${contratoId}.pdf`);
        const pdfOk = await renderContractPdf(String(contrato.html), pdfPath);
        const storedPdfPath = pdfOk ? pdfPath : '';

        let workPath = '';
        const googlePresence = body.googlePresence && typeof body.googlePresence === 'object'
            ? body.googlePresence
            : null;
        const googleDiagnostico = body.googleDiagnostico && typeof body.googleDiagnostico === 'object'
            ? body.googleDiagnostico
            : null;
        const hasGoogle = Boolean(
            ['google_essencial', 'site_maps', 'digital_completo', 'plus', 'renovacao', 'completa']
                .includes(proposta.pacote)
            || (Array.isArray(proposta.extras) && (
                proposta.extras.includes('presenca_google')
                || proposta.extras.includes('google_perfil_completo')
            ))
        );
        try {
            workPath = scaffoldClosedDeal({
                projetoId,
                negocio: cleanText(dados.nome_negocio, 200) || clienteNome,
                clienteNome,
                clienteEmail,
                verified,
                contractHtmlPath: htmlPath,
                contractPdfPath: storedPdfPath,
                dados,
                proposta,
                googlePresence: hasGoogle ? googlePresence : null,
                googleDiagnostico: hasGoogle ? googleDiagnostico : null
            });
        } catch (err) {
            console.error(`digitalizept: work scaffold failed (${err.message})`);
        }

        const itensJson = JSON.stringify({
            pacote: proposta.pacote,
            extras: proposta.extras,
            urgencia: proposta.urgencia,
            manutencao: proposta.manutencao,
            manutencoes: Array.isArray(proposta.manutencoes) ? proposta.manutencoes : undefined,
            contrapartida: proposta.contrapartida,
            cobrarIva: proposta.cobrarIva === true,
            dominio: proposta.dominio || null
        });

        const persist = db.transaction(() => {
            const morada = cleanText(dados.morada, 300);
            const cidade = cleanText(dados.cidade, 120);
            if (existingLead) {
                clearGeocodeIfAddressChanged(db, leadId, morada, cidade);
                db.prepare(`UPDATE lead SET business_type = ?, nome = ?, morada = ?, cidade = ?, telefone = ?, whatsapp = ?,
                    estado = 'fechado', cobertura = 'digitalizado', demo_json = ?, identidade_json = ?, demo_slug = ?, work_path = ?,
                    google_presence_json = ?
                    WHERE id = ?`).run(
                    cleanText(businessType.id, 80), cleanText(dados.nome_negocio, 200),
                    morada, cidade, cleanText(dados.telefone, 60), cleanText(dados.whatsapp, 60),
                    JSON.stringify(body.demo || {}), JSON.stringify(body.identidade || {}),
                    demoSlug, workPath, JSON.stringify(googlePresence || {}), leadId);
                const dadosRow = db.prepare('SELECT id FROM dados_negocio WHERE lead_id = ?').get(leadId);
                if (dadosRow) {
                    db.prepare(`UPDATE dados_negocio SET obrigatorios_json = ?, opcionais_json = ? WHERE id = ?`)
                        .run(JSON.stringify(obrigatorios), JSON.stringify(opcionais), dadosRow.id);
                } else {
                    db.prepare(`INSERT INTO dados_negocio (id, lead_id, obrigatorios_json, opcionais_json, criado_em)
                        VALUES (?, ?, ?, ?, ?)`).run(dadosId, leadId, JSON.stringify(obrigatorios), JSON.stringify(opcionais), now);
                }
            } else {
                db.prepare(`INSERT INTO lead (id, business_type, nome, morada, cidade, telefone, whatsapp, estado, cobertura, demo_json, identidade_json, demo_slug, work_path, google_presence_json, criado_em)
                    VALUES (?, ?, ?, ?, ?, ?, ?, 'fechado', 'digitalizado', ?, ?, ?, ?, ?, ?)`).run(
                    leadId, cleanText(businessType.id, 80), cleanText(dados.nome_negocio, 200),
                    morada, cidade, cleanText(dados.telefone, 60), cleanText(dados.whatsapp, 60),
                    JSON.stringify(body.demo || {}), JSON.stringify(body.identidade || {}),
                    demoSlug, workPath, JSON.stringify(googlePresence || {}), now);
                db.prepare(`INSERT INTO dados_negocio (id, lead_id, obrigatorios_json, opcionais_json, criado_em)
                    VALUES (?, ?, ?, ?, ?)`).run(dadosId, leadId, JSON.stringify(obrigatorios), JSON.stringify(opcionais), now);
            }

            if (revising) {
                db.prepare(`UPDATE proposta SET itens_json = ?, subtotal_centimos = ?, desconto_pct = ?, desconto_centimos = ?,
                    total_centimos = ?, iva_rate = ?, iva_centimos = ?, total_com_iva_centimos = ?,
                    contrapartida = ?, valor_hora_estimado = ?, estado = 'aceite'
                    WHERE id = ?`).run(
                    itensJson,
                    verified.subtotal, verified.descontoPct, verified.desconto,
                    verified.totalSemIva, verified.ivaRate, verified.iva, verified.totalComIva,
                    cleanText(proposta.contrapartida, 300), verified.valorHora, propostaId);

                if (existingDeal.clienteLegalId) {
                    db.prepare(`UPDATE cliente_legal SET nome = ?, nif = ?, morada = ?, email = ?, telefone = ?
                        WHERE id = ?`).run(
                        clienteNome, cleanText(clienteLegal.nif, 20),
                        cleanText(clienteLegal.morada, 300), clienteEmail,
                        cleanText(clienteLegal.telefone, 60), clienteId);
                } else {
                    db.prepare(`INSERT INTO cliente_legal (id, lead_id, nome, nif, morada, email, telefone)
                        VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
                        clienteId, leadId, clienteNome, cleanText(clienteLegal.nif, 20),
                        cleanText(clienteLegal.morada, 300), clienteEmail, cleanText(clienteLegal.telefone, 60));
                }

                db.prepare(`UPDATE contrato SET template_versao = ?, pdf_path = ?, html_path = ?, hash_sha256 = ?,
                    assinado_em = ?, estado = 'assinado'
                    WHERE id = ?`).run(
                    templateVersao, storedPdfPath || htmlPath, htmlPath,
                    cleanText(contrato.hash, 128), now, contratoId);

                if (existingDeal.assinaturaId) {
                    db.prepare(`UPDATE assinatura SET png_path = ?, geo = ?, ip = ?, dispositivo = ?, timestamp = ?, hash_documento = ?
                        WHERE id = ?`).run(
                        pngPath, cleanText(assinatura.geo, 120), cleanText(req.ip, 60),
                        cleanText(assinatura.dispositivo, 300),
                        cleanText(assinatura.timestamp, 60) || now,
                        cleanText(contrato.hash, 128), assinaturaId);
                } else {
                    db.prepare(`INSERT INTO assinatura (id, contrato_id, png_path, geo, ip, dispositivo, timestamp, hash_documento)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
                        assinaturaId, contratoId, pngPath, cleanText(assinatura.geo, 120),
                        cleanText(req.ip, 60), cleanText(assinatura.dispositivo, 300),
                        cleanText(assinatura.timestamp, 60) || now, cleanText(contrato.hash, 128));
                }

                const dominioEstadoRev = (proposta.dominio && proposta.dominio.modo === 'proprio')
                    ? 'cliente_zip'
                    : (proposta.dominio && proposta.dominio.escolhido ? 'a_registar' : 'por_comprar');
                db.prepare(`UPDATE projeto SET estado_google = CASE
                        WHEN estado_google IN ('nao_incluido', 'por_criar') THEN ?
                        ELSE estado_google END,
                    estado_dominio = ?
                    WHERE id = ?`).run(
                    hasGoogle ? 'por_criar' : 'nao_incluido',
                    dominioEstadoRev,
                    projetoId
                );

                digitalizeptLogEvento(db, 'contrato', contratoId, 'revisao', {
                    cliente: clienteNome,
                    total_centimos: verified.totalComIva,
                    versao: templateVersao,
                    ip: req.ip
                });
            } else {
                db.prepare(`INSERT INTO proposta (id, lead_id, itens_json, subtotal_centimos, desconto_pct, desconto_centimos, total_centimos, iva_rate, iva_centimos, total_com_iva_centimos, contrapartida, valor_hora_estimado, estado, criado_em)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'aceite', ?)`).run(
                    propostaId, leadId, itensJson,
                    verified.subtotal, verified.descontoPct, verified.desconto,
                    verified.totalSemIva, verified.ivaRate, verified.iva, verified.totalComIva,
                    cleanText(proposta.contrapartida, 300), verified.valorHora, now);

                db.prepare(`INSERT INTO cliente_legal (id, lead_id, nome, nif, morada, email, telefone)
                    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
                    clienteId, leadId, clienteNome, cleanText(clienteLegal.nif, 20),
                    cleanText(clienteLegal.morada, 300), clienteEmail, cleanText(clienteLegal.telefone, 60));

                db.prepare(`INSERT INTO contrato (id, proposta_id, template_versao, pdf_path, html_path, hash_sha256, assinado_em, estado, criado_em)
                    VALUES (?, ?, ?, ?, ?, ?, ?, 'assinado', ?)`).run(
                    contratoId, propostaId, templateVersao, storedPdfPath || htmlPath, htmlPath,
                    cleanText(contrato.hash, 128), now, now);

                db.prepare(`INSERT INTO assinatura (id, contrato_id, png_path, geo, ip, dispositivo, timestamp, hash_documento)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
                    assinaturaId, contratoId, pngPath, cleanText(assinatura.geo, 120),
                    cleanText(req.ip, 60), cleanText(assinatura.dispositivo, 300),
                    cleanText(assinatura.timestamp, 60) || now, cleanText(contrato.hash, 128));

                const dominioEstado = (proposta.dominio && proposta.dominio.modo === 'proprio')
                    ? 'cliente_zip'
                    : (proposta.dominio && proposta.dominio.escolhido ? 'a_registar' : 'por_comprar');

                db.prepare(`INSERT INTO projeto (id, contrato_id, estado, estado_google, estado_dominio, criado_em)
                    VALUES (?, ?, 'contrato_assinado', ?, ?, ?)`).run(
                    projetoId,
                    contratoId,
                    hasGoogle ? 'por_criar' : 'nao_incluido',
                    dominioEstado,
                    now
                );

                digitalizeptLogEvento(db, 'contrato', contratoId, 'assinado', {
                    cliente: clienteNome, total_centimos: verified.totalComIva, ip: req.ip,
                    dominio: proposta.dominio || null
                });
            }
        });
        persist();
        scheduleLeadGeocode(leadId);

        const archive = cleanText(process.env.LEAD_NOTIFY_TO, 200) || cleanText(process.env.SMTP_USER, 200);
        const subject = revising
            ? `Contrato ${templateVersao} — ${cleanText(dados.nome_negocio, 120) || clienteNome}`
            : `Contrato — ${cleanText(dados.nome_negocio, 120) || clienteNome}`;
        const text = revising
            ? `Contrato atualizado (${templateVersao}) com ${clienteNome}. Documento em anexo.`
            : `Contrato assinado com ${clienteNome}. Documento em anexo.`;
        const attachmentFile = storedPdfPath || htmlPath;
        const attachments = [{
            filename: storedPdfPath ? 'contrato.pdf' : 'contrato.html',
            path: attachmentFile
        }];
        const clientResult = await sendProjectNotificationEmail({
            to: clienteEmail, subject, text, html: String(contrato.html), attachments
        });
        const archiveResult = archive
            ? await sendProjectNotificationEmail({
                to: archive, subject: `[Arquivo] ${subject}`, text, html: String(contrato.html), attachments
            })
            : { sent: false, reason: 'No archive address.' };

        const projectRow = db.prepare('SELECT estado, estado_google, estado_dominio FROM projeto WHERE id = ?').get(projetoId);
        const dominioEstado = (projectRow && projectRow.estado_dominio)
            || ((proposta.dominio && proposta.dominio.modo === 'proprio')
                ? 'cliente_zip'
                : (proposta.dominio && proposta.dominio.escolhido ? 'a_registar' : 'por_comprar'));

        return res.json({
            ok: true,
            revised: revising,
            templateVersao,
            projectId: projetoId,
            leadId,
            estado: (projectRow && projectRow.estado) || 'contrato_assinado',
            estados: {
                google: (projectRow && projectRow.estado_google) || (hasGoogle ? 'por_criar' : 'nao_incluido'),
                dominio: dominioEstado
            },
            dominio: proposta.dominio || null,
            email: { clientSent: clientResult.sent, archiveSent: archiveResult.sent },
            contractDownload: `/api/digitalizept/deals/${projetoId}/contract`,
            demoUrl: demoSlug ? `/d/${demoSlug}` : '',
            pdf: Boolean(storedPdfPath)
        });
    } catch (err) {
        console.error('digitalizept deal error:', err.message);
        return res.status(500).json({ error: 'Não foi possível finalizar o contrato.' });
    }
});

// Get all inquiries (admin endpoint)
app.get('/api/inquiries', requireAdmin, (req, res) => {
    try {
        const files = fs.readdirSync(inquiriesDir);
        const inquiries = [];

        files.forEach((file) => {
            if (!file.endsWith('.json')) return;
            const filepath = path.join(inquiriesDir, file);
            try {
                const data = JSON.parse(fs.readFileSync(filepath, 'utf8'));
                inquiries.push({
                    filename: file,
                    ...data
                });
            } catch (error) {
                console.error(`Skipping invalid inquiry file ${file}:`, error.message);
            }
        });

        inquiries.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        res.json({
            count: inquiries.length,
            inquiries
        });
    } catch (error) {
        console.error('Error reading inquiries:', error);
        res.status(500).json({
            error: 'Failed to read inquiries',
            details: error.message
        });
    }
});

// Get single inquiry
app.get('/api/inquiries/:id', requireAdmin, (req, res) => {
    try {
        const filename = normalizeInquiryFilename(req.params.id);
        if (!filename) {
            return res.status(400).json({ error: 'Invalid inquiry id' });
        }

        const filepath = path.join(inquiriesDir, filename);
        if (!fs.existsSync(filepath)) {
            return res.status(404).json({ error: 'Inquiry not found' });
        }

        const data = JSON.parse(fs.readFileSync(filepath, 'utf8'));
        res.json(data);
    } catch (error) {
        console.error('Error reading inquiry:', error);
        res.status(500).json({
            error: 'Failed to read inquiry',
            details: error.message
        });
    }
});

// Delete inquiry
app.delete('/api/inquiries/:id', requireAdmin, (req, res) => {
    try {
        const filename = normalizeInquiryFilename(req.params.id);
        if (!filename) {
            return res.status(400).json({ error: 'Invalid inquiry id' });
        }

        const filepath = path.join(inquiriesDir, filename);
        if (!fs.existsSync(filepath)) {
            return res.status(404).json({ error: 'Inquiry not found' });
        }

        fs.unlinkSync(filepath);
        res.json({
            success: true,
            message: 'Inquiry deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting inquiry:', error);
        res.status(500).json({
            error: 'Failed to delete inquiry',
            details: error.message
        });
    }
});

// Project showcase (public)
app.get('/api/project-showcase', (req, res) => {
    try {
        const projects = projectShowcaseStore.read();
        return res.json({
            count: projects.length,
            projects
        });
    } catch (error) {
        console.error('Error reading project showcase data:', error);
        return res.status(500).json({
            error: 'Failed to read project showcase data',
            details: error.message
        });
    }
});

// Project showcase replace (admin)
app.put('/api/project-showcase', requireAdmin, (req, res) => {
    try {
        const payload = Object.prototype.hasOwnProperty.call(req.body || {}, 'payload')
            ? req.body.payload
            : req.body;
        const projects = projectShowcaseStore.write(payload);
        return res.json({
            success: true,
            count: projects.length,
            projects
        });
    } catch (error) {
        console.error('Error replacing project showcase data:', error);
        return res.status(500).json({
            error: 'Failed to replace project showcase data',
            details: error.message
        });
    }
});

// Project showcase apply update/add payload (admin)
app.post('/api/project-showcase/apply', requireAdmin, (req, res) => {
    try {
        const payload = Object.prototype.hasOwnProperty.call(req.body || {}, 'payload')
            ? req.body.payload
            : req.body;
        const currentProjects = projectShowcaseStore.read();
        const { projects, actions } = projectShowcaseStore.applyPayload(currentProjects, payload);
        const saved = projectShowcaseStore.write(projects);
        return res.json({
            success: true,
            count: saved.length,
            actions,
            projects: saved
        });
    } catch (error) {
        console.error('Error applying project showcase payload:', error);
        return res.status(400).json({
            error: 'Failed to apply project showcase payload',
            details: error.message
        });
    }
});

// Project showcase delete item by id (admin)
app.delete('/api/project-showcase/:id', requireAdmin, (req, res) => {
    try {
        const id = projectShowcaseStore.normalizeProjectId(req.params.id, '');
        if (!id) return res.status(400).json({ error: 'Invalid project id.' });

        const current = projectShowcaseStore.read();
        const next = current.filter((project) => project.id !== id);
        if (next.length === current.length) {
            return res.status(404).json({ error: 'Project not found.' });
        }

        const saved = projectShowcaseStore.write(next);
        return res.json({
            success: true,
            count: saved.length,
            deletedId: id,
            projects: saved
        });
    } catch (error) {
        console.error('Error deleting project showcase item:', error);
        return res.status(500).json({
            error: 'Failed to delete project',
            details: error.message
        });
    }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        inquiriesCount: fs.readdirSync(inquiriesDir).filter((f) => f.endsWith('.json')).length,
        projectShowcaseCount: projectShowcaseStore.read().length,
        ollamaUrl: OLLAMA_BASE_URL,
        modelBig: OLLAMA_MODEL_BIG,
        modelSmall: OLLAMA_MODEL_SMALL,
        historyTurns: CHAT_HISTORY_TURNS,
        modelMaxTokens: MODEL_MAX_TOKENS,
        modelNumCtx: MODEL_NUM_CTX,
        stickyJsFallback: STICKY_JS_FALLBACK,
        maxAiTurnsWithoutContact: MAX_AI_TURNS_WITHOUT_CONTACT,
        smtpConfigured: Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)
    });
});

// Explicit business-card routes (safety for environments that do not auto-serve folder index)
app.get('/business-card', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'business-card', 'index.html'));
});

app.get('/business-card/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'business-card', 'index.html'));
});

// Explicit your-blocks routes
app.get('/your-blocks', (req, res) => {
    res.redirect('/your-blocks/');
});

app.get('/your-blocks/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'your-blocks', 'index.html'));
});

app.get('/your-blocks/privacy-policy', (req, res) => {
    res.redirect('/your-blocks/privacy-policy/');
});

app.get('/your-blocks/privacy-policy/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'your-blocks', 'privacy-policy', 'index.html'));
});

// Explicit your-run routes
app.get('/your-run', (req, res) => {
    res.redirect('/your-run/');
});

app.get('/your-run/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'your-run', 'index.html'));
});

// Explicit admin routes
app.get('/admin', (req, res) => {
    res.redirect('/admin/');
});

app.get('/admin/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'admin', 'index.html'));
});

app.get('/digitalizept', (req, res) => {
    res.redirect('/digitalizept/');
});

app.get('/digitalizept/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'digitalizept', 'index.html'));
});

app.get('/d/:slug', (req, res) => {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.sendFile(path.join(__dirname, '..', 'digitalizept', 'public.html'));
});

// Serve index.html for any unmatched routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
});

setInterval(() => {
    const now = Date.now();
    conversationSessions.forEach((session, key) => {
        const age = now - new Date(session.updatedAt).getTime();
        if (age > CHAT_SESSION_TTL_MS) {
            conversationSessions.delete(key);
        }
    });
}, 60 * 1000).unref();

app.listen(PORT, () => {
    console.log(`YourLab Chat API running on http://localhost:${PORT}`);
    console.log(`Inquiries stored in: ${inquiriesDir}`);
    console.log(`Ollama URL: ${OLLAMA_BASE_URL} | small: ${OLLAMA_MODEL_SMALL} | big: ${OLLAMA_MODEL_BIG}`);
});
