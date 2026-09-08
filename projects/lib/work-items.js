/** Tasks — canonical project work model. */
const crypto = require('crypto');

const WORK_ITEMS_SCHEMA_VERSION = 5;
const UNCLASSIFIED_STAGE_ID = 'unclassified';
const ORIGINS = new Set(['human', 'agent', 'platform']);
const EXECUTOR_MODES = new Set(['human', 'agent', 'both']);
const STATUSES = new Set([
  'planned', 'ready', 'in_progress', 'waiting_input', 'waiting_review',
  'completed', 'failed', 'blocked', 'cancelled',
]);
const COMPLEXITIES = new Set(['low', 'medium', 'high']);
const PRIORITIES = new Set(['low', 'medium', 'high', '']);
const STATUS_ALIASES = {
  new: 'planned', todo: 'planned', pending: 'ready',
  active: 'in_progress', running: 'in_progress', executing: 'in_progress',
  pending_review: 'waiting_review', pending_human_review: 'waiting_review',
  paused: 'waiting_input', closed: 'completed', resolved: 'completed',
  done: 'completed', complete: 'completed', canceled: 'cancelled', superseded: 'cancelled',
};

function ensureArray(value) { return Array.isArray(value) ? value : []; }
function textOr(value, fallback = '') {
  const v = value === null || value === undefined ? '' : String(value).trim();
  return v || fallback;
}
function normalizeStatus(raw) {
  const value = textOr(raw, 'planned').toLowerCase();
  return STATUSES.has(value) ? value : (STATUS_ALIASES[value] || 'planned');
}
function normalizeOrigin(raw) {
  const value = textOr(raw, 'human').toLowerCase();
  return ORIGINS.has(value) ? value : 'human';
}
function normalizeExecutorMode(raw, origin = 'human') {
  const value = textOr(raw).toLowerCase();
  return EXECUTOR_MODES.has(value) ? value : (origin === 'agent' ? 'agent' : 'human');
}
function normalizeComplexity(raw) {
  const value = textOr(raw).toLowerCase();
  return COMPLEXITIES.has(value) ? value : '';
}
function normalizePriority(raw) {
  const value = textOr(raw).toLowerCase();
  return PRIORITIES.has(value) ? value : '';
}
function normalizeUpdate(raw, options = {}) {
  const bodyMarkdown = textOr(raw?.bodyMarkdown || raw?.body);
  if (!bodyMarkdown) return null;
  const now = options.nowIso ? options.nowIso() : new Date().toISOString();
  const actor = textOr(options.actorUserId);
  return {
    id: textOr(raw?.id, `wup_${crypto.randomUUID()}`), bodyMarkdown,
    createdAt: textOr(raw?.createdAt, now), updatedAt: textOr(raw?.updatedAt, now),
    createdBy: textOr(raw?.createdBy, actor), updatedBy: textOr(raw?.updatedBy, actor),
  };
}
function normalizeUpdates(list, options = {}) {
  return ensureArray(list).map((entry) => normalizeUpdate(entry, options)).filter(Boolean);
}
function normalizeExternalRefs(raw) {
  return ensureArray(raw).map((ref) => {
    const source = textOr(ref?.source);
    if (!source) return null;
    return { source, planId: textOr(ref?.planId), taskId: textOr(ref?.taskId), jobId: textOr(ref?.jobId), promptRunId: textOr(ref?.promptRunId) };
  }).filter(Boolean);
}
function normalizeSourceRefs(raw, requirementIds = []) {
  const refs = ensureArray(raw).map((ref) => {
    const type = textOr(ref?.type || ref?.source).toLowerCase();
    const id = textOr(ref?.id || ref?.taskId || ref?.jobId || ref?.planId);
    if (!type || !id) return null;
    return { type, id, label: textOr(ref?.label), relation: textOr(ref?.relation, 'origin') };
  }).filter(Boolean);
  ensureArray(requirementIds).map(String).filter(Boolean).forEach((id) => {
    if (!refs.some((ref) => ref.type === 'requirement' && ref.id === id)) refs.push({ type: 'requirement', id, label: '', relation: 'origin' });
  });
  const seen = new Set();
  return refs.filter((ref) => {
    const key = `${ref.type}:${ref.id}:${ref.relation}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function normalizeDependencyIds(raw) {
  return [...new Set(ensureArray(raw).map(String).map((value) => value.trim()).filter(Boolean))];
}
function normalizeExpectedOutputs(raw) {
  return ensureArray(raw).map((entry, index) => {
    const src = entry && typeof entry === 'object' ? entry : { label: entry };
    const label = textOr(src.label || src.title || src.kind, `Resultado ${index + 1}`);
    return {
      id: textOr(src.id, `out_${crypto.randomUUID()}`),
      kind: textOr(src.kind || src.type, 'artifact'), label,
      schemaVersion: textOr(src.schemaVersion), targetType: textOr(src.targetType),
      targetId: textOr(src.targetId), applyMode: textOr(src.applyMode, 'review'),
      required: src.required !== false, status: textOr(src.status, 'expected'),
      artifactId: textOr(src.artifactId), summaryMarkdown: textOr(src.summaryMarkdown),
    };
  });
}
function normalizeExecutionPackage(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  if (!Object.keys(src).length) return null;
  return {
    version: Math.max(1, Number(src.version) || 1),
    objective: textOr(src.objective), instructions: textOr(src.instructions || src.prompt),
    contextMarkdown: textOr(src.contextMarkdown), outputFormat: textOr(src.outputFormat || src.outputSchema),
    acceptanceCriteriaMarkdown: textOr(src.acceptanceCriteriaMarkdown),
    createdAt: textOr(src.createdAt), createdBy: textOr(src.createdBy),
    fingerprint: textOr(src.fingerprint), previousFingerprint: textOr(src.previousFingerprint),
    previousTaskId: textOr(src.previousTaskId), promptDiff: textOr(src.promptDiff),
  };
}
function normalizeAttempt(raw, options = {}) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const now = options.nowIso ? options.nowIso() : new Date().toISOString();
  return {
    id: textOr(src.id, `attempt_${crypto.randomUUID()}`),
    number: Math.max(1, Number(src.number) || 1), source: textOr(src.source, 'runtime'),
    status: textOr(src.status, 'planned'), agentJobId: textOr(src.agentJobId),
    promptRunId: textOr(src.promptRunId), submittedBy: textOr(src.submittedBy),
    feedbackMarkdown: textOr(src.feedbackMarkdown),
    rawOutput: src.rawOutput === null || src.rawOutput === undefined ? '' : String(src.rawOutput),
    resultSummaryMarkdown: textOr(src.resultSummaryMarkdown),
    createdAt: textOr(src.createdAt, now), startedAt: textOr(src.startedAt),
    completedAt: textOr(src.completedAt), updatedAt: textOr(src.updatedAt, now),
    connectionState: textOr(src.connectionState), selectedAgentId: textOr(src.selectedAgentId),
    contextSnapshotHash: textOr(src.contextSnapshotHash), packageVersion: Math.max(1, Number(src.packageVersion) || 1),
    idempotencyKey: textOr(src.idempotencyKey), requiredSkills: normalizeStringList(src.requiredSkills),
    requiredMcpTools: normalizeStringList(src.requiredMcpTools), executionSettings: normalizeExecutionSettings(src.executionSettings),
  };
}
function normalizeTaskActivity(raw, options = {}) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const message = textOr(src.message || src.summary);
  if (!message) return null;
  const now = options.nowIso ? options.nowIso() : new Date().toISOString();
  return {
    id: textOr(src.id, `tevt_${crypto.randomUUID()}`), type: textOr(src.type, 'update'),
    message, actorType: textOr(src.actorType, 'human'), actorId: textOr(src.actorId),
    visibility: textOr(src.visibility, 'project'), createdAt: textOr(src.createdAt, now),
    metadata: src.metadata && typeof src.metadata === 'object' ? src.metadata : {},
  };
}
function normalizeStringList(raw) {
  return [...new Set(ensureArray(raw).map(String).map((entry) => entry.trim()).filter(Boolean))];
}
function normalizeLimitPolicy(raw, defaults = {}) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const mode = src.mode === 'limited' ? 'limited' : (src.mode === 'unlimited' ? 'unlimited' : defaults.mode || 'unlimited');
  const maxTokens = Math.max(0, Number(src.maxTokens ?? defaults.maxTokens) || 0);
  return { mode, ...(mode === 'limited' ? { maxTokens } : {}) };
}
function normalizeExecutionSettings(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const legacyTokenMode = src.tokenBudgetMode === 'limited' ? 'limited' : 'unlimited';
  const tokenPolicy = {
    local: normalizeLimitPolicy(src.tokenPolicy?.local, {
      mode: legacyTokenMode,
      maxTokens: src.maxTokens,
    }),
    external: normalizeLimitPolicy(src.tokenPolicy?.external, {
      mode: src.externalTokenBudgetMode === 'unlimited' ? 'unlimited' : 'limited',
      maxTokens: src.externalMaxTokens || src.maxTokens || 120000,
    }),
  };
  const maxWallClockMinutes = Math.max(
    0,
    Number(src.timePolicy?.maxWallClockMinutes ?? src.maxWallClockMinutes) || 0
  );
  const timeLimitEnforced = (
    src.timePolicy?.enforced === true || src.timeLimitEnabled === true
  ) && maxWallClockMinutes > 0;
  const timeMode = timeLimitEnforced ? 'limited' : 'unlimited';
  const planningWaveSize = Math.max(1, Number(src.planningWaveSize || src.maxSubtasks) || 8);
  const checkpointIntervalSeconds = Math.max(
    10,
    Math.min(3600, Number(src.checkpointPolicy?.intervalSeconds ?? src.checkpointIntervalSeconds) || 30)
  );
  const maxCost = Math.max(0, Number(src.costPolicy?.maxCost ?? src.maxCost) || 0);
  return {
    schemaVersion: 2,
    version: Math.max(1, Number(src.version) || 1), agentId: textOr(src.agentId),
    modelProfileId: textOr(src.modelProfileId, 'medium'),
    targetInputTokens: Math.max(0, Number(src.targetInputTokens) || 0),
    targetOutputTokens: Math.max(0, Number(src.targetOutputTokens) || 0),
    tokenPolicy,
    tokenBudgetMode: tokenPolicy.local.mode === 'limited' ? 'limited' : 'auto',
    externalTokenBudgetMode: tokenPolicy.external.mode,
    externalMaxTokens: tokenPolicy.external.mode === 'limited' ? tokenPolicy.external.maxTokens : 0,
    costPolicy: {
      mode: src.costPolicy?.mode === 'limited' || maxCost > 0 ? 'limited' : 'unlimited',
      maxCost,
      currency: textOr(src.costPolicy?.currency, 'EUR'),
      onLimit: 'checkpoint_pause',
    },
    timePolicy: {
      mode: timeMode,
      enforced: timeLimitEnforced,
      ...(timeMode === 'limited' ? { maxWallClockMinutes } : {}),
      onLimit: 'best_effort_review',
    },
    checkpointPolicy: {
      intervalSeconds: checkpointIntervalSeconds,
      onStep: src.checkpointPolicy?.onStep !== false,
      beforeSideEffect: src.checkpointPolicy?.beforeSideEffect !== false,
    },
    resumePolicy: {
      autoOnRestart: src.resumePolicy?.autoOnRestart !== false,
      autoOnReconnect: src.resumePolicy?.autoOnReconnect !== false,
      autoAfterWindow: src.resumePolicy?.autoAfterWindow === true,
      requireApprovalForRisk: src.resumePolicy?.requireApprovalForRisk !== false,
    },
    reviewPolicy: {
      subtask: src.reviewPolicy?.subtask === 'blocking' || src.pauseForSubtaskReview === true
        ? 'blocking'
        : 'non_blocking',
      parent: 'required',
    },
    pauseForSubtaskReview: src.reviewPolicy?.subtask === 'blocking'
      || src.pauseForSubtaskReview === true,
    goalPolicy: {
      checkEverySteps: Math.max(1, Math.min(10, Number(src.goalPolicy?.checkEverySteps || src.goalCheckInterval) || 3)),
      maxNoProgressIterations: Math.max(1, Math.min(20, Number(src.goalPolicy?.maxNoProgressIterations) || 3)),
      stopWhenAcceptanceSatisfied: src.goalPolicy?.stopWhenAcceptanceSatisfied !== false,
    },
    providerRouting: src.providerRouting && typeof src.providerRouting === 'object'
      ? src.providerRouting
      : {
        classifier: 'small',
        goalSetter: 'medium',
        planner: 'medium',
        requirements: 'medium',
        researcher: 'high',
        coder: 'high',
        reviewer: 'max',
      },
    planningWaveSize,
    maxTotalSteps: Math.max(0, Number(src.maxTotalSteps) || 0),
    goalCheckInterval: Math.max(1, Math.min(10, Number(src.goalCheckInterval) || 3)),
    maxTokens: tokenPolicy.local.mode === 'limited' ? tokenPolicy.local.maxTokens : 0,
    maxWallClockMinutes: timeMode === 'limited' ? maxWallClockMinutes : 0,
    timeLimitEnabled: timeLimitEnforced,
    maxSubtasks: planningWaveSize,
    enableWebSearch: src.enableWebSearch !== false,
    allowedMcpTools: normalizeStringList(src.allowedMcpTools),
  };
}
function stableKeysForWorkItem(item) {
  if (!item) return [];
  return [...new Set([
    item.id ? `work_item:${item.id}` : '',
    ...ensureArray(item.sourceRefs).map((ref) => `source:${sourceRefKey(ref)}`),
    ...ensureArray(item.externalRefs).map((ref) => `external:${externalRefKey(ref)}`),
  ].filter((key) => key && !key.endsWith(':')))];
}
function normalizeWorkItemTombstone(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const keys = normalizeStringList(src.keys);
  if (!keys.length) return null;
  return {
    id: textOr(src.id, `wtomb_${crypto.randomUUID()}`),
    workItemId: textOr(src.workItemId),
    keys,
    title: textOr(src.title),
    deletedAt: textOr(src.deletedAt, new Date().toISOString()),
    deletedBy: textOr(src.deletedBy),
    reason: textOr(src.reason),
  };
}
function getWorkItemTombstones(project) {
  return ensureArray(project?.workItemTombstones)
    .map(normalizeWorkItemTombstone)
    .filter(Boolean);
}
function isWorkItemTombstoned(project, item) {
  const keys = new Set(stableKeysForWorkItem(item));
  return keys.size > 0 && getWorkItemTombstones(project)
    .some((tombstone) => tombstone.keys.some((key) => keys.has(key)));
}
function addWorkItemTombstone(project, item, options = {}) {
  const tombstone = normalizeWorkItemTombstone({
    workItemId: item?.id,
    keys: stableKeysForWorkItem(item),
    title: item?.title,
    deletedAt: options.deletedAt,
    deletedBy: options.deletedBy,
    reason: options.reason,
  });
  if (!tombstone) return null;
  const current = getWorkItemTombstones(project)
    .filter((entry) => !entry.keys.some((key) => tombstone.keys.includes(key)));
  project.workItemTombstones = [tombstone, ...current].slice(0, 5000);
  return tombstone;
}
function restoreWorkItemTombstone(project, tombstoneId) {
  const before = getWorkItemTombstones(project);
  const restored = before.find((entry) => entry.id === tombstoneId) || null;
  project.workItemTombstones = before.filter((entry) => entry.id !== tombstoneId);
  return restored;
}
function syncDenormalizedAgentFields(item) {
  const planRef = ensureArray(item.externalRefs).find((ref) => ref.source === 'execution_plan');
  const jobRef = ensureArray(item.externalRefs).find((ref) => ref.source === 'agent_job');
  if (planRef) {
    item.executionPlanId = planRef.planId || item.executionPlanId || '';
    item.executionPlanTaskId = planRef.taskId || item.executionPlanTaskId || '';
  }
  if (jobRef) item.agentJobId = jobRef.jobId || item.agentJobId || '';
  return item;
}
function normalizeWorkItem(raw, options = {}) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const actor = textOr(options.actorUserId);
  const now = options.nowIso ? options.nowIso() : new Date().toISOString();
  const origin = normalizeOrigin(src.origin);
  const linkedRequirementIds = ensureArray(src.linkedRequirementIds).map(String).filter(Boolean);
  const externalRefs = normalizeExternalRefs(src.externalRefs);
  const legacyRefs = externalRefs.map((ref) => {
    if (ref.source === 'execution_plan' && ref.planId && ref.taskId) return { type: 'execution_plan_task', id: `${ref.planId}:${ref.taskId}` };
    if (ref.source === 'agent_job' && ref.jobId) return { type: 'agent_job', id: ref.jobId };
    return null;
  }).filter(Boolean);
  const item = syncDenormalizedAgentFields({
    id: textOr(src.id, `witem_${crypto.randomUUID()}`), origin,
    executorMode: normalizeExecutorMode(src.executorMode, origin),
    title: textOr(src.title), descriptionMarkdown: textOr(src.descriptionMarkdown || src.description),
    acceptanceCriteriaMarkdown: textOr(src.acceptanceCriteriaMarkdown), complexity: normalizeComplexity(src.complexity),
    status: normalizeStatus(src.status), priority: normalizePriority(src.priority),
    assigneeUserId: textOr(src.assigneeUserId), approverUserId: textOr(src.approverUserId),
    agentId: textOr(src.agentId || src.agentType), deliveryStageId: textOr(src.deliveryStageId || src.stageId, UNCLASSIFIED_STAGE_ID),
    planPhaseId: textOr(src.planPhaseId || src.roadmapPhaseId), parentTaskId: textOr(src.parentTaskId),
    taskRole: ['coordination', 'execution'].includes(textOr(src.taskRole)) ? textOr(src.taskRole) : 'execution',
    stableTaskKey: textOr(src.stableTaskKey), previousTaskId: textOr(src.previousTaskId),
    requiredSkills: normalizeStringList(src.requiredSkills), requiredMcpTools: normalizeStringList(src.requiredMcpTools),
    executionSettings: normalizeExecutionSettings(src.executionSettings),
    linkedRequirementIds, sourceRefs: normalizeSourceRefs([...ensureArray(src.sourceRefs), ...legacyRefs], linkedRequirementIds),
    clientVisible: src.clientVisible === true, scheduledStart: textOr(src.scheduledStart), scheduledEnd: textOr(src.scheduledEnd),
    dependencyTaskIds: normalizeDependencyIds(src.dependencyTaskIds || src.dependsOn),
    agentRequestId: textOr(src.agentRequestId), reviewRequired: src.reviewRequired === true,
    expectedOutputs: normalizeExpectedOutputs(src.expectedOutputs),
    executionPackage: normalizeExecutionPackage(src.executionPackage),
    attempts: ensureArray(src.attempts).map((attempt) => normalizeAttempt(attempt, options)),
    taskActivity: ensureArray(src.taskActivity).map((event) => normalizeTaskActivity(event, options)).filter(Boolean).slice(-300),
    currentAction: textOr(src.currentAction), lastMilestone: textOr(src.lastMilestone),
    nextTaskId: textOr(src.nextTaskId), outputArtifactRefs: normalizeSourceRefs(src.outputArtifactRefs),
    progressCurrent: Math.max(0, Number(src.progressCurrent ?? src.completedSubtasks) || 0),
    progressTotal: Math.max(0, Number(src.progressTotal ?? src.totalSubtasks) || 0),
    externalRefs, agentType: textOr(src.agentType), executionPlanId: textOr(src.executionPlanId),
    // Repository write scope for code-writing agents: which module this task owns and
    // the paths it may touch. Without these a scoped agent is refused the commit.
    moduleName: textOr(src.moduleName || src.module),
    repositoryPaths: [...new Set(ensureArray(src.repositoryPaths)
      .map((entry) => textOr(entry))
      .filter(Boolean))],
    executionPlanTaskId: textOr(src.executionPlanTaskId), agentJobId: textOr(src.agentJobId), promptRunId: textOr(src.promptRunId),
    agentStatus: textOr(src.agentStatus), resultSummaryMarkdown: textOr(src.resultSummaryMarkdown),
    automationRuleId: textOr(src.automationRuleId), updates: normalizeUpdates(src.updates, options),
    createdAt: textOr(src.createdAt, now), updatedAt: textOr(src.updatedAt, now),
    createdBy: textOr(src.createdBy, actor), updatedBy: textOr(src.updatedBy, actor),
  });
  if (options.project?.requirements?.length) {
    const valid = new Set(ensureArray(options.project.requirements).map((entry) => String(entry.id)));
    item.linkedRequirementIds = item.linkedRequirementIds.filter((id) => valid.has(id));
  }
  return item;
}
function isTerminalStatus(status) { return ['completed', 'cancelled'].includes(normalizeStatus(status)); }

const RUNNING_AGENT_STATUSES = new Set([
  'dispatching', 'queued', 'claimed', 'running', 'planning', 'researching',
  'executing', 'verifying', 'replanning', 'goal_setting', 'goal_check', 'self_review',
  'pausing', 'cancel_requested', 'reconnecting',
]);

const PAUSED_AGENT_STATUSES = new Set([
  'paused', 'waiting_input', 'budget_exhausted', 'connection_lost',
]);

const REVIEW_AGENT_STATUSES = new Set([
  'waiting_review', 'pending_human_review',
]);

function executionStatusChip(item, agentExecution = null) {
  const raw = textOr(agentExecution?.status || item?.agentStatus).toLowerCase();
  const status = normalizeStatus(item?.status);
  if (REVIEW_AGENT_STATUSES.has(raw) || status === 'waiting_review') {
    return { label: 'Aguarda revisão', tone: 'review' };
  }
  if (PAUSED_AGENT_STATUSES.has(raw) || status === 'waiting_input') {
    return { label: 'Em pausa', tone: 'paused' };
  }
  if (RUNNING_AGENT_STATUSES.has(raw) || status === 'in_progress') {
    return { label: 'A correr', tone: 'running' };
  }
  if (status === 'failed' || raw === 'failed') return { label: 'Falhou', tone: 'failed' };
  if (status === 'blocked' || raw === 'blocked') return { label: 'Bloqueada', tone: 'failed' };
  if (isTerminalStatus(status)) {
    return { label: status === 'cancelled' ? 'Cancelada' : 'Concluída', tone: 'done' };
  }
  if (status === 'ready') return { label: 'Pronta', tone: 'ready' };
  if (status === 'planned') return { label: 'Planeada', tone: 'planned' };
  return { label: status, tone: 'planned' };
}

function buildOrchestrationProjection(item, context = {}) {
  const children = ensureArray(context.children);
  const agentRequest = context.agentRequest || null;
  const agentExecution = context.agentExecution || null;
  const runtimeReachable = context.runtimeReachable !== false;
  const runtimeBlockingReason = textOr(context.runtimeBlockingReason);
  const isCoordination = item?.taskRole === 'coordination';
  const isAgentSurface = isCoordination
    || item?.origin === 'agent'
    || item?.executorMode === 'agent'
    || item?.executorMode === 'both';
  const settings = normalizeExecutionSettings(item?.executionSettings || {});
  const statusChip = executionStatusChip(item, agentExecution);
  const currentRunId = textOr(agentExecution?.runId, item?.agentJobId, item?.promptRunId);
  const rawAgentStatus = textOr(agentExecution?.status || item?.agentStatus).toLowerCase();
  const promotesToParent = Boolean(
    !isCoordination
    && item?.parentTaskId
    && settings.reviewPolicy?.subtask !== 'blocking',
  );
  const scope = isCoordination || promotesToParent ? 'tree' : 'task';

  const base = {
    availableAction: 'none',
    label: '',
    blockingReason: null,
    targetWorkItemId: item?.id || '',
    currentRunId,
    respectsPauseForSubtaskReview: settings.pauseForSubtaskReview === true,
    statusChip,
    scope,
  };

  if (!item?.id || !isAgentSurface) return base;

  if (!runtimeReachable) {
    return {
      ...base,
      blockingReason: runtimeBlockingReason || 'Agent Runtime indisponível.',
    };
  }

  if (['awaiting_approval', 'revision_requested'].includes(textOr(agentRequest?.status))) {
    return {
      ...base,
      availableAction: 'approve_plan',
      label: 'Rever e aprovar plano',
      targetWorkItemId: item.id,
    };
  }

  const status = normalizeStatus(item.status);
  if (isTerminalStatus(status)) return base;

  if (
    REVIEW_AGENT_STATUSES.has(rawAgentStatus)
    || status === 'waiting_review'
    || (isCoordination && children.some((child) => child.status === 'waiting_review'))
  ) {
    const reviewChild = children.find((child) => child.status === 'waiting_review');
    return {
      ...base,
      availableAction: 'review_results',
      label: 'Rever resultados',
      targetWorkItemId: reviewChild?.id || item.id,
    };
  }

  if (
    RUNNING_AGENT_STATUSES.has(rawAgentStatus)
    || (status === 'in_progress' && currentRunId)
  ) {
    return {
      ...base,
      availableAction: 'open_execution',
      label: 'Ver execução',
      targetWorkItemId: item.id,
    };
  }

  const needsResume = PAUSED_AGENT_STATUSES.has(rawAgentStatus)
    || ['waiting_input', 'failed', 'blocked'].includes(status)
    || ['failed', 'blocked', 'budget_exhausted', 'connection_lost', 'cancelled'].includes(rawAgentStatus);

  if (needsResume && currentRunId) {
    return {
      ...base,
      availableAction: 'resume',
      label: 'Retomar do checkpoint',
      targetWorkItemId: item.id,
    };
  }

  const hasReadyChild = children.some((child) => child.status === 'ready');
  const canStart = status === 'ready' || (isCoordination && hasReadyChild);

  if (canStart || (needsResume && !currentRunId)) {
    let label = 'Conectar agente';
    if (isCoordination) label = 'Conectar agente e executar plano';
    else if (promotesToParent || scope === 'tree') label = 'Executar plano completo';

    let blockingReason = null;
    if (isCoordination && !hasReadyChild && status !== 'ready') {
      blockingReason = 'Não existe uma subtarefa pronta. Reveja dependências ou resultados pendentes.';
    } else if (!isCoordination && status !== 'ready' && !needsResume) {
      blockingReason = 'A tarefa ainda não está pronta para execução.';
    }

    return {
      ...base,
      availableAction: blockingReason ? 'none' : 'connect_and_run',
      label: blockingReason ? '' : label,
      blockingReason,
      targetWorkItemId: item.id,
      scope,
    };
  }

  return {
    ...base,
    blockingReason: 'Nenhuma ação de execução disponível neste estado.',
  };
}
function deriveContainerStatus(children) {
  const list = ensureArray(children);
  if (!list.length || list.every((item) => item.status === 'planned')) return 'planned';
  if (list.some((item) => item.status === 'waiting_input')) return 'waiting_input';
  if (list.some((item) => item.status === 'waiting_review')) return 'waiting_review';
  if (list.some((item) => item.status === 'failed')) return 'failed';
  if (list.some((item) => item.status === 'blocked')) return 'blocked';
  if (list.every((item) => isTerminalStatus(item.status))) return list.some((item) => item.status === 'cancelled') ? 'cancelled' : 'completed';
  if (list.some((item) => item.status === 'in_progress' || isTerminalStatus(item.status))) return 'in_progress';
  return 'ready';
}
function executionDrivenStatus(item) {
  if (!item.agentJobId) return '';
  const status = textOr(item.agentStatus).toLowerCase();
  if (['paused', 'waiting_input', 'waiting_approval', 'budget_exhausted'].includes(status)) {
    return 'waiting_input';
  }
  if (['waiting_review', 'pending_human_review', 'self_review'].includes(status)) {
    return 'waiting_review';
  }
  if (['failed', 'blocked'].includes(status)) return 'failed';
  if (['cancelled', 'canceled'].includes(status)) return 'cancelled';
  if (
    ['dispatching', 'queued', 'claimed', 'running', 'planning', 'researching',
      'executing', 'verifying', 'replanning', 'goal_setting', 'goal_check']
      .includes(status)
  ) {
    return 'in_progress';
  }
  return '';
}
function deriveParentStatuses(items) {
  const list = ensureArray(items).map((item) => ({ ...item }));
  const children = new Map();
  list.forEach((item) => {
    if (!item.parentTaskId) return;
    if (!children.has(item.parentTaskId)) children.set(item.parentTaskId, []);
    children.get(item.parentTaskId).push(item);
  });
  list.forEach((item) => {
    const descendants = children.get(item.id) || [];
    if (item.executorMode === 'both' || descendants.length) {
      item.status = item.taskRole === 'coordination'
        ? deriveContainerStatus(descendants)
        : executionDrivenStatus(item) || deriveContainerStatus(descendants);
      item.childTaskCount = descendants.length;
      item.completedChildTaskCount = descendants.filter((child) => isTerminalStatus(child.status)).length;
    }
  });
  return list;
}
function normalizeWorkItems(list, options = {}) { return deriveParentStatuses(ensureArray(list).map((entry) => normalizeWorkItem(entry, options))); }
function getWorkItems(project) { return normalizeWorkItems(project?.workItems, { project }); }
function setWorkItems(project, items) { project.workItems = normalizeWorkItems(items, { project }); return project.workItems; }
function findWorkItem(project, id) { return getWorkItems(project).find((item) => item.id === id) || null; }
function sourceRefKey(ref) { return ref ? `${textOr(ref.type)}:${textOr(ref.id)}` : ''; }
function findBySourceRef(items, ref) {
  const key = sourceRefKey(ref);
  return key ? ensureArray(items).find((item) => ensureArray(item.sourceRefs).some((candidate) => sourceRefKey(candidate) === key)) || null : null;
}
function externalRefKey(ref) {
  if (!ref) return '';
  if (ref.source === 'execution_plan') return `execution_plan:${ref.planId}:${ref.taskId}`;
  if (ref.source === 'agent_job') return `agent_job:${ref.jobId}`;
  return `${ref.source}:${ref.planId || ''}:${ref.taskId || ''}:${ref.jobId || ''}`;
}
function findByExternalRef(items, ref) {
  const key = externalRefKey(ref);
  return key ? ensureArray(items).find((item) => ensureArray(item.externalRefs).some((candidate) => externalRefKey(candidate) === key)) || null : null;
}
function toSlimCard(item) {
  if (!item?.id) return null;
  const keys = ['id', 'origin', 'executorMode', 'title', 'status', 'complexity', 'priority', 'assigneeUserId', 'approverUserId', 'agentId', 'deliveryStageId', 'planPhaseId', 'parentTaskId', 'taskRole', 'stableTaskKey', 'clientVisible', 'scheduledStart', 'scheduledEnd', 'agentStatus', 'agentType', 'agentRequestId', 'reviewRequired', 'currentAction', 'lastMilestone', 'nextTaskId', 'progressCurrent', 'progressTotal', 'updatedAt', 'childTaskCount', 'completedChildTaskCount'];
  const card = Object.fromEntries(keys.map((key) => [key, item[key] ?? '']));
  card.linkedRequirementCount = ensureArray(item.linkedRequirementIds).length;
  card.dependencyTaskIds = normalizeDependencyIds(item.dependencyTaskIds);
  card.expectedOutputCount = ensureArray(item.expectedOutputs).length;
  card.requiresAttention = ['waiting_input', 'waiting_review', 'failed', 'blocked'].includes(item.status);
  return card;
}
function toSlimCards(items) { return ensureArray(items).map(toSlimCard).filter(Boolean); }
function computeMetaCounts(items) {
  const list = ensureArray(items);
  return {
    total: list.length,
    open: list.filter((item) => !isTerminalStatus(item.status)).length,
    attention: list.filter((item) => ['waiting_input', 'waiting_review', 'failed', 'blocked'].includes(item.status)).length,
    waitingReview: list.filter((item) => item.status === 'waiting_review').length,
    inProgress: list.filter((item) => item.status === 'in_progress').length,
    human: list.filter((item) => item.executorMode === 'human').length,
    agent: list.filter((item) => item.executorMode === 'agent').length,
    both: list.filter((item) => item.executorMode === 'both').length,
  };
}
function validateWorkItemForCreate(body) {
  const missing = [];
  if (!textOr(body?.title)) missing.push('title');
  if (!textOr(body?.descriptionMarkdown || body?.description)) missing.push('descriptionMarkdown');
  if (!normalizeComplexity(body?.complexity)) missing.push('complexity');
  if (!textOr(body?.deliveryStageId || body?.stageId)) missing.push('deliveryStageId');
  if (missing.length) throw new Error(`Campos obrigatorios em falta: ${missing.join(', ')}.`);
}
function validateWorkItemForUpdate(patch, existing) {
  const merged = { ...existing, ...patch };
  if (!textOr(merged.title)) throw new Error('O titulo nao pode estar vazio.');
  if (!textOr(merged.descriptionMarkdown)) throw new Error('A descricao nao pode estar vazia.');
  if (!normalizeComplexity(merged.complexity)) throw new Error('A complexidade e obrigatoria.');
  if (!textOr(merged.deliveryStageId)) throw new Error('A etapa e obrigatoria.');
  if (patch?.origin !== undefined && normalizeOrigin(patch.origin) !== existing.origin) throw new Error('Nao e permitido alterar a origem da tarefa.');
  return merged;
}
function validateHierarchy(item, items) {
  if (!item.parentTaskId) return;
  if (item.parentTaskId === item.id) throw new Error('Uma tarefa nao pode ser subtarefa de si propria.');
  const byId = new Map(ensureArray(items).map((entry) => [entry.id, entry]));
  if (!byId.has(item.parentTaskId)) throw new Error('A tarefa-pai nao existe neste projecto.');
  const seen = new Set([item.id]);
  let cursor = byId.get(item.parentTaskId);
  while (cursor) {
    if (seen.has(cursor.id)) throw new Error('A hierarquia de tarefas nao pode conter ciclos.');
    seen.add(cursor.id);
    cursor = cursor.parentTaskId ? byId.get(cursor.parentTaskId) : null;
  }
}
function validateDependencies(item, items) {
  const byId = new Map(ensureArray(items).map((entry) => [entry.id, entry]));
  for (const dependencyId of normalizeDependencyIds(item.dependencyTaskIds)) {
    if (dependencyId === item.id) throw new Error('Uma tarefa nao pode depender de si propria.');
    if (!byId.has(dependencyId)) throw new Error('Uma dependencia da tarefa nao existe neste projecto.');
  }
  const visiting = new Set();
  const visited = new Set();
  function visit(id) {
    if (visiting.has(id)) throw new Error('As dependencias das tarefas nao podem conter ciclos.');
    if (visited.has(id)) return;
    visiting.add(id);
    const current = byId.get(id);
    normalizeDependencyIds(current?.dependencyTaskIds).forEach(visit);
    visiting.delete(id);
    visited.add(id);
  }
  visit(item.id);
}
function priorityRank(item) {
  const ranks = { waiting_input: 0, waiting_review: 1, failed: 2, blocked: 2, in_progress: 3, ready: 4, planned: 5, completed: 6, cancelled: 7 };
  if (!isTerminalStatus(item?.status) && ensureArray(item?.sourceRefs).some((ref) => ['review', 'approval'].includes(ref.type))) return 1;
  return ranks[normalizeStatus(item?.status)] ?? 5;
}
function sortPrioritized(items) {
  const priorities = { high: 0, medium: 1, low: 2, '': 3 };
  return [...ensureArray(items)].sort((a, b) => {
    const status = priorityRank(a) - priorityRank(b);
    if (status) return status;
    const priority = (priorities[a.priority] ?? 3) - (priorities[b.priority] ?? 3);
    if (priority) return priority;
    const ad = a.scheduledEnd ? new Date(a.scheduledEnd).getTime() : Number.MAX_SAFE_INTEGER;
    const bd = b.scheduledEnd ? new Date(b.scheduledEnd).getTime() : Number.MAX_SAFE_INTEGER;
    return ad - bd || String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
  });
}
function filterByTransitionFromStage(items, fromStageId, agentRequests = []) {
  const prefix = `${textOr(fromStageId)}->`;
  const requestIds = new Set(ensureArray(agentRequests)
    .filter((request) => textOr(request.transitionKey).startsWith(prefix))
    .map((request) => request.id));
  return ensureArray(items).filter((item) => item.agentRequestId && requestIds.has(item.agentRequestId));
}

function relevantWorkItems(items, options = {}) {
  const stage = textOr(options.deliveryStageId || options.stageId);
  const transitionFromStageId = textOr(options.transitionFromStageId);
  const phase = textOr(options.planPhaseId);
  const limit = Math.max(1, Math.min(Number(options.limit) || 4, 20));
  let list = ensureArray(items);
  if (transitionFromStageId) {
    list = filterByTransitionFromStage(list, transitionFromStageId, options.agentRequests);
  } else {
    list = list.filter((item) => (!stage || item.deliveryStageId === stage) && (!phase || item.planPhaseId === phase));
  }
  if (phase && transitionFromStageId) {
    list = list.filter((item) => !phase || item.planPhaseId === phase);
  }
  const visibleParentIds = new Set(list.filter((item) => item.taskRole === 'coordination').map((item) => item.id));
  list = list.filter((item) => !item.parentTaskId || !visibleParentIds.has(item.parentTaskId));
  const open = list.filter((item) => !isTerminalStatus(item.status));
  if (open.length) list = open;
  return sortPrioritized(list).slice(0, limit);
}
function migrateProjectWorkItems(project) {
  if (!project || typeof project !== 'object') return { changed: false, workItems: [] };
  const oldVersion = Number(project.workItemsSchemaVersion || 0);
  const before = JSON.stringify({
    workItems: ensureArray(project.workItems),
    tombstones: ensureArray(project.workItemTombstones),
  });
  project.workItems = normalizeWorkItems(project.workItems, { project });
  project.workItemTombstones = getWorkItemTombstones(project);
  project.workItemsSchemaVersion = WORK_ITEMS_SCHEMA_VERSION;
  const after = JSON.stringify({
    workItems: project.workItems,
    tombstones: project.workItemTombstones,
  });
  return { changed: oldVersion !== WORK_ITEMS_SCHEMA_VERSION || before !== after, workItems: project.workItems };
}
function addWorkItemUpdate(item, bodyMarkdown, options = {}) {
  const update = normalizeUpdate({ bodyMarkdown }, options);
  if (!update) throw new Error('A actualizacao nao pode estar vazia.');
  return { ...item, updates: [...ensureArray(item.updates), update] };
}
function patchWorkItemUpdate(item, id, bodyMarkdown, options = {}) {
  const body = textOr(bodyMarkdown); if (!body) throw new Error('A actualizacao nao pode estar vazia.');
  let found = false; const now = options.nowIso ? options.nowIso() : new Date().toISOString();
  const updates = ensureArray(item.updates).map((entry) => {
    if (entry.id !== id) return entry; found = true;
    return { ...entry, bodyMarkdown: body, updatedAt: now, updatedBy: textOr(options.actorUserId, entry.updatedBy) };
  });
  if (!found) throw new Error('Actualizacao nao encontrada.');
  return { ...item, updates };
}
function findWorkItemUpdate(item, id) { return ensureArray(item?.updates).find((entry) => entry.id === id) || null; }

function resolveLinkedAgentJob(project, item) {
  if (!item) return null;
  const jobs = ensureArray(project?.agentJobs);
  const agentJobId = textOr(item.agentJobId);
  if (agentJobId) {
    return jobs.find((job) => job.id === agentJobId) || null;
  }
  const promptRunId = textOr(item.promptRunId);
  if (promptRunId) {
    return jobs.find((job) => job.promptRunId === promptRunId || job.id === promptRunId) || null;
  }
  return null;
}

function isAgentExecutionLinked(item, agentExecution = null) {
  if (!item || !agentExecution?.runId) return false;
  const runId = textOr(agentExecution.runId);
  return runId === textOr(item.agentJobId) || runId === textOr(item.promptRunId);
}

module.exports = {
  WORK_ITEMS_SCHEMA_VERSION, UNCLASSIFIED_STAGE_ID, ORIGINS, EXECUTOR_MODES, STATUSES, COMPLEXITIES,
  normalizeWorkItem, normalizeWorkItems, normalizeSourceRefs, normalizeUpdate, normalizeUpdates,
  getWorkItems, setWorkItems, findWorkItem, findBySourceRef, sourceRefKey, findByExternalRef, externalRefKey,
  toSlimCard, toSlimCards, computeMetaCounts, validateWorkItemForCreate, validateWorkItemForUpdate,
  validateHierarchy, validateDependencies, filterByTransitionFromStage, relevantWorkItems, sortPrioritized, priorityRank,
  isTerminalStatus, deriveContainerStatus, deriveParentStatuses, normalizeStatus,
  buildOrchestrationProjection, executionStatusChip, resolveLinkedAgentJob, isAgentExecutionLinked,
  normalizeExecutionSettings,
  stableKeysForWorkItem, normalizeWorkItemTombstone, getWorkItemTombstones,
  isWorkItemTombstoned, addWorkItemTombstone, restoreWorkItemTombstone,
  migrateProjectWorkItems, addWorkItemUpdate, patchWorkItemUpdate, findWorkItemUpdate, textOr, ensureArray,
};
