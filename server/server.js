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
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-5-mini';
const CHAT_SESSION_TTL_MS = Number(process.env.CHAT_SESSION_TTL_MS || 45 * 60 * 1000);
const SHOULD_STORE_RESPONSES = String(process.env.OPENAI_STORE_RESPONSES || 'false') === 'true';

const openai = process.env.OPENAI_API_KEY
    ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    : null;

// Middleware
app.use(cors());
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

function buildSystemPrompt(language) {
    const isPt = language === 'pt';
    const languageInstruction = isPt ? 'Portuguese from Portugal' : 'English';
    return `
You are the "YourLab Growth Advisor", a commercial specialist and market strategy expert for YourLab.
YourLab differentiators:
- "Fail small, learn fast, launch smart" with MVP-first strategy.
- Disciplined requirements engineering with measurable validation metrics.
- One specialist focused per project and close collaboration with founders.
- Human expertise combined with AI support.

Goal:
- Keep the conversation engaging and human.
- Understand the founder's business history and idea.
- Qualify lead quality for follow-up.
- Gather contact data naturally (name + email or phone).
- Ask only one key question at a time.

Conversation rules:
- Write only in ${languageInstruction}.
- 40 to 110 words.
- Warm, direct, practical tone.
- Never sound robotic, never pressure aggressively.
- Always show listening by briefly reflecting what they said.
- Request consent for contact before final handoff.
- If contact is missing, ask for it after delivering value.
- If enough info is collected, propose a concrete next step and timeline.

Output JSON only.
`.trim();
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

    const history = session.turns.slice(-8).flatMap((turn) => ([
        { role: 'user', content: turn.user },
        { role: 'assistant', content: turn.assistant }
    ]));

    const contextState = {
        stage: session.stage,
        leadScore: session.leadScore,
        lead: session.lead,
        topicBullets: session.topicBullets
    };

    const input = [
        { role: 'system', content: buildSystemPrompt(session.lead.language) },
        ...history,
        {
            role: 'system',
            content: `Current lead state JSON: ${JSON.stringify(contextState)}`
        },
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
    const cleanedUserMessage = cleanText(userMessage, 700);
    const hasStory = Boolean(lead.problem || lead.goal || cleanedUserMessage.length > 35);
    const missingContact = !(lead.email || lead.phone);
    const missingName = !lead.name;
    const inferredLeadUpdate = {};

    if (cleanedUserMessage.length > 35 && !lead.problem) {
        inferredLeadUpdate.problem = cleanedUserMessage;
    }
    if (!lead.goal && /\b(goal|want|need|objetivo|pretendo|quero)\b/i.test(cleanedUserMessage)) {
        inferredLeadUpdate.goal = cleanedUserMessage;
    }
    if (/\b(consent|agree|authorized|autorizo|aceito|sim|yes)\b/i.test(cleanedUserMessage)) {
        inferredLeadUpdate.consentToContact = true;
    }

    let reply = '';
    if (!hasStory) {
        reply = isPt
            ? 'Obrigado por estares aqui. Para te ajudarmos com uma proposta de MVP, qual e o principal problema de negocio que queres resolver e para quem?'
            : 'Thanks for sharing. To shape a strong MVP proposal, what is the main business problem you want to solve, and for whom?';
    } else if (missingName) {
        reply = isPt
            ? 'A tua ideia faz sentido e tem potencial. Para preparar os proximos passos contigo, podes partilhar o teu nome?'
            : 'Your idea makes sense and has potential. To prepare the next steps with you, could you share your name?';
    } else if (missingContact) {
        reply = isPt
            ? 'Excelente contexto. Para te enviarmos um resumo com os proximos passos, deixa o teu melhor email ou telefone.'
            : 'Great context. To send you a short action summary and next steps, share your best email or phone number.';
    } else {
        reply = isPt
            ? 'Perfeito, obrigado. Ja temos contexto suficiente para avancar: podemos enviar um resumo com prioridades do MVP e marcar uma chamada curta para alinhar escopo.'
            : 'Perfect, thank you. We now have enough context to move forward: we can send a concise MVP priority summary and schedule a short alignment call.';
    }

    const score = computeLeadScore(lead);
    return {
        assistant_reply: reply,
        request_contact_now: missingContact,
        lead_stage: resolveLeadStage(lead, score),
        lead_score: score,
        updated_lead: inferredLeadUpdate,
        topic_bullets: session.topicBullets,
        next_best_action: isPt ? 'Enviar resumo e agendar chamada.' : 'Send summary and schedule intro call.'
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
