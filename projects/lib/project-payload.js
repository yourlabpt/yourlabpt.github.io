/**
 * Slim API payloads — avoid shipping multi-MB prompt/snapshot blobs on every page load.
 */

const deliveryOs = require('./delivery-os');
const deliveryOsPlatform = require('./delivery-os-platform');
const projectAudit = require('./project-audit');

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function slimPromptRun(run) {
  if (!run) return run;
  return {
    id: run.id,
    agentType: run.agentType,
    stageId: run.stageId,
    capabilityId: run.capabilityId,
    moduleTag: run.moduleTag,
    targetOutput: run.targetOutput,
    summaryMarkdown: run.summaryMarkdown,
    status: run.status,
    version: run.version,
    createdAt: run.createdAt,
    createdBy: run.createdBy,
    reviewedAt: run.reviewedAt,
    reviewedBy: run.reviewedBy,
    hasFullPrompt: Boolean(run.fullPrompt),
    hasRawOutput: Boolean(run.rawOutput),
    hasParsedOutput: Boolean(run.parsedOutput),
    fullPromptLength: run.fullPrompt ? String(run.fullPrompt).length : 0,
  };
}

function slimHumanReview(review) {
  if (!review) return review;
  const sections = ensureArray(review.suggestedChanges?.sections);
  return {
    ...review,
    bodyMarkdown: review.bodyMarkdown ? String(review.bodyMarkdown).slice(0, 4000) : '',
    suggestedChanges: review.suggestedChanges
      ? {
          agentType: review.suggestedChanges.agentType,
          decisionsCount: review.decisionsCount,
          sections: sections.map((s) => ({
            title: s.title,
            kind: s.kind,
            itemCount: ensureArray(s.items).length,
          })),
          hasRawOutput: Boolean(review.suggestedChanges.rawOutput),
          hasParsed: Boolean(review.suggestedChanges.parsed),
        }
      : null,
  };
}

function slimVersionSnapshot(snap) {
  if (!snap) return snap;
  const data = snap.snapshotData;
  const hasData = data && typeof data === 'object' && Object.keys(data).length > 0;
  return {
    id: snap.id,
    label: snap.label,
    description: snap.description,
    stageId: snap.stageId,
    createdAt: snap.createdAt,
    createdBy: snap.createdBy,
    hasSnapshotData: hasData,
    requirementCount: hasData ? ensureArray(data.requirements).length : 0,
  };
}

function slimExecutionPlan(plan) {
  if (!plan) return plan;
  return {
    ...plan,
    masterPlanMarkdown: plan.masterPlanMarkdown ? String(plan.masterPlanMarkdown).slice(0, 2000) : '',
    tasks: ensureArray(plan.tasks).map((t) => ({
      id: t.id,
      title: t.title,
      role: t.role,
      status: t.status,
      agentType: t.agentType,
      dependsOn: ensureArray(t.dependsOn),
      contextFromTaskIds: ensureArray(t.contextFromTaskIds),
      estimatedInputTokens: t.estimatedInputTokens,
      targetOutputTokens: t.targetOutputTokens,
      preTaskSnapshotId: t.preTaskSnapshotId,
      preApprovalSnapshotId: t.preApprovalSnapshotId,
      auditId: t.auditId,
      revertedAt: t.revertedAt,
      revertedBy: t.revertedBy,
      hasInstruction: Boolean(t.instruction),
      hasVerificationPrompt: Boolean(t.verificationPrompt),
      hasMergePrompt: Boolean(t.mergePrompt),
      hasRegressionGuardPrompt: Boolean(t.regressionGuardPrompt),
      hasReversePrompt: Boolean(t.reversePrompt),
      hasParsedOutput: Boolean(t.parsedOutput),
    })),
  };
}

function slimAgentJob(job) {
  if (!job) return job;
  return {
    id: job.id,
    agentType: job.agentType,
    mode: job.mode,
    status: job.status,
    stageId: job.stageId,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    createdBy: job.createdBy,
    yarJobId: job.yarJobId,
    promptRunId: job.promptRunId,
    chunkCount: ensureArray(job.chunks).length,
    hasParsedOutput: ensureArray(job.chunks).some((c) => Boolean(c.parsedOutput)),
    chunks: ensureArray(job.chunks).map((c) => ({
      index: c.index,
      key: c.key,
      label: c.label,
      status: c.status,
      requirementIds: c.requirementIds,
      hasPrompt: Boolean(c.prompt),
      hasParsedOutput: Boolean(c.parsedOutput),
    })),
  };
}

function slimDocument(doc) {
  if (!doc) return doc;
  const hasContent = Boolean(doc.contentMarkdown || doc.extractedText);
  return {
    id: doc.id,
    title: doc.title,
    originalName: doc.originalName,
    storedName: doc.storedName,
    uploadedAt: doc.uploadedAt,
    uploadedBy: doc.uploadedBy,
    updatedAt: doc.updatedAt,
    contentType: doc.contentType,
    size: doc.size,
    hasExtractedText: Boolean(doc.extractedText),
    hasContent,
    deliveryStageId: doc.deliveryStageId,
    docType: doc.docType,
    origin: doc.origin,
    diagramFormat: doc.diagramFormat,
  };
}

function slimProjectForTransport(project, options = {}) {
  if (!project || options.full === true) return project;

  const promptRunLimit = options.promptRunLimit ?? 25;
  const reviewLimit = options.reviewLimit ?? 40;
  const snapshotLimit = options.snapshotLimit ?? 15;
  const planLimit = options.planLimit ?? 10;

  const slim = { ...project };
  slim.promptRuns = ensureArray(project.promptRuns).slice(0, promptRunLimit).map(slimPromptRun);
  slim.humanReviews = ensureArray(project.humanReviews).slice(0, reviewLimit).map(slimHumanReview);
  slim.versionSnapshots = ensureArray(project.versionSnapshots).slice(0, snapshotLimit).map(slimVersionSnapshot);
  slim.executionPlans = ensureArray(project.executionPlans).slice(0, planLimit).map(slimExecutionPlan);
  slim.agentJobs = ensureArray(project.agentJobs).map(slimAgentJob);
  slim.documents = ensureArray(project.documents).map(slimDocument);
  slim.alternativeResponses = ensureArray(project.alternativeResponses).slice(0, 10).map((a) => ({
    ...a,
    rawOutput: a.rawOutput ? `[${String(a.rawOutput).length} chars]` : '',
    parsedOutput: null,
  }));
  slim.sourceText = project.sourceText ? String(project.sourceText).slice(0, 5000) : '';
  slim.aiRawJson = project.aiRawJson ? String(project.aiRawJson).slice(0, 5000) : '';
  slim.aiPrompt = project.aiPrompt ? String(project.aiPrompt).slice(0, 5000) : '';
  return slim;
}

function buildProjectListItem(project) {
  return {
    id: project.id,
    name: project.name,
    clientName: project.clientName,
    description: project.description || '',
    status: project.status || 'active',
    proposalCode: project.proposalCode || '',
    updatedAt: project.updatedAt,
    createdAt: project.createdAt,
    members: ensureArray(project.members),
    requirementCount: ensureArray(project.requirements).length,
    deliveryLevel: project.deliveryLevel,
  };
}

const sanitizeCache = new Map();

function cacheKey(projectId, updatedAt, viewerId, mode) {
  return `${projectId}:${updatedAt || ''}:${viewerId || ''}:${mode}`;
}

function clearSanitizeCache(projectId) {
  if (!projectId) {
    sanitizeCache.clear();
    return;
  }
  for (const key of sanitizeCache.keys()) {
    if (key.startsWith(`${projectId}:`)) sanitizeCache.delete(key);
  }
}

function wrapSanitizeProject(sanitizeProjectFn) {
  return function cachedSanitizeProject(project, viewer, options = {}) {
    if (!project?.id) return sanitizeProjectFn(project, viewer, options);
    const mode = options.full ? 'full' : 'slim';
    const key = cacheKey(project.id, project.updatedAt, viewer?.id, mode);
    if (!options.bypassCache && sanitizeCache.has(key)) {
      return sanitizeCache.get(key);
    }
    const source = options.full ? project : slimProjectForTransport(project, options);
    const result = sanitizeProjectFn(source, viewer, options);
    if (!options.bypassCache) {
      sanitizeCache.set(key, result);
      if (sanitizeCache.size > 40) {
        const first = sanitizeCache.keys().next().value;
        sanitizeCache.delete(first);
      }
    }
    return result;
  };
}

function pruneProjectStorage(project) {
  let changed = false;

  const promptRuns = ensureArray(project.promptRuns);
  if (promptRuns.length > 50) {
    project.promptRuns = promptRuns.slice(0, 50);
    changed = true;
  }
  project.promptRuns = ensureArray(project.promptRuns).map((run, idx) => {
    if (idx < 8) return run;
    if (!run.fullPrompt && !run.rawOutput && !run.parsedOutput) return run;
    changed = true;
    return {
      ...run,
      fullPrompt: run.fullPrompt ? `[archived ${String(run.fullPrompt).length} chars]` : '',
      rawOutput: '',
      parsedOutput: null,
      contextPack: {},
    };
  });

  const snaps = ensureArray(project.versionSnapshots);
  if (snaps.length > 15) {
    project.versionSnapshots = snaps.slice(0, 15);
    changed = true;
  }
  project.versionSnapshots = ensureArray(project.versionSnapshots).map((snap, idx) => {
    if (idx < 5) return snap;
    if (!snap.snapshotData || !Object.keys(snap.snapshotData).length) return snap;
    changed = true;
    return { ...snap, snapshotData: {} };
  });

  const plans = ensureArray(project.executionPlans);
  if (plans.length > 12) {
    project.executionPlans = plans.slice(0, 12);
    changed = true;
  }

  const reviews = ensureArray(project.humanReviews);
  if (reviews.length > 60) {
    project.humanReviews = reviews.slice(0, 60);
    changed = true;
  }
  project.humanReviews = reviews.map((r) => {
    if (r.status === 'pending') return r;
    if (!r.suggestedChanges?.rawOutput && !r.bodyMarkdown) return r;
    changed = true;
    return {
      ...r,
      bodyMarkdown: r.bodyMarkdown ? String(r.bodyMarkdown).slice(0, 500) : '',
      suggestedChanges: r.suggestedChanges
        ? { ...r.suggestedChanges, rawOutput: '', parsed: null, sections: [] }
        : null,
    };
  });

  return changed;
}

module.exports = {
  slimProjectForTransport,
  slimPromptRun,
  buildProjectListItem,
  wrapSanitizeProject,
  clearSanitizeCache,
  pruneProjectStorage,
};
