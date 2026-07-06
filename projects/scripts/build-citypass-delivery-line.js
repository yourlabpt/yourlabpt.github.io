const crypto = require('crypto');
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');

const blobStore = require('../lib/blob-store');
const deliveryOs = require('../lib/delivery-os');
const diagrams = require('../lib/diagrams');
const executionPlans = require('../lib/execution-plans');
const reqHierarchy = require('../lib/requirement-hierarchy');
const roadmapSync = require('../lib/roadmap-sync');
const { createSqliteStore } = require('../lib/sqlite-store');
const { buildIndexEntry } = require('../lib/split-store');

const projectId = 'prj_2b139f34-c3cd-4f6e-8794-da5f467a690a';
const dataDir = path.resolve(__dirname, '../data');
const projectPath = path.join(dataDir, 'projects', `${projectId}.json`);
const indexPath = path.join(dataDir, 'store-index.json');
const actor = 'codex_delivery_line';
const now = new Date().toISOString();

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function textOr(value, fallback = '') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

async function writeJson(filePath, value, options = {}) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  const body = options.compact
    ? `${JSON.stringify(value)}\n`
    : `${JSON.stringify(value, null, 2)}\n`;
  const tmp = `${filePath}.${process.pid}.${Date.now()}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  await fsp.writeFile(tmp, body, 'utf8');
  await fsp.rename(tmp, filePath);
}

function unique(values) {
  const out = [];
  const seen = new Set();
  for (const value of ensureArray(values)) {
    const id = textOr(value);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function reqType(req) {
  return reqHierarchy.normalizeRequirementType(req?.type) || textOr(req?.type);
}

function reqTitle(req) {
  return textOr(req?.title || req?.need || req?.shall || req?.id);
}

function reqSummary(req, max = 88) {
  const value = reqTitle(req).replace(/\s+/g, ' ');
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}

function markdownList(items) {
  return ensureArray(items).map((item) => `- ${item}`).join('\n');
}

function collectByType(project, type) {
  return ensureArray(project.requirements).filter((req) => reqType(req) === type);
}

function byModule(project, moduleName, limit = 18) {
  return ensureArray(project.requirements)
    .filter((req) => ensureArray(req.moduleTags).includes(moduleName) || req.module === moduleName)
    .map((req) => req.id)
    .filter(Boolean)
    .slice(0, limit);
}

function idsForPhase(project, phaseName, limit = 120) {
  return ensureArray(project.requirements)
    .filter((req) => textOr(req.phase) === textOr(phaseName))
    .map((req) => req.id)
    .filter(Boolean)
    .slice(0, limit);
}

function testsForPhase(project, phaseReqIds, limit = 6) {
  const phaseSet = new Set(phaseReqIds);
  return ensureArray(project.requirements)
    .filter((req) => reqType(req) === 'test_case')
    .filter((req) => (
      phaseSet.has(req.id)
      || phaseSet.has(req.parentId)
      || ensureArray(req.relatedRequirementIds).some((id) => phaseSet.has(id))
    ))
    .map((req) => `${req.id} - ${reqSummary(req)}`)
    .slice(0, limit);
}

function moduleTagsForReqIds(project, ids) {
  const idSet = new Set(ids);
  return unique(ensureArray(project.requirements)
    .filter((req) => idSet.has(req.id))
    .flatMap((req) => ensureArray(req.moduleTags).length ? req.moduleTags : [req.module])
    .filter(Boolean));
}

function upsertArtifact(project, artifact) {
  project.artifacts = ensureArray(project.artifacts);
  const existing = project.artifacts.find((item) => item.id === artifact.id);
  const next = {
    type: 'other',
    status: 'draft',
    version: existing?.version || 1,
    relatedRequirementIds: [],
    metadata: {},
    createdAt: existing?.createdAt || now,
    createdBy: existing?.createdBy || actor,
    ...existing,
    ...artifact,
    updatedAt: now,
    updatedBy: actor,
  };
  if (existing) Object.assign(existing, next);
  else project.artifacts.unshift(next);
  return next;
}

function makePromptRun({ id, agentType, stageId, targetOutput, fullPrompt, parsedOutput, summaryMarkdown }) {
  return {
    id,
    agentType,
    stageId,
    capabilityId: '',
    moduleTag: '',
    targetOutput,
    systemPrompt: '',
    stageInstruction: '',
    contextPack: {},
    taskPrompt: '',
    outputSchema: '',
    fullPrompt,
    modelUsed: 'deterministic-codex',
    rawOutput: `${JSON.stringify(parsedOutput, null, 2)}\n`,
    parsedOutput,
    summaryMarkdown,
    status: 'applied',
    version: 1,
    createdAt: now,
    createdBy: actor,
    reviewedAt: now,
    reviewedBy: actor,
  };
}

function upsertPromptRun(project, run) {
  project.promptRuns = ensureArray(project.promptRuns).filter((item) => item.id !== run.id);
  project.promptRuns.unshift(run);
  project.promptRuns = project.promptRuns.slice(0, 100);
}

function buildIdea(project, hierarchy) {
  const stakeholders = collectByType(project, 'stakeholder');
  const headline = 'City Pass transforma descontos turísticos em uma experiência digital controlada de ponta a ponta.';
  const mainIdeaMarkdown = [
    'O City Pass é uma plataforma digital para vender, ativar e validar benefícios gastronómicos e turísticos com a experiência simples de uma app premium. A ideia central é substituir a lógica dispersa de descontos, confirmações manuais e controlo informal por uma jornada clara: o cliente compra um plano, escolhe onde usar, gera um cupom digital e o parceiro valida o benefício com rastreabilidade.',
    'A reconstrução a partir dos requisitos mostra uma solução em três frentes coordenadas: app do cliente, experiência de parceiro e painel administrativo. A app dá descoberta, compra, mapa, roteiros, perfil, histórico e cupons; o parceiro recebe validação operacional; a equipa de gestão acompanha métricas, faturação, rankings, estabelecimentos e auditoria.',
    `A cadeia V-map está completa neste momento: ${hierarchy.chains.length} cadeias STK-FR-RNF-TC, ${hierarchy.orphans.length} órfãos e ${hierarchy.invalidLinks.length} ligações inválidas. Isto permite que a ideia deixe de ser apenas texto e passe a ser uma linha de entrega verificável.`
  ].join('\n\n');

  return {
    ideaBriefMarkdown: `## Ideia City Pass\n\n${mainIdeaMarkdown}`,
    vision: {
      headline,
      mainIdeaMarkdown,
      philosophyMarkdown: 'A filosofia do produto é tratar cada benefício como um ativo verificável: fácil para o cliente, rápido para o parceiro e auditável para a operação. A experiência deve sentir-se turística e premium na superfície, mas rigorosa nos bastidores.',
      problemMarkdown: 'A gestão de passes, descontos, validações e reporting tende a fragmentar-se entre pagamentos, contactos com parceiros, validações manuais e folhas de cálculo. Isso cria risco de fraude, baixa visibilidade operacional e dificuldade em escalar a oferta.',
      targetUsers: [
        'Cliente final que compra e usa benefícios em Lisboa',
        'Parceiro ou funcionário que valida cupons',
        'Equipa administrativa da Impakta/City Pass',
        'Gestores comerciais que acompanham faturação, parceiros e ranking'
      ],
      valuePropositionMarkdown: 'A plataforma entrega receita digital direta, controlo antifraude, melhor experiência turística e dados operacionais para gerir parceiros, planos, pagamentos, validações e performance comercial.',
      principles: [
        { title: 'Rastreabilidade por desenho', descriptionMarkdown: 'Cada requisito, cupom, validação, pagamento e métrica deve manter ligação explícita ao fluxo que o originou.' },
        { title: 'Experiência premium, operação simples', descriptionMarkdown: 'O cliente vê uma app elegante e direta; o parceiro executa validações rápidas; a administração recebe dados acionáveis.' },
        { title: 'Integrações isoladas', descriptionMarkdown: 'Pagamentos, autenticação social e mapas devem ficar em camadas adaptadoras para proteger o núcleo do produto.' },
        { title: 'Entrega por fases verificáveis', descriptionMarkdown: 'Cada fase deve fechar requisitos, diagramas, testes e roadmap antes de avançar.' }
      ],
      consequentIdeas: [
        { title: 'Pacotes temáticos e roteiros patrocinados', descriptionMarkdown: 'A camada de mapa e roteiros pode evoluir para campanhas com parceiros e experiências curadas.' },
        { title: 'Portal de parceiro com inteligência comercial', descriptionMarkdown: 'O histórico de validações pode alimentar dashboards por hora, zona, tipo de cliente e conversão.' },
        { title: 'Motor antifraude e auditoria', descriptionMarkdown: 'As regras de reutilização, expiração e validação podem tornar-se um serviço transversal reutilizável.' }
      ],
      updatedAt: now,
    },
  };
}

function buildDiscovery(project) {
  return {
    discovery: {
      marketSummaryMarkdown: 'O City Pass atua na intersecção entre turismo urbano, restauração, pagamentos digitais e promoção local. O produto tem força porque combina uma proposta simples para o visitante com uma operação mensurável para a marca: vender acesso a benefícios e provar a utilização real por parceiro, cupom e período.\n\nA descoberta reconstruída a partir dos requisitos indica que o maior risco não está apenas na app mobile, mas na consistência operacional: regras de planos, validação, antifraude, reporting, pagamentos e papel do parceiro precisam funcionar como um sistema único. A vantagem competitiva nasce quando a experiência turística e a rastreabilidade administrativa avançam juntas.',
      marketSizing: {
        tam: 'Turistas e residentes que procuram experiências gastronómicas e benefícios em Lisboa e outras cidades turísticas.',
        sam: 'Visitantes com intenção de consumo em restaurantes/parceiros aderentes e abertura para passes digitais.',
        som: 'Primeira operação City Pass com parceiros definidos, planos por dias/pessoas e validação digital controlada.',
        notesMarkdown: 'Os valores financeiros devem ser confirmados com dados reais de parceiros, tráfego turístico, ticket médio, comissão e margem por plano.'
      },
      segments: [
        { name: 'Turista de curta estadia', descriptionMarkdown: 'Compra um plano para usar benefícios durante poucos dias.', painPoints: ['Pouco tempo para decidir', 'Necessidade de confiança', 'Descoberta de locais relevantes'] },
        { name: 'Cliente local recorrente', descriptionMarkdown: 'Usa passes e histórico para repetir experiências.', painPoints: ['Benefícios dispersos', 'Falta de clareza sobre validade', 'Gestão de cupons'] },
        { name: 'Parceiro aderente', descriptionMarkdown: 'Valida cupons e quer visibilidade sobre impacto.', painPoints: ['Validação lenta', 'Fraude/reutilização', 'Pouca leitura comercial'] },
        { name: 'Administração City Pass', descriptionMarkdown: 'Gere planos, parceiros, faturação, rankings e relatórios.', painPoints: ['Dados manuais', 'Baixa auditabilidade', 'Dificuldade em medir performance'] }
      ],
      competitors: [
        { name: 'Passes turísticos generalistas', descriptionMarkdown: 'Agregam atrações e descontos em várias categorias.', differentiation: 'City Pass pode especializar-se em gastronomia/parceiros premium com reporting operacional.' },
        { name: 'Marketplaces de reservas e experiências', descriptionMarkdown: 'Focam descoberta e reserva.', differentiation: 'O foco aqui é ativação de benefício, validação e dados do parceiro.' },
        { name: 'Campanhas manuais de desconto', descriptionMarkdown: 'Operam por códigos soltos, listas e conferência manual.', differentiation: 'O produto entrega QR, histórico, antifraude e cadeia auditável.' }
      ],
      businessModel: {
        revenueStreams: ['Venda direta de planos City Pass', 'Comissão ou revenue share por parceiro', 'Campanhas patrocinadas ou destaque de parceiros', 'Relatórios premium para parceiros'],
        costStructure: ['Desenvolvimento e manutenção da plataforma', 'Gateway de pagamento', 'Mapas/autenticação/serviços externos', 'Suporte operacional e onboarding de parceiros'],
        channels: ['App mobile', 'Website/landing de aquisição', 'Parcerias com hotéis, operadores e restaurantes', 'Campanhas digitais geolocalizadas'],
        keyPartners: ['Parceiros gastronómicos', 'Gateway de pagamento', 'Google/Apple para autenticação, mapas e wallets', 'Equipa comercial e suporte']
      },
      commercialImpact: {
        objectivesMarkdown: 'Validar o MVP com planos compráveis, parceiros reais, validação antifraude e dashboard administrativo suficiente para acompanhar receita, utilização e qualidade operacional.',
        kpis: [
          { name: 'Conversão de compra de plano', target: 'A definir após baseline', rationale: 'Mede aderência da proposta de valor.' },
          { name: 'Taxa de utilização de cupons', target: 'A definir por plano/parceiro', rationale: 'Prova valor para cliente e parceiro.' },
          { name: 'Tempo médio de validação', target: 'Inferior a poucos segundos no fluxo principal', rationale: 'Protege a experiência no local.' },
          { name: 'Incidentes de reutilização/fraude', target: 'Próximo de zero nos casos cobertos', rationale: 'Valida as regras RNF e TC.' }
        ]
      },
      swot: {
        strengths: ['Cadeia de requisitos completa e testável', 'Experiência cliente/parceiro/admin integrada', 'Dados comerciais nativos'],
        weaknesses: ['Dependência de regras comerciais ainda por confirmar', 'Integrações externas críticas', 'Onboarding operacional de parceiros'],
        opportunities: ['Expansão para roteiros e campanhas', 'Dashboard premium para parceiros', 'Novas cidades ou categorias de benefício'],
        threats: ['Mudanças nos custos de gateways/mapas', 'Adoção lenta por parceiros', 'Concorrência de passes turísticos estabelecidos']
      },
      goToMarketMarkdown: 'Começar com um conjunto controlado de parceiros, planos simples e medição forte. A primeira campanha deve provar compra, geração de cupom, validação no parceiro e leitura administrativa. Só depois expandir roteiros, wallets, relatórios avançados e portal de parceiro completo.',
      assumptions: [
        'Os parceiros aceitam validação digital no ponto de atendimento.',
        'As regras de desconto, expiração e reembolso serão fechadas antes da entrega final.',
        'O gateway escolhido cobre Cartão, MB WAY e wallets com a experiência pretendida.',
        'A operação terá responsáveis claros por suporte, auditoria e gestão de parceiros.'
      ],
      updatedAt: now,
    },
  };
}

function mermaidSafe(label) {
  return String(label || '').replace(/"/g, "'");
}

function buildDiagrams(project, hierarchy) {
  const stakeholderIds = collectByType(project, 'stakeholder').map((req) => req.id);
  const functionalIds = collectByType(project, 'functional').map((req) => req.id);
  const rnfIds = collectByType(project, 'non_functional').map((req) => req.id);
  const testIds = collectByType(project, 'test_case').map((req) => req.id);
  const allReqIds = ensureArray(project.requirements).map((req) => req.id);
  const phaseIds = ensureArray(project.phases).flatMap((phase) => idsForPhase(project, phase.name, 35));

  return [
    {
      id: 'diag_citypass_delivery_scope',
      type: 'product_scope_map',
      title: 'City Pass - Product Scope Map',
      description: 'Reverse delivery scope from idea, discovery and requirements.',
      module: 'System',
      linkedRequirementIds: unique([...stakeholderIds.slice(0, 44), ...functionalIds.slice(0, 20)]),
      sourceText: [
        'flowchart TB',
        '  Idea["Idea: City Pass digital benefits platform"]',
        '  Discovery["Discovery: tourism, partners, payments, operations"]',
        '  Req["Requirements: 305 records / 100% V-map chains"]',
        '  InScope["In scope: client app, partner validation, admin dashboard, backend, database, integrations"]',
        '  OutScope["Controlled later: reservations, POS fiscal automation, real-time chat, AI itinerary generation"]',
        '  Delivery["Delivery line: Idea -> Discovery -> Requirements -> Diagrams -> Roadmap"]',
        '  Idea --> Discovery --> Req --> InScope --> Delivery',
        '  Req --> OutScope',
      ].join('\n'),
    },
    {
      id: 'diag_citypass_stakeholders',
      type: 'stakeholder_actor_map',
      title: 'City Pass - Stakeholder and Actor Map',
      description: 'Actors and external dependencies linked to requirement ownership.',
      module: 'System',
      linkedRequirementIds: stakeholderIds,
      sourceText: [
        'flowchart LR',
        '  Client["Cliente final"] --> App["App City Pass"]',
        '  Partner["Parceiro / funcionario"] --> PartnerApp["Portal/App Partner"]',
        '  Admin["Admin City Pass"] --> AdminPanel["Painel administrativo"]',
        '  App --> Backend["Backend API"]',
        '  PartnerApp --> Backend',
        '  AdminPanel --> Backend',
        '  Backend --> Database["Database"]',
        '  Backend --> Payments["Gateway pagamentos / MB WAY / Wallets"]',
        '  Backend --> Auth["Google / Apple authentication"]',
        '  Backend --> Maps["Maps and routes"]',
        '  Impakta["Impakta / Gestao comercial"] --> AdminPanel',
      ].join('\n'),
    },
    {
      id: 'diag_citypass_vmap_traceability',
      type: 'requirements_diagram',
      title: 'City Pass - V-map Traceability',
      description: 'Requirement layers and chain completeness for frontend orphan visibility.',
      module: 'System',
      linkedRequirementIds: allReqIds,
      sourceText: [
        'flowchart TB',
        `  STK["Stakeholder requirements (${stakeholderIds.length})"]`,
        `  FR["Functional requirements (${functionalIds.length})"]`,
        `  RNF["Non-functional requirements (${rnfIds.length})"]`,
        `  TC["Test cases (${testIds.length})"]`,
        `  Chains["Complete V-map chains (${hierarchy.chains.length})"]`,
        `  Orphans["Visible orphan bucket (${hierarchy.orphans.length})"]`,
        `  Invalid["Invalid links (${hierarchy.invalidLinks.length})"]`,
        '  STK --> FR --> RNF --> TC',
        '  STK --> Chains',
        '  FR --> Chains',
        '  RNF --> Chains',
        '  TC --> Chains',
        '  Chains --> Orphans',
        '  Chains --> Invalid',
      ].join('\n'),
    },
    {
      id: 'diag_citypass_data_api',
      type: 'c4_container',
      title: 'City Pass - Data and API Containers',
      description: 'Efficient database-first runtime model from requirements to storage and integrations.',
      module: 'Backend',
      linkedRequirementIds: unique([
        ...byModule(project, 'Backend', 20),
        ...byModule(project, 'Database', 20),
        ...byModule(project, 'Integrations', 20),
        ...byModule(project, 'System', 20),
      ]),
      sourceText: [
        '@startuml',
        'actor Cliente',
        'actor Parceiro',
        'actor Admin',
        'rectangle "City Pass Platform" {',
        '  [Mobile App] as Mobile',
        '  [Partner Portal] as PartnerPortal',
        '  [Admin Panel] as AdminPanel',
        '  [Backend API] as Api',
        '  database "Relational Database" as Db',
        '  [Audit and Reporting] as Audit',
        '}',
        'cloud "Payment Gateway" as Pay',
        'cloud "OAuth Providers" as OAuth',
        'cloud "Maps Provider" as Maps',
        'Cliente --> Mobile',
        'Parceiro --> PartnerPortal',
        'Admin --> AdminPanel',
        'Mobile --> Api',
        'PartnerPortal --> Api',
        'AdminPanel --> Api',
        'Api --> Db',
        'Api --> Audit',
        'Api --> Pay',
        'Api --> OAuth',
        'Api --> Maps',
        '@enduml',
      ].join('\n'),
    },
    {
      id: 'diag_citypass_phase_architecture',
      type: 'requirements_diagram',
      title: 'City Pass - Requirements to Delivery Phases',
      description: 'Phase-level grouping used to derive the roadmap.',
      module: 'System',
      linkedRequirementIds: unique(phaseIds),
      sourceText: [
        'flowchart TB',
        '  Req["Requirements database"]',
        ...ensureArray(project.phases).map((phase, index) => {
          const ids = idsForPhase(project, phase.name, 9999);
          return `  F${index + 1}["${mermaidSafe(phase.name)} (${ids.length} req.)"]`;
        }),
        ...ensureArray(project.phases).map((phase, index) => `  Req --> F${index + 1}`),
        ...ensureArray(project.phases).slice(1).map((phase, index) => `  F${index + 1} --> F${index + 2}`),
      ].join('\n'),
    },
  ];
}

function buildRoadmap(project) {
  const synced = roadmapSync.syncRoadmapFromPlanPhases(project, { assignDates: true });
  const phases = ensureArray(synced.roadmap?.phases).length
    ? synced.roadmap.phases
    : ensureArray(project.roadmap?.phases);
  const patterns = [
    'Vertical Slice MVP with clean modular boundaries',
    'Experience and Maps Integration Slice',
    'Administrative Analytics Slice',
    'External Integrations Adapter Layer',
    'Partner Portal Operational Slice',
  ];

  const enriched = phases.map((phase, index) => {
    const planPhase = ensureArray(project.phases)[index] || {};
    const requirementIds = unique(ensureArray(phase.requirementIds).length
      ? phase.requirementIds
      : idsForPhase(project, planPhase.name, 9999));
    const tests = testsForPhase(project, requirementIds);
    return {
      ...phase,
      order: index + 1,
      name: textOr(phase.name, planPhase.name || `Fase ${index + 1}`),
      goalMarkdown: textOr(phase.goalMarkdown, planPhase.objective || 'Entregar incremento verificável do City Pass.'),
      deliverableMarkdown: textOr(
        phase.deliverableMarkdown,
        ensureArray(planPhase.deliverables).join('; ') || 'Incremento funcional validado por requisitos, diagramas e testes.'
      ),
      requirementIds,
      moduleTags: moduleTagsForReqIds(project, requirementIds),
      designPattern: textOr(phase.designPattern, patterns[index] || 'Incremental delivery with traceability gates'),
      dependsOn: index > 0 ? [phases[index - 1]?.id].filter(Boolean) : [],
      status: textOr(phase.status, 'planned'),
      milestones: ensureArray(phase.milestones).length ? phase.milestones : [
        { name: 'Fechar requisitos e critérios da fase', date: phase.startDate || '' },
        { name: 'Validar arquitetura e integrações da fase', date: '' },
        { name: 'Executar testes V-map e aceite operacional', date: phase.endDate || '' },
      ],
      tests,
      risks: [
        'Regras comerciais não confirmadas podem alterar escopo.',
        index >= 3 ? 'Dependência de fornecedores externos de pagamento/autenticação.' : '',
        tests.length ? '' : 'Rever cobertura de testes específicos da fase antes de delivery.',
      ].filter(Boolean),
    };
  });

  return {
    summaryMarkdown: 'Roadmap derivado dos diagramas e das fases de implementação existentes. Cada fase mantém ligação a requisitos, módulos, testes e dependências, usando a V-map completa como gate de rastreabilidade.',
    phases: enriched,
    updatedAt: now,
  };
}

function buildRoadmapGantt(project) {
  const lines = [
    'gantt',
    '  title City Pass delivery roadmap',
    '  dateFormat  YYYY-MM-DD',
    '  axisFormat  %d/%m',
  ];
  for (const phase of ensureArray(project.roadmap?.phases)) {
    const start = textOr(phase.startDate, '2026-07-06');
    const end = textOr(phase.endDate);
    const duration = end ? `${start}, ${end}` : `${start}, 21d`;
    lines.push(`  section ${phase.name.replace(/:/g, '-')}`);
    lines.push(`  ${phase.name.replace(/:/g, '-')} :${phase.id}, ${duration}`);
  }
  return lines.join('\n');
}

function upsertDiagram(project, spec) {
  project.diagramArtifacts = ensureArray(project.diagramArtifacts);
  const existing = project.diagramArtifacts.find((diagram) => diagram.id === spec.id);
  const normalized = diagrams.normalizeDiagramArtifact({
    ...existing,
    ...spec,
    projectId: project.id,
    generatedBy: 'ai-agent',
    status: existing?.status || 'draft',
    validationStatus: 'not_validated',
    metadata: {
      ...(existing?.metadata || {}),
      ...(spec.metadata || {}),
      generatedFrom: 'requirements_delivery_line',
      updatedBy: actor,
    },
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  });
  if (existing) Object.assign(existing, normalized);
  else project.diagramArtifacts.unshift(normalized);

  project.diagramVersions = ensureArray(project.diagramVersions).filter(
    (version) => !(version.diagramArtifactId === spec.id && version.createdBy === actor)
  );
  project.diagramVersions.unshift(diagrams.normalizeDiagramVersion({
    id: `dver_${spec.id}`,
    diagramArtifactId: spec.id,
    version: normalized.version,
    sourceText: normalized.sourceText,
    metadata: normalized.metadata,
    createdAt: now,
    createdBy: actor,
    changeSummary: 'Generated from complete City Pass delivery line',
  }));
}

function updateStages(project) {
  const completed = new Set(['idea', 'discovery', 'requirements', 'architecture', 'roadmap']);
  project.stages = ensureArray(project.stages).map((stage) => ({
    ...stage,
    status: completed.has(stage.id) ? 'completed' : stage.status,
    updatedAt: completed.has(stage.id) ? now : stage.updatedAt,
  }));
}

function hydrateExecutionPlanBodies(project) {
  project.executionPlans = ensureArray(project.executionPlans).map((plan) => {
    if (!plan?.blobStored) return plan;
    const blobPath = blobStore.blobPath(dataDir, project.id, blobStore.KIND.EXEC_PLAN, plan.id);
    if (!fs.existsSync(blobPath)) return plan;
    const body = readJson(blobPath);
    const bodyTasks = new Map(ensureArray(body.tasks).map((task) => [task.id, task]));
    return {
      ...plan,
      masterPlanMarkdown: textOr(body.masterPlanMarkdown, plan.masterPlanMarkdown),
      tasks: ensureArray(plan.tasks).length
        ? ensureArray(plan.tasks).map((task) => {
          const hydrated = bodyTasks.get(task.id) || {};
          return {
            ...hydrated,
            ...task,
            instruction: textOr(task.instruction, hydrated.instruction),
            outputSchema: textOr(task.outputSchema, hydrated.outputSchema),
            verificationPrompt: textOr(task.verificationPrompt, hydrated.verificationPrompt),
            mergePrompt: textOr(task.mergePrompt, hydrated.mergePrompt),
            regressionGuardPrompt: textOr(task.regressionGuardPrompt, hydrated.regressionGuardPrompt),
            reversePrompt: textOr(task.reversePrompt, hydrated.reversePrompt),
          };
        })
        : ensureArray(body.tasks),
    };
  });
}

function fillExecutionPlanPrompts(project) {
  project.executionPlans = ensureArray(project.executionPlans).map((rawPlan) => {
    const plan = executionPlans.normalizeExecutionPlan(rawPlan);
    const profile = executionPlans.resolveModelProfile(plan, plan.config);
    const tasks = ensureArray(plan.tasks).map((task) => ({
      ...task,
      instruction: textOr(task.instruction, executionPlans.buildTaskPrompt(plan, task, project, { deliveryOs })),
      verificationPrompt: textOr(task.verificationPrompt, executionPlans.buildVerificationPrompt(task, profile)),
      mergePrompt: textOr(task.mergePrompt, task.role === 'merge' ? executionPlans.buildMergePrompt(task, plan) : ''),
      regressionGuardPrompt: textOr(task.regressionGuardPrompt, executionPlans.buildRegressionGuardPrompt(task, plan)),
    }));
    return {
      ...plan,
      ...rawPlan,
      tasks,
      masterPlanMarkdown: textOr(plan.masterPlanMarkdown, rawPlan.masterPlanMarkdown),
      blobStored: rawPlan.blobStored,
      hasMasterPlan: rawPlan.hasMasterPlan,
      taskCount: rawPlan.taskCount,
    };
  });
}

function updateIndex(project) {
  const index = readJson(indexPath);
  index.meta = index.meta || {};
  index.meta.updatedAt = now;
  index.meta.storageLayout = 'hybrid-v2';
  const diskProject = { ...project, requirementCount: ensureArray(project.requirements).length };
  const entry = buildIndexEntry(diskProject);
  const pos = ensureArray(index.projects).findIndex((item) => item.id === project.id);
  if (pos >= 0) index.projects[pos] = entry;
  else index.projects.push(entry);
  fs.writeFileSync(indexPath, `${JSON.stringify(index)}\n`, 'utf8');
}

async function main() {
  const sqliteStore = createSqliteStore({ dataDir });
  const project = readJson(projectPath);
  let requirements = ensureArray(project.requirements);
  if (!requirements.length) requirements = sqliteStore.loadRequirements(project.id);
  if (!requirements.length) throw new Error('City Pass project has no requirements in JSON or SQLite.');
  project.requirements = requirements;
  hydrateExecutionPlanBodies(project);

  const hierarchy = reqHierarchy.analyzeRequirementHierarchy(project);
  if (hierarchy.orphans.length || hierarchy.invalidLinks.length || hierarchy.incompleteChains.length) {
    throw new Error(`V-map is not clean: ${hierarchy.orphans.length} orphans, ${hierarchy.invalidLinks.length} invalid links, ${hierarchy.incompleteChains.length} incomplete chains.`);
  }

  const idea = buildIdea(project, hierarchy);
  project.ideaBriefMarkdown = idea.ideaBriefMarkdown;
  project.vision = deliveryOs.normalizeVision(idea.vision, project);
  upsertArtifact(project, {
    id: 'art_citypass_reverse_idea',
    name: 'City Pass - Ideia reconstruida dos requisitos',
    description: 'Documento humano de ideia criado a partir da V-map completa e requisitos existentes.',
    bodyMarkdown: `${idea.ideaBriefMarkdown}\n\n## Principios\n\n${markdownList(idea.vision.principles.map((p) => `${p.title}: ${p.descriptionMarkdown}`))}`,
    stageId: 'idea',
    relatedRequirementIds: collectByType(project, 'stakeholder').map((req) => req.id),
    metadata: { generatedFrom: 'requirements_reverse_process' },
  });
  upsertPromptRun(project, makePromptRun({
    id: 'prun_citypass_reverse_idea',
    agentType: 'reverse_idea',
    stageId: 'idea',
    targetOutput: 'idea_brief',
    fullPrompt: deliveryOs.buildReverseIdeaPrompt(project),
    parsedOutput: idea,
    summaryMarkdown: 'Reverse process applied: requirements -> idea.',
  }));

  const discovery = buildDiscovery(project);
  project.discovery = deliveryOs.normalizeDiscovery(discovery.discovery);
  upsertArtifact(project, {
    id: 'art_citypass_reverse_discovery',
    name: 'City Pass - Discovery reconstruido dos requisitos',
    description: 'Dossier de discovery derivado dos requisitos, atores, integrações e riscos operacionais.',
    bodyMarkdown: [
      '## Discovery',
      discovery.discovery.marketSummaryMarkdown,
      '',
      '## Segmentos',
      markdownList(discovery.discovery.segments.map((s) => `${s.name}: ${s.descriptionMarkdown}`)),
      '',
      '## Modelo de negocio',
      markdownList(discovery.discovery.businessModel.revenueStreams),
      '',
      '## Assumptions',
      markdownList(discovery.discovery.assumptions),
    ].join('\n'),
    stageId: 'discovery',
    metadata: { generatedFrom: 'requirements_reverse_process' },
  });
  upsertPromptRun(project, makePromptRun({
    id: 'prun_citypass_reverse_discovery',
    agentType: 'discovery_research',
    stageId: 'discovery',
    targetOutput: 'discovery_v1',
    fullPrompt: deliveryOs.buildDiscoveryPrompt(project),
    parsedOutput: discovery,
    summaryMarkdown: 'Reverse process applied: idea + requirements -> discovery.',
  }));

  const archPlan = executionPlans.buildExecutionPlan('stage_transition', project, {
    fromStageId: 'requirements',
    toStageId: 'architecture',
    direction: 'forward',
    modelProfileId: 'large',
  }, { deliveryOs });
  archPlan.id = 'plan_citypass_requirements_to_architecture';
  archPlan.status = 'applied';
  archPlan.createdAt = archPlan.createdAt || now;
  archPlan.updatedAt = now;
  project.executionPlans = ensureArray(project.executionPlans).filter((plan) => plan.id !== archPlan.id);
  project.executionPlans.unshift(archPlan);
  project.executionPlans = project.executionPlans.slice(0, 20);

  const diagramSpecs = buildDiagrams(project, hierarchy);
  for (const spec of diagramSpecs) upsertDiagram(project, spec);
  project.roadmap = deliveryOs.normalizeRoadmap(buildRoadmap(project), project);
  upsertDiagram(project, {
    id: 'diag_citypass_roadmap_from_architecture',
    type: 'roadmap_gantt',
    title: 'City Pass - Roadmap from Architecture',
    description: 'Roadmap generated from architecture diagrams and implementation phases.',
    module: 'System',
    linkedRequirementIds: unique(ensureArray(project.roadmap.phases).flatMap((phase) => phase.requirementIds).slice(0, 180)),
    linkedRoadmapPhaseIds: ensureArray(project.roadmap.phases).map((phase) => phase.id),
    sourceText: buildRoadmapGantt(project),
  });
  diagrams.normalizeProjectDiagramFields(project);

  const archOutput = {
    diagrams: diagramSpecs.map((spec) => ({
      id: spec.id,
      title: spec.title,
      type: spec.type,
      linkedRequirementCount: ensureArray(spec.linkedRequirementIds).length,
    })),
    executionPlanId: archPlan.id,
    requiresHumanConfirmation: true,
  };
  upsertPromptRun(project, makePromptRun({
    id: 'prun_citypass_requirements_to_architecture',
    agentType: 'stage_transition',
    stageId: 'architecture',
    targetOutput: 'requirements_to_architecture',
    fullPrompt: executionPlans.buildPromptPackMarkdown(archPlan, project),
    parsedOutput: archOutput,
    summaryMarkdown: 'Forward process applied: requirements -> diagrams/architecture.',
  }));

  const roadPlan = executionPlans.buildExecutionPlan('stage_transition', project, {
    fromStageId: 'architecture',
    toStageId: 'roadmap',
    direction: 'forward',
    modelProfileId: 'large',
  }, { deliveryOs });
  roadPlan.id = 'plan_citypass_architecture_to_roadmap';
  roadPlan.status = 'applied';
  roadPlan.createdAt = roadPlan.createdAt || now;
  roadPlan.updatedAt = now;
  project.executionPlans = ensureArray(project.executionPlans).filter((plan) => plan.id !== roadPlan.id);
  project.executionPlans.unshift(roadPlan);
  project.executionPlans = project.executionPlans.slice(0, 20);
  upsertPromptRun(project, makePromptRun({
    id: 'prun_citypass_architecture_to_roadmap',
    agentType: 'roadmap_plan',
    stageId: 'roadmap',
    targetOutput: 'roadmap_v1',
    fullPrompt: deliveryOs.buildRoadmapPrompt(project),
    parsedOutput: { roadmap: project.roadmap, executionPlanId: roadPlan.id },
    summaryMarkdown: 'Forward process applied: diagrams/architecture -> roadmap.',
  }));

  upsertArtifact(project, {
    id: 'art_citypass_architecture_pack',
    name: 'City Pass - Architecture pack from requirements',
    description: 'Pacote de diagramas derivado dos requisitos e da V-map completa.',
    bodyMarkdown: [
      '## Architecture pack',
      'Diagramas gerados e ligados aos requisitos:',
      markdownList(diagramSpecs.map((spec) => `${spec.title} (${spec.type})`)),
      '',
      `Cobertura V-map: ${hierarchy.stats.chainCoveragePct}%`,
      `Orfaos: ${hierarchy.orphans.length}`,
    ].join('\n'),
    stageId: 'architecture',
    relatedRequirementIds: ensureArray(project.requirements).map((req) => req.id),
    metadata: { generatedFrom: 'requirements_to_diagrams' },
  });

  upsertArtifact(project, {
    id: 'art_citypass_roadmap_pack',
    name: 'City Pass - Roadmap derivado dos diagramas',
    description: 'Roadmap por fases criado a partir dos diagramas de arquitetura e requisitos.',
    bodyMarkdown: [
      '## Roadmap',
      project.roadmap.summaryMarkdown,
      '',
      ...ensureArray(project.roadmap.phases).map((phase) => [
        `### ${phase.name}`,
        phase.goalMarkdown,
        `Requisitos: ${ensureArray(phase.requirementIds).length}`,
        `Modulos: ${ensureArray(phase.moduleTags).join(', ') || 'n/a'}`,
        `Pattern: ${phase.designPattern}`,
      ].join('\n')),
    ].join('\n\n'),
    stageId: 'roadmap',
    relatedRequirementIds: unique(ensureArray(project.roadmap.phases).flatMap((phase) => phase.requirementIds)),
    metadata: { generatedFrom: 'diagrams_to_roadmap' },
  });

  project.traceLinks = deliveryOs.mergeTraceLinks(project.traceLinks, deliveryOs.autoDeriveTraceLinks(project));
  updateStages(project);
  fillExecutionPlanPrompts(project);
  project.storageHybrid = true;
  project.requirementsInDb = true;
  project.requirementCount = requirements.length;
  project.updatedAt = now;
  project.updatedBy = actor;

  sqliteStore.saveRequirements(project.id, project.requirements);
  if (!sqliteStore.verifyRequirementsSaved(project.id, project.requirements)) {
    throw new Error('SQLite verification failed after delivery-line build.');
  }

  await blobStore.externalizeProjectBlobs(project, dataDir, writeJson);
  const disk = blobStore.prepareProjectForDisk(project);
  await writeJson(projectPath, disk, { compact: true });
  updateIndex(project);

  const saved = readJson(projectPath);
  const dbReqs = sqliteStore.loadRequirements(project.id);
  const verifyProject = { ...saved, requirements: dbReqs };
  const verification = reqHierarchy.analyzeRequirementHierarchy(verifyProject);
  const report = {
    projectId: project.id,
    requirementsInJson: ensureArray(saved.requirements).length,
    requirementCount: saved.requirementCount,
    sqliteRows: dbReqs.length,
    sqliteVerified: sqliteStore.verifyRequirementsSaved(project.id, dbReqs),
    chainCoveragePct: verification.stats.chainCoveragePct,
    orphans: verification.orphans.length,
    invalidLinks: verification.invalidLinks.length,
    incompleteChains: verification.incompleteChains.length,
    diagrams: ensureArray(saved.diagramArtifacts).length,
    generatedDiagrams: ensureArray(saved.diagramArtifacts).filter((diagram) => textOr(diagram.metadata?.generatedFrom).includes('requirements')).length,
    roadmapPhases: ensureArray(saved.roadmap?.phases).length,
    promptRuns: ensureArray(saved.promptRuns).length,
    blobStoredPromptRuns: ensureArray(saved.promptRuns).filter((run) => run.blobStored).length,
    completedStages: ensureArray(saved.stages).filter((stage) => stage.status === 'completed').map((stage) => stage.id),
  };
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
