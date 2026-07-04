/**
 * Recover requirements when hybrid JSON is empty but SQLite is missing or out of sync.
 */
const fs = require('fs').promises;
const path = require('path');
const { projectFileName } = require('./split-store');

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

async function fileExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function recoverRequirementsFromSources({
  dataDir,
  projectId,
  readJson,
  storePath,
}) {
  const projectsDir = path.join(dataDir, 'projects');
  const inlinePath = path.join(projectsDir, projectFileName(projectId));
  const inlineBackupPath = `${inlinePath}.pre-hybrid.bak`;
  const monolithBackupPath = `${storePath}.bak`;

  const sources = [inlineBackupPath, inlinePath, monolithBackupPath];

  for (const sourcePath of sources) {
    if (!(await fileExists(sourcePath))) continue;
    try {
      const payload = await readJson(sourcePath);
      const project = sourcePath === monolithBackupPath
        ? ensureArray(payload.projects).find((entry) => entry.id === projectId)
        : payload;
      const requirements = ensureArray(project?.requirements);
      if (requirements.length) {
        return { requirements, source: sourcePath };
      }
    } catch {
      // try next source
    }
  }

  return { requirements: [], source: null };
}

async function repairProjectRequirements({
  project,
  indexEntry,
  dataDir,
  storePath,
  sqliteStore,
  readJson,
  writeJson,
  storeLayer,
  blobStore,
}) {
  if (!project?.id) return { repaired: false, reason: 'no_project' };

  const expected = Number(indexEntry?.requirementCount) || 0;
  const inlineCount = ensureArray(project.requirements).length;
  let dbCount = 0;

  try {
    dbCount = ensureArray(sqliteStore.loadRequirements(project.id)).length;
  } catch {
    dbCount = 0;
  }

  if (!project.requirementsInDb && !project.storageHybrid) {
    return { repaired: false, reason: 'not_hybrid', inlineCount, dbCount };
  }

  if (dbCount > 0 && inlineCount === 0) {
    project.requirements = sqliteStore.loadRequirements(project.id);
    return { repaired: true, reason: 'hydrated_from_db', count: dbCount };
  }

  if (inlineCount > 0 && dbCount === 0 && typeof sqliteStore.saveRequirements === 'function') {
    sqliteStore.saveRequirements(project.id, project.requirements);
    const verified = sqliteStore.loadRequirements(project.id).length;
    if (verified > 0) {
      return { repaired: true, reason: 'backfilled_db_from_json', count: verified };
    }
  }

  if (dbCount > 0 && inlineCount > 0) {
    return { repaired: false, reason: 'ok', inlineCount, dbCount };
  }

  if (expected === 0 && inlineCount === 0 && dbCount === 0) {
    return { repaired: false, reason: 'empty_project' };
  }

  const recovered = await recoverRequirementsFromSources({
    dataDir,
    projectId: project.id,
    readJson,
    storePath,
  });

  if (!recovered.requirements.length) {
    return {
      repaired: false,
      reason: 'no_recovery_source',
      expected,
      inlineCount,
      dbCount,
    };
  }

  project.requirements = recovered.requirements;
  if (typeof sqliteStore.saveRequirements === 'function') {
    sqliteStore.saveRequirements(project.id, recovered.requirements);
    if (!sqliteStore.verifyRequirementsSaved(project.id, recovered.requirements)) {
      return {
        repaired: false,
        reason: 'sqlite_verify_failed',
        expected: recovered.requirements.length,
        got: sqliteStore.loadRequirements(project.id).length,
      };
    }
  }

  project.storageHybrid = true;
  project.requirementsInDb = Boolean(sqliteStore.isReady?.() ?? sqliteStore.isEnabled?.());
  project.requirementCount = recovered.requirements.length;

  if (storeLayer && blobStore && writeJson) {
    const backupPath = path.join(dataDir, 'projects', `${projectFileName(project.id)}.pre-hybrid.bak`);
    if (!(await fileExists(backupPath))) {
      const currentPath = path.join(dataDir, 'projects', projectFileName(project.id));
      if (await fileExists(currentPath)) {
        await fs.copyFile(currentPath, backupPath).catch(() => {});
      }
    }
    await blobStore.externalizeProjectBlobs(project, dataDir, writeJson);
    const disk = blobStore.prepareProjectForDisk({
      ...project,
      storageHybrid: project.storageHybrid,
      requirementsInDb: project.requirementsInDb,
      requirementCount: recovered.requirements.length,
    });
    if (storeLayer.writeProjectBlob) {
      await storeLayer.writeProjectBlob(disk);
    }
    storeLayer.loadedProjects?.set(project.id, {
      ...project,
      requirements: recovered.requirements,
    });
  }

  return {
    repaired: true,
    reason: 'recovered_from_backup',
    count: recovered.requirements.length,
    source: recovered.source,
  };
}

module.exports = {
  recoverRequirementsFromSources,
  repairProjectRequirements,
};
