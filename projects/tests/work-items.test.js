const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const workItems = require('../lib/work-items');
const workItemsSync = require('../lib/work-items-sync');
const projectAccess = require('../lib/project-access');

describe('work items model', () => {
  it('rejects create without required fields', () => {
    assert.throws(
      () => workItems.validateWorkItemForCreate({ title: 'A' }),
      /descriptionMarkdown|complexity/,
    );
  });

  it('normalizes status aliases', () => {
    const item = workItems.normalizeWorkItem({
      id: 'witem_1',
      title: 'Test',
      descriptionMarkdown: 'Body',
      complexity: 'low',
      status: 'todo',
    });
    assert.equal(item.status, 'new');
  });

  it('slim card omits description and result', () => {
    const item = workItems.normalizeWorkItem({
      id: 'witem_1',
      title: 'Test',
      descriptionMarkdown: 'Long body',
      complexity: 'medium',
      resultSummaryMarkdown: 'Done',
      linkedRequirementIds: ['FR-01', 'FR-02'],
    });
    const slim = workItems.toSlimCard(item);
    assert.equal(slim.title, 'Test');
    assert.equal(slim.linkedRequirementCount, 2);
    assert.equal(slim.descriptionMarkdown, undefined);
    assert.equal(slim.resultSummaryMarkdown, undefined);
  });

  it('computes meta counts by origin', () => {
    const counts = workItems.computeMetaCounts([
      { origin: 'human' },
      { origin: 'human' },
      { origin: 'agent' },
    ]);
    assert.deepEqual(counts, { total: 3, human: 2, agent: 1 });
  });

  it('normalizes acceptance criteria and updates', () => {
    const item = workItems.normalizeWorkItem({
      id: 'witem_2',
      title: 'Task',
      descriptionMarkdown: 'Body',
      acceptanceCriteriaMarkdown: 'Done when tested',
      complexity: 'low',
      updates: [{ bodyMarkdown: 'Started work', createdBy: 'usr_1' }],
    });
    assert.equal(item.acceptanceCriteriaMarkdown, 'Done when tested');
    assert.equal(item.updates.length, 1);
    assert.equal(item.updates[0].bodyMarkdown, 'Started work');
  });

  it('adds and patches work item updates', () => {
    const item = workItems.normalizeWorkItem({
      id: 'witem_3',
      title: 'Task',
      descriptionMarkdown: 'Body',
      complexity: 'low',
    });
    const withUpdate = workItems.addWorkItemUpdate(item, 'First update', { actorUserId: 'usr_1' });
    assert.equal(withUpdate.updates.length, 1);
    const updateId = withUpdate.updates[0].id;
    const patched = workItems.patchWorkItemUpdate(withUpdate, updateId, 'Edited update', { actorUserId: 'usr_2' });
    assert.equal(patched.updates[0].bodyMarkdown, 'Edited update');
    assert.equal(patched.updates[0].updatedBy, 'usr_2');
  });
});

describe('work items access', () => {
  const project = {
    id: 'prj_1',
    members: [
      { userId: 'usr_partner', role: 'partner' },
      { userId: 'usr_client', role: 'client' },
    ],
  };
  const items = [
    { id: '1', origin: 'human', assigneeUserId: 'usr_client' },
    { id: '2', origin: 'agent', assigneeUserId: '' },
    { id: '3', origin: 'human', assigneeUserId: 'usr_partner' },
  ];

  it('editors see all items including agent', () => {
    const user = { id: 'usr_admin', role: 'super_admin' };
    const visible = projectAccess.filterWorkItemsForViewer(items, user, project);
    assert.equal(visible.length, 3);
    assert.equal(projectAccess.canViewWorkItemsTab(user, project, items), true);
  });

  it('assignee sees only their human items', () => {
    const user = { id: 'usr_client', role: 'client' };
    const visible = projectAccess.filterWorkItemsForViewer(items, user, project);
    assert.deepEqual(visible.map((item) => item.id), ['1']);
    assert.equal(projectAccess.canViewWorkItemsTab(user, project, items), true);
  });

  it('member without assignments cannot see tab', () => {
    const user = { id: 'usr_other', role: 'client' };
    assert.equal(projectAccess.canViewWorkItemsTab(user, project, items), false);
    assert.equal(projectAccess.filterWorkItemsForViewer(items, user, project).length, 0);
  });

  it('assignee can post updates but not edit old ones', () => {
    const user = { id: 'usr_client', role: 'client' };
    const item = items[0];
    assert.equal(projectAccess.canPostWorkItemUpdate(user, project, item), true);
    assert.equal(projectAccess.canEditWorkItemUpdate(user, project), false);
  });
});

describe('work items sync adapter', () => {
  it('syncs execution plan tasks idempotently', () => {
    const project = {
      id: 'prj_sync',
      workItems: [],
      requirements: [{ id: 'FR-01' }],
    };
    const plan = {
      id: 'plan_1',
      agentType: 'requirements_to_architecture',
      toStageId: 'architecture',
      tasks: [
        { id: 'context', title: 'Context diagram', role: 'diagram', estimatedInputTokens: 8000 },
        { id: 'merge', title: 'Merge', role: 'merge', estimatedInputTokens: 15000 },
      ],
    };

    const first = workItemsSync.syncWorkItemsFromExecutionPlan(project, plan);
    assert.equal(first.synced, 2);
    assert.equal(project.workItems.length, 2);
    assert.equal(project.workItems[0].origin, 'agent');

    const second = workItemsSync.syncWorkItemsFromExecutionPlan(project, plan);
    assert.equal(second.synced, 2);
    assert.equal(project.workItems.length, 2);
  });

  it('does not auto-sync agent runtime when env flag is off', () => {
    const prev = process.env.WORK_ITEMS_AUTO_SYNC;
    delete process.env.WORK_ITEMS_AUTO_SYNC;
    assert.equal(workItemsSync.isAutoSyncEnabled(), false);

    const project = {
      id: 'prj_rt',
      workItems: [{
        id: 'witem_1',
        origin: 'agent',
        title: 'Run',
        descriptionMarkdown: 'x',
        complexity: 'low',
        agentJobId: '',
        externalRefs: [{ source: 'execution_plan', planId: 'plan_1', taskId: 'context' }],
      }],
    };

    const result = workItemsSync.onAgentRunComplete(project, {
      agentJobId: 'job_1',
      resultSummaryMarkdown: 'summary',
    });
    assert.equal(result, null);
    if (prev !== undefined) process.env.WORK_ITEMS_AUTO_SYNC = prev;
  });

  it('completes agent work item when auto sync enabled', () => {
    const prev = process.env.WORK_ITEMS_AUTO_SYNC;
    process.env.WORK_ITEMS_AUTO_SYNC = '1';

    const project = {
      id: 'prj_rt2',
      workItems: [{
        id: 'witem_1',
        origin: 'agent',
        title: 'Run',
        descriptionMarkdown: 'x',
        complexity: 'low',
        status: 'active',
        agentJobId: 'job_1',
        agentStatus: 'running',
      }],
    };

    const result = workItemsSync.onAgentRunComplete(project, {
      agentJobId: 'job_1',
      resultSummaryMarkdown: 'Finished successfully',
    });
    assert.equal(result.status, 'closed');
    assert.equal(result.agentStatus, 'completed');
    assert.match(result.resultSummaryMarkdown, /Finished/);

    if (prev === undefined) delete process.env.WORK_ITEMS_AUTO_SYNC;
    else process.env.WORK_ITEMS_AUTO_SYNC = prev;
  });
});
