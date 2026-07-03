const crypto = require('crypto');
const registry = require('./diagram-registry');
const { isSupportedDiagramType, isSupportedNotation } = registry;
const { validateDiagramArtifact, validateAiDiagramOutput } = require('./diagram-validation');
const { renderDiagram } = require('./diagram-renderer');
const {
  buildMinimalContextPack,
  buildDiagramGenerationPrompt,
} = require('./diagram-context');
const traceability = require('./diagram-traceability');

const DIAGRAM_STATUSES = ['draft', 'needs_review', 'approved', 'rejected', 'deprecated'];
const GENERATED_BY = ['human', 'ai-agent', 'import'];
const REVIEW_STATUSES = ['pending', 'approved', 'rejected', 'changes_requested'];
const JOB_STATUSES = ['pending', 'awaiting_output', 'completed', 'failed', 'cancelled'];
const ARCHITECTURE_PHASE = 'architecture';

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function textOr(value, fallback = '') {
  return String(value ?? fallback).trim();
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeStringArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((v) => textOr(v)).filter(Boolean);
  return textOr(value).split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);
}

function normalizeDiagramArtifact(record = {}, defaults = {}) {
  const type = textOr(record.type, defaults.type || 'sequence');
  const template = registry.getDiagramType(type);
  return {
    id: textOr(record.id, defaults.id || `diag_${crypto.randomUUID().slice(0, 10)}`),
    projectId: textOr(record.projectId, defaults.projectId),
    title: textOr(record.title, defaults.title || template?.label || 'Diagrama'),
    description: textOr(record.description, defaults.description),
    type,
    notation: textOr(record.notation, defaults.notation || registry.getRecommendedNotation(type)),
    sourceText: textOr(record.sourceText, defaults.sourceText),
    renderedSvg: record.renderedSvg ?? null,
    status: DIAGRAM_STATUSES.includes(record.status) ? record.status : 'draft',
    phase: ARCHITECTURE_PHASE,
    module: record.module != null ? textOr(record.module) || null : (defaults.module ?? null),
    submodule: record.submodule != null ? textOr(record.submodule) || null : (defaults.submodule ?? null),
    version: Math.max(1, Number(record.version) || 1),
    parentArtifactId: textOr(record.parentArtifactId) || null,
    generatedBy: GENERATED_BY.includes(record.generatedBy) ? record.generatedBy : 'human',
    reviewedBy: textOr(record.reviewedBy) || null,
    createdAt: record.createdAt || defaults.createdAt || nowIso(),
    updatedAt: record.updatedAt || defaults.updatedAt || nowIso(),
    approvedAt: record.approvedAt || null,
    linkedRequirementIds: normalizeStringArray(record.linkedRequirementIds),
    linkedApiOperationIds: normalizeStringArray(record.linkedApiOperationIds),
    linkedEntityIds: normalizeStringArray(record.linkedEntityIds),
    linkedRoadmapPhaseIds: normalizeStringArray(record.linkedRoadmapPhaseIds),
    linkedTestIds: normalizeStringArray(record.linkedTestIds),
    validationStatus: ['valid', 'invalid', 'warning', 'not_validated'].includes(record.validationStatus)
      ? record.validationStatus
      : 'not_validated',
    validationErrors: ensureArray(record.validationErrors),
    metadata: record.metadata && typeof record.metadata === 'object' ? record.metadata : {},
  };
}

function normalizeDiagramVersion(record = {}) {
  return {
    id: textOr(record.id, `dver_${crypto.randomUUID().slice(0, 10)}`),
    diagramArtifactId: textOr(record.diagramArtifactId),
    version: Math.max(1, Number(record.version) || 1),
    sourceText: textOr(record.sourceText),
    metadata: record.metadata && typeof record.metadata === 'object' ? record.metadata : {},
    createdAt: record.createdAt || nowIso(),
    createdBy: textOr(record.createdBy),
    changeSummary: textOr(record.changeSummary),
  };
}

function normalizeDiagramReview(record = {}) {
  return {
    id: textOr(record.id, `drev_${crypto.randomUUID().slice(0, 10)}`),
    diagramArtifactId: textOr(record.diagramArtifactId),
    reviewerId: textOr(record.reviewerId),
    status: REVIEW_STATUSES.includes(record.status) ? record.status : 'pending',
    comments: textOr(record.comments),
    createdAt: record.createdAt || nowIso(),
  };
}

function normalizeDiagramGenerationJob(record = {}) {
  return {
    id: textOr(record.id, `djob_${crypto.randomUUID().slice(0, 10)}`),
    projectId: textOr(record.projectId),
    diagramArtifactId: textOr(record.diagramArtifactId) || null,
    requestedDiagramType: textOr(record.requestedDiagramType),
    inputContext: record.inputContext && typeof record.inputContext === 'object' ? record.inputContext : {},
    promptUsed: textOr(record.promptUsed),
    modelOutput: record.modelOutput ?? null,
    status: JOB_STATUSES.includes(record.status) ? record.status : 'pending',
    errors: ensureArray(record.errors),
    createdAt: record.createdAt || nowIso(),
    createdBy: textOr(record.createdBy),
    updatedAt: record.updatedAt || record.createdAt || nowIso(),
  };
}

function normalizeProjectDiagramFields(project) {
  project.diagramArtifacts = ensureArray(project.diagramArtifacts).map((d) =>
    normalizeDiagramArtifact({ ...d, projectId: project.id })
  );
  project.diagramVersions = ensureArray(project.diagramVersions).map(normalizeDiagramVersion);
  project.diagramReviews = ensureArray(project.diagramReviews).map(normalizeDiagramReview);
  project.diagramGenerationJobs = ensureArray(project.diagramGenerationJobs).map(normalizeDiagramGenerationJob);

  migrateDocumentsToDiagramArtifacts(project);
  traceability.backfillDiagramRequirementLinks(project);
  traceability.syncRequirementDiagramIds(project);

  return {
    diagramArtifacts: project.diagramArtifacts,
    diagramVersions: project.diagramVersions,
    diagramReviews: project.diagramReviews,
    diagramGenerationJobs: project.diagramGenerationJobs,
  };
}

function migrateDocumentsToDiagramArtifacts(project) {
  const docs = ensureArray(project.documents).filter(
    (d) => d.docType === 'diagram' && textOr(d.deliveryStageId, 'architecture') === ARCHITECTURE_PHASE
  );
  for (const doc of docs) {
    const linked = project.diagramArtifacts.some(
      (a) => a.metadata?.documentId === doc.id || a.metadata?.migratedFromDocumentId === doc.id
    );
    if (linked) continue;
    const notation = textOr(doc.diagramFormat, 'mermaid').toLowerCase();
    const mappedNotation = registry.isSupportedNotation(notation) ? notation : 'mermaid';
    project.diagramArtifacts.push(normalizeDiagramArtifact({
      id: `diag_${crypto.randomUUID().slice(0, 10)}`,
      projectId: project.id,
      title: textOr(doc.title, doc.originalName, 'Diagrama importado'),
      description: 'Migrado de documento da fase de arquitectura',
      type: mappedNotation === 'openapi' ? 'openapi_spec' : 'activity_flow',
      notation: mappedNotation,
      sourceText: textOr(doc.contentMarkdown),
      status: 'needs_review',
      generatedBy: doc.origin === 'ai' ? 'ai-agent' : 'import',
      metadata: { documentId: doc.id, migratedFromDocumentId: doc.id },
      linkedRequirementIds: [],
    }));
  }

  promoteLegacyArchitectureDiagrams(project);
}

function promoteLegacyArchitectureDiagrams(project) {
  if (ensureArray(project.diagramArtifacts).length) return;

  const mermaidMain = textOr(project.technicalApproach?.architectureMermaid);
  if (mermaidMain) {
    project.diagramArtifacts.push(normalizeDiagramArtifact({
      id: `diag_${crypto.randomUUID().slice(0, 10)}`,
      projectId: project.id,
      title: 'Diagrama de arquitectura (legado)',
      description: 'Migrado de technicalApproach.architectureMermaid',
      type: 'c4_container',
      notation: 'mermaid',
      sourceText: mermaidMain,
      status: 'needs_review',
      generatedBy: 'import',
      metadata: { migratedFrom: 'technicalApproach.architectureMermaid' },
    }));
    return;
  }

  const pack = ensureArray(project.artifacts).find((a) => a.type === 'architecture');
  const endpoints = ensureArray(pack?.metadata?.apiEndpoints);
  if (endpoints.length) {
    const lines = ['openapi: "3.0.3"', 'info:', '  title: API Architecture', '  version: "1.0.0"', 'paths:'];
    for (const ep of endpoints) {
      const method = textOr(ep.method, 'get').toLowerCase();
      const path = textOr(ep.path, '/');
      lines.push(`  ${path}:`);
      lines.push(`    ${method}:`);
      lines.push(`      summary: ${JSON.stringify(textOr(ep.description, ep.summary || ''))}`);
    }
    project.diagramArtifacts.push(normalizeDiagramArtifact({
      id: `diag_${crypto.randomUUID().slice(0, 10)}`,
      projectId: project.id,
      title: 'API — pacote de arquitectura (legado)',
      description: 'OpenAPI sintetizado a partir do pacote IA existente',
      type: 'openapi_spec',
      notation: 'openapi',
      sourceText: lines.join('\n'),
      status: 'needs_review',
      generatedBy: 'import',
      metadata: { migratedFrom: 'architecture_pack.apiEndpoints', packId: pack?.id },
    }));
  }
}

function assertArchitecturePhase(phase) {
  if (textOr(phase, ARCHITECTURE_PHASE) !== ARCHITECTURE_PHASE) {
    throw new Error('Diagramas só podem existir na fase de arquitectura.');
  }
}

function findDiagram(project, diagramId) {
  const diagram = ensureArray(project.diagramArtifacts).find((d) => d.id === diagramId);
  if (!diagram) throw new Error('Diagrama não encontrado.');
  assertArchitecturePhase(diagram.phase);
  return diagram;
}

function listDiagramVersions(project, diagramId) {
  return ensureArray(project.diagramVersions)
    .filter((v) => v.diagramArtifactId === diagramId)
    .sort((a, b) => b.version - a.version);
}

function listDiagramReviews(project, diagramId) {
  return ensureArray(project.diagramReviews)
    .filter((r) => r.diagramArtifactId === diagramId)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

function createDiagramVersion(project, diagram, userId, changeSummary, sourceOverride) {
  project.diagramVersions = ensureArray(project.diagramVersions);
  const version = normalizeDiagramVersion({
    diagramArtifactId: diagram.id,
    version: diagram.version,
    sourceText: sourceOverride ?? diagram.sourceText,
    metadata: { ...diagram.metadata, notation: diagram.notation, type: diagram.type },
    createdBy: userId,
    changeSummary: textOr(changeSummary, `Versão ${diagram.version}`),
  });
  project.diagramVersions.unshift(version);
  return version;
}

function diffLines(a, b) {
  const left = textOr(a).split('\n');
  const right = textOr(b).split('\n');
  const max = Math.max(left.length, right.length);
  const lines = [];
  for (let i = 0; i < max; i += 1) {
    const l = left[i];
    const r = right[i];
    if (l === r) lines.push({ type: 'same', line: l ?? '' });
    else if (l !== undefined && r === undefined) lines.push({ type: 'removed', line: l });
    else if (l === undefined && r !== undefined) lines.push({ type: 'added', line: r });
    else lines.push({ type: 'changed', from: l, to: r });
  }
  return lines;
}

function compareDiagramVersions(project, diagramId, fromVersion, toVersion) {
  const versions = listDiagramVersions(project, diagramId);
  const from = versions.find((v) => v.version === Number(fromVersion));
  const to = versions.find((v) => v.version === Number(toVersion));
  if (!from || !to) throw new Error('Versões não encontradas.');
  return {
    from: from.version,
    to: to.version,
    sourceDiff: diffLines(from.sourceText, to.sourceText),
    metadataDiff: diffLines(JSON.stringify(from.metadata, null, 2), JSON.stringify(to.metadata, null, 2)),
  };
}

function applyValidationToDiagram(project, diagram, { strictTraceability = false } = {}) {
  const result = validateDiagramArtifact(project, diagram, { strictTraceability });
  diagram.validationStatus = result.validationStatus;
  diagram.validationErrors = [...result.errors, ...result.warnings];
  diagram.updatedAt = nowIso();
  return result;
}

function createDiagramArtifact(project, body, userId) {
  assertArchitecturePhase(body.phase);
  const diagram = normalizeDiagramArtifact({
    ...body,
    projectId: project.id,
    phase: ARCHITECTURE_PHASE,
    generatedBy: body.generatedBy || 'human',
    status: body.status || 'draft',
    createdAt: nowIso(),
    updatedAt: nowIso(),
  });
  if (!registry.isSupportedDiagramType(diagram.type)) {
    throw new Error(`Tipo de diagrama não suportado: ${diagram.type}`);
  }
  if (!registry.isSupportedNotation(diagram.notation)) {
    throw new Error(`Notação não suportada: ${diagram.notation}`);
  }
  applyValidationToDiagram(project, diagram);
  traceability.ensureDiagramRequirementLinks(project, diagram, {
    requirementIds: body.linkedRequirementIds,
    capabilityId: body.capabilityId,
    moduleTag: body.module,
  });
  project.diagramArtifacts = ensureArray(project.diagramArtifacts);
  project.diagramArtifacts.unshift(diagram);
  createDiagramVersion(project, diagram, userId, 'Versão inicial');
  traceability.syncRequirementDiagramIds(project);
  return diagram;
}

function updateDiagramArtifact(project, diagramId, body, userId, { createVersion = false } = {}) {
  const diagram = findDiagram(project, diagramId);
  const beforeSource = diagram.sourceText;
  const fields = [
    'title', 'description', 'type', 'notation', 'sourceText', 'module', 'submodule',
    'linkedRequirementIds', 'linkedApiOperationIds', 'linkedEntityIds',
    'linkedRoadmapPhaseIds', 'linkedTestIds', 'metadata', 'status',
  ];
  for (const key of fields) {
    if (body[key] !== undefined) diagram[key] = body[key];
  }
  if (body.type && !registry.isSupportedDiagramType(diagram.type)) {
    throw new Error(`Tipo de diagrama não suportado: ${diagram.type}`);
  }
  if (body.notation && !registry.isSupportedNotation(diagram.notation)) {
    throw new Error(`Notação não suportada: ${diagram.notation}`);
  }
  diagram.updatedAt = nowIso();
  if (diagram.status === 'approved' && (body.sourceText !== undefined || createVersion)) {
    diagram.status = 'needs_review';
    diagram.approvedAt = null;
    diagram.reviewedBy = null;
  }
  applyValidationToDiagram(project, diagram);
  if (createVersion || (body.sourceText !== undefined && body.sourceText !== beforeSource)) {
    diagram.version += 1;
    createDiagramVersion(project, diagram, userId, textOr(body.changeSummary, 'Actualização manual'));
  }
  if (body.linkedRequirementIds !== undefined) {
    diagram.linkedRequirementIds = traceability.filterValidRequirementIds(project, diagram.linkedRequirementIds);
  }
  traceability.syncRequirementDiagramIds(project);
  return diagram;
}

function approveDiagram(project, diagramId, reviewerId, comments) {
  const diagram = findDiagram(project, diagramId);
  const validation = applyValidationToDiagram(project, diagram, { strictTraceability: true });
  if (validation.validationStatus === 'invalid') {
    throw new Error('Não é possível aprovar — corrija os erros de validação primeiro.');
  }
  diagram.status = 'approved';
  diagram.reviewedBy = reviewerId;
  diagram.approvedAt = nowIso();
  diagram.updatedAt = nowIso();
  project.diagramReviews = ensureArray(project.diagramReviews);
  project.diagramReviews.unshift(normalizeDiagramReview({
    diagramArtifactId: diagram.id,
    reviewerId,
    status: 'approved',
    comments: textOr(comments),
  }));
  return diagram;
}

function rejectDiagram(project, diagramId, reviewerId, comments) {
  const diagram = findDiagram(project, diagramId);
  diagram.status = 'rejected';
  diagram.reviewedBy = reviewerId;
  diagram.approvedAt = null;
  diagram.updatedAt = nowIso();
  project.diagramReviews = ensureArray(project.diagramReviews);
  project.diagramReviews.unshift(normalizeDiagramReview({
    diagramArtifactId: diagram.id,
    reviewerId,
    status: 'rejected',
    comments: textOr(comments, 'Rejeitado na revisão'),
  }));
  return diagram;
}

function rollbackDiagramVersion(project, diagramId, versionNumber, userId) {
  const diagram = findDiagram(project, diagramId);
  const target = listDiagramVersions(project, diagramId).find((v) => v.version === Number(versionNumber));
  if (!target) throw new Error('Versão alvo não encontrada.');
  diagram.sourceText = target.sourceText;
  diagram.metadata = { ...diagram.metadata, ...target.metadata };
  diagram.version += 1;
  diagram.status = 'needs_review';
  diagram.updatedAt = nowIso();
  applyValidationToDiagram(project, diagram);
  createDiagramVersion(project, diagram, userId, `Rollback para v${versionNumber}`);
  return diagram;
}

function createDiagramFromAiOutput(project, payload, userId, job) {
  const check = validateAiDiagramOutput(project, payload);
  if (!check.valid) {
    const msg = check.errors.map((e) => e.message).join(' ');
    throw new Error(msg || 'Output da IA inválido.');
  }
  const parsed = check.parsed;
  const existingId = job?.diagramArtifactId;
  if (existingId) {
    return updateDiagramArtifact(project, existingId, {
      title: parsed.title,
      description: textOr(parsed.summary),
      type: parsed.type,
      notation: parsed.notation,
      sourceText: parsed.sourceText,
      linkedRequirementIds: parsed.linkedRequirementIds,
      linkedApiOperationIds: parsed.linkedApiOperationIds,
      linkedEntityIds: parsed.linkedEntityIds,
      linkedRoadmapPhaseIds: parsed.linkedRoadmapPhaseIds,
      linkedTestIds: parsed.linkedTestIds,
      metadata: {
        assumptions: ensureArray(parsed.assumptions),
        openQuestions: ensureArray(parsed.openQuestions),
        generationJobId: job?.id,
      },
      status: 'needs_review',
      changeSummary: 'Output de agente IA',
    }, userId, { createVersion: true });
  }
  return createDiagramArtifact(project, {
    title: parsed.title,
    description: textOr(parsed.summary),
    type: parsed.type,
    notation: parsed.notation,
    sourceText: parsed.sourceText,
    linkedRequirementIds: parsed.linkedRequirementIds?.length
      ? parsed.linkedRequirementIds
      : job?.inputContext?.requirementIds,
    linkedApiOperationIds: parsed.linkedApiOperationIds,
    linkedEntityIds: parsed.linkedEntityIds,
    linkedRoadmapPhaseIds: parsed.linkedRoadmapPhaseIds,
    linkedTestIds: parsed.linkedTestIds,
    metadata: {
      assumptions: ensureArray(parsed.assumptions),
      openQuestions: ensureArray(parsed.openQuestions),
      generationJobId: job?.id,
    },
    status: 'needs_review',
    generatedBy: 'ai-agent',
    module: job?.inputContext?.module || null,
    submodule: job?.inputContext?.submodule || null,
  }, userId);
}

function createDiagramArtifactsFromLegacyPack(project, parsed, userId, moduleTag, { skipIfDiagramArtifacts = false } = {}) {
  const created = [];
  const sources = [];
  const mermaidMain = textOr(parsed.architectureMermaid || parsed.mermaid);
  if (mermaidMain && !skipIfDiagramArtifacts) {
    sources.push({ title: `Diagrama — ${moduleTag}`, content: mermaidMain, type: 'c4_container', notation: 'mermaid' });
  }
  for (const d of ensureArray(parsed.diagrams)) {
    const content = textOr(d.content || d.source || d.body);
    if (!content) continue;
    const notation = textOr(d.format || d.notation, 'mermaid').toLowerCase();
    sources.push({
      title: textOr(d.title || d.name, 'Diagrama'),
      content,
      type: textOr(d.diagramType || d.type, 'activity_flow'),
      notation: isSupportedNotation(notation) ? notation : 'mermaid',
    });
  }

  const { createPhaseDiagramDocument } = require('./phase-content');
  project.documents = ensureArray(project.documents);
  for (const src of sources) {
    project.documents.push(createPhaseDiagramDocument({
      title: src.title,
      contentMarkdown: src.content,
      diagramFormat: src.notation,
      deliveryStageId: ARCHITECTURE_PHASE,
      origin: 'ai',
      userId,
    }));
    const diagramType = isSupportedDiagramType(src.type) ? src.type : 'activity_flow';
    try {
      const diagram = createDiagramArtifact(project, {
        title: src.title,
        description: 'Gerado a partir do pacote de arquitectura (legado)',
        type: diagramType,
        notation: src.notation,
        sourceText: src.content,
        module: moduleTag,
        status: 'needs_review',
        generatedBy: 'ai-agent',
        capabilityId: null,
      }, userId);
      created.push(diagram);
    } catch (_err) {
      /* skip */
    }
  }

  if (mermaidMain && !project.technicalApproach?.architectureMermaid) {
    project.technicalApproach = project.technicalApproach || {};
    project.technicalApproach.architectureMermaid = mermaidMain;
  }
  return created;
}

function sanitizeDiagramForClient(diagram) {
  return { ...diagram };
}

function filterDiagrams(project, filters = {}) {
  let list = ensureArray(project.diagramArtifacts);
  if (filters.phase) list = list.filter((d) => d.phase === filters.phase);
  if (filters.module) list = list.filter((d) => d.module === filters.module);
  if (filters.type) list = list.filter((d) => d.type === filters.type);
  if (filters.status) list = list.filter((d) => d.status === filters.status);
  return list;
}

function parseAgentJsonOutput(raw) {
  const normalized = String(raw || '')
    .replace(/^\uFEFF/, '')
    .replace(/[\u201c\u201d\u201e\u201f\u2033\u2036]/g, '"')
    .replace(/[\u2018\u2019\u201a\u201b\u2032\u2035]/g, "'")
    .trim();
  const fence = normalized.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence ? fence[1].trim() : normalized;
  return JSON.parse(body);
}

function registerDiagramRoutes(app, deps) {
  const {
    authMiddleware,
    requireProjectEditor,
    loadProjectForUser,
    updateStore,
    appendActivity,
    sanitizeProject,
    readStore,
  } = deps;

  app.get('/api/projects/diagrams/registry', authMiddleware, (req, res) => {
    return res.json({
      types: registry.listDiagramTemplates(),
      notations: registry.NOTATIONS,
      notationLabels: registry.NOTATION_LABELS,
    });
  });

  app.get('/api/projects/projects/:projectId/diagrams', authMiddleware, loadProjectForUser, (req, res) => {
    const p = req.loadedProject;
    const filters = {
      phase: req.query.phase,
      module: req.query.module,
      type: req.query.type,
      status: req.query.status,
    };
    const diagrams = filterDiagrams(p, filters).map(sanitizeDiagramForClient);
    return res.json({ diagrams, phase: ARCHITECTURE_PHASE });
  });

  app.post('/api/projects/projects/:projectId/diagrams', authMiddleware, loadProjectForUser, requireProjectEditor, async (req, res) => {
    try {
      const projectId = req.params.projectId;
      let diagram;
      await updateStore(async (store) => {
        const project = store.projects.find((e) => e.id === projectId);
        if (!project) throw new Error('Projeto não encontrado.');
        normalizeProjectDiagramFields(project);
        diagram = createDiagramArtifact(project, req.body || {}, req.auth.user.id);
        project.updatedAt = nowIso();
        appendActivity(store, {
          actorUserId: req.auth.user.id,
          projectId,
          action: 'diagram_created',
          details: { diagramId: diagram.id, type: diagram.type },
        });
      });
      const store = await readStore();
      const updated = store.projects.find((e) => e.id === projectId);
      return res.status(201).json({ diagram, project: sanitizeProject(updated, req.auth.user) });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.get('/api/projects/projects/:projectId/diagrams/:diagramId', authMiddleware, loadProjectForUser, (req, res) => {
    try {
      const diagram = findDiagram(req.loadedProject, req.params.diagramId);
      const versions = listDiagramVersions(req.loadedProject, diagram.id);
      const reviews = listDiagramReviews(req.loadedProject, diagram.id);
      return res.json({ diagram, versions, reviews });
    } catch (error) {
      return res.status(404).json({ message: error.message });
    }
  });

  app.post('/api/projects/projects/:projectId/diagrams/:diagramId/link-requirements', authMiddleware, loadProjectForUser, requireProjectEditor, async (req, res) => {
    try {
      const projectId = req.params.projectId;
      const diagramId = req.params.diagramId;
      let diagram;
      await updateStore(async (store) => {
        const project = store.projects.find((e) => e.id === projectId);
        if (!project) throw new Error('Projeto não encontrado.');
        normalizeProjectDiagramFields(project);
        diagram = traceability.linkRequirementsToDiagram(
          project,
          diagramId,
          normalizeStringArray(req.body?.requirementIds),
          { merge: req.body?.merge !== false },
        );
        if (!diagram) throw new Error('Diagrama não encontrado.');
        project.updatedAt = nowIso();
        appendActivity(store, {
          actorUserId: req.auth.user.id,
          projectId,
          action: 'diagram_requirements_linked',
          details: { diagramId, requirementIds: diagram.linkedRequirementIds },
        });
      });
      const store = await readStore();
      const updated = store.projects.find((e) => e.id === projectId);
      return res.json({ diagram, project: sanitizeProject(updated, req.auth.user) });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.patch('/api/projects/projects/:projectId/diagrams/:diagramId', authMiddleware, loadProjectForUser, requireProjectEditor, async (req, res) => {
    try {
      const projectId = req.params.projectId;
      const diagramId = req.params.diagramId;
      let diagram;
      await updateStore(async (store) => {
        const project = store.projects.find((e) => e.id === projectId);
        if (!project) throw new Error('Projeto não encontrado.');
        normalizeProjectDiagramFields(project);
        diagram = updateDiagramArtifact(
          project,
          diagramId,
          req.body || {},
          req.auth.user.id,
          { createVersion: Boolean(req.body?.createVersion) },
        );
        project.updatedAt = nowIso();
        appendActivity(store, {
          actorUserId: req.auth.user.id,
          projectId,
          action: 'diagram_updated',
          details: { diagramId, version: diagram.version },
        });
      });
      return res.json({ diagram });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.post('/api/projects/projects/:projectId/diagrams/:diagramId/validate', authMiddleware, loadProjectForUser, async (req, res) => {
    try {
      const projectId = req.params.projectId;
      const diagramId = req.params.diagramId;
      let result;
      await updateStore(async (store) => {
        const project = store.projects.find((e) => e.id === projectId);
        if (!project) throw new Error('Projeto não encontrado.');
        const diagram = findDiagram(project, diagramId);
        if (req.body?.sourceText !== undefined) diagram.sourceText = textOr(req.body.sourceText);
        if (req.body?.notation !== undefined) diagram.notation = textOr(req.body.notation);
        result = applyValidationToDiagram(project, diagram);
      });
      return res.json(result);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.post('/api/projects/projects/:projectId/diagrams/:diagramId/render', authMiddleware, loadProjectForUser, (req, res) => {
    try {
      const diagram = findDiagram(req.loadedProject, req.params.diagramId);
      const notation = textOr(req.body?.notation, diagram.notation);
      const sourceText = req.body?.sourceText !== undefined ? textOr(req.body.sourceText) : diagram.sourceText;
      const rendered = renderDiagram({ notation, sourceText });
      return res.json(rendered);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.post('/api/projects/projects/:projectId/diagrams/:diagramId/approve', authMiddleware, loadProjectForUser, requireProjectEditor, async (req, res) => {
    try {
      const projectId = req.params.projectId;
      let diagram;
      await updateStore(async (store) => {
        const project = store.projects.find((e) => e.id === projectId);
        if (!project) throw new Error('Projeto não encontrado.');
        diagram = approveDiagram(project, req.params.diagramId, req.auth.user.id, req.body?.comments);
        project.updatedAt = nowIso();
        appendActivity(store, { actorUserId: req.auth.user.id, projectId, action: 'diagram_approved', details: { diagramId: diagram.id } });
      });
      return res.json({ diagram });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.post('/api/projects/projects/:projectId/diagrams/:diagramId/reject', authMiddleware, loadProjectForUser, requireProjectEditor, async (req, res) => {
    try {
      const projectId = req.params.projectId;
      let diagram;
      await updateStore(async (store) => {
        const project = store.projects.find((e) => e.id === projectId);
        if (!project) throw new Error('Projeto não encontrado.');
        diagram = rejectDiagram(project, req.params.diagramId, req.auth.user.id, req.body?.comments);
        project.updatedAt = nowIso();
        appendActivity(store, { actorUserId: req.auth.user.id, projectId, action: 'diagram_rejected', details: { diagramId: diagram.id } });
      });
      return res.json({ diagram });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.post('/api/projects/projects/:projectId/diagrams/:diagramId/versions', authMiddleware, loadProjectForUser, requireProjectEditor, async (req, res) => {
    try {
      const projectId = req.params.projectId;
      let version;
      await updateStore(async (store) => {
        const project = store.projects.find((e) => e.id === projectId);
        if (!project) throw new Error('Projeto não encontrado.');
        const diagram = findDiagram(project, req.params.diagramId);
        diagram.version += 1;
        version = createDiagramVersion(project, diagram, req.auth.user.id, textOr(req.body?.changeSummary, 'Nova versão'));
        diagram.updatedAt = nowIso();
      });
      return res.status(201).json({ version });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.get('/api/projects/projects/:projectId/diagrams/:diagramId/versions/compare', authMiddleware, loadProjectForUser, (req, res) => {
    try {
      const diff = compareDiagramVersions(
        req.loadedProject,
        req.params.diagramId,
        req.query.from,
        req.query.to,
      );
      return res.json(diff);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.post('/api/projects/projects/:projectId/diagrams/:diagramId/rollback', authMiddleware, loadProjectForUser, requireProjectEditor, async (req, res) => {
    try {
      const projectId = req.params.projectId;
      let diagram;
      await updateStore(async (store) => {
        const project = store.projects.find((e) => e.id === projectId);
        if (!project) throw new Error('Projeto não encontrado.');
        diagram = rollbackDiagramVersion(project, req.params.diagramId, req.body?.version, req.auth.user.id);
      });
      return res.json({ diagram });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.post('/api/projects/projects/:projectId/diagrams/generate', authMiddleware, loadProjectForUser, requireProjectEditor, async (req, res) => {
    try {
      const projectId = req.params.projectId;
      const body = req.body || {};
      const diagramType = textOr(body.diagramType, 'sequence');
      if (!registry.isSupportedDiagramType(diagramType)) {
        return res.status(400).json({ message: `Tipo não suportado: ${diagramType}` });
      }
      let job;
      await updateStore(async (store) => {
        const project = store.projects.find((e) => e.id === projectId);
        if (!project) throw new Error('Projeto não encontrado.');
        normalizeProjectDiagramFields(project);
        const contextPack = buildMinimalContextPack(project, {
          diagramType,
          phase: ARCHITECTURE_PHASE,
          module: body.module,
          submodule: body.submodule,
          requirementIds: normalizeStringArray(body.requirementIds),
          dependencyDiagramIds: normalizeStringArray(body.dependencyDiagramIds),
        });
        const promptUsed = buildDiagramGenerationPrompt(contextPack);
        job = normalizeDiagramGenerationJob({
          projectId,
          requestedDiagramType: diagramType,
          inputContext: contextPack,
          promptUsed,
          status: 'awaiting_output',
          createdBy: req.auth.user.id,
          diagramArtifactId: textOr(body.diagramArtifactId) || null,
        });
        project.diagramGenerationJobs = ensureArray(project.diagramGenerationJobs);
        project.diagramGenerationJobs.unshift(job);
        project.updatedAt = nowIso();
      });
      return res.status(201).json({ job, prompt: job.promptUsed, contextPack: job.inputContext });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.post('/api/projects/projects/:projectId/diagrams/jobs/:jobId/import', authMiddleware, loadProjectForUser, requireProjectEditor, async (req, res) => {
    try {
      const projectId = req.params.projectId;
      const jobId = req.params.jobId;
      let diagram;
      let job;
      await updateStore(async (store) => {
        const project = store.projects.find((e) => e.id === projectId);
        if (!project) throw new Error('Projeto não encontrado.');
        normalizeProjectDiagramFields(project);
        job = ensureArray(project.diagramGenerationJobs).find((j) => j.id === jobId);
        if (!job) throw new Error('Job de geração não encontrado.');
        let parsed;
        try {
          parsed = typeof req.body?.modelOutput === 'object'
            ? req.body.modelOutput
            : parseAgentJsonOutput(req.body?.modelOutput || req.body?.rawOutput || '');
        } catch (error) {
          job.status = 'failed';
          job.errors = [{ message: `JSON inválido: ${error.message}` }];
          throw new Error(`JSON inválido: ${error.message}`);
        }
        diagram = createDiagramFromAiOutput(project, parsed, req.auth.user.id, job);
        job.modelOutput = parsed;
        job.status = 'completed';
        job.diagramArtifactId = diagram.id;
        job.updatedAt = nowIso();
        project.updatedAt = nowIso();
        appendActivity(store, {
          actorUserId: req.auth.user.id,
          projectId,
          action: 'diagram_ai_imported',
          details: { diagramId: diagram.id, jobId: job.id },
        });
      });
      return res.json({ diagram, job });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });
}

module.exports = {
  ARCHITECTURE_PHASE,
  DIAGRAM_STATUSES,
  normalizeDiagramArtifact,
  normalizeDiagramVersion,
  normalizeDiagramReview,
  normalizeDiagramGenerationJob,
  normalizeProjectDiagramFields,
  createDiagramArtifact,
  createDiagramArtifactsFromLegacyPack,
  createDiagramFromAiOutput,
  filterDiagrams,
  findDiagram,
  applyValidationToDiagram,
  validateAiDiagramOutput,
  approveDiagram,
  rejectDiagram,
  registerDiagramRoutes,
  compareDiagramVersions,
  listDiagramVersions,
  listDiagramReviews,
  renderDiagram,
  linkRequirementsToDiagram: traceability.linkRequirementsToDiagram,
  syncRequirementDiagramIds: traceability.syncRequirementDiagramIds,
};
