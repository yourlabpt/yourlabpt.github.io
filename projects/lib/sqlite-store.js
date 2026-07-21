/**
 * SQLite store for relational / queryable data (users, activity, requirements).
 * Large AI text blobs stay in blob-store files.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

const SCHEMA_VERSION = 4;

function textOr(value, fallback = '') {
  const v = value === null || value === undefined ? '' : String(value).trim();
  return v || fallback;
}

function jsonText(value, fallback) {
  return JSON.stringify(value === undefined ? fallback : value);
}

function normalizeReqId(value) {
  return String(value || '').trim().replace(/\s+/g, '').toUpperCase();
}

function ensureColumn(database, tableName, columnName, definition) {
  const columns = database.prepare(`PRAGMA table_info(${tableName})`).all();
  if (columns.some((col) => col.name === columnName)) return;
  database.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
}

function requirementLinksForDb(req, storageReqId) {
  const links = [];
  const sourceReqId = storageReqId || normalizeReqId(req?.id);
  if (!sourceReqId) return links;

  function add(targetId, role, linkType, sourceField, sequence = links.length) {
    const normalizedTargetId = normalizeReqId(targetId);
    if (!normalizedTargetId) return;
    const normalizedRole = textOr(role, 'related');
    const normalizedLinkType = textOr(linkType, 'related');
    const duplicate = links.some((link) => (
      link.targetReqId === normalizedTargetId
      && link.role === normalizedRole
      && link.linkType === normalizedLinkType
    ));
    if (duplicate) return;
    links.push({
      sourceReqId,
      targetReqId: normalizedTargetId,
      role: normalizedRole,
      linkType: normalizedLinkType,
      sourceField: textOr(sourceField, 'unknown'),
      sequence,
    });
  }

  if (req.parentId) {
    add(req.parentId, 'parent', req.parentLinkType || 'decomposes_from', 'parentId');
  }
  if (req.stakeholderRequirementLink) {
    add(req.stakeholderRequirementLink, 'parent', 'decomposes_from', 'stakeholderRequirementLink');
  }
  if (req.linkedFunctionalRequirement) {
    add(req.linkedFunctionalRequirement, 'parent', 'verified_by', 'linkedFunctionalRequirement');
  }

  ensureArray(req.hierarchyLinks).forEach((link, index) => {
    add(
      link?.targetId,
      link?.role || 'parent',
      link?.linkType || (link?.role === 'peer' ? 'peer' : 'decomposes_from'),
      'hierarchyLinks',
      index,
    );
  });

  ensureArray(req.relatedRequirementIds).forEach((targetId, index) => {
    add(targetId, 'related', 'related', 'relatedRequirementIds', index);
  });

  return links;
}

function createSqliteStore({ dataDir }) {
  const dbPath = path.join(dataDir, 'platform.db');
  let db = null;
  let enabled = false;

  function getDb() {
    if (!db) {
      // eslint-disable-next-line global-require, import/no-extraneous-dependencies
      const Database = require('better-sqlite3');
      fs.mkdirSync(dataDir, { recursive: true });
      db = new Database(dbPath);
      db.pragma('journal_mode = WAL');
      db.pragma('synchronous = NORMAL');
      db.pragma('foreign_keys = ON');
      initSchema(db);
      enabled = true;
    }
    return db;
  }

  function initSchema(database) {
    database.exec(`
      CREATE TABLE IF NOT EXISTS store_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS activity (
        id TEXT PRIMARY KEY,
        at TEXT NOT NULL,
        actor_user_id TEXT,
        project_id TEXT,
        action TEXT,
        details TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_activity_project ON activity(project_id);
      CREATE INDEX IF NOT EXISTS idx_activity_at ON activity(at DESC);

      CREATE TABLE IF NOT EXISTS requirements (
        project_id TEXT NOT NULL,
        req_id TEXT NOT NULL,
        display_id TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        type TEXT,
        title TEXT,
        status TEXT,
        priority TEXT,
        module TEXT,
        submodule TEXT,
        phase TEXT,
        delivery_stage_id TEXT,
        parent_id TEXT,
        parent_link_type TEXT,
        stakeholder_requirement_link TEXT,
        linked_functional_requirement TEXT,
        v_level INTEGER,
        module_tags TEXT,
        data TEXT NOT NULL,
        updated_at TEXT,
        PRIMARY KEY (project_id, req_id)
      );

      CREATE TABLE IF NOT EXISTS requirement_links (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id TEXT NOT NULL,
        source_req_id TEXT NOT NULL,
        target_req_id TEXT NOT NULL,
        role TEXT NOT NULL,
        link_type TEXT NOT NULL,
        source_field TEXT NOT NULL,
        sequence INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS engineering_entities (
        project_id TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        title TEXT NOT NULL,
        status TEXT NOT NULL,
        version INTEGER NOT NULL,
        data TEXT NOT NULL,
        updated_at TEXT,
        PRIMARY KEY (project_id, entity_id)
      );

      CREATE TABLE IF NOT EXISTS engineering_relationships (
        project_id TEXT NOT NULL,
        relationship_id TEXT NOT NULL,
        source_type TEXT NOT NULL,
        source_id TEXT NOT NULL,
        target_type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        relationship_type TEXT NOT NULL,
        data TEXT NOT NULL,
        updated_at TEXT,
        PRIMARY KEY (project_id, relationship_id)
      );

      CREATE TABLE IF NOT EXISTS engineering_change_sets (
        project_id TEXT NOT NULL,
        change_set_id TEXT NOT NULL,
        task_id TEXT,
        run_id TEXT,
        status TEXT NOT NULL,
        base_revision INTEGER NOT NULL,
        applied_revision INTEGER,
        data TEXT NOT NULL,
        updated_at TEXT,
        PRIMARY KEY (project_id, change_set_id)
      );

      CREATE TABLE IF NOT EXISTS engineering_external_references (
        project_id TEXT NOT NULL,
        reference_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        artifact_type TEXT NOT NULL,
        uri TEXT,
        remote_id TEXT,
        data TEXT NOT NULL,
        updated_at TEXT,
        PRIMARY KEY (project_id, reference_id)
      );

      CREATE TABLE IF NOT EXISTS engineering_projection_meta (
        project_id TEXT PRIMARY KEY,
        schema_version INTEGER NOT NULL,
        revision INTEGER NOT NULL,
        content_hash TEXT NOT NULL,
        projected_at TEXT NOT NULL
      );
    `);

    ensureColumn(database, 'requirements', 'sort_order', 'INTEGER NOT NULL DEFAULT 0');
    ensureColumn(database, 'requirements', 'display_id', 'TEXT');
    ensureColumn(database, 'requirements', 'type', 'TEXT');
    ensureColumn(database, 'requirements', 'title', 'TEXT');
    ensureColumn(database, 'requirements', 'status', 'TEXT');
    ensureColumn(database, 'requirements', 'priority', 'TEXT');
    ensureColumn(database, 'requirements', 'module', 'TEXT');
    ensureColumn(database, 'requirements', 'submodule', 'TEXT');
    ensureColumn(database, 'requirements', 'phase', 'TEXT');
    ensureColumn(database, 'requirements', 'delivery_stage_id', 'TEXT');
    ensureColumn(database, 'requirements', 'parent_id', 'TEXT');
    ensureColumn(database, 'requirements', 'parent_link_type', 'TEXT');
    ensureColumn(database, 'requirements', 'stakeholder_requirement_link', 'TEXT');
    ensureColumn(database, 'requirements', 'linked_functional_requirement', 'TEXT');
    ensureColumn(database, 'requirements', 'v_level', 'INTEGER');
    ensureColumn(database, 'requirements', 'module_tags', 'TEXT');

    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_requirements_project ON requirements(project_id);
      CREATE INDEX IF NOT EXISTS idx_requirements_project_type ON requirements(project_id, type);
      CREATE INDEX IF NOT EXISTS idx_requirements_project_parent ON requirements(project_id, parent_id);
      CREATE INDEX IF NOT EXISTS idx_requirements_project_phase ON requirements(project_id, phase);
      CREATE INDEX IF NOT EXISTS idx_requirements_project_module ON requirements(project_id, module);
      CREATE INDEX IF NOT EXISTS idx_requirements_project_stage ON requirements(project_id, delivery_stage_id);

      CREATE INDEX IF NOT EXISTS idx_requirement_links_project_source
        ON requirement_links(project_id, source_req_id);
      CREATE INDEX IF NOT EXISTS idx_requirement_links_project_target
        ON requirement_links(project_id, target_req_id);
      CREATE INDEX IF NOT EXISTS idx_requirement_links_project_type
        ON requirement_links(project_id, link_type);
      CREATE INDEX IF NOT EXISTS idx_engineering_entities_project_type
        ON engineering_entities(project_id, entity_type);
      CREATE INDEX IF NOT EXISTS idx_engineering_relationships_source
        ON engineering_relationships(project_id, source_type, source_id);
      CREATE INDEX IF NOT EXISTS idx_engineering_relationships_target
        ON engineering_relationships(project_id, target_type, target_id);
      CREATE INDEX IF NOT EXISTS idx_engineering_change_sets_task
        ON engineering_change_sets(project_id, task_id, status);
    `);

    const row = database.prepare('SELECT value FROM store_meta WHERE key = ?').get('schema_version');
    if (!row) {
      database.prepare('INSERT INTO store_meta (key, value) VALUES (?, ?)').run('schema_version', String(SCHEMA_VERSION));
    } else if (Number(row.value) < SCHEMA_VERSION) {
      database.prepare('UPDATE store_meta SET value = ? WHERE key = ?').run(String(SCHEMA_VERSION), 'schema_version');
    }
  }

  function canUseSqlite() {
    try {
      getDb();
      getDb().prepare('SELECT 1').get();
      return true;
    } catch {
      return false;
    }
  }

  function isEnabled() {
    return isReady();
  }

  function isReady() {
    try {
      if (!fs.existsSync(dbPath)) return false;
      return canUseSqlite();
    } catch {
      return false;
    }
  }

  function verifyRequirementsSaved(projectId, requirements) {
    const list = ensureArray(requirements);
    if (!list.length) return true;
    const expectedCounts = new Map();
    for (const req of list) {
      if (!req?.id) continue;
      const id = normalizeReqId(req.id);
      expectedCounts.set(id, (expectedCounts.get(id) || 0) + 1);
    }
    const row = getDb().prepare('SELECT COUNT(*) AS count FROM requirements WHERE project_id = ?').get(projectId);
    if ((row?.count || 0) !== list.filter((req) => req?.id).length) return false;

    const actualRows = getDb().prepare(`
      SELECT COALESCE(display_id, req_id) AS id, COUNT(*) AS count
      FROM requirements
      WHERE project_id = ?
      GROUP BY COALESCE(display_id, req_id)
    `).all(projectId);
    const actualCounts = new Map(actualRows.map((r) => [normalizeReqId(r.id), r.count]));
    for (const [id, count] of expectedCounts) {
      if (actualCounts.get(id) !== count) return false;
    }
    return true;
  }

  function isHybridLayout() {
    if (!isEnabled()) return false;
    const row = getDb().prepare('SELECT value FROM store_meta WHERE key = ?').get('storage_layout');
    return row?.value === 'hybrid-v2';
  }

  function markHybridLayout() {
    getDb().prepare(`
      INSERT INTO store_meta (key, value) VALUES ('storage_layout', 'hybrid-v2')
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run();
  }

  function getUsers() {
    const rows = getDb().prepare('SELECT data FROM users').all();
    return rows.map((r) => JSON.parse(r.data));
  }

  function saveUsers(users) {
    const database = getDb();
    const del = database.prepare('DELETE FROM users');
    const ins = database.prepare('INSERT INTO users (id, data) VALUES (?, ?)');
    const tx = database.transaction((list) => {
      del.run();
      for (const user of list) {
        ins.run(user.id, JSON.stringify(user));
      }
    });
    tx(users);
  }

  function getActivity(limit = 5000) {
    const rows = getDb().prepare(`
      SELECT id, at, actor_user_id, project_id, action, details
      FROM activity ORDER BY at DESC LIMIT ?
    `).all(limit);
    return rows.map((r) => ({
      id: r.id,
      at: r.at,
      actorUserId: r.actor_user_id,
      projectId: r.project_id,
      action: r.action,
      details: r.details ? JSON.parse(r.details) : {},
    }));
  }

  function appendActivity(entry) {
    getDb().prepare(`
      INSERT INTO activity (id, at, actor_user_id, project_id, action, details)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      entry.id,
      entry.at,
      entry.actorUserId || entry.actor_user_id || null,
      entry.projectId || entry.project_id || null,
      entry.action || '',
      JSON.stringify(entry.details || {}),
    );
  }

  function getRepairActivity(projectId) {
    const rows = getDb().prepare(`
      SELECT id, at, actor_user_id, project_id, action, details
      FROM activity
      WHERE project_id = ? AND action IN ('requirement_hierarchy_repaired', 'requirement_hierarchy_repair_reverted')
      ORDER BY at DESC
      LIMIT 200
    `).all(projectId);
    return rows.map((r) => ({
      id: r.id,
      at: r.at,
      actorUserId: r.actor_user_id,
      projectId: r.project_id,
      action: r.action,
      details: r.details ? JSON.parse(r.details) : {},
    }));
  }

  function replaceActivity(list) {
    const database = getDb();
    const del = database.prepare('DELETE FROM activity');
    const ins = database.prepare(`
      INSERT INTO activity (id, at, actor_user_id, project_id, action, details)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const tx = database.transaction((items) => {
      del.run();
      for (const entry of items) {
        ins.run(
          entry.id,
          entry.at,
          entry.actorUserId || null,
          entry.projectId || null,
          entry.action || '',
          JSON.stringify(entry.details || {}),
        );
      }
    });
    tx(list);
  }

  function loadRequirements(projectId) {
    const rows = getDb().prepare(
      'SELECT data FROM requirements WHERE project_id = ? ORDER BY sort_order ASC, req_id ASC'
    ).all(projectId);
    return rows.map((r) => JSON.parse(r.data));
  }

  function loadRequirementRows(projectId, filters = {}) {
    const clauses = ['project_id = @projectId'];
    const params = { projectId };
    if (filters.type) {
      clauses.push('type = @type');
      params.type = filters.type;
    }
    if (filters.phase) {
      clauses.push('phase = @phase');
      params.phase = filters.phase;
    }
    if (filters.module) {
      clauses.push('module = @module');
      params.module = filters.module;
    }
    if (filters.deliveryStageId) {
      clauses.push('delivery_stage_id = @deliveryStageId');
      params.deliveryStageId = filters.deliveryStageId;
    }

    const rows = getDb().prepare(`
      SELECT project_id, req_id, display_id, sort_order, type, title, status, priority,
        module, submodule, phase, delivery_stage_id, parent_id, parent_link_type,
        stakeholder_requirement_link, linked_functional_requirement, v_level,
        module_tags, updated_at
      FROM requirements
      WHERE ${clauses.join(' AND ')}
      ORDER BY sort_order ASC, req_id ASC
    `).all(params);

    return rows.map((row) => ({
      projectId: row.project_id,
      id: row.display_id || row.req_id,
      storageId: row.req_id,
      sortOrder: row.sort_order,
      type: row.type || '',
      title: row.title || '',
      status: row.status || '',
      priority: row.priority || '',
      module: row.module || '',
      submodule: row.submodule || '',
      phase: row.phase || '',
      deliveryStageId: row.delivery_stage_id || '',
      parentId: row.parent_id || '',
      parentLinkType: row.parent_link_type || '',
      stakeholderRequirementLink: row.stakeholder_requirement_link || '',
      linkedFunctionalRequirement: row.linked_functional_requirement || '',
      vLevel: Number.isFinite(row.v_level) ? row.v_level : null,
      moduleTags: row.module_tags ? JSON.parse(row.module_tags) : [],
      updatedAt: row.updated_at || '',
    }));
  }

  function loadRequirementLinks(projectId, filters = {}) {
    const clauses = ['project_id = @projectId'];
    const params = { projectId };
    if (filters.sourceReqId) {
      clauses.push('(source_req_id = @sourceReqId OR source_req_id LIKE @sourceReqIdDup)');
      params.sourceReqId = normalizeReqId(filters.sourceReqId);
      params.sourceReqIdDup = `${params.sourceReqId}#DUP-%`;
    }
    if (filters.targetReqId) {
      clauses.push('target_req_id = @targetReqId');
      params.targetReqId = normalizeReqId(filters.targetReqId);
    }
    if (filters.linkType) {
      clauses.push('link_type = @linkType');
      params.linkType = filters.linkType;
    }

    const rows = getDb().prepare(`
      SELECT source_req_id, target_req_id, role, link_type, source_field, sequence
      FROM requirement_links
      WHERE ${clauses.join(' AND ')}
      ORDER BY source_req_id ASC, source_field ASC, sequence ASC, target_req_id ASC
    `).all(params);

    return rows.map((row) => ({
      sourceReqId: row.source_req_id,
      targetReqId: row.target_req_id,
      role: row.role,
      linkType: row.link_type,
      sourceField: row.source_field,
      sequence: row.sequence,
    }));
  }

  function getRequirementStats(projectId) {
    const totals = getDb().prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN type = 'stakeholder' THEN 1 ELSE 0 END) AS stakeholder,
        SUM(CASE WHEN type = 'functional' THEN 1 ELSE 0 END) AS functional,
        SUM(CASE WHEN type = 'non_functional' THEN 1 ELSE 0 END) AS non_functional,
        SUM(CASE WHEN type = 'test_case' THEN 1 ELSE 0 END) AS test_case
      FROM requirements
      WHERE project_id = ?
    `).get(projectId);
    const links = getDb().prepare('SELECT COUNT(*) AS total FROM requirement_links WHERE project_id = ?').get(projectId);
    return {
      total: totals?.total || 0,
      stakeholder: totals?.stakeholder || 0,
      functional: totals?.functional || 0,
      nonFunctional: totals?.non_functional || 0,
      testCase: totals?.test_case || 0,
      links: links?.total || 0,
    };
  }

  function requirementsFingerprint(requirements) {
    const list = ensureArray(requirements).filter((req) => req?.id);
    const hash = crypto.createHash('sha1');
    for (const req of list) {
      hash.update(normalizeReqId(req.id));
      hash.update('\0');
      hash.update(String(req.updatedAt || req.updated_at || ''));
      hash.update('\0');
    }
    return `${list.length}:${hash.digest('hex')}`;
  }

  function getStoredRequirementsFingerprint(projectId) {
    const rows = getDb().prepare(`
      SELECT display_id, updated_at
      FROM requirements
      WHERE project_id = ?
      ORDER BY sort_order ASC, req_id ASC
    `).all(projectId);
    const hash = crypto.createHash('sha1');
    for (const row of rows) {
      hash.update(normalizeReqId(row.display_id));
      hash.update('\0');
      hash.update(String(row.updated_at || ''));
      hash.update('\0');
    }
    return `${rows.length}:${hash.digest('hex')}`;
  }

  function getRequirementCount(projectId) {
    const row = getDb().prepare(
      'SELECT COUNT(*) AS total FROM requirements WHERE project_id = ?',
    ).get(projectId);
    return row?.total || 0;
  }

  function requirementsMatchStore(projectId, requirements) {
    const incoming = requirementsFingerprint(requirements);
    const stored = getStoredRequirementsFingerprint(projectId);
    return incoming === stored;
  }

  function saveRequirements(projectId, requirements) {
    const database = getDb();
    const list = ensureArray(requirements).filter((req) => req?.id);
    const del = database.prepare('DELETE FROM requirements WHERE project_id = ?');
    const delLinks = database.prepare('DELETE FROM requirement_links WHERE project_id = ?');
    const ins = database.prepare(`
      INSERT INTO requirements (
        project_id, req_id, display_id, sort_order, type, title, status, priority, module,
        submodule, phase, delivery_stage_id, parent_id, parent_link_type,
        stakeholder_requirement_link, linked_functional_requirement, v_level,
        module_tags, data, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insLink = database.prepare(`
      INSERT INTO requirement_links (
        project_id, source_req_id, target_req_id, role, link_type, source_field, sequence
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const tx = database.transaction((pid, reqs) => {
      del.run(pid);
      delLinks.run(pid);
      const seenIds = new Map();
      reqs.forEach((req, index) => {
        const displayId = normalizeReqId(req.id);
        const seenCount = seenIds.get(displayId) || 0;
        seenIds.set(displayId, seenCount + 1);
        const storageReqId = seenCount === 0 ? displayId : `${displayId}#DUP-${seenCount + 1}`;
        ins.run(
          pid,
          storageReqId,
          displayId,
          index,
          textOr(req.type),
          textOr(req.title),
          textOr(req.status),
          textOr(req.priority),
          textOr(req.module),
          textOr(req.submodule),
          textOr(req.phase),
          textOr(req.deliveryStageId),
          normalizeReqId(req.parentId),
          textOr(req.parentLinkType),
          normalizeReqId(req.stakeholderRequirementLink),
          normalizeReqId(req.linkedFunctionalRequirement),
          Number.isFinite(Number(req.vLevel)) ? Number(req.vLevel) : null,
          jsonText(ensureArray(req.moduleTags), []),
          JSON.stringify(req),
          req.updatedAt || req.updated_at || null,
        );
        for (const link of requirementLinksForDb(req, storageReqId)) {
          insLink.run(pid, link.sourceReqId, link.targetReqId, link.role, link.linkType, link.sourceField, link.sequence);
        }
      }
      );
    });
    tx(projectId, list);
  }

  function engineeringProjectionFingerprint(state, changeSets = []) {
    const payload = JSON.stringify({
      schemaVersion: Number(state?.schemaVersion) || 1,
      revision: Number(state?.revision) || 0,
      entities: ensureArray(state?.entities),
      relationships: ensureArray(state?.relationships),
      externalReferences: ensureArray(state?.externalReferences),
      changeSets: ensureArray(changeSets),
    });
    return crypto.createHash('sha256').update(payload).digest('hex');
  }

  function saveEngineeringProjection(projectId, state = {}, changeSets = []) {
    const database = getDb();
    const entities = ensureArray(state.entities);
    const relationships = ensureArray(state.relationships);
    const externalReferences = ensureArray(state.externalReferences);
    const changes = ensureArray(changeSets);
    const fingerprint = engineeringProjectionFingerprint(state, changes);
    const projectedAt = new Date().toISOString();
    const transaction = database.transaction(() => {
      database.prepare('DELETE FROM engineering_entities WHERE project_id = ?').run(projectId);
      database.prepare('DELETE FROM engineering_relationships WHERE project_id = ?').run(projectId);
      database.prepare('DELETE FROM engineering_change_sets WHERE project_id = ?').run(projectId);
      database.prepare('DELETE FROM engineering_external_references WHERE project_id = ?').run(projectId);
      const insertEntity = database.prepare(`
        INSERT INTO engineering_entities
          (project_id, entity_id, entity_type, title, status, version, data, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      entities.forEach((entity) => insertEntity.run(
        projectId, entity.id, entity.type, textOr(entity.title, entity.id), textOr(entity.status, 'active'),
        Math.max(1, Number(entity.version) || 1), JSON.stringify(entity), entity.updatedAt || projectedAt,
      ));
      const insertRelationship = database.prepare(`
        INSERT INTO engineering_relationships
          (project_id, relationship_id, source_type, source_id, target_type, target_id, relationship_type, data, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      relationships.forEach((relationship) => insertRelationship.run(
        projectId, relationship.id, relationship.sourceType, relationship.sourceId,
        relationship.targetType, relationship.targetId, relationship.relationshipType,
        JSON.stringify(relationship), relationship.updatedAt || projectedAt,
      ));
      const insertChangeSet = database.prepare(`
        INSERT INTO engineering_change_sets
          (project_id, change_set_id, task_id, run_id, status, base_revision, applied_revision, data, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      changes.forEach((changeSet) => insertChangeSet.run(
        projectId, changeSet.id, changeSet.taskId || null, changeSet.runId || null,
        textOr(changeSet.status, 'proposed'), Math.max(0, Number(changeSet.baseEngineeringRevision) || 0),
        Number.isFinite(Number(changeSet.appliedRevision)) ? Number(changeSet.appliedRevision) : null,
        JSON.stringify(changeSet), changeSet.updatedAt || projectedAt,
      ));
      const insertReference = database.prepare(`
        INSERT INTO engineering_external_references
          (project_id, reference_id, provider, artifact_type, uri, remote_id, data, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      externalReferences.forEach((reference) => insertReference.run(
        projectId, reference.id, textOr(reference.provider, 'manual'), textOr(reference.artifactType, 'reference'),
        reference.uri || null, reference.remoteId || null, JSON.stringify(reference), reference.updatedAt || projectedAt,
      ));
      database.prepare(`
        INSERT INTO engineering_projection_meta
          (project_id, schema_version, revision, content_hash, projected_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(project_id) DO UPDATE SET
          schema_version = excluded.schema_version,
          revision = excluded.revision,
          content_hash = excluded.content_hash,
          projected_at = excluded.projected_at
      `).run(projectId, Number(state.schemaVersion) || 1, Math.max(0, Number(state.revision) || 0), fingerprint, projectedAt);
    });
    transaction();
    return { fingerprint, projectedAt };
  }

  function loadEngineeringProjection(projectId) {
    const database = getDb();
    const meta = database.prepare('SELECT * FROM engineering_projection_meta WHERE project_id = ?').get(projectId);
    const entities = database.prepare('SELECT data FROM engineering_entities WHERE project_id = ? ORDER BY entity_id').all(projectId).map((row) => JSON.parse(row.data));
    const relationships = database.prepare('SELECT data FROM engineering_relationships WHERE project_id = ? ORDER BY relationship_id').all(projectId).map((row) => JSON.parse(row.data));
    const externalReferences = database.prepare('SELECT data FROM engineering_external_references WHERE project_id = ? ORDER BY reference_id').all(projectId).map((row) => JSON.parse(row.data));
    const changeSets = database.prepare('SELECT data FROM engineering_change_sets WHERE project_id = ? ORDER BY updated_at DESC').all(projectId).map((row) => JSON.parse(row.data));
    return {
      state: {
        schemaVersion: Number(meta?.schema_version) || 1,
        revision: Number(meta?.revision) || 0,
        entities,
        relationships,
        externalReferences,
      },
      changeSets,
      fingerprint: meta?.content_hash || '',
      projectedAt: meta?.projected_at || '',
    };
  }

  function engineeringProjectionMatches(projectId, state, changeSets = []) {
    const row = getDb().prepare('SELECT content_hash FROM engineering_projection_meta WHERE project_id = ?').get(projectId);
    return Boolean(row?.content_hash) && row.content_hash === engineeringProjectionFingerprint(state, changeSets);
  }

  function getEngineeringProjectionStats(projectId) {
    const database = getDb();
    const count = (table) => database.prepare(`SELECT COUNT(*) AS total FROM ${table} WHERE project_id = ?`).get(projectId)?.total || 0;
    const meta = database.prepare('SELECT schema_version, revision, content_hash, projected_at FROM engineering_projection_meta WHERE project_id = ?').get(projectId);
    return {
      entities: count('engineering_entities'),
      relationships: count('engineering_relationships'),
      changeSets: count('engineering_change_sets'),
      externalReferences: count('engineering_external_references'),
      schemaVersion: Number(meta?.schema_version) || 0,
      revision: Number(meta?.revision) || 0,
      fingerprint: meta?.content_hash || '',
      projectedAt: meta?.projected_at || '',
    };
  }

  function deleteProjectData(projectId) {
    const database = getDb();
    database.prepare('DELETE FROM requirement_links WHERE project_id = ?').run(projectId);
    database.prepare('DELETE FROM requirements WHERE project_id = ?').run(projectId);
    database.prepare('DELETE FROM activity WHERE project_id = ?').run(projectId);
    database.prepare('DELETE FROM engineering_entities WHERE project_id = ?').run(projectId);
    database.prepare('DELETE FROM engineering_relationships WHERE project_id = ?').run(projectId);
    database.prepare('DELETE FROM engineering_change_sets WHERE project_id = ?').run(projectId);
    database.prepare('DELETE FROM engineering_external_references WHERE project_id = ?').run(projectId);
    database.prepare('DELETE FROM engineering_projection_meta WHERE project_id = ?').run(projectId);
  }

  function close() {
    if (db) {
      db.close();
      db = null;
      enabled = false;
    }
  }

  return {
    dbPath,
    getDb,
    isEnabled,
    isReady,
    canUseSqlite,
    verifyRequirementsSaved,
    isHybridLayout,
    markHybridLayout,
    getUsers,
    saveUsers,
    getActivity,
    appendActivity,
    getRepairActivity,
    replaceActivity,
    loadRequirements,
    loadRequirementRows,
    loadRequirementLinks,
    getRequirementStats,
    getRequirementCount,
    requirementsMatchStore,
    requirementsFingerprint,
    saveRequirements,
    engineeringProjectionFingerprint,
    saveEngineeringProjection,
    loadEngineeringProjection,
    engineeringProjectionMatches,
    getEngineeringProjectionStats,
    deleteProjectData,
    close,
  };
}

module.exports = { createSqliteStore, SCHEMA_VERSION };
