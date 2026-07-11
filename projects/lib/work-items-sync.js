/**
 * Work item sync adapters — optional bridges to execution plans, agent runtime, implementation.
 */
const crypto = require('crypto');
const workItems = require('./work-items');

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function textOr(value, fallback = '') {
  const v = value === null || value === undefined ? '' : String(value).trim();
  return v || fallback;
}

function isAutoSyncEnabled() {
  return String(process.env.WORK_ITEMS_AUTO_SYNC || '').trim() === '1';
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
    title: textOr(task?.title, taskId || 'Tarefa de agente'),
    descriptionMarkdown: descriptionFromPlanTask(task),
    complexity: complexityFromPlanTask(task),
    status: 'new',
    deliveryStageId: stageId,
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

function syncWorkItemsFromExecutionPlan(project, plan) {
  const list = workItems.getWorkItems(project);
  const tasks = ensureArray(plan?.tasks);
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
      updated.push(built);
      synced += 1;
    }
  }

  workItems.setWorkItems(project, updated);
  return { synced, workItems: updated };
}

function onAgentRunStart(project, context = {}) {
  if (!isAutoSyncEnabled()) return null;
  const list = workItems.getWorkItems(project);
  const planId = textOr(context.planId || context.executionPlanId);
  const taskId = textOr(context.taskId || context.executionPlanTaskId);
  const agentJobId = textOr(context.agentJobId);

  let item = null;
  if (planId && taskId) {
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
    status: 'active',
    agentStatus: 'running',
    agentJobId,
    externalRefs: refs,
    updatedAt: new Date().toISOString(),
  }, { project });

  const next = list.map((entry) => (entry.id === patched.id ? patched : entry));
  workItems.setWorkItems(project, next);
  return patched;
}

function onAgentRunComplete(project, context = {}) {
  if (!isAutoSyncEnabled()) return null;
  const list = workItems.getWorkItems(project);
  const agentJobId = textOr(context.agentJobId);
  const promptRunId = textOr(context.promptRunId);
  const summary = textOr(context.resultSummaryMarkdown || context.summary);

  let item = agentJobId
    ? list.find((entry) => entry.agentJobId === agentJobId)
      || workItems.findByExternalRef(list, { source: 'agent_job', jobId: agentJobId })
    : null;

  if (!item && promptRunId) {
    item = list.find((entry) => entry.promptRunId === promptRunId) || null;
  }
  if (!item) return null;

  const patched = workItems.normalizeWorkItem({
    ...item,
    status: context.failed ? 'blocked' : 'closed',
    agentStatus: context.failed ? 'failed' : 'completed',
    promptRunId: promptRunId || item.promptRunId,
    resultSummaryMarkdown: summary || item.resultSummaryMarkdown,
    updatedAt: new Date().toISOString(),
  }, { project });

  const next = list.map((entry) => (entry.id === patched.id ? patched : entry));
  workItems.setWorkItems(project, next);
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
  executionPlanAdapter,
  agentRuntimeAdapter,
  implementationAdapter,
};
