const crypto = require('crypto');
const deliveryOs = require('./delivery-os');

function nowIso() {
  return new Date().toISOString();
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function textOr(value, fallback = '') {
  if (value === null || value === undefined) return fallback;
  return String(value).trim() || fallback;
}

function normalizeAuditEntry(raw) {
  return {
    id: textOr(raw?.id, `aud_${crypto.randomUUID().slice(0, 12)}`),
    at: textOr(raw?.at, nowIso()),
    actorUserId: textOr(raw?.actorUserId),
    actorName: textOr(raw?.actorName),
    action: textOr(raw?.action, 'change'),
    summary: textOr(raw?.summary),
    snapshotId: textOr(raw?.snapshotId) || null,
    metadata: raw?.metadata && typeof raw.metadata === 'object' ? raw.metadata : {},
    revertedAt: textOr(raw?.revertedAt) || null,
    revertedBy: textOr(raw?.revertedBy) || null,
  };
}

function normalizeAuditLog(list) {
  return ensureArray(list).map(normalizeAuditEntry);
}

function capturePreChangeSnapshot(project, label, userId, stageId) {
  const snap = deliveryOs.createProjectSnapshot(
    project,
    label,
    userId,
    stageId || 'requirements'
  );
  project.versionSnapshots = ensureArray(project.versionSnapshots);
  project.versionSnapshots.unshift(snap);
  project.versionSnapshots = project.versionSnapshots.slice(0, 50);
  return snap;
}

function recordProjectAudit(project, entry, appendActivity, store) {
  project.auditLog = normalizeAuditLog(project.auditLog);
  const record = normalizeAuditEntry(entry);
  project.auditLog.unshift(record);
  project.auditLog = project.auditLog.slice(0, 200);

  if (appendActivity && store) {
    appendActivity(store, {
      projectId: project.id,
      actorUserId: record.actorUserId,
      action: record.action,
      auditId: record.id,
      snapshotId: record.snapshotId,
      details: {
        summary: record.summary,
        ...record.metadata,
      },
    });
  }
  return record;
}

function auditAndMutate(project, {
  userId,
  userName,
  action,
  summary,
  stageId,
  metadata,
  appendActivity,
  store,
  mutator,
}) {
  const snap = capturePreChangeSnapshot(
    project,
    `Antes: ${summary}`.slice(0, 120),
    userId,
    stageId
  );
  mutator(project);
  return recordProjectAudit(project, {
    actorUserId: userId,
    actorName: userName,
    action,
    summary,
    snapshotId: snap.id,
    metadata,
  }, appendActivity, store);
}

function restoreProjectFromSnapshot(project, snapshotData) {
  if (!snapshotData || typeof snapshotData !== 'object') {
    throw new Error('Snapshot invalido.');
  }
  const restoreKeys = [
    'requirements', 'capabilities', 'requirementClusters', 'artifacts', 'traceLinks',
    'stages', 'ideaBriefMarkdown', 'documents', 'informationEntries', 'roadmap',
    'implementation', 'approvals', 'impactReports', 'executionPlans', 'promptRuns',
    'humanReviews', 'diagramArtifacts', 'decisions', 'changeRequests', 'deliveryLevel',
    'engineeringState', 'engineeringChangeSets', 'engineeringProjectionV1', 'featureFlags',
  ];
  restoreKeys.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(snapshotData, key)) {
      project[key] = snapshotData[key];
    }
  });
  project.updatedAt = nowIso();
}

function revertAuditEntry(project, auditId, userId, userName) {
  project.auditLog = normalizeAuditLog(project.auditLog);
  const entry = project.auditLog.find((e) => e.id === auditId);
  if (!entry) throw new Error('Registo de auditoria nao encontrado.');
  if (entry.revertedAt) throw new Error('Esta accao ja foi revertida.');
  if (!entry.snapshotId) throw new Error('Sem snapshot para reverter.');

  const snap = ensureArray(project.versionSnapshots).find((s) => s.id === entry.snapshotId);
  if (!snap?.snapshotData) throw new Error('Snapshot nao encontrado.');

  restoreProjectFromSnapshot(project, snap.snapshotData);
  entry.revertedAt = nowIso();
  entry.revertedBy = userId;

  const revertRecord = recordProjectAudit(project, {
    actorUserId: userId,
    actorName: userName,
    action: 'audit_reverted',
    summary: `Revertido: ${entry.summary}`,
    snapshotId: null,
    metadata: { revertedAuditId: auditId, originalAction: entry.action },
  });

  return { entry, revertRecord };
}

function registerProjectAuditRoutes(app, deps) {
  const {
    authMiddleware,
    loadProjectForUser,
    requireProjectEditor,
    readStore,
    updateStore,
    appendActivity,
    sanitizeProject,
    getUserName,
  } = deps;

  app.get('/api/projects/projects/:projectId/audit-log', authMiddleware, loadProjectForUser, async (req, res) => {
    const log = normalizeAuditLog(req.loadedProject.auditLog);
    return res.json({ auditLog: log });
  });

  app.post('/api/projects/projects/:projectId/audit-log/:auditId/revert', authMiddleware, loadProjectForUser, requireProjectEditor, async (req, res) => {
    try {
      const { projectId, auditId } = req.params;
      let result = null;
      await updateStore(async (store) => {
        const project = store.projects.find((p) => p.id === projectId);
        if (!project) throw new Error('Projeto nao encontrado.');
        result = revertAuditEntry(
          project,
          auditId,
          req.auth.user.id,
          getUserName?.(store, req.auth.user.id) || req.auth.user.name
        );
        appendActivity(store, {
          projectId,
          actorUserId: req.auth.user.id,
          action: 'audit_reverted',
          auditId,
          details: { summary: result.entry.summary },
        });
      });
      const store = await readStore();
      const updated = store.projects.find((p) => p.id === projectId);
      return res.json({
        ok: true,
        reverted: result.entry,
        project: sanitizeProject(updated, req.auth.user),
      });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });
}

module.exports = {
  normalizeAuditEntry,
  normalizeAuditLog,
  capturePreChangeSnapshot,
  recordProjectAudit,
  auditAndMutate,
  restoreProjectFromSnapshot,
  revertAuditEntry,
  registerProjectAuditRoutes,
};
