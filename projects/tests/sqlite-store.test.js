const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

const { createSqliteStore } = require('../lib/sqlite-store');

describe('sqlite requirement store', () => {
  let tmpDir;

  before(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'yl-sqlite-store-'));
  });

  after(async () => {
    if (tmpDir) await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('stores requirements as queryable rows and preserves relation payloads', () => {
    const store = createSqliteStore({ dataDir: path.join(tmpDir, 'case-a') });
    const projectId = 'prj_relations';
    const requirements = [
      {
        id: 'STK-01',
        type: 'stakeholder',
        title: 'Buy a city pass',
        status: 'draft',
        moduleTags: ['Frontend'],
      },
      {
        id: 'FR-01',
        type: 'functional',
        title: 'Checkout',
        module: 'Backend',
        phase: 'Phase 1',
        deliveryStageId: 'requirements',
        parentId: 'STK-01',
        parentLinkType: 'decomposes_from',
        stakeholderRequirementLink: 'STK-01',
        hierarchyLinks: [{ role: 'parent', targetId: 'STK-01', linkType: 'decomposes_from' }],
        relatedRequirementIds: ['RNF-01'],
        moduleTags: ['Backend', 'Database'],
        vLevel: 1,
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'RNF-01',
        type: 'non_functional',
        title: 'Payment auditability',
        parentId: 'FR-01',
        parentLinkType: 'constrains',
        hierarchyLinks: [{ role: 'parent', targetId: 'FR-01', linkType: 'constrains' }],
        vLevel: 2,
      },
    ];

    store.saveRequirements(projectId, requirements);

    assert.equal(store.verifyRequirementsSaved(projectId, requirements), true);
    assert.deepEqual(store.loadRequirements(projectId), requirements);

    const backendRows = store.loadRequirementRows(projectId, { module: 'Backend' });
    assert.equal(backendRows.length, 1);
    assert.equal(backendRows[0].id, 'FR-01');
    assert.deepEqual(backendRows[0].moduleTags, ['Backend', 'Database']);

    const linksToStakeholder = store.loadRequirementLinks(projectId, { targetReqId: 'STK-01' });
    assert.equal(linksToStakeholder.length, 1);
    assert.deepEqual(
      linksToStakeholder.map((link) => link.sourceField).sort(),
      ['parentId'],
    );

    const stats = store.getRequirementStats(projectId);
    assert.equal(stats.total, 3);
    assert.equal(stats.links, 3);
    store.close();
  });

  it('upgrades old requirement tables without losing existing JSON rows', () => {
    const dataDir = path.join(tmpDir, 'case-b');
    const dbPath = path.join(dataDir, 'platform.db');
    require('fs').mkdirSync(dataDir, { recursive: true });

    // eslint-disable-next-line global-require, import/no-extraneous-dependencies
    const Database = require('better-sqlite3');
    const db = new Database(dbPath);
    db.exec(`
      CREATE TABLE store_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT INTO store_meta (key, value) VALUES ('schema_version', '1');
      CREATE TABLE requirements (
        project_id TEXT NOT NULL,
        req_id TEXT NOT NULL,
        data TEXT NOT NULL,
        updated_at TEXT,
        PRIMARY KEY (project_id, req_id)
      );
    `);
    db.prepare(`
      INSERT INTO requirements (project_id, req_id, data, updated_at)
      VALUES (?, ?, ?, ?)
    `).run(
      'prj_old',
      'FR-01',
      JSON.stringify({ id: 'FR-01', type: 'functional', title: 'Legacy row' }),
      '2026-01-01T00:00:00.000Z',
    );
    db.close();

    const store = createSqliteStore({ dataDir });
    assert.deepEqual(store.loadRequirements('prj_old'), [
      { id: 'FR-01', type: 'functional', title: 'Legacy row' },
    ]);

    store.saveRequirements('prj_old', [
      { id: 'STK-01', type: 'stakeholder', title: 'Need' },
      { id: 'FR-01', type: 'functional', title: 'Legacy row', parentId: 'STK-01' },
    ]);

    assert.equal(store.getRequirementStats('prj_old').total, 2);
    assert.equal(store.loadRequirementLinks('prj_old', { targetReqId: 'STK-01' }).length, 1);
    store.close();
  });

  it('preserves duplicate requirement IDs instead of dropping rows', () => {
    const store = createSqliteStore({ dataDir: path.join(tmpDir, 'case-c') });
    const projectId = 'prj_duplicates';
    const requirements = [
      { id: 'FR-01', type: 'functional', title: 'First copy' },
      { id: 'FR-01', type: 'functional', title: 'Second copy' },
    ];

    store.saveRequirements(projectId, requirements);

    assert.equal(store.verifyRequirementsSaved(projectId, requirements), true);
    assert.deepEqual(store.loadRequirements(projectId), requirements);

    const rows = store.loadRequirementRows(projectId);
    assert.equal(rows.length, 2);
    assert.deepEqual(rows.map((row) => row.id), ['FR-01', 'FR-01']);
    assert.deepEqual(rows.map((row) => row.storageId), ['FR-01', 'FR-01#DUP-2']);
    store.close();
  });
});
