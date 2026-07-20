const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('Idea page wires section actions after rendering the workspace', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'delivery-os-ui.js'),
    'utf8',
  );
  const ideaRenderBranches = [...source.matchAll(
    /else if \(stageId === 'idea'\) \{[\s\S]*?\} else if \(stageId === 'discovery'\)/g,
  )].map((match) => match[0]);
  const wiredBranch = ideaRenderBranches.find((branch) => branch.includes('wireIdeaStageEvents(project)')) || '';

  assert.match(wiredBranch, /hydrateIdeaStage\(project\)/);
  assert.match(wiredBranch, /wireIdeaStageEvents\(project\)/);
  assert.match(source, /data-idea-accept/);
  assert.match(source, /data-idea-edit/);
  assert.match(source, /data-idea-reject/);
});

test('Idea section actions use a stable delegated controller with visible feedback', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'delivery-os-ui.js'),
    'utf8',
  );
  const html = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'index.html'),
    'utf8',
  );

  assert.match(source, /function wireIdeaActionDelegation\(\)/);
  assert.match(source, /feed\.dataset\.ideaActionsWired = '1'/);
  assert.match(source, /feed\.addEventListener\('click'/);
  assert.match(source, /setIdeaSectionBusy\(sectionEl, 'A guardar aceitação…'\)/);
  assert.match(source, /openIdeaInlineEditor\(sectionEl, project, button\.dataset\.ideaEdit\)/);
  assert.match(source, /setIdeaSectionBusy\(sectionEl, 'A remover esta secção…'\)/);
  assert.match(source, /window\.applyProjectPatch\(updated/);
  assert.match(html, /styles\.css\?v=83/);
  assert.match(html, /delivery-os-ui\.js\?v=69/);
});

test('runtime monitoring is idempotent across Idea page re-renders', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'delivery-os-ui.js'),
    'utf8',
  );

  assert.match(source, /terminalRuntimeRuns: new Set\(\)/);
  assert.match(source, /pdosState\.activeRuntimeRun\?\.runId === runId[\s\S]*?pdosState\.activeRuntimeRun\.monitoring/);
  assert.match(source, /pdosState\.activeRuntimeRun === monitorState[\s\S]*?monitorState\.monitoring/);
  assert.match(source, /if \(!isCurrentMonitor\(\)\) return;[\s\S]*?updateAgentRuntimePanel\(status\)/);
  assert.match(source, /pdosState\.terminalRuntimeRuns\.add\(runId\)/);
  assert.match(source, /!pdosState\.terminalRuntimeRuns\.has\(runId\)/);
});
