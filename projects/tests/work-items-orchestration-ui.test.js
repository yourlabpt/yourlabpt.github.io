const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('work items orchestration UI uses server-driven control and scroll preservation', () => {
  const workItemsSource = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'work-items-ui.js'),
    'utf8',
  );
  const agentsSource = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'agents-admin-ui.js'),
    'utf8',
  );
  const html = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'index.html'),
    'utf8',
  );

  assert.match(workItemsSource, /data-ado-orchestration/);
  assert.match(workItemsSource, /renderOrchestrationBar/);
  assert.match(workItemsSource, /prepareAgentConnection/);
  assert.match(workItemsSource, /handleOrchestrationAction/);
  assert.match(workItemsSource, /respectsPauseForSubtaskReview/);
  assert.match(workItemsSource, /stickToBottom/);
  assert.match(workItemsSource, /priorScrollTop/);
  assert.doesNotMatch(workItemsSource, /data-ado-continue-plan/);
  assert.doesNotMatch(workItemsSource, /Executar plano até ao fim/);
  assert.match(workItemsSource, /data-ado-goto-agents/);
  assert.match(workItemsSource, /Mais ações do plano/);
  assert.match(agentsSource, /agent-platform\/settings/);
  assert.match(agentsSource, /agent-runs\/recent/);
  assert.match(html, /data-panel="agentes"/);
  assert.match(html, /agents-admin-ui\.js\?v=1/);
});
