/**
 * Git provider configuration: which host, which account, and the token used to
 * create and read repositories on the operator's behalf.
 *
 * Stored in its own gitignored file, never in the tracked data JSON, and the token
 * is always encrypted at rest.
 */
const fs = require('fs').promises;
const path = require('path');
const secretBox = require('./secret-box');
const { PROVIDERS, apiBaseUrlFor, normalizeProviderId } = require('./git-provider-client');

const FILE_NAME = 'git-provider.secret.json';
const VISIBILITIES = new Set(['private', 'public']);

function text(value, fallback = '') {
  const result = value === null || value === undefined ? '' : String(value).trim();
  return result || fallback;
}

function settingsPath(dataDir) {
  return path.join(dataDir, FILE_NAME);
}

function normalizeSettings(raw = {}) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const provider = normalizeProviderId(src.provider);
  const visibility = text(src.defaultVisibility, 'private');
  return {
    schemaVersion: 1,
    provider,
    apiBaseUrl: apiBaseUrlFor(provider, src.apiBaseUrl),
    account: text(src.account),
    // Empty means "the authenticated account's own namespace".
    defaultOwner: text(src.defaultOwner),
    defaultVisibility: VISIBILITIES.has(visibility) ? visibility : 'private',
    repositoryPrefix: text(src.repositoryPrefix),
    token: src.token && typeof src.token === 'object' ? src.token : null,
    verifiedAt: text(src.verifiedAt),
    verifiedAccount: text(src.verifiedAccount),
    updatedAt: text(src.updatedAt),
    updatedBy: text(src.updatedBy),
  };
}

async function readGitProviderSettings(dataDir) {
  try {
    const raw = await fs.readFile(settingsPath(dataDir), 'utf8');
    return normalizeSettings(JSON.parse(raw));
  } catch (error) {
    if (error?.code === 'ENOENT') return normalizeSettings({});
    throw error;
  }
}

/**
 * Never returns the token. `tokenHint` proves a credential is stored and which one,
 * without putting the secret on the wire.
 */
function publicGitProviderSettings(settings, dataDir) {
  const value = normalizeSettings(settings);
  return {
    provider: value.provider,
    providerLabel: PROVIDERS[value.provider]?.label || value.provider,
    apiBaseUrl: value.apiBaseUrl,
    account: value.account,
    defaultOwner: value.defaultOwner,
    defaultVisibility: value.defaultVisibility,
    repositoryPrefix: value.repositoryPrefix,
    hasToken: Boolean(value.token?.data),
    tokenFingerprint: text(value.token?.fingerprint),
    keySource: dataDir ? secretBox.keySource(dataDir) : 'unknown',
    verifiedAt: value.verifiedAt,
    verifiedAccount: value.verifiedAccount,
    updatedAt: value.updatedAt,
    updatedBy: value.updatedBy,
    availableProviders: Object.values(PROVIDERS).map((entry) => ({
      id: entry.id, label: entry.label, defaultApiBaseUrl: entry.defaultApiBaseUrl,
    })),
  };
}

async function writeGitProviderSettings(dataDir, patch = {}, actorUserId = '') {
  const current = await readGitProviderSettings(dataDir);
  const src = patch && typeof patch === 'object' ? patch : {};

  // An absent token field leaves the stored credential alone; an explicit empty
  // string clears it. Anything else replaces it.
  let token = current.token;
  if (src.token !== undefined) {
    const incoming = text(src.token);
    token = incoming ? secretBox.encryptSecret(dataDir, incoming) : null;
  }

  const next = normalizeSettings({
    ...current,
    ...src,
    token,
    // A new token invalidates a previous verification.
    ...(src.token !== undefined ? { verifiedAt: '', verifiedAccount: '' } : {}),
    updatedAt: new Date().toISOString(),
    updatedBy: actorUserId,
  });

  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(settingsPath(dataDir), `${JSON.stringify(next, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  await fs.chmod(settingsPath(dataDir), 0o600).catch(() => {});
  return next;
}

async function markVerified(dataDir, account, actorUserId = '') {
  const current = await readGitProviderSettings(dataDir);
  const next = normalizeSettings({
    ...current,
    account: text(account, current.account),
    verifiedAt: new Date().toISOString(),
    verifiedAccount: text(account),
    updatedAt: new Date().toISOString(),
    updatedBy: actorUserId,
  });
  await fs.writeFile(settingsPath(dataDir), `${JSON.stringify(next, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  return next;
}

/** Decrypts the stored token. Throws a clear error when nothing is configured. */
async function resolveGitToken(dataDir) {
  const settings = await readGitProviderSettings(dataDir);
  if (!settings.token?.data) {
    throw new Error('Nenhum token Git configurado. Configure em Definicoes -> Repositorios Git.');
  }
  return secretBox.decryptSecret(dataDir, settings.token);
}

module.exports = {
  FILE_NAME,
  markVerified,
  normalizeSettings,
  publicGitProviderSettings,
  readGitProviderSettings,
  resolveGitToken,
  writeGitProviderSettings,
};
