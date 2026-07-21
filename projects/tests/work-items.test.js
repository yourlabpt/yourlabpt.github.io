const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const workItems = require('../lib/work-items');
const workItemsSync = require('../lib/work-items-sync');
const projectAccess = require('../lib/project-access');
const taskSuggestions = require('../lib/task-suggestions');
const agentRequests = require('../lib/agent-requests');
const stageTransitions = require('../lib/stage-transition-requests');
const {
  selectReadyAgentTask,
  resolveContinuousExecutionTask,
  resetTaskForRestart,
  reconcileActiveAgentJobs,
} = require('../lib/agent-runtime-routes');
const { filterAcceptedWorkItems, registerWorkItemRoutes, promoteStageStatusOnTransitionComplete } = require('../lib/work-items-routes');
const deliveryOs = require('../lib/delivery-os');

function task(overrides = {}) {
  return { title: 'Task', descriptionMarkdown: 'Body', complexity: 'low', deliveryStageId: 'requirements', ...overrides };
}

async function runHandlers(handlers, req, res, index = 0) {
  if (!handlers[index]) return;
  await handlers[index](req, res, () => runHandlers(handlers, req, res, index + 1));
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
    assert.equal(settings.timePolicy.mode, 'unlimited');
    assert.equal(settings.maxWallClockMinutes, 0);
    assert.equal(settings.reviewPolicy.subtask, 'non_blocking');
    assert.equal(settings.pauseForSubtaskReview, false);
    assert.equal(settings.planningWaveSize, 6);
    const explicitlyTimed = workItems.normalizeExecutionSettings({
      timeLimitEnabled: true,
      timePolicy: { mode: 'limited', enforced: true, maxWallClockMinutes: 90 },
    });
    assert.equal(explicitlyTimed.timePolicy.mode, 'limited');
    assert.equal(explicitlyTimed.maxWallClockMinutes, 90);
    const blockingReview = workItems.normalizeExecutionSettings({ pauseForSubtaskReview: true });
    assert.equal(blockingReview.reviewPolicy.subtask, 'blocking');
    assert.equal(blockingReview.pauseForSubtaskReview, true);
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

  it('derives coordination status only from children, never from a parent execution', () => {
    const base = [
      task({
        id: 'parent',
        executorMode: 'agent',
        taskRole: 'coordination',
        agentJobId: 'job_live',
        agentStatus: 'paused',
      }),
      task({ id: 'child', parentTaskId: 'parent', status: 'ready' }),
    ];
    let items = workItems.normalizeWorkItems(base);
    assert.equal(items.find((item) => item.id === 'parent').status, 'ready');
    items = workItems.normalizeWorkItems(items.map((item) => (
      item.id === 'parent' ? { ...item, agentStatus: 'executing' } : item
    )));
    assert.equal(items.find((item) => item.id === 'parent').status, 'ready');
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
  it('defaults local stage execution to unlimited tokens and wall-clock time', () => {
    const config = stageTransitions.defaultConfig({});
    assert.equal(config.maxTokens, 0);
    assert.equal(config.maxWallClockMinutes, 0);
  });

  it('accumulates reviewed outputs and packages every remaining subtask', () => {
    const data = {
      id: 'p_bundle',
      name: 'Bundle project',
      updatedAt: '2026-07-21T00:00:00.000Z',
      workItems: [],
      agentRequests: [],
      stageTransitionConfigs: [],
      requirements: [],
      capabilities: [],
      diagramArtifacts: [],
      documents: [],
      phases: [],
      ideaBriefMarkdown: 'A project idea ready for discovery.',
    };
    const created = stageTransitions.createRequest(data, {
      fromStageId: 'idea',
      toStageId: 'discovery',
      direction: 'forward',
      regenerationMode: 'full',
      config: { maxSubtasks: 8 },
    }, { actorUserId: 'u1' });
    const parent = workItems.findWorkItem(data, created.request.parentTaskId);
    const children = workItems.getWorkItems(data)
      .filter((entry) => entry.parentTaskId === parent.id);
    workItems.setWorkItems(data, workItems.getWorkItems(data).map((entry) => (
      entry.id === children[0].id
        ? workItems.normalizeWorkItem({
            ...entry,
            status: 'waiting_review',
            attempts: [{
              id: 'attempt_reviewed',
              rawOutput: JSON.stringify({ stakeholders: [{ name: 'Independent musicians' }] }),
            }],
          }, { project: data })
        : entry
    )));
    const pack = stageTransitions.buildTreePackage(data, parent);
    assert.ok(pack.openChildren.length > 0);
    assert.ok(!pack.openChildren.some((entry) => entry.id === children[0].id));
    assert.ok(pack.openChildren.every((entry) => pack.text.includes(entry.id)));
    assert.equal(pack.provisionalOutputs[0].taskId, children[0].id);
    assert.equal(pack.provisionalOutputs[0].output.stakeholders[0].name, 'Independent musicians');
    assert.match(pack.text, /Resultados provisórios já obtidos/);
  });

  it('repairs an already-approved task whose connector was left waiting for review', () => {
    const project = {
      workItems: [workItems.normalizeWorkItem(task({
        id: 'approved_task',
        origin: 'agent',
        executorMode: 'agent',
        status: 'completed',
        agentJobId: 'approved_job',
        promptRunId: 'approved_run',
      }))],
      agentJobs: [{
        id: 'approved_job',
        workItemId: 'approved_task',
        promptRunId: 'approved_run',
        dispatchId: 'approved_dispatch',
        status: 'pending_human_review',
      }],
    };
    let dispatchStatus = 'waiting_review';
    const connectorStore = {
      findDispatch: () => ({ id: 'approved_dispatch', status: dispatchStatus }),
      markReviewed: (id, action) => {
        assert.equal(id, 'approved_dispatch');
        assert.equal(action, 'approved');
        dispatchStatus = 'completed';
        return { id, status: dispatchStatus };
      },
    };
    const result = reconcileActiveAgentJobs(project, {
      connectorStore,
      connectionMode: 'remote_pull',
      nowIso: () => '2026-07-20T10:00:00.000Z',
    });
    assert.equal(result.blocking, null);
    assert.equal(dispatchStatus, 'completed');
    assert.equal(project.agentJobs[0].status, 'completed');
  });

  it('cancels an orphaned execution and does not let it block a new task', () => {
    const commands = [];
    const dispatch = {
      id: 'dispatch_orphan',
      status: 'paused',
      agentJobId: 'job_orphan',
    };
    const connectorStore = {
      findDispatch: () => dispatch,
      setDesiredAction: (_id, action, options) => {
        commands.push({ action, options });
        return { ...dispatch, status: 'cancel_requested', desiredAction: action };
      },
    };
    const project = {
      workItems: [],
      agentJobs: [{
        id: 'job_orphan',
        dispatchId: dispatch.id,
        workItemId: 'deleted_task',
        status: 'paused',
      }],
    };
    const result = reconcileActiveAgentJobs(project, {
      connectorStore,
      connectionMode: 'remote_pull',
      nowIso: () => '2026-07-19T23:00:00.000Z',
    });
    assert.equal(result.blocking, null);
    assert.equal(result.orphaned.length, 1);
    assert.equal(project.agentJobs[0].status, 'cancel_requested');
    assert.equal(project.agentJobs[0].cancelReason, 'orphaned_execution');
    assert.equal(commands[0].action, 'cancel');
    assert.equal(commands[0].options.idempotencyKey, 'orphan:dispatch_orphan:cancel');
  });

  it('keeps a visible paused execution controllable and blocking', () => {
    const project = {
      workItems: [workItems.normalizeWorkItem(task({ id: 'visible_task' }))],
      agentJobs: [{
        id: 'job_visible',
        workItemId: 'visible_task',
        dispatchId: 'dispatch_visible',
        status: 'paused',
      }],
    };
    const result = reconcileActiveAgentJobs(project, {
      connectionMode: 'remote_pull',
      connectorStore: {
        findDispatch: () => ({ id: 'dispatch_visible', status: 'paused' }),
      },
    });
    assert.equal(result.blocking.id, 'job_visible');
    assert.equal(result.orphaned.length, 0);
  });

  it('executes a requested coordination task as the complete subtask bundle', () => {
    const tasks = [
      { id: 'coordination', taskRole: 'coordination', status: 'ready' },
      { id: 'first', taskRole: 'execution', status: 'ready' },
      { id: 'blocked-request', taskRole: 'execution', status: 'planned' },
    ];
    assert.equal(selectReadyAgentTask(tasks, 'blocked-request').id, 'first');
    assert.equal(selectReadyAgentTask(tasks, 'coordination').id, 'coordination');
    assert.equal(selectReadyAgentTask(tasks, 'first').id, 'first');
    assert.equal(selectReadyAgentTask(tasks.map((task) => ({ ...task, status: 'planned' })), 'blocked-request'), null);
  });

  it('promotes a requested subtask to continuous parent execution by default', () => {
    const tasks = [
      { id: 'coordination', taskRole: 'coordination', status: 'ready', executionSettings: {} },
      { id: 'first', parentTaskId: 'coordination', taskRole: 'execution', status: 'ready', executionSettings: {} },
      { id: 'second', parentTaskId: 'coordination', taskRole: 'execution', status: 'planned', executionSettings: {} },
    ];
    assert.equal(resolveContinuousExecutionTask(tasks, tasks[1]).id, 'coordination');
    assert.equal(selectReadyAgentTask(tasks, resolveContinuousExecutionTask(tasks, tasks[1]).id).id, 'coordination');
    const blocking = {
      ...tasks[1],
      executionSettings: { pauseForSubtaskReview: true },
    };
    assert.equal(resolveContinuousExecutionTask(tasks, blocking).id, 'first');
  });

  it('keeps the coordination task executable while earlier results await batch review', () => {
    const tasks = [
      { id: 'coordination', taskRole: 'coordination', status: 'waiting_review' },
      { id: 'reviewed-output', parentTaskId: 'coordination', taskRole: 'execution', status: 'waiting_review' },
      { id: 'next', parentTaskId: 'coordination', taskRole: 'execution', status: 'ready' },
    ];
    assert.equal(selectReadyAgentTask(tasks, 'coordination').id, 'coordination');
  });

  it('force-unlocks a whole plan without discarding results already waiting for review', () => {
    const project = {
      workItems: workItems.normalizeWorkItems([
        task({
          id: 'coordination', origin: 'agent', executorMode: 'agent',
          taskRole: 'coordination', status: 'in_progress', agentJobId: 'job_old',
        }),
        task({
          id: 'finished-output', origin: 'agent', executorMode: 'agent',
          taskRole: 'execution', parentTaskId: 'coordination', status: 'waiting_review',
          attempts: [{ id: 'attempt_done', rawOutput: '{"ok":true}' }],
        }),
        task({
          id: 'stuck-step', origin: 'agent', executorMode: 'agent',
          taskRole: 'execution', parentTaskId: 'coordination', status: 'in_progress',
          agentStatus: 'running', dependencyTaskIds: ['finished-output'],
        }),
        task({
          id: 'later-step', origin: 'agent', executorMode: 'agent',
          taskRole: 'execution', parentTaskId: 'coordination', status: 'planned',
          dependencyTaskIds: ['stuck-step'],
        }),
      ]),
    };

    resetTaskForRestart(project, 'coordination', {
      at: '2026-07-21T12:00:00.000Z',
      actorUserId: 'u1',
    });

    const tasks = workItems.getWorkItems(project);
    const parent = tasks.find((entry) => entry.id === 'coordination');
    const finished = tasks.find((entry) => entry.id === 'finished-output');
    const restarted = tasks.find((entry) => entry.id === 'stuck-step');
    const later = tasks.find((entry) => entry.id === 'later-step');
    assert.equal(parent.agentJobId, '');
    assert.equal(finished.status, 'waiting_review');
    assert.equal(finished.attempts[0].rawOutput, '{"ok":true}');
    assert.equal(restarted.status, 'ready');
    assert.equal(restarted.agentStatus, '');
    assert.equal(later.status, 'planned');
    assert.equal(selectReadyAgentTask(tasks, parent.id).id, parent.id);
  });

  it('does not let accumulated human review block another agent execution', () => {
    const project = {
      workItems: [workItems.normalizeWorkItem(task({
        id: 'review_task',
        status: 'waiting_review',
        agentJobId: 'review_job',
      }))],
      agentJobs: [{
        id: 'review_job',
        workItemId: 'review_task',
        status: 'pending_human_review',
      }],
    };
    const result = reconcileActiveAgentJobs(project, {
      connectionMode: 'remote_pull',
      connectorStore: { findDispatch: () => ({ status: 'waiting_review' }) },
    });
    assert.equal(result.blocking, null);
    assert.equal(project.agentJobs[0].status, 'pending_human_review');
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

  it('does not reuse an orphaned request that has no backing tasks', () => {
    const project = { workItems: [], agentRequests: [] };
    const input = {
      idempotencyKey: 'same-request',
      agentType: 'reverse_idea',
      requestMarkdown: 'Clarify the idea.',
    };
    const first = agentRequests.createAgentRequest(project, input, { actorUserId: 'u1' });
    project.workItems = [];
    const second = agentRequests.createAgentRequest(project, input, { actorUserId: 'u1' });
    assert.equal(first.created, true);
    assert.equal(second.created, true);
    assert.notEqual(second.request.id, first.request.id);
    assert.equal(project.workItems.length, 1);
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

  it('shows explicitly created stage-transition tasks while execution approval is pending', () => {
    const project = {
      agentRequests: [
        { id: 'transition', requestKind: 'stage_transition', status: 'awaiting_approval' },
        { id: 'agent-proposal', status: 'awaiting_approval' },
      ],
      workItems: [
        task({ id: 'w_transition', agentRequestId: 'transition', deliveryStageId: 'discovery' }),
        task({ id: 'w_proposal', agentRequestId: 'agent-proposal' }),
      ],
    };
    assert.deepEqual(
      filterAcceptedWorkItems(project).map((item) => item.id),
      ['w_transition'],
    );
  });

  it('never hides a task that has an active agent execution', () => {
    const project = {
      agentRequests: [{ id: 'pending', status: 'awaiting_approval' }],
      agentJobs: [{
        id: 'job_active',
        workItemId: 'w_active',
        status: 'paused',
      }],
      workItems: [
        task({
          id: 'w_active',
          agentRequestId: 'pending',
          agentJobId: 'job_active',
          agentStatus: 'paused',
        }),
      ],
    };
    assert.deepEqual(
      filterAcceptedWorkItems(project).map((item) => item.id),
      ['w_active'],
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

  it('uses the live dispatch projection consistently in task detail', async () => {
    const data = project();
    data.members = [{ userId: 'editor', role: 'partner' }];
    data.agentJobs = [
      {
        id: 'job_historical_projection', dispatchId: 'dispatch_historical_projection',
        workItemId: 'task_live_projection', status: 'failed', tokensUsed: 100,
        subtasksCompleted: 1, subtasksTotal: 4,
      },
      {
        id: 'job_live_projection', dispatchId: 'dispatch_live_projection',
        workItemId: 'task_live_projection', status: 'running',
        tokensUsed: 100, localTokensUsed: 100, subtasksCompleted: 1, subtasksTotal: 4,
        budget: { maxTokens: 10, maxWallClockMinutes: 90 },
      },
    ];
    data.workItems = [workItems.normalizeWorkItem(task({
      id: 'task_live_projection', origin: 'agent', executorMode: 'agent',
      agentJobId: 'job_live_projection', agentStatus: 'running', status: 'in_progress',
    }), { project: data })];
    const dispatch = {
      id: 'dispatch_live_projection', status: 'running', desiredAction: null,
      commandVersion: 4, acknowledgedCommandVersion: 4,
      updatedAt: '2026-07-21T12:00:00.000Z',
      progress: {
        completed: 3, total: 5, tokensUsed: 8200, localTokensUsed: 8000,
        externalTokensUsed: 200, maxTokens: 0, externalMaxTokens: 50000,
        costUsed: 0.42, maxCost: 5, maxWallClockMinutes: 0,
        phase: 'researching', checkpointBoundary: 'step_completed',
      },
      checkpoint: {}, reviewPacket: {},
    };
    const routes = new Map();
    const app = {};
    for (const method of ['get', 'post', 'patch', 'delete']) {
      app[method] = (path, ...handlers) => routes.set(`${method}:${path}`, handlers);
    }
    registerWorkItemRoutes(app, {
      authMiddleware: (req, res, next) => next(),
      requireProjectEditor: (req, res, next) => next(),
      ensureProjectLoadedLite: async () => data,
      canAccessProject: () => true,
      updateStore: async (mutate) => mutate({ projects: [data], users: [] }),
      appendActivity: () => {},
      connectorStore: {
        findDispatch: (id) => id === dispatch.id ? dispatch : null,
        recentEvents: () => [],
      },
      agentConnectionMode: 'remote_pull', runtime: null,
      ensureArray: (value) => Array.isArray(value) ? value : [],
      nowIso: () => new Date().toISOString(),
      normalizeRequirementRecord: (value) => value,
    });
    const handlers = routes.get('get:/api/projects/projects/:projectId/work-items/:workItemId');
    let responseBody = null;
    await runHandlers(handlers, {
      params: { projectId: data.id, workItemId: 'task_live_projection' },
      auth: { user: { id: 'editor', role: 'partner' } },
    }, {
      status() { return this; },
      json(payload) { responseBody = payload; return payload; },
    });

    assert.equal(responseBody.agentExecution.progressCurrent, 3);
    assert.equal(responseBody.agentExecution.progressTotal, 5);
    assert.equal(responseBody.agentExecution.tokensUsed, 8200);
    assert.equal(responseBody.agentExecution.localTokensUsed, 8000);
    assert.equal(responseBody.agentExecution.maxTokens, 0);
    assert.equal(responseBody.agentExecution.maxWallClockMinutes, 0);
    assert.equal(responseBody.agentExecution.phase, 'researching');
    assert.equal(responseBody.agentExecution.checkpointBoundary, 'step_completed');
    assert.equal(responseBody.agentExecution.commandVersion, 4);
  });

  it('applies an approved subtask, releases its connector and exposes the next task', async () => {
    const data = project();
    data.name = 'Black Adam App';
    data.ideaBriefMarkdown = 'Converter música em partituras e novamente em música.';
    data.members = [{ userId: 'editor', role: 'partner' }];
    data.artifacts = [];
    data.promptRuns = [];
    data.agentJobs = [];
    const created = stageTransitions.createRequest(data, {
      fromStageId: 'idea',
      toStageId: 'discovery',
      direction: 'forward',
      config: { maxSubtasks: 8 },
      idempotencyKey: 'review-chain',
    }, { actorUserId: 'editor' });
    const children = workItems.getWorkItems(data)
      .filter((entry) => entry.agentRequestId === created.request.id && entry.taskRole !== 'coordination');
    assert.equal(created.request.agentId, 'discovery-research');
    assert.equal(created.preview.config.enableWebSearch, true);
    assert.deepEqual(children.map((entry) => entry.stableTaskKey), [
      'framing',
      'stakeholders',
      'market',
      'competitors',
      'business',
      'merge',
    ]);
    const first = children[0];
    const second = children[1];
    const rawOutput = JSON.stringify({
      transitionSummaryMarkdown: 'Visão e proposta de valor validadas.',
      fromStageId: 'idea',
      toStageId: 'discovery',
      direction: 'forward',
      artifacts: [{
        type: 'context',
        name: 'Visão aprovada',
        bodyMarkdown: '## Proposta de valor\nUma experiência musical bidirecional.',
        stageId: 'discovery',
      }],
      requirements: [],
    });
    const promptRunId = 'run_review_chain';
    const jobId = 'job_review_chain';
    const dispatchId = 'dispatch_review_chain';
    data.promptRuns = [{
      id: promptRunId,
      agentType: 'stage_transition',
      workItemId: first.id,
      agentRequestId: created.request.id,
      rawOutput,
      parsedOutput: JSON.parse(rawOutput),
      status: 'pending_review',
      createdAt: new Date().toISOString(),
    }];
    data.agentJobs = [{
      id: jobId,
      agentId: 'delivery-os-full',
      promptRunId,
      dispatchId,
      workItemId: first.id,
      agentRequestId: created.request.id,
      status: 'pending_human_review',
    }];
    workItems.setWorkItems(data, workItems.getWorkItems(data).map((entry) => (
      entry.id === first.id
        ? workItems.normalizeWorkItem({
          ...entry,
          status: 'waiting_review',
          agentStatus: 'pending_human_review',
          agentJobId: jobId,
          promptRunId,
          attempts: [{
            id: 'attempt_review_chain',
            number: 1,
            source: 'runtime',
            status: 'completed',
            agentJobId: jobId,
            promptRunId,
            rawOutput,
            resultSummaryMarkdown: 'Visão concluída.',
          }],
        }, { project: data })
        : entry
    )));
    created.request.status = 'waiting_review';

    const routes = new Map();
    const app = {};
    for (const method of ['get', 'post', 'patch', 'delete']) {
      app[method] = (path, ...handlers) => routes.set(`${method}:${path}`, handlers);
    }
    let dispatchStatus = 'waiting_review';
    const connectorStore = {
      findDispatch: (id) => id === dispatchId ? { id: dispatchId, status: dispatchStatus } : null,
      markReviewed: (id, action) => {
        assert.equal(id, dispatchId);
        assert.equal(action, 'approved');
        dispatchStatus = 'completed';
        return { id, status: dispatchStatus };
      },
    };
    const store = { projects: [data], users: [] };
    registerWorkItemRoutes(app, {
      authMiddleware: (req, res, next) => next(),
      requireProjectEditor: (req, res, next) => next(),
      ensureProjectLoadedLite: async () => data,
      canAccessProject: () => true,
      updateStore: async (mutate) => mutate(store),
      appendActivity: () => {},
      connectorStore,
      agentConnectionMode: 'remote_pull',
      runtime: null,
      ensureArray: (value) => Array.isArray(value) ? value : [],
      nowIso: () => new Date().toISOString(),
      normalizeRequirementRecord: (value) => value,
    });
    const handlers = routes.get('post:/api/projects/projects/:projectId/work-items/:workItemId/review');
    let responseBody = null;
    const req = {
      params: { projectId: data.id, workItemId: first.id },
      body: { action: 'approved' },
      auth: { user: { id: 'editor', role: 'partner' } },
    };
    const res = {
      status() { return this; },
      json(payload) { responseBody = payload; return payload; },
    };
    await runHandlers(handlers, req, res);

    assert.equal(workItems.findWorkItem(data, first.id).status, 'completed');
    assert.equal(workItems.findWorkItem(data, second.id).status, 'ready');
    assert.equal(data.agentRequests.find((entry) => entry.id === created.request.id).status, 'ready');
    assert.equal(data.agentJobs[0].status, 'completed');
    assert.equal(data.promptRuns[0].status, 'applied');
    assert.equal(dispatchStatus, 'completed');
    assert.equal(responseBody.connectorReleased, true);
    assert.equal(responseBody.nextWorkItem.id, second.id);
    assert.equal(data.artifacts[0].name, 'Visão aprovada');
    assert.equal(data.artifacts[0].provenance.taskId, first.id);
  });

  it('projects approved Black Adam framing output into the idea vision', async () => {
    const data = project();
    data.name = 'Black Adam App';
    data.ideaBriefMarkdown = 'Converter música em partituras e novamente em música.';
    data.members = [{ userId: 'editor', role: 'partner' }];
    data.artifacts = [];
    data.promptRuns = [];
    data.agentJobs = [];
    const created = stageTransitions.createRequest(data, {
      fromStageId: 'idea',
      toStageId: 'discovery',
      direction: 'forward',
      config: { maxSubtasks: 8 },
      idempotencyKey: 'review-vision',
    }, { actorUserId: 'editor' });
    const first = workItems.getWorkItems(data)
      .filter((entry) => entry.agentRequestId === created.request.id && entry.taskRole !== 'coordination')[0];
    const rawOutput = JSON.stringify({
      discovery: {
        researchBrief: {
          problemFramingMarkdown: 'Músicos amadores não conseguem transcrever melodias rapidamente.',
          hypotheses: ['Existe procura por apps de transcrição bidirecional'],
        },
      },
    });
    const promptRunId = 'run_review_vision';
    const jobId = 'job_review_vision';
    const dispatchId = 'dispatch_review_vision';
    data.promptRuns = [{
      id: promptRunId,
      agentType: 'stage_transition',
      workItemId: first.id,
      agentRequestId: created.request.id,
      rawOutput,
      status: 'pending_review',
      createdAt: new Date().toISOString(),
    }];
    data.agentJobs = [{
      id: jobId,
      agentId: 'delivery-os-full',
      promptRunId,
      dispatchId,
      workItemId: first.id,
      agentRequestId: created.request.id,
      status: 'pending_human_review',
    }];
    workItems.setWorkItems(data, workItems.getWorkItems(data).map((entry) => (
      entry.id === first.id
        ? workItems.normalizeWorkItem({
          ...entry,
          status: 'waiting_review',
          agentStatus: 'pending_human_review',
          agentJobId: jobId,
          promptRunId,
          attempts: [{
            id: 'attempt_review_vision',
            number: 1,
            source: 'runtime',
            status: 'completed',
            agentJobId: jobId,
            promptRunId,
            rawOutput,
            resultSummaryMarkdown: 'Enquadramento concluído.',
          }],
        }, { project: data })
        : entry
    )));

    const routes = new Map();
    const app = {};
    for (const method of ['get', 'post', 'patch', 'delete']) {
      app[method] = (path, ...handlers) => routes.set(`${method}:${path}`, handlers);
    }
    let dispatchStatus = 'waiting_review';
    const connectorStore = {
      findDispatch: (id) => id === dispatchId ? { id: dispatchId, status: dispatchStatus } : null,
      markReviewed: (id, action) => {
        dispatchStatus = 'completed';
        return { id, status: dispatchStatus };
      },
    };
    const store = { projects: [data], users: [] };
    registerWorkItemRoutes(app, {
      authMiddleware: (req, res, next) => next(),
      requireProjectEditor: (req, res, next) => next(),
      ensureProjectLoadedLite: async () => data,
      canAccessProject: () => true,
      updateStore: async (mutate) => mutate(store),
      appendActivity: () => {},
      connectorStore,
      agentConnectionMode: 'remote_pull',
      runtime: null,
      ensureArray: (value) => Array.isArray(value) ? value : [],
      nowIso: () => new Date().toISOString(),
      normalizeRequirementRecord: (value) => value,
    });
    const handlers = routes.get('post:/api/projects/projects/:projectId/work-items/:workItemId/review');
    await runHandlers(handlers, {
      params: { projectId: data.id, workItemId: first.id },
      body: { action: 'approved' },
      auth: { user: { id: 'editor', role: 'partner' } },
    }, { status() { return this; }, json() { return this; } });

    assert.match(data.vision?.problemMarkdown || '', /transcrever melodias/i);
    assert.equal(data.assumptions.includes('Existe procura por apps de transcrição bidirecional'), true);
    assert.match(data.discovery?.researchBrief?.problemFramingMarkdown || '', /transcrever melodias/i);
  });

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
    assert.deepEqual(
      filterAcceptedWorkItems(data).map((item) => item.id).sort(),
      data.workItems.map((item) => item.id).sort(),
    );
  });

  it('amends execution settings on the same plan without copying completed work', async () => {
    const data = project();
    data.members = [{ userId: 'editor', role: 'partner' }];
    const created = stageTransitions.createRequest(data, {
      fromStageId: 'requirements',
      toStageId: 'architecture',
      direction: 'forward',
      config: { modelProfileId: 'medium', maxSubtasks: 3 },
      idempotencyKey: 'settings-in-place',
    }, { actorUserId: 'editor' });
    const parent = workItems.findWorkItem(data, created.request.parentTaskId);
    const firstChild = workItems.getWorkItems(data)
      .find((entry) => entry.parentTaskId === parent.id && entry.taskRole !== 'coordination');
    workItems.setWorkItems(data, workItems.getWorkItems(data).map((entry) => (
      entry.id === firstChild.id
        ? workItems.normalizeWorkItem({ ...entry, status: 'completed' }, { project: data })
        : entry
    )));
    const completedSettingsVersion = workItems.findWorkItem(data, firstChild.id)
      .executionSettings.version;
    const requestCount = data.agentRequests.length;

    const routes = new Map();
    const app = {};
    for (const method of ['get', 'post', 'patch', 'delete']) {
      app[method] = (path, ...handlers) => routes.set(`${method}:${path}`, handlers);
    }
    const store = { projects: [data], users: [] };
    registerWorkItemRoutes(app, {
      authMiddleware: (req, res, next) => next(),
      requireProjectEditor: (req, res, next) => next(),
      ensureProjectLoadedLite: async () => data,
      canAccessProject: () => true,
      updateStore: async (mutate) => mutate(store),
      appendActivity: () => {},
      connectorStore: null,
      agentConnectionMode: 'remote_pull',
      runtime: null,
      ensureArray: (value) => Array.isArray(value) ? value : [],
      nowIso: () => new Date().toISOString(),
      normalizeRequirementRecord: (value) => value,
    });
    const handlers = routes.get(
      'post:/api/projects/projects/:projectId/work-items/:workItemId/execution-settings'
    );
    let responseBody = null;
    const req = {
      params: { projectId: data.id, workItemId: parent.id },
      body: {
        settings: {
          modelProfileId: 'long_context',
          planningWaveSize: 4,
          targetInputTokens: 32000,
        },
      },
      auth: { user: { id: 'editor', role: 'partner' } },
    };
    const res = {
      status() { return this; },
      json(payload) { responseBody = payload; return payload; },
    };
    await runHandlers(handlers, req, res);

    assert.equal(responseBody.amendedInPlace, true);
    assert.equal(responseBody.appliesTo, 'open_tree');
    assert.equal(data.agentRequests.length, requestCount);
    assert.equal(workItems.findWorkItem(data, parent.id).executionSettings.modelProfileId, 'long_context');
    assert.equal(
      workItems.findWorkItem(data, firstChild.id).executionSettings.version,
      completedSettingsVersion
    );
    assert.ok(
      workItems.getWorkItems(data)
        .filter((entry) => entry.parentTaskId === parent.id && entry.id !== firstChild.id)
        .every((entry) => entry.executionSettings.modelProfileId === 'long_context')
    );
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

  it('ignores orphaned transition metadata when no backing task exists', () => {
    const data = project();
    data.agentRequests = [{
      id: 'areq_orphan',
      requestKind: 'stage_transition',
      transitionKey: 'idea->discovery:forward',
      status: 'awaiting_approval',
      taskIds: ['missing-task'],
    }];
    const preview = stageTransitions.buildPreview(data, {
      fromStageId: 'idea',
      toStageId: 'discovery',
      direction: 'forward',
      config: { userRequest: 'Research the idea' },
    });
    assert.equal(preview.baselineRequest, null);
  });
});

describe('contextual task suggestions', () => {
  it('keeps explicit engineering change-set suggestions until a human decides them', () => {
    const project = {
      requirements: [], workItems: [], humanReviews: [], approvals: [], phases: [],
      taskSuggestions: [{
        id: 'tsug_eng', fingerprint: 'eng-fingerprint', ruleId: 'engineering_change_set',
        deliveryStageId: 'discovery', title: 'Validate intent', reason: 'Agent recommendation',
        proposedTask: { title: 'Validate intent' }, status: 'proposed',
      }],
    };
    taskSuggestions.evaluateProject(project, { now: '2026-07-21T00:00:00.000Z' });
    assert.equal(project.taskSuggestions[0].status, 'proposed');
  });
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

  it('does not let a cancelled task suppress a still-needed suggestion', () => {
    const project = {
      workItems: [task({
        id: 'cancelled-review',
        status: 'cancelled',
        sourceRefs: [{ type: 'review', id: 'review-1' }],
      })],
      humanReviews: [{ id: 'review-1', title: 'Review result', status: 'pending', stageId: 'discovery' }],
    };
    const suggestions = taskSuggestions.evaluateProject(project);
    assert.equal(suggestions.some((entry) => entry.ruleId === 'pending_human_review'), true);
  });
});

describe('orchestration projection', () => {
  const { buildOrchestrationProjection } = workItems;

  function parent(overrides = {}) {
    return workItems.normalizeWorkItem({
      id: 'coordination',
      title: 'Plan',
      origin: 'agent',
      executorMode: 'agent',
      taskRole: 'coordination',
      status: 'ready',
      ...overrides,
    });
  }

  function child(overrides = {}) {
    return workItems.normalizeWorkItem({
      id: 'child-1',
      title: 'Step',
      origin: 'agent',
      executorMode: 'agent',
      taskRole: 'execution',
      parentTaskId: 'coordination',
      status: 'ready',
      ...overrides,
    });
  }

  it('requests plan approval when the agent request is awaiting approval', () => {
    const projection = buildOrchestrationProjection(parent({ status: 'planned' }), {
      children: [child({ status: 'planned' })],
      agentRequest: { status: 'awaiting_approval' },
      runtimeReachable: true,
    });
    assert.equal(projection.availableAction, 'approve_plan');
    assert.match(projection.label, /aprovar plano/i);
  });

  it('offers connect_and_run for a ready coordination parent with ready children', () => {
    const projection = buildOrchestrationProjection(parent(), {
      children: [child()],
      runtimeReachable: true,
    });
    assert.equal(projection.availableAction, 'connect_and_run');
    assert.match(projection.label, /executar plano/i);
    assert.equal(projection.scope, 'tree');
  });

  it('opens execution when a run is active', () => {
    const projection = buildOrchestrationProjection(parent({ status: 'in_progress', agentJobId: 'job-1' }), {
      children: [child({ status: 'in_progress' })],
      agentExecution: { runId: 'job-1', status: 'running' },
      runtimeReachable: true,
    });
    assert.equal(projection.availableAction, 'open_execution');
    assert.equal(projection.currentRunId, 'job-1');
  });

  it('routes to review when children are waiting review', () => {
    const projection = buildOrchestrationProjection(parent({ status: 'waiting_review' }), {
      children: [child({ id: 'review-child', status: 'waiting_review' })],
      runtimeReachable: true,
    });
    assert.equal(projection.availableAction, 'review_results');
    assert.equal(projection.targetWorkItemId, 'review-child');
  });

  it('labels leaf continuous execution as full plan', () => {
    const projection = buildOrchestrationProjection(child({ parentTaskId: 'coordination' }), {
      children: [],
      runtimeReachable: true,
    });
    assert.equal(projection.availableAction, 'connect_and_run');
    assert.equal(projection.label, 'Executar plano completo');
    assert.equal(projection.scope, 'tree');
  });

  it('blocks when runtime is unavailable', () => {
    const projection = buildOrchestrationProjection(parent(), {
      children: [child()],
      runtimeReachable: false,
      runtimeBlockingReason: 'Offline',
    });
    assert.equal(projection.availableAction, 'none');
    assert.equal(projection.blockingReason, 'Offline');
  });
});

describe('idea page sync', () => {
  it('projects framing discovery into idea vision without overwriting filled fields', () => {
    const projectData = {
      vision: { problemMarkdown: 'Existing problem' },
      assumptions: [],
      ideaBriefMarkdown: 'Brief',
    };
    deliveryOs.projectVisionFromDiscoveryApproval(projectData, {
      stableTaskKey: 'framing',
      discoveryPatch: {
        researchBrief: {
          problemFramingMarkdown: 'New problem framing',
          hypotheses: ['Hypothesis A'],
        },
      },
    });
    assert.equal(projectData.vision.problemMarkdown, 'Existing problem');
    assert.equal(projectData.assumptions.includes('Hypothesis A'), true);
  });

  it('filters idea transition tasks by transitionFromStageId', () => {
    const requests = [{ id: 'req-idea', transitionKey: 'idea->discovery:forward' }];
    const items = [
      workItems.normalizeWorkItem(task({ id: 'child', agentRequestId: 'req-idea', deliveryStageId: 'discovery' })),
      workItems.normalizeWorkItem(task({ id: 'other', agentRequestId: 'req-other', deliveryStageId: 'idea' })),
    ];
    const filtered = workItems.filterByTransitionFromStage(items, 'idea', requests);
    assert.deepEqual(filtered.map((entry) => entry.id), ['child']);
    const relevant = workItems.relevantWorkItems(items, {
      transitionFromStageId: 'idea',
      agentRequests: requests,
      limit: 4,
    });
    assert.deepEqual(relevant.map((entry) => entry.id), ['child']);
  });

  it('promotes idea and discovery stage status when the transition request completes', () => {
    const projectData = {
      stages: [
        { id: 'idea', status: 'in_progress' },
        { id: 'discovery', status: 'not_started' },
      ],
    };
    promoteStageStatusOnTransitionComplete(projectData, {
      status: 'completed',
      transitionKey: 'idea->discovery:forward',
    });
    assert.equal(projectData.stages.find((stage) => stage.id === 'idea').status, 'completed');
    assert.equal(projectData.stages.find((stage) => stage.id === 'discovery').status, 'in_progress');
  });

  it('backfills idea vision from discovery dossier and artifact-only task outputs', () => {
    const projectData = {
      id: 'p_backfill',
      vision: {},
      assumptions: [],
      ideaBriefMarkdown: 'Converter música em partituras.',
      discovery: {
        researchBrief: {
          problemFramingMarkdown: 'Músicos amadores não conseguem transcrever melodias rapidamente.',
          hypotheses: ['Existe procura por transcrição bidirecional'],
        },
        marketSummaryMarkdown: 'O mercado de apps musicais continua a crescer.',
      },
      agentRequests: [{
        id: 'req-idea',
        transitionKey: 'idea->discovery:forward',
        status: 'completed',
      }],
      workItems: [],
      promptRuns: [],
    };
    const created = stageTransitions.createRequest(projectData, {
      fromStageId: 'idea',
      toStageId: 'discovery',
      direction: 'forward',
      config: { maxSubtasks: 8 },
      idempotencyKey: 'backfill-artifacts',
    }, { actorUserId: 'editor' });
    const first = workItems.getWorkItems(projectData)
      .find((entry) => entry.agentRequestId === created.request.id && entry.stableTaskKey === 'framing');
    const rawOutput = JSON.stringify({
      transitionSummaryMarkdown: 'Visão e proposta de valor validadas.',
      artifacts: [{
        type: 'context',
        name: 'Visão aprovada',
        bodyMarkdown: '## Proposta de valor\nUma experiência musical bidirecional.',
        stageId: 'discovery',
      }],
    });
    workItems.setWorkItems(projectData, workItems.getWorkItems(projectData).map((entry) => (
      entry.id === first.id
        ? workItems.normalizeWorkItem({
          ...entry,
          status: 'completed',
          attempts: [{ id: 'attempt-1', number: 1, source: 'runtime', status: 'completed', rawOutput }],
        }, { project: projectData })
        : entry
    )));

    assert.equal(deliveryOs.ensureIdeaVisionFromDiscovery(projectData), true);
    assert.match(projectData.vision.problemMarkdown, /transcrever melodias/i);
    assert.match(projectData.vision.valuePropositionMarkdown || '', /experiência musical bidirecional/i);
    assert.equal(projectData.assumptions.includes('Existe procura por transcrição bidirecional'), true);
  });
});
