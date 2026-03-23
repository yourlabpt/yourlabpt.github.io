// ===== Internationalization (i18n) =====
let currentLang = localStorage.getItem('yourlab_lang_v2') || 'pt';

const translations = {
    en: {
        // Header
        tagline: 'Your Ideas Into Reality',
        // About
        aboutHeading: "The Lab Where Ideas Don't Stay Ideas",
        aboutLead: "Start small. Prove it. Scale what's real.",
        aboutBody: "Every year, over 30,000 new products are launched — and more than 90% of them fail. Not because the ideas were bad. Because most were never tested against the real world before everything was invested.",
        aboutBody2: "At YourLab, we build the first version of your idea — the one that answers the only question that matters: does this actually work? Small, fast, and real. So you know before you invest everything.",
        statLabel1: 'of new products fail',
        statLabel2: 'of organisations struggle to innovate',
        aboutCta: "The most expensive thing isn't building — it's keeping your idea trapped in your head. That's what an <strong>MVP</strong> changes.",
        // Journey
        journeyIdea: 'Idea',
        journeyIdeaDesc: "You've been building this in your head. Now we hear it out loud.",
        journeyStrategy: 'Strategy',
        journeyStrategyDesc: 'We map everything it needs to exist — scope, features, the first real version.',
        journeyBuild: 'Build',
        journeyBuildDesc: "Your idea starts taking form. We build only what's needed to learn fast.",
        journeyLaunch: 'Launch MVP',
        journeyLaunchDesc: 'It exists. Real people. Real reactions. Real data.',

        // Conclusion
        conclusionHeading: "This isn't our lab.",
        conclusionBody: "It's yours. We apply disciplined thinking to make sure what gets built matches what you envisioned — and tests whether that vision survives contact with the real world. We don't consult from a distance. We build alongside you. Every feature is defined. Every milestone is measurable. If you're ready to stop imagining and start finding out — this is where that happens.",

        // Slideshow
        slideshowKicker: 'THE PATH FROM THOUGHT TO BUILT',
        slideshowIntroHeading: 'Follow the journey of an idea as it becomes real.',
        slideshowIntroDesc: 'Five scenes. Interact with each one. This is how YourLab works — and how your idea gets built.',
        slideContinue: 'Continue',
        slide1Heading: 'You have an idea.',
        slide1Lead: "Every product that exists in the world right now started inside someone's head. The question was never if the idea was good enough. It was whether someone would build it. You're in the right place.",
        slide2Heading: 'What We Do',
        slide2Quote: "We are the space between 'I have an idea' and 'I built it.'",
        slide2Item1: "We take what's in your head and make it into something actionable — requirements, not assumptions.",
        slide2Item2: 'We build the smallest version that answers the biggest question: does this actually work?',
        slide2Item3: 'Software, IoT, integrations — built around your reality, not a generic template.',
        slide3Heading: 'Our Process',
        slide3Quote: "Every thing that was ever built followed a sequence. Here's ours.",
        slide3Step1: 'You speak. We listen. You show your idea on a call.',
        slide3Step2: 'We define what it needs to exist — requirements, scope, the MVP.',
        slide3Step3: 'We build it. Regular updates as your idea comes to life.',
        slide3Step4: 'It meets the world. Validated. Real. Ready to grow.',
        slide4Heading: 'Why Choose YourLab',
        slide4Item1: "One specialist. One focus. Yours — we don't split attention across 10 projects.",
        slide4Item2: 'Real craft supported by the best tools. Human judgment, AI speed.',
        slide4Item3: 'We build alongside you. This is YourLab — not ours.',
        slide4Item4: "Pricing built around where you are now, not where we'd like you to be.",
        slide5Heading: 'This idea has been in your head long enough.',
        slide5Lead: "YourLab. For the people ready to find out if it's real.",
        slide5Cta: "Say it. Let's build it.",
        gameRestart: 'Run the challenge again',
        gameContinueLocked: "Want to go deeper? Try the challenge below — or continue when you're ready.",
        gameL1Title: 'The First Step: Name the path',
        gameL1Hint: 'Before anything is built, it has to be named. Reveal each step of the journey.',
        gameL1ButtonBegin: 'Begin',
        gameL1ButtonReveal: 'Reveal next card',
        gameL1ButtonSolved: 'Level completed',
        gameL1StatusStart: 'Click begin to reveal the first card.',
        gameL1StatusProgress: 'Cards revealed',
        gameL1StatusDone: "The path is clear. Everything starts by naming what you're building.",
        gameL1Hidden: 'Locked step',
        gameRevealCardDiscoveryTitle: 'Discovery',
        gameRevealCardDiscoveryBody: 'We identify the real problem and user context.',
        gameRevealCardScopeTitle: 'Scope',
        gameRevealCardScopeBody: 'We define a clear MVP with measurable goals.',
        gameRevealCardBuildTitle: 'Build',
        gameRevealCardBuildBody: 'We develop only what is needed to learn fast.',
        gameRevealCardLaunchTitle: 'Launch',
        gameRevealCardLaunchBody: 'We validate in market and iterate with evidence.',
        gameL2Title: 'The Building Blocks: Match what makes it real',
        gameL2Hint: 'Every product is assembled from the same elements. Find the pairs your idea needs.',
        gameL2Moves: 'Moves',
        gameL2Solved: "You know the building blocks. That's already further than most people get.",
        gameMemoryHidden: 'Tap',
        gameMemoryCardRequirements: 'Requirements',
        gameMemoryCardMvp: 'MVP Focus',
        gameMemoryCardValidation: 'Validation',
        gameMemoryCardDelivery: 'Delivery',
        gameMemoryCardFeedback: 'Feedback',
        gameMemoryCardIntegration: 'Integration',
        gameL3Title: 'The Sequence: Put creation in order',
        gameL3Hint: "Great products aren't built randomly — they follow a sequence. Get it right.",
        gameL3Progress: 'Correct sequence',
        gameL3Mistakes: 'Resets',
        gameL3Solved: "You understand the order. That's the most underrated skill in building anything.",
        gameOrderStepDiscover: 'Understand the problem',
        gameOrderStepRequirements: 'Define requirements',
        gameOrderStepPrototype: 'Build MVP prototype',
        gameOrderStepTest: 'Test with real users',
        gameOrderStepIterate: 'Iterate and improve',
        gameOrderStepBusinessCase: 'Clarify business case',
        gameOrderStepArchitecture: 'Map the architecture',
        gameOrderStepRelease: 'Release first version',
        gameOrderStepMeasure: 'Measure adoption',
        gameOrderStepScale: 'Scale what works',
        gameOrderStepInterview: 'Interview stakeholders',
        gameOrderStepPrioritize: 'Prioritize essentials',
        gameOrderStepBuild: 'Build core features',
        gameOrderStepPilot: 'Run pilot deployment',
        gameOrderStepLearn: 'Learn and refine',
        gameL4Title: 'The Pattern: Internalize the rhythm of creation',
        gameL4Hint: 'Creation has a rhythm: Concept → Scope → Prototype → Launch. Watch. Memorize. Repeat.',
        gameL4Round: 'Round',
        gameL4Replay: 'Play sequence',
        gameL4Listen: 'Memorize the pattern',
        gameL4Input: 'Your turn to repeat',
        gameL4Mistakes: 'Mistakes',
        gameL4Solved: "That pattern is yours now. It's the same one behind every product that exists.",
        gameL4Miss: 'Not quite — the sequence matters. Replay and try again.',
        gameSymbolConcept: 'Concept',
        gameSymbolScope: 'Scope',
        gameSymbolPrototype: 'Prototype',
        gameSymbolLaunch: 'Launch',
        gameFinalTitle: 'Challenge Progress',
        gameFinalBody: 'You named it. You found the elements. You ordered the steps. You memorized the rhythm. This is how ideas stop being ideas.',
        gameFinalReady: 'Completed',
        gameFinalPending: 'Pending',
        gameFinalLevel1: 'Level 1 · Name the path',
        gameFinalLevel2: 'Level 2 · Find the elements',
        gameFinalLevel3: 'Level 3 · Order the sequence',
        gameFinalLevel4: 'Level 4 · Internalize the rhythm',
        // Project Showcase
        projectShowcaseKicker: 'PROVEN PROJECT STORIES',
        projectShowcaseHeading: 'What we build, how we build it, and the outcomes clients get',
        projectShowcaseDescription: 'Every case shows the full path: business request, initial pain, our execution strategy, and a flexible solution ready for daily operations.',
        projectCaseLabel: 'Case',
        projectBuiltForLabel: 'Built for',
        projectSectorLabel: 'Sector',
        projectTimelineLabel: 'Timeline',
        projectRequestLabel: 'Strategic request',
        projectPainLabel: 'Initial request and pain',
        projectBusinessImpactLabel: 'Business impact of the pain',
        projectProcessLabel: 'Approach and execution',
        projectResultLabel: 'Solution delivered',
        projectOutcomesLabel: 'Results achieved',
        projectDailyUseLabel: 'Flexible daily use',
        projectCtaText: 'Want this type of result in your business? Tell us your scenario and we will map the best first version with you.',
        projectCtaButton: 'Talk to the team',
        projectPrevAria: 'Previous project',
        projectNextAria: 'Next project',
        projectDotAriaPrefix: 'Project',
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
        chatHeading: 'Say it out loud.',
        chatDescription: "Every product that exists today started as a thought someone was afraid to speak. Tell Alex what's been on your mind. No pitch needed. Just the idea.",
        chatGreeting: "Think of something you've been building in your head but haven't told anyone yet. That's what I'm here for. What is it?",
        chatThinking: 'Alex is thinking...',
        inputPlaceholder: 'Type your message here...',
        sendBtn: 'Send',
        // Footer
        footerText: '\u00A9 2025 YourLab. All rights reserved.',
        footerContactShortcut: 'Contacts card',
        // Chat bot responses (used as frontend fallback)
        bot: {
            saved: (name) => `The YourLab team has your idea now, ${name}. Expect a proper conversation \u2014 not a template reply, a real one.`,
            generic: [
                "What's the unfair advantage you have here that nobody else in this space has?",
                "If you couldn't use code or an app to solve this \u2014 how would you do it manually?",
                "Who's the first person you'd show this to, and what would their reaction probably be?",
                "If this totally fails in 6 months \u2014 what would be the real reason?",
                "What's the dumbest simple version of this idea that might actually work?"
            ]
        }
    },
    pt: {
        // Header
        tagline: 'Transforme as Suas Ideias de Neg\u00F3cio em Realidade',
        // About
        aboutHeading: 'O Laborat\u00F3rio Onde as Ideias Deixam de Ser Ideias',
        aboutLead: 'Come\u00E7a pequeno. Prova. Escala o que \u00E9 real.',
        aboutBody: 'Todos os anos, mais de 30.000 novos produtos s\u00E3o lan\u00E7ados \u2014 e mais de 90% deles falham. N\u00E3o porque as ideias eram m\u00E1s. Porque a maioria nunca foi testada no mundo real antes de tudo ser investido.',
        aboutBody2: 'Na YourLab, constru\u00EDmos a primeira vers\u00E3o da tua ideia \u2014 a que responde \u00E0 \u00FAnica quest\u00E3o que importa: isto funciona mesmo? Pequena, r\u00E1pida e real. Para saberes antes de investires tudo.',
        statLabel1: 'dos novos produtos falham',
        statLabel2: 'das organiza\u00E7\u00F5es t\u00EAm dificuldade em inovar',
        aboutCta: 'O que custa mais n\u00E3o \u00E9 construir \u2014 \u00E9 manter a tua ideia presa na cabe\u00E7a. \u00C9 isso que um <strong>MVP</strong> muda.',
        // Journey
        journeyIdea: 'Ideia',
        journeyIdeaDesc: 'Tens constru\u00EDdo isto na tua cabe\u00E7a. Agora ouvimo-lo em voz alta.',
        journeyStrategy: 'Estrat\u00E9gia',
        journeyStrategyDesc: 'Mapeamos tudo o que precisa para existir \u2014 \u00E2mbito, funcionalidades, a primeira vers\u00E3o real.',
        journeyBuild: 'Constru\u00E7\u00E3o',
        journeyBuildDesc: 'A tua ideia come\u00E7a a tomar forma. Constru\u00EDmos apenas o necess\u00E1rio para aprender depressa.',
        journeyLaunch: 'Lan\u00E7ar MVP',
        journeyLaunchDesc: 'Existe. Pessoas reais. Rea\u00E7\u00F5es reais. Dados reais.',
        // Conclusion
        conclusionHeading: 'Este n\u00E3o \u00E9 o nosso laborat\u00F3rio.',
        conclusionBody: '\u00C9 teu. Aplicamos pensamento disciplinado para garantir que o que \u00E9 constru\u00EDdo corresponde ao que imaginaste \u2014 e para testar se essa vis\u00E3o sobrevive ao contacto com o mundo real. N\u00E3o consultamos \u00E0 dist\u00E2ncia. Constru\u00EDmos ao teu lado. Cada funcionalidade \u00E9 definida. Cada marco \u00E9 mensur\u00E1vel. Se est\u00E1s pronto para parar de imaginar e come\u00E7ar a descobrir \u2014 \u00E9 aqui que isso acontece.',

        // Slideshow
        slideshowKicker: 'O CAMINHO DO PENSAMENTO AO PRODUTO',
        slideshowIntroHeading: 'Segue a jornada de uma ideia enquanto se torna real.',
        slideshowIntroDesc: 'Cinco cenas. Interage com cada uma. \u00C9 assim que a YourLab trabalha \u2014 e como a tua ideia \u00E9 constru\u00EDda.',
        slideContinue: 'Continuar',
        slide1Heading: 'Tens uma ideia.',
        slide1Lead: 'Cada produto que existe no mundo come\u00E7ou dentro da cabe\u00E7a de algu\u00E9m. A quest\u00E3o nunca foi se a ideia era boa o suficiente. Foi se algu\u00E9m a construiria. Est\u00E1s no s\u00EDtio certo.',
        slide2Heading: 'O Que Fazemos',
        slide2Quote: 'Somos o espa\u00E7o entre \u201Ctenho uma ideia\u201D e \u201Cconstu\u00ED-a\u201D.',
        slide2Item1: 'Pegamos no que est\u00E1 na tua cabe\u00E7a e transformamos em algo acion\u00E1vel \u2014 requisitos, n\u00E3o suposi\u00E7\u00F5es.',
        slide2Item2: 'Constru\u00EDmos a vers\u00E3o mais pequena que responde \u00E0 maior quest\u00E3o: isto funciona mesmo?',
        slide2Item3: 'Software, IoT, integra\u00E7\u00F5es \u2014 constru\u00EDdos \u00E0 medida da tua realidade, n\u00E3o de um modelo gen\u00E9rico.',
        slide3Heading: 'O Nosso Processo',
        slide3Quote: 'Tudo o que foi alguma vez constru\u00EDdo seguiu uma sequ\u00EAncia. Esta \u00E9 a nossa.',
        slide3Step1: 'Tu falas. N\u00F3s ouvimos. Mostras a tua ideia numa chamada.',
        slide3Step2: 'Definimos o que precisa para existir \u2014 requisitos, \u00E2mbito, o MVP.',
        slide3Step3: 'Constru\u00EDmo-lo. Atualiza\u00E7\u00F5es regulares enquanto a tua ideia toma vida.',
        slide3Step4: 'Encontra o mundo. Validado. Real. Pronto para crescer.',
        slide4Heading: 'Porqu\u00EA a YourLab',
        slide4Item1: 'Um especialista. Um foco. O teu \u2014 n\u00E3o dividimos aten\u00E7\u00E3o por 10 projetos.',
        slide4Item2: 'Trabalho real apoiado pelas melhores ferramentas. Julgamento humano, velocidade de IA.',
        slide4Item3: 'Constru\u00EDmos ao teu lado. Este \u00E9 o YourLab \u2014 n\u00E3o o nosso.',
        slide4Item4: 'Pre\u00E7os constru\u00EDdos \u00E0 volta de onde est\u00E1s agora, n\u00E3o de onde gostar\u00EDamos que estivesses.',
        slide5Heading: 'Esta ideia j\u00E1 esteve na tua cabe\u00E7a tempo suficiente.',
        slide5Lead: 'YourLab. Para as pessoas prontas para descobrir se \u00E9 real.',
        slide5Cta: 'Diz. Vamos constru\u00ED-la.',
        gameRestart: 'Repetir o desafio',
        gameContinueLocked: 'Queres aprofundar? Experimenta o desafio abaixo \u2014 ou continua quando estiveres pronto.',
        gameL1Title: 'O Primeiro Passo: Nomear o caminho',
        gameL1Hint: 'Antes de qualquer coisa ser constru\u00EDda, tem de ser nomeada. Revela cada passo da jornada.',
        gameL1ButtonBegin: 'Come\u00E7ar',
        gameL1ButtonReveal: 'Revelar pr\u00F3ximo cart\u00E3o',
        gameL1ButtonSolved: 'N\u00EDvel conclu\u00EDdo',
        gameL1StatusStart: 'Clica em come\u00E7ar para revelar o primeiro cart\u00E3o.',
        gameL1StatusProgress: 'Cart\u00F5es revelados',
        gameL1StatusDone: 'O caminho est\u00E1 claro. Tudo come\u00E7a por nomear o que est\u00E1s a construir.',
        gameL1Hidden: 'Etapa bloqueada',
        gameRevealCardDiscoveryTitle: 'Descoberta',
        gameRevealCardDiscoveryBody: 'Identificamos o problema real e o contexto do utilizador.',
        gameRevealCardScopeTitle: '\u00C2mbito',
        gameRevealCardScopeBody: 'Definimos um MVP claro com objetivos mensur\u00E1veis.',
        gameRevealCardBuildTitle: 'Constru\u00E7\u00E3o',
        gameRevealCardBuildBody: 'Desenvolvemos apenas o necess\u00E1rio para aprender depressa.',
        gameRevealCardLaunchTitle: 'Lan\u00E7amento',
        gameRevealCardLaunchBody: 'Validamos no mercado e iteramos com evid\u00EAncia.',
        gameL2Title: 'Os Alicerces: Combina o que o torna real',
        gameL2Hint: 'Cada produto \u00E9 montado a partir dos mesmos elementos. Encontra os pares que a tua ideia precisa.',
        gameL2Moves: 'Jogadas',
        gameL2Solved: 'Conheces os alicerces. Isso j\u00E1 \u00E9 mais longe do que a maioria das pessoas chega.',
        gameMemoryHidden: 'Tocar',
        gameMemoryCardRequirements: 'Requisitos',
        gameMemoryCardMvp: 'Foco MVP',
        gameMemoryCardValidation: 'Valida\u00E7\u00E3o',
        gameMemoryCardDelivery: 'Entrega',
        gameMemoryCardFeedback: 'Feedback',
        gameMemoryCardIntegration: 'Integra\u00E7\u00E3o',
        gameL3Title: 'A Sequ\u00EAncia: Coloca a cria\u00E7\u00E3o em ordem',
        gameL3Hint: 'Os grandes produtos n\u00E3o s\u00E3o constru\u00EDdos aleatoriamente \u2014 seguem uma sequ\u00EAncia. Acerta.',
        gameL3Progress: 'Sequ\u00EAncia correta',
        gameL3Mistakes: 'Rein\u00EDcios',
        gameL3Solved: 'Entendes a ordem. \u00C9 a compet\u00EAncia mais subestimada em construir qualquer coisa.',
        gameOrderStepDiscover: 'Entender o problema',
        gameOrderStepRequirements: 'Definir requisitos',
        gameOrderStepPrototype: 'Construir prot\u00F3tipo MVP',
        gameOrderStepTest: 'Testar com utilizadores reais',
        gameOrderStepIterate: 'Iterar e melhorar',
        gameOrderStepBusinessCase: 'Clarificar caso de neg\u00F3cio',
        gameOrderStepArchitecture: 'Mapear arquitetura',
        gameOrderStepRelease: 'Lan\u00E7ar primeira vers\u00E3o',
        gameOrderStepMeasure: 'Medir ado\u00E7\u00E3o',
        gameOrderStepScale: 'Escalar o que funciona',
        gameOrderStepInterview: 'Entrevistar stakeholders',
        gameOrderStepPrioritize: 'Priorizar essenciais',
        gameOrderStepBuild: 'Construir funcionalidades base',
        gameOrderStepPilot: 'Executar piloto',
        gameOrderStepLearn: 'Aprender e refinar',
        gameL4Title: 'O Padr\u00E3o: Interioriza o ritmo da cria\u00E7\u00E3o',
        gameL4Hint: 'A cria\u00E7\u00E3o tem um ritmo: Conceito \u2192 \u00C2mbito \u2192 Prot\u00F3tipo \u2192 Lan\u00E7amento. Observa. Memoriza. Repete.',
        gameL4Round: 'Ronda',
        gameL4Replay: 'Reproduzir sequ\u00EAncia',
        gameL4Listen: 'Memoriza o padr\u00E3o',
        gameL4Input: 'Agora repete',
        gameL4Mistakes: 'Erros',
        gameL4Solved: 'Esse padr\u00E3o \u00E9 teu agora. \u00C9 o mesmo que est\u00E1 por tr\u00E1s de cada produto que existe.',
        gameL4Miss: 'N\u00E3o \u00E9 bem isso \u2014 a sequ\u00EAncia importa. Repete e tenta de novo.',
        gameSymbolConcept: 'Conceito',
        gameSymbolScope: '\u00C2mbito',
        gameSymbolPrototype: 'Prot\u00F3tipo',
        gameSymbolLaunch: 'Lan\u00E7amento',
        gameFinalTitle: 'Progresso do desafio',
        gameFinalBody: 'Nomeaste-a. Encontraste os elementos. Ordenaste os passos. Memorizaste o ritmo. \u00C9 assim que as ideias deixam de ser ideias.',
        gameFinalReady: 'Conclu\u00EDdo',
        gameFinalPending: 'Pendente',
        gameFinalLevel1: 'N\u00EDvel 1 \u00B7 Nomear o caminho',
        gameFinalLevel2: 'N\u00EDvel 2 \u00B7 Encontrar os elementos',
        gameFinalLevel3: 'N\u00EDvel 3 \u00B7 Ordenar a sequ\u00EAncia',
        gameFinalLevel4: 'N\u00EDvel 4 \u00B7 Interiorizar o ritmo',
        // Project Showcase
        projectShowcaseKicker: 'CASOS COM RESULTADO REAL',
        projectShowcaseHeading: 'O que construimos, como executamos e quais resultados entregamos',
        projectShowcaseDescription: 'Cada caso mostra a jornada completa: pedido de negocio, dor inicial, estrategia de execucao e solucao flexivel pronta para operacao diaria.',
        projectCaseLabel: 'Caso',
        projectBuiltForLabel: 'Construido para',
        projectSectorLabel: 'Setor',
        projectTimelineLabel: 'Prazo',
        projectRequestLabel: 'Pedido estrategico',
        projectPainLabel: 'Pedido e dor inicial',
        projectBusinessImpactLabel: 'Impacto da dor no negocio',
        projectProcessLabel: 'Abordagem e execucao',
        projectResultLabel: 'Solucao entregue',
        projectOutcomesLabel: 'Resultados alcancados',
        projectDailyUseLabel: 'Uso di\u00E1rio flex\u00EDvel',
        projectCtaText: 'Quer este tipo de resultado no seu negocio? Conte o seu cenario e mapeamos com voce a melhor primeira versao.',
        projectCtaButton: 'Falar com a equipa',
        projectPrevAria: 'Projeto anterior',
        projectNextAria: 'Pr\u00F3ximo projeto',
        projectDotAriaPrefix: 'Projeto',
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
        chatHeading: 'Diz em voz alta.',
        chatDescription: 'Cada produto que existe hoje come\u00E7ou como um pensamento que algu\u00E9m tinha medo de dizer. Diz ao Alex o que tens na cabe\u00E7a. N\u00E3o precisas de argum\u00E3o. S\u00F3 a ideia.',
        chatGreeting: 'Pensa em algo que tens estado a construir na cabe\u00E7a mas ainda n\u00E3o contaste a ningu\u00E9m. \u00C9 para isso que estou aqui. O que \u00E9?',
        chatThinking: 'Alex est\u00e1 a pensar...',
        inputPlaceholder: 'Escreve a tua mensagem aqui...',
        sendBtn: 'Enviar',
        // Footer
        footerText: '\u00A9 2025 YourLab. Todos os direitos reservados.',
        footerContactShortcut: 'Cart\u00E3o de contacto',
        // Chat bot responses (used as frontend fallback)
        bot: {
            saved: (name) => `A equipa da YourLab tem a tua ideia agora, ${name}. Espera uma conversa a s\u00e9rio \u2014 n\u00e3o uma resposta autom\u00e1tica, uma real.`,
            generic: [
                'O que te fez escolher este problema espec\u00edfico e n\u00e3o outro mais f\u00e1cil?',
                'Se n\u00e3o pudesses usar c\u00f3digo ou uma app \u2014 como resolverias isto manualmente?',
                'Quem seria a primeira pessoa a quem mostrarias isto, e qual seria provavelmente a rea\u00e7\u00e3o?',
                'Se isto falhasse completamente em 6 meses \u2014 qual seria o verdadeiro motivo?',
                'Qual \u00e9 a vers\u00e3o mais simples e crua desta ideia que poderia realmente funcionar?'
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

    function pickLangValue(value, fallback = '') {
        if (typeof value === 'string') {
            return { pt: value, en: value };
        }
        if (!value || typeof value !== 'object') {
            return { pt: fallback, en: fallback };
        }

        const pt = typeof value.pt === 'string'
            ? value.pt
            : typeof value.en === 'string'
                ? value.en
                : fallback;
        const en = typeof value.en === 'string'
            ? value.en
            : typeof value.pt === 'string'
                ? value.pt
                : fallback;

        return { pt, en };
    }

    function pickLangList(value, fallback = []) {
        if (Array.isArray(value)) {
            return { pt: [...value], en: [...value] };
        }
        if (!value || typeof value !== 'object') {
            return { pt: [...fallback], en: [...fallback] };
        }

        const pt = Array.isArray(value.pt)
            ? value.pt
            : Array.isArray(value.en)
                ? value.en
                : fallback;
        const en = Array.isArray(value.en)
            ? value.en
            : Array.isArray(value.pt)
                ? value.pt
                : fallback;

        return { pt: [...pt], en: [...en] };
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

            const title = pickLangValue(source.title);
            const hasRenderableTitle = Boolean((title.pt || '').trim() || (title.en || '').trim());
            if (!hasRenderableTitle) return null;

            const solutionDeliveredRaw = source.solutionDelivered || source.finalResult;
            const solutionDelivered = Array.isArray(solutionDeliveredRaw) || (
                solutionDeliveredRaw && typeof solutionDeliveredRaw === 'object' && (
                    Array.isArray(solutionDeliveredRaw.pt) || Array.isArray(solutionDeliveredRaw.en)
                )
            )
                ? pickLangList(solutionDeliveredRaw)
                : pickLangList([]);

            const finalResultAsText = pickLangValue(source.finalResult || '');
            if (!solutionDelivered.pt.length && (finalResultAsText.pt || '').trim()) {
                solutionDelivered.pt = [finalResultAsText.pt];
            }
            if (!solutionDelivered.en.length && (finalResultAsText.en || '').trim()) {
                solutionDelivered.en = [finalResultAsText.en];
            }

            return {
                id: typeof source.id === 'string' && source.id.trim()
                    ? source.id.trim()
                    : `project-${index + 1}`,
                title,
                clientProfile: pickLangValue(source.clientProfile || source.client || source.audience || ''),
                sector: pickLangValue(source.sector || source.industry || ''),
                timeline: pickLangValue(source.timeline || ''),
                strategicRequest: pickLangValue(source.strategicRequest || source.request || ''),
                painSnapshot: pickLangValue(source.painSnapshot || source.requestPain || ''),
                businessImpact: pickLangValue(source.businessImpact || ''),
                approach: pickLangList(source.approach || source.processProposal || []),
                solutionDelivered,
                results: pickLangList(source.results || []),
                dailyUse: pickLangList(source.dailyUse || []),
                ctaText: pickLangValue(source.ctaText || '')
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
            const approachSteps = listFor(project.approach)
                .map((item) => `<li>${escapeHtml(item)}</li>`)
                .join('');
            const deliveredItems = listFor(project.solutionDelivered)
                .map((item) => `<li>${escapeHtml(item)}</li>`)
                .join('');
            const resultPoints = listFor(project.results)
                .map((item) => `<li>${escapeHtml(item)}</li>`)
                .join('');
            const dailyUsePoints = listFor(project.dailyUse)
                .map((item) => `<li>${escapeHtml(item)}</li>`)
                .join('');
            const isActive = index === current;
            const ctaLine = textFor(project.ctaText) || t('projectCtaText');

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

                    <article class="project-case-value-card">
                        <h4>${t('projectRequestLabel')}</h4>
                        <p>${escapeHtml(textFor(project.strategicRequest))}</p>
                    </article>

                    <div class="project-case-grid">
                        <article class="project-case-block">
                            <h4>${t('projectPainLabel')}</h4>
                            <p>${escapeHtml(textFor(project.painSnapshot))}</p>
                            <h5>${t('projectBusinessImpactLabel')}</h5>
                            <p>${escapeHtml(textFor(project.businessImpact))}</p>
                        </article>

                        <article class="project-case-block">
                            <h4>${t('projectProcessLabel')}</h4>
                            <ul>${approachSteps}</ul>
                        </article>

                        <article class="project-case-block">
                            <h4>${t('projectResultLabel')}</h4>
                            <ul>${deliveredItems}</ul>
                        </article>

                        <article class="project-case-block project-case-block-results">
                            <h4>${t('projectOutcomesLabel')}</h4>
                            <ul>${resultPoints}</ul>
                            <h5>${t('projectDailyUseLabel')}</h5>
                            <ul>${dailyUsePoints}</ul>
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
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
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
        submitted: false
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

function parseFallbackInput(text, field) {
    // field: 'name' | 'contact' | 'idea' | 'callTime' — only extract what we're currently asking for
    const fc = chatState.fallbackConversation;

    if (field === 'contact' || !field) {
        const emailMatch = text.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/);
        const phoneMatch = text.match(/(?:\+?\d[\d\s().-]{6,}\d)/);
        if (emailMatch) fc.contact.email = emailMatch[0].toLowerCase();
        if (phoneMatch && phoneMatch[0].replace(/\D/g, '').length >= 8) fc.contact.phone = phoneMatch[0];
    }
    if (field === 'name' || !field) {
        if (!fc.contact.name) {
            const SKIP = /^(hi|hey|hello|oi|olá|ola|bom|boa|tudo|sim|não|nao|ok|okay|claro|yes|no|sure|maybe|talvez|sup|yo|great|fixe)$/i;
            const single = text.trim().match(/^([A-Za-zÀ-ÿ]{2,20}(?:\s[A-Za-zÀ-ÿ]{2,20})?)\s*\.?$/);
            if (single && !SKIP.test(single[1].trim())) fc.contact.name = single[1].trim();
        }
    }
    if (field === 'idea') fc.businessIdea = text.trim();
    if (field === 'callTime') fc.contact.callTime = text.trim();
}

// Detect which collection step the fallback bot is currently on
function getFallbackStep() {
    const fc = chatState.fallbackConversation;
    const c  = fc.contact;
    if (!c.name)                       return 'name';
    if (!c.email && !c.phone)          return 'contact';
    if (!fc.businessIdea)              return 'idea';
    if (!c.callTime)                   return 'callTime';
    return 'done';
}

function processFallbackUserMessage(userText) {
    const fc      = chatState.fallbackConversation;
    const isPt    = currentLang === 'pt';
    const isFirst = fc.messages.length === 0;
    const step    = getFallbackStep(); // step BEFORE we process this message

    // Parse the user's answer into the right field
    parseFallbackInput(userText, step);

    const contact    = fc.contact;
    const name       = contact.name || '';
    const nextStep   = getFallbackStep(); // step AFTER parsing

    // Funny "AI sleeping" intro — prepended only on the very first fallback reply
    const sleepingIntro = isPt
        ? '😴 O nosso AI foi a dormir. Provavelmente sonha com pipelines de dados. Mas eu estou cá — a versão prática e sem floreados.\n\n'
        : '😴 Our AI went to sleep. Probably dreaming of data pipelines. But I\'m here — the practical, no-nonsense version.\n\n';

    let botResponse = '';

    if (step === 'name') {
        if (nextStep === 'contact') {
            // Got the name
            botResponse = (isFirst ? sleepingIntro : '') + (isPt
                ? `Boa, ${name}! 📬 Qual o teu email ou número de telefone?`
                : `Got it, ${name}! 📬 What's your email or phone number?`);
        } else {
            // Couldn't extract the name — ask again (or first prompt)
            botResponse = (isFirst ? sleepingIntro : '') + (isPt
                ? 'Como te chamas?'
                : 'What\'s your name?');
        }
    } else if (step === 'contact') {
        if (nextStep === 'idea') {
            botResponse = isPt
                ? `Anotado. 💡 Em poucas palavras — qual é a ideia ou problema que queres resolver?`
                : `Noted. 💡 In a few words — what's the idea or problem you want to solve?`;
        } else {
            botResponse = isPt
                ? 'Preciso de um email válido ou número de telefone para a equipa te contactar.'
                : "I need a valid email or phone number so the team can reach you.";
        }
    } else if (step === 'idea') {
        if (nextStep === 'callTime') {
            botResponse = isPt
                ? `Entendido. 📅 Quando preferes uma chamada rápida? (ex: "amanhã de tarde", "segunda às 10h", "próxima semana")`
                : `Got it. 📅 When's a good time for a quick call? (e.g. "tomorrow afternoon", "Monday at 10am", "next week")`;
        } else {
            botResponse = isPt
                ? 'Conta-me um pouco mais sobre a ideia — só um ou dois parágrafos.'
                : 'Tell me a bit more about the idea — just a sentence or two.';
        }
    } else if (step === 'callTime') {
        // All info collected — save and notify
        fc.submitted = true;
        const displayEmail = contact.email || contact.phone;
        botResponse = isPt
            ? `Tudo guardado, ${name}! ✅\nA equipa da YourLab vai entrar em contacto antes da hora que indicaste. Vai receber um convite de calendário em ${displayEmail}. O AI acorda na próxima visita 🤖`
            : `All done, ${name}! ✅\nThe YourLab team will reach out before your preferred time. You'll get a calendar invite at ${displayEmail}. The AI will be awake next time you visit 🤖`;

        // Save locally
        saveConversationLocally({
            timestamp: new Date().toISOString(),
            contact: { ...contact },
            businessIdea: fc.businessIdea,
            messages: [...fc.messages, { user: userText, bot: botResponse, timestamp: new Date().toISOString() }],
            source: 'frontend-offline-bot'
        });

        // POST to server so it sends the email + calendar invite
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
                    name: contact.name, email: contact.email, phone: contact.phone,
                    problem: fc.businessIdea, callTime: contact.callTime
                },
                messages: fc.messages
            })
        }).catch(err => console.warn('Could not reach server to save offline lead:', err.message));
    } else {
        // Already done — no more questions
        botResponse = isPt
            ? 'Já temos tudo! A equipa vai entrar em contacto em breve.'
            : 'We already have everything! The team will be in touch soon.';
    }

    fc.messages.push({
        user: userText,
        bot: botResponse,
        timestamp: new Date().toISOString()
    });

    return botResponse;
}

function setChatStatus(mode) {
    // mode: 'ai' | 'server' | 'offline' | 'connecting'
    const dot   = document.getElementById('chatStatusDot');
    const label = document.getElementById('chatStatusLabel');
    if (!dot || !label) return;
    const isPt = currentLang === 'pt';
    const labels = {
        ai:         isPt ? 'Alex IA · online'        : 'Alex AI · online',
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
    const gameSlots = Array.from(document.querySelectorAll('[data-game-level]'));
    const finalSlot = document.querySelector('[data-game-finale]');
    const continueButtons = Array.from(document.querySelectorAll('.scene-next[data-level-next]'));
    const restartButtons = Array.from(document.querySelectorAll('[data-action="restart-game"]'));
    if (!slides.length) return;

    const total = slides.length;
    const GAME_VERSION = 1;
    const GAME_STORAGE_KEY = 'yourlab_story_game_state_v1';
    const GAME_SESSION_KEY = 'yourlab_story_game_session_v1';

    const revealCards = [
        { title: 'gameRevealCardDiscoveryTitle', body: 'gameRevealCardDiscoveryBody' },
        { title: 'gameRevealCardScopeTitle', body: 'gameRevealCardScopeBody' },
        { title: 'gameRevealCardBuildTitle', body: 'gameRevealCardBuildBody' },
        { title: 'gameRevealCardLaunchTitle', body: 'gameRevealCardLaunchBody' }
    ];
    const memoryPool = [
        'gameMemoryCardRequirements',
        'gameMemoryCardMvp',
        'gameMemoryCardValidation',
        'gameMemoryCardDelivery',
        'gameMemoryCardFeedback',
        'gameMemoryCardIntegration'
    ];
    const orderVariants = [
        ['gameOrderStepDiscover', 'gameOrderStepRequirements', 'gameOrderStepPrototype', 'gameOrderStepTest', 'gameOrderStepIterate'],
        ['gameOrderStepBusinessCase', 'gameOrderStepArchitecture', 'gameOrderStepPrototype', 'gameOrderStepRelease', 'gameOrderStepMeasure', 'gameOrderStepScale'],
        ['gameOrderStepInterview', 'gameOrderStepPrioritize', 'gameOrderStepBuild', 'gameOrderStepPilot', 'gameOrderStepLearn']
    ];
    const patternSymbols = ['gameSymbolConcept', 'gameSymbolScope', 'gameSymbolPrototype', 'gameSymbolLaunch'];
    const finalLevelKeys = ['gameFinalLevel1', 'gameFinalLevel2', 'gameFinalLevel3', 'gameFinalLevel4'];

    let current = 0;
    let gameState = null;
    let memoryFlipTimer = null;
    let patternTimers = [];
    let patternPlaying = false;
    let patternActiveSymbol = -1;

    function t(key) {
        return (translations[currentLang] && translations[currentLang][key]) || key;
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function toInt(value, fallback = 0) {
        const parsed = Number.parseInt(value, 10);
        return Number.isFinite(parsed) ? parsed : fallback;
    }

    function createRng(seed) {
        let value = seed >>> 0;
        return function rng() {
            value += 0x6D2B79F5;
            let tValue = value;
            tValue = Math.imul(tValue ^ (tValue >>> 15), tValue | 1);
            tValue ^= tValue + Math.imul(tValue ^ (tValue >>> 7), tValue | 61);
            return ((tValue ^ (tValue >>> 14)) >>> 0) / 4294967296;
        };
    }

    function randomSeed() {
        return Math.floor((Math.random() * 2147483647) + 1);
    }

    function shuffled(range, rng) {
        const next = [...range];
        for (let i = next.length - 1; i > 0; i -= 1) {
            const j = Math.floor(rng() * (i + 1));
            [next[i], next[j]] = [next[j], next[i]];
        }
        return next;
    }

    function getSessionId() {
        let id = sessionStorage.getItem(GAME_SESSION_KEY);
        if (!id) {
            id = `visit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
            sessionStorage.setItem(GAME_SESSION_KEY, id);
        }
        return id;
    }

    const sessionId = getSessionId();

    function createVisitState(seedValue = randomSeed()) {
        const rng = createRng(seedValue);
        const revealOrder = shuffled([...revealCards.keys()], rng);
        const memoryChoices = shuffled([...memoryPool.keys()], rng).slice(0, 4);
        const memoryDeck = shuffled([...memoryChoices, ...memoryChoices], rng);
        const variant = orderVariants[Math.floor(rng() * orderVariants.length)];
        const orderBoard = shuffled([...variant.keys()], rng);
        const rounds = [3, 4, 5].map((length) => {
            const sequence = [];
            for (let i = 0; i < length; i += 1) {
                sequence.push(Math.floor(rng() * patternSymbols.length));
            }
            return sequence;
        });

        return {
            version: GAME_VERSION,
            sessionId,
            seed: seedValue,
            createdAt: Date.now(),
            complete: false,
            currentSlide: 0,
            unlockedSlide: 0,
            levels: [
                {
                    started: false,
                    revealedCount: 0,
                    revealOrder,
                    solved: false
                },
                {
                    deck: memoryDeck,
                    matched: [],
                    flipped: [],
                    moves: 0,
                    solved: false
                },
                {
                    sequence: variant,
                    board: orderBoard,
                    progress: 0,
                    picked: [],
                    mistakes: 0,
                    solved: false
                },
                {
                    rounds,
                    currentRound: 0,
                    inputProgress: 0,
                    awaitingReplay: true,
                    mistakes: 0,
                    feedback: '',
                    solved: false
                }
            ]
        };
    }

    function cleanIndexArray(input, max) {
        if (!Array.isArray(input)) return [];
        const clean = [];
        input.forEach((value) => {
            const index = toInt(value, -1);
            if (index >= 0 && index < max && !clean.includes(index)) {
                clean.push(index);
            }
        });
        return clean;
    }

    function mergeWithTemplate(rawState) {
        const template = createVisitState(toInt(rawState.seed, randomSeed()));
        const merged = template;

        merged.sessionId = typeof rawState.sessionId === 'string' ? rawState.sessionId : sessionId;
        merged.createdAt = toInt(rawState.createdAt, Date.now());
        merged.complete = Boolean(rawState.complete);
        merged.currentSlide = clamp(toInt(rawState.currentSlide, 0), 0, total - 1);
        merged.unlockedSlide = clamp(toInt(rawState.unlockedSlide, 0), 0, total - 1);

        if (Array.isArray(rawState.levels) && rawState.levels.length === merged.levels.length) {
            const l0 = rawState.levels[0] || {};
            merged.levels[0].started = Boolean(l0.started);
            merged.levels[0].revealedCount = clamp(toInt(l0.revealedCount, 0), 0, revealCards.length);
            merged.levels[0].solved = Boolean(l0.solved) || merged.levels[0].revealedCount >= revealCards.length;

            const l1 = rawState.levels[1] || {};
            if (Array.isArray(l1.deck) && l1.deck.length === merged.levels[1].deck.length) {
                merged.levels[1].deck = l1.deck.map((card) => clamp(toInt(card, 0), 0, memoryPool.length - 1));
            }
            merged.levels[1].matched = cleanIndexArray(l1.matched, merged.levels[1].deck.length);
            merged.levels[1].flipped = cleanIndexArray(l1.flipped, merged.levels[1].deck.length).slice(0, 2);
            merged.levels[1].moves = Math.max(0, toInt(l1.moves, 0));
            merged.levels[1].solved = Boolean(l1.solved) || merged.levels[1].matched.length === merged.levels[1].deck.length;
            if (
                merged.levels[1].flipped.length === 2 &&
                merged.levels[1].deck[merged.levels[1].flipped[0]] !== merged.levels[1].deck[merged.levels[1].flipped[1]]
            ) {
                merged.levels[1].flipped = [];
            }

            const l2 = rawState.levels[2] || {};
            if (Array.isArray(l2.sequence) && l2.sequence.length >= 5) {
                merged.levels[2].sequence = l2.sequence.filter((key) => typeof key === 'string');
            }
            if (Array.isArray(l2.board) && l2.board.length === merged.levels[2].sequence.length) {
                merged.levels[2].board = cleanIndexArray(l2.board, merged.levels[2].sequence.length);
                if (merged.levels[2].board.length !== merged.levels[2].sequence.length) {
                    merged.levels[2].board = shuffled([...merged.levels[2].sequence.keys()], createRng(toInt(rawState.seed, randomSeed())));
                }
            }
            merged.levels[2].progress = clamp(toInt(l2.progress, 0), 0, merged.levels[2].sequence.length);
            merged.levels[2].picked = cleanIndexArray(l2.picked, merged.levels[2].sequence.length).slice(0, merged.levels[2].progress);
            merged.levels[2].mistakes = Math.max(0, toInt(l2.mistakes, 0));
            merged.levels[2].solved = Boolean(l2.solved) || merged.levels[2].progress >= merged.levels[2].sequence.length;

            const l3 = rawState.levels[3] || {};
            if (Array.isArray(l3.rounds) && l3.rounds.length === merged.levels[3].rounds.length) {
                const allRoundsValid = l3.rounds.every((round, roundIndex) => (
                    Array.isArray(round)
                    && round.length === merged.levels[3].rounds[roundIndex].length
                ));
                if (allRoundsValid) {
                    merged.levels[3].rounds = l3.rounds.map((round) => (
                        round.map((symbol) => clamp(toInt(symbol, 0), 0, patternSymbols.length - 1))
                    ));
                }
            }
            merged.levels[3].currentRound = clamp(toInt(l3.currentRound, 0), 0, merged.levels[3].rounds.length - 1);
            const maxInput = merged.levels[3].rounds[merged.levels[3].currentRound].length;
            merged.levels[3].inputProgress = clamp(toInt(l3.inputProgress, 0), 0, maxInput);
            merged.levels[3].awaitingReplay = l3.awaitingReplay !== false;
            merged.levels[3].mistakes = Math.max(0, toInt(l3.mistakes, 0));
            merged.levels[3].feedback = typeof l3.feedback === 'string' ? l3.feedback : '';
            merged.levels[3].solved = Boolean(l3.solved);
        }

        const solvedGate = merged.levels.reduce((acc, level, index) => (level.solved ? index + 1 : acc), 0);
        merged.unlockedSlide = clamp(Math.max(merged.unlockedSlide, solvedGate), 0, total - 1);
        if (merged.levels[3].solved) {
            merged.complete = true;
            merged.unlockedSlide = total - 1;
        }

        return merged;
    }

    function loadState() {
        const raw = localStorage.getItem(GAME_STORAGE_KEY);
        if (!raw) return createVisitState();

        try {
            const parsed = JSON.parse(raw);
            if (!parsed || parsed.version !== GAME_VERSION) {
                return createVisitState();
            }
            const merged = mergeWithTemplate(parsed);
            if (merged.complete && merged.sessionId !== sessionId) {
                return createVisitState();
            }
            return merged;
        } catch (error) {
            console.warn('Could not parse game state; starting a fresh challenge.', error);
            return createVisitState();
        }
    }

    function saveState() {
        localStorage.setItem(GAME_STORAGE_KEY, JSON.stringify(gameState));
    }

    function clearMemoryTimer() {
        if (memoryFlipTimer) {
            clearTimeout(memoryFlipTimer);
            memoryFlipTimer = null;
        }
    }

    function clearPatternPlayback() {
        patternTimers.forEach((timerId) => clearTimeout(timerId));
        patternTimers = [];
        patternPlaying = false;
        patternActiveSymbol = -1;
    }

    function enhanceWords() {
        const interactiveNodes = document.querySelectorAll('[data-word-interactive]');
        interactiveNodes.forEach(node => {
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
        });
    }

    function updateProgressBar() {
        if (!progressBar) return;
        const solved = gameState.levels.filter((level) => level.solved).length;
        const pct = (solved / gameState.levels.length) * 100;
        progressBar.style.width = `${pct}%`;
    }

    function updateContinueButtons() {
        continueButtons.forEach((button) => {
            const levelIndex = toInt(button.dataset.levelNext, -1);
            const level = gameState.levels[levelIndex];
            const unlocked = Boolean(level && level.solved);
            button.disabled = !unlocked;
            button.classList.toggle('is-locked', !unlocked);
            button.title = unlocked ? '' : t('gameContinueLocked');
        });
    }

    function renderFinalPanel() {
        if (!finalSlot) return;

        const rows = finalLevelKeys.map((labelKey, index) => {
            const done = Boolean(gameState.levels[index] && gameState.levels[index].solved);
            return `
                <div class="game-final-row ${done ? 'done' : ''}">
                    <span>${t(labelKey)}</span>
                    <strong>${done ? t('gameFinalReady') : t('gameFinalPending')}</strong>
                </div>
            `;
        }).join('');

        finalSlot.innerHTML = `
            <article class="game-panel game-final-panel">
                <h4>${t('gameFinalTitle')}</h4>
                <p>${t('gameFinalBody')}</p>
                <div class="game-final-list">${rows}</div>
            </article>
        `;
    }

    function updateNavigationLockState() {
        const maxAllowed = clamp(gameState.unlockedSlide, 0, total - 1);
        if (nextBtn) {
            nextBtn.disabled = current >= maxAllowed;
            nextBtn.classList.toggle('is-disabled', current >= maxAllowed);
        }
        if (prevBtn) {
            prevBtn.disabled = current === 0;
            prevBtn.classList.toggle('is-disabled', current === 0);
        }
    }

    function setActiveSlideState() {
        slides.forEach((slide, index) => {
            const isActive = index === current;
            slide.classList.toggle('active', isActive);
            slide.setAttribute('aria-hidden', String(!isActive));
        });

        dots.forEach((dot, index) => {
            dot.classList.toggle('active', index === current);
            const isLocked = index > gameState.unlockedSlide;
            dot.classList.toggle('locked', isLocked);
            dot.setAttribute('aria-disabled', String(isLocked));
        });

        updateNavigationLockState();
    }

    function persistState() {
        gameState.currentSlide = current;
        saveState();
    }

    function solveLevel(levelIndex) {
        const level = gameState.levels[levelIndex];
        if (!level || level.solved) return;

        level.solved = true;
        gameState.unlockedSlide = Math.max(gameState.unlockedSlide, levelIndex + 1);
        if (levelIndex === gameState.levels.length - 1) {
            gameState.complete = true;
            gameState.unlockedSlide = total - 1;
        }
    }

    function goTo(index) {
        const maxAllowed = clamp(gameState.unlockedSlide, 0, total - 1);
        const target = clamp(index, 0, maxAllowed);
        if (target === current) return;
        current = target;
        setActiveSlideState();
        persistState();
    }

    function next() {
        const maxAllowed = clamp(gameState.unlockedSlide, 0, total - 1);
        if (current >= maxAllowed) {
            container && container.classList.add('shake-lock');
            setTimeout(() => container && container.classList.remove('shake-lock'), 280);
            return;
        }
        goTo(current + 1);
    }

    function prev() {
        goTo(current - 1);
    }

    function renderRevealLevel(slot, level) {
        const revealOrder = level.revealOrder;
        const totalCards = revealOrder.length;
        const statusText = level.solved
            ? t('gameL1StatusDone')
            : level.started
                ? `${t('gameL1StatusProgress')}: ${level.revealedCount}/${totalCards}`
                : t('gameL1StatusStart');
        const buttonLabel = level.solved
            ? t('gameL1ButtonSolved')
            : level.started
                ? t('gameL1ButtonReveal')
                : t('gameL1ButtonBegin');

        const cardsMarkup = revealOrder.map((cardIndex, position) => {
            const card = revealCards[cardIndex];
            const revealed = position < level.revealedCount;
            return `
                <article class="reveal-card ${revealed ? 'is-revealed' : ''}">
                    ${revealed
                        ? `<div class="reveal-card-front"><h4>${t(card.title)}</h4><p>${t(card.body)}</p></div>`
                        : `<div class="reveal-card-back"><span class="reveal-placeholder" aria-hidden="true"></span><small>${t('gameL1Hidden')}</small></div>`}
                </article>
            `;
        }).join('');

        slot.innerHTML = `
            <article class="game-panel">
                <header class="game-panel-head">
                    <h4>${t('gameL1Title')}</h4>
                    <p>${t('gameL1Hint')}</p>
                </header>
                <div class="reveal-grid">${cardsMarkup}</div>
                <div class="game-panel-footer">
                    <p class="game-status">${statusText}</p>
                    <button type="button" class="game-action" data-game-level0 ${level.solved ? 'disabled' : ''}>${buttonLabel}</button>
                </div>
            </article>
        `;

        const action = slot.querySelector('[data-game-level0]');
        if (!action) return;
        action.addEventListener('click', () => {
            if (level.solved) return;
            level.started = true;
            level.revealedCount = Math.min(totalCards, level.revealedCount + 1);
            if (level.revealedCount >= totalCards) {
                solveLevel(0);
            }
            updateProgressBar();
            updateContinueButtons();
            setActiveSlideState();
            saveState();
            renderRevealLevel(slot, level);
            renderFinalPanel();
        });
    }

    function renderMemoryLevel(slot, level) {
        const openIndexes = [...level.matched, ...level.flipped];
        const cardsMarkup = level.deck.map((cardId, index) => {
            const isOpen = openIndexes.includes(index);
            const isMatched = level.matched.includes(index);
            return `
                <button type="button"
                    class="memory-card ${isOpen ? 'is-open' : ''} ${isMatched ? 'is-matched' : ''}"
                    data-memory-index="${index}"
                    ${isMatched || memoryFlipTimer ? 'disabled' : ''}>
                    <span class="${isOpen ? 'memory-card-label' : 'memory-card-back'}">${isOpen ? t(memoryPool[cardId]) : t('gameMemoryHidden')}</span>
                </button>
            `;
        }).join('');

        const statusText = level.solved
            ? t('gameL2Solved')
            : `${t('gameL2Moves')}: ${level.moves}`;

        slot.innerHTML = `
            <article class="game-panel">
                <header class="game-panel-head">
                    <h4>${t('gameL2Title')}</h4>
                    <p>${t('gameL2Hint')}</p>
                </header>
                <div class="memory-grid">${cardsMarkup}</div>
                <p class="game-status">${statusText}</p>
            </article>
        `;

        slot.querySelectorAll('[data-memory-index]').forEach((cardButton) => {
            cardButton.addEventListener('click', () => {
                if (level.solved || memoryFlipTimer) return;

                const cardIndex = toInt(cardButton.dataset.memoryIndex, -1);
                if (cardIndex < 0 || level.matched.includes(cardIndex) || level.flipped.includes(cardIndex)) return;

                level.flipped.push(cardIndex);
                if (level.flipped.length === 2) {
                    level.moves += 1;
                    const [first, second] = level.flipped;
                    const isMatch = level.deck[first] === level.deck[second];

                    if (isMatch) {
                        level.matched = cleanIndexArray([...level.matched, first, second], level.deck.length);
                        level.flipped = [];
                        if (level.matched.length === level.deck.length) {
                            solveLevel(1);
                        }
                        updateProgressBar();
                        updateContinueButtons();
                        setActiveSlideState();
                        saveState();
                        renderMemoryLevel(slot, level);
                        renderFinalPanel();
                        return;
                    }

                    saveState();
                    renderMemoryLevel(slot, level);
                    clearMemoryTimer();
                    memoryFlipTimer = setTimeout(() => {
                        memoryFlipTimer = null;
                        level.flipped = [];
                        saveState();
                        renderMemoryLevel(slot, level);
                    }, 700);
                    return;
                }

                saveState();
                renderMemoryLevel(slot, level);
            });
        });
    }

    function renderOrderLevel(slot, level) {
        const pickedSet = new Set(level.picked);
        const cardsMarkup = level.board.map((stepIndex, boardIndex) => {
            const done = pickedSet.has(boardIndex);
            return `
                <button type="button"
                    class="order-card ${done ? 'is-done' : ''}"
                    data-order-index="${boardIndex}"
                    ${done || level.solved ? 'disabled' : ''}>
                    ${t(level.sequence[stepIndex])}
                </button>
            `;
        }).join('');

        const statusText = level.solved
            ? t('gameL3Solved')
            : `${t('gameL3Progress')}: ${level.progress}/${level.sequence.length} · ${t('gameL3Mistakes')}: ${level.mistakes}`;

        slot.innerHTML = `
            <article class="game-panel">
                <header class="game-panel-head">
                    <h4>${t('gameL3Title')}</h4>
                    <p>${t('gameL3Hint')}</p>
                </header>
                <div class="order-grid">${cardsMarkup}</div>
                <p class="game-status">${statusText}</p>
            </article>
        `;

        slot.querySelectorAll('[data-order-index]').forEach((button) => {
            button.addEventListener('click', () => {
                if (level.solved) return;
                const boardIndex = toInt(button.dataset.orderIndex, -1);
                if (boardIndex < 0 || level.picked.includes(boardIndex)) return;

                const expected = level.progress;
                const selectedStep = level.board[boardIndex];
                if (selectedStep === expected) {
                    level.picked.push(boardIndex);
                    level.progress += 1;
                    if (level.progress >= level.sequence.length) {
                        solveLevel(2);
                    }
                } else {
                    level.progress = 0;
                    level.picked = [];
                    level.mistakes += 1;
                }

                updateProgressBar();
                updateContinueButtons();
                setActiveSlideState();
                saveState();
                renderOrderLevel(slot, level);
                renderFinalPanel();
            });
        });
    }

    function runPatternPlayback(level, slot) {
        clearPatternPlayback();
        patternPlaying = true;
        patternActiveSymbol = -1;
        level.awaitingReplay = false;
        level.feedback = '';
        level.inputProgress = 0;
        saveState();
        renderPatternLevel(slot, level);

        const sequence = level.rounds[level.currentRound];
        const stepGap = 560;
        sequence.forEach((symbolIndex, stepIndex) => {
            patternTimers.push(setTimeout(() => {
                patternActiveSymbol = symbolIndex;
                renderPatternLevel(slot, level);
            }, stepIndex * stepGap));

            patternTimers.push(setTimeout(() => {
                patternActiveSymbol = -1;
                renderPatternLevel(slot, level);
            }, (stepIndex * stepGap) + 320));
        });

        patternTimers.push(setTimeout(() => {
            patternPlaying = false;
            patternActiveSymbol = -1;
            level.awaitingReplay = false;
            level.feedback = '';
            saveState();
            renderPatternLevel(slot, level);
        }, sequence.length * stepGap));
    }

    function renderPatternLevel(slot, level) {
        const currentRound = level.rounds[level.currentRound] || [];
        const replayDisabled = patternPlaying || level.solved;
        const symbolDisabled = replayDisabled || level.awaitingReplay;
        const statusText = level.solved
            ? t('gameL4Solved')
            : level.feedback === 'miss'
                ? t('gameL4Miss')
                : patternPlaying
                    ? t('gameL4Listen')
                    : level.awaitingReplay
                        ? t('gameL4Hint')
                        : `${t('gameL4Input')}: ${level.inputProgress}/${currentRound.length}`;

        const symbolsMarkup = patternSymbols.map((symbolKey, symbolIndex) => `
            <button type="button"
                class="pattern-symbol ${patternActiveSymbol === symbolIndex ? 'is-active' : ''}"
                data-pattern-symbol="${symbolIndex}"
                ${symbolDisabled ? 'disabled' : ''}>
                ${t(symbolKey)}
            </button>
        `).join('');

        slot.innerHTML = `
            <article class="game-panel">
                <header class="game-panel-head">
                    <h4>${t('gameL4Title')}</h4>
                    <p>${t('gameL4Hint')}</p>
                </header>
                <div class="pattern-meta">
                    <span>${t('gameL4Round')}: ${level.currentRound + 1}/${level.rounds.length}</span>
                    <span>${t('gameL4Mistakes')}: ${level.mistakes}</span>
                </div>
                <div class="pattern-grid">${symbolsMarkup}</div>
                <div class="game-panel-footer">
                    <p class="game-status">${statusText}</p>
                    <button type="button" class="game-action" data-pattern-replay ${replayDisabled ? 'disabled' : ''}>${t('gameL4Replay')}</button>
                </div>
            </article>
        `;

        const replayButton = slot.querySelector('[data-pattern-replay]');
        if (replayButton) {
            replayButton.addEventListener('click', () => {
                if (level.solved) return;
                runPatternPlayback(level, slot);
            });
        }

        slot.querySelectorAll('[data-pattern-symbol]').forEach((button) => {
            button.addEventListener('click', () => {
                if (level.solved || patternPlaying || level.awaitingReplay) return;

                const symbolIndex = toInt(button.dataset.patternSymbol, -1);
                const expected = currentRound[level.inputProgress];
                if (symbolIndex === expected) {
                    level.inputProgress += 1;
                    level.feedback = '';
                    if (level.inputProgress >= currentRound.length) {
                        if (level.currentRound >= level.rounds.length - 1) {
                            solveLevel(3);
                        } else {
                            level.currentRound += 1;
                            level.inputProgress = 0;
                            level.awaitingReplay = true;
                        }
                    }
                } else {
                    level.mistakes += 1;
                    level.inputProgress = 0;
                    level.awaitingReplay = true;
                    level.feedback = 'miss';
                }

                updateProgressBar();
                updateContinueButtons();
                setActiveSlideState();
                saveState();
                renderPatternLevel(slot, level);
                renderFinalPanel();
            });
        });
    }

    function renderGames() {
        gameSlots.forEach((slot, levelIndex) => {
            const level = gameState.levels[levelIndex];
            if (!level) return;

            if (levelIndex === 0) {
                renderRevealLevel(slot, level);
            } else if (levelIndex === 1) {
                renderMemoryLevel(slot, level);
            } else if (levelIndex === 2) {
                renderOrderLevel(slot, level);
            } else if (levelIndex === 3) {
                renderPatternLevel(slot, level);
            }
        });
    }

    // Events
    if (nextBtn) nextBtn.addEventListener('click', next);
    if (prevBtn) prevBtn.addEventListener('click', prev);
    dots.forEach(dot => {
        dot.addEventListener('click', () => {
            const target = toInt(dot.dataset.index, 0);
            if (target > gameState.unlockedSlide) return;
            goTo(target);
        });
    });
    continueButtons.forEach((button) => {
        button.addEventListener('click', () => {
            const levelIndex = toInt(button.dataset.levelNext, -1);
            const level = gameState.levels[levelIndex];
            if (!level || !level.solved) return;
            goTo(levelIndex + 1);
        });
    });
    restartButtons.forEach((button) => {
        button.addEventListener('click', () => {
            clearMemoryTimer();
            clearPatternPlayback();
            gameState = createVisitState();
            current = 0;
            saveState();
            renderGames();
            updateProgressBar();
            updateContinueButtons();
            renderFinalPanel();
            setActiveSlideState();
        });
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
    }

    document.addEventListener('yourlab:language-changed', () => {
        renderGames();
        renderFinalPanel();
        updateContinueButtons();
        setActiveSlideState();
        updateProgressBar();
        enhanceWords();
    });

    // Start
    gameState = loadState();
    current = clamp(toInt(gameState.currentSlide, 0), 0, gameState.unlockedSlide);
    enhanceWords();
    renderGames();
    renderFinalPanel();
    updateContinueButtons();
    updateProgressBar();
    setActiveSlideState();
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
