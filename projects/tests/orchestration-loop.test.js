const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const loop = require('../lib/orchestration-loop');
const budget = require('../lib/project-budget');
const workItems = require('../lib/work-items');

const HOUR = 3600 * 1000;

function project(over = {}) {
  const base = {
    id: 'prj_1',
    name: 'Reservas',
    workItems: [],
    orchestration: { status: 'running', history: [] },
    budget: { maxCostUsd: 10, maxHours: 4, spentUsd: 0, elapsedSeconds: 0 },
    ...over,
  };
  workItems.setWorkItems(base, workItems.getWorkItems(base));
  return base;
}

function done(personaId, extra = {}) {
  return { personaId, outcome: 'completed', at: new Date().toISOString(), ...extra };
}

describe('project budget', () => {
  it('counts nothing until the clock starts', () => {
    const state = budget.budgetState({ maxHours: 1 }, Date.now());
    assert.equal(state.elapsedSeconds, 0);
    assert.equal(state.running, false);
    assert.equal(state.exhausted, false);
  });

  it('accumulates only while running, and stops when paused', () => {
    const t0 = Date.now();
    const started = budget.startClock({ maxHours: 4 }, t0);
    assert.equal(budget.elapsedSeconds(started, t0 + HOUR), 3600);

    // Pausing banks the segment; time after that is free.
    const paused = budget.stopClock(started, t0 + HOUR);
    assert.equal(paused.elapsedSeconds, 3600);
    assert.equal(budget.elapsedSeconds(paused, t0 + 10 * HOUR), 3600,
      'waiting for a human must not consume the hour budget');
  });

  it('resumes without losing what was already banked', () => {
    const t0 = Date.now();
    const paused = budget.stopClock(budget.startClock({ maxHours: 4 }, t0), t0 + HOUR);
    const resumed = budget.startClock(paused, t0 + 5 * HOUR);
    assert.equal(budget.elapsedSeconds(resumed, t0 + 6 * HOUR), 7200);
  });

  it('starting an already-running clock does not double count', () => {
    const t0 = Date.now();
    const once = budget.startClock({ maxHours: 4 }, t0);
    const twice = budget.startClock(once, t0 + HOUR);
    assert.equal(budget.elapsedSeconds(twice, t0 + HOUR), 3600);
  });

  it('exhausts on money and names the reason', () => {
    const state = budget.budgetState({ maxCostUsd: 5, spentUsd: 5.01 });
    assert.equal(state.costExhausted, true);
    assert.equal(state.exhausted, true);
    assert.match(state.reason, /custo/);
  });

  it('exhausts on hours', () => {
    const t0 = Date.now();
    const running = budget.startClock({ maxHours: 1 }, t0);
    assert.equal(budget.budgetState(running, t0 + HOUR + 1000).timeExhausted, true);
  });

  it('treats a zero cap as unlimited', () => {
    const state = budget.budgetState({ maxCostUsd: 0, maxHours: 0, spentUsd: 9999, elapsedSeconds: 999999 });
    assert.equal(state.exhausted, false);
    assert.equal(state.remainingUsd, null);
  });

  it('accumulates spend across personas', () => {
    let value = budget.recordSpend({ maxCostUsd: 10 }, 1.25);
    value = budget.recordSpend(value, 2.5);
    assert.equal(value.spentUsd, 3.75);
  });
});

describe('chain sequencing', () => {
  it('does nothing until started', () => {
    assert.equal(loop.decideNext(project({ orchestration: { status: 'idle' } })).action, 'idle');
  });

  it('starts at the first persona', () => {
    const decision = loop.decideNext(project());
    assert.equal(decision.action, 'dispatch');
    assert.equal(decision.persona.id, 'product_owner');
  });

  it('advances to the next persona once the previous completed', () => {
    const decision = loop.decideNext(project({
      orchestration: { status: 'running', history: [done('product_owner')] },
    }));
    assert.equal(decision.action, 'dispatch');
    assert.equal(decision.persona.id, 'ux');
  });

  it('does not skip an upstream persona that has not run', () => {
    // module_architect requires product_owner.
    const decision = loop.decideNext(project({
      orchestration: { status: 'running', history: [done('ux')] },
    }));
    assert.equal(decision.action, 'dispatch');
    assert.equal(decision.persona.id, 'product_owner', 'must go back for the missing upstream');
  });

  it('waits while something is in flight', () => {
    const decision = loop.decideNext(project({
      orchestration: { status: 'running', currentPersonaId: 'ux', history: [done('product_owner')] },
    }));
    assert.equal(decision.action, 'running');
    assert.equal(decision.personaId, 'ux');
  });

  it('refuses to call it complete when the Tech Lead produced nothing to build', () => {
    // Silently succeeding without writing any code is the worst possible outcome:
    // it looks like a finished project.
    const decision = loop.decideNext(project({
      orchestration: {
        status: 'running',
        history: ['product_owner', 'ux', 'module_architect', 'orchestrator', 'tech_lead'].map((id) => done(id)),
      },
    }));
    assert.equal(decision.action, 'halt');
    assert.match(decision.reason, /nenhuma unidade de implementacao/);
  });

  it('completes once the implementation units are all finished', () => {
    const p = project({
      orchestration: {
        status: 'running',
        history: [
          ...['product_owner', 'ux', 'module_architect', 'orchestrator', 'tech_lead'].map((id) => done(id)),
          done('developer'),
        ],
      },
    });
    workItems.setWorkItems(p, [workItems.normalizeWorkItem({
      id: 'task_0', title: 'Unidade', status: 'completed',
      executorMode: 'agent', agentType: 'code_implementation',
    }, { project: p })]);
    assert.equal(loop.decideNext(p).action, 'complete');
  });

  it('skips a disabled persona rather than stalling', () => {
    const decision = loop.decideNext(
      project({ orchestration: { status: 'running', history: [done('product_owner')] } }),
      { personaOverrides: { ux: { enabled: false } } }
    );
    assert.equal(decision.persona.id, 'module_architect');
  });
});

describe('the chain stops only for a question, a budget, or a repeat', () => {
  it('stops while a question is open and reports it', () => {
    const decision = loop.decideNext(project({
      orchestration: {
        status: 'waiting_human',
        question: { personaId: 'ux', kind: 'mockup_acceptance', text: 'Aceita?' },
        history: [done('product_owner')],
      },
    }));
    assert.equal(decision.action, 'wait_human');
    assert.equal(decision.question.kind, 'mockup_acceptance');
  });

  it('puts the question ahead of the budget so it never spends to ask', () => {
    const decision = loop.decideNext(project({
      orchestration: { status: 'waiting_human', question: { personaId: 'ux', text: 'Aceita?' }, history: [] },
      budget: { maxCostUsd: 1, spentUsd: 99 },
    }));
    assert.equal(decision.action, 'wait_human');
  });

  it('pauses when the money cap is hit', () => {
    const decision = loop.decideNext(project({ budget: { maxCostUsd: 5, spentUsd: 5 } }));
    assert.equal(decision.action, 'paused_budget');
    assert.match(decision.budget.reason, /custo/);
  });

  it('pauses when the hour cap is hit', () => {
    const t0 = Date.now();
    const decision = loop.decideNext(
      project({ budget: budget.startClock({ maxHours: 1 }, t0) }),
      { now: t0 + 2 * HOUR }
    );
    assert.equal(decision.action, 'paused_budget');
    assert.match(decision.budget.reason, /tempo/);
  });

  it('halts when the same failure repeats, instead of retrying forever', () => {
    const signature = loop.failureSignature('developer', 'cannot resolve import Foo');
    const history = [
      done('product_owner'),
      { personaId: 'developer', outcome: 'failed', failureSignature: signature },
      { personaId: 'developer', outcome: 'failed', failureSignature: signature },
      { personaId: 'developer', outcome: 'failed', failureSignature: signature },
    ];
    const decision = loop.decideNext(project({ orchestration: { status: 'running', history } }));
    assert.equal(decision.action, 'halt');
    assert.equal(decision.repeated.personaId, 'developer');
    assert.match(decision.reason, /decisao humana/);
  });

  it('keeps going when failures differ — those are progress, not a loop', () => {
    const history = [
      { personaId: 'developer', outcome: 'failed', failureSignature: loop.failureSignature('developer', 'missing import') },
      { personaId: 'developer', outcome: 'failed', failureSignature: loop.failureSignature('developer', 'type mismatch') },
      { personaId: 'developer', outcome: 'failed', failureSignature: loop.failureSignature('developer', 'null pointer') },
    ];
    assert.equal(loop.repeatedFailure(history), null);
  });

  it('ignores digits so the same error with different line numbers still counts as a repeat', () => {
    assert.equal(
      loop.failureSignature('developer', 'failed at line 42'),
      loop.failureSignature('developer', 'failed at line 108')
    );
  });
});

describe('state transitions', () => {
  const personas = require('../lib/agent-personas').listPersonas();
  const ux = personas.find((p) => p.id === 'ux');
  const po = personas.find((p) => p.id === 'product_owner');

  it('starting sets the caps and runs the clock', () => {
    const p = project({ orchestration: { status: 'idle' }, budget: {} });
    const t0 = Date.now();
    loop.startChain(p, { maxCostUsd: 25, maxHours: 6 }, t0);
    assert.equal(p.orchestration.status, 'running');
    assert.equal(p.budget.maxCostUsd, 25);
    assert.equal(budget.budgetState(p.budget, t0 + HOUR).hours, 1);
  });

  it('accumulates spend across personas without resetting per persona', () => {
    const p = project();
    loop.startChain(p, { maxCostUsd: 10 });
    loop.recordResult(p, { personaId: 'product_owner', outcome: 'completed', costUsd: 1.5 });
    loop.recordResult(p, { personaId: 'module_architect', outcome: 'completed', costUsd: 2.25 });
    assert.equal(p.budget.spentUsd, 3.75);
    assert.equal(p.orchestration.history.length, 2);
  });

  it('a persona that needs an answer stops the chain and the clock', () => {
    const t0 = Date.now();
    const p = project({ orchestration: { status: 'running', history: [] } });
    loop.startChain(p, { maxHours: 4 }, t0);
    loop.recordResult(p, { personaId: 'ux', outcome: 'completed', costUsd: 0.5 }, t0 + HOUR);

    assert.equal(p.orchestration.status, 'waiting_human');
    assert.equal(p.orchestration.question.kind, 'mockup_acceptance');
    // Ten hours of the user sleeping must cost nothing.
    assert.equal(budget.budgetState(p.budget, t0 + 11 * HOUR).hours, 1);
    assert.equal(budget.budgetState(p.budget, t0 + 11 * HOUR).exhausted, false);
  });

  it('answering resumes the clock and the chain', () => {
    const t0 = Date.now();
    const p = project();
    loop.startChain(p, { maxHours: 4 }, t0);
    loop.recordResult(p, { personaId: 'ux', outcome: 'completed' }, t0 + HOUR);
    loop.answerQuestion(p, { accepted: true }, t0 + 10 * HOUR);
    assert.equal(p.orchestration.status, 'running');
    assert.equal(p.orchestration.question, null);
    assert.equal(budget.budgetState(p.budget, t0 + 11 * HOUR).hours, 2, 'only worked hours count');
  });

  it('rejecting sends the persona back rather than halting', () => {
    const p = project();
    loop.startChain(p, {});
    loop.recordResult(p, { personaId: 'product_owner', outcome: 'completed' });
    loop.recordResult(p, { personaId: 'ux', outcome: 'completed' });
    loop.answerQuestion(p, { accepted: false });
    assert.equal(p.orchestration.status, 'running');
    assert.equal(
      p.orchestration.history.some((entry) => entry.personaId === 'ux'), false,
      'the rejected run is cleared so the persona runs again'
    );
    assert.equal(loop.decideNext(p).persona.id, 'ux');
  });

  it('a persona with no standing question hands off without stopping', () => {
    const p = project();
    loop.startChain(p, {});
    loop.recordResult(p, { personaId: 'product_owner', outcome: 'completed' });
    assert.equal(p.orchestration.status, 'running');
    assert.equal(p.orchestration.question, null);
    assert.equal(loop.decideNext(p).persona.id, 'ux');
  });

  it('records a failure signature so repeats are detectable', () => {
    const p = project();
    loop.startChain(p, {});
    loop.recordResult(p, { personaId: 'developer', outcome: 'failed', failureMessage: 'cannot resolve Foo' });
    assert.ok(p.orchestration.history[0].failureSignature);
    assert.equal(p.orchestration.status, 'running', 'a single failure is not a halt');
  });

  it('halting and stopping both bank the clock', () => {
    const t0 = Date.now();
    const p = project();
    loop.startChain(p, { maxHours: 8 }, t0);
    loop.haltChain(p, 'motivo', t0 + HOUR);
    assert.equal(p.orchestration.status, 'halted');
    assert.equal(budget.budgetState(p.budget, t0 + 9 * HOUR).hours, 1);
    assert.equal(loop.decideNext(p, { now: t0 + 9 * HOUR }).action, 'halt');
  });

  it('refuses to answer a question that was never asked', () => {
    assert.throws(() => loop.answerQuestion(project(), { accepted: true }), /pergunta em aberto/);
  });

  it('resuming after a budget pause continues rather than restarting', () => {
    const p = project({ budget: { maxCostUsd: 5, spentUsd: 5 } });
    loop.startChain(p, {});
    assert.equal(loop.decideNext(p).action, 'paused_budget');
    loop.startChain(p, { maxCostUsd: 20 });
    const decision = loop.decideNext(p);
    assert.equal(decision.action, 'dispatch', 'raising the cap resumes the chain');
    assert.equal(p.budget.spentUsd, 5, 'spend already incurred is not forgotten');
  });

  void ux; void po;
});

describe('implementation units fan out to developer and tester', () => {
  function withUnits(statuses) {
    const p = project({
      orchestration: {
        status: 'running',
        history: ['product_owner', 'ux', 'module_architect', 'orchestrator', 'tech_lead'].map((id) => done(id)),
      },
    });
    workItems.setWorkItems(p, statuses.map((status, index) => workItems.normalizeWorkItem({
      id: `task_${index}`, title: `Unidade ${index}`, status,
      executorMode: 'agent', agentType: 'code_implementation',
      moduleName: 'Reservas', repositoryPaths: ['src/reservas'],
    }, { project: p })));
    return p;
  }

  it('dispatches the next pending unit to the developer', () => {
    const decision = loop.decideNext(withUnits(['ready', 'ready']));
    assert.equal(decision.action, 'dispatch');
    assert.equal(decision.persona.id, 'developer');
    assert.equal(decision.workItem.id, 'task_0');
    assert.equal(decision.remainingUnits, 2);
  });

  it('does not re-dispatch a unit already waiting for review', () => {
    const decision = loop.decideNext(withUnits(['waiting_review', 'ready']));
    assert.equal(decision.workItem.id, 'task_1');
  });

  it('moves on once every unit is finished', () => {
    const decision = loop.decideNext(withUnits(['completed', 'completed']));
    assert.equal(decision.action, 'complete');
  });

  it('raises the right question per persona', () => {
    const personas = require('../lib/agent-personas').listPersonas();
    const ux = personas.find((p) => p.id === 'ux');
    const developer = personas.find((p) => p.id === 'developer');
    assert.equal(loop.questionFor(ux).kind, 'mockup_acceptance');
    assert.match(loop.questionFor(ux).text, /frontend/);
    assert.equal(loop.questionFor(developer).kind, 'result_review');
  });
});
