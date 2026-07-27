// ===== Internationalization (i18n) =====
let currentLang = localStorage.getItem('yourlab_lang_v2') || 'pt';

const translations = {
    en: {
        // Header
        headerCta: 'Talk to us',

        // 1. Hero
        heroH1: 'We turn messy processes into systems that are simple to use.',
        heroSub: 'Have an idea to test, a process stuck in spreadsheets and messages, or an application left half-finished? We build the first useful version in weeks — with a fixed quote before we start.',
        heroCtaPrimary: 'Tell us what needs improving',
        heroCtaSecondary: 'See how we work',
        heroMicrocopy: 'First call is free, with no strings attached. If building makes no sense, we say so.',

        // 2. Trust strip
        trust1: 'Comfortable pricing, payment shaped around your business',
        trust2: 'First version in 4 to 6 weeks',
        trust3: 'Fixed quote before we start',
        trust4: 'The system is yours, source code included',
        trust5: 'Portugal and Europe · Portuguese and English',

        // 3. Situations
        situationsH2: 'Does any of this sound familiar?',
        situation1Title: "You have an idea and don't know where to start",
        situation1Body: "You know the problem you want to solve, but not what to build first, what it costs, or how long it takes. We help define the first version and test it with real people.",
        situation2Title: 'You started building with AI and got stuck',
        situation2Body: "The first version came out fast, but now errors keep coming back, nothing works outside your own computer, and nobody can explain what is inside it. We sort out what already exists and get it working.",
        situation3Title: 'The company grew and the work is scattered',
        situation3Body: 'Information in Excel, WhatsApp and email. The team copies the same data, reports are built by hand, and nobody can see the whole operation. We bring that together into one system.',
        situationsClose: 'In all three cases the first step is the same: properly understanding what needs to happen.',

        // 4. How we help
        helpEyebrow: 'HOW WE HELP',
        helpH2: 'We organise first. We build after.',
        helpBody1: 'We start by understanding how your company works today, where time is lost, and what really needs to change.',
        helpBody2: 'Then we build a simple first version, put it into use, and improve it based on what actually happens day to day.',
        helpType1: 'Digitising a manual process',
        helpType2: 'Internal systems for your team',
        helpType3: 'Client portals',
        helpType4: 'Connecting tools that do not talk to each other',
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
        processStep3Desc: 'only what is needed to start using it',
        processStep4Title: 'Test',
        processStep4Desc: 'your team uses it, comments and approves',
        processStep5Title: 'Improve',
        processStep5Desc: 'in stages, based on real use',
        processAnchor: 'Every step produces something concrete to see, test and approve. You always know what is planned, what is being done, and what has been delivered.',

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
        projectCtaText: 'Recognise this situation in your company? Tell us what is happening and we work out the best first step together.',
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
        diffNote: 'More speed in execution, without handing responsibility to a tool.',

        // 8. Investment
        priceEyebrow: 'INVESTMENT',
        priceH2: 'Comfortable pricing, shaped around the reality of your business.',
        priceBody1: 'Our projects usually come in at four-figure amounts. When it is only a matter of looking at a problem and working out what is going on, consulting starts at €200.',
        priceBody2: 'How you pay is agreed with you — in stages, as things get finished.',
        priceItem1: 'Consulting on a problem, from €200',
        priceItem2: 'Projects at four-figure amounts',
        priceItem3: 'Payment in stages, agreed with you',
        priceItem4: 'Fixed quote before we start',
        priceAnchor: 'The first call is free and carries no obligation. It exists to understand the problem and tell you honestly what is worth doing.',
        priceNote: 'Once we understand what you need, you get a fixed quote — no hidden costs and no surprises halfway through.',

        // 9. FAQ
        faqH2: 'Questions we always get.',
        faq1Q: 'How long does it take?',
        faq1A: 'The first version is usually ready in 4 to 6 weeks. You get a concrete deadline in the quote.',
        faq2Q: 'Will I be dependent on you?',
        faq2A: 'No. The system and the source code are yours, and everything is written down so someone else can carry the work on.',
        faq3Q: 'I cannot explain exactly what I need. Is that a problem?',
        faq3A: 'No, that part is our job. Tell us what happens day to day and we translate it into something that can be built.',
        faq4Q: 'I already built something with AI. Can you take it over?',
        faq4A: 'Yes. We start by understanding what already exists, fix the essentials, and leave it stable enough to grow.',
        faq5Q: 'What if my idea does not make sense?',
        faq5A: 'We tell you. It is far cheaper to find that out in a conversation than after investing.',
        faq6Q: 'Do you work with small companies?',
        faq6A: 'Yes, that is who we work with most of the time — small companies and teams, in Portugal and across Europe.',

        // 10. Invitation
        chatHeading: 'Tell us what needs improving.',
        inviteBody: 'The first conversation is for understanding the problem. If building something makes sense, we explain the path and the cost. If it does not, we say that too.',
        inviteCta: 'Start the conversation',
        chatDescription: 'Describe your situation and leave your contact. Someone from the team replies to you directly.',
        chatGreeting: 'Tell us, in a few words, what is happening in your company.',
        chatThinking: 'One moment…',
        inputPlaceholder: 'Type your message here...',
        sendBtn: 'Send',
        directContactLabel: 'Prefer to talk directly?',
        directWhatsapp: 'WhatsApp',
        directEmail: 'Email',

        // Footer
        footerText: '\u00A9 2026 YourLab. All rights reserved.',
        footerContactShortcut: 'Contacts card',

        // Chat bot responses (used as frontend fallback)
        bot: {
            saved: (name) => `The YourLab team has your situation on record, ${name}. You will get a direct reply from a person on the team — not an automated one.`,
            generic: [
                'Can you tell me a bit more about what is happening?',
                'How long has this been a problem in the company?',
                'What have you already tried in order to fix it?',
                'Who in the company feels this problem most day to day?',
                'If this carries on for another six months, what does that cost the company?'
            ]
        }
    },
    pt: {
        // Header
        headerCta: 'Falar connosco',

        // 1. Hero
        heroH1: 'Transformamos processos confusos em sistemas simples de usar.',
        heroSub: 'Tem uma ideia para testar, um processo preso em folhas de cálculo e mensagens, ou uma aplicação que ficou a meio? Construímos a primeira versão útil em semanas — com orçamento fechado antes de começar.',
        heroCtaPrimary: 'Conte-nos o que precisa de melhorar',
        heroCtaSecondary: 'Ver como trabalhamos',
        heroMicrocopy: 'Primeira chamada gratuita e sem compromisso. Se não fizer sentido construir, dizemos-lhe isso.',

        // 2. Faixa de confiança
        trust1: 'Preços confortáveis, pagamento ajustado ao seu negócio',
        trust2: 'Primeira versão em 4 a 6 semanas',
        trust3: 'Orçamento fechado antes de começar',
        trust4: 'O sistema fica seu, incluindo o código',
        trust5: 'Portugal e Europa · português e inglês',

        // 3. Situações reconhecíveis
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
        chatThinking: 'Um momento…',
        inputPlaceholder: 'Escreva a sua mensagem aqui...',
        sendBtn: 'Enviar',
        directContactLabel: 'Prefere falar diretamente?',
        directWhatsapp: 'WhatsApp',
        directEmail: 'Email',

        // Footer
        footerText: '© 2026 YourLab. Todos os direitos reservados.',
        footerContactShortcut: 'Cartão de contacto',

        // Chat bot responses (used as frontend fallback)
        bot: {
            saved: (name) => `A equipa da YourLab tem a sua situação registada, ${name}. Vai receber uma resposta direta de uma pessoa da equipa — não uma resposta automática.`,
            generic: [
                'Pode contar-me um pouco mais sobre o que está a acontecer?',
                'Há quanto tempo isto é um problema na empresa?',
                'O que já tentou fazer para resolver isto?',
                'Quem, na empresa, sente mais este problema no dia a dia?',
                'Se isto continuar assim mais seis meses, o que é que isso custa à empresa?'
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

// Helper to get current bot translations
function getBotText() {
    return translations[currentLang].bot;
}

const chatForm = document.getElementById('chatForm');
const userInput = document.getElementById('userInput');
const chatMessages = document.getElementById('chatMessages');
const sendButton = chatForm.querySelector('.send-btn');
const CHAT_OFFLINE_MODE_KEY = 'yourlab_chat_offline_mode';

const chatState = {
    sessionId: localStorage.getItem('yourlab_chat_session_id') || '',
    processing: false,
    offlineMode: sessionStorage.getItem(CHAT_OFFLINE_MODE_KEY) === '1',   // once true, skip all server retries for this session
    turns: [],
    fallbackConversation: {
        messages: [],
        contact: {
            name: '',
            email: '',
            phone: '',
            callTime: ''
        },
        businessIdea: '',
        submitted: false,
        contactChannel: 'phone'
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

function setOfflineMode(enabled) {
    chatState.offlineMode = Boolean(enabled);
    if (chatState.offlineMode) sessionStorage.setItem(CHAT_OFFLINE_MODE_KEY, '1');
    else sessionStorage.removeItem(CHAT_OFFLINE_MODE_KEY);
}

function saveConversationLocally(payload) {
    const conversations = JSON.parse(localStorage.getItem('yourlab_conversations') || '[]');
    conversations.push(payload);
    localStorage.setItem('yourlab_conversations', JSON.stringify(conversations));
}

async function sendMessageToAi(userText) {
    const apiBase = (window.YOURLAB_API_URL || '').replace(/\/$/, '');
    // Fetch timeout slightly longer than the server-side model timeout so we see the
    // server's fallback response rather than a raw network abort
    const FETCH_TIMEOUT_MS = (window.YOURLAB_FETCH_TIMEOUT_MS || 38000);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let response;
    try {
        response = await fetch(`${apiBase}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionId: chatState.sessionId,
                language: currentLang,
                message: userText
            }),
            signal: controller.signal
        });
    } finally {
        clearTimeout(timeoutId);
    }

    if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`);
    }

    return response.json();
}

const FALLBACK_NAME_STOP_WORDS = new Set([
    'hi', 'hello', 'hey', 'ola', 'bom', 'boa', 'sim', 'nao', 'ok', 'okay', 'yes', 'no',
    'maybe', 'talvez', 'team', 'equipa', 'yourlab', 'alex', 'name', 'nome',
    'phone', 'number', 'telefone', 'numero', 'email', 'business', 'negocio',
    'oi', 'tudo', 'bem', 'good', 'morning', 'afternoon', 'evening', 'night',
    'obrigado', 'obrigada', 'thanks', 'thank', 'you'
]);

function normalizeFallbackForComparison(value) {
    return (value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

function normalizeFallbackEmail(value) {
    const text = (value || '').trim().toLowerCase();
    return /^[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}$/.test(text) ? text : '';
}

function normalizeFallbackPhone(value) {
    const text = (value || '').trim();
    const digits = text.replace(/\D/g, '');
    if (digits.length < 8 || digits.length > 16) return '';
    return text;
}

function normalizeFallbackNameCandidate(value) {
    const cleaned = (value || '')
        .trim()
        .replace(/[.,;:!?]+$/g, '')
        .replace(/^['"`]+|['"`]+$/g, '');
    if (!cleaned || /\d|@/.test(cleaned)) return '';

    const tokens = cleaned
        .split(/\s+/)
        .map((token) => token.replace(/[^A-Za-zÀ-ÿ'-]/g, ''))
        .filter(Boolean);
    if (tokens.length < 2 || tokens.length > 4) return '';
    if (tokens.some((token) => token.length < 2 || token.length > 24)) return '';

    const joined = normalizeFallbackForComparison(tokens.join(' '));
    if (FALLBACK_NAME_STOP_WORDS.has(joined)) return '';
    if (tokens.some((token) => FALLBACK_NAME_STOP_WORDS.has(normalizeFallbackForComparison(token)))) return '';
    if (/(^| )(contact|contacto|email|telefone|numero|phone|number|name|nome)( |$)/.test(joined)) return '';

    return tokens
        .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
        .join(' ');
}

function extractFallbackName(text) {
    const source = (text || '').trim();
    if (!source) return '';

    const patterns = [
        /(?:my name is|i am|i'm|this is|call me)\s+([A-Za-zÀ-ÿ' -]{2,80})/i,
        /(?:meu nome e|o meu nome e|chamo-me|chamo me|eu sou|sou o|sou a|pode chamar(?:-me)?)\s+([A-Za-zÀ-ÿ' -]{2,80})/i
    ];
    for (const pattern of patterns) {
        const match = source.match(pattern);
        if (!match) continue;
        const candidate = normalizeFallbackNameCandidate(match[1]);
        if (candidate) return candidate;
    }

    const standalone = source
        .replace(/[!?.,;:()[\]{}"]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    if (!standalone || standalone.split(' ').length > 4) return '';
    if (!/^[A-Za-zÀ-ÿ' -]{2,80}$/.test(standalone)) return '';
    return normalizeFallbackNameCandidate(standalone);
}

function isFallbackPhoneRefusal(text) {
    const value = normalizeFallbackForComparison(text);
    return /\b(no phone|no number|d(?:on'?t|o not) share.*(phone|number)|prefer email|sem telefone|sem numero|nao quero.*(telefone|numero)|prefiro email)\b/.test(value);
}

function isFallbackEmailRefusal(text) {
    const value = normalizeFallbackForComparison(text);
    return /\b(no email|d(?:on'?t|o not) share.*email|nao tenho email|nao quero.*email|sem email|prefiro telefone|prefiro numero)\b/.test(value);
}

function isFallbackGreetingOnly(text) {
    const value = normalizeFallbackForComparison(text)
        .replace(/[!?.;,]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    if (!value) return false;
    return /^(oi|ola|hello|hi|hey|bom dia|boa tarde|boa noite|good morning|good afternoon|good evening|good night)$/.test(value)
        || /^(oi|ola|hello|hi|hey) (tudo bem|how are you)$/.test(value);
}

function isValidFallbackBusinessBrief(text) {
    const value = (text || '').trim();
    if (!value) return false;
    if (/^(yes|no|sim|nao|ok|talvez|maybe|none|n\/a|nada)$/i.test(value)) return false;
    if (normalizeFallbackEmail(value) || normalizeFallbackPhone(value)) return false;
    const words = value.split(/\s+/).filter(Boolean);
    const alphaChars = (value.match(/[A-Za-zÀ-ÿ]/g) || []).length;
    return value.length >= 18 && words.length >= 4 && alphaChars >= 12;
}

function looksLikeFallbackCallTime(text) {
    const value = normalizeFallbackForComparison(text);
    if (!value) return false;
    const hasDayWord = /\b(today|tomorrow|tonight|next|monday|tuesday|wednesday|thursday|friday|saturday|sunday|hoje|amanha|logo|depois|segunda|terca|quarta|quinta|sexta|sabado|domingo|proxima)\b/.test(value);
    const hasHour = /\b\d{1,2}(?::\d{2})?\s?(am|pm|h)?\b/.test(value);
    const hasMeetingWord = /\b(video|zoom|meet|teams|online|in person|in-person|presencial|call|chamada|reuniao)\b/.test(value);
    return hasDayWord || hasHour || hasMeetingWord;
}

function parseFallbackInput(text, field) {
    const fc = chatState.fallbackConversation;
    const clean = (text || '').trim();
    const emailMatch = clean.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/);
    const phoneMatch = clean.match(/(?:\+?\d[\d\s().-]{6,}\d)/);
    const parsedEmail = emailMatch ? normalizeFallbackEmail(emailMatch[0]) : '';
    const parsedPhone = phoneMatch ? normalizeFallbackPhone(phoneMatch[0]) : '';

    if (!fc.contact.email && parsedEmail) fc.contact.email = parsedEmail;
    if (!fc.contact.phone && parsedPhone) fc.contact.phone = parsedPhone;
    if (!fc.contact.name) {
        const parsedName = extractFallbackName(clean);
        if (parsedName) fc.contact.name = parsedName;
    }

    const hasContact = Boolean(fc.contact.phone || fc.contact.email);
    if (field === 'phone' && !hasContact && isFallbackPhoneRefusal(clean)) {
        fc.contactChannel = 'email';
    }
    if (field === 'email' && !hasContact && isFallbackEmailRefusal(clean)) {
        fc.contactChannel = 'phone';
    }

    if ((field === 'business' || field === 'idea') && !fc.businessIdea && isValidFallbackBusinessBrief(clean)) {
        fc.businessIdea = clean;
    }
    if (field === 'callTime' && !fc.contact.callTime && looksLikeFallbackCallTime(clean)) {
        fc.contact.callTime = clean;
    }
}

function getFallbackStep() {
    const fc = chatState.fallbackConversation;
    const c = fc.contact;
    if (!c.name) return 'name';
    if (!c.phone && !c.email) return fc.contactChannel === 'email' ? 'email' : 'phone';
    if (!isValidFallbackBusinessBrief(fc.businessIdea)) return 'business';
    if (!c.callTime) return 'callTime';
    return 'done';
}

function processFallbackUserMessage(userText) {
    const fc = chatState.fallbackConversation;
    const isPt = currentLang === 'pt';
    const stepBefore = getFallbackStep();

    parseFallbackInput(userText, stepBefore);

    const contact = fc.contact;
    const name = contact.name || '';
    const stepAfter = getFallbackStep();
    const hasContact = Boolean(contact.phone || contact.email);

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
        ? 'Sem problema. Partilha um email valido para contacto.'
        : 'No problem. Share a valid email address for contact.';
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

    let botResponse = '';
    if (stepBefore === stepAfter) {
        if (stepAfter === 'name') botResponse = isFallbackGreetingOnly(userText) ? greetAndAskName : askName;
        else if (stepAfter === 'phone') botResponse = fc.contactChannel === 'email' ? askEmail : askPhone;
        else if (stepAfter === 'email') botResponse = `${requireContact} ${askEmail}`;
        else if (stepAfter === 'business') botResponse = askBusinessRetry;
        else if (stepAfter === 'callTime') botResponse = askCallTimeRetry;
        else botResponse = isPt
            ? 'Ja temos tudo. A equipa vai entrar em contacto em breve.'
            : 'We already have everything. The team will contact you shortly.';
    } else if (stepAfter === 'done') {
        const contactTarget = contact.phone || contact.email || '';
        botResponse = isPt
            ? `Obrigado, ${name}. Ja temos contacto e contexto. A equipa da YourLab envia os proximos passos em ate 1 dia util. Contacto registado: ${contactTarget}.`
            : `Thanks, ${name}. We now have contact and context. The YourLab team will send next steps within 1 business day. Contact saved: ${contactTarget}.`;
    } else if ((stepBefore === 'phone' || stepBefore === 'email') && !hasContact) {
        botResponse = `${requireContact} ${nextQuestionByStep(stepAfter)}`;
    } else {
        const ack = isPt
            ? `Perfeito${name ? `, ${name}` : ''}.`
            : `Perfect${name ? `, ${name}` : ''}.`;
        botResponse = `${ack} ${nextQuestionByStep(stepAfter)}`.trim();
    }

    const messageRecord = {
        user: userText,
        bot: botResponse,
        timestamp: new Date().toISOString()
    };

    if (stepAfter === 'done' && !fc.submitted) {
        fc.submitted = true;

        saveConversationLocally({
            timestamp: new Date().toISOString(),
            contact: { ...contact },
            businessIdea: fc.businessIdea,
            messages: [...fc.messages, messageRecord],
            source: 'frontend-offline-bot'
        });

        const apiBase = (window.YOURLAB_API_URL || '').replace(/\/$/, '');
        fetch(`${apiBase}/api/save-inquiry`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                source: 'offline-chat',
                contact: { name: contact.name, email: contact.email, phone: contact.phone },
                businessIdea: fc.businessIdea,
                preferredCallTime: contact.callTime,
                lead: {
                    name: contact.name,
                    email: contact.email,
                    phone: contact.phone,
                    problem: fc.businessIdea,
                    goal: fc.businessIdea,
                    callTime: contact.callTime
                },
                messages: [...fc.messages, messageRecord]
            })
        }).catch((err) => console.warn('Could not reach server to save offline lead:', err.message));
    }

    fc.messages.push(messageRecord);
    return botResponse;
}

function setChatStatus(mode) {
    // mode: 'ai' | 'server' | 'offline' | 'connecting'
    const dot   = document.getElementById('chatStatusDot');
    const label = document.getElementById('chatStatusLabel');
    if (!dot || !label) return;
    const isPt = currentLang === 'pt';
    const labels = {
        ai:         isPt ? 'equipa · online'          : 'team · online',
        server:     isPt ? 'modo offline do servidor' : 'server offline mode',
        offline:    isPt ? 'modo offline'             : 'offline mode',
        connecting: isPt ? 'a ligar…'                 : 'connecting…'
    };
    dot.className = 'chat-status-dot ' + (mode === 'connecting' ? '' : mode);
    label.textContent = labels[mode] || labels.connecting;
}

async function processUserMessage(userText) {
    addUserMessage(userText);

    // If the server already failed this session, stay offline — never retry
    if (chatState.offlineMode) {
        setChatStatus('offline');
        const fallbackReply = processFallbackUserMessage(userText);
        setTimeout(() => addBotMessage(fallbackReply), 250);
        return;
    }

    const typingIndicator = addTypingIndicator();
    setChatStatus('connecting');

    // Show a reassurance message if the model takes more than 8 seconds
    const isPt = currentLang === 'pt';
    const slowMessageDelay = 8000;
    const slowMessageTimer = setTimeout(() => {
        const p = typingIndicator.querySelector('p');
        if (p) p.textContent = isPt ? 'A pensar… (o modelo demora uns segundos)' : 'Thinking… (the model is loading, hang on a sec)';
    }, slowMessageDelay);

    try {
        const result = await sendMessageToAi(userText);
        clearTimeout(slowMessageTimer);
        removeTypingIndicator(typingIndicator);

        if (result.sessionId) {
            chatState.sessionId = result.sessionId;
            localStorage.setItem('yourlab_chat_session_id', chatState.sessionId);
        }

        setChatStatus(result.usingFallback ? 'server' : 'ai');

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
        clearTimeout(slowMessageTimer);
        console.warn('AI backend unavailable, switching to offline mode:', error.message);
        removeTypingIndicator(typingIndicator);
        setChatStatus('offline');
        setOfflineMode(true);
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
