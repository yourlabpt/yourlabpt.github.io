/** Versioned stage-transition delegations backed exclusively by canonical Tasks. */
const crypto = require('crypto');
const executionPlans = require('./execution-plans');
const agentRequests = require('./agent-requests');
const workItems = require('./work-items');

function ensureArray(value) { return Array.isArray(value) ? value : []; }
function textOr(value, fallback = '') { const v = value == null ? '' : String(value).trim(); return v || fallback; }
function hash(value) { return crypto.createHash('sha256').update(String(value || '')).digest('hex'); }
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.keys(value).sort().reduce((out, key) => { out[key] = stable(value[key]); return out; }, {});
  return value;
}
function fingerprint(value) { return hash(JSON.stringify(stable(value))); }
function transitionKey(fromStageId, toStageId, direction = 'forward') { return `${textOr(fromStageId)}->${textOr(toStageId)}:${textOr(direction, 'forward')}`; }

const SKILLS_BY_STAGE = {
  idea: ['product_discovery'], discovery: ['research', 'product_discovery'], requirements: ['requirements_engineering'],
  architecture: ['solution_architecture'], roadmap: ['delivery_planning'], implementation: ['software_delivery'],
  validation: ['quality_assurance'], delivery: ['release_management'], operations: ['operations'],
};
const TOOLS_BY_STAGE = {
  discovery: ['project.read', 'web.search'], requirements: ['project.read', 'requirements.read'],
  architecture: ['project.read', 'requirements.read', 'documents.read'], roadmap: ['project.read', 'requirements.read'],
  implementation: ['project.read', 'requirements.read', 'documents.read'], validation: ['project.read', 'requirements.read'],
  delivery: ['project.read', 'documents.read'], operations: ['project.read', 'documents.read'],
};

function defaultConfig(input = {}) {
  return {
    userRequest: textOr(input.userRequest), desiredOutcome: textOr(input.desiredOutcome),
    modelProfileId: textOr(input.modelProfileId, 'medium'),
    targetInputTokens: Math.max(1000, Number(input.targetInputTokens) || 14000),
    targetOutputTokens: Math.max(500, Number(input.targetOutputTokens) || 2500),
    maxTokens: Math.max(10000, Number(input.maxTokens) || 120000),
    maxWallClockMinutes: Math.max(5, Number(input.maxWallClockMinutes) || 45),
    maxSubtasks: Math.min(24, Math.max(2, Number(input.maxSubtasks) || 8)),
    enableWebSearch: input.enableWebSearch === true,
    allowedMcpTools: [...new Set(ensureArray(input.allowedMcpTools).map(String).filter(Boolean))],
    preferredAgentId: textOr(input.preferredAgentId),
  };
}
function getConfigs(project) { return ensureArray(project?.stageTransitionConfigs); }
function getConfig(project, fromStageId, toStageId, direction) {
  const key = transitionKey(fromStageId, toStageId, direction);
  return getConfigs(project).find((entry) => entry.key === key) || null;
}
function saveConfig(project, input, actorUserId, nowIso = () => new Date().toISOString()) {
  const key = transitionKey(input.fromStageId, input.toStageId, input.direction);
  const values = defaultConfig(input.config || input);
  const previous = getConfigs(project).find((entry) => entry.key === key);
  const valueFingerprint = fingerprint(values);
  const record = {
    key, fromStageId: textOr(input.fromStageId), toStageId: textOr(input.toStageId), direction: textOr(input.direction, 'forward'),
    version: previous?.fingerprint === valueFingerprint ? previous.version : Math.max(0, Number(previous?.version) || 0) + 1,
    values, fingerprint: valueFingerprint, updatedAt: nowIso(), updatedBy: actorUserId,
  };
  project.stageTransitionConfigs = [record, ...getConfigs(project).filter((entry) => entry.key !== key)].slice(0, 100);
  return record;
}

function contextSnapshot(project, fromStageId, toStageId) {
  const common = { id: project.id, name: project.name, updatedAt: project.updatedAt };
  const source = {
    idea: { originalIdeaText: project.originalIdeaText, vision: project.vision, ideaBriefMarkdown: project.ideaBriefMarkdown },
    discovery: { discovery: project.discovery, businessObjectives: project.businessObjectives, stakeholders: project.stakeholders },
    requirements: { requirements: ensureArray(project.requirements).map((row) => ({ id: row.id, type: row.type, title: row.title, shall: row.shall, status: row.status, updatedAt: row.updatedAt, phase: row.implementationPhase || row.phase })) },
    architecture: { diagrams: project.diagramArtifacts, capabilities: project.capabilities, technicalApproach: project.technicalApproach },
    roadmap: { roadmap: project.roadmap, phases: project.phases }, implementation: { implementation: project.implementation },
    validation: { validation: project.validation, testCases: ensureArray(project.requirements).filter((row) => row.type === 'test_case') },
    delivery: { documents: ensureArray(project.documents).map((row) => ({ id: row.id, title: row.title, stageId: row.deliveryStageId, updatedAt: row.updatedAt })) },
    operations: { operations: project.operations },
  };
  return stable({ project: common, from: source[fromStageId] || {}, to: source[toStageId] || {} });
}

function promptDiff(previous, current) {
  const before = String(previous || '').split('\n'); const after = String(current || '').split('\n');
  if (previous === current) return '';
  const beforeSet = new Set(before); const afterSet = new Set(after); const lines = [];
  before.filter((line) => !afterSet.has(line)).slice(0, 30).forEach((line) => lines.push(`- ${line}`));
  after.filter((line) => !beforeSet.has(line)).slice(0, 30).forEach((line) => lines.push(`+ ${line}`));
  return lines.join('\n').slice(0, 12000);
}
function baselineFor(project, key) {
  const backedRequestIds = new Set(
    workItems.getWorkItems(project).map((task) => task.agentRequestId).filter(Boolean)
  );
  const requests = agentRequests.getAgentRequests(project)
    .filter((request) => (
      request.requestKind === 'stage_transition'
      && request.transitionKey === key
      && backedRequestIds.has(request.id)
    ));
  return requests.find((request) => request.status !== 'superseded')
    || requests[0]
    || null;
}
function groupTasks(tasks, maximum) {
  if (tasks.length <= maximum) return tasks;
  const merge = tasks.find((task) => task.role === 'merge');
  const source = tasks.filter((task) => task.role !== 'merge');
  const slots = Math.max(1, maximum - (merge ? 1 : 0));
  const groups = Array.from({ length: slots }, () => []);
  source.forEach((task, index) => groups[Math.min(slots - 1, Math.floor(index * slots / source.length))].push(task));
  const grouped = groups.filter(Boolean).map((rows, index) => ({
    id: `group_${index + 1}`, stableTaskKey: `group:${rows.map((row) => row.id).join('+')}`,
    title: rows.length === 1 ? rows[0].title : `${rows[0].title} + ${rows.length - 1} unidade(s) relacionada(s)`,
    role: rows.length === 1 ? rows[0].role : 'artifact', order: index,
    instruction: rows.map((row) => `## ${row.title}\n${row.instruction}`).join('\n\n'),
    outputSchema: rows.map((row) => row.outputSchema).filter(Boolean).join('\n'),
    dependsOn: index ? [`group_${index}`] : [], requirementIds: [...new Set(rows.flatMap((row) => ensureArray(row.requirementIds)))],
  }));
  if (merge) grouped.push({ ...merge, order: grouped.length, dependsOn: grouped.map((task) => task.id), stableTaskKey: merge.id });
  return grouped;
}
function ensureMeaningfulMinimum(tasks) {
  if (tasks.length >= 2) return tasks;
  const source = tasks[0] || { id: 'produce', title: 'Produzir resultado', instruction: 'Produzir o resultado pedido.', role: 'artifact' };
  return [
    { id: 'analyse', stableTaskKey: 'analyse', title: 'Analisar contexto e mudanças', role: 'analysis', instruction: `Analise o contexto e identifique decisões, lacunas e impacto antes de produzir o resultado.\n\n${source.instruction}`, dependsOn: [] },
    { ...source, id: source.id === 'analyse' ? 'produce' : source.id, stableTaskKey: source.id === 'analyse' ? 'produce' : source.id, dependsOn: ['analyse'] },
  ];
}
function buildPreview(project, input = {}, deps = {}) {
  const fromStageId = textOr(input.fromStageId); const toStageId = textOr(input.toStageId); const direction = textOr(input.direction, 'forward');
  if (!fromStageId || !toStageId) throw new Error('As etapas de origem e destino sao obrigatorias.');
  const key = transitionKey(fromStageId, toStageId, direction);
  const saved = getConfig(project, fromStageId, toStageId, direction);
  const config = defaultConfig({ ...(saved?.values || {}), ...(input.config || {}) });
  const plan = executionPlans.buildExecutionPlan('stage_transition', project, { ...config, fromStageId, toStageId, direction, stageId: toStageId }, { deliveryOs: deps.deliveryOs });
  let tasks = ensureMeaningfulMinimum(ensureArray(plan.tasks).map((task, index) => ({ ...task, stableTaskKey: textOr(task.stableTaskKey || task.id, `task_${index + 1}`) })));
  tasks = groupTasks(tasks, config.maxSubtasks);
  const snapshot = contextSnapshot(project, fromStageId, toStageId); const inputFingerprint = fingerprint(snapshot); const configFingerprint = fingerprint(config);
  const baseline = baselineFor(project, key); const previousTasks = baseline ? workItems.getWorkItems(project).filter((task) => task.agentRequestId === baseline.id && task.taskRole !== 'coordination') : [];
  const previousByKey = new Map(previousTasks.map((task) => [task.stableTaskKey || task.executionPlanTaskId, task]));
  tasks = tasks.map((task) => {
    const previous = previousByKey.get(task.stableTaskKey); const currentFingerprint = hash(task.instruction);
    return { ...task, requiredSkills: [...new Set([...(SKILLS_BY_STAGE[toStageId] || []), ...(SKILLS_BY_STAGE[fromStageId] || [])])], requiredMcpTools: [...new Set([...(TOOLS_BY_STAGE[toStageId] || []), ...(config.enableWebSearch ? ['web.search'] : [])])], previousTaskId: previous?.id || '', previousFingerprint: previous?.executionPackage?.fingerprint || '', promptFingerprint: currentFingerprint, promptDiff: promptDiff(previous?.executionPackage?.instructions, task.instruction), changeType: !previous ? 'new' : previous.executionPackage?.fingerprint === currentFingerprint ? 'unchanged' : 'changed' };
  });
  const removed = previousTasks.filter((previous) => !tasks.some((task) => task.stableTaskKey === previous.stableTaskKey)).map((task) => ({ id: task.id, stableTaskKey: task.stableTaskKey, title: task.title, changeType: 'removed' }));
  const changedContext = !baseline || baseline.inputFingerprint !== inputFingerprint; const changedConfig = !baseline || baseline.configFingerprint !== configFingerprint;
  const mode = input.regenerationMode === 'affected' ? 'affected' : 'full';
  if (mode === 'affected' && baseline && !changedContext && !changedConfig && !tasks.some((task) => task.changeType !== 'unchanged')) throw new Error('Nao existem alteracoes relevantes. Escolha regeneracao completa se pretende repetir o pedido.');
  if (mode === 'affected' && baseline) {
    const affectedKeys = new Set(tasks.filter((task) => task.changeType !== 'unchanged').map((task) => task.stableTaskKey));
    tasks = tasks.filter((task) => affectedKeys.has(task.stableTaskKey) || task.role === 'merge');
    if (!tasks.length) throw new Error('Nao existem tarefas afectadas para regenerar.');
  }
  const requestPrompt = textOr(config.userRequest, `Transicao ${fromStageId} para ${toStageId}.`);
  return { key, fromStageId, toStageId, direction, config, configFingerprint, inputSnapshot: snapshot, inputFingerprint, baselineRequest: baseline, requestPrompt, requestPromptDiff: promptDiff(baseline?.requestMarkdown, requestPrompt), plan: { ...plan, tasks }, tasks, removed, regenerationMode: mode, diffSummary: { changedContext, changedConfig, newTasks: tasks.filter((task) => task.changeType === 'new').length, changedTasks: tasks.filter((task) => task.changeType === 'changed').length, unchangedTasks: tasks.filter((task) => task.changeType === 'unchanged').length, removedTasks: removed.length } };
}

function supersedeRequest(project, previous, nextRequestId, actorUserId, nowIso) {
  if (!previous || ['completed', 'cancelled', 'superseded'].includes(previous.status)) return;
  const requests = agentRequests.getAgentRequests(project); const target = requests.find((entry) => entry.id === previous.id);
  if (target) { target.status = 'superseded'; target.supersededByRequestId = nextRequestId; target.updatedAt = nowIso(); }
  project.agentRequests = requests;
  const tasks = workItems.getWorkItems(project).map((task) => task.agentRequestId === previous.id && !workItems.isTerminalStatus(task.status)
    ? workItems.normalizeWorkItem({ ...task, status: 'cancelled', currentAction: 'Substituida por um novo pedido.', updatedAt: nowIso(), updatedBy: actorUserId }, { project }) : task);
  workItems.setWorkItems(project, tasks);
}
function createRequest(project, input, options = {}) {
  const preview = buildPreview(project, input, options);
  const nowIso = options.nowIso || (() => new Date().toISOString()); const actorUserId = textOr(options.actorUserId, 'system');
  const configRecord = saveConfig(project, { ...input, config: preview.config }, actorUserId, nowIso);
  const delegation = agentRequests.createAgentRequest(project, {
    title: textOr(preview.config.userRequest, `Transicao ${preview.fromStageId} -> ${preview.toStageId}`),
    requestMarkdown: preview.requestPrompt, desiredOutcomeMarkdown: textOr(preview.config.desiredOutcome, `Produzir artefactos para ${preview.toStageId}.`),
    agentType: 'stage_transition', agentId: preview.config.preferredAgentId || 'auto', deliveryStageId: preview.toStageId,
    createCoordinationParent: true, tasks: preview.tasks.map((task) => ({ ...task, expectedOutput: task.outputSchema || `Resultado verificavel de ${task.title}`, reviewRequired: true })),
    executionSettings: preview.config, options: preview.config, budget: preview.config,
    requestKind: 'stage_transition', transitionKey: preview.key, transitionConfigVersion: configRecord.version,
    configSnapshot: preview.config, configFingerprint: preview.configFingerprint, inputSnapshot: preview.inputSnapshot, inputFingerprint: preview.inputFingerprint,
    baselineRequestId: preview.baselineRequest?.id, regenerationMode: preview.regenerationMode, diffSummary: { ...preview.diffSummary, requestPromptDiff: preview.requestPromptDiff },
    supersedesRequestId: preview.baselineRequest?.id, idempotencyKey: textOr(input.idempotencyKey, `transition:${preview.key}:${crypto.randomUUID()}`),
    contextMarkdown: `Contexto do projecto ${project.name}; snapshot ${preview.inputFingerprint.slice(0, 12)}.`,
  }, { actorUserId, nowIso });
  if (delegation.created && preview.baselineRequest) supersedeRequest(project, preview.baselineRequest, delegation.request.id, actorUserId, nowIso);
  return { ...delegation, preview, config: configRecord };
}

function childTasks(project, parent) { return workItems.getWorkItems(project).filter((task) => task.parentTaskId === parent.id); }
function buildTreePackage(project, parent) {
  const request = agentRequests.getAgentRequests(project).find((entry) => entry.id === parent.agentRequestId); const children = childTasks(project, parent);
  const envelope = { requestId: request?.id, requestVersion: request?.version || 1, taskOutputs: children.filter((task) => !workItems.isTerminalStatus(task.status)).map((task) => ({ taskId: task.id, packageVersion: task.executionPackage?.version || 1, output: {} })) };
  const text = [`# ${parent.title}`, `\n## Pedido\n${request?.requestMarkdown || parent.descriptionMarkdown}`, `\n## Resultado esperado\n${request?.desiredOutcomeMarkdown || parent.acceptanceCriteriaMarkdown}`, '\n## Subtarefas', ...children.map((task, index) => `\n### ${index + 1}. ${task.title}\nTask ID: ${task.id}\nPackage version: ${task.executionPackage?.version || 1}\n${task.executionPackage?.instructions || task.descriptionMarkdown}\nFormato: ${task.executionPackage?.outputFormat || 'JSON'}`), '\n## Formato obrigatorio da resposta', JSON.stringify(envelope, null, 2)].join('\n');
  return { request, children, text, envelope, contextSnapshotHash: request?.inputFingerprint || '' };
}
function validateBundle(project, parent, rawOutput) {
  let parsed; try { parsed = typeof rawOutput === 'string' ? JSON.parse(rawOutput) : rawOutput; } catch { throw new Error('O pacote deve ser JSON valido.'); }
  const pack = buildTreePackage(project, parent); if (parsed?.requestId !== pack.request?.id) throw new Error('O resultado pertence a outro pedido.');
  if (Number(parsed?.requestVersion) !== Number(pack.request?.version || 1)) throw new Error('A versao do pedido nao corresponde.');
  const outputs = ensureArray(parsed?.taskOutputs); const byId = new Map();
  outputs.forEach((row) => { if (!row?.taskId || byId.has(row.taskId)) throw new Error('Existem taskIds vazios ou duplicados.'); byId.set(row.taskId, row); });
  const open = pack.children.filter((task) => !workItems.isTerminalStatus(task.status));
  open.forEach((task) => { const row = byId.get(task.id); if (!row) throw new Error(`Falta o resultado da tarefa ${task.title}.`); if (Number(row.packageVersion) !== Number(task.executionPackage?.version || 1)) throw new Error(`O resultado de ${task.title} usa uma versao antiga do prompt.`); if (row.output === undefined || row.output === null || row.output === '') throw new Error(`O resultado de ${task.title} esta vazio.`); });
  outputs.forEach((row) => { if (!open.some((task) => task.id === row.taskId)) throw new Error(`Tarefa desconhecida ou fechada no pacote: ${row.taskId}.`); });
  return { parsed, outputs, tasks: open, request: pack.request };
}

function migrateStageTransitionRequests(project, options = {}) {
  if (!project || typeof project !== 'object') return { changed: false };
  const before = fingerprint({ configs: project.stageTransitionConfigs, requests: project.agentRequests, tasks: project.workItems });
  const plans = ensureArray(project.executionPlans).filter((plan) => plan?.agentType === 'stage_transition');
  const requests = agentRequests.getAgentRequests(project); let tasks = workItems.getWorkItems(project);
  plans.forEach((plan) => {
    const key = transitionKey(plan.fromStageId, plan.toStageId, plan.direction);
    if (!getConfig(project, plan.fromStageId, plan.toStageId, plan.direction)) {
      saveConfig(project, { fromStageId: plan.fromStageId, toStageId: plan.toStageId, direction: plan.direction, config: { ...(plan.config || {}), modelProfileId: plan.modelProfileId, targetInputTokens: plan.targetInputTokens, targetOutputTokens: plan.targetOutputTokens } }, 'migration', options.nowIso || (() => new Date().toISOString()));
    }
    const request = requests.find((entry) => entry.executionPlanId === plan.id); if (!request) return;
    request.requestKind = 'stage_transition'; request.transitionKey = key;
    request.configSnapshot = Object.keys(request.configSnapshot || {}).length ? request.configSnapshot : defaultConfig(plan.config || {});
    request.configFingerprint = request.configFingerprint || fingerprint(request.configSnapshot);
    request.inputSnapshot = Object.keys(request.inputSnapshot || {}).length ? request.inputSnapshot : contextSnapshot(project, plan.fromStageId, plan.toStageId);
    request.inputFingerprint = request.inputFingerprint || fingerprint(request.inputSnapshot);
    const requestTasks = tasks.filter((task) => task.agentRequestId === request.id);
    let parent = requestTasks.find((task) => task.taskRole === 'coordination');
    if (!parent && !['completed', 'cancelled', 'superseded'].includes(request.status) && requestTasks.length) {
      const parentId = `witem_coord_${hash(request.id).slice(0, 20)}`;
      const candidate = workItems.normalizeWorkItem({ id: parentId, origin: 'agent', executorMode: 'agent', taskRole: 'coordination', stableTaskKey: `request:${request.id}`, title: request.title, descriptionMarkdown: request.requestMarkdown || 'Coordenar pedido histórico.', acceptanceCriteriaMarkdown: request.desiredOutcomeMarkdown || 'Todas as subtarefas foram revistas.', complexity: 'medium', priority: 'medium', deliveryStageId: request.deliveryStageId, agentId: request.agentId, agentType: request.agentType, agentRequestId: request.id, executionSettings: request.configSnapshot, executionPackage: { version: 1, objective: request.title, instructions: request.requestMarkdown, outputFormat: 'JSON taskOutputs[]', createdBy: 'migration', fingerprint: hash(request.requestMarkdown) }, createdBy: 'migration', updatedBy: 'migration' }, { project });
      if (workItems.isWorkItemTombstoned(project, candidate)) return;
      parent = candidate;
      tasks = [parent, ...tasks.map((task) => task.agentRequestId === request.id ? workItems.normalizeWorkItem({ ...task, parentTaskId: parentId, taskRole: 'execution', stableTaskKey: task.stableTaskKey || task.executionPlanTaskId || task.id }, { project }) : task)];
      request.parentTaskId = parentId; request.taskIds = [parentId, ...request.taskIds.filter((id) => id !== parentId)];
    }
  });
  project.agentRequests = requests; workItems.setWorkItems(project, tasks); project.stageTransitionConfigsSchemaVersion = 1;
  return { changed: before !== fingerprint({ configs: project.stageTransitionConfigs, requests: project.agentRequests, tasks: project.workItems }) };
}

module.exports = { transitionKey, defaultConfig, getConfigs, getConfig, saveConfig, contextSnapshot, buildPreview, createRequest, buildTreePackage, validateBundle, migrateStageTransitionRequests, fingerprint, promptDiff };
