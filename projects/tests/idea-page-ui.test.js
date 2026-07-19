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
