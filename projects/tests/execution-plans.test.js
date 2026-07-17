const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const executionPlans = require('../lib/execution-plans');
const projectAudit = require('../lib/project-audit');
const deliveryOs = require('../lib/delivery-os');

function projectFixture() {
  return {
    id: 'prj_exec_test',
    name: 'Execution Plan Test',
    requirements: [
      { id: 'STK-01', type: 'stakeholder', title: 'Need', moduleTags: ['Frontend'] },
      { id: 'FR-01', type: 'functional', title: 'Feature', parentId: 'STK-01', moduleTags: ['Frontend'] },
    ],
    capabilities: [{ id: 'cap_a', name: 'Capability A' }],
    requirementClusters: [],
    artifacts: [],
    traceLinks: [],
    stages: [],
    executionPlans: [],
    promptRuns: [],
    humanReviews: [],
  };
}

describe('execution plan model profiles', () => {
  it('creates deterministic task ids and metadata for the same transition', () => {
    const project = projectFixture();
    const a = executionPlans.buildExecutionPlan('stage_transition', project, {
      fromStageId: 'requirements',
      toStageId: 'architecture',
      direction: 'forward',
      modelProfileId: 'medium',
    });
    const b = executionPlans.buildExecutionPlan('stage_transition', project, {
      fromStageId: 'requirements',
      toStageId: 'architecture',
      direction: 'forward',
      modelProfileId: 'medium',
    });

    assert.deepEqual(a.tasks.map((t) => t.id), b.tasks.map((t) => t.id));
    assert.equal(a.modelProfileId, 'medium');
    assert.ok(a.tasks.every((t) => t.verificationPrompt));
    assert.ok(a.tasks.every((t) => t.regressionGuardPrompt));
  });

  it('keeps semantic tasks instead of replacing work with a planner placeholder', () => {
    const plan = executionPlans.buildExecutionPlan('stage_transition', projectFixture(), {
      fromStageId: 'requirements',
      toStageId: 'architecture',
      direction: 'forward',
      targetInputTokens: 1,
      targetOutputTokens: 500,
    });

    assert.equal(plan.splitStrategy, 'deterministic');
    assert.ok(plan.tasks.length >= 2);
    assert.equal(plan.tasks.some((task) => task.id === 'plan_breakdown'), false);
    assert.match(plan.masterPlanMarkdown, /configuração deve ser revista/);
  });

  it('builds prompt packs with task, verification and rollback sections', () => {
    const plan = executionPlans.buildExecutionPlan('reverse_idea', projectFixture(), {
      modelProfileId: 'small',
    });
    const markdown = executionPlans.buildPromptPackMarkdown(plan, projectFixture());

    assert.match(markdown, /# Prompt Pack/);
    assert.match(markdown, /### Verification prompt/);
    assert.match(markdown, /Rollback:/);
  });

  it('carries compact verified dependency outputs into later prompts', () => {
    const plan = executionPlans.normalizeExecutionPlan({
      agentType: 'implementation_tasks',
      tasks: [
        { id: 'a', title: 'A', status: 'done', parsedOutput: { decisions: ['keep-id'] } },
        { id: 'b', title: 'B', dependsOn: ['a'] },
      ],
      config: {},
    });
    const prompt = executionPlans.buildTaskPrompt(plan, plan.tasks[1], projectFixture());

    assert.match(prompt, /Previous verified task outputs/);
    assert.match(prompt, /keep-id/);
  });
});

describe('project audit snapshots', () => {
  it('captures immutable snapshot data for later rollback', () => {
    const project = projectFixture();
    project.executionPlans = [{ id: 'plan_a', tasks: [{ id: 'task_a', status: 'planned' }] }];
    const snap = deliveryOs.createProjectSnapshot(project, 'Before task', 'usr_test', 'requirements');

    project.executionPlans[0].tasks[0].status = 'done';

    assert.equal(snap.snapshotData.executionPlans[0].tasks[0].status, 'planned');
  });

  it('restores execution plan and prompt run state from snapshot data', () => {
    const project = projectFixture();
    project.executionPlans = [{ id: 'plan_a', tasks: [{ id: 'task_a', status: 'planned' }] }];
    project.promptRuns = [{ id: 'run_a', status: 'awaiting_output' }];
    const snap = {
      snapshotData: {
        executionPlans: project.executionPlans,
        promptRuns: project.promptRuns,
      },
    };

    project.executionPlans = [{ id: 'plan_b', tasks: [{ id: 'task_b', status: 'done' }] }];
    project.promptRuns = [{ id: 'run_b', status: 'applied' }];

    projectAudit.restoreProjectFromSnapshot(project, snap.snapshotData);

    assert.equal(project.executionPlans[0].id, 'plan_a');
    assert.equal(project.promptRuns[0].id, 'run_a');
  });
});
