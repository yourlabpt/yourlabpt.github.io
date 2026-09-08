/**
 * Persona registry for the intention-based modular software factory.
 *
 * Pipeline: intention -> proposal -> openspec -> ux -> modules -> interfaces -> build -> test -> integrate
 *
 * A persona is a *role* in that pipeline. It is not an agent: agents are declared by
 * the connected runtime and discovered through the `yourlab.agent-dispatch` capability
 * handshake. This registry says what each role is allowed to touch, what it consumes
 * and produces, and which runtime agent may serve it.
 */
const workItems = require('./work-items');
const { stringList } = require('./agent-connector-contract');

const PIPELINE_STEPS = [
  'intention', 'proposal', 'openspec', 'ux',
  'modules', 'interfaces', 'tasks', 'build', 'test', 'integrate',
];

/**
 * The minimum a task must carry before a developer agent will attempt it. The
 * developer is not allowed to plan, so an under-specified task is refused and sent
 * back to the Tech Lead rather than guessed at.
 */
const DEVELOPER_TASK_FIELDS = ['input', 'output', 'functionDescription'];

// Write scopes are the enforceable half of "never implement code" / "never modify
// another module". Everything a persona may author has to fall inside its scope.
const WRITE_SCOPES = new Set(['spec', 'design', 'contracts', 'module_code', 'tests', 'none']);

// The platform's model vocabulary and the runtime's tier vocabulary are different.
// Without this map the runtime silently drops the platform's choice and uses its own
// default profile (see durable/providers.ts resolve()).
const RUNTIME_TIER_BY_PROFILE = {
  small: 'fast',
  medium: 'standard',
  large: 'heavy',
  high: 'heavy',
  research: 'research',
  long_context: 'long_context',
  max: 'max',
};

const MODEL_PROFILES = Object.keys(RUNTIME_TIER_BY_PROFILE);

const PERSONA_ROLES = [
  {
    id: 'product_owner',
    label: 'Product Owner',
    order: 1,
    summary: 'Interpreta a intencao, mantem a OpenSpec e define modulos e criterios de aceitacao.',
    pipelineSteps: ['intention', 'proposal', 'openspec'],
    deliveryStages: ['idea', 'discovery', 'requirements'],
    taskTypes: ['spec_authoring', 'requirements_analysis'],
    defaultModelProfileId: 'medium',
    writeScope: 'spec',
    consumes: ['intention', 'ux_mockup_approved', 'project_context'],
    produces: ['openspec_change', 'module_list', 'acceptance_criteria'],
    defaultTools: [
      'project.read', 'documents.read', 'requirements.read', 'requirements.write',
      'openspec.read', 'openspec.write', 'repo.read',
    ],
    requiresUpstream: [],
  },
  {
    id: 'ux',
    label: 'UX Agent',
    order: 2,
    summary: 'Transforma a intencao e referencias visuais em fluxos e mockups; so depois viram requisitos.',
    pipelineSteps: ['ux'],
    deliveryStages: ['discovery', 'requirements'],
    taskTypes: ['ux_design', 'mockup_authoring'],
    defaultModelProfileId: 'medium',
    writeScope: 'design',
    consumes: ['intention', 'visual_reference'],
    produces: ['ux_flow', 'ux_mockup', 'screen_inventory', 'component_inventory'],
    // Standing question 1: the mockup is the first version of the frontend and a human
    // accepts it before anything is derived from it.
    requiresHumanApproval: true,
    defaultTools: [
      'project.read', 'documents.read', 'mockups.read', 'mockups.write',
      'openspec.read', 'openspec.write', 'repo.read',
    ],
    requiresUpstream: [],
  },
  {
    id: 'module_architect',
    label: 'Module Architect',
    order: 3,
    summary: 'Parte a OpenSpec em modulos pequenos, reutilizaveis e testaveis de forma independente.',
    pipelineSteps: ['modules'],
    deliveryStages: ['architecture'],
    taskTypes: ['module_decomposition', 'architecture_analysis'],
    defaultModelProfileId: 'medium',
    writeScope: 'design',
    consumes: ['openspec_change', 'ux_mockup_approved'],
    produces: ['module_spec', 'module_dependency_graph'],
    defaultTools: [
      'project.read', 'openspec.read', 'openspec.write',
      'architecture.read', 'architecture.write', 'repo.read', 'repo.search',
    ],
    requiresUpstream: ['product_owner'],
  },
  {
    id: 'orchestrator',
    label: 'Orchestrator / Interface Manager',
    order: 4,
    summary: 'Define e mantem os contratos entre modulos, deteta conflitos e fixa a ordem de implementacao.',
    pipelineSteps: ['interfaces', 'integrate'],
    deliveryStages: ['architecture', 'roadmap', 'delivery'],
    taskTypes: ['interface_contract', 'integration_planning'],
    defaultModelProfileId: 'medium',
    writeScope: 'contracts',
    consumes: ['module_spec', 'module_dependency_graph'],
    produces: ['interface_contract', 'implementation_order', 'conflict_report'],
    defaultTools: [
      'project.read', 'openspec.read', 'openspec.write',
      'architecture.read', 'architecture.write', 'contracts.read', 'contracts.write',
      'repo.read', 'repo.search',
    ],
    requiresUpstream: ['module_architect'],
  },
  {
    id: 'tech_lead',
    label: 'Tech Lead',
    order: 5,
    summary: 'Define o padrao de implementacao e parte cada modulo em unidades pequenas e completamente especificadas.',
    pipelineSteps: ['tasks'],
    deliveryStages: ['architecture', 'roadmap', 'implementation'],
    taskTypes: ['task_authoring', 'implementation_planning'],
    // The task author is the strongest model in the chain: a well-cut task is what
    // lets a small developer model succeed, and a badly cut one costs several retries.
    defaultModelProfileId: 'large',
    writeScope: 'design',
    consumes: ['module_spec', 'interface_contract', 'ux_mockup_approved'],
    produces: ['implementation_task', 'design_pattern', 'implementation_order'],
    defaultTools: [
      'project.read', 'openspec.read', 'contracts.read',
      'architecture.read', 'tasks.read', 'tasks.write', 'repo.read', 'repo.search',
    ],
    requiresUpstream: ['orchestrator'],
  },
  {
    id: 'developer',
    label: 'Developer Agent',
    order: 6,
    summary: 'Implementa exactamente uma unidade ja especificada; nunca planeia e nunca toca noutro modulo.',
    pipelineSteps: ['build'],
    deliveryStages: ['implementation'],
    taskTypes: ['code_implementation'],
    // Floor is 7B: below that the model cannot hold a spec and emit whole files.
    defaultModelProfileId: 'medium',
    writeScope: 'module_code',
    consumes: ['implementation_task', 'interface_contract'],
    produces: ['code_change', 'module_tests'],
    // Standing question 2: nothing an agent wrote reaches the repository unreviewed.
    requiresHumanApproval: true,
    defaultTools: [
      'project.read', 'openspec.read', 'contracts.read',
      'repo.search', 'repo.read', 'repo.patch', 'tests.run', 'diff.read',
    ],
    requiresUpstream: ['tech_lead'],
    // Hard boundary: a developer run is scoped to a single module path set.
    scopedToSingleModule: true,
  },
  {
    id: 'tester',
    label: 'Tester Agent',
    order: 7,
    summary: 'Valida a unidade contra os cenarios e o contrato, devolve falhas estruturadas.',
    pipelineSteps: ['test'],
    deliveryStages: ['validation'],
    taskTypes: ['module_verification', 'contract_verification'],
    defaultModelProfileId: 'medium',
    writeScope: 'tests',
    consumes: ['code_change', 'implementation_task', 'interface_contract'],
    produces: ['test_report', 'structured_failures'],
    defaultTools: [
      'project.read', 'openspec.read', 'contracts.read',
      'repo.search', 'repo.read', 'tests.run', 'diff.read',
    ],
    requiresUpstream: ['developer'],
    scopedToSingleModule: true,
  },
];

const PERSONA_BY_ID = new Map(PERSONA_ROLES.map((persona) => [persona.id, persona]));
const PERSONA_IDS = PERSONA_ROLES.map((persona) => persona.id);

function textOr(value, fallback = '') {
  const result = value === null || value === undefined ? '' : String(value).trim();
  return result || fallback;
}

function isPersonaId(value) {
  return PERSONA_BY_ID.has(textOr(value));
}

function personaDefinition(personaId) {
  return PERSONA_BY_ID.get(textOr(personaId)) || null;
}

function normalizeModelProfileId(value, fallback = 'medium') {
  const profile = textOr(value).toLowerCase();
  return RUNTIME_TIER_BY_PROFILE[profile] ? profile : fallback;
}

function runtimeTierFor(modelProfileId) {
  return RUNTIME_TIER_BY_PROFILE[normalizeModelProfileId(modelProfileId)] || 'standard';
}

/**
 * User-supplied overrides for one persona. Only the fields an operator is allowed to
 * change: the role's contract (writeScope, produces, consumes) is not configurable.
 */
function normalizePersonaOverride(personaId, raw = {}) {
  const definition = personaDefinition(personaId);
  if (!definition) return null;
  const src = raw && typeof raw === 'object' ? raw : {};
  const tools = stringList(src.allowedTools);
  return {
    personaId: definition.id,
    enabled: src.enabled !== false,
    modelProfileId: normalizeModelProfileId(src.modelProfileId, definition.defaultModelProfileId),
    agentId: textOr(src.agentId),
    connectorId: textOr(src.connectorId),
    allowedTools: tools.length ? tools : [...definition.defaultTools],
    maxTokens: Math.max(0, Number(src.maxTokens) || 0),
    maxWallClockMinutes: Math.max(0, Number(src.maxWallClockMinutes) || 0),
    maxSubtasks: Math.max(0, Number(src.maxSubtasks) || 0),
    // The chain never stops for a phase — only for a question to a human. There are
    // exactly two standing questions: accepting the mockup, and reviewing code before
    // it is committed. Every other persona hands off without waiting.
    requiresHumanApproval: src.requiresHumanApproval !== undefined
      ? src.requiresHumanApproval === true
      : definition.requiresHumanApproval === true,
    instructions: textOr(src.instructions),
  };
}

function normalizePersonaOverrides(raw = {}) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const result = {};
  for (const persona of PERSONA_ROLES) {
    result[persona.id] = normalizePersonaOverride(persona.id, src[persona.id]);
  }
  return result;
}

/**
 * Definition + override, in the shape the admin UI and the dispatcher both read.
 */
function resolvePersona(personaId, overrides = {}) {
  const definition = personaDefinition(personaId);
  if (!definition) return null;
  const override = normalizePersonaOverride(personaId, overrides[definition.id]);
  return {
    ...definition,
    ...override,
    runtimeTier: runtimeTierFor(override.modelProfileId),
    canWriteCode: definition.writeScope === 'module_code' || definition.writeScope === 'tests',
  };
}

function listPersonas(overrides = {}) {
  return PERSONA_ROLES
    .map((persona) => resolvePersona(persona.id, overrides))
    .sort((left, right) => left.order - right.order);
}

/**
 * Execution settings for one persona, layered over the platform defaults.
 * Persona settings win over platform defaults; a caller-supplied task override wins over both.
 */
function personaExecutionSettings(personaId, platformExecutionDefaults = {}, taskSettings = {}) {
  const persona = resolvePersona(personaId, platformExecutionDefaults.personas || {});
  if (!persona) return workItems.normalizeExecutionSettings({ ...platformExecutionDefaults, ...taskSettings });
  const base = platformExecutionDefaults && typeof platformExecutionDefaults === 'object'
    ? platformExecutionDefaults
    : {};
  const task = taskSettings && typeof taskSettings === 'object' ? taskSettings : {};
  return workItems.normalizeExecutionSettings({
    ...base,
    modelProfileId: persona.modelProfileId,
    agentId: persona.agentId || base.agentId || '',
    allowedMcpTools: persona.allowedTools,
    ...(persona.maxTokens ? { maxTokens: persona.maxTokens, tokenBudgetMode: 'limited' } : {}),
    ...(persona.maxWallClockMinutes
      ? { maxWallClockMinutes: persona.maxWallClockMinutes, timeLimitEnabled: true }
      : {}),
    ...(persona.maxSubtasks ? { planningWaveSize: persona.maxSubtasks } : {}),
    ...task,
  });
}

/**
 * Which runtime agents (from a connector capability manifest) can serve this persona.
 * A candidate must cover one of the persona's task types and every tool it needs.
 */
function personaCandidateAgents(personaId, capabilities = {}, overrides = {}) {
  const persona = resolvePersona(personaId, overrides);
  if (!persona) return [];
  const agents = Array.isArray(capabilities.agents) ? capabilities.agents : [];
  const globalTools = new Set(stringList(capabilities.tools));
  const wantedTypes = new Set(persona.taskTypes);
  return agents
    .map((agent) => {
      const agentTools = new Set([...stringList(agent.tools), ...globalTools]);
      const missingTools = persona.allowedTools.filter((tool) => !agentTools.has(tool));
      const typeMatch = stringList(agent.taskTypes).some((type) => wantedTypes.has(type));
      return {
        agentId: agent.id,
        name: textOr(agent.name, agent.id),
        typeMatch,
        missingTools,
        eligible: typeMatch && missingTools.length === 0,
      };
    })
    .sort((left, right) => Number(right.eligible) - Number(left.eligible)
      || Number(right.typeMatch) - Number(left.typeMatch));
}

/**
 * Binding report for the admin UI: for every persona, is there a runtime agent that
 * can actually run it, and if not, why not.
 */
function personaBindingReport(capabilities = {}, overrides = {}) {
  return listPersonas(overrides).map((persona) => {
    const candidates = personaCandidateAgents(persona.id, capabilities, overrides);
    const pinned = persona.agentId
      ? candidates.find((candidate) => candidate.agentId === persona.agentId) || null
      : null;
    const eligible = candidates.filter((candidate) => candidate.eligible);
    // A pin is deliberate: if the pinned agent is gone, report it rather than
    // silently rerouting the persona onto a different agent.
    const bound = persona.agentId ? pinned : (eligible[0] || null);
    return {
      personaId: persona.id,
      label: persona.label,
      order: persona.order,
      enabled: persona.enabled,
      modelProfileId: persona.modelProfileId,
      runtimeTier: persona.runtimeTier,
      writeScope: persona.writeScope,
      canWriteCode: persona.canWriteCode,
      deliveryStages: persona.deliveryStages,
      pipelineSteps: persona.pipelineSteps,
      requiresHumanApproval: persona.requiresHumanApproval,
      boundAgentId: bound?.agentId || '',
      boundAgentName: bound?.name || '',
      pinnedAgentMissing: Boolean(persona.agentId) && !pinned,
      satisfied: Boolean(bound?.eligible),
      candidates,
    };
  });
}

/**
 * Guardrail check applied before a task package is frozen. Returns the reasons a
 * persona may not perform the requested work, empty when the task is in scope.
 */
function personaViolations(personaId, request = {}, overrides = {}) {
  const persona = resolvePersona(personaId, overrides);
  if (!persona) return [`persona-desconhecida:${textOr(personaId, 'vazio')}`];
  const reasons = [];
  if (!persona.enabled) reasons.push('persona-desactivada');
  if (!persona.canWriteCode && request.writesCode === true) {
    reasons.push(`write-scope:${persona.writeScope}`);
  }
  if (persona.scopedToSingleModule && stringList(request.moduleIds).length > 1) {
    reasons.push('multi-modulo');
  }
  const stage = textOr(request.deliveryStageId);
  if (stage && persona.deliveryStages.length && !persona.deliveryStages.includes(stage)) {
    reasons.push(`fase:${stage}`);
  }
  const availableArtifacts = new Set(stringList(request.availableArtifacts));
  if (availableArtifacts.size) {
    for (const artifact of persona.consumes) {
      if (artifact === 'project_context') continue;
      if (!availableArtifacts.has(artifact)) reasons.push(`falta-artefacto:${artifact}`);
    }
  }
  return reasons;
}

/**
 * Why a developer agent may refuse a task. Empty means the task is implementable
 * as written. Returned to the Tech Lead so it can re-cut rather than the developer
 * inventing the missing half.
 */
function developerTaskGaps(task = {}) {
  const spec = task && typeof task === 'object' ? task : {};
  const gaps = DEVELOPER_TASK_FIELDS.filter((field) => !textOr(spec[field]));
  if (!textOr(spec.moduleName) && !stringList(spec.repositoryPaths).length) {
    gaps.push('scope');
  }
  return gaps;
}

module.exports = {
  DEVELOPER_TASK_FIELDS,
  developerTaskGaps,
  MODEL_PROFILES,
  PERSONA_IDS,
  PERSONA_ROLES,
  PIPELINE_STEPS,
  RUNTIME_TIER_BY_PROFILE,
  WRITE_SCOPES,
  isPersonaId,
  listPersonas,
  normalizeModelProfileId,
  normalizePersonaOverride,
  normalizePersonaOverrides,
  personaBindingReport,
  personaCandidateAgents,
  personaDefinition,
  personaExecutionSettings,
  personaViolations,
  resolvePersona,
  runtimeTierFor,
};
