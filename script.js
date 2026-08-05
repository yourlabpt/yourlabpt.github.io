// ===== Internationalization (i18n) =====
const SUPPORTED_LANGS = ['pt', 'en'];

// A shared link wins over a stored choice, and a first-time visitor gets the
// language their browser asks for rather than always landing on Portuguese.
function resolveInitialLang() {
    const fromUrl = new URLSearchParams(window.location.search).get('lang');
    if (SUPPORTED_LANGS.includes(fromUrl)) return fromUrl;

    const stored = localStorage.getItem('yourlab_lang_v2');
    if (SUPPORTED_LANGS.includes(stored)) return stored;

    const preferred = navigator.languages || [navigator.language || ''];
    return preferred.some((tag) => String(tag).toLowerCase().startsWith('pt')) ? 'pt' : 'en';
}

let currentLang = resolveInitialLang();

const translations = {
    en: {
        // Document
        pageTitle: 'YourLab — We turn messy processes into systems that are simple to use',
        metaDescription: 'We test ideas, organise companies and fix half-finished applications. First useful version in weeks, with a fixed quote before we start. Portugal and Europe.',

        // Header
        headerCta: 'Talk to us',

        // 1. Hero
        heroH1: 'We turn messy processes into systems that are simple to use.',
        heroSub: 'Have an idea to test, a process stuck in spreadsheets and messages, or an application left half-finished? We build the first useful version in weeks — with a fixed quote before we start.',
        heroCtaPrimary: 'Tell us what needs improving',
        heroCtaSecondary: 'See how we work',
        heroMicrocopy: 'First call is free and carries no obligation. If building makes no sense, we tell you.',

        // 2. Situations
        situationsH2: 'Does any of this sound familiar?',
        situation1Title: "You have an idea and don't know where to start",
        situation1Body: "You know the problem you want to solve, but not what to build first, what it costs, or how long it takes. We help define the first version and test it with real people.",
        situation2Title: 'You started building with AI and got stuck',
        situation2Body: "The first version came out fast, but now the same errors keep coming back, nothing works outside your own computer, and nobody can explain what's inside it. We sort out what's already there and get it running properly.",
        situation3Title: 'The company grew and the work is scattered',
        situation3Body: "Information spread across Excel, WhatsApp and email. The team copies the same data twice, reports are built by hand, and nobody can see the whole operation. We bring it together into one system.",
        situationsClose: 'In all three cases the first step is the same: properly understanding what needs to happen.',

        // 4. How we help
        helpEyebrow: 'HOW WE HELP',
        helpH2: 'We organise first. We build after.',
        helpBody1: 'We start by understanding how your company works today, where time is lost, and what really needs to change.',
        helpBody2: 'Then we build a simple first version, put it into use, and improve it based on what actually happens day to day.',
        helpType1: 'Digitising a manual process',
        helpType2: 'Internal systems for your team',
        helpType3: 'Client portals',
        helpType4: "Connecting tools that don't talk to each other",
        helpType5: 'Reporting and tracking',
        helpType6: 'Picking up a stalled project',

        // 5. How we work
        processEyebrow: 'HOW WE WORK',
        processH2: 'Five steps. You see the result at each one.',
        processStep1Title: 'Understand',
        processStep1Desc: 'we talk to the people doing the work every day',
        processStep2Title: 'Organise',
        processStep2Desc: 'what needs doing, and in what order',
        processStep3Title: 'Build',
        processStep3Desc: "only what's needed to start using it",
        processStep4Title: 'Test',
        processStep4Desc: 'your team uses it, comments and signs off',
        processStep5Title: 'Improve',
        processStep5Desc: 'in stages, based on real use',
        processAnchor: "Every step produces something concrete to see, test and approve. You always know what's planned, what's being worked on, and what's been delivered.",

        // 6. Projects (Showcase)
        projectShowcaseKicker: 'PROJECTS',
        projectShowcaseHeading: 'Systems already in use every day.',
        projectShowcaseDescription: 'The problem that existed, what changed, and what the team can do now.',
        projectCaseLabel: 'Case',
        projectBuiltForLabel: 'Built for',
        projectSectorLabel: 'Sector',
        projectTimelineLabel: 'Timeline',
        projectStoryLabel: 'The story',
        projectSystemLabel: 'From problem to system',
        projectFinalResultLabel: 'Result in operation',
        projectRequestLabel: 'Client request',
        projectPainLabel: 'Starting situation',
        projectBusinessImpactLabel: 'Business impact',
        projectProcessLabel: 'How we built it',
        projectResultLabel: 'System delivered',
        projectOutcomesLabel: 'Final result',
        projectDailyUseLabel: 'How it runs today',
        projectCtaText: "Does this sound like your company? Tell us what's happening and we'll work out the best first step together.",
        projectCtaButton: 'Talk to the team',
        projectPrevAria: 'Previous project',
        projectNextAria: 'Next project',
        projectDotAriaPrefix: 'Project',

        // 7. What makes us different
        diffEyebrow: 'WHAT MAKES US DIFFERENT',
        diffH2: 'We start with the problem, not the technology.',
        diffPoint1: 'We understand before we build',
        diffPoint2: 'We start small and grow after',
        diffPoint3: 'You follow the work from start to finish',
        diffPoint4: 'The system is yours, with no dependency on us',
        diffAnchor: 'We use artificial intelligence to research, document, build and test faster. Decisions, priorities and quality stay with people.',
        diffNote: 'More speed in the doing, without handing responsibility to a tool.',

        // 8. Investment
        priceEyebrow: 'INVESTMENT',
        priceH2: 'Comfortable pricing, shaped around the reality of your business.',
        priceBody1: "Our projects usually come in at four-figure amounts. When it's just a matter of looking at a problem and working out what's going on, consulting starts at €200.",
        priceBody2: 'How you pay is agreed with you — in stages, as things get finished.',
        priceItem1: 'Consulting on a problem, from €200',
        priceItem2: 'Projects at four-figure amounts',
        priceItem3: 'Payment in stages, agreed with you',
        priceItem4: 'Fixed quote before we start',
        priceAnchor: "The first call is free and carries no obligation. It's there to understand the problem and tell you honestly what's worth doing.",
        priceNote: 'Once we understand what you need, you get a fixed quote — no hidden costs and no surprises halfway through.',

        // 9. FAQ
        faqH2: 'Questions we always get.',
        faq1Q: 'How long does it take?',
        faq1A: 'The first version is usually ready in 4 to 6 weeks. You get a concrete deadline in the quote.',
        faq2Q: 'Will I be dependent on you?',
        faq2A: 'No. The system and the source code are yours, and everything is written down so someone else can pick the work up.',
        faq3Q: "I can't explain exactly what I need. Is that a problem?",
        faq3A: 'No, that part is our job. Tell us what happens day to day and we translate it into something that can be built.',
        faq4Q: 'I already built something with AI. Can you take it over?',
        faq4A: 'Yes. We start by understanding what already exists, fix the essentials, and leave it stable enough to grow.',
        faq5Q: "What if my idea doesn't make sense?",
        faq5A: "We tell you. It's far cheaper to find that out in a conversation than after spending the money.",
        faq6Q: 'Do you work with small companies?',
        faq6A: "Yes, that's who we work with most of the time — small companies and teams, in Portugal and across Europe.",

        // 10. Invitation
        chatHeading: 'Tell us what needs improving.',
        inviteBody: "The first conversation is for understanding the problem. If building something makes sense, we explain the path and the cost. If it doesn't, we say that too.",
        inviteCta: 'Start the conversation',
        chatDescription: 'Describe your situation and leave your contact. Someone from the team replies to you directly.',
        chatGreeting: 'Tell us, in a few words, what is happening in your company.',
        inputPlaceholder: 'Type your message here...',
        sendBtn: 'Send',
        directContactLabel: 'Prefer to talk directly?',
        directWhatsapp: 'WhatsApp',
        directGmail: 'Write an email',
        directCopyEmail: 'Copy address',

        // Footer
        footerText: '\u00A9 2026 YourLab. All rights reserved.',
        footerContactShortcut: 'Contact card'
    },
    pt: {
        // Documento
        pageTitle: 'YourLab — Transformamos processos confusos em sistemas simples de usar',
        metaDescription: 'Testamos ideias, organizamos empresas e corrigimos aplicações. Primeira versão útil em semanas, com orçamento fechado antes de começar. Portugal e Europa.',

        // Header
        headerCta: 'Falar connosco',

        // 1. Hero
        heroH1: 'Transformamos processos confusos em sistemas simples de usar.',
        heroSub: 'Tem uma ideia para testar, um processo preso em folhas de cálculo e mensagens, ou uma aplicação que ficou a meio? Construímos a primeira versão útil em semanas — com orçamento fechado antes de começar.',
        heroCtaPrimary: 'Conte-nos o que precisa de melhorar',
        heroCtaSecondary: 'Ver como trabalhamos',
        heroMicrocopy: 'Primeira chamada gratuita e sem compromisso. Se não fizer sentido construir, dizemos-lhe isso.',

        // 2. Situações reconhecíveis
        situationsH2: 'Reconhece alguma destas situações?',
        situation1Title: 'Tem uma ideia e não sabe por onde começar',
        situation1Body: 'Sabe o problema que quer resolver, mas não sabe o que construir primeiro, quanto custa nem quanto tempo leva. Ajudamos a definir a primeira versão e a testá-la com pessoas reais.',
        situation2Title: 'Começou a construir com IA e ficou preso',
        situation2Body: 'A primeira versão saiu depressa, mas agora há erros que voltam sempre, nada funciona fora do seu computador e ninguém sabe explicar o que está lá dentro. Arrumamos o que já existe e deixamos aquilo a funcionar.',
        situation3Title: 'A empresa cresceu e o trabalho ficou espalhado',
        situation3Body: 'Informação em Excel, WhatsApp e e-mail. A equipa copia os mesmos dados, os relatórios são feitos à mão e ninguém consegue ver a operação toda. Juntamos isso num sistema só.',
        situationsClose: 'Em qualquer destes casos, o primeiro passo é o mesmo: entender bem o que precisa de acontecer.',

        // 4. Como ajudamos
        helpEyebrow: 'COMO AJUDAMOS',
        helpH2: 'Organizamos primeiro. Construímos depois.',
        helpBody1: 'Começamos por entender como a sua empresa trabalha hoje, onde se perde tempo e o que precisa mesmo de mudar.',
        helpBody2: 'Depois construímos uma primeira versão simples, colocamos em utilização e melhoramos com base no que acontece no dia a dia.',
        helpType1: 'Digitalizar um processo manual',
        helpType2: 'Sistemas internos para a equipa',
        helpType3: 'Portais para clientes',
        helpType4: 'Ligar ferramentas que não falam entre si',
        helpType5: 'Relatórios e acompanhamento',
        helpType6: 'Retomar um projeto parado',

        // 5. Como trabalhamos
        processEyebrow: 'COMO TRABALHAMOS',
        processH2: 'Cinco passos. Vê o resultado em cada um.',
        processStep1Title: 'Entendemos',
        processStep1Desc: 'falamos com quem faz o trabalho todos os dias',
        processStep2Title: 'Organizamos',
        processStep2Desc: 'o que precisa de ser feito, e por que ordem',
        processStep3Title: 'Construímos',
        processStep3Desc: 'só o essencial para já poder ser usado',
        processStep4Title: 'Testamos',
        processStep4Desc: 'a sua equipa usa, comenta e aprova',
        processStep5Title: 'Melhoramos',
        processStep5Desc: 'por etapas, com base no uso real',
        processAnchor: 'Em cada passo há algo concreto para ver, testar e aprovar. Sabe sempre o que está planeado, o que está a ser feito e o que já foi entregue.',

        // 6. Casos (Project Showcase)
        projectShowcaseKicker: 'PROJETOS',
        projectShowcaseHeading: 'Sistemas que já estão a ser usados todos os dias.',
        projectShowcaseDescription: 'O problema que existia, o que mudou, e o que a equipa consegue fazer agora.',
        projectCaseLabel: 'Caso',
        projectBuiltForLabel: 'Construído para',
        projectSectorLabel: 'Setor',
        projectTimelineLabel: 'Prazo',
        projectStoryLabel: 'A história',
        projectSystemLabel: 'Da dor ao sistema',
        projectFinalResultLabel: 'Resultado em operação',
        projectRequestLabel: 'Pedido do cliente',
        projectPainLabel: 'Situação inicial',
        projectBusinessImpactLabel: 'Impacto no negócio',
        projectProcessLabel: 'Como construímos',
        projectResultLabel: 'Sistema entregue',
        projectOutcomesLabel: 'Resultado final',
        projectDailyUseLabel: 'Como funciona no dia a dia',
        projectCtaText: 'Reconhece esta situação na sua empresa? Conte-nos o que está a acontecer e vemos juntos qual é o melhor caminho.',
        projectCtaButton: 'Falar com a equipa',
        projectPrevAria: 'Projeto anterior',
        projectNextAria: 'Próximo projeto',
        projectDotAriaPrefix: 'Projeto',

        // 7. O que nos torna diferentes
        diffEyebrow: 'O QUE NOS TORNA DIFERENTES',
        diffH2: 'Começamos pelo problema, não pela tecnologia.',
        diffPoint1: 'Entendemos antes de construir',
        diffPoint2: 'Começamos pequeno e crescemos depois',
        diffPoint3: 'Acompanha o trabalho do início ao fim',
        diffPoint4: 'O sistema fica seu, sem ficar dependente de nós',
        diffAnchor: 'Usamos inteligência artificial para pesquisar, documentar, construir e testar mais depressa. As decisões, as prioridades e a qualidade continuam com pessoas.',
        diffNote: 'Mais velocidade na execução, sem passar a responsabilidade para uma ferramenta.',

        // 8. Investimento
        priceEyebrow: 'INVESTIMENTO',
        priceH2: 'Preços confortáveis, ajustados à realidade do seu negócio.',
        priceBody1: 'Os nossos projetos ficam normalmente em valores de quatro dígitos. Quando é só para olhar para um problema e perceber o que está a acontecer, a consultoria começa nos 200 €.',
        priceBody2: 'A forma de pagamento é combinada consigo — por etapas, à medida que as coisas ficam prontas.',
        priceItem1: 'Consultoria para um problema, desde 200 €',
        priceItem2: 'Projetos em valores de quatro dígitos',
        priceItem3: 'Pagamento por etapas, combinado consigo',
        priceItem4: 'Orçamento fechado antes de começar',
        priceAnchor: 'A primeira chamada é gratuita e sem compromisso. Serve para entender o problema e dizer-lhe, com honestidade, o que faz sentido fazer.',
        priceNote: 'Depois de percebermos o que precisa, recebe um orçamento fechado — sem custos escondidos e sem surpresas a meio do trabalho.',

        // 9. Perguntas frequentes
        faqH2: 'Perguntas que nos fazem sempre.',
        faq1Q: 'Quanto tempo leva?',
        faq1A: 'A primeira versão costuma ficar pronta em 4 a 6 semanas. Damos-lhe um prazo concreto no orçamento.',
        faq2Q: 'Fico dependente de vocês?',
        faq2A: 'Não. O sistema e o código são seus, e fica tudo escrito para que outra pessoa consiga continuar o trabalho.',
        faq3Q: 'Não sei explicar bem o que preciso. É problema?',
        faq3A: 'Não, essa parte é o nosso trabalho. Conte o que acontece no dia a dia e nós traduzimos isso em algo que pode ser construído.',
        faq4Q: 'Já construí algo com IA. Conseguem pegar nisso?',
        faq4A: 'Sim. Começamos por entender o que já existe, corrigimos o essencial e deixamos aquilo estável para poder crescer.',
        faq5Q: 'E se a minha ideia não fizer sentido?',
        faq5A: 'Dizemos-lhe. É muito mais barato descobrir isso numa conversa do que depois de investir.',
        faq6Q: 'Trabalham com empresas pequenas?',
        faq6A: 'Sim, é com quem trabalhamos a maior parte do tempo — empresas e equipas pequenas, em Portugal e no resto da Europa.',

        // 10. Convite final
        chatHeading: 'Conte-nos o que precisa de melhorar.',
        inviteBody: 'A primeira conversa serve para entender o problema. Se fizer sentido construir alguma coisa, explicamos o caminho e o custo. Se não fizer, dizemos isso também.',
        inviteCta: 'Começar a conversa',
        chatDescription: 'Descreva a situação da sua empresa e deixe o seu contacto. Alguém da equipa responde-lhe diretamente.',
        chatGreeting: 'Conte-nos, em poucas palavras, o que está a acontecer na sua empresa.',
        inputPlaceholder: 'Escreva a sua mensagem aqui...',
        sendBtn: 'Enviar',
        directContactLabel: 'Prefere falar diretamente?',
        directWhatsapp: 'WhatsApp',
        directGmail: 'Escrever email',
        directCopyEmail: 'Copiar endereço',

        // Footer
        footerText: '© 2026 YourLab. Todos os direitos reservados.',
        footerContactShortcut: 'Cartão de contacto'
    }
};

function setLanguage(lang) {
    currentLang = lang;
    localStorage.setItem('yourlab_lang_v2', lang);
    document.documentElement.lang = lang;
    document.title = translations[lang].pageTitle;

    const description = document.querySelector('meta[name="description"]');
    if (description) description.setAttribute('content', translations[lang].metaDescription);

    // Keeps the address bar in sync so the page can be shared in the language being read.
    if (window.history && window.history.replaceState) {
        const url = new URL(window.location.href);
        if (url.searchParams.get('lang') !== lang) {
            url.searchParams.set('lang', lang);
            window.history.replaceState({}, '', url);
        }
    }

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

    document.dispatchEvent(new CustomEvent('yourlab:language-changed', { detail: { lang } }));
}

// Language toggle click handler
document.getElementById('langToggle').addEventListener('click', () => {
    setLanguage(currentLang === 'en' ? 'pt' : 'en');
});

// Apply saved language on load
setLanguage(currentLang);

// ===== Projects Showcase =====
// Source of truth is the Admin Dashboard + backend API.
// This local array is only a fallback used if the API is unavailable.
const projectShowcaseData = [];

function normalizeProjectShowcaseCollection(input) {
    const asArray = Array.isArray(input) ? input : [input];

    function cleanText(value, max = 600) {
        if (typeof value !== 'string') return '';
        return value.trim().replace(/\s+/g, ' ').slice(0, max);
    }

    function firstAvailable(source, keys, fallback = '') {
        for (const key of keys) {
            const value = source[key];
            if (value == null) continue;
            if (typeof value === 'string' && value.trim()) return value;
            if (typeof value === 'object') return value;
            if (Array.isArray(value) && value.length) return value;
        }
        return fallback;
    }

    function pickLangValue(value, fallback = '') {
        if (typeof value === 'string') {
            const text = cleanText(value, 600);
            return { pt: text, en: text };
        }
        if (!value || typeof value !== 'object') {
            return { pt: fallback, en: fallback };
        }

        const pt = typeof value.pt === 'string'
            ? cleanText(value.pt, 600)
            : typeof value.en === 'string'
                ? cleanText(value.en, 600)
                : fallback;
        const en = typeof value.en === 'string'
            ? cleanText(value.en, 600)
            : typeof value.pt === 'string'
                ? cleanText(value.pt, 600)
                : fallback;

        return { pt, en };
    }

    function normalizeListItems(items = []) {
        return items
            .map((item) => cleanText(String(item || ''), 320))
            .filter(Boolean);
    }

    function pickLangList(value, fallback = []) {
        if (Array.isArray(value)) {
            const list = normalizeListItems(value);
            return { pt: [...list], en: [...list] };
        }
        if (typeof value === 'string') {
            const item = cleanText(value, 320);
            const list = item ? [item] : [];
            return { pt: [...list], en: [...list] };
        }
        if (!value || typeof value !== 'object') {
            const fallbackList = normalizeListItems(fallback);
            return { pt: [...fallbackList], en: [...fallbackList] };
        }

        const sourcePt = Array.isArray(value.pt)
            ? value.pt
            : typeof value.pt === 'string'
                ? [value.pt]
                : [];
        const sourceEn = Array.isArray(value.en)
            ? value.en
            : typeof value.en === 'string'
                ? [value.en]
                : [];
        const shared = normalizeListItems(fallback);
        const pt = sourcePt.length ? sourcePt : (sourceEn.length ? sourceEn : shared);
        const en = sourceEn.length ? sourceEn : (sourcePt.length ? sourcePt : shared);

        return {
            pt: normalizeListItems(pt),
            en: normalizeListItems(en)
        };
    }

    return asArray
        .map((entry, index) => {
            if (!entry || typeof entry !== 'object') return null;

            // Supports both:
            // 1) direct project object
            // 2) wrapped agent output { operation, target_id, project: { ... } }
            const source = (entry.project && typeof entry.project === 'object')
                ? entry.project
                : entry;

            const title = pickLangValue(firstAvailable(source, ['title', 'name', 'projectTitle', 'caseTitle', 'headline'], ''));
            const hasRenderableTitle = Boolean((title.pt || '').trim() || (title.en || '').trim());
            if (!hasRenderableTitle) return null;

            const solutionDeliveredRaw = firstAvailable(
                source,
                ['solutionDelivered', 'finalResult', 'solution', 'deliverables', 'delivery'],
                []
            );
            const solutionDelivered = Array.isArray(solutionDeliveredRaw) || (
                solutionDeliveredRaw && typeof solutionDeliveredRaw === 'object' && (
                    Array.isArray(solutionDeliveredRaw.pt) || Array.isArray(solutionDeliveredRaw.en)
                )
            )
                ? pickLangList(solutionDeliveredRaw)
                : pickLangList([]);

            const finalResultAsText = pickLangValue(firstAvailable(source, ['finalResult'], ''));
            if (!solutionDelivered.pt.length && (finalResultAsText.pt || '').trim()) {
                solutionDelivered.pt = [finalResultAsText.pt];
            }
            if (!solutionDelivered.en.length && (finalResultAsText.en || '').trim()) {
                solutionDelivered.en = [finalResultAsText.en];
            }

            const rawId = typeof source.id === 'string' && source.id.trim()
                ? source.id.trim().toLowerCase()
                : `project-${index + 1}`;
            const normalizedId = rawId
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-+|-+$/g, '') || `project-${index + 1}`;

            return {
                id: normalizedId,
                title,
                clientProfile: pickLangValue(firstAvailable(source, ['clientProfile', 'client', 'audience', 'targetClient', 'customerProfile'], '')),
                sector: pickLangValue(firstAvailable(source, ['sector', 'industry', 'market', 'vertical'], '')),
                timeline: pickLangValue(firstAvailable(source, ['timeline', 'duration', 'deliveryWindow'], '')),
                strategicRequest: pickLangValue(firstAvailable(source, ['strategicRequest', 'request', 'objective', 'goal', 'challenge'], '')),
                painSnapshot: pickLangValue(firstAvailable(source, ['painSnapshot', 'requestPain', 'pain', 'problem', 'initialPain'], '')),
                businessImpact: pickLangValue(firstAvailable(source, ['businessImpact', 'impact', 'painImpact', 'risk'], '')),
                approach: pickLangList(firstAvailable(source, ['approach', 'processProposal', 'process', 'execution', 'steps'], [])),
                solutionDelivered,
                results: pickLangList(firstAvailable(source, ['results', 'outcomes', 'result', 'kpis'], [])),
                dailyUse: pickLangList(firstAvailable(source, ['dailyUse', 'operations', 'dayToDay', 'adoption'], [])),
                ctaText: pickLangValue(firstAvailable(source, ['ctaText', 'cta', 'callToAction'], ''))
            };
        })
        .filter(Boolean);
}

(function initProjectShowcase() {
    const wrapper = document.querySelector('[data-project-showcase]');
    if (!wrapper) return;

    const slidesEl = wrapper.querySelector('[data-project-slides]');
    const dotsEl = wrapper.querySelector('[data-project-dots]');
    const prevBtn = wrapper.querySelector('[data-project-prev]');
    const nextBtn = wrapper.querySelector('[data-project-next]');
    if (!slidesEl || !dotsEl) return;

    let normalizedProjects = normalizeProjectShowcaseCollection(projectShowcaseData);
    const apiBase = (window.YOURLAB_API_URL || '').replace(/\/$/, '');

    let current = 0;
    let touchStartX = 0;

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function t(key) {
        return (translations[currentLang] && translations[currentLang][key]) || key;
    }

    function textFor(valueByLang) {
        if (!valueByLang || typeof valueByLang !== 'object') return '';
        return valueByLang[currentLang] || valueByLang.pt || valueByLang.en || '';
    }

    function listFor(valueByLang) {
        const selected = textFor(valueByLang);
        return Array.isArray(selected) ? selected : [];
    }

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function twoDigits(value) {
        return String(value).padStart(2, '0');
    }

    function totalProjects() {
        return normalizedProjects.length;
    }

    function setEmptyState() {
        slidesEl.innerHTML = '';
        dotsEl.innerHTML = '';
        if (prevBtn) {
            prevBtn.disabled = true;
            prevBtn.classList.add('is-disabled');
        }
        if (nextBtn) {
            nextBtn.disabled = true;
            nextBtn.classList.add('is-disabled');
        }
    }

    function render() {
        const total = totalProjects();
        if (!total) {
            setEmptyState();
            return;
        }

        slidesEl.innerHTML = normalizedProjects.map((project, index) => {
            const approachSteps = listFor(project.approach);
            const deliveredItems = listFor(project.solutionDelivered);
            const resultPoints = listFor(project.results);
            const dailyUsePoints = listFor(project.dailyUse);
            const isActive = index === current;
            const ctaLine = textFor(project.ctaText) || t('projectCtaText');
            const requestText = textFor(project.strategicRequest);
            const painText = textFor(project.painSnapshot);
            const impactText = textFor(project.businessImpact);

            const renderList = (items) => items
                .map((item) => `<li>${escapeHtml(item)}</li>`)
                .join('');

            const storySections = [
                requestText ? `<p><strong>${t('projectRequestLabel')}:</strong> ${escapeHtml(requestText)}</p>` : '',
                painText ? `<p><strong>${t('projectPainLabel')}:</strong> ${escapeHtml(painText)}</p>` : '',
                impactText ? `<p><strong>${t('projectBusinessImpactLabel')}:</strong> ${escapeHtml(impactText)}</p>` : ''
            ].join('');

            const systemSections = [
                approachSteps.length
                    ? `<h5>${t('projectProcessLabel')}</h5><ul>${renderList(approachSteps)}</ul>`
                    : '',
                deliveredItems.length
                    ? `<h5>${t('projectResultLabel')}</h5><ul>${renderList(deliveredItems)}</ul>`
                    : ''
            ].join('');

            const outcomeSections = [
                resultPoints.length
                    ? `<h5>${t('projectOutcomesLabel')}</h5><ul>${renderList(resultPoints)}</ul>`
                    : '',
                dailyUsePoints.length
                    ? `<h5>${t('projectDailyUseLabel')}</h5><ul>${renderList(dailyUsePoints)}</ul>`
                    : ''
            ].join('');

            return `
                <article class="project-case-slide ${isActive ? 'active' : ''}" data-project-index="${index}" aria-hidden="${String(!isActive)}">
                    <header class="project-case-header">
                        <p class="project-case-index">${twoDigits(index + 1)} / ${twoDigits(total)}</p>
                        <div>
                            <p class="project-case-kicker">${t('projectCaseLabel')} ${index + 1}</p>
                            <h3>${escapeHtml(textFor(project.title))}</h3>
                            <p class="project-case-subtitle"><strong>${t('projectBuiltForLabel')}:</strong> ${escapeHtml(textFor(project.clientProfile))}</p>
                        </div>
                    </header>

                    <div class="project-case-meta">
                        <span class="project-meta-chip"><strong>${t('projectSectorLabel')}:</strong> ${escapeHtml(textFor(project.sector))}</span>
                        <span class="project-meta-chip"><strong>${t('projectTimelineLabel')}:</strong> ${escapeHtml(textFor(project.timeline))}</span>
                    </div>

                    <div class="project-case-grid">
                        <article class="project-case-block project-case-story">
                            <h4>${t('projectStoryLabel')}</h4>
                            ${storySections || `<p>${escapeHtml(ctaLine)}</p>`}
                        </article>

                        <article class="project-case-block">
                            <h4>${t('projectSystemLabel')}</h4>
                            ${systemSections || `<p>${escapeHtml(requestText || ctaLine)}</p>`}
                        </article>

                        <article class="project-case-block">
                            <h4>${t('projectFinalResultLabel')}</h4>
                            ${outcomeSections || `<p>${escapeHtml(ctaLine)}</p>`}
                        </article>
                    </div>

                    <div class="project-case-cta">
                        <p>${escapeHtml(ctaLine)}</p>
                        <a class="project-case-cta-link" href="#chatForm">${t('projectCtaButton')}</a>
                    </div>
                </article>
            `;
        }).join('');

        dotsEl.innerHTML = normalizedProjects.map((_, index) => `
            <button
                type="button"
                class="project-showcase-dot ${index === current ? 'active' : ''}"
                data-project-dot="${index}"
                aria-label="${t('projectDotAriaPrefix')} ${index + 1}">
            </button>
        `).join('');

        dotsEl.querySelectorAll('[data-project-dot]').forEach((dot) => {
            dot.addEventListener('click', () => {
                const index = Number.parseInt(dot.dataset.projectDot || '0', 10);
                goTo(index);
            });
        });

        if (prevBtn) {
            prevBtn.disabled = current === 0;
            prevBtn.classList.toggle('is-disabled', current === 0);
            prevBtn.setAttribute('aria-label', t('projectPrevAria'));
        }

        if (nextBtn) {
            nextBtn.disabled = current === (total - 1);
            nextBtn.classList.toggle('is-disabled', current === (total - 1));
            nextBtn.setAttribute('aria-label', t('projectNextAria'));
        }
    }

    function goTo(index) {
        const total = totalProjects();
        if (!total) return;
        current = clamp(index, 0, total - 1);
        render();
    }

    async function loadProjectsFromApi() {
        try {
            const response = await fetch(`${apiBase}/api/project-showcase`, {
                method: 'GET'
            });
            if (!response.ok) return;

            const payload = await response.json();
            const fromApi = normalizeProjectShowcaseCollection(payload && payload.projects ? payload.projects : []);
            normalizedProjects = fromApi;
            current = fromApi.length ? clamp(current, 0, fromApi.length - 1) : 0;
            render();
        } catch (_) {
            // Keep local fallback data silently if API is unavailable
        }
    }

    if (prevBtn) {
        prevBtn.addEventListener('click', () => goTo(current - 1));
    }
    if (nextBtn) {
        nextBtn.addEventListener('click', () => goTo(current + 1));
    }

    wrapper.addEventListener('touchstart', (event) => {
        touchStartX = event.changedTouches[0].screenX;
    }, { passive: true });

    wrapper.addEventListener('touchend', (event) => {
        const diff = event.changedTouches[0].screenX - touchStartX;
        if (Math.abs(diff) < 50) return;
        if (diff < 0) {
            goTo(current + 1);
        } else {
            goTo(current - 1);
        }
    }, { passive: true });

    document.addEventListener('yourlab:language-changed', () => {
        render();
    });

    render();
    loadProjectsFromApi();
})();

const chatForm = document.getElementById('chatForm');
const userInput = document.getElementById('userInput');
const chatMessages = document.getElementById('chatMessages');

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

function saveConversationLocally(payload) {
    const conversations = JSON.parse(localStorage.getItem('yourlab_conversations') || '[]');
    conversations.push(payload);
    localStorage.setItem('yourlab_conversations', JSON.stringify(conversations));
}

// ===== Conversation engine =====
// Deliberately rule-based: no language model, no server round-trip for replies.
// The value here is the sequence of questions, which is fixed and predictable —
// the same questions a person would ask on a first call. Only the finished lead
// is sent to the server, so the team gets notified by email.

const CHAT_TRACK_STEPS = {
    idea: ['ideaWhat', 'ideaTalked', 'ideaFirst'],
    stuck: ['stuckTool', 'stuckBreaks', 'stuckUsers'],
    ops: ['opsProcess', 'opsPeople', 'opsWhere']
};
const CHAT_COMMON_STEPS = ['timing', 'name', 'contact', 'recap'];

const chatCopy = {
    pt: {
        route: 'Só para eu perceber melhor — qual destes está mais perto do seu caso?',
        routeChips: ['Tenho uma ideia por começar', 'Construí algo e está preso', 'A empresa está desorganizada'],
        openers: {
            idea: 'Boa. É o melhor momento para pensar nisto — antes de gastar dinheiro.',
            stuck: 'Isso acontece mais vezes do que se imagina. Costuma dar-se a volta.',
            ops: 'Normalmente é sinal de que a empresa cresceu mais depressa do que os processos.'
        },
        ask: {
            ideaWhat: 'Conte-me a ideia em duas linhas: que problema resolve, e para quem?',
            ideaTalked: 'Já falou com alguém que tem esse problema?',
            ideaFirst: 'Se só uma coisa pudesse funcionar na primeira versão, qual seria?',
            stuckTool: 'Com que ferramenta é que aquilo foi construído?',
            stuckBreaks: 'O que é que falha exatamente?',
            stuckUsers: 'Já há alguém a usar isso a sério?',
            opsProcess: 'Qual é o processo que dá mais dores de cabeça hoje?',
            opsPeople: 'Quantas pessoas mexem nisso, e com que frequência?',
            opsWhere: 'Onde é que a informação vive agora?',
            timing: 'Para quando gostaria de ter isto resolvido?',
            name: 'Como se chama?',
            contact: 'E o melhor contacto para lhe responder — email ou telemóvel?',
            recap: 'Está certo assim?'
        },
        chips: {
            ideaTalked: ['Sim, já falei', 'Ainda não', 'Só com pessoas próximas'],
            stuckTool: ['ChatGPT ou Claude', 'Cursor, Lovable ou parecido', 'Contratei alguém', 'Outra coisa'],
            stuckUsers: ['Já há pessoas a usar', 'Só no meu computador', 'Parou a meio'],
            opsWhere: ['Excel', 'WhatsApp e email', 'Papel', 'Um sistema antigo'],
            timing: ['O quanto antes', 'Nas próximas semanas', 'Ainda estou a explorar'],
            recap: ['Está certo', 'Quero corrigir']
        },
        retry: {
            ideaWhat: 'Ajude-me com um pouco mais: o que é que a pessoa não consegue fazer hoje?',
            ideaFirst: 'Pense na coisa mais simples que já valia a pena — só essa.',
            stuckBreaks: 'Descreva como se estivesse a contar a um amigo: o que acontece quando falha?',
            opsProcess: 'Por exemplo: encomendas, turnos, orçamentos, faturação, marcações.',
            opsPeople: 'Um número aproximado serve — duas pessoas? dez? todos os dias?',
            name: 'Só o primeiro nome basta.',
            contact: 'Preciso de um email ou de um número para lhe responder.'
        },
        ack: {
            generic: ['Percebo.', 'Certo.', 'Isso faz sentido.', 'Já vi isto antes.'],
            excel: 'Excel — clássico. Funciona até deixar de funcionar.',
            whatsapp: 'Quando as decisões vivem no WhatsApp, ninguém consegue ver o todo.',
            paper: 'Papel ainda é mais comum do que se pensa.',
            legacy: 'Sistemas antigos costumam obrigar a inventar atalhos.',
            billing: 'Orçamentos e faturas à mão são dos sítios onde se perde mais tempo.',
            orders: 'Encomendas e stock são fáceis de descontrolar quando o volume sobe.',
            shifts: 'Turnos e horários costumam ser a maior dor de cabeça semanal.',
            bookings: 'Marcações mal organizadas custam clientes sem ninguém notar.',
            soon: 'Semanas é um prazo realista para ter a primeira versão a funcionar.',
            aiTool: 'Isso explica muita coisa — sai depressa, mas ninguém fica a saber o que está lá dentro.',
            hired: 'Acontece muito: quem construiu foi-se embora e o conhecimento foi com ele.',
            alone: 'Enquanto ninguém usa, ainda dá para arrumar sem stress.',
            inUse: 'Estar em uso muda as prioridades — primeiro estabilizar, depois melhorar.',
            notTalked: 'Vale a pena testar isso cedo. É mais barato que construir e descobrir depois.',
            talked: 'Ótimo. Isso poupa meio caminho.',
            urgent: 'Anotado que é urgente.',
            exploring: 'Explorar também é um bom sítio para começar. Sem pressa.'
        },
        faq: {
            price: 'A resposta honesta é: depende. A consultoria para olhar um problema começa nos 200 €, e os projetos ficam normalmente em valores de quatro dígitos. A primeira chamada é gratuita.',
            time: 'A primeira versão costuma ficar pronta em 4 a 6 semanas, e o prazo concreto vai no orçamento.',
            lockin: 'O sistema e o código ficam seus, e fica tudo escrito para outra pessoa poder continuar.',
            who: 'Somos uma equipa pequena, a trabalhar de Portugal para clientes em Portugal e no resto da Europa.',
            how: 'Primeiro entendemos, depois organizamos, e só depois construímos — por etapas, para ver resultado cedo.',
            bot: 'Nem robô, nem inteligência artificial. Mas guardo a explicação completa para o fim da conversa.',
            human: 'Claro. WhatsApp 927 319 412 ou yourlabpt@gmail.com — e continuo aqui se preferir escrever.',
            dontKnow: 'Sem problema, isso é normal. Diga só o que nota no dia a dia: quem se queixa, o que atrasa.',
            thanks: 'De nada.'
        },
        back: 'Voltando ao que interessa:',
        recapIntro: 'Deixe-me resumir, para garantir que entendi:',
        recapLabels: {
            situation: 'Situação',
            ideaWhat: 'A ideia',
            ideaTalked: 'Já falou com alguém',
            ideaFirst: 'Primeira versão',
            stuckTool: 'Construído com',
            stuckBreaks: 'O que falha',
            stuckUsers: 'Em uso',
            opsProcess: 'Processo',
            opsPeople: 'Quem e com que frequência',
            opsWhere: 'Onde está a informação',
            timing: 'Prazo',
            contact: 'Contacto'
        },
        tracks: {
            idea: 'uma ideia por começar',
            stuck: 'algo construído que ficou preso',
            ops: 'uma empresa a precisar de organização'
        },
        nameAck: (name) => `Muito bem, ${name}.`,
        correct: 'Diga-me o que está errado e eu corrijo.',
        saved: (name) => `Ficou registado${name ? `, ${name}` : ''}. Uma pessoa da equipa responde-lhe diretamente — não é resposta automática.`,
        savedNote: 'A primeira conversa é gratuita e serve para entender o problema. Se não fizer sentido construir nada, também lhe dizemos isso.',
        joke1: 'Ah, e uma confissão antes de ir: esta conversa não teve inteligência artificial nenhuma. Nem um bocadinho.',
        joke2: 'Sou algumas centenas de linhas de código, escritas por alguém que já teve esta conversa muitas vezes e sabe que perguntas fazer. Sem modelo, sem agente, sem nuvem.',
        joke3: 'E correu bem, não correu? É precisamente esse o ponto: quase nunca falta tecnologia — falta alguém perceber o problema primeiro. 🙂',
        after: 'Se quiser acrescentar mais alguma coisa, escreva. Fica tudo no mesmo registo.',
        afterAcks: [
            'Anotado, isso vai junto com o resto.',
            'Também fica registado, obrigado.',
            'Guardado. Daqui para a frente é melhor falarmos a sério: WhatsApp 927 319 412 ou yourlabpt@gmail.com.'
        ]
    },
    en: {
        route: 'Just so I understand — which of these is closest to your case?',
        routeChips: ['I have an idea, not started yet', "I built something and it's stuck", 'The company is disorganised'],
        openers: {
            idea: 'Good. This is the best moment to think it through — before spending money.',
            stuck: "That happens more often than people think. It's usually fixable.",
            ops: 'Usually that means the company grew faster than its processes.'
        },
        ask: {
            ideaWhat: 'Tell me the idea in two lines: what problem does it solve, and for whom?',
            ideaTalked: 'Have you spoken to anyone who has that problem?',
            ideaFirst: 'If only one thing could work in the first version, what would it be?',
            stuckTool: 'What was it built with?',
            stuckBreaks: 'What exactly breaks?',
            stuckUsers: 'Is anyone actually using it yet?',
            opsProcess: 'Which process causes the most headaches today?',
            opsPeople: 'How many people touch it, and how often?',
            opsWhere: 'Where does the information live right now?',
            timing: 'When would you like this sorted?',
            name: 'What should I call you?',
            contact: 'And the best way to reach you — email or phone?',
            recap: 'Is that right?'
        },
        chips: {
            ideaTalked: ['Yes, I have', 'Not yet', 'Only with people close to me'],
            stuckTool: ['ChatGPT or Claude', 'Cursor, Lovable or similar', 'I hired someone', 'Something else'],
            stuckUsers: ['People are using it', 'Only on my computer', 'It stalled halfway'],
            opsWhere: ['Excel', 'WhatsApp and email', 'Paper', 'An old system'],
            timing: ['As soon as possible', 'In the next few weeks', 'Still exploring'],
            recap: ["That's right", 'I want to correct something']
        },
        retry: {
            ideaWhat: "Help me a little more: what can't that person do today?",
            ideaFirst: 'Think of the simplest thing that would already be worth it — just that one.',
            stuckBreaks: 'Describe it like you would to a friend: what happens when it fails?',
            opsProcess: 'For example: orders, shifts, quotes, invoicing, bookings.',
            opsPeople: 'A rough number is fine — two people? ten? every day?',
            name: 'A first name is enough.',
            contact: 'I need an email or a phone number to get back to you.'
        },
        ack: {
            generic: ['I see.', 'Right.', 'That makes sense.', "I've seen this before."],
            excel: "Excel — a classic. It works until it doesn't.",
            whatsapp: 'When decisions live in WhatsApp, nobody can see the whole picture.',
            paper: 'Paper is still more common than people admit.',
            legacy: 'Old systems usually force people to invent workarounds.',
            billing: 'Quotes and invoices by hand are where most time quietly disappears.',
            orders: 'Orders and stock get out of hand quickly once volume goes up.',
            shifts: 'Shifts and schedules are usually the biggest weekly headache.',
            bookings: 'Badly organised bookings cost clients without anyone noticing.',
            soon: 'A few weeks is a realistic window for a first working version.',
            aiTool: "That explains a lot — it comes out fast, but nobody ends up knowing what's inside.",
            hired: 'Happens often: whoever built it left, and the knowledge went with them.',
            alone: 'While nobody is using it, it can still be sorted out calmly.',
            inUse: 'Being in use changes the priorities — stabilise first, improve after.',
            notTalked: 'Worth testing that early. Cheaper than building and finding out later.',
            talked: 'Good. That saves half the work.',
            urgent: "Noted, it's urgent.",
            exploring: 'Exploring is a fine place to start. No rush.'
        },
        faq: {
            price: 'The honest answer is: it depends. Consulting on a problem starts at €200, and projects usually come in at four-figure amounts. The first call is free.',
            time: 'The first version is usually ready in 4 to 6 weeks, and the exact deadline goes in the quote.',
            lockin: 'The system and the code stay yours, and everything is written down so someone else can carry on.',
            who: "We're a small team, working from Portugal for clients in Portugal and across Europe.",
            how: 'First we understand, then we organise, and only then we build — in stages, so you see results early.',
            bot: "Neither a robot nor artificial intelligence. But I'm saving the full explanation for the end of this conversation.",
            human: "Of course. WhatsApp +351 927 319 412 or yourlabpt@gmail.com — and I'm still here if you'd rather type.",
            dontKnow: "No problem, that's normal. Just tell me what you notice day to day: who complains, what runs late.",
            thanks: "You're welcome."
        },
        back: 'Back to what matters:',
        recapIntro: 'Let me summarise, to make sure I understood:',
        recapLabels: {
            situation: 'Situation',
            ideaWhat: 'The idea',
            ideaTalked: 'Talked to anyone',
            ideaFirst: 'First version',
            stuckTool: 'Built with',
            stuckBreaks: 'What breaks',
            stuckUsers: 'In use',
            opsProcess: 'Process',
            opsPeople: 'Who and how often',
            opsWhere: 'Where the information lives',
            timing: 'Timing',
            contact: 'Contact'
        },
        tracks: {
            idea: 'an idea not started yet',
            stuck: 'something built that got stuck',
            ops: 'a company that needs organising'
        },
        nameAck: (name) => `Good to meet you, ${name}.`,
        correct: "Tell me what's wrong and I'll fix it.",
        saved: (name) => `It's on record${name ? `, ${name}` : ''}. Someone from the team will reply to you directly — not an automated answer.`,
        savedNote: 'The first conversation is free and exists to understand the problem. If building makes no sense, we will tell you that too.',
        joke1: 'Oh, and a confession before you go: there was no artificial intelligence in this conversation. Not a drop.',
        joke2: "I'm a few hundred lines of code, written by someone who has had this conversation many times and knows which questions to ask. No model, no agent, no cloud.",
        joke3: "And it went well, didn't it? That's exactly the point: technology is rarely the thing that's missing — someone understanding the problem first usually is. 🙂",
        after: 'If you want to add anything else, type it. It goes into the same record.',
        afterAcks: [
            'Noted, that goes in with the rest.',
            'Recorded as well, thank you.',
            'Saved. From here it is better to talk properly: WhatsApp +351 927 319 412 or yourlabpt@gmail.com.'
        ]
    }
};

const chatState = {
    track: '',
    step: 'route',
    stepQueue: [],
    retries: 0,
    answers: {},
    contact: { name: '', email: '', phone: '' },
    messages: [],
    lastAck: '',
    extras: 0,
    submitted: false,
    additionSaved: false,
    correcting: false
};

function chatText() {
    return chatCopy[currentLang] || chatCopy.pt;
}

function normalizeChatText(value) {
    return (value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

function chatPickRandom(list) {
    return list[Math.floor(Math.random() * list.length)];
}

function chatExtractEmail(text) {
    const match = (text || '').match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/);
    return match ? match[0].toLowerCase() : '';
}

function chatExtractPhone(text) {
    const match = (text || '').match(/(?:\+?\d[\d\s().-]{6,}\d)/);
    if (!match) return '';
    const digits = match[0].replace(/\D/g, '');
    return digits.length >= 8 && digits.length <= 16 ? match[0].trim() : '';
}

// Words that show up in answers to the other questions, so they can never be a name.
const CHAT_NOT_A_NAME = new Set([
    'o', 'a', 'os', 'as', 'e', 'de', 'da', 'do', 'em', 'sim', 'nao', 'ok', 'talvez',
    'quanto', 'antes', 'agora', 'hoje', 'amanha', 'semanas', 'semana', 'proximas', 'meses', 'dias',
    'excel', 'whatsapp', 'email', 'papel', 'sistema', 'antigo', 'outra', 'coisa',
    'chatgpt', 'claude', 'gemini', 'cursor', 'lovable', 'bolt', 'replit',
    'contratei', 'alguem', 'pessoas', 'pessoa', 'usar', 'computador', 'meu', 'parou', 'meio',
    'ainda', 'estou', 'explorar', 'certo', 'esta', 'quero', 'corrigir', 'falei', 'proximos',
    'obrigado', 'obrigada', 'ola', 'oi', 'bom', 'boa', 'dia', 'tarde', 'noite', 'empresa',
    'hi', 'hello', 'hey', 'yes', 'no', 'not', 'yet', 'asap', 'soon', 'possible', 'weeks',
    'next', 'few', 'still', 'exploring', 'right', 'correct', 'want', 'something', 'people',
    'using', 'only', 'computer', 'stalled', 'halfway', 'else', 'hired', 'someone', 'similar',
    'paper', 'old', 'system', 'and', 'the', 'that', 'is', 'with', 'close', 'me', 'have', 'or'
]);

function chatExtractName(text) {
    const cleaned = (text || '')
        .replace(/(?:o meu nome e|meu nome e|chamo-me|chamo me|sou o|sou a|eu sou|my name is|i am|i'm|call me|this is)/i, ' ')
        .replace(/[^A-Za-zÀ-ÿ' -]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    if (!cleaned) return '';
    const tokens = cleaned.split(' ').filter((token) => token.length >= 2 && token.length <= 24);
    if (!tokens.length || tokens.length > 4) return '';
    if (tokens.some((token) => CHAT_NOT_A_NAME.has(normalizeChatText(token)))) return '';
    return tokens
        .slice(0, 3)
        .map((token) => token.charAt(0).toUpperCase() + token.slice(1).toLowerCase())
        .join(' ');
}

// ── Routing: which of the three doors on the page is this person coming through?
function chatDetectTrack(text) {
    const value = normalizeChatText(text);
    if (!value) return '';

    const ideaHints = /\b(ideia|idea|comecar|come[cç]ar|start|startup|validar|validate|testar|test|nova|new|do zero|from scratch|lancar|launch|projeto novo|mvp|prototipo|prototype|want to build|thinking of building)\b/;
    const stuckHints = /\b(bug|bugs|erro|erros|error|errors|preso|travado|stuck|parou|stalled|nao funciona|not working|broken|quebrado|deploy|publicar|servidor|server|lento|slow|crashes|half.?finished|abandoned|chatgpt|claude|cursor|lovable|bolt|replit|copilot|gemini|vibe|no-?code|wordpress|bubble)\b/;
    const opsHints = /(\b(excel|folhas de calculo|spreadsheet|whatsapp|manual|papel|paper|cresceu|grew|equipa|team|funcionarios|staff|relatorios|reports|organizar|organise|organize|processo|process|clientes|customers|faturacao|invoicing|turnos|shifts|encomendas|orders|stock|marcacoes|bookings|sistema antigo|legacy|scattered|by hand)\b|desorganiz|disorganis|disorganiz)/;

    const scores = {
        stuck: (value.match(stuckHints) || []).length,
        ops: (value.match(opsHints) || []).length,
        idea: (value.match(ideaHints) || []).length
    };
    // "stuck" wins ties: someone with a broken build usually mentions the idea too.
    const best = ['stuck', 'ops', 'idea'].reduce((a, b) => (scores[b] > scores[a] ? b : a), 'stuck');
    return scores[best] > 0 ? best : '';
}

function chatMatchTrackChip(text) {
    const value = normalizeChatText(text);
    const chips = chatCopy.pt.routeChips.concat(chatCopy.en.routeChips).map(normalizeChatText);
    const index = chips.indexOf(value);
    if (index === -1) return '';
    return ['idea', 'stuck', 'ops'][index % 3];
}

// ── Side questions the visitor may ask at any point, answered without derailing.
// Patterns stay narrow on purpose: a visitor answering "orçamentos" or "WhatsApp
// e email" is describing their business, not asking about price or contacts.
function chatDetectQuestion(text) {
    const value = normalizeChatText(text);
    if (!value) return '';
    if (/(quanto custa|quanto fica|quanto cobram|quanto e que custa|qual o (preco|valor|custo)|how much|what does it cost|pricing|e muito caro|e caro\b)/.test(value)) return 'price';
    if (/(quanto tempo|em quanto tempo|qual o prazo|prazo de entrega|demora quanto|quantas semanas|how long|what is the timeline|when would it be ready)/.test(value)) return 'time';
    if (/(fico dependente|ficamos dependentes|dependencia do fornecedor|lock-?in|o codigo e meu|codigo fica meu|is the code mine|do i own|ownership)/.test(value)) return 'lockin';
    if (/(quem sao voces|quem e que voces|who are you|onde ficam|onde estao|de onde sao|where are you (based|from)|voces sao de onde)/.test(value)) return 'who';
    if (/(como funciona|como e que funciona|como trabalham|how do you work|how does it work|qual e o processo|qual o metodo)/.test(value)) return 'how';
    if (/(es um (robo|bot)|e um (robo|bot)|isto e um (robo|bot)|are you (a )?(bot|robot|human|real)|falo com (uma )?maquina|estou a falar com (um )?(robo|computador)|usam (ia|inteligencia artificial|ai)|isto (e|usa) (ia|inteligencia artificial)|do you use ai|is this ai)/.test(value)) return 'bot';
    if (/(falar com (uma )?pessoa|falar com alguem|quero falar com|talk to (a )?(human|person|someone)|posso ligar|qual o (vosso|seu) (numero|telefone)|your phone number)/.test(value)) return 'human';
    if (/^(obrigad[oa]|thanks|thank you|ty|valeu)\b/.test(value)) return 'thanks';
    if (/^(nao sei|n sei|sei la|no idea|not sure|i dont know|dont know|do not know|nao tenho certeza|nao faco ideia)\b/.test(value)) return 'dontKnow';
    return '';
}

// Clicking a suggested answer is always an answer, never a question.
function chatIsSuggestedAnswer(step, text) {
    const value = normalizeChatText(text);
    const pools = [chatCopy.pt, chatCopy.en].map((copy) => (step === 'route' ? copy.routeChips : copy.chips[step] || []));
    return pools.some((pool) => pool.map(normalizeChatText).includes(value));
}

// ── Acknowledgements that prove the answer was actually read.
function chatAcknowledge(step, text) {
    const value = normalizeChatText(text);
    const ack = chatText().ack;

    const specific = (() => {
        if (step === 'opsWhere') {
            if (/excel|folha|spreadsheet/.test(value)) return ack.excel;
            if (/whatsapp|email|mensagen|messages/.test(value)) return ack.whatsapp;
            if (/papel|paper|caderno|livro/.test(value)) return ack.paper;
            if (/antigo|legacy|velho|old|software/.test(value)) return ack.legacy;
        }
        if (step === 'opsProcess') {
            if (/orcament|fatura|invoic|quote|recibo|cobranc|billing/.test(value)) return ack.billing;
            if (/encomend|stock|order|entrega|deliver|armazem/.test(value)) return ack.orders;
            if (/turno|shift|horario|schedule|escala/.test(value)) return ack.shifts;
            if (/marcac|agenda|booking|appointment|reserva/.test(value)) return ack.bookings;
            if (/excel|folha|spreadsheet/.test(value)) return ack.excel;
            if (/whatsapp/.test(value)) return ack.whatsapp;
        }
        if (step === 'stuckTool') {
            if (/chatgpt|claude|gemini|cursor|lovable|bolt|replit|copilot|vibe|no-?code|bubble/.test(value)) return ack.aiTool;
            if (/contratei|hired|freelancer|agencia|agency|empresa/.test(value)) return ack.hired;
        }
        if (step === 'stuckUsers') {
            if (/so no meu|only on my|ninguem|nobody|nao|not yet/.test(value)) return ack.alone;
            if (/usar|using|clientes|customers|equipa|team|sim|yes/.test(value)) return ack.inUse;
        }
        if (step === 'ideaTalked') {
            if (/ainda nao|not yet|nao|^no\b/.test(value)) return ack.notTalked;
            if (/sim|yes|ja falei|have/.test(value)) return ack.talked;
        }
        if (step === 'timing') {
            if (/quanto antes|urgente|asap|as soon|agora|now/.test(value)) return ack.urgent;
            if (/explorar|exploring|sem pressa|no rush/.test(value)) return ack.exploring;
            if (/semana|weeks|mes\b|month/.test(value)) return ack.soon;
        }
        return '';
    })();

    // The same line twice in a row would give the game away too early.
    const chosen = specific && specific !== chatState.lastAck
        ? specific
        : chatPickRandom(ack.generic.filter((line) => line !== chatState.lastAck));
    chatState.lastAck = chosen;
    return chosen;
}

function chatAnswerIsThin(step, text) {
    const openSteps = ['ideaWhat', 'ideaFirst', 'stuckBreaks', 'opsProcess', 'opsPeople'];
    if (!openSteps.includes(step)) return false;
    const value = (text || '').trim();
    const words = value.split(/\s+/).filter(Boolean);
    return value.length < 12 || words.length < 3;
}

function chatBuildRecap() {
    const copy = chatText();
    const labels = copy.recapLabels;
    const answers = chatState.answers;
    const contact = [chatState.contact.email, chatState.contact.phone].filter(Boolean).join(' · ');

    const lines = [copy.recapIntro, '', `${labels.situation}: ${copy.tracks[chatState.track]}`];
    (CHAT_TRACK_STEPS[chatState.track] || []).concat('timing').forEach((step) => {
        if (answers[step]) lines.push(`${labels[step]}: ${answers[step]}`);
    });
    if (contact) lines.push(`${labels.contact}: ${contact}`);
    return lines.join('\n');
}

function chatSaveLead(options) {
    const isAddition = Boolean(options && options.addition);
    if (chatState.submitted && !isAddition) return;
    chatState.submitted = true;

    const a = chatState.answers;
    const story = CHAT_TRACK_STEPS[chatState.track]
        .map((step) => a[step])
        .filter(Boolean)
        .join(' · ');

    const payload = {
        source: isAddition ? 'website-chat-addition' : 'website-chat',
        language: currentLang,
        contact: { ...chatState.contact },
        businessIdea: story,
        preferredCallTime: a.timing || '',
        lead: {
            name: chatState.contact.name,
            email: chatState.contact.email,
            phone: chatState.contact.phone,
            problem: story,
            goal: a.timing || '',
            track: chatState.track
        },
        messages: [...chatState.messages]
    };

    saveConversationLocally({ timestamp: new Date().toISOString(), ...payload });

    const apiBase = (window.YOURLAB_API_URL || '').replace(/\/$/, '');
    fetch(`${apiBase}/api/save-inquiry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    }).catch((err) => console.warn('Could not reach server to save the lead:', err.message));
}

function setChatStatus(mode) {
    const dot = document.getElementById('chatStatusDot');
    const label = document.getElementById('chatStatusLabel');
    if (!dot || !label) return;
    const isPt = currentLang === 'pt';
    const labels = {
        ready: isPt ? 'pronto para falar' : 'ready to talk',
        typing: isPt ? 'a escrever…' : 'typing…'
    };
    dot.className = 'chat-status-dot ' + (mode === 'typing' ? 'server' : 'ai');
    label.textContent = labels[mode] || labels.ready;
}

function renderQuickReplies(options) {
    const box = document.getElementById('chatQuickReplies');
    if (!box) return;
    box.innerHTML = '';
    (options || []).forEach((option) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'chat-quick-reply';
        button.textContent = option;
        button.addEventListener('click', () => {
            renderQuickReplies([]);
            handleChatInput(option);
        });
        box.appendChild(button);
    });
}

function chatQuickRepliesFor(step) {
    if (step === 'route') return chatText().routeChips;
    return chatText().chips[step] || [];
}

function chatCurrentQuestion() {
    const copy = chatText();
    if (chatState.step === 'route') return copy.route;
    if (chatState.step === 'after') return '';
    return copy.ask[chatState.step] || '';
}

function chatAdvanceStep() {
    chatState.retries = 0;
    while (chatState.stepQueue.length) {
        const next = chatState.stepQueue.shift();
        // Anything already given earlier in the conversation is not asked again.
        if (next === 'name' && chatState.contact.name) continue;
        if (next === 'contact' && (chatState.contact.email || chatState.contact.phone)) continue;
        chatState.step = next;
        return;
    }
    chatState.step = 'after';
}

// Replies are queued so they arrive one at a time, like someone typing.
function chatSay(messages, options) {
    const list = Array.isArray(messages) ? messages.filter(Boolean) : [messages].filter(Boolean);
    const quickReplies = (options && options.quickReplies) || [];
    let delay = 0;

    list.forEach((text, index) => {
        chatState.messages.push({ bot: text, timestamp: new Date().toISOString() });
        delay += Math.min(1100, 320 + String(text).length * 8);
        setTimeout(() => {
            addBotMessage(text);
            if (index === list.length - 1) {
                setChatStatus('ready');
                renderQuickReplies(quickReplies);
            }
        }, delay);
    });

    if (list.length) setChatStatus('typing');
    return delay;
}

// Asks whatever the current step needs, optionally after an acknowledgement.
function chatPrompt(prefix) {
    const copy = chatText();
    const messages = (Array.isArray(prefix) ? prefix : [prefix]).filter(Boolean);
    if (chatState.step === 'recap') {
        messages.push(chatBuildRecap(), copy.ask.recap);
    } else {
        messages.push(chatCurrentQuestion());
    }
    chatSay(messages, { quickReplies: chatQuickRepliesFor(chatState.step) });
}

function chatFinish() {
    const copy = chatText();
    chatSaveLead();
    const closing = [
        copy.saved(chatState.contact.name),
        copy.savedNote,
        copy.joke1,
        copy.joke2,
        copy.joke3,
        copy.after
    ];
    chatState.step = 'after';
    chatSay(closing);
}

function handleChatInput(rawText) {
    const userText = (rawText || '').trim();
    if (!userText) return;

    addUserMessage(userText);
    renderQuickReplies([]);
    const copy = chatText();
    const step = chatState.step;

    // Contact details are captured whenever they appear, not only when asked.
    const email = chatExtractEmail(userText);
    const phone = chatExtractPhone(userText);
    if (email) chatState.contact.email = email;
    if (phone) chatState.contact.phone = phone;

    chatState.messages.push({ user: userText, timestamp: new Date().toISOString() });

    // Side questions get a real answer, then the pending question comes back.
    const question = chatDetectQuestion(userText);
    if (question && !chatIsSuggestedAnswer(step, userText) && !(step === 'contact' && (email || phone))) {
        const pending = chatCurrentQuestion();
        const replies = [copy.faq[question]];
        if (pending) replies.push(`${copy.back} ${pending}`);
        chatSay(replies, { quickReplies: chatQuickRepliesFor(chatState.step) });
        return;
    }

    if (step === 'route') {
        const suggested = chatIsSuggestedAnswer('route', userText);
        const track = chatMatchTrackChip(userText) || chatDetectTrack(userText);
        if (!track) {
            chatSay([copy.route], { quickReplies: copy.routeChips });
            return;
        }
        chatState.track = track;
        chatState.stepQueue = CHAT_TRACK_STEPS[track].concat(CHAT_COMMON_STEPS);

        // Someone who typed their story already answered the first question;
        // someone who clicked a suggestion still has to tell it.
        const firstStep = chatState.stepQueue[0];
        const alreadyTold = !suggested && !chatAnswerIsThin(firstStep, userText);
        if (alreadyTold) {
            chatState.answers[firstStep] = userText;
            chatState.stepQueue.shift();
        }
        chatAdvanceStep();
        chatPrompt(alreadyTold ? chatAcknowledge(firstStep, userText) : copy.openers[track]);
        return;
    }

    if (step === 'name') {
        const name = chatExtractName(userText);
        if (!name) {
            chatState.retries += 1;
            chatSay([copy.retry.name], {});
            return;
        }
        chatState.contact.name = name;
        chatAdvanceStep();
        chatPrompt(copy.nameAck(name));
        return;
    }

    if (step === 'contact') {
        if (!chatState.contact.email && !chatState.contact.phone) {
            chatState.retries += 1;
            chatSay([copy.retry.contact], {});
            return;
        }
        chatAdvanceStep();
        chatPrompt('');
        return;
    }

    if (step === 'recap') {
        const value = normalizeChatText(userText);
        const wantsFix = /corrigir|corrige|errado|nao|correct|wrong|change|mudar/.test(value);
        if (wantsFix && !chatState.correcting) {
            chatState.correcting = true;
            chatSay([copy.correct], {});
            return;
        }
        if (chatState.correcting) {
            // Whatever they correct is appended to the story rather than overwritten,
            // so nothing they said is silently dropped.
            const firstStep = CHAT_TRACK_STEPS[chatState.track][0];
            chatState.answers[firstStep] = `${chatState.answers[firstStep] || ''} — ${userText}`.trim();
            chatState.correcting = false;
        }
        chatFinish();
        return;
    }

    if (step === 'after') {
        const firstStep = CHAT_TRACK_STEPS[chatState.track] ? CHAT_TRACK_STEPS[chatState.track][0] : '';
        if (firstStep) {
            chatState.answers[firstStep] = `${chatState.answers[firstStep] || ''} — ${userText}`.trim();
        }
        // Everything after the closing is still kept, but the reply stops being
        // the same sentence over and over and ends up pointing to a real person.
        const acks = copy.afterAcks;
        chatSay([acks[Math.min(chatState.extras, acks.length - 1)]], {});
        chatState.extras += 1;
        if (!chatState.additionSaved) {
            chatState.additionSaved = true;
            chatSaveLead({ addition: true });
        }
        return;
    }

    // Remaining steps are the track questions plus timing.
    if (chatAnswerIsThin(step, userText) && chatState.retries === 0 && copy.retry[step]) {
        chatState.retries += 1;
        chatSay([copy.retry[step]], { quickReplies: chatQuickRepliesFor(step) });
        return;
    }

    chatState.answers[step] = userText;
    const acknowledgement = chatAcknowledge(step, userText);
    chatAdvanceStep();
    chatPrompt(acknowledgement);
}

function resetChat() {
    chatState.track = '';
    chatState.step = 'route';
    chatState.stepQueue = [];
    chatState.retries = 0;
    chatState.answers = {};
    chatState.contact = { name: '', email: '', phone: '' };
    chatState.messages = [];
    chatState.lastAck = '';
    chatState.extras = 0;
    chatState.submitted = false;
    chatState.additionSaved = false;
    chatState.correcting = false;

    chatMessages.innerHTML = '';
    addBotMessage(translations[currentLang].chatGreeting);
    setChatStatus('ready');
    renderQuickReplies(chatText().routeChips);
}

chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const userText = userInput.value.trim();
    if (!userText) return;
    userInput.value = '';
    handleChatInput(userText);
    userInput.focus();
});

userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        chatForm.dispatchEvent(new Event('submit'));
    }
});

// Switching language mid-conversation should not throw away what was typed:
// only an untouched chat is restarted, otherwise just the buttons are relabelled.
document.addEventListener('yourlab:language-changed', () => {
    if (chatState.step === 'route' && !chatState.messages.length) {
        resetChat();
        return;
    }
    setChatStatus('ready');
    renderQuickReplies(chatQuickRepliesFor(chatState.step));
});

resetChat();

// ===== Direct contact: copy address =====
(function setupCopyEmail() {
    const button = document.getElementById('copyEmailBtn');
    const feedback = document.getElementById('copyEmailFeedback');
    if (!button || !feedback) return;

    const address = button.dataset.email || 'yourlabpt@gmail.com';
    let resetTimer = null;

    async function copyAddress() {
        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(address);
                return true;
            }
        } catch (err) {
            // Falls through to the textarea approach below.
        }
        const helper = document.createElement('textarea');
        helper.value = address;
        helper.setAttribute('readonly', '');
        helper.style.position = 'fixed';
        helper.style.opacity = '0';
        document.body.appendChild(helper);
        helper.select();
        let ok = false;
        try {
            ok = document.execCommand('copy');
        } catch (err) {
            ok = false;
        }
        document.body.removeChild(helper);
        return ok;
    }

    // When the clipboard is refused (older browsers, blocked permission), the
    // address is selected instead so a manual copy is one shortcut away.
    function selectAddress() {
        const selection = window.getSelection();
        if (!selection) return;
        const range = document.createRange();
        range.selectNodeContents(feedback);
        selection.removeAllRanges();
        selection.addRange(range);
    }

    async function handleCopy() {
        const copied = await copyAddress();
        const isPt = currentLang === 'pt';
        feedback.textContent = copied
            ? `${address} — ${isPt ? 'copiado' : 'copied'} ✓`
            : `${address} — ${isPt ? 'selecione e copie' : 'select and copy'}`;
        feedback.classList.add('is-copied');
        if (!copied) selectAddress();
        clearTimeout(resetTimer);
        resetTimer = setTimeout(() => {
            feedback.textContent = address;
            feedback.classList.remove('is-copied');
        }, 4000);
    }

    button.addEventListener('click', handleCopy);
    feedback.addEventListener('click', handleCopy);
    feedback.style.cursor = 'pointer';
})();

function showSavedConversations() {
    const conversations = JSON.parse(localStorage.getItem('yourlab_conversations') || '[]');
    console.log('Saved Conversations:', conversations);
    return conversations;
}

// ===== Scroll Reveal =====
(function () {
    const revealEls = document.querySelectorAll('.reveal-up');

    const revealObserver = new IntersectionObserver((entries) => {
        // Stagger only within the current batch of elements entering the
        // viewport together — using the global element index here would make
        // later sections wait many seconds after a fast scroll or anchor jump.
        entries.forEach((entry, i) => {
            if (entry.isIntersecting) {
                const delay = Math.min(i, 5) * 70;
                setTimeout(() => {
                    entry.target.classList.add('revealed');
                }, delay);
                revealObserver.unobserve(entry.target);
            }
        });
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });

    revealEls.forEach(el => revealObserver.observe(el));
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
            state.rows = clamp(Math.floor(state.height / 12) + 30, 48, 74);
            state.cols = clamp(Math.floor(state.width / 13) + 48, 68, 120);
        } else {
            state.rows = clamp(Math.floor(state.height / 10) + 40, 64, 104);
            state.cols = clamp(Math.floor(state.width / 11) + 64, 96, 180);
        }

        const groupCount = 8;
        const groups = [];
        for (let g = 0; g < groupCount; g += 1) {
            const t = g / Math.max(1, groupCount - 1);
            groups.push({
                freq: 4.9 + (t * 2.6),
                amp: 0.62 + (t * 0.48),
                speed: 0.22 + (t * 0.16),
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
            ? clamp(Math.floor(state.width / 22) + 14, 30, 60)
            : clamp(Math.floor(state.width / 18) + 20, 40, 80);
        for (let i = 0; i < cloudCount; i += 1) {
            state.clouds.push({
                x: (Math.random() * 2 - 1) * 2.2,
                depth: Math.random(),
                band: Math.random(),
                size: 0.38 + Math.random() * 0.95,
                alpha: 0.016 + Math.random() * 0.03,
                drift: (Math.random() - 0.5) * 0.12,
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

        const pointerEase = isCoarsePointer ? 0.03 : 0.045;
        state.pointerX = lerp(state.pointerX, state.pointerTargetX, pointerEase);
        state.pointerY = lerp(state.pointerY, state.pointerTargetY, pointerEase);

        const px = (state.pointerX - 0.5) * 2;
        const py = (state.pointerY - 0.5) * 2;
        state.parallaxX = lerp(state.parallaxX, px, 0.03);
        state.parallaxY = lerp(state.parallaxY, py, 0.03);
    }

    function drawAtmosphere() {
        const atmosphere = ctx.createLinearGradient(0, 0, 0, state.height);
        atmosphere.addColorStop(0, 'rgba(238, 237, 233, 0.035)');
        atmosphere.addColorStop(0.35, 'rgba(238, 237, 233, 0.015)');
        atmosphere.addColorStop(1, 'rgba(238, 237, 233, 0.005)');
        ctx.fillStyle = atmosphere;
        ctx.fillRect(0, 0, state.width, state.height);
    }

    function drawSinusoidLandscape(time, horizonY, floorY) {
        const t = time * 0.00035;

        for (let row = 0; row < state.rows; row += 1) {
            const r = state.waveRows[row];
            const depth = r.depth;
            const spread = state.width * (0.09 + depth * 0.66);
            const baseY = horizonY + Math.pow(depth, 1.75) * (floorY - horizonY);
            const ampPx = (1.4 + depth * 34) * r.amp;

            for (let col = 0; col < state.cols; col += 1) {
                const xNorm = ((col / (state.cols - 1)) * 2) - 1;
                const primary = Math.sin((xNorm * r.freq) + (t * r.speed) + r.phase + (depth * 3.4));
                const secondary = Math.sin((xNorm * ((r.freq * 0.5) + 1.7)) - (t * (r.speed * 0.7)) + (r.phase * 1.4));
                const tertiary = Math.sin((xNorm * ((r.freq * 0.3) + 0.95)) + (t * (r.speed * 0.35)) + (r.phase * 0.7));
                const noise = (valueNoise((xNorm + 2.4) * 1.4, (depth * 3.6) + (t * 0.11)) - 0.5) * 0.12;
                const ripple = rippleInfluence(xNorm, depth, time) * (0.14 + depth * 0.1);
                const wave = (primary * 0.7) + (secondary * 0.2) + (tertiary * 0.1) + noise + ripple + r.profile;

                const sx = (state.width * 0.5) + (xNorm * spread) + (state.parallaxX * depth * 14);
                const sy = baseY - (wave * ampPx) + (r.tilt * xNorm * depth * 42);
                if (sx < -12 || sx > state.width + 12 || sy < horizonY - 80 || sy > state.height + 28) continue;

                const size = 0.14 + depth * 1.05;
                const alpha = 0.006 + (depth * 0.09) + (Math.abs(primary) * 0.02);

                ctx.beginPath();
                ctx.fillStyle = `rgba(238, 237, 233, ${Math.min(0.18, alpha).toFixed(4)})`;
                ctx.arc(sx, sy, size, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    function drawCloudSmoke(time, horizonY) {
        const t = time * 0.00035;

        for (let i = 0; i < state.clouds.length; i += 1) {
            const c = state.clouds[i];
            const depth = c.depth;
            const spread = state.width * (0.22 + depth * 0.66);
            const sx = (state.width * 0.5) + (c.x * spread) + (state.parallaxX * 7 * (0.4 + depth));
            const sy = horizonY - (state.height * (0.17 - (c.band * 0.24))) + (depth * state.height * 0.06) + (Math.sin((t * 0.55) + c.phase) * 4);
            const radius = state.width * (0.015 + c.size * 0.05) * (0.35 + (1 - depth) * 0.95);
            if (sx < -radius || sx > state.width + radius || sy < -radius || sy > state.height + radius) continue;

            const gradient = ctx.createRadialGradient(sx, sy, 0, sx, sy, radius);
            gradient.addColorStop(0, `rgba(238, 237, 233, ${(c.alpha * 1.35).toFixed(4)})`);
            gradient.addColorStop(0.42, `rgba(238, 237, 233, ${(c.alpha * 0.55).toFixed(4)})`);
            gradient.addColorStop(1, 'rgba(238, 237, 233, 0)');
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(sx, sy, radius, 0, Math.PI * 2);
            ctx.fill();
        }

        const horizonMist = ctx.createLinearGradient(0, horizonY - (state.height * 0.16), 0, horizonY + (state.height * 0.14));
        horizonMist.addColorStop(0, 'rgba(238, 237, 233, 0)');
        horizonMist.addColorStop(0.45, 'rgba(238, 237, 233, 0.05)');
        horizonMist.addColorStop(1, 'rgba(238, 237, 233, 0)');
        ctx.fillStyle = horizonMist;
        ctx.fillRect(0, horizonY - (state.height * 0.16), state.width, state.height * 0.3);
    }

    function render(time) {
        ctx.clearRect(0, 0, state.width, state.height);
        drawAtmosphere();

        const horizonY = state.height * (0.22 + (state.parallaxY * 0.006));
        const floorY = state.height * 1.04;

        drawSinusoidLandscape(time, horizonY, floorY);
        drawCloudSmoke(time, horizonY);

        const floorFog = ctx.createLinearGradient(0, state.height * 0.55, 0, state.height);
        floorFog.addColorStop(0, 'rgba(238, 237, 233, 0)');
        floorFog.addColorStop(1, 'rgba(238, 237, 233, 0.045)');
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
        const movedEnough = ((dx * dx) + (dy * dy)) > (isCoarsePointer ? 0.012 : 0.008);
        const rippleGap = isCoarsePointer ? 220 : 160;

        if (movedEnough && (now - state.lastDisturbAt > rippleGap)) {
            addRipple(state.pointerTargetX, state.pointerTargetY, isCoarsePointer ? 0.16 : 0.2);
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
