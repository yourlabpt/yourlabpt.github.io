const crypto = require('crypto');
const path = require('path');
const fs = require('fs').promises;
const { execFileSync } = require('child_process');
const multer = require('multer');
const deliveryOs = require('./lib/delivery-os');
const deliveryOsPlatform = require('./lib/delivery-os-platform');
const projectAccess = require('./lib/project-access');
const projectAudit = require('./lib/project-audit');
const { createSplitStoreLayer, projectFileName } = require('./lib/split-store');
const projectPayload = require('./lib/project-payload');
const blobStore = require('./lib/blob-store');
const { createSqliteStore } = require('./lib/sqlite-store');
const { migrateToHybridStorage } = require('./lib/hybrid-migrate');
const { repairProjectRequirements } = require('./lib/hybrid-repair');
const zlib = require('zlib');
const { promisify } = require('util');
const gzipAsync = promisify(zlib.gzip);
const { registerAgentRuntimeRoutes } = require('./lib/agent-runtime-routes');
const { AgentConnectorStore } = require('./lib/agent-connector-store');
const { normalizeMode } = require('./lib/agent-connection-mode');
const { registerWorkItemRoutes } = require('./lib/work-items-routes');
const phaseContent = require('./lib/phase-content');
const reqHierarchy = require('./lib/requirement-hierarchy');
const phaseSync = require('./lib/phase-sync');
const roadmapSync = require('./lib/roadmap-sync');
const proposalGenerator = require('./lib/proposal-generator');
const { createAgentRuntimeClient } = require('./lib/agent-runtime-client');
const engineeringState = require('./lib/engineering-state');
const { registerEngineeringStateRoutes } = require('./lib/engineering-state-routes');

const SESSION_TTL_MS = 1000 * 60 * 60 * 12;
const sessions = new Map();

const DEFAULT_COMMERCIAL_TERMS = {
  validityDays: 30,
  warrantyDays: 30,
  exclusions: [],
  notes: []
};

const REQUIREMENT_STATUS_FLOW = [
  'draft',
  'needs_clarification',
  'approved',
  'planned',
  'in_development',
  'validated',
  'delivered',
  'excluded'
];

const REQUIREMENT_TYPE_META = {
  stakeholder: { prefix: 'STK', label: 'Stakeholder' },
  functional: { prefix: 'FR', label: 'Funcional' },
  non_functional: { prefix: 'RNF', label: 'Nao Funcional' },
  test_case: { prefix: 'TC', label: 'Teste / Aceite' },
  undefined: { prefix: 'UQ', label: 'Nao Definido' },
  out_of_scope: { prefix: 'OOS', label: 'Fora de Escopo' }
};

const ARCHITECTURE_MODULES = ['Frontend', 'Backend', 'Database', 'System', 'Integrations'];
const DEFAULT_ARCHITECTURE_MODULE = 'Backend';
const QUESTION_STATUS_FLOW = ['open', 'sent', 'answered', 'resolved', 'blocked'];
const QUESTION_TARGET_FLOW = ['client', 'partner', 'both'];
const QUESTION_CATEGORY_FLOW = ['scope', 'functional', 'non_functional', 'integration', 'data', 'business_rule', 'ux', 'security', 'timeline', 'pricing', 'other'];
const DELIVERY_STAGE_FLOW = [
  { id: 'idea', label: 'Idea' },
  { id: 'discovery', label: 'Discovery' },
  { id: 'requirements', label: 'Requirements' },
  { id: 'architecture', label: 'Architecture' },
  { id: 'roadmap', label: 'Roadmap' },
  { id: 'implementation', label: 'Implementation' },
  { id: 'validation', label: 'Validation' },
  { id: 'delivery', label: 'Delivery' },
  { id: 'operations', label: 'Operations' },
];
const DELIVERY_LEVELS = ['simple', 'standard', 'complete'];
const ARTIFACT_TYPES = [
  'note', 'requirement', 'architecture', 'architecture_object', 'data_entity', 'api_endpoint',
  'roadmap', 'test', 'deliverable', 'monitoring', 'other',
];
const TRACE_RELATIONSHIP_TYPES = [
  'derives_from',
  'satisfies',
  'decomposes_from',
  'constrains',
  'verified_by',
  'contains',
  'implements',
  'tests',
  'documents',
  'depends_on',
  'affects',
  'supersedes',
  'monitors',
  'evidences',
  'owned_by',
  'measures',
];

function registerRequirementsPlatform(app, options) {
  const {
    rootDir,
    platformDir,
    logoPath,
    buildScriptPath,
    sendProjectEmail,
  } = options;

  const rootBase = rootDir || path.resolve(platformDir, '..');
  const agentConnectionMode = normalizeMode(process.env.AGENT_CONNECTION_MODE, process.env.NODE_ENV);
  const resolvedLogoPath = logoPath
    ? (path.isAbsolute(logoPath) ? logoPath : path.join(rootBase, logoPath))
    : path.join(rootBase, 'Logos YourLab', '1.png');
  const resolvedBuildScriptPath = buildScriptPath
    ? (path.isAbsolute(buildScriptPath) ? buildScriptPath : path.join(rootBase, buildScriptPath))
    : null;

  const dataDir = path.join(platformDir, 'data');
  const uploadsDir = path.join(platformDir, 'uploads');
  const storePath = path.join(dataDir, 'store.json');

  let sqliteStore;
  try {
    sqliteStore = createSqliteStore({ dataDir });
  } catch (error) {
    console.warn('SQLite indisponivel — modo apenas ficheiros:', error.message);
    sqliteStore = {
      isEnabled: () => false,
      isHybridLayout: () => false,
      markHybridLayout: () => {},
      getUsers: () => [],
      saveUsers: () => {},
      getActivity: () => [],
      getRepairActivity: () => [],
      appendActivity: () => {},
      replaceActivity: () => {},
      loadRequirements: () => [],
      saveRequirements: () => {},
      canUseSqlite: () => false,
      isReady: () => false,
      isEnabled: () => false,
      verifyRequirementsSaved: () => false,
      deleteProjectData: () => {},
    };
  }
  const connectorStore = sqliteStore.canUseSqlite()
    ? new AgentConnectorStore(sqliteStore.getDb())
    : null;

  function isHybridStorage(store) {
    return store?._index?.meta?.storageLayout === 'hybrid-v2';
  }

  function isProjectHybrid(project) {
    return Boolean(project?.storageHybrid || project?.requirementsInDb);
  }

  let storeQueue = Promise.resolve();
  let storeInitialized = false;

  function withStoreLock(task) {
    const run = storeQueue.then(task);
    storeQueue = run.catch(() => {});
    return run;
  }

  function normalizeStoreRecord(store) {
    store.version = 1;
    store.meta = store.meta || { createdAt: nowIso(), updatedAt: nowIso(), schemaVersion: 2 };
    const previousSchema = Number.isFinite(Number(store.meta.schemaVersion)) ? Number(store.meta.schemaVersion) : 2;
    let needsPersist = previousSchema < 3;
    store.meta.schemaVersion = Math.max(previousSchema, 3);
    store.users = Array.isArray(store.users) ? store.users : [];
    store.projects = Array.isArray(store.projects) ? store.projects : [];
    store.activity = Array.isArray(store.activity) ? store.activity : [];
    store.users = store.users.map((user) => ({
      ...user,
      canViewBudget: user.role === 'partner' && user.canViewBudget === true,
    }));

    const existingSuper = store.users.some((u) => u.role === 'super_admin' && u.isActive !== false);
    if (!existingSuper) {
      store.users.push({
        id: `usr_${crypto.randomUUID()}`,
        name: 'Super Admin',
        email: (process.env.REQ_PLATFORM_SUPER_ADMIN_EMAIL || 'admin@yourlab.local').toLowerCase(),
        role: 'super_admin',
        passwordHash: hashPassword(process.env.REQ_PLATFORM_SUPER_ADMIN_PASSWORD || 'change-me-now'),
        isActive: true,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });
      needsPersist = true;
    }

    store.projects = store.projects.map((project) => normalizeOneProject(project));

    return { store, needsPersist: needsPersist || previousSchema < 3 };
  }

  function normalizeOneProject(project) {
    const normalized = { ...project };
    normalized.deliveryLevel = normalizeDeliveryLevel(project.deliveryLevel);
    normalized.requirements = ensureArray(project.requirements).map((entry) => normalizeRequirementRecord(entry));
    normalized.clarificationQuestions = normalizeClarificationQuestions(project.clarificationQuestions || project.questions);
    normalized.meetingMinutes = normalizeMeetingMinutes(project.meetingMinutes);
    normalized.minutesPromptHistory = normalizeMinutesPromptHistory(project.minutesPromptHistory);
    normalized.documents = phaseContent.normalizeProjectDocuments(project.documents);
    normalized.stages = normalizeProjectStages(project.stages, normalized.deliveryLevel);
    normalized.artifacts = normalizeArtifacts(project.artifacts);
    normalized.approvals = normalizeApprovals(project.approvals);
    normalized.impactReports = normalizeImpactReports(project.impactReports);
    Object.assign(normalized, deliveryOs.normalizeProjectV3Fields(project));
    Object.assign(normalized, deliveryOsPlatform.normalizePlatformFields(project));
    normalized.auditLog = projectAudit.normalizeAuditLog(project.auditLog);
    normalized.requirements = normalized.requirements.map((entry) => deliveryOs.enrichRequirementWithModuleTags(entry));
    normalized.traceLinks = normalizeTraceLinks(project.traceLinks, normalized.requirements, normalized.artifacts, normalized);
    normalized.engineeringState = engineeringState.normalizeState(project.engineeringState);
    normalized.engineeringChangeSets = ensureArray(project.engineeringChangeSets);
    normalized.featureFlags = project.featureFlags && typeof project.featureFlags === 'object'
      ? { ...project.featureFlags }
      : {};
    normalized.generated = ensureArray(project.generated).map((entry) => ({
      ...entry,
      selectedModules: normalizeArchitectureModuleList(entry?.selectedModules),
    }));
    projectPayload.pruneProjectStorage(normalized);
    return normalized;
  }

  async function ensureStoreInitialized() {
    if (storeInitialized) {
      return;
    }

    await withStoreLock(async () => {
      if (storeInitialized) {
        return;
      }

      await fs.mkdir(dataDir, { recursive: true });
      await fs.mkdir(uploadsDir, { recursive: true });

      const indexPath = path.join(dataDir, 'store-index.json');

      if (!(await fileExists(storePath)) && !(await fileExists(indexPath))) {
        const passwordHash = hashPassword(process.env.REQ_PLATFORM_SUPER_ADMIN_PASSWORD || 'change-me-now');
        const seedStore = {
          version: 1,
          meta: {
            createdAt: nowIso(),
            updatedAt: nowIso(),
            schemaVersion: 3,
            storageLayout: 'split-v1',
          },
          users: [
            {
              id: `usr_${crypto.randomUUID()}`,
              name: 'Super Admin',
              email: (process.env.REQ_PLATFORM_SUPER_ADMIN_EMAIL || 'admin@yourlab.local').toLowerCase(),
              role: 'super_admin',
              passwordHash,
              isActive: true,
              createdAt: nowIso(),
              updatedAt: nowIso(),
            },
          ],
          projects: [],
          activity: [],
        };

        await writeJson(indexPath, {
          version: seedStore.version,
          meta: seedStore.meta,
          users: seedStore.users,
          activity: seedStore.activity,
          projects: [],
        }, { compact: true });
        storeLayer.seedMemoryStore(seedStore);
        await storeLayer.migrateMonolithicIfNeeded();
        try {
          const migration = await migrateToHybridStorage({
            dataDir,
            storeLayer,
            sqliteStore,
            blobStore,
            readJson,
            writeJson,
            normalizeOneProject,
            nowIso,
          });
          if (migration.migrated) {
            console.log('Hybrid storage inicializado para instalação nova.');
          }
        } catch (error) {
          console.error('Migracao hybrid ignorada:', error.message);
        }
        await repairHybridProjectsOnStartup();
        storeInitialized = true;
        return;
      }

      if (await fileExists(storePath)) {
        const store = await readJson(storePath);
        const { store: normalizedStore, needsPersist } = normalizeStoreRecord(store);
        if (needsPersist) {
          normalizedStore.meta.updatedAt = nowIso();
          await writeJson(storePath, normalizedStore, { compact: true });
        }
      }

      await storeLayer.migrateMonolithicIfNeeded();

      try {
        const migration = await migrateToHybridStorage({
          dataDir,
          storeLayer,
          sqliteStore,
          blobStore,
          readJson,
          writeJson,
          normalizeOneProject,
          nowIso,
        });
        if (migration.migrated) {
          console.log(
            `Hybrid storage: ${migration.projectsMigrated} projetos, `
            + `${migration.users} utilizadores, ${migration.activity} atividades migrados.`,
          );
        }
      } catch (error) {
        console.error('Migracao hybrid ignorada:', error.message);
      }

      await repairHybridProjectsOnStartup();
      await externalizeInlineRequirementsOnStartup();
      await backfillEngineeringProjectionOnStartup();

      storeInitialized = true;
    });
  }

  async function ensureStore() {
    await ensureStoreInitialized();
  }

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 25 * 1024 * 1024,
    },
  });

  const storeLayer = createSplitStoreLayer({
    dataDir,
    storePath,
    readJson,
    writeJson,
    pruneProject: (project) => {
      Object.assign(project, normalizeOneProject(project));
      return projectPayload.pruneProjectStorage(project);
    },
    withStoreLock,
    nowIso,
  });

  const originalWriteProjectBlob = storeLayer.writeProjectBlob.bind(storeLayer);

  async function repairHybridProjectsOnStartup() {
    try {
      const idx = await storeLayer.loadIndex();
      if (idx?.meta?.storageLayout !== 'hybrid-v2') return;

      for (const entry of ensureArray(idx.projects)) {
        let dbCount = 0;
        try {
          dbCount = sqliteStore.loadRequirements(entry.id).length;
        } catch {
          dbCount = 0;
        }
        if (dbCount > 0) continue;

        const project = await storeLayer.readProjectBlob(entry.id);
        if (!project) continue;
        if (ensureArray(project.requirements).length > 0) continue;
        if (!project.requirementsInDb && !project.storageHybrid && !(entry.requirementCount > 0)) continue;

        const repair = await repairProjectRequirements({
          project,
          indexEntry: entry,
          dataDir,
          storePath,
          sqliteStore,
          readJson,
          writeJson,
          storeLayer,
          blobStore,
        });
        if (repair.repaired) {
          console.log(`Requisitos reparados (${entry.id}): ${repair.reason} (${repair.count})`);
        } else if ((entry.requirementCount || 0) > 0) {
          console.error(`Requisitos em falta (${entry.id}): ${repair.reason}`);
        }
      }
    } catch (error) {
      console.error('Reparacao hybrid no arranque:', error.message);
    }
  }

  async function externalizeInlineRequirementsOnStartup() {
    try {
      const sqliteReady = typeof sqliteStore.isReady === 'function'
        ? sqliteStore.isReady()
        : sqliteStore.isEnabled();
      if (!sqliteReady) return;

      const idx = await storeLayer.loadIndex();
      for (const entry of ensureArray(idx?.projects)) {
        const project = await storeLayer.readProjectBlob(entry.id);
        if (!project) continue;

        const inlineReqs = ensureArray(project.requirements);
        if (!inlineReqs.length) continue;

        if (!sqliteStore.requirementsMatchStore(project.id, inlineReqs)) {
          sqliteStore.saveRequirements(project.id, inlineReqs);
        }

        project.requirements = inlineReqs;
        project.storageHybrid = true;
        project.requirementsInDb = true;
        project.requirementCount = inlineReqs.length;

        await blobStore.externalizeProjectBlobs(project, dataDir, writeJson);
        const disk = blobStore.prepareProjectForDisk({
          ...project,
          storageHybrid: true,
          requirementsInDb: true,
          requirementCount: inlineReqs.length,
        });
        const filePath = path.join(dataDir, 'projects', projectFileName(project.id));
        await writeJson(filePath, disk, { compact: true });
        storeLayer.loadedProjects.set(project.id, project);

        const indexPos = ensureArray(idx.projects).findIndex((item) => item.id === project.id);
        if (indexPos >= 0) {
          idx.projects[indexPos] = {
            ...idx.projects[indexPos],
            requirementCount: inlineReqs.length,
            updatedAt: project.updatedAt,
          };
        }
        console.log(`Requisitos externalizados para SQLite (${project.id}): ${inlineReqs.length}`);
      }

      if (idx?.meta) {
        idx.meta.storageLayout = idx.meta.storageLayout || 'hybrid-v2';
        await writeJson(path.join(dataDir, 'store-index.json'), idx, { compact: true });
      }
    } catch (error) {
      console.error('Externalizacao de requisitos no arranque:', error.message);
    }
  }

  async function backfillEngineeringProjectionOnStartup() {
    if (!sqliteStore.canUseSqlite?.() || typeof sqliteStore.saveEngineeringProjection !== 'function') return;
    try {
      const idx = await storeLayer.loadIndex();
      for (const entry of ensureArray(idx?.projects)) {
        const project = await storeLayer.readProjectBlob(entry.id);
        if (!project) continue;
        const state = engineeringState.normalizeState(project.engineeringState);
        const changeSets = ensureArray(project.engineeringChangeSets);
        if (!sqliteStore.engineeringProjectionMatches(project.id, state, changeSets)) {
          sqliteStore.saveEngineeringProjection(project.id, state, changeSets);
        }
      }
    } catch (error) {
      console.warn('Engineering shadow projection indisponivel:', error.message);
    }
  }

  async function attachProjectRequirements(project) {
    if (!project?.id) return project;
    if (ensureArray(project.requirements).length) return project;

    const sqliteReady = typeof sqliteStore.isReady === 'function'
      ? sqliteStore.isReady()
      : sqliteStore.isEnabled();
    if (sqliteReady) {
      try {
        const count = typeof sqliteStore.getRequirementCount === 'function'
          ? sqliteStore.getRequirementCount(project.id)
          : 0;
        if (count > 0) {
          project.requirements = sqliteStore.loadRequirements(project.id);
          return project;
        }
      } catch {
        // fall through to inline JSON on disk
      }
    }

    if (!ensureArray(project.requirements).length) {
      const fresh = await storeLayer.readProjectBlob(project.id);
      if (fresh && ensureArray(fresh.requirements).length) {
        project.requirements = fresh.requirements;
      }
    }
    return project;
  }

  async function persistProjectHybrid(project, { storeHybrid = false } = {}) {
    if (!project?.id) return;
    const full = storeLayer.loadedProjects.get(project.id) || project;
    const requirements = ensureArray(full.requirements);
    const useDb = isProjectHybrid(full) || storeHybrid;

    if (useDb && requirements.length === 0) {
      const idx = await storeLayer.loadIndex();
      const entry = ensureArray(idx?.projects).find((item) => item.id === project.id);
      if ((entry?.requirementCount || 0) > 0) {
        throw new Error(`Refusing to persist projeto ${project.id} sem requisitos (esperados ${entry.requirementCount}).`);
      }
    }

    if (useDb && requirements.length) {
      sqliteStore.saveRequirements(project.id, requirements);
      if (!sqliteStore.verifyRequirementsSaved(project.id, requirements)) {
        throw new Error(`SQLite nao confirmou requisitos do projeto ${project.id}`);
      }
    }

    await blobStore.externalizeProjectBlobs(full, dataDir, writeJson);

    const disk = blobStore.prepareProjectForDisk({
      ...full,
      storageHybrid: useDb,
      requirementsInDb: useDb,
      requirementCount: requirements.length,
    });
    await originalWriteProjectBlob(disk);
    if (typeof sqliteStore.saveEngineeringProjection === 'function') {
      try {
        sqliteStore.saveEngineeringProjection(
          full.id,
          engineeringState.normalizeState(full.engineeringState),
          ensureArray(full.engineeringChangeSets)
        );
      } catch (error) {
        console.warn(`Engineering shadow projection falhou (${full.id}):`, error.message);
      }
    }
    storeLayer.loadedProjects.set(project.id, {
      ...full,
      requirements,
      storageHybrid: disk.storageHybrid,
      requirementsInDb: disk.requirementsInDb,
    });
  }

  storeLayer.writeProjectBlob = async function writeProjectBlobHybrid(project) {
    const mem = storeLayer.loadedProjects.get(project?.id) || project;
    const idx = await storeLayer.loadIndex();
    const storeHybrid = idx?.meta?.storageLayout === 'hybrid-v2';
    if (storeHybrid || isProjectHybrid(mem)) {
      await persistProjectHybrid(mem, { storeHybrid });
      return;
    }
    await blobStore.externalizeProjectBlobs(mem, dataDir, writeJson);
    return originalWriteProjectBlob(mem);
  };

  async function hydrateProjectFromHybrid(project) {
    if (!project?.id) return project;

    const sqliteReady = typeof sqliteStore.isReady === 'function'
      ? sqliteStore.isReady()
      : sqliteStore.isEnabled();

    if (!isProjectHybrid(project)) {
      return project;
    }

    if (!sqliteReady) {
      if (ensureArray(project.requirements).length) {
        project.requirementsInDb = false;
        project.storageHybrid = false;
        return project;
      }
      const idx = await storeLayer.loadIndex();
      const entry = ensureArray(idx?.projects).find((item) => item.id === project.id);
      const repair = await repairProjectRequirements({
        project,
        indexEntry: entry,
        dataDir,
        storePath,
        sqliteStore,
        readJson,
        writeJson,
        storeLayer,
        blobStore,
      });
      if (repair.repaired) {
        console.log(`Requisitos recuperados para ${project.id}: ${repair.reason} (${repair.count})`);
      } else if ((entry?.requirementCount || 0) > 0) {
        console.error(`Requisitos em falta para ${project.id}: ${repair.reason}`);
      }
      return project;
    }

    let reqs = ensureArray(project.requirements);
    if (!reqs.length) {
      try {
        reqs = sqliteStore.loadRequirements(project.id);
      } catch {
        reqs = [];
      }
    }

    if (!reqs.length) {
      const idx = await storeLayer.loadIndex();
      const entry = ensureArray(idx?.projects).find((item) => item.id === project.id);
      const repair = await repairProjectRequirements({
        project,
        indexEntry: entry,
        dataDir,
        storePath,
        sqliteStore,
        readJson,
        writeJson,
        storeLayer,
        blobStore,
      });
      if (repair.repaired) {
        reqs = ensureArray(project.requirements);
        console.log(`Requisitos recuperados para ${project.id}: ${repair.reason} (${repair.count})`);
      }
    } else {
      project.requirements = reqs;
    }

    if (sqliteReady && reqs.length) {
      const dbCount = typeof sqliteStore.getRequirementCount === 'function'
        ? sqliteStore.getRequirementCount(project.id)
        : 0;
      const shouldSync = dbCount === 0
        || (typeof sqliteStore.requirementsMatchStore === 'function'
          && !sqliteStore.requirementsMatchStore(project.id, reqs));
      if (shouldSync) {
        sqliteStore.saveRequirements(project.id, reqs);
      }
    }

    project.storageHybrid = Boolean(sqliteReady && reqs.length);
    project.requirementsInDb = project.storageHybrid;
    return project;
  }

  function getProjectRepairActivity(projectId) {
    try {
      if (typeof sqliteStore.getRepairActivity === 'function') {
        return sqliteStore.getRepairActivity(projectId);
      }
    } catch {
      return [];
    }
    return [];
  }

  async function readStore(options = {}) {
    const store = await storeLayer.readStore(ensureStoreInitialized);
    if (isHybridStorage(store)) {
      store.users = sqliteStore.getUsers();
      if (options.includeActivity) {
        store.activity = sqliteStore.getActivity(options.activityLimit || 300);
      } else {
        store.activity = store.activity || [];
      }
      if (store._index) {
        store._index.users = [];
        store._index.activity = [];
        store._index.meta = store._index.meta || {};
        store._index.meta.usersInDb = true;
        store._index.meta.activityInDb = true;
      }
    }
    return store;
  }

  async function updateStore(mutator, options) {
    await storeLayer.updateStore(async (store) => {
      if (isHybridStorage(store)) {
        store.users = sqliteStore.getUsers();
        store.activity = sqliteStore.getActivity(300);
      }
      await mutator(store);
      if (isHybridStorage(store)) {
        sqliteStore.saveUsers(store.users);
        if (store._index) {
          store._index.users = [];
          store._index.activity = [];
          store._index.meta = store._index.meta || {};
          store._index.meta.usersInDb = true;
          store._index.meta.activityInDb = true;
        }
      }
    }, ensureStoreInitialized, options);
    projectPayload.clearSanitizeCache();
  }

  async function ensureProjectLoaded(projectId) {
    const project = await storeLayer.ensureProjectLoaded(projectId);
    if (!project) return null;

    if (project._normalizedVersion !== project.updatedAt) {
      Object.assign(project, normalizeOneProject(project));
      project._normalizedVersion = project.updatedAt;
    }
    await hydrateProjectFromHybrid(project);

    if (deliveryOs.ensureIdeaVisionFromDiscovery(project)) {
      project.updatedAt = new Date().toISOString();
      await persistProjectHybrid(project);
    }

    if (!project._blobsCompacted) {
      const externalized = await blobStore.externalizeProjectBlobs(project, dataDir, writeJson);
      if (externalized) {
        await persistProjectHybrid(project);
      }
      project._blobsCompacted = true;
    }
    return project;
  }

  /**
   * Lite project load for overview mode — skips SQLite requirement hydration and blob
   * compaction.  For hybrid projects the returned project will have an empty requirements
   * array; callers must NOT use project.requirements for count/display — use sqliteStore
   * counts instead.  Returned project is the shared in-memory instance, so if a full load
   * has already populated requirements they will still be present.
   */
  async function ensureProjectLoadedLite(projectId) {
    const project = await storeLayer.ensureProjectLoaded(projectId);
    if (!project) return null;
    if (project._normalizedVersion !== project.updatedAt) {
      Object.assign(project, normalizeOneProject(project));
      project._normalizedVersion = project.updatedAt;
    }
    // Skip hydrateProjectFromHybrid and blob compaction — that's the whole point.
    return project;
  }

  function appendActivity(store, entry) {
    const record = {
      id: `act_${crypto.randomUUID()}`,
      at: nowIso(),
      ...entry,
    };
    if (isHybridStorage(store)) {
      sqliteStore.appendActivity(record);
      store.activity = store.activity || [];
      store.activity.unshift(record);
      return;
    }
    store.activity.push(record);
  }

  function getSessionToken(req) {
    const auth = String(req.headers.authorization || '').trim();
    if (auth.startsWith('Bearer ')) {
      return auth.slice(7).trim();
    }
    return String(req.headers['x-session-token'] || '').trim() || null;
  }

  async function authMiddleware(req, res, next) {
    try {
      const token = getSessionToken(req);
      if (!token) {
        return res.status(401).json({ message: 'Nao autenticado.' });
      }

      const session = sessions.get(token);
      if (!session || session.expiresAt < Date.now()) {
        sessions.delete(token);
        return res.status(401).json({ message: 'Sessao expirada. Faça login novamente.' });
      }

      const store = await readStore();
      const user = store.users.find((entry) => entry.id === session.userId && entry.isActive !== false);
      if (!user) {
        sessions.delete(token);
        return res.status(401).json({ message: 'Utilizador nao encontrado.' });
      }

      session.expiresAt = Date.now() + SESSION_TTL_MS;
      req.auth = { token, user };
      return next();
    } catch (error) {
      return res.status(500).json({ message: `Erro de autenticacao: ${error.message}` });
    }
  }

  function requireRole(...roles) {
    return (req, res, next) => {
      if (!req.auth?.user) {
        return res.status(401).json({ message: 'Nao autenticado.' });
      }

      if (!roles.includes(req.auth.user.role)) {
        return res.status(403).json({ message: 'Sem permissao para esta operacao.' });
      }

      return next();
    };
  }

  function canAccessProject(user, project) {
    return projectAccess.canAccessProject(user, project);
  }

  const requireProjectEditor = projectAccess.createRequireProjectEditor();
  const requireSuperAdminProjectSettings = projectAccess.createRequireSuperAdminOnlyProjectSettings();
  const IDEA_PATCH_FIELDS = new Set(['originalIdeaText', 'ideaBriefMarkdown', 'vision', 'ideaConversation']);
  function requireProjectPatchAccess(req, res, next) {
    const fields = Object.keys(req.body || {});
    if (fields.length && fields.every((field) => IDEA_PATCH_FIELDS.has(field))) {
      return requireProjectEditor(req, res, next);
    }
    return requireSuperAdminProjectSettings(req, res, next);
  }

  function getUserName(store, userId) {
    const user = ensureArray(store.users).find((entry) => entry.id === userId);
    return user?.name || userId;
  }

  function auditedMutate(store, project, user, { action, summary, stageId, metadata, mutator }) {
    return projectAudit.auditAndMutate(project, {
      userId: user.id,
      userName: getUserName(store, user.id),
      action,
      summary,
      stageId: stageId || 'requirements',
      metadata: metadata || {},
      appendActivity,
      store,
      mutator,
    });
  }

  function canViewBudget(user) {
    if (!user) return false;
    if (user.role === 'super_admin') return true;
    return user.role === 'partner' && user.canViewBudget === true;
  }

  function sanitizeUser(user) {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      canViewBudget: canViewBudget(user),
      isActive: user.isActive !== false,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  function sanitizePhasesForViewer(phases) {
    return normalizePhases(phases);
  }

  function sanitizeProjectFull(project, viewer, options = {}) {
    const skipRequirements = options.skipRequirements === true;
    const requirements = skipRequirements ? [] : ensureArray(project.requirements);
    const requirementIdSet = skipRequirements ? null : buildRequirementIdSet(project.requirements);

    const sanitized = {
      id: project.id,
      name: project.name,
      clientName: project.clientName,
      description: project.description || '',
      status: project.status || 'active',
      proposalCode: project.proposalCode || '',
      subtitle: project.subtitle || 'Proposta Comercial e Tecnica',
      language: project.language || 'pt-PT',
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      members: ensureArray(project.members),
      summary: project.summary || defaultSummary(),
      assumptions: ensureArray(project.assumptions),
      risks: ensureArray(project.risks),
      integrations: ensureArray(project.integrations),
      technicalApproach: project.technicalApproach || defaultTechnicalApproach(),
      requirements: skipRequirements
        ? []
        : requirements.map((entry) => {
          const useFastPath = entry?.id && Array.isArray(entry.hierarchyLinks) && entry.vLevel !== undefined;
          const normalized = useFastPath ? entry : normalizeRequirementRecord(entry);
          const smartValidationErrors = getSmartRequirementValidationErrors(normalized);
          return {
            ...normalized,
            smartValidationErrors,
            smartIsValid: smartValidationErrors.length === 0,
          };
        }),
      clarificationQuestions: normalizeClarificationQuestions(project.clarificationQuestions || project.questions),
      phases: sanitizePhasesForViewer(project.phases),
      sourceText: project.sourceText || '',
      aiPrompt: project.aiPrompt || '',
      aiRawJson: project.aiRawJson || '',
      deliveryLevel: normalizeDeliveryLevel(project.deliveryLevel),
      featureFlags: {
        engineering_state_v1: engineeringState.featureEnabled(project),
      },
      engineeringSummary: {
        enabled: engineeringState.featureEnabled(project),
        revision: engineeringState.normalizeState(project.engineeringState).revision,
        pendingChangeSets: ensureArray(project.engineeringChangeSets)
          .filter((entry) => !['applied', 'rejected'].includes(entry?.status)).length,
      },
      stages: normalizeProjectStages(project.stages, normalizeDeliveryLevel(project.deliveryLevel)),
      artifacts: normalizeArtifacts(project.artifacts),
      traceLinks: skipRequirements
        ? []
        : normalizeTraceLinks(project.traceLinks, project.requirements, project.artifacts, project, requirementIdSet),
      approvals: normalizeApprovals(project.approvals),
      impactReports: normalizeImpactReports(project.impactReports),
      documents: phaseContent.normalizeProjectDocuments(project.documents).map((doc) => ({
        id: doc.id,
        title: doc.title,
        originalName: doc.originalName,
        storedName: doc.storedName,
        uploadedAt: doc.uploadedAt,
        uploadedBy: doc.uploadedBy,
        updatedAt: doc.updatedAt,
        contentType: doc.contentType,
        size: doc.size,
        hasExtractedText: Boolean(doc.extractedText || doc.contentMarkdown),
        hasContent: Boolean(doc.hasContent ?? doc.contentMarkdown ?? doc.extractedText),
        deliveryStageId: doc.deliveryStageId,
        docType: doc.docType,
        origin: doc.origin,
        diagramFormat: doc.diagramFormat,
        ...(doc.contentMarkdown !== undefined ? { contentMarkdown: doc.contentMarkdown } : {}),
        ...(doc.extractedText !== undefined ? { extractedText: doc.extractedText } : {}),
      })),
      generated: viewer?.role === 'super_admin'
        ? ensureArray(project.generated).map((entry) => ({
          ...entry,
          selectedModules: normalizeArchitectureModuleList(entry?.selectedModules),
        }))
        : [],
      meetingMinutes: normalizeMeetingMinutes(project.meetingMinutes),
      minutesPromptHistory: normalizeMinutesPromptHistory(project.minutesPromptHistory),
      ...deliveryOs.normalizeProjectV3Fields(project),
      ...deliveryOsPlatform.normalizePlatformFields(project),
      auditLog: projectAudit.normalizeAuditLog(project.auditLog),
    };

    sanitized.currency = project.currency || 'EUR';
    sanitized.commercialTerms = proposalGenerator.normalizeCommercialTermsNonPrice(
      project.commercialTerms || DEFAULT_COMMERCIAL_TERMS
    );

    if (viewer?.role !== 'super_admin') {
      sanitized.proposal = {};
    }

    return sanitized;
  }

  const sanitizeProject = projectPayload.wrapSanitizeProject(sanitizeProjectFull);

  function compressJsonMiddleware(req, res, next) {
    const origJson = res.json.bind(res);
    res.json = function jsonWithOptionalGzip(body) {
      const payload = JSON.stringify(body);
      if (payload.length > 32768 && req.headers['accept-encoding']?.includes('gzip')) {
        gzipAsync(payload)
          .then((buf) => {
            if (res.headersSent) return;
            res.setHeader('Content-Encoding', 'gzip');
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.send(buf);
          })
          .catch(() => {
            if (!res.headersSent) origJson(body);
          });
        return res;
      }
      return origJson(body);
    };
    next();
  }

  app.use('/api/projects', compressJsonMiddleware);

  async function loadProjectForUser(req, res, next) {
    const projectId = req.params.projectId;
    try {
      const project = await ensureProjectLoaded(projectId);
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

  app.get('/projects', (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.sendFile(path.join(platformDir, 'public', 'index.html'));
  });

  const serveProjectsApp = (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.sendFile(path.join(platformDir, 'public', 'index.html'));
  };
  app.get('/projects/:projectId/tasks', serveProjectsApp);
  app.get('/projects/:projectId/tasks/:taskId', serveProjectsApp);
  app.get('/projects/:projectId/tasks/requests/:requestId/plan', serveProjectsApp);

  app.get('/api/projects/version', async (req, res) => {
    const versionPath = path.join(platformDir, 'public', 'build-version.txt');
    let gitSha = '';
    try {
      gitSha = String(await fs.readFile(versionPath, 'utf8')).trim();
    } catch {
      gitSha = '';
    }
    return res.json({
      gitSha: gitSha || 'unknown',
      platform: 'projects',
    });
  });

  app.use('/projects/static', expressStaticSafe(platformDir));

  app.get('/api/projects/config', async (req, res) => {
    await ensureStore();
    return res.json({
      statusFlow: REQUIREMENT_STATUS_FLOW,
      types: REQUIREMENT_TYPE_META,
      architectureModules: ARCHITECTURE_MODULES,
      deliveryLevels: DELIVERY_LEVELS,
      deliveryStageFlow: DELIVERY_STAGE_FLOW,
      artifactTypes: ARTIFACT_TYPES,
      traceRelationshipTypes: TRACE_RELATIONSHIP_TYPES,
      questionStatusFlow: QUESTION_STATUS_FLOW,
      questionTargetFlow: QUESTION_TARGET_FLOW,
      questionCategoryFlow: QUESTION_CATEGORY_FLOW,
      moduleTags: deliveryOs.MODULE_TAGS,
      informationTypes: deliveryOs.INFORMATION_TYPES,
      agentTypes: deliveryOs.AGENT_TYPES,
      onionLayers: deliveryOs.ONION_LAYERS,
      stageFocus: deliveryOs.STAGE_FOCUS,
      stageNextHint: deliveryOs.STAGE_NEXT_HINT,
      stageOrder: deliveryOs.STAGE_ORDER,
      platformConcepts: deliveryOs.PLATFORM_CONCEPTS,
      stageConceptKeys: deliveryOs.STAGE_CONCEPT_KEYS,
      stageTabLinks: deliveryOs.STAGE_TAB_LINKS,
      tabStageAffinity: deliveryOs.TAB_STAGE_AFFINITY,
      meetingImpactScopes: deliveryOs.MEETING_IMPACT_SCOPES,
      traceNodeTypes: deliveryOs.TRACE_NODE_TYPES,
      agentModelProfiles: require('./lib/execution-plans').MODEL_PROFILES,
      agentRoleRouting: require('./lib/execution-plans').ROLE_MODEL_PROFILES,
      defaultAdminEmail: process.env.REQ_PLATFORM_SUPER_ADMIN_EMAIL || 'admin@yourlab.local',
      note: 'Se for primeiro acesso, use a password definida em REQ_PLATFORM_SUPER_ADMIN_PASSWORD ou change-me-now.',
      agentRuntime: {
        enabled: agentConnectionMode === 'remote_pull'
          ? Boolean(connectorStore?.activeConnector())
          : agentConnectionMode === 'disabled'
            ? false
            : Boolean(String(process.env.AGENT_RUNTIME_API_KEY || '').trim()),
        mode: agentConnectionMode,
        url: agentConnectionMode === 'local_push'
          ? String(process.env.AGENT_RUNTIME_URL || 'http://127.0.0.1:3847').replace(/\/$/, '')
          : '',
        connector: connectorStore?.activeConnector() || null,
        supportedAgentTypes: [
          'reverse_idea',
          'requirements_to_architecture',
          'roadmap_plan',
          'implementation_tasks',
        ],
      },
    });
  });

  app.post('/api/projects/auth/login', async (req, res) => {
    try {
      const email = String(req.body?.email || '').trim().toLowerCase();
      const password = String(req.body?.password || '');

      if (!email || !password) {
        return res.status(400).json({ message: 'Email e password sao obrigatorios.' });
      }

      const store = await readStore();
      const user = store.users.find((entry) => entry.email === email && entry.isActive !== false);

      if (!user || !verifyPassword(user.passwordHash, password)) {
        return res.status(401).json({ message: 'Credenciais invalidas.' });
      }

      const token = `sess_${crypto.randomUUID()}`;
      sessions.set(token, {
        userId: user.id,
        createdAt: Date.now(),
        expiresAt: Date.now() + SESSION_TTL_MS,
      });

      return res.json({
        token,
        user: sanitizeUser(user),
      });
    } catch (error) {
      return res.status(500).json({ message: `Erro no login: ${error.message}` });
    }
  });

  app.post('/api/projects/auth/logout', authMiddleware, async (req, res) => {
    sessions.delete(req.auth.token);
    return res.json({ message: 'Sessao terminada.' });
  });

  app.get('/api/projects/auth/me', authMiddleware, async (req, res) => {
    return res.json({
      user: sanitizeUser(req.auth.user),
    });
  });

  app.get('/api/projects/users', authMiddleware, requireRole('super_admin'), async (req, res) => {
    const store = await readStore();
    return res.json({ users: store.users.map(sanitizeUser) });
  });

  app.post('/api/projects/users', authMiddleware, requireRole('super_admin'), async (req, res) => {
    try {
      const name = String(req.body?.name || '').trim();
      const email = String(req.body?.email || '').trim().toLowerCase();
      const role = String(req.body?.role || '').trim();
      const password = String(req.body?.password || '').trim();
      const canViewBudgetFlag = req.body?.canViewBudget === true;

      if (!name || !email || !role || !password) {
        return res.status(400).json({ message: 'name, email, role e password sao obrigatorios.' });
      }

      if (!['client', 'partner'].includes(role)) {
        return res.status(400).json({ message: 'role deve ser client ou partner.' });
      }

      await updateStore(async (store) => {
        const exists = store.users.some((user) => user.email === email);
        if (exists) {
          throw new Error('Ja existe utilizador com este email.');
        }

        const created = {
          id: `usr_${crypto.randomUUID()}`,
          name,
          email,
          role,
          canViewBudget: role === 'partner' && canViewBudgetFlag,
          passwordHash: hashPassword(password),
          isActive: true,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        };

        store.users.push(created);
        appendActivity(store, {
          actorUserId: req.auth.user.id,
          action: 'user_created',
          details: { userId: created.id, email: created.email, role: created.role, canViewBudget: created.canViewBudget },
        });
      });

      const updated = await readStore();
      return res.json({ users: updated.users.map(sanitizeUser) });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.patch('/api/projects/users/:userId', authMiddleware, requireRole('super_admin'), async (req, res) => {
    try {
      const userId = req.params.userId;
      const body = req.body || {};
      const changedFields = [];

      await updateStore(async (store) => {
        const user = store.users.find((entry) => entry.id === userId);
        if (!user) {
          throw new Error('Utilizador nao encontrado.');
        }

        if (typeof body.name === 'string') {
          const name = body.name.trim();
          if (!name) throw new Error('O nome não pode ficar vazio.');
          if (name !== user.name) changedFields.push('name');
          user.name = name;
        }

        if (typeof body.email === 'string') {
          const email = body.email.trim().toLowerCase();
          if (!email || !email.includes('@')) throw new Error('Introduza um email válido.');
          const duplicate = store.users.some((entry) => entry.id !== userId && entry.email === email);
          if (duplicate) throw new Error('Já existe um utilizador com este email.');
          if (email !== user.email) changedFields.push('email');
          user.email = email;
        }

        if (typeof body.role === 'string') {
          const role = body.role.trim();
          if (!['super_admin', 'partner', 'client'].includes(role)) {
            throw new Error('Perfil inválido.');
          }
          if (user.id === req.auth.user.id && role !== 'super_admin') {
            throw new Error('Não pode remover o seu próprio perfil de superutilizador.');
          }
          if (role !== user.role) changedFields.push('role');
          user.role = role;
        }

        if (typeof body.password === 'string' && body.password.length) {
          if (body.password.length < 10) throw new Error('A nova senha deve ter pelo menos 10 caracteres.');
          user.passwordHash = hashPassword(body.password);
          changedFields.push('password');
        }

        if (typeof body.isActive === 'boolean') {
          if (user.id === req.auth.user.id && body.isActive === false) {
            throw new Error('Não pode desactivar a sua própria conta.');
          }
          if (body.isActive !== user.isActive) changedFields.push('isActive');
          user.isActive = body.isActive;
        }

        if (typeof body.canViewBudget === 'boolean') {
          const canViewBudget = user.role === 'partner' && body.canViewBudget;
          if (canViewBudget !== Boolean(user.canViewBudget)) changedFields.push('canViewBudget');
          user.canViewBudget = canViewBudget;
        } else if (user.role !== 'partner') {
          user.canViewBudget = false;
        }

        user.updatedAt = nowIso();

        appendActivity(store, {
          actorUserId: req.auth.user.id,
          action: 'user_updated',
          details: { userId: user.id, fields: changedFields },
        });
      });

      if (changedFields.some((field) => ['email', 'password', 'isActive'].includes(field))) {
        for (const [token, session] of sessions.entries()) {
          if (session.userId === userId && token !== req.auth.token) sessions.delete(token);
        }
      }

      const updated = await readStore();
      return res.json({ users: updated.users.map(sanitizeUser) });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.get('/api/projects/projects', authMiddleware, async (req, res) => {
    await ensureStoreInitialized();
    const idx = await storeLayer.loadIndex();
    const visible = ensureArray(idx.projects).filter((entry) => canAccessProject(req.auth.user, entry));
    return res.json({ projects: visible.map((entry) => projectPayload.buildProjectListItem(entry)) });
  });

  app.post('/api/projects/projects', authMiddleware, requireRole('super_admin'), async (req, res) => {
    try {
      const body = req.body || {};
      const name = String(body.name || '').trim();
      const clientName = String(body.clientName || '').trim();

      if (!name) {
        return res.status(400).json({ message: 'name e obrigatorio.' });
      }

      const newProject = {
        id: `prj_${crypto.randomUUID()}`,
        name,
        clientName,
        description: String(body.description || ''),
        status: 'active',
        proposalCode: String(body.proposalCode || ''),
        subtitle: String(body.subtitle || 'Proposta Comercial e Tecnica'),
        currency: String(body.currency || 'EUR'),
        language: String(body.language || 'pt-PT'),
        createdAt: nowIso(),
        updatedAt: nowIso(),
        createdBy: req.auth.user.id,
        members: [],
        summary: defaultSummary(),
        assumptions: [],
        risks: [],
        integrations: [],
        technicalApproach: defaultTechnicalApproach(),
        commercialTerms: { ...DEFAULT_COMMERCIAL_TERMS },
        requirements: [],
        clarificationQuestions: [],
        workItems: [],
        phases: proposalGenerator.defaultPlanPhases(),
        sourceText: '',
        aiPrompt: '',
        aiRawJson: '',
        deliveryLevel: normalizeDeliveryLevel(body.deliveryLevel),
        stages: normalizeProjectStages(body.stages, normalizeDeliveryLevel(body.deliveryLevel)),
        artifacts: [],
        traceLinks: [],
        approvals: [],
        impactReports: [],
        documents: [],
        generated: [],
        meetingMinutes: [],
        minutesPromptHistory: [],
        capabilities: [],
        requirementClusters: [],
        clientRequests: [],
        businessObjectives: [],
        promptRuns: [],
        agentJobs: [],
        humanReviews: [],
        executionPlans: [],
        versionSnapshots: [],
        alternativeResponses: [],
        informationEntries: [],
        nextDecision: '',
        originalIdeaText: String(body.originalIdeaText || ''),
        ideaBriefMarkdown: '',
        ideaConversation: [],
        vision: null,
        diagramArtifacts: [],
        diagramVersions: [],
        diagramReviews: [],
        diagramGenerationJobs: [],
        decisions: [],
        changeRequests: [],
        integrationMappings: [],
        projectVisits: {},
        gateFindings: [],
        auditLog: [],
      };

      await updateStore(async (store) => {
        store.projects.push(newProject);
        appendActivity(store, {
          actorUserId: req.auth.user.id,
          projectId: newProject.id,
          action: 'project_created',
          details: { name: newProject.name, clientName: newProject.clientName },
        });
      });

      const store = await readStore();
      const created = store.projects.find((entry) => entry.id === newProject.id);
      return res.json({ project: sanitizeProject(created, req.auth.user) });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.get('/api/projects/projects/:projectId', authMiddleware, async (req, res) => {
    const projectId = req.params.projectId;
    const view = textOr(req.query.view, 'workspace'); // 'overview' | 'workspace' | (default)
    const full = req.query.full === '1' || req.query.full === 'true';
    try {
      let project;
      if (view === 'overview' && !full) {
        project = await ensureProjectLoadedLite(projectId);
      } else {
        project = await ensureProjectLoaded(projectId);
      }
      if (!project) return res.status(404).json({ message: 'Projeto nao encontrado.' });
      if (!canAccessProject(req.auth.user, project)) {
        return res.status(403).json({ message: 'Sem permissao para este projeto.' });
      }

      // ETag encodes view so overview and workspace have separate cache entries
      const etag = `"${project.id}:${project.updatedAt || ''}:${view}"`;
      if (req.headers['if-none-match'] === etag) return res.status(304).end();
      res.setHeader('ETag', etag);

      if (full) {
        return res.json({ project: sanitizeProject(project, req.auth.user, { full: true }) });
      }

      if (view === 'overview') {
        // Fast COUNT from SQLite; falls back to in-memory requirements length
        let reqStats = null;
        if (sqliteStore && typeof sqliteStore.isEnabled === 'function' && sqliteStore.isEnabled()) {
          try { reqStats = sqliteStore.getRequirementStats(projectId); } catch { /* ignore */ }
        }
        if (!reqStats) {
          const n = ensureArray(project.requirements).length;
          reqStats = { total: n, stakeholder: 0, functional: 0, nonFunctional: 0, testCase: 0, links: 0 };
        }
        const base = sanitizeProject(project, req.auth.user, { skipRequirements: true });
        const overviewPayload = projectPayload.buildOverviewPayload(base, { requirementStats: reqStats });
        return res.json({ project: overviewPayload });
      }

      // Default / workspace: slim full payload (existing behaviour)
      return res.json({ project: sanitizeProject(project, req.auth.user) });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });

  /**
   * On-demand requirements endpoint.  Fetches requirements only when needed (V-map open,
   * requisitos tab, etc.) rather than on every project load.
   *
   * Query params:
   *   type          — filter by requirement type (stakeholder|functional|non_functional|test_case)
   *   module        — filter by module
   *   phase         — filter by phase
   *   deliveryStageId — filter by delivery stage
   *   q             — text search in id/title
   *   limit         — max items (default 2000)
   *   offset        — skip N items (default 0)
   */
  app.get('/api/projects/projects/:projectId/requirements', authMiddleware, async (req, res) => {
    const projectId = req.params.projectId;
    try {
      // Lite load — just for access check; avoids double SQLite hydration
      const project = await ensureProjectLoadedLite(projectId);
      if (!project) return res.status(404).json({ message: 'Projeto nao encontrado.' });
      if (!canAccessProject(req.auth.user, project)) {
        return res.status(403).json({ message: 'Sem permissao para este projeto.' });
      }

      let requirements;
      const sqliteReady = sqliteStore && typeof sqliteStore.isEnabled === 'function' && sqliteStore.isEnabled();
      if (sqliteReady) {
        // Use SQLite directly — loadRequirements returns full data JSON
        requirements = sqliteStore.loadRequirements(projectId);
      } else {
        // Fallback: full project load, then slice
        const full = await ensureProjectLoaded(projectId);
        requirements = ensureArray(full?.requirements);
      }

      // Apply optional filters
      const filterType = textOr(req.query.type);
      const filterModule = textOr(req.query.module);
      const filterPhase = textOr(req.query.phase);
      const filterStage = textOr(req.query.deliveryStageId);
      const q = textOr(req.query.q).toLowerCase();

      if (filterType) requirements = requirements.filter((r) => r.type === filterType);
      if (filterModule) requirements = requirements.filter((r) => r.module === filterModule || (r.moduleTags || []).includes(filterModule));
      if (filterPhase) requirements = requirements.filter((r) => r.phase === filterPhase);
      if (filterStage) requirements = requirements.filter((r) => r.deliveryStageId === filterStage);
      if (q) requirements = requirements.filter((r) =>
        (r.id || '').toLowerCase().includes(q)
        || (r.title || '').toLowerCase().includes(q)
        || (r.shall || '').toLowerCase().includes(q)
        || (r.need || '').toLowerCase().includes(q)
      );

      const total = requirements.length;
      const limit = Math.min(Number(req.query.limit) || 2000, 10000);
      const offset = Math.max(0, Number(req.query.offset) || 0);
      requirements = requirements.slice(offset, offset + limit);

      return res.json({ requirements, total, offset, limit });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.patch('/api/projects/projects/:projectId', authMiddleware, loadProjectForUser, requireProjectPatchAccess, async (req, res) => {
    try {
      const projectId = req.params.projectId;
      const patch = req.body || {};

      let requirementsPhaseRenamed = 0;
      let requirementsPhaseSynced = 0;
      let roadmapSynced = false;
      let roadmapSyncedCount = 0;

      await updateStore(async (store) => {
        const project = store.projects.find((entry) => entry.id === projectId);
        if (!project) {
          throw new Error('Projeto nao encontrado.');
        }

        const writableFields = [
          'name',
          'clientName',
          'description',
          'status',
          'proposalCode',
          'subtitle',
          'currency',
          'language',
          'summary',
          'assumptions',
          'risks',
          'integrations',
          'technicalApproach',
          'commercialTerms',
          'phases',
          'sourceText',
          'deliveryLevel',
          'stages',
          'originalIdeaText',
          'ideaBriefMarkdown',
          'vision',
          'ideaConversation',
        ];

        const previousPhases = patch.phases !== undefined
          ? ensureArray(project.phases).map((phase) => ({ ...phase }))
          : null;

        for (const field of writableFields) {
          if (patch[field] !== undefined && field !== 'phases') {
            project[field] = patch[field];
          }
        }
        project.originalIdeaText = String(project.originalIdeaText || '');
        project.ideaBriefMarkdown = String(project.ideaBriefMarkdown || '');
        project.vision = deliveryOs.normalizeVision(project.vision, project);
        project.ideaConversation = ensureArray(project.ideaConversation)
          .filter((turn) => turn && ['user', 'assistant'].includes(turn.role) && String(turn.content || '').trim())
          .map((turn) => ({
            role: turn.role,
            content: String(turn.content).trim(),
            timestamp: String(turn.timestamp || ''),
          }))
          .slice(-100);

        if (patch.phases !== undefined) {
          assertUniquePhaseNames(patch.phases);
          project.phases = normalizePhases(patch.phases);
          requirementsPhaseRenamed = cascadeRequirementPhaseRenames(project, previousPhases, project.phases);
          requirementsPhaseSynced = phaseSync.syncRequirementsToPlanPhases(project, { nowIso });
          const syncedRoadmap = roadmapSync.syncRoadmapFromPlanPhases(project);
          if (syncedRoadmap.changed) {
            project.roadmap = deliveryOs.normalizeRoadmap(syncedRoadmap.roadmap, project);
            roadmapSynced = true;
            roadmapSyncedCount = syncedRoadmap.planPhaseCount || 0;
          }
        }

        project.summary = normalizeSummary(project.summary);
        project.assumptions = normalizeStringArray(project.assumptions);
        project.risks = normalizeStringArray(project.risks);
        project.integrations = normalizeIntegrations(project.integrations);
        project.technicalApproach = normalizeTechnicalApproach(project.technicalApproach);
        project.commercialTerms = normalizeCommercialTerms(project.commercialTerms);
        if (patch.phases === undefined) {
          project.phases = normalizePhases(project.phases);
        }
        proposalGenerator.stripBudgetFromProject(project);
        project.deliveryLevel = normalizeDeliveryLevel(project.deliveryLevel);
        project.stages = normalizeProjectStages(project.stages, project.deliveryLevel);

        project.updatedAt = nowIso();

        appendActivity(store, {
          actorUserId: req.auth.user.id,
          projectId: project.id,
          action: 'project_updated',
          details: { fields: Object.keys(patch) },
        });
      });

      const store = await readStore();
      const updated = store.projects.find((entry) => entry.id === projectId);
      return res.json({
        project: sanitizeProject(updated, req.auth.user),
        requirementsPhaseRenamed: requirementsPhaseRenamed || 0,
        requirementsPhaseSynced: requirementsPhaseSynced || 0,
        roadmapSynced,
        roadmapSyncedCount,
      });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.post('/api/projects/projects/:projectId/idea-guidance', authMiddleware, loadProjectForUser, requireProjectEditor, async (req, res) => {
    return res.status(410).json({
      message: 'O guia de prompt manual foi descontinuado. Use o workflow Idea → Discovery baseado em Tasks.',
      replacement: { fromStageId: 'idea', toStageId: 'discovery', taskBased: true },
    });
  });

  app.post('/api/projects/projects/:projectId/phases/sync-requirements', authMiddleware, loadProjectForUser, requireProjectEditor, async (req, res) => {
    try {
      const projectId = req.params.projectId;
      let updated = 0;

      await updateStore(async (store) => {
        const project = store.projects.find((entry) => entry.id === projectId);
        if (!project) throw new Error('Projeto nao encontrado.');

        project.phases = normalizePhases(project.phases);
        updated = phaseSync.syncRequirementsToPlanPhases(project, { nowIso });
        if (updated) {
          project.updatedAt = nowIso();
          appendActivity(store, {
            actorUserId: req.auth.user.id,
            projectId,
            action: 'requirements_phases_synced',
            details: { count: updated },
          });
        }
      });

      const store = await readStore();
      const project = store.projects.find((entry) => entry.id === projectId);
      return res.json({
        project: sanitizeProject(project, req.auth.user),
        updated,
      });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.get('/api/projects/projects/:projectId/trace-map', authMiddleware, loadProjectForUser, async (req, res) => {
    const project = req.loadedProject;
    const requirements = ensureArray(project.requirements).map((entry) => normalizeRequirementRecord(entry));
    const artifacts = normalizeArtifacts(project.artifacts);
    const links = normalizeTraceLinks(project.traceLinks, requirements, artifacts, project);

    return res.json({
      nodes: [
        ...ensureArray(project.capabilities).map((cap) => ({
          id: cap.id,
          nodeType: 'capability',
          type: 'capability',
          title: cap.name || cap.title || cap.id,
          status: cap.status || 'draft',
        })),
        ...ensureArray(project.requirementClusters).map((clu) => ({
          id: clu.id,
          nodeType: 'cluster',
          type: 'cluster',
          title: clu.name || clu.title || clu.id,
          status: 'draft',
          capabilityId: clu.capabilityId,
        })),
        ...requirements.map((reqItem) => ({
          id: reqItem.id,
          nodeType: 'requirement',
          type: reqItem.type,
          title: reqItem.title,
          status: reqItem.status,
          module: normalizeModuleName(reqItem.module),
          parentId: reqItem.parentId || reqItem.stakeholderRequirementLink || reqItem.linkedFunctionalRequirement || '',
          vLevel: reqItem.vLevel,
          stakeholderRootId: reqHierarchy.getStakeholderAncestorId(reqItem, reqHierarchy.buildIdIndex(requirements)),
        })),
        ...artifacts.map((artifact) => ({
          id: artifact.id,
          nodeType: 'artifact',
          type: artifact.type,
          title: artifact.name,
          status: artifact.status,
          stageId: artifact.stageId,
        })),
        ...ensureArray(project.diagramArtifacts).map((diagram) => ({
          id: diagram.id,
          nodeType: 'diagram',
          type: diagram.type,
          title: diagram.title,
          status: diagram.status,
          module: diagram.module,
        })),
      ],
      links,
    });
  });

  app.post('/api/projects/projects/:projectId/artifacts', authMiddleware, loadProjectForUser, requireProjectEditor, async (req, res) => {
    try {
      const projectId = req.params.projectId;
      const payload = req.body || {};
      const artifactInput = {
        id: payload.id,
        type: payload.type,
        name: payload.name,
        description: payload.description,
        bodyMarkdown: payload.bodyMarkdown,
        status: payload.status,
        stageId: payload.stageId,
        version: payload.version,
        relatedRequirementIds: payload.relatedRequirementIds,
        metadata: payload.metadata,
        createdBy: req.auth.user.id,
      };
      const artifact = normalizeArtifactRecord(artifactInput);

      if (!artifact.name) {
        return res.status(400).json({ message: 'name e obrigatorio.' });
      }

      await updateStore(async (store) => {
        const project = store.projects.find((entry) => entry.id === projectId);
        if (!project) {
          throw new Error('Projeto nao encontrado.');
        }

        project.artifacts = normalizeArtifacts(project.artifacts);
        project.artifacts = project.artifacts.filter((entry) => entry.id !== artifact.id);
        project.artifacts.push(artifact);
        project.updatedAt = nowIso();

        appendActivity(store, {
          actorUserId: req.auth.user.id,
          projectId: project.id,
          action: 'project_artifact_upserted',
          details: { artifactId: artifact.id, type: artifact.type, stageId: artifact.stageId },
        });
      });

      const store = await readStore();
      const updated = store.projects.find((entry) => entry.id === projectId);
      return res.json({ artifact, project: sanitizeProject(updated, req.auth.user) });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.post('/api/projects/projects/:projectId/trace-links', authMiddleware, loadProjectForUser, requireProjectEditor, async (req, res) => {
    try {
      const projectId = req.params.projectId;
      const payload = req.body || {};

      await updateStore(async (store) => {
        const project = store.projects.find((entry) => entry.id === projectId);
        if (!project) {
          throw new Error('Projeto nao encontrado.');
        }

        const requirements = ensureArray(project.requirements).map((entry) => normalizeRequirementRecord(entry));
        const artifacts = normalizeArtifacts(project.artifacts);
        const traceLink = normalizeTraceLinkRecord({
          id: payload.id,
          sourceType: payload.sourceType,
          sourceId: payload.sourceId,
          targetType: payload.targetType,
          targetId: payload.targetId,
          relationshipType: payload.relationshipType,
          confidence: payload.confidence,
          validatedByHuman: payload.validatedByHuman,
          createdBy: req.auth.user.id,
        }, requirements, artifacts);

        if (!traceLink.sourceId || !traceLink.targetId) {
          throw new Error('sourceId e targetId sao obrigatorios.');
        }

        project.traceLinks = normalizeTraceLinks(project.traceLinks, requirements, artifacts, project);
        project.traceLinks = project.traceLinks.filter((entry) => entry.id !== traceLink.id);
        project.traceLinks.push(traceLink);
        project.updatedAt = nowIso();

        appendActivity(store, {
          actorUserId: req.auth.user.id,
          projectId: project.id,
          action: 'project_trace_link_upserted',
          details: {
            traceLinkId: traceLink.id,
            sourceType: traceLink.sourceType,
            sourceId: traceLink.sourceId,
            targetType: traceLink.targetType,
            targetId: traceLink.targetId,
            relationshipType: traceLink.relationshipType,
          },
        });
      });

      const store = await readStore();
      const updated = store.projects.find((entry) => entry.id === projectId);
      return res.json({ traceLinks: normalizeTraceLinks(updated.traceLinks, updated.requirements, updated.artifacts, updated) });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.post('/api/projects/projects/:projectId/impact-report', authMiddleware, loadProjectForUser, async (req, res) => {
    try {
      const projectId = req.params.projectId;
      const sourceType = textOr(req.body?.sourceType, 'requirement');
      const sourceId = textOr(req.body?.sourceId);
      const includeUpstream = req.body?.includeUpstream === true;

      if (!sourceId) {
        return res.status(400).json({ message: 'sourceId e obrigatorio.' });
      }

      let generatedReport = null;
      await updateStore(async (store) => {
        const project = store.projects.find((entry) => entry.id === projectId);
        if (!project) {
          throw new Error('Projeto nao encontrado.');
        }

        const requirements = ensureArray(project.requirements).map((entry) => normalizeRequirementRecord(entry));
        const artifacts = normalizeArtifacts(project.artifacts);
        const traceLinks = normalizeTraceLinks(project.traceLinks, requirements, artifacts, project);

        if (!hasTraceableNode(requirements, artifacts, sourceType, sourceId, project)) {
          throw new Error('sourceId nao corresponde a nenhum requisito/artefacto do projeto.');
        }

        const impacted = calculateTraceImpact(traceLinks, sourceType, sourceId, includeUpstream);
        generatedReport = normalizeImpactReportRecord({
          sourceType,
          sourceId,
          includeUpstream,
          impacted,
          generatedBy: req.auth.user.id,
          summary: `Impacto calculado para ${sourceType}:${sourceId}`,
        });

        project.impactReports = normalizeImpactReports(project.impactReports);
        project.impactReports.unshift(generatedReport);
        project.impactReports = project.impactReports.slice(0, 50);
        project.updatedAt = nowIso();

        appendActivity(store, {
          actorUserId: req.auth.user.id,
          projectId: project.id,
          action: 'project_impact_report_generated',
          details: {
            reportId: generatedReport.id,
            sourceType,
            sourceId,
            affectedCount: impacted.length,
          },
        });
      });

      return res.json({ report: generatedReport });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.post('/api/projects/projects/:projectId/members', authMiddleware, loadProjectForUser, requireSuperAdminProjectSettings, async (req, res) => {
    try {
      const projectId = req.params.projectId;
      const userId = String(req.body?.userId || '').trim();
      const role = String(req.body?.role || 'client').trim();

      if (!userId) {
        return res.status(400).json({ message: 'userId e obrigatorio.' });
      }

      if (!['client', 'partner'].includes(role)) {
        return res.status(400).json({ message: 'role deve ser client ou partner.' });
      }

      await updateStore(async (store) => {
        const project = store.projects.find((entry) => entry.id === projectId);
        if (!project) {
          throw new Error('Projeto nao encontrado.');
        }

        const user = store.users.find((entry) => entry.id === userId && entry.isActive !== false);
        if (!user) {
          throw new Error('Utilizador nao encontrado.');
        }

        project.members = ensureArray(project.members).filter((member) => member.userId !== userId);
        project.members.push({ userId, role, assignedAt: nowIso() });
        project.updatedAt = nowIso();

        appendActivity(store, {
          actorUserId: req.auth.user.id,
          projectId: project.id,
          action: 'project_member_assigned',
          details: { userId, role },
        });
      });

      const store = await readStore();
      const project = store.projects.find((entry) => entry.id === projectId);
      return res.json({ project: sanitizeProject(project, req.auth.user) });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.delete('/api/projects/projects/:projectId/members/:userId', authMiddleware, loadProjectForUser, requireSuperAdminProjectSettings, async (req, res) => {
    try {
      const projectId = req.params.projectId;
      const userId = req.params.userId;

      await updateStore(async (store) => {
        const project = store.projects.find((entry) => entry.id === projectId);
        if (!project) {
          throw new Error('Projeto nao encontrado.');
        }

        project.members = ensureArray(project.members).filter((member) => member.userId !== userId);
        project.updatedAt = nowIso();

        appendActivity(store, {
          actorUserId: req.auth.user.id,
          projectId: project.id,
          action: 'project_member_removed',
          details: { userId },
        });
      });

      const store = await readStore();
      const project = store.projects.find((entry) => entry.id === projectId);
      return res.json({ project: sanitizeProject(project, req.auth.user) });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.post('/api/projects/projects/:projectId/source-text', authMiddleware, loadProjectForUser, requireProjectEditor, async (req, res) => {
    try {
      const projectId = req.params.projectId;
      const sourceText = String(req.body?.sourceText || '');

      await updateStore(async (store) => {
        const project = store.projects.find((entry) => entry.id === projectId);
        if (!project) {
          throw new Error('Projeto nao encontrado.');
        }

        project.sourceText = sourceText;
        project.updatedAt = nowIso();

        appendActivity(store, {
          actorUserId: req.auth.user.id,
          projectId: project.id,
          action: 'project_source_text_updated',
          details: { length: sourceText.length },
        });
      });

      const store = await readStore();
      const project = store.projects.find((entry) => entry.id === projectId);
      return res.json({ project: sanitizeProject(project, req.auth.user) });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.post('/api/projects/projects/:projectId/meeting-minutes', authMiddleware, loadProjectForUser, requireProjectEditor, async (req, res) => {
    try {
      const projectId = req.params.projectId;
      const rawText = typeof req.body?.rawText === 'string' ? req.body.rawText : '';
      const title = String(req.body?.title || '').trim();
      const meetingDate = String(req.body?.meetingDate || '').trim();

      if (!rawText.trim()) {
        return res.status(400).json({ message: 'A ata da reunião (raw) não pode estar vazia.' });
      }

      await updateStore(async (store) => {
        const project = store.projects.find((entry) => entry.id === projectId);
        if (!project) {
          throw new Error('Projeto nao encontrado.');
        }

        project.meetingMinutes = normalizeMeetingMinutes(project.meetingMinutes);
        const record = normalizeMeetingMinuteRecord({
          id: `min_${crypto.randomUUID()}`,
          title: title || `Reunião com cliente ${meetingDate || nowIso().slice(0, 10)}`,
          meetingDate,
          rawText,
          impactScope: req.body?.impactScope,
          targetStageId: req.body?.targetStageId,
          createdAt: nowIso(),
          createdBy: req.auth.user.id,
        });
        project.meetingMinutes.unshift(record);
        project.meetingMinutes = project.meetingMinutes.slice(0, 300);
        project.updatedAt = nowIso();

        appendActivity(store, {
          actorUserId: req.auth.user.id,
          projectId: project.id,
          action: 'meeting_minutes_added',
          details: { minuteId: record.id, meetingDate: record.meetingDate, length: record.rawText.length },
        });
      });

      const store = await readStore();
      const project = store.projects.find((entry) => entry.id === projectId);
      return res.json({ project: sanitizeProject(project, req.auth.user) });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.post('/api/projects/projects/:projectId/meeting-minutes/propagation-plan', authMiddleware, loadProjectForUser, requireProjectEditor, async (req, res) => {
    try {
      const store = await readStore();
      const project = store.projects.find((entry) => entry.id === req.params.projectId);
      if (!project) return res.status(404).json({ message: 'Projeto nao encontrado.' });

      const requestedIds = normalizeStringArray(req.body?.minuteIds);
      const minutes = normalizeMeetingMinutes(project.meetingMinutes);
      const selected = requestedIds.length
        ? minutes.filter((entry) => requestedIds.includes(entry.id))
        : minutes.slice(0, 1);
      if (!selected.length) {
        return res.status(400).json({ message: 'Seleccione pelo menos uma ata.' });
      }

      const plan = deliveryOs.buildMinutePropagationPlan(selected);
      return res.json({ plan, minutes: selected });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.post('/api/projects/projects/:projectId/meeting-minutes/propagation-prompt', authMiddleware, loadProjectForUser, requireProjectEditor, async (req, res) => {
    try {
      const projectId = req.params.projectId;
      const requestedIds = normalizeStringArray(req.body?.minuteIds);
      const store = await readStore();
      const project = store.projects.find((entry) => entry.id === projectId);
      if (!project) return res.status(404).json({ message: 'Projeto nao encontrado.' });

      const minutes = normalizeMeetingMinutes(project.meetingMinutes);
      const selected = requestedIds.length
        ? minutes.filter((entry) => requestedIds.includes(entry.id))
        : minutes.slice(0, 1);
      if (!selected.length) {
        return res.status(400).json({ message: 'Seleccione pelo menos uma ata.' });
      }

      const plan = deliveryOs.buildMinutePropagationPlan(selected);
      const prompt = deliveryOs.buildMinutePropagationPrompt(project, selected, plan);
      let promptRun = null;

      await updateStore(async (mutableStore) => {
        const mutableProject = mutableStore.projects.find((entry) => entry.id === projectId);
        if (!mutableProject) throw new Error('Projeto nao encontrado.');

        promptRun = deliveryOs.normalizePromptRun({
          id: `prun_${crypto.randomUUID().slice(0, 12)}`,
          agentType: 'impact_regeneration',
          stageId: plan.primaryStageIds[0] || 'requirements',
          moduleTag: '',
          fullPrompt: prompt,
          status: 'awaiting_output',
          createdAt: nowIso(),
          createdBy: req.auth.user.id,
        });
        mutableProject.promptRuns = ensureArray(mutableProject.promptRuns);
        mutableProject.promptRuns.unshift(promptRun);
        mutableProject.updatedAt = nowIso();

        appendActivity(mutableStore, {
          actorUserId: req.auth.user.id,
          projectId,
          action: 'meeting_minute_propagation_prompt',
          details: { minuteIds: selected.map((m) => m.id), stages: plan.allAffectedStageIds },
        });
      });

      const updatedStore = await readStore();
      const updated = updatedStore.projects.find((entry) => entry.id === projectId);
      return res.json({
        prompt,
        plan,
        promptRun,
        project: sanitizeProject(updated, req.auth.user),
      });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  // Generate an AI prompt that classifies a single ata's impact across phases.
  app.post('/api/projects/projects/:projectId/meeting-minutes/:minuteId/classify-prompt', authMiddleware, loadProjectForUser, requireProjectEditor, async (req, res) => {
    try {
      const { projectId, minuteId } = req.params;
      const store = await readStore();
      const project = store.projects.find((entry) => entry.id === projectId);
      if (!project) return res.status(404).json({ message: 'Projeto nao encontrado.' });
      const minute = normalizeMeetingMinutes(project.meetingMinutes).find((m) => m.id === minuteId);
      if (!minute) return res.status(404).json({ message: 'Ata nao encontrada.' });

      const prompt = deliveryOs.buildMeetingClassificationPrompt(project, minute);
      return res.json({ prompt, minuteId });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  // Apply the AI classification output directly onto the ata (metadata only).
  app.post('/api/projects/projects/:projectId/meeting-minutes/:minuteId/classify', authMiddleware, loadProjectForUser, requireProjectEditor, async (req, res) => {
    try {
      const { projectId, minuteId } = req.params;
      const rawInput = String(req.body?.rawOutput || (req.body?.parsedOutput ? JSON.stringify(req.body.parsedOutput) : ''));
      const parsedFromRaw = deliveryOs.parseAgentJsonOutput(rawInput);
      const parsed = req.body?.parsedOutput || parsedFromRaw.parsed;
      if (rawInput && !parsed) {
        return res.status(400).json({ message: 'JSON inválido. Verifique a estrutura do output da IA.' });
      }
      if (!parsed) {
        return res.status(400).json({ message: 'Cole o output JSON da IA para classificar a ata.' });
      }

      await updateStore(async (mutableStore) => {
        const project = mutableStore.projects.find((entry) => entry.id === projectId);
        if (!project) throw new Error('Projeto nao encontrado.');
        project.meetingMinutes = normalizeMeetingMinutes(project.meetingMinutes);
        const minute = project.meetingMinutes.find((m) => m.id === minuteId);
        if (!minute) throw new Error('Ata nao encontrada.');

        deliveryOs.applyMeetingClassificationParsed(project, minute, parsed);
        project.meetingMinutes = normalizeMeetingMinutes(project.meetingMinutes);
        project.updatedAt = nowIso();

        appendActivity(mutableStore, {
          actorUserId: req.auth.user.id,
          projectId,
          action: 'meeting_minute_classified',
          details: { minuteId, stages: minute.impactedStageIds, requirements: minute.impactedRequirementIds.length },
        });
      });

      const updatedStore = await readStore();
      const updated = updatedStore.projects.find((entry) => entry.id === projectId);
      return res.json({ project: sanitizeProject(updated, req.auth.user) });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  // Lightweight implementation edits: confirm the stack, update per-task LLM size/status.
  app.post('/api/projects/projects/:projectId/implementation', authMiddleware, loadProjectForUser, requireProjectEditor, async (req, res) => {
    try {
      const { projectId } = req.params;
      const body = req.body || {};
      await updateStore(async (mutableStore) => {
        const project = mutableStore.projects.find((entry) => entry.id === projectId);
        if (!project) throw new Error('Projeto nao encontrado.');
        const impl = deliveryOs.normalizeImplementation(project.implementation, project);

        if (typeof body.confirmStack === 'boolean') {
          impl.stack.confirmed = body.confirmStack;
          impl.stack.confirmedAt = body.confirmStack ? nowIso() : '';
        }

        if (Array.isArray(body.taskUpdates)) {
          const byId = new Map(impl.tasks.map((t) => [t.id, t]));
          body.taskUpdates.forEach((u) => {
            const task = u && u.id ? byId.get(String(u.id)) : null;
            if (!task) return;
            if (u.llmSize) task.llmSize = String(u.llmSize);
            if (u.status) {
              task.status = String(u.status);
              if (task.status === 'done' && !task.executedAt) task.executedAt = nowIso();
            }
            if (typeof u.resultMarkdown === 'string') task.resultMarkdown = u.resultMarkdown;
            if (typeof u.executedModel === 'string') task.executedModel = u.executedModel;
            if (typeof u.executedAt === 'string') task.executedAt = u.executedAt;
            if (Array.isArray(u.outputLinks)) task.outputLinks = u.outputLinks;
            if (Array.isArray(u.subtaskDone)) {
              const doneSet = new Set(u.subtaskDone.map(String));
              const offSet = new Set(Array.isArray(u.subtaskUndone) ? u.subtaskUndone.map(String) : []);
              task.subtasks = ensureArray(task.subtasks).map((st) => {
                if (doneSet.has(st.id)) return { ...st, done: true };
                if (offSet.has(st.id)) return { ...st, done: false };
                return st;
              });
            }
          });
        }

        impl.updatedAt = nowIso();
        project.implementation = deliveryOs.normalizeImplementation(impl, project);
        project.updatedAt = nowIso();

        appendActivity(mutableStore, {
          actorUserId: req.auth.user.id,
          projectId,
          action: 'implementation_updated',
          details: {
            confirmStack: typeof body.confirmStack === 'boolean' ? body.confirmStack : undefined,
            taskUpdates: Array.isArray(body.taskUpdates) ? body.taskUpdates.length : 0,
          },
        });
      });

      const updatedStore = await readStore();
      const updated = updatedStore.projects.find((entry) => entry.id === projectId);
      return res.json({ project: sanitizeProject(updated, req.auth.user) });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.post('/api/projects/projects/:projectId/build-minutes-prompt', authMiddleware, loadProjectForUser, requireProjectEditor, async (req, res) => {
    try {
      const projectId = req.params.projectId;
      const objective = String(req.body?.objective || '').trim() || 'requirements_update';
      const extraInstructions = String(req.body?.extraInstructions || '').trim();
      const requestedMinuteIds = normalizeStringArray(req.body?.minuteIds);

      const store = await readStore();
      const project = store.projects.find((entry) => entry.id === projectId);
      if (!project) {
        return res.status(404).json({ message: 'Projeto nao encontrado.' });
      }

      const minutes = normalizeMeetingMinutes(project.meetingMinutes);
      if (!minutes.length) {
        return res.status(400).json({ message: 'Sem atas disponíveis para gerar prompt.' });
      }

      const selectedMinutes = requestedMinuteIds.length
        ? minutes.filter((entry) => requestedMinuteIds.includes(entry.id))
        : minutes.slice(0, 1);

      if (!selectedMinutes.length) {
        return res.status(400).json({ message: 'As atas selecionadas não foram encontradas.' });
      }

      const prompt = buildMinutesUpdatePrompt(project, selectedMinutes, objective, extraInstructions);
      const historyItem = normalizeMinutesPromptRecord({
        id: `mpr_${crypto.randomUUID()}`,
        objective,
        minuteIds: selectedMinutes.map((entry) => entry.id),
        prompt,
        createdAt: nowIso(),
        createdBy: req.auth.user.id,
      });

      await updateStore(async (mutableStore) => {
        const mutableProject = mutableStore.projects.find((entry) => entry.id === projectId);
        if (!mutableProject) {
          throw new Error('Projeto nao encontrado.');
        }

        mutableProject.minutesPromptHistory = normalizeMinutesPromptHistory(mutableProject.minutesPromptHistory);
        mutableProject.minutesPromptHistory.unshift(historyItem);
        mutableProject.minutesPromptHistory = mutableProject.minutesPromptHistory.slice(0, 200);
        mutableProject.updatedAt = nowIso();

        appendActivity(mutableStore, {
          actorUserId: req.auth.user.id,
          projectId,
          action: 'minutes_prompt_generated',
          details: { objective, minuteIds: historyItem.minuteIds },
        });
      });

      const updatedStore = await readStore();
      const updatedProject = updatedStore.projects.find((entry) => entry.id === projectId);
      return res.json({
        prompt,
        selectedMinutes: selectedMinutes.map((entry) => ({
          id: entry.id,
          title: entry.title,
          meetingDate: entry.meetingDate,
          createdAt: entry.createdAt,
        })),
        project: sanitizeProject(updatedProject, req.auth.user),
      });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.post('/api/projects/projects/:projectId/documents/upload', authMiddleware, loadProjectForUser, upload.single('document'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'Nenhum documento enviado.' });
      }

      const projectId = req.params.projectId;
      const cleanName = sanitizeFileName(req.file.originalname) || `doc_${Date.now()}.txt`;
      const projectFolder = path.join(uploadsDir, projectId);
      await fs.mkdir(projectFolder, { recursive: true });

      const storedName = `${Date.now()}_${cleanName}`;
      const absolutePath = path.join(projectFolder, storedName);
      await fs.writeFile(absolutePath, req.file.buffer);

      const extractedText = tryExtractText(req.file.originalname, req.file.buffer);

      await updateStore(async (store) => {
        const project = store.projects.find((entry) => entry.id === projectId);
        if (!project) {
          throw new Error('Projeto nao encontrado.');
        }

        const deliveryStageId = phaseContent.normalizeDeliveryStageId(req.body?.deliveryStageId, 'discovery');
        const document = phaseContent.normalizeProjectDocument({
          id: `doc_${crypto.randomUUID()}`,
          title: req.body?.title || req.file.originalname,
          originalName: req.file.originalname,
          storedName,
          absolutePath,
          uploadedAt: nowIso(),
          uploadedBy: req.auth.user.id,
          contentType: req.file.mimetype,
          size: req.file.size,
          extractedText: extractedText || '',
          deliveryStageId,
          docType: req.body?.docType || 'attachment',
          origin: 'upload',
        });

        project.documents = ensureArray(project.documents);
        project.documents.push(document);

        if (extractedText && !project.sourceText) {
          project.sourceText = extractedText;
        }

        project.updatedAt = nowIso();

        appendActivity(store, {
          actorUserId: req.auth.user.id,
          projectId: project.id,
          action: 'project_document_uploaded',
          details: {
            documentId: document.id,
            originalName: document.originalName,
            extractedTextLength: document.extractedText.length,
          },
        });
      });

      const store = await readStore();
      const project = store.projects.find((entry) => entry.id === projectId);
      return res.json({
        project: sanitizeProject(project, req.auth.user),
        note: extractedText
          ? 'Documento carregado com texto extraido.'
          : 'Documento carregado. Sem extracao automatica de texto para este formato.',
      });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.get('/api/projects/projects/:projectId/documents', authMiddleware, loadProjectForUser, async (req, res) => {
    const docs = ensureArray(req.loadedProject.documents).map((doc) => ({
      id: doc.id,
      originalName: doc.originalName,
      uploadedAt: doc.uploadedAt,
      uploadedBy: doc.uploadedBy,
      contentType: doc.contentType,
      size: doc.size,
      hasExtractedText: Boolean(doc.extractedText),
      downloadUrl: `/api/projects/projects/${req.loadedProject.id}/documents/${doc.id}/download`,
    }));

    return res.json({ documents: docs });
  });

  app.get('/api/projects/projects/:projectId/documents/:documentId', authMiddleware, loadProjectForUser, async (req, res) => {
    const document = ensureArray(req.loadedProject.documents).find((entry) => entry.id === req.params.documentId);
    if (!document) {
      return res.status(404).json({ message: 'Documento nao encontrado.' });
    }
    const hydrated = await blobStore.hydrateDocument(document, req.loadedProject.id, dataDir, readJson);
    const normalized = phaseContent.normalizeProjectDocument(hydrated);
    return res.json({
      document: {
        id: normalized.id,
        title: normalized.title,
        originalName: normalized.originalName,
        storedName: normalized.storedName,
        uploadedAt: normalized.uploadedAt,
        uploadedBy: normalized.uploadedBy,
        updatedAt: normalized.updatedAt,
        contentType: normalized.contentType,
        size: normalized.size,
        hasExtractedText: Boolean(normalized.extractedText || normalized.contentMarkdown),
        hasContent: Boolean(normalized.contentMarkdown || normalized.extractedText || normalized.hasContent),
        deliveryStageId: normalized.deliveryStageId,
        docType: normalized.docType,
        origin: normalized.origin,
        diagramFormat: normalized.diagramFormat,
        contentMarkdown: normalized.contentMarkdown || '',
        extractedText: normalized.extractedText || '',
      },
    });
  });

  app.get('/api/projects/projects/:projectId/documents/:documentId/download', authMiddleware, loadProjectForUser, async (req, res) => {
    const document = ensureArray(req.loadedProject.documents).find((entry) => entry.id === req.params.documentId);
    if (!document) {
      return res.status(404).json({ message: 'Documento nao encontrado.' });
    }

    if (document.absolutePath) {
      return res.download(document.absolutePath, document.originalName || document.title);
    }

    const content = document.contentMarkdown || document.extractedText || '';
    if (!content && document.blobStored) {
      const hydrated = await blobStore.hydrateDocument(document, req.loadedProject.id, dataDir, readJson);
      const body = hydrated.contentMarkdown || hydrated.extractedText || '';
      res.setHeader('Content-Type', document.contentType || 'text/plain');
      res.setHeader('Content-Disposition', `attachment; filename="${sanitizeFileName(document.title || document.originalName || 'documento.txt')}"`);
      return res.send(body);
    }

    res.setHeader('Content-Type', document.contentType || 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="${sanitizeFileName(document.title || document.originalName || 'documento.txt')}"`);
    return res.send(content);
  });

  app.post('/api/projects/projects/:projectId/documents/text', authMiddleware, loadProjectForUser, requireProjectEditor, async (req, res) => {
    try {
      const projectId = req.params.projectId;
      const body = req.body || {};
      const contentMarkdown = String(body.contentMarkdown || body.content || '').trim();
      if (!contentMarkdown) {
        return res.status(400).json({ message: 'Conteúdo do documento em falta.' });
      }

      await updateStore(async (store) => {
        const project = store.projects.find((entry) => entry.id === projectId);
        if (!project) throw new Error('Projeto nao encontrado.');

        const document = phaseContent.createPhaseDiagramDocument({
          title: body.title || 'Documento',
          contentMarkdown,
          diagramFormat: body.diagramFormat || '',
          deliveryStageId: body.deliveryStageId,
          origin: body.origin || 'manual',
          userId: req.auth.user.id,
        });
        if (body.docType) document.docType = body.docType;

        project.documents = ensureArray(project.documents);
        project.documents.push(document);
        project.updatedAt = nowIso();

        appendActivity(store, {
          actorUserId: req.auth.user.id,
          projectId,
          action: 'project_document_created',
          details: { documentId: document.id, docType: document.docType, deliveryStageId: document.deliveryStageId },
        });
      });

      const store = await readStore();
      const project = store.projects.find((entry) => entry.id === projectId);
      return res.json({ project: sanitizeProject(project, req.auth.user) });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.patch('/api/projects/projects/:projectId/documents/:documentId', authMiddleware, loadProjectForUser, requireProjectEditor, async (req, res) => {
    try {
      const projectId = req.params.projectId;
      const documentId = req.params.documentId;
      const patch = req.body || {};

      await updateStore(async (store) => {
        const project = store.projects.find((entry) => entry.id === projectId);
        if (!project) throw new Error('Projeto nao encontrado.');

        project.documents = ensureArray(project.documents);
        const document = project.documents.find((entry) => entry.id === documentId);
        if (!document) throw new Error('Documento nao encontrado.');

        const normalized = phaseContent.normalizeProjectDocument({
          ...document,
          ...patch,
          id: document.id,
          updatedAt: nowIso(),
        });
        Object.assign(document, normalized);
        project.updatedAt = nowIso();

        appendActivity(store, {
          actorUserId: req.auth.user.id,
          projectId,
          action: 'project_document_updated',
          details: { documentId: document.id },
        });
      });

      const store = await readStore();
      const project = store.projects.find((entry) => entry.id === projectId);
      return res.json({ project: sanitizeProject(project, req.auth.user) });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.get('/api/projects/projects/:projectId/prompt-runs/:runId', authMiddleware, loadProjectForUser, async (req, res) => {
    const runId = req.params.runId;
    const runs = ensureArray(req.loadedProject.promptRuns);
    const run = runs.find((entry) => entry.id === runId);
    if (!run) {
      return res.status(404).json({ message: 'Execução IA nao encontrada.' });
    }
    const hydrated = await blobStore.hydratePromptRun(run, req.loadedProject.id, dataDir, readJson);
    return res.json({
      promptRun: {
        id: hydrated.id,
        agentType: hydrated.agentType,
        stageId: hydrated.stageId,
        capabilityId: hydrated.capabilityId,
        moduleTag: hydrated.moduleTag,
        targetOutput: hydrated.targetOutput,
        summaryMarkdown: hydrated.summaryMarkdown,
        status: hydrated.status,
        version: hydrated.version,
        createdAt: hydrated.createdAt,
        createdBy: hydrated.createdBy,
        reviewedAt: hydrated.reviewedAt,
        reviewedBy: hydrated.reviewedBy,
        workItemId: hydrated.workItemId,
        agentRequestId: hydrated.agentRequestId,
        fullPrompt: hydrated.fullPrompt || '',
        rawOutput: hydrated.rawOutput || '',
        parsedOutput: hydrated.parsedOutput ?? null,
        contextPack: hydrated.contextPack || {},
        systemPrompt: hydrated.systemPrompt || '',
        stageInstruction: hydrated.stageInstruction || '',
        taskPrompt: hydrated.taskPrompt || '',
        outputSchema: hydrated.outputSchema || '',
      },
    });
  });

  app.patch('/api/projects/projects/:projectId/prompt-runs/:runId', authMiddleware, loadProjectForUser, requireProjectEditor, async (req, res) => {
    try {
      const projectId = req.params.projectId;
      const runId = req.params.runId;
      const patch = req.body || {};

      await updateStore(async (store) => {
        const project = store.projects.find((entry) => entry.id === projectId);
        if (!project) throw new Error('Projeto nao encontrado.');

        project.promptRuns = ensureArray(project.promptRuns);
        const run = project.promptRuns.find((entry) => entry.id === runId);
        if (!run) throw new Error('Execução IA nao encontrada.');

        if (patch.summaryMarkdown !== undefined) run.summaryMarkdown = String(patch.summaryMarkdown);
        if (patch.rawOutput !== undefined) run.rawOutput = String(patch.rawOutput);
        if (patch.parsedOutput !== undefined) run.parsedOutput = patch.parsedOutput;
        if (patch.status !== undefined) run.status = String(patch.status);
        if (run.blobStored && (patch.rawOutput !== undefined || patch.parsedOutput !== undefined)) {
          run.blobStored = false;
        }
        project.updatedAt = nowIso();

        appendActivity(store, {
          actorUserId: req.auth.user.id,
          projectId,
          action: 'prompt_run_updated',
          details: { runId },
        });
      });

      const store = await readStore();
      const project = store.projects.find((entry) => entry.id === projectId);
      return res.json({ project: sanitizeProject(project, req.auth.user) });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.patch('/api/projects/projects/:projectId/information-entries/:entryId', authMiddleware, loadProjectForUser, requireProjectEditor, async (req, res) => {
    try {
      const projectId = req.params.projectId;
      const entryId = req.params.entryId;
      const patch = req.body || {};

      await updateStore(async (store) => {
        const project = store.projects.find((entry) => entry.id === projectId);
        if (!project) throw new Error('Projeto nao encontrado.');

        project.informationEntries = ensureArray(project.informationEntries);
        const entry = project.informationEntries.find((item) => item.id === entryId);
        if (!entry) throw new Error('Entrada de informação nao encontrada.');

        if (patch.bodyMarkdown !== undefined) entry.bodyMarkdown = String(patch.bodyMarkdown);
        if (patch.type !== undefined) entry.type = String(patch.type);
        if (patch.status !== undefined) entry.status = String(patch.status);
        project.updatedAt = nowIso();

        appendActivity(store, {
          actorUserId: req.auth.user.id,
          projectId,
          action: 'information_entry_updated',
          details: { entryId },
        });
      });

      const store = await readStore();
      const project = store.projects.find((entry) => entry.id === projectId);
      return res.json({ project: sanitizeProject(project, req.auth.user) });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.post('/api/projects/projects/:projectId/build-prompt', authMiddleware, loadProjectForUser, requireProjectEditor, async (req, res) => {
    try {
      const projectId = req.params.projectId;
      const extraInstructions = String(req.body?.extraInstructions || '').trim();

      const store = await readStore();
      const project = store.projects.find((entry) => entry.id === projectId);

      if (!project) {
        return res.status(404).json({ message: 'Projeto nao encontrado.' });
      }

      const prompt = buildStructuredPrompt(project, extraInstructions);

      await updateStore(async (mutableStore) => {
        const mutableProject = mutableStore.projects.find((entry) => entry.id === projectId);
        mutableProject.aiPrompt = prompt;
        mutableProject.updatedAt = nowIso();

        appendActivity(mutableStore, {
          actorUserId: req.auth.user.id,
          projectId,
          action: 'ai_prompt_generated',
          details: { extraInstructionsLength: extraInstructions.length },
        });
      });

      return res.json({ prompt });
    } catch (error) {
      return res.status(500).json({ message: `Erro ao gerar prompt: ${error.message}` });
    }
  });

  app.post('/api/projects/projects/:projectId/import-ai', authMiddleware, loadProjectForUser, requireProjectEditor, async (req, res) => {
    try {
      const projectId = req.params.projectId;
      const raw = String(req.body?.aiJson || '').trim();

      if (!raw) {
        return res.status(400).json({ message: 'aiJson e obrigatorio.' });
      }

      const parsed = parseJsonLenient(extractJsonBlock(raw));
      if (!parsed || typeof parsed !== 'object') {
        return res.status(400).json({ message: 'JSON AI invalido.' });
      }

      await updateStore(async (store) => {
        const project = store.projects.find((entry) => entry.id === projectId);
        if (!project) {
          throw new Error('Projeto nao encontrado.');
        }

        const imported = normalizeAiPayloadIntoProject(project, parsed, req.auth.user.id);
        project.aiRawJson = JSON.stringify(parsed, null, 2);
        project.updatedAt = nowIso();

        appendActivity(store, {
          actorUserId: req.auth.user.id,
          projectId,
          action: 'ai_requirements_imported',
          details: imported,
        });
      });

      const store = await readStore();
      const project = store.projects.find((entry) => entry.id === projectId);
      return res.json({ project: sanitizeProject(project, req.auth.user) });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.post('/api/projects/projects/:projectId/import-requirement-changes', authMiddleware, loadProjectForUser, requireProjectEditor, async (req, res) => {
    try {
      const projectId = req.params.projectId;
      const raw = String(req.body?.changeJson || '').trim();

      if (!raw) {
        return res.status(400).json({ message: 'changeJson e obrigatorio.' });
      }

      const parsed = parseJsonLenient(extractJsonBlock(raw));
      if (!parsed || typeof parsed !== 'object') {
        return res.status(400).json({ message: 'JSON de alteracoes invalido.' });
      }

      let result = null;
      await updateStore(async (store) => {
        const project = store.projects.find((entry) => entry.id === projectId);
        if (!project) {
          throw new Error('Projeto nao encontrado.');
        }

        result = applyRequirementChangeSet(project, parsed, req.auth.user.id);
        project.aiRawJson = JSON.stringify(parsed, null, 2);
        project.updatedAt = nowIso();

        appendActivity(store, {
          actorUserId: req.auth.user.id,
          projectId,
          action: 'requirement_change_set_imported',
          details: result,
        });
      });

      const store = await readStore();
      const project = store.projects.find((entry) => entry.id === projectId);
      return res.json({ project: sanitizeProject(project, req.auth.user), result });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.post('/api/projects/projects/:projectId/requirements', authMiddleware, loadProjectForUser, requireProjectEditor, async (req, res) => {
    try {
      const projectId = req.params.projectId;
      const type = normalizeRequirementType(req.body?.type);
      if (!type) {
        return res.status(400).json({ message: 'type invalido.' });
      }

      await updateStore(async (store) => {
        const project = store.projects.find((entry) => entry.id === projectId);
        if (!project) {
          throw new Error('Projeto nao encontrado.');
        }

        project.requirements = ensureArray(project.requirements);
        const reqId = generateRequirementId(project.requirements, type);
        const requirement = normalizeRequirementRecord({
          ...req.body,
          id: reqId,
          type,
          title: String(req.body?.title || '').trim() || `${REQUIREMENT_TYPE_META[type].label} sem titulo`,
          createdAt: nowIso(),
          updatedAt: nowIso(),
          updatedBy: req.auth.user.id,
        });

        const smartErrors = getSmartRequirementValidationErrors(requirement);
        if (requiresSmartValidity(requirement.status) && smartErrors.length) {
          throw new Error(`Requisito funcional incompleto para status ${requirement.status}. Campos em falta: ${smartErrors.join(', ')}`);
        }

        auditedMutate(store, project, req.auth.user, {
          action: 'requirement_created',
          summary: `Requisito criado: ${reqId}`,
          metadata: { requirementId: reqId, type },
          mutator: () => {
            project.requirements.push(requirement);
            project.updatedAt = nowIso();
          },
        });
      });

      const store = await readStore();
      const project = store.projects.find((entry) => entry.id === projectId);
      return res.json({ project: sanitizeProject(project, req.auth.user) });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.patch('/api/projects/projects/:projectId/requirements/batch', authMiddleware, loadProjectForUser, requireProjectEditor, async (req, res) => {
    try {
      const projectId = req.params.projectId;
      const requirementIds = ensureArray(req.body?.requirementIds).map(normalizeRequirementIdToken).filter(Boolean);
      const changes = req.body?.changes && typeof req.body.changes === 'object' ? req.body.changes : req.body;
      if (!requirementIds.length) {
        return res.status(400).json({ message: 'requirementIds e obrigatorio.' });
      }

      let updated = 0;
      await updateStore(async (store) => {
        const project = store.projects.find((entry) => entry.id === projectId);
        if (!project) throw new Error('Projeto nao encontrado.');

        project.requirements = ensureArray(project.requirements);
        const allowed = new Set(requirementIds);
        for (const requirement of project.requirements) {
          if (!allowed.has(requirement.id)) continue;
          const patch = { ...changes };
          delete patch.requirementIds;
          const normalized = normalizeRequirementRecord({
            ...requirement,
            ...patch,
            id: requirement.id,
            type: requirement.type,
            updatedAt: nowIso(),
            updatedBy: req.auth.user.id,
          });
          Object.assign(requirement, normalized);
          updated += 1;
        }
        if (!updated) throw new Error('Nenhum requisito encontrado para actualizar.');
        project.updatedAt = nowIso();
        appendActivity(store, {
          actorUserId: req.auth.user.id,
          projectId,
          action: 'requirements_batch_updated',
          details: { count: updated, fields: Object.keys(changes || {}) },
        });
      });

      const store = await readStore();
      const project = store.projects.find((entry) => entry.id === projectId);
      return res.json({ project: sanitizeProject(project, req.auth.user), updated });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.patch('/api/projects/projects/:projectId/requirements/:requirementId', authMiddleware, loadProjectForUser, requireProjectEditor, async (req, res) => {
    try {
      const projectId = req.params.projectId;
      const requirementId = req.params.requirementId;

      await updateStore(async (store) => {
        const project = store.projects.find((entry) => entry.id === projectId);
        if (!project) {
          throw new Error('Projeto nao encontrado.');
        }

        project.requirements = ensureArray(project.requirements);
        const requirement = project.requirements.find((entry) => entry.id === requirementId);
        if (!requirement) {
          throw new Error('Requisito nao encontrado.');
        }

        const patch = req.body || {};
        const prevModule = requirement.module;
        const prevPhase = requirement.phase;
        const normalized = normalizeRequirementRecord({
          ...requirement,
          ...patch,
          id: requirement.id,
          type: requirement.type,
          updatedAt: nowIso(),
          updatedBy: req.auth.user.id,
        });

        const smartErrors = getSmartRequirementValidationErrors(normalized);
        if (requiresSmartValidity(normalized.status) && smartErrors.length) {
          throw new Error(`Requisito funcional incompleto para status ${normalized.status}. Campos em falta: ${smartErrors.join(', ')}`);
        }

        if (patch.module !== undefined || patch.phase !== undefined) {
          const movedModule = normalizeModuleName(normalized.module) !== normalizeModuleName(prevModule);
          const movedPhase = textOr(normalized.phase, 'Backlog') !== textOr(prevPhase, 'Backlog');
          if (movedModule || movedPhase) {
            normalized.movementHistory = ensureArray(requirement.movementHistory);
            normalized.movementHistory.unshift({
              at: nowIso(),
              by: req.auth.user.id,
              from: { module: prevModule, phase: prevPhase },
              to: { module: normalized.module, phase: normalized.phase },
            });
            normalized.movementHistory = normalized.movementHistory.slice(0, 50);
          }
        }

        auditedMutate(store, project, req.auth.user, {
          action: 'requirement_updated',
          summary: `Requisito actualizado: ${requirementId}`,
          metadata: { requirementId, module: normalized.module, phase: normalized.phase },
          mutator: () => {
            Object.assign(requirement, normalized);
            project.updatedAt = nowIso();
          },
        });
      });

      const store = await readStore();
      const project = store.projects.find((entry) => entry.id === projectId);
      return res.json({ project: sanitizeProject(project, req.auth.user) });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.get('/api/projects/projects/:projectId/requirements/hierarchy', authMiddleware, async (req, res) => {
    const projectId = req.params.projectId;
    const focusStakeholderId = textOr(req.query?.focusStakeholderId);
    const focusRequirementId = textOr(req.query?.focusRequirementId);
    const summaryOnly = req.query.summary === '1' || req.query.summary === 'true';
    const includeRevert = req.query.includeRevert === '1' || req.query.includeRevert === 'true';

    try {
      let project = await ensureProjectLoadedLite(projectId);
      if (!project) {
        return res.status(404).json({ message: 'Projeto nao encontrado.' });
      }
      if (!canAccessProject(req.auth.user, project)) {
        return res.status(403).json({ message: 'Sem permissao para este projeto.' });
      }

      await attachProjectRequirements(project);

      if (summaryOnly) {
        const repairActivity = includeRevert ? getProjectRepairActivity(project.id) : [];
        return res.json(reqHierarchy.buildHierarchySummary(project, {
          includeRevertable: includeRevert,
          activityLog: repairActivity,
        }));
      }

      const tree = reqHierarchy.buildHierarchyTree(project, { focusStakeholderId, focusRequirementId });
      if (includeRevert) {
        tree.revertableRepairs = reqHierarchy.getRevertableStakeholderRepairs(
          project,
          getProjectRepairActivity(project.id),
        );
      } else {
        tree.revertableRepairs = { count: 0, stakeholderIds: [] };
      }
      return res.json(tree);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.post('/api/projects/projects/:projectId/requirements/hierarchy/repair', authMiddleware, loadProjectForUser, requireProjectEditor, async (req, res) => {
    try {
      const projectId = req.params.projectId;
      const selections = ensureArray(req.body?.forRequirementIds);

      let repairUndo = null;
      await updateStore(async (store) => {
        const project = store.projects.find((entry) => entry.id === projectId);
        if (!project) throw new Error('Projeto nao encontrado.');

        const { requirements, created, repaired, undo } = reqHierarchy.repairHierarchyOrphans(project, selections);
        repairUndo = undo;
        project.requirements = requirements.map((entry) => normalizeRequirementRecord(entry));
        project.updatedAt = nowIso();

        appendActivity(store, {
          actorUserId: req.auth.user.id,
          projectId,
          action: 'requirement_hierarchy_repaired',
          details: { created, repaired, undo },
        });
      });

      const store = await readStore();
      const project = store.projects.find((entry) => entry.id === projectId);
      return res.json({ project: sanitizeProject(project, req.auth.user) });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.post('/api/projects/projects/:projectId/requirements/hierarchy/repair/revert', authMiddleware, loadProjectForUser, requireProjectEditor, async (req, res) => {
    try {
      const projectId = req.params.projectId;
      const stakeholderIds = ensureArray(req.body?.stakeholderIds);

      await updateStore(async (store) => {
        const project = store.projects.find((entry) => entry.id === projectId);
        if (!project) throw new Error('Projeto nao encontrado.');

        const { requirements, removed, unlinked } = reqHierarchy.revertStakeholderRepairs(project, {
          stakeholderIds,
          activity: store.activity,
        });
        if (!removed.length) {
          throw new Error('Não existem atribuições automáticas STK para reverter.');
        }

        project.requirements = requirements.map((entry) => normalizeRequirementRecord(entry));
        project.updatedAt = nowIso();

        appendActivity(store, {
          actorUserId: req.auth.user.id,
          projectId,
          action: 'requirement_hierarchy_repair_reverted',
          details: { removed, unlinked },
        });
      });

      const store = await readStore();
      const project = store.projects.find((entry) => entry.id === projectId);
      return res.json({ project: sanitizeProject(project, req.auth.user) });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.post('/api/projects/projects/:projectId/requirements/hierarchy/drop', authMiddleware, loadProjectForUser, requireProjectEditor, async (req, res) => {
    try {
      const projectId = req.params.projectId;
      const body = req.body || {};
      let dropResult = null;

      await updateStore(async (store) => {
        const project = store.projects.find((entry) => entry.id === projectId);
        if (!project) throw new Error('Projeto nao encontrado.');

        dropResult = reqHierarchy.applyHierarchyDrop(project, body.requirementId, {
          zoneType: body.zoneType,
          targetRequirementId: body.targetRequirementId,
          focusStakeholderId: body.focusStakeholderId,
        });

        project.requirements = dropResult.requirements.map((entry) => normalizeRequirementRecord(entry));
        project.updatedAt = nowIso();

        appendActivity(store, {
          actorUserId: req.auth.user.id,
          projectId,
          action: 'requirement_hierarchy_dropped',
          details: {
            requirementId: body.requirementId,
            zoneType: body.zoneType,
            targetRequirementId: body.targetRequirementId || '',
            focusStakeholderId: body.focusStakeholderId || '',
            createdStakeholderId: dropResult.createdStakeholderId || '',
          },
        });
      });

      const store = await readStore();
      const project = store.projects.find((entry) => entry.id === projectId);
      return res.json({ project: sanitizeProject(project, req.auth.user), ...dropResult });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.post('/api/projects/projects/:projectId/requirements/hierarchy/create', authMiddleware, loadProjectForUser, requireProjectEditor, async (req, res) => {
    try {
      const projectId = req.params.projectId;
      const body = req.body || {};
      let created = null;

      await updateStore(async (store) => {
        const project = store.projects.find((entry) => entry.id === projectId);
        if (!project) throw new Error('Projeto nao encontrado.');

        const result = reqHierarchy.createRequirementInLayer(project, {
          layerType: body.layerType,
          focusStakeholderId: body.focusStakeholderId,
          title: body.title,
          targetSlot: body.targetSlot,
        });
        project.requirements = result.requirements.map((entry) => normalizeRequirementRecord({
          ...entry,
          updatedBy: req.auth.user.id,
        }));
        created = result.requirement;
        project.updatedAt = nowIso();

        appendActivity(store, {
          actorUserId: req.auth.user.id,
          projectId,
          action: 'requirement_hierarchy_created',
          details: { requirementId: created.id, layerType: created.type },
        });
      });

      const store = await readStore();
      const project = store.projects.find((entry) => entry.id === projectId);
      return res.json({ project: sanitizeProject(project, req.auth.user), requirement: created });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.post('/api/projects/projects/:projectId/requirements/:requirementId/renumber', authMiddleware, loadProjectForUser, requireProjectEditor, async (req, res) => {
    try {
      const projectId = req.params.projectId;
      const requirementId = req.params.requirementId;
      const targetSlot = Number(req.body?.number ?? req.body?.slot ?? req.body?.targetSlot);
      if (!Number.isFinite(targetSlot) || targetSlot < 1) {
        return res.status(400).json({ message: 'number/slot invalido (>= 1).' });
      }

      let changedId = requirementId;
      await updateStore(async (store) => {
        const project = store.projects.find((entry) => entry.id === projectId);
        if (!project) throw new Error('Projeto nao encontrado.');

        const result = reqHierarchy.renumberRequirementInProject(project, requirementId, targetSlot);
        project.requirements = result.requirements.map((entry) => normalizeRequirementRecord(entry));
        changedId = result.changedId;
        project.updatedAt = nowIso();

        appendActivity(store, {
          actorUserId: req.auth.user.id,
          projectId,
          action: 'requirement_renumbered',
          details: { from: requirementId, to: changedId, slot: targetSlot, idMap: Object.fromEntries(result.idMap) },
        });
      });

      const store = await readStore();
      const project = store.projects.find((entry) => entry.id === projectId);
      return res.json({ project: sanitizeProject(project, req.auth.user), changedId });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.post('/api/projects/projects/:projectId/requirements/:requirementId/hierarchy/unlink', authMiddleware, loadProjectForUser, requireProjectEditor, async (req, res) => {
    try {
      const projectId = req.params.projectId;
      const requirementId = req.params.requirementId;

      await updateStore(async (store) => {
        const project = store.projects.find((entry) => entry.id === projectId);
        if (!project) throw new Error('Projeto nao encontrado.');

        project.requirements = ensureArray(project.requirements);
        const idx = project.requirements.findIndex((entry) => entry.id === requirementId);
        if (idx < 0) throw new Error('Requisito nao encontrado.');

        const unlinked = reqHierarchy.unlinkRequirementFromHierarchy(project.requirements[idx], project);
        project.requirements[idx] = normalizeRequirementRecord({
          ...unlinked,
          updatedAt: nowIso(),
          updatedBy: req.auth.user.id,
        });
        project.updatedAt = nowIso();

        appendActivity(store, {
          actorUserId: req.auth.user.id,
          projectId,
          action: 'requirement_hierarchy_unlinked',
          details: { requirementId },
        });
      });

      const store = await readStore();
      const project = store.projects.find((entry) => entry.id === projectId);
      return res.json({ project: sanitizeProject(project, req.auth.user) });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.patch('/api/projects/projects/:projectId/requirements/:requirementId/hierarchy', authMiddleware, loadProjectForUser, requireProjectEditor, async (req, res) => {
    try {
      const projectId = req.params.projectId;
      const requirementId = req.params.requirementId;
      const patch = req.body || {};

      await updateStore(async (store) => {
        const project = store.projects.find((entry) => entry.id === projectId);
        if (!project) throw new Error('Projeto nao encontrado.');

        project.requirements = ensureArray(project.requirements);
        const requirement = project.requirements.find((entry) => entry.id === requirementId);
        if (!requirement) throw new Error('Requisito nao encontrado.');

        let moved;
        if (patch.unlink || patch.parentId === null) {
          moved = reqHierarchy.unlinkRequirementFromHierarchy(requirement, project);
        } else {
          moved = reqHierarchy.applyHierarchyMove(requirement, patch, project);
        }
        Object.assign(requirement, normalizeRequirementRecord({
          ...requirement,
          ...moved,
          id: requirement.id,
          updatedAt: nowIso(),
          updatedBy: req.auth.user.id,
        }));

        project.updatedAt = nowIso();
        appendActivity(store, {
          actorUserId: req.auth.user.id,
          projectId,
          action: 'requirement_hierarchy_moved',
          details: {
            requirementId,
            type: requirement.type,
            parentId: requirement.parentId || requirement.stakeholderRequirementLink || requirement.linkedFunctionalRequirement,
          },
        });
      });

      const store = await readStore();
      const project = store.projects.find((entry) => entry.id === projectId);
      return res.json({ project: sanitizeProject(project, req.auth.user) });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.delete('/api/projects/projects/:projectId/requirements/:requirementId', authMiddleware, loadProjectForUser, requireProjectEditor, async (req, res) => {
    try {
      const projectId = req.params.projectId;
      const requirementId = req.params.requirementId;

      await updateStore(async (store) => {
        const project = store.projects.find((entry) => entry.id === projectId);
        if (!project) {
          throw new Error('Projeto nao encontrado.');
        }

        const before = ensureArray(project.requirements).length;
        project.requirements = ensureArray(project.requirements).filter((entry) => entry.id !== requirementId);

        if (project.requirements.length === before) {
          throw new Error('Requisito nao encontrado.');
        }

        project.requirements = project.requirements.map((entry) => {
          const normalized = normalizeRequirementRecord(entry);
          normalized.relatedRequirementIds = normalizeRequirementIdList(normalized.relatedRequirementIds).filter((id) => id !== requirementId);
          if (normalized.linkedFunctionalRequirement === requirementId) {
            normalized.linkedFunctionalRequirement = '';
          }
          if (normalized.stakeholderRequirementLink === requirementId) {
            normalized.stakeholderRequirementLink = '';
          }
          normalized.updatedAt = nowIso();
          normalized.updatedBy = req.auth.user.id;
          return normalized;
        });

        const { removeRequirementFromDiagrams } = require('./lib/diagram-traceability');
        require('./lib/diagrams').normalizeProjectDiagramFields(project);
        removeRequirementFromDiagrams(project, requirementId);

        project.updatedAt = nowIso();

        appendActivity(store, {
          actorUserId: req.auth.user.id,
          projectId,
          action: 'requirement_deleted',
          details: { requirementId },
        });
      });

      const store = await readStore();
      const project = store.projects.find((entry) => entry.id === projectId);
      return res.json({ project: sanitizeProject(project, req.auth.user) });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  // Clear ALL requirements (and the structures derived from them) so the user
  // can restart the requirements process from scratch.
  app.delete('/api/projects/projects/:projectId/requirements', authMiddleware, loadProjectForUser, requireProjectEditor, async (req, res) => {
    try {
      const projectId = req.params.projectId;
      let removedCount = 0;
      await updateStore(async (store) => {
        const project = store.projects.find((entry) => entry.id === projectId);
        if (!project) throw new Error('Projeto nao encontrado.');

        removedCount = ensureArray(project.requirements).length;
        project.requirements = [];

        // Drop requirement references held by capabilities and clusters.
        project.capabilities = ensureArray(project.capabilities).map((c) => ({ ...c, requirementIds: [] }));
        project.requirementClusters = ensureArray(project.requirementClusters).map((c) => ({ ...c, requirementIds: [] }));

        // Drop requirement links from diagrams.
        project.diagramArtifacts = ensureArray(project.diagramArtifacts).map((d) => ({ ...d, linkedRequirementIds: [] }));

        // Drop requirement links carried by roadmap / implementation.
        if (project.roadmap && Array.isArray(project.roadmap.phases)) {
          project.roadmap.phases = project.roadmap.phases.map((p) => ({ ...p, requirementIds: [] }));
        }
        if (project.implementation) {
          if (Array.isArray(project.implementation.tasks)) {
            project.implementation.tasks = project.implementation.tasks.map((t) => ({ ...t, requirementIds: [] }));
          }
          if (project.implementation.stack && Array.isArray(project.implementation.stack.modules)) {
            project.implementation.stack.modules = project.implementation.stack.modules.map((m) => ({ ...m, requirementIds: [] }));
          }
        }

        // Drop requirement-scoped trace links.
        project.traceLinks = ensureArray(project.traceLinks).filter((l) => l?.fromType !== 'requirement' && l?.toType !== 'requirement');

        project.updatedAt = nowIso();
        appendActivity(store, {
          actorUserId: req.auth.user.id,
          projectId,
          action: 'requirements_cleared',
          details: { removedCount },
        });
      });

      const store = await readStore();
      const project = store.projects.find((entry) => entry.id === projectId);
      return res.json({ project: sanitizeProject(project, req.auth.user), removedCount });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.post('/api/projects/projects/:projectId/questions', authMiddleware, loadProjectForUser, async (req, res) => {
    try {
      const projectId = req.params.projectId;
      const questionText = String(req.body?.question || '').trim();

      if (!questionText) {
        return res.status(400).json({ message: 'A pergunta não pode estar vazia.' });
      }

      await updateStore(async (store) => {
        const project = store.projects.find((entry) => entry.id === projectId);
        if (!project) {
          throw new Error('Projeto nao encontrado.');
        }

        project.clarificationQuestions = normalizeClarificationQuestions(project.clarificationQuestions);
        const record = normalizeClarificationQuestionRecord({
          id: `qst_${crypto.randomUUID()}`,
          question: questionText,
          context: req.body?.context,
          targetRole: req.body?.targetRole,
          category: req.body?.category,
          priority: req.body?.priority,
          status: req.body?.status,
          deliveryStageId: req.body?.deliveryStageId || req.body?.stageId,
          dueDate: req.body?.dueDate,
          linkedRequirementIds: req.body?.linkedRequirementIds,
          answer: req.body?.answer,
          createdAt: nowIso(),
          updatedAt: nowIso(),
          createdBy: req.auth.user.id,
          updatedBy: req.auth.user.id,
        });

        project.clarificationQuestions.unshift(record);
        project.clarificationQuestions = project.clarificationQuestions.slice(0, 600);
        project.updatedAt = nowIso();

        appendActivity(store, {
          actorUserId: req.auth.user.id,
          projectId: project.id,
          action: 'clarification_question_created',
          details: { questionId: record.id, targetRole: record.targetRole, status: record.status },
        });
      });

      const store = await readStore();
      const project = store.projects.find((entry) => entry.id === projectId);
      return res.json({ project: sanitizeProject(project, req.auth.user) });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.patch('/api/projects/projects/:projectId/questions/:questionId', authMiddleware, loadProjectForUser, requireProjectEditor, async (req, res) => {
    try {
      const projectId = req.params.projectId;
      const questionId = req.params.questionId;

      await updateStore(async (store) => {
        const project = store.projects.find((entry) => entry.id === projectId);
        if (!project) {
          throw new Error('Projeto nao encontrado.');
        }

        project.clarificationQuestions = normalizeClarificationQuestions(project.clarificationQuestions);
        const existing = project.clarificationQuestions.find((entry) => entry.id === questionId);
        if (!existing) {
          throw new Error('Pergunta nao encontrada.');
        }

        const patch = req.body || {};
        const merged = normalizeClarificationQuestionRecord({
          ...existing,
          ...patch,
          id: existing.id,
          createdAt: existing.createdAt,
          createdBy: existing.createdBy,
          updatedAt: nowIso(),
          updatedBy: req.auth.user.id,
        });

        if (!merged.question.trim()) {
          throw new Error('A pergunta não pode estar vazia.');
        }

        Object.assign(existing, merged);
        project.updatedAt = nowIso();

        appendActivity(store, {
          actorUserId: req.auth.user.id,
          projectId: project.id,
          action: 'clarification_question_updated',
          details: { questionId: existing.id, status: existing.status },
        });
      });

      const store = await readStore();
      const project = store.projects.find((entry) => entry.id === projectId);
      return res.json({ project: sanitizeProject(project, req.auth.user) });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.delete('/api/projects/projects/:projectId/questions/:questionId', authMiddleware, loadProjectForUser, requireProjectEditor, async (req, res) => {
    try {
      const projectId = req.params.projectId;
      const questionId = req.params.questionId;

      await updateStore(async (store) => {
        const project = store.projects.find((entry) => entry.id === projectId);
        if (!project) {
          throw new Error('Projeto nao encontrado.');
        }

        const before = ensureArray(project.clarificationQuestions).length;
        project.clarificationQuestions = ensureArray(project.clarificationQuestions).filter((entry) => entry.id !== questionId);
        if (project.clarificationQuestions.length === before) {
          throw new Error('Pergunta nao encontrada.');
        }

        project.updatedAt = nowIso();
        appendActivity(store, {
          actorUserId: req.auth.user.id,
          projectId: project.id,
          action: 'clarification_question_deleted',
          details: { questionId },
        });
      });

      const store = await readStore();
      const project = store.projects.find((entry) => entry.id === projectId);
      return res.json({ project: sanitizeProject(project, req.auth.user) });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.get('/api/projects/projects/:projectId/activity', authMiddleware, loadProjectForUser, async (req, res) => {
    const store = await readStore({ includeActivity: true, activityLimit: 400 });
    const activity = ensureArray(store.activity)
      .filter((entry) => entry.projectId === req.loadedProject.id)
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, 300)
      .map((entry) => ({
        ...entry,
        actorName: getUserName(store, entry.actorUserId),
      }));

    const auditLog = projectAudit.normalizeAuditLog(req.loadedProject.auditLog)
      .map((entry) => ({
        ...entry,
        actorName: entry.actorName || getUserName(store, entry.actorUserId),
        canRevert: Boolean(entry.snapshotId) && !entry.revertedAt,
      }));

    return res.json({ activity, auditLog });
  });

  app.post('/api/projects/projects/:projectId/roadmap/sync-from-phases', authMiddleware, loadProjectForUser, requireProjectEditor, async (req, res) => {
    try {
      const project = req.loadedProject;
      const synced = roadmapSync.syncRoadmapFromPlanPhases(project);
      if (!synced.changed) {
        return res.status(400).json({ message: synced.message || 'Não há fases no plano para sincronizar.' });
      }

      project.roadmap = deliveryOs.normalizeRoadmap(synced.roadmap, project);
      project.updatedAt = nowIso();

      await updateStore(async (store) => {
        if (!store.projects.some((entry) => entry.id === project.id)) {
          store.projects.push(project);
        }
        appendActivity(store, {
          actorUserId: req.auth.user.id,
          projectId: project.id,
          action: 'roadmap_synced_from_phases',
          details: { phaseCount: synced.planPhaseCount },
        });
      });

      projectPayload.clearSanitizeCache(project.id);
      return res.json({
        message: `Roadmap criado a partir de ${synced.planPhaseCount} fase(s) do plano.`,
        project: sanitizeProject(project, req.auth.user, { bypassCache: true }),
      });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.patch('/api/projects/projects/:projectId/roadmap/phases/:phaseId', authMiddleware, loadProjectForUser, requireProjectEditor, async (req, res) => {
    try {
      const phaseId = req.params.phaseId;
      const patch = req.body || {};
      const project = req.loadedProject;

      project.roadmap = deliveryOs.normalizeRoadmap(project.roadmap || {}, project);
      const phase = ensureArray(project.roadmap.phases).find((p) => p.id === phaseId);
      if (!phase) {
        return res.status(404).json({ message: 'Fase de roadmap não encontrada.' });
      }

      if (patch.milestones !== undefined) {
        phase.milestones = ensureArray(patch.milestones).map((m) => {
          if (typeof m === 'string') return { name: m, date: '' };
          return { name: String(m?.name || m?.title || '').trim(), date: String(m?.date || '').trim() };
        }).filter((m) => m.name);
      }
      if (patch.name !== undefined) phase.name = String(patch.name).trim();
      if (patch.goalMarkdown !== undefined) phase.goalMarkdown = String(patch.goalMarkdown);
      if (patch.deliverableMarkdown !== undefined) phase.deliverableMarkdown = String(patch.deliverableMarkdown);
      if (patch.startDate !== undefined) phase.startDate = String(patch.startDate);
      if (patch.endDate !== undefined) phase.endDate = String(patch.endDate);

      project.roadmap.updatedAt = nowIso();
      project.updatedAt = nowIso();

      await updateStore(async (store) => {
        if (!store.projects.some((entry) => entry.id === project.id)) {
          store.projects.push(project);
        }
        appendActivity(store, {
          actorUserId: req.auth.user.id,
          projectId: project.id,
          action: 'roadmap_phase_updated',
          details: { phaseId },
        });
      });

      projectPayload.clearSanitizeCache(project.id);
      return res.json({ project: sanitizeProject(project, req.auth.user, { bypassCache: true }) });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.get('/api/projects/projects/:projectId/proposal-config', authMiddleware, loadProjectForUser, requireProjectEditor, async (req, res) => {
    const project = req.loadedProject;
    project.phases = normalizePhases(project.phases);
    const config = proposalGenerator.buildProposalConfigDefaults(project);
    const paymentPreview = proposalGenerator.computePaymentMilestones(config);
    return res.json({ config, paymentPreview });
  });

  app.get('/api/projects/projects/:projectId/generated/:genId/:format', authMiddleware, loadProjectForUser, async (req, res) => {
    try {
      if (req.auth.user.role !== 'super_admin') {
        return res.status(403).json({ message: 'Apenas o administrador pode aceder ao historico de propostas.' });
      }

      const { genId, format } = req.params;
      const download = req.query.download === '1';
      const project = req.loadedProject;
      const entry = ensureArray(project.generated).find((item) => item.id === genId);
      if (!entry) {
        return res.status(404).json({ message: 'Geracao nao encontrada.' });
      }

      const slug = sanitizeFileName(project.name) || 'proposta';
      const normalizedFormat = String(format || '').toLowerCase();

      if (normalizedFormat === 'markdown') {
        const content = await readGeneratedMarkdown(rootBase, entry);
        if (!content) {
          return res.status(404).json({ message: 'Markdown nao disponivel.' });
        }
        res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
        if (download) {
          res.setHeader('Content-Disposition', `attachment; filename="${slug}_proposta.md"`);
        }
        return res.send(content);
      }

      if (normalizedFormat === 'html') {
        const html = await readGeneratedHtml(rootBase, entry, project);
        if (!html) {
          return res.status(404).json({ message: 'HTML nao disponivel.' });
        }
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        if (download) {
          res.setHeader('Content-Disposition', `attachment; filename="${slug}_proposta.html"`);
        }
        return res.send(html);
      }

      return res.status(400).json({ message: 'Formato invalido. Use markdown ou html.' });
    } catch (error) {
      return res.status(500).json({ message: `Erro ao obter proposta: ${error.message}` });
    }
  });

  app.delete('/api/projects/projects/:projectId/generated/:genId', authMiddleware, loadProjectForUser, async (req, res) => {
    try {
      if (req.auth.user.role !== 'super_admin') {
        return res.status(403).json({ message: 'Apenas o administrador pode eliminar propostas geradas.' });
      }

      const projectId = req.params.projectId;
      const genId = req.params.genId;
      const project = req.loadedProject;
      if (!project || project.id !== projectId) {
        return res.status(404).json({ message: 'Projeto nao encontrado.' });
      }

      const generated = ensureArray(project.generated);
      const index = generated.findIndex((item) => item.id === genId);
      if (index < 0) {
        return res.status(404).json({ message: 'Geracao nao encontrada.' });
      }

      const removedEntry = generated[index];
      if (removedEntry.mode !== 'commercial') {
        return res.status(400).json({ message: 'Apenas propostas comerciais podem ser eliminadas nesta vista.' });
      }

      project.generated = generated.filter((item) => item.id !== genId);
      project.updatedAt = nowIso();

      await updateStore(async (store) => {
        if (!store.projects.some((entry) => entry.id === projectId)) {
          store.projects.push(project);
        }
        appendActivity(store, {
          actorUserId: req.auth.user.id,
          projectId,
          action: 'proposal_bundle_deleted',
          details: {
            genId,
            mode: removedEntry.mode,
            generatedAt: removedEntry.generatedAt,
          },
        });
      });

      if (removedEntry.folder) {
        const folderPath = fromPublicPath(rootBase, removedEntry.folder);
        if (folderPath) {
          await fs.rm(folderPath, { recursive: true, force: true }).catch(() => {});
        }
      }

      projectPayload.clearSanitizeCache(projectId);
      const freshProject = await ensureProjectLoaded(projectId);
      return res.json({
        message: 'Proposta comercial eliminada.',
        project: sanitizeProject(freshProject || project, req.auth.user, { bypassCache: true }),
      });
    } catch (error) {
      return res.status(500).json({ message: error.message || 'Erro ao eliminar proposta.' });
    }
  });

  app.post('/api/projects/projects/:projectId/generate', authMiddleware, loadProjectForUser, requireProjectEditor, async (req, res) => {
    try {
      const projectId = req.params.projectId;
      const mode = req.body?.mode === 'technical' ? 'technical' : 'commercial';
      const dryRun = Boolean(req.body?.dryRun);
      const requestedModulesRaw = normalizeStringArray(req.body?.selectedModules);
      const invalidModules = requestedModulesRaw.filter((entry) => {
        const trimmed = textOr(entry);
        const normalized = normalizeArchitectureModuleToken(trimmed)
          || (ARCHITECTURE_MODULES.includes(trimmed) ? trimmed : null);
        return !normalized;
      });
      if (invalidModules.length) {
        return res.status(400).json({ message: `Módulo(s) inválido(s): ${invalidModules.join(', ')}` });
      }
      const selectedModules = normalizeArchitectureModuleList(requestedModulesRaw);

      const store = await readStore();
      const project = store.projects.find((entry) => entry.id === projectId);
      if (!project) {
        return res.status(404).json({ message: 'Projeto nao encontrado.' });
      }

      project.phases = normalizePhases(project.phases);
      const folderHint = sanitizeFileName(project.name) || 'project';
      const runFolder = path.join(
        rootBase,
        'generated_proposals',
        `${new Date().toISOString().slice(0, 10)}_${Date.now()}_rp_${folderHint}`
      );
      const outputDir = path.join(runFolder, 'dist');
      const proposalInput = path.join(runFolder, 'proposal_input.json');

      await fs.mkdir(outputDir, { recursive: true });

      const genId = `gen_${crypto.randomUUID()}`;
      let execLog = '';
      let links = {};
      let generator = 'internal-fallback';
      let proposalConfigSnapshot = null;

      if (mode === 'commercial') {
        if (!req.body?.proposalConfig) {
          return res.status(400).json({ message: 'proposalConfig e obrigatorio para proposta comercial.' });
        }
        const config = proposalGenerator.normalizeProposalConfig(req.body.proposalConfig, project);
        const validation = proposalGenerator.validateProposalConfig(config);
        if (!validation.valid) {
          return res.status(400).json({ message: validation.errors.join(' ') });
        }
        const payment = proposalGenerator.computePaymentMilestones(config);
        proposalConfigSnapshot = { ...config, payment, generatedAt: nowIso() };
        await fs.writeFile(
          path.join(runFolder, 'proposal_config.json'),
          `${JSON.stringify(proposalConfigSnapshot, null, 2)}\n`,
          'utf-8'
        );

        const slug = sanitizeFileName(project.name) || 'projeto';
        const bundle = await proposalGenerator.writeCommercialProposalBundle({
          project,
          config,
          outputDir,
          slug,
        });
        execLog = '[proposal-generator] Proposta comercial gerada (markdown persistido; HTML sob pedido).';
        generator = 'proposal-generator';

        const markdownPublic = toPublicPath(rootBase, bundle.markdownPath);
        links = buildCommercialGeneratedLinks(projectId, genId, markdownPublic);
        await fs.writeFile(
          proposalInput,
          `${JSON.stringify({ mode, config: proposalConfigSnapshot, phaseGroups: bundle.content?.phaseGroups?.length || 0 }, null, 2)}\n`,
          'utf-8'
        );
      } else {
        const proposal = buildProposalFromProject(project, mode, { selectedModules });
        await fs.writeFile(proposalInput, `${JSON.stringify(proposal, null, 2)}\n`, 'utf-8');

        const canUseExternalBuilder = Boolean(resolvedBuildScriptPath) && await fileExists(resolvedBuildScriptPath);

        if (canUseExternalBuilder) {
          const args = [
            resolvedBuildScriptPath,
            '--input', proposalInput,
            '--output-dir', outputDir,
            '--logo', resolvedLogoPath,
          ];
          if (dryRun) {
            args.push('--dry-run');
          }

          execLog = execFileSync('node', args, {
            cwd: rootBase,
            timeout: 300000,
            maxBuffer: 100 * 1024 * 1024,
            encoding: 'utf-8',
          });
          generator = 'external';
        } else {
          execLog = await generateProposalBundleFallback({
            proposal: buildProposalFromProject(project, mode, { selectedModules }),
            outputDir,
            mode,
            selectedModules,
          });
        }

        const fileEntries = await fs.readdir(outputDir);
        links = buildGeneratedLinksFromDir(rootBase, outputDir, fileEntries);
      }

      await updateStore(async (mutableStore) => {
        const mutableProject = mutableStore.projects.find((entry) => entry.id === projectId);
        if (!mutableProject) {
          return;
        }

        mutableProject.generated = ensureArray(mutableProject.generated);
        mutableProject.generated.unshift({
          id: genId,
          mode,
          dryRun,
          selectedModules,
          generatedAt: nowIso(),
          folder: toPublicPath(rootBase, runFolder),
          proposalInput: toPublicPath(rootBase, proposalInput),
          proposalConfig: proposalConfigSnapshot ? toPublicPath(rootBase, path.join(runFolder, 'proposal_config.json')) : null,
          outputs: links,
        });
        mutableProject.generated = mutableProject.generated.slice(0, 50);
        mutableProject.updatedAt = nowIso();

        appendActivity(mutableStore, {
          actorUserId: req.auth.user.id,
          projectId,
          action: 'proposal_bundle_generated',
          details: { mode, dryRun, selectedModules, folder: toPublicPath(rootBase, runFolder) },
        });
      });

      return res.json({
        message: 'Bundle gerado com sucesso.',
        id: genId,
        mode,
        dryRun,
        selectedModules,
        folder: toPublicPath(rootBase, runFolder),
        proposalInput: toPublicPath(rootBase, proposalInput),
        proposalConfig: proposalConfigSnapshot,
        outputs: links,
        log: execLog,
        generator,
      });
    } catch (error) {
      return res.status(500).json({ message: `Erro ao gerar bundle: ${error.message}` });
    }
  });

  deliveryOs.registerDeliveryOsRoutes(app, {
    authMiddleware,
    requireProjectEditor,
    loadProjectForUser,
    readStore,
    updateStore,
    appendActivity,
    sanitizeProject,
    normalizeArtifacts,
    normalizeTraceLinks,
    normalizeApprovals,
    normalizeMeetingMinutes,
    normalizeRequirementRecord,
    numberOr,
    projectAudit,
    getUserName,
    dataDir,
    resolveSnapshotData: (project, snapshotId) => blobStore.resolveSnapshotData(project, snapshotId, dataDir, readJson),
  });

  deliveryOsPlatform.registerDeliveryOsPlatformRoutes(app, {
    authMiddleware,
    requireRole,
    requireProjectEditor,
    loadProjectForUser,
    readStore,
    updateStore,
    appendActivity,
    sanitizeProject,
    normalizeApprovals,
  });

  projectAudit.registerProjectAuditRoutes(app, {
    authMiddleware,
    loadProjectForUser,
    requireProjectEditor,
    readStore,
    updateStore,
    appendActivity,
    sanitizeProject,
    getUserName,
  });

  registerWorkItemRoutes(app, {
    authMiddleware,
    requireProjectEditor,
    ensureProjectLoadedLite,
    canAccessProject: projectAccess.canAccessProject,
    updateStore,
    appendActivity,
    ensureArray,
    nowIso,
    sendProjectEmail,
    normalizeRequirementRecord,
    connectorStore,
    agentConnectionMode,
    runtime: createAgentRuntimeClient(),
  });

  registerAgentRuntimeRoutes(app, {
    authMiddleware,
    requireRole,
    loadProjectForUser,
    readStore,
    updateStore,
    appendActivity,
    sanitizeProject,
    normalizePromptRun: deliveryOs.normalizePromptRun,
    normalizeHumanReview: deliveryOs.normalizeHumanReview,
    buildHumanReviewPayload: deliveryOs.buildHumanReviewPayload,
    ensureArray,
    nowIso,
    sendProjectEmail,
    sqliteStore,
    connectorStore,
    verifyPassword,
    dataDir,
  });

  registerEngineeringStateRoutes(app, {
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
  });

  ensureStore().catch((error) => {
    console.error('Erro ao inicializar Requirements Platform:', error.message);
  });
}

function normalizeAiPayloadIntoProject(project, payload, actorUserId) {
  const projectPayload = payload?.project && typeof payload.project === 'object' ? payload.project : {};
  const nextName = textOr(projectPayload.name || payload.name);
  const nextClientName = textOr(projectPayload.clientName || projectPayload.client || payload.clientName || payload.client);
  const nextDescription = textOr(projectPayload.description || payload.description);
  const nextStatus = textOr(projectPayload.status || payload.status);
  const nextProposalCode = textOr(projectPayload.proposalCode || payload.proposalCode);
  const nextSubtitle = textOr(projectPayload.subtitle || payload.subtitle);
  const nextCurrency = textOr(projectPayload.currency || payload.currency);
  const nextLanguage = textOr(projectPayload.language || payload.language);

  if (nextName) project.name = nextName;
  if (nextClientName) project.clientName = nextClientName;
  if (nextDescription) project.description = nextDescription;
  if (nextStatus) project.status = nextStatus;
  if (nextProposalCode) project.proposalCode = nextProposalCode;
  if (nextSubtitle) project.subtitle = nextSubtitle;
  if (nextCurrency) project.currency = nextCurrency;
  if (nextLanguage) project.language = nextLanguage;

  const stakeholderRaw = payload.stakeholderRequirements || payload.stakeholders || [];
  const functionalRaw = payload.functionalRequirements || payload?.requirements?.functional || [];
  const nonFunctionalRaw = payload.nonFunctionalRequirements || payload?.requirements?.nonFunctional || [];
  const testCasesRaw = payload.testCases || payload.acceptanceTestCases || payload.validationTestCases || [];
  const undefinedRaw = payload.undefinedItems || payload.openQuestions || [];
  const outOfScopeRaw = payload.outOfScope || payload.notIncluded || [];

  const existing = ensureArray(project.requirements);
  let mergeStats = { added: 0, updated: 0, skipped: 0 };

  const mergeType = (rawList, type) => {
    const result = reqHierarchy.mergeRequirementsByDedupe(
      project.requirements,
      rawList,
      type,
      (entry) => normalizeRequirementRecord({ ...entry, updatedBy: actorUserId })
    );
    project.requirements = result.requirements;
    mergeStats.added += result.added;
    mergeStats.updated += result.updated;
    mergeStats.skipped += result.skipped;
  };

  mergeType(stakeholderRaw, 'stakeholder');
  mergeType(functionalRaw, 'functional');
  mergeType(nonFunctionalRaw, 'non_functional');
  mergeType(testCasesRaw, 'test_case');
  mergeType(undefinedRaw, 'undefined');
  mergeType(outOfScopeRaw, 'out_of_scope');

  project.requirements = project.requirements.map((req) => ({
    ...req,
    createdAt: req.createdAt || nowIso(),
    updatedAt: nowIso(),
    updatedBy: actorUserId,
  }));

  if (payload.summary) {
    project.summary = normalizeSummary(payload.summary);
  }

  if (Array.isArray(payload.assumptions)) {
    project.assumptions = normalizeStringArray(payload.assumptions);
  }

  if (Array.isArray(payload.risks)) {
    project.risks = normalizeStringArray(payload.risks);
  }

  if (Array.isArray(payload.integrations)) {
    project.integrations = normalizeIntegrations(payload.integrations);
  }

  if (payload.technicalApproach) {
    project.technicalApproach = normalizeTechnicalApproach(payload.technicalApproach);
  }

  if (payload.commercialTerms) {
    project.commercialTerms = normalizeCommercialTerms(payload.commercialTerms);
  }

  if (Array.isArray(payload.phases) && payload.phases.length) {
    project.phases = normalizePhases(payload.phases);
  }

  proposalGenerator.stripBudgetFromProject(project);

  return {
    stakeholder: ensureArray(stakeholderRaw).length,
    functional: ensureArray(functionalRaw).length,
    nonFunctional: ensureArray(nonFunctionalRaw).length,
    testCases: ensureArray(testCasesRaw).length,
    undefinedItems: ensureArray(undefinedRaw).length,
    outOfScope: ensureArray(outOfScopeRaw).length,
    mergeStats,
  };
}

function applyRequirementChangeSet(project, payload, actorUserId) {
  project.requirements = ensureArray(project.requirements).map((entry) => normalizeRequirementRecord(entry));
  project.clarificationQuestions = normalizeClarificationQuestions(project.clarificationQuestions);

  const result = {
    added: 0,
    updated: 0,
    excluded: 0,
    clarificationsCreated: 0,
    projectUpdated: false,
  };

  const updates = payload.projectUpdates && typeof payload.projectUpdates === 'object' ? payload.projectUpdates : {};
  if (updates.description !== undefined) {
    project.description = textOr(updates.description);
    result.projectUpdated = true;
  }

  if (updates.summary && typeof updates.summary === 'object') {
    const summary = normalizeSummary(project.summary);
    if (updates.summary.businessContext !== undefined) summary.businessContext = textOr(updates.summary.businessContext);
    if (updates.summary.scopeInPlainLanguage !== undefined) summary.scopeInPlainLanguage = textOr(updates.summary.scopeInPlainLanguage);
    if (updates.summary.solutionOverview !== undefined) summary.solutionOverview = textOr(updates.summary.solutionOverview);
    summary.goals = mergeStringList(summary.goals, updates.summary.goalsAdd, updates.summary.goalsRemove);
    project.summary = normalizeSummary(summary);
    result.projectUpdated = true;
  }

  project.risks = mergeStringList(project.risks, updates.risksAdd, updates.risksRemove);
  project.assumptions = mergeStringList(project.assumptions, updates.assumptionsAdd, updates.assumptionsRemove);

  const addRequirements = ensureArray(payload.addRequirements || payload.newRequirements);
  for (const raw of addRequirements) {
    const type = normalizeRequirementType(raw?.type) || 'functional';
    const [created] = normalizeImportedRequirements([raw], type, project.requirements);
    const requirement = normalizeRequirementRecord({
      ...created,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      updatedBy: actorUserId,
    });
    const smartErrors = getSmartRequirementValidationErrors(requirement);
    if (requiresSmartValidity(requirement.status) && smartErrors.length) {
      throw new Error(`Novo requisito ${requirement.title || requirement.id} incompleto para status ${requirement.status}. Campos em falta: ${smartErrors.join(', ')}`);
    }
    project.requirements.push(requirement);
    result.added += 1;
  }

  const updateRequirements = ensureArray(payload.updateRequirements || payload.requirementUpdates);
  for (const update of updateRequirements) {
    const id = normalizeRequirementIdToken(update?.id || update?.requirementId);
    if (!id) continue;
    const existing = project.requirements.find((entry) => entry.id === id);
    if (!existing) {
      throw new Error(`Requisito ${id} nao encontrado para atualizacao.`);
    }

    const changes = update?.changes && typeof update.changes === 'object' ? update.changes : update;
    const normalized = normalizeRequirementRecord({
      ...existing,
      ...changes,
      id: existing.id,
      type: existing.type,
      updatedAt: nowIso(),
      updatedBy: actorUserId,
    });
    const smartErrors = getSmartRequirementValidationErrors(normalized);
    if (requiresSmartValidity(normalized.status) && smartErrors.length) {
      throw new Error(`Requisito ${id} incompleto para status ${normalized.status}. Campos em falta: ${smartErrors.join(', ')}`);
    }

    Object.assign(existing, normalized);
    result.updated += 1;
  }

  const removeRequirements = ensureArray(payload.removeRequirements || payload.excludeRequirements);
  for (const removal of removeRequirements) {
    const id = normalizeRequirementIdToken(typeof removal === 'string' ? removal : (removal?.id || removal?.requirementId));
    if (!id) continue;
    const existing = project.requirements.find((entry) => entry.id === id);
    if (!existing) {
      throw new Error(`Requisito ${id} nao encontrado para exclusao.`);
    }
    const reason = typeof removal === 'string' ? '' : textOr(removal?.reason);
    existing.status = 'excluded';
    existing.notes = [existing.notes, reason ? `Excluido por alteracao incremental: ${reason}` : 'Excluido por alteracao incremental.']
      .filter(Boolean)
      .join('\n');
    existing.updatedAt = nowIso();
    existing.updatedBy = actorUserId;
    result.excluded += 1;
  }

  const clarifications = ensureArray(payload.clarifications || payload.newClarifications);
  for (const entry of clarifications) {
    const raw = typeof entry === 'string' ? { question: entry } : (entry || {});
    const question = textOr(raw.question || raw.title || raw.description);
    if (!question) continue;
    project.clarificationQuestions.unshift(normalizeClarificationQuestionRecord({
      ...raw,
      id: `qst_${crypto.randomUUID()}`,
      question,
      status: raw.status || 'open',
      createdAt: nowIso(),
      updatedAt: nowIso(),
      createdBy: actorUserId,
      updatedBy: actorUserId,
    }));
    result.clarificationsCreated += 1;
  }

  project.clarificationQuestions = normalizeClarificationQuestions(project.clarificationQuestions).slice(0, 600);
  project.requirements = project.requirements.map((entry) => normalizeRequirementRecord(entry));

  return result;
}

function mergeStringList(current, addList, removeList) {
  const removeSet = new Set(normalizeStringArray(removeList).map((entry) => normalizeForCompare(entry)));
  const merged = normalizeStringArray(current).filter((entry) => !removeSet.has(normalizeForCompare(entry)));
  for (const entry of normalizeStringArray(addList)) {
    const token = normalizeForCompare(entry);
    if (token && !merged.some((existing) => normalizeForCompare(existing) === token)) {
      merged.push(entry);
    }
  }
  return merged;
}

function normalizeImportedRequirements(rawList, type, existingList) {
  const normalizedType = normalizeRequirementType(type);
  const source = ensureArray(rawList);
  const prefix = REQUIREMENT_TYPE_META[normalizedType]?.prefix || 'REQ';
  let nextNumber = nextRequirementNumber(existingList, prefix);

  return source.map((entry) => {
    const generatedId = `${prefix}-${String(nextNumber++).padStart(2, '0')}`;
    const rawEntry = typeof entry === 'string' ? { title: entry, description: '' } : (entry || {});
    const fallbackStatus = normalizedType === 'out_of_scope' ? 'excluded' : 'draft';
    const fallbackPriority = normalizedType === 'undefined' ? 'high' : 'medium';

    return normalizeRequirementRecord({
      ...rawEntry,
      id: generatedId,
      type: normalizedType,
      status: rawEntry.status || fallbackStatus,
      priority: rawEntry.priority || fallbackPriority,
      phase: rawEntry.phase || 'Backlog',
    });
  });
}

function normalizeRequirementRecord(entry) {
  const normalizedType = normalizeRequirementType(entry?.type) || 'functional';
  const meta = REQUIREMENT_TYPE_META[normalizedType] || { label: 'Requisito' };
  const raw = entry || {};

  const need = textOr(raw.need || raw.userNeed || raw.businessNeed || raw.stakeholderNeed || raw.title);
  const shall = textOr(raw.shall || raw.statement || raw.requirementStatement || raw.description);
  const condition = textOr(raw.condition || raw.triggerCondition || raw.when || raw.trigger);
  const measure = textOr(raw.measure || raw.passFail || raw.acceptanceMeasure);
  const rationale = textOr(raw.rationale || raw.businessNeed || raw.justification || raw.businessValue);
  const verification = textOr(raw.verification || raw.verificationMethod);
  const assumption = textOr(raw.assumption || raw.mainAssumption);
  const architectureParts = extractArchitectureModuleParts({
    module: raw.module || raw.moduleName || raw.architectureModule || raw.layer || raw.component || raw.domain,
    submodule: raw.submodule || raw.subModule || raw.moduleArea || raw.feature || raw.componentName,
  });
  const stakeholderRequirementLink = textOr(raw.stakeholderRequirementLink || raw.linkedStakeholderRequirement || raw.stakeholderLink || raw.link);
  const linkedFunctionalRequirement = textOr(raw.linkedFunctionalRequirement || raw.functionalRequirementLink);
  const relatedRequirementIds = normalizeRequirementIdList(
    raw.relatedRequirementIds || raw.dependencies || raw.dependsOn || raw.requirementLinks || raw.links
  );
  const hierarchyLinks = ensureArray(raw.hierarchyLinks).map((link) => ({
    role: textOr(link?.role, 'parent'),
    targetId: normalizeRequirementIdToken(link?.targetId),
    linkType: textOr(link?.linkType, 'decomposes_from'),
  })).filter((link) => link.targetId);

  const normalized = {
    id: textOr(raw.id),
    type: normalizedType,
    title: textOr(raw.title || raw.name, shall || `${meta.label} sem titulo`),
    need,
    shall,
    condition,
    measure,
    rationale,
    verification,
    assumption,
    module: architectureParts.module,
    submodule: architectureParts.submodule,
    moduleTags: deliveryOs.enrichRequirementWithModuleTags({ module: architectureParts.module, moduleTags: raw.moduleTags }).moduleTags,
    bodyMarkdown: textOr(raw.bodyMarkdown || raw.notes),
    description: textOr(raw.description || shall),
    source: textOr(raw.source || raw.origin),
    stakeholderRequirementLink,
    priority: normalizePriority(raw.priority),
    status: normalizeStatus(raw.status),
    phase: textOr(raw.phase, 'Backlog'),
    versionRevision: textOr(raw.versionRevision || raw.version, '1.0'),
    owner: textOr(raw.owner),
    riskComplexity: textOr(raw.riskComplexity || raw.risk || raw.complexity),
    linkedFunctionalRequirement,
    hierarchyLinks,
    relatedRequirementIds,
    linkedDiagramIds: normalizeRequirementIdList(raw.linkedDiagramIds || raw.diagramArtifactIds),
    businessValue: textOr(raw.businessValue),
    target: textOr(raw.target),
    reason: textOr(raw.reason),
    notes: textOr(raw.notes),
    deliveryStageId: phaseContent.normalizeDeliveryStageId(raw.deliveryStageId, 'requirements'),
    movementHistory: ensureArray(raw.movementHistory).slice(0, 50),
    createdAt: textOr(raw.createdAt, nowIso()),
    updatedAt: textOr(raw.updatedAt, nowIso()),
    updatedBy: textOr(raw.updatedBy),
    synthesized: Boolean(raw.synthesized),
    synthesizedForRequirementId: textOr(raw.synthesizedForRequirementId),
  };

  if (normalizedType === 'out_of_scope' && !textOr(raw.status)) {
    normalized.status = 'excluded';
  }
  if (normalizedType === 'undefined' && !textOr(raw.priority)) {
    normalized.priority = 'high';
  }

  const index = reqHierarchy.buildIdIndex([normalized]);
  const synced = reqHierarchy.syncRequirementHierarchyFields(normalized, index);
  synced.relatedRequirementIds = normalizeRequirementIdList(synced.relatedRequirementIds)
    .filter((id) => id !== synced.id);

  return synced;
}

function getSmartRequirementValidationErrors(requirement) {
  if (normalizeRequirementType(requirement?.type) !== 'functional') {
    return [];
  }

  const errors = [];
  if (!textOr(requirement?.shall)) errors.push('shall');
  if (!textOr(requirement?.condition)) errors.push('condition');
  if (!textOr(requirement?.measure)) errors.push('measure');
  if (!textOr(requirement?.rationale)) errors.push('rationale');
  if (!textOr(requirement?.verification)) errors.push('verification');
  return errors;
}

function requiresSmartValidity(status) {
  return new Set(['approved', 'planned', 'in_development', 'validated', 'delivered']).has(String(status || ''));
}

function nextRequirementNumber(requirements, prefix) {
  let max = 0;
  for (const req of ensureArray(requirements)) {
    const id = String(req?.id || '');
    if (!id.startsWith(`${prefix}-`)) continue;
    const parsed = Number(id.split('-')[1]);
    if (Number.isFinite(parsed)) {
      max = Math.max(max, parsed);
    }
  }
  return max + 1;
}

function normalizeRequirementType(type) {
  const value = String(type || '').trim().toLowerCase();
  if (value === 'functional' || value === 'functional_requirement' || value === 'fr') return 'functional';
  if (value === 'non_functional' || value === 'nonfunctional' || value === 'non-functional' || value === 'non_functional_requirement' || value === 'nfr') return 'non_functional';
  if (value === 'stakeholder' || value === 'stakeholder_requirement' || value === 'sr') return 'stakeholder';
  if (value === 'test_case' || value === 'testcase' || value === 'test-case' || value === 'acceptance_test') return 'test_case';
  if (value === 'undefined') return 'undefined';
  if (value === 'out_of_scope' || value === 'out-of-scope' || value === 'outofscope') return 'out_of_scope';
  return null;
}

function normalizePriority(priority) {
  const value = String(priority || '').trim().toLowerCase();
  if (['musthave', 'must_have'].includes(value)) return 'high';
  if (['shouldhave', 'should_have'].includes(value)) return 'medium';
  if (['couldhave', 'could_have'].includes(value)) return 'low';
  if (['wonthave', 'wont_have'].includes(value)) return 'low';
  if (['must-have', 'must', 'moscow-must', 'critical', 'critica', 'critico'].includes(value)) return 'high';
  if (['should-have', 'should', 'moscow-should'].includes(value)) return 'medium';
  if (['could-have', 'could', 'moscow-could'].includes(value)) return 'low';
  if (['wont-have', 'won-t-have', 'wont', 'wonot', 'moscow-wont'].includes(value)) return 'low';
  if (['alta', 'high', 'h'].includes(value)) return 'high';
  if (['baixa', 'low', 'l'].includes(value)) return 'low';
  return 'medium';
}

function normalizeStatus(status) {
  const value = String(status || '').trim().toLowerCase();
  const aliases = {
    proposed: 'draft',
    approved: 'approved',
    implemented: 'in_development',
    tested: 'validated',
    rejected: 'excluded',
    deferred: 'planned',
  };
  if (aliases[value]) {
    return aliases[value];
  }
  return REQUIREMENT_STATUS_FLOW.includes(value) ? value : 'draft';
}

function generateRequirementId(requirements, type) {
  const meta = REQUIREMENT_TYPE_META[type];
  if (!meta) {
    return `REQ-${Math.floor(Math.random() * 10000)}`;
  }

  const prefix = meta.prefix;
  let max = 0;
  for (const req of ensureArray(requirements)) {
    const id = String(req?.id || '');
    if (!id.startsWith(`${prefix}-`)) continue;
    const parsed = Number(id.split('-')[1]);
    if (Number.isFinite(parsed)) {
      max = Math.max(max, parsed);
    }
  }

  return `${prefix}-${String(max + 1).padStart(2, '0')}`;
}

function buildStructuredPrompt(project, extraInstructions) {
  const sourceText = String(project.sourceText || '').trim();
  const minutes = normalizeMeetingMinutes(project.meetingMinutes).slice(0, 5);
  const openQuestions = normalizeClarificationQuestions(project.clarificationQuestions)
    .filter((entry) => ['open', 'sent', 'answered', 'blocked'].includes(entry.status))
    .slice(0, 40);
  const openQuestionsContext = openQuestions.length
    ? openQuestions.map((entry, idx) => {
      const reqLinks = entry.linkedRequirementIds?.length ? ` | requisitos=${entry.linkedRequirementIds.join(', ')}` : '';
      const answer = entry.answer ? `\nResposta parcial: ${entry.answer}` : '';
      return `Q${idx + 1} | id=${entry.id} | status=${entry.status} | alvo=${entry.targetRole} | categoria=${entry.category}${reqLinks}\nPergunta: ${entry.question}${answer}`;
    }).join('\n\n')
    : '';
  const minutesContext = minutes.length
    ? minutes.map((entry, idx) => `Ata ${idx + 1} (${entry.meetingDate || entry.createdAt}):\n${entry.rawText}`).join('\n\n')
    : '';
  const requirementsContext = sourceText || 'Sem texto base. Use apenas os metadados do projeto e indique lacunas com clareza.';

  return `
Tu és um analista sénior de requisitos e pré-venda técnica/comercial.

Objetivo:
Converter o documento do cliente num JSON estruturado para gestão de projeto e geração automática de documentação técnica e proposta comercial.

Projeto:
- Nome: ${project.name}
- Cliente: ${project.clientName}
- Idioma: ${project.language || 'pt-PT'}
- Moeda: ${project.currency || 'EUR'}

Instruções obrigatórias:
1) Organiza conteúdo em linguagem clara para não técnicos.
2) Preenche TODOS os campos do objeto project (name, clientName, description, status, proposalCode, subtitle, currency, language).
Se não houver informação explícita, usa defaults coerentes sem deixar campos vazios.
3) Mantém separação de níveis:
- stakeholderRequirements
- functionalRequirements
- testCases
- nonFunctionalRequirements
- undefinedItems
- outOfScope
4) Cada functionalRequirement deve seguir o formato lean SMART:
- id, need, shall, condition, measure, rationale, verification, priority
- assumption é opcional
5) Regra de validade funcional:
- shall explica o que o sistema faz
- condition define quando aplica
- measure define critério observável de pass/fail
- rationale explica porque importa
- verification explica como provar
6) Sempre que algo não estiver definido, coloca em undefinedItems com perguntas objetivas.
7) Tudo que não está incluído no MVP deve ir para outOfScope.
8) Define plano de desenvolvimento claro com 3 fases principais (F1, F2, F3), sem criar fases extras vagas.
Cada fase deve ter objetivo, duração, entregáveis e critérios de aceitação (sem valores monetários).
9) Módulos de arquitetura são determinísticos e obrigatórios:
- Frontend
- Backend
- Database
- System (requisitos transversais, segurança, auditoria, regras globais e comportamento cross-module)
- Integrations (fornecedores externos, pagamentos, OAuth, mapas, APIs de terceiros e conectores)
Usa também submodule para detalhar (ex: Login, Coupons, Reporting, Payments, OAuth).
10) Para cada requisito, indica correlações com outros requisitos usando relatedRequirementIds.
11) Usa nomes de fases consistentes: "Fase 1 - ...", "Fase 2 - ...", "Fase 3 - ...".
12) Responde apenas com JSON válido (sem markdown, sem texto fora do JSON).

Esquema mínimo esperado:
{
  "project": {
    "name": "${project.name}",
    "clientName": "${project.clientName}",
    "description": "...",
    "status": "active",
    "proposalCode": "${project.proposalCode || ''}",
    "subtitle": "${project.subtitle || 'Proposta Comercial e Tecnica'}",
    "currency": "${project.currency || 'EUR'}",
    "language": "${project.language || 'pt-PT'}"
  },
  "summary": {
    "businessContext": "...",
    "goals": ["..."],
    "scopeInPlainLanguage": "...",
    "solutionOverview": "..."
  },
  "stakeholderRequirements": [
    {
      "id":"SR-001",
      "title":"...",
      "description":"...",
      "businessValue":"...",
      "priority":"Alta|Media|Baixa",
      "status":"proposed|approved|implemented|tested|rejected|deferred",
      "phase":"Fase 1",
      "source":"...",
      "owner":"...",
      "module":"Frontend|Backend|Database|System|Integrations",
      "submodule":"Nome do submódulo",
      "relatedRequirementIds":["SR-002","RF-03"]
    }
  ],
  "functionalRequirements": [{
    "id":"FR-001",
    "need":"As a [stakeholder/user], I need [need].",
    "shall":"The system shall [specific function].",
    "condition":"When [trigger/context/precondition].",
    "measure":"Passes if [observable measurable result].",
    "rationale":"Needed because [business/operational reason].",
    "verification":"Verified by [test/demo/inspection/analysis].",
    "assumption":"[optional]",
    "priority":"mustHave|shouldHave|couldHave|wontHave",
    "status":"proposed|approved|implemented|tested|rejected|deferred",
    "phase":"Fase 1",
    "stakeholderRequirementLink":"SR-001",
    "module":"Frontend|Backend|Database|System|Integrations",
    "submodule":"Nome do submódulo",
    "relatedRequirementIds":["SR-001","RF-002"]
  }],
  "testCases": [
    {
      "id":"TC-001",
      "title":"...",
      "description":"...",
      "linkedFunctionalRequirement":"FR-001",
      "condition":"When [context]",
      "measure":"Passes if [result]",
      "verification":"Verified by [test method]",
      "priority":"Alta|Media|Baixa",
      "status":"proposed|approved|implemented|tested|rejected|deferred",
      "phase":"Fase 1",
      "module":"Frontend|Backend|Database|System|Integrations",
      "submodule":"Nome do submódulo",
      "relatedRequirementIds":["FR-001","SR-001"]
    }
  ],
  "nonFunctionalRequirements": [
    {
      "id":"RNF-001",
      "title":"...",
      "target":"...",
      "reason":"...",
      "priority":"Alta|Media|Baixa",
      "status":"proposed|approved|implemented|tested|rejected|deferred",
      "phase":"Fase 1",
      "module":"Frontend|Backend|Database|System|Integrations",
      "submodule":"Nome do submódulo",
      "relatedRequirementIds":["RF-001"]
    }
  ],
  "undefinedItems": ["..."],
  "outOfScope": ["..."],
  "integrations": [{"name":"...","direction":"Entrada|Saida|Bidirecional","complexity":"Baixa|Media|Alta","phase":"Fase 1|Fase 2|Fase 3","description":"..."}],
  "phases": [
    {"id":"F1","name":"Fase 1 - ...","objective":"...","durationWeeks":4,"deliverables":["..."],"acceptanceCriteria":["..."],"assumptions":["..."]},
    {"id":"F2","name":"Fase 2 - ...","objective":"...","durationWeeks":3,"deliverables":["..."],"acceptanceCriteria":["..."],"assumptions":["..."]},
    {"id":"F3","name":"Fase 3 - ...","objective":"...","durationWeeks":2,"deliverables":["..."],"acceptanceCriteria":["..."],"assumptions":["..."]}
  ],
  "technicalApproach": {
    "architectureSummary":"...",
    "stack":["..."],
    "security":["..."],
    "observability":["..."],
    "deployment":["..."]
  },
  "commercialTerms": {
    "validityDays": 30,
    "warrantyDays": 30,
    "exclusions": ["..."],
    "notes": ["..."]
  },
  "risks": ["..."],
  "assumptions": ["..."]
}

Contexto bruto do cliente:
"""
${requirementsContext}
"""

Atas de reunião recentes (raw):
"""
${minutesContext || 'Sem atas registadas.'}
"""

Perguntas de clarificação em aberto:
"""
${openQuestionsContext || 'Sem perguntas em aberto.'}
"""

Instruções adicionais:
${extraInstructions || 'Sem instruções adicionais.'}
`.trim();
}

function buildProposalFromProject(project, mode, options = {}) {
  const requestedModules = normalizeArchitectureModuleList(options.selectedModules);
  const requestedSet = new Set(requestedModules.map((entry) => entry.toLowerCase()));
  const reqs = ensureArray(project.requirements).map((entry) => normalizeRequirementRecord(entry));
  const scopedReqs = requestedSet.size
    ? reqs.filter((entry) => requestedSet.has(normalizeModuleName(entry.module).toLowerCase()))
    : reqs;
  const functional = scopedReqs.filter((entry) => entry.type === 'functional');
  const nonFunctional = scopedReqs.filter((entry) => entry.type === 'non_functional');
  const stakeholder = scopedReqs.filter((entry) => entry.type === 'stakeholder');
  const undefinedItems = scopedReqs.filter((entry) => entry.type === 'undefined');
  const outOfScopeReq = scopedReqs.filter((entry) => entry.type === 'out_of_scope');

  const summary = normalizeSummary(project.summary);
  if (!summary.goals.length && stakeholder.length) {
    summary.goals = stakeholder.map((entry) => entry.title).slice(0, 6);
  }
  if (requestedModules.length) {
    const moduleScopeNote = `Escopo modular selecionado: ${requestedModules.join(', ')}.`;
    summary.scopeInPlainLanguage = summary.scopeInPlainLanguage
      ? `${summary.scopeInPlainLanguage}\n\n${moduleScopeNote}`
      : moduleScopeNote;
  }

  const phases = normalizePhases(project.phases);
  const technicalApproach = normalizeTechnicalApproach(project.technicalApproach);
  const commercialTerms = normalizeCommercialTerms(project.commercialTerms);

  const exclusionsFromReq = outOfScopeReq.map((entry) => entry.title || entry.description).filter(Boolean);
  const assumptionsFromUndefined = undefinedItems.map((entry) => entry.title || entry.description).filter(Boolean);

  const subtitle = mode === 'technical'
    ? 'Documento Tecnico de Requisitos e Implementacao'
    : (project.subtitle || 'Proposta Comercial e Tecnica');

  const scopedLabel = requestedModules.length ? ` (Escopo Modular: ${requestedModules.join(', ')})` : '';
  const scopedSubtitle = `${subtitle}${scopedLabel}`;

  return {
    generationMode: mode,
    selectedModules: requestedModules,
    project: {
      name: project.name,
      client: project.clientName,
      preparedBy: 'YourLab',
      date: nowIso().slice(0, 10),
      currency: project.currency || 'EUR',
      language: project.language || 'pt-PT',
      proposalCode: project.proposalCode || '',
      subtitle: scopedSubtitle,
      documentMode: mode,
    },
    summary,
    requirements: {
      functional: functional.map((entry) => ({
        id: entry.id,
        title: entry.title,
        module: normalizeModuleName(entry.module),
        submodule: normalizeSubmoduleName(entry.submodule),
        moduleLabel: formatRequirementModuleLabel(entry),
        description: buildFunctionalDescriptionForProposal(entry),
        businessValue: entry.businessValue || entry.rationale,
        priority: priorityLabel(entry.priority),
        phase: entry.phase || 'Fase 1',
      })),
      nonFunctional: nonFunctional.map((entry) => ({
        id: entry.id,
        title: entry.title,
        module: normalizeModuleName(entry.module),
        submodule: normalizeSubmoduleName(entry.submodule),
        moduleLabel: formatRequirementModuleLabel(entry),
        target: entry.target || entry.description,
        reason: entry.reason || entry.businessValue || '',
      })),
    },
    integrations: normalizeIntegrations(project.integrations),
    phases,
    technicalApproach,
    commercialTerms: {
      ...commercialTerms,
      exclusions: normalizeStringArray([...(commercialTerms.exclusions || []), ...exclusionsFromReq]),
      notes: normalizeStringArray(commercialTerms.notes || []),
    },
    risks: normalizeStringArray(project.risks),
    assumptions: normalizeStringArray([...(project.assumptions || []), ...assumptionsFromUndefined]),
    branding: {
      companyName: 'YourLab',
      primaryColor: '#4a9eff',
      accentColor: '#4a9eff',
      backgroundColor: '#1b1b1b',
      surfaceColor: '#111111',
      textColor: '#e0e0e0',
      mutedColor: '#9a9a9a',
      logoPath: 'logo.png',
    },
  };
}

function normalizeSummary(summary) {
  return {
    businessContext: String(summary?.businessContext || '').trim(),
    goals: normalizeStringArray(summary?.goals),
    scopeInPlainLanguage: String(summary?.scopeInPlainLanguage || '').trim(),
    solutionOverview: String(summary?.solutionOverview || '').trim(),
  };
}

function defaultSummary() {
  return {
    businessContext: '',
    goals: [],
    scopeInPlainLanguage: '',
    solutionOverview: '',
  };
}

function defaultTechnicalApproach() {
  return {
    architectureSummary: '',
    stack: [],
    security: [],
    observability: [],
    deployment: [],
    architectureMermaid: '',
  };
}

function normalizeTechnicalApproach(approach) {
  return {
    architectureSummary: String(approach?.architectureSummary || '').trim(),
    stack: normalizeStringArray(approach?.stack),
    security: normalizeStringArray(approach?.security),
    observability: normalizeStringArray(approach?.observability),
    deployment: normalizeStringArray(approach?.deployment),
    architectureMermaid: String(approach?.architectureMermaid || '').trim(),
  };
}

function normalizeCommercialTerms(terms) {
  return proposalGenerator.normalizeCommercialTermsNonPrice(terms || DEFAULT_COMMERCIAL_TERMS);
}

function normalizeIntegrations(integrations) {
  return ensureArray(integrations).map((entry, idx) => ({
    name: String(entry?.name || `Integracao ${idx + 1}`).trim(),
    direction: String(entry?.direction || 'Bidirecional').trim(),
    complexity: String(entry?.complexity || 'Media').trim(),
    phase: String(entry?.phase || 'Fase 2').trim(),
    description: String(entry?.description || '').trim(),
  }));
}

function cascadeRequirementPhaseRenames(project, oldPhases, newPhases) {
  const oldById = new Map();
  for (const phase of ensureArray(oldPhases)) {
    const id = String(phase?.id || '').trim();
    if (id) oldById.set(id, phase);
  }
  const renames = [];
  for (const phase of ensureArray(newPhases)) {
    const id = String(phase?.id || '').trim();
    const nextName = String(phase?.name || '').trim();
    if (!id || !nextName) continue;
    const prev = oldById.get(id);
    const prevName = String(prev?.name || '').trim();
    if (prevName && prevName !== nextName) {
      renames.push({ from: prevName, to: nextName });
    }
  }
  if (!renames.length) return 0;
  let count = 0;
  for (const req of ensureArray(project?.requirements)) {
    const current = String(req?.phase || '').trim();
    if (!current) continue;
    const token = normalizeForCompare(current);
    for (const { from, to } of renames) {
      if (token === normalizeForCompare(from)) {
        req.phase = to;
        req.updatedAt = nowIso();
        count += 1;
        break;
      }
    }
  }
  return count;
}

function assertUniquePhaseNames(phases) {
  const seen = new Map();
  for (const phase of ensureArray(phases)) {
    const name = String(phase?.name || '').trim();
    if (!name) continue;
    const token = normalizeForCompare(name);
    if (seen.has(token)) {
      throw new Error(`Nome de fase duplicado: «${name}» (igual a «${seen.get(token)}»). Cada fase precisa de um nome único.`);
    }
    seen.set(token, name);
  }
}

function normalizePhases(phases) {
  const normalized = proposalGenerator.normalizePlanPhases(phases);
  if (normalized.length) return normalized;
  return proposalGenerator.defaultPlanPhases();
}

function defaultPhases() {
  return proposalGenerator.defaultPlanPhases();
}

function tryExtractText(fileName, buffer) {
  const ext = path.extname(fileName || '').toLowerCase();
  const directTextExt = new Set(['.txt', '.md', '.markdown', '.csv', '.json', '.yaml', '.yml']);

  if (directTextExt.has(ext)) {
    return buffer.toString('utf-8');
  }

  const decoded = buffer.toString('utf-8');
  const printable = decoded.replace(/[\x20-\x7E\n\r\t\u00A0-\u017F]/g, '');
  const ratio = decoded.length ? 1 - printable.length / decoded.length : 0;
  if (ratio > 0.9) {
    return decoded;
  }

  return '';
}

function extractJsonBlock(rawText) {
  const text = String(rawText || '').trim();
  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fencedMatch && fencedMatch[1]) {
    return fencedMatch[1].trim();
  }
  return text;
}

function parseJsonLenient(rawJsonLikeText) {
  const directText = String(rawJsonLikeText || '').trim();
  if (!directText) {
    return null;
  }

  try {
    return JSON.parse(directText);
  } catch {
    // continue
  }

  const normalizedQuotes = directText
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'");

  try {
    return JSON.parse(normalizedQuotes);
  } catch {
    return null;
  }
}

function buildGeneratedLinksFromDir(rootDir, outputDir, entries) {
  const links = {
    presentationPdf: null,
    fullDocumentPdf: null,
    presentationHtml: null,
    fullDocumentHtml: null,
    fullDocumentMarkdown: null,
  };

  for (const entry of entries) {
    const fullPath = path.join(outputDir, entry);
    const ext = path.extname(entry).toLowerCase();
    const name = entry.toLowerCase();

    if (ext === '.pdf' && name.includes('apresentacao') && !links.presentationPdf) {
      links.presentationPdf = toPublicPath(rootDir, fullPath);
      continue;
    }

    if (ext === '.pdf' && name.includes('proposta') && !links.fullDocumentPdf) {
      links.fullDocumentPdf = toPublicPath(rootDir, fullPath);
      continue;
    }

    if (ext === '.html' && name.includes('apresentacao') && !links.presentationHtml) {
      links.presentationHtml = toPublicPath(rootDir, fullPath);
      continue;
    }

    if (ext === '.html' && name.includes('proposta') && !links.fullDocumentHtml) {
      links.fullDocumentHtml = toPublicPath(rootDir, fullPath);
      continue;
    }

    if ((ext === '.md' || ext === '.markdown') && !links.fullDocumentMarkdown) {
      links.fullDocumentMarkdown = toPublicPath(rootDir, fullPath);
    }
  }

  return links;
}

async function generateProposalBundleFallback({ proposal, outputDir, mode, selectedModules }) {
  const project = proposal?.project || {};
  const summary = proposal?.summary || {};
  const requirements = proposal?.requirements || {};
  const functional = ensureArray(requirements.functional);
  const nonFunctional = ensureArray(requirements.nonFunctional);
  const phases = ensureArray(proposal?.phases);
  const integrations = ensureArray(proposal?.integrations);
  const risks = normalizeStringArray(proposal?.risks);
  const assumptions = normalizeStringArray(proposal?.assumptions);
  const goals = normalizeStringArray(summary.goals);
  const commercialTerms = proposal?.commercialTerms || {};
  const technicalApproach = proposal?.technicalApproach || {};
  const stack = normalizeStringArray(technicalApproach.stack);
  const security = normalizeStringArray(technicalApproach.security);
  const observability = normalizeStringArray(technicalApproach.observability);
  const deployment = normalizeStringArray(technicalApproach.deployment);

  const projectName = textOr(project.name, 'Projeto');
  const clientName = textOr(project.clientName, 'Cliente');
  const subtitle = textOr(project.subtitle);
  const proposalCode = textOr(project.proposalCode);
  const slug = sanitizeFileName(projectName) || 'projeto';
  const today = new Date().toISOString().slice(0, 10);
  const modeLabel = mode === 'technical' ? 'Pacote Tecnico' : 'Proposta Comercial + Tecnica';
  const moduleInfo = selectedModules?.length
    ? `Modulos selecionados: ${selectedModules.join(', ')}`
    : 'Modulos selecionados: Todos';

  const functionalByModule = groupBy(functional, (entry) => `${textOr(entry.module, 'Backend')}|${textOr(entry.submodule, '-')}`);
  const phaseRows = phases.map((phase, index) => ({
    idx: index + 1,
    name: textOr(phase.name || phase.title, `Fase ${index + 1}`),
    duration: textOr(phase.duration || phase.estimatedDuration, 'N/A'),
    objective: textOr(phase.objective || phase.description, ''),
    deliverables: normalizeStringArray(phase.deliverables || phase.outputs),
  }));

  const mdLines = [];
  mdLines.push(`# ${projectName} - ${modeLabel}`);
  mdLines.push('');
  mdLines.push(`Data: ${today}`);
  mdLines.push(`Cliente: ${clientName}`);
  if (proposalCode) mdLines.push(`Codigo da proposta: ${proposalCode}`);
  if (subtitle) mdLines.push(`Subtitulo: ${subtitle}`);
  mdLines.push(moduleInfo);
  mdLines.push('');

  mdLines.push('## Sumario Executivo');
  mdLines.push(textOr(summary.businessContext, 'Sem contexto informado.'));
  mdLines.push('');

  mdLines.push('## Objetivos');
  pushList(mdLines, goals, 'Sem objetivos informados.');
  mdLines.push('');

  mdLines.push('## Escopo em linguagem de negocio');
  mdLines.push(textOr(summary.scopeInPlainLanguage, 'Nao informado.'));
  mdLines.push('');

  mdLines.push('## Visao da Solucao');
  mdLines.push(textOr(summary.solutionOverview, 'Nao informado.'));
  mdLines.push('');

  mdLines.push('## Requisitos Funcionais por modulo');
  if (!functional.length) {
    mdLines.push('- Nenhum requisito funcional.');
  } else {
    for (const [groupKey, items] of functionalByModule.entries()) {
      const [moduleName, submoduleName] = groupKey.split('|');
      mdLines.push(`### ${moduleName}${submoduleName && submoduleName !== '-' ? ` / ${submoduleName}` : ''}`);
      items.forEach((entry) => {
        mdLines.push(`- **${textOr(entry.id, '-')}: ${textOr(entry.title, 'Sem titulo')}**`);
        mdLines.push(`  - Prioridade: ${priorityLabel(entry.priority)}`);
        mdLines.push(`  - Fase: ${textOr(entry.phase, 'N/A')}`);
        mdLines.push(`  - Descricao: ${textOr(entry.description, 'Sem descricao')}`);
        if (textOr(entry.businessValue)) mdLines.push(`  - Valor de negocio: ${textOr(entry.businessValue)}`);
      });
      mdLines.push('');
    }
  }

  mdLines.push('## Requisitos Nao Funcionais');
  if (!nonFunctional.length) {
    mdLines.push('- Nenhum requisito nao funcional.');
  } else {
    nonFunctional.forEach((entry) => {
      mdLines.push(`- **${textOr(entry.id, '-')}: ${textOr(entry.title, 'Sem titulo')}**`);
      mdLines.push(`  - Modulo: ${textOr(entry.moduleLabel || entry.module, 'N/A')}`);
      mdLines.push(`  - Target: ${textOr(entry.target, 'N/A')}`);
      if (textOr(entry.reason)) mdLines.push(`  - Justificacao: ${textOr(entry.reason)}`);
    });
  }
  mdLines.push('');

  mdLines.push('## Plano por Fases');
  if (!phaseRows.length) {
    mdLines.push('- Sem fases definidas.');
  } else {
    phaseRows.forEach((phase) => {
      mdLines.push(`- **Fase ${phase.idx} - ${phase.name}** (${phase.duration})`);
      if (phase.objective) mdLines.push(`  - Objetivo: ${phase.objective}`);
      if (phase.deliverables.length) mdLines.push(`  - Entregaveis: ${phase.deliverables.join('; ')}`);
    });
  }
  mdLines.push('');

  mdLines.push('## Integracoes');
  pushList(mdLines, integrations.map((item) => textOr(item.name || item.integration || item)), 'Sem integracoes definidas.');
  mdLines.push('');

  mdLines.push('## Abordagem Tecnica');
  mdLines.push(`Arquitetura: ${textOr(technicalApproach.architectureSummary, 'Nao informada.')}`);
  mdLines.push('');
  mdLines.push('### Stack');
  pushList(mdLines, stack, 'Nao informado.');
  mdLines.push('');
  mdLines.push('### Seguranca');
  pushList(mdLines, security, 'Nao informado.');
  mdLines.push('');
  mdLines.push('### Observabilidade');
  pushList(mdLines, observability, 'Nao informado.');
  mdLines.push('');
  mdLines.push('### Deploy');
  pushList(mdLines, deployment, 'Nao informado.');
  mdLines.push('');

  mdLines.push('## Termos Comerciais');
  mdLines.push(`Validade (dias): ${numberOr(commercialTerms.validityDays, 30)}`);
  mdLines.push(`Garantia (dias): ${numberOr(commercialTerms.warrantyDays, 30)}`);
  mdLines.push('### Pagamentos');
  pushList(mdLines, normalizeStringArray(commercialTerms.paymentTerms), 'Nao definido.');
  mdLines.push('### Exclusoes');
  pushList(mdLines, normalizeStringArray(commercialTerms.exclusions), 'Nenhuma exclusao listada.');
  mdLines.push('### Notas');
  pushList(mdLines, normalizeStringArray(commercialTerms.notes), 'Sem notas adicionais.');
  mdLines.push('');

  mdLines.push('## Riscos');
  pushList(mdLines, risks, 'Sem riscos registados.');
  mdLines.push('');

  mdLines.push('## Assuncoes');
  pushList(mdLines, assumptions, 'Sem assuncoes registadas.');
  mdLines.push('');

  const markdown = mdLines.join('\n');

  const htmlFull = renderFullProposalHtml({
    proposal,
    projectName,
    clientName,
    subtitle,
    proposalCode,
    modeLabel,
    today,
    moduleInfo,
    functional,
    nonFunctional,
    goals,
    risks,
    assumptions,
    phaseRows,
    integrations,
    technicalApproach,
    stack,
    security,
    observability,
    deployment,
    commercialTerms,
  });

  const htmlPresentation = renderExecutivePresentationHtml({
    projectName,
    clientName,
    subtitle,
    modeLabel,
    today,
    goals,
    risks,
    phaseRows,
    functional,
    moduleInfo,
  });

  const markdownPath = path.join(outputDir, `${slug}_proposta_completa.md`);
  const fullHtmlPath = path.join(outputDir, `${slug}_proposta_completa.html`);
  const presentationHtmlPath = path.join(outputDir, `${slug}_apresentacao_executiva.html`);

  await fs.writeFile(markdownPath, markdown, 'utf-8');
  await fs.writeFile(fullHtmlPath, htmlFull, 'utf-8');
  await fs.writeFile(presentationHtmlPath, htmlPresentation, 'utf-8');

  return '[internal-fallback] Bundle completo HTML/MD gerado sem script externo.';
}

function renderFullProposalHtml(input) {
  const {
    proposal,
    projectName,
    clientName,
    subtitle,
    proposalCode,
    modeLabel,
    today,
    moduleInfo,
    functional,
    nonFunctional,
    goals,
    risks,
    assumptions,
    phaseRows,
    integrations,
    technicalApproach,
    stack,
    security,
    observability,
    deployment,
    commercialTerms,
  } = input;

  const summary = proposal?.summary || {};

  return `<!DOCTYPE html>
<html lang="pt-PT">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtmlForDoc(projectName)} - ${escapeHtmlForDoc(modeLabel)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <style>
    :root { --bg: #1b1b1b; --surface: #242424; --surface2: #2a2a2a; --ink: #eeede9; --muted: #a09e9b; --line: #333333; --accent: #d4af37; --accent-soft: #e8d5b7; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: 'Manrope', sans-serif; background: var(--bg); color: var(--ink); line-height: 1.5; }
    .wrap { max-width: 1100px; margin: 0 auto; padding: 24px; }
    .cover { background: linear-gradient(165deg, #111111, #1f1f1f); border: 1px solid #2e2e2e; border-radius: 14px; padding: 36px; margin-bottom: 18px; }
    .cover h1 { margin: 0 0 8px; font-size: 34px; color: var(--accent-soft); }
    .cover p { margin: 4px 0; color: var(--muted); }
    .tag { display: inline-block; margin-top: 10px; border: 1px solid #3a3520; border-radius: 999px; background: rgba(212,175,55,0.1); color: var(--accent); padding: 6px 12px; font-size: 12px; font-weight: 600; letter-spacing: 0.03em; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; margin: 14px 0; }
    .card { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 18px; }
    .card h2 { margin: 0 0 12px; font-size: 18px; color: var(--accent-soft); }
    .card h3 { margin: 14px 0 8px; font-size: 14px; color: var(--accent); text-transform: uppercase; letter-spacing: 0.06em; }
    .meta { color: var(--muted); font-size: 13px; }
    .full { margin-top: 14px; }
    ul { margin: 8px 0 0 18px; }
    li { margin-bottom: 6px; color: var(--ink); }
    table { width: 100%; border-collapse: collapse; }
    th, td { border-bottom: 1px solid var(--line); padding: 9px 10px; text-align: left; vertical-align: top; font-size: 13px; }
    th { color: var(--accent); background: var(--surface2); font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; }
    .pill { display: inline-block; border-radius: 999px; background: rgba(212,175,55,0.15); border: 1px solid rgba(212,175,55,0.35); color: var(--accent-soft); padding: 3px 9px; font-size: 11px; font-weight: 600; }
    .small { font-size: 12px; color: var(--muted); }
    @media (max-width: 900px) { .grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <main class="wrap">
    <section class="cover">
      <h1>${escapeHtmlForDoc(projectName)}</h1>
      <p>${escapeHtmlForDoc(modeLabel)}</p>
      ${subtitle ? `<p>${escapeHtmlForDoc(subtitle)}</p>` : ''}
      <p>Cliente: ${escapeHtmlForDoc(clientName)} | Data: ${escapeHtmlForDoc(today)}</p>
      ${proposalCode ? `<p>Codigo: ${escapeHtmlForDoc(proposalCode)}</p>` : ''}
      <span class="tag">${escapeHtmlForDoc(moduleInfo)}</span>
    </section>

    <section class="grid">
      <article class="card">
        <h2>Sumario Executivo</h2>
        <p>${escapeHtmlForDoc(textOr(summary.businessContext, 'Sem contexto informado.'))}</p>
        <h3>Objetivos</h3>
        ${renderListHtml(goals, 'Sem objetivos informados.')}
      </article>
      <article class="card">
        <h2>Escopo e Solucao</h2>
        <h3>Escopo (negocio)</h3>
        <p>${escapeHtmlForDoc(textOr(summary.scopeInPlainLanguage, 'Nao informado.'))}</p>
        <h3>Visao da Solucao</h3>
        <p>${escapeHtmlForDoc(textOr(summary.solutionOverview, 'Nao informado.'))}</p>
      </article>
    </section>

    <section class="card full">
      <h2>Requisitos Funcionais</h2>
      ${functional.length ? `
        <table>
          <thead><tr><th>ID</th><th>Titulo</th><th>Modulo</th><th>Prioridade</th><th>Fase</th><th>Descricao</th></tr></thead>
          <tbody>
            ${functional.map((entry) => `<tr>
              <td>${escapeHtmlForDoc(textOr(entry.id, '-'))}</td>
              <td>${escapeHtmlForDoc(textOr(entry.title, 'Sem titulo'))}</td>
              <td>${escapeHtmlForDoc(textOr(entry.moduleLabel || entry.module, 'N/A'))}</td>
              <td><span class="pill">${escapeHtmlForDoc(priorityLabel(entry.priority))}</span></td>
              <td>${escapeHtmlForDoc(textOr(entry.phase, 'N/A'))}</td>
              <td>${escapeHtmlForDoc(textOr(entry.description, 'Sem descricao'))}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      ` : '<p class="small">Nenhum requisito funcional.</p>'}
    </section>

    <section class="card full">
      <h2>Requisitos Nao Funcionais</h2>
      ${nonFunctional.length ? `
        <table>
          <thead><tr><th>ID</th><th>Titulo</th><th>Modulo</th><th>Target</th><th>Justificacao</th></tr></thead>
          <tbody>
            ${nonFunctional.map((entry) => `<tr>
              <td>${escapeHtmlForDoc(textOr(entry.id, '-'))}</td>
              <td>${escapeHtmlForDoc(textOr(entry.title, 'Sem titulo'))}</td>
              <td>${escapeHtmlForDoc(textOr(entry.moduleLabel || entry.module, 'N/A'))}</td>
              <td>${escapeHtmlForDoc(textOr(entry.target, 'N/A'))}</td>
              <td>${escapeHtmlForDoc(textOr(entry.reason, 'N/A'))}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      ` : '<p class="small">Nenhum requisito nao funcional.</p>'}
    </section>

    <section class="grid">
      <article class="card">
        <h2>Plano por Fases</h2>
        ${phaseRows.length ? `<table><thead><tr><th>Fase</th><th>Duracao</th><th>Objetivo</th><th>Entregaveis</th></tr></thead><tbody>${phaseRows.map((phase) => `<tr><td>${escapeHtmlForDoc(phase.name)}</td><td>${escapeHtmlForDoc(phase.duration)}</td><td>${escapeHtmlForDoc(phase.objective || 'N/A')}</td><td>${escapeHtmlForDoc(phase.deliverables.join('; ') || 'N/A')}</td></tr>`).join('')}</tbody></table>` : '<p class="small">Sem fases definidas.</p>'}
      </article>
      <article class="card">
        <h2>Integracoes</h2>
        ${renderListHtml(integrations.map((item) => textOr(item.name || item.integration || item)), 'Sem integracoes definidas.')}
        <h3>Riscos</h3>
        ${renderListHtml(risks, 'Sem riscos registados.')}
        <h3>Assuncoes</h3>
        ${renderListHtml(assumptions, 'Sem assuncoes registadas.')}
      </article>
    </section>

    <section class="grid">
      <article class="card">
        <h2>Abordagem Tecnica</h2>
        <p><strong>Arquitetura:</strong> ${escapeHtmlForDoc(textOr(technicalApproach.architectureSummary, 'Nao informada.'))}</p>
        <h3>Stack</h3>
        ${renderListHtml(stack, 'Nao informado.')}
        <h3>Seguranca</h3>
        ${renderListHtml(security, 'Nao informado.')}
        <h3>Observabilidade</h3>
        ${renderListHtml(observability, 'Nao informado.')}
        <h3>Deploy</h3>
        ${renderListHtml(deployment, 'Nao informado.')}
      </article>
      <article class="card">
        <h2>Termos Comerciais</h2>
        <p><strong>Validade:</strong> ${numberOr(commercialTerms.validityDays, 30)} dias</p>
        <p><strong>Garantia:</strong> ${numberOr(commercialTerms.warrantyDays, 30)} dias</p>
        <h3>Pagamentos</h3>
        ${renderListHtml(normalizeStringArray(commercialTerms.paymentTerms), 'Nao definido.')}
        <h3>Exclusoes</h3>
        ${renderListHtml(normalizeStringArray(commercialTerms.exclusions), 'Nenhuma exclusao listada.')}
        <h3>Notas</h3>
        ${renderListHtml(normalizeStringArray(commercialTerms.notes), 'Sem notas adicionais.')}
      </article>
    </section>
  </main>
</body>
</html>`;
}

function renderExecutivePresentationHtml(input) {
  const {
    projectName,
    clientName,
    subtitle,
    modeLabel,
    today,
    goals,
    risks,
    phaseRows,
    functional,
    moduleInfo,
  } = input;

  const topReqs = functional.slice(0, 8);

  return `<!DOCTYPE html>
<html lang="pt-PT">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtmlForDoc(projectName)} - Apresentacao Executiva</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <style>
    :root { --bg: #1b1b1b; --surface: #242424; --surface2: #2a2a2a; --ink: #eeede9; --muted: #a09e9b; --accent: #d4af37; --accent-soft: #e8d5b7; --line: #333333; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: 'Manrope', sans-serif; background: var(--bg); color: var(--ink); }
    .slide { min-height: 100vh; padding: 64px; display: grid; align-content: center; border-bottom: 1px solid var(--line); }
    .slide:first-child { background: linear-gradient(165deg, #111111, #1f1f1f); }
    h1 { margin: 0 0 16px; font-size: 52px; line-height: 1.1; color: var(--accent-soft); }
    h2 { margin: 0 0 20px; font-size: 38px; color: var(--accent-soft); }
    h2::after { content: ''; display: block; width: 48px; height: 3px; background: var(--accent); margin-top: 10px; border-radius: 2px; }
    p, li { font-size: 22px; line-height: 1.5; color: var(--ink); }
    ul { margin: 10px 0 0 26px; }
    li { margin-bottom: 10px; }
    li strong { color: var(--accent); }
    .accent { color: var(--accent); }
    .accent-soft { color: var(--accent-soft); }
    .meta { font-size: 18px; color: var(--muted); }
    .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
    .box { border: 1px solid var(--line); border-radius: 12px; padding: 18px; background: var(--surface); }
    @media (max-width: 980px) { .slide { padding: 32px; } h1 { font-size: 38px; } h2 { font-size: 30px; } p, li { font-size: 18px; } .grid2 { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <section class="slide">
    <h1>${escapeHtmlForDoc(projectName)}</h1>
    <p class="accent">${escapeHtmlForDoc(modeLabel)}</p>
    ${subtitle ? `<p>${escapeHtmlForDoc(subtitle)}</p>` : ''}
    <p class="meta">Cliente: ${escapeHtmlForDoc(clientName)} | Data: ${escapeHtmlForDoc(today)}</p>
    <p class="meta">${escapeHtmlForDoc(moduleInfo)}</p>
  </section>

  <section class="slide">
    <h2>Objetivos do Projeto</h2>
    ${renderListHtml(goals, 'Sem objetivos informados.')}
  </section>

  <section class="slide">
    <h2>Fases de Entrega</h2>
    ${phaseRows.length ? `<ul>${phaseRows.map((phase) => `<li><strong>${escapeHtmlForDoc(phase.name)}</strong> (${escapeHtmlForDoc(phase.duration)}) - ${escapeHtmlForDoc(phase.objective || 'Objetivo a definir')}</li>`).join('')}</ul>` : '<p>Sem fases definidas.</p>'}
  </section>

  <section class="slide">
    <h2>Requisitos Prioritarios</h2>
    ${topReqs.length ? `<ul>${topReqs.map((entry) => `<li><strong>${escapeHtmlForDoc(textOr(entry.id, '-'))}</strong> - ${escapeHtmlForDoc(textOr(entry.title, 'Sem titulo'))}</li>`).join('')}</ul>` : '<p>Sem requisitos funcionais.</p>'}
  </section>

  <section class="slide">
    <h2>Riscos e Mitigacao</h2>
    ${renderListHtml(risks, 'Sem riscos registados.')}
  </section>
</body>
</html>`;
}

function renderListHtml(items, emptyMessage) {
  if (!items || !items.length) {
    return `<p>${escapeHtmlForDoc(emptyMessage)}</p>`;
  }
  return `<ul>${items.map((item) => `<li>${escapeHtmlForDoc(item)}</li>`).join('')}</ul>`;
}

function pushList(lines, items, emptyMessage) {
  if (!items || !items.length) {
    lines.push(`- ${emptyMessage}`);
    return;
  }
  items.forEach((item) => lines.push(`- ${item}`));
}

function groupBy(items, keyBuilder) {
  const map = new Map();
  for (const item of items) {
    const key = keyBuilder(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return map;
}

function escapeHtmlForDoc(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toPublicPath(rootDir, absolutePath) {
  if (!absolutePath) return null;
  const relative = path.relative(rootDir, absolutePath);
  if (!relative || relative.startsWith('..')) {
    return null;
  }
  return `/${relative.split(path.sep).join('/')}`;
}

function fromPublicPath(rootDir, publicPath) {
  const trimmed = String(publicPath || '').trim();
  if (!trimmed) return null;
  const relative = trimmed.replace(/^\/+/, '');
  const absolute = path.resolve(rootDir, relative);
  if (!absolute.startsWith(path.resolve(rootDir))) return null;
  return absolute;
}

function buildCommercialGeneratedLinks(projectId, genId, markdownPublicPath) {
  const base = `/api/projects/projects/${encodeURIComponent(projectId)}/generated/${encodeURIComponent(genId)}`;
  return {
    fullDocumentMarkdown: markdownPublicPath,
    fullDocumentHtml: `${base}/html`,
    downloadMarkdown: `${base}/markdown?download=1`,
    downloadHtml: `${base}/html?download=1`,
  };
}

async function loadProposalConfigSnapshot(rootDir, entry, project) {
  const candidates = [
    entry?.proposalConfig,
    entry?.proposalConfigPath,
  ].filter(Boolean);

  const folderPath = fromPublicPath(rootDir, entry?.folder);
  if (folderPath) {
    candidates.push(toPublicPath(rootDir, path.join(folderPath, 'proposal_config.json')));
  }

  for (const candidate of candidates) {
    const configPath = fromPublicPath(rootDir, candidate);
    if (!configPath || !(await fileExists(configPath))) continue;
    const snapshot = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    return proposalGenerator.normalizeProposalConfig(snapshot, project);
  }

  return null;
}

async function readGeneratedMarkdown(rootDir, entry) {
  const mdPublic = entry?.outputs?.fullDocumentMarkdown;
  if (mdPublic) {
    const mdPath = fromPublicPath(rootDir, mdPublic);
    if (mdPath && await fileExists(mdPath)) {
      return fs.readFile(mdPath, 'utf-8');
    }
  }

  const folderPath = fromPublicPath(rootDir, entry?.folder);
  if (!folderPath) return null;
  const distDir = path.join(folderPath, 'dist');
  if (!(await fileExists(distDir))) return null;
  const entries = await fs.readdir(distDir);
  const mdName = entries.find((name) => /\.md$/i.test(name));
  if (!mdName) return null;
  return fs.readFile(path.join(distDir, mdName), 'utf-8');
}

async function readGeneratedHtml(rootDir, entry, project) {
  if (entry?.mode === 'commercial' || entry?.proposalConfig) {
    const config = await loadProposalConfigSnapshot(rootDir, entry, project);
    if (config) {
      return proposalGenerator.renderProposalHtml(project, config).html;
    }
  }

  const htmlPublic = entry?.outputs?.fullDocumentHtml;
  if (htmlPublic && !String(htmlPublic).includes('/generated/')) {
    const htmlPath = fromPublicPath(rootDir, htmlPublic);
    if (htmlPath && await fileExists(htmlPath)) {
      return fs.readFile(htmlPath, 'utf-8');
    }
  }

  const folderPath = fromPublicPath(rootDir, entry?.folder);
  if (!folderPath) return null;
  const distDir = path.join(folderPath, 'dist');
  if (!(await fileExists(distDir))) return null;
  const entries = await fs.readdir(distDir);
  const htmlName = entries.find((name) => /\.html$/i.test(name) && name.toLowerCase().includes('proposta'));
  if (!htmlName) return null;
  return fs.readFile(path.join(distDir, htmlName), 'utf-8');
}

function priorityLabel(priority) {
  if (priority === 'high') return 'Alta';
  if (priority === 'low') return 'Baixa';
  return 'Media';
}

function buildFunctionalDescriptionForProposal(entry) {
  const parts = [];
  const shall = textOr(entry?.shall || entry?.description);
  const condition = textOr(entry?.condition);
  const measure = textOr(entry?.measure);
  const verification = textOr(entry?.verification);

  if (shall) parts.push(shall);
  if (condition) parts.push(`Condição: ${condition}`);
  if (measure) parts.push(`Medição: ${measure}`);
  if (verification) parts.push(`Verificação: ${verification}`);

  return parts.join(' ');
}

function normalizeStringArray(value) {
  return ensureArray(value)
    .map((entry) => String(entry).trim())
    .filter(Boolean);
}

function normalizeModuleName(value) {
  const direct = textOr(value);
  if (ARCHITECTURE_MODULES.includes(direct)) return direct;
  if (direct.toLowerCase() === 'integration') return 'Integrations';
  const normalized = normalizeArchitectureModuleToken(value);
  return normalized || DEFAULT_ARCHITECTURE_MODULE;
}

function normalizeSubmoduleName(value) {
  const raw = textOr(value);
  if (!raw) return '';
  return raw.replace(/\s+/g, ' ').trim();
}

function formatRequirementModuleLabel(requirement) {
  const moduleName = normalizeModuleName(requirement?.module);
  const submoduleName = normalizeSubmoduleName(requirement?.submodule);
  return submoduleName ? `${moduleName} / ${submoduleName}` : moduleName;
}

function normalizeArchitectureModuleToken(value) {
  const normalizedText = normalizeForCompare(value);
  if (!normalizedText) return null;
  const hasWord = (word) => new RegExp(`(^|\\s)${word}(\\s|$)`).test(normalizedText);

  if (
    normalizedText.includes('integration') ||
    normalizedText.includes('integracao') ||
    normalizedText.includes('integra') ||
    normalizedText.includes('oauth') ||
    normalizedText.includes('apple pay') ||
    normalizedText.includes('google pay') ||
    normalizedText.includes('mb way') ||
    normalizedText.includes('mbway') ||
    normalizedText.includes('payment gateway') ||
    normalizedText.includes('gateway') ||
    normalizedText.includes('fornecedor') ||
    normalizedText.includes('external') ||
    normalizedText.includes('terceiro') ||
    normalizedText.includes('mapa') ||
    normalizedText.includes('maps')
  ) {
    return 'Integrations';
  }

  if (
    normalizedText.includes('system') ||
    normalizedText.includes('sistema') ||
    normalizedText.includes('transversal') ||
    normalizedText.includes('cross module') ||
    normalizedText.includes('cross-module') ||
    normalizedText.includes('seguranca') ||
    normalizedText.includes('security') ||
    normalizedText.includes('auditoria') ||
    normalizedText.includes('audit') ||
    normalizedText.includes('sla') ||
    normalizedText.includes('disponibilidade') ||
    normalizedText.includes('performance') ||
    normalizedText.includes('escalabilidade') ||
    normalizedText.includes('compatibilidade') ||
    normalizedText.includes('conformidade') ||
    normalizedText.includes('pci') ||
    normalizedText.includes('gdpr') ||
    normalizedText.includes('rgpd')
  ) {
    return 'System';
  }

  if (
    normalizedText.includes('frontend') ||
    normalizedText.includes('front end') ||
    hasWord('ui') ||
    hasWord('ux') ||
    normalizedText.includes('client side') ||
    normalizedText.includes('cliente')
  ) {
    return 'Frontend';
  }

  if (
    normalizedText.includes('database') ||
    normalizedText.includes('base de dados') ||
    normalizedText.includes('banco de dados') ||
    normalizedText.includes('persistencia') ||
    normalizedText.includes('schema') ||
    normalizedText.includes('sql') ||
    normalizedText === 'db' ||
    normalizedText.includes('postgres')
  ) {
    return 'Database';
  }

  if (
    normalizedText.includes('backend') ||
    normalizedText.includes('back end') ||
    normalizedText.includes('api') ||
    normalizedText.includes('server') ||
    normalizedText.includes('servico')
  ) {
    return 'Backend';
  }

  return null;
}

function normalizeArchitectureModuleList(values) {
  const source = Array.isArray(values)
    ? values
    : String(values || '')
      .split(/[,\n;]/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  const output = [];
  const seen = new Set();
  for (const rawValue of source) {
    const trimmed = textOr(rawValue);
    const normalized = normalizeArchitectureModuleToken(trimmed)
      || (ARCHITECTURE_MODULES.includes(trimmed) ? trimmed : null);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(normalized);
  }
  return output;
}

function extractArchitectureModuleParts(input) {
  const rawModule = textOr(input?.module);
  const rawSubmodule = textOr(input?.submodule);

  if (!rawModule && !rawSubmodule) {
    return { module: DEFAULT_ARCHITECTURE_MODULE, submodule: '' };
  }

  if (rawSubmodule) {
    return {
      module: normalizeModuleName(rawModule || rawSubmodule),
      submodule: normalizeSubmoduleName(rawSubmodule),
    };
  }

  const split = rawModule.split(/[>:/|]/).map((entry) => entry.trim()).filter(Boolean);
  if (split.length > 1) {
    return {
      module: normalizeModuleName(split[0]),
      submodule: normalizeSubmoduleName(split.slice(1).join(' / ')),
    };
  }

  const commaSplit = rawModule.split(',').map((entry) => entry.trim()).filter(Boolean);
  if (commaSplit.length > 1) {
    const firstKnown = commaSplit.find((entry) => normalizeArchitectureModuleToken(entry));
    const moduleName = normalizeModuleName(firstKnown || commaSplit[0]);
    return { module: moduleName, submodule: '' };
  }

  const knownDirect = normalizeArchitectureModuleToken(rawModule) || (ARCHITECTURE_MODULES.includes(rawModule) ? rawModule : null);
  if (knownDirect) {
    return {
      module: knownDirect,
      submodule: '',
    };
  }

  return {
    module: DEFAULT_ARCHITECTURE_MODULE,
    submodule: normalizeSubmoduleName(rawModule),
  };
}

function normalizeForCompare(value) {
  return textOr(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeRequirementIdToken(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, '')
    .toUpperCase();
}

function normalizeRequirementIdList(value) {
  const flattened = [];
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (typeof entry === 'string' || typeof entry === 'number') {
        flattened.push(entry);
      } else if (entry && typeof entry === 'object') {
        flattened.push(entry.id || entry.requirementId || entry.link || entry.ref || '');
      }
    }
  } else {
    flattened.push(...String(value || '').split(/[,\n;]/));
  }

  const output = [];
  const seen = new Set();
  for (const rawEntry of flattened) {
    const token = normalizeRequirementIdToken(rawEntry);
    if (!token || seen.has(token)) continue;
    seen.add(token);
    output.push(token);
  }
  return output;
}

function normalizeStringListField(value) {
  if (Array.isArray(value)) {
    return normalizeStringArray(value);
  }
  if (typeof value === 'string') {
    return value
      .split('\n')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeQuestionStatus(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return QUESTION_STATUS_FLOW.includes(normalized) ? normalized : 'open';
}

function normalizeQuestionTargetRole(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (['cliente', 'client'].includes(normalized)) return 'client';
  if (['parceiro', 'partner'].includes(normalized)) return 'partner';
  if (['both', 'ambos', 'todos'].includes(normalized)) return 'both';
  return QUESTION_TARGET_FLOW.includes(normalized) ? normalized : 'client';
}

function normalizeQuestionCategory(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (['nfr', 'nonfunctional', 'non_functional'].includes(normalized)) return 'non_functional';
  if (['funcional', 'fr', 'functional_requirement'].includes(normalized)) return 'functional';
  if (['integrations', 'integration_api', 'api', 'connector'].includes(normalized)) return 'integration';
  if (['dados', 'db', 'database'].includes(normalized)) return 'data';
  if (['regra', 'rules', 'businessrules', 'business_rules'].includes(normalized)) return 'business_rule';
  if (['interface', 'usability'].includes(normalized)) return 'ux';
  if (['tempo', 'deadline', 'schedule'].includes(normalized)) return 'timeline';
  if (['preco', 'budget', 'cost'].includes(normalized)) return 'pricing';
  if (QUESTION_CATEGORY_FLOW.includes(normalized)) return normalized;
  return 'other';
}

function normalizeDeliveryStageId(value, fallback = 'requirements') {
  const stageId = textOr(value, fallback).toLowerCase();
  return deliveryOs.STAGE_ORDER.includes(stageId) ? stageId : fallback;
}

function normalizeMeetingImpactScope(value, fallback = 'requirements') {
  const scope = textOr(value, fallback).toLowerCase();
  const allowed = deliveryOs.MEETING_IMPACT_SCOPES.map((entry) => entry.id);
  return allowed.includes(scope) ? scope : fallback;
}

function normalizeClarificationQuestionRecord(raw) {
  const status = normalizeQuestionStatus(raw?.status);
  const askedAt = textOr(raw?.askedAt);
  const answer = textOr(raw?.answer);
  const answeredAt = textOr(raw?.answeredAt);
  return {
    id: textOr(raw?.id, `qst_${crypto.randomUUID()}`),
    question: textOr(raw?.question),
    context: textOr(raw?.context),
    targetRole: normalizeQuestionTargetRole(raw?.targetRole),
    category: normalizeQuestionCategory(raw?.category),
    priority: normalizePriority(raw?.priority),
    status,
    deliveryStageId: normalizeDeliveryStageId(raw?.deliveryStageId || raw?.stageId),
    dueDate: textOr(raw?.dueDate),
    linkedRequirementIds: normalizeRequirementIdList(raw?.linkedRequirementIds || raw?.relatedRequirementIds),
    answer,
    askedAt: status === 'sent' ? (askedAt || nowIso()) : askedAt,
    answeredAt: (status === 'answered' || status === 'resolved') && answer ? (answeredAt || nowIso()) : answeredAt,
    createdAt: textOr(raw?.createdAt, nowIso()),
    updatedAt: textOr(raw?.updatedAt, nowIso()),
    createdBy: textOr(raw?.createdBy),
    updatedBy: textOr(raw?.updatedBy),
  };
}

function normalizeClarificationQuestions(list) {
  return ensureArray(list)
    .map((entry) => normalizeClarificationQuestionRecord(entry))
    .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime());
}

function normalizeMeetingMinuteRecord(raw) {
  const impactScope = normalizeMeetingImpactScope(raw?.impactScope, 'requirements');
  const scopeMeta = deliveryOs.MEETING_IMPACT_SCOPES.find((entry) => entry.id === impactScope);
  const stageOrder = deliveryOs.STAGE_ORDER || [];
  const targetStageId = textOr(raw?.targetStageId, scopeMeta?.stageId || impactScope);

  // Multi-phase impacts (AI-classified). Atas are a global field — they can
  // touch several phases at once. Migrate legacy single-phase records.
  let impactedStageIds = normalizeStringArray(raw?.impactedStageIds)
    .filter((id) => stageOrder.includes(id));
  if (!impactedStageIds.length && stageOrder.includes(targetStageId)) {
    impactedStageIds = [targetStageId];
  }

  const decisions = ensureArray(raw?.decisions).map((d) => {
    if (typeof d === 'string') return { text: d, stageIds: [], type: 'decision' };
    return {
      text: textOr(d?.text || d?.decision),
      stageIds: normalizeStringArray(d?.stageIds).filter((id) => stageOrder.includes(id)),
      type: textOr(d?.type, 'decision'),
    };
  }).filter((d) => d.text);

  return {
    id: textOr(raw?.id, `min_${crypto.randomUUID()}`),
    title: textOr(raw?.title, 'Reunião com cliente'),
    meetingDate: textOr(raw?.meetingDate),
    rawText: typeof raw?.rawText === 'string' ? raw.rawText : String(raw?.rawText || ''),
    impactScope,
    targetStageId,
    impactedStageIds,
    impactedRequirementIds: normalizeStringArray(raw?.impactedRequirementIds),
    decisions,
    summaryMarkdown: textOr(raw?.summaryMarkdown),
    openQuestions: ensureArray(raw?.openQuestions)
      .map((q) => textOr(typeof q === 'string' ? q : q?.text || q?.question))
      .filter(Boolean),
    classificationStatus: textOr(raw?.classificationStatus, 'pending'),
    classifiedAt: textOr(raw?.classifiedAt),
    createdAt: textOr(raw?.createdAt, nowIso()),
    createdBy: textOr(raw?.createdBy),
  };
}

function normalizeMeetingMinutes(minutes) {
  return ensureArray(minutes)
    .map((entry) => normalizeMeetingMinuteRecord(entry))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

function normalizeMinutesPromptRecord(raw) {
  return {
    id: textOr(raw?.id, `mpr_${crypto.randomUUID()}`),
    objective: textOr(raw?.objective, 'requirements_update'),
    minuteIds: normalizeStringArray(raw?.minuteIds),
    prompt: textOr(raw?.prompt),
    createdAt: textOr(raw?.createdAt, nowIso()),
    createdBy: textOr(raw?.createdBy),
  };
}

function normalizeMinutesPromptHistory(history) {
  return ensureArray(history)
    .map((entry) => normalizeMinutesPromptRecord(entry))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

function normalizeDeliveryLevel(level) {
  const normalized = textOr(level, 'standard').toLowerCase();
  return DELIVERY_LEVELS.includes(normalized) ? normalized : 'standard';
}

function normalizeProjectStages(stages, deliveryLevel = 'standard') {
  const level = normalizeDeliveryLevel(deliveryLevel);
  const byId = new Map(
    ensureArray(stages)
      .map((entry) => ({
        id: textOr(entry?.id).toLowerCase(),
        label: textOr(entry?.label),
        status: textOr(entry?.status, 'not_started'),
        required: entry?.required !== false,
        requiresHumanApproval: entry?.requiresHumanApproval === true,
      }))
      .filter((entry) => entry.id)
      .map((entry) => [entry.id, entry])
  );

  return DELIVERY_STAGE_FLOW.map((base) => {
    const current = byId.get(base.id) || {};
    const requiredByLevel = base.id !== 'operations' || level === 'complete';
    return {
      id: base.id,
      label: current.label || base.label,
      status: ['not_started', 'in_progress', 'pending_review', 'approved', 'blocked', 'done'].includes(current.status)
        ? current.status
        : 'not_started',
      required: current.required !== undefined ? current.required : requiredByLevel,
      requiresHumanApproval: current.requiresHumanApproval === true
        || ['requirements', 'architecture', 'validation', 'delivery'].includes(base.id),
    };
  });
}

function normalizeArtifactRecord(raw) {
  const type = textOr(raw?.type, 'other').toLowerCase();
  const status = textOr(raw?.status, 'draft').toLowerCase();
  return {
    id: textOr(raw?.id, `art_${crypto.randomUUID()}`),
    type: ARTIFACT_TYPES.includes(type) ? type : 'other',
    name: textOr(raw?.name),
    description: textOr(raw?.description),
    bodyMarkdown: textOr(raw?.bodyMarkdown || raw?.description),
    status: ['draft', 'in_progress', 'pending_review', 'approved', 'deprecated'].includes(status)
      ? status
      : 'draft',
    stageId: textOr(raw?.stageId, 'requirements').toLowerCase(),
    version: numberOr(raw?.version, 1),
    relatedRequirementIds: normalizeStringArray(raw?.relatedRequirementIds),
    metadata: raw?.metadata && typeof raw.metadata === 'object' && !Array.isArray(raw.metadata)
      ? raw.metadata
      : {},
    createdAt: textOr(raw?.createdAt, nowIso()),
    updatedAt: textOr(raw?.updatedAt, nowIso()),
    createdBy: textOr(raw?.createdBy),
    updatedBy: textOr(raw?.updatedBy),
    provenance: deliveryOsPlatform.normalizeArtifactProvenance(raw?.provenance),
  };
}

function normalizeArtifacts(list) {
  return ensureArray(list)
    .map((entry) => normalizeArtifactRecord(entry))
    .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime());
}

function buildRequirementIdSet(requirements) {
  const ids = new Set();
  for (const entry of ensureArray(requirements)) {
    const id = String(entry?.id || '').trim().replace(/\s+/g, '').toUpperCase();
    if (id) ids.add(id);
  }
  return ids;
}

function hasTraceableNode(requirements, artifacts, nodeType, nodeId, project, requirementIdSet) {
  const targetId = textOr(nodeId);
  const type = textOr(nodeType, 'requirement').toLowerCase();
  if (!targetId) return false;

  if (type === 'artifact') {
    return normalizeArtifacts(artifacts).some((entry) => entry.id === targetId);
  }

  if (type === 'capability') {
    return ensureArray(project?.capabilities).some((entry) => entry.id === targetId);
  }
  if (type === 'cluster') {
    return ensureArray(project?.requirementClusters).some((entry) => entry.id === targetId);
  }
  if (type === 'client_request') {
    return ensureArray(project?.clientRequests).some((entry) => entry.id === targetId);
  }
  if (type === 'business_objective') {
    return ensureArray(project?.businessObjectives).some((entry) => entry.id === targetId);
  }

  const normalizedTarget = targetId.replace(/\s+/g, '').toUpperCase();
  const idSet = requirementIdSet || buildRequirementIdSet(requirements);

  if (['stakeholder_requirement', 'technical_requirement', 'requirement'].includes(type)) {
    return idSet.has(normalizedTarget);
  }

  if (['architecture_object', 'data_entity', 'api_endpoint', 'test_case', 'deliverable', 'monitoring_signal'].includes(type)) {
    return normalizeArtifacts(artifacts).some((entry) => entry.id === targetId || entry.name === targetId);
  }

  return idSet.has(normalizedTarget);
}

function normalizeTraceNodeType(rawType) {
  const type = textOr(rawType, 'requirement').toLowerCase();
  const allowed = new Set([
    'requirement', 'artifact', 'client_request', 'business_objective', 'capability', 'cluster',
    'stakeholder_requirement', 'technical_requirement', 'architecture_object', 'data_entity',
    'api_endpoint', 'test_case', 'deliverable', 'monitoring_signal',
  ]);
  if (allowed.has(type)) return type;
  return type === 'artifact' ? 'artifact' : 'requirement';
}

function normalizeTraceLinkRecord(raw, requirements, artifacts, project, requirementIdSet) {
  const relationshipType = textOr(raw?.relationshipType, 'depends_on').toLowerCase();
  const sourceType = normalizeTraceNodeType(raw?.sourceType);
  const targetType = normalizeTraceNodeType(raw?.targetType);

  const sourceId = textOr(raw?.sourceId);
  const targetId = textOr(raw?.targetId);
  if (!hasTraceableNode(requirements, artifacts, sourceType, sourceId, project, requirementIdSet)) {
    if (!raw?.autoDerived) {
      return {
        id: textOr(raw?.id, `trc_${crypto.randomUUID()}`),
        sourceType,
        sourceId: '',
        targetType,
        targetId,
        relationshipType: TRACE_RELATIONSHIP_TYPES.includes(relationshipType) ? relationshipType : 'depends_on',
        confidence: Math.max(0, Math.min(1, numberOr(raw?.confidence, 0.8))),
        validatedByHuman: raw?.validatedByHuman === true,
        autoDerived: raw?.autoDerived === true,
        createdAt: textOr(raw?.createdAt, nowIso()),
        createdBy: textOr(raw?.createdBy),
      };
    }
  }
  if (!hasTraceableNode(requirements, artifacts, targetType, targetId, project, requirementIdSet)) {
    if (!raw?.autoDerived) {
      return {
        id: textOr(raw?.id, `trc_${crypto.randomUUID()}`),
        sourceType,
        sourceId,
        targetType,
        targetId: '',
        relationshipType: TRACE_RELATIONSHIP_TYPES.includes(relationshipType) ? relationshipType : 'depends_on',
        confidence: Math.max(0, Math.min(1, numberOr(raw?.confidence, 0.8))),
        validatedByHuman: raw?.validatedByHuman === true,
        autoDerived: raw?.autoDerived === true,
        createdAt: textOr(raw?.createdAt, nowIso()),
        createdBy: textOr(raw?.createdBy),
      };
    }
  }

  return {
    id: textOr(raw?.id, `trc_${crypto.randomUUID()}`),
    sourceType,
    sourceId,
    targetType,
    targetId,
    relationshipType: TRACE_RELATIONSHIP_TYPES.includes(relationshipType) ? relationshipType : 'depends_on',
    confidence: Math.max(0, Math.min(1, numberOr(raw?.confidence, 0.8))),
    validatedByHuman: raw?.validatedByHuman === true,
    autoDerived: raw?.autoDerived === true,
    createdAt: textOr(raw?.createdAt, nowIso()),
    createdBy: textOr(raw?.createdBy),
  };
}

function normalizeTraceLinks(links, requirements, artifacts, project, requirementIdSet) {
  const idSet = requirementIdSet || buildRequirementIdSet(requirements);
  const map = new Map();
  for (const entry of ensureArray(links)) {
    const normalized = normalizeTraceLinkRecord(entry, requirements, artifacts, project, idSet);
    if (!normalized.sourceId || !normalized.targetId) continue;
    const dedupeKey = `${normalized.sourceType}:${normalized.sourceId}|${normalized.relationshipType}|${normalized.targetType}:${normalized.targetId}`;
    if (!map.has(dedupeKey)) {
      map.set(dedupeKey, normalized);
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

function normalizeApprovalRecord(raw) {
  return {
    id: textOr(raw?.id, `apr_${crypto.randomUUID()}`),
    stageId: textOr(raw?.stageId),
    status: ['pending', 'approved', 'changes_requested', 'rejected'].includes(textOr(raw?.status).toLowerCase())
      ? textOr(raw?.status).toLowerCase()
      : 'pending',
    note: textOr(raw?.note),
    requestedBy: textOr(raw?.requestedBy),
    reviewedBy: textOr(raw?.reviewedBy),
    createdAt: textOr(raw?.createdAt, nowIso()),
    updatedAt: textOr(raw?.updatedAt, nowIso()),
  };
}

function normalizeApprovals(list) {
  return ensureArray(list)
    .map((entry) => normalizeApprovalRecord(entry))
    .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime());
}

function normalizeImpactReportRecord(raw) {
  return {
    id: textOr(raw?.id, `imp_${crypto.randomUUID()}`),
    sourceType: textOr(raw?.sourceType, 'requirement').toLowerCase() === 'artifact' ? 'artifact' : 'requirement',
    sourceId: textOr(raw?.sourceId),
    includeUpstream: raw?.includeUpstream === true,
    impacted: ensureArray(raw?.impacted).map((entry) => ({
      nodeType: textOr(entry?.nodeType, 'requirement').toLowerCase() === 'artifact' ? 'artifact' : 'requirement',
      id: textOr(entry?.id),
      viaRelationship: textOr(entry?.viaRelationship),
      direction: textOr(entry?.direction, 'downstream'),
    })).filter((entry) => entry.id),
    summary: textOr(raw?.summary),
    generatedAt: textOr(raw?.generatedAt, nowIso()),
    generatedBy: textOr(raw?.generatedBy),
  };
}

function normalizeImpactReports(list) {
  return ensureArray(list)
    .map((entry) => normalizeImpactReportRecord(entry))
    .sort((a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime());
}

function calculateTraceImpact(traceLinks, sourceType, sourceId, includeUpstream) {
  const edges = ensureArray(traceLinks)
    .map((edge) => ({
      sourceType: textOr(edge?.sourceType, 'requirement').toLowerCase() === 'artifact' ? 'artifact' : 'requirement',
      sourceId: textOr(edge?.sourceId),
      targetType: textOr(edge?.targetType, 'requirement').toLowerCase() === 'artifact' ? 'artifact' : 'requirement',
      targetId: textOr(edge?.targetId),
      relationshipType: textOr(edge?.relationshipType, 'depends_on'),
    }))
    .filter((edge) => edge.sourceId && edge.targetId);
  const makeKey = (nodeType, id) => `${nodeType}:${id}`;
  const outgoing = new Map();
  const incoming = new Map();

  for (const edge of edges) {
    const fromKey = makeKey(edge.sourceType, edge.sourceId);
    const toKey = makeKey(edge.targetType, edge.targetId);
    if (!outgoing.has(fromKey)) outgoing.set(fromKey, []);
    if (!incoming.has(toKey)) incoming.set(toKey, []);
    outgoing.get(fromKey).push(edge);
    incoming.get(toKey).push(edge);
  }

  const rootKey = makeKey(sourceType === 'artifact' ? 'artifact' : 'requirement', sourceId);
  const queue = [{ key: rootKey, direction: 'downstream' }];
  const seen = new Set([rootKey]);
  const impacted = [];

  while (queue.length) {
    const current = queue.shift();
    const currentOutgoing = outgoing.get(current.key) || [];
    for (const edge of currentOutgoing) {
      const nextKey = makeKey(edge.targetType, edge.targetId);
      if (seen.has(nextKey)) continue;
      seen.add(nextKey);
      queue.push({ key: nextKey, direction: 'downstream' });
      impacted.push({
        nodeType: edge.targetType,
        id: edge.targetId,
        viaRelationship: edge.relationshipType,
        direction: 'downstream',
      });
    }

    if (!includeUpstream) continue;
    const currentIncoming = incoming.get(current.key) || [];
    for (const edge of currentIncoming) {
      const prevKey = makeKey(edge.sourceType, edge.sourceId);
      if (seen.has(prevKey)) continue;
      seen.add(prevKey);
      queue.push({ key: prevKey, direction: 'upstream' });
      impacted.push({
        nodeType: edge.sourceType,
        id: edge.sourceId,
        viaRelationship: edge.relationshipType,
        direction: 'upstream',
      });
    }
  }

  return impacted;
}

function buildMinutesUpdatePrompt(project, selectedMinutes, objective, extraInstructions) {
  const projectName = textOr(project?.name, 'Projeto');
  const clientName = textOr(project?.clientName, 'Cliente');
  const requirements = ensureArray(project?.requirements).map((entry) => normalizeRequirementRecord(entry));
  const clarificationQuestions = normalizeClarificationQuestions(project?.clarificationQuestions)
    .filter((entry) => ['open', 'sent', 'answered', 'resolved', 'blocked'].includes(entry.status))
    .slice(0, 40)
    .map((entry) => ({
      id: entry.id,
      question: entry.question,
      context: entry.context,
      status: entry.status,
      targetRole: entry.targetRole,
      category: entry.category,
      linkedRequirementIds: entry.linkedRequirementIds,
      answer: entry.answer,
      answeredAt: entry.answeredAt,
    }));
  const shortRequirements = requirements.slice(0, 80).map((entry) => ({
    id: entry.id,
    type: entry.type,
    title: entry.title,
    module: normalizeModuleName(entry.module),
    submodule: normalizeSubmoduleName(entry.submodule),
    status: entry.status,
    priority: entry.priority,
    phase: entry.phase,
  }));
  const summary = normalizeSummary(project?.summary);

  const minutesBlock = selectedMinutes
    .map((minute, idx) => {
      const header = `Ata ${idx + 1} | id=${minute.id} | data=${minute.meetingDate || 'N/A'} | título=${minute.title}`;
      return `${header}\n${minute.rawText}`;
    })
    .join('\n\n--------------------\n\n');

  const currentSnapshot = JSON.stringify({
    summary,
    risks: normalizeStringArray(project?.risks),
    assumptions: normalizeStringArray(project?.assumptions),
    requirements: shortRequirements,
    clarificationQuestions,
    architectureModules: ARCHITECTURE_MODULES,
  }, null, 2);

  return `
Tu és um analista de requisitos a preparar uma atualização incremental do projeto "${projectName}" (cliente "${clientName}").

Objetivo da atualização:
${objective}

Regras obrigatórias:
1) Trabalha apenas com alterações incrementais (add/update/remove), não reescrevas tudo.
2) Mantém módulos de arquitetura determinísticos: Frontend, Backend, Database, System, Integrations.
   Usa System para requisitos transversais/cross-module e Integrations para fornecedores externos, OAuth, pagamentos, mapas e conectores.
3) Quando criares novos requisitos, inclui módulo e submodule.
4) Preserva texto de requisitos já aprovados, a menos que a ata peça mudança explícita.
5) Tudo que ficou ambiguo deve ir para "clarifications".
6) Se algo foi removido de escopo, usar removeRequirements com reason claro.
7) Usa as respostas das perguntas de clarificação como fonte de verdade para atualizar requisitos ligados.
8) Se uma pergunta respondida cria uma nova regra, cria um requisito novo e relaciona-o com IDs existentes quando possível.
9) Responde apenas com JSON válido.

Formato de saída:
{
  "projectUpdates": {
    "description": "string opcional",
    "summary": {
      "businessContext": "opcional",
      "goalsAdd": ["..."],
      "goalsRemove": ["..."],
      "scopeInPlainLanguage": "opcional",
      "solutionOverview": "opcional"
    },
    "risksAdd": ["..."],
    "risksRemove": ["..."],
    "assumptionsAdd": ["..."],
    "assumptionsRemove": ["..."]
  },
  "addRequirements": [
    {
      "type": "stakeholder|functional|non_functional|test_case|undefined|out_of_scope",
      "title": "...",
      "need": "...",
      "shall": "...",
      "condition": "...",
      "measure": "...",
      "rationale": "...",
      "verification": "...",
      "priority": "high|medium|low",
      "status": "draft|needs_clarification|approved|planned|in_development|validated|delivered|excluded",
      "phase": "Fase 1|Fase 2|Fase 3|Backlog",
      "module": "Frontend|Backend|Database|System|Integrations",
      "submodule": "..."
    }
  ],
  "updateRequirements": [
    {
      "id": "RF-01",
      "changes": {
        "title": "opcional",
        "need": "opcional",
        "shall": "opcional",
        "condition": "opcional",
        "measure": "opcional",
        "rationale": "opcional",
        "verification": "opcional",
        "priority": "opcional",
        "status": "opcional",
        "phase": "opcional",
        "module": "Frontend|Backend|Database|System|Integrations",
        "submodule": "opcional"
      },
      "reason": "porque mudar"
    }
  ],
  "removeRequirements": [
    {
      "id": "RF-99",
      "reason": "porque remover"
    }
  ],
  "clarifications": ["perguntas objetivas que faltam validar"]
}

Notas para aplicação no sistema:
- addRequirements cria novos requisitos.
- updateRequirements altera requisitos existentes pelo id.
- removeRequirements marca requisitos como excluded mantendo rastreabilidade.
- clarifications cria novas perguntas abertas no projeto.

Estado atual resumido:
${currentSnapshot}

Atas selecionadas (texto raw):
"""
${minutesBlock}
"""

Instruções adicionais:
${extraInstructions || 'Sem instruções adicionais.'}
`.trim();
}

function textOr(value, fallback = '') {
  const text = String(value === undefined || value === null ? '' : value).trim();
  return text || fallback;
}

function sanitizeFileName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_\-.]/g, '');
}

function numberOr(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function nowIso() {
  return new Date().toISOString();
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(stored, candidate) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, originalHash] = stored.split(':');
  const hash = crypto.scryptSync(String(candidate), salt, 64).toString('hex');

  const a = Buffer.from(originalHash, 'hex');
  const b = Buffer.from(hash, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

async function fileExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function readJson(target) {
  const raw = await fs.readFile(target, 'utf-8');
  return JSON.parse(raw);
}

async function writeJson(target, value, options = {}) {
  const dir = path.dirname(target);
  await fs.mkdir(dir, { recursive: true });
  const tempPath = `${target}.${process.pid}.${Date.now()}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  const body = options.compact
    ? `${JSON.stringify(value)}\n`
    : `${JSON.stringify(value, null, 2)}\n`;
  try {
    await fs.writeFile(tempPath, body, 'utf-8');
    await fs.rename(tempPath, target);
  } catch (error) {
    try {
      await fs.unlink(tempPath);
    } catch {
      // ignore cleanup errors
    }
    throw error;
  }
}

function expressStaticSafe(platformDir) {
  return (req, res, next) => {
    const cleanPath = String(req.path || '').replace(/^\/+/, '');
    const resolved = path.resolve(platformDir, 'public', cleanPath);
    const allowedRoot = path.resolve(platformDir, 'public');

    if (!resolved.startsWith(allowedRoot)) {
      return res.status(403).send('Forbidden');
    }

    return res.sendFile(resolved, { headers: { 'Cache-Control': 'no-cache' } }, (err) => {
      if (err) next();
    });
  };
}

module.exports = { registerRequirementsPlatform };
