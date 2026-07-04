const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

const { createSqliteStore } = require('../lib/sqlite-store');
const { repairProjectRequirements, recoverRequirementsFromSources } = require('../lib/hybrid-repair');
const { projectFileName } = require('../lib/split-store');

async function writeJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(data)}\n`, 'utf8');
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

describe('hybrid requirement repair', () => {
  let tmpDir;

  before(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'yl-repair-'));
  });

  after(async () => {
    if (tmpDir) await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('recovers requirements from monolith backup when hybrid json is empty', async () => {
    const dataDir = path.join(tmpDir, 'repair-a');
    const projectId = 'prj_citypass_test';
    const requirements = [
      { id: 'STK-01', type: 'stakeholder', title: 'Need', updatedAt: '2026-01-01T00:00:00.000Z' },
      { id: 'FR-01', type: 'functional', title: 'Login', parentId: 'STK-01', updatedAt: '2026-01-01T00:00:00.000Z' },
    ];

    await writeJson(path.join(dataDir, 'store.json.bak'), {
      projects: [{
        id: projectId,
        name: 'City Pass',
        requirements,
      }],
    });

    await writeJson(path.join(dataDir, 'projects', projectFileName(projectId)), {
      id: projectId,
      name: 'City Pass',
      requirements: [],
      storageHybrid: true,
      requirementsInDb: true,
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    const sqliteStore = createSqliteStore({ dataDir });
    const project = await readJson(path.join(dataDir, 'projects', projectFileName(projectId)));

    const repair = await repairProjectRequirements({
      project,
      indexEntry: { id: projectId, requirementCount: 2 },
      dataDir,
      storePath: path.join(dataDir, 'store.json'),
      sqliteStore,
      readJson,
      writeJson,
    });

    assert.equal(repair.repaired, true);
    assert.equal(repair.count, 2);
    assert.equal(sqliteStore.loadRequirements(projectId).length, 2);
    assert.equal(project.requirements.length, 2);
  });

  it('finds requirements in monolith via recoverRequirementsFromSources', async () => {
    const dataDir = path.join(tmpDir, 'repair-b');
    const projectId = 'prj_x';
    await writeJson(path.join(dataDir, 'store.json.bak'), {
      projects: [{ id: projectId, requirements: [{ id: 'FR-01', type: 'functional', title: 'A' }] }],
    });

    const recovered = await recoverRequirementsFromSources({
      dataDir,
      projectId,
      readJson,
      storePath: path.join(dataDir, 'store.json'),
    });

    assert.equal(recovered.requirements.length, 1);
    assert.match(recovered.source, /store\.json\.bak$/);
  });
});
