const crypto = require('crypto');
const deliveryOs = require('./delivery-os');
const workItems = require('./work-items');
const workItemsSync = require('./work-items-sync');
const agentRequests = require('./agent-requests');
const projectAccess = require('./project-access');
const stageTransitions = require('./stage-transition-requests');
const LEGACY_AGENT_MANIFESTS = {
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
      targetOutput: 'discovery_v1',
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
  'dispatching', 'running', 'queued', 'planning', 'executing', 'self_review', 'paused',
]);

const STALE_DISPATCH_MS = 120000;

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
  } = deps;

  const { createAgentRuntimeClient } = require('./agent-runtime-client');
  const runtime = createAgentRuntimeClient();
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
      const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim(); const scope = verifyTaskToken(token);
      if (scope.projectId !== req.params.projectId || scope.taskId !== req.params.workItemId) return res.status(403).json({ message: 'O token nao permite aceder a esta tarefa.' });
      const store = await readStore(); const project = store.projects.find((entry) => entry.id === req.params.projectId); if (!project) return res.status(404).json({ message: 'Projeto nao encontrado.' });
      const task = workItems.findWorkItem(project, req.params.workItemId); if (!task || task.agentRequestId !== scope.requestId) return res.status(404).json({ message: 'Tarefa nao encontrada.' });
      const request = agentRequests.getAgentRequests(project).find((entry) => entry.id === task.agentRequestId); const parent = task.taskRole === 'coordination' ? task : workItems.findWorkItem(project, task.parentTaskId);
      const tree = parent ? stageTransitions.buildTreePackage(project, parent) : null;
      return res.json({ projectId: project.id, request: request ? { id: request.id, version: request.version, title: request.title, requestMarkdown: request.requestMarkdown, desiredOutcomeMarkdown: request.desiredOutcomeMarkdown, inputSnapshot: request.inputSnapshot, inputFingerprint: request.inputFingerprint } : null, currentTask: task, taskGraph: tree?.children || [task], executionPackage: task.taskRole === 'coordination' ? tree?.text : task.executionPackage, allowedMcpTools: scope.allowedMcpTools || [], readOnly: true });
    } catch (error) { return res.status(401).json({ message: error.message }); }
  });

  app.post(
    '/api/projects/projects/:projectId/prompt-runs/:runId/agent-submit',
    serviceAuthMiddleware,
    async (req, res) => {
      try {
        const { projectId, runId } = req.params;
        const rawInput = String(req.body?.rawOutput || '');
        const parsedFromRaw = deliveryOs.parseAgentJsonOutput(rawInput);
        const parsed = parsedFromRaw.parsed;
        const rawOutput = parsedFromRaw.rawOutput || rawInput;
        const deferApply = req.body?.deferApply !== false;

        if (rawOutput && !parsed) {
          return res.status(400).json({
            message: 'JSON inválido devolvido pelo agente local.',
          });
        }

        await updateStore(async (store) => {
          const project = store.projects.find((e) => e.id === projectId);
          if (!project) throw new Error('Projeto nao encontrado.');
          const run = ensureArray(project.promptRuns).find((r) => r.id === runId);
          if (!run) throw new Error('Prompt run nao encontrado.');

          const agentJob = ensureArray(project.agentJobs).find((j) => j.promptRunId === runId);
          const delegatedTask = workItems.findWorkItem(project, agentJob?.workItemId || run.workItemId);
          if (delegatedTask?.taskRole === 'coordination') {
            const checked = stageTransitions.validateBundle(project, delegatedTask, parsed || rawOutput);
            const at = nowIso(); const byId = new Map(checked.outputs.map((row) => [row.taskId, row]));
            const next = workItems.getWorkItems(project).map((task) => {
              const row = byId.get(task.id); if (!row) return task;
              const childRaw = typeof row.output === 'string' ? row.output : JSON.stringify(row.output, null, 2);
              const attempt = { id: `attempt_${crypto.randomUUID()}`, number: task.attempts.length + 1, source: 'runtime', status: 'completed', agentJobId: agentJob?.id, promptRunId: runId, rawOutput: childRaw, resultSummaryMarkdown: childRaw.slice(0, 4000), connectionState: 'received', selectedAgentId: agentJob?.agentId, contextSnapshotHash: checked.request.inputFingerprint, packageVersion: row.packageVersion, createdAt: at, completedAt: at, updatedAt: at };
              return workItems.normalizeWorkItem({ ...task, status: 'waiting_review', agentStatus: 'pending_human_review', resultSummaryMarkdown: childRaw.slice(0, 4000), currentAction: 'O resultado do agente aguarda revisao.', attempts: [...task.attempts, attempt], taskActivity: [...task.taskActivity, { type: 'agent_bundle_received', message: 'Resultado recebido do agente através da tarefa-pai.', actorType: 'agent', actorId: agentJob?.agentId, createdAt: at }], updatedAt: at, updatedBy: 'agent_runtime' }, { project });
            });
            workItems.setWorkItems(project, next);
            run.rawOutput = rawOutput; run.parsedOutput = parsed; run.status = 'pending_review';
            if (agentJob) { agentJob.status = 'pending_human_review'; agentJob.updatedAt = at; }
            const request = ensureArray(project.agentRequests).find((entry) => entry.id === delegatedTask.agentRequestId);
            if (request) { request.status = 'waiting_review'; request.updatedAt = at; }
            const parent = workItems.findWorkItem(project, delegatedTask.id);
            if (parent) await notifyActionable(store, project, { type: 'task_review', task: parent, request, title: 'Resultados do agente prontos para revisao', message: `O pedido “${parent.title}” devolveu ${checked.tasks.length} resultado(s).` });
            project.updatedAt = at;
            appendActivity(store, { actorUserId: 'agent_runtime', projectId, action: 'agent_runtime_bundle_submitted', details: { promptRunId: runId, parentTaskId: delegatedTask.id, taskIds: checked.tasks.map((task) => task.id) } });
            return;
          }

          run.rawOutput = rawOutput;
          run.parsedOutput = parsed;
          run.status = deferApply ? 'pending_review' : 'applied';

          const upsert = deliveryOs.upsertHumanReviewFromPromptRun(project, run, parsed, rawOutput);

          if (agentJob) {
            agentJob.status = deferApply ? 'pending_human_review' : 'completed';
            agentJob.updatedAt = nowIso();
          }

          try {
            const summary = typeof parsed === 'object' && parsed
              ? JSON.stringify(parsed).slice(0, 4000)
              : String(rawOutput || '').slice(0, 4000);
            workItemsSync.onAgentRunComplete(project, {
              agentJobId: agentJob?.id,
              workItemId: agentJob?.workItemId,
              promptRunId: runId,
              resultSummaryMarkdown: summary,
              waitingReview: deferApply,
            });
            const request = ensureArray(project.agentRequests).find((entry) => entry.id === agentJob?.agentRequestId);
            if (request) {
              request.status = deferApply ? 'waiting_review' : 'completed';
              request.updatedAt = nowIso();
            }
            if (deferApply) {
              const task = workItems.findWorkItem(project, agentJob?.workItemId);
              if (task) await notifyActionable(store, project, { type: 'task_review', task, request, title: 'Resultado do agente pronto para revisão', message: `A tarefa “${task.title}” aguarda a sua validação.` });
            }
          } catch {
            // optional bridge
          }

          project.updatedAt = nowIso();

          appendActivity(store, {
            actorUserId: 'agent_runtime',
            projectId,
            action: 'agent_runtime_output_submitted',
            details: { promptRunId: runId, deferApply },
          });
        });

        const store = await readStore();
        const updated = store.projects.find((e) => e.id === projectId);
        const reviewRaw = ensureArray(updated?.humanReviews).find(
          (r) => r.promptRunId === runId || r.sourceId === runId
        );
        const review = reviewRaw && deliveryOs.isActionableReviewForPanel(normalizeHumanReview(reviewRaw))
          ? normalizeHumanReview(reviewRaw)
          : null;

        return res.json({
          projectId,
          promptRunId: runId,
          review,
          deferred: deferApply,
          noChanges: Boolean(parsed && !review),
        });
      } catch (error) {
        return res.status(400).json({ message: error.message });
      }
    }
  );

  app.post('/api/projects/agent-runs/prepare', authMiddleware, requireAgentProjectEditor, async (req, res) => {
    try {
      const { projectId, agentType, options = {} } = req.body || {};
      const agentId = runtime.mapPlatformType(agentType);

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
        maxTokens: 120000,
        maxWallClockMinutes: 45,
        maxSubtasks: 8,
      };
      let runtimeHealth = null;
      let runtimeReachable = false;

      try {
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
      const store = await readStore(); const project = store.projects.find((entry) => entry.id === req.params.projectId);
      if (!project) return res.status(404).json({ message: 'Projeto nao encontrado.' });
      const task = workItems.findWorkItem(project, req.params.workItemId); if (!task) return res.status(404).json({ message: 'Tarefa nao encontrada.' });
      const request = agentRequests.getAgentRequests(project).find((entry) => entry.id === task.agentRequestId) || null;
      const health = await runtime.health(); const listed = await runtime.listAgents();
      const rows = ensureArray(listed?.agents || listed);
      const requiredSkills = task.requiredSkills || []; const requiredTools = task.requiredMcpTools || [];
      const agents = rows.map((row) => {
        const raw = row.agent || row; const id = textOr(raw.id || raw.agentId || row.id); let skills = ensureArray(raw.skills || raw.capabilities).map((entry) => typeof entry === 'string' ? entry : entry.id).filter(Boolean); let tools = ensureArray(raw.mcpTools || raw.tools).map((entry) => typeof entry === 'string' ? entry : entry.id).filter(Boolean);
        const legacyManifest = !skills.length && !tools.length; if (legacyManifest && LEGACY_AGENT_MANIFESTS[id]) { skills = LEGACY_AGENT_MANIFESTS[id].skills; tools = LEGACY_AGENT_MANIFESTS[id].tools; }
        const compatible = requiredSkills.every((value) => skills.includes(value)) && requiredTools.every((value) => tools.includes(value));
        return { id, name: textOr(raw.name || raw.label, id), skills, mcpTools: tools, compatible, legacyManifest };
      }).filter((row) => row.id);
      const compatible = agents.filter((row) => row.compatible); const preferred = task.executionSettings?.agentId || request?.configSnapshot?.preferredAgentId || task.agentId;
      const selected = compatible.find((row) => row.id === preferred) || compatible[0] || null;
      return res.json({ reachable: true, health, task: workItems.toSlimCard(task), requestId: request?.id || '', requiredSkills, requiredMcpTools: requiredTools, agents, selectedAgentId: selected?.id || '', settings: task.executionSettings, scope: task.taskRole === 'coordination' ? 'tree' : 'task', contextSummary: task.taskRole === 'coordination' ? `Pedido completo com ${workItems.getWorkItems(project).filter((entry) => entry.parentTaskId === task.id).length} subtarefas e contexto autorizado do projecto.` : 'Contexto da tarefa-pai, projecto e outputs anteriores autorizados.' });
    } catch (error) { return res.status(503).json({ message: `Agent Runtime indisponivel: ${error.message}`, reachable: false }); }
  });

  app.post('/api/projects/agent-runs', authMiddleware, requireAgentProjectEditor, async (req, res) => {
    try {
      const {
        projectId,
        agentId: bodyAgentId,
        agentType,
        budget,
        options: bodyOptions = {},
        agentRequestId: requestedAgentRequestId,
        workItemId: requestedWorkItemId,
      } = req.body || {};

      let options = bodyOptions;
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
      let delegation = null;
      let delegatedTask = null;
      await updateStore(async (mutableStore) => {
        const mutableProject = mutableStore.projects.find((entry) => entry.id === projectId);
        workItems.migrateProjectWorkItems(mutableProject);
        agentRequests.migrateAgentRequests(mutableProject);
        const canonicalTask = workItems.findWorkItem(mutableProject, requestedWorkItemId);
        if (!canonicalTask) throw new Error('Tarefa canonica nao encontrada.');
        if (!canonicalTask.agentRequestId) throw new Error('A tarefa nao esta ligada a um pedido de agente.');
        if (requestedAgentRequestId && requestedAgentRequestId !== canonicalTask.agentRequestId) throw new Error('A tarefa nao pertence ao pedido de agente indicado.');
        const request = agentRequests.getAgentRequests(mutableProject).find((entry) => entry.id === canonicalTask.agentRequestId);
        if (!request) throw new Error('Pedido do agente nao encontrado.');
        options = { ...(request.runtimeConfig?.options || {}), ...bodyOptions };
        agentId = bodyAgentId || request.agentId || runtime.mapPlatformType(request.agentType);
        platformAgentType = request.agentType || runtime.mapAgentId(agentId);
        const tasks = workItems.getWorkItems(mutableProject).filter((task) => task.agentRequestId === request.id);
        delegation = { request: agentRequests.requestSummary(request, tasks), tasks, created: false };
        if (delegation.request.status === 'awaiting_approval' || delegation.request.status === 'revision_requested') {
          await notifyActionable(mutableStore, mutableProject, { type: 'plan_approval', request: delegation.request, title: 'Plano do agente aguarda aprovação', message: `${delegation.request.title} tem ${delegation.tasks.length} tarefa(s) para rever.` });
          return;
        }
        delegatedTask = delegation.tasks.find((task) => task.id === requestedWorkItemId) || null;
        if (!delegatedTask) throw new Error('Nao existe uma tarefa pronta para executar neste plano.');
        const active = ensureArray(mutableProject.agentJobs).find((job) => RUNTIME_ACTIVE_STATUSES.has(job.status));
        if (active) throw new Error('Ja existe uma tarefa de agente em execucao neste projecto.');
        mutableProject.updatedAt = nowIso();
      });

      if (requestedAgentRequestId) {
        built = buildPromptForAgentType(project, platformAgentType, {
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
        ? stageTransitions.buildTreePackage(project, delegatedTask)
        : { text: [delegatedTask.executionPackage?.instructions || delegatedTask.descriptionMarkdown, delegatedTask.executionPackage?.outputFormat ? `\n\nFormato:\n${delegatedTask.executionPackage.outputFormat}` : ''].join(''), contextSnapshotHash: delegation.request.inputFingerprint || '', children: [] };
      built = { ...built, fullPrompt: canonicalPackage.text || built.fullPrompt, contextPack: { ...(built.contextPack || {}), taskId: delegatedTask.id, agentRequestId: delegation.request.id, contextSnapshotHash: canonicalPackage.contextSnapshotHash } };

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

      if (agentJob.yarJobId && RUNTIME_ACTIVE_STATUSES.has(agentJob.status)) {
        try { await runtime.cancelJob(agentJob.yarJobId); } catch { /* ignore */ }
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

  app.get('/api/projects/agent-runs/health', authMiddleware, async (req, res) => {
    try {
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

      const options = req.body?.options || agentJob.runtimeOptions || {};
      const budget = req.body?.budget || agentJob.budget || {
        maxTokens: 120000,
        maxWallClockMinutes: 45,
        maxSubtasks: 8,
      };

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
};
