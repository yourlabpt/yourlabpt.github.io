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
