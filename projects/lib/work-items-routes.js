/**
 * Work items HTTP routes — lightweight, no full project sanitize on mutations.
 */
const workItems = require('./work-items');
const workItemsSync = require('./work-items-sync');
const projectAccess = require('./project-access');

function textOr(value, fallback = '') {
  const v = value === null || value === undefined ? '' : String(value).trim();
  return v || fallback;
}

function applyListFilters(items, query) {
  let list = [...items];
  const origin = textOr(query.origin);
  const status = textOr(query.status);
  const stage = textOr(query.deliveryStageId || query.stage);
  const complexity = textOr(query.complexity);
  const assignee = textOr(query.assigneeUserId);
  const q = textOr(query.q).toLowerCase();

  if (origin) list = list.filter((item) => item.origin === origin);
  if (status) list = list.filter((item) => item.status === status);
  if (stage) list = list.filter((item) => item.deliveryStageId === stage);
  if (complexity) list = list.filter((item) => item.complexity === complexity);
  if (assignee) list = list.filter((item) => item.assigneeUserId === assignee);
  if (q) {
    list = list.filter((item) =>
      (item.title || '').toLowerCase().includes(q)
      || (item.id || '').toLowerCase().includes(q)
    );
  }
  return list;
}

function registerWorkItemRoutes(app, deps) {
  const {
    authMiddleware,
    requireProjectEditor,
    ensureProjectLoadedLite,
    canAccessProject,
    updateStore,
    appendActivity,
    ensureArray,
    nowIso,
  } = deps;

  async function loadProjectLiteForUser(req, res, next) {
    const projectId = req.params.projectId;
    try {
      const project = await ensureProjectLoadedLite(projectId);
      if (!project) {
        return res.status(404).json({ message: 'Projeto nao encontrado.' });
      }
      if (!canAccessProject(req.auth.user, project)) {
        return res.status(403).json({ message: 'Sem permissao para este projeto.' });
      }
      req.loadedProject = project;
      return next();
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  }

  function visibleItems(project, user) {
    const all = workItems.getWorkItems(project);
    return projectAccess.filterWorkItemsForViewer(all, user, project);
  }

  app.get('/api/projects/projects/:projectId/work-items/meta', authMiddleware, loadProjectLiteForUser, (req, res) => {
    const project = req.loadedProject;
    const user = req.auth.user;
    const all = workItems.getWorkItems(project);
    const counts = workItems.computeMetaCounts(all);
    const canManage = projectAccess.canManageWorkItems(user, project);
    const tabVisible = projectAccess.canViewWorkItemsTab(user, project, all);
    const hasAssigned = projectAccess.viewerHasAssignedHumanWorkItems(user, project, all);
    return res.json({
      tabVisible,
      canManage,
      hasAssigned,
      counts,
    });
  });

  app.get('/api/projects/projects/:projectId/work-items', authMiddleware, loadProjectLiteForUser, (req, res) => {
    const project = req.loadedProject;
    const user = req.auth.user;
    let list = visibleItems(project, user);
    list = applyListFilters(list, req.query || {});

    const total = list.length;
    const limit = Math.min(Number(req.query?.limit) || 100, 500);
    const offset = Math.max(0, Number(req.query?.offset) || 0);
    list = list.slice(offset, offset + limit);

    return res.json({
      workItems: workItems.toSlimCards(list),
      total,
      offset,
      limit,
      canManage: projectAccess.canManageWorkItems(user, project),
    });
  });

  app.get('/api/projects/projects/:projectId/work-items/:workItemId', authMiddleware, loadProjectLiteForUser, (req, res) => {
    const project = req.loadedProject;
    const user = req.auth.user;
    const item = workItems.findWorkItem(project, req.params.workItemId);
    if (!item) {
      return res.status(404).json({ message: 'Tarefa nao encontrada.' });
    }
    const allowed = projectAccess.filterWorkItemsForViewer([item], user, project);
    if (!allowed.length) {
      return res.status(403).json({ message: 'Sem permissao para ver esta tarefa.' });
    }
    return res.json({
      workItem: item,
      canManage: projectAccess.canManageWorkItems(user, project),
      canPostUpdate: projectAccess.canPostWorkItemUpdate(user, project, item),
      canEditUpdate: projectAccess.canEditWorkItemUpdate(user, project),
    });
  });

  app.post('/api/projects/projects/:projectId/work-items', authMiddleware, loadProjectLiteForUser, requireProjectEditor, async (req, res) => {
    try {
      const projectId = req.params.projectId;
      const body = req.body || {};
      workItems.validateWorkItemForCreate(body);

      let created = null;
      await updateStore(async (store) => {
        const project = store.projects.find((entry) => entry.id === projectId);
        if (!project) throw new Error('Projeto nao encontrado.');

        const record = workItems.normalizeWorkItem({
          ...body,
          origin: 'human',
          id: `witem_${require('crypto').randomUUID()}`,
          createdAt: nowIso(),
          updatedAt: nowIso(),
          createdBy: req.auth.user.id,
          updatedBy: req.auth.user.id,
        }, { project, actorUserId: req.auth.user.id, nowIso });

        const list = workItems.getWorkItems(project);
        list.unshift(record);
        workItems.setWorkItems(project, list.slice(0, 2000));
        project.updatedAt = nowIso();
        created = record;

        appendActivity(store, {
          actorUserId: req.auth.user.id,
          projectId,
          action: 'work_item_created',
          details: { workItemId: record.id, origin: record.origin },
        });
      });

      return res.json({ workItem: created });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.patch('/api/projects/projects/:projectId/work-items/:workItemId', authMiddleware, loadProjectLiteForUser, requireProjectEditor, async (req, res) => {
    try {
      const projectId = req.params.projectId;
      const workItemId = req.params.workItemId;
      const patch = req.body || {};

      let updated = null;
      await updateStore(async (store) => {
        const project = store.projects.find((entry) => entry.id === projectId);
        if (!project) throw new Error('Projeto nao encontrado.');

        const list = workItems.getWorkItems(project);
        const existing = list.find((item) => item.id === workItemId);
        if (!existing) throw new Error('Tarefa nao encontrada.');

        const merged = workItems.validateWorkItemForUpdate(patch, existing);
        const record = workItems.normalizeWorkItem({
          ...merged,
          id: existing.id,
          origin: existing.origin,
          updates: existing.updates,
          createdAt: existing.createdAt,
          createdBy: existing.createdBy,
          updatedAt: nowIso(),
          updatedBy: req.auth.user.id,
        }, { project, actorUserId: req.auth.user.id, nowIso });

        const next = list.map((item) => (item.id === workItemId ? record : item));
        workItems.setWorkItems(project, next);
        project.updatedAt = nowIso();
        updated = record;

        appendActivity(store, {
          actorUserId: req.auth.user.id,
          projectId,
          action: 'work_item_updated',
          details: { workItemId, status: record.status },
        });
      });

      return res.json({ workItem: updated });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.delete('/api/projects/projects/:projectId/work-items/:workItemId', authMiddleware, loadProjectLiteForUser, requireProjectEditor, async (req, res) => {
    try {
      const projectId = req.params.projectId;
      const workItemId = req.params.workItemId;

      await updateStore(async (store) => {
        const project = store.projects.find((entry) => entry.id === projectId);
        if (!project) throw new Error('Projeto nao encontrado.');

        const list = workItems.getWorkItems(project);
        const existing = list.find((item) => item.id === workItemId);
        if (!existing) throw new Error('Tarefa nao encontrada.');
        if (existing.origin === 'agent' && existing.agentStatus === 'running') {
          throw new Error('Nao e possivel remover tarefa de agente em execucao.');
        }

        workItems.setWorkItems(project, list.filter((item) => item.id !== workItemId));
        project.updatedAt = nowIso();

        appendActivity(store, {
          actorUserId: req.auth.user.id,
          projectId,
          action: 'work_item_deleted',
          details: { workItemId },
        });
      });

      return res.json({ ok: true });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.post('/api/projects/projects/:projectId/work-items/:workItemId/updates', authMiddleware, loadProjectLiteForUser, async (req, res) => {
    try {
      const projectId = req.params.projectId;
      const workItemId = req.params.workItemId;
      const bodyMarkdown = textOr(req.body?.bodyMarkdown || req.body?.body);
      if (!bodyMarkdown) {
        return res.status(400).json({ message: 'A actualizacao nao pode estar vazia.' });
      }

      let updated = null;
      await updateStore(async (store) => {
        const project = store.projects.find((entry) => entry.id === projectId);
        if (!project) throw new Error('Projeto nao encontrado.');

        const list = workItems.getWorkItems(project);
        const existing = list.find((item) => item.id === workItemId);
        if (!existing) throw new Error('Tarefa nao encontrada.');
        if (!projectAccess.canPostWorkItemUpdate(req.auth.user, project, existing)) {
          throw new Error('Sem permissao para publicar actualizacoes nesta tarefa.');
        }

        const record = workItems.addWorkItemUpdate(existing, bodyMarkdown, {
          actorUserId: req.auth.user.id,
          nowIso,
        });
        record.updatedAt = nowIso();
        record.updatedBy = req.auth.user.id;

        const next = list.map((item) => (item.id === workItemId ? record : item));
        workItems.setWorkItems(project, next);
        project.updatedAt = nowIso();
        updated = record;

        appendActivity(store, {
          actorUserId: req.auth.user.id,
          projectId,
          action: 'work_item_update_posted',
          details: { workItemId, updateId: record.updates[record.updates.length - 1]?.id },
        });
      });

      return res.json({
        workItem: updated,
        update: updated?.updates?.[updated.updates.length - 1] || null,
      });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.patch('/api/projects/projects/:projectId/work-items/:workItemId/updates/:updateId', authMiddleware, loadProjectLiteForUser, requireProjectEditor, async (req, res) => {
    try {
      const projectId = req.params.projectId;
      const workItemId = req.params.workItemId;
      const updateId = req.params.updateId;
      const bodyMarkdown = textOr(req.body?.bodyMarkdown || req.body?.body);
      if (!bodyMarkdown) {
        return res.status(400).json({ message: 'A actualizacao nao pode estar vazia.' });
      }

      let updated = null;
      let update = null;
      await updateStore(async (store) => {
        const project = store.projects.find((entry) => entry.id === projectId);
        if (!project) throw new Error('Projeto nao encontrado.');

        const list = workItems.getWorkItems(project);
        const existing = list.find((item) => item.id === workItemId);
        if (!existing) throw new Error('Tarefa nao encontrada.');
        if (!projectAccess.canEditWorkItemUpdate(req.auth.user, project)) {
          throw new Error('Sem permissao para editar actualizacoes.');
        }

        const record = workItems.patchWorkItemUpdate(existing, updateId, bodyMarkdown, {
          actorUserId: req.auth.user.id,
          nowIso,
        });
        record.updatedAt = nowIso();
        record.updatedBy = req.auth.user.id;
        update = workItems.findWorkItemUpdate(record, updateId);

        const next = list.map((item) => (item.id === workItemId ? record : item));
        workItems.setWorkItems(project, next);
        project.updatedAt = nowIso();
        updated = record;

        appendActivity(store, {
          actorUserId: req.auth.user.id,
          projectId,
          action: 'work_item_update_edited',
          details: { workItemId, updateId },
        });
      });

      return res.json({ workItem: updated, update });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.post('/api/projects/projects/:projectId/work-items/sync-from-plan', authMiddleware, loadProjectLiteForUser, requireProjectEditor, async (req, res) => {
    try {
      const projectId = req.params.projectId;
      const planId = textOr(req.body?.executionPlanId || req.query?.executionPlanId);

      let result = { synced: 0, workItems: [] };
      await updateStore(async (store) => {
        const project = store.projects.find((entry) => entry.id === projectId);
        if (!project) throw new Error('Projeto nao encontrado.');

        const plan = ensureArray(project.executionPlans).find((entry) => entry.id === planId);
        if (!plan) throw new Error('Plano de execucao nao encontrado.');

        result = workItemsSync.syncWorkItemsFromExecutionPlan(project, plan);
        project.updatedAt = nowIso();

        appendActivity(store, {
          actorUserId: req.auth.user.id,
          projectId,
          action: 'work_items_synced_from_plan',
          details: { executionPlanId: planId, synced: result.synced },
        });
      });

      const visible = projectAccess.filterWorkItemsForViewer(
        result.workItems.filter((item) => item.executionPlanId === planId),
        req.auth.user,
        { members: req.loadedProject?.members },
      );

      return res.json({
        synced: result.synced,
        workItems: workItems.toSlimCards(visible),
      });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });
}

module.exports = { registerWorkItemRoutes };
