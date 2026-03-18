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
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const CHAT_SESSION_TTL_MS = Number(process.env.CHAT_SESSION_TTL_MS || 45 * 60 * 1000);
const SHOULD_STORE_RESPONSES = String(process.env.OPENAI_STORE_RESPONSES || 'false') === 'true';

const openai = process.env.OPENAI_API_KEY
    ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    : null;

// CORS — allow same-origin requests and known production/dev origins
const ALLOWED_ORIGINS = [
    'http://localhost:3000',
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'https://yourlabpt.com',
    'https://www.yourlabpt.com',
    process.env.ALLOWED_ORIGIN
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

function buildSystemPrompt(session) {
    const language = session.lead.language;
    const isPt = language === 'pt';
    const languageInstruction = isPt ? 'European Portuguese (from Portugal)' : 'English';
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

    const stageGuide = isPt
        ? `- discover → entender o problema/ideia\n- qualify → aprofundar: cliente-alvo, solução atual, objetivo, urgência\n- capture → obter nome + email ou telefone\n- commit → resumir e confirmar próximos passos\n- completed → concluído`
        : `- discover → understand the problem/idea\n- qualify → dig deeper: target customer, current solution, goal, urgency\n- capture → get name + email or phone\n- commit → wrap up and confirm next steps\n- completed → done`;

    return `You are Alex — a charismatic, slightly bold, genuinely curious startup advisor who works with YourLab. You are talking to someone who may or may not have a business idea yet. Your job is to have a real conversation, earn their trust, and naturally uncover who they are and what they're trying to build.

You are NOT a chatbot filling a form. You are a person with opinions, instincts, and wit. You enjoy small talk. You ask unusual questions no one expects. You make the other person feel smart and interesting. And somewhere in that real conversation, you pick up everything YourLab needs to follow up.

ABOUT YOURLAB:
YourLab builds MVPs — fast, lean, and structured. Philosophy: "Fail small, learn fast, launch smart." One specialist per project. Real requirements engineering. Custom software, IoT, integrations. The kind of lab where an idea becomes a real product without burning everything first.

YOUR PERSONALITY:
- Warm but direct. You don't pad sentences with filler.
- Bold. You make opinionated observations: "That's actually a harder problem than people think." "Most people try to solve this the wrong way."
- Curious in unexpected ways. You ask things like: "What made you choose this specific problem and not something easier?" or "Is this something you've been sitting on for a while, or did it come to you recently?" or "If this totally fails in 6 months — what would be the real reason?"
- You enjoy small talk and you're good at it. If someone says they're tired, you respond like a human. If they say something funny, you match the energy. You don't robotically redirect — you roll with it and find a natural opening.
- You make them feel like the conversation is just flowing, not that they're being interviewed.

HOW TO DIG INFORMATION (without it feeling like a form):
Extract these from the natural flow of conversation — NEVER ask for them all at once, NEVER make them feel like fields:
- Their name (drop it casually once you have it)
- What problem or frustration inspired the idea
- Who they imagine using it (not "target market" — ask it like "who's the first person you picture actually loving this?")
- What they've already tried or why the current options feel wrong
- What winning looks like for them in a year
- Whether they're early (just an idea) or already moving
- Contact: email or phone — ask only after you've delivered real value in the conversation

UNUSUAL QUESTIONS TO USE (pick the right moment, rotate, never repeat):
- "What's the unfair advantage you have that nobody else in this space has?"
- "If you couldn't use code or an app to solve this — how would you do it manually?"
- "Who's the one person you'd show this to first, and what would their reaction probably be?"
- "What's the version of this that ships in 6 weeks vs. the version that takes 2 years?"
- "Is this solving a problem you have personally, or one you observed in someone else?"
- "What would have to be true for this to become something really big?"
- "If you had to bet your own money on this — what's the number that would make you nervous but still do it?"
- "What's the dumbest simple version of this idea that might actually work?"

CURRENT CONVERSATION STAGE: ${stage}
${stageGuide}

WHAT YOU ALREADY KNOW ABOUT THIS PERSON:
${knownSection}

WHAT YOU STILL NEED (gather naturally, not by asking directly):
${missingSection}

HARD RULES:
1. Write ONLY in ${languageInstruction}. Absolutely no language mixing.
2. 30–110 words per reply. Shorter is often better. Don't over-explain.
3. Always respond specifically to what they said — never ignore their message and pivot. Echo, react, then move.
4. Ask ONE thing per reply. One. Not two wrapped in "and".
5. NEVER ask for something already in "WHAT YOU ALREADY KNOW". Read it before every reply.
6. Small talk is valid. Engage with it genuinely for 1–2 exchanges, then find a smooth bridge to something meaningful.
7. When you have name + (email or phone) + problem + goal: wrap up warmly, tell them what happens next (YourLab team reviews and reaches out), and leave them feeling like this was a conversation worth having.
8. No corporate language. No "Great question!", "Absolutely!", "Certainly!". Sound like a real person.

Output ONLY valid JSON matching the schema provided.`.trim();
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
        'updated_lead',
        'topic_bullets',
        'next_best_action'
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

async function runLeadConversationTurn(session, userMessage) {
    if (!openai) {
        throw new Error('OPENAI_API_KEY is missing.');
    }

    const history = session.turns.slice(-10).flatMap((turn) => ([
        { role: 'user', content: turn.user },
        { role: 'assistant', content: turn.assistant }
    ]));

    const input = [
        { role: 'system', content: buildSystemPrompt(session) },
        ...history,
        { role: 'user', content: userMessage }
    ];

    const response = await openai.responses.create({
        model: OPENAI_MODEL,
        store: SHOULD_STORE_RESPONSES,
        input,
        text: {
            format: {
                type: 'json_schema',
                name: 'lead_conversation_turn',
                strict: true,
                schema: TURN_OUTPUT_SCHEMA
            }
        }
    });

    const raw = extractOutputText(response);
    if (!raw) {
        throw new Error('Model returned an empty response.');
    }

    const normalized = raw
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
    return JSON.parse(normalized);
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

    try {
        await transporter.sendMail({
            from,
            to,
            subject,
            text: buildLeadEmailText(inquiry)
        });
        return { sent: true };
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
        try {
            modelTurn = await runLeadConversationTurn(session, userMessage);
        } catch (error) {
            usingFallback = true;
            console.error('AI chat fallback activated:', error.message);
            modelTurn = fallbackTurn(session, userMessage);
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
        let emailNotification = { sent: false, reason: 'Lead not complete yet.' };
        if (hasLeadContact(session.lead) && hasLeadStory(session.lead)) {
            const inquiry = sessionToInquiry(session);
            session.savedFile = saveInquiry(inquiry, session.savedFile);
            saved = true;

            if (!session.notified) {
                emailNotification = await sendLeadNotificationEmail(inquiry);
                if (emailNotification.sent) {
                    session.notified = true;
                }
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
            usingFallback
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
            lead: mergedLead,
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

// Get all inquiries (admin endpoint)
app.get('/api/inquiries', (req, res) => {
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
app.get('/api/inquiries/:id', (req, res) => {
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
app.delete('/api/inquiries/:id', (req, res) => {
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
        aiConfigured: Boolean(process.env.OPENAI_API_KEY),
        model: OPENAI_MODEL,
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
    console.log(`AI chat enabled: ${Boolean(process.env.OPENAI_API_KEY)} (model: ${OPENAI_MODEL})`);
});
