const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const personas = require('../lib/agent-personas');
const { normalizePlatformSettings, mergeWithPlatformDefaults } = require('../lib/agent-platform-settings');

const RUNTIME_CAPABILITIES = {
  protocol: { id: 'yourlab.agent-dispatch', versions: [1, 2] },
  agents: [
    {
      id: 'product-owner-agent',
      name: 'Product Owner',
      taskTypes: ['spec_authoring', 'requirements_analysis'],
      tools: [
        'project.read', 'documents.read', 'requirements.read', 'requirements.write',
        'openspec.read', 'openspec.write', 'repo.read',
      ],
    },
    {
      id: 'code-agent',
      name: 'Single-Task Code Agent',
      taskTypes: ['code_implementation'],
      tools: [
        'project.read', 'documents.read', 'openspec.read', 'contracts.read',
        'repo.search', 'repo.read', 'repo.patch', 'tests.run', 'diff.read',
      ],
    },
    {
      id: 'half-equipped-tester',
      name: 'Partial Tester',
      taskTypes: ['module_verification'],
      tools: ['project.read', 'repo.read'],
    },
  ],
  tools: [],
};

describe('agent persona registry', () => {
  it('exposes the pipeline roles in order', () => {
    const list = personas.listPersonas();
    assert.deepEqual(list.map((persona) => persona.id), [
      'product_owner', 'ux', 'module_architect', 'orchestrator', 'tech_lead', 'developer', 'tester',
    ]);
    assert.deepEqual(list.map((persona) => persona.order), [1, 2, 3, 4, 5, 6, 7]);
  });

  it('gives the task author a stronger model than the implementer', () => {
    const byId = new Map(personas.listPersonas().map((persona) => [persona.id, persona]));
    assert.equal(byId.get('tech_lead').modelProfileId, 'large');
    // Never below 7B: the developer must hold a spec and emit whole files.
    assert.equal(byId.get('developer').modelProfileId, 'medium');
    assert.equal(personas.runtimeTierFor(byId.get('developer').modelProfileId), 'standard');
  });

  it('keeps planning away from the developer', () => {
    const developer = personas.listPersonas().find((persona) => persona.id === 'developer');
    assert.deepEqual(developer.consumes, ['implementation_task', 'interface_contract']);
    assert.equal(developer.requiresUpstream.includes('tech_lead'), true);
  });

  it('only lets the build and test roles write code', () => {
    const byId = new Map(personas.listPersonas().map((persona) => [persona.id, persona]));
    assert.equal(byId.get('product_owner').canWriteCode, false);
    assert.equal(byId.get('ux').canWriteCode, false);
    assert.equal(byId.get('module_architect').canWriteCode, false);
    assert.equal(byId.get('orchestrator').canWriteCode, false);
    assert.equal(byId.get('developer').canWriteCode, true);
    assert.equal(byId.get('tester').canWriteCode, true);
  });

  it('maps platform model profiles onto runtime tiers', () => {
    assert.equal(personas.runtimeTierFor('small'), 'fast');
    assert.equal(personas.runtimeTierFor('medium'), 'standard');
    assert.equal(personas.runtimeTierFor('large'), 'heavy');
    assert.equal(personas.runtimeTierFor('max'), 'max');
    assert.equal(personas.runtimeTierFor('nonsense'), 'standard');
  });

  it('keeps role contract fields out of operator overrides', () => {
    const override = personas.normalizePersonaOverride('product_owner', {
      modelProfileId: 'max',
      writeScope: 'module_code',
      produces: ['code_change'],
    });
    assert.equal(override.modelProfileId, 'max');
    assert.equal(override.writeScope, undefined);
    const resolved = personas.resolvePersona('product_owner', { product_owner: override });
    assert.equal(resolved.writeScope, 'spec');
    assert.equal(resolved.canWriteCode, false);
  });

  it('binds personas to runtime agents and explains the misses', () => {
    const report = personas.personaBindingReport(RUNTIME_CAPABILITIES);
    const byId = new Map(report.map((row) => [row.personaId, row]));

    assert.equal(byId.get('product_owner').satisfied, true);
    assert.equal(byId.get('product_owner').boundAgentId, 'product-owner-agent');

    assert.equal(byId.get('developer').satisfied, true);
    assert.equal(byId.get('developer').boundAgentId, 'code-agent');

    // The tester candidate matches the task type but is missing tools it needs.
    const tester = byId.get('tester');
    assert.equal(tester.satisfied, false);
    const candidate = tester.candidates.find((entry) => entry.agentId === 'half-equipped-tester');
    assert.equal(candidate.typeMatch, true);
    assert.ok(candidate.missingTools.includes('tests.run'));

    // No runtime agent declares UX work at all.
    assert.equal(byId.get('ux').satisfied, false);
    assert.equal(byId.get('ux').candidates.every((entry) => !entry.typeMatch), true);
  });

  it('flags a pinned agent that the runtime no longer offers', () => {
    const report = personas.personaBindingReport(RUNTIME_CAPABILITIES, {
      developer: { agentId: 'agent-that-left' },
    });
    const developer = report.find((row) => row.personaId === 'developer');
    assert.equal(developer.pinnedAgentMissing, true);
    assert.equal(developer.satisfied, false);
  });

  it('rejects out-of-scope work before a package is frozen', () => {
    assert.deepEqual(personas.personaViolations('product_owner', { writesCode: true }), ['write-scope:spec']);
    assert.deepEqual(personas.personaViolations('developer', { writesCode: true, moduleIds: ['m1'] }), []);
    assert.ok(personas.personaViolations('developer', { moduleIds: ['m1', 'm2'] }).includes('multi-modulo'));
    assert.ok(personas.personaViolations('ux', { deliveryStageId: 'implementation' }).includes('fase:implementation'));
    assert.ok(personas
      .personaViolations('module_architect', { availableArtifacts: ['ux_mockup_approved'] })
      .includes('falta-artefacto:openspec_change'));
  });

  it('lets a developer refuse a task that is missing its basics', () => {
    // The developer never plans, so anything absent has to go back to the Tech Lead.
    assert.deepEqual(
      personas.developerTaskGaps({}),
      ['input', 'output', 'functionDescription', 'scope']
    );
    assert.deepEqual(
      personas.developerTaskGaps({ input: 'a', output: 'b', functionDescription: 'c', moduleName: 'Reservas' }),
      []
    );
    assert.deepEqual(
      personas.developerTaskGaps({ input: 'a', output: 'b', moduleName: 'Reservas' }),
      ['functionDescription']
    );
    // Repository paths are an acceptable substitute for a module name.
    assert.deepEqual(
      personas.developerTaskGaps({ input: 'a', output: 'b', functionDescription: 'c', repositoryPaths: ['src/x'] }),
      []
    );
  });

  it('lets a disabled persona block its own dispatch', () => {
    const violations = personas.personaViolations('tester', {}, { tester: { enabled: false } });
    assert.ok(violations.includes('persona-desactivada'));
  });
});

describe('platform settings with personas', () => {
  it('seeds every persona with its default profile', () => {
    const settings = normalizePlatformSettings({});
    assert.equal(settings.schemaVersion, 2);
    assert.equal(settings.personas.product_owner.modelProfileId, 'medium');
    assert.equal(settings.personas.tech_lead.modelProfileId, 'large');
    assert.equal(settings.personas.developer.modelProfileId, 'medium');
    assert.equal(settings.personas.tester.modelProfileId, 'medium');
  });

  it('applies the persona model profile over the platform default', () => {
    const settings = normalizePlatformSettings({
      executionDefaults: { modelProfileId: 'large' },
      personas: { developer: { modelProfileId: 'small' } },
    });
    const merged = mergeWithPlatformDefaults({}, settings, 'developer');
    assert.equal(merged.modelProfileId, 'small');
    assert.deepEqual(
      merged.allowedMcpTools,
      settings.personas.developer.allowedTools,
    );
  });

  it('still lets an explicit task setting win over the persona', () => {
    const settings = normalizePlatformSettings({ personas: { developer: { modelProfileId: 'small' } } });
    const merged = mergeWithPlatformDefaults({ modelProfileId: 'max' }, settings, 'developer');
    assert.equal(merged.modelProfileId, 'max');
  });

  it('ignores an unknown persona id and falls back to platform defaults', () => {
    const settings = normalizePlatformSettings({ executionDefaults: { modelProfileId: 'high' } });
    const merged = mergeWithPlatformDefaults({}, settings, 'not_a_persona');
    assert.equal(merged.modelProfileId, 'high');
  });
});
