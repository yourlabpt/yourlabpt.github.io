/**
 * Driving the persona chain: start it, see where it is, answer its question, raise the
 * cap, stop it.
 *
 * `advance` decides and applies one step. When the step is a dispatch it prepares the
 * work item and returns what to run — the caller starts the run through the existing
 * agent-run path rather than this module opening a second way to execute agents.
 */
const crypto = require('crypto');
const loop = require('./orchestration-loop');
const projectBudget = require('./project-budget');
const agentPersonas = require('./agent-personas');
const agentPlatformSettings = require('./agent-platform-settings');
const workItems = require('./work-items');

function text(value, fallback = '') {
  const result = value === null || value === undefined ? '' : String(value).trim();
  return result || fallback;
}

/** What the UI needs to show the chain's state in one call. */
function publicState(project, decision, now = Date.now()) {
  const orchestration = loop.normalizeOrchestration(project.orchestration);
  return {
    status: orchestration.status,
    currentPersonaId: orchestration.currentPersonaId,
    question: orchestration.question,
    haltReason: orchestration.haltReason,
    startedAt: orchestration.startedAt,
    history: orchestration.history,
    budget: projectBudget.budgetState(project.budget, now),
    next: decision ? {
      action: decision.action,
      personaId: decision.persona?.id || decision.personaId || '',
      personaLabel: decision.persona?.label || '',
      reason: decision.reason || decision.budget?.reason || '',
      remainingUnits: decision.remainingUnits || 0,
    } : null,
  };
}

function registerOrchestrationRoutes(app, deps) {
  const {
    authMiddleware,
    requireRole,
    loadProjectForUser,
    updateStore,
    appendActivity,
    nowIso,
    dataDir,
    driver,
  } = deps;

  async function personaOverrides() {
    const settings = await agentPlatformSettings.readAgentPlatformSettings(dataDir);
    return settings.personas || {};
  }

  app.get('/api/projects/:projectId/orchestration', authMiddleware, loadProjectForUser, async (req, res) => {
    try {
      const project = req.loadedProject;
      const decision = loop.decideNext(project, { personaOverrides: await personaOverrides() });
      return res.json(publicState(project, decision));
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  // Starting also raises the cap on a chain paused for budget — same entry point.
  app.post('/api/projects/:projectId/orchestration/start', authMiddleware, requireRole('super_admin'), loadProjectForUser, async (req, res) => {
    try {
      const caps = {
        maxCostUsd: req.body?.maxCostUsd,
        maxHours: req.body?.maxHours,
      };
      let state = null;
      await updateStore(async (store) => {
        const project = store.projects.find((entry) => entry.id === req.params.projectId);
        if (!project) throw new Error('Projeto nao encontrado.');
        loop.startChain(project, caps);
        project.updatedAt = nowIso();
        state = publicState(project, null);
        appendActivity(store, {
          actorUserId: req.auth.user.id,
          projectId: project.id,
          action: 'orchestration_started',
          details: { maxCostUsd: project.budget.maxCostUsd, maxHours: project.budget.maxHours },
        });
      });
      // Dispatch straight away so starting the chain actually starts work.
      if (driver) await driver.advanceOnce(req.params.projectId, req.auth.user.id);
      return res.json(state);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  /**
   * One step of the chain. Returns the decision; when it is a dispatch the work item
   * exists and is ready to be run.
   */
  app.post('/api/projects/:projectId/orchestration/advance', authMiddleware, requireRole('super_admin'), loadProjectForUser, async (req, res) => {
    try {
      const overrides = await personaOverrides();
      let payload = null;
      await updateStore(async (store) => {
        const project = store.projects.find((entry) => entry.id === req.params.projectId);
        if (!project) throw new Error('Projeto nao encontrado.');

        const decision = loop.decideNext(project, { personaOverrides: overrides });

        if (decision.action === 'halt' && loop.normalizeOrchestration(project.orchestration).status !== 'halted') {
          loop.haltChain(project, decision.reason);
        }
        if (decision.action === 'paused_budget') {
          // Stop the clock so a paused chain does not keep burning hours.
          loop.stopChain(project, 'paused_budget');
        }
        if (decision.action === 'complete') {
          loop.stopChain(project, 'completed');
        }

        let dispatch = null;
        if (decision.action === 'dispatch') {
          const item = decision.workItem || createPersonaWorkItem(project, decision.persona, req.auth.user.id);
          loop.markDispatched(project, decision.persona, item);
          dispatch = {
            workItemId: item.id,
            agentType: decision.persona.taskTypes[0],
            agentId: decision.persona.agentId || '',
            personaId: decision.persona.id,
            deliveryStageId: item.deliveryStageId,
          };
          appendActivity(store, {
            actorUserId: req.auth.user.id,
            projectId: project.id,
            action: 'orchestration_dispatch',
            details: { personaId: decision.persona.id, workItemId: item.id },
          });
        }

        project.updatedAt = nowIso();
        payload = { ...publicState(project, decision), dispatch };
      });
      return res.json(payload);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  function createPersonaWorkItem(project, persona, actorUserId) {
    const item = workItems.normalizeWorkItem({
      id: `task_${crypto.randomUUID()}`,
      title: `${persona.label} — ${text(project.name, 'projecto')}`,
      status: 'ready',
      origin: 'orchestration',
      executorMode: 'agent',
      agentType: persona.taskTypes[0],
      agentId: persona.agentId || '',
      deliveryStageId: persona.deliveryStages[0],
      descriptionMarkdown: persona.summary,
      createdBy: actorUserId,
    }, { project });
    workItems.setWorkItems(project, [...workItems.getWorkItems(project), item]);
    return item;
  }

  // Records what a persona produced. This is what moves the chain forward.
  app.post('/api/projects/:projectId/orchestration/result', authMiddleware, requireRole('super_admin'), loadProjectForUser, async (req, res) => {
    try {
      const overrides = await personaOverrides();
      let payload = null;
      await updateStore(async (store) => {
        const project = store.projects.find((entry) => entry.id === req.params.projectId);
        if (!project) throw new Error('Projeto nao encontrado.');
        loop.recordResult(project, {
          personaId: req.body?.personaId,
          workItemId: req.body?.workItemId,
          outcome: req.body?.outcome,
          summary: req.body?.summary,
          failureMessage: req.body?.failureMessage,
          costUsd: req.body?.costUsd,
          seconds: req.body?.seconds,
          personaOverrides: overrides,
        });
        project.updatedAt = nowIso();
        payload = publicState(project, loop.decideNext(project, { personaOverrides: overrides }));
        appendActivity(store, {
          actorUserId: req.auth.user.id,
          projectId: project.id,
          action: 'orchestration_result',
          details: {
            personaId: text(req.body?.personaId),
            outcome: text(req.body?.outcome, 'completed'),
            costUsd: Number(req.body?.costUsd) || 0,
          },
        });
      });
      return res.json(payload);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.post('/api/projects/:projectId/orchestration/answer', authMiddleware, requireRole('super_admin'), loadProjectForUser, async (req, res) => {
    try {
      const overrides = await personaOverrides();
      let payload = null;
      await updateStore(async (store) => {
        const project = store.projects.find((entry) => entry.id === req.params.projectId);
        if (!project) throw new Error('Projeto nao encontrado.');
        const accepted = req.body?.accepted !== false;
        const question = loop.normalizeOrchestration(project.orchestration).question;
        loop.answerQuestion(project, { accepted });
        project.updatedAt = nowIso();
        payload = publicState(project, loop.decideNext(project, { personaOverrides: overrides }));
        appendActivity(store, {
          actorUserId: req.auth.user.id,
          projectId: project.id,
          action: accepted ? 'orchestration_question_accepted' : 'orchestration_question_rejected',
          details: { personaId: question?.personaId, kind: question?.kind },
        });
      });
      // Answering is what unblocks the chain — carry on from here unattended.
      if (driver) await driver.advanceOnce(req.params.projectId, req.auth.user.id);
      return res.json(payload);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.post('/api/projects/:projectId/orchestration/stop', authMiddleware, requireRole('super_admin'), loadProjectForUser, async (req, res) => {
    try {
      let payload = null;
      await updateStore(async (store) => {
        const project = store.projects.find((entry) => entry.id === req.params.projectId);
        if (!project) throw new Error('Projeto nao encontrado.');
        loop.stopChain(project, 'idle');
        project.updatedAt = nowIso();
        payload = publicState(project, null);
        appendActivity(store, {
          actorUserId: req.auth.user.id,
          projectId: project.id,
          action: 'orchestration_stopped',
          details: { spentUsd: projectBudget.normalizeProjectBudget(project.budget).spentUsd },
        });
      });
      return res.json(payload);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  void agentPersonas;
}

module.exports = { registerOrchestrationRoutes, publicState };
