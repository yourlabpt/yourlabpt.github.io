/**
 * Git provider configuration and per-project repository binding.
 *
 * Provider settings are super-admin only: they carry a credential that can create
 * repositories. Reading a project's repository follows normal project access.
 */
const gitSettings = require('./git-provider-settings');
const gitRepositories = require('./git-repositories');
const { createGitProviderClient, parseRepositoryRef } = require('./git-provider-client');

function text(value, fallback = '') {
  const result = value === null || value === undefined ? '' : String(value).trim();
  return result || fallback;
}

function registerGitRoutes(app, deps) {
  const {
    authMiddleware,
    requireRole,
    loadProjectForUser,
    updateStore,
    appendActivity,
    dataDir,
  } = deps;

  async function clientFromSettings() {
    const settings = await gitSettings.readGitProviderSettings(dataDir);
    const token = await gitSettings.resolveGitToken(dataDir);
    return createGitProviderClient({
      provider: settings.provider,
      apiBaseUrl: settings.apiBaseUrl,
      token,
    });
  }

  app.get('/api/projects/git-provider/settings', authMiddleware, requireRole('super_admin'), async (req, res) => {
    try {
      const settings = await gitSettings.readGitProviderSettings(dataDir);
      return res.json({ settings: gitSettings.publicGitProviderSettings(settings, dataDir) });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.patch('/api/projects/git-provider/settings', authMiddleware, requireRole('super_admin'), async (req, res) => {
    try {
      const body = req.body || {};
      const patch = {};
      for (const field of ['provider', 'apiBaseUrl', 'account', 'defaultOwner', 'defaultVisibility', 'repositoryPrefix']) {
        if (body[field] !== undefined) patch[field] = body[field];
      }
      // Only touch the credential when the caller actually sent the field, so saving
      // other settings never clears a stored token.
      if (body.token !== undefined) patch.token = body.token;
      const settings = await gitSettings.writeGitProviderSettings(dataDir, patch, req.auth?.user?.id || '');
      return res.json({ settings: gitSettings.publicGitProviderSettings(settings, dataDir) });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.post('/api/projects/git-provider/verify', authMiddleware, requireRole('super_admin'), async (req, res) => {
    try {
      const client = await clientFromSettings();
      const identity = await client.verify();
      const owners = await client.listOwners().catch(() => []);
      const settings = await gitSettings.markVerified(dataDir, identity.account, req.auth?.user?.id || '');
      return res.json({
        identity,
        owners,
        settings: gitSettings.publicGitProviderSettings(settings, dataDir),
      });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.get('/api/projects/:projectId/repository', authMiddleware, loadProjectForUser, async (req, res) => {
    try {
      const project = req.loadedProject;
      const repository = gitRepositories.normalizeProjectRepository(project.repository);
      const settings = await gitSettings.readGitProviderSettings(dataDir);
      if (!repository) {
        return res.json({
          repository: null,
          suggestedName: gitRepositories.suggestRepositoryName(project.name, settings.repositoryPrefix),
          defaultOwner: settings.defaultOwner,
          defaultVisibility: settings.defaultVisibility,
          providerReady: Boolean(settings.token?.data),
        });
      }
      if (String(req.query.activity || '') !== 'true') {
        return res.json({ repository, providerReady: Boolean(settings.token?.data) });
      }
      const client = await clientFromSettings();
      const activity = await gitRepositories.readRepositoryActivity(client, repository);
      return res.json({ repository, activity, providerReady: true });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  // Attach a repository that already exists.
  app.post('/api/projects/:projectId/repository/link', authMiddleware, requireRole('super_admin'), loadProjectForUser, async (req, res) => {
    try {
      const project = req.loadedProject;
      const ref = parseRepositoryRef(req.body?.repository);
      if (!ref) {
        return res.status(400).json({ message: 'Indique o repositorio como "dono/nome" ou o URL completo.' });
      }
      const client = await clientFromSettings();
      // Reading it back proves the token can actually reach it before we store the link.
      const remote = await client.getRepository(ref.owner, ref.name);
      const repository = gitRepositories.buildProjectRepository(remote, {
        createdByPlatform: false,
        actorUserId: req.auth?.user?.id || '',
      });
      await updateStore(async (store) => {
        const target = store.projects.find((entry) => entry.id === req.params.projectId);
        if (!target) throw new Error('Projeto nao encontrado.');
        target.repository = repository;
        target.updatedAt = new Date().toISOString();
        appendActivity(store, {
          projectId: target.id,
          actorUserId: req.auth.user.id,
          action: 'repository_linked',
          details: { fullName: repository.fullName, url: repository.url },
        });
      });
      return res.json({ repository });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  // Provision a new repository for a project that does not have one.
  app.post('/api/projects/:projectId/repository/create', authMiddleware, requireRole('super_admin'), loadProjectForUser, async (req, res) => {
    try {
      const project = req.loadedProject;
      if (gitRepositories.normalizeProjectRepository(project.repository)) {
        return res.status(409).json({ message: 'Este projecto ja tem um repositorio ligado.' });
      }
      const settings = await gitSettings.readGitProviderSettings(dataDir);
      const client = await clientFromSettings();
      const remote = await client.createRepository({
        owner: text(req.body?.owner, settings.defaultOwner),
        name: text(req.body?.name)
          || gitRepositories.suggestRepositoryName(project.name, settings.repositoryPrefix),
        description: text(req.body?.description, text(project.description).slice(0, 200)),
        visibility: text(req.body?.visibility, settings.defaultVisibility),
        autoInit: true,
      });
      const repository = gitRepositories.buildProjectRepository(remote, {
        createdByPlatform: true,
        actorUserId: req.auth?.user?.id || '',
      });
      await updateStore(async (store) => {
        const target = store.projects.find((entry) => entry.id === req.params.projectId);
        if (!target) throw new Error('Projeto nao encontrado.');
        target.repository = repository;
        target.updatedAt = new Date().toISOString();
        appendActivity(store, {
          projectId: target.id,
          actorUserId: req.auth.user.id,
          action: 'repository_created',
          details: { fullName: repository.fullName, url: repository.url },
        });
      });
      return res.status(201).json({ repository });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  // Detaches the link only. The repository on the provider is never touched.
  app.delete('/api/projects/:projectId/repository', authMiddleware, requireRole('super_admin'), loadProjectForUser, async (req, res) => {
    try {
      const previous = gitRepositories.normalizeProjectRepository(req.loadedProject.repository);
      if (!previous) return res.status(404).json({ message: 'Nenhum repositorio ligado.' });
      await updateStore(async (store) => {
        const target = store.projects.find((entry) => entry.id === req.params.projectId);
        if (!target) throw new Error('Projeto nao encontrado.');
        target.repository = null;
        target.updatedAt = new Date().toISOString();
        appendActivity(store, {
          projectId: target.id,
          actorUserId: req.auth.user.id,
          action: 'repository_unlinked',
          details: { fullName: previous.fullName },
        });
      });
      return res.json({ unlinked: true, repository: null });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });
}

module.exports = { registerGitRoutes };
