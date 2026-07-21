/**
 * Platform-wide agent execution defaults (single source of truth for new runs).
 */
const fs = require('fs').promises;
const path = require('path');
const workItems = require('./work-items');

const FILE_NAME = 'agent-platform-settings.json';

const DEFAULT_EXECUTION = {
  agentId: '',
  modelProfileId: 'medium',
  tokenBudgetMode: 'auto',
  maxTokens: 0,
  externalTokenBudgetMode: 'limited',
  externalMaxTokens: 120000,
  maxCost: 0,
  maxWallClockMinutes: 0,
  targetInputTokens: 14000,
  targetOutputTokens: 2500,
  planningWaveSize: 8,
  maxTotalSteps: 0,
  checkpointIntervalSeconds: 30,
  goalCheckInterval: 3,
  enableWebSearch: true,
  pauseForSubtaskReview: false,
  allowedMcpTools: [],
};

function settingsPath(dataDir) {
  return path.join(dataDir, FILE_NAME);
}

function stripNormalizedTokenPolicy(settings = {}) {
  if (!settings || typeof settings !== 'object') return {};
  const { tokenPolicy, ...rest } = settings;
  return {
    ...rest,
    ...(tokenPolicy?.external?.mode === 'limited' && tokenPolicy.external.maxTokens
      ? { externalMaxTokens: tokenPolicy.external.maxTokens, externalTokenBudgetMode: 'limited' }
      : {}),
    ...(tokenPolicy?.local?.mode === 'limited' && tokenPolicy.local.maxTokens
      ? { maxTokens: tokenPolicy.local.maxTokens, tokenBudgetMode: 'limited' }
      : {}),
  };
}

function normalizePlatformSettings(raw = {}) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const executionDefaults = workItems.normalizeExecutionSettings({
    ...DEFAULT_EXECUTION,
    ...(src.executionDefaults || {}),
    costPolicy: {
      mode: Number(src.executionDefaults?.maxCost) > 0 ? 'limited' : 'unlimited',
      maxCost: Number(src.executionDefaults?.maxCost) || 0,
    },
    checkpointPolicy: {
      intervalSeconds: Number(src.executionDefaults?.checkpointIntervalSeconds) || DEFAULT_EXECUTION.checkpointIntervalSeconds,
    },
    reviewPolicy: {
      subtask: src.executionDefaults?.pauseForSubtaskReview === true ? 'blocking' : 'non_blocking',
      parent: 'required',
    },
  });
  return {
    schemaVersion: 1,
    executionDefaults,
    updatedAt: workItems.textOr(src.updatedAt),
    updatedBy: workItems.textOr(src.updatedBy),
  };
}

async function readAgentPlatformSettings(dataDir) {
  try {
    const raw = await fs.readFile(settingsPath(dataDir), 'utf8');
    return normalizePlatformSettings(JSON.parse(raw));
  } catch (error) {
    if (error?.code === 'ENOENT') return normalizePlatformSettings({});
    throw error;
  }
}

async function writeAgentPlatformSettings(dataDir, patch = {}, actorUserId = '') {
  const current = await readAgentPlatformSettings(dataDir);
  const next = normalizePlatformSettings({
    ...current,
    executionDefaults: {
      ...stripNormalizedTokenPolicy(current.executionDefaults),
      ...(patch.executionDefaults || {}),
    },
    updatedAt: new Date().toISOString(),
    updatedBy: actorUserId,
  });
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(settingsPath(dataDir), `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  return next;
}

function mergeWithPlatformDefaults(taskSettings, platformSettings) {
  const platform = normalizePlatformSettings(platformSettings).executionDefaults;
  const task = taskSettings && typeof taskSettings === 'object' ? taskSettings : {};
  const merged = workItems.normalizeExecutionSettings({
    ...stripNormalizedTokenPolicy(platform),
    ...stripNormalizedTokenPolicy(task),
    allowedMcpTools: task.allowedMcpTools?.length ? task.allowedMcpTools : platform.allowedMcpTools,
  });
  return merged;
}

module.exports = {
  DEFAULT_EXECUTION,
  normalizePlatformSettings,
  readAgentPlatformSettings,
  writeAgentPlatformSettings,
  mergeWithPlatformDefaults,
};
