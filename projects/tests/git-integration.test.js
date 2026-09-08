const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const secretBox = require('../lib/secret-box');
const gitSettings = require('../lib/git-provider-settings');
const gitRepositories = require('../lib/git-repositories');
const { parseRepositoryRef, apiBaseUrlFor, normalizeProviderId } = require('../lib/git-provider-client');

const TOKEN = 'ghp_pretend_token_ABCDEFGH12345678';

async function tempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'git-provider-'));
}

describe('secret box', () => {
  it('round-trips a secret without writing it in the clear', async () => {
    const dir = await tempDir();
    const box = secretBox.encryptSecret(dir, TOKEN);
    assert.ok(box.data);
    assert.ok(!JSON.stringify(box).includes(TOKEN));
    assert.equal(secretBox.decryptSecret(dir, box), TOKEN);
  });

  it('returns null for an empty secret and empty string for a missing box', async () => {
    const dir = await tempDir();
    assert.equal(secretBox.encryptSecret(dir, ''), null);
    assert.equal(secretBox.decryptSecret(dir, null), '');
  });

  it('refuses to decrypt with a different key', async () => {
    const dirA = await tempDir();
    const dirB = await tempDir();
    const box = secretBox.encryptSecret(dirA, TOKEN);
    assert.throws(() => secretBox.decryptSecret(dirB, box), /decifrar/);
  });

  it('prefers an environment key over the key file', async () => {
    const dir = await tempDir();
    process.env.PLATFORM_SECRET_KEY = 'env-key-for-test';
    try {
      assert.equal(secretBox.keySource(dir), 'env:PLATFORM_SECRET_KEY');
      const box = secretBox.encryptSecret(dir, TOKEN);
      assert.equal(secretBox.decryptSecret(dir, box), TOKEN);
      // No key file is created when the environment supplies the key.
      assert.equal(fsSync.existsSync(path.join(dir, secretBox.KEY_FILE)), false);
    } finally {
      delete process.env.PLATFORM_SECRET_KEY;
    }
  });

  it('writes the fallback key file with owner-only permissions', async () => {
    const dir = await tempDir();
    secretBox.encryptSecret(dir, TOKEN);
    const mode = fsSync.statSync(path.join(dir, secretBox.KEY_FILE)).mode & 0o777;
    assert.equal(mode, 0o600);
  });
});

describe('git provider settings', () => {
  let dir;
  before(async () => { dir = await tempDir(); });

  it('never persists or returns the token in the clear', async () => {
    await gitSettings.writeGitProviderSettings(dir, {
      provider: 'github', account: 'yourlab', token: TOKEN,
    }, 'u1');

    const onDisk = await fs.readFile(path.join(dir, gitSettings.FILE_NAME), 'utf8');
    assert.equal(onDisk.includes(TOKEN), false);

    const settings = await gitSettings.readGitProviderSettings(dir);
    const publicView = gitSettings.publicGitProviderSettings(settings, dir);
    assert.equal(JSON.stringify(publicView).includes(TOKEN), false);
    assert.equal(publicView.hasToken, true);
    assert.ok(publicView.tokenFingerprint);
    assert.equal(publicView.token, undefined);
  });

  it('stores the settings file with owner-only permissions', async () => {
    const mode = fsSync.statSync(path.join(dir, gitSettings.FILE_NAME)).mode & 0o777;
    assert.equal(mode, 0o600);
  });

  it('keeps the stored token when other fields are saved', async () => {
    await gitSettings.writeGitProviderSettings(dir, { defaultOwner: 'yourlab-org' }, 'u1');
    assert.equal(await gitSettings.resolveGitToken(dir), TOKEN);
    const settings = await gitSettings.readGitProviderSettings(dir);
    assert.equal(settings.defaultOwner, 'yourlab-org');
  });

  it('clears the token only when an empty value is sent explicitly', async () => {
    await gitSettings.writeGitProviderSettings(dir, { token: '' }, 'u1');
    const settings = await gitSettings.readGitProviderSettings(dir);
    assert.equal(settings.token, null);
    await assert.rejects(() => gitSettings.resolveGitToken(dir), /Nenhum token Git configurado/);
  });

  it('drops a previous verification when the token changes', async () => {
    const fresh = await tempDir();
    await gitSettings.writeGitProviderSettings(fresh, { token: TOKEN }, 'u1');
    await gitSettings.markVerified(fresh, 'yourlab', 'u1');
    assert.ok((await gitSettings.readGitProviderSettings(fresh)).verifiedAt);
    await gitSettings.writeGitProviderSettings(fresh, { token: 'ghp_a_different_token_9999' }, 'u1');
    assert.equal((await gitSettings.readGitProviderSettings(fresh)).verifiedAt, '');
  });

  it('falls back to the provider default api url and rejects unknown providers', () => {
    assert.equal(normalizeProviderId('bitbucket'), 'github');
    assert.equal(apiBaseUrlFor('github', ''), 'https://api.github.com');
    assert.equal(apiBaseUrlFor('gitlab', ''), 'https://gitlab.com/api/v4');
    assert.equal(apiBaseUrlFor('github', 'https://ghe.local/api/v3/'), 'https://ghe.local/api/v3');
  });
});

describe('repository references', () => {
  it('accepts https, ssh and bare owner/name forms', () => {
    assert.deepEqual(parseRepositoryRef('https://github.com/yourlab/agico.git'), { owner: 'yourlab', name: 'agico' });
    assert.deepEqual(parseRepositoryRef('git@github.com:yourlab/agico.git'), { owner: 'yourlab', name: 'agico' });
    assert.deepEqual(parseRepositoryRef('yourlab/agico'), { owner: 'yourlab', name: 'agico' });
  });

  it('keeps nested gitlab groups in the owner', () => {
    assert.deepEqual(parseRepositoryRef('https://gitlab.com/grp/sub/proj'), { owner: 'grp/sub', name: 'proj' });
  });

  it('rejects a value with no owner', () => {
    assert.equal(parseRepositoryRef('agico'), null);
    assert.equal(parseRepositoryRef(''), null);
  });
});

describe('project repository binding', () => {
  it('slugs a project name into a repository name', () => {
    assert.equal(gitRepositories.suggestRepositoryName('Grupo Ferreira — Reservas'), 'grupo-ferreira-reservas');
    assert.equal(gitRepositories.suggestRepositoryName('Ação & Café'), 'acao-cafe');
    assert.equal(gitRepositories.suggestRepositoryName('Porto dos Ribeiros', 'yourlab'), 'yourlab-porto-dos-ribeiros');
    assert.equal(gitRepositories.suggestRepositoryName(''), 'projeto');
  });

  it('normalizes a provider repository into the project binding', () => {
    const binding = gitRepositories.buildProjectRepository({
      provider: 'github', owner: 'yourlab', name: 'agico', fullName: 'yourlab/agico',
      url: 'https://github.com/yourlab/agico', cloneUrl: 'https://github.com/yourlab/agico.git',
      defaultBranch: 'main', visibility: 'private', projectId: '42',
    }, { createdByPlatform: true, actorUserId: 'u1' });
    assert.equal(binding.fullName, 'yourlab/agico');
    assert.equal(binding.createdByPlatform, true);
    assert.equal(binding.providerProjectId, '42');
    assert.ok(binding.linkedAt);
  });

  it('treats an incomplete repository as unlinked', () => {
    assert.equal(gitRepositories.normalizeProjectRepository(null), null);
    assert.equal(gitRepositories.normalizeProjectRepository({ owner: 'yourlab' }), null);
    assert.equal(gitRepositories.normalizeProjectRepository({ name: 'agico' }), null);
  });

  it('reports whether the repository already carries an OpenSpec tree', async () => {
    const withSpec = await gitRepositories.readRepositoryActivity({
      listBranches: async () => [{ name: 'main', sha: 'abc' }],
      listCommits: async () => [{ sha: 'abc1234', message: 'init', author: 'yourlab', committedAt: '2026-09-01T10:00:00Z' }],
      listOpenChangeRequests: async () => [],
      readFile: async () => '# Projecto',
    }, { owner: 'yourlab', name: 'agico', defaultBranch: 'main' });
    assert.equal(withSpec.openspec.initialized, true);
    assert.equal(withSpec.lastCommitAt, '2026-09-01T10:00:00Z');

    const withoutSpec = await gitRepositories.readRepositoryActivity({
      listBranches: async () => [],
      listCommits: async () => [],
      listOpenChangeRequests: async () => [],
      readFile: async () => null,
    }, { owner: 'yourlab', name: 'agico', defaultBranch: 'main' });
    assert.equal(withoutSpec.openspec.initialized, false);
    assert.equal(withoutSpec.lastCommitAt, '');
  });

  it('survives a provider call failing without losing the rest', async () => {
    const activity = await gitRepositories.readRepositoryActivity({
      listBranches: async () => { throw new Error('403'); },
      listCommits: async () => [{ sha: 'a', message: 'm', author: 'x', committedAt: '' }],
      listOpenChangeRequests: async () => { throw new Error('403'); },
      readFile: async () => null,
    }, { owner: 'o', name: 'n', defaultBranch: 'main' });
    assert.deepEqual(activity.branches, []);
    assert.equal(activity.commits.length, 1);
  });
});
