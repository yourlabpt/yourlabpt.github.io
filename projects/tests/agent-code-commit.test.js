const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const commit = require('../lib/agent-code-commit');
const workItems = require('../lib/work-items');
const personas = require('../lib/agent-personas');

const TASK = { id: 'task_abc12345', title: 'Implementar criacao de reserva' };
const REPO = { owner: 'yourlab', name: 'reservas', defaultBranch: 'main' };

function fakeClient() {
  const branches = { main: {} };
  const changeRequests = [];
  return {
    branches,
    changeRequests,
    async createBranch(o, n, branch, from = 'main') { branches[branch] = { ...(branches[from] || {}) }; },
    async writeFile(o, n, path, content, { branch = 'main' } = {}) {
      (branches[branch] = branches[branch] || {})[path] = content;
    },
    async createChangeRequest(o, n, { title, body, head }) {
      const record = { number: changeRequests.length + 1, url: `https://x.test/pr/${changeRequests.length + 1}`, branch: head, title, body };
      changeRequests.push(record);
      return record;
    },
  };
}

describe('repository path safety', () => {
  it('rejects traversal, absolute and git-internal paths', () => {
    assert.equal(commit.normalizeRepoPath('../../etc/passwd'), '');
    assert.equal(commit.normalizeRepoPath('/etc/passwd'), 'etc/passwd');
    assert.equal(commit.normalizeRepoPath('src/../../escape.js'), '');
    assert.equal(commit.normalizeRepoPath('.git/config'), '');
    assert.equal(commit.normalizeRepoPath('C:\\windows\\system32'), '');
    assert.equal(commit.normalizeRepoPath(''), '');
  });

  it('normalizes ordinary paths', () => {
    assert.equal(commit.normalizeRepoPath('./src/reservas/index.js'), 'src/reservas/index.js');
    assert.equal(commit.normalizeRepoPath('src\\reservas\\index.js'), 'src/reservas/index.js');
  });
});

describe('extracting code changes from an agent result', () => {
  it('accepts the shapes agents actually return', () => {
    for (const key of ['changedFiles', 'files', 'codeChanges']) {
      const extracted = commit.extractCodeChanges({ [key]: [{ path: 'src/a.js', content: 'x' }] });
      assert.equal(extracted.files.length, 1, `shape ${key} must be understood`);
    }
    const nested = commit.extractCodeChanges({ evidence: { changedFiles: [{ file: 'src/b.js', contents: 'y' }] } });
    assert.equal(nested.files[0].path, 'src/b.js');
    assert.equal(nested.files[0].content, 'y');
  });

  it('refuses a file that has a diff but no content', () => {
    const extracted = commit.extractCodeChanges({ changedFiles: [{ path: 'src/a.js', diff: '@@ -1 +1 @@' }] });
    assert.equal(extracted.files.length, 0);
    assert.match(extracted.rejected[0].reason, /sem conteudo/);
  });

  it('never performs a deletion automatically', () => {
    const extracted = commit.extractCodeChanges({
      changedFiles: [{ path: 'src/old.js', operation: 'delete', content: '' }],
    });
    assert.equal(extracted.files.length, 0);
    assert.match(extracted.rejected[0].reason, /remocao/);
  });

  it('drops a traversal path instead of writing outside the repo', () => {
    const extracted = commit.extractCodeChanges({
      changedFiles: [{ path: '../../.ssh/authorized_keys', content: 'ssh-rsa AAA' }],
    });
    assert.equal(extracted.files.length, 0);
    assert.equal(extracted.rejected.length, 1);
  });

  it('refuses an oversized file', () => {
    const extracted = commit.extractCodeChanges({
      changedFiles: [{ path: 'src/big.js', content: 'x'.repeat(commit.MAX_FILE_BYTES + 1) }],
    });
    assert.equal(extracted.files.length, 0);
    assert.match(extracted.rejected[0].reason, /demasiado grande/);
  });

  it('returns nothing for an empty or malformed result', () => {
    assert.deepEqual(commit.extractCodeChanges(null).files, []);
    assert.deepEqual(commit.extractCodeChanges({}).files, []);
    assert.deepEqual(commit.extractCodeChanges({ changedFiles: 'not an array' }).files, []);
  });
});

describe('module scope enforcement', () => {
  it('derives conventional paths from a module name', () => {
    const scope = commit.buildScope({ moduleName: 'Reservas' });
    assert.equal(commit.isInScope('src/reservas/index.js', scope), true);
    assert.equal(commit.isInScope('tests/reservas/index.test.js', scope), true);
    assert.equal(commit.isInScope('src/pagamentos/index.js', scope), false);
  });

  it('keeps a developer out of another module', () => {
    const scope = commit.buildScope({ modulePaths: ['src/reservas'] });
    const { allowed, outOfScope } = commit.partitionByScope([
      { path: 'src/reservas/index.js' },
      { path: 'src/pagamentos/index.js' },
      { path: 'src/reservas-outro/index.js' },
    ], scope);
    assert.deepEqual(allowed.map((f) => f.path), ['src/reservas/index.js']);
    assert.equal(outOfScope.length, 2, 'a sibling with a shared prefix is still another module');
  });

  it('treats an undeclared scope as unrestricted', () => {
    const scope = commit.buildScope({});
    assert.equal(scope.unrestricted, true);
    assert.equal(commit.isInScope('anything/at/all.js', scope), true);
  });

  it('only allows openspec writes when the task says so', () => {
    assert.equal(commit.isInScope('openspec/specs/x/spec.md', commit.buildScope({ modulePaths: ['src/a'] })), false);
    assert.equal(commit.isInScope('openspec/specs/x/spec.md', commit.buildScope({ modulePaths: ['src/a'], allowSpec: true })), true);
  });
});

describe('task write scope survives persistence', () => {
  // These fields were silently dropped once, which turned "one module only" into
  // "anywhere" without any error. Keep them pinned.
  it('keeps moduleName and repositoryPaths on a normalized work item', () => {
    const task = workItems.normalizeWorkItem({
      id: 't1', title: 'x', moduleName: 'Reservas', repositoryPaths: ['src/reservas', 'src/reservas'],
    }, {});
    assert.equal(task.moduleName, 'Reservas');
    assert.deepEqual(task.repositoryPaths, ['src/reservas'], 'duplicates collapse');
  });

  it('defaults to an empty scope rather than undefined', () => {
    const task = workItems.normalizeWorkItem({ id: 't2', title: 'y' }, {});
    assert.equal(task.moduleName, '');
    assert.deepEqual(task.repositoryPaths, []);
  });

  it('marks exactly the module-bound personas as needing a scope', () => {
    const byId = new Map(personas.listPersonas().map((persona) => [persona.id, persona]));
    assert.equal(byId.get('developer').scopedToSingleModule, true);
    assert.equal(byId.get('tester').scopedToSingleModule, true);
    assert.notEqual(byId.get('product_owner').scopedToSingleModule, true);
  });
});

describe('committing an approved result', () => {
  it('writes to a branch and opens a change request, never to main', async () => {
    const client = fakeClient();
    const result = await commit.commitApprovedChanges(client, REPO, {
      task: TASK,
      moduleName: 'Reservas',
      modulePaths: ['src/reservas'],
      agentId: 'code-agent',
      parsedOutput: {
        summary: 'Cria uma reserva.',
        changedFiles: [{ path: 'src/reservas/criar.js', content: 'export function criar() {}' }],
      },
    });

    assert.equal(result.committed, true);
    assert.equal(result.branch, 'agent/reservas-abc12345');
    assert.deepEqual(Object.keys(client.branches.main), [], 'main must stay untouched');
    assert.equal(client.branches[result.branch]['src/reservas/criar.js'], 'export function criar() {}');
    assert.equal(client.changeRequests.length, 1);
    assert.match(client.changeRequests[0].title, /^feat\(reservas\): Implementar criacao de reserva/);
  });

  it('writes the in-scope files and refuses the rest, naming them in the change request', async () => {
    const client = fakeClient();
    const result = await commit.commitApprovedChanges(client, REPO, {
      task: TASK,
      moduleName: 'Reservas',
      modulePaths: ['src/reservas'],
      parsedOutput: {
        changedFiles: [
          { path: 'src/reservas/criar.js', content: 'ok' },
          { path: 'src/pagamentos/stripe.js', content: 'nao devia' },
        ],
      },
    });

    assert.equal(result.committed, true);
    assert.equal(result.files.length, 1);
    assert.deepEqual(result.outOfScope.map((f) => f.path), ['src/pagamentos/stripe.js']);
    assert.equal(client.branches[result.branch]['src/pagamentos/stripe.js'], undefined, 'out-of-scope file must not be written');
    assert.match(client.changeRequests[0].body, /Fora do ambito/);
    assert.match(client.changeRequests[0].body, /src\/pagamentos\/stripe\.js/);
  });

  it('commits nothing when every file is out of scope', async () => {
    const client = fakeClient();
    const result = await commit.commitApprovedChanges(client, REPO, {
      task: TASK,
      modulePaths: ['src/reservas'],
      parsedOutput: { changedFiles: [{ path: 'src/pagamentos/a.js', content: 'x' }] },
    });
    assert.equal(result.committed, false);
    assert.match(result.reason, /fora do ambito/);
    assert.equal(client.changeRequests.length, 0);
    assert.deepEqual(Object.keys(client.branches), ['main']);
  });

  it('fails closed: a single-module agent with no declared scope writes nothing', async () => {
    const client = fakeClient();
    const result = await commit.commitApprovedChanges(client, REPO, {
      task: TASK,
      requireScope: true,
      parsedOutput: { changedFiles: [{ path: 'src/qualquer/coisa.js', content: 'x' }] },
    });
    assert.equal(result.committed, false);
    assert.match(result.reason, /ambito definido/);
    assert.equal(client.changeRequests.length, 0);
    assert.deepEqual(Object.keys(client.branches), ['main']);
  });

  it('still commits without a scope when the persona is not module-bound', async () => {
    const client = fakeClient();
    const result = await commit.commitApprovedChanges(client, REPO, {
      task: TASK,
      requireScope: false,
      parsedOutput: { changedFiles: [{ path: 'src/qualquer/coisa.js', content: 'x' }] },
    });
    assert.equal(result.committed, true);
  });

  it('commits nothing when the result carries no files', async () => {
    const client = fakeClient();
    const result = await commit.commitApprovedChanges(client, REPO, {
      task: TASK, parsedOutput: { summary: 'Analisei o codigo mas nao mudei nada.' },
    });
    assert.equal(result.committed, false);
    assert.equal(client.changeRequests.length, 0);
  });

  it('records ignored files in the change request body', async () => {
    const client = fakeClient();
    await commit.commitApprovedChanges(client, REPO, {
      task: TASK,
      parsedOutput: {
        changedFiles: [
          { path: 'src/a.js', content: 'ok' },
          { path: 'src/b.js', diff: 'no content' },
        ],
      },
    });
    assert.match(client.changeRequests[0].body, /Ignorados/);
    assert.match(client.changeRequests[0].body, /src\/b\.js/);
  });
});
