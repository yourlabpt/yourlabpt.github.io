#!/usr/bin/env node
/**
 * Restore inline requirements from store.json.bak into split project files.
 * Reverts hybrid JSON stripping so requirements travel with git deploys.
 */
const fs = require('fs').promises;
const path = require('path');

const root = path.resolve(__dirname, '..');
const dataDir = path.join(root, 'data');
const projectsDir = path.join(dataDir, 'projects');
const storePath = path.join(dataDir, 'store.json');
const bakPath = `${storePath}.bak`;
const indexPath = path.join(dataDir, 'store-index.json');

function projectFileName(projectId) {
  return `${String(projectId).replace(/[^a-zA-Z0-9_-]/g, '_')}.json`;
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

async function writeJson(filePath, data) {
  await fs.writeFile(filePath, `${JSON.stringify(data)}\n`, 'utf8');
}

async function main() {
  const bak = await readJson(bakPath);
  const index = await readJson(indexPath);
  let sqliteUsers = [];
  let sqliteActivity = [];

  try {
    const { createSqliteStore } = require('../lib/sqlite-store');
    const sqlite = createSqliteStore({ dataDir });
    if (sqlite.isReady()) {
      sqliteUsers = sqlite.getUsers();
      sqliteActivity = sqlite.getActivity(500);
    }
  } catch {
    // sqlite optional for restore
  }

  const restored = [];

  for (const entry of ensureArray(index.projects)) {
    const projectId = entry.id;
    const fromBak = ensureArray(bak.projects).find((p) => p.id === projectId);
    const filePath = path.join(projectsDir, projectFileName(projectId));
    let current = null;
    try {
      current = await readJson(filePath);
    } catch {
      current = fromBak;
    }

    const requirements = ensureArray(fromBak?.requirements);
    const merged = {
      ...(fromBak || {}),
      ...(current || {}),
      requirements,
      storageHybrid: false,
      requirementsInDb: false,
    };
    delete merged._normalizedVersion;
    delete merged._blobsCompacted;

    await writeJson(filePath, merged);
    entry.requirementCount = requirements.length;
    restored.push({ id: projectId, name: merged.name, requirements: requirements.length });
  }

  index.users = sqliteUsers.length ? sqliteUsers : ensureArray(bak.users);
  index.activity = sqliteActivity.length ? sqliteActivity : ensureArray(bak.activity);
  index.meta = index.meta || {};
  index.meta.storageLayout = 'split-v1';
  index.meta.updatedAt = new Date().toISOString();
  delete index.meta.usersInDb;
  delete index.meta.activityInDb;

  await writeJson(indexPath, index);

  console.log('Restored projects:');
  for (const row of restored) {
    console.log(`  ${row.id} (${row.name}): ${row.requirements} requirements`);
  }
  console.log(`Index: split-v1, ${index.users.length} users, ${index.activity.length} activity rows`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
