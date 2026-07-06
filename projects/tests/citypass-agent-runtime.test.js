const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const executionPlans = require('../lib/execution-plans');
const { createAgentRuntimeClient } = require('../lib/agent-runtime-client');
const blobStore = require('../lib/blob-store');
const { createSqliteStore } = require('../lib/sqlite-store');

const CITYPASS_PROJECT_ID = 'prj_2b139f34-c3cd-4f6e-8794-da5f467a690a';
const CITYPASS_ARCH_PLAN_ID = 'plan_citypass_requirements_to_architecture';
const citypassProjectPath = path.resolve(
  __dirname,
  '../data/projects/prj_2b139f34-c3cd-4f6e-8794-da5f467a690a.json'
);
const dataDir = path.resolve(__dirname, '../data');

function readJsonSync(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function hydrateExecutionPlanSync(plan, projectId) {
  const filePath = blobStore.blobPath(dataDir, projectId, blobStore.KIND.EXEC_PLAN, plan.id);
  if (fs.existsSync(filePath)) {
    const body = readJsonSync(filePath);
    return {
      ...plan,
      masterPlanMarkdown: body.masterPlanMarkdown || plan.masterPlanMarkdown || '',
      tasks: Array.isArray(body.tasks) ? body.tasks : plan.tasks,
    };
  }
  if (!plan?.blobStored) return plan;
  return plan;
}

function loadCityPassProject() {
  if (!fs.existsSync(citypassProjectPath)) {
    return null;
  }
  const project = readJsonSync(citypassProjectPath);
  const sqliteStore = createSqliteStore({ dataDir });
  if (sqliteStore.isEnabled()) {
    try {
      project.requirements = sqliteStore.loadRequirements(project.id);
    } catch {
      project.requirements = project.requirements || [];
    }
    sqliteStore.close();
  }
  project.executionPlans = (project.executionPlans || []).map((plan) =>
    hydrateExecutionPlanSync(plan, project.id)
  );
  return project;
}

describe('CityPass agent runtime integration', () => {
  it('maps requirements_to_architecture to YAR agent id', () => {
    const client = createAgentRuntimeClient();
    assert.equal(client.mapPlatformType('requirements_to_architecture'), 'requirements-to-architecture');
    assert.equal(client.mapAgentId('requirements-to-architecture'), 'requirements_to_architecture');
  });

  it('builds plan_citypass_requirements_to_architecture with four deterministic architecture tasks', { skip: !loadCityPassProject() }, () => {
    const project = loadCityPassProject();
    const plan = project.executionPlans.find((p) => p.id === CITYPASS_ARCH_PLAN_ID);
    assert.ok(plan);
    assert.equal(plan.fromStageId, 'requirements');
    assert.equal(plan.toStageId, 'architecture');
    assert.deepEqual(plan.tasks.map((t) => t.id), ['context', 'modules', 'data_api', 'merge']);
    assert.ok(plan.tasks.every((t) => t.title));
  });

  it('produces YAR job payload from CityPass execution plan', { skip: !loadCityPassProject() }, () => {
    const project = loadCityPassProject();
    const plan = project.executionPlans.find((p) => p.id === CITYPASS_ARCH_PLAN_ID);
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
