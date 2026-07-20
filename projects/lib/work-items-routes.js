/**
 * Work items HTTP routes — lightweight, no full project sanitize on mutations.
 */
const workItems = require('./work-items');
const workItemsSync = require('./work-items-sync');
const projectAccess = require('./project-access');
const taskSuggestions = require('./task-suggestions');
const agentRequests = require('./agent-requests');
const deliveryOs = require('./delivery-os');
const stageTransitions = require('./stage-transition-requests');

const ACTIVE_AGENT_STATUSES = new Set([
  'queued', 'claimed', 'running', 'planning', 'researching', 'executing',
  'self_review', 'verifying', 'paused', 'connection_lost', 'cancel_requested',
]);

function textOr(value, fallback = '') {
  const v = value === null || value === undefined ? '' : String(value).trim();
  return v || fallback;
}
function safeTransitionPreview(preview) {
  const { inputSnapshot, plan, baselineRequest, ...rest } = preview || {};
  return {
    ...rest,
    baselineRequest: baselineRequest ? { id: baselineRequest.id, title: baselineRequest.title, status: baselineRequest.status, version: baselineRequest.version, updatedAt: baselineRequest.updatedAt } : null,
    tasks: workItems.ensureArray(preview?.tasks).map(({ instruction, ...task }) => task),
  };
}

function filterAcceptedWorkItems(project, items = workItems.getWorkItems(project)) {
  const activeTaskIds = new Set(workItems.ensureArray(project?.agentJobs)
    .filter((job) => ACTIVE_AGENT_STATUSES.has(textOr(job.status)))
    .flatMap((job) => [textOr(job.workItemId), textOr(job.id)])
    .filter(Boolean));
  const pendingRequestIds = new Set(agentRequests.getAgentRequests(project)
    .filter((request) => (
      ['awaiting_approval', 'revision_requested'].includes(request.status)
      // A stage-transition request is created by an explicit human action
      // after its task preview. Its tasks are therefore real accepted work,
      // even though agent execution may still require a separate approval.
      && request.requestKind !== 'stage_transition'
    ))
    .map((request) => request.id));
  return workItems.ensureArray(items)
    .filter((item) => (
      activeTaskIds.has(item.id)
      || activeTaskIds.has(item.agentJobId)
      || !item.agentRequestId
      || !pendingRequestIds.has(item.agentRequestId)
    ));
}

function applyListFilters(items, query) {
  let list = [...items];
  const origin = textOr(query.origin);
  const status = textOr(query.status);
  const stage = textOr(query.deliveryStageId || query.stage);
  const complexity = textOr(query.complexity);
  const priority = textOr(query.priority);
  const assignee = textOr(query.assigneeUserId);
  const executorMode = textOr(query.executorMode || query.executor);
  const planPhaseId = textOr(query.planPhaseId || query.phase);
  const sourceType = textOr(query.sourceType);
  const sourceId = textOr(query.sourceId);
  const clientVisible = textOr(query.clientVisible);
  const q = textOr(query.q).toLowerCase();

  if (origin) list = list.filter((item) => item.origin === origin);
  if (status) list = list.filter((item) => item.status === workItems.normalizeStatus(status));
  if (stage) list = list.filter((item) => item.deliveryStageId === stage);
  if (complexity) list = list.filter((item) => item.complexity === complexity);
  if (priority) list = list.filter((item) => item.priority === priority);
  if (assignee) list = list.filter((item) => item.assigneeUserId === assignee);
  if (executorMode) list = list.filter((item) => item.executorMode === executorMode);
  if (planPhaseId) list = list.filter((item) => item.planPhaseId === planPhaseId);
  if (query.parentTaskId !== undefined) {
    const parent = query.parentTaskId === 'root' ? '' : textOr(query.parentTaskId);
    list = list.filter((item) => item.parentTaskId === parent);
  }
  if (sourceType) list = list.filter((item) => workItems.ensureArray(item.sourceRefs).some((ref) => ref.type === sourceType && (!sourceId || ref.id === sourceId)));
  if (clientVisible === 'true' || clientVisible === 'false') list = list.filter((item) => item.clientVisible === (clientVisible === 'true'));
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
    connectorStore,
    agentConnectionMode,
    runtime,
    ensureArray,
    nowIso,
    sendProjectEmail,
    normalizeRequirementRecord,
  } = deps;

  function linkedExecution(project, item, attempts = item?.attempts || []) {
    const latest = attempts[attempts.length - 1] || null;
    const promptRunId = textOr(item?.promptRunId || latest?.promptRunId);
    const job = workItems.ensureArray(project?.agentJobs).find((entry) => (
      (item?.agentJobId && entry.id === item.agentJobId)
      || (promptRunId && entry.promptRunId === promptRunId)
      || entry.workItemId === item?.id
    )) || null;
    const run = workItems.ensureArray(project?.promptRuns).find((entry) => (
      (promptRunId && entry.id === promptRunId)
      || (job?.promptRunId && entry.id === job.promptRunId)
      || entry.workItemId === item?.id
    )) || null;
    return {
      latest,
      job,
      run,
      promptRunId: textOr(run?.id || job?.promptRunId || promptRunId),
      connectorRunId: textOr(job?.dispatchId || run?.id || job?.id || promptRunId),
    };
  }

  function applyApprovedOutput(project, item, attempts, actorUserId, at) {
    const linked = linkedExecution(project, item, attempts);
    const parsed = linked.run?.parsedOutput
      || deliveryOs.parseAgentJsonOutput(linked.latest?.rawOutput || '').parsed;
    if (parsed) {
      const beforeArtifactIds = new Set(workItems.ensureArray(project.artifacts).map((artifact) => artifact.id));
      const applyRun = linked.run || {
        id: linked.promptRunId || `task_result_${item.id}`,
        agentType: item.agentType,
        stageId: item.deliveryStageId,
        workItemId: item.id,
        agentRequestId: item.agentRequestId,
        createdAt: linked.latest?.createdAt || at,
      };
      deliveryOs.applyPromptRunOutput(project, applyRun, parsed, actorUserId, { normalizeRequirementRecord });
      project.artifacts = workItems.ensureArray(project.artifacts).map((artifact) => (
        beforeArtifactIds.has(artifact.id)
          ? artifact
          : {
            ...artifact,
            status: artifact.status || 'approved',
            stageId: artifact.stageId || item.deliveryStageId,
            provenance: {
              ...(artifact.provenance || {}),
              taskId: item.id,
              agentRequestId: item.agentRequestId,
              attemptId: linked.latest?.id,
              executor: linked.latest?.source || 'runtime',
            },
          }
      ));
      if (linked.run) {
        linked.run.status = 'applied';
        linked.run.reviewedAt = at;
        linked.run.reviewedBy = actorUserId;
      }
    }
    return linked;
  }

  function refreshRequestProgress(project, requestId, at) {
    const request = agentRequests.getAgentRequests(project).find((entry) => entry.id === requestId);
    if (!request) return null;
    const tasks = workItems.getWorkItems(project)
      .filter((entry) => entry.agentRequestId === request.id && entry.taskRole !== 'coordination');
    if (tasks.length && tasks.every((entry) => workItems.isTerminalStatus(entry.status))) {
      request.status = tasks.some((entry) => entry.status === 'failed') ? 'failed' : 'completed';
    } else if (tasks.some((entry) => entry.status === 'waiting_review')) {
      request.status = 'waiting_review';
    } else if (tasks.some((entry) => ['in_progress', 'waiting_input'].includes(entry.status))) {
      request.status = 'running';
    } else {
      request.status = 'ready';
    }
    request.updatedAt = at;
    project.agentRequests = agentRequests.getAgentRequests(project)
      .map((entry) => entry.id === request.id ? request : entry);
    return request;
  }

  async function cancelLinkedExecution(project, item) {
    const agentJob = workItems.ensureArray(project?.agentJobs).find((job) => (
      (item.agentJobId && job.id === item.agentJobId)
      || (item.promptRunId && job.promptRunId === item.promptRunId)
      || job.workItemId === item.id
    )) || null;
    if (!agentJob) return { requested: false, status: 'not_linked' };

    if (agentConnectionMode === 'remote_pull' && connectorStore) {
      const runId = agentJob.dispatchId || agentJob.id || agentJob.promptRunId;
      const current = connectorStore.findDispatch(runId);
      if (!current) return { requested: false, status: 'dispatch_not_found', agentJobId: agentJob.id };
      if (current.status === 'waiting_review') {
        const dispatch = connectorStore.markReviewed(current.id, 'rejected');
        return { requested: true, status: dispatch?.status || 'failed', dispatchId: current.id, agentJobId: agentJob.id };
      }
      if (['completed', 'failed', 'cancelled'].includes(current.status)) {
        return { requested: false, status: current.status, dispatchId: current.id, agentJobId: agentJob.id };
      }
      const dispatch = connectorStore.setDesiredAction(current.id, 'cancel', {
        idempotencyKey: `task:${item.id}:cancel`,
      });
      return { requested: true, status: dispatch?.status || 'cancel_requested', dispatchId: current.id, agentJobId: agentJob.id };
    }

    if (agentConnectionMode === 'local_push' && runtime && agentJob.yarJobId
      && ACTIVE_AGENT_STATUSES.has(String(agentJob.status || ''))) {
      await runtime.cancelJob(agentJob.yarJobId);
      return { requested: true, status: 'cancelled', agentJobId: agentJob.id };
    }
    return { requested: false, status: agentJob.status || 'inactive', agentJobId: agentJob.id };
  }

  function markLinkedExecutionCancelled(project, item, cancellation, actorUserId, at) {
    const job = workItems.ensureArray(project.agentJobs).find((entry) => entry.id === cancellation?.agentJobId);
    if (job && !['completed', 'failed', 'cancelled'].includes(job.status)) {
      job.status = ['cancelled', 'failed'].includes(cancellation?.status) ? 'cancelled' : 'cancel_requested';
      job.cancelReason = 'cancelled_from_task';
      job.cancelledBy = actorUserId;
      job.updatedAt = at;
    }
    const request = workItems.ensureArray(project.agentRequests).find((entry) => entry.id === item.agentRequestId);
    if (request && !['completed', 'cancelled', 'superseded'].includes(request.status)) {
      const remaining = workItems.getWorkItems(project).filter((entry) => (
        entry.id !== item.id
        && entry.agentRequestId === request.id
        && !workItems.isTerminalStatus(entry.status)
      ));
      request.status = item.taskRole === 'coordination' || !remaining.length ? 'cancelled' : 'ready';
      request.updatedAt = at;
    }
  }

  async function notifyActionable(store, project, payload = {}) {
    const task = payload.task || null;
    const request = payload.request || null;
    const recipientIds = [...new Set([
      task?.approverUserId, task?.assigneeUserId, request?.createdBy,
      ...workItems.ensureArray(project.members).filter((member) => member.role === 'partner').map((member) => member.userId),
    ].filter(Boolean))];
    const key = `${payload.type}:${task?.id || request?.id || ''}:${payload.version || task?.status || request?.status || ''}`;
    project.taskNotifications = workItems.ensureArray(project.taskNotifications);
    if (project.taskNotifications.some((entry) => entry.key === key)) return;
    const notification = {
      id: `tn_${require('crypto').randomUUID()}`, key, type: payload.type,
      title: payload.title, message: payload.message, taskId: task?.id || '',
      agentRequestId: request?.id || task?.agentRequestId || '', recipientUserIds: recipientIds,
      readByUserIds: [], createdAt: nowIso(),
    };
    project.taskNotifications.unshift(notification);
    project.taskNotifications = project.taskNotifications.slice(0, 500);
    if (typeof sendProjectEmail !== 'function') return;
    const users = workItems.ensureArray(store.users);
    const emails = [...new Set(recipientIds.map((id) => users.find((user) => user.id === id)?.email).filter(Boolean))];
    await Promise.all(emails.map((to) => sendProjectEmail({
      to, subject: `[YourLab] ${payload.title}`,
      text: `${payload.message}\n\nProjecto: ${project.name}\nAbra o projecto e consulte a página Tarefas.`,
    }).catch(() => ({ sent: false }))));
  }

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

  function acceptedItems(project) {
    return filterAcceptedWorkItems(project);
  }

  function acceptedVisibleItems(project, user) {
    return projectAccess.filterWorkItemsForViewer(acceptedItems(project), user, project);
  }

  function assertClientAssignmentVisibility(project, record) {
    const member = workItems.ensureArray(project.members).find((entry) => entry.userId === record.assigneeUserId);
    if (member?.role === 'client' && !record.clientVisible) throw new Error('Uma tarefa atribuida a um cliente tem de estar visivel para o cliente.');
  }

  app.get('/api/projects/projects/:projectId/work-items/meta', authMiddleware, loadProjectLiteForUser, async (req, res) => {
    const project = req.loadedProject;
    const user = req.auth.user;
    const all = workItems.getWorkItems(project);
    const visible = acceptedVisibleItems(project, user);
    const accepted = acceptedItems(project);
    const counts = workItems.computeMetaCounts(projectAccess.canManageWorkItems(user, project) ? accepted : visible);
    const canManage = projectAccess.canManageWorkItems(user, project);
    const tabVisible = projectAccess.canViewWorkItemsTab(user, project, all);
    const hasAssigned = projectAccess.viewerHasAssignedHumanWorkItems(user, project, all);
    return res.json({
      tabVisible,
      canManage,
      hasAssigned,
      counts,
      notifications: workItems.ensureArray(project.taskNotifications)
        .filter((entry) => !entry.recipientUserIds?.length || entry.recipientUserIds.includes(user.id))
        .filter((entry) => !workItems.ensureArray(entry.readByUserIds).includes(user.id))
        .slice(0, 5),
    });
  });

  app.get('/api/projects/projects/:projectId/work-items', authMiddleware, loadProjectLiteForUser, (req, res) => {
    const project = req.loadedProject;
    const user = req.auth.user;
    let list = acceptedVisibleItems(project, user);
    list = applyListFilters(list, req.query || {});
    if (req.query?.showCompleted !== 'true') list = list.filter((item) => !workItems.isTerminalStatus(item.status));
    if (req.query?.view === 'prioritized' || !req.query?.view) list = workItems.sortPrioritized(list);

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

  app.get('/api/projects/projects/:projectId/work-items/relevant', authMiddleware, loadProjectLiteForUser, (req, res) => {
    const relevant = workItems.relevantWorkItems(acceptedVisibleItems(req.loadedProject, req.auth.user), {
      deliveryStageId: req.query?.deliveryStageId || req.query?.stage,
      planPhaseId: req.query?.planPhaseId,
      limit: req.query?.limit,
    });
    return res.json({ workItems: workItems.toSlimCards(relevant) });
  });

  app.get('/api/projects/projects/:projectId/work-items/suggestions', authMiddleware, loadProjectLiteForUser, requireProjectEditor, (req, res) => {
    const suggestions = workItems.ensureArray(req.loadedProject.taskSuggestions).map((entry) => taskSuggestions.normalizeSuggestion(entry))
      .filter((entry) => !req.query?.status || entry.status === req.query.status);
    return res.json({ suggestions, automationRules: workItems.ensureArray(req.loadedProject.taskAutomationRules) });
  });

  app.post('/api/projects/projects/:projectId/work-items/suggestions/evaluate', authMiddleware, loadProjectLiteForUser, requireProjectEditor, async (req, res) => {
    try {
      let suggestions = [];
      await updateStore(async (store) => {
        const project = store.projects.find((entry) => entry.id === req.params.projectId);
        if (!project) throw new Error('Projeto nao encontrado.');
        workItems.migrateProjectWorkItems(project);
        workItemsSync.syncImplementationTasks(project);
        workItemsSync.syncDomainTasks(project, { createMissing: false });
        suggestions = taskSuggestions.evaluateProject(project, { now: nowIso() });
        suggestions = project.taskSuggestions;
        project.updatedAt = nowIso();
        appendActivity(store, { actorUserId: req.auth.user.id, projectId: req.params.projectId, action: 'task_suggestions_evaluated', details: { proposed: suggestions.filter((entry) => entry.status === 'proposed').length, automated: 0 } });
      });
      return res.json({ suggestions, automationRules: workItems.ensureArray(req.loadedProject.taskAutomationRules) });
    } catch (error) { return res.status(400).json({ message: error.message }); }
  });

  app.post('/api/projects/projects/:projectId/work-items/suggestions/:suggestionId/prepare', authMiddleware, loadProjectLiteForUser, requireProjectEditor, (req, res) => {
    try { return res.json(taskSuggestions.prepareSuggestion(req.loadedProject, req.params.suggestionId)); }
    catch (error) { return res.status(400).json({ message: error.message }); }
  });

  app.post('/api/projects/projects/:projectId/work-items/suggestions/:suggestionId/dismiss', authMiddleware, loadProjectLiteForUser, requireProjectEditor, async (req, res) => {
    try {
      let suggestion = null;
      await updateStore(async (store) => {
        const project = store.projects.find((entry) => entry.id === req.params.projectId);
        if (!project) throw new Error('Projeto nao encontrado.');
        suggestion = taskSuggestions.dismissSuggestion(project, req.params.suggestionId, nowIso());
        project.updatedAt = nowIso();
      });
      return res.json({ suggestion });
    } catch (error) { return res.status(400).json({ message: error.message }); }
  });

  app.patch('/api/projects/projects/:projectId/work-items/batch', authMiddleware, loadProjectLiteForUser, requireProjectEditor, async (req, res) => {
    try {
      const ids = [...new Set(workItems.ensureArray(req.body?.ids).map(String).filter(Boolean))];
      if (!ids.length) throw new Error('Seleccione pelo menos uma tarefa.');
      if (typeof req.body?.clientVisible !== 'boolean') throw new Error('clientVisible tem de ser booleano.');
      let updated = [];
      await updateStore(async (store) => {
        const project = store.projects.find((entry) => entry.id === req.params.projectId);
        if (!project) throw new Error('Projeto nao encontrado.');
        const items = workItems.getWorkItems(project);
        updated = items.filter((item) => ids.includes(item.id)).map((item) => workItems.normalizeWorkItem({ ...item, clientVisible: req.body.clientVisible, updatedAt: nowIso(), updatedBy: req.auth.user.id }, { project }));
        updated.forEach((item) => assertClientAssignmentVisibility(project, item));
        const byId = new Map(updated.map((item) => [item.id, item]));
        workItems.setWorkItems(project, items.map((item) => byId.get(item.id) || item));
        project.updatedAt = nowIso();
      });
      return res.json({ workItems: workItems.toSlimCards(updated) });
    } catch (error) { return res.status(400).json({ message: error.message }); }
  });

  app.patch('/api/projects/projects/:projectId/work-items/automations', authMiddleware, loadProjectLiteForUser, requireProjectEditor, async (req, res) => {
    return res.status(409).json({
      message: 'A criação automática foi desativada. Reveja a sugestão e confirme “Rever e criar” para a transformar numa tarefa real.',
    });
  });

  app.post('/api/projects/projects/:projectId/work-items/notifications/:notificationId/read', authMiddleware, loadProjectLiteForUser, async (req, res) => {
    try {
      await updateStore(async (store) => {
        const project = store.projects.find((entry) => entry.id === req.params.projectId);
        const notification = workItems.ensureArray(project?.taskNotifications).find((entry) => entry.id === req.params.notificationId);
        if (!notification) throw new Error('Notificacao nao encontrada.');
        if (notification.recipientUserIds?.length && !notification.recipientUserIds.includes(req.auth.user.id)) throw new Error('Sem permissao para esta notificacao.');
        notification.readByUserIds = [...new Set([...workItems.ensureArray(notification.readByUserIds), req.auth.user.id])];
      });
      return res.json({ ok: true });
    } catch (error) { return res.status(400).json({ message: error.message }); }
  });

  app.get('/api/projects/projects/:projectId/work-items/agent-requests', authMiddleware, loadProjectLiteForUser, (req, res) => {
    const project = req.loadedProject;
    const visibleIds = new Set(visibleItems(project, req.auth.user).map((item) => item.id));
    const requests = agentRequests.getAgentRequests(project).map((request) => {
      const tasks = workItems.getWorkItems(project).filter((item) => item.agentRequestId === request.id && visibleIds.has(item.id));
      return tasks.length ? agentRequests.requestSummary(request, tasks) : null;
    }).filter(Boolean);
    return res.json({ agentRequests: requests });
  });

  app.get('/api/projects/projects/:projectId/work-items/stage-transitions/config', authMiddleware, loadProjectLiteForUser, requireProjectEditor, (req, res) => {
    const { fromStageId, toStageId, direction = 'forward' } = req.query || {};
    const saved = stageTransitions.getConfig(req.loadedProject, fromStageId, toStageId, direction);
    return res.json({ config: saved || { key: stageTransitions.transitionKey(fromStageId, toStageId, direction), version: 0, values: stageTransitions.defaultConfig({}) } });
  });

  app.post('/api/projects/projects/:projectId/work-items/stage-transitions/preview', authMiddleware, loadProjectLiteForUser, requireProjectEditor, (req, res) => {
    try {
      const preview = stageTransitions.buildPreview(req.loadedProject, req.body || {}, { deliveryOs });
      return res.json({ preview: safeTransitionPreview(preview) });
    } catch (error) { return res.status(400).json({ message: error.message }); }
  });

  app.post('/api/projects/projects/:projectId/work-items/stage-transitions/requests', authMiddleware, loadProjectLiteForUser, requireProjectEditor, async (req, res) => {
    try {
      let result = null;
      await updateStore(async (store) => {
        const project = store.projects.find((entry) => entry.id === req.params.projectId);
        if (!project) throw new Error('Projeto nao encontrado.');
        result = stageTransitions.createRequest(project, req.body || {}, { actorUserId: req.auth.user.id, nowIso, deliveryOs });
        project.updatedAt = nowIso();
        appendActivity(store, { actorUserId: req.auth.user.id, projectId: project.id, action: 'stage_transition_request_created', details: { agentRequestId: result.request.id, parentTaskId: result.request.parentTaskId, transitionKey: result.request.transitionKey, regenerationMode: result.request.regenerationMode } });
      });
      return res.status(result.created ? 201 : 200).json({ agentRequest: result.request, workItems: result.tasks, parentTaskId: result.request.parentTaskId, preview: safeTransitionPreview(result.preview) });
    } catch (error) { return res.status(400).json({ message: error.message }); }
  });

  app.get('/api/projects/projects/:projectId/work-items/agent-requests/:requestId', authMiddleware, loadProjectLiteForUser, (req, res) => {
    const project = req.loadedProject;
    const request = agentRequests.getAgentRequests(project).find((entry) => entry.id === req.params.requestId);
    if (!request) return res.status(404).json({ message: 'Pedido do agente nao encontrado.' });
    const allowedIds = new Set(visibleItems(project, req.auth.user).map((item) => item.id));
    const tasks = workItems.getWorkItems(project).filter((item) => item.agentRequestId === request.id && allowedIds.has(item.id));
    if (!tasks.length) return res.status(403).json({ message: 'Sem permissao para ver este plano.' });
    return res.json({
      agentRequest: agentRequests.requestSummary(request, tasks),
      workItems: tasks.filter((task) => task.taskRole !== 'coordination'),
      parentTask: tasks.find((task) => task.taskRole === 'coordination') || null,
      canManage: projectAccess.canManageWorkItems(req.auth.user, project),
    });
  });

  app.post('/api/projects/projects/:projectId/work-items/agent-requests/plan', authMiddleware, loadProjectLiteForUser, requireProjectEditor, async (req, res) => {
    try {
      let result = null;
      await updateStore(async (store) => {
        const project = store.projects.find((entry) => entry.id === req.params.projectId);
        if (!project) throw new Error('Projeto nao encontrado.');
        result = agentRequests.createAgentRequest(project, req.body || {}, { actorUserId: req.auth.user.id, nowIso });
        project.updatedAt = nowIso();
        appendActivity(store, { actorUserId: req.auth.user.id, projectId: project.id, action: 'agent_request_planned', details: { agentRequestId: result.request.id, taskIds: result.tasks.map((task) => task.id), risk: result.request.risk } });
        if (result.request.status === 'awaiting_approval') await notifyActionable(store, project, { type: 'plan_approval', request: result.request, title: 'Plano do agente aguarda aprovação', message: `${result.request.title} tem ${result.tasks.length} tarefa(s) para rever.` });
      });
      return res.status(result.created ? 201 : 200).json({ agentRequest: result.request, workItems: result.tasks, created: result.created });
    } catch (error) { return res.status(400).json({ message: error.message }); }
  });

  app.post('/api/projects/projects/:projectId/work-items/agent-requests/:requestId/approve', authMiddleware, loadProjectLiteForUser, requireProjectEditor, async (req, res) => {
    try {
      let result = null;
      await updateStore(async (store) => {
        const project = store.projects.find((entry) => entry.id === req.params.projectId);
        if (!project) throw new Error('Projeto nao encontrado.');
        result = agentRequests.approveAgentRequest(project, req.params.requestId, req.auth.user.id, { nowIso });
        project.updatedAt = nowIso();
        appendActivity(store, { actorUserId: req.auth.user.id, projectId: project.id, action: 'agent_request_approved', details: { agentRequestId: req.params.requestId } });
      });
      return res.json({ agentRequest: result.request, workItems: result.tasks });
    } catch (error) { return res.status(400).json({ message: error.message }); }
  });

  app.post('/api/projects/projects/:projectId/work-items/agent-requests/:requestId/revision', authMiddleware, loadProjectLiteForUser, requireProjectEditor, async (req, res) => {
    try {
      let request = null;
      await updateStore(async (store) => {
        const project = store.projects.find((entry) => entry.id === req.params.projectId);
        if (!project) throw new Error('Projeto nao encontrado.');
        request = agentRequests.requestPlanRevision(project, req.params.requestId, req.body?.feedbackMarkdown, req.auth.user.id, { nowIso });
        project.updatedAt = nowIso();
      });
      return res.json({ agentRequest: request });
    } catch (error) { return res.status(400).json({ message: error.message }); }
  });

  app.patch('/api/projects/projects/:projectId/work-items/agent-requests/:requestId/plan', authMiddleware, loadProjectLiteForUser, requireProjectEditor, async (req, res) => {
    try {
      let result = null;
      await updateStore(async (store) => {
        const project = store.projects.find((entry) => entry.id === req.params.projectId);
        if (!project) throw new Error('Projeto nao encontrado.');
        const requests = agentRequests.getAgentRequests(project);
        const request = requests.find((entry) => entry.id === req.params.requestId);
        if (!request) throw new Error('Pedido do agente nao encontrado.');
        if (['running', 'completed'].includes(request.status)) throw new Error('Nao e permitido alterar um plano em execucao ou concluido.');
        const all = workItems.getWorkItems(project);
        const requestTasks = all.filter((task) => task.agentRequestId === request.id);
        const requestedOrder = workItems.ensureArray(req.body?.orderedTaskIds).map(String).filter((id) => requestTasks.some((task) => task.id === id));
        const order = requestedOrder.length ? requestedOrder : requestTasks.map((task) => task.id);
        if (!order.length) throw new Error('O plano tem de manter pelo menos uma tarefa.');
        const at = nowIso();
        const byId = new Map(requestTasks.map((task) => [task.id, task]));
        const revised = order.map((id, index) => workItems.normalizeWorkItem({
          ...byId.get(id), status: 'planned', dependencyTaskIds: index ? [order[index - 1]] : [],
          currentAction: 'A aguardar aprovacao do plano revisto.', updatedAt: at, updatedBy: req.auth.user.id,
          taskActivity: [...byId.get(id).taskActivity, { type: 'plan_revised', message: 'A ordem ou composicao do plano foi alterada.', actorType: 'human', actorId: req.auth.user.id, createdAt: at }],
        }, { project }));
        revised.forEach((task) => workItems.validateDependencies(task, revised));
        workItems.setWorkItems(project, [...revised, ...all.filter((task) => task.agentRequestId !== request.id)]);
        request.version += 1; request.status = 'awaiting_approval'; request.approval = null;
        request.taskIds = order; request.updatedAt = at;
        request.planVersions.push({ version: request.version, taskIds: order, createdAt: at, createdBy: req.auth.user.id });
        project.agentRequests = requests;
        project.updatedAt = at;
        result = { request: agentRequests.requestSummary(request, revised), tasks: revised };
      });
      return res.json({ agentRequest: result.request, workItems: result.tasks });
    } catch (error) { return res.status(400).json({ message: error.message }); }
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
    const linkedRequest = item.agentRequestId ? agentRequests.getAgentRequests(project).find((entry) => entry.id === item.agentRequestId) || null : null;
    const safeRequest = linkedRequest ? Object.fromEntries(Object.entries(linkedRequest).filter(([key]) => !['inputSnapshot', 'configSnapshot'].includes(key))) : null;
    const canManage = projectAccess.canManageWorkItems(user, project);
    const agentJob = canManage ? workItems.ensureArray(project.agentJobs).find((job) => (
      (item.agentJobId && job.id === item.agentJobId)
      || (item.promptRunId && job.promptRunId === item.promptRunId)
      || job.workItemId === item.id
    )) || null : null;
    const dispatch = agentJob && connectorStore
      ? connectorStore.findDispatch(agentJob.dispatchId || agentJob.id || agentJob.promptRunId)
      : null;
    const promptRun = workItems.ensureArray(project.promptRuns).find((run) => (
      (item.promptRunId && run.id === item.promptRunId)
      || (agentJob?.promptRunId && run.id === agentJob.promptRunId)
    )) || null;
    const latestAttempt = [...workItems.ensureArray(item.attempts)].reverse()
      .find((attempt) => attempt.rawOutput || attempt.resultSummaryMarkdown) || null;
    const humanReview = workItems.ensureArray(project.humanReviews).find((review) => (
      (promptRun?.id && review.promptRunId === promptRun.id)
      || (promptRun?.id && review.sourceType === 'prompt_run' && review.sourceId === promptRun.id)
    )) || null;
    const reviewRawOutput = textOr(
      latestAttempt?.rawOutput
      || promptRun?.rawOutput
      || humanReview?.suggestedChanges?.rawOutput,
    );
    return res.json({
      workItem: item,
      children: workItems.getWorkItems(project).filter((entry) => entry.parentTaskId === item.id),
      agentRequest: safeRequest,
      agentExecution: agentJob ? {
        runId: agentJob.id,
        status: dispatch?.status || agentJob.status,
        desiredAction: dispatch?.desiredAction || null,
        latestCommand: dispatch?.latestCommand || null,
        events: dispatch && connectorStore ? connectorStore.recentEvents(dispatch.id, 200) : [],
        checkpoint: dispatch?.checkpoint || {},
        reviewPacket: dispatch?.reviewPacket || {},
        progressCurrent: Number(dispatch?.progress?.completed ?? agentJob.subtasksCompleted) || 0,
        progressTotal: Number(dispatch?.progress?.total ?? agentJob.subtasksTotal) || 0,
        tokensUsed: Number(agentJob.tokensUsed) || 0,
        localTokensUsed: Number(dispatch?.progress?.localTokensUsed) || 0,
        externalTokensUsed: Number(dispatch?.progress?.externalTokensUsed) || 0,
        externalMaxTokens: Math.max(0, Number(dispatch?.progress?.externalMaxTokens) || 0),
        costUsed: Math.max(0, Number(dispatch?.progress?.costUsed) || 0),
        maxCost: Math.max(0, Number(dispatch?.progress?.maxCost) || 0),
        maxTokens: Math.max(0, Number(agentJob.budget?.maxTokens) || 0),
        maxWallClockMinutes: Math.max(0, Number(agentJob.budget?.maxWallClockMinutes) || 0),
        hardwareSafety: dispatch?.progress?.hardwareSafety || agentJob.hardwareSafety || {},
        bestEffort: agentJob.bestEffort === true,
        qualityWarnings: ensureArray(agentJob.qualityWarnings),
        error: agentJob.error || null,
        createdAt: agentJob.createdAt || null,
        updatedAt: dispatch?.updatedAt || agentJob.updatedAt || null,
      } : null,
      reviewTarget: (item.status === 'waiting_review' || reviewRawOutput || humanReview) ? {
        promptRunId: promptRun?.id || item.promptRunId || '',
        humanReviewId: humanReview?.id || '',
        status: humanReview?.status || item.status,
        title: humanReview?.title || `Resultado: ${item.title}`,
        summaryMarkdown: humanReview?.summaryMarkdown || item.resultSummaryMarkdown || '',
        bodyMarkdown: humanReview?.bodyMarkdown || '',
        rawOutput: reviewRawOutput,
        parsedOutput: promptRun?.parsedOutput || null,
        attemptId: latestAttempt?.id || '',
        resultHash: promptRun?.resultHash || dispatch?.resultHash || '',
      } : null,
      canManage,
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

        const suggestionDraft = body.suggestionId
          ? taskSuggestions.prepareSuggestion(project, textOr(body.suggestionId)).draft
          : null;

        const record = workItems.normalizeWorkItem({
          ...(suggestionDraft || {}),
          ...body,
          sourceRefs: body.sourceType && body.sourceId
            ? [...workItems.ensureArray(suggestionDraft?.sourceRefs), ...workItems.ensureArray(body.sourceRefs), { type: body.sourceType, id: body.sourceId, label: body.sourceLabel || '' }]
            : [...workItems.ensureArray(suggestionDraft?.sourceRefs), ...workItems.ensureArray(body.sourceRefs)],
          origin: body.origin || (body.executorMode === 'agent' ? 'agent' : 'human'),
          id: `witem_${require('crypto').randomUUID()}`,
          createdAt: nowIso(),
          updatedAt: nowIso(),
          createdBy: req.auth.user.id,
          updatedBy: req.auth.user.id,
        }, { project, actorUserId: req.auth.user.id, nowIso });

        const list = workItems.getWorkItems(project);
        assertClientAssignmentVisibility(project, record);
        workItems.validateHierarchy(record, [...list, record]);
        workItems.validateDependencies(record, [...list, record]);
        const uniqueTypes = new Set(['review', 'approval', 'execution_plan_task', 'agent_job', 'implementation_task']);
        const duplicate = workItems.ensureArray(record.sourceRefs).find((ref) => uniqueTypes.has(ref.type) && workItems.findBySourceRef(list, ref));
        if (duplicate) throw new Error('Ja existe uma tarefa para este elemento de origem.');
        list.unshift(record);
        workItems.setWorkItems(project, list.slice(0, 2000));
        if (body.suggestionId) taskSuggestions.acceptSuggestion(project, textOr(body.suggestionId), record.id, nowIso());
        project.updatedAt = nowIso();
        created = workItems.findWorkItem(project, record.id);

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
      const loadedItem = workItems.findWorkItem(req.loadedProject, workItemId);
      const cancelling = loadedItem && workItems.normalizeStatus(patch.status) === 'cancelled'
        && loadedItem.status !== 'cancelled';
      const cancellation = cancelling
        ? await cancelLinkedExecution(req.loadedProject, loadedItem)
        : null;

      let updated = null;
      await updateStore(async (store) => {
        const project = store.projects.find((entry) => entry.id === projectId);
        if (!project) throw new Error('Projeto nao encontrado.');

        const list = workItems.getWorkItems(project);
        const existing = list.find((item) => item.id === workItemId);
        if (!existing) throw new Error('Tarefa nao encontrada.');

        const merged = workItems.validateWorkItemForUpdate(patch, existing);
        if (existing.agentStatus === 'running' && ['executorMode', 'agentId', 'agentType', 'assigneeUserId', 'parentTaskId'].some((key) => patch[key] !== undefined)) {
          throw new Error('Nao e permitido alterar o executor ou a hierarquia de uma tarefa de agente em execucao.');
        }
        const record = workItems.normalizeWorkItem({
          ...merged,
          sourceRefs: patch.sourceType && patch.sourceId
            ? [...workItems.ensureArray(existing.sourceRefs).filter((ref) => !(ref.type === patch.sourceType && ref.id === patch.sourceId)), { type: patch.sourceType, id: patch.sourceId, label: patch.sourceLabel || '' }]
            : existing.sourceRefs,
          id: existing.id,
          origin: existing.origin,
          updates: existing.updates,
          createdAt: existing.createdAt,
          createdBy: existing.createdBy,
          updatedAt: nowIso(),
          updatedBy: req.auth.user.id,
        }, { project, actorUserId: req.auth.user.id, nowIso });

        const next = list.map((item) => (item.id === workItemId ? record : item));
        assertClientAssignmentVisibility(project, record);
        workItems.validateHierarchy(record, next);
        workItems.validateDependencies(record, next);
        workItems.setWorkItems(project, next);
        if (cancelling) markLinkedExecutionCancelled(project, existing, cancellation, req.auth.user.id, record.updatedAt);
        project.updatedAt = nowIso();
        updated = workItems.findWorkItem(project, workItemId);

        appendActivity(store, {
          actorUserId: req.auth.user.id,
          projectId,
          action: 'work_item_updated',
          details: { workItemId, status: updated.status },
        });
      });

      return res.json({ workItem: updated });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.get('/api/projects/projects/:projectId/work-items/:workItemId/execution-package', authMiddleware, loadProjectLiteForUser, (req, res) => {
    const project = req.loadedProject;
    const item = workItems.findWorkItem(project, req.params.workItemId);
    if (!item) return res.status(404).json({ message: 'Tarefa nao encontrada.' });
    if (!projectAccess.filterWorkItemsForViewer([item], req.auth.user, project).length) return res.status(403).json({ message: 'Sem permissao para ver esta tarefa.' });
    if (item.origin !== 'agent' || !item.executionPackage) return res.status(400).json({ message: 'Esta tarefa nao possui pacote de execucao.' });
    if (item.taskRole === 'coordination' || req.query?.scope === 'tree') {
      const pack = stageTransitions.buildTreePackage(project, item);
      return res.json({ workItemId: item.id, version: item.executionPackage?.version || 1, text: pack.text, envelope: pack.envelope, children: workItems.toSlimCards(pack.children), contextSnapshotHash: pack.contextSnapshotHash });
    }
    const output = workItems.ensureArray(item.expectedOutputs).map((entry) => `- ${entry.label}${entry.kind ? ` (${entry.kind})` : ''}`).join('\n');
    const text = [
      `# ${item.title}`,
      item.executionPackage.objective ? `\n## Objetivo\n${item.executionPackage.objective}` : '',
      item.executionPackage.contextMarkdown ? `\n## Contexto permitido\n${item.executionPackage.contextMarkdown}` : '',
      `\n## Instrucoes\n${item.executionPackage.instructions || item.descriptionMarkdown}`,
      output ? `\n## Resultados esperados\n${output}` : '',
      item.executionPackage.outputFormat ? `\n## Formato de resposta\n${item.executionPackage.outputFormat}` : '',
      `\n## Criterios de aceitacao\n${item.executionPackage.acceptanceCriteriaMarkdown || item.acceptanceCriteriaMarkdown || 'Produzir o resultado pedido de forma verificavel.'}`,
    ].filter(Boolean).join('\n');
    return res.json({ workItemId: item.id, version: item.executionPackage.version, text, expectedOutputs: item.expectedOutputs });
  });

  app.post('/api/projects/projects/:projectId/work-items/:workItemId/manual-output/bundle/preview', authMiddleware, loadProjectLiteForUser, requireProjectEditor, (req, res) => {
    try {
      const parent = workItems.findWorkItem(req.loadedProject, req.params.workItemId);
      if (!parent || parent.taskRole !== 'coordination') throw new Error('A tarefa indicada nao e uma tarefa-pai de coordenacao.');
      const checked = stageTransitions.validateBundle(req.loadedProject, parent, req.body?.rawOutput);
      return res.json({ valid: true, taskCount: checked.tasks.length, tasks: checked.tasks.map((task) => ({ id: task.id, title: task.title, packageVersion: task.executionPackage?.version || 1 })), requiresReview: true });
    } catch (error) { return res.status(400).json({ message: error.message, valid: false }); }
  });

  app.post('/api/projects/projects/:projectId/work-items/:workItemId/manual-output/bundle', authMiddleware, loadProjectLiteForUser, requireProjectEditor, async (req, res) => {
    try {
      let result = null;
      await updateStore(async (store) => {
        const project = store.projects.find((entry) => entry.id === req.params.projectId);
        const parent = workItems.findWorkItem(project, req.params.workItemId);
        if (!parent || parent.taskRole !== 'coordination') throw new Error('A tarefa indicada nao e uma tarefa-pai de coordenacao.');
        const checked = stageTransitions.validateBundle(project, parent, req.body?.rawOutput);
        const at = nowIso(); const outputById = new Map(checked.outputs.map((row) => [row.taskId, row]));
        const next = workItems.getWorkItems(project).map((task) => {
          const row = outputById.get(task.id); if (!row) return task;
          const rawOutput = typeof row.output === 'string' ? row.output : JSON.stringify(row.output, null, 2);
          const attempt = { id: `attempt_${require('crypto').randomUUID()}`, number: task.attempts.length + 1, source: 'manual', status: 'completed', submittedBy: req.auth.user.id, rawOutput, resultSummaryMarkdown: rawOutput.slice(0, 4000), packageVersion: row.packageVersion, contextSnapshotHash: checked.request.inputFingerprint, createdAt: at, completedAt: at, updatedAt: at };
          return workItems.normalizeWorkItem({ ...task, status: 'waiting_review', agentStatus: 'pending_human_review', resultSummaryMarkdown: rawOutput.slice(0, 4000), currentAction: 'O resultado do pacote aguarda revisao.', attempts: [...task.attempts, attempt], taskActivity: [...task.taskActivity, { type: 'bundle_output_submitted', message: 'Resultado recebido através da tarefa-pai e enviado para revisao.', actorType: 'human', actorId: req.auth.user.id, createdAt: at }], updatedAt: at, updatedBy: req.auth.user.id }, { project });
        });
        workItems.setWorkItems(project, next); project.updatedAt = at;
        result = { parent: workItems.findWorkItem(project, parent.id), children: workItems.getWorkItems(project).filter((task) => task.parentTaskId === parent.id) };
        appendActivity(store, { actorUserId: req.auth.user.id, projectId: project.id, action: 'work_item_bundle_submitted', details: { parentTaskId: parent.id, taskCount: checked.tasks.length } });
        await notifyActionable(store, project, { type: 'task_review', task: result.parent, request: checked.request, title: 'Pacote completo pronto para revisao', message: `O pedido “${parent.title}” tem ${checked.tasks.length} resultado(s) para validar.` });
      });
      return res.json({ workItem: result.parent, children: result.children });
    } catch (error) { return res.status(400).json({ message: error.message }); }
  });

  app.post('/api/projects/projects/:projectId/work-items/:workItemId/review-bundle', authMiddleware, loadProjectLiteForUser, requireProjectEditor, async (req, res) => {
    try {
      const action = textOr(req.body?.action); const feedback = textOr(req.body?.feedbackMarkdown);
      if (!['approved', 'changes_requested', 'rejected'].includes(action)) throw new Error('Decisao de revisao invalida.');
      if (action !== 'approved' && !feedback) throw new Error('O feedback e obrigatorio.');
      let result = null;
      let connectorRunId = '';
      await updateStore(async (store) => {
        const project = store.projects.find((entry) => entry.id === req.params.projectId); const at = nowIso();
        const parent = workItems.findWorkItem(project, req.params.workItemId); if (!parent || parent.taskRole !== 'coordination') throw new Error('Tarefa-pai nao encontrada.');
        const children = workItems.getWorkItems(project).filter((task) => task.parentTaskId === parent.id && task.status === 'waiting_review');
        if (!children.length) throw new Error('Nao existem resultados a aguardar revisao.');
        connectorRunId = children.map((child) => child.attempts[child.attempts.length - 1]?.promptRunId).find(Boolean) || '';
        if (action === 'approved') {
          project.artifacts = ensureArray(project.artifacts);
          for (const child of children) {
            const latest = child.attempts[child.attempts.length - 1];
            if (!latest?.rawOutput) throw new Error(`A tarefa ${child.title} nao tem um resultado aplicavel.`);
            const linkedRun = child.promptRunId ? ensureArray(project.promptRuns).find((run) => run.id === child.promptRunId) : null;
            if (linkedRun?.parsedOutput) deliveryOs.applyPromptRunOutput(project, linkedRun, linkedRun.parsedOutput, req.auth.user.id, { normalizeRequirementRecord });
            if (!project.artifacts.some((artifact) => artifact.provenance?.taskId === child.id && artifact.provenance?.attemptId === latest.id)) project.artifacts.unshift({ id: `artifact_${require('crypto').randomUUID()}`, type: child.expectedOutputs[0]?.kind || 'other', name: child.expectedOutputs[0]?.label || child.title, stageId: child.deliveryStageId, status: 'approved', description: latest.resultSummaryMarkdown, bodyMarkdown: latest.rawOutput, provenance: { taskId: child.id, agentRequestId: child.agentRequestId, attemptId: latest.id, executor: latest.source }, createdAt: at, updatedAt: at, createdBy: req.auth.user.id });
          }
        }
        const nextStatus = action === 'approved' ? 'completed' : action === 'changes_requested' ? 'ready' : 'failed';
        const next = workItems.getWorkItems(project).map((task) => children.some((child) => child.id === task.id) ? workItems.normalizeWorkItem({ ...task, status: nextStatus, agentStatus: action === 'approved' ? 'completed' : action === 'changes_requested' ? 'revision_requested' : 'rejected', currentAction: action === 'approved' ? 'Resultado aprovado.' : action === 'changes_requested' ? 'Alteracoes pedidas; pronta para nova tentativa.' : 'Resultado rejeitado.', taskActivity: [...task.taskActivity, { type: `bundle_review_${action}`, message: action === 'approved' ? 'Resultado aprovado no pacote.' : feedback, actorType: 'human', actorId: req.auth.user.id, createdAt: at }], updatedAt: at, updatedBy: req.auth.user.id }, { project }) : task);
        workItems.setWorkItems(project, next); const request = agentRequests.getAgentRequests(project).find((entry) => entry.id === parent.agentRequestId);
        if (request) { request.status = action === 'approved' ? 'completed' : action === 'changes_requested' ? 'ready' : 'failed'; request.updatedAt = at; project.agentRequests = agentRequests.getAgentRequests(project).map((entry) => entry.id === request.id ? request : entry); }
        project.updatedAt = at; result = { parent: workItems.findWorkItem(project, parent.id), children: workItems.getWorkItems(project).filter((task) => task.parentTaskId === parent.id) };
        appendActivity(store, { actorUserId: req.auth.user.id, projectId: project.id, action: `work_item_bundle_review_${action}`, details: { parentTaskId: parent.id, taskIds: children.map((child) => child.id) } });
      });
      if (connectorRunId && connectorStore) connectorStore.markReviewed(connectorRunId, action);
      return res.json({ workItem: result.parent, children: result.children });
    } catch (error) { return res.status(400).json({ message: error.message }); }
  });

  app.post('/api/projects/projects/:projectId/work-items/:workItemId/execution-settings', authMiddleware, loadProjectLiteForUser, requireProjectEditor, async (req, res) => {
    try {
      let result = null;
      await updateStore(async (store) => {
        const project = store.projects.find((entry) => entry.id === req.params.projectId); const item = workItems.findWorkItem(project, req.params.workItemId);
        if (!item) throw new Error('Tarefa nao encontrada.');
        const request = agentRequests.getAgentRequests(project).find((entry) => entry.id === item.agentRequestId) || null;
        const current = workItems.normalizeExecutionSettings(item.executionSettings); const proposed = workItems.normalizeExecutionSettings({ ...current, ...(req.body?.settings || {}) });
        const shaping = ['modelProfileId', 'targetInputTokens', 'targetOutputTokens', 'maxSubtasks']; const requiresRevision = shaping.some((key) => String(current[key]) !== String(proposed[key]));
        const revisesCoordinationPlan = item.taskRole === 'coordination' && requiresRevision;
        if (revisesCoordinationPlan && req.body?.revisePlan !== true) { const error = new Error('Estas alterações mudam os prompts e a divisão das tarefas.'); error.code = 'REQUIRES_REVISION'; throw error; }
        if (revisesCoordinationPlan) {
          if (!request) throw new Error('Pedido do agente nao encontrado.');
          const match = request.transitionKey.match(/^(.+)->(.+):(forward|backward)$/); if (!match) throw new Error('Este pedido nao possui uma transição versionada.');
          const created = stageTransitions.createRequest(project, { fromStageId: match[1], toStageId: match[2], direction: match[3], regenerationMode: 'full', config: { ...request.configSnapshot, ...proposed }, idempotencyKey: `settings-revision:${request.id}:${nowIso()}` }, { actorUserId: req.auth.user.id, nowIso, deliveryOs });
          result = { revised: true, agentRequest: created.request, parentTaskId: created.request.parentTaskId, workItems: created.tasks };
        } else {
          const at = nowIso();
          const targetsTree = item.taskRole === 'coordination';
          const nextSettings = { ...proposed, version: (current.version || 1) + 1 };
          const next = workItems.getWorkItems(project).map((task) => (
            task.id === item.id || (targetsTree && task.parentTaskId === item.id)
              ? workItems.normalizeWorkItem({
                ...task,
                executionSettings: nextSettings,
                agentId: proposed.agentId || task.agentId,
                updatedAt: at,
                updatedBy: req.auth.user.id,
              }, { project })
              : task
          ));
          workItems.setWorkItems(project, next);
          result = {
            revised: false,
            appliesTo: targetsTree ? 'tree' : 'task',
            appliesOnNextAttempt: ['in_progress', 'waiting_input'].includes(item.status),
            workItem: workItems.findWorkItem(project, item.id),
            children: targetsTree
              ? workItems.getWorkItems(project).filter((task) => task.parentTaskId === item.id)
              : [],
          };
        }
        project.updatedAt = nowIso();
      });
      return res.json(result);
    } catch (error) { return res.status(error.code === 'REQUIRES_REVISION' ? 409 : 400).json({ message: error.message, requiresRevision: error.code === 'REQUIRES_REVISION' }); }
  });

  app.post('/api/projects/projects/:projectId/work-items/:workItemId/manual-output/preview', authMiddleware, loadProjectLiteForUser, requireProjectEditor, (req, res) => {
    const rawOutput = textOr(req.body?.rawOutput);
    if (!rawOutput) return res.status(400).json({ message: 'Cole o resultado da execucao manual.' });
    let parsedOutput = null; let validJson = false;
    try { parsedOutput = JSON.parse(rawOutput); validJson = true; } catch { /* free-form artifact */ }
    const keys = validJson && parsedOutput && typeof parsedOutput === 'object' ? Object.keys(parsedOutput).slice(0, 20) : [];
    return res.json({
      valid: true, format: validJson ? 'json' : 'text', parsedOutput,
      preview: validJson ? `${keys.length} secoes estruturadas: ${keys.join(', ') || 'objeto vazio'}` : `${rawOutput.length} caracteres de resultado livre`,
      requiresReview: true,
    });
  });

  app.post('/api/projects/projects/:projectId/work-items/:workItemId/manual-output', authMiddleware, loadProjectLiteForUser, requireProjectEditor, async (req, res) => {
    try {
      const rawOutput = textOr(req.body?.rawOutput);
      if (!rawOutput) throw new Error('Cole o resultado da execucao manual.');
      let updated = null;
      await updateStore(async (store) => {
        const project = store.projects.find((entry) => entry.id === req.params.projectId);
        if (!project) throw new Error('Projeto nao encontrado.');
        const list = workItems.getWorkItems(project);
        const item = list.find((entry) => entry.id === req.params.workItemId);
        if (!item) throw new Error('Tarefa nao encontrada.');
        if (item.origin !== 'agent') throw new Error('A execucao manual esta disponivel apenas para tarefas de agente.');
        const at = nowIso();
        const attempt = {
          id: `attempt_${require('crypto').randomUUID()}`, number: item.attempts.length + 1,
          source: 'manual', status: 'completed', submittedBy: req.auth.user.id,
          rawOutput, resultSummaryMarkdown: rawOutput.slice(0, 4000), createdAt: at, completedAt: at, updatedAt: at,
        };
        if (item.promptRunId) {
          const run = ensureArray(project.promptRuns).find((entry) => entry.id === item.promptRunId);
          const parsed = deliveryOs.parseAgentJsonOutput(rawOutput).parsed;
          if (run) {
            run.rawOutput = rawOutput; run.parsedOutput = parsed; run.status = 'pending_review';
            deliveryOs.upsertHumanReviewFromPromptRun(project, run, parsed, rawOutput);
          }
        }
        updated = workItems.normalizeWorkItem({
          ...item, status: 'waiting_review', agentStatus: 'pending_human_review',
          resultSummaryMarkdown: rawOutput.slice(0, 4000), currentAction: 'O resultado manual aguarda revisao.',
          attempts: [...item.attempts, attempt],
          taskActivity: [...item.taskActivity, { type: 'manual_output_submitted', message: 'Resultado manual submetido para revisao.', actorType: 'human', actorId: req.auth.user.id, createdAt: at }],
          updatedAt: at, updatedBy: req.auth.user.id,
        }, { project });
        workItems.setWorkItems(project, list.map((entry) => entry.id === item.id ? updated : entry));
        project.updatedAt = at;
        appendActivity(store, { actorUserId: req.auth.user.id, projectId: project.id, action: 'work_item_manual_output_submitted', details: { workItemId: item.id, attemptId: attempt.id } });
        await notifyActionable(store, project, { type: 'task_review', task: updated, title: 'Resultado pronto para revisão', message: `A tarefa “${updated.title}” tem um resultado manual para validar.` });
      });
      return res.json({ workItem: updated });
    } catch (error) { return res.status(400).json({ message: error.message }); }
  });

  app.post('/api/projects/projects/:projectId/work-items/:workItemId/review', authMiddleware, loadProjectLiteForUser, requireProjectEditor, async (req, res) => {
    try {
      const action = textOr(req.body?.action);
      if (!['approved', 'changes_requested', 'rejected'].includes(action)) throw new Error('Decisao de revisao invalida.');
      const feedback = textOr(req.body?.feedbackMarkdown);
      if (action !== 'approved' && !feedback) throw new Error('O feedback e obrigatorio ao pedir alteracoes ou rejeitar.');
      let updated = null;
      let connectorRunId = '';
      let reviewRunId = '';
      let nextWorkItem = null;
      let updatedRequest = null;
      await updateStore(async (store) => {
        const project = store.projects.find((entry) => entry.id === req.params.projectId);
        if (!project) throw new Error('Projeto nao encontrado.');
        const list = workItems.getWorkItems(project);
        const item = list.find((entry) => entry.id === req.params.workItemId);
        if (!item) throw new Error('Tarefa nao encontrada.');
        if (item.status !== 'waiting_review') throw new Error('Esta tarefa nao esta a aguardar revisao.');
        const at = nowIso();
        const nextStatus = action === 'approved' ? 'completed' : action === 'changes_requested' ? 'ready' : 'failed';
        const attempts = item.attempts.map((attempt, index, all) => index === all.length - 1 && feedback ? { ...attempt, feedbackMarkdown: feedback, updatedAt: at } : attempt);
        const linked = linkedExecution(project, item, attempts);
        connectorRunId = linked.connectorRunId;
        reviewRunId = linked.promptRunId;
        if (action === 'approved') {
          const latest = attempts[attempts.length - 1];
          applyApprovedOutput(project, item, attempts, req.auth.user.id, at);
          project.artifacts = ensureArray(project.artifacts);
          const existingArtifact = project.artifacts.find((artifact) => artifact.provenance?.taskId === item.id && artifact.provenance?.attemptId === latest?.id);
          if (!existingArtifact && latest?.rawOutput) project.artifacts.unshift({
            id: `artifact_${require('crypto').randomUUID()}`, type: item.expectedOutputs[0]?.kind || 'other',
            name: item.expectedOutputs[0]?.label || item.title, stageId: item.deliveryStageId,
            status: 'approved', description: latest.resultSummaryMarkdown, bodyMarkdown: latest.rawOutput,
            provenance: { taskId: item.id, agentRequestId: item.agentRequestId, attemptId: latest.id, executor: latest.source },
            createdAt: at, updatedAt: at, createdBy: req.auth.user.id,
          });
        }
        if (linked.job) {
          linked.job.status = action === 'approved' ? 'completed'
            : action === 'changes_requested' ? 'revision_requested' : 'failed';
          linked.job.updatedAt = at;
        }
        updated = workItems.normalizeWorkItem({
          ...item, status: nextStatus,
          agentStatus: action === 'approved' ? 'completed' : action === 'changes_requested' ? 'revision_requested' : 'rejected',
          currentAction: action === 'approved' ? 'Resultado aprovado e aplicado como artefacto do projecto.' : action === 'changes_requested' ? 'Alteracoes pedidas; pronta para nova tentativa.' : 'Resultado rejeitado.',
          attempts,
          taskActivity: [...item.taskActivity, { type: `review_${action}`, message: action === 'approved' ? 'Resultado aprovado.' : action === 'changes_requested' ? `Alteracoes pedidas: ${feedback}` : `Resultado rejeitado: ${feedback}`, actorType: 'human', actorId: req.auth.user.id, createdAt: at }],
          updatedAt: at, updatedBy: req.auth.user.id,
        }, { project });
        const linkedReview = ensureArray(project.humanReviews).find((review) => (
          reviewRunId
          && (review.promptRunId === reviewRunId
            || (review.sourceType === 'prompt_run' && review.sourceId === reviewRunId))
        ));
        if (linkedReview) {
          linkedReview.status = action === 'approved' ? 'approved'
            : action === 'changes_requested' ? 'changes_requested' : 'rejected';
          linkedReview.resolutionNotes = feedback;
          linkedReview.resolvedAt = at;
          linkedReview.resolvedBy = req.auth.user.id;
        }
        let next = list.map((entry) => entry.id === item.id ? updated : entry);
        if (action === 'approved') {
          next = next.map((entry) => entry.status === 'planned' && entry.dependencyTaskIds.includes(item.id)
            && entry.dependencyTaskIds.every((id) => next.some((candidate) => candidate.id === id && workItems.isTerminalStatus(candidate.status)))
            ? workItems.normalizeWorkItem({ ...entry, status: 'ready', currentAction: 'Pronta para começar.', updatedAt: at }, { project })
            : entry);
        }
        workItems.setWorkItems(project, next);
        updatedRequest = refreshRequestProgress(project, item.agentRequestId, at);
        nextWorkItem = action === 'approved'
          ? workItems.getWorkItems(project).find((entry) => (
            entry.agentRequestId === item.agentRequestId
            && entry.taskRole !== 'coordination'
            && entry.status === 'ready'
          )) || null
          : null;
        taskSuggestions.evaluateProject(project, { now: at });
        project.updatedAt = at;
        appendActivity(store, { actorUserId: req.auth.user.id, projectId: project.id, action: `work_item_review_${action}`, details: { workItemId: item.id } });
      });
      let connectorDispatch = null;
      if (connectorRunId && connectorStore) {
        const current = connectorStore.findDispatch(connectorRunId);
        connectorDispatch = current?.status === 'waiting_review'
          ? connectorStore.markReviewed(current.id, action)
          : current;
      }
      return res.json({
        workItem: updated,
        agentRequest: updatedRequest,
        nextWorkItem,
        connectorReleased: !connectorRunId
          || ['completed', 'failed', 'cancelled'].includes(connectorDispatch?.status),
      });
    } catch (error) { return res.status(400).json({ message: error.message }); }
  });

  app.post('/api/projects/projects/:projectId/work-items/:workItemId/assume-human', authMiddleware, loadProjectLiteForUser, requireProjectEditor, async (req, res) => {
    req.body = { ...(req.body || {}), executorMode: 'human', assigneeUserId: req.body?.assigneeUserId || req.auth.user.id, agentId: '' };
    const project = req.loadedProject;
    const item = workItems.findWorkItem(project, req.params.workItemId);
    if (!item || item.agentStatus === 'running') return res.status(400).json({ message: 'Nao e possivel assumir esta tarefa neste momento.' });
    try {
      let updated = null;
      await updateStore(async (store) => {
        const mutable = store.projects.find((entry) => entry.id === req.params.projectId);
        const list = workItems.getWorkItems(mutable);
        const existing = list.find((entry) => entry.id === req.params.workItemId);
        updated = workItems.normalizeWorkItem({ ...existing, executorMode: 'human', assigneeUserId: req.body.assigneeUserId, agentId: '', currentAction: 'A tarefa sera executada por uma pessoa.', updatedAt: nowIso(), updatedBy: req.auth.user.id }, { project: mutable });
        workItems.setWorkItems(mutable, list.map((entry) => entry.id === existing.id ? updated : entry));
      });
      return res.json({ workItem: updated });
    } catch (error) { return res.status(400).json({ message: error.message }); }
  });

  app.delete('/api/projects/projects/:projectId/work-items/:workItemId', authMiddleware, loadProjectLiteForUser, requireProjectEditor, async (req, res) => {
    try {
      const projectId = req.params.projectId;
      const workItemId = req.params.workItemId;
      const loadedItem = workItems.findWorkItem(req.loadedProject, workItemId);
      if (!loadedItem) throw new Error('Tarefa nao encontrada.');
      const cancellation = await cancelLinkedExecution(req.loadedProject, loadedItem);

      await updateStore(async (store) => {
        const project = store.projects.find((entry) => entry.id === projectId);
        if (!project) throw new Error('Projeto nao encontrado.');

        const list = workItems.getWorkItems(project);
        const existing = list.find((item) => item.id === workItemId);
        if (!existing) throw new Error('Tarefa nao encontrada.');
        if (list.some((item) => item.parentTaskId === workItemId)) throw new Error('Remova ou reatribua as subtarefas antes de remover a tarefa-pai.');

        const tombstone = workItems.addWorkItemTombstone(project, existing, {
          deletedAt: nowIso(),
          deletedBy: req.auth.user.id,
          reason: textOr(req.body?.reason, 'deleted_from_tasks'),
        });
        markLinkedExecutionCancelled(project, existing, cancellation, req.auth.user.id, nowIso());
        workItems.setWorkItems(project, list.filter((item) => item.id !== workItemId));
        project.updatedAt = nowIso();

        appendActivity(store, {
          actorUserId: req.auth.user.id,
          projectId,
          action: 'work_item_deleted',
          details: {
            workItemId,
            tombstoneId: tombstone?.id || '',
            agentCancellationStatus: cancellation.status,
            dispatchId: cancellation.dispatchId || '',
          },
        });
      });

      return res.json({ ok: true, cancellation });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.post('/api/projects/projects/:projectId/work-item-tombstones/:tombstoneId/restore', authMiddleware, loadProjectLiteForUser, requireProjectEditor, async (req, res) => {
    try {
      let restored = null;
      await updateStore(async (store) => {
        const project = store.projects.find((entry) => entry.id === req.params.projectId);
        if (!project) throw new Error('Projeto nao encontrado.');
        restored = workItems.restoreWorkItemTombstone(project, req.params.tombstoneId);
        if (!restored) throw new Error('Registo de tarefa eliminada nao encontrado.');
        project.updatedAt = nowIso();
        appendActivity(store, {
          actorUserId: req.auth.user.id,
          projectId: project.id,
          action: 'work_item_tombstone_restored',
          details: { tombstoneId: restored.id, workItemId: restored.workItemId },
        });
      });
      return res.json({ restored });
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

module.exports = { registerWorkItemRoutes, filterAcceptedWorkItems };
