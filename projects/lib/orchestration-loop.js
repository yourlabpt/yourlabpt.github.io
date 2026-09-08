/**
 * The chain: personas run one after another without waiting for a phase to end.
 *
 * This module decides *what happens next* and nothing else. It performs no dispatch,
 * writes no store, and calls no provider — so the rule that actually governs spend and
 * safety is a pure function that can be tested exhaustively. The caller applies the
 * decision.
 *
 * The chain stops for exactly three things:
 *   - a question to a human (mockup acceptance, code review before commit)
 *   - the project budget running out
 *   - the same failure repeating, which means more retries will not help
 */
const agentPersonas = require('./agent-personas');
const projectBudget = require('./project-budget');
const workItems = require('./work-items');

const TERMINAL_STATUSES = new Set(['halted', 'completed']);
const REPEAT_LIMIT = 3;

function text(value, fallback = '') {
  const result = value === null || value === undefined ? '' : String(value).trim();
  return result || fallback;
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeOrchestration(raw = {}) {
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    status: text(src.status, 'idle'),
    startedAt: text(src.startedAt),
    updatedAt: text(src.updatedAt),
    // The persona currently dispatched, if any.
    currentPersonaId: text(src.currentPersonaId),
    currentWorkItemId: text(src.currentWorkItemId),
    question: src.question && typeof src.question === 'object' ? {
      personaId: text(src.question.personaId),
      kind: text(src.question.kind, 'review'),
      text: text(src.question.text),
      raisedAt: text(src.question.raisedAt),
    } : null,
    haltReason: text(src.haltReason),
    // One entry per finished persona run: what it decided and what it cost.
    history: ensureArray(src.history).map((entry) => ({
      personaId: text(entry?.personaId),
      workItemId: text(entry?.workItemId),
      outcome: text(entry?.outcome, 'completed'),
      summary: text(entry?.summary),
      failureSignature: text(entry?.failureSignature),
      costUsd: Number(entry?.costUsd) || 0,
      seconds: Number(entry?.seconds) || 0,
      at: text(entry?.at),
    })),
  };
}

/**
 * A failure repeating with the same signature means the input is wrong, not the
 * attempt — re-cutting it again will produce the same result.
 */
function repeatedFailure(history) {
  const failures = history.filter((entry) => entry.outcome === 'failed' && entry.failureSignature);
  if (failures.length < REPEAT_LIMIT) return null;
  const recent = failures.slice(-REPEAT_LIMIT);
  const signature = recent[0].failureSignature;
  const personaId = recent[0].personaId;
  const identical = recent.every((entry) => (
    entry.failureSignature === signature && entry.personaId === personaId
  ));
  return identical ? { personaId, signature, count: recent.length } : null;
}

/** Personas that completed at least once, by id. */
function completedPersonaIds(history) {
  return new Set(history.filter((entry) => entry.outcome === 'completed').map((entry) => entry.personaId));
}

/**
 * Implementation units the Tech Lead produced that still need a developer or tester.
 * These are ordinary work items carrying a module scope.
 */
function pendingUnitsFor(project, persona) {
  const wanted = new Set(persona.taskTypes);
  return workItems.getWorkItems(project).filter((item) => (
    wanted.has(text(item.agentType))
    && !workItems.isTerminalStatus(text(item.status))
    && text(item.status) !== 'waiting_review'
  ));
}

/**
 * Decides the next move for a project's chain.
 *
 * Returns one of:
 *   { action: 'idle' }                    the chain was never started
 *   { action: 'wait_human', question }     a standing question is open
 *   { action: 'paused_budget', budget }    money or hours exhausted
 *   { action: 'halt', reason }             the same failure keeps repeating
 *   { action: 'dispatch', persona, ... }   run this persona next
 *   { action: 'complete' }                 every persona has run
 */
function decideNext(project, options = {}) {
  const now = options.now ?? Date.now();
  const orchestration = normalizeOrchestration(project?.orchestration);
  const overrides = options.personaOverrides || {};
  const personas = agentPersonas.listPersonas(overrides).filter((persona) => persona.enabled);

  if (orchestration.status === 'idle') return { action: 'idle', orchestration };
  if (TERMINAL_STATUSES.has(orchestration.status)) {
    return { action: orchestration.status === 'halted' ? 'halt' : 'complete', orchestration, reason: orchestration.haltReason };
  }

  // A question outranks everything: while one is open the chain must not spend.
  if (orchestration.question) {
    return { action: 'wait_human', question: orchestration.question, orchestration };
  }

  const budget = projectBudget.budgetState(project?.budget, now);
  if (budget.exhausted) {
    return { action: 'paused_budget', budget, orchestration };
  }

  const repeated = repeatedFailure(orchestration.history);
  if (repeated) {
    return {
      action: 'halt',
      orchestration,
      reason: `A mesma falha repetiu-se ${repeated.count}x em ${repeated.personaId}. E preciso uma decisao humana antes de continuar.`,
      repeated,
    };
  }

  // Something is already in flight; nothing to decide until it reports back.
  if (orchestration.currentPersonaId) {
    return { action: 'running', orchestration, personaId: orchestration.currentPersonaId };
  }

  const completed = completedPersonaIds(orchestration.history);
  for (const persona of personas) {
    // A persona whose result stops the chain has already been answered if it is in
    // `completed` — the answer is what cleared the question.
    if (persona.scopedToSingleModule) {
      const units = pendingUnitsFor(project, persona);
      if (units.length) {
        return {
          action: 'dispatch', persona, orchestration, budget,
          workItem: units[0],
          remainingUnits: units.length,
        };
      }
      // No units left for this persona — it is done for now.
      continue;
    }
    if (completed.has(persona.id)) continue;

    const missing = persona.requiresUpstream.filter((id) => !completed.has(id));
    if (missing.length) {
      return {
        action: 'blocked', orchestration, persona,
        reason: `${persona.label} depende de ${missing.join(', ')}, que ainda nao correu.`,
      };
    }
    return { action: 'dispatch', persona, orchestration, budget, workItem: null };
  }

  // Reaching the end with nothing to build is not success. If the Tech Lead ran and
  // produced no implementation units, the chain would otherwise report "complete"
  // having written no code at all.
  const implementer = personas.find((persona) => persona.id === 'developer');
  if (
    implementer
    && completed.has('tech_lead')
    && !orchestration.history.some((entry) => entry.personaId === 'developer')
    && !workItems.getWorkItems(project).some((item) => implementer.taskTypes.includes(text(item.agentType)))
  ) {
    return {
      action: 'halt',
      orchestration,
      reason: 'O Tech Lead terminou sem produzir nenhuma unidade de implementacao. Nada foi construido — reveja a decomposicao antes de continuar.',
    };
  }

  return { action: 'complete', orchestration };
}

/**
 * A stable signature for a failure, so the same problem recurring is recognisable.
 * Deliberately coarse: exact error text varies between runs, the shape does not.
 */
function failureSignature(personaId, message) {
  return `${text(personaId)}:${text(message).toLowerCase().replace(/[0-9]+/g, '#').slice(0, 160)}`;
}

/** The question raised when a persona's result needs a human before the chain moves on. */
function questionFor(persona, workItem) {
  const kind = persona.id === 'ux' ? 'mockup_acceptance' : 'result_review';
  const message = persona.id === 'ux'
    ? 'O mockup esta pronto. Aceita esta versao do frontend para dela derivarem os requisitos?'
    : `O resultado de ${persona.label} precisa de revisao antes de seguir.`;
  return {
    personaId: persona.id,
    kind,
    text: message,
    workItemId: text(workItem?.id),
    raisedAt: new Date().toISOString(),
  };
}

/* ---------------------------------------------------------------- transitions */
/*
 * State changes applied to a project. Each one banks or resumes the clock, because
 * the budget must never count time the chain was not actually working.
 */

function stamp(orchestration, now) {
  return { ...orchestration, updatedAt: new Date(now).toISOString() };
}

function startChain(project, caps = {}, now = Date.now()) {
  const orchestration = normalizeOrchestration(project.orchestration);
  const current = projectBudget.normalizeProjectBudget(project.budget);
  project.budget = projectBudget.startClock({
    ...current,
    maxCostUsd: caps.maxCostUsd !== undefined ? Number(caps.maxCostUsd) || 0 : current.maxCostUsd,
    maxHours: caps.maxHours !== undefined ? Number(caps.maxHours) || 0 : current.maxHours,
  }, now);
  project.orchestration = stamp({
    ...orchestration,
    status: 'running',
    startedAt: orchestration.startedAt || new Date(now).toISOString(),
    question: null,
    haltReason: '',
  }, now);
  return project.orchestration;
}

/** The chain is about to wait on a person — stop the clock so waiting is free. */
function raiseQuestion(project, question, now = Date.now()) {
  project.budget = projectBudget.stopClock(project.budget, now);
  project.orchestration = stamp({
    ...normalizeOrchestration(project.orchestration),
    status: 'waiting_human',
    currentPersonaId: '',
    currentWorkItemId: '',
    question,
  }, now);
  return project.orchestration;
}

function answerQuestion(project, { accepted = true } = {}, now = Date.now()) {
  const orchestration = normalizeOrchestration(project.orchestration);
  if (!orchestration.question) throw new Error('Nao ha nenhuma pergunta em aberto.');
  if (!accepted) {
    // Rejecting is not a halt: the persona runs again with the feedback.
    project.budget = projectBudget.startClock(project.budget, now);
    project.orchestration = stamp({
      ...orchestration,
      status: 'running',
      question: null,
      history: orchestration.history.filter((entry) => entry.personaId !== orchestration.question.personaId),
    }, now);
    return project.orchestration;
  }
  project.budget = projectBudget.startClock(project.budget, now);
  project.orchestration = stamp({ ...orchestration, status: 'running', question: null }, now);
  return project.orchestration;
}

function markDispatched(project, persona, workItem, now = Date.now()) {
  project.budget = projectBudget.startClock(project.budget, now);
  project.orchestration = stamp({
    ...normalizeOrchestration(project.orchestration),
    status: 'running',
    currentPersonaId: persona.id,
    currentWorkItemId: text(workItem?.id),
  }, now);
  return project.orchestration;
}

/**
 * Records what a persona did, and what it cost. Raises the standing question when the
 * persona's result is one a human must answer before the chain moves on.
 */
function recordResult(project, result = {}, now = Date.now()) {
  const orchestration = normalizeOrchestration(project.orchestration);
  const personaId = text(result.personaId, orchestration.currentPersonaId);
  const outcome = text(result.outcome, 'completed');
  project.budget = projectBudget.recordSpend(project.budget, result.costUsd);

  const entry = {
    personaId,
    workItemId: text(result.workItemId, orchestration.currentWorkItemId),
    outcome,
    summary: text(result.summary),
    failureSignature: outcome === 'failed'
      ? failureSignature(personaId, result.failureMessage || result.summary)
      : '',
    costUsd: Number(result.costUsd) || 0,
    seconds: Number(result.seconds) || 0,
    at: new Date(now).toISOString(),
  };

  project.orchestration = stamp({
    ...orchestration,
    currentPersonaId: '',
    currentWorkItemId: '',
    history: [...orchestration.history, entry],
  }, now);

  const persona = agentPersonas.resolvePersona(personaId, result.personaOverrides || {});
  if (outcome === 'completed' && persona?.requiresHumanApproval) {
    raiseQuestion(project, questionFor(persona, { id: entry.workItemId }), now);
  }
  return project.orchestration;
}

function haltChain(project, reason, now = Date.now()) {
  project.budget = projectBudget.stopClock(project.budget, now);
  project.orchestration = stamp({
    ...normalizeOrchestration(project.orchestration),
    status: 'halted',
    currentPersonaId: '',
    haltReason: text(reason),
  }, now);
  return project.orchestration;
}

function stopChain(project, status = 'idle', now = Date.now()) {
  project.budget = projectBudget.stopClock(project.budget, now);
  project.orchestration = stamp({
    ...normalizeOrchestration(project.orchestration),
    status,
    currentPersonaId: '',
    currentWorkItemId: '',
  }, now);
  return project.orchestration;
}

module.exports = {
  REPEAT_LIMIT,
  answerQuestion,
  decideNext,
  haltChain,
  markDispatched,
  raiseQuestion,
  recordResult,
  startChain,
  stopChain,
  failureSignature,
  normalizeOrchestration,
  pendingUnitsFor,
  questionFor,
  repeatedFailure,
};
