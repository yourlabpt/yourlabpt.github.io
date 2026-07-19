const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const workItems = require('../lib/work-items');
const workItemsSync = require('../lib/work-items-sync');
const projectAccess = require('../lib/project-access');
const taskSuggestions = require('../lib/task-suggestions');
const agentRequests = require('../lib/agent-requests');
const stageTransitions = require('../lib/stage-transition-requests');
const { selectReadyAgentTask } = require('../lib/agent-runtime-routes');
const { filterAcceptedWorkItems } = require('../lib/work-items-routes');

function task(overrides = {}) {
  return { title: 'Task', descriptionMarkdown: 'Body', complexity: 'low', deliveryStageId: 'requirements', ...overrides };
}

describe('work items model', () => {
  it('requires title, description, complexity and delivery stage', () => {
    assert.throws(() => workItems.validateWorkItemForCreate({ title: 'A' }), /descriptionMarkdown|complexity|deliveryStageId/);
    assert.doesNotThrow(() => workItems.validateWorkItemForCreate(task()));
  });

  it('normalizes aliases, sources and legacy items', () => {
    const item = workItems.normalizeWorkItem(task({ id: 'w1', status: 'todo', linkedRequirementIds: ['FR-01'] }));
    assert.equal(item.status, 'planned');
    assert.equal(item.sourceRefs[0].type, 'requirement');
    const project = { workItems: [{ id: 'old', title: 'Old', descriptionMarkdown: 'x', complexity: 'low' }] };
    assert.equal(workItems.migrateProjectWorkItems(project).changed, true);
    assert.equal(workItems.migrateProjectWorkItems(project).changed, false);
    assert.equal(project.workItems[0].deliveryStageId, 'unclassified');
  });

  it('normalizes execution settings v2 with unlimited local tokens by default', () => {
    const settings = workItems.normalizeExecutionSettings({
      externalMaxTokens: 50000,
      maxWallClockMinutes: 90,
      maxSubtasks: 6,
    });
    assert.equal(settings.schemaVersion, 2);
    assert.equal(settings.tokenPolicy.local.mode, 'unlimited');
    assert.equal(settings.maxTokens, 0);
    assert.equal(settings.tokenPolicy.external.mode, 'limited');
    assert.equal(settings.externalMaxTokens, 50000);
    assert.equal(settings.timePolicy.mode, 'limited');
    assert.equal(settings.planningWaveSize, 6);
  });

  it('returns slim cards without descriptions and counts executors', () => {
    const item = workItems.normalizeWorkItem(task({ id: 'w1', resultSummaryMarkdown: 'Done' }));
    assert.equal(workItems.toSlimCard(item).descriptionMarkdown, undefined);
    const counts = workItems.computeMetaCounts([
      { executorMode: 'human' }, { executorMode: 'agent' }, { executorMode: 'both' },
    ]);
    assert.deepEqual({ total: counts.total, human: counts.human, agent: counts.agent, both: counts.both }, { total: 3, human: 1, agent: 1, both: 1 });
    assert.equal(counts.open, 3);
  });

  it('derives parent status and rejects cycles', () => {
    const items = workItems.normalizeWorkItems([
      task({ id: 'parent', executorMode: 'both' }),
      task({ id: 'human', parentTaskId: 'parent', status: 'closed' }),
      task({ id: 'agent', parentTaskId: 'parent', origin: 'agent', executorMode: 'agent', status: 'active' }),
    ]);
    assert.equal(items.find((item) => item.id === 'parent').status, 'in_progress');
    assert.equal(items.find((item) => item.id === 'parent').childTaskCount, 2);
    assert.throws(() => workItems.validateHierarchy({ id: 'parent', parentTaskId: 'agent' }, items), /ciclos/);
  });

  it('ranks blocked and review tasks for phase summaries', () => {
    const ranked = workItems.relevantWorkItems([
      workItems.normalizeWorkItem(task({ id: 'new', status: 'new' })),
      workItems.normalizeWorkItem(task({ id: 'review', status: 'new', sourceRefs: [{ type: 'review', id: 'r1' }] })),
      workItems.normalizeWorkItem(task({ id: 'blocked', status: 'blocked' })),
    ], { deliveryStageId: 'requirements', limit: 2 });
    assert.deepEqual(ranked.map((item) => item.id), ['review', 'blocked']);
  });

  it('adds and edits traceable updates', () => {
    const item = workItems.normalizeWorkItem(task({ id: 'w1' }));
    const withUpdate = workItems.addWorkItemUpdate(item, 'Started', { actorUserId: 'u1' });
    const patched = workItems.patchWorkItemUpdate(withUpdate, withUpdate.updates[0].id, 'Edited', { actorUserId: 'u2' });
    assert.equal(patched.updates[0].bodyMarkdown, 'Edited');
    assert.equal(patched.updates[0].updatedBy, 'u2');
  });
});

describe('work items access', () => {
  const project = { members: [{ userId: 'partner', role: 'partner' }, { userId: 'client', role: 'client' }] };
  const items = [
    { id: 'visible-assigned', clientVisible: true, assigneeUserId: 'client' },
    { id: 'visible-readonly', clientVisible: true, assigneeUserId: 'partner' },
    { id: 'internal', clientVisible: false, assigneeUserId: 'client' },
  ];

  it('editors see all tasks and clients see only explicitly visible tasks', () => {
    assert.equal(projectAccess.filterWorkItemsForViewer(items, { id: 'admin', role: 'super_admin' }, project).length, 3);
    assert.deepEqual(projectAccess.filterWorkItemsForViewer(items, { id: 'client', role: 'client' }, project).map((item) => item.id), ['visible-assigned', 'visible-readonly']);
  });

  it('visibility and collaboration are separate permissions', () => {
    const client = { id: 'client', role: 'client' };
    assert.equal(projectAccess.canViewWorkItemsTab(client, project, items), true);
    assert.equal(projectAccess.canPostWorkItemUpdate(client, project, items[0]), true);
    assert.equal(projectAccess.canPostWorkItemUpdate(client, project, items[1]), false);
  });
});

describe('work item synchronization', () => {
  it('syncs execution plans idempotently', () => {
    const project = { workItems: [], requirements: [] };
    const plan = { id: 'p1', toStageId: 'architecture', tasks: [{ id: 't1', title: 'Diagram' }] };
    workItemsSync.syncWorkItemsFromExecutionPlan(project, plan);
    workItemsSync.syncWorkItemsFromExecutionPlan(project, plan);
    assert.equal(project.workItems.length, 1);
    assert.equal(project.workItems[0].executorMode, 'agent');
  });

  it('does not recreate an execution-plan task after it is tombstoned', () => {
    const project = { workItems: [], requirements: [] };
    const plan = { id: 'p_deleted', toStageId: 'architecture', tasks: [{ id: 't1', title: 'Diagram' }] };
    workItemsSync.syncWorkItemsFromExecutionPlan(project, plan);
    const deleted = project.workItems[0];
    workItems.addWorkItemTombstone(project, deleted, { deletedBy: 'u1' });
    project.workItems = [];
    workItemsSync.syncWorkItemsFromExecutionPlan(project, plan);
    assert.equal(project.workItems.length, 0);
    assert.equal(project.workItemTombstones.length, 1);
  });

  it('migrates implementation tasks once and removes the duplicate queue', () => {
    const project = { workItems: [], implementation: { tasks: [{ id: 'old1', title: 'Build API', descriptionMarkdown: 'Implement', complexity: 'high', status: 'todo' }] } };
    assert.equal(workItemsSync.syncImplementationTasks(project).synced, 1);
    assert.equal(workItemsSync.syncImplementationTasks(project).synced, 0);
    assert.equal(project.implementation.tasks.length, 0);
    assert.equal(project.workItems[0].deliveryStageId, 'implementation');
  });

  it('never creates domain tasks implicitly and only syncs an explicitly created bridge', () => {
    const project = { workItems: [], humanReviews: [{ id: 'r1', title: 'Review', status: 'pending', stageId: 'architecture' }] };
    workItemsSync.syncDomainTasks(project);
    assert.equal(project.workItems.length, 0);
    workItemsSync.syncDomainTasks(project, { createMissing: true });
    workItemsSync.syncDomainTasks(project);
    assert.equal(project.workItems.length, 1);
    project.humanReviews[0].status = 'approved';
    workItemsSync.syncDomainTasks(project);
    assert.equal(project.workItems[0].status, 'completed');
  });

  it('keeps a deleted historical agent task deleted when legacy migration runs', () => {
    const job = {
      id: 'job_deleted',
      status: 'pending_human_review',
      agentId: 'idea-to-requirements',
      promptRunId: 'run_deleted',
    };
    const project = { workItems: [], agentJobs: [job], agentRequests: [] };
    const deleted = workItems.normalizeWorkItem(task({
      id: 'old_task',
      origin: 'agent',
      executorMode: 'agent',
      agentJobId: job.id,
      promptRunId: job.promptRunId,
      externalRefs: [{ source: 'agent_job', jobId: job.id, promptRunId: job.promptRunId }],
    }), { project });
    workItems.addWorkItemTombstone(project, deleted, { deletedBy: 'u1' });
    agentRequests.migrateAgentRequests(project);
    assert.equal(project.workItems.length, 0);
    assert.equal(project.agentRequestsSchemaVersion, 1);
  });

  it('persists the complete agent output on the review attempt', () => {
    const project = {
      workItems: [workItems.normalizeWorkItem(task({
        id: 'w_review',
        origin: 'agent',
        executorMode: 'agent',
        reviewRequired: true,
        attempts: [{ id: 'attempt_1', number: 1, status: 'running' }],
      }))],
    };
    const rawOutput = 'complete review output '.repeat(300);
    workItemsSync.onAgentRunComplete(project, {
      workItemId: 'w_review',
      promptRunId: 'run_review',
      resultSummaryMarkdown: 'Short summary',
      rawOutput,
      waitingReview: true,
    });
    assert.equal(project.workItems[0].status, 'waiting_review');
    assert.equal(project.workItems[0].attempts[0].rawOutput, rawOutput);
    assert.equal(project.workItems[0].attempts[0].promptRunId, 'run_review');
  });
});

describe('agent requests and visible plans', () => {
  it('falls forward from a blocked requested task to the next executable subtask', () => {
    const tasks = [
      { id: 'coordination', taskRole: 'coordination', status: 'ready' },
      { id: 'first', taskRole: 'execution', status: 'ready' },
      { id: 'blocked-request', taskRole: 'execution', status: 'planned' },
    ];
    assert.equal(selectReadyAgentTask(tasks, 'blocked-request').id, 'first');
    assert.equal(selectReadyAgentTask(tasks, 'first').id, 'first');
    assert.equal(selectReadyAgentTask(tasks.map((task) => ({ ...task, status: 'planned' })), 'blocked-request'), null);
  });

  it('creates all tasks before execution and requires approval for multi-task work', () => {
    const project = { workItems: [], requirements: [] };
    const result = agentRequests.createAgentRequest(project, {
      agentType: 'requirements_to_architecture', stageId: 'architecture',
      requestMarkdown: 'Create and verify the architecture.',
      tasks: [
        { id: 'draft', title: 'Draft architecture', instruction: 'Draft it' },
        { id: 'verify', title: 'Verify architecture', instruction: 'Verify it', dependsOn: ['draft'] },
      ],
    }, { actorUserId: 'u1' });
    assert.equal(result.request.status, 'awaiting_approval');
    assert.equal(project.workItems.length, 2);
    assert.equal(project.workItems.every((item) => item.agentRequestId === result.request.id), true);
    assert.equal(project.workItems.some((item) => item.status === 'in_progress'), false);
  });

  it('keeps unapproved agent plans out of the canonical task list projection', () => {
    const project = {
      agentRequests: [
        { id: 'proposed', status: 'awaiting_approval' },
        { id: 'accepted', status: 'ready' },
      ],
      workItems: [
        task({ id: 'w_proposed', agentRequestId: 'proposed' }),
        task({ id: 'w_accepted', agentRequestId: 'accepted' }),
        task({ id: 'w_human' }),
      ],
    };
    assert.deepEqual(
      filterAcceptedWorkItems(project).map((item) => item.id),
      ['w_accepted', 'w_human'],
    );
  });

  it('approves a plan and only makes dependency-free tasks ready', () => {
    const project = { workItems: [] };
    const created = agentRequests.createAgentRequest(project, {
      agentType: 'roadmap_plan', tasks: [
        { id: 'one', title: 'One', instruction: 'One' },
        { id: 'two', title: 'Two', instruction: 'Two', dependsOn: ['one'] },
      ],
    }, { actorUserId: 'u1' });
    const approved = agentRequests.approveAgentRequest(project, created.request.id, 'u2');
    assert.equal(approved.request.status, 'ready');
    assert.deepEqual(approved.tasks.map((item) => item.status), ['ready', 'planned']);
  });

  it('stores an explicit copyable execution package and rejects dependency cycles', () => {
    const project = { workItems: [] };
    const created = agentRequests.createAgentRequest(project, {
      agentType: 'reverse_idea', requestMarkdown: 'Clarify the idea', desiredOutcomeMarkdown: 'Idea brief',
    }, { actorUserId: 'u1' });
    assert.match(created.tasks[0].executionPackage.instructions, /Clarify the idea/);
    assert.equal(created.tasks[0].expectedOutputs.length, 1);
    const cyclic = created.tasks.map((item) => ({ ...item, dependencyTaskIds: [item.id] }));
    assert.throws(() => workItems.validateDependencies(cyclic[0], cyclic), /si propria|ciclos/);
  });
});

describe('stage transition requests through Tasks', () => {
  function project() {
    return {
      id: 'p_transition', name: 'Transition project', updatedAt: '2026-07-01T00:00:00.000Z',
      workItems: [], agentRequests: [], stageTransitionConfigs: [], requirements: [
        { id: 'STK-01', type: 'stakeholder', title: 'Need', shall: 'Support the user' },
        { id: 'FR-01', type: 'functional', title: 'Feature', shall: 'Provide the flow' },
      ], capabilities: [], diagramArtifacts: [], documents: [], phases: [],
    };
  }

  it('creates a coordination parent and never truncates children silently', () => {
    const data = project();
    const created = stageTransitions.createRequest(data, {
      fromStageId: 'requirements', toStageId: 'architecture', direction: 'forward', regenerationMode: 'full',
      config: { userRequest: 'Create architecture', desiredOutcome: 'Architecture ready', maxSubtasks: 2 },
    }, { actorUserId: 'u1' });
    const parent = data.workItems.find((item) => item.taskRole === 'coordination');
    const children = data.workItems.filter((item) => item.parentTaskId === parent.id);
    assert.ok(parent);
    assert.equal(children.length, 2);
    assert.equal(created.request.parentTaskId, parent.id);
    assert.ok(children.every((item) => item.executionPackage?.instructions));
  });

  it('validates a complete task-keyed bundle and rejects stale package versions', () => {
    const data = project();
    stageTransitions.createRequest(data, { fromStageId: 'requirements', toStageId: 'architecture', direction: 'forward', config: { maxSubtasks: 3 } }, { actorUserId: 'u1' });
    const parent = data.workItems.find((item) => item.taskRole === 'coordination');
    const pack = stageTransitions.buildTreePackage(data, parent);
    const valid = { ...pack.envelope, taskOutputs: pack.envelope.taskOutputs.map((row) => ({ ...row, output: { ok: true } })) };
    assert.equal(stageTransitions.validateBundle(data, parent, valid).tasks.length, pack.children.length);
    valid.taskOutputs[0].packageVersion += 1;
    assert.throws(() => stageTransitions.validateBundle(data, parent, valid), /versao antiga/);
  });

  it('versions configuration, records prompt diffs and supersedes unfinished work', () => {
    const data = project();
    const first = stageTransitions.createRequest(data, { fromStageId: 'requirements', toStageId: 'architecture', direction: 'forward', config: { userRequest: 'Initial architecture', maxSubtasks: 4 } }, { actorUserId: 'u1' });
    const second = stageTransitions.createRequest(data, { fromStageId: 'requirements', toStageId: 'architecture', direction: 'forward', config: { userRequest: 'Architecture with new constraints', maxSubtasks: 4 } }, { actorUserId: 'u1' });
    const old = data.agentRequests.find((request) => request.id === first.request.id);
    assert.equal(old.status, 'superseded');
    assert.equal(old.supersededByRequestId, second.request.id);
    assert.ok(second.request.diffSummary.requestPromptDiff);
    assert.equal(data.stageTransitionConfigs[0].version, 2);
    assert.ok(data.workItems.filter((item) => item.agentRequestId === first.request.id && item.status === 'cancelled').length > 0);
  });

  it('migrates an open historical transition idempotently', () => {
    const data = project();
    data.executionPlans = [{ id: 'plan_old', agentType: 'stage_transition', fromStageId: 'requirements', toStageId: 'architecture', direction: 'forward', config: {}, tasks: [{ id: 'context', title: 'Context' }] }];
    data.agentRequests = [{ id: 'areq_old', executionPlanId: 'plan_old', title: 'Old transition', status: 'ready', taskIds: ['w_old'] }];
    data.workItems = [task({ id: 'w_old', origin: 'agent', executorMode: 'agent', agentRequestId: 'areq_old', executionPlanId: 'plan_old', executionPlanTaskId: 'context' })];
    stageTransitions.migrateStageTransitionRequests(data);
    stageTransitions.migrateStageTransitionRequests(data);
    assert.equal(data.stageTransitionConfigs.length, 1);
    assert.equal(data.workItems.filter((item) => item.taskRole === 'coordination').length, 1);
    assert.equal(data.workItems.filter((item) => item.parentTaskId).length, 1);
  });
});

describe('contextual task suggestions', () => {
  it('persists dismissal and avoids duplicate fingerprints', () => {
    const project = { workItems: [], humanReviews: [{ id: 'r1', title: 'Review', status: 'pending', stageId: 'architecture' }] };
    taskSuggestions.evaluateProject(project, { now: '2026-01-01T00:00:00.000Z' });
    taskSuggestions.dismissSuggestion(project, project.taskSuggestions[0].id, '2026-01-02T00:00:00.000Z');
    taskSuggestions.evaluateProject(project, { now: '2026-01-03T00:00:00.000Z' });
    assert.equal(project.taskSuggestions.length, 1);
    assert.equal(project.taskSuggestions[0].status, 'dismissed');
  });

  it('prepares a draft without silently creating a task', () => {
    const project = { workItems: [], approvals: [{ id: 'a1', stageId: 'delivery', status: 'pending' }] };
    taskSuggestions.evaluateProject(project);
    const prepared = taskSuggestions.prepareSuggestion(project, project.taskSuggestions[0].id);
    assert.equal(prepared.draft.deliveryStageId, 'delivery');
    assert.equal(project.workItems.length, 0);
  });

  it('never promotes a suggestion without explicit human acceptance', () => {
    const project = { workItems: [], approvals: [{ id: 'a1', stageId: 'delivery', status: 'pending' }] };
    taskSuggestions.evaluateProject(project);
    assert.equal(taskSuggestions.applyConfiguredAutomations(project).length, 0);
    project.taskAutomationRules = [{ ruleId: 'pending_approval', enabled: true, autoCreate: true }];
    const created = taskSuggestions.applyConfiguredAutomations(project);
    assert.equal(created.length, 0);
    assert.equal(project.workItems.length, 0);
    assert.equal(project.taskSuggestions[0].status, 'proposed');
  });
});
