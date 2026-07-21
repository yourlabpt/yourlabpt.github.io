const crypto = require('crypto');

const SCHEMA_VERSION = 1;
const CHANGE_SET_SCHEMA = 'engineering-change-set/v1';
const FEATURE_FLAG = 'engineering_state_v1';
const ENTITY_TYPES = new Set([
  'problem', 'intent', 'stakeholder', 'need', 'objective', 'success_criterion',
  'assumption', 'constraint', 'risk', 'evidence',
  'architecture_decision', 'component', 'interface', 'data_entity',
  'capability', 'feature', 'module', 'roadmap_item', 'milestone',
]);
const OPERATION_TYPES = new Set([
  'create_entity', 'update_entity', 'deprecate_entity',
  'create_relationship', 'remove_relationship',
]);
const EXTRA_RELATIONSHIP_TYPES = new Set(['evidences', 'owned_by', 'measures']);
const RELATIONSHIP_TYPES = new Set([
  'derives_from', 'satisfies', 'decomposes_from', 'constrains', 'verified_by',
  'contains', 'implements', 'tests', 'documents', 'depends_on', 'affects',
  'supersedes', 'monitors', ...EXTRA_RELATIONSHIP_TYPES,
]);
const IMPACT_LEVELS = new Set(['none', 'local', 'downstream', 'cross_phase', 'breaking']);
const SECTION_DECISIONS = new Set(['pending', 'approved', 'rejected', 'changes_requested']);
const ENTITY_STATUSES = new Set(['active', 'deprecated']);
const IMMUTABLE_PATCH_ROOTS = new Set(['id', 'type', 'provenance', 'version', 'createdAt']);

function nowIso() {
  return new Date().toISOString();
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function text(value, fallback = '') {
  const result = value === null || value === undefined ? '' : String(value).trim();
  return result || fallback;
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function stableId(prefix, ...parts) {
  const hash = crypto.createHash('sha256').update(parts.map((part) => text(part)).join('|')).digest('hex');
  return `${prefix}_${hash.slice(0, 16)}`;
}

function uniqueStrings(value) {
  return [...new Set(ensureArray(value).map((entry) => text(entry)).filter(Boolean))];
}

function featureEnabled(project, env = process.env) {
  if (String(env.ENGINEERING_STATE_V1 || '').toLowerCase() === 'true' || env.ENGINEERING_STATE_V1 === '1') {
    return true;
  }
  return project?.featureFlags?.[FEATURE_FLAG] === true;
}

function normalizeSourceRefs(value) {
  return ensureArray(value).map((entry) => {
    if (typeof entry === 'string') return { type: 'reference', id: entry };
    return {
      type: text(entry?.type, 'reference'),
      id: text(entry?.id),
      uri: text(entry?.uri || entry?.url),
      label: text(entry?.label || entry?.title),
    };
  }).filter((entry) => entry.id || entry.uri);
}

function normalizeProvenance(value, fallback = {}) {
  const source = isObject(value) ? value : {};
  return {
    source: text(source.source, fallback.source || 'yourlab'),
    sourceId: text(source.sourceId, fallback.sourceId || ''),
    taskId: text(source.taskId, fallback.taskId || ''),
    runId: text(source.runId, fallback.runId || ''),
    changeSetId: text(source.changeSetId, fallback.changeSetId || ''),
    actorId: text(source.actorId, fallback.actorId || ''),
  };
}

function normalizeEntity(raw, context = {}) {
  const type = text(raw?.type).toLowerCase();
  if (!ENTITY_TYPES.has(type)) throw new Error(`Unsupported engineering entity type: ${type || '(empty)'}`);
  const id = text(raw?.id);
  if (!id) throw new Error('Engineering entity id is required.');
  const status = text(raw?.status, 'active').toLowerCase();
  if (!ENTITY_STATUSES.has(status)) throw new Error(`Unsupported engineering entity status: ${status}`);
  const createdAt = text(raw?.createdAt, context.now || nowIso());
  return {
    id,
    type,
    title: text(raw?.title, id),
    status,
    version: Math.max(1, Number(raw?.version) || 1),
    attributes: isObject(raw?.attributes) ? clone(raw.attributes) : {},
    sourceRefs: normalizeSourceRefs(raw?.sourceRefs),
    provenance: normalizeProvenance(raw?.provenance, context.provenance),
    createdAt,
    updatedAt: text(raw?.updatedAt, createdAt),
  };
}

function normalizeRelationship(raw, context = {}) {
  const id = text(raw?.id);
  const sourceType = text(raw?.sourceType || raw?.fromType).toLowerCase();
  const sourceId = text(raw?.sourceId || raw?.fromId);
  const targetType = text(raw?.targetType || raw?.toType).toLowerCase();
  const targetId = text(raw?.targetId || raw?.toId);
  const relationshipType = text(raw?.relationshipType || raw?.type, 'depends_on').toLowerCase();
  if (!sourceType || !sourceId || !targetType || !targetId) {
    throw new Error('Engineering relationship requires source and target.');
  }
  if (!RELATIONSHIP_TYPES.has(relationshipType)) {
    throw new Error(`Unsupported engineering relationship type: ${relationshipType}`);
  }
  return {
    id: id || stableId('erel', sourceType, sourceId, relationshipType, targetType, targetId),
    sourceType,
    sourceId,
    targetType,
    targetId,
    relationshipType,
    version: Math.max(1, Number(raw?.version) || 1),
    provenance: normalizeProvenance(raw?.provenance, context.provenance),
    createdAt: text(raw?.createdAt, context.now || nowIso()),
    updatedAt: text(raw?.updatedAt, context.now || nowIso()),
  };
}

function normalizeExternalReference(raw, context = {}) {
  const id = text(raw?.id);
  if (!id) throw new Error('External reference id is required.');
  return {
    id,
    provider: text(raw?.provider, 'manual'),
    artifactType: text(raw?.artifactType, 'reference'),
    uri: text(raw?.uri || raw?.url),
    remoteId: text(raw?.remoteId),
    title: text(raw?.title, id),
    version: text(raw?.version),
    contentHash: text(raw?.contentHash || raw?.hash),
    lastSyncedAt: text(raw?.lastSyncedAt),
    provenance: normalizeProvenance(raw?.provenance, context.provenance),
    createdAt: text(raw?.createdAt, context.now || nowIso()),
    updatedAt: text(raw?.updatedAt, context.now || nowIso()),
  };
}

function normalizeState(raw) {
  const source = isObject(raw) ? raw : {};
  const state = {
    schemaVersion: SCHEMA_VERSION,
    revision: Math.max(0, Number(source.revision) || 0),
    entities: [],
    relationships: [],
    externalReferences: [],
    updatedAt: text(source.updatedAt, nowIso()),
  };
  const entityIds = new Set();
  for (const rawEntity of ensureArray(source.entities)) {
    const entity = normalizeEntity(rawEntity);
    if (entityIds.has(entity.id)) throw new Error(`Duplicate engineering entity id: ${entity.id}`);
    entityIds.add(entity.id);
    state.entities.push(entity);
  }
  const relationIds = new Set();
  for (const rawRelationship of ensureArray(source.relationships)) {
    const relationship = normalizeRelationship(rawRelationship);
    if (relationIds.has(relationship.id)) throw new Error(`Duplicate engineering relationship id: ${relationship.id}`);
    relationIds.add(relationship.id);
    state.relationships.push(relationship);
  }
  const referenceIds = new Set();
  for (const rawReference of ensureArray(source.externalReferences)) {
    const reference = normalizeExternalReference(rawReference);
    if (referenceIds.has(reference.id)) throw new Error(`Duplicate external reference id: ${reference.id}`);
    referenceIds.add(reference.id);
    state.externalReferences.push(reference);
  }
  return state;
}

function virtualEntity(projectId, type, sourcePath, title, attributes, sourceId = sourcePath) {
  const projectedAt = text(attributes?.updatedAt || attributes?.createdAt, '1970-01-01T00:00:00.000Z');
  return {
    id: stableId('vent', projectId, sourcePath),
    type,
    title: text(title, sourcePath),
    status: 'active',
    version: 1,
    attributes: clone(attributes || {}),
    sourceRefs: [{ type: 'project_field', id: sourcePath }],
    provenance: normalizeProvenance({ source: 'legacy_projection', sourceId }),
    createdAt: text(attributes?.createdAt, projectedAt),
    updatedAt: projectedAt,
    virtual: true,
  };
}

function projectVirtualEntities(project) {
  const result = [];
  const projectId = text(project?.id, 'project');
  const vision = isObject(project?.vision) ? project.vision : {};
  const discovery = isObject(project?.discovery) ? project.discovery : {};
  if (text(vision.problemMarkdown)) {
    result.push(virtualEntity(projectId, 'problem', 'vision.problemMarkdown', 'Problem', {
      descriptionMarkdown: text(vision.problemMarkdown), updatedAt: vision.updatedAt,
    }));
  }
  if (text(vision.mainIdeaMarkdown || vision.valuePropositionMarkdown)) {
    result.push(virtualEntity(projectId, 'intent', 'vision.intent', text(vision.headline, 'Intent'), {
      descriptionMarkdown: text(vision.mainIdeaMarkdown),
      valuePropositionMarkdown: text(vision.valuePropositionMarkdown),
      updatedAt: vision.updatedAt,
    }));
  }
  ensureArray(discovery.stakeholders).forEach((item, index) => {
    const name = text(item?.name || item?.title, `Stakeholder ${index + 1}`);
    result.push(virtualEntity(projectId, 'stakeholder', `discovery.stakeholders.${name.toLowerCase()}`, name, item, name));
  });
  ensureArray(discovery.assumptions).forEach((item, index) => {
    const description = text(typeof item === 'string' ? item : item?.text);
    if (description) result.push(virtualEntity(projectId, 'assumption', `discovery.assumptions.${index}`, description.slice(0, 100), { descriptionMarkdown: description }));
  });
  ensureArray(discovery.evidenceGaps).forEach((item, index) => {
    const description = text(typeof item === 'string' ? item : item?.text);
    if (description) result.push(virtualEntity(projectId, 'risk', `discovery.evidenceGaps.${index}`, description.slice(0, 100), { descriptionMarkdown: description, category: 'evidence_gap' }));
  });
  ensureArray(discovery.researchSources || discovery.sources).forEach((source, index) => {
    const sourceId = text(source?.id || source?.url, `source-${index + 1}`);
    result.push(virtualEntity(projectId, 'evidence', `discovery.researchSources.${sourceId}`, text(source?.title, sourceId), source, sourceId));
  });
  ensureArray(project?.businessObjectives).forEach((objective, index) => {
    const id = text(objective?.id, String(index));
    result.push(virtualEntity(projectId, 'objective', `businessObjectives.${id}`, text(objective?.title || objective?.name, id), objective, id));
  });
  ensureArray(project?.capabilities).forEach((capability, index) => {
    const id = text(capability?.id, `capability-${index + 1}`);
    result.push(virtualEntity(projectId, 'capability', `capabilities.${id}`, text(capability?.title || capability?.name, id), capability, id));
  });
  ensureArray(project?.decisions).forEach((decision, index) => {
    const id = text(decision?.id, `decision-${index + 1}`);
    result.push(virtualEntity(projectId, 'architecture_decision', `decisions.${id}`, text(decision?.title || decision?.text, id), decision, id));
  });
  ensureArray(project?.artifacts).forEach((artifact, index) => {
    const id = text(artifact?.id, `artifact-${index + 1}`);
    const artifactType = text(artifact?.type).toLowerCase();
    const type = artifactType === 'data_entity' ? 'data_entity'
      : artifactType === 'api_endpoint' ? 'interface'
        : ['architecture', 'architecture_object'].includes(artifactType) ? 'component'
          : 'artifact';
    const entity = virtualEntity(projectId, ENTITY_TYPES.has(type) ? type : 'component', `artifacts.${id}`, text(artifact?.name || artifact?.title, id), artifact, id);
    entity.type = type;
    result.push(entity);
  });
  ensureArray(project?.roadmap?.phases).forEach((phase, index) => {
    const id = text(phase?.id, `roadmap-${index + 1}`);
    result.push(virtualEntity(projectId, 'roadmap_item', `roadmap.phases.${id}`, text(phase?.name || phase?.title, id), phase, id));
    ensureArray(phase?.milestones).forEach((milestone, milestoneIndex) => {
      const milestoneId = text(milestone?.id, `${id}-milestone-${milestoneIndex + 1}`);
      result.push(virtualEntity(projectId, 'milestone', `roadmap.phases.${id}.milestones.${milestoneId}`, text(milestone?.name || milestone?.title, milestoneId), milestone, milestoneId));
    });
  });
  return result;
}

function projectExternalReferences(project) {
  const refs = [];
  const projectId = text(project?.id, 'project');
  ensureArray(project?.integrationMappings).forEach((mapping, index) => {
    const sourceId = text(mapping?.id || mapping?.externalId, String(index));
    refs.push(normalizeExternalReference({
      id: stableId('extref', projectId, 'integrationMapping', sourceId),
      provider: text(mapping?.system, 'manual'),
      artifactType: text(mapping?.internalType, 'reference'),
      uri: text(mapping?.externalUrl),
      remoteId: text(mapping?.externalId),
      title: text(mapping?.metadata?.title, `${text(mapping?.system, 'External')} ${text(mapping?.externalId, sourceId)}`),
      lastSyncedAt: text(mapping?.lastSyncAt),
      provenance: { source: 'integration_mapping', sourceId },
      createdAt: mapping?.createdAt,
      updatedAt: mapping?.updatedAt,
    }));
  });
  ensureArray(project?.workItems).forEach((item) => {
    ensureArray(item?.externalRefs).forEach((reference, index) => {
      const sourceId = text(reference?.id || reference?.externalId || reference?.url, `${item.id}-${index}`);
      refs.push(normalizeExternalReference({
        id: stableId('extref', projectId, 'workItem', item.id, sourceId),
        provider: text(reference?.source || reference?.system, 'manual'),
        artifactType: 'task',
        uri: text(reference?.url || reference?.externalUrl),
        remoteId: text(reference?.externalId || reference?.id),
        title: text(reference?.title, item.title),
        provenance: { source: 'work_item_external_ref', sourceId: item.id },
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      }));
    });
  });
  return refs;
}

function requirementVirtualEntities(project) {
  return ensureArray(project?.requirements).filter((entry) => entry?.id).map((entry) => ({
    id: text(entry.id),
    type: 'requirement',
    title: text(entry.title || entry.name, entry.id),
    status: text(entry.status, 'draft'),
    version: Math.max(1, Number(entry.version) || 1),
    attributes: {
      displayId: text(entry.displayId),
      requirementType: text(entry.type),
      phase: text(entry.phase),
      module: text(entry.module),
      priority: text(entry.priority),
    },
    sourceRefs: [{ type: 'requirement', id: text(entry.id) }],
    provenance: normalizeProvenance({ source: 'requirements_store', sourceId: text(entry.id) }),
    createdAt: text(entry.createdAt),
    updatedAt: text(entry.updatedAt),
    virtual: true,
  }));
}

function getGraph(project, options = {}) {
  const state = normalizeState(project?.engineeringState);
  const virtual = options.includeVirtual === false ? [] : projectVirtualEntities(project);
  const requirements = options.includeRequirements === false ? [] : requirementVirtualEntities(project);
  const byId = new Map();
  [...virtual, ...requirements, ...state.entities].forEach((entity) => byId.set(entity.id, entity));
  const relationships = new Map();
  ensureArray(project?.traceLinks).forEach((link) => {
    try {
      const normalized = normalizeRelationship({ ...link, provenance: { source: 'trace_links', sourceId: link.id } });
      relationships.set(normalized.id, { ...normalized, virtual: true });
    } catch {
      // Invalid legacy edges are exposed in diagnostics, not allowed to break reads.
    }
  });
  state.relationships.forEach((relationship) => relationships.set(relationship.id, relationship));
  const externalReferences = new Map();
  projectExternalReferences(project).forEach((reference) => externalReferences.set(reference.id, { ...reference, virtual: true }));
  state.externalReferences.forEach((reference) => externalReferences.set(reference.id, reference));
  return {
    schemaVersion: SCHEMA_VERSION,
    revision: state.revision,
    entities: [...byId.values()],
    relationships: [...relationships.values()],
    externalReferences: [...externalReferences.values()],
    updatedAt: state.updatedAt,
  };
}

function diagnostics(project) {
  const state = normalizeState(project?.engineeringState);
  const graph = getGraph(project);
  const nodeKeys = new Set(graph.entities.map((entry) => `${entry.type}:${entry.id}`));
  const danglingRelationships = graph.relationships.filter((entry) => (
    !nodeKeys.has(`${entry.sourceType}:${entry.sourceId}`)
    || !nodeKeys.has(`${entry.targetType}:${entry.targetId}`)
  ));
  const duplicateFingerprints = [];
  const seen = new Map();
  graph.entities.forEach((entry) => {
    const fingerprint = `${entry.type}:${entry.title.toLowerCase()}`;
    if (seen.has(fingerprint)) duplicateFingerprints.push([seen.get(fingerprint), entry.id]);
    else seen.set(fingerprint, entry.id);
  });
  const incoming = new Map();
  const dependencyGraph = new Map();
  graph.relationships.forEach((relationship) => {
    const target = `${relationship.targetType}:${relationship.targetId}`;
    incoming.set(target, (incoming.get(target) || 0) + 1);
    if (relationship.relationshipType === 'depends_on') {
      const source = `${relationship.sourceType}:${relationship.sourceId}`;
      if (!dependencyGraph.has(source)) dependencyGraph.set(source, []);
      dependencyGraph.get(source).push(target);
    }
  });
  const findings = [];
  danglingRelationships.forEach((relationship) => findings.push({
    type: 'dangling_relationship', severity: 'error', relationshipId: relationship.id,
  }));
  duplicateFingerprints.forEach(([firstId, secondId]) => findings.push({
    type: 'possible_duplicate', severity: 'warning', entityIds: [firstId, secondId],
  }));
  graph.entities.filter((entity) => entity.type === 'success_criterion' && !incoming.has(`${entity.type}:${entity.id}`)).forEach((entity) => findings.push({
    type: 'criterion_without_evidence', severity: 'warning', entityId: entity.id,
  }));
  graph.entities.filter((entity) => entity.type === 'requirement' && !incoming.has(`${entity.type}:${entity.id}`)).forEach((entity) => findings.push({
    type: 'requirement_without_origin', severity: 'info', entityId: entity.id,
  }));
  const visiting = new Set();
  const visited = new Set();
  const cycleNodes = new Set();
  function visit(node) {
    if (visiting.has(node)) { cycleNodes.add(node); return; }
    if (visited.has(node)) return;
    visiting.add(node);
    ensureArray(dependencyGraph.get(node)).forEach((next) => {
      if (visiting.has(next)) { cycleNodes.add(node); cycleNodes.add(next); }
      else visit(next);
    });
    visiting.delete(node);
    visited.add(node);
  }
  [...dependencyGraph.keys()].forEach(visit);
  if (cycleNodes.size) findings.push({ type: 'dependency_cycle', severity: 'error', nodes: [...cycleNodes] });
  return {
    feature: FEATURE_FLAG,
    enabled: featureEnabled(project),
    schemaVersion: SCHEMA_VERSION,
    revision: state.revision,
    stored: {
      entities: state.entities.length,
      relationships: state.relationships.length,
      externalReferences: state.externalReferences.length,
      changeSets: ensureArray(project?.engineeringChangeSets).length,
    },
    projected: {
      entities: graph.entities.length,
      relationships: graph.relationships.length,
      requirements: requirementVirtualEntities(project).length,
    },
    danglingRelationships,
    duplicateFingerprints,
    findings,
    findingCounts: findings.reduce((counts, finding) => ({ ...counts, [finding.severity]: (counts[finding.severity] || 0) + 1 }), {}),
    healthy: !findings.some((finding) => finding.severity === 'error'),
  };
}

function normalizeImpactAssessment(raw) {
  const level = text(raw?.level, 'local').toLowerCase();
  if (!IMPACT_LEVELS.has(level)) throw new Error(`Unsupported impact level: ${level}`);
  return {
    level,
    affectedEntityIds: uniqueStrings(raw?.affectedEntityIds),
    affectedDocumentIds: uniqueStrings(raw?.affectedDocumentIds),
    requiredChecks: uniqueStrings(raw?.requiredChecks),
    rationale: text(raw?.rationale),
  };
}

function normalizeChangeSet(raw, context = {}) {
  if (text(raw?.schemaVersion) !== CHANGE_SET_SCHEMA) {
    throw new Error(`Unsupported change set schema: ${text(raw?.schemaVersion) || '(empty)'}`);
  }
  const createdAt = text(raw?.createdAt, nowIso());
  const sections = ensureArray(raw?.sections).map((section, sectionIndex) => ({
    id: text(section?.id, `section-${sectionIndex + 1}`),
    title: text(section?.title || section?.label, `Section ${sectionIndex + 1}`),
    summary: text(section?.summary),
    decision: SECTION_DECISIONS.has(text(section?.decision, 'pending')) ? text(section?.decision, 'pending') : 'pending',
    decisionNotes: text(section?.decisionNotes),
    decidedAt: text(section?.decidedAt),
    decidedBy: text(section?.decidedBy),
    operations: ensureArray(section?.operations).map((operation, operationIndex) => ({
      ...clone(operation),
      id: text(operation?.id, `${text(section?.id, `section-${sectionIndex + 1}`)}-op-${operationIndex + 1}`),
      type: text(operation?.type || operation?.op).toLowerCase(),
    })),
  }));
  return {
    schemaVersion: CHANGE_SET_SCHEMA,
    id: text(raw?.id, `engcs_${crypto.randomUUID()}`),
    projectId: text(raw?.projectId, context.projectId),
    taskId: text(raw?.taskId),
    runId: text(raw?.runId),
    baseEngineeringRevision: Math.max(0, Number(raw?.baseEngineeringRevision) || 0),
    summary: text(raw?.summary),
    sections,
    documentsToRegenerate: uniqueStrings(raw?.documentsToRegenerate),
    inconsistenciesFound: ensureArray(raw?.inconsistenciesFound).map((entry) => clone(entry)),
    assumptionsMade: uniqueStrings(raw?.assumptionsMade),
    questionsForHuman: ensureArray(raw?.questionsForHuman).map((entry) => clone(entry)),
    impactAssessment: normalizeImpactAssessment(raw?.impactAssessment),
    evidence: ensureArray(raw?.evidence).map((entry) => clone(entry)),
    recommendedTasks: ensureArray(raw?.recommendedTasks).map((entry) => ({
      ...clone(entry), id: text(entry?.id, `suggestion_${crypto.randomUUID()}`), status: text(entry?.status, 'suggested'),
    })),
    confidence: Math.max(0, Math.min(1, Number(raw?.confidence) || 0)),
    requiresHumanApproval: true,
    status: text(raw?.status, 'proposed'),
    createdAt,
    updatedAt: text(raw?.updatedAt, createdAt),
    createdBy: text(raw?.createdBy, context.actorId),
    appliedAt: text(raw?.appliedAt),
    appliedBy: text(raw?.appliedBy),
    appliedRevision: Number(raw?.appliedRevision) || null,
    snapshotId: text(raw?.snapshotId),
    proposalHash: text(raw?.proposalHash),
  };
}

function changeSetProposalFingerprint(raw, context = {}) {
  const changeSet = normalizeChangeSet(raw, context);
  const proposal = {
    schemaVersion: changeSet.schemaVersion,
    id: changeSet.id,
    projectId: changeSet.projectId,
    taskId: changeSet.taskId,
    runId: changeSet.runId,
    baseEngineeringRevision: changeSet.baseEngineeringRevision,
    summary: changeSet.summary,
    sections: changeSet.sections.map((section) => ({
      id: section.id,
      title: section.title,
      summary: section.summary,
      operations: section.operations,
    })),
    documentsToRegenerate: changeSet.documentsToRegenerate,
    inconsistenciesFound: changeSet.inconsistenciesFound,
    assumptionsMade: changeSet.assumptionsMade,
    questionsForHuman: changeSet.questionsForHuman,
    impactAssessment: changeSet.impactAssessment,
    evidence: changeSet.evidence,
    recommendedTasks: changeSet.recommendedTasks.map(({ status, ...entry }) => entry),
    confidence: changeSet.confidence,
    requiresHumanApproval: true,
  };
  return crypto.createHash('sha256').update(JSON.stringify(proposal)).digest('hex');
}

function syncRecommendedTaskSuggestions(project, rawChangeSet, at = nowIso()) {
  const changeSet = normalizeChangeSet(rawChangeSet, { projectId: project?.id });
  project.taskSuggestions = ensureArray(project.taskSuggestions);
  const created = [];
  changeSet.recommendedTasks.forEach((recommendation, index) => {
    const title = text(recommendation?.title, `Follow-up from ${changeSet.id}`);
    const fingerprint = crypto.createHash('sha256')
      .update(`engineering_change_set|${changeSet.id}|${text(recommendation?.id, String(index))}|${title}`)
      .digest('hex').slice(0, 24);
    const existing = project.taskSuggestions.find((entry) => entry.fingerprint === fingerprint);
    if (existing) return;
    const id = stableId('tsug', project.id, changeSet.id, recommendation?.id || index);
    const suggestion = {
      id,
      fingerprint,
      ruleId: 'engineering_change_set',
      deliveryStageId: text(recommendation?.deliveryStageId, 'discovery'),
      planPhaseId: text(recommendation?.planPhaseId),
      title,
      reason: text(recommendation?.reason || recommendation?.descriptionMarkdown, `Recommended by reviewed change set ${changeSet.id}.`),
      evidence: [{ type: 'engineering_change_set', id: changeSet.id, state: changeSet.status, label: changeSet.summary }],
      sourceRefs: [{ type: 'engineering_change_set', id: changeSet.id, label: changeSet.summary }],
      proposedTask: {
        title,
        descriptionMarkdown: text(recommendation?.descriptionMarkdown || recommendation?.reason, `Follow up the approved engineering change set ${changeSet.summary}.`),
        acceptanceCriteriaMarkdown: text(recommendation?.acceptanceCriteriaMarkdown, 'The recommended outcome is delivered with linked evidence.'),
        complexity: ['low', 'medium', 'high'].includes(text(recommendation?.complexity)) ? text(recommendation?.complexity) : 'medium',
        status: 'planned',
        priority: ['low', 'medium', 'high'].includes(text(recommendation?.priority)) ? text(recommendation?.priority) : 'medium',
        deliveryStageId: text(recommendation?.deliveryStageId, 'discovery'),
        planPhaseId: text(recommendation?.planPhaseId),
        executorMode: text(recommendation?.executorMode, 'human'),
        sourceRefs: [{ type: 'engineering_change_set', id: changeSet.id, label: changeSet.summary }],
      },
      status: 'proposed',
      acceptedTaskId: '',
      createdAt: at,
      updatedAt: at,
      dismissedAt: '',
      acceptedAt: '',
    };
    project.taskSuggestions.unshift(suggestion);
    created.push(suggestion);
  });
  return created;
}

function validateChangeSet(raw, project) {
  const errors = [];
  let changeSet;
  try {
    changeSet = normalizeChangeSet(raw, { projectId: project?.id });
  } catch (error) {
    return { valid: false, errors: [error.message], changeSet: null };
  }
  if (!changeSet.projectId || changeSet.projectId !== project?.id) errors.push('Change set projectId does not match the project.');
  if (!changeSet.taskId) errors.push('Change set taskId is required.');
  if (!changeSet.runId) errors.push('Change set runId is required.');
  if (!changeSet.sections.length) errors.push('Change set must contain at least one section.');
  const sectionIds = new Set();
  const operationIds = new Set();
  for (const section of changeSet.sections) {
    if (sectionIds.has(section.id)) errors.push(`Duplicate section id: ${section.id}`);
    sectionIds.add(section.id);
    if (!section.operations.length) errors.push(`Section ${section.id} has no operations.`);
    for (const operation of section.operations) {
      if (operationIds.has(operation.id)) errors.push(`Duplicate operation id: ${operation.id}`);
      operationIds.add(operation.id);
      if (!OPERATION_TYPES.has(operation.type)) errors.push(`Unsupported operation: ${operation.type || '(empty)'}`);
      if (operation.type === 'create_entity') {
        try { normalizeEntity(operation.entity, { provenance: { taskId: changeSet.taskId, runId: changeSet.runId, changeSetId: changeSet.id } }); } catch (error) { errors.push(`${operation.id}: ${error.message}`); }
      }
      if (operation.type === 'update_entity') {
        if (!text(operation.entityId)) errors.push(`${operation.id}: entityId is required.`);
        if (!Number.isInteger(Number(operation.expectedEntityVersion)) || Number(operation.expectedEntityVersion) < 1) errors.push(`${operation.id}: expectedEntityVersion is required.`);
        if (!ensureArray(operation.patch).length) errors.push(`${operation.id}: RFC 6902 patch is required.`);
        ensureArray(operation.patch).forEach((patch) => {
          const op = text(patch?.op).toLowerCase();
          const path = text(patch?.path);
          const root = path.split('/').filter(Boolean)[0] || '';
          if (!['add', 'replace', 'remove'].includes(op)) errors.push(`${operation.id}: unsupported JSON Patch operation ${op}.`);
          if (!path.startsWith('/')) errors.push(`${operation.id}: JSON Patch path must start with '/'.`);
          if (IMMUTABLE_PATCH_ROOTS.has(root)) errors.push(`${operation.id}: ${root} is immutable.`);
        });
      }
      if (operation.type === 'deprecate_entity' && !text(operation.entityId)) errors.push(`${operation.id}: entityId is required.`);
      if (operation.type === 'create_relationship') {
        try { normalizeRelationship(operation.relationship, { provenance: { taskId: changeSet.taskId, runId: changeSet.runId, changeSetId: changeSet.id } }); } catch (error) { errors.push(`${operation.id}: ${error.message}`); }
      }
      if (operation.type === 'remove_relationship' && !text(operation.relationshipId)) errors.push(`${operation.id}: relationshipId is required.`);
    }
  }
  return { valid: errors.length === 0, errors, changeSet };
}

function decodePointerToken(token) {
  return token.replace(/~1/g, '/').replace(/~0/g, '~');
}

function applyJsonPatch(document, patches) {
  const result = clone(document);
  for (const patch of ensureArray(patches)) {
    const tokens = text(patch.path).split('/').slice(1).map(decodePointerToken);
    if (!tokens.length) throw new Error('Replacing the complete entity is prohibited.');
    let parent = result;
    for (let index = 0; index < tokens.length - 1; index += 1) {
      const token = tokens[index];
      if (!isObject(parent[token]) && !Array.isArray(parent[token])) {
        if (patch.op === 'add') parent[token] = {};
        else throw new Error(`JSON Patch path does not exist: ${patch.path}`);
      }
      parent = parent[token];
    }
    const key = tokens[tokens.length - 1];
    if (patch.op === 'remove') {
      if (Array.isArray(parent)) parent.splice(Number(key), 1);
      else delete parent[key];
    } else if (Array.isArray(parent) && key === '-') {
      parent.push(clone(patch.value));
    } else {
      parent[key] = clone(patch.value);
    }
  }
  return result;
}

function applyApprovedChangeSet(project, rawChangeSet, context = {}) {
  const validation = validateChangeSet(rawChangeSet, project);
  if (!validation.valid) throw new Error(`Invalid engineering change set: ${validation.errors.join(' ')}`);
  const changeSet = validation.changeSet;
  const state = normalizeState(project.engineeringState);
  if (changeSet.status === 'applied') return { state, changeSet, replayed: true };
  if (state.revision !== changeSet.baseEngineeringRevision) {
    throw new Error(`Stale engineering change set: expected revision ${changeSet.baseEngineeringRevision}, current revision ${state.revision}.`);
  }
  const approved = changeSet.sections.filter((section) => section.decision === 'approved');
  if (!approved.length) throw new Error('At least one section must be approved before apply.');
  if (changeSet.sections.some((section) => section.decision === 'pending')) {
    throw new Error('Every change set section must have a review decision before apply.');
  }
  const working = normalizeState(state);
  const entityMap = new Map(working.entities.map((entity) => [entity.id, entity]));
  const relationshipMap = new Map(working.relationships.map((entry) => [entry.id, entry]));
  const at = context.now || nowIso();
  const provenance = {
    taskId: changeSet.taskId,
    runId: changeSet.runId,
    changeSetId: changeSet.id,
    actorId: context.actorId,
  };
  for (const section of approved) {
    for (const operation of section.operations) {
      if (operation.type === 'create_entity') {
        const entity = normalizeEntity(operation.entity, { now: at, provenance });
        if (entityMap.has(entity.id)) throw new Error(`Entity already exists: ${entity.id}`);
        entityMap.set(entity.id, entity);
      } else if (operation.type === 'update_entity') {
        const current = entityMap.get(text(operation.entityId));
        if (!current) throw new Error(`Entity does not exist: ${operation.entityId}`);
        if (current.version !== Number(operation.expectedEntityVersion)) throw new Error(`Stale entity version: ${operation.entityId}`);
        const patched = applyJsonPatch(current, operation.patch);
        patched.version = current.version + 1;
        patched.updatedAt = at;
        entityMap.set(current.id, normalizeEntity(patched));
      } else if (operation.type === 'deprecate_entity') {
        const current = entityMap.get(text(operation.entityId));
        if (!current) throw new Error(`Entity does not exist: ${operation.entityId}`);
        entityMap.set(current.id, { ...current, status: 'deprecated', version: current.version + 1, updatedAt: at });
      } else if (operation.type === 'create_relationship') {
        const relationship = normalizeRelationship(operation.relationship, { now: at, provenance });
        const virtualIds = new Set([
          ...requirementVirtualEntities(project).map((entry) => entry.id),
          ...projectVirtualEntities(project).map((entry) => entry.id),
        ]);
        const sourceExists = entityMap.has(relationship.sourceId) || virtualIds.has(relationship.sourceId);
        const targetExists = entityMap.has(relationship.targetId) || virtualIds.has(relationship.targetId);
        if (!sourceExists || !targetExists) throw new Error(`Relationship ${relationship.id} references a missing entity.`);
        if (relationshipMap.has(relationship.id)) throw new Error(`Relationship already exists: ${relationship.id}`);
        relationshipMap.set(relationship.id, relationship);
      } else if (operation.type === 'remove_relationship') {
        if (!relationshipMap.delete(text(operation.relationshipId))) throw new Error(`Relationship does not exist: ${operation.relationshipId}`);
      }
    }
  }
  working.entities = [...entityMap.values()];
  working.relationships = [...relationshipMap.values()];
  working.revision += 1;
  working.updatedAt = at;
  changeSet.status = 'applied';
  changeSet.appliedAt = at;
  changeSet.appliedBy = text(context.actorId);
  changeSet.appliedRevision = working.revision;
  changeSet.updatedAt = at;
  return { state: working, changeSet, replayed: false };
}

function entityDescription(entity) {
  return text(entity?.attributes?.descriptionMarkdown || entity?.attributes?.description || entity?.attributes?.summaryMarkdown);
}

function projectStateToLegacy(project) {
  const state = normalizeState(project.engineeringState);
  const active = state.entities.filter((entity) => entity.status === 'active');
  const first = (type) => active.find((entity) => entity.type === type);
  project.vision = isObject(project.vision) ? project.vision : {};
  project.discovery = isObject(project.discovery) ? project.discovery : {};
  const problem = first('problem');
  const intent = first('intent');
  if (problem && entityDescription(problem)) project.vision.problemMarkdown = entityDescription(problem);
  if (intent) {
    if (entityDescription(intent)) project.vision.mainIdeaMarkdown = entityDescription(intent);
    if (text(intent.attributes.valuePropositionMarkdown)) project.vision.valuePropositionMarkdown = text(intent.attributes.valuePropositionMarkdown);
    if (intent.title && intent.title !== intent.id) project.vision.headline = intent.title;
  }
  const stakeholderByName = new Map(ensureArray(project.discovery.stakeholders).map((item) => [text(item?.name).toLowerCase(), clone(item)]));
  active.filter((entity) => entity.type === 'stakeholder').forEach((entity) => {
    const name = text(entity.attributes.name, entity.title);
    stakeholderByName.set(name.toLowerCase(), { name, ...clone(entity.attributes), engineeringEntityId: entity.id });
  });
  project.discovery.stakeholders = [...stakeholderByName.values()];
  const assumptions = new Set(ensureArray(project.discovery.assumptions).map((item) => text(item)).filter(Boolean));
  active.filter((entity) => entity.type === 'assumption').forEach((entity) => {
    const value = entityDescription(entity) || entity.title;
    if (value) assumptions.add(value);
  });
  project.discovery.assumptions = [...assumptions];
  const sourceById = new Map(ensureArray(project.discovery.researchSources).map((item) => [text(item?.id || item?.url), clone(item)]));
  active.filter((entity) => entity.type === 'evidence').forEach((entity) => {
    sourceById.set(entity.id, {
      id: entity.id,
      title: entity.title,
      url: text(entity.attributes.url || entity.attributes.uri),
      publisher: text(entity.attributes.publisher),
      publishedAt: text(entity.attributes.publishedAt),
      retrievedAt: text(entity.attributes.retrievedAt, entity.updatedAt),
      sourceType: text(entity.attributes.sourceType, 'official'),
      claims: uniqueStrings(entity.attributes.claims),
      confidence: text(entity.attributes.confidence),
    });
  });
  project.discovery.researchSources = [...sourceById.values()];
  project.vision.updatedAt = state.updatedAt;
  project.discovery.updatedAt = state.updatedAt;
  project.engineeringProjectionV1 = { revision: state.revision, updatedAt: state.updatedAt };
  return project;
}

function calculateImpact(project, sourceType, sourceId, includeUpstream = false) {
  const graph = getGraph(project);
  const key = (type, id) => `${type}:${id}`;
  const outgoing = new Map();
  const incoming = new Map();
  graph.relationships.forEach((edge) => {
    const from = key(edge.sourceType, edge.sourceId);
    const to = key(edge.targetType, edge.targetId);
    if (!outgoing.has(from)) outgoing.set(from, []);
    if (!incoming.has(to)) incoming.set(to, []);
    outgoing.get(from).push(edge);
    incoming.get(to).push(edge);
  });
  const root = key(text(sourceType), text(sourceId));
  const queue = [{ node: root, direction: 'downstream' }];
  const seen = new Set([root]);
  const impacted = [];
  while (queue.length) {
    const current = queue.shift();
    const candidates = [...(outgoing.get(current.node) || []).map((edge) => ({ edge, type: edge.targetType, id: edge.targetId, direction: 'downstream' }))];
    if (includeUpstream) candidates.push(...(incoming.get(current.node) || []).map((edge) => ({ edge, type: edge.sourceType, id: edge.sourceId, direction: 'upstream' })));
    candidates.forEach((candidate) => {
      const next = key(candidate.type, candidate.id);
      if (seen.has(next)) return;
      seen.add(next);
      queue.push({ node: next, direction: candidate.direction });
      impacted.push({ nodeType: candidate.type, id: candidate.id, relationshipType: candidate.edge.relationshipType, direction: candidate.direction });
    });
  }
  const phases = new Set(impacted.map((entry) => graph.entities.find((entity) => entity.id === entry.id)?.attributes?.phase).filter(Boolean));
  const level = impacted.length === 0 ? 'none' : phases.size > 1 ? 'cross_phase' : impacted.length > 5 ? 'downstream' : 'local';
  return { sourceType, sourceId, includeUpstream, level, impacted };
}

module.exports = {
  SCHEMA_VERSION,
  CHANGE_SET_SCHEMA,
  FEATURE_FLAG,
  ENTITY_TYPES,
  EXTRA_RELATIONSHIP_TYPES,
  RELATIONSHIP_TYPES,
  featureEnabled,
  normalizeEntity,
  normalizeRelationship,
  normalizeExternalReference,
  normalizeState,
  normalizeChangeSet,
  changeSetProposalFingerprint,
  syncRecommendedTaskSuggestions,
  validateChangeSet,
  applyApprovedChangeSet,
  projectStateToLegacy,
  projectVirtualEntities,
  projectExternalReferences,
  requirementVirtualEntities,
  getGraph,
  diagnostics,
  calculateImpact,
  stableId,
};
