const crypto = require('crypto');
const deliveryOs = require('./delivery-os');

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
  } = deps;

  const { createAgentRuntimeClient } = require('./agent-runtime-client');
  const runtime = createAgentRuntimeClient();

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

          run.rawOutput = rawOutput;
          run.parsedOutput = parsed;
          run.status = deferApply ? 'pending_review' : 'applied';

          const upsert = deliveryOs.upsertHumanReviewFromPromptRun(project, run, parsed, rawOutput);

          const agentJob = ensureArray(project.agentJobs).find((j) => j.promptRunId === runId);
          if (agentJob) {
            agentJob.status = deferApply ? 'pending_human_review' : 'completed';
            agentJob.updatedAt = nowIso();
          }

          try {
            const workItemsSync = require('./work-items-sync');
            const summary = typeof parsed === 'object' && parsed
              ? JSON.stringify(parsed).slice(0, 4000)
              : String(rawOutput || '').slice(0, 4000);
            workItemsSync.onAgentRunComplete(project, {
              agentJobId: agentJob?.id,
              promptRunId: runId,
              resultSummaryMarkdown: summary,
            });
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

  app.post('/api/projects/agent-runs/prepare', authMiddleware, requireRole('super_admin'), async (req, res) => {
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
      const built = buildPromptForAgentType(project, platformAgentType, promptBody);

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

  app.post('/api/projects/agent-runs', authMiddleware, requireRole('super_admin'), async (req, res) => {
    try {
      const {
        projectId,
        agentId: bodyAgentId,
        agentType,
        budget,
        options = {},
      } = req.body || {};

      const agentId = bodyAgentId || runtime.mapPlatformType(agentType);

      if (!projectId || !agentId) {
        return res.status(400).json({ message: 'projectId e agentId (ou agentType) sao obrigatorios.' });
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

      const built = buildPromptForAgentType(project, platformAgentType, promptBody);
      const run = normalizePromptRun({
        agentType: platformAgentType,
        stageId: options.stageId,
        capabilityId: options.capabilityId,
        moduleTag: options.moduleTag,
        targetOutput: built.targetOutput,
        contextPack: built.contextPack,
        fullPrompt: built.fullPrompt,
        createdBy: req.auth.user.id,
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
      };

      await updateStore(async (mutableStore) => {
        const mutableProject = mutableStore.projects.find((entry) => entry.id === projectId);

        for (const job of ensureArray(mutableProject.agentJobs)) {
          const isRuntime = job.mode === 'runtime' || Boolean(job.yarJobId);
          if (isRuntime && RUNTIME_ACTIVE_STATUSES.has(job.status)) {
            if (job.yarJobId) {
              try { await runtime.cancelJob(job.yarJobId); } catch { /* ignore */ }
            }
            job.status = 'cancelled';
            job.error = 'Substituído por nova execução';
            job.updatedAt = nowIso();
          }
        }

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
          details: { agentId, promptRunId: run.id },
        });
      });

      let yarResponse;
      try {
        yarResponse = await runtime.createJob({
          agentId,
          projectId,
          platformRunId: run.id,
          budget,
          options,
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
          const workItemsSync = require('./work-items-sync');
          workItemsSync.onAgentRunStart(mutableProject, {
            agentJobId: agentJob.id,
            planId: options?.taskPlan?.planId,
          });
        } catch {
          // optional bridge
        }
      });

      return res.status(201).json({
        agentJob: { ...agentJob, yarJobId: yarResponse?.job?.id, status: yarResponse?.job?.status || 'queued' },
        promptRun: run,
        yarJob: yarResponse?.job,
      });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get('/api/projects/agent-runs/:runId/status', authMiddleware, requireRole('super_admin'), async (req, res) => {
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

  app.post('/api/projects/agent-runs/:runId/cancel', authMiddleware, requireRole('super_admin'), async (req, res) => {
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
      });

      return res.json({ agentJob: { ...agentJob, status: 'cancelled' } });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.post('/api/projects/agent-runs/:runId/resume', authMiddleware, requireRole('super_admin'), async (req, res) => {
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
      });

      return res.json({
        agentJob: { ...agentJob, status: yarResponse?.job?.status || 'executing' },
        yarJob: yarResponse?.job,
      });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.delete('/api/projects/agent-runs/:runId', authMiddleware, requireRole('super_admin'), async (req, res) => {
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

  app.get('/api/projects/agent-runs/health', authMiddleware, requireRole('super_admin'), async (req, res) => {
    try {
      const health = await runtime.health();
      return res.json({ runtimeReachable: true, health });
    } catch (error) {
      return res.json({ runtimeReachable: false, error: error.message });
    }
  });

  app.post('/api/projects/agent-runs/:runId/retry', authMiddleware, requireRole('super_admin'), async (req, res) => {
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
        mutableProject.updatedAt = nowIso();
      });

      return res.json({
        agentJob: normalizeAgentJob(agentJob),
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
