const engineering = require('./engineering-state');

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function text(value, fallback = '') {
  const result = value === null || value === undefined ? '' : String(value).trim();
  return result || fallback;
}

function publicChangeSet(changeSet) {
  return engineering.normalizeChangeSet(changeSet, { projectId: changeSet?.projectId });
}

function findChangeSet(project, changeSetId) {
  return ensureArray(project.engineeringChangeSets).find((entry) => entry.id === changeSetId) || null;
}

function sameExternalReference(left, right) {
  const keys = ['id', 'provider', 'artifactType', 'uri', 'remoteId', 'title', 'version', 'contentHash'];
  return keys.every((key) => text(left?.[key]) === text(right?.[key]));
}

function requireEnabled(project) {
  if (!engineering.featureEnabled(project)) {
    const error = new Error('Engineering State V1 is not enabled for this project.');
    error.statusCode = 409;
    throw error;
  }
}

function registerEngineeringStateRoutes(app, deps) {
  const {
    authMiddleware,
    requireRole,
    loadProjectForUser,
    requireProjectEditor,
    readStore,
    updateStore,
    appendActivity,
    projectAudit,
    getUserName,
    sqliteStore,
  } = deps;

  app.post('/api/projects/:projectId/engineering/feature', authMiddleware, requireRole('super_admin'), loadProjectForUser, async (req, res) => {
    try {
      const enabled = req.body?.enabled === true;
      await updateStore(async (store) => {
        const project = store.projects.find((entry) => entry.id === req.params.projectId);
        if (!project) throw new Error('Projeto nao encontrado.');
        project.featureFlags = project.featureFlags && typeof project.featureFlags === 'object' ? project.featureFlags : {};
        project.featureFlags[engineering.FEATURE_FLAG] = enabled;
        project.updatedAt = new Date().toISOString();
        appendActivity(store, {
          projectId: project.id,
          actorUserId: req.auth.user.id,
          action: enabled ? 'engineering_state_enabled' : 'engineering_state_disabled',
          details: { feature: engineering.FEATURE_FLAG },
        });
      });
      return res.json({ enabled });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.get('/api/projects/:projectId/engineering/entities', authMiddleware, loadProjectForUser, async (req, res) => {
    try {
      const graph = engineering.getGraph(req.loadedProject, {
        includeVirtual: req.query.includeVirtual !== 'false',
        includeRequirements: req.query.includeRequirements !== 'false',
      });
      return res.json({
        featureEnabled: engineering.featureEnabled(req.loadedProject),
        schemaVersion: graph.schemaVersion,
        revision: graph.revision,
        entities: graph.entities,
        externalReferences: graph.externalReferences,
        updatedAt: graph.updatedAt,
      });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.get('/api/projects/:projectId/engineering/graph', authMiddleware, loadProjectForUser, async (req, res) => {
    try {
      return res.json({
        featureEnabled: engineering.featureEnabled(req.loadedProject),
        ...engineering.getGraph(req.loadedProject),
      });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.get('/api/projects/:projectId/engineering/change-sets', authMiddleware, loadProjectForUser, async (req, res) => {
    const rows = ensureArray(req.loadedProject.engineeringChangeSets).map((entry) => publicChangeSet(entry));
    return res.json({ featureEnabled: engineering.featureEnabled(req.loadedProject), changeSets: rows });
  });

  app.post('/api/projects/:projectId/engineering/external-references', authMiddleware, loadProjectForUser, requireProjectEditor, async (req, res) => {
    try {
      requireEnabled(req.loadedProject);
      let created;
      let audit;
      await updateStore(async (store) => {
        const project = store.projects.find((entry) => entry.id === req.params.projectId);
        if (!project) throw new Error('Projeto nao encontrado.');
        requireEnabled(project);
        const reference = engineering.normalizeExternalReference(req.body || {}, {
          provenance: { source: 'human', actorId: req.auth.user.id },
        });
        audit = projectAudit.auditAndMutate(project, {
          userId: req.auth.user.id,
          userName: getUserName?.(store, req.auth.user.id) || req.auth.user.name,
          action: 'engineering_external_reference_added',
          summary: `Adicionada referência externa: ${reference.title}`,
          stageId: 'discovery',
          metadata: { referenceId: reference.id, provider: reference.provider },
          appendActivity,
          store,
          mutator: (mutableProject) => {
            const state = engineering.normalizeState(mutableProject.engineeringState);
            const existing = state.externalReferences.find((entry) => entry.id === reference.id);
            if (existing && !sameExternalReference(existing, reference)) throw new Error('A different external reference already uses this id.');
            if (!existing) state.externalReferences.push(reference);
            state.revision += existing ? 0 : 1;
            state.updatedAt = new Date().toISOString();
            mutableProject.engineeringState = state;
            mutableProject.updatedAt = state.updatedAt;
            created = existing || reference;
          },
        });
      });
      return res.status(201).json({ reference: created, audit });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.delete('/api/projects/:projectId/engineering/external-references/:referenceId', authMiddleware, loadProjectForUser, requireProjectEditor, async (req, res) => {
    try {
      requireEnabled(req.loadedProject);
      let audit;
      await updateStore(async (store) => {
        const project = store.projects.find((entry) => entry.id === req.params.projectId);
        if (!project) throw new Error('Projeto nao encontrado.');
        requireEnabled(project);
        const state = engineering.normalizeState(project.engineeringState);
        if (!state.externalReferences.some((entry) => entry.id === req.params.referenceId)) throw new Error('External reference not found.');
        audit = projectAudit.auditAndMutate(project, {
          userId: req.auth.user.id,
          userName: getUserName?.(store, req.auth.user.id) || req.auth.user.name,
          action: 'engineering_external_reference_removed',
          summary: `Removida referência externa: ${req.params.referenceId}`,
          stageId: 'discovery',
          metadata: { referenceId: req.params.referenceId },
          appendActivity,
          store,
          mutator: (mutableProject) => {
            const current = engineering.normalizeState(mutableProject.engineeringState);
            current.externalReferences = current.externalReferences.filter((entry) => entry.id !== req.params.referenceId);
            current.revision += 1;
            current.updatedAt = new Date().toISOString();
            mutableProject.engineeringState = current;
            mutableProject.updatedAt = current.updatedAt;
          },
        });
      });
      return res.json({ ok: true, audit });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.post('/api/projects/:projectId/engineering/change-sets', authMiddleware, loadProjectForUser, requireProjectEditor, async (req, res) => {
    try {
      requireEnabled(req.loadedProject);
      const validation = engineering.validateChangeSet(req.body || {}, req.loadedProject);
      if (!validation.valid) return res.status(422).json({ message: 'Invalid engineering change set.', errors: validation.errors });
      let created;
      await updateStore(async (store) => {
        const project = store.projects.find((entry) => entry.id === req.params.projectId);
        if (!project) throw new Error('Projeto nao encontrado.');
        requireEnabled(project);
        project.engineeringChangeSets = ensureArray(project.engineeringChangeSets);
        const existing = project.engineeringChangeSets.find((entry) => entry.id === validation.changeSet.id);
        const proposalHash = engineering.changeSetProposalFingerprint(validation.changeSet, { projectId: project.id });
        if (existing) {
          const existingHash = text(existing.proposalHash)
            || engineering.changeSetProposalFingerprint(existing, { projectId: project.id });
          if (existingHash !== proposalHash) {
            const conflict = new Error('A different change set already uses this id.');
            conflict.statusCode = 409;
            throw conflict;
          }
          created = publicChangeSet(existing);
          return;
        }
        created = { ...validation.changeSet, createdBy: req.auth.user.id, proposalHash };
        project.engineeringChangeSets.unshift(created);
        engineering.syncRecommendedTaskSuggestions(project, created);
        project.updatedAt = new Date().toISOString();
        appendActivity(store, {
          projectId: project.id,
          actorUserId: req.auth.user.id,
          action: 'engineering_change_set_proposed',
          details: { changeSetId: created.id, taskId: created.taskId, runId: created.runId },
        });
      });
      return res.status(201).json({ changeSet: created });
    } catch (error) {
      return res.status(error.statusCode || 400).json({ message: error.message });
    }
  });

  app.post('/api/projects/:projectId/engineering/change-sets/:changeSetId/review', authMiddleware, loadProjectForUser, requireProjectEditor, async (req, res) => {
    try {
      requireEnabled(req.loadedProject);
      const decisions = ensureArray(req.body?.sections);
      if (!decisions.length) return res.status(400).json({ message: 'At least one section decision is required.' });
      let reviewed;
      await updateStore(async (store) => {
        const project = store.projects.find((entry) => entry.id === req.params.projectId);
        if (!project) throw new Error('Projeto nao encontrado.');
        requireEnabled(project);
        const current = findChangeSet(project, req.params.changeSetId);
        if (!current) {
          const missing = new Error('Engineering change set not found.');
          missing.statusCode = 404;
          throw missing;
        }
        const changeSet = publicChangeSet(current);
        if (changeSet.status === 'applied') throw new Error('An applied change set cannot be reviewed again.');
        for (const requested of decisions) {
          const section = changeSet.sections.find((entry) => entry.id === text(requested?.id));
          if (!section) throw new Error(`Unknown change set section: ${text(requested?.id)}`);
          const decision = text(requested?.decision).toLowerCase();
          if (!['approved', 'rejected', 'changes_requested'].includes(decision)) {
            throw new Error(`Unsupported section decision: ${decision}`);
          }
          section.decision = decision;
          section.decisionNotes = text(requested?.notes);
          section.decidedAt = new Date().toISOString();
          section.decidedBy = req.auth.user.id;
        }
        changeSet.status = changeSet.sections.every((section) => section.decision !== 'pending') ? 'reviewed' : 'proposed';
        changeSet.updatedAt = new Date().toISOString();
        const index = project.engineeringChangeSets.findIndex((entry) => entry.id === changeSet.id);
        project.engineeringChangeSets[index] = changeSet;
        project.updatedAt = changeSet.updatedAt;
        reviewed = changeSet;
        appendActivity(store, {
          projectId: project.id,
          actorUserId: req.auth.user.id,
          action: 'engineering_change_set_reviewed',
          details: { changeSetId: changeSet.id, sectionIds: decisions.map((entry) => text(entry?.id)) },
        });
      });
      return res.json({ changeSet: reviewed });
    } catch (error) {
      return res.status(error.statusCode || 400).json({ message: error.message });
    }
  });

  app.post('/api/projects/:projectId/engineering/change-sets/:changeSetId/apply', authMiddleware, loadProjectForUser, requireProjectEditor, async (req, res) => {
    try {
      requireEnabled(req.loadedProject);
      let applied;
      let audit;
      await updateStore(async (store) => {
        const project = store.projects.find((entry) => entry.id === req.params.projectId);
        if (!project) throw new Error('Projeto nao encontrado.');
        requireEnabled(project);
        const current = findChangeSet(project, req.params.changeSetId);
        if (!current) {
          const missing = new Error('Engineering change set not found.');
          missing.statusCode = 404;
          throw missing;
        }
        if (current.status === 'applied') {
          applied = { state: engineering.normalizeState(project.engineeringState), changeSet: publicChangeSet(current), replayed: true };
          return;
        }
        audit = projectAudit.auditAndMutate(project, {
          userId: req.auth.user.id,
          userName: getUserName?.(store, req.auth.user.id) || req.auth.user.name,
          action: 'engineering_change_set_applied',
          summary: `Aplicado change set: ${text(current.summary, current.id)}`,
          stageId: 'discovery',
          metadata: { changeSetId: current.id, taskId: current.taskId, runId: current.runId },
          appendActivity,
          store,
          mutator: (mutableProject) => {
            applied = engineering.applyApprovedChangeSet(mutableProject, current, { actorId: req.auth.user.id });
            mutableProject.engineeringState = applied.state;
            const index = mutableProject.engineeringChangeSets.findIndex((entry) => entry.id === current.id);
            applied.changeSet.snapshotId = mutableProject.versionSnapshots?.[0]?.id || '';
            mutableProject.engineeringChangeSets[index] = applied.changeSet;
            engineering.projectStateToLegacy(mutableProject);
            mutableProject.updatedAt = applied.state.updatedAt;
          },
        });
      });
      return res.json({
        replayed: applied.replayed,
        revision: applied.state.revision,
        changeSet: applied.changeSet,
        audit,
      });
    } catch (error) {
      const status = /Stale engineering change set/.test(error.message) ? 409 : (error.statusCode || 400);
      return res.status(status).json({ message: error.message });
    }
  });

  app.get('/api/projects/:projectId/engineering/impact', authMiddleware, loadProjectForUser, async (req, res) => {
    try {
      const sourceType = text(req.query.sourceType);
      const sourceId = text(req.query.sourceId);
      if (!sourceType || !sourceId) return res.status(400).json({ message: 'sourceType and sourceId are required.' });
      return res.json(engineering.calculateImpact(req.loadedProject, sourceType, sourceId, req.query.includeUpstream === 'true'));
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.get('/api/projects/:projectId/engineering/diagnostics', authMiddleware, loadProjectForUser, async (req, res) => {
    try {
      const result = engineering.diagnostics(req.loadedProject);
      if (typeof sqliteStore?.getEngineeringProjectionStats === 'function') {
        const state = engineering.normalizeState(req.loadedProject.engineeringState);
        const changeSets = ensureArray(req.loadedProject.engineeringChangeSets);
        result.sqliteShadow = {
          ...sqliteStore.getEngineeringProjectionStats(req.loadedProject.id),
          matchesCanonical: sqliteStore.engineeringProjectionMatches(req.loadedProject.id, state, changeSets),
        };
      }
      return res.json(result);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });
}

module.exports = { registerEngineeringStateRoutes };
