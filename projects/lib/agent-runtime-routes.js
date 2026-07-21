const crypto = require('crypto');
const deliveryOs = require('./delivery-os');
const workItems = require('./work-items');
const workItemsSync = require('./work-items-sync');
const agentRequests = require('./agent-requests');
const projectAccess = require('./project-access');
const stageTransitions = require('./stage-transition-requests');
const { normalizeMode } = require('./agent-connection-mode');
const { registerAgentConnectorRoutes } = require('./agent-connector-routes');
const engineeringState = require('./engineering-state');
const agentPlatformSettings = require('./agent-platform-settings');
const { resolveRuntimeReachability } = require('./work-items-routes');
const {
  CONTRACT_ID,
  CONTRACT_VERSION,
  buildFrozenTaskPackage,
  findCompatibleAgent,
  publicDispatch,
} = require('./agent-connector-contract');
const LEGACY_AGENT_MANIFESTS = {
  'idea-augment': { skills: ['product_discovery'], tools: ['project.read'] },
  'idea-to-requirements': { skills: ['product_discovery', 'requirements_engineering'], tools: ['project.read', 'requirements.read'] },
  'requirements-to-architecture': { skills: ['requirements_engineering', 'solution_architecture'], tools: ['project.read', 'requirements.read', 'documents.read'] },
  'architecture-to-roadmap': { skills: ['solution_architecture', 'delivery_planning'], tools: ['project.read', 'requirements.read'] },
  'roadmap-to-implementation': { skills: ['delivery_planning', 'software_delivery'], tools: ['project.read', 'requirements.read', 'documents.read'] },
};

function textOr(value, fallback = '') {
  if (value === null || value === undefined) return fallback;
  return String(value).trim();
}

function serviceAuthMiddleware(req, res, next) {
  if (normalizeMode(process.env.AGENT_CONNECTION_MODE, process.env.NODE_ENV) !== 'local_push') {
    return res.status(404).json({ message: 'Endpoint de serviço local desativado.' });
  }
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  const expected = String(process.env.PLATFORM_SERVICE_TOKEN || process.env.AGENT_RUNTIME_API_KEY || '').trim();

  if (!expected || token !== expected) {
    return res.status(401).json({ message: 'Service token invalido.' });
  }

  req.serviceAuth = true;
  return next();
}

function buildPromptForAgentType(project, agentType, body = {}) {
  if (agentType === 'requirement_grouping') {
    return {
      fullPrompt: deliveryOs.buildGroupingPrompt(project),
      targetOutput: 'grouping_json',
      contextPack: {},
    };
  }
  if (agentType === 'idea_augment') {
    return {
      fullPrompt: deliveryOs.buildIdeaAugmentPrompt(project),
      targetOutput: 'idea_brief',
      contextPack: {},
    };
  }
  if (agentType === 'reverse_idea') {
    return {
      fullPrompt: deliveryOs.buildReverseIdeaPrompt(project),
      targetOutput: 'idea_brief',
      contextPack: {},
    };
  }
  if (agentType === 'discovery_research') {
    return {
      fullPrompt: deliveryOs.buildDiscoveryPrompt(project),
      targetOutput: 'discovery_v2',
      contextPack: {},
    };
  }
  if (agentType === 'roadmap_plan') {
    return {
      fullPrompt: deliveryOs.buildRoadmapPrompt(project),
      targetOutput: 'roadmap_v1',
      contextPack: {},
    };
  }
  if (agentType === 'implementation_stack') {
    return {
      fullPrompt: deliveryOs.buildImplementationStackPrompt(project),
      targetOutput: 'implementation_stack_v1',
      contextPack: {},
    };
  }
  if (agentType === 'implementation_tasks') {
    return {
      fullPrompt: deliveryOs.buildImplementationTasksPrompt(project),
      targetOutput: 'implementation_tasks_v1',
      contextPack: {},
    };
  }
  if (agentType === 'requirements_to_architecture') {
    const contextPack = deliveryOs.buildArchitectureContextPack(project, body.capabilityId, body.moduleTag);
    return {
      fullPrompt: deliveryOs.buildArchitecturePackPrompt(project, body.capabilityId, body.moduleTag),
      targetOutput: 'architecture_pack_v2',
      contextPack,
    };
  }

  const contextPack = deliveryOs.buildContextPack(project, {
    stageId: body.stageId,
    capabilityId: body.capabilityId,
  });

  return {
    fullPrompt: deliveryOs.buildPromptRunFull(
      textOr(body.systemPrompt, 'Tu és um agente de systems engineering YourLab.'),
      textOr(body.stageInstruction, `Stage: ${body.stageId || 'requirements'}`),
      contextPack,
      textOr(body.taskPrompt, body.task || ''),
      textOr(body.outputSchema, 'JSON válido apenas.')
    ),
    targetOutput: textOr(body.targetOutput, 'json'),
    contextPack,
  };
}

const RUNTIME_ACTIVE_STATUSES = new Set([
  'dispatching', 'queued', 'claimed', 'running', 'planning', 'executing',
  'self_review', 'verifying', 'paused',
  'cancel_requested', 'connection_lost',
]);

const STALE_DISPATCH_MS = 120000;
const BUDGET_FIELDS = [
  'maxTokens',
  'externalMaxTokens',
  'maxCost',
  'maxWallClockMinutes',
  'maxSubtasks',
  'planningWaveSize',
  'maxTotalSteps',
];

function resolveExecutionConfig(connectionMode, request, task, bodyOptions = {}, bodyBudget = {}) {
  const requestOptions = request?.runtimeConfig?.options || {};
  const requestBudget = request?.runtimeConfig?.budget || {};
  if (connectionMode !== 'remote_pull') {
    return {
      options: { ...requestOptions, ...bodyOptions },
      budget: { ...requestBudget, ...(bodyBudget || {}) },
    };
  }
  const approvedSettings = workItems.normalizeExecutionSettings({
    ...requestOptions,
    ...(task?.executionSettings && typeof task.executionSettings === 'object'
      ? task.executionSettings
      : {}),
  });
  const budget = { ...requestBudget };
  for (const key of BUDGET_FIELDS) {
    const value = Number(approvedSettings[key]);
    if (Number.isFinite(value) && value >= 0) budget[key] = value;
  }
  return {
    options: {
      ...requestOptions,
      ...approvedSettings,
      executionSettings: approvedSettings,
    },
    budget,
  };
}

function selectReadyAgentTask(tasks, requestedTaskId) {
  const list = Array.isArray(tasks) ? tasks : [];
  const requested = list.find((task) => task.id === requestedTaskId);
  if (requested?.status === 'ready') return requested;
  if (
    requested?.taskRole === 'coordination'
    && list.some((task) => task.parentTaskId === requested.id && task.status === 'ready')
  ) {
    return requested;
  }
  return list.find((task) => task.taskRole !== 'coordination' && task.status === 'ready')
    || null;
}

function resolveContinuousExecutionTask(tasks, requestedTask) {
  if (!requestedTask || requestedTask.taskRole === 'coordination' || !requestedTask.parentTaskId) {
    return requestedTask || null;
  }
  const list = Array.isArray(tasks) ? tasks : [];
  const parent = list.find((task) => (
    task.id === requestedTask.parentTaskId && task.taskRole === 'coordination'
  ));
  if (!parent) return requestedTask;
  const settings = workItems.normalizeExecutionSettings(
    requestedTask.executionSettings || parent.executionSettings || {}
  );
  return settings.reviewPolicy?.subtask === 'blocking' ? requestedTask : parent;
}

const RESTARTABLE_TASK_STATUSES = new Set([
  'failed', 'blocked', 'cancelled', 'waiting_input', 'in_progress',
]);

function resetTaskForRestart(project, requestedTaskId, options = {}) {
  const at = options.at || new Date().toISOString();
  const actorUserId = options.actorUserId || 'platform';
  const list = workItems.getWorkItems(project);
  const requested = list.find((task) => task.id === requestedTaskId);
  if (!requested) return null;
  const scopeIds = new Set([requested.id]);
  if (requested.taskRole === 'coordination') {
    list.filter((task) => task.parentTaskId === requested.id)
      .forEach((task) => scopeIds.add(task.id));
  }
  const dependencySatisfied = (dependencyId) => {
    const dependency = list.find((task) => task.id === dependencyId);
    return dependency && ['completed', 'cancelled', 'waiting_review'].includes(dependency.status);
  };
  const next = list.map((task) => {
    if (!scopeIds.has(task.id)) return task;
    const isRequested = task.id === requested.id;
    const shouldReset = isRequested || RESTARTABLE_TASK_STATUSES.has(task.status);
    if (!shouldReset) return task;
    const dependenciesReady = workItems.ensureArray(task.dependencyTaskIds).every(dependencySatisfied);
    const nextStatus = task.taskRole === 'coordination'
      ? task.status
      : dependenciesReady ? 'ready' : 'planned';
    return workItems.normalizeWorkItem({
      ...task,
      status: nextStatus,
      agentJobId: '',
      promptRunId: '',
      agentStatus: '',
      currentAction: task.taskRole === 'coordination'
        ? 'A execução anterior foi libertada. O plano pode ser reiniciado.'
        : dependenciesReady
          ? 'Pronta para uma nova tentativa.'
          : 'A aguardar as dependências antes da nova tentativa.',
      lastMilestone: 'Execução anterior terminada; checkpoints e histórico preservados.',
      taskActivity: [
        ...workItems.ensureArray(task.taskActivity),
        {
          type: 'execution_unlocked',
          message: 'A plataforma libertou a execução anterior e preparou uma nova tentativa.',
          actorType: 'human',
          actorId: actorUserId,
          createdAt: at,
        },
      ],
      updatedAt: at,
      updatedBy: actorUserId,
    }, { project });
  });
  workItems.setWorkItems(project, next);
  return workItems.findWorkItem(project, requestedTaskId);
}

function reconcileActiveAgentJobs(project, options = {}) {
  const connectorStore = options.connectorStore;
  const connectionMode = options.connectionMode || 'remote_pull';
  const at = typeof options.nowIso === 'function'
    ? options.nowIso()
    : new Date().toISOString();
  const tasks = workItems.getWorkItems(project);
  let blocking = null;
  const orphaned = [];
  for (const job of Array.isArray(project?.agentJobs) ? project.agentJobs : []) {
    const task = tasks.find((entry) => (
      entry.id === job.workItemId
      || (job.id && entry.agentJobId === job.id)
      || (job.promptRunId && entry.promptRunId === job.promptRunId)
    )) || null;
    const dispatch = connectionMode === 'remote_pull' && connectorStore
      ? connectorStore.findDispatch(job.dispatchId || job.id || job.promptRunId)
      : null;
    if (
      task
      && dispatch?.status === 'waiting_review'
      && workItems.isTerminalStatus(task.status)
      && connectorStore
    ) {
      const reviewed = connectorStore.markReviewed(
        dispatch.id,
        task.status === 'completed' ? 'approved' : 'rejected'
      );
      job.status = reviewed?.status || (task.status === 'completed' ? 'completed' : 'failed');
      job.updatedAt = at;
      continue;
    }
    if (!RUNTIME_ACTIVE_STATUSES.has(job.status)) continue;
    if (dispatch && ['completed', 'failed', 'cancelled'].includes(dispatch.status)) {
      job.status = dispatch.status;
      job.updatedAt = at;
      continue;
    }
    if (!task) {
      let projectedStatus = dispatch?.status || 'cancelled';
      if (
        dispatch
        && !['completed', 'failed', 'cancelled'].includes(dispatch.status)
        && connectorStore
      ) {
        const requested = connectorStore.setDesiredAction(dispatch.id, 'cancel', {
          idempotencyKey: `orphan:${dispatch.id}:cancel`,
        });
        projectedStatus = requested?.status || 'cancel_requested';
      }
      job.status = ['completed', 'failed', 'cancelled'].includes(projectedStatus)
        ? projectedStatus
        : 'cancel_requested';
      job.cancelReason = 'orphaned_execution';
      job.error = 'A tarefa associada já não existe; o cancelamento foi enviado ao Agent Runtime.';
      job.updatedAt = at;
      orphaned.push({ job, dispatch });
      continue;
    }
    if (!dispatch && connectionMode === 'remote_pull') {
      job.status = 'failed';
      job.error = 'A execução remota associada já não existe.';
      job.updatedAt = at;
      continue;
    }
    blocking ||= job;
  }
  return { blocking, orphaned };
}

function registerAgentRuntimeRoutes(app, deps) {
  const {
    authMiddleware,
    requireRole,
    loadProjectForUser,
    readStore,
    updateStore,
    appendActivity,
    sanitizeProject,
    normalizePromptRun,
    normalizeHumanReview,
    buildHumanReviewPayload,
    ensureArray,
    nowIso,
    sendProjectEmail,
    sqliteStore,
    connectorStore,
    verifyPassword,
    dataDir,
  } = deps;

  const { createAgentRuntimeClient } = require('./agent-runtime-client');
  const runtime = createAgentRuntimeClient();
  const connectionMode = normalizeMode(process.env.AGENT_CONNECTION_MODE, process.env.NODE_ENV);
  const scopedTokenSecret = String(process.env.AGENT_HMAC_SECRET || process.env.PLATFORM_SERVICE_TOKEN || process.env.AGENT_RUNTIME_API_KEY || 'local-task-scope');
  function issueTaskToken(payload) {
    const encoded = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + 60 * 60 * 1000 })).toString('base64url');
    const signature = crypto.createHmac('sha256', scopedTokenSecret).update(encoded).digest('base64url');
    return `${encoded}.${signature}`;
  }
  function verifyTaskToken(token) {
    const [encoded, signature] = String(token || '').split('.'); if (!encoded || !signature) throw new Error('Token de tarefa invalido.');
    const expected = crypto.createHmac('sha256', scopedTokenSecret).update(encoded).digest('base64url');
    if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new Error('Token de tarefa invalido.');
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')); if (Number(payload.exp) < Date.now()) throw new Error('Token de tarefa expirado.'); return payload;
  }

  async function notifyActionable(store, project, payload = {}) {
    const task = payload.task || null;
    const request = payload.request || null;
    const key = `${payload.type}:${task?.id || request?.id || ''}:${task?.status || request?.status || ''}`;
    project.taskNotifications = ensureArray(project.taskNotifications);
    if (project.taskNotifications.some((entry) => entry.key === key)) return;
    const recipientIds = [...new Set([task?.approverUserId, task?.assigneeUserId, request?.createdBy,
      ...ensureArray(project.members).filter((member) => member.role === 'partner').map((member) => member.userId)].filter(Boolean))];
    project.taskNotifications.unshift({ id: `tn_${crypto.randomUUID()}`, key, type: payload.type, title: payload.title, message: payload.message, taskId: task?.id || '', agentRequestId: request?.id || task?.agentRequestId || '', recipientUserIds: recipientIds, readByUserIds: [], createdAt: nowIso() });
    project.taskNotifications = project.taskNotifications.slice(0, 500);
    if (typeof sendProjectEmail !== 'function') return;
    const emails = [...new Set(recipientIds.map((id) => ensureArray(store.users).find((user) => user.id === id)?.email).filter(Boolean))];
    await Promise.all(emails.map((to) => sendProjectEmail({ to, subject: `[YourLab] ${payload.title}`, text: `${payload.message}\n\nProjecto: ${project.name}\nAbra o projecto e consulte Tarefas.` }).catch(() => null)));
  }

  async function requireAgentProjectEditor(req, res, next) {
    if (req.auth.user?.role === 'super_admin') return next();
    try {
      const store = await readStore();
      let project = (req.body?.projectId || req.params?.projectId) ? store.projects.find((entry) => entry.id === (req.body?.projectId || req.params?.projectId)) : null;
      if (!project && req.params?.runId) {
        project = store.projects.find((entry) => ensureArray(entry.agentJobs).some((job) => job.id === req.params.runId || job.promptRunId === req.params.runId));
      }
      if (!project || !projectAccess.canManageWorkItems(req.auth.user, project)) return res.status(403).json({ message: 'Sem permissao para gerir agentes neste projecto.' });
      return next();
    } catch (error) { return res.status(500).json({ message: error.message }); }
  }

  async function markStaleRuntimeJobIfNeeded(agentJob) {
    const ageMs = Date.now() - Date.parse(agentJob.updatedAt || agentJob.createdAt);
    if (!RUNTIME_ACTIVE_STATUSES.has(agentJob.status)) return agentJob;

    if (!agentJob.yarJobId && agentJob.status === 'dispatching' && ageMs > STALE_DISPATCH_MS) {
      const error = 'Agent Runtime nao respondeu ao pedido inicial';
      await updateStore(async (mutableStore) => {
        const mutableProject = mutableStore.projects.find((e) => e.id === agentJob.projectId);
        const job = ensureArray(mutableProject?.agentJobs).find((e) => e.id === agentJob.id);
        if (job && RUNTIME_ACTIVE_STATUSES.has(job.status)) {
          job.status = 'failed';
          job.error = error;
          job.updatedAt = nowIso();
        }
      });
      return { ...agentJob, status: 'failed', error };
    }

    return agentJob;
  }

  app.get(
    '/api/projects/projects/:projectId/agent-context',
    serviceAuthMiddleware,
    async (req, res) => {
      try {
        const projectId = req.params.projectId;
        const agentType = textOr(req.query.agentType);
        const store = await readStore();
        const project = store.projects.find((entry) => entry.id === projectId);

        if (!project) {
          return res.status(404).json({ message: 'Projeto nao encontrado.' });
        }

        const body = {
          capabilityId: req.query.capabilityId,
          moduleTag: req.query.moduleTag,
          stageId: req.query.stageId,
        };

        const built = buildPromptForAgentType(project, agentType, body);

        return res.json({
          projectId,
          prompt: built.fullPrompt,
          contextPack: built.contextPack,
          promptRun: {
            agentType,
            fullPrompt: built.fullPrompt,
            targetOutput: built.targetOutput,
            contextPack: built.contextPack,
          },
        });
      } catch (error) {
        return res.status(500).json({ message: error.message });
      }
    }
  );

  app.get('/api/projects/projects/:projectId/work-items/:workItemId/agent-context', async (req, res) => {
    try {
      if (connectionMode !== 'local_push') {
        return res.status(404).json({ message: 'Contexto remoto direto desativado.' });
      }
      const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim(); const scope = verifyTaskToken(token);
      if (scope.projectId !== req.params.projectId || scope.taskId !== req.params.workItemId) return res.status(403).json({ message: 'O token nao permite aceder a esta tarefa.' });
      const store = await readStore(); const project = store.projects.find((entry) => entry.id === req.params.projectId); if (!project) return res.status(404).json({ message: 'Projeto nao encontrado.' });
      const task = workItems.findWorkItem(project, req.params.workItemId); if (!task || task.agentRequestId !== scope.requestId) return res.status(404).json({ message: 'Tarefa nao encontrada.' });
      const request = agentRequests.getAgentRequests(project).find((entry) => entry.id === task.agentRequestId); const parent = task.taskRole === 'coordination' ? task : workItems.findWorkItem(project, task.parentTaskId);
      const tree = parent ? stageTransitions.buildTreePackage(project, parent) : null;
      return res.json({ projectId: project.id, request: request ? { id: request.id, version: request.version, title: request.title, requestMarkdown: request.requestMarkdown, desiredOutcomeMarkdown: request.desiredOutcomeMarkdown, inputSnapshot: request.inputSnapshot, inputFingerprint: request.inputFingerprint } : null, currentTask: task, taskGraph: tree?.children || [task], executionPackage: task.taskRole === 'coordination' ? tree?.text : task.executionPackage, allowedMcpTools: scope.allowedMcpTools || [], readOnly: true });
    } catch (error) { return res.status(401).json({ message: error.message }); }
  });

  app.get('/api/projects/projects/:projectId/knowledge-references', authMiddleware, loadProjectForUser, (req, res) => (
    res.json({ references: ensureArray(req.loadedProject?.knowledgeReferences) })
  ));

  function persistOfficialReferences(project, parsed, provenance = {}) {
    if (!parsed || typeof parsed !== 'object') return [];
    const candidates = [
      ...ensureArray(parsed.references),
      ...ensureArray(parsed.sources),
      ...ensureArray(parsed.documentationReferences),
      ...ensureArray(parsed.officialSources),
      ...ensureArray(parsed.research?.references),
    ];
    const accepted = candidates.map((entry) => {
      const source = typeof entry === 'string' ? { url: entry } : entry;
      const url = textOr(source?.url);
      if (!/^https:\/\//i.test(url)) return null;
      let hostname = '';
      try { hostname = new URL(url).hostname.toLowerCase(); } catch { return null; }
      const official = source?.official === true
        || hostname.endsWith('.gov')
        || hostname.endsWith('.europa.eu')
        || /(^|\.)docs?\.|(^|\.)developer\.|w3\.org$|ietf\.org$|rfc-editor\.org$|iso\.org$|ecma-international\.org$/.test(hostname);
      if (!official) return null;
      const excerpt = textOr(source.excerpt || source.snippet).slice(0, 8000);
      return {
        id: textOr(source.id, `kref_${crypto.randomUUID()}`),
        url,
        title: textOr(source.title, hostname),
        publisher: textOr(source.publisher, hostname),
        version: textOr(source.version),
        retrievedAt: textOr(source.retrievedAt, nowIso()),
        contentHash: textOr(
          source.contentHash,
          crypto.createHash('sha256').update(`${url}\n${excerpt}`).digest('hex')
        ),
        excerpt,
        technology: textOr(source.technology),
        scope: textOr(source.scope),
        confidence: Math.max(0, Math.min(1, Number(source.confidence) || 0.8)),
        sourceType: textOr(source.sourceType, 'vendor_documentation'),
        official: true,
        provenance: {
          promptRunId: textOr(provenance.promptRunId),
          workItemId: textOr(provenance.workItemId),
          agentId: textOr(provenance.agentId),
        },
        createdAt: nowIso(),
      };
    }).filter(Boolean);
    if (!accepted.length) return [];
    const existing = ensureArray(project.knowledgeReferences);
    const byKey = new Map(existing.map((entry) => [`${entry.url}:${entry.version || ''}`, entry]));
    accepted.forEach((entry) => byKey.set(`${entry.url}:${entry.version || ''}`, {
      ...byKey.get(`${entry.url}:${entry.version || ''}`),
      ...entry,
    }));
    project.knowledgeReferences = [...byKey.values()]
      .sort((a, b) => String(b.retrievedAt).localeCompare(String(a.retrievedAt)))
      .slice(0, 1000);
    return accepted;
  }

  function engineeringChangeSetCandidates(parsed) {
    if (!parsed || typeof parsed !== 'object') return [];
    const candidates = [];
    if (parsed.schemaVersion === engineeringState.CHANGE_SET_SCHEMA) candidates.push(parsed);
    if (parsed.engineeringChangeSet) candidates.push(parsed.engineeringChangeSet);
    ensureArray(parsed.engineeringChangeSets).forEach((entry) => candidates.push(entry));
    ensureArray(parsed.taskOutputs).forEach((entry) => {
      if (entry?.output?.engineeringChangeSet) candidates.push(entry.output.engineeringChangeSet);
      ensureArray(entry?.output?.engineeringChangeSets).forEach((changeSet) => candidates.push(changeSet));
    });
    return candidates.filter((entry) => entry && typeof entry === 'object');
  }

  function persistEngineeringChangeSetProposals(project, parsed, provenance = {}) {
    if (!engineeringState.featureEnabled(project)) return { persisted: [], errors: [] };
    const candidates = engineeringChangeSetCandidates(parsed);
    if (!candidates.length) return { persisted: [], errors: [] };
    project.engineeringChangeSets = ensureArray(project.engineeringChangeSets);
    const persisted = [];
    const errors = [];
    candidates.forEach((candidate) => {
      try {
        const validation = engineeringState.validateChangeSet(candidate, project);
        if (!validation.valid) throw new Error(validation.errors.join(' '));
        if (validation.changeSet.taskId !== provenance.workItemId) {
          throw new Error('Change set taskId does not match the executed task.');
        }
        if (validation.changeSet.runId !== provenance.promptRunId) {
          throw new Error('Change set runId does not match the executed run.');
        }
        const proposed = engineeringState.normalizeChangeSet({
          ...validation.changeSet,
          status: 'proposed',
          requiresHumanApproval: true,
          sections: validation.changeSet.sections.map((section) => ({
            ...section,
            decision: 'pending',
            decisionNotes: '',
            decidedAt: '',
            decidedBy: '',
          })),
          createdBy: provenance.agentId || 'agent_runtime',
          updatedAt: nowIso(),
        }, { projectId: project.id, actorId: provenance.agentId || 'agent_runtime' });
        proposed.proposalHash = engineeringState.changeSetProposalFingerprint(proposed, {
          projectId: project.id,
        });
        const existing = project.engineeringChangeSets.find((entry) => (
          entry.id === proposed.id || entry.proposalHash === proposed.proposalHash
        ));
        if (existing) {
          persisted.push(existing);
          return;
        }
        project.engineeringChangeSets.unshift(proposed);
        engineeringState.syncRecommendedTaskSuggestions(project, proposed);
        persisted.push(proposed);
      } catch (error) {
        errors.push(error.message);
      }
    });
    return { persisted, errors };
  }

  async function acceptAgentOutput(projectId, runId, rawInput, deferApply = true) {
    const parsedFromRaw = deliveryOs.parseAgentJsonOutput(String(rawInput || ''));
    const parsed = parsedFromRaw.parsed;
    const rawOutput = parsedFromRaw.rawOutput || String(rawInput || '');
    const resultHash = crypto.createHash('sha256').update(rawOutput).digest('hex');
    if (!rawOutput.trim()) throw new Error('O agente devolveu um resultado vazio.');
    if (rawOutput && !parsed) throw new Error('JSON inválido devolvido pelo agente local.');

    await updateStore(async (store) => {
      const project = store.projects.find((entry) => entry.id === projectId);
      if (!project) throw new Error('Projeto nao encontrado.');
      const run = ensureArray(project.promptRuns).find((entry) => entry.id === runId);
      if (!run) throw new Error('Prompt run nao encontrado.');
      if (run.resultHash === resultHash && run.status === 'pending_review') return;
      const agentJob = ensureArray(project.agentJobs).find((entry) => entry.promptRunId === runId);
      const delegatedTask = workItems.findWorkItem(project, agentJob?.workItemId || run.workItemId);
      const persistedReferences = persistOfficialReferences(project, parsed, {
        promptRunId: runId,
        workItemId: delegatedTask?.id,
        agentId: agentJob?.agentId,
      });
      const engineeringProposals = persistEngineeringChangeSetProposals(project, parsed, {
        promptRunId: runId,
        workItemId: delegatedTask?.id,
        agentId: agentJob?.agentId,
      });

      if (delegatedTask?.taskRole === 'coordination') {
        const checked = stageTransitions.validateBundle(project, delegatedTask, parsed || rawOutput);
        const at = nowIso();
        const byId = new Map(checked.outputs.map((row) => [row.taskId, row]));
        const next = workItems.getWorkItems(project).map((task) => {
          const row = byId.get(task.id);
          if (!row) return task;
          const childRaw = typeof row.output === 'string' ? row.output : JSON.stringify(row.output, null, 2);
          const attempt = {
            id: `attempt_${crypto.randomUUID()}`,
            number: task.attempts.length + 1,
            source: 'runtime',
            status: 'completed',
            agentJobId: agentJob?.id,
            promptRunId: runId,
            rawOutput: childRaw,
            resultSummaryMarkdown: childRaw.slice(0, 4000),
            connectionState: 'received',
            selectedAgentId: agentJob?.agentId,
            contextSnapshotHash: checked.request.inputFingerprint,
            packageVersion: row.packageVersion,
            createdAt: at,
            completedAt: at,
            updatedAt: at,
          };
          return workItems.normalizeWorkItem({
            ...task,
            status: 'waiting_review',
            agentStatus: 'pending_human_review',
            resultSummaryMarkdown: childRaw.slice(0, 4000),
            currentAction: 'O resultado do agente aguarda revisao.',
            attempts: [...task.attempts, attempt],
            taskActivity: [...task.taskActivity, {
              type: 'agent_bundle_received',
              message: 'Resultado recebido do agente através da tarefa-pai.',
              actorType: 'agent',
              actorId: agentJob?.agentId,
              createdAt: at,
            }],
            updatedAt: at,
            updatedBy: 'agent_runtime',
          }, { project });
        });
        workItems.setWorkItems(project, next);
        run.rawOutput = rawOutput;
        run.parsedOutput = parsed;
        run.status = 'pending_review';
        run.resultHash = resultHash;
        if (agentJob) {
          agentJob.status = 'pending_human_review';
          agentJob.updatedAt = at;
        }
        const request = ensureArray(project.agentRequests).find((entry) => entry.id === delegatedTask.agentRequestId);
        if (request) {
          request.status = 'waiting_review';
          request.updatedAt = at;
        }
        const parent = workItems.findWorkItem(project, delegatedTask.id);
        if (parent) {
          await notifyActionable(store, project, {
            type: 'task_review',
            task: parent,
            request,
            title: 'Resultados do agente prontos para revisao',
            message: `O pedido “${parent.title}” devolveu ${checked.tasks.length} resultado(s).`,
          });
        }
        project.updatedAt = at;
        appendActivity(store, {
          actorUserId: 'agent_runtime',
          projectId,
          action: 'agent_runtime_bundle_submitted',
          details: {
            promptRunId: runId,
            parentTaskId: delegatedTask.id,
            taskIds: checked.tasks.map((task) => task.id),
            referenceCount: persistedReferences.length,
            engineeringChangeSetIds: engineeringProposals.persisted.map((entry) => entry.id),
            engineeringChangeSetErrors: engineeringProposals.errors,
          },
        });
        return;
      }

      run.rawOutput = rawOutput;
      run.parsedOutput = parsed;
      run.status = deferApply ? 'pending_review' : 'applied';
      run.resultHash = resultHash;
      deliveryOs.upsertHumanReviewFromPromptRun(project, run, parsed, rawOutput);
      if (agentJob) {
        agentJob.status = deferApply ? 'pending_human_review' : 'completed';
        agentJob.updatedAt = nowIso();
      }
      const summary = typeof parsed === 'object' && parsed
        ? JSON.stringify(parsed).slice(0, 4000)
        : String(rawOutput || '').slice(0, 4000);
      workItemsSync.onAgentRunComplete(project, {
        agentJobId: agentJob?.id,
        workItemId: agentJob?.workItemId,
        promptRunId: runId,
        resultSummaryMarkdown: summary,
        rawOutput,
        waitingReview: deferApply,
      });
      const request = ensureArray(project.agentRequests).find((entry) => entry.id === agentJob?.agentRequestId);
      if (request) {
        request.status = deferApply ? 'waiting_review' : 'completed';
        request.updatedAt = nowIso();
      }
      if (deferApply) {
        const task = workItems.findWorkItem(project, agentJob?.workItemId);
        if (task) {
          await notifyActionable(store, project, {
            type: 'task_review',
            task,
            request,
            title: 'Resultado do agente pronto para revisão',
            message: `A tarefa “${task.title}” aguarda a sua validação.`,
          });
        }
      }
      project.updatedAt = nowIso();
      appendActivity(store, {
        actorUserId: 'agent_runtime',
        projectId,
        action: 'agent_runtime_output_submitted',
        details: {
          promptRunId: runId,
          deferApply,
          referenceCount: persistedReferences.length,
          engineeringChangeSetIds: engineeringProposals.persisted.map((entry) => entry.id),
          engineeringChangeSetErrors: engineeringProposals.errors,
        },
      });
    });

    const store = await readStore();
    const updated = store.projects.find((entry) => entry.id === projectId);
    const reviewRaw = ensureArray(updated?.humanReviews).find(
      (entry) => entry.promptRunId === runId || entry.sourceId === runId
    );
    const review = reviewRaw && deliveryOs.isActionableReviewForPanel(normalizeHumanReview(reviewRaw))
      ? normalizeHumanReview(reviewRaw)
      : null;
    return {
      projectId,
      promptRunId: runId,
      review,
      deferred: deferApply,
      noChanges: Boolean(parsed && !review),
    };
  }

  async function validateAgentOutput(dispatch, rawInput) {
    if (!dispatch) throw new Error('Dispatch seguro nao encontrado.');
    const rawOutput = String(rawInput || '');
    if (!rawOutput.trim()) throw new Error('O agente devolveu um resultado vazio.');
    const parsed = deliveryOs.parseAgentJsonOutput(rawOutput).parsed;
    if (!parsed) throw new Error('JSON inválido devolvido pelo agente local.');
    const store = await readStore();
    const project = store.projects.find((entry) => entry.id === dispatch.projectId);
    if (!project) throw new Error('Projeto nao encontrado.');
    const run = ensureArray(project.promptRuns).find((entry) => entry.id === dispatch.platformRunId);
    if (!run) throw new Error('Prompt run nao encontrado.');
    const task = workItems.findWorkItem(project, dispatch.workItemId);
    if (!task) throw new Error('Tarefa canonica nao encontrada.');
    if (task.taskRole === 'coordination') stageTransitions.validateBundle(project, task, parsed);
    return { parsed };
  }

  app.post(
    '/api/projects/projects/:projectId/prompt-runs/:runId/agent-submit',
    serviceAuthMiddleware,
    async (req, res) => {
      try {
        return res.json(await acceptAgentOutput(
          req.params.projectId,
          req.params.runId,
          req.body?.rawOutput,
          req.body?.deferApply !== false
        ));
      } catch (error) {
        return res.status(400).json({ message: error.message });
      }
    }
  );

  if (connectorStore && sqliteStore) {
    registerAgentConnectorRoutes(app, {
      authMiddleware,
      requireRole,
      sqliteStore,
      connectorStore,
      verifyPassword,
      onResult: (dispatch, rawOutput) => acceptAgentOutput(
        dispatch.projectId,
        dispatch.platformRunId,
        rawOutput,
        true
      ),
      onValidateResult: validateAgentOutput,
      onValidateDispatch: async (dispatch) => {
        const snapshot = await readStore();
        const project = snapshot.projects.find((entry) => entry.id === dispatch.projectId);
        const task = project ? workItems.findWorkItem(project, dispatch.workItemId) : null;
        if (project && task) return dispatch;
        const cancelled = connectorStore.setDesiredAction(dispatch.id, 'cancel', {
          idempotencyKey: `orphan:${dispatch.id}:cancel`,
        });
        if (project) {
          await updateStore(async (mutableStore) => {
            const mutableProject = mutableStore.projects.find(
              (entry) => entry.id === dispatch.projectId
            );
            const job = ensureArray(mutableProject?.agentJobs).find((entry) => (
              entry.id === dispatch.agentJobId || entry.dispatchId === dispatch.id
            ));
            if (job) {
              job.status = cancelled?.status || 'cancel_requested';
              job.cancelReason = 'orphaned_execution';
              job.error = 'A tarefa associada foi removida; o cancelamento está a ser sincronizado com o Agent Runtime.';
              job.updatedAt = nowIso();
            }
          });
        }
        return cancelled;
      },
      onSync: async (dispatch, progress = {}, events = []) => {
        await updateStore(async (store) => {
          const project = store.projects.find((entry) => entry.id === dispatch.projectId);
          if (!project) return;
          const job = ensureArray(project.agentJobs).find((entry) => (
            entry.id === dispatch.agentJobId || entry.dispatchId === dispatch.id
          ));
          if (job) {
            job.status = dispatch.status;
            job.subtasksCompleted = Math.max(0, Number(progress.completed) || 0);
            job.subtasksTotal = Math.max(0, Number(progress.total) || 0);
            job.tokensUsed = Math.max(0, Number(progress.tokensUsed) || 0);
            job.localTokensUsed = Math.max(0, Number(progress.localTokensUsed) || 0);
            job.externalTokensUsed = Math.max(0, Number(progress.externalTokensUsed) || 0);
            job.costUsed = Math.max(0, Number(progress.costUsed) || 0);
            job.currentPhase = textOr(progress.phase);
            job.checkpointBoundary = textOr(progress.checkpointBoundary);
            job.hardwareSafety = progress.hardwareSafety
              && typeof progress.hardwareSafety === 'object'
              && !Array.isArray(progress.hardwareSafety)
              ? progress.hardwareSafety
              : job.hardwareSafety || {};
            job.budget = {
              ...(job.budget || {}),
              maxTokens: Math.max(0, Number(progress.maxTokens) || 0),
              externalMaxTokens: Math.max(0, Number(progress.externalMaxTokens) || 0),
              maxCost: Math.max(0, Number(progress.maxCost) || 0),
              maxWallClockMinutes: Math.max(0, Number(progress.maxWallClockMinutes) || 0),
            };
            job.goalProgress = {
              met: Math.max(0, Number(progress.goalsMet) || 0),
              total: Math.max(0, Number(progress.goalsTotal) || 0),
              iteration: Math.max(0, Number(progress.goalIteration) || 0),
            };
            job.bestEffort = progress.bestEffort === true;
            job.qualityWarnings = ensureArray(progress.qualityWarnings)
              .map((warning) => textOr(warning))
              .filter(Boolean)
              .slice(-10);
            job.error = textOr(progress.error, job.error || '');
            job.updatedAt = nowIso();
          }
          const task = workItems.findWorkItem(project, dispatch.workItemId);
          if (!task) return;
          const latest = ensureArray(events).at(-1);
          const list = workItems.getWorkItems(project);
          workItems.setWorkItems(project, list.map((entry) => entry.id === task.id
            ? workItems.normalizeWorkItem({
              ...task,
              agentStatus: dispatch.status,
              progressCurrent: Math.max(0, Number(progress.completed) || 0),
              progressTotal: Math.max(0, Number(progress.total) || 0),
              lastMilestone: textOr(latest?.message, task.lastMilestone),
              currentAction: textOr(progress.currentStep)
                ? `A executar: ${textOr(progress.currentStep)}`
                : dispatch.status === 'paused'
                  ? textOr(latest?.message, 'Execução pausada num checkpoint seguro.')
                  : dispatch.status === 'self_review'
                    ? 'A verificar critérios e a preparar o resultado.'
                    : dispatch.status === 'failed'
                      ? textOr(progress.error, 'A execução falhou; consulte os registos.')
                      : task.currentAction,
              updatedAt: nowIso(),
            }, { project })
            : entry));
        });
      },
      onAudit: async (action, details = {}) => {
        await updateStore(async (store) => {
          appendActivity(store, {
            actorUserId: details.actorUserId || 'agent_connector',
            projectId: details.projectId || null,
            action,
            details: Object.fromEntries(Object.entries(details).filter(([key]) => key !== 'actorUserId')),
          });
        });
      },
    });
  }

  app.post('/api/projects/agent-runs/prepare', authMiddleware, requireAgentProjectEditor, async (req, res) => {
    try {
      if (connectionMode === 'disabled') {
        return res.status(503).json({ message: 'Execucao por agente desativada.' });
      }
      const { projectId, agentType, options = {} } = req.body || {};
      if (agentType === 'reverse_idea') {
        return res.status(410).json({
          message: 'A preparação legada de visão foi descontinuada. Crie uma Task na transição Idea → Discovery.',
        });
      }
      let agentId = runtime.mapPlatformType(agentType);

      if (!projectId || !agentType || !agentId) {
        return res.status(400).json({ message: 'projectId e agentType suportado sao obrigatorios.' });
      }

      const store = await readStore();
      const project = store.projects.find((entry) => entry.id === projectId);
      if (!project) {
        return res.status(404).json({ message: 'Projeto nao encontrado.' });
      }

      const platformAgentType = runtime.mapAgentId(agentId);
      const promptBody = {
        agentType: platformAgentType,
        capabilityId: options.capabilityId,
        moduleTag: options.moduleTag,
        stageId: options.stageId,
      };
      let built = buildPromptForAgentType(project, platformAgentType, promptBody);

      let budget = {
        maxTokens: 0,
        maxWallClockMinutes: 0,
        maxSubtasks: 8,
      };
      let runtimeHealth = null;
      let runtimeReachable = false;

      if (connectionMode === 'remote_pull') {
        const connector = connectorStore?.activeConnector() || null;
        const advertised = ensureArray(connector?.capabilities?.agents).find((entry) => entry.id === agentId)
          || ensureArray(connector?.capabilities?.agents).find(
            (entry) => ensureArray(entry.taskTypes).includes(agentType)
          );
        if (advertised?.id) agentId = advertised.id;
        runtimeReachable = Boolean(connector?.online);
        runtimeHealth = connector
          ? { connector, waitingForConnector: !connector.online }
          : { error: 'Nenhum Agent Runtime emparelhado.' };
        const manifest = ensureArray(connector?.capabilities?.agents).find((entry) => entry.id === agentId);
        if (manifest?.budget) {
          budget = {
            maxTokens: manifest.budget.maxTokens ?? budget.maxTokens,
            maxWallClockMinutes: manifest.budget.maxWallClockMinutes ?? budget.maxWallClockMinutes,
            maxSubtasks: manifest.budget.maxSubtasks ?? budget.maxSubtasks,
          };
        }
      } else if (connectionMode === 'local_push') try {
        const agentDef = await runtime.getAgent(agentId);
        if (agentDef?.agent?.budget) {
          budget = {
            maxTokens: agentDef.agent.budget.maxTokens ?? budget.maxTokens,
            maxWallClockMinutes: agentDef.agent.budget.maxWallClockMinutes ?? budget.maxWallClockMinutes,
            maxSubtasks: agentDef.agent.budget.maxSubtasks ?? budget.maxSubtasks,
          };
        }
        runtimeHealth = await runtime.health();
        runtimeReachable = true;
      } catch (err) {
        runtimeHealth = { error: err.message };
      }

      const maxSubtasks = Number(options.maxSubtasks || budget.maxSubtasks || 8);
      let taskPlan = null;
      let executionPlanMeta = null;
      try {
        const executionPlans = require('./execution-plans');
        const ep = executionPlans.buildExecutionPlan(platformAgentType, project, {
          ...options,
          stageId: options.stageId,
          maxSubtasks,
        }, { deliveryOs });
        executionPlanMeta = ep;
        if (ep?.tasks?.length) {
          taskPlan = {
            masterPlanMarkdown: ep.masterPlanMarkdown,
            tasks: ep.tasks.map((t) => ({
              id: t.id,
              title: t.title,
              instruction: t.instruction,
              estimatedInputTokens: t.estimatedInputTokens,
              targetOutputTokens: t.targetOutputTokens,
              contextFromTaskIds: t.contextFromTaskIds,
              verificationPrompt: t.verificationPrompt,
              regressionGuardPrompt: t.regressionGuardPrompt,
              mergePrompt: t.mergePrompt,
              reversePrompt: t.reversePrompt,
              diagramType: t.diagramType,
              role: t.role,
              requirementIds: t.requirementIds,
              dependsOn: t.dependsOn,
            })),
            totalRequirements: ensureArray(project.requirements).length,
            diagramTaskCount: ep.tasks.filter((t) => t.diagramType || t.role === 'diagram').length,
          };
        }
      } catch {
        if (platformAgentType === 'requirements_to_architecture') {
          taskPlan = deliveryOs.buildArchitectureTaskPlanForRuntime(
            project,
            options.capabilityId,
            options.moduleTag,
            { maxSubtasks, requirementsPerDiagram: options.requirementsPerDiagram }
          );
        }
      }

      return res.json({
        projectId,
        agentType: platformAgentType,
        agentId,
        prompt: built.fullPrompt,
        targetOutput: built.targetOutput,
        contextPack: built.contextPack,
        budget,
        taskPlan,
        runtimeReachable,
        runtimeHealth,
        modelProfileId: executionPlanMeta?.modelProfileId || options.modelProfileId || 'medium',
        targetInputTokens: executionPlanMeta?.targetInputTokens || options.targetInputTokens,
        targetOutputTokens: executionPlanMeta?.targetOutputTokens || options.targetOutputTokens,
      });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get('/api/projects/projects/:projectId/work-items/:workItemId/agent-connection/prepare', authMiddleware, requireAgentProjectEditor, async (req, res) => {
    try {
      if (connectionMode === 'disabled') {
        return res.status(503).json({ message: 'Execucao por agente desativada.', reachable: false });
      }
      const store = await readStore(); const project = store.projects.find((entry) => entry.id === req.params.projectId);
      if (!project) return res.status(404).json({ message: 'Projeto nao encontrado.' });
      const requestedTask = workItems.findWorkItem(project, req.params.workItemId); if (!requestedTask) return res.status(404).json({ message: 'Tarefa nao encontrada.' });
      const requestTasks = workItems.getWorkItems(project).filter((entry) => entry.agentRequestId === requestedTask.agentRequestId);
      const task = resolveContinuousExecutionTask(requestTasks, requestedTask);
      const request = agentRequests.getAgentRequests(project).find((entry) => entry.id === task.agentRequestId) || null;
      let health;
      let rows;
      if (connectionMode === 'remote_pull') {
        const connector = connectorStore?.activeConnector();
        if (!connector) return res.status(503).json({ message: 'Nenhum Agent Runtime emparelhado.', reachable: false });
        health = { connector, reachable: connector.online };
        rows = ensureArray(connector.capabilities?.agents);
      } else {
        health = await runtime.health();
        const listed = await runtime.listAgents();
        rows = ensureArray(listed?.agents || listed);
      }
      const requiredSkills = task.requiredSkills || []; const requiredTools = task.requiredMcpTools || [];
      const agents = rows.map((row) => {
        const raw = row.agent || row; const id = textOr(raw.id || raw.agentId || row.id); let skills = ensureArray(raw.skills || raw.capabilities).map((entry) => typeof entry === 'string' ? entry : entry.id).filter(Boolean); let tools = ensureArray(raw.mcpTools || raw.tools).map((entry) => typeof entry === 'string' ? entry : entry.id).filter(Boolean); const taskTypes = ensureArray(raw.taskTypes || raw.agentTypes).map(String).filter(Boolean);
        const legacyManifest = !skills.length && !tools.length; if (legacyManifest && LEGACY_AGENT_MANIFESTS[id]) { skills = LEGACY_AGENT_MANIFESTS[id].skills; tools = LEGACY_AGENT_MANIFESTS[id].tools; }
        const supportsTaskType = !taskTypes.length || !request?.agentType || taskTypes.includes(request.agentType);
        const compatible = supportsTaskType && requiredSkills.every((value) => skills.includes(value)) && requiredTools.every((value) => tools.includes(value));
        return { id, name: textOr(raw.name || raw.label, id), taskTypes, skills, mcpTools: tools, compatible, legacyManifest };
      }).filter((row) => row.id);
      const platformSettings = await agentPlatformSettings.readAgentPlatformSettings(dataDir);
      const mergedSettings = agentPlatformSettings.mergeWithPlatformDefaults(task.executionSettings, platformSettings);
      const compatible = agents.filter((row) => row.compatible);
      const preferred = task.agentId || request?.configSnapshot?.preferredAgentId || mergedSettings.agentId;
      let selected = compatible.find((row) => row.id === preferred) || compatible[0] || null;
      let compatibilityPendingReasons = [];
      if (connectionMode === 'remote_pull') {
        const match = findCompatibleAgent({
          contract: { id: CONTRACT_ID, version: CONTRACT_VERSION },
          agentId: preferred,
          agentType: request?.agentType,
          requiredSkills,
          allowedMcpTools: requiredTools,
        }, health.connector?.capabilities, { preferredAgentId: preferred });
        if (match.compatible && match.agent?.id) {
          selected = agents.find((row) => row.id === match.agent.id) || selected;
        } else {
          selected = selected
            || agents.find((row) => row.id === preferred)
            || agents.find((row) => row.taskTypes.includes(request?.agentType))
            || agents[0]
            || null;
          compatibilityPendingReasons = match.reasons;
        }
      }
      return res.json({
        reachable: connectionMode === 'remote_pull' ? Boolean(health.connector?.online) : true,
        queuedWhenOffline: connectionMode === 'remote_pull',
        health,
        task: workItems.toSlimCard(task),
        requestedTaskId: requestedTask.id,
        requestId: request?.id || '',
        requiredSkills,
        requiredMcpTools: requiredTools,
        agents,
        selectedAgentId: selected?.id || preferred || '',
        compatibilityPending: compatibilityPendingReasons.length > 0,
        compatibilityPendingReasons,
        settings: mergedSettings,
        scope: task.taskRole === 'coordination' ? 'tree' : 'task',
        contextSummary: task.taskRole === 'coordination'
          ? `Execução contínua do pedido com ${workItems.getWorkItems(project).filter((entry) => entry.parentTaskId === task.id && entry.status !== 'completed').length} subtarefas ainda abertas. A revisão humana acontece no fim do pedido.`
          : 'Contexto congelado e autorizado para esta tarefa.',
        orchestration: workItems.buildOrchestrationProjection(requestedTask, {
          children: workItems.getWorkItems(project).filter((entry) => entry.parentTaskId === requestedTask.id),
          agentRequest: request,
          agentExecution: null,
          ...resolveRuntimeReachability({ agentConnectionMode: connectionMode, connectorStore }),
        }),
      });
    } catch (error) { return res.status(503).json({ message: `Agent Runtime indisponivel: ${error.message}`, reachable: false }); }
  });

  app.post('/api/projects/agent-runs', authMiddleware, requireAgentProjectEditor, async (req, res) => {
    try {
      if (connectionMode === 'disabled') {
        return res.status(503).json({ message: 'Execucao por agente desativada.' });
      }
      if (connectionMode === 'remote_pull' && !connectorStore) {
        return res.status(503).json({ message: 'Fila segura de agentes indisponivel.' });
      }
      if (connectionMode === 'remote_pull' && !connectorStore.activeConnector()) {
        return res.status(409).json({
          message: 'Emparelhe um Agent Runtime em Projects → Definições antes de executar.',
        });
      }
      const {
        projectId,
        agentId: bodyAgentId,
        agentType,
        budget: bodyBudget,
        options: bodyOptions = {},
        agentRequestId: requestedAgentRequestId,
        workItemId: requestedWorkItemId,
      } = req.body || {};

      let options = bodyOptions;
      let budget = bodyBudget;
      let agentId = bodyAgentId || runtime.mapPlatformType(agentType);

      if (!projectId || !agentId) {
        return res.status(400).json({ message: 'projectId e agentId (ou agentType) sao obrigatorios.' });
      }
      if (!requestedWorkItemId) {
        return res.status(400).json({ message: 'workItemId e obrigatorio. Crie e aprove uma tarefa canonica antes de iniciar o agente.' });
      }

      const store = await readStore();
      const project = store.projects.find((entry) => entry.id === projectId);
      if (!project) {
        return res.status(404).json({ message: 'Projeto nao encontrado.' });
      }

      let platformAgentType = runtime.mapAgentId(agentId);
      const promptBody = {
        agentType: platformAgentType,
        capabilityId: options.capabilityId,
        moduleTag: options.moduleTag,
        stageId: options.stageId,
      };

      let built = buildPromptForAgentType(project, platformAgentType, promptBody);
      let executionProject = project;
      let delegation = null;
      let delegatedTask = null;
      let compatibilityPendingReasons = [];
      await updateStore(async (mutableStore) => {
        const mutableProject = mutableStore.projects.find((entry) => entry.id === projectId);
        workItems.migrateProjectWorkItems(mutableProject);
        agentRequests.migrateAgentRequests(mutableProject);
        let canonicalTask = workItems.findWorkItem(mutableProject, requestedWorkItemId);
        if (!canonicalTask) throw new Error('Tarefa canonica nao encontrada.');
        if (!canonicalTask.agentRequestId) throw new Error('A tarefa nao esta ligada a um pedido de agente.');
        if (requestedAgentRequestId && requestedAgentRequestId !== canonicalTask.agentRequestId) throw new Error('A tarefa nao pertence ao pedido de agente indicado.');
        const request = agentRequests.getAgentRequests(mutableProject).find((entry) => entry.id === canonicalTask.agentRequestId);
        if (!request) throw new Error('Pedido do agente nao encontrado.');
        let tasks = workItems.getWorkItems(mutableProject).filter((task) => task.agentRequestId === request.id);
        delegation = { request: agentRequests.requestSummary(request, tasks), tasks, created: false };
        const reconciliation = reconcileActiveAgentJobs(mutableProject, {
          connectorStore,
          connectionMode,
          nowIso,
        });
        if (reconciliation.blocking) {
          const linkedTask = workItems.findWorkItem(
            mutableProject,
            reconciliation.blocking.workItemId
          );
          throw new Error(
            linkedTask
              ? `Já existe uma tarefa de agente em execução: ${linkedTask.title}. Abra essa tarefa para pausar ou cancelar.`
              : 'Já existe uma tarefa de agente em execução neste projecto.'
          );
        }
        if (RESTARTABLE_TASK_STATUSES.has(canonicalTask.status)) {
          resetTaskForRestart(mutableProject, canonicalTask.id, {
            at: nowIso(),
            actorUserId: req.auth.user.id,
          });
          canonicalTask = workItems.findWorkItem(mutableProject, requestedWorkItemId);
          tasks = workItems.getWorkItems(mutableProject)
            .filter((task) => task.agentRequestId === request.id);
        }
        const executionTasks = tasks.filter((task) => task.taskRole !== 'coordination');
        if (!['awaiting_approval', 'revision_requested'].includes(request.status)) {
          request.status = executionTasks.some((task) => ['in_progress', 'waiting_input'].includes(task.status))
            ? 'running'
            : executionTasks.some((task) => task.status === 'ready')
              ? 'ready'
              : executionTasks.some((task) => task.status === 'waiting_review')
                ? 'waiting_review'
                : executionTasks.length && executionTasks.every((task) => workItems.isTerminalStatus(task.status))
                  ? 'completed'
                  : request.status;
          request.updatedAt = nowIso();
        }
        delegation = {
          request: agentRequests.requestSummary(request, tasks),
          tasks,
          created: false,
        };
        if (['awaiting_approval', 'revision_requested'].includes(delegation.request.status)) {
          await notifyActionable(mutableStore, mutableProject, { type: 'plan_approval', request: delegation.request, title: 'Plano do agente aguarda aprovação', message: `${delegation.request.title} tem ${delegation.tasks.length} tarefa(s) para rever.` });
          return;
        }
        if (!['ready', 'running'].includes(request.status)) {
          throw new Error(`O pedido do agente está no estado “${request.status}” e não pode iniciar uma nova execução.`);
        }
        const configuredAgentId = textOr(request.agentId) === 'auto' ? '' : textOr(request.agentId);
        agentId = bodyAgentId || configuredAgentId || runtime.mapPlatformType(request.agentType);
        platformAgentType = request.agentType || runtime.mapAgentId(agentId);
        if (connectionMode === 'remote_pull') {
          const connector = connectorStore.activeConnector();
          const match = findCompatibleAgent({
            contract: { id: CONTRACT_ID, version: CONTRACT_VERSION },
            agentId,
            agentType: platformAgentType,
            requiredSkills: canonicalTask.requiredSkills,
            allowedMcpTools: canonicalTask.requiredMcpTools,
          }, connector?.capabilities, { preferredAgentId: agentId });
          if (match.compatible && match.agent?.id) agentId = match.agent.id;
        }
        const executionScopeTask = resolveContinuousExecutionTask(tasks, canonicalTask);
        delegatedTask = selectReadyAgentTask(delegation.tasks, executionScopeTask?.id || requestedWorkItemId);
        if (!delegatedTask) throw new Error('Nao existe uma tarefa pronta para executar neste plano.');
        ({ options, budget } = resolveExecutionConfig(
          connectionMode,
          request,
          delegatedTask,
          bodyOptions,
          bodyBudget
        ));
        if (connectionMode === 'remote_pull') {
          const connector = connectorStore.activeConnector();
          const match = findCompatibleAgent({
            contract: { id: CONTRACT_ID, version: CONTRACT_VERSION },
            agentId,
            agentType: platformAgentType,
            requiredSkills: delegatedTask.requiredSkills,
            allowedMcpTools: delegatedTask.requiredMcpTools,
          }, connector?.capabilities, { preferredAgentId: agentId });
          if (match.compatible && match.agent?.id) {
            agentId = match.agent.id;
          } else {
            const fatalReasons = match.reasons.filter((reason) => (
              reason.startsWith('protocol:') || reason.startsWith('contract-version:')
            ));
            if (fatalReasons.length) {
              throw new Error(`O runtime emparelhado usa um protocolo incompatível: ${fatalReasons.join(', ')}`);
            }
            compatibilityPendingReasons = match.reasons;
          }
        }
        executionProject = mutableProject;
        mutableProject.updatedAt = nowIso();
      });

      if (requestedAgentRequestId) {
        built = buildPromptForAgentType(executionProject, platformAgentType, {
          agentType: platformAgentType,
          capabilityId: options.capabilityId,
          moduleTag: options.moduleTag,
          stageId: options.stageId,
        });
      }

      if (!delegatedTask) {
        return res.status(202).json({
          requiresApproval: true,
          agentRequest: delegation.request,
          workItems: workItems.toSlimCards(delegation.tasks),
        });
      }

      const canonicalPackage = delegatedTask.taskRole === 'coordination'
        ? (() => {
            const tree = stageTransitions.buildTreePackage(executionProject, delegatedTask);
            return { ...tree, children: tree.openChildren };
          })()
        : { text: [delegatedTask.executionPackage?.instructions || delegatedTask.descriptionMarkdown, delegatedTask.executionPackage?.outputFormat ? `\n\nFormato:\n${delegatedTask.executionPackage.outputFormat}` : ''].join(''), contextSnapshotHash: delegation.request.inputFingerprint || '', children: [] };
      built = { ...built, fullPrompt: canonicalPackage.text || built.fullPrompt, contextPack: { ...(built.contextPack || {}), taskId: delegatedTask.id, agentRequestId: delegation.request.id, contextSnapshotHash: canonicalPackage.contextSnapshotHash, provisionalTaskOutputs: canonicalPackage.provisionalOutputs || [] } };

      const run = normalizePromptRun({
        agentType: platformAgentType,
        stageId: options.stageId,
        capabilityId: options.capabilityId,
        moduleTag: options.moduleTag,
        targetOutput: built.targetOutput,
        contextPack: built.contextPack,
        fullPrompt: built.fullPrompt,
        createdBy: req.auth.user.id,
        workItemId: delegatedTask.id,
        agentRequestId: delegation.request.id,
        summaryMarkdown: `YourLab Agent: ${agentId}`,
        status: 'running',
      });

      const agentJob = {
        id: `aj_${crypto.randomUUID()}`,
        mode: 'runtime',
        agentId,
        platformAgentType,
        agentType: platformAgentType,
        promptRunId: run.id,
        projectId,
        yarJobId: null,
        status: 'dispatching',
        runtimeOptions: options,
        budget,
        createdAt: nowIso(),
        updatedAt: nowIso(),
        createdBy: req.auth.user.id,
        workItemId: delegatedTask.id,
        agentRequestId: delegation.request.id,
      };

      await updateStore(async (mutableStore) => {
        const mutableProject = mutableStore.projects.find((entry) => entry.id === projectId);

        mutableProject.promptRuns = ensureArray(mutableProject.promptRuns);
        mutableProject.promptRuns.unshift(run);
        mutableProject.promptRuns = mutableProject.promptRuns.slice(0, 100);
        mutableProject.agentJobs = ensureArray(mutableProject.agentJobs);
        mutableProject.agentJobs.unshift(agentJob);
        mutableProject.agentJobs = mutableProject.agentJobs.slice(0, 50);
        mutableProject.updatedAt = nowIso();

        appendActivity(mutableStore, {
          actorUserId: req.auth.user.id,
          projectId,
          action: 'agent_run_dispatched',
          details: { agentId, promptRunId: run.id, workItemId: delegatedTask.id, agentRequestId: delegation.request.id },
        });
      });

      if (connectionMode === 'remote_pull') {
        const engineeringPilot = engineeringState.featureEnabled(executionProject)
          && (agentId === 'discovery-research' || platformAgentType === 'discovery_research');
        const engineeringGraph = engineeringPilot
          ? engineeringState.getGraph(executionProject, { includeRequirements: false })
          : null;
        const engineeringEntityIds = new Set((engineeringGraph?.entities || []).map((entry) => entry.id));
        const engineeringContext = engineeringPilot ? {
          schemaVersion: engineeringState.CHANGE_SET_SCHEMA,
          mode: 'proposal_only',
          projectId,
          taskId: delegatedTask.id,
          runId: run.id,
          baseEngineeringRevision: engineeringGraph.revision,
          currentState: {
            entities: engineeringGraph.entities,
            relationships: engineeringGraph.relationships.filter((entry) => (
              engineeringEntityIds.has(entry.sourceId) && engineeringEntityIds.has(entry.targetId)
            )),
            externalReferences: engineeringGraph.externalReferences,
          },
          allowedOperations: [
            'create_entity',
            'update_entity',
            'deprecate_entity',
            'create_relationship',
            'remove_relationship',
          ],
          entityTypes: [
            'problem', 'intent', 'stakeholder', 'need', 'objective',
            'success_criterion', 'assumption', 'constraint', 'risk', 'evidence',
          ],
          reviewPolicy: 'Every section remains pending until a human reviews it; the agent cannot apply changes or create Tasks.',
        } : null;
        const engineeringInstructions = engineeringPilot
          ? `\n\n## Proposta de engenharia (piloto)\nAlém do output legado obrigatório, inclui opcionalmente um campo engineeringChangeSet conforme engineering-change-set/v1. Usa exatamente projectId=${projectId}, taskId=${delegatedTask.id}, runId=${run.id} e baseEngineeringRevision=${engineeringContext.baseEngineeringRevision}. Coloca-o no topo da resposta ou dentro do output da subtask correspondente. Todas as secções são apenas propostas para revisão humana. Não apliques alterações e não cries Tasks.`
          : '';
        const frozenPackage = buildFrozenTaskPackage({
          projectId,
          workItemId: delegatedTask.id,
          agentRequestId: delegation.request.id,
          platformRunId: run.id,
          agentJobId: agentJob.id,
          requestVersion: delegation.request.version,
          packageVersion: delegatedTask.executionPackage?.version || 1,
          contextSnapshotHash: canonicalPackage.contextSnapshotHash,
          agentId,
          agentType: platformAgentType,
          instructions: `${canonicalPackage.text || built.fullPrompt}${engineeringInstructions}`,
          context: {
            ...built.contextPack,
            ...(engineeringContext ? { engineering: engineeringContext } : {}),
          },
          taskGraph: canonicalPackage.children?.map((task) => ({
            id: task.id,
            title: task.title,
            dependsOn: task.dependencyTaskIds,
            packageVersion: task.executionPackage?.version || 1,
            instructions: task.executionPackage?.instructions || task.descriptionMarkdown,
            outputFormat: task.executionPackage?.outputFormat || 'JSON',
            acceptanceCriteria: task.acceptanceCriteriaMarkdown
              || task.executionPackage?.acceptanceCriteriaMarkdown || '',
          })) || [],
          requiredSkills: delegatedTask.requiredSkills || [],
          allowedTools: delegatedTask.requiredMcpTools || [],
          outputContract: {
            targetOutput: built.targetOutput,
            ...(engineeringContext ? {
              engineeringChangeSet: {
                schemaVersion: engineeringState.CHANGE_SET_SCHEMA,
                required: false,
                requiresHumanApproval: true,
                autoApply: false,
              },
            } : {}),
          },
          acceptanceCriteria: delegatedTask.acceptanceCriteriaMarkdown
            || delegatedTask.executionPackage?.acceptanceCriteriaMarkdown,
          completionPolicy: {
            maxNoProgressIterations: Number(options.maxNoProgressIterations) || 3,
          },
          executionSettings: workItems.normalizeExecutionSettings(options.executionSettings || options),
          objective: {
            statement: delegatedTask.executionPackage?.objective
              || delegatedTask.descriptionMarkdown,
            acceptanceCriteria: delegatedTask.acceptanceCriteriaMarkdown
              || delegatedTask.executionPackage?.acceptanceCriteriaMarkdown,
            expectedArtifacts: ensureArray(delegatedTask.expectedOutputs),
          },
          budget: budget || {},
          frozenAt: nowIso(),
        });
        const dispatch = connectorStore.enqueue({
          projectId,
          workItemId: delegatedTask.id,
          agentRequestId: delegation.request.id,
          platformRunId: run.id,
          agentJobId: agentJob.id,
          agentId,
          package: frozenPackage,
        });
        await updateStore(async (mutableStore) => {
          const mutableProject = mutableStore.projects.find((entry) => entry.id === projectId);
          const job = ensureArray(mutableProject?.agentJobs).find((entry) => entry.id === agentJob.id);
          if (job) {
            job.status = 'queued';
            job.dispatchId = dispatch.id;
            job.packageHash = dispatch.packageHash;
            job.updatedAt = nowIso();
          }
          workItemsSync.onAgentRunStart(mutableProject, {
            agentJobId: agentJob.id,
            workItemId: delegatedTask.id,
            promptRunId: run.id,
            planId: options?.taskPlan?.planId,
            currentAction: compatibilityPendingReasons.length
              ? `Na fila — aguarda atualização das capacidades do Agent Runtime (${compatibilityPendingReasons.join(', ')}).`
              : 'Na fila — aguarda ligação do Agent Runtime.',
          });
          const request = ensureArray(mutableProject?.agentRequests).find((entry) => entry.id === delegation.request.id);
          if (request) {
            request.status = 'running';
            request.updatedAt = nowIso();
          }
        });
        return res.status(202).json({
          agentJob: { ...agentJob, status: 'queued', dispatchId: dispatch.id, packageHash: dispatch.packageHash },
          promptRun: run,
          compatibilityPending: compatibilityPendingReasons.length > 0,
          compatibilityPendingReasons,
          agentRequest: delegation.request,
          workItem: workItems.toSlimCard(delegatedTask),
          dispatch: publicDispatch(dispatch),
          connector: connectorStore.activeConnector(),
        });
      }

      let yarResponse;
      try {
        const taskAccessToken = issueTaskToken({ projectId, requestId: delegation.request.id, taskId: delegatedTask.id, allowedMcpTools: delegatedTask.requiredMcpTools || [] });
        yarResponse = await runtime.createJob({
          agentId,
          projectId,
          platformRunId: run.id,
          budget,
          options,
          delegation: {
            requestId: delegation.request.id, requestVersion: delegation.request.version,
            taskId: delegatedTask.id, scope: delegatedTask.taskRole === 'coordination' ? 'tree' : 'task',
            packageVersion: delegatedTask.executionPackage?.version || 1,
            contextSnapshotHash: canonicalPackage.contextSnapshotHash,
            requiredSkills: delegatedTask.requiredSkills || [], requiredMcpTools: delegatedTask.requiredMcpTools || [],
            executionPackage: canonicalPackage.text, taskGraph: canonicalPackage.children?.map((task) => ({ id: task.id, title: task.title, dependsOn: task.dependencyTaskIds, packageVersion: task.executionPackage?.version || 1 })) || [],
            callback: { projectId, platformRunId: run.id },
            contextAccess: { path: `/api/projects/projects/${encodeURIComponent(projectId)}/work-items/${encodeURIComponent(delegatedTask.id)}/agent-context`, bearerToken: taskAccessToken, expiresInSeconds: 3600, readOnly: true },
          },
        });
      } catch (error) {
        await updateStore(async (mutableStore) => {
          const mutableProject = mutableStore.projects.find((entry) => entry.id === projectId);
          const job = ensureArray(mutableProject.agentJobs).find((entry) => entry.id === agentJob.id);
          if (job) {
            job.status = 'failed';
            job.error = error.message;
            job.updatedAt = nowIso();
          }
          workItemsSync.onAgentRunFailed(mutableProject, { workItemId: delegatedTask.id, agentJobId: agentJob.id, promptRunId: run.id, error: error.message });
          const failedTask = workItems.findWorkItem(mutableProject, delegatedTask.id);
          if (failedTask) await notifyActionable(mutableStore, mutableProject, { type: 'task_failed', task: failedTask, request: delegation.request, title: 'Tarefa do agente falhou', message: `A tarefa “${failedTask.title}” precisa de intervenção: ${error.message}` });
        });
        return res.status(502).json({ message: `Agent runtime indisponivel: ${error.message}` });
      }

      await updateStore(async (mutableStore) => {
        const mutableProject = mutableStore.projects.find((entry) => entry.id === projectId);
        const job = ensureArray(mutableProject.agentJobs).find((entry) => entry.id === agentJob.id);
        if (job) {
          job.yarJobId = yarResponse?.job?.id || null;
          job.status = yarResponse?.job?.status || 'queued';
          job.updatedAt = nowIso();
        }
        try {
          workItemsSync.onAgentRunStart(mutableProject, {
            agentJobId: agentJob.id,
            workItemId: delegatedTask.id,
            promptRunId: run.id,
            planId: options?.taskPlan?.planId,
          });
          if (delegatedTask.taskRole === 'coordination') {
            const allTasks = workItems.getWorkItems(mutableProject); const first = allTasks.find((task) => task.parentTaskId === delegatedTask.id && task.status === 'ready') || allTasks.find((task) => task.parentTaskId === delegatedTask.id && task.status === 'planned');
            workItems.setWorkItems(mutableProject, allTasks.map((task) => task.id === first?.id ? workItems.normalizeWorkItem({ ...task, status: 'in_progress', agentStatus: 'running', currentAction: 'O agente recebeu o plano completo e iniciou esta subtarefa.', updatedAt: nowIso() }, { project: mutableProject }) : task));
          }
          const request = ensureArray(mutableProject.agentRequests).find((entry) => entry.id === delegation.request.id);
          if (request) {
            request.status = 'running';
            request.updatedAt = nowIso();
          }
        } catch {
          // optional bridge
        }
      });

      return res.status(201).json({
        agentJob: { ...agentJob, yarJobId: yarResponse?.job?.id, status: yarResponse?.job?.status || 'queued' },
        promptRun: run,
        agentRequest: delegation.request,
        workItem: workItems.toSlimCard(delegatedTask),
        yarJob: yarResponse?.job,
      });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get('/api/projects/agent-runs/:runId/status', authMiddleware, requireAgentProjectEditor, async (req, res) => {
    try {
      const runId = req.params.runId;
      const store = await readStore();

      let agentJob = null;
      let project = null;

      for (const entry of store.projects) {
        const found = ensureArray(entry.agentJobs).find((job) => job.promptRunId === runId || job.id === runId);
        if (found) {
          agentJob = found;
          project = entry;
          break;
        }
      }

      if (!agentJob) {
        return res.status(404).json({ message: 'Agent run nao encontrado.' });
      }

      if (connectionMode === 'disabled') {
        return res.json({
          agentJob,
          workItem: project && agentJob.workItemId
            ? workItems.toSlimCard(workItems.findWorkItem(project, agentJob.workItemId))
            : null,
          events: [],
          runtimeMeta: {
            checkedAt: nowIso(),
            reachable: false,
            lastSeenAt: null,
            warning: 'Execucao por agente desativada.',
          },
          project: project ? sanitizeProject(project, req.auth.user) : null,
        });
      }

      if (connectionMode === 'remote_pull') {
        const dispatch = connectorStore?.findDispatch(agentJob.dispatchId || agentJob.id || runId);
        if (!dispatch) return res.status(404).json({ message: 'Dispatch seguro nao encontrado.' });
        const projectedStatus = dispatch.status === 'waiting_review' ? 'pending_human_review' : dispatch.status;
        if (agentJob.status !== projectedStatus) {
          await updateStore(async (mutableStore) => {
            const mutableProject = mutableStore.projects.find((entry) => entry.id === agentJob.projectId);
            const job = ensureArray(mutableProject?.agentJobs).find((entry) => entry.id === agentJob.id);
            if (job) {
              job.status = projectedStatus;
              job.updatedAt = nowIso();
            }
            const task = workItems.findWorkItem(mutableProject, agentJob.workItemId);
            if (task) {
              const taskStatus = projectedStatus === 'pending_human_review' ? 'waiting_review'
                : projectedStatus === 'cancelled' ? 'cancelled'
                  : projectedStatus === 'failed' ? 'failed'
                    : projectedStatus === 'paused' ? 'waiting_input'
                      : ['queued', 'claimed', 'running', 'planning', 'executing'].includes(projectedStatus)
                        ? 'in_progress'
                        : task.status;
              const connector = dispatch.connectorId
                ? connectorStore.getConnector(dispatch.connectorId)
                : connectorStore.activeConnector();
              const currentAction = dispatch.desiredAction === 'cancel'
                ? (projectedStatus === 'connection_lost'
                  ? 'Ligação perdida; o cancelamento continua pendente até o agente voltar a ligar.'
                  : 'Cancelamento pedido; aguarda confirmação do agente.')
                : dispatch.desiredAction === 'pause'
                  ? 'Pausa pedida; o agente vai parar no próximo checkpoint seguro.'
                  : dispatch.desiredAction === 'finish_partial'
                    ? 'A preparar o progresso actual para avaliação humana.'
                : projectedStatus === 'queued'
                ? `Na fila — aguarda ligação de ${connector?.name || 'um Agent Runtime'}.`
                : projectedStatus === 'connection_lost'
                  ? 'Ligação ao agente perdida; o trabalho não será repetido automaticamente.'
                  : projectedStatus === 'cancel_requested'
                    ? 'Cancelamento pedido; aguarda confirmação do agente.'
                    : projectedStatus === 'pending_human_review'
                      ? 'Resultado recebido; aguarda revisão humana.'
                      : ['claimed', 'running', 'planning', 'executing'].includes(projectedStatus)
                        ? 'O agente está a executar o pacote aprovado.'
                        : task.currentAction;
              const list = workItems.getWorkItems(mutableProject);
              workItems.setWorkItems(mutableProject, list.map((entry) => entry.id === task.id
                ? workItems.normalizeWorkItem({
                  ...task,
                  status: taskStatus,
                  agentStatus: projectedStatus,
                  currentAction,
                  updatedAt: nowIso(),
                }, { project: mutableProject })
                : entry));
            }
          });
          agentJob = { ...agentJob, status: projectedStatus, updatedAt: nowIso() };
        }
        const hasEventCursor = req.query.afterEventId !== undefined;
        const afterId = Number(req.query.afterEventId || 0);
        const events = hasEventCursor
          ? connectorStore.events(dispatch.id, afterId)
          : connectorStore.recentEvents(dispatch.id, 200);
        const connector = dispatch.connectorId ? connectorStore.getConnector(dispatch.connectorId) : connectorStore.activeConnector();
        return res.json({
          agentJob,
          workItem: project && agentJob.workItemId ? workItems.toSlimCard(workItems.findWorkItem(project, agentJob.workItemId)) : null,
          agentRequest: project && agentJob.agentRequestId
            ? agentRequests.requestSummary(
              agentRequests.getAgentRequests(project).find((entry) => entry.id === agentJob.agentRequestId) || {},
              workItems.getWorkItems(project).filter((entry) => entry.agentRequestId === agentJob.agentRequestId),
            ) : null,
          dispatch: publicDispatch(dispatch),
          events,
          progress: {
            current: Number(dispatch.progress?.completed ?? agentJob.subtasksCompleted) || 0,
            total: Number(dispatch.progress?.total ?? agentJob.subtasksTotal) || 0,
            tokensUsed: Number(dispatch.progress?.tokensUsed ?? agentJob.tokensUsed) || 0,
            localTokensUsed: Number(dispatch.progress?.localTokensUsed ?? agentJob.localTokensUsed) || 0,
            externalTokensUsed: Number(dispatch.progress?.externalTokensUsed ?? agentJob.externalTokensUsed) || 0,
            costUsed: Number(dispatch.progress?.costUsed ?? agentJob.costUsed) || 0,
            maxTokens: Math.max(0, Number(dispatch.progress?.maxTokens ?? agentJob.budget?.maxTokens) || 0),
            externalMaxTokens: Math.max(0, Number(dispatch.progress?.externalMaxTokens ?? agentJob.budget?.externalMaxTokens) || 0),
            maxCost: Math.max(0, Number(dispatch.progress?.maxCost ?? agentJob.budget?.maxCost) || 0),
            maxWallClockMinutes: Math.max(0, Number(dispatch.progress?.maxWallClockMinutes ?? agentJob.budget?.maxWallClockMinutes) || 0),
            phase: textOr(dispatch.progress?.phase ?? agentJob.currentPhase),
            checkpointBoundary: textOr(dispatch.progress?.checkpointBoundary ?? agentJob.checkpointBoundary),
            hardwareSafety: dispatch.progress?.hardwareSafety || agentJob.hardwareSafety || {},
            bestEffort: agentJob.bestEffort === true,
            qualityWarnings: ensureArray(agentJob.qualityWarnings),
          },
          checkpoint: dispatch.checkpoint || {},
          reviewPacket: dispatch.reviewPacket || {},
          runtimeMeta: {
            checkedAt: nowIso(),
            reachable: Boolean(connector?.online),
            lastSeenAt: connector?.lastSeenAt || null,
            warning: connector?.online
              ? null
              : dispatch.desiredAction === 'cancel'
                ? 'Agent Runtime offline; o cancelamento continua pendente.'
                : dispatch.status === 'connection_lost'
                  ? 'Ligação perdida; este trabalho não será repetido automaticamente.'
                  : `Na fila — aguarda ligação de ${connector?.name || 'um Agent Runtime'}.`,
          },
          project: project ? sanitizeProject(project, req.auth.user) : null,
        });
      }

      agentJob = await markStaleRuntimeJobIfNeeded(agentJob);

      if (!agentJob.yarJobId) {
        return res.json({
          agentJob,
          yarJob: null,
          subtasks: [],
          yarError: null,
          runtimeMeta: {
            checkedAt: nowIso(),
            reachable: false,
            lastSeenAt: agentJob.updatedAt || agentJob.createdAt || null,
            warning: agentJob.status === 'dispatching' ? 'A aguardar ligação ao Agent Runtime.' : null,
          },
          events: [],
          project: project ? sanitizeProject(project, req.auth.user) : null,
        });
      }

      let yarJob = null;
      let yarSubtasks = [];
      let yarError = null;
      let events = [];
      let runtimeMeta = {
        checkedAt: nowIso(),
        reachable: false,
        lastSeenAt: agentJob.updatedAt || agentJob.createdAt || null,
        warning: null,
      };

      try {
        yarJob = await runtime.getJob(agentJob.yarJobId);
        yarSubtasks = yarJob?.subtasks || [];
        runtimeMeta = {
          checkedAt: nowIso(),
          reachable: true,
          lastSeenAt: yarJob?.job?.updatedAt || yarJob?.job?.startedAt || agentJob.updatedAt || agentJob.createdAt || null,
          warning: null,
        };
      } catch (err) {
        yarError = err.message;
      }

      if (yarError && RUNTIME_ACTIVE_STATUSES.has(agentJob.status)) {
        runtimeMeta.warning = `Agent Runtime indisponivel: ${yarError}`;
        agentJob = { ...agentJob, error: yarError };
      }

      if (agentJob.yarJobId && yarJob?.job) {
        try {
          const afterId = Number(req.query.afterEventId ?? 0);
          const log = await runtime.getEventLog(agentJob.yarJobId, afterId);
          events = log?.events || [];
        } catch (err) {
          events = [];
          if (!yarError) yarError = err.message;
        }
      }

      if (yarJob?.job) {
        const yarStatus = yarJob.job.status;
        const progressChanged = (
          agentJob.status !== yarStatus
          || agentJob.tokensUsed !== yarJob.job.tokensUsed
          || agentJob.subtasksCompleted !== yarJob.job.subtasksCompleted
        );

        if (progressChanged) {
          await updateStore(async (mutableStore) => {
            const mutableProject = mutableStore.projects.find((entry) => entry.id === agentJob.projectId);
            const job = ensureArray(mutableProject?.agentJobs).find((entry) => entry.id === agentJob.id);
            if (job) {
              job.status = yarStatus;
              job.error = yarJob.job.error || job.error;
              job.tokensUsed = yarJob.job.tokensUsed;
              job.subtasksTotal = yarJob.job.subtasksTotal;
              job.subtasksCompleted = yarJob.job.subtasksCompleted;
              job.updatedAt = nowIso();
            }
            const task = workItems.findWorkItem(mutableProject, agentJob.workItemId);
            if (task) {
              const taskStatus = ['paused', 'waiting_input'].includes(yarStatus)
                ? 'waiting_input'
                : ['failed', 'blocked'].includes(yarStatus)
                  ? yarStatus
                  : RUNTIME_ACTIVE_STATUSES.has(yarStatus) ? 'in_progress' : task.status;
              const currentAction = taskStatus === 'waiting_input'
                ? 'O agente aguarda informacao para continuar.'
                : taskStatus === 'in_progress'
                  ? `O agente esta ${yarStatus === 'planning' ? 'a preparar a abordagem' : 'a executar a tarefa'}.`
                  : task.currentAction;
              const allTasks = workItems.getWorkItems(mutableProject);
              const patched = workItems.normalizeWorkItem({
                ...task, status: taskStatus, agentStatus: yarStatus, currentAction,
                lastMilestone: Number(yarJob.job.subtasksCompleted) > Number(task.progressCurrent || 0)
                  ? `${yarJob.job.subtasksCompleted} passo(s) concluido(s).` : task.lastMilestone,
                progressCurrent: Number(yarJob.job.subtasksCompleted) || 0,
                progressTotal: Number(yarJob.job.subtasksTotal) || task.progressTotal || 0,
                updatedAt: nowIso(),
              }, { project: mutableProject });
              workItems.setWorkItems(mutableProject, allTasks.map((entry) => entry.id === task.id ? patched : entry));
            }
          });
          agentJob = {
            ...agentJob,
            status: yarStatus,
            error: yarJob.job.error || agentJob.error,
            tokensUsed: yarJob.job.tokensUsed,
            subtasksTotal: yarJob.job.subtasksTotal,
            subtasksCompleted: yarJob.job.subtasksCompleted,
          };
        }

      }

      return res.json({
        agentJob,
        workItem: project && agentJob.workItemId ? workItems.toSlimCard(workItems.findWorkItem(project, agentJob.workItemId)) : null,
        agentRequest: project && agentJob.agentRequestId
          ? agentRequests.requestSummary(
            agentRequests.getAgentRequests(project).find((entry) => entry.id === agentJob.agentRequestId) || {},
            workItems.getWorkItems(project).filter((entry) => entry.agentRequestId === agentJob.agentRequestId),
          ) : null,
        yarJob: yarJob?.job || null,
        subtasks: yarSubtasks,
        yarError,
        runtimeMeta,
        events,
        project: project ? sanitizeProject(project, req.auth.user) : null,
      });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.post('/api/projects/agent-runs/:runId/cancel', authMiddleware, requireAgentProjectEditor, async (req, res) => {
    try {
      const runId = req.params.runId;
      const store = await readStore();

      let agentJob = null;
      for (const entry of store.projects) {
        const found = ensureArray(entry.agentJobs).find((job) => job.promptRunId === runId || job.id === runId);
        if (found) {
          agentJob = found;
          break;
        }
      }

      if (!agentJob) {
        return res.status(404).json({ message: 'Agent run nao encontrado.' });
      }

      if (connectionMode === 'disabled') {
        return res.status(503).json({ message: 'Execucao por agente desativada.' });
      }

      if (connectionMode === 'remote_pull') {
        const dispatch = connectorStore?.setDesiredAction(
          agentJob.dispatchId || agentJob.id || runId,
          'cancel',
          { idempotencyKey: textOr(req.headers['idempotency-key'], `cancel:${runId}:${nowIso()}`) }
        );
        if (!dispatch) return res.status(404).json({ message: 'Dispatch seguro nao encontrado.' });
        const status = dispatch.status === 'cancelled' ? 'cancelled' : 'cancel_requested';
        await updateStore(async (mutableStore) => {
          const mutableProject = mutableStore.projects.find((entry) => entry.id === agentJob.projectId);
          const job = ensureArray(mutableProject?.agentJobs).find((entry) => entry.id === agentJob.id);
          if (job) {
            job.status = status;
            job.updatedAt = nowIso();
          }
          const task = workItems.findWorkItem(mutableProject, agentJob.workItemId);
          if (task) {
            const list = workItems.getWorkItems(mutableProject);
            workItems.setWorkItems(mutableProject, list.map((entry) => entry.id === task.id
              ? workItems.normalizeWorkItem({
                ...task,
                status: status === 'cancelled' ? 'cancelled' : task.status,
                agentStatus: status,
                currentAction: status === 'cancelled'
                  ? 'Execução cancelada.'
                  : 'Cancelamento pedido; aguarda ligação do agente.',
                updatedAt: nowIso(),
              }, { project: mutableProject })
              : entry));
          }
          appendActivity(mutableStore, {
            actorUserId: req.auth.user.id,
            projectId: agentJob.projectId,
            action: status === 'cancelled' ? 'agent_dispatch_cancelled' : 'agent_dispatch_cancel_requested',
            details: { dispatchId: dispatch.id, agentJobId: agentJob.id },
          });
        });
        return res.json({ agentJob: { ...agentJob, status }, dispatch: publicDispatch(dispatch) });
      }

      if (agentJob.yarJobId) {
        await runtime.cancelJob(agentJob.yarJobId);
      }

      await updateStore(async (mutableStore) => {
        const mutableProject = mutableStore.projects.find((entry) => entry.id === agentJob.projectId);
        const job = ensureArray(mutableProject?.agentJobs).find((entry) => entry.id === agentJob.id);
        if (job) {
          job.status = 'cancelled';
          job.updatedAt = nowIso();
        }
        workItemsSync.onAgentRunFailed(mutableProject, { workItemId: agentJob.workItemId, agentJobId: agentJob.id, promptRunId: agentJob.promptRunId, error: 'Execucao interrompida pelo utilizador.' });
        const request = ensureArray(mutableProject.agentRequests).find((entry) => entry.id === agentJob.agentRequestId);
        if (request) { request.status = 'failed'; request.updatedAt = nowIso(); }
      });

      return res.json({ agentJob: { ...agentJob, status: 'cancelled' } });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.post('/api/projects/agent-runs/:runId/abandon', authMiddleware, requireAgentProjectEditor, async (req, res) => {
    try {
      const runId = req.params.runId;
      const store = await readStore();
      let agentJob = null;
      let project = null;
      for (const entry of store.projects) {
        const found = ensureArray(entry.agentJobs).find((job) => (
          job.promptRunId === runId || job.id === runId || job.dispatchId === runId
        ));
        if (found) {
          agentJob = found;
          project = entry;
          break;
        }
      }
      if (!agentJob || !project) {
        return res.status(404).json({ message: 'Agent run nao encontrado.' });
      }

      let dispatch = null;
      if (connectionMode === 'remote_pull') {
        dispatch = connectorStore?.abandon(
          agentJob.dispatchId || agentJob.id || runId,
          {
            idempotencyKey: textOr(
              req.headers['idempotency-key'],
              `force-unlock:${agentJob.id}`
            ),
            reason: textOr(req.body?.reason, 'platform_force_unlock'),
          }
        );
      } else if (connectionMode === 'local_push' && agentJob.yarJobId) {
        try { await runtime.cancelJob(agentJob.yarJobId); } catch { /* fenced on platform */ }
      }

      let updatedTask = null;
      await updateStore(async (mutableStore) => {
        const mutableProject = mutableStore.projects.find((entry) => entry.id === project.id);
        const job = ensureArray(mutableProject?.agentJobs).find((entry) => entry.id === agentJob.id);
        if (job) {
          job.status = 'cancelled';
          job.cancelReason = textOr(req.body?.reason, 'platform_force_unlock');
          job.error = 'Execução antiga terminada e bloqueio libertado pela plataforma.';
          job.updatedAt = nowIso();
        }
        const list = workItems.getWorkItems(mutableProject);
        const task = list.find((entry) => entry.id === agentJob.workItemId);
        if (task) {
          updatedTask = resetTaskForRestart(mutableProject, task.id, {
            at: nowIso(),
            actorUserId: req.auth.user.id,
          });
        }
        const request = ensureArray(mutableProject.agentRequests)
          .find((entry) => entry.id === agentJob.agentRequestId);
        if (request) {
          const requestTasks = workItems.getWorkItems(mutableProject)
            .filter((entry) => entry.agentRequestId === request.id && entry.taskRole !== 'coordination');
          request.status = requestTasks.some((entry) => ['in_progress', 'waiting_input'].includes(entry.status))
              ? 'running'
              : requestTasks.some((entry) => entry.status === 'ready')
                ? 'ready'
                : requestTasks.some((entry) => entry.status === 'waiting_review')
                  ? 'waiting_review'
              : requestTasks.length && requestTasks.every((entry) => workItems.isTerminalStatus(entry.status))
                ? 'completed'
                : 'ready';
          request.updatedAt = nowIso();
        }
        mutableProject.updatedAt = nowIso();
        appendActivity(mutableStore, {
          actorUserId: req.auth.user.id,
          projectId: project.id,
          action: 'agent_run_force_unlocked',
          details: {
            agentJobId: agentJob.id,
            dispatchId: dispatch?.id || agentJob.dispatchId || '',
            workItemId: agentJob.workItemId,
            providerNeutralFence: true,
          },
        });
      });

      return res.json({
        unlocked: true,
        agentJob: { ...agentJob, status: 'cancelled' },
        dispatch: dispatch ? publicDispatch(dispatch) : null,
        workItem: updatedTask ? workItems.toSlimCard(updatedTask) : null,
      });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.post('/api/projects/agent-runs/:runId/pause', authMiddleware, requireAgentProjectEditor, async (req, res) => {
    try {
      const runId = req.params.runId;
      const store = await readStore();
      const agentJob = store.projects
        .flatMap((entry) => ensureArray(entry.agentJobs))
        .find((job) => job.promptRunId === runId || job.id === runId);
      if (!agentJob) return res.status(404).json({ message: 'Agent run nao encontrado.' });
      if (connectionMode === 'disabled') return res.status(503).json({ message: 'Execucao por agente desativada.' });

      if (connectionMode === 'remote_pull') {
        const dispatch = connectorStore?.setDesiredAction(
          agentJob.dispatchId || agentJob.id || runId,
          'pause',
          { idempotencyKey: textOr(req.headers['idempotency-key'], `pause:${runId}:${nowIso()}`) }
        );
        if (!dispatch) return res.status(404).json({ message: 'Dispatch seguro nao encontrado.' });
        await updateStore(async (mutableStore) => {
          const mutableProject = mutableStore.projects.find((entry) => entry.id === agentJob.projectId);
          const task = workItems.findWorkItem(mutableProject, agentJob.workItemId);
          if (task) {
            const list = workItems.getWorkItems(mutableProject);
            workItems.setWorkItems(mutableProject, list.map((entry) => entry.id === task.id
              ? workItems.normalizeWorkItem({
                ...task,
                currentAction: 'Pausa pedida; o agente vai parar no próximo checkpoint seguro.',
                updatedAt: nowIso(),
              }, { project: mutableProject })
              : entry));
          }
          appendActivity(mutableStore, {
            actorUserId: req.auth.user.id,
            projectId: agentJob.projectId,
            action: 'agent_dispatch_pause_requested',
            details: { dispatchId: dispatch.id, agentJobId: agentJob.id },
          });
        });
        return res.status(202).json({ agentJob, dispatch: publicDispatch(dispatch) });
      }

      if (!agentJob.yarJobId) return res.status(400).json({ message: 'Job YAR nao encontrado.' });
      const paused = await runtime.pauseJob(agentJob.yarJobId);
      return res.status(202).json({ agentJob, yarJob: paused?.job || paused });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.post('/api/projects/agent-runs/:runId/finish-partial', authMiddleware, requireAgentProjectEditor, async (req, res) => {
    try {
      const runId = req.params.runId;
      const store = await readStore();
      const agentJob = store.projects
        .flatMap((entry) => ensureArray(entry.agentJobs))
        .find((job) => job.promptRunId === runId || job.id === runId);
      if (!agentJob) return res.status(404).json({ message: 'Agent run nao encontrado.' });

      if (connectionMode === 'remote_pull') {
        const dispatch = connectorStore?.setDesiredAction(
          agentJob.dispatchId || agentJob.id || runId,
          'finish_partial',
          { idempotencyKey: textOr(req.headers['idempotency-key'], `finish_partial:${runId}:${nowIso()}`) }
        );
        if (!dispatch) return res.status(404).json({ message: 'Dispatch seguro nao encontrado.' });
        await updateStore(async (mutableStore) => {
          const mutableProject = mutableStore.projects.find((entry) => entry.id === agentJob.projectId);
          const task = workItems.findWorkItem(mutableProject, agentJob.workItemId);
          if (task) {
            const list = workItems.getWorkItems(mutableProject);
            workItems.setWorkItems(mutableProject, list.map((entry) => entry.id === task.id
              ? workItems.normalizeWorkItem({
                ...task,
                currentAction: 'A preparar o progresso actual para avaliação humana.',
                updatedAt: nowIso(),
              }, { project: mutableProject })
              : entry));
          }
        });
        return res.status(202).json({ agentJob, dispatch: publicDispatch(dispatch) });
      }

      if (!agentJob.yarJobId) return res.status(400).json({ message: 'Job YAR nao encontrado.' });
      const resumed = await runtime.resumeJob(agentJob.yarJobId, { finishPartial: true });
      return res.status(202).json({ agentJob, yarJob: resumed?.job || resumed });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.post('/api/projects/agent-runs/:runId/resume', authMiddleware, requireAgentProjectEditor, async (req, res) => {
    try {
      const runId = req.params.runId;
      const store = await readStore();

      let agentJob = null;
      for (const entry of store.projects) {
        const found = ensureArray(entry.agentJobs).find((job) => job.promptRunId === runId || job.id === runId);
        if (found) {
          agentJob = found;
          break;
        }
      }

      if (!agentJob) {
        return res.status(404).json({ message: 'Agent run nao encontrado.' });
      }

      if (connectionMode === 'disabled') {
        return res.status(503).json({ message: 'Execucao por agente desativada.' });
      }

      if (connectionMode === 'remote_pull') {
        const dispatch = connectorStore?.setDesiredAction(
          agentJob.dispatchId || agentJob.id || runId,
          'resume',
          {
            idempotencyKey: textOr(req.headers['idempotency-key'], `resume:${runId}:${nowIso()}`),
            settingsPatch: req.body?.settings,
          }
        );
        if (!dispatch) return res.status(404).json({ message: 'Dispatch seguro nao encontrado.' });
        await updateStore(async (mutableStore) => {
          const mutableProject = mutableStore.projects.find((entry) => entry.id === agentJob.projectId);
          const task = workItems.findWorkItem(mutableProject, agentJob.workItemId);
          if (task) {
            const list = workItems.getWorkItems(mutableProject);
            workItems.setWorkItems(mutableProject, list.map((entry) => entry.id === task.id
              ? workItems.normalizeWorkItem({
                ...task,
                status: 'in_progress',
                currentAction: 'Continuação pedida; aguarda confirmação do Agent Runtime.',
                updatedAt: nowIso(),
              }, { project: mutableProject })
              : entry));
          }
        });
        return res.json({
          agentJob: { ...agentJob, status: dispatch.status },
          dispatch: publicDispatch(dispatch),
        });
      }

      if (!agentJob.yarJobId) {
        return res.status(400).json({ message: 'Job YAR nao encontrado.' });
      }

      const yarResponse = await runtime.resumeJob(agentJob.yarJobId, {
        budget: req.body?.budget,
        approveStage: req.body?.approveStage === true,
        finishPartial: req.body?.finishPartial === true,
      });

      await updateStore(async (mutableStore) => {
        const mutableProject = mutableStore.projects.find((entry) => entry.id === agentJob.projectId);
        const job = ensureArray(mutableProject?.agentJobs).find((entry) => entry.id === agentJob.id);
        if (job) {
          job.status = yarResponse?.job?.status || 'executing';
          job.updatedAt = nowIso();
        }
        const list = workItems.getWorkItems(mutableProject);
        const task = list.find((entry) => entry.id === agentJob.workItemId);
        if (task) workItems.setWorkItems(mutableProject, list.map((entry) => entry.id === task.id ? workItems.normalizeWorkItem({ ...task, status: 'in_progress', agentStatus: yarResponse?.job?.status || 'executing', currentAction: 'O agente retomou a execucao.', updatedAt: nowIso() }, { project: mutableProject }) : entry));
      });

      return res.json({
        agentJob: { ...agentJob, status: yarResponse?.job?.status || 'executing' },
        yarJob: yarResponse?.job,
      });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.post('/api/projects/agent-runs/:runId/sync-now', authMiddleware, requireAgentProjectEditor, async (req, res) => {
    try {
      const runId = req.params.runId;
      const store = await readStore();
      const agentJob = store.projects
        .flatMap((entry) => ensureArray(entry.agentJobs))
        .find((job) => job.promptRunId === runId || job.id === runId);
      if (!agentJob) return res.status(404).json({ message: 'Agent run nao encontrado.' });
      if (connectionMode !== 'remote_pull') {
        return res.status(400).json({ message: 'A sincronizacao imediata aplica-se ao conector remoto.' });
      }
      const dispatch = connectorStore?.setDesiredAction(
        agentJob.dispatchId || agentJob.id || runId,
        'sync_now',
        { idempotencyKey: textOr(req.headers['idempotency-key'], `sync_now:${runId}:${nowIso()}`) }
      );
      if (!dispatch) return res.status(404).json({ message: 'Dispatch seguro nao encontrado.' });
      await updateStore(async (mutableStore) => {
        const mutableProject = mutableStore.projects.find((entry) => entry.id === agentJob.projectId);
        const task = workItems.findWorkItem(mutableProject, agentJob.workItemId);
        if (!task) return;
        const list = workItems.getWorkItems(mutableProject);
        workItems.setWorkItems(mutableProject, list.map((entry) => entry.id === task.id
          ? workItems.normalizeWorkItem({
            ...task,
            currentAction: 'Sincronizacao imediata pedida ao Agent Runtime.',
            updatedAt: nowIso(),
          }, { project: mutableProject })
          : entry));
      });
      return res.status(202).json({
        pending: true,
        offline: !connectorStore.activeConnector()?.online,
        dispatch: publicDispatch(dispatch),
      });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.get('/api/projects/agent-runs/:runId/events/stream', authMiddleware, requireAgentProjectEditor, async (req, res) => {
    const runId = req.params.runId;
    const store = await readStore();
    const agentJob = store.projects
      .flatMap((entry) => ensureArray(entry.agentJobs))
      .find((job) => job.promptRunId === runId || job.id === runId);
    if (!agentJob) return res.status(404).json({ message: 'Agent run nao encontrado.' });
    const dispatch = connectorStore?.findDispatch(agentJob.dispatchId || agentJob.id || runId);
    if (!dispatch) return res.status(404).json({ message: 'Dispatch seguro nao encontrado.' });
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    let cursor = Math.max(0, Number(req.query.afterEventId) || 0);
    let closed = false;
    const close = () => { closed = true; clearInterval(interval); clearTimeout(timeout); res.end(); };
    const publish = () => {
      if (closed) return;
      const current = connectorStore.findDispatch(dispatch.id);
      if (!current) return close();
      const events = connectorStore.events(dispatch.id, cursor);
      if (events.length) cursor = Math.max(cursor, ...events.map((event) => Number(event.id) || 0));
      if (events.length || current.commandVersion !== current.acknowledgedCommandVersion) {
        res.write(`event: progress\ndata: ${JSON.stringify({
          dispatch: publicDispatch(current),
          events,
          cursor,
        })}\n\n`);
      } else {
        res.write(`: keepalive ${Date.now()}\n\n`);
      }
      if (['waiting_review', 'completed', 'failed', 'cancelled'].includes(current.status)) close();
    };
    const interval = setInterval(publish, 500);
    const timeout = setTimeout(close, 25_000);
    req.on('close', close);
    publish();
    return undefined;
  });

  app.delete('/api/projects/agent-runs/:runId', authMiddleware, requireAgentProjectEditor, async (req, res) => {
    try {
      const runId = req.params.runId;
      const store = await readStore();

      let agentJob = null;
      let projectId = null;

      for (const entry of store.projects) {
        const found = ensureArray(entry.agentJobs).find((job) => job.promptRunId === runId || job.id === runId);
        if (found) {
          agentJob = found;
          projectId = entry.id;
          break;
        }
      }

      if (!agentJob) {
        return res.status(404).json({ message: 'Agent run nao encontrado.' });
      }

      if (connectionMode === 'local_push'
        && agentJob.yarJobId
        && RUNTIME_ACTIVE_STATUSES.has(agentJob.status)) {
        try { await runtime.cancelJob(agentJob.yarJobId); } catch { /* ignore */ }
      }
      if (connectionMode === 'remote_pull' && connectorStore) {
        const dispatch = connectorStore.findDispatch(agentJob.dispatchId || agentJob.id || runId);
        if (dispatch?.status === 'waiting_review') {
          connectorStore.markReviewed(dispatch.id, 'rejected');
        } else if (dispatch && !['completed', 'failed', 'cancelled'].includes(dispatch.status)) {
          connectorStore.setDesiredAction(dispatch.id, 'cancel', {
            idempotencyKey: `dismiss:${agentJob.id}:cancel`,
          });
        }
      }

      await updateStore(async (mutableStore) => {
        const mutableProject = mutableStore.projects.find((e) => e.id === projectId);
        if (!mutableProject) return;
        mutableProject.agentJobs = ensureArray(mutableProject.agentJobs).filter(
          (j) => j.id !== agentJob.id && j.promptRunId !== runId
        );
        mutableProject.updatedAt = nowIso();
        appendActivity(mutableStore, {
          actorUserId: req.auth.user.id,
          projectId,
          action: 'agent_run_dismissed',
          details: { promptRunId: agentJob.promptRunId, agentId: agentJob.agentId },
        });
      });

      return res.json({ dismissed: true, promptRunId: agentJob.promptRunId });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get('/api/projects/agent-platform/settings', authMiddleware, requireRole('super_admin'), async (req, res) => {
    try {
      const settings = await agentPlatformSettings.readAgentPlatformSettings(dataDir);
      return res.json({ settings });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.patch('/api/projects/agent-platform/settings', authMiddleware, requireRole('super_admin'), async (req, res) => {
    try {
      const body = req.body || {};
      const settings = await agentPlatformSettings.writeAgentPlatformSettings(
        dataDir,
        { executionDefaults: body.executionDefaults || {} },
        req.auth?.user?.id || '',
      );
      return res.json({ settings });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.get('/api/projects/agent-runs/recent', authMiddleware, requireRole('super_admin'), async (req, res) => {
    try {
      const limit = Math.min(80, Math.max(1, Number(req.query.limit) || 30));
      const store = await readStore();
      const activeStatuses = new Set([
        'dispatching', 'queued', 'claimed', 'running', 'planning', 'researching',
        'executing', 'verifying', 'self_review', 'paused', 'waiting_review',
        'pending_human_review', 'connection_lost', 'blocked', 'budget_exhausted',
      ]);
      const rows = [];
      for (const project of store.projects || []) {
        for (const job of ensureArray(project.agentJobs)) {
          const status = textOr(job.status).toLowerCase();
          const task = workItems.findWorkItem(project, job.workItemId);
          rows.push({
            runId: job.id || job.promptRunId,
            projectId: project.id,
            projectName: project.name,
            workItemId: job.workItemId,
            taskTitle: task?.title || '',
            status,
            agentId: job.agentId || task?.agentId || '',
            updatedAt: job.updatedAt || job.createdAt || null,
            active: activeStatuses.has(status),
          });
        }
      }
      rows.sort((left, right) => String(right.updatedAt || '').localeCompare(String(left.updatedAt || '')));
      return res.json({ runs: rows.slice(0, limit) });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get('/api/projects/agent-runs/health', authMiddleware, async (req, res) => {
    try {
      if (connectionMode === 'remote_pull') {
        const connector = connectorStore?.activeConnector() || null;
        return res.json({
          mode: connectionMode,
          runtimeReachable: Boolean(connector?.online),
          paired: Boolean(connector),
          connector,
        });
      }
      if (connectionMode === 'disabled') {
        return res.json({ mode: connectionMode, runtimeReachable: false, paired: false });
      }
      const health = await runtime.health();
      return res.json({ runtimeReachable: true, health });
    } catch (error) {
      return res.json({ runtimeReachable: false, error: error.message });
    }
  });

  app.post('/api/projects/agent-runs/:runId/retry', authMiddleware, requireAgentProjectEditor, async (req, res) => {
    try {
      const runId = req.params.runId;
      const store = await readStore();
      let agentJob = null;
      let project = null;
      for (const entry of store.projects) {
        const found = ensureArray(entry.agentJobs).find((job) => job.promptRunId === runId || job.id === runId);
        if (found) {
          agentJob = found;
          project = entry;
          break;
        }
      }
      if (!agentJob || !project) {
        return res.status(404).json({ message: 'Agent run nao encontrado.' });
      }

      if (connectionMode === 'disabled') {
        return res.status(503).json({ message: 'Execucao por agente desativada.' });
      }

      const options = req.body?.options || agentJob.runtimeOptions || {};
      const budget = req.body?.budget || agentJob.budget || {
        maxTokens: 0,
        maxWallClockMinutes: 0,
        maxSubtasks: 8,
      };

      if (connectionMode === 'remote_pull') {
        const previousDispatch = connectorStore?.findDispatch(
          agentJob.dispatchId || agentJob.id || runId
        );
        if (!previousDispatch) {
          return res.status(404).json({ message: 'Dispatch seguro nao encontrado.' });
        }
        const task = workItems.findWorkItem(project, agentJob.workItemId);
        const request = agentRequests.getAgentRequests(project)
          .find((entry) => entry.id === agentJob.agentRequestId) || null;
        const retryConfig = task
          ? resolveExecutionConfig('remote_pull', request, task, {}, {})
          : { options, budget };
        const retrySettings = workItems.normalizeExecutionSettings(
          retryConfig.options?.executionSettings || retryConfig.options
        );
        const retryPackage = {
          ...previousDispatch.package,
          budget: retryConfig.budget,
          execution: {
            ...(previousDispatch.package.execution || {}),
            settingsVersion: retrySettings.version,
            settings: retrySettings,
          },
        };
        const dispatch = connectorStore?.retry(previousDispatch.id, {
          package: retryPackage,
        });
        if (!dispatch) return res.status(404).json({ message: 'Dispatch seguro nao encontrado.' });
        await updateStore(async (mutableStore) => {
          const mutableProject = mutableStore.projects.find((entry) => entry.id === project.id);
          const job = ensureArray(mutableProject?.agentJobs).find((entry) => entry.id === agentJob.id);
          if (job) {
            job.dispatchId = dispatch.id;
            job.status = 'queued';
            job.error = '';
            job.runtimeOptions = retryConfig.options;
            job.budget = retryConfig.budget;
            job.updatedAt = nowIso();
          }
          const restartTarget = workItems.findWorkItem(mutableProject, agentJob.workItemId);
          if (restartTarget) {
            resetTaskForRestart(mutableProject, restartTarget.id, {
              at: nowIso(),
              actorUserId: req.auth.user.id,
            });
            workItemsSync.onAgentRunStart(mutableProject, {
              workItemId: restartTarget.id,
              agentJobId: agentJob.id,
              promptRunId: agentJob.promptRunId,
              currentAction: 'Nova tentativa na fila; o runtime continuará do último checkpoint disponível.',
            });
            if (restartTarget.taskRole === 'coordination') {
              const allTasks = workItems.getWorkItems(mutableProject);
              const first = allTasks.find((task) => (
                task.parentTaskId === restartTarget.id && task.status === 'ready'
              ));
              if (first) {
                workItems.setWorkItems(mutableProject, allTasks.map((task) => (
                  task.id === first.id
                    ? workItems.normalizeWorkItem({
                      ...task,
                      status: 'in_progress',
                      agentStatus: 'queued',
                      currentAction: 'Nova tentativa na fila para esta subtarefa.',
                      updatedAt: nowIso(),
                    }, { project: mutableProject })
                    : task
                )));
              }
            }
          }
          appendActivity(mutableStore, {
            actorUserId: req.auth.user.id,
            projectId: project.id,
            action: 'agent_dispatch_retry_queued',
            details: {
              dispatchId: dispatch.id,
              previousDispatchId: dispatch.previousDispatchId,
              agentJobId: agentJob.id,
            },
          });
        });
        return res.json({
          agentJob: { ...agentJob, dispatchId: dispatch.id, status: 'queued', error: '' },
          dispatch: publicDispatch(dispatch),
          projectId: project.id,
          promptRunId: agentJob.promptRunId,
        });
      }

      let yarResponse;
      try {
        yarResponse = await runtime.createJob({
          agentId: agentJob.agentId || runtime.mapPlatformType(agentJob.agentType || agentJob.platformAgentType),
          projectId: project.id,
          platformRunId: agentJob.promptRunId || runId,
          budget,
          options,
        });
      } catch (error) {
        return res.status(502).json({ message: `Agent runtime indisponivel: ${error.message}` });
      }

      await updateStore(async (mutableStore) => {
        const mutableProject = mutableStore.projects.find((e) => e.id === project.id);
        const job = ensureArray(mutableProject?.agentJobs).find((e) => e.id === agentJob.id);
        if (job) {
          job.yarJobId = yarResponse?.job?.id || job.yarJobId;
          job.status = yarResponse?.job?.status || 'queued';
          job.error = '';
          job.runtimeOptions = options;
          job.budget = budget;
          job.updatedAt = nowIso();
        }
        resetTaskForRestart(mutableProject, agentJob.workItemId, {
          at: nowIso(),
          actorUserId: req.auth.user.id,
        });
        workItemsSync.onAgentRunStart(mutableProject, { workItemId: agentJob.workItemId, agentJobId: agentJob.id, promptRunId: agentJob.promptRunId, currentAction: 'O agente iniciou uma nova tentativa.' });
        mutableProject.updatedAt = nowIso();
      });

      return res.json({
        agentJob: { ...agentJob, yarJobId: yarResponse?.job?.id, status: yarResponse?.job?.status || 'queued' },
        yarJobId: yarResponse?.job?.id,
        projectId: project.id,
        promptRunId: agentJob.promptRunId,
      });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
}

function agentFriendlyName(agentType) {
  const map = {
    idea_augment: 'Expandir visão da ideia',
    reverse_idea: 'Ideia → requisitos',
    requirements_to_architecture: 'Requisitos → arquitectura',
    roadmap_plan: 'Arquitectura → roadmap',
    implementation_tasks: 'Roadmap → implementação',
  };
  return map[agentType] || agentType;
}

module.exports = {
  registerAgentRuntimeRoutes,
  serviceAuthMiddleware,
  buildPromptForAgentType,
  resolveExecutionConfig,
  selectReadyAgentTask,
  resolveContinuousExecutionTask,
  resetTaskForRestart,
  reconcileActiveAgentJobs,
};
