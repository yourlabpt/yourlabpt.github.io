const crypto = require('crypto');

const GATE_OUTCOMES = ['approved', 'changes_requested', 'rejected', 'needs_clarification', 'deferred'];
const DECISION_STATUSES = ['proposed', 'decided', 'deferred', 'superseded'];
const CHANGE_REQUEST_STATUSES = ['draft', 'submitted', 'under_review', 'approved', 'rejected', 'implemented'];
const INTEGRATION_SYSTEMS = ['jira', 'azure_devops'];

function nowIso() {
  return new Date().toISOString();
}

function textOr(value, fallback = '') {
  if (value === null || value === undefined) return fallback;
  return String(value).trim() || fallback;
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function numberOr(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeStringArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((e) => textOr(e)).filter(Boolean);
  return String(value).split(/[,;]/).map((e) => e.trim()).filter(Boolean);
}

function normalizeSourceRef(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const type = textOr(raw.type);
  const id = textOr(raw.id);
  if (!type || !id) return null;
  return {
    type,
    id,
    lineIndex: numberOr(raw.lineIndex, -1),
    excerpt: textOr(raw.excerpt),
  };
}

function normalizeDecision(raw, actorId) {
  const status = textOr(raw?.status, 'proposed').toLowerCase();
  return {
    id: textOr(raw?.id, `dec_${crypto.randomUUID().slice(0, 12)}`),
    text: textOr(raw?.text),
    status: DECISION_STATUSES.includes(status) ? status : 'proposed',
    phaseId: textOr(raw?.phaseId, 'discovery'),
    linkedRequirementIds: normalizeStringArray(raw?.linkedRequirementIds),
    sourceRef: normalizeSourceRef(raw?.sourceRef),
    decidedBy: textOr(raw?.decidedBy),
    decidedAt: textOr(raw?.decidedAt),
    notes: textOr(raw?.notes),
    createdAt: textOr(raw?.createdAt, nowIso()),
    createdBy: textOr(raw?.createdBy, actorId),
    updatedAt: textOr(raw?.updatedAt, nowIso()),
    updatedBy: textOr(raw?.updatedBy, actorId),
  };
}

function normalizeChangeRequest(raw, actorId) {
  const status = textOr(raw?.status, 'draft').toLowerCase();
  return {
    id: textOr(raw?.id, `cr_${crypto.randomUUID().slice(0, 12)}`),
    title: textOr(raw?.title, 'Alteração de âmbito'),
    description: textOr(raw?.description),
    impact: textOr(raw?.impact, 'medium'),
    status: CHANGE_REQUEST_STATUSES.includes(status) ? status : 'draft',
    affectedRequirementIds: normalizeStringArray(raw?.affectedRequirementIds),
    affectedPhaseIds: normalizeStringArray(raw?.affectedPhaseIds),
    requestedBy: textOr(raw?.requestedBy, actorId),
    approvedBy: textOr(raw?.approvedBy),
    approvedAt: textOr(raw?.approvedAt),
    resolutionNotes: textOr(raw?.resolutionNotes),
    createdAt: textOr(raw?.createdAt, nowIso()),
    updatedAt: textOr(raw?.updatedAt, nowIso()),
  };
}

function normalizeIntegrationMapping(raw) {
  const system = textOr(raw?.system, 'jira').toLowerCase();
  return {
    id: textOr(raw?.id, `map_${crypto.randomUUID().slice(0, 12)}`),
    system: INTEGRATION_SYSTEMS.includes(system) ? system : 'jira',
    externalId: textOr(raw?.externalId),
    externalUrl: textOr(raw?.externalUrl),
    internalType: textOr(raw?.internalType, 'requirement'),
    internalId: textOr(raw?.internalId),
    direction: textOr(raw?.direction, 'bidirectional'),
    lastSyncAt: textOr(raw?.lastSyncAt),
    lastSyncStatus: textOr(raw?.lastSyncStatus, 'pending'),
    metadata: raw?.metadata && typeof raw.metadata === 'object' ? raw.metadata : {},
    createdAt: textOr(raw?.createdAt, nowIso()),
    updatedAt: textOr(raw?.updatedAt, nowIso()),
  };
}

function normalizeArtifactProvenance(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const source = textOr(raw.source, 'human').toLowerCase();
  if (!['ai', 'human', 'mixed'].includes(source)) return { source: 'human' };
  return {
    source,
    promptRunId: textOr(raw.promptRunId) || null,
    agentType: textOr(raw.agentType) || null,
    editedBy: textOr(raw.editedBy) || null,
    editedAt: textOr(raw.editedAt) || null,
    approvedBy: textOr(raw.approvedBy) || null,
    approvedAt: textOr(raw.approvedAt) || null,
    confidenceScore: raw.confidenceScore != null ? numberOr(raw.confidenceScore, null) : null,
  };
}

function normalizePlatformFields(project) {
  return {
    decisions: ensureArray(project.decisions).map((d) => normalizeDecision(d)),
    changeRequests: ensureArray(project.changeRequests).map((cr) => normalizeChangeRequest(cr)),
    integrationMappings: ensureArray(project.integrationMappings).map(normalizeIntegrationMapping),
    projectVisits: project.projectVisits && typeof project.projectVisits === 'object'
      ? project.projectVisits
      : {},
    gateFindings: ensureArray(project.gateFindings),
  };
}

function promoteMinuteDecisionToRecord(project, { minuteId, decisionIndex, text, phaseId, linkedRequirementIds }, actorId) {
  const minute = ensureArray(project.meetingMinutes).find((m) => m.id === minuteId);
  if (!minute) throw new Error('Ata não encontrada.');
  const decisions = ensureArray(minute.decisions);
  const idx = numberOr(decisionIndex, -1);
  const sourceDecision = idx >= 0 ? decisions[idx] : null;
  const decisionText = textOr(text, sourceDecision?.text);
  if (!decisionText) throw new Error('Texto da decisão é obrigatório.');

  const record = normalizeDecision({
    text: decisionText,
    phaseId: textOr(phaseId, sourceDecision?.phaseId || minute.targetStageId || 'discovery'),
    linkedRequirementIds: linkedRequirementIds || sourceDecision?.linkedRequirementIds || [],
    sourceRef: {
      type: 'meeting_minute',
      id: minuteId,
      lineIndex: idx,
      excerpt: decisionText.slice(0, 200),
    },
    status: 'proposed',
    createdBy: actorId,
  }, actorId);

  project.decisions = ensureArray(project.decisions);
  project.decisions.unshift(record);
  return record;
}

function countOrphanRequirements(project) {
  const reqs = ensureArray(project.requirements);
  const traceLinks = ensureArray(project.traceLinks);
  const implTasks = ensureArray(project.implementation?.tasks);
  const frReqs = reqs.filter((r) => String(r.type).toLowerCase() === 'functional');
  const frIds = new Set(frReqs.map((r) => r.id));
  const stkIds = new Set(reqs.filter((r) => String(r.type).toLowerCase() === 'stakeholder').map((r) => r.id));
  const taskReqIds = (task) => [
    ...ensureArray(task?.linkedRequirementIds),
    ...ensureArray(task?.requirementIds),
  ].map(String).filter(Boolean);

  let frWithoutStk = 0;
  let frWithoutImpl = 0;
  frReqs.forEach((fr) => {
    const frId = fr.id;
    const hasStk = traceLinks.some((l) =>
      (l.targetId === frId && l.sourceType?.includes('stakeholder'))
      || (l.sourceId === frId && l.targetType?.includes('stakeholder'))
    ) || stkIds.has(fr.parentId) || stkIds.has(fr.stakeholderRequirementLink);
    if (!hasStk) frWithoutStk += 1;

    const hasTask = implTasks.some((t) => taskReqIds(t).includes(frId));
    if (!hasTask) frWithoutImpl += 1;
  });

  const tasksWithoutFr = implTasks.filter((t) => {
    const links = taskReqIds(t);
    return !links.length || !links.some((id) => frIds.has(id));
  }).length;

  return { frWithoutStk, frWithoutImpl, tasksWithoutFr, orphanFrCount: frWithoutStk + frWithoutImpl };
}

function computeFlowHealth(project) {
  const now = Date.now();
  const reviews = ensureArray(project.humanReviews);
  const questions = ensureArray(project.clarificationQuestions);
  const decisions = ensureArray(project.decisions);
  const changeRequests = ensureArray(project.changeRequests);

  const pendingReviews = reviews.filter((r) => r.status === 'pending');
  const rejectedReviews = reviews.filter((r) => r.status === 'rejected');
  const approvedReviews = reviews.filter((r) => r.status === 'approved');

  const reviewCycleTimes = reviews
    .filter((r) => r.resolvedAt && r.createdAt)
    .map((r) => new Date(r.resolvedAt).getTime() - new Date(r.createdAt).getTime())
    .filter((ms) => ms > 0);
  const avgReviewCycleMs = reviewCycleTimes.length
    ? reviewCycleTimes.reduce((a, b) => a + b, 0) / reviewCycleTimes.length
    : 0;

  const decisionLatencies = decisions
    .filter((d) => d.decidedAt && d.createdAt)
    .map((d) => new Date(d.decidedAt).getTime() - new Date(d.createdAt).getTime())
    .filter((ms) => ms > 0);
  const avgDecisionLatencyMs = decisionLatencies.length
    ? decisionLatencies.reduce((a, b) => a + b, 0) / decisionLatencies.length
    : 0;

  const openQuestions = questions.filter((q) => !q.resolvedAt && !q.answer);
  const blockedTasks = ensureArray(project.implementation?.tasks).filter((t) =>
    String(t.status).toLowerCase() === 'blocked'
  );

  const orphans = countOrphanRequirements(project);
  const totalReqs = ensureArray(project.requirements).length;
  const reqsWithTrace = totalReqs - orphans.frWithoutStk;
  const traceabilityPct = totalReqs ? Math.round((reqsWithTrace / totalReqs) * 100) : 100;

  const aiTotal = approvedReviews.length + rejectedReviews.length + pendingReviews.length;
  const aiAcceptanceRate = aiTotal ? Math.round((approvedReviews.length / aiTotal) * 100) : null;

  const openChangeRequests = changeRequests.filter((cr) =>
    !['approved', 'rejected', 'implemented'].includes(cr.status)
  ).length;

  let deliveryConfidence = 100;
  deliveryConfidence -= Math.min(30, pendingReviews.length * 5);
  deliveryConfidence -= Math.min(20, openQuestions.length * 3);
  deliveryConfidence -= Math.min(15, orphans.orphanFrCount * 2);
  deliveryConfidence -= Math.min(10, blockedTasks.length * 4);
  deliveryConfidence -= Math.min(10, openChangeRequests * 3);
  deliveryConfidence = Math.max(0, Math.min(100, deliveryConfidence));

  return {
    deliveryConfidence,
    pendingReviews: pendingReviews.length,
    avgReviewCycleHours: Math.round(avgReviewCycleMs / 3600000 * 10) / 10,
    avgDecisionLatencyDays: Math.round(avgDecisionLatencyMs / 86400000 * 10) / 10,
    openAmbiguities: openQuestions.length,
    blockedTasks: blockedTasks.length,
    orphanFrCount: orphans.orphanFrCount,
    frWithoutImpl: orphans.frWithoutImpl,
    tasksWithoutFr: orphans.tasksWithoutFr,
    traceabilityCompletenessPct: traceabilityPct,
    aiAcceptanceRate,
    openChangeRequests,
    scopeChangeFrequency: changeRequests.length,
    proposedDecisions: decisions.filter((d) => d.status === 'proposed').length,
    computedAt: nowIso(),
  };
}

function computeProjectActions(project, viewer) {
  const role = textOr(viewer?.role, 'partner');
  const health = computeFlowHealth(project);
  const actions = [];

  if (role !== 'client') {
    if (health.pendingReviews > 0) {
      actions.push({
        id: 'approve_reviews',
        priority: 1,
        label: `Aprovar ${health.pendingReviews} revisão(ões) pendente(s)`,
        tab: 'deliveryos',
        stageId: null,
        count: health.pendingReviews,
      });
    }
    if (health.proposedDecisions > 0) {
      actions.push({
        id: 'decide_pending',
        priority: 2,
        label: `Formalizar ${health.proposedDecisions} decisão(ões) proposta(s)`,
        tab: 'deliveryos',
        stageId: 'discovery',
        count: health.proposedDecisions,
      });
    }
    if (health.orphanFrCount > 0) {
      actions.push({
        id: 'link_orphans',
        priority: 3,
        label: `Ligar ${health.orphanFrCount} FR(s) sem rastreio completo`,
        tab: 'requisitos',
        stageId: 'requirements',
        count: health.orphanFrCount,
      });
    }
    if (health.openChangeRequests > 0) {
      actions.push({
        id: 'review_changes',
        priority: 4,
        label: `Rever ${health.openChangeRequests} pedido(s) de alteração`,
        tab: 'deliveryos',
        stageId: 'roadmap',
        count: health.openChangeRequests,
      });
    }
  }

  const clientQuestions = ensureArray(project.clarificationQuestions).filter((q) => {
    if (q.resolvedAt || q.answer) return false;
    const target = textOr(q.targetAudience, 'both').toLowerCase();
    return role === 'client' ? (target === 'client' || target === 'both') : true;
  });

  if (clientQuestions.length) {
    actions.push({
      id: 'answer_questions',
      priority: role === 'client' ? 1 : 5,
      label: role === 'client'
        ? `Responder ${clientQuestions.length} pergunta(s) em aberto`
        : `Aguardam resposta: ${clientQuestions.length} pergunta(s)`,
      tab: 'perguntas',
      count: clientQuestions.length,
    });
  }

  const pendingApprovals = ensureArray(project.approvals).filter((a) => a.status === 'pending');
  if (pendingApprovals.length) {
    actions.push({
      id: 'pending_approvals',
      priority: role === 'client' ? 2 : 6,
      label: `Aprovar ${pendingApprovals.length} entregável(is)`,
      tab: role === 'client' ? 'deliveryos' : 'deliveryos',
      count: pendingApprovals.length,
    });
  }

  return actions.sort((a, b) => a.priority - b.priority).slice(0, 5);
}

function computeSinceLastVisit(project, userId) {
  const visits = project.projectVisits || {};
  const lastVisit = visits[userId] || null;
  const since = lastVisit ? new Date(lastVisit).getTime() : 0;

  const changes = [];
  ensureArray(project.humanReviews).forEach((r) => {
    if (new Date(r.createdAt).getTime() > since) {
      changes.push({ type: 'review', id: r.id, at: r.createdAt, label: r.title || 'Nova revisão' });
    }
  });
  ensureArray(project.decisions).forEach((d) => {
    if (new Date(d.createdAt).getTime() > since) {
      changes.push({ type: 'decision', id: d.id, at: d.createdAt, label: d.text?.slice(0, 80) });
    }
  });
  ensureArray(project.clarificationQuestions).forEach((q) => {
    const at = q.createdAt || q.updatedAt;
    if (at && new Date(at).getTime() > since) {
      changes.push({ type: 'question', id: q.id, at, label: q.question?.slice(0, 80) || 'Nova pergunta' });
    }
  });

  changes.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  return {
    lastVisitAt: lastVisit,
    changesSince: changes.slice(0, 15),
    totalChanges: changes.length,
  };
}

function recordProjectVisit(project, userId) {
  if (!project.projectVisits) project.projectVisits = {};
  project.projectVisits[userId] = nowIso();
}

function runConsistencyCheck(project, stageId) {
  const findings = [];
  const reqs = ensureArray(project.requirements);
  const stage = textOr(stageId, 'requirements');

  const frs = reqs.filter((r) => String(r.type).toLowerCase() === 'functional');
  const rnfs = reqs.filter((r) => String(r.type).toLowerCase() === 'non_functional');
  const tcs = reqs.filter((r) => String(r.type).toLowerCase() === 'test_case');

  frs.forEach((fr) => {
    const hasNfr = rnfs.some((n) => n.parentId === fr.id)
      || ensureArray(project.traceLinks).some((l) =>
        (l.sourceId === fr.id && l.targetType?.includes('non_functional'))
        || (l.targetId === fr.id && l.sourceType?.includes('non_functional'))
      );
    if (!hasNfr && stage === 'architecture') {
      findings.push({
        severity: 'warning',
        code: 'fr_without_nfr',
        message: `FR ${fr.id} não tem RNF associado.`,
        entityType: 'requirement',
        entityId: fr.id,
      });
    }
    const hasTc = tcs.some((tc) => tc.parentId === fr.id);
    if (!hasTc && ['validation', 'delivery'].includes(stage)) {
      findings.push({
        severity: 'info',
        code: 'fr_without_tc',
        message: `FR ${fr.id} não tem caso de teste.`,
        entityType: 'requirement',
        entityId: fr.id,
      });
    }
  });

  const openCrs = ensureArray(project.changeRequests).filter((cr) =>
    !['approved', 'rejected', 'implemented'].includes(cr.status)
  );
  if (openCrs.length && ['roadmap', 'implementation'].includes(stage)) {
    findings.push({
      severity: 'error',
      code: 'open_change_requests',
      message: `${openCrs.length} pedido(s) de alteração em aberto bloqueiam avanço seguro.`,
      entityType: 'change_request',
      entityId: openCrs[0].id,
    });
  }

  const proposedDecisions = ensureArray(project.decisions).filter((d) => d.status === 'proposed');
  if (proposedDecisions.length && stage === 'discovery') {
    findings.push({
      severity: 'warning',
      code: 'undecided_decisions',
      message: `${proposedDecisions.length} decisão(ões) ainda não formalizada(s).`,
      entityType: 'decision',
      entityId: proposedDecisions[0].id,
    });
  }

  return {
    stageId: stage,
    findings,
    passed: !findings.some((f) => f.severity === 'error'),
    checkedAt: nowIso(),
  };
}

function runTraceabilityAudit(project) {
  const orphans = countOrphanRequirements(project);
  const findings = [];
  if (orphans.frWithoutStk > 0) {
    findings.push({
      severity: 'warning',
      code: 'fr_without_stk',
      message: `${orphans.frWithoutStk} FR(s) sem ligação STK.`,
      count: orphans.frWithoutStk,
    });
  }
  if (orphans.frWithoutImpl > 0) {
    findings.push({
      severity: 'info',
      code: 'fr_without_impl',
      message: `${orphans.frWithoutImpl} FR(s) sem tarefa de implementação.`,
      count: orphans.frWithoutImpl,
    });
  }
  if (orphans.tasksWithoutFr > 0) {
    findings.push({
      severity: 'warning',
      code: 'task_without_fr',
      message: `${orphans.tasksWithoutFr} tarefa(s) sem FR ligado.`,
      count: orphans.tasksWithoutFr,
    });
  }
  const health = computeFlowHealth(project);
  return {
    findings,
    traceabilityCompletenessPct: health.traceabilityCompletenessPct,
    passed: orphans.frWithoutStk === 0 && orphans.tasksWithoutFr === 0,
    checkedAt: nowIso(),
  };
}

function buildClientPortalSummary(project, viewer) {
  const stages = ensureArray(project.stages);
  const milestones = stages.map((s) => ({
    id: s.id,
    label: s.label,
    status: s.status,
    requiresHumanApproval: s.requiresHumanApproval === true,
    approvedAt: s.approvedAt || null,
  }));

  const openQuestions = ensureArray(project.clarificationQuestions).filter((q) => {
    if (q.resolvedAt || q.answer) return false;
    const target = textOr(q.targetAudience, 'both').toLowerCase();
    return target === 'client' || target === 'both';
  });

  const pendingApprovals = ensureArray(project.approvals).filter((a) => a.status === 'pending');
  const deliverables = ensureArray(project.artifacts).filter((a) =>
    a.status === 'pending_review' || a.status === 'approved'
  ).slice(0, 20);

  return {
    milestones,
    openQuestions,
    pendingApprovals,
    deliverables,
    deliveryConfidence: computeFlowHealth(project).deliveryConfidence,
    actions: computeProjectActions(project, viewer),
  };
}

function registerDeliveryOsPlatformRoutes(app, deps) {
  const {
    authMiddleware,
    requireRole,
    loadProjectForUser,
    readStore,
    updateStore,
    appendActivity,
    sanitizeProject,
    normalizeApprovals,
  } = deps;

  app.get('/api/projects/projects/:projectId/decisions', authMiddleware, loadProjectForUser, async (req, res) => {
    const project = req.loadedProject;
    return res.json({ decisions: ensureArray(project.decisions).map((d) => normalizeDecision(d)) });
  });

  app.post('/api/projects/projects/:projectId/decisions', authMiddleware, requireRole('super_admin', 'partner'), loadProjectForUser, async (req, res) => {
    try {
      const { projectId } = req.params;
      let created = null;
      await updateStore(async (store) => {
        const project = store.projects.find((p) => p.id === projectId);
        if (!project) throw new Error('Projeto não encontrado.');
        created = normalizeDecision(req.body || {}, req.auth.user.id);
        project.decisions = ensureArray(project.decisions);
        project.decisions.unshift(created);
        project.updatedAt = nowIso();
        appendActivity(store, { projectId, type: 'decision_created', decisionId: created.id, userId: req.auth.user.id });
      });
      return res.json({ decision: created });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.patch('/api/projects/projects/:projectId/decisions/:decisionId', authMiddleware, requireRole('super_admin', 'partner'), loadProjectForUser, async (req, res) => {
    try {
      const { projectId, decisionId } = req.params;
      let updated = null;
      await updateStore(async (store) => {
        const project = store.projects.find((p) => p.id === projectId);
        if (!project) throw new Error('Projeto não encontrado.');
        const idx = ensureArray(project.decisions).findIndex((d) => d.id === decisionId);
        if (idx < 0) throw new Error('Decisão não encontrada.');
        const body = req.body || {};
        const current = normalizeDecision(project.decisions[idx]);
        if (body.status === 'decided') {
          current.status = 'decided';
          current.decidedBy = req.auth.user.id;
          current.decidedAt = nowIso();
        }
        if (body.text) current.text = textOr(body.text);
        if (body.phaseId) current.phaseId = textOr(body.phaseId);
        if (body.linkedRequirementIds) current.linkedRequirementIds = normalizeStringArray(body.linkedRequirementIds);
        if (body.notes !== undefined) current.notes = textOr(body.notes);
        current.updatedAt = nowIso();
        current.updatedBy = req.auth.user.id;
        project.decisions[idx] = current;
        updated = current;
        project.updatedAt = nowIso();
      });
      return res.json({ decision: updated });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.delete('/api/projects/projects/:projectId/decisions/:decisionId', authMiddleware, requireRole('super_admin'), loadProjectForUser, async (req, res) => {
    try {
      const { projectId, decisionId } = req.params;
      await updateStore(async (store) => {
        const project = store.projects.find((p) => p.id === projectId);
        if (!project) throw new Error('Projeto não encontrado.');
        project.decisions = ensureArray(project.decisions).filter((d) => d.id !== decisionId);
        project.updatedAt = nowIso();
      });
      return res.json({ ok: true });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.post('/api/projects/projects/:projectId/decisions/promote', authMiddleware, requireRole('super_admin', 'partner'), loadProjectForUser, async (req, res) => {
    try {
      const { projectId } = req.params;
      let created = null;
      await updateStore(async (store) => {
        const project = store.projects.find((p) => p.id === projectId);
        if (!project) throw new Error('Projeto não encontrado.');
        created = promoteMinuteDecisionToRecord(project, req.body || {}, req.auth.user.id);
        project.updatedAt = nowIso();
        appendActivity(store, { projectId, type: 'decision_promoted', decisionId: created.id, userId: req.auth.user.id });
      });
      return res.json({ decision: created });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.get('/api/projects/projects/:projectId/project-actions', authMiddleware, loadProjectForUser, async (req, res) => {
    const actions = computeProjectActions(req.loadedProject, req.auth.user);
    return res.json({ actions });
  });

  app.get('/api/projects/projects/:projectId/since-last-visit', authMiddleware, loadProjectForUser, async (req, res) => {
    const summary = computeSinceLastVisit(req.loadedProject, req.auth.user.id);
    return res.json(summary);
  });

  app.post('/api/projects/projects/:projectId/record-visit', authMiddleware, loadProjectForUser, async (req, res) => {
    try {
      const { projectId } = req.params;
      await updateStore(async (store) => {
        const project = store.projects.find((p) => p.id === projectId);
        if (!project) throw new Error('Projeto não encontrado.');
        recordProjectVisit(project, req.auth.user.id);
        project.updatedAt = nowIso();
      });
      return res.json({ ok: true, visitedAt: nowIso() });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.get('/api/projects/projects/:projectId/flow-health', authMiddleware, loadProjectForUser, async (req, res) => {
    return res.json({ health: computeFlowHealth(req.loadedProject) });
  });

  app.post('/api/projects/projects/:projectId/gate-check', authMiddleware, requireRole('super_admin', 'partner'), loadProjectForUser, async (req, res) => {
    const stageId = textOr(req.body?.stageId, 'requirements');
    const agentType = textOr(req.body?.agentType, 'consistency_checker');
    const result = agentType === 'traceability_auditor'
      ? runTraceabilityAudit(req.loadedProject)
      : runConsistencyCheck(req.loadedProject, stageId);

    try {
      const { projectId } = req.params;
      await updateStore(async (store) => {
        const project = store.projects.find((p) => p.id === projectId);
        if (!project) return;
        project.gateFindings = ensureArray(project.gateFindings);
        project.gateFindings.unshift({
          id: `gf_${crypto.randomUUID().slice(0, 12)}`,
          agentType,
          stageId,
          ...result,
          createdAt: nowIso(),
          createdBy: req.auth.user.id,
        });
        project.gateFindings = project.gateFindings.slice(0, 30);
        project.updatedAt = nowIso();
      });
    } catch { /* non-blocking */ }

    return res.json({ check: result, agentType });
  });

  app.get('/api/projects/projects/:projectId/change-requests', authMiddleware, loadProjectForUser, async (req, res) => {
    return res.json({ changeRequests: ensureArray(req.loadedProject.changeRequests).map((cr) => normalizeChangeRequest(cr)) });
  });

  app.post('/api/projects/projects/:projectId/change-requests', authMiddleware, requireRole('super_admin', 'partner'), loadProjectForUser, async (req, res) => {
    try {
      const { projectId } = req.params;
      let created = null;
      await updateStore(async (store) => {
        const project = store.projects.find((p) => p.id === projectId);
        if (!project) throw new Error('Projeto não encontrado.');
        created = normalizeChangeRequest(req.body || {}, req.auth.user.id);
        if (req.body?.submit) created.status = 'submitted';
        project.changeRequests = ensureArray(project.changeRequests);
        project.changeRequests.unshift(created);
        project.updatedAt = nowIso();
        appendActivity(store, { projectId, type: 'change_request_created', changeRequestId: created.id, userId: req.auth.user.id });
      });
      return res.json({ changeRequest: created });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.patch('/api/projects/projects/:projectId/change-requests/:crId', authMiddleware, requireRole('super_admin', 'partner'), loadProjectForUser, async (req, res) => {
    try {
      const { projectId, crId } = req.params;
      let updated = null;
      await updateStore(async (store) => {
        const project = store.projects.find((p) => p.id === projectId);
        if (!project) throw new Error('Projeto não encontrado.');
        const idx = ensureArray(project.changeRequests).findIndex((cr) => cr.id === crId);
        if (idx < 0) throw new Error('Pedido de alteração não encontrado.');
        const body = req.body || {};
        const current = normalizeChangeRequest(project.changeRequests[idx]);
        ['title', 'description', 'impact', 'status', 'resolutionNotes'].forEach((key) => {
          if (body[key] !== undefined) current[key] = textOr(body[key]);
        });
        if (body.affectedRequirementIds) current.affectedRequirementIds = normalizeStringArray(body.affectedRequirementIds);
        if (body.status === 'approved') {
          current.approvedBy = req.auth.user.id;
          current.approvedAt = nowIso();
        }
        current.updatedAt = nowIso();
        project.changeRequests[idx] = current;
        updated = current;
        project.updatedAt = nowIso();
      });
      return res.json({ changeRequest: updated });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.get('/api/projects/projects/:projectId/client-portal', authMiddleware, loadProjectForUser, async (req, res) => {
    const summary = buildClientPortalSummary(req.loadedProject, req.auth.user);
    return res.json(summary);
  });

  app.post('/api/projects/projects/:projectId/client-approvals', authMiddleware, loadProjectForUser, async (req, res) => {
    try {
      const role = textOr(req.auth.user?.role);
      if (role !== 'client' && role !== 'super_admin' && role !== 'partner') {
        return res.status(403).json({ message: 'Sem permissão para aprovar.' });
      }
      const { projectId } = req.params;
      const body = req.body || {};
      let approval = null;
      await updateStore(async (store) => {
        const project = store.projects.find((p) => p.id === projectId);
        if (!project) throw new Error('Projeto não encontrado.');
        const action = textOr(body.action, 'approved');
        const targetId = textOr(body.approvalId || body.artifactId || body.stageId);
        project.approvals = normalizeApprovals(project.approvals);
        const existing = project.approvals.find((a) => a.id === targetId || a.stageId === targetId);
        if (existing) {
          existing.status = ['approved', 'rejected', 'deferred'].includes(action) ? action : 'approved';
          existing.resolvedAt = nowIso();
          existing.resolvedBy = req.auth.user.id;
          existing.notes = textOr(body.notes);
          approval = existing;
        } else {
          approval = {
            id: `appr_${crypto.randomUUID().slice(0, 12)}`,
            stageId: textOr(body.stageId, 'delivery'),
            artifactIds: normalizeStringArray(body.artifactIds),
            status: ['approved', 'rejected', 'deferred'].includes(action) ? action : 'approved',
            requestedAt: nowIso(),
            resolvedAt: nowIso(),
            resolvedBy: req.auth.user.id,
            notes: textOr(body.notes),
            createdBy: req.auth.user.id,
          };
          project.approvals.unshift(approval);
        }
        project.updatedAt = nowIso();
        appendActivity(store, { projectId, type: 'client_approval', approvalId: approval.id, action, userId: req.auth.user.id });
      });
      const store = await readStore();
      const updated = store.projects.find((p) => p.id === projectId);
      return res.json({ approval, project: sanitizeProject(updated, req.auth.user) });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.get('/api/projects/projects/:projectId/integrations', authMiddleware, loadProjectForUser, async (req, res) => {
    return res.json({
      mappings: ensureArray(req.loadedProject.integrationMappings).map(normalizeIntegrationMapping),
      supportedSystems: INTEGRATION_SYSTEMS,
      sourceOfTruth: 'yourlab',
    });
  });

  app.post('/api/projects/projects/:projectId/integrations/mappings', authMiddleware, requireRole('super_admin', 'partner'), loadProjectForUser, async (req, res) => {
    try {
      const { projectId } = req.params;
      let created = null;
      await updateStore(async (store) => {
        const project = store.projects.find((p) => p.id === projectId);
        if (!project) throw new Error('Projeto não encontrado.');
        created = normalizeIntegrationMapping(req.body || {});
        project.integrationMappings = ensureArray(project.integrationMappings);
        project.integrationMappings.unshift(created);
        project.updatedAt = nowIso();
      });
      return res.json({ mapping: created });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.post('/api/projects/projects/:projectId/integrations/sync', authMiddleware, requireRole('super_admin', 'partner'), loadProjectForUser, async (req, res) => {
    const mappings = ensureArray(req.loadedProject.integrationMappings);
    const synced = mappings.map((m) => ({
      ...m,
      lastSyncAt: nowIso(),
      lastSyncStatus: 'simulated_ok',
      note: 'Sync simulado — configure credenciais Jira/Azure DevOps para sync real.',
    }));
    try {
      const { projectId } = req.params;
      await updateStore(async (store) => {
        const project = store.projects.find((p) => p.id === projectId);
        if (!project) return;
        project.integrationMappings = synced;
        project.updatedAt = nowIso();
      });
    } catch { /* non-blocking */ }
    return res.json({ mappings: synced, syncedAt: nowIso(), mode: 'simulated' });
  });

  app.get('/api/projects/config/gate-outcomes', authMiddleware, async (req, res) => {
    return res.json({ outcomes: GATE_OUTCOMES });
  });
}

module.exports = {
  GATE_OUTCOMES,
  DECISION_STATUSES,
  CHANGE_REQUEST_STATUSES,
  INTEGRATION_SYSTEMS,
  normalizeDecision,
  normalizeChangeRequest,
  normalizeIntegrationMapping,
  normalizeArtifactProvenance,
  normalizePlatformFields,
  promoteMinuteDecisionToRecord,
  computeFlowHealth,
  computeProjectActions,
  computeSinceLastVisit,
  recordProjectVisit,
  runConsistencyCheck,
  runTraceabilityAudit,
  buildClientPortalSummary,
  registerDeliveryOsPlatformRoutes,
};
