const { test, expect } = require('@playwright/test');

test('parent orchestration uses prepare flow and preserves agent log scroll', async ({ page }) => {
  let prepareCalls = 0;
  const projectId = 'prj-orch';
  const parentId = 'witem-parent';
  const orchestration = {
    availableAction: 'connect_and_run',
    label: 'Conectar agente e executar plano',
    blockingReason: '',
    targetWorkItemId: parentId,
    currentRunId: '',
    respectsPauseForSubtaskReview: false,
    statusChip: { label: 'Pronta', tone: 'ready' },
    scope: 'tree',
  };
  const parentTask = {
    id: parentId,
    title: 'Plano de implementação',
    descriptionMarkdown: 'Coordenação',
    taskRole: 'coordination',
    executorMode: 'agent',
    origin: 'agent',
    status: 'ready',
    agentStatus: '',
    childTaskCount: 2,
    executionSettings: {},
  };

  await page.route('**/api/projects/**', async (route) => {
    const url = new URL(route.request().url());
    const { pathname } = url;
    const method = route.request().method();
    if (pathname.endsWith(`/projects/${projectId}/work-items`) && method === 'GET') {
      return route.fulfill({ json: { workItems: [parentTask], canManage: true } });
    }
    if (pathname.endsWith(`/projects/${projectId}/work-items/meta`) && method === 'GET') {
      return route.fulfill({ json: { meta: { total: 1 } } });
    }
    if (pathname.endsWith(`/projects/${projectId}/work-items/agent-requests`) && method === 'GET') {
      return route.fulfill({ json: { agentRequests: [] } });
    }
    if (pathname.endsWith(`/projects/${projectId}/work-items/${parentId}`) && method === 'GET') {
      return route.fulfill({
        json: {
          workItem: parentTask,
          children: [],
          orchestration,
          canManage: true,
          canPostUpdate: true,
          canEditUpdate: true,
        },
      });
    }
    if (pathname.endsWith(`/projects/${projectId}/work-items/${parentId}/agent-connection/prepare`)) {
      prepareCalls += 1;
      return route.fulfill({
        json: {
          selectedAgentId: 'agent-1',
          agents: [{ id: 'agent-1', name: 'Runtime Agent', compatible: true }],
          settings: { modelProfileId: 'medium' },
          contextSummary: 'Pronto para executar o plano completo.',
          scope: 'tree',
          orchestration,
          requiredSkills: [],
          requiredMcpTools: [],
        },
      });
    }
    if (pathname.endsWith('/agent-runs/health')) {
      return route.fulfill({ json: { runtimeReachable: true, mode: 'local_push' } });
    }
    return route.fulfill({ json: {} });
  });

  await page.goto('/projects');
  await page.waitForFunction(() => Boolean(window.WorkItemsUI));
  await page.evaluate(({ projectId: pid, parentId: tid, parentTask: task }) => {
    window.state = {
      ...(window.state || {}),
      token: 'browser-token',
      config: {
        ...((window.state || {}).config || {}),
        agentRuntime: { enabled: true, mode: 'local_push' },
        deliveryStageFlow: [{ id: 'implementation', label: 'Implementação' }],
      },
      selectedProject: { id: pid, name: 'Orquestração', workItems: [task], members: [], phases: [] },
    };
    window.canEditProject = () => true;
    document.getElementById('workspace')?.classList.remove('hidden');
    document.querySelector('[data-panel="tarefas"]')?.classList.remove('hidden');
    document.getElementById('workItemsRoot')?.classList.remove('hidden');
  }, { projectId, parentId, parentTask });

  await page.evaluate(async ({ parentId: tid }) => {
    await window.WorkItemsUI.open(window.state.selectedProject);
    await window.WorkItemsUI.openTask(window.state.selectedProject, tid);
  }, { parentId });

  const orchestrationBtn = page.locator('[data-ado-orchestration="connect_and_run"]');
  await expect(orchestrationBtn).toBeVisible();
  await expect(orchestrationBtn).toHaveText('Conectar agente e executar plano');
  await orchestrationBtn.click();
  await expect.poll(() => prepareCalls).toBe(1);
  await expect(page.locator('[data-ado-send-agent]')).toHaveText('Executar plano completo');

  await page.evaluate(() => {
    window.WorkItemsUI.__testApplyExecution({
      runId: 'run-orch',
      status: 'running',
      events: Array.from({ length: 12 }, (_, index) => ({
        id: index + 1,
        type: 'log',
        message: `Evento ${index + 1}`,
        timestamp: new Date().toISOString(),
      })),
      updatedAt: new Date().toISOString(),
    });
  });

  const logList = page.locator('.ado-agent-log-list');
  await expect(logList).toBeVisible();
  await logList.evaluate((element) => {
    element.scrollTop = 40;
  });
  const scrollBefore = await logList.evaluate((element) => element.scrollTop);

  await page.evaluate(() => {
    window.WorkItemsUI.__testApplyExecution({
      runId: 'run-orch',
      status: 'running',
      events: Array.from({ length: 14 }, (_, index) => ({
        id: index + 1,
        type: 'log',
        message: `Evento ${index + 1}`,
        timestamp: new Date().toISOString(),
      })),
      updatedAt: new Date().toISOString(),
    });
  });

  await expect.poll(async () => logList.evaluate((element) => element.scrollTop)).toBe(scrollBefore);
});
