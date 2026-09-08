/**
 * Two-way mapping between the platform's V-model requirements and the OpenSpec files
 * that live in the project's repository.
 *
 *   forward  (push): idea -> requirements -> openspec/specs/  — the normal flow
 *   backward (pull): openspec/specs/ -> requirements          — rescue an existing codebase
 *
 * Neither direction writes anything on its own. Both produce a *plan* the operator
 * approves, because a silent overwrite in either direction destroys work.
 *
 *   platform capability  <->  openspec capability (one spec.md)
 *   functional / non_functional requirement  <->  ### Requirement
 *   test_case  <->  #### Scenario (verifies its parent requirement)
 */
const openspecFormat = require('./openspec-format');

const SPEC_TYPES = new Set(['functional', 'non_functional']);

function text(value, fallback = '') {
  const result = value === null || value === undefined ? '' : String(value).trim();
  return result || fallback;
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function capabilityOf(requirement) {
  return openspecFormat.slugify(
    text(requirement?.module) || text(requirement?.moduleTags?.[0]) || 'geral',
    'geral'
  );
}

/**
 * Groups the platform's requirements into one OpenSpec capability per module, with
 * test cases nested under the requirement they verify.
 */
function buildSpecsFromRequirements(requirements) {
  const all = ensureArray(requirements);
  const byId = new Map(all.map((entry) => [text(entry.id), entry]));

  // A test case belongs to the requirement it verifies; fall back to its module.
  const scenariosByRequirement = new Map();
  const orphanScenarios = [];
  for (const entry of all) {
    if (text(entry.type) !== 'test_case') continue;
    const parentId = ensureArray(entry.hierarchyLinks)
      .filter((link) => ['verified_by', 'decomposes_from', 'parent'].includes(text(link.linkType) || text(link.role)))
      .map((link) => text(link.targetId))
      .find((id) => byId.has(id))
      || text(entry.linkedFunctionalRequirement)
      || text(entry.stakeholderRequirementLink);
    const scenario = {
      id: text(entry.id),
      requirementId: parentId,
      title: text(entry.title, 'Cenario'),
      when: text(entry.condition),
      then: text(entry.measure) || text(entry.shall),
      notes: text(entry.notes),
    };
    if (parentId && byId.has(parentId)) {
      if (!scenariosByRequirement.has(parentId)) scenariosByRequirement.set(parentId, []);
      scenariosByRequirement.get(parentId).push(scenario);
    } else {
      orphanScenarios.push({ scenario, capability: capabilityOf(entry) });
    }
  }

  const specs = new Map();
  const ensureSpec = (capability) => {
    if (!specs.has(capability)) {
      specs.set(capability, {
        capability,
        title: capability,
        module: capability,
        purpose: '',
        requirements: [],
      });
    }
    return specs.get(capability);
  };

  for (const entry of all) {
    if (!SPEC_TYPES.has(text(entry.type))) continue;
    const capability = capabilityOf(entry);
    const spec = ensureSpec(capability);
    if (text(entry.module)) spec.title = text(entry.module);
    spec.requirements.push({
      id: text(entry.id),
      type: text(entry.type),
      priority: text(entry.priority),
      module: text(entry.module),
      title: text(entry.title, 'Requisito'),
      shall: text(entry.shall) || text(entry.description),
      rationale: text(entry.rationale),
      scenarios: scenariosByRequirement.get(text(entry.id)) || [],
    });
  }

  // A scenario with no resolvable parent still has to surface somewhere, or pushing
  // would quietly drop it.
  for (const { scenario, capability } of orphanScenarios) {
    const spec = ensureSpec(capability);
    let holder = spec.requirements.find((entry) => entry.id === '__unassigned__');
    if (!holder) {
      holder = {
        id: '__unassigned__',
        type: 'functional',
        title: 'Cenarios por associar',
        shall: 'Cenarios que ainda nao estao ligados a um requisito.',
        rationale: '',
        scenarios: [],
      };
      spec.requirements.push(holder);
    }
    holder.scenarios.push(scenario);
  }

  return [...specs.values()].sort((left, right) => left.capability.localeCompare(right.capability));
}

/** Forward direction: the files to write into the repository. */
function buildRepositoryFiles(project, requirements) {
  const specs = buildSpecsFromRequirements(requirements);
  const files = [{
    path: `${openspecFormat.SPEC_ROOT}/project.md`,
    content: openspecFormat.serializeProjectDoc(project),
  }];
  for (const spec of specs) {
    files.push({
      path: openspecFormat.specPath(spec.capability),
      content: openspecFormat.serializeSpec(spec),
    });
  }
  return { files, specs };
}

/**
 * Backward direction: OpenSpec requirements and scenarios become platform requirement
 * records. Ids that already look like platform ids are preserved so a pull updates
 * rather than duplicates.
 */
function buildRequirementsFromSpecs(specs, { existingRequirements = [] } = {}) {
  const existing = ensureArray(existingRequirements);
  const existingById = new Map(existing.map((entry) => [text(entry.id), entry]));
  const records = [];
  const counters = { functional: 0, non_functional: 0, test_case: 0 };
  const prefix = { functional: 'FR', non_functional: 'RNF', test_case: 'TC' };
  const usedIds = new Set(existingById.keys());

  // A hand-written spec carries no platform ids. Without an identity fallback every
  // import would mint fresh ids and duplicate the whole project, so match on the one
  // thing both sides agree about: the requirement's module and title.
  const identityKey = (type, moduleName, title) => [
    text(type),
    openspecFormat.slugify(moduleName, 'geral'),
    text(title).toLowerCase(),
  ].join('|');
  const existingByIdentity = new Map();
  for (const entry of existing) {
    const key = identityKey(entry.type, entry.module, entry.title);
    if (!existingByIdentity.has(key)) existingByIdentity.set(key, text(entry.id));
  }

  function resolveId(type, moduleName, title, declaredId) {
    const declared = text(declaredId);
    if (declared) return declared;
    const matched = existingByIdentity.get(identityKey(type, moduleName, title));
    if (matched) return matched;
    do {
      counters[type] += 1;
    } while (usedIds.has(`${prefix[type]}-${String(counters[type]).padStart(3, '0')}`));
    const id = `${prefix[type]}-${String(counters[type]).padStart(3, '0')}`;
    usedIds.add(id);
    return id;
  }

  function nextId(type) {
    return resolveId(type, '', '', '');
  }

  for (const spec of ensureArray(specs)) {
    const moduleName = text(spec.module) || text(spec.title) || text(spec.capability);
    for (const requirement of ensureArray(spec.requirements)) {
      if (requirement.id === '__unassigned__') {
        // Re-emit its scenarios as unlinked test cases rather than inventing a parent.
        for (const scenario of ensureArray(requirement.scenarios)) {
          records.push({
            id: resolveId('test_case', moduleName, scenario.title, scenario.id),
            type: 'test_case',
            title: text(scenario.title, 'Cenario'),
            condition: text(scenario.when),
            measure: text(scenario.then),
            module: moduleName,
            deliveryStageId: 'validation',
            source: 'openspec',
          });
        }
        continue;
      }

      const type = text(requirement.type) === 'non_functional' ? 'non_functional' : 'functional';
      const requirementId = resolveId(type, moduleName, requirement.title, requirement.id);
      records.push({
        id: requirementId,
        type,
        title: text(requirement.title, 'Requisito'),
        shall: text(requirement.shall),
        description: text(requirement.shall),
        rationale: text(requirement.rationale),
        priority: text(requirement.priority),
        module: moduleName,
        deliveryStageId: 'requirements',
        source: 'openspec',
      });

      for (const scenario of ensureArray(requirement.scenarios)) {
        records.push({
          id: resolveId('test_case', moduleName, scenario.title, scenario.id),
          type: 'test_case',
          title: text(scenario.title, 'Cenario'),
          condition: text(scenario.when),
          measure: text(scenario.then),
          module: moduleName,
          deliveryStageId: 'validation',
          source: 'openspec',
          linkedFunctionalRequirement: requirementId,
          hierarchyLinks: [{ role: 'parent', targetId: requirementId, linkType: 'verified_by' }],
        });
      }
    }
  }

  return records;
}

function comparableRequirement(entry) {
  return JSON.stringify({
    title: text(entry.title),
    shall: text(entry.shall),
    rationale: text(entry.rationale),
    type: text(entry.type),
    module: text(entry.module),
    scenarios: ensureArray(entry.scenarios).map((scenario) => ({
      title: text(scenario.title),
      when: text(scenario.when),
      then: text(scenario.then),
    })),
  });
}

/**
 * What differs between the platform and the repository, in both directions.
 * This is what the operator approves before anything is written.
 */
function diffSpecs(platformSpecs, repositorySpecs) {
  const platformByCapability = new Map(ensureArray(platformSpecs).map((spec) => [spec.capability, spec]));
  const repositoryByCapability = new Map(ensureArray(repositorySpecs).map((spec) => [spec.capability, spec]));
  const capabilities = [...new Set([...platformByCapability.keys(), ...repositoryByCapability.keys()])].sort();

  const changes = [];
  for (const capability of capabilities) {
    const platform = platformByCapability.get(capability);
    const repository = repositoryByCapability.get(capability);
    if (platform && !repository) {
      changes.push({ capability, operation: 'only_in_platform', requirements: platform.requirements.map((entry) => entry.title) });
      continue;
    }
    if (!platform && repository) {
      changes.push({ capability, operation: 'only_in_repository', requirements: repository.requirements.map((entry) => entry.title) });
      continue;
    }
    const platformById = new Map(platform.requirements.map((entry) => [text(entry.id) || text(entry.title), entry]));
    const repositoryById = new Map(repository.requirements.map((entry) => [text(entry.id) || text(entry.title), entry]));
    const keys = [...new Set([...platformById.keys(), ...repositoryById.keys()])];
    for (const key of keys) {
      const left = platformById.get(key);
      const right = repositoryById.get(key);
      if (left && !right) changes.push({ capability, requirementId: key, operation: 'only_in_platform', title: left.title });
      else if (!left && right) changes.push({ capability, requirementId: key, operation: 'only_in_repository', title: right.title });
      else if (comparableRequirement(left) !== comparableRequirement(right)) {
        changes.push({ capability, requirementId: key, operation: 'differs', title: left.title });
      }
    }
  }

  return {
    inSync: changes.length === 0,
    changes,
    summary: {
      onlyInPlatform: changes.filter((entry) => entry.operation === 'only_in_platform').length,
      onlyInRepository: changes.filter((entry) => entry.operation === 'only_in_repository').length,
      differs: changes.filter((entry) => entry.operation === 'differs').length,
    },
  };
}

module.exports = {
  buildRepositoryFiles,
  buildRequirementsFromSpecs,
  buildSpecsFromRequirements,
  capabilityOf,
  diffSpecs,
};
