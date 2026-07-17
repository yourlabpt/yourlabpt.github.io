const CONTRACT_ID = 'yourlab.agent-dispatch';
const CONTRACT_VERSION = 1;

const CONNECTOR_STATUSES = new Set([
  'claimed',
  'running',
  'planning',
  'executing',
  'self_review',
  'verifying',
  'paused',
  'cancelled',
  'failed',
]);

function text(value, fallback = '') {
  const normalized = value === null || value === undefined ? '' : String(value).trim();
  return normalized || fallback;
}

function stringList(value) {
  return [...new Set((Array.isArray(value) ? value : [])
    .map((entry) => (
      typeof entry === 'string' || typeof entry === 'number'
        ? entry
        : entry?.id
    ))
    .map((entry) => text(entry))
    .filter(Boolean))];
}

function normalizeAgentManifest(value = {}) {
  const raw = value?.agent && typeof value.agent === 'object' ? value.agent : value;
  const id = text(raw?.id || raw?.agentId);
  if (!id) return null;
  return {
    id,
    name: text(raw.name || raw.label, id),
    taskTypes: stringList(raw.taskTypes || raw.agentTypes),
    skills: stringList(raw.skills || raw.capabilities),
    tools: stringList(raw.tools || raw.mcpTools),
    models: stringList(raw.models || raw.modelProfiles),
    budget: raw.budget && typeof raw.budget === 'object' ? {
      maxTokens: Number(raw.budget.maxTokens) || undefined,
      maxWallClockMinutes: Number(raw.budget.maxWallClockMinutes) || undefined,
      maxSubtasks: Number(raw.budget.maxSubtasks) || undefined,
    } : {},
    extensions: raw.extensions && typeof raw.extensions === 'object' ? raw.extensions : {},
  };
}

function normalizeCapabilities(value = {}) {
  const raw = value && typeof value === 'object' ? value : {};
  const protocol = raw.protocol && typeof raw.protocol === 'object' ? raw.protocol : {};
  return {
    protocol: {
      id: text(protocol.id, CONTRACT_ID),
      versions: stringList(protocol.versions || raw.contractVersions || [CONTRACT_VERSION])
        .map(Number)
        .filter((entry) => Number.isInteger(entry) && entry > 0),
    },
    runtime: {
      kind: text(raw.runtime?.kind || raw.runtimeKind, 'custom'),
      version: text(raw.runtime?.version || raw.runtimeVersion),
    },
    agents: (Array.isArray(raw.agents) ? raw.agents : []).map(normalizeAgentManifest).filter(Boolean),
    skills: stringList(raw.skills),
    tools: stringList(raw.tools || raw.mcpTools),
    models: stringList(raw.models || raw.modelProfiles),
    features: stringList(raw.features),
    extensions: raw.extensions && typeof raw.extensions === 'object' ? raw.extensions : {},
  };
}

function selectedAgent(capabilities, agentId, agentType) {
  const requestedId = text(agentId);
  if (requestedId) {
    return capabilities.agents.find((agent) => agent.id === requestedId) || null;
  }
  return capabilities.agents.find((agent) => agent.taskTypes.includes(agentType)) || null;
}

function missingCapabilities(required, available) {
  const offered = new Set(available);
  return required.filter((entry) => !offered.has(entry));
}

function assessCompatibility(packageValue, capabilitiesValue) {
  const taskPackage = packageValue && typeof packageValue === 'object' ? packageValue : {};
  const capabilities = normalizeCapabilities(capabilitiesValue);
  const reasons = [];
  const contract = taskPackage.contract || {
    id: CONTRACT_ID,
    version: Number(taskPackage.version) || CONTRACT_VERSION,
  };

  if (contract.id !== capabilities.protocol.id) reasons.push(`protocol:${contract.id}`);
  if (capabilities.protocol.versions.length
    && !capabilities.protocol.versions.includes(Number(contract.version))) {
    reasons.push(`contract-version:${contract.version}`);
  }

  const agent = selectedAgent(
    capabilities,
    taskPackage.agent?.id || taskPackage.agentId,
    taskPackage.agent?.type || taskPackage.agentType
  );
  if (capabilities.agents.length && !agent && !capabilities.features.includes('accepts_any_agent')) {
    reasons.push(`agent:${taskPackage.agent?.id || taskPackage.agentId || 'unspecified'}`);
  }

  const availableSkills = [...capabilities.skills, ...(agent?.skills || [])];
  const availableTools = [...capabilities.tools, ...(agent?.tools || [])];
  for (const skill of missingCapabilities(stringList(taskPackage.requirements?.skills || taskPackage.requiredSkills), availableSkills)) {
    reasons.push(`skill:${skill}`);
  }
  for (const tool of missingCapabilities(stringList(taskPackage.requirements?.tools || taskPackage.allowedMcpTools), availableTools)) {
    reasons.push(`tool:${tool}`);
  }

  return { compatible: reasons.length === 0, reasons, capabilities, agent };
}

function normalizeConnectorStatus(value) {
  const status = text(value, 'running');
  if (!CONNECTOR_STATUSES.has(status)) throw new Error(`Estado do runtime invalido: ${status}`);
  return status;
}

function buildFrozenTaskPackage(input = {}) {
  const requiredSkills = stringList(input.requiredSkills);
  const allowedTools = stringList(input.allowedTools);
  return {
    contract: { id: CONTRACT_ID, version: CONTRACT_VERSION },
    identifiers: {
      projectId: text(input.projectId),
      workItemId: text(input.workItemId),
      agentRequestId: text(input.agentRequestId),
      platformRunId: text(input.platformRunId),
      agentJobId: text(input.agentJobId),
    },
    versions: {
      request: Math.max(1, Number(input.requestVersion) || 1),
      package: Math.max(1, Number(input.packageVersion) || 1),
    },
    agent: {
      id: text(input.agentId),
      type: text(input.agentType),
    },
    instructions: text(input.instructions),
    context: input.context && typeof input.context === 'object' ? input.context : {},
    taskGraph: Array.isArray(input.taskGraph) ? input.taskGraph : [],
    requirements: {
      skills: requiredSkills,
      tools: allowedTools,
    },
    budget: input.budget && typeof input.budget === 'object' ? input.budget : {},
    outputContract: {
      ...(input.outputContract && typeof input.outputContract === 'object' ? input.outputContract : {}),
      acceptanceCriteria: text(input.acceptanceCriteria),
      humanReviewRequired: true,
      autoApply: false,
      completionPolicy: {
        stopWhenAcceptanceSatisfied: true,
        selfReviewRequired: true,
        ...(input.completionPolicy && typeof input.completionPolicy === 'object'
          ? input.completionPolicy
          : {}),
      },
    },
    contextSnapshotHash: text(input.contextSnapshotHash),
    frozenAt: text(input.frozenAt),
  };
}

function publicDispatch(dispatch) {
  if (!dispatch) return null;
  return {
    id: dispatch.id,
    projectId: dispatch.projectId,
    workItemId: dispatch.workItemId,
    agentRequestId: dispatch.agentRequestId,
    platformRunId: dispatch.platformRunId,
    agentJobId: dispatch.agentJobId,
    agentId: dispatch.agentId,
    packageHash: dispatch.packageHash,
    status: dispatch.status,
    desiredAction: dispatch.desiredAction,
    connectorId: dispatch.connectorId,
    localJobId: dispatch.localJobId,
    attempt: dispatch.attempt,
    previousDispatchId: dispatch.previousDispatchId,
    resultHash: dispatch.resultHash,
    createdAt: dispatch.createdAt,
    updatedAt: dispatch.updatedAt,
    leaseExpiresAt: dispatch.leaseExpiresAt,
  };
}

module.exports = {
  CONTRACT_ID,
  CONTRACT_VERSION,
  CONNECTOR_STATUSES,
  assessCompatibility,
  buildFrozenTaskPackage,
  normalizeAgentManifest,
  normalizeCapabilities,
  normalizeConnectorStatus,
  publicDispatch,
  stringList,
};
