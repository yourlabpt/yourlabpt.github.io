/**
 * Unified prompt execution plans — task breakdown for manual + runtime paths.
 */
const crypto = require('crypto');

const MODEL_PROFILES = {
  small: {
    id: 'small',
    label: 'Small',
    targetInputTokens: 6000,
    targetOutputTokens: 1200,
    maxTasks: 10,
    responseGuidance: 'Resposta curta e estritamente no schema.',
  },
  medium: {
    id: 'medium',
    label: 'Medium',
    targetInputTokens: 14000,
    targetOutputTokens: 2500,
    maxTasks: 14,
    responseGuidance: 'Resposta completa, mas compacta e sem texto fora do JSON.',
  },
  large: {
    id: 'large',
    label: 'Large',
    targetInputTokens: 32000,
    targetOutputTokens: 5000,
    maxTasks: 20,
    responseGuidance: 'Pode resolver tarefas mais ambíguas, mantendo decisões e IDs explícitos.',
  },
  high: {
    id: 'high',
    label: 'High',
    targetInputTokens: 48000,
    targetOutputTokens: 7000,
    maxTasks: 20,
    responseGuidance: 'Modelo competente para investigação, arquitectura e implementação delimitada.',
  },
  max: {
    id: 'max',
    label: 'Max',
    targetInputTokens: 120000,
    targetOutputTokens: 12000,
    maxTasks: 12,
    responseGuidance: 'Revisão crítica independente, com evidência e sem alterações ao artefacto.',
  },
  long_context: {
    id: 'long_context',
    label: 'Long context',
    targetInputTokens: 90000,
    targetOutputTokens: 8000,
    maxTasks: 32,
    responseGuidance: 'Apto para contexto longo; ainda assim devolver JSON bounded e verificável.',
  },
};

const ROLE_MODEL_PROFILES = {
  classifier: 'small',
  goalSetter: 'medium',
  planner: 'medium',
  requirements: 'medium',
  researcher: 'high',
  coder: 'high',
  reviewer: 'max',
};

const STAGE_TRANSITION_TASKS = {
  'idea->discovery': {
    forward: [
      { id: 'framing', title: 'Enquadramento, hipóteses e perguntas de investigação', role: 'analysis' },
      { id: 'stakeholders', title: 'Stakeholders, segmentos e personas', role: 'artifact' },
      { id: 'market', title: 'Dimensão de mercado, procura e tendências', role: 'artifact' },
      { id: 'competitors', title: 'Concorrentes, alternativas e diferenciação', role: 'artifact' },
      { id: 'business', title: 'Modelo de negócio, go-to-market e implicações', role: 'artifact' },
      { id: 'merge', title: 'Consolidar descoberta', role: 'merge' },
    ],
    backward: [
      { id: 'idea_brief', title: 'Resumir ideia a partir da descoberta', role: 'artifact' },
    ],
  },
  'discovery->requirements': {
    forward: 'dynamic', // built by buildRequirementsTransitionTasks(project)
    backward: [
      { id: 'discovery_sync', title: 'Actualizar descoberta a partir dos requisitos', role: 'artifact' },
    ],
  },
  'requirements->architecture': {
    forward: [
      { id: 'context', title: 'Diagrama de contexto (C4)', role: 'diagram' },
      { id: 'modules', title: 'Componentes por módulo', role: 'diagram' },
      { id: 'data_api', title: 'Entidades de dados e APIs', role: 'artifact' },
      { id: 'merge', title: 'Consolidar pacote de arquitectura', role: 'merge' },
    ],
    backward: [
      { id: 'req_from_arch', title: 'Derivar requisitos da arquitectura', role: 'requirements' },
    ],
  },
  'architecture->roadmap': {
    forward: [
      { id: 'phases', title: 'Fases e marcos', role: 'artifact' },
      { id: 'dependencies', title: 'Dependências entre fases', role: 'artifact' },
      { id: 'merge', title: 'Consolidar roadmap', role: 'merge' },
    ],
    backward: [
      { id: 'arch_from_roadmap', title: 'Actualizar arquitectura com base no roadmap', role: 'artifact' },
    ],
  },
  'roadmap->implementation': {
    forward: [
      { id: 'stack', title: 'Stack técnica', role: 'artifact' },
      { id: 'tasks_by_module', title: 'Tarefas por módulo', role: 'artifact' },
      { id: 'merge', title: 'Consolidar plano de implementação', role: 'merge' },
    ],
    backward: [
      { id: 'roadmap_progress', title: 'Actualizar roadmap com progresso', role: 'artifact' },
    ],
  },
  'implementation->validation': {
    forward: [
      { id: 'test_cases', title: 'Casos de teste (TC)', role: 'requirements' },
      { id: 'acceptance', title: 'Critérios de aceitação', role: 'artifact' },
      { id: 'merge', title: 'Consolidar validação', role: 'merge' },
    ],
    backward: [
      { id: 'impl_gaps', title: 'Identificar gaps de implementação', role: 'artifact' },
    ],
  },
  'validation->delivery': {
    forward: [
      { id: 'deliverables', title: 'Entregáveis e documentação', role: 'artifact' },
      { id: 'merge', title: 'Consolidar pacote de entrega', role: 'merge' },
    ],
    backward: [
      { id: 'revalidate', title: 'Regenerar validação', role: 'artifact' },
    ],
  },
  'delivery->operations': {
    forward: [
      { id: 'monitoring', title: 'Monitorização e operação', role: 'artifact' },
      { id: 'merge', title: 'Consolidar operação', role: 'merge' },
    ],
    backward: [
      { id: 'delivery_sync', title: 'Actualizar entrega', role: 'artifact' },
    ],
  },
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

function estimateTokens(value) {
  return Math.max(1, Math.ceil(String(value || '').length / 4));
}

function normalizeModelProfileId(value) {
  const id = textOr(value, 'medium');
  return MODEL_PROFILES[id] ? id : 'medium';
}

function resolveModelProfile(options = {}, rawConfig = {}) {
  const profileId = normalizeModelProfileId(options.modelProfileId || rawConfig.modelProfileId);
  const base = MODEL_PROFILES[profileId] || MODEL_PROFILES.medium;
  return {
    ...base,
    targetInputTokens: Number(options.targetInputTokens || rawConfig.targetInputTokens || base.targetInputTokens),
    targetOutputTokens: Number(options.targetOutputTokens || rawConfig.targetOutputTokens || base.targetOutputTokens),
    maxTasks: Number(options.maxTasks || rawConfig.maxTasks || base.maxTasks),
  };
}

function normalizeExecutionTask(raw, order = 0) {
  const statuses = ['planned', 'running', 'awaiting_paste', 'done', 'verified', 'failed', 'skipped', 'deferred', 'needs_recheck', 'reverted'];
  const status = textOr(raw?.status, 'planned');
  return {
    id: textOr(raw?.id, `task_${order + 1}`),
    order: Number(raw?.order ?? order),
    title: textOr(raw?.title, `Tarefa ${order + 1}`),
    instruction: textOr(raw?.instruction),
    outputSchema: textOr(raw?.outputSchema),
    role: textOr(raw?.role, 'artifact'),
    dependsOn: ensureArray(raw?.dependsOn).map(String),
    contextFromTaskIds: ensureArray(raw?.contextFromTaskIds).map(String),
    status: statuses.includes(status) ? status : 'planned',
    promptRunId: textOr(raw?.promptRunId),
    estimatedTokens: Number(raw?.estimatedTokens) || 0,
    estimatedInputTokens: Number(raw?.estimatedInputTokens || raw?.estimatedTokens) || 0,
    targetOutputTokens: Number(raw?.targetOutputTokens) || 0,
    parsedOutput: raw?.parsedOutput ?? null,
    rawOutput: textOr(raw?.rawOutput),
    verificationPrompt: textOr(raw?.verificationPrompt),
    mergePrompt: textOr(raw?.mergePrompt),
    regressionGuardPrompt: textOr(raw?.regressionGuardPrompt),
    reversePrompt: textOr(raw?.reversePrompt),
    preTaskSnapshotId: textOr(raw?.preTaskSnapshotId),
    preApprovalSnapshotId: textOr(raw?.preApprovalSnapshotId),
    auditId: textOr(raw?.auditId),
    revertedAt: textOr(raw?.revertedAt),
    revertedBy: textOr(raw?.revertedBy),
    diagramType: textOr(raw?.diagramType),
    requirementIds: ensureArray(raw?.requirementIds).map(String),
    reqKind: textOr(raw?.reqKind),
    phaseId: textOr(raw?.phaseId),
    phaseName: textOr(raw?.phaseName),
  };
}

function normalizeExecutionPlan(raw) {
  const statuses = ['planned', 'in_progress', 'awaiting_paste', 'pending_review', 'applied', 'cancelled'];
  const status = textOr(raw?.status, 'planned');
  const config = raw?.config && typeof raw.config === 'object' ? raw.config : {};
  const profile = resolveModelProfile(raw || {}, config);
  return {
    id: textOr(raw?.id, `plan_${crypto.randomUUID().slice(0, 8)}`),
    agentType: textOr(raw?.agentType),
    stageId: textOr(raw?.stageId),
    mode: ['manual', 'runtime', 'batched'].includes(textOr(raw?.mode)) ? textOr(raw?.mode) : 'manual',
    fromStageId: textOr(raw?.fromStageId),
    toStageId: textOr(raw?.toStageId),
    direction: textOr(raw?.direction),
    propagationDirection: ['forward', 'backward', 'bidirectional'].includes(textOr(raw?.propagationDirection || config.propagationDirection))
      ? textOr(raw?.propagationDirection || config.propagationDirection)
      : (textOr(raw?.direction) === 'backward' ? 'backward' : 'forward'),
    splitStrategy: ['deterministic', 'planner_prompt'].includes(textOr(raw?.splitStrategy || config.splitStrategy))
      ? textOr(raw?.splitStrategy || config.splitStrategy)
      : 'deterministic',
    modelProfileId: profile.id,
    targetInputTokens: profile.targetInputTokens,
    targetOutputTokens: profile.targetOutputTokens,
    promptPackDocumentId: textOr(raw?.promptPackDocumentId),
    config: {
      systemPrompt: textOr(config.systemPrompt),
      outputSchema: textOr(config.outputSchema),
      maxTokens: Number(config.maxTokens) || 120000,
      maxSubtasks: Number(config.maxSubtasks) || 8,
      modelProfileId: profile.id,
      targetInputTokens: profile.targetInputTokens,
      targetOutputTokens: profile.targetOutputTokens,
      splitStrategy: textOr(raw?.splitStrategy || config.splitStrategy, 'deterministic'),
      propagationDirection: textOr(raw?.propagationDirection || config.propagationDirection, textOr(raw?.direction) === 'backward' ? 'backward' : 'forward'),
      enableWebSearch: config.enableWebSearch !== false,
      capabilityId: textOr(config.capabilityId),
      moduleTag: textOr(config.moduleTag),
    },
    tasks: ensureArray(raw?.tasks).map((t, i) => normalizeExecutionTask(t, i)),
    masterPlanMarkdown: textOr(raw?.masterPlanMarkdown),
    status: statuses.includes(status) ? status : 'planned',
    agentJobId: textOr(raw?.agentJobId),
    createdAt: textOr(raw?.createdAt, nowIso()),
    createdBy: textOr(raw?.createdBy),
    updatedAt: textOr(raw?.updatedAt, nowIso()),
  };
}

function compactTaskOutputContext(plan, task, maxTokens = 900) {
  const wanted = new Set(ensureArray(task?.contextFromTaskIds).length ? task.contextFromTaskIds : task?.dependsOn);
  if (!wanted.size) return '';
  const chunks = ensureArray(plan?.tasks)
    .filter((t) => wanted.has(t.id) && (t.status === 'done' || t.status === 'verified') && (t.parsedOutput || t.rawOutput))
    .map((t) => {
      const parsed = t.parsedOutput
        ? JSON.stringify(t.parsedOutput, null, 2)
        : String(t.rawOutput || '');
      return `## ${t.title}\n${parsed.slice(0, Math.max(600, maxTokens * 4))}`;
    });
  return chunks.join('\n\n').slice(0, maxTokens * 4);
}

function buildVerificationPrompt(task, profile) {
  return [
    `# Verificação da tarefa: ${task.title}`,
    'Verifica se a resposta da IA cumpre o schema, respeita os IDs existentes e não introduz regressões.',
    'Devolve APENAS JSON:',
    '{"status":"pass|fail","issues":[],"requiredFixes":[],"safeToMerge":false}',
    `Limite esperado de resposta: ${profile.targetOutputTokens} tokens.`,
  ].join('\n\n');
}

function buildRegressionGuardPrompt(task, plan) {
  const destructive = plan.propagationDirection === 'backward'
    ? 'Qualquer remoção/descontinuação exige classificação explícita e revisão humana.'
    : 'Preserva trabalho aprovado excepto quando houver contradição explícita.';
  return [
    `# Regression guard: ${task.title}`,
    destructive,
    'Classifica cada alteração como append, modify, deprecate ou no_change.',
    'Mantém IDs estáveis quando possível e adiciona traceLinks para novas mudanças.',
    'Devolve APENAS JSON: {"changes":[{"id":"","classification":"append|modify|deprecate|no_change","reason":"","requiresHumanApproval":true}],"regressionRisk":"low|medium|high"}',
  ].join('\n\n');
}

function buildMergePrompt(task, plan) {
  return [
    `# Merge: ${task.title}`,
    `Plano: ${plan.agentType} ${plan.fromStageId || ''}->${plan.toStageId || ''}`.trim(),
    'Consolida apenas outputs verificados das tarefas dependentes.',
    'Preserva IDs existentes, junta traceLinks e assinala conflitos.',
    'Devolve APENAS JSON válido no schema final do agente.',
  ].join('\n\n');
}

function buildReversePrompt(task, plan) {
  return [
    `# Reverse propagation: ${task.title}`,
    `Direcção: ${plan.propagationDirection}`,
    'Propaga alterações de fases posteriores para artefactos anteriores sem apagar trabalho aprovado.',
    'Adapta ou acrescenta alterações; usa deprecate só quando for inevitável e exigir revisão humana.',
    'Devolve JSON com classifications append|modify|deprecate|no_change.',
  ].join('\n\n');
}

function enrichTasksForProfile(tasks, plan, profile) {
  const targetOutputTokens = profile.targetOutputTokens;
  return ensureArray(tasks).map((task, index) => {
    const instruction = textOr(task.instruction);
    const estimatedInputTokens = estimateTokens(instruction);
    return {
      ...task,
      order: Number(task.order ?? index),
      contextFromTaskIds: ensureArray(task.contextFromTaskIds).length
        ? task.contextFromTaskIds
        : ensureArray(task.dependsOn),
      estimatedTokens: Number(task.estimatedTokens) || estimatedInputTokens,
      estimatedInputTokens,
      targetOutputTokens: Number(task.targetOutputTokens) || targetOutputTokens,
      verificationPrompt: task.verificationPrompt || buildVerificationPrompt(task, profile),
      mergePrompt: task.mergePrompt || (task.role === 'merge' ? buildMergePrompt(task, plan) : ''),
      regressionGuardPrompt: task.regressionGuardPrompt || buildRegressionGuardPrompt(task, plan),
      reversePrompt: task.reversePrompt || (plan.propagationDirection !== 'forward' ? buildReversePrompt(task, plan) : ''),
    };
  });
}

function exceedsProfileBounds(tasks, profile) {
  if (ensureArray(tasks).length > profile.maxTasks) return true;
  return ensureArray(tasks).some((task) => Number(task.estimatedInputTokens || estimateTokens(task.instruction)) > profile.targetInputTokens);
}

function defaultTaskSplit(fullPrompt, agentType, titlePrefix = 'Parte') {
  const len = String(fullPrompt || '').length;
  if (len < 8000) return [];
  const parts = Math.min(4, Math.max(2, Math.ceil(len / 6000)));
  const tasks = [];
  for (let i = 0; i < parts; i += 1) {
    tasks.push({
      id: `part_${i + 1}`,
      order: i,
      title: `${titlePrefix} ${i + 1}/${parts}`,
      role: i === parts - 1 ? 'merge' : 'artifact',
      instruction: `Execute a parte ${i + 1} de ${parts} do prompt ${agentType}. Devolva JSON parcial válido.`,
      dependsOn: i > 0 ? [`part_${i}`] : [],
    });
  }
  return tasks;
}

function slugifyPhaseId(value, fallback = 'phase') {
  const slug = String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 32);
  return slug || fallback;
}

function normalizePhaseKey(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractPhaseNumber(name) {
  const m = String(name || '').match(/fase\s*(\d+)/i);
  return m ? parseInt(m[1], 10) : 0;
}

function requirementMatchesPhase(req, phaseName) {
  const key = normalizePhaseKey(phaseName);
  const phase = normalizePhaseKey(req?.implementationPhase || req?.implementation_phase || req?.phase);
  if (!key) return true;
  if (!phase) return false;
  if (phase === key || phase.includes(key) || key.includes(phase)) return true;
  const nTask = extractPhaseNumber(phaseName);
  const nReq = extractPhaseNumber(req?.implementationPhase || req?.implementation_phase || req?.phase);
  return nTask > 0 && nTask === nReq;
}

function stakeholderRequirementsFromPlan(project, plan) {
  const byId = new Map();
  const add = (reqs) => {
    for (const r of ensureArray(reqs)) {
      if (String(r.type || '').toLowerCase() !== 'stakeholder' || !r.id) continue;
      byId.set(String(r.id), r);
    }
  };

  const stkTask = ensureArray(plan?.tasks).find((t) => t.id === 'stk');
  if (stkTask?.parsedOutput) {
    add(requirementsFromParsed(stkTask.parsedOutput));
  }
  for (const t of ensureArray(plan?.tasks)) {
    if (t.id === 'stk' || !t.parsedOutput || !['done', 'skipped'].includes(t.status)) continue;
    add(requirementsFromParsed(t.parsedOutput));
  }
  add(ensureArray(project?.requirements));
  return [...byId.values()];
}

/**
 * Ordered phases from STK implementationPhase — source of truth after STK exists.
 */
function extractStakeholderPhasesFromPlan(project, plan = null) {
  const seen = new Map();
  const order = [];
  for (const r of stakeholderRequirementsFromPlan(project, plan)) {
    const phaseName = textOr(r.implementationPhase, r.implementation_phase, r.phase);
    if (!phaseName) continue;
    const key = normalizePhaseKey(phaseName);
    if (!key || seen.has(key)) continue;
    seen.set(key, {
      id: slugifyPhaseId(phaseName),
      name: phaseName,
      order: order.length,
      summary: '',
    });
    order.push(key);
  }
  return order.map((key) => seen.get(key)).sort((a, b) => {
    const na = extractPhaseNumber(a.name);
    const nb = extractPhaseNumber(b.name);
    if (na && nb && na !== nb) return na - nb;
    return a.order - b.order;
  });
}

/**
 * Application phases — STK output first, then roadmap/proposal, then defaults.
 */
function extractApplicationPhases(project, plan = null) {
  const stkPhases = extractStakeholderPhasesFromPlan(project, plan);
  if (stkPhases.length) return stkPhases;

  const byKey = new Map();
  let orderCursor = 0;

  const addPhase = (name, id, order, summary = '') => {
    const label = textOr(name);
    if (!label) return;
    const key = normalizePhaseKey(label);
    if (!key) return;
    if (byKey.has(key)) {
      const row = byKey.get(key);
      if (Number.isFinite(order) && order < row.order) row.order = order;
      if (summary && !row.summary) row.summary = summary;
      return;
    }
    byKey.set(key, {
      id: textOr(id, slugifyPhaseId(label)),
      name: label,
      order: Number.isFinite(order) ? order : orderCursor++,
      summary: textOr(summary).slice(0, 600),
    });
  };

  ensureArray(project?.roadmap?.phases).forEach((p, i) => {
    addPhase(
      textOr(p.name, p.title, `Fase ${i + 1}`),
      p.id,
      Number(p.order ?? i),
      textOr(p.summaryMarkdown, p.descriptionMarkdown, p.description)
    );
  });

  ensureArray(project?.proposal?.phases).forEach((p, i) => {
    addPhase(textOr(p.name, `Fase ${i + 1}`), p.id, 40 + i, textOr(p.justificationMarkdown));
  });

  const list = [...byKey.values()].sort((a, b) => a.order - b.order);
  if (list.length) return list;

  return [
    { id: 'phase_mvp', name: 'Fase 1 - MVP', order: 0, summary: 'Funcionalidades essenciais para validar o modelo de negócio.' },
    { id: 'phase_expansion', name: 'Fase 2 - Expansão', order: 1, summary: 'Funcionalidades subsequentes após validação do MVP.' },
    { id: 'phase_integrations', name: 'Fase 3 - Integrações e escala', order: 2, summary: 'Integrações externas, dashboards avançados e optimizações.' },
  ];
}

function isPhasedRequirementsPlan(plan) {
  return plan?.agentType === 'stage_transition'
    && plan.fromStageId === 'discovery'
    && plan.toStageId === 'requirements'
    && textOr(plan.direction, 'forward') === 'forward';
}

function requirementPrefixForKind(reqKind) {
  const map = { stakeholder: 'STK', functional: 'FR', non_functional: 'RNF', test_case: 'TC' };
  return map[reqKind] || 'REQ';
}

function maxSerialForPrefix(idSet, prefix) {
  let max = 0;
  for (const id of idSet) {
    const m = String(id).match(new RegExp(`^${prefix}-(\\d+)$`, 'i'));
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return max;
}

function gatherReservedIds(project, plan, currentTask, prefix) {
  const reserved = new Set();
  for (const r of ensureArray(project?.requirements)) {
    if (r.id && String(r.id).toUpperCase().startsWith(`${prefix.toUpperCase()}-`)) reserved.add(r.id);
  }
  for (const t of ensureArray(plan?.tasks)) {
    if (t.id === currentTask?.id || !t.parsedOutput) continue;
    if (!['done', 'skipped'].includes(t.status)) continue;
    for (const r of requirementsFromParsed(t.parsedOutput)) {
      if (r.id && String(r.id).toUpperCase().startsWith(`${prefix.toUpperCase()}-`)) reserved.add(r.id);
    }
  }
  return reserved;
}

function gatherPriorFunctionalFromPlan(plan, beforeTaskId, project = null) {
  const out = [];
  const seen = new Set();
  const add = (reqs) => {
    for (const r of ensureArray(reqs)) {
      if (String(r.type || '').toLowerCase() !== 'functional' || !r.id) continue;
      const id = String(r.id);
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(r);
    }
  };

  for (const t of ensureArray(plan?.tasks)) {
    if (t.id === beforeTaskId) break;
    if (t.reqKind !== 'functional') continue;
    if (t.parsedOutput && ['done', 'skipped'].includes(t.status)) {
      add(requirementsFromParsed(t.parsedOutput));
    }
  }

  const currentTask = ensureArray(plan?.tasks).find((t) => t.id === beforeTaskId);
  const currentPhaseNum = extractPhaseNumber(currentTask?.phaseName);
  if (project) {
    add(
      ensureArray(project.requirements).filter((r) => {
        if (String(r.type || '').toLowerCase() !== 'functional') return false;
        if (!currentPhaseNum) return true;
        const reqPhaseNum = extractPhaseNumber(r.implementationPhase || r.phase);
        return !reqPhaseNum || reqPhaseNum < currentPhaseNum;
      })
    );
  }

  return out;
}

function resolveStakeholderId(stkIds, parent) {
  const token = textOr(parent);
  if (!token) return '';
  if (stkIds.has(token)) return token;
  try {
    const reqHierarchy = require('./requirement-hierarchy');
    const norm = reqHierarchy.normalizeRequirementIdToken(token);
    for (const id of stkIds) {
      if (reqHierarchy.normalizeRequirementIdToken(id) === norm) return id;
    }
  } catch { /* ignore */ }
  return token;
}

function hasStakeholderId(stkIds, parent) {
  const resolved = resolveStakeholderId(stkIds, parent);
  return Boolean(resolved && stkIds.has(resolved));
}

function validStakeholderIds(project, plan) {
  const ids = new Set();
  for (const r of gatherPlanRequirements(plan, project, { type: 'stakeholder' })) {
    if (r.id) ids.add(String(r.id));
  }
  const stkTask = ensureArray(plan?.tasks).find((t) => t.id === 'stk');
  if (stkTask?.parsedOutput) {
    for (const r of requirementsFromParsed(stkTask.parsedOutput)) {
      if (r.id) ids.add(String(r.id));
    }
  }
  for (const r of ensureArray(project?.requirements)) {
    if (String(r.type || '').toLowerCase() === 'stakeholder' && r.id) ids.add(String(r.id));
  }
  return ids;
}

/**
 * Reassign duplicate FR/RNF/TC ids so phased tasks complement rather than overwrite.
 */
function normalizePhasedTaskOutput(parsed, project, plan, task) {
  if (!parsed || !isPhasedRequirementsPlan(plan)) return parsed;
  const reqKind = task.reqKind || (task.id === 'stk' ? 'stakeholder' : '');
  if (!['functional', 'non_functional', 'test_case'].includes(reqKind)) return parsed;

  const copy = JSON.parse(JSON.stringify(parsed));
  const prefix = requirementPrefixForKind(reqKind);
  const reserved = gatherReservedIds(project, plan, task, prefix);
  let nextNum = maxSerialForPrefix(reserved, prefix) + 1;
  const idRemap = new Map();
  const stkIds = validStakeholderIds(project, plan);

  const reqs = ensureArray(copy.requirements);
  for (const r of reqs) {
    r.type = reqKind === 'functional' ? 'functional' : reqKind;
    const id = textOr(r.id);
    const collision = !id || reserved.has(id);
    if (collision) {
      const newId = `${prefix}-${String(nextNum++).padStart(2, '0')}`;
      if (id) idRemap.set(id, newId);
      r.id = newId;
    } else {
      reserved.add(id);
    }

    if (reqKind === 'functional') {
      const parent = textOr(r.parentId, r.stakeholderRequirementLink);
      if (parent && stkIds.size && !hasStakeholderId(stkIds, parent)) {
        r.parentId = '';
        r.stakeholderRequirementLink = '';
      } else if (parent) {
        const resolved = resolveStakeholderId(stkIds, parent);
        r.parentId = resolved;
        r.stakeholderRequirementLink = resolved;
      }
    }
    if (reqKind === 'test_case') {
      const frLink = textOr(r.linkedFunctionalRequirement, r.parentId);
      if (frLink && idRemap.has(frLink)) {
        r.linkedFunctionalRequirement = idRemap.get(frLink);
        r.parentId = idRemap.get(frLink);
      }
    }
  }

  for (const link of ensureArray(copy.traceLinks)) {
    if (link.fromRequirementId && idRemap.has(link.fromRequirementId)) {
      link.fromRequirementId = idRemap.get(link.fromRequirementId);
    }
  }

  return copy;
}

/**
 * After STK submit: expand/sync FR tasks for every phase found in STK + roadmap.
 */
function syncRequirementsFrTasks(pl, project) {
  if (!isPhasedRequirementsPlan(pl)) return false;

  const phases = extractApplicationPhases(project, pl);
  const stkTask = ensureArray(pl.tasks).find((t) => t.id === 'stk');
  const oldFr = ensureArray(pl.tasks).filter((t) => t.reqKind === 'functional');
  const frByPhaseKey = new Map();
  oldFr.forEach((t) => {
    if (t.phaseName) frByPhaseKey.set(normalizePhaseKey(t.phaseName), t);
  });

  const frTasks = [];
  phases.forEach((phase, i) => {
    const pid = slugifyPhaseId(phase.id || phase.name, `phase_${i + 1}`);
    const id = `fr_${pid}`;
    const prevDep = i === 0
      ? 'stk'
      : `fr_${slugifyPhaseId(phases[i - 1].id || phases[i - 1].name, `phase_${i}`)}`;
    const key = normalizePhaseKey(phase.name);
    const phaseNum = extractPhaseNumber(phase.name);
    const existing = frByPhaseKey.get(key)
      || oldFr.find((t) => t.id === id)
      || (phaseNum
        ? oldFr.find((t) => extractPhaseNumber(t.phaseName) === phaseNum && t.reqKind === 'functional')
        : null)
      || oldFr[i];
    frTasks.push({
      ...(existing || {}),
      id,
      order: (stkTask?.order ?? 0) + 1 + i,
      title: `2.${i + 1} FR — ${phase.name}`,
      role: 'requirements',
      reqKind: 'functional',
      phaseId: phase.id,
      phaseName: phase.name,
      dependsOn: [prevDep],
      status: existing?.status || 'planned',
    });
  });

  const frIds = frTasks.map((t) => t.id);
  const pick = (taskId, defaults) => {
    const found = ensureArray(pl.tasks).find((t) => t.id === taskId);
    return found ? { ...found, ...defaults } : { id: taskId, ...defaults };
  };

  const rnf = pick('rnf', {
    title: '3. Requisitos não funcionais (RNF) — ligados a STK/FR',
    role: 'requirements',
    reqKind: 'non_functional',
    dependsOn: frIds.length ? frIds : ['stk'],
    order: (stkTask?.order ?? 0) + 1 + frTasks.length,
  });
  rnf.dependsOn = frIds.length ? frIds : ['stk'];

  const tc = pick('tc', {
    title: '4. Casos de teste (TC) — verificação dos FR',
    role: 'requirements',
    reqKind: 'test_case',
    dependsOn: ['rnf'],
    order: rnf.order + 1,
  });
  tc.dependsOn = ['rnf'];

  const open = pick('open', {
    title: '5. Questões em aberto / indefinidos',
    role: 'requirements',
    reqKind: 'open',
    dependsOn: ['tc'],
    order: tc.order + 1,
  });
  open.dependsOn = ['tc'];

  const merge = pick('merge', {
    title: '6. Consolidar pacote de requisitos + ligações',
    role: 'merge',
    dependsOn: ['stk', ...frIds, 'rnf', 'tc', 'open'],
    order: open.order + 1,
  });
  merge.dependsOn = ['stk', ...frIds, 'rnf', 'tc', 'open'];

  pl.tasks = [stkTask, ...frTasks, rnf, tc, open, merge].filter(Boolean);
  pl.masterPlanMarkdown = [
    'Pipeline de requisitos:',
    `1 STK → ${frTasks.length} tarefa(s) FR (sequenciais, por fase) → RNF → TC → merge.`,
    `Fases: ${phases.map((p) => p.name).join(' · ')}`,
  ].join(' ');
  pl.updatedAt = nowIso();
  return true;
}

function requirementsFromParsed(parsed) {
  if (!parsed || typeof parsed !== 'object') return [];
  const deliveryOs = require('./delivery-os');
  if (typeof deliveryOs.extractRequirementsFromParsed === 'function') {
    return deliveryOs.extractRequirementsFromParsed(parsed);
  }
  return [
    ...ensureArray(parsed.stakeholderRequirements).map((r) => ({ ...r, type: 'stakeholder' })),
    ...ensureArray(parsed.technicalRequirements).map((r) => ({ ...r, type: 'functional' })),
    ...ensureArray(parsed.requirements),
  ];
}

function gatherPlanRequirements(plan, project, filter = {}) {
  const byId = new Map();
  const addReqs = (reqs) => {
    for (const r of ensureArray(reqs)) {
      if (!r?.id) continue;
      byId.set(String(r.id), r);
    }
  };

  const stkTask = ensureArray(plan?.tasks).find((t) => t.id === 'stk');
  if (stkTask?.parsedOutput) {
    addReqs(requirementsFromParsed(stkTask.parsedOutput));
  }

  for (const t of ensureArray(plan?.tasks)) {
    if (t.id === 'stk' || !t.parsedOutput || !['done', 'skipped'].includes(t.status)) continue;
    if (filter.reqKind && t.reqKind && t.reqKind !== filter.reqKind) continue;
    if (filter.taskId && t.id !== filter.taskId) continue;
    addReqs(requirementsFromParsed(t.parsedOutput));
  }

  addReqs(ensureArray(project?.requirements));

  let list = [...byId.values()];
  if (filter.type) {
    list = list.filter((r) => String(r.type || '').toLowerCase() === filter.type);
  }
  if (filter.phaseName) {
    list = list.filter((r) => requirementMatchesPhase(r, filter.phaseName));
  }
  return list;
}

function requirementOutputSchema(kind, extra = '') {
  const baseReq = `{ "id": "", "type": "", "title": "", "shall": "", "moduleTags": [], "parentId": "", "stakeholderRequirementLink": "", "implementationPhase": "", "vLevel": 0 }`;
  if (kind === 'stakeholder') {
    return `{
  "requirements": [{ ... STK: ${baseReq.replace('"type": ""', '"type": "stakeholder"')} }],
  "assumptions": [],
  "openQuestions": []
}${extra}`;
  }
  if (kind === 'functional') {
    return `{
  "requirements": [{ ... FR: parentId + stakeholderRequirementLink = STK-id, type: "functional", vLevel: 1 }],
  "traceLinks": [{ "fromRequirementId": "FR-01", "toRequirementId": "STK-01", "linkType": "decomposes_from" }]
}${extra}`;
  }
  if (kind === 'non_functional') {
    return `{
  "requirements": [{ ... RNF: parentId = FR-id ou STK-id, type: "non_functional", vLevel: 2 }],
  "traceLinks": [{ "fromRequirementId": "RNF-01", "toRequirementId": "FR-01", "linkType": "constrains" }]
}${extra}`;
  }
  if (kind === 'test_case') {
    return `{
  "requirements": [{ ... TC: parentId + linkedFunctionalRequirement = FR-id, type: "test_case", vLevel: 3, condition: "", measure: "" }],
  "traceLinks": [{ "fromRequirementId": "TC-01", "toRequirementId": "FR-01", "linkType": "verified_by" }]
}${extra}`;
  }
  if (kind === 'open') {
    return `{
  "openQuestions": [""],
  "requirements": [{ "id": "", "type": "undefined", "title": "", "shall": "", "parentId": "STK-id ou FR-id" }]
}${extra}`;
  }
  return `{ "requirements": [${baseReq}] }`;
}

/**
 * Phased requirements pipeline: STK → FR (per fase) → RNF → TC → open → merge.
 */
function buildRequirementsTransitionTasks(project, plan = null) {
  const phases = extractApplicationPhases(project, plan);
  const tasks = [];

  tasks.push({
    id: 'stk',
    order: 0,
    title: '1. Requisitos stakeholder (STK) — visão completa',
    role: 'requirements',
    reqKind: 'stakeholder',
    dependsOn: [],
  });

  phases.forEach((phase, i) => {
    const pid = slugifyPhaseId(phase.id || phase.name, `phase_${i + 1}`);
    const prevDep = i === 0
      ? 'stk'
      : `fr_${slugifyPhaseId(phases[i - 1].id || phases[i - 1].name, `phase_${i}`)}`;
    tasks.push({
      id: `fr_${pid}`,
      order: tasks.length,
      title: `2.${i + 1} FR — ${phase.name}`,
      role: 'requirements',
      reqKind: 'functional',
      phaseId: phase.id,
      phaseName: phase.name,
      dependsOn: [prevDep],
    });
  });

  const frIds = tasks.filter((t) => t.reqKind === 'functional').map((t) => t.id);

  tasks.push({
    id: 'rnf',
    order: tasks.length,
    title: '3. Requisitos não funcionais (RNF) — ligados a STK/FR',
    role: 'requirements',
    reqKind: 'non_functional',
    dependsOn: frIds.length ? frIds : ['stk'],
  });

  tasks.push({
    id: 'tc',
    order: tasks.length,
    title: '4. Casos de teste (TC) — verificação dos FR',
    role: 'requirements',
    reqKind: 'test_case',
    dependsOn: ['rnf'],
  });

  tasks.push({
    id: 'open',
    order: tasks.length,
    title: '5. Questões em aberto / indefinidos',
    role: 'requirements',
    reqKind: 'open',
    dependsOn: ['tc'],
  });

  tasks.push({
    id: 'merge',
    order: tasks.length,
    title: '6. Consolidar pacote de requisitos + ligações',
    role: 'merge',
    dependsOn: tasks.filter((t) => t.role !== 'merge').map((t) => t.id),
  });

  return tasks;
}

function buildRequirementsPhaseTaskPrompt(plan, task, project, deliveryOs) {
  const ctx = deliveryOs.buildContextPack(project, { stageId: 'requirements', maxRequirements: 60 });
  const phases = extractApplicationPhases(project, plan);
  const phaseListMd = phases.map((p, i) => `${i + 1}. **${p.name}** (${p.id})${p.summary ? ` — ${p.summary.slice(0, 120)}` : ''}`).join('\n');

  const stkDone = stakeholderRequirementsFromPlan(project, plan);
  const priorFr = task.reqKind === 'functional' ? gatherPriorFunctionalFromPlan(plan, task.id, project) : [];
  const frDone = [
    ...priorFr,
    ...gatherPlanRequirements(plan, project, { type: 'functional' }),
  ];
  const reservedFr = gatherReservedIds(project, plan, task, 'FR');
  const nextFrNum = maxSerialForPrefix(reservedFr, 'FR') + 1;
  const nextFrId = `FR-${String(nextFrNum).padStart(2, '0')}`;
  const existingFrIds = [...reservedFr].sort((a, b) => {
    const na = parseInt(String(a).match(/(\d+)$/)?.[1] || '0', 10);
    const nb = parseInt(String(b).match(/(\d+)$/)?.[1] || '0', 10);
    return na - nb;
  });

  const stkSummary = stkDone.slice(0, 80).map((r) => ({
    id: r.id,
    title: r.title,
    shall: String(r.shall || '').slice(0, 160),
    implementationPhase: r.implementationPhase || r.phase,
    moduleTags: r.moduleTags,
  }));

  const commonRules = `
Regras de rastreabilidade (cadeia V):
- STK (vLevel 0): necessidades de negócio — sem parentId.
- FR (vLevel 1): decompõem STK — **parentId** e **stakeholderRequirementLink** = id STK exacto (nunca inventar STK).
- RNF (vLevel 2): constrain FR ou STK — **parentId** obrigatório.
- TC (vLevel 3): verificam FR — **parentId** e **linkedFunctionalRequirement** = id FR.
- **Nunca reutilize ids FR/RNF/TC já existentes** — continue a numeração sequencial.
- Cada requisito deve ter **implementationPhase** igual a uma das fases listadas.
- Responda APENAS JSON válido (sem markdown fences).
`;

  if (task.reqKind === 'stakeholder' || task.id === 'stk') {
    return `Tu és um analista de requirements YourLab.

## Tarefa: gerar TODOS os requisitos stakeholder (STK)

Antes de FR/RNF/TC, produza a visão completa das necessidades de negócio.

### Fases de implementação (atribua cada STK a UMA fase via implementationPhase)
${phaseListMd}

### Contexto do projecto
${JSON.stringify(ctx, null, 2)}

### Instruções
- Gere requisitos **stakeholder** (type: "stakeholder", vLevel: 0).
- Cubra todos os actores: cliente, parceiro, admin, transversal.
- Cada STK deve ter: id (STK-NN), title, shall, moduleTags, implementationPhase (nome exacto de uma fase acima).
- Não gere FR/RNF/TC nesta tarefa.
${commonRules}

${requirementOutputSchema('stakeholder')}`;
  }

  if (task.reqKind === 'functional') {
    const stksForPhase = stkDone.filter((r) => requirementMatchesPhase(r, task.phaseName));

    const priorFrSummary = priorFr.slice(-40).map((r) => ({
      id: r.id,
      title: r.title,
      phase: r.implementationPhase || r.phase,
    }));

    return `Tu és um analista de requirements YourLab.

## Tarefa: requisitos funcionais (FR) — fase «${task.phaseName}»

Decomponha os STK desta fase em requisitos funcionais SMART.
Esta tarefa é **sequencial** — complementa FR das fases anteriores, sem repetir ids.

### Fase actual
- Nome: **${task.phaseName}**
- Id: ${task.phaseId || '—'}

### Numeração FR (obrigatório)
- FR já existentes (${existingFrIds.length}): ${existingFrIds.slice(0, 30).join(', ') || 'nenhum'}${existingFrIds.length > 30 ? '…' : ''}
- **Comece em ${nextFrId}** e incremente (FR-${String(nextFrNum + 1).padStart(2, '0')}, …)
- **Proibido** reutilizar FR-01…FR-${String(nextFrNum - 1).padStart(2, '0')} se já existirem

### FR das fases anteriores (referência — não duplicar)
${JSON.stringify(priorFrSummary, null, 2)}

### STK desta fase (ligar cada FR a um destes ids exactos)
${JSON.stringify(stksForPhase.map((r) => ({ id: r.id, title: r.title, shall: String(r.shall || '').slice(0, 200) })), null, 2)}

${stksForPhase.length ? '' : '⚠ Ainda sem STK colados — complete a tarefa STK primeiro.'}

### Contexto
${JSON.stringify({ project: ctx.projectSummary, discovery: ctx.discoverySummary }, null, 2)}

### Instruções
- Gere APENAS requisitos **functional** (vLevel: 1) para a fase «${task.phaseName}».
- Cada FR **deve** ter parentId e stakeholderRequirementLink = id STK existente acima.
- implementationPhase = «${task.phaseName}»
- Inclua traceLinks decomposes_from (FR → STK).
- Não gere STK/RNF/TC nesta tarefa.
${commonRules}

${requirementOutputSchema('functional')}`;
  }

  if (task.reqKind === 'non_functional' || task.id === 'rnf') {
    const reservedRnf = gatherReservedIds(project, plan, task, 'RNF');
    const nextRnfId = `RNF-${String(maxSerialForPrefix(reservedRnf, 'RNF') + 1).padStart(2, '0')}`;
    const frSummary = frDone.slice(0, 80).map((r) => ({
      id: r.id,
      title: r.title,
      parentId: r.parentId || r.stakeholderRequirementLink,
      phase: r.implementationPhase || r.phase,
    }));
    return `Tu és um analista de requirements YourLab.

## Tarefa: requisitos não funcionais (RNF)

### STK (referência)
${JSON.stringify(stkSummary.slice(0, 30), null, 2)}

### FR existentes (ligar RNF via parentId)
${JSON.stringify(frSummary, null, 2)}

### Instruções
- Gere requisitos **non_functional** (vLevel: 2): performance, segurança, usabilidade, disponibilidade, etc.
- Comece ids em **${nextRnfId}** — não reutilize RNF existentes.
- Cada RNF liga a um FR (preferido) ou STK via **parentId** (ids exactos das listas acima).
- Inclua traceLinks constrains (RNF → FR).
${commonRules}

${requirementOutputSchema('non_functional')}`;
  }

  if (task.reqKind === 'test_case' || task.id === 'tc') {
    const reservedTc = gatherReservedIds(project, plan, task, 'TC');
    const nextTcId = `TC-${String(maxSerialForPrefix(reservedTc, 'TC') + 1).padStart(2, '0')}`;
    const frSummary = frDone.slice(0, 80).map((r) => ({
      id: r.id,
      title: r.title,
      shall: String(r.shall || '').slice(0, 120),
    }));
    return `Tu és um analista de testes YourLab.

## Tarefa: casos de teste (TC)

### FR a verificar
${JSON.stringify(frSummary, null, 2)}

### Instruções
- Gere **test_case** (vLevel: 3) com condition + measure (critérios SMART).
- Comece ids em **${nextTcId}** — não reutilize TC existentes.
- Cada TC liga a um FR via parentId e linkedFunctionalRequirement (id FR exacto).
- Inclua traceLinks verified_by (TC → FR).
${commonRules}

${requirementOutputSchema('test_case')}`;
  }

  if (task.reqKind === 'open' || task.id === 'open') {
    return `Tu és um analista YourLab.

## Tarefa: questões em aberto e requisitos indefinidos

### Contexto
${JSON.stringify({ stkCount: stkDone.length, frCount: frDone.length, openQuestions: ctx.openQuestions }, null, 2)}

Registe lacunas, ambiguidades e requisitos type "undefined" ligados a STK/FR quando aplicável.

${requirementOutputSchema('open')}`;
  }

  if (task.role === 'merge') {
    return `Tu és um analista YourLab.

## Tarefa: consolidar pacote de requisitos

Fundir outputs das tarefas anteriores num único JSON:
- requirements[] (STK + FR + RNF + TC + undefined)
- moduleMappings[] (requirementId → moduleTags)
- traceLinks[] (decomposes_from, constrains, verified_by)
- openQuestions[], assumptions[]

Remova duplicados por id; preserve todas as ligações parentId/stakeholderRequirementLink.

${requirementOutputSchema('stakeholder', '\nInclua também FR, RNF, TC no array requirements.')}`;
  }

  const fullPrompt = deliveryOs.buildStageTransitionPrompt(
    project,
    plan.fromStageId,
    plan.toStageId,
    plan.direction
  );
  return buildTaskInstruction(fullPrompt, task, plan.agentType, project, plan.config);
}

function resolveStageTransitionSpec(fromStageId, toStageId, direction) {
  const from = textOr(fromStageId);
  const to = textOr(toStageId);
  const dir = textOr(direction, 'forward');
  const forwardKey = `${from}->${to}`;
  if (STAGE_TRANSITION_TASKS[forwardKey]) {
    return { key: forwardKey, fromStageId: from, toStageId: to, direction: dir };
  }
  if (dir === 'backward') {
    const reverseKey = `${to}->${from}`;
    if (STAGE_TRANSITION_TASKS[reverseKey]) {
      return { key: reverseKey, fromStageId: to, toStageId: from, direction: 'backward' };
    }
  }
  return { key: forwardKey, fromStageId: from, toStageId: to, direction: dir };
}

function buildStageTransitionTasks(fromStageId, toStageId, direction, project = null) {
  const resolved = resolveStageTransitionSpec(fromStageId, toStageId, direction);
  const spec = STAGE_TRANSITION_TASKS[resolved.key];
  if (!spec) return [];

  if (resolved.key === 'discovery->requirements' && resolved.direction === 'forward' && project) {
    return buildRequirementsTransitionTasks(project);
  }

  const list = resolved.direction === 'backward' ? spec.backward : spec.forward;
  if (!list?.length || list === 'dynamic') return [];
  return list.map((t, i) => ({
    ...t,
    order: i,
    dependsOn: i > 0 && t.role !== 'merge'
      ? [list[i - 1].id]
      : (t.role === 'merge' ? list.filter((x) => x.role !== 'merge').map((x) => x.id) : []),
  }));
}

function buildExecutionPlan(agentType, project, options = {}, deps = {}) {
  const deliveryOs = deps.deliveryOs || require('./delivery-os');
  const stageId = textOr(options.stageId);
  const profile = resolveModelProfile(options);
  const propagationDirection = ['forward', 'backward', 'bidirectional'].includes(textOr(options.propagationDirection))
    ? textOr(options.propagationDirection)
    : (textOr(options.direction) === 'backward' ? 'backward' : 'forward');
  const requestedSplitStrategy = ['deterministic', 'planner_prompt'].includes(textOr(options.splitStrategy))
    ? textOr(options.splitStrategy)
    : 'deterministic';
  const config = {
    systemPrompt: textOr(options.systemPrompt, 'Tu és um agente de systems engineering YourLab.'),
    outputSchema: textOr(options.outputSchema, 'JSON válido apenas.'),
    maxTokens: Number(options.maxTokens) || 120000,
    maxSubtasks: Number(options.maxSubtasks) || 8,
    modelProfileId: profile.id,
    targetInputTokens: profile.targetInputTokens,
    targetOutputTokens: profile.targetOutputTokens,
    splitStrategy: requestedSplitStrategy,
    propagationDirection,
    enableWebSearch: options.enableWebSearch !== false,
    capabilityId: textOr(options.capabilityId),
    moduleTag: textOr(options.moduleTag),
  };

  let tasks = [];
  let masterPlanMarkdown = '';
  let fullPrompt = '';

  if (agentType === 'stage_transition') {
    const fromStageId = textOr(options.fromStageId);
    const toStageId = textOr(options.toStageId);
    const direction = textOr(options.direction, 'forward');
    const resolved = resolveStageTransitionSpec(fromStageId, toStageId, direction);
    tasks = buildStageTransitionTasks(fromStageId, toStageId, direction, project);
    fullPrompt = deliveryOs.buildStageTransitionPrompt(
      project,
      resolved.fromStageId,
      resolved.toStageId,
      resolved.direction
    );

    const isPhasedRequirements = resolved.key === 'discovery->requirements' && resolved.direction === 'forward';
    const stubPlan = {
      agentType,
      fromStageId: resolved.fromStageId,
      toStageId: resolved.toStageId,
      direction: resolved.direction,
      config,
      tasks,
    };
    if (isPhasedRequirements) {
      const phases = extractApplicationPhases(project, stubPlan);
      const frCount = tasks.filter((t) => t.reqKind === 'functional').length;
      masterPlanMarkdown = [
        'Pipeline de requisitos:',
        `1 STK completo → ${frCount} tarefa(s) FR (sequenciais, por fase) → RNF → TC → open → merge.`,
        `Fases: ${phases.map((p) => p.name).join(' · ')}`,
      ].join(' ');
    } else {
      masterPlanMarkdown = `Transição ${resolved.fromStageId} → ${resolved.toStageId} (${resolved.direction}): ${tasks.length} tarefa(s).`;
    }

    tasks = tasks.map((t) => ({
      ...t,
      instruction: resolved.key === 'idea->discovery' && resolved.direction === 'forward'
        ? buildDiscoveryTransitionTaskPrompt(fullPrompt, t)
        : isPhasedRequirements
        ? buildRequirementsPhaseTaskPrompt(stubPlan, t, project, deliveryOs)
        : buildTaskInstruction(fullPrompt, t, agentType, project, options),
    }));
  } else if (agentType === 'requirement_grouping' && deliveryOs.BATCHABLE_AGENTS?.requirement_grouping) {
    const chunks = deliveryOs.partitionRequirementsByModule(project, options);
    tasks = chunks.map((chunk, i) => ({
      id: `chunk_${i}`,
      order: i,
      title: chunk.label || `Lote ${i + 1}`,
      role: 'artifact',
      requirementIds: chunk.requirementIds,
      instruction: deliveryOs.BATCHABLE_AGENTS.requirement_grouping.buildChunkPrompt(project, chunk),
      dependsOn: [],
    }));
    tasks.push({
      id: 'merge',
      order: tasks.length,
      title: 'Consolidar agrupamento',
      role: 'merge',
      dependsOn: tasks.map((t) => t.id),
      instruction: 'Consolide os lotes anteriores num único JSON de capabilities e clusters.',
    });
    fullPrompt = deliveryOs.buildGroupingPrompt(project);
    masterPlanMarkdown = `${ensureArray(project.requirements).length} requisitos → ${tasks.length - 1} lote(s) + consolidação.`;
  } else if (agentType === 'requirements_to_architecture') {
    const archPlan = deliveryOs.buildArchitectureTaskPlan(
      project,
      config.capabilityId,
      config.moduleTag,
      options
    );
    tasks = ensureArray(archPlan.tasks).map((t, i) => ({
      id: textOr(t.id, `arch_${i}`),
      order: i,
      title: textOr(t.title),
      role: textOr(t.role, 'diagram'),
      diagramType: textOr(t.diagramType),
      requirementIds: ensureArray(t.requirementIds),
      dependsOn: ensureArray(t.dependsOn),
      instruction: textOr(t.instruction),
    }));
    fullPrompt = deliveryOs.buildArchitecturePackPrompt(project, config.capabilityId, config.moduleTag);
    masterPlanMarkdown = archPlan.masterPlanMarkdown || `Plano de arquitectura: ${tasks.length} tarefa(s).`;
  } else if (agentType === 'reverse_idea') {
    tasks = [
      { id: 'vision', order: 0, title: 'Visão e idea brief', role: 'artifact', dependsOn: [] },
      { id: 'philosophy', order: 1, title: 'Filosofia e princípios', role: 'artifact', dependsOn: ['vision'] },
      { id: 'merge', order: 2, title: 'Consolidar idea brief', role: 'merge', dependsOn: ['vision', 'philosophy'] },
    ];
    fullPrompt = deliveryOs.buildReverseIdeaPrompt(project);
    masterPlanMarkdown = 'Idea brief em 2 partes + consolidação.';
  } else if (agentType === 'discovery_research') {
    tasks = [
      { id: 'framing', order: 0, title: 'Hipóteses e perguntas de investigação', role: 'analysis', dependsOn: [] },
      { id: 'stakeholders', order: 1, title: 'Stakeholders, segmentos e personas', role: 'artifact', dependsOn: ['framing'] },
      { id: 'market', order: 2, title: 'Dimensão de mercado, procura e tendências', role: 'artifact', dependsOn: ['framing'] },
      { id: 'competitors', order: 3, title: 'Concorrentes e alternativas', role: 'artifact', dependsOn: ['market'] },
      { id: 'business', order: 4, title: 'Modelo de negócio, GTM e implicações', role: 'artifact', dependsOn: ['stakeholders', 'competitors'] },
      { id: 'merge', order: 5, title: 'Consolidar dossier de descoberta', role: 'merge', dependsOn: ['stakeholders', 'market', 'competitors', 'business'] },
    ];
    fullPrompt = deliveryOs.buildDiscoveryPrompt(project);
    tasks = tasks.map((task) => ({
      ...task,
      instruction: buildDiscoveryTransitionTaskPrompt(fullPrompt, task),
    }));
    masterPlanMarkdown = 'Investigação de mercado com evidência: enquadramento → stakeholders/personas → mercado/tendências → concorrência → modelo e implicações → consolidação.';
  } else if (agentType === 'roadmap_plan') {
    const caps = ensureArray(project.capabilities);
    tasks = caps.slice(0, 6).map((cap, i) => ({
      id: `cap_${cap.id}`,
      order: i,
      title: `Roadmap: ${cap.name}`,
      role: 'artifact',
      dependsOn: [],
    }));
    if (!tasks.length) {
      tasks.push({ id: 'phases', order: 0, title: 'Fases do roadmap', role: 'artifact', dependsOn: [] });
    }
    tasks.push({
      id: 'merge',
      order: tasks.length,
      title: 'Consolidar roadmap',
      role: 'merge',
      dependsOn: tasks.filter((t) => t.role !== 'merge').map((t) => t.id),
    });
    fullPrompt = deliveryOs.buildRoadmapPrompt(project);
    masterPlanMarkdown = `Roadmap: ${tasks.length} tarefa(s).`;
  } else if (agentType === 'implementation_tasks') {
    tasks = [
      { id: 'stack', order: 0, title: 'Stack técnica', role: 'artifact', dependsOn: [] },
      { id: 'tasks_fe', order: 1, title: 'Tarefas Frontend', role: 'artifact', dependsOn: ['stack'] },
      { id: 'tasks_be', order: 2, title: 'Tarefas Backend', role: 'artifact', dependsOn: ['stack'] },
      { id: 'merge', order: 3, title: 'Consolidar implementação', role: 'merge', dependsOn: ['tasks_fe', 'tasks_be'] },
    ];
    fullPrompt = deliveryOs.buildImplementationTasksPrompt(project);
    masterPlanMarkdown = 'Plano de implementação por camada.';
  } else if (agentType === 'impact_regeneration') {
    const minutes = ensureArray(options.minutes);
    const propagationPlan = options.propagationPlan || deliveryOs.buildMinutePropagationPlan(minutes);
    fullPrompt = deliveryOs.buildMinutePropagationPrompt(project, minutes, propagationPlan);
    tasks = [
      { id: 'impact', order: 0, title: 'Regenerar artefactos afectados', role: 'artifact', dependsOn: [] },
      { id: 'merge', order: 1, title: 'Consolidar propagação', role: 'merge', dependsOn: ['impact'] },
    ];
    masterPlanMarkdown = ensureArray(propagationPlan.hints).join(' ')
      || `Propagação de ${minutes.length} ata(s) nas fases afectadas.`;
    config.minuteIds = minutes.map((m) => m.id);
    config.propagationPlan = propagationPlan;
  } else if (agentType === 'diagram_to_requirements' && options.diagramArtifactId) {
    fullPrompt = buildFullPromptForType(agentType, project, options, deliveryOs);
    const diagram = ensureArray(project.diagramArtifacts).find((d) => d.id === options.diagramArtifactId);
    tasks = [{
      id: `diag_${options.diagramArtifactId}`,
      order: 0,
      title: diagram?.title ? `Requisitos: ${diagram.title}` : 'Extrair requisitos do diagrama',
      role: 'requirements',
      diagramArtifactId: options.diagramArtifactId,
      dependsOn: [],
    }, {
      id: 'merge',
      order: 1,
      title: 'Consolidar requisitos',
      role: 'merge',
      dependsOn: [`diag_${options.diagramArtifactId}`],
    }];
    masterPlanMarkdown = `Diagrama → requisitos (${diagram?.title || options.diagramArtifactId}).`;
  } else {
    fullPrompt = buildFullPromptForType(agentType, project, options, deliveryOs);
    tasks = [
      { id: 'analyse', order: 0, title: `Analisar contexto de ${agentType}`, role: 'analysis', dependsOn: [] },
      { id: 'produce', order: 1, title: `Produzir resultado de ${agentType}`, role: 'artifact', dependsOn: ['analyse'] },
    ];
    masterPlanMarkdown = 'Análise contextual seguida da produção do resultado; sem cortes arbitrários do prompt.';
  }

  if (!tasks.every((t) => t.instruction)) {
    tasks = tasks.map((t) => ({
      ...t,
      instruction: t.instruction || buildTaskInstruction(fullPrompt, t, agentType, project, options),
    }));
  }

  const planForPrompts = {
    agentType,
    fromStageId: options.fromStageId,
    toStageId: options.toStageId,
    direction: options.direction,
    propagationDirection,
    config,
  };
  tasks = enrichTasksForProfile(tasks, planForPrompts, profile);
  let splitStrategy = requestedSplitStrategy;
  if (exceedsProfileBounds(tasks, profile)) {
    masterPlanMarkdown = `${masterPlanMarkdown}\n\nAlgumas tarefas excedem o alvo do perfil ${profile.id}; a configuração deve ser revista antes da execução.`;
  }

  return normalizeExecutionPlan({
    agentType,
    stageId,
    fromStageId: agentType === 'stage_transition'
      ? resolveStageTransitionSpec(options.fromStageId, options.toStageId, options.direction).fromStageId
      : options.fromStageId,
    toStageId: agentType === 'stage_transition'
      ? resolveStageTransitionSpec(options.fromStageId, options.toStageId, options.direction).toStageId
      : options.toStageId,
    direction: agentType === 'stage_transition'
      ? resolveStageTransitionSpec(options.fromStageId, options.toStageId, options.direction).direction
      : options.direction,
    mode: textOr(options.mode, 'manual'),
    modelProfileId: profile.id,
    targetInputTokens: profile.targetInputTokens,
    targetOutputTokens: profile.targetOutputTokens,
    splitStrategy,
    propagationDirection,
    config,
    tasks,
    masterPlanMarkdown,
    status: 'planned',
    createdBy: options.createdBy,
  });
}

function buildFullPromptForType(agentType, project, options, deliveryOs) {
  if (agentType === 'requirement_hierarchy') return deliveryOs.buildHierarchyReorganizePrompt(project);
  if (agentType === 'implementation_stack') return deliveryOs.buildImplementationStackPrompt(project);
  if (agentType === 'diagram_to_requirements') {
    return deliveryOs.buildDiagramToRequirementsPrompt(project, {
      bodyMarkdown: options.bodyMarkdown,
      diagramArtifactId: options.diagramArtifactId,
      stageId: options.stageId,
    });
  }
  if (agentType === 'capability_requirements') {
    return deliveryOs.buildCapabilityRequirementsPrompt(project, options.capabilityId);
  }
  const contextPack = deliveryOs.buildContextPack(project, {
    stageId: options.stageId,
    capabilityId: options.capabilityId,
  });
  return deliveryOs.buildPromptRunFull?.(
    textOr(options.systemPrompt, 'Tu és um agente de systems engineering YourLab.'),
    textOr(options.stageInstruction, `Stage: ${options.stageId || 'requirements'}`),
    contextPack,
    textOr(options.taskPrompt, options.task || ''),
    textOr(options.outputSchema, 'JSON válido apenas.')
  ) || '';
}

function buildTaskInstruction(fullPrompt, task, agentType, project, options) {
  const header = [
    `# Tarefa: ${task.title}`,
    `Agente: ${agentType}`,
    task.role === 'merge' ? '\nConsolide os outputs das tarefas anteriores num único JSON válido.' : '',
    task.role === 'requirements' ? '\nFoque apenas no tipo de requisito indicado no título.' : '',
    task.diagramType ? `\nTipo de diagrama: ${task.diagramType}` : '',
    task.requirementIds?.length ? `\nRequisitos: ${task.requirementIds.join(', ')}` : '',
    '\n---\n',
  ].filter(Boolean).join('\n');

  if (agentType === 'stage_transition' && task.role !== 'merge') {
    return `${header}\nExecute APENAS esta sub-tarefa da transição de fase. Contexto completo:\n\n${fullPrompt.slice(0, 12000)}`;
  }

  if (fullPrompt.length > 10000 && task.role !== 'merge') {
    const partHint = `\n[Esta é a tarefa "${task.id}" — responda só à secção relevante.]`;
    return `${header}${partHint}\n\n${fullPrompt.slice(0, 14000)}`;
  }

  return `${header}\n${fullPrompt}`;
}

function buildDiscoveryTransitionTaskPrompt(fullPrompt, task) {
  const common = [
    '# Regras de investigação',
    '- Use pesquisa web real e trate os resultados fornecidos pelo runtime como evidência.',
    '- Não invente números, concorrentes, URLs ou alegações. Quando não existir evidência suficiente, registe evidenceGaps e assumptions.',
    '- Separe factos observados, estimativas calculadas e hipóteses.',
    '- Toda alegação de mercado, tendência ou concorrência deve referenciar sourceIds.',
    '- Fontes devem incluir URL, título, publicador, data de consulta, tipo e confiança.',
    '- Explicite as consequências da evidência para o produto em implications.',
    '- Responda apenas JSON válido, sem markdown fences.',
  ].join('\n');
  const focus = {
    framing: `Produza:
{"discovery":{"researchBrief":{"problemFramingMarkdown":"","researchQuestions":[],"hypotheses":[],"scope":{"geographies":[],"customerTypes":[],"timeHorizon":""}},"assumptions":[],"evidenceGaps":[]}}`,
    stakeholders: `Produza:
{"discovery":{"segments":[{"name":"","descriptionMarkdown":"","painPoints":[],"sourceIds":[]}],"stakeholders":[{"name":"","type":"","role":"","needs":[],"pains":[],"influence":"low|medium|high","implications":[]}],"personas":[{"name":"","segment":"","contextMarkdown":"","jobs":[],"pains":[],"gains":[],"behaviours":[],"implications":[]}],"researchSources":[],"evidenceGaps":[]}}`,
    market: `Produza:
{"discovery":{"marketSummaryMarkdown":"","marketSizing":{"tam":"","sam":"","som":"","methodMarkdown":"","notesMarkdown":"","sourceIds":[]},"trends":[{"title":"","evidenceMarkdown":"","implicationMarkdown":"","sourceIds":[]}],"segments":[],"researchSources":[],"assumptions":[],"evidenceGaps":[]}}`,
    competitors: `Produza:
{"discovery":{"competitors":[{"name":"","url":"","category":"direct|indirect|substitute","positioningMarkdown":"","descriptionMarkdown":"","strengths":[],"weaknesses":[],"differentiation":"","sourceIds":[]}],"implications":[{"title":"","descriptionMarkdown":"","impact":"low|medium|high","horizon":"now|next|later","sourceIds":[]}],"researchSources":[],"evidenceGaps":[]}}`,
    business: `Produza:
{"discovery":{"businessModel":{"revenueStreams":[],"costStructure":[],"channels":[],"keyPartners":[]},"commercialImpact":{"objectivesMarkdown":"","kpis":[{"name":"","target":"","rationale":""}]},"goToMarketMarkdown":"","swot":{"strengths":[],"weaknesses":[],"opportunities":[],"threats":[]},"implications":[],"assumptions":[],"evidenceGaps":[]}}`,
    merge: `Consolide um dossier completo no schema discovery_v2:
{"discovery":{"researchBrief":{"problemFramingMarkdown":"","researchQuestions":[],"hypotheses":[],"scope":{"geographies":[],"customerTypes":[],"timeHorizon":""}},"marketSummaryMarkdown":"","marketSizing":{"tam":"","sam":"","som":"","methodMarkdown":"","notesMarkdown":"","sourceIds":[]},"segments":[],"stakeholders":[],"personas":[],"competitors":[],"trends":[],"businessModel":{"revenueStreams":[],"costStructure":[],"channels":[],"keyPartners":[]},"commercialImpact":{"objectivesMarkdown":"","kpis":[]},"swot":{"strengths":[],"weaknesses":[],"opportunities":[],"threats":[]},"goToMarketMarkdown":"","implications":[],"researchSources":[],"assumptions":[],"evidenceGaps":[]},"requiresHumanConfirmation":true}`,
  }[task.id] || 'Produza a parte relevante do dossier discovery_v2.';
  return `# Tarefa de Discovery: ${task.title}

${common}

# Output desta tarefa
${focus}

# Contexto congelado do projecto
${fullPrompt.slice(0, 16000)}`;
}

function preparePhasedRequirementsPlan(plan, project) {
  if (!isPhasedRequirementsPlan(plan)) return plan;
  const pl = { ...plan, tasks: ensureArray(plan.tasks).map((t) => ({ ...t })) };
  syncRequirementsFrTasks(pl, project);
  return pl;
}

function buildTaskPrompt(plan, task, project, deps = {}) {
  const deliveryOs = deps.deliveryOs || require('./delivery-os');
  const isPhasedRequirements = plan.agentType === 'stage_transition'
    && plan.fromStageId === 'discovery'
    && plan.toStageId === 'requirements'
    && textOr(plan.direction, 'forward') === 'forward';

  if (isPhasedRequirements && (task.reqKind || task.id === 'merge' || String(task.id).startsWith('fr_'))) {
    const syncedPlan = preparePhasedRequirementsPlan(plan, project);
    const syncedTask = ensureArray(syncedPlan.tasks).find((t) => t.id === task.id) || task;
    return buildRequirementsPhaseTaskPrompt(syncedPlan, syncedTask, project, deliveryOs);
  }

  const base = buildTaskInstruction(
    buildFullPromptForType(plan.agentType, project, plan.config, deliveryOs),
    task,
    plan.agentType,
    project,
    { ...plan.config, fromStageId: plan.fromStageId, toStageId: plan.toStageId, direction: plan.direction }
  );
  const carryover = compactTaskOutputContext(plan, task, Math.max(600, Math.floor((plan.targetInputTokens || 14000) * 0.15)));
  if (!carryover) return base;
  return `${base}\n\n---\n\n# Previous verified task outputs\nUse this compact context from completed dependencies. Do not copy raw text blindly; preserve IDs and decisions.\n\n${carryover}`;
}

function buildPromptPackMarkdown(planRaw, project = null) {
  const plan = normalizeExecutionPlan(planRaw);
  const profile = resolveModelProfile(plan, plan.config);
  const lines = [
    `# Prompt Pack — ${plan.agentType || 'agent'}`,
    '',
    `Plano: ${plan.id}`,
    `Perfil: ${profile.id} (${profile.label})`,
    `Input alvo/tarefa: ${profile.targetInputTokens} tokens`,
    `Output alvo/tarefa: ${profile.targetOutputTokens} tokens`,
    `Split: ${plan.splitStrategy}`,
    `Propagação: ${plan.propagationDirection}`,
    '',
    '## Resumo',
    plan.masterPlanMarkdown || 'Sem resumo.',
    '',
    '## Grafo de dependências',
    ...ensureArray(plan.tasks).map((task) => `- ${task.id}: ${task.title} | dependsOn: ${ensureArray(task.dependsOn).join(', ') || 'independent'} | contextFrom: ${ensureArray(task.contextFromTaskIds).join(', ') || 'none'}`),
    '',
  ];

  ensureArray(plan.tasks).forEach((task, index) => {
    const prompt = task.instruction || (project ? buildTaskPrompt(plan, task, project) : '');
    lines.push(
      `## Task ${index + 1}: ${task.title}`,
      '',
      `ID: ${task.id}`,
      `Role: ${task.role}`,
      `Estimated input tokens: ${task.estimatedInputTokens || estimateTokens(prompt)}`,
      `Target output tokens: ${task.targetOutputTokens || profile.targetOutputTokens}`,
      `Rollback: capture snapshot before applying this task; revert via task audit if needed.`,
      '',
      '### Task prompt',
      '```text',
      prompt,
      '```',
      '',
      '### Verification prompt',
      '```text',
      task.verificationPrompt || buildVerificationPrompt(task, profile),
      '```',
      '',
      '### Regression guard prompt',
      '```text',
      task.regressionGuardPrompt || buildRegressionGuardPrompt(task, plan),
      '```',
      ''
    );
    if (task.reversePrompt || plan.propagationDirection !== 'forward') {
      lines.push('### Reverse propagation prompt', '```text', task.reversePrompt || buildReversePrompt(task, plan), '```', '');
    }
    if (task.role === 'merge' || task.mergePrompt) {
      lines.push('### Merge prompt', '```text', task.mergePrompt || buildMergePrompt(task, plan), '```', '');
    }
  });

  return `${lines.join('\n')}\n`;
}

function mergeTaskOutputs(plan, taskOutputs) {
  const partials = ensureArray(taskOutputs).filter(Boolean);
  if (!partials.length) return null;
  if (partials.length === 1) return partials[0];
  const merged = {};
  const reqSeen = new Set();
  const traceSeen = new Set();
  for (const p of partials) {
    if (!p || typeof p !== 'object') continue;
    Object.keys(p).forEach((key) => {
      if (key === 'requirements') {
        merged.requirements = merged.requirements || [];
        for (const r of ensureArray(p.requirements)) {
          const id = textOr(r?.id);
          if (id && reqSeen.has(id)) continue;
          if (id) reqSeen.add(id);
          merged.requirements.push(r);
        }
        return;
      }
      if (key === 'traceLinks') {
        merged.traceLinks = merged.traceLinks || [];
        for (const link of ensureArray(p.traceLinks)) {
          const sig = `${link.fromRequirementId}|${link.toRequirementId}|${link.linkType}`;
          if (traceSeen.has(sig)) continue;
          traceSeen.add(sig);
          merged.traceLinks.push(link);
        }
        return;
      }
      if (Array.isArray(p[key])) {
        merged[key] = [...ensureArray(merged[key]), ...p[key]];
      } else if (p[key] && typeof p[key] === 'object' && !Array.isArray(p[key])) {
        merged[key] = { ...(merged[key] || {}), ...p[key] };
      } else if (p[key] != null && p[key] !== '') {
        merged[key] = p[key];
      }
    });
  }
  return merged;
}

const GATE_CHECK_AGENTS = {
  consistency_checker: {
    label: 'Verificador de consistência',
    description: 'Valida cobertura RNF, pedidos de alteração em aberto e decisões pendentes antes do gate.',
    stages: ['requirements', 'architecture', 'roadmap', 'implementation', 'validation', 'delivery'],
  },
  traceability_auditor: {
    label: 'Auditor de rastreabilidade',
    description: 'Identifica FRs órfãos, tarefas sem FR e lacunas na árvore STK→FR→TC.',
    stages: ['requirements', 'architecture', 'implementation', 'validation'],
  },
};

function getGateCheckAgentForTransition(fromStageId, toStageId) {
  const key = `${fromStageId}->${toStageId}`;
  if (key === 'requirements->architecture') return 'consistency_checker';
  if (key === 'architecture->roadmap') return 'traceability_auditor';
  if (key === 'roadmap->implementation') return 'consistency_checker';
  return null;
}

module.exports = {
  MODEL_PROFILES,
  ROLE_MODEL_PROFILES,
  STAGE_TRANSITION_TASKS,
  estimateTokens,
  resolveModelProfile,
  normalizeExecutionPlan,
  normalizeExecutionTask,
  buildExecutionPlan,
  buildPromptPackMarkdown,
  buildVerificationPrompt,
  buildRegressionGuardPrompt,
  buildMergePrompt,
  compactTaskOutputContext,
  buildTaskPrompt,
  buildTaskInstruction,
  resolveStageTransitionSpec,
  buildStageTransitionTasks,
  buildRequirementsTransitionTasks,
  buildRequirementsPhaseTaskPrompt,
  preparePhasedRequirementsPlan,
  extractApplicationPhases,
  extractStakeholderPhasesFromPlan,
  requirementMatchesPhase,
  stakeholderRequirementsFromPlan,
  isPhasedRequirementsPlan,
  syncRequirementsFrTasks,
  normalizePhasedTaskOutput,
  mergeTaskOutputs,
  GATE_CHECK_AGENTS,
  getGateCheckAgentForTransition,
};
