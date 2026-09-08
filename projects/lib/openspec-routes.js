/**
 * OpenSpec endpoints: run it against a project's repository in either direction.
 *
 *   forward  — platform requirements become openspec/specs/ (idea to development)
 *   backward — openspec/specs/ becomes platform requirements (code to requirement)
 *
 * A pull returns a plan first and only applies when explicitly asked, so importing a
 * repository can never silently overwrite requirements someone is working on.
 */
const gitSettings = require('./git-provider-settings');
const gitRepositories = require('./git-repositories');
const openspecRepository = require('./openspec-repository');
const openspecSync = require('./openspec-sync');
const { createGitProviderClient } = require('./git-provider-client');

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function registerOpenspecRoutes(app, deps) {
  const {
    authMiddleware,
    requireRole,
    loadProjectForUser,
    updateStore,
    appendActivity,
    normalizeRequirementRecord,
    dataDir,
  } = deps;

  async function clientFor() {
    const settings = await gitSettings.readGitProviderSettings(dataDir);
    const token = await gitSettings.resolveGitToken(dataDir);
    return createGitProviderClient({
      provider: settings.provider,
      apiBaseUrl: settings.apiBaseUrl,
      token,
    });
  }

  function repositoryOf(project) {
    const repository = gitRepositories.normalizeProjectRepository(project.repository);
    if (!repository) {
      throw new Error('Este projecto ainda nao tem repositorio ligado. Ligue um em Definicoes.');
    }
    return repository;
  }

  // Drift between the platform and the repository, in both directions.
  app.get('/api/projects/:projectId/openspec', authMiddleware, loadProjectForUser, async (req, res) => {
    try {
      const project = req.loadedProject;
      const repository = repositoryOf(project);
      const client = await clientFor();
      const report = await openspecRepository.status(client, repository, ensureArray(project.requirements));
      return res.json({ repository, ...report });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  // Scaffold openspec/ into a repository that does not have it yet.
  app.post('/api/projects/:projectId/openspec/initialize', authMiddleware, requireRole('super_admin'), loadProjectForUser, async (req, res) => {
    try {
      const project = req.loadedProject;
      const repository = repositoryOf(project);
      const client = await clientFor();
      const result = await openspecRepository.initialize(
        client, repository, project, ensureArray(project.requirements)
      );
      await updateStore(async (store) => {
        const target = store.projects.find((entry) => entry.id === req.params.projectId);
        if (!target) throw new Error('Projeto nao encontrado.');
        appendActivity(store, {
          projectId: target.id,
          actorUserId: req.auth.user.id,
          action: 'openspec_initialized',
          details: { branch: result.branch, changeRequest: result.changeRequest?.url },
        });
      });
      return res.status(201).json(result);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  // Forward: platform -> repository.
  app.post('/api/projects/:projectId/openspec/push', authMiddleware, requireRole('super_admin'), loadProjectForUser, async (req, res) => {
    try {
      const project = req.loadedProject;
      const repository = repositoryOf(project);
      const client = await clientFor();
      const result = await openspecRepository.push(
        client, repository, project, ensureArray(project.requirements)
      );
      if (result.skipped) return res.json(result);
      await updateStore(async (store) => {
        const target = store.projects.find((entry) => entry.id === req.params.projectId);
        if (!target) throw new Error('Projeto nao encontrado.');
        appendActivity(store, {
          projectId: target.id,
          actorUserId: req.auth.user.id,
          action: 'openspec_pushed',
          details: { branch: result.branch, changeRequest: result.changeRequest?.url },
        });
      });
      return res.json(result);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  // Backward: repository -> platform. Returns a plan unless apply=true.
  app.post('/api/projects/:projectId/openspec/pull', authMiddleware, requireRole('super_admin'), loadProjectForUser, async (req, res) => {
    try {
      const project = req.loadedProject;
      const repository = repositoryOf(project);
      const client = await clientFor();
      const existing = ensureArray(project.requirements);
      const plan = await openspecRepository.pull(client, repository, { existingRequirements: existing });

      if (plan.empty) {
        return res.status(404).json({
          message: 'O repositorio nao tem especificacoes em openspec/specs/. Inicialize primeiro.',
        });
      }
      if (req.body?.apply !== true) {
        return res.json({
          applied: false,
          diff: plan.diff,
          capabilities: plan.specs.map((spec) => ({
            capability: spec.capability,
            requirements: spec.requirements.length,
            scenarios: spec.requirements.reduce((total, entry) => total + (entry.scenarios?.length || 0), 0),
          })),
          requirementCount: plan.requirements.length,
          preview: plan.requirements.slice(0, 20),
        });
      }

      // Incoming records win for the ids they carry; anything the platform has that
      // the repository does not is kept, never deleted by an import.
      const incomingById = new Map(plan.requirements.map((entry) => [String(entry.id), entry]));
      let updated = 0;
      let added = 0;
      await updateStore(async (store) => {
        const target = store.projects.find((entry) => entry.id === req.params.projectId);
        if (!target) throw new Error('Projeto nao encontrado.');
        const current = ensureArray(target.requirements);
        const merged = current.map((entry) => {
          const incoming = incomingById.get(String(entry.id));
          if (!incoming) return entry;
          incomingById.delete(String(entry.id));
          updated += 1;
          return normalizeRequirementRecord({ ...entry, ...incoming, updatedAt: new Date().toISOString() });
        });
        for (const incoming of incomingById.values()) {
          merged.push(normalizeRequirementRecord(incoming));
          added += 1;
        }
        target.requirements = merged;
        target.updatedAt = new Date().toISOString();
        appendActivity(store, {
          projectId: target.id,
          actorUserId: req.auth.user.id,
          action: 'openspec_pulled',
          details: { added, updated, capabilities: plan.specs.length },
        });
      });

      return res.json({ applied: true, added, updated, capabilities: plan.specs.length });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  // A change proposal under openspec/changes/<id>/.
  app.post('/api/projects/:projectId/openspec/changes', authMiddleware, requireRole('super_admin'), loadProjectForUser, async (req, res) => {
    try {
      const project = req.loadedProject;
      const repository = repositoryOf(project);
      const body = req.body || {};
      if (!String(body.title || '').trim()) {
        return res.status(400).json({ message: 'A proposta precisa de um titulo.' });
      }
      const client = await clientFor();
      const result = await openspecRepository.proposeChange(client, repository, {
        id: body.id,
        title: body.title,
        projectId: project.id,
        why: body.why,
        whatChanges: ensureArray(body.whatChanges),
        affectedCapabilities: ensureArray(body.affectedCapabilities),
        tasks: ensureArray(body.tasks),
        deltas: body.deltas && typeof body.deltas === 'object' ? body.deltas : {},
      });
      await updateStore(async (store) => {
        const target = store.projects.find((entry) => entry.id === req.params.projectId);
        if (!target) throw new Error('Projeto nao encontrado.');
        appendActivity(store, {
          projectId: target.id,
          actorUserId: req.auth.user.id,
          action: 'openspec_change_proposed',
          details: { changeId: result.changeId, changeRequest: result.changeRequest?.url },
        });
      });
      return res.status(201).json(result);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  // What the platform would write, without contacting the provider. Lets the operator
  // see the generated markdown before any branch exists.
  app.get('/api/projects/:projectId/openspec/preview', authMiddleware, loadProjectForUser, async (req, res) => {
    try {
      const project = req.loadedProject;
      const { files, specs } = openspecSync.buildRepositoryFiles(project, ensureArray(project.requirements));
      return res.json({ files, capabilities: specs.map((spec) => spec.capability) });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });
}

module.exports = { registerOpenspecRoutes };
