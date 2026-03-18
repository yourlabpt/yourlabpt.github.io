// ===== Internationalization (i18n) =====
let currentLang = localStorage.getItem('yourlab_lang_v2') || 'pt';

const translations = {
    en: {
        // Header
        tagline: 'Your Ideas Into Reality',
        // About
        aboutHeading: 'About YourLab',
        aboutLead: 'Fail small. Learn fast. Launch smart.',
        aboutBody: "Every year, over 30,000 new products are launched \u2014 and more than 90% of them fail. The biggest risk isn't having a bad idea; it's investing everything before validating on your business.",
        aboutBody2: "At YourLab, we help you build lean solutions so you can test your concept in the real market, learn what works, and iterate \u2014 fail smaller and pivot sooner.",
        statLabel1: 'of new products fail',
        statLabel2: 'of organisations struggle to innovate',
        aboutCta: 'The solution? Don\'t build everything \u2014 build the <strong>right thing first</strong>. That\'s what an MVP does.',
        // Journey
        journeyIdea: 'Idea',
        journeyIdeaDesc: 'You share your vision and business concept with us',
        journeyStrategy: 'Strategy',
        journeyStrategyDesc: 'We define the roadmap, scope, and core features',
        journeyBuild: 'Build',
        journeyBuildDesc: 'Our team designs and develops your product rapidly',
        journeyLaunch: 'Launch MVP',
        journeyLaunchDesc: 'Your product is ready to meet real users and grow',

        // Conclusion
        conclusionHeading: 'Why we are different?',
        conclusionBody: "We apply disciplined requirements engineering to transform your ideas into structured, measurable outcomes. Every request becomes a defined requirement, and every requirement carries a validation metric — so you always know what is being built and why. We don’t build for you; we build with you. This isn’t our lab — it’s YourLab. A place to test, measure, iterate, and grow. If you’re ready to move from assumption to validation, let’s start building the right thing.",

        // Slideshow
        slideshowKicker: 'IMMERSIVE OVERVIEW',
        slideshowIntroHeading: 'An interactive walkthrough of how YourLab builds products',
        slideshowIntroDesc: 'Move through each scene, interact with words, and follow the journey from concept to launch.',
        slideContinue: 'Continue',
        slide1Heading: 'Welcome to YourLab.',
        slide1Lead: 'We are the lab where your business ideas are developed, tested, and brought to life.',
        slide2Heading: 'What We Do',
        slide2Quote: 'Your idea in our lab.',
        slide2Item1: 'Smart Design — we transform raw ideas into actionable, well-defined requirements based on systems engineering methods.',
        slide2Item2: 'Test first — we start with a focused MVP, giving you something tangible to test and refine before moving ahead.',
        slide2Item3: 'Scope — projects range from custom business software to IoT applications and integrations built around your needs.',
        slide3Heading: 'Our Process',
        slide3Quote: 'Turning ideas into action.',
        slide3Step1: 'Book a call and show your idea.',
        slide3Step2: 'Plan the requirements and select the essentials for the MVP.',
        slide3Step3: 'Build with regular updates as your idea comes to life.',
        slide3Step4: 'Launch with confidence by validating before investing more.',
        slide4Heading: 'Why Choose YourLab',
        slide4Item1: 'One-to-One Rule — each specialist handles one project at a time, ensuring focused expertise and attention.',
        slide4Item2: 'Real People, Real Expertise — we combine human experience with AI support for smarter delivery.',
        slide4Item3: 'Builder Driven — we work side by side with you to build innovative solutions from scratch.',
        slide4Item4: 'Custom pricing — we understand your business reality and define pricing together.',
        slide5Heading: 'Are you ready to turn ideas into reality?',
        slide5Lead: 'We are here for you. YourLab Technologies.',
        slide5Cta: 'Start the conversation',
        // NFC Business Card
        nfcKicker: 'NFC BUSINESS CARD',
        nfcHeading: 'Tap, Open, Save Contact',
        nfcDescription: 'Use an NFC card, NFC sticker, or iPhone shortcut to instantly share your website contact profile.',
        nfcStep1: '1. Tap card',
        nfcStep2: '2. Open page',
        nfcStep3: '3. Save contact',
        nfcOpenPage: 'Open digital card',
        nfcDownload: 'Download contact (.vcf)',
        nfcNote: 'NFC tip: write only the page URL as an NDEF URI record.',

        // Chat
        chatHeading: "Let's Talk About Your Idea",
        chatDescription: 'Have a business idea? Our AI agent is here to listen and help you shape your vision. Just describe your idea and leave your contact information.',
        chatGreeting: "Hi there! I'm the YourLab Agent. Tell me about your business idea and share your contact info so we can reach out to discuss it further.",
        chatThinking: 'I am analyzing your context...',
        inputPlaceholder: 'Type your message here...',
        sendBtn: 'Send',
        // Footer
        footerText: '\u00A9 2025 YourLab. All rights reserved.',
        footerContactShortcut: 'Contacts card',
        // Chat bot responses
        bot: {
            r0: 'Great! Tell me more about your business idea. What problem are you solving?',
            r1: 'That sounds interesting. How do you plan to differentiate from competitors?',
            r2: 'Excellent vision! Now, could you please share your name so we can contact you?',
            askEmail: "Thanks! What's your email address? We'll use this to reach out to you.",
            askPhone: "Perfect! And what's the best phone number to reach you at?",
            saved: (name) => `Excellent, ${name}. We've received your business idea and saved your contact information. Our team will review your idea and get back to you shortly. Thanks for choosing YourLab.`,
            askMissing: (email, phone) => "I want to make sure we can reach you. Could you provide:\n" + (email ? "" : "- Your email\n") + (phone ? "" : "- Your phone number\n") + "?",
            moreInfo: "Thanks for sharing! Is there anything else you'd like to tell us about your business idea?",
            generic: [
                "That's an interesting point! Tell me more.",
                "I see \u2014 how will you approach this?",
                "Fascinating! What's your target market?",
                "Great idea! What's the timeline for launch?",
                "I like your thinking! How can we help you with this?"
            ]
        }
    },
    pt: {
        // Header
        tagline: 'Transforme as Suas Ideias de Neg\u00F3cio em Realidade',
        // About
        aboutHeading: 'Sobre a YourLab',
        aboutLead: 'Erre pequeno. Aprenda r\u00E1pido. Lance com intelig\u00EAncia.',
        aboutBody: 'Todos os anos, mais de 30.000 novos produtos s\u00E3o lan\u00E7ados \u2014 e mais de 90% deles falham. O maior risco n\u00E3o \u00E9 ter uma m\u00E1 ideia; \u00E9 investir tudo antes de a validar no mercado real.',
        aboutBody2: 'Na YourLab, ajudamos-te a construir solu\u00E7\u00F5es lean para testares o teu conceito com utilizadores reais, aprenderes o que funciona e iterares \u2014 erra menos e adapta mais r\u00E1pido.',
        statLabel1: 'dos novos produtos falham',
        statLabel2: 'das organiza\u00E7\u00F5es t\u00EAm dificuldade em inovar',
        aboutCta: 'A solu\u00E7\u00E3o? N\u00E3o construas tudo \u2014 constr\u00F3i <strong>a coisa certa primeiro</strong>. \u00C9 isso que um MVP faz.',
        // Journey
        journeyIdea: 'Ideia',
        journeyIdeaDesc: 'Partilhas a tua vis\u00E3o e conceito de neg\u00F3cio connosco',
        journeyStrategy: 'Estrat\u00E9gia',
        journeyStrategyDesc: 'Definimos o roadmap, o \u00E2mbito e as funcionalidades essenciais',
        journeyBuild: 'Constru\u00E7\u00E3o',
        journeyBuildDesc: 'A nossa equipa desenha e desenvolve o teu produto rapidamente',
        journeyLaunch: 'Lan\u00E7ar MVP',
        journeyLaunchDesc: 'O teu produto est\u00E1 pronto para chegar a utilizadores reais',
        // Conclusion
        conclusionHeading: 'Porque somos diferentes?',
        conclusionBody: 'Aplicamos engenharia de requisitos disciplinada para transformar as tuas ideias em resultados estruturados e mensur\u00E1veis. Cada pedido torna-se um requisito definido, e cada requisito tem uma m\u00E9trica de valida\u00E7\u00E3o \u2014 para que saibas sempre o que est\u00E1 a ser constru\u00EDdo e porqu\u00EA. N\u00E3o constru\u00EDmos por ti; constru\u00EDmos contigo. Este n\u00E3o \u00E9 o nosso laborat\u00F3rio \u2014 \u00E9 o YourLab. Um lugar para testar, medir, iterar e crescer. Se est\u00E1s pronto para passar da suposi\u00E7\u00E3o para a valida\u00E7\u00E3o, vamos come\u00E7ar a construir a coisa certa.',

        // Slideshow
        slideshowKicker: 'VIS\u00C3O GERAL IMERSIVA',
        slideshowIntroHeading: 'Uma experi\u00EAncia interativa sobre como a YourLab constr\u00F3i produtos',
        slideshowIntroDesc: 'Navega por cada cena, interage com as palavras e segue a jornada do conceito ao lan\u00E7amento.',
        slideContinue: 'Continuar',
        slide1Heading: 'Bem-vindo \u00E0 YourLab.',
        slide1Lead: 'Somos o laborat\u00F3rio onde as tuas ideias de neg\u00F3cio s\u00E3o desenvolvidas, testadas e transformadas em realidade.',
        slide2Heading: 'O Que Fazemos',
        slide2Quote: 'A tua ideia no nosso laborat\u00F3rio.',
        slide2Item1: 'Design Inteligente \u2014 transformamos ideias em requisitos bem definidos e acion\u00E1veis, baseados em m\u00E9todos de engenharia de sistemas.',
        slide2Item2: 'Teste primeiro \u2014 come\u00E7amos com um MVP focado, dando-te algo tang\u00EDvel para testar e refinar antes de avan\u00E7ar.',
        slide2Item3: '\u00C2mbito \u2014 os projetos v\u00E3o desde software empresarial personalizado a aplica\u00E7\u00F5es IoT e integra\u00E7\u00F5es constru\u00EDdas \u00E0 medida das tuas necessidades.',
        slide3Heading: 'O Nosso Processo',
        slide3Quote: 'Transformar ideias em a\u00E7\u00E3o.',
        slide3Step1: 'Agenda uma chamada e apresenta a tua ideia.',
        slide3Step2: 'Planeia os requisitos e seleciona o essencial para o MVP.',
        slide3Step3: 'Constr\u00F3i com atualiza\u00E7\u00F5es regulares enquanto a tua ideia ganha vida.',
        slide3Step4: 'Lan\u00E7a com confian\u00E7a, validando antes de investir mais.',
        slide4Heading: 'Porqu\u00EA Escolher a YourLab',
        slide4Item1: 'Regra Um-para-Um \u2014 cada especialista gere um projeto de cada vez, garantindo aten\u00E7\u00E3o e dedica\u00E7\u00E3o total.',
        slide4Item2: 'Pessoas Reais, Expertise Real \u2014 combinamos experi\u00EAncia humana com suporte de IA para entregas mais inteligentes.',
        slide4Item3: 'Orientados \u00E0 Constru\u00E7\u00E3o \u2014 trabalhamos lado a lado contigo para construir solu\u00E7\u00F5es inovadoras de raiz.',
        slide4Item4: 'Pre\u00E7o personalizado \u2014 compreendemos a tua realidade de neg\u00F3cio e definimos o pre\u00E7o em conjunto.',
        slide5Heading: 'Est\u00E1s pronto para transformar ideias em realidade?',
        slide5Lead: 'Estamos aqui para ti. YourLab Technologies.',
        slide5Cta: 'Come\u00E7a a conversa',
        // NFC Business Card
        nfcKicker: 'CART\u00C3O NFC',
        nfcHeading: 'Toca, abre, guarda o contacto',
        nfcDescription: 'Usa um cart\u00E3o NFC, autocolante NFC ou atalho no iPhone para partilhar instantaneamente o teu perfil de contacto do website.',
        nfcStep1: '1. Tocar no cart\u00E3o',
        nfcStep2: '2. Abrir p\u00E1gina',
        nfcStep3: '3. Guardar contacto',
        nfcOpenPage: 'Abrir cart\u00E3o digital',
        nfcDownload: 'Descarregar contacto (.vcf)',
        nfcNote: 'Dica NFC: grava apenas o URL da p\u00E1gina como registo NDEF URI.',

        // Chat
        chatHeading: 'Vamos Falar Sobre a Tua Ideia',
        chatDescription: 'Tens uma ideia de neg\u00F3cio? O nosso agente de IA est\u00E1 aqui para ouvir e ajudar-te a moldar a tua vis\u00E3o. Basta descrever a tua ideia e deixar as tuas informa\u00E7\u00F5es de contacto.',
        chatGreeting: 'Ol\u00E1! Sou o Agente da YourLab. Fala-me da tua ideia de neg\u00F3cio e partilha as tuas informa\u00E7\u00F5es de contacto para podermos entrar em contacto contigo.',
        chatThinking: 'Estou a analisar o teu contexto...',
        inputPlaceholder: 'Escreve a tua mensagem aqui...',
        sendBtn: 'Enviar',
        // Footer
        footerText: '\u00A9 2025 YourLab. Todos os direitos reservados.',
        footerContactShortcut: 'Cart\u00E3o de contacto',
        // Chat bot responses
        bot: {
            r0: '\u00D3timo! Conta-me mais sobre a tua ideia de neg\u00F3cio. Que problema est\u00E1s a resolver?',
            r1: 'Parece interessante. Como pensas diferenciar-te da concorr\u00EAncia?',
            r2: 'Excelente vis\u00E3o! Podes partilhar o teu nome para podermos contactar-te?',
            askEmail: 'Obrigado! Qual \u00E9 o teu email? Vamos us\u00E1-lo para entrar em contacto contigo.',
            askPhone: 'Perfeito! E qual \u00E9 o melhor n\u00FAmero de telefone para te contactar?',
            saved: (name) => `Excelente, ${name}. Recebemos a tua ideia de neg\u00F3cio e guard\u00E1mos as tuas informa\u00E7\u00F5es de contacto. A nossa equipa vai analisar a tua ideia e entrar\u00E1 em contacto em breve. Obrigado por escolheres a YourLab.`,
            askMissing: (email, phone) => "Quero ter a certeza de que te conseguimos contactar. Podes fornecer:\n" + (email ? "" : "- O teu email\n") + (phone ? "" : "- O teu n\u00FAmero de telefone\n") + "?",
            moreInfo: 'Obrigado por partilhares! H\u00E1 mais alguma coisa que gostarias de nos contar sobre a tua ideia de neg\u00F3cio?',
            generic: [
                '\u00C9 um ponto interessante! Conta-me mais.',
                'Compreendo \u2014 como pensas abordar isto?',
                'Fascinante! Qual \u00E9 o teu mercado-alvo?',
                '\u00D3tima ideia! Qual \u00E9 o timing para o lan\u00E7amento?',
                'Gosto da tua vis\u00E3o! Como podemos ajudar-te com isto?'
            ]
        }
    }
};

function setLanguage(lang) {
    currentLang = lang;
    localStorage.setItem('yourlab_lang_v2', lang);
    document.documentElement.lang = lang;

    // Update toggle UI
    document.querySelectorAll('.lang-option').forEach(opt => {
        opt.classList.toggle('active', opt.dataset.lang === lang);
    });

    // Translate all elements with data-i18n
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        const text = translations[lang][key];
        if (text !== undefined) {
            if (el.getAttribute('data-i18n-html') === 'true') {
                el.innerHTML = text;
            } else {
                el.textContent = text;
            }
        }
    });

    // Translate placeholders
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        const text = translations[lang][key];
        if (text !== undefined) {
            el.placeholder = text;
        }
    });
}

// Language toggle click handler
document.getElementById('langToggle').addEventListener('click', () => {
    setLanguage(currentLang === 'en' ? 'pt' : 'en');
});

// Apply saved language on load
setLanguage(currentLang);

// Helper to get current bot translations
function getBotText() {
    return translations[currentLang].bot;
}

const chatForm = document.getElementById('chatForm');
const userInput = document.getElementById('userInput');
const chatMessages = document.getElementById('chatMessages');
const sendButton = chatForm.querySelector('.send-btn');

const chatState = {
    sessionId: localStorage.getItem('yourlab_chat_session_id') || '',
    processing: false,
    turns: [],
    fallbackConversation: {
        messages: [],
        contact: {
            name: '',
            email: '',
            phone: ''
        },
        businessIdea: ''
    }
};

function scrollChatToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function addBotMessage(text) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message bot-message';
    const paragraph = document.createElement('p');
    paragraph.textContent = text;
    paragraph.style.whiteSpace = 'pre-line';
    messageDiv.appendChild(paragraph);
    chatMessages.appendChild(messageDiv);
    scrollChatToBottom();
}

function addUserMessage(text) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message user-message';
    const paragraph = document.createElement('p');
    paragraph.textContent = text;
    paragraph.style.whiteSpace = 'pre-line';
    messageDiv.appendChild(paragraph);
    chatMessages.appendChild(messageDiv);
    scrollChatToBottom();
}

function addTypingIndicator() {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message bot-message';
    messageDiv.dataset.typing = 'true';
    const paragraph = document.createElement('p');
    paragraph.textContent = translations[currentLang].chatThinking;
    messageDiv.appendChild(paragraph);
    chatMessages.appendChild(messageDiv);
    scrollChatToBottom();
    return messageDiv;
}

function removeTypingIndicator(indicatorEl) {
    if (indicatorEl && indicatorEl.parentNode) {
        indicatorEl.parentNode.removeChild(indicatorEl);
    }
}

function updateInputState(disabled) {
    userInput.disabled = disabled;
    sendButton.disabled = disabled;
}

function saveConversationLocally(payload) {
    const conversations = JSON.parse(localStorage.getItem('yourlab_conversations') || '[]');
    conversations.push(payload);
    localStorage.setItem('yourlab_conversations', JSON.stringify(conversations));
}

async function sendMessageToAi(userText) {
    const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            sessionId: chatState.sessionId,
            language: currentLang,
            message: userText
        })
    });

    if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`);
    }

    return response.json();
}

function parseFallbackInput(text) {
    const emailRegex = /[\w.-]+@[\w.-]+\.\w+/g;
    const phoneRegex = /(\+?\d{1,3}[-.\s]?)?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}/g;
    const nameRegex = /(?:name is|i'm|i am|call me|chamo-me|meu nome \u00e9|sou o|sou a)\s+([a-zA-Z\u00c0-\u00ff\s]+)(?:[,.]|$)/i;

    const emails = text.match(emailRegex);
    const phones = text.match(phoneRegex);
    const nameMatch = text.match(nameRegex);

    if (emails) chatState.fallbackConversation.contact.email = emails[0];
    if (phones) chatState.fallbackConversation.contact.phone = phones[0];
    if (nameMatch) chatState.fallbackConversation.contact.name = nameMatch[1].trim();

    chatState.fallbackConversation.businessIdea += ` ${text}`;
}

function processFallbackUserMessage(userText) {
    parseFallbackInput(userText);

    let botResponse = '';
    const messageCount = chatState.fallbackConversation.messages.length;
    const bot = getBotText();

    const hasName = chatState.fallbackConversation.contact.name;
    const hasEmail = chatState.fallbackConversation.contact.email;
    const hasPhone = chatState.fallbackConversation.contact.phone;
    const hasIdea = chatState.fallbackConversation.businessIdea.trim().length > 20;

    if (messageCount === 0) {
        botResponse = bot.r0;
    } else if (messageCount === 1) {
        botResponse = bot.r1;
    } else if (messageCount === 2) {
        botResponse = bot.r2;
    } else if (!hasEmail) {
        botResponse = bot.askEmail;
    } else if (!hasPhone) {
        botResponse = bot.askPhone;
    } else if (hasName && hasEmail && hasPhone && hasIdea) {
        botResponse = bot.saved(chatState.fallbackConversation.contact.name);
    } else if (messageCount > 5) {
        botResponse = (!hasEmail || !hasPhone) ? bot.askMissing(hasEmail, hasPhone) : bot.moreInfo;
    } else {
        botResponse = bot.generic[messageCount % bot.generic.length];
    }

    chatState.fallbackConversation.messages.push({
        user: userText,
        bot: botResponse,
        timestamp: new Date().toISOString()
    });

    if (hasName && hasEmail && hasPhone && hasIdea) {
        saveConversationLocally({
            timestamp: new Date().toISOString(),
            contact: { ...chatState.fallbackConversation.contact },
            businessIdea: chatState.fallbackConversation.businessIdea.trim(),
            messages: [...chatState.fallbackConversation.messages],
            source: 'frontend-fallback-flow'
        });

        chatState.fallbackConversation = {
            messages: [],
            contact: {
                name: '',
                email: '',
                phone: ''
            },
            businessIdea: ''
        };
    }

    return botResponse;
}

async function processUserMessage(userText) {
    addUserMessage(userText);
    const typingIndicator = addTypingIndicator();

    try {
        const result = await sendMessageToAi(userText);
        removeTypingIndicator(typingIndicator);

        if (result.sessionId) {
            chatState.sessionId = result.sessionId;
            localStorage.setItem('yourlab_chat_session_id', chatState.sessionId);
        }

        const botResponse = (result.reply || '').trim() || getBotText().generic[0];
        addBotMessage(botResponse);

        chatState.turns.push({
            user: userText,
            bot: botResponse,
            timestamp: new Date().toISOString(),
            stage: result.stage || '',
            leadScore: result.leadScore || 0
        });

        if (result.saved) {
            saveConversationLocally({
                timestamp: new Date().toISOString(),
                sessionId: chatState.sessionId,
                contact: {
                    name: (result.lead && result.lead.name) || '',
                    email: (result.lead && result.lead.email) || '',
                    phone: (result.lead && result.lead.phone) || ''
                },
                businessIdea: chatState.turns.map(turn => turn.user).join(' ').trim(),
                messages: [...chatState.turns],
                summary: {
                    stage: result.stage || '',
                    score: result.leadScore || 0
                },
                source: result.usingFallback ? 'backend-fallback-flow' : 'backend-ai-flow'
            });
        }
    } catch (error) {
        console.warn('AI backend unavailable, using fallback flow:', error.message);
        removeTypingIndicator(typingIndicator);
        const fallbackReply = processFallbackUserMessage(userText);
        setTimeout(() => addBotMessage(fallbackReply), 250);
    }
}

chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const userText = userInput.value.trim();
    if (!userText || chatState.processing) return;

    chatState.processing = true;
    updateInputState(true);
    userInput.value = '';

    try {
        await processUserMessage(userText);
    } finally {
        chatState.processing = false;
        updateInputState(false);
        userInput.focus();
    }
});

userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        chatForm.dispatchEvent(new Event('submit'));
    }
});

function showSavedConversations() {
    const conversations = JSON.parse(localStorage.getItem('yourlab_conversations') || '[]');
    console.log('Saved Conversations:', conversations);
    return conversations;
}

console.log('YourLab AI chat ready. Type "showSavedConversations()" in console to view saved inquiries.');

// ===== Scroll Reveal & Counter Animation =====
(function () {
    const revealEls = document.querySelectorAll('.reveal-up');
    const statNumbers = document.querySelectorAll('.stat-number[data-target]');
    let statsAnimated = false;

    // Intersection Observer for reveal animations
    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry, i) => {
            if (entry.isIntersecting) {
                // Stagger the reveal for sequential elements
                const delay = Array.from(revealEls).indexOf(entry.target) * 120;
                setTimeout(() => {
                    entry.target.classList.add('revealed');
                }, delay);
                revealObserver.unobserve(entry.target);
            }
        });
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });

    revealEls.forEach(el => revealObserver.observe(el));

    // Counter animation for stat numbers
    function animateCounters() {
        if (statsAnimated) return;
        statsAnimated = true;

        statNumbers.forEach(num => {
            const target = parseInt(num.dataset.target, 10);
            const duration = 2000;
            const start = performance.now();

            function update(now) {
                const elapsed = now - start;
                const progress = Math.min(elapsed / duration, 1);
                // Ease-out cubic
                const eased = 1 - Math.pow(1 - progress, 3);
                num.textContent = Math.round(target * eased);
                if (progress < 1) requestAnimationFrame(update);
            }

            requestAnimationFrame(update);
        });
    }

    const statsSection = document.querySelector('.about-stats');
    if (statsSection) {
        const statsObserver = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) {
                animateCounters();
                statsObserver.unobserve(statsSection);
            }
        }, { threshold: 0.5 });
        statsObserver.observe(statsSection);
    }
})();

// ===== Immersive Slideshow =====
(function () {
    const slides = document.querySelectorAll('.slideshow-section .slide');
    const dots = document.querySelectorAll('.slideshow-section .dot');
    const prevBtn = document.querySelector('.slide-prev');
    const nextBtn = document.querySelector('.slide-next');
    const progressBar = document.querySelector('.slide-progress-bar');
    const section = document.querySelector('.slideshow-section');
    const container = document.querySelector('.slideshow-container');
    if (!slides.length) return;

    let current = 0;
    const total = slides.length;
    const INTERVAL = 18000; // ms per slide
    let timer = null;
    let progressStart = null;
    let rafId = null;

    function enhanceWords() {
        const interactiveNodes = document.querySelectorAll('[data-word-interactive]');
        interactiveNodes.forEach(node => {
            if (node.dataset.wordsReady === 'true') return;

            const tokens = node.textContent.split(/(\s+)/);
            const fragment = document.createDocumentFragment();

            tokens.forEach(token => {
                if (!token.trim()) {
                    fragment.appendChild(document.createTextNode(token));
                    return;
                }

                const span = document.createElement('span');
                span.className = 'word-node';
                span.textContent = token;
                span.addEventListener('mouseenter', () => {
                    span.classList.add('pulse');
                    setTimeout(() => span.classList.remove('pulse'), 240);
                });
                fragment.appendChild(span);
            });

            node.textContent = '';
            node.appendChild(fragment);
            node.dataset.wordsReady = 'true';
        });
    }

    function setActiveSlideState() {
        slides.forEach((slide, index) => {
            const isActive = index === current;
            slide.classList.toggle('active', isActive);
            slide.setAttribute('aria-hidden', String(!isActive));
        });

        dots.forEach((dot, index) => {
            dot.classList.toggle('active', index === current);
        });
    }

    function goTo(index) {
        current = (index + total) % total;
        setActiveSlideState();
        resetProgress();
    }

    function next() { goTo(current + 1); }
    function prev() { goTo(current - 1); }

    // Progress bar animation
    function animateProgress(timestamp) {
        if (!progressBar) return;
        if (!progressStart) progressStart = timestamp;
        const elapsed = timestamp - progressStart;
        const pct = Math.min((elapsed / INTERVAL) * 100, 100);
        progressBar.style.width = pct + '%';
        if (pct < 100) {
            rafId = requestAnimationFrame(animateProgress);
        }
    }

    function resetProgress() {
        cancelAnimationFrame(rafId);
        if (progressBar) progressBar.style.width = '0%';
        progressStart = null;
        rafId = requestAnimationFrame(animateProgress);
        clearInterval(timer);
        timer = setInterval(next, INTERVAL);
    }

    // Events
    if (nextBtn) nextBtn.addEventListener('click', next);
    if (prevBtn) prevBtn.addEventListener('click', prev);
    dots.forEach(dot => {
        dot.addEventListener('click', () => goTo(Number(dot.dataset.index)));
    });
    document.querySelectorAll('.scene-next[data-action="next"]').forEach(btn => {
        btn.addEventListener('click', next);
    });

    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
        if (!section) return;
        const rect = section.getBoundingClientRect();
        const inView = rect.top < window.innerHeight && rect.bottom > 0;
        if (!inView) return;
        if (e.key === 'ArrowRight') next();
        if (e.key === 'ArrowLeft') prev();
    });

    if (container) {
        // Touch / swipe support
        let touchStartX = 0;
        container.addEventListener('touchstart', (e) => {
            touchStartX = e.changedTouches[0].screenX;
        }, { passive: true });
        container.addEventListener('touchend', (e) => {
            const diff = e.changedTouches[0].screenX - touchStartX;
            if (Math.abs(diff) > 50) {
                diff < 0 ? next() : prev();
            }
        }, { passive: true });

        // Pause on hover
        container.addEventListener('mouseenter', () => {
            clearInterval(timer);
            cancelAnimationFrame(rafId);
        });
        container.addEventListener('mouseleave', () => {
            resetProgress();
        });
    }

    // Start
    enhanceWords();
    setActiveSlideState();
    resetProgress();
})();

// ===== Global Background: Infinite Sinusoidal Dot Field + Cloud Smoke =====
(function () {
    const canvas = document.getElementById('globalLandscapeCanvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isCoarsePointer = window.matchMedia('(pointer: coarse)').matches;
    const state = {
        width: 0,
        height: 0,
        dpr: 1,
        rows: 0,
        cols: 0,
        waveRows: [],
        clouds: [],
        ripples: [],
        pointerTargetX: 0.5,
        pointerTargetY: 0.5,
        pointerX: 0.5,
        pointerY: 0.5,
        lastRippleX: 0.5,
        lastRippleY: 0.5,
        parallaxX: 0,
        parallaxY: 0,
        lastDisturbAt: 0,
        lastTime: performance.now(),
        rafId: null
    };

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function lerp(a, b, t) {
        return a + ((b - a) * t);
    }

    function smoothstep(t) {
        return t * t * (3 - 2 * t);
    }

    function hash2d(x, y) {
        const s = Math.sin((x * 127.1) + (y * 311.7)) * 43758.5453123;
        return s - Math.floor(s);
    }

    function valueNoise(x, y) {
        const ix = Math.floor(x);
        const iy = Math.floor(y);
        const fx = x - ix;
        const fy = y - iy;

        const a = hash2d(ix, iy);
        const b = hash2d(ix + 1, iy);
        const c = hash2d(ix, iy + 1);
        const d = hash2d(ix + 1, iy + 1);
        const ux = smoothstep(fx);
        const uy = smoothstep(fy);

        return lerp(lerp(a, b, ux), lerp(c, d, ux), uy);
    }

    function createWaveRows() {
        state.waveRows.length = 0;
        if (isCoarsePointer) {
            state.rows = clamp(Math.floor(state.height / 8) + 54, 86, 132);
            state.cols = clamp(Math.floor(state.width / 9) + 78, 118, 205);
        } else {
            state.rows = clamp(Math.floor(state.height / 6) + 72, 118, 188);
            state.cols = clamp(Math.floor(state.width / 7) + 110, 170, 320);
        }

        const groupCount = 8;
        const groups = [];
        for (let g = 0; g < groupCount; g += 1) {
            const t = g / Math.max(1, groupCount - 1);
            groups.push({
                freq: 4.9 + (t * 2.6),
                amp: 0.62 + (t * 0.48),
                speed: 0.58 + (t * 0.44),
                phase: g * 0.68
            });
        }

        for (let i = 0; i < state.rows; i += 1) {
            const depth = i / (state.rows - 1);
            const groupPos = depth * (groupCount - 1);
            const g0 = Math.floor(groupPos);
            const g1 = Math.min(groupCount - 1, g0 + 1);
            const mix = smoothstep(groupPos - g0);
            const base = groups[g0];
            const next = groups[g1];
            const profile = valueNoise((depth * 7.5) + 1.2, 0.4) - 0.5;

            state.waveRows.push({
                depth,
                freq: lerp(base.freq, next.freq, mix) + ((1 - depth) * 0.55),
                amp: (0.46 + depth * 0.85) * lerp(base.amp, next.amp, mix),
                speed: lerp(base.speed, next.speed, mix) * (0.82 + ((1 - depth) * 0.22)),
                phase: lerp(base.phase, next.phase, mix) + (depth * 2.6),
                profile: profile * 0.18,
                tilt: Math.sin(depth * 8.2) * 0.16
            });
        }
    }

    function createClouds() {
        state.clouds.length = 0;
        const cloudCount = isCoarsePointer
            ? clamp(Math.floor(state.width / 13) + 24, 70, 140)
            : clamp(Math.floor(state.width / 10) + 40, 110, 220);
        for (let i = 0; i < cloudCount; i += 1) {
            state.clouds.push({
                x: (Math.random() * 2 - 1) * 2.2,
                depth: Math.random(),
                band: Math.random(),
                size: 0.38 + Math.random() * 0.95,
                alpha: 0.028 + Math.random() * 0.06,
                drift: (Math.random() - 0.5) * 0.32,
                phase: Math.random() * Math.PI * 2
            });
        }
    }

    function resizeCanvas() {
        state.width = Math.max(window.innerWidth, 320);
        state.height = Math.max(window.innerHeight, 320);
        state.dpr = Math.min(window.devicePixelRatio || 1, 2);

        canvas.width = Math.floor(state.width * state.dpr);
        canvas.height = Math.floor(state.height * state.dpr);
        canvas.style.width = `${state.width}px`;
        canvas.style.height = `${state.height}px`;
        ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);

        createWaveRows();
        createClouds();
        render(performance.now());
    }

    function addRipple(nx, ny, strength = 0.5) {
        state.ripples.push({
            x: (nx * 2) - 1,
            z: clamp((ny - 0.1) / 0.9, 0, 1),
            radius: 0.02,
            speed: 0.01 + Math.random() * 0.01,
            strength,
            life: 1
        });

        if (state.ripples.length > 12) {
            state.ripples.shift();
        }
    }

    function rippleInfluence(x, z, time) {
        let total = 0;
        for (let i = 0; i < state.ripples.length; i += 1) {
            const r = state.ripples[i];
            const dx = x - r.x;
            const dz = z - r.z;
            const dist = Math.sqrt((dx * dx) + (dz * dz));
            const edge = Math.abs(dist - r.radius);
            if (edge > 0.18) continue;

            const wave = Math.sin((edge * 42) - (time * 0.0042));
            const falloff = Math.exp(-edge * 22);
            total += wave * falloff * r.strength * r.life;
        }
        return total;
    }

    function update(dt) {
        for (let i = state.ripples.length - 1; i >= 0; i -= 1) {
            const r = state.ripples[i];
            r.radius += r.speed * dt;
            r.life -= dt * 0.022;
            if (r.life <= 0 || r.radius > 1.65) {
                state.ripples.splice(i, 1);
            }
        }

        for (let i = 0; i < state.clouds.length; i += 1) {
            const c = state.clouds[i];
            c.x += c.drift * dt * 0.01;
            c.phase += dt * 0.011;
            if (c.x > 2.35) c.x = -2.35;
            if (c.x < -2.35) c.x = 2.35;
        }

        const pointerEase = isCoarsePointer ? 0.05 : 0.075;
        state.pointerX = lerp(state.pointerX, state.pointerTargetX, pointerEase);
        state.pointerY = lerp(state.pointerY, state.pointerTargetY, pointerEase);

        const px = (state.pointerX - 0.5) * 2;
        const py = (state.pointerY - 0.5) * 2;
        state.parallaxX = lerp(state.parallaxX, px, 0.06);
        state.parallaxY = lerp(state.parallaxY, py, 0.06);
    }

    function drawAtmosphere() {
        const atmosphere = ctx.createLinearGradient(0, 0, 0, state.height);
        atmosphere.addColorStop(0, 'rgba(232, 213, 183, 0.07)');
        atmosphere.addColorStop(0.35, 'rgba(232, 213, 183, 0.03)');
        atmosphere.addColorStop(1, 'rgba(232, 213, 183, 0.01)');
        ctx.fillStyle = atmosphere;
        ctx.fillRect(0, 0, state.width, state.height);
    }

    function drawSinusoidLandscape(time, horizonY, floorY) {
        const t = time * 0.001;

        for (let row = 0; row < state.rows; row += 1) {
            const r = state.waveRows[row];
            const depth = r.depth;
            const spread = state.width * (0.09 + depth * 0.66);
            const baseY = horizonY + Math.pow(depth, 1.75) * (floorY - horizonY);
            const ampPx = (2.2 + depth * 56) * r.amp;

            for (let col = 0; col < state.cols; col += 1) {
                const xNorm = ((col / (state.cols - 1)) * 2) - 1;
                const primary = Math.sin((xNorm * r.freq) + (t * r.speed) + r.phase + (depth * 3.4));
                const secondary = Math.sin((xNorm * ((r.freq * 0.5) + 1.7)) - (t * (r.speed * 0.7)) + (r.phase * 1.4));
                const tertiary = Math.sin((xNorm * ((r.freq * 0.3) + 0.95)) + (t * (r.speed * 0.35)) + (r.phase * 0.7));
                const noise = (valueNoise((xNorm + 2.4) * 1.4, (depth * 3.6) + (t * 0.11)) - 0.5) * 0.12;
                const ripple = rippleInfluence(xNorm, depth, time) * (0.28 + depth * 0.22);
                const wave = (primary * 0.7) + (secondary * 0.2) + (tertiary * 0.1) + noise + ripple + r.profile;

                const sx = (state.width * 0.5) + (xNorm * spread) + (state.parallaxX * depth * 28);
                const sy = baseY - (wave * ampPx) + (r.tilt * xNorm * depth * 42);
                if (sx < -12 || sx > state.width + 12 || sy < horizonY - 80 || sy > state.height + 28) continue;

                const size = 0.16 + depth * 1.42;
                const alpha = 0.01 + (depth * 0.18) + (Math.abs(primary) * 0.04);

                ctx.beginPath();
                ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(0.35, alpha).toFixed(4)})`;
                ctx.arc(sx, sy, size, 0, Math.PI * 2);
                ctx.fill();

                if (Math.abs(primary) > 0.8 && depth > 0.12) {
                    ctx.beginPath();
                    ctx.fillStyle = `rgba(232, 213, 183, ${Math.min(0.2, alpha * 0.65).toFixed(4)})`;
                    ctx.arc(sx, sy, size * 0.5, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }
    }

    function drawCloudSmoke(time, horizonY) {
        const t = time * 0.001;

        for (let i = 0; i < state.clouds.length; i += 1) {
            const c = state.clouds[i];
            const depth = c.depth;
            const spread = state.width * (0.22 + depth * 0.66);
            const sx = (state.width * 0.5) + (c.x * spread) + (state.parallaxX * 14 * (0.4 + depth));
            const sy = horizonY - (state.height * (0.17 - (c.band * 0.24))) + (depth * state.height * 0.06) + (Math.sin((t * 0.55) + c.phase) * 7);
            const radius = state.width * (0.015 + c.size * 0.05) * (0.35 + (1 - depth) * 0.95);
            if (sx < -radius || sx > state.width + radius || sy < -radius || sy > state.height + radius) continue;

            const gradient = ctx.createRadialGradient(sx, sy, 0, sx, sy, radius);
            gradient.addColorStop(0, `rgba(255, 255, 255, ${(c.alpha * 1.35).toFixed(4)})`);
            gradient.addColorStop(0.42, `rgba(255, 255, 255, ${(c.alpha * 0.55).toFixed(4)})`);
            gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(sx, sy, radius, 0, Math.PI * 2);
            ctx.fill();
        }

        const horizonMist = ctx.createLinearGradient(0, horizonY - (state.height * 0.16), 0, horizonY + (state.height * 0.14));
        horizonMist.addColorStop(0, 'rgba(255, 255, 255, 0)');
        horizonMist.addColorStop(0.45, 'rgba(232, 213, 183, 0.11)');
        horizonMist.addColorStop(1, 'rgba(232, 213, 183, 0)');
        ctx.fillStyle = horizonMist;
        ctx.fillRect(0, horizonY - (state.height * 0.16), state.width, state.height * 0.3);
    }

    function render(time) {
        ctx.clearRect(0, 0, state.width, state.height);
        drawAtmosphere();

        const horizonY = state.height * (0.22 + (state.parallaxY * 0.012));
        const floorY = state.height * 1.04;

        drawSinusoidLandscape(time, horizonY, floorY);
        drawCloudSmoke(time, horizonY);

        const floorFog = ctx.createLinearGradient(0, state.height * 0.55, 0, state.height);
        floorFog.addColorStop(0, 'rgba(232, 213, 183, 0)');
        floorFog.addColorStop(1, 'rgba(232, 213, 183, 0.1)');
        ctx.fillStyle = floorFog;
        ctx.fillRect(0, state.height * 0.55, state.width, state.height * 0.45);
    }

    function animate(now) {
        const dt = Math.min(2, (now - state.lastTime) / 16.67);
        state.lastTime = now;
        update(dt);
        render(now);
        state.rafId = requestAnimationFrame(animate);
    }

    function feedPointer(nx, ny) {
        state.pointerTargetX = clamp(nx, 0, 1);
        state.pointerTargetY = clamp(ny, 0, 1);

        const now = performance.now();
        const dx = state.pointerTargetX - state.lastRippleX;
        const dy = state.pointerTargetY - state.lastRippleY;
        const movedEnough = ((dx * dx) + (dy * dy)) > (isCoarsePointer ? 0.005 : 0.0025);
        const rippleGap = isCoarsePointer ? 100 : 70;

        if (movedEnough && (now - state.lastDisturbAt > rippleGap)) {
            addRipple(state.pointerTargetX, state.pointerTargetY, isCoarsePointer ? 0.36 : 0.48);
            state.lastDisturbAt = now;
            state.lastRippleX = state.pointerTargetX;
            state.lastRippleY = state.pointerTargetY;
        }
    }

    window.addEventListener('pointermove', (event) => {
        feedPointer(
            event.clientX / Math.max(1, state.width),
            event.clientY / Math.max(1, state.height)
        );
    });

    window.addEventListener('touchstart', (event) => {
        const touch = event.touches && event.touches[0];
        if (!touch) return;
        feedPointer(
            touch.clientX / Math.max(1, state.width),
            touch.clientY / Math.max(1, state.height)
        );
    }, { passive: true });

    window.addEventListener('touchmove', (event) => {
        const touch = event.touches && event.touches[0];
        if (!touch) return;
        feedPointer(
            touch.clientX / Math.max(1, state.width),
            touch.clientY / Math.max(1, state.height)
        );
    }, { passive: true });

    window.addEventListener('touchend', () => {
        state.pointerTargetX = 0.5;
        state.pointerTargetY = 0.5;
    }, { passive: true });

    window.addEventListener('touchcancel', () => {
        state.pointerTargetX = 0.5;
        state.pointerTargetY = 0.5;
    }, { passive: true });

    window.addEventListener('pointerleave', () => {
        state.pointerTargetX = 0.5;
        state.pointerTargetY = 0.5;
    });

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    if (!prefersReducedMotion) {
        state.rafId = requestAnimationFrame(animate);
    }

    window.addEventListener('beforeunload', () => {
        if (state.rafId) cancelAnimationFrame(state.rafId);
    });
})();
