const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const format = require('../lib/openspec-format');
const sync = require('../lib/openspec-sync');
const repo = require('../lib/openspec-repository');

const PROJECT = { id: 'prj_1', name: 'Reservas Augusta', description: 'Reservas de mesas.' };

const PLATFORM_REQUIREMENTS = [
  {
    id: 'FR-001', type: 'functional', priority: 'high', module: 'Reservas',
    title: 'Criar reserva', shall: 'O sistema DEVE permitir criar uma reserva.',
    rationale: 'Fluxo principal.',
  },
  {
    id: 'RNF-001', type: 'non_functional', priority: 'medium', module: 'Reservas',
    title: 'Tempo de resposta', shall: 'A confirmacao DEVE aparecer em menos de 2s.',
  },
  {
    id: 'TC-001', type: 'test_case', module: 'Reservas', title: 'Reserva valida',
    condition: 'o cliente escolhe uma mesa livre', measure: 'a reserva fica confirmada',
    hierarchyLinks: [{ role: 'parent', targetId: 'FR-001', linkType: 'verified_by' }],
  },
  {
    id: 'STK-001', type: 'stakeholder', module: 'Reservas', title: 'Encher o restaurante',
    shall: 'O dono quer mais mesas ocupadas.',
  },
];

describe('openspec format', () => {
  it('round-trips a spec without losing ids, scenarios or rationale', () => {
    const spec = {
      capability: 'reservas', title: 'Reservas', module: 'Reservas', purpose: 'Gerir reservas.',
      requirements: [{
        id: 'FR-001', type: 'functional', priority: 'high', module: 'Reservas',
        title: 'Criar reserva', shall: 'O sistema DEVE permitir criar uma reserva.',
        rationale: 'Fluxo principal.',
        scenarios: [{ id: 'TC-001', requirementId: 'FR-001', title: 'Reserva valida', when: 'ha mesa livre', then: 'fica confirmada' }],
      }],
    };
    const parsed = format.parseSpec(format.serializeSpec(spec), { capability: 'reservas' });
    assert.equal(parsed.capability, 'reservas');
    assert.equal(parsed.purpose, 'Gerir reservas.');
    const [requirement] = parsed.requirements;
    assert.equal(requirement.id, 'FR-001');
    assert.equal(requirement.priority, 'high');
    assert.equal(requirement.shall, 'O sistema DEVE permitir criar uma reserva.');
    assert.equal(requirement.rationale, 'Fluxo principal.');
    assert.equal(requirement.scenarios[0].id, 'TC-001');
    assert.equal(requirement.scenarios[0].when, 'ha mesa livre');
    assert.equal(requirement.scenarios[0].then, 'fica confirmada');
  });

  it('parses a hand-written spec that carries no platform metadata', () => {
    const parsed = format.parseSpec([
      '# Pagamentos Specification',
      '',
      '## Purpose',
      '',
      'Receber pagamentos no local.',
      '',
      '## Requirements',
      '',
      '### Requirement: Pagar com cartao',
      'O sistema SHALL aceitar cartoes Visa e Mastercard.',
      '',
      '#### Scenario: Cartao valido',
      '- **WHEN** o cartao e aceite',
      '- **THEN** o recibo e emitido',
    ].join('\n'), { capability: 'pagamentos' });

    assert.equal(parsed.purpose, 'Receber pagamentos no local.');
    assert.equal(parsed.requirements.length, 1);
    assert.equal(parsed.requirements[0].id, '');
    assert.equal(parsed.requirements[0].title, 'Pagar com cartao');
    assert.equal(parsed.requirements[0].scenarios[0].then, 'o recibo e emitido');
  });

  it('folds GIVEN and AND into the surrounding when/then', () => {
    const parsed = format.parseScenarioBody([
      '- **GIVEN** existe uma reserva',
      '- **WHEN** o cliente cancela',
      '- **THEN** a mesa fica livre',
      '- **AND** o dono e notificado',
    ]);
    assert.match(parsed.when, /existe uma reserva/);
    assert.match(parsed.when, /o cliente cancela/);
    assert.match(parsed.then, /a mesa fica livre/);
    assert.match(parsed.then, /o dono e notificado/);
  });

  it('round-trips a task list with module tags', () => {
    const tasks = [
      { done: true, title: 'Criar modelo de reserva', module: 'reservas' },
      { done: false, title: 'Ecra de confirmacao', module: '' },
    ];
    const parsed = format.parseTasks(format.serializeTasks(tasks));
    assert.deepEqual(parsed, [
      { done: true, title: 'Criar modelo de reserva', module: 'reservas' },
      { done: false, title: 'Ecra de confirmacao', module: '' },
    ]);
  });

  it('parses delta sections into their operations', () => {
    const delta = format.parseDelta([
      '## ADDED Requirements',
      '### Requirement: Cancelar reserva',
      'O sistema SHALL permitir cancelar.',
      '## REMOVED Requirements',
      '### Requirement: Reserva por SMS',
      'Descontinuado.',
    ].join('\n'));
    assert.equal(delta.added.length, 1);
    assert.equal(delta.added[0].title, 'Cancelar reserva');
    assert.equal(delta.removed.length, 1);
    assert.equal(delta.modified.length, 0);
  });

  it('slugs capability names into safe paths', () => {
    assert.equal(format.specPath('Gestão de Reservas'), 'openspec/specs/gestao-de-reservas/spec.md');
    assert.equal(format.changePath('Nova Função', 'proposal.md'), 'openspec/changes/nova-funcao/proposal.md');
  });
});

describe('forward: platform to openspec', () => {
  it('groups requirements by module and nests their scenarios', () => {
    const specs = sync.buildSpecsFromRequirements(PLATFORM_REQUIREMENTS);
    assert.equal(specs.length, 1);
    assert.equal(specs[0].capability, 'reservas');
    // Stakeholder requirements are not part of a capability spec.
    assert.deepEqual(specs[0].requirements.map((entry) => entry.id), ['FR-001', 'RNF-001']);
    assert.equal(specs[0].requirements[0].scenarios[0].id, 'TC-001');
    assert.equal(specs[0].requirements[1].scenarios.length, 0);
  });

  it('produces project.md plus one spec.md per capability', () => {
    const { files } = sync.buildRepositoryFiles(PROJECT, PLATFORM_REQUIREMENTS);
    assert.deepEqual(files.map((file) => file.path), [
      'openspec/project.md',
      'openspec/specs/reservas/spec.md',
    ]);
    assert.match(files[0].content, /Reservas Augusta/);
  });

  it('keeps a scenario whose parent requirement is missing', () => {
    const specs = sync.buildSpecsFromRequirements([
      { id: 'TC-900', type: 'test_case', module: 'Reservas', title: 'Orfao', condition: 'x', measure: 'y' },
    ]);
    const holder = specs[0].requirements.find((entry) => entry.id === '__unassigned__');
    assert.ok(holder, 'orphan scenarios must not be dropped');
    assert.equal(holder.scenarios[0].id, 'TC-900');
  });

  it('falls back to a "geral" capability when a requirement has no module', () => {
    const specs = sync.buildSpecsFromRequirements([
      { id: 'FR-050', type: 'functional', title: 'Sem modulo', shall: 'algo' },
    ]);
    assert.equal(specs[0].capability, 'geral');
  });
});

describe('backward: openspec to platform', () => {
  it('turns requirements and scenarios into platform records', () => {
    const specs = [format.parseSpec(format.serializeSpec({
      capability: 'reservas', title: 'Reservas', module: 'Reservas', purpose: 'p',
      requirements: [{
        id: 'FR-001', type: 'functional', title: 'Criar reserva', shall: 'DEVE criar.',
        scenarios: [{ id: 'TC-001', title: 'Valida', when: 'a', then: 'b' }],
      }],
    }), { capability: 'reservas' })];

    const records = sync.buildRequirementsFromSpecs(specs);
    const functional = records.find((entry) => entry.type === 'functional');
    const testCase = records.find((entry) => entry.type === 'test_case');
    assert.equal(functional.id, 'FR-001');
    assert.equal(functional.module, 'Reservas');
    assert.equal(functional.deliveryStageId, 'requirements');
    assert.equal(testCase.id, 'TC-001');
    assert.equal(testCase.condition, 'a');
    assert.equal(testCase.measure, 'b');
    assert.equal(testCase.linkedFunctionalRequirement, 'FR-001');
    assert.equal(testCase.deliveryStageId, 'validation');
  });

  it('mints ids for a hand-written spec and never collides with existing ones', () => {
    const specs = [format.parseSpec([
      '# Pagamentos Specification',
      '## Requirements',
      '### Requirement: Pagar com cartao',
      'SHALL aceitar cartoes.',
      '#### Scenario: Valido',
      '- **WHEN** a',
      '- **THEN** b',
    ].join('\n'), { capability: 'pagamentos' })];

    const records = sync.buildRequirementsFromSpecs(specs, {
      existingRequirements: [{ id: 'FR-001' }, { id: 'TC-001' }],
    });
    const ids = records.map((entry) => entry.id);
    assert.equal(ids.includes('FR-001'), false, 'must not reuse an existing id');
    assert.equal(ids.includes('TC-001'), false);
    assert.equal(new Set(ids).size, ids.length, 'ids must be unique');
  });

  it('reuses ids by module and title so repeated imports do not duplicate', () => {
    const spec = format.parseSpec([
      '# Pagamentos Specification',
      '## Requirements',
      '### Requirement: Pagar com cartao',
      'SHALL aceitar cartoes.',
      '#### Scenario: Cartao valido',
      '- **WHEN** a',
      '- **THEN** b',
    ].join('\n'), { capability: 'pagamentos' });
    spec.module = 'Pagamentos';

    const first = sync.buildRequirementsFromSpecs([spec], { existingRequirements: [] });
    // Importing the same unchanged spec again must land on the same ids.
    const second = sync.buildRequirementsFromSpecs([spec], { existingRequirements: first });
    assert.deepEqual(second.map((entry) => entry.id), first.map((entry) => entry.id));
  });

  it('still mints a fresh id for a genuinely new requirement', () => {
    const existing = [{ id: 'FR-001', type: 'functional', module: 'Pagamentos', title: 'Pagar com cartao' }];
    const spec = { capability: 'pagamentos', module: 'Pagamentos', requirements: [
      { id: '', type: 'functional', title: 'Pagar com cartao', shall: 'a', scenarios: [] },
      { id: '', type: 'functional', title: 'Pagar com MBWay', shall: 'b', scenarios: [] },
    ] };
    const records = sync.buildRequirementsFromSpecs([spec], { existingRequirements: existing });
    assert.equal(records[0].id, 'FR-001', 'known requirement keeps its id');
    assert.notEqual(records[1].id, 'FR-001', 'new requirement gets a new id');
  });

  it('survives a full platform -> repo -> platform round-trip', () => {
    const { files } = sync.buildRepositoryFiles(PROJECT, PLATFORM_REQUIREMENTS);
    const specMd = files.find((file) => file.path.endsWith('spec.md')).content;
    const back = sync.buildRequirementsFromSpecs([format.parseSpec(specMd, { capability: 'reservas' })]);

    const functional = back.find((entry) => entry.id === 'FR-001');
    const nonFunctional = back.find((entry) => entry.id === 'RNF-001');
    const testCase = back.find((entry) => entry.id === 'TC-001');
    assert.equal(functional.title, 'Criar reserva');
    assert.equal(functional.rationale, 'Fluxo principal.');
    assert.equal(nonFunctional.type, 'non_functional');
    assert.equal(testCase.linkedFunctionalRequirement, 'FR-001');
  });
});

describe('drift detection', () => {
  it('reports two identical sides as in sync', () => {
    const specs = sync.buildSpecsFromRequirements(PLATFORM_REQUIREMENTS);
    assert.equal(sync.diffSpecs(specs, specs).inSync, true);
  });

  it('names what exists on only one side', () => {
    const platform = sync.buildSpecsFromRequirements(PLATFORM_REQUIREMENTS);
    const diff = sync.diffSpecs(platform, []);
    assert.equal(diff.inSync, false);
    assert.equal(diff.summary.onlyInPlatform, 1);
    assert.equal(diff.changes[0].operation, 'only_in_platform');
  });

  it('detects an edited requirement', () => {
    const platform = sync.buildSpecsFromRequirements(PLATFORM_REQUIREMENTS);
    const edited = JSON.parse(JSON.stringify(platform));
    edited[0].requirements[0].shall = 'Texto alterado no repositorio.';
    const diff = sync.diffSpecs(platform, edited);
    assert.equal(diff.summary.differs, 1);
    assert.equal(diff.changes[0].requirementId, 'FR-001');
  });
});

/** In-memory stand-in for a Git host, so the whole flow runs without network. */
function fakeRepositoryClient(initialFiles = {}) {
  const branches = { main: { ...initialFiles } };
  const changeRequests = [];
  return {
    changeRequests,
    branches,
    async getRepository() { return { defaultBranch: 'main' }; },
    async listTree(owner, name, prefix = '', ref = 'main') {
      return Object.keys(branches[ref] || {}).filter((path) => path.startsWith(prefix));
    },
    async readFile(owner, name, path, ref = 'main') {
      return (branches[ref] || {})[path] ?? null;
    },
    async createBranch(owner, name, branch, from = 'main') {
      branches[branch] = { ...(branches[from] || {}) };
    },
    async writeFile(owner, name, path, content, { branch = 'main' } = {}) {
      branches[branch] = branches[branch] || {};
      branches[branch][path] = content;
    },
    async createChangeRequest(owner, name, { title, head }) {
      const record = { number: changeRequests.length + 1, url: `https://example.test/pr/${changeRequests.length + 1}`, branch: head, title };
      changeRequests.push(record);
      return record;
    },
    async listOpenChangeRequests() { return changeRequests; },
  };
}

describe('running openspec against a repository', () => {
  const repository = { owner: 'yourlab', name: 'reservas', defaultBranch: 'main' };

  it('initializes a repository onto a branch with a change request, not main', async () => {
    const client = fakeRepositoryClient();
    const result = await repo.initialize(client, repository, PROJECT, PLATFORM_REQUIREMENTS);

    assert.ok(result.branch.startsWith('openspec/init/'));
    assert.equal(result.changeRequest.number, 1);
    // The default branch must be untouched: review happens before anything lands.
    assert.deepEqual(Object.keys(client.branches.main), []);
    assert.ok(client.branches[result.branch]['openspec/project.md']);
    assert.ok(client.branches[result.branch]['openspec/specs/reservas/spec.md']);
  });

  it('refuses a second initialize while the first change request is still open', async () => {
    const client = fakeRepositoryClient();
    await repo.initialize(client, repository, PROJECT, PLATFORM_REQUIREMENTS);
    // The first init lives on a branch, so the default branch still has no openspec/.
    await assert.rejects(
      () => repo.initialize(client, repository, PROJECT, PLATFORM_REQUIREMENTS),
      /Ja existe um pedido aberto/
    );
    assert.equal(client.changeRequests.length, 1, 'must not open a duplicate change request');
  });

  it('refuses to initialize a repository that already has openspec/', async () => {
    const client = fakeRepositoryClient({ 'openspec/project.md': '# ja existe' });
    await assert.rejects(
      () => repo.initialize(client, repository, PROJECT, PLATFORM_REQUIREMENTS),
      /ja tem uma pasta openspec/
    );
  });

  it('reads specs back out of the repository', async () => {
    const client = fakeRepositoryClient();
    const result = await repo.initialize(client, repository, PROJECT, PLATFORM_REQUIREMENTS);
    const specs = await repo.readSpecs(client, repository, result.branch);
    assert.equal(specs.length, 1);
    assert.equal(specs[0].capability, 'reservas');
    assert.equal(specs[0].requirements.length, 2);
  });

  it('skips a push when the repository already matches the platform', async () => {
    const client = fakeRepositoryClient();
    const { files } = sync.buildRepositoryFiles(PROJECT, PLATFORM_REQUIREMENTS);
    for (const file of files) client.branches.main[file.path] = file.content;

    const result = await repo.push(client, repository, PROJECT, PLATFORM_REQUIREMENTS);
    assert.equal(result.skipped, true);
    assert.equal(client.changeRequests.length, 0, 'no change request for a no-op');
  });

  it('pushes a real difference onto a review branch', async () => {
    const client = fakeRepositoryClient();
    const result = await repo.push(client, repository, PROJECT, PLATFORM_REQUIREMENTS);
    assert.equal(result.skipped, undefined);
    assert.equal(client.changeRequests.length, 1);
    assert.ok(result.branch.startsWith('openspec/sync/'));
  });

  it('pulls an existing repository into platform requirements', async () => {
    const client = fakeRepositoryClient({
      'openspec/project.md': '# projecto',
      'openspec/specs/pagamentos/spec.md': [
        '# Pagamentos Specification',
        '## Purpose',
        'Receber pagamentos.',
        '## Requirements',
        '### Requirement: Pagar com cartao',
        'SHALL aceitar cartoes.',
        '#### Scenario: Cartao valido',
        '- **WHEN** o cartao e aceite',
        '- **THEN** o recibo e emitido',
      ].join('\n'),
    });

    const plan = await repo.pull(client, repository, { existingRequirements: [] });
    assert.equal(plan.empty, false);
    assert.equal(plan.specs.length, 1);
    const functional = plan.requirements.find((entry) => entry.type === 'functional');
    const testCase = plan.requirements.find((entry) => entry.type === 'test_case');
    assert.equal(functional.title, 'Pagar com cartao');
    assert.equal(functional.module, 'Pagamentos');
    assert.equal(testCase.condition, 'o cartao e aceite');
    assert.equal(testCase.linkedFunctionalRequirement, functional.id);
  });

  it('reports an empty repository rather than inventing requirements', async () => {
    const plan = await repo.pull(fakeRepositoryClient(), repository, {});
    assert.equal(plan.empty, true);
    assert.deepEqual(plan.requirements, []);
  });

  it('reports drift without writing anything', async () => {
    const client = fakeRepositoryClient({ 'openspec/project.md': '# p' });
    const report = await repo.status(client, repository, PLATFORM_REQUIREMENTS);
    assert.equal(report.initialized, true);
    assert.equal(report.platformRequirementCount, 2);
    assert.equal(report.repositoryRequirementCount, 0);
    assert.equal(report.diff.inSync, false);
    assert.equal(client.changeRequests.length, 0);
  });

  it('writes a change proposal with its delta', async () => {
    const client = fakeRepositoryClient();
    const result = await repo.proposeChange(client, repository, {
      title: 'Permitir cancelamento',
      why: 'Os clientes pedem.',
      whatChanges: ['Novo ecra de cancelamento'],
      affectedCapabilities: ['reservas'],
      tasks: [{ title: 'Endpoint de cancelamento', done: false }],
      deltas: {
        reservas: {
          added: [{ id: 'FR-010', title: 'Cancelar reserva', shall: 'DEVE permitir cancelar.', scenarios: [] }],
        },
      },
    });

    const written = client.branches[result.branch];
    assert.equal(result.changeId, 'permitir-cancelamento');
    assert.ok(written['openspec/changes/permitir-cancelamento/proposal.md']);
    assert.ok(written['openspec/changes/permitir-cancelamento/tasks.md']);
    assert.match(written['openspec/changes/permitir-cancelamento/specs/reservas/spec.md'], /ADDED Requirements/);
  });
});
