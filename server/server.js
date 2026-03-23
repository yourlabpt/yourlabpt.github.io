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

// Pre-compute the static portion of the system prompt for each language once at
// startup.  The string is byte-identical on every request, so Ollama's KV
// prefix-cache will skip re-tokenising the company-knowledge block from turn 2
// onward — the single biggest source of per-turn latency.
let STATIC_SYSTEM_PROMPT_EN = buildStaticSystemPromptBase(false);
let STATIC_SYSTEM_PROMPT_PT = buildStaticSystemPromptBase(true);
console.log('Static system prompts pre-computed (EN:', STATIC_SYSTEM_PROMPT_EN.length, 'chars, PT:', STATIC_SYSTEM_PROMPT_PT.length, 'chars)');

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

    return {
        email: emailMatch ? normalizeEmail(emailMatch[0]) : '',
        phone: phoneMatch ? normalizePhone(phoneMatch[0]) : '',
        name: nameMatch ? cleanText(nameMatch[1], 80) : '',
        company: companyMatch ? cleanText(companyMatch[1], 120) : ''
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
    return Math.max(0, Math.min(100, score));
}

function resolveLeadStage(lead, scoreHint) {
    const score = Number.isFinite(scoreHint) ? scoreHint : computeLeadScore(lead);
    const hasContact = Boolean(lead.email || lead.phone);
    const hasStory = Boolean(lead.problem && lead.goal);

    if (hasContact && hasStory && score >= 60) return 'completed';
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
        notified: false
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
// Static base: byte-identical string pre-computed once per language at startup.
// Ollama's KV prefix-cache skips re-tokenising this block on every turn after
// the first — dramatically reducing per-turn processing overhead.
function buildStaticSystemPromptBase(isPt) {
    const languageInstruction = isPt ? 'European Portuguese (from Portugal)' : 'English';
    const knowledgeSection = COMPANY_KNOWLEDGE
        ? `---\nCOMPANY KNOWLEDGE BASE (use this as ground truth for all facts about YourLab):\n${COMPANY_KNOWLEDGE}\n---`
        : '';
    const stageGuide = isPt
        ? `- discover \u2192 entender o problema/ideia\n- qualify \u2192 aprofundar: cliente-alvo, solu\u00e7\u00e3o atual, objetivo, urg\u00eancia\n- capture \u2192 obter nome + email ou telefone\n- commit \u2192 resumir e confirmar pr\u00f3ximos passos\n- completed \u2192 conclu\u00eddo`
        : `- discover \u2192 understand the problem/idea\n- qualify \u2192 dig deeper: target customer, current solution, goal, urgency\n- capture \u2192 get name + email or phone\n- commit \u2192 wrap up and confirm next steps\n- completed \u2192 done`;

    const core = `You are Alex \u2014 YourLab's business development specialist. You are not a generic chatbot. You are a sharp, commercially-minded person whose job is to understand what this person wants to build, assess whether YourLab is the right fit, and get them into a real conversation with the team \u2014 fast.

You are effective because you are direct without being cold, and curious without being nosy. You waste no one's time, including your own. Every message you send has a purpose.

ABOUT YOURLAB:
YourLab builds MVPs \u2014 fast, lean, structured. Philosophy: "Start small. Prove it. Scale what's real." Custom software, IoT, integrations. One specialist per project. Real requirements engineering. The cost of bringing an idea to life has never been lower \u2014 most people still think they need 6 figures and 18 months. They don't.

YOUR APPROACH:
- **Message 1**: Respond to whatever they said, establish presence, ask ONE focused question to understand what they're working on. No pleasantries longer than 1 sentence.
- **Messages 2\u20133**: Dig into the problem \u2014 what they're solving, for whom, what they've already tried. Ask sharp, specific questions. "What's blocking you right now?" not "Tell me more."
- **Messages 3\u20134**: Start qualifying commercially \u2014 timeline, whether this is an active project or an idea, budget sensitivity. You don't ask "what's your budget?" \u2014 you ask "Is this something you're looking to move on now, or are you still mapping it out?"
- **By message 4\u20135**: You have enough to know if it's worth following up. If yes, ask for contact. Be direct: "I'd like to connect you with our team \u2014 what's the best email to reach you?" Do not wait for perfect conditions.
- If they clearly want to chat casually: 1 exchange of social warmth, then bridge: "Good to hear. What's the project you're working on \u2014 or thinking about?" Never more than 1 social exchange.

YOUR PERSONALITY:
- Direct and confident, but not robotic. You sound like a smart person, not a sales script.
- You make observations and opinions: "That's a classic distribution problem, actually." "Most teams try to solve that with integrations and end up making it worse."
- You are efficient. You do NOT recap what you just asked. You ask it, you wait.
- When someone explains their idea with clarity, you acknowledge it specifically \u2014 not "that's interesting!" but "that's a clear use case, I've seen this work well in [relevant context]."
- You can be warm, but warmth is earned through relevance, not through enthusiasm. No exclamation points unless the person is clearly excited and you're matching energy.
- When someone hesitates about cost, anchor them: "The barrier to building your own thing has genuinely never been lower. What people built for \u20ac200k three years ago, we build for \u20ac20k now. It's worth a real conversation."

HARD RULES:
1. Write ONLY in ${languageInstruction}. No language mixing.
2. 25\u201390 words per reply. Shorter is usually better.
3. Ask ONE thing per reply. One question, not two.
4. NEVER ask for something already in "WHAT YOU ALREADY KNOW".
5. NEVER start with "Great!", "Absolutely!", "Of course!", or "Certainly!". No filler openers.
6. If they ask what YourLab does: answer clearly and concisely using the knowledge base, then redirect back with one question.
7. Get contact info (email or phone) by message 4\u20135 at the latest if there's a real lead. Don't wait for "the right moment." The right moment is when you have enough context to say "let's continue this properly."
8. When you have name + (email OR phone) + problem: wrap up, tell them the team will review and reach out within 1 business day. Leave them with a clear next step.

LEAD STAGE GUIDE:
${stageGuide}

OUTPUT FORMAT \u2014 respond with ONLY a valid JSON object, no text before or after, no markdown fences:
{
  "assistant_reply": "<your reply as Alex \u2014 25 to 90 words>",
  "request_contact_now": <true if you are currently asking for email or phone, false otherwise>,
  "lead_stage": "<one of: discover | qualify | capture | commit | completed>",
  "lead_score": <integer 0-100 reflecting how much useful info has been captured>,
  "updated_lead": {<ONLY include fields captured in THIS user message; omit all other fields; use {} if nothing new was captured this turn>}
}
You MAY also include these optional fields when genuinely useful (omit otherwise):
  "topic_bullets": ["<key topic from this turn>"]
  "next_best_action": "<one sentence on what Alex should do next>"
Do NOT add any text before or after the JSON. Do NOT wrap it in markdown code fences.`;

    return [knowledgeSection, core].filter(Boolean).join('\n\n');
}

function buildSystemPrompt(session) {
    const isPt = session.lead.language === 'pt';
    const lead = session.lead;
    const stage = session.stage;

    // Build explicit context of what is already known vs what is still missing
    const known = [];
    const missing = [];

    if (lead.name) known.push(`Name: "${lead.name}"`);
    else missing.push(isPt ? 'nome' : 'name');

    if (lead.email) known.push(`Email: "${lead.email}"`);
    else missing.push(isPt ? 'email' : 'email');

    if (lead.phone) known.push(`Phone: "${lead.phone}"`);
    else if (!lead.email) missing.push(isPt ? 'telefone (ou email)' : 'phone (or email)');

    if (lead.company) known.push(`Company: "${lead.company}"`);
    if (lead.industry) known.push(`Industry: "${lead.industry}"`);

    if (lead.problem) known.push(`Business problem: "${lead.problem.slice(0, 180)}${lead.problem.length > 180 ? '…' : ''}"`)
    else missing.push(isPt ? 'problema de negócio / ideia' : 'business problem / idea');

    if (lead.targetCustomer) known.push(`Target customer: "${lead.targetCustomer.slice(0, 120)}${lead.targetCustomer.length > 120 ? '…' : ''}"`);
    else if (lead.problem) missing.push(isPt ? 'cliente-alvo' : 'target customer');

    if (lead.currentSolution) known.push(`Current solution: "${lead.currentSolution.slice(0, 100)}${lead.currentSolution.length > 100 ? '…' : ''}"`);

    if (lead.goal) known.push(`Desired outcome / goal: "${lead.goal.slice(0, 140)}${lead.goal.length > 140 ? '…' : ''}"`);
    else if (lead.problem) missing.push(isPt ? 'objetivo / resultado desejado' : 'desired goal / outcome');

    if (lead.timeline) known.push(`Timeline: "${lead.timeline}"`);
    else if (lead.goal) missing.push(isPt ? 'prazo / urgência' : 'timeline / urgency');

    if (lead.budgetRange) known.push(`Budget: "${lead.budgetRange}"`);
    if (lead.urgencyLevel) known.push(`Urgency: "${lead.urgencyLevel}"`);
    if (lead.consentToContact) known.push(isPt ? 'Consentimento de contacto: sim' : 'Contact consent: yes');

    const knownSection = known.length > 0 ? known.join('\n') : (isPt ? '(nada capturado ainda)' : '(nothing captured yet)');
    const missingSection = missing.length > 0 ? missing.join(', ') : (isPt ? '(nada crítico em falta)' : '(nothing critical missing)');

    return (isPt ? STATIC_SYSTEM_PROMPT_PT : STATIC_SYSTEM_PROMPT_EN) +
        '\n\n--- CURRENT LEAD STATE ---\n' +
        'Stage: ' + stage + '\n\n' +
        'WHAT YOU ALREADY KNOW ABOUT THIS PERSON:\n' +
        knownSection + '\n\n' +
        'WHAT YOU STILL NEED (gather naturally \u2014 one at a time):\n' +
        missingSection;
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
    const history = session.turns.slice(-6).flatMap((turn) => ([
        { role: 'user', content: turn.user },
        { role: 'assistant', content: turn.assistant }
    ]));

    const messages = [
        { role: 'system', content: buildSystemPrompt(session) },
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
                temperature: 0.7,
                stream: false,
                keep_alive: '60m'  // keep model loaded between requests
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
    } else {
        reply = isPt
            ? `Perfeito, ${updatedLead.name}. Já temos contexto suficiente. A equipa da YourLab vai rever a tua ideia e entrar em contacto brevemente com um resumo e proposta de próximos passos.`
            : `Perfect, ${updatedLead.name}. We have everything we need. The YourLab team will review your idea and reach out shortly with a summary and proposed next steps.`;
    }

    const score = computeLeadScore(updatedLead);
    return {
        assistant_reply: reply,
        request_contact_now: !hasContact,
        lead_stage: resolveLeadStage(updatedLead, score),
        lead_score: score,
        updated_lead: inferredLeadUpdate,
        topic_bullets: session.topicBullets,
        next_best_action: isPt ? 'Enviar resumo MVP e agendar chamada de alinhamento.' : 'Send MVP brief and schedule an alignment call.'
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

        // Route: use small model for the first few simple turns, big model for deeper conversation
        const useSmall = session.turns.length < SMALL_MODEL_TURNS;
        const primaryModel = useSmall ? OLLAMA_MODEL_SMALL : OLLAMA_MODEL_BIG;
        const fallbackModel = useSmall ? null : OLLAMA_MODEL_SMALL;

        let modelTurn;
        let usingFallback = false;
        let activeModel = primaryModel;
        try {
            modelTurn = await runLeadConversationTurn(session, userMessage, primaryModel);
        } catch (primaryError) {
            console.error(`Model ${primaryModel} failed:`, primaryError.message);
            if (fallbackModel) {
                try {
                    console.log(`Retrying with small model: ${fallbackModel}`);
                    modelTurn = await runLeadConversationTurn(session, userMessage, fallbackModel);
                    activeModel = fallbackModel;
                    usingFallback = true;
                } catch (smallError) {
                    console.error(`Small model ${fallbackModel} also failed:`, smallError.message);
                    usingFallback = true;
                    activeModel = 'js-fallback';
                    modelTurn = fallbackTurn(session, userMessage);
                }
            } else {
                usingFallback = true;
                activeModel = 'js-fallback';
                modelTurn = fallbackTurn(session, userMessage);
            }
        }
        console.log(`Chat turn — model: ${activeModel}, session: ${session.id.slice(0, 8)}, turns: ${session.turns.length}`);

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
                company: session.lead.company
            },
            saved,
            emailNotification,
            usingFallback,
            activeModel
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

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        inquiriesCount: fs.readdirSync(inquiriesDir).filter((f) => f.endsWith('.json')).length,
        ollamaUrl: OLLAMA_BASE_URL,
        modelBig: OLLAMA_MODEL_BIG,
        modelSmall: OLLAMA_MODEL_SMALL,
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
