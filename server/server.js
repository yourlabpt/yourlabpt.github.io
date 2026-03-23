require('dotenv').config();
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;
const CHAT_SESSION_TTL_MS = Number(process.env.CHAT_SESSION_TTL_MS || 45 * 60 * 1000);

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
const SEARCH_STOP_WORDS = new Set([
    'the', 'and', 'for', 'with', 'that', 'this', 'from', 'your', 'you', 'are', 'have', 'will', 'about', 'into', 'what',
    'como', 'para', 'com', 'que', 'uma', 'um', 'dos', 'das', 'nos', 'nas', 'por', 'esta', 'este', 'isso', 'isto',
    'seu', 'sua', 'teu', 'tua', 'tambem', 'mais', 'menos', 'sobre', 'qual', 'quando', 'onde', 'porque', 'very', 'just',
    'yourlab', 'alex'
]);

// Admin authentication
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'yourlab-admin';
// In-memory token store: token -> expiry timestamp
const adminTokens = new Map();
const ADMIN_TOKEN_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

function issueAdminToken() {
    const token = crypto.randomBytes(32).toString('hex');
    adminTokens.set(token, Date.now() + ADMIN_TOKEN_TTL_MS);
    return token;
}

function isValidAdminToken(token) {
    if (!token || !adminTokens.has(token)) return false;
    if (Date.now() > adminTokens.get(token)) {
        adminTokens.delete(token);
        return false;
    }
    return true;
}

function requireAdmin(req, res, next) {
    const token = (req.headers['x-admin-token'] || '').trim();
    if (!isValidAdminToken(token)) {
        return res.status(401).json({ error: 'Unauthorized. Please log in to the admin dashboard.' });
    }
    next();
}

const ollamaClient = new OpenAI({
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

// CORS — allow same-origin requests and known production/dev origins
const ALLOWED_ORIGINS = [
    'http://localhost:3000',
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'https://yourlabpt.com',
    'https://www.yourlabpt.com',
    // Support additional origins from env (comma-separated list allowed)
    ...(process.env.ALLOWED_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean)
].filter(Boolean);

app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no Origin header (same-origin, curl, mobile)
        if (!origin || ALLOWED_ORIGINS.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error(`CORS: origin ${origin} not allowed`));
        }
    }
}));
app.use(express.json({ limit: '10mb' }));

// Serve vCard with explicit MIME type for better mobile compatibility
app.get('/business-card/contact.vcf', (req, res, next) => {
    const filePath = path.join(__dirname, '..', 'business-card', 'contact.vcf');
    if (!fs.existsSync(filePath)) return next();

    res.setHeader('Content-Type', 'text/vcard; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline; filename="contact.vcf"');
    return res.sendFile(filePath);
});

// Serve static files
app.use(express.static(path.join(__dirname, '..')));

// Create inquiries directory if it doesn't exist
const inquiriesDir = path.join(__dirname, 'inquiries');
if (!fs.existsSync(inquiriesDir)) {
    fs.mkdirSync(inquiriesDir, { recursive: true });
}

const projectShowcaseFile = path.join(__dirname, 'project-showcase.json');
if (!fs.existsSync(projectShowcaseFile)) {
    fs.writeFileSync(projectShowcaseFile, '[]\n');
}

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
    const digits = text.replace(/[^\d+]/g, '');
    return digits.length >= 8 ? text : '';
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

    next.name = cleanText(incoming.name || next.name, 120);
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
    const nameMatch = source.match(/(?:my name is|i am|i'm|call me|meu nome e|chamo-me|sou o|sou a)\s+([A-Za-zÀ-ÿ' -]{2,60})/i);
    const companyMatch = source.match(/(?:company|startup|business|empresa)\s*(?:is|called|named|e|chama-se)\s+([A-Za-zÀ-ÿ0-9'&., -]{2,80})/i);
    const callTime = extractPreferredCallTimeFromText(source);

    return {
        email: emailMatch ? normalizeEmail(emailMatch[0]) : '',
        phone: phoneMatch ? normalizePhone(phoneMatch[0]) : '',
        name: nameMatch ? cleanText(nameMatch[1], 80) : '',
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
        modelFailures: 0
    };
}

function getOrCreateSession(sessionId, language) {
    const cleanSessionId = cleanText(sessionId, 120);
    const preferredLanguage = language === 'pt' ? 'pt' : 'en';

    if (cleanSessionId && conversationSessions.has(cleanSessionId)) {
        const existing = conversationSessions.get(cleanSessionId);
        existing.updatedAt = new Date().toISOString();
        existing.lead.language = preferredLanguage;
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

function fallbackTurn(session, userMessage) {
    const isPt = session.lead.language === 'pt';
    const lead = session.lead;
    const msg = cleanText(userMessage, 700);
    const inferredLeadUpdate = {};

    // Extract what we can from the raw message
    const extracted = extractLeadSignalsFromText(msg);
    if (extracted.name) inferredLeadUpdate.name = extracted.name;
    if (extracted.email) inferredLeadUpdate.email = extracted.email;
    if (extracted.phone) inferredLeadUpdate.phone = extracted.phone;
    if (extracted.company) inferredLeadUpdate.company = extracted.company;
    if (extracted.callTime) inferredLeadUpdate.callTime = extracted.callTime;
    if (msg.length > 40 && !lead.problem) inferredLeadUpdate.problem = msg;
    if (!lead.goal && /\b(goal|want|need|achieve|solve|objetivo|pretendo|quero|resolver|alcan)\b/i.test(msg)) {
        inferredLeadUpdate.goal = msg;
    }
    if (/\b(consent|agree|autori[zs]|aceito|sim\b|yes\b|claro|sure|ok\b)\b/i.test(msg)) {
        inferredLeadUpdate.consentToContact = true;
    }

    // Merge now so reply can reference latest state
    const updatedLead = mergeLead(lead, inferredLeadUpdate);

    const hasProblem = Boolean(updatedLead.problem || msg.length > 40);
    const hasGoal = Boolean(updatedLead.goal);
    const hasName = Boolean(updatedLead.name);
    const hasContact = Boolean(updatedLead.email || updatedLead.phone);
    const hasStory = hasProblem && hasGoal;
    const hasCallTime = Boolean(updatedLead.callTime);

    // Build a short echo of what the user said to make reply feel coherent
    const snippet = msg.length > 60 ? msg.slice(0, 57) + '…' : msg;
    const echoEn = `Got it — "${snippet}".`;
    const echoPt = `Percebido — "${snippet}".`;
    const echo = isPt ? echoPt : echoEn;

    let reply = '';
    if (!hasProblem) {
        reply = isPt
            ? `${echo} Para conseguirmos ajudar-te com uma proposta de MVP, qual é o principal problema de negócio que queres resolver, e para quem?`
            : `${echo} To help you shape a solid MVP, what is the main business problem you want to solve, and who is it for?`;
    } else if (!hasGoal) {
        reply = isPt
            ? `${echo} Faz sentido. Qual é o resultado que esperas alcançar, ou seja, como é que o sucesso se parece para ti neste projeto?`
            : `${echo} That makes sense. What outcome are you hoping to achieve — what does success look like for you on this project?`;
    } else if (!hasName) {
        reply = isPt
            ? `${echo} A tua ideia tem potencial claro. Podes dizer-me o teu nome para personalizarmos os próximos passos?`
            : `${echo} Your idea has clear potential. What's your name so we can personalise the next steps?`;
    } else if (!hasContact) {
        reply = isPt
            ? `Obrigado, ${updatedLead.name}. Para te enviarmos um resumo das prioridades do MVP e agendarmos uma conversa rápida, qual é o teu melhor email ou telefone?`
            : `Thanks, ${updatedLead.name}. To send you a concise MVP priorities brief and arrange a quick call, what's the best email or phone to reach you?`;
    } else if (!hasCallTime) {
        reply = isPt
            ? `Perfeito. Preferes videochamada ou reunião presencial, e qual é o melhor dia/horário para ti?`
            : `Perfect. Do you prefer a video call or an in-person meeting, and what day/time works best for you?`;
    } else {
        reply = isPt
            ? `Perfeito, ${updatedLead.name}. Já temos contexto suficiente e o teu horário de contacto. A equipa da YourLab vai rever a tua ideia e enviar próximos passos em até 1 dia útil.`
            : `Perfect, ${updatedLead.name}. We have enough context and your preferred meeting time. The YourLab team will review your idea and send next steps within 1 business day.`;
    }

    const score = computeLeadScore(updatedLead);
    return {
        assistant_reply: reply,
        request_contact_now: !hasContact,
        lead_stage: !hasCallTime && hasContact && hasStory ? 'commit' : resolveLeadStage(updatedLead, score),
        lead_score: score,
        updated_lead: inferredLeadUpdate,
        topic_bullets: session.topicBullets,
        next_best_action: hasCallTime
            ? (isPt ? 'Enviar resumo MVP e convite de calendário.' : 'Send MVP brief and calendar invite.')
            : (isPt ? 'Pedir preferência de reunião e horário.' : 'Ask for meeting preference and preferred time.')
    };
}

function normalizeInquiryFilename(id) {
    const safeId = cleanText(id, 220);
    if (!safeId) return '';
    return safeId.endsWith('.json') ? safeId : `${safeId}.json`;
}

function normalizeProjectId(value, fallback = '') {
    const raw = cleanText(value, 160).toLowerCase();
    const normalized = raw
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return normalized || cleanText(fallback, 160).toLowerCase() || '';
}

function normalizeProjectLangValue(value, fallback = '') {
    if (typeof value === 'string') {
        return {
            pt: cleanText(value, 600),
            en: cleanText(value, 600)
        };
    }
    if (!value || typeof value !== 'object') {
        return { pt: fallback, en: fallback };
    }

    const pt = cleanText(
        typeof value.pt === 'string' ? value.pt : (typeof value.en === 'string' ? value.en : fallback),
        600
    );
    const en = cleanText(
        typeof value.en === 'string' ? value.en : (typeof value.pt === 'string' ? value.pt : fallback),
        600
    );

    return { pt, en };
}

function normalizeProjectLangList(value, fallback = []) {
    const source = Array.isArray(value)
        ? value
        : (value && Array.isArray(value.pt))
            ? value.pt
            : (value && Array.isArray(value.en))
                ? value.en
                : fallback;

    const sourcePt = (value && Array.isArray(value.pt)) ? value.pt : source;
    const sourceEn = (value && Array.isArray(value.en)) ? value.en : source;

    return {
        pt: sourcePt.map((item) => cleanText(item, 320)).filter(Boolean),
        en: sourceEn.map((item) => cleanText(item, 320)).filter(Boolean)
    };
}

function normalizeProjectEntry(input, index = 0) {
    if (!input || typeof input !== 'object') return null;

    const source = (input.project && typeof input.project === 'object')
        ? input.project
        : input;

    const title = normalizeProjectLangValue(source.title, '');
    if (!title.pt && !title.en) return null;

    const solutionDeliveredRaw = source.solutionDelivered || source.finalResult;
    let solutionDelivered = normalizeProjectLangList(solutionDeliveredRaw, []);
    const finalResultText = normalizeProjectLangValue(source.finalResult || '', '');

    if (!solutionDelivered.pt.length && finalResultText.pt) {
        solutionDelivered.pt = [finalResultText.pt];
    }
    if (!solutionDelivered.en.length && finalResultText.en) {
        solutionDelivered.en = [finalResultText.en];
    }

    const fallbackId = `project-${index + 1}`;
    const id = normalizeProjectId(source.id, fallbackId) || fallbackId;

    return {
        id,
        title,
        clientProfile: normalizeProjectLangValue(source.clientProfile || source.client || source.audience || '', ''),
        sector: normalizeProjectLangValue(source.sector || source.industry || '', ''),
        timeline: normalizeProjectLangValue(source.timeline || '', ''),
        strategicRequest: normalizeProjectLangValue(source.strategicRequest || source.request || '', ''),
        painSnapshot: normalizeProjectLangValue(source.painSnapshot || source.requestPain || '', ''),
        businessImpact: normalizeProjectLangValue(source.businessImpact || '', ''),
        approach: normalizeProjectLangList(source.approach || source.processProposal || [], []),
        solutionDelivered,
        results: normalizeProjectLangList(source.results || [], []),
        dailyUse: normalizeProjectLangList(source.dailyUse || [], []),
        ctaText: normalizeProjectLangValue(source.ctaText || '', '')
    };
}

function normalizeProjectCollection(input) {
    const source = Array.isArray(input)
        ? input
        : (input && Array.isArray(input.projects))
            ? input.projects
            : [input];

    return source
        .map((entry, index) => normalizeProjectEntry(entry, index))
        .filter(Boolean);
}

function readProjectShowcaseData() {
    try {
        if (!fs.existsSync(projectShowcaseFile)) return [];
        const raw = fs.readFileSync(projectShowcaseFile, 'utf8').trim();
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return normalizeProjectCollection(parsed);
    } catch (error) {
        console.error('Failed to read project showcase data:', error.message);
        return [];
    }
}

function writeProjectShowcaseData(projects) {
    const normalized = normalizeProjectCollection(projects);
    fs.writeFileSync(projectShowcaseFile, JSON.stringify(normalized, null, 2));
    return normalized;
}

function applyProjectPayload(currentProjects, payload) {
    let next = [...currentProjects];
    const actions = [];

    function upsertProject(project, targetId = '') {
        const normalized = normalizeProjectEntry(project, next.length);
        if (!normalized) return;

        const normalizedTarget = normalizeProjectId(targetId, '');
        const effectiveId = normalizedTarget || normalized.id;
        normalized.id = effectiveId;

        const index = next.findIndex((item) => item.id === effectiveId);
        if (index >= 0) {
            next[index] = normalized;
            actions.push(`updated:${effectiveId}`);
        } else {
            next.push(normalized);
            actions.push(`added:${effectiveId}`);
        }
    }

    function processNode(node) {
        if (node == null) return;

        if (typeof node === 'string') {
            try {
                const parsed = JSON.parse(node);
                processNode(parsed);
            } catch (_) {
                throw new Error('Invalid JSON string payload.');
            }
            return;
        }

        if (Array.isArray(node)) {
            node.forEach(processNode);
            return;
        }

        if (typeof node !== 'object') return;

        if (Array.isArray(node.projects)) {
            const replaced = normalizeProjectCollection(node.projects);
            next = replaced;
            actions.push(`replaced:${replaced.length}`);
            return;
        }

        const operation = cleanText(node.operation || node.mode, 40).toLowerCase();
        const targetId = cleanText(node.target_id || node.targetId || node.id, 160);

        if (operation === 'delete') {
            const normalizedId = normalizeProjectId(targetId, '');
            if (!normalizedId) return;
            const before = next.length;
            next = next.filter((item) => item.id !== normalizedId);
            if (next.length !== before) {
                actions.push(`deleted:${normalizedId}`);
            }
            return;
        }

        if (operation === 'replace' && node.project && typeof node.project === 'object') {
            const replaced = normalizeProjectCollection([node.project]);
            next = replaced;
            actions.push(`replaced:${replaced.length}`);
            return;
        }

        if (node.project && typeof node.project === 'object') {
            upsertProject(node.project, operation === 'update' ? targetId : '');
            return;
        }

        upsertProject(node, targetId);
    }

    processNode(payload);
    return { projects: next, actions };
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

async function sendLeadNotificationEmail(inquiry) {
    const to = cleanText(process.env.LEAD_NOTIFY_TO, 600);
    if (!to) {
        return { sent: false, reason: 'LEAD_NOTIFY_TO is not configured.' };
    }

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
    if (!password || password !== ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'Invalid password.' });
    }
    const token = issueAdminToken();
    return res.json({ token });
});

// Admin logout
app.post('/api/admin/logout', (req, res) => {
    const token = (req.headers['x-admin-token'] || '').trim();
    if (token) adminTokens.delete(token);
    return res.json({ success: true });
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
        const projects = readProjectShowcaseData();
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
        const projects = writeProjectShowcaseData(payload);
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
        const currentProjects = readProjectShowcaseData();
        const { projects, actions } = applyProjectPayload(currentProjects, payload);
        const saved = writeProjectShowcaseData(projects);
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
        const id = normalizeProjectId(req.params.id, '');
        if (!id) return res.status(400).json({ error: 'Invalid project id.' });

        const current = readProjectShowcaseData();
        const next = current.filter((project) => project.id !== id);
        if (next.length === current.length) {
            return res.status(404).json({ error: 'Project not found.' });
        }

        const saved = writeProjectShowcaseData(next);
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
        projectShowcaseCount: readProjectShowcaseData().length,
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
