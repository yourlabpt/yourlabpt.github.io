/**
 * One-time safe migration: JSON split-store → SQLite (users/activity/requirements) + blob files (AI text).
 */
const fs = require('fs').promises;
const path = require('path');

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

async function migrateToHybridStorage({
  dataDir,
  storeLayer,
  sqliteStore,
  blobStore,
  readJson,
  writeJson,
  normalizeOneProject,
  nowIso,
}) {
  const indexPath = path.join(dataDir, 'store-index.json');
  if (!(await fileExists(indexPath))) {
    return { migrated: false, reason: 'no_index' };
  }

  const index = await readJson(indexPath);
  if (index.meta?.storageLayout === 'hybrid-v2') {
    return { migrated: false, reason: 'already_hybrid' };
  }
  const users = ensureArray(index.users);
  const activity = ensureArray(index.activity);
  const projectEntries = ensureArray(index.projects);

  sqliteStore.saveUsers(users);
  sqliteStore.replaceActivity(activity.map((entry) => ({
    id: entry.id,
    at: entry.at,
    actorUserId: entry.actorUserId,
    projectId: entry.projectId,
    action: entry.action,
    details: entry.details || {},
  })));

  let projectsMigrated = 0;
  let blobsExternalized = 0;

  for (const entry of projectEntries) {
    const projectId = entry.id;
    let project = await storeLayer.readProjectBlob(projectId);
    if (!project) continue;
    if (project.storageHybrid && project.requirementsInDb) {
      await blobStore.externalizeProjectBlobs(project, dataDir, writeJson);
      const disk = blobStore.prepareProjectForDisk(project);
      await storeLayer.writeProjectBlob(disk);
      storeLayer.loadedProjects.set(projectId, {
        ...project,
        requirements: sqliteStore.loadRequirements(projectId),
      });
      projectsMigrated += 1;
      continue;
    }

    Object.assign(project, normalizeOneProject(project));

    const reqs = ensureArray(project.requirements);
    if (reqs.length) {
      sqliteStore.saveRequirements(projectId, reqs);
    }

    const changed = await blobStore.externalizeProjectBlobs(project, dataDir, writeJson);
    if (changed) blobsExternalized += 1;

    project.storageHybrid = true;
    project.requirementsInDb = true;
    project.updatedAt = project.updatedAt || nowIso();

    const disk = blobStore.prepareProjectForDisk(project);
    await storeLayer.writeProjectBlob(disk);

    storeLayer.loadedProjects.set(projectId, {
      ...project,
      requirements: reqs,
    });

    projectsMigrated += 1;
  }

  index.users = [];
  index.activity = [];
  index.meta = index.meta || {};
  index.meta.storageLayout = 'hybrid-v2';
  index.meta.updatedAt = nowIso();
  index.meta.activityInDb = true;
  index.meta.usersInDb = true;
  await writeJson(indexPath, index, { compact: true });

  sqliteStore.markHybridLayout();

  return {
    migrated: true,
    projectsMigrated,
    blobsExternalized,
    users: users.length,
    activity: activity.length,
  };
}

module.exports = { migrateToHybridStorage };
