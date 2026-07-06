const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

const blobStore = require('../lib/blob-store');
const { createSqliteStore } = require('../lib/sqlite-store');
const { createSplitStoreLayer } = require('../lib/split-store');
const { migrateToHybridStorage } = require('../lib/hybrid-migrate');

async function writeJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(data)}\n`, 'utf8');
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

function normalizeOneProject(project) {
  return {
    ...project,
    requirements: Array.isArray(project.requirements) ? project.requirements : [],
    promptRuns: Array.isArray(project.promptRuns) ? project.promptRuns : [],
    documents: Array.isArray(project.documents) ? project.documents : [],
    versionSnapshots: Array.isArray(project.versionSnapshots) ? project.versionSnapshots : [],
  };
}

describe('hybrid storage migration', () => {
  let tmpDir;

  before(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'yl-hybrid-'));
  });

  after(async () => {
    if (tmpDir) await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('moves requirements to sqlite and prompt bodies to blob files', async () => {
    const dataDir = path.join(tmpDir, 'case-a');
    const projectId = 'prj_hybrid_test';
    const runId = 'prun_test_1';
    const nowIso = () => new Date().toISOString();

    await writeJson(path.join(dataDir, 'store-index.json'), {
      version: 1,
      meta: { schemaVersion: 3, storageLayout: 'split-v1' },
      users: [{ id: 'usr_1', name: 'Admin', email: 'a@test.local', role: 'super_admin', isActive: true }],
      activity: [{ id: 'act_1', at: nowIso(), action: 'seed', details: {} }],
      projects: [{
        id: projectId,
        name: 'Hybrid Test',
        requirementCount: 1,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      }],
    });

    await writeJson(path.join(dataDir, 'projects', `${projectId}.json`), {
      id: projectId,
      name: 'Hybrid Test',
      requirements: [{ id: 'FR-01', type: 'functional', title: 'Login', updatedAt: nowIso() }],
      promptRuns: [{
        id: runId,
        agentType: 'prompt_builder',
        status: 'awaiting_output',
        fullPrompt: 'x'.repeat(12000),
        rawOutput: '',
        createdAt: nowIso(),
      }],
      documents: [],
      versionSnapshots: [],
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });

    const storeLayer = createSplitStoreLayer({
      dataDir,
      storePath: path.join(dataDir, 'store.json'),
      readJson,
      writeJson,
      nowIso,
      withStoreLock: async (task) => task(),
    });

    const sqliteStore = createSqliteStore({ dataDir });
    const result = await migrateToHybridStorage({
      dataDir,
      storeLayer,
      sqliteStore,
      blobStore,
      readJson,
      writeJson,
      normalizeOneProject,
      nowIso,
    });

    assert.equal(result.migrated, true);
    assert.equal(result.projectsMigrated, 1);
    const index = await readJson(path.join(dataDir, 'store-index.json'));
    assert.equal(index.meta.storageLayout, 'hybrid-v2');
    assert.equal(sqliteStore.loadRequirements(projectId).length, 1);

    const disk = await readJson(path.join(dataDir, 'projects', `${projectId}.json`));
    assert.equal(disk.storageHybrid, true);
    assert.equal(disk.requirementsInDb, true);
    assert.equal(disk.requirements.length, 0);
    assert.equal(disk.requirementCount, 1);
    assert.equal(disk.promptRuns[0].blobStored, true);
    assert.equal(disk.promptRuns[0].fullPrompt, undefined);

    const hydrated = await blobStore.hydratePromptRun(disk.promptRuns[0], projectId, dataDir, readJson);
    assert.equal(hydrated.fullPrompt.length, 12000);

    assert.equal(index.users.length, 0);
  });
});
