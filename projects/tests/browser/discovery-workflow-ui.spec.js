const { test, expect } = require('@playwright/test');

test('Discovery empty state opens contextual transition modal', async ({ page }) => {
  await page.route('**/api/projects/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.endsWith('/work-items/stage-transitions/config')) {
      return route.fulfill({ json: { config: null } });
    }
    if (pathname.endsWith('/work-items/stage-transitions/preview')) {
      return route.fulfill({ json: { preview: { tasks: [], diffSummary: {}, baselineRequest: null } } });
    }
    if (pathname.endsWith('/requirements/hierarchy')) {
      return route.fulfill({ json: { stakeholderCount: 0, stats: { orphans: 0, coveragePct: 0 } } });
    }
    return route.fulfill({ json: {} });
  });

  await page.goto('/projects');
  await page.waitForFunction(() => Boolean(window.PdosUI));
  await page.evaluate(() => {
    window.state = {
      ...(window.state || {}),
      deliverySelectedStageId: 'discovery',
      config: {
        ...((window.state || {}).config || {}),
        stageOrder: ['idea', 'discovery', 'requirements', 'architecture', 'roadmap', 'implementation', 'validation', 'delivery', 'operations'],
      },
    };
    window.canEditProject = () => true;
    document.getElementById('workspace')?.classList.remove('hidden');
    document.querySelector('[data-panel="deliveryos"]')?.classList.remove('hidden');
    document.getElementById('deliveryOsLayout')?.classList.remove('hidden');
    window.PdosUI.renderPdosShell({
      id: 'prj-discovery-browser', name: 'Discovery browser project', originalIdeaText: 'An explicit initial idea.',
      vision: { mainIdeaMarkdown: 'Current understanding', acceptedSections: [] },
      discovery: {},
      stages: [{ id: 'idea', label: 'Idea', status: 'in_progress' }, { id: 'discovery', label: 'Discovery', status: 'not_started' }],
      workItems: [], humanReviews: [], requirements: [], capabilities: [], clarificationQuestions: [],
      assumptions: [], risks: [], documents: [], informationEntries: [], meetingMinutes: [], artifacts: [],
      diagramArtifacts: [], traceLinks: [], agentJobs: [], executionPlans: [], promptRuns: [],
    });
  });

  const feed = page.locator('#pdosCardFeed');
  await expect(feed.locator('.idea-discovery-callout')).toContainText('expansão da ideia');
  await feed.locator('[data-agent="discovery_research"]').click();
  await expect(page.locator('#pdosTransitionModal')).toBeVisible();
  await expect(page.locator('#pdosTransitionDesc')).toContainText('6 subtarefas');
  await expect(page.locator('#pdosTransitionDesc')).toContainText('Criar plano Idea → Discovery');
});
