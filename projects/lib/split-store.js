const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function projectFileName(projectId) {
  return `${String(projectId).replace(/[^a-zA-Z0-9_-]/g, '_')}.json`;
}

function buildIndexEntry(project) {
  return {
    id: project.id,
    name: project.name,
    clientName: project.clientName,
    description: project.description || '',
    status: project.status || 'active',
    proposalCode: project.proposalCode || '',
    subtitle: project.subtitle || '',
    language: project.language || 'pt-PT',
    currency: project.currency || 'EUR',
    deliveryLevel: project.deliveryLevel,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    createdBy: project.createdBy,
    members: ensureArray(project.members),
    requirementCount: ensureArray(project.requirements).length,
  };
}

function createSplitStoreLayer({
  dataDir,
  storePath,
  readJson,
  writeJson,
  pruneProject,
  withStoreLock,
  nowIso,
}) {
  const indexPath = path.join(dataDir, 'store-index.json');
  const projectsDir = path.join(dataDir, 'projects');
  const loadedProjects = new Map();
  let index = null;
  let splitReady = false;

  async function fileExists(target) {
    try {
      await fs.access(target);
      return true;
    } catch {
      return false;
    }
  }

  async function migrateMonolithicIfNeeded() {
    if (await fileExists(indexPath)) {
      splitReady = true;
      return;
    }
    if (!(await fileExists(storePath))) {
      splitReady = true;
      return;
    }

    const monolith = await readJson(storePath);
    await fs.mkdir(projectsDir, { recursive: true });

    const entries = [];
    for (const project of ensureArray(monolith.projects)) {
      if (pruneProject) pruneProject(project);
      const filePath = path.join(projectsDir, projectFileName(project.id));
      await writeJson(filePath, project, { compact: true });
      entries.push(buildIndexEntry(project));
      loadedProjects.set(project.id, project);
    }

    index = {
      version: monolith.version || 1,
      meta: {
        ...(monolith.meta || {}),
        updatedAt: nowIso(),
        storageLayout: 'split-v1',
      },
      users: ensureArray(monolith.users),
      activity: ensureArray(monolith.activity),
      projects: entries,
    };
    await writeJson(indexPath, index, { compact: true });

    const backupPath = `${storePath}.bak`;
    if (!(await fileExists(backupPath))) {
      await fs.rename(storePath, backupPath).catch(async () => {
        await fs.copyFile(storePath, backupPath);
      });
    }
    splitReady = true;
  }

  async function loadIndex() {
    if (!splitReady) await migrateMonolithicIfNeeded();
    if (index) return index;
    if (await fileExists(indexPath)) {
      index = await readJson(indexPath);
      return index;
    }
    if (await fileExists(storePath)) {
      await migrateMonolithicIfNeeded();
      return index;
    }
    index = {
      version: 1,
      meta: { createdAt: nowIso(), updatedAt: nowIso(), schemaVersion: 3, storageLayout: 'split-v1' },
      users: [],
      activity: [],
      projects: [],
    };
    return index;
  }

  async function readProjectBlob(projectId) {
    if (loadedProjects.has(projectId)) {
      return loadedProjects.get(projectId);
    }
    const filePath = path.join(projectsDir, projectFileName(projectId));
    if (await fileExists(filePath)) {
      const project = await readJson(filePath);
      loadedProjects.set(projectId, project);
      return project;
    }
    const idx = await loadIndex();
    const monolith = (await fileExists(storePath)) ? await readJson(storePath) : null;
    const fromMono = monolith?.projects?.find((p) => p.id === projectId);
    if (fromMono) {
      loadedProjects.set(projectId, fromMono);
      return fromMono;
    }
    return null;
  }

  async function writeProjectBlob(project) {
    if (!project?.id) return;
    await fs.mkdir(projectsDir, { recursive: true });
    const filePath = path.join(projectsDir, projectFileName(project.id));
    await writeJson(filePath, project, { compact: true });
    loadedProjects.set(project.id, project);

    const idx = await loadIndex();
    const entry = buildIndexEntry(project);
    const pos = idx.projects.findIndex((p) => p.id === project.id);
    if (pos >= 0) idx.projects[pos] = entry;
    else idx.projects.push(entry);
    idx.meta = idx.meta || {};
    idx.meta.updatedAt = nowIso();
    await writeJson(indexPath, idx, { compact: true });
    index = idx;
  }

  async function ensureProjectLoaded(projectId) {
    const project = await readProjectBlob(projectId);
    return project;
  }

  function assembleStore() {
    const idx = index || { users: [], activity: [], meta: {}, projects: [] };
    return {
      version: idx.version || 1,
      meta: idx.meta || {},
      users: idx.users || [],
      activity: idx.activity || [],
      projects: Array.from(loadedProjects.values()),
      _index: idx,
      _loadedIds: new Set(loadedProjects.keys()),
    };
  }

  async function readStore(ensureInitialized) {
    await ensureInitialized();
    await loadIndex();
    return assembleStore();
  }

  async function updateStore(mutator, ensureInitialized, options = {}) {
    const deferPersist = options.deferPersist === true;
    const dirtyIds = new Set();

    return withStoreLock(async () => {
      await ensureInitialized();
      await loadIndex();

      const store = assembleStore();
      const beforeIds = new Set(store.projects.map((p) => p.id));
      await mutator(store);

      for (const project of store.projects) {
        if (project?.id) {
          loadedProjects.set(project.id, project);
          dirtyIds.add(project.id);
        }
      }

      index.users = store.users || index.users;
      index.activity = store.activity || index.activity;
      index.meta = store.meta || index.meta;
      index.meta.updatedAt = nowIso();

      const persist = async () => {
        for (const id of dirtyIds) {
          const p = loadedProjects.get(id);
          if (p) await writeProjectBlob(p);
        }
        if (dirtyIds.size === 0) {
          await writeJson(indexPath, index, { compact: true });
        }
      };

      if (deferPersist) {
        setTimeout(() => { persist().catch((e) => console.error('Deferred split persist:', e.message)); }, 400);
        return;
      }
      await persist();
    });
  }

  function seedMemoryStore(store) {
    index = {
      version: store.version || 1,
      meta: store.meta || {},
      users: store.users || [],
      activity: store.activity || [],
      projects: ensureArray(store.projects).map(buildIndexEntry),
    };
    loadedProjects.clear();
    for (const p of ensureArray(store.projects)) {
      loadedProjects.set(p.id, p);
    }
    splitReady = true;
  }

  async function persistFullMonolithFallback(store) {
    await writeJson(storePath, {
      version: store.version,
      meta: store.meta,
      users: store.users,
      activity: store.activity,
      projects: Array.from(loadedProjects.values()),
    }, { compact: true });
  }

  return {
    readStore,
    updateStore,
    loadIndex,
    ensureProjectLoaded,
    readProjectBlob,
    writeProjectBlob,
    seedMemoryStore,
    migrateMonolithicIfNeeded,
    assembleStore,
    get loadedProjects() { return loadedProjects; },
  };
}

module.exports = { createSplitStoreLayer, buildIndexEntry, projectFileName };
