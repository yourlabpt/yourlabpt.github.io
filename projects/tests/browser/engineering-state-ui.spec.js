const { test, expect } = require('@playwright/test');

test('feature-gated engineering review remains stable and applies through explicit controls', async ({ page }) => {
  let decision = 'pending';
  let status = 'proposed';
  let reviewCalls = 0;
  let applyCalls = 0;
  const changeSet = () => ({
    schemaVersion: 'engineering-change-set/v1', id: 'engcs-browser', projectId: 'prj-browser',
    taskId: 'witem-browser', runId: 'run-browser', baseEngineeringRevision: 0,
    summary: 'Structure the product intent',
    sections: [{ id: 'context', title: 'Problem and intent', decision, operations: [{ id: 'op-1', type: 'create_entity' }] }],
    documentsToRegenerate: [], inconsistenciesFound: [], assumptionsMade: [], questionsForHuman: [],
    impactAssessment: { level: 'local', affectedEntityIds: [], affectedDocumentIds: [], requiredChecks: [], rationale: '' },
    evidence: [], recommendedTasks: [{ id: 'suggestion-1', title: 'Validate the problem' }],
    confidence: 0.92, requiresHumanApproval: true, status,
  });

  await page.route('**/api/projects/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/engineering/graph')) {
      return route.fulfill({ json: { featureEnabled: true, schemaVersion: 1, revision: status === 'applied' ? 1 : 0, entities: [{ id: 'problem-1', type: 'problem', title: 'Opaque progress', version: 1, attributes: {}, virtual: false }], relationships: [], externalReferences: [] } });
    }
    if (url.pathname.endsWith('/engineering/change-sets') && route.request().method() === 'GET') {
      return route.fulfill({ json: { featureEnabled: true, changeSets: [changeSet()] } });
    }
    if (url.pathname.endsWith('/review')) {
      reviewCalls += 1;
      decision = route.request().postDataJSON().sections[0].decision;
      status = 'reviewed';
      return route.fulfill({ json: { changeSet: changeSet() } });
    }
    if (url.pathname.endsWith('/apply')) {
      applyCalls += 1;
      status = 'applied';
      return route.fulfill({ json: { revision: 1, changeSet: changeSet() } });
    }
    if (url.pathname.endsWith('/engineering/diagnostics')) {
      return route.fulfill({ json: { healthy: true, danglingRelationships: [], duplicateFingerprints: [] } });
    }
    return route.fulfill({ json: {} });
  });

  await page.goto('/projects');
  await page.waitForFunction(() => Boolean(window.EngineeringStateUI));
  await page.evaluate(() => {
    document.getElementById('workspace')?.classList.remove('hidden');
    document.getElementById('engineeringStatePanel')?.closest('.tab-panel')?.classList.remove('hidden');
  });
  const disabledProject = { id: 'prj-browser', deliveryLevel: 'standard', featureFlags: { engineering_state_v1: false } };
  await page.evaluate((project) => window.EngineeringStateUI.render(project), disabledProject);
  await expect(page.locator('#engineeringStatePanel')).toBeHidden();

  const enabledProject = { ...disabledProject, featureFlags: { engineering_state_v1: true } };
  await page.evaluate((project) => {
    window.EngineeringStateUI.render(project);
    document.getElementById('engineeringStatePanel').open = true;
  }, enabledProject);
  await expect(page.locator('#engineeringStatePanel')).toBeVisible();
  await expect(page.locator('#engineeringStateSummary')).toContainText('1 entidades');
  await expect(page.locator('[data-change-set-id="engcs-browser"]')).toContainText('Structure the product intent');
  await expect(page.locator('[data-change-set-id="engcs-browser"]')).toContainText('não entram em Tasks');

  const stableSummary = await page.locator('#engineeringStateSummary').textContent();
  await page.waitForTimeout(400);
  await expect(page.locator('#engineeringStateSummary')).toHaveText(stableSummary);

  await page.locator('[data-engineering-decision="approved"]').click();
  await expect.poll(() => reviewCalls).toBe(1);
  await expect(page.locator('[data-section-id="context"]')).toContainText('Aprovada');
  await page.locator('[data-engineering-apply]').click();
  await expect.poll(() => applyCalls).toBe(1);
  await expect(page.locator('[data-change-set-id="engcs-browser"]')).toContainText('applied');
  await expect(page.locator('[data-engineering-apply]')).toHaveCount(0);

  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  const panelColor = await page.locator('#engineeringStatePanel').evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(panelColor).not.toBe('rgba(0, 0, 0, 0)');
});
