#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const engineering = require('../lib/engineering-state');
const deliveryOs = require('../lib/delivery-os');
const { createSqliteStore } = require('../lib/sqlite-store');

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

function main() {
  const projectId = String(process.argv[2] || '').trim();
  if (!/^prj_[A-Za-z0-9-]+$/.test(projectId)) {
    fail('Usage: node projects/scripts/enable-engineering-pilot.js <project-id>');
    return;
  }
  const dataDir = path.resolve(__dirname, '..', 'data');
  const projectPath = path.join(dataDir, 'projects', `${projectId}.json`);
  if (!fs.existsSync(projectPath)) {
    fail(`Project not found: ${projectId}`);
    return;
  }
  const project = JSON.parse(fs.readFileSync(projectPath, 'utf8'));
  if (project.id !== projectId) {
    fail(`Project identity mismatch in ${projectPath}`);
    return;
  }

  const alreadyEnabled = project.featureFlags?.engineering_state_v1 === true;
  if (!alreadyEnabled) {
    const snapshot = deliveryOs.createProjectSnapshot(
      project,
      'Before Engineering State V1 pilot',
      'migration:engineering-state-v1',
      'discovery',
    );
    project.versionSnapshots = [snapshot, ...(Array.isArray(project.versionSnapshots)
      ? project.versionSnapshots : [])].slice(0, 50);
  }
  project.deliveryLevel = ['standard', 'complete'].includes(project.deliveryLevel)
    ? project.deliveryLevel : 'standard';
  project.featureFlags = { ...(project.featureFlags || {}), engineering_state_v1: true };
  project.engineeringState = engineering.normalizeState(project.engineeringState);
  project.engineeringChangeSets = Array.isArray(project.engineeringChangeSets)
    ? project.engineeringChangeSets : [];
  const migratedAt = new Date().toISOString();
  project.engineeringProjectionV1 = {
    schemaVersion: 1,
    revision: project.engineeringState.revision,
    mode: 'shadow',
    updatedAt: migratedAt,
  };
  project.updatedAt = migratedAt;

  const temporaryPath = `${projectPath}.engineering-v1.tmp`;
  fs.writeFileSync(temporaryPath, JSON.stringify(project), { mode: 0o600 });
  fs.renameSync(temporaryPath, projectPath);

  const sqlite = createSqliteStore({ dataDir });
  try {
    const projection = sqlite.saveEngineeringProjection(
      project.id,
      project.engineeringState,
      project.engineeringChangeSets,
    );
    const stats = sqlite.getEngineeringProjectionStats(project.id);
    process.stdout.write(`${JSON.stringify({
      projectId: project.id,
      projectName: project.name,
      alreadyEnabled,
      engineeringRevision: project.engineeringState.revision,
      entities: project.engineeringState.entities.length,
      relationships: project.engineeringState.relationships.length,
      changeSets: project.engineeringChangeSets.length,
      projection,
      stats,
    }, null, 2)}\n`);
  } finally {
    sqlite.close();
  }
}

main();
