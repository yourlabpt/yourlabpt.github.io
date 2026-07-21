/** Dedicated idea-augment requests (first-run vision expansion, no discovery). */
const crypto = require('crypto');
const executionPlans = require('./execution-plans');
const agentRequests = require('./agent-requests');
const workItems = require('./work-items');

function ensureArray(value) { return Array.isArray(value) ? value : []; }
function textOr(value, fallback = '') { const v = value == null ? '' : String(value).trim(); return v || fallback; }

function assertCanAugment(project) {
  if (!textOr(project?.originalIdeaText)) {
    throw new Error('Descreva a ideia original antes de pedir expansão com IA.');
  }
}

function createRequest(project, input = {}, options = {}) {
  assertCanAugment(project);
  const nowIso = options.nowIso || (() => new Date().toISOString());
  const actorUserId = textOr(options.actorUserId, 'system');
  const plan = executionPlans.buildExecutionPlan('idea_augment', project, {
    modelProfileId: textOr(input.modelProfileId, 'medium'),
    maxTokens: Math.max(0, Number(input.maxTokens) || 0),
    maxWallClockMinutes: Math.max(0, Number(input.maxWallClockMinutes) || 0),
    enableWebSearch: false,
  }, { deliveryOs: options.deliveryOs });
  const task = ensureArray(plan.tasks)[0];
  if (!task) throw new Error('Não foi possível preparar a tarefa de expansão da ideia.');

  const requestMarkdown = textOr(
    input.userRequest,
    'Expandir a visão narrativa da ideia a partir da descrição original do utilizador.',
  );
  const desiredOutcomeMarkdown = textOr(
    input.desiredOutcome,
    'Visão da ideia (headline, narrativa, problema, utilizadores, valor, princípios) pronta para revisão.',
  );

  return agentRequests.createAgentRequest(project, {
    title: textOr(input.title, 'Expandir visão da ideia'),
    requestMarkdown,
    desiredOutcomeMarkdown,
    agentType: 'idea_augment',
    agentId: 'idea-augment',
    deliveryStageId: 'idea',
    createCoordinationParent: false,
    reviewRequired: true,
    targetOutput: 'idea_brief',
    tasks: [{
      ...task,
      stableTaskKey: 'idea_augment',
      expectedOutput: 'JSON idea_brief com vision completa',
      reviewRequired: true,
      agentId: 'idea-augment',
    }],
    executionSettings: {
      agentId: 'idea-augment',
      enableWebSearch: false,
      modelProfileId: textOr(input.modelProfileId, 'medium'),
      maxTokens: Math.max(0, Number(input.maxTokens) || 0),
      maxWallClockMinutes: Math.max(0, Number(input.maxWallClockMinutes) || 0),
    },
    idempotencyKey: textOr(input.idempotencyKey, `idea_augment:${project.id}:${crypto.randomUUID()}`),
    contextMarkdown: `Expansão da ideia do projecto ${project.name}.`,
  }, { actorUserId, nowIso });
}

module.exports = {
  assertCanAugment,
  createRequest,
};
