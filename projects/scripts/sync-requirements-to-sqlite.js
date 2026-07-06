#!/usr/bin/env node
/**
 * One-shot deploy helper: move inline project requirements into SQLite and
 * rewrite project JSON shells without the requirements array.
 *
 * Usage: node projects/scripts/sync-requirements-to-sqlite.js [--dry-run]
 */
const fs = require('fs').promises;
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');
const indexPath = path.join(dataDir, 'store-index.json');
const projectsDir = path.join(dataDir, 'projects');

const { createSqliteStore } = require('../lib/sqlite-store');
const { projectFileName } = require('../lib/split-store');
const blobStore = require('../lib/blob-store');

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value)}\n`, 'utf8');
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const sqliteStore = createSqliteStore({ dataDir });
  if (!sqliteStore.isEnabled()) {
    console.error('SQLite indisponivel (better-sqlite3).');
    process.exit(1);
  }

  const idx = await readJson(indexPath);
  let synced = 0;

  for (const entry of idx.projects || []) {
    const filePath = path.join(projectsDir, projectFileName(entry.id));
    let project;
    try {
      project = await readJson(filePath);
    } catch {
      continue;
    }

    const inlineReqs = Array.isArray(project.requirements) ? project.requirements : [];
    if (!inlineReqs.length) continue;

    if (!dryRun) {
      const backupPath = `${filePath}.pre-hybrid.bak`;
      try {
        await fs.access(backupPath);
      } catch {
        await fs.copyFile(filePath, backupPath);
      }

      if (!sqliteStore.requirementsMatchStore(entry.id, inlineReqs)) {
        sqliteStore.saveRequirements(entry.id, inlineReqs);
      }
      const disk = blobStore.prepareProjectForDisk({
        ...project,
        storageHybrid: true,
        requirementsInDb: true,
        requirementCount: inlineReqs.length,
      });
      await writeJson(filePath, disk);
      const pos = idx.projects.findIndex((item) => item.id === entry.id);
      if (pos >= 0) {
        idx.projects[pos] = {
          ...idx.projects[pos],
          requirementCount: inlineReqs.length,
        };
      }
    }

    synced += 1;
    console.log(`${dryRun ? '[dry-run] ' : ''}${entry.id}: ${inlineReqs.length} requisitos -> SQLite`);
  }

  if (!dryRun && synced > 0) {
    idx.meta = idx.meta || {};
    idx.meta.storageLayout = idx.meta.storageLayout || 'hybrid-v2';
    await writeJson(indexPath, idx);
  }

  sqliteStore.close();
  console.log(`Concluido: ${synced} projeto(s) sincronizado(s).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
