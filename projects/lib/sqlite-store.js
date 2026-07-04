/**
 * SQLite store for relational / queryable data (users, activity, requirements).
 * Large AI text blobs stay in blob-store files.
 */
const fs = require('fs');
const path = require('path');

const SCHEMA_VERSION = 1;

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
        data TEXT NOT NULL,
        updated_at TEXT,
        PRIMARY KEY (project_id, req_id)
      );

      CREATE INDEX IF NOT EXISTS idx_requirements_project ON requirements(project_id);
    `);

    const row = database.prepare('SELECT value FROM store_meta WHERE key = ?').get('schema_version');
    if (!row) {
      database.prepare('INSERT INTO store_meta (key, value) VALUES (?, ?)').run('schema_version', String(SCHEMA_VERSION));
    }
  }

  function isEnabled() {
    try {
      if (fs.existsSync(dbPath)) {
        getDb();
        return true;
      }
    } catch {
      return false;
    }
    return enabled;
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
      'SELECT data FROM requirements WHERE project_id = ? ORDER BY req_id'
    ).all(projectId);
    return rows.map((r) => JSON.parse(r.data));
  }

  function saveRequirements(projectId, requirements) {
    const database = getDb();
    const deduped = new Map();
    for (const req of requirements) {
      if (req?.id) deduped.set(req.id, req);
    }
    const list = [...deduped.values()];
    const del = database.prepare('DELETE FROM requirements WHERE project_id = ?');
    const ins = database.prepare(`
      INSERT INTO requirements (project_id, req_id, data, updated_at)
      VALUES (?, ?, ?, ?)
    `);
    const tx = database.transaction((pid, reqs) => {
      del.run(pid);
      for (const req of reqs) {
        ins.run(pid, req.id, JSON.stringify(req), req.updatedAt || req.updated_at || null);
      }
    });
    tx(projectId, list);
  }

  function deleteProjectData(projectId) {
    const database = getDb();
    database.prepare('DELETE FROM requirements WHERE project_id = ?').run(projectId);
    database.prepare('DELETE FROM activity WHERE project_id = ?').run(projectId);
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
    isHybridLayout,
    markHybridLayout,
    getUsers,
    saveUsers,
    getActivity,
    appendActivity,
    replaceActivity,
    loadRequirements,
    saveRequirements,
    deleteProjectData,
    close,
  };
}

module.exports = { createSqliteStore, SCHEMA_VERSION };
