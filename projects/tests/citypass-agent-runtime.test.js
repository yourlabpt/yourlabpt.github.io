const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const executionPlans = require('../lib/execution-plans');
const { createAgentRuntimeClient } = require('../lib/agent-runtime-client');

const CITYPASS_PROJECT_ID = 'prj_2b139f34-c3cd-4f6e-8794-da5f467a690a';
const citypassProjectPath = path.resolve(
  __dirname,
  '../data/projects/prj_2b139f34-c3cd-4f6e-8794-da5f467a690a.json'
);

function loadCityPassProject() {
  if (!fs.existsSync(citypassProjectPath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(citypassProjectPath, 'utf8'));
}

describe('CityPass agent runtime integration', () => {
  it('maps requirements_to_architecture to YAR agent id', () => {
    const client = createAgentRuntimeClient();
    assert.equal(client.mapPlatformType('requirements_to_architecture'), 'requirements-to-architecture');
    assert.equal(client.mapAgentId('requirements-to-architecture'), 'requirements_to_architecture');
  });

  it('builds plan_f73481b2 with four deterministic architecture tasks', { skip: !loadCityPassProject() }, () => {
    const project = loadCityPassProject();
    const plan = project.executionPlans.find((p) => p.id === 'plan_f73481b2');
    assert.ok(plan);
    assert.equal(plan.fromStageId, 'requirements');
    assert.equal(plan.toStageId, 'architecture');
    assert.deepEqual(plan.tasks.map((t) => t.id), ['context', 'modules', 'data_api', 'merge']);
    assert.ok(plan.tasks.every((t) => t.verificationPrompt));
  });

  it('produces YAR job payload from CityPass execution plan', { skip: !loadCityPassProject() }, () => {
    const project = loadCityPassProject();
    const plan = project.executionPlans.find((p) => p.id === 'plan_f73481b2');
    const runtimeTasks = plan.tasks.map((task) => ({
      title: task.title,
      instruction: task.instruction.slice(0, 500),
      diagramType: task.diagramType || undefined,
    }));

    const yarPayload = {
      agentId: 'requirements-to-architecture',
      projectId: CITYPASS_PROJECT_ID,
      budget: {
        maxTokens: 150000,
        maxWallClockMinutes: 60,
        maxSubtasks: 10,
      },
      options: {
        stageId: 'architecture',
        taskPlan: { runtimeTasks, planId: plan.id },
        goals: (project.summary?.goals || []).slice(0, 5),
        enableWebSearch: false,
      },
    };

    assert.equal(yarPayload.projectId, CITYPASS_PROJECT_ID);
    assert.equal(yarPayload.options.taskPlan.runtimeTasks.length, 4);
    assert.ok(yarPayload.options.goals.length >= 1);
  });

  it('rebuilds execution plan deterministically for requirements→architecture', () => {
    const project = loadCityPassProject() || {
      id: CITYPASS_PROJECT_ID,
      name: 'City Pass',
      requirements: [{ id: 'STK-12', type: 'stakeholder', title: 'Buy plan', moduleTags: ['Backend'] }],
      capabilities: [],
      requirementClusters: [],
      artifacts: [],
      traceLinks: [],
      stages: [],
      executionPlans: [],
      promptRuns: [],
      humanReviews: [],
    };

    const built = executionPlans.buildExecutionPlan('stage_transition', project, {
      fromStageId: 'requirements',
      toStageId: 'architecture',
      direction: 'forward',
      modelProfileId: 'large',
    });

    assert.deepEqual(built.tasks.map((t) => t.id), ['context', 'modules', 'data_api', 'merge']);
    assert.equal(built.fromStageId, 'requirements');
    assert.equal(built.toStageId, 'architecture');
  });
});
