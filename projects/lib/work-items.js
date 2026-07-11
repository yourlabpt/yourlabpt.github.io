/**
 * Work items — ADO-style human/agent tasks (lightweight core, no upstream deps).
 */
const crypto = require('crypto');

const ORIGINS = new Set(['human', 'agent']);
const STATUSES = new Set(['new', 'active', 'blocked', 'closed', 'resolved']);
const COMPLEXITIES = new Set(['low', 'medium', 'high']);
const PRIORITIES = new Set(['low', 'medium', 'high', '']);

const STATUS_ALIASES = {
  todo: 'new',
  in_progress: 'active',
  done: 'closed',
  complete: 'closed',
  completed: 'closed',
};

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function textOr(value, fallback = '') {
  const v = value === null || value === undefined ? '' : String(value).trim();
  return v || fallback;
}

function normalizeStatus(raw) {
  const s = textOr(raw, 'new').toLowerCase();
  if (STATUSES.has(s)) return s;
  return STATUS_ALIASES[s] || 'new';
}

function normalizeOrigin(raw) {
  const o = textOr(raw, 'human').toLowerCase();
  return ORIGINS.has(o) ? o : 'human';
}

function normalizeComplexity(raw) {
  const c = textOr(raw).toLowerCase();
  return COMPLEXITIES.has(c) ? c : '';
}

function normalizePriority(raw) {
  const p = textOr(raw).toLowerCase();
  return PRIORITIES.has(p) ? p : '';
}

function normalizeUpdate(raw, options = {}) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const actorUserId = textOr(options.actorUserId);
  const now = options.nowIso ? options.nowIso() : new Date().toISOString();
  const bodyMarkdown = textOr(src.bodyMarkdown || src.body);
  if (!bodyMarkdown) return null;
  return {
    id: textOr(src.id, `wup_${crypto.randomUUID()}`),
    bodyMarkdown,
    createdAt: textOr(src.createdAt, now),
    updatedAt: textOr(src.updatedAt, now),
    createdBy: textOr(src.createdBy, actorUserId),
    updatedBy: textOr(src.updatedBy, actorUserId),
  };
}

function normalizeUpdates(list, options = {}) {
  return ensureArray(list)
    .map((entry) => normalizeUpdate(entry, options))
    .filter(Boolean);
}

function normalizeExternalRefs(raw) {
  return ensureArray(raw)
    .map((ref) => {
      const source = textOr(ref?.source);
      if (!source) return null;
      return {
        source,
        planId: textOr(ref?.planId),
        taskId: textOr(ref?.taskId),
        jobId: textOr(ref?.jobId),
        promptRunId: textOr(ref?.promptRunId),
      };
    })
    .filter(Boolean);
}

function syncDenormalizedAgentFields(item) {
  const refs = ensureArray(item.externalRefs);
  const planRef = refs.find((r) => r.source === 'execution_plan');
  const jobRef = refs.find((r) => r.source === 'agent_job');
  if (planRef) {
    item.executionPlanId = planRef.planId || item.executionPlanId || '';
    item.executionPlanTaskId = planRef.taskId || item.executionPlanTaskId || '';
  }
  if (jobRef) {
    item.agentJobId = jobRef.jobId || item.agentJobId || '';
  }
  return item;
}

function normalizeWorkItem(raw, options = {}) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const actorUserId = textOr(options.actorUserId);
  const now = options.nowIso ? options.nowIso() : new Date().toISOString();

  const item = syncDenormalizedAgentFields({
    id: textOr(src.id, `witem_${crypto.randomUUID()}`),
    origin: normalizeOrigin(src.origin),
    title: textOr(src.title),
    descriptionMarkdown: textOr(src.descriptionMarkdown || src.description),
    acceptanceCriteriaMarkdown: textOr(src.acceptanceCriteriaMarkdown),
    complexity: normalizeComplexity(src.complexity),
    status: normalizeStatus(src.status),
    priority: normalizePriority(src.priority),
    assigneeUserId: textOr(src.assigneeUserId),
    deliveryStageId: textOr(src.deliveryStageId || src.stageId),
    linkedRequirementIds: ensureArray(src.linkedRequirementIds).map(String).filter(Boolean),
    scheduledStart: textOr(src.scheduledStart),
    scheduledEnd: textOr(src.scheduledEnd),
    externalRefs: normalizeExternalRefs(src.externalRefs),
    agentType: textOr(src.agentType),
    executionPlanId: textOr(src.executionPlanId),
    executionPlanTaskId: textOr(src.executionPlanTaskId),
    agentJobId: textOr(src.agentJobId),
    promptRunId: textOr(src.promptRunId),
    agentStatus: textOr(src.agentStatus),
    resultSummaryMarkdown: textOr(src.resultSummaryMarkdown),
    updates: normalizeUpdates(src.updates, options),
    createdAt: textOr(src.createdAt, now),
    updatedAt: textOr(src.updatedAt, now),
    createdBy: textOr(src.createdBy, actorUserId),
    updatedBy: textOr(src.updatedBy, actorUserId),
  });

  if (options.project?.requirements?.length) {
    const valid = new Set(ensureArray(options.project.requirements).map((r) => String(r.id)));
    if (valid.size) {
      item.linkedRequirementIds = item.linkedRequirementIds.filter((id) => valid.has(id));
    }
  }

  return item;
}

function normalizeWorkItems(list, options = {}) {
  return ensureArray(list).map((entry, index) => normalizeWorkItem(entry, { ...options, index }));
}

function toSlimCard(item) {
  if (!item?.id) return null;
  return {
    id: item.id,
    origin: item.origin,
    title: item.title,
    status: item.status,
    complexity: item.complexity,
    priority: item.priority,
    assigneeUserId: item.assigneeUserId,
    deliveryStageId: item.deliveryStageId,
    scheduledStart: item.scheduledStart,
    scheduledEnd: item.scheduledEnd,
    linkedRequirementCount: ensureArray(item.linkedRequirementIds).length,
    agentStatus: item.origin === 'agent' ? item.agentStatus : '',
    agentType: item.origin === 'agent' ? item.agentType : '',
    updatedAt: item.updatedAt,
  };
}

function toSlimCards(items) {
  return ensureArray(items).map(toSlimCard).filter(Boolean);
}

function computeMetaCounts(items) {
  const list = ensureArray(items);
  let human = 0;
  let agent = 0;
  for (const item of list) {
    if (item.origin === 'agent') agent += 1;
    else human += 1;
  }
  return { total: list.length, human, agent };
}

function validateWorkItemForCreate(body, options = {}) {
  const errors = [];
  const title = textOr(body?.title);
  const description = textOr(body?.descriptionMarkdown || body?.description);
  const complexity = normalizeComplexity(body?.complexity);
  if (!title) errors.push('title');
  if (!description) errors.push('descriptionMarkdown');
  if (!complexity) errors.push('complexity');
  if (options.requireHuman && normalizeOrigin(body?.origin) !== 'human') {
    errors.push('origin');
  }
  if (errors.length) {
    throw new Error(`Campos obrigatorios em falta: ${errors.join(', ')}.`);
  }
  return { title, descriptionMarkdown: description, complexity };
}

function validateWorkItemForUpdate(patch, existing) {
  const merged = { ...existing, ...patch };
  if (!textOr(merged.title)) throw new Error('O titulo nao pode estar vazio.');
  if (!textOr(merged.descriptionMarkdown)) throw new Error('A descricao nao pode estar vazia.');
  if (!normalizeComplexity(merged.complexity)) throw new Error('A complexidade e obrigatoria.');
  if (patch?.origin !== undefined && normalizeOrigin(patch.origin) !== existing.origin) {
    throw new Error('Nao e permitido alterar a origem da tarefa.');
  }
  return merged;
}

function getWorkItems(project) {
  return normalizeWorkItems(project?.workItems, { project });
}

function setWorkItems(project, items) {
  project.workItems = normalizeWorkItems(items, { project });
  return project.workItems;
}

function findWorkItem(project, workItemId) {
  return getWorkItems(project).find((item) => item.id === workItemId) || null;
}

function externalRefKey(ref) {
  if (!ref) return '';
  if (ref.source === 'execution_plan') return `execution_plan:${ref.planId}:${ref.taskId}`;
  if (ref.source === 'agent_job') return `agent_job:${ref.jobId}`;
  return `${ref.source}:${ref.planId || ''}:${ref.taskId || ''}:${ref.jobId || ''}`;
}

function findByExternalRef(items, ref) {
  const key = externalRefKey(ref);
  if (!key) return null;
  return ensureArray(items).find((item) =>
    ensureArray(item.externalRefs).some((r) => externalRefKey(r) === key)
  ) || null;
}

function addWorkItemUpdate(item, bodyMarkdown, options = {}) {
  const update = normalizeUpdate({ bodyMarkdown }, options);
  if (!update) throw new Error('A actualizacao nao pode estar vazia.');
  const updates = [...ensureArray(item.updates), update];
  return { ...item, updates };
}

function patchWorkItemUpdate(item, updateId, bodyMarkdown, options = {}) {
  const text = textOr(bodyMarkdown);
  if (!text) throw new Error('A actualizacao nao pode estar vazia.');
  const now = options.nowIso ? options.nowIso() : new Date().toISOString();
  const actorUserId = textOr(options.actorUserId);
  let found = false;
  const updates = ensureArray(item.updates).map((entry) => {
    if (entry.id !== updateId) return entry;
    found = true;
    return {
      ...entry,
      bodyMarkdown: text,
      updatedAt: now,
      updatedBy: actorUserId || entry.updatedBy,
    };
  });
  if (!found) throw new Error('Actualizacao nao encontrada.');
  return { ...item, updates };
}

function findWorkItemUpdate(item, updateId) {
  return ensureArray(item?.updates).find((entry) => entry.id === updateId) || null;
}

module.exports = {
  ORIGINS,
  STATUSES,
  COMPLEXITIES,
  normalizeWorkItem,
  normalizeWorkItems,
  toSlimCard,
  toSlimCards,
  computeMetaCounts,
  validateWorkItemForCreate,
  validateWorkItemForUpdate,
  getWorkItems,
  setWorkItems,
  findWorkItem,
  findByExternalRef,
  externalRefKey,
  addWorkItemUpdate,
  patchWorkItemUpdate,
  findWorkItemUpdate,
  normalizeUpdate,
  normalizeUpdates,
  textOr,
  ensureArray,
};
