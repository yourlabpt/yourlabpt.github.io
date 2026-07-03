const crypto = require('crypto');
const { renderMarkdownToHtml, extractMermaidBlocks } = require('./markdown');
// Required lazily to avoid a circular dependency (phase-content requires this module for STAGE_ORDER).
function getPhaseContent() {
  return require('./phase-content');
}

const MODULE_TAGS = [
  'CustomerNeed',
  'Frontend',
  'Backend',
  'Database',
  'API',
  'Integration',
  'Tests',
  'Operations',
];

const TRACE_NODE_TYPES = [
  'client_request',
  'business_objective',
  'capability',
  'cluster',
  'stakeholder_requirement',
  'technical_requirement',
  'requirement',
  'artifact',
  'diagram',
  'architecture_object',
  'data_entity',
  'api_endpoint',
  'test_case',
  'deliverable',
  'monitoring_signal',
];

const INFORMATION_TYPES = [
  'audio_meeting',
  'free_text',
  'meeting_minutes',
  'client_feedback',
  'new_requirement',
  'requirement_change',
  'functional_diagram',
  'technical_document',
  'ai_response',
  'bug_incident',
  'improvement_idea',
];

const AGENT_TYPES = [
  'requirement_grouping',
  'requirement_hierarchy',
  'reverse_idea',
  'diagram_to_requirements',
  'requirements_to_architecture',
  'prompt_builder',
  'alternative_output_parser',
  'impact_regeneration',
  'meeting_classification',
  'discovery_research',
  'roadmap_plan',
  'roadmap_milestones',
  'implementation_stack',
  'implementation_tasks',
  'commercial_proposal',
  'consistency_checker',
  'traceability_auditor',
];

const ONION_LAYERS = [
  { id: 'client_request', label: 'Pedido do cliente' },
  { id: 'business_objective', label: 'Objetivo de negócio' },
  { id: 'capability', label: 'Funcionalidade do produto' },
  { id: 'cluster', label: 'Grupo de requisitos' },
  { id: 'stakeholder_requirement', label: 'Requisito de negócio' },
  { id: 'technical_requirement', label: 'Requisito técnico' },
  { id: 'architecture_object', label: 'Componente de arquitectura' },
  { id: 'implementation_module', label: 'Módulo de implementação' },
  { id: 'api_entity', label: 'API, entidade ou ecrã' },
  { id: 'test_case', label: 'Caso de teste' },
  { id: 'deliverable', label: 'Entregável' },
  { id: 'monitoring_signal', label: 'Monitorização' },
];

/** Explicações em linguagem simples — expostas na UI */
const PLATFORM_CONCEPTS = {
  stage: {
    title: 'Fase de entrega',
    short: 'Etapa do projecto: ideia → descoberta → requisitos → arquitectura → construção → entrega.',
  },
  capability: {
    title: 'Funcionalidade do produto',
    short: 'Bloco de valor que o utilizador reconhece — algo que o sistema «sabe fazer» de ponta a ponta.',
    example: 'City Pass: «Comprar plano», «Gerar cupom», «Validar cupom no restaurante».',
  },
  cluster: {
    title: 'Grupo de requisitos',
    short: 'Requisitos relacionados dentro de uma funcionalidade — como um epic ou história agrupada.',
    example: 'Grupo «Login social» com os requisitos de Google, Apple e e-mail.',
  },
  requirement: {
    title: 'Requisito',
    short: 'Descrição verificável do que o sistema deve fazer (negócio) ou como deve ser feito (técnico).',
  },
  module: {
    title: 'Módulo técnico',
    short: 'Onde o trabalho é implementado: ecrãs (Frontend), serviços (Backend) ou dados (Base de dados).',
  },
  architecturePack: {
    title: 'Pacote de arquitectura',
    short: 'Desenho técnico: componentes, tabelas de dados, APIs e riscos para um módulo.',
  },
  artifact: {
    title: 'Artefacto',
    short: 'Documento ou resultado produzido numa fase — diagrama, pacote técnico, nota de reunião.',
  },
  humanReview: {
    title: 'Revisão humana',
    short: 'Antes de gravar o que a IA propôs, alguém da equipa lê, valida e aprova as alterações.',
  },
  traceLink: {
    title: 'Ligação de rastreabilidade',
    short: 'Liga duas peças do projecto — ex.: «este requisito vem deste pedido do cliente».',
  },
  snapshot: {
    title: 'Snapshot de versão',
    short: 'Cópia do projecto num momento — para comparar ou voltar atrás com segurança.',
  },
  promptRun: {
    title: 'Execução de agente',
    short: 'Prompt enviado à IA + resposta colada. Submetes para revisão antes de aplicar ao projecto.',
  },
};

const STAGE_CONCEPT_KEYS = {
  idea: ['stage', 'artifact'],
  discovery: ['stage', 'requirement'],
  requirements: ['capability', 'cluster', 'requirement', 'humanReview'],
  architecture: ['architecturePack', 'module', 'artifact'],
  roadmap: ['stage', 'artifact'],
  implementation: ['module', 'requirement'],
  validation: ['requirement', 'artifact'],
  delivery: ['artifact', 'stage'],
  operations: ['artifact', 'traceLink'],
};

const STAGE_FOCUS = {
  idea: 'Clarificar o problema, para quem é a solução e o que entra no primeiro release.',
  discovery: 'Recolher contexto do cliente, atas e pedidos antes de escrever requisitos.',
  requirements: 'Organizar requisitos por funcionalidade do produto e validar o que falta clarificar.',
  architecture: 'Definir componentes, dados e APIs por módulo técnico (Frontend, Backend, etc.).',
  roadmap: 'Ordenar fases e dependências — o que se constrói primeiro.',
  implementation: 'Construir em partes pequenas, ligadas aos requisitos aprovados.',
  validation: 'Confirmar com testes que o sistema cumpre o acordado.',
  delivery: 'Preparar documentação e entrega ao cliente.',
  operations: 'Acompanhar em produção e registar melhorias ou incidentes.',
};

const STAGE_NEXT_HINT = {
  idea: 'Completa o resumo da ideia (Idea Brief) e avança para Descoberta para mapear o contexto.',
  discovery: 'Consolida atas e feedback; depois agrupa requisitos por funcionalidade do produto.',
  requirements: 'Aprova os grupos de requisitos e avança para Arquitectura — use «Gerar prompt de arquitectura» no painel de diagramas.',
  architecture: 'Valida o desenho técnico e monta o roadmap de implementação.',
  roadmap: 'Divide a fase actual em tarefas pequenas para desenvolvimento.',
  implementation: 'Implementa e liga cada entrega aos requisitos correspondentes.',
  validation: 'Confirma aceitação e prepara o pacote de entrega.',
  delivery: 'Entrega ao cliente e define o que monitorizar em produção.',
  operations: 'Regista métricas e incidentes como novos pedidos de alteração.',
};

const STAGE_ORDER = [
  'idea', 'discovery', 'requirements', 'architecture', 'roadmap',
  'implementation', 'validation', 'delivery', 'operations',
];

const STAGE_TAB_LINKS = {
  idea: [
    { tab: 'projeto', label: 'Visão do projecto', hint: 'Alterações afectam a ideia inicial' },
    { tab: 'documentos', label: 'Documentos base', hint: 'Contexto de negócio' },
    { tab: 'deliveryos', label: 'Linha de entrega', hint: 'Fase Ideia' },
  ],
  discovery: [
    { tab: 'documentos', label: 'Documentos', hint: 'Material de descoberta' },
    { tab: 'atas', label: 'Atas', hint: 'Reuniões de alinhamento' },
    { tab: 'perguntas', label: 'Perguntas', hint: 'Lacunas a clarificar' },
    { tab: 'deliveryos', label: 'Linha de entrega', hint: 'Fase Descoberta' },
  ],
  requirements: [
    { tab: 'requisitos', label: 'Requisitos', hint: 'Propaga para arquitectura' },
    { tab: 'perguntas', label: 'Clarificações', hint: 'Dúvidas sobre requisitos' },
    { tab: 'atas', label: 'Atas', hint: 'Decisões que mudam requisitos' },
    { tab: 'documentos', label: 'Texto base', hint: 'Importar e gerar' },
    { tab: 'deliveryos', label: 'Linha de entrega', hint: 'Fase Requisitos' },
  ],
  architecture: [
    { tab: 'deliveryos', label: 'Explorador de arquitectura', hint: 'Diagramas e componentes' },
    { tab: 'requisitos', label: 'Requisitos ligados', hint: 'Rastrear origem' },
    { tab: 'fases', label: 'Riscos técnicos', hint: 'Impacto no plano' },
    { tab: 'atas', label: 'Atas', hint: 'Mudanças de arquitectura' },
  ],
  roadmap: [
    { tab: 'fases', label: 'Fases & Riscos', hint: 'Roadmap comercial' },
    { tab: 'requisitos', label: 'Requisitos', hint: 'Priorização' },
    { tab: 'deliveryos', label: 'Linha de entrega', hint: 'Fase Roadmap' },
  ],
  implementation: [
    { tab: 'requisitos', label: 'Requisitos', hint: 'Critérios de implementação' },
    { tab: 'gerar', label: 'Gerar documentação', hint: 'Docs técnicos' },
    { tab: 'fases', label: 'Plano', hint: 'Fases de execução' },
  ],
  validation: [
    { tab: 'requisitos', label: 'Requisitos', hint: 'Verificação SMART' },
    { tab: 'perguntas', label: 'Perguntas abertas', hint: 'Bloqueios' },
    { tab: 'deliveryos', label: 'Linha de entrega', hint: 'Fase Validação' },
  ],
  delivery: [
    { tab: 'gerar', label: 'Documentação final', hint: 'Pacotes de entrega' },
    { tab: 'projeto', label: 'Estado do projecto', hint: 'Fecho' },
    { tab: 'atas', label: 'Atas', hint: 'Aceitação e scope final' },
  ],
  operations: [
    { tab: 'atividade', label: 'Actividade', hint: 'Histórico' },
    { tab: 'deliveryos', label: 'Operações', hint: 'Monitorização' },
  ],
};

const TAB_STAGE_AFFINITY = {
  projeto: 'idea',
  documentos: 'discovery',
  atas: 'requirements',
  perguntas: 'requirements',
  requisitos: 'requirements',
  fases: 'roadmap',
  gerar: 'delivery',
  deliveryos: null,
  atividade: 'operations',
  definicoes: null,
};

const MEETING_IMPACT_SCOPES = [
  { id: 'discovery', label: 'Descoberta / alinhamento', stageId: 'discovery' },
  { id: 'idea', label: 'Ideia / visão', stageId: 'idea' },
  { id: 'requirements', label: 'Requisitos', stageId: 'requirements' },
  { id: 'architecture', label: 'Arquitectura', stageId: 'architecture' },
  { id: 'delivery', label: 'Entrega final', stageId: 'delivery' },
];

const MEETING_IMPACT_PROPAGATION = {
  discovery: {
    upstream: ['idea'],
    downstream: ['requirements', 'architecture', 'roadmap'],
    hint: 'Alinhamentos iniciais — pode afectar ideia (atrás) e requisitos/arquitectura (frente).',
  },
  idea: {
    upstream: [],
    downstream: ['discovery', 'requirements', 'architecture', 'roadmap', 'implementation', 'validation', 'delivery'],
    hint: 'Mudança de visão — propaga por quase todas as fases posteriores.',
  },
  requirements: {
    upstream: ['idea', 'discovery'],
    downstream: ['architecture', 'roadmap', 'implementation', 'validation', 'delivery'],
    hint: 'Decisões de requisitos — rever descoberta e actualizar arquitectura e entrega.',
  },
  architecture: {
    upstream: ['requirements', 'discovery'],
    downstream: ['roadmap', 'implementation', 'validation', 'delivery'],
    hint: 'Mudança técnica — validar requisitos de origem e plano de implementação.',
  },
  delivery: {
    upstream: ['validation', 'implementation', 'requirements', 'architecture'],
    downstream: ['operations'],
    hint: 'Aceitação ou scope final — pode exigir revisão de fases anteriores.',
  },
};

/**
 * Stages an ata touches. Prefers the AI-classified `impactedStageIds`
 * (multi-phase); falls back to the legacy single `targetStageId`/`impactScope`.
 */
function meetingImpactedStageIds(minute) {
  const fromAi = ensureArray(minute?.impactedStageIds)
    .map((id) => textOr(id))
    .filter((id) => STAGE_ORDER.includes(id));
  if (fromAi.length) return [...new Set(fromAi)];
  const legacy = textOr(minute?.targetStageId, minute?.impactScope, 'requirements');
  return STAGE_ORDER.includes(legacy) ? [legacy] : ['requirements'];
}

function buildMinutePropagationPlan(minutes) {
  const list = ensureArray(minutes);
  const primaryStageIds = new Set();
  const upstreamStageIds = new Set();
  const downstreamStageIds = new Set();
  const hints = [];

  for (const minute of list) {
    const impacted = meetingImpactedStageIds(minute);
    impacted.forEach((id) => primaryStageIds.add(id));
    for (const stageId of impacted) {
      const map = MEETING_IMPACT_PROPAGATION[stageId]
        || MEETING_IMPACT_PROPAGATION[textOr(minute?.impactScope, 'requirements')]
        || MEETING_IMPACT_PROPAGATION.requirements;
      map.upstream.forEach((id) => upstreamStageIds.add(id));
      map.downstream.forEach((id) => downstreamStageIds.add(id));
      if (map.hint) hints.push(map.hint);
    }
  }

  const allAffectedStageIds = [...new Set([
    ...primaryStageIds,
    ...upstreamStageIds,
    ...downstreamStageIds,
  ])].filter((id) => STAGE_ORDER.includes(id));

  return {
    primaryStageIds: [...primaryStageIds],
    upstreamStageIds: [...upstreamStageIds].filter((id) => STAGE_ORDER.includes(id)),
    downstreamStageIds: [...downstreamStageIds].filter((id) => STAGE_ORDER.includes(id)),
    allAffectedStageIds,
    hints: [...new Set(hints)],
  };
}

function buildMinutePropagationPrompt(project, minutes, plan) {
  const minuteBlock = ensureArray(minutes).map((entry, idx) => {
    const scope = textOr(entry.impactScope, 'requirements');
    return `### Ata ${idx + 1} (${entry.meetingDate || entry.createdAt})
Impacto declarado: ${scope}
Fase alvo: ${textOr(entry.targetStageId, scope)}

${entry.rawText || entry.bodyMarkdown || ''}`;
  }).join('\n\n');

  const stageLine = (ids) => ids.map((id) => `- ${id}: ${STAGE_FOCUS[id] || id}`).join('\n');

  return `# Propagação de alterações de atas na linha de entrega

## Projecto
${project.name} (${project.clientName || 'cliente'})

## Fases afectadas (plano automático)
**Fase principal:** ${plan.primaryStageIds.join(', ')}
**Rever para trás (upstream):**
${stageLine(plan.upstreamStageIds) || '- (nenhuma)'}
**Actualizar para a frente (downstream):**
${stageLine(plan.downstreamStageIds) || '- (nenhuma)'}

## Instruções
Analise as atas abaixo. Para cada fase afectada, indique:
1. O que deve ser actualizado (requisitos, arquitectura, roadmap, etc.)
2. Se a alteração é obrigatória ou recomendada
3. Riscos se não propagar

Responda em JSON:
\`\`\`json
{
  "summaryMarkdown": "",
  "stageUpdates": [
    { "stageId": "requirements", "direction": "downstream", "priority": "high", "changesMarkdown": "", "linkedRequirementIds": [] }
  ],
  "openQuestions": [],
  "suggestedHumanReview": true
}
\`\`\`

## Atas
${minuteBlock}
`;
}

/**
 * Builds a prompt that asks the AI to classify a single ata: which delivery
 * phases it impacts, which requirements it touches, and the concrete decisions
 * taken. Output feeds applyMeetingClassificationParsed().
 */
function buildMeetingClassificationPrompt(project, minute) {
  const reqs = ensureArray(project.requirements).slice(0, 80).map((r) => ({
    id: r.id,
    title: textOr(r.title),
    shall: textOr(r.shall).slice(0, 140),
    moduleTags: r.moduleTags || [],
  }));
  const stageList = STAGE_ORDER.map((id) => `- ${id}: ${STAGE_FOCUS[id] || id}`).join('\n');

  return `Tu és um analista de systems engineering YourLab.

Tarefa: ler a ata de reunião abaixo e **classificar o seu impacto** na linha de entrega.
Uma única ata pode tocar **várias fases** e **vários requisitos** ao mesmo tempo.

Fases disponíveis (usa estes ids em impactedStageIds):
${stageList}

Regras:
- Responde APENAS com JSON válido (sem \`\`\` fences).
- impactedStageIds: todas as fases realmente afectadas pela ata (1 ou mais).
- impactedRequirementIds: usa SOMENTE ids presentes em requirementsSummary.
- decisions: cada decisão concreta tomada na reunião, ligada à(s) fase(s) que afecta.
- summaryMarkdown: resumo narrativo, claro e curto, legível como um post (2-4 frases).
- openQuestions: dúvidas que ficaram em aberto.

Projecto: ${project.name} (${project.clientName || 'cliente'})

requirementsSummary:
${JSON.stringify(reqs, null, 2)}

Ata (texto bruto):
"""
${textOr(minute.rawText, minute.bodyMarkdown).slice(0, 12000)}
"""

Schema de output (meeting_classification_v1):
{
  "summaryMarkdown": "",
  "impactedStageIds": [],
  "impactedRequirementIds": [],
  "decisions": [
    { "text": "", "stageIds": [], "type": "scope_change|new_requirement|risk|clarification|decision" }
  ],
  "openQuestions": [],
  "requiresHumanConfirmation": true
}`;
}

/**
 * Applies a parsed meeting_classification output onto a single ata in place.
 * Returns the affected stage ids for downstream use.
 */
function applyMeetingClassificationParsed(project, minute, parsed) {
  if (!minute || !parsed) return [];
  const validReqIds = new Set(ensureArray(project.requirements).map((r) => r.id));

  const stageIds = [...new Set(ensureArray(parsed.impactedStageIds)
    .map((id) => textOr(id))
    .filter((id) => STAGE_ORDER.includes(id)))];

  const reqIds = [...new Set(ensureArray(parsed.impactedRequirementIds)
    .map((id) => textOr(id))
    .filter((id) => validReqIds.has(id)))];

  const decisions = ensureArray(parsed.decisions).map((d) => {
    if (typeof d === 'string') return { text: d, stageIds: stageIds, type: 'decision' };
    return {
      text: textOr(d?.text || d?.decision),
      stageIds: [...new Set(ensureArray(d?.stageIds).map((id) => textOr(id)).filter((id) => STAGE_ORDER.includes(id)))],
      type: textOr(d?.type, 'decision'),
    };
  }).filter((d) => d.text);

  minute.impactedStageIds = stageIds.length ? stageIds : meetingImpactedStageIds(minute);
  minute.impactedRequirementIds = reqIds;
  minute.decisions = decisions;
  minute.summaryMarkdown = textOr(parsed.summaryMarkdown, minute.summaryMarkdown);
  minute.openQuestions = ensureArray(parsed.openQuestions).map((q) => textOr(typeof q === 'string' ? q : q?.text || q?.question)).filter(Boolean);
  minute.classificationStatus = 'classified';
  minute.classifiedAt = nowIso();
  return minute.impactedStageIds;
}

const STAGE_TRANSITION_AGENTS = {
  'idea->discovery': { forward: 'Expandir contexto e stakeholders a partir da ideia', backward: null },
  'discovery->requirements': { forward: 'Gerar requisitos de negócio e técnicos', backward: 'Resumir ideia a partir da descoberta' },
  'requirements->architecture': { forward: 'Gerar pacote de arquitectura por funcionalidade/módulo', backward: 'Derivar requisitos a partir da arquitectura' },
  'architecture->roadmap': { forward: 'Gerar roadmap e fases', backward: 'Actualizar arquitectura com base no roadmap' },
  'roadmap->implementation': { forward: 'Gerar plano de implementação por unidade', backward: 'Actualizar roadmap com progresso' },
  'implementation->validation': { forward: 'Gerar casos de teste e critérios de aceitação', backward: 'Identificar gaps de implementação' },
  'validation->delivery': { forward: 'Gerar pacote de entrega e documentação', backward: 'Regenerar validação' },
  'delivery->operations': { forward: 'Definir monitorização e operação', backward: 'Actualizar entrega' },
};

function textOr(value, fallback = '') {
  const v = value === null || value === undefined ? '' : String(value).trim();
  return v || fallback;
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeModuleTags(raw, fallbackModule) {
  const fromArray = ensureArray(raw).map((t) => String(t || '').trim()).filter(Boolean);
  if (fromArray.length) {
    return fromArray.filter((t) => MODULE_TAGS.includes(t) || ['Frontend', 'Backend', 'Database'].includes(t));
  }
  const mod = textOr(fallbackModule);
  if (mod && MODULE_TAGS.includes(mod)) return [mod];
  if (mod === 'Frontend' || mod === 'Backend' || mod === 'Database') return [mod];
  return mod ? [mod] : [];
}

function normalizeCapability(raw) {
  return {
    id: textOr(raw?.id, `cap_${crypto.randomUUID().slice(0, 8)}`),
    name: textOr(raw?.name, 'Nova funcionalidade'),
    summaryMarkdown: textOr(raw?.summaryMarkdown || raw?.summary),
    status: textOr(raw?.status, 'draft'),
    moduleIds: normalizeModuleTags(raw?.moduleIds),
    requirementIds: ensureArray(raw?.requirementIds).map(String),
    clusterIds: ensureArray(raw?.clusterIds).map(String),
    risks: ensureArray(raw?.risks).map((r) => (typeof r === 'string' ? r : textOr(r?.text || r?.description))),
    openQuestions: ensureArray(raw?.openQuestions).map((q) => (typeof q === 'string' ? q : textOr(q?.text || q?.question))),
    nextAction: textOr(raw?.nextAction),
    createdAt: textOr(raw?.createdAt, nowIso()),
    updatedAt: textOr(raw?.updatedAt, nowIso()),
  };
}

function normalizeCluster(raw) {
  return {
    id: textOr(raw?.id, `clu_${crypto.randomUUID().slice(0, 8)}`),
    capabilityId: textOr(raw?.capabilityId),
    name: textOr(raw?.name, 'Novo grupo'),
    summaryMarkdown: textOr(raw?.summaryMarkdown || raw?.summary),
    requirementIds: ensureArray(raw?.requirementIds).map(String),
    clientRequestText: textOr(raw?.clientRequestText),
    createdAt: textOr(raw?.createdAt, nowIso()),
    updatedAt: textOr(raw?.updatedAt, nowIso()),
  };
}

function normalizeClientRequest(raw) {
  return {
    id: textOr(raw?.id, `cr_${crypto.randomUUID().slice(0, 8)}`),
    text: textOr(raw?.text),
    bodyMarkdown: textOr(raw?.bodyMarkdown || raw?.text),
    source: textOr(raw?.source, 'manual'),
    capabilityIds: ensureArray(raw?.capabilityIds).map(String),
    createdAt: textOr(raw?.createdAt, nowIso()),
  };
}

function normalizeBusinessObjective(raw) {
  return {
    id: textOr(raw?.id, `bo_${crypto.randomUUID().slice(0, 8)}`),
    text: textOr(raw?.text),
    bodyMarkdown: textOr(raw?.bodyMarkdown || raw?.text),
    clientRequestId: textOr(raw?.clientRequestId),
    capabilityIds: ensureArray(raw?.capabilityIds).map(String),
    createdAt: textOr(raw?.createdAt, nowIso()),
  };
}

function normalizePromptRun(raw) {
  return {
    id: textOr(raw?.id, `prun_${crypto.randomUUID().slice(0, 8)}`),
    agentType: textOr(raw?.agentType, 'prompt_builder'),
    stageId: textOr(raw?.stageId),
    capabilityId: textOr(raw?.capabilityId),
    moduleTag: textOr(raw?.moduleTag),
    targetOutput: textOr(raw?.targetOutput),
    systemPrompt: textOr(raw?.systemPrompt),
    stageInstruction: textOr(raw?.stageInstruction),
    contextPack: raw?.contextPack && typeof raw.contextPack === 'object' ? raw.contextPack : {},
    taskPrompt: textOr(raw?.taskPrompt),
    outputSchema: textOr(raw?.outputSchema),
    fullPrompt: textOr(raw?.fullPrompt || raw?.prompt),
    modelUsed: textOr(raw?.modelUsed, 'manual'),
    rawOutput: textOr(raw?.rawOutput),
    parsedOutput: raw?.parsedOutput ?? null,
    summaryMarkdown: textOr(raw?.summaryMarkdown),
    status: textOr(raw?.status, 'pending_review'),
    version: numberOr(raw?.version, 1),
    createdAt: textOr(raw?.createdAt, nowIso()),
    createdBy: textOr(raw?.createdBy),
    reviewedAt: textOr(raw?.reviewedAt),
    reviewedBy: textOr(raw?.reviewedBy),
  };
}

function normalizeAgentJobChunk(raw, index) {
  const status = textOr(raw?.status, 'pending');
  const allowed = ['pending', 'done', 'skipped'];
  return {
    index: numberOr(raw?.index, index),
    key: textOr(raw?.key),
    label: textOr(raw?.label, `Lote ${numberOr(raw?.index, index) + 1}`),
    requirementIds: ensureArray(raw?.requirementIds).map(String),
    deferred: Boolean(raw?.deferred),
    prompt: textOr(raw?.prompt),
    rawOutput: textOr(raw?.rawOutput),
    parsedOutput: raw?.parsedOutput ?? null,
    status: allowed.includes(status) ? status : 'pending',
  };
}

function normalizeAgentJob(raw) {
  const mode = textOr(raw?.mode, raw?.yarJobId || raw?.agentId ? 'runtime' : 'batched');
  if (mode === 'runtime') {
    const runtimeStatuses = [
      'dispatching', 'running', 'queued', 'planning', 'executing', 'paused',
      'self_review', 'pending_human_review', 'completed', 'failed', 'cancelled',
    ];
    const status = textOr(raw?.status, 'dispatching');
    const normalizedStatus = status === 'running' ? 'queued' : status;
    return {
      id: textOr(raw?.id, `aj_${crypto.randomUUID().slice(0, 8)}`),
      mode: 'runtime',
      agentType: textOr(raw?.platformAgentType || raw?.agentType),
      agentId: textOr(raw?.agentId),
      yarJobId: textOr(raw?.yarJobId) || null,
      promptRunId: textOr(raw?.promptRunId),
      projectId: textOr(raw?.projectId),
      status: runtimeStatuses.includes(normalizedStatus) ? normalizedStatus : 'queued',
      error: textOr(raw?.error),
      createdBy: textOr(raw?.createdBy),
      createdAt: textOr(raw?.createdAt, nowIso()),
      updatedAt: textOr(raw?.updatedAt, nowIso()),
      chunks: [],
    };
  }

  const status = textOr(raw?.status, 'collecting');
  const allowed = ['collecting', 'reconciling', 'review_pending', 'applied', 'failed'];
  return {
    id: textOr(raw?.id, `ajob_${crypto.randomUUID().slice(0, 8)}`),
    agentType: textOr(raw?.agentType, 'requirement_grouping'),
    mode: 'batched',
    status: allowed.includes(status) ? status : 'collecting',
    strategy: textOr(raw?.strategy, 'module'),
    stageId: textOr(raw?.stageId),
    chunks: ensureArray(raw?.chunks).map((c, i) => normalizeAgentJobChunk(c, i)),
    reconcilePrompt: textOr(raw?.reconcilePrompt),
    reconcileRaw: textOr(raw?.reconcileRaw),
    reconcileParsed: raw?.reconcileParsed ?? null,
    promptRunId: textOr(raw?.promptRunId),
    createdBy: textOr(raw?.createdBy),
    createdAt: textOr(raw?.createdAt, nowIso()),
    updatedAt: textOr(raw?.updatedAt, nowIso()),
  };
}

const HUMAN_REVIEW_STATUSES = [
  'pending', 'approved', 'changes_requested', 'rejected', 'awaiting_output', 'cancelled',
];

function normalizeHumanReview(raw) {
  let status = textOr(raw?.status, 'pending');
  if (!HUMAN_REVIEW_STATUSES.includes(status)) status = 'pending';
  const decisionsCount = numberOr(raw?.decisionsCount, 0);
  const sections = ensureArray(raw?.suggestedChanges?.sections);
  if (status === 'pending' && decisionsCount === 0 && !sections.length
    && textOr(raw?.title).toLowerCase().includes('aguarda output')) {
    status = 'awaiting_output';
  }
  return {
    id: textOr(raw?.id, `hr_${crypto.randomUUID().slice(0, 8)}`),
    type: textOr(raw?.type, 'agent_output'),
    title: textOr(raw?.title),
    summaryMarkdown: textOr(raw?.summaryMarkdown),
    bodyMarkdown: textOr(raw?.bodyMarkdown),
    sourceType: textOr(raw?.sourceType),
    sourceId: textOr(raw?.sourceId),
    promptRunId: textOr(raw?.promptRunId),
    suggestedChanges: raw?.suggestedChanges ?? null,
    status,
    readingTimeMinutes: numberOr(raw?.readingTimeMinutes, 5),
    decisionsCount,
    preApprovalSnapshotId: textOr(raw?.preApprovalSnapshotId),
    preApplySnapshotId: textOr(raw?.preApplySnapshotId),
    repromptFromRunId: textOr(raw?.repromptFromRunId),
    createdAt: textOr(raw?.createdAt, nowIso()),
    resolvedAt: textOr(raw?.resolvedAt),
    resolvedBy: textOr(raw?.resolvedBy),
    resolutionNotes: textOr(raw?.resolutionNotes),
  };
}

function isActionableReviewForPanel(review) {
  if (!review) return false;
  if (review.status !== 'pending') return false;
  if (['information_classification', 'phase_link_sync'].includes(review.type)) return false;
  const sections = ensureArray(review.suggestedChanges?.sections);
  return review.decisionsCount > 0 || sections.length > 0;
}

function migrateHumanReviewsOnLoad(project) {
  for (const review of ensureArray(project.humanReviews)) {
    if (review.status !== 'pending') continue;
    if (isActionableReviewForPanel(review)) continue;
    if (textOr(review.title).toLowerCase().includes('aguarda output')
      || textOr(review.summaryMarkdown).toLowerCase().includes('aguarda output')) {
      review.status = 'awaiting_output';
    } else if (review.decisionsCount === 0 && !ensureArray(review.suggestedChanges?.sections).length) {
      review.status = 'cancelled';
      review.resolutionNotes = textOr(review.resolutionNotes, 'Migrado: sem alterações acionáveis.');
    }
  }
}

function normalizeVersionSnapshot(raw) {
  return {
    id: textOr(raw?.id, `snap_${crypto.randomUUID().slice(0, 8)}`),
    label: textOr(raw?.label, 'Snapshot'),
    description: textOr(raw?.description),
    stageId: textOr(raw?.stageId),
    snapshotData: raw?.snapshotData ?? {},
    createdAt: textOr(raw?.createdAt, nowIso()),
    createdBy: textOr(raw?.createdBy),
  };
}

function normalizeAlternativeResponse(raw) {
  return {
    id: textOr(raw?.id, `alt_${crypto.randomUUID().slice(0, 8)}`),
    promptRunId: textOr(raw?.promptRunId),
    modelName: textOr(raw?.modelName, 'external'),
    rawOutput: textOr(raw?.rawOutput),
    parsedOutput: raw?.parsedOutput ?? null,
    diffSummary: textOr(raw?.diffSummary),
    createdAt: textOr(raw?.createdAt, nowIso()),
    createdBy: textOr(raw?.createdBy),
  };
}

function normalizeInformationEntry(raw) {
  return {
    id: textOr(raw?.id, `info_${crypto.randomUUID().slice(0, 8)}`),
    type: INFORMATION_TYPES.includes(textOr(raw?.type)) ? textOr(raw?.type) : 'free_text',
    stageId: textOr(raw?.stageId, 'requirements'),
    bodyMarkdown: textOr(raw?.bodyMarkdown || raw?.content || raw?.text),
    analyzeWithAgent: raw?.analyzeWithAgent === true,
    status: textOr(raw?.status, 'stored'),
    classification: raw?.classification ?? null,
    createdAt: textOr(raw?.createdAt, nowIso()),
    createdBy: textOr(raw?.createdBy),
  };
}

function numberOr(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * The Idea Canvas — a structured, narrative vision of the project.
 * Migrates from the legacy single `ideaBriefMarkdown` when no vision exists yet.
 */
function normalizeTitledList(list) {
  return ensureArray(list).map((item) => {
    if (typeof item === 'string') return { title: textOr(item), descriptionMarkdown: '' };
    return {
      title: textOr(item?.title || item?.name),
      descriptionMarkdown: textOr(item?.descriptionMarkdown || item?.description || item?.summary),
    };
  }).filter((item) => item.title);
}

function normalizeVision(raw, project) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const targetUsers = ensureArray(src.targetUsers)
    .map((u) => textOr(typeof u === 'string' ? u : (u?.name || u?.text)))
    .filter(Boolean);

  let mainIdeaMarkdown = textOr(src.mainIdeaMarkdown);
  if (!mainIdeaMarkdown && project) mainIdeaMarkdown = textOr(project.ideaBriefMarkdown);

  return {
    headline: textOr(src.headline),
    mainIdeaMarkdown,
    philosophyMarkdown: textOr(src.philosophyMarkdown || src.cultureMarkdown),
    problemMarkdown: textOr(src.problemMarkdown || src.problemStatement),
    targetUsers,
    valuePropositionMarkdown: textOr(src.valuePropositionMarkdown || src.businessValue),
    principles: normalizeTitledList(src.principles),
    consequentIdeas: normalizeTitledList(src.consequentIdeas || src.derivedIdeas),
    updatedAt: textOr(src.updatedAt),
  };
}

/**
 * The Discovery dossier — market research and business consequence, grounded in
 * proven frameworks (TAM/SAM/SOM, Business Model Canvas, SWOT, KPIs/OKRs).
 */
function normalizeStringList(list) {
  return ensureArray(list)
    .map((x) => textOr(typeof x === 'string' ? x : (x?.text || x?.name || x?.title)))
    .filter(Boolean);
}

function normalizeDiscovery(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const sizing = src.marketSizing && typeof src.marketSizing === 'object' ? src.marketSizing : {};
  const model = src.businessModel && typeof src.businessModel === 'object' ? src.businessModel : {};
  const impact = src.commercialImpact && typeof src.commercialImpact === 'object' ? src.commercialImpact : {};
  const swot = src.swot && typeof src.swot === 'object' ? src.swot : {};

  return {
    marketSummaryMarkdown: textOr(src.marketSummaryMarkdown || src.summaryMarkdown),
    marketSizing: {
      tam: textOr(sizing.tam),
      sam: textOr(sizing.sam),
      som: textOr(sizing.som),
      notesMarkdown: textOr(sizing.notesMarkdown || sizing.notes),
    },
    segments: ensureArray(src.segments).map((s) => {
      if (typeof s === 'string') return { name: s, descriptionMarkdown: '', painPoints: [] };
      return {
        name: textOr(s?.name || s?.title),
        descriptionMarkdown: textOr(s?.descriptionMarkdown || s?.description),
        painPoints: normalizeStringList(s?.painPoints),
      };
    }).filter((s) => s.name),
    competitors: ensureArray(src.competitors).map((c) => {
      if (typeof c === 'string') return { name: c, descriptionMarkdown: '', differentiation: '' };
      return {
        name: textOr(c?.name || c?.title),
        descriptionMarkdown: textOr(c?.descriptionMarkdown || c?.description),
        differentiation: textOr(c?.differentiation || c?.ourEdge),
      };
    }).filter((c) => c.name),
    businessModel: {
      revenueStreams: normalizeStringList(model.revenueStreams),
      costStructure: normalizeStringList(model.costStructure),
      channels: normalizeStringList(model.channels),
      keyPartners: normalizeStringList(model.keyPartners),
    },
    commercialImpact: {
      objectivesMarkdown: textOr(impact.objectivesMarkdown || impact.summaryMarkdown),
      kpis: ensureArray(impact.kpis).map((k) => {
        if (typeof k === 'string') return { name: k, target: '', rationale: '' };
        return {
          name: textOr(k?.name || k?.metric),
          target: textOr(k?.target),
          rationale: textOr(k?.rationale || k?.why),
        };
      }).filter((k) => k.name),
    },
    swot: {
      strengths: normalizeStringList(swot.strengths),
      weaknesses: normalizeStringList(swot.weaknesses),
      opportunities: normalizeStringList(swot.opportunities),
      threats: normalizeStringList(swot.threats),
    },
    goToMarketMarkdown: textOr(src.goToMarketMarkdown),
    assumptions: normalizeStringList(src.assumptions),
    updatedAt: textOr(src.updatedAt),
  };
}

/**
 * The Roadmap — implementation phases, each with a concrete deliverable tied to
 * requirements/tests/architecture, a design pattern and a date plan.
 */
function normalizeRoadmapPhase(raw, index) {
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    id: textOr(src.id, `rmp_${crypto.randomUUID().slice(0, 8)}`),
    planPhaseId: textOr(src.planPhaseId),
    order: Number.isFinite(src.order) ? src.order : index,
    name: textOr(src.name || src.title, `Fase ${index + 1}`),
    goalMarkdown: textOr(src.goalMarkdown || src.objectiveMarkdown || src.summaryMarkdown),
    deliverableMarkdown: textOr(src.deliverableMarkdown || src.deliverable),
    requirementIds: ensureArray(src.requirementIds).map(String).filter(Boolean),
    moduleTags: normalizeModuleTags(src.moduleTags),
    designPattern: textOr(src.designPattern),
    dependsOn: ensureArray(src.dependsOn).map(String).filter(Boolean),
    startDate: textOr(src.startDate),
    endDate: textOr(src.endDate),
    status: textOr(src.status, 'planned'),
    milestones: ensureArray(src.milestones).map((m) => {
      if (typeof m === 'string') return { name: m, date: '' };
      return { name: textOr(m?.name || m?.title), date: textOr(m?.date) };
    }).filter((m) => m.name),
    tests: normalizeStringList(src.tests),
    risks: normalizeStringList(src.risks),
  };
}

function normalizeRoadmap(raw, project) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const validReqIds = new Set(ensureArray(project?.requirements).map((r) => String(r.id)));
  const phases = ensureArray(src.phases).map((p, i) => {
    const phase = normalizeRoadmapPhase(p, i);
    if (validReqIds.size) {
      phase.requirementIds = phase.requirementIds.filter((id) => validReqIds.has(id));
    }
    return phase;
  });
  const phaseIds = new Set(phases.map((p) => p.id));
  phases.forEach((p) => { p.dependsOn = p.dependsOn.filter((id) => phaseIds.has(id) && id !== p.id); });
  phases.sort((a, b) => a.order - b.order);
  return {
    summaryMarkdown: textOr(src.summaryMarkdown),
    phases,
    updatedAt: textOr(src.updatedAt),
  };
}

/**
 * The Implementation dossier — confirmed tech stack (languages, frameworks,
 * deploy, resources) tied to requirements, plus concrete agent-ready tasks
 * derived from the roadmap. Each task carries a configurable LLM size that
 * controls how demanding the downloadable prompt is.
 */
const IMPL_LLM_SIZES = ['small', 'medium', 'large'];
const IMPL_TASK_STATUSES = ['todo', 'in_progress', 'blocked', 'done'];

function normalizeImplementationModule(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    name: textOr(src.name || src.title),
    technology: textOr(src.technology || src.tech),
    descriptionMarkdown: textOr(src.descriptionMarkdown || src.description),
    requirementIds: ensureArray(src.requirementIds).map(String).filter(Boolean),
  };
}

const IMPL_COMPLEXITIES = ['low', 'medium', 'high'];

function normalizeSubtask(raw, index) {
  const src = raw && typeof raw === 'object' ? raw : {};
  if (typeof raw === 'string') return { id: `sub_${crypto.randomUUID().slice(0, 6)}`, title: raw, descriptionMarkdown: '', done: false };
  return {
    id: textOr(src.id, `sub_${crypto.randomUUID().slice(0, 6)}`),
    title: textOr(src.title || src.name, `Passo ${index + 1}`),
    descriptionMarkdown: textOr(src.descriptionMarkdown || src.description),
    done: Boolean(src.done),
  };
}

function normalizeImplementationTask(raw, index) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const recommendedLlmSize = IMPL_LLM_SIZES.includes(src.recommendedLlmSize) ? src.recommendedLlmSize : '';
  const llmSize = IMPL_LLM_SIZES.includes(src.llmSize)
    ? src.llmSize
    : (recommendedLlmSize || 'medium');
  const status = IMPL_TASK_STATUSES.includes(src.status) ? src.status : 'todo';
  const complexity = IMPL_COMPLEXITIES.includes(src.complexity) ? src.complexity : '';
  return {
    id: textOr(src.id, `itask_${crypto.randomUUID().slice(0, 8)}`),
    order: Number.isFinite(src.order) ? src.order : index,
    roadmapPhaseId: textOr(src.roadmapPhaseId || src.phaseId),
    title: textOr(src.title || src.name, `Tarefa ${index + 1}`),
    descriptionMarkdown: textOr(src.descriptionMarkdown || src.description || src.goalMarkdown),
    requirementIds: ensureArray(src.requirementIds).map(String).filter(Boolean),
    moduleTags: normalizeModuleTags(src.moduleTags),
    acceptanceCriteria: normalizeStringList(src.acceptanceCriteria),
    technicalNotesMarkdown: textOr(src.technicalNotesMarkdown || src.notesMarkdown),
    promptMarkdown: textOr(src.promptMarkdown),
    subtasks: ensureArray(src.subtasks).map(normalizeSubtask),
    complexity,
    recommendedLlmSize,
    llmSize,
    status,
    // Post-execution capture
    resultMarkdown: textOr(src.resultMarkdown),
    outputLinks: ensureArray(src.outputLinks)
      .map((l) => (typeof l === 'string' ? { label: '', url: l } : { label: textOr(l?.label), url: textOr(l?.url) }))
      .filter((l) => l.url),
    executedModel: textOr(src.executedModel),
    executedAt: textOr(src.executedAt),
  };
}

function normalizeImplementation(raw, project) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const stackSrc = src.stack && typeof src.stack === 'object' ? src.stack : {};
  const validReqIds = new Set(ensureArray(project?.requirements).map((r) => String(r.id)));
  const validPhaseIds = new Set(ensureArray(project?.roadmap?.phases).map((p) => String(p.id)));
  const filterReqs = (ids) => (validReqIds.size ? ids.filter((id) => validReqIds.has(id)) : ids);

  const stack = {
    summaryMarkdown: textOr(stackSrc.summaryMarkdown),
    designPattern: textOr(stackSrc.designPattern),
    languages: normalizeStringList(stackSrc.languages),
    frameworks: normalizeStringList(stackSrc.frameworks),
    datastores: normalizeStringList(stackSrc.datastores),
    integrations: normalizeStringList(stackSrc.integrations),
    deployment: textOr(stackSrc.deployment),
    infrastructureMarkdown: textOr(stackSrc.infrastructureMarkdown),
    resourcesMarkdown: textOr(stackSrc.resourcesMarkdown),
    modules: ensureArray(stackSrc.modules).map(normalizeImplementationModule)
      .filter((m) => m.name)
      .map((m) => ({ ...m, requirementIds: filterReqs(m.requirementIds) })),
    confirmed: Boolean(stackSrc.confirmed),
    confirmedAt: textOr(stackSrc.confirmedAt),
  };

  const tasks = ensureArray(src.tasks).map((t, i) => {
    const task = normalizeImplementationTask(t, i);
    task.requirementIds = filterReqs(task.requirementIds);
    if (validPhaseIds.size && task.roadmapPhaseId && !validPhaseIds.has(task.roadmapPhaseId)) {
      task.roadmapPhaseId = '';
    }
    return task;
  }).sort((a, b) => a.order - b.order);

  return { stack, tasks, updatedAt: textOr(src.updatedAt) };
}

/**
 * The commercial Proposal — generated from requirements + documents. Holds the
 * value narrative, the total value, and the value (with justification) per phase,
 * all in one place. Monetary fields are budget-gated at sanitize time.
 */
function normalizeProposal(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const num = (v) => {
    if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
    if (v == null) return 0;
    const s = String(v).trim().replace(/[^0-9.,-]/g, '');
    if (!s) return 0;
    const lastComma = s.lastIndexOf(',');
    const lastDot = s.lastIndexOf('.');
    const decPos = Math.max(lastComma, lastDot);
    if (decPos === -1) return Number(s) || 0;
    const decimals = s.length - decPos - 1;
    // Treat as a decimal separator only when it leaves <=2 trailing digits and
    // both separator types aren't ambiguous; otherwise separators are thousands.
    if (decimals <= 2 && lastComma !== lastDot) {
      const intPart = s.slice(0, decPos).replace(/[.,]/g, '');
      return Number(`${intPart}.${s.slice(decPos + 1)}`) || 0;
    }
    return Number(s.replace(/[.,]/g, '')) || 0;
  };
  const phases = ensureArray(src.phases).map((p, i) => ({
    id: textOr(p?.id, `pp_${crypto.randomUUID().slice(0, 8)}`),
    name: textOr(p?.name || p?.title, `Fase ${i + 1}`),
    value: num(p?.value ?? p?.price ?? p?.cost),
    justificationMarkdown: textOr(p?.justificationMarkdown || p?.justification),
    deliverables: normalizeStringList(p?.deliverables),
  }));
  const declaredTotal = num(src.totalValue ?? src.total);
  const sumPhases = phases.reduce((acc, p) => acc + (p.value || 0), 0);
  return {
    headlineMarkdown: textOr(src.headlineMarkdown || src.summaryMarkdown),
    valueJustificationMarkdown: textOr(src.valueJustificationMarkdown),
    currency: textOr(src.currency, 'EUR'),
    totalValue: declaredTotal || sumPhases,
    phases,
    paymentTermsMarkdown: textOr(src.paymentTermsMarkdown),
    timelineMarkdown: textOr(src.timelineMarkdown),
    updatedAt: textOr(src.updatedAt),
  };
}

function normalizeProjectV3Fields(project) {
  const diagramFields = require('./diagrams').normalizeProjectDiagramFields(project);
  const executionPlans = require('./execution-plans');
  migrateHumanReviewsOnLoad(project);
  return {
    capabilities: ensureArray(project.capabilities).map(normalizeCapability),
    requirementClusters: ensureArray(project.requirementClusters).map(normalizeCluster),
    clientRequests: ensureArray(project.clientRequests).map(normalizeClientRequest),
    businessObjectives: ensureArray(project.businessObjectives).map(normalizeBusinessObjective),
    promptRuns: ensureArray(project.promptRuns).map(normalizePromptRun),
    agentJobs: ensureArray(project.agentJobs).map(normalizeAgentJob),
    humanReviews: ensureArray(project.humanReviews).map(normalizeHumanReview),
    executionPlans: ensureArray(project.executionPlans).map(executionPlans.normalizeExecutionPlan).slice(0, 20),
    versionSnapshots: ensureArray(project.versionSnapshots).map(normalizeVersionSnapshot),
    alternativeResponses: ensureArray(project.alternativeResponses).map(normalizeAlternativeResponse),
    informationEntries: ensureArray(project.informationEntries).map(normalizeInformationEntry),
    nextDecision: textOr(project.nextDecision),
    ideaBriefMarkdown: textOr(project.ideaBriefMarkdown),
    vision: normalizeVision(project.vision, project),
    discovery: normalizeDiscovery(project.discovery),
    roadmap: normalizeRoadmap(project.roadmap, project),
    implementation: normalizeImplementation(project.implementation, project),
    proposal: normalizeProposal(project.proposal),
    ...diagramFields,
  };
}

function enrichRequirementWithModuleTags(requirement) {
  if (!requirement) return requirement;
  const tags = normalizeModuleTags(requirement.moduleTags, requirement.module);
  return { ...requirement, moduleTags: tags.length ? tags : normalizeModuleTags([], requirement.module) };
}

function autoDeriveTraceLinks(project) {
  const links = [];
  const seen = new Set();
  const add = (sourceType, sourceId, targetType, targetId, relationshipType, confidence = 0.9) => {
    if (!sourceId || !targetId) return;
    const key = `${sourceType}:${sourceId}:${relationshipType}:${targetType}:${targetId}`;
    if (seen.has(key)) return;
    seen.add(key);
    links.push({
      id: `tl_${crypto.randomUUID().slice(0, 8)}`,
      sourceType,
      sourceId,
      targetType,
      targetId,
      relationshipType,
      confidence,
      validatedByHuman: false,
      autoDerived: true,
      createdAt: nowIso(),
    });
  };

  for (const cap of ensureArray(project.capabilities)) {
    for (const reqId of cap.requirementIds) {
      add('capability', cap.id, 'requirement', reqId, 'contains', 1);
    }
    for (const cluId of cap.clusterIds) {
      add('capability', cap.id, 'cluster', cluId, 'contains', 1);
    }
  }

  for (const clu of ensureArray(project.requirementClusters)) {
    for (const reqId of clu.requirementIds) {
      add('cluster', clu.id, 'requirement', reqId, 'contains', 1);
    }
    if (clu.capabilityId) add('capability', clu.capabilityId, 'cluster', clu.id, 'contains', 1);
  }

  for (const req of ensureArray(project.requirements)) {
    const type = String(req.type || '');
    const nodeType = type === 'stakeholder' ? 'stakeholder_requirement' : type === 'functional' ? 'technical_requirement' : 'requirement';
    const parentIds = new Set([
      textOr(req.stakeholderRequirementLink),
      textOr(req.linkedFunctionalRequirement),
      textOr(req.parentId),
    ].filter(Boolean).map((id) => String(id).toUpperCase()));

    if (req.stakeholderRequirementLink) {
      add(nodeType, req.id, 'stakeholder_requirement', req.stakeholderRequirementLink, 'decomposes_from', 0.95);
      add(nodeType, req.id, 'stakeholder_requirement', req.stakeholderRequirementLink, 'satisfies', 0.95);
    }
    if (req.linkedFunctionalRequirement && type === 'test_case') {
      add('test_case', req.id, 'technical_requirement', req.linkedFunctionalRequirement, 'verified_by', 0.95);
      add('test_case', req.id, 'technical_requirement', req.linkedFunctionalRequirement, 'tests', 0.95);
    }
    for (const relId of ensureArray(req.relatedRequirementIds)) {
      const token = String(relId || '').toUpperCase();
      if (!token || parentIds.has(token)) continue;
      add(nodeType, req.id, 'requirement', relId, 'depends_on', 0.8);
    }
  }

  for (const cr of ensureArray(project.clientRequests)) {
    for (const capId of cr.capabilityIds) {
      add('client_request', cr.id, 'capability', capId, 'derives_from', 0.85);
    }
  }

  for (const bo of ensureArray(project.businessObjectives)) {
    if (bo.clientRequestId) add('business_objective', bo.id, 'client_request', bo.clientRequestId, 'derives_from', 0.9);
    for (const capId of bo.capabilityIds) {
      add('business_objective', bo.id, 'capability', capId, 'derives_from', 0.85);
    }
  }

  for (const art of ensureArray(project.artifacts)) {
    for (const reqId of ensureArray(art.relatedRequirementIds)) {
      add('artifact', art.id, 'requirement', reqId, 'implements', 0.85);
    }
  }

  for (const diagram of ensureArray(project.diagramArtifacts)) {
    for (const reqId of ensureArray(diagram.linkedRequirementIds)) {
      add('diagram', diagram.id, 'requirement', reqId, 'implements', 0.95);
      add('requirement', reqId, 'diagram', diagram.id, 'implemented_by', 0.95);
    }
  }

  return links;
}

function mergeTraceLinks(existing, derived) {
  const manual = ensureArray(existing).filter((l) => !l.autoDerived);
  const manualKeys = new Set(manual.map((l) => `${l.sourceType}:${l.sourceId}:${l.relationshipType}:${l.targetType}:${l.targetId}`));
  const merged = [...manual];
  for (const d of derived) {
    const key = `${d.sourceType}:${d.sourceId}:${d.relationshipType}:${d.targetType}:${d.targetId}`;
    if (!manualKeys.has(key)) merged.push(d);
  }
  return merged;
}

/**
 * Deterministic, human-readable coverage report describing how requirements,
 * architecture and development connect to the ideia/descoberta upstream and the
 * monitorização downstream. Used as a reviewable log when re-applying links.
 */
function buildPhaseLinkReport(project, { previousLinkCount = 0, currentLinkCount = 0 } = {}) {
  const phaseContent = getPhaseContent();
  const requirements = ensureArray(project.requirements);
  const capabilities = ensureArray(project.capabilities);
  const clusters = ensureArray(project.requirementClusters);
  const artifacts = ensureArray(project.artifacts);

  const linkedToCapability = new Set();
  for (const cap of capabilities) {
    for (const id of ensureArray(cap.requirementIds)) linkedToCapability.add(id);
  }
  for (const clu of clusters) {
    for (const id of ensureArray(clu.requirementIds)) linkedToCapability.add(id);
  }

  const linkedToArtifact = new Set();
  const archArtifacts = [];
  for (const art of artifacts) {
    const reqIds = ensureArray(art.relatedRequirementIds);
    for (const id of reqIds) linkedToArtifact.add(id);
    if (['architecture', 'diagram', 'data_model', 'api_spec'].includes(String(art.type || ''))) {
      archArtifacts.push(art);
    }
  }

  const orphans = requirements.filter((r) => !linkedToCapability.has(r.id) && !linkedToArtifact.has(r.id));
  const withoutDownstream = requirements.filter((r) => !linkedToArtifact.has(r.id));

  const byStage = {};
  for (const r of requirements) {
    const sid = phaseContent.resolveRequirementStageId(r);
    byStage[sid] = (byStage[sid] || 0) + 1;
  }

  const added = Math.max(0, currentLinkCount - previousLinkCount);
  const ts = nowIso();
  const lines = [];
  lines.push(`# Log de ligações entre fases`);
  lines.push('');
  lines.push(`Gerado automaticamente em ${ts} por código determinístico (sem IA).`);
  lines.push('');
  lines.push(`## Resumo`);
  lines.push(`- Requisitos no projeto: **${requirements.length}**`);
  lines.push(`- Ligações de rastreabilidade totais: **${currentLinkCount}** (${added} nova(s) nesta execução)`);
  lines.push(`- Requisitos ligados a uma funcionalidade/ideia: **${linkedToCapability.size}/${requirements.length}**`);
  lines.push(`- Requisitos com arquitetura/desenvolvimento associado: **${linkedToArtifact.size}/${requirements.length}**`);
  lines.push(`- Artefactos de arquitetura/diagramas: **${archArtifacts.length}**`);
  lines.push('');
  lines.push(`## Distribuição de requisitos por fase`);
  const stageOrder = ['idea', 'discovery', 'requirements', 'architecture', 'implementation', 'testing', 'deployment', 'handover', 'monitoring', 'validation', 'delivery', 'roadmap'];
  const sortedStages = Object.keys(byStage).sort((a, b) => {
    const ia = stageOrder.indexOf(a);
    const ib = stageOrder.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
  if (sortedStages.length) {
    for (const sid of sortedStages) lines.push(`- ${sid}: ${byStage[sid]}`);
  } else {
    lines.push('- (sem requisitos)');
  }
  lines.push('');
  lines.push(`## A rever`);
  if (orphans.length) {
    lines.push(`### Requisitos sem ligação a ideia nem a arquitetura (${orphans.length})`);
    for (const r of orphans.slice(0, 40)) {
      lines.push(`- \`${r.id}\` — ${textOr(r.title, r.shall || r.need || 'sem título')}`);
    }
    if (orphans.length > 40) lines.push(`- … e mais ${orphans.length - 40}.`);
  } else {
    lines.push(`- Todos os requisitos estão ligados a, pelo menos, uma funcionalidade ou artefacto.`);
  }
  lines.push('');
  if (withoutDownstream.length) {
    lines.push(`### Requisitos ainda sem arquitetura/desenvolvimento (${withoutDownstream.length})`);
    for (const r of withoutDownstream.slice(0, 40)) {
      lines.push(`- \`${r.id}\` — ${textOr(r.title, r.shall || r.need || 'sem título')}`);
    }
    if (withoutDownstream.length > 40) lines.push(`- … e mais ${withoutDownstream.length - 40}.`);
  }
  lines.push('');
  lines.push(`> Reveja este log e aprove para registar que a rastreabilidade entre ideia → requisitos → arquitetura → desenvolvimento → monitorização foi reaplicada.`);

  const markdown = lines.join('\n');
  const summary = `Ligações reaplicadas: ${currentLinkCount} ligações (${added} nova(s)). ${linkedToCapability.size}/${requirements.length} requisitos ligados a funcionalidades, ${linkedToArtifact.size}/${requirements.length} com arquitetura. ${orphans.length} requisito(s) por rever.`;

  return {
    markdown,
    summary,
    stats: {
      requirements: requirements.length,
      totalLinks: currentLinkCount,
      addedLinks: added,
      linkedToCapability: linkedToCapability.size,
      linkedToArtifact: linkedToArtifact.size,
      orphans: orphans.length,
    },
  };
}

function buildContextPack(project, options = {}) {
  const { stageId, capabilityId, maxRequirements = 30 } = options;
  const cap = capabilityId ? ensureArray(project.capabilities).find((c) => c.id === capabilityId) : null;
  const reqIds = cap ? new Set(cap.requirementIds) : null;
  const reqs = ensureArray(project.requirements)
    .filter((r) => !reqIds || reqIds.has(r.id))
    .slice(0, maxRequirements);

  return {
    ideaBrief: textOr(project.ideaBriefMarkdown).slice(0, 2000),
    projectSummary: {
      name: project.name,
      clientName: project.clientName,
      description: textOr(project.description).slice(0, 500),
    },
    capability: cap ? { id: cap.id, name: cap.name, summary: cap.summaryMarkdown } : null,
    requirementsSummary: reqs.map((r) => ({
      id: r.id,
      type: r.type,
      title: r.title,
      shall: textOr(r.shall).slice(0, 200),
      status: r.status,
      moduleTags: r.moduleTags || [],
      parentId: textOr(r.parentId, r.stakeholderRequirementLink, r.linkedFunctionalRequirement),
      vLevel: r.vLevel,
    })),
    hierarchySummary: (() => {
      try {
        const rh = require('./requirement-hierarchy');
        const analysis = rh.analyzeRequirementHierarchy(project);
        return {
          coveragePct: analysis.stats.coveragePct,
          orphans: analysis.orphans.length,
          nodes: analysis.nodes.slice(0, maxRequirements).map((n) => ({
            id: n.id,
            type: n.type,
            parentId: n.parentId,
            stakeholderRootId: n.stakeholderRootId,
          })),
        };
      } catch {
        return null;
      }
    })(),
    openQuestions: ensureArray(project.clarificationQuestions)
      .filter((q) => ['open', 'sent', 'blocked'].includes(q.status))
      .slice(0, 15)
      .map((q) => q.question),
    recentDecisions: ensureArray(project.humanReviews)
      .filter((r) => r.status === 'approved')
      .slice(0, 5)
      .map((r) => r.title),
    stageId: stageId || null,
  };
}

function buildGroupingPrompt(project) {
  const ctx = buildContextPack(project, { maxRequirements: 80 });
  return `Tu és um analista de systems engineering. Agrupa requisitos em capabilities e clusters humanos.

Projeto: ${project.name} (${project.clientName})

Requisitos existentes:
${JSON.stringify(ctx.requirementsSummary, null, 2)}

Responde APENAS com JSON válido:
{
  "capabilities": [{ "name": "", "summaryMarkdown": "", "moduleIds": [], "requirementIds": [], "risks": [], "openQuestions": [], "nextAction": "" }],
  "requirementClusters": [{ "capabilityName": "", "name": "", "summaryMarkdown": "", "requirementIds": [], "clientRequestText": "" }],
  "moduleMappings": [{ "requirementId": "", "moduleTags": ["Frontend","Backend"] }],
  "openQuestions": [],
  "assumptions": []
}`;
}

function buildHierarchyReorganizePrompt(project) {
  const ctx = buildContextPack(project, { maxRequirements: 120 });
  return `Tu és um analista de systems engineering YourLab.

Tarefa: reorganizar a **cadeia V** do projecto — ligações STK (L0) → FR → RNF → TC.

Regras:
- Cada FR/RNF/TC deve ter um stakeholder raiz (STK) claro via decomposes_from / constrains / verified_by.
- Não inventes requisitos novos; apenas reorganiza ligações entre IDs existentes.
- Propõe novos STK apenas quando um órfão não encaixa num STK existente (campo newStakeholders).
- Prefere poucos STK bem definidos a um STK por requisito.

Contexto:
${JSON.stringify({
  project: ctx.projectSummary,
  hierarchySummary: ctx.hierarchySummary,
  requirements: ctx.requirementsSummary,
  openQuestions: ctx.openQuestions,
}, null, 2)}

Responde APENAS com JSON válido:
{
  "moves": [
    { "requirementId": "FR-01", "type": "functional", "parentId": "STK-03", "note": "motivo curto" }
  ],
  "newStakeholders": [
    { "id": "STK-21", "title": "...", "forRequirementIds": ["FR-05"], "need": "...", "shall": "..." }
  ],
  "orphansRemaining": ["FR-99"],
  "notesMarkdown": "Resumo das decisões para revisão humana"
}`;
}

function buildReverseIdeaPrompt(project) {
  const ctx = buildContextPack(project, { maxRequirements: 50 });
  const existing = project.vision && typeof project.vision === 'object'
    ? {
      headline: textOr(project.vision.headline),
      mainIdeaMarkdown: textOr(project.vision.mainIdeaMarkdown).slice(0, 1500),
    }
    : { headline: '', mainIdeaMarkdown: textOr(project.ideaBriefMarkdown).slice(0, 1500) };

  return `Tu és um estratega de produto YourLab.

Tarefa: a partir do contexto e requisitos, escrever a **visão da ideia** de forma **narrativa e clara**,
como se fosse a abertura de uma apresentação ou um post forte de LinkedIn. O leitor deve compreender a
**cultura e a filosofia** por trás da ideia, não apenas funcionalidades.

Princípios de escrita:
- Texto humano, fluido e inspirador — frases completas, sem bullet points secos no mainIdeaMarkdown.
- Linguagem simples; a complexidade técnica fica de fora desta fase.
- "consequentIdeas" = ideias que nascem naturalmente da ideia principal (extensões, futuros, oportunidades).
- "principles" = a filosofia/cultura que guia decisões (o "como pensamos", não o "o que fazemos").

Contexto e visão atual:
${JSON.stringify({ ...ctx, currentVision: existing }, null, 2)}

Responde APENAS com JSON válido (sem \`\`\` fences):
{
  "ideaBriefMarkdown": "resumo curto da ideia (compatibilidade)",
  "vision": {
    "headline": "uma frase-essência memorável",
    "mainIdeaMarkdown": "2-4 parágrafos narrativos sobre a ideia principal",
    "philosophyMarkdown": "1-2 parágrafos sobre cultura e filosofia",
    "problemMarkdown": "o problema/dor que justifica a ideia",
    "targetUsers": ["quem beneficia"],
    "valuePropositionMarkdown": "porque importa / valor entregue",
    "principles": [{ "title": "", "descriptionMarkdown": "" }],
    "consequentIdeas": [{ "title": "", "descriptionMarkdown": "" }]
  },
  "requiresHumanConfirmation": true
}`;
}

function buildDiscoveryPrompt(project) {
  const ctx = buildContextPack(project, { maxRequirements: 40 });
  const vision = project.vision && typeof project.vision === 'object'
    ? {
      headline: textOr(project.vision.headline),
      mainIdea: textOr(project.vision.mainIdeaMarkdown).slice(0, 1200),
      targetUsers: ensureArray(project.vision.targetUsers),
    }
    : { headline: '', mainIdea: textOr(project.ideaBriefMarkdown).slice(0, 1200), targetUsers: [] };

  return `Tu és um analista de negócio e estratégia de mercado YourLab.

Tarefa: a partir da ideia e do contexto, produzir um **dossier de descoberta** estruturado segundo
**frameworks de negócio reais e comprovados**: dimensionamento de mercado (TAM/SAM/SOM),
segmentos-alvo, concorrência, Business Model Canvas (receitas, custos, canais, parceiros),
impacto comercial desejado (objectivos + KPIs/OKRs) e análise SWOT.

Princípios:
- Responde APENAS com JSON válido (sem \`\`\` fences).
- Texto narrativo e legível em marketSummaryMarkdown (2-3 parágrafos) — como abertura de um pitch.
- Sê concreto e realista; assenta em práticas que funcionam no mundo real.
- assumptions = hipóteses de negócio que ainda precisam de ser validadas.

Ideia e contexto:
${JSON.stringify({ ...ctx, vision }, null, 2)}

Schema de output (discovery_v1):
{
  "discovery": {
    "marketSummaryMarkdown": "",
    "marketSizing": { "tam": "", "sam": "", "som": "", "notesMarkdown": "" },
    "segments": [{ "name": "", "descriptionMarkdown": "", "painPoints": [] }],
    "competitors": [{ "name": "", "descriptionMarkdown": "", "differentiation": "" }],
    "businessModel": { "revenueStreams": [], "costStructure": [], "channels": [], "keyPartners": [] },
    "commercialImpact": { "objectivesMarkdown": "", "kpis": [{ "name": "", "target": "", "rationale": "" }] },
    "swot": { "strengths": [], "weaknesses": [], "opportunities": [], "threats": [] },
    "goToMarketMarkdown": "",
    "assumptions": []
  },
  "requiresHumanConfirmation": true
}`;
}

function buildRoadmapPrompt(project) {
  const roadmapSync = require('./roadmap-sync');
  const ctx = buildContextPack(project, { maxRequirements: 80 });
  const capabilities = ensureArray(project.capabilities).map((c) => ({
    id: c.id, name: c.name, requirementIds: c.requirementIds, moduleIds: c.moduleIds,
  }));
  const diagrams = ensureArray(project.diagramArtifacts).map((d) => ({
    title: d.title, type: d.type, module: d.module, linkedRequirementIds: d.linkedRequirementIds,
  }));
  const implementationPlanPhases = roadmapSync.buildPlanPhasesContext(project);
  const existing = ensureArray(project.roadmap?.phases).map((p) => ({
    id: p.id,
    planPhaseId: p.planPhaseId,
    name: p.name,
    goalMarkdown: textOr(p.goalMarkdown).slice(0, 300),
    requirementIds: p.requirementIds,
    designPattern: p.designPattern,
    milestones: p.milestones,
    startDate: p.startDate,
    endDate: p.endDate,
  }));

  const planInstructions = implementationPlanPhases.length
    ? `
**IMPORTANTE — fases do plano já definidas (${implementationPlanPhases.length}):**
O cliente/equipa já definiu fases de implementação em implementationPlanPhases.
- Produz **exactamente ${implementationPlanPhases.length} fases** no roadmap, na mesma ordem.
- Usa o mesmo planPhaseId (ex.: F1, F2) em cada fase do output.
- Mantém os **nomes** das fases do plano.
- Enriquece com entregável, design pattern, testes, riscos, datas coerentes com durationWeeks, e milestones (sub-marcos).
- Atribui requirementIds com base nos requisitos da fase (ver requirementCount no plano).
- Não inventes fases extra.`
    : `
Se não houver fases no plano, propõe 3–6 fases pequenas e entregáveis.`;

  return `Tu és um tech lead / engenheiro de entrega YourLab.

Tarefa: a partir dos requisitos, capabilities, arquitectura (diagramas), **plano de fases do projecto** e descoberta,
montar um **roadmap de implementação** por fases. Cada fase precisa de:
- planPhaseId — id da fase no plano (F1, F2…) quando existir; senão "";
- um **entregável concreto** (deliverableMarkdown);
- **requirementIds** (SÓ ids existentes);
- **design pattern** e **moduleTags**;
- **testes**, **riscos**, **datas** (yyyy-mm-dd), **dependsOn**;
- **milestones** — sub-marcos dentro da fase (2–5 por fase).

${planInstructions}

Princípios:
- Responde APENAS com JSON válido (sem \`\`\` fences).
- summaryMarkdown = visão geral em 1-2 parágrafos.

Contexto:
${JSON.stringify({ ...ctx, capabilities, diagrams, implementationPlanPhases, existingRoadmap: existing }, null, 2)}

Schema de output (roadmap_v1):
{
  "roadmap": {
    "summaryMarkdown": "",
    "phases": [{
      "id": "rmp_f1",
      "planPhaseId": "F1",
      "name": "",
      "goalMarkdown": "",
      "deliverableMarkdown": "",
      "requirementIds": [],
      "moduleTags": [],
      "designPattern": "",
      "dependsOn": [],
      "startDate": "",
      "endDate": "",
      "tests": [],
      "risks": [],
      "milestones": [{ "name": "", "date": "" }]
    }]
  },
  "requiresHumanConfirmation": true
}`;
}

function buildRoadmapMilestonesPrompt(project, roadmapPhaseId) {
  const ctx = buildContextPack(project, { maxRequirements: 40 });
  const phase = ensureArray(project.roadmap?.phases).find((p) => p.id === roadmapPhaseId);
  if (!phase) return 'Fase de roadmap não encontrada.';
  const planPhases = require('./roadmap-sync').buildPlanPhasesContext(project);
  const planMatch = planPhases.find((p) => p.id === phase.planPhaseId);

  return `Tu és um tech lead YourLab.

Tarefa: propor **sub-milestones** para UMA fase do roadmap. Não alteres outras fases.

Fase alvo:
${JSON.stringify({
  id: phase.id,
  planPhaseId: phase.planPhaseId,
  name: phase.name,
  goalMarkdown: phase.goalMarkdown,
  deliverableMarkdown: textOr(phase.deliverableMarkdown).slice(0, 600),
  startDate: phase.startDate,
  endDate: phase.endDate,
  requirementIds: phase.requirementIds,
  existingMilestones: phase.milestones,
  planPhase: planMatch || null,
}, null, 2)}

Contexto:
${JSON.stringify(ctx, null, 2)}

Regras:
- Responde APENAS com JSON válido (sem \`\`\` fences).
- 2–6 milestones concretos, ordenados no tempo.
- Datas yyyy-mm-dd dentro do intervalo da fase.

Schema:
{
  "milestones": [{ "name": "", "date": "" }],
  "requiresHumanConfirmation": true
}`;
}

function buildImplementationStackPrompt(project) {
  const ctx = buildContextPack(project, { maxRequirements: 80 });
  const diagrams = ensureArray(project.diagramArtifacts).map((d) => ({
    title: d.title, type: d.type, module: d.module,
  }));
  const roadmap = ensureArray(project.roadmap?.phases).map((p) => ({
    name: p.name, designPattern: p.designPattern, moduleTags: p.moduleTags,
  }));
  const current = project.implementation?.stack || {};

  return `Tu és um arquiteto de software / tech lead YourLab.

Tarefa: definir e **confirmar a stack técnica** do sistema, ligada aos requisitos.
Decide tecnologias concretas e realistas: linguagens, frameworks, bases de dados,
integrações externas, onde fica o deploy, e que recursos de infraestrutura são precisos.
Mapeia os módulos/partes do sistema às tecnologias e aos requisitos que satisfazem.

Princípios:
- Responde APENAS com JSON válido (sem \`\`\` fences).
- Sê concreto (ex.: "Node.js + Express", "PostgreSQL", "Deploy em AWS ECS Fargate").
- requirementIds em cada módulo devem usar SÓ ids existentes (rastreabilidade).
- summaryMarkdown = visão geral legível da arquitetura técnica em 1-2 parágrafos.
- resourcesMarkdown = estimativa de recursos (instâncias, memória, custos aproximados).

Contexto:
${JSON.stringify({ ...ctx, diagrams, roadmap, currentStack: current }, null, 2)}

Schema de output (implementation_stack_v1):
{
  "implementation": {
    "stack": {
      "summaryMarkdown": "",
      "designPattern": "",
      "languages": [],
      "frameworks": [],
      "datastores": [],
      "integrations": [],
      "deployment": "",
      "infrastructureMarkdown": "",
      "resourcesMarkdown": "",
      "modules": [{ "name": "", "technology": "", "descriptionMarkdown": "", "requirementIds": [] }]
    }
  },
  "requiresHumanConfirmation": true
}`;
}

function buildImplementationTasksPrompt(project) {
  const ctx = buildContextPack(project, { maxRequirements: 80 });
  const phases = ensureArray(project.roadmap?.phases).map((p) => ({
    id: p.id, name: p.name, deliverable: textOr(p.deliverableMarkdown).slice(0, 400),
    requirementIds: p.requirementIds, moduleTags: p.moduleTags, designPattern: p.designPattern,
  }));
  const stack = project.implementation?.stack
    ? {
      designPattern: project.implementation.stack.designPattern,
      languages: project.implementation.stack.languages,
      frameworks: project.implementation.stack.frameworks,
      deployment: project.implementation.stack.deployment,
    }
    : null;

  return `Tu és um tech lead YourLab a preparar trabalho para agentes de desenvolvimento.

Tarefa: dividir cada fase do roadmap em **tarefas pequenas, coerentes e prontas para execução**
por um agente de IA. A divisão tem de ser **coerente com o modelo (LLM) recomendado** e com os
recursos disponíveis. Cada tarefa precisa de:
- um título curto e claro;
- descriptionMarkdown = o **resultado desejado** (objetivo claro e concreto do que fica pronto);
- roadmapPhaseId = o "id" da fase do roadmap a que pertence;
- requirementIds satisfeitos (rastreabilidade — usa SÓ ids existentes);
- moduleTags envolvidos;
- acceptanceCriteria = critérios objetivos de aceitação (definição de "concluído");
- technicalNotesMarkdown = notas técnicas/restrições relevantes;
- complexity = "low" | "medium" | "high" (estimativa de esforço/risco);
- recommendedLlmSize = "small" | "medium" | "large" — o tamanho de modelo adequado:
  tarefas simples e mecânicas → "small"; tarefas com lógica de negócio → "medium";
  tarefas críticas, arquiteturais ou ambíguas → "large";
- subtasks = passos coerentes dentro da tarefa. **Quanto menor o modelo recomendado, mais granular
  e explícita deve ser a divisão em subtasks**; para "large" usa poucas ou nenhuma.

Princípios:
- Responde APENAS com JSON válido (sem \`\`\` fences).
- Tarefas pequenas e independentes quando possível, ordenadas por sequência de construção.
- Pedidos claros e objetivos — cada tarefa tem de ser executável sem ambiguidade.
- NÃO escrevas o prompt final — o sistema gera o prompt a partir destes campos.

Roadmap (fases):
${JSON.stringify(phases, null, 2)}

Stack confirmada (se existir):
${JSON.stringify(stack, null, 2)}

Requisitos:
${JSON.stringify(ctx.requirementsSummary, null, 2)}

Schema de output (implementation_tasks_v1):
{
  "implementation": {
    "tasks": [{
      "roadmapPhaseId": "",
      "title": "",
      "descriptionMarkdown": "",
      "requirementIds": [],
      "moduleTags": [],
      "acceptanceCriteria": [],
      "technicalNotesMarkdown": "",
      "complexity": "medium",
      "recommendedLlmSize": "medium",
      "subtasks": [{ "title": "", "descriptionMarkdown": "" }]
    }]
  },
  "requiresHumanConfirmation": true
}`;
}

function buildCommercialProposalPrompt(project, options = {}) {
  const instructions = textOr(options.instructions);
  const ctx = buildContextPack(project, { maxRequirements: 120 });
  const roadmap = ensureArray(project.roadmap?.phases).map((p) => ({
    id: p.id, name: p.name, deliverable: textOr(p.deliverableMarkdown).slice(0, 300),
    requirementIds: p.requirementIds, startDate: p.startDate, endDate: p.endDate,
  }));
  const stack = project.implementation?.stack
    ? { designPattern: project.implementation.stack.designPattern, languages: project.implementation.stack.languages, frameworks: project.implementation.stack.frameworks, deployment: project.implementation.stack.deployment }
    : null;
  const docs = ensureArray(project.documents)
    .map((d) => ({ title: textOr(d.title || d.originalName), type: textOr(d.docType), excerpt: textOr(d.contentMarkdown || d.extractedText).slice(0, 600) }))
    .filter((d) => d.title)
    .slice(0, 12);
  const commercial = {
    currency: textOr(project.currency, 'EUR'),
    commercialTerms: project.commercialTerms || null,
  };

  return `Tu és um consultor comercial sénior YourLab a preparar uma **proposta comercial**.

Tarefa: a partir dos requisitos, do roadmap e dos documentos do projeto, construir uma proposta
clara com **valor por fase**, **justificação do valor** e termos de pagamento. O cliente tem de
perceber porque é que cada valor faz sentido (esforço, complexidade, risco, valor de negócio).

${instructions ? `Instruções específicas do utilizador (segue-as):\n${instructions}\n` : ''}
Princípios:
- Responde APENAS com JSON válido (sem \`\`\` fences).
- headlineMarkdown = abertura executiva persuasiva (2-3 parágrafos).
- valueJustificationMarkdown = justificação global do valor (porque vale o investimento).
- Cada fase: nome, valor numérico (em ${commercial.currency}), justificationMarkdown e deliverables.
- Mantém-te coerente com o orçamento-alvo quando existir; o total deve ser a soma das fases.
- Usa o roadmap como base das fases sempre que possível (mesmos nomes).

Contexto:
${JSON.stringify({ projectSummary: ctx.projectSummary, requirementsSummary: ctx.requirementsSummary, roadmap, stack, commercial, documents: docs }, null, 2)}

Schema de output (commercial_proposal_v1):
{
  "proposal": {
    "headlineMarkdown": "",
    "valueJustificationMarkdown": "",
    "currency": "${commercial.currency}",
    "totalValue": 0,
    "phases": [{ "name": "", "value": 0, "justificationMarkdown": "", "deliverables": [] }],
    "paymentTermsMarkdown": "",
    "timelineMarkdown": ""
  },
  "requiresHumanConfirmation": true
}`;
}

function buildDiagramToRequirementsPrompt(project, options = {}) {
  const { bodyMarkdown, diagramArtifact, stageId = 'architecture' } = options;
  const ctx = buildContextPack(project, { stageId: 'requirements', maxRequirements: 50 });
  const existingReqIds = new Set(ensureArray(project.requirements).map((r) => r.id));

  const diagramBlock = diagramArtifact
    ? {
      id: diagramArtifact.id,
      title: diagramArtifact.title,
      type: diagramArtifact.type,
      notation: diagramArtifact.notation,
      sourceText: textOr(diagramArtifact.sourceText, bodyMarkdown).slice(0, 12000),
      linkedRequirementIds: ensureArray(diagramArtifact.linkedRequirementIds),
      module: diagramArtifact.module,
    }
    : {
      sourceText: textOr(bodyMarkdown).slice(0, 12000),
      note: 'Texto colado manualmente — inferir actores, sistemas e fluxos.',
    };

  const contextPack = {
    projectSummary: ctx.projectSummary,
    ideaBrief: ctx.ideaBrief,
    existingRequirementIds: [...existingReqIds],
    requirementsSummary: ctx.requirementsSummary,
    openQuestions: ctx.openQuestions,
    diagram: diagramBlock,
    outputSchemaVersion: 'diagram_to_requirements_v2',
  };

  return `Tu és um agente de engenharia de requisitos YourLab.

Tarefa: analisar o diagrama abaixo e **derivar ou actualizar requisitos** rastreáveis (stakeholder + técnicos funcionais).

Regras:
- Responde APENAS com JSON válido (sem \`\`\` fences).
- Não duplique requisitos que já existem — use "updates" para melhorar IDs existentes quando aplicável.
- Novos requisitos devem ser SMART e verificáveis (need + shall + condition + measure quando possível).
- moduleTags: Frontend, Backend, Database, API, Integration conforme apropriado.
- Se o diagrama mostrar lacunas, registe em openQuestions.
- Mantenha linkedDiagramId no output — a plataforma usa-o para ligar requisitos novos/actualizados ao diagrama.
- Marque requiresHumanConfirmation: true.

Context pack:
${JSON.stringify(contextPack, null, 2)}

Schema de output (diagram_to_requirements_v2):
{
  "diagramAnalysisMarkdown": "resumo do que o diagrama representa",
  "stakeholderRequirements": [{
    "title": "",
    "need": "",
    "shall": "",
    "condition": "",
    "measure": "",
    "moduleTags": [],
    "relatedRequirementIds": []
  }],
  "technicalRequirements": [{
    "title": "",
    "shall": "",
    "condition": "",
    "measure": "",
    "moduleTags": [],
    "relatedRequirementIds": []
  }],
  "updates": [{
    "id": "FR-01",
    "shall": "texto melhorado opcional",
    "notes": "porque este requisito existente muda"
  }],
  "actors": [],
  "flows": [{ "name": "", "steps": [] }],
  "linkedDiagramId": "${textOr(diagramArtifact?.id)}",
  "openQuestions": [],
  "assumptions": [],
  "requiresHumanConfirmation": true
}`;
}

const ARCHITECTURE_DIAGRAM_BY_MODULE = {
  Frontend: { type: 'c4_container', notation: 'mermaid' },
  Backend: { type: 'sequence', notation: 'mermaid' },
  Database: { type: 'erd', notation: 'mermaid' },
  API: { type: 'openapi_spec', notation: 'openapi' },
  Integration: { type: 'api_flow', notation: 'mermaid' },
};

function architectureReqMatchesModule(req, moduleTag) {
  if (!moduleTag) return true;
  const tags = normalizeModuleTags(req.moduleTags, req.module);
  return tags.includes(moduleTag) || textOr(req.module) === moduleTag;
}

function buildArchitectureTaskPlan(project, capabilityId, moduleTag, options = {}) {
  const mod = textOr(moduleTag, 'Backend');
  const cap = capabilityId
    ? ensureArray(project.capabilities).find((c) => c.id === capabilityId)
    : null;

  let reqs = ensureArray(project.requirements);
  if (cap) {
    const capIds = new Set(ensureArray(cap.requirementIds).map(String));
    reqs = reqs.filter((r) => capIds.has(String(r.id)));
  }
  reqs = reqs.filter((r) => architectureReqMatchesModule(r, mod));

  const clusters = ensureArray(project.requirementClusters).filter((cluster) => {
    if (!cap) return true;
    const capName = textOr(cap.name).toLowerCase();
    return textOr(cluster.capabilityId) === cap.id
      || textOr(cluster.capabilityName).toLowerCase() === capName;
  });

  const groups = [];
  const assigned = new Set();

  for (const cluster of clusters) {
    const ids = ensureArray(cluster.requirementIds)
      .map(String)
      .filter((id) => reqs.some((r) => String(r.id) === id));
    if (!ids.length) continue;
    ids.forEach((id) => assigned.add(id));
    groups.push({
      id: textOr(cluster.id, `cluster-${groups.length}`),
      title: textOr(cluster.name, 'Grupo de requisitos'),
      requirementIds: ids,
    });
  }

  const loose = reqs.filter((r) => !assigned.has(String(r.id)));
  const chunkSize = Math.max(4, numberOr(options.requirementsPerDiagram, 6));
  for (let i = 0; i < loose.length; i += chunkSize) {
    const slice = loose.slice(i, i + chunkSize);
    groups.push({
      id: `req-chunk-${i}`,
      title: loose.length <= chunkSize ? 'Requisitos do âmbito' : `Requisitos (${Math.floor(i / chunkSize) + 1})`,
      requirementIds: slice.map((r) => r.id),
    });
  }

  if (!groups.length && reqs.length) {
    groups.push({
      id: 'scope-all',
      title: cap?.name || 'Todo o âmbito',
      requirementIds: reqs.map((r) => r.id),
    });
  }

  const hasContextDiagram = ensureArray(project.diagramArtifacts).some((d) => d.type === 'c4_context');
  const moduleDiagram = ARCHITECTURE_DIAGRAM_BY_MODULE[mod] || { type: 'sequence', notation: 'mermaid' };

  const tasks = [];
  let order = 0;

  if (!hasContextDiagram && groups.length) {
    const contextReqs = [...new Set(groups.flatMap((g) => g.requirementIds))].slice(0, 14);
    tasks.push({
      id: `arch-task-${order}`,
      order: order++,
      title: 'Contexto do sistema (C4)',
      diagramType: 'c4_context',
      notation: 'mermaid',
      requirementIds: contextReqs,
      dependsOn: [],
      role: 'context',
      deferred: false,
    });
  }

  for (const group of groups) {
    const deps = tasks.length ? [tasks[tasks.length - 1].id] : [];
    tasks.push({
      id: `arch-task-${order}`,
      order: order++,
      title: `Diagrama — ${group.title}`,
      diagramType: moduleDiagram.type,
      notation: moduleDiagram.notation,
      requirementIds: group.requirementIds,
      dependsOn: [...deps],
      role: 'diagram',
      groupId: group.id,
      deferred: false,
    });
  }

  if (tasks.length) {
    tasks.push({
      id: `arch-task-${order}`,
      order: order++,
      title: 'Consolidar pacote de arquitectura',
      diagramType: 'consolidate',
      notation: 'json',
      requirementIds: reqs.map((r) => r.id),
      dependsOn: tasks.filter((t) => t.role !== 'merge').map((t) => t.id),
      role: 'merge',
      deferred: false,
    });
  }

  const diagramTaskCount = tasks.filter((t) => t.role === 'diagram' || t.role === 'context').length;
  const masterPlanMarkdown = [
    `## Plano de arquitectura — ${cap?.name || 'projecto'} / ${mod}`,
    '',
    `Este plano divide **${reqs.length} requisito(s)** em **${diagramTaskCount} diagrama(s)** ligados, seguidos de consolidação.`,
    '',
    '### Sequência',
    ...tasks.map((t, i) => {
      const deps = t.dependsOn.length
        ? ` _(após: ${t.dependsOn.map((d) => tasks.find((x) => x.id === d)?.title || d).join(', ')})_`
        : '';
      return `${i + 1}. **${t.title}** — ${t.requirementIds.length} requisito(s)${deps}`;
    }),
    '',
    'Cada tarefa de diagrama produz **um ou mais diagramArtifacts** rastreáveis aos requisitos indicados.',
    'A consolidação final funde componentes, entidades, APIs e diagramas num único `architecture_pack_v2`.',
  ].join('\n');

  return {
    masterPlanMarkdown,
    tasks,
    moduleTag: mod,
    capabilityId: capabilityId || null,
    capabilityName: cap?.name || null,
    totalRequirements: reqs.length,
    diagramTaskCount,
  };
}

function buildArchitectureDiagramTaskPrompt(project, task, plan) {
  const summary = requirementSummaryForIds(project, task.requirementIds);
  const mod = textOr(plan.moduleTag, 'Backend');
  const depTitles = ensureArray(task.dependsOn)
    .map((id) => plan.tasks.find((t) => t.id === id)?.title)
    .filter(Boolean);

  if (task.role === 'merge') {
    return `Tu és um agente de arquitectura YourLab.

Tarefa: **consolidar** os outputs parciais das sub-tarefas anteriores num único pacote \`architecture_pack_v2\`.

Plano global:
${plan.masterPlanMarkdown}

Regras:
- Funde diagramArtifacts, architectureObjects, dataEntities e apiEndpoints sem duplicar IDs.
- Preserve linkedRequirementIds em cada diagrama.
- Responde APENAS com JSON válido (schema architecture_pack_v2 completo).
- Módulo técnico: ${mod}

Requisitos totais do âmbito (${summary.length}):
${JSON.stringify(summary.slice(0, 40), null, 2)}`;
  }

  return `Tu és um agente de arquitectura YourLab.

Sub-tarefa do plano: **${task.title}**
Tipo de diagrama: **${task.diagramType}** (${task.notation})
Módulo: **${mod}**
${depTitles.length ? `Depende de: ${depTitles.join(' → ')}` : 'Primeira tarefa do plano.'}

Plano global (resumo):
${plan.masterPlanMarkdown}

Tarefa desta sub-tarefa:
- Produzir **um diagrama principal** do tipo \`${task.diagramType}\` para os requisitos abaixo.
- Podes incluir objectos de apoio mínimos (architectureObjects, dataEntities, apiEndpoints) se necessário.
- Cada diagramArtifacts[] deve ter linkedRequirementIds com IDs desta lista.

Requisitos desta tarefa (${summary.length}):
${JSON.stringify(summary, null, 2)}

Responde APENAS com JSON válido:
{
  "architectureSummary": "breve descrição deste diagrama",
  "architectureObjects": [],
  "dataEntities": [],
  "apiEndpoints": [],
  "diagramArtifacts": [{
    "title": "",
    "description": "",
    "type": "${task.diagramType}",
    "notation": "${task.notation}",
    "sourceText": "",
    "module": "${mod}",
    "linkedRequirementIds": [],
    "linkedApiOperationIds": [],
    "linkedEntityIds": [],
    "assumptions": [],
    "openQuestions": []
  }],
  "assumptions": [],
  "openQuestions": []
}`;
}

function applyArchitectureTaskPlanBudget(taskPlan, maxSubtasks = 8) {
  const limit = Math.max(1, Number(maxSubtasks) || 8);
  const mergeTask = taskPlan.tasks.find((t) => t.role === 'merge');
  const workTasks = taskPlan.tasks.filter((t) => t.role !== 'merge');
  const selected = workTasks.slice(0, Math.max(1, limit - (mergeTask ? 1 : 0)));
  const deferred = workTasks.slice(selected.length);
  const tasks = [
    ...selected.map((t) => ({ ...t, deferred: false })),
    ...deferred.map((t) => ({ ...t, deferred: true })),
    ...(mergeTask ? [{ ...mergeTask, deferred: false }] : []),
  ];
  return {
    ...taskPlan,
    tasks,
    selectedTaskCount: selected.length,
    deferredTaskCount: deferred.length,
    fitsBudget: deferred.length === 0,
  };
}

function buildArchitectureTaskPlanForRuntime(project, capabilityId, moduleTag, options = {}) {
  const plan = buildArchitectureTaskPlan(project, capabilityId, moduleTag, options);
  const budgeted = applyArchitectureTaskPlanBudget(plan, options.maxSubtasks);
  const activeTasks = budgeted.tasks.filter((t) => !t.deferred);
  const tasksWithInstructions = activeTasks.map((task) => ({
    ...task,
    instruction: buildArchitectureDiagramTaskPrompt(project, task, budgeted),
  }));
  return {
    ...budgeted,
    tasks: tasksWithInstructions,
    runtimeTasks: tasksWithInstructions.filter((t) => !t.deferred).map((t) => ({
      id: t.id,
      title: t.title,
      instruction: t.instruction,
      diagramType: t.diagramType,
      requirementIds: t.requirementIds,
      dependsOn: t.dependsOn,
      role: t.role,
    })),
  };
}

function mergeArchitecturePartials(partials) {
  const merged = {
    architectureSummary: '',
    architectureMermaid: '',
    architectureObjects: [],
    dataEntities: [],
    apiEndpoints: [],
    modules: [],
    diagramArtifacts: [],
    risks: [],
    artifacts: [],
    openQuestions: [],
    assumptions: [],
    validationNotes: [],
  };
  const seenDiagram = new Set();
  const pushUniqueStrings = (arr, src) => {
    for (const v of ensureArray(src).map(String)) {
      if (v && !arr.includes(v)) arr.push(v);
    }
  };
  const objKey = (arr, item, key) => {
    const k = String(item?.[key] || item?.name || item?.title || '').toLowerCase();
    if (!k || arr.some((e) => String(e?.[key] || e?.name || e?.title || '').toLowerCase() === k)) return;
    arr.push(item);
  };

  for (const parsed of ensureArray(partials)) {
    if (!parsed || typeof parsed !== 'object') continue;
    if (parsed.architectureSummary) merged.architectureSummary = textOr(parsed.architectureSummary);
    for (const d of ensureArray(parsed.diagramArtifacts)) {
      const key = `${textOr(d.type)}::${textOr(d.title)}`;
      if (seenDiagram.has(key)) continue;
      seenDiagram.add(key);
      merged.diagramArtifacts.push(d);
    }
    for (const o of ensureArray(parsed.architectureObjects)) objKey(merged.architectureObjects, o, 'name');
    for (const e of ensureArray(parsed.dataEntities)) objKey(merged.dataEntities, e, 'name');
    for (const a of ensureArray(parsed.apiEndpoints)) objKey(merged.apiEndpoints, a, 'path');
    pushUniqueStrings(merged.openQuestions, parsed.openQuestions);
    pushUniqueStrings(merged.assumptions, parsed.assumptions);
    pushUniqueStrings(merged.risks, parsed.risks);
  }

  if (!merged.architectureSummary && merged.diagramArtifacts.length) {
    merged.architectureSummary = `Pacote com ${merged.diagramArtifacts.length} diagrama(s) consolidado(s).`;
  }
  return merged;
}

function buildArchitectureContextPack(project, capabilityId, moduleTag) {
  const registry = require('./diagram-registry');
  const ctx = buildContextPack(project, { capabilityId, stageId: 'architecture', maxRequirements: 50 });
  const mod = textOr(moduleTag, 'Backend');
  const recommendedTypes = [
    'c4_context', 'c4_container', 'sequence', 'erd', 'uml_class_domain',
    'openapi_spec', 'deployment', 'api_flow', 'state_machine',
  ];
  return {
    ...ctx,
    targetModule: mod,
    capabilities: ensureArray(project.capabilities).map((c) => ({
      id: c.id,
      name: c.name,
      requirementCount: ensureArray(c.requirementIds).length,
    })),
    existingDiagrams: ensureArray(project.diagramArtifacts).map((d) => ({
      id: d.id,
      title: d.title,
      type: d.type,
      notation: d.notation,
      status: d.status,
    })),
    existingArchitecture: {
      components: ensureArray(project.artifacts).filter((a) => a.type === 'architecture_object').length,
      entities: ensureArray(project.artifacts).filter((a) => a.type === 'data_entity').length,
      apiEndpoints: ensureArray(project.artifacts).filter((a) => a.type === 'api_endpoint').length,
    },
    recommendedDiagramTypes: recommendedTypes.map((type) => ({
      type,
      label: registry.getDiagramType(type)?.label || type,
      notation: registry.getRecommendedNotation(type),
    })),
    outputSchemaVersion: 'architecture_pack_v2',
  };
}

function buildArchitecturePackPrompt(project, capabilityId, moduleTag) {
  const mod = textOr(moduleTag, 'Backend');
  const ctx = buildArchitectureContextPack(project, capabilityId, mod);
  const capName = ctx.capability?.name || 'todas as funcionalidades';

  return `Tu és um agente de arquitectura de sistemas YourLab.

Tarefa: gerar um **pacote de arquitectura completo** para a fase **architecture** — componentes, entidades, APIs e **diagramArtifacts** (diagramas versionáveis com rastreabilidade).

Foco:
- Funcionalidade: ${capName}
- Módulo técnico: ${mod}

Regras obrigatórias:
- Responde APENAS com JSON válido (sem \`\`\` fences).
- Use SOMENTE IDs de requisitos presentes em requirementsSummary.
- **OBRIGATÓRIO:** cada diagramArtifacts[].linkedRequirementIds deve incluir pelo menos 1 ID de requisito directamente relacionado ao conteúdo do diagrama.
- Cada item em diagramArtifacts deve incluir sourceText completo e válido para a notation escolhida.
- Tipos de diagrama: use valores de recommendedDiagramTypes (ex.: c4_context, c4_container, sequence, erd, openapi_spec).
- Notações: mermaid, plantuml, openapi, asyncapi, json_schema.
- APIs/entidades ainda inexistentes: prefixo proposed: nos arrays linked*.
- Não duplique diagramas já listados em existingDiagrams salvo melhoria explícita.
- architectureSummary descreve o desenho em linguagem simples para revisão humana.

Context pack (mínimo — não assuma dados fora disto):
${JSON.stringify(ctx, null, 2)}

Schema de output (architecture_pack_v2):
{
  "architectureSummary": "",
  "architectureMermaid": "",
  "architectureObjects": [{
    "name": "",
    "type": "service|component|gateway|frontend|...",
    "descriptionMarkdown": "",
    "relatedRequirementIds": []
  }],
  "dataEntities": [{
    "name": "",
    "fields": [""],
    "relatedRequirementIds": []
  }],
  "apiEndpoints": [{
    "method": "GET",
    "path": "/...",
    "description": "",
    "relatedRequirementIds": []
  }],
  "modules": [{ "name": "Frontend|Backend|Database", "submodules": [] }],
  "diagramArtifacts": [{
    "title": "",
    "description": "",
    "type": "c4_container|sequence|erd|openapi_spec|...",
    "notation": "mermaid|plantuml|openapi|asyncapi|json_schema",
    "sourceText": "",
    "module": "${mod}",
    "linkedRequirementIds": [],
    "linkedApiOperationIds": [],
    "linkedEntityIds": [],
    "assumptions": [],
    "openQuestions": []
  }],
  "risks": [{ "title": "", "description": "" }],
  "artifacts": [{
    "type": "architecture",
    "name": "",
    "description": "",
    "stageId": "architecture"
  }],
  "openQuestions": [],
  "assumptions": [],
  "validationNotes": []
}

Nota: diagramArtifacts[] é o formato principal. O campo legacy diagrams[] só se necessário: [{ "title": "", "format": "mermaid", "content": "" }].`;
}

function buildCapabilityRequirementsPrompt(project, capabilityId) {
  const cap = ensureArray(project.capabilities).find((c) => c.id === capabilityId);
  const ctx = buildContextPack(project, { capabilityId, maxRequirements: 20 });
  return `Gera stakeholder e technical requirements APENAS para capability "${cap?.name || capabilityId}".

Context pack:
${JSON.stringify(ctx, null, 2)}

Responde APENAS com JSON:
{
  "stakeholderRequirements": [{ "title": "", "need": "", "shall": "", "moduleTags": [] }],
  "technicalRequirements": [{ "title": "", "shall": "", "condition": "", "measure": "", "moduleTags": [] }],
  "assumptions": [],
  "risks": [],
  "openQuestions": []
}`;
}

function buildStageTransitionPrompt(project, fromStageId, toStageId, direction = 'forward') {
  const dir = textOr(direction, 'forward');
  const displayFrom = dir === 'backward' ? toStageId : fromStageId;
  const displayTo = dir === 'backward' ? fromStageId : toStageId;
  const fromLabel = STAGE_FOCUS[displayFrom] || displayFrom;
  const toLabel = STAGE_FOCUS[displayTo] || displayTo;
  const ctx = buildContextPack(project, { stageId: displayTo, maxRequirements: 40 });
  const transitionKey = `${fromStageId}->${toStageId}`;
  const reverseKey = `${toStageId}->${fromStageId}`;
  const agents = STAGE_TRANSITION_AGENTS[transitionKey] || STAGE_TRANSITION_AGENTS[reverseKey];
  const hint = dir === 'forward'
    ? (agents?.forward || `Avançar de ${displayFrom} para ${displayTo}`)
    : (agents?.backward || `Retroceder: actualizar ${displayTo} a partir de ${displayFrom}`);

  return `Tu és um agente de systems engineering YourLab.

Transição de fase (${dir === 'forward' ? 'AVANÇAR' : 'RETROCEDER'}):
- De: ${displayFrom} (${fromLabel})
- Para: ${displayTo} (${toLabel})
- Acção: ${hint}

${fromStageId === 'discovery' && toStageId === 'requirements' && dir === 'forward' ? `
Pipeline recomendado (tarefas separadas no Execution Workbench):
1. STK — todas as necessidades de negócio com implementationPhase
2. FR — uma tarefa por fase de implementação, cada FR ligado a STK (parentId)
3. RNF — constraints ligados a FR/STK
4. TC — casos de teste ligados a FR (verified_by)
5. Consolidar traceLinks + moduleMappings
` : ''}

Context pack (nunca enviar projecto inteiro):
${JSON.stringify(ctx, null, 2)}

Responde APENAS com JSON válido:
{
  "transitionSummaryMarkdown": "",
  "direction": "${dir}",
  "fromStageId": "${displayFrom}",
  "toStageId": "${displayTo}",
  "artifacts": [{ "type": "", "name": "", "description": "", "bodyMarkdown": "", "stageId": "${displayTo}" }],
  "stakeholderRequirements": [{ "id": "STK-01", "title": "", "shall": "", "moduleTags": [], "parentId": "", "vLevel": 0 }],
  "technicalRequirements": [{ "id": "FR-01", "title": "", "shall": "", "moduleTags": [] }],
  "requirements": [{ "id": "STK-01", "type": "stakeholder", "title": "", "shall": "", "moduleTags": [] }],
  "capabilities": [],
  "requirementClusters": [],
  "openQuestions": [],
  "risks": [],
  "nextDecision": "",
  "requiresHumanConfirmation": true
}`;
}

function buildPromptRunFull(systemPrompt, stageInstruction, contextPack, taskPrompt, outputSchema) {
  return [systemPrompt, stageInstruction, `Context Pack:\n${JSON.stringify(contextPack, null, 2)}`, taskPrompt, outputSchema].filter(Boolean).join('\n\n---\n\n');
}

function applyGroupingResult(project, parsed, userId) {
  const caps = ensureArray(parsed.capabilities).map((c, i) => normalizeCapability({
    ...c,
    id: c.id || `cap_${String(i + 1).padStart(2, '0')}`,
    updatedAt: nowIso(),
  }));
  const capByName = new Map(caps.map((c) => [c.name.toLowerCase(), c]));
  const clusters = ensureArray(parsed.requirementClusters).map((cl, i) => {
    const cap = capByName.get(String(cl.capabilityName || '').toLowerCase());
    const normalized = normalizeCluster({
      ...cl,
      id: cl.id || `clu_${String(i + 1).padStart(2, '0')}`,
      capabilityId: cap?.id || cl.capabilityId || '',
    });
    if (cap && !cap.clusterIds.includes(normalized.id)) cap.clusterIds.push(normalized.id);
    return normalized;
  });

  for (const mapping of ensureArray(parsed.moduleMappings)) {
    applyModuleMappings(project, [mapping]);
  }

  return { capabilities: caps, requirementClusters: clusters };
}

// ---------------------------------------------------------------------------
// Agent Jobs (batching) — divide pedidos grandes em lotes deterministicos por
// modulo, recolhe parciais e funde-os com um prompt final de reconciliacao.
// ---------------------------------------------------------------------------

const GROUPING_MODULE_PRIORITY = ['Database', 'Backend', 'Frontend'];

function requirementSummaryForIds(project, ids) {
  const wanted = new Set(ensureArray(ids).map(String));
  return ensureArray(project.requirements)
    .filter((r) => wanted.has(String(r.id)))
    .map((r) => ({
      id: r.id,
      type: r.type,
      title: r.title,
      shall: textOr(r.shall).slice(0, 200),
      status: r.status,
      moduleTags: normalizeModuleTags(r.moduleTags, r.module),
    }));
}

// Particiona requisitos por modulo primario (cada requisito num so lote). A
// ordenacao estavel por id garante determinismo entre execucoes. Requisitos sem
// qualquer modulo sao agrupados num lote "Geral" marcado como deferido (podem
// ser definidos mais tarde, sem bloquear a consolidacao).
function partitionRequirementsByModule(project, options = {}) {
  const priority = ensureArray(options.modulePriority).length ? options.modulePriority : GROUPING_MODULE_PRIORITY;
  const maxChunkSize = Math.max(5, numberOr(options.maxChunkSize, 20));
  const reqs = ensureArray(project.requirements)
    .map((r) => ({ id: String(r.id), moduleTags: normalizeModuleTags(r.moduleTags, r.module) }))
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: 'base' }));

  const buckets = new Map();
  const deferred = [];
  for (const r of reqs) {
    const primary = priority.find((m) => r.moduleTags.includes(m));
    if (!primary) { deferred.push(r); continue; }
    if (!buckets.has(primary)) buckets.set(primary, []);
    buckets.get(primary).push(r);
  }

  const chunks = [];
  let idx = 0;
  for (const m of priority) {
    const list = buckets.get(m);
    if (!list || !list.length) continue;
    if (list.length <= maxChunkSize) {
      chunks.push({ index: idx++, key: m, label: m, requirementIds: list.map((r) => r.id), deferred: false, status: 'pending' });
    } else {
      const parts = Math.ceil(list.length / maxChunkSize);
      for (let p = 0; p < parts; p += 1) {
        const slice = list.slice(p * maxChunkSize, (p + 1) * maxChunkSize);
        chunks.push({
          index: idx++,
          key: `${m}-${p + 1}`,
          label: `${m} (${p + 1}/${parts})`,
          requirementIds: slice.map((r) => r.id),
          deferred: false,
          status: 'pending',
        });
      }
    }
  }
  if (deferred.length) {
    chunks.push({
      index: idx++,
      key: 'Geral',
      label: 'Sem módulo (definir mais tarde)',
      requirementIds: deferred.map((r) => r.id),
      deferred: true,
      status: 'pending',
    });
  }
  return chunks;
}

const GROUPING_OUTPUT_SCHEMA = `{
  "capabilities": [{ "name": "", "summaryMarkdown": "", "moduleIds": [], "requirementIds": [], "risks": [], "openQuestions": [], "nextAction": "" }],
  "requirementClusters": [{ "capabilityName": "", "name": "", "summaryMarkdown": "", "requirementIds": [], "clientRequestText": "" }],
  "moduleMappings": [{ "requirementId": "", "moduleTags": ["Frontend","Backend"] }],
  "openQuestions": [],
  "assumptions": []
}`;

function buildGroupingChunkPrompt(project, chunk) {
  const summary = requirementSummaryForIds(project, chunk.requirementIds);
  const scopeNote = chunk.deferred
    ? 'Estes requisitos NÃO têm módulo atribuído. Para cada um, sugere também o moduleMappings adequado (Frontend/Backend/Database).'
    : `Estes requisitos pertencem sobretudo ao módulo: ${chunk.label}. Foca-te apenas neste subconjunto.`;
  return `Tu és um analista de systems engineering. Agrupa APENAS o subconjunto de requisitos abaixo em capabilities e clusters humanos.

Projeto: ${project.name} (${project.clientName})
Lote: ${chunk.label} (${summary.length} requisitos)
${scopeNote}

Requisitos deste lote:
${JSON.stringify(summary, null, 2)}

Responde APENAS com JSON válido:
${GROUPING_OUTPUT_SCHEMA}`;
}

// Fusao deterministica (rede de seguranca / fallback manual): junta capabilities
// pelo nome normalizado e faz a uniao de requirementIds, clusters e mappings.
function mergeGroupingPartials(partials) {
  const capByName = new Map();
  const clusters = [];
  const moduleMappings = [];
  const seenMapping = new Set();
  const openQuestions = [];
  const assumptions = [];
  const pushUnique = (arr, value) => { if (value && !arr.includes(value)) arr.push(value); };
  const mergeInto = (dst, src) => { for (const v of ensureArray(src).map(String)) pushUnique(dst, v); };

  for (const parsed of ensureArray(partials)) {
    if (!parsed || typeof parsed !== 'object') continue;
    for (const cap of ensureArray(parsed.capabilities)) {
      const name = textOr(cap?.name);
      if (!name) continue;
      const key = name.toLowerCase().trim();
      if (!capByName.has(key)) {
        capByName.set(key, {
          name,
          summaryMarkdown: textOr(cap?.summaryMarkdown || cap?.summary),
          moduleIds: [],
          requirementIds: [],
          risks: [],
          openQuestions: [],
          nextAction: textOr(cap?.nextAction),
        });
      }
      const target = capByName.get(key);
      mergeInto(target.moduleIds, cap?.moduleIds);
      mergeInto(target.requirementIds, cap?.requirementIds);
      for (const r of ensureArray(cap?.risks)) pushUnique(target.risks, typeof r === 'string' ? r : textOr(r?.text || r?.description));
      for (const q of ensureArray(cap?.openQuestions)) pushUnique(target.openQuestions, typeof q === 'string' ? q : textOr(q?.text || q?.question));
      if (!target.summaryMarkdown && cap?.summaryMarkdown) target.summaryMarkdown = textOr(cap.summaryMarkdown);
    }
    for (const cl of ensureArray(parsed.requirementClusters)) {
      clusters.push({
        capabilityName: textOr(cl?.capabilityName),
        name: textOr(cl?.name, 'Grupo'),
        summaryMarkdown: textOr(cl?.summaryMarkdown || cl?.summary),
        requirementIds: ensureArray(cl?.requirementIds).map(String),
        clientRequestText: textOr(cl?.clientRequestText),
      });
    }
    for (const m of ensureArray(parsed.moduleMappings)) {
      const id = textOr(m?.requirementId);
      if (!id || seenMapping.has(id)) continue;
      seenMapping.add(id);
      moduleMappings.push({ requirementId: id, moduleTags: ensureArray(m?.moduleTags).map(String) });
    }
    for (const q of ensureArray(parsed.openQuestions)) pushUnique(openQuestions, typeof q === 'string' ? q : textOr(q?.text));
    for (const a of ensureArray(parsed.assumptions)) pushUnique(assumptions, typeof a === 'string' ? a : textOr(a?.text));
  }

  return {
    capabilities: Array.from(capByName.values()),
    requirementClusters: clusters,
    moduleMappings,
    openQuestions,
    assumptions,
  };
}

// A consolidacao so precisa de juizo semantico para fundir capabilities
// duplicadas entre modulos. Clusters e moduleMappings sao fundidos por codigo.
// Por isso o prompt envia APENAS nomes + resumos curtos das capabilities e pede
// grupos de fusao (member names), mantendo o pedido pequeno e dentro dos limites
// de contexto. Os requirementIds sao reatribuidos por codigo (uniao dos membros)
// para garantir que nenhum requisito se perde.
function buildGroupingReconcilePrompt(project, merged) {
  const compactCaps = ensureArray(merged.capabilities).map((c) => ({
    name: c.name,
    summary: textOr(c.summaryMarkdown).slice(0, 140),
    requirementIds: c.requirementIds,
  }));
  return `Tu és um analista de systems engineering. Recebeste capabilities geradas em LOTES separados (por módulo). Algumas representam a mesma funcionalidade e devem ser fundidas.

Projeto: ${project.name} (${project.clientName})

Tarefa: agrupa as capabilities parciais abaixo em grupos finais coerentes. Funde as que representam a mesma funcionalidade entre módulos (ex.: "Autenticação" no Frontend + Backend => um só grupo). NÃO precisas de repetir requisitos: o sistema reatribui os requirementIds automaticamente a partir dos membros de cada grupo.

Regras:
- Cada nome de capability parcial tem de aparecer em EXATAMENTE um grupo (usa o nome exato).
- Dá a cada grupo um finalName claro e um finalSummaryMarkdown curto.

Capabilities parciais (nome + resumo + requisitos só para contexto):
${JSON.stringify(compactCaps, null, 2)}

Responde APENAS com JSON válido:
{
  "groups": [
    { "finalName": "", "finalSummaryMarkdown": "", "members": ["nome parcial 1", "nome parcial 2"] }
  ]
}`;
}

// Transforma os grupos de fusao devolvidos pela IA no schema completo de
// agrupamento. Os requirementIds sao a uniao dos membros (deterministico) e os
// clusters/moduleMappings sao fundidos por codigo. Capabilities parciais que a
// IA nao mencionou sao preservadas (rede de seguranca contra perdas).
function applyReconcileGroups(merged, parsed) {
  const uniq = (arr) => {
    const out = [];
    for (const v of ensureArray(arr).map(String)) if (v && !out.includes(v)) out.push(v);
    return out;
  };
  const partialCaps = ensureArray(merged.capabilities);
  const byName = new Map(partialCaps.map((c) => [String(c.name).toLowerCase().trim(), c]));
  const usedNames = new Set();
  const nameRemap = new Map();
  const finalCaps = [];

  for (const g of ensureArray(parsed?.groups)) {
    const memberKeys = ensureArray(g?.members).map((m) => String(m).toLowerCase().trim());
    const matched = memberKeys.map((m) => byName.get(m)).filter(Boolean);
    if (!matched.length) continue;
    const finalName = textOr(g?.finalName, matched[0].name);
    finalCaps.push({
      name: finalName,
      summaryMarkdown: textOr(g?.finalSummaryMarkdown || g?.summaryMarkdown, matched[0].summaryMarkdown),
      moduleIds: uniq(matched.flatMap((c) => c.moduleIds)),
      requirementIds: uniq(matched.flatMap((c) => c.requirementIds)),
      risks: uniq(matched.flatMap((c) => c.risks)),
      openQuestions: uniq(matched.flatMap((c) => c.openQuestions)),
      nextAction: textOr(matched[0].nextAction),
    });
    for (const m of memberKeys) {
      if (byName.has(m)) { usedNames.add(m); nameRemap.set(m, finalName); }
    }
  }

  for (const c of partialCaps) {
    const key = String(c.name).toLowerCase().trim();
    if (usedNames.has(key)) continue;
    finalCaps.push({ ...c });
    nameRemap.set(key, c.name);
  }

  const seenCluster = new Set();
  const clusters = [];
  for (const cl of ensureArray(merged.requirementClusters)) {
    const origKey = String(cl.capabilityName || '').toLowerCase().trim();
    const capName = nameRemap.get(origKey) || cl.capabilityName;
    const dedupeKey = `${capName}::${cl.name}::${ensureArray(cl.requirementIds).slice().sort().join(',')}`;
    if (seenCluster.has(dedupeKey)) continue;
    seenCluster.add(dedupeKey);
    clusters.push({ ...cl, capabilityName: capName });
  }

  return {
    capabilities: finalCaps,
    requirementClusters: clusters,
    moduleMappings: ensureArray(merged.moduleMappings),
    openQuestions: ensureArray(merged.openQuestions),
    assumptions: ensureArray(merged.assumptions),
  };
}

// Registry de agentes que suportam divisao em lotes. Outros agentes mantem o
// fluxo de prompt unico existente.
const BATCHABLE_AGENTS = {
  requirement_grouping: {
    targetOutput: 'grouping_json',
    partition: (project, options) => partitionRequirementsByModule(project, options),
    buildChunkPrompt: (project, chunk) => buildGroupingChunkPrompt(project, chunk),
    mergePartials: (partials) => mergeGroupingPartials(partials),
    buildReconcilePrompt: (project, merged) => buildGroupingReconcilePrompt(project, merged),
    finalizeReconcile: (merged, parsed) => applyReconcileGroups(merged, parsed),
  },
};

function itemLabel(item, fallback = 'Item') {
  return textOr(item?.title || item?.name || item?.id, fallback);
}

function pushSection(sections, section) {
  if (!section) return;
  if (Array.isArray(section.items) && !section.items.length && !section.before && !section.after) return;
  sections.push(section);
}

function buildHumanReviewPayload(project, run, parsed, rawOutput) {
  const agentType = textOr(run?.agentType, 'agent');
  const sections = [];
  let decisionsCount = 0;

  if (!parsed) {
    if (rawOutput && rawOutput.trim()) {
      return {
        bodyMarkdown: [
          '## Output recebido (sem JSON estruturado)',
          '',
          'A resposta foi colada como texto. Revise o conteúdo bruto antes de aprovar.',
          '',
          '```',
          rawOutput.trim().slice(0, 14000),
          '```',
        ].join('\n'),
        suggestedChanges: { agentType, parsed: null, rawOutput, sections: [] },
        decisionsCount: 1,
        summaryMarkdown: `Revisão pendente: output textual de **${agentType}**.`,
      };
    }
    return {
      bodyMarkdown: [
        '## Aguarda output da IA',
        '',
        'Nenhum output foi colado ainda.',
        '',
        '1. Abra o **Prompt Workbench**',
        '2. Cole a resposta do agente',
        '3. Clique em **Submeter para revisão**',
      ].join('\n'),
      suggestedChanges: null,
      decisionsCount: 0,
      summaryMarkdown: `Aguarda output de **${agentType}**.`,
    };
  }

  const existingCapNames = new Set(ensureArray(project.capabilities).map((c) => String(c.name || '').toLowerCase()));
  const existingClusterNames = new Set(ensureArray(project.requirementClusters).map((c) => String(c.name || '').toLowerCase()));
  const existingReqIds = new Set(ensureArray(project.requirements).map((r) => r.id));
  const existingReqTitleKeys = new Set(ensureArray(project.requirements).map((r) => normalizeReqTitleKey(r.title)).filter(Boolean));
  const existingArtifactNames = new Set(ensureArray(project.artifacts).map((a) => String(a.name || '').toLowerCase()));

  if (parsed.ideaBriefMarkdown) {
    const had = Boolean(textOr(project.ideaBriefMarkdown));
    pushSection(sections, {
      kind: had ? 'updated' : 'created',
      entityType: 'ideaBrief',
      label: had ? 'Idea Brief (melhoria)' : 'Idea Brief (criado)',
      before: had ? project.ideaBriefMarkdown.slice(0, 2000) : null,
      after: parsed.ideaBriefMarkdown.slice(0, 4000),
    });
    decisionsCount += 1;
  }

  if (parsed.vision && typeof parsed.vision === 'object') {
    const v = parsed.vision;
    const had = Boolean(textOr(project.vision?.mainIdeaMarkdown));
    const after = [
      v.headline ? `**${textOr(v.headline)}**` : '',
      textOr(v.mainIdeaMarkdown),
      textOr(v.philosophyMarkdown) ? `\n_Filosofia:_ ${textOr(v.philosophyMarkdown)}` : '',
      ensureArray(v.consequentIdeas).length ? `\n_Ideias consequentes:_ ${ensureArray(v.consequentIdeas).map((c) => textOr(c?.title || c)).filter(Boolean).join(', ')}` : '',
    ].filter(Boolean).join('\n\n');
    pushSection(sections, {
      kind: had ? 'updated' : 'created',
      entityType: 'vision',
      label: had ? 'Visão da ideia (melhoria)' : 'Visão da ideia (criada)',
      before: had ? textOr(project.vision?.mainIdeaMarkdown).slice(0, 2000) : null,
      after: after.slice(0, 4000),
    });
    decisionsCount += 1;
  }

  if (parsed.discovery && typeof parsed.discovery === 'object') {
    const dsc = parsed.discovery;
    const had = Boolean(textOr(project.discovery?.marketSummaryMarkdown));
    const sizing = dsc.marketSizing || {};
    const after = [
      textOr(dsc.marketSummaryMarkdown),
      (sizing.tam || sizing.sam || sizing.som) ? `\n_Mercado:_ TAM ${textOr(sizing.tam, '?')} · SAM ${textOr(sizing.sam, '?')} · SOM ${textOr(sizing.som, '?')}` : '',
      ensureArray(dsc.segments).length ? `\n_Segmentos:_ ${ensureArray(dsc.segments).map((s) => textOr(s?.name || s)).filter(Boolean).join(', ')}` : '',
      ensureArray(dsc.competitors).length ? `\n_Concorrência:_ ${ensureArray(dsc.competitors).map((c) => textOr(c?.name || c)).filter(Boolean).join(', ')}` : '',
    ].filter(Boolean).join('\n\n');
    pushSection(sections, {
      kind: had ? 'updated' : 'created',
      entityType: 'discovery',
      label: had ? 'Descoberta de mercado (melhoria)' : 'Descoberta de mercado (criada)',
      before: had ? textOr(project.discovery?.marketSummaryMarkdown).slice(0, 2000) : null,
      after: after.slice(0, 4000),
    });
    decisionsCount += 1;
  }

  if (parsed.roadmap && typeof parsed.roadmap === 'object') {
    const phases = ensureArray(parsed.roadmap.phases);
    const had = ensureArray(project.roadmap?.phases).length > 0;
    const after = [
      textOr(parsed.roadmap.summaryMarkdown),
      phases.length ? `\n_${phases.length} fase(s):_\n${phases.map((p, i) => {
        const dates = [textOr(p?.startDate), textOr(p?.endDate)].filter(Boolean).join(' → ');
        return `${i + 1}. **${textOr(p?.name, 'Fase')}**${dates ? ` (${dates})` : ''}${p?.designPattern ? ` · ${textOr(p.designPattern)}` : ''}`;
      }).join('\n')}` : '',
    ].filter(Boolean).join('\n\n');
    pushSection(sections, {
      kind: had ? 'updated' : 'created',
      entityType: 'roadmap',
      label: had ? 'Roadmap de implementação (melhoria)' : 'Roadmap de implementação (criado)',
      before: had ? `${ensureArray(project.roadmap.phases).length} fase(s) existentes` : null,
      after: after.slice(0, 4000),
    });
    decisionsCount += 1;
  }

  if (parsed.proposal && typeof parsed.proposal === 'object') {
    const pr = parsed.proposal;
    const had = Boolean(textOr(project.proposal?.headlineMarkdown));
    const phases = ensureArray(pr.phases);
    const cur = textOr(pr.currency, 'EUR');
    const after = [
      textOr(pr.headlineMarkdown),
      textOr(pr.valueJustificationMarkdown),
      phases.length ? `\n_Valor por fase:_\n${phases.map((p) => `- ${textOr(p?.name, 'Fase')}: ${cur} ${textOr(String(p?.value ?? ''), '?')}`).join('\n')}` : '',
      pr.totalValue ? `\n**Total:** ${cur} ${textOr(String(pr.totalValue))}` : '',
    ].filter(Boolean).join('\n\n');
    pushSection(sections, {
      kind: had ? 'updated' : 'created',
      entityType: 'proposal',
      label: had ? 'Proposta comercial (melhoria)' : 'Proposta comercial (criada)',
      before: had ? textOr(project.proposal?.headlineMarkdown).slice(0, 2000) : null,
      after: after.slice(0, 4000),
    });
    decisionsCount += 1;
  }

  if (parsed.implementation && typeof parsed.implementation === 'object') {
    const impl = parsed.implementation;
    if (impl.stack && typeof impl.stack === 'object') {
      const s = impl.stack;
      const had = Boolean(textOr(project.implementation?.stack?.summaryMarkdown));
      const after = [
        textOr(s.summaryMarkdown),
        s.designPattern ? `\n_Design pattern:_ ${textOr(s.designPattern)}` : '',
        ensureArray(s.languages).length ? `\n_Linguagens:_ ${ensureArray(s.languages).join(', ')}` : '',
        ensureArray(s.frameworks).length ? `\n_Frameworks:_ ${ensureArray(s.frameworks).join(', ')}` : '',
        s.deployment ? `\n_Deploy:_ ${textOr(s.deployment)}` : '',
      ].filter(Boolean).join('\n\n');
      pushSection(sections, {
        kind: had ? 'updated' : 'created',
        entityType: 'implementation',
        label: had ? 'Stack técnica (melhoria)' : 'Stack técnica (proposta)',
        before: had ? textOr(project.implementation?.stack?.summaryMarkdown).slice(0, 2000) : null,
        after: after.slice(0, 4000),
      });
      decisionsCount += 1;
    }
    if (Array.isArray(impl.tasks) && impl.tasks.length) {
      const had = ensureArray(project.implementation?.tasks).length > 0;
      const after = `${impl.tasks.length} tarefa(s):\n${impl.tasks.map((t, i) => `${i + 1}. ${textOr(t?.title, 'Tarefa')}`).join('\n')}`;
      pushSection(sections, {
        kind: had ? 'updated' : 'created',
        entityType: 'implementation',
        label: had ? 'Tarefas de implementação (atualizadas)' : 'Tarefas de implementação (criadas)',
        before: had ? `${ensureArray(project.implementation.tasks).length} tarefa(s) existentes` : null,
        after: after.slice(0, 4000),
      });
      decisionsCount += 1;
    }
  }

  if (parsed.transitionSummaryMarkdown || parsed.nextDecision) {
    pushSection(sections, {
      kind: project.nextDecision ? 'updated' : 'created',
      entityType: 'stageTransition',
      label: `Transição de fase (${textOr(parsed.fromStageId, run?.stageId)} → ${textOr(parsed.toStageId, '?')})`,
      after: textOr(parsed.transitionSummaryMarkdown, parsed.nextDecision),
      before: textOr(project.nextDecision) || null,
    });
    if (parsed.nextDecision) {
      pushSection(sections, {
        kind: 'created',
        entityType: 'nextDecision',
        label: 'Próxima decisão',
        after: parsed.nextDecision,
      });
    }
    decisionsCount += 1;
  }

  const newCaps = ensureArray(parsed.capabilities);
  if (newCaps.length) {
    const created = newCaps.filter((c) => !existingCapNames.has(String(c.name || '').toLowerCase()));
    const updated = newCaps.filter((c) => existingCapNames.has(String(c.name || '').toLowerCase()));
    if (created.length) {
      pushSection(sections, {
        kind: 'created',
        entityType: 'capability',
        label: 'Funcionalidades novas',
        items: created.map((c) => ({ name: c.name, summary: shortText(c.summaryMarkdown, 160) })),
      });
      decisionsCount += created.length;
    }
    if (updated.length) {
      pushSection(sections, {
        kind: 'updated',
        entityType: 'capability',
        label: 'Funcionalidades melhoradas',
        items: updated.map((c) => ({ name: c.name, summary: shortText(c.summaryMarkdown, 160) })),
      });
      decisionsCount += updated.length;
    }
  }

  const newClusters = ensureArray(parsed.requirementClusters);
  if (newClusters.length) {
    const created = newClusters.filter((c) => !existingClusterNames.has(String(c.name || '').toLowerCase()));
    const updated = newClusters.filter((c) => existingClusterNames.has(String(c.name || '').toLowerCase()));
    if (created.length) {
      pushSection(sections, {
        kind: 'created',
        entityType: 'requirementCluster',
        label: 'Grupos de requisitos (novos)',
        items: created.map((c) => ({
          name: c.name,
          capability: c.capabilityName || c.capabilityId,
          requirements: ensureArray(c.requirementIds).length,
        })),
      });
      decisionsCount += created.length;
    }
    if (updated.length) {
      pushSection(sections, {
        kind: 'updated',
        entityType: 'requirementCluster',
        label: 'Grupos de requisitos (melhorados)',
        items: updated.map((c) => ({ name: c.name, capability: c.capabilityName || c.capabilityId })),
      });
      decisionsCount += updated.length;
    }
  }

  if (parsed.diagramAnalysisMarkdown) {
    pushSection(sections, {
      kind: 'created',
      entityType: 'diagramAnalysis',
      label: 'Análise do diagrama',
      after: textOr(parsed.diagramAnalysisMarkdown).slice(0, 3000),
    });
    decisionsCount += 1;
  }

  const reqUpdates = ensureArray(parsed.updates).filter((u) => u.id && existingReqIds.has(u.id));
  if (reqUpdates.length) {
    pushSection(sections, {
      kind: 'updated',
      entityType: 'requirement',
      label: 'Actualizações a requisitos existentes',
      items: reqUpdates.map((u) => ({ id: u.id, notes: shortText(u.notes || u.shall, 120) })),
    });
    decisionsCount += reqUpdates.length;
  }

  const stakeholderReqs = ensureArray(parsed.stakeholderRequirements);
  const technicalReqs = ensureArray(parsed.technicalRequirements);
  const unifiedReqs = extractRequirementsFromParsed(parsed);
  if (unifiedReqs.length) {
    const isExisting = (r) => (r.id && existingReqIds.has(r.id)) || existingReqTitleKeys.has(normalizeReqTitleKey(r.title));
    const created = unifiedReqs.filter((r) => !isExisting(r));
    const updated = unifiedReqs.filter((r) => isExisting(r));
    if (created.length) {
      pushSection(sections, {
        kind: 'created',
        entityType: 'requirement',
        label: 'Requisitos (novos)',
        items: created.map((r) => ({ id: r.id || '(auto)', title: itemLabel(r), type: r.type, shall: shortText(r.shall, 120) })),
      });
      decisionsCount += created.length;
    }
    if (updated.length) {
      pushSection(sections, {
        kind: 'updated',
        entityType: 'requirement',
        label: 'Requisitos (alterados)',
        items: updated.map((r) => ({ id: r.id, title: itemLabel(r), shall: shortText(r.shall, 120) })),
      });
      decisionsCount += updated.length;
    }
  } else if (stakeholderReqs.length || technicalReqs.length) {
    const allReqs = [
      ...stakeholderReqs.map((r) => ({ ...r, type: 'stakeholder' })),
      ...technicalReqs.map((r) => ({ ...r, type: 'functional' })),
    ];
    const isExisting = (r) => (r.id && existingReqIds.has(r.id)) || existingReqTitleKeys.has(normalizeReqTitleKey(r.title));
    const created = allReqs.filter((r) => !isExisting(r));
    const updated = allReqs.filter((r) => isExisting(r));
    if (created.length) {
      pushSection(sections, {
        kind: 'created',
        entityType: 'requirement',
        label: 'Requisitos (novos)',
        items: created.map((r) => ({ id: r.id || '(auto)', title: itemLabel(r), type: r.type, shall: shortText(r.shall, 120) })),
      });
      decisionsCount += created.length;
    }
    if (updated.length) {
      pushSection(sections, {
        kind: 'updated',
        entityType: 'requirement',
        label: 'Requisitos (alterados)',
        items: updated.map((r) => ({ id: r.id, title: itemLabel(r), shall: shortText(r.shall, 120) })),
      });
      decisionsCount += updated.length;
    }
  }

  const archObjects = ensureArray(parsed.architectureObjects);
  if (archObjects.length) {
    pushSection(sections, {
      kind: 'created',
      entityType: 'architectureObject',
      label: 'Objectos de arquitectura',
      items: archObjects.map((o) => ({ name: o.name, type: o.type, description: shortText(o.descriptionMarkdown || o.description, 140) })),
    });
    decisionsCount += archObjects.length;
  }

  const dataEntities = ensureArray(parsed.dataEntities);
  if (dataEntities.length) {
    pushSection(sections, {
      kind: 'created',
      entityType: 'dataEntity',
      label: 'Entidades de dados',
      items: dataEntities.map((e) => ({ name: e.name, fields: ensureArray(e.fields).length })),
    });
    decisionsCount += dataEntities.length;
  }

  const apiEndpoints = ensureArray(parsed.apiEndpoints);
  if (apiEndpoints.length) {
    pushSection(sections, {
      kind: 'created',
      entityType: 'apiEndpoint',
      label: 'API endpoints',
      items: apiEndpoints.map((e) => ({ name: `${textOr(e.method, 'GET')} ${textOr(e.path, '/')}`, description: shortText(e.description, 100) })),
    });
    decisionsCount += apiEndpoints.length;
  }

  const diagramArtifacts = ensureArray(parsed.diagramArtifacts);
  if (diagramArtifacts.length) {
    pushSection(sections, {
      kind: 'created',
      entityType: 'diagramArtifact',
      label: 'Diagramas de arquitectura',
      items: diagramArtifacts.map((d) => ({
        name: textOr(d.title, d.type),
        type: d.type,
        notation: d.notation,
        requirements: ensureArray(d.linkedRequirementIds || d.relatedRequirementIds).length,
      })),
    });
    decisionsCount += diagramArtifacts.length;
  } else if (textOr(parsed.architectureMermaid) || ensureArray(parsed.diagrams).length) {
    pushSection(sections, {
      kind: 'created',
      entityType: 'diagramArtifact',
      label: 'Diagramas (formato legado)',
      items: [
        ...(textOr(parsed.architectureMermaid) ? [{ name: 'architectureMermaid', type: 'mermaid', notation: 'mermaid' }] : []),
        ...ensureArray(parsed.diagrams).map((d) => ({ name: textOr(d.title, 'Diagrama'), type: d.format || 'mermaid', notation: d.format || 'mermaid' })),
      ],
    });
    decisionsCount += 1;
  }

  if (textOr(parsed.architectureSummary)) {
    pushSection(sections, {
      kind: project.technicalApproach?.architectureSummary ? 'updated' : 'created',
      entityType: 'architectureSummary',
      label: 'Resumo de arquitectura',
      after: textOr(parsed.architectureSummary).slice(0, 2000),
      before: textOr(project.technicalApproach?.architectureSummary) || null,
    });
    decisionsCount += 1;
  }

  const artifacts = ensureArray(parsed.artifacts);
  if (artifacts.length) {
    const created = artifacts.filter((a) => !existingArtifactNames.has(String(a.name || '').toLowerCase()));
    pushSection(sections, {
      kind: 'created',
      entityType: 'artifact',
      label: 'Artefactos',
      items: created.map((a) => ({ name: a.name, type: a.type, stageId: a.stageId, description: shortText(a.description || a.bodyMarkdown, 120) })),
    });
    decisionsCount += created.length || artifacts.length;
  }

  const moduleMappings = ensureArray(parsed.moduleMappings);
  if (moduleMappings.length) {
    pushSection(sections, {
      kind: 'updated',
      entityType: 'moduleMapping',
      label: 'Mapeamento de módulos',
      items: moduleMappings.map((m) => ({ requirementId: m.requirementId, moduleTags: ensureArray(m.moduleTags).join(', ') })),
    });
    decisionsCount += moduleMappings.length;
  }

  if (ensureArray(parsed.openQuestions).length) {
    pushSection(sections, {
      kind: 'created',
      entityType: 'openQuestion',
      label: 'Questões em aberto',
      items: ensureArray(parsed.openQuestions).map((q) => ({ text: typeof q === 'string' ? q : textOr(q.question || q.text) })),
    });
  }

  if (ensureArray(parsed.risks).length) {
    pushSection(sections, {
      kind: 'created',
      entityType: 'risk',
      label: 'Riscos identificados',
      items: ensureArray(parsed.risks).map((r) => ({ text: typeof r === 'string' ? r : textOr(r.description || r.title) })),
    });
  }

  if (ensureArray(parsed.assumptions).length) {
    pushSection(sections, {
      kind: 'created',
      entityType: 'assumption',
      label: 'Assunções',
      items: ensureArray(parsed.assumptions).map((a) => ({ text: typeof a === 'string' ? a : textOr(a.text || a.description) })),
    });
  }

  if (!sections.length) {
    pushSection(sections, {
      kind: 'created',
      entityType: 'rawOutput',
      label: 'Output JSON',
      after: JSON.stringify(parsed, null, 2).slice(0, 8000),
    });
    decisionsCount = 1;
  }

  const kindLabel = { created: 'Criado', updated: 'Alterado / melhoria' };
  const bodyLines = [
    `## Revisão: ${agentType}`,
    '',
    `**Agente:** ${agentType}`,
    `**Destino:** ${textOr(run?.targetOutput, '—')}`,
    '',
  ];

  for (const section of sections) {
    bodyLines.push(`### ${kindLabel[section.kind] || section.kind}: ${section.label}`);
    if (section.before) {
      bodyLines.push('', '**Antes:**', '```', String(section.before).slice(0, 3000), '```');
    }
    if (section.after) {
      bodyLines.push('', '**Depois / conteúdo:**', '```', String(section.after).slice(0, 4000), '```');
    }
    if (section.items?.length) {
      bodyLines.push('');
      for (const item of section.items) {
        const parts = Object.entries(item).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => `**${k}:** ${v}`);
        bodyLines.push(`- ${parts.join(' · ')}`);
      }
    }
    bodyLines.push('');
  }

  const summaryMarkdown = decisionsCount
    ? `Revisão pendente: **${agentType}** — ${decisionsCount} alteração(ões) proposta(s).`
    : `Revisão pendente: **${agentType}**.`;

  return {
    bodyMarkdown: bodyLines.join('\n'),
    suggestedChanges: { agentType, parsed, sections, rawOutput: textOr(rawOutput).slice(0, 50000) },
    decisionsCount,
    summaryMarkdown,
  };
}

function normalizeJsonInput(raw) {
  if (raw == null) return '';
  const text = String(raw)
    .replace(/^\uFEFF/, '')
    .replace(/[\u201c\u201d\u201e\u201f\u2033\u2036]/g, '"')
    .replace(/[\u2018\u2019\u201a\u201b\u2032\u2035]/g, "'")
    .trim();
  return text;
}

function parseAgentJsonOutput(raw) {
  const normalized = normalizeJsonInput(raw);
  if (!normalized) return { parsed: null, rawOutput: '', normalized: '' };
  try {
    return { parsed: JSON.parse(normalized), rawOutput: normalized, normalized };
  } catch {
    return { parsed: null, rawOutput: normalized, normalized };
  }
}

function shortText(value, max = 120) {
  const s = textOr(value);
  if (!s) return '';
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

function buildArchitecturePackMarkdown(parsed, moduleTag = 'Backend') {
  const lines = [`# Architecture Pack — ${moduleTag}`, ''];
  for (const obj of ensureArray(parsed.architectureObjects)) {
    lines.push(`## ${obj.name} (${obj.type || 'component'})`, '', textOr(obj.descriptionMarkdown || obj.description), '');
  }
  if (ensureArray(parsed.dataEntities).length) {
    lines.push('## Entidades de dados', '');
    for (const entity of parsed.dataEntities) {
      lines.push(`### ${entity.name}`, `- ${ensureArray(entity.fields).join('\n- ')}`, '');
    }
  }
  if (ensureArray(parsed.apiEndpoints).length) {
    lines.push('## API Endpoints', '');
    for (const ep of parsed.apiEndpoints) {
      lines.push(`- **${textOr(ep.method, 'GET')} ${textOr(ep.path, '/')}** — ${textOr(ep.description)}`);
    }
    lines.push('');
  }
  if (ensureArray(parsed.modules).length) {
    lines.push('## Módulos', '');
    for (const mod of parsed.modules) {
      lines.push(`- **${mod.name}**${mod.submodules?.length ? `: ${mod.submodules.join(', ')}` : ''}`);
    }
    lines.push('');
  }
  if (ensureArray(parsed.risks).length) {
    lines.push('## Riscos técnicos', '');
    for (const risk of parsed.risks) {
      const label = typeof risk === 'string' ? risk : `${risk.id || ''} ${risk.title || ''}`.trim();
      const desc = typeof risk === 'string' ? '' : textOr(risk.description);
      lines.push(`- **${label}**${desc ? `: ${desc}` : ''}`);
    }
  }
  return lines.join('\n');
}

function applyArchitecturePack(project, parsed, run, userId) {
  const moduleTag = textOr(run?.moduleTag, 'Backend');
  const capabilityId = textOr(run?.capabilityId);
  const cap = ensureArray(project.capabilities).find((c) => c.id === capabilityId);
  const packLabel = cap?.name || moduleTag;
  const packBody = buildArchitecturePackMarkdown(parsed, packLabel);
  const packName = textOr(
    ensureArray(parsed.artifacts)[0]?.name,
    `Architecture Pack — ${packLabel}`
  );
  const now = nowIso();

  project.technicalApproach = project.technicalApproach || {};
  if (textOr(parsed.architectureSummary)) {
    project.technicalApproach.architectureSummary = textOr(parsed.architectureSummary);
  } else {
    project.technicalApproach.architectureSummary = [
      `${ensureArray(parsed.architectureObjects).length} componentes/serviços`,
      `${ensureArray(parsed.dataEntities).length} entidades`,
      `${ensureArray(parsed.apiEndpoints).length} endpoints`,
      `${ensureArray(parsed.diagramArtifacts).length || ensureArray(parsed.diagrams).length} diagrama(s)`,
      `módulo ${moduleTag}`,
    ].join(' · ');
  }

  const packArtifact = {
    id: `art_${crypto.randomUUID().slice(0, 8)}`,
    type: 'architecture',
    name: packName,
    description: textOr(ensureArray(parsed.artifacts)[0]?.description, packBody.slice(0, 280)),
    bodyMarkdown: packBody,
    stageId: 'architecture',
    status: 'approved',
    metadata: {
      moduleTag,
      capabilityId,
      architectureObjects: parsed.architectureObjects,
      dataEntities: parsed.dataEntities,
      apiEndpoints: parsed.apiEndpoints,
      modules: parsed.modules,
    },
    createdAt: now,
    updatedAt: now,
    createdBy: userId,
    provenance: require('./delivery-os-platform').normalizeArtifactProvenance({
      source: 'ai',
      promptRunId: run?.id,
      agentType: run?.agentType,
    }),
  };

  project.artifacts = [packArtifact, ...ensureArray(project.artifacts)];

  const { createDiagramArtifact, createDiagramArtifactsFromLegacyPack } = require('./diagrams');
  const traceability = require('./diagram-traceability');
  const defaultReqIds = traceability.resolveDefaultPackRequirementIds(project, capabilityId, moduleTag);

  for (const da of ensureArray(parsed.diagramArtifacts)) {
    try {
      const linkedIds = traceability.mergeUniqueIds(
        da.linkedRequirementIds || da.relatedRequirementIds,
        defaultReqIds,
      );
      createDiagramArtifact(project, {
        title: textOr(da.title, da.name, 'Diagrama'),
        description: textOr(da.description, da.summary),
        type: da.type,
        notation: da.notation,
        sourceText: da.sourceText,
        module: textOr(da.module, moduleTag),
        linkedRequirementIds: linkedIds,
        linkedApiOperationIds: da.linkedApiOperationIds,
        linkedEntityIds: da.linkedEntityIds,
        linkedRoadmapPhaseIds: da.linkedRoadmapPhaseIds,
        linkedTestIds: da.linkedTestIds,
        status: 'needs_review',
        generatedBy: 'ai-agent',
        metadata: {
          assumptions: ensureArray(da.assumptions),
          openQuestions: ensureArray(da.openQuestions),
          packId: packArtifact.id,
        },
        capabilityId,
      }, userId);
    } catch (_err) {
      /* diagrama inválido no pack — não bloqueia o resto */
    }
  }

  const mermaidMain = textOr(parsed.architectureMermaid || parsed.mermaid);
  if (mermaidMain) {
    project.technicalApproach.architectureMermaid = mermaidMain;
  }

  createDiagramArtifactsFromLegacyPack(project, parsed, userId, moduleTag, {
    skipIfDiagramArtifacts: ensureArray(parsed.diagramArtifacts).length > 0,
  });

  traceability.syncRequirementDiagramIds(project);

  for (const risk of ensureArray(parsed.risks)) {
    const entry = typeof risk === 'string'
      ? risk
      : `[${textOr(risk.id, 'RISK')}] ${textOr(risk.title)}: ${textOr(risk.description)}`.trim();
    if (!entry) continue;
    project.risks = ensureArray(project.risks);
    const exists = project.risks.some((r) => {
      const text = typeof r === 'string' ? r : `${r.title || ''} ${r.description || ''}`;
      return text.includes(entry.slice(0, 40));
    });
    if (!exists) project.risks.push(entry);
  }
}

function normalizeReqTitleKey(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function nextRequirementId(project, type) {
  const prefix = type === 'stakeholder' ? 'SR' : type === 'functional' ? 'FR' : 'REQ';
  let max = 0;
  ensureArray(project.requirements).forEach((r) => {
    const m = String(r.id || '').match(new RegExp(`^${prefix}-(\\d+)$`, 'i'));
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  return `${prefix}-${max + 1}`;
}

/**
 * Normalise requirement lists from agent JSON — supports both legacy keys
 * (stakeholderRequirements / technicalRequirements) and unified `requirements`.
 */
function extractRequirementsFromParsed(parsed) {
  if (!parsed || typeof parsed !== 'object') return [];
  const reqHierarchy = require('./requirement-hierarchy');
  const out = [];

  ensureArray(parsed.stakeholderRequirements).forEach((r) => {
    out.push({ ...r, type: 'stakeholder', deliveryStageId: textOr(r.deliveryStageId, 'requirements') });
  });
  ensureArray(parsed.technicalRequirements).forEach((r) => {
    out.push({
      ...r,
      type: reqHierarchy.normalizeRequirementType(r.type) || 'functional',
      deliveryStageId: textOr(r.deliveryStageId, 'requirements'),
    });
  });
  ensureArray(parsed.requirements).forEach((r) => {
    out.push({
      ...r,
      type: reqHierarchy.normalizeRequirementType(r.type) || 'functional',
      deliveryStageId: textOr(r.deliveryStageId, 'requirements'),
      phase: textOr(r.phase, r.implementationPhase, r.implementation_phase),
      implementationPhase: textOr(r.implementationPhase, r.implementation_phase, r.phase),
    });
  });

  return out;
}

function applyModuleMappings(project, mappings) {
  for (const mapping of ensureArray(mappings)) {
    const req = ensureArray(project.requirements).find((r) => r.id === mapping.requirementId);
    if (req) req.moduleTags = normalizeModuleTags(mapping.moduleTags, req.module);
  }
}

/**
 * Merge AI-produced requirements into the project WITHOUT multiplying them.
 * If an incoming requirement matches an existing one by id or by normalized
 * title, it updates that record (filling empty fields) instead of appending.
 * New requirements get a sequential id when the agent omitted one.
 */
function mergeRequirementsDedup(project, incoming, normalizeRequirementRecord) {
  const reqHierarchy = require('./requirement-hierarchy');
  let added = 0;
  let updated = 0;
  let skipped = 0;
  const byType = new Map();

  ensureArray(incoming).forEach((raw) => {
    const candidate = normalizeRequirementRecord(raw);
    const type = reqHierarchy.normalizeRequirementType(candidate.type) || 'functional';
    if (!byType.has(type)) byType.set(type, []);
    byType.get(type).push(candidate);
  });

  for (const [type, items] of byType) {
    const result = reqHierarchy.mergeRequirementsByDedupe(
      project.requirements,
      items,
      type,
      normalizeRequirementRecord
    );
    project.requirements = result.requirements;
    added += result.added;
    updated += result.updated;
    skipped += result.skipped;
  }

  return { added, updated, skipped };
}

function applyPromptRunOutput(project, run, parsed, userId, deps = {}) {
  const normalizeRequirementRecord = deps.normalizeRequirementRecord || ((r) => r);
  const traceability = require('./diagram-traceability');
  if (!parsed || !run) return;

  const isArchitecturePack = run.agentType === 'requirements_to_architecture'
    || (parsed.architectureObjects || parsed.dataEntities || parsed.apiEndpoints || parsed.diagramArtifacts);

  if (isArchitecturePack) {
    applyArchitecturePack(project, parsed, run, userId);
    project.traceLinks = mergeTraceLinks(project.traceLinks, autoDeriveTraceLinks(project));
    return;
  }

  const beforeReqIds = new Set(ensureArray(project.requirements).map((r) => r.id));

  if (run.agentType === 'requirement_grouping' || parsed.capabilities || parsed.requirementClusters) {
    const applied = applyGroupingResult(project, parsed, userId);
    if (applied.capabilities?.length) project.capabilities = applied.capabilities;
    if (applied.requirementClusters?.length) project.requirementClusters = applied.requirementClusters;
  }

  if (parsed.ideaBriefMarkdown) project.ideaBriefMarkdown = parsed.ideaBriefMarkdown;

  if (parsed.vision && typeof parsed.vision === 'object') {
    project.vision = normalizeVision({ ...parsed.vision, updatedAt: nowIso() }, project);
    if (!textOr(project.ideaBriefMarkdown) && project.vision.mainIdeaMarkdown) {
      project.ideaBriefMarkdown = project.vision.mainIdeaMarkdown;
    }
  }

  if (parsed.discovery && typeof parsed.discovery === 'object') {
    project.discovery = normalizeDiscovery({ ...parsed.discovery, updatedAt: nowIso() });
  }

  if (parsed.roadmap && typeof parsed.roadmap === 'object') {
    project.roadmap = normalizeRoadmap({ ...parsed.roadmap, updatedAt: nowIso() }, project);
  }

  if (run.agentType === 'roadmap_milestones' && Array.isArray(parsed.milestones) && project.roadmap) {
    const phaseId = textOr(run.contextPack?.roadmapPhaseId);
    const phase = ensureArray(project.roadmap.phases).find((p) => p.id === phaseId);
    if (phase) {
      phase.milestones = parsed.milestones.map((m) => {
        if (typeof m === 'string') return { name: m, date: '' };
        return { name: textOr(m?.name || m?.title), date: textOr(m?.date) };
      }).filter((m) => m.name);
      project.roadmap.updatedAt = nowIso();
    }
  }

  if (parsed.proposal && typeof parsed.proposal === 'object' && run.agentType !== 'commercial_proposal') {
    project.proposal = normalizeProposal({ ...parsed.proposal, updatedAt: nowIso() });
  }

  if (parsed.implementation && typeof parsed.implementation === 'object') {
    const current = normalizeImplementation(project.implementation, project);
    const incoming = parsed.implementation;
    const merged = { ...current };
    if (incoming.stack && typeof incoming.stack === 'object') {
      // Preserve user confirmation only if the stack content is unchanged-ish;
      // a regenerated stack should be re-confirmed by a human.
      merged.stack = { ...incoming.stack, confirmed: false, confirmedAt: '' };
    }
    if (Array.isArray(incoming.tasks)) {
      // Re-running task generation replaces the task list but keeps the human's
      // execution state (chosen model, status, results) for tasks with the same title+phase.
      const prevByKey = new Map(current.tasks.map((t) => [`${t.roadmapPhaseId}::${t.title.toLowerCase()}`, t]));
      merged.tasks = incoming.tasks.map((t) => {
        const key = `${textOr(t?.roadmapPhaseId || t?.phaseId)}::${textOr(t?.title || t?.name).toLowerCase()}`;
        const prev = prevByKey.get(key);
        if (!prev) return t;
        return {
          ...t,
          llmSize: prev.llmSize,
          status: prev.status,
          resultMarkdown: prev.resultMarkdown,
          outputLinks: prev.outputLinks,
          executedModel: prev.executedModel,
          executedAt: prev.executedAt,
        };
      });
    }
    merged.updatedAt = nowIso();
    project.implementation = normalizeImplementation(merged, project);
  }

  if (parsed.transitionSummaryMarkdown) {
    project.nextDecision = textOr(parsed.nextDecision, parsed.transitionSummaryMarkdown.slice(0, 200));
  } else if (parsed.nextDecision) {
    project.nextDecision = parsed.nextDecision;
  }

  if (parsed.stakeholderRequirements || parsed.technicalRequirements || ensureArray(parsed.requirements).length) {
    const incoming = extractRequirementsFromParsed(parsed);
    mergeRequirementsDedup(project, incoming, normalizeRequirementRecord);
  }

  if (ensureArray(parsed.moduleMappings).length) {
    applyModuleMappings(project, parsed.moduleMappings);
  }

  if (ensureArray(parsed.updates).length) {
    project.requirements = ensureArray(project.requirements).map((req) => {
      const patch = parsed.updates.find((u) => u.id === req.id);
      if (!patch) return req;
      return normalizeRequirementRecord({
        ...req,
        ...patch,
        id: req.id,
        updatedAt: nowIso(),
      });
    });
  }

  if (parsed.artifacts) {
    project.artifacts = [...ensureArray(project.artifacts), ...ensureArray(parsed.artifacts).map((a) => ({
      ...a,
      id: a.id || `art_${crypto.randomUUID().slice(0, 8)}`,
      bodyMarkdown: a.bodyMarkdown || a.descriptionMarkdown || a.description,
    }))];
  }

  if (run.agentType === 'diagram_to_requirements') {
    const newRequirementIds = ensureArray(project.requirements)
      .filter((r) => !beforeReqIds.has(r.id))
      .map((r) => r.id);
    traceability.applyDiagramToRequirementsResult(project, run, parsed, { newRequirementIds });
  }

  if (ensureArray(parsed.traceLinks).length) {
    project.traceLinks = mergeTraceLinks(project.traceLinks, parsed.traceLinks);
  }

  project.traceLinks = mergeTraceLinks(project.traceLinks, autoDeriveTraceLinks(project));
  stampAiProvenanceOnArtifacts(project, run, userId);
}

function stampAiProvenanceOnArtifacts(project, run, userId) {
  if (!run) return;
  const platform = require('./delivery-os-platform');
  const cutoff = run.createdAt || run.reviewedAt;
  const cutoffMs = cutoff ? new Date(cutoff).getTime() : 0;
  project.artifacts = ensureArray(project.artifacts).map((art) => {
    const artMs = new Date(art.updatedAt || art.createdAt).getTime();
    if (cutoffMs && artMs < cutoffMs - 5000) return art;
    if (art.provenance?.source === 'human') return art;
    return {
      ...art,
      provenance: platform.normalizeArtifactProvenance({
        source: art.provenance?.editedBy ? 'mixed' : 'ai',
        promptRunId: run.id,
        agentType: run.agentType,
        editedBy: art.provenance?.editedBy || null,
        approvedBy: run.reviewedBy || null,
        approvedAt: run.reviewedAt || null,
      }),
    };
  });
}

function upsertHumanReviewFromPromptRun(project, run, parsed, rawOutput) {
  const payload = buildHumanReviewPayload(project, run, parsed, rawOutput);
  const actionable = payload.decisionsCount > 0 || ensureArray(payload.suggestedChanges?.sections).length > 0;
  const existingIdx = ensureArray(project.humanReviews).findIndex(
    (r) => r.promptRunId === run.id || (r.sourceType === 'prompt_run' && r.sourceId === run.id)
  );

  if (!actionable) {
    if (existingIdx >= 0) {
      const existing = project.humanReviews[existingIdx];
      if (['pending', 'awaiting_output'].includes(existing.status)) {
        existing.status = 'cancelled';
        existing.resolutionNotes = textOr(existing.resolutionNotes, 'Sem alterações detectadas no output.');
        existing.resolvedAt = nowIso();
      }
    }
    return { payload, review: null, actionable: false };
  }

  if (existingIdx >= 0) {
    const review = project.humanReviews[existingIdx];
    review.bodyMarkdown = payload.bodyMarkdown;
    review.suggestedChanges = payload.suggestedChanges;
    review.decisionsCount = payload.decisionsCount;
    review.summaryMarkdown = payload.summaryMarkdown;
    review.title = `Revisão: ${textOr(run.agentType, 'agent')}`;
    review.status = 'pending';
    review.resolvedAt = '';
    review.resolvedBy = '';
    return { payload, review, actionable: true };
  }

  const review = normalizeHumanReview({
    type: 'agent_output',
    title: `Revisão: ${textOr(run.agentType, 'agent')}`,
    summaryMarkdown: payload.summaryMarkdown,
    bodyMarkdown: payload.bodyMarkdown,
    suggestedChanges: payload.suggestedChanges,
    decisionsCount: payload.decisionsCount,
    promptRunId: run.id,
    sourceType: 'prompt_run',
    sourceId: run.id,
    status: 'pending',
    readingTimeMinutes: Math.max(1, Math.ceil(textOr(payload.bodyMarkdown).length / 800)),
  });
  project.humanReviews = ensureArray(project.humanReviews);
  project.humanReviews.unshift(review);
  return { payload, review, actionable: true };
}

function syncHumanReviewFromPromptRun(project, run, parsed, rawOutput) {
  const result = upsertHumanReviewFromPromptRun(project, run, parsed, rawOutput);
  return result.payload;
}

function cloneForSnapshot(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function createProjectSnapshot(project, label, userId, stageId) {
  return normalizeVersionSnapshot({
    label,
    stageId,
    createdBy: userId,
    snapshotData: {
      requirements: cloneForSnapshot(project.requirements),
      capabilities: cloneForSnapshot(project.capabilities),
      requirementClusters: cloneForSnapshot(project.requirementClusters),
      artifacts: cloneForSnapshot(project.artifacts),
      traceLinks: cloneForSnapshot(project.traceLinks),
      stages: cloneForSnapshot(project.stages),
      ideaBriefMarkdown: cloneForSnapshot(project.ideaBriefMarkdown),
      documents: cloneForSnapshot(project.documents),
      informationEntries: cloneForSnapshot(project.informationEntries),
      roadmap: cloneForSnapshot(project.roadmap),
      implementation: cloneForSnapshot(project.implementation),
      approvals: cloneForSnapshot(project.approvals),
      impactReports: cloneForSnapshot(project.impactReports),
      executionPlans: cloneForSnapshot(project.executionPlans),
      promptRuns: cloneForSnapshot(project.promptRuns),
      humanReviews: cloneForSnapshot(project.humanReviews),
      diagramArtifacts: cloneForSnapshot(project.diagramArtifacts),
      decisions: cloneForSnapshot(project.decisions),
      changeRequests: cloneForSnapshot(project.changeRequests),
      deliveryLevel: cloneForSnapshot(project.deliveryLevel),
    },
  });
}

function exportImpactReportMarkdown(report, project) {
  const lines = [
    `# Impact Report`,
    ``,
    `**Projecto:** ${project.name}`,
    `**Origem:** ${report.sourceType} / ${report.sourceId}`,
    `**Gerado:** ${report.createdAt}`,
    ``,
    `## Nós afectados (${ensureArray(report.impactedNodes).length})`,
    ...ensureArray(report.impactedNodes).map((n) => `- ${n.nodeType}: ${n.nodeId}`),
    ``,
    `## Resumo`,
    textOr(report.summary),
  ];
  return lines.join('\n');
}

function registerDeliveryOsRoutes(app, deps) {
  const {
    authMiddleware,
    requireProjectEditor,
    loadProjectForUser,
    readStore,
    updateStore,
    appendActivity,
    sanitizeProject,
    normalizeArtifacts,
    normalizeTraceLinks,
    normalizeApprovals,
    normalizeMeetingMinutes,
    normalizeRequirementRecord,
    numberOr: numOr,
    projectAudit,
    getUserName,
  } = deps;
  const phaseContent = getPhaseContent();

  app.post('/api/projects/markdown/render', authMiddleware, async (req, res) => {
    try {
      const markdown = String(req.body?.markdown || '');
      const html = renderMarkdownToHtml(markdown);
      const mermaidBlocks = extractMermaidBlocks(markdown);
      return res.json({ html, mermaidBlocks });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get('/api/projects/config/delivery-os', authMiddleware, async (req, res) => {
    return res.json({
      moduleTags: MODULE_TAGS,
      traceNodeTypes: TRACE_NODE_TYPES,
      informationTypes: INFORMATION_TYPES,
      agentTypes: AGENT_TYPES,
      onionLayers: ONION_LAYERS,
      stageFocus: STAGE_FOCUS,
      stageNextHint: STAGE_NEXT_HINT,
      stageOrder: STAGE_ORDER,
      stageTransitionAgents: STAGE_TRANSITION_AGENTS,
      platformConcepts: PLATFORM_CONCEPTS,
      stageConceptKeys: STAGE_CONCEPT_KEYS,
    });
  });

  app.get('/api/projects/projects/:projectId/capabilities', authMiddleware, loadProjectForUser, async (req, res) => {
    const p = req.loadedProject;
    return res.json({
      capabilities: ensureArray(p.capabilities).map(normalizeCapability),
      requirementClusters: ensureArray(p.requirementClusters).map(normalizeCluster),
    });
  });

  app.post('/api/projects/projects/:projectId/capabilities', authMiddleware, loadProjectForUser, requireProjectEditor, async (req, res) => {
    try {
      const projectId = req.params.projectId;
      const body = req.body || {};
      await updateStore(async (store) => {
        const project = store.projects.find((e) => e.id === projectId);
        if (!project) throw new Error('Projeto nao encontrado.');
        if (body.capabilities) project.capabilities = ensureArray(body.capabilities).map(normalizeCapability);
        if (body.requirementClusters) project.requirementClusters = ensureArray(body.requirementClusters).map(normalizeCluster);
        project.updatedAt = nowIso();
        appendActivity(store, { actorUserId: req.auth.user.id, projectId, action: 'capabilities_updated', details: {} });
      });
      const store = await readStore();
      const updated = store.projects.find((e) => e.id === projectId);
      return res.json({ project: sanitizeProject(updated, req.auth.user) });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.post('/api/projects/projects/:projectId/add-information', authMiddleware, loadProjectForUser, requireProjectEditor, async (req, res) => {
    try {
      const projectId = req.params.projectId;
      const body = req.body || {};
      const entry = normalizeInformationEntry({
        ...body,
        createdBy: req.auth.user.id,
      });

      let review = null;
      if (entry.analyzeWithAgent) {
        review = normalizeHumanReview({
          type: 'information_classification',
          title: `Nova informação: ${entry.type}`,
          summaryMarkdown: `Informação recebida para classificação na fase ${entry.stageId}.`,
          bodyMarkdown: entry.bodyMarkdown,
          sourceType: 'information_entry',
          sourceId: entry.id,
          status: 'awaiting_output',
          readingTimeMinutes: Math.max(1, Math.ceil(entry.bodyMarkdown.length / 800)),
        });
      }

      await updateStore(async (store) => {
        const project = store.projects.find((e) => e.id === projectId);
        if (!project) throw new Error('Projeto nao encontrado.');
        project.informationEntries = ensureArray(project.informationEntries);
        project.informationEntries.unshift(entry);
        if (entry.type === 'meeting_minutes') {
          project.meetingMinutes = normalizeMeetingMinutes(project.meetingMinutes);
          project.meetingMinutes.unshift({
            id: `min_${crypto.randomUUID().slice(0, 8)}`,
            meetingDate: nowIso().slice(0, 10),
            rawText: entry.bodyMarkdown,
            bodyMarkdown: entry.bodyMarkdown,
            createdAt: nowIso(),
            createdBy: req.auth.user.id,
          });
        }
        if (review) {
          review.sourceId = entry.id;
          project.humanReviews = ensureArray(project.humanReviews);
          project.humanReviews.unshift(review);
        }
        project.updatedAt = nowIso();
        appendActivity(store, { actorUserId: req.auth.user.id, projectId, action: 'information_added', details: { type: entry.type } });
      });

      const store = await readStore();
      const updated = store.projects.find((e) => e.id === projectId);
      return res.json({ project: sanitizeProject(updated, req.auth.user), entry, review });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.get('/api/projects/projects/:projectId/human-reviews', authMiddleware, loadProjectForUser, async (req, res) => {
    const reviews = ensureArray(req.loadedProject.humanReviews).map(normalizeHumanReview);
    return res.json({ reviews });
  });

  app.post('/api/projects/projects/:projectId/human-reviews/:reviewId/enrich', authMiddleware, loadProjectForUser, requireProjectEditor, async (req, res) => {
    try {
      const { projectId, reviewId } = req.params;
      let enriched = null;
      await updateStore(async (store) => {
        const project = store.projects.find((e) => e.id === projectId);
        if (!project) throw new Error('Projeto nao encontrado.');
        const review = ensureArray(project.humanReviews).find((r) => r.id === reviewId);
        if (!review) throw new Error('Review nao encontrada.');
        const run = ensureArray(project.promptRuns).find(
          (r) => r.id === review.promptRunId || r.id === review.sourceId
        );
        if (run && (run.parsedOutput || run.rawOutput)) {
          enriched = upsertHumanReviewFromPromptRun(project, run, run.parsedOutput, run.rawOutput);
          project.updatedAt = nowIso();
        }
      });
      const store = await readStore();
      const updated = store.projects.find((e) => e.id === projectId);
      const review = normalizeHumanReview(ensureArray(updated?.humanReviews).find((r) => r.id === reviewId));
      return res.json({ review, enriched: Boolean(enriched) });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.post('/api/projects/projects/:projectId/human-reviews/:reviewId/resolve', authMiddleware, loadProjectForUser, requireProjectEditor, async (req, res) => {
    try {
      const { projectId, reviewId } = req.params;
      const { status, resolutionNotes, applyChanges, action } = req.body || {};
      const resolvedAction = textOr(action, status);
      let rollbackProject = null;
      let repromptRun = null;

      await updateStore(async (store) => {
        const project = store.projects.find((e) => e.id === projectId);
        if (!project) throw new Error('Projeto nao encontrado.');
        const review = ensureArray(project.humanReviews).find((r) => r.id === reviewId);
        if (!review) throw new Error('Review nao encontrada.');

        if (resolvedAction === 'rollback' && review.preApplySnapshotId) {
          const snap = ensureArray(project.versionSnapshots).find((s) => s.id === review.preApplySnapshotId);
          if (!snap?.snapshotData) throw new Error('Snapshot de rollback nao encontrado.');
          const data = snap.snapshotData;
          if (data.requirements) project.requirements = data.requirements;
          if (data.capabilities) project.capabilities = data.capabilities;
          if (data.requirementClusters) project.requirementClusters = data.requirementClusters;
          if (data.artifacts) project.artifacts = data.artifacts;
          if (data.traceLinks) project.traceLinks = data.traceLinks;
          if (data.stages) project.stages = data.stages;
          if (data.ideaBriefMarkdown) project.ideaBriefMarkdown = data.ideaBriefMarkdown;
          review.status = 'rejected';
          review.resolutionNotes = textOr(resolutionNotes, 'Revertido para snapshot anterior.');
          review.resolvedAt = nowIso();
          review.resolvedBy = req.auth.user.id;
          project.updatedAt = nowIso();
          rollbackProject = true;
          return;
        }

        if (resolvedAction === 'cancel') {
          review.status = 'cancelled';
          review.resolutionNotes = textOr(resolutionNotes);
          review.resolvedAt = nowIso();
          review.resolvedBy = req.auth.user.id;
          project.updatedAt = nowIso();
          return;
        }

        if (resolvedAction === 'needs_clarification') {
          review.status = 'needs_clarification';
          review.resolutionNotes = textOr(resolutionNotes, 'Necessita esclarecimento.');
          review.resolvedAt = nowIso();
          review.resolvedBy = req.auth.user.id;
          project.updatedAt = nowIso();
          return;
        }

        if (resolvedAction === 'deferred') {
          review.status = 'deferred';
          review.resolutionNotes = textOr(resolutionNotes, 'Adiado para revisão posterior.');
          review.resolvedAt = nowIso();
          review.resolvedBy = req.auth.user.id;
          project.updatedAt = nowIso();
          return;
        }

        if (resolvedAction === 'reprompt') {
          review.status = 'changes_requested';
          review.resolutionNotes = textOr(resolutionNotes, 'Reprompt solicitado.');
          review.resolvedAt = nowIso();
          review.resolvedBy = req.auth.user.id;
          const linkedRun = ensureArray(project.promptRuns).find(
            (r) => r.id === review.promptRunId || r.id === review.sourceId
          );
          if (linkedRun) {
            linkedRun.status = 'awaiting_output';
            repromptRun = linkedRun;
          }
          project.updatedAt = nowIso();
          return;
        }

        review.status = ['approved', 'changes_requested', 'rejected', 'needs_clarification', 'deferred'].includes(resolvedAction)
          ? resolvedAction
          : (['approved', 'changes_requested', 'rejected', 'needs_clarification', 'deferred'].includes(status) ? status : 'approved');
        review.resolvedAt = nowIso();
        review.resolvedBy = req.auth.user.id;
        review.resolutionNotes = textOr(resolutionNotes);
        const approved = review.status === 'approved';
        const linkedRunForAudit = ensureArray(project.promptRuns).find(
          (r) => r.id === review.promptRunId || r.id === review.sourceId
        );
        if (approved && applyChanges !== false && projectAudit) {
          const snap = projectAudit.capturePreChangeSnapshot(
            project,
            `Antes de revisão ${review.id.slice(0, 12)}`,
            req.auth.user.id,
            linkedRunForAudit?.stageId || review.sourceType
          );
          projectAudit.recordProjectAudit(project, {
            actorUserId: req.auth.user.id,
            actorName: getUserName ? getUserName(store, req.auth.user.id) : req.auth.user.name,
            action: 'human_review_approved',
            summary: `Revisão aprovada: ${textOr(review.title, review.id)}`,
            snapshotId: snap.id,
            metadata: { reviewId: review.id, agentType: review.suggestedChanges?.agentType },
          }, appendActivity, store);
          review.preApprovalSnapshotId = snap.id;
        }
        if (approved && applyChanges !== false) {
          let parsed = review.suggestedChanges?.parsed || null;
          const linkedRun = linkedRunForAudit || ensureArray(project.promptRuns).find(
            (r) => r.id === review.promptRunId || r.id === review.sourceId
          );
          if (!parsed && review.suggestedChanges?.rawOutput) {
            parsed = parseAgentJsonOutput(review.suggestedChanges.rawOutput).parsed;
          }
          if (!parsed && linkedRun?.parsedOutput) parsed = linkedRun.parsedOutput;
          if (!parsed && linkedRun?.rawOutput) {
            parsed = parseAgentJsonOutput(linkedRun.rawOutput).parsed;
          }
          if (parsed) {
            const snap = createProjectSnapshot(
              project,
              `Antes de revisão ${review.id.slice(0, 12)}`,
              req.auth.user.id,
              linkedRun?.stageId || review.sourceType
            );
            project.versionSnapshots = ensureArray(project.versionSnapshots);
            project.versionSnapshots.unshift(snap);
            project.versionSnapshots = project.versionSnapshots.slice(0, 50);
            review.preApplySnapshotId = snap.id;

            if (linkedRun && linkedRun.status !== 'applied') {
              applyPromptRunOutput(project, linkedRun, parsed, req.auth.user.id, { normalizeRequirementRecord });
              linkedRun.status = 'applied';
              linkedRun.reviewedAt = nowIso();
              linkedRun.reviewedBy = req.auth.user.id;
            } else if (!linkedRun) {
              applyPromptRunOutput(project, {
                agentType: textOr(review.suggestedChanges?.agentType, 'agent_output'),
                stageId: 'architecture',
                moduleTag: 'Backend',
              }, parsed, req.auth.user.id, { normalizeRequirementRecord });
            }
            project.traceLinks = mergeTraceLinks(project.traceLinks, autoDeriveTraceLinks(project));
          }
        }
        project.updatedAt = nowIso();
      });
      const store = await readStore();
      const updated = store.projects.find((e) => e.id === projectId);
      return res.json({
        project: sanitizeProject(updated, req.auth.user),
        rollback: Boolean(rollbackProject),
        repromptRun,
      });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.post('/api/projects/projects/:projectId/stages/:stageId/approve', authMiddleware, loadProjectForUser, requireProjectEditor, async (req, res) => {
    try {
      const { projectId, stageId } = req.params;
      const notes = textOr(req.body?.notes);
      await updateStore(async (store) => {
        const project = store.projects.find((e) => e.id === projectId);
        if (!project) throw new Error('Projeto nao encontrado.');
        project.stages = ensureArray(project.stages).map((s) => {
          if (s.id !== stageId) return s;
          return { ...s, status: 'approved' };
        });
        project.approvals = normalizeApprovals(project.approvals);
        project.approvals.unshift({
          id: `appr_${crypto.randomUUID().slice(0, 8)}`,
          stageId,
          status: 'approved',
          notes,
          approvedAt: nowIso(),
          approvedBy: req.auth.user.id,
        });
        project.updatedAt = nowIso();
      });
      const store = await readStore();
      return res.json({ project: sanitizeProject(store.projects.find((e) => e.id === projectId), req.auth.user) });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.patch('/api/projects/projects/:projectId/stages/:stageId', authMiddleware, loadProjectForUser, requireProjectEditor, async (req, res) => {
    try {
      const { projectId, stageId } = req.params;
      const { status } = req.body || {};
      await updateStore(async (store) => {
        const project = store.projects.find((e) => e.id === projectId);
        if (!project) throw new Error('Projeto nao encontrado.');
        project.stages = ensureArray(project.stages).map((s) => (s.id === stageId ? { ...s, status: textOr(status, s.status) } : s));
        project.updatedAt = nowIso();
      });
      const store = await readStore();
      return res.json({ project: sanitizeProject(store.projects.find((e) => e.id === projectId), req.auth.user) });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.post('/api/projects/projects/:projectId/snapshots', authMiddleware, loadProjectForUser, requireProjectEditor, async (req, res) => {
    try {
      const projectId = req.params.projectId;
      const label = textOr(req.body?.label, `Snapshot ${nowIso().slice(0, 10)}`);
      let snapshot = null;
      await updateStore(async (store) => {
        const project = store.projects.find((e) => e.id === projectId);
        if (!project) throw new Error('Projeto nao encontrado.');
        snapshot = createProjectSnapshot(project, label, req.auth.user.id, req.body?.stageId);
        project.versionSnapshots = ensureArray(project.versionSnapshots);
        project.versionSnapshots.unshift(snapshot);
        project.versionSnapshots = project.versionSnapshots.slice(0, 30);
        project.updatedAt = nowIso();
      });
      return res.json({ snapshot });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.post('/api/projects/projects/:projectId/snapshots/:snapshotId/restore', authMiddleware, loadProjectForUser, requireProjectEditor, async (req, res) => {
    try {
      const { projectId, snapshotId } = req.params;
      await updateStore(async (store) => {
        const project = store.projects.find((e) => e.id === projectId);
        if (!project) throw new Error('Projeto nao encontrado.');
        const snap = ensureArray(project.versionSnapshots).find((s) => s.id === snapshotId);
        if (!snap?.snapshotData) throw new Error('Snapshot nao encontrado.');
        const data = snap.snapshotData;
        if (data.requirements) project.requirements = data.requirements;
        if (data.capabilities) project.capabilities = data.capabilities;
        if (data.requirementClusters) project.requirementClusters = data.requirementClusters;
        if (data.artifacts) project.artifacts = data.artifacts;
        if (data.traceLinks) project.traceLinks = data.traceLinks;
        if (data.stages) project.stages = data.stages;
        if (data.ideaBriefMarkdown) project.ideaBriefMarkdown = data.ideaBriefMarkdown;
        project.updatedAt = nowIso();
      });
      const store = await readStore();
      return res.json({ project: sanitizeProject(store.projects.find((e) => e.id === projectId), req.auth.user) });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.post('/api/projects/projects/:projectId/trace-links/sync', authMiddleware, loadProjectForUser, requireProjectEditor, async (req, res) => {
    try {
      const projectId = req.params.projectId;
      await updateStore(async (store) => {
        const project = store.projects.find((e) => e.id === projectId);
        if (!project) throw new Error('Projeto nao encontrado.');
        const derived = autoDeriveTraceLinks(project);
        project.traceLinks = mergeTraceLinks(project.traceLinks, derived);
        project.updatedAt = nowIso();
      });
      const store = await readStore();
      const updated = store.projects.find((e) => e.id === projectId);
      return res.json({
        traceLinks: normalizeTraceLinks(updated.traceLinks, updated.requirements, updated.artifacts),
      });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.post('/api/projects/projects/:projectId/relink-phases', authMiddleware, loadProjectForUser, requireProjectEditor, async (req, res) => {
    try {
      const projectId = req.params.projectId;
      let report = null;
      let document = null;
      let review = null;
      await updateStore(async (store) => {
        const project = store.projects.find((e) => e.id === projectId);
        if (!project) throw new Error('Projeto nao encontrado.');

        const previousLinkCount = ensureArray(project.traceLinks).length;
        const derived = autoDeriveTraceLinks(project);
        project.traceLinks = mergeTraceLinks(project.traceLinks, derived);
        const currentLinkCount = ensureArray(project.traceLinks).length;

        report = buildPhaseLinkReport(project, { previousLinkCount, currentLinkCount });

        document = phaseContent.normalizeProjectDocument({
          title: `Log de ligações — ${nowIso().slice(0, 16).replace('T', ' ')}`,
          contentMarkdown: report.markdown,
          docType: 'log',
          deliveryStageId: 'monitoring',
          origin: 'system',
          contentType: 'text/markdown',
          uploadedBy: req.auth.user.id,
          uploadedAt: nowIso(),
        });
        project.documents = ensureArray(project.documents);
        project.documents.unshift(document);

        project.updatedAt = nowIso();
        appendActivity(store, {
          actorUserId: req.auth.user.id,
          projectId,
          action: 'phase_links_reapplied',
          details: { documentId: document.id, ...report.stats },
        });
      });
      const store = await readStore();
      const updated = store.projects.find((e) => e.id === projectId);
      return res.json({
        project: sanitizeProject(updated, req.auth.user),
        report,
        documentId: document?.id,
      });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.patch('/api/projects/projects/:projectId/meeting-minutes/:minuteId', authMiddleware, loadProjectForUser, requireProjectEditor, async (req, res) => {
    try {
      const { projectId, minuteId } = req.params;
      await updateStore(async (store) => {
        const project = store.projects.find((e) => e.id === projectId);
        if (!project) throw new Error('Projeto nao encontrado.');
        const minute = ensureArray(project.meetingMinutes).find((m) => m.id === minuteId);
        if (!minute) throw new Error('Ata nao encontrada.');
        if (req.body?.targetStageId !== undefined) {
          const sid = phaseContent.normalizeDeliveryStageId(req.body.targetStageId, 'requirements');
          minute.targetStageId = sid;
          minute.impactScope = sid;
        }
        if (typeof req.body?.title === 'string') minute.title = req.body.title.trim();
        minute.updatedAt = nowIso();
        project.updatedAt = nowIso();
        appendActivity(store, {
          actorUserId: req.auth.user.id,
          projectId,
          action: 'meeting_minutes_moved',
          details: { minuteId, targetStageId: minute.targetStageId },
        });
      });
      const store = await readStore();
      return res.json({ project: sanitizeProject(store.projects.find((e) => e.id === projectId), req.auth.user) });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.post('/api/projects/projects/:projectId/prompt-runs', authMiddleware, loadProjectForUser, requireProjectEditor, async (req, res) => {
    try {
      const projectId = req.params.projectId;
      const body = req.body || {};
      const agentType = textOr(body.agentType, 'prompt_builder');
      const project = req.loadedProject;
      let fullPrompt = '';
      let contextPack = {};
      let targetOutput = textOr(body.targetOutput);

      if (agentType === 'requirement_grouping') {
        fullPrompt = buildGroupingPrompt(project);
        targetOutput = 'grouping_json';
      } else if (agentType === 'requirement_hierarchy') {
        fullPrompt = buildHierarchyReorganizePrompt(project);
        targetOutput = 'hierarchy_json';
      } else if (agentType === 'reverse_idea') {
        fullPrompt = buildReverseIdeaPrompt(project);
        targetOutput = 'idea_brief';
      } else if (agentType === 'discovery_research') {
        fullPrompt = buildDiscoveryPrompt(project);
        targetOutput = 'discovery_v1';
      } else if (agentType === 'roadmap_plan') {
        fullPrompt = buildRoadmapPrompt(project);
        targetOutput = 'roadmap_v1';
      } else if (agentType === 'roadmap_milestones') {
        const roadmapPhaseId = textOr(body.roadmapPhaseId);
        fullPrompt = buildRoadmapMilestonesPrompt(project, roadmapPhaseId);
        contextPack = { roadmapPhaseId };
        targetOutput = 'roadmap_milestones_v1';
      } else if (agentType === 'implementation_stack') {
        fullPrompt = buildImplementationStackPrompt(project);
        targetOutput = 'implementation_stack_v1';
      } else if (agentType === 'implementation_tasks') {
        fullPrompt = buildImplementationTasksPrompt(project);
        targetOutput = 'implementation_tasks_v1';
      } else if (agentType === 'commercial_proposal') {
        fullPrompt = buildCommercialProposalPrompt(project, { instructions: body.instructions });
        contextPack = { hasInstructions: Boolean(textOr(body.instructions)) };
        targetOutput = 'commercial_proposal_v1';
      } else if (agentType === 'diagram_to_requirements') {
        let diagramArtifact = null;
        if (body.diagramArtifactId) {
          diagramArtifact = ensureArray(project.diagramArtifacts).find((d) => d.id === body.diagramArtifactId) || null;
        }
        fullPrompt = buildDiagramToRequirementsPrompt(project, {
          bodyMarkdown: body.bodyMarkdown,
          diagramArtifact,
          stageId: body.stageId,
        });
        contextPack = { diagramArtifactId: body.diagramArtifactId || null, hasPaste: Boolean(body.bodyMarkdown) };
        targetOutput = 'diagram_to_requirements_v2';
      } else if (agentType === 'requirements_to_architecture') {
        contextPack = buildArchitectureContextPack(project, body.capabilityId, body.moduleTag);
        fullPrompt = buildArchitecturePackPrompt(project, body.capabilityId, body.moduleTag);
        targetOutput = 'architecture_pack_v2';
      } else if (agentType === 'capability_requirements') {
        fullPrompt = buildCapabilityRequirementsPrompt(project, body.capabilityId);
        targetOutput = 'capability_requirements';
      } else if (agentType === 'stage_transition') {
        const fromStageId = textOr(body.fromStageId);
        const toStageId = textOr(body.toStageId);
        const direction = textOr(body.direction, 'forward');
        fullPrompt = buildStageTransitionPrompt(project, fromStageId, toStageId, direction);
        targetOutput = `stage_transition_${direction}`;
      } else if (agentType === 'consistency_checker' || agentType === 'traceability_auditor') {
        const platform = require('./delivery-os-platform');
        const stageId = textOr(body.stageId, 'requirements');
        const check = agentType === 'traceability_auditor'
          ? platform.runTraceabilityAudit(project)
          : platform.runConsistencyCheck(project, stageId);
        fullPrompt = [
          `Tu és um agente ${agentType === 'consistency_checker' ? 'de verificação de consistência' : 'auditor de rastreabilidade'} YourLab.`,
          `Analisa o projecto na fase ${stageId} e valida os findings automáticos abaixo.`,
          `Findings: ${JSON.stringify(check.findings, null, 2)}`,
          'Responde em JSON: { "findings": [...], "passed": boolean, "summaryMarkdown": "..." }',
        ].join('\n\n');
        contextPack = { stageId, automatedCheck: check };
        targetOutput = `${agentType}_v1`;
      } else {
        contextPack = buildContextPack(project, { stageId: body.stageId, capabilityId: body.capabilityId });
        fullPrompt = buildPromptRunFull(
          textOr(body.systemPrompt, 'Tu és um agente de systems engineering YourLab.'),
          textOr(body.stageInstruction, `Stage: ${body.stageId || 'requirements'}`),
          contextPack,
          textOr(body.taskPrompt, body.task || ''),
          textOr(body.outputSchema, 'JSON válido apenas.')
        );
      }

      const run = normalizePromptRun({
        agentType,
        stageId: body.stageId,
        capabilityId: body.capabilityId,
        moduleTag: body.moduleTag,
        targetOutput,
        contextPack,
        fullPrompt,
        createdBy: req.auth.user.id,
        status: 'awaiting_output',
        summaryMarkdown: `Prompt gerado para ${agentType}. Tempo estimado de leitura: ${Math.max(1, Math.ceil(fullPrompt.length / 1200))} min.`,
      });

      await updateStore(async (store) => {
        const p = store.projects.find((e) => e.id === projectId);
        if (!p) throw new Error('Projeto nao encontrado.');
        p.promptRuns = ensureArray(p.promptRuns);
        p.promptRuns.unshift(run);
        p.promptRuns = p.promptRuns.slice(0, 100);
        p.updatedAt = nowIso();
      }, { deferPersist: true });

      return res.json({ promptRun: run, review: null, prompt: fullPrompt });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.post('/api/projects/projects/:projectId/prompt-runs/:runId/apply', authMiddleware, loadProjectForUser, requireProjectEditor, async (req, res) => {
    try {
      const { projectId, runId } = req.params;
      const rawInput = String(req.body?.rawOutput || (req.body?.parsedOutput ? JSON.stringify(req.body.parsedOutput) : ''));
      const parsedFromRaw = parseAgentJsonOutput(rawInput);
      const parsed = req.body?.parsedOutput || parsedFromRaw.parsed;
      const rawOutput = parsedFromRaw.rawOutput || rawInput;
      const deferApply = req.body?.deferApply !== false;

      if (rawOutput && !parsed) {
        return res.status(400).json({
          message: 'JSON inválido. Verifique aspas rectas (" ") e vírgulas. O sistema corrige aspas tipográficas automaticamente, mas a estrutura deve ser JSON válido.',
        });
      }

      await updateStore(async (store) => {
        const project = store.projects.find((e) => e.id === projectId);
        if (!project) throw new Error('Projeto nao encontrado.');
        const run = ensureArray(project.promptRuns).find((r) => r.id === runId);
        if (!run) throw new Error('Prompt run nao encontrado.');

        run.rawOutput = rawOutput;
        run.parsedOutput = parsed;
        run.status = deferApply ? 'pending_review' : 'applied';
        if (!deferApply) {
          run.reviewedAt = nowIso();
          run.reviewedBy = req.auth.user.id;
        }

        upsertHumanReviewFromPromptRun(project, run, parsed, rawOutput);

        if (!deferApply && parsed) {
          applyPromptRunOutput(project, run, parsed, req.auth.user.id, { normalizeRequirementRecord });
        }

        project.updatedAt = nowIso();
      });

      const store = await readStore();
      const updated = store.projects.find((e) => e.id === projectId);
      const reviewRaw = ensureArray(updated?.humanReviews).find(
        (r) => r.promptRunId === runId || r.sourceId === runId
      );
      const review = reviewRaw && isActionableReviewForPanel(normalizeHumanReview(reviewRaw))
        ? normalizeHumanReview(reviewRaw)
        : null;
      return res.json({
        project: sanitizeProject(updated, req.auth.user),
        review,
        deferred: deferApply,
        noChanges: Boolean(parsed && !review),
      });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.post('/api/projects/projects/:projectId/prompt-runs/:runId/alternative', authMiddleware, loadProjectForUser, requireProjectEditor, async (req, res) => {
    try {
      const { projectId, runId } = req.params;
      const alt = normalizeAlternativeResponse({
        promptRunId: runId,
        modelName: req.body?.modelName,
        rawOutput: req.body?.rawOutput,
        createdBy: req.auth.user.id,
      });
      let parsed = null;
      try { parsed = JSON.parse(alt.rawOutput); } catch { /* ignore */ }
      alt.parsedOutput = parsed;

      const store = await readStore();
      const project = store.projects.find((e) => e.id === projectId);
      const original = ensureArray(project?.promptRuns).find((r) => r.id === runId);
      if (original?.parsedOutput && parsed) {
        alt.diffSummary = `Campos originais vs alternativos: ${Object.keys(parsed).length} vs ${Object.keys(original.parsedOutput || {}).length} top-level keys`;
      }

      await updateStore(async (s) => {
        const p = s.projects.find((e) => e.id === projectId);
        p.alternativeResponses = ensureArray(p.alternativeResponses);
        p.alternativeResponses.unshift(alt);
      });

      return res.json({ alternative: alt, original: original ? { rawOutput: original.rawOutput, parsedOutput: original.parsedOutput } : null });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  // Cria um job em lotes para um agente batchavel (ex.: requirement_grouping).
  app.post('/api/projects/projects/:projectId/agent-jobs', authMiddleware, loadProjectForUser, requireProjectEditor, async (req, res) => {
    try {
      const projectId = req.params.projectId;
      const body = req.body || {};
      const agentType = textOr(body.agentType, 'requirement_grouping');
      const spec = BATCHABLE_AGENTS[agentType];
      if (!spec) return res.status(400).json({ message: `O agente ${agentType} nao suporta divisao em lotes.` });
      const project = req.loadedProject;
      const chunkDefs = spec.partition(project, { maxChunkSize: numberOr(body.maxChunkSize, 20) });
      if (!chunkDefs.length) return res.status(400).json({ message: 'Sem requisitos suficientes para dividir em lotes.' });
      const chunks = chunkDefs.map((c, i) => normalizeAgentJobChunk({ ...c, prompt: spec.buildChunkPrompt(project, c) }, i));
      const job = normalizeAgentJob({
        agentType,
        strategy: textOr(body.strategy, 'module'),
        stageId: textOr(body.stageId),
        status: 'collecting',
        chunks,
        createdBy: req.auth.user.id,
      });

      await updateStore(async (store) => {
        const p = store.projects.find((e) => e.id === projectId);
        if (!p) throw new Error('Projeto nao encontrado.');
        p.agentJobs = ensureArray(p.agentJobs);
        p.agentJobs.unshift(job);
        p.agentJobs = p.agentJobs.slice(0, 20);
        p.updatedAt = nowIso();
      });

      return res.json({ agentJob: job });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  // Submete o output parcial de um lote. Quando todos os lotes obrigatorios
  // (nao-deferidos) estao concluidos, constroi o prompt de reconciliacao.
  app.post('/api/projects/projects/:projectId/agent-jobs/:jobId/chunks/:index', authMiddleware, loadProjectForUser, requireProjectEditor, async (req, res) => {
    try {
      const { projectId, jobId } = req.params;
      const index = Number(req.params.index);
      const rawInput = String(req.body?.rawOutput || (req.body?.parsedOutput ? JSON.stringify(req.body.parsedOutput) : ''));
      const parsedFromRaw = parseAgentJsonOutput(rawInput);
      const parsed = req.body?.parsedOutput || parsedFromRaw.parsed;
      const rawOutput = parsedFromRaw.rawOutput || rawInput;
      if (rawOutput && !parsed) {
        return res.status(400).json({ message: 'JSON inválido. Verifique aspas rectas (" ") e vírgulas.' });
      }

      let resultJob = null;
      await updateStore(async (store) => {
        const project = store.projects.find((e) => e.id === projectId);
        if (!project) throw new Error('Projeto nao encontrado.');
        const job = ensureArray(project.agentJobs).find((j) => j.id === jobId);
        if (!job) throw new Error('Job nao encontrado.');
        if (['review_pending', 'applied'].includes(job.status)) throw new Error('Este job ja foi consolidado.');
        const spec = BATCHABLE_AGENTS[job.agentType];
        if (!spec) throw new Error('Agente nao suporta lotes.');
        const chunk = ensureArray(job.chunks).find((c) => Number(c.index) === index);
        if (!chunk) throw new Error('Lote nao encontrado.');

        chunk.rawOutput = rawOutput;
        chunk.parsedOutput = parsed;
        chunk.status = 'done';

        const required = ensureArray(job.chunks).filter((c) => !c.deferred);
        const allRequiredDone = required.length > 0 && required.every((c) => c.status === 'done');
        if (allRequiredDone) {
          const partials = ensureArray(job.chunks)
            .filter((c) => c.status === 'done' && c.parsedOutput)
            .map((c) => c.parsedOutput);
          const merged = spec.mergePartials(partials);
          job.reconcilePrompt = spec.buildReconcilePrompt(project, merged);
          job.status = 'reconciling';
        }
        job.updatedAt = nowIso();
        project.updatedAt = nowIso();
        resultJob = job;
      });

      return res.json({ agentJob: normalizeAgentJob(resultJob) });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  // Recalcula o prompt de consolidacao a partir dos lotes concluidos (util para
  // jobs antigos pegarem a versao mais recente/compacta do prompt).
  app.post('/api/projects/projects/:projectId/agent-jobs/:jobId/refresh-reconcile', authMiddleware, loadProjectForUser, requireProjectEditor, async (req, res) => {
    try {
      const { projectId, jobId } = req.params;
      let resultJob = null;
      await updateStore(async (store) => {
        const project = store.projects.find((e) => e.id === projectId);
        if (!project) throw new Error('Projeto nao encontrado.');
        const job = ensureArray(project.agentJobs).find((j) => j.id === jobId);
        if (!job) throw new Error('Job nao encontrado.');
        if (['review_pending', 'applied'].includes(job.status)) throw new Error('Este job ja foi consolidado.');
        const spec = BATCHABLE_AGENTS[job.agentType];
        if (!spec) throw new Error('Agente nao suporta lotes.');
        const partials = ensureArray(job.chunks)
          .filter((c) => c.status === 'done' && c.parsedOutput)
          .map((c) => c.parsedOutput);
        if (!partials.length) throw new Error('Sem lotes concluídos para consolidar.');
        const merged = spec.mergePartials(partials);
        job.reconcilePrompt = spec.buildReconcilePrompt(project, merged);
        const required = ensureArray(job.chunks).filter((c) => !c.deferred);
        if (required.length > 0 && required.every((c) => c.status === 'done')) job.status = 'reconciling';
        job.updatedAt = nowIso();
        project.updatedAt = nowIso();
        resultJob = job;
      });
      return res.json({ agentJob: normalizeAgentJob(resultJob) });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  // Finaliza o job: cria um promptRun + humanReview com o output consolidado,
  // reutilizando o fluxo de revisao/aplicacao existente. Se nao for colado
  // output, usa a fusao deterministica dos parciais como fallback.
  app.post('/api/projects/projects/:projectId/agent-jobs/:jobId/reconcile', authMiddleware, loadProjectForUser, requireProjectEditor, async (req, res) => {
    try {
      const { projectId, jobId } = req.params;
      const rawInput = String(req.body?.rawOutput || (req.body?.parsedOutput ? JSON.stringify(req.body.parsedOutput) : ''));
      const parsedFromRaw = parseAgentJsonOutput(rawInput);
      let parsed = req.body?.parsedOutput || parsedFromRaw.parsed;
      let rawOutput = parsedFromRaw.rawOutput || rawInput;
      const useMergeFallback = !rawOutput.trim();

      let resultRun = null;
      let resultReview = null;
      let resultJob = null;
      await updateStore(async (store) => {
        const project = store.projects.find((e) => e.id === projectId);
        if (!project) throw new Error('Projeto nao encontrado.');
        const job = ensureArray(project.agentJobs).find((j) => j.id === jobId);
        if (!job) throw new Error('Job nao encontrado.');
        const spec = BATCHABLE_AGENTS[job.agentType];
        if (!spec) throw new Error('Agente nao suporta lotes.');

        const partials = ensureArray(job.chunks)
          .filter((c) => c.status === 'done' && c.parsedOutput)
          .map((c) => c.parsedOutput);
        const merged = spec.mergePartials(partials);

        if (useMergeFallback) {
          // Sem output da IA: usa a fusao deterministica dos lotes.
          parsed = merged;
          rawOutput = JSON.stringify(parsed, null, 2);
        } else if (parsed && Array.isArray(parsed.groups) && spec.finalizeReconcile) {
          // Output normal: grupos de fusao de capabilities -> schema completo.
          parsed = spec.finalizeReconcile(merged, parsed);
        } else if (parsed && (parsed.capabilities || parsed.requirementClusters)) {
          // Compatibilidade: aceita schema de agrupamento completo colado.
          // (mantem-se tal como veio)
        } else {
          throw new Error('Output de consolidação inválido: esperado { "groups": [...] }.');
        }
        if (!parsed) throw new Error('JSON inválido ou sem lotes concluídos para consolidar.');

        const run = normalizePromptRun({
          agentType: job.agentType,
          stageId: job.stageId,
          targetOutput: spec.targetOutput,
          fullPrompt: job.reconcilePrompt,
          rawOutput,
          parsedOutput: parsed,
          status: 'pending_review',
          createdBy: req.auth.user.id,
          summaryMarkdown: `Output final consolidado de ${job.agentType} (job em lotes${useMergeFallback ? ', fusao automatica' : ''}).`,
        });
        const payload = buildHumanReviewPayload(project, run, parsed, rawOutput);
        let review = null;
        if (payload.decisionsCount > 0 || ensureArray(payload.suggestedChanges?.sections).length) {
          review = normalizeHumanReview({
            type: 'agent_output',
            title: `Rever consolidação: ${job.agentType}`,
            summaryMarkdown: payload.summaryMarkdown,
            bodyMarkdown: payload.bodyMarkdown,
            suggestedChanges: payload.suggestedChanges,
            decisionsCount: payload.decisionsCount,
            promptRunId: run.id,
            sourceType: 'prompt_run',
            sourceId: run.id,
            status: 'pending',
          });
          project.humanReviews = ensureArray(project.humanReviews);
          project.humanReviews.unshift(review);
        }

        project.promptRuns = ensureArray(project.promptRuns);
        project.promptRuns.unshift(run);
        project.promptRuns = project.promptRuns.slice(0, 100);

        job.reconcileRaw = rawOutput;
        job.reconcileParsed = parsed;
        job.promptRunId = run.id;
        job.status = 'review_pending';
        job.updatedAt = nowIso();
        project.updatedAt = nowIso();

        resultRun = run;
        resultReview = review;
        resultJob = job;
      });

      const store = await readStore();
      const updated = store.projects.find((e) => e.id === projectId);
      return res.json({
        project: sanitizeProject(updated, req.auth.user),
        agentJob: normalizeAgentJob(resultJob),
        promptRun: resultRun,
        review: resultReview,
      });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.get('/api/projects/projects/:projectId/onion/:nodeType/:nodeId', authMiddleware, loadProjectForUser, async (req, res) => {
    const project = req.loadedProject;
    const { nodeType, nodeId } = req.params;
    const layers = [];
    const links = ensureArray(project.traceLinks);

    const walkUp = (type, id, depth = 0) => {
      if (depth > 12) return;
      layers.unshift({ nodeType: type, nodeId: id, depth });
      links.filter((l) => l.targetType === type && l.targetId === id).forEach((l) => {
        walkUp(l.sourceType, l.sourceId, depth + 1);
      });
    };
    walkUp(nodeType, nodeId);

    return res.json({ layers, onionLayers: ONION_LAYERS });
  });

  app.get('/api/projects/projects/:projectId/impact-reports/:reportId/markdown', authMiddleware, loadProjectForUser, async (req, res) => {
    const report = ensureArray(req.loadedProject.impactReports).find((r) => r.id === req.params.reportId);
    if (!report) return res.status(404).json({ message: 'Report nao encontrado.' });
    const md = exportImpactReportMarkdown(report, req.loadedProject);
    return res.json({ markdown: md, html: renderMarkdownToHtml(md) });
  });

  require('./diagrams').registerDiagramRoutes(app, deps);

  const executionPlans = require('./execution-plans');

  app.post('/api/projects/projects/:projectId/execution-plans', authMiddleware, loadProjectForUser, requireProjectEditor, async (req, res) => {
    try {
      const projectId = req.params.projectId;
      const body = req.body || {};
      const project = req.loadedProject;
      const planOptions = { ...body, createdBy: req.auth.user.id };

      if (body.agentType === 'impact_regeneration') {
        const minuteIds = ensureArray(body.minuteIds);
        const minutes = ensureArray(project.meetingMinutes).filter((m) => minuteIds.includes(m.id));
        if (!minutes.length) throw new Error('Seleccione pelo menos uma ata.');
        planOptions.minutes = minutes;
        planOptions.propagationPlan = buildMinutePropagationPlan(minutes);
        planOptions.stageId = textOr(body.stageId, planOptions.propagationPlan.primaryStageIds?.[0] || 'requirements');
      }

      const plan = executionPlans.buildExecutionPlan(body.agentType, project, planOptions, { deliveryOs: module.exports });

      if (body.preview) {
        return res.json({ plan });
      }

      await updateStore(async (store) => {
        const p = store.projects.find((e) => e.id === projectId);
        if (!p) throw new Error('Projeto nao encontrado.');
        if (body.savePromptPack !== false) {
          const phaseContent = getPhaseContent();
          const promptPackMarkdown = executionPlans.buildPromptPackMarkdown(plan, p);
          const document = phaseContent.normalizeProjectDocument({
            title: `Prompt pack — ${plan.agentType || 'agent'} — ${nowIso().slice(0, 16).replace('T', ' ')}`,
            contentMarkdown: promptPackMarkdown,
            docType: 'log',
            deliveryStageId: plan.toStageId || plan.stageId || 'requirements',
            origin: 'system',
            contentType: 'text/markdown',
            uploadedBy: req.auth.user.id,
            uploadedAt: nowIso(),
          });
          p.documents = ensureArray(p.documents);
          p.documents.unshift(document);
          p.documents = p.documents.slice(0, 80);
          plan.promptPackDocumentId = document.id;
        }
        p.executionPlans = ensureArray(p.executionPlans);
        p.executionPlans.unshift(plan);
        p.executionPlans = p.executionPlans.slice(0, 20);
        p.updatedAt = nowIso();
      });

      return res.json({ plan });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.get('/api/projects/projects/:projectId/execution-plans/:planId/prompt-pack', authMiddleware, loadProjectForUser, requireProjectEditor, async (req, res) => {
    try {
      const plan = ensureArray(req.loadedProject.executionPlans)
        .find((p) => p.id === req.params.planId);
      if (!plan) return res.status(404).json({ message: 'Plano nao encontrado.' });
      const normalized = executionPlans.normalizeExecutionPlan(plan);
      const saved = normalized.promptPackDocumentId
        ? ensureArray(req.loadedProject.documents).find((d) => d.id === normalized.promptPackDocumentId)
        : null;
      const markdown = saved?.contentMarkdown || saved?.extractedText || executionPlans.buildPromptPackMarkdown(normalized, req.loadedProject);
      return res.json({
        planId: normalized.id,
        documentId: saved?.id || normalized.promptPackDocumentId || null,
        markdown,
      });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.get('/api/projects/projects/:projectId/execution-plans/:planId', authMiddleware, loadProjectForUser, async (req, res) => {
    const plan = ensureArray(req.loadedProject.executionPlans)
      .find((p) => p.id === req.params.planId);
    if (!plan) return res.status(404).json({ message: 'Plano nao encontrado.' });
    return res.json({ plan: executionPlans.normalizeExecutionPlan(plan) });
  });

  app.post('/api/projects/projects/:projectId/execution-plans/:planId/tasks/:taskId/prompt-run', authMiddleware, loadProjectForUser, requireProjectEditor, async (req, res) => {
    try {
      const { projectId, planId, taskId } = req.params;
      const project = req.loadedProject;
      const planRaw = ensureArray(project.executionPlans).find((p) => p.id === planId);
      if (!planRaw) throw new Error('Plano nao encontrado.');
      const plan = executionPlans.normalizeExecutionPlan(planRaw);
      let task = plan.tasks.find((t) => t.id === taskId);
      if (!task) throw new Error('Tarefa nao encontrada.');
      const incompleteDeps = ensureArray(task.dependsOn).filter((depId) => {
        const dep = ensureArray(plan.tasks).find((t) => t.id === depId);
        return !dep || !['done', 'verified', 'skipped'].includes(dep.status);
      });
      if (incompleteDeps.length) {
        throw new Error(`Tarefa bloqueada. Conclua primeiro: ${incompleteDeps.join(', ')}`);
      }
      if (task.status === 'needs_recheck' || task.status === 'reverted') {
        throw new Error('Esta tarefa precisa de recheck ou nova execução antes de continuar.');
      }

      let syncedPlan = plan;
      if (executionPlans.isPhasedRequirementsPlan(plan)) {
        syncedPlan = executionPlans.preparePhasedRequirementsPlan(plan, project);
        task = syncedPlan.tasks.find((t) => t.id === taskId) || task;
      }

      const fullPrompt = executionPlans.buildTaskPrompt(syncedPlan, task, project, { deliveryOs: module.exports });
      const run = normalizePromptRun({
        agentType: plan.agentType,
        stageId: plan.stageId,
        capabilityId: plan.config.capabilityId,
        moduleTag: plan.config.moduleTag,
        fullPrompt,
        targetOutput: `${plan.agentType}_${task.id}`,
        status: 'awaiting_output',
        createdBy: req.auth.user.id,
        summaryMarkdown: `Tarefa: ${task.title}`,
      });

      updateStore(async (store) => {
        const p = store.projects.find((e) => e.id === projectId);
        const pl = ensureArray(p.executionPlans).find((x) => x.id === planId);
        if (pl && executionPlans.isPhasedRequirementsPlan(pl)) {
          executionPlans.syncRequirementsFrTasks(pl, p);
        }
        const tk = ensureArray(pl?.tasks).find((x) => x.id === taskId);
        if (tk) {
          tk.promptRunId = run.id;
          tk.status = 'awaiting_paste';
        }
        if (pl) {
          pl.status = 'in_progress';
          pl.updatedAt = nowIso();
        }
        p.promptRuns = ensureArray(p.promptRuns);
        p.promptRuns.unshift(run);
        p.promptRuns = p.promptRuns.slice(0, 100);
        p.updatedAt = nowIso();
      }).catch((err) => {
        console.error('[prompt-run] persist failed:', err.message);
      });

      return res.json({ promptRun: run, prompt: fullPrompt, planId, taskId });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.post('/api/projects/projects/:projectId/execution-plans/:planId/tasks/:taskId/submit', authMiddleware, loadProjectForUser, requireProjectEditor, async (req, res) => {
    try {
      const { projectId, planId, taskId } = req.params;
      const rawInput = String(req.body?.rawOutput || (req.body?.parsedOutput ? JSON.stringify(req.body.parsedOutput) : ''));
      const parsedFromRaw = parseAgentJsonOutput(rawInput);
      let parsed = req.body?.parsedOutput || parsedFromRaw.parsed;
      let rawOutput = parsedFromRaw.rawOutput || rawInput;
      const deferApply = req.body?.deferApply !== false;

      if (rawOutput && !parsed) {
        return res.status(400).json({ message: 'JSON inválido.' });
      }

      let resultReview = null;
      let mergedReview = null;

      await updateStore(async (store) => {
        const project = store.projects.find((e) => e.id === projectId);
        if (!project) throw new Error('Projeto nao encontrado.');
        const pl = ensureArray(project.executionPlans).find((x) => x.id === planId);
        if (!pl) throw new Error('Plano nao encontrado.');
        const tk = ensureArray(pl.tasks).find((x) => x.id === taskId);
        if (!tk) throw new Error('Tarefa nao encontrada.');
        if (tk.revertedAt) throw new Error('Esta tarefa foi revertida. Crie uma nova execução para continuar.');

        const phasedPlan = executionPlans.isPhasedRequirementsPlan(pl);
        let auditRecord = null;
        if (projectAudit && !tk.preTaskSnapshotId) {
          const snap = projectAudit.capturePreChangeSnapshot(
            project,
            `Antes da tarefa ${taskId}`,
            req.auth.user.id,
            pl.toStageId || pl.stageId || tk.phaseId
          );
          auditRecord = projectAudit.recordProjectAudit(project, {
            actorUserId: req.auth.user.id,
            actorName: getUserName ? getUserName(store, req.auth.user.id) : req.auth.user.name,
            action: 'execution_task_submitted',
            summary: `Tarefa submetida: ${tk.title || taskId}`,
            snapshotId: snap.id,
            metadata: {
              planId,
              taskId,
              promptRunId: tk.promptRunId || null,
              agentType: pl.agentType,
            },
          }, appendActivity, store);
          tk.preTaskSnapshotId = snap.id;
          tk.auditId = auditRecord.id;
        }

        if (parsed && phasedPlan) {
          parsed = executionPlans.normalizePhasedTaskOutput(parsed, project, pl, tk);
          rawOutput = JSON.stringify(parsed, null, 2);
        }

        if (phasedPlan && (tk.id === 'stk' || tk.reqKind === 'stakeholder')) {
          tk.parsedOutput = parsed;
          executionPlans.syncRequirementsFrTasks(pl, project);
        }

        tk.parsedOutput = parsed;
        tk.rawOutput = rawOutput;
        tk.status = 'done';
        pl.updatedAt = nowIso();

        const mergeTask = ensureArray(pl.tasks).find((t) => t.role === 'merge');
        const extractedReqs = extractRequirementsFromParsed(parsed);
        if (!phasedPlan && extractedReqs.length >= 3 && mergeTask && taskId !== mergeTask.id) {
          ensureArray(pl.tasks).forEach((t) => {
            if (t.role !== 'merge' && t.id !== taskId && t.status !== 'done' && t.status !== 'skipped') {
              t.status = 'skipped';
            }
          });
        }

        const run = tk.promptRunId
          ? ensureArray(project.promptRuns).find((r) => r.id === tk.promptRunId)
          : null;
        if (run) {
          run.rawOutput = rawOutput;
          run.parsedOutput = parsed;
          run.status = deferApply ? 'pending_review' : 'applied';
        }

        const allDone = ensureArray(pl.tasks)
          .filter((t) => t.role !== 'merge')
          .every((t) => t.status === 'done' || t.status === 'skipped');

        const finalizePlanMerge = (merged) => {
          const mergeRun = normalizePromptRun({
            agentType: pl.agentType,
            stageId: pl.stageId,
            fullPrompt: mergeTask?.instruction || pl.masterPlanMarkdown,
            rawOutput: JSON.stringify(merged, null, 2),
            parsedOutput: merged,
            status: 'pending_review',
            createdBy: req.auth.user.id,
          });
          project.promptRuns = ensureArray(project.promptRuns);
          project.promptRuns.unshift(mergeRun);
          if (mergeTask) {
            mergeTask.parsedOutput = merged;
            mergeTask.rawOutput = mergeRun.rawOutput;
            mergeTask.status = 'done';
          }
          const upsert = upsertHumanReviewFromPromptRun(project, mergeRun, merged, mergeRun.rawOutput);
          mergedReview = upsert.review;
          if (auditRecord && mergedReview?.id) auditRecord.metadata.reviewId = mergedReview.id;
          pl.status = upsert.actionable ? 'pending_review' : 'applied';
        };

        if (allDone && mergeTask && taskId === mergeTask.id && parsed) {
          const partials = ensureArray(pl.tasks)
            .filter((t) => t.role !== 'merge' && t.parsedOutput)
            .map((t) => t.parsedOutput);
          const merged = executionPlans.mergeTaskOutputs(pl, partials) || parsed;
          finalizePlanMerge(merged);
        } else if (allDone && mergeTask && taskId !== mergeTask.id && parsed) {
          const partials = ensureArray(pl.tasks)
            .filter((t) => t.role !== 'merge' && t.parsedOutput)
            .map((t) => t.parsedOutput);
          partials.push(parsed);
          const merged = executionPlans.mergeTaskOutputs(pl, partials) || parsed;
          finalizePlanMerge(merged);
        } else if (allDone && !mergeTask && parsed) {
          const partials = ensureArray(pl.tasks).map((t) => t.parsedOutput).filter(Boolean);
          const merged = executionPlans.mergeTaskOutputs(pl, partials) || parsed;
          const mergeRun = normalizePromptRun({
            agentType: pl.agentType,
            stageId: pl.stageId,
            fullPrompt: pl.masterPlanMarkdown,
            rawOutput: JSON.stringify(merged, null, 2),
            parsedOutput: merged,
            status: 'pending_review',
            createdBy: req.auth.user.id,
          });
          project.promptRuns = ensureArray(project.promptRuns);
          project.promptRuns.unshift(mergeRun);
          const upsert = upsertHumanReviewFromPromptRun(project, mergeRun, merged, mergeRun.rawOutput);
          mergedReview = upsert.review;
          pl.status = upsert.actionable ? 'pending_review' : 'applied';
        } else if (run && parsed && deferApply) {
          const upsert = upsertHumanReviewFromPromptRun(project, run, parsed, rawOutput);
          resultReview = upsert.review;
          if (auditRecord && resultReview?.id) auditRecord.metadata.reviewId = resultReview.id;
        } else if (run && parsed && !deferApply) {
          applyPromptRunOutput(project, run, parsed, req.auth.user.id, { normalizeRequirementRecord });
          run.status = 'applied';
        }

        project.updatedAt = nowIso();
      });

      const store = await readStore();
      const updated = store.projects.find((e) => e.id === projectId);
      return res.json({
        project: sanitizeProject(updated, req.auth.user),
        review: mergedReview || resultReview,
        noChanges: Boolean(parsed && !mergedReview && !resultReview),
      });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.post('/api/projects/projects/:projectId/execution-plans/:planId/tasks/:taskId/revert', authMiddleware, loadProjectForUser, requireProjectEditor, async (req, res) => {
    try {
      const { projectId, planId, taskId } = req.params;
      let revertedAudit = null;

      await updateStore(async (store) => {
        const project = store.projects.find((e) => e.id === projectId);
        if (!project) throw new Error('Projeto nao encontrado.');
        const plan = ensureArray(project.executionPlans).find((p) => p.id === planId);
        if (!plan) throw new Error('Plano nao encontrado.');
        const task = ensureArray(plan.tasks).find((t) => t.id === taskId);
        if (!task) throw new Error('Tarefa nao encontrada.');
        if (task.revertedAt) throw new Error('Esta tarefa ja foi revertida.');

        const auditId = task.auditId || ensureArray(project.auditLog).find(
          (entry) => entry?.metadata?.planId === planId && entry?.metadata?.taskId === taskId && entry.snapshotId
        )?.id;
        if (!auditId) throw new Error('Sem snapshot/auditoria para reverter esta tarefa.');

        const result = projectAudit.revertAuditEntry(
          project,
          auditId,
          req.auth.user.id,
          getUserName ? getUserName(store, req.auth.user.id) : req.auth.user.name
        );
        revertedAudit = result.entry;

        const restoredPlan = ensureArray(project.executionPlans).find((p) => p.id === planId);
        const restoredTasks = ensureArray(restoredPlan?.tasks);
        const restoredTask = restoredTasks.find((t) => t.id === taskId);
        if (restoredTask) {
          restoredTask.status = 'reverted';
          restoredTask.revertedAt = nowIso();
          restoredTask.revertedBy = req.auth.user.id;
          restoredTask.auditId = auditId;
        }

        const queue = [taskId];
        const seen = new Set(queue);
        while (queue.length) {
          const currentId = queue.shift();
          restoredTasks.forEach((candidate) => {
            if (seen.has(candidate.id)) return;
            const deps = ensureArray(candidate.dependsOn);
            const ctx = ensureArray(candidate.contextFromTaskIds);
            if (deps.includes(currentId) || ctx.includes(currentId)) {
              if (!['reverted', 'planned'].includes(candidate.status)) {
                candidate.status = 'needs_recheck';
              }
              seen.add(candidate.id);
              queue.push(candidate.id);
            }
          });
        }

        if (restoredPlan) {
          restoredPlan.status = 'in_progress';
          restoredPlan.updatedAt = nowIso();
        }
        project.updatedAt = nowIso();
        appendActivity(store, {
          projectId,
          actorUserId: req.auth.user.id,
          action: 'execution_task_reverted',
          auditId,
          details: { planId, taskId },
        });
      });

      const store = await readStore();
      const updated = store.projects.find((e) => e.id === projectId);
      return res.json({
        ok: true,
        reverted: revertedAudit,
        project: sanitizeProject(updated, req.auth.user),
      });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });
}

module.exports = {
  MODULE_TAGS,
  TRACE_NODE_TYPES,
  INFORMATION_TYPES,
  AGENT_TYPES,
  ONION_LAYERS,
  PLATFORM_CONCEPTS,
  STAGE_CONCEPT_KEYS,
  STAGE_FOCUS,
  STAGE_NEXT_HINT,
  STAGE_ORDER,
  STAGE_TRANSITION_AGENTS,
  STAGE_TAB_LINKS,
  TAB_STAGE_AFFINITY,
  MEETING_IMPACT_SCOPES,
  MEETING_IMPACT_PROPAGATION,
  buildMinutePropagationPlan,
  buildMinutePropagationPrompt,
  buildMeetingClassificationPrompt,
  applyMeetingClassificationParsed,
  meetingImpactedStageIds,
  normalizeProjectV3Fields,
  normalizeVision,
  normalizeDiscovery,
  normalizeRoadmap,
  normalizeImplementation,
  normalizeProposal,
  enrichRequirementWithModuleTags,
  autoDeriveTraceLinks,
  mergeTraceLinks,
  buildContextPack,
  buildGroupingPrompt,
  buildHierarchyReorganizePrompt,
  buildReverseIdeaPrompt,
  buildDiagramToRequirementsPrompt,
  buildArchitecturePackPrompt,
  buildArchitectureContextPack,
  buildArchitectureTaskPlan,
  buildArchitectureTaskPlanForRuntime,
  buildArchitectureDiagramTaskPrompt,
  mergeArchitecturePartials,
  applyArchitectureTaskPlanBudget,
  buildCapabilityRequirementsPrompt,
  buildStageTransitionPrompt,
  applyGroupingResult,
  buildHumanReviewPayload,
  applyPromptRunOutput,
  applyArchitecturePack,
  parseAgentJsonOutput,
  normalizeJsonInput,
  syncHumanReviewFromPromptRun,
  upsertHumanReviewFromPromptRun,
  isActionableReviewForPanel,
  migrateHumanReviewsOnLoad,
  normalizeCapability,
  normalizeCluster,
  normalizePromptRun,
  normalizeAgentJob,
  partitionRequirementsByModule,
  mergeGroupingPartials,
  applyReconcileGroups,
  BATCHABLE_AGENTS,
  normalizeHumanReview,
  normalizeVersionSnapshot,
  createProjectSnapshot,
  registerDeliveryOsRoutes,
  renderMarkdownToHtml,
  buildDiscoveryPrompt,
  buildImplementationStackPrompt,
  buildImplementationTasksPrompt,
  buildPromptRunFull,
  extractRequirementsFromParsed,
  applyModuleMappings,
};
