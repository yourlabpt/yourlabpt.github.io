/**
 * External text/AI blobs — prompts, document bodies, plan instructions, job chunks, snapshots.
 * Project JSON keeps metadata only; bodies live under data/blobs/{projectId}/.
 */
const fs = require('fs').promises;
const path = require('path');

const KIND = {
  PROMPT_RUN: 'prompt-runs',
  EXEC_PLAN: 'execution-plans',
  AGENT_JOB: 'agent-jobs',
  DOCUMENT: 'documents',
  HUMAN_REVIEW: 'human-reviews',
  SNAPSHOT: 'snapshots',
};

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeSegment(value) {
  return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '_');
}

function blobPath(dataDir, projectId, kind, id) {
  return path.join(dataDir, 'blobs', safeSegment(projectId), kind, `${safeSegment(id)}.json`);
}

async function fileExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function saveBlob(dataDir, projectId, kind, id, data, writeJson) {
  const filePath = blobPath(dataDir, projectId, kind, id);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await writeJson(filePath, data, { compact: true });
  return filePath;
}

async function loadBlob(dataDir, projectId, kind, id, readJson) {
  const filePath = blobPath(dataDir, projectId, kind, id);
  if (!(await fileExists(filePath))) return null;
  try {
    return await readJson(filePath);
  } catch {
    return null;
  }
}

function hasText(value) {
  return Boolean(String(value ?? '').trim());
}

function hasObjectKeys(obj) {
  return obj && typeof obj === 'object' && Object.keys(obj).length > 0;
}

function externalizePromptRun(run, projectId, dataDir, writeJson) {
  const body = {
    fullPrompt: run.fullPrompt || '',
    rawOutput: run.rawOutput || '',
    parsedOutput: run.parsedOutput ?? null,
    contextPack: run.contextPack || {},
    systemPrompt: run.systemPrompt || '',
    stageInstruction: run.stageInstruction || '',
    taskPrompt: run.taskPrompt || '',
    outputSchema: run.outputSchema || '',
  };
  const hasBody = hasText(body.fullPrompt) || hasText(body.rawOutput) || body.parsedOutput != null
    || hasObjectKeys(body.contextPack) || hasText(body.systemPrompt) || hasText(body.taskPrompt);
  if (!hasBody) return Promise.resolve(false);

  return saveBlob(dataDir, projectId, KIND.PROMPT_RUN, run.id, body, writeJson).then(() => {
    run.blobStored = true;
    run.hasFullPrompt = hasText(body.fullPrompt);
    run.hasRawOutput = hasText(body.rawOutput);
    run.hasParsedOutput = body.parsedOutput != null;
    run.fullPromptLength = body.fullPrompt.length;
    delete run.fullPrompt;
    delete run.rawOutput;
    delete run.parsedOutput;
    delete run.contextPack;
    delete run.systemPrompt;
    delete run.stageInstruction;
    delete run.taskPrompt;
    delete run.outputSchema;
    return true;
  });
}

async function hydratePromptRun(run, projectId, dataDir, readJson) {
  if (!run?.blobStored) return run;
  const body = await loadBlob(dataDir, projectId, KIND.PROMPT_RUN, run.id, readJson);
  if (!body) return run;
  return {
    ...run,
    fullPrompt: body.fullPrompt || '',
    rawOutput: body.rawOutput || '',
    parsedOutput: body.parsedOutput ?? null,
    contextPack: body.contextPack || {},
    systemPrompt: body.systemPrompt || '',
    stageInstruction: body.stageInstruction || '',
    taskPrompt: body.taskPrompt || '',
    outputSchema: body.outputSchema || '',
  };
}

async function savePromptRunBody(projectId, runId, body, dataDir, writeJson) {
  await saveBlob(dataDir, projectId, KIND.PROMPT_RUN, runId, body, writeJson);
}

async function loadExistingExecutionPlanBody(plan, projectId, dataDir) {
  if (!plan?.blobStored) return null;
  try {
    const raw = await fs.readFile(blobPath(dataDir, projectId, KIND.EXEC_PLAN, plan.id), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function mergeExecutionPlanTaskBody(current, existing) {
  if (!existing) return { ...current };
  return {
    ...existing,
    ...current,
    instruction: current.instruction || existing.instruction || '',
    outputSchema: current.outputSchema || existing.outputSchema || '',
    verificationPrompt: current.verificationPrompt || existing.verificationPrompt || '',
    mergePrompt: current.mergePrompt || existing.mergePrompt || '',
    regressionGuardPrompt: current.regressionGuardPrompt || existing.regressionGuardPrompt || '',
    reversePrompt: current.reversePrompt || existing.reversePrompt || '',
    rawOutput: current.rawOutput || existing.rawOutput || '',
    parsedOutput: current.parsedOutput ?? existing.parsedOutput ?? null,
  };
}

async function externalizeExecutionPlan(plan, projectId, dataDir, writeJson) {
  const hasTasks = ensureArray(plan.tasks).some((t) =>
    hasText(t.instruction) || hasText(t.verificationPrompt) || hasText(t.mergePrompt)
    || hasText(t.regressionGuardPrompt) || hasText(t.reversePrompt) || t.parsedOutput != null);
  const hasMaster = hasText(plan.masterPlanMarkdown);
  if (!hasTasks && !hasMaster && !plan.blobStored) return false;

  const existingBody = await loadExistingExecutionPlanBody(plan, projectId, dataDir);
  const existingTasks = new Map(ensureArray(existingBody?.tasks).map((t) => [t.id, t]));
  const bodyTasks = ensureArray(plan.tasks).map((t) => mergeExecutionPlanTaskBody(t, existingTasks.get(t.id)));
  const bodyMaster = hasMaster
    ? plan.masterPlanMarkdown
    : (existingBody?.masterPlanMarkdown || '');
  const hasBodyTasks = bodyTasks.some((t) =>
    hasText(t.instruction) || hasText(t.verificationPrompt) || hasText(t.mergePrompt)
    || hasText(t.regressionGuardPrompt) || hasText(t.reversePrompt) || t.parsedOutput != null);
  if (!hasBodyTasks && !hasText(bodyMaster)) return false;

  const body = {
    masterPlanMarkdown: bodyMaster,
    tasks: bodyTasks,
  };
  await saveBlob(dataDir, projectId, KIND.EXEC_PLAN, plan.id, body, writeJson);

  plan.blobStored = true;
  plan.hasMasterPlan = hasText(body.masterPlanMarkdown);
  plan.taskCount = bodyTasks.length;
  plan.masterPlanMarkdown = hasText(body.masterPlanMarkdown) ? `[${body.masterPlanMarkdown.length} chars]` : '';
  plan.tasks = bodyTasks.map((t) => ({
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
    hasInstruction: hasText(t.instruction),
    hasVerificationPrompt: hasText(t.verificationPrompt),
    hasMergePrompt: hasText(t.mergePrompt),
    hasRegressionGuardPrompt: hasText(t.regressionGuardPrompt),
    hasReversePrompt: hasText(t.reversePrompt),
    hasParsedOutput: Boolean(t.parsedOutput),
    diagramType: t.diagramType,
    requirementIds: t.requirementIds,
    roadmapPhaseId: t.roadmapPhaseId,
  }));
  return true;
}

async function hydrateExecutionPlan(plan, projectId, dataDir, readJson) {
  if (!plan?.blobStored) return plan;
  const body = await loadBlob(dataDir, projectId, KIND.EXEC_PLAN, plan.id, readJson);
  if (!body) return plan;
  return {
    ...plan,
    masterPlanMarkdown: body.masterPlanMarkdown || '',
    tasks: ensureArray(body.tasks),
  };
}

function externalizeAgentJob(job, projectId, dataDir, writeJson) {
  const chunks = ensureArray(job.chunks);
  const hasChunkData = chunks.some((c) => hasText(c.prompt) || hasText(c.rawOutput) || c.parsedOutput != null);
  if (!hasChunkData && !hasText(job.reconcilePrompt)) return Promise.resolve(false);

  const body = { chunks, reconcilePrompt: job.reconcilePrompt || '' };
  return saveBlob(dataDir, projectId, KIND.AGENT_JOB, job.id, body, writeJson).then(() => {
    job.blobStored = true;
    job.chunks = chunks.map((c) => ({
      index: c.index,
      key: c.key,
      label: c.label,
      status: c.status,
      requirementIds: c.requirementIds,
      hasPrompt: hasText(c.prompt),
      hasParsedOutput: Boolean(c.parsedOutput),
    }));
    delete job.reconcilePrompt;
    return true;
  });
}

async function hydrateAgentJob(job, projectId, dataDir, readJson) {
  if (!job?.blobStored) return job;
  const body = await loadBlob(dataDir, projectId, KIND.AGENT_JOB, job.id, readJson);
  if (!body) return job;
  return { ...job, chunks: ensureArray(body.chunks), reconcilePrompt: body.reconcilePrompt || '' };
}

function externalizeDocument(doc, projectId, dataDir, writeJson) {
  const contentMarkdown = doc.contentMarkdown || '';
  const extractedText = doc.extractedText || '';
  if (!hasText(contentMarkdown) && !hasText(extractedText)) return Promise.resolve(false);

  const body = { contentMarkdown, extractedText };
  return saveBlob(dataDir, projectId, KIND.DOCUMENT, doc.id, body, writeJson).then(() => {
    doc.blobStored = true;
    doc.hasContent = hasText(contentMarkdown) || hasText(extractedText);
    doc.hasExtractedText = hasText(extractedText);
    delete doc.contentMarkdown;
    delete doc.extractedText;
    return true;
  });
}

async function hydrateDocument(doc, projectId, dataDir, readJson) {
  if (!doc?.blobStored) return doc;
  const body = await loadBlob(dataDir, projectId, KIND.DOCUMENT, doc.id, readJson);
  if (!body) return doc;
  return {
    ...doc,
    contentMarkdown: body.contentMarkdown || '',
    extractedText: body.extractedText || '',
  };
}

function externalizeHumanReview(review, projectId, dataDir, writeJson) {
  const bodyMarkdown = review.bodyMarkdown || '';
  const rawOutput = review.suggestedChanges?.rawOutput || '';
  const parsed = review.suggestedChanges?.parsed;
  if (!hasText(bodyMarkdown) && !hasText(rawOutput) && !parsed) return Promise.resolve(false);

  const body = {
    bodyMarkdown,
    suggestedChanges: review.suggestedChanges ? { ...review.suggestedChanges } : null,
  };
  return saveBlob(dataDir, projectId, KIND.HUMAN_REVIEW, review.id, body, writeJson).then(() => {
    review.blobStored = true;
    review.hasBody = hasText(bodyMarkdown);
    review.bodyMarkdown = hasText(bodyMarkdown) ? `[${bodyMarkdown.length} chars]` : '';
    if (review.suggestedChanges) {
      review.suggestedChanges = {
        ...review.suggestedChanges,
        rawOutput: rawOutput ? `[${rawOutput.length} chars]` : '',
        parsed: null,
        hasRawOutput: hasText(rawOutput),
        hasParsed: Boolean(parsed),
      };
    }
    return true;
  });
}

async function hydrateHumanReview(review, projectId, dataDir, readJson) {
  if (!review?.blobStored) return review;
  const body = await loadBlob(dataDir, projectId, KIND.HUMAN_REVIEW, review.id, readJson);
  if (!body) return review;
  return {
    ...review,
    bodyMarkdown: body.bodyMarkdown || '',
    suggestedChanges: body.suggestedChanges || review.suggestedChanges,
  };
}

function externalizeSnapshot(snap, projectId, dataDir, writeJson) {
  const data = snap.snapshotData;
  if (!hasObjectKeys(data)) {
    if (snap.snapshotStoredExternally) return Promise.resolve(false);
    return Promise.resolve(false);
  }
  return saveBlob(dataDir, projectId, KIND.SNAPSHOT, snap.id, data, writeJson).then(() => {
    snap.snapshotStoredExternally = true;
    snap.snapshotData = {};
    snap.hasSnapshotData = true;
    return true;
  });
}

async function resolveSnapshotData(project, snapshotId, dataDir, readJson) {
  const snap = ensureArray(project?.versionSnapshots).find((s) => s.id === snapshotId);
  if (!snap) return null;
  if (hasObjectKeys(snap.snapshotData)) return snap.snapshotData;
  if (!snap.snapshotStoredExternally || !project?.id) return null;

  const fromBlob = await loadBlob(dataDir, project.id, KIND.SNAPSHOT, snapshotId, readJson);
  if (fromBlob) return fromBlob;

  const legacyPath = path.join(
    dataDir,
    'snapshots',
    safeSegment(project.id),
    `${safeSegment(snapshotId)}.json`,
  );
  if (await fileExists(legacyPath)) {
    try {
      return await readJson(legacyPath);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Move all heavy inline text off the project JSON (idempotent).
 */
async function externalizeProjectBlobs(project, dataDir, writeJson) {
  if (!project?.id) return false;
  let changed = false;

  for (const run of ensureArray(project.promptRuns)) {
    if (await externalizePromptRun(run, project.id, dataDir, writeJson)) changed = true;
  }
  for (const plan of ensureArray(project.executionPlans)) {
    if (await externalizeExecutionPlan(plan, project.id, dataDir, writeJson)) changed = true;
  }
  for (const job of ensureArray(project.agentJobs)) {
    if (await externalizeAgentJob(job, project.id, dataDir, writeJson)) changed = true;
  }
  for (const doc of ensureArray(project.documents)) {
    if (await externalizeDocument(doc, project.id, dataDir, writeJson)) changed = true;
  }
  for (const review of ensureArray(project.humanReviews)) {
    if (await externalizeHumanReview(review, project.id, dataDir, writeJson)) changed = true;
  }
  for (const snap of ensureArray(project.versionSnapshots)) {
    if (await externalizeSnapshot(snap, project.id, dataDir, writeJson)) changed = true;
  }

  if (hasText(project.sourceText) && project.sourceText.length > 8000) {
    await saveBlob(dataDir, project.id, 'project', 'sourceText', { text: project.sourceText }, writeJson);
    project.sourceText = `[${project.sourceText.length} chars]`;
    project.sourceTextBlobStored = true;
    changed = true;
  }

  return changed;
}

function prepareProjectForDisk(project) {
  const disk = { ...project };
  if (project.storageHybrid) {
    const requirements = ensureArray(project.requirements);
    disk.requirements = [];
    disk.requirementCount = requirements.length;
    disk.requirementsInDb = true;
  } else {
    disk.requirements = ensureArray(project.requirements);
    disk.requirementCount = disk.requirements.length;
    delete disk.requirementsInDb;
    delete disk.storageHybrid;
  }
  return disk;
}

module.exports = {
  KIND,
  blobPath,
  saveBlob,
  loadBlob,
  externalizeProjectBlobs,
  hydratePromptRun,
  hydrateExecutionPlan,
  hydrateAgentJob,
  hydrateDocument,
  hydrateHumanReview,
  resolveSnapshotData,
  savePromptRunBody,
  prepareProjectForDisk,
};
