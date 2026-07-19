/**
 * Work item sync adapters — optional bridges to execution plans, agent runtime, implementation.
 */
const crypto = require('crypto');
const workItems = require('./work-items');
const agentRequests = require('./agent-requests');

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function textOr(value, fallback = '') {
  const v = value === null || value === undefined ? '' : String(value).trim();
  return v || fallback;
}

function isAutoSyncEnabled() {
  // Tasks are the canonical work record. Keep the helper for compatibility,
  // but the bridge is no longer optional.
  return true;
}

function complexityFromPlanTask(task) {
  const tokens = Number(task?.estimatedInputTokens) || 0;
  if (tokens >= 12000) return 'high';
  if (tokens >= 5000) return 'medium';
  return 'low';
}

function descriptionFromPlanTask(task) {
  const parts = [];
  if (task?.role) parts.push(`Papel: ${task.role}`);
  if (task?.instruction) parts.push(String(task.instruction).slice(0, 2000));
  if (ensureArray(task?.dependsOn).length) {
    parts.push(`Depende de: ${task.dependsOn.join(', ')}`);
  }
  return parts.join('\n\n') || 'Tarefa de agente gerada a partir do plano de execucao.';
}

function buildWorkItemFromExecutionPlanTask(plan, task, project) {
  const planId = textOr(plan?.id);
  const taskId = textOr(task?.id);
  const stageId = textOr(plan?.toStageId || plan?.stageId || plan?.fromStageId);
  return workItems.normalizeWorkItem({
    id: `witem_${crypto.randomUUID()}`,
    origin: 'agent',
    executorMode: 'agent',
    title: textOr(task?.title, taskId || 'Tarefa de agente'),
    descriptionMarkdown: descriptionFromPlanTask(task),
    complexity: complexityFromPlanTask(task),
    status: 'planned',
    deliveryStageId: stageId,
    sourceRefs: [{ type: 'execution_plan_task', id: `${planId}:${taskId}`, label: textOr(task?.title) }],
    linkedRequirementIds: ensureArray(task?.requirementIds),
    agentType: textOr(plan?.agentType),
    agentStatus: 'planned',
    externalRefs: [{ source: 'execution_plan', planId, taskId }],
    executionPlanId: planId,
    executionPlanTaskId: taskId,
    createdBy: textOr(plan?.createdBy, 'system'),
    updatedBy: textOr(plan?.createdBy, 'system'),
  }, { project });
}

function domainStatusToTaskStatus(status) {
  const value = textOr(status).toLowerCase();
  if (value === 'approved') return 'completed';
  if (['rejected', 'changes_requested', 'cancelled'].includes(value)) return 'failed';
  return 'waiting_review';
}

function syncDomainTasks(project, options = {}) {
  // Domain records can suggest work, but a read/sync must never promote them
  // into the canonical task list without an explicit human acceptance.
  const createMissing = options.createMissing === true;
  const next = workItems.getWorkItems(project);
  const domains = [
    ...ensureArray(project?.humanReviews).map((record) => ({ type: 'review', record, title: textOr(record.title, 'Revisao humana'), stageId: textOr(record.deliveryStageId || record.stageId, workItems.UNCLASSIFIED_STAGE_ID), responsible: textOr(record.reviewerUserId) })),
    ...ensureArray(project?.approvals).map((record) => ({ type: 'approval', record, title: `Aprovar entrega da etapa ${textOr(record.stageId, 'nao classificada')}`, stageId: textOr(record.stageId, workItems.UNCLASSIFIED_STAGE_ID), responsible: textOr(record.reviewedBy) })),
  ];
  let synced = 0;
  for (const domain of domains) {
    if (!domain.record?.id) continue;
    const ref = { type: domain.type, id: domain.record.id };
    const existing = workItems.findBySourceRef(next, ref);
    const status = domainStatusToTaskStatus(domain.record.status);
    if (existing) {
      if (existing.status === status && existing.deliveryStageId === domain.stageId
        && existing.approverUserId === (domain.responsible || existing.approverUserId)) continue;
      const index = next.findIndex((item) => item.id === existing.id);
      next[index] = workItems.normalizeWorkItem({ ...existing, status, deliveryStageId: domain.stageId, approverUserId: domain.responsible || existing.approverUserId, updatedAt: new Date().toISOString() }, { project });
      synced += 1;
      continue;
    }
    if (!createMissing || domain.record.status !== 'pending') continue;
    const candidate = workItems.normalizeWorkItem({
      id: `witem_${crypto.randomUUID()}`, origin: 'platform', executorMode: 'human', title: domain.title,
      descriptionMarkdown: domain.type === 'review' ? 'Analisar a revisao e registar a decisao e evidencia.' : 'Analisar a entrega e registar a decisao de aprovacao.',
      acceptanceCriteriaMarkdown: 'A decisao foi registada e a tarefa ficou concluida.', complexity: 'medium', priority: 'high',
      status, deliveryStageId: domain.stageId, assigneeUserId: domain.responsible, approverUserId: domain.responsible,
      clientVisible: domain.type === 'approval' && Boolean(domain.responsible), sourceRefs: [{ ...ref, label: domain.title }],
      createdBy: 'system', updatedBy: 'system',
    }, { project });
    if (workItems.isWorkItemTombstoned(project, candidate)) continue;
    next.push(candidate);
    synced += 1;
  }
  if (synced) workItems.setWorkItems(project, next);
  return { synced, workItems: synced ? project.workItems : next };
}

function syncImplementationTasks(project) {
  const legacy = ensureArray(project?.implementation?.tasks);
  if (!legacy.length) return { synced: 0, workItems: workItems.getWorkItems(project) };
  const next = workItems.getWorkItems(project); let synced = 0;
  legacy.forEach((task, index) => {
    const legacyId = textOr(task?.id, `legacy_${index + 1}`);
    if (workItems.findBySourceRef(next, { type: 'implementation_task', id: legacyId })) return;
    const candidate = workItems.normalizeWorkItem({
      id: `witem_${crypto.randomUUID()}`, origin: textOr(task?.agentType || task?.agentId) ? 'agent' : 'human',
      executorMode: textOr(task?.agentType || task?.agentId) ? 'agent' : 'human', title: textOr(task?.title, 'Tarefa de implementacao'),
      descriptionMarkdown: textOr(task?.descriptionMarkdown || task?.description, task?.title || 'Tarefa migrada da fase de implementacao.'),
      acceptanceCriteriaMarkdown: ensureArray(task?.acceptanceCriteria).map((entry) => `- ${textOr(entry)}`).join('\n'),
      complexity: textOr(task?.complexity, 'medium'), priority: textOr(task?.priority), status: textOr(task?.status, 'planned'),
      deliveryStageId: 'implementation', planPhaseId: textOr(task?.planPhaseId || task?.roadmapPhaseId),
      assigneeUserId: textOr(task?.assigneeUserId || task?.assignedTo), agentId: textOr(task?.agentId || task?.agentType),
      linkedRequirementIds: ensureArray(task?.linkedRequirementIds || task?.requirementIds), sourceRefs: [{ type: 'implementation_task', id: legacyId }],
      resultSummaryMarkdown: textOr(task?.resultMarkdown), createdAt: textOr(task?.createdAt), updatedAt: textOr(task?.updatedAt), createdBy: textOr(task?.createdBy, 'migration'), updatedBy: textOr(task?.updatedBy, 'migration'),
    }, { project });
    if (workItems.isWorkItemTombstoned(project, candidate)) return;
    next.push(candidate);
    synced += 1;
  });
  workItems.setWorkItems(project, next);
  project.implementation.tasks = [];
  project.implementation.tasksMigratedAt = project.implementation.tasksMigratedAt || new Date().toISOString();
  return { synced, workItems: project.workItems };
}

function syncWorkItemsFromExecutionPlan(project, plan) {
  const list = workItems.getWorkItems(project);
  const tasks = ensureArray(plan?.tasks).filter((task) => (
    !workItems.isWorkItemTombstoned(project, buildWorkItemFromExecutionPlanTask(plan, task, project))
  ));
  const existingPlanTasks = list.filter((item) => item.executionPlanId === plan?.id
    || ensureArray(item.sourceRefs).some((ref) => ref.type === 'execution_plan_task' && ref.id.startsWith(`${plan?.id}:`)));
  if (!existingPlanTasks.length && tasks.length) {
    const runtimeAgentType = plan.agentType === 'stage_transition'
      && plan.fromStageId === 'requirements' && plan.toStageId === 'architecture'
      ? 'requirements_to_architecture'
      : textOr(plan.agentType);
    const delegation = agentRequests.createAgentRequest(project, {
      idempotencyKey: `execution-plan:${plan.id}`,
      title: textOr(plan.title, `Plano: ${textOr(plan.agentType, 'agente')}`),
      requestMarkdown: textOr(plan.masterPlanMarkdown, `Executar o plano ${plan.id}.`),
      desiredOutcomeMarkdown: 'Concluir os outputs previstos no plano de execucao.',
      agentId: textOr(plan.agentId || runtimeAgentType), agentType: runtimeAgentType,
      executionPlanId: plan.id, deliveryStageId: textOr(plan.toStageId || plan.stageId || plan.fromStageId, workItems.UNCLASSIFIED_STAGE_ID),
      tasks: tasks.map((task) => ({
        ...task, expectedOutput: textOr(task.outputSchema || task.targetOutput, 'Resultado verificavel da tarefa.'),
        reviewRequired: true,
      })),
      options: { modelProfileId: plan.modelProfileId, executionPlanId: plan.id, stageId: plan.toStageId || plan.stageId, fromStageId: plan.fromStageId, toStageId: plan.toStageId, direction: plan.direction },
      budget: { maxTokens: plan.maxTokens, maxSubtasks: tasks.length },
    }, { actorUserId: textOr(plan.createdBy, 'system') });
    return { synced: delegation.tasks.length, workItems: workItems.getWorkItems(project), agentRequest: delegation.request };
  }
  let synced = 0;
  const updated = [...list];

  for (const task of tasks) {
    const ref = { source: 'execution_plan', planId: plan.id, taskId: task.id };
    const existing = workItems.findByExternalRef(updated, ref);
    const built = buildWorkItemFromExecutionPlanTask(plan, task, project);
    if (existing) {
      const idx = updated.findIndex((item) => item.id === existing.id);
      updated[idx] = workItems.normalizeWorkItem({
        ...existing,
        title: built.title,
        descriptionMarkdown: built.descriptionMarkdown,
        complexity: built.complexity,
        deliveryStageId: built.deliveryStageId || existing.deliveryStageId,
        linkedRequirementIds: built.linkedRequirementIds.length
          ? built.linkedRequirementIds
          : existing.linkedRequirementIds,
        agentType: built.agentType || existing.agentType,
        externalRefs: built.externalRefs,
        executionPlanId: built.executionPlanId,
        executionPlanTaskId: built.executionPlanTaskId,
        updatedAt: new Date().toISOString(),
      }, { project });
      synced += 1;
    } else {
      if (!workItems.isWorkItemTombstoned(project, built)) {
        updated.push(built);
        synced += 1;
      }
    }
  }

  workItems.setWorkItems(project, updated);
  return { synced, workItems: updated };
}

function onAgentRunStart(project, context = {}) {
  const list = workItems.getWorkItems(project);
  const planId = textOr(context.planId || context.executionPlanId);
  const taskId = textOr(context.taskId || context.executionPlanTaskId);
  const agentJobId = textOr(context.agentJobId);

  let item = textOr(context.workItemId)
    ? list.find((entry) => entry.id === textOr(context.workItemId)) || null
    : null;
  if (!item && planId && taskId) {
    item = workItems.findByExternalRef(list, { source: 'execution_plan', planId, taskId });
  }
  if (!item && agentJobId) {
    item = list.find((entry) => entry.agentJobId === agentJobId) || null;
  }
  if (!item) return null;

  const refs = ensureArray(item.externalRefs);
  if (agentJobId && !refs.some((r) => r.source === 'agent_job' && r.jobId === agentJobId)) {
    refs.push({ source: 'agent_job', jobId: agentJobId });
  }

  const patched = workItems.normalizeWorkItem({
    ...item,
    status: 'in_progress',
    agentStatus: 'running',
    agentJobId,
    currentAction: textOr(context.currentAction, 'O agente iniciou esta tarefa.'),
    attempts: [
      ...ensureArray(item.attempts),
      {
        id: `attempt_${crypto.randomUUID()}`,
        number: ensureArray(item.attempts).length + 1,
        source: 'runtime', status: 'in_progress', agentJobId,
        promptRunId: textOr(context.promptRunId), startedAt: new Date().toISOString(),
      },
    ],
    taskActivity: [
      ...ensureArray(item.taskActivity),
      { type: 'execution_started', message: 'O agente iniciou a execução.', actorType: 'agent', actorId: item.agentId, createdAt: new Date().toISOString() },
    ],
    externalRefs: refs,
    updatedAt: new Date().toISOString(),
  }, { project });

  const next = list.map((entry) => (entry.id === patched.id ? patched : entry));
  workItems.setWorkItems(project, next);
  const request = ensureArray(project.agentRequests).find((entry) => entry.id === patched.agentRequestId);
  if (request) {
    request.status = 'running';
    request.updatedAt = patched.updatedAt;
  }
  return patched;
}

function onAgentRunComplete(project, context = {}) {
  const list = workItems.getWorkItems(project);
  const agentJobId = textOr(context.agentJobId);
  const promptRunId = textOr(context.promptRunId);
  const summary = textOr(context.resultSummaryMarkdown || context.summary);

  let item = textOr(context.workItemId)
    ? list.find((entry) => entry.id === textOr(context.workItemId)) || null
    : agentJobId
    ? list.find((entry) => entry.agentJobId === agentJobId)
      || workItems.findByExternalRef(list, { source: 'agent_job', jobId: agentJobId })
    : null;

  if (!item && promptRunId) {
    item = list.find((entry) => entry.promptRunId === promptRunId) || null;
  }
  if (!item) return null;

  const failed = context.failed === true;
  const waitingReview = !failed && (context.waitingReview === true || item.reviewRequired === true);
  const rawOutput = context.rawOutput === null || context.rawOutput === undefined
    ? ''
    : String(context.rawOutput);
  const completedAt = new Date().toISOString();
  const attempts = ensureArray(item.attempts).map((attempt, index, all) => index === all.length - 1
    ? {
      ...attempt,
      status: failed ? 'failed' : 'completed',
      promptRunId: promptRunId || attempt.promptRunId,
      rawOutput: rawOutput || attempt.rawOutput,
      resultSummaryMarkdown: summary,
      completedAt,
      updatedAt: completedAt,
    }
    : attempt);
  const patched = workItems.normalizeWorkItem({
    ...item,
    status: failed ? 'failed' : waitingReview ? 'waiting_review' : 'completed',
    agentStatus: failed ? 'failed' : waitingReview ? 'pending_human_review' : 'completed',
    promptRunId: promptRunId || item.promptRunId,
    resultSummaryMarkdown: summary || item.resultSummaryMarkdown,
    currentAction: failed ? 'A execução falhou e precisa de intervenção.' : waitingReview ? 'O resultado está pronto para revisão humana.' : 'Tarefa concluída.',
    lastMilestone: failed ? item.lastMilestone : 'Resultado produzido.',
    attempts,
    taskActivity: [
      ...ensureArray(item.taskActivity),
      { type: failed ? 'execution_failed' : 'output_ready', message: failed ? textOr(context.error, 'A execução do agente falhou.') : (waitingReview ? 'O resultado foi produzido e aguarda revisão.' : 'O resultado foi produzido e a tarefa foi concluída.'), actorType: 'agent', actorId: item.agentId, createdAt: completedAt },
    ],
    updatedAt: completedAt,
  }, { project });

  let next = list.map((entry) => (entry.id === patched.id ? patched : entry));
  next = next.map((entry) => entry.status === 'planned'
    && ensureArray(entry.dependencyTaskIds).length
    && ensureArray(entry.dependencyTaskIds).every((id) => next.some((candidate) => candidate.id === id && workItems.isTerminalStatus(candidate.status)))
    ? workItems.normalizeWorkItem({ ...entry, status: 'ready', currentAction: 'Pronta para começar.', updatedAt: completedAt }, { project })
    : entry);
  workItems.setWorkItems(project, next);
  const request = ensureArray(project.agentRequests).find((entry) => entry.id === patched.agentRequestId);
  if (request) {
    const requestTasks = next.filter((entry) => entry.agentRequestId === request.id);
    request.status = requestTasks.every((entry) => workItems.isTerminalStatus(entry.status))
      ? 'completed'
      : requestTasks.some((entry) => entry.status === 'waiting_review') ? 'waiting_review'
        : requestTasks.some((entry) => entry.status === 'failed') ? 'failed' : 'ready';
    request.updatedAt = completedAt;
  }
  return patched;
}

function onAgentRunFailed(project, context = {}) {
  return onAgentRunComplete(project, { ...context, failed: true });
}

const executionPlanAdapter = {
  source: 'execution_plan',
  canSync(project, context) {
    return Boolean(context?.plan?.id && ensureArray(context.plan.tasks).length);
  },
  toWorkItems(project, context) {
    const { workItems: items } = syncWorkItemsFromExecutionPlan(project, context.plan);
    return items.filter((item) => item.origin === 'agent'
      && item.executionPlanId === context.plan.id);
  },
  fromWorkItemUpdate() {
    // future: push status back to plan task
  },
};

const agentRuntimeAdapter = {
  source: 'agent_runtime',
  canSync() {
    return isAutoSyncEnabled();
  },
  toWorkItems() {
    return [];
  },
  fromWorkItemUpdate(workItem, context) {
    if (!isAutoSyncEnabled()) return;
    if (context.phase === 'start') onAgentRunStart(context.project, context);
    if (context.phase === 'complete') onAgentRunComplete(context.project, context);
    if (context.phase === 'failed') onAgentRunFailed(context.project, context);
  },
};

const implementationAdapter = {
  source: 'implementation',
  canSync() {
    return false;
  },
  toWorkItems() {
    return [];
  },
  fromWorkItemUpdate() {},
};

module.exports = {
  isAutoSyncEnabled,
  syncWorkItemsFromExecutionPlan,
  buildWorkItemFromExecutionPlanTask,
  onAgentRunStart,
  onAgentRunComplete,
  onAgentRunFailed,
  syncDomainTasks,
  syncImplementationTasks,
  executionPlanAdapter,
  agentRuntimeAdapter,
  implementationAdapter,
};
