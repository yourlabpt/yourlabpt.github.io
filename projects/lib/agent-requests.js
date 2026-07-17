/** Agent delegations — visible plans backed by canonical work items. */
const crypto = require('crypto');
const workItems = require('./work-items');

const REQUEST_STATUSES = new Set([
  'awaiting_approval', 'ready', 'running', 'waiting_input', 'waiting_review',
  'completed', 'failed', 'blocked', 'revision_requested', 'cancelled', 'superseded',
]);

function ensureArray(value) { return Array.isArray(value) ? value : []; }
function textOr(value, fallback = '') {
  const valueText = value === null || value === undefined ? '' : String(value).trim();
  return valueText || fallback;
}
function nowIso(options = {}) { return options.nowIso ? options.nowIso() : new Date().toISOString(); }
function hash(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex').slice(0, 24);
}
function normalizePlanTask(raw, index = 0) {
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    id: textOr(src.id, `step_${index + 1}`), order: Number(src.order) || index + 1,
    title: textOr(src.title, `Tarefa ${index + 1}`),
    instruction: textOr(src.instruction || src.descriptionMarkdown || src.description),
    role: textOr(src.role), agentId: textOr(src.agentId),
    dependsOn: [...new Set(ensureArray(src.dependsOn || src.dependencyTaskIds).map(String).filter(Boolean))],
    requirementIds: [...new Set(ensureArray(src.requirementIds || src.linkedRequirementIds).map(String).filter(Boolean))],
    expectedOutput: textOr(src.expectedOutput || src.targetOutput || src.outputSchema),
    outputSchema: textOr(src.outputSchema), reviewRequired: src.reviewRequired !== false,
    phaseId: textOr(src.phaseId || src.planPhaseId), phaseName: textOr(src.phaseName),
    estimatedInputTokens: Number(src.estimatedInputTokens) || 0,
    targetOutputTokens: Number(src.targetOutputTokens) || 0,
    stableTaskKey: textOr(src.stableTaskKey || src.id, `step_${index + 1}`),
    requiredSkills: [...new Set(ensureArray(src.requiredSkills).map(String).filter(Boolean))],
    requiredMcpTools: [...new Set(ensureArray(src.requiredMcpTools).map(String).filter(Boolean))],
    previousTaskId: textOr(src.previousTaskId), previousFingerprint: textOr(src.previousFingerprint),
    promptDiff: textOr(src.promptDiff),
  };
}
function classifyRisk(input = {}) {
  const tasks = ensureArray(input.tasks);
  const flags = [];
  if (tasks.length > 1) flags.push('multiple_tasks');
  if (input.clientVisible === true) flags.push('client_visible');
  if (input.externalImpact === true) flags.push('external_impact');
  if (input.sensitiveData === true) flags.push('sensitive_data');
  if (input.irreversible === true) flags.push('irreversible_change');
  if (Number(input.estimatedTokens || input.budget?.maxTokens) > 60000) flags.push('high_budget');
  if (tasks.some((task) => task.reviewRequired !== false)) flags.push('human_review');
  const riskFlags = flags.filter((flag) => flag !== 'human_review');
  const level = flags.some((flag) => ['external_impact', 'sensitive_data', 'irreversible_change'].includes(flag))
    ? 'high'
    : riskFlags.length ? 'medium' : 'low';
  return { level, flags, approvalRequired: level !== 'low' };
}
function normalizeAgentRequest(raw, options = {}) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const createdAt = textOr(src.createdAt, nowIso(options));
  const status = REQUEST_STATUSES.has(textOr(src.status)) ? textOr(src.status) : 'awaiting_approval';
  return {
    id: textOr(src.id, `areq_${crypto.randomUUID()}`),
    title: textOr(src.title, 'Pedido ao agente'), requestMarkdown: textOr(src.requestMarkdown || src.request),
    desiredOutcomeMarkdown: textOr(src.desiredOutcomeMarkdown || src.desiredOutcome),
    agentId: textOr(src.agentId), agentType: textOr(src.agentType),
    deliveryStageId: textOr(src.deliveryStageId || src.stageId, workItems.UNCLASSIFIED_STAGE_ID),
    planPhaseId: textOr(src.planPhaseId), sourceRefs: workItems.normalizeSourceRefs(src.sourceRefs),
    risk: src.risk && typeof src.risk === 'object' ? src.risk : { level: 'medium', flags: [], approvalRequired: true },
    status, approval: src.approval && typeof src.approval === 'object' ? src.approval : null,
    version: Math.max(1, Number(src.version) || 1),
    planVersions: ensureArray(src.planVersions), taskIds: ensureArray(src.taskIds).map(String).filter(Boolean),
    executionPlanId: textOr(src.executionPlanId), idempotencyKey: textOr(src.idempotencyKey),
    runtimeConfig: src.runtimeConfig && typeof src.runtimeConfig === 'object' ? src.runtimeConfig : {},
    requestKind: textOr(src.requestKind), transitionKey: textOr(src.transitionKey),
    transitionConfigVersion: Math.max(0, Number(src.transitionConfigVersion) || 0),
    configSnapshot: src.configSnapshot && typeof src.configSnapshot === 'object' ? src.configSnapshot : {},
    configFingerprint: textOr(src.configFingerprint), inputSnapshot: src.inputSnapshot && typeof src.inputSnapshot === 'object' ? src.inputSnapshot : {},
    inputFingerprint: textOr(src.inputFingerprint), baselineRequestId: textOr(src.baselineRequestId),
    regenerationMode: ['affected', 'full'].includes(textOr(src.regenerationMode)) ? textOr(src.regenerationMode) : 'full',
    parentTaskId: textOr(src.parentTaskId), diffSummary: src.diffSummary && typeof src.diffSummary === 'object' ? src.diffSummary : {},
    supersedesRequestId: textOr(src.supersedesRequestId), supersededByRequestId: textOr(src.supersededByRequestId),
    createdAt, updatedAt: textOr(src.updatedAt, createdAt), createdBy: textOr(src.createdBy),
  };
}
function getAgentRequests(project) {
  return ensureArray(project?.agentRequests).map((entry) => normalizeAgentRequest(entry));
}
function requestSummary(request, tasks) {
  const executable = tasks.filter((task) => task.taskRole !== 'coordination');
  const completed = executable.filter((task) => workItems.isTerminalStatus(task.status)).length;
  const attention = executable.filter((task) => ['waiting_input', 'waiting_review', 'failed', 'blocked'].includes(task.status)).length;
  const current = executable.find((task) => task.status === 'in_progress')
    || executable.find((task) => ['waiting_input', 'waiting_review', 'failed', 'blocked'].includes(task.status))
    || executable.find((task) => task.status === 'ready') || executable[0] || null;
  return { ...request, taskCount: executable.length, completedTaskCount: completed, attentionCount: attention, currentTaskId: current?.id || '', parentTaskId: request.parentTaskId || tasks.find((task) => task.taskRole === 'coordination')?.id || '' };
}
function createAgentRequest(project, input = {}, options = {}) {
  const createdAt = nowIso(options);
  const actorUserId = textOr(options.actorUserId, 'system');
  const planTasks = ensureArray(input.tasks).map(normalizePlanTask);
  if (!planTasks.length) {
    planTasks.push(normalizePlanTask({
      id: 'work', title: input.title || `Executar ${input.agentType || 'pedido do agente'}`,
      instruction: input.requestMarkdown || input.request || input.prompt,
      expectedOutput: input.desiredOutcomeMarkdown || input.targetOutput,
      reviewRequired: input.reviewRequired !== false,
    }, 0));
  }
  const idempotencyKey = textOr(input.idempotencyKey, hash(JSON.stringify({
    actorUserId, agentType: input.agentType, request: input.requestMarkdown || input.request || input.prompt,
    stage: input.deliveryStageId || input.stageId, tasks: planTasks.map((task) => [task.id, task.title]),
  })));
  const existingRequest = getAgentRequests(project).find((entry) => entry.idempotencyKey === idempotencyKey
    && !['completed', 'failed', 'cancelled'].includes(entry.status));
  if (existingRequest) {
    const tasks = workItems.getWorkItems(project).filter((item) => item.agentRequestId === existingRequest.id);
    return { request: requestSummary(existingRequest, tasks), tasks, created: false };
  }

  const risk = classifyRisk({ ...input, tasks: planTasks });
  const requestId = `areq_${crypto.randomUUID()}`;
  const requestStatus = risk.approvalRequired ? 'awaiting_approval' : 'ready';
  const workItemIds = new Map(planTasks.map((task) => [task.id, `witem_${crypto.randomUUID()}`]));
  const parentTaskId = input.createCoordinationParent === true ? `witem_${crypto.randomUUID()}` : '';
  const tasks = planTasks.map((task, index) => workItems.normalizeWorkItem({
    id: workItemIds.get(task.id), origin: 'agent', executorMode: 'agent',
    title: task.title, descriptionMarkdown: task.instruction || 'Executar o trabalho delegado e produzir o resultado esperado.',
    acceptanceCriteriaMarkdown: task.expectedOutput ? `Entregar: ${task.expectedOutput}` : 'O resultado esperado foi produzido e ficou rastreável.',
    complexity: planTasks.length > 3 ? 'high' : planTasks.length > 1 ? 'medium' : 'low',
    priority: textOr(input.priority, 'medium'), status: requestStatus === 'ready' && !task.dependsOn.length ? 'ready' : 'planned',
    deliveryStageId: textOr(input.deliveryStageId || input.stageId, workItems.UNCLASSIFIED_STAGE_ID),
    planPhaseId: task.phaseId || textOr(input.planPhaseId),
    parentTaskId, taskRole: 'execution', stableTaskKey: task.stableTaskKey,
    previousTaskId: task.previousTaskId, requiredSkills: task.requiredSkills, requiredMcpTools: task.requiredMcpTools,
    executionSettings: input.executionSettings || { ...(input.options || {}), ...(input.budget || {}) },
    agentId: task.agentId || textOr(input.agentId || input.agentType), agentType: textOr(input.agentType),
    executionPlanId: textOr(input.executionPlanId), executionPlanTaskId: input.executionPlanId ? task.id : '',
    externalRefs: input.executionPlanId ? [{ source: 'execution_plan', planId: input.executionPlanId, taskId: task.id }] : [],
    agentRequestId: requestId, reviewRequired: task.reviewRequired,
    dependencyTaskIds: task.dependsOn.map((id) => workItemIds.get(id)).filter(Boolean),
    linkedRequirementIds: task.requirementIds,
    sourceRefs: [
      ...workItems.normalizeSourceRefs(input.sourceRefs),
      { type: 'agent_request', id: requestId, label: textOr(input.title, 'Pedido ao agente') },
      ...(input.executionPlanId ? [{ type: 'execution_plan_task', id: `${input.executionPlanId}:${task.id}`, label: task.title }] : []),
    ],
    expectedOutputs: [{ kind: textOr(input.targetOutput, 'artifact'), label: task.expectedOutput || 'Resultado da tarefa', required: true, applyMode: task.reviewRequired ? 'review' : 'automatic' }],
    executionPackage: {
      version: 1, objective: task.title, instructions: task.instruction,
      contextMarkdown: textOr(input.contextMarkdown), outputFormat: task.outputSchema || task.expectedOutput,
      acceptanceCriteriaMarkdown: task.expectedOutput, createdAt, createdBy: actorUserId,
      fingerprint: hash(task.instruction), previousFingerprint: task.previousFingerprint,
      previousTaskId: task.previousTaskId, promptDiff: task.promptDiff,
    },
    nextTaskId: workItemIds.get(planTasks[index + 1]?.id) || '',
    currentAction: requestStatus === 'awaiting_approval' ? 'A aguardar aprovação do plano.' : 'Pronta para começar.',
    taskActivity: [{ type: 'planned', message: 'Tarefa criada antes da execução do agente.', actorType: 'platform', actorId: actorUserId, createdAt }],
    createdAt, updatedAt: createdAt, createdBy: actorUserId, updatedBy: actorUserId,
  }, { project, actorUserId, nowIso: () => createdAt }));
  if (parentTaskId) {
    const parent = workItems.normalizeWorkItem({
      id: parentTaskId, origin: 'agent', executorMode: 'agent', taskRole: 'coordination',
      stableTaskKey: `request:${requestId}`, title: textOr(input.title, `Pedido: ${textOr(input.agentType, 'agente')}`),
      descriptionMarkdown: textOr(input.requestMarkdown || input.request, 'Coordenar o pedido e os resultados das subtarefas.'),
      acceptanceCriteriaMarkdown: textOr(input.desiredOutcomeMarkdown || input.targetOutput, 'Todas as subtarefas foram revistas e aprovadas.'),
      complexity: planTasks.length > 3 ? 'high' : 'medium', priority: textOr(input.priority, 'medium'),
      status: requestStatus === 'ready' ? 'ready' : 'planned', deliveryStageId: textOr(input.deliveryStageId || input.stageId, workItems.UNCLASSIFIED_STAGE_ID),
      planPhaseId: textOr(input.planPhaseId), agentId: textOr(input.agentId || input.agentType), agentType: textOr(input.agentType),
      agentRequestId: requestId, reviewRequired: true, requiredSkills: [...new Set(planTasks.flatMap((task) => task.requiredSkills))],
      requiredMcpTools: [...new Set(planTasks.flatMap((task) => task.requiredMcpTools))],
      executionSettings: input.executionSettings || { ...(input.options || {}), ...(input.budget || {}) },
      sourceRefs: [...workItems.normalizeSourceRefs(input.sourceRefs), { type: 'agent_request', id: requestId, label: textOr(input.title, 'Pedido ao agente') }],
      executionPackage: { version: 1, objective: textOr(input.title), instructions: textOr(input.requestMarkdown || input.request), contextMarkdown: textOr(input.contextMarkdown), outputFormat: 'JSON taskOutputs[] por taskId e packageVersion.', acceptanceCriteriaMarkdown: textOr(input.desiredOutcomeMarkdown), createdAt, createdBy: actorUserId, fingerprint: hash(planTasks.map((task) => task.instruction).join('\n')) },
      currentAction: requestStatus === 'awaiting_approval' ? 'A aguardar aprovação do plano.' : 'Escolha execução manual ou ligue um agente.',
      taskActivity: [{ type: 'planned', message: 'Tarefa de coordenação criada com as subtarefas.', actorType: 'platform', actorId: actorUserId, createdAt }],
      createdAt, updatedAt: createdAt, createdBy: actorUserId, updatedBy: actorUserId,
    }, { project, actorUserId, nowIso: () => createdAt });
    tasks.unshift(parent);
  }
  tasks.forEach((task) => workItems.validateDependencies(task, tasks));

  const request = normalizeAgentRequest({
    id: requestId, title: textOr(input.title, planTasks.length > 1 ? `Plano: ${textOr(input.agentType, 'agente')}` : planTasks[0].title),
    requestMarkdown: textOr(input.requestMarkdown || input.request || input.prompt, planTasks.map((task) => task.instruction).filter(Boolean).join('\n\n')),
    desiredOutcomeMarkdown: textOr(input.desiredOutcomeMarkdown || input.targetOutput, 'Produzir os outputs definidos nas tarefas.'),
    agentId: textOr(input.agentId || input.agentType), agentType: textOr(input.agentType),
    deliveryStageId: textOr(input.deliveryStageId || input.stageId, workItems.UNCLASSIFIED_STAGE_ID),
    planPhaseId: textOr(input.planPhaseId), sourceRefs: input.sourceRefs, risk, status: requestStatus,
    taskIds: tasks.map((task) => task.id), parentTaskId, executionPlanId: textOr(input.executionPlanId),
    runtimeConfig: { options: input.options && typeof input.options === 'object' ? input.options : {}, budget: input.budget && typeof input.budget === 'object' ? input.budget : {} },
    idempotencyKey, createdAt, updatedAt: createdAt, createdBy: actorUserId,
    requestKind: input.requestKind, transitionKey: input.transitionKey, transitionConfigVersion: input.transitionConfigVersion,
    configSnapshot: input.configSnapshot, configFingerprint: input.configFingerprint,
    inputSnapshot: input.inputSnapshot, inputFingerprint: input.inputFingerprint,
    baselineRequestId: input.baselineRequestId, regenerationMode: input.regenerationMode,
    diffSummary: input.diffSummary, supersedesRequestId: input.supersedesRequestId,
    planVersions: [{ version: 1, taskIds: tasks.map((task) => task.id), createdAt, createdBy: actorUserId }],
  }, { nowIso: () => createdAt });
  project.agentRequests = [request, ...getAgentRequests(project)].slice(0, 500);
  workItems.setWorkItems(project, [...tasks, ...workItems.getWorkItems(project)]);
  project.agentRequestsSchemaVersion = 1;
  return { request: requestSummary(request, tasks), tasks, created: true };
}
function approveAgentRequest(project, requestId, actorUserId, options = {}) {
  const requests = getAgentRequests(project);
  const request = requests.find((entry) => entry.id === requestId);
  if (!request) throw new Error('Pedido do agente nao encontrado.');
  if (!['awaiting_approval', 'revision_requested', 'ready'].includes(request.status)) throw new Error('Este plano ja nao pode ser aprovado.');
  const at = nowIso(options);
  request.status = 'ready'; request.updatedAt = at;
  request.approval = { status: 'approved', approvedAt: at, approvedBy: actorUserId, version: request.version };
  const all = workItems.getWorkItems(project);
  const requestTasks = all.filter((task) => task.agentRequestId === requestId);
  const completed = new Set(requestTasks.filter((task) => workItems.isTerminalStatus(task.status)).map((task) => task.id));
  const next = all.map((task) => {
    if (task.agentRequestId !== requestId || workItems.isTerminalStatus(task.status)) return task;
    const ready = task.dependencyTaskIds.every((id) => completed.has(id));
    return workItems.normalizeWorkItem({
      ...task, status: ready ? 'ready' : 'planned',
      currentAction: ready ? 'Pronta para começar.' : 'A aguardar tarefas anteriores.',
      taskActivity: [...task.taskActivity, { type: 'plan_approved', message: 'Plano aprovado. A tarefa pode ser executada quando as dependências estiverem concluídas.', actorType: 'human', actorId: actorUserId, createdAt: at }],
      updatedAt: at, updatedBy: actorUserId,
    }, { project });
  });
  project.agentRequests = requests;
  workItems.setWorkItems(project, next);
  return { request: requestSummary(request, next.filter((task) => task.agentRequestId === requestId)), tasks: next.filter((task) => task.agentRequestId === requestId) };
}
function requestPlanRevision(project, requestId, feedbackMarkdown, actorUserId, options = {}) {
  const requests = getAgentRequests(project);
  const request = requests.find((entry) => entry.id === requestId);
  if (!request) throw new Error('Pedido do agente nao encontrado.');
  const feedback = textOr(feedbackMarkdown);
  if (!feedback) throw new Error('Explique o que deve ser alterado no plano.');
  const at = nowIso(options);
  request.status = 'revision_requested'; request.approval = null; request.updatedAt = at;
  request.planVersions.push({ version: request.version, feedbackMarkdown: feedback, requestedAt: at, requestedBy: actorUserId });
  project.agentRequests = requests;
  return request;
}
function migrateAgentRequests(project) {
  if (!project || typeof project !== 'object') return { changed: false, requests: [] };
  const before = JSON.stringify(ensureArray(project.agentRequests));
  let tasks = workItems.getWorkItems(project);
  let tasksChanged = false;
  tasks = tasks.map((task) => {
    if (task.origin !== 'agent' || task.agentRequestId) return task;
    const sourceKey = task.executionPlanId || task.agentJobId || task.promptRunId || task.id;
    tasksChanged = true;
    return workItems.normalizeWorkItem({
      ...task, agentRequestId: `areq_migrated_${hash(sourceKey)}`,
      sourceRefs: [...task.sourceRefs, { type: 'agent_request', id: `areq_migrated_${hash(sourceKey)}`, label: 'Execucao historica' }],
    }, { project });
  });
  for (const job of ensureArray(project.agentJobs)) {
    if (!job?.id || tasks.some((task) => task.agentJobId === job.id || (job.promptRunId && task.promptRunId === job.promptRunId))) continue;
    const requestId = `areq_migrated_${hash(job.id)}`;
    const status = ['completed', 'pending_human_review'].includes(textOr(job.status))
      ? (job.status === 'pending_human_review' ? 'waiting_review' : 'completed')
      : ['failed', 'cancelled'].includes(textOr(job.status)) ? 'failed'
        : ['paused'].includes(textOr(job.status)) ? 'waiting_input' : 'in_progress';
    tasks.push(workItems.normalizeWorkItem({
      id: `witem_migrated_${hash(job.id)}`, origin: 'agent', executorMode: 'agent',
      title: `Execucao: ${textOr(job.agentType || job.agentId, 'agente')}`,
      descriptionMarkdown: 'Tarefa reconstruida a partir de uma execucao historica do agente.',
      acceptanceCriteriaMarkdown: 'O resultado da execucao ficou ligado ao historico do projecto.',
      complexity: 'medium', status, deliveryStageId: textOr(job.runtimeOptions?.stageId, workItems.UNCLASSIFIED_STAGE_ID),
      agentId: textOr(job.agentId), agentType: textOr(job.agentType), agentRequestId: requestId,
      agentJobId: job.id, promptRunId: textOr(job.promptRunId), agentStatus: textOr(job.status),
      externalRefs: [{ source: 'agent_job', jobId: job.id, promptRunId: textOr(job.promptRunId) }],
      sourceRefs: [{ type: 'agent_job', id: job.id, label: 'Execucao historica' }, { type: 'agent_request', id: requestId, label: 'Execucao historica' }],
      reviewRequired: job.status === 'pending_human_review', createdAt: job.createdAt, updatedAt: job.updatedAt,
      createdBy: textOr(job.createdBy, 'migration'), updatedBy: 'migration',
    }, { project }));
    tasksChanged = true;
  }
  if (tasksChanged) workItems.setWorkItems(project, tasks.slice(0, 2000));
  const requests = getAgentRequests(project);
  const byRequest = new Map(requests.map((request) => [request.id, request]));
  for (const task of workItems.getWorkItems(project)) {
    if (!task.agentRequestId || byRequest.has(task.agentRequestId)) continue;
    const request = normalizeAgentRequest({
      id: task.agentRequestId, title: task.title, requestMarkdown: task.descriptionMarkdown,
      desiredOutcomeMarkdown: task.acceptanceCriteriaMarkdown, agentId: task.agentId,
      agentType: task.agentType, deliveryStageId: task.deliveryStageId,
      status: workItems.isTerminalStatus(task.status) ? 'completed' : task.status === 'in_progress' ? 'running' : 'ready',
      taskIds: [task.id], createdAt: task.createdAt, updatedAt: task.updatedAt, createdBy: task.createdBy,
      risk: { level: 'medium', flags: ['migrated'], approvalRequired: false },
    });
    requests.push(request); byRequest.set(request.id, request);
  }
  project.agentRequests = requests.slice(0, 500);
  project.agentRequestsSchemaVersion = 1;
  return { changed: tasksChanged || before !== JSON.stringify(project.agentRequests), requests: project.agentRequests };
}

module.exports = {
  REQUEST_STATUSES, normalizeAgentRequest, normalizePlanTask, getAgentRequests,
  classifyRisk, createAgentRequest, approveAgentRequest, requestPlanRevision,
  requestSummary, migrateAgentRequests,
};
