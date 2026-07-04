const fs = require('fs').promises;
const path = require('path');

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function snapshotDir(dataDir, projectId) {
  return path.join(dataDir, 'snapshots', String(projectId).replace(/[^a-zA-Z0-9_-]/g, '_'));
}

function snapshotFilePath(dataDir, projectId, snapshotId) {
  return path.join(snapshotDir(dataDir, projectId), `${String(snapshotId).replace(/[^a-zA-Z0-9_-]/g, '_')}.json`);
}

async function fileExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function loadSnapshotData(dataDir, projectId, snapshotId) {
  const filePath = snapshotFilePath(dataDir, projectId, snapshotId);
  if (!(await fileExists(filePath))) return null;
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

async function saveSnapshotData(dataDir, projectId, snapshotId, snapshotData, writeJson) {
  const dir = snapshotDir(dataDir, projectId);
  await fs.mkdir(dir, { recursive: true });
  const filePath = snapshotFilePath(dataDir, projectId, snapshotId);
  await writeJson(filePath, snapshotData, { compact: true });
}

/**
 * Move inline snapshot bodies to external files to shrink hot project JSON.
 */
async function externalizeProjectSnapshots(project, dataDir, writeJson) {
  if (!project?.id) return false;
  let changed = false;
  const snaps = ensureArray(project.versionSnapshots);
  for (const snap of snaps) {
    const data = snap?.snapshotData;
    if (!data || typeof data !== 'object' || !Object.keys(data).length) continue;
    await saveSnapshotData(dataDir, project.id, snap.id, data, writeJson);
    snap.snapshotData = {};
    snap.snapshotStoredExternally = true;
    changed = true;
  }
  return changed;
}

/**
 * Strip inline bodies after load (keeps metadata in project file).
 */
async function compactProjectSnapshotsOnRead(project, dataDir, writeJson) {
  return externalizeProjectSnapshots(project, dataDir, writeJson);
}

async function resolveSnapshotData(project, snapshotId, dataDir) {
  const snap = ensureArray(project?.versionSnapshots).find((s) => s.id === snapshotId);
  if (!snap) return null;
  if (snap.snapshotData && Object.keys(snap.snapshotData).length) {
    return snap.snapshotData;
  }
  if (snap.snapshotStoredExternally && project?.id) {
    return loadSnapshotData(dataDir, project.id, snapshotId);
  }
  return null;
}

module.exports = {
  externalizeProjectSnapshots,
  compactProjectSnapshotsOnRead,
  resolveSnapshotData,
  loadSnapshotData,
  saveSnapshotData,
};
