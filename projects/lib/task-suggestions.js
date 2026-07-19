const crypto = require('crypto');
const workItems = require('./work-items');

const SUGGESTION_STATUSES = new Set(['proposed', 'dismissed', 'accepted', 'stale']);
const RULE_IDS = new Set(['pending_human_review', 'pending_approval', 'unplanned_functional_requirements', 'missing_phase_deliverables', 'resolve_stage_blockers']);

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function textOr(value, fallback = '') {
  const valueText = value === null || value === undefined ? '' : String(value).trim();
  return valueText || fallback;
}

function fingerprint(ruleId, stageId, evidence) {
  const stable = ensureArray(evidence)
    .map((entry) => `${textOr(entry.type)}:${textOr(entry.id)}:${textOr(entry.state)}`)
    .sort()
    .join('|');
  return crypto.createHash('sha256').update(`${ruleId}|${stageId}|${stable}`).digest('hex').slice(0, 24);
}

function normalizeSuggestion(raw, now = new Date().toISOString()) {
  const status = textOr(raw?.status, 'proposed').toLowerCase();
  return {
    id: textOr(raw?.id, `tsug_${crypto.randomUUID()}`),
    fingerprint: textOr(raw?.fingerprint),
    ruleId: textOr(raw?.ruleId),
    deliveryStageId: textOr(raw?.deliveryStageId, workItems.UNCLASSIFIED_STAGE_ID),
    planPhaseId: textOr(raw?.planPhaseId),
    title: textOr(raw?.title),
    reason: textOr(raw?.reason),
    evidence: ensureArray(raw?.evidence).map((entry) => ({
      type: textOr(entry?.type),
      id: textOr(entry?.id),
      state: textOr(entry?.state),
      label: textOr(entry?.label),
    })).filter((entry) => entry.type && entry.id),
    sourceRefs: workItems.normalizeSourceRefs(raw?.sourceRefs),
    proposedTask: raw?.proposedTask && typeof raw.proposedTask === 'object' ? raw.proposedTask : {},
    status: SUGGESTION_STATUSES.has(status) ? status : 'proposed',
    acceptedTaskId: textOr(raw?.acceptedTaskId),
    createdAt: textOr(raw?.createdAt, now),
    updatedAt: textOr(raw?.updatedAt, now),
    dismissedAt: textOr(raw?.dismissedAt),
    acceptedAt: textOr(raw?.acceptedAt),
  };
}

function buildCandidate({ ruleId, stageId, planPhaseId, title, reason, evidence, sourceRefs, proposedTask }) {
  const fp = fingerprint(ruleId, stageId, evidence);
  return normalizeSuggestion({
    fingerprint: fp,
    ruleId,
    deliveryStageId: stageId,
    planPhaseId,
    title,
    reason,
    evidence,
    sourceRefs,
    proposedTask: {
      title,
      descriptionMarkdown: `${reason}\n\nEvidência: ${evidence.map((entry) => entry.label || entry.id).join(', ')}.`,
      acceptanceCriteriaMarkdown: 'A condição identificada deixa de estar pendente e a evidência fica registada no projecto.',
      complexity: 'medium',
      status: 'planned',
      priority: 'medium',
      deliveryStageId: stageId,
      planPhaseId: planPhaseId || '',
      executorMode: 'human',
      sourceRefs,
      ...proposedTask,
    },
  });
}

function hasTaskForSources(project, refs) {
  const items = workItems.getWorkItems(project);
  return ensureArray(refs).some((ref) => workItems.findBySourceRef(items, ref));
}

function evaluateCandidates(project) {
  const candidates = [];
  ensureArray(project?.humanReviews)
    .filter((review) => review?.status === 'pending')
    .forEach((review) => {
      const stageId = textOr(review.deliveryStageId || review.stageId, workItems.UNCLASSIFIED_STAGE_ID);
      const sourceRefs = [{ type: 'review', id: review.id, label: review.title || 'Revisão pendente' }];
      if (hasTaskForSources(project, sourceRefs)) return;
      candidates.push(buildCandidate({
        ruleId: 'pending_human_review',
        stageId,
        title: textOr(review.title, 'Rever resultado pendente'),
        reason: 'Existe uma revisão humana pendente nesta etapa e ainda não há uma tarefa que torne a decisão atribuível e rastreável.',
        evidence: [{ type: 'review', id: review.id, state: review.status, label: review.title || review.id }],
        sourceRefs,
        proposedTask: { priority: 'high', approverUserId: textOr(review.reviewerUserId) },
      }));
    });

  ensureArray(project?.approvals)
    .filter((approval) => approval?.status === 'pending')
    .forEach((approval) => {
      const stageId = textOr(approval.stageId, workItems.UNCLASSIFIED_STAGE_ID);
      const sourceRefs = [{ type: 'approval', id: approval.id, label: 'Aprovação pendente' }];
      if (hasTaskForSources(project, sourceRefs)) return;
      candidates.push(buildCandidate({
        ruleId: 'pending_approval',
        stageId,
        title: `Aprovar entrega da etapa ${stageId}`,
        reason: 'A etapa tem uma aprovação pendente e ainda não existe uma tarefa associada para atribuir e acompanhar essa decisão.',
        evidence: [{ type: 'approval', id: approval.id, state: approval.status, label: approval.id }],
        sourceRefs,
        proposedTask: { priority: 'high', approverUserId: textOr(approval.reviewedBy) },
      }));
    });

  const existingTasks = workItems.getWorkItems(project);
  const uncoveredRequirements = ensureArray(project?.requirements)
    .filter((requirement) => String(requirement?.type || '').toLowerCase() === 'functional')
    .filter((requirement) => !existingTasks.some((task) => ensureArray(task.sourceRefs)
      .some((ref) => ref.type === 'requirement' && ref.id === String(requirement.id))));
  if (uncoveredRequirements.length) {
    const sample = uncoveredRequirements.slice(0, 20);
    candidates.push(buildCandidate({
      ruleId: 'unplanned_functional_requirements',
      stageId: 'requirements',
      title: `Planear trabalho para ${uncoveredRequirements.length} requisito(s) funcional(is)`,
      reason: 'Existem requisitos funcionais sem qualquer tarefa ligada. Criar trabalho rastreável evita que requisitos aprovados fiquem fora da execução.',
      evidence: sample.map((requirement) => ({ type: 'requirement', id: String(requirement.id), state: textOr(requirement.status, 'open'), label: requirement.title || requirement.id })),
      sourceRefs: sample.map((requirement) => ({ type: 'requirement', id: String(requirement.id), label: requirement.title || requirement.id })),
      proposedTask: { priority: uncoveredRequirements.some((requirement) => requirement.priority === 'high') ? 'high' : 'medium' },
    }));
  }

  ensureArray(project?.phases).forEach((phase) => {
    const missing = ensureArray(phase?.deliverables).map((label, index) => ({
      type: 'plan_phase_deliverable', id: `${textOr(phase.id)}:${index}`, state: 'missing', label: textOr(label),
    })).filter((entry) => entry.label && !existingTasks.some((task) => ensureArray(task.sourceRefs)
      .some((ref) => ref.type === entry.type && ref.id === entry.id)));
    if (!phase?.id || !missing.length) return;
    candidates.push(buildCandidate({
      ruleId: 'missing_phase_deliverables',
      stageId: 'implementation',
      planPhaseId: textOr(phase.id),
      title: `Preparar entregáveis de ${textOr(phase.name, phase.id)}`,
      reason: `A fase define ${missing.length} entregável(is) que ainda não têm trabalho associado.`,
      evidence: missing,
      sourceRefs: missing.map(({ type, id, label }) => ({ type, id, label })),
      proposedTask: { priority: 'medium' },
    }));
  });

  const blockedByStage = new Map();
  workItems.getWorkItems(project).filter((item) => item.status === 'blocked').forEach((item) => {
    if (!blockedByStage.has(item.deliveryStageId)) blockedByStage.set(item.deliveryStageId, []);
    blockedByStage.get(item.deliveryStageId).push(item);
  });
  blockedByStage.forEach((blocked, stageId) => {
    const sourceRefs = blocked.map((item) => ({ type: 'task', id: item.id, label: item.title }));
    const evidence = blocked.map((item) => ({ type: 'task', id: item.id, state: 'blocked', label: item.title }));
    const existingUnblock = workItems.getWorkItems(project).some((item) => !workItems.isTerminalStatus(item.status)
      && ensureArray(item.sourceRefs).some((ref) => ref.type === 'task' && blocked.some((b) => b.id === ref.id)));
    if (existingUnblock) return;
    candidates.push(buildCandidate({
      ruleId: 'resolve_stage_blockers',
      stageId,
      title: `Resolver ${blocked.length} bloqueio(s) da etapa`,
      reason: `A etapa tem ${blocked.length} tarefa(s) bloqueada(s). É necessário identificar e atribuir a remoção dos impedimentos antes de avançar.`,
      evidence,
      sourceRefs,
      proposedTask: { priority: 'high' },
    }));
  });

  return candidates;
}

function evaluateProject(project, options = {}) {
  const now = options.now || new Date().toISOString();
  const existing = ensureArray(project.taskSuggestions).map((entry) => normalizeSuggestion(entry, now));
  const candidates = evaluateCandidates(project);
  const candidateFingerprints = new Set(candidates.map((entry) => entry.fingerprint));
  const next = existing.map((entry) => {
    if (['proposed', 'dismissed'].includes(entry.status) && !candidateFingerprints.has(entry.fingerprint)) {
      return { ...entry, status: 'stale', updatedAt: now };
    }
    return entry;
  });
  candidates.forEach((candidate) => {
    const found = next.find((entry) => entry.fingerprint === candidate.fingerprint);
    if (found) {
      if (found.status === 'stale') Object.assign(found, candidate, { id: found.id, status: 'proposed', updatedAt: now });
      return;
    }
    next.unshift({ ...candidate, createdAt: now, updatedAt: now });
  });
  project.taskSuggestions = next.slice(0, 300);
  return project.taskSuggestions;
}

function prepareSuggestion(project, suggestionId) {
  const suggestion = ensureArray(project?.taskSuggestions)
    .map((entry) => normalizeSuggestion(entry))
    .find((entry) => entry.id === suggestionId);
  if (!suggestion) throw new Error('Sugestao nao encontrada.');
  if (suggestion.status !== 'proposed') throw new Error('Esta sugestao ja nao esta disponivel.');
  return { suggestion, draft: { ...suggestion.proposedTask, suggestionId: suggestion.id } };
}

function dismissSuggestion(project, suggestionId, now = new Date().toISOString()) {
  let dismissed = null;
  project.taskSuggestions = ensureArray(project.taskSuggestions).map((entry) => {
    const normalized = normalizeSuggestion(entry, now);
    if (normalized.id !== suggestionId) return normalized;
    dismissed = { ...normalized, status: 'dismissed', dismissedAt: now, updatedAt: now };
    return dismissed;
  });
  if (!dismissed) throw new Error('Sugestao nao encontrada.');
  return dismissed;
}

function acceptSuggestion(project, suggestionId, taskId, now = new Date().toISOString()) {
  let accepted = null;
  project.taskSuggestions = ensureArray(project.taskSuggestions).map((entry) => {
    const normalized = normalizeSuggestion(entry, now);
    if (normalized.id !== suggestionId) return normalized;
    accepted = { ...normalized, status: 'accepted', acceptedTaskId: taskId, acceptedAt: now, updatedAt: now };
    return accepted;
  });
  if (!accepted) throw new Error('Sugestao nao encontrada.');
  return accepted;
}

function applyConfiguredAutomations(project, options = {}) {
  // Kept as a compatibility adapter for older callers. Suggestions are
  // proposals only and become tasks exclusively through acceptSuggestion.
  void project;
  void options;
  return [];
}

module.exports = {
  RULE_IDS,
  normalizeSuggestion,
  evaluateCandidates,
  evaluateProject,
  prepareSuggestion,
  dismissSuggestion,
  acceptSuggestion,
  applyConfiguredAutomations,
  fingerprint,
};
