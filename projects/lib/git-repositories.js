/**
 * The link between a project and the Git repository its work actually happens in.
 *
 * The repository is the workspace: agents commit there, and the platform reads it back
 * to see progress. Nothing here writes code — it records the binding and observes.
 */
const { PROVIDERS, normalizeProviderId, parseRepositoryRef } = require('./git-provider-client');

function text(value, fallback = '') {
  const result = value === null || value === undefined ? '' : String(value).trim();
  return result || fallback;
}

function normalizeProjectRepository(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const owner = text(raw.owner);
  const name = text(raw.name);
  if (!owner || !name) return null;
  const provider = normalizeProviderId(raw.provider);
  return {
    provider,
    providerLabel: PROVIDERS[provider]?.label || provider,
    owner,
    name,
    fullName: text(raw.fullName, `${owner}/${name}`),
    url: text(raw.url),
    cloneUrl: text(raw.cloneUrl),
    sshUrl: text(raw.sshUrl),
    defaultBranch: text(raw.defaultBranch, 'main'),
    visibility: text(raw.visibility, 'private'),
    providerProjectId: text(raw.providerProjectId || raw.projectId),
    // True when the platform provisioned it, false when an existing repo was attached.
    createdByPlatform: raw.createdByPlatform === true,
    linkedAt: text(raw.linkedAt),
    linkedBy: text(raw.linkedBy),
  };
}

/**
 * Turns a provider repository record into the project-side binding.
 */
function buildProjectRepository(repository, { createdByPlatform = false, actorUserId = '' } = {}) {
  return normalizeProjectRepository({
    ...repository,
    providerProjectId: repository.projectId,
    createdByPlatform,
    linkedAt: new Date().toISOString(),
    linkedBy: actorUserId,
  });
}

/**
 * Repository name from a project name: lowercase, ascii, hyphenated.
 * `Grupo Ferreira — Reservas` becomes `grupo-ferreira-reservas`.
 */
function suggestRepositoryName(projectName, prefix = '') {
  const slug = text(projectName)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  const base = slug || 'projeto';
  const cleanPrefix = text(prefix)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleanPrefix ? `${cleanPrefix}-${base}`.slice(0, 100) : base;
}

/**
 * What the platform can see of the work happening in the repository. Read-only:
 * commits, branches and open change requests, plus whether an OpenSpec tree exists yet.
 */
async function readRepositoryActivity(client, repository, { commitLimit = 20 } = {}) {
  const { owner, name, defaultBranch } = repository;
  const [branches, commits, changeRequests, openspecProject] = await Promise.all([
    client.listBranches(owner, name).catch(() => []),
    client.listCommits(owner, name, { limit: commitLimit }).catch(() => []),
    client.listOpenChangeRequests(owner, name).catch(() => []),
    client.readFile(owner, name, 'openspec/project.md', defaultBranch).catch(() => null),
  ]);
  return {
    branches,
    commits,
    changeRequests,
    openspec: {
      // The pipeline expects specs to live in the repo; this says whether they do yet.
      initialized: typeof openspecProject === 'string' && openspecProject.length > 0,
      path: 'openspec/',
    },
    lastCommitAt: commits[0]?.committedAt || '',
    observedAt: new Date().toISOString(),
  };
}

module.exports = {
  buildProjectRepository,
  normalizeProjectRepository,
  parseRepositoryRef,
  readRepositoryActivity,
  suggestRepositoryName,
};
