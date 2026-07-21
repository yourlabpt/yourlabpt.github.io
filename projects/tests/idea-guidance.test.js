const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const deliveryOs = require('../lib/delivery-os');

test('Idea page exposes augment and Discovery workflow without legacy prompt controls', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'delivery-os-ui.js'),
    'utf8',
  );
  const apiSource = fs.readFileSync(path.join(__dirname, '..', 'api.js'), 'utf8');
  const ideaUi = source.slice(
    source.indexOf('function renderIdeaStage'),
    source.indexOf('function renderDiscoveryStage'),
  );
  assert.match(ideaUi, /data-idea-augment/);
  assert.match(ideaUi, /Expandir ideia com IA/);
  assert.match(ideaUi, /work-items\/idea-augment\/requests/);
  assert.match(ideaUi, /data-idea-open-discovery/);
  assert.match(ideaUi, /openTransitionPicker\('idea', 'discovery', project\)/);
  assert.match(ideaUi, /Criar plano Idea → Discovery/);
  assert.doesNotMatch(ideaUi, /data-agent="reverse_idea"/);
  assert.doesNotMatch(ideaUi, /data-idea-manual/);
  assert.doesNotMatch(ideaUi, /Prompt gerado — modo manual/);
  assert.doesNotMatch(ideaUi, /use o prompt manual abaixo/);
  assert.match(apiSource, /idea-guidance[\s\S]{0,500}status\(410\)/);
  assert.equal(deliveryOs.buildIdeaGuidancePrompt, undefined);
});

test('idea section acceptance survives vision normalization and ignores unknown fields', () => {
  const vision = deliveryOs.normalizeVision({
    mainIdeaMarkdown: 'Uma ideia validada.',
    acceptedSections: ['mainIdeaMarkdown', 'targetUsers', 'unknownField', 'mainIdeaMarkdown'],
  });
  assert.deepEqual(vision.acceptedSections, ['mainIdeaMarkdown', 'targetUsers']);
});
